import { query } from '../src/config/database.js';

/**
 * Migration 007: Additional user columns for settings features.
 * - forwarding_address, signature
 * - auto_reply fields (enabled, subject, body, start, end)
 * - push_subscription (Web Push VAPID subscription JSON)
 */
export async function up() {
  await query(`
    ALTER TABLE users ADD COLUMN IF NOT EXISTS forwarding_address TEXT;
    ALTER TABLE users ADD COLUMN IF NOT EXISTS signature TEXT DEFAULT '';
    ALTER TABLE users ADD COLUMN IF NOT EXISTS auto_reply_enabled BOOLEAN DEFAULT FALSE;
    ALTER TABLE users ADD COLUMN IF NOT EXISTS auto_reply_subject TEXT;
    ALTER TABLE users ADD COLUMN IF NOT EXISTS auto_reply_body TEXT;
    ALTER TABLE users ADD COLUMN IF NOT EXISTS auto_reply_start TIMESTAMPTZ;
    ALTER TABLE users ADD COLUMN IF NOT EXISTS auto_reply_end TIMESTAMPTZ;
    ALTER TABLE users ADD COLUMN IF NOT EXISTS push_subscription JSONB;
  `);

  // Add enabled column to email_filters if not exists
  await query(`
    ALTER TABLE email_filters ADD COLUMN IF NOT EXISTS enabled BOOLEAN DEFAULT TRUE;
    ALTER TABLE email_filters ADD COLUMN IF NOT EXISTS priority INTEGER DEFAULT 0;
  `);

  console.log('Migration 007: Settings columns added');
}

export async function down() {
  await query(`
    ALTER TABLE users DROP COLUMN IF EXISTS forwarding_address;
    ALTER TABLE users DROP COLUMN IF EXISTS signature;
    ALTER TABLE users DROP COLUMN IF EXISTS auto_reply_enabled;
    ALTER TABLE users DROP COLUMN IF EXISTS auto_reply_subject;
    ALTER TABLE users DROP COLUMN IF EXISTS auto_reply_body;
    ALTER TABLE users DROP COLUMN IF EXISTS auto_reply_start;
    ALTER TABLE users DROP COLUMN IF EXISTS auto_reply_end;
    ALTER TABLE users DROP COLUMN IF EXISTS push_subscription;
    ALTER TABLE email_filters DROP COLUMN IF EXISTS enabled;
    ALTER TABLE email_filters DROP COLUMN IF EXISTS priority;
  `);
  console.log('Migration 007: Settings columns removed');
}

export default { up, down };
