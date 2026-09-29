import { Router } from 'express';
import { query } from '../config/database.js';

const router = Router();

/**
 * GET /api/announcements
 * Returns active global system announcements for users
 */
router.get('/', async (req, res, next) => {
  try {
    const result = await query(
      `SELECT id, title, body, body AS content, type, starts_at, ends_at, created_at 
       FROM announcements 
       WHERE is_active = TRUE 
         AND (starts_at IS NULL OR starts_at <= NOW())
         AND (ends_at IS NULL OR ends_at > NOW()) 
       ORDER BY created_at DESC 
       LIMIT 10`
    );
    res.json({ announcements: result.rows });
  } catch (err) {
    next(err);
  }
});

export default router;
