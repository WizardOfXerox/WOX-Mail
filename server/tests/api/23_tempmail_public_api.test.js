import test from 'node:test';
import assert from 'node:assert/strict';
import { apiRequest } from '../test_helper.js';

test('Suite 23: REST API — Public Temp Mail & Real-Time Influx Pipeline', async (t) => {
  let tempAddress = '';

  await t.test('1. POST /api/tempmail/generate claims instant standby mailbox', async () => {
    const res = await apiRequest('/api/tempmail/generate', {
      method: 'POST',
      body: {
        mode: 'pool',
        captchaToken: 'dev-bypass',
      },
    });

    assert.equal(res.status, 201, `Generate temp mail failed: ${JSON.stringify(res.body)}`);
    assert.ok(res.body.address.includes('@mail.wox.world'));
    assert.equal(res.body.tier, 'public');
    tempAddress = res.body.address;
  });

  await t.test('2. GET /api/tempmail/status/:address retrieves active mailbox status and TTL', async () => {
    const res = await apiRequest(`/api/tempmail/status/${encodeURIComponent(tempAddress)}`);

    assert.equal(res.status, 200);
    assert.equal(res.body.address, tempAddress);
    assert.equal(res.body.status, 'active');
    assert.ok(typeof res.body.remainingMs === 'number');
  });

  await t.test('3. GET /api/tempmail/inbox/:address fetches sanitized messages for temp address', async () => {
    const res = await apiRequest(`/api/tempmail/inbox/${encodeURIComponent(tempAddress)}`);

    assert.equal(res.status, 200);
    assert.equal(res.body.address, tempAddress);
    assert.ok(Array.isArray(res.body.messages));
  });

  await t.test('4. DELETE /api/tempmail/delete/:address incinerates temp mailbox immediately', async () => {
    const res = await apiRequest(`/api/tempmail/delete/${encodeURIComponent(tempAddress)}`, {
      method: 'DELETE',
    });

    assert.equal(res.status, 200);
    assert.equal(res.body.message, 'Mailbox deleted');
  });
});
