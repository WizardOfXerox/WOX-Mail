/**
 * @fileoverview Reverse Alias service — deterministic outbound sender masking.
 * Allows permanent users to reply to emails sent to their aliases without leaking their real email.
 */

import crypto from 'crypto';
import { query } from '../config/database.js';
import pino from 'pino';

const logger = pino({ name: 'woxmail:reverse-alias' });
const DOMAIN = process.env.DOMAIN_PERMANENT || 'wox.world';

/**
 * Generate a deterministic reverse token for a specific user, alias, and external recipient.
 * @param {number} userId
 * @param {string} aliasAddress - e.g. "shopping99@mail.wox.world"
 * @param {string} externalEmail - e.g. "support@amazon.com"
 * @returns {string} e.g. "ra_8f93b20a1c7d@wox.world"
 */
export function generateReverseToken(userId, aliasAddress, externalEmail) {
  const secret = process.env.JWT_SECRET || process.env.SESSION_SECRET || 'woxmail-reverse-alias-static-salt';
  const data = `${userId}:${aliasAddress.toLowerCase().trim()}:${externalEmail.toLowerCase().trim()}`;
  const hash = crypto.createHmac('sha256', secret).update(data).digest('hex').slice(0, 12);
  const domain = aliasAddress.includes('@') ? aliasAddress.split('@')[1] : (process.env.DOMAIN_PERMANENT || 'wox.world');
  return `ra_${hash}@${domain}`;
}

/**
 * Get or create a reverse alias mapping.
 * Called when an incoming email to an alias is routed to the user's inbox,
 * creating the reverse reply-to target.
 *
 * @param {number} userId
 * @param {string} aliasAddress
 * @param {string} externalEmail
 * @returns {Promise<{ reverseToken: string, isNew: boolean }>}
 */
export async function getOrCreateReverseAlias(userId, aliasAddress, externalEmail) {
  const cleanAlias = aliasAddress.toLowerCase().trim();
  const cleanExternal = externalEmail.toLowerCase().trim();
  const reverseToken = generateReverseToken(userId, cleanAlias, cleanExternal);

  const result = await query(
    `INSERT INTO reverse_aliases (user_id, alias_address, external_email, reverse_token)
     VALUES ($1, $2, $3, $4)
     ON CONFLICT (user_id, alias_address, external_email)
     DO UPDATE SET last_used_at = NOW()
     RETURNING *`,
    [userId, cleanAlias, cleanExternal, reverseToken]
  );

  return {
    reverseToken: result.rows[0].reverse_token,
    aliasAddress: result.rows[0].alias_address,
    externalEmail: result.rows[0].external_email,
  };
}

/**
 * Look up a reverse alias by its token.
 * Called when an outgoing email is directed to a `ra_*@wox.world` address.
 *
 * @param {string} reverseToken - e.g. "ra_8f93b20a1c7d@wox.world"
 * @returns {Promise<{ userId: number, aliasAddress: string, externalEmail: string }|null>}
 */
export async function lookupReverseAlias(reverseToken) {
  if (!reverseToken || !reverseToken.startsWith('ra_')) return null;

  const result = await query(
    `SELECT user_id, alias_address, external_email
     FROM reverse_aliases
     WHERE reverse_token = $1`,
    [reverseToken.toLowerCase().trim()]
  );

  if (result.rows.length === 0) return null;

  // Update last used timestamp
  await query(
    'UPDATE reverse_aliases SET last_used_at = NOW() WHERE reverse_token = $1',
    [reverseToken.toLowerCase().trim()]
  );

  const row = result.rows[0];
  return {
    userId: row.user_id,
    aliasAddress: row.alias_address,
    externalEmail: row.external_email,
  };
}

/**
 * List all reverse alias mappings for a user.
 * @param {number} userId
 */
export async function listReverseAliases(userId) {
  const result = await query(
    `SELECT id, alias_address, external_email, reverse_token, last_used_at, created_at
     FROM reverse_aliases
     WHERE user_id = $1
     ORDER BY last_used_at DESC NULLS LAST, created_at DESC`,
    [userId]
  );
  return result.rows;
}

export default {
  generateReverseToken,
  getOrCreateReverseAlias,
  lookupReverseAlias,
  listReverseAliases,
};
