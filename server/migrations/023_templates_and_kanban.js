import { query } from '../src/config/database.js';

/**
 * Migration 023: Email Templates Engine & Kanban Workflow Board
 * - email_templates: Reusable body templates with {{variable}} placeholders
 * - kanban_boards & kanban_cards: Visual email project/task management
 */
export async function up() {
  console.log('    Running Migration 023: Email Templates & Kanban Boards...');

  // 1. Email Templates
  await query(`
    CREATE TABLE IF NOT EXISTS email_templates (
      id          SERIAL PRIMARY KEY,
      user_id     INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      name        VARCHAR(255) NOT NULL,
      subject     VARCHAR(500),
      body_html   TEXT NOT NULL,
      body_text   TEXT,
      category    VARCHAR(100) DEFAULT 'General', -- 'Sales', 'Support', 'Follow-up', 'Personal'
      variables   JSONB DEFAULT '[]'::jsonb,      -- list of variable names e.g. ["name", "company"]
      usage_count INTEGER DEFAULT 0,
      created_at  TIMESTAMPTZ DEFAULT NOW(),
      updated_at  TIMESTAMPTZ DEFAULT NOW()
    );

    CREATE INDEX IF NOT EXISTS idx_email_templates_user ON email_templates(user_id);
    CREATE INDEX IF NOT EXISTS idx_email_templates_cat ON email_templates(user_id, category);
  `);

  // 2. Kanban Boards & Cards
  await query(`
    CREATE TABLE IF NOT EXISTS kanban_boards (
      id          SERIAL PRIMARY KEY,
      user_id     INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      name        VARCHAR(255) NOT NULL DEFAULT 'Main Board',
      columns     JSONB DEFAULT '[
        {"id": "todo", "title": "To Do", "color": "#7c3aed"},
        {"id": "inprogress", "title": "In Progress", "color": "#3b82f6"},
        {"id": "waiting", "title": "Waiting Reply", "color": "#f59e0b"},
        {"id": "done", "title": "Done", "color": "#22c55e"}
      ]'::jsonb,
      created_at  TIMESTAMPTZ DEFAULT NOW(),
      updated_at  TIMESTAMPTZ DEFAULT NOW()
    );

    CREATE INDEX IF NOT EXISTS idx_kanban_boards_user ON kanban_boards(user_id);

    CREATE TABLE IF NOT EXISTS kanban_cards (
      id            SERIAL PRIMARY KEY,
      board_id      INTEGER NOT NULL REFERENCES kanban_boards(id) ON DELETE CASCADE,
      user_id       INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      column_id     VARCHAR(50) NOT NULL DEFAULT 'todo',
      position      INTEGER DEFAULT 0,
      title         VARCHAR(500) NOT NULL,
      description   TEXT,
      message_uid   VARCHAR(255),
      folder        VARCHAR(100) DEFAULT 'INBOX',
      sender_email  VARCHAR(255),
      due_date      TIMESTAMPTZ,
      priority      VARCHAR(50) DEFAULT 'medium', -- 'low', 'medium', 'high', 'urgent'
      color         VARCHAR(50),
      labels        TEXT[] DEFAULT '{}',
      created_at    TIMESTAMPTZ DEFAULT NOW(),
      updated_at    TIMESTAMPTZ DEFAULT NOW()
    );

    CREATE INDEX IF NOT EXISTS idx_kanban_cards_board ON kanban_cards(board_id, column_id);
    CREATE INDEX IF NOT EXISTS idx_kanban_cards_user ON kanban_cards(user_id);
  `);
}

export async function down() {
  await query(`
    DROP TABLE IF EXISTS kanban_cards CASCADE;
    DROP TABLE IF EXISTS kanban_boards CASCADE;
    DROP TABLE IF EXISTS email_templates CASCADE;
  `);
}

export default { up, down };
