/**
 * @fileoverview Snooze service — hide emails from inbox and resurface them later.
 */

import { query } from '../config/database.js';

/**
 * Snooze an email — hide it from inbox until a specified time.
 * @param {number} userId
 * @param {number} messageUid - IMAP message UID
 * @param {string} folder - Current folder
 * @param {string} snoozeUntil - ISO date string
 * @returns {Promise<object>} Created snooze record
 */
export async function snoozeEmail(userId, messageUid, folder, snoozeUntil) {
  const result = await query(
    `INSERT INTO snoozed_emails (user_id, message_uid, original_folder, snooze_until)
     VALUES ($1, $2, $3, $4)
     ON CONFLICT (user_id, message_uid) DO UPDATE
     SET snooze_until = $4, unsnoozed = FALSE
     RETURNING *`,
    [userId, messageUid, folder, snoozeUntil]
  );
  return result.rows[0];
}

/**
 * Unsnooze emails that are due.
 * Called every 1 minute by the job scheduler.
 * @returns {Promise<number>} Number of unsnoozed emails
 */
export async function processDueSnoozes() {
  const result = await query(
    `UPDATE snoozed_emails
     SET unsnoozed = TRUE
     WHERE unsnoozed = FALSE AND snooze_until <= NOW()
     RETURNING *`
  );

  // For each unsnoozed email, we'd ideally move it back to inbox
  // and trigger a Socket.IO notification. The IMAP move happens
  // at the route level since it needs the user's IMAP connection.

  return result.rowCount;
}

/**
 * List snoozed emails for a user.
 * @param {number} userId
 * @returns {Promise<Array>}
 */
export async function listSnoozed(userId) {
  const result = await query(
    `SELECT * FROM snoozed_emails
     WHERE user_id = $1 AND unsnoozed = FALSE
     ORDER BY snooze_until ASC`,
    [userId]
  );
  return result.rows;
}

/**
 * Cancel a snooze (un-snooze immediately).
 * @param {number} userId
 * @param {number} snoozeId
 * @returns {Promise<boolean>}
 */
export async function cancelSnooze(userId, snoozeId) {
  const result = await query(
    `UPDATE snoozed_emails SET unsnoozed = TRUE
     WHERE user_id = $1 AND id = $2 AND unsnoozed = FALSE
     RETURNING id`,
    [userId, snoozeId]
  );
  return result.rowCount > 0;
}

/**
 * Get quick snooze options with pre-calculated dates.
 * @returns {Array<{label: string, value: string}>}
 */
export function getSnoozeOptions() {
  const now = new Date();
  const today = new Date(now);

  // Later today (3 hours from now, or 6 PM)
  const laterToday = new Date(today);
  laterToday.setHours(Math.max(now.getHours() + 3, 18), 0, 0, 0);

  // Tomorrow morning (9 AM)
  const tomorrow = new Date(today);
  tomorrow.setDate(tomorrow.getDate() + 1);
  tomorrow.setHours(9, 0, 0, 0);

  // Next week (Monday 9 AM)
  const nextWeek = new Date(today);
  nextWeek.setDate(nextWeek.getDate() + (7 - nextWeek.getDay() + 1));
  nextWeek.setHours(9, 0, 0, 0);

  return [
    { label: 'Later Today', value: laterToday.toISOString() },
    { label: 'Tomorrow', value: tomorrow.toISOString() },
    { label: 'Next Week', value: nextWeek.toISOString() },
  ];
}

export default { snoozeEmail, processDueSnoozes, listSnoozed, cancelSnooze, getSnoozeOptions };
