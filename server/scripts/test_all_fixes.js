import 'dotenv/config';
import { query } from '../src/config/database.js';
import { cyclePoolMaintenance, claimAddress } from '../src/services/pool.js';
import { sendWoxWelcomeEmail } from '../src/services/welcomeService.js';

async function runTests() {
  console.log('--- 1. Testing Pool Maintenance Lifecycle ---');
  const maintRes = await cyclePoolMaintenance(24);
  console.log('cyclePoolMaintenance result:', maintRes);

  console.log('--- 2. Checking Active Temp Mail Accounts in DB ---');
  const addrs = await query('SELECT address, tier, status, expires_at FROM temp_addresses ORDER BY created_at DESC LIMIT 10');
  console.table(addrs.rows);

  console.log('--- 3. Testing Claiming an Address & Preserving It ---');
  const claimed1 = await claimAddress('127.0.0.1', 24);
  console.log('Claimed address 1:', claimed1.address, 'expiresAt:', claimed1.expires_at);

  const claimed2 = await claimAddress('127.0.0.1', 24);
  console.log('Claimed address 2:', claimed2.address, 'expiresAt:', claimed2.expires_at);

  const check1 = await query('SELECT address, status, expires_at FROM temp_addresses WHERE address = $1', [claimed1.address]);
  console.log('Address 1 still active after address 2 created?:', check1.rows[0]);

  console.log('--- 4. Testing Welcome Email Dispatch ---');
  try {
    const welcomeRes = await sendWoxWelcomeEmail(claimed1.address, { isTemp: true });
    console.log('Welcome email dispatched ID:', welcomeRes?.messageId);
  } catch (err) {
    console.error('Welcome email error:', err.message);
  }

  console.log('All test checks completed successfully!');
  process.exit(0);
}

runTests().catch((err) => {
  console.error('Test script error:', err);
  process.exit(1);
});
