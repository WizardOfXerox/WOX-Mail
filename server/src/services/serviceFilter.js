import { query } from '../config/database.js';
import pino from 'pino';

const logger = pino({ name: 'woxmail:serviceFilter' });

/**
 * Service filter for per-tier sender blocking.
 * Checks if an incoming email's sender domain is blocked
 * for the recipient's tier (public/personal/permanent).
 *
 * Example: Google emails are blocked for public temp mail
 * to prevent account creation with disposable addresses.
 */

/** @type {Map<string, {public: boolean, personal: boolean, permanent: boolean}>} */
let domainRules = new Map();
let lastRefresh = 0;
const CACHE_TTL = 5 * 60 * 1000; // 5 minutes

/**
 * Refresh the service control rules from the database.
 */
async function refreshRules() {
  try {
    const result = await query(
      'SELECT service_name, service_domains, public_enabled, personal_enabled, permanent_enabled FROM service_controls'
    );

    domainRules = new Map();
    for (const row of result.rows) {
      for (const domain of row.service_domains) {
        domainRules.set(domain.toLowerCase(), {
          service: row.service_name,
          public: row.public_enabled,
          personal: row.personal_enabled,
          permanent: row.permanent_enabled,
        });
      }
    }

    lastRefresh = Date.now();
    logger.debug({ ruleCount: domainRules.size }, 'Service filter rules refreshed');
  } catch (err) {
    logger.error({ err }, 'Failed to refresh service filter rules');
  }
}

/**
 * Check if an email from a specific sender is allowed for a given tier.
 *
 * @param {string} senderEmail - Full sender email address
 * @param {'public'|'personal'|'permanent'} tier - Recipient tier
 * @returns {Promise<{allowed: boolean, service?: string, reason?: string}>}
 */
export async function checkSender(senderEmail, tier) {
  if (Date.now() - lastRefresh > CACHE_TTL) {
    await refreshRules();
  }

  if (!senderEmail) return { allowed: true };

  const senderDomain = senderEmail.split('@')[1]?.toLowerCase();
  if (!senderDomain) return { allowed: true };

  // Check the sender domain and all parent domains
  // e.g. for "accounts.google.com" → check "accounts.google.com", "google.com"
  const domainParts = senderDomain.split('.');
  for (let i = 0; i < domainParts.length - 1; i++) {
    const checkDomain = domainParts.slice(i).join('.');
    const rule = domainRules.get(checkDomain);

    if (rule) {
      const enabled = rule[tier];
      if (!enabled) {
        logger.info({ sender: senderEmail, service: rule.service, tier }, 'Sender blocked by service filter');

        // Record block stat (fire and forget)
        query(
          `INSERT INTO service_block_stats (date, service_name, tier, blocked_count)
           VALUES (CURRENT_DATE, $1, $2, 1)
           ON CONFLICT (date, service_name, tier)
           DO UPDATE SET blocked_count = service_block_stats.blocked_count + 1`,
          [rule.service, tier]
        ).catch(() => {});

        return {
          allowed: false,
          service: rule.service,
          reason: `Emails from ${rule.service} are not allowed for ${tier} tier addresses`,
        };
      }
    }
  }

  return { allowed: true };
}

/**
 * Force refresh the service filter cache.
 * Call this after admin updates service controls.
 */
export async function refreshFilterCache() {
  await refreshRules();
}

export default { checkSender, refreshFilterCache };
