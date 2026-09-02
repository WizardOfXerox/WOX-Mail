import { query } from '../src/config/database.js';

/**
 * Migration 006: Phase 3 feature tables — WoxSMS.
 * - user_devices (paired Android phones)
 * - sms_messages (synced SMS history)
 */
export async function up() {
  await query(`
    CREATE TABLE IF NOT EXISTS user_devices (
      id SERIAL PRIMARY KEY,
      user_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
      device_name TEXT NOT NULL,
      device_token TEXT UNIQUE NOT NULL,
      phone_number TEXT,
      is_active BOOLEAN DEFAULT TRUE,
      last_synced_at TIMESTAMPTZ,
      created_at TIMESTAMPTZ DEFAULT NOW()
    );
    CREATE INDEX IF NOT EXISTS idx_devices_user ON user_devices(user_id);
    CREATE INDEX IF NOT EXISTS idx_devices_token ON user_devices(device_token);
  `);

  await query(`
    CREATE TABLE IF NOT EXISTS sms_messages (
      id SERIAL PRIMARY KEY,
      user_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
      device_id INTEGER REFERENCES user_devices(id) ON DELETE CASCADE,
      sender_phone TEXT NOT NULL,
      message_body TEXT NOT NULL,
      direction TEXT NOT NULL DEFAULT 'inbound',
      is_otp BOOLEAN DEFAULT FALSE,
      otp_code TEXT,
      received_at TIMESTAMPTZ NOT NULL,
      created_at TIMESTAMPTZ DEFAULT NOW()
    );
    CREATE INDEX IF NOT EXISTS idx_sms_user ON sms_messages(user_id, received_at DESC);
  `);

  console.log('Migration 006: Phase 3 SMS tables created');
}

export async function down() {
  await query('DROP TABLE IF EXISTS sms_messages CASCADE');
  await query('DROP TABLE IF EXISTS user_devices CASCADE');
  console.log('Migration 006: Phase 3 SMS tables dropped');
}

export default { up, down };
