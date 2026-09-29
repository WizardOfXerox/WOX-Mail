import crypto from 'crypto';
import { query } from '../config/database.js';

// In-memory rate limiting map: apiKeyId -> Array of timestamps
const rateLimitWindows = new Map();
const SWEEP_INTERVAL = 15 * 60 * 1000;
let lastSweep = Date.now();

export function pruneRateLimitWindows(now = Date.now()) {
  const windowMs = 3600 * 1000;
  for (const [id, timestamps] of rateLimitWindows.entries()) {
    const valid = timestamps.filter(t => now - t < windowMs);
    if (valid.length === 0) {
      rateLimitWindows.delete(id);
    } else {
      rateLimitWindows.set(id, valid);
    }
  }
}

/**
 * Generate a new API key for a user.
 */
export async function createApiKey(userId, { name, rateLimit = 100, permissions = { send: true } }) {
  const rawKey = 'wox_' + crypto.randomBytes(24).toString('hex');
  const keyHash = crypto.createHash('sha256').update(rawKey).digest('hex');
  const keyPrefix = rawKey.substring(0, 8);

  const res = await query(
    `INSERT INTO api_keys (user_id, name, key_hash, key_prefix, permissions, rate_limit)
     VALUES ($1, $2, $3, $4, $5, $6)
     RETURNING id, name, key_prefix, permissions, rate_limit, created_at`,
    [userId, name.trim(), keyHash, keyPrefix, JSON.stringify(permissions), rateLimit]
  );

  return {
    ...res.rows[0],
    rawKey // Only returned once upon creation
  };
}

/**
 * List all API keys for a user (without raw keys or hashes).
 */
export async function listApiKeys(userId) {
  const res = await query(
    `SELECT id, name, key_prefix, permissions, rate_limit, last_used_at, created_at
     FROM api_keys
     WHERE user_id = $1
     ORDER BY created_at DESC`,
    [userId]
  );
  return res.rows;
}

/**
 * Revoke/delete an API key and clean up its rate limit window.
 */
export async function revokeApiKey(userId, keyId) {
  const res = await query(
    `DELETE FROM api_keys WHERE id = $1 AND user_id = $2 RETURNING id`,
    [keyId, userId]
  );
  if (res.rows.length > 0) {
    rateLimitWindows.delete(keyId);
    return true;
  }
  return false;
}

/**
 * Validate an API key and verify rate limit.
 * @returns {Promise<Object>} Key record with user_id, or throws Error
 */
export async function authenticateApiKey(rawKey) {
  if (!rawKey || !rawKey.startsWith('wox_')) {
    throw new Error('Invalid API key format');
  }

  const keyHash = crypto.createHash('sha256').update(rawKey).digest('hex');

  const res = await query(
    `SELECT ak.*, u.email as user_email, u.is_suspended
     FROM api_keys ak
     JOIN users u ON u.id = ak.user_id
     WHERE ak.key_hash = $1`,
    [keyHash]
  );

  if (res.rows.length === 0) {
    throw new Error('Invalid API key');
  }

  const key = res.rows[0];

  if (key.is_suspended) {
    throw new Error('Account suspended');
  }

  // Check rate limit: sliding 1-hour window
  const now = Date.now();
  if (now - lastSweep > SWEEP_INTERVAL) {
    lastSweep = now;
    pruneRateLimitWindows(now);
  }

  const windowMs = 3600 * 1000;
  let timestamps = rateLimitWindows.get(key.id) || [];
  timestamps = timestamps.filter(t => now - t < windowMs);

  if (timestamps.length >= key.rate_limit) {
    const error = new Error(`Rate limit exceeded (${key.rate_limit} requests/hour)`);
    error.status = 429;
    throw error;
  }

  timestamps.push(now);
  rateLimitWindows.set(key.id, timestamps);

  // Update last_used_at asynchronously
  query(`UPDATE api_keys SET last_used_at = NOW() WHERE id = $1`, [key.id]).catch(() => {});

  return key;
}
