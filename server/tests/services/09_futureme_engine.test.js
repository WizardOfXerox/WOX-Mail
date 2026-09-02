import test from 'node:test';
import assert from 'node:assert/strict';
import { createFutureLetter, listPublicLetters, getUserLetters } from '../../src/services/futureLetterService.js';
import { getOrCreateTestUser } from '../test_helper.js';

test('Suite 09: FutureMe Time Capsule Scheduling & Epistle Vault Engine', async (t) => {
  let testUser;

  await t.test('Setup: Prepare test user', async () => {
    testUser = await getOrCreateTestUser('future_test_user', 'Pass123!#', false);
    assert.ok(testUser.id);
  });

  await t.test('1. createFutureLetter() schedules letter for target future date', async () => {
    const futureDate = new Date(Date.now() + 180 * 24 * 3600 * 1000); // 6 months ahead
    const letter = await createFutureLetter({
      userId: testUser.id,
      senderEmail: testUser.email,
      recipientEmail: testUser.email,
      subject: 'Reflections for 6 Months Ahead',
      body: 'Did you achieve your privacy engineering goals this quarter?',
      deliveryDate: futureDate.toISOString(),
      deliveryPreset: '6m',
      visibility: 'private',
      category: 'Career & Goals',
      sendToSelf: true,
    });

    assert.ok(letter.id);
    assert.equal(letter.status, 'scheduled');
    assert.equal(letter.recipient_email || letter.recipientEmail, testUser.email);
  });

  await t.test('2. getUserLetters() retrieves user scheduled time capsules with sealed bodies', async () => {
    const userLetters = await getUserLetters(testUser.id);
    assert.ok(Array.isArray(userLetters));
    assert.ok(userLetters.length >= 1);
    assert.ok(userLetters.some((l) => l.subject === 'Reflections for 6 Months Ahead'));
  });

  await t.test('3. listPublicLetters() returns delivered public letters for epistles feed', async () => {
    const publicList = await listPublicLetters({ category: 'all', page: 1, limit: 10 });
    assert.ok(Array.isArray(publicList.letters));
    assert.equal(typeof publicList.pagination.total, 'number');
  });

  await t.test('4. Rejects past or invalid delivery dates', async () => {
    const pastDate = new Date(Date.now() - 1000 * 60 * 60 * 24);
    await assert.rejects(
      async () => createFutureLetter({
        userId: testUser.id,
        senderEmail: testUser.email,
        body: 'Past letter',
        deliveryDate: pastDate.toISOString(),
      }),
      /Delivery date must be a valid date in the future/
    );
  });
});
