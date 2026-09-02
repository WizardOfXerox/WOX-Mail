import test from 'node:test';
import assert from 'node:assert/strict';
import { createEphemeralStream, isProxyCrawler } from '../../src/services/ephemeralStreamService.js';
import { createSecureMessage, unlockSecureMessage } from '../../src/services/secureMessageService.js';
import { query } from '../../src/config/database.js';

test('Suite 05: Ephemeral Vector Streams & Enclave Vault PIN Messaging', async (t) => {
  await t.test('1. createEphemeralStream() encrypts content and issues stream token', async () => {
    const stream = await createEphemeralStream({
      senderEmail: 'alice@wox.world',
      recipientEmail: 'bob@wox.world',
      subject: 'Classified Directive #404',
      content: 'This message will self-destruct once viewed in your email client.',
      maxViews: 1,
      expirationHours: 24,
    });

    assert.ok(stream.id, 'Stream ID must be assigned');
    assert.ok(typeof stream.token === 'string' && stream.token.length >= 32);
    assert.ok(stream.streamUrl.includes(stream.token));

    // Verify in database that plaintext is NOT stored
    const dbRow = await query('SELECT encrypted_content, iv, auth_tag FROM ephemeral_streams WHERE id = $1', [stream.id]);
    assert.ok(dbRow.rows[0].encrypted_content);
    assert.ok(!dbRow.rows[0].encrypted_content.includes('Classified Directive'), 'Plaintext must not appear in DB');
  });

  await t.test('2. isProxyCrawler() identifies security bot crawlers to prevent premature burn', () => {
    assert.equal(isProxyCrawler('GoogleImageProxy (bot)'), true);
    assert.equal(isProxyCrawler('Mozilla/5.0 (compatible; Googlebot/2.1; +http://www.google.com/bot.html)'), true);
    assert.equal(isProxyCrawler('BingPreview/1.0b'), true);
    assert.equal(isProxyCrawler('Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X)', '', '66.249.90.1'), true);
    assert.equal(isProxyCrawler('Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X)', '', '192.168.1.1'), false);
  });

  await t.test('3. Enclave Vault PIN protection, unlocking, and burn-after-read', async () => {
    const pin = '948201';
    const secretText = 'Sovereign Enclave Coordinates: 48.8584, 2.2945';

    // 1. Create secure message
    const msg = await createSecureMessage({
      senderEmail: 'sovereign@wox.world',
      recipientEmail: 'agent@wox.world',
      subject: 'Enclave Vault Lockbox',
      content: secretText,
      pin,
      expirationHours: 2,
      destroyAfterRead: true,
      watermarkEnabled: true,
    });

    assert.ok(msg.id, 'Message ID must be assigned');
    assert.ok(msg.publicToken);

    // 2. Wrong PIN test
    const wrongAttempt = await unlockSecureMessage(msg.publicToken, '000000');
    assert.equal(wrongAttempt.error, 'invalid_passcode');
    assert.ok(wrongAttempt.message.includes('Incorrect') || wrongAttempt.message.includes('passcode'));

    // 3. Correct PIN unlock test
    const unlocked = await unlockSecureMessage(msg.publicToken, pin);
    assert.ok(!unlocked.error, `Unexpected error on valid unlock: ${unlocked.error}`);
    assert.equal(unlocked.content, secretText);
    assert.equal(unlocked.watermarkEnabled, true);

    // 4. Burn-after-read verification: subsequent access must return destroyed
    const secondAttempt = await unlockSecureMessage(msg.publicToken, pin);
    assert.equal(secondAttempt.error, 'destroyed', 'Burn-after-read message must return destroyed on 2nd access');
  });

  await t.test('4. Enclave Vault lockout after consecutive brute-force PIN failures', async () => {
    const lockoutMsg = await createSecureMessage({
      senderEmail: 'admin@wox.world',
      recipientEmail: 'target@wox.world',
      subject: 'Brute Force Test Lockbox',
      content: 'Protected Data',
      pin: '777888',
      expirationHours: 1,
      destroyAfterRead: false,
    });

    // Make 5 consecutive incorrect attempts
    for (let i = 0; i < 5; i++) {
      await unlockSecureMessage(lockoutMsg.publicToken, `11111${i}`);
    }

    // Now even correct PIN must be rejected due to lockout
    const lockedResult = await unlockSecureMessage(lockoutMsg.publicToken, '777888');
    assert.equal(lockedResult.error, 'locked', 'Message must be permanently locked after excessive failures');
  });
});
