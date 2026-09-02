import test from 'node:test';
import assert from 'node:assert/strict';
import {
  parseSender,
  classifySender,
  setScreenerDecision,
  listScreenerRules,
  deleteScreenerRule,
} from '../../src/services/screenerService.js';
import { getOrCreateTestUser } from '../test_helper.js';

test('Suite 15: Gatekeeper Screener & Sender Quarantine Engine', async (t) => {
  let testUser;

  await t.test('Setup: Prepare test user', async () => {
    testUser = await getOrCreateTestUser('screener_target', 'Pass123!#', false);
    assert.ok(testUser.id);
  });

  await t.test('1. parseSender() parses formatted RFC email From headers', () => {
    const header1 = '"GitHub Security" <notifications@github.com>';
    const parsed1 = parseSender(header1);
    assert.equal(parsed1.name, 'GitHub Security');
    assert.equal(parsed1.email, 'notifications@github.com');
    assert.equal(parsed1.domain, 'github.com');

    const header2 = 'simple@domain.org';
    const parsed2 = parseSender(header2);
    assert.equal(parsed2.email, 'simple@domain.org');
    assert.equal(parsed2.domain, 'domain.org');
  });

  await t.test('2. classifySender() identifies pending senders before user review', async () => {
    const unknownSender = await classifySender(testUser.id, 'Alice Unknown <alice@newstranger.com>');
    assert.equal(unknownSender.status, 'pending');
    assert.equal(unknownSender.senderEmail, 'alice@newstranger.com');
    assert.equal(unknownSender.senderDomain, 'newstranger.com');
  });

  await t.test('3. setScreenerDecision() routes exact sender to allowed/inbox', async () => {
    const rule = await setScreenerDecision(testUser.id, 'alice@newstranger.com', 'exact', 'inbox');
    assert.ok(rule.id);
    assert.equal(rule.destination, 'inbox');

    const recheck = await classifySender(testUser.id, 'Alice Unknown <alice@newstranger.com>');
    assert.equal(recheck.status, 'inbox');
  });

  await t.test('4. setScreenerDecision() routes whole domain to The Feed / Blocked', async () => {
    await setScreenerDecision(testUser.id, 'spammerdomain.net', 'domain', 'blocked');

    const blockedCheck = await classifySender(testUser.id, 'Sales Team <sales@spammerdomain.net>');
    assert.equal(blockedCheck.status, 'blocked');
  });

  await t.test('5. listScreenerRules() and deleteScreenerRule()', async () => {
    const rules = await listScreenerRules(testUser.id);
    assert.ok(Array.isArray(rules));
    assert.ok(rules.length >= 2);

    const ruleToDelete = rules[0];
    const deleted = await deleteScreenerRule(testUser.id, ruleToDelete.id);
    assert.equal(deleted, true);
  });
});
