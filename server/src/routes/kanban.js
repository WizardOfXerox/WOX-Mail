import { Router } from 'express';
import { requireAuth } from '../middleware/auth.js';
import {
  getOrCreateBoard,
  createCard,
  updateCard,
  deleteCard
} from '../services/kanbanService.js';

const router = Router();
router.use(requireAuth);

/**
 * GET /api/kanban
 * Get user board with columns and cards
 */
router.get('/', async (req, res) => {
  try {
    const data = await getOrCreateBoard(req.user.id);
    res.json(data);
  } catch (err) {
    res.status(500).json({ error: err.message || 'Failed to fetch kanban board.' });
  }
});

/**
 * POST /api/kanban/cards
 * Create a new card on the board
 */
router.post('/cards', async (req, res) => {
  try {
    const card = await createCard(req.user.id, req.body);
    res.status(201).json({ message: 'Card created.', card });
  } catch (err) {
    res.status(400).json({ error: err.message || 'Failed to create card.' });
  }
});

/**
 * PUT /api/kanban/cards/:id
 * Move or update a card
 */
router.put('/cards/:id', async (req, res) => {
  try {
    const card = await updateCard(req.user.id, parseInt(req.params.id, 10), req.body);
    if (!card) {
      return res.status(404).json({ error: 'Card not found.' });
    }
    res.json({ message: 'Card updated.', card });
  } catch (err) {
    res.status(400).json({ error: err.message || 'Failed to update card.' });
  }
});

/**
 * DELETE /api/kanban/cards/:id
 * Delete a card
 */
router.delete('/cards/:id', async (req, res) => {
  try {
    const deleted = await deleteCard(req.user.id, parseInt(req.params.id, 10));
    if (!deleted) {
      return res.status(404).json({ error: 'Card not found.' });
    }
    res.json({ message: 'Card deleted.' });
  } catch (err) {
    res.status(500).json({ error: err.message || 'Failed to delete card.' });
  }
});

export default router;
