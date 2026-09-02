import test from 'node:test';
import assert from 'node:assert/strict';
import {
  generateRandomUsername,
  formatRelativeDate,
  formatFileSize,
  parsePagination,
  paginationMeta,
  parseEmailAddress,
} from '../../src/utils/helpers.js';
import {
  encryptPayload,
  decryptPayload,
  hashPassword,
  verifyPassword,
  generateToken,
  generateUrlSafeToken,
  generateRecoveryCodes,
  timingSafeEqual,
} from '../../src/utils/crypto.js';

test('Suite 01: Core Utilities & Cryptographic Invariants', async (t) => {
  await t.test('1. generateRandomUsername() guarantees 100% alphanumeric usernames (Zero Subaddressing Dots/Symbols)', () => {
    const iterations = 1000;
    const alphanumericRegex = /^[a-z0-9]+$/;

    for (let i = 0; i < iterations; i++) {
      const username = generateRandomUsername();
      assert.ok(
        alphanumericRegex.test(username),
        `Generated username "${username}" contains forbidden symbols that would trigger Purelymail subaddressing bounce!`
      );
      assert.ok(username.length >= 3, `Username "${username}" is too short (<3 chars)`);
      assert.ok(username.length <= 40, `Username "${username}" is too long (>40 chars)`);
    }
  });

  await t.test('2. AES-256-GCM symmetric encryption and decryption with authentication tag integrity', () => {
    const secretMessage = 'Sovereign confidential payload #01172006';
    const passphrase = 'MasterEnclavePassphrase2026';
    const encrypted = encryptPayload(secretMessage, passphrase);

    assert.ok(typeof encrypted === 'string', 'Encrypted output should be a string');
    assert.equal(encrypted.split(':').length, 4, 'Encrypted output should format salt:iv:tag:ciphertext');

    const decrypted = decryptPayload(encrypted, passphrase);
    assert.equal(decrypted, secretMessage, 'Decrypted text should match original plaintext');

    // Wrong passphrase test
    const wrongKeyDecrypted = decryptPayload(encrypted, 'WrongPassphrase123');
    assert.equal(wrongKeyDecrypted, null, 'Wrong passphrase should return null');

    // Tampering test: modify 1 byte of ciphertext
    const parts = encrypted.split(':');
    const tamperedCipher = parts[3].slice(0, -2) + 'aa';
    const tamperedString = `${parts[0]}:${parts[1]}:${parts[2]}:${tamperedCipher}`;
    assert.equal(decryptPayload(tamperedString, passphrase), null, 'Tampered ciphertext must fail GCM auth');
  });

  await t.test('3. Argon2id password hashing and constant-time verification', async () => {
    const rawPass = 'UltraSecure#P@ssword2026';
    const hashed = await hashPassword(rawPass);

    assert.ok(typeof hashed === 'string');
    assert.ok(hashed.startsWith('$argon2'), 'Hash must be valid Argon2 format');

    const isValid = await verifyPassword(hashed, rawPass);
    assert.equal(isValid, true, 'Valid password must verify true');

    const isWrong = await verifyPassword(hashed, 'WrongPassword123!');
    assert.equal(isWrong, false, 'Wrong password must verify false');
  });

  await t.test('4. Secure random tokens, base64url tokens, and recovery codes', () => {
    const token32 = generateToken(32);
    assert.equal(token32.length, 64, '32 bytes hex should be 64 characters');

    const urlToken = generateUrlSafeToken(32);
    assert.ok(urlToken.length > 30);
    assert.doesNotMatch(urlToken, /[+/=]/, 'Base64url must not contain standard base64 symbols');

    const recoveryCodes = generateRecoveryCodes();
    assert.equal(recoveryCodes.length, 8, 'Must generate 8 recovery backup codes');
    for (const code of recoveryCodes) {
      assert.equal(code.length, 10, 'Each recovery code must be 10 characters');
    }

    assert.equal(timingSafeEqual('constant_time_secret', 'constant_time_secret'), true);
    assert.equal(timingSafeEqual('constant_time_secret', 'different_str_length'), false);
  });

  await t.test('5. Human-readable formatters & Pagination helpers', () => {
    assert.equal(formatFileSize(0), '0 B');
    assert.equal(formatFileSize(1024), '1.0 KB');
    assert.equal(formatFileSize(1024 * 1024 * 5), '5.0 MB');

    assert.equal(formatRelativeDate(new Date()), 'Just now');

    const parsedEmail = parseEmailAddress('Sovereign User <user@wox.world>');
    assert.equal(parsedEmail.name, 'Sovereign User');
    assert.equal(parsedEmail.address, 'user@wox.world');

    const pagination = parsePagination({ page: '2', limit: '10' });
    assert.equal(pagination.page, 2);
    assert.equal(pagination.limit, 10);
    assert.equal(pagination.offset, 10);

    const meta = paginationMeta(55, 2, 10);
    assert.equal(meta.totalPages, 6);
    assert.equal(meta.hasNext, true);
    assert.equal(meta.hasPrev, true);
  });
});
