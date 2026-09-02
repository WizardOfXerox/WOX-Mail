import 'dotenv/config';
import { query } from '../src/config/database.js';
import { createConnection } from '../src/services/imap.js';

async function main() {
  const row = (await query("SELECT address, imap_password FROM temp_addresses WHERE address = 'victorrivera88@mail.wox.world'")).rows[0];
  if (!row) {
    console.log('Address not found');
    process.exit(0);
  }

  console.log('Connecting to', row.address);
  const client = await createConnection(row.address, row.imap_password);
  const lock = await client.getMailboxLock('INBOX');

  try {
    // Search for Purelymail welcome emails
    const searchRes = await client.search({ from: 'purelymail.com' }, { uid: true });
    console.log('Found Purelymail message UIDs:', searchRes);

    if (searchRes && searchRes.length > 0) {
      await client.messageDelete(searchRes);
      console.log('Deleted Purelymail welcome email successfully!');
    }
  } finally {
    lock.release();
    await client.logout();
  }

  process.exit(0);
}

main().catch(console.error);
