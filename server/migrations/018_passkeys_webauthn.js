/**
 * Migration 018: WebAuthn / FIDO2 Passkeys & Hardware Security Tokens
 * Enables passwordless biometric (TouchID, FaceID, Windows Hello) and physical
 * YubiKey / Nitrokey hardware token authentication.
 */

import { query } from '../src/config/database.js';

export async function up() {
  await query(`
    CREATE TABLE IF NOT EXISTS user_passkeys (
      id              SERIAL PRIMARY KEY,
      user_id         INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      credential_id   VARCHAR(512) UNIQUE NOT NULL,
      public_key      BYTEA NOT NULL,
      counter         BIGINT NOT NULL DEFAULT 0,
      device_type     VARCHAR(64) DEFAULT 'singleDevice',
      backed_up       BOOLEAN DEFAULT FALSE,
      transports      TEXT[],
      device_name     VARCHAR(128) DEFAULT 'Passkey Authenticator',
      created_at      TIMESTAMPTZ DEFAULT NOW(),
      last_used_at    TIMESTAMPTZ
    );

    CREATE INDEX IF NOT EXISTS idx_user_passkeys_user_id ON user_passkeys(user_id);
    CREATE INDEX IF NOT EXISTS idx_user_passkeys_credential_id ON user_passkeys(credential_id);
  `);
}

export async function down() {
  await query(`DROP TABLE IF EXISTS user_passkeys;`);
}
