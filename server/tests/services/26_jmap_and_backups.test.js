/**
 * Test Suite 26: JMAP Protocol & Mailbox Backup Tests
 */

import assert from 'assert';
import { formatMbox } from '../../src/services/backupService.js';
import { generateBlindTokens } from '../../src/services/zeroKnowledgeSearchService.js';
import { getJmapSession, executeJmapBatch } from '../../src/services/jmapService.js';

console.log('[TEST] Running Suite 26: JMAP Protocol & Mailbox Backup Tests...');

// Test 1: MBOX Serializer Format (RFC 4155)
const mockEmails = [
  {
    from: { address: 'sender@example.com' },
    to: [{ address: 'user@wox.world' }],
    subject: 'Backup Test Email',
    date: '2026-09-02T12:00:00Z',
    messageId: 'test-msg-001',
    html: '<p>Hello from MBOX backup!</p>',
  },
];

const mboxOutput = formatMbox(mockEmails);
assert.ok(mboxOutput.startsWith('From sender@example.com'), 'MBOX must start with standard From separator line');
assert.ok(mboxOutput.includes('Subject: Backup Test Email'), 'MBOX must include subject header');
assert.ok(mboxOutput.includes('<p>Hello from MBOX backup!</p>'), 'MBOX must contain email body');

// Test 2: Zero-Knowledge Blind HMAC Tokenizer
const sampleText = 'Confidential project documents for Q3 fiscal planning';
const salt = 'test-salt-secret-123';
const tokens = generateBlindTokens(sampleText, salt);

assert.ok(tokens.length >= 4, 'Should tokenize words into HMAC hashes');
assert.strictEqual(tokens[0].length, 64, 'Tokens must be 64-character SHA256 hex strings');

// Deterministic token check
const tokensRepeat = generateBlindTokens(sampleText, salt);
assert.deepStrictEqual(tokens, tokensRepeat, 'Tokens must be deterministic with same salt');

// Test 3: JMAP Session Object Generation (RFC 8620)
const mockUser = { id: 42, email: 'admin@wox.world' };
const jmapSession = getJmapSession(mockUser, 'https://mail.wox.world');

assert.ok(jmapSession.capabilities['urn:ietf:params:jmap:core'], 'Must declare JMAP core capability');
assert.ok(jmapSession.capabilities['urn:ietf:params:jmap:mail'], 'Must declare JMAP mail capability');
assert.strictEqual(jmapSession.username, 'admin@wox.world', 'Username must match user email');

// Test 4: JMAP Batch Method Execution (Mailbox/get)
const batchRequest = {
  using: ['urn:ietf:params:jmap:core', 'urn:ietf:params:jmap:mail'],
  methodCalls: [
    ['Mailbox/get', { accountId: 'usr_42', ids: null }, 'call_1'],
    ['Email/query', { accountId: 'usr_42' }, 'call_2'],
  ],
};

const batchResponse = await executeJmapBatch(mockUser, batchRequest);
assert.strictEqual(batchResponse.methodResponses.length, 2, 'Must return matching method responses count');
assert.strictEqual(batchResponse.methodResponses[0][0], 'Mailbox/get', 'First method response should be Mailbox/get');
assert.strictEqual(batchResponse.methodResponses[0][2], 'call_1', 'Call ID must match invocation ID');

console.log('✓ Suite 26: All JMAP & Mailbox backup tests passed (4/4)');
