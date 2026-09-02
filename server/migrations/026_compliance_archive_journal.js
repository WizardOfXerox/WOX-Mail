import { query } from '../src/config/database.js';

export async function up() {
  console.log('    Creating compliance_archive table and indexes...');

  await query(`
    CREATE TABLE IF NOT EXISTS compliance_archive (
      id                  SERIAL PRIMARY KEY,
      message_id          TEXT,
      direction           VARCHAR(16) NOT NULL DEFAULT 'outbound', -- 'outbound', 'inbound'
      mailbox_owner_id    INTEGER REFERENCES users(id) ON DELETE SET NULL,
      mailbox_owner_email TEXT NOT NULL,
      sender_address      TEXT NOT NULL,
      sender_name         TEXT,
      recipient_addresses TEXT[] NOT NULL DEFAULT '{}',
      cc_addresses        TEXT[] DEFAULT '{}',
      bcc_addresses       TEXT[] DEFAULT '{}',
      subject             TEXT DEFAULT '(No Subject)',
      body_html           TEXT,
      body_text           TEXT,
      has_attachments     BOOLEAN DEFAULT FALSE,
      attachments         JSONB DEFAULT '[]',
      headers             JSONB DEFAULT '{}',
      ip_address          VARCHAR(64),
      provider            VARCHAR(32) DEFAULT 'woxmail', -- 'woxmail', 'proton', 'purelymail', 'tempmail', 'connected_account'
      checksum            VARCHAR(64),
      is_read             BOOLEAN DEFAULT FALSE,
      is_starred          BOOLEAN DEFAULT FALSE,
      created_at          TIMESTAMPTZ DEFAULT NOW(),
      sent_or_received_at TIMESTAMPTZ DEFAULT NOW()
    );

    CREATE INDEX IF NOT EXISTS idx_compliance_archive_owner ON compliance_archive(mailbox_owner_email, created_at DESC);
    CREATE INDEX IF NOT EXISTS idx_compliance_archive_direction ON compliance_archive(direction, created_at DESC);
    CREATE INDEX IF NOT EXISTS idx_compliance_archive_sender ON compliance_archive(sender_address);
    CREATE INDEX IF NOT EXISTS idx_compliance_archive_checksum ON compliance_archive(checksum);
  `);
}
