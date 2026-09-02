import test from 'node:test';
import assert from 'node:assert/strict';
import '../test_helper.js';
import * as passkeyService from '../../src/services/passkeyService.js';
import { query } from '../../src/config/database.js';

test('Suite 36: Unit — WebAuthn FIDO2 Passkeys & Biometric Challenge Protocol', async (t) => {
  const dummyUser = {
    id: Math.floor(Math.random() * 89999 + 10000),
    email: 'passkey_test@wox.world',
    username: 'passkey_user',
    display_name: 'Passkey Test User',
  };

  await t.test('1. getRPConfig returns valid relying party domain and expected origins', () => {
    const config = passkeyService.getRPConfig();
    assert.ok(config.rpID, 'Must provide rpID');
    assert.ok(config.rpName.includes('WoxMail'));
    assert.ok(Array.isArray(config.expectedOrigins));
    assert.ok(config.expectedOrigins.length >= 2);
  });

  await t.test('2. getRegistrationOptions generates high-entropy challenge and user descriptor', async () => {
    const options = await passkeyService.getRegistrationOptions(dummyUser);

    assert.ok(options.challenge, 'Must generate cryptographic challenge');
    assert.equal(options.rp.name, 'WoxMail Sovereign Privacy Suite');
    assert.equal(options.user.name, dummyUser.email);
    assert.ok(options.pubKeyCredParams.length > 0, 'Must provide supported public key algorithms');
    assert.equal(options.authenticatorSelection.residentKey, 'preferred');
  });

  await t.test('3. getAuthenticationOptions generates login challenge and session key', async () => {
    const { options, challengeSessionId } = await passkeyService.getAuthenticationOptions(dummyUser.email);

    assert.ok(options.challenge, 'Must return login challenge');
    assert.ok(challengeSessionId.startsWith('passkey_auth_'));
    assert.equal(options.userVerification, 'preferred');
  });
});
