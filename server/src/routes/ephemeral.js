import { Router } from 'express';
import { authenticate, loadUser } from '../middleware/auth.js';
import { validate } from '../middleware/validate.js';
import { renderStreamSvg, renderStreamPng, sendEphemeralStreamEmail } from '../services/ephemeralStreamService.js';
import { query } from '../config/database.js';

const router = Router();

/**
 * Common Headers for Comprehensive Anti-Caching (Google Proxy, Outlook CDN, Cloudflare)
 */
function setAntiCacheHeaders(res, contentType = 'image/png') {
  res.setHeader('Content-Type', contentType);
  res.setHeader('Cache-Control', 'private, no-cache, no-store, must-revalidate, post-check=0, pre-check=0, max-age=0, s-maxage=0, no-transform');
  res.setHeader('Pragma', 'no-cache');
  res.setHeader('Expires', 'Thu, 01 Jan 1970 00:00:00 GMT');
  res.setHeader('Surrogate-Control', 'no-store');
  res.setHeader('CDN-Cache-Control', 'no-store');
  res.setHeader('Cloudflare-CDN-Cache-Control', 'no-store');
  res.setHeader('Vary', '*');
  res.removeHeader('ETag');
  res.removeHeader('Last-Modified');
}

/**
 * GET /api/ephemeral/render/:token.png & /api/ephemeral/render/:token
 * High-Resolution Raster PNG Stream (100% compatible with Google Image Proxy & Mobile Inboxes)
 */
router.get('/render/:token.png', async (req, res) => {
  const token = (req.params.token || '').replace(/\.png$/i, '');
  setAntiCacheHeaders(res, 'image/png');

  const userAgent = req.headers['user-agent'] || '';
  const via = req.headers['via'] || '';
  const ip = (req.headers['cf-connecting-ip'] || req.headers['x-forwarded-for'] || req.socket?.remoteAddress || '').split(',')[0].trim();

  try {
    const pngBuffer = await renderStreamPng(token, { userAgent, via, ip });
    res.status(200).send(pngBuffer);
  } catch (err) {
    res.status(500).send(Buffer.alloc(0));
  }
});

/**
 * GET /api/ephemeral/render/:token.svg
 * Vector SVG Stream
 */
router.get('/render/:token.svg', async (req, res) => {
  const token = (req.params.token || '').replace(/\.svg$/i, '');
  setAntiCacheHeaders(res, 'image/svg+xml; charset=utf-8');

  const userAgent = req.headers['user-agent'] || '';
  const via = req.headers['via'] || '';
  const ip = (req.headers['cf-connecting-ip'] || req.headers['x-forwarded-for'] || req.socket?.remoteAddress || '').split(',')[0].trim();

  try {
    const svg = await renderStreamSvg(token, { userAgent, via, ip });
    res.status(200).send(svg);
  } catch (err) {
    res.status(500).send('<svg xmlns="http://www.w3.org/2000/svg" width="600" height="150"><rect width="600" height="150" fill="#14101e"/><text x="300" y="80" fill="#ef4444" font-family="sans-serif" font-size="16" text-anchor="middle">Stream Error</text></svg>');
  }
});

/**
 * GET /api/ephemeral/render/:token (Default fallback to PNG)
 */
router.get('/render/:token', async (req, res) => {
  const rawToken = req.params.token || '';
  if (rawToken.endsWith('.svg')) {
    return router.handle(req, res);
  }
  const token = rawToken.replace(/\.png$/i, '');
  setAntiCacheHeaders(res, 'image/png');

  const userAgent = req.headers['user-agent'] || '';
  const via = req.headers['via'] || '';
  const ip = (req.headers['cf-connecting-ip'] || req.headers['x-forwarded-for'] || req.socket?.remoteAddress || '').split(',')[0].trim();

  try {
    const pngBuffer = await renderStreamPng(token, { userAgent, via, ip });
    res.status(200).send(pngBuffer);
  } catch (err) {
    res.status(500).send(Buffer.alloc(0));
  }
});

/**
 * POST /api/ephemeral/send
 * Create and dispatch a Zero-Click In-Inbox Dynamic Self-Destructing Email
 */
router.post(
  '/send',
  authenticate,
  loadUser,
  validate({
    recipientEmail: { type: 'email', required: true },
    subject: { type: 'string', required: true, max: 255 },
    content: { type: 'string', required: true },
    maxViews: { type: 'number' },
    expirationHours: { type: 'number' },
  }),
  async (req, res, next) => {
    try {
      const { recipientEmail, subject, content, maxViews = 1, expirationHours = 24 } = req.body;
      const senderId = req.user.id;
      const senderEmail = req.user.email;

      const userRes = await query('SELECT imap_password FROM users WHERE id = $1', [senderId]);
      const senderPass = userRes.rows[0]?.imap_password || (process.env.ADMIN_PASSWORD || '').replace(/^['"]|['"]$/g, '');

      const result = await sendEphemeralStreamEmail({
        senderId,
        senderEmail,
        senderPass,
        recipientEmail,
        subject,
        content,
        maxViews: Math.max(1, parseInt(maxViews, 10) || 1),
        expirationHours: Math.min(876000, Math.max(1, parseInt(expirationHours, 10) || 24)),
      });

      res.status(201).json({
        message: 'In-Inbox Self-Destructing email dispatched successfully',
        ...result,
      });
    } catch (err) {
      next(err);
    }
  }
);

export default router;
