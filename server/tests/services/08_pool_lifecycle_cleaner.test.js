import test from 'node:test';
import assert from 'node:assert/strict';
import '../test_helper.js';
import {
  getPoolStats,
  replenishPool,
  claimAddress,
  cyclePoolMaintenance,
} from '../../src/services/pool.js';
import { query } from '../../src/config/database.js';

test('Suite 08: Standby Pool Lifecycle & 72-Hour Cleaner Daemon', async (t) => {
  await t.test('1. getPoolStats() returns structured status breakdown', async () => {
    const stats = await getPoolStats();
    assert.equal(typeof stats.available, 'number');
    assert.equal(typeof stats.active, 'number');
    assert.equal(typeof stats.expired, 'number');
    assert.equal(typeof stats.total, 'number');
    assert.ok(stats.total >= 0);
  });

  await t.test('2. replenishPool() ensures pool meets target threshold', async () => {
    const replenished = await replenishPool(24);
    assert.equal(typeof replenished, 'number');

    const stats = await getPoolStats();
    assert.ok(stats.available >= 1, 'Pool must have available pre-warmed addresses');
  });

  await t.test('3. claimAddress() delivers instant standby pool address with zero latency', async () => {
    const startTime = Date.now();
    const claimed = await claimAddress('127.0.0.1', 24);
    const latency = Date.now() - startTime;

    assert.ok(claimed.address.includes('@mail.wox.world'));
    assert.ok(claimed.session_token);
    assert.equal(claimed.tier, 'public');
    assert.equal(claimed.status, 'active');
    assert.ok(latency < 500, `Standby pool claim took too long: ${latency}ms`);
  });

  await t.test('4. claimAddress() with custom username provisions dedicated handle', async () => {
    const customHandle = 'testercustom' + Math.floor(Math.random() * 899 + 100);
    const claimedCustom = await claimAddress('127.0.0.1', 24, customHandle);

    assert.ok(claimedCustom.address.startsWith(customHandle));
    assert.equal(claimedCustom.isCustom, true);
    assert.equal(claimedCustom.source, 'user_generated');
  });

  await t.test('5. cyclePoolMaintenance() purges expired addresses from database', async () => {
    // Insert an expired dummy address
    const dummyAddr = 'dummyexpired' + Date.now() + '@mail.wox.world';
    await query(
      `INSERT INTO temp_addresses (address, tier, status, session_token, expires_at, created_at)
       VALUES ($1, 'public', 'active', 'test_dummy_token', NOW() - INTERVAL '2 hours', NOW() - INTERVAL '73 hours')`,
      [dummyAddr]
    );

    const result = await cyclePoolMaintenance(24, 72);
    assert.ok(result.purged >= 1, '72h cleaner must purge expired addresses');

    const check = await query('SELECT id FROM temp_addresses WHERE address = $1', [dummyAddr]);
    assert.equal(check.rows.length, 0, 'Expired dummy address must be removed from DB');
  });
});
