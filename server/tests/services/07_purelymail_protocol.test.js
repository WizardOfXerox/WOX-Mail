import test from 'node:test';
import assert from 'node:assert/strict';
import '../test_helper.js';
import { createUser, deleteUser, listUser } from '../../src/services/purelymail.js';

test('Suite 07: Purelymail Protocol & Symbolic Subaddressing Prevention', async (t) => {
  const testMailbox = 'testautouser' + Math.floor(Math.random() * 89999 + 10000) + '@mail.wox.world';
  const testPassword = 'TestPass!#987654321';

  await t.test('1. createUser() creates alphanumeric mailbox on Purelymail', async () => {
    const result = await createUser(testMailbox, testPassword);
    assert.ok(result, 'Must return response object from Purelymail API');
    assert.equal(result.type, 'success', `Expected success, got: ${JSON.stringify(result)}`);
  });

  await t.test('2. listUser() verifies provisioned mailbox exists on Purelymail', async () => {
    const listRes = await listUser(testMailbox);
    assert.equal(listRes.type, 'success');
    assert.ok(Array.isArray(listRes.result?.users));
    assert.ok(
      listRes.result.users.includes(testMailbox),
      `Provisioned mailbox ${testMailbox} not found in Purelymail active user list`
    );
  });

  await t.test('3. deleteUser() idempotently deletes mailbox using full-email payload', async () => {
    const delResult = await deleteUser(testMailbox);
    assert.equal(delResult.type, 'success');

    // Second deletion of already deleted user must be idempotent and succeed without throwing
    const idempotentDel = await deleteUser(testMailbox);
    assert.equal(idempotentDel.type, 'success');
  });
});
