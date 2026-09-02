import { Router } from 'express';
import { requireAuth } from '../middleware/auth.js';
import { requireAdmin } from '../middleware/admin.js';
import {
  createTicket,
  addMessage,
  updateTicketStatus,
  listTickets,
  getTicketThread,
  getSupportStats
} from '../services/supportService.js';
import pino from 'pino';

const logger = pino({ name: 'woxmail:support-route' });
const router = Router();

router.use(requireAuth);

// ═════════════════════════════════════════════════════════
// 1. USER HELP DESK ENDPOINTS
// ═════════════════════════════════════════════════════════

/**
 * GET /api/support/tickets
 * List the current user's support tickets
 */
router.get('/tickets', async (req, res, next) => {
  try {
    const { status, category, priority, page = 1, limit = 25 } = req.query;
    const data = await listTickets({
      userId: req.userId,
      status,
      category,
      priority,
      page: parseInt(page, 10),
      limit: parseInt(limit, 10)
    });
    res.json(data);
  } catch (err) {
    next(err);
  }
});

/**
 * POST /api/support/tickets
 * Create a new support ticket
 */
router.post('/tickets', async (req, res, next) => {
  try {
    const { subject, category = 'general', priority = 'medium', messageText, attachments = [] } = req.body;

    if (!subject?.trim() || !messageText?.trim()) {
      return res.status(400).json({ error: 'Subject and message are required' });
    }

    const ticket = await createTicket(req.userId, {
      creatorEmail: req.user.email,
      creatorName: req.user.display_name || req.user.username,
      subject,
      category,
      priority,
      messageText,
      attachments
    });

    res.json({ success: true, ticket });
  } catch (err) {
    next(err);
  }
});

/**
 * GET /api/support/tickets/:id
 * Retrieve a ticket and its message thread
 */
router.get('/tickets/:id', async (req, res, next) => {
  try {
    const { id } = req.params;
    const thread = await getTicketThread(parseInt(id, 10), req.userId, req.user.is_admin);

    if (!thread) {
      return res.status(404).json({ error: 'Ticket not found' });
    }

    res.json(thread);
  } catch (err) {
    next(err);
  }
});

/**
 * POST /api/support/tickets/:id/messages
 * Add a reply to own ticket
 */
router.post('/tickets/:id/messages', async (req, res, next) => {
  try {
    const { id } = req.params;
    const { messageText, attachments = [] } = req.body;

    if (!messageText?.trim()) {
      return res.status(400).json({ error: 'Message text is required' });
    }

    // Verify ownership
    const thread = await getTicketThread(parseInt(id, 10), req.userId, req.user.is_admin);
    if (!thread) {
      return res.status(404).json({ error: 'Ticket not found' });
    }

    const message = await addMessage(parseInt(id, 10), {
      senderType: 'user',
      senderId: req.userId,
      senderEmail: req.user.email,
      messageText,
      attachments,
      isInternalNote: false
    });

    res.json({ success: true, message });
  } catch (err) {
    next(err);
  }
});

// ═════════════════════════════════════════════════════════
// 2. ADMIN HELPDESK MANAGEMENT ENDPOINTS
// ═════════════════════════════════════════════════════════

/**
 * GET /api/support/admin/tickets
 */
router.get('/admin/tickets', requireAdmin, async (req, res, next) => {
  try {
    const { status, category, priority, assignedTo, page = 1, limit = 25 } = req.query;
    const data = await listTickets({
      status,
      category,
      priority,
      assignedTo: assignedTo ? parseInt(assignedTo, 10) : undefined,
      page: parseInt(page, 10),
      limit: parseInt(limit, 10)
    });
    res.json(data);
  } catch (err) {
    next(err);
  }
});

/**
 * GET /api/support/admin/stats
 */
router.get('/admin/stats', requireAdmin, async (req, res, next) => {
  try {
    const stats = await getSupportStats();
    res.json({ stats });
  } catch (err) {
    next(err);
  }
});

/**
 * GET /api/support/admin/tickets/:id
 */
router.get('/admin/tickets/:id', requireAdmin, async (req, res, next) => {
  try {
    const { id } = req.params;
    const thread = await getTicketThread(parseInt(id, 10), req.userId, true);
    if (!thread) return res.status(404).json({ error: 'Ticket not found' });
    res.json(thread);
  } catch (err) {
    next(err);
  }
});

/**
 * POST /api/support/admin/tickets/:id/messages
 * Post staff reply or private internal note
 */
router.post('/admin/tickets/:id/messages', requireAdmin, async (req, res, next) => {
  try {
    const { id } = req.params;
    const { messageText, attachments = [], isInternalNote = false } = req.body;

    if (!messageText?.trim()) {
      return res.status(400).json({ error: 'Message text is required' });
    }

    const message = await addMessage(parseInt(id, 10), {
      senderType: 'staff',
      senderId: req.userId,
      senderEmail: req.user.email,
      messageText,
      attachments,
      isInternalNote: Boolean(isInternalNote)
    });

    res.json({ success: true, message });
  } catch (err) {
    next(err);
  }
});

/**
 * PATCH /api/support/admin/tickets/:id
 * Update status, priority, or assigned admin
 */
router.patch('/admin/tickets/:id', requireAdmin, async (req, res, next) => {
  try {
    const { id } = req.params;
    const { status, priority, category, assignedTo } = req.body;

    const updated = await updateTicketStatus(parseInt(id, 10), {
      status,
      priority,
      category,
      assignedTo: assignedTo !== undefined ? (assignedTo ? parseInt(assignedTo, 10) : null) : undefined
    });

    if (!updated) {
      return res.status(404).json({ error: 'Ticket not found' });
    }

    res.json({ success: true, ticket: updated });
  } catch (err) {
    next(err);
  }
});

export default router;
