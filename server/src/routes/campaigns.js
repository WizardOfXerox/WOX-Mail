import { Router } from 'express';
import { requireAuth } from '../middleware/auth.js';
import {
  createList,
  listLists,
  deleteList,
  addSubscriber,
  importSubscribers,
  listSubscribers,
  createCampaign,
  listCampaigns,
  sendTestEmail,
  startCampaign,
  handleUnsubscribe,
  generateSignupForm
} from '../services/campaignService.js';
import pino from 'pino';

const logger = pino({ name: 'woxmail:campaigns-route' });
const router = Router();

// ─── Public Unsubscribe Endpoints ────────────────────────
router.get('/unsubscribe/:token', async (req, res) => {
  const result = await handleUnsubscribe(req.params.token);
  if (!result) {
    return res.status(404).send(`
      <!DOCTYPE html>
      <html>
        <body style="font-family: sans-serif; text-align: center; padding: 40px; background: #0f0f1a; color: #f0f0f5;">
          <h2>Invalid or expired unsubscribe link.</h2>
        </body>
      </html>
    `);
  }
  res.send(`
    <!DOCTYPE html>
    <html>
      <body style="font-family: sans-serif; text-align: center; padding: 50px; background: #0f0f1a; color: #f0f0f5;">
        <div style="max-width: 500px; margin: 0 auto; background: #1a1a2e; padding: 30px; border-radius: 12px; border: 1px solid #2a2a4a;">
          <h2 style="color: #22c55e;">✓ Successfully Unsubscribed</h2>
          <p style="color: #9898b0;">${result.email} has been removed from this mailing list.</p>
        </div>
      </body>
    </html>
  `);
});

// RFC 8058 One-Click Unsubscribe POST
router.post('/unsubscribe/:token', async (req, res) => {
  const result = await handleUnsubscribe(req.params.token);
  if (!result) {
    return res.status(404).json({ error: 'Token not found' });
  }
  res.json({ success: true, message: 'Unsubscribed successfully' });
});

// Public Subscribe Form Endpoint (Dual-Mode Verification Support)
router.post('/subscribe/:listId', async (req, res) => {
  try {
    const listId = parseInt(req.params.listId, 10);
    const { email, first_name, last_name } = req.body;
    if (!email || !email.includes('@')) {
      return res.status(400).send('Valid email is required');
    }

    const cleanEmail = email.trim().toLowerCase();
    const listRes = await query('SELECT * FROM mailing_lists WHERE id = $1', [listId]);
    if (listRes.rows.length === 0) {
      return res.status(404).send('Mailing list not found');
    }

    const list = listRes.rows[0];

    if (list.optin_type === 'double') {
      // Create pending subscriber
      await query(
        `INSERT INTO subscribers (list_id, email, first_name, last_name, status, custom_fields, unsubscribe_token)
         VALUES ($1, $2, $3, $4, 'pending', '{}', $5)
         ON CONFLICT (list_id, email)
         DO UPDATE SET status = 'pending', first_name = EXCLUDED.first_name, last_name = EXCLUDED.last_name`,
        [listId, cleanEmail, (first_name || '').trim(), (last_name || '').trim(), crypto.randomBytes(24).toString('hex')]
      );

      // Start Dual-Mode Verification challenge
      const { createVerificationSession } = await import('../services/verificationService.js');
      const session = await createVerificationSession({
        type: 'newsletter_optin',
        targetEmail: cleanEmail,
        meta: { listId, listName: list.name },
      });

      return res.send(`
        <!DOCTYPE html>
        <html>
          <head>
            <meta charset="utf-8">
            <title>Confirm Your Subscription — WoxMail</title>
            <style>
              body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; text-align: center; padding: 40px 15px; background: #0f0f1a; color: #f0f0f5; }
              .card { max-width: 500px; margin: 0 auto; background: #1a1a2e; padding: 36px 28px; border-radius: 16px; border: 1px solid #2a2a4a; box-shadow: 0 10px 30px rgba(0,0,0,0.5); }
              .badge { display: inline-block; background: rgba(124, 58, 237, 0.18); color: #c084fc; border: 1px solid rgba(124, 58, 237, 0.35); font-size: 11px; font-weight: 700; text-transform: uppercase; letter-spacing: 1px; padding: 4px 12px; border-radius: 999px; margin-bottom: 16px; }
              .input { width: 180px; padding: 12px; font-size: 20px; font-weight: 700; letter-spacing: 6px; text-align: center; background: #0f0f1a; border: 1px solid #7c3aed; border-radius: 8px; color: #ffffff; outline: none; margin: 16px 0; }
              .btn { background: #7c3aed; color: #fff; border: none; padding: 12px 24px; border-radius: 999px; font-weight: 600; cursor: pointer; font-size: 14px; }
              .dual-box { background: rgba(59, 130, 246, 0.08); border-left: 3px solid #3b82f6; padding: 12px; border-radius: 0 8px 8px 0; margin: 20px 0; font-size: 13px; color: #93c5fd; text-align: left; }
            </style>
          </head>
          <body>
            <div class="card" id="mainCard">
              <div class="badge">🔐 Verification Required</div>
              <h2 style="margin: 0 0 10px;">Confirm Your Subscription</h2>
              <p style="color: #9898b0; font-size: 14px;">We sent a 6-digit confirmation code to <strong>${cleanEmail}</strong>.</p>
              
              <div class="dual-box">
                <strong>⚡ Zero Friction:</strong> You can simply <strong>hit Reply</strong> to the email with the code, and this screen will update automatically!
              </div>

              <form id="verifyForm">
                <div>
                  <input class="input" id="codeInput" placeholder="------" maxlength="6" autofocus required />
                </div>
                <button type="submit" class="btn" id="submitBtn">Confirm Subscription</button>
              </form>
              <div id="msg" style="margin-top: 14px; font-size: 13px;"></div>
            </div>

            <script src="/socket.io/socket.io.js"></script>
            <script>
              const sessionToken = "${session.sessionToken}";
              const socket = io();
              socket.on('verification_success', (data) => {
                if (data.sessionToken === sessionToken) {
                  showSuccess(data.message || 'Subscription confirmed!');
                }
              });

              function showSuccess(text) {
                document.getElementById('mainCard').innerHTML = \`
                  <div style="font-size: 48px; margin-bottom: 12px;">🎉</div>
                  <h2 style="color: #22c55e; margin: 0 0 10px;">Subscription Confirmed!</h2>
                  <p style="color: #9898b0; font-size: 14px;">\${text}</p>
                \`;
              }

              document.getElementById('verifyForm').addEventListener('submit', async (e) => {
                e.preventDefault();
                const code = document.getElementById('codeInput').value.trim();
                const submitBtn = document.getElementById('submitBtn');
                const msg = document.getElementById('msg');
                submitBtn.disabled = true;
                submitBtn.innerText = 'Verifying...';
                try {
                  const res = await fetch('/api/verify/confirm', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ sessionToken, code })
                  });
                  const json = await res.json();
                  if (json.success) {
                    showSuccess(json.message);
                  } else {
                    msg.innerHTML = '<span style="color: #ef4444;">' + (json.error || 'Invalid code') + '</span>';
                    submitBtn.disabled = false;
                    submitBtn.innerText = 'Confirm Subscription';
                  }
                } catch (err) {
                  msg.innerHTML = '<span style="color: #ef4444;">' + err.message + '</span>';
                  submitBtn.disabled = false;
                  submitBtn.innerText = 'Confirm Subscription';
                }
              });
            </script>
          </body>
        </html>
      `);
    }

    // Single optin: Add directly as active
    await addSubscriber(listId, {
      email: cleanEmail,
      firstName: first_name,
      lastName: last_name
    });
    res.send(`
      <!DOCTYPE html>
      <html>
        <body style="font-family: sans-serif; text-align: center; padding: 50px; background: #0f0f1a; color: #f0f0f5;">
          <div style="max-width: 500px; margin: 0 auto; background: #1a1a2e; padding: 30px; border-radius: 12px; border: 1px solid #2a2a4a;">
            <h2 style="color: #7c3aed;">🎉 You are subscribed!</h2>
            <p style="color: #9898b0;">Thank you for joining our list.</p>
          </div>
        </body>
      </html>
    `);
  } catch (err) {
    res.status(500).send('Error processing subscription');
  }
});

// ─── Authenticated User Campaign Routes ────────────────────
router.use(requireAuth);

/**
 * GET /api/campaigns/lists
 */
router.get('/lists', async (req, res, next) => {
  try {
    const lists = await listLists(req.userId);
    res.json({ lists });
  } catch (err) {
    next(err);
  }
});

/**
 * POST /api/campaigns/lists
 */
router.post('/lists', async (req, res, next) => {
  try {
    const { name, description, optinType } = req.body;
    if (!name?.trim()) {
      return res.status(400).json({ error: 'List name is required' });
    }
    const list = await createList(req.userId, { name, description, optinType });
    res.json({ success: true, list });
  } catch (err) {
    next(err);
  }
});

/**
 * DELETE /api/campaigns/lists/:id
 */
router.delete('/lists/:id', async (req, res, next) => {
  try {
    const deleted = await deleteList(req.userId, parseInt(req.params.id, 10));
    if (!deleted) return res.status(404).json({ error: 'List not found' });
    res.json({ success: true });
  } catch (err) {
    next(err);
  }
});

/**
 * GET /api/campaigns/lists/:id/subscribers
 */
router.get('/lists/:id/subscribers', async (req, res, next) => {
  try {
    const { id } = req.params;
    const { page = 1, limit = 50, status } = req.query;
    const data = await listSubscribers(parseInt(id, 10), {
      page: parseInt(page, 10),
      limit: parseInt(limit, 10),
      status
    });
    res.json(data);
  } catch (err) {
    next(err);
  }
});

/**
 * POST /api/campaigns/lists/:id/import
 * Bulk import subscribers via JSON array or parsed CSV
 */
router.post('/lists/:id/import', async (req, res, next) => {
  try {
    const { id } = req.params;
    const { subscribers = [] } = req.body;
    if (!Array.isArray(subscribers) || subscribers.length === 0) {
      return res.status(400).json({ error: 'subscribers must be a non-empty array of objects' });
    }
    const result = await importSubscribers(parseInt(id, 10), subscribers);
    res.json({ success: true, ...result });
  } catch (err) {
    next(err);
  }
});

/**
 * GET /api/campaigns/lists/:id/embed
 */
router.get('/lists/:id/embed', (req, res) => {
  const formHtml = generateSignupForm(req.params.id);
  res.json({ html: formHtml });
});

/**
 * GET /api/campaigns
 */
router.get('/', async (req, res, next) => {
  try {
    const campaigns = await listCampaigns(req.userId);
    res.json({ campaigns });
  } catch (err) {
    next(err);
  }
});

/**
 * POST /api/campaigns
 */
router.post('/', async (req, res, next) => {
  try {
    const { listId, title, subject, fromName, fromEmail, htmlContent, plainContent } = req.body;
    if (!listId || !title || !subject || !htmlContent) {
      return res.status(400).json({ error: 'listId, title, subject, and htmlContent are required' });
    }
    const campaign = await createCampaign(req.userId, {
      listId: parseInt(listId, 10),
      title,
      subject,
      fromName,
      fromEmail,
      htmlContent,
      plainContent
    });
    res.json({ success: true, campaign });
  } catch (err) {
    next(err);
  }
});

/**
 * POST /api/campaigns/:id/test
 */
router.post('/:id/test', async (req, res, next) => {
  try {
    const { id } = req.params;
    const { testEmail } = req.body;
    if (!testEmail || !testEmail.includes('@')) {
      return res.status(400).json({ error: 'Valid testEmail is required' });
    }
    const result = await sendTestEmail(req.userId, parseInt(id, 10), testEmail);
    res.json(result);
  } catch (err) {
    next(err);
  }
});

/**
 * POST /api/campaigns/:id/send
 */
router.post('/:id/send', async (req, res, next) => {
  try {
    const { id } = req.params;
    const campaign = await startCampaign(req.userId, parseInt(id, 10));
    res.json({ success: true, campaign });
  } catch (err) {
    next(err);
  }
});

export default router;
