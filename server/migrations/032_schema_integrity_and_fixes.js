import { query } from '../src/config/database.js';

export async function up() {
  console.log('    Applying schema integrity alignment across core & suite tables...');

  await query(`
    ALTER TABLE invite_codes
      ADD COLUMN IF NOT EXISTS used_at TIMESTAMPTZ;

    ALTER TABLE temp_addresses
      ADD COLUMN IF NOT EXISTS imap_password TEXT,
      ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ DEFAULT NOW();

    ALTER TABLE secure_messages
      ADD COLUMN IF NOT EXISTS max_views INTEGER DEFAULT 5,
      ADD COLUMN IF NOT EXISTS view_count INTEGER DEFAULT 0;

    ALTER TABLE subscribers
      ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ DEFAULT NOW();

    ALTER TABLE contacts
      ADD COLUMN IF NOT EXISTS phone TEXT,
      ADD COLUMN IF NOT EXISTS is_vip BOOLEAN DEFAULT FALSE;

    ALTER TABLE campaigns
      ADD COLUMN IF NOT EXISTS segment_id INTEGER,
      ADD COLUMN IF NOT EXISTS last_processed_subscriber_id INTEGER DEFAULT 0;

    ALTER TABLE scheduled_emails
      ADD COLUMN IF NOT EXISTS retry_count INTEGER DEFAULT 0,
      ADD COLUMN IF NOT EXISTS error_message TEXT,
      ADD COLUMN IF NOT EXISTS from_address TEXT,
      ADD COLUMN IF NOT EXISTS account_id INTEGER;

    ALTER TABLE email_labels
      ADD COLUMN IF NOT EXISTS folder TEXT DEFAULT 'INBOX';

    DO $$
    BEGIN
      IF EXISTS (
        SELECT 1 FROM pg_constraint WHERE conname = 'email_labels_user_id_message_uid_label_id_key'
      ) THEN
        ALTER TABLE email_labels DROP CONSTRAINT email_labels_user_id_message_uid_label_id_key;
      END IF;
    END $$;

    CREATE UNIQUE INDEX IF NOT EXISTS idx_email_labels_user_uid_folder_label
      ON email_labels(user_id, message_uid, folder, label_id);

    ALTER TABLE snoozed_emails
      ADD COLUMN IF NOT EXISTS target_folder TEXT DEFAULT 'Snoozed';

    DO $$
    BEGIN
      IF EXISTS (
        SELECT 1 FROM pg_constraint WHERE conname = 'snoozed_emails_user_id_message_uid_key'
      ) THEN
        ALTER TABLE snoozed_emails DROP CONSTRAINT snoozed_emails_user_id_message_uid_key;
      END IF;
    END $$;

    CREATE UNIQUE INDEX IF NOT EXISTS idx_snoozed_user_uid_folder
      ON snoozed_emails(user_id, message_uid, original_folder);

    ALTER TABLE users
      ADD COLUMN IF NOT EXISTS notes_key_encrypted TEXT;

    ALTER TABLE secure_attachments
      ADD COLUMN IF NOT EXISTS recipient_email TEXT;

    CREATE TABLE IF NOT EXISTS dmarc_reports (
      id SERIAL PRIMARY KEY,
      report_id TEXT UNIQUE NOT NULL,
      org_name TEXT,
      domain TEXT,
      begin_date TIMESTAMPTZ,
      end_date TIMESTAMPTZ,
      total_messages INTEGER DEFAULT 0,
      pass_count INTEGER DEFAULT 0,
      fail_count INTEGER DEFAULT 0,
      raw_data JSONB,
      created_at TIMESTAMPTZ DEFAULT NOW()
    );
  `);
}

export async function down() {
  console.log('    Rolling back schema integrity alignment...');

  await query(`
    DROP TABLE IF EXISTS dmarc_reports;
    DROP INDEX IF EXISTS idx_snoozed_user_uid_folder;
    DROP INDEX IF EXISTS idx_email_labels_user_uid_folder_label;

    ALTER TABLE secure_attachments DROP COLUMN IF EXISTS recipient_email;
    ALTER TABLE users DROP COLUMN IF EXISTS notes_key_encrypted;
    ALTER TABLE snoozed_emails DROP COLUMN IF EXISTS target_folder;
    ALTER TABLE email_labels DROP COLUMN IF EXISTS folder;
    ALTER TABLE scheduled_emails
      DROP COLUMN IF EXISTS retry_count,
      DROP COLUMN IF EXISTS error_message,
      DROP COLUMN IF EXISTS from_address,
      DROP COLUMN IF EXISTS account_id;
    ALTER TABLE campaigns
      DROP COLUMN IF EXISTS segment_id,
      DROP COLUMN IF EXISTS last_processed_subscriber_id;
    ALTER TABLE contacts
      DROP COLUMN IF EXISTS phone,
      DROP COLUMN IF EXISTS is_vip;
    ALTER TABLE subscribers DROP COLUMN IF EXISTS updated_at;
    ALTER TABLE secure_messages
      DROP COLUMN IF EXISTS max_views,
      DROP COLUMN IF EXISTS view_count;
    ALTER TABLE temp_addresses
      DROP COLUMN IF EXISTS imap_password,
      DROP COLUMN IF EXISTS updated_at;
    ALTER TABLE invite_codes DROP COLUMN IF EXISTS used_at;
  `);
}
