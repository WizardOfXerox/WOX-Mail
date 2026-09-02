import { redis } from '../config/redis.js';
import { RATE_LIMITS } from '../config/constants.js';

/**
 * Redis sliding-window rate limiter factory.
 * Creates middleware that limits requests per IP (and optionally per user).
 *
 * @param {object} options
 * @param {number} options.window - Window size in seconds
 * @param {number} options.max - Max requests per window
 * @param {string} [options.prefix] - Redis key prefix
 * @param {boolean} [options.perUser] - Rate limit per user instead of per IP
 * @returns {Function} Express middleware
 */
export function rateLimit({ window, max, prefix = 'rl', perUser = false }) {
  return async (req, res, next) => {
    const identifier = perUser && req.userId
      ? `user:${req.userId}`
      : `ip:${req.ip}`;

    const key = `${prefix}:${identifier}`;

    try {
      const now = Date.now();
      const windowStart = now - window * 1000;

      // Sliding window using sorted set
      await redis.zremrangebyscore(key, 0, windowStart);
      const count = await redis.zcard(key);

      if (count >= max) {
        const oldestEntry = await redis.zrange(key, 0, 0, 'WITHSCORES');
        const retryAfter = oldestEntry.length >= 2
          ? Math.ceil((Number(oldestEntry[1]) + window * 1000 - now) / 1000)
          : window;

        res.set('Retry-After', String(retryAfter));
        res.set('X-RateLimit-Limit', String(max));
        res.set('X-RateLimit-Remaining', '0');
        res.set('X-RateLimit-Reset', String(Math.ceil((now + retryAfter * 1000) / 1000)));

        return res.status(429).json({
          error: 'Too many requests',
          retryAfter,
        });
      }

      // Add current request to the window
      await redis.zadd(key, now, `${now}:${Math.random()}`);
      await redis.expire(key, window);

      res.set('X-RateLimit-Limit', String(max));
      res.set('X-RateLimit-Remaining', String(max - count - 1));

      next();
    } catch (err) {
      // If Redis is down, allow the request (fail open for availability)
      next();
    }
  };
}

/** Pre-configured rate limiters */
export const loginLimiter = rateLimit({
  ...RATE_LIMITS.LOGIN,
  prefix: 'rl:login',
});

export const apiLimiter = rateLimit({
  ...RATE_LIMITS.API,
  prefix: 'rl:api',
});

export const tempGenerateLimiter = rateLimit({
  ...RATE_LIMITS.TEMP_GENERATE,
  prefix: 'rl:tempgen',
});
