import 'dotenv/config';
import { query } from '../src/config/database.js';
import * as imapService from '../src/services/imap.js';
import { simpleParser } from 'mailparser';

async function inspectInbox() {
  const userRes = await query("SELECT id, username, email, imap_password FROM users WHERE email = 'worldofxerox@wox.world'");
  const user = userRes.rows[0];
  const client = await imapService.createConnection(user.email, user.imap_password);
  
  const lock = await client.getMailboxLock('INBOX');
  try {
    for await (const msg of client.fetch('1:*', { uid: true, envelope: true, source: true })) {
      const parsed = await simpleParser(msg.source);
      console.log('--- UID:', msg.uid, '| Subject:', parsed.subject);
      console.log('    Message-ID:', parsed.messageId);
      console.log('    From:', parsed.from?.text);
      console.log('    To:', parsed.to?.text);
      console.log('    Date:', parsed.date);
    }
  } finally {
    lock.release();
  }
  process.exit(0);
}

inspectInbox().catch(err => {
  console.error(err);
  process.exit(1);
});
