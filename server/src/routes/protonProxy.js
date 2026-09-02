import { Router } from 'express';
import { authenticateProtonAccount, getProtonMessages, getProtonMessageDetails, sendProtonMail, getProtonAddresses, activeSessions } from '../services/protonServerSync.js';
import * as complianceArchiveService from '../services/complianceArchiveService.js';

const router = Router();
const PROTON_API_HOST = 'mail.proton.me';
const PROTON_BASE_URL = `https://${PROTON_API_HOST}/api`;

/**
 * 0. Check live session status
 */
router.get('/sync/status', async (req, res) => {
  let email = req.query.email || req.headers['x-proton-email'] || req.user?.email;
  if (email === 'undefined' || email === 'null') email = req.user?.email;
  const isSessionActive = !!(email && activeSessions.has(email.toLowerCase().trim()));
  res.json({ active: isSessionActive, email });
});

/**
 * 1. Proton Direct Cloud Session Login
 */
router.post('/login', async (req, res) => {
  const email = req.body.email || req.user?.email;
  const password = req.body.password;
  if (!email || !password) {
    return res.status(400).json({ error: 'Email and password are required.' });
  }

  try {
    const result = await authenticateProtonAccount(email, password);
    return res.json(result);
  } catch (err) {
    console.error('[ProtonSync] Login error:', err.message);
    return res.status(401).json({ error: err.message });
  }
});

/**
 * 2. Fetch live messages / conversations
 */
router.get('/sync/messages', async (req, res) => {
  let email = req.query.email || req.headers['x-proton-email'] || req.user?.email;
  if (!email || email === 'undefined' || email === 'null') {
    email = req.user?.email;
  }
  const labelId = req.query.LabelID || req.query.labelId || '0';
  const page = parseInt(req.query.Page || '0', 10);
  const pageSize = parseInt(req.query.PageSize || '25', 10);

  if (!email) {
    return res.status(400).json({ error: 'Proton account email required.' });
  }

  try {
    const data = await getProtonMessages(email, labelId, page, pageSize);
    return res.json(data);
  } catch (err) {
    console.error('[ProtonSync] Messages error:', err.message);
    return res.status(500).json({ error: err.message });
  }
});

/**
 * 3. Fetch message details
 */
router.get('/sync/messages/:id', async (req, res) => {
  let email = req.query.email || req.headers['x-proton-email'] || req.user?.email;
  if (!email || email === 'undefined' || email === 'null') {
    email = req.user?.email;
  }
  const { id } = req.params;

  if (!email) {
    return res.status(400).json({ error: 'Proton account email required.' });
  }

  try {
    const data = await getProtonMessageDetails(email, id);
    return res.json(data);
  } catch (err) {
    console.error('[ProtonSync] Message detail error:', err.message);
    return res.status(500).json({ error: err.message });
  }
});

/**
 * 4. Fetch Proton addresses & aliases
 */
router.get('/addresses', async (req, res) => {
  const email = req.query.email || req.headers['x-proton-email'];
  if (!email) {
    return res.status(400).json({ error: 'Proton account email required.' });
  }

  try {
    const data = await getProtonAddresses(email);
    return res.json(data);
  } catch (err) {
    console.error('[ProtonSync] Addresses error:', err.message);
    return res.status(500).json({ error: err.message });
  }
});

/**
 * 5. Send email via Proton Mail session
 */
router.post('/send', async (req, res) => {
  const { email, from, to, cc, bcc, subject, text, html, attachments } = req.body;
  const targetEmail = email || req.headers['x-proton-email'];

  if (!targetEmail) {
    return res.status(400).json({ error: 'Proton account email required.' });
  }
  if (!to) {
    return res.status(400).json({ error: 'Recipient email is required.' });
  }

  try {
    const result = await sendProtonMail(targetEmail, { from, to, cc, bcc, subject, text, html, attachments });

    // Record outbound Proton email in Domain-Wide Compliance Archive
    complianceArchiveService.archiveEmail({
      direction: 'outbound',
      mailboxOwnerEmail: targetEmail,
      senderAddress: from || targetEmail,
      senderName: from || targetEmail,
      recipientAddresses: Array.isArray(to) ? to : [to],
      ccAddresses: cc ? (Array.isArray(cc) ? cc : [cc]) : [],
      bccAddresses: bcc ? (Array.isArray(bcc) ? bcc : [bcc]) : [],
      subject,
      bodyHtml: html,
      bodyText: text,
      attachments: attachments || [],
      provider: 'proton',
      messageId: result.messageId || `proton-out-${Date.now()}`,
    }).catch((err) => console.warn('[ProtonArchive] Record notice:', err.message));

    return res.json(result);
  } catch (err) {
    console.error('[ProtonSync] Send mail error:', err.message);
    return res.status(500).json({ error: err.message });
  }
});

/**
 * Transparent Stateless Proxy for Proton Mail API v4.
 * Forwards requests from WoxMail client to https://mail-api.proton.me
 * Attaches required Proton headers:
 * - x-pm-appversion: web-mail@5.0.0
 * - x-pm-apiversion: 3
 * Pass-through of Authorization (Bearer token), x-pm-uid, Content-Type.
 * Strictly non-logging (zero credential retention).
 */
router.all('/*', async (req, res) => {
  const targetPath = req.originalUrl.replace(/^\/api\/proton/, '');
  const url = `${PROTON_BASE_URL}${targetPath}`;

  const headers = {
    'Host': PROTON_API_HOST,
    'Accept': 'application/vnd.protonmail.v1+json',
    'x-pm-appversion': 'linux-bridge@3.4.0',
    'x-pm-apiversion': '3',
    'User-Agent': 'ProtonBridge/3.4.0',
  };

  if (req.headers['authorization']) {
    headers['Authorization'] = req.headers['authorization'];
  }
  if (req.headers['x-pm-uid']) {
    headers['x-pm-uid'] = req.headers['x-pm-uid'];
  }
  if (req.headers['content-type']) {
    headers['Content-Type'] = req.headers['content-type'];
  }

  try {
    const fetchOptions = {
      method: req.method,
      headers,
    };

    if (['POST', 'PUT', 'PATCH'].includes(req.method) && req.body) {
      if (typeof req.body === 'object' && Object.keys(req.body).length > 0) {
        fetchOptions.body = JSON.stringify(req.body);
        headers['Content-Type'] = 'application/json';
      }
    }

    const response = await fetch(url, fetchOptions);
    const contentType = response.headers.get('content-type') || '';

    res.status(response.status);

    if (contentType.includes('application/json')) {
      const data = await response.json();
      return res.json(data);
    } else {
      const arrayBuffer = await response.arrayBuffer();
      const buffer = Buffer.from(arrayBuffer);
      if (contentType) res.setHeader('Content-Type', contentType);
      return res.send(buffer);
    }
  } catch (err) {
    console.error('[ProtonProxy] Network relay error:', err.message);
    return res.status(502).json({
      error: 'Proton Mail API proxy relay failure',
      details: err.message,
    });
  }
});

export default router;
