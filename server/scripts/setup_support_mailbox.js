import 'dotenv/config';
import { createUser } from '../src/services/purelymail.js';

async function main() {
  const pass = (process.env.ADMIN_PASSWORD || '').replace(/^['"]|['"]$/g, '');
  const email = process.env.SUPPORT_EMAIL || 'support@wox.world';
  console.log(`Creating ${email} in Purelymail...`);
  try {
    const res = await createUser(email, pass);
    console.log(`Success creating ${email}:`, res);
  } catch (e) {
    console.log(`Note for ${email}: ${e.message}`);
  }
  process.exit(0);
}

main().catch(console.error);
