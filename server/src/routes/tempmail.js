import { Router } from 'express';
import { query } from '../config/database.js';
import { claimAddress } from '../services/pool.js';
import { createUser, deleteUser } from '../services/purelymail.js';
import { createConnection, fetchMessages, fetchMessage, getInboxMessageCount, deleteMessages, toggleFlag } from '../services/imap.js';
import { createTransporter, sendEmail } from '../services/smtp.js';
import { simpleParser } from 'mailparser';
import { sanitizeEmail } from '../services/emailSanitizer.js';
import { hashPassword, verifyPassword, generateToken, timingSafeEqual } from '../utils/crypto.js';
import { validateUsername, isValidEmail } from '../utils/validators.js';
import { parsePagination, paginationMeta, isPurelymailWelcomeEmail } from '../utils/helpers.js';
import { verifyCaptcha } from '../middleware/captcha.js';
import { requireTempAuth } from '../middleware/tempAuth.js';
import { tempGenerateLimiter, authSensitiveLimiter } from '../middleware/rateLimit.js';
import { validate } from '../middleware/validate.js';
import { TEMP_COOKIE_NAME, TIERS } from '../config/constants.js';
import * as linkPreviewService from '../services/linkPreviewService.js';
import QRCode from 'qrcode';
import pino from 'pino';

const logger = pino({ name: 'woxmail:tempmail' });
const router = Router();

function isHttpsRequest(req) {
  return !!(req.secure || req.headers['x-forwarded-proto'] === 'https');
}

function normalizeIp(ip) {
  return String(ip || '').replace(/^::ffff:/, '').trim();
}

/**
 * Verify caller possesses the valid session token if the address is a personal tier mailbox.
 */
function verifyPersonalAccess(req, addrRecord) {
  if (addrRecord && addrRecord.tier === 'personal') {
    const token = req.cookies?.[TEMP_COOKIE_NAME] || req.headers['x-temp-token'] || req.headers['x-session-token'];
    if (!token || !addrRecord.session_token || !timingSafeEqual(String(token), String(addrRecord.session_token))) {
      return false;
    }
  }
  return true;
}

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
  validate({
    expiryHours: { type: 'number', default: 24, min: 1, max: 72 },
    forceNew: { type: 'boolean', default: false },
    username: { type: 'string', min: 3, max: 30 },
    domain: { type: 'string' },
  }),
  async (req, res, next) => {
    try {
      const { expiryHours, forceNew, username, domain } = req.body;
      const permanentDomain = process.env.DOMAIN_PERMANENT || 'wox.world';
      if (domain && (domain.toLowerCase().trim() === permanentDomain || domain.toLowerCase().trim() === 'wox.world')) {
        return res.status(400).json({
          error: 'The permanent @wox.world domain is reserved for permanent user accounts and cannot be used for disposable temporary mail.'
        });
      }
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
        secure: isHttpsRequest(req),
        sameSite: 'lax',
        maxAge: (address.expiryHours || expiryHours) * 60 * 60 * 1000,
        path: '/',
      });

      broadcastDirectoryUpdate({ type: 'directory_refresh' });

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

    // Verify address exists and is active or in standby pool
    const addr = await query(
      `SELECT id, address, tier, session_token, status, expires_at, imap_password, message_count FROM temp_addresses
       WHERE address = $1 AND status IN ('active', 'available') AND expires_at > NOW()`,
      [address]
    );

    if (addr.rows.length === 0) {
      return res.status(404).json({ error: 'Address not found or expired' });
    }

    if (!verifyPersonalAccess(req, addr.rows[0])) {
      return res.status(401).json({ error: 'Personal temp mail authentication required' });
    }

    // If an available standby pool address was opened, activate it and replenish pool
    if (addr.rows[0].status === 'available') {
      await query(
        `UPDATE temp_addresses 
         SET status = 'active', activated_at = NOW(), last_accessed = NOW() 
         WHERE id = $1`,
        [addr.rows[0].id]
      );
      import('../services/pool.js').then(m => m.replenishPool().catch(() => {}));
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

// ─── Real-Time Public Directory SSE Stream ────────────────
const directorySSEClients = new Set();

/**
 * Broadcast dynamic updates to all connected public directory viewers.
 * @param {object} payload
 */
export function broadcastDirectoryUpdate(payload) {
  const data = `data: ${JSON.stringify(payload)}\n\n`;
  for (const client of directorySSEClients) {
    try {
      client.write(data);
    } catch {
      directorySSEClients.delete(client);
    }
  }
}

/**
 * GET /api/tempmail/sse-directory
 * Server-Sent Events stream for instant public directory badge and pool sync.
 */
router.get('/sse-directory', (req, res) => {
  res.writeHead(200, {
    'Content-Type': 'text/event-stream',
    'Cache-Control': 'no-cache',
    Connection: 'keep-alive',
    'X-Accel-Buffering': 'no',
  });

  res.write(`data: ${JSON.stringify({ type: 'connected' })}\n\n`);
  directorySSEClients.add(res);

  req.on('close', () => {
    directorySSEClients.delete(res);
  });
});

/**
 * GET /api/tempmail/sse/:address
 * Server-Sent Events stream for real-time inbox updates.
 */
router.get('/sse/:address', async (req, res, next) => {
  try {
    const { address } = req.params;

    const addr = await query(
      `SELECT id, address, tier, session_token, imap_password FROM temp_addresses WHERE address = $1 AND status IN ('active', 'available') AND expires_at > NOW()`,
      [address]
    );

    if (addr.rows.length === 0) {
      return res.status(404).json({ error: 'Address not found or expired' });
    }

    if (!verifyPersonalAccess(req, addr.rows[0])) {
      return res.status(401).json({ error: 'Personal temp mail authentication required' });
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

            // Instantly update database count and broadcast to all live directory viewers
            query('UPDATE temp_addresses SET message_count = $1, last_accessed = NOW() WHERE address = $2', [knownUids.size, address]).catch(() => {});
            broadcastDirectoryUpdate({ type: 'badge_update', address, messageCount: knownUids.size });
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
      `SELECT id, address, tier, session_token, imap_password FROM temp_addresses
       WHERE address = $1 AND status IN ('active', 'available') AND expires_at > NOW()`,
      [address]
    );

    if (addr.rows.length === 0 || !addr.rows[0].imap_password) {
      return res.status(404).json({ error: 'Address not found or expired' });
    }

    if (!verifyPersonalAccess(req, addr.rows[0])) {
      return res.status(401).json({ error: 'Personal temp mail authentication required' });
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
      `SELECT id, address, tier, session_token, imap_password FROM temp_addresses
       WHERE address = $1 AND status IN ('active', 'available') AND expires_at > NOW()`,
      [address]
    );

    if (addr.rows.length === 0 || !addr.rows[0].imap_password) {
      return res.status(404).json({ error: 'Address not found or expired' });
    }

    if (!verifyPersonalAccess(req, addr.rows[0])) {
      return res.status(401).json({ error: 'Personal temp mail authentication required' });
    }

    let client;
    let msg;
    try {
      client = await createConnection(address, addr.rows[0].imap_password);
      msg = await fetchMessage(client, 'INBOX', uidNum);
    } finally {
      if (client) await client.logout().catch(() => {});
    }

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
    const isExtract = req.query.extract === 'true';
    const filename = att.filename || `attachment-${index + 1}`;
    const contentType = att.contentType || 'application/octet-stream';

    if (isExtract) {
      const { extractOfficeDocument } = await import('../services/officeDocService.js');
      try {
        const docData = extractOfficeDocument(att.content, filename);
        return res.json({ success: true, filename, ...docData });
      } catch (extractErr) {
        return res.json({
          success: false,
          error: extractErr.message,
          fallbackText: att.content ? att.content.toString('utf8').slice(0, 50000) : '',
        });
      }
    }

    const safeContentType = String(contentType || 'application/octet-stream').replace(/[\r\n\x00-\x1f\x7f]/g, '').trim() || 'application/octet-stream';
    const isDangerousInline = /^(text\/html|application\/xhtml\+xml|image\/svg\+xml|application\/xml|text\/xml|text\/javascript|application\/javascript|application\/ecmascript|text\/xsl|application\/mathml\+xml|message\/rfc822)/i.test(safeContentType);
    const safeFilename = String(filename || 'attachment').replace(/[\r\n\x00-\x1f\x7f"/\\]/g, '_');
    const disposition = isPreview && !isDangerousInline ? 'inline' : 'attachment';

    res.setHeader('Content-Type', isDangerousInline ? 'application/octet-stream' : safeContentType);
    res.setHeader(
      'Content-Disposition',
      `${disposition}; filename="${safeFilename}"; filename*=UTF-8''${encodeURIComponent(filename)}`
    );
    res.setHeader('X-Content-Type-Options', 'nosniff');
    if (disposition === 'inline') {
      res.setHeader('Content-Security-Policy', "default-src 'none'; img-src 'self' data:; media-src 'self'; sandbox");
    }
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
      `SELECT id, address, tier, session_token, imap_password FROM temp_addresses
       WHERE address = $1 AND status IN ('active', 'available') AND expires_at > NOW()`,
      [address]
    );

    if (addr.rows.length === 0 || !addr.rows[0].imap_password) {
      return res.status(404).json({ error: 'Address not found or expired' });
    }

    if (!verifyPersonalAccess(req, addr.rows[0])) {
      return res.status(401).json({ error: 'Personal temp mail authentication required' });
    }

    let client;
    let msg;
    try {
      client = await createConnection(address, addr.rows[0].imap_password);
      msg = await fetchMessage(client, 'INBOX', uidNum);
    } finally {
      if (client) await client.logout().catch(() => {});
    }

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
    const token = req.cookies?.[TEMP_COOKIE_NAME] || req.signedCookies?.[TEMP_COOKIE_NAME] || req.headers['x-temp-token'] || req.headers['x-session-token'];
    if (!token && !address) return res.status(400).json({ error: 'Session or address required' });

    const lookupRes = address
      ? await query(
          `SELECT id, address, tier, session_token, ip_address FROM temp_addresses
           WHERE LOWER(address) = LOWER($1) AND status = 'active'`,
          [String(address).trim()]
        )
      : await query(
          `SELECT id, address, tier, session_token, ip_address FROM temp_addresses
           WHERE session_token = $1 AND status = 'active'`,
          [token]
        );

    if (lookupRes.rows.length === 0) {
      return res.status(404).json({ error: 'Active address not found' });
    }

    const row = lookupRes.rows[0];
    const hasTokenMatch = Boolean(token && row.session_token && token === row.session_token);
    if (row.tier === 'personal') {
      if (!hasTokenMatch) {
        return res.status(401).json({ error: 'Authentication required to extend personal temp mailbox' });
      }
    } else if (!hasTokenMatch && normalizeIp(row.ip_address) !== normalizeIp(req.ip)) {
      return res.status(403).json({ error: 'Forbidden: cannot extend another session mailbox' });
    }

    const hours = Math.min(72, Math.max(0.1, parseFloat(addHours) || 1));
    const result = await query(
      `UPDATE temp_addresses SET
         expires_at = GREATEST(expires_at, NOW()) + ($1 * INTERVAL '1 hour'),
         updated_at = NOW()
       WHERE id = $2 AND status = 'active'
       RETURNING id, address, expires_at`,
      [hours, row.id]
    );

    if (result.rows.length === 0) return res.status(404).json({ error: 'Active address not found' });
    broadcastDirectoryUpdate({ type: 'directory_refresh' });
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
      `SELECT id, address, tier, session_token, imap_password FROM temp_addresses
       WHERE address = $1 AND status IN ('active', 'available') AND expires_at > NOW()`,
      [address]
    );

    if (addr.rows.length === 0 || !addr.rows[0].imap_password) {
      return res.status(404).json({ error: 'Address not found or expired' });
    }

    if (!verifyPersonalAccess(req, addr.rows[0])) {
      return res.status(401).json({ error: 'Personal temp mail authentication required' });
    }

    let client;
    let msg;
    try {
      client = await createConnection(address, addr.rows[0].imap_password);
      msg = await fetchMessage(client, 'INBOX', uidNum);
    } finally {
      if (client) await client.logout().catch(() => {});
    }

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
    const token = req.cookies?.[TEMP_COOKIE_NAME] || req.signedCookies?.[TEMP_COOKIE_NAME] || req.headers['x-temp-token'] || req.headers['x-session-token'];

    const existingRes = await query(
      `SELECT id, address, tier, session_token, password_hash, ip_address
       FROM temp_addresses
       WHERE LOWER(address) = LOWER($1)
       LIMIT 1`,
      [cleanAddr]
    );

    if (existingRes.rows.length === 0) {
      return res.status(404).json({ error: 'Mailbox not found' });
    }

    const row = existingRes.rows[0];
    const tokenMatches = Boolean(token && row.session_token && token === row.session_token);

    if (row.tier === 'personal') {
      let passwordMatches = false;
      if (!tokenMatches && req.body?.password && row.password_hash) {
        passwordMatches = await verifyPassword(row.password_hash, String(req.body.password));
      }
      if (!tokenMatches && !passwordMatches) {
        return res.status(401).json({ error: 'Authentication required to delete personal temp mailbox' });
      }
    } else {
      const sameCreatorIp = !token && normalizeIp(row.ip_address) === normalizeIp(req.ip);
      if (!tokenMatches && !sameCreatorIp) {
        return res.status(403).json({ error: 'Forbidden: cannot delete another session mailbox' });
      }
    }

    await query('DELETE FROM temp_addresses WHERE id = $1', [row.id]);

    // Delete user from Purelymail if provisioned there
    try {
      await deleteUser(row.address);
    } catch (err) {
      // Ignored if user only existed locally or was already deleted
    }

    // Comprehensive RFC 6265 compliant cookie clearing including httpOnly: true
    res.clearCookie(TEMP_COOKIE_NAME, { path: '/', httpOnly: true, sameSite: 'lax' });
    res.clearCookie(TEMP_COOKIE_NAME, { path: '/', httpOnly: true });
    res.clearCookie(TEMP_COOKIE_NAME, { path: '/' });
    res.cookie(TEMP_COOKIE_NAME, '', { path: '/', maxAge: 0, expires: new Date(0), httpOnly: true, sameSite: 'lax' });

    broadcastDirectoryUpdate({ type: 'directory_refresh' });

    res.json({ message: 'Mailbox deleted', address: row.address });
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
      `SELECT id, address, tier, session_token, imap_password, created_at, expires_at FROM temp_addresses
       WHERE LOWER(address) = LOWER($1) AND status IN ('active', 'available') AND expires_at > NOW()`,
      [address]
    );

    if (addr.rows.length === 0 || !addr.rows[0].imap_password) {
      return res.status(404).json({ error: 'Address not found or expired' });
    }

    if (!verifyPersonalAccess(req, addr.rows[0])) {
      return res.status(401).json({ error: 'Personal temp mail authentication required' });
    }

    let client;
    let result;
    try {
      client = await createConnection(addr.rows[0].address, addr.rows[0].imap_password);
      result = await fetchMessages(client, 'INBOX', { page: 1, limit: 100 });
    } finally {
      if (client) await client.logout().catch(() => {});
    }

    const exportData = {
      address: addr.rows[0].address,
      createdAt: addr.rows[0].created_at,
      expiresAt: addr.rows[0].expires_at,
      exportedAt: new Date().toISOString(),
      messageCount: result.messages?.length || 0,
      messages: result.messages || [],
    };

    const safeFilename = String(addr.rows[0].address || 'export').replace(/[^a-zA-Z0-9._@-]/g, '_');
    res.setHeader('Content-Type', 'application/json');
    res.setHeader('Content-Disposition', `attachment; filename="woxmail-${safeFilename}.json"`);
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
      `SELECT id, address, imap_password, created_at, expires_at, message_count, status
       FROM temp_addresses
       WHERE tier = 'public' AND status IN ('active', 'available') AND expires_at > NOW()
       ORDER BY (CASE WHEN status = 'active' THEN 0 ELSE 1 END), created_at DESC
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
        status: r.status,
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
         (address, tier, status, password_hash, imap_password, custom_username, session_token, ip_address, expires_at, activated_at, last_accessed)
         VALUES ($1, 'personal', 'active', $2, $3, $4, $5, $6, NOW() + INTERVAL '1 hour' * $7, NOW(), NOW())
         RETURNING *`,
        [address, passwordHash, imapPassword, username.toLowerCase(), sessionToken, req.ip, expiryHours]
      );

      // Set session cookie
      res.cookie(TEMP_COOKIE_NAME, sessionToken, {
        httpOnly: true,
        secure: isHttpsRequest(req),
        sameSite: 'strict',
        maxAge: expiryHours * 60 * 60 * 1000,
        path: '/',
      });

      res.status(201).json({
        address: result.rows[0].address,
        expiresAt: result.rows[0].expires_at,
        tier: 'personal',
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
  authSensitiveLimiter,
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
        secure: isHttpsRequest(req),
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
router.post('/personal/logout', async (req, res, next) => {
  try {
    const token = req.cookies?.[TEMP_COOKIE_NAME] || req.headers['x-temp-token'] || req.headers['x-session-token'];
    if (token) {
      await query(
        `UPDATE temp_addresses SET session_token = $1 WHERE session_token = $2 AND tier = 'personal'`,
        [generateToken(16), token]
      );
    }
    res.clearCookie(TEMP_COOKIE_NAME, { path: '/', httpOnly: true, sameSite: 'strict' });
    res.clearCookie(TEMP_COOKIE_NAME, { path: '/' });
    res.json({ message: 'Logged out' });
  } catch (err) {
    next(err);
  }
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
        'UPDATE temp_addresses SET expires_at = $1, updated_at = NOW() WHERE id = $2',
        [newExpiry, req.tempUser.id]
      );

      res.cookie(TEMP_COOKIE_NAME, req.tempUser.session_token, {
        httpOnly: true,
        secure: isHttpsRequest(req),
        sameSite: 'strict',
        maxAge: Math.max(0, newExpiry.getTime() - Date.now()),
        path: '/',
      });

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
  let client;
  try {
    const uid = parseInt(req.params.uid, 10);
    if (!Number.isInteger(uid) || uid <= 0) {
      return res.status(400).json({ error: 'Invalid message UID' });
    }

    const addrRes = await query('SELECT imap_password FROM temp_addresses WHERE id = $1', [req.tempUser.id]);
    const imapPassword = addrRes.rows[0]?.imap_password;
    if (!imapPassword) {
      return res.status(400).json({ error: 'Mailbox IMAP credentials not configured' });
    }

    client = await createConnection(req.tempUser.address, imapPassword);
    let nextStarred;
    if (typeof req.body?.starred === 'boolean') {
      nextStarred = req.body.starred;
    } else {
      const msg = await fetchMessage(client, 'INBOX', uid);
      if (!msg) {
        return res.status(404).json({ error: 'Message not found' });
      }
      const currentlyFlagged = msg.flags instanceof Set
        ? msg.flags.has('\\Flagged')
        : Array.isArray(msg.flags) && msg.flags.includes('\\Flagged');
      nextStarred = !currentlyFlagged;
    }

    await toggleFlag(client, 'INBOX', [uid], '\\Flagged', nextStarred);
    res.json({ message: 'Star updated', uid, isStarred: nextStarred });
  } catch (err) {
    next(err);
  } finally {
    if (client) await client.logout().catch(() => {});
  }
});

/**
 * POST /api/tempmail/personal/batch-delete
 * Delete multiple messages from a personal temp mailbox.
 */
router.post('/personal/batch-delete',
  requireTempAuth,
  validate({ uids: { type: 'array', required: true, min: 1, max: 100 } }),
  async (req, res, next) => {
    let client;
    try {
      const validUids = req.body.uids
        .map((u) => parseInt(u, 10))
        .filter((u) => Number.isInteger(u) && u > 0);

      if (validUids.length === 0) {
        return res.status(400).json({ error: 'No valid message UIDs provided' });
      }

      const addrRes = await query('SELECT imap_password FROM temp_addresses WHERE id = $1', [req.tempUser.id]);
      const imapPassword = addrRes.rows[0]?.imap_password;
      if (!imapPassword) {
        return res.status(400).json({ error: 'Mailbox IMAP credentials not configured' });
      }

      client = await createConnection(req.tempUser.address, imapPassword);
      await deleteMessages(client, 'INBOX', validUids);

      res.json({
        success: true,
        deletedCount: validUids.length,
        deleted: validUids,
        uids: validUids,
      });
    } catch (err) {
      next(err);
    } finally {
      if (client) await client.logout().catch(() => {});
    }
  }
);

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
      const newSessionToken = generateToken(32);
      await query(
        'UPDATE temp_addresses SET password_hash = $1, session_token = $2 WHERE id = $3',
        [newHash, newSessionToken, req.tempUser.id]
      );
      res.cookie(TEMP_COOKIE_NAME, newSessionToken, {
        httpOnly: true,
        secure: isHttpsRequest(req),
        sameSite: 'strict',
        path: '/',
        maxAge: 60 * 24 * 60 * 60 * 1000,
      });

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
    let client;
    try {
      const to = String(req.body.to || '').trim();
      if (!isValidEmail(to)) {
        return res.status(400).json({ error: 'Invalid recipient email address' });
      }

      const uid = parseInt(req.params.uid, 10);
      if (!Number.isInteger(uid) || uid <= 0) {
        return res.status(400).json({ error: 'Invalid message UID' });
      }

      const addrRes = await query('SELECT imap_password FROM temp_addresses WHERE id = $1', [req.tempUser.id]);
      const imapPassword = addrRes.rows[0]?.imap_password;
      if (!imapPassword) {
        return res.status(400).json({ error: 'Mailbox IMAP credentials not configured' });
      }

      client = await createConnection(req.tempUser.address, imapPassword);
      const msg = await fetchMessage(client, 'INBOX', uid);
      if (!msg || !msg.source) {
        return res.status(404).json({ error: 'Message not found' });
      }

      const parsed = await simpleParser(msg.source);

      const adminEmail = process.env.ADMIN_EMAIL;
      const adminPass = (process.env.ADMIN_PASSWORD || '').replace(/^['"]|['"]$/g, '');
      if (!adminEmail || !adminPass) {
        return res.status(500).json({ error: 'Mail forwarding credentials not configured' });
      }
      const transporter = createTransporter(adminEmail, adminPass);

      await sendEmail(transporter, {
        from: `"${req.tempUser.address} via WoxMail" <${adminEmail}>`,
        to,
        subject: `Fwd: ${parsed.subject || 'Disposable Email'}`,
        text: `--- Forwarded from ${req.tempUser.address} ---\n\n${parsed.text || ''}`,
        html: parsed.html || undefined,
      });

      res.json({ message: `Message forwarded to ${to}` });
    } catch (err) {
      next(err);
    } finally {
      if (client) await client.logout().catch(() => {});
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
