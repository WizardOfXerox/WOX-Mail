import test from 'node:test';
import assert from 'node:assert/strict';
import { apiRequest } from '../test_helper.js';
import { query } from '../../src/config/database.js';

test('Suite 25: REST API — Webmail Client Operations & Search Query Engine', async (t) => {
  const username = 'webmail_user_' + Math.floor(Math.random() * 89999 + 10000);
  const password = 'WebmailPassword123!#';
  let token = '';

  await t.test('Setup: Register and login test user', async () => {
    const inviteCode = 'INV-MAIL-' + Math.floor(Math.random() * 8999 + 1000);
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
    assert.ok(token, 'Must receive token from login');
  });

  await t.test('1. GET /api/mail/folders returns system and virtual folders', async () => {
    const res = await apiRequest('/api/mail/folders', {
      method: 'GET',
      headers: { Authorization: `Bearer ${token}` },
    });

    assert.equal(res.status, 200);
    assert.ok(Array.isArray(res.body.folders));
    assert.ok(res.body.folders.length >= 4);
    assert.ok(res.body.folders.some((f) => f.name === 'INBOX' || f.name === 'Starred'));
  });

  await t.test('2. POST /api/mail/search performs full-text query over user mailbox', async () => {
    const res = await apiRequest('/api/mail/search', {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}` },
      body: {
        query: 'security invoice',
        folder: 'INBOX',
      },
    });

    assert.equal(res.status, 200);
    assert.ok(Array.isArray(res.body.results));
    assert.equal(typeof res.body.total, 'number');
  });
});
