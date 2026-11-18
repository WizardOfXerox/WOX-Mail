import { ImapFlow } from 'imapflow';
import pino from 'pino';
import { setex, get as redisGet } from '../config/redis.js';

const logger = pino({ name: 'woxmail:migration' });

// Global in-memory active migration jobs
const activeMigrations = new Map();

/**
 * Extract clean, serializable migration state snapshot (stripping IMAP client handles).
 */
function getJobSnapshot(job) {
  return {
    userId: job.userId,
    status: job.status,
    currentFolder: job.currentFolder,
    totalFolders: job.totalFolders,
    completedFolders: job.completedFolders,
    totalMessages: job.totalMessages,
    migratedMessages: job.migratedMessages,
    skippedMessages: job.skippedMessages,
    errors: job.errors || [],
    startedAt: job.startedAt,
    completedAt: job.completedAt || null,
    isCancelled: Boolean(job.isCancelled)
  };
}

/**
 * Persist migration state snapshot to Redis with 30-minute TTL.
 */
async function saveMigrationSnapshot(userId, job) {
  try {
    const snapshot = getJobSnapshot(job);
    await setex(`migration:${userId}`, 1800, JSON.stringify(snapshot));
  } catch (err) {
    logger.warn({ err: err.message, userId }, 'Failed to persist migration state snapshot to Redis');
  }
}

/**
 * Test credentials and fetch mailbox hierarchy from a source IMAP server.
 */
export async function testSourceConnection({ host, port = 993, secure = true, username, password }) {
  const cleanHost = String(host || '').trim();
  if (!cleanHost) {
    throw new Error('Source IMAP host is required');
  }
  if (process.env.ALLOW_PRIVATE_MAIL_HOSTS !== 'true') {
    const { isSafeUrl } = await import('./linkPreviewService.js');
    const safety = await isSafeUrl(`https://${cleanHost}`);
    if (!safety.safe) {
      throw new Error('Blocked: Source IMAP host resolves to a private or internal network address.');
    }
  }

  const client = new ImapFlow({
    host: cleanHost,
    port: parseInt(port, 10) || 993,
    secure: Boolean(secure),
    auth: { user: username.trim(), pass: password },
    logger: false,
    emitLogs: false,
  });

  client.on('error', (err) => {
    logger.warn({ err: err.message }, 'Source IMAP connection error handled gracefully');
  });

  try {
    await client.connect();
    const list = await client.list();
    const folders = list.map((f) => ({
      path: f.path,
      name: f.name,
      delimiter: f.delimiter,
      specialUse: f.specialUse || ''
    }));

    await client.logout().catch(() => {});
    return { success: true, folders };
  } catch (err) {
    logger.error({ err: err.message, host, username }, 'Failed to connect to source IMAP');
    throw new Error(`Failed to connect to source IMAP server: ${err.message}`);
  }
}

/**
 * Automatically map source folders to standard WoxMail destination folders.
 */
export function autoMapFolders(sourceFolders = []) {
  return sourceFolders.map((f) => {
    const lower = (f.name || f.path || '').toLowerCase().trim();
    let target = f.name;

    if (lower === 'inbox') {
      target = 'INBOX';
    } else if (lower.includes('sent')) {
      target = 'Sent';
    } else if (lower.includes('draft')) {
      target = 'Drafts';
    } else if (lower.includes('trash') || lower.includes('deleted') || lower.includes('bin')) {
      target = 'Trash';
    } else if (lower.includes('spam') || lower.includes('junk')) {
      target = 'Spam';
    } else if (lower.includes('archive') || lower.includes('all mail')) {
      target = 'Archive';
    }

    return {
      source: f.path,
      sourceName: f.name,
      target
    };
  });
}

/**
 * Get active migration job state.
 * First checks in-memory activeMigrations (for local live client),
 * and if not found, checks Redis so multiple server instances / workers can report migration progress.
 */
export function getMigrationState(userId) {
  const local = activeMigrations.get(userId);
  if (local) {
    return local;
  }

  // Not in local activeMigrations: check Redis asynchronously
  const promise = (async () => {
    try {
      const cached = await redisGet(`migration:${userId}`);
      if (cached) {
        return typeof cached === 'string' ? JSON.parse(cached) : cached;
      }
    } catch (err) {
      logger.warn({ err: err.message, userId }, 'Failed reading migration state from Redis');
    }
    return null;
  })();

  // Synchronous fallback properties for callers that inspect job properties immediately
  promise.status = 'idle';
  promise.currentFolder = '';
  promise.totalFolders = 0;
  promise.completedFolders = 0;
  promise.totalMessages = 0;
  promise.migratedMessages = 0;
  promise.skippedMessages = 0;
  promise.errors = [];
  promise.startedAt = null;
  promise.completedAt = null;

  return promise;
}

/**
 * Cancel an ongoing migration job.
 */
export async function cancelMigration(userId) {
  const job = activeMigrations.get(userId);
  if (job) {
    job.isCancelled = true;
    job.status = 'cancelled';
    if (job.sourceClient) {
      await job.sourceClient.logout().catch(() => {});
    }
    await saveMigrationSnapshot(userId, job);
    return true;
  }

  // Also check if remote instance migration can be marked cancelled in Redis
  try {
    const cached = await redisGet(`migration:${userId}`);
    if (cached) {
      const parsed = typeof cached === 'string' ? JSON.parse(cached) : cached;
      parsed.isCancelled = true;
      parsed.status = 'cancelled';
      await setex(`migration:${userId}`, 1800, JSON.stringify(parsed));
      return true;
    }
  } catch {}

  return false;
}

/**
 * Start an IMAP-to-IMAP migration process.
 */
export async function startMigration(userId, sourceConfig, folderMapping, targetClient, onProgress = null) {
  if (activeMigrations.has(userId)) {
    const existing = activeMigrations.get(userId);
    if (existing.status === 'migrating') {
      throw new Error('A migration is already in progress for this account');
    }
  }

  const job = {
    userId,
    status: 'migrating',
    currentFolder: '',
    totalFolders: folderMapping.length,
    completedFolders: 0,
    totalMessages: 0,
    migratedMessages: 0,
    skippedMessages: 0,
    errors: [],
    startedAt: new Date(),
    isCancelled: false,
    sourceClient: null
  };

  activeMigrations.set(userId, job);
  // Persist initial state snapshot to Redis
  await saveMigrationSnapshot(userId, job);

  // Run asynchronously
  (async () => {
    const sourceClient = new ImapFlow({
      host: sourceConfig.host.trim(),
      port: parseInt(sourceConfig.port, 10) || 993,
      secure: Boolean(sourceConfig.secure ?? true),
      auth: { user: sourceConfig.username.trim(), pass: sourceConfig.password },
      logger: false,
      emitLogs: false,
    });

    job.sourceClient = sourceClient;

    try {
      await sourceClient.connect();

      let lastRedisSync = Date.now();

      for (const mapping of folderMapping) {
        if (job.isCancelled) break;

        const { source, target } = mapping;
        job.currentFolder = source;
        saveMigrationSnapshot(userId, job).catch(() => {});

        // Ensure target folder exists
        try {
          await targetClient.mailboxCreate(target).catch(() => {});
        } catch {
          // folder already exists
        }

        let lock;
        try {
          lock = await sourceClient.getMailboxLock(source);
          const mailbox = sourceClient.mailbox;
          const msgCount = mailbox ? mailbox.exists : 0;
          job.totalMessages += msgCount;

          if (msgCount > 0) {
            // Fetch messages in chunks of 25
            for await (const message of sourceClient.fetch('1:*', { source: true, flags: true, internalDate: true })) {
              if (job.isCancelled) break;

              try {
                if (message.source) {
                  const flags = message.flags ? Array.from(message.flags) : [];
                  await targetClient.append(target, message.source, flags, message.internalDate);
                  job.migratedMessages++;
                } else {
                  job.skippedMessages++;
                }
              } catch (appendErr) {
                logger.warn({ err: appendErr.message, source, target }, 'Failed to append message during migration');
                job.errors.push(`Error in ${source}: ${appendErr.message}`);
              }

              if (onProgress) {
                onProgress(job);
              }

              // Periodic progress snapshot to Redis (throttled to 1s)
              const now = Date.now();
              if (now - lastRedisSync > 1000) {
                lastRedisSync = now;
                saveMigrationSnapshot(userId, job).catch(() => {});
              }
            }
          }
        } catch (folderErr) {
          logger.warn({ err: folderErr.message, folder: source }, 'Failed opening source mailbox');
          job.errors.push(`Could not open source folder ${source}: ${folderErr.message}`);
        } finally {
          if (lock) lock.release();
        }

        job.completedFolders++;
        saveMigrationSnapshot(userId, job).catch(() => {});
      }

      job.status = job.isCancelled ? 'cancelled' : 'completed';
      job.completedAt = new Date();
      await saveMigrationSnapshot(userId, job);
      logger.info({ userId, migrated: job.migratedMessages, errors: job.errors.length }, 'Migration finished');
    } catch (err) {
      job.status = 'failed';
      job.errors.push(`Fatal migration error: ${err.message}`);
      await saveMigrationSnapshot(userId, job);
      logger.error({ userId, err: err.message }, 'Fatal migration failure');
    } finally {
      await sourceClient.logout().catch(() => {});
      if (targetClient) await targetClient.logout().catch(() => {});
      job.sourceClient = null;
      if (onProgress) onProgress(job);
      await saveMigrationSnapshot(userId, job);
      // Auto-purge job from activeMigrations after 30 minutes retention to prevent memory leak
      setTimeout(() => {
        if (activeMigrations.get(userId) === job) {
          activeMigrations.delete(userId);
          logger.debug({ userId }, 'Purged completed migration from memory');
        }
      }, 30 * 60 * 1000);
    }
  })();

  return job;
}

/**
 * Import a single raw EML message into a target folder.
 */
export async function importEmlMessage(targetClient, targetFolder, emlBuffer, flags = ['\\Seen']) {
  if (!emlBuffer || !Buffer.isBuffer(emlBuffer)) {
    throw new Error('Valid EML buffer is required');
  }

  try {
    await targetClient.mailboxCreate(targetFolder).catch(() => {});
  } catch {}

  const appendRes = await targetClient.append(targetFolder, emlBuffer, flags);
  return appendRes;
}
