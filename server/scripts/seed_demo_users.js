import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: path.join(__dirname, '../../.env') });

const { query } = await import('../src/config/database.js');
const { createUser } = await import('../src/services/purelymail.js');
const { hashPassword } = await import('../src/utils/crypto.js');

async function seedUsers() {
  console.log('================================================================');
  console.log('👥 SEEDING PERMANENT DEMO USERS INTO WOXMAIL & PURELYMAIL');
  console.log('================================================================');

  const demoUsers = [
    { username: 'alice', name: 'Alice Cooper', password: 'AlicePassword2026!#' },
    { username: 'bob', name: 'Bob Smith', password: 'BobPassword2026!#' },
    { username: 'charlie', name: 'Charlie Brown', password: 'CharliePassword2026!#' },
  ];

  for (const u of demoUsers) {
    const email = `${u.username}@wox.world`;
    console.log(`\nCreating user: ${u.username} (${email})...`);

    // Check if already exists in DB
    const existing = await query('SELECT id FROM users WHERE username = $1', [u.username]);
    if (existing.rows.length > 0) {
      console.log(`   User ${u.username} already exists in DB (ID: ${existing.rows[0].id})`);
      continue;
    }

    // 1. Create in Purelymail
    try {
      const pmRes = await createUser(email, u.password);
      console.log(`   Purelymail mailbox provisioned:`, pmRes);
    } catch (pmErr) {
      console.warn(`   Purelymail note for ${email}: ${pmErr.message}`);
    }

    // 2. Generate invite code and mark as used
    const inviteCode = `INVITE${u.username.toUpperCase()}${Date.now().toString().slice(-4)}`;
    await query(
      'INSERT INTO invite_codes (code, is_used) VALUES ($1, TRUE)',
      [inviteCode]
    );

    // 3. Hash password and insert user into DB
    const passwordHash = await hashPassword(u.password);
    const result = await query(
      `INSERT INTO users (email, username, display_name, password_hash, imap_password, invite_code_used)
       VALUES ($1, $2, $3, $4, $5, $6)
       RETURNING id, email, username, display_name, is_admin, created_at`,
      [email, u.username, u.name, passwordHash, u.password, inviteCode]
    );

    console.log(`✅ Successfully added ${u.username} to database (ID: ${result.rows[0].id})`);
  }

  const allUsers = await query('SELECT id, username, email, is_admin, is_suspended, created_at FROM users ORDER BY id ASC');
  console.log('\n================================================================');
  console.log('📋 CURRENT USERS IN DATABASE:');
  console.table(allUsers.rows);
  console.log('================================================================');
  process.exit(0);
}

seedUsers().catch(err => {
  console.error('Seeding failed:', err);
  process.exit(1);
});
