import 'dotenv/config';
import { query } from '../src/config/database.js';
import * as aliasManager from '../src/services/aliasManager.js';
import jwt from 'jsonwebtoken';

async function runTests() {
  console.log('--- 1. Testing checkAliasAvailability Logic ---');

  const userRes = await query("SELECT id, email, username FROM users WHERE email = 'admin@wox.world'");
  const user = userRes.rows[0];

  // Test reserved handle
  const resReserved = await aliasManager.checkAliasAvailability(user.email, 'admin');
  console.log('Check "admin":', resReserved);
  if (resReserved.available) throw new Error('admin should be reserved');

  // Test invalid handle (symbols)
  const resInvalid = await aliasManager.checkAliasAvailability(user.email, 'hello!world');
  console.log('Check "hello!world":', resInvalid);
  if (resInvalid.available) throw new Error('hello!world should be invalid');

  // Test too short handle
  const resShort = await aliasManager.checkAliasAvailability(user.email, 'a');
  console.log('Check "a":', resShort);
  if (resShort.available) throw new Error('single char should be invalid');

  // Test available handle
  const testHandle = `testcustom${Math.floor(1000 + Math.random() * 9000)}`;
  const resAvailable = await aliasManager.checkAliasAvailability(user.email, testHandle);
  console.log(`Check "${testHandle}":`, resAvailable);
  if (!resAvailable.available) throw new Error(`${testHandle} should be available`);

  console.log('\n--- 2. Testing Custom Alias Creation ---');
  const created = await aliasManager.createAlias(
    user.id,
    user.email,
    'My Custom Test Alias',
    'custom',
    null,
    testHandle,
    'main'
  );
  console.log('Successfully created custom alias:', created.alias_address);
  if (created.alias_address !== `${testHandle}@wox.world`) {
    throw new Error('Created address does not match expected');
  }

  // Attempt duplicate creation -> must fail
  console.log('Testing duplicate creation collision check...');
  let dupFailed = false;
  try {
    await aliasManager.createAlias(
      user.id,
      user.email,
      'Duplicate Attempt',
      'custom',
      null,
      testHandle,
      'main'
    );
  } catch (err) {
    dupFailed = true;
    console.log('Duplicate correctly blocked:', err.message);
  }
  if (!dupFailed) throw new Error('Duplicate creation should have failed');

  // Clean up
  await aliasManager.deleteAlias(user.id, created.id);
  console.log('Cleaned up test custom alias');

  console.log('\n--- 3. Testing HTTP API Endpoints on Port 3001 ---');
  const token = jwt.sign({ userId: user.id, type: 'access' }, process.env.JWT_SECRET);

  // GET /api/aliases/check-availability?handle=admin
  const httpCheckRes = await fetch(`http://localhost:3001/api/aliases/check-availability?handle=admin`, {
    headers: { 'Cookie': `woxmail_token=${token}` }
  });
  const httpCheckData = await httpCheckRes.json();
  console.log('HTTP Check "admin":', httpCheckData);
  if (httpCheckData.available) throw new Error('HTTP check for admin should be unavailable');

  // GET /api/aliases/check-availability for new handle
  const httpCheckRes2 = await fetch(`http://localhost:3001/api/aliases/check-availability?handle=${testHandle}`, {
    headers: { 'Cookie': `woxmail_token=${token}` }
  });
  const httpCheckData2 = await httpCheckRes2.json();
  console.log(`HTTP Check "${testHandle}":`, httpCheckData2);
  if (!httpCheckData2.available) throw new Error('HTTP check for available handle should return available: true');

  console.log('\n✅ All Custom Alias & Pre-flight Availability checks passed successfully!');
  process.exit(0);
}

runTests().catch((err) => {
  console.error('❌ Test failed:', err);
  process.exit(1);
});
