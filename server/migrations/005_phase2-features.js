import { query } from '../src/config/database.js';

/**
 * Migration 005: Phase 2 feature tables.
 * - Labels (color-coded email labels)
 * - Email Labels (junction table)
 * - Email Aliases (hide-my-email)
 * - Scheduled Emails
 * - Snoozed Emails
 * - Calendar Events (WoxCalendar)
 * - WoxAuth Entries
 * - User Sessions (explicit tracking)
 */
export async function up() {
  // Labels
  await query(`
    CREATE TABLE IF NOT EXISTS labels (
      id SERIAL PRIMARY KEY,
      user_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
      name TEXT NOT NULL,
      color TEXT NOT NULL DEFAULT '#7c3aed',
      sort_order INTEGER DEFAULT 0,
      created_at TIMESTAMPTZ DEFAULT NOW(),
      UNIQUE(user_id, name)
    );
  `);

  // Email ↔ Label junction
  await query(`
    CREATE TABLE IF NOT EXISTS email_labels (
      id SERIAL PRIMARY KEY,
      user_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
      message_uid INTEGER NOT NULL,
      label_id INTEGER REFERENCES labels(id) ON DELETE CASCADE,
      created_at TIMESTAMPTZ DEFAULT NOW(),
      UNIQUE(user_id, message_uid, label_id)
    );
  `);

  // Email aliases (hide-my-email)
  await query(`
    CREATE TABLE IF NOT EXISTS email_aliases (
      id SERIAL PRIMARY KEY,
      user_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
      alias_address TEXT UNIQUE NOT NULL,
      note TEXT,
      enabled BOOLEAN DEFAULT TRUE,
      emails_received INTEGER DEFAULT 0,
      purelymail_routing_created BOOLEAN DEFAULT FALSE,
      created_at TIMESTAMPTZ DEFAULT NOW()
    );
  `);

  // Scheduled emails
  await query(`
    CREATE TABLE IF NOT EXISTS scheduled_emails (
      id SERIAL PRIMARY KEY,
      user_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
      to_addresses TEXT[] NOT NULL,
      cc_addresses TEXT[],
      bcc_addresses TEXT[],
      subject TEXT NOT NULL,
      body_html TEXT NOT NULL,
      body_text TEXT,
      attachments JSONB,
      send_at TIMESTAMPTZ NOT NULL,
      sent BOOLEAN DEFAULT FALSE,
      sent_at TIMESTAMPTZ,
      created_at TIMESTAMPTZ DEFAULT NOW()
    );
    CREATE INDEX IF NOT EXISTS idx_scheduled_due ON scheduled_emails(send_at) WHERE sent = FALSE;
  `);

  // Snoozed emails
  await query(`
    CREATE TABLE IF NOT EXISTS snoozed_emails (
      id SERIAL PRIMARY KEY,
      user_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
      message_uid INTEGER NOT NULL,
      original_folder TEXT NOT NULL,
      snooze_until TIMESTAMPTZ NOT NULL,
      unsnoozed BOOLEAN DEFAULT FALSE,
      created_at TIMESTAMPTZ DEFAULT NOW(),
      UNIQUE(user_id, message_uid)
    );
    CREATE INDEX IF NOT EXISTS idx_snoozed_due ON snoozed_emails(snooze_until) WHERE unsnoozed = FALSE;
  `);

  // Calendar events (WoxCalendar)
  await query(`
    CREATE TABLE IF NOT EXISTS calendar_events (
      id SERIAL PRIMARY KEY,
      user_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
      title TEXT NOT NULL,
      description TEXT,
      location TEXT,
      start_time TIMESTAMPTZ NOT NULL,
      end_time TIMESTAMPTZ NOT NULL,
      all_day BOOLEAN DEFAULT FALSE,
      color TEXT DEFAULT '#7c3aed',
      recurrence_rule TEXT,
      reminder_minutes INTEGER,
      reminder_sent BOOLEAN DEFAULT FALSE,
      source_email_uid INTEGER,
      created_at TIMESTAMPTZ DEFAULT NOW(),
      updated_at TIMESTAMPTZ DEFAULT NOW()
    );
    CREATE INDEX IF NOT EXISTS idx_calendar_user_time ON calendar_events(user_id, start_time);
  `);

  // WoxAuth entries (TOTP codes, encrypted)
  await query(`
    CREATE TABLE IF NOT EXISTS woxauth_entries (
      id SERIAL PRIMARY KEY,
      user_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
      service_name TEXT NOT NULL,
      account_label TEXT,
      encrypted_secret TEXT NOT NULL,
      iv TEXT NOT NULL,
      tag TEXT,
      period INTEGER DEFAULT 30,
      digits INTEGER DEFAULT 6,
      algorithm TEXT DEFAULT 'SHA1',
      icon TEXT,
      sort_order INTEGER DEFAULT 0,
      created_at TIMESTAMPTZ DEFAULT NOW()
    );
    CREATE INDEX IF NOT EXISTS idx_woxauth_user ON woxauth_entries(user_id);
  `);

  // User sessions (explicit session tracking)
  await query(`
    CREATE TABLE IF NOT EXISTS user_sessions (
      id SERIAL PRIMARY KEY,
      user_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
      token_hash TEXT NOT NULL,
      ip_address INET,
      user_agent TEXT,
      is_revoked BOOLEAN DEFAULT FALSE,
      expires_at TIMESTAMPTZ NOT NULL,
      last_active TIMESTAMPTZ DEFAULT NOW(),
      created_at TIMESTAMPTZ DEFAULT NOW()
    );
    CREATE INDEX IF NOT EXISTS idx_sessions_user ON user_sessions(user_id) WHERE is_revoked = FALSE;
  `);

  console.log('Migration 005: Phase 2 tables created');
}

export async function down() {
  await query('DROP TABLE IF EXISTS user_sessions CASCADE');
  await query('DROP TABLE IF EXISTS woxauth_entries CASCADE');
  await query('DROP TABLE IF EXISTS calendar_events CASCADE');
  await query('DROP TABLE IF EXISTS snoozed_emails CASCADE');
  await query('DROP TABLE IF EXISTS scheduled_emails CASCADE');
  await query('DROP TABLE IF EXISTS email_aliases CASCADE');
  await query('DROP TABLE IF EXISTS email_labels CASCADE');
  await query('DROP TABLE IF EXISTS labels CASCADE');
  console.log('Migration 005: Phase 2 tables dropped');
}

export default { up, down };
