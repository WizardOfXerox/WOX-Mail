import 'dotenv/config';
import { createConnection, fetchMessages } from '../src/services/imap.js';

async function main() {
  const pass = (process.env.ADMIN_PASSWORD || '').replace(/^['"]|['"]$/g, '');
  const client = await createConnection('admin@wox.world', pass);
  const lock = await client.getMailboxLock('INBOX');

  try {
    const searchRes = await client.search({ from: 'support@purelymail.com' }, { uid: true });
    console.log('Found welcome email UIDs in admin INBOX:', searchRes);
    if (searchRes && searchRes.length > 0) {
      await client.messageDelete(searchRes);
      console.log('Deleted Purelymail welcome message UIDs:', searchRes);
    }
  } finally {
    lock.release();
  }

  const result = await fetchMessages(client, 'INBOX', { page: 1, limit: 25 });
  console.log(`\nNow fetching page 1 (limit 25): received ${result.messages.length} messages, total = ${result.total}`);
  result.messages.forEach((m, idx) => {
    console.log(`${idx + 1}. [UID ${m.uid}] ${m.date?.toISOString?.() || m.date} | From: ${m.from?.address || m.from?.name || m.from} | Subject: ${m.subject}`);
  });

  await client.logout();
  process.exit(0);
}

main().catch(console.error);
