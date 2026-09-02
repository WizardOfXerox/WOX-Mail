import { Router } from 'express';
import { requireAuth } from '../middleware/auth.js';
import { validate } from '../middleware/validate.js';
import { parsePagination, paginationMeta, isPurelymailWelcomeEmail } from '../utils/helpers.js';
import { sanitizeEmail, extractPreview } from '../services/emailSanitizer.js';
import * as imapService from '../services/imap.js';
import * as smtpService from '../services/smtp.js';
import * as screenerService from '../services/screenerService.js';
import * as webhookDispatcher from '../services/webhookDispatcher.js';
import * as reverseAliasService from '../services/reverseAliasService.js';
import * as linkPreviewService from '../services/linkPreviewService.js';
import { extractExpenseData, formatExpensesToCsv } from '../services/expenseService.js';
import * as emailVerifier from '../services/emailVerifier.js';
import * as undoSendService from '../services/undoSendService.js';
import * as outboxService from '../services/outboxService.js';
import * as accountService from '../services/accountService.js';
import * as complianceArchiveService from '../services/complianceArchiveService.js';
import * as supportService from '../services/supportService.js';
import * as trackingService from '../services/trackingService.js';
import { v4 as uuidv4 } from 'uuid';
import { query } from '../config/database.js';
import { emitToUser } from '../config/socket.js';
import pino from 'pino';

const logger = pino({ name: 'woxmail:mail' });
const router = Router();

// All mail routes require authentication
router.use(requireAuth);

// ─── Connection Cache ────────────────────────────────────

/**
 * Per-user IMAP connection cache.
 * Connections are reused within a session and cleaned up on timeout.
 * @type {Map<number, {client: import('imapflow').ImapFlow, lastUsed: number}>}
 */
const connectionCache = new Map();
const CONN_TTL = 5 * 60 * 1000; // 5 minutes idle

// OPT-2: Periodic cleanup of stale IMAP connections
setInterval(() => {
  const now = Date.now();
  for (const [key, entry] of connectionCache) {
    if (now - entry.lastUsed > CONN_TTL) {
      entry.client?.logout?.().catch(() => {});
      connectionCache.delete(key);
    }
  }
}, 60000);

/**
 * Get or create an IMAP connection for the current user.
 * If accountId is provided, connects to the external account via decrypted credentials.
 * Otherwise, uses the default Purelymail IMAP credentials.
 */
async function getIMAPConnection(user, accountId = null) {
  // BUG-4: validate accountId is a valid integer (or null)
  if (accountId != null) {
    accountId = parseInt(accountId, 10);
    if (isNaN(accountId)) {
      const err = new Error('Invalid account ID format.');
      err.status = 400;
      throw err;
    }
  }

  // If no explicit accountId provided, check if user has an active default connected account (e.g. Gmail / Outlook / Yahoo)
  if (!accountId) {
    try {
      const defaultAcc = await query(
        `SELECT id FROM connected_accounts WHERE user_id = $1 AND is_active = TRUE ORDER BY is_default DESC, id ASC LIMIT 1`,
        [user.id]
      );
      if (defaultAcc.rows.length > 0) {
        accountId = defaultAcc.rows[0].id;
      }
    } catch (dbErr) {
      logger.warn({ userId: user.id, err: dbErr.message }, 'Failed to check default connected_accounts');
    }
  }

  // BUG-2: always use string keys for Map consistency
  const cacheKey = String(accountId ? `${user.id}:ext:${accountId}` : user.id);
  const cached = connectionCache.get(cacheKey);
  if (cached && cached.client && cached.client.usable) {
    cached.lastUsed = Date.now();
    return cached.client;
  }
  if (cached) {
    connectionCache.delete(cacheKey);
  }

  // ─── External Account Route ───────────────────────────
  if (accountId) {
    const extAccount = await accountService.getAccountCredentials(user.id, accountId);
    if (!extAccount) {
      const err = new Error('Connected account not found or inactive.');
      err.status = 404;
      throw err;
    }

    if (extAccount.provider === 'proton' || extAccount.direct_api) {
      // Direct API accounts (Proton Mail) are handled client-side via OpenPGP and REST proxy
      return null;
    }

    try {
      const { ImapFlow } = await import('imapflow');
      const client = new ImapFlow({
        host: extAccount.imap_host,
        port: Number(extAccount.imap_port) || 993,
        secure: extAccount.imap_secure !== false,
        auth: { user: extAccount.email, pass: extAccount.password },
        logger: false,
        tls: { rejectUnauthorized: false }
      });
      await client.connect();
      connectionCache.set(cacheKey, { client, lastUsed: Date.now() });

      client.on('close', () => connectionCache.delete(cacheKey));
      client.on('error', (err) => {
        logger.warn({ userId: user.id, accountId, err: err.message }, 'External IMAP client error — removed from cache');
        connectionCache.delete(cacheKey);
      });

      return client;
    } catch (err) {
      logger.error({ userId: user.id, accountId, err: err.message }, 'Failed to connect to external IMAP account');
      const error = new Error(`External account connection failed: ${err.message}`);
      error.status = 502;
      throw error;
    }
  }

  // ─── Default Purelymail Route ─────────────────────────
  // Retrieve IMAP credentials from user record
  const creds = await query(
    'SELECT imap_password FROM users WHERE id = $1',
    [user.id]
  );

  const password = creds.rows[0]?.imap_password;
  if (!password) {
    if (process.env.NODE_ENV === 'development') {
      logger.warn({ userId: user.id }, 'IMAP credentials not configured for user — using dev empty mailbox fallback');
      return null;
    }
    const err = new Error('IMAP credentials not configured. Contact admin.');
    err.status = 500;
    throw err;
  }

  try {
    const client = await imapService.createConnection(user.email, password);
    connectionCache.set(cacheKey, { client, lastUsed: Date.now() });

    // Auto-cleanup on disconnect or error
    client.on('close', () => {
      connectionCache.delete(cacheKey);
    });
    client.on('error', (err) => {
      logger.warn({ userId: user.id, err: err.message }, 'Cached IMAP client error — removed from cache');
      connectionCache.delete(cacheKey);
    });

    return client;
  } catch (err) {
    if (process.env.NODE_ENV === 'development') {
      logger.warn({ userId: user.id, err: err.message }, 'IMAP connection failed in dev — using empty mailbox fallback');
      return null;
    }
    throw err;
  }
}

// Cleanup stale connections every 2 minutes
setInterval(() => {
  const now = Date.now();
  for (const [userId, conn] of connectionCache) {
    if (now - conn.lastUsed > CONN_TTL) {
      conn.client.logout().catch(() => {});
      connectionCache.delete(userId);
    }
  }
}, 120000);

// ═════════════════════════════════════════════════════════
// INBOX & FOLDERS
// ═════════════════════════════════════════════════════════

/**
 * GET /api/mail/folders
 * List all IMAP folders with message counts.
 */
router.get('/folders', async (req, res, next) => {
  try {
    const client = await getIMAPConnection(req.user, req.query.accountId || req.headers['x-account-id']);
    if (!client) {
      return res.json({
        folders: [
          { name: 'INBOX', path: 'INBOX', specialUse: '\\Inbox', messages: 0, unseen: 0 },
          { name: 'The Feed', path: 'The Feed', specialUse: null, messages: 0, unseen: 0 },
          { name: 'Paper Trail', path: 'Paper Trail', specialUse: null, messages: 0, unseen: 0 },
          { name: 'Sent', path: 'Sent', specialUse: '\\Sent', messages: 0, unseen: 0 },
          { name: 'Drafts', path: 'Drafts', specialUse: '\\Drafts', messages: 0, unseen: 0 },
          { name: 'Starred', path: 'Starred', specialUse: null, messages: 0, unseen: 0 },
          { name: 'Trash', path: 'Trash', specialUse: '\\Trash', messages: 0, unseen: 0 },
          { name: 'Spam', path: 'Spam', specialUse: '\\Junk', messages: 0, unseen: 0 },
        ],
      });
    }
    const rawFolders = await imapService.listFolders(client);

    // Map Junk to Spam for client display
    const folders = rawFolders.map((f) => {
      if (f.name.toLowerCase() === 'junk' || f.specialUse === '\\Junk') {
        return { ...f, name: 'Spam' };
      }
      return f;
    });

    // Enrich with virtual folders (Starred, The Feed, Paper Trail) in a single fast pass
    try {
      const inboxRes = await imapService.fetchMessages(client, 'INBOX', { page: 1, limit: 100 }).catch(() => ({ messages: [], total: 0 }));
      const msgs = inboxRes.messages || [];

      const feedRegex = /newsletter|digest|weekly|monthly|updates|news|shield|guide|announcement|welcome to|bulletin|medium|substack|dev\.to|github digests|promo|special offer|discount|sale|marketing|trends/i;
      const paperTrailRegex = /letter|future|receipt|invoice|order|confirmation|payment|transaction|billing|ticket|pin|code|otp|verify|statement|purchase|tracking|e2e|support request/i;

      let starredCount = 0;
      let feedCount = 0;
      let paperCount = 0;

      for (const m of msgs) {
        if (m.isStarred) starredCount++;
        const fromStr = typeof m.from === 'object' ? (m.from?.name || m.from?.address || '') : (m.from || '');
        const text = `${m.subject} ${fromStr}`;
        if (paperTrailRegex.test(text)) {
          paperCount++;
        } else if (feedRegex.test(text)) {
          feedCount++;
        }
      }

      if (!folders.some((f) => f.name.toLowerCase() === 'the feed')) {
        folders.push({
          name: 'The Feed',
          path: 'The Feed',
          specialUse: null,
          messages: feedCount,
          unseen: 0,
        });
      }
      if (!folders.some((f) => f.name.toLowerCase() === 'paper trail')) {
        folders.push({
          name: 'Paper Trail',
          path: 'Paper Trail',
          specialUse: null,
          messages: paperCount,
          unseen: 0,
        });
      }
      if (!folders.some((f) => f.name.toLowerCase() === 'starred')) {
        folders.push({
          name: 'Starred',
          path: 'Starred',
          specialUse: null,
          messages: starredCount,
          unseen: 0,
        });
      }
    } catch (enrichErr) {
      logger.warn({ err: enrichErr.message }, 'Failed to compute virtual folder counts');
    }

    // Enrich with Outbox virtual folder
    try {
      const outboxCount = await outboxService.getOutboxCount(req.user.id);
      folders.push({
        name: 'Outbox',
        path: 'Outbox',
        specialUse: null,
        messages: outboxCount,
        unseen: outboxCount,
      });
    } catch (outboxErr) {
      logger.warn({ err: outboxErr.message }, 'Failed to compute outbox folder count');
    }

    res.json({ folders });
  } catch (err) {
    next(err);
  }
});

/**
 * GET /api/mail/inbox
 * Fetch paginated inbox (shortcut for /folder/INBOX).
 */
router.get('/inbox', async (req, res, next) => {
  try {
    const { page, limit } = parsePagination(req.query);

    // If user is archive@wox.world, return domain-wide compliance archive stream
    if (req.user.email?.toLowerCase() === 'archive@wox.world') {
      const archiveResult = await complianceArchiveService.getArchivedMessages({
        page,
        limit,
        search: req.query.search || '',
        direction: req.query.direction || 'all',
      });
      return res.json(archiveResult);
    }

    // If user is support@wox.world, return support helpdesk ticket stream
    if (req.user.email?.toLowerCase() === 'support@wox.world') {
      const ticketsResult = await supportService.getSupportTicketsAsMessages({
        page,
        limit,
        search: req.query.search || '',
        status: req.query.status || 'all',
      });
      return res.json(ticketsResult);
    }

    const client = await getIMAPConnection(req.user, req.query.accountId || req.headers['x-account-id']);
    if (!client) {
      return res.json({
        messages: [],
        pagination: paginationMeta(0, page, limit),
      });
    }
    const rawResult = await imapService.fetchMessages(client, 'INBOX', { page, limit });
    const rawMessages = rawResult.messages || [];

    const messages = rawMessages.filter((m) => !isPurelymailWelcomeEmail(m));

    res.json({
      messages,
      pagination: paginationMeta(rawResult.total, page, limit),
    });
  } catch (err) {
    next(err);
  }
});

/**
 * GET /api/mail/folder/:name
 * Fetch paginated messages from a specific folder.
 */
router.get('/folder/:name', async (req, res, next) => {
  try {
    const folderName = decodeURIComponent(req.params.name);
    const { page, limit } = parsePagination(req.query);

    if (folderName === '__all_inboxes' || folderName.toLowerCase() === 'all inboxes') {
      return res.redirect(`/api/mail/inbox?page=${page}&limit=${limit}`);
    }

    // If user is support@wox.world, return tickets filtered by folder
    if (req.user.email?.toLowerCase() === 'support@wox.world') {
      let statusFilter = 'all';
      if (folderName.toLowerCase() === 'sent' || folderName.toLowerCase() === 'resolved') statusFilter = 'resolved';
      if (folderName.toLowerCase() === 'trash' || folderName.toLowerCase() === 'closed') statusFilter = 'closed';
      const ticketsResult = await supportService.getSupportTicketsAsMessages({
        page,
        limit,
        search: req.query.search || '',
        status: statusFilter,
      });
      return res.json({
        folder: folderName,
        ...ticketsResult,
      });
    }

    // If user is archive@wox.world or folder is Archive, return compliance archive stream
    if (req.user.email?.toLowerCase() === 'archive@wox.world' || folderName.toLowerCase() === 'archive') {
      const archiveResult = await complianceArchiveService.getArchivedMessages({
        page,
        limit,
        search: req.query.search || '',
        direction: folderName.toLowerCase() === 'sent' ? 'outbound' : (req.query.direction || 'all'),
      });
      if (archiveResult.messages.length > 0 || req.user.email?.toLowerCase() === 'archive@wox.world') {
        return res.json({
          folder: folderName,
          ...archiveResult,
        });
      }
    }

    if (folderName.toLowerCase() === 'outbox') {
      const outboxRes = await outboxService.getOutboxMessages(req.user.id, { page, limit });
      return res.json({
        folder: 'Outbox',
        messages: outboxRes.messages,
        pagination: paginationMeta(outboxRes.total, page, limit),
      });
    }
    const client = await getIMAPConnection(req.user, req.query.accountId || req.headers['x-account-id']);
    if (!client) {
      return res.json({
        folder: folderName,
        messages: [],
        pagination: paginationMeta(0, page, limit),
      });
    }
    const rawResult = await imapService.fetchMessages(client, folderName, { page, limit });
    const rawMessages = rawResult.messages || [];

    const messages = folderName === 'INBOX' ? rawMessages.filter((m) => !isPurelymailWelcomeEmail(m)) : rawMessages;

    res.json({
      folder: folderName,
      messages,
      pagination: paginationMeta(rawResult.total, page, limit),
    });
  } catch (err) {
    next(err);
  }
});

/**
 * POST /api/mail/folders
 * Create a new folder.
 */
router.post('/folders',
  validate({ name: { type: 'string', required: true, min: 1, max: 100 } }),
  async (req, res, next) => {
    try {
      const client = await getIMAPConnection(req.user, req.query.accountId || req.headers['x-account-id']);
      await imapService.createFolder(client, req.body.name);
      res.status(201).json({ message: 'Folder created', name: req.body.name });
    } catch (err) {
      next(err);
    }
  }
);

/**
 * PUT /api/mail/folders/:name
 * Rename a folder.
 */
router.put('/folders/:name',
  validate({ newName: { type: 'string', required: true, min: 1, max: 100 } }),
  async (req, res, next) => {
    try {
      const client = await getIMAPConnection(req.user, req.query.accountId || req.headers['x-account-id']);
      const oldName = decodeURIComponent(req.params.name);
      await imapService.renameFolder(client, oldName, req.body.newName);
      res.json({ message: 'Folder renamed', oldName, newName: req.body.newName });
    } catch (err) {
      next(err);
    }
  }
);

/**
 * DELETE /api/mail/folders/:name
 * Delete a folder.
 */
router.delete('/folders/:name', async (req, res, next) => {
  try {
    const client = await getIMAPConnection(req.user, req.query.accountId || req.headers['x-account-id']);
    const name = decodeURIComponent(req.params.name);

    // Prevent deleting system folders
    const systemFolders = ['INBOX', 'Sent', 'Drafts', 'Trash', 'Spam', 'Junk'];
    if (systemFolders.includes(name)) {
      return res.status(400).json({ error: 'Cannot delete system folder' });
    }

    await imapService.deleteFolder(client, name);
    res.json({ message: 'Folder deleted' });
  } catch (err) {
    next(err);
  }
});

// ═════════════════════════════════════════════════════════
// MESSAGES
// ═════════════════════════════════════════════════════════

/**
 * GET /api/mail/message/:uid
 * Fetch a single message with sanitized HTML body.
 * Query param: ?folder=INBOX (default)
 */
router.get('/message/:uid', async (req, res, next) => {
  try {
    const rawUid = String(req.params.uid);
    let folder = req.query.folder || 'INBOX';
    if (folder === '__all_inboxes' || folder.toLowerCase() === 'all inboxes') {
      folder = 'INBOX';
    }

    // Handle compliance archive message fetch
    if (rawUid.startsWith('comp_') || req.user.email?.toLowerCase() === 'archive@wox.world') {
      const archivedMsg = await complianceArchiveService.getArchivedMessageById(rawUid);
      if (archivedMsg) {
        const loadImages = req.query.loadImages === 'true';
        const { html: sanitizedHtml, trackers } = archivedMsg.html
          ? sanitizeEmail(archivedMsg.html, { loadImages })
          : { html: '', trackers: 0 };
        return res.json({
          ...archivedMsg,
          html: sanitizedHtml,
          trackers,
        });
      }
    }

    // Handle support ticket message fetch
    if (rawUid.startsWith('ticket_') || (req.user.email?.toLowerCase() === 'support@wox.world' && !rawUid.startsWith('outbox_') && !rawUid.startsWith('comp_'))) {
      const ticketMsg = await supportService.getSupportTicketMessageById(rawUid);
      if (ticketMsg) {
        const loadImages = req.query.loadImages === 'true';
        const { html: sanitizedHtml, trackers } = ticketMsg.html
          ? sanitizeEmail(ticketMsg.html, { loadImages })
          : { html: '', trackers: 0 };
        return res.json({
          ...ticketMsg,
          html: sanitizedHtml,
          trackers,
        });
      }
    }

    // Handle outbox message fetch
    if (rawUid.startsWith('outbox_') || folder.toLowerCase() === 'outbox') {
      const outboxMsg = await outboxService.getOutboxMessageById(req.user.id, rawUid);
      if (!outboxMsg) return res.status(404).json({ error: 'Outbox message not found' });
      return res.json(outboxMsg);
    }

    const client = await getIMAPConnection(req.user, req.query.accountId || req.headers['x-account-id']);
    const uid = parseInt(req.params.uid, 10);

    const msg = await imapService.fetchMessage(client, folder, uid);
    if (!msg) {
      return res.status(404).json({ error: 'Message not found' });
    }

    // Parse the raw source to extract HTML/text body
    const { simpleParser } = await import('mailparser');
    const parsed = await simpleParser(msg.source);

    // Sanitize HTML
    const loadImages = req.query.loadImages === 'true';
    const allowScripts = req.query.allowScripts === 'true';
    const { html: sanitizedHtml, trackers } = parsed.html
      ? sanitizeEmail(parsed.html, { loadImages, allowScripts })
      : { html: '', trackers: 0 };

    // Auto-add sender to contacts (fire and forget)
    if (parsed.from?.value?.[0]?.address) {
      const sender = parsed.from.value[0];
      query(
        `INSERT INTO contacts (user_id, email, name, last_emailed)
         VALUES ($1, $2, $3, NOW())
         ON CONFLICT (user_id, email) DO UPDATE SET last_emailed = NOW()`,
        [req.user.id, sender.address, sender.name || null]
      ).catch(() => {});
    }

    // Read Tracking / Open Receipt lookup
    let trackingInfo = null;
    try {
      const recipientEmail = parsed.to?.value?.[0]?.address || '';
      const subj = parsed.subject || '';
      if (recipientEmail || subj) {
        const trackRes = await query(
          `SELECT id, tracking_token, subject, recipient_email, sent_at, opened_at, open_count, last_user_agent
           FROM email_tracking
           WHERE user_id = $1 AND (recipient_email = $2 OR subject = $3)
           ORDER BY sent_at DESC LIMIT 1`,
          [req.user.id, recipientEmail, subj]
        );
        if (trackRes.rows.length > 0) {
          trackingInfo = trackRes.rows[0];
        }
      }
    } catch (trackErr) {
      logger.debug({ err: trackErr.message }, 'Failed to lookup tracking for message');
    }

    // RFC 8058 & RFC 2369 List-Unsubscribe Extraction
    let unsubscribeInfo = null;
    const listUnsubHeader = parsed.headers?.get('list-unsubscribe');
    const listUnsubPostHeader = parsed.headers?.get('list-unsubscribe-post');
    if (listUnsubHeader) {
      const rawVal = typeof listUnsubHeader === 'string' ? listUnsubHeader : (listUnsubHeader.value || '');
      const urls = rawVal.match(/<([^>]+)>/g)?.map(u => u.slice(1, -1)) || [];
      const httpUrl = urls.find(u => u.startsWith('http://') || u.startsWith('https://'));
      const mailtoUrl = urls.find(u => u.startsWith('mailto:'));
      const isOneClick = Boolean(listUnsubPostHeader && String(listUnsubPostHeader).toLowerCase().includes('list-unsubscribe=one-click'));

      if (httpUrl || mailtoUrl) {
        unsubscribeInfo = {
          httpUrl: httpUrl || null,
          mailtoUrl: mailtoUrl || null,
          isOneClick,
        };
      }
    }

    // Extract Archive Compliance Journaling Metadata Headers (for shadow-copied / archived emails)
    let archiveJournal = null;
    const journalFrom = parsed.headers?.get('x-woxmail-journal-original-from');
    const journalTo = parsed.headers?.get('x-woxmail-journal-original-to');
    const journalCc = parsed.headers?.get('x-woxmail-journal-original-cc');
    const journalDir = parsed.headers?.get('x-woxmail-journal-direction');
    const journalTime = parsed.headers?.get('x-woxmail-journal-timestamp');
    const journalAlias = parsed.headers?.get('x-woxmail-journal-alias');

    if (journalFrom || journalTo || journalDir) {
      archiveJournal = {
        originalFrom: typeof journalFrom === 'string' ? journalFrom : (journalFrom?.value || null),
        originalTo: typeof journalTo === 'string' ? journalTo : (journalTo?.value || null),
        originalCc: typeof journalCc === 'string' ? journalCc : (journalCc?.value || null),
        direction: typeof journalDir === 'string' ? journalDir : (journalDir?.value || 'outbound'),
        timestamp: typeof journalTime === 'string' ? journalTime : (journalTime?.value || null),
        alias: typeof journalAlias === 'string' ? journalAlias : (journalAlias?.value || null),
      };
    }

    res.json({
      uid,
      folder,
      subject: parsed.subject || '(no subject)',
      from: parsed.from?.value?.[0] || null,
      to: parsed.to?.value || [],
      cc: parsed.cc?.value || [],
      date: parsed.date || null,
      messageId: parsed.messageId || null,
      inReplyTo: parsed.inReplyTo || null,
      references: parsed.references || [],
      html: sanitizedHtml,
      text: parsed.text || '',
      trackersBlocked: trackers,
      unsubscribe: unsubscribeInfo,
      archiveJournal,
      trackingInfo,
      attachments: (parsed.attachments || []).map((att) => ({
        filename: att.filename || 'attachment',
        contentType: att.contentType,
        size: att.size,
        cid: att.cid || null,
      })),
      flags: msg.flags,
    });
  } catch (err) {
    next(err);
  }
});

/**
 * POST /api/mail/unsubscribe/:uid
 * RFC 8058 One-Click Unsubscribe Dispatcher
 */
router.post('/unsubscribe/:uid', async (req, res, next) => {
  try {
    const client = await getIMAPConnection(req.user, req.query.accountId || req.headers['x-account-id']);
    const folder = req.query.folder || 'INBOX';
    const uid = parseInt(req.params.uid, 10);
    const msg = await imapService.fetchMessage(client, folder, uid);

    if (!msg) return res.status(404).json({ error: 'Message not found' });

    const { simpleParser } = await import('mailparser');
    const parsed = await simpleParser(msg.source);

    const listUnsubHeader = parsed.headers?.get('list-unsubscribe');
    const listUnsubPostHeader = parsed.headers?.get('list-unsubscribe-post');

    if (!listUnsubHeader) {
      return res.status(400).json({ error: 'No List-Unsubscribe header found on this email.' });
    }

    const rawVal = typeof listUnsubHeader === 'string' ? listUnsubHeader : (listUnsubHeader.value || '');
    const urls = rawVal.match(/<([^>]+)>/g)?.map(u => u.slice(1, -1)) || [];
    const httpUrl = urls.find(u => u.startsWith('http://') || u.startsWith('https://'));
    const mailtoUrl = urls.find(u => u.startsWith('mailto:'));
    const isOneClick = Boolean(listUnsubPostHeader && String(listUnsubPostHeader).toLowerCase().includes('list-unsubscribe=one-click'));

    if (httpUrl && isOneClick) {
      // RFC 8058 One-Click HTTP POST
      try {
        const unsubRes = await fetch(httpUrl, {
          method: 'POST',
          headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
          body: 'List-Unsubscribe=One-Click',
        });
        return res.json({
          success: true,
          method: 'one-click-post',
          status: unsubRes.status,
          message: 'One-click unsubscribe request sent successfully.',
        });
      } catch (postErr) {
        logger.warn({ err: postErr.message }, 'RFC 8058 POST failed — fallback to link');
      }
    }

    if (mailtoUrl) {
      // Send mailto unsubscribe
      const mailtoClean = mailtoUrl.replace(/^mailto:/i, '');
      const [toAddr, queryParams] = mailtoClean.split('?');
      let unsubSubject = 'Unsubscribe';
      if (queryParams) {
        const searchParams = new URLSearchParams(queryParams);
        unsubSubject = searchParams.get('subject') || 'Unsubscribe';
      }

      const pass = req.user.purelymail_password || process.env.ADMIN_PASSWORD;
      const transporter = smtpService.createTransporter(req.user.email, pass);
      await smtpService.sendEmail(transporter, {
        from: req.user.email,
        to: toAddr,
        subject: unsubSubject,
        text: 'Please unsubscribe me from this mailing list.',
      });

      return res.json({
        success: true,
        method: 'mailto',
        message: `Unsubscribe email sent to ${toAddr}.`,
      });
    }

    if (httpUrl) {
      return res.json({
        success: true,
        method: 'browser',
        url: httpUrl,
        message: 'Direct unsubscribe link retrieved.',
      });
    }

    res.status(400).json({ error: 'Could not process unsubscribe request.' });
  } catch (err) {
    next(err);
  }
});

/**
 * GET /api/mail/expenses
 * Aggregate and extract structured expenses/receipts from "Paper Trail"
 */
router.get('/expenses', async (req, res, next) => {
  try {
    const client = await getIMAPConnection(req.user, req.query.accountId || req.headers['x-account-id']);
    const folder = req.query.folder || 'Paper Trail';
    const page = parseInt(req.query.page, 10) || 1;
    const limit = Math.min(50, parseInt(req.query.limit, 10) || 25);

    const { messages = [] } = await imapService.fetchMessages(client, folder, { page, limit });
    const expenses = messages.map(m => extractExpenseData(m));
    const totalSpent = expenses.reduce((sum, e) => sum + (e.amount || 0), 0);

    res.json({
      expenses,
      summary: {
        count: expenses.length,
        totalSpent: parseFloat(totalSpent.toFixed(2)),
        currency: 'USD',
      },
    });
  } catch (err) {
    next(err);
  }
});

/**
 * GET /api/mail/expenses/export
 * Download CSV spreadsheet of expenses
 */
router.get('/expenses/export', async (req, res, next) => {
  try {
    const client = await getIMAPConnection(req.user, req.query.accountId || req.headers['x-account-id']);
    const folder = req.query.folder || 'Paper Trail';

    const { messages = [] } = await imapService.fetchMessages(client, folder, { page: 1, limit: 100 });
    const expenses = messages.map(m => extractExpenseData(m));
    const csv = formatExpensesToCsv(expenses);

    res.setHeader('Content-Type', 'text/csv');
    res.setHeader('Content-Disposition', `attachment; filename="woxmail-expenses-${new Date().toISOString().split('T')[0]}.csv"`);
    res.send(csv);
  } catch (err) {
    next(err);
  }
});

/**
 * GET /api/mail/message/:uid/source
 * Get raw email source.
 */
router.get('/message/:uid/source', async (req, res, next) => {
  try {
    const client = await getIMAPConnection(req.user, req.query.accountId || req.headers['x-account-id']);
    const folder = req.query.folder || 'INBOX';
    const uid = parseInt(req.params.uid, 10);
    const msg = await imapService.fetchMessage(client, folder, uid);

    if (!msg) return res.status(404).json({ error: 'Message not found' });

    res.json({ source: msg.source });
  } catch (err) {
    next(err);
  }
});

/**
 * GET /api/mail/message/:uid/eml
 * Download message as .eml file.
 */
router.get('/message/:uid/eml', async (req, res, next) => {
  try {
    const client = await getIMAPConnection(req.user, req.query.accountId || req.headers['x-account-id']);
    const folder = req.query.folder || 'INBOX';
    const uid = parseInt(req.params.uid, 10);
    const msg = await imapService.fetchMessage(client, folder, uid);

    if (!msg) return res.status(404).json({ error: 'Message not found' });

    const filename = `message-${uid}.eml`;
    res.setHeader('Content-Type', 'message/rfc822');
    res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
    res.send(msg.source);
  } catch (err) {
    next(err);
  }
});

/**
 * GET /api/mail/message/:uid/attachment/:index
 * Download or preview a specific attachment.
 */
router.get('/message/:uid/attachment/:index', async (req, res, next) => {
  try {
    const client = await getIMAPConnection(req.user, req.query.accountId || req.headers['x-account-id']);
    const folder = req.query.folder || 'INBOX';
    const uid = parseInt(req.params.uid, 10);
    const index = parseInt(req.params.index, 10);

    const msg = await imapService.fetchMessage(client, folder, uid);
    if (!msg) return res.status(404).json({ error: 'Message not found' });

    const { simpleParser } = await import('mailparser');
    const parsed = await simpleParser(msg.source);

    const attachments = parsed.attachments || [];
    const att = !isNaN(index) && attachments[index]
      ? attachments[index]
      : attachments.find((a) => a.filename === req.params.index);

    if (!att || !att.content) {
      return res.status(404).json({ error: 'Attachment not found or has empty content' });
    }

    const isPreview = req.query.preview === 'true';
    const filename = att.filename || `attachment-${index + 1}`;
    const contentType = att.contentType || 'application/octet-stream';
    const lowerType = contentType.toLowerCase().split(';')[0].trim();

    // Prevent XSS if an attacker sends an HTML or active SVG file as an attachment
    const isDangerousInlineType = ['text/html', 'application/xhtml+xml', 'image/svg+xml', 'application/xml', 'text/xml'].includes(lowerType);
    const dispositionType = isPreview && !isDangerousInlineType ? 'inline' : 'attachment';
    const cleanFilename = filename.replace(/["\\]/g, '_');

    res.setHeader('Content-Type', contentType);
    res.setHeader(
      'Content-Disposition',
      `${dispositionType}; filename="${cleanFilename}"; filename*=UTF-8''${encodeURIComponent(filename)}`
    );
    res.setHeader('X-Content-Type-Options', 'nosniff');

    if (dispositionType === 'inline') {
      res.setHeader('Content-Security-Policy', "default-src 'none'; style-src 'unsafe-inline'; img-src 'self' data:; media-src 'self'; sandbox");
    }

    if (att.size) res.setHeader('Content-Length', att.size);

    res.send(att.content);
  } catch (err) {
    next(err);
  }
});

/**
 * GET /api/mail/message/:uid/headers
 * Parse and analyze raw RFC822 headers for SPF, DKIM, DMARC, and transit hops.
 */
router.get('/message/:uid/headers', async (req, res, next) => {
  try {
    const client = await getIMAPConnection(req.user, req.query.accountId || req.headers['x-account-id']);
    const folder = req.query.folder || 'INBOX';
    const uid = parseInt(req.params.uid, 10);
    const msg = await imapService.fetchMessage(client, folder, uid);

    if (!msg) return res.status(404).json({ error: 'Message not found' });

    const { simpleParser } = await import('mailparser');
    const parsed = await simpleParser(msg.source);

    const headers = {};
    parsed.headers.forEach((val, key) => {
      headers[key] = typeof val === 'object' && val.value ? val.value : val;
    });

    const authResults = (headers['authentication-results'] || '').toString();
    const receivedSpf = (headers['received-spf'] || '').toString();
    const dkimSig = (headers['dkim-signature'] || '').toString();

    // Compute verdicts
    const spfPass = authResults.toLowerCase().includes('spf=pass') || receivedSpf.toLowerCase().startsWith('pass');
    const dkimPass = authResults.toLowerCase().includes('dkim=pass') || !!dkimSig;
    const dmarcPass = authResults.toLowerCase().includes('dmarc=pass');

    // Extract transit hops from 'received' headers
    let rawReceived = parsed.headers.get('received') || [];
    if (!Array.isArray(rawReceived)) rawReceived = [rawReceived];

    const hops = rawReceived.map((r, i) => {
      const hopStr = (typeof r === 'object' ? r.value || '' : r || '').toString();
      const byMatch = hopStr.match(/by\s+([^\s;]+)/i);
      const fromMatch = hopStr.match(/from\s+([^\s;]+)/i);
      const dateMatch = hopStr.match(/;\s*(.+)$/);
      return {
        index: i + 1,
        from: fromMatch ? fromMatch[1] : 'Unknown Server',
        by: byMatch ? byMatch[1] : 'Local Mail Handler',
        date: dateMatch ? dateMatch[1].trim() : '',
        raw: hopStr,
      };
    });

    res.json({
      uid,
      security: {
        spf: spfPass ? 'PASS' : 'NEUTRAL',
        dkim: dkimPass ? 'PASS' : 'NEUTRAL',
        dmarc: dmarcPass ? 'PASS' : 'NEUTRAL',
        tls: authResults.includes('tls') || msg.source?.includes('using TLS') ? 'TLS Encrypted' : 'Standard',
      },
      hops,
      rawHeaders: headers,
    });
  } catch (err) {
    next(err);
  }
});

// ═════════════════════════════════════════════════════════
// COMPOSE & SEND
// ═════════════════════════════════════════════════════════

/**
 * GET /api/mail/verify-recipient?email=...
 * Real-time pre-flight recipient email verification (Syntax + Typo Detection + DNS MX Resolution).
 */
router.get('/verify-recipient', async (req, res, next) => {
  try {
    const { email } = req.query;
    if (!email) return res.status(400).json({ error: 'Email query parameter required' });
    const result = await emailVerifier.verifyRecipientEmail(String(email));
    res.json(result);
  } catch (err) {
    next(err);
  }
});

/**
 * POST /api/mail/verify-recipients
 * Batch pre-flight verification of multiple recipients.
 */
router.post('/verify-recipients', async (req, res, next) => {
  try {
    const { emails } = req.body;
    const result = await emailVerifier.verifyRecipientList(emails || []);
    res.json(result);
  } catch (err) {
    next(err);
  }
});

/**
 * Auto-learn outgoing recipients into the contacts address book.
 */
async function autoLearnRecipients(userId, recipientsList) {
  if (!userId || !recipientsList) return;
  try {
    const rawList = Array.isArray(recipientsList) ? recipientsList : [recipientsList];
    const emailsToLearn = [];

    for (const item of rawList) {
      if (!item) continue;
      const parts = String(item).split(',');
      for (const p of parts) {
        const clean = p.trim();
        if (!clean) continue;
        let email = clean;
        let name = null;
        if (clean.includes('<') && clean.includes('>')) {
          const match = clean.match(/^(.*?)\s*<([^>]+)>/);
          if (match) {
            name = match[1].replace(/["']/g, '').trim() || null;
            email = match[2].trim().toLowerCase();
          }
        } else {
          email = clean.toLowerCase();
        }

        if (email.includes('@') && !email.endsWith('.onion')) {
          emailsToLearn.push({ email, name });
        }
      }
    }

    for (const c of emailsToLearn) {
      await query(
        `INSERT INTO contacts (user_id, email, name, last_emailed)
         VALUES ($1, $2, $3, NOW())
         ON CONFLICT (user_id, email)
         DO UPDATE SET 
           last_emailed = NOW(),
           name = COALESCE(EXCLUDED.name, contacts.name)`,
        [userId, c.email, c.name]
      );
    }
  } catch (err) {
    logger.warn({ err: err.message }, 'Failed to auto-learn recipients into contacts');
  }
}

/**
 * POST /api/mail/send
 * Compose and send a new email.
 */
router.post('/send',
  validate({
    to: { type: 'string', required: true },
    subject: { type: 'string', required: true, max: 500 },
    html: { type: 'string' },
    text: { type: 'string' },
  }),
  async (req, res, next) => {
    try {
      const { to, cc, bcc, subject, html, text, attachments } = req.body;

      // ─── Pre-Flight Recipient Email Verification (Resource & Spam Shield) ───
      const recipients = [to, cc, bcc].filter(Boolean);
      const recipientCheck = await emailVerifier.verifyRecipientList(recipients);
      if (!recipientCheck.valid) {
        const firstErr = recipientCheck.invalidEmails[0];
        return res.status(400).json({
          error: `Delivery blocked: ${firstErr.reason}`,
          invalidEmails: recipientCheck.invalidEmails,
          suggestions: recipientCheck.suggestions,
        });
      }

      // Check daily send limit
      const today = new Date().toISOString().split('T')[0];
      const sentToday = await query(
        `SELECT COUNT(*)::int as count FROM audit_log
         WHERE actor_id = $1 AND action = 'send_email' AND created_at::date = $2::date`,
        [String(req.user.id), today]
      );

      const limitSetting = await query("SELECT value FROM settings WHERE key = 'smtp_daily_limit'");
      const limit = parseInt(limitSetting.rows[0]?.value, 10) || 500;

      if (sentToday.rows[0].count >= limit) {
        return res.status(429).json({ error: `Daily send limit reached (${limit})` });
      }

      // Get SMTP transporter (supports Gmail, Outlook, Yahoo, and Sovereign Purelymail)
      const { transporter, senderEmail: defaultSenderEmail, accountId: resolvedAccountId } = await smtpService.getTransporterForUser(
        req.user.id,
        req.query.accountId || req.headers['x-account-id']
      );

      let actualTo = to;
      let senderEmail = defaultSenderEmail || req.user.email;

      // Check if user specified a custom sender address (such as an alias)
      if (req.body.from) {
        const requested = String(req.body.from).trim().toLowerCase();
        const cleanRequested = requested.includes('<') ? requested.replace(/.*<([^>]+)>.*/, '$1').trim() : requested;
        const userMainEmail = (req.user.email || '').toLowerCase();
        const username = userMainEmail.split('@')[0];
        const isProtonDerived = (cleanRequested === `${username}@pm.me` || cleanRequested === `${username}@protonmail.com` || cleanRequested === `${username}@proton.me`);

        if (cleanRequested === userMainEmail || cleanRequested === senderEmail.toLowerCase() || isProtonDerived) {
          senderEmail = cleanRequested;
        } else {
          // Check if this alias belongs to the user and is active
          const aliasRes = await query(
            'SELECT alias_address FROM email_aliases WHERE user_id = $1 AND LOWER(alias_address) = $2 AND enabled = TRUE',
            [req.user.id, cleanRequested]
          );
          if (aliasRes.rows.length > 0) {
            senderEmail = aliasRes.rows[0].alias_address;
          } else {
            return res.status(403).json({ error: `Cannot send from unauthorized address: ${cleanRequested}` });
          }
        }
      }

      let fromAddress = `${req.user.display_name || req.user.username} <${senderEmail}>`;

      // Check if recipient is a reverse alias (outbound masking)
      const reverseMapping = await reverseAliasService.lookupReverseAlias(to);
      if (reverseMapping && reverseMapping.userId === req.user.id) {
        actualTo = reverseMapping.externalEmail;
        fromAddress = `${req.user.display_name || req.user.username} <${reverseMapping.aliasAddress}>`;
        logger.info({ to, actualTo, aliasAddress: reverseMapping.aliasAddress }, 'Outbound reverse alias routing applied');
      }

      // Normalize attachments if sent as base64 data URLs
      let normalizedAttachments = [];
      if (Array.isArray(attachments)) {
        normalizedAttachments = attachments.map((a) => {
          if (typeof a.content === 'string' && a.content.includes('base64,')) {
            const parts = a.content.split('base64,');
            return {
              filename: a.filename || 'attachment',
              content: Buffer.from(parts[1], 'base64'),
              contentType: a.contentType || 'application/octet-stream',
            };
          }
          return a;
        });
      }

      // Check and inject Open Tracking / Read Receipt pixel & Link Click Tracking
      let effectiveHtml = html;
      let trackingRecord = null;
      if (req.body.trackOpens !== false && effectiveHtml) {
        try {
          trackingRecord = await trackingService.createTracking({
            userId: req.user.id,
            accountId: resolvedAccountId,
            recipientEmail: actualTo,
            subject: subject || '',
          });
          if (trackingRecord?.tracking_token) {
            effectiveHtml = trackingService.injectTrackingPixel(effectiveHtml, trackingRecord.tracking_token);
            effectiveHtml = await trackingService.wrapLinksWithTracking(effectiveHtml, trackingRecord.id);
          }
        } catch (trackErr) {
          logger.warn({ err: trackErr.message }, 'Failed to create tracking token');
        }
      }

      // Check and schedule "Bump If No Reply" reminder
      if (req.body.remindIfNoReply) {
        try {
          const { scheduleFollowUp } = await import('../services/followUpService.js');
          await scheduleFollowUp({
            userId: req.user.id,
            recipientEmail: actualTo,
            subject: subject || '',
            remindAfterDays: req.body.remindAfterDays ? parseInt(req.body.remindAfterDays, 10) : 3,
            customDate: req.body.remindCustomDate || null,
          });
        } catch (remindErr) {
          logger.warn({ err: remindErr.message }, 'Failed to schedule follow-up reminder');
        }
      }

      // Check if user requested an Undo Send cancellation delay buffer
      const undoDelay = Number(req.body.undoDelaySeconds || 0);
      if (undoDelay > 0) {
        const queued = await undoSendService.queueOutboundMessage({
          user: req.user,
          emailPayload: {
            from: fromAddress,
            to: actualTo,
            cc,
            bcc,
            subject,
            html: effectiveHtml,
            text,
            attachments: normalizedAttachments,
          },
          delaySeconds: undoDelay,
          reqMetadata: {
            ip: req.ip,
            reverseMapping,
          },
          accountId: resolvedAccountId,
          getIMAPConnection,
        });

        return res.json({
          message: 'Email queued in undo-send buffer',
          dispatchId: queued.dispatchId,
          delaySeconds: queued.delaySeconds,
          scheduledAt: queued.scheduledAt,
          status: 'queued_undo',
          trackingToken: trackingRecord?.tracking_token || null,
        });
      }

      // Direct send: register in outbox with 'sending' status
      const directDispatchId = uuidv4();
      await outboxService.createOutboxEntry({
        userId: req.user.id,
        dispatchId: directDispatchId,
        emailPayload: {
          from: fromAddress,
          to: actualTo,
          cc,
          bcc,
          subject,
          html: effectiveHtml,
          text,
          attachments: normalizedAttachments,
        },
        status: 'sending',
      });

      let result;
      try {
        result = await smtpService.sendEmail(transporter, {
          from: fromAddress,
          to: actualTo,
          cc,
          bcc,
          subject,
          html: effectiveHtml,
          text,
          attachments: normalizedAttachments,
        });
        await outboxService.updateOutboxStatus(directDispatchId, { status: 'sent', sentAt: new Date() });
        autoLearnRecipients(req.user.id, [actualTo, cc, bcc]);
      } catch (smtpErr) {
        await outboxService.updateOutboxStatus(directDispatchId, { status: 'failed', errorMessage: smtpErr.message });
        throw smtpErr;
      }

      // Record to Domain-Wide Compliance Archive (archive@wox.world)
      complianceArchiveService.archiveEmail({
        direction: 'outbound',
        mailboxOwnerId: req.user.id,
        mailboxOwnerEmail: req.user.email,
        senderAddress: senderEmail,
        senderName: req.user.display_name || req.user.username,
        recipientAddresses: [actualTo],
        ccAddresses: cc ? (Array.isArray(cc) ? cc : [cc]) : [],
        bccAddresses: bcc ? (Array.isArray(bcc) ? bcc : [bcc]) : [],
        subject,
        bodyHtml: html,
        bodyText: text,
        attachments: normalizedAttachments,
        ipAddress: req.ip,
        provider: 'woxmail',
        messageId: result.messageId,
      }).catch((archErr) => logger.warn({ err: archErr.message }, 'Failed to record compliance archive on send'));

      // Dispatch webhook event asynchronously
      webhookDispatcher.dispatchEvent(req.user.id, 'mail.sent', {
        to: actualTo,
        subject,
        messageId: result.messageId,
        isReverseAlias: !!reverseMapping,
        timestamp: new Date().toISOString(),
      });

      // Audit log
      await query(
        `INSERT INTO audit_log (actor_type, actor_id, action, details, ip_address)
         VALUES ('user', $1, 'send_email', $2, $3)`,
        [String(req.user.id), JSON.stringify({ to: actualTo, subject, messageId: result.messageId, isReverseAlias: !!reverseMapping, from: fromAddress }), req.ip]
      );

      // Update daily stats
      await query(
        `INSERT INTO daily_stats (date, emails_sent)
         VALUES (CURRENT_DATE, 1)
         ON CONFLICT (date) DO UPDATE SET emails_sent = daily_stats.emails_sent + 1`
      );

      // Append copy to user's Sent IMAP folder
      try {
        const client = await getIMAPConnection(req.user, req.query.accountId || req.headers['x-account-id']);
        if (client) {
          await smtpService.saveSentMessage(client, {
            from: fromAddress,
            to: actualTo,
            cc,
            bcc,
            subject,
            html,
            text,
            attachments: normalizedAttachments,
            messageId: result.messageId,
            date: new Date(),
          });
        }
      } catch (saveErr) {
        logger.warn({ err: saveErr.message }, 'Failed to append sent message to Sent folder');
      }

      res.json({
        message: 'Email sent',
        messageId: result.messageId,
        trackingToken: trackingRecord?.tracking_token || null,
      });
    } catch (err) {
      next(err);
    }
  }
);

/**
 * POST /api/mail/undo-send/:dispatchId
 * Cancel an outbound email before the grace window completes.
 */
router.post('/undo-send/:dispatchId', async (req, res, next) => {
  try {
    const { dispatchId } = req.params;
    const result = undoSendService.cancelUndoSend(req.user.id, dispatchId);
    if (!result.success) {
      return res.status(400).json(result);
    }
    res.json(result);
  } catch (err) {
    next(err);
  }
});

/**
 * GET /api/mail/outbox
 * Fetch paginated outbox messages.
 */
router.get('/outbox', async (req, res, next) => {
  try {
    const { page, limit } = parsePagination(req.query);
    const result = await outboxService.getOutboxMessages(req.user.id, { page, limit });
    res.json(result);
  } catch (err) {
    next(err);
  }
});

/**
 * GET /api/mail/outbox/:id
 * Fetch single outbox message details.
 */
router.get('/outbox/:id', async (req, res, next) => {
  try {
    const msg = await outboxService.getOutboxMessageById(req.user.id, req.params.id);
    if (!msg) return res.status(404).json({ error: 'Outbox message not found' });
    res.json(msg);
  } catch (err) {
    next(err);
  }
});

/**
 * POST /api/mail/outbox/:id/retry
 * Retry sending a failed or queued outbox email.
 */
router.post('/outbox/:id/retry', async (req, res, next) => {
  try {
    const msg = await outboxService.getOutboxMessageById(req.user.id, req.params.id);
    if (!msg) return res.status(404).json({ error: 'Outbox message not found' });
    if (msg.status === 'sent') return res.status(400).json({ error: 'Message already sent' });

    // Retrieve user SMTP credentials
    const creds = await query('SELECT imap_password FROM users WHERE id = $1', [req.user.id]);
    const smtpPassword = creds.rows[0]?.imap_password;
    if (!smtpPassword) {
      return res.status(500).json({ error: 'Mail sending credentials not configured.' });
    }

    await outboxService.updateOutboxStatus(msg.outboxId, { status: 'sending' });

    const transporter = smtpService.createTransporter(req.user.email, smtpPassword);
    const result = await smtpService.sendEmail(transporter, {
      from: msg.from.address,
      to: msg.to.map((r) => r.address).join(', '),
      cc: msg.cc?.map((r) => r.address).join(', ') || undefined,
      bcc: msg.bcc?.map((r) => r.address).join(', ') || undefined,
      subject: msg.subject,
      html: msg.html,
      text: msg.text,
      attachments: msg.attachments,
    });

    await outboxService.updateOutboxStatus(msg.outboxId, { status: 'sent', sentAt: new Date() });

    // Append copy to user's Sent folder
    try {
      const client = await getIMAPConnection(req.user, req.query.accountId || req.headers['x-account-id']);
      if (client) {
        await smtpService.saveSentMessage(client, {
          from: msg.from.address,
          to: msg.to.map((r) => r.address).join(', '),
          cc: msg.cc?.map((r) => r.address).join(', ') || undefined,
          bcc: msg.bcc?.map((r) => r.address).join(', ') || undefined,
          subject: msg.subject,
          html: msg.html,
          text: msg.text,
          attachments: msg.attachments,
          messageId: result.messageId,
          date: new Date(),
        });
      }
    } catch (saveErr) {
      logger.warn({ err: saveErr.message }, 'Failed to save retried message to Sent folder');
    }

    res.json({ message: 'Email resent successfully', messageId: result.messageId });
  } catch (err) {
    await outboxService.updateOutboxStatus(req.params.id, { status: 'failed', errorMessage: err.message });
    res.status(500).json({ error: `Retry failed: ${err.message}` });
  }
});

/**
 * POST /api/mail/outbox/:id/cancel
 * Cancel a pending or failed outbox email and return its draft for composition.
 */
router.post('/outbox/:id/cancel', async (req, res, next) => {
  try {
    const msg = await outboxService.getOutboxMessageById(req.user.id, req.params.id);
    if (!msg) return res.status(404).json({ error: 'Outbox message not found' });

    if (msg.dispatchId) {
      undoSendService.cancelUndoSend(req.user.id, msg.dispatchId);
    }

    await outboxService.deleteOutboxMessage(req.user.id, msg.outboxId);
    res.json({
      success: true,
      message: 'Outbox email cancelled',
      draft: {
        from: msg.from.address,
        to: msg.to.map((r) => r.address).join(', '),
        cc: msg.cc?.map((r) => r.address).join(', ') || '',
        bcc: msg.bcc?.map((r) => r.address).join(', ') || '',
        subject: msg.subject,
        html: msg.html,
        text: msg.text,
      },
    });
  } catch (err) {
    next(err);
  }
});

/**
 * DELETE /api/mail/outbox/:id
 * Discard outbox entry.
 */
router.delete('/outbox/:id', async (req, res, next) => {
  try {
    const deleted = await outboxService.deleteOutboxMessage(req.user.id, req.params.id);
    if (!deleted) return res.status(404).json({ error: 'Outbox message not found' });
    res.json({ success: true, message: 'Outbox message deleted' });
  } catch (err) {
    next(err);
  }
});

/**
 * POST /api/mail/reply
 * Reply or Reply All to a message (with optional attachments).
 */
router.post('/reply',
  validate({
    uid: { type: 'number', required: true },
    html: { type: 'string' },
    text: { type: 'string' },
    replyAll: { type: 'boolean', default: false },
    attachments: { type: 'array' },
  }),
  async (req, res, next) => {
    try {
      const { uid, html, text, replyAll, attachments } = req.body;
      const folder = req.body.folder || 'INBOX';

      // Fetch original message for headers
      const client = await getIMAPConnection(req.user, req.query.accountId || req.headers['x-account-id']);
      const original = await imapService.fetchMessage(client, folder, uid);
      if (!original) return res.status(404).json({ error: 'Original message not found' });

      const { simpleParser } = await import('mailparser');
      const parsed = await simpleParser(original.source);

      // Build reply recipients
      const replyTo = parsed.replyTo?.value?.[0]?.address || parsed.from?.value?.[0]?.address;
      let to = replyTo;
      let cc;

      if (replyAll) {
        const allRecipients = [
          ...(parsed.to?.value || []),
          ...(parsed.cc?.value || []),
        ]
          .map((r) => r.address)
          .filter((addr) => addr !== req.user.email);

        to = replyTo;
        cc = allRecipients.join(', ') || undefined;
      }

      const subject = parsed.subject?.startsWith('Re:')
        ? parsed.subject
        : `Re: ${parsed.subject || ''}`;

      // Pre-Flight Recipient Verification
      const recipientCheck = await emailVerifier.verifyRecipientList([to, cc].filter(Boolean));
      if (!recipientCheck.valid) {
        return res.status(400).json({ error: `Reply blocked: ${recipientCheck.invalidEmails[0].reason}` });
      }

      // Get SMTP transporter (supports Gmail, Outlook, Yahoo, and Sovereign Purelymail)
      const { transporter, senderEmail: defaultSenderEmail } = await smtpService.getTransporterForUser(
        req.user.id,
        req.query.accountId || req.headers['x-account-id']
      );

      // Normalize attachments if sent as base64 data URLs
      let normalizedAttachments = [];
      if (Array.isArray(attachments)) {
        normalizedAttachments = attachments.map((a) => {
          if (typeof a.content === 'string' && a.content.includes('base64,')) {
            const parts = a.content.split('base64,');
            return {
              filename: a.filename || 'attachment',
              content: Buffer.from(parts[1], 'base64'),
              contentType: a.contentType || 'application/octet-stream',
            };
          }
          return a;
        });
      }

      // Determine reply sender (supports explicit from as alias or auto-detect from original message headers)
      let senderEmail = req.user.email;

      if (req.body.from) {
        const requested = String(req.body.from).trim().toLowerCase();
        const cleanRequested = requested.includes('<') ? requested.replace(/.*<([^>]+)>.*/, '$1').trim() : requested;
        if (cleanRequested === req.user.email.toLowerCase()) {
          senderEmail = req.user.email;
        } else {
          const aliasRes = await query(
            'SELECT alias_address FROM email_aliases WHERE user_id = $1 AND LOWER(alias_address) = $2 AND enabled = TRUE',
            [req.user.id, cleanRequested]
          );
          if (aliasRes.rows.length > 0) {
            senderEmail = aliasRes.rows[0].alias_address;
          } else {
            return res.status(403).json({ error: `Cannot reply from unauthorized address: ${cleanRequested}` });
          }
        }
      } else {
        // Privacy Guard: Auto-detect if incoming email was addressed to one of user's active aliases
        const allOriginalRecipients = [
          ...(parsed.to?.value || []),
          ...(parsed.cc?.value || []),
        ].map((r) => (r.address || '').toLowerCase());

        const aliasRes = await query(
          'SELECT alias_address FROM email_aliases WHERE user_id = $1 AND enabled = TRUE',
          [req.user.id]
        );
        const userAliases = aliasRes.rows.map((r) => r.alias_address.toLowerCase());
        const matchedAlias = userAliases.find((alias) => allOriginalRecipients.includes(alias));

        if (matchedAlias) {
          senderEmail = matchedAlias;
          logger.info({ matchedAlias, userId: req.user.id }, 'Automatically selected alias as reply sender to protect primary identity');
        }
      }

      const fromAddr = `${req.user.display_name || req.user.username} <${senderEmail}>`;

      // Register in outbox tracking
      const replyDispatchId = uuidv4();
      await outboxService.createOutboxEntry({
        userId: req.user.id,
        dispatchId: replyDispatchId,
        emailPayload: {
          from: fromAddr,
          to,
          cc,
          subject,
          html,
          text,
          attachments: normalizedAttachments,
        },
        status: 'sending',
      });

      let result;
      try {
        result = await smtpService.sendEmail(transporter, {
          from: fromAddr,
          to, cc, subject, html, text,
          attachments: normalizedAttachments,
          inReplyTo: parsed.messageId,
          references: [
            ...(parsed.references || []),
            parsed.messageId,
          ].filter(Boolean).join(' '),
        });
        await outboxService.updateOutboxStatus(replyDispatchId, { status: 'sent', sentAt: new Date() });
        autoLearnRecipients(req.user.id, [to, cc]);
      } catch (replyErr) {
        await outboxService.updateOutboxStatus(replyDispatchId, { status: 'failed', errorMessage: replyErr.message });
        throw replyErr;
      }

      // Append copy to user's Sent IMAP folder
      try {
        if (client) {
          await smtpService.saveSentMessage(client, {
            from: fromAddr,
            to,
            cc,
            subject,
            html,
            text,
            attachments: normalizedAttachments,
            messageId: result.messageId,
            inReplyTo: parsed.messageId,
            date: new Date(),
          });
        }
      } catch (saveErr) {
        logger.warn({ err: saveErr.message }, 'Failed to append reply to Sent folder');
      }

      res.json({ message: 'Reply sent', messageId: result.messageId });
    } catch (err) {
      next(err);
    }
  }
);

/**
 * POST /api/mail/forward
 * Forward a message (with original + new attachments).
 */
router.post('/forward',
  validate({
    uid: { type: 'number', required: true },
    to: { type: 'string', required: true },
    html: { type: 'string' },
    text: { type: 'string' },
    attachments: { type: 'array' },
  }),
  async (req, res, next) => {
    try {
      const { uid, to, html, text, attachments: newAttachments } = req.body;
      const folder = req.body.folder || 'INBOX';

      const client = await getIMAPConnection(req.user, req.query.accountId || req.headers['x-account-id']);
      const original = await imapService.fetchMessage(client, folder, uid);
      if (!original) return res.status(404).json({ error: 'Original message not found' });

      const { simpleParser } = await import('mailparser');
      const parsed = await simpleParser(original.source);

      const subject = parsed.subject?.startsWith('Fwd:')
        ? parsed.subject
        : `Fwd: ${parsed.subject || ''}`;

      // Re-attach original attachments
      const originalAttachments = (parsed.attachments || []).map((att) => ({
        filename: att.filename,
        content: att.content,
        contentType: att.contentType,
      }));

      // Normalize any newly attached files
      let extraAttachments = [];
      if (Array.isArray(newAttachments)) {
        extraAttachments = newAttachments.map((a) => {
          if (typeof a.content === 'string' && a.content.includes('base64,')) {
            const parts = a.content.split('base64,');
            return {
              filename: a.filename || 'attachment',
              content: Buffer.from(parts[1], 'base64'),
              contentType: a.contentType || 'application/octet-stream',
            };
          }
          return a;
        });
      }

      const allAttachments = [...originalAttachments, ...extraAttachments];

      // Pre-Flight Recipient Verification
      const recipientCheck = await emailVerifier.verifyRecipientList([to].filter(Boolean));
      if (!recipientCheck.valid) {
        return res.status(400).json({ error: `Forward blocked: ${recipientCheck.invalidEmails[0].reason}` });
      }

      // Get SMTP transporter (supports Gmail, Outlook, Yahoo, and Sovereign Purelymail)
      const { transporter, senderEmail: defaultSenderEmail } = await smtpService.getTransporterForUser(
        req.user.id,
        req.query.accountId || req.headers['x-account-id']
      );

      // Check if user specified a custom sender address (such as an alias)
      let senderEmail = req.user.email;
      if (req.body.from) {
        const requested = String(req.body.from).trim().toLowerCase();
        const cleanRequested = requested.includes('<') ? requested.replace(/.*<([^>]+)>.*/, '$1').trim() : requested;
        if (cleanRequested === req.user.email.toLowerCase()) {
          senderEmail = req.user.email;
        } else {
          const aliasRes = await query(
            'SELECT alias_address FROM email_aliases WHERE user_id = $1 AND LOWER(alias_address) = $2 AND enabled = TRUE',
            [req.user.id, cleanRequested]
          );
          if (aliasRes.rows.length > 0) {
            senderEmail = aliasRes.rows[0].alias_address;
          } else {
            return res.status(403).json({ error: `Cannot forward from unauthorized address: ${cleanRequested}` });
          }
        }
      }

      const fromAddr = `${req.user.display_name || req.user.username} <${senderEmail}>`;

      // Register in outbox tracking
      const fwdDispatchId = uuidv4();
      await outboxService.createOutboxEntry({
        userId: req.user.id,
        dispatchId: fwdDispatchId,
        emailPayload: {
          from: fromAddr,
          to,
          subject,
          html,
          text,
          attachments: allAttachments,
        },
        status: 'sending',
      });

      let result;
      try {
        result = await smtpService.sendEmail(transporter, {
          from: fromAddr,
          to, subject, html, text,
          attachments: allAttachments,
        });
        await outboxService.updateOutboxStatus(fwdDispatchId, { status: 'sent', sentAt: new Date() });
        autoLearnRecipients(req.user.id, [to]);
      } catch (fwdErr) {
        await outboxService.updateOutboxStatus(fwdDispatchId, { status: 'failed', errorMessage: fwdErr.message });
        throw fwdErr;
      }

      // Append copy to user's Sent IMAP folder
      try {
        if (client) {
          await smtpService.saveSentMessage(client, {
            from: fromAddr,
            to,
            subject,
            html,
            text,
            attachments: allAttachments,
            messageId: result.messageId,
            date: new Date(),
          });
        }
      } catch (saveErr) {
        logger.warn({ err: saveErr.message }, 'Failed to append forwarded message to Sent folder');
      }

      res.json({ message: 'Forwarded', messageId: result.messageId });
    } catch (err) {
      next(err);
    }
  }
);

/**
 * POST /api/mail/draft
 * Save a draft.
 */
router.post('/draft',
  validate({
    to: { type: 'string' },
    subject: { type: 'string', max: 500 },
    html: { type: 'string' },
    text: { type: 'string' },
  }),
  async (req, res, next) => {
    try {
      const { to, subject, html, text } = req.body;
      const client = await getIMAPConnection(req.user, req.query.accountId || req.headers['x-account-id']);
      if (client) {
        const MailComposer = (await import('nodemailer/lib/mail-composer/index.js')).default;
        const composer = new MailComposer({
          from: req.user.email,
          to: to || '',
          subject: subject || '(Draft)',
          html: html || '',
          text: text || '',
          date: new Date(),
        });
        const rawMessage = await composer.compile().build();
        await imapService.appendMessage(client, 'Drafts', rawMessage, ['\\Draft', '\\Seen']);
      }
      res.status(201).json({ message: 'Draft saved' });
    } catch (err) {
      next(err);
    }
  }
);

/**
 * GET /api/mail/drafts
 * List drafts.
 */
router.get('/drafts', async (req, res, next) => {
  try {
    const client = await getIMAPConnection(req.user, req.query.accountId || req.headers['x-account-id']);
    const { page, limit } = parsePagination(req.query);
    const { messages, total } = await imapService.fetchMessages(client, 'Drafts', { page, limit });
    res.json({ messages, pagination: paginationMeta(total, page, limit) });
  } catch (err) {
    next(err);
  }
});

// ═════════════════════════════════════════════════════════
// MESSAGE ACTIONS
// ═════════════════════════════════════════════════════════

/**
 * POST /api/mail/move
 * Move message(s) to a different folder.
 */
router.post('/move',
  validate({
    uids: { type: 'array', required: true, min: 1 },
    from: { type: 'string', required: true },
    to: { type: 'string', required: true },
  }),
  async (req, res, next) => {
    try {
      const client = await getIMAPConnection(req.user, req.query.accountId || req.headers['x-account-id']);
      await imapService.moveMessages(client, req.body.from, req.body.uids, req.body.to);
      res.json({ message: `Moved ${req.body.uids.length} message(s)` });
    } catch (err) {
      next(err);
    }
  }
);

/**
 * POST /api/mail/batch
 * Batch operations on multiple messages.
 * Actions: delete, read, unread, star, unstar, move
 */
router.post('/batch',
  validate({
    uids: { type: 'array', required: true, min: 1 },
    action: { type: 'string', required: true, enum: ['delete', 'read', 'unread', 'star', 'unstar', 'move', 'archive', 'spam'] },
    folder: { type: 'string', default: 'INBOX' },
    moveTo: { type: 'string' },
    permanent: { type: 'boolean' },
  }),
  async (req, res, next) => {
    try {
      const client = await getIMAPConnection(req.user, req.query.accountId || req.headers['x-account-id']);
      const { uids, action, folder, moveTo, permanent } = req.body;

      switch (action) {
        case 'delete': {
          const isTrash = (folder || 'INBOX').toLowerCase() === 'trash';
          if (isTrash || permanent === true) {
            await imapService.deleteMessages(client, folder, uids);
            return res.json({ message: `Permanently deleted ${uids.length} message(s)`, permanent: true, uids });
          } else {
            let moveRes;
            try {
              moveRes = await imapService.moveMessages(client, folder, uids, 'Trash');
            } catch (err) {
              await client.mailboxCreate('Trash').catch(() => {});
              moveRes = await imapService.moveMessages(client, folder, uids, 'Trash');
            }
            const trashUids = moveRes?.newUids?.length > 0 ? moveRes.newUids : uids;
            return res.json({
              message: `Moved ${uids.length} message(s) to Trash`,
              movedToTrash: true,
              fromFolder: folder,
              originalUids: uids,
              trashUids,
              newUids: trashUids,
              uidMap: moveRes?.uidMap || {},
            });
          }
        }
        case 'read':
          await imapService.toggleFlag(client, folder, uids, '\\Seen', true);
          break;
        case 'unread':
          await imapService.toggleFlag(client, folder, uids, '\\Seen', false);
          break;
        case 'star':
          await imapService.toggleFlag(client, folder, uids, '\\Flagged', true);
          break;
        case 'unstar':
          await imapService.toggleFlag(client, folder, uids, '\\Flagged', false);
          break;
        case 'move': {
          if (!moveTo) return res.status(400).json({ error: 'moveTo is required for move action' });
          const moveRes = await imapService.moveMessages(client, folder, uids, moveTo);
          return res.json({
            message: `Moved ${uids.length} message(s)`,
            newUids: moveRes?.newUids || uids,
            uidMap: moveRes?.uidMap || {},
          });
        }
        case 'archive': {
          let moveRes;
          try {
            moveRes = await imapService.moveMessages(client, folder, uids, 'Archive');
          } catch {
            await client.mailboxCreate('Archive').catch(() => {});
            moveRes = await imapService.moveMessages(client, folder, uids, 'Archive');
          }
          const archiveUids = moveRes?.newUids?.length > 0 ? moveRes.newUids : uids;
          return res.json({
            message: `Archived ${uids.length} message(s)`,
            archived: true,
            fromFolder: folder,
            originalUids: uids,
            archiveUids,
            newUids: archiveUids,
            uidMap: moveRes?.uidMap || {},
          });
        }
        case 'spam': {
          let moveRes;
          try {
            moveRes = await imapService.moveMessages(client, folder, uids, 'Junk');
          } catch {
            await client.mailboxCreate('Junk').catch(() => {});
            moveRes = await imapService.moveMessages(client, folder, uids, 'Junk');
          }
          const spamUids = moveRes?.newUids?.length > 0 ? moveRes.newUids : uids;
          return res.json({
            message: `Marked ${uids.length} message(s) as spam`,
            fromFolder: folder,
            originalUids: uids,
            spamUids,
            newUids: spamUids,
            uidMap: moveRes?.uidMap || {},
          });
        }
      }

      res.json({ message: `${action} applied to ${uids.length} message(s)` });
    } catch (err) {
      next(err);
    }
  }
);

/**
 * PUT /api/mail/star/:uid
 * Toggle star flag.
 */
router.put('/star/:uid', async (req, res, next) => {
  try {
    const client = await getIMAPConnection(req.user, req.query.accountId || req.headers['x-account-id']);
    const folder = req.query.folder || 'INBOX';
    const uid = parseInt(req.params.uid, 10);
    const add = req.body.starred !== false;

    await imapService.toggleFlag(client, folder, [uid], '\\Flagged', add);
    res.json({ starred: add });
  } catch (err) {
    next(err);
  }
});

/**
 * PUT /api/mail/read/:uid
 * Toggle read/unread flag.
 */
router.put('/read/:uid', async (req, res, next) => {
  try {
    const client = await getIMAPConnection(req.user, req.query.accountId || req.headers['x-account-id']);
    const folder = req.query.folder || 'INBOX';
    const uid = parseInt(req.params.uid, 10);
    const add = req.body.read !== false;

    await imapService.toggleFlag(client, folder, [uid], '\\Seen', add);
    res.json({ read: add });
  } catch (err) {
    next(err);
  }
});

/**
 * PUT /api/mail/spam/:uid
 * Mark as spam (move to Spam/Junk folder).
 */
router.put('/spam/:uid', async (req, res, next) => {
  try {
    const client = await getIMAPConnection(req.user, req.query.accountId || req.headers['x-account-id']);
    const folder = req.query.folder || 'INBOX';
    const uid = parseInt(req.params.uid, 10);

    await imapService.moveMessages(client, folder, [uid], 'Junk');
    res.json({ message: 'Marked as spam' });
  } catch (err) {
    next(err);
  }
});

/**
 * DELETE /api/mail/message/:uid
 * Delete message or move to Trash.
 */
router.delete('/message/:uid', async (req, res, next) => {
  try {
    const client = await getIMAPConnection(req.user, req.query.accountId || req.headers['x-account-id']);
    const folder = req.query.folder || 'INBOX';
    const uid = parseInt(req.params.uid, 10);
    const permanent = req.query.permanent === 'true' || folder.toLowerCase() === 'trash';

    if (permanent) {
      await imapService.deleteMessages(client, folder, [uid]);
      res.json({ message: 'Message permanently deleted', uid });
    } else {
      await imapService.moveMessages(client, folder, [uid], 'Trash').catch(async () => {
        await client.mailboxCreate('Trash').catch(() => {});
        await imapService.moveMessages(client, folder, [uid], 'Trash');
      });
      res.json({ message: 'Message moved to Trash', uid });
    }
  } catch (err) {
    next(err);
  }
});

/**
 * POST /api/mail/search
 * Search messages by query string.
 */
router.post('/search',
  async (req, res, next) => {
    try {
      const client = await getIMAPConnection(req.user, req.query.accountId || req.headers['x-account-id']);
      if (!client) {
        return res.json({ results: [], total: 0 });
      }
      const {
        query: searchQuery,
        folder = 'INBOX',
        from,
        to,
        subject,
        hasAttachment,
        isStarred,
        isUnread,
        since,
        before
      } = req.body;

      // Build IMAP search criteria
      const criteria = {};

      if (searchQuery && typeof searchQuery === 'string' && searchQuery.trim()) {
        const q = searchQuery.trim();
        // Check for operator syntax: from:user, to:user, subject:text, has:attachment, is:unread, is:starred
        const fromMatch = q.match(/from:([^\s]+)/i);
        const toMatch = q.match(/to:([^\s]+)/i);
        const subMatch = q.match(/subject:([^\s]+)/i);

        if (fromMatch) criteria.from = fromMatch[1];
        if (toMatch) criteria.to = toMatch[1];
        if (subMatch) criteria.subject = subMatch[1];
        if (/is:unread/i.test(q)) criteria.unseen = true;
        if (/is:starred/i.test(q)) criteria.flagged = true;

        const cleanText = q.replace(/(from|to|subject|has|is|before|after):[^\s]+/gi, '').trim();
        if (cleanText) {
          criteria.or = [
            { subject: cleanText },
            { from: cleanText },
            { to: cleanText },
            { body: cleanText }
          ];
        }
      }

      if (from) criteria.from = from;
      if (to) criteria.to = to;
      if (subject) criteria.subject = subject;
      if (isUnread) criteria.unseen = true;
      if (isStarred) criteria.flagged = true;
      if (since) criteria.since = new Date(since);
      if (before) criteria.before = new Date(before);

      const uids = await imapService.searchMessages(client, folder, criteria);

      // Fetch matched messages (limit to 50)
      const limitedUids = uids.slice(0, 50);
      const messages = [];

      if (limitedUids.length > 0) {
        const lock = await client.getMailboxLock(folder);
        try {
          for await (const msg of client.fetch(limitedUids.join(','), {
            envelope: true, flags: true, uid: true, size: true,
          }, { uid: true })) {
            messages.push({
              uid: msg.uid,
              subject: msg.envelope?.subject || '(no subject)',
              from: msg.envelope?.from?.[0] || null,
              date: msg.envelope?.date || null,
              isRead: msg.flags?.has('\\Seen') || false,
              isStarred: msg.flags?.has('\\Flagged') || false,
              size: msg.size || 0,
            });
          }
        } finally {
          lock.release();
        }
      }

      res.json({ results: messages, total: uids.length });
    } catch (err) {
      next(err);
    }
  }
);

/**
 * GET /api/mail/proxy-image
 * Proxy external images to prevent tracking.
 */
router.get('/proxy-image', async (req, res, next) => {
  try {
    const { url } = req.query;
    if (!url) return res.status(400).json({ error: 'url parameter required' });

    // Only proxy http(s) URLs
    if (!url.startsWith('http://') && !url.startsWith('https://')) {
      return res.status(400).json({ error: 'Invalid URL' });
    }

    const response = await fetch(url, {
      headers: { 'User-Agent': 'WoxMail-ImageProxy/1.0' },
      signal: AbortSignal.timeout(10000),
    });

    if (!response.ok) return res.status(502).end();

    const contentType = response.headers.get('content-type');
    if (!contentType?.startsWith('image/')) {
      return res.status(400).json({ error: 'Not an image' });
    }

    res.setHeader('Content-Type', contentType);
    res.setHeader('Cache-Control', 'public, max-age=86400');
    const buffer = await response.arrayBuffer();
    res.send(Buffer.from(buffer));
  } catch (err) {
    next(err);
  }
});

// ─── Scheduled Send ──────────────────────────────────────

/**
 * POST /api/mail/schedule
 * Schedule an email for future sending.
 */
router.post('/schedule',
  validate({
    to: { type: 'array', required: true },
    subject: { type: 'string', required: true },
    bodyHtml: { type: 'string', required: true },
    bodyText: { type: 'string' },
    cc: { type: 'array' },
    bcc: { type: 'array' },
    sendAt: { type: 'string', required: true },
  }),
  async (req, res, next) => {
    try {
      const sendAt = new Date(req.body.sendAt);
      if (sendAt <= new Date()) {
        return res.status(400).json({ error: 'Send time must be in the future' });
      }

      const result = await query(
        `INSERT INTO scheduled_emails (user_id, to_addresses, cc_addresses, bcc_addresses, subject, body_html, body_text, send_at)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
         RETURNING *`,
        [req.user.id, req.body.to, req.body.cc || [], req.body.bcc || [], req.body.subject, req.body.bodyHtml, req.body.bodyText || '', sendAt]
      );

      res.status(201).json({ scheduled: result.rows[0] });
    } catch (err) {
      next(err);
    }
  }
);

/**
 * GET /api/mail/schedule
 * List pending scheduled emails.
 */
router.get('/schedule', async (req, res, next) => {
  try {
    const result = await query(
      'SELECT * FROM scheduled_emails WHERE user_id = $1 AND sent = FALSE ORDER BY send_at ASC',
      [req.user.id]
    );
    res.json({ scheduled: result.rows });
  } catch (err) {
    next(err);
  }
});

/**
 * DELETE /api/mail/schedule/:id
 * Cancel a scheduled email.
 */
router.delete('/schedule/:id', async (req, res, next) => {
  try {
    const result = await query(
      'DELETE FROM scheduled_emails WHERE user_id = $1 AND id = $2 AND sent = FALSE RETURNING id',
      [req.user.id, parseInt(req.params.id, 10)]
    );
    if (result.rows.length === 0) return res.status(404).json({ error: 'Scheduled email not found' });
    res.json({ message: 'Scheduled email cancelled' });
  } catch (err) {
    next(err);
  }
});

// ─── Snooze ──────────────────────────────────────────────

/**
 * POST /api/mail/snooze
 * Snooze an email until a specified time.
 */
router.post('/snooze',
  async (req, res, next) => {
    try {
      const messageUid = parseInt(req.body.messageUid || req.body.uid, 10);
      const folder = req.body.folder || 'INBOX';
      const snoozeUntilStr = req.body.snoozeUntil;

      if (!messageUid || !snoozeUntilStr) {
        return res.status(400).json({ error: 'messageUid and snoozeUntil are required' });
      }

      const snoozeUntil = new Date(snoozeUntilStr);
      if (snoozeUntil <= new Date()) {
        return res.status(400).json({ error: 'Snooze time must be in the future' });
      }

      const result = await query(
        `INSERT INTO snoozed_emails (user_id, message_uid, original_folder, snooze_until)
         VALUES ($1, $2, $3, $4)
         ON CONFLICT (user_id, message_uid) DO UPDATE SET snooze_until = $4, unsnoozed = FALSE
         RETURNING *`,
        [req.user.id, messageUid, folder, snoozeUntil]
      );

      res.status(201).json({ success: true, snoozed: result.rows[0] });
    } catch (err) {
      next(err);
    }
  }
);

/**
 * GET /api/mail/snooze and GET /api/mail/snoozed
 * List active snoozed emails.
 */
const handleListSnooze = async (req, res, next) => {
  try {
    const result = await query(
      'SELECT * FROM snoozed_emails WHERE user_id = $1 AND unsnoozed = FALSE ORDER BY snooze_until ASC',
      [req.user.id]
    );
    res.json({ snoozed: result.rows });
  } catch (err) {
    next(err);
  }
};

router.get('/snooze', handleListSnooze);
router.get('/snoozed', handleListSnooze);

/**
 * DELETE /api/mail/snooze/:id
 * Cancel snooze for an email
 */
router.delete('/snooze/:id', async (req, res, next) => {
  try {
    const id = parseInt(req.params.id, 10);
    await query(
      'UPDATE snoozed_emails SET unsnoozed = TRUE WHERE (id = $1 OR message_uid = $1) AND user_id = $2',
      [id, req.user.id]
    );
    res.json({ success: true, message: 'Snooze cancelled' });
  } catch (err) {
    next(err);
  }
});

// ─── Labels ──────────────────────────────────────────────

/**
 * GET /api/mail/labels
 * List all labels for the current user.
 */
router.get('/labels', async (req, res, next) => {
  try {
    const result = await query(
      'SELECT * FROM labels WHERE user_id = $1 ORDER BY sort_order ASC, name ASC',
      [req.user.id]
    );
    res.json({ labels: result.rows });
  } catch (err) {
    next(err);
  }
});

/**
 * POST /api/mail/labels
 * Create a new label.
 */
router.post('/labels',
  validate({
    name: { type: 'string', required: true, max: 50 },
    color: { type: 'string', max: 7 },
  }),
  async (req, res, next) => {
    try {
      const result = await query(
        'INSERT INTO labels (user_id, name, color) VALUES ($1, $2, $3) RETURNING *',
        [req.user.id, req.body.name, req.body.color || '#7c3aed']
      );
      res.status(201).json({ label: result.rows[0] });
    } catch (err) {
      if (err.code === '23505') return res.status(409).json({ error: 'Label already exists' });
      next(err);
    }
  }
);

/**
 * PUT /api/mail/labels/:id
 * Update a label (name, color, sort order).
 */
router.put('/labels/:id', async (req, res, next) => {
  try {
    const id = parseInt(req.params.id, 10);
    const sets = [];
    const values = [];
    let idx = 1;

    if (req.body.name !== undefined) { sets.push(`name = $${idx++}`); values.push(req.body.name); }
    if (req.body.color !== undefined) { sets.push(`color = $${idx++}`); values.push(req.body.color); }
    if (req.body.sortOrder !== undefined) { sets.push(`sort_order = $${idx++}`); values.push(req.body.sortOrder); }

    if (sets.length === 0) return res.status(400).json({ error: 'No fields to update' });

    values.push(req.user.id, id);
    const result = await query(
      `UPDATE labels SET ${sets.join(', ')} WHERE user_id = $${idx} AND id = $${idx + 1} RETURNING *`,
      values
    );

    if (result.rows.length === 0) return res.status(404).json({ error: 'Label not found' });
    res.json({ label: result.rows[0] });
  } catch (err) {
    next(err);
  }
});

/**
 * DELETE /api/mail/labels/:id
 * Delete a label and all associations.
 */
router.delete('/labels/:id', async (req, res, next) => {
  try {
    const result = await query(
      'DELETE FROM labels WHERE user_id = $1 AND id = $2 RETURNING id',
      [req.user.id, parseInt(req.params.id, 10)]
    );
    if (result.rows.length === 0) return res.status(404).json({ error: 'Label not found' });
    res.json({ message: 'Label deleted' });
  } catch (err) {
    next(err);
  }
});

/**
 * POST /api/mail/labels/apply
 * Apply or remove labels from messages.
 */
router.post('/labels/apply',
  validate({
    messageUids: { type: 'array', required: true },
    addLabelIds: { type: 'array' },
    removeLabelIds: { type: 'array' },
  }),
  async (req, res, next) => {
    try {
      const { messageUids, addLabelIds = [], removeLabelIds = [] } = req.body;

      // Add labels
      for (const uid of messageUids) {
        for (const labelId of addLabelIds) {
          await query(
            `INSERT INTO email_labels (user_id, message_uid, label_id)
             VALUES ($1, $2, $3)
             ON CONFLICT DO NOTHING`,
            [req.user.id, uid, labelId]
          );
        }
      }

      // Remove labels
      if (removeLabelIds.length > 0) {
        for (const uid of messageUids) {
          await query(
            `DELETE FROM email_labels
             WHERE user_id = $1 AND message_uid = $2 AND label_id = ANY($3)`,
            [req.user.id, uid, removeLabelIds]
          );
        }
      }

      res.json({ message: 'Labels updated' });
    } catch (err) {
      next(err);
    }
  }
);

/**
 * GET /api/mail/unsubscribe/:uid
 * Detect List-Unsubscribe header for a message.
 */
router.get('/unsubscribe/:uid', async (req, res, next) => {
  try {
    const conn = await getConnection(req.user);
    const uid = parseInt(req.params.uid, 10);

    const message = await conn.fetchOne(uid.toString(), { source: true });
    if (!message) return res.status(404).json({ error: 'Message not found' });

    const source = message.source?.toString() || '';
    const unsubMatch = source.match(/^List-Unsubscribe:\s*(.+)$/im);

    if (!unsubMatch) {
      return res.json({ hasUnsubscribe: false });
    }

    const urls = unsubMatch[1].match(/<([^>]+)>/g)?.map((u) => u.slice(1, -1)) || [];
    const httpUrl = urls.find((u) => u.startsWith('http'));
    const mailtoUrl = urls.find((u) => u.startsWith('mailto:'));

    res.json({
      hasUnsubscribe: true,
      httpUrl: httpUrl || null,
      mailtoUrl: mailtoUrl || null,
    });
  } catch (err) {
    next(err);
  }
});

// ═════════════════════════════════════════════════════════
// THE SCREENER (FIRST-CONTACT SENDER QUARANTINE)
// ═════════════════════════════════════════════════════════

/**
 * GET /api/mail/screener/rules
 * List all screener sender & domain rules for the user.
 */
router.get('/screener/rules', async (req, res, next) => {
  try {
    const rules = await screenerService.listScreenerRules(req.user.id);
    res.json({ rules });
  } catch (err) {
    next(err);
  }
});

/**
 * POST /api/mail/screener/decide
 * Set a screening decision for a sender or domain.
 */
router.post('/screener/decide',
  validate({
    senderPattern: { type: 'string', required: true },
    matchType: { type: 'string', enum: ['exact', 'domain'], default: 'exact' },
    destination: { type: 'string', enum: ['inbox', 'feed', 'paper_trail', 'blocked'], required: true },
  }),
  async (req, res, next) => {
    try {
      const { senderPattern, matchType, destination } = req.body;
      const rule = await screenerService.setScreenerDecision(
        req.user.id,
        senderPattern,
        matchType || 'exact',
        destination
      );
      res.json({ rule, message: `Sender ${senderPattern} routed to ${destination}` });
    } catch (err) {
      next(err);
    }
  }
);

/**
 * DELETE /api/mail/screener/rules/:id
 * Delete a screener rule.
 */
router.delete('/screener/rules/:id', async (req, res, next) => {
  try {
    const id = parseInt(req.params.id, 10);
    const deleted = await screenerService.deleteScreenerRule(req.user.id, id);
    if (!deleted) return res.status(404).json({ error: 'Rule not found' });
    res.json({ message: 'Screener rule deleted' });
  } catch (err) {
    next(err);
  }
});

// ═════════════════════════════════════════════════════════
// INBOUND & EVENT WEBHOOKS
// ═════════════════════════════════════════════════════════

/**
 * GET /api/mail/webhooks
 * List user's active webhooks.
 */
router.get('/webhooks', async (req, res, next) => {
  try {
    const webhooks = await webhookDispatcher.listWebhooks(req.user.id);
    res.json({ webhooks });
  } catch (err) {
    next(err);
  }
});

/**
 * POST /api/mail/webhooks
 * Create a new webhook subscription with HMAC signing.
 */
router.post('/webhooks',
  validate({
    name: { type: 'string', required: true, max: 100 },
    targetUrl: { type: 'string', required: true, max: 500 },
    events: { type: 'array' },
  }),
  async (req, res, next) => {
    try {
      const { name, targetUrl, events } = req.body;
      const webhook = await webhookDispatcher.createWebhook(
        req.user.id,
        name,
        targetUrl,
        events || ['mail.received', 'mail.otp_extracted', 'mail.sent']
      );
      res.status(201).json({ webhook });
    } catch (err) {
      next(err);
    }
  }
);

/**
 * PUT /api/mail/webhooks/:id
 * Update a webhook configuration.
 */
router.put('/webhooks/:id', async (req, res, next) => {
  try {
    const id = parseInt(req.params.id, 10);
    const webhook = await webhookDispatcher.updateWebhook(req.user.id, id, req.body);
    if (!webhook) return res.status(404).json({ error: 'Webhook not found' });
    res.json({ webhook });
  } catch (err) {
    next(err);
  }
});

/**
 * DELETE /api/mail/webhooks/:id
 * Delete a webhook.
 */
router.delete('/webhooks/:id', async (req, res, next) => {
  try {
    const id = parseInt(req.params.id, 10);
    const deleted = await webhookDispatcher.deleteWebhook(req.user.id, id);
    if (!deleted) return res.status(404).json({ error: 'Webhook not found' });
    res.json({ message: 'Webhook deleted' });
  } catch (err) {
    next(err);
  }
});

/**
 * POST /api/mail/webhooks/:id/test
 * Dispatch a test ping event.
 */
router.post('/webhooks/:id/test', async (req, res, next) => {
  try {
    const id = parseInt(req.params.id, 10);
    const result = await webhookDispatcher.sendTestPing(req.user.id, id);
    res.json({ message: 'Test ping dispatched', result });
  } catch (err) {
    next(err);
  }
});

/**
 * GET /api/mail/webhooks/:id/deliveries
 * Fetch recent delivery logs for a webhook.
 */
router.get('/webhooks/:id/deliveries', async (req, res, next) => {
  try {
    const id = parseInt(req.params.id, 10);
    const deliveries = await webhookDispatcher.getWebhookDeliveries(req.user.id, id);
    res.json({ deliveries });
  } catch (err) {
    next(err);
  }
});

// ═════════════════════════════════════════════════════════
// REVERSE ALIASES (OUTBOUND SENDER MASKING)
// ═════════════════════════════════════════════════════════

/**
 * GET /api/mail/reverse-aliases
 * List all reverse alias mapping tokens for the user.
 */
router.get('/reverse-aliases', async (req, res, next) => {
  try {
    const reverseAliases = await reverseAliasService.listReverseAliases(req.user.id);
    res.json({ reverseAliases });
  } catch (err) {
    next(err);
  }
});

/**
 * POST /api/mail/reverse-aliases/create
 * Create a deterministic reverse reply token.
 */
router.post('/reverse-aliases/create',
  validate({
    aliasAddress: { type: 'string', required: true },
    externalEmail: { type: 'string', required: true },
  }),
  async (req, res, next) => {
    try {
      const mapping = await reverseAliasService.getOrCreateReverseAlias(
        req.user.id,
        aliasAddress,
        externalEmail
      );
      res.status(201).json({ mapping });
    } catch (err) {
      next(err);
    }
  }
);

// ═════════════════════════════════════════════════════════
// LINK PREVIEWS & WEB EMBEDS
// ═════════════════════════════════════════════════════════

/**
 * GET /api/mail/link-preview
 * Fetch OpenGraph/Twitter card metadata for a single URL with SSRF protection.
 */
router.get('/link-preview', async (req, res, next) => {
  try {
    const targetUrl = req.query.url;
    if (!targetUrl) {
      return res.status(400).json({ error: 'url query parameter is required' });
    }

    const metadata = await linkPreviewService.fetchLinkMetadata(String(targetUrl));
    res.json({ preview: metadata });
  } catch (err) {
    next(err);
  }
});

/**
 * POST /api/mail/link-previews
 * Fetch OpenGraph metadata in parallel for an array of URLs.
 */
router.post('/link-previews',
  validate({
    urls: { type: 'array', required: true, max: 10 },
  }),
  async (req, res, next) => {
    try {
      const { urls } = req.body;
      const previews = await linkPreviewService.fetchBatchLinkMetadata(urls);
      res.json({ previews });
    } catch (err) {
      next(err);
    }
  }
);

export default router;
