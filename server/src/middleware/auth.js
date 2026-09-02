import jwt from 'jsonwebtoken';
import { query } from '../config/database.js';
import { JWT_COOKIE_NAME } from '../config/constants.js';
import { verifyAppPassword } from '../services/appPasswordService.js';

/**
 * Authentication middleware for permanent users.
 * Extracts token from Authorization header (JWT or App Password) or cookie,
 * verifies it, and attaches user to req.user.
 */
export async function authenticate(req, res, next) {
  let token = req.cookies?.[JWT_COOKIE_NAME];

  const authHeader = req.headers.authorization;
  if (authHeader) {
    if (authHeader.startsWith('Bearer ')) {
      token = authHeader.replace('Bearer ', '').trim();
    } else if (authHeader.startsWith('Basic ')) {
      // Basic auth: base64(username:password)
      const credentials = Buffer.from(authHeader.replace('Basic ', ''), 'base64').toString('utf8');
      const [, pass] = credentials.split(':');
      if (pass && pass.startsWith('wox_app_')) {
        token = pass;
      }
    }
  }

  if (!token) {
    return res.status(401).json({ error: 'Authentication required' });
  }

  // 1. Check if token is an Application Password / SMTP App Code
  if (typeof token === 'string' && token.startsWith('wox_app_')) {
    try {
      const appAuth = await verifyAppPassword(token, { ip: req.ip });
      if (appAuth) {
        req.userId = appAuth.user.id;
        req.user = appAuth.user;
        req.appScopes = appAuth.scopes;
        req.isAppPasswordAuth = true;
        return next();
      }
      return res.status(401).json({ error: 'Invalid or revoked application password' });
    } catch (appErr) {
      return res.status(401).json({ error: 'Application password verification failed' });
    }
  }

  // 2. Standard JWT verification
  try {
    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    req.userId = decoded.userId;
    req.tokenType = decoded.type || 'access';
    req.jwtPayload = decoded;
    next();
  } catch (err) {
    if (err.name === 'TokenExpiredError') {
      return res.status(401).json({ error: 'Token expired', code: 'TOKEN_EXPIRED' });
    }
    return res.status(401).json({ error: 'Invalid token' });
  }
}

/**
 * Loads the full user record from the database after JWT verification.
 * Must be used after authenticate().
 */
export async function loadUser(req, res, next) {
  try {
    const result = await query(
      `SELECT id, email, username, display_name, avatar_url, recovery_email,
              password_hash, imap_password,
              otp_enabled, otp_secret, recovery_codes, is_admin, is_suspended, signature, language, theme,
              forwarding_address, auto_reply_enabled, created_at,
              deletion_scheduled_at, deletion_requested_at, deletion_reason
       FROM users WHERE id = $1`,
      [req.userId]
    );

    if (result.rows.length === 0) {
      return res.status(401).json({ error: 'User not found' });
    }

    if (result.rows[0].is_suspended) {
      return res.status(403).json({ error: 'Account suspended' });
    }

    req.user = result.rows[0];
    if (req.jwtPayload?.impersonated) {
      req.user.impersonated = true;
      req.user.impersonatorId = req.jwtPayload.impersonatorId;
      req.user.adminEmail = req.jwtPayload.adminEmail;
    }
    next();
  } catch (err) {
    next(err);
  }
}

/**
 * Combined middleware: authenticate + loadUser in one call.
 */
export function requireAuth(req, res, next) {
  authenticate(req, res, (err) => {
    if (err) return next(err);
    if (res.headersSent) return;
    loadUser(req, res, next);
  });
}
