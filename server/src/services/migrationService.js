import { ImapFlow } from 'imapflow';
import pino from 'pino';

const logger = pino({ name: 'woxmail:migration' });

// Global in-memory active migration jobs
const activeMigrations = new Map();

/**
 * Test credentials and fetch mailbox hierarchy from a source IMAP server.
 */
export async function testSourceConnection({ host, port = 993, secure = true, username, password }) {
  const client = new ImapFlow({
    host: host.trim(),
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
 */
export function getMigrationState(userId) {
  return activeMigrations.get(userId) || null;
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
    return true;
  }
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

      for (const mapping of folderMapping) {
        if (job.isCancelled) break;

        const { source, target } = mapping;
        job.currentFolder = source;

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
            }
          }
        } catch (folderErr) {
          logger.warn({ err: folderErr.message, folder: source }, 'Failed opening source mailbox');
          job.errors.push(`Could not open source folder ${source}: ${folderErr.message}`);
        } finally {
          if (lock) lock.release();
        }

        job.completedFolders++;
      }

      job.status = job.isCancelled ? 'cancelled' : 'completed';
      job.completedAt = new Date();
      logger.info({ userId, migrated: job.migratedMessages, errors: job.errors.length }, 'Migration finished');
    } catch (err) {
      job.status = 'failed';
      job.errors.push(`Fatal migration error: ${err.message}`);
      logger.error({ userId, err: err.message }, 'Fatal migration failure');
    } finally {
      await sourceClient.logout().catch(() => {});
      if (targetClient) await targetClient.logout().catch(() => {});
      job.sourceClient = null;
      if (onProgress) onProgress(job);
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
