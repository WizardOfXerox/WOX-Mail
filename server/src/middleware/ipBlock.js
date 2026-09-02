import { query } from '../config/database.js';

/**
 * IP blocking middleware.
 * Checks if the request IP is in the blocked_ips table.
 * Uses a simple in-memory cache (refreshed every 5 min) to avoid
 * hitting the database on every single request.
 */

let blockedIps = new Set();
let lastRefresh = 0;
const CACHE_TTL = 5 * 60 * 1000; // 5 minutes

async function refreshBlockedIps() {
  try {
    const result = await query(
      `SELECT ip_address FROM blocked_ips
       WHERE (expires_at IS NULL OR expires_at > NOW())`
    );
    blockedIps = new Set(result.rows.map((r) => r.ip_address));
    lastRefresh = Date.now();
  } catch {
    // If query fails, keep using the existing cache
  }
}

export async function ipBlockCheck(req, res, next) {
  // Refresh cache if stale
  if (Date.now() - lastRefresh > CACHE_TTL) {
    await refreshBlockedIps();
  }

  if (blockedIps.has(req.ip)) {
    return res.status(403).json({ error: 'Access denied' });
  }

  next();
}

/**
 * Force refresh the blocked IPs cache.
 * Call this after adding/removing blocked IPs in the admin panel.
 */
export async function refreshBlockList() {
  await refreshBlockedIps();
}
