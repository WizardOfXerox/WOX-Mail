import 'dotenv/config';
import { query } from '../src/config/database.js';
import { up as m001Up } from './001_initial-schema.js';
import { up as m002Up } from './002_seed-defaults.js';
import { up as m003Up } from './003_analytics-tables.js';
import { up as m004Up } from './004_additional-columns.js';
import { up as m005Up } from './005_phase2-features.js';
import { up as m006Up } from './006_phase3-sms.js';
import { up as m007Up } from './007_settings-columns.js';
import { up as m008Up } from './008_screener_webhooks_reverse_aliases.js';
import { up as m009Up } from './009_pgp_and_privacy.js';
import { up as m010Up } from './010_secure_locked_messages.js';
import { up as m011Up } from './011_future_letters.js';
import { up as m012Up } from './012_advanced_services.js';
import { up as m013Up } from './013_ephemeral_streams.js';
import { up as m014Up } from './014_power_features.js';
import { up as m015Up } from './015_temp_addresses_suspended_status.js';
import { up as m016Up } from './016_future_letters_passcode_lock.js';
import { up as m017Up } from './017_app_passwords.js';
import { up as m018Up } from './018_passkeys_webauthn.js';
import { up as m019Up } from './019_user_notes_vault.js';
import { up as m020Up } from './020_outbox_system.js';
import { up as m021Up } from './021_connected_accounts_and_preferences.js';
import { up as m022Up } from './022_email_tracking_and_analytics.js';
import { up as m023Up } from './023_templates_and_kanban.js';
import { up as m024Up } from './024_chat_forwarding_and_disposable.js';
import { up as m025Up } from './025_spam_learning_and_quotas.js';
import { up as m026Up } from './026_compliance_archive_journal.js';
import { up as m027Up } from './027_intelligence_and_controlled_attachments.js';
import { up as m028Up } from './028_sieve_rules_and_search_index.js';

/**
 * Simple migration runner.
 * Tracks applied migrations in a migrations table.
 * Run with: npm run migrate --workspace=server
 */

const migrations = [
  { name: '001_initial-schema', up: m001Up },
  { name: '002_seed-defaults', up: m002Up },
  { name: '003_analytics-tables', up: m003Up },
  { name: '004_additional-columns', up: m004Up },
  { name: '005_phase2-features', up: m005Up },
  { name: '006_phase3-sms', up: m006Up },
  { name: '007_settings-columns', up: m007Up },
  { name: '008_screener_webhooks_reverse_aliases', up: m008Up },
  { name: '009_pgp_and_privacy', up: m009Up },
  { name: '010_secure_locked_messages', up: m010Up },
  { name: '011_future_letters', up: m011Up },
  { name: '012_advanced_services', up: m012Up },
  { name: '013_ephemeral_streams', up: m013Up },
  { name: '014_power_features', up: m014Up },
  { name: '015_temp_addresses_suspended_status', up: m015Up },
  { name: '016_future_letters_passcode_lock', up: m016Up },
  { name: '017_app_passwords', up: m017Up },
  { name: '018_passkeys_webauthn', up: m018Up },
  { name: '019_user_notes_vault', up: m019Up },
  { name: '020_outbox_system', up: m020Up },
  { name: '021_connected_accounts_and_preferences', up: m021Up },
  { name: '022_email_tracking_and_analytics', up: m022Up },
  { name: '023_templates_and_kanban', up: m023Up },
  { name: '024_chat_forwarding_and_disposable', up: m024Up },
  { name: '025_spam_learning_and_quotas', up: m025Up },
  { name: '026_compliance_archive_journal', up: m026Up },
  { name: '027_intelligence_and_controlled_attachments', up: m027Up },
  { name: '028_sieve_rules_and_search_index', up: m028Up },
];

async function run() {
  console.log('[DATABASE] Running WoxMail migrations...\n');

  // Create migrations tracking table
  await query(`
    CREATE TABLE IF NOT EXISTS _migrations (
      id          SERIAL PRIMARY KEY,
      name        TEXT UNIQUE NOT NULL,
      applied_at  TIMESTAMPTZ DEFAULT NOW()
    )
  `);

  // Check which migrations have been applied
  const applied = await query('SELECT name FROM _migrations');
  const appliedNames = new Set(applied.rows.map((r) => r.name));

  let count = 0;
  for (const migration of migrations) {
    if (appliedNames.has(migration.name)) {
      console.log(`  ✓ ${migration.name} (already applied)`);
      continue;
    }

    console.log(`  → Applying ${migration.name}...`);
    try {
      await migration.up();
      await query('INSERT INTO _migrations (name) VALUES ($1)', [migration.name]);
      console.log(`  ✓ ${migration.name} applied`);
      count++;
    } catch (err) {
      console.error(`  ✗ ${migration.name} FAILED:`, err.message);
      process.exit(1);
    }
  }

  console.log(`\n✅ ${count} migration(s) applied. ${appliedNames.size} already up to date.`);
  process.exit(0);
}

run().catch((err) => {
  console.error('Migration runner failed:', err);
  process.exit(1);
});
