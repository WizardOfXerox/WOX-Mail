import crypto from 'crypto';
import { JWT_COOKIE_NAME } from '../config/constants.js';

const CSRF_COOKIE = 'woxmail_csrf';
const CSRF_HEADER = 'x-csrf-token';

/**
 * CSRF protection using the double-submit cookie pattern.
 *
 * On GET requests: sets a CSRF cookie with a random token.
 * On state-changing requests (POST/PUT/DELETE): validates that
 * the X-CSRF-Token header matches the csrf cookie value.
 *
 * Skips CSRF check for:
 * - Requests without an auth cookie (not logged in)
 * - API requests with Bearer token (assumed to be programmatic)
 */
export function csrfProtection(req, res, next) {
  const safeMethods = ['GET', 'HEAD', 'OPTIONS'];

  if (safeMethods.includes(req.method)) {
    // Set CSRF cookie on safe requests if not already set
    if (!req.cookies?.[CSRF_COOKIE]) {
      const token = crypto.randomBytes(32).toString('hex');
      res.cookie(CSRF_COOKIE, token, {
        httpOnly: false,    // JS needs to read this
        secure: process.env.NODE_ENV === 'production',
        sameSite: 'strict',
        path: '/',
        maxAge: 24 * 60 * 60 * 1000, // 24 hours
      });
    }
    return next();
  }

  // Skip CSRF for unauthenticated requests, Bearer token API calls, or public routes
  if (
    req.path.startsWith('/tempmail/nojs') ||
    req.path.startsWith('/api/tempmail') ||
    req.path.startsWith('/api/auth') ||
    req.path.startsWith('/api/mail/secure/unlock') ||
    req.path.startsWith('/api/secure/unlock') ||
    req.path.startsWith('/api/cli') ||
    req.path.startsWith('/api/futureme')
  ) {
    return next();
  }
  if (!req.cookies?.[JWT_COOKIE_NAME] && !req.cookies?.[CSRF_COOKIE]) {
    return next();
  }
  if (req.headers.authorization?.startsWith('Bearer ')) {
    return next();
  }

  const cookieToken = req.cookies?.[CSRF_COOKIE];
  const submittedToken = req.headers[CSRF_HEADER] || req.body?._csrf;

  if (!cookieToken || !submittedToken) {
    return res.status(403).json({ error: 'CSRF token missing' });
  }

  // Timing-safe comparison to prevent timing attacks
  if (cookieToken.length !== submittedToken.length) {
    return res.status(403).json({ error: 'CSRF token invalid' });
  }

  const valid = crypto.timingSafeEqual(
    Buffer.from(cookieToken),
    Buffer.from(submittedToken)
  );

  if (!valid) {
    return res.status(403).json({ error: 'CSRF token invalid' });
  }

  next();
}
