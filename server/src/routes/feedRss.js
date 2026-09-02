import { Router } from 'express';
import crypto from 'crypto';
import { query } from '../config/database.js';
import * as imapService from '../services/imap.js';
import { authenticate, loadUser } from '../middleware/auth.js';
import pino from 'pino';

const logger = pino({ name: 'woxmail:feed-rss' });
const router = Router();

/**
 * GET /feeds/:token/the-feed.xml
 * Public XML RSS feed for user's newsletters in "The Feed"
 */
router.get('/:token/the-feed.xml', async (req, res, next) => {
  try {
    const { token } = req.params;
    const userRes = await query(
      'SELECT * FROM users WHERE feed_rss_token = $1 AND feed_rss_enabled = TRUE',
      [token]
    );

    if (userRes.rows.length === 0) {
      return res.status(404).send('RSS Feed not found or disabled.');
    }

    const user = userRes.rows[0];
    let messages = [];

    if (user.imap_password) {
      try {
        const client = await imapService.createConnection(user.email, user.imap_password);
        const fetched = await imapService.fetchMessages(client, 'The Feed', { page: 1, limit: 25 });
        messages = fetched.messages || [];
        await client.logout().catch(() => {});
      } catch (imapErr) {
        logger.warn({ err: imapErr.message }, 'Could not connect to IMAP for RSS feed stream');
      }
    }

    const baseUrl = process.env.APP_URL || 'http://127.0.0.1:3001';
    const feedItemsXml = messages.map(m => {
      const title = (m.subject || '(No Subject)').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
      const author = (m.from?.name || m.from?.address || 'Newsletter').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
      const pubDate = m.date ? new Date(m.date).toUTCString() : new Date().toUTCString();
      const guid = `woxmail-msg-${m.uid}-${m.messageId || ''}`;

      return `
        <item>
          <title>${title}</title>
          <author>${author}</author>
          <pubDate>${pubDate}</pubDate>
          <guid isPermaLink="false">${guid}</guid>
          <link>${baseUrl}/dashboard</link>
          <description><![CDATA[${m.snippet || title}]]></description>
        </item>
      `;
    }).join('\n');

    const rssXml = `<?xml version="1.0" encoding="UTF-8" ?>
<rss version="2.0" xmlns:atom="http://www.w3.org/2005/Atom">
<channel>
  <title>The Feed — ${user.username}'s Curated Newsletters</title>
  <link>${baseUrl}/dashboard</link>
  <description>Private RSS stream of newsletters and publications received on WoxMail.</description>
  <language>en-us</language>
  <lastBuildDate>${new Date().toUTCString()}</lastBuildDate>
  <atom:link href="${baseUrl}/feeds/${token}/the-feed.xml" rel="self" type="application/rss+xml" />
  ${feedItemsXml}
</channel>
</rss>`;

    res.setHeader('Content-Type', 'application/rss+xml; charset=utf-8');
    res.send(rssXml);
  } catch (err) {
    next(err);
  }
});

/**
 * POST /api/settings/feed-rss/token
 * Generate or reset user's RSS feed token
 */
router.post('/token', authenticate, loadUser, async (req, res, next) => {
  try {
    const token = crypto.randomBytes(24).toString('hex');
    await query(
      'UPDATE users SET feed_rss_token = $1, feed_rss_enabled = TRUE WHERE id = $2',
      [token, req.user.id]
    );

    const baseUrl = process.env.APP_URL || 'http://127.0.0.1:3001';
    res.json({
      token,
      feedUrl: `${baseUrl}/feeds/${token}/the-feed.xml`,
      message: 'RSS Feed token generated successfully.',
    });
  } catch (err) {
    next(err);
  }
});

export default router;
