import test from 'node:test';
import assert from 'node:assert/strict';
import { apiRequest } from '../test_helper.js';

test('Suite 28: REST API — Root Admin Command Center & Metrics API', async (t) => {
  let adminToken = '';
  const adminPassword = (process.env.ADMIN_PASSWORD || 'woxmail_admin_secret_2026').replace(/^['"]|['"]$/g, '');
  const adminEmail = process.env.ADMIN_EMAIL || 'admin@wox.world';

  await t.test('Setup: Login as root administrator', async () => {
    const loginRes = await apiRequest('/api/auth/login', {
      method: 'POST',
      body: {
        email: adminEmail,
        password: adminPassword,
      },
    });

    assert.equal(loginRes.status, 200, `Admin login failed: ${JSON.stringify(loginRes.body)}`);
    assert.ok(loginRes.body.token, 'Must receive token for admin session');
    adminToken = loginRes.body.token;
  });

  await t.test('1. GET /api/admin/overview returns cluster analytics and metrics', async () => {
    const res = await apiRequest('/api/admin/overview', {
      method: 'GET',
      headers: { Authorization: `Bearer ${adminToken}` },
    });

    assert.equal(res.status, 200);
    assert.ok(res.body.users !== undefined || res.body.pool !== undefined);
  });

  await t.test('2. POST /api/admin/invites creates single-use invite codes', async () => {
    const res = await apiRequest('/api/admin/invites', {
      method: 'POST',
      headers: { Authorization: `Bearer ${adminToken}` },
      body: {
        count: 2,
        expiresInDays: 30,
        note: 'Admin Test Invite',
      },
    });

    assert.equal(res.status, 201);
    assert.ok(Array.isArray(res.body.codes));
    assert.equal(res.body.codes.length, 2);
  });

  await t.test('3. GET /api/admin/pool returns standby pool status', async () => {
    const res = await apiRequest('/api/admin/pool', {
      method: 'GET',
      headers: { Authorization: `Bearer ${adminToken}` },
    });

    assert.equal(res.status, 200);
    assert.ok(res.body.pool !== undefined);
  });
});
