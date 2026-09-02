/**
 * Test Suite 26: JMAP Protocol & Mailbox Backup Tests
 */

import assert from 'assert';
import { formatMbox, createZipArchive, encryptBackupBuffer, decryptBackupBuffer } from '../../src/services/backupService.js';
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
// Test 5: Native ZIP Archive Packaging
const testFiles = [
  { name: '0001_welcome.eml', data: 'From: support@wox.world\r\nSubject: Welcome\r\n\r\nHello!' },
  { name: '0002_invoice.eml', data: 'From: billing@wox.world\r\nSubject: Invoice\r\n\r\nReceipt details.' },
];
const zipBuf = createZipArchive(testFiles);
assert.ok(Buffer.isBuffer(zipBuf), 'ZIP output must be a Buffer');
assert.ok(zipBuf.length > 50, 'ZIP archive must contain header and file entries');
// Check standard PK zip magic header (0x04034b50 -> 'PK\x03\x04')
assert.strictEqual(zipBuf.readUInt32LE(0), 0x04034b50, 'ZIP file must begin with PK signature 0x04034b50');

// Test 6: AES-256-GCM Encrypted Backup Snapshots
const secretData = Buffer.from('Confidential Sovereign Mailbox Backup Content', 'utf8');
const passphrase = 'SuperSecretEncryptionKey-999';
const encryptedBuf = encryptBackupBuffer(secretData, passphrase);

assert.ok(Buffer.isBuffer(encryptedBuf), 'Encrypted backup must be a Buffer');
assert.ok(encryptedBuf.subarray(0, 6).toString('utf8') === 'WOXENC', 'Encrypted backup must have WOXENC magic header');
assert.notDeepStrictEqual(encryptedBuf, secretData, 'Encrypted buffer must not match plaintext');

// Decrypt and verify exact match
const decryptedBuf = decryptBackupBuffer(encryptedBuf, passphrase);
assert.strictEqual(decryptedBuf.toString('utf8'), 'Confidential Sovereign Mailbox Backup Content', 'Decrypted payload must match original');

console.log('✓ Suite 26: All JMAP & Mailbox backup tests passed (6/6)');
