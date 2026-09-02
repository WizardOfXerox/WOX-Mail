/**
 * @fileoverview Scheduled send processor.
 * Checks for emails due to be sent and dispatches them via SMTP.
 */

import { query } from '../config/database.js';
import { getTransporterForUser, sendEmail, saveSentMessage } from './smtp.js';
import { createConnection } from './imap.js';

/**
 * Process due scheduled emails.
 * Called every 1 minute by the job scheduler.
 * @returns {Promise<number>} Number of emails sent
 */
export async function processDueEmails() {
  // Select emails that are due and not yet sent
  const result = await query(
    `SELECT * FROM scheduled_emails
     WHERE sent = FALSE AND send_at <= NOW()
     ORDER BY send_at ASC
     LIMIT 10`
  );

  let sentCount = 0;

  for (const email of result.rows) {
    try {
      // Get user info and credentials for sending and IMAP append
      const userResult = await query('SELECT email, display_name, imap_password FROM users WHERE id = $1', [email.user_id]);
      if (userResult.rows.length === 0) {
        // User deleted — mark as sent to avoid infinite retry
        await query('UPDATE scheduled_emails SET sent = TRUE, sent_at = NOW() WHERE id = $1', [email.id]);
        continue;
      }

      const user = userResult.rows[0];
      const { transporter, senderEmail: defaultSender } = await getTransporterForUser(user.id);
      const sender = defaultSender || user.email;
      const fromAddr = user.display_name ? `"${user.display_name}" <${sender}>` : sender;

      const sendResult = await sendEmail(transporter, {
        from: fromAddr,
        to: email.to_addresses,
        cc: email.cc_addresses || [],
        bcc: email.bcc_addresses || [],
        subject: email.subject,
        html: email.body_html,
        text: email.body_text || '',
        attachments: email.attachments || [],
      });

      // Append copy to user's Sent IMAP folder
      try {
        const client = await createConnection(user.email, user.imap_password);
        if (client) {
          await saveSentMessage(client, {
            from: fromAddr,
            to: email.to_addresses,
            cc: email.cc_addresses || [],
            bcc: email.bcc_addresses || [],
            subject: email.subject,
            html: email.body_html,
            text: email.body_text || '',
            attachments: email.attachments || [],
            messageId: sendResult.messageId,
            date: new Date(),
          });
          await client.logout();
        }
      } catch (saveErr) {
        console.warn(`Failed to append scheduled email ${email.id} to Sent folder:`, saveErr.message);
      }

      await query(
        'UPDATE scheduled_emails SET sent = TRUE, sent_at = NOW() WHERE id = $1',
        [email.id]
      );

      sentCount++;
    } catch (err) {
      console.error(`Failed to send scheduled email ${email.id}:`, err.message);
      // Don't mark as sent — will retry next cycle
      // After 5 failures, we should give up (add a retry_count column in future)
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

  const result = await query(
    `INSERT INTO scheduled_emails
     (user_id, to_addresses, cc_addresses, bcc_addresses, subject, body_html, body_text, attachments, send_at)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
     RETURNING *`,
    [
      userId,
      emailData.to,
      emailData.cc || [],
      emailData.bcc || [],
      emailData.subject,
      emailData.bodyHtml,
      emailData.bodyText || '',
      JSON.stringify(emailData.attachments || []),
      emailData.sendAt,
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
