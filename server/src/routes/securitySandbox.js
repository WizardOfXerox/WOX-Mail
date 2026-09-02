/**
 * Security Sandbox & Link Isolation API Routes
 */

import { Router } from 'express';
import { inspectLink, renderSafeReader, stripTrackingParams } from '../services/linkSandboxService.js';
import { requireAuth } from '../middleware/auth.js';
import { query } from '../config/database.js';
import pino from 'pino';

const logger = pino({ name: 'security-sandbox' });
const router = Router();

/**
 * POST /api/security/inspect-link
 * Audits a destination URL, resolves redirect chain, strips marketing trackers, and assesses risk.
 */
router.post('/inspect-link', requireAuth, async (req, res) => {
  try {
    const { url } = req.body;
    if (!url) {
      return res.status(400).json({ error: 'Target URL is required' });
    }

    const report = await inspectLink(url);
    return res.json({ success: true, report });
  } catch (err) {
    logger.error({ err, url: req.body?.url }, 'Failed to inspect link in sandbox');
    return res.status(500).json({ error: err.message || 'Failed to inspect link' });
  }
});

/**
 * GET /api/security/reader-view?url=...
 * Returns a clean, script-free sanitized reader mode view of the requested URL.
 */
router.get('/reader-view', requireAuth, async (req, res) => {
  try {
    const { url } = req.query;
    if (!url) {
      return res.status(400).json({ error: 'URL query parameter is required' });
    }

    const reader = await renderSafeReader(String(url));
    return res.json({ success: true, reader });
  } catch (err) {
    logger.error({ err, url: req.query?.url }, 'Failed to generate safe reader view');
    return res.status(500).json({ error: err.message || 'Failed to render reader view' });
  }
});

/**
 * GET /api/security/proxy-image?url=...
 * Proxies external images through WoxMail backend to cloak user IP and strip EXIF tracking.
 */
router.get('/proxy-image', async (req, res) => {
  try {
    const rawUrl = req.query.url;
    if (!rawUrl || typeof rawUrl !== 'string') {
      return res.status(400).send('Missing url');
    }

    const parsed = new URL(rawUrl);
    if (!['http:', 'https:'].includes(parsed.protocol)) {
      return res.status(400).send('Invalid protocol');
    }

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 6000);

    const upstream = await fetch(rawUrl, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) WoxMailImageProxy/1.0',
        'Accept': 'image/avif,image/webp,image/apng,image/svg+xml,image/*,*/*;q=0.8',
      },
      signal: controller.signal,
    });

    clearTimeout(timeout);

    if (!upstream.ok) {
      return res.status(upstream.status).send('Failed to fetch image upstream');
    }

    const contentType = upstream.headers.get('content-type') || 'image/png';
    res.setHeader('Content-Type', contentType);
    res.setHeader('Cache-Control', 'public, max-age=86400, s-maxage=86400, immutable');
    res.setHeader('X-Content-Type-Options', 'nosniff');

    const buffer = await upstream.arrayBuffer();
    return res.send(Buffer.from(buffer));
  } catch (err) {
    logger.warn({ err, url: req.query?.url }, 'Failed to proxy remote image');
    return res.status(502).send('Image proxy error');
  }
});

/**
 * GET /api/security/privacy-prefs
 * Retrieves user's security & privacy preferences.
 */
router.get('/privacy-prefs', requireAuth, async (req, res) => {
  try {
    const userId = req.user.id;
    const { rows } = await query('SELECT * FROM user_privacy_preferences WHERE user_id = $1', [userId]);
    if (rows.length === 0) {
      return res.json({
        prefs: {
          remoteImages: 'proxy_cloak',
          trustedSenders: [],
          allowScripts: false,
          interceptLinks: true,
          blockWebFonts: true,
          disarmForms: true,
          homographShield: true,
          stripMarketingRedirects: true,
          authFailurePolicy: 'warning',
        },
      });
    }
    return res.json({ prefs: rows[0] });
  } catch (err) {
    logger.error({ err, userId: req.user?.id }, 'Failed to get privacy preferences');
    return res.status(500).json({ error: 'Failed to retrieve privacy preferences' });
  }
});

/**
 * POST /api/security/privacy-prefs
 * Updates user's security & privacy preferences.
 */
router.post('/privacy-prefs', requireAuth, async (req, res) => {
  try {
    const userId = req.user.id;
    const prefs = req.body.prefs || {};

    await query(
      `INSERT INTO user_privacy_preferences
        (user_id, remote_images, trusted_senders, allow_scripts, intercept_links, block_web_fonts, disarm_forms, homograph_shield, strip_marketing_redirects, auth_failure_policy, updated_at)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, NOW())
       ON CONFLICT (user_id) DO UPDATE SET
        remote_images = EXCLUDED.remote_images,
        trusted_senders = EXCLUDED.trusted_senders,
        allow_scripts = EXCLUDED.allow_scripts,
        intercept_links = EXCLUDED.intercept_links,
        block_web_fonts = EXCLUDED.block_web_fonts,
        disarm_forms = EXCLUDED.disarm_forms,
        homograph_shield = EXCLUDED.homograph_shield,
        strip_marketing_redirects = EXCLUDED.strip_marketing_redirects,
        auth_failure_policy = EXCLUDED.auth_failure_policy,
        updated_at = NOW()`,
      [
        userId,
        prefs.remoteImages || 'proxy_cloak',
        JSON.stringify(prefs.trustedSenders || []),
        Boolean(prefs.allowScripts),
        prefs.interceptLinks !== false,
        prefs.blockWebFonts !== false,
        prefs.disarmForms !== false,
        prefs.homographShield !== false,
        prefs.stripMarketingRedirects !== false,
        prefs.authFailurePolicy || 'warning',
      ]
    );

    return res.json({ success: true, prefs });
  } catch (err) {
    logger.error({ err, userId: req.user?.id }, 'Failed to save privacy preferences');
    return res.status(500).json({ error: 'Failed to save privacy preferences' });
  }
});

export default router;
