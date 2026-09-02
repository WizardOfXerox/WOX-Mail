/**
 * Test Suite 24: Sieve Rules & Inbound Automation Engine Tests
 */

import assert from 'assert';
import { matchCondition } from '../../src/services/sieveService.js';
import { parseUnsubscribeHeaders } from '../../src/services/unsubscribeService.js';

console.log('[TEST] Running Suite 24: Sieve Rules & Automation Engine...');

const sampleEmail = {
  from: { address: 'billing@stripe.com', name: 'Stripe Payments' },
  to: [{ address: 'user@wox.world' }],
  subject: 'Invoice #10492 for WoxMail Services',
  text: 'Thank you for your business. Your payment of $49.00 has succeeded.',
  hasAttachments: true,
  headers: {
    'list-id': '<notifications.stripe.com>',
  },
};

// Test 1: matchCondition - from contains
const condFrom = { field: 'from', operator: 'contains', value: 'stripe.com' };
assert.strictEqual(matchCondition(condFrom, sampleEmail), true, 'Sender match should pass');

// Test 2: matchCondition - subject contains
const condSub = { field: 'subject', operator: 'contains', value: 'Invoice' };
assert.strictEqual(matchCondition(condSub, sampleEmail), true, 'Subject match should pass');

// Test 3: matchCondition - starts_with
const condStart = { field: 'subject', operator: 'starts_with', value: 'Invoice' };
assert.strictEqual(matchCondition(condStart, sampleEmail), true, 'Subject starts_with match should pass');

// Test 4: matchCondition - regex
const condRegex = { field: 'subject', operator: 'regex', value: '#[0-9]+' };
assert.strictEqual(matchCondition(condRegex, sampleEmail), true, 'Regex condition match should pass');

// Test 5: matchCondition - has_attachment
const condAttach = { field: 'has_attachment', operator: 'is', value: 'true' };
assert.strictEqual(matchCondition(condAttach, sampleEmail), true, 'Attachment check should pass');

// Test 6: matchCondition - negative match
const condFail = { field: 'from', operator: 'contains', value: 'paypal.com' };
assert.strictEqual(matchCondition(condFail, sampleEmail), false, 'Mismatched condition should return false');

// Test 7: RFC 8058 List-Unsubscribe Header Parsing
const headerUnsub = '<https://example.com/unsub?id=123>, <mailto:unsub@example.com?subject=unsubscribe>';
const headerPost = 'List-Unsubscribe=One-Click';

const unsubParsed = parseUnsubscribeHeaders(headerUnsub, headerPost);
assert.strictEqual(unsubParsed.httpUrl, 'https://example.com/unsub?id=123', 'HTTP unsub URL parsed');
assert.strictEqual(unsubParsed.mailto, 'mailto:unsub@example.com?subject=unsubscribe', 'Mailto unsub parsed');
assert.strictEqual(unsubParsed.isOneClick, true, 'One-Click flag recognized');

console.log('✓ Suite 24: All Sieve rules & automation tests passed (7/7)');
