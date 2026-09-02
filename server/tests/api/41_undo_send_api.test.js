import test from 'node:test';
import assert from 'node:assert/strict';
import { apiRequest } from '../test_helper.js';
import { query } from '../../src/config/database.js';

test('Suite 41: REST API — Undo Send Buffer & Delayed Outbound Mail Cancellation', async (t) => {
  const username = 'undosend_' + Math.floor(Math.random() * 89999 + 10000);
  const password = 'SecurePassword2026!';
  let token = '';

  await t.test('Setup: Register and login test user', async () => {
    const inviteCode = 'INV-UNDO-' + Math.floor(Math.random() * 8999 + 1000);
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
    assert.ok(token, 'Must receive auth token from login');
  });

  let activeDispatchId = '';

  await t.test('1. POST /api/mail/send with undoDelaySeconds queues email in undo buffer', async () => {
    const res = await apiRequest('/api/mail/send', {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}` },
      body: {
        to: 'target_recipient@example.com',
        subject: 'Undo Send Buffer API Test',
        text: 'This email is held in the 15-second undo buffer.',
        undoDelaySeconds: 15,
      },
    });

    assert.equal(res.status, 200);
    assert.equal(res.body.status, 'queued_undo');
    assert.equal(res.body.delaySeconds, 15);
    assert.ok(res.body.dispatchId, 'Must return dispatchId');
    activeDispatchId = res.body.dispatchId;
  });

  await t.test('2. POST /api/mail/undo-send/:dispatchId cancels pending outbound email', async () => {
    assert.ok(activeDispatchId, 'Must have active dispatchId');

    const res = await apiRequest(`/api/mail/undo-send/${activeDispatchId}`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}` },
    });

    assert.equal(res.status, 200);
    assert.equal(res.body.success, true);
    assert.match(res.body.message, /cancelled/i);
  });

  await t.test('3. POST /api/mail/undo-send/:dispatchId returns 400 for already cancelled/nonexistent dispatch', async () => {
    const res = await apiRequest(`/api/mail/undo-send/${activeDispatchId}`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}` },
    });

    assert.equal(res.status, 400);
    assert.equal(res.body.success, false);
  });
});
