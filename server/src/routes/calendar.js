/**
 * @fileoverview WoxCalendar routes — 7 endpoints.
 * CRUD for calendar events + .ics import + upcoming sidebar widget.
 */

import { Router } from 'express';
import { requireAuth } from '../middleware/auth.js';
import { validate } from '../middleware/validate.js';
import * as calendarService from '../services/calendarService.js';
import { parseICS, toCalendarEvent } from '../services/calendarParser.js';

const router = Router();
router.use(requireAuth);

/**
 * GET /api/calendar/events
 * List events in a date range.
 * Query params: start, end (ISO dates)
 */
router.get('/events', async (req, res, next) => {
  try {
    const start = req.query.start || new Date().toISOString();
    const end = req.query.end || new Date(Date.now() + 30 * 86400000).toISOString();

    const events = await calendarService.listEvents(req.user.id, start, end);
    res.json({ events });
  } catch (err) {
    next(err);
  }
});

/**
 * POST /api/calendar/events
 * Create a new event.
 */
router.post('/events',
  validate({
    title: { type: 'string', required: true, max: 200 },
    description: { type: 'string', max: 5000 },
    location: { type: 'string', max: 500 },
    startTime: { type: 'string', required: true },
    endTime: { type: 'string', required: true },
    allDay: { type: 'boolean' },
    color: { type: 'string', max: 7 },
    recurrenceRule: { type: 'string', max: 500 },
    reminderMinutes: { type: 'number' },
  }),
  async (req, res, next) => {
    try {
      const event = await calendarService.createEvent({
        user_id: req.user.id,
        title: req.body.title,
        description: req.body.description,
        location: req.body.location,
        start_time: req.body.startTime,
        end_time: req.body.endTime,
        all_day: req.body.allDay || false,
        color: req.body.color || '#7c3aed',
        recurrence_rule: req.body.recurrenceRule,
        reminder_minutes: req.body.reminderMinutes ?? 15,
      });

      res.status(201).json({ event });
    } catch (err) {
      next(err);
    }
  }
);

/**
 * GET /api/calendar/events/:id
 * Get a single event.
 */
router.get('/events/:id', async (req, res, next) => {
  try {
    const event = await calendarService.getEvent(req.user.id, parseInt(req.params.id, 10));
    if (!event) return res.status(404).json({ error: 'Event not found' });
    res.json({ event });
  } catch (err) {
    next(err);
  }
});

/**
 * PUT /api/calendar/events/:id
 * Update an event.
 */
router.put('/events/:id', async (req, res, next) => {
  try {
    const updates = {};
    const allowed = ['title', 'description', 'location', 'start_time', 'end_time', 'all_day', 'color', 'recurrence_rule', 'reminder_minutes'];

    // Accept camelCase from client
    const mapping = {
      startTime: 'start_time',
      endTime: 'end_time',
      allDay: 'all_day',
      recurrenceRule: 'recurrence_rule',
      reminderMinutes: 'reminder_minutes',
    };

    for (const [key, val] of Object.entries(req.body)) {
      const dbKey = mapping[key] || key;
      if (allowed.includes(dbKey)) {
        updates[dbKey] = val;
      }
    }

    const event = await calendarService.updateEvent(req.user.id, parseInt(req.params.id, 10), updates);
    if (!event) return res.status(404).json({ error: 'Event not found' });
    res.json({ event });
  } catch (err) {
    next(err);
  }
});

/**
 * DELETE /api/calendar/events/:id
 * Delete an event.
 */
router.delete('/events/:id', async (req, res, next) => {
  try {
    const deleted = await calendarService.deleteEvent(req.user.id, parseInt(req.params.id, 10));
    if (!deleted) return res.status(404).json({ error: 'Event not found' });
    res.json({ message: 'Event deleted' });
  } catch (err) {
    next(err);
  }
});

/**
 * POST /api/calendar/events/from-ics
 * Create event(s) from an .ics attachment.
 */
router.post('/events/from-ics',
  validate({
    icsContent: { type: 'string', required: true },
    emailUid: { type: 'number' },
  }),
  async (req, res, next) => {
    try {
      const parsed = parseICS(req.body.icsContent);
      const created = [];

      for (const evt of parsed) {
        const eventData = toCalendarEvent(evt, req.user.id, req.body.emailUid);
        const event = await calendarService.createEvent(eventData);
        created.push(event);
      }

      res.status(201).json({ events: created, count: created.length });
    } catch (err) {
      next(err);
    }
  }
);

/**
 * GET /api/calendar/upcoming
 * Next 7 days of events (sidebar widget).
 */
router.get('/upcoming', async (req, res, next) => {
  try {
    const events = await calendarService.getUpcoming(req.user.id);
    res.json({ events });
  } catch (err) {
    next(err);
  }
});

export default router;
