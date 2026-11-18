import { Router } from 'express';
import { requireAuth } from '../middleware/auth.js';
import {
  authenticateProtonAccount,
  submitProton2FA,
  getProtonMessages,
  getProtonMessageDetails,
  sendProtonMail,
  getProtonAddresses,
  getProtonSessionKey,
  activeSessions,
} from '../services/protonServerSync.js';
import * as complianceArchiveService from '../services/complianceArchiveService.js';
import { query } from '../config/database.js';
import { encryptCredentials, decryptCredentials } from '../services/accountService.js';

const router = Router();
router.use(requireAuth);

const PROTON_API_HOST = 'mail.proton.me';
const PROTON_BASE_URL = `https://${PROTON_API_HOST}/api`;

function cleanRequestedEmail(raw) {
  if (!raw || raw === 'undefined' || raw === 'null') return null;
  const trimmed = String(raw).trim().toLowerCase();
  return trimmed || null;
}

function isProtonDomainEmail(email) {
  if (!email) return false;
  return (
    email.endsWith('@proton.me') ||
    email.endsWith('@pm.me') ||
    email.endsWith('@protonmail.com') ||
    email.endsWith('@protonmail.ch') ||
    email.endsWith('@proton.ch')
  );
}

/**
 * Resolve and authorize the Proton email for the authenticated user.
 * Enforces strict tenant ownership against connected_accounts (user_id = req.user.id),
 * active user-scoped Playwright sessions, or req.user.email.
 */
async function resolveAuthorizedProtonAccount(req, requestedEmailRaw) {
  const userId = req.user.id;
  const userPrimaryEmail = cleanRequestedEmail(req.user.email);
  const requestedEmail = cleanRequestedEmail(requestedEmailRaw);

  if (requestedEmail) {
    const connRes = await query(
      `SELECT email, credentials_encrypted, iv, auth_tag FROM connected_accounts
       WHERE LOWER(email) = $1 AND user_id = $2 AND provider = 'proton' AND is_active = TRUE LIMIT 1`,
      [requestedEmail, userId]
    );
    if (connRes.rows.length > 0) {
      return { authorized: true, email: requestedEmail, accountRow: connRes.rows[0] };
    }
    if (activeSessions.has(getProtonSessionKey(requestedEmail, userId))) {
      return { authorized: true, email: requestedEmail, accountRow: null };
    }
    if (userPrimaryEmail && requestedEmail === userPrimaryEmail) {
      return { authorized: true, email: requestedEmail, accountRow: null };
    }
    return { authorized: false, email: requestedEmail, accountRow: null };
  }

  // No explicit email requested — find user's own connected Proton account
  const ownConn = await query(
    `SELECT email, credentials_encrypted, iv, auth_tag FROM connected_accounts
     WHERE user_id = $1 AND provider = 'proton' AND is_active = TRUE
     ORDER BY is_default DESC, id ASC LIMIT 1`,
    [userId]
  );
  if (ownConn.rows.length > 0) {
    return {
      authorized: true,
      email: ownConn.rows[0].email.toLowerCase().trim(),
      accountRow: ownConn.rows[0],
    };
  }

  // Fallback to active in-memory session owned by this userId
  const userPrefix = `${userId}:`;
  for (const [key, session] of activeSessions.entries()) {
    if (key.startsWith(userPrefix) && session?.emailKey) {
      return { authorized: true, email: session.emailKey, accountRow: null };
    }
  }

  if (userPrimaryEmail && isProtonDomainEmail(userPrimaryEmail)) {
    return { authorized: true, email: userPrimaryEmail, accountRow: null };
  }

  return { authorized: true, email: null, accountRow: null };
}

/**
 * 0. Check live session status (with user-scoped auto-resume from connected_accounts if needed)
 */
router.get('/sync/status', async (req, res, next) => {
  try {
    const requested = req.query.email || req.headers['x-proton-email'];
    const authCheck = await resolveAuthorizedProtonAccount(req, requested);

  if (!authCheck.authorized) {
    return res.status(403).json({ active: false, error: 'Access denied: Proton account does not belong to current user.' });
  }
  if (!authCheck.email) {
    return res.json({ active: false });
  }

  const email = authCheck.email;
  const sessionKey = getProtonSessionKey(email, req.user.id);
  let session = activeSessions.get(sessionKey);
  let isSessionActive = Boolean(session && !session.pending2FA && session.page && !session.page.isClosed());

  // If memory session is lost (e.g. server restart), auto-restore from saved user-owned credentials
  if (!isSessionActive && !session?.pending2FA && authCheck.accountRow?.credentials_encrypted) {
    try {
      const { credentials_encrypted, iv, auth_tag } = authCheck.accountRow;
      const pass = decryptCredentials(credentials_encrypted, iv, auth_tag);
      if (pass) {
        await authenticateProtonAccount(email, pass, req.user.id);
        session = activeSessions.get(sessionKey);
        isSessionActive = Boolean(session && !session.pending2FA && session.page && !session.page.isClosed());
      }
    } catch (restoreErr) {
      console.warn('[ProtonSync] Auto-resume failed:', restoreErr.message);
    }
  }

  return res.json({
    active: isSessionActive,
    requires2FA: Boolean(session?.pending2FA),
    email,
  });
  } catch (err) {
    next(err);
  }
});

/**
 * 1. Proton Direct Cloud Session Login
 */
router.post('/login', async (req, res) => {
  const email = cleanRequestedEmail(req.body.email) || cleanRequestedEmail(req.user?.email);
  const password = req.body.password;
  if (!email || !password) {
    return res.status(400).json({ error: 'Email and password are required.' });
  }

  try {
    const result = await authenticateProtonAccount(email, password, req.user.id);

    if (result.requires2FA) {
      return res.json({
        requires2FA: true,
        email,
        message: 'Two-factor authentication code required. Submit via POST /api/proton/sync/2fa.',
      });
    }

    // Persist encrypted credentials scoped exclusively to req.user.id
    try {
      const { ciphertext, iv, authTag } = encryptCredentials(password);
      await query(`
        INSERT INTO connected_accounts (
          user_id, provider, email, display_name, imap_host, imap_port, imap_secure, smtp_host, smtp_port, smtp_secure,
          auth_type, credentials_encrypted, iv, auth_tag, is_default, is_active, color, created_at, updated_at
        ) VALUES (
          $1, 'proton', $2, 'Proton Mail', 'mail-api.proton.me', 993, true, 'mail-api.proton.me', 465, true,
          'password', $3, $4, $5, false, true, '#6d4aff', NOW(), NOW()
        )
        ON CONFLICT (user_id, email) DO UPDATE SET
          credentials_encrypted = EXCLUDED.credentials_encrypted,
          iv = EXCLUDED.iv,
          auth_tag = EXCLUDED.auth_tag,
          is_active = TRUE,
          updated_at = NOW()
      `, [req.user.id, email, ciphertext, iv, authTag]);
    } catch (dbErr) {
      console.warn('[ProtonSync] Storing credentials warning:', dbErr.message);
    }

    return res.json({
      ...result,
      accessToken: result.uid || 'proton-session-token',
    });
  } catch (err) {
    console.error('[ProtonSync] Login error:', err.message);
    return res.status(401).json({ error: err.message });
  }
});

/**
 * 1b. Submit TOTP 2FA code for pending Playwright Proton login
 */
router.post('/sync/2fa', async (req, res, next) => {
  try {
    const requested = req.body?.email || req.query.email || req.headers['x-proton-email'];
    const code = req.body?.code || req.body?.totp;
    if (!code || typeof code !== 'string') {
      return res.status(400).json({ error: '2FA code is required.' });
    }

    const authCheck = await resolveAuthorizedProtonAccount(req, requested);
    if (!authCheck.authorized) {
      return res.status(403).json({ error: 'Access denied: Proton account does not belong to current user.' });
    }
    if (!authCheck.email) {
      return res.status(400).json({ error: 'Proton account email required.' });
    }

    const result = await submitProton2FA(authCheck.email, code, req.user.id);
    return res.json({
      ...result,
      accessToken: result.uid || 'proton-session-token',
    });
  } catch (err) {
    console.error('[ProtonSync] 2FA error:', err.message);
    return res.status(401).json({ error: err.message });
  }
});

/**
 * 2. Fetch live messages / conversations
 */
router.get('/sync/messages', async (req, res) => {
  const requested = req.query.email || req.headers['x-proton-email'];
  const authCheck = await resolveAuthorizedProtonAccount(req, requested);

  if (!authCheck.authorized) {
    return res.status(403).json({ error: 'Access denied: Proton account does not belong to current user.' });
  }
  if (!authCheck.email) {
    return res.status(400).json({ error: 'Proton account email required.' });
  }

  const labelId = req.query.LabelID || req.query.labelId || '0';
  const page = parseInt(req.query.Page || '0', 10);
  const pageSize = parseInt(req.query.PageSize || '25', 10);

  try {
    const data = await getProtonMessages(authCheck.email, labelId, page, pageSize, req.user.id);
    return res.json(data);
  } catch (err) {
    console.error('[ProtonSync] Messages error:', err.message);
    return res.status(500).json({ error: err.message });
  }
});

/**
 * 3. Fetch message details
 */
router.get('/sync/messages/:id', async (req, res) => {
  const requested = req.query.email || req.headers['x-proton-email'];
  const authCheck = await resolveAuthorizedProtonAccount(req, requested);

  if (!authCheck.authorized) {
    return res.status(403).json({ error: 'Access denied: Proton account does not belong to current user.' });
  }
  if (!authCheck.email) {
    return res.status(400).json({ error: 'Proton account email required.' });
  }

  const { id } = req.params;

  try {
    const data = await getProtonMessageDetails(authCheck.email, id, req.user.id);
    return res.json(data);
  } catch (err) {
    console.error('[ProtonSync] Message detail error:', err.message);
    return res.status(500).json({ error: err.message });
  }
});

/**
 * 4. Fetch Proton addresses & aliases
 */
router.get('/addresses', async (req, res) => {
  const requested = req.query.email || req.headers['x-proton-email'];
  const authCheck = await resolveAuthorizedProtonAccount(req, requested);

  if (!authCheck.authorized) {
    return res.status(403).json({ error: 'Access denied: Proton account does not belong to current user.' });
  }
  if (!authCheck.email) {
    return res.status(400).json({ error: 'Proton account email required.' });
  }

  try {
    const data = await getProtonAddresses(authCheck.email, req.user.id);
    return res.json(data);
  } catch (err) {
    console.error('[ProtonSync] Addresses error:', err.message);
    return res.status(500).json({ error: err.message });
  }
});

/**
 * 5. Send email via Proton Mail session
 */
router.post('/send', async (req, res) => {
  const { email, from, to, cc, bcc, subject, text, html, attachments } = req.body;
  const cleanFrom = from ? (from.includes('<') ? from.replace(/.*<([^>]+)>.*/, '$1').trim() : from.trim()) : null;
  const requested = email || req.headers['x-proton-email'] || cleanFrom;

  const authCheck = await resolveAuthorizedProtonAccount(req, requested);
  if (!authCheck.authorized) {
    return res.status(403).json({ error: 'Access denied: Proton account does not belong to current user.' });
  }
  if (!authCheck.email) {
    return res.status(400).json({ error: 'Proton account email required.' });
  }
  if (!to) {
    return res.status(400).json({ error: 'Recipient email is required.' });
  }

  const targetEmail = authCheck.email;

  try {
    const result = await sendProtonMail(targetEmail, { from, to, cc, bcc, subject, text, html, attachments }, req.user.id);

    // Record outbound Proton email in Domain-Wide Compliance Archive
    complianceArchiveService.archiveEmail({
      direction: 'outbound',
      mailboxOwnerId: req.user.id,
      mailboxOwnerEmail: targetEmail,
      senderAddress: from || targetEmail,
      senderName: from || targetEmail,
      recipientAddresses: Array.isArray(to) ? to : [to],
      ccAddresses: cc ? (Array.isArray(cc) ? cc : [cc]) : [],
      bccAddresses: bcc ? (Array.isArray(bcc) ? bcc : [bcc]) : [],
      subject,
      bodyHtml: html,
      bodyText: text,
      attachments: attachments || [],
      provider: 'proton',
      messageId: result.messageId || `proton-out-${Date.now()}`,
    }).catch((err) => console.warn('[ProtonArchive] Record notice:', err.message));

    return res.json(result);
  } catch (err) {
    console.error('[ProtonSync] Send mail error:', err.message);
    return res.status(500).json({ error: err.message });
  }
});

/**
 * Validate proxy subpath strictly to prevent host overrides, traversal, or CRLF injection.
 */
function buildValidatedProtonUrl(rawSubpath) {
  if (typeof rawSubpath !== 'string') return null;
  if (/[\r\n\\]|%0[ad]/i.test(rawSubpath)) return null;

  const [rawPathOnly] = rawSubpath.split('?');
  if (!rawPathOnly || rawPathOnly.startsWith('//') || rawPathOnly.includes('@')) return null;
  let decodedPath = rawPathOnly;
  try {
    decodedPath = decodeURIComponent(rawPathOnly);
  } catch {
    return null;
  }
  if (
    rawPathOnly.split('/').some((seg) => seg === '..' || seg === '.') ||
    decodedPath.split('/').some((seg) => seg === '..' || seg === '.') ||
    /%2e/i.test(rawPathOnly)
  ) {
    return null;
  }

  const normalizedSubpath = rawSubpath.startsWith('/') ? rawSubpath : `/${rawSubpath}`;
  let parsed;
  try {
    parsed = new URL(`${PROTON_BASE_URL}${normalizedSubpath}`);
  } catch {
    return null;
  }

  if (parsed.protocol !== 'https:' || parsed.hostname !== PROTON_API_HOST) return null;
  if (parsed.username !== '' || parsed.password !== '') return null;
  if (parsed.pathname !== '/api' && !parsed.pathname.startsWith('/api/')) return null;

  return parsed.toString();
}

/**
 * Transparent Stateless Proxy for Proton Mail API v4.
 * Forwards authenticated requests to https://mail.proton.me/api
 */
router.all('/*', async (req, res) => {
  const url = buildValidatedProtonUrl(req.url || '/');
  if (!url) {
    return res.status(400).json({ error: 'Invalid Proton proxy target path.' });
  }

  const headers = {
    'Accept': 'application/vnd.protonmail.v1+json',
    'x-pm-appversion': 'linux-bridge@3.4.0',
    'x-pm-apiversion': '3',
    'User-Agent': 'ProtonBridge/3.4.0',
  };

  if (req.headers['authorization'] && !/[\r\n]/.test(String(req.headers['authorization']))) {
    headers['Authorization'] = req.headers['authorization'];
  }
  if (req.headers['x-pm-uid'] && !/[\r\n]/.test(String(req.headers['x-pm-uid']))) {
    headers['x-pm-uid'] = req.headers['x-pm-uid'];
  }
  if (req.headers['content-type'] && !/[\r\n]/.test(String(req.headers['content-type']))) {
    headers['Content-Type'] = req.headers['content-type'];
  }

  try {
    const fetchOptions = {
      method: req.method,
      headers,
      redirect: 'manual',
      signal: AbortSignal.timeout(15000),
    };

    if (['POST', 'PUT', 'PATCH'].includes(req.method) && req.body) {
      if (typeof req.body === 'object' && Object.keys(req.body).length > 0) {
        fetchOptions.body = JSON.stringify(req.body);
        headers['Content-Type'] = 'application/json';
      }
    }

    const response = await fetch(url, fetchOptions);
    const contentType = response.headers.get('content-type') || '';

    res.status(response.status);

    if (contentType.includes('application/json')) {
      const data = await response.json();
      return res.json(data);
    } else {
      const contentLen = Number(response.headers.get('content-length') || 0);
      if (contentLen > 25 * 1024 * 1024) {
        await response.body?.cancel?.().catch(() => {});
        return res.status(413).json({ error: 'Upstream Proton response exceeds 25 MB limit' });
      }
      const arrayBuffer = await response.arrayBuffer();
      const buffer = Buffer.from(arrayBuffer);
      if (buffer.length > 25 * 1024 * 1024) {
        return res.status(413).json({ error: 'Upstream Proton response exceeds 25 MB limit' });
      }
      const safeType = /^text\/html|image\/svg\+xml|application\/xhtml\+xml/i.test(contentType)
        ? 'application/octet-stream'
        : contentType;
      if (safeType) res.setHeader('Content-Type', safeType);
      res.setHeader('X-Content-Type-Options', 'nosniff');
      return res.send(buffer);
    }
  } catch (err) {
    console.error('[ProtonProxy] Network relay error:', err.message);
    return res.status(502).json({
      error: 'Proton Mail API proxy relay failure',
      ...(process.env.NODE_ENV !== 'production' ? { details: err.message } : {}),
    });
  }
});

export default router;
