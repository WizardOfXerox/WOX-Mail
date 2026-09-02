import { Router } from 'express';
import { requireAuth } from '../middleware/auth.js';
import { query } from '../config/database.js';
import { TRANSPARENT_PNG, recordEmailOpen, getTrackingStatus } from '../services/trackingService.js';

const router = Router();

/**
 * GET /api/analytics/pixel/:token.png
 * Public tracking pixel endpoint. Returns 1x1 transparent PNG and records open.
 */
router.get('/pixel/:token.png', async (req, res) => {
  try {
    const token = req.params.token.replace('.png', '');
    await recordEmailOpen(token, req);
  } catch (err) {
    // Silent fail so email client is not disturbed
  }

  res.setHeader('Content-Type', 'image/png');
  res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate, proxy-revalidate, max-age=0');
  res.setHeader('Pragma', 'no-cache');
  res.setHeader('Expires', '0');
  return res.send(TRANSPARENT_PNG);
});

// All following endpoints require authentication
router.use(requireAuth);

/**
 * GET /api/analytics/tracking
 * Get list of tracked sent emails with open statuses
 */
router.get('/tracking', async (req, res) => {
  try {
    const tracking = await getTrackingStatus(req.user.id, parseInt(req.query.limit, 10) || 50);
    res.json({ tracking });
  } catch (err) {
    res.status(500).json({ error: err.message || 'Failed to fetch tracking data.' });
  }
});

/**
 * GET /api/analytics/overview
 * Get user mailbox analytics overview
 */
router.get('/overview', async (req, res) => {
  try {
    const userId = req.user.id;

    // 1. Total Sent Tracking Stats
    const trackingStats = await query(`
      SELECT 
        COUNT(*) as total_tracked,
        COUNT(opened_at) as total_opened,
        COALESCE(SUM(open_count), 0) as total_opens,
        ROUND(AVG(CASE WHEN opened_at IS NOT NULL THEN EXTRACT(EPOCH FROM (opened_at - sent_at))/60 ELSE NULL END)) as avg_minutes_to_open
      FROM email_tracking
      WHERE user_id = $1
    `, [userId]);

    // 2. Outbox Stats
    const outboxStats = await query(`
      SELECT 
        COUNT(*) as total_dispatches,
        COUNT(CASE WHEN status = 'sent' THEN 1 END) as sent_count,
        COUNT(CASE WHEN status = 'failed' THEN 1 END) as failed_count
      FROM outbox_emails
      WHERE user_id = $1
    `, [userId]);

    // 3. Top Recipients
    const topRecipients = await query(`
      SELECT recipient_email, COUNT(*) as sent_count, COUNT(opened_at) as opened_count
      FROM email_tracking
      WHERE user_id = $1
      GROUP BY recipient_email
      ORDER BY sent_count DESC
      LIMIT 5
    `, [userId]);

    // 4. Daily Sent Trend (last 14 days)
    const dailyTrend = await query(`
      SELECT DATE(sent_at) as date, COUNT(*) as sent_count, COUNT(opened_at) as opened_count
      FROM email_tracking
      WHERE user_id = $1 AND sent_at >= NOW() - INTERVAL '14 days'
      GROUP BY DATE(sent_at)
      ORDER BY date ASC
    `, [userId]);

    res.json({
      tracking: trackingStats.rows[0],
      outbox: outboxStats.rows[0],
      topRecipients: topRecipients.rows,
      dailyTrend: dailyTrend.rows
    });
  } catch (err) {
    res.status(500).json({ error: err.message || 'Failed to generate analytics overview.' });
  }
});

export default router;
