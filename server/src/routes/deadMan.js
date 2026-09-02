import { Router } from 'express';
import { authenticate, loadUser } from '../middleware/auth.js';
import { validate } from '../middleware/validate.js';
import { getDeadManSwitch, updateDeadManSwitch, checkin } from '../services/deadManService.js';
import { query } from '../config/database.js';

const router = Router();

/**
 * GET /api/deadman/status
 * Get current Dead Man Switch configuration
 */
router.get('/status', authenticate, loadUser, async (req, res, next) => {
  try {
    const data = await getDeadManSwitch(req.user.id);
    res.json(data);
  } catch (err) {
    next(err);
  }
});

/**
 * POST /api/deadman/config
 * Update Dead Man Switch configuration
 */
router.post(
  '/config',
  authenticate,
  loadUser,
  validate({
    enabled: { type: 'boolean', required: true },
    intervalDays: { type: 'number' },
    finalSubject: { type: 'string' },
    finalInstructions: { type: 'string' },
    beneficiaryEmails: { type: 'array' },
  }),
  async (req, res, next) => {
    try {
      const updated = await updateDeadManSwitch(req.user.id, req.body);
      res.json({ message: 'Dead Man Switch updated successfully', switch: updated });
    } catch (err) {
      next(err);
    }
  }
);

/**
 * POST /api/deadman/checkin
 * Manual heartbeat checkin button
 */
router.post('/checkin', authenticate, loadUser, async (req, res, next) => {
  try {
    const result = await checkin(req.user.id);
    res.json(result);
  } catch (err) {
    next(err);
  }
});

/**
 * GET /api/deadman/ping/:token
 * 1-click email check-in ping link
 */
router.get('/ping/:token', async (req, res, next) => {
  try {
    const result = await query(
      `UPDATE dead_man_switches SET
         last_checkin = NOW(),
         status = 'active',
         warning_sent_at = NULL,
         updated_at = NOW()
       WHERE checkin_token = $1
       RETURNING user_id, interval_days`,
      [req.params.token]
    );

    if (result.rows.length === 0) {
      return res.status(400).send('Invalid or expired check-in token.');
    }

    res.send(`
      <!DOCTYPE html>
      <html>
      <body style="font-family: sans-serif; background: #0f0f1a; color: #22c55e; text-align: center; padding: 50px;">
        <div style="max-width: 480px; margin: 0 auto; background: #1a1a2e; border: 1px solid #2a2a4a; padding: 40px; border-radius: 16px;">
          <h1 style="color: #ffffff;">💚 Heartbeat Confirmed</h1>
          <p style="color: #9898b0;">Your Dead Man's Switch timer has been successfully reset for another ${result.rows[0].interval_days} days.</p>
          <a href="/dashboard" style="display: inline-block; margin-top: 20px; background: #7c3aed; color: #ffffff; text-decoration: none; padding: 10px 20px; border-radius: 9999px;">Return to Webmail</a>
        </div>
      </body>
      </html>
    `);
  } catch (err) {
    next(err);
  }
});

export default router;
