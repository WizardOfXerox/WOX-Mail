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
      let client;
      try {
        client = await imapService.createConnection(user.email, user.imap_password);
        const fetched = await imapService.fetchMessages(client, 'The Feed', { page: 1, limit: 25 });
        messages = fetched.messages || [];
      } catch (imapErr) {
        logger.warn({ err: imapErr.message }, 'Could not connect to IMAP for RSS feed stream');
      } finally {
        if (client) await client.logout().catch(() => {});
      }
    }

    const escXml = (s) =>
      String(s ?? '')
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&apos;');
    const escCdata = (s) => String(s ?? '').replace(/]]>/g, ']]]]><![CDATA[>');

    const baseUrl = process.env.APP_URL || 'http://127.0.0.1:3001';
    const feedItemsXml = messages.map(m => {
      const title = escXml(m.subject || '(No Subject)');
      const author = escXml(m.from?.name || m.from?.address || 'Newsletter');
      const parsedDate = m.date ? new Date(m.date) : null;
      const pubDate = (parsedDate && !isNaN(parsedDate.getTime())) ? parsedDate.toUTCString() : new Date().toUTCString();
      const guid = escXml(`woxmail-msg-${m.uid}-${m.messageId || ''}`);

      return `
        <item>
          <title>${title}</title>
          <author>${author}</author>
          <pubDate>${pubDate}</pubDate>
          <guid isPermaLink="false">${guid}</guid>
          <link>${escXml(baseUrl)}/dashboard</link>
          <description><![CDATA[${escCdata(m.snippet || m.subject || '(No Subject)')}]]></description>
        </item>
      `;
    }).join('\n');

    const rssXml = `<?xml version="1.0" encoding="UTF-8" ?>
<rss version="2.0" xmlns:atom="http://www.w3.org/2005/Atom">
<channel>
  <title>The Feed — ${escXml(user.username)}'s Curated Newsletters</title>
  <link>${escXml(baseUrl)}/dashboard</link>
  <description>Private RSS stream of newsletters and publications received on WoxMail.</description>
  <language>en-us</language>
  <lastBuildDate>${new Date().toUTCString()}</lastBuildDate>
  <atom:link href="${escXml(baseUrl)}/feeds/${escXml(token)}/the-feed.xml" rel="self" type="application/rss+xml" />
  ${feedItemsXml}
</channel>
</rss>`;

    res.setHeader('Content-Type', 'application/rss+xml; charset=utf-8');
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('Content-Security-Policy', "default-src 'none'; sandbox");
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
