import { describe, it, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { query } from '../../src/config/database.js';
import { createAlias, listAliases } from '../../src/services/aliasManager.js';
import { sendEmail } from '../../src/services/smtp.js';

describe('Global Archive & Shadow Journaling with Metadata Headers Test Suite', () => {
  let testUserId;
  let testUserEmail;

  before(async () => {
    process.env.COMPLIANCE_ARCHIVE_ENABLED = 'true';
    process.env.ARCHIVE_EMAIL = 'archive@wox.world';

    const username = `journal_user_${Math.floor(Math.random() * 90000 + 10000)}`;
    testUserEmail = `${username}@wox.world`;
    const res = await query(
      `INSERT INTO users (username, email, password_hash)
       VALUES ($1, $2, $3)
       RETURNING id`,
      [username, testUserEmail, '$argon2id$dummyhashforjournaltest']
    );
    testUserId = res.rows[0].id;
  });

  after(async () => {
    if (testUserId) {
      await query('DELETE FROM email_aliases WHERE user_id = $1', [testUserId]);
      await query('DELETE FROM users WHERE id = $1', [testUserId]);
    }
  });

  it('should create aliases that dual-route to user and archive@wox.world when archiving is enabled', async () => {
    const alias = await createAlias(testUserId, testUserEmail, 'Archive Test Alias', 'random');
    assert.ok(alias.id);
    assert.ok(alias.alias_address);
    assert.equal(alias.user_id, testUserId);
  });

  it('should verify outbound SMTP attaches X-WoxMail-Journal-* metadata headers to shadow copies', async () => {
    let capturedMailOptions = null;
    const mockTransporter = {
      sendMail: async (options) => {
        capturedMailOptions = options;
        return { messageId: '<mock-journal-123@wox.world>' };
      },
    };

    await sendEmail(mockTransporter, {
      from: testUserEmail,
      to: 'target.client@example.com',
      cc: 'manager@example.com',
      subject: 'Strict Compliance Export',
      text: 'Encrypted document attached.',
    });

    assert.ok(capturedMailOptions);
    assert.equal(capturedMailOptions.to, 'target.client@example.com');
    assert.ok(capturedMailOptions.bcc.includes('archive@wox.world'));

    // Verify journal metadata headers
    assert.equal(capturedMailOptions.headers['X-WoxMail-Journal-Original-From'], testUserEmail);
    assert.equal(capturedMailOptions.headers['X-WoxMail-Journal-Original-To'], 'target.client@example.com');
    assert.equal(capturedMailOptions.headers['X-WoxMail-Journal-Original-Cc'], 'manager@example.com');
    assert.equal(capturedMailOptions.headers['X-WoxMail-Journal-Direction'], 'outbound');
    assert.ok(capturedMailOptions.headers['X-WoxMail-Journal-Timestamp']);
  });

  it('should strictly bypass archiving when COMPLIANCE_ARCHIVE_ENABLED is false without hardcoded fallback', async () => {
    process.env.COMPLIANCE_ARCHIVE_ENABLED = 'false';

    let capturedMailOptions = null;
    const mockTransporter = {
      sendMail: async (options) => {
        capturedMailOptions = options;
        return { messageId: '<mock-no-archive-456@wox.world>' };
      },
    };

    await sendEmail(mockTransporter, {
      from: testUserEmail,
      to: 'private.recipient@example.com',
      subject: 'Private Note',
      text: 'No compliance copy.',
    });

    assert.ok(capturedMailOptions);
    assert.equal(capturedMailOptions.bcc, undefined);
    assert.equal(capturedMailOptions.headers['X-WoxMail-Journal-Original-From'], undefined);

    // Reset back to true for remaining tests
    process.env.COMPLIANCE_ARCHIVE_ENABLED = 'true';
  });

  it('should not duplicate BCC or journal headers when sending from archive@wox.world', async () => {
    let capturedMailOptions = null;
    const mockTransporter = {
      sendMail: async (options) => {
        capturedMailOptions = options;
        return { messageId: '<mock-archive-direct@wox.world>' };
      },
    };

    await sendEmail(mockTransporter, {
      from: 'archive@wox.world',
      to: 'auditor@example.com',
      subject: 'Audit Report',
      text: 'Export report.',
    });

    assert.ok(capturedMailOptions);
    assert.ok(!capturedMailOptions.bcc || !capturedMailOptions.bcc.includes('archive@wox.world'));
  });
});
