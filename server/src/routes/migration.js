import { Router } from 'express';
import { requireAuth } from '../middleware/auth.js';
import * as migrationService from '../services/migrationService.js';
import * as imapService from '../services/imap.js';
import { query } from '../config/database.js';
import pino from 'pino';

const logger = pino({ name: 'woxmail:migration-route' });
const router = Router();

/**
 * Helper to get target IMAP connection for the logged-in user.
 */
async function getUserImapClient(userId) {
  const creds = await query(
    'SELECT email, imap_password FROM users WHERE id = $1',
    [userId]
  );
  if (creds.rows.length === 0) throw new Error('User not found');
  const { email, imap_password } = creds.rows[0];
  const pass = imap_password || process.env.ADMIN_PASSWORD;
  return await imapService.createConnection(email, pass);
}

/**
 * POST /api/mail/migration/connect
 * Test source IMAP server credentials and return available mailboxes.
 */
router.post('/connect', requireAuth, async (req, res) => {
  try {
    const { host, port = 993, secure = true, username, password } = req.body;
    if (!host || !username || !password) {
      return res.status(400).json({ error: 'host, username, and password are required' });
    }

    const { folders } = await migrationService.testSourceConnection({ host, port, secure, username, password });
    const autoMapped = migrationService.autoMapFolders(folders);

    res.json({
      success: true,
      folders,
      recommendedMapping: autoMapped
    });
  } catch (err) {
    logger.error({ err: err.message }, 'Migration connect test failed');
    res.status(400).json({ error: err.message });
  }
});

/**
 * POST /api/mail/migration/start
 * Begin background mailbox migration.
 */
router.post('/start', requireAuth, async (req, res) => {
  try {
    const { host, port = 993, secure = true, username, password, folderMapping } = req.body;
    if (!host || !username || !password || !Array.isArray(folderMapping) || folderMapping.length === 0) {
      return res.status(400).json({ error: 'host, username, password, and folderMapping array are required' });
    }

    const targetClient = await getUserImapClient(req.userId);
    const job = await migrationService.startMigration(
      req.userId,
      { host, port, secure, username, password },
      folderMapping,
      targetClient
    );

    res.json({
      success: true,
      message: 'Migration initiated in background',
      job: {
        status: job.status,
        totalFolders: job.totalFolders,
        startedAt: job.startedAt
      }
    });
  } catch (err) {
    logger.error({ err: err.message }, 'Failed to start migration');
    res.status(500).json({ error: err.message });
  }
});

/**
 * GET /api/mail/migration/status
 * Get current migration progress.
 */
router.get('/status', requireAuth, (req, res) => {
  const job = migrationService.getMigrationState(req.userId);
  if (!job) {
    return res.json({ status: 'idle' });
  }

  res.json({
    status: job.status,
    currentFolder: job.currentFolder,
    totalFolders: job.totalFolders,
    completedFolders: job.completedFolders,
    totalMessages: job.totalMessages,
    migratedMessages: job.migratedMessages,
    skippedMessages: job.skippedMessages,
    errors: job.errors,
    startedAt: job.startedAt,
    completedAt: job.completedAt || null
  });
});

/**
 * POST /api/mail/migration/cancel
 * Cancel ongoing migration.
 */
router.post('/cancel', requireAuth, async (req, res) => {
  const cancelled = await migrationService.cancelMigration(req.userId);
  res.json({ success: true, cancelled });
});

/**
 * POST /api/mail/migration/import-eml
 * Import a single raw EML message into a target folder.
 */
router.post('/import-eml', requireAuth, async (req, res) => {
  try {
    const { folder = 'INBOX', emlContent, isBase64 = false } = req.body;
    if (!emlContent) {
      return res.status(400).json({ error: 'emlContent is required' });
    }

    const buffer = isBase64 ? Buffer.from(emlContent, 'base64') : Buffer.from(emlContent, 'utf-8');
    let targetClient;
    try {
      targetClient = await getUserImapClient(req.userId);
      const appendRes = await migrationService.importEmlMessage(targetClient, folder, buffer);
      res.json({
        success: true,
        message: 'EML message imported successfully',
        uid: appendRes?.uid || null
      });
    } finally {
      if (targetClient) await targetClient.logout().catch(() => {});
    }
  } catch (err) {
    logger.error({ err: err.message }, 'Failed to import EML');
    res.status(500).json({ error: err.message });
  }
});

export default router;
