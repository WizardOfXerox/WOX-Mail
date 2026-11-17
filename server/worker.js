/**
 * @fileoverview Standalone background worker process for WoxMail.
 * Runs decoupled cron jobs and maintenance tasks independently from the HTTP server.
 */

import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
dotenv.config({ path: path.join(__dirname, '..', '.env') });

import pino from 'pino';
import { pool, query } from './src/config/database.js';
import { redis } from './src/config/redis.js';
import { startJobs } from './src/jobs/scheduler.js';

const logger = pino({
  name: 'woxmail:worker',
  level: process.env.LOG_LEVEL || 'info',
  transport: process.env.NODE_ENV === 'development'
    ? { target: 'pino-pretty', options: { colorize: true } }
    : undefined,
});

let isShuttingDown = false;

async function gracefulShutdown(signal) {
  if (isShuttingDown) return;
  isShuttingDown = true;

  logger.info(`[WoxMail Worker] ${signal} received — shutting down background worker...`);

  try {
    // Close database pool
    await pool.end().catch((err) => {
      logger.error({ err }, '[WoxMail Worker] Error closing database pool');
    });

    // Close Redis connection
    if (redis.status === 'ready' || redis.status === 'connecting') {
      await redis.quit().catch(() => redis.disconnect());
    }

    logger.info('[WoxMail Worker] All background worker resources closed gracefully');
    process.exit(0);
  } catch (err) {
    logger.error({ err }, '[WoxMail Worker] Fatal error during shutdown');
    process.exit(1);
  }
}

process.on('SIGTERM', () => gracefulShutdown('SIGTERM'));
process.on('SIGINT', () => gracefulShutdown('SIGINT'));

process.on('uncaughtException', (err) => {
  logger.error({ err: err?.stack || err?.message || err }, '[WoxMail Worker] Uncaught Exception detected');
});

process.on('unhandledRejection', (reason) => {
  logger.error({ reason: reason?.stack || reason?.message || reason }, '[WoxMail Worker] Unhandled Rejection detected');
});

async function main() {
  logger.info('[WoxMail Worker] Initializing dedicated worker process...');

  // Initialize and verify database connection
  try {
    await query('SELECT 1');
    logger.info('[WoxMail Worker] PostgreSQL connection verified');
  } catch (err) {
    logger.warn({ err: err.message }, '[WoxMail Worker] PostgreSQL connection check warning');
  }

  // Verify Redis connection status
  if (redis.status === 'ready') {
    logger.info('[WoxMail Worker] Redis connection verified and ready');
  } else {
    logger.info(`[WoxMail Worker] Redis status: ${redis.status}`);
  }

  // Start background jobs
  startJobs();

  logger.info('[WoxMail Worker] Dedicated background job worker started');
}

main().catch((err) => {
  logger.error({ err }, '[WoxMail Worker] Fatal initialization error');
  process.exit(1);
});
