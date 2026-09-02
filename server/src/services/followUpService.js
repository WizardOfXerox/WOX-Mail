import pino from 'pino';
import { query } from '../config/database.js';
import { getIO } from '../config/socket.js';

const logger = pino({ name: 'woxmail:follow-up' });

/**
 * Schedule an automated "Bump If No Reply" reminder
 */
export async function scheduleFollowUp({
  userId,
  threadId = null,
  messageId = null,
  recipientEmail,
  subject = '',
  remindAfterDays = 3,
  customDate = null,
}) {
  let dueAt;
  if (customDate) {
    dueAt = new Date(customDate);
  } else {
    dueAt = new Date(Date.now() + (remindAfterDays || 3) * 24 * 60 * 60 * 1000);
  }

  const res = await query(`
    INSERT INTO email_followup_reminders (
      user_id, thread_id, message_id, recipient_email, subject, remind_after_days, due_at, status
    )
    VALUES ($1, $2, $3, $4, $5, $6, $7, 'pending')
    RETURNING id, user_id, thread_id, message_id, recipient_email, subject, remind_after_days, due_at, status, created_at
  `, [
    userId,
    threadId || `thread_${Date.now()}`,
    messageId,
    recipientEmail,
    subject,
    remindAfterDays || 3,
    dueAt,
  ]);

  return res.rows[0];
}

/**
 * Sweep and trigger all due reminders (called by background cron every 60s)
 */
export async function checkDueFollowUps() {
  const dueRes = await query(`
    SELECT id, user_id, thread_id, message_id, recipient_email, subject, due_at
    FROM email_followup_reminders
    WHERE due_at <= NOW() AND status = 'pending'
  `);

  if (dueRes.rows.length === 0) return [];

  const triggered = [];
  for (const reminder of dueRes.rows) {
    await query(`
      UPDATE email_followup_reminders
      SET status = 'triggered'
      WHERE id = $1
    `, [reminder.id]);

    triggered.push(reminder);

    // Emit real-time notification to user
    try {
      const io = getIO();
      if (io && reminder.user_id) {
        io.to(`user:${reminder.user_id}`).emit('followup_reminder_triggered', {
          id: reminder.id,
          threadId: reminder.thread_id,
          messageId: reminder.message_id,
          recipientEmail: reminder.recipient_email,
          subject: reminder.subject,
          timestamp: new Date().toISOString(),
        });
      }
    } catch (err) {
      logger.debug({ err: err.message }, 'Follow-up socket alert skipped');
    }
  }

  logger.info({ count: triggered.length }, 'Processed due follow-up reminders');
  return triggered;
}

/**
 * Automatically resolve / cancel reminder when recipient replies
 */
export async function resolveFollowUpOnReply({ senderEmail, inReplyTo = null, references = null }) {
  if (!senderEmail) return 0;

  const normalizedEmail = senderEmail.trim().toLowerCase();
  const res = await query(`
    UPDATE email_followup_reminders
    SET status = 'resolved_by_reply'
    WHERE LOWER(recipient_email) = $1 AND status = 'pending'
    RETURNING id, user_id, recipient_email, subject
  `, [normalizedEmail]);

  if (res.rows.length > 0) {
    logger.info({ resolved: res.rows.length, sender: normalizedEmail }, 'Auto-resolved follow-up reminders upon reply');
  }

  return res.rows.length;
}

/**
 * Get pending and triggered follow-up reminders for a user
 */
export async function getUserFollowUps(userId) {
  const res = await query(`
    SELECT id, thread_id, message_id, recipient_email, subject, remind_after_days, due_at, status, created_at
    FROM email_followup_reminders
    WHERE user_id = $1 AND status IN ('pending', 'triggered')
    ORDER BY due_at ASC
  `, [userId]);

  return res.rows;
}

/**
 * Cancel a follow-up reminder
 */
export async function cancelFollowUp(id, userId) {
  const res = await query(`
    UPDATE email_followup_reminders
    SET status = 'cancelled'
    WHERE id = $1 AND user_id = $2
    RETURNING id, status
  `, [id, userId]);

  return res.rows[0] || null;
}

export default {
  scheduleFollowUp,
  checkDueFollowUps,
  resolveFollowUpOnReply,
  getUserFollowUps,
  cancelFollowUp,
};
