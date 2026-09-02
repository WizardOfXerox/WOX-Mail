import 'dotenv/config';
import { query } from '../src/config/database.js';
import * as smtpService from '../src/services/smtp.js';
import * as imapService from '../src/services/imap.js';

async function testDelivery() {
  console.log('--- 1. Checking user credentials ---');
  const userRes = await query("SELECT id, username, email, imap_password FROM users WHERE email = 'worldofxerox@wox.world'");
  const user = userRes.rows[0];
  if (!user) {
    console.log('User worldofxerox@wox.world not found');
    return;
  }
  console.log('Found user:', user.email, 'id:', user.id);

  // Check user aliases
  const aliasRes = await query("SELECT * FROM email_aliases WHERE user_id = $1", [user.id]);
  console.log('User aliases:', aliasRes.rows);

  console.log('\n--- 2. Checking IMAP for bounce notifications ---');
  try {
    const client = await imapService.createClient(user.email, user.imap_password);
    await client.connect();
    const lock = await client.getMailboxLock('INBOX');
    try {
      const status = client.mailbox;
      console.log('INBOX message count:', status.exists);
      if (status.exists > 0) {
        const startSeq = Math.max(1, status.exists - 5);
        for await (const msg of client.fetch(`${startSeq}:*`, { envelope: true, internalDate: true })) {
          console.log(`- [${msg.internalDate.toISOString()}] From: ${JSON.stringify(msg.envelope.from?.[0])} | Subject: "${msg.envelope.subject}"`);
        }
      }
    } finally {
      lock.release();
    }
    await client.logout();
  } catch (err) {
    console.error('IMAP check error:', err.message);
  }

  console.log('\n--- 3. Testing SMTP send as Alias to wizardofxerox@gmail.com ---');
  const transporter = smtpService.createTransporter(user.email, user.imap_password);
  
  // Test verify connection
  await transporter.verify();
  console.log('SMTP connection verified with Purelymail');

  const testAlias = aliasRes.rows[0]?.alias_address || '4350c5@wox.world';
  console.log('Sending test from alias:', testAlias);

  const sendResult = await transporter.sendMail({
    from: `worldofxerox <${testAlias}>`,
    to: 'wizardofxerox@gmail.com',
    subject: `Test delivery from alias ${testAlias} - ${Date.now()}`,
    text: `This is a test email sent from alias ${testAlias} to verify Gmail deliverability.\n\nTimestamp: ${new Date().toISOString()}`,
    headers: {
      'Reply-To': testAlias,
    }
  });

  console.log('Send result:', {
    messageId: sendResult.messageId,
    accepted: sendResult.accepted,
    rejected: sendResult.rejected,
    response: sendResult.response,
    envelope: sendResult.envelope,
  });

  process.exit(0);
}

testDelivery().catch((err) => {
  console.error('Error:', err);
  process.exit(1);
});
