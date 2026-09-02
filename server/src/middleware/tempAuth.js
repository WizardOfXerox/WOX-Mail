import { query } from '../config/database.js';
import { TEMP_COOKIE_NAME } from '../config/constants.js';

/**
 * Session-based auth middleware for temp mail users (personal tier).
 * Reads session token from cookie, validates against temp_addresses table,
 * and attaches temp user info to req.tempUser.
 */
export function requireTempAuth(req, res, next) {
  let token = req.cookies?.[TEMP_COOKIE_NAME];
  if (!token && req.headers['x-temp-token']) token = req.headers['x-temp-token'];
  if (!token && req.headers['x-session-token']) token = req.headers['x-session-token'];

  if (!token) {
    return res.status(401).json({ error: 'Temp mail session required' });
  }

  validateTempSession(token)
    .then((tempUser) => {
      if (!tempUser) {
        return res.status(401).json({ error: 'Invalid or expired session' });
      }
      req.tempUser = tempUser;
      next();
    })
    .catch(next);
}

/**
 * Validates a temp mail session token against the database.
 * Returns the temp address record if valid, null otherwise.
 * @param {string} token - Session token from cookie
 * @returns {Promise<object|null>}
 */
async function validateTempSession(token) {
  const result = await query(
    `SELECT id, address, tier, status, password_hash, custom_username,
            expires_at, created_at, session_token, last_accessed
     FROM temp_addresses
     WHERE session_token = $1
       AND status = 'active'
       AND expires_at > NOW()`,
    [token]
  );

  if (result.rows.length === 0) return null;

  // Update last accessed timestamp (fire and forget)
  query(
    'UPDATE temp_addresses SET last_accessed = NOW() WHERE id = $1',
    [result.rows[0].id]
  ).catch(() => {});

  return result.rows[0];
}

/**
 * Optional temp auth — attaches tempUser if token present but doesn't reject.
 * Useful for routes that work for both authenticated and unauthenticated users.
 */
export function optionalTempAuth(req, res, next) {
  const token = req.cookies?.[TEMP_COOKIE_NAME];
  if (!token) return next();

  validateTempSession(token)
    .then((tempUser) => {
      req.tempUser = tempUser;
      next();
    })
    .catch(() => next());
}
