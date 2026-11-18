import { Router } from 'express';
import { requireAuth } from '../middleware/auth.js';
import {
  getUserSnippets,
  createSnippet,
  updateSnippet,
  deleteSnippet,
} from '../services/snippetService.js';

const router = Router();

router.use(requireAuth);

/**
 * GET /api/snippets
 */
router.get('/', async (req, res, next) => {
  try {
    const snippets = await getUserSnippets(req.user.id);
    res.json({ snippets });
  } catch (err) {
    next(err);
  }
});

/**
 * POST /api/snippets
 */
router.post('/', async (req, res, next) => {
  try {
    const { shortcut, title, contentHtml } = req.body;
    if (!shortcut || !title || !contentHtml) {
      return res.status(400).json({ error: 'shortcut, title, and contentHtml are required' });
    }

    const snippet = await createSnippet(req.user.id, { shortcut, title, contentHtml });
    res.status(201).json({ snippet });
  } catch (err) {
    next(err);
  }
});

/**
 * PUT /api/snippets/:id
 */
router.put('/:id', async (req, res, next) => {
  try {
    const snippetId = parseInt(req.params.id, 10);
    if (!Number.isInteger(snippetId) || snippetId <= 0) {
      return res.status(400).json({ error: 'Invalid snippet ID' });
    }
    const { shortcut, title, contentHtml } = req.body;
    if (!shortcut?.trim() || !title?.trim() || !contentHtml?.trim()) {
      return res.status(400).json({ error: 'shortcut, title, and contentHtml are required' });
    }
    const snippet = await updateSnippet(snippetId, req.user.id, { shortcut, title, contentHtml });
    if (!snippet) {
      return res.status(404).json({ error: 'Snippet not found' });
    }
    res.json({ snippet });
  } catch (err) {
    next(err);
  }
});

/**
 * DELETE /api/snippets/:id
 */
router.delete('/:id', async (req, res, next) => {
  try {
    const snippetId = parseInt(req.params.id, 10);
    if (!Number.isInteger(snippetId) || snippetId <= 0) {
      return res.status(400).json({ error: 'Invalid snippet ID' });
    }
    const deleted = await deleteSnippet(snippetId, req.user.id);
    if (!deleted) {
      return res.status(404).json({ error: 'Snippet not found' });
    }
    res.json({ message: 'Snippet deleted successfully' });
  } catch (err) {
    next(err);
  }
});

export default router;
