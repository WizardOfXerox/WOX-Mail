import { Router } from 'express';
import { requireAuth } from '../middleware/auth.js';
import * as contactService from '../services/contactDossierService.js';

const router = Router();
router.use(requireAuth);

/**
 * GET /api/dossier/:email
 * Full contact dossier including interaction telemetry and CRM data.
 */
router.get('/:email', async (req, res, next) => {
  try {
    const dossier = await contactService.getContactDossier({
      userId: req.user.id,
      contactEmail: req.params.email,
    });

    if (!dossier) {
      return res.status(400).json({ error: 'Valid email address required' });
    }

    res.json({ dossier });
  } catch (err) {
    next(err);
  }
});

// ─── CRM Notes ──────────────────────────────────────────────

router.post('/:email/notes', async (req, res, next) => {
  try {
    const { note } = req.body;
    if (!note) return res.status(400).json({ error: 'Note content is required' });
    const created = await contactService.addContactNote(req.user.id, req.params.email, note);
    res.status(201).json({ success: true, note: created });
  } catch (err) {
    next(err);
  }
});

router.get('/:email/notes', async (req, res, next) => {
  try {
    const notes = await contactService.listContactNotes(req.user.id, req.params.email);
    res.json({ success: true, notes });
  } catch (err) {
    next(err);
  }
});

router.delete('/:email/notes/:noteId', async (req, res, next) => {
  try {
    const deleted = await contactService.deleteContactNote(req.user.id, req.params.noteId);
    res.json({ success: true, deleted });
  } catch (err) {
    next(err);
  }
});

// ─── CRM Tags ───────────────────────────────────────────────

router.post('/:email/tags', async (req, res, next) => {
  try {
    const { tag } = req.body;
    if (!tag) return res.status(400).json({ error: 'Tag is required' });
    const created = await contactService.addContactTag(req.user.id, req.params.email, tag);
    res.status(201).json({ success: true, tag: created });
  } catch (err) {
    next(err);
  }
});

router.delete('/:email/tags/:tag', async (req, res, next) => {
  try {
    const deleted = await contactService.removeContactTag(req.user.id, req.params.email, req.params.tag);
    res.json({ success: true, deleted });
  } catch (err) {
    next(err);
  }
});

// ─── CRM Deals Pipeline ─────────────────────────────────────

router.get('/deals/all', async (req, res, next) => {
  try {
    const deals = await contactService.listContactDeals(req.user.id);
    res.json({ success: true, deals });
  } catch (err) {
    next(err);
  }
});

router.post('/:email/deals', async (req, res, next) => {
  try {
    const { title, value, currency, stage } = req.body;
    if (!title) return res.status(400).json({ error: 'Deal title is required' });
    const deal = await contactService.createContactDeal(req.user.id, req.params.email, { title, value, currency, stage });
    res.status(201).json({ success: true, deal });
  } catch (err) {
    next(err);
  }
});

router.put('/deals/:dealId', async (req, res, next) => {
  try {
    const updated = await contactService.updateContactDeal(req.user.id, req.params.dealId, req.body);
    if (!updated) return res.status(404).json({ error: 'Deal not found' });
    res.json({ success: true, deal: updated });
  } catch (err) {
    next(err);
  }
});

router.delete('/deals/:dealId', async (req, res, next) => {
  try {
    const deleted = await contactService.deleteContactDeal(req.user.id, req.params.dealId);
    res.json({ success: true, deleted });
  } catch (err) {
    next(err);
  }
});

export default router;
