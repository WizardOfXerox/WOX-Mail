import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';
import pg from 'pg';
import pino from 'pino';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
dotenv.config({ path: path.join(__dirname, '..', '..', '..', '.env') });

const { Pool } = pg;

const logger = pino({
  name: 'woxmail:database',
  level: process.env.LOG_LEVEL || 'info',
});

let isConnectionLogged = false;

/**
 * PostgreSQL connection pool instance configured with connection limits and timeouts.
 * @type {import('pg').Pool}
 */
export const pool = new Pool({
  connectionString: process.env.DATABASE_URL || 'postgresql://woxmail:woxmail@localhost:5432/woxmail',
  max: 20,
  idleTimeoutMillis: process.env.NODE_ENV === 'test' ? 500 : 30000,
  connectionTimeoutMillis: 5000,
});

pool.on('error', (err) => {
  logger.error({ err }, 'Unexpected error on idle PostgreSQL client');
});

/**
 * Execute a SQL query against the database pool.
 * Logs connection info on the first successful query.
 *
 * @param {string} text - SQL query statement
 * @param {Array<unknown>} [params] - Query parameter values
 * @returns {Promise<import('pg').QueryResult>} The query result object
 */
export async function query(text, params) {
  const start = process.hrtime.bigint();
  try {
    const res = await pool.query(text, params);
    if (!isConnectionLogged) {
      isConnectionLogged = true;
      logger.info('Database connection established successfully');
    }
    return res;
  } catch (err) {
    logger.error({ err, text }, 'Query execution failed');
    throw err;
  }
}

/**
 * Acquire a dedicated client from the pool for transactions.
 * Remember to release the client back to the pool in a finally block.
 *
 * @returns {Promise<import('pg').PoolClient>} A connected PostgreSQL pool client
 */
export async function getClient() {
  const client = await pool.connect();
  return client;
}

export default {
  pool,
  query,
  getClient,
};
