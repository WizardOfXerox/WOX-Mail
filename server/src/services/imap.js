import { ImapFlow } from 'imapflow';
import pino from 'pino';

const logger = pino({ name: 'woxmail:imap' });

/**
 * Create an IMAP connection for a user.
 * Each permanent user gets their own IMAP connection when they access their inbox.
 *
 * @param {string} email - User email (IMAP username)
 * @param {string} password - User IMAP password
 * @returns {ImapFlow} Connected IMAP client
 */
export async function createConnection(email, password) {
  const client = new ImapFlow({
    host: process.env.PURELYMAIL_IMAP_HOST || 'imap.purelymail.com',
    port: parseInt(process.env.PURELYMAIL_IMAP_PORT, 10) || 993,
    secure: true,
    auth: { user: email, pass: password },
    logger: false,
    emitLogs: false,
  });

  // Attach error handler to prevent unhandled 'error' events on idle socket timeouts
  client.on('error', (err) => {
    logger.warn({ email, err: err.message, code: err.code }, 'IMAP connection error handled gracefully');
  });

  await client.connect();
  logger.debug({ email }, 'IMAP connected');
  return client;
}

/**
 * Fetch the folder list for a user.
 * @param {ImapFlow} client - Connected IMAP client
 * @returns {Promise<Array<{name: string, path: string, specialUse: string, messages: number, unseen: number}>>}
 */
export async function listFolders(client) {
  const folders = [];
  const list = await client.list();

  for (const folder of list) {
    let status = { messages: 0, unseen: 0 };
    try {
      status = await client.status(folder.path, { messages: true, unseen: true });
    } catch {
      // Some folders may not support STATUS
    }

    folders.push({
      name: folder.name,
      path: folder.path,
      specialUse: folder.specialUse || null,
      delimiter: folder.delimiter,
      messages: status.messages || 0,
      unseen: status.unseen || 0,
    });
  }

  return folders;
}

/**
 * Fast folder list using client.list() without expensive STATUS round-trips.
 * Caches results on client instance for 60 seconds.
 */
export async function getFolderListFast(client) {
  if (client._cachedFolders && (Date.now() - (client._cachedFoldersTime || 0) < 60000)) {
    return client._cachedFolders;
  }
  try {
    const list = await client.list();
    const folders = (list || []).map((f) => ({
      name: f.name,
      path: f.path,
      specialUse: f.specialUse || null,
      delimiter: f.delimiter,
    }));
    client._cachedFolders = folders;
    client._cachedFoldersTime = Date.now();
    return folders;
  } catch (err) {
    logger.debug({ err: err.message }, 'Fast folder list failed');
    return [];
  }
}

/**
 * Safely acquire a mailbox lock with timeout and deadlock prevention.
 * If the timeout triggers before lock arrives, any late-arriving lock is immediately released,
 * and the client is marked unusable to prevent connection poisoning.
 */
export async function acquireMailboxLock(client, folderPath, timeoutMs = 25000) {
  let lockTimeoutOccurred = false;
  let timer;

  try {
    const lock = await Promise.race([
      client.getMailboxLock(folderPath).then((l) => {
        if (lockTimeoutOccurred) {
          try { l.release(); } catch {}
          return null;
        }
        return l;
      }),
      new Promise((_, reject) => {
        timer = setTimeout(() => {
          lockTimeoutOccurred = true;
          reject(new Error(`IMAP mailbox lock timeout (${timeoutMs}ms) on ${folderPath}`));
        }, timeoutMs);
      }),
    ]);
    return lock;
  } catch (err) {
    if (lockTimeoutOccurred) {
      client.usable = false;
      try { client.close(); } catch {}
    }
    throw err;
  } finally {
    clearTimeout(timer);
  }
}

/**
 * Resolve folder alias (e.g. 'Spam' -> 'Junk', 'Sent' -> 'Sent').
 * @param {ImapFlow} client
 * @param {string} folder
 * @returns {Promise<string>}
 */
export async function resolveFolder(client, folder) {
  if (!folder) return 'INBOX';
  const fTrimmed = folder.trim();
  const fLower = fTrimmed.toLowerCase();

  if (fLower === 'inbox' || fLower === 'inboxes') return 'INBOX';
  if (fLower === '__all_inboxes' || fLower === 'all inboxes' || fLower === 'all_inbox' || fLower === '__all') return 'INBOX';
  if (fLower === 'starred') return 'Starred';
  if (fLower === 'the feed' || fLower === 'thefeed' || fLower === '__feed') return 'The Feed';
  if (fLower === 'paper trail' || fLower === 'papertrail' || fLower === '__papertrail') return 'Paper Trail';
  if (fLower === 'outbox') return 'Outbox';

  const isGmail = Boolean(
    client?.options?.host?.includes('gmail') ||
    client?.options?.auth?.user?.endsWith('@gmail.com') ||
    client?.serverInfo?.vendor?.toLowerCase()?.includes('google')
  );

  try {
    const folders = await getFolderListFast(client);

    // 1. Direct path or name exact match (handles custom folders, Dovecot/Cyrus paths)
    let match = folders.find((f) => f.path === fTrimmed || f.name === fTrimmed || f.path.toLowerCase() === fLower || f.name.toLowerCase() === fLower);
    if (match) return match.path;

    // 2. Trailing subfolder / delimiter normalization (e.g. INBOX/Work, INBOX.Work, Projects/Alpha)
    match = folders.find((f) => {
      const pLower = f.path.toLowerCase();
      const nLower = f.name.toLowerCase();
      return pLower.endsWith('/' + fLower) || pLower.endsWith('.' + fLower) || nLower.endsWith('/' + fLower) || nLower.endsWith('.' + fLower);
    });
    if (match) return match.path;

    // 3. Provider-specific & standard RFC 6154 special-use aliases
    // Sent: Gmail [Gmail]/Sent Mail, Outlook "Sent Items", iCloud "Sent Messages", Zoho/Yahoo "Sent"
    if (fLower === 'sent' || fLower === 'sent messages' || fLower === 'sent items') {
      match = folders.find((f) => f.specialUse === '\\Sent' || f.name.toLowerCase().includes('sent') || f.path.toLowerCase().includes('sent'));
      if (match) return match.path;
      if (isGmail) return '[Gmail]/Sent Mail';
    }

    // Trash: Gmail [Gmail]/Bin, Outlook "Deleted Items", iCloud "Deleted Messages", Yahoo "Trash"
    if (fLower === 'trash' || fLower === 'deleted' || fLower === 'bin' || fLower === 'deleted items' || fLower === 'deleted messages') {
      match = folders.find((f) => f.specialUse === '\\Trash' || f.name.toLowerCase().includes('trash') || f.name.toLowerCase().includes('bin') || f.name.toLowerCase().includes('deleted') || f.path.toLowerCase().includes('trash') || f.path.toLowerCase().includes('bin') || f.path.toLowerCase().includes('deleted'));
      if (match) return match.path;
      if (isGmail) return '[Gmail]/Bin';
    }

    // Spam: Gmail [Gmail]/Spam, Outlook "Junk Email", Yahoo "Bulk Mail", iCloud/Fastmail "Junk"
    if (fLower === 'spam' || fLower === 'junk' || fLower === 'junk email' || fLower === 'bulk' || fLower === 'bulk mail') {
      match = folders.find((f) => f.specialUse === '\\Junk' || f.name.toLowerCase().includes('spam') || f.name.toLowerCase().includes('junk') || f.name.toLowerCase().includes('bulk') || f.path.toLowerCase().includes('spam') || f.path.toLowerCase().includes('junk') || f.path.toLowerCase().includes('bulk'));
      if (match) return match.path;
      if (isGmail) return '[Gmail]/Spam';
    }

    // Drafts: Gmail [Gmail]/Drafts, Yahoo "Draft", Outlook/iCloud/Zoho/Fastmail "Drafts"
    if (fLower === 'drafts' || fLower === 'draft') {
      match = folders.find((f) => f.specialUse === '\\Drafts' || f.name.toLowerCase().includes('draft') || f.path.toLowerCase().includes('draft'));
      if (match) return match.path;
      if (isGmail) return '[Gmail]/Drafts';
    }

    // Archive: Gmail [Gmail]/All Mail, Outlook/iCloud/Zoho "Archive", Fastmail "Archive"
    if (fLower === 'archive' || fLower === 'all mail' || fLower === 'archives') {
      match = folders.find((f) => f.specialUse === '\\Archive' || f.specialUse === '\\All' || f.name.toLowerCase().includes('all mail') || f.path.toLowerCase().includes('all mail') || f.name.toLowerCase().includes('archive') || f.path.toLowerCase().includes('archive'));
      if (match) return match.path;
      if (isGmail) return '[Gmail]/All Mail';
    }

    // Social: native folder or virtual filter
    if (fLower === 'social') {
      match = folders.find((f) => f.specialUse === '\\Social' || f.name.toLowerCase().includes('social') || f.path.toLowerCase().includes('social'));
      if (match) return match.path;
      return 'Social';
    }

    // Promotions: native folder or virtual filter
    if (fLower === 'promotions' || fLower === 'promotion') {
      match = folders.find((f) => f.specialUse === '\\Promotions' || f.name.toLowerCase().includes('promotion') || f.path.toLowerCase().includes('promotion'));
      if (match) return match.path;
      return 'Promotions';
    }
  } catch {
    // Fallback to static resolution if list fails
  }

  // Provider-aware static fallbacks
  if (isGmail) {
    if (fLower === 'spam' || fLower === 'junk' || fLower === 'bulk mail' || fLower === 'junk email') return '[Gmail]/Spam';
    if (fLower === 'archive' || fLower === 'all mail' || fLower === 'archives') return '[Gmail]/All Mail';
    if (fLower === 'trash' || fLower === 'bin' || fLower === 'deleted items' || fLower === 'deleted messages') return '[Gmail]/Bin';
    if (fLower === 'sent' || fLower === 'sent items' || fLower === 'sent messages') return '[Gmail]/Sent Mail';
    if (fLower === 'drafts' || fLower === 'draft') return '[Gmail]/Drafts';
  }

  if (fLower === 'spam' || fLower === 'junk' || fLower === 'bulk mail' || fLower === 'junk email') return 'Junk';
  if (fLower === 'sent' || fLower === 'sent items' || fLower === 'sent messages') return 'Sent';
  if (fLower === 'trash' || fLower === 'bin' || fLower === 'deleted items' || fLower === 'deleted messages') return 'Trash';
  if (fLower === 'drafts' || fLower === 'draft') return 'Drafts';
  if (fLower === 'archive' || fLower === 'all mail') return 'Archive';
  if (fLower === 'promotions') return 'Promotions';
  if (fLower === 'social') return 'Social';
  return folder;
}

/**
 * Fetch paginated messages from a folder.
 * @param {ImapFlow} client
 * @param {string} folder - Folder path (e.g. 'INBOX')
 * @param {object} options
 * @param {number} options.page - Page number (1-based)
 * @param {number} options.limit - Messages per page
 * @returns {Promise<{messages: Array, total: number}>}
 */
export async function fetchMessages(client, folder = 'INBOX', { page = 1, limit = 25 } = {}) {
  const resolved = await resolveFolder(client, folder);

  if (resolved === 'Starred') {
    return fetchStarredMessages(client, { page, limit });
  }
  if (resolved === 'The Feed') {
    return fetchFeedMessages(client, { page, limit });
  }
  if (resolved === 'Paper Trail') {
    return fetchPaperTrailMessages(client, { page, limit });
  }
  if (resolved === 'Promotions') {
    return fetchPromotionsMessages(client, { page, limit });
  }
  if (resolved === 'Social') {
    return fetchSocialMessages(client, { page, limit });
  }

  let lock;
  try {
    lock = await acquireMailboxLock(client, resolved, 25000);
  } catch (lockErr) {
    logger.warn({ folder: resolved, err: lockErr.message }, 'Failed to acquire mailbox lock for fetchMessages');
    return { messages: [], total: 0 };
  }

  try {
    // Search all UIDs in the mailbox
    const allUids = await client.search({ all: true }, { uid: true });
    const total = Array.isArray(allUids) ? allUids.length : 0;
    if (total === 0) return { messages: [], total: 0 };

    // Sort descending (newest UID first)
    const sortedUids = [...allUids].sort((a, b) => b - a);
    const startIdx = (page - 1) * limit;
    const pageUids = sortedUids.slice(startIdx, startIdx + limit);

    if (pageUids.length === 0) {
      return { messages: [], total };
    }

    const messages = [];

    for await (const msg of client.fetch(pageUids.join(','), {
      envelope: true,
      flags: true,
      bodyStructure: true,
      uid: true,
      size: true,
    }, { uid: true })) {
      messages.push({
        uid: msg.uid,
        seq: msg.seq,
        subject: msg.envelope?.subject || '(no subject)',
        from: msg.envelope?.from?.[0] || null,
        to: msg.envelope?.to || [],
        date: msg.envelope?.date || null,
        flags: [...(msg.flags || [])],
        isRead: msg.flags ? msg.flags.has('\\Seen') : false,
        isStarred: msg.flags ? msg.flags.has('\\Flagged') : false,
        size: msg.size || 0,
        hasAttachments: hasAttachments(msg.bodyStructure),
      });
    }

    // Sort newest first by date & UID
    messages.sort((a, b) => new Date(b.date || 0) - new Date(a.date || 0) || (b.uid - a.uid));
    return { messages, total };
  } finally {
    if (lock) lock.release();
  }
}

/**
 * Fetch Starred messages by searching INBOX for \Flagged flag.
 */
export async function fetchStarredMessages(client, { page = 1, limit = 25, folder = 'INBOX' } = {}) {
  const allStarred = [];
  let lock;
  let targetFolder = folder;
  let searchFilter = { flagged: true };

  try {
    const fastFolders = await getFolderListFast(client);
    const flaggedFolder = fastFolders.find((f) => f.specialUse === '\\Flagged' || f.name.toLowerCase() === 'starred' || f.path.toLowerCase().includes('starred'));
    if (flaggedFolder) {
      targetFolder = flaggedFolder.path;
      searchFilter = { all: true };
    }

    lock = await acquireMailboxLock(client, targetFolder, 25000);
    const uids = await client.search(searchFilter, { uid: true });
    if (Array.isArray(uids) && uids.length > 0) {
      for await (const msg of client.fetch(uids.join(','), {
        envelope: true,
        flags: true,
        bodyStructure: true,
        uid: true,
        size: true,
      }, { uid: true })) {
        allStarred.push({
          uid: msg.uid,
          seq: msg.seq,
          folder,
          subject: msg.envelope?.subject || '(no subject)',
          from: msg.envelope?.from?.[0] || null,
          to: msg.envelope?.to || [],
          date: msg.envelope?.date || null,
          flags: [...(msg.flags || [])],
          isRead: msg.flags ? msg.flags.has('\\Seen') : false,
          isStarred: true,
          size: msg.size || 0,
          hasAttachments: hasAttachments(msg.bodyStructure),
        });
      }
    }
  } catch (err) {
    logger.warn({ err: err.message }, 'Failed to fetch starred messages');
  } finally {
    if (lock) lock.release();
  }

  allStarred.sort((a, b) => new Date(b.date || 0) - new Date(a.date || 0) || (b.uid - a.uid));
  const total = allStarred.length;
  const startIdx = (page - 1) * limit;
  const messages = allStarred.slice(startIdx, startIdx + limit);
  return { messages, total };
}

/**
 * Fetch The Feed messages (newsletters, subscriptions, digests).
 */
export async function fetchFeedMessages(client, { page = 1, limit = 25 } = {}) {
  // Fetch from INBOX and categorize
  const { messages: allInbox = [] } = await fetchMessages(client, 'INBOX', { page: 1, limit: 100 });
  const feedRegex = /newsletter|digest|weekly|monthly|updates|news|shield|guide|announcement|welcome to|bulletin|medium|substack|dev\.to|github digests|promo|special offer|discount|sale|marketing|trends/i;
  const paperTrailRegex = /letter|future|receipt|invoice|order|confirmation|payment|transaction|billing|ticket|pin|code|otp|verify|statement|purchase|tracking/i;

  const feedMessages = allInbox.filter((m) => {
    const fromStr = typeof m.from === 'object' ? (m.from?.name || m.from?.address || '') : (m.from || '');
    const text = `${m.subject} ${fromStr}`;
    return !paperTrailRegex.test(text) && feedRegex.test(text);
  });

  const total = feedMessages.length;
  const startIdx = (page - 1) * limit;
  const messages = feedMessages.slice(startIdx, startIdx + limit);
  return { messages, total };
}

/**
 * Fetch Paper Trail messages (receipts, invoices, orders, confirmations, time capsule letters).
 */
export async function fetchPaperTrailMessages(client, { page = 1, limit = 25 } = {}) {
  // Fetch from INBOX and categorize
  const { messages: allInbox = [] } = await fetchMessages(client, 'INBOX', { page: 1, limit: 100 });
  const paperTrailRegex = /letter|future|receipt|invoice|order|confirmation|payment|transaction|billing|ticket|pin|code|otp|verify|statement|purchase|tracking|e2e|support request/i;

  const paperTrailMessages = allInbox.filter((m) => {
    const fromStr = typeof m.from === 'object' ? (m.from?.name || m.from?.address || '') : (m.from || '');
    const text = `${m.subject} ${fromStr}`;
    return paperTrailRegex.test(text);
  });

  const total = paperTrailMessages.length;
  const startIdx = (page - 1) * limit;
  const messages = paperTrailMessages.slice(startIdx, startIdx + limit);
  return { messages, total };
}

/**
 * Fetch Promotions messages (marketing, deals, offers, promotions).
 */
export async function fetchPromotionsMessages(client, { page = 1, limit = 25 } = {}) {
  const { messages: allInbox = [] } = await fetchMessages(client, 'INBOX', { page: 1, limit: 100 });
  const promoRegex = /promo|discount|sale|deal|offer|coupon|save|clearance|exclusive offer|shop now|special offer|free shipping|limited time|flash sale|reward|cashback|gift card|voucher|perk|store|deals/i;
  const paperTrailRegex = /receipt|invoice|order confirmation|payment received|billing statement/i;

  const promoMessages = allInbox.filter((m) => {
    const fromStr = typeof m.from === 'object' ? (m.from?.name || m.from?.address || '') : (m.from || '');
    const text = `${m.subject} ${fromStr}`;
    return !paperTrailRegex.test(text) && promoRegex.test(text);
  });

  const total = promoMessages.length;
  const startIdx = (page - 1) * limit;
  const messages = promoMessages.slice(startIdx, startIdx + limit);
  return { messages, total };
}

/**
 * Fetch Social messages (social networks, community, collaboration alerts).
 */
export async function fetchSocialMessages(client, { page = 1, limit = 25 } = {}) {
  const { messages: allInbox = [] } = await fetchMessages(client, 'INBOX', { page: 1, limit: 100 });
  const socialRegex = /github|linkedin|twitter|x\.com|facebook|instagram|discord|reddit|slack|youtube|tiktok|pinterest|threads|medium|mastodon|twitch|community|follower|mention|commented|invited you|connection request/i;

  const socialMessages = allInbox.filter((m) => {
    const fromStr = typeof m.from === 'object' ? (m.from?.name || m.from?.address || '') : (m.from || '');
    const text = `${m.subject} ${fromStr}`;
    return socialRegex.test(text);
  });

  const total = socialMessages.length;
  const startIdx = (page - 1) * limit;
  const messages = socialMessages.slice(startIdx, startIdx + limit);
  return { messages, total };
}

/**
 * Append a raw RFC822 message to a folder (e.g. Sent or Drafts).
 * @param {ImapFlow} client
 * @param {string} folder
 * @param {Buffer|string} content
 * @param {string[]} flags
 */
export async function appendMessage(client, folder, content, flags = ['\\Seen']) {
  const resolved = await resolveFolder(client, folder);
  try {
    await client.append(resolved, content, flags);
    logger.info({ folder: resolved }, 'Message successfully appended to IMAP folder');
  } catch (err) {
    logger.warn({ folder: resolved, err: err.message }, 'Failed to append message to folder');
  }
}

/**
 * Append a sent message to the Sent folder.
 */
export async function appendSentMessage(client, content) {
  const resolvedSent = await resolveFolder(client, 'Sent');
  return appendMessage(client, resolvedSent, content, ['\\Seen']);
}

/**
 * Fetch a single message with full body.
 * @param {ImapFlow} client
 * @param {string} folder
 * @param {number} uid - Message UID
 * @returns {Promise<object>}
 */
export async function fetchMessage(client, folder, uid) {
  let resolved = await resolveFolder(client, folder);
  if (resolved === 'Starred' || resolved === 'The Feed' || resolved === 'Paper Trail' || resolved === 'Promotions' || resolved === 'Social') {
    resolved = 'INBOX';
  }

  let lock;
  try {
    lock = await acquireMailboxLock(client, resolved, 25000);
  } catch (lockErr) {
    logger.warn({ folder: resolved, uid, err: lockErr.message }, 'Failed to acquire mailbox lock for fetchMessage');
    return null;
  }

  try {
    const msg = await Promise.race([
      client.fetchOne(String(uid), {
        envelope: true,
        flags: true,
        bodyStructure: true,
        uid: true,
        source: true,
      }, { uid: true }),
      new Promise((_, reject) => setTimeout(() => reject(new Error('IMAP fetchOne timeout')), 25000)),
    ]);

    if (!msg) return null;

    // Mark as read (best effort)
    try {
      await client.messageFlagsAdd(String(uid), ['\\Seen'], { uid: true });
    } catch {}

    return {
      uid: msg.uid,
      subject: msg.envelope?.subject || '(no subject)',
      from: msg.envelope?.from?.[0] || null,
      to: msg.envelope?.to || [],
      cc: msg.envelope?.cc || [],
      date: msg.envelope?.date || null,
      messageId: msg.envelope?.messageId || null,
      inReplyTo: msg.envelope?.inReplyTo || null,
      flags: [...(msg.flags || [])],
      source: msg.source?.toString('utf-8') || '',
      bodyStructure: msg.bodyStructure,
    };
  } finally {
    if (lock) lock.release();
  }
}

/**
 * Move messages to a different folder.
 * @param {ImapFlow} client
 * @param {string} fromFolder
 * @param {number[]} uids - Message UIDs
 * @param {string} toFolder
 */
export async function moveMessages(client, fromFolder, uids, toFolder) {
  const resolvedFrom = await resolveFolder(client, fromFolder);
  const resolvedTo = await resolveFolder(client, toFolder);
  const lock = await acquireMailboxLock(client, resolvedFrom, 25000);
  try {
    const res = await client.messageMove(uids.join(','), resolvedTo, { uid: true });
    const uidMap = {};
    if (res && res.uidMap) {
      if (res.uidMap instanceof Map) {
        for (const [oldUid, newUid] of res.uidMap.entries()) {
          uidMap[Number(oldUid)] = Number(newUid);
        }
      } else if (typeof res.uidMap === 'object') {
        for (const [oldUid, newUid] of Object.entries(res.uidMap)) {
          uidMap[Number(oldUid)] = Number(newUid);
        }
      }
    }
    const newUids = Object.values(uidMap);
    return { ...res, uidMap, newUids: newUids.length > 0 ? newUids : uids };
  } finally {
    if (lock) lock.release();
  }
}

/**
 * Delete messages (move to Trash or delete).
 * @param {ImapFlow} client
 * @param {string} folder
 * @param {number[]} uids
 */
export async function deleteMessages(client, folder, uids) {
  const resolved = await resolveFolder(client, folder);
  const lock = await acquireMailboxLock(client, resolved, 25000);
  try {
    await client.messageDelete(uids.join(','), { uid: true });
  } finally {
    if (lock) lock.release();
  }
}

/**
 * Toggle a flag on messages.
 * @param {ImapFlow} client
 * @param {string} folder
 * @param {number[]} uids
 * @param {string} flag - e.g. '\\Seen', '\\Flagged'
 * @param {boolean} add - true to add, false to remove
 */
export async function toggleFlag(client, folder, uids, flag, add = true) {
  let resolved = await resolveFolder(client, folder);
  if (resolved === 'Starred' || resolved === 'The Feed' || resolved === 'Paper Trail' || resolved === 'Promotions' || resolved === 'Social') {
    resolved = 'INBOX';
  }
  const lock = await acquireMailboxLock(client, resolved, 25000);
  try {
    if (add) {
      await client.messageFlagsAdd(uids.join(','), [flag], { uid: true });
    } else {
      await client.messageFlagsRemove(uids.join(','), [flag], { uid: true });
    }
  } finally {
    if (lock) lock.release();
  }
}

/**
 * Search messages by criteria.
 * @param {ImapFlow} client
 * @param {string} folder
 * @param {object} criteria - Search criteria
 * @returns {Promise<number[]>} Matching UIDs
 */
export async function searchMessages(client, folder, criteria) {
  const resolved = await resolveFolder(client, folder);
  const lock = await acquireMailboxLock(client, resolved, 25000);
  try {
    return await client.search(criteria, { uid: true });
  } finally {
    if (lock) lock.release();
  }
}

/**
 * Create a new folder.
 * @param {ImapFlow} client
 * @param {string} path
 */
export async function createFolder(client, path) {
  await client.mailboxCreate(path);
}

/**
 * Rename a folder.
 * @param {ImapFlow} client
 * @param {string} oldPath
 * @param {string} newPath
 */
export async function renameFolder(client, oldPath, newPath) {
  await client.mailboxRename(oldPath, newPath);
}

/**
 * Delete a folder.
 * @param {ImapFlow} client
 * @param {string} path
 */
export async function deleteFolder(client, path) {
  await client.mailboxDelete(path);
}

/**
 * Fast mailbox message count lookup via IMAP STATUS.
 * @param {string} email
 * @param {string} password
 * @returns {Promise<number|null>} Number of messages in INBOX or null on error
 */
export async function getInboxMessageCount(email, password) {
  let client = null;
  try {
    client = await createConnection(email, password);
    const status = await client.status('INBOX', { messages: true });
    await client.logout().catch(() => {});
    return typeof status?.messages === 'number' ? status.messages : 0;
  } catch (err) {
    if (client) {
      try { await client.logout(); } catch {}
    }
    return null;
  }
}

/**
 * Check if a bodyStructure has attachments.
 * @param {object} bodyStructure
 * @returns {boolean}
 */
function hasAttachments(bodyStructure) {
  if (!bodyStructure) return false;
  if (bodyStructure.disposition === 'attachment') return true;
  if (bodyStructure.childNodes) {
    return bodyStructure.childNodes.some(hasAttachments);
  }
  return false;
}

export default {
  createConnection,
  listFolders,
  fetchMessages,
  fetchMessage,
  moveMessages,
  deleteMessages,
  toggleFlag,
  searchMessages,
  createFolder,
  renameFolder,
  deleteFolder,
  getInboxMessageCount,
};
