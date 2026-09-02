import { query } from '../src/config/database.js';

export async function up() {
  await query(`
    ALTER TABLE temp_addresses DROP CONSTRAINT IF EXISTS temp_addresses_status_check;
    ALTER TABLE temp_addresses ADD CONSTRAINT temp_addresses_status_check
      CHECK (status IN ('available', 'active', 'expired', 'purging', 'quarantine', 'suspended'));
  `);
}

export async function down() {
  await query(`
    ALTER TABLE temp_addresses DROP CONSTRAINT IF EXISTS temp_addresses_status_check;
    ALTER TABLE temp_addresses ADD CONSTRAINT temp_addresses_status_check
      CHECK (status IN ('available', 'active', 'expired', 'purging', 'quarantine'));
  `);
}
