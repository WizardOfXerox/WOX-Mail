import { query } from '../src/config/database.js';

/**
 * Migration 029: Drip Automations, Audience Segments, Attachment Deduplication,
 * Developer API Keys, and CRM-Lite Contact Intelligence.
 */
export async function up() {
  // 1. Subscribers Enhancement (Tags & Activity Tracking)
  await query(`
    ALTER TABLE subscribers 
    ADD COLUMN IF NOT EXISTS tags TEXT[] DEFAULT '{}',
    ADD COLUMN IF NOT EXISTS last_activity_at TIMESTAMPTZ;
  `);

  await query(`CREATE INDEX IF NOT EXISTS idx_subscribers_tags ON subscribers USING GIN(tags)`);

  // 2. Multi-Step Drip Sequences
  await query(`
    CREATE TABLE IF NOT EXISTS drip_sequences (
      id SERIAL PRIMARY KEY,
      user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      list_id INTEGER NOT NULL REFERENCES mailing_lists(id) ON DELETE CASCADE,
      name VARCHAR(150) NOT NULL,
      description TEXT,
      is_active BOOLEAN DEFAULT true,
      created_at TIMESTAMPTZ DEFAULT NOW(),
      updated_at TIMESTAMPTZ DEFAULT NOW()
    );
    CREATE INDEX IF NOT EXISTS idx_drip_sequences_user ON drip_sequences(user_id);
    CREATE INDEX IF NOT EXISTS idx_drip_sequences_list ON drip_sequences(list_id);
  `);

  // 3. Drip Sequence Steps
  await query(`
    CREATE TABLE IF NOT EXISTS drip_steps (
      id SERIAL PRIMARY KEY,
      sequence_id INTEGER NOT NULL REFERENCES drip_sequences(id) ON DELETE CASCADE,
      step_order INTEGER NOT NULL,
      delay_days INTEGER DEFAULT 0,
      delay_hours INTEGER DEFAULT 0,
      subject VARCHAR(255) NOT NULL,
      from_name VARCHAR(100),
      from_email VARCHAR(255),
      html_content TEXT NOT NULL,
      plain_content TEXT,
      created_at TIMESTAMPTZ DEFAULT NOW(),
      updated_at TIMESTAMPTZ DEFAULT NOW(),
      UNIQUE (sequence_id, step_order)
    );
    CREATE INDEX IF NOT EXISTS idx_drip_steps_seq ON drip_steps(sequence_id, step_order);
  `);

  // 4. Drip Execution Queue
  await query(`
    CREATE TABLE IF NOT EXISTS drip_queue (
      id SERIAL PRIMARY KEY,
      sequence_id INTEGER NOT NULL REFERENCES drip_sequences(id) ON DELETE CASCADE,
      step_id INTEGER NOT NULL REFERENCES drip_steps(id) ON DELETE CASCADE,
      subscriber_id INTEGER NOT NULL REFERENCES subscribers(id) ON DELETE CASCADE,
      scheduled_at TIMESTAMPTZ NOT NULL,
      status VARCHAR(20) DEFAULT 'pending' CHECK (status IN ('pending', 'sent', 'failed', 'cancelled')),
      sent_at TIMESTAMPTZ,
      error TEXT,
      created_at TIMESTAMPTZ DEFAULT NOW(),
      UNIQUE (step_id, subscriber_id)
    );
    CREATE INDEX IF NOT EXISTS idx_drip_queue_process ON drip_queue(status, scheduled_at);
    CREATE INDEX IF NOT EXISTS idx_drip_queue_sub ON drip_queue(subscriber_id);
  `);

  // 5. Dynamic Audience Segments
  await query(`
    CREATE TABLE IF NOT EXISTS subscriber_segments (
      id SERIAL PRIMARY KEY,
      user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      list_id INTEGER NOT NULL REFERENCES mailing_lists(id) ON DELETE CASCADE,
      name VARCHAR(120) NOT NULL,
      description TEXT,
      rules JSONB NOT NULL DEFAULT '{}'::jsonb,
      created_at TIMESTAMPTZ DEFAULT NOW(),
      updated_at TIMESTAMPTZ DEFAULT NOW()
    );
    CREATE INDEX IF NOT EXISTS idx_subscriber_segments_user ON subscriber_segments(user_id);
    CREATE INDEX IF NOT EXISTS idx_subscriber_segments_list ON subscriber_segments(list_id);
  `);

  // 6. Attachment Store for SHA-256 Deduplication
  await query(`
    CREATE TABLE IF NOT EXISTS attachment_store (
      id SERIAL PRIMARY KEY,
      user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      sha256 VARCHAR(64) NOT NULL,
      filename VARCHAR(255) NOT NULL,
      mime_type VARCHAR(100),
      size_bytes BIGINT,
      content BYTEA NOT NULL,
      reference_count INTEGER DEFAULT 1,
      created_at TIMESTAMPTZ DEFAULT NOW(),
      UNIQUE(user_id, sha256)
    );
    CREATE INDEX IF NOT EXISTS idx_attachment_store_lookup ON attachment_store(user_id, sha256);
  `);

  // 7. Developer API Keys for Transactional Sending
  await query(`
    CREATE TABLE IF NOT EXISTS api_keys (
      id SERIAL PRIMARY KEY,
      user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      name VARCHAR(100) NOT NULL,
      key_hash VARCHAR(64) NOT NULL UNIQUE,
      key_prefix VARCHAR(8) NOT NULL,
      permissions JSONB DEFAULT '{"send": true}'::jsonb,
      rate_limit INTEGER DEFAULT 100,
      last_used_at TIMESTAMPTZ,
      created_at TIMESTAMPTZ DEFAULT NOW()
    );
    CREATE INDEX IF NOT EXISTS idx_api_keys_user ON api_keys(user_id);
    CREATE INDEX IF NOT EXISTS idx_api_keys_hash ON api_keys(key_hash);
  `);

  // 8. CRM-Lite Contact Notes, Tags, and Deals
  await query(`
    CREATE TABLE IF NOT EXISTS contact_notes (
      id SERIAL PRIMARY KEY,
      user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      contact_email VARCHAR(255) NOT NULL,
      note TEXT NOT NULL,
      created_at TIMESTAMPTZ DEFAULT NOW()
    );
    CREATE INDEX IF NOT EXISTS idx_contact_notes_lookup ON contact_notes(user_id, contact_email);

    CREATE TABLE IF NOT EXISTS contact_tags (
      id SERIAL PRIMARY KEY,
      user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      contact_email VARCHAR(255) NOT NULL,
      tag VARCHAR(50) NOT NULL,
      created_at TIMESTAMPTZ DEFAULT NOW(),
      UNIQUE(user_id, contact_email, tag)
    );
    CREATE INDEX IF NOT EXISTS idx_contact_tags_lookup ON contact_tags(user_id, contact_email);

    CREATE TABLE IF NOT EXISTS contact_deals (
      id SERIAL PRIMARY KEY,
      user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      contact_email VARCHAR(255) NOT NULL,
      title VARCHAR(200) NOT NULL,
      value DECIMAL(12,2),
      currency VARCHAR(3) DEFAULT 'USD',
      stage VARCHAR(50) DEFAULT 'lead' CHECK (stage IN ('lead', 'contacted', 'proposal', 'negotiation', 'won', 'lost')),
      created_at TIMESTAMPTZ DEFAULT NOW(),
      closed_at TIMESTAMPTZ
    );
    CREATE INDEX IF NOT EXISTS idx_contact_deals_lookup ON contact_deals(user_id, contact_email);
  `);
}

export async function down() {
  await query(`DROP TABLE IF EXISTS contact_deals CASCADE`);
  await query(`DROP TABLE IF EXISTS contact_tags CASCADE`);
  await query(`DROP TABLE IF EXISTS contact_notes CASCADE`);
  await query(`DROP TABLE IF EXISTS api_keys CASCADE`);
  await query(`DROP TABLE IF EXISTS attachment_store CASCADE`);
  await query(`DROP TABLE IF EXISTS subscriber_segments CASCADE`);
  await query(`DROP TABLE IF EXISTS drip_queue CASCADE`);
  await query(`DROP TABLE IF EXISTS drip_steps CASCADE`);
  await query(`DROP TABLE IF EXISTS drip_sequences CASCADE`);
  await query(`DROP INDEX IF EXISTS idx_subscribers_tags`);
  await query(`
    ALTER TABLE subscribers
    DROP COLUMN IF EXISTS tags,
    DROP COLUMN IF EXISTS last_activity_at
  `);
}
