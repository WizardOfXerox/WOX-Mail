import { describe, it, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { query } from '../../src/config/database.js';
import {
  createSecureAttachment,
  getAttachmentMetadata,
  previewAttachment,
  downloadAttachment,
  revokeAttachment,
} from '../../src/services/secureAttachmentService.js';
import {
  createTracking,
  wrapLinksWithTracking,
  recordEmailOpen,
  recordLinkClick,
  getTrackingTimeline,
} from '../../src/services/trackingService.js';
import {
  scheduleFollowUp,
  checkDueFollowUps,
  resolveFollowUpOnReply,
  getUserFollowUps,
} from '../../src/services/followUpService.js';
import { analyzeDeliverability } from '../../src/services/deliverabilityService.js';
import {
  getUserSnippets,
  createSnippet,
  updateSnippet,
  deleteSnippet,
} from '../../src/services/snippetService.js';
import { getContactDossier } from '../../src/services/contactDossierService.js';

describe('Next-Gen Email Intelligence, Controlled Attachments & Productivity Suite', () => {
  let testUserId;
  const testUserEmail = `test_intel_${Date.now()}@wox.world`;

  before(async () => {
    // Create temporary test user
    const res = await query(`
      INSERT INTO users (email, username, password_hash)
      VALUES ($1, $2, 'dummy_hash')
      RETURNING id
    `, [testUserEmail, `intel_user_${Date.now()}`]);
    testUserId = res.rows[0].id;
  });

  after(async () => {
    // Clean up test user and cascade
    if (testUserId) {
      await query('DELETE FROM users WHERE id = $1', [testUserId]);
    }
  });

  // ═══════════════════════════════════════════════════════════
  // 1. CONTROLLED SECURE ATTACHMENTS VAULT
  // ═══════════════════════════════════════════════════════════
  describe('Controlled Secure Attachments Service', () => {
    it('should encrypt, store, and allow previewing within limits', async () => {
      const payload = Buffer.from('Confidential financial balance sheet 2026');
      const att = await createSecureAttachment({
        userId: testUserId,
        filename: 'report.pdf',
        contentType: 'application/pdf',
        buffer: payload,
        maxViews: 2,
        maxDownloads: 1,
        watermarkText: 'CONFIDENTIAL • test@example.com',
      });

      assert.ok(att.id);
      assert.ok(att.access_token);
      assert.equal(att.filename, 'report.pdf');

      // First Preview: Should succeed
      const view1 = await previewAttachment(att.access_token, { ip: '127.0.0.1' });
      assert.equal(view1.ok, true);
      assert.equal(view1.buffer.toString(), payload.toString());
      assert.equal(view1.viewCount, 1);
      assert.equal(view1.remainingViews, 1);

      // Second Preview: Should succeed
      const view2 = await previewAttachment(att.access_token, { ip: '127.0.0.1' });
      assert.equal(view2.ok, true);
      assert.equal(view2.viewCount, 2);
      assert.equal(view2.remainingViews, 0);

      // Third Preview: Should fail (view limit exhausted)
      const view3 = await previewAttachment(att.access_token, { ip: '127.0.0.1' });
      assert.equal(view3.ok, false);
      assert.equal(view3.exhausted, true);
    });

    it('should enforce download caps and block download when exhausted', async () => {
      const payload = Buffer.from('Secret Document Binary Content');
      const att = await createSecureAttachment({
        userId: testUserId,
        filename: 'secrets.docx',
        contentType: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
        buffer: payload,
        maxViews: null,
        maxDownloads: 1,
      });

      // First Download: Should succeed
      const dl1 = await downloadAttachment(att.access_token, { ip: '127.0.0.1' });
      assert.equal(dl1.ok, true);
      assert.equal(dl1.buffer.toString(), payload.toString());
      assert.equal(dl1.downloadCount, 1);
      assert.equal(dl1.remainingDownloads, 0);

      // Second Download: Should fail (exhausted)
      const dl2 = await downloadAttachment(att.access_token, { ip: '127.0.0.1' });
      assert.equal(dl2.ok, false);
      assert.equal(dl2.exhausted, true);
    });

    it('should enforce view-only policy (0 downloads permitted)', async () => {
      const payload = Buffer.from('View-only NDA content');
      const att = await createSecureAttachment({
        userId: testUserId,
        filename: 'nda.pdf',
        contentType: 'application/pdf',
        buffer: payload,
        maxViews: 5,
        maxDownloads: 0, // View only!
      });

      const dl = await downloadAttachment(att.access_token, { ip: '127.0.0.1' });
      assert.equal(dl.ok, false);
      assert.equal(dl.viewOnly, true);
    });

    it('should respect sender revocation immediately', async () => {
      const payload = Buffer.from('Revocable Contract');
      const att = await createSecureAttachment({
        userId: testUserId,
        filename: 'contract.pdf',
        contentType: 'application/pdf',
        buffer: payload,
        maxViews: 10,
        maxDownloads: 10,
      });

      // Revoke attachment
      const revoked = await revokeAttachment(att.id, testUserId);
      assert.ok(revoked.revoked_at);

      // Attempt to preview
      const view = await previewAttachment(att.access_token, { ip: '127.0.0.1' });
      assert.equal(view.ok, false);
      assert.equal(view.revoked, true);
    });
  });

  // ═══════════════════════════════════════════════════════════
  // 2. LINK CLICK & TIMELINE TRACKING
  // ═══════════════════════════════════════════════════════════
  describe('Link Click & Timeline Telemetry', () => {
    it('should wrap links with signed tracking redirect proxies', async () => {
      const tracking = await createTracking({
        userId: testUserId,
        recipientEmail: 'client@example.com',
        subject: 'Q3 Pitch Deck',
      });

      const originalHtml = '<p>Check our website at <a href="https://wox.world/about">About Us</a> and <a href="https://example.com/pricing">Pricing</a>.</p>';
      const wrappedHtml = await wrapLinksWithTracking(originalHtml, tracking.id, 'https://mail.wox.world');

      assert.ok(wrappedHtml.includes('/api/analytics/click/clk_'));
      assert.ok(!wrappedHtml.includes('href="https://wox.world/about"'));

      // Extract click token from wrapped HTML
      const match = wrappedHtml.match(/\/api\/analytics\/click\/(clk_[a-f0-9]+)/);
      assert.ok(match);
      const clickToken = match[1];

      // Simulate recipient clicking the link
      const targetUrl = await recordLinkClick(clickToken, { ip: '192.168.1.5', headers: { 'user-agent': 'Mozilla/5.0' } });
      assert.ok(targetUrl === 'https://wox.world/about' || targetUrl === 'https://example.com/pricing');

      // Simulate email open
      await recordEmailOpen(tracking.tracking_token, { ip: '192.168.1.5', headers: { 'user-agent': 'Mozilla/5.0' } });

      // Fetch timeline
      const timeline = await getTrackingTimeline(tracking.id, testUserId);
      assert.equal(timeline.recipient_email, 'client@example.com');
      assert.equal(timeline.openEvents.length, 1);
      assert.equal(timeline.linkClicks.length, 2);
    });
  });

  // ═══════════════════════════════════════════════════════════
  // 3. FOLLOW-UP REMINDER ("BUMP IF NO REPLY")
  // ═══════════════════════════════════════════════════════════
  describe('Follow-Up Auto-Reminder Engine', () => {
    it('should schedule reminders and trigger when due', async () => {
      const pastDate = new Date(Date.now() - 10000); // 10 seconds ago
      const reminder = await scheduleFollowUp({
        userId: testUserId,
        recipientEmail: 'partner@example.com',
        subject: 'Partnership Agreement',
        customDate: pastDate.toISOString(),
      });

      assert.equal(reminder.status, 'pending');

      // Check due reminders sweep
      const triggered = await checkDueFollowUps();
      const match = triggered.find((t) => t.id === reminder.id);
      assert.ok(match);

      // Verify list returns triggered items
      const userFollowUps = await getUserFollowUps(testUserId);
      const updated = userFollowUps.find((f) => f.id === reminder.id);
      assert.equal(updated.status, 'triggered');
    });

    it('should auto-resolve reminder when recipient replies', async () => {
      const reminder = await scheduleFollowUp({
        userId: testUserId,
        recipientEmail: 'client_reply@domain.com',
        subject: 'Invoice #1042',
        remindAfterDays: 3,
      });

      assert.equal(reminder.status, 'pending');

      // Simulate recipient sending an email reply
      const resolvedCount = await resolveFollowUpOnReply({
        senderEmail: 'client_reply@domain.com',
      });
      assert.ok(resolvedCount >= 1);

      // Reminder should now be resolved_by_reply and not in pending list
      const activeList = await getUserFollowUps(testUserId);
      const found = activeList.find((f) => f.id === reminder.id);
      assert.equal(found, undefined); // 'resolved_by_reply' is excluded from pending/triggered
    });
  });

  // ═══════════════════════════════════════════════════════════
  // 4. PRE-FLIGHT DELIVERABILITY & SPAM SCORE INSPECTOR
  // ═══════════════════════════════════════════════════════════
  describe('Deliverability & Spam Inspector', () => {
    it('should detect high-risk spam keywords and grade accordingly', () => {
      const spamDraft = {
        subject: 'WIN 100% FREE CASH PRIZES AND BIG BUCKS NOW!!!',
        bodyText: 'Congratulations dear friend! You have won million dollars risk free. Act now for extra cash wire transfer.',
      };

      const result = analyzeDeliverability(spamDraft);
      assert.ok(result.score < 60);
      assert.ok(result.issues.length >= 2);
      assert.ok(result.recommendations.length > 0);
    });

    it('should give high score to clean professional emails', () => {
      const cleanDraft = {
        subject: 'Project timeline review and agenda for Tuesday',
        bodyText: 'Hi Sarah, please find the updated project milestones attached. Let me know if you would like to adjust the sprint goals.',
      };

      const result = analyzeDeliverability(cleanDraft);
      assert.ok(result.score >= 90);
      assert.equal(result.grade, 'Excellent');
      assert.equal(result.isDeliverable, true);
    });
  });

  // ═══════════════════════════════════════════════════════════
  // 5. SNIPPETS & SLASH MACROS
  // ═══════════════════════════════════════════════════════════
  describe('User Snippets Service', () => {
    it('should create, list, update, and delete text macros', async () => {
      const snippet = await createSnippet(testUserId, {
        shortcut: '/intro',
        title: 'Sales Introduction',
        contentHtml: '<p>Hi there, thanks for reaching out to WoxMail!</p>',
      });

      assert.equal(snippet.shortcut, 'intro');
      assert.equal(snippet.title, 'Sales Introduction');

      // Update snippet
      const updated = await updateSnippet(snippet.id, testUserId, {
        shortcut: 'intro_v2',
        title: 'Sales Intro Updated',
        contentHtml: '<p>Updated intro template</p>',
      });
      assert.equal(updated.shortcut, 'intro_v2');

      // List snippets
      const list = await getUserSnippets(testUserId);
      assert.ok(list.some((s) => s.id === snippet.id));

      // Delete snippet
      const deleted = await deleteSnippet(snippet.id, testUserId);
      assert.equal(deleted, true);
    });
  });

  // ═══════════════════════════════════════════════════════════
  // 6. CONTACT INTELLIGENCE & DOSSIER
  // ═══════════════════════════════════════════════════════════
  describe('Contact Dossier Service', () => {
    it('should calculate contact telemetry and resolve timezone', async () => {
      const dossier = await getContactDossier({
        userId: testUserId,
        contactEmail: 'partner@techcorp.co.uk',
      });

      assert.ok(dossier);
      assert.equal(dossier.domain, 'techcorp.co.uk');
      assert.ok(dossier.timezoneLabel.includes('UK') || dossier.timezoneLabel.includes('GMT'));
      assert.ok(dossier.localTime);
      assert.ok(dossier.metrics);
    });
  });
});
