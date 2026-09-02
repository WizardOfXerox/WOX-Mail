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
 * Resolve folder alias (e.g. 'Spam' -> 'Junk', 'Sent' -> 'Sent').
 * @param {ImapFlow} client
 * @param {string} folder
 * @returns {Promise<string>}
 */
export async function resolveFolder(client, folder) {
  if (!folder) return 'INBOX';
  const fLower = folder.toLowerCase().trim();

  if (fLower === 'inbox') return 'INBOX';
  if (fLower === '__all_inboxes' || fLower === 'all inboxes' || fLower === 'all_inbox' || fLower === '__all') return 'INBOX';
  if (fLower === 'starred') return 'Starred';
  if (fLower === 'the feed' || fLower === 'thefeed' || fLower === '__feed') return 'The Feed';
  if (fLower === 'paper trail' || fLower === 'papertrail' || fLower === '__papertrail') return 'Paper Trail';
  if (fLower === 'outbox') return 'Outbox';

  try {
    const folders = await listFolders(client);

    // 1. Direct name or path match
    let match = folders.find((f) => f.name.toLowerCase() === fLower || f.path.toLowerCase() === fLower);
    if (match) return match.path;

    // 2. Special-use flags or provider path patterns (e.g. Gmail [Gmail]/Sent Mail)
    if (fLower === 'sent' || fLower === 'sent messages' || fLower === 'sent items') {
      match = folders.find((f) => f.specialUse === '\\Sent' || f.name.toLowerCase().includes('sent') || f.path.toLowerCase().includes('sent'));
      if (match) return match.path;
    }
    if (fLower === 'trash' || fLower === 'deleted' || fLower === 'bin') {
      match = folders.find((f) => f.specialUse === '\\Trash' || f.name.toLowerCase().includes('trash') || f.name.toLowerCase().includes('bin') || f.path.toLowerCase().includes('trash'));
      if (match) return match.path;
    }
    if (fLower === 'spam' || fLower === 'junk') {
      match = folders.find((f) => f.specialUse === '\\Junk' || f.name.toLowerCase().includes('spam') || f.name.toLowerCase().includes('junk') || f.path.toLowerCase().includes('spam') || f.path.toLowerCase().includes('junk'));
      if (match) return match.path;
    }
    if (fLower === 'drafts' || fLower === 'draft') {
      match = folders.find((f) => f.specialUse === '\\Drafts' || f.name.toLowerCase().includes('draft') || f.path.toLowerCase().includes('draft'));
      if (match) return match.path;
    }
    if (fLower === 'archive' || fLower === 'all mail') {
      match = folders.find((f) => f.specialUse === '\\Archive' || f.specialUse === '\\All' || f.name.toLowerCase().includes('all mail') || f.path.toLowerCase().includes('all mail'));
      if (match) return match.path;
    }
    if (fLower === 'social') {
      match = folders.find((f) => f.name.toLowerCase().includes('social') || f.path.toLowerCase().includes('social'));
      if (match) return match.path;
    }
    if (fLower === 'promotions') {
      match = folders.find((f) => f.name.toLowerCase().includes('promotion') || f.path.toLowerCase().includes('promotion'));
      if (match) return match.path;
    }
  } catch {
    // Fallback to static resolution if listFolders fails
  }

  if (fLower === 'spam' || fLower === 'junk') return 'Junk';
  if (fLower === 'sent') return 'Sent';
  if (fLower === 'trash') return 'Trash';
  if (fLower === 'drafts') return 'Drafts';
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

  let lock;
  try {
    lock = await Promise.race([
      client.getMailboxLock(resolved),
      new Promise((_, reject) => setTimeout(() => reject(new Error('IMAP mailbox lock timeout')), 8000)),
    ]);
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
  try {
    lock = await Promise.race([
      client.getMailboxLock(folder),
      new Promise((_, reject) => setTimeout(() => reject(new Error('lock timeout')), 5000)),
    ]);
    const uids = await client.search({ flagged: true }, { uid: true });
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
  if (resolved === 'Starred' || resolved === 'The Feed' || resolved === 'Paper Trail') {
    resolved = 'INBOX';
  }

  let lock;
  try {
    lock = await Promise.race([
      client.getMailboxLock(resolved),
      new Promise((_, reject) => setTimeout(() => reject(new Error('IMAP mailbox lock timeout')), 8000)),
    ]);
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
      new Promise((_, reject) => setTimeout(() => reject(new Error('IMAP fetchOne timeout')), 8000)),
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
  const lock = await client.getMailboxLock(resolvedFrom);
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
    lock.release();
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
  const lock = await client.getMailboxLock(resolved);
  try {
    await client.messageDelete(uids.join(','), { uid: true });
  } finally {
    lock.release();
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
  if (resolved === 'Starred' || resolved === 'The Feed' || resolved === 'Paper Trail') {
    resolved = 'INBOX';
  }
  const lock = await client.getMailboxLock(resolved);
  try {
    if (add) {
      await client.messageFlagsAdd(uids.join(','), [flag], { uid: true });
    } else {
      await client.messageFlagsRemove(uids.join(','), [flag], { uid: true });
    }
  } finally {
    lock.release();
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
  const lock = await client.getMailboxLock(folder);
  try {
    const results = await client.search(criteria, { uid: true });
    return results;
  } finally {
    lock.release();
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
