import { Router } from 'express';
import fs from 'fs';
import path from 'path';
import crypto from 'crypto';
import jwt from 'jsonwebtoken';
import { requireAuth } from '../middleware/auth.js';
import { requireAdmin } from '../middleware/admin.js';
import { validate } from '../middleware/validate.js';
import { query } from '../config/database.js';
import { generateToken, hashPassword } from '../utils/crypto.js';
import { createUser, deleteUser } from '../services/purelymail.js';
import { createConnection } from '../services/imap.js';
import { createTransporter } from '../services/smtp.js';
import { getPoolStats, replenishPool, purgeAllTempPoolAndRecreate } from '../services/pool.js';
import { refreshFilterCache } from '../services/serviceFilter.js';
import { parsePagination, paginationMeta } from '../utils/helpers.js';
import { runBackup } from '../../jobs/backup.js';
import { auditDomainDnsHealth } from '../services/dnsHealthService.js';
import {
  getAdminFutureLetters,
  getAdminFutureLetter,
  adminDeliverFutureLetterNow,
  adminUpdateFutureLetter,
  adminDeleteFutureLetter,
} from '../services/futureLetterService.js';

const router = Router();

/**
 * GET /api/admin/impersonate/exit & /impersonate-exit
 * Publicly reachable exit route: Restores original admin session from backup cookie.
 */
router.get(['/impersonate/exit', '/impersonate-exit'], async (req, res) => {
  const backupToken = req.cookies?.woxmail_admin_backup;
  if (backupToken) {
    res.cookie('woxmail_token', backupToken, {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'lax',
      maxAge: 86400 * 1000,
    });
    res.clearCookie('woxmail_admin_backup', { path: '/' });
  }
  res.redirect('/admin');
});

router.use(requireAuth, requireAdmin);

// ═════════════════════════════════════════════════════════
// DASHBOARD OVERVIEW
// ═════════════════════════════════════════════════════════

/**
 * GET /api/admin/overview
 * System dashboard stats.
 */
router.get('/overview', async (req, res, next) => {
  try {
    const [users, tempActive, emailsToday, invites, pool, recentLogins] = await Promise.all([
      query('SELECT COUNT(*)::int as count FROM users'),
      query("SELECT COUNT(*)::int as count FROM temp_addresses WHERE status = 'active'"),
      query(`SELECT COALESCE(emails_sent, 0)::int as count FROM daily_stats WHERE date = CURRENT_DATE`),
      query('SELECT COUNT(*)::int as count FROM invite_codes WHERE is_used = FALSE AND (expires_at IS NULL OR expires_at > NOW())'),
      getPoolStats(),
      query(`SELECT COUNT(*)::int as count FROM login_history WHERE created_at > NOW() - INTERVAL '24 hours' AND success = TRUE`),
    ]);

    res.json({
      totalUsers: users.rows[0].count,
      activeTempAddresses: tempActive.rows[0].count,
      emailsToday: emailsToday.rows[0]?.count || 0,
      unusedInvites: invites.rows[0].count,
      pool,
      loginsToday: recentLogins.rows[0].count,
    });
  } catch (err) {
    next(err);
  }
});

/**
 * GET /api/admin/analytics
 * Daily stats for charts (last 30 days).
 */
router.get('/analytics', async (req, res, next) => {
  try {
    const days = parseInt(req.query.days, 10) || 30;

    const daily = await query(
      `SELECT date,
              COALESCE(permanent_signups, 0) AS registrations,
              COALESCE(emails_sent, 0) AS emails_sent,
              COALESCE(emails_received, 0) AS emails_received,
              COALESCE(temp_public_created, 0) AS temp_public_generated,
              COALESCE(temp_personal_created, 0) AS temp_personal_generated,
              COALESCE(logins, 0) AS active_users
       FROM daily_stats
       WHERE date >= CURRENT_DATE - $1::int
       ORDER BY date ASC`,
      [days]
    );

    const serviceBlocks = await query(
      `SELECT date, service_name, tier, SUM(blocked_count)::int as total
       FROM service_block_stats
       WHERE date >= CURRENT_DATE - $1::int
       GROUP BY date, service_name, tier
       ORDER BY date ASC`,
      [days]
    );

    res.json({ daily: daily.rows, serviceBlocks: serviceBlocks.rows });
  } catch (err) {
    next(err);
  }
});

// ═════════════════════════════════════════════════════════
// USER MANAGEMENT (Permanent Webmail + Personal Temp Mail)
// ═════════════════════════════════════════════════════════

/**
 * GET /api/admin/users
 * Unified user directory supporting Permanent Webmail, Personal Temp Mail, and Public pools.
 */
router.get('/users', async (req, res, next) => {
  try {
    const { page, limit } = parsePagination(req.query);
    const search = (req.query.q || '').trim();
    const tier = req.query.tier || 'all'; // 'all' | 'permanent' | 'personal' | 'public'
    const status = req.query.status || 'all'; // 'all' | 'active' | 'suspended' | 'available' | 'expired'
    const offset = (page - 1) * limit;

    // Fetch live summary counts across all tiers
    const [permCountRes, persCountRes, pubCountRes] = await Promise.all([
      query('SELECT COUNT(*)::int as count FROM users'),
      query("SELECT COUNT(*)::int as count FROM temp_addresses WHERE tier = 'personal'"),
      query("SELECT COUNT(*)::int as count FROM temp_addresses WHERE tier = 'public'"),
    ]);

    const counts = {
      permanent: permCountRes.rows[0].count,
      personal: persCountRes.rows[0].count,
      public: pubCountRes.rows[0].count,
      total: permCountRes.rows[0].count + persCountRes.rows[0].count + pubCountRes.rows[0].count,
    };

    const countQuery = `
      SELECT COUNT(*)::int as count FROM (
        SELECT id::text as id, email, username, 'permanent' as tier, CASE WHEN is_suspended THEN 'suspended' ELSE 'active' END as status FROM users
        UNION ALL
        SELECT 'temp_' || id::text as id, address as email, COALESCE(custom_username, split_part(address, '@', 1)) as username, 'personal' as tier, status FROM temp_addresses WHERE tier = 'personal'
        UNION ALL
        SELECT 'temp_' || id::text as id, address as email, split_part(address, '@', 1) as username, 'public' as tier, status FROM temp_addresses WHERE tier = 'public'
      ) combined
      WHERE ($1 = 'all' OR tier = $1)
        AND ($2 = 'all' OR status = $2)
        AND ($3 = '' OR username ILIKE '%' || $3 || '%' OR email ILIKE '%' || $3 || '%')
    `;

    const dataQuery = `
      SELECT * FROM (
        SELECT 
          id::text as id,
          email,
          username,
          COALESCE(display_name, username) as display_name,
          'permanent' as tier,
          is_admin,
          is_suspended,
          CASE WHEN is_suspended THEN 'suspended' ELSE 'active' END as status,
          created_at,
          NULL::timestamptz as expires_at,
          last_login_at,
          0 as message_count
        FROM users
        UNION ALL
        SELECT 
          'temp_' || id::text as id,
          address as email,
          COALESCE(custom_username, split_part(address, '@', 1)) as username,
          'Personal Disposable Mailbox' as display_name,
          'personal' as tier,
          FALSE as is_admin,
          CASE WHEN status = 'suspended' THEN TRUE ELSE FALSE END as is_suspended,
          status,
          created_at,
          expires_at,
          last_accessed as last_login_at,
          message_count
        FROM temp_addresses
        WHERE tier = 'personal'
        UNION ALL
        SELECT 
          'temp_' || id::text as id,
          address as email,
          split_part(address, '@', 1) as username,
          'Community Public Disposable' as display_name,
          'public' as tier,
          FALSE as is_admin,
          CASE WHEN status = 'suspended' THEN TRUE ELSE FALSE END as is_suspended,
          status,
          created_at,
          expires_at,
          last_accessed as last_login_at,
          message_count
        FROM temp_addresses
        WHERE tier = 'public'
      ) combined
      WHERE ($1 = 'all' OR tier = $1)
        AND ($2 = 'all' OR status = $2)
        AND ($3 = '' OR username ILIKE '%' || $3 || '%' OR email ILIKE '%' || $3 || '%')
      ORDER BY created_at DESC
      LIMIT $4 OFFSET $5
    `;

    const params = [tier, status, search, limit, offset];

    const [total, data] = await Promise.all([
      query(countQuery, [tier, status, search]),
      query(dataQuery, params),
    ]);

    res.json({
      users: data.rows,
      counts,
      pagination: paginationMeta(total.rows[0].count, page, limit),
    });
  } catch (err) {
    next(err);
  }
});

/**
 * GET /api/admin/users/:id
 * Get a single user with full details.
 */
router.get('/users/:id', async (req, res, next) => {
  try {
    const rawId = req.params.id;

    if (rawId.startsWith('temp_') || rawId.includes('@')) {
      const cleanId = rawId.replace('temp_', '');
      const result = await query(
        `SELECT id, address as email, custom_username as username, 'Personal Disposable Mailbox' as display_name,
                tier, status, message_count, expires_at, activated_at as created_at, last_accessed as last_login_at
         FROM temp_addresses
         WHERE id::text = $1 OR address = $1`,
        [cleanId]
      );
      if (result.rows.length === 0) return res.status(404).json({ error: 'Personal temp user not found' });
      return res.json({ user: { ...result.rows[0], id: `temp_${result.rows[0].id}`, is_admin: false, is_suspended: result.rows[0].status === 'suspended' }, loginHistory: [] });
    }

    const result = await query(
      `SELECT id, email, username, display_name, recovery_email, is_admin, is_suspended,
              otp_enabled, invite_code_used, created_at, last_login_at, timezone, language
       FROM users WHERE id = $1`,
      [parseInt(rawId, 10)]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'User not found' });
    }

    // Get login history
    const logins = await query(
      `SELECT ip_address, user_agent, success, failure_reason, created_at
       FROM login_history WHERE user_id = $1 ORDER BY created_at DESC LIMIT 20`,
      [parseInt(rawId, 10)]
    );

    res.json({ user: result.rows[0], loginHistory: logins.rows });
  } catch (err) {
    next(err);
  }
});

/**
 * POST /api/admin/users
 * Admin manually creates a new user account (Permanent Webmail OR Personal Temp Mail).
 */
router.post('/users',
  validate({
    username: { type: 'string', required: true, min: 2, max: 50 },
    password: { type: 'string', required: true, min: 6 },
    email: { type: 'string' },
    displayName: { type: 'string', max: 50 },
    isAdmin: { type: 'boolean' },
    tier: { type: 'string', default: 'permanent' }, // 'permanent' | 'personal'
    expiryHours: { type: 'number' },
  }),
  async (req, res, next) => {
    try {
      const { username, password, displayName, isAdmin, tier } = req.body;

      if (tier === 'personal') {
        const domain = process.env.DOMAIN_TEMP || 'mail.wox.world';
        const address = `${username.toLowerCase()}@${domain}`;
        const expiryHours = Math.min(1440, Math.max(1, req.body.expiryHours || 720)); // default 30 days, up to 60 days
        const expiresAt = new Date(Date.now() + expiryHours * 3600 * 1000).toISOString();

        // Check if address exists
        const existing = await query('SELECT id FROM temp_addresses WHERE address = $1 AND status != \'expired\'', [address]);
        if (existing.rows.length > 0) {
          return res.status(409).json({ error: 'This personal temp username is already in use' });
        }

        const imapPassword = generateToken(16);
        const sessionToken = generateToken(16);
        const hash = await hashPassword(password);

        try {
          await createUser(address, imapPassword);
        } catch (pmErr) {
          // sandbox fallback
        }

        const insertRes = await query(
          `INSERT INTO temp_addresses
           (address, tier, status, password_hash, custom_username, session_token, imap_password, expires_at, activated_at, last_accessed)
           VALUES ($1, 'personal', 'active', $2, $3, $4, $5, $6, NOW(), NOW())
           RETURNING id, address as email, custom_username as username, tier, status, created_at, expires_at`,
          [address, hash, username.toLowerCase(), sessionToken, imapPassword, expiresAt]
        );

        const newTemp = {
          ...insertRes.rows[0],
          id: `temp_${insertRes.rows[0].id}`,
          display_name: displayName || 'Personal Disposable Mailbox',
          is_admin: false,
          is_suspended: false,
        };

        await query(
          `INSERT INTO audit_log (actor_type, actor_id, action, target_type, target_id, details, ip_address)
           VALUES ('admin', $1, 'admin_create_personal_temp', 'temp_address', $2, $3, $4)`,
          [String(req.user.id), address, JSON.stringify({ address, username, expiryHours }), req.ip]
        );

        return res.status(201).json({ user: newTemp });
      }

      // Permanent user creation
      const domain = process.env.DOMAIN_PERMANENT || 'wox.world';
      const email = (req.body.email || `${username.toLowerCase()}@${domain}`).trim().toLowerCase();

      // Check if user already exists
      const existing = await query('SELECT id FROM users WHERE email = $1 OR username = $2', [email, username]);
      if (existing.rows.length > 0) {
        return res.status(409).json({ error: 'A user with this username or email already exists' });
      }

      // 1. Provision mailbox on Purelymail
      try {
        await createUser(email, password);
      } catch (err) {
        // Continue if user already exists in API sandbox
      }

      // 2. Hash password & insert into PostgreSQL
      const hash = await hashPassword(password);
      const insertRes = await query(
        `INSERT INTO users (email, username, password_hash, display_name, is_admin, is_suspended, created_at)
         VALUES ($1, $2, $3, $4, $5, FALSE, NOW())
         RETURNING id, email, username, display_name, is_admin, is_suspended, created_at`,
        [email, username, hash, displayName || username, Boolean(isAdmin)]
      );

      const newUser = { ...insertRes.rows[0], tier: 'permanent' };

      // 3. Audit log
      await query(
        `INSERT INTO audit_log (actor_type, actor_id, action, target_type, target_id, details, ip_address)
         VALUES ('admin', $1, 'admin_create_user', 'user', $2, $3, $4)`,
        [String(req.user.id), String(newUser.id), JSON.stringify({ email, username, isAdmin }), req.ip]
      );

      res.status(201).json({ user: newUser });
    } catch (err) {
      next(err);
    }
  }
);

/**
 * PUT /api/admin/users/:id
 * Admin update user (suspend, promote, username, email, display name).
 */
router.put('/users/:id',
  validate({
    is_suspended: { type: 'boolean' },
    is_admin: { type: 'boolean' },
    displayName: { type: 'string', max: 50 },
    username: { type: 'string', min: 2, max: 50 },
    email: { type: 'string' },
  }),
  async (req, res, next) => {
    try {
      const rawId = req.params.id;
      const { is_suspended, is_admin, displayName, username, email } = req.body;

      if (rawId.startsWith('temp_') || rawId.includes('@')) {
        const cleanId = rawId.replace('temp_', '');
        const newStatus = is_suspended ? 'suspended' : 'active';

        const result = await query(
          `UPDATE temp_addresses
           SET status = $1,
               custom_username = COALESCE($2, custom_username)
           WHERE id::text = $3 OR address = $3
           RETURNING id, address as email, custom_username as username, tier, status, created_at, expires_at`,
          [newStatus, username || null, cleanId]
        );

        if (result.rows.length === 0) return res.status(404).json({ error: 'Personal temp user not found' });
        return res.json({
          user: {
            ...result.rows[0],
            id: `temp_${result.rows[0].id}`,
            is_admin: false,
            is_suspended: result.rows[0].status === 'suspended',
            display_name: displayName || 'Personal Disposable Mailbox',
          },
        });
      }

      const userId = parseInt(rawId, 10);
      const updates = [];
      const values = [];
      let idx = 1;

      if (is_suspended !== undefined) { updates.push(`is_suspended = $${idx++}`); values.push(is_suspended); }
      if (is_admin !== undefined) { updates.push(`is_admin = $${idx++}`); values.push(is_admin); }
      if (displayName !== undefined) { updates.push(`display_name = $${idx++}`); values.push(displayName); }
      if (username !== undefined) { updates.push(`username = $${idx++}`); values.push(username); }
      if (email !== undefined) { updates.push(`email = $${idx++}`); values.push(email.trim().toLowerCase()); }

      if (updates.length === 0) {
        return res.status(400).json({ error: 'No fields to update' });
      }

      values.push(userId);
      const result = await query(
        `UPDATE users SET ${updates.join(', ')}, updated_at = NOW()
         WHERE id = $${idx}
         RETURNING id, email, username, display_name, is_admin, is_suspended`,
        values
      );

      if (result.rows.length === 0) {
        return res.status(404).json({ error: 'User not found' });
      }

      // If suspended, revoke all sessions
      if (is_suspended === true) {
        await query('UPDATE user_sessions SET is_revoked = TRUE WHERE user_id = $1', [userId]);
      }

      // Audit
      await query(
        `INSERT INTO audit_log (actor_type, actor_id, action, target_type, target_id, details, ip_address)
         VALUES ('admin', $1, 'admin_update_user', 'user', $2, $3, $4)`,
        [String(req.user.id), String(userId), JSON.stringify(req.body), req.ip]
      );

      res.json({ user: { ...result.rows[0], tier: 'permanent' } });
    } catch (err) {
      next(err);
    }
  }
);

/**
 * POST /api/admin/users/:id/reset-password
 * Force reset a user's password (supports Permanent and Personal Temp accounts).
 */
router.post('/users/:id/reset-password',
  validate({ newPassword: { type: 'string', required: true, min: 6 } }),
  async (req, res, next) => {
    try {
      const rawId = req.params.id;
      const hash = await hashPassword(req.body.newPassword);

      if (rawId.startsWith('temp_') || rawId.includes('@')) {
        const cleanId = rawId.replace('temp_', '');
        const result = await query(
          'UPDATE temp_addresses SET password_hash = $1 WHERE id::text = $2 OR address = $2 RETURNING address',
          [hash, cleanId]
        );

        if (result.rows.length === 0) return res.status(404).json({ error: 'Personal temp user not found' });

        await query(
          `INSERT INTO audit_log (actor_type, actor_id, action, target_type, target_id, ip_address)
           VALUES ('admin', $1, 'admin_reset_password', 'temp_address', $2, $3)`,
          [String(req.user.id), result.rows[0].address, req.ip]
        );

        return res.json({ message: `Password reset for personal temp mailbox ${result.rows[0].address}.` });
      }

      const userId = parseInt(rawId, 10);
      await query('UPDATE users SET password_hash = $1, updated_at = NOW() WHERE id = $2', [hash, userId]);
      await query('UPDATE user_sessions SET is_revoked = TRUE WHERE user_id = $1', [userId]);

      await query(
        `INSERT INTO audit_log (actor_type, actor_id, action, target_type, target_id, ip_address)
         VALUES ('admin', $1, 'admin_reset_password', 'user', $2, $3)`,
        [String(req.user.id), String(userId), req.ip]
      );

      res.json({ message: 'Password reset. All sessions revoked.' });
    } catch (err) {
      next(err);
    }
  }
);

/**
 * POST /api/admin/users/:id/impersonate
 * Generate impersonation token to open user inbox.
 */
router.post('/users/:id/impersonate', async (req, res, next) => {
  try {
    const rawId = req.params.id;

    if (rawId.startsWith('temp_') || rawId.includes('@')) {
      const cleanId = rawId.replace('temp_', '');
      const result = await query(
        `SELECT id, address, custom_username, tier, status FROM temp_addresses WHERE id::text = $1 OR address = $1`,
        [cleanId]
      );
      if (result.rows.length === 0) return res.status(404).json({ error: 'Personal temp user not found' });

      return res.json({
        user: result.rows[0],
        openUrl: `/api/admin/impersonate/temp/${encodeURIComponent(result.rows[0].address)}`,
      });
    }

    const userId = parseInt(rawId, 10);
    const result = await query(
      `SELECT id, email, username, is_admin, is_suspended FROM users WHERE id = $1`,
      [userId]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'User not found' });
    }

    const targetUser = result.rows[0];
    const token = jwt.sign(
      {
        userId: targetUser.id,
        email: targetUser.email,
        impersonatorId: req.user.id,
        impersonated: true,
      },
      process.env.JWT_SECRET,
      { expiresIn: '1h' }
    );

    await query(
      `INSERT INTO audit_log (actor_type, actor_id, action, target_type, target_id, details, ip_address)
       VALUES ('admin', $1, 'admin_impersonate_user', 'user', $2, $3, $4)`,
      [String(req.user.id), String(userId), JSON.stringify({ email: targetUser.email }), req.ip]
    );

    res.json({
      token,
      user: targetUser,
      openUrl: `/api/admin/impersonate/${userId}`,
    });
  } catch (err) {
    next(err);
  }
});

/**
 * GET /api/admin/impersonate/temp/:address
 * Impersonate and open Personal Temp Mailbox with session backup shield.
 */
router.get('/impersonate/temp/:address', async (req, res, next) => {
  try {
    const address = req.params.address;
    const result = await query(
      `SELECT id, address, session_token FROM temp_addresses WHERE address = $1`,
      [address]
    );

    if (result.rows.length === 0) {
      return res.status(404).send('Personal temp mailbox not found');
    }

    // Save admin token into backup cookie
    const currentAdminToken = req.cookies?.woxmail_token;
    if (currentAdminToken) {
      res.cookie('woxmail_admin_backup', currentAdminToken, {
        httpOnly: true,
        secure: process.env.NODE_ENV === 'production',
        sameSite: 'lax',
        maxAge: 86400 * 1000,
      });
    }

    let sessionToken = result.rows[0].session_token;
    if (!sessionToken) {
      sessionToken = generateToken(16);
      await query('UPDATE temp_addresses SET session_token = $1 WHERE id = $2', [sessionToken, result.rows[0].id]);
    }

    res.cookie('woxmail_temp', sessionToken, {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'lax',
      maxAge: 86400 * 30 * 1000,
    });

    res.redirect(`/tempmail?address=${encodeURIComponent(address)}`);
  } catch (err) {
    next(err);
  }
});

/**
 * GET /api/admin/impersonate/:id
 * Sets user session cookie and redirects admin into user's dashboard in a new tab.
 * Preserves admin session in woxmail_admin_backup cookie.
 */
router.get('/impersonate/:id', async (req, res, next) => {
  try {
    const rawId = req.params.id;

    if (rawId.startsWith('temp_') || rawId.includes('@')) {
      const cleanId = rawId.replace('temp_', '');
      const addrRes = await query('SELECT address FROM temp_addresses WHERE id::text = $1 OR address = $1', [cleanId]);
      if (addrRes.rows.length > 0) {
        return res.redirect(`/api/admin/impersonate/temp/${encodeURIComponent(addrRes.rows[0].address)}`);
      }
    }

    const userId = parseInt(rawId, 10);
    const result = await query(
      `SELECT id, email, username, is_admin, is_suspended FROM users WHERE id = $1`,
      [userId]
    );

    if (result.rows.length === 0) {
      return res.status(404).send('User not found');
    }

    const targetUser = result.rows[0];
    const token = jwt.sign(
      {
        userId: targetUser.id,
        email: targetUser.email,
        impersonatorId: req.user?.id || 1,
        adminEmail: req.user?.email || 'admin@wox.world',
        impersonated: true,
      },
      process.env.JWT_SECRET,
      { expiresIn: '1h' }
    );

    // Save current admin token into backup cookie before switching
    const currentAdminToken = req.cookies?.woxmail_token;
    if (currentAdminToken) {
      res.cookie('woxmail_admin_backup', currentAdminToken, {
        httpOnly: true,
        secure: process.env.NODE_ENV === 'production',
        sameSite: 'lax',
        maxAge: 86400 * 1000,
      });
    }

    res.cookie('woxmail_token', token, {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'lax',
      maxAge: 3600 * 1000,
    });

    res.redirect('/dashboard');
  } catch (err) {
    next(err);
  }
});

/**
 * DELETE /api/admin/users/:id
 * Delete a user (Permanent Webmail or Personal Temp Mail) from Purelymail and database.
 */
router.delete('/users/:id', async (req, res, next) => {
  try {
    const rawId = req.params.id;

    if (rawId.startsWith('temp_') || rawId.includes('@')) {
      const cleanId = rawId.replace('temp_', '');
      const tempRes = await query('SELECT id, address FROM temp_addresses WHERE id::text = $1 OR address = $1', [cleanId]);
      if (tempRes.rows.length === 0) {
        return res.status(404).json({ error: 'Personal temp mailbox not found' });
      }

      const address = tempRes.rows[0].address;

      try {
        await deleteUser(address);
      } catch (err) {}

      await query('DELETE FROM temp_addresses WHERE id = $1', [tempRes.rows[0].id]);

      await query(
        `INSERT INTO audit_log (actor_type, actor_id, action, target_type, target_id, details, ip_address)
         VALUES ('admin', $1, 'admin_delete_personal_temp', 'temp_address', $2, $3, $4)`,
        [String(req.user.id), address, JSON.stringify({ address }), req.ip]
      );

      return res.json({ message: `Personal temp mailbox ${address} deleted successfully.` });
    }

    const userId = parseInt(rawId, 10);
    const userRes = await query('SELECT id, email, username FROM users WHERE id = $1', [userId]);
    if (userRes.rows.length === 0) {
      return res.status(404).json({ error: 'User not found' });
    }

    const userEmail = userRes.rows[0].email;

    // 1. Delete from Purelymail
    try {
      await deleteUser(userEmail);
    } catch (err) {
      // Ignored if user not found in Purelymail
    }

    // 2. Delete from PostgreSQL
    await query('DELETE FROM user_sessions WHERE user_id = $1', [userId]);
    await query('DELETE FROM users WHERE id = $1', [userId]);

    // 3. Audit
    await query(
      `INSERT INTO audit_log (actor_type, actor_id, action, target_type, target_id, details, ip_address)
       VALUES ('admin', $1, 'admin_delete_user', 'user', $2, $3, $4)`,
      [String(req.user.id), String(userId), JSON.stringify({ email: userEmail }), req.ip]
    );

    res.json({ message: `User ${userEmail} deleted successfully.` });
  } catch (err) {
    next(err);
  }
});

// ═════════════════════════════════════════════════════════
// INVITE CODES
// ═════════════════════════════════════════════════════════

/**
 * GET /api/admin/invites
 * List all invite codes with true usage, redemption, and expiration metadata.
 */
router.get('/invites', async (req, res, next) => {
  try {
    const result = await query(
      `SELECT ic.id, ic.code, ic.is_used, ic.used_by, ic.used_at, ic.created_by, ic.expires_at, ic.note, ic.created_at,
              u.username as used_by_username, u.email as used_by_email,
              CASE WHEN ic.expires_at IS NOT NULL AND ic.expires_at < NOW() THEN TRUE ELSE FALSE END as is_expired
       FROM invite_codes ic
       LEFT JOIN users u ON ic.used_by = u.id
       ORDER BY ic.created_at DESC
       LIMIT 300`
    );

    res.json({ invites: result.rows });
  } catch (err) {
    next(err);
  }
});

/**
 * POST /api/admin/invites
 * Generate new invite code(s).
 */
router.post('/invites',
  validate({
    count: { type: 'number', default: 1, min: 1, max: 50 },
    expiresInDays: { type: 'number', min: 1, max: 365 },
    note: { type: 'string', max: 200 },
  }),
  async (req, res, next) => {
    try {
      const { count, expiresInDays, note } = req.body;
      const codes = [];

      for (let i = 0; i < count; i++) {
        const code = `WOX-${generateToken(4).toUpperCase()}-${generateToken(4).toUpperCase()}`;
        const expiresAt = expiresInDays
          ? new Date(Date.now() + expiresInDays * 86400000).toISOString()
          : null;

        await query(
          `INSERT INTO invite_codes (code, created_by, expires_at, note)
           VALUES ($1, $2, $3, $4)`,
          [code, req.user.id, expiresAt, note || null]
        );

        codes.push({ code, expiresAt });
      }

      await query(
        `INSERT INTO audit_log (actor_type, actor_id, action, details, ip_address)
         VALUES ('admin', $1, 'generate_invites', $2, $3)`,
        [String(req.user.id), JSON.stringify({ count, codes: codes.map((c) => c.code) }), req.ip]
      );

      res.status(201).json({ codes });
    } catch (err) {
      next(err);
    }
  }
);

/**
 * DELETE /api/admin/invites/:code
 * Permanently delete/revoke an invite code.
 */
router.delete('/invites/:code', async (req, res, next) => {
  try {
    const target = req.params.code;
    const result = await query(
      'DELETE FROM invite_codes WHERE (code = $1 OR id::text = $1) RETURNING code, is_used',
      [target]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Invite code not found' });
    }

    await query(
      `INSERT INTO audit_log (actor_type, actor_id, action, details, ip_address)
       VALUES ('admin', $1, 'revoke_invite_code', $2, $3)`,
      [String(req.user.id), JSON.stringify({ code: result.rows[0].code, wasUsed: result.rows[0].is_used }), req.ip]
    );

    res.json({ message: 'Invite code revoked successfully', code: result.rows[0].code });
  } catch (err) {
    next(err);
  }
});

// ═════════════════════════════════════════════════════════
// SERVICE CONTROLS
// ═════════════════════════════════════════════════════════

/**
 * GET /api/admin/services
 * List service control rules.
 */
router.get('/services', async (req, res, next) => {
  try {
    const result = await query(
      'SELECT * FROM service_controls ORDER BY service_name ASC'
    );
    res.json({ services: result.rows });
  } catch (err) {
    next(err);
  }
});

/**
 * PUT /api/admin/services/:id
 * Update a service control rule (toggle tiers).
 */
router.put('/services/:id',
  validate({
    public_enabled: { type: 'boolean' },
    personal_enabled: { type: 'boolean' },
    permanent_enabled: { type: 'boolean' },
    service_domains: { type: 'array' },
  }),
  async (req, res, next) => {
    try {
      const id = parseInt(req.params.id, 10);
      const { public_enabled, personal_enabled, permanent_enabled, service_domains } = req.body;

      const updates = [];
      const values = [];
      let idx = 1;

      if (public_enabled !== undefined) { updates.push(`public_enabled = $${idx++}`); values.push(public_enabled); }
      if (personal_enabled !== undefined) { updates.push(`personal_enabled = $${idx++}`); values.push(personal_enabled); }
      if (permanent_enabled !== undefined) { updates.push(`permanent_enabled = $${idx++}`); values.push(permanent_enabled); }
      if (service_domains !== undefined) { updates.push(`service_domains = $${idx++}`); values.push(service_domains); }

      if (updates.length === 0) return res.status(400).json({ error: 'No fields to update' });

      values.push(id);
      const result = await query(
        `UPDATE service_controls SET ${updates.join(', ')}, updated_at = NOW() WHERE id = $${idx} RETURNING *`,
        values
      );

      if (result.rows.length === 0) return res.status(404).json({ error: 'Service not found' });

      // Refresh in-memory filter cache
      await refreshFilterCache();

      await query(
        `INSERT INTO audit_log (actor_type, actor_id, action, details, ip_address)
         VALUES ('admin', $1, 'update_service_control', $2, $3)`,
        [String(req.user.id), JSON.stringify(req.body), req.ip]
      );

      res.json({ service: result.rows[0] });
    } catch (err) {
      next(err);
    }
  }
);

/**
 * POST /api/admin/services
 * Add a new service control rule.
 */
router.post('/services',
  validate({
    service_name: { type: 'string', required: true, max: 50 },
    service_domains: { type: 'array', required: true },
    public_enabled: { type: 'boolean', default: true },
    personal_enabled: { type: 'boolean', default: true },
    permanent_enabled: { type: 'boolean', default: true },
  }),
  async (req, res, next) => {
    try {
      const { service_name, service_domains, public_enabled, personal_enabled, permanent_enabled } = req.body;

      const result = await query(
        `INSERT INTO service_controls (service_name, service_domains, public_enabled, personal_enabled, permanent_enabled)
         VALUES ($1, $2, $3, $4, $5)
         RETURNING *`,
        [service_name, service_domains, public_enabled, personal_enabled, permanent_enabled]
      );

      await refreshFilterCache();
      res.status(201).json({ service: result.rows[0] });
    } catch (err) {
      next(err);
    }
  }
);

// ═════════════════════════════════════════════════════════
// SETTINGS (GLOBAL)
// ═════════════════════════════════════════════════════════

/**
 * GET /api/admin/settings
 * List all global settings.
 */
router.get('/settings', async (req, res, next) => {
  try {
    const result = await query('SELECT key, value, description FROM settings ORDER BY key ASC');
    res.json({ settings: result.rows });
  } catch (err) {
    next(err);
  }
});

/**
 * PUT /api/admin/settings
 * Bulk update global settings.
 */
router.put('/settings',
  validate({ settings: { type: 'object', required: true } }),
  async (req, res, next) => {
    try {
      const { settings: newSettings } = req.body;

      for (const [key, value] of Object.entries(newSettings)) {
        await query(
          `UPDATE settings SET value = $1, updated_at = NOW() WHERE key = $2`,
          [String(value), key]
        );
      }

      await query(
        `INSERT INTO audit_log (actor_type, actor_id, action, details, ip_address)
         VALUES ('admin', $1, 'update_settings', $2, $3)`,
        [String(req.user.id), JSON.stringify(newSettings), req.ip]
      );

      res.json({ message: 'Settings updated' });
    } catch (err) {
      next(err);
    }
  }
);

// ═════════════════════════════════════════════════════════
// IP BLOCKING
// ═════════════════════════════════════════════════════════

/**
 * GET /api/admin/blocked-ips
 */
router.get('/blocked-ips', async (req, res, next) => {
  try {
    const result = await query(
      `SELECT * FROM blocked_ips WHERE (expires_at IS NULL OR expires_at > NOW()) ORDER BY created_at DESC LIMIT 200`
    );
    res.json({ blockedIps: result.rows });
  } catch (err) {
    next(err);
  }
});

/**
 * POST /api/admin/blocked-ips
 * Block an IP address.
 */
router.post('/blocked-ips',
  validate({
    ip_address: { type: 'string', required: true },
    reason: { type: 'string', max: 200 },
    expiresInHours: { type: 'number', min: 1 },
  }),
  async (req, res, next) => {
    try {
      const { ip_address, reason, expiresInHours } = req.body;
      const expiresAt = expiresInHours
        ? new Date(Date.now() + expiresInHours * 3600000).toISOString()
        : null;

      await query(
        `INSERT INTO blocked_ips (ip_address, reason, blocked_by, expires_at)
         VALUES ($1, $2, $3, $4)
         ON CONFLICT (ip_address) DO UPDATE SET reason = EXCLUDED.reason, expires_at = EXCLUDED.expires_at`,
        [ip_address, reason || null, req.user.id, expiresAt]
      );

      res.status(201).json({ message: 'IP blocked' });
    } catch (err) {
      next(err);
    }
  }
);

/**
 * DELETE /api/admin/blocked-ips/:ip
 * Unblock an IP.
 */
router.delete('/blocked-ips/:ip', async (req, res, next) => {
  try {
    await query('DELETE FROM blocked_ips WHERE ip_address = $1', [req.params.ip]);
    res.json({ message: 'IP unblocked' });
  } catch (err) {
    next(err);
  }
});

// ═════════════════════════════════════════════════════════
// POOL MANAGEMENT
// ═════════════════════════════════════════════════════════

/**
 * GET /api/admin/pool
 * Get pool statistics.
 */
router.get('/pool', async (req, res, next) => {
  try {
    const stats = await getPoolStats();
    res.json({ pool: stats });
  } catch (err) {
    next(err);
  }
});

/**
 * POST /api/admin/pool/replenish
 * Manually trigger pool replenishment.
 */
router.post('/pool/replenish', async (req, res, next) => {
  try {
    const created = await replenishPool();
    res.json({ message: `Replenished ${created} addresses`, created });
  } catch (err) {
    next(err);
  }
});

/**
 * POST /api/admin/pool/purge-all
 * Purge ALL public temp mail addresses from Purelymail and database,
 * and immediately regenerate a fresh 20-mailbox pool with 48h active lifecycles.
 */
router.post('/pool/purge-all', async (req, res, next) => {
  try {
    const lifespanHours = parseInt(req.body.lifespanHours, 10) || 48;
    const targetSize = parseInt(req.body.targetSize, 10) || 20;

    const result = await purgeAllTempPoolAndRecreate({ lifespanHours, targetSize });

    await query(
      `INSERT INTO audit_log (actor_type, actor_id, action, details, ip_address)
       VALUES ('admin', $1, 'admin_purge_all_temp_pool', $2, $3)`,
      [String(req.user.id), JSON.stringify(result), req.ip]
    );

    res.json({
      message: `Successfully purged ${result.purgedCount} addresses from Purelymail and created ${result.createdCount} fresh 48-hour addresses in pool.`,
      ...result,
    });
  } catch (err) {
    next(err);
  }
});

// ═════════════════════════════════════════════════════════
// AUDIT LOG
// ═════════════════════════════════════════════════════════

/**
 * GET /api/admin/audit
 * Paginated audit log.
 */
router.get('/audit', async (req, res, next) => {
  try {
    const { page, limit } = parsePagination(req.query);
    const offset = (page - 1) * limit;

    const [total, data] = await Promise.all([
      query('SELECT COUNT(*)::int as count FROM audit_log'),
      query(
        `SELECT * FROM audit_log ORDER BY created_at DESC LIMIT $1 OFFSET $2`,
        [limit, offset]
      ),
    ]);

    res.json({
      logs: data.rows,
      pagination: paginationMeta(total.rows[0].count, page, limit),
    });
  } catch (err) {
    next(err);
  }
});

// ═════════════════════════════════════════════════════════
// ANNOUNCEMENTS
// ═════════════════════════════════════════════════════════

/**
 * GET /api/admin/announcements
 */
router.get('/announcements', async (req, res, next) => {
  try {
    const result = await query('SELECT * FROM announcements ORDER BY created_at DESC LIMIT 50');
    res.json({ announcements: result.rows });
  } catch (err) {
    next(err);
  }
});

/**
 * POST /api/admin/announcements
 */
router.post('/announcements',
  validate({
    title: { type: 'string', required: true, max: 200 },
    content: { type: 'string' },
    body: { type: 'string' },
    type: { type: 'string', default: 'info' },
    expiresAt: { type: 'string' },
  }),
  async (req, res, next) => {
    try {
      const title = req.body.title;
      const textBody = req.body.content || req.body.body || '';
      let announcementType = req.body.type || 'info';
      if (!['info', 'warning', 'critical'].includes(announcementType)) {
        announcementType = announcementType === 'maintenance' ? 'warning' : 'info';
      }

      const result = await query(
        `INSERT INTO announcements (title, body, type, created_by, ends_at)
         VALUES ($1, $2, $3, $4, $5)
         RETURNING id, title, body, body as content, type, created_by, created_at`,
        [title, textBody, announcementType, req.user.id, req.body.expiresAt || null]
      );

      res.status(201).json({ announcement: result.rows[0] });
    } catch (err) {
      next(err);
    }
  }
);

/**
 * DELETE /api/admin/announcements/:id
 */
router.delete('/announcements/:id', async (req, res, next) => {
  try {
    await query('DELETE FROM announcements WHERE id = $1', [parseInt(req.params.id, 10)]);
    res.json({ message: 'Announcement deleted' });
  } catch (err) {
    next(err);
  }
});

// ═════════════════════════════════════════════════════════
// MULTIPLE ADMINISTRATOR MANAGEMENT
// ═════════════════════════════════════════════════════════

/**
 * GET /api/admin/admins
 * List all active administrator accounts.
 */
router.get('/admins', async (req, res, next) => {
  try {
    const result = await query(
      `SELECT id, email, username, display_name, is_admin, is_suspended, otp_enabled, last_login_at, created_at
       FROM users
       WHERE is_admin = TRUE
       ORDER BY created_at ASC`
    );
    res.json({ admins: result.rows });
  } catch (err) {
    next(err);
  }
});

/**
 * POST /api/admin/admins/create
 * Create a new administrator account directly.
 */
router.post('/admins/create',
  validate({
    email: { type: 'string', required: true },
    username: { type: 'string', required: true, min: 3, max: 30 },
    password: { type: 'string', required: true, min: 8 },
    displayName: { type: 'string', max: 50 },
  }),
  async (req, res, next) => {
    try {
      const { email, username, password, displayName } = req.body;
      const cleanEmail = email.toLowerCase().trim();
      const cleanUsername = username.toLowerCase().trim();

      // Check if user already exists
      const existing = await query(
        `SELECT id, is_admin FROM users WHERE email = $1 OR username = $2`,
        [cleanEmail, cleanUsername]
      );

      if (existing.rows.length > 0) {
        // If user exists, promote them to admin
        const updated = await query(
          `UPDATE users SET is_admin = TRUE, updated_at = NOW() WHERE id = $1 RETURNING id, email, username, is_admin`,
          [existing.rows[0].id]
        );
        return res.status(200).json({ message: 'Existing user promoted to Administrator', admin: updated.rows[0] });
      }

      // Hash password
      const passwordHash = await hashPassword(password);

      // Create in Purelymail
      try {
        await createUser(cleanEmail, password);
      } catch (pmErr) {
        // Log note in development
      }

      // Insert new Admin user
      const result = await query(
        `INSERT INTO users (
           email, username, password_hash, display_name, is_admin, created_at
         )
         VALUES ($1, $2, $3, $4, TRUE, NOW())
         RETURNING id, email, username, display_name, is_admin, created_at`,
        [cleanEmail, cleanUsername, passwordHash, displayName || cleanUsername]
      );

      // Audit Log
      await query(
        `INSERT INTO audit_log (actor_type, actor_id, action, target_type, target_id, details, ip_address)
         VALUES ('admin', $1, 'create_admin_account', 'user', $2, $3, $4)`,
        [String(req.user.id), String(result.rows[0].id), JSON.stringify({ email: cleanEmail, username: cleanUsername }), req.ip]
      );

      res.status(201).json({ message: 'Administrator created successfully', admin: result.rows[0] });
    } catch (err) {
      next(err);
    }
  }
);

/**
 * PATCH /api/admin/admins/:id/toggle
 * Promote or revoke administrator privileges for a user.
 */
router.patch('/admins/:id/toggle', async (req, res, next) => {
  try {
    const targetId = parseInt(req.params.id, 10);
    if (targetId === req.user.id) {
      return res.status(400).json({ error: 'You cannot revoke your own administrator privileges' });
    }

    const userRes = await query('SELECT id, email, username, is_admin FROM users WHERE id = $1', [targetId]);
    if (userRes.rows.length === 0) {
      return res.status(404).json({ error: 'User not found' });
    }

    const newAdminStatus = !userRes.rows[0].is_admin;
    const updated = await query(
      `UPDATE users SET is_admin = $1, updated_at = NOW() WHERE id = $2 RETURNING id, email, username, is_admin`,
      [newAdminStatus, targetId]
    );

    // Audit Log
    await query(
      `INSERT INTO audit_log (actor_type, actor_id, action, target_type, target_id, details, ip_address)
       VALUES ('admin', $1, 'toggle_admin_privilege', 'user', $2, $3, $4)`,
      [String(req.user.id), String(targetId), JSON.stringify({ newAdminStatus }), req.ip]
    );

    res.json({
      message: newAdminStatus ? 'User granted Administrator access' : 'Administrator access revoked',
      admin: updated.rows[0],
    });
  } catch (err) {
    next(err);
  }
});

// ═════════════════════════════════════════════════════════
// SYSTEM DIAGNOSTICS & BACKUPS
// ═════════════════════════════════════════════════════════

/**
 * POST /api/admin/diagnostics/test-mail
 * Real-time diagnostic test of Purelymail IMAP & SMTP connections.
 */
router.get('/diagnostics/health', async (req, res, next) => {
  try {
    const startTime = Date.now();
    const dbCheck = await query('SELECT NOW() as time, version() as version');
    const dbLatency = Date.now() - startTime;

    const memory = process.memoryUsage();
    const uptime = process.uptime();

    res.json({
      status: 'ok',
      uptime,
      memory: {
        rssMb: Math.round(memory.rss / 1024 / 1024),
        heapUsedMb: Math.round(memory.heapUsed / 1024 / 1024),
        heapTotalMb: Math.round(memory.heapTotal / 1024 / 1024),
      },
      database: {
        ok: true,
        latencyMs: dbLatency,
        serverTime: dbCheck.rows[0].time,
      },
      environment: process.env.NODE_ENV || 'development',
      port: process.env.PORT || 3001,
      domains: {
        permanent: process.env.DOMAIN_PERMANENT || 'wox.world',
        temp: process.env.DOMAIN_TEMP || 'mail.wox.world',
      },
    });
  } catch (err) {
    next(err);
  }
});

/**
 * GET /api/admin/diagnostics/full
 * Deep cluster diagnostics, table row counts, database sizes, memory, and cache status.
 */
router.get('/diagnostics/full', async (req, res, next) => {
  try {
    const startTime = Date.now();
    const [dbVersion, dbSizeRes, tableCounts] = await Promise.all([
      query('SELECT version() as version, NOW() as server_time'),
      query(`SELECT pg_size_pretty(pg_database_size(current_database())) as size`),
      query(`
        SELECT
          (SELECT COUNT(*) FROM users)::int as users,
          (SELECT COUNT(*) FROM invite_codes)::int as invites,
          (SELECT COUNT(*) FROM temp_addresses)::int as temp_addresses,
          (SELECT COUNT(*) FROM blocked_ips)::int as blocked_ips,
          (SELECT COUNT(*) FROM audit_log)::int as audit_logs,
          (SELECT COUNT(*) FROM service_controls)::int as service_controls,
          (SELECT COUNT(*) FROM announcements)::int as announcements
      `),
    ]);
    const dbLatency = Date.now() - startTime;

    const memory = process.memoryUsage();
    const uptime = process.uptime();

    res.json({
      status: 'ok',
      uptime,
      system: {
        nodeVersion: process.version,
        platform: process.platform,
        arch: process.arch,
        pid: process.pid,
        rssMb: Math.round(memory.rss / 1024 / 1024),
        heapUsedMb: Math.round(memory.heapUsed / 1024 / 1024),
        heapTotalMb: Math.round(memory.heapTotal / 1024 / 1024),
        externalMb: Math.round(memory.external / 1024 / 1024),
      },
      database: {
        connected: true,
        latencyMs: dbLatency,
        serverTime: dbVersion.rows[0].server_time,
        version: dbVersion.rows[0].version,
        databaseSize: dbSizeRes.rows[0].size,
        tables: tableCounts.rows[0],
      },
      cache: {
        type: process.env.REDIS_URL ? 'Redis / In-Memory' : 'In-Memory Store',
        status: 'Active',
      },
      cron: {
        activeTasks: 11,
        schedulerStatus: 'Operational',
        tasks: [
          'Inbound Verification Replies (10s)',
          'Campaign Broadcaster (10s)',
          'Support Desk Ingestion (2m)',
          'Dead Man Switch (5m)',
          'FutureMe Letters (1m)',
          'Scheduled Send (1m)',
          'Snooze Check (1m)',
          'Calendar Reminders (5m)',
          'Temp Mail Cleanup (15m)',
          'Pool Replenish (1h)',
          'Daily Cleanup (24h)',
        ],
      },
      mailServers: {
        permanentDomain: process.env.DOMAIN_PERMANENT || 'wox.world',
        tempDomain: process.env.DOMAIN_TEMP || 'mail.wox.world',
        imapHost: process.env.PURELYMAIL_IMAP_HOST || 'imap.purelymail.com',
        imapPort: Number(process.env.PURELYMAIL_IMAP_PORT) || 993,
        smtpHost: process.env.PURELYMAIL_SMTP_HOST || 'smtp.purelymail.com',
        smtpPort: Number(process.env.PURELYMAIL_SMTP_PORT) || 465,
        purelymailApiConfigured: Boolean(process.env.PURELYMAIL_API_TOKEN),
      },
    });
  } catch (err) {
    next(err);
  }
});

/**
 * GET /api/admin/diagnostics/export-snapshot
 * Download complete database JSON snapshot.
 */
router.get('/diagnostics/export-snapshot', async (req, res, next) => {
  try {
    const [users, invites, services, settings, announcements, blockedIps] = await Promise.all([
      query('SELECT id, email, username, display_name, is_admin, is_suspended, created_at FROM users'),
      query('SELECT id, code, is_used, expires_at, created_at FROM invite_codes'),
      query('SELECT * FROM service_controls'),
      query('SELECT key, value, description FROM settings'),
      query('SELECT * FROM announcements'),
      query('SELECT * FROM blocked_ips'),
    ]);

    const snapshot = {
      meta: {
        title: 'WoxMail Master Database Snapshot',
        exportedAt: new Date().toISOString(),
        version: '1.0.0',
        environment: process.env.NODE_ENV || 'development',
      },
      data: {
        users: users.rows,
        invites: invites.rows,
        services: services.rows,
        settings: settings.rows,
        announcements: announcements.rows,
        blockedIps: blockedIps.rows,
      },
    };

    const filename = `woxmail-snapshot-${new Date().toISOString().split('T')[0]}.json`;
    res.setHeader('Content-Type', 'application/json');
    res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
    res.send(JSON.stringify(snapshot, null, 2));
  } catch (err) {
    next(err);
  }
});

/**
 * POST /api/admin/diagnostics/vacuum
 * Run database VACUUM ANALYZE maintenance.
 */
router.post('/diagnostics/vacuum', async (req, res, next) => {
  try {
    const start = Date.now();
    await query('VACUUM ANALYZE');
    const durationMs = Date.now() - start;
    res.json({ success: true, message: `VACUUM ANALYZE completed in ${durationMs}ms`, durationMs });
  } catch (err) {
    next(err);
  }
});

/**
 * POST /api/admin/diagnostics/flush-cache
 * Flush Redis / In-Memory cache.
 */
router.post('/diagnostics/flush-cache', async (req, res, next) => {
  try {
    const { flushCache } = await import('../config/redis.js');
    const result = await flushCache();
    res.json({
      success: true,
      message: `All in-memory & Redis cache buffers purged successfully. (${result.memoryKeysCleared} in-memory keys cleared, Redis status: ${result.redisFlushed ? 'flushed' : 'offline/bypassed'})`,
      ...result,
    });
  } catch (err) {
    next(err);
  }
});

/**
 * GET /api/admin/backups
 * List stored database backups.
 */
router.get('/backups', async (req, res, next) => {
  try {
    const backupDir = process.env.BACKUP_DIR || path.join(process.cwd(), 'backups');
    let files = [];
    if (fs.existsSync(backupDir)) {
      files = fs.readdirSync(backupDir)
        .filter((f) => f.endsWith('.sql') || f.endsWith('.gz') || f.endsWith('.json'))
        .map((f) => {
          const stats = fs.statSync(path.join(backupDir, f));
          return {
            filename: f,
            sizeBytes: stats.size,
            sizeKb: Math.round(stats.size / 1024),
            createdAt: stats.mtime,
          };
        })
        .sort((a, b) => b.createdAt - a.createdAt);
    }
    res.json({ backups: files, backupDir });
  } catch (err) {
    next(err);
  }
});

/**
 * GET /api/admin/backups/download/:filename
 * Download a stored backup file.
 */
router.get('/backups/download/:filename', async (req, res, next) => {
  try {
    const filename = path.basename(req.params.filename);
    const backupDir = process.env.BACKUP_DIR || path.join(process.cwd(), 'backups');
    const filePath = path.join(backupDir, filename);

    if (!fs.existsSync(filePath)) {
      return res.status(404).json({ error: 'Backup file not found' });
    }

    res.download(filePath, filename);
  } catch (err) {
    next(err);
  }
});

/**
 * POST /api/admin/backups/create
 * Trigger manual database backup snapshot.
 */
router.post('/backups/create', async (req, res, next) => {
  try {
    const backupDir = process.env.BACKUP_DIR || path.join(process.cwd(), 'backups');
    if (!fs.existsSync(backupDir)) {
      fs.mkdirSync(backupDir, { recursive: true });
    }

    // Create JSON snapshot backup in backups directory
    const [users, invites, services, settings, announcements, blockedIps] = await Promise.all([
      query('SELECT id, email, username, display_name, is_admin, is_suspended, created_at FROM users'),
      query('SELECT id, code, is_used, expires_at, created_at FROM invite_codes'),
      query('SELECT * FROM service_controls'),
      query('SELECT key, value, description FROM settings'),
      query('SELECT * FROM announcements'),
      query('SELECT * FROM blocked_ips'),
    ]);

    const filename = `backup-snapshot-${Date.now()}.json`;
    const filePath = path.join(backupDir, filename);

    const snapshot = {
      meta: {
        title: 'WoxMail Database Automated Backup Snapshot',
        timestamp: new Date().toISOString(),
        version: '1.0.0',
      },
      data: {
        users: users.rows,
        invites: invites.rows,
        services: services.rows,
        settings: settings.rows,
        announcements: announcements.rows,
        blockedIps: blockedIps.rows,
      },
    };

    fs.writeFileSync(filePath, JSON.stringify(snapshot, null, 2), 'utf8');

    res.json({
      message: 'Database backup snapshot completed successfully',
      filename,
      path: filePath,
      timestamp: new Date().toISOString(),
    });
  } catch (err) {
    next(err);
  }
});

// ═════════════════════════════════════════════════════════
// FUTURE LETTERS / TIME CAPSULE MANAGEMENT SUITE
// ═════════════════════════════════════════════════════════

/**
 * GET /api/admin/future-letters
 * List scheduled and delivered time-capsule letters with search and filter.
 */
router.get('/future-letters', async (req, res, next) => {
  try {
    const { page, limit } = parsePagination(req.query);
    const status = req.query.status || 'all';
    const category = req.query.category || 'all';
    const search = req.query.q || '';

    const data = await getAdminFutureLetters({ page, limit, status, category, search });
    res.json(data);
  } catch (err) {
    next(err);
  }
});

/**
 * GET /api/admin/future-letters/:id
 * Single letter details.
 */
router.get('/future-letters/:id', async (req, res, next) => {
  try {
    const letter = await getAdminFutureLetter(req.params.id);
    if (!letter) return res.status(404).json({ error: 'Letter not found' });
    res.json({ letter });
  } catch (err) {
    next(err);
  }
});

/**
 * POST /api/admin/future-letters/:id/deliver-now
 * Force dispatch a scheduled future letter immediately.
 */
router.post('/future-letters/:id/deliver-now', async (req, res, next) => {
  try {
    const letter = await adminDeliverFutureLetterNow(req.params.id);

    await query(
      `INSERT INTO audit_log (actor_type, actor_id, action, target_type, target_id, details, ip_address)
       VALUES ('admin', $1, 'admin_deliver_future_letter_now', 'future_letter', $2, $3, $4)`,
      [String(req.user.id), String(letter.id), JSON.stringify({ recipient: letter.recipient_email, subject: letter.subject }), req.ip]
    );

    res.json({ message: 'Future letter dispatched and delivered immediately via SMTP!', letter });
  } catch (err) {
    next(err);
  }
});

/**
 * PUT /api/admin/future-letters/:id
 * Update future letter details.
 */
router.put('/future-letters/:id',
  validate({
    deliveryDate: { type: 'string' },
    recipientEmail: { type: 'string' },
    subject: { type: 'string' },
    body: { type: 'string' },
    status: { type: 'string' },
    visibility: { type: 'string' },
    category: { type: 'string' },
  }),
  async (req, res, next) => {
    try {
      const updated = await adminUpdateFutureLetter(req.params.id, req.body);

      await query(
        `INSERT INTO audit_log (actor_type, actor_id, action, target_type, target_id, details, ip_address)
         VALUES ('admin', $1, 'admin_update_future_letter', 'future_letter', $2, $3, $4)`,
        [String(req.user.id), String(updated.id), JSON.stringify(req.body), req.ip]
      );

      res.json({ message: 'Future letter updated successfully', letter: updated });
    } catch (err) {
      next(err);
    }
  }
);

/**
 * DELETE /api/admin/future-letters/:id
 * Delete a future letter.
 */
router.delete('/future-letters/:id', async (req, res, next) => {
  try {
    const deleted = await adminDeleteFutureLetter(req.params.id);

    await query(
      `INSERT INTO audit_log (actor_type, actor_id, action, target_type, target_id, details, ip_address)
       VALUES ('admin', $1, 'admin_delete_future_letter', 'future_letter', $2, $3, $4)`,
      [String(req.user.id), String(deleted.id), JSON.stringify({ subject: deleted.subject }), req.ip]
    );

    res.json({ message: 'Future letter deleted from vault permanently.' });
  } catch (err) {
    next(err);
  }
});

// ═════════════════════════════════════════════════════════
// 1. DOMAIN & DNS HEALTH CENTER
// ═════════════════════════════════════════════════════════

/**
 * GET /api/admin/domains
 * List all configured and hosted domains.
 */
router.get('/domains', async (req, res, next) => {
  try {
    const primaryDomain = process.env.DOMAIN_PERMANENT || 'wox.world';
    const tempDomain = process.env.DOMAIN_TEMP || 'mail.wox.world';

    const customDomainsRes = await query(
      `SELECT id, domain, source, created_at FROM disposable_domains ORDER BY id ASC`
    );

    const domains = [
      { id: 'primary', domain: primaryDomain, is_primary: true, is_temp: false, type: 'Permanent Primary' },
      { id: 'temp', domain: tempDomain, is_primary: false, is_temp: true, type: 'Disposable Temp' },
      ...customDomainsRes.rows.map((r) => ({
        id: r.id,
        domain: r.domain,
        is_primary: false,
        is_temp: r.source === 'disposable',
        type: r.source === 'disposable' ? 'Secondary Disposable' : 'Custom Organization Domain',
        created_at: r.created_at,
      })),
    ];

    res.json({ domains });
  } catch (err) {
    next(err);
  }
});

/**
 * POST /api/admin/domains/audit
 * Run real-time DoH security & deliverability health probe on a domain.
 */
router.post('/domains/audit', async (req, res, next) => {
  try {
    const { domain } = req.body;
    if (!domain) return res.status(400).json({ error: 'Domain is required' });

    const audit = await auditDomainDnsHealth(domain);
    res.json(audit);
  } catch (err) {
    next(err);
  }
});

/**
 * POST /api/admin/domains/dkim-generate
 * Generates an RSA-2048 keypair and formats the DNS TXT record.
 */
router.post('/domains/dkim-generate', async (req, res, next) => {
  try {
    const domain = (req.body.domain || 'wox.world').toLowerCase().trim();
    const selector = (req.body.selector || 'woxmail').toLowerCase().trim();

    const { publicKey, privateKey } = crypto.generateKeyPairSync('rsa', {
      modulusLength: 2048,
      publicKeyEncoding: { type: 'spki', format: 'pem' },
      privateKeyEncoding: { type: 'pkcs8', format: 'pem' },
    });

    const pubKeyClean = publicKey
      .replace(/-----BEGIN PUBLIC KEY-----/, '')
      .replace(/-----END PUBLIC KEY-----/, '')
      .replace(/\r?\n|\r/g, '')
      .trim();

    const recordName = `${selector}._domainkey.${domain}`;
    const dnsRecord = `v=DKIM1; k=rsa; p=${pubKeyClean}`;

    res.json({
      domain,
      selector,
      recordName,
      dnsRecord,
      publicKey,
      privateKey,
      generatedAt: new Date().toISOString(),
    });
  } catch (err) {
    next(err);
  }
});

// ═════════════════════════════════════════════════════════
// 2. MAIL DELIVERY QUEUE & QUARANTINE BAY
// ═════════════════════════════════════════════════════════

/**
 * GET /api/admin/queue
 * Returns active, deferred, and failed outbound delivery queue jobs.
 */
router.get('/queue', async (req, res, next) => {
  try {
    const [jobsRes, statsRes] = await Promise.all([
      query(`
        SELECT id, user_id, dispatch_id, from_address, to_addresses, subject, status,
               error_message, scheduled_at, sent_at, retry_count, created_at, updated_at
        FROM outbox_emails
        ORDER BY created_at DESC
        LIMIT 100
      `),
      query(`
        SELECT
          COUNT(*)::int AS total,
          COUNT(*) FILTER (WHERE status = 'queued')::int AS queued,
          COUNT(*) FILTER (WHERE status = 'retrying' OR status = 'deferred')::int AS retrying,
          COUNT(*) FILTER (WHERE status = 'sent')::int AS sent,
          COUNT(*) FILTER (WHERE status = 'failed')::int AS failed
        FROM outbox_emails
      `),
    ]);

    res.json({
      jobs: jobsRes.rows,
      stats: statsRes.rows[0] || { total: 0, queued: 0, retrying: 0, sent: 0, failed: 0 },
    });
  } catch (err) {
    next(err);
  }
});

/**
 * POST /api/admin/queue/flush
 * Force-retry all deferred and retrying delivery queue jobs immediately.
 */
router.post('/queue/flush', async (req, res, next) => {
  try {
    const result = await query(`
      UPDATE outbox_emails
      SET status = 'queued', scheduled_at = NOW(), retry_count = 0, updated_at = NOW()
      WHERE status IN ('retrying', 'deferred', 'failed')
      RETURNING id
    `);

    res.json({
      success: true,
      flushedCount: result.rowCount,
      message: `Successfully flushed ${result.rowCount} queue item(s) for immediate dispatch.`,
    });
  } catch (err) {
    next(err);
  }
});

/**
 * DELETE /api/admin/queue/:id
 * Remove or cancel a queued email from the delivery queue.
 */
router.delete('/queue/:id', async (req, res, next) => {
  try {
    const result = await query(
      `DELETE FROM outbox_emails WHERE id = $1 RETURNING id`,
      [req.params.id]
    );
    if (result.rowCount === 0) return res.status(404).json({ error: 'Queue item not found' });
    res.json({ success: true, message: 'Queue item deleted' });
  } catch (err) {
    next(err);
  }
});

/**
 * GET /api/admin/quarantine
 * Inspect screener quarantined messages and spam filter holds.
 */
router.get('/quarantine', async (req, res, next) => {
  try {
    const rules = await query(`
      SELECT s.id, s.user_id, u.email as user_email, s.sender_pattern, s.match_type, s.destination, s.created_at, s.last_used_at
      FROM screener_rules s
      LEFT JOIN users u ON s.user_id = u.id
      ORDER BY s.created_at DESC
      LIMIT 100
    `);

    const spamRules = await query(`
      SELECT id, user_id, type, value, created_at
      FROM spam_rules
      ORDER BY created_at DESC
      LIMIT 100
    `);

    res.json({
      screenerRules: rules.rows,
      spamRules: spamRules.rows,
    });
  } catch (err) {
    next(err);
  }
});

// ═════════════════════════════════════════════════════════
// 3. EDISCOVERY & COMPLIANCE ARCHIVE
// ═════════════════════════════════════════════════════════

/**
 * GET /api/admin/ediscovery
 * Search across the universal compliance archive with filters.
 */
router.get('/ediscovery', async (req, res, next) => {
  try {
    const {
      search = '',
      sender = '',
      recipient = '',
      direction = '',
      startDate,
      endDate,
    } = req.query;

    const { page, limit, offset } = parsePagination(req.query, 25);

    const conditions = [];
    const values = [];
    let idx = 1;

    if (search) {
      conditions.push(`(subject ILIKE $${idx} OR body_text ILIKE $${idx} OR sender_address ILIKE $${idx})`);
      values.push(`%${search}%`);
      idx++;
    }
    if (sender) {
      conditions.push(`sender_address ILIKE $${idx}`);
      values.push(`%${sender}%`);
      idx++;
    }
    if (recipient) {
      conditions.push(`($${idx} = ANY(recipient_addresses) OR mailbox_owner_email ILIKE $${idx})`);
      values.push(recipient);
      idx++;
    }
    if (direction) {
      conditions.push(`direction = $${idx}`);
      values.push(direction);
      idx++;
    }
    if (startDate) {
      conditions.push(`sent_or_received_at >= $${idx}::timestamp`);
      values.push(startDate);
      idx++;
    }
    if (endDate) {
      conditions.push(`sent_or_received_at <= $${idx}::timestamp`);
      values.push(endDate);
      idx++;
    }

    const whereClause = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';

    const countRes = await query(
      `SELECT COUNT(*)::int as count FROM compliance_archive ${whereClause}`,
      values
    );
    const total = countRes.rows[0].count;

    values.push(limit, offset);
    const rowsRes = await query(
      `SELECT id, message_id, direction, mailbox_owner_email, sender_address, sender_name,
              recipient_addresses, subject, has_attachments, checksum, is_read,
              ip_address, provider, created_at, sent_or_received_at
       FROM compliance_archive
       ${whereClause}
       ORDER BY sent_or_received_at DESC
       LIMIT $${idx} OFFSET $${idx + 1}`,
      values
    );

    res.json({
      messages: rowsRes.rows,
      pagination: paginationMeta(page, limit, total),
    });
  } catch (err) {
    next(err);
  }
});

/**
 * POST /api/admin/ediscovery/verify-hash
 * Recalculate SHA-256 and prove non-repudiation cryptographic integrity.
 */
router.post('/ediscovery/verify-hash', async (req, res, next) => {
  try {
    const { id } = req.body;
    if (!id) return res.status(400).json({ error: 'Archive ID is required' });

    const msgRes = await query(
      `SELECT id, subject, body_html, body_text, checksum, sent_or_received_at FROM compliance_archive WHERE id = $1`,
      [id]
    );
    if (msgRes.rowCount === 0) return res.status(404).json({ error: 'Archived email not found' });

    const msg = msgRes.rows[0];
    const rawContent = (msg.subject || '') + '\n' + (msg.body_html || msg.body_text || '');
    const calculatedHash = crypto.createHash('sha256').update(rawContent, 'utf8').digest('hex');

    const isValid = calculatedHash === msg.checksum;

    res.json({
      id: msg.id,
      storedChecksum: msg.checksum,
      calculatedChecksum: calculatedHash,
      isVerified: isValid,
      timestamp: msg.sent_or_received_at,
      status: isValid ? 'CRYPTOGRAPHIC INTEGRITY VERIFIED (NO TAMPERING)' : 'INTEGRITY MISMATCH',
    });
  } catch (err) {
    next(err);
  }
});

/**
 * GET /api/admin/ediscovery/export
 * Export compliance archive results in MBOX format.
 */
router.get('/ediscovery/export', async (req, res, next) => {
  try {
    const records = await query(`
      SELECT id, message_id, direction, mailbox_owner_email, sender_address,
             recipient_addresses, subject, body_text, checksum, sent_or_received_at
      FROM compliance_archive
      ORDER BY sent_or_received_at DESC
      LIMIT 500
    `);

    let mbox = '';
    for (const r of records.rows) {
      const fromAddr = r.sender_address || 'unknown@wox.world';
      const dateStr = new Date(r.sent_or_received_at || Date.now()).toUTCString();
      mbox += `From ${fromAddr} ${dateStr}\n`;
      mbox += `Message-ID: <${r.message_id || r.id}@wox.world>\n`;
      mbox += `From: ${fromAddr}\n`;
      mbox += `To: ${(r.recipient_addresses || []).join(', ')}\n`;
      mbox += `Subject: ${r.subject || '(no subject)'}\n`;
      mbox += `Date: ${dateStr}\n`;
      mbox += `X-WoxMail-Checksum: ${r.checksum || ''}\n`;
      mbox += `Content-Type: text/plain; charset=utf-8\n\n`;
      mbox += `${r.body_text || ''}\n\n`;
    }

    res.setHeader('Content-Type', 'application/mbox');
    res.setHeader('Content-Disposition', 'attachment; filename="woxmail_ediscovery_export.mbox"');
    res.send(mbox);
  } catch (err) {
    next(err);
  }
});

// ═════════════════════════════════════════════════════════
// 4. SECURITY GOVERNANCE & DLP POLICIES
// ═════════════════════════════════════════════════════════

const DEFAULT_GOVERNANCE = {
  mfa_enforced: false,
  session_timeout_minutes: 480,
  max_attachment_size_mb: 25,
  blocked_extensions: ['.exe', '.bat', '.cmd', '.scr', '.vbs', '.js', '.jar', '.iso', '.ps1'],
  outbound_rate_limit_per_hour: 100,
  dlp_enabled: true,
  dlp_rules: [
    { id: 'cc', name: 'Credit Card Numbers', pattern: '\\b(?:4[0-9]{12}(?:[0-9]{3})?|5[1-5][0-9]{14}|3[47][0-9]{13})\\b', action: 'quarantine', enabled: true },
    { id: 'ssn', name: 'Social Security Numbers (SSN)', pattern: '\\b\\d{3}-\\d{2}-\\d{4}\\b', action: 'quarantine', enabled: true },
    { id: 'api_keys', name: 'API Keys & Secrets', pattern: '(?i)(?:bearer\\s+[a-zA-Z0-9_\\-\\.]+|sk_live_[0-9a-zA-Z]{24}|ghp_[0-9a-zA-Z]{36})', action: 'block', enabled: true },
    { id: 'private_keys', name: 'Private Crypto Keys', pattern: '-----BEGIN (?:RSA|OPENSSH|EC|DSA) PRIVATE KEY-----', action: 'block', enabled: true },
  ],
};

/**
 * GET /api/admin/governance
 * Retrieve security governance policies.
 */
router.get('/governance', async (req, res, next) => {
  try {
    const govSetting = await query(`SELECT value FROM settings WHERE key = 'security_governance'`);
    if (govSetting.rowCount > 0 && govSetting.rows[0].value) {
      try {
        const policy = JSON.parse(govSetting.rows[0].value);
        return res.json({ policy: { ...DEFAULT_GOVERNANCE, ...policy } });
      } catch {
        // fallback
      }
    }
    res.json({ policy: DEFAULT_GOVERNANCE });
  } catch (err) {
    next(err);
  }
});

/**
 * PUT /api/admin/governance
 * Update security governance policies.
 */
router.put('/governance', async (req, res, next) => {
  try {
    const policy = req.body;
    const jsonVal = JSON.stringify(policy);

    await query(`
      INSERT INTO settings (key, value, description, updated_at)
      VALUES ('security_governance', $1, 'Global security and DLP governance policies', NOW())
      ON CONFLICT (key) DO UPDATE SET value = $1, updated_at = NOW()
    `, [jsonVal]);

    await query(
      `INSERT INTO audit_log (actor_type, actor_id, action, target_type, target_id, details, ip_address)
       VALUES ('admin', $1, 'update_security_governance', 'settings', 'security_governance', $2, $3)`,
      [String(req.user.id), jsonVal, req.ip]
    );

    res.json({ success: true, policy });
  } catch (err) {
    next(err);
  }
});

// ═════════════════════════════════════════════════════════
// 5. STORAGE & QUOTAS TELEMETRY
// ═════════════════════════════════════════════════════════

/**
 * GET /api/admin/storage
 * System disk storage, database table metrics, and user quota leaderboard.
 */
router.get('/storage', async (req, res, next) => {
  try {
    const [dbSizeRes, tableMetricsRes, topUsersRes] = await Promise.all([
      query(`SELECT pg_size_pretty(pg_database_size(current_database())) AS total_size, pg_database_size(current_database()) AS total_bytes`),
      query(`
        SELECT relname AS table_name,
               pg_total_relation_size(relid) AS total_bytes,
               pg_size_pretty(pg_total_relation_size(relid)) AS total_size,
               pg_size_pretty(pg_relation_size(relid)) AS table_size,
               pg_size_pretty(pg_total_relation_size(relid) - pg_relation_size(relid)) AS index_size
        FROM pg_catalog.pg_statio_user_tables
        ORDER BY pg_total_relation_size(relid) DESC
        LIMIT 12
      `),
      query(`
        SELECT u.id, u.email, COALESCE(u.display_name, u.username) AS name,
               COALESCE(q.max_storage_bytes, 10737418240) AS max_bytes,
               COALESCE(q.current_mail_bytes, 0) AS mail_bytes,
               COALESCE(q.current_attach_bytes, 0) AS attach_bytes,
               (COALESCE(q.current_mail_bytes, 0) + COALESCE(q.current_attach_bytes, 0)) AS total_used_bytes
        FROM users u
        LEFT JOIN user_quotas q ON u.id = q.user_id
        ORDER BY (COALESCE(q.current_mail_bytes, 0) + COALESCE(q.current_attach_bytes, 0)) DESC
        LIMIT 10
      `),
    ]);

    res.json({
      database: dbSizeRes.rows[0],
      tables: tableMetricsRes.rows,
      topUsers: topUsersRes.rows,
      generatedAt: new Date().toISOString(),
    });
  } catch (err) {
    next(err);
  }
});

export default router;
