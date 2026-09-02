import test from 'node:test';
import assert from 'node:assert/strict';
import { apiRequest } from '../test_helper.js';

test('Suite 24: REST API — Personal Temp Mail Password-Protected Vault', async (t) => {
  const customHandle = 'personalvault' + Math.floor(Math.random() * 8999 + 1000);
  const password = 'PersonalSecurePass2026!';
  let fullAddress = '';

  await t.test('1. POST /api/tempmail/personal/create provisions password-locked personal temp mail', async () => {
    const res = await apiRequest('/api/tempmail/personal/create', {
      method: 'POST',
      body: {
        username: customHandle,
        password,
        expiryHours: 720,
        captchaToken: 'dev-bypass',
      },
    });

    assert.equal(res.status, 201, `Personal temp mail creation failed: ${JSON.stringify(res.body)}`);
    assert.ok(res.body.address.startsWith(customHandle));
    assert.equal(res.body.tier, 'personal');
    fullAddress = res.body.address;
  });

  await t.test('2. POST /api/tempmail/personal/login re-authenticates to personal temp mail vault', async () => {
    const res = await apiRequest('/api/tempmail/personal/login', {
      method: 'POST',
      body: {
        address: fullAddress,
        password,
      },
    });

    assert.equal(res.status, 200);
    assert.equal(res.body.address, fullAddress);
  });

  await t.test('3. DELETE /api/tempmail/delete/:address removes personal temp mailbox', async () => {
    const res = await apiRequest(`/api/tempmail/delete/${encodeURIComponent(fullAddress)}`, {
      method: 'DELETE',
    });

    assert.equal(res.status, 200);
    assert.equal(res.body.message, 'Mailbox deleted');
  });
});
