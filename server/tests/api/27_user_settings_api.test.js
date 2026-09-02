import test from 'node:test';
import assert from 'node:assert/strict';
import { apiRequest } from '../test_helper.js';
import { query } from '../../src/config/database.js';

test('Suite 27: REST API — User Preferences, App Passwords & Security Settings', async (t) => {
  const username = 'settings_user_' + Math.floor(Math.random() * 89999 + 10000);
  const password = 'SettingsPass123!#';
  let token = '';

  await t.test('Setup: Register and login test user', async () => {
    const inviteCode = 'INV-SET-' + Math.floor(Math.random() * 8999 + 1000);
    await query("INSERT INTO invite_codes (code, created_at) VALUES ($1, NOW())", [inviteCode]);

    await apiRequest('/api/auth/register', {
      method: 'POST',
      body: { username, password, inviteCode, captchaToken: 'dev-bypass' },
    });

    const loginRes = await apiRequest('/api/auth/login', {
      method: 'POST',
      body: { email: username, password },
    });

    token = loginRes.body?.token;
    assert.ok(token, 'Must receive JWT token from login response');
  });

  await t.test('1. GET /api/settings/profile returns user profile and preferences', async () => {
    const res = await apiRequest('/api/settings/profile', {
      method: 'GET',
      headers: { Authorization: `Bearer ${token}` },
    });

    assert.equal(res.status, 200);
    assert.ok(res.body.user);
    assert.equal(res.body.user.username, username);
  });

  await t.test('2. PUT /api/settings/profile updates user timezone and language', async () => {
    const res = await apiRequest('/api/settings/profile', {
      method: 'PUT',
      headers: { Authorization: `Bearer ${token}` },
      body: {
        displayName: 'Sovereign Officer',
        language: 'en',
        timezone: 'UTC',
      },
    });

    assert.equal(res.status, 200);
    assert.ok(res.body.user || res.body.message);
  });

  await t.test('3. POST /api/settings/app-passwords creates new app credential', async () => {
    const res = await apiRequest('/api/settings/app-passwords', {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}` },
      body: {
        name: 'Mutt Terminal Client',
        scopes: ['smtp:send', 'imap:read'],
      },
    });

    assert.equal(res.status, 201);
    assert.ok(res.body.appPassword);
    assert.ok(res.body.appPassword.token.startsWith('wox_app_'));
  });

  await t.test('4. GET /api/settings/app-passwords lists active app passwords', async () => {
    const res = await apiRequest('/api/settings/app-passwords', {
      method: 'GET',
      headers: { Authorization: `Bearer ${token}` },
    });

    assert.equal(res.status, 200);
    assert.ok(Array.isArray(res.body.appPasswords));
    assert.ok(res.body.appPasswords.some((p) => p.name === 'Mutt Terminal Client'));
  });
});
