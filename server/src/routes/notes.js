import { Router } from 'express';
import crypto from 'crypto';
import { requireAuth } from '../middleware/auth.js';
import { query } from '../config/database.js';
import pino from 'pino';

const logger = pino({ name: 'woxmail:notes' });
const router = Router();
router.use(requireAuth);

/**
 * Derive 256-bit encryption key per user
 */
async function getUserKey(userId) {
  const userRes = await query('SELECT password_hash FROM users WHERE id = $1', [userId]);
  const secret = userRes.rows[0]?.password_hash || `user-secret-salt-${userId}`;
  return crypto.pbkdf2Sync(secret, 'woxmail-private-notes-salt-v1', 100000, 32, 'sha256');
}

/**
 * Encrypt note text with AES-256-CBC
 */
function encryptNote(text, key) {
  const iv = crypto.randomBytes(16);
  const cipher = crypto.createCipheriv('aes-256-cbc', key, iv);
  let encrypted = cipher.update(text || '', 'utf8', 'hex');
  encrypted += cipher.final('hex');
  return {
    encryptedText: encrypted,
    iv: iv.toString('hex')
  };
}

/**
 * Decrypt note text with AES-256-CBC
 */
function decryptNote(encryptedHex, ivHex, key) {
  try {
    if (!encryptedHex || !ivHex) return '';
    const iv = Buffer.from(ivHex, 'hex');
    const decipher = crypto.createDecipheriv('aes-256-cbc', key, iv);
    let decrypted = decipher.update(encryptedHex, 'hex', 'utf8');
    decrypted += decipher.final('utf8');
    return decrypted;
  } catch (err) {
    logger.warn({ err: err.message }, 'Failed to decrypt email note');
    return '[Encrypted Note — Decryption Error]';
  }
}

// ══════════════════════════════════════════════════════════════════════════
// STANDALONE USER NOTES & CHECKLISTS VAULT
// ══════════════════════════════════════════════════════════════════════════

/**
 * GET /api/notes/vault
 * List all standalone notes and checklists for the current user
 */
router.get('/vault', async (req, res, next) => {
  try {
    const key = await getUserKey(req.userId);
    const result = await query(
      `SELECT id, title, content_encrypted, iv, color, is_pinned, is_checklist, tags, linked_message_uid, created_at, updated_at
       FROM user_notes
       WHERE user_id = $1
       ORDER BY is_pinned DESC, updated_at DESC`,
      [req.userId]
    );

    const notes = result.rows.map(row => ({
      id: row.id,
      title: row.title || 'Untitled Note',
      content: decryptNote(row.content_encrypted, row.iv, key),
      color: row.color || 'purple',
      isPinned: Boolean(row.is_pinned),
      isChecklist: Boolean(row.is_checklist),
      tags: row.tags || [],
      linkedMessageUid: row.linked_message_uid || null,
      createdAt: row.created_at,
      updatedAt: row.updated_at
    }));

    res.json({ notes });
  } catch (err) {
    next(err);
  }
});

/**
 * POST /api/notes/vault
 * Create a new standalone note or interactive checklist
 */
router.post('/vault', async (req, res, next) => {
  try {
    const {
      title = 'Untitled Note',
      content = '',
      color = 'purple',
      isPinned = false,
      isChecklist = false,
      tags = [],
      linkedMessageUid = null
    } = req.body;

    const key = await getUserKey(req.userId);
    const { encryptedText, iv } = encryptNote(content, key);

    const result = await query(
      `INSERT INTO user_notes (user_id, title, content_encrypted, iv, color, is_pinned, is_checklist, tags, linked_message_uid, updated_at)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, NOW())
       RETURNING id, title, color, is_pinned, is_checklist, tags, linked_message_uid, created_at, updated_at`,
      [req.userId, title.trim() || 'Untitled Note', encryptedText, iv, color, Boolean(isPinned), Boolean(isChecklist), tags, linkedMessageUid]
    );

    const row = result.rows[0];
    res.status(201).json({
      success: true,
      note: {
        id: row.id,
        title: row.title,
        content,
        color: row.color,
        isPinned: Boolean(row.is_pinned),
        isChecklist: Boolean(row.is_checklist),
        tags: row.tags || [],
        linkedMessageUid: row.linked_message_uid,
        createdAt: row.created_at,
        updatedAt: row.updated_at
      }
    });
  } catch (err) {
    next(err);
  }
});

/**
 * PUT /api/notes/vault/:id
 * Update an existing note in the user's vault
 */
router.put('/vault/:id', async (req, res, next) => {
  try {
    const { id } = req.params;
    const {
      title,
      content,
      color,
      isPinned,
      isChecklist,
      tags,
      linkedMessageUid
    } = req.body;

    // Check ownership
    const existing = await query('SELECT id, content_encrypted, iv FROM user_notes WHERE id = $1 AND user_id = $2', [id, req.userId]);
    if (existing.rows.length === 0) {
      return res.status(404).json({ error: 'Note not found' });
    }

    let encryptedText = existing.rows[0].content_encrypted;
    let iv = existing.rows[0].iv;

    if (content !== undefined) {
      const key = await getUserKey(req.userId);
      const enc = encryptNote(content, key);
      encryptedText = enc.encryptedText;
      iv = enc.iv;
    }

    const result = await query(
      `UPDATE user_notes SET
         title = COALESCE($1, title),
         content_encrypted = $2,
         iv = $3,
         color = COALESCE($4, color),
         is_pinned = COALESCE($5, is_pinned),
         is_checklist = COALESCE($6, is_checklist),
         tags = COALESCE($7, tags),
         linked_message_uid = COALESCE($8, linked_message_uid),
         updated_at = NOW()
       WHERE id = $9 AND user_id = $10
       RETURNING id, title, color, is_pinned, is_checklist, tags, linked_message_uid, created_at, updated_at`,
      [
        title !== undefined ? title.trim() : null,
        encryptedText,
        iv,
        color || null,
        isPinned !== undefined ? Boolean(isPinned) : null,
        isChecklist !== undefined ? Boolean(isChecklist) : null,
        tags || null,
        linkedMessageUid !== undefined ? linkedMessageUid : null,
        id,
        req.userId
      ]
    );

    const row = result.rows[0];
    res.json({
      success: true,
      note: {
        id: row.id,
        title: row.title,
        content: content !== undefined ? content : undefined,
        color: row.color,
        isPinned: Boolean(row.is_pinned),
        isChecklist: Boolean(row.is_checklist),
        tags: row.tags || [],
        linkedMessageUid: row.linked_message_uid,
        createdAt: row.created_at,
        updatedAt: row.updated_at
      }
    });
  } catch (err) {
    next(err);
  }
});

/**
 * DELETE /api/notes/vault/:id
 * Delete a note from the user's vault
 */
router.delete('/vault/:id', async (req, res, next) => {
  try {
    const { id } = req.params;
    const result = await query('DELETE FROM user_notes WHERE id = $1 AND user_id = $2 RETURNING id', [id, req.userId]);
    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Note not found' });
    }
    res.json({ success: true, message: 'Note deleted' });
  } catch (err) {
    next(err);
  }
});

// ══════════════════════════════════════════════════════════════════════════
// EMAIL-THREAD SPECIFIC STICKY NOTES
// ══════════════════════════════════════════════════════════════════════════

/**
 * GET /api/notes
 * List all email-attached notes for the current user
 */
router.get('/', async (req, res, next) => {
  try {
    const key = await getUserKey(req.userId);
    const result = await query(
      `SELECT id, message_uid, folder, note_text, iv, color, created_at, updated_at
       FROM email_notes
       WHERE user_id = $1
       ORDER BY updated_at DESC`,
      [req.userId]
    );

    const notes = result.rows.map(row => ({
      id: row.id,
      messageUid: row.message_uid,
      folder: row.folder,
      noteText: decryptNote(row.note_text, row.iv, key),
      color: row.color,
      createdAt: row.created_at,
      updatedAt: row.updated_at
    }));

    res.json({ notes });
  } catch (err) {
    next(err);
  }
});

/**
 * GET /api/notes/:uid
 * Retrieve private note attached to a message
 */
router.get('/:uid', async (req, res, next) => {
  try {
    const { uid } = req.params;
    const folder = req.query.folder || 'INBOX';

    const result = await query(
      `SELECT id, message_uid, folder, note_text, iv, color, created_at, updated_at
       FROM email_notes
       WHERE user_id = $1 AND message_uid = $2 AND folder = $3`,
      [req.userId, String(uid), folder]
    );

    if (result.rows.length === 0) {
      return res.json({ note: null });
    }

    const row = result.rows[0];
    const key = await getUserKey(req.userId);
    const decryptedText = decryptNote(row.note_text, row.iv, key);

    res.json({
      note: {
        id: row.id,
        messageUid: row.message_uid,
        folder: row.folder,
        noteText: decryptedText,
        color: row.color,
        createdAt: row.created_at,
        updatedAt: row.updated_at
      }
    });
  } catch (err) {
    next(err);
  }
});

/**
 * PUT /api/notes/:uid
 * Create or update private sticky note on an email thread
 */
router.put('/:uid', async (req, res, next) => {
  try {
    const { uid } = req.params;
    const { folder = 'INBOX', noteText = '', color = 'yellow' } = req.body;

    if (!noteText.trim()) {
      await query(
        `DELETE FROM email_notes WHERE user_id = $1 AND message_uid = $2 AND folder = $3`,
        [req.userId, String(uid), folder]
      );
      return res.json({ success: true, note: null });
    }

    const key = await getUserKey(req.userId);
    const { encryptedText, iv } = encryptNote(noteText, key);

    const result = await query(
      `INSERT INTO email_notes (user_id, message_uid, folder, note_text, iv, color, updated_at)
       VALUES ($1, $2, $3, $4, $5, $6, NOW())
       ON CONFLICT (user_id, message_uid, folder)
       DO UPDATE SET
         note_text = EXCLUDED.note_text,
         iv = EXCLUDED.iv,
         color = EXCLUDED.color,
         updated_at = NOW()
       RETURNING id, message_uid, folder, color, created_at, updated_at`,
      [req.userId, String(uid), folder, encryptedText, iv, color]
    );

    const row = result.rows[0];
    res.json({
      success: true,
      note: {
        id: row.id,
        messageUid: row.message_uid,
        folder: row.folder,
        noteText,
        color: row.color,
        createdAt: row.created_at,
        updatedAt: row.updated_at
      }
    });
  } catch (err) {
    next(err);
  }
});

/**
 * DELETE /api/notes/:uid
 * Delete sticky note attached to an email
 */
router.delete('/:uid', async (req, res, next) => {
  try {
    const { uid } = req.params;
    const folder = req.query.folder || 'INBOX';

    await query(
      `DELETE FROM email_notes WHERE user_id = $1 AND message_uid = $2 AND folder = $3`,
      [req.userId, String(uid), folder]
    );

    res.json({ success: true, message: 'Note deleted' });
  } catch (err) {
    next(err);
  }
});

export default router;
