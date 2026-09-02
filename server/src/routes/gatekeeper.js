import { Router } from 'express';
import { requireAuth } from '../middleware/auth.js';
import { query } from '../config/database.js';
import {
  parseSender,
  classifySender,
  setScreenerDecision,
  listScreenerRules,
  deleteScreenerRule
} from '../services/screenerService.js';
import { createConnection, fetchMessages } from '../services/imap.js';
import pino from 'pino';

const logger = pino({ name: 'woxmail:gatekeeper' });
const router = Router();
router.use(requireAuth);

/**
 * GET /api/screener/pending
 * Scan recent inbox messages for unclassified/pending senders
 */
router.get('/pending', async (req, res, next) => {
  try {
    const user = req.user;
    const userPass = user.purelymail_password || process.env.ADMIN_PASSWORD;

    let client;
    try {
      client = await createConnection(user.email, userPass);
    } catch (err) {
      logger.warn({ err: err.message }, 'Failed to connect to IMAP for screener scan');
      return res.json({ pending: [], total: 0 });
    }

    const { messages = [] } = await fetchMessages(client, 'INBOX', { page: 1, limit: 30 });
    await client.logout().catch(() => {});

    const pendingMap = new Map();

    for (const msg of messages) {
      const fromHeader = msg.from?.text || (msg.from?.address ? `${msg.from.name || ''} <${msg.from.address}>` : '');
      const classification = await classifySender(req.userId, fromHeader);

      if (classification.status === 'pending' && classification.senderEmail) {
        if (!pendingMap.has(classification.senderEmail)) {
          pendingMap.set(classification.senderEmail, {
            email: classification.senderEmail,
            domain: classification.senderDomain,
            name: msg.from?.name || parseSender(fromHeader).name,
            firstSubject: msg.subject || '(No Subject)',
            firstSeenAt: msg.date || new Date().toISOString(),
            uid: msg.uid,
            totalEmails: 1
          });
        } else {
          const item = pendingMap.get(classification.senderEmail);
          item.totalEmails += 1;
        }
      }
    }

    const pending = Array.from(pendingMap.values());
    res.json({ pending, total: pending.length });
  } catch (err) {
    next(err);
  }
});

/**
 * GET /api/screener/pending/count
 * Return pending count for sidebar badges
 */
router.get('/pending/count', async (req, res, next) => {
  try {
    const user = req.user;
    const userPass = user.purelymail_password || process.env.ADMIN_PASSWORD;

    let client;
    try {
      client = await createConnection(user.email, userPass);
    } catch (err) {
      return res.json({ count: 0 });
    }

    const { messages = [] } = await fetchMessages(client, 'INBOX', { page: 1, limit: 20 });
    await client.logout().catch(() => {});

    const pendingEmails = new Set();
    for (const msg of messages) {
      const fromHeader = msg.from?.text || msg.from?.address || '';
      const classification = await classifySender(req.userId, fromHeader);
      if (classification.status === 'pending' && classification.senderEmail) {
        pendingEmails.add(classification.senderEmail);
      }
    }

    res.json({ count: pendingEmails.size });
  } catch (err) {
    next(err);
  }
});

/**
 * POST /api/screener/decide
 * Classify a sender into inbox, feed, paper_trail, or blocked
 */
router.post('/decide', async (req, res, next) => {
  try {
    const { senderPattern, matchType = 'exact', destination = 'inbox' } = req.body;

    if (!senderPattern) {
      return res.status(400).json({ error: 'senderPattern is required' });
    }

    const validDestinations = ['inbox', 'feed', 'paper_trail', 'blocked'];
    if (!validDestinations.includes(destination)) {
      return res.status(400).json({ error: `Invalid destination. Must be one of: ${validDestinations.join(', ')}` });
    }

    const rule = await setScreenerDecision(req.userId, senderPattern, matchType, destination);
    res.json({ success: true, rule });
  } catch (err) {
    next(err);
  }
});

/**
 * GET /api/screener/rules
 * List all active screener rules for user
 */
router.get('/rules', async (req, res, next) => {
  try {
    const rules = await listScreenerRules(req.userId);
    res.json({ rules });
  } catch (err) {
    next(err);
  }
});

/**
 * PUT /api/screener/rules/:id
 * Update rule destination
 */
router.put('/rules/:id', async (req, res, next) => {
  try {
    const { id } = req.params;
    const { destination, matchType } = req.body;

    const current = await query('SELECT * FROM screener_rules WHERE id = $1 AND user_id = $2', [id, req.userId]);
    if (current.rows.length === 0) {
      return res.status(404).json({ error: 'Rule not found' });
    }

    const updated = await setScreenerDecision(
      req.userId,
      current.rows[0].sender_pattern,
      matchType || current.rows[0].match_type,
      destination || current.rows[0].destination
    );

    res.json({ success: true, rule: updated });
  } catch (err) {
    next(err);
  }
});

/**
 * DELETE /api/screener/rules/:id
 * Remove rule
 */
router.delete('/rules/:id', async (req, res, next) => {
  try {
    const { id } = req.params;
    const deleted = await deleteScreenerRule(req.userId, parseInt(id, 10));
    if (!deleted) {
      return res.status(404).json({ error: 'Rule not found' });
    }
    res.json({ success: true, message: 'Rule removed' });
  } catch (err) {
    next(err);
  }
});

export default router;
