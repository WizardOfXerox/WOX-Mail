import test from 'node:test';
import assert from 'node:assert/strict';
import {
  createAppPassword,
  listAppPasswords,
  verifyAppPassword,
  revokeAppPassword,
} from '../../src/services/appPasswordService.js';
import {
  encrypt as woxauthEncrypt,
  decrypt as woxauthDecrypt,
  deriveKey as woxauthDeriveKey,
} from '../../src/services/woxauthCrypto.js';
import { getOrCreateTestUser } from '../test_helper.js';

test('Suite 13: Application Passwords & WoxAuth Cryptographic Protocol', async (t) => {
  let testUser;
  let createdAppPass;

  await t.test('Setup: Prepare test user', async () => {
    testUser = await getOrCreateTestUser('app_pass_tester', 'Pass123!#', false);
    assert.ok(testUser.id);
  });

  await t.test('1. createAppPassword() generates formatted token and stores Argon2 hash', async () => {
    createdAppPass = await createAppPassword(
      testUser.id,
      'Thunderbird on ThinkPad',
      ['smtp:send', 'imap:read']
    );

    assert.ok(createdAppPass.id);
    assert.ok(createdAppPass.token.startsWith('wox_app_'));
    assert.equal(createdAppPass.name, 'Thunderbird on ThinkPad');
    assert.deepEqual(createdAppPass.scopes, ['smtp:send', 'imap:read']);
  });

  await t.test('2. listAppPasswords() returns metadata without revealing raw token', async () => {
    const list = await listAppPasswords(testUser.id);
    assert.ok(Array.isArray(list));
    assert.ok(list.length >= 1);
    const found = list.find((p) => p.id === createdAppPass.id);
    assert.ok(found);
    assert.equal(found.name, 'Thunderbird on ThinkPad');
    assert.ok(!found.token, 'Raw token must never be returned in listing');
  });

  await t.test('3. verifyAppPassword() authenticates valid client credentials', async () => {
    const verified = await verifyAppPassword(createdAppPass.token, { ip: '192.168.1.100' });
    assert.ok(verified, 'Verification must succeed for valid token');
    assert.equal(verified.user.id, testUser.id);
    assert.equal(verified.user.email, testUser.email);
    assert.deepEqual(verified.scopes, ['smtp:send', 'imap:read']);

    // Invalid token returns null
    const invalidVerify = await verifyAppPassword('wox_app_invalid-fake-token-0000');
    assert.equal(invalidVerify, null);
  });

  await t.test('4. revokeAppPassword() deletes credential and prevents future auth', async () => {
    const revoked = await revokeAppPassword(testUser.id, createdAppPass.id);
    assert.equal(revoked, true);

    const postRevokeVerify = await verifyAppPassword(createdAppPass.token);
    assert.equal(postRevokeVerify, null, 'Revoked token must not authenticate');
  });

  await t.test('5. WoxAuth client-derived PBKDF2 key and AES-256-GCM TOTP secret encryption', async () => {
    const rawTotpSecret = 'JBSWY3DPEHPK3PXP'; // Base32 test secret
    const derivedKey = await woxauthDeriveKey('MasterAuthPassword2026', 'user@wox.world');

    const encrypted = woxauthEncrypt(rawTotpSecret, derivedKey);
    assert.ok(encrypted.ciphertext);
    assert.ok(encrypted.iv);
    assert.ok(encrypted.tag);

    const decrypted = woxauthDecrypt(encrypted.ciphertext, encrypted.iv, encrypted.tag, derivedKey);
    assert.equal(decrypted, rawTotpSecret, 'Decrypted TOTP secret must match original Base32');
  });
});
