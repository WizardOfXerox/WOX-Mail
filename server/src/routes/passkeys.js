import { Router } from 'express';
import jwt from 'jsonwebtoken';
import { v4 as uuidv4 } from 'uuid';
import { requireAuth } from '../middleware/auth.js';
import { validate } from '../middleware/validate.js';
import * as passkeyService from '../services/passkeyService.js';
import { JWT_COOKIE_NAME } from '../config/constants.js';
import { query } from '../config/database.js';

const router = Router();

/**
 * Issue a JWT access token and set HTTP-only cookie.
 */
async function issueToken(res, user, req) {
  const jti = uuidv4();
  const expiresIn = process.env.JWT_EXPIRES_IN || '7d';

  const token = jwt.sign(
    { userId: user.id, type: 'access', jti },
    process.env.JWT_SECRET,
    { expiresIn }
  );

  // Store session in DB
  await query(
    `INSERT INTO user_sessions (id, user_id, ip_address, user_agent, expires_at)
     VALUES ($1, $2, $3, $4, NOW() + INTERVAL '7 days')`,
    [jti, user.id, req.ip, req.headers['user-agent']?.slice(0, 256)]
  );

  const isProduction = process.env.NODE_ENV === 'production';
  res.cookie(JWT_COOKIE_NAME, token, {
    httpOnly: true,
    secure: isProduction,
    sameSite: isProduction ? 'strict' : 'lax',
    maxAge: 7 * 24 * 60 * 60 * 1000,
    path: '/',
  });

  return token;
}

// ─── Registration Flow (Requires Authenticated User) ─────────

/**
 * POST /api/auth/passkeys/register-options
 * Generate registration challenge for current logged in user.
 */
router.post('/register-options', requireAuth, async (req, res, next) => {
  try {
    const options = await passkeyService.getRegistrationOptions(req.user);
    res.json(options);
  } catch (err) {
    next(err);
  }
});

/**
 * POST /api/auth/passkeys/register-verify
 * Complete registration of new hardware / biometric passkey.
 */
router.post('/register-verify',
  requireAuth,
  validate({
    response: { type: 'object', required: true },
    deviceName: { type: 'string', max: 128 },
  }),
  async (req, res, next) => {
    try {
      const { response, deviceName } = req.body;
      const result = await passkeyService.verifyRegistration(req.user, response, deviceName);
      res.status(201).json({
        message: 'Passkey registered successfully',
        passkey: result.passkey,
      });
    } catch (err) {
      res.status(400).json({ error: err.message });
    }
  }
);

// ─── Authentication / Login Flow (Public) ─────────────────────

/**
 * POST /api/auth/passkeys/login-options
 * Generate challenge for logging in with a registered passkey.
 */
router.post('/login-options', async (req, res, next) => {
  try {
    const { email } = req.body || {};
    const { options, challengeSessionId } = await passkeyService.getAuthenticationOptions(email);
    res.json({ options, challengeSessionId });
  } catch (err) {
    next(err);
  }
});

/**
 * POST /api/auth/passkeys/login-verify
 * Verify client assertion and log in user with session token.
 */
router.post('/login-verify',
  validate({
    challengeSessionId: { type: 'string', required: true },
    response: { type: 'object', required: true },
  }),
  async (req, res, next) => {
    try {
      const { challengeSessionId, response } = req.body;
      const result = await passkeyService.verifyAuthentication(challengeSessionId, response);

      const token = await issueToken(res, result.user, req);

      res.json({
        message: 'Logged in with Passkey successfully',
        user: result.user,
        token,
      });
    } catch (err) {
      res.status(401).json({ error: err.message });
    }
  }
);

// ─── Passkey Management Endpoints ────────────────────────────

/**
 * GET /api/settings/passkeys
 * List all registered passkeys for current user.
 */
router.get('/list', requireAuth, async (req, res, next) => {
  try {
    const passkeys = await passkeyService.listUserPasskeys(req.user.id);
    res.json({ passkeys });
  } catch (err) {
    next(err);
  }
});

/**
 * DELETE /api/settings/passkeys/:id
 * Delete/revoke a registered passkey.
 */
router.delete('/:id', requireAuth, async (req, res, next) => {
  try {
    const passkeyId = parseInt(req.params.id, 10);
    if (!passkeyId) return res.status(400).json({ error: 'Invalid passkey ID' });

    const deleted = await passkeyService.deletePasskey(req.user.id, passkeyId);
    if (!deleted) {
      return res.status(404).json({ error: 'Passkey not found or unauthorized' });
    }

    res.json({ message: 'Passkey removed successfully' });
  } catch (err) {
    next(err);
  }
});

export default router;
