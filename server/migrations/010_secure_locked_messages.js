import { query } from '../src/config/database.js';

export async function up() {
  console.log('    Creating secure_messages and secure_message_events tables...');

  // Secure locked messages vault table
  await query(`
    CREATE TABLE IF NOT EXISTS secure_messages (
      id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      public_token        VARCHAR(64) UNIQUE NOT NULL,
      sender_id           INTEGER REFERENCES users(id) ON DELETE SET NULL,
      sender_email        VARCHAR(255) NOT NULL,
      recipient_email     VARCHAR(255) NOT NULL,
      subject             TEXT NOT NULL,
      encrypted_content   TEXT NOT NULL,
      iv                  VARCHAR(64) NOT NULL,
      auth_tag            VARCHAR(64) NOT NULL,
      passcode_hash       TEXT NOT NULL,
      expires_at          TIMESTAMPTZ NOT NULL,
      max_attempts        INTEGER DEFAULT 5,
      attempt_count       INTEGER DEFAULT 0,
      destroy_after_read  BOOLEAN DEFAULT FALSE,
      watermark_enabled   BOOLEAN DEFAULT TRUE,
      status              VARCHAR(32) DEFAULT 'active', -- 'active', 'unlocked', 'destroyed', 'expired', 'revoked'
      opened_at           TIMESTAMPTZ,
      created_at          TIMESTAMPTZ DEFAULT NOW(),
      updated_at          TIMESTAMPTZ DEFAULT NOW()
    )
  `);

  // Secure message audit events table
  await query(`
    CREATE TABLE IF NOT EXISTS secure_message_events (
      id          SERIAL PRIMARY KEY,
      message_id  UUID REFERENCES secure_messages(id) ON DELETE CASCADE,
      event_type  VARCHAR(32) NOT NULL, -- 'created', 'email_sent', 'link_opened', 'failed_attempt', 'unlocked', 'viewed', 'revoked', 'expired', 'destroyed'
      ip_hash     VARCHAR(64),
      user_agent  TEXT,
      metadata    JSONB DEFAULT '{}',
      created_at  TIMESTAMPTZ DEFAULT NOW()
    )
  `);

  await query('CREATE INDEX IF NOT EXISTS idx_secure_messages_token ON secure_messages(public_token)');
  await query('CREATE INDEX IF NOT EXISTS idx_secure_messages_sender ON secure_messages(sender_id)');
  await query('CREATE INDEX IF NOT EXISTS idx_secure_messages_status ON secure_messages(status)');
  await query('CREATE INDEX IF NOT EXISTS idx_secure_events_message ON secure_message_events(message_id)');
}
