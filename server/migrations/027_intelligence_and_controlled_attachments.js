import { query } from '../src/config/database.js';

export async function up() {
  // 1. Controlled Secure Attachments Table
  await query(`
    CREATE TABLE IF NOT EXISTS secure_attachments (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      user_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
      message_id VARCHAR(255),
      filename VARCHAR(255) NOT NULL,
      content_type VARCHAR(100),
      file_size BIGINT,
      encrypted_payload TEXT NOT NULL,
      iv VARCHAR(64) NOT NULL,
      auth_tag VARCHAR(64) NOT NULL,
      access_token VARCHAR(128) UNIQUE NOT NULL,
      max_views INTEGER DEFAULT NULL,
      view_count INTEGER DEFAULT 0,
      max_downloads INTEGER DEFAULT NULL,
      download_count INTEGER DEFAULT 0,
      watermark_text VARCHAR(255),
      expires_at TIMESTAMPTZ,
      revoked_at TIMESTAMPTZ,
      created_at TIMESTAMPTZ DEFAULT NOW()
    )
  `);

  await query(`CREATE INDEX IF NOT EXISTS idx_secure_attachments_token ON secure_attachments(access_token)`);
  await query(`CREATE INDEX IF NOT EXISTS idx_secure_attachments_user ON secure_attachments(user_id)`);

  // 2. Attachment Audit & Access Logs
  await query(`
    CREATE TABLE IF NOT EXISTS secure_attachment_logs (
      id SERIAL PRIMARY KEY,
      attachment_id UUID REFERENCES secure_attachments(id) ON DELETE CASCADE,
      action VARCHAR(50) NOT NULL,
      ip_hash VARCHAR(64),
      user_agent VARCHAR(255),
      created_at TIMESTAMPTZ DEFAULT NOW()
    )
  `);

  await query(`CREATE INDEX IF NOT EXISTS idx_sec_attach_logs_attach ON secure_attachment_logs(attachment_id)`);

  // 3. Email Link Clicks Tracking Updates
  await query(`
    ALTER TABLE email_link_clicks 
    ADD COLUMN IF NOT EXISTS click_token VARCHAR(128) UNIQUE,
    ADD COLUMN IF NOT EXISTS user_agent TEXT,
    ADD COLUMN IF NOT EXISTS first_clicked_at TIMESTAMPTZ DEFAULT NOW(),
    ADD COLUMN IF NOT EXISTS last_clicked_at TIMESTAMPTZ DEFAULT NOW()
  `);

  await query(`CREATE INDEX IF NOT EXISTS idx_link_clicks_token ON email_link_clicks(click_token)`);

  // 4. Email Open Discrete Timeline Events
  await query(`
    CREATE TABLE IF NOT EXISTS email_open_events (
      id SERIAL PRIMARY KEY,
      tracking_id INTEGER REFERENCES email_tracking(id) ON DELETE CASCADE,
      ip_hash VARCHAR(64),
      user_agent VARCHAR(255),
      opened_at TIMESTAMPTZ DEFAULT NOW()
    )
  `);

  await query(`CREATE INDEX IF NOT EXISTS idx_open_events_tracking ON email_open_events(tracking_id)`);

  // 5. Follow-Up Reminders ("Bump If No Reply")
  await query(`
    CREATE TABLE IF NOT EXISTS email_followup_reminders (
      id SERIAL PRIMARY KEY,
      user_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
      thread_id VARCHAR(255),
      message_id VARCHAR(255),
      recipient_email VARCHAR(255) NOT NULL,
      subject VARCHAR(500),
      remind_after_days INTEGER NOT NULL DEFAULT 3,
      due_at TIMESTAMPTZ NOT NULL,
      status VARCHAR(50) DEFAULT 'pending',
      created_at TIMESTAMPTZ DEFAULT NOW()
    )
  `);

  await query(`CREATE INDEX IF NOT EXISTS idx_followup_status_due ON email_followup_reminders(status, due_at)`);
  await query(`CREATE INDEX IF NOT EXISTS idx_followup_user ON email_followup_reminders(user_id)`);

  // 6. User Snippets & Text Macros
  await query(`
    CREATE TABLE IF NOT EXISTS user_snippets (
      id SERIAL PRIMARY KEY,
      user_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
      shortcut VARCHAR(50) NOT NULL,
      title VARCHAR(100) NOT NULL,
      content_html TEXT NOT NULL,
      created_at TIMESTAMPTZ DEFAULT NOW()
    )
  `);

  await query(`CREATE INDEX IF NOT EXISTS idx_user_snippets_user ON user_snippets(user_id)`);
}

export async function down() {
  await query(`DROP TABLE IF EXISTS user_snippets CASCADE`);
  await query(`DROP TABLE IF EXISTS email_followup_reminders CASCADE`);
  await query(`DROP TABLE IF EXISTS email_open_events CASCADE`);
  await query(`DROP TABLE IF EXISTS secure_attachment_logs CASCADE`);
  await query(`DROP TABLE IF EXISTS secure_attachments CASCADE`);
}
