import nodemailer from 'nodemailer';
import { encryptMessage } from './pgpService.js';
import { query } from '../config/database.js';
import * as accountService from './accountService.js';
import { checkMtaStsPolicy, validateOutboundEncryption } from './mtaStsService.js';
import pino from 'pino';

const logger = pino({ name: 'woxmail:smtp' });

function getTlsOptions() {
  return {
    rejectUnauthorized: process.env.ALLOW_SELF_SIGNED_TLS !== 'true',
  };
}

/**
 * Create an SMTP transporter for a user with raw credentials.
 * @param {string} email - User email (SMTP username)
 * @param {string} password - User SMTP password
 * @returns {import('nodemailer').Transporter}
 */
export function createTransporter(email, password) {
  if (typeof email === 'object' && email !== null) {
    const config = email;
    return nodemailer.createTransport({
      host: config.host || process.env.PURELYMAIL_SMTP_HOST || 'smtp.purelymail.com',
      port: parseInt(config.port || process.env.PURELYMAIL_SMTP_PORT, 10) || 465,
      secure: config.secure !== false,
      auth: { user: config.email, pass: config.password },
      tls: getTlsOptions(),
      pool: false,
      maxConnections: 1,
    });
  }

  return nodemailer.createTransport({
    host: process.env.PURELYMAIL_SMTP_HOST || 'smtp.purelymail.com',
    port: parseInt(process.env.PURELYMAIL_SMTP_PORT, 10) || 465,
    secure: true,
    auth: { user: email, pass: password },
    tls: getTlsOptions(),
    pool: false,
    maxConnections: 1,
  });
}

/**
 * Create an authenticated SMTP transporter for a user.
 * If user has an active default connected account (e.g. Gmail / Outlook / Yahoo) or explicit accountId,
 * it uses the decrypted external account SMTP credentials.
 * Otherwise, it uses the default Purelymail SMTP credentials.
 *
 * @param {object|number} userOrId
 * @param {number|string|null} [accountId=null]
 * @returns {Promise<{ transporter: import('nodemailer').Transporter, senderEmail: string }>}
 */
export async function getTransporterForUser(userOrId, accountId = null) {
  const userId = typeof userOrId === 'object' ? userOrId.id : parseInt(userOrId, 10);

  let resolvedAccountId = null;
  const rawAcc = accountId !== undefined && accountId !== null ? String(accountId).trim() : '';
  const accLower = rawAcc.toLowerCase();

  if (accLower === 'primary' || accLower === 'default') {
    resolvedAccountId = null;
  } else if (rawAcc && accLower !== 'null' && accLower !== 'undefined') {
    if (!/^\d+$/.test(rawAcc)) {
      const err = new Error('Invalid account ID format.');
      err.status = 400;
      throw err;
    }
    resolvedAccountId = parseInt(rawAcc, 10);
  } else {
    // 1. Check only explicitly marked default connected account (never hijack primary with non-default accounts)
    try {
      const defaultAcc = await query(
        `SELECT id FROM connected_accounts WHERE user_id = $1 AND is_active = TRUE AND is_default = TRUE LIMIT 1`,
        [userId]
      );
      if (defaultAcc.rows.length > 0) {
        resolvedAccountId = defaultAcc.rows[0].id;
      }
    } catch (dbErr) {
      logger.warn({ userId, err: dbErr.message }, 'Failed to check default connected_accounts in getTransporterForUser');
    }
  }

  if (resolvedAccountId) {
    const extAccount = await accountService.getAccountCredentials(userId, resolvedAccountId);
    if (!extAccount) {
      const err = new Error('Connected account not found or inactive.');
      err.status = 404;
      throw err;
    }
    if (extAccount.provider === 'proton') {
      return {
        transporter: { isProton: true },
        isProton: true,
        senderEmail: extAccount.email,
        accountId: resolvedAccountId,
      };
    }
    const port = Number(extAccount.smtp_port) || (extAccount.smtp_secure ? 465 : 587);
    const isSecure = extAccount.smtp_secure !== false && (port === 465 || extAccount.smtp_secure === true);
    const transporter = nodemailer.createTransport({
      host: extAccount.smtp_host,
      port,
      secure: isSecure,
      auth: { user: extAccount.email, pass: extAccount.password },
      tls: getTlsOptions(),
      pool: false,
      maxConnections: 1,
    });
    return { transporter, senderEmail: extAccount.email, accountId: resolvedAccountId };
  }

  // 2. Default Sovereign Purelymail Route
  const creds = await query('SELECT email, imap_password, is_admin FROM users WHERE id = $1', [userId]);
  const user = creds.rows[0];
  if (!user) {
    const err = new Error('User not found for SMTP dispatch.');
    err.status = 404;
    throw err;
  }

  const adminPass = (process.env.ADMIN_PASSWORD || '').replace(/^['"]|['"]$/g, '');
  const adminEmail = process.env.ADMIN_EMAIL || 'admin@wox.world';
  const senderEmail = user.email || adminEmail;

  let authUser = user.email;
  let password = user.imap_password;

  if (!password && adminPass) {
    const isMasterAdmin = Boolean(user.is_admin) || (user.email && user.email.toLowerCase() === adminEmail.toLowerCase());
    let isVirtualOrAlias = false;
    if (!isMasterAdmin && senderEmail) {
      try {
        const aliasCheck = await query(
          `SELECT 1 FROM email_aliases WHERE user_id = $1 AND LOWER(alias_address) = LOWER($2) AND enabled = TRUE LIMIT 1`,
          [userId, senderEmail]
        );
        isVirtualOrAlias = aliasCheck.rows.length > 0;
      } catch {
        isVirtualOrAlias = false;
      }
    }
    if (isMasterAdmin || isVirtualOrAlias) {
      authUser = adminEmail;
      password = adminPass;
    }
  }

  if (!password) {
    const err = new Error('SMTP credentials are not configured for this mailbox. Configure your mailbox password or connect an external SMTP account.');
    err.status = 500;
    throw err;
  }

  const transporter = createTransporter({
    email: authUser,
    password,
  });
  return { transporter, senderEmail, accountId: null };
}

/**
 * Sanitize outbound email headers to strip client IP, local hostname, and browser fingerprints.
 * @param {object} customHeaders
 * @returns {object} Privacy-hardened headers
 */
export function sanitizeOutboundHeaders(customHeaders = {}) {
  const sanitized = {
    'User-Agent': 'WoxMail Privacy Gateway / 1.0',
    'X-Mailer': 'WoxMail Privacy Gateway',
    'X-Privacy-Protected': 'true',
    ...customHeaders,
  };

  // Remove any leaked IP or telemetry headers
  const forbiddenHeaders = [
    'x-originating-ip',
    'x-forwarded-for',
    'x-real-ip',
    'x-client-ip',
    'x-sender-ip',
    'x-php-originating-script',
    'x-envoy-external-address',
  ];

  for (const key of Object.keys(sanitized)) {
    if (forbiddenHeaders.includes(key.toLowerCase())) {
      delete sanitized[key];
    }
  }

  return sanitized;
}

/**
 * Send an email with automatic header stripping and optional OpenPGP encryption.
 * @param {import('nodemailer').Transporter} transporter
 * @param {object} options
 * @param {string} options.from - Sender (user's email or alias)
 * @param {string|string[]} options.to - Recipients
 * @param {string} [options.cc] - CC recipients
 * @param {string} [options.bcc] - BCC recipients
 * @param {string} options.subject - Subject line
 * @param {string} [options.text] - Plain text body
 * @param {string} [options.html] - HTML body
 * @param {string} [options.inReplyTo] - Message-ID being replied to
 * @param {string} [options.references] - References header (for threading)
 * @param {Array} [options.attachments] - Nodemailer attachment objects
 * @param {string} [options.pgpPublicKey] - Recipient's armored PGP public key for auto-encryption
 * @param {object} [options.headers] - Extra custom headers
 * @returns {Promise<object>} Send result with messageId
 */
export async function sendEmail(transporter, options) {
  let {
    from, to, cc, bcc, subject,
    text, html, inReplyTo, references, attachments, pgpPublicKey, headers,
  } = options;

  // Auto-encrypt with OpenPGP if public key is provided
  let isEncrypted = false;
  if (pgpPublicKey) {
    try {
      const contentToEncrypt = text || (html ? html.replace(/<[^>]+>/g, '') : '');
      const encryptedArmored = await encryptMessage(contentToEncrypt, pgpPublicKey);
      text = encryptedArmored;
      html = `<pre style="font-family: monospace; word-break: break-all; white-space: pre-wrap;">${encryptedArmored}</pre>`;
      isEncrypted = true;
      logger.info({ to }, 'Email encrypted with OpenPGP public key before dispatch');
    } catch (err) {
      logger.warn({ err: err.message, to }, 'PGP encryption skipped due to key error — falling back to plain text');
    }
  }

  // RFC 5322 & SMTP Header Injection Defense: Strip raw CRLF from headers
  const cleanHeader = (val) => (typeof val === 'string' ? val.replace(/[\r\n]+/g, ' ').trim() : val);
  const sanitizedSubject = cleanHeader(subject);

  // Build sanitized mail options
  const mailOptions = {
    from: cleanHeader(from),
    replyTo: options.replyTo ? cleanHeader(options.replyTo) : cleanHeader(from),
    to: Array.isArray(to) ? to.map(cleanHeader).join(', ') : cleanHeader(to),
    subject: isEncrypted && !sanitizedSubject.startsWith('[Encrypted]') ? `[Encrypted] ${sanitizedSubject}` : sanitizedSubject,
    text: text || '',
    html: html || undefined,
    attachments: attachments || [],
    date: new Date(), // Normalized UTC timestamp
    headers: sanitizeOutboundHeaders(headers),
  };

  if (cc) mailOptions.cc = Array.isArray(cc) ? cc.map(cleanHeader).join(', ') : cleanHeader(cc);
  if (bcc) mailOptions.bcc = Array.isArray(bcc) ? bcc.map(cleanHeader).join(', ') : cleanHeader(bcc);

  if (inReplyTo) mailOptions.inReplyTo = cleanHeader(inReplyTo);
  if (references) mailOptions.references = cleanHeader(references);

  // MTA-STS (RFC 8461) Policy Validation Check
  try {
    const primaryRecipient = Array.isArray(to) ? to[0] : (typeof to === 'string' ? to.split(',')[0].trim() : '');
    if (primaryRecipient && primaryRecipient.includes('@')) {
      const targetDomain = primaryRecipient.split('@')[1];
      const mtaSts = await checkMtaStsPolicy(targetDomain);
      if (mtaSts && mtaSts.mode === 'enforce') {
        mailOptions.headers['X-MTA-STS-Policy'] = 'enforce';
        logger.info({ targetDomain, mode: mtaSts.mode }, 'MTA-STS policy enforced for outbound delivery');
      }
    }
  } catch (mtaErr) {
    logger.debug({ err: mtaErr.message }, 'MTA-STS pre-flight check skipped');
  }

  let result;
  try {
    result = await transporter.sendMail(mailOptions);
    logger.info({ messageId: result.messageId, to, isEncrypted }, 'Email sent with sanitized privacy headers');
  } catch (err) {
    logger.error({ err, to, subject }, 'SMTP send failed');
    throw err;
  }

  // Compliance / Domain-Wide Journaling: send a SEPARATE internal journal copy
  // so X-WoxMail-Journal-* metadata headers are never leaked to external recipients.
  const isArchiveEnabled = process.env.COMPLIANCE_ARCHIVE_ENABLED === 'true';
  const archiveEmail = (process.env.ARCHIVE_EMAIL || '').trim();
  const archiveLower = archiveEmail.toLowerCase();

  if (isArchiveEnabled && archiveEmail && cleanHeader(from).toLowerCase() !== archiveLower) {
    const toStr = String(mailOptions.to || '').toLowerCase();
    const bccStr = String(mailOptions.bcc || '').toLowerCase();
    if (!toStr.includes(archiveLower) && !bccStr.includes(archiveLower)) {
      const journalHeaders = {
        ...mailOptions.headers,
        'X-WoxMail-Journal-Original-From': cleanHeader(from),
        'X-WoxMail-Journal-Original-To': Array.isArray(to) ? to.map(cleanHeader).join(', ') : cleanHeader(to),
        'X-WoxMail-Journal-Direction': 'outbound',
        'X-WoxMail-Journal-Timestamp': new Date().toISOString(),
      };
      if (cc) {
        journalHeaders['X-WoxMail-Journal-Original-Cc'] = Array.isArray(cc) ? cc.map(cleanHeader).join(', ') : cleanHeader(cc);
      }

      const journalOptions = {
        ...mailOptions,
        to: archiveEmail,
        cc: undefined,
        bcc: undefined,
        headers: journalHeaders,
      };
      if (result.messageId) {
        journalOptions.messageId = result.messageId;
      }

      try {
        await transporter.sendMail(journalOptions);
      } catch (journalErr) {
        logger.warn({ err: journalErr.message, archiveEmail }, 'Compliance journal copy dispatch failed');
      }
    }
  }

  return { ...result, isEncrypted };
}

/**
 * Compile email options into a raw RFC822 Buffer.
 * @param {object} mailOptions
 * @returns {Promise<Buffer>}
 */
export async function buildRawMessage(mailOptions) {
  const streamer = nodemailer.createTransport({ streamTransport: true, buffer: true });
  const info = await streamer.sendMail({
    ...mailOptions,
    headers: sanitizeOutboundHeaders(mailOptions.headers || {}),
  });
  return info.message;
}

/**
 * Save sent message copy to user's IMAP Sent folder.
 * @param {import('imapflow').ImapFlow} client
 * @param {object} mailOptions
 */
export async function saveSentMessage(client, mailOptions) {
  if (!client) return;

  // Gmail, Google Workspace, and Outlook/Office365 SMTP automatically save sent messages
  // to the user's Sent Mail folder upon dispatch. Appending via IMAP creates an identical duplicate sent email.
  const host = (client.options?.host || '').toLowerCase();
  const sender = (mailOptions.from || '').toLowerCase();
  if (
    host.includes('gmail.com') ||
    host.includes('googlemail.com') ||
    host.includes('office365.com') ||
    host.includes('outlook.com') ||
    sender.endsWith('@gmail.com') ||
    sender.endsWith('@googlemail.com')
  ) {
    logger.debug({ host, sender }, 'Skipping IMAP append for provider that auto-saves sent messages');
    return;
  }

  try {
    const { appendSentMessage } = await import('./imap.js');
    const rawBuffer = await buildRawMessage(mailOptions);
    await appendSentMessage(client, rawBuffer);
    logger.info({ subject: mailOptions.subject, to: mailOptions.to }, 'Appended sent message to user Sent folder');
  } catch (err) {
    logger.warn({ err: err.message, subject: mailOptions.subject }, 'Failed to save sent message copy to Sent folder');
  }
}

/**
 * Verify SMTP connection (test credentials).
 * @param {import('nodemailer').Transporter} transporter
 * @returns {Promise<boolean>}
 */
export async function verifyConnection(transporter) {
  try {
    await transporter.verify();
    return true;
  } catch {
    return false;
  }
}

export default {
  createTransporter,
  sanitizeOutboundHeaders,
  sendEmail,
  verifyConnection,
  buildRawMessage,
  saveSentMessage,
  checkMtaStsPolicy,
  validateOutboundEncryption,
};
