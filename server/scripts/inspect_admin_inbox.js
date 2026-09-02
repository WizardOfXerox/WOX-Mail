import 'dotenv/config';
import { query } from '../src/config/database.js';
import { createConnection, fetchMessages, listFolders } from '../src/services/imap.js';

async function main() {
  const userRes = await query("SELECT id, email, imap_password FROM users WHERE email = 'admin@wox.world'");
  const user = userRes.rows[0];
  console.log('User:', user?.email);

  const pass = (process.env.ADMIN_PASSWORD || '').replace(/^['"]|['"]$/g, '');
  const client = await createConnection('admin@wox.world', pass);

  const status = await client.status('INBOX', { messages: true, unseen: true, uidNext: true });
  console.log('IMAP INBOX status:', status);

  const folders = await listFolders(client);
  console.log('All folders:');
  for (const f of folders) {
    console.log(`- ${f.name} (messages: ${f.messages}, unseen: ${f.unseen})`);
  }

  const fetched = await fetchMessages(client, 'INBOX', { page: 1, limit: 50 });
  console.log(`\nFetched ${fetched.messages.length} messages (reported total: ${fetched.total}):`);
  for (const m of fetched.messages) {
    console.log(`UID: ${m.uid} | Date: ${m.date?.toISOString?.() || m.date} | From: ${m.from?.address || m.from?.name || JSON.stringify(m.from)} | Subject: ${m.subject}`);
  }

  await client.logout();
  process.exit(0);
}

main().catch(console.error);
