import { Router } from 'express';
import { requireAuth } from '../middleware/auth.js';
import { validate } from '../middleware/validate.js';
import { query } from '../config/database.js';
import { hashPassword, verifyPassword, generateRecoveryCodes } from '../utils/crypto.js';
import { validatePassword } from '../utils/validators.js';
import { authenticator } from 'otplib';

const router = Router();
router.use(requireAuth);

// ─── Profile ─────────────────────────────────────────────

/**
 * GET /api/settings/profile
 * Get current user profile.
 */
router.get('/profile', (req, res) => {
  const { password_hash, otp_secret, recovery_codes, imap_password, ...safeUser } = req.user;
  res.json({ user: safeUser });
});

/**
 * PUT /api/settings/profile
 * Update display name, recovery email, timezone, language.
 */
router.put('/profile',
  validate({
    displayName: { type: 'string', max: 50 },
    recoveryEmail: { type: 'email' },
    timezone: { type: 'string', max: 50 },
    language: { type: 'string', max: 10 },
  }),
  async (req, res, next) => {
    try {
      const { displayName, recoveryEmail, timezone, language } = req.body;

      const updates = [];
      const values = [];
      let idx = 1;

      if (displayName !== undefined) { updates.push(`display_name = $${idx++}`); values.push(displayName); }
      if (recoveryEmail !== undefined) { updates.push(`recovery_email = $${idx++}`); values.push(recoveryEmail); }
      if (timezone !== undefined) { updates.push(`timezone = $${idx++}`); values.push(timezone); }
      if (language !== undefined) { updates.push(`language = $${idx++}`); values.push(language); }

      if (updates.length === 0) {
        return res.status(400).json({ error: 'No fields to update' });
      }

      values.push(req.user.id);
      const result = await query(
        `UPDATE users SET ${updates.join(', ')}, updated_at = NOW()
         WHERE id = $${idx}
         RETURNING id, email, username, display_name, recovery_email, timezone, language`,
        values
      );

      // Audit
      await query(
        `INSERT INTO audit_log (actor_type, actor_id, action, details, ip_address)
         VALUES ('user', $1, 'update_profile', $2, $3)`,
        [String(req.user.id), JSON.stringify(req.body), req.ip]
      );

      res.json({ user: result.rows[0] });
    } catch (err) {
      next(err);
    }
  }
);

// ─── Password ────────────────────────────────────────────

/**
 * PUT /api/settings/password
 * Change password (requires current password).
 */
router.put('/password',
  validate({
    currentPassword: { type: 'string', required: true },
    newPassword: { type: 'string', required: true, min: 8 },
  }),
  async (req, res, next) => {
    try {
      const { currentPassword, newPassword } = req.body;

      // Verify current password
      const valid = await verifyPassword(req.user.password_hash, currentPassword);
      if (!valid) {
        return res.status(401).json({ error: 'Current password is incorrect' });
      }

      // Validate new password
      const check = validatePassword(newPassword);
      if (!check.valid) {
        return res.status(400).json({ error: 'Weak password', details: check.errors });
      }

      const hash = await hashPassword(newPassword);
      await query('UPDATE users SET password_hash = $1, updated_at = NOW() WHERE id = $2', [hash, req.user.id]);

      // Audit
      await query(
        `INSERT INTO audit_log (actor_type, actor_id, action, ip_address)
         VALUES ('user', $1, 'change_password', $2)`,
        [String(req.user.id), req.ip]
      );

      res.json({ message: 'Password updated' });
    } catch (err) {
      next(err);
    }
  }
);

// ─── 2FA Management ──────────────────────────────────────

/**
 * DELETE /api/settings/2fa
 * Disable 2FA (requires password).
 */
router.delete('/2fa',
  validate({ password: { type: 'string', required: true } }),
  async (req, res, next) => {
    try {
      const valid = await verifyPassword(req.user.password_hash, req.body.password);
      if (!valid) return res.status(401).json({ error: 'Wrong password' });

      await query(
        'UPDATE users SET otp_enabled = FALSE, otp_secret = NULL, recovery_codes = NULL WHERE id = $1',
        [req.user.id]
      );

      await query(
        `INSERT INTO audit_log (actor_type, actor_id, action, ip_address)
         VALUES ('user', $1, 'disable_2fa', $2)`,
        [String(req.user.id), req.ip]
      );

      res.json({ message: '2FA disabled' });
    } catch (err) {
      next(err);
    }
  }
);

// ─── Sessions ────────────────────────────────────────────

/**
 * GET /api/settings/sessions
 * List active sessions for the current user.
 */
router.get('/sessions', async (req, res, next) => {
  try {
    const result = await query(
      `SELECT id, ip_address, user_agent, created_at, expires_at
       FROM user_sessions
       WHERE user_id = $1 AND is_revoked = FALSE AND expires_at > NOW()
       ORDER BY created_at DESC`,
      [req.user.id]
    );

    res.json({ sessions: result.rows });
  } catch (err) {
    next(err);
  }
});

/**
 * DELETE /api/settings/sessions/:id
 * Revoke a specific session.
 */
router.delete('/sessions/:id', async (req, res, next) => {
  try {
    const result = await query(
      'UPDATE user_sessions SET is_revoked = TRUE WHERE id = $1 AND user_id = $2 RETURNING id',
      [req.params.id, req.user.id]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Session not found' });
    }

    res.json({ message: 'Session revoked' });
  } catch (err) {
    next(err);
  }
});

/**
 * DELETE /api/settings/sessions
 * Revoke all other sessions (except current).
 */
router.delete('/sessions', async (req, res, next) => {
  try {
    // TODO: Exclude current session by JTI from token
    await query(
      'UPDATE user_sessions SET is_revoked = TRUE WHERE user_id = $1 AND is_revoked = FALSE',
      [req.user.id]
    );

    res.json({ message: 'All other sessions revoked' });
  } catch (err) {
    next(err);
  }
});

// ─── Contacts ────────────────────────────────────────────

/**
 * GET /api/settings/contacts
 * List contacts for autocomplete and address book.
 */
router.get('/contacts', async (req, res, next) => {
  try {
    const { q } = req.query;
    let result;

    if (q) {
      result = await query(
        `SELECT id, email, name, last_emailed FROM contacts
         WHERE user_id = $1 AND (email ILIKE $2 OR name ILIKE $2)
         ORDER BY last_emailed DESC NULLS LAST LIMIT 20`,
        [req.user.id, `%${q}%`]
      );
    } else {
      result = await query(
        `SELECT id, email, name, last_emailed FROM contacts
         WHERE user_id = $1
         ORDER BY last_emailed DESC NULLS LAST LIMIT 100`,
        [req.user.id]
      );
    }

    // Also include user's active aliases for easy self-addressing
    let aliasRows = [];
    if (q) {
      const aliasRes = await query(
        `SELECT id, alias_address AS email, note AS name, created_at AS last_emailed
         FROM email_aliases
         WHERE user_id = $1 AND enabled = TRUE AND (alias_address ILIKE $2 OR note ILIKE $2)
         LIMIT 5`,
        [req.user.id, `%${q}%`]
      );
      aliasRows = aliasRes.rows.map((r) => ({ ...r, is_alias: true }));
    }

    res.json({ contacts: [...aliasRows, ...result.rows] });
  } catch (err) {
    next(err);
  }
});

/**
 * POST /api/settings/contacts
 * Add a contact.
 */
router.post('/contacts',
  validate({
    email: { type: 'email', required: true },
    name: { type: 'string', max: 100 },
  }),
  async (req, res, next) => {
    try {
      const result = await query(
        `INSERT INTO contacts (user_id, email, name)
         VALUES ($1, $2, $3)
         ON CONFLICT (user_id, email) DO UPDATE SET name = EXCLUDED.name
         RETURNING *`,
        [req.user.id, req.body.email, req.body.name || null]
      );

      res.status(201).json({ contact: result.rows[0] });
    } catch (err) {
      next(err);
    }
  }
);

/**
 * DELETE /api/settings/contacts/:id
 * Delete a contact.
 */
router.delete('/contacts/:id', async (req, res, next) => {
  try {
    const result = await query(
      'DELETE FROM contacts WHERE id = $1 AND user_id = $2 RETURNING id',
      [parseInt(req.params.id, 10), req.user.id]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Contact not found' });
    }

    res.json({ message: 'Contact deleted' });
  } catch (err) {
    next(err);
  }
});

// ─── Login History ───────────────────────────────────────

/**
 * GET /api/settings/login-history
 * Get recent login attempts.
 */
router.get('/login-history', async (req, res, next) => {
  try {
    const result = await query(
      `SELECT ip_address, user_agent, success, failure_reason, created_at
       FROM login_history
       WHERE user_id = $1
       ORDER BY created_at DESC
       LIMIT 50`,
      [req.user.id]
    );

    res.json({ history: result.rows });
  } catch (err) {
    next(err);
  }
});

// ─── Forwarding ──────────────────────────────────────────

/**
 * GET /api/settings/forwarding
 */
router.get('/forwarding', (req, res) => {
  res.json({
    forwardingAddress: req.user.forwarding_address || '',
    enabled: !!req.user.forwarding_address,
  });
});

/**
 * PUT /api/settings/forwarding
 */
router.put('/forwarding',
  validate({
    forwardingAddress: { type: 'string', max: 255 },
  }),
  async (req, res, next) => {
    try {
      const addr = req.body.forwardingAddress?.trim() || null;

      await query(
        'UPDATE users SET forwarding_address = $1, updated_at = NOW() WHERE id = $2',
        [addr, req.user.id]
      );

      res.json({ forwardingAddress: addr });
    } catch (err) {
      next(err);
    }
  }
);

// ─── Signature ───────────────────────────────────────────

/**
 * GET /api/settings/signature
 */
router.get('/signature', (req, res) => {
  res.json({ signature: req.user.signature || '' });
});

/**
 * PUT /api/settings/signature
 */
router.put('/signature',
  validate({
    signature: { type: 'string', max: 5000 },
  }),
  async (req, res, next) => {
    try {
      await query(
        'UPDATE users SET signature = $1, updated_at = NOW() WHERE id = $2',
        [req.body.signature || '', req.user.id]
      );

      res.json({ message: 'Signature updated' });
    } catch (err) {
      next(err);
    }
  }
);

// ─── Email Filters ───────────────────────────────────────

/**
 * GET /api/settings/filters
 */
router.get('/filters', async (req, res, next) => {
  try {
    const result = await query(
      'SELECT * FROM email_filters WHERE user_id = $1 ORDER BY priority ASC, id ASC',
      [req.user.id]
    );
    res.json({ filters: result.rows });
  } catch (err) {
    next(err);
  }
});

/**
 * POST /api/settings/filters
 */
router.post('/filters',
  validate({
    name: { type: 'string', required: true, max: 100 },
    condition_field: { type: 'string', required: true, enum: ['from', 'to', 'subject', 'body'] },
    condition_operator: { type: 'string', required: true, enum: ['contains', 'equals', 'starts_with', 'regex'] },
    condition_value: { type: 'string', required: true, max: 500 },
    action: { type: 'string', required: true, enum: ['move', 'label', 'star', 'read', 'delete', 'forward'] },
    action_value: { type: 'string', max: 500 },
    priority: { type: 'number', default: 0 },
  }),
  async (req, res, next) => {
    try {
      const { name, condition_field, condition_operator, condition_value, action, action_value, priority } = req.body;

      const result = await query(
        `INSERT INTO email_filters (user_id, name, condition_field, condition_operator, condition_value, action, action_value, priority)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
         RETURNING *`,
        [req.user.id, name, condition_field, condition_operator, condition_value, action, action_value || null, priority]
      );

      res.status(201).json({ filter: result.rows[0] });
    } catch (err) {
      next(err);
    }
  }
);

/**
 * PUT /api/settings/filters/:id
 */
router.put('/filters/:id',
  validate({
    name: { type: 'string', max: 100 },
    condition_field: { type: 'string', enum: ['from', 'to', 'subject', 'body'] },
    condition_operator: { type: 'string', enum: ['contains', 'equals', 'starts_with', 'regex'] },
    condition_value: { type: 'string', max: 500 },
    action: { type: 'string', enum: ['move', 'label', 'star', 'read', 'delete', 'forward'] },
    action_value: { type: 'string', max: 500 },
    priority: { type: 'number' },
    enabled: { type: 'boolean' },
  }),
  async (req, res, next) => {
    try {
      const id = parseInt(req.params.id, 10);
      const fields = ['name', 'condition_field', 'condition_operator', 'condition_value', 'action', 'action_value', 'priority', 'enabled'];
      const updates = [];
      const values = [];
      let idx = 1;

      for (const field of fields) {
        if (req.body[field] !== undefined) {
          updates.push(`${field} = $${idx++}`);
          values.push(req.body[field]);
        }
      }

      if (updates.length === 0) return res.status(400).json({ error: 'No fields to update' });

      values.push(req.user.id, id);
      const result = await query(
        `UPDATE email_filters SET ${updates.join(', ')} WHERE user_id = $${idx} AND id = $${idx + 1} RETURNING *`,
        values
      );

      if (result.rows.length === 0) return res.status(404).json({ error: 'Filter not found' });
      res.json({ filter: result.rows[0] });
    } catch (err) {
      next(err);
    }
  }
);

/**
 * DELETE /api/settings/filters/:id
 */
router.delete('/filters/:id', async (req, res, next) => {
  try {
    const result = await query(
      'DELETE FROM email_filters WHERE user_id = $1 AND id = $2 RETURNING id',
      [req.user.id, parseInt(req.params.id, 10)]
    );

    if (result.rows.length === 0) return res.status(404).json({ error: 'Filter not found' });
    res.json({ message: 'Filter deleted' });
  } catch (err) {
    next(err);
  }
});

// ─── Auto-Reply / Vacation Responder ─────────────────────

/**
 * GET /api/settings/auto-reply
 */
router.get('/auto-reply', (req, res) => {
  res.json({
    enabled: req.user.auto_reply_enabled,
    subject: req.user.auto_reply_subject || '',
    body: req.user.auto_reply_body || '',
    startDate: req.user.auto_reply_start,
    endDate: req.user.auto_reply_end,
  });
});

/**
 * PUT /api/settings/auto-reply
 */
router.put('/auto-reply',
  validate({
    enabled: { type: 'boolean' },
    subject: { type: 'string', max: 200 },
    body: { type: 'string', max: 5000 },
    startDate: { type: 'string' },
    endDate: { type: 'string' },
  }),
  async (req, res, next) => {
    try {
      const { enabled, subject, body, startDate, endDate } = req.body;

      await query(
        `UPDATE users SET
          auto_reply_enabled = COALESCE($1, auto_reply_enabled),
          auto_reply_subject = COALESCE($2, auto_reply_subject),
          auto_reply_body = COALESCE($3, auto_reply_body),
          auto_reply_start = $4,
          auto_reply_end = $5,
          updated_at = NOW()
         WHERE id = $6`,
        [enabled, subject, body, startDate || null, endDate || null, req.user.id]
      );

      res.json({ message: 'Auto-reply updated' });
    } catch (err) {
      next(err);
    }
  }
);

// ─── Spam Rules (Whitelist / Blacklist) ──────────────────

/**
 * GET /api/settings/spam-rules
 */
router.get('/spam-rules', async (req, res, next) => {
  try {
    const result = await query(
      'SELECT * FROM spam_rules WHERE user_id = $1 ORDER BY created_at DESC',
      [req.user.id]
    );
    res.json({ rules: result.rows });
  } catch (err) {
    next(err);
  }
});

/**
 * POST /api/settings/spam-rules
 */
router.post('/spam-rules',
  validate({
    type: { type: 'string', required: true, enum: ['whitelist', 'blacklist'] },
    value: { type: 'string', required: true, max: 255 },
  }),
  async (req, res, next) => {
    try {
      const { type, value } = req.body;

      const result = await query(
        `INSERT INTO spam_rules (user_id, type, value)
         VALUES ($1, $2, $3)
         ON CONFLICT DO NOTHING
         RETURNING *`,
        [req.user.id, type, value]
      );

      if (result.rows.length === 0) {
        return res.status(409).json({ error: 'Rule already exists' });
      }

      res.status(201).json({ rule: result.rows[0] });
    } catch (err) {
      next(err);
    }
  }
);

/**
 * DELETE /api/settings/spam-rules/:id
 */
router.delete('/spam-rules/:id', async (req, res, next) => {
  try {
    const result = await query(
      'DELETE FROM spam_rules WHERE user_id = $1 AND id = $2 RETURNING id',
      [req.user.id, parseInt(req.params.id, 10)]
    );

    if (result.rows.length === 0) return res.status(404).json({ error: 'Rule not found' });
    res.json({ message: 'Rule deleted' });
  } catch (err) {
    next(err);
  }
});

// ─── PGP Encryption Settings ─────────────────────────────

/**
 * GET /api/settings/pgp
 * Fetch user's PGP key status and fingerprint.
 */
router.get('/pgp', async (req, res, next) => {
  try {
    const result = await query(
      'SELECT pgp_public_key, pgp_enabled FROM users WHERE id = $1',
      [req.user.id]
    );

    const user = result.rows[0] || {};
    let fingerprint = null;

    if (user.pgp_public_key) {
      try {
        const { validatePublicKey } = await import('../services/pgpService.js');
        const meta = await validatePublicKey(user.pgp_public_key);
        fingerprint = meta.fingerprint;
      } catch {
        // Ignored if invalid
      }
    }

    res.json({
      pgpPublicKey: user.pgp_public_key || '',
      pgpEnabled: !!user.pgp_enabled,
      fingerprint,
    });
  } catch (err) {
    next(err);
  }
});

/**
 * PUT /api/settings/pgp
 * Upload or update PGP public key and enable toggle.
 */
router.put('/pgp',
  validate({
    pgpPublicKey: { type: 'string' },
    pgpEnabled: { type: 'boolean' },
  }),
  async (req, res, next) => {
    try {
      const { pgpPublicKey, pgpEnabled } = req.body;
      let fingerprint = null;

      if (pgpPublicKey && pgpPublicKey.trim()) {
        const { validatePublicKey } = await import('../services/pgpService.js');
        const meta = await validatePublicKey(pgpPublicKey.trim());
        fingerprint = meta.fingerprint;
      }

      await query(
        `UPDATE users SET
           pgp_public_key = $1,
           pgp_enabled = $2,
           updated_at = NOW()
         WHERE id = $3`,
        [pgpPublicKey ? pgpPublicKey.trim() : null, !!pgpEnabled, req.user.id]
      );

      res.json({
        message: 'PGP configuration updated',
        pgpEnabled: !!pgpEnabled,
        fingerprint,
      });
    } catch (err) {
      next(err);
    }
  }
);

/**
 * POST /api/settings/pgp/generate
 * Generate a new OpenPGP Curve25519 keypair on demand.
 */
router.post('/pgp/generate', async (req, res, next) => {
  try {
    const { generateKeyPair } = await import('../services/pgpService.js');
    const keyPair = await generateKeyPair(
      req.user.display_name || req.user.username,
      req.user.email
    );

    // Save public key
    await query(
      `UPDATE users SET
         pgp_public_key = $1,
         pgp_enabled = TRUE,
         updated_at = NOW()
       WHERE id = $2`,
      [keyPair.publicKey, req.user.id]
    );

    res.json({
      message: 'New PGP keypair generated successfully',
      publicKey: keyPair.publicKey,
      privateKey: keyPair.privateKey,
      fingerprint: keyPair.fingerprint,
    });
  } catch (err) {
    next(err);
  }
});

/**
 * GET /api/settings/app-passwords
 * List all active application passwords / SMTP app codes for the user.
 */
router.get('/app-passwords', async (req, res, next) => {
  try {
    const { listAppPasswords } = await import('../services/appPasswordService.js');
    const passwords = await listAppPasswords(req.user.id);
    res.json({ appPasswords: passwords });
  } catch (err) {
    next(err);
  }
});

/**
 * POST /api/settings/app-passwords
 * Generate a new application password / SMTP app code.
 */
router.post('/app-passwords',
  validate({
    name: { type: 'string', required: true, max: 100 },
  }),
  async (req, res, next) => {
    try {
      const { createAppPassword } = await import('../services/appPasswordService.js');
      const { name, scopes } = req.body;
      const result = await createAppPassword(req.user.id, name, scopes);
      res.status(201).json({
        message: 'Application password created successfully. Save this code now; it will not be displayed again.',
        appPassword: result,
      });
    } catch (err) {
      next(err);
    }
  }
);

/**
 * DELETE /api/settings/app-passwords/:id
 * Revoke an application password.
 */
router.delete('/app-passwords/:id', async (req, res, next) => {
  try {
    const { revokeAppPassword } = await import('../services/appPasswordService.js');
    const success = await revokeAppPassword(req.user.id, parseInt(req.params.id, 10));
    if (!success) {
      return res.status(404).json({ error: 'Application password not found or already revoked' });
    }
    res.json({ message: 'Application password revoked successfully' });
  } catch (err) {
    next(err);
  }
});

// ─── Sovereign Preferences Vault (Appearance, Backgrounds, Density, Audio, AI) ────────

/**
 * GET /api/settings/preferences
 * Get all customized user preferences (JSONB)
 */
router.get('/preferences', async (req, res, next) => {
  try {
    const result = await query('SELECT preferences FROM users WHERE id = $1', [req.user.id]);
    res.json({ preferences: result.rows[0]?.preferences || {} });
  } catch (err) {
    next(err);
  }
});

/**
 * PUT /api/settings/preferences
 * Update user preferences (merges into JSONB)
 */
router.put('/preferences', async (req, res, next) => {
  try {
    const incoming = req.body.preferences || req.body || {};
    const result = await query(`
      UPDATE users
      SET preferences = COALESCE(preferences, '{}'::jsonb) || $1::jsonb,
          updated_at = NOW()
      WHERE id = $2
      RETURNING preferences
    `, [JSON.stringify(incoming), req.user.id]);

    res.json({ message: 'Preferences saved successfully.', preferences: result.rows[0]?.preferences || {} });
  } catch (err) {
    next(err);
  }
});

// ─── Personal Scoped API Keys ─────────────────────────────

/**
 * GET /api/settings/api-keys
 * List user personal API keys
 */
router.get('/api-keys', async (req, res, next) => {
  try {
    const result = await query(`
      SELECT id, name, key_prefix, scopes, last_used_at, expires_at, created_at
      FROM personal_api_keys
      WHERE user_id = $1
      ORDER BY created_at DESC
    `, [req.user.id]);
    res.json({ apiKeys: result.rows });
  } catch (err) {
    next(err);
  }
});

/**
 * POST /api/settings/api-keys
 * Create a new personal API key
 */
router.post('/api-keys', async (req, res, next) => {
  try {
    const { name, scopes = ['mail:read', 'mail:send'], expires_days } = req.body;
    if (!name) return res.status(400).json({ error: 'Key name is required.' });

    const crypto = await import('crypto');
    const rawKey = `wox_${crypto.randomBytes(24).toString('hex')}`;
    const keyPrefix = rawKey.substring(0, 8);
    const keyHash = crypto.createHash('sha256').update(rawKey).digest('hex');
    const expiresAt = expires_days ? new Date(Date.now() + expires_days * 86400000) : null;

    const result = await query(`
      INSERT INTO personal_api_keys (user_id, name, key_prefix, key_hash, scopes, expires_at)
      VALUES ($1, $2, $3, $4, $5, $6)
      RETURNING id, name, key_prefix, scopes, expires_at, created_at
    `, [req.user.id, name, keyPrefix, keyHash, scopes, expiresAt]);

    res.status(201).json({
      message: 'Personal API key created. Copy it now, it will never be displayed again.',
      apiKey: {
        ...result.rows[0],
        secretKey: rawKey
      }
    });
  } catch (err) {
    next(err);
  }
});

/**
 * DELETE /api/settings/api-keys/:id
 * Revoke an API key
 */
router.delete('/api-keys/:id', async (req, res, next) => {
  try {
    const result = await query('DELETE FROM personal_api_keys WHERE id = $1 AND user_id = $2 RETURNING id', [req.params.id, req.user.id]);
    if (!result.rows.length) return res.status(404).json({ error: 'API key not found.' });
    res.json({ message: 'API key revoked.' });
  } catch (err) {
    next(err);
  }
});

// ═════════════════════════════════════════════════════════
// 14-DAY ACCOUNT & MAILBOX SELF-DELETION SYSTEM
// ═════════════════════════════════════════════════════════

/**
 * GET /api/settings/account/deletion-status
 * Get the current deletion schedule status for the logged-in user.
 */
router.get('/account/deletion-status', async (req, res, next) => {
  try {
    const result = await query(
      `SELECT deletion_scheduled_at, deletion_requested_at, deletion_reason
       FROM users WHERE id = $1`,
      [req.user.id]
    );

    const user = result.rows[0] || {};
    const scheduled = user.deletion_scheduled_at;
    let daysRemaining = null;
    let isScheduled = false;

    if (scheduled) {
      const diffMs = new Date(scheduled).getTime() - Date.now();
      daysRemaining = Math.max(0, Math.ceil(diffMs / (1000 * 60 * 60 * 24)));
      isScheduled = true;
    }

    res.json({
      isScheduled,
      deletionScheduledAt: user.deletion_scheduled_at,
      deletionRequestedAt: user.deletion_requested_at,
      deletionReason: user.deletion_reason,
      daysRemaining,
    });
  } catch (err) {
    next(err);
  }
});

/**
 * POST /api/settings/account/delete-request
 * Request account and mailbox deletion with 14-day recovery grace period.
 */
router.post('/account/delete-request',
  validate({
    password: { type: 'string', required: true },
    reason: { type: 'string', max: 500 },
  }),
  async (req, res, next) => {
    try {
      const { password, reason } = req.body;

      // Verify current password
      const valid = await verifyPassword(req.user.password_hash, password);
      if (!valid) {
        return res.status(401).json({ error: 'Incorrect password. Confirmation failed.' });
      }

      // Schedule deletion for 14 days in the future
      const result = await query(
        `UPDATE users
         SET deletion_requested_at = NOW(),
             deletion_scheduled_at = NOW() + INTERVAL '14 days',
             deletion_reason = $1,
             updated_at = NOW()
         WHERE id = $2
         RETURNING id, email, username, deletion_scheduled_at, deletion_requested_at, deletion_reason`,
        [reason?.trim() || 'User requested self-deletion', req.user.id]
      );

      const scheduled = result.rows[0].deletion_scheduled_at;

      // Audit log
      await query(
        `INSERT INTO audit_log (actor_type, actor_id, action, details, ip_address)
         VALUES ('user', $1, 'account_deletion_scheduled', $2, $3)`,
        [String(req.user.id), JSON.stringify({ scheduled_at: scheduled, reason }), req.ip]
      );

      res.json({
        message: 'Account deletion scheduled. You have 14 days to log back in to cancel deletion and keep your account.',
        isScheduled: true,
        deletionScheduledAt: scheduled,
        daysRemaining: 14,
      });
    } catch (err) {
      next(err);
    }
  }
);

/**
 * POST /api/settings/account/cancel-deletion
 * Cancel scheduled deletion and restore full active status.
 */
router.post('/account/cancel-deletion', async (req, res, next) => {
  try {
    const result = await query(
      `UPDATE users
       SET deletion_scheduled_at = NULL,
           deletion_requested_at = NULL,
           deletion_reason = NULL,
           updated_at = NOW()
       WHERE id = $1
       RETURNING id, email, username, deletion_scheduled_at`,
      [req.user.id]
    );

    // Audit log
    await query(
      `INSERT INTO audit_log (actor_type, actor_id, action, details, ip_address)
       VALUES ('user', $1, 'account_deletion_cancelled', $2, $3)`,
      [String(req.user.id), JSON.stringify({ action: 'manual_cancel_via_settings' }), req.ip]
    );

    res.json({
      message: 'Account deletion cancelled. Your account and mailbox are fully active.',
      isScheduled: false,
    });
  } catch (err) {
    next(err);
  }
});

export default router;


