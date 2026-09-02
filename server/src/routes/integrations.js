import { Router } from 'express';
import { requireAuth } from '../middleware/auth.js';
import { query } from '../config/database.js';
import { testChatRule } from '../services/chatForwardService.js';
import { encryptCredentials, decryptCredentials } from '../services/accountService.js';

const router = Router();
router.use(requireAuth);

/**
 * GET /api/integrations/chat
 * List all chat forward rules for user
 */
router.get('/chat', async (req, res) => {
  try {
    const rules = await query(`
      SELECT id, platform, name, webhook_url, chat_id, filter_criteria, is_active, deliveries_count, last_delivery_at, created_at
      FROM chat_forward_rules
      WHERE user_id = $1
      ORDER BY created_at DESC
    `, [req.user.id]);
    res.json({ rules: rules.rows });
  } catch (err) {
    res.status(500).json({ error: err.message || 'Failed to list chat rules.' });
  }
});

/**
 * POST /api/integrations/chat
 * Create a new chat forward rule
 */
router.post('/chat', async (req, res) => {
  try {
    const { platform, name, webhook_url, bot_token, chat_id, filter_criteria } = req.body;
    if (!platform || !name) {
      return res.status(400).json({ error: 'Platform and rule name are required.' });
    }

    // BUG-5 fix: validate filter_criteria schema
    let safeCriteria = { forward_all: true };
    if (filter_criteria && typeof filter_criteria === 'object') {
      safeCriteria = {};
      if (typeof filter_criteria.forward_all === 'boolean') safeCriteria.forward_all = filter_criteria.forward_all;
      if (typeof filter_criteria.from === 'string') safeCriteria.from = filter_criteria.from.substring(0, 200);
      if (typeof filter_criteria.subject === 'string') safeCriteria.subject = filter_criteria.subject.substring(0, 200);
      if (!safeCriteria.forward_all && !safeCriteria.from && !safeCriteria.subject) {
        safeCriteria.forward_all = true;
      }
    }

    // SEC-2 fix: encrypt bot_token before storage
    let storedBotToken = null;
    if (bot_token) {
      const enc = encryptCredentials(bot_token);
      storedBotToken = `${enc.ciphertext}:${enc.iv}:${enc.authTag}`;
    }

    const insertRes = await query(`
      INSERT INTO chat_forward_rules (user_id, platform, name, webhook_url, bot_token, chat_id, filter_criteria)
      VALUES ($1, $2, $3, $4, $5, $6, $7)
      RETURNING id, platform, name, webhook_url, chat_id, filter_criteria, is_active, created_at
    `, [req.user.id, platform, name, webhook_url || null, storedBotToken, chat_id || null, safeCriteria]);

    res.status(201).json({ message: 'Chat forward rule created.', rule: insertRes.rows[0] });
  } catch (err) {
    res.status(400).json({ error: err.message || 'Failed to create rule.' });
  }
});

/**
 * POST /api/integrations/chat/test
 * Test chat forward credentials
 */
router.post('/chat/test', async (req, res) => {
  try {
    const result = await testChatRule(req.body);
    res.json({ message: 'Test message dispatched successfully!', result });
  } catch (err) {
    res.status(400).json({ error: err.message || 'Test dispatch failed.' });
  }
});

/**
 * DELETE /api/integrations/chat/:id
 * Delete a chat forward rule
 */
router.delete('/chat/:id', async (req, res) => {
  try {
    const delRes = await query(`
      DELETE FROM chat_forward_rules
      WHERE id = $1 AND user_id = $2
      RETURNING id
    `, [req.params.id, req.user.id]);
    if (!delRes.rows.length) {
      return res.status(404).json({ error: 'Rule not found.' });
    }
    res.json({ message: 'Rule deleted.' });
  } catch (err) {
    res.status(500).json({ error: err.message || 'Failed to delete rule.' });
  }
});

/**
 * POST /api/integrations/reactions
 * Add an emoji reaction to an email
 */
router.post('/reactions', async (req, res) => {
  try {
    const { message_uid, folder = 'INBOX', reaction } = req.body;
    if (!message_uid || !reaction) {
      return res.status(400).json({ error: 'Message UID and reaction emoji are required.' });
    }

    const insertRes = await query(`
      INSERT INTO email_reactions (user_id, message_uid, folder, reaction, sender_email)
      VALUES ($1, $2, $3, $4, $5)
      ON CONFLICT (user_id, message_uid, folder, reaction) DO NOTHING
      RETURNING *
    `, [req.user.id, message_uid, folder, reaction, req.user.email]);

    res.json({ reaction: insertRes.rows[0] || { message_uid, folder, reaction } });
  } catch (err) {
    res.status(400).json({ error: err.message || 'Failed to record reaction.' });
  }
});

/**
 * GET /api/integrations/reactions
 * Get reactions for a message
 */
router.get('/reactions', async (req, res) => {
  try {
    const { message_uid, folder = 'INBOX' } = req.query;
    const reactRes = await query(`
      SELECT reaction, COUNT(*) as count, ARRAY_AGG(sender_email) as senders
      FROM email_reactions
      WHERE user_id = $1 AND message_uid = $2 AND folder = $3
      GROUP BY reaction
    `, [req.user.id, message_uid, folder]);
    res.json({ reactions: reactRes.rows });
  } catch (err) {
    res.status(500).json({ error: err.message || 'Failed to fetch reactions.' });
  }
});

export default router;
