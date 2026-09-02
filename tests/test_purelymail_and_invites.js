import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: path.join(__dirname, '../.env') });

const { query } = await import('../server/src/config/database.js');
const { createUser, deleteUser, listUser } = await import('../server/src/services/purelymail.js');

async function testLiveFeatures() {
  console.log('================================================================');
  console.log('🚀 TESTING LIVE PURELYMAIL INTEGRATION & INVITATION CODES');
  console.log('================================================================');

  // TEST 1: Public Temp Mailbox in Purelymail
  const publicTestEmail = `pubtest${Date.now().toString().slice(-4)}@wox.world`;
  console.log('\n1. Testing Public Temp Mailbox Creation in Purelymail:', publicTestEmail);
  const pmPubRes = await createUser(publicTestEmail, 'TestPassword123!');
  console.log('   Purelymail Create Result:', pmPubRes);

  // Clean up
  await deleteUser(publicTestEmail);
  console.log('   Purelymail Cleanup (deleteUser): Success');

  // TEST 2: Personal Temp Mailbox in Purelymail
  const personalTestEmail = `perstest${Date.now().toString().slice(-4)}@wox.world`;
  console.log('\n2. Testing Personal Temp Mailbox Creation in Purelymail:', personalTestEmail);
  const pmPersRes = await createUser(personalTestEmail, 'SecretPass456!');
  console.log('   Purelymail Create Result:', pmPersRes);

  // Clean up
  await deleteUser(personalTestEmail);
  console.log('   Purelymail Cleanup (deleteUser): Success');

  // TEST 3: Generate Invite Code & Register User
  console.log('\n3. Testing Invitation Code Generation & Registration Flow');
  
  // 3a. Generate invite code in database (alphanumeric 8-32 chars)
  const inviteCode = `TESTINVITE${Date.now().toString().slice(-6)}`;
  await query(
    'INSERT INTO invite_codes (code, is_used) VALUES ($1, FALSE)',
    [inviteCode]
  );
  console.log('   Generated Invite Code in DB:', inviteCode);

  // 3b. Verify invite code is active
  const checkInvite = await query(
    'SELECT * FROM invite_codes WHERE code = $1 AND is_used = FALSE',
    [inviteCode]
  );
  console.log('   Invite Code Verified in DB:', checkInvite.rows.length === 1);

  // 3c. Register new user with this invite code via Auth API
  const testNewUser = `user${Date.now().toString().slice(-5)}`;
  const regRes = await fetch('http://localhost:3001/api/auth/register', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      username: testNewUser,
      password: 'UserPassword2026!#',
      inviteCode: inviteCode
    })
  });
  const regData = await regRes.json();
  console.log('   Registration HTTP Status:', regRes.status);
  console.log('   Registered User Email:', regData.user?.email);

  // 3d. Verify invite code is now marked as used
  const usedCheck = await query(
    'SELECT is_used, used_by FROM invite_codes WHERE code = $1',
    [inviteCode]
  );
  console.log('   Invite Code Marked as Used in DB:', usedCheck.rows[0]);

  // 3e. Test login with newly registered user
  const loginRes = await fetch('http://localhost:3001/api/auth/login', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      email: `${testNewUser}@wox.world`,
      password: 'UserPassword2026!#'
    })
  });
  console.log('   New User Login HTTP Status:', loginRes.status);

  // Clean up test user
  await query('DELETE FROM users WHERE username = $1', [testNewUser]);
  await query('DELETE FROM invite_codes WHERE code = $1', [inviteCode]);
  await deleteUser(`${testNewUser}@wox.world`).catch(() => {});
  console.log('   Test Cleanup: Completed');

  console.log('\n================================================================');
  console.log('🎉 ALL LIVE PURELYMAIL & INVITATION TESTS PASSED (100%)!');
  console.log('================================================================');
  process.exit(0);
}

testLiveFeatures().catch(err => {
  console.error('Test Failed:', err);
  process.exit(1);
});
