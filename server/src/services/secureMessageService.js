import crypto from 'crypto';
import argon2 from 'argon2';
import pino from 'pino';
import { query, getClient } from '../config/database.js';
import { createTransporter, sendEmail, saveSentMessage } from './smtp.js';

const logger = pino({ name: 'woxmail:secure-messages' });

// Master derivation salt from environment
const MASTER_SECRET = process.env.SESSION_SECRET || crypto.randomBytes(32).toString('hex');

/**
 * Derive per-message AES-256 key deterministically from publicToken + MASTER_SECRET
 */
function deriveMessageKey(publicToken) {
  return crypto.createHmac('sha256', MASTER_SECRET).update(publicToken).digest();
}

/**
 * Encrypt message content using AES-256-GCM
 */
function encryptContent(text, publicToken) {
  const key = deriveMessageKey(publicToken);
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv('aes-256-gcm', key, iv);
  
  let encrypted = cipher.update(text, 'utf8', 'hex');
  encrypted += cipher.final('hex');
  const authTag = cipher.getAuthTag().toString('hex');

  return {
    encryptedContent: encrypted,
    iv: iv.toString('hex'),
    authTag,
  };
}

/**
 * Decrypt message content using AES-256-GCM
 */
function decryptContent(encryptedContent, ivHex, authTagHex, publicToken) {
  const key = deriveMessageKey(publicToken);
  const iv = Buffer.from(ivHex, 'hex');
  const authTag = Buffer.from(authTagHex, 'hex');

  const decipher = crypto.createDecipheriv('aes-256-gcm', key, iv);
  decipher.setAuthTag(authTag);

  let decrypted = decipher.update(encryptedContent, 'hex', 'utf8');
  decrypted += decipher.final('utf8');
  return decrypted;
}

/**
 * Create and dispatch a new Secure Locked Email
 */
export async function createSecureMessage({
  senderId,
  senderEmail,
  recipientEmail,
  subject,
  content,
  passcode,
  pin,
  expirationHours = 24,
  destroyAfterRead = false,
  burnAfterRead = false,
  watermarkEnabled = true,
  reqIp = '127.0.0.1',
  userAgent = 'Unknown',
}) {
  const rawCode = (passcode || pin || '').toString().trim();
  if (!rawCode) {
    throw new Error('A PIN or Passcode is required to lock the confidential message');
  }

  const willDestroy = destroyAfterRead === true || burnAfterRead === true;
  const configuredMaxViews = willDestroy ? 1 : (parseInt(maxViews, 10) || (destroyAfterRead === false ? 999999 : 1));
  const publicToken = crypto.randomBytes(24).toString('hex');
  const { encryptedContent, iv, authTag } = encryptContent(content, publicToken);
  const passcodeHash = await argon2.hash(rawCode, { type: argon2.argon2id });
  const expiresAt = new Date(Date.now() + expirationHours * 3600 * 1000);

  const result = await query(
    `INSERT INTO secure_messages (
       public_token, sender_id, sender_email, recipient_email, subject,
       encrypted_content, iv, auth_tag, passcode_hash, expires_at,
       destroy_after_read, watermark_enabled, max_views, view_count, status
     ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, 0, 'active')
     RETURNING id, public_token, expires_at, created_at, max_views`,
    [
      publicToken,
      senderId,
      senderEmail,
      recipientEmail,
      subject,
      encryptedContent,
      iv,
      authTag,
      passcodeHash,
      expiresAt,
      willDestroy,
      watermarkEnabled,
      configuredMaxViews,
    ]
  );

  const row = result.rows[0];
  const baseUrl = process.env.BASE_URL || 'https://mail.wox.world';
  const unlockUrl = `${baseUrl}/secure/${publicToken}`;

  // Log creation event
  const ipHash = crypto.createHash('sha256').update(reqIp).digest('hex').slice(0, 16);
  await query(
    `INSERT INTO secure_message_events (message_id, event_type, ip_hash, user_agent, metadata)
     VALUES ($1, 'created', $2, $3, $4)`,
    [row.id, ipHash, userAgent, JSON.stringify({ expirationHours, destroyAfterRead })]
  );

  // Dispatch notification email
  const notificationHtml = `
    <!DOCTYPE html>
    <html>
    <head>
      <meta charset="utf-8">
      <style>
        body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; background: #0f0f1a; color: #f0f0f5; padding: 20px; }
        .container { max-width: 560px; margin: 0 auto; background: #1a1a2e; border: 1px solid #2a2a4a; border-radius: 16px; padding: 32px; }
        .header { display: flex; align-items: center; gap: 10px; margin-bottom: 24px; border-bottom: 1px solid #2a2a4a; padding-bottom: 16px; }
        .title { font-size: 20px; font-weight: 700; color: #8b5cf6; margin: 0; }
        .badge { display: inline-block; background: rgba(124, 58, 237, 0.2); color: #a78bfa; padding: 4px 10px; border-radius: 9999px; font-size: 12px; font-weight: 600; }
        .btn { display: inline-block; background: #7c3aed; color: #ffffff !important; text-decoration: none; padding: 14px 28px; border-radius: 9999px; font-weight: 600; font-size: 15px; margin: 24px 0; text-align: center; }
        .footer { font-size: 12px; color: #9898b0; border-top: 1px solid #2a2a4a; padding-top: 16px; margin-top: 24px; line-height: 1.5; }
      </style>
    </head>
    <body>
      <div class="container">
        <div class="header">
          <span style="font-size: 24px;">🔐</span>
          <h2 class="title">You Have a Secure Confidential Message</h2>
        </div>
        <p style="font-size: 15px; line-height: 1.6;">
          <strong>${senderEmail}</strong> has sent you a password-protected confidential message via WoxMail Privacy Gateway.
        </p>
        <div style="background: #141425; border: 1px solid #252548; border-radius: 10px; padding: 16px; margin: 16px 0;">
          <div style="font-size: 13px; color: #9898b0; margin-bottom: 6px;">SUBJECT: <strong style="color: #f0f0f5;">${subject}</strong></div>
          <div style="font-size: 13px; color: #9898b0; margin-bottom: 6px;">EXPIRES: <span style="color: #f59e0b;">${expiresAt.toUTCString()}</span></div>
          <div style="font-size: 13px; color: #9898b0;">SECURITY: <span class="badge">${destroyAfterRead ? '🔥 Destroy on first read' : '🔒 Password Protected'}</span></div>
        </div>
        <div style="text-align: center;">
          <a href="${unlockUrl}" class="btn">🔓 Unlock Secure Message</a>
        </div>
        <p style="font-size: 13px; color: #9898b0; text-align: center;">
          The sender will provide you with the 6-digit passcode separately.
        </p>
        <div class="footer">
          <strong>Why is this message locked?</strong><br>
          For your security and privacy, sensitive contents are encrypted and not stored inside unencrypted email. This link is single-use and will permanently expire.
        </div>
      </div>
    </body>
    </html>
  `;

  // Dispatch notification email in background (non-blocking)
  (async () => {
    try {
      const userRes = await query('SELECT imap_password FROM users WHERE email = $1', [senderEmail]);
      const pass = userRes.rows[0]?.imap_password || (process.env.ADMIN_PASSWORD || '').replace(/^['"]|['"]$/g, '');
      if (pass) {
        const transporter = createTransporter(senderEmail, pass);
        const sendResult = await sendEmail(transporter, {
          from: senderEmail,
          to: recipientEmail,
          subject: `🔐 Confidential Message: ${subject}`,
          html: notificationHtml,
        });
        logger.info({ id: row.id, recipientEmail }, 'Dispatched secure locked email notification');

        // Append copy to sender's Sent folder
        try {
          const { createConnection } = await import('./imap.js');
          const imapClient = await createConnection(senderEmail, pass);
          if (imapClient) {
            await saveSentMessage(imapClient, {
              from: senderEmail,
              to: recipientEmail,
              subject: `🔐 Confidential Message: ${subject}`,
              html: notificationHtml,
              messageId: sendResult.messageId,
              date: new Date(),
            });
            await imapClient.logout();
          }
        } catch (sentErr) {
          logger.warn({ err: sentErr.message }, 'Failed to append secure locked message to Sent folder');
        }
      }
    } catch (err) {
      logger.error({ err: err.message }, 'Failed sending secure notification email (will still be unlockable via link)');
    }
  })();

  return {
    id: row.id,
    publicToken,
    unlockUrl,
    expiresAt,
    destroyAfterRead,
  };
}

/**
 * Fetch and unlock a Secure Message via public token and passcode
 */
export async function unlockSecureMessage(publicTokenOrId, passcode, { reqIp = '127.0.0.1', userAgent = 'Unknown' } = {}) {
  const client = await getClient();
  const ipHash = crypto.createHash('sha256').update(reqIp).digest('hex').slice(0, 16);
  const rawCode = (passcode || '').toString().trim();

  try {
    await client.query('BEGIN');

    // Row-level lock to eliminate burn-on-read race conditions
    const result = await client.query(
      `SELECT * FROM secure_messages
       WHERE public_token = $1 OR id::text = $1
       FOR UPDATE`,
      [String(publicTokenOrId)]
    );

    if (result.rows.length === 0) {
      await client.query('ROLLBACK');
      return { error: 'not_found', message: 'This secure message does not exist or has been removed.' };
    }

    const msg = result.rows[0];

    // Check expiration
    if (new Date() > new Date(msg.expires_at)) {
      if (msg.status !== 'expired') {
        await client.query("UPDATE secure_messages SET status = 'expired' WHERE id = $1", [msg.id]);
        await client.query(
          "INSERT INTO secure_message_events (message_id, event_type, ip_hash, user_agent) VALUES ($1, 'expired', $2, $3)",
          [msg.id, ipHash, userAgent]
        );
      }
      await client.query('COMMIT');
      return { error: 'expired', message: 'This secure message has expired and is no longer available.' };
    }

    // Check status
    if (msg.status === 'destroyed') {
      await client.query('COMMIT');
      return { error: 'destroyed', message: 'This message was destroyed after being read by the recipient.' };
    }
    if (msg.status === 'revoked') {
      await client.query('COMMIT');
      return { error: 'revoked', message: 'The sender has revoked access to this confidential message.' };
    }

    // Check brute-force attempts
    if (msg.attempt_count >= msg.max_attempts) {
      await client.query('COMMIT');
      return { error: 'locked', message: 'Too many failed passcode attempts. This message has been permanently locked for security.' };
    }

    // Verify passcode
    const valid = await argon2.verify(msg.passcode_hash, rawCode);
    if (!valid) {
      const newAttempts = msg.attempt_count + 1;
      await client.query(
        'UPDATE secure_messages SET attempt_count = $1, updated_at = NOW() WHERE id = $2',
        [newAttempts, msg.id]
      );
      await client.query(
        "INSERT INTO secure_message_events (message_id, event_type, ip_hash, user_agent, metadata) VALUES ($1, 'failed_attempt', $2, $3, $4)",
        [msg.id, ipHash, userAgent, JSON.stringify({ attempt: newAttempts, maxAttempts: msg.max_attempts })]
      );
      await client.query('COMMIT');

      const remaining = Math.max(0, msg.max_attempts - newAttempts);
      return {
        error: 'invalid_passcode',
        message: `Incorrect passcode. ${remaining} attempt(s) remaining before permanent lockout.`,
        remainingAttempts: remaining,
      };
    }

    // Decrypt content
    let decryptedContent = '';
    try {
      decryptedContent = decryptContent(msg.encrypted_content, msg.iv, msg.auth_tag, msg.public_token);
    } catch (err) {
      await client.query('ROLLBACK');
      logger.error({ err: err.message }, 'Failed decrypting secure message payload');
      return { error: 'decrypt_failed', message: 'Failed to decrypt confidential payload.' };
    }

    const openedAt = new Date();
    const newViewCount = (msg.view_count || 0) + 1;
    const maxAllowed = msg.max_views || (msg.destroy_after_read ? 1 : 999999);
    const shouldBurn = msg.destroy_after_read || newViewCount >= maxAllowed;

    if (shouldBurn) {
      // Burn on read: clear ciphertext and mark destroyed
      await client.query(
        `UPDATE secure_messages SET
           status = 'destroyed',
           encrypted_content = '[BURNED]',
           view_count = $1,
           opened_at = $2,
           updated_at = NOW()
         WHERE id = $3`,
        [newViewCount, openedAt, msg.id]
      );
      await client.query(
        "INSERT INTO secure_message_events (message_id, event_type, ip_hash, user_agent, metadata) VALUES ($1, 'destroyed', $2, $3, $4)",
        [msg.id, ipHash, userAgent, JSON.stringify({ viewCount: newViewCount, maxAllowed })]
      );
    } else {
      await client.query(
        `UPDATE secure_messages SET
           status = 'unlocked',
           view_count = $1,
           opened_at = COALESCE(opened_at, $2),
           updated_at = NOW()
         WHERE id = $3`,
        [newViewCount, openedAt, msg.id]
      );
      await client.query(
        "INSERT INTO secure_message_events (message_id, event_type, ip_hash, user_agent, metadata) VALUES ($1, 'unlocked', $2, $3, $4)",
        [msg.id, ipHash, userAgent, JSON.stringify({ viewCount: newViewCount, maxAllowed })]
      );
    }

    await client.query('COMMIT');

    return {
      success: true,
      subject: msg.subject,
      content: decryptedContent,
      senderEmail: msg.sender_email,
      recipientEmail: msg.recipient_email,
      openedAt,
      expiresAt: msg.expires_at,
      destroyed: shouldBurn,
      burned: shouldBurn,
      viewCount: newViewCount,
      maxViews: maxAllowed,
      watermarkEnabled: msg.watermark_enabled,
    };
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
}

/**
 * Revoke a secure message immediately
 */
export async function revokeSecureMessage(messageId, userId) {
  const result = await query(
    `UPDATE secure_messages SET
       status = 'revoked',
       encrypted_content = '[REVOKED]',
       updated_at = NOW()
     WHERE id = $1 AND sender_id = $2
     RETURNING id, recipient_email, subject`,
    [messageId, userId]
  );

  if (result.rows.length === 0) {
    return { error: 'not_found', message: 'Message not found or unauthorized' };
  }

  await query(
    "INSERT INTO secure_message_events (message_id, event_type) VALUES ($1, 'revoked')",
    [messageId]
  );

  return { success: true, message: 'Confidential message has been permanently revoked.' };
}

/**
 * Get list of sent secure messages for sender dashboard
 */
export async function getSecureMessages(userId) {
  const result = await query(
    `SELECT id, public_token, recipient_email, subject, expires_at,
            max_attempts, attempt_count, destroy_after_read, status,
            opened_at, created_at
     FROM secure_messages
     WHERE sender_id = $1
     ORDER BY created_at DESC
     LIMIT 50`,
    [userId]
  );
  return result.rows;
}

/**
 * Get audit events for a secure message
 */
export async function getSecureMessageEvents(messageId, userId) {
  const check = await query('SELECT id FROM secure_messages WHERE id = $1 AND sender_id = $2', [messageId, userId]);
  if (check.rows.length === 0) throw new Error('Message not found');

  const result = await query(
    `SELECT id, event_type, ip_hash, user_agent, metadata, created_at
     FROM secure_message_events
     WHERE message_id = $1
     ORDER BY created_at ASC`,
    [messageId]
  );
  return result.rows;
}
