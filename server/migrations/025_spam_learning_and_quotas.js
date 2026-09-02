import { query } from '../src/config/database.js';

/**
 * Migration 025: Bayesian Spam Self-Learning & User Quotas
 * - spam_learning_corpus: Token frequency counts for Bayesian spam classifier
 * - user_quotas: Per-user storage quotas & usage tracking
 */
export async function up() {
  console.log('    Running Migration 025: Spam Learning & User Quotas...');

  // 1. Spam Learning Corpus
  await query(`
    CREATE TABLE IF NOT EXISTS spam_learning_corpus (
      id         SERIAL PRIMARY KEY,
      user_id    INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      token      VARCHAR(255) NOT NULL,
      spam_count INTEGER NOT NULL DEFAULT 0,
      ham_count  INTEGER NOT NULL DEFAULT 0,
      updated_at TIMESTAMPTZ DEFAULT NOW(),
      UNIQUE(user_id, token)
    );

    CREATE INDEX IF NOT EXISTS idx_spam_corpus_user_token ON spam_learning_corpus(user_id, token);
  `);

  // 2. User Quotas
  await query(`
    CREATE TABLE IF NOT EXISTS user_quotas (
      id                   SERIAL PRIMARY KEY,
      user_id              INTEGER UNIQUE NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      max_storage_bytes    BIGINT NOT NULL DEFAULT 5368709120, -- 5 GB default
      current_mail_bytes   BIGINT NOT NULL DEFAULT 0,
      current_attach_bytes BIGINT NOT NULL DEFAULT 0,
      quota_warning_sent   BOOLEAN DEFAULT FALSE,
      updated_at           TIMESTAMPTZ DEFAULT NOW()
    );

    CREATE INDEX IF NOT EXISTS idx_user_quotas_user ON user_quotas(user_id);
  `);
}

export async function down() {
  await query(`
    DROP TABLE IF EXISTS user_quotas CASCADE;
    DROP TABLE IF EXISTS spam_learning_corpus CASCADE;
  `);
}

export default { up, down };
