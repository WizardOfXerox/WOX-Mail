/**
 * @fileoverview Webhook dispatcher — event streaming with HMAC-SHA256 signatures,
 * timeout protection, delivery logging, and retry safety.
 */

import crypto from 'crypto';
import { query } from '../config/database.js';
import pino from 'pino';

const logger = pino({ name: 'woxmail:webhooks' });

/**
 * Generate a cryptographically secure webhook secret.
 * @returns {string} e.g. "whsec_8f93...4a"
 */
export function generateWebhookSecret() {
  return `whsec_${crypto.randomBytes(24).toString('hex')}`;
}

/**
 * Create a new user webhook.
 * @param {number} userId
 * @param {string} name
 * @param {string} targetUrl
 * @param {string[]} [events=['mail.received']]
 */
export async function createWebhook(userId, name, targetUrl, events = ['mail.received', 'mail.otp_extracted']) {
  if (!targetUrl.startsWith('http://') && !targetUrl.startsWith('https://')) {
    throw new Error('Target URL must start with http:// or https://');
  }

  const secretKey = generateWebhookSecret();

  const result = await query(
    `INSERT INTO user_webhooks (user_id, name, target_url, secret_key, events)
     VALUES ($1, $2, $3, $4, $5)
     RETURNING id, name, target_url, secret_key, events, is_active, created_at`,
    [userId, name, targetUrl, secretKey, events]
  );

  return result.rows[0];
}

/**
 * List all webhooks for a user.
 * @param {number} userId
 */
export async function listWebhooks(userId) {
  const result = await query(
    `SELECT id, name, target_url, secret_key, events, is_active, failure_count, last_delivered_at, created_at
     FROM user_webhooks
     WHERE user_id = $1
     ORDER BY created_at DESC`,
    [userId]
  );
  return result.rows;
}

/**
 * Update webhook properties.
 * @param {number} userId
 * @param {number} webhookId
 * @param {object} updates
 */
export async function updateWebhook(userId, webhookId, updates) {
  const sets = [];
  const values = [];
  let idx = 1;

  if (updates.name !== undefined) {
    sets.push(`name = $${idx++}`);
    values.push(updates.name);
  }
  if (updates.target_url !== undefined) {
    if (!updates.target_url.startsWith('http://') && !updates.target_url.startsWith('https://')) {
      throw new Error('Target URL must start with http:// or https://');
    }
    sets.push(`target_url = $${idx++}`);
    values.push(updates.target_url);
  }
  if (updates.events !== undefined) {
    sets.push(`events = $${idx++}`);
    values.push(updates.events);
  }
  if (updates.is_active !== undefined) {
    sets.push(`is_active = $${idx++}`);
    values.push(updates.is_active);
    if (updates.is_active) {
      sets.push(`failure_count = 0`); // Reset failures on reactivation
    }
  }

  if (sets.length === 0) return null;

  values.push(userId, webhookId);
  const result = await query(
    `UPDATE user_webhooks SET ${sets.join(', ')} WHERE user_id = $${idx} AND id = $${idx + 1} RETURNING *`,
    values
  );

  return result.rows[0] || null;
}

/**
 * Delete a webhook and its delivery history.
 * @param {number} userId
 * @param {number} webhookId
 */
export async function deleteWebhook(userId, webhookId) {
  const result = await query(
    'DELETE FROM user_webhooks WHERE id = $1 AND user_id = $2 RETURNING id',
    [webhookId, userId]
  );
  return result.rows.length > 0;
}

/**
 * Get recent deliveries for a webhook.
 * @param {number} userId
 * @param {number} webhookId
 * @param {number} [limit=20]
 */
export async function getWebhookDeliveries(userId, webhookId, limit = 20) {
  const result = await query(
    `SELECT id, event_type, payload, response_status, response_body, success, execution_ms, created_at
     FROM webhook_deliveries
     WHERE webhook_id = $1 AND user_id = $2
     ORDER BY created_at DESC
     LIMIT $3`,
    [webhookId, userId, limit]
  );
  return result.rows;
}

/**
 * Send an HTTP POST payload to a single webhook endpoint.
 * Protected with 5s timeout, HMAC-SHA256 signature, and delivery log.
 * @param {object} webhook
 * @param {string} eventType
 * @param {object} payload
 */
async function deliverToWebhook(webhook, eventType, payload) {
  const deliveryId = crypto.randomUUID();
  const timestamp = Date.now();
  const bodyString = JSON.stringify({
    id: deliveryId,
    event: eventType,
    created_at: new Date(timestamp).toISOString(),
    data: payload,
  });

  const signature = crypto
    .createHmac('sha256', webhook.secret_key)
    .update(`${timestamp}.${bodyString}`)
    .digest('hex');

  const startTime = Date.now();
  let success = false;
  let status = null;
  let responseText = '';

  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), 5000);

  try {
    const res = await fetch(webhook.target_url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'User-Agent': 'WoxMail-Webhook-Dispatcher/1.0',
        'X-WoxMail-Delivery-ID': deliveryId,
        'X-WoxMail-Timestamp': String(timestamp),
        'X-WoxMail-Signature': `t=${timestamp},v1=${signature}`,
      },
      body: bodyString,
      signal: controller.signal,
    });

    clearTimeout(timeoutId);
    status = res.status;
    responseText = (await res.text()).slice(0, 1000);
    success = res.ok;
  } catch (err) {
    clearTimeout(timeoutId);
    responseText = err.name === 'AbortError' ? 'Request timed out (5s limit)' : err.message;
    success = false;
  }

  const executionMs = Date.now() - startTime;

  // Log delivery attempt
  await query(
    `INSERT INTO webhook_deliveries (webhook_id, user_id, event_type, payload, response_status, response_body, success, execution_ms)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
    [webhook.id, webhook.user_id, eventType, payload, status, responseText, success, executionMs]
  );

  // Update webhook status
  if (success) {
    await query(
      'UPDATE user_webhooks SET failure_count = 0, last_delivered_at = NOW() WHERE id = $1',
      [webhook.id]
    );
  } else {
    await query(
      `UPDATE user_webhooks SET
         failure_count = failure_count + 1,
         is_active = CASE WHEN failure_count + 1 >= 50 THEN FALSE ELSE is_active END
       WHERE id = $1`,
      [webhook.id]
    );
  }

  return { success, status, responseText, executionMs };
}

/**
 * Dispatch an event to all active webhooks for a user asynchronously.
 * Non-blocking: executes in the background.
 * @param {number} userId
 * @param {string} eventType - e.g. 'mail.received', 'mail.otp_extracted'
 * @param {object} payload
 */
export async function dispatchEvent(userId, eventType, payload) {
  try {
    const webhooks = await query(
      `SELECT id, user_id, target_url, secret_key, events
       FROM user_webhooks
       WHERE user_id = $1 AND is_active = TRUE`,
      [userId]
    );

    for (const wh of webhooks.rows) {
      if (!wh.events || wh.events.includes(eventType) || wh.events.includes('*')) {
        // Fire asynchronously in background
        deliverToWebhook(wh, eventType, payload).catch((err) => {
          logger.error({ webhookId: wh.id, err: err.message }, 'Webhook background delivery error');
        });
      }
    }
  } catch (err) {
    logger.error({ userId, eventType, err: err.message }, 'Failed to dispatch webhook event');
  }
}

/**
 * Send a test ping event to a webhook.
 * @param {number} userId
 * @param {number} webhookId
 */
export async function sendTestPing(userId, webhookId) {
  const result = await query(
    'SELECT * FROM user_webhooks WHERE id = $1 AND user_id = $2',
    [webhookId, userId]
  );

  if (result.rows.length === 0) throw new Error('Webhook not found');

  const webhook = result.rows[0];
  return deliverToWebhook(webhook, 'ping', {
    message: 'Hello from WoxMail Webhooks!',
    timestamp: new Date().toISOString(),
    sample_email: {
      from: 'test@example.com',
      subject: 'Test Webhook Verification',
      preview: 'This is a test notification verifying your webhook endpoint.',
    },
  });
}

export default {
  createWebhook,
  listWebhooks,
  updateWebhook,
  deleteWebhook,
  getWebhookDeliveries,
  dispatchEvent,
  sendTestPing,
};
