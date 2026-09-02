/**
 * Migration 017: Application Passwords / App-Specific Passcodes
 * Enables users to generate scoped tokens for third-party email clients (Thunderbird, iOS Mail, mutt)
 * and developer scripts without exposing master passwords or requiring interactive 2FA.
 */

import { query } from '../src/config/database.js';

export async function up() {
  await query(`
    CREATE TABLE IF NOT EXISTS app_passwords (
      id            SERIAL PRIMARY KEY,
      user_id       INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      name          VARCHAR(100) NOT NULL,
      prefix        VARCHAR(32) NOT NULL,
      password_hash VARCHAR(255) NOT NULL,
      scopes        TEXT[] DEFAULT ARRAY['smtp:send', 'imap:read', 'api:access'],
      last_used_at  TIMESTAMPTZ,
      last_used_ip  TEXT,
      created_at    TIMESTAMPTZ DEFAULT NOW(),
      expires_at    TIMESTAMPTZ
    );

    CREATE INDEX IF NOT EXISTS idx_app_passwords_user_id ON app_passwords(user_id);
    CREATE INDEX IF NOT EXISTS idx_app_passwords_prefix ON app_passwords(prefix);
  `);
}

export async function down() {
  await query(`DROP TABLE IF EXISTS app_passwords;`);
}
