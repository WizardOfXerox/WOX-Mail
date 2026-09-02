/**
 * Automation, Protocols, Sieve Rules, Backups, and WKD API Routes
 */

import { Router } from 'express';
import { requireAuth, requireAdmin } from '../middleware/auth.js';
import { getUserSieveRules, saveSieveRule, deleteSieveRule, evaluateSieveRules, purgeAgingEmailsByRules } from '../services/sieveService.js';
import { createMailboxBackup, listUserBackups } from '../services/backupService.js';
import { searchBlindIndex, indexMessageBlind } from '../services/zeroKnowledgeSearchService.js';
import { executeUnsubscribe } from '../services/unsubscribeService.js';
import { getPublicKeyByWkdHash, computeWkdHash } from '../services/wkdService.js';
import { auditDomainDnsHealth } from '../services/dnsHealthService.js';
import { getJmapSession, executeJmapBatch } from '../services/jmapService.js';
import pino from 'pino';

const logger = pino({ name: 'protocols-and-automation' });
const router = Router();

// ─── 1. Sieve Rules API ─────────────────────────────────────────

router.get('/sieve/rules', requireAuth, async (req, res) => {
  try {
    const rules = await getUserSieveRules(req.user.id);
    return res.json({ success: true, rules });
  } catch (err) {
    logger.error({ err, userId: req.user?.id }, 'Failed to fetch Sieve rules');
    return res.status(500).json({ error: 'Failed to fetch rules' });
  }
});

router.post('/sieve/rules', requireAuth, async (req, res) => {
  try {
    const rule = await saveSieveRule(req.user.id, req.body);
    return res.json({ success: true, rule });
  } catch (err) {
    logger.error({ err, userId: req.user?.id }, 'Failed to save Sieve rule');
    return res.status(500).json({ error: err.message || 'Failed to save rule' });
  }
});

router.delete('/sieve/rules/:id', requireAuth, async (req, res) => {
  try {
    const ruleId = parseInt(req.params.id, 10);
    await deleteSieveRule(req.user.id, ruleId);
    return res.json({ success: true, message: 'Rule deleted' });
  } catch (err) {
    logger.error({ err, userId: req.user?.id }, 'Failed to delete Sieve rule');
    return res.status(500).json({ error: 'Failed to delete rule' });
  }
});

router.post('/sieve/purge-aging', requireAuth, async (req, res) => {
  try {
    const result = await purgeAgingEmailsByRules(req.user.id, req.body?.emails || []);
    return res.json({ success: true, ...result });
  } catch (err) {
    logger.error({ err, userId: req.user?.id }, 'Failed to execute purge aging emails');
    return res.status(500).json({ error: 'Failed to purge aging emails' });
  }
});

// ─── 2. Mailbox Backups & Cloudflare R2 Archiving ───────────────

router.post('/backups/export', requireAuth, async (req, res) => {
  try {
    const { format = 'mbox', destination, emails = [], passphrase } = req.body;
    const backup = await createMailboxBackup(req.user.id, { format, destination, emails, passphrase });

    if (req.query.download === 'true' && backup.buffer) {
      res.setHeader('Content-Type', backup.contentType || 'application/octet-stream');
      res.setHeader('Content-Disposition', `attachment; filename="${backup.filename}"`);
      return res.send(backup.buffer);
    }

    return res.json({ success: true, backup: backup.backup, filename: backup.filename, sha256: backup.sha256 });
  } catch (err) {
    logger.error({ err, userId: req.user?.id }, 'Failed to create mailbox backup');
    return res.status(500).json({ error: err.message || 'Failed to generate backup' });
  }
});

router.get('/backups/list', requireAuth, async (req, res) => {
  try {
    const backups = await listUserBackups(req.user.id);
    return res.json({ success: true, backups });
  } catch (err) {
    logger.error({ err, userId: req.user?.id }, 'Failed to list backups');
    return res.status(500).json({ error: 'Failed to retrieve backups' });
  }
});

// ─── 3. Zero-Knowledge Blind Search Index ───────────────────────

router.post('/search/blind-query', requireAuth, async (req, res) => {
  try {
    const { query: queryText, folder, salt } = req.body;
    if (!queryText) {
      return res.status(400).json({ error: 'Query text is required' });
    }

    const matches = await searchBlindIndex(req.user.id, queryText, salt, folder);
    return res.json({ success: true, matches, count: matches.length });
  } catch (err) {
    logger.error({ err, userId: req.user?.id }, 'Failed to search blind index');
    return res.status(500).json({ error: err.message || 'Blind search failed' });
  }
});

// ─── 4. One-Click List-Unsubscribe Daemon ────────────────────────

router.post('/mail/unsubscribe', requireAuth, async (req, res) => {
  try {
    const { listUnsubscribe, listUnsubscribePost } = req.body;
    if (!listUnsubscribe) {
      return res.status(400).json({ error: 'List-Unsubscribe header is required' });
    }

    const result = await executeUnsubscribe(listUnsubscribe, listUnsubscribePost);
    return res.json({ success: true, ...result });
  } catch (err) {
    logger.error({ err }, 'Failed to execute one-click unsubscribe');
    return res.status(500).json({ error: err.message || 'Failed to unsubscribe' });
  }
});

// ─── 5. DNS Deliverability Health Probe ─────────────────────────

router.get('/admin/dns-health', requireAuth, async (req, res) => {
  try {
    const domain = req.query.domain || process.env.DOMAIN_PERMANENT || 'wox.world';
    const audit = await auditDomainDnsHealth(domain);
    return res.json({ success: true, audit });
  } catch (err) {
    logger.error({ err }, 'Failed to audit DNS health');
    return res.status(500).json({ error: 'Failed to run DNS health audit' });
  }
});

// ─── 6. JMAP Protocol Endpoints (RFC 8620) ──────────────────────

router.get('/jmap/session', requireAuth, (req, res) => {
  const session = getJmapSession(req.user, `${req.protocol}://${req.get('host')}`);
  return res.json(session);
});

router.post('/jmap', requireAuth, async (req, res) => {
  try {
    const response = await executeJmapBatch(req.user, req.body);
    return res.json(response);
  } catch (err) {
    logger.error({ err }, 'JMAP batch execution error');
    return res.status(500).json({ error: err.message });
  }
});

// ─── 7. OpenPGP Web Key Directory (WKD) Discovery ───────────────

router.get('/.well-known/openpgpkey/hu/:hash', async (req, res) => {
  try {
    const host = req.get('host') || '';
    const domain = host.replace(/^openpgpkey\./, '').split(':')[0] || 'wox.world';
    const hash = req.params.hash;

    const result = await getPublicKeyByWkdHash(domain, hash);
    if (!result) {
      return res.status(404).send('Key not found');
    }

    res.setHeader('Content-Type', 'application/octet-stream');
    res.setHeader('Access-Control-Allow-Origin', '*');
    return res.send(result.publicKeyArmored);
  } catch (err) {
    logger.warn({ err }, 'WKD key discovery error');
    return res.status(500).send('Internal error');
  }
});

router.get('/.well-known/openpgpkey/policy', (req, res) => {
  res.setHeader('Content-Type', 'text/plain');
  res.setHeader('Access-Control-Allow-Origin', '*');
  return res.send('protocol-version: 1\n');
});

export default router;
