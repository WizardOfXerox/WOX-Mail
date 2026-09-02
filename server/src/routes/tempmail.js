import { Router } from 'express';
import { query } from '../config/database.js';
import { claimAddress } from '../services/pool.js';
import { createUser, deleteUser } from '../services/purelymail.js';
import { createConnection, fetchMessages, fetchMessage, getInboxMessageCount } from '../services/imap.js';
import { createTransporter, sendEmail } from '../services/smtp.js';
import { simpleParser } from 'mailparser';
import { sanitizeEmail } from '../services/emailSanitizer.js';
import { hashPassword, verifyPassword, generateToken } from '../utils/crypto.js';
import { validateUsername } from '../utils/validators.js';
import { parsePagination, paginationMeta, isPurelymailWelcomeEmail } from '../utils/helpers.js';
import { verifyCaptcha } from '../middleware/captcha.js';
import { requireTempAuth } from '../middleware/tempAuth.js';
import { tempGenerateLimiter } from '../middleware/rateLimit.js';
import { validate } from '../middleware/validate.js';
import { TEMP_COOKIE_NAME, TIERS } from '../config/constants.js';
import * as linkPreviewService from '../services/linkPreviewService.js';
import QRCode from 'qrcode';
import pino from 'pino';

const logger = pino({ name: 'woxmail:tempmail' });
const router = Router();

// ─── Temp Mail IMAP Connection Cache ────────────────────
const tempConnectionCache = new Map(); // address -> { client, lastUsed }
const TEMP_CONN_TTL = 90000; // 90 seconds

async function getTempIMAPConnection(address, password) {
  const cached = tempConnectionCache.get(address);
  if (cached && cached.client && cached.client.usable) {
    cached.lastUsed = Date.now();
    return cached.client;
  }

  const client = await createConnection(address, password);
  tempConnectionCache.set(address, { client, lastUsed: Date.now() });

  client.on('close', () => tempConnectionCache.delete(address));
  client.on('error', () => tempConnectionCache.delete(address));

  return client;
}

// Cleanup stale temp IMAP connections
setInterval(() => {
  const now = Date.now();
  for (const [address, conn] of tempConnectionCache) {
    if (now - conn.lastUsed > TEMP_CONN_TTL) {
      conn.client.logout().catch(() => {});
      tempConnectionCache.delete(address);
    }
  }
}, 30000);

// ═════════════════════════════════════════════════════════
// PUBLIC TEMP MAIL
// ═════════════════════════════════════════════════════════

/**
 * GET /api/tempmail/session
 * Check if the user has an active, non-expired temp mail session.
 */
router.get('/session', async (req, res, next) => {
  try {
    const token = req.cookies?.[TEMP_COOKIE_NAME] || req.signedCookies?.[TEMP_COOKIE_NAME];
    if (!token) {
      return res.json({ active: false });
    }

    const result = await query(
      `SELECT id, address, tier, status, expires_at, created_at
       FROM temp_addresses
       WHERE session_token = $1 AND status = 'active' AND expires_at > NOW()`,
      [token]
    );

    if (result.rows.length === 0) {
      res.clearCookie(TEMP_COOKIE_NAME, { path: '/', httpOnly: true, sameSite: 'lax' });
      res.clearCookie(TEMP_COOKIE_NAME, { path: '/' });
      res.cookie(TEMP_COOKIE_NAME, '', { path: '/', maxAge: 0, expires: new Date(0), httpOnly: true, sameSite: 'lax' });
      return res.json({ active: false });
    }

    const addr = result.rows[0];
    const remainingSeconds = Math.max(0, Math.floor((new Date(addr.expires_at) - Date.now()) / 1000));
    res.json({
      active: true,
      address: addr.address,
      expiresAt: addr.expires_at,
      remainingSeconds,
      tier: addr.tier,
      isCustom: Boolean(addr.custom_username),
      customUsername: addr.custom_username,
    });
  } catch (err) {
    next(err);
  }
});

/**
 * POST /api/tempmail/generate
 * Generate or restore a public temp address session.
 */
router.post('/generate',
  tempGenerateLimiter,
  verifyCaptcha,
  validate({
    expiryHours: { type: 'number', default: 24, min: 1, max: 72 },
    forceNew: { type: 'boolean', default: false },
    username: { type: 'string', min: 3, max: 30 },
    domain: { type: 'string' },
  }),
  async (req, res, next) => {
    try {
      const { expiryHours, forceNew, username, domain } = req.body;
      const existingToken = req.cookies?.[TEMP_COOKIE_NAME] || req.signedCookies?.[TEMP_COOKIE_NAME];

      // If not forced, no custom username or domain requested, and user already has an active session, reuse it
      if (!forceNew && !username && !domain && existingToken) {
        const existing = await query(
          `SELECT id, address, tier, status, expires_at, custom_username
           FROM temp_addresses
           WHERE session_token = $1 AND status = 'active' AND expires_at > NOW()`,
          [existingToken]
        );

        if (existing.rows.length > 0) {
          const row = existing.rows[0];
          const remainingSeconds = Math.max(0, Math.floor((new Date(row.expires_at) - Date.now()) / 1000));
          return res.json({
            address: row.address,
            expiresAt: row.expires_at,
            remainingSeconds,
            tier: row.tier,
            isCustom: Boolean(row.custom_username),
            reused: true,
          });
        }
      }

      // When generating a fresh address, the previous address is NOT prematurely incinerated.
      // It continues living out its full countdown timer so concurrent users and pending emails are not disrupted.
      // The current client is simply provisioned a new address and new session cookie.

      const address = await claimAddress(req.ip, expiryHours, username || null, domain || null);
      const remainingSeconds = Math.max(0, Math.floor((new Date(address.expires_at) - Date.now()) / 1000));

      // Set session cookie
      res.cookie(TEMP_COOKIE_NAME, address.session_token, {
        httpOnly: true,
        secure: false,
        sameSite: 'lax',
        maxAge: (address.expiryHours || expiryHours) * 60 * 60 * 1000,
        path: '/',
      });

      res.status(201).json({
        address: address.address,
        expiresAt: address.expires_at,
        expiryHours: address.expiryHours || expiryHours,
        remainingSeconds,
        source: address.source || 'pool',
        isCustom: Boolean(address.isCustom),
        tier: 'public',
      });
    } catch (err) {
      next(err);
    }
  }
);

/**
 * GET /api/tempmail/inbox/:address
 * Fetch live messages from Purelymail IMAP for a temp address.
 */
router.get('/inbox/:address', async (req, res, next) => {
  try {
    const { address } = req.params;

    // Verify address exists and is active
    const addr = await query(
      `SELECT id, address, tier, status, expires_at, imap_password, message_count FROM temp_addresses
       WHERE address = $1 AND status = 'active' AND expires_at > NOW()`,
      [address]
    );

    if (addr.rows.length === 0) {
      return res.status(404).json({ error: 'Address not found or expired' });
    }

    let messages = [];
    if (addr.rows[0].imap_password) {
      try {
        const client = await getTempIMAPConnection(address, addr.rows[0].imap_password);
        const result = await fetchMessages(client, 'INBOX', { page: 1, limit: 50 });
        const rawMessages = result.messages || [];

        // Filter out Purelymail welcome email so user only sees genuine messages & WoxMail welcome
        messages = rawMessages.filter((m) => !isPurelymailWelcomeEmail(m));

        // Sort newest first by date and UID
        messages.sort((a, b) => new Date(b.date || 0) - new Date(a.date || 0) || (b.uid - a.uid));

        // Update message count in database
        await query('UPDATE temp_addresses SET message_count = $1, last_accessed = NOW() WHERE id = $2', [messages.length, addr.rows[0].id]);
      } catch (imapErr) {
        logger.warn({ address, err: imapErr.message }, 'IMAP fetch for temp address');
      }
    }

    res.json({
      address: addr.rows[0].address,
      expiresAt: addr.rows[0].expires_at,
      messages,
      messageCount: messages.length,
    });
  } catch (err) {
    next(err);
  }
});

/**
 * GET /api/tempmail/sse/:address
 * Server-Sent Events stream for real-time inbox updates.
 */
router.get('/sse/:address', async (req, res, next) => {
  try {
    const { address } = req.params;

    const addr = await query(
      `SELECT id, address, imap_password FROM temp_addresses WHERE address = $1 AND status = 'active' AND expires_at > NOW()`,
      [address]
    );

    if (addr.rows.length === 0) {
      return res.status(404).json({ error: 'Address not found or expired' });
    }

    // SSE headers
    res.writeHead(200, {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache',
      Connection: 'keep-alive',
      'X-Accel-Buffering': 'no',
    });

    res.write(`data: ${JSON.stringify({ type: 'connected', address })}\n\n`);

    // Track already-known message UIDs so existing emails NEVER fire "new email" notifications on load
    const knownUids = new Set();
    let isInitialized = false;
    const password = addr.rows[0].imap_password;

    // Immediately record pre-existing messages on connection setup
    if (password) {
      getTempIMAPConnection(address, password)
        .then((client) => fetchMessages(client, 'INBOX', { page: 1, limit: 50 }))
        .then((result) => {
          (result.messages || []).forEach((m) => knownUids.add(m.uid));
          isInitialized = true;
        })
        .catch(() => {
          isInitialized = true;
        });
    }

    // Periodic poll check every 10s for SSE clients
    const poller = setInterval(async () => {
      if (!password) return;
      try {
        const client = await getTempIMAPConnection(address, password);
        const result = await fetchMessages(client, 'INBOX', { page: 1, limit: 20 });
        const currentMessages = (result.messages || []).filter((m) => !isPurelymailWelcomeEmail(m));

        if (!isInitialized) {
          currentMessages.forEach((m) => knownUids.add(m.uid));
          isInitialized = true;
          return;
        }

        // Emit new_email ONLY for truly newly arrived messages
        for (const msg of currentMessages) {
          if (!knownUids.has(msg.uid)) {
            knownUids.add(msg.uid);
            res.write(`data: ${JSON.stringify({ type: 'new_email', message: msg })}\n\n`);
          }
        }
      } catch {}
    }, 10000);

    req.on('close', () => {
      clearInterval(poller);
    });
  } catch (err) {
    next(err);
  }
});

/**
 * GET /api/tempmail/message/:address/:uid
 * Fetch a single message with sanitized HTML body from Purelymail IMAP.
 */
router.get('/message/:address/:uid', async (req, res, next) => {
  try {
    const { address, uid } = req.params;
    const uidNum = parseInt(uid, 10);

    const addr = await query(
      `SELECT id, address, imap_password FROM temp_addresses
       WHERE address = $1 AND status = 'active' AND expires_at > NOW()`,
      [address]
    );

    if (addr.rows.length === 0 || !addr.rows[0].imap_password) {
      return res.status(404).json({ error: 'Address not found or expired' });
    }

    const client = await getTempIMAPConnection(address, addr.rows[0].imap_password);
    const msg = await fetchMessage(client, 'INBOX', uidNum);

    if (!msg) {
      return res.status(404).json({ error: 'Message not found' });
    }

    let sanitizedHtml = null;
    let textContent = '';
    let attachments = [];

    if (msg.source) {
      const parsed = await simpleParser(msg.source);
      if (parsed.html) {
        const sanitized = sanitizeEmail(parsed.html);
        sanitizedHtml = typeof sanitized === 'object' ? (sanitized.html || '') : sanitized;
      }
      textContent = parsed.text || '';
      attachments = (parsed.attachments || []).map((a) => ({
        filename: a.filename,
        contentType: a.contentType,
        size: a.size,
      }));
    }

    res.json({
      uid: msg.uid,
      subject: msg.subject || '(no subject)',
      from: msg.from?.address || msg.from?.name || (typeof msg.from === 'string' ? msg.from : 'Unknown Sender'),
      to: msg.to || [],
      date: msg.date || new Date(),
      html: sanitizedHtml,
      text: textContent,
      attachments,
    });
  } catch (err) {
    next(err);
  }
});

/**
 * GET /api/tempmail/message/:address/:uid/attachment/:index
 * Download or preview an attachment from a temp mailbox.
 */
router.get('/message/:address/:uid/attachment/:index', async (req, res, next) => {
  try {
    const { address, uid } = req.params;
    const uidNum = parseInt(uid, 10);
    const index = parseInt(req.params.index, 10);

    const addr = await query(
      `SELECT id, address, imap_password FROM temp_addresses
       WHERE address = $1 AND status = 'active' AND expires_at > NOW()`,
      [address]
    );

    if (addr.rows.length === 0 || !addr.rows[0].imap_password) {
      return res.status(404).json({ error: 'Address not found or expired' });
    }

    const client = await createConnection(address, addr.rows[0].imap_password);
    const msg = await fetchMessage(client, 'INBOX', uidNum);
    await client.logout().catch(() => {});

    if (!msg || !msg.source) {
      return res.status(404).json({ error: 'Message not found' });
    }

    const { simpleParser } = await import('mailparser');
    const parsed = await simpleParser(msg.source);

    const attachments = parsed.attachments || [];
    const att = !isNaN(index) && attachments[index]
      ? attachments[index]
      : attachments.find((a) => a.filename === req.params.index);

    if (!att || !att.content) {
      return res.status(404).json({ error: 'Attachment not found' });
    }

    const isPreview = req.query.preview === 'true';
    const filename = att.filename || `attachment-${index + 1}`;
    const contentType = att.contentType || 'application/octet-stream';

    res.setHeader('Content-Type', contentType);
    res.setHeader(
      'Content-Disposition',
      `${isPreview ? 'inline' : 'attachment'}; filename="${encodeURIComponent(filename)}"`
    );
    if (att.size) res.setHeader('Content-Length', att.size);

    res.send(att.content);
  } catch (err) {
    next(err);
  }
});

/**
 * GET /api/tempmail/message/:address/:uid/eml
 * Download raw .eml file.
 */
router.get('/message/:address/:uid/eml', async (req, res, next) => {
  try {
    const { address, uid } = req.params;
    const uidNum = parseInt(uid, 10);

    const addr = await query(
      `SELECT id, address, imap_password FROM temp_addresses
       WHERE address = $1 AND status = 'active' AND expires_at > NOW()`,
      [address]
    );

    if (addr.rows.length === 0 || !addr.rows[0].imap_password) {
      return res.status(404).json({ error: 'Address not found or expired' });
    }

    const client = await createConnection(address, addr.rows[0].imap_password);
    const msg = await fetchMessage(client, 'INBOX', uidNum);
    await client.logout().catch(() => {});

    if (!msg || !msg.source) {
      return res.status(404).json({ error: 'Message not found' });
    }

    res.setHeader('Content-Type', 'message/rfc822');
    res.setHeader('Content-Disposition', `attachment; filename="${address}-${uid}.eml"`);
    res.send(msg.source);
  } catch (err) {
    next(err);
  }
});

/**
 * POST /api/tempmail/extend
 * Extend active disposable mailbox lifetime by additional hours.
 */
router.post('/extend', async (req, res, next) => {
  try {
    const { address, addHours = 1 } = req.body;
    const token = req.cookies?.[TEMP_COOKIE_NAME] || req.signedCookies?.[TEMP_COOKIE_NAME];
    if (!token && !address) return res.status(400).json({ error: 'Session or address required' });

    const hours = Math.min(72, Math.max(0.1, parseFloat(addHours) || 1));
    const result = await query(
      `UPDATE temp_addresses SET
         expires_at = GREATEST(expires_at, NOW()) + ($1 * INTERVAL '1 hour'),
         updated_at = NOW()
       WHERE (session_token = $2 OR address = $3) AND status = 'active'
       RETURNING id, address, expires_at`,
      [hours, token || '', address || '']
    );

    if (result.rows.length === 0) return res.status(404).json({ error: 'Active address not found' });
    res.json({
      message: `Mailbox lifetime extended by ${hours} hours`,
      expiresAt: result.rows[0].expires_at,
    });
  } catch (err) {
    next(err);
  }
});

/**
 * GET /api/tempmail/message/:address/:uid/source
 * View raw email source.
 */
router.get('/message/:address/:uid/source', async (req, res, next) => {
  try {
    const { address, uid } = req.params;
    const uidNum = parseInt(uid, 10);

    const addr = await query(
      `SELECT id, address, imap_password FROM temp_addresses
       WHERE address = $1 AND status = 'active' AND expires_at > NOW()`,
      [address]
    );

    if (addr.rows.length === 0 || !addr.rows[0].imap_password) {
      return res.status(404).json({ error: 'Address not found or expired' });
    }

    const client = await createConnection(address, addr.rows[0].imap_password);
    const msg = await fetchMessage(client, 'INBOX', uidNum);
    await client.logout().catch(() => {});

    res.json({ source: msg?.source || '' });
  } catch (err) {
    next(err);
  }
});

/**
 * DELETE /api/tempmail/delete/:address
 * Delete a temp mailbox (early self-destruct).
 */
router.delete('/delete/:address', async (req, res, next) => {
  try {
    const { address } = req.params;
    const cleanAddr = (address || '').trim();
    const token = req.cookies?.[TEMP_COOKIE_NAME] || req.signedCookies?.[TEMP_COOKIE_NAME];

    // Invalidate the session in database and delete row
    await query(
      `DELETE FROM temp_addresses 
       WHERE address = $1 
          OR LOWER(address) = LOWER($1)
          OR ($2::text IS NOT NULL AND session_token = $2)`,
      [cleanAddr, token || null]
    );

    // Delete user from Purelymail if provisioned there
    try {
      await deleteUser(cleanAddr);
    } catch (err) {
      // Ignored if user only existed locally or was already deleted
    }

    // Comprehensive RFC 6265 compliant cookie clearing including httpOnly: true
    res.clearCookie(TEMP_COOKIE_NAME, { path: '/', httpOnly: true, sameSite: 'lax' });
    res.clearCookie(TEMP_COOKIE_NAME, { path: '/', httpOnly: true });
    res.clearCookie(TEMP_COOKIE_NAME, { path: '/' });
    res.cookie(TEMP_COOKIE_NAME, '', { path: '/', maxAge: 0, expires: new Date(0), httpOnly: true, sameSite: 'lax' });

    res.json({ message: 'Mailbox deleted', address: cleanAddr });
  } catch (err) {
    next(err);
  }
});

/**
 * GET /api/tempmail/qr/:address
 * Generate QR code to open this mailbox on mobile.
 */
router.get('/qr/:address', async (req, res, next) => {
  try {
    const domain = process.env.DOMAIN_TEMP || 'mail.wox.world';
    const inboxUrl = `https://${domain}/tempmail?address=${encodeURIComponent(req.params.address)}`;
    const qr = await QRCode.toDataURL(inboxUrl, {
      margin: 2,
      width: 260,
      color: {
        dark: '#0f0f1a',
        light: '#ffffff',
      },
    });
    res.json({ qr, address: req.params.address, url: inboxUrl });
  } catch (err) {
    next(err);
  }
});

/**
 * GET /api/tempmail/status/:address
 * Check address status and time remaining.
 */
router.get('/status/:address', async (req, res, next) => {
  try {
    const result = await query(
      `SELECT address, status, expires_at, message_count, created_at
       FROM temp_addresses WHERE address = $1`,
      [req.params.address]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Address not found' });
    }

    const addr = result.rows[0];
    const remaining = Math.max(0, new Date(addr.expires_at) - Date.now());

    res.json({
      address: addr.address,
      status: addr.status,
      expiresAt: addr.expires_at,
      remainingMs: remaining,
      messageCount: addr.message_count,
    });
  } catch (err) {
    next(err);
  }
});

/**
 * GET /api/tempmail/export/:address
 * Export all inbox messages as a downloadable JSON file.
 */
router.get('/export/:address', async (req, res, next) => {
  try {
    const { address } = req.params;
    const addr = await query(
      `SELECT id, address, imap_password, created_at, expires_at FROM temp_addresses
       WHERE address = $1 AND status = 'active' AND expires_at > NOW()`,
      [address]
    );

    if (addr.rows.length === 0 || !addr.rows[0].imap_password) {
      return res.status(404).json({ error: 'Address not found or expired' });
    }

    const client = await createConnection(address, addr.rows[0].imap_password);
    const result = await fetchMessages(client, 'INBOX', { page: 1, limit: 100 });
    await client.logout().catch(() => {});

    const exportData = {
      address: addr.rows[0].address,
      createdAt: addr.rows[0].created_at,
      expiresAt: addr.rows[0].expires_at,
      exportedAt: new Date().toISOString(),
      messageCount: result.messages?.length || 0,
      messages: result.messages || [],
    };

    res.setHeader('Content-Type', 'application/json');
    res.setHeader('Content-Disposition', `attachment; filename="woxmail-${address}.json"`);
    res.send(JSON.stringify(exportData, null, 2));
  } catch (err) {
    next(err);
  }
});

/**
 * GET /api/tempmail/recent
 * List recently created public temp addresses (visible to everyone).
 * Supports ?sync=true to concurrently probe IMAP for live message counts.
 */
router.get('/recent', async (req, res, next) => {
  try {
    const shouldSync = req.query.sync === 'true' || req.query.sync === '1';

    const result = await query(
      `SELECT id, address, imap_password, created_at, expires_at, message_count
       FROM temp_addresses
       WHERE tier = 'public' AND status = 'active' AND expires_at > NOW()
       ORDER BY created_at DESC
       LIMIT 50`
    );

    const rows = result.rows;

    if (shouldSync && rows.length > 0) {
      // Concurrently check IMAP status for each active address with a 4s timeout
      await Promise.allSettled(
        rows.map(async (r) => {
          if (!r.imap_password) return;
          try {
            const count = await getInboxMessageCount(r.address, r.imap_password);
            if (typeof count === 'number') {
              r.message_count = count;
              await query('UPDATE temp_addresses SET message_count = $1 WHERE id = $2', [count, r.id]);
            }
          } catch {}
        })
      );
    }

    res.json({
      addresses: rows.map((r) => ({
        address: r.address,
        createdAt: r.created_at,
        expiresAt: r.expires_at,
        messageCount: r.message_count || 0,
      })),
    });
  } catch (err) {
    next(err);
  }
});

// ═════════════════════════════════════════════════════════
// PERSONAL TEMP MAIL
// ═════════════════════════════════════════════════════════

/**
 * POST /api/tempmail/personal/create
 * Create a personal temp address with password.
 */
router.post('/personal/create',
  tempGenerateLimiter,
  verifyCaptcha,
  validate({
    username: { type: 'string', min: 3, max: 30 },
    password: { type: 'string', required: true, min: 6 },
    expiryHours: { type: 'number', default: 720, min: 1, max: 1440 },
  }),
  async (req, res, next) => {
    try {
      const { password, expiryHours } = req.body;
      let { username } = req.body;

      // Check per-IP limit
      const maxPerIpSetting = await query("SELECT value FROM settings WHERE key = 'max_personal_per_ip'");
      const maxPerIp = parseInt(maxPerIpSetting.rows[0]?.value, 10) || 5;

      const activeCount = await query(
        `SELECT COUNT(*)::int as count FROM temp_addresses
         WHERE tier = 'personal' AND status = 'active' AND ip_address = $1`,
        [req.ip]
      );

      if (activeCount.rows[0].count >= maxPerIp) {
        if (process.env.NODE_ENV === 'development') {
          await query(`
            UPDATE temp_addresses SET status = 'expired'
            WHERE id = (
              SELECT id FROM temp_addresses
              WHERE tier = 'personal' AND status = 'active' AND ip_address = $1
              ORDER BY activated_at ASC LIMIT 1
            )`, [req.ip]);
        } else {
          return res.status(429).json({ error: `Maximum ${maxPerIp} personal addresses per IP` });
        }
      }

      // Generate or validate username
      const domain = process.env.DOMAIN_TEMP || 'mail.wox.world';
      if (username) {
        const check = validateUsername(username);
        if (!check.valid) return res.status(400).json({ error: check.error });

        // Check uniqueness
        const existing = await query(
          'SELECT id FROM temp_addresses WHERE address = $1 AND status IN ($2, $3)',
          [`${username.toLowerCase()}@${domain}`, 'active', 'available']
        );
        if (existing.rows.length > 0) {
          return res.status(409).json({ error: 'Username already taken' });
        }
      } else {
        username = `p_${generateToken(4)}`;
      }

      const address = `${username.toLowerCase()}@${domain}`;
      const passwordHash = await hashPassword(password);
      const sessionToken = generateToken(16);
      const imapPassword = generateToken(16);

      // Create in Purelymail
      await createUser(address, imapPassword);

      // Store in database
      const result = await query(
        `INSERT INTO temp_addresses
         (address, tier, status, password_hash, custom_username, session_token, ip_address, expires_at, activated_at, last_accessed)
         VALUES ($1, 'personal', 'active', $2, $3, $4, $5, NOW() + INTERVAL '1 hour' * $6, NOW(), NOW())
         RETURNING *`,
        [address, passwordHash, username.toLowerCase(), sessionToken, req.ip, expiryHours]
      );

      // Set session cookie
      res.cookie(TEMP_COOKIE_NAME, sessionToken, {
        httpOnly: true,
        secure: process.env.NODE_ENV === 'production',
        sameSite: 'strict',
        maxAge: expiryHours * 60 * 60 * 1000,
        path: '/',
      });

      res.status(201).json({
        address: result.rows[0].address,
        expiresAt: result.rows[0].expires_at,
        tier: 'personal',
        recoveryToken: sessionToken.slice(0, 8), // Partial token for re-login
      });
    } catch (err) {
      next(err);
    }
  }
);

/**
 * POST /api/tempmail/personal/login
 * Re-login to a personal temp address.
 */
router.post('/personal/login',
  validate({
    address: { type: 'string', required: true },
    password: { type: 'string', required: true },
  }),
  async (req, res, next) => {
    try {
      const { address, password } = req.body;

      const result = await query(
        `SELECT id, address, password_hash, session_token, expires_at, status
         FROM temp_addresses
         WHERE address = $1 AND tier = 'personal'`,
        [address.toLowerCase()]
      );

      if (result.rows.length === 0) {
        return res.status(401).json({ error: 'Invalid address or password' });
      }

      const addr = result.rows[0];

      if (addr.status !== 'active' || new Date(addr.expires_at) <= new Date()) {
        return res.status(410).json({ error: 'This address has expired' });
      }

      const valid = await verifyPassword(addr.password_hash, password);
      if (!valid) {
        return res.status(401).json({ error: 'Invalid address or password' });
      }

      // Refresh session token
      const newToken = generateToken(16);
      await query(
        'UPDATE temp_addresses SET session_token = $1, last_accessed = NOW() WHERE id = $2',
        [newToken, addr.id]
      );

      const remaining = new Date(addr.expires_at) - Date.now();
      res.cookie(TEMP_COOKIE_NAME, newToken, {
        httpOnly: true,
        secure: process.env.NODE_ENV === 'production',
        sameSite: 'strict',
        maxAge: remaining,
        path: '/',
      });

      res.json({ address: addr.address, expiresAt: addr.expires_at });
    } catch (err) {
      next(err);
    }
  }
);

/**
 * POST /api/tempmail/personal/logout
 */
router.post('/personal/logout', (req, res) => {
  res.clearCookie(TEMP_COOKIE_NAME, { path: '/' });
  res.json({ message: 'Logged out' });
});

/**
 * POST /api/tempmail/personal/extend
 * Extend expiry of a personal temp address.
 */
router.post('/personal/extend',
  requireTempAuth,
  validate({ hours: { type: 'number', required: true, min: 1, max: 720 } }),
  async (req, res, next) => {
    try {
      const { hours } = req.body;
      const maxSetting = await query("SELECT value FROM settings WHERE key = 'temp_personal_max_expiry_days'");
      const maxDays = parseInt(maxSetting.rows[0]?.value, 10) || 60;

      // Calculate new expiry
      const newExpiry = new Date(req.tempUser.expires_at);
      newExpiry.setHours(newExpiry.getHours() + hours);

      const maxExpiry = new Date(req.tempUser.created_at);
      maxExpiry.setDate(maxExpiry.getDate() + maxDays);

      if (newExpiry > maxExpiry) {
        return res.status(400).json({
          error: `Cannot extend beyond ${maxDays} days from creation`,
        });
      }

      await query(
        'UPDATE temp_addresses SET expires_at = $1 WHERE id = $2',
        [newExpiry, req.tempUser.id]
      );

      res.json({ expiresAt: newExpiry });
    } catch (err) {
      next(err);
    }
  }
);

/**
 * PUT /api/tempmail/personal/star/:uid
 */
router.put('/personal/star/:uid', requireTempAuth, async (req, res, next) => {
  try {
    const uid = parseInt(req.params.uid, 10);
    res.json({ message: 'Star toggled', uid });
  } catch (err) {
    next(err);
  }
});

/**
 * POST /api/tempmail/personal/change-password
 * Change password for the active personal temp mailbox.
 */
router.post('/personal/change-password',
  requireTempAuth,
  validate({
    currentPassword: { type: 'string', required: true },
    newPassword: { type: 'string', required: true, min: 6 },
  }),
  async (req, res, next) => {
    try {
      const { currentPassword, newPassword } = req.body;
      const valid = await verifyPassword(req.tempUser.password_hash, currentPassword);
      if (!valid) {
        return res.status(401).json({ error: 'Current password incorrect' });
      }

      const newHash = await hashPassword(newPassword);
      await query('UPDATE temp_addresses SET password_hash = $1 WHERE id = $2', [newHash, req.tempUser.id]);

      res.json({ message: 'Password updated successfully' });
    } catch (err) {
      next(err);
    }
  }
);

/**
 * POST /api/tempmail/personal/forward/:uid
 */
router.post('/personal/forward/:uid',
  requireTempAuth,
  validate({ to: { type: 'string', required: true } }),
  async (req, res, next) => {
    try {
      const { to } = req.body;
      const uid = parseInt(req.params.uid, 10);

      // Fetch message body
      const msg = await fetchMessage(req.tempUser.address, req.tempUser.imap_password, uid);
      if (!msg) {
        return res.status(404).json({ error: 'Message not found' });
      }

      const adminEmail = process.env.ADMIN_EMAIL;
      const adminPass = (process.env.ADMIN_PASSWORD || '').replace(/^['"]|['"]$/g, '');
      if (!adminEmail || !adminPass) {
        return res.status(500).json({ error: 'Mail forwarding credentials not configured' });
      }
      const transporter = createTransporter(adminEmail, adminPass);

      await sendEmail(transporter, {
        from: `"${req.tempUser.address} via WoxMail" <${adminEmail}>`,
        to,
        subject: `Fwd: ${msg.subject || 'Disposable Email'}`,
        text: `--- Forwarded from ${req.tempUser.address} ---\n\n${msg.text || ''}`,
      });

      res.json({ message: `Message forwarded to ${to}` });
    } catch (err) {
      next(err);
    }
  }
);

// ═════════════════════════════════════════════════════════
// LINK PREVIEWS
// ═════════════════════════════════════════════════════════

router.get('/link-preview', async (req, res, next) => {
  try {
    const targetUrl = req.query.url;
    if (!targetUrl) return res.status(400).json({ error: 'url query parameter is required' });
    const metadata = await linkPreviewService.fetchLinkMetadata(String(targetUrl));
    res.json({ preview: metadata });
  } catch (err) {
    next(err);
  }
});

router.post('/link-previews',
  validate({ urls: { type: 'array', required: true, max: 10 } }),
  async (req, res, next) => {
    try {
      const { urls } = req.body;
      const previews = await linkPreviewService.fetchBatchLinkMetadata(urls);
      res.json({ previews });
    } catch (err) {
      next(err);
    }
  }
);

export default router;
