import test from 'node:test';
import assert from 'node:assert/strict';
import '../test_helper.js';
import {
  createTicket,
  addMessage,
  getTicketThread,
  listTickets,
  updateTicketStatus,
  generateTicketNumber,
} from '../../src/services/supportService.js';
import { getOrCreateTestUser } from '../test_helper.js';

test('Suite 11: Support Desk Ticketing & Inbound Support Ingestion Engine', async (t) => {
  let testUser;
  let createdTicket;

  await t.test('Setup: Prepare test user for support desk', async () => {
    testUser = await getOrCreateTestUser('support_requester', 'Pass123!#', false);
    assert.ok(testUser.id);
  });

  await t.test('1. generateTicketNumber() produces formatted sequence number', async () => {
    const num = await generateTicketNumber();
    assert.match(num, /^WOX-TK-\d{5}$/, 'Ticket number must follow format WOX-TK-XXXXX');
  });

  await t.test('2. createTicket() registers ticket with thread message and metadata', async () => {
    createdTicket = await createTicket(testUser.id, {
      creatorEmail: testUser.email,
      creatorName: 'Support Requester',
      subject: 'Inquiry regarding PGP encryption settings',
      category: 'security',
      priority: 'high',
      messageText: 'Hello support team, I would like to verify if Curve25519 is the default ECC key.',
    });

    assert.ok(createdTicket.id);
    assert.ok(createdTicket.ticket_number.startsWith('WOX-TK-'));
    assert.equal(createdTicket.status, 'open');
    assert.equal(createdTicket.priority, 'high');
  });

  await t.test('3. addMessage() appends follow-up responses to the thread', async () => {
    const replyRes = await addMessage(createdTicket.id, {
      senderType: 'staff',
      senderEmail: 'support@wox.world',
      messageText: 'Yes, Curve25519 is our default high-performance ECC curve.',
    });

    assert.ok(replyRes.id);
    assert.equal(replyRes.ticket_id, createdTicket.id);
    assert.equal(replyRes.sender_type, 'staff');
  });

  await t.test('4. getTicketThread() retrieves full conversation history', async () => {
    const thread = await getTicketThread(createdTicket.id);
    assert.ok(thread);
    assert.equal(thread.ticket.id, createdTicket.id);
    assert.ok(Array.isArray(thread.messages));
    assert.ok(thread.messages.length >= 2);
  });

  await t.test('5. updateTicketStatus() modifies ticket lifecycle state', async () => {
    const updated = await updateTicketStatus(createdTicket.id, { status: 'resolved' });
    assert.equal(updated.status, 'resolved');
    assert.ok(updated.resolved_at);
  });
});
