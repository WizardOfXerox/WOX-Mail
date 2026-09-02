/**
 * WoxMail Zero-Knowledge Blind Index Search Engine
 * Builds deterministic HMAC-SHA256 search token stems using per-user secret salt.
 * Allows instant full-text search across encrypted mailboxes without storing plaintext on server.
 */

import crypto from 'crypto';
import { query } from '../config/database.js';

const STOP_WORDS = new Set([
  'a', 'about', 'an', 'and', 'are', 'as', 'at', 'be', 'by', 'for', 'from', 'has',
  'he', 'in', 'is', 'it', 'its', 'of', 'on', 'that', 'the', 'to', 'was', 'were',
  'will', 'with', 'the', 'this', 'but', 'they', 'have', 'had', 'what', 'when', 'where'
]);

/**
 * Tokenizes text into normalized word stems and computes blind HMAC-SHA256 hashes.
 * @param {string} text
 * @param {string} salt
 * @returns {Array<string>} - Array of 64-char hex HMAC token hashes
 */
export function generateBlindTokens(text, salt) {
  if (!text || typeof text !== 'string') return [];
  const cleanSalt = salt || 'woxmail-default-zk-salt';

  // Normalize: lowercase, strip punctuation and HTML tags
  const normalized = text
    .replace(/<[^>]+>/g, ' ')
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, ' ');

  const words = normalized.split(/\s+/).filter((w) => w.length >= 2 && !STOP_WORDS.has(w));
  const uniqueWords = [...new Set(words)];

  return uniqueWords.map((word) => {
    return crypto.createHmac('sha256', cleanSalt).update(word).digest('hex');
  });
}

/**
 * Indexes an email's content into the blind search index table.
 * @param {number} userId
 * @param {number} messageUid
 * @param {string} folder
 * @param {string} contentText
 * @param {string} [salt]
 */
export async function indexMessageBlind(userId, messageUid, folder, contentText, salt) {
  const tokens = generateBlindTokens(contentText, salt);
  if (tokens.length === 0) return { indexed: 0 };

  // Delete existing tokens for this message in this folder
  await query(
    `DELETE FROM encrypted_search_index WHERE user_id = $1 AND message_uid = $2 AND folder = $3`,
    [userId, messageUid, folder]
  );

  // Batch insert tokens
  const values = [];
  const params = [];
  let paramIdx = 1;

  for (const token of tokens) {
    values.push(`($${paramIdx++}, $${paramIdx++}, $${paramIdx++}, $${paramIdx++})`);
    params.push(userId, token, messageUid, folder);
  }

  if (values.length > 0) {
    await query(
      `INSERT INTO encrypted_search_index (user_id, token_hash, message_uid, folder)
       VALUES ${values.join(', ')}`,
      params
    );
  }

  return { indexed: tokens.length };
}

/**
 * Searches the blind search index for messages matching all words in queryText.
 * @param {number} userId
 * @param {string} queryText
 * @param {string} [salt]
 * @param {string} [folder]
 * @returns {Promise<Array<{ messageUid: number, folder: string }>>}
 */
export async function searchBlindIndex(userId, queryText, salt, folder) {
  const queryTokens = generateBlindTokens(queryText, salt);
  if (queryTokens.length === 0) return [];

  // Match messages that contain ALL search tokens (AND match)
  let sql = `
    SELECT message_uid, folder, COUNT(DISTINCT token_hash) as match_count
    FROM encrypted_search_index
    WHERE user_id = $1 AND token_hash = ANY($2::text[])
  `;
  const params = [userId, queryTokens];

  if (folder && folder !== '__all_inboxes' && folder !== 'All Inboxes') {
    sql += ` AND folder = $3`;
    params.push(folder);
  }

  sql += `
    GROUP BY message_uid, folder
    HAVING COUNT(DISTINCT token_hash) >= $${params.length + 1}
    ORDER BY message_uid DESC
    LIMIT 100
  `;
  params.push(queryTokens.length);

  const { rows } = await query(sql, params);
  return rows.map((r) => ({
    messageUid: r.message_uid,
    folder: r.folder,
  }));
}

export default {
  generateBlindTokens,
  indexMessageBlind,
  searchBlindIndex,
};
