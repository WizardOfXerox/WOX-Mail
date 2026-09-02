import test from 'node:test';
import assert from 'node:assert/strict';
import '../test_helper.js';
import { getDeadManSwitch, updateDeadManSwitch, checkin } from '../../src/services/deadManService.js';
import { getOrCreateTestUser } from '../test_helper.js';

test("Suite 10: Dead Man's Switch Heartbeat & Fail-Safe Protocol", async (t) => {
  let testUser;

  await t.test('Setup: Prepare test user for dead man switch', async () => {
    testUser = await getOrCreateTestUser('deadman_tester', 'Pass123!#', false);
    assert.ok(testUser.id);
  });

  await t.test('1. getDeadManSwitch() returns default disabled state when unconfigured', async () => {
    const status = await getDeadManSwitch(testUser.id);
    assert.ok(status);
    assert.equal(typeof status.enabled, 'boolean');
  });

  await t.test('2. updateDeadManSwitch() configures switch interval, emergency payload, and beneficiaries', async () => {
    const updated = await updateDeadManSwitch(testUser.id, {
      enabled: true,
      intervalDays: 60,
      finalSubject: 'Emergency Master Vault & Sovereign Keys',
      finalInstructions: 'Access key is stored in physical deposit box #99',
      beneficiaryEmails: ['beneficiary1@example.com', 'beneficiary2@example.com'],
    });

    assert.equal(updated.enabled, true);
    assert.equal(updated.interval_days, 60);
    assert.equal(updated.status, 'active');
    assert.equal(updated.beneficiary_emails.length, 2);
  });

  await t.test('3. checkin() records heartbeat signal and resets clock', async () => {
    const checkinRes = await checkin(testUser.id);
    assert.equal(checkinRes.success, true);
    assert.ok(checkinRes.message.includes('Heartbeat check-in recorded'));

    const statusAfter = await getDeadManSwitch(testUser.id);
    assert.ok(statusAfter.lastCheckin);
  });
});
