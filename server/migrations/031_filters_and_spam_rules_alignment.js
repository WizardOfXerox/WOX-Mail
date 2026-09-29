import { query } from '../src/config/database.js';

export async function up() {
  console.log('    Aligning email_filters columns and adding spam_rules unique constraint...');

  await query(`
    ALTER TABLE email_filters
      ADD COLUMN IF NOT EXISTS condition_field TEXT,
      ADD COLUMN IF NOT EXISTS condition_operator TEXT,
      ADD COLUMN IF NOT EXISTS condition_value TEXT,
      ADD COLUMN IF NOT EXISTS action TEXT,
      ADD COLUMN IF NOT EXISTS action_value TEXT;

    ALTER TABLE email_filters ALTER COLUMN conditions DROP NOT NULL;
    ALTER TABLE email_filters ALTER COLUMN actions DROP NOT NULL;

    CREATE UNIQUE INDEX IF NOT EXISTS idx_spam_rules_user_type_val ON spam_rules(user_id, type, value);
  `);
}

export async function down() {
  console.log('    Rolling back email_filters column alignment and spam_rules constraint...');

  await query(`
    DROP INDEX IF EXISTS idx_spam_rules_user_type_val;

    ALTER TABLE email_filters
      DROP COLUMN IF EXISTS condition_field,
      DROP COLUMN IF EXISTS condition_operator,
      DROP COLUMN IF EXISTS condition_value,
      DROP COLUMN IF EXISTS action,
      DROP COLUMN IF EXISTS action_value;
  `);
}
