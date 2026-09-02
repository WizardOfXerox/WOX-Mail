import { query } from '../src/config/database.js';

/**
 * Migration 001: Core database schema.
 * Creates the foundational 14 tables for WoxMail Phase 1.
 */
export async function up() {
  await query(`
    -- ═══════════════════════════════════════════════════
    -- 1. PERMANENT USERS (@wox.world)
    -- ═══════════════════════════════════════════════════
    CREATE TABLE IF NOT EXISTS users (
      id              SERIAL PRIMARY KEY,
      email           TEXT UNIQUE NOT NULL,
      username        TEXT UNIQUE NOT NULL,
      password_hash   TEXT NOT NULL,
      display_name    TEXT,
      avatar_url      TEXT,
      recovery_email  TEXT,
      otp_secret      TEXT,
      otp_enabled     BOOLEAN DEFAULT FALSE,
      recovery_codes  TEXT,                          -- JSON array, hashed
      is_admin        BOOLEAN DEFAULT FALSE,
      is_suspended    BOOLEAN DEFAULT FALSE,
      invite_code_used TEXT,
      signature       TEXT DEFAULT '',
      language        TEXT DEFAULT 'en',
      theme           TEXT DEFAULT 'system',
      forwarding_address TEXT,
      auto_reply_enabled BOOLEAN DEFAULT FALSE,
      auto_reply_subject TEXT,
      auto_reply_body    TEXT,
      auto_reply_start   TIMESTAMPTZ,
      auto_reply_end     TIMESTAMPTZ,
      imap_smtp_enabled  BOOLEAN DEFAULT TRUE,
      push_subscription  JSONB,
      last_login_at      TIMESTAMPTZ,
      created_at         TIMESTAMPTZ DEFAULT NOW()
    );

    -- ═══════════════════════════════════════════════════
    -- 2. INVITE CODES
    -- ═══════════════════════════════════════════════════
    CREATE TABLE IF NOT EXISTS invite_codes (
      id          SERIAL PRIMARY KEY,
      code        TEXT UNIQUE NOT NULL,
      created_by  INTEGER REFERENCES users(id) ON DELETE SET NULL,
      used_by     INTEGER REFERENCES users(id) ON DELETE SET NULL,
      is_used     BOOLEAN DEFAULT FALSE,
      expires_at  TIMESTAMPTZ,
      created_at  TIMESTAMPTZ DEFAULT NOW()
    );
    CREATE INDEX IF NOT EXISTS idx_invite_codes_code ON invite_codes(code);

    -- ═══════════════════════════════════════════════════
    -- 3. TEMP ADDRESSES (public + personal tiers)
    -- ═══════════════════════════════════════════════════
    CREATE TABLE IF NOT EXISTS temp_addresses (
      id              SERIAL PRIMARY KEY,
      address         TEXT UNIQUE NOT NULL,
      tier            TEXT NOT NULL CHECK (tier IN ('public', 'personal')),
      status          TEXT NOT NULL DEFAULT 'available'
                        CHECK (status IN ('available', 'active', 'expired', 'purging', 'quarantine')),
      password_hash   TEXT,                          -- NULL for public, set for personal
      custom_username TEXT,
      session_token   TEXT,
      ip_address      TEXT,
      message_count   INTEGER DEFAULT 0,
      expires_at      TIMESTAMPTZ,
      activated_at    TIMESTAMPTZ,
      last_accessed   TIMESTAMPTZ,
      purged_at       TIMESTAMPTZ,
      quarantine_until TIMESTAMPTZ,
      created_at      TIMESTAMPTZ DEFAULT NOW()
    );
    CREATE INDEX IF NOT EXISTS idx_temp_address ON temp_addresses(address);
    CREATE INDEX IF NOT EXISTS idx_temp_status ON temp_addresses(status);
    CREATE INDEX IF NOT EXISTS idx_temp_tier_status ON temp_addresses(tier, status);
    CREATE INDEX IF NOT EXISTS idx_temp_session ON temp_addresses(session_token);
    CREATE INDEX IF NOT EXISTS idx_temp_expires ON temp_addresses(expires_at);
    CREATE INDEX IF NOT EXISTS idx_temp_ip ON temp_addresses(ip_address);

    -- ═══════════════════════════════════════════════════
    -- 4. EMAIL FILTERS (permanent users)
    -- ═══════════════════════════════════════════════════
    CREATE TABLE IF NOT EXISTS email_filters (
      id          SERIAL PRIMARY KEY,
      user_id     INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      name        TEXT NOT NULL,
      conditions  JSONB NOT NULL,                    -- {from, to, subject, has_attachment, ...}
      actions     JSONB NOT NULL,                    -- {move_to, label, mark_read, delete, forward_to}
      is_enabled  BOOLEAN DEFAULT TRUE,
      priority    INTEGER DEFAULT 0,
      created_at  TIMESTAMPTZ DEFAULT NOW()
    );
    CREATE INDEX IF NOT EXISTS idx_filters_user ON email_filters(user_id);

    -- ═══════════════════════════════════════════════════
    -- 5. SPAM RULES (permanent users)
    -- ═══════════════════════════════════════════════════
    CREATE TABLE IF NOT EXISTS spam_rules (
      id          SERIAL PRIMARY KEY,
      user_id     INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      type        TEXT NOT NULL CHECK (type IN ('whitelist', 'blacklist')),
      value       TEXT NOT NULL,                     -- email address or domain
      created_at  TIMESTAMPTZ DEFAULT NOW()
    );
    CREATE INDEX IF NOT EXISTS idx_spam_user ON spam_rules(user_id);

    -- ═══════════════════════════════════════════════════
    -- 6. CONTACTS (permanent users)
    -- ═══════════════════════════════════════════════════
    CREATE TABLE IF NOT EXISTS contacts (
      id          SERIAL PRIMARY KEY,
      user_id     INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      email       TEXT NOT NULL,
      name        TEXT,
      notes       TEXT,
      is_favorite BOOLEAN DEFAULT FALSE,
      last_emailed TIMESTAMPTZ,
      created_at  TIMESTAMPTZ DEFAULT NOW(),
      UNIQUE(user_id, email)
    );
    CREATE INDEX IF NOT EXISTS idx_contacts_user ON contacts(user_id);

    -- ═══════════════════════════════════════════════════
    -- 7. SERVICE CONTROLS (per-tier sender restrictions)
    -- ═══════════════════════════════════════════════════
    CREATE TABLE IF NOT EXISTS service_controls (
      id              SERIAL PRIMARY KEY,
      service_name    TEXT NOT NULL,                  -- 'google', 'apple', 'microsoft', 'github', 'discord'
      service_domains TEXT[] NOT NULL,               -- {'google.com', 'gmail.com', 'accounts.google.com'}
      public_enabled  BOOLEAN DEFAULT FALSE,         -- Always blocked for public
      personal_enabled BOOLEAN DEFAULT FALSE,        -- Admin toggleable
      permanent_enabled BOOLEAN DEFAULT TRUE,        -- Always on for permanent
      created_at      TIMESTAMPTZ DEFAULT NOW(),
      UNIQUE(service_name)
    );

    -- ═══════════════════════════════════════════════════
    -- 8. AUDIT LOG
    -- ═══════════════════════════════════════════════════
    CREATE TABLE IF NOT EXISTS audit_log (
      id          BIGSERIAL PRIMARY KEY,
      actor_type  TEXT NOT NULL CHECK (actor_type IN ('user', 'admin', 'system', 'temp')),
      actor_id    TEXT,                              -- user id, temp address, or 'system'
      action      TEXT NOT NULL,                     -- 'login', 'register', 'delete_user', etc.
      target_type TEXT,                              -- 'user', 'temp_address', 'invite', etc.
      target_id   TEXT,
      details     JSONB,
      ip_address  TEXT,
      user_agent  TEXT,
      created_at  TIMESTAMPTZ DEFAULT NOW()
    );
    CREATE INDEX IF NOT EXISTS idx_audit_actor ON audit_log(actor_type, actor_id);
    CREATE INDEX IF NOT EXISTS idx_audit_action ON audit_log(action);
    CREATE INDEX IF NOT EXISTS idx_audit_created ON audit_log(created_at);

    -- ═══════════════════════════════════════════════════
    -- 9. LOGIN HISTORY
    -- ═══════════════════════════════════════════════════
    CREATE TABLE IF NOT EXISTS login_history (
      id          SERIAL PRIMARY KEY,
      user_id     INTEGER REFERENCES users(id) ON DELETE CASCADE,
      ip_address  TEXT NOT NULL,
      user_agent  TEXT,
      success     BOOLEAN NOT NULL,
      failure_reason TEXT,
      created_at  TIMESTAMPTZ DEFAULT NOW()
    );
    CREATE INDEX IF NOT EXISTS idx_login_user ON login_history(user_id);
    CREATE INDEX IF NOT EXISTS idx_login_ip ON login_history(ip_address);

    -- ═══════════════════════════════════════════════════
    -- 10. BLOCKED IPS
    -- ═══════════════════════════════════════════════════
    CREATE TABLE IF NOT EXISTS blocked_ips (
      id          SERIAL PRIMARY KEY,
      ip_address  TEXT UNIQUE NOT NULL,
      reason      TEXT,
      blocked_by  INTEGER REFERENCES users(id) ON DELETE SET NULL,
      expires_at  TIMESTAMPTZ,                       -- NULL = permanent
      created_at  TIMESTAMPTZ DEFAULT NOW()
    );

    -- ═══════════════════════════════════════════════════
    -- 11. ANNOUNCEMENTS
    -- ═══════════════════════════════════════════════════
    CREATE TABLE IF NOT EXISTS announcements (
      id          SERIAL PRIMARY KEY,
      title       TEXT NOT NULL,
      body        TEXT NOT NULL,
      type        TEXT DEFAULT 'info' CHECK (type IN ('info', 'warning', 'critical')),
      is_active   BOOLEAN DEFAULT TRUE,
      target_tier TEXT DEFAULT 'all' CHECK (target_tier IN ('all', 'public', 'personal', 'permanent')),
      created_by  INTEGER REFERENCES users(id) ON DELETE SET NULL,
      starts_at   TIMESTAMPTZ DEFAULT NOW(),
      ends_at     TIMESTAMPTZ,
      created_at  TIMESTAMPTZ DEFAULT NOW()
    );

    -- ═══════════════════════════════════════════════════
    -- 12. ADMIN NOTES
    -- ═══════════════════════════════════════════════════
    CREATE TABLE IF NOT EXISTS admin_notes (
      id          SERIAL PRIMARY KEY,
      target_type TEXT NOT NULL,                     -- 'user', 'temp_address'
      target_id   TEXT NOT NULL,
      note        TEXT NOT NULL,
      created_by  INTEGER REFERENCES users(id) ON DELETE SET NULL,
      created_at  TIMESTAMPTZ DEFAULT NOW()
    );
    CREATE INDEX IF NOT EXISTS idx_notes_target ON admin_notes(target_type, target_id);

    -- ═══════════════════════════════════════════════════
    -- 13. GLOBAL SETTINGS (key-value store)
    -- ═══════════════════════════════════════════════════
    CREATE TABLE IF NOT EXISTS settings (
      key         TEXT PRIMARY KEY,
      value       TEXT NOT NULL,
      description TEXT,
      updated_at  TIMESTAMPTZ DEFAULT NOW()
    );

    -- ═══════════════════════════════════════════════════
    -- 14. USER SESSIONS (for active session management)
    -- ═══════════════════════════════════════════════════
    CREATE TABLE IF NOT EXISTS user_sessions (
      id          TEXT PRIMARY KEY,                  -- JWT jti
      user_id     INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      ip_address  TEXT,
      user_agent  TEXT,
      is_revoked  BOOLEAN DEFAULT FALSE,
      expires_at  TIMESTAMPTZ NOT NULL,
      created_at  TIMESTAMPTZ DEFAULT NOW()
    );
    CREATE INDEX IF NOT EXISTS idx_sessions_user ON user_sessions(user_id);
    CREATE INDEX IF NOT EXISTS idx_sessions_expires ON user_sessions(expires_at);
  `);
}

export async function down() {
  await query(`
    DROP TABLE IF EXISTS user_sessions CASCADE;
    DROP TABLE IF EXISTS settings CASCADE;
    DROP TABLE IF EXISTS admin_notes CASCADE;
    DROP TABLE IF EXISTS announcements CASCADE;
    DROP TABLE IF EXISTS blocked_ips CASCADE;
    DROP TABLE IF EXISTS login_history CASCADE;
    DROP TABLE IF EXISTS audit_log CASCADE;
    DROP TABLE IF EXISTS service_controls CASCADE;
    DROP TABLE IF EXISTS contacts CASCADE;
    DROP TABLE IF EXISTS spam_rules CASCADE;
    DROP TABLE IF EXISTS email_filters CASCADE;
    DROP TABLE IF EXISTS temp_addresses CASCADE;
    DROP TABLE IF EXISTS invite_codes CASCADE;
    DROP TABLE IF EXISTS users CASCADE;
  `);
}
