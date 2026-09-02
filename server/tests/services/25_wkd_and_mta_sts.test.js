/**
 * Test Suite 25: OpenPGP Web Key Directory & MTA-STS Outbound Policy Tests
 */

import assert from 'assert';
import { encodeZBase32, computeWkdHash } from '../../src/services/wkdService.js';
import { validateOutboundEncryption } from '../../src/services/mtaStsService.js';

console.log('[TEST] Running Suite 25: WKD Discovery & MTA-STS Policy Tests...');

// Test 1: z-base-32 encoding format
const testBuffer = Buffer.from('test string for zbase32 encoding');
const encoded = encodeZBase32(testBuffer);
assert.ok(encoded.length > 0, 'z-base-32 output should not be empty');
assert.ok(/^[ybndrfg8ejkmcpqxot1uwisza345h769]+$/.test(encoded), 'Output must strictly use RFC 9216 z-base-32 alphabet');

// Test 2: WKD local-part 32-character hash computation
const adminHash = computeWkdHash('admin');
assert.strictEqual(adminHash.length, 32, 'WKD hash must be exactly 32 characters in length');
assert.ok(/^[ybndrfg8ejkmcpqxot1uwisza345h769]+$/.test(adminHash), 'WKD hash must strictly conform to z-base-32');

// Test 3: Consistency check for WKD hash
const secondHash = computeWkdHash('Admin ');
assert.strictEqual(adminHash, secondHash, 'WKD hash computation must be normalized and deterministic');

// Test 4: Outbound Encryption Validation (Fallback to standard when none)
const validationResult = await validateOutboundEncryption('test@example.com', 'mail.example.com');
assert.strictEqual(validationResult.compliant, true, 'Outbound mail to standard domains should be compliant');

console.log('[PASS] Suite 25: All WKD & MTA-STS security tests passed (4/4)');
