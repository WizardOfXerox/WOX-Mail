import { query } from '../src/config/database.js';

export async function up() {
  // 1. User Sieve Filtering & Inbound Rules Table
  await query(`
    CREATE TABLE IF NOT EXISTS user_sieve_rules (
      id SERIAL PRIMARY KEY,
      user_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
      name VARCHAR(120) NOT NULL,
      conditions JSONB NOT NULL DEFAULT '[]'::jsonb,
      actions JSONB NOT NULL DEFAULT '[]'::jsonb,
      webhook_url TEXT,
      priority INTEGER DEFAULT 10,
      is_active BOOLEAN DEFAULT true,
      created_at TIMESTAMPTZ DEFAULT NOW(),
      updated_at TIMESTAMPTZ DEFAULT NOW()
    )
  `);

  await query(`CREATE INDEX IF NOT EXISTS idx_sieve_rules_user ON user_sieve_rules(user_id, is_active)`);

  // 2. Encrypted Blind Search Index (Zero-Knowledge HMAC Tokens)
  await query(`
    CREATE TABLE IF NOT EXISTS encrypted_search_index (
      id SERIAL PRIMARY KEY,
      user_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
      token_hash VARCHAR(64) NOT NULL,
      message_uid INTEGER NOT NULL,
      folder VARCHAR(100) NOT NULL DEFAULT 'INBOX',
      created_at TIMESTAMPTZ DEFAULT NOW()
    )
  `);

  await query(`CREATE INDEX IF NOT EXISTS idx_search_index_lookup ON encrypted_search_index(user_id, token_hash)`);
  await query(`CREATE INDEX IF NOT EXISTS idx_search_index_msg ON encrypted_search_index(user_id, folder, message_uid)`);

  // 3. User Viewer Security & Privacy Preferences Table
  await query(`
    CREATE TABLE IF NOT EXISTS user_privacy_preferences (
      user_id INTEGER PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
      remote_images VARCHAR(50) DEFAULT 'proxy_cloak',
      trusted_senders JSONB DEFAULT '[]'::jsonb,
      allow_scripts BOOLEAN DEFAULT false,
      intercept_links BOOLEAN DEFAULT true,
      block_web_fonts BOOLEAN DEFAULT true,
      disarm_forms BOOLEAN DEFAULT true,
      homograph_shield BOOLEAN DEFAULT true,
      strip_marketing_redirects BOOLEAN DEFAULT true,
      auth_failure_policy VARCHAR(50) DEFAULT 'warning',
      updated_at TIMESTAMPTZ DEFAULT NOW()
    )
  `);

  // 4. Mailbox Backup Jobs & R2 Offsite Vault Table
  await query(`
    CREATE TABLE IF NOT EXISTS mailbox_backups (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      user_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
      format VARCHAR(20) NOT NULL DEFAULT 'mbox',
      storage_type VARCHAR(20) DEFAULT 'local',
      file_path TEXT,
      r2_key TEXT,
      file_size BIGINT DEFAULT 0,
      message_count INTEGER DEFAULT 0,
      status VARCHAR(50) DEFAULT 'pending',
      error_message TEXT,
      sha256_checksum VARCHAR(64),
      expires_at TIMESTAMPTZ,
      created_at TIMESTAMPTZ DEFAULT NOW(),
      completed_at TIMESTAMPTZ
    )
  `);

  await query(`CREATE INDEX IF NOT EXISTS idx_mailbox_backups_user ON mailbox_backups(user_id, created_at DESC)`);
}

export async function down() {
  await query(`DROP TABLE IF EXISTS mailbox_backups CASCADE`);
  await query(`DROP TABLE IF EXISTS user_privacy_preferences CASCADE`);
  await query(`DROP TABLE IF EXISTS encrypted_search_index CASCADE`);
  await query(`DROP TABLE IF EXISTS user_sieve_rules CASCADE`);
}
