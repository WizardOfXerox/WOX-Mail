import { query } from '../src/config/database.js';

/**
 * Migration 020: Outbox System & Outbound Tracking
 * 
 * Tables created:
 * 1. outbox_emails - Real-time tracking of queued, sending, scheduled, sent, and failed emails
 */
export async function up() {
  await query(`
    CREATE TABLE IF NOT EXISTS outbox_emails (
      id                 SERIAL PRIMARY KEY,
      user_id            INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      dispatch_id        VARCHAR(100) UNIQUE NOT NULL,
      from_address       TEXT NOT NULL,
      to_addresses       TEXT[] NOT NULL,
      cc_addresses       TEXT[] DEFAULT '{}',
      bcc_addresses      TEXT[] DEFAULT '{}',
      subject            TEXT NOT NULL,
      body_html          TEXT,
      body_text          TEXT,
      attachments        JSONB DEFAULT '[]',
      status             VARCHAR(50) DEFAULT 'queued_undo',
      error_message      TEXT,
      scheduled_at       TIMESTAMPTZ DEFAULT NOW(),
      sent_at            TIMESTAMPTZ,
      retry_count        INTEGER DEFAULT 0,
      created_at         TIMESTAMPTZ DEFAULT NOW(),
      updated_at         TIMESTAMPTZ DEFAULT NOW()
    );

    CREATE INDEX IF NOT EXISTS idx_outbox_user_status ON outbox_emails(user_id, status);
    CREATE INDEX IF NOT EXISTS idx_outbox_user_created ON outbox_emails(user_id, created_at DESC);
    CREATE INDEX IF NOT EXISTS idx_outbox_dispatch_id ON outbox_emails(dispatch_id);
  `);
}

export async function down() {
  await query(`DROP TABLE IF EXISTS outbox_emails CASCADE;`);
}
