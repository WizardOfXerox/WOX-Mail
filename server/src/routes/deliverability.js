import { Router } from 'express';
import { requireAuth } from '../middleware/auth.js';
import { analyzeDeliverability } from '../services/deliverabilityService.js';
import {
  parseDmarcAggregateReport,
  storeDmarcReport,
  getDmarcReportSummary,
} from '../services/dmarcReportService.js';

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

/**
 * POST /api/deliverability/dmarc/upload
 * Accepts raw DMARC XML (or JSON) string in body, parses it, stores it, and returns the parsed report.
 */
router.post('/dmarc/upload', async (req, res, next) => {
  try {
    const rawInput =
      typeof req.body === 'string'
        ? req.body
        : req.body?.xml ||
          req.body?.rawXml ||
          req.body?.content ||
          req.body?.report ||
          req.body?.data ||
          (req.body && Object.keys(req.body).length > 0 ? req.body : null);

    if (!rawInput) {
      return res.status(400).json({ error: 'Missing DMARC aggregate XML report content in request body' });
    }

    const parsedReport = parseDmarcAggregateReport(rawInput);
    await storeDmarcReport(parsedReport);

    res.json({
      success: true,
      report: parsedReport,
      ...parsedReport,
    });
  } catch (err) {
    next(err);
  }
});

/**
 * GET /api/deliverability/dmarc/reports
 * Returns aggregated DMARC statistics and recent reports.
 */
router.get('/dmarc/reports', async (req, res, next) => {
  try {
    const summary = await getDmarcReportSummary();
    res.json({
      success: true,
      ...summary,
    });
  } catch (err) {
    next(err);
  }
});

export default router;

