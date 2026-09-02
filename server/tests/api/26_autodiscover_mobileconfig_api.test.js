import test from 'node:test';
import assert from 'node:assert/strict';
import { apiRequest } from '../test_helper.js';

test('Suite 26: REST API — Autodiscover, Thunderbird & Apple iOS MobileConfig XML', async (t) => {
  await t.test('1. GET /autodiscover/autodiscover.xml returns valid Microsoft Outlook XML schema', async () => {
    const res = await apiRequest('/autodiscover/autodiscover.xml?email=user@wox.world');

    assert.equal(res.status, 200);
    assert.ok(typeof res.body === 'string');
    assert.ok(res.body.includes('<Autodiscover xmlns=') || res.body.includes('Response'));
    assert.ok(res.body.includes('imap.purelymail.com') || res.body.includes('mail.wox.world'));
    assert.ok(res.body.includes('smtp.purelymail.com') || res.body.includes('mail.wox.world'));
  });

  await t.test('2. GET /mail/config-v1.1.xml returns valid Mozilla Thunderbird XML schema', async () => {
    const res = await apiRequest('/mail/config-v1.1.xml?emailaddress=user@wox.world');

    assert.equal(res.status, 200);
    assert.ok(typeof res.body === 'string');
    assert.ok(res.body.includes('<clientConfig version="1.1">') || res.body.includes('emailProvider'));
    assert.ok(res.body.includes('<incomingServer type="imap">'));
    assert.ok(res.body.includes('<outgoingServer type="smtp">'));
  });

  await t.test('3. GET /email.mobileconfig returns Apple iOS/macOS signed profile payload', async () => {
    const res = await apiRequest('/email.mobileconfig?email=user@wox.world');

    assert.equal(res.status, 200);
    assert.ok(typeof res.body === 'string');
    assert.ok(res.body.includes('PayloadType') || res.body.includes('com.apple.mail.managed'));
  });
});
