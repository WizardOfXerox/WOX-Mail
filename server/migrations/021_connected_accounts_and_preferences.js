import { query } from '../src/config/database.js';

/**
 * Migration 021: Universal Multi-Account Engine & Preferences Vault
 * - connected_accounts: Encrypted credentials for Gmail, Outlook, Yahoo, Custom IMAP/SMTP
 * - users.preferences: JSONB column for appearance, themes, density, keymaps, audio
 * - personal_api_keys: Scoped API tokens for automation & CLI tools
 */
export async function up() {
  console.log('    Running Migration 021: Multi-Account & Preferences...');

  // 1. Add preferences JSONB column to users if not exists
  await query(`
    ALTER TABLE users 
    ADD COLUMN IF NOT EXISTS preferences JSONB DEFAULT '{}'::jsonb;
  `);

  // 2. Connected Accounts table
  await query(`
    CREATE TABLE IF NOT EXISTS connected_accounts (
      id                    SERIAL PRIMARY KEY,
      user_id               INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      provider              VARCHAR(50) NOT NULL DEFAULT 'custom', -- 'gmail', 'outlook', 'yahoo', 'fastmail', 'custom'
      email                 VARCHAR(255) NOT NULL,
      display_name          VARCHAR(255),
      imap_host             VARCHAR(255) NOT NULL,
      imap_port             INTEGER NOT NULL DEFAULT 993,
      imap_secure           BOOLEAN DEFAULT TRUE,
      smtp_host             VARCHAR(255) NOT NULL,
      smtp_port             INTEGER NOT NULL DEFAULT 465,
      smtp_secure           BOOLEAN DEFAULT TRUE,
      auth_type             VARCHAR(50) NOT NULL DEFAULT 'password', -- 'password', 'app_password', 'oauth2'
      credentials_encrypted TEXT NOT NULL,
      iv                    VARCHAR(64) NOT NULL,
      auth_tag              VARCHAR(64),
      oauth_tokens          JSONB DEFAULT '{}'::jsonb,
      is_default            BOOLEAN DEFAULT FALSE,
      is_active             BOOLEAN DEFAULT TRUE,
      last_sync_at          TIMESTAMPTZ,
      sync_status           VARCHAR(50) DEFAULT 'idle', -- 'idle', 'syncing', 'error'
      sync_error            TEXT,
      color                 VARCHAR(50) DEFAULT '#7c3aed',
      created_at            TIMESTAMPTZ DEFAULT NOW(),
      updated_at            TIMESTAMPTZ DEFAULT NOW(),
      UNIQUE(user_id, email)
    );

    CREATE INDEX IF NOT EXISTS idx_connected_accounts_user ON connected_accounts(user_id);
    CREATE INDEX IF NOT EXISTS idx_connected_accounts_active ON connected_accounts(user_id, is_active);
  `);

  // 3. Personal API Keys table
  await query(`
    CREATE TABLE IF NOT EXISTS personal_api_keys (
      id           SERIAL PRIMARY KEY,
      user_id      INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      name         VARCHAR(255) NOT NULL,
      key_prefix   VARCHAR(16) NOT NULL,
      key_hash     TEXT NOT NULL,
      scopes       TEXT[] DEFAULT ARRAY['mail:read', 'mail:send'],
      last_used_at TIMESTAMPTZ,
      expires_at   TIMESTAMPTZ,
      created_at   TIMESTAMPTZ DEFAULT NOW()
    );

    CREATE INDEX IF NOT EXISTS idx_personal_api_keys_user ON personal_api_keys(user_id);
    CREATE INDEX IF NOT EXISTS idx_personal_api_keys_hash ON personal_api_keys(key_hash);
  `);
}

export async function down() {
  await query(`
    DROP TABLE IF EXISTS personal_api_keys CASCADE;
    DROP TABLE IF EXISTS connected_accounts CASCADE;
    ALTER TABLE users DROP COLUMN IF EXISTS preferences;
  `);
}

export default { up, down };
