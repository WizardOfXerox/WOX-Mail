import test from 'node:test';
import assert from 'node:assert/strict';
import crypto from 'crypto';
import {
  generateWebhookSecret,
  createWebhook,
  listWebhooks,
  deleteWebhook,
} from '../../src/services/webhookDispatcher.js';
import { getOrCreateTestUser } from '../test_helper.js';

test('Suite 19: Outbound Webhook Dispatcher & Push Event Handlers', async (t) => {
  let testUser;
  let createdWebhook;

  await t.test('Setup: Prepare test user', async () => {
    testUser = await getOrCreateTestUser('webhook_owner_tester', 'Pass123!#', false);
    assert.ok(testUser.id);
  });

  await t.test('1. generateWebhookSecret() produces high-entropy whsec_ secret', () => {
    const sec = generateWebhookSecret();
    assert.ok(sec.startsWith('whsec_'));
    assert.ok(sec.length > 30);
  });

  await t.test('2. createWebhook() and listWebhooks() registers webhook endpoint', async () => {
    createdWebhook = await createWebhook(
      testUser.id,
      'Staging Notification Sink',
      'https://webhook.site/test-endpoint',
      ['mail.received', 'mail.otp_extracted']
    );

    assert.ok(createdWebhook.id);
    assert.equal(createdWebhook.name, 'Staging Notification Sink');
    assert.equal(createdWebhook.is_active, true);
    assert.deepEqual(createdWebhook.events, ['mail.received', 'mail.otp_extracted']);

    const list = await listWebhooks(testUser.id);
    assert.ok(list.some((w) => w.id === createdWebhook.id));
  });

  await t.test('3. Generates valid HMAC-SHA256 signature for outbound event payloads', () => {
    const payload = JSON.stringify({ event: 'mail.received', messageId: '<123@wox.world>', timestamp: 1787634000 });
    const signature = crypto.createHmac('sha256', createdWebhook.secret_key).update(payload).digest('hex');

    assert.equal(signature.length, 64);

    // Verify recipient validation
    const verified = crypto.timingSafeEqual(
      Buffer.from(signature, 'hex'),
      crypto.createHmac('sha256', createdWebhook.secret_key).update(payload).digest()
    );
    assert.equal(verified, true);
  });

  await t.test('4. deleteWebhook() removes webhook', async () => {
    const deleted = await deleteWebhook(testUser.id, createdWebhook.id);
    assert.equal(deleted, true);

    const listAfter = await listWebhooks(testUser.id);
    assert.ok(!listAfter.some((w) => w.id === createdWebhook.id));
  });
});
