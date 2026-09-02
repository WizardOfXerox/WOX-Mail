import test from 'node:test';
import assert from 'node:assert/strict';
import { checkSender, refreshFilterCache } from '../../src/services/serviceFilter.js';
import {
  generateReverseToken,
  getOrCreateReverseAlias,
  lookupReverseAlias,
  listReverseAliases,
} from '../../src/services/reverseAliasService.js';
import { getOrCreateTestUser } from '../test_helper.js';

test('Suite 06: Service Tier Filters & Reverse Alias Routing Engine', async (t) => {
  let testUser;

  await t.test('Setup: Get or create test user for reverse aliases', async () => {
    testUser = await getOrCreateTestUser('test_reverse_user', 'Pass123!#', false);
    assert.ok(testUser.id);
  });

  await t.test('1. checkSender() evaluates sender domain against recipient tier controls', async () => {
    await refreshFilterCache();

    // Legitimate regular sender
    const regular = await checkSender('newsletter@validdomain.com', 'public');
    assert.equal(typeof regular.allowed, 'boolean');

    // Permanent tier should allow communications
    const permCheck = await checkSender('billing@stripe.com', 'permanent');
    assert.equal(permCheck.allowed, true);
  });

  await t.test('2. generateReverseToken() generates deterministic masked address', () => {
    const token1 = generateReverseToken(testUser.id, 'shopping99@mail.wox.world', 'support@amazon.com');
    const token2 = generateReverseToken(testUser.id, 'shopping99@mail.wox.world', 'support@amazon.com');

    assert.ok(token1.startsWith('ra_'));
    assert.ok(token1.includes('@'));
    assert.equal(token1, token2, 'Deterministic inputs must produce identical reverse alias token');

    const differentRecipientToken = generateReverseToken(testUser.id, 'shopping99@mail.wox.world', 'support@ebay.com');
    assert.notEqual(token1, differentRecipientToken, 'Different recipient must produce distinct reverse token');
  });

  await t.test('3. getOrCreateReverseAlias() and lookupReverseAlias() bidirectional resolution', async () => {
    const aliasAddress = 'discreet_alias@mail.wox.world';
    const externalEmail = 'merchant_partner@example.com';

    // 1. Create mapping
    const created = await getOrCreateReverseAlias(testUser.id, aliasAddress, externalEmail);
    assert.ok(created.reverseToken.startsWith('ra_'));
    assert.equal(created.aliasAddress, aliasAddress);
    assert.equal(created.externalEmail, externalEmail);

    // 2. Lookup mapping from the reverse token
    const resolved = await lookupReverseAlias(created.reverseToken);
    assert.ok(resolved, 'Must resolve reverse alias record');
    assert.equal(resolved.userId, testUser.id);
    assert.equal(resolved.aliasAddress, aliasAddress);
    assert.equal(resolved.externalEmail, externalEmail);

    // 3. Invalid token returns null
    const notFound = await lookupReverseAlias('ra_000000000000@wox.world');
    assert.equal(notFound, null);
  });

  await t.test('4. listReverseAliases() lists active reverse mappings for user', async () => {
    const list = await listReverseAliases(testUser.id);
    assert.ok(Array.isArray(list));
    assert.ok(list.length > 0);
    assert.ok(list.some((r) => r.alias_address === 'discreet_alias@mail.wox.world'));
  });
});

