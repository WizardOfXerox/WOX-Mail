import { Router } from 'express';
import { requireAuth } from '../middleware/auth.js';
import {
  scheduleFollowUp,
  getUserFollowUps,
  cancelFollowUp,
} from '../services/followUpService.js';

const router = Router();

router.use(requireAuth);

/**
 * POST /api/followup/schedule
 */
router.post('/schedule', async (req, res, next) => {
  try {
    const { threadId, messageId, recipientEmail, subject, remindAfterDays, customDate } = req.body;
    if (!recipientEmail) {
      return res.status(400).json({ error: 'recipientEmail is required' });
    }

    const reminder = await scheduleFollowUp({
      userId: req.user.id,
      threadId,
      messageId,
      recipientEmail,
      subject,
      remindAfterDays: remindAfterDays ? parseInt(remindAfterDays, 10) : 3,
      customDate,
    });

    res.status(201).json({ reminder });
  } catch (err) {
    next(err);
  }
});

/**
 * GET /api/followup/pending
 */
router.get('/pending', async (req, res, next) => {
  try {
    const reminders = await getUserFollowUps(req.user.id);
    res.json({ reminders });
  } catch (err) {
    next(err);
  }
});

/**
 * DELETE /api/followup/:id
 */
router.delete('/:id', async (req, res, next) => {
  try {
    const cancelled = await cancelFollowUp(req.params.id, req.user.id);
    if (!cancelled) {
      return res.status(404).json({ error: 'Reminder not found or already resolved' });
    }
    res.json({ message: 'Reminder cancelled successfully', reminder: cancelled });
  } catch (err) {
    next(err);
  }
});

export default router;
