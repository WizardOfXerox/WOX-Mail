import { Router } from 'express';
import jwt from 'jsonwebtoken';
import { query } from '../config/database.js';
import { JWT_COOKIE_NAME } from '../config/constants.js';

const router = Router();

/**
 * Helper to render a page inside the base layout.
 * Passes common variables (user session, announcements, CSRF, hCaptcha key, currentPath).
 */
async function renderPage(req, res, view, options = {}) {
  let user = null;
  const token = req.cookies?.[JWT_COOKIE_NAME] || req.headers.authorization?.replace('Bearer ', '');
  if (token) {
    try {
      const decoded = jwt.verify(token, process.env.JWT_SECRET);
      if (decoded && decoded.userId) {
        const userRes = await query('SELECT id, email, username, display_name, is_admin FROM users WHERE id = $1', [decoded.userId]);
        if (userRes.rows.length > 0) {
          user = userRes.rows[0];
        }
      }
    } catch {}
  }

  res.render(view, {
    user,
    hcaptchaSiteKey: process.env.HCAPTCHA_SITE_KEY || '',
    domainPermanent: process.env.DOMAIN_PERMANENT || 'wox.world',
    domainTemp: process.env.DOMAIN_TEMP || 'mail.wox.world',
    domainOnion: process.env.DOMAIN_ONION || 'e6mph43cdahjoum7pbrs2gpzvb3edq3j2ob6hi5soihld4oid2fcwbad.onion',
    year: new Date().getFullYear(),
    currentPath: req.path,
    ...options,
  });
}

// ─── Public Pages ────────────────────────────────────────

router.get('/', async (req, res) => {
  await renderPage(req, res, 'landing', { title: 'Home', description: 'WoxMail — Your Private Email Suite with Temp Mail, WoxAuth, and WoxCalendar' });
});

router.get('/login', async (req, res) => {
  await renderPage(req, res, 'login', { title: 'Login' });
});

router.get('/register', async (req, res) => {
  await renderPage(req, res, 'register', { title: 'Register' });
});

router.get('/forgot-password', async (req, res) => {
  await renderPage(req, res, 'forgot-password', { title: 'Forgot Password' });
});

router.get('/otp-setup', async (req, res) => {
  await renderPage(req, res, 'otp-setup', { title: '2FA Setup', showNav: false });
});

router.get('/personal', async (req, res) => {
  res.redirect('/tempmail/personal');
});

router.get('/support', async (req, res) => {
  await renderPage(req, res, 'support', { title: 'Support Desk' });
});

router.get('/tempmail', async (req, res) => {
  await renderPage(req, res, 'tempmail', { title: 'Temp Mail' });
});

router.get('/tempmail/personal', async (req, res) => {
  await renderPage(req, res, 'tempmail-personal', { title: 'Personal Temp Mail' });
});

router.get('/tempmail/login', async (req, res) => {
  await renderPage(req, res, 'tempmail-login', { title: 'Temp Mail Login' });
});

// ─── Zero-JS Fallback Temp Mail ──────────────────────────

router.get('/tempmail/nojs', async (req, res) => {
  try {
    const { TEMP_COOKIE_NAME } = await import('../config/constants.js');
    const { claimAddress } = await import('../services/pool.js');
    const { createConnection, fetchMessages } = await import('../services/imap.js');
    
    let token = req.cookies?.[TEMP_COOKIE_NAME] || req.signedCookies?.[TEMP_COOKIE_NAME];
    let addressRecord = null;

    if (token) {
      const result = await query(
        `SELECT id, address, expires_at, imap_password
         FROM temp_addresses
         WHERE session_token = $1 AND status = 'active' AND expires_at > NOW()`,
        [token]
      );
      if (result.rows.length > 0) {
        addressRecord = result.rows[0];
      }
    }

    if (!addressRecord) {
      addressRecord = await claimAddress(req.ip || '127.0.0.1', 24);
      res.cookie(TEMP_COOKIE_NAME, addressRecord.session_token, {
        httpOnly: true,
        secure: process.env.NODE_ENV === 'production',
        sameSite: 'lax',
        maxAge: 72 * 3600 * 1000,
        path: '/',
      });
    }

    let messages = [];
    if (addressRecord && addressRecord.imap_password) {
      try {
        const client = await createConnection(addressRecord.address, addressRecord.imap_password);
        const fetched = await fetchMessages(client, 'INBOX', { page: 1, limit: 50 });
        messages = fetched.messages || [];
        await client.logout().catch(() => {});
      } catch (err) {
        // Fallback for dev mode
      }
    }

    res.render('tempmail-nojs', {
      title: 'Temp Mail (Zero-JS Mode) — WoxMail',
      active: true,
      address: addressRecord.address,
      expiresAt: addressRecord.expires_at,
      messages,
      selectedMessage: null,
    });
  } catch (err) {
    res.status(500).render('error', { title: 'Error', error: err.message, status: 500 });
  }
});

router.post('/tempmail/nojs/generate', async (req, res) => {
  try {
    const { TEMP_COOKIE_NAME } = await import('../config/constants.js');
    const { claimAddress } = await import('../services/pool.js');
    
    const addressRecord = await claimAddress(req.ip || '127.0.0.1', 24);
    res.cookie(TEMP_COOKIE_NAME, addressRecord.session_token, {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'lax',
      maxAge: 72 * 3600 * 1000,
      path: '/',
    });
    res.redirect('/tempmail/nojs');
  } catch (err) {
    res.redirect('/tempmail/nojs');
  }
});

router.post('/tempmail/nojs/custom', async (req, res) => {
  try {
    const { TEMP_COOKIE_NAME } = await import('../config/constants.js');
    const { claimAddress } = await import('../services/pool.js');
    const username = req.body.username?.trim();

    if (username) {
      const addressRecord = await claimAddress(req.ip || '127.0.0.1', 24, username);
      res.cookie(TEMP_COOKIE_NAME, addressRecord.session_token, {
        httpOnly: true,
        secure: process.env.NODE_ENV === 'production',
        sameSite: 'lax',
        maxAge: 72 * 3600 * 1000,
        path: '/',
      });
    }
    res.redirect('/tempmail/nojs');
  } catch (err) {
    res.redirect('/tempmail/nojs');
  }
});

router.get('/tempmail/nojs/view/:uid', async (req, res) => {
  try {
    const { TEMP_COOKIE_NAME } = await import('../config/constants.js');
    const { createConnection, fetchMessage, fetchMessages } = await import('../services/imap.js');
    const { simpleParser } = await import('mailparser');
    const { sanitizeEmail } = await import('../services/emailSanitizer.js');

    const token = req.cookies?.[TEMP_COOKIE_NAME] || req.signedCookies?.[TEMP_COOKIE_NAME];
    if (!token) return res.redirect('/tempmail/nojs');

    const result = await query(
      `SELECT id, address, expires_at, imap_password
       FROM temp_addresses
       WHERE session_token = $1 AND status = 'active' AND expires_at > NOW()`,
      [token]
    );

    if (result.rows.length === 0) return res.redirect('/tempmail/nojs');
    const addressRecord = result.rows[0];

    const client = await createConnection(addressRecord.address, addressRecord.imap_password);
    const msg = await fetchMessage(client, 'INBOX', parseInt(req.params.uid, 10));
    const allMessages = await fetchMessages(client, 'INBOX', { page: 1, limit: 50 });
    await client.logout().catch(() => {});

    if (!msg) return res.redirect('/tempmail/nojs');

    const parsed = await simpleParser(msg.source);
    let otpCode = null;
    const bodyToCheck = `${parsed.subject || ''} ${parsed.text || ''}`;
    const otpMatch = bodyToCheck.match(/(?:code\s*is\s*|verification\s*code\D*|otp\D*)(\d{4,8})\b/i);
    if (otpMatch) {
      otpCode = otpMatch[1];
    }

    const selectedMessage = {
      uid: msg.uid,
      subject: parsed.subject,
      from: parsed.from?.value?.[0],
      date: parsed.date || msg.date,
      text: parsed.text,
      html: parsed.html,
      sanitizedHtml: parsed.html ? sanitizeEmail(parsed.html) : null,
      otpCode,
    };

    res.render('tempmail-nojs', {
      title: `${parsed.subject || 'View Email'} — WoxMail (Zero-JS)`,
      active: true,
      address: addressRecord.address,
      expiresAt: addressRecord.expires_at,
      messages: allMessages.messages || [],
      selectedMessage,
    });
  } catch (err) {
    res.redirect('/tempmail/nojs');
  }
});

router.post('/tempmail/nojs/delete', async (req, res) => {
  try {
    const { TEMP_COOKIE_NAME } = await import('../config/constants.js');
    const token = req.cookies?.[TEMP_COOKIE_NAME] || req.signedCookies?.[TEMP_COOKIE_NAME];
    if (token) {
      await query("UPDATE temp_addresses SET status = 'expired' WHERE session_token = $1", [token]);
      res.clearCookie(TEMP_COOKIE_NAME, { path: '/' });
    }
    res.redirect('/tempmail/nojs');
  } catch (err) {
    res.redirect('/tempmail/nojs');
  }
});

// ─── Authenticated Pages (React shells) ──────────────────

router.get('/dashboard', async (req, res) => {
  await renderPage(req, res, 'dashboard', { title: 'Inbox', showNav: false, showFooter: false });
});

router.get('/settings', async (req, res) => {
  await renderPage(req, res, 'settings', { title: 'Settings', showNav: false, showFooter: false });
});

router.get('/admin', async (req, res) => {
  try {
    const { JWT_COOKIE_NAME } = await import('../config/constants.js');
    const jwt = (await import('jsonwebtoken')).default;
    const token = req.cookies?.[JWT_COOKIE_NAME] || req.headers.authorization?.replace('Bearer ', '');
    if (!token) return res.redirect('/login?redirect=/admin');

    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    const userRes = await query('SELECT is_admin FROM users WHERE id = $1', [decoded.userId]);
    if (!userRes.rows[0]?.is_admin) {
      return res.redirect('/dashboard');
    }

    await renderPage(req, res, 'admin', { title: 'Admin Control Center', showNav: false, showFooter: false });
  } catch (err) {
    res.redirect('/login?redirect=/admin');
  }
});

// ─── Legal / Static Pages ────────────────────────────────

router.get('/privacy', async (req, res) => {
  await renderPage(req, res, 'privacy', { title: 'Privacy Policy' });
});

router.get('/terms', async (req, res) => {
  await renderPage(req, res, 'terms', { title: 'Terms of Service' });
});

// ─── Secure Locked Message Portal (Enclave Vault) ──────

router.get(['/secure/:token', '/m/:token', '/vault/:token', '/v/:token'], (req, res) => {
  res.render('secure-unlock', { token: req.params.token });
});

// ─── FutureMe / Letters to the Future Pages ──────────────

router.get('/futureme', async (req, res) => {
  await renderPage(req, res, 'futureme', { title: 'Write a Letter to the Future — FutureMe' });
});

router.get('/futureme/public', async (req, res) => {
  await renderPage(req, res, 'futureme-public', { title: 'Public Epistles & Letters from the Past' });
});

router.get('/futureme/verify/:token', async (req, res) => {
  await renderPage(req, res, 'futureme-verify', { title: 'Letter Verified', token: req.params.token });
});

// ─── Developer Interactive Web Terminal (Admin Protected) ──────────────────

router.get('/terminal', async (req, res) => {
  try {
    const { JWT_COOKIE_NAME } = await import('../config/constants.js');
    const jwt = (await import('jsonwebtoken')).default;
    const token = req.cookies?.[JWT_COOKIE_NAME] || req.headers.authorization?.replace('Bearer ', '');
    if (!token) return res.redirect('/login?redirect=/admin%23terminal');

    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    const userRes = await query('SELECT is_admin FROM users WHERE id = $1', [decoded.userId]);
    if (!userRes.rows[0]?.is_admin) {
      return res.redirect('/dashboard');
    }

    await renderPage(req, res, 'terminal', { title: 'WoxMail Sovereign Admin Terminal', showNav: false, showFooter: false });
  } catch (err) {
    res.redirect('/login?redirect=/admin%23terminal');
  }
});

export default router;
