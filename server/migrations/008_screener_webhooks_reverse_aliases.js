import { query } from '../src/config/database.js';

/**
 * Migration 008: Advanced Features.
 * - Screener rules (First-contact sender quarantine & categorization)
 * - User Webhooks (Event streaming with HMAC-SHA256 signatures)
 * - Webhook Deliveries (Audit & debug delivery log)
 * - Reverse Aliases (Deterministic outbound sender masking)
 */
export async function up() {
  // 1. Screener Rules
  await query(`
    CREATE TABLE IF NOT EXISTS screener_rules (
      id             SERIAL PRIMARY KEY,
      user_id        INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      sender_pattern TEXT NOT NULL,
      match_type     TEXT NOT NULL CHECK (match_type IN ('exact', 'domain')),
      destination    TEXT NOT NULL CHECK (destination IN ('inbox', 'feed', 'paper_trail', 'blocked')),
      created_at     TIMESTAMPTZ DEFAULT NOW(),
      last_used_at   TIMESTAMPTZ,
      UNIQUE(user_id, sender_pattern)
    );
    CREATE INDEX IF NOT EXISTS idx_screener_user_pattern ON screener_rules(user_id, sender_pattern);
  `);

  // 2. User Webhooks
  await query(`
    CREATE TABLE IF NOT EXISTS user_webhooks (
      id               SERIAL PRIMARY KEY,
      user_id          INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      name             TEXT NOT NULL,
      target_url       TEXT NOT NULL,
      secret_key       TEXT NOT NULL,
      events           TEXT[] DEFAULT ARRAY['mail.received', 'mail.otp_extracted'],
      is_active        BOOLEAN DEFAULT TRUE,
      failure_count    INTEGER DEFAULT 0,
      last_delivered_at TIMESTAMPTZ,
      created_at       TIMESTAMPTZ DEFAULT NOW()
    );
    CREATE INDEX IF NOT EXISTS idx_webhooks_user ON user_webhooks(user_id);
  `);

  // 3. Webhook Deliveries Log
  await query(`
    CREATE TABLE IF NOT EXISTS webhook_deliveries (
      id              BIGSERIAL PRIMARY KEY,
      webhook_id      INTEGER NOT NULL REFERENCES user_webhooks(id) ON DELETE CASCADE,
      user_id         INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      event_type      TEXT NOT NULL,
      payload         JSONB NOT NULL,
      response_status INTEGER,
      response_body   TEXT,
      success         BOOLEAN NOT NULL,
      execution_ms    INTEGER,
      created_at      TIMESTAMPTZ DEFAULT NOW()
    );
    CREATE INDEX IF NOT EXISTS idx_webhook_deliveries_webhook ON webhook_deliveries(webhook_id, created_at DESC);
  `);

  // 4. Reverse Aliases
  await query(`
    CREATE TABLE IF NOT EXISTS reverse_aliases (
      id              SERIAL PRIMARY KEY,
      user_id         INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      alias_address   TEXT NOT NULL,
      external_email  TEXT NOT NULL,
      reverse_token   TEXT UNIQUE NOT NULL,
      last_used_at    TIMESTAMPTZ,
      created_at      TIMESTAMPTZ DEFAULT NOW(),
      UNIQUE(user_id, alias_address, external_email)
    );
    CREATE INDEX IF NOT EXISTS idx_reverse_token ON reverse_aliases(reverse_token);
    CREATE INDEX IF NOT EXISTS idx_reverse_user ON reverse_aliases(user_id);
  `);

  console.log('Migration 008: Screener, Webhooks, and Reverse Aliases tables created.');
}

export async function down() {
  await query('DROP TABLE IF EXISTS reverse_aliases CASCADE');
  await query('DROP TABLE IF EXISTS webhook_deliveries CASCADE');
  await query('DROP TABLE IF EXISTS user_webhooks CASCADE');
  await query('DROP TABLE IF EXISTS screener_rules CASCADE');
  console.log('Migration 008: Reverted.');
}

export default { up, down };
