/**
 * @fileoverview Redis client configuration and utility helpers.
 * Provides caching, session storage, and rate-limiting operations.
 */

import Redis from 'ioredis';
import pino from 'pino';

const logger = pino({
  name: 'woxmail:redis',
  level: process.env.LOG_LEVEL || 'info',
});

const redisUrl = process.env.REDIS_URL || 'redis://127.0.0.1:6379';

/**
 * Global Redis client instance.
 * @type {import('ioredis').Redis}
 */
export const redis = new Redis(redisUrl, {
  maxRetriesPerRequest: 1,
  enableReadyCheck: false,
  lazyConnect: true,
  retryStrategy(times) {
    if (times > 2) {
      return null; // Stop reconnect spam if Redis is not running
    }
    return 1000;
  },
});

let isWarnedOffline = false;

redis.on('error', (err) => {
  if (!isWarnedOffline && (err.code === 'ECONNREFUSED' || err.message?.includes('ECONNREFUSED'))) {
    isWarnedOffline = true;
    logger.warn('Redis not running on port 6379 — using in-memory store fallback');
  }
});

redis.on('connect', () => {
  logger.info('Redis connecting...');
});

redis.on('ready', () => {
  logger.info('Redis connected and ready');
});

// Attempt initial connection without crashing if offline
redis.connect().catch(() => {
  if (!isWarnedOffline) {
    isWarnedOffline = true;
    logger.warn('Redis not running — using in-memory store fallback');
  }
});

// In-memory fallback map for when Redis is offline
const memoryStore = new Map();

/**
 * Set a key with an expiration time in seconds.
 * Automatically serializes non-string values into JSON.
 *
 * @param {string} key - Redis key name
 * @param {number} seconds - Time-to-live in seconds
 * @param {string|number|object} value - Value to store
 * @returns {Promise<'OK'>} Redis response status
 */
export async function setex(key, seconds, value) {
  const serialized = typeof value === 'object' && value !== null ? JSON.stringify(value) : String(value);
  try {
    if (redis.status === 'ready') {
      return await redis.setex(key, seconds, serialized);
    }
  } catch (err) {
    logger.warn({ err: err.message }, 'Redis setex failed, falling back to memory');
  }
  memoryStore.set(key, { value: serialized, expires: Date.now() + seconds * 1000 });
  return 'OK';
}

/**
 * Retrieve the raw string value of a key.
 *
 * @param {string} key - Redis key name
 * @returns {Promise<string|null>} The stored string or null if not found
 */
export async function get(key) {
  try {
    if (redis.status === 'ready') {
      return await redis.get(key);
    }
  } catch (err) {
    logger.warn({ err: err.message }, 'Redis get failed, falling back to memory');
  }
  const item = memoryStore.get(key);
  if (!item) return null;
  if (Date.now() > item.expires) {
    memoryStore.delete(key);
    return null;
  }
  return item.value;
}

/**
 * Delete one or more keys from Redis.
 *
 * @param {string|string[]} key - Key or list of keys to delete
 * @returns {Promise<number>} Number of keys removed
 */
export async function del(key) {
  const keys = Array.isArray(key) ? key : [key];
  if (keys.length === 0) return 0;
  let removed = 0;
  try {
    if (redis.status === 'ready') {
      return await redis.del(...keys);
    }
  } catch (err) {
    logger.warn({ err: err.message }, 'Redis del failed, falling back to memory');
  }
  for (const k of keys) {
    if (memoryStore.delete(k)) removed++;
  }
  return removed;
}

/**
 * Increment the integer value of a key by one.
 *
 * @param {string} key - Redis key name
 * @returns {Promise<number>} Value of key after increment
 */
export async function incr(key) {
  try {
    if (redis.status === 'ready') {
      return await redis.incr(key);
    }
  } catch (err) {
    logger.warn({ err: err.message }, 'Redis incr failed, falling back to memory');
  }
  const current = parseInt(memoryStore.get(key)?.value || '0', 10);
  const nextVal = current + 1;
  memoryStore.set(key, { value: String(nextVal), expires: Date.now() + 86400000 });
  return nextVal;
}

export default redis;
