import { query } from '../src/config/database.js';

export async function up() {
  console.log('    Creating dead_man_switches and RSS feed columns...');

  await query(`
    CREATE TABLE IF NOT EXISTS dead_man_switches (
      id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      user_id             INTEGER UNIQUE REFERENCES users(id) ON DELETE CASCADE,
      enabled             BOOLEAN DEFAULT FALSE,
      interval_days       INTEGER DEFAULT 90,
      last_checkin        TIMESTAMPTZ DEFAULT NOW(),
      warning_sent_at     TIMESTAMPTZ,
      status              VARCHAR(32) DEFAULT 'active', -- 'active', 'warning', 'triggered'
      final_subject       TEXT DEFAULT 'Emergency Digital Inheritance & Last Instructions',
      final_instructions  TEXT,
      beneficiary_emails  TEXT[] DEFAULT '{}',
      checkin_token       VARCHAR(64),
      triggered_at        TIMESTAMPTZ,
      created_at          TIMESTAMPTZ DEFAULT NOW(),
      updated_at          TIMESTAMPTZ DEFAULT NOW()
    );

    ALTER TABLE users
    ADD COLUMN IF NOT EXISTS feed_rss_token VARCHAR(64),
    ADD COLUMN IF NOT EXISTS feed_rss_enabled BOOLEAN DEFAULT TRUE;

    ALTER TABLE email_aliases
    ADD COLUMN IF NOT EXISTS alias_status VARCHAR(32) DEFAULT 'active', -- 'active', 'paused', 'blocked'
    ADD COLUMN IF NOT EXISTS blocked_count INTEGER DEFAULT 0;
  `);

  await query('CREATE INDEX IF NOT EXISTS idx_dead_man_switches_status ON dead_man_switches(enabled, status, last_checkin)');
  await query('CREATE INDEX IF NOT EXISTS idx_users_feed_rss_token ON users(feed_rss_token)');
}
