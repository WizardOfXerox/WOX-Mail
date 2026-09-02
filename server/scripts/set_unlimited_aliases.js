import { query, pool } from '../src/config/database.js';

async function main() {
  await query(
    `INSERT INTO settings (key, value, description)
     VALUES ('max_aliases_per_user', '0', 'Maximum aliases allowed per user (0 for unlimited)')
     ON CONFLICT (key) DO UPDATE SET value = '0'`
  );
  console.log('✅ Successfully configured max_aliases_per_user = 0 (UNLIMITED ALIASES)');
  await pool.end();
}

main().catch(console.error);
