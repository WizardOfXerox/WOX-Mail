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

  await t.test('4. POST /api/admin/diagnostics/flush-cache clears in-memory and redis cache buffers', async () => {
    const res = await apiRequest('/api/admin/diagnostics/flush-cache', {
      method: 'POST',
      headers: { Authorization: `Bearer ${adminToken}` },
    });

    assert.equal(res.status, 200);
    assert.equal(res.body.success, true);
    assert.ok(typeof res.body.memoryKeysCleared === 'number');
    assert.ok(typeof res.body.redisFlushed === 'boolean');
  });

  await t.test('5. GET /api/admin/domains and POST /api/admin/domains/dkim-generate', async () => {
    const listRes = await apiRequest('/api/admin/domains', {
      method: 'GET',
      headers: { Authorization: `Bearer ${adminToken}` },
    });
    assert.equal(listRes.status, 200);
    assert.ok(Array.isArray(listRes.body.domains));

    const dkimRes = await apiRequest('/api/admin/domains/dkim-generate', {
      method: 'POST',
      headers: { Authorization: `Bearer ${adminToken}` },
      body: { domain: 'wox.world', selector: 'woxmail' },
    });
    assert.equal(dkimRes.status, 200);
    assert.ok(dkimRes.body.dnsRecord.startsWith('v=DKIM1;'));
    assert.ok(dkimRes.body.publicKey);
  });

  await t.test('6. GET /api/admin/queue and POST /api/admin/queue/flush', async () => {
    const queueRes = await apiRequest('/api/admin/queue', {
      method: 'GET',
      headers: { Authorization: `Bearer ${adminToken}` },
    });
    assert.equal(queueRes.status, 200);
    assert.ok(Array.isArray(queueRes.body.jobs));
    assert.ok(typeof queueRes.body.stats === 'object');

    const flushRes = await apiRequest('/api/admin/queue/flush', {
      method: 'POST',
      headers: { Authorization: `Bearer ${adminToken}` },
    });
    assert.equal(flushRes.status, 200);
    assert.equal(flushRes.body.success, true);
  });

  await t.test('7. GET /api/admin/quarantine returns holding bay entries', async () => {
    const res = await apiRequest('/api/admin/quarantine', {
      method: 'GET',
      headers: { Authorization: `Bearer ${adminToken}` },
    });
    assert.equal(res.status, 200);
    assert.ok(Array.isArray(res.body.screenerRules));
  });

  await t.test('8. GET /api/admin/ediscovery returns compliance archive search results', async () => {
    const res = await apiRequest('/api/admin/ediscovery?limit=10', {
      method: 'GET',
      headers: { Authorization: `Bearer ${adminToken}` },
    });
    assert.equal(res.status, 200);
    assert.ok(Array.isArray(res.body.messages));
    assert.ok(typeof res.body.pagination === 'object');
  });

  await t.test('9. GET /api/admin/governance and PUT /api/admin/governance', async () => {
    const getRes = await apiRequest('/api/admin/governance', {
      method: 'GET',
      headers: { Authorization: `Bearer ${adminToken}` },
    });
    assert.equal(getRes.status, 200);
    assert.ok(getRes.body.policy);

    const putRes = await apiRequest('/api/admin/governance', {
      method: 'PUT',
      headers: { Authorization: `Bearer ${adminToken}` },
      body: {
        ...getRes.body.policy,
        outbound_rate_limit_per_hour: 120,
      },
    });
    assert.equal(putRes.status, 200);
    assert.equal(putRes.body.success, true);
  });

  await t.test('10. GET /api/admin/storage returns database and quota metrics', async () => {
    const res = await apiRequest('/api/admin/storage', {
      method: 'GET',
      headers: { Authorization: `Bearer ${adminToken}` },
    });
    assert.equal(res.status, 200);
    assert.ok(res.body.database);
    assert.ok(Array.isArray(res.body.tables));
    assert.ok(Array.isArray(res.body.topUsers));
  });
});
