/**
 * @fileoverview Verification API endpoints for Dual-Mode Email Verification.
 */

import { Router } from 'express';
import { validate } from '../middleware/validate.js';
import {
  createVerificationSession,
  verifyCode,
  getVerificationStatus,
} from '../services/verificationService.js';
import { isValidEmail } from '../utils/validators.js';

const router = Router();

/**
 * POST /api/verify/start
 * Initiate a verification challenge.
 */
router.post('/start',
  validate({
    type: { type: 'string', required: true },
    targetEmail: { type: 'string', required: true },
    meta: { type: 'object' },
  }),
  async (req, res, next) => {
    try {
      const { type, targetEmail, meta } = req.body;

      if (!isValidEmail(targetEmail)) {
        return res.status(400).json({ error: 'Invalid email address' });
      }

      if (!['recovery_email', 'newsletter_optin', 'step_up'].includes(type)) {
        return res.status(400).json({ error: 'Invalid verification type' });
      }

      const result = await createVerificationSession({
        type,
        targetEmail,
        userId: req.userId || null,
        meta: meta || {},
      });

      res.json({
        success: true,
        sessionToken: result.sessionToken,
        targetEmail: result.targetEmail,
        expiresAt: result.expiresAt,
        message: `Verification code sent to ${result.targetEmail}. You may enter the code on screen or simply reply to the email.`,
      });
    } catch (err) {
      next(err);
    }
  }
);

/**
 * POST /api/verify/confirm
 * Submit 6-digit verification code manually.
 */
router.post('/confirm',
  validate({
    sessionToken: { type: 'string', required: true },
    code: { type: 'string', required: true },
  }),
  async (req, res, next) => {
    try {
      const { sessionToken, code } = req.body;
      const result = await verifyCode(sessionToken, code);
      res.json(result);
    } catch (err) {
      res.status(400).json({ error: err.message });
    }
  }
);

/**
 * GET /api/verify/status/:token
 * Status polling fallback when WebSocket is unavailable.
 */
router.get('/status/:token', async (req, res, next) => {
  try {
    const status = await getVerificationStatus(req.params.token);
    res.json(status);
  } catch (err) {
    next(err);
  }
});

/**
 * POST /api/verify/simulate-inbound
 * Test helper for simulating an inbound verification email reply.
 */
router.post('/simulate-inbound', async (req, res, next) => {
  try {
    const { fromEmail, toEmail, subject, textBody } = req.body;
    const { processInboundReply } = await import('../services/verificationService.js');
    const result = await processInboundReply({ fromEmail, toEmail, subject, textBody });
    res.json(result);
  } catch (err) {
    next(err);
  }
});

export default router;
