import { query } from '../src/config/database.js';

export async function up() {
  console.log('    Creating ephemeral_streams table for Zero-Click In-Inbox self-destruction...');

  await query(`
    CREATE TABLE IF NOT EXISTS ephemeral_streams (
      id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      token               VARCHAR(64) UNIQUE NOT NULL,
      sender_id           INTEGER REFERENCES users(id) ON DELETE SET NULL,
      sender_email        VARCHAR(255) NOT NULL,
      recipient_email     VARCHAR(255) NOT NULL,
      subject             TEXT NOT NULL,
      encrypted_content   TEXT NOT NULL,
      iv                  VARCHAR(64) NOT NULL,
      auth_tag            VARCHAR(64) NOT NULL,
      max_views           INTEGER DEFAULT 1,
      view_count          INTEGER DEFAULT 0,
      status              VARCHAR(32) DEFAULT 'active', -- 'active', 'burned', 'expired'
      expires_at          TIMESTAMPTZ NOT NULL,
      first_viewed_at     TIMESTAMPTZ,
      burned_at           TIMESTAMPTZ,
      created_at          TIMESTAMPTZ DEFAULT NOW(),
      updated_at          TIMESTAMPTZ DEFAULT NOW()
    )
  `);

  await query('CREATE INDEX IF NOT EXISTS idx_ephemeral_streams_token ON ephemeral_streams(token)');
  await query('CREATE INDEX IF NOT EXISTS idx_ephemeral_streams_status ON ephemeral_streams(status)');
}
