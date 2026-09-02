import 'dotenv/config';
import { query, pool } from '../src/config/database.js';
import { hashPassword } from '../src/utils/crypto.js';

async function main() {
  const email = 'archive@wox.world';
  const res = await query('SELECT id, email, username FROM users WHERE email = $1', [email]);
  if (res.rows.length === 0) {
    const hash = await hashPassword('Archive@01172006#WOX');
    await query(
      `INSERT INTO users (username, email, password_hash, display_name, is_admin)
       VALUES ($1, $2, $3, $4, $5)`,
      ['archive', email, hash, 'WoxMail Compliance Archive', true]
    );
    console.log('✅ Created local archive user in Postgres:', email);
  } else {
    console.log('✅ Local archive user already exists:', res.rows[0]);
  }
  await pool.end();
}

main().catch(console.error);
