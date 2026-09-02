import test from 'node:test';
import assert from 'node:assert/strict';
import {
  snoozeEmail,
  listSnoozed,
  cancelSnooze,
  getSnoozeOptions,
  processDueSnoozes,
} from '../../src/services/snoozeService.js';
import {
  scheduleEmail,
  listScheduled,
  cancelScheduled,
} from '../../src/services/schedulerService.js';
import { getOrCreateTestUser } from '../test_helper.js';

test('Suite 16: Message Snooze Engine & Outbound Send Scheduler', async (t) => {
  let testUser;
  let snoozedRecord;
  let scheduledRecord;

  await t.test('Setup: Prepare test user', async () => {
    testUser = await getOrCreateTestUser('snooze_scheduler_user', 'Pass123!#', false);
    assert.ok(testUser.id);
  });

  await t.test('1. getSnoozeOptions() generates preset future ISO timestamps', () => {
    const options = getSnoozeOptions();
    assert.ok(Array.isArray(options));
    assert.ok(options.length >= 3);
    assert.ok(options.some((o) => o.label === 'Later Today'));
    assert.ok(options.some((o) => o.label === 'Tomorrow'));
    assert.ok(options.some((o) => o.label === 'Next Week'));
  });

  await t.test('2. snoozeEmail() and listSnoozed() hide email until due date', async () => {
    const snoozeUntil = new Date(Date.now() + 3600 * 1000).toISOString();
    snoozedRecord = await snoozeEmail(testUser.id, 99201, 'INBOX', snoozeUntil);

    assert.ok(snoozedRecord.id);
    assert.equal(snoozedRecord.user_id, testUser.id);
    assert.equal(snoozedRecord.message_uid, 99201);
    assert.equal(snoozedRecord.unsnoozed, false);

    const snoozedList = await listSnoozed(testUser.id);
    assert.ok(snoozedList.some((s) => s.message_uid === 99201));
  });

  await t.test('3. cancelSnooze() restores email to active inbox', async () => {
    const canceled = await cancelSnooze(testUser.id, snoozedRecord.id);
    assert.equal(canceled, true);

    const listAfter = await listSnoozed(testUser.id);
    assert.ok(!listAfter.some((s) => s.id === snoozedRecord.id));
  });

  await t.test('4. scheduleEmail() and listScheduled() queue future outbound delivery', async () => {
    const sendAt = new Date(Date.now() + 7200 * 1000).toISOString();
    scheduledRecord = await scheduleEmail(testUser.id, {
      to: ['recipient@example.com'],
      subject: 'Scheduled Strategy Memorandum',
      bodyHtml: '<p>Strategy memo body</p>',
      bodyText: 'Strategy memo body',
      sendAt,
    });

    assert.ok(scheduledRecord.id);
    assert.equal(scheduledRecord.subject, 'Scheduled Strategy Memorandum');

    const scheduledList = await listScheduled(testUser.id);
    assert.ok(scheduledList.some((s) => s.id === scheduledRecord.id));
  });

  await t.test('5. cancelScheduled() cancels pending outbound email', async () => {
    const canceled = await cancelScheduled(testUser.id, scheduledRecord.id);
    assert.equal(canceled, true);

    const listAfter = await listScheduled(testUser.id);
    assert.ok(!listAfter.some((s) => s.id === scheduledRecord.id));
  });
});
