/**
 * @fileoverview Live Mail Watcher Service
 * Real-time background watcher for authenticated users connected via Socket.IO.
 * Polls IMAP INBOX via non-locking STATUS probes every 10s only while users have active sockets.
 * Dispatches 'mail:new' events, web push notifications, and webhooks when new emails arrive.
 */

import { createConnection, fetchMessages } from './imap.js';
import { query } from '../config/database.js';
import { emitToUser } from '../config/socket.js';
import { notifyNewEmail } from './pushNotifications.js';
import * as webhookDispatcher from './webhookDispatcher.js';
import pino from 'pino';

const logger = pino({ name: 'woxmail:live-watcher' });

/**
 * Active connected user sessions.
 * @type {Map<number, {
 *   userId: number,
 *   email: string,
 *   socketCount: number,
 *   lastUidNext: number|null,
 *   lastMessageCount: number|null,
 *   knownUids: Set<number>,
 *   initialized: boolean,
 *   isChecking: boolean,
 *   lastChecked: number
 * }>}
 */
const activeUsers = new Map();

/**
 * Cached IMAP connections for the live watcher.
 * @type {Map<number, { client: import('imapflow').ImapFlow, lastUsed: number }>}
 */
const watcherConnectionCache = new Map();
const WATCHER_CONN_TTL = 90000; // 90 seconds idle

let checkIntervalId = null;

/**
 * Get or create an IMAP connection for the watcher.
 */
async function getWatcherIMAPConnection(userId, email, password) {
  const cached = watcherConnectionCache.get(userId);
  if (cached && cached.client && cached.client.usable) {
    cached.lastUsed = Date.now();
    return cached.client;
  }

  const client = await createConnection(email, password);
  watcherConnectionCache.set(userId, { client, lastUsed: Date.now() });

  client.on('close', () => watcherConnectionCache.delete(userId));
  client.on('error', () => watcherConnectionCache.delete(userId));

  return client;
}

/**
 * Periodic cleanup of stale watcher IMAP connections.
 */
setInterval(() => {
  const now = Date.now();
  for (const [userId, entry] of watcherConnectionCache) {
    if (now - entry.lastUsed > WATCHER_CONN_TTL) {
      entry.client?.logout?.().catch(() => {});
      watcherConnectionCache.delete(userId);
    }
  }
}, 30000);

/**
 * Register a user socket connection to start live monitoring.
 * @param {number} userId
 * @param {string} email
 */
export function registerUser(userId, email) {
  if (!userId) return;

  let entry = activeUsers.get(userId);
  if (!entry) {
    entry = {
      userId,
      email: email || '',
      socketCount: 1,
      lastUidNext: null,
      lastMessageCount: null,
      knownUids: new Set(),
      initialized: false,
      isChecking: false,
      lastChecked: 0,
    };
    activeUsers.set(userId, entry);
    // Seed initial baseline immediately in the background
    checkUserInbox(userId).catch(() => {});
  } else {
    entry.socketCount++;
  }
}

/**
 * Unregister a user socket connection.
 * Stops monitoring when all sockets for this user disconnect.
 * @param {number} userId
 */
export function unregisterUser(userId) {
  if (!userId) return;

  const entry = activeUsers.get(userId);
  if (!entry) return;

  entry.socketCount--;
  if (entry.socketCount <= 0) {
    activeUsers.delete(userId);
    const cached = watcherConnectionCache.get(userId);
    if (cached) {
      cached.client?.logout?.().catch(() => {});
      watcherConnectionCache.delete(userId);
    }
  }
}

/**
 * Check a single user's INBOX for newly arrived messages.
 * @param {number} userId
 */
async function checkUserInbox(userId) {
  const entry = activeUsers.get(userId);
  if (!entry || entry.isChecking) return;

  entry.isChecking = true;
  try {
    // 1. Fetch user email and IMAP credentials
    const creds = await query(
      'SELECT email, imap_password, is_admin FROM users WHERE id = $1 AND is_suspended = FALSE',
      [userId]
    );

    if (creds.rows.length === 0) {
      entry.isChecking = false;
      return;
    }

    const { email } = creds.rows[0];
    let password = creds.rows[0].imap_password;
    if (!password) {
      const adminPass = (process.env.ADMIN_PASSWORD || '').replace(/^['"]|['"]$/g, '');
      if (creds.rows[0].is_admin && adminPass) {
        password = adminPass;
      } else {
        entry.isChecking = false;
        return;
      }
    }

    // 2. Connect to IMAP
    const client = await getWatcherIMAPConnection(userId, email, password);
    if (!client || !client.usable) {
      entry.isChecking = false;
      return;
    }

    // 3. Fast STATUS probe (non-locking RFC 3501 STATUS)
    const status = await client.status('INBOX', { messages: true, unseen: true, uidNext: true });
    entry.lastChecked = Date.now();

    // 4. Initial seed
    if (!entry.initialized) {
      entry.lastUidNext = status.uidNext || 0;
      entry.lastMessageCount = status.messages || 0;

      // Seed recent message UIDs so we don't trigger alerts for existing messages
      try {
        const initial = await fetchMessages(client, 'INBOX', { page: 1, limit: 30 });
        (initial.messages || []).forEach((m) => entry.knownUids.add(m.uid));
      } catch {}

      entry.initialized = true;
      entry.isChecking = false;
      return;
    }

    // 5. Compare against baseline to detect new mail
    const hasMoreMessages = (status.messages || 0) > (entry.lastMessageCount || 0);
    const hasHigherUidNext = (status.uidNext || 0) > (entry.lastUidNext || 0);

    if (hasMoreMessages || hasHigherUidNext) {
      logger.info({ userId, email, newCount: status.messages, oldCount: entry.lastMessageCount }, 'New email arrival detected by live watcher');

      // Fetch top 10 recent messages
      const fetched = await fetchMessages(client, 'INBOX', { page: 1, limit: 10 });
      const currentMessages = fetched.messages || [];

      const newlyArrived = currentMessages.filter((m) => !entry.knownUids.has(m.uid));

      for (const msg of newlyArrived) {
        entry.knownUids.add(msg.uid);

        // A. Emit real-time Socket.IO event to user's room
        emitToUser(userId, 'mail:new', {
          message: msg,
          folder: 'INBOX',
          unseen: status.unseen || 1,
        });

        // B. Send Web Push Notification
        const senderName = msg.from?.name || msg.from?.address || 'Someone';
        notifyNewEmail(userId, senderName, msg.subject || '(No Subject)').catch(() => {});

        // C. Dispatch Webhook
        webhookDispatcher.dispatchEvent(userId, 'mail.received', msg).catch(() => {});
      }

      // Update baseline counters
      entry.lastUidNext = status.uidNext;
      entry.lastMessageCount = status.messages;
    }
  } catch (err) {
    logger.debug({ userId, err: err.message }, 'Live watcher check skipped or failed');
  } finally {
    entry.isChecking = false;
  }
}

/**
 * Start the live mail watcher loop.
 * Runs every 10 seconds checking INBOX for active connected users.
 */
export function startWatcher() {
  if (checkIntervalId) return;

  checkIntervalId = setInterval(async () => {
    if (activeUsers.size === 0) return;

    for (const [userId] of activeUsers) {
      checkUserInbox(userId).catch(() => {});
    }
  }, 10000);

  logger.info('Live mail watcher service initialized');
}

/**
 * Stop the live mail watcher loop.
 */
export function stopWatcher() {
  if (checkIntervalId) {
    clearInterval(checkIntervalId);
    checkIntervalId = null;
  }
}

export default {
  registerUser,
  unregisterUser,
  startWatcher,
  stopWatcher,
};
