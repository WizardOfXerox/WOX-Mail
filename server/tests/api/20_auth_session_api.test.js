import test from 'node:test';
import assert from 'node:assert/strict';
import { apiRequest } from '../test_helper.js';
import { query } from '../../src/config/database.js';

test('Suite 20: REST API — Authentication, Sessions & Token Lifecycle', async (t) => {
  const testUsername = 'authtest_' + Math.floor(Math.random() * 89999 + 10000);
  const testPassword = 'SecureP@ssword2026!';
  let token = '';

  await t.test('1. POST /api/auth/register creates new permanent account', async () => {
    const inviteCode = 'INV-TEST-' + Math.floor(Math.random() * 8999 + 1000);
    await query("INSERT INTO invite_codes (code, created_at) VALUES ($1, NOW())", [inviteCode]);

    const res = await apiRequest('/api/auth/register', {
      method: 'POST',
      body: {
        username: testUsername,
        password: testPassword,
        inviteCode,
        captchaToken: 'dev-bypass',
      },
    });

    assert.equal(res.status, 201, `Registration failed: ${JSON.stringify(res.body)}`);
    assert.ok(res.body.user);
    assert.equal(res.body.user.username, testUsername);
    assert.ok(res.body.token);
  });

  await t.test('2. POST /api/auth/login authenticates user and sets secure tokens', async () => {
    const res = await apiRequest('/api/auth/login', {
      method: 'POST',
      body: {
        email: testUsername,
        password: testPassword,
      },
    });

    assert.equal(res.status, 200, `Login failed: ${JSON.stringify(res.body)}`);
    assert.ok(res.body.user);
    assert.equal(res.body.user.username, testUsername);
    token = res.body.token;
    assert.ok(token, 'Token must be present in login response');
  });

  await t.test('3. GET /api/settings/sessions returns active user device sessions', async () => {
    const res = await apiRequest('/api/settings/sessions', {
      method: 'GET',
      headers: { Authorization: `Bearer ${token}` },
    });

    assert.equal(res.status, 200);
    assert.ok(Array.isArray(res.body.sessions));
  });

  await t.test('4. POST /api/auth/logout clears session cookies', async () => {
    const res = await apiRequest('/api/auth/logout', {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}` },
    });

    assert.equal(res.status, 200);
    assert.equal(res.body.message, 'Logged out');
  });
});
