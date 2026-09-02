import { Router } from 'express';
import { authenticate, loadUser } from '../middleware/auth.js';
import { validate } from '../middleware/validate.js';
import {
  createSecureMessage,
  getSecureMessages,
  getSecureMessageEvents,
  revokeSecureMessage,
  unlockSecureMessage,
} from '../services/secureMessageService.js';

const router = Router();

// ─── Authenticated Sender Endpoints ─────────────────────────

/**
 * POST /api/mail/secure-send
 * Create and send a new password-protected confidential message.
 */
router.post(
  '/secure-send',
  authenticate,
  loadUser,
  validate({
    recipientEmail: { type: 'email', required: true },
    subject: { type: 'string', required: true, max: 255 },
    content: { type: 'string', required: true },
    passcode: { type: 'string', required: true, min: 4 },
    expirationHours: { type: 'number' },
    maxViews: { type: 'number' },
    destroyAfterRead: { type: 'boolean' },
    watermarkEnabled: { type: 'boolean' },
  }),
  async (req, res, next) => {
    try {
      const {
        recipientEmail,
        subject,
        content,
        passcode,
        expirationHours = 24,
        maxViews,
        destroyAfterRead = false,
        watermarkEnabled = true,
      } = req.body;

      const result = await createSecureMessage({
        senderId: req.user.id,
        senderEmail: req.user.email,
        recipientEmail,
        subject,
        content,
        passcode,
        expirationHours: Math.min(720, Math.max(1, parseInt(expirationHours, 10) || 24)),
        maxViews: maxViews ? Math.max(1, parseInt(maxViews, 10)) : undefined,
        destroyAfterRead: !!destroyAfterRead,
        watermarkEnabled: !!watermarkEnabled,
        reqIp: req.ip || req.connection?.remoteAddress,
        userAgent: req.headers['user-agent'] || 'Unknown',
      });

      res.status(201).json({
        message: 'Secure locked email sent successfully',
        ...result,
      });
    } catch (err) {
      next(err);
    }
  }
);

/**
 * GET /api/mail/secure-messages
 * List sent confidential messages for the current user.
 */
router.get('/secure-messages', authenticate, loadUser, async (req, res, next) => {
  try {
    const messages = await getSecureMessages(req.user.id);
    res.json({ messages });
  } catch (err) {
    next(err);
  }
});

/**
 * POST /api/mail/secure-messages/:id/revoke
 * Instantly revoke a confidential message.
 */
router.post('/secure-messages/:id/revoke', authenticate, loadUser, async (req, res, next) => {
  try {
    const result = await revokeSecureMessage(req.params.id, req.user.id);
    if (result.error) return res.status(404).json(result);
    res.json(result);
  } catch (err) {
    next(err);
  }
});

/**
 * GET /api/mail/secure-messages/:id/events
 * View audit events for a confidential message.
 */
router.get('/secure-messages/:id/events', authenticate, loadUser, async (req, res, next) => {
  try {
    const events = await getSecureMessageEvents(req.params.id, req.user.id);
    res.json({ events });
  } catch (err) {
    next(err);
  }
});

// ─── Public Recipient Unlock API ────────────────────────────

/**
 * POST /api/mail/secure/unlock & POST /api/secure/unlock
 * Public endpoint to unlock a secure message via token and passcode.
 */
const unlockHandler = async (req, res, next) => {
  try {
    const { token, passcode } = req.body;
    const result = await unlockSecureMessage(token, passcode, {
      reqIp: req.ip || req.connection?.remoteAddress,
      userAgent: req.headers['user-agent'] || 'Unknown',
    });

    if (result.error) {
      return res.status(result.error === 'not_found' ? 404 : 400).json(result);
    }

    res.json(result);
  } catch (err) {
    next(err);
  }
};

const unlockSchema = validate({
  token: { type: 'string', required: true },
  passcode: { type: 'string', required: true },
});

router.post('/secure/unlock', unlockSchema, unlockHandler);
router.post('/unlock', unlockSchema, unlockHandler);

export default router;
