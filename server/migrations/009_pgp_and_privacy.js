import { query } from '../src/config/database.js';

/**
 * Migration 009: PGP encryption keys and privacy headers.
 * Adds pgp_public_key and pgp_enabled columns to users and email_aliases.
 */
export async function up() {
  await query(`
    ALTER TABLE users
    ADD COLUMN IF NOT EXISTS pgp_public_key TEXT,
    ADD COLUMN IF NOT EXISTS pgp_enabled BOOLEAN DEFAULT FALSE;

    ALTER TABLE email_aliases
    ADD COLUMN IF NOT EXISTS pgp_public_key TEXT,
    ADD COLUMN IF NOT EXISTS pgp_enabled BOOLEAN DEFAULT FALSE;
  `);

  console.log('Migration 009: PGP encryption columns added.');
}

export async function down() {
  await query(`
    ALTER TABLE users
    DROP COLUMN IF EXISTS pgp_public_key,
    DROP COLUMN IF EXISTS pgp_enabled;

    ALTER TABLE email_aliases
    DROP COLUMN IF EXISTS pgp_public_key,
    DROP COLUMN IF EXISTS pgp_enabled;
  `);

  console.log('Migration 009: Reverted.');
}

export default { up, down };
