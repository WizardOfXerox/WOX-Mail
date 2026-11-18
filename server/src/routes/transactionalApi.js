import { Router } from 'express';
import crypto from 'crypto';
import { requireAuth } from '../middleware/auth.js';
import * as apiKeyService from '../services/apiKeyService.js';
import * as attachmentDedup from '../services/attachmentDedup.js';
import { sendEmail, createTransporter } from '../services/smtp.js';
import { query } from '../config/database.js';
import pino from 'pino';

const logger = pino({ name: 'woxmail:transactional-api' });
const router = Router();
const BLOCKED_CUSTOM_HEADERS = new Set(['from', 'sender', 'return-path', 'to', 'cc', 'bcc', 'dkim-signature', 'received']);

function safeErrorMsg(err, fallback) {
  return process.env.NODE_ENV === 'production' ? fallback : (err?.message || fallback);
}

/**
 * Middleware: Verify Bearer token against Developer API Keys
 */
export async function requireApiKey(req, res, next) {
  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return res.status(401).json({
      error: 'Unauthorized: Missing or malformed Bearer token. Use Authorization: Bearer wox_...'
    });
  }

  const token = authHeader.substring(7).trim();
  try {
    const keyRecord = await apiKeyService.authenticateApiKey(token);
    req.apiKey = keyRecord;
    req.userId = keyRecord.user_id;
    next();
  } catch (err) {
    const status = err.status || 401;
    return res.status(status).json({ error: err.message });
  }
}

// ─── API Key Management (Authenticated Web Session) ─────────────────────────

// POST /api/settings/api-keys - Generate a new API key
router.post('/settings/api-keys', requireAuth, async (req, res) => {
  try {
    if (req.isAppPasswordAuth) {
      return res.status(403).json({ error: 'Application passwords cannot manage API keys' });
    }
    const { name, rateLimit = 100, permissions } = req.body;
    if (!name) {
      return res.status(400).json({ error: 'Key name is required' });
    }

    const clampedRateLimit = Math.min(1000, Math.max(1, parseInt(rateLimit, 10) || 100));
    const key = await apiKeyService.createApiKey(req.userId, {
      name,
      rateLimit: clampedRateLimit,
      permissions
    });

    res.status(201).json({ success: true, key });
  } catch (err) {
    logger.error({ err: err.message }, 'Failed to create API key');
    res.status(500).json({ error: safeErrorMsg(err, 'Failed to create API key') });
  }
});

// GET /api/settings/api-keys - List existing keys
router.get('/settings/api-keys', requireAuth, async (req, res) => {
  try {
    const keys = await apiKeyService.listApiKeys(req.userId);
    res.json({ success: true, keys });
  } catch (err) {
    logger.error({ err: err.message }, 'Failed to list API keys');
    res.status(500).json({ error: safeErrorMsg(err, 'Failed to list API keys') });
  }
});

// DELETE /api/settings/api-keys/:id - Revoke an API key
router.delete('/settings/api-keys/:id', requireAuth, async (req, res) => {
  try {
    const ok = await apiKeyService.revokeApiKey(req.userId, req.params.id);
    if (!ok) {
      return res.status(404).json({ error: 'API key not found' });
    }
    res.json({ success: true, message: 'API key revoked' });
  } catch (err) {
    logger.error({ err: err.message }, 'Failed to revoke API key');
    res.status(500).json({ error: safeErrorMsg(err, 'Failed to revoke API key') });
  }
});

// ─── Transactional v1 API (Developer Bearer Token) ─────────────────────────

// GET /api/v1/status - Ping endpoint
router.get('/v1/status', requireApiKey, (req, res) => {
  res.json({
    status: 'ok',
    authenticatedAs: req.apiKey.user_email,
    keyName: req.apiKey.name,
    keyPrefix: req.apiKey.key_prefix,
    rateLimitPerHour: req.apiKey.rate_limit,
    timestamp: new Date().toISOString()
  });
});

// POST /api/v1/send - Dispatch transactional email
router.post('/v1/send', requireApiKey, async (req, res) => {
  try {
    // Enforce API key send permission / scope
    const perms = req.apiKey?.permissions || {};
    const hasSendPermission =
      perms.send === true ||
      (Array.isArray(perms.scopes) && (perms.scopes.includes('mail:send') || perms.scopes.includes('*'))) ||
      (perms.send === undefined && !Array.isArray(perms.scopes));
    if (!hasSendPermission) {
      return res.status(403).json({ error: 'API key does not have permission to send emails' });
    }

    const { to, cc, bcc, subject, html, text, attachments = [], replyTo, headers = {} } = req.body;

    if (!to || !subject || (!html && !text)) {
      return res.status(400).json({
        error: 'Missing required fields: to, subject, and at least one of html or text are required'
      });
    }

    // Retrieve sender account info
    const userRes = await query(
      `SELECT email, imap_password, is_admin FROM users WHERE id = $1`,
      [req.userId]
    );
    if (userRes.rows.length === 0) {
      return res.status(404).json({ error: 'Associated user account not found' });
    }

    const senderEmail = userRes.rows[0].email;
    const senderPass = userRes.rows[0].imap_password || (userRes.rows[0].is_admin ? (process.env.ADMIN_PASSWORD || '').replace(/^['"]|['"]$/g, '') : null);
    if (!senderPass) {
      return res.status(400).json({ error: 'Mailbox credentials not configured for sending' });
    }

    // Process attachments & deduplicate
    const normalizedAttachments = [];
    if (Array.isArray(attachments)) {
      if (attachments.length > 20) {
        return res.status(400).json({ error: 'Too many attachments (maximum 20)' });
      }
      for (const att of attachments) {
        if (!att || !att.filename || att.content === undefined || att.content === null) continue;
        const isExplicitUtf8 = att.encoding === 'utf-8' || att.encoding === 'utf8';
        const isExplicitBase64 = att.encoding === 'base64';
        let encoding = 'utf-8';
        if (isExplicitBase64) {
          encoding = 'base64';
        } else if (!isExplicitUtf8 && typeof att.content === 'string' && /^[A-Za-z0-9+/=\r\n]+$/.test(att.content) && att.content.length % 4 === 0 && att.content.length > 32) {
          encoding = 'base64';
        }

        const buffer = Buffer.isBuffer(att.content)
          ? att.content
          : Buffer.from(String(att.content), encoding);

        // Deduplicate in user's attachment store
        await attachmentDedup.storeAttachment(
          req.userId,
          att.filename,
          att.contentType || 'application/octet-stream',
          buffer
        ).catch((err) => logger.debug({ err: err.message }, 'Deduplication store note'));

        normalizedAttachments.push({
          filename: String(att.filename).replace(/[\r\n\x00/\\]/g, '_'),
          content: buffer,
          contentType: String(att.contentType || 'application/octet-stream').replace(/[\r\n\x00]/g, '')
        });
      }
    }

    const transporter = createTransporter(senderEmail, senderPass);
    const safeCustomHeaders = {};
    if (headers && typeof headers === 'object' && !Array.isArray(headers)) {
      for (const [k, v] of Object.entries(headers)) {
        if (BLOCKED_CUSTOM_HEADERS.has(String(k).toLowerCase())) continue;
        safeCustomHeaders[k] = v;
      }
    }
    const customHeaders = {
      ...safeCustomHeaders,
      'X-Mailer': 'WoxMail-Transactional-v1',
      'X-API-Key-Prefix': req.apiKey.key_prefix,
    };

    const sendRes = await sendEmail(transporter, {
      from: `"${String(req.apiKey.name || 'WoxMail').replace(/["\r\n]/g, '')}" <${senderEmail}>`,
      to,
      cc,
      bcc,
      subject,
      text: text || '',
      html: html || '',
      replyTo: replyTo || senderEmail,
      attachments: normalizedAttachments,
      headers: customHeaders
    });

    res.json({
      success: true,
      messageId: sendRes?.messageId || `wox_${Date.now()}_${crypto.randomBytes(6).toString('hex')}`,
      status: 'sent',
      timestamp: new Date().toISOString()
    });
  } catch (err) {
    logger.error({ err: err.message }, 'Failed to dispatch transactional email');
    res.status(500).json({ error: safeErrorMsg(err, 'Failed to dispatch transactional email') });
  }
});

export default router;
