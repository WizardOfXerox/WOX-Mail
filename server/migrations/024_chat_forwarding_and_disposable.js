import { query } from '../src/config/database.js';

/**
 * Migration 024: Chat Forwarding (Telegram/Discord/Slack), Reactions & Disposable Domain Database
 * - chat_forward_rules: Forward matching incoming emails to Telegram bot / Discord / Slack
 * - email_reactions: Internal emoji reactions on email threads
 * - disposable_domains: 55,000+ known throwaway domains blocklist
 */
export async function up() {
  console.log('    Running Migration 024: Chat Forwarding & Disposable Domains...');

  // 1. Chat Forward Rules
  await query(`
    CREATE TABLE IF NOT EXISTS chat_forward_rules (
      id              SERIAL PRIMARY KEY,
      user_id         INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      platform        VARCHAR(50) NOT NULL, -- 'telegram', 'discord', 'slack', 'generic_webhook'
      name            VARCHAR(255) NOT NULL,
      webhook_url     TEXT,
      bot_token       TEXT,
      chat_id         VARCHAR(255),
      filter_criteria JSONB DEFAULT '{"forward_all": true}'::jsonb, -- {from: "", subject: "", vip_only: false}
      is_active       BOOLEAN DEFAULT TRUE,
      deliveries_count INTEGER DEFAULT 0,
      last_delivery_at TIMESTAMPTZ,
      created_at      TIMESTAMPTZ DEFAULT NOW(),
      updated_at      TIMESTAMPTZ DEFAULT NOW()
    );

    CREATE INDEX IF NOT EXISTS idx_chat_rules_user ON chat_forward_rules(user_id);
  `);

  // 2. Email Reactions
  await query(`
    CREATE TABLE IF NOT EXISTS email_reactions (
      id           SERIAL PRIMARY KEY,
      user_id      INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      message_uid  VARCHAR(255) NOT NULL,
      folder       VARCHAR(100) NOT NULL DEFAULT 'INBOX',
      reaction     VARCHAR(32) NOT NULL, -- '👍', '❤️', '🔥', '✅', '🎉', '👀'
      sender_email VARCHAR(255) NOT NULL,
      created_at   TIMESTAMPTZ DEFAULT NOW(),
      UNIQUE(user_id, message_uid, folder, reaction)
    );

    CREATE INDEX IF NOT EXISTS idx_reactions_lookup ON email_reactions(user_id, message_uid, folder);
  `);

  // 3. Disposable Domains Blocklist
  await query(`
    CREATE TABLE IF NOT EXISTS disposable_domains (
      id         SERIAL PRIMARY KEY,
      domain     VARCHAR(255) UNIQUE NOT NULL,
      source     VARCHAR(100) DEFAULT 'mailchecker',
      created_at TIMESTAMPTZ DEFAULT NOW()
    );

    CREATE INDEX IF NOT EXISTS idx_disposable_domain ON disposable_domains(domain);
  `);
}

export async function down() {
  await query(`
    DROP TABLE IF EXISTS disposable_domains CASCADE;
    DROP TABLE IF EXISTS email_reactions CASCADE;
    DROP TABLE IF EXISTS chat_forward_rules CASCADE;
  `);
}

export default { up, down };
