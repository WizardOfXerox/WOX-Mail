import { query } from '../src/config/database.js';

export async function up() {
  console.log('    Adding account deletion grace period columns to users table...');

  await query(`
    ALTER TABLE users
    ADD COLUMN IF NOT EXISTS deletion_scheduled_at TIMESTAMPTZ DEFAULT NULL,
    ADD COLUMN IF NOT EXISTS deletion_requested_at TIMESTAMPTZ DEFAULT NULL,
    ADD COLUMN IF NOT EXISTS deletion_reason TEXT DEFAULT NULL;

    CREATE INDEX IF NOT EXISTS idx_users_deletion_scheduled ON users(deletion_scheduled_at) WHERE deletion_scheduled_at IS NOT NULL;
  `);
}

export async function down() {
  console.log('    Rolling back account deletion grace period columns...');

  await query(`
    DROP INDEX IF EXISTS idx_users_deletion_scheduled;
    ALTER TABLE users
    DROP COLUMN IF EXISTS deletion_scheduled_at,
    DROP COLUMN IF EXISTS deletion_requested_at,
    DROP COLUMN IF EXISTS deletion_reason;
  `);
}
