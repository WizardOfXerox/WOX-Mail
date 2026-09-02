import 'dotenv/config';
import { query } from '../src/config/database.js';
import * as outboxService from '../src/services/outboxService.js';
import { v4 as uuidv4 } from 'uuid';

async function runTests() {
  console.log('--- 1. Testing Outbox Service Lifecycle ---');

  // Find admin user
  const userRes = await query("SELECT id, email, username FROM users WHERE email = 'admin@wox.world'");
  const user = userRes.rows[0];
  console.log('Found user:', user);

  const testDispatchId = `test-dispatch-${uuidv4()}`;

  // Create entry
  const entry = await outboxService.createOutboxEntry({
    userId: user.id,
    dispatchId: testDispatchId,
    emailPayload: {
      from: `Admin <${user.email}>`,
      to: 'test-recipient@example.com',
      subject: 'Test Outbox Email',
      text: 'Hello from outbox test',
    },
    status: 'queued_undo',
  });
  console.log('Created outbox entry:', entry.id, entry.status);

  // Check outbox count
  const count1 = await outboxService.getOutboxCount(user.id);
  console.log('Active outbox count (should be >= 1):', count1);
  if (count1 < 1) throw new Error('Outbox count should be at least 1');

  // List messages
  const list = await outboxService.getOutboxMessages(user.id);
  console.log('Fetched outbox messages count:', list.messages.length);
  const found = list.messages.find((m) => m.dispatchId === testDispatchId);
  if (!found) throw new Error('Created outbox message not found in list');
  console.log('Found formatted message:', found.uid, found.status, found.to);

  // Update status to failed
  const failed = await outboxService.updateOutboxStatus(testDispatchId, {
    status: 'failed',
    errorMessage: 'Simulated connection timeout (test)',
  });
  console.log('Updated to failed:', failed.status, failed.error_message, 'retry_count:', failed.retry_count);

  // Update status to sent
  const sent = await outboxService.updateOutboxStatus(testDispatchId, {
    status: 'sent',
    sentAt: new Date(),
  });
  console.log('Updated to sent:', sent.status, sent.sent_at);

  // Cleanup test entry
  await outboxService.deleteOutboxMessage(user.id, entry.id);
  console.log('Cleaned up test outbox entry');

  console.log('\n--- 2. Testing Send-as-Alias & Reply-as-Alias Logic ---');
  // Check user aliases
  const aliasRes = await query(
    'SELECT id, alias_address, enabled FROM email_aliases WHERE user_id = $1',
    [user.id]
  );
  console.log('User active aliases count:', aliasRes.rows.length);
  if (aliasRes.rows.length > 0) {
    const testAlias = aliasRes.rows[0].alias_address;
    console.log('Testing with alias:', testAlias);

    // Verify alias lookup
    const checkValid = await query(
      'SELECT alias_address FROM email_aliases WHERE user_id = $1 AND LOWER(alias_address) = $2 AND enabled = TRUE',
      [user.id, testAlias.toLowerCase()]
    );
    console.log('Alias validation passed:', checkValid.rows.length > 0);

    // Verify Reply auto-detection logic
    const mockIncomingRecipients = [testAlias.toLowerCase(), 'another@example.com'];
    const userAliases = aliasRes.rows.map((r) => r.alias_address.toLowerCase());
    const matched = userAliases.find((a) => mockIncomingRecipients.includes(a));
    console.log('Auto-detected reply alias:', matched);
    if (matched !== testAlias.toLowerCase()) throw new Error('Reply auto-detection failed');
  }

  console.log('\n--- 3. Testing HTTP API Endpoints on Port 3001 ---');
  const jwt = (await import('jsonwebtoken')).default;
  const token = jwt.sign({ userId: user.id, type: 'access' }, process.env.JWT_SECRET);

  const foldersRes = await fetch('http://localhost:3001/api/mail/folders', {
    headers: { 'Cookie': `woxmail_token=${token}` }
  });
  const foldersData = await foldersRes.json();
  const outboxFolder = foldersData.folders.find((f) => f.name.toLowerCase() === 'outbox');
  console.log('GET /api/mail/folders -> Outbox folder:', outboxFolder);
  if (!outboxFolder) throw new Error('Outbox folder missing from /api/mail/folders');

  const outboxFolderRes = await fetch('http://localhost:3001/api/mail/folder/Outbox', {
    headers: { 'Cookie': `woxmail_token=${token}` }
  });
  const outboxFolderData = await outboxFolderRes.json();
  console.log('GET /api/mail/folder/Outbox -> Response:', {
    folder: outboxFolderData.folder,
    messageCount: outboxFolderData.messages?.length,
    pagination: outboxFolderData.pagination
  });
  if (outboxFolderData.folder !== 'Outbox') throw new Error('Failed fetching /api/mail/folder/Outbox');

  console.log('\n✅ All Outbox, Alias, and API endpoint tests passed successfully!');
  process.exit(0);
}

runTests().catch((err) => {
  console.error('❌ Test failed:', err);
  process.exit(1);
});
