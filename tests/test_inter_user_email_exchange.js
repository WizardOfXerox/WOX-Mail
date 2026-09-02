import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: path.join(__dirname, '../.env') });

const { query } = await import('../server/src/config/database.js');
const { createUser, deleteUser } = await import('../server/src/services/purelymail.js');
const { createConnection, fetchMessages, fetchMessage } = await import('../server/src/services/imap.js');
const { createTransporter, sendEmail } = await import('../server/src/services/smtp.js');

async function testTwoUserExchange() {
  console.log('================================================================');
  console.log('📬 TESTING 2 PERMANENT USERS MAILING EACH OTHER');
  console.log('================================================================');

  const userA = {
    email: process.env.ADMIN_EMAIL || '',
    password: (process.env.ADMIN_PASSWORD || '').replace(/^['"]|['"]$/g, ''),
    name: 'Admin User',
  };

  const userBUsername = `alice${Date.now().toString().slice(-4)}`;
  const userB = {
    username: userBUsername,
    email: `${userBUsername}@wox.world`,
    password: 'AlicePassword2026!#',
    name: 'Alice Cooper',
  };

  console.log(`\n👥 Participants:\n   User A (Admin): ${userA.email}\n   User B (Alice): ${userB.email}`);

  // Step 1: Create User B in Purelymail & Database via Invitation Flow
  console.log('\n[Step 1] Creating User B via Invite & Registration...');
  const inviteCode = `INVITE${Date.now().toString().slice(-6)}`;
  await query('INSERT INTO invite_codes (code, is_used) VALUES ($1, FALSE)', [inviteCode]);

  const regRes = await fetch('http://localhost:3001/api/auth/register', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      username: userB.username,
      password: userB.password,
      inviteCode: inviteCode,
    }),
  });
  const regData = await regRes.json();
  if (regRes.status !== 201) {
    throw new Error(`Failed to register User B: ${JSON.stringify(regData)}`);
  }
  console.log(`✅ User B registered successfully: ${regData.user.email} (ID: ${regData.user.id})`);

  // Step 2: User A sends an email to User B
  console.log(`\n[Step 2] User A (${userA.email}) -> User B (${userB.email})...`);
  const transporterA = createTransporter(userA.email, userA.password);
  const subjectA = `Greetings from Admin [${Date.now().toString().slice(-4)}]`;
  const textA = `Hello Alice,\n\nWelcome to WoxMail! This is a real test email sent from ${userA.email} to ${userB.email} via Purelymail SMTP.\n\nPlease reply when you receive this!`;

  const sendResultA = await sendEmail(transporterA, {
    from: `${userA.name} <${userA.email}>`,
    to: userB.email,
    subject: subjectA,
    text: textA,
    html: `<p>Hello <b>Alice</b>,</p><p>Welcome to <b>WoxMail</b>! This is a real test email sent from <code>${userA.email}</code> to <code>${userB.email}</code> via Purelymail SMTP.</p><p>Please reply when you receive this!</p>`,
  });
  console.log(`✅ User A sent email! Message ID: ${sendResultA.messageId}`);

  // Step 3: Wait a few seconds for Purelymail MX delivery and check User B's IMAP Inbox
  console.log('\n[Step 3] Waiting for email delivery to User B\'s inbox...');
  await new Promise((r) => setTimeout(r, 4000));

  console.log(`Checking User B (${userB.email}) IMAP Inbox...`);
  const clientB = await createConnection(userB.email, userB.password);
  const inboxB = await fetchMessages(clientB, 'INBOX', { limit: 10 });
  console.log(`📥 User B Inbox has ${inboxB.messages.length} message(s)`);

  const receivedByB = inboxB.messages.find((m) => m.subject.includes(subjectA) || m.subject.includes('Greetings from Admin'));
  if (!receivedByB) {
    console.log('   All subjects in User B inbox:', inboxB.messages.map((m) => m.subject));
    throw new Error(`User B did not receive email with subject "${subjectA}"`);
  }
  console.log(`✅ User B successfully received email from User A!`);
  console.log(`   Subject: "${receivedByB.subject}"`);
  console.log(`   From: ${receivedByB.from?.address}`);
  console.log(`   Snippet: "${receivedByB.snippet}"`);

  // Step 4: User B replies back to User A
  console.log(`\n[Step 4] User B (${userB.email}) replying back to User A (${userA.email})...`);
  const transporterB = createTransporter(userB.email, userB.password);
  const subjectB = `Re: ${subjectA}`;
  const textB = `Hi Admin,\n\nGot your email! Everything is working smoothly. Replying back from Alice (${userB.email})!`;

  const sendResultB = await sendEmail(transporterB, {
    from: `${userB.name} <${userB.email}>`,
    to: userA.email,
    subject: subjectB,
    text: textB,
    html: `<p>Hi <b>Admin</b>,</p><p>Got your email! Everything is working smoothly. Replying back from <b>Alice</b> (<code>${userB.email}</code>)!</p>`,
    inReplyTo: receivedByB.messageId,
  });
  console.log(`✅ User B sent reply! Message ID: ${sendResultB.messageId}`);
  await clientB.logout().catch(() => {});

  // Step 5: Wait and check User A's IMAP Inbox for Alice's reply
  console.log('\n[Step 5] Waiting for reply delivery to User A\'s inbox...');
  await new Promise((r) => setTimeout(r, 4000));

  console.log(`Checking User A (${userA.email}) IMAP Inbox...`);
  const clientA = await createConnection(userA.email, userA.password);
  const inboxA = await fetchMessages(clientA, 'INBOX', { limit: 10 });
  console.log(`📥 User A Inbox has ${inboxA.messages.length} message(s)`);

  const receivedByA = inboxA.messages.find((m) => m.subject.includes(subjectB) || m.subject.includes(subjectA));
  if (!receivedByA) {
    console.log('   All subjects in User A inbox:', inboxA.messages.map((m) => m.subject));
    throw new Error(`User A did not receive reply from User B`);
  }
  console.log(`✅ User A successfully received reply from User B!`);
  console.log(`   Subject: "${receivedByA.subject}"`);
  console.log(`   From: ${receivedByA.from?.address}`);
  console.log(`   Snippet: "${receivedByA.snippet}"`);
  await clientA.logout().catch(() => {});

  // Clean up test user B
  console.log('\n[Step 6] Cleaning up test User B...');
  await query('DELETE FROM users WHERE username = $1', [userB.username]);
  await query('DELETE FROM invite_codes WHERE code = $1', [inviteCode]);
  await deleteUser(userB.email).catch(() => {});
  console.log(`✅ Cleanup complete for ${userB.email}`);

  console.log('\n================================================================');
  console.log('🎉 2-USER BIDIRECTIONAL EMAIL CONVERSATION 100% VERIFIED & SUCCESSFUL!');
  console.log('================================================================');
  process.exit(0);
}

testTwoUserExchange().catch((err) => {
  console.error('\n❌ Test Failed:', err.message);
  process.exit(1);
});
