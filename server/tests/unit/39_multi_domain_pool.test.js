import test from 'node:test';
import assert from 'node:assert/strict';
import { getAvailableDomains, getRandomDomain } from '../../src/services/pool.js';

test('Suite 39: Unit — Temp Mail Multi-Domain Stealth Rotation & Evasion Matrix', async (t) => {
  await t.test('1. getAvailableDomains returns array of distinct active domains', () => {
    const domains = getAvailableDomains();
    assert.ok(Array.isArray(domains));
    assert.ok(domains.length >= 2, 'Must include primary and fallback domain pools');
    assert.ok(domains.includes('mail.wox.world'));
  });

  await t.test('2. getRandomDomain selects valid domain from the pool', () => {
    const domains = getAvailableDomains();
    for (let i = 0; i < 10; i++) {
      const picked = getRandomDomain();
      assert.ok(domains.includes(picked), `Picked domain '${picked}' must be in available list`);
    }
  });
});
