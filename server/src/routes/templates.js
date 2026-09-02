import { Router } from 'express';
import { requireAuth } from '../middleware/auth.js';
import {
  listTemplates,
  createTemplate,
  updateTemplate,
  deleteTemplate,
  interpolate,
  recordTemplateUsage
} from '../services/templateService.js';

const router = Router();
router.use(requireAuth);

/**
 * GET /api/templates
 * List templates for authenticated user
 */
router.get('/', async (req, res) => {
  try {
    const templates = await listTemplates(req.user.id, req.query.category || null);
    res.json({ templates });
  } catch (err) {
    res.status(500).json({ error: err.message || 'Failed to list templates.' });
  }
});

/**
 * POST /api/templates
 * Create a new template
 */
router.post('/', async (req, res) => {
  try {
    const { name, subject = '', body, body_html, body_text, category } = req.body;
    const finalHtml = body_html || (typeof body === 'string' && body.includes('<') ? body : (body || body_text || ''));
    const finalText = body_text || (typeof body === 'string' ? body : (finalHtml || ''));
    if (!name || (!finalHtml && !finalText)) {
      return res.status(400).json({ error: 'Template name and content are required.' });
    }
    const template = await createTemplate(req.user.id, {
      name,
      subject,
      body_html: finalHtml || '',
      body_text: finalText || '',
      category
    });
    res.status(201).json({ message: 'Template created.', template });
  } catch (err) {
    res.status(400).json({ error: err.message || 'Failed to create template.' });
  }
});

/**
 * PUT /api/templates/:id
 * Update template
 */
router.put('/:id', async (req, res) => {
  try {
    const template = await updateTemplate(req.user.id, parseInt(req.params.id, 10), req.body);
    if (!template) {
      return res.status(404).json({ error: 'Template not found.' });
    }
    res.json({ message: 'Template updated.', template });
  } catch (err) {
    res.status(400).json({ error: err.message || 'Failed to update template.' });
  }
});

/**
 * POST /api/templates/:id/render
 * Render template with injected variable values
 */
router.post('/:id/render', async (req, res) => {
  try {
    const { values = {} } = req.body;
    const templates = await listTemplates(req.user.id);
    const template = templates.find(t => t.id === parseInt(req.params.id, 10));
    if (!template) {
      return res.status(404).json({ error: 'Template not found.' });
    }

    const renderedSubject = interpolate(template.subject, values);
    const renderedHtml = interpolate(template.body_html, values);
    const renderedText = interpolate(template.body_text, values);

    await recordTemplateUsage(req.user.id, template.id);

    res.json({
      rendered: {
        subject: renderedSubject,
        body_html: renderedHtml,
        body_text: renderedText
      }
    });
  } catch (err) {
    res.status(400).json({ error: err.message || 'Failed to render template.' });
  }
});

/**
 * DELETE /api/templates/:id
 * Delete template
 */
router.delete('/:id', async (req, res) => {
  try {
    const deleted = await deleteTemplate(req.user.id, parseInt(req.params.id, 10));
    if (!deleted) {
      return res.status(404).json({ error: 'Template not found.' });
    }
    res.json({ message: 'Template deleted.' });
  } catch (err) {
    res.status(500).json({ error: err.message || 'Failed to delete template.' });
  }
});

export default router;
