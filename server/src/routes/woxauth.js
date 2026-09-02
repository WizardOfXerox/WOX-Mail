/**
 * @fileoverview WoxAuth routes — built-in TOTP authenticator.
 * 7 endpoints for managing encrypted TOTP entries.
 * All secrets are encrypted client-side with AES-256-GCM.
 */

import { Router } from 'express';
import { requireAuth } from '../middleware/auth.js';
import { validate } from '../middleware/validate.js';
import { query } from '../config/database.js';

const router = Router();
router.use(requireAuth);

/**
 * GET /api/woxauth
 * List all TOTP entries (encrypted secrets).
 */
router.get('/', async (req, res, next) => {
  try {
    const result = await query(
      `SELECT id, service_name, account_label, encrypted_secret, iv, tag,
              period, digits, algorithm, icon, sort_order, created_at
       FROM woxauth_entries
       WHERE user_id = $1
       ORDER BY sort_order ASC, created_at ASC`,
      [req.user.id]
    );
    res.json({ entries: result.rows });
  } catch (err) {
    next(err);
  }
});

/**
 * POST /api/woxauth
 * Add a new TOTP entry.
 */
router.post('/',
  validate({
    serviceName: { type: 'string', required: true, max: 100 },
    accountLabel: { type: 'string', max: 200 },
    encryptedSecret: { type: 'string', required: true },
    iv: { type: 'string', required: true },
    tag: { type: 'string' },
    period: { type: 'number', default: 30 },
    digits: { type: 'number', default: 6 },
    algorithm: { type: 'string', default: 'SHA1' },
    icon: { type: 'string' },
  }),
  async (req, res, next) => {
    try {
      const { serviceName, accountLabel, encryptedSecret, iv, tag, period, digits, algorithm, icon } = req.body;

      // Get max sort_order for this user
      const maxOrder = await query(
        'SELECT COALESCE(MAX(sort_order), -1) + 1 as next_order FROM woxauth_entries WHERE user_id = $1',
        [req.user.id]
      );

      const result = await query(
        `INSERT INTO woxauth_entries
         (user_id, service_name, account_label, encrypted_secret, iv, tag, period, digits, algorithm, icon, sort_order)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)
         RETURNING *`,
        [
          req.user.id, serviceName, accountLabel || null, encryptedSecret, iv, tag || null,
          period, digits, algorithm, icon || null, maxOrder.rows[0].next_order,
        ]
      );

      res.status(201).json({ entry: result.rows[0] });
    } catch (err) {
      next(err);
    }
  }
);

/**
 * PUT /api/woxauth/:id
 * Edit entry (name, label, icon, order).
 */
router.put('/:id', async (req, res, next) => {
  try {
    const id = parseInt(req.params.id, 10);
    const { serviceName, accountLabel, icon, sortOrder } = req.body;

    const sets = [];
    const values = [];
    let idx = 1;

    if (serviceName !== undefined) { sets.push(`service_name = $${idx++}`); values.push(serviceName); }
    if (accountLabel !== undefined) { sets.push(`account_label = $${idx++}`); values.push(accountLabel); }
    if (icon !== undefined) { sets.push(`icon = $${idx++}`); values.push(icon); }
    if (sortOrder !== undefined) { sets.push(`sort_order = $${idx++}`); values.push(sortOrder); }

    if (sets.length === 0) return res.status(400).json({ error: 'No fields to update' });

    values.push(req.user.id, id);
    const result = await query(
      `UPDATE woxauth_entries SET ${sets.join(', ')} WHERE user_id = $${idx} AND id = $${idx + 1} RETURNING *`,
      values
    );

    if (result.rows.length === 0) return res.status(404).json({ error: 'Entry not found' });
    res.json({ entry: result.rows[0] });
  } catch (err) {
    next(err);
  }
});

/**
 * DELETE /api/woxauth/:id
 * Remove an entry.
 */
router.delete('/:id', async (req, res, next) => {
  try {
    const result = await query(
      'DELETE FROM woxauth_entries WHERE user_id = $1 AND id = $2 RETURNING id',
      [req.user.id, parseInt(req.params.id, 10)]
    );

    if (result.rows.length === 0) return res.status(404).json({ error: 'Entry not found' });
    res.json({ message: 'Entry deleted' });
  } catch (err) {
    next(err);
  }
});

/**
 * PUT /api/woxauth/reorder
 * Update sort order for all entries.
 */
router.put('/reorder',
  validate({
    order: { type: 'array', required: true },
  }),
  async (req, res, next) => {
    try {
      const { order } = req.body; // [{id, sortOrder}]

      for (const item of order) {
        await query(
          'UPDATE woxauth_entries SET sort_order = $1 WHERE user_id = $2 AND id = $3',
          [item.sortOrder, req.user.id, item.id]
        );
      }

      res.json({ message: 'Reordered' });
    } catch (err) {
      next(err);
    }
  }
);

/**
 * GET /api/woxauth/export
 * Export all entries as encrypted backup JSON.
 */
router.get('/export', async (req, res, next) => {
  try {
    const result = await query(
      `SELECT service_name, account_label, encrypted_secret, iv, tag,
              period, digits, algorithm, icon, sort_order
       FROM woxauth_entries
       WHERE user_id = $1
       ORDER BY sort_order ASC`,
      [req.user.id]
    );

    res.json({
      version: 1,
      exportedAt: new Date().toISOString(),
      entries: result.rows,
    });
  } catch (err) {
    next(err);
  }
});

/**
 * POST /api/woxauth/import
 * Import entries from backup JSON.
 */
router.post('/import',
  validate({
    entries: { type: 'array', required: true },
  }),
  async (req, res, next) => {
    try {
      const { entries } = req.body;
      let imported = 0;

      for (const entry of entries) {
        await query(
          `INSERT INTO woxauth_entries
           (user_id, service_name, account_label, encrypted_secret, iv, tag, period, digits, algorithm, icon, sort_order)
           VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)`,
          [
            req.user.id,
            entry.service_name || entry.serviceName,
            entry.account_label || entry.accountLabel || null,
            entry.encrypted_secret || entry.encryptedSecret,
            entry.iv,
            entry.tag || null,
            entry.period || 30,
            entry.digits || 6,
            entry.algorithm || 'SHA1',
            entry.icon || null,
            entry.sort_order ?? imported,
          ]
        );
        imported++;
      }

      res.json({ message: `Imported ${imported} entries`, imported });
    } catch (err) {
      next(err);
    }
  }
);

export default router;
