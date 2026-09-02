import test from 'node:test';
import assert from 'node:assert/strict';
import { apiRequest } from '../test_helper.js';
import { authenticator } from 'otplib';
import { query } from '../../src/config/database.js';

test('Suite 21: REST API — TOTP 2FA Multi-Factor & Backup Recovery Keys', async (t) => {
  const username = 'totptest_' + Math.floor(Math.random() * 89999 + 10000);
  const password = 'StrongP@ssword2026!';
  let token = '';
  let totpSecret = '';

  await t.test('Setup: Register and login test user', async () => {
    const inviteCode = 'INV-2FA-' + Math.floor(Math.random() * 8999 + 1000);
    await query("INSERT INTO invite_codes (code, created_at) VALUES ($1, NOW())", [inviteCode]);

    await apiRequest('/api/auth/register', {
      method: 'POST',
      body: { username, password, inviteCode, captchaToken: 'dev-bypass' },
    });

    const loginRes = await apiRequest('/api/auth/login', {
      method: 'POST',
      body: { email: username, password },
    });

    token = loginRes.body.token;
    assert.ok(token, 'Must receive JWT token from login');
  });

  await t.test('1. POST /api/auth/setup-otp returns Base32 secret and QR code URI', async () => {
    const res = await apiRequest('/api/auth/setup-otp', {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}` },
    });

    assert.equal(res.status, 200);
    assert.ok(res.body.secret);
    assert.ok(res.body.qrCode);
    totpSecret = res.body.secret;
  });

  await t.test('2. POST /api/auth/confirm-otp activates 2FA with valid OTP token', async () => {
    const validCode = authenticator.generate(totpSecret);
    const res = await apiRequest('/api/auth/confirm-otp', {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}` },
      body: { code: validCode },
    });

    assert.equal(res.status, 200);
    assert.ok(Array.isArray(res.body.recoveryCodes));
    assert.equal(res.body.recoveryCodes.length, 8);
  });

  await t.test('3. DELETE /api/settings/2fa removes 2FA requirement', async () => {
    const res = await apiRequest('/api/settings/2fa', {
      method: 'DELETE',
      headers: { Authorization: `Bearer ${token}` },
      body: { password },
    });

    assert.equal(res.status, 200);
    assert.equal(res.body.message, '2FA disabled');
  });
});
