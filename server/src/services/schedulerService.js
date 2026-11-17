/**
 * @fileoverview Scheduled send processor.
 * Checks for emails due to be sent and dispatches them via SMTP.
 */

import { ImapFlow } from 'imapflow';
import { query } from '../config/database.js';
import { getTransporterForUser, sendEmail, saveSentMessage } from './smtp.js';
import { createConnection } from './imap.js';
import * as accountService from './accountService.js';
import * as outboxService from './outboxService.js';

function normalizeAttachments(attachments) {
  if (!Array.isArray(attachments)) return [];
  return attachments.map((a) => {
    if (!a) return a;
    if (typeof a.content === 'string' && a.content.includes('base64,')) {
      const parts = a.content.split('base64,');
      return {
        filename: a.filename || 'attachment',
        content: Buffer.from(parts[1], 'base64'),
        contentType: a.contentType || 'application/octet-stream',
      };
    }
    if (typeof a.contentBase64 === 'string') {
      return {
        filename: a.filename || 'attachment',
        content: Buffer.from(a.contentBase64, 'base64'),
        contentType: a.contentType || 'application/octet-stream',
      };
    }
    if (a.content && typeof a.content === 'object' && a.content.type === 'Buffer' && Array.isArray(a.content.data)) {
      return {
        filename: a.filename || 'attachment',
        content: Buffer.from(a.content.data),
        contentType: a.contentType || 'application/octet-stream',
      };
    }
    return a;
  });
}

/**
 * Process due scheduled emails atomically.
 * Called every 1 minute by the job scheduler.
 * @returns {Promise<number>} Number of emails sent
 */
export async function processDueEmails() {
  // Atomically claim due emails with FOR UPDATE SKIP LOCKED and bump send_at by 2 minutes to prevent duplicate dispatch
  const result = await query(
    `UPDATE scheduled_emails
     SET send_at = NOW() + INTERVAL '2 minutes'
     WHERE id IN (
       SELECT id FROM scheduled_emails
       WHERE sent = FALSE AND COALESCE(retry_count, 0) < 5 AND send_at <= NOW()
       ORDER BY send_at ASC
       LIMIT 10
       FOR UPDATE SKIP LOCKED
     )
     RETURNING *`
  );

  let sentCount = 0;

  for (const email of result.rows) {
    try {
      // Get user info and credentials for sending and IMAP append
      const userResult = await query('SELECT id, email, display_name, imap_password, is_admin FROM users WHERE id = $1', [email.user_id]);
      if (userResult.rows.length === 0) {
        // User deleted — mark as sent to avoid infinite retry
        await query('UPDATE scheduled_emails SET sent = TRUE, sent_at = NOW() WHERE id = $1', [email.id]);
        continue;
      }

      const user = userResult.rows[0];
      const { transporter, senderEmail: defaultSender, accountId: resolvedAccountId } = await getTransporterForUser(
        user.id,
        email.account_id || null
      );

      let sender = defaultSender || user.email;
      let fromAddr = user.display_name ? `"${user.display_name}" <${sender}>` : sender;
      if (email.from_address) {
        if (email.from_address.includes('<')) {
          fromAddr = email.from_address;
          const m = email.from_address.match(/<([^>]+)>/);
          sender = m ? m[1].trim() : sender;
        } else {
          sender = email.from_address.trim();
          fromAddr = user.display_name ? `"${user.display_name}" <${sender}>` : sender;
        }
      }

      const normalizedAttachments = normalizeAttachments(email.attachments || []);
      const isProton = Boolean(
        transporter?.isProton ||
        (sender && (
          sender.endsWith('@proton.me') ||
          sender.endsWith('@pm.me') ||
          sender.endsWith('@protonmail.com') ||
          sender.endsWith('@protonmail.ch')
        ))
      );

      let sendResult;
      if (isProton) {
        const { sendProtonMail } = await import('./protonServerSync.js');
        sendResult = await sendProtonMail(sender, {
          from: sender,
          to: email.to_addresses,
          cc: email.cc_addresses || [],
          bcc: email.bcc_addresses || [],
          subject: email.subject,
          html: email.body_html,
          text: email.body_text || '',
          attachments: normalizedAttachments,
        });
      } else {
        sendResult = await sendEmail(transporter, {
          from: fromAddr,
          to: email.to_addresses,
          cc: email.cc_addresses || [],
          bcc: email.bcc_addresses || [],
          subject: email.subject,
          html: email.body_html,
          text: email.body_text || '',
          attachments: normalizedAttachments,
        });
      }

      // Append copy to user's Sent IMAP folder (skip for Proton)
      if (!isProton) {
        let client = null;
        try {
          const targetAccId = email.account_id || resolvedAccountId;
          if (targetAccId) {
            const extAccount = await accountService.getAccountCredentials(user.id, targetAccId);
            if (extAccount && extAccount.provider !== 'proton') {
              client = new ImapFlow({
                host: extAccount.imap_host,
                port: Number(extAccount.imap_port) || 993,
                secure: extAccount.imap_secure !== false,
                auth: { user: extAccount.email, pass: extAccount.password },
                logger: false,
                tls: { rejectUnauthorized: process.env.ALLOW_SELF_SIGNED_TLS !== 'true' },
              });
              await client.connect();
            }
          } else if (user.imap_password) {
            client = await createConnection(user.email, user.imap_password);
          }

          if (client) {
            await saveSentMessage(client, {
              from: fromAddr,
              to: email.to_addresses,
              cc: email.cc_addresses || [],
              bcc: email.bcc_addresses || [],
              subject: email.subject,
              html: email.body_html,
              text: email.body_text || '',
              attachments: normalizedAttachments,
              messageId: sendResult.messageId,
              date: new Date(),
            });
          }
        } catch (saveErr) {
          console.warn(`Failed to append scheduled email ${email.id} to Sent folder:`, saveErr.message);
        } finally {
          if (client) await client.logout().catch(() => {});
        }
      }

      await query(
        'UPDATE scheduled_emails SET sent = TRUE, sent_at = NOW(), error_message = NULL WHERE id = $1',
        [email.id]
      );

      // Mirror completion to outbox tracking
      await outboxService.updateOutboxStatus(`sched_${email.id}`, {
        status: 'sent',
        sentAt: new Date(),
      }, email.user_id).catch(() => {});

      sentCount++;
    } catch (err) {
      console.error(`Failed to send scheduled email ${email.id}:`, err.message);
      await query(
        `UPDATE scheduled_emails
         SET retry_count = COALESCE(retry_count, 0) + 1,
             error_message = $2,
             send_at = NOW() + INTERVAL '1 minute'
         WHERE id = $1`,
        [email.id, err.message || 'Scheduled send failed']
      ).catch(() => {});

      // Mirror failure to outbox tracking
      await outboxService.updateOutboxStatus(`sched_${email.id}`, {
        status: 'failed',
        errorMessage: err.message,
      }, email.user_id).catch(() => {});
    }
  }

  return sentCount;
}

/**
 * Schedule an email for future sending.
 * @param {number} userId
 * @param {object} emailData
 * @returns {Promise<object>} Created scheduled email
 */
export async function scheduleEmail(userId, emailData) {
  // Check max scheduled limit
  const settingsResult = await query(
    "SELECT value FROM settings WHERE key = 'max_scheduled_per_user'"
  );
  const maxScheduled = parseInt(settingsResult.rows[0]?.value || '20', 10);

  const countResult = await query(
    'SELECT COUNT(*) as count FROM scheduled_emails WHERE user_id = $1 AND sent = FALSE',
    [userId]
  );
  if (parseInt(countResult.rows[0].count, 10) >= maxScheduled) {
    throw new Error(`Maximum ${maxScheduled} scheduled emails allowed`);
  }

  const parsedAccountId = emailData.accountId !== undefined && emailData.accountId !== null && emailData.accountId !== 'primary' && emailData.accountId !== 'default'
    ? parseInt(emailData.accountId, 10)
    : null;

  const result = await query(
    `INSERT INTO scheduled_emails
     (user_id, to_addresses, cc_addresses, bcc_addresses, subject, body_html, body_text, attachments, send_at, from_address, account_id)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)
     RETURNING *`,
    [
      userId,
      emailData.to,
      emailData.cc || [],
      emailData.bcc || [],
      emailData.subject,
      emailData.bodyHtml || '',
      emailData.bodyText || '',
      JSON.stringify(emailData.attachments || []),
      emailData.sendAt,
      emailData.fromAddress || null,
      !isNaN(parsedAccountId) ? parsedAccountId : null,
    ]
  );

  return result.rows[0];
}

/**
 * Cancel a scheduled email.
 * @param {number} userId
 * @param {number} scheduledId
 * @returns {Promise<boolean>}
 */
export async function cancelScheduled(userId, scheduledId) {
  const result = await query(
    'DELETE FROM scheduled_emails WHERE user_id = $1 AND id = $2 AND sent = FALSE RETURNING id',
    [userId, scheduledId]
  );
  return result.rowCount > 0;
}

/**
 * List pending scheduled emails.
 * @param {number} userId
 * @returns {Promise<Array>}
 */
export async function listScheduled(userId) {
  const result = await query(
    'SELECT * FROM scheduled_emails WHERE user_id = $1 AND sent = FALSE ORDER BY send_at ASC',
    [userId]
  );
  return result.rows;
}

export default { processDueEmails, scheduleEmail, cancelScheduled, listScheduled };
