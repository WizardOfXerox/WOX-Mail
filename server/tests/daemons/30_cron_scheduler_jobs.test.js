import test from 'node:test';
import assert from 'node:assert/strict';
import { processDueEmails } from '../../src/services/schedulerService.js';
import { processDueSnoozes } from '../../src/services/snoozeService.js';
import { deliverDueLetters } from '../../src/services/futureLetterService.js';
import { processDeadManSwitches } from '../../src/services/deadManService.js';
import { dailyCleanup } from '../../src/services/cleanup.js';
import { processPendingCampaigns } from '../../src/services/campaignService.js';

test('Suite 30: Background Cron Scheduler & Daemon Task Handlers', async (t) => {
  await t.test('1. processDueEmails() runs without throwing exceptions', async () => {
    const count = await processDueEmails();
    assert.equal(typeof count, 'number');
  });

  await t.test('2. processDueSnoozes() executes wakeup sweep', async () => {
    const count = await processDueSnoozes();
    assert.equal(typeof count, 'number');
  });

  await t.test('3. deliverDueLetters() sweeps for deliverable time capsules', async () => {
    const count = await deliverDueLetters();
    assert.equal(typeof count, 'number');
  });

  await t.test('4. processDeadManSwitches() evaluates inactivity thresholds', async () => {
    // Should run smoothly without unhandled errors
    await assert.doesNotReject(async () => {
      await processDeadManSwitches();
    });
  });

  await t.test('5. processPendingCampaigns() handles outbound broadcast batch queue', async () => {
    const count = await processPendingCampaigns();
    assert.equal(typeof count, 'number');
  });

  await t.test('6. dailyCleanup() executes purge and vacuum tasks', async () => {
    await assert.doesNotReject(async () => {
      await dailyCleanup();
    });
  });
});
