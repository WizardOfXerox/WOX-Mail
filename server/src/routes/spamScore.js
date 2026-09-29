import { Router } from 'express';
import { requireAuth } from '../middleware/auth.js';
import { calculateSpamScore } from '../services/spamScoreService.js';

const router = Router();

/**
 * POST /api/campaigns/spam-check
 * Evaluate spam score of an email subject and body.
 */
router.post('/spam-check', requireAuth, (req, res) => {
  const { subject = '', htmlContent = '', plainContent = '' } = req.body;
  const analysis = calculateSpamScore({ subject, htmlContent, plainContent });
  res.json({
    success: true,
    ...analysis
  });
});

export default router;
