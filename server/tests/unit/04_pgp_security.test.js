import test from 'node:test';
import assert from 'node:assert/strict';
import * as openpgp from 'openpgp';
import { generateKeyPair, validatePublicKey, encryptMessage } from '../../src/services/pgpService.js';

test('Suite 04: OpenPGP Sovereign Cryptography & Key Management', async (t) => {
  let testKeyPair;

  await t.test('1. Generates Curve25519 ECC OpenPGP keypair with correct user ID', async () => {
    testKeyPair = await generateKeyPair('Sovereign Enclave', 'enclave@wox.world');

    assert.ok(testKeyPair.publicKey.includes('BEGIN PGP PUBLIC KEY BLOCK'));
    assert.ok(testKeyPair.privateKey.includes('BEGIN PGP PRIVATE KEY BLOCK'));
    assert.ok(typeof testKeyPair.fingerprint === 'string' && testKeyPair.fingerprint.length > 20);
  });

  await t.test('2. Validates ASCII-armored public key and extracts metadata', async () => {
    const meta = await validatePublicKey(testKeyPair.publicKey);

    assert.equal(meta.valid, true);
    assert.equal(meta.fingerprint, testKeyPair.fingerprint);
    assert.ok(meta.userIds.some((u) => u.includes('enclave@wox.world')));
    assert.ok(meta.createdAt instanceof Date);
  });

  await t.test('3. Encrypts message with PGP public key and decrypts with private key', async () => {
    const secretContent = 'TOP SECRET ENCLAVE MESSAGE: Zero-Knowledge Privacy Guaranteed.';
    const armoredEncrypted = await encryptMessage(secretContent, testKeyPair.publicKey);

    assert.ok(armoredEncrypted.includes('BEGIN PGP MESSAGE'));
    assert.ok(!armoredEncrypted.includes(secretContent), 'Plaintext must not appear in armored output');

    // Decrypt using openpgp directly
    const privateKey = await openpgp.readPrivateKey({ armoredKey: testKeyPair.privateKey });
    const message = await openpgp.readMessage({ armoredMessage: armoredEncrypted });
    const { data: decrypted } = await openpgp.decrypt({
      message,
      decryptionKeys: privateKey,
    });

    assert.equal(decrypted, secretContent, 'Decrypted content must match original plaintext');
  });

  await t.test('4. Rejects invalid and corrupted PGP keys with descriptive errors', async () => {
    await assert.rejects(
      async () => validatePublicKey('Not a valid PGP key string'),
      /Invalid PGP key format/
    );

    await assert.rejects(
      async () => validatePublicKey('-----BEGIN PGP PUBLIC KEY BLOCK-----\ncorrupted_data\n-----END PGP PUBLIC KEY BLOCK-----'),
      /Failed to parse PGP public key/
    );
  });
});
