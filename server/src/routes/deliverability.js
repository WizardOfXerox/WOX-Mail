import { Router } from 'express';
import { requireAuth } from '../middleware/auth.js';
import { analyzeDeliverability } from '../services/deliverabilityService.js';

const router = Router();

router.use(requireAuth);

/**
 * POST /api/deliverability/check
 */
router.post('/check', async (req, res, next) => {
  try {
    const { subject, bodyHtml, bodyText, toEmail } = req.body;
    const result = analyzeDeliverability({
      subject: subject || '',
      bodyHtml: bodyHtml || '',
      bodyText: bodyText || '',
      fromEmail: req.user.email,
      toEmail: toEmail || '',
    });

    res.json(result);
  } catch (err) {
    next(err);
  }
});

export default router;
