import { query } from '../src/config/database.js';

/**
 * Migration 019: User Notes Vault & Standalone Checklists
 * 
 * Tables created:
 * 1. user_notes - AES-256 encrypted standalone notes & interactive checklists
 */
export async function up() {
  await query(`
    CREATE TABLE IF NOT EXISTS user_notes (
      id                 SERIAL PRIMARY KEY,
      user_id            INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      title              VARCHAR(255) DEFAULT 'Untitled Note',
      content_encrypted  TEXT NOT NULL,
      iv                 TEXT NOT NULL,
      color              VARCHAR(50) DEFAULT 'purple',
      is_pinned          BOOLEAN DEFAULT FALSE,
      is_checklist       BOOLEAN DEFAULT FALSE,
      tags               TEXT[] DEFAULT '{}',
      linked_message_uid VARCHAR(255),
      created_at         TIMESTAMPTZ DEFAULT NOW(),
      updated_at         TIMESTAMPTZ DEFAULT NOW()
    );
    CREATE INDEX IF NOT EXISTS idx_user_notes_user ON user_notes(user_id);
    CREATE INDEX IF NOT EXISTS idx_user_notes_pinned ON user_notes(user_id, is_pinned);
    CREATE INDEX IF NOT EXISTS idx_user_notes_linked ON user_notes(user_id, linked_message_uid);
  `);
}

export async function down() {
  await query(`DROP TABLE IF EXISTS user_notes CASCADE;`);
}
