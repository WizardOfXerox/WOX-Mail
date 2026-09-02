import { Router } from 'express';
import jwt from 'jsonwebtoken';
import { JWT_COOKIE_NAME } from '../config/constants.js';
import { authenticate, loadUser } from '../middleware/auth.js';
import { validate } from '../middleware/validate.js';
import {
  createFutureLetter,
  verifyFutureLetter,
  listPublicLetters,
  getUserLetters,
  unlockUserLetter,
  cancelUserLetter,
  getFutureStats,
} from '../services/futureLetterService.js';

const router = Router();

/**
 * Optional authentication helper: Extracts user if JWT is present, but doesn't block guests.
 */
function optionalAuth(req, res, next) {
  const token = req.cookies?.[JWT_COOKIE_NAME] || req.headers.authorization?.replace('Bearer ', '');
  if (!token) return next();
  try {
    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    req.userId = decoded.userId;
  } catch {}
  next();
}

/**
 * POST /api/futureme/letters
 * Submit a new letter to the future (authenticated or guest)
 */
router.post(
  '/letters',
  optionalAuth,
  validate({
    senderEmail: { type: 'email', required: true },
    recipientEmail: { type: 'email' },
    subject: { type: 'string', required: true, max: 255 },
    body: { type: 'string', required: true, min: 5 },
    deliveryDate: { type: 'string', required: true },
    deliveryPreset: { type: 'string' },
    visibility: { type: 'string', enum: ['private', 'public_anonymous'] },
    category: { type: 'string' },
    sendToSelf: { type: 'boolean' },
    isLocked: { type: 'boolean' },
    passcode: { type: 'string' },
  }),
  async (req, res, next) => {
    try {
      const {
        senderEmail,
        recipientEmail,
        subject,
        body,
        deliveryDate,
        deliveryPreset = '1y',
        visibility = 'private',
        category = 'General',
        sendToSelf = true,
        isLocked = false,
        passcode = null,
      } = req.body;

      const letter = await createFutureLetter({
        userId: req.userId || null,
        senderEmail,
        recipientEmail,
        subject,
        body,
        deliveryDate,
        deliveryPreset,
        visibility,
        category,
        sendToSelf,
        isLocked,
        passcode,
      });

      res.status(201).json({
        message: letter.requiresVerification
          ? 'Letter submitted! Please check your email to verify and seal your letter.'
          : letter.is_locked
          ? 'Time Capsule sealed & passcode encrypted successfully!'
          : 'Letter sealed into the time capsule vault successfully!',
        letter,
      });
    } catch (err) {
      next(err);
    }
  }
);

/**
 * GET /api/futureme/verify/:token
 * Verify guest letter via email link
 */
router.get('/verify/:token', async (req, res, next) => {
  try {
    const result = await verifyFutureLetter(req.params.token);
    if (result.error) {
      return res.status(400).json(result);
    }
    res.json({ message: 'Letter successfully verified and scheduled!', letter: result });
  } catch (err) {
    next(err);
  }
});

/**
 * GET /api/futureme/public
 * Get public anonymous letters for community feed
 */
router.get('/public', async (req, res, next) => {
  try {
    const category = req.query.category || 'all';
    const page = parseInt(req.query.page, 10) || 1;
    const limit = Math.min(50, parseInt(req.query.limit, 10) || 12);

    const data = await listPublicLetters({ category, page, limit });
    res.json(data);
  } catch (err) {
    next(err);
  }
});

/**
 * GET /api/futureme/my-letters
 * List scheduled and delivered letters for authenticated user
 */
router.get('/my-letters', authenticate, loadUser, async (req, res, next) => {
  try {
    const letters = await getUserLetters(req.user.id);
    res.json({ letters });
  } catch (err) {
    next(err);
  }
});

/**
 * POST /api/futureme/my-letters/:id/unlock
 * Unlock and peek at a sealed time capsule letter with passcode
 */
router.post(
  '/my-letters/:id/unlock',
  authenticate,
  loadUser,
  validate({ passcode: { type: 'string', required: true } }),
  async (req, res, next) => {
    try {
      const result = await unlockUserLetter(req.params.id, req.user.id, req.body.passcode);
      if (result.error) return res.status(400).json(result);
      res.json(result);
    } catch (err) {
      next(err);
    }
  }
);

/**
 * DELETE /api/futureme/my-letters/:id
 * Cancel a scheduled future letter
 */
router.delete('/my-letters/:id', authenticate, loadUser, async (req, res, next) => {
  try {
    const result = await cancelUserLetter(req.params.id, req.user.id);
    if (result.error) return res.status(404).json(result);
    res.json(result);
  } catch (err) {
    next(err);
  }
});

/**
 * GET /api/futureme/stats
 * Global FutureMe metrics
 */
router.get('/stats', async (req, res, next) => {
  try {
    const stats = await getFutureStats();
    res.json(stats);
  } catch (err) {
    next(err);
  }
});

export default router;
