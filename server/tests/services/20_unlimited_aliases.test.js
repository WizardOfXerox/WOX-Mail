import { describe, it, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { query } from '../../src/config/database.js';
import { createAlias, listAliases, deleteAlias } from '../../src/services/aliasManager.js';

describe('Unlimited Email Aliases Test Suite', () => {
  let testUserId;
  let testUserEmail;
  const createdAliasIds = [];

  before(async () => {
    const username = `unlimited_alias_user_${Math.floor(Math.random() * 90000 + 10000)}`;
    testUserEmail = `${username}@wox.world`;
    const res = await query(
      `INSERT INTO users (username, email, password_hash)
       VALUES ($1, $2, $3)
       RETURNING id`,
      [username, testUserEmail, '$argon2id$dummyhash']
    );
    testUserId = res.rows[0].id;
  });

  after(async () => {
    if (testUserId) {
      await query('DELETE FROM email_aliases WHERE user_id = $1', [testUserId]);
      await query('DELETE FROM users WHERE id = $1', [testUserId]);
    }
  });

  it('should allow generating more than 10 aliases without restriction', async () => {
    // Generate 15 aliases in succession
    for (let i = 1; i <= 15; i++) {
      const alias = await createAlias(
        testUserId,
        testUserEmail,
        `Newsletter Batch ${i}`,
        i % 2 === 0 ? 'random' : 'words'
      );
      assert.ok(alias.id);
      assert.ok(alias.alias_address);
      createdAliasIds.push(alias.id);
    }

    const aliases = await listAliases(testUserId);
    assert.equal(aliases.length, 15);
  });

  it('should list all 15 aliases with forwarding metadata', async () => {
    const aliases = await listAliases(testUserId);
    assert.ok(aliases.length >= 15);
    assert.ok(aliases.every((a) => a.alias_address.includes('@')));
  });

  it('should allow individual alias deletion', async () => {
    if (createdAliasIds.length > 0) {
      const idToDelete = createdAliasIds[0];
      const res = await deleteAlias(testUserId, idToDelete);
      assert.equal(res, true);

      const remaining = await listAliases(testUserId);
      assert.equal(remaining.length, 14);
    }
  });
});
