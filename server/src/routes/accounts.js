import { Router } from 'express';
import { requireAuth } from '../middleware/auth.js';
import {
  PROVIDER_PRESETS,
  listAccounts,
  connectAccount,
  deleteAccount,
  setDefaultAccount,
  testConnection
} from '../services/accountService.js';

const router = Router();
router.use(requireAuth);

/**
 * GET /api/accounts/presets
 * Return provider presets for quick UI setup
 */
router.get('/presets', (req, res) => {
  res.json({ presets: PROVIDER_PRESETS });
});

/**
 * GET /api/accounts
 * List all connected external accounts for authenticated user
 */
router.get('/', async (req, res) => {
  try {
    const accounts = await listAccounts(req.user.id);
    res.json({ accounts });
  } catch (err) {
    res.status(500).json({ error: err.message || 'Failed to list connected accounts.' });
  }
});

/**
 * POST /api/accounts/connect
 * Connect a new external account (Gmail, Outlook, Yahoo, Custom IMAP)
 */
router.post('/connect', async (req, res) => {
  try {
    const result = await connectAccount(req.user.id, req.body);
    res.status(201).json({
      message: 'External account connected successfully.',
      account: result.account,
      testResults: result.testResults
    });
  } catch (err) {
    res.status(400).json({ error: err.message || 'Failed to connect external account.' });
  }
});

/**
 * POST /api/accounts/test
 * Test credentials without saving
 */
router.post('/test', async (req, res) => {
  try {
    const { provider, email, password, imap_host, imap_port, imap_secure, smtp_host, smtp_port, smtp_secure } = req.body;
    const preset = PROVIDER_PRESETS[provider] || PROVIDER_PRESETS.custom;

    const testResults = await testConnection({
      imap_host: imap_host || preset.imap_host,
      imap_port: imap_port || preset.imap_port,
      imap_secure: imap_secure !== undefined ? imap_secure : preset.imap_secure,
      smtp_host: smtp_host || preset.smtp_host,
      smtp_port: smtp_port || preset.smtp_port,
      smtp_secure: smtp_secure !== undefined ? smtp_secure : preset.smtp_secure,
      email,
      password
    });

    res.json({ testResults });
  } catch (err) {
    res.status(400).json({ error: err.message || 'Connection test encountered an error.' });
  }
});

/**
 * PUT /api/accounts/:id/default
 * Set an account as the primary default
 */
router.put('/:id/default', async (req, res) => {
  try {
    const account = await setDefaultAccount(req.user.id, parseInt(req.params.id, 10));
    if (!account) {
      return res.status(404).json({ error: 'Account not found.' });
    }
    res.json({ message: 'Default account updated.', account });
  } catch (err) {
    res.status(500).json({ error: err.message || 'Failed to set default account.' });
  }
});

/**
 * DELETE /api/accounts/:id
 * Disconnect an external account
 */
router.delete('/:id', async (req, res) => {
  try {
    const deleted = await deleteAccount(req.user.id, parseInt(req.params.id, 10));
    if (!deleted) {
      return res.status(404).json({ error: 'Account not found.' });
    }
    res.json({ message: 'Account disconnected successfully.' });
  } catch (err) {
    res.status(500).json({ error: err.message || 'Failed to disconnect account.' });
  }
});

export default router;
