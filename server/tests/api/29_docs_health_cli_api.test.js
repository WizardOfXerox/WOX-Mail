import test from 'node:test';
import assert from 'node:assert/strict';
import { apiRequest } from '../test_helper.js';

test('Suite 29: REST API — OpenAPI 3.1.0 Schema, System Health & CLI API', async (t) => {
  await t.test('1. GET /api/health returns system uptime and service statuses', async () => {
    const res = await apiRequest('/api/health');

    assert.equal(res.status, 200);
    assert.equal(res.body.status, 'ok');
    assert.equal(typeof res.body.uptime, 'number');
    assert.equal(res.body.services.database, 'ok');
  });

  await t.test('2. GET /api/docs/openapi.json returns valid OpenAPI 3.1.0 specification', async () => {
    const res = await apiRequest('/api/docs/openapi.json');

    assert.equal(res.status, 200);
    assert.ok(res.body.openapi.startsWith('3.'));
    assert.ok(res.body.info.title.includes('WoxMail'));
    assert.ok(res.body.paths['/api/auth/login']);
    assert.ok(res.body.paths['/api/tempmail/generate']);
    assert.ok(res.body.paths['/api/mail/messages']);
  });
});
