/**
 * @fileoverview Push notification service using Web Push API.
 * Sends browser push notifications to subscribed users.
 */

import webpush from 'web-push';
import { query } from '../config/database.js';

// Configure VAPID keys (set in .env)
const vapidPublic = process.env.VAPID_PUBLIC_KEY;
const vapidPrivate = process.env.VAPID_PRIVATE_KEY;
const vapidEmail = process.env.VAPID_EMAIL || process.env.ADMIN_EMAIL;

if (vapidPublic && vapidPrivate && vapidEmail) {
  webpush.setVapidDetails(`mailto:${vapidEmail}`, vapidPublic, vapidPrivate);
}

/**
 * Send a push notification to a user.
 * @param {number} userId - User ID
 * @param {object} payload - Notification data
 * @param {string} payload.title - Notification title
 * @param {string} payload.body - Notification body
 * @param {string} [payload.icon] - Icon URL
 * @param {string} [payload.url] - Click action URL
 * @param {string} [payload.tag] - Notification tag (for grouping)
 * @returns {Promise<boolean>} Whether notification was sent
 */
export async function sendPushNotification(userId, payload) {
  if (!vapidPublic || !vapidPrivate) return false;

  try {
    const result = await query(
      'SELECT push_subscription FROM users WHERE id = $1 AND push_subscription IS NOT NULL',
      [userId]
    );

    if (result.rows.length === 0 || !result.rows[0].push_subscription) {
      return false;
    }

    const subscription = result.rows[0].push_subscription;

    const notificationPayload = JSON.stringify({
      title: payload.title || 'WoxMail',
      body: payload.body || '',
      icon: payload.icon || '/assets/favicon.svg',
      badge: '/assets/favicon.svg',
      url: payload.url || '/dashboard',
      tag: payload.tag || 'woxmail',
      timestamp: Date.now(),
    });

    await webpush.sendNotification(subscription, notificationPayload);
    return true;
  } catch (err) {
    // Subscription expired or invalid — remove it
    if (err.statusCode === 410 || err.statusCode === 404) {
      await query(
        'UPDATE users SET push_subscription = NULL WHERE id = $1',
        [userId]
      );
    }
    return false;
  }
}

/**
 * Send push to all admins (e.g., security alerts).
 * @param {object} payload - Notification data
 */
export async function notifyAdmins(payload) {
  const admins = await query(
    'SELECT id FROM users WHERE is_admin = TRUE AND push_subscription IS NOT NULL'
  );

  await Promise.allSettled(
    admins.rows.map((admin) => sendPushNotification(admin.id, payload))
  );
}

/**
 * Notify user of new email.
 * @param {number} userId
 * @param {string} from - Sender
 * @param {string} subject - Email subject
 */
export async function notifyNewEmail(userId, from, subject) {
  return sendPushNotification(userId, {
    title: from || 'New Email',
    body: subject || '(no subject)',
    url: '/dashboard',
    tag: 'new-email',
  });
}

/**
 * Get VAPID public key for client subscription.
 * @returns {string|null}
 */
export function getVapidPublicKey() {
  return vapidPublic || null;
}

export default { sendPushNotification, notifyAdmins, notifyNewEmail, getVapidPublicKey };
