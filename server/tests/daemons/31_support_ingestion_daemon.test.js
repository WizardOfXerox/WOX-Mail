import test from 'node:test';
import assert from 'node:assert/strict';
import { processInboundSupportEmails } from '../../src/jobs/supportIngestionJob.js';

test('Suite 31: Support Desk IMAP Ingestion Daemon Task', async (t) => {
  await t.test('1. processInboundSupportEmails() executes safely without throwing', async () => {
    const processed = await processInboundSupportEmails();
    assert.equal(typeof processed, 'number');
    assert.ok(processed >= 0);
  });
});
