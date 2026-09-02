/**
 * @fileoverview WoxCalendar service — CRUD operations for calendar events.
 * Supports recurring events via RRULE and reminders via push notifications.
 */

import { query } from '../config/database.js';
import { sendPushNotification } from './pushNotifications.js';

/**
 * List events in a date range.
 * @param {number} userId
 * @param {string} startDate - ISO date string
 * @param {string} endDate - ISO date string
 * @returns {Promise<Array>}
 */
export async function listEvents(userId, startDate, endDate) {
  const result = await query(
    `SELECT * FROM calendar_events
     WHERE user_id = $1
       AND start_time >= $2
       AND start_time <= $3
     ORDER BY start_time ASC`,
    [userId, startDate, endDate]
  );
  return result.rows;
}

/**
 * Get a single event.
 * @param {number} userId
 * @param {number} eventId
 * @returns {Promise<object|null>}
 */
export async function getEvent(userId, eventId) {
  const result = await query(
    'SELECT * FROM calendar_events WHERE user_id = $1 AND id = $2',
    [userId, eventId]
  );
  return result.rows[0] || null;
}

/**
 * Create a new event.
 * @param {object} event - Event data
 * @returns {Promise<object>} Created event
 */
export async function createEvent(event) {
  const result = await query(
    `INSERT INTO calendar_events
     (user_id, title, description, location, start_time, end_time, all_day, color, recurrence_rule, reminder_minutes, source_email_uid)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)
     RETURNING *`,
    [
      event.user_id,
      event.title,
      event.description || null,
      event.location || null,
      event.start_time,
      event.end_time,
      event.all_day || false,
      event.color || '#7c3aed',
      event.recurrence_rule || null,
      event.reminder_minutes ?? 15,
      event.source_email_uid || null,
    ]
  );
  return result.rows[0];
}

/**
 * Update an event.
 * @param {number} userId
 * @param {number} eventId
 * @param {object} updates
 * @returns {Promise<object|null>}
 */
export async function updateEvent(userId, eventId, updates) {
  const allowed = ['title', 'description', 'location', 'start_time', 'end_time', 'all_day', 'color', 'recurrence_rule', 'reminder_minutes'];
  const sets = [];
  const values = [];
  let idx = 1;

  for (const field of allowed) {
    if (updates[field] !== undefined) {
      sets.push(`${field} = $${idx++}`);
      values.push(updates[field]);
    }
  }

  if (sets.length === 0) return null;

  sets.push(`updated_at = NOW()`);
  values.push(userId, eventId);

  const result = await query(
    `UPDATE calendar_events SET ${sets.join(', ')} WHERE user_id = $${idx} AND id = $${idx + 1} RETURNING *`,
    values
  );
  return result.rows[0] || null;
}

/**
 * Delete an event.
 * @param {number} userId
 * @param {number} eventId
 * @returns {Promise<boolean>}
 */
export async function deleteEvent(userId, eventId) {
  const result = await query(
    'DELETE FROM calendar_events WHERE user_id = $1 AND id = $2 RETURNING id',
    [userId, eventId]
  );
  return result.rowCount > 0;
}

/**
 * Get upcoming events for sidebar widget (next 7 days).
 * @param {number} userId
 * @returns {Promise<Array>}
 */
export async function getUpcoming(userId) {
  const result = await query(
    `SELECT id, title, start_time, end_time, all_day, color, location
     FROM calendar_events
     WHERE user_id = $1
       AND start_time >= NOW()
       AND start_time <= NOW() + INTERVAL '7 days'
     ORDER BY start_time ASC
     LIMIT 20`,
    [userId]
  );
  return result.rows;
}

/**
 * Check for events with reminders due and send push notifications.
 * Called by the background job scheduler.
 */
export async function processReminders() {
  const result = await query(
    `SELECT ce.*, u.id AS uid
     FROM calendar_events ce
     JOIN users u ON u.id = ce.user_id
     WHERE ce.reminder_minutes IS NOT NULL
       AND ce.start_time - (ce.reminder_minutes || ' minutes')::INTERVAL <= NOW()
       AND ce.start_time > NOW()
       AND ce.reminder_sent IS NOT TRUE`
  );

  for (const event of result.rows) {
    await sendPushNotification(event.user_id, {
      title: `📅 ${event.title}`,
      body: `Starting in ${event.reminder_minutes} minutes${event.location ? ` at ${event.location}` : ''}`,
      url: '/dashboard?view=calendar',
      tag: `calendar-${event.id}`,
    });

    // Mark reminder as sent to avoid duplicates
    await query(
      'UPDATE calendar_events SET reminder_sent = TRUE WHERE id = $1',
      [event.id]
    );
  }

  return result.rowCount;
}

export default { listEvents, getEvent, createEvent, updateEvent, deleteEvent, getUpcoming, processReminders };
