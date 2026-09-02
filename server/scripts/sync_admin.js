import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: path.join(__dirname, '../../.env') });

const { query } = await import('../src/config/database.js');

async function main() {
  const adminPassword = (process.env.ADMIN_PASSWORD || '').replace(/^['"]|['"]$/g, '');
  if (!adminPassword) {
    console.error('ADMIN_PASSWORD not configured in .env');
    process.exit(1);
  }

  const res = await query(
    `UPDATE users SET imap_password = $1 WHERE email = $2 RETURNING id, email, username, is_admin`,
    [adminPassword, adminEmail]
  );

  console.log('✅ Admin user updated in database with IMAP/SMTP password:', res.rows[0]);
  process.exit(0);
}

main().catch((err) => {
  console.error('Error updating admin:', err);
  process.exit(1);
});
