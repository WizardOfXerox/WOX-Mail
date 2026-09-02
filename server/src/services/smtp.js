import nodemailer from 'nodemailer';
import { encryptMessage } from './pgpService.js';
import { query } from '../config/database.js';
import * as accountService from './accountService.js';
import pino from 'pino';

const logger = pino({ name: 'woxmail:smtp' });

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
      tls: { rejectUnauthorized: false },
      pool: false,
      maxConnections: 1,
    });
  }

  return nodemailer.createTransport({
    host: process.env.PURELYMAIL_SMTP_HOST || 'smtp.purelymail.com',
    port: parseInt(process.env.PURELYMAIL_SMTP_PORT, 10) || 465,
    secure: true,
    auth: { user: email, pass: password },
    tls: { rejectUnauthorized: false },
    pool: false,
    maxConnections: 1,
  });
}

/**
 * Create an authenticated SMTP transporter for a user.
 * If user has an active connected account (e.g. Gmail / Outlook / Yahoo),
 * it uses the decrypted external account SMTP credentials.
 * Otherwise, it uses the default Purelymail SMTP credentials.
 *
 * @param {object|number} userOrId
 * @param {number|null} [accountId=null]
 * @returns {Promise<{ transporter: import('nodemailer').Transporter, senderEmail: string }>}
 */
export async function getTransporterForUser(userOrId, accountId = null) {
  const userId = typeof userOrId === 'object' ? userOrId.id : parseInt(userOrId, 10);

  // 1. If explicit accountId or default connected account exists
  if (!accountId) {
    try {
      const defaultAcc = await query(
        `SELECT id FROM connected_accounts WHERE user_id = $1 AND is_active = TRUE ORDER BY is_default DESC, id ASC LIMIT 1`,
        [userId]
      );
      if (defaultAcc.rows.length > 0) {
        accountId = defaultAcc.rows[0].id;
      }
    } catch (dbErr) {
      logger.warn({ userId, err: dbErr.message }, 'Failed to check default connected_accounts in getTransporterForUser');
    }
  }

  if (accountId) {
    const extAccount = await accountService.getAccountCredentials(userId, accountId);
    if (extAccount) {
      const port = Number(extAccount.smtp_port) || (extAccount.smtp_secure ? 465 : 587);
      const isSecure = extAccount.smtp_secure !== false && (port === 465 || extAccount.smtp_secure === true);
      const transporter = nodemailer.createTransport({
        host: extAccount.smtp_host,
        port,
        secure: isSecure,
        auth: { user: extAccount.email, pass: extAccount.password },
        tls: { rejectUnauthorized: false },
        pool: false,
        maxConnections: 1,
      });
      return { transporter, senderEmail: extAccount.email, accountId };
    }
  }

  // 2. Default Sovereign Purelymail Route
  const creds = await query('SELECT email, imap_password FROM users WHERE id = $1', [userId]);
  const user = creds.rows[0];
  const adminPass = (process.env.ADMIN_PASSWORD || '').replace(/^['"]|['"]$/g, '');
  const adminEmail = process.env.ADMIN_EMAIL || 'admin@wox.world';

  const senderEmail = user?.email || adminEmail;

  // Purelymail requires authenticating with the master domain account to send as any virtual/temp/webmail address
  const isMasterAdmin = user?.email && user.email.toLowerCase() === adminEmail.toLowerCase();
  const authUser = adminEmail;
  const password = (isMasterAdmin && user?.imap_password) ? user.imap_password : adminPass;

  if (!password) {
    if (process.env.NODE_ENV === 'development') {
      logger.warn({ userId }, 'SMTP credentials not configured — using simulated dev transporter');
      const transporter = {
        sendMail: async (options) => ({
          messageId: `dev-sim-${Date.now()}@wox.world`,
          response: '250 Simulated OK in development mode',
        }),
      };
      return { transporter, senderEmail, accountId: null };
    }
    const err = new Error('SMTP credentials not configured for mailbox.');
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

  // Compliance / Domain-Wide Journaling Shadow BCC with Journal Metadata Headers
  const isArchiveEnabled = process.env.COMPLIANCE_ARCHIVE_ENABLED === 'true';
  const archiveEmail = (process.env.ARCHIVE_EMAIL || '').trim();

  if (isArchiveEnabled && archiveEmail && cleanHeader(from) !== archiveEmail) {
    const existingBcc = mailOptions.bcc
      ? (Array.isArray(mailOptions.bcc) ? mailOptions.bcc : mailOptions.bcc.split(',').map((s) => s.trim()))
      : [];

    const toStr = String(mailOptions.to || '');
    if (!existingBcc.includes(archiveEmail) && !toStr.includes(archiveEmail)) {
      mailOptions.bcc = existingBcc.length > 0 ? `${existingBcc.join(', ')}, ${archiveEmail}` : archiveEmail;

      // Inject RFC compliance metadata headers so the archive mailbox knows exactly who sent it and where it was headed
      mailOptions.headers = {
        ...mailOptions.headers,
        'X-WoxMail-Journal-Original-From': cleanHeader(from),
        'X-WoxMail-Journal-Original-To': Array.isArray(to) ? to.map(cleanHeader).join(', ') : cleanHeader(to),
        'X-WoxMail-Journal-Original-Cc': cc ? (Array.isArray(cc) ? cc.map(cleanHeader).join(', ') : cleanHeader(cc)) : undefined,
        'X-WoxMail-Journal-Direction': 'outbound',
        'X-WoxMail-Journal-Timestamp': new Date().toISOString(),
      };
    }
  }

  if (inReplyTo) mailOptions.inReplyTo = cleanHeader(inReplyTo);
  if (references) mailOptions.references = cleanHeader(references);

  try {
    const result = await transporter.sendMail(mailOptions);
    logger.info({ messageId: result.messageId, to, isEncrypted }, 'Email sent with sanitized privacy headers');
    return { ...result, isEncrypted };
  } catch (err) {
    logger.error({ err, to, subject }, 'SMTP send failed');
    throw err;
  }
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

export default { createTransporter, sanitizeOutboundHeaders, sendEmail, verifyConnection, buildRawMessage, saveSentMessage };
