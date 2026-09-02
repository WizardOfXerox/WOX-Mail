/**
 * @fileoverview Application Passwords & Developer SMTP App Codes Service.
 * Allows users to generate dedicated, revocable credentials for third-party email clients
 * (Apple Mail, Thunderbird, Outlook, mutt) and developer scripts/APIs without exposing
 * their master password or triggering 2FA browser challenges.
 */

import crypto from 'crypto';
import argon2 from 'argon2';
import pino from 'pino';
import { query } from '../config/database.js';

const logger = pino({ name: 'woxmail:app-passwords' });

/**
 * Format raw random bytes into an easy-to-read 16-character code (e.g. wox_app_a1b2-c3d4-e5f6-g7h8).
 */
function formatAppToken() {
  const bytes = crypto.randomBytes(8).toString('hex'); // 16 chars
  const chunks = bytes.match(/.{1,4}/g);
  return `wox_app_${chunks.join('-')}`;
}

/**
 * Create a new application password / SMTP app code.
 *
 * @param {number} userId - The user's ID
 * @param {string} name - Friendly label (e.g. "Thunderbird on Laptop", "Backup Script")
 * @param {string[]} [scopes=['smtp:send', 'imap:read', 'api:access']] - Permitted scopes
 * @param {Date|null} [expiresAt=null] - Optional expiration date
 * @returns {Promise<{ id: number, name: string, token: string, prefix: string, scopes: string[], createdAt: Date }>}
 */
export async function createAppPassword(userId, name, scopes = ['smtp:send', 'imap:read', 'api:access'], expiresAt = null) {
  if (!name || !name.trim()) {
    throw new Error('Application password name is required');
  }

  const rawToken = formatAppToken();
  const prefix = rawToken.slice(0, 16); // e.g. "wox_app_a1b2-c3d"
  const passwordHash = await argon2.hash(rawToken);

  const result = await query(
    `INSERT INTO app_passwords (user_id, name, prefix, password_hash, scopes, expires_at)
     VALUES ($1, $2, $3, $4, $5, $6)
     RETURNING id, name, prefix, scopes, created_at, expires_at`,
    [userId, name.trim(), prefix, passwordHash, scopes, expiresAt]
  );

  const row = result.rows[0];
  logger.info({ userId, appPasswordId: row.id, name: row.name }, 'Generated new application password');

  return {
    id: row.id,
    name: row.name,
    token: rawToken, // Returned only ONCE upon creation
    prefix: row.prefix,
    scopes: row.scopes,
    createdAt: row.created_at,
    expiresAt: row.expires_at,
  };
}

/**
 * List all active application passwords for a user.
 *
 * @param {number} userId
 * @returns {Promise<Array<{ id: number, name: string, prefix: string, scopes: string[], lastUsedAt: Date|null, lastUsedIp: string|null, createdAt: Date, expiresAt: Date|null }>>}
 */
export async function listAppPasswords(userId) {
  const result = await query(
    `SELECT id, name, prefix, scopes, last_used_at, last_used_ip, created_at, expires_at
     FROM app_passwords
     WHERE user_id = $1
     ORDER BY created_at DESC`,
    [userId]
  );

  return result.rows.map((r) => ({
    id: r.id,
    name: r.name,
    prefix: r.prefix,
    scopes: r.scopes,
    lastUsedAt: r.last_used_at,
    lastUsedIp: r.last_used_ip,
    createdAt: r.created_at,
    expiresAt: r.expires_at,
  }));
}

/**
 * Revoke (delete) an application password.
 *
 * @param {number} userId
 * @param {number} appPasswordId
 * @returns {Promise<boolean>}
 */
export async function revokeAppPassword(userId, appPasswordId) {
  const result = await query(
    `DELETE FROM app_passwords
     WHERE id = $1 AND user_id = $2
     RETURNING id, name`,
    [appPasswordId, userId]
  );

  if (result.rows.length > 0) {
    logger.info({ userId, appPasswordId, name: result.rows[0].name }, 'Revoked application password');
    return true;
  }
  return false;
}

/**
 * Verify a raw application token and return the associated user and scopes.
 *
 * @param {string} rawToken - The raw token provided by the client (e.g. "wox_app_...")
 * @param {object} options
 * @param {string} [options.ip] - Client IP address
 * @returns {Promise<{ user: object, scopes: string[] } | null>}
 */
export async function verifyAppPassword(rawToken, { ip = '127.0.0.1' } = {}) {
  if (!rawToken || typeof rawToken !== 'string' || !rawToken.startsWith('wox_app_')) {
    return null;
  }

  const prefix = rawToken.slice(0, 16);
  const result = await query(
    `SELECT ap.id, ap.user_id, ap.name, ap.password_hash, ap.scopes, ap.expires_at,
            u.id as uid, u.email, u.username, u.display_name, u.is_admin, u.is_suspended, u.imap_password
     FROM app_passwords ap
     JOIN users u ON u.id = ap.user_id
     WHERE ap.prefix = $1 AND (ap.expires_at IS NULL OR ap.expires_at > NOW()) AND u.is_suspended = FALSE`,
    [prefix]
  );

  for (const row of result.rows) {
    try {
      const isValid = await argon2.verify(row.password_hash, rawToken);
      if (isValid) {
        // Asynchronously update last used telemetry
        query('UPDATE app_passwords SET last_used_at = NOW(), last_used_ip = $1 WHERE id = $2', [ip, row.id]).catch(() => {});

        return {
          user: {
            id: row.uid,
            email: row.email,
            username: row.username,
            display_name: row.display_name,
            is_admin: row.is_admin,
            tier: row.tier,
            imap_password: row.imap_password,
          },
          scopes: row.scopes || [],
          appPasswordName: row.name,
        };
      }
    } catch (verifyErr) {
      logger.debug({ err: verifyErr.message }, 'Argon2 verification failed for candidate app token');
    }
  }

  return null;
}

export default {
  createAppPassword,
  listAppPasswords,
  revokeAppPassword,
  verifyAppPassword,
};
