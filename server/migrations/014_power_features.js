import { query } from '../src/config/database.js';

/**
 * Migration 014: Next-Gen Power Features & Enterprise Helpdesk Suite
 * 
 * Tables created:
 * 1. email_notes - AES-256 encrypted private notes on email threads
 * 2. mailing_lists - Bulk campaign subscriber lists
 * 3. subscribers - Mailing list subscribers with RFC 8058 unsubscribe tokens
 * 4. campaigns - Newsletter & marketing broadcast campaigns
 * 5. support_tickets - Sovereign support desk tickets
 * 6. ticket_messages - Ticket conversation thread messages
 */
export async function up() {
  await query(`
    -- ═══════════════════════════════════════════════════
    -- 1. EMAIL NOTES (AES-256 Encrypted Private Annotations)
    -- ═══════════════════════════════════════════════════
    CREATE TABLE IF NOT EXISTS email_notes (
      id          SERIAL PRIMARY KEY,
      user_id     INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      message_uid VARCHAR(255) NOT NULL,
      folder      VARCHAR(100) NOT NULL DEFAULT 'INBOX',
      note_text   TEXT NOT NULL,
      iv          TEXT NOT NULL,
      color       VARCHAR(50) DEFAULT 'yellow',
      created_at  TIMESTAMPTZ DEFAULT NOW(),
      updated_at  TIMESTAMPTZ DEFAULT NOW(),
      UNIQUE (user_id, message_uid, folder)
    );
    CREATE INDEX IF NOT EXISTS idx_email_notes_user ON email_notes(user_id);
    CREATE INDEX IF NOT EXISTS idx_email_notes_lookup ON email_notes(user_id, message_uid, folder);

    -- ═══════════════════════════════════════════════════
    -- 2. MAILING LISTS (Campaign Broadcaster)
    -- ═══════════════════════════════════════════════════
    CREATE TABLE IF NOT EXISTS mailing_lists (
      id          SERIAL PRIMARY KEY,
      user_id     INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      name        VARCHAR(255) NOT NULL,
      description TEXT,
      optin_type  VARCHAR(50) DEFAULT 'single' CHECK (optin_type IN ('single', 'double')),
      created_at  TIMESTAMPTZ DEFAULT NOW(),
      updated_at  TIMESTAMPTZ DEFAULT NOW()
    );
    CREATE INDEX IF NOT EXISTS idx_mailing_lists_user ON mailing_lists(user_id);

    -- ═══════════════════════════════════════════════════
    -- 3. SUBSCRIBERS
    -- ═══════════════════════════════════════════════════
    CREATE TABLE IF NOT EXISTS subscribers (
      id                 SERIAL PRIMARY KEY,
      list_id            INTEGER NOT NULL REFERENCES mailing_lists(id) ON DELETE CASCADE,
      email              VARCHAR(255) NOT NULL,
      first_name         VARCHAR(100),
      last_name          VARCHAR(100),
      status             VARCHAR(50) DEFAULT 'active' CHECK (status IN ('active', 'unsubscribed', 'bounced', 'pending_optin')),
      custom_fields      JSONB DEFAULT '{}'::jsonb,
      unsubscribe_token  VARCHAR(64) UNIQUE NOT NULL,
      confirmation_token VARCHAR(64),
      subscribed_at      TIMESTAMPTZ DEFAULT NOW(),
      confirmed_at       TIMESTAMPTZ,
      unsubscribed_at    TIMESTAMPTZ,
      UNIQUE (list_id, email)
    );
    CREATE INDEX IF NOT EXISTS idx_subscribers_list ON subscribers(list_id);
    CREATE INDEX IF NOT EXISTS idx_subscribers_email ON subscribers(email);
    CREATE INDEX IF NOT EXISTS idx_subscribers_unsub ON subscribers(unsubscribe_token);

    -- ═══════════════════════════════════════════════════
    -- 4. CAMPAIGNS
    -- ═══════════════════════════════════════════════════
    CREATE TABLE IF NOT EXISTS campaigns (
      id               SERIAL PRIMARY KEY,
      user_id          INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      list_id          INTEGER NOT NULL REFERENCES mailing_lists(id) ON DELETE CASCADE,
      title            VARCHAR(255) NOT NULL,
      subject          VARCHAR(500) NOT NULL,
      from_name        VARCHAR(255),
      from_email       VARCHAR(255),
      html_content     TEXT NOT NULL,
      plain_content    TEXT,
      status           VARCHAR(50) DEFAULT 'draft' CHECK (status IN ('draft', 'scheduled', 'sending', 'sent', 'paused', 'failed')),
      total_recipients INTEGER DEFAULT 0,
      sent_count       INTEGER DEFAULT 0,
      failed_count     INTEGER DEFAULT 0,
      open_count       INTEGER DEFAULT 0,
      click_count      INTEGER DEFAULT 0,
      scheduled_at     TIMESTAMPTZ,
      started_at       TIMESTAMPTZ,
      completed_at     TIMESTAMPTZ,
      created_at       TIMESTAMPTZ DEFAULT NOW()
    );
    CREATE INDEX IF NOT EXISTS idx_campaigns_user ON campaigns(user_id);
    CREATE INDEX IF NOT EXISTS idx_campaigns_status ON campaigns(status);

    -- ═══════════════════════════════════════════════════
    -- 5. SUPPORT TICKETS & SEQUENCE
    -- ═══════════════════════════════════════════════════
    CREATE SEQUENCE IF NOT EXISTS support_ticket_seq START 1;

    CREATE TABLE IF NOT EXISTS support_tickets (
      id              SERIAL PRIMARY KEY,
      ticket_number   VARCHAR(32) UNIQUE NOT NULL,
      user_id         INTEGER REFERENCES users(id) ON DELETE SET NULL,
      creator_email   VARCHAR(255) NOT NULL,
      creator_name    VARCHAR(255),
      subject         VARCHAR(500) NOT NULL,
      category        VARCHAR(50) NOT NULL DEFAULT 'general' CHECK (category IN ('general', 'security', 'delivery', 'tempmail', 'vault', 'bug', 'feature')),
      priority        VARCHAR(50) NOT NULL DEFAULT 'medium' CHECK (priority IN ('low', 'medium', 'high', 'urgent')),
      status          VARCHAR(50) NOT NULL DEFAULT 'open' CHECK (status IN ('open', 'in_progress', 'waiting_customer', 'resolved', 'closed')),
      assigned_to     INTEGER REFERENCES users(id) ON DELETE SET NULL,
      created_at      TIMESTAMPTZ DEFAULT NOW(),
      updated_at      TIMESTAMPTZ DEFAULT NOW(),
      resolved_at     TIMESTAMPTZ,
      closed_at       TIMESTAMPTZ
    );
    CREATE INDEX IF NOT EXISTS idx_tickets_user ON support_tickets(user_id);
    CREATE INDEX IF NOT EXISTS idx_tickets_status ON support_tickets(status);
    CREATE INDEX IF NOT EXISTS idx_tickets_number ON support_tickets(ticket_number);

    -- ═══════════════════════════════════════════════════
    -- 6. TICKET MESSAGES
    -- ═══════════════════════════════════════════════════
    CREATE TABLE IF NOT EXISTS ticket_messages (
      id               SERIAL PRIMARY KEY,
      ticket_id        INTEGER NOT NULL REFERENCES support_tickets(id) ON DELETE CASCADE,
      sender_type      VARCHAR(50) NOT NULL CHECK (sender_type IN ('user', 'staff', 'system')),
      sender_id        INTEGER REFERENCES users(id) ON DELETE SET NULL,
      sender_email     VARCHAR(255) NOT NULL,
      message_text     TEXT NOT NULL,
      attachments      JSONB DEFAULT '[]'::jsonb,
      is_internal_note BOOLEAN DEFAULT FALSE,
      created_at       TIMESTAMPTZ DEFAULT NOW()
    );
    CREATE INDEX IF NOT EXISTS idx_ticket_messages_ticket ON ticket_messages(ticket_id);
  `);
}

export async function down() {
  await query(`
    DROP TABLE IF EXISTS ticket_messages CASCADE;
    DROP TABLE IF EXISTS support_tickets CASCADE;
    DROP SEQUENCE IF EXISTS support_ticket_seq CASCADE;
    DROP TABLE IF EXISTS campaigns CASCADE;
    DROP TABLE IF EXISTS subscribers CASCADE;
    DROP TABLE IF EXISTS mailing_lists CASCADE;
    DROP TABLE IF EXISTS email_notes CASCADE;
  `);
}
