import test from 'node:test';
import assert from 'node:assert/strict';
import {
  createList,
  listLists,
  addSubscriber,
  deleteList,
  createCampaign,
} from '../../src/services/campaignService.js';
import { getOrCreateTestUser } from '../test_helper.js';

test('Suite 14: Newsletter Campaigns & Broadcast Engine', async (t) => {
  let testUser;
  let createdList;

  await t.test('Setup: Prepare test user for campaigns', async () => {
    testUser = await getOrCreateTestUser('campaign_broadcaster', 'Pass123!#', false);
    assert.ok(testUser.id);
  });

  await t.test('1. createList() creates mailing list with opt-in configuration', async () => {
    createdList = await createList(testUser.id, {
      name: 'WoxMail Security & Privacy Dispatches',
      description: 'Quarterly zero-knowledge encryption updates',
      optinType: 'single',
    });

    assert.ok(createdList.id);
    assert.equal(createdList.name, 'WoxMail Security & Privacy Dispatches');
  });

  await t.test('2. addSubscriber() registers subscribers with unique unsubscribe tokens', async () => {
    const sub = await addSubscriber(createdList.id, {
      email: 'subscriber_alpha@example.com',
      firstName: 'Alice',
      lastName: 'Cryptographer',
    });

    assert.ok(sub.id);
    assert.equal(sub.email, 'subscriber_alpha@example.com');
    assert.equal(sub.status, 'active');
    assert.ok(sub.unsubscribe_token, 'Subscriber must be assigned a unique unsubscribe token');
  });

  await t.test('3. listLists() returns lists with computed subscriber metrics', async () => {
    const lists = await listLists(testUser.id);
    assert.ok(Array.isArray(lists));
    assert.ok(lists.length >= 1);
    const found = lists.find((l) => l.id === createdList.id);
    assert.ok(found);
    assert.ok(found.total_subscribers >= 1);
    assert.ok(found.active_subscribers >= 1);
  });

  await t.test('4. createCampaign() schedules outbound broadcast campaign', async () => {
    const campaign = await createCampaign(testUser.id, {
      listId: createdList.id,
      name: 'Autumn 2026 Sovereign Update',
      subject: 'Release Notes: Enclave Pin Vault & PGP Curve25519',
      htmlContent: '<h1>Sovereign Update</h1><p>We have launched our new cryptographic vault.</p>',
    });

    assert.ok(campaign.id);
    assert.equal(campaign.name, 'Autumn 2026 Sovereign Update');
    assert.equal(campaign.status, 'draft');
  });

  await t.test('5. deleteList() cascades deletion of mailing list', async () => {
    const deleted = await deleteList(testUser.id, createdList.id);
    assert.equal(deleted, true);
  });
});
