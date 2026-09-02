import crypto from 'crypto';
import pino from 'pino';
import { query } from '../config/database.js';
import { getIO } from '../config/socket.js';

const logger = pino({ name: 'woxmail:tracking' });

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

  const root = baseUrl || process.env.BASE_URL || 'https://mail.wox.world';
  const pixelUrl = `${root}/api/analytics/pixel/${trackingToken}.png`;
  const pixelTag = `<img src="${pixelUrl}" width="1" height="1" style="display:none;width:1px;height:1px;border:0;" alt="" />`;

  if (htmlContent.includes('</body>')) {
    return htmlContent.replace('</body>', `${pixelTag}</body>`);
  }
  return `${htmlContent}${pixelTag}`;
}

/**
 * Wrap outbound links with signed tracking redirect proxies
 */
export async function wrapLinksWithTracking(htmlContent, trackingId, baseUrl = '') {
  if (!htmlContent || !trackingId) return htmlContent;

  const root = baseUrl || process.env.BASE_URL || 'https://mail.wox.world';
  const linkRegex = /<a\s+(?:[^>]*?\s+)?href=(["'])(https?:\/\/[^"'>]+)\1/gi;

  let match;
  const linksToWrap = [];
  while ((match = linkRegex.exec(htmlContent)) !== null) {
    const fullMatch = match[0];
    const quote = match[1];
    const originalUrl = match[2];

    // Skip tracking analytics/pixel endpoints
    if (originalUrl.includes('/api/analytics/') || originalUrl.includes('/api/secure-attachments/')) {
      continue;
    }

    linksToWrap.push({ fullMatch, quote, originalUrl });
  }

  let modifiedHtml = htmlContent;
  for (const { fullMatch, quote, originalUrl } of linksToWrap) {
    const clickToken = `clk_${crypto.randomBytes(20).toString('hex')}`;
    
    await query(`
      INSERT INTO email_link_clicks (tracking_id, target_url, click_token, click_count)
      VALUES ($1, $2, $3, 0)
    `, [trackingId, originalUrl, clickToken]);

    const redirectUrl = `${root}/api/analytics/click/${clickToken}`;
    const newAnchorTag = fullMatch.replace(originalUrl, redirectUrl);
    modifiedHtml = modifiedHtml.replace(fullMatch, newAnchorTag);
  }

  return modifiedHtml;
}

/**
 * Record an email open event (increments counter, logs discrete open event, notifies sender)
 */
export async function recordEmailOpen(token, req = {}) {
  const ip = req.ip || req.headers?.['x-forwarded-for'] || req.socket?.remoteAddress || '';
  const ipHash = ip ? crypto.createHash('sha256').update(ip).digest('hex').substring(0, 32) : null;
  const userAgent = req.headers?.['user-agent'] || 'Unknown';

  const res = await query(`
    UPDATE email_tracking
    SET open_count = open_count + 1,
        opened_at = COALESCE(opened_at, NOW()),
        last_ip_hash = $1,
        last_user_agent = $2,
        updated_at = NOW()
    WHERE tracking_token = $3
    RETURNING id, user_id, recipient_email, subject, open_count, opened_at
  `, [ipHash, userAgent, token]);

  const row = res.rows[0];
  if (row) {
    // Log discrete open event
    await query(`
      INSERT INTO email_open_events (tracking_id, ip_hash, user_agent)
      VALUES ($1, $2, $3)
    `, [row.id, ipHash, userAgent]);

    // Real-time socket notification to sender
    try {
      const io = getIO();
      if (io && row.user_id) {
        io.to(`user:${row.user_id}`).emit('email_opened', {
          trackingId: row.id,
          recipientEmail: row.recipient_email,
          subject: row.subject,
          openCount: row.open_count,
          openedAt: row.opened_at,
          timestamp: new Date().toISOString(),
        });
      }
    } catch (err) {
      logger.debug({ err: err.message }, 'Socket.IO email_opened alert skipped');
    }
  }

  return row || null;
}

/**
 * Record a link click event (increments counter, logs click, notifies sender)
 */
export async function recordLinkClick(clickToken, req = {}) {
  const ip = req.ip || req.headers?.['x-forwarded-for'] || req.socket?.remoteAddress || '';
  const ipHash = ip ? crypto.createHash('sha256').update(ip).digest('hex').substring(0, 32) : null;
  const userAgent = req.headers?.['user-agent'] || 'Unknown';

  const res = await query(`
    UPDATE email_link_clicks
    SET click_count = click_count + 1,
        last_clicked_at = NOW(),
        first_clicked_at = COALESCE(first_clicked_at, NOW()),
        last_ip_hash = $1,
        user_agent = $2
    WHERE click_token = $3
    RETURNING id, tracking_id, target_url, click_count
  `, [ipHash, userAgent, clickToken]);

  const row = res.rows[0];
  if (!row) return null;

  // Retrieve sender user_id to notify
  const trackingRes = await query(`
    SELECT user_id, recipient_email, subject FROM email_tracking WHERE id = $1
  `, [row.tracking_id]);

  if (trackingRes.rows.length > 0) {
    const tracking = trackingRes.rows[0];
    try {
      const io = getIO();
      if (io && tracking.user_id) {
        io.to(`user:${tracking.user_id}`).emit('email_link_clicked', {
          trackingId: row.tracking_id,
          recipientEmail: tracking.recipient_email,
          targetUrl: row.target_url,
          clickCount: row.click_count,
          timestamp: new Date().toISOString(),
        });
      }
    } catch (err) {
      logger.debug({ err: err.message }, 'Socket.IO email_link_clicked alert skipped');
    }
  }

  return row.target_url;
}

/**
 * Get comprehensive timeline telemetry for an email
 */
export async function getTrackingTimeline(trackingId, userId) {
  const trackingRes = await query(`
    SELECT id, tracking_token, subject, recipient_email, sent_at, opened_at, open_count, last_user_agent
    FROM email_tracking
    WHERE id = $1 AND user_id = $2
  `, [trackingId, userId]);

  if (trackingRes.rows.length === 0) return null;
  const tracking = trackingRes.rows[0];

  const opensRes = await query(`
    SELECT id, opened_at, user_agent
    FROM email_open_events
    WHERE tracking_id = $1
    ORDER BY opened_at ASC
  `, [trackingId]);

  const clicksRes = await query(`
    SELECT id, target_url, click_count, first_clicked_at, last_clicked_at, user_agent
    FROM email_link_clicks
    WHERE tracking_id = $1
    ORDER BY last_clicked_at DESC NULLS LAST
  `, [trackingId]);

  return {
    ...tracking,
    openEvents: opensRes.rows,
    linkClicks: clicksRes.rows,
  };
}

/**
 * Get tracking status list for a user
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
  wrapLinksWithTracking,
  recordEmailOpen,
  recordLinkClick,
  getTrackingTimeline,
  getTrackingStatus,
};
