import test from 'node:test';
import assert from 'node:assert/strict';
import { apiRequest } from '../test_helper.js';
import { query } from '../../src/config/database.js';

test('Suite 22: REST API — Password Recovery & Credential Updates', async (t) => {
  const username = 'recovery_' + Math.floor(Math.random() * 89999 + 10000);
  let oldPassword = 'OldPassword123!#';
  let newPassword = 'NewPassword456!#';
  let token = '';

  await t.test('Setup: Register and login test user', async () => {
    const inviteCode = 'INV-REC-' + Math.floor(Math.random() * 8999 + 1000);
    await query("INSERT INTO invite_codes (code, created_at) VALUES ($1, NOW())", [inviteCode]);

    await apiRequest('/api/auth/register', {
      method: 'POST',
      body: { username, password: oldPassword, inviteCode, captchaToken: 'dev-bypass' },
    });

    const loginRes = await apiRequest('/api/auth/login', {
      method: 'POST',
      body: { email: username, password: oldPassword },
    });

    token = loginRes.body.token;
    assert.ok(token, 'Must receive token from login');
  });

  await t.test('1. PUT /api/settings/password updates password for logged in user', async () => {
    const res = await apiRequest('/api/settings/password', {
      method: 'PUT',
      headers: { Authorization: `Bearer ${token}` },
      body: {
        currentPassword: oldPassword,
        newPassword,
      },
    });

    assert.equal(res.status, 200);
    assert.equal(res.body.message, 'Password updated');
  });

  await t.test('2. Verify login succeeds with new password and fails with old password', async () => {
    const oldLogin = await apiRequest('/api/auth/login', {
      method: 'POST',
      body: { email: username, password: oldPassword },
    });
    assert.equal(oldLogin.status, 401);

    const newLogin = await apiRequest('/api/auth/login', {
      method: 'POST',
      body: { email: username, password: newPassword },
    });
    assert.equal(newLogin.status, 200);
  });
});
