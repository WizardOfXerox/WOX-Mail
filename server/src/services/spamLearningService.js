import { query } from '../config/database.js';

/**
 * Simple, fast text tokenizer for Bayesian spam analysis
 */
export function tokenize(text) {
  if (!text) return [];
  return text
    .toLowerCase()
    .replace(/[^\w\s@.-]/g, ' ')
    .split(/\s+/)
    .filter(t => t.length >= 3 && t.length <= 30);
}

/**
 * Train the Bayesian classifier on a message marked as spam or ham
 * @param {number} userId - User ID
 * @param {string} text - Email subject + body
 * @param {'spam'|'ham'} classification - Type of training
 */
export async function trainMessage(userId, text, classification) {
  const tokens = tokenize(text);
  const tokenFreq = {};
  for (const t of tokens) {
    tokenFreq[t] = (tokenFreq[t] || 0) + 1;
  }

  const entries = Object.entries(tokenFreq);
  if (entries.length === 0) return;

  const isSpam = classification === 'spam';

  // Batch all tokens into a single query using unnest (fixes N+1 storm)
  const tokenArr = entries.map(([t]) => t);
  const spamArr = entries.map(([, count]) => isSpam ? count : 0);
  const hamArr = entries.map(([, count]) => isSpam ? 0 : count);

  await query(`
    INSERT INTO spam_learning_corpus (user_id, token, spam_count, ham_count, updated_at)
    SELECT $1, t.token, t.spam_count, t.ham_count, NOW()
    FROM unnest($2::text[], $3::int[], $4::int[]) AS t(token, spam_count, ham_count)
    ON CONFLICT (user_id, token) DO UPDATE SET
      spam_count = spam_learning_corpus.spam_count + EXCLUDED.spam_count,
      ham_count = spam_learning_corpus.ham_count + EXCLUDED.ham_count,
      updated_at = NOW()
  `, [userId, tokenArr, spamArr, hamArr]);
}

/**
 * Compute spam probability score for an incoming email (0.00 to 1.00)
 */
export async function scoreMessage(userId, text) {
  const tokens = tokenize(text);
  if (!tokens.length) return 0.5;

  const uniqueTokens = Array.from(new Set(tokens)).slice(0, 50);

  const corpusRes = await query(`
    SELECT token, spam_count, ham_count
    FROM spam_learning_corpus
    WHERE user_id = $1 AND token = ANY($2)
  `, [userId, uniqueTokens]);

  if (!corpusRes.rows.length) return 0.5; // Neutral

  const tokenMap = {};
  for (const row of corpusRes.rows) {
    tokenMap[row.token] = { spam: row.spam_count, ham: row.ham_count };
  }

  let logSpam = 0;
  let logHam = 0;
  let matches = 0;

  for (const t of uniqueTokens) {
    const stats = tokenMap[t];
    if (!stats) continue;

    const total = stats.spam + stats.ham;
    if (total === 0) continue;

    // Graham probability calculation with Laplace smoothing
    const pSpam = (stats.spam + 0.1) / (stats.spam + stats.ham + 0.2);
    const pHam = 1.0 - pSpam;

    // Use log-space to prevent IEEE 754 underflow (0.05^50 → 0 → NaN)
    logSpam += Math.log(Math.max(pSpam, 1e-10));
    logHam += Math.log(Math.max(pHam, 1e-10));
    matches++;
  }

  if (matches === 0) return 0.5;

  // Convert back from log-space using the log-sum-exp trick
  // P(spam) = 1 / (1 + exp(logHam - logSpam))
  const logDiff = logHam - logSpam;
  const probability = 1.0 / (1.0 + Math.exp(logDiff));
  return Math.max(0.01, Math.min(0.99, Number(probability.toFixed(3))));
}

export default {
  tokenize,
  trainMessage,
  scoreMessage
};
