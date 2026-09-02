import { query } from '../src/config/database.js';

/**
 * Migration 022: Email Tracking (Read Receipts) & Recipient Engagement
 * - email_tracking: 1x1 tracking pixel tokens and open event logs
 * - email_link_clicks: Click tracking on outbound URLs
 */
export async function up() {
  console.log('    Running Migration 022: Email Tracking & Read Receipts...');

  await query(`
    CREATE TABLE IF NOT EXISTS email_tracking (
      id               SERIAL PRIMARY KEY,
      user_id          INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      account_id       INTEGER REFERENCES connected_accounts(id) ON DELETE SET NULL,
      tracking_token   VARCHAR(64) UNIQUE NOT NULL,
      subject          VARCHAR(500),
      recipient_email  VARCHAR(255) NOT NULL,
      sent_at          TIMESTAMPTZ DEFAULT NOW(),
      opened_at        TIMESTAMPTZ,
      open_count       INTEGER DEFAULT 0,
      last_ip_hash     VARCHAR(64),
      last_user_agent  TEXT,
      metadata         JSONB DEFAULT '{}'::jsonb,
      created_at       TIMESTAMPTZ DEFAULT NOW(),
      updated_at       TIMESTAMPTZ DEFAULT NOW()
    );

    CREATE INDEX IF NOT EXISTS idx_email_tracking_token ON email_tracking(tracking_token);
    CREATE INDEX IF NOT EXISTS idx_email_tracking_user ON email_tracking(user_id);
    CREATE INDEX IF NOT EXISTS idx_email_tracking_recipient ON email_tracking(recipient_email);

    CREATE TABLE IF NOT EXISTS email_link_clicks (
      id           SERIAL PRIMARY KEY,
      tracking_id  INTEGER NOT NULL REFERENCES email_tracking(id) ON DELETE CASCADE,
      target_url   TEXT NOT NULL,
      clicked_at   TIMESTAMPTZ DEFAULT NOW(),
      click_count  INTEGER DEFAULT 1,
      last_ip_hash VARCHAR(64)
    );

    CREATE INDEX IF NOT EXISTS idx_link_clicks_tracking ON email_link_clicks(tracking_id);
  `);
}

export async function down() {
  await query(`
    DROP TABLE IF EXISTS email_link_clicks CASCADE;
    DROP TABLE IF EXISTS email_tracking CASCADE;
  `);
}

export default { up, down };
