import { post } from '../shared/api.js';

/**
 * Sovereign Offline Webmail Storage (IndexedDB) & Outbox Queue
 * Database Name: woxmail_offline_v1
 * Stores:
 *   - messages: Caches folder messages for offline reading
 *   - outbox: Caches offline composed emails awaiting network delivery
 */

const DB_NAME = 'woxmail_offline_v1';
const DB_VERSION = 1;

let dbPromise = null;

/**
 * Open or initialize IndexedDB connection
 * @returns {Promise<IDBDatabase>}
 */
function openDB() {
  if (typeof window === 'undefined' || !window.indexedDB) {
    return Promise.reject(new Error('IndexedDB is not supported in this environment'));
  }

  if (dbPromise) return dbPromise;

  dbPromise = new Promise((resolve, reject) => {
    const request = window.indexedDB.open(DB_NAME, DB_VERSION);

    request.onupgradeneeded = (event) => {
      const db = event.target.result;

      // 1. Messages Store (Folder-based offline message cache)
      if (!db.objectStoreNames.contains('messages')) {
        const msgStore = db.createObjectStore('messages', { keyPath: 'id' });
        msgStore.createIndex('folder', 'folder', { unique: false });
        msgStore.createIndex('uid', 'uid', { unique: false });
      }

      // 2. Outbox Store (Offline outgoing queue)
      if (!db.objectStoreNames.contains('outbox')) {
        const outboxStore = db.createObjectStore('outbox', { keyPath: 'id' });
        outboxStore.createIndex('status', 'status', { unique: false });
        outboxStore.createIndex('createdAt', 'createdAt', { unique: false });
      }
    };

    request.onsuccess = (event) => {
      resolve(event.target.result);
    };

    request.onerror = (event) => {
      dbPromise = null;
      reject(event.target.error || new Error('Failed to open IndexedDB'));
    };
  });

  return dbPromise;
}

/**
 * Cache an array of messages for a given folder
 * @param {string} folder 
 * @param {Array<Object>} messageList 
 * @returns {Promise<boolean>}
 */
export async function cacheMessages(folder, messageList) {
  try {
    const db = await openDB();
    const cleanFolder = String(folder || 'INBOX');
    const safeList = Array.isArray(messageList) ? messageList : [];

    return new Promise((resolve, reject) => {
      const transaction = db.transaction(['messages'], 'readwrite');
      const store = transaction.objectStore('messages');

      // Store a fast consolidated folder record
      store.put({
        id: `__folder__${cleanFolder}`,
        folder: cleanFolder,
        messages: safeList,
        cachedAt: Date.now(),
        count: safeList.length,
      });

      // Also index individual messages for granular lookup
      for (const msg of safeList) {
        if (msg && (msg.uid || msg.id)) {
          store.put({
            id: `${cleanFolder}_${msg.uid || msg.id}`,
            folder: cleanFolder,
            uid: msg.uid || msg.id,
            ...msg,
            cachedAt: Date.now(),
          });
        }
      }

      transaction.oncomplete = () => resolve(true);
      transaction.onerror = (e) => reject(e.target.error);
    });
  } catch (err) {
    console.warn('[OfflineStore] cacheMessages error:', err);
    return false;
  }
}

/**
 * Retrieve cached messages for a folder
 * @param {string} folder 
 * @returns {Promise<Array<Object>>}
 */
export async function getCachedMessages(folder) {
  try {
    const db = await openDB();
    const cleanFolder = String(folder || 'INBOX');

    return new Promise((resolve, reject) => {
      const transaction = db.transaction(['messages'], 'readonly');
      const store = transaction.objectStore('messages');

      // 1. Try reading the consolidated folder cache first
      const folderReq = store.get(`__folder__${cleanFolder}`);

      folderReq.onsuccess = () => {
        if (folderReq.result && Array.isArray(folderReq.result.messages)) {
          return resolve(folderReq.result.messages);
        }

        // 2. Fall back to reading by folder index
        const index = store.index('folder');
        const indexReq = index.getAll(cleanFolder);

        indexReq.onsuccess = () => {
          const items = (indexReq.result || [])
            .filter((item) => item.id && !item.id.startsWith('__folder__'))
            .map((item) => {
              const { id, cachedAt, ...rest } = item;
              return rest;
            });
          resolve(items);
        };

        indexReq.onerror = (e) => reject(e.target.error);
      };

      folderReq.onerror = (e) => reject(e.target.error);
    });
  } catch (err) {
    console.warn('[OfflineStore] getCachedMessages error:', err);
    return [];
  }
}

/**
 * Enqueue an outgoing message into the offline Outbox
 * @param {Object} emailData 
 * @returns {Promise<Object>}
 */
export async function queueOutboxMessage(emailData) {
  try {
    const db = await openDB();
    const id = emailData.id || `outbox_${Date.now()}_${Math.random().toString(36).substring(2, 8)}`;
    const record = {
      id,
      ...emailData,
      status: emailData.status || 'queued',
      queuedAt: Date.now(),
      createdAt: emailData.createdAt || new Date().toISOString(),
    };

    return new Promise((resolve, reject) => {
      const transaction = db.transaction(['outbox'], 'readwrite');
      const store = transaction.objectStore('outbox');
      store.put(record);

      transaction.oncomplete = () => {
        // Dispatch local notification event
        if (typeof window !== 'undefined') {
          window.dispatchEvent(new CustomEvent('woxmail:outbox-updated', { detail: { action: 'queue', id } }));
        }
        resolve(record);
      };
      transaction.onerror = (e) => reject(e.target.error);
    });
  } catch (err) {
    console.warn('[OfflineStore] queueOutboxMessage error:', err);
    throw err;
  }
}

/**
 * Retrieve all pending outbox messages
 * @returns {Promise<Array<Object>>}
 */
export async function getOutboxMessages() {
  try {
    const db = await openDB();

    return new Promise((resolve, reject) => {
      const transaction = db.transaction(['outbox'], 'readonly');
      const store = transaction.objectStore('outbox');
      const request = store.getAll();

      request.onsuccess = () => {
        const results = request.result || [];
        // Sort oldest first for FIFO delivery
        results.sort((a, b) => (a.queuedAt || 0) - (b.queuedAt || 0));
        resolve(results);
      };
      request.onerror = (e) => reject(e.target.error);
    });
  } catch (err) {
    console.warn('[OfflineStore] getOutboxMessages error:', err);
    return [];
  }
}

/**
 * Remove an outbox message after successful delivery
 * @param {string} id 
 * @returns {Promise<boolean>}
 */
export async function removeOutboxMessage(id) {
  try {
    const db = await openDB();

    return new Promise((resolve, reject) => {
      const transaction = db.transaction(['outbox'], 'readwrite');
      const store = transaction.objectStore('outbox');
      store.delete(id);

      transaction.oncomplete = () => {
        if (typeof window !== 'undefined') {
          window.dispatchEvent(new CustomEvent('woxmail:outbox-updated', { detail: { action: 'remove', id } }));
        }
        resolve(true);
      };
      transaction.onerror = (e) => reject(e.target.error);
    });
  } catch (err) {
    console.warn('[OfflineStore] removeOutboxMessage error:', err);
    return false;
  }
}

let syncInProgress = false;
let listenerInitialized = false;

/**
 * Flush queued outbox messages to /api/mail/send using fresh x-csrf-token & credentials
 * @returns {Promise<{ sentCount: number, failedCount: number }>}
 */
export async function syncOutbox() {
  if (syncInProgress || (typeof navigator !== 'undefined' && !navigator.onLine)) {
    return { sentCount: 0, failedCount: 0 };
  }
  syncInProgress = true;
  let sentCount = 0;
  let failedCount = 0;
  try {
    const queued = await getOutboxMessages();
    for (const item of queued) {
      try {
        await post('/mail/send', item.payload || {});
        await removeOutboxMessage(item.id);
        sentCount++;
      } catch (err) {
        failedCount++;
        console.warn('[OfflineStore] Failed to sync queued message:', item.id, err.message);
      }
    }
    if (sentCount > 0 && typeof window !== 'undefined') {
      window.dispatchEvent(new CustomEvent('woxmail:outbox-synced', { detail: { sentCount, failedCount } }));
      if (window.WoxToast) {
        window.WoxToast.success(`Synced ${sentCount} offline message${sentCount > 1 ? 's' : ''}`);
      }
    }
  } finally {
    syncInProgress = false;
  }
  return { sentCount, failedCount };
}

/**
 * Register listeners for Service Worker SYNC_OUTBOX_TRIGGER messages and browser online events
 */
export function initOfflineSyncListener() {
  if (listenerInitialized || typeof window === 'undefined') return;
  listenerInitialized = true;

  if ('serviceWorker' in navigator) {
    navigator.serviceWorker.addEventListener('message', (event) => {
      if (event.data?.type === 'SYNC_OUTBOX_TRIGGER') {
        syncOutbox();
      }
    });
  }

  window.addEventListener('online', () => {
    syncOutbox();
  });
}

export default {
  cacheMessages,
  getCachedMessages,
  queueOutboxMessage,
  getOutboxMessages,
  removeOutboxMessage,
  syncOutbox,
  initOfflineSyncListener,
};
