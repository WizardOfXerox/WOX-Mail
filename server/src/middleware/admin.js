/**
 * Admin authorization middleware.
 * Must be used after requireAuth() which sets req.user.
 */
export function requireAdmin(req, res, next) {
  if (!req.user) {
    return res.status(401).json({ error: 'Authentication required' });
  }

  if (req.isAppPasswordAuth) {
    return res.status(403).json({ error: 'Application passwords cannot access admin endpoints' });
  }

  if (!req.user.is_admin) {
    return res.status(403).json({ error: 'Admin access required' });
  }

  next();
}
