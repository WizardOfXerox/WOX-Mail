import { Router } from 'express';
import { requireAuth } from '../middleware/auth.js';
import { getContactDossier } from '../services/contactDossierService.js';

const router = Router();

router.use(requireAuth);

/**
 * GET /api/dossier/:email
 */
router.get('/:email', async (req, res, next) => {
  try {
    const dossier = await getContactDossier({
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

export default router;
