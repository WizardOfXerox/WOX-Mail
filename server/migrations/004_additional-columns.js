import { query } from '../src/config/database.js';

/**
 * Migration 004: Add columns required by mail, settings, and admin routes.
 * - imap_password for IMAP/SMTP authentication with Purelymail
 * - timezone, updated_at for user profile management
 * - note for invite codes
 */
export async function up() {
  await query(`
    -- Add imap_password to users (encrypted Purelymail credential)
    ALTER TABLE users ADD COLUMN IF NOT EXISTS imap_password TEXT;

    -- Add timezone to users
    ALTER TABLE users ADD COLUMN IF NOT EXISTS timezone TEXT DEFAULT 'UTC';

    -- Add updated_at to users
    ALTER TABLE users ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ DEFAULT NOW();

    -- Add note to invite codes
    ALTER TABLE invite_codes ADD COLUMN IF NOT EXISTS note TEXT;

    -- Add updated_at to service_controls
    ALTER TABLE service_controls ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ DEFAULT NOW();

    -- Add updated_at to settings
    ALTER TABLE settings ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ DEFAULT NOW();

    -- Add purged_at and quarantine_until to temp_addresses
    ALTER TABLE temp_addresses ADD COLUMN IF NOT EXISTS purged_at TIMESTAMPTZ;
    ALTER TABLE temp_addresses ADD COLUMN IF NOT EXISTS quarantine_until TIMESTAMPTZ;

    -- Add type and created_by to announcements (if missing)
    ALTER TABLE announcements ADD COLUMN IF NOT EXISTS type TEXT DEFAULT 'info';
    ALTER TABLE announcements ADD COLUMN IF NOT EXISTS created_by INTEGER REFERENCES users(id) ON DELETE SET NULL;

    -- Add message_count to temp_addresses (for inbox counter)
    ALTER TABLE temp_addresses ADD COLUMN IF NOT EXISTS message_count INTEGER DEFAULT 0;

    -- Performance indexes for admin queries
    CREATE INDEX IF NOT EXISTS idx_audit_log_created ON audit_log (created_at DESC);
    CREATE INDEX IF NOT EXISTS idx_login_history_user_created ON login_history (user_id, created_at DESC);
    CREATE INDEX IF NOT EXISTS idx_temp_addresses_status ON temp_addresses (status);
    CREATE INDEX IF NOT EXISTS idx_temp_addresses_ip ON temp_addresses (ip_address) WHERE status = 'active';
    CREATE INDEX IF NOT EXISTS idx_daily_stats_date ON daily_stats (date DESC);
    CREATE INDEX IF NOT EXISTS idx_contacts_user ON contacts (user_id);
    CREATE INDEX IF NOT EXISTS idx_contacts_user_email ON contacts (user_id, email);
    CREATE INDEX IF NOT EXISTS idx_user_sessions_user ON user_sessions (user_id) WHERE is_revoked = FALSE;
  `);
}

export const name = '004_additional-columns';
