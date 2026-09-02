import { Router } from 'express';
import jwt from 'jsonwebtoken';
import { v4 as uuidv4 } from 'uuid';
import { query } from '../config/database.js';
import { redis, setex as redisSetex, get as redisGet, del as redisDel } from '../config/redis.js';
import { hashPassword, verifyPassword, generateToken, generateRecoveryCodes } from '../utils/crypto.js';
import { isValidEmail, validateUsername, validatePassword, isValidInviteCode } from '../utils/validators.js';
import { authenticate, requireAuth } from '../middleware/auth.js';
import { loginLimiter } from '../middleware/rateLimit.js';
import { validate } from '../middleware/validate.js';
import { JWT_COOKIE_NAME } from '../config/constants.js';
import { authenticator } from 'otplib';
import QRCode from 'qrcode';
import { createUser } from '../services/purelymail.js';
import { sendWoxWelcomeEmail } from '../services/welcomeService.js';
import { testConnection, connectAccount, PROVIDER_PRESETS } from '../services/accountService.js';

const router = Router();

// ─── Helpers ─────────────────────────────────────────────

/**
 * Issue a JWT access token and set it as an HTTP-only cookie.
 * Also creates a session record in the database.
 */
async function issueToken(res, user, req) {
  const jti = uuidv4();
  const expiresIn = process.env.JWT_EXPIRES_IN || '7d';

  const token = jwt.sign(
    { userId: user.id, type: 'access', jti },
    process.env.JWT_SECRET,
    { expiresIn }
  );

  // Parse expiry for cookie and session record
  const decoded = jwt.decode(token);
  const expiresAt = new Date(decoded.exp * 1000);

  // Store session in database for "active sessions" management
  await query(
    `INSERT INTO user_sessions (id, user_id, ip_address, user_agent, expires_at)
     VALUES ($1, $2, $3, $4, $5)`,
    [jti, user.id, req.ip, req.headers['user-agent']?.slice(0, 256), expiresAt]
  );

  // Set HTTP-only cookie
  res.cookie(JWT_COOKIE_NAME, token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'strict',
    maxAge: expiresAt - Date.now(),
    path: '/',
  });

  // If user was scheduled for deletion and is logging in within 14 days, auto-cancel deletion!
  const cancelResult = await query(
    `UPDATE users
     SET deletion_scheduled_at = NULL,
         deletion_requested_at = NULL,
         deletion_reason = NULL,
         updated_at = NOW()
     WHERE id = $1 AND deletion_scheduled_at IS NOT NULL
     RETURNING id, email`,
    [user.id]
  );
  if (cancelResult.rowCount > 0) {
    await query(
      `INSERT INTO audit_log (actor_type, actor_id, action, details, ip_address)
       VALUES ('user', $1, 'account_deletion_cancelled_by_login', $2, $3)`,
      [String(user.id), JSON.stringify({ ip: req.ip, email: user.email }), req.ip]
    );
  }

  // Update last login
  await query('UPDATE users SET last_login_at = NOW() WHERE id = $1', [user.id]);

  return token;
}

/**
 * Log an auth event to login_history and audit_log.
 */
async function logAuthEvent(userId, success, req, reason = null) {
  await query(
    `INSERT INTO login_history (user_id, ip_address, user_agent, success, failure_reason)
     VALUES ($1, $2, $3, $4, $5)`,
    [userId, req.ip, req.headers['user-agent']?.slice(0, 256), success, reason]
  );

  await query(
    `INSERT INTO audit_log (actor_type, actor_id, action, ip_address, user_agent, details)
     VALUES ('user', $1, $2, $3, $4, $5)`,
    [
      String(userId || 'unknown'),
      success ? 'login' : 'login_failed',
      req.ip,
      req.headers['user-agent']?.slice(0, 256),
      reason ? JSON.stringify({ reason }) : null,
    ]
  );
}

// ─── POST /api/auth/register ─────────────────────────────

router.post('/register',
  validate({
    username: { type: 'string', required: true, min: 3, max: 30 },
    password: { type: 'string', required: true, min: 8 },
    inviteCode: { type: 'string', required: true },
  }),
  async (req, res, next) => {
    try {
      const { username, password, inviteCode } = req.body;

      // Validate username
      const usernameCheck = validateUsername(username);
      if (!usernameCheck.valid) {
        return res.status(400).json({ error: usernameCheck.error });
      }

      // Validate password strength
      const passwordCheck = validatePassword(password);
      if (!passwordCheck.valid) {
        return res.status(400).json({ error: 'Weak password', details: passwordCheck.errors });
      }

      // Validate and consume invite code
      if (!isValidInviteCode(inviteCode)) {
        return res.status(400).json({ error: 'Invalid invite code format' });
      }

      const invite = await query(
        'SELECT id FROM invite_codes WHERE code = $1 AND is_used = FALSE AND (expires_at IS NULL OR expires_at > NOW())',
        [inviteCode.trim()]
      );
      if (invite.rows.length === 0) {
        return res.status(400).json({ error: 'Invalid or expired invite code' });
      }

      // Check registration is enabled
      const regSetting = await query("SELECT value FROM settings WHERE key = 'registration_enabled'");
      if (regSetting.rows.length > 0 && regSetting.rows[0].value === 'false') {
        return res.status(403).json({ error: 'Registration is currently disabled' });
      }

      // Check username uniqueness
      const existing = await query('SELECT id FROM users WHERE username = $1', [username.toLowerCase()]);
      if (existing.rows.length > 0) {
        return res.status(409).json({ error: 'Username already taken' });
      }

      const email = `${username.toLowerCase()}@${process.env.DOMAIN_PERMANENT || 'wox.world'}`;

      // Check email uniqueness
      const emailExists = await query('SELECT id FROM users WHERE email = $1', [email]);
      if (emailExists.rows.length > 0) {
        return res.status(409).json({ error: 'This email address is already registered' });
      }

      // Create mailbox in Purelymail
      try {
        await createUser(email, password);
      } catch (pmErr) {
        console.warn(`[Register] Purelymail user creation notice for ${email}: ${pmErr.message}`);
      }

      // Hash password and create user
      const passwordHash = await hashPassword(password);
      const result = await query(
        `INSERT INTO users (email, username, password_hash, imap_password, invite_code_used)
         VALUES ($1, $2, $3, $4, $5)
         RETURNING id, email, username, display_name, is_admin, created_at`,
        [email, username.toLowerCase(), passwordHash, password, inviteCode.trim()]
      );

      // Mark invite as used
      await query(
        'UPDATE invite_codes SET is_used = TRUE, used_by = $1, used_at = NOW() WHERE code = $2',
        [result.rows[0].id, inviteCode.trim()]
      );

      // Audit log
      await query(
        `INSERT INTO audit_log (actor_type, actor_id, action, target_type, target_id, ip_address, user_agent)
         VALUES ('user', $1, 'register', 'user', $1, $2, $3)`,
        [String(result.rows[0].id), req.ip, req.headers['user-agent']?.slice(0, 256)]
      );

      // Issue token
      const token = await issueToken(res, result.rows[0], req);

      // Dispatch WoxMail branded welcome email in background
      sendWoxWelcomeEmail(email, { isTemp: false }).catch((err) => {
        console.warn(`[Register] Background welcome email notice for ${email}: ${err.message}`);
      });

      res.status(201).json({
        user: result.rows[0],
        token,
        message: 'Account created successfully',
      });
    } catch (err) {
      next(err);
    }
  }
);

// ─── POST /api/auth/login ────────────────────────────────

function detectEmailProvider(email) {
  const domain = (email.toLowerCase().split('@')[1] || '').trim();
  if (['gmail.com', 'googlemail.com'].includes(domain)) return 'gmail';
  if (['outlook.com', 'hotmail.com', 'live.com', 'msn.com', 'office365.com', 'passport.com'].includes(domain)) return 'outlook';
  if (['yahoo.com', 'yahoo.co.uk', 'yahoo.fr', 'yahoo.de', 'yahoo.es', 'yahoo.it', 'yahoo.com.au', 'yahoo.com.br', 'ymail.com', 'rocketmail.com', 'myyahoo.com'].includes(domain)) return 'yahoo';
  if (['icloud.com', 'me.com', 'mac.com'].includes(domain)) return 'icloud';
  if (['zoho.com', 'zohomail.com'].includes(domain)) return 'zoho';
  if (['aol.com', 'aim.com', 'verizon.net'].includes(domain)) return 'aol';
  if (['fastmail.com', 'fastmail.fm', 'messagingengine.com', 'fmail.co'].includes(domain)) return 'fastmail';
  if (['proton.me', 'protonmail.com', 'pm.me', 'protonmail.ch'].includes(domain)) return 'proton';
  if (['yandex.com', 'yandex.ru', 'ya.ru'].includes(domain)) return 'yandex';
  if (['gmx.com', 'gmx.net', 'gmx.de', 'mail.com'].includes(domain)) return 'gmx';
  return null;
}

router.post('/login',
  loginLimiter,
  validate({
    email: { type: 'string', required: true },
    password: { type: 'string', required: true },
  }),
  async (req, res, next) => {
    try {
      let { email, password } = req.body;

      // Allow login with just username (auto-append domain)
      if (!email.includes('@')) {
        email = `${email}@${process.env.DOMAIN_PERMANENT || 'wox.world'}`;
      }

      const normalizedEmail = email.toLowerCase().trim();

      const result = await query(
        'SELECT id, email, username, password_hash, otp_enabled, otp_secret, is_suspended, deletion_scheduled_at FROM users WHERE email = $1 OR username = $2',
        [normalizedEmail, normalizedEmail]
      );

      if (result.rows.length === 0) {
        // Direct Login with External Email (Gmail, Outlook, Yahoo, Fastmail)
        const provider = detectEmailProvider(normalizedEmail);
        if (provider) {
          const preset = PROVIDER_PRESETS[provider];
          const testRes = await testConnection({
            provider,
            imap_host: preset.imap_host,
            imap_port: preset.imap_port,
            imap_secure: preset.imap_secure,
            smtp_host: preset.smtp_host,
            smtp_port: preset.smtp_port,
            smtp_secure: preset.smtp_secure,
            email: normalizedEmail,
            password,
          });

          if (testRes.imap.success) {
            // Auto-provision user account
            const basePrefix = normalizedEmail.split('@')[0].replace(/[^a-zA-Z0-9_]/g, '_').slice(0, 20);
            let username = `${basePrefix}_${provider}`.toLowerCase();
            const uCheck = await query('SELECT id FROM users WHERE username = $1', [username]);
            if (uCheck.rows.length > 0) {
              username = `${basePrefix}_${uuidv4().slice(0, 6)}`.toLowerCase();
            }

            const passwordHash = await hashPassword(password);
            const newUserRes = await query(
              `INSERT INTO users (email, username, display_name, password_hash, is_admin)
               VALUES ($1, $2, $3, $4, FALSE)
               RETURNING id, email, username, display_name, is_admin, created_at`,
              [normalizedEmail, username, normalizedEmail.split('@')[0], passwordHash]
            );
            const newUser = newUserRes.rows[0];

            // Connect external mailbox in vault
            await connectAccount(newUser.id, {
              provider,
              email: normalizedEmail,
              password,
              display_name: preset.name,
              is_default: true,
            });

            await logAuthEvent(newUser.id, true, req);
            const token = await issueToken(res, newUser, req);

            return res.json({
              user: { id: newUser.id, email: newUser.email, username: newUser.username },
              token,
              message: `Connected and logged in with ${preset.name}!`,
            });
          } else {
            await logAuthEvent(null, false, req, `${provider} direct login failed`);
            const helpMsg = provider === 'gmail'
              ? 'Gmail login failed: Ensure you use a 16-character Google App Password (generate at myaccount.google.com/apppasswords).'
              : provider === 'proton'
              ? 'Proton Mail uses zero-knowledge encryption and requires the official Proton Mail Bridge app running locally. Use the Bridge IMAP/SMTP ports and generated password from your Proton Bridge app.'
              : provider === 'icloud'
              ? 'iCloud login failed: Generate an App-Specific Password at appleid.apple.com under Sign-In and Security.'
              : provider === 'yahoo'
              ? 'Yahoo login failed: Generate an App Password in your Yahoo Account Security page.'
              : `${preset.name} login failed: Invalid email or password.`;
            return res.status(401).json({ error: helpMsg });
          }
        }

        await logAuthEvent(null, false, req, 'User not found');
        return res.status(401).json({ error: 'Invalid email or password' });
      }

      const user = result.rows[0];

      if (user.is_suspended) {
        await logAuthEvent(user.id, false, req, 'Account suspended');
        return res.status(403).json({ error: 'Account suspended. Contact admin.' });
      }

      let passwordValid = await verifyPassword(user.password_hash, password);
      if (!passwordValid) {
        // Check if external provider login with updated App Password
        const provider = detectEmailProvider(user.email);
        if (provider) {
          const preset = PROVIDER_PRESETS[provider];
          const testRes = await testConnection({
            imap_host: preset.imap_host,
            imap_port: preset.imap_port,
            imap_secure: preset.imap_secure,
            smtp_host: preset.smtp_host,
            smtp_port: preset.smtp_port,
            smtp_secure: preset.smtp_secure,
            email: user.email,
            password,
          });

          if (testRes.imap.success) {
            passwordValid = true;
            const newHash = await hashPassword(password);
            await query('UPDATE users SET password_hash = $1 WHERE id = $2', [newHash, user.id]);
            await connectAccount(user.id, {
              provider,
              email: user.email,
              password,
              display_name: preset.name,
              is_default: true,
            });
          }
        }
      }

      if (!passwordValid) {
        await logAuthEvent(user.id, false, req, 'Wrong password');
        return res.status(401).json({ error: 'Invalid email or password' });
      }

      // If 2FA is enabled, return a ticket instead of a token
      if (user.otp_enabled) {
        const ticket = generateToken(16);
        await redisSetex(`otp_ticket:${ticket}`, 300, JSON.stringify({ userId: user.id }));

        return res.json({
          requires_otp: true,
          ticket,
          message: 'Enter your 2FA code',
        });
      }

      // No 2FA — issue token directly
      await logAuthEvent(user.id, true, req);
      const token = await issueToken(res, user, req);

      res.json({
        user: { id: user.id, email: user.email, username: user.username },
        token,
      });
    } catch (err) {
      next(err);
    }
  }
);

// ─── POST /api/auth/verify-otp ──────────────────────────

router.post('/verify-otp',
  validate({
    ticket: { type: 'string', required: true },
    code: { type: 'string', required: true, min: 6, max: 6 },
  }),
  async (req, res, next) => {
    try {
      const { ticket, code } = req.body;

      // Retrieve ticket from Redis
      const ticketData = await redisGet(`otp_ticket:${ticket}`);
      if (!ticketData) {
        return res.status(401).json({ error: 'OTP ticket expired or invalid' });
      }

      const { userId } = JSON.parse(ticketData);
      const user = await query(
        'SELECT id, email, username, otp_secret, recovery_codes FROM users WHERE id = $1',
        [userId]
      );

      if (user.rows.length === 0) {
        return res.status(401).json({ error: 'User not found' });
      }

      const { otp_secret, recovery_codes } = user.rows[0];

      // Try TOTP code first
      const isValidOTP = authenticator.verify({ token: code, secret: otp_secret });

      if (!isValidOTP) {
        // Try recovery code
        if (recovery_codes) {
          const codes = JSON.parse(recovery_codes);
          const codeIndex = codes.indexOf(code.toUpperCase());
          if (codeIndex !== -1) {
            // Consume recovery code (one-time use)
            codes.splice(codeIndex, 1);
            await query('UPDATE users SET recovery_codes = $1 WHERE id = $2', [
              JSON.stringify(codes),
              userId,
            ]);
          } else {
            await logAuthEvent(userId, false, req, 'Invalid OTP');
            return res.status(401).json({ error: 'Invalid 2FA code' });
          }
        } else {
          await logAuthEvent(userId, false, req, 'Invalid OTP');
          return res.status(401).json({ error: 'Invalid 2FA code' });
        }
      }

      // Delete ticket (one-time use)
      await redisDel(`otp_ticket:${ticket}`);

      // Issue token
      await logAuthEvent(userId, true, req);
      const token = await issueToken(res, user.rows[0], req);

      res.json({
        user: { id: user.rows[0].id, email: user.rows[0].email, username: user.rows[0].username },
        token,
      });
    } catch (err) {
      next(err);
    }
  }
);

// ─── POST /api/auth/logout ──────────────────────────────

router.post('/logout', authenticate, async (req, res, next) => {
  try {
    // Revoke the current session
    if (req.tokenType === 'access') {
      const decoded = jwt.decode(req.cookies?.[JWT_COOKIE_NAME] || '');
      if (decoded?.jti) {
        await query('UPDATE user_sessions SET is_revoked = TRUE WHERE id = $1', [decoded.jti]);
      }
    }

    // Clear cookie
    res.clearCookie(JWT_COOKIE_NAME, { path: '/' });
    res.json({ message: 'Logged out' });
  } catch (err) {
    next(err);
  }
});

// ─── POST /api/auth/refresh ─────────────────────────────

router.post('/refresh', authenticate, async (req, res, next) => {
  try {
    const user = await query('SELECT id, email, username, is_suspended FROM users WHERE id = $1', [req.userId]);
    if (user.rows.length === 0 || user.rows[0].is_suspended) {
      return res.status(401).json({ error: 'Cannot refresh token' });
    }

    const token = await issueToken(res, user.rows[0], req);
    res.json({ token });
  } catch (err) {
    next(err);
  }
});

// ─── GET /api/auth/me ───────────────────────────────────

router.get('/me', requireAuth, (req, res) => {
  res.json({ user: req.user });
});

// ─── GET /api/auth/current-session ──────────────────────

router.get('/current-session', requireAuth, (req, res) => {
  const token = req.cookies?.[JWT_COOKIE_NAME] || req.headers.authorization?.replace('Bearer ', '');
  res.json({
    user: {
      id: req.user.id,
      email: req.user.email,
      username: req.user.username,
      displayName: req.user.display_name || req.user.username,
      is_admin: !!req.user.is_admin,
    },
    token: token || null,
  });
});

// ─── POST /api/auth/switch-account ───────────────────────

router.post('/switch-account', async (req, res, next) => {
  try {
    const { token, email } = req.body;

    if (!token && !email) {
      return res.status(400).json({ error: 'Token or email is required' });
    }

    let targetUser = null;

    if (token) {
      try {
        const decoded = jwt.verify(token, process.env.JWT_SECRET);
        if (decoded && decoded.userId) {
          const userRes = await query(
            'SELECT id, email, username, display_name, is_admin, is_suspended FROM users WHERE id = $1',
            [decoded.userId]
          );
          if (userRes.rows.length > 0 && !userRes.rows[0].is_suspended) {
            targetUser = userRes.rows[0];
          }
        }
      } catch (jwtErr) {
        // Token expired or invalid
      }
    }

    if (!targetUser) {
      return res.status(401).json({
        success: false,
        requireLogin: true,
        email: email || null,
        error: 'Session expired or invalid. Please sign in with password.',
      });
    }

    // Issue fresh token and update HTTP-only cookie for target user
    const freshToken = await issueToken(res, targetUser, req);
    await logAuthEvent(targetUser.id, true, req, 'account_switch');

    return res.json({
      success: true,
      user: {
        id: targetUser.id,
        email: targetUser.email,
        username: targetUser.username,
        displayName: targetUser.display_name || targetUser.username,
        is_admin: !!targetUser.is_admin,
      },
      token: freshToken,
    });
  } catch (err) {
    next(err);
  }
});

// ─── POST /api/auth/setup-otp ───────────────────────────

router.post('/setup-otp', requireAuth, async (req, res, next) => {
  try {
    if (req.user.otp_enabled) {
      return res.status(400).json({ error: '2FA is already enabled' });
    }

    const secret = authenticator.generateSecret();
    const otpauth = authenticator.keyuri(
      req.user.email,
      'WoxMail',
      secret
    );

    // Generate QR code as data URL
    const qrDataUrl = await QRCode.toDataURL(otpauth);

    // Store secret temporarily in Redis (not DB yet — confirm first)
    await redisSetex(`otp_setup:${req.user.id}`, 600, secret);

    res.json({
      secret,
      qrCode: qrDataUrl,
      message: 'Scan the QR code with your authenticator app, then confirm with a code',
    });
  } catch (err) {
    next(err);
  }
});

// ─── POST /api/auth/confirm-otp ─────────────────────────

router.post('/confirm-otp',
  requireAuth,
  validate({ code: { type: 'string', required: true, min: 6, max: 6 } }),
  async (req, res, next) => {
    try {
      const { code } = req.body;

      // Get pending secret from Redis
      const secret = await redisGet(`otp_setup:${req.user.id}`);
      if (!secret) {
        return res.status(400).json({ error: 'OTP setup expired. Start again.' });
      }

      // Verify the code against the pending secret
      const isValid = authenticator.verify({ token: code, secret });
      if (!isValid) {
        return res.status(400).json({ error: 'Invalid code. Try again.' });
      }

      // Generate recovery codes
      const recoveryCodes = generateRecoveryCodes();

      // Save to database — 2FA is now active
      await query(
        'UPDATE users SET otp_secret = $1, otp_enabled = TRUE, recovery_codes = $2 WHERE id = $3',
        [secret, JSON.stringify(recoveryCodes), req.user.id]
      );

      // Clean up Redis
      await redisDel(`otp_setup:${req.user.id}`);

      // Audit log
      await query(
        `INSERT INTO audit_log (actor_type, actor_id, action, target_type, target_id, ip_address)
         VALUES ('user', $1, 'enable_2fa', 'user', $1, $2)`,
        [String(req.user.id), req.ip]
      );

      res.json({
        message: '2FA enabled successfully',
        recoveryCodes,
        warning: 'Save these recovery codes — they cannot be shown again',
      });
    } catch (err) {
      next(err);
    }
  }
);

// ─── POST /api/auth/regenerate-recovery ─────────────────

router.post('/regenerate-recovery', requireAuth, async (req, res, next) => {
  try {
    if (!req.user.otp_enabled) {
      return res.status(400).json({ error: '2FA is not enabled' });
    }

    const recoveryCodes = generateRecoveryCodes();
    await query('UPDATE users SET recovery_codes = $1 WHERE id = $2', [
      JSON.stringify(recoveryCodes),
      req.user.id,
    ]);

    res.json({
      recoveryCodes,
      warning: 'Previous recovery codes are now invalid',
    });
  } catch (err) {
    next(err);
  }
});

// ─── POST /api/auth/forgot-password ─────────────────────

router.post('/forgot-password',
  validate({ email: { type: 'email', required: true } }),
  async (req, res, next) => {
    try {
      const { email } = req.body;

      // Always return success to prevent email enumeration
      const result = await query(
        'SELECT id, recovery_email FROM users WHERE email = $1',
        [email]
      );

      if (result.rows.length > 0 && result.rows[0].recovery_email) {
        const resetToken = generateToken(32);
        await redis.setex(`reset:${resetToken}`, 3600, String(result.rows[0].id));

        // TODO: Send reset email to recovery_email via SMTP
        // For now, log the token (dev only)
        if (process.env.NODE_ENV === 'development') {
          console.log(`[DEV] Password reset token for ${email}: ${resetToken}`);
        }
      }

      res.json({ message: 'If an account exists with a recovery email, a reset link has been sent.' });
    } catch (err) {
      next(err);
    }
  }
);

// ─── POST /api/auth/reset-password ──────────────────────

router.post('/reset-password',
  validate({
    token: { type: 'string', required: true },
    password: { type: 'string', required: true, min: 8 },
  }),
  async (req, res, next) => {
    try {
      const { token, password } = req.body;

      const userId = await redis.get(`reset:${token}`);
      if (!userId) {
        return res.status(400).json({ error: 'Reset token expired or invalid' });
      }

      const passwordCheck = validatePassword(password);
      if (!passwordCheck.valid) {
        return res.status(400).json({ error: 'Weak password', details: passwordCheck.errors });
      }

      const passwordHash = await hashPassword(password);
      await query('UPDATE users SET password_hash = $1 WHERE id = $2', [passwordHash, parseInt(userId)]);

      // Revoke all existing sessions
      await query('UPDATE user_sessions SET is_revoked = TRUE WHERE user_id = $1', [parseInt(userId)]);

      // Delete reset token
      await redis.del(`reset:${token}`);

      res.json({ message: 'Password reset successfully. Please log in.' });
    } catch (err) {
      next(err);
    }
  }
);

// ─── POST /api/auth/recover-with-code ───────────────────

router.post('/recover-with-code',
  validate({
    email: { type: 'email', required: true },
    recoveryCode: { type: 'string', required: true },
    newPassword: { type: 'string', required: true, min: 8 },
  }),
  async (req, res, next) => {
    try {
      const { email, recoveryCode, newPassword } = req.body;

      const result = await query(
        'SELECT id, recovery_codes FROM users WHERE email = $1',
        [email]
      );

      if (result.rows.length === 0) {
        return res.status(401).json({ error: 'Invalid email or recovery code' });
      }

      const user = result.rows[0];
      if (!user.recovery_codes) {
        return res.status(401).json({ error: 'No recovery codes set' });
      }

      const codes = JSON.parse(user.recovery_codes);
      const codeIndex = codes.indexOf(recoveryCode.toUpperCase());

      if (codeIndex === -1) {
        return res.status(401).json({ error: 'Invalid email or recovery code' });
      }

      // Consume recovery code
      codes.splice(codeIndex, 1);

      const passwordHash = await hashPassword(newPassword);
      await query(
        'UPDATE users SET password_hash = $1, recovery_codes = $2 WHERE id = $3',
        [passwordHash, JSON.stringify(codes), user.id]
      );

      // Revoke all sessions
      await query('UPDATE user_sessions SET is_revoked = TRUE WHERE user_id = $1', [user.id]);

      res.json({ message: 'Password reset successfully. Please log in.' });
    } catch (err) {
      next(err);
    }
  }
);

// ─── POST /api/auth/switch-session & /api/auth/switch-account ─────────────────────

const handleSwitchSession = async (req, res, next) => {
  try {
    const { token } = req.body;
    if (!token) {
      return res.status(400).json({ error: 'Token is required to switch session' });
    }

    const decoded = jwt.verify(token, process.env.JWT_SECRET || 'dev-secret-key-change-in-production-12345');
    const userRes = await query('SELECT * FROM users WHERE id = $1 AND is_active = TRUE', [decoded.userId]);
    if (userRes.rows.length === 0) {
      return res.status(401).json({ error: 'User account not found or inactive' });
    }

    const user = userRes.rows[0];

    // Set cookie
    res.cookie(JWT_COOKIE_NAME, token, {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'strict',
      maxAge: 7 * 24 * 60 * 60 * 1000,
      path: '/',
    });

    res.json({
      success: true,
      token,
      user: {
        id: user.id,
        username: user.username,
        email: user.email,
        display_name: user.display_name,
        role: user.role,
        tier: user.tier,
      }
    });
  } catch (err) {
    return res.status(401).json({ error: 'Invalid or expired session token. Please log in again.' });
  }
};

router.post('/switch-session', handleSwitchSession);
router.post('/switch-account', handleSwitchSession);

export default router;

