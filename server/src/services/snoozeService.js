/**
 * @fileoverview Snooze service — hide emails from inbox and resurface them later.
 */

import { query } from '../config/database.js';
import { createConnection, moveMessages } from './imap.js';
import { getIO } from '../config/socket.js';

/**
 * Snooze an email — hide it from inbox until a specified time.
 * @param {number} userId
 * @param {number} messageUid - IMAP message UID
 * @param {string} folder - Original folder
 * @param {string} snoozeUntil - ISO date string
 * @param {string} [targetFolder='Snoozed'] - Target IMAP folder when physically moved, or original folder on logical fallback
 * @returns {Promise<object>} Created snooze record
 */
export async function snoozeEmail(userId, messageUid, folder, snoozeUntil, targetFolder = 'Snoozed') {
  const originalFolder = folder || 'INBOX';
  const result = await query(
    `INSERT INTO snoozed_emails (user_id, message_uid, original_folder, target_folder, snooze_until)
     VALUES ($1, $2, $3, $4, $5)
     ON CONFLICT (user_id, message_uid, original_folder) DO UPDATE
     SET snooze_until = EXCLUDED.snooze_until,
         target_folder = EXCLUDED.target_folder,
         unsnoozed = FALSE
     RETURNING *`,
    [userId, messageUid, originalFolder, targetFolder || 'Snoozed', snoozeUntil]
  );
  return result.rows[0];
}

/**
 * Unsnooze emails that are due, restoring them back to original_folder in IMAP when moved.
 * Called every 1 minute by the job scheduler.
 * @returns {Promise<number>} Number of unsnoozed emails
 */
export async function processDueSnoozes() {
  const dueRes = await query(
    `SELECT s.*, u.email, u.imap_password, u.is_admin
     FROM snoozed_emails s
     JOIN users u ON u.id = s.user_id
     WHERE s.unsnoozed = FALSE AND s.snooze_until <= NOW()
     ORDER BY s.snooze_until ASC
     LIMIT 50`
  );

  if (dueRes.rows.length === 0) return 0;

  let processed = 0;
  const userClients = new Map();

  try {
    for (const row of dueRes.rows) {
      const targetFolder = row.target_folder || 'Snoozed';
      const originalFolder = row.original_folder || 'INBOX';
      const needsImapRestore = targetFolder.toLowerCase() !== originalFolder.toLowerCase();

      let canMarkUnsnoozed = false;

      if (!needsImapRestore) {
        // Logical hide fallback (was not moved in IMAP)
        canMarkUnsnoozed = true;
      } else {
        const adminPass = (process.env.ADMIN_PASSWORD || '').replace(/^['"]|['"]$/g, '');
        const pass = row.imap_password || (row.is_admin ? adminPass : null);

        if (!pass) {
          // No IMAP password available (e.g. external account or unit test): clean fallback mark
          canMarkUnsnoozed = true;
        } else {
          try {
            let client = userClients.get(row.user_id);
            if (!client) {
              client = await createConnection(row.email, pass);
              userClients.set(row.user_id, client);
            }
            await moveMessages(client, targetFolder, [row.message_uid], originalFolder);
            canMarkUnsnoozed = true;
          } catch (moveErr) {
            const msg = String(moveErr?.message || '').toLowerCase();
            // If folder/message no longer exists in Snoozed, avoid retrying forever
            if (msg.includes('nonexistent') || msg.includes('not found') || msg.includes('no matching') || msg.includes('trycreate')) {
              canMarkUnsnoozed = true;
            }
          }
        }
      }

      if (canMarkUnsnoozed) {
        await query(
          'UPDATE snoozed_emails SET unsnoozed = TRUE WHERE id = $1 AND unsnoozed = FALSE',
          [row.id]
        );
        processed++;
        try {
          const io = getIO();
          if (io && row.user_id) {
            io.to(`user:${row.user_id}`).emit('email_unsnoozed', {
              id: row.id,
              messageUid: row.message_uid,
              folder: originalFolder,
            });
          }
        } catch {}
      }
    }
  } finally {
    for (const client of userClients.values()) {
      await client.logout().catch(() => {});
    }
  }

  return processed;
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
 * Get a single active snooze record by id or messageUid.
 */
export async function getSnoozeRecord(userId, snoozeId) {
  const result = await query(
    `SELECT * FROM snoozed_emails
     WHERE user_id = $1 AND (id = $2 OR message_uid = $2) AND unsnoozed = FALSE
     LIMIT 1`,
    [userId, snoozeId]
  );
  return result.rows[0] || null;
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
     WHERE user_id = $1 AND (id = $2 OR message_uid = $2) AND unsnoozed = FALSE
     RETURNING id`,
    [userId, snoozeId]
  );
  return result.rowCount > 0;
}

/**
 * Get quick snooze options with pre-calculated future dates.
 * @returns {Array<{label: string, value: string}>}
 */
export function getSnoozeOptions() {
  const now = new Date();
  const hour = now.getHours();

  // Later today:
  // - Before 15:00 -> today 18:00
  // - 15:00..20:59 -> today (hour + 3):00
  // - Late night (>= 21:00) -> 23:59 today (if >= 15m remaining) else +1 hour, never wrapping into 1-2 AM tomorrow
  const laterToday = new Date(now);
  if (hour < 15) {
    laterToday.setHours(18, 0, 0, 0);
  } else if (hour < 21) {
    laterToday.setHours(hour + 3, 0, 0, 0);
  } else {
    laterToday.setHours(23, 59, 0, 0);
    if (laterToday.getTime() - now.getTime() < 15 * 60 * 1000) {
      laterToday.setTime(now.getTime() + 60 * 60 * 1000);
    }
  }

  // Tomorrow morning (9 AM)
  const tomorrow = new Date(now);
  tomorrow.setDate(tomorrow.getDate() + 1);
  tomorrow.setHours(9, 0, 0, 0);

  // Next week (Monday 9 AM; Sunday getDay()===0 is +1 day, Mon..Sat is 8 - day)
  const nextWeek = new Date(now);
  const day = nextWeek.getDay();
  const daysUntilMonday = day === 0 ? 1 : 8 - day;
  nextWeek.setDate(nextWeek.getDate() + daysUntilMonday);
  nextWeek.setHours(9, 0, 0, 0);

  return [
    { label: 'Later Today', value: laterToday.toISOString() },
    { label: 'Tomorrow', value: tomorrow.toISOString() },
    { label: 'Next Week', value: nextWeek.toISOString() },
  ];
}

export default { snoozeEmail, processDueSnoozes, listSnoozed, getSnoozeRecord, cancelSnooze, getSnoozeOptions };
