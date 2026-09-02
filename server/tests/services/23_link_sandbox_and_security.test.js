/**
 * Test Suite 23: Link Isolation Sandbox & URL Security Tests
 */

import assert from 'assert';
import { stripTrackingParams, detectHomographRisk } from '../../src/services/linkSandboxService.js';

console.log('[TEST] Running Suite 23: Link Isolation Sandbox & Security...');

// Test 1: Tracking parameter stripper
const dirtyUrl = 'https://example.com/pricing?utm_source=newsletter&utm_medium=email&utm_campaign=summer_sale&fbclid=IwAR123&mc_eid=abc456&plan=pro&coupon=SAFE10';
const cleanUrl = stripTrackingParams(dirtyUrl);

assert.ok(!cleanUrl.includes('utm_source'), 'utm_source should be stripped');
assert.ok(!cleanUrl.includes('utm_medium'), 'utm_medium should be stripped');
assert.ok(!cleanUrl.includes('fbclid'), 'fbclid should be stripped');
assert.ok(!cleanUrl.includes('mc_eid'), 'mc_eid should be stripped');
assert.ok(cleanUrl.includes('plan=pro'), 'Legitimate query param plan=pro should be preserved');
assert.ok(cleanUrl.includes('coupon=SAFE10'), 'Legitimate query param coupon=SAFE10 should be preserved');

// Test 2: Clean URL remains untouched
const innocentUrl = 'https://wox.world/docs/privacy';
assert.strictEqual(stripTrackingParams(innocentUrl), innocentUrl, 'Clean URL should remain untouched');

// Test 3: Homograph spoof detection
const legitimateDomain = 'google.com';
const spoofDomain = 'xn--ggle-55da.com'; // Cyrillic homograph
const mixedDomain = 'аррӏе.com'; // Cyrillic apple

const legitResult = detectHomographRisk(legitimateDomain);
assert.strictEqual(legitResult.isSpoofRisk, false, 'Standard ASCII domain should not be flagged as spoof');

const spoofResult = detectHomographRisk(spoofDomain);
assert.strictEqual(spoofResult.isSpoofRisk, true, 'Punycode domain should be flagged as potential spoof');

const mixedResult = detectHomographRisk(mixedDomain);
assert.strictEqual(mixedResult.isSpoofRisk, true, 'Cyrillic domain characters should be flagged as potential spoof');

console.log('✓ Suite 23: All link sandbox & security tests passed (3/3)');
