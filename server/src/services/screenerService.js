/**
 * @fileoverview Screener service — first-contact sender quarantine and routing.
 * Categorizes senders into Inbox (allowed), The Feed (newsletters), Paper Trail (receipts), or Blocked.
 */

import { query } from '../config/database.js';
import pino from 'pino';

const logger = pino({ name: 'woxmail:screener' });

// In-memory cache: userId -> Map<pattern, destination>
const ruleCache = new Map();
const CACHE_TTL = 5 * 60 * 1000; // 5 minutes

/**
 * Extract clean email address and domain from standard From header string.
 * @param {string} fromHeader - e.g. "Stripe Support <support@stripe.com>"
 * @returns {{ email: string, domain: string, name: string }}
 */
export function parseSender(fromHeader) {
  if (!fromHeader) return { email: '', domain: '', name: '' };

  const raw = fromHeader.trim();
  let email = '';
  let name = '';

  const angleMatch = raw.match(/^(.*?)\s*<([a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,})>$/);
  if (angleMatch) {
    name = angleMatch[1].replace(/^["']|["']$/g, '').trim();
    email = angleMatch[2].toLowerCase().trim();
  } else {
    const directMatch = raw.match(/^([a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,})$/);
    if (directMatch) {
      email = directMatch[1].toLowerCase().trim();
      name = '';
    } else {
      email = raw.toLowerCase().trim();
    }
  }

  const parts = email.split('@');
  const domain = parts.length > 1 ? parts[1] : '';

  return { email, domain, name };
}

/**
 * Load and cache rules for a user.
 * @param {number} userId
 * @returns {Promise<Map<string, { destination: string, matchType: string, id: number }>>}
 */
async function getUserRulesMap(userId) {
  const cached = ruleCache.get(userId);
  if (cached && (Date.now() - cached.loadedAt < CACHE_TTL)) {
    return cached.map;
  }

  const result = await query(
    'SELECT id, sender_pattern, match_type, destination FROM screener_rules WHERE user_id = $1',
    [userId]
  );

  const map = new Map();
  for (const row of result.rows) {
    map.set(row.sender_pattern.toLowerCase(), {
      id: row.id,
      matchType: row.match_type,
      destination: row.destination,
    });
  }

  ruleCache.set(userId, { map, loadedAt: Date.now() });
  return map;
}

/**
 * Classify a sender for a user.
 * Checks exact match first, then domain match.
 * @param {number} userId
 * @param {string} fromHeader
 * @returns {Promise<{ status: 'inbox'|'feed'|'paper_trail'|'blocked'|'pending', senderEmail: string, senderDomain: string, ruleId: number|null }>}
 */
export async function classifySender(userId, fromHeader) {
  const { email, domain } = parseSender(fromHeader);
  if (!email) {
    return { status: 'inbox', senderEmail: '', senderDomain: '', ruleId: null };
  }

  const rules = await getUserRulesMap(userId);

  // 1. Check exact email match
  if (rules.has(email)) {
    const r = rules.get(email);
    return { status: r.destination, senderEmail: email, senderDomain: domain, ruleId: r.id };
  }

  // 2. Check domain match (with or without '@')
  if (rules.has(domain)) {
    const r = rules.get(domain);
    return { status: r.destination, senderEmail: email, senderDomain: domain, ruleId: r.id };
  }
  if (rules.has(`@${domain}`)) {
    const r = rules.get(`@${domain}`);
    return { status: r.destination, senderEmail: email, senderDomain: domain, ruleId: r.id };
  }

  // 3. Not found -> Pending screener decision
  return { status: 'pending', senderEmail: email, senderDomain: domain, ruleId: null };
}

/**
 * Record a user's decision for a sender or domain.
 * @param {number} userId
 * @param {string} senderPattern - e.g. "newsletter@github.com" or "github.com"
 * @param {'exact'|'domain'} matchType
 * @param {'inbox'|'feed'|'paper_trail'|'blocked'} destination
 */
export async function setScreenerDecision(userId, senderPattern, matchType, destination) {
  const cleanPattern = senderPattern.toLowerCase().trim();

  const result = await query(
    `INSERT INTO screener_rules (user_id, sender_pattern, match_type, destination, last_used_at)
     VALUES ($1, $2, $3, $4, NOW())
     ON CONFLICT (user_id, sender_pattern)
     DO UPDATE SET destination = $4, match_type = $3, last_used_at = NOW()
     RETURNING *`,
    [userId, cleanPattern, matchType, destination]
  );

  // Invalidate cache
  ruleCache.delete(userId);
  logger.info({ userId, cleanPattern, destination }, 'Screener rule set');

  return result.rows[0];
}

/**
 * List all screener rules for a user.
 * @param {number} userId
 */
export async function listScreenerRules(userId) {
  const result = await query(
    'SELECT * FROM screener_rules WHERE user_id = $1 ORDER BY created_at DESC',
    [userId]
  );
  return result.rows;
}

/**
 * Delete a screener rule.
 * @param {number} userId
 * @param {number} ruleId
 */
export async function deleteScreenerRule(userId, ruleId) {
  const result = await query(
    'DELETE FROM screener_rules WHERE id = $1 AND user_id = $2 RETURNING id',
    [ruleId, userId]
  );
  ruleCache.delete(userId);
  return result.rows.length > 0;
}

export default {
  parseSender,
  classifySender,
  setScreenerDecision,
  listScreenerRules,
  deleteScreenerRule,
};
