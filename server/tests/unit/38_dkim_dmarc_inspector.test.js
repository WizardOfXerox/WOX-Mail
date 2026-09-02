import test from 'node:test';
import assert from 'node:assert/strict';
import { inspectEmailAuthentication } from '../../src/services/dkimDmarcInspector.js';

test('Suite 38: Unit — Inbound SPF, DKIM & DMARC Signature Security Inspector', async (t) => {
  await t.test('1. Valid SPF and DKIM pass produces verified sender status', () => {
    const headers = {
      'authentication-results': 'mail.wox.world; spf=pass smtp.mailfrom=notifications@github.com; dkim=pass header.d=github.com; dmarc=pass',
      'from': 'GitHub <notifications@github.com>',
    };

    const result = inspectEmailAuthentication(headers, 'notifications@github.com');
    assert.equal(result.status, 'verified');
    assert.match(result.badge, /Verified Sender/i);
    assert.equal(result.spf.status, 'pass');
    assert.equal(result.dkim.status, 'pass');
    assert.equal(result.dmarc.status, 'pass');
    assert.ok(result.score >= 80);
  });

  await t.test('2. Spoofed headers with DMARC failure produce forged sender status', () => {
    const headers = {
      'authentication-results': 'mail.wox.world; spf=fail smtp.mailfrom=service@paypal.com; dkim=fail; dmarc=fail',
      'from': 'PayPal Security <service@paypal.com>',
    };

    const result = inspectEmailAuthentication(headers, 'service@paypal.com');
    assert.equal(result.status, 'forged');
    assert.match(result.badge, /Forged \/ Spoofed/i);
    assert.equal(result.spf.status, 'fail');
    assert.equal(result.dkim.status, 'fail');
    assert.equal(result.dmarc.status, 'fail');
    assert.ok(result.score <= 30);
  });

  await t.test('3. Neutral or missing headers produce unverified status', () => {
    const headers = {
      from: 'newsletter@somedomain.com',
    };

    const result = inspectEmailAuthentication(headers, 'newsletter@somedomain.com');
    assert.equal(result.status, 'neutral');
    assert.match(result.badge, /Unverified Sender/i);
    assert.equal(result.spf.status, 'none');
    assert.equal(result.dkim.status, 'none');
  });
});
