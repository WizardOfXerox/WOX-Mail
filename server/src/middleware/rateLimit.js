import crypto from 'crypto';
import { redis } from '../config/redis.js';
import { RATE_LIMITS, JWT_COOKIE_NAME, TEMP_COOKIE_NAME } from '../config/constants.js';

// Bounded in-memory sliding-window fallback when Redis is unavailable
const memoryWindows = new Map(); // key -> { timestamps: number[], expiresAt: number }
const MAX_MEMORY_WINDOWS = 20000;

const windowCleanupTimer = setInterval(() => {
  const now = Date.now();
  for (const [k, entry] of memoryWindows.entries()) {
    if (entry.expiresAt <= now) {
      memoryWindows.delete(k);
    }
  }
}, 60 * 1000);

if (windowCleanupTimer.unref) {
  windowCleanupTimer.unref();
}

function checkMemoryWindow(key, windowSec, max, now) {
  const windowMs = windowSec * 1000;
  const windowStart = now - windowMs;

  let entry = memoryWindows.get(key);
  if (entry) {
    entry.timestamps = entry.timestamps.filter((ts) => ts > windowStart);
  } else {
    if (memoryWindows.size >= MAX_MEMORY_WINDOWS) {
      for (const [k, v] of memoryWindows.entries()) {
        if (v.expiresAt <= now) memoryWindows.delete(k);
        if (memoryWindows.size < MAX_MEMORY_WINDOWS) break;
      }
      if (memoryWindows.size >= MAX_MEMORY_WINDOWS) {
        const oldestKey = memoryWindows.keys().next().value;
        if (oldestKey !== undefined) memoryWindows.delete(oldestKey);
      }
    }
    entry = { timestamps: [], expiresAt: now + windowMs };
    memoryWindows.set(key, entry);
  }

  if (entry.timestamps.length >= max) {
    const oldestTs = entry.timestamps[0] || now;
    const retryAfter = Math.max(1, Math.ceil((oldestTs + windowMs - now) / 1000));
    return {
      allowed: false,
      remaining: 0,
      retryAfter,
    };
  }

  entry.timestamps.push(now);
  entry.expiresAt = now + windowMs;

  return {
    allowed: true,
    remaining: Math.max(0, max - entry.timestamps.length),
    retryAfter: 0,
  };
}

async function checkRedisWindow(key, windowSec, max, now) {
  const windowStart = now - windowSec * 1000;

  await redis.zremrangebyscore(key, 0, windowStart);
  const count = await redis.zcard(key);

  if (count >= max) {
    const oldestEntry = await redis.zrange(key, 0, 0, 'WITHSCORES');
    const retryAfter = oldestEntry.length >= 2
      ? Math.max(1, Math.ceil((Number(oldestEntry[1]) + windowSec * 1000 - now) / 1000))
      : windowSec;

    return {
      allowed: false,
      remaining: 0,
      retryAfter,
    };
  }

  await redis.zadd(key, now, `${now}:${Math.random()}`);
  await redis.expire(key, windowSec);

  return {
    allowed: true,
    remaining: Math.max(0, max - count - 1),
    retryAfter: 0,
  };
}

async function evaluateWindow(key, windowSec, max, now) {
  if (redis.status === 'ready') {
    try {
      return await checkRedisWindow(key, windowSec, max, now);
    } catch {
      // Fall back to bounded in-memory sliding window when Redis errors
    }
  }
  return checkMemoryWindow(key, windowSec, max, now);
}

/**
 * Sliding-window rate limiter factory (Redis-backed with bounded in-memory fallback).
 *
 * @param {object} options
 * @param {number} options.window - Window size in seconds
 * @param {number} options.max - Max requests per window
 * @param {string} [options.prefix] - Key prefix
 * @param {boolean} [options.perUser] - Rate limit per user instead of per IP
 * @param {Function} [options.keyGenerator] - Custom primary key generator
 * @param {number} [options.burstMax] - Optional secondary burst ceiling max
 * @param {Function} [options.burstKeyGenerator] - Optional secondary burst ceiling key generator
 * @returns {Function} Express middleware
 */
export function rateLimit({
  window,
  max,
  prefix = 'rl',
  perUser = false,
  keyGenerator = null,
  burstMax = null,
  burstKeyGenerator = null,
}) {
  return async (req, res, next) => {
    const now = Date.now();
    const identifier = keyGenerator
      ? keyGenerator(req)
      : (perUser && req.userId ? `user:${req.userId}` : `ip:${req.ip}`);

    const key = `${prefix}:${identifier}`;

    try {
      const primary = await evaluateWindow(key, window, max, now);
      if (!primary.allowed) {
        res.set('Retry-After', String(primary.retryAfter));
        res.set('X-RateLimit-Limit', String(max));
        res.set('X-RateLimit-Remaining', '0');
        res.set('X-RateLimit-Reset', String(Math.ceil((now + primary.retryAfter * 1000) / 1000)));
        return res.status(429).json({
          error: 'Too many requests',
          retryAfter: primary.retryAfter,
        });
      }

      if (burstMax && burstKeyGenerator) {
        const burstId = burstKeyGenerator(req);
        const burstKey = `${prefix}:burst:${burstId}`;
        const burst = await evaluateWindow(burstKey, window, burstMax, now);
        if (!burst.allowed) {
          res.set('Retry-After', String(burst.retryAfter));
          res.set('X-RateLimit-Limit', String(burstMax));
          res.set('X-RateLimit-Remaining', '0');
          res.set('X-RateLimit-Reset', String(Math.ceil((now + burst.retryAfter * 1000) / 1000)));
          return res.status(429).json({
            error: 'Too many requests',
            retryAfter: burst.retryAfter,
          });
        }
      }

      res.set('X-RateLimit-Limit', String(max));
      res.set('X-RateLimit-Remaining', String(primary.remaining));

      next();
    } catch {
      next();
    }
  };
}

function getApiClientIdentifier(req) {
  if (req.userId) {
    return `user:${req.userId}`;
  }
  const authHeader = req.headers?.authorization;
  let token = null;
  if (typeof authHeader === 'string' && authHeader.startsWith('Bearer ')) {
    token = authHeader.slice(7).trim();
  } else if (req.cookies?.[JWT_COOKIE_NAME]) {
    token = req.cookies[JWT_COOKIE_NAME];
  } else if (req.cookies?.[TEMP_COOKIE_NAME]) {
    token = req.cookies[TEMP_COOKIE_NAME];
  }

  if (token && typeof token === 'string') {
    const hash = crypto.createHash('sha256').update(token).digest('hex').slice(0, 24);
    return `tok:${hash}`;
  }

  return `ip:${req.ip}`;
}

/** Pre-configured rate limiters */
export const loginLimiter = rateLimit({
  ...RATE_LIMITS.LOGIN,
  prefix: 'rl:login',
  keyGenerator: (req) => {
    const email = String(req.body?.email || '').trim().toLowerCase();
    return email ? `ip:${req.ip}:email:${email}` : `ip:${req.ip}`;
  },
  burstMax: RATE_LIMITS.LOGIN.max * 5,
  burstKeyGenerator: (req) => `ip:${req.ip}`,
});

export const apiLimiter = rateLimit({
  ...RATE_LIMITS.API,
  prefix: 'rl:api',
  keyGenerator: getApiClientIdentifier,
});

export const tempGenerateLimiter = rateLimit({
  ...RATE_LIMITS.TEMP_GENERATE,
  prefix: 'rl:tempgen',
});
