import { query } from '../src/config/database.js';

export async function up() {
  console.log('    Creating future_letters table...');

  await query(`
    CREATE TABLE IF NOT EXISTS future_letters (
      id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      user_id             INTEGER REFERENCES users(id) ON DELETE SET NULL,
      sender_email        VARCHAR(255) NOT NULL,
      recipient_email     VARCHAR(255) NOT NULL,
      subject             TEXT NOT NULL,
      body                TEXT NOT NULL,
      send_to_self        BOOLEAN DEFAULT TRUE,
      delivery_date       TIMESTAMPTZ NOT NULL,
      delivery_preset     VARCHAR(32) DEFAULT '1y', -- '6m', '1y', '3y', '5y', '10y', 'custom'
      visibility          VARCHAR(32) DEFAULT 'private', -- 'private', 'public_anonymous'
      verification_token  VARCHAR(64),
      verified            BOOLEAN DEFAULT FALSE,
      status              VARCHAR(32) DEFAULT 'scheduled', -- 'pending_verification', 'scheduled', 'delivered', 'cancelled'
      category            VARCHAR(64) DEFAULT 'General', -- 'Goals', 'Career', 'Life Advice', 'Reflections', 'Predictions', 'Love & Relationships'
      word_count          INTEGER DEFAULT 0,
      delivered_at        TIMESTAMPTZ,
      cancelled_at        TIMESTAMPTZ,
      created_at          TIMESTAMPTZ DEFAULT NOW(),
      updated_at          TIMESTAMPTZ DEFAULT NOW()
    )
  `);

  await query('CREATE INDEX IF NOT EXISTS idx_future_letters_delivery ON future_letters(delivery_date, status)');
  await query('CREATE INDEX IF NOT EXISTS idx_future_letters_user ON future_letters(user_id)');
  await query('CREATE INDEX IF NOT EXISTS idx_future_letters_visibility ON future_letters(visibility, status)');
  await query('CREATE INDEX IF NOT EXISTS idx_future_letters_token ON future_letters(verification_token)');
}
