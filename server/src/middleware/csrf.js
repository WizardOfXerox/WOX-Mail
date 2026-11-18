import crypto from 'crypto';
import { JWT_COOKIE_NAME, TEMP_COOKIE_NAME } from '../config/constants.js';

const CSRF_COOKIE = 'woxmail_csrf';
const CSRF_HEADER = 'x-csrf-token';

const PUBLIC_AUTH_PATHS = new Set([
  '/api/auth/login',
  '/api/auth/register',
  '/api/auth/forgot-password',
  '/api/auth/reset-password',
  '/api/auth/recover-with-code',
  '/api/auth/verify-otp',
  '/api/auth/passkeys/login-options',
  '/api/auth/passkeys/login-verify',
]);

function isRequestHttps(req) {
  const forwardedProto = String(req.headers['x-forwarded-proto'] || '')
    .split(',')[0]
    .trim()
    .toLowerCase();
  return Boolean(req.secure || forwardedProto === 'https');
}

/**
 * CSRF protection using the double-submit cookie pattern.
 *
 * On GET/HEAD/OPTIONS requests: sets a CSRF cookie with a random token.
 * On state-changing requests (POST/PUT/DELETE/PATCH): validates that
 * the X-CSRF-Token header (or _csrf body field) matches the csrf cookie value.
 *
 * Skips CSRF check for:
 * - Unauthenticated stateless requests without auth/CSRF cookies
 * - API requests with Bearer token (assumed to be programmatic)
 * - Explicitly public unauthenticated endpoints
 */
export function csrfProtection(req, res, next) {
  const safeMethods = ['GET', 'HEAD', 'OPTIONS'];

  if (safeMethods.includes(req.method)) {
    // Set CSRF cookie on safe requests if not already set
    if (!req.cookies?.[CSRF_COOKIE]) {
      const token = crypto.randomBytes(32).toString('hex');
      res.cookie(CSRF_COOKIE, token, {
        httpOnly: false,    // JS needs to read this
        secure: isRequestHttps(req),
        sameSite: 'strict',
        path: '/',
        maxAge: 24 * 60 * 60 * 1000, // 24 hours
      });
    }
    return next();
  }

  const cleanPath = req.path.length > 1 ? req.path.replace(/\/+$/, '') : req.path;

  // Skip CSRF strictly for public unauthenticated endpoints
  if (
    cleanPath.startsWith('/tempmail/nojs') ||
    cleanPath === '/api/tempmail/generate' ||
    cleanPath === '/api/tempmail/personal/login' ||
    cleanPath === '/api/tempmail/personal/create' ||
    PUBLIC_AUTH_PATHS.has(cleanPath) ||
    cleanPath.startsWith('/api/campaigns/subscribe') ||
    cleanPath.startsWith('/api/campaigns/unsubscribe') ||
    cleanPath.startsWith('/api/secure/unlock') ||
    cleanPath.startsWith('/api/mail/secure/unlock') ||
    cleanPath.startsWith('/api/futureme/verify') ||
    cleanPath.startsWith('/api/futureme/public') ||
    cleanPath.startsWith('/api/analytics/click') ||
    cleanPath.startsWith('/api/analytics/pixel') ||
    (cleanPath === '/api/support/tickets' && !req.cookies?.[JWT_COOKIE_NAME])
  ) {
    return next();
  }

  if (!req.cookies?.[JWT_COOKIE_NAME] && !req.cookies?.[TEMP_COOKIE_NAME] && !req.cookies?.[CSRF_COOKIE]) {
    return next();
  }
  if (req.headers.authorization?.startsWith('Bearer ')) {
    return next();
  }

  const cookieToken = req.cookies?.[CSRF_COOKIE];
  const submittedToken = req.headers[CSRF_HEADER] || req.body?._csrf;

  if (!cookieToken || !submittedToken || typeof cookieToken !== 'string' || typeof submittedToken !== 'string') {
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
