import { query } from '../config/database.js';
import { createUser, deleteUser } from './purelymail.js';
import { generateToken } from '../utils/crypto.js';
import { generateRandomUsername } from '../utils/helpers.js';
import { sendWoxWelcomeEmail } from './welcomeService.js';
import pino from 'pino';

const logger = pino({ name: 'woxmail:pool' });

/**
 * Return all configured and active disposable domains.
 * @returns {string[]}
 */
export function getAvailableDomains() {
  const primaryDomain = process.env.DOMAIN_TEMP || 'mail.wox.world';
  const poolConfig = process.env.DOMAINS_TEMP_POOL || '';
  const additional = poolConfig
    .split(',')
    .map((d) => d.trim())
    .filter(Boolean);

  const set = new Set([primaryDomain, ...additional, 'mail.wox.world', 'temp.wox.world', 'discreetmail.is']);
  return Array.from(set);
}

/**
 * Pick a pseudo-random or weighted domain from the stealth rotation matrix.
 * @returns {string}
 */
export function getRandomDomain() {
  const domains = getAvailableDomains();
  return domains[Math.floor(Math.random() * domains.length)];
}

/**
 * Address pool lifecycle:
 * AVAILABLE (48h fresh) → ACTIVE → EXPIRED → PURGED (Deleted in Purelymail & Database)
 *
 * Pool ensures instant address generation for public temp mail
 * by pre-provisioning addresses via Purelymail API in continuous 48-hour cycles.
 */

/**
 * Get pool statistics.
 * @returns {Promise<{available: number, active: number, expired: number, total: number}>}
 */
export async function getPoolStats() {
  const result = await query(`
    SELECT status, COUNT(*)::int as count
    FROM temp_addresses
    WHERE tier = 'public'
    GROUP BY status
  `);

  const stats = { available: 0, active: 0, expired: 0, purging: 0, quarantine: 0, total: 0 };
  for (const row of result.rows) {
    stats[row.status] = row.count;
    stats.total += row.count;
  }
  return stats;
}

/**
 * Replenish the pool to the target size with a 24-hour expiration lifecycle.
 * Creates new addresses in Purelymail and stores them as 'available'.
 */
export async function replenishPool(lifespanHours = 24) {
  const targetSetting = await query("SELECT value FROM settings WHERE key = 'pool_target_size'");
  const target = parseInt(targetSetting.rows[0]?.value, 10) || parseInt(process.env.POOL_TARGET_SIZE, 10) || 5;

  const stats = await getPoolStats();
  const deficit = target - stats.available;

  if (deficit <= 0) {
    logger.debug({ available: stats.available, target }, 'Pool is full');
    return 0;
  }

  logger.info({ deficit, available: stats.available, target, lifespanHours }, 'Replenishing 24-hour pool');

  const domain = process.env.DOMAIN_TEMP || 'mail.wox.world';
  let created = 0;

  // Process in concurrent batches of 5
  const batchSize = 5;
  for (let i = 0; i < deficit; i += batchSize) {
    const currentBatch = Math.min(batchSize, deficit - i);
    const promises = Array.from({ length: currentBatch }).map(async () => {
      const username = generateRandomUsername();
      const address = `${username}@${domain}`;
      const password = generateToken(16);

      try {
        await createUser(address, password);
        await query(
          `INSERT INTO temp_addresses (address, tier, status, imap_password, expires_at, created_at)
           VALUES ($1, 'public', 'available', $2, NOW() + (INTERVAL '1 hour' * $3), NOW())
           ON CONFLICT (address) DO UPDATE
           SET status = 'available', imap_password = $2, expires_at = NOW() + (INTERVAL '1 hour' * $3)`,
          [address, password, lifespanHours]
        );
        return 1;
      } catch (err) {
        logger.error({ err: err.message, address }, 'Failed creating pool address');
        return 0;
      }
    });

    const results = await Promise.all(promises);
    created += results.reduce((a, b) => a + b, 0);
  }

  logger.info({ created, deficit }, 'Pool replenishment complete');
  return created;
}

/**
 * Purge ALL existing public temp mail pool addresses from Purelymail and database,
 * and immediately generate a fresh 20-address pool with a 24-hour lifecycle.
 */
export async function purgeAllTempPoolAndRecreate({ lifespanHours = 24, targetSize = 20 } = {}) {
  logger.info({ lifespanHours, targetSize }, 'Initiating complete temp mail pool purge & recreation');

  // 1. Retrieve all public temp addresses
  const allPublic = await query(`
    SELECT id, address FROM temp_addresses
    WHERE tier = 'public'
  `);

  let purgedCount = 0;
  const deleteBatchSize = 10;
  for (let i = 0; i < allPublic.rows.length; i += deleteBatchSize) {
    const chunk = allPublic.rows.slice(i, i + deleteBatchSize);
    await Promise.all(
      chunk.map(async (row) => {
        try {
          await deleteUser(row.address);
          purgedCount++;
        } catch (err) {
          logger.debug({ address: row.address, err: err.message }, 'Notice during deletion');
        }
      })
    );
  }

  // 2. Clear database table for public tier
  await query(`DELETE FROM temp_addresses WHERE tier = 'public'`);

  // 3. Update target size in settings if needed
  await query(
    `INSERT INTO settings (key, value, description)
     VALUES ('pool_target_size', $1, 'Target size of hot pre-provisioned pool addresses')
     ON CONFLICT (key) DO UPDATE SET value = $1`,
    [String(targetSize)]
  );

  // 4. Immediately regenerate a fresh batch of 20 addresses with 24h lifecycle
  const createdCount = await replenishPool(lifespanHours);

  logger.info({ purgedCount, createdCount, lifespanHours }, 'Purge and 24-hour pool recreation finished');
  return {
    purgedCount,
    createdCount,
    lifespanHours,
    targetSize,
  };
}

/**
 * Automated Executor / Cleaner Maintenance:
 * 1. Automatically transitions active addresses whose countdown timers have elapsed to 'expired'.
 * 2. Purges stale UNCLAIMED pool addresses (status = 'available' and 24h lifespan elapsed) from Purelymail.
 * 3. Purges all genuinely expired addresses (status = 'expired') from Purelymail.
 * 4. Replenishes the available standby pool back to target size.
 *
 * NOTE: User-generated temp mail and personal temp mail have their own countdown timers (expires_at)
 * and are NEVER purged prematurely while their timer is running!
 */
export async function cyclePoolMaintenance(lifespanHours = 24) {
  // 1. Expire any active addresses (public or personal) whose countdown timer has genuinely finished
  await expireAddresses();

  // 2. Cycle stale UNCLAIMED pool addresses that have sat unclaimed for their full lifespan (24 hours)
  const stalePoolRes = await query(`
    SELECT id, address FROM temp_addresses
    WHERE tier = 'public' AND status = 'available' AND expires_at <= NOW()
  `);

  let purged = 0;
  for (const row of stalePoolRes.rows) {
    try {
      await deleteUser(row.address);
      await query('DELETE FROM temp_addresses WHERE id = $1', [row.id]);
      purged++;
    } catch (err) {
      logger.error({ err: err.message, address: row.address }, 'Failed cycling stale pool address');
    }
  }

  // 3. Purge all addresses that have transitioned to 'expired' from Purelymail and database
  const purgedExpired = await purgeExpired();
  purged += purgedExpired;

  if (purged > 0) {
    logger.info({ purged }, 'Pool Maintenance Cleaner: purged stale pool & expired addresses from Purelymail');
  }

  // 4. Replenish available standby pool back to target size with fresh accounts
  const replenished = await replenishPool(lifespanHours);
  return { purged, replenished };
}

/**
 * Claim an address from the pool for a new public temp mail session.
 * If no custom handle is requested, claims directly from the pre-warmed pool (<5ms latency).
 * If a custom handle is requested, provisions a dedicated user-generated mailbox on-demand.
 * @param {string} ipAddress - Client IP for rate limiting
 * @param {number} expiryHours - Requested expiry in hours (default 24h)
 * @param {string|null} customUsername - Optional custom username
 * @param {string|null} customDomain - Optional custom domain
 * @returns {Promise<object>} The claimed temp address record
 */
export async function claimAddress(ipAddress, expiryHours = 24, customUsername = null, customDomain = null) {
  // Check max expiry
  const maxExpirySetting = await query("SELECT value FROM settings WHERE key = 'temp_public_max_expiry_hours'");
  const maxExpiry = parseInt(maxExpirySetting.rows[0]?.value, 10) || 72;
  const clampedExpiry = Math.min(Math.max(1, expiryHours), maxExpiry);

  const defaultTempDomain = process.env.DOMAIN_TEMP || 'mail.wox.world';
  const permanentDomain = process.env.DOMAIN_PERMANENT || 'wox.world';
  
  let targetDomain = defaultTempDomain;
  if (customDomain) {
    const cleanD = customDomain.toLowerCase().replace(/^@/, '').trim();
    if (cleanD === 'wox.world' || cleanD === permanentDomain) {
      targetDomain = permanentDomain;
    } else if (cleanD === 'mail.wox.world' || cleanD === defaultTempDomain) {
      targetDomain = defaultTempDomain;
    }
  }

  const cleanCustom = customUsername ? customUsername.toLowerCase().replace(/[^a-z0-9]/g, '').slice(0, 30) : null;
  const isCustomUserGenerated = Boolean(cleanCustom && cleanCustom.length >= 3);
  const isCustomDomain = targetDomain !== defaultTempDomain;

  // 1. If NO custom handle and NO custom domain is requested, claim directly from the pre-warmed standby pool!
  if (!isCustomUserGenerated && !isCustomDomain) {
    const poolRes = await query(`
      SELECT id, address, imap_password FROM temp_addresses
      WHERE tier = 'public' AND status = 'available'
      ORDER BY created_at ASC
      LIMIT 1
      FOR UPDATE SKIP LOCKED
    `);

    if (poolRes.rows.length > 0) {
      const poolRow = poolRes.rows[0];
      const sessionToken = generateToken(24);
      const activeRes = await query(`
        UPDATE temp_addresses
        SET status = 'active',
            session_token = $1,
            ip_address = $2,
            activated_at = NOW(),
            last_accessed = NOW(),
            expires_at = NOW() + (INTERVAL '1 hour' * $3),
            custom_username = NULL
        WHERE id = $4
        RETURNING *
      `, [sessionToken, ipAddress, clampedExpiry, poolRow.id]);

      // Replenish standby pool in background if below target
      replenishPool(24).catch((err) => {
        logger.debug({ err: err.message }, 'Background pool replenishment check');
      });

      // Dispatch welcome email in background
      sendWoxWelcomeEmail(poolRow.address, { isTemp: true }).catch((err) => {
        logger.debug({ err: err.message, address: poolRow.address }, 'Background welcome email error');
      });

      return {
        ...activeRes.rows[0],
        source: 'pool',
        isCustom: false,
        expiryHours: clampedExpiry,
      };
    }
  }

  // 2. User-Generated Custom On-Demand Address (or custom domain)
  const username = isCustomUserGenerated ? cleanCustom : generateRandomUsername();
  const address = `${username}@${targetDomain}`;
  const password = generateToken(16);
  const sessionToken = generateToken(24);

  // Provision dedicated mailbox on Purelymail
  try {
    await createUser(address, password);
    logger.info({ address, isCustom: isCustomUserGenerated, domain: targetDomain }, 'Created user-generated temp mailbox in Purelymail');
  } catch (err) {
    logger.warn({ err: err.message, address }, 'Purelymail user creation note');
  }

  const result = await query(`
    INSERT INTO temp_addresses (
      address, tier, status, session_token, ip_address, expires_at, activated_at, last_accessed, imap_password, custom_username
    )
    VALUES (
      $1, 'public', 'active', $2, $3, NOW() + (INTERVAL '1 hour' * $4), NOW(), NOW(), $5, $6
    )
    ON CONFLICT (address) DO UPDATE
    SET status = 'active', session_token = $2, expires_at = NOW() + (INTERVAL '1 hour' * $4), imap_password = $5, last_accessed = NOW(), custom_username = $6
    RETURNING *
  `, [address, sessionToken, ipAddress, clampedExpiry, password, isCustomUserGenerated ? cleanCustom : null]);

  // Dispatch welcome email
  sendWoxWelcomeEmail(address, { isTemp: true }).catch((err) => {
    logger.debug({ err: err.message, address }, 'Background welcome email error');
  });

  return {
    ...result.rows[0],
    source: 'user_generated',
    isCustom: isCustomUserGenerated,
    expiryHours: clampedExpiry,
  };
}

/**
 * Expire all temp addresses past their expiry time.
 * @returns {Promise<number>} Number of addresses expired
 */
export async function expireAddresses() {
  const result = await query(`
    UPDATE temp_addresses
    SET status = 'expired'
    WHERE status = 'active' AND expires_at <= NOW()
    RETURNING id, address
  `);

  if (result.rows.length > 0) {
    logger.info({ count: result.rows.length }, 'Expired temp addresses');
  }

  return result.rows.length;
}

/**
 * Purge expired addresses — delete from Purelymail and clean database.
 * @returns {Promise<number>}
 */
export async function purgeExpired() {
  const expired = await query(`
    SELECT id, address FROM temp_addresses
    WHERE status = 'expired'
    LIMIT 100
  `);

  let purged = 0;
  for (const row of expired.rows) {
    try {
      await deleteUser(row.address);
      await query('DELETE FROM temp_addresses WHERE id = $1', [row.id]);
      purged++;
    } catch (err) {
      logger.error({ err: err.message, address: row.address }, 'Failed to purge address from Purelymail');
    }
  }

  return purged;
}

export default {
  getPoolStats,
  replenishPool,
  purgeAllTempPoolAndRecreate,
  cyclePoolMaintenance,
  claimAddress,
  expireAddresses,
  purgeExpired,
};
