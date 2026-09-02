import { Router } from 'express';
import { query } from '../config/database.js';
import { redis } from '../config/redis.js';
import { requireAuth } from '../middleware/auth.js';
import * as healthMonitorService from '../services/healthMonitorService.js';

const router = Router();

/**
 * GET /api/health
 * Health check endpoint. Returns status of all services.
 */
router.get('/', async (req, res) => {
  const checks = {
    status: 'ok',
    uptime: Math.floor(process.uptime()),
    timestamp: new Date().toISOString(),
    services: {},
  };

  // PostgreSQL check
  try {
    await query('SELECT 1');
    checks.services.database = 'ok';
  } catch {
    checks.services.database = 'error';
    checks.status = 'degraded';
  }

  // Redis check
  try {
    if (redis.ping) {
      await redis.ping();
      checks.services.redis = 'ok';
    } else {
      checks.services.redis = 'in-memory-store';
    }
  } catch {
    checks.services.redis = 'in-memory-store';
  }

  const statusCode = checks.services.database === 'ok' ? 200 : 503;
  res.status(statusCode).json(checks);
});

/**
 * GET /api/health/monitor
 * Deep system health dashboard — CPU, memory, disk, DB latency, table stats.
 * Requires authentication (admin-level data).
 */
router.get('/monitor', requireAuth, async (req, res, next) => {
  try {
    const snapshot = await healthMonitorService.getHealthSnapshot();
    res.json(snapshot);
  } catch (err) {
    next(err);
  }
});

export default router;
