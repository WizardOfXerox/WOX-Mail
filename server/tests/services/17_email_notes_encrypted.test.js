import test from 'node:test';
import assert from 'node:assert/strict';
import { query } from '../../src/config/database.js';
import crypto from 'crypto';
import { getOrCreateTestUser } from '../test_helper.js';

test('Suite 17: Message-Attached Encrypted Private Scratchpad Notes', async (t) => {
  let testUser;
  let userKey;

  function encryptNote(text, key) {
    const iv = crypto.randomBytes(16);
    const cipher = crypto.createCipheriv('aes-256-cbc', key, iv);
    let encrypted = cipher.update(text, 'utf8', 'hex');
    encrypted += cipher.final('hex');
    return { encryptedText: encrypted, iv: iv.toString('hex') };
  }

  function decryptNote(encryptedHex, ivHex, key) {
    const iv = Buffer.from(ivHex, 'hex');
    const decipher = crypto.createDecipheriv('aes-256-cbc', key, iv);
    let decrypted = decipher.update(encryptedHex, 'hex', 'utf8');
    decrypted += decipher.final('utf8');
    return decrypted;
  }

  await t.test('Setup: Prepare test user and PBKDF2 key', async () => {
    testUser = await getOrCreateTestUser('note_author_tester', 'Pass123!#', false);
    assert.ok(testUser.id);
    userKey = crypto.pbkdf2Sync(testUser.password_hash, 'woxmail-private-notes-salt-v1', 100000, 32, 'sha256');
  });

  await t.test('1. Encrypt and persist private note attached to message UID', async () => {
    const rawNote = 'Remember to verify the invoice transaction hash on-chain before signing.';
    const { encryptedText, iv } = encryptNote(rawNote, userKey);

    const result = await query(
      `INSERT INTO email_notes (user_id, message_uid, folder, note_text, iv, color, updated_at)
       VALUES ($1, $2, $3, $4, $5, $6, NOW())
       ON CONFLICT (user_id, message_uid, folder)
       DO UPDATE SET note_text = EXCLUDED.note_text, iv = EXCLUDED.iv, updated_at = NOW()
       RETURNING *`,
      [testUser.id, '998811', 'INBOX', encryptedText, iv, 'purple']
    );

    assert.ok(result.rows[0].id);
    assert.equal(result.rows[0].message_uid, '998811');
    assert.notEqual(result.rows[0].note_text, rawNote, 'Plaintext must not be stored directly in database');
  });

  await t.test('2. Retrieve and decrypt private note', async () => {
    const result = await query(
      'SELECT note_text, iv, color FROM email_notes WHERE user_id = $1 AND message_uid = $2 AND folder = $3',
      [testUser.id, '998811', 'INBOX']
    );

    assert.equal(result.rows.length, 1);
    const row = result.rows[0];
    const decrypted = decryptNote(row.note_text, row.iv, userKey);
    assert.equal(decrypted, 'Remember to verify the invoice transaction hash on-chain before signing.');
  });

  await t.test('3. Delete note attached to message', async () => {
    await query(
      'DELETE FROM email_notes WHERE user_id = $1 AND message_uid = $2 AND folder = $3',
      [testUser.id, '998811', 'INBOX']
    );

    const check = await query(
      'SELECT id FROM email_notes WHERE user_id = $1 AND message_uid = $2 AND folder = $3',
      [testUser.id, '998811', 'INBOX']
    );
    assert.equal(check.rows.length, 0);
  });
});
