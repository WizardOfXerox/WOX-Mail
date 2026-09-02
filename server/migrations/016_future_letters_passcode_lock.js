import { query } from '../src/config/database.js';

export async function up() {
  await query(`
    ALTER TABLE future_letters
      ADD COLUMN IF NOT EXISTS is_locked BOOLEAN DEFAULT FALSE,
      ADD COLUMN IF NOT EXISTS passcode_hash TEXT,
      ADD COLUMN IF NOT EXISTS encrypted_body TEXT;
  `);
}

export async function down() {
  await query(`
    ALTER TABLE future_letters
      DROP COLUMN IF EXISTS is_locked,
      DROP COLUMN IF EXISTS passcode_hash,
      DROP COLUMN IF EXISTS encrypted_body;
  `);
}
