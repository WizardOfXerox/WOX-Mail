import test from 'node:test';
import assert from 'node:assert/strict';
import * as undoSendService from '../../src/services/undoSendService.js';

test('Suite 37: Unit — Atomic Undo Send State Machine & Delayed Outbound Queue', async (t) => {
  const dummyUser = {
    id: 8888,
    email: 'undo_test@wox.world',
    imap_password: 'DummyPassword123!',
  };

  const dummyPayload = {
    from: 'undo_test@wox.world',
    to: 'recipient@example.com',
    subject: 'Undo Send Test Subject',
    text: 'This email is pending in the undo buffer.',
  };

  await t.test('1. queueOutboundMessage queues email with status queued_undo and positive delay', async () => {
    const queued = await undoSendService.queueOutboundMessage({
      user: dummyUser,
      emailPayload: dummyPayload,
      delaySeconds: 15,
    });

    assert.ok(queued.dispatchId, 'Must generate unique dispatch UUID');
    assert.equal(queued.status, 'queued_undo');
    assert.equal(queued.delaySeconds, 15);
    assert.ok(queued.scheduledAt instanceof Date);

    // Clean up timer by cancelling
    const cancelRes = undoSendService.cancelUndoSend(dummyUser.id, queued.dispatchId);
    assert.equal(cancelRes.success, true);
  });

  await t.test('2. cancelUndoSend rejects unauthorized user or unknown dispatchId', async () => {
    const cancelInvalid = undoSendService.cancelUndoSend(dummyUser.id, 'non-existent-uuid');
    assert.equal(cancelInvalid.success, false);

    const queued = await undoSendService.queueOutboundMessage({
      user: dummyUser,
      emailPayload: dummyPayload,
      delaySeconds: 10,
    });

    // Attempt cancellation with different user ID
    const cancelOther = undoSendService.cancelUndoSend(9999, queued.dispatchId);
    assert.equal(cancelOther.success, false);
    assert.match(cancelOther.message, /Unauthorized/i);

    // Clean up
    undoSendService.cancelUndoSend(dummyUser.id, queued.dispatchId);
  });

  await t.test('3. cancelUndoSend successfully cancels within grace period and frees timer', async () => {
    const queued = await undoSendService.queueOutboundMessage({
      user: dummyUser,
      emailPayload: dummyPayload,
      delaySeconds: 20,
    });

    const cancelRes = undoSendService.cancelUndoSend(dummyUser.id, queued.dispatchId);
    assert.equal(cancelRes.success, true);
    assert.equal(cancelRes.message, 'Email send was successfully cancelled');

    // Second cancel attempt should fail as record was evicted
    const secondCancel = undoSendService.cancelUndoSend(dummyUser.id, queued.dispatchId);
    assert.equal(secondCancel.success, false);
  });
});
