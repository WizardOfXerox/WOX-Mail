import 'dotenv/config';
import { hashPassword } from '../src/utils/crypto.js';
import { query } from '../src/config/database.js';

async function main() {
  const password = (process.env.ADMIN_PASSWORD || '').replace(/^['"]|['"]$/g, '');
  const email = process.env.ADMIN_EMAIL;
  if (!password || !email) {
    console.error('ADMIN_PASSWORD and ADMIN_EMAIL must be configured in .env');
    process.exit(1);
  }
  const hash = await hashPassword(password);

  await query(
    `INSERT INTO users (email, username, password_hash, display_name, is_admin, otp_enabled)
     VALUES ($1, 'admin', $2, 'WoxMail Admin', TRUE, FALSE)
     ON CONFLICT (email) DO UPDATE SET password_hash = $2`,
    [email, hash]
  );

  console.log(`✓ Admin credentials updated for ${email}`);
  process.exit(0);
}

main().catch((err) => {
  console.error('Failed to update admin:', err);
  process.exit(1);
});
