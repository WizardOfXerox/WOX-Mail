import { Router } from 'express';
import { requireAuth } from '../middleware/auth.js';
import * as dripService from '../services/dripService.js';
import * as segmentService from '../services/segmentService.js';
import pino from 'pino';

const logger = pino({ name: 'woxmail:drip-automations-route' });
const router = Router();

// ─── Drip Sequences & Steps ────────────────────────────────────────────────

// POST /api/campaigns/drip/sequences - Create sequence
router.post('/sequences', requireAuth, async (req, res) => {
  try {
    const { list_id, name, description } = req.body;
    if (!list_id || !name) {
      return res.status(400).json({ error: 'list_id and name are required' });
    }

    const sequence = await dripService.createSequence(req.userId, list_id, { name, description });
    res.status(201).json({ success: true, sequence });
  } catch (err) {
    logger.error({ err: err.message }, 'Failed to create drip sequence');
    res.status(500).json({ error: err.message });
  }
});

// GET /api/campaigns/drip/sequences - List sequences
router.get('/sequences', requireAuth, async (req, res) => {
  try {
    const listId = req.query.list_id ? parseInt(req.query.list_id, 10) : null;
    const sequences = await dripService.listSequences(req.userId, listId);
    res.json({ success: true, sequences });
  } catch (err) {
    logger.error({ err: err.message }, 'Failed to list drip sequences');
    res.status(500).json({ error: err.message });
  }
});

// GET /api/campaigns/drip/sequences/:id - Get sequence with steps
router.get('/sequences/:id', requireAuth, async (req, res) => {
  try {
    const sequence = await dripService.getSequence(req.userId, req.params.id);
    if (!sequence) {
      return res.status(404).json({ error: 'Sequence not found' });
    }
    res.json({ success: true, sequence });
  } catch (err) {
    logger.error({ err: err.message }, 'Failed to get drip sequence');
    res.status(500).json({ error: err.message });
  }
});

// PUT /api/campaigns/drip/sequences/:id - Update sequence
router.put('/sequences/:id', requireAuth, async (req, res) => {
  try {
    const { name, description, is_active } = req.body;
    const updated = await dripService.updateSequence(req.userId, req.params.id, { name, description, is_active });
    if (!updated) {
      return res.status(404).json({ error: 'Sequence not found' });
    }
    res.json({ success: true, sequence: updated });
  } catch (err) {
    logger.error({ err: err.message }, 'Failed to update drip sequence');
    res.status(500).json({ error: err.message });
  }
});

// DELETE /api/campaigns/drip/sequences/:id - Delete sequence
router.delete('/sequences/:id', requireAuth, async (req, res) => {
  try {
    const ok = await dripService.deleteSequence(req.userId, req.params.id);
    if (!ok) {
      return res.status(404).json({ error: 'Sequence not found' });
    }
    res.json({ success: true, message: 'Sequence deleted' });
  } catch (err) {
    logger.error({ err: err.message }, 'Failed to delete drip sequence');
    res.status(500).json({ error: err.message });
  }
});

// POST /api/campaigns/drip/sequences/:id/steps - Add step to sequence
router.post('/sequences/:id/steps', requireAuth, async (req, res) => {
  try {
    const { step_order, delay_days, delay_hours, subject, from_name, from_email, html_content, plain_content } = req.body;
    if (!subject || !html_content) {
      return res.status(400).json({ error: 'subject and html_content are required' });
    }

    const step = await dripService.addStep(req.userId, req.params.id, {
      step_order,
      delay_days,
      delay_hours,
      subject,
      from_name,
      from_email,
      html_content,
      plain_content
    });

    res.status(201).json({ success: true, step });
  } catch (err) {
    logger.error({ err: err.message }, 'Failed to add drip step');
    res.status(500).json({ error: err.message });
  }
});

// PUT /api/campaigns/drip/steps/:id - Update step
router.put('/steps/:id', requireAuth, async (req, res) => {
  try {
    const updated = await dripService.updateStep(req.userId, req.params.id, req.body);
    if (!updated) {
      return res.status(404).json({ error: 'Step not found' });
    }
    res.json({ success: true, step: updated });
  } catch (err) {
    logger.error({ err: err.message }, 'Failed to update drip step');
    res.status(500).json({ error: err.message });
  }
});

// DELETE /api/campaigns/drip/steps/:id - Delete step
router.delete('/steps/:id', requireAuth, async (req, res) => {
  try {
    const ok = await dripService.deleteStep(req.userId, req.params.id);
    if (!ok) {
      return res.status(404).json({ error: 'Step not found' });
    }
    res.json({ success: true, message: 'Step deleted' });
  } catch (err) {
    logger.error({ err: err.message }, 'Failed to delete drip step');
    res.status(500).json({ error: err.message });
  }
});

// ─── Audience Segments ─────────────────────────────────────────────────────

// POST /api/campaigns/segments - Create segment
router.post('/segments', requireAuth, async (req, res) => {
  try {
    const { list_id, name, description, rules } = req.body;
    if (!list_id || !name) {
      return res.status(400).json({ error: 'list_id and name are required' });
    }

    const segment = await segmentService.createSegment(req.userId, list_id, { name, description, rules });
    res.status(201).json({ success: true, segment });
  } catch (err) {
    logger.error({ err: err.message }, 'Failed to create segment');
    res.status(500).json({ error: err.message });
  }
});

// GET /api/campaigns/segments - List segments
router.get('/segments', requireAuth, async (req, res) => {
  try {
    const listId = req.query.list_id ? parseInt(req.query.list_id, 10) : null;
    const segments = await segmentService.listSegments(req.userId, listId);
    res.json({ success: true, segments });
  } catch (err) {
    logger.error({ err: err.message }, 'Failed to list segments');
    res.status(500).json({ error: err.message });
  }
});

// GET /api/campaigns/segments/:id - Get segment details
router.get('/segments/:id', requireAuth, async (req, res) => {
  try {
    const segment = await segmentService.getSegment(req.userId, req.params.id);
    if (!segment) {
      return res.status(404).json({ error: 'Segment not found' });
    }
    res.json({ success: true, segment });
  } catch (err) {
    logger.error({ err: err.message }, 'Failed to get segment');
    res.status(500).json({ error: err.message });
  }
});

// PUT /api/campaigns/segments/:id - Update segment
router.put('/segments/:id', requireAuth, async (req, res) => {
  try {
    const { name, description, rules } = req.body;
    const updated = await segmentService.updateSegment(req.userId, req.params.id, { name, description, rules });
    if (!updated) {
      return res.status(404).json({ error: 'Segment not found' });
    }
    res.json({ success: true, segment: updated });
  } catch (err) {
    logger.error({ err: err.message }, 'Failed to update segment');
    res.status(500).json({ error: err.message });
  }
});

// DELETE /api/campaigns/segments/:id - Delete segment
router.delete('/segments/:id', requireAuth, async (req, res) => {
  try {
    const ok = await segmentService.deleteSegment(req.userId, req.params.id);
    if (!ok) {
      return res.status(404).json({ error: 'Segment not found' });
    }
    res.json({ success: true, message: 'Segment deleted' });
  } catch (err) {
    logger.error({ err: err.message }, 'Failed to delete segment');
    res.status(500).json({ error: err.message });
  }
});

// POST /api/campaigns/segments/preview-count - Preview matching subscribers count
router.post('/segments/preview-count', requireAuth, async (req, res) => {
  try {
    const { list_id, rules } = req.body;
    if (!list_id || !rules) {
      return res.status(400).json({ error: 'list_id and rules are required' });
    }

    const count = await segmentService.getSegmentCountPreview(req.userId, list_id, rules);
    res.json({ success: true, count });
  } catch (err) {
    logger.error({ err: err.message }, 'Failed to preview segment count');
    res.status(500).json({ error: err.message });
  }
});

// GET /api/campaigns/segments/:id/subscribers - Evaluate segment
router.get('/segments/:id/subscribers', requireAuth, async (req, res) => {
  try {
    const subscribers = await segmentService.evaluateSegment(req.userId, req.params.id);
    res.json({ success: true, count: subscribers.length, subscribers });
  } catch (err) {
    logger.error({ err: err.message }, 'Failed to evaluate segment subscribers');
    res.status(500).json({ error: err.message });
  }
});

export default router;
