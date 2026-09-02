import test from 'node:test';
import assert from 'node:assert/strict';
import { apiRequest } from '../test_helper.js';
import { query } from '../../src/config/database.js';

test('Suite 40: REST API — WebAuthn Passkeys Endpoints & Hardware Token Management', async (t) => {
  const username = 'passkey_api_' + Math.floor(Math.random() * 89999 + 10000);
  const password = 'SecurePasskeyPassword2026!';
  let token = '';
  let userId = null;

  await t.test('Setup: Register and login test user', async () => {
    const inviteCode = 'INV-PASSKEY-' + Math.floor(Math.random() * 8999 + 1000);
    await query("INSERT INTO invite_codes (code, created_at) VALUES ($1, NOW())", [inviteCode]);

    const regRes = await apiRequest('/api/auth/register', {
      method: 'POST',
      body: { username, password, inviteCode, captchaToken: 'dev-bypass' },
    });

    userId = regRes.body.user.id;

    const loginRes = await apiRequest('/api/auth/login', {
      method: 'POST',
      body: { email: username, password },
    });

    token = loginRes.body.token;
    assert.ok(token, 'Must receive auth token from login');
  });

  await t.test('1. POST /api/auth/passkeys/register-options generates challenge for user', async () => {
    const res = await apiRequest('/api/auth/passkeys/register-options', {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}` },
    });

    assert.equal(res.status, 200);
    assert.ok(res.body.challenge, 'Must return registration challenge');
    assert.equal(res.body.rp.name, 'WoxMail Sovereign Privacy Suite');
    assert.ok(Array.isArray(res.body.pubKeyCredParams));
  });

  await t.test('2. POST /api/auth/passkeys/login-options generates challenge for public login', async () => {
    const res = await apiRequest('/api/auth/passkeys/login-options', {
      method: 'POST',
      body: { email: username },
    });

    assert.equal(res.status, 200);
    assert.ok(res.body.options.challenge, 'Must return authentication challenge');
    assert.ok(res.body.challengeSessionId, 'Must return challengeSessionId');
  });

  let dummyPasskeyId = null;

  await t.test('3. Mock insert passkey and verify GET /api/settings/passkeys/list', async () => {
    // Insert a dummy hardware token into database
    const insertRes = await query(
      `INSERT INTO user_passkeys (user_id, credential_id, public_key, counter, device_name)
       VALUES ($1, $2, $3, 0, 'YubiKey 5 NFC Test')
       RETURNING id`,
      [userId, 'mock-credential-id-' + Math.random(), Buffer.from('mock-public-key')]
    );

    dummyPasskeyId = insertRes.rows[0].id;

    const listRes = await apiRequest('/api/settings/passkeys/list', {
      method: 'GET',
      headers: { Authorization: `Bearer ${token}` },
    });

    assert.equal(listRes.status, 200);
    assert.ok(Array.isArray(listRes.body.passkeys));
    assert.ok(listRes.body.passkeys.length >= 1);
    assert.equal(listRes.body.passkeys[0].device_name, 'YubiKey 5 NFC Test');
  });

  await t.test('4. DELETE /api/settings/passkeys/:id revokes registered passkey', async () => {
    assert.ok(dummyPasskeyId);

    const deleteRes = await apiRequest(`/api/settings/passkeys/${dummyPasskeyId}`, {
      method: 'DELETE',
      headers: { Authorization: `Bearer ${token}` },
    });

    assert.equal(deleteRes.status, 200);
    assert.equal(deleteRes.body.message, 'Passkey removed successfully');

    // Verify it is removed from list
    const listAfter = await apiRequest('/api/settings/passkeys/list', {
      method: 'GET',
      headers: { Authorization: `Bearer ${token}` },
    });

    assert.equal(listAfter.body.passkeys.length, 0);
  });
});
