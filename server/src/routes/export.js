import { Router } from 'express';
import { requireAuth } from '../middleware/auth.js';
import * as exportService from '../services/exportService.js';
import * as imapService from '../services/imap.js';
import { query } from '../config/database.js';

const router = Router();
router.use(requireAuth);

/**
 * GET /api/export/eml/:uid — Download single message as .eml
 */
router.get('/eml/:uid', async (req, res, next) => {
  try {
    const uid = parseInt(req.params.uid, 10);
    const folder = req.query.folder || 'INBOX';

    // Get IMAP connection (import dynamically to avoid circular deps)
    const creds = await query('SELECT imap_password FROM users WHERE id = $1', [req.user.id]);
    const password = creds.rows[0]?.imap_password;
    if (!password) return res.status(500).json({ error: 'IMAP credentials not configured' });

    const client = await imapService.createConnection(req.user.email, password);
    try {
      const result = await exportService.exportAsEml(client, folder, uid);
      res.setHeader('Content-Type', result.contentType);
      res.setHeader('Content-Disposition', `attachment; filename="${result.filename}"`);
      res.send(result.content);
    } finally {
      try { await client.logout(); } catch {}
    }
  } catch (err) {
    next(err);
  }
});

/**
 * GET /api/export/mbox — Download entire folder as .mbox
 */
router.get('/mbox', async (req, res, next) => {
  try {
    const folder = req.query.folder || 'INBOX';
    const limit = parseInt(req.query.limit, 10) || 500;

    const creds = await query('SELECT imap_password FROM users WHERE id = $1', [req.user.id]);
    const password = creds.rows[0]?.imap_password;
    if (!password) return res.status(500).json({ error: 'IMAP credentials not configured' });

    const client = await imapService.createConnection(req.user.email, password);
    try {
      const result = await exportService.exportAsMbox(client, folder, { limit });
      res.setHeader('Content-Type', result.contentType);
      res.setHeader('Content-Disposition', `attachment; filename="${result.filename}"`);
      res.send(result.content);
    } finally {
      try { await client.logout(); } catch {}
    }
  } catch (err) {
    next(err);
  }
});

export default router;
