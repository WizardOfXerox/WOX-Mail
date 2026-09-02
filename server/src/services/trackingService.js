import crypto from 'crypto';
import { query } from '../config/database.js';

// 1x1 Transparent PNG buffer
const TRANSPARENT_PNG = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYAAAAAYAAjCB0C8AAAAASUVORK5CYII=',
  'base64'
);

/**
 * Generate a new tracking token and record for an outbound email
 */
export async function createTracking({ userId, accountId = null, recipientEmail, subject = '' }) {
  const trackingToken = crypto.randomBytes(24).toString('hex');

  const res = await query(`
    INSERT INTO email_tracking (user_id, account_id, tracking_token, subject, recipient_email)
    VALUES ($1, $2, $3, $4, $5)
    RETURNING id, tracking_token, recipient_email, sent_at
  `, [userId, accountId, trackingToken, subject, recipientEmail]);

  return res.rows[0];
}

/**
 * Inject the 1x1 tracking pixel into HTML email content
 */
export function injectTrackingPixel(htmlContent, trackingToken, baseUrl = '') {
  if (!htmlContent || !trackingToken) return htmlContent;

  const root = baseUrl || process.env.BASE_URL || 'http://localhost:3001';
  const pixelUrl = `${root}/api/analytics/pixel/${trackingToken}.png`;
  const pixelTag = `<img src="${pixelUrl}" width="1" height="1" style="display:none;width:1px;height:1px;border:0;" alt="" />`;

  if (htmlContent.includes('</body>')) {
    return htmlContent.replace('</body>', `${pixelTag}</body>`);
  }
  return `${htmlContent}${pixelTag}`;
}

/**
 * Record an email open event
 */
export async function recordEmailOpen(token, req) {
  const ip = req.ip || req.headers['x-forwarded-for'] || req.socket.remoteAddress || '';
  const ipHash = ip ? crypto.createHash('sha256').update(ip).digest('hex').substring(0, 32) : null;
  const userAgent = req.headers['user-agent'] || 'Unknown';

  const res = await query(`
    UPDATE email_tracking
    SET open_count = open_count + 1,
        opened_at = COALESCE(opened_at, NOW()),
        last_ip_hash = $1,
        last_user_agent = $2,
        updated_at = NOW()
    WHERE tracking_token = $3
    RETURNING id, user_id, recipient_email, open_count, opened_at
  `, [ipHash, userAgent, token]);

  return res.rows[0] || null;
}

/**
 * Get tracking status for a message / list of recipients
 */
export async function getTrackingStatus(userId, limit = 50) {
  const res = await query(`
    SELECT id, tracking_token, subject, recipient_email, sent_at, opened_at, open_count, last_user_agent
    FROM email_tracking
    WHERE user_id = $1
    ORDER BY sent_at DESC
    LIMIT $2
  `, [userId, limit]);
  return res.rows;
}

export { TRANSPARENT_PNG };
export default {
  TRANSPARENT_PNG,
  createTracking,
  injectTrackingPixel,
  recordEmailOpen,
  getTrackingStatus
};
