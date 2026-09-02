/**
 * @fileoverview Analytics aggregation job.
 * Nightly rollup of raw events into daily/hourly/geo stats tables.
 */

import { query } from '../src/config/database.js';

/**
 * Aggregate daily stats for yesterday.
 * Runs nightly at 03:00.
 */
export async function aggregateDailyStats() {
  const yesterday = new Date();
  yesterday.setDate(yesterday.getDate() - 1);
  const date = yesterday.toISOString().slice(0, 10);

  try {
    // Count temp addresses created yesterday by tier
    const publicCreated = await query(
      `SELECT COUNT(*)::int as count FROM temp_addresses
       WHERE tier = 'public' AND created_at::date = $1`, [date]
    );
    const personalCreated = await query(
      `SELECT COUNT(*)::int as count FROM temp_addresses
       WHERE tier = 'personal' AND created_at::date = $1`, [date]
    );

    // Expired and deleted counts
    const tempExpired = await query(
      `SELECT COUNT(*)::int as count FROM temp_addresses
       WHERE status = 'expired' AND expires_at::date = $1`, [date]
    );

    // Permanent user registrations
    const permRegistered = await query(
      `SELECT COUNT(*)::int as count FROM users
       WHERE created_at::date = $1 AND is_admin = FALSE`, [date]
    );

    // Login stats
    const loginAttempts = await query(
      `SELECT COUNT(*)::int as total,
              COUNT(*) FILTER (WHERE success = FALSE)::int as failures
       FROM login_history WHERE created_at::date = $1`, [date]
    );

    // Service blocks
    const serviceBlocks = await query(
      `SELECT COUNT(*)::int as count FROM audit_log
       WHERE action = 'service_blocked' AND created_at::date = $1`, [date]
    );

    // Unique IPs
    const uniqueIps = await query(
      `SELECT COUNT(DISTINCT ip_address)::int as count FROM audit_log
       WHERE created_at::date = $1`, [date]
    );

    // Upsert daily stats matching migration 003 schema
    await query(
      `INSERT INTO daily_stats (date, temp_public_created, temp_personal_created,
       temp_expired, permanent_signups, logins, failed_logins,
       blocked_services, unique_ips)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
       ON CONFLICT (date) DO UPDATE SET
         temp_public_created = EXCLUDED.temp_public_created,
         temp_personal_created = EXCLUDED.temp_personal_created,
         temp_expired = EXCLUDED.temp_expired,
         permanent_signups = EXCLUDED.permanent_signups,
         logins = EXCLUDED.logins,
         failed_logins = EXCLUDED.failed_logins,
         blocked_services = EXCLUDED.blocked_services,
         unique_ips = EXCLUDED.unique_ips`,
      [
        date,
        parseInt(publicCreated.rows[0].count, 10),
        parseInt(personalCreated.rows[0].count, 10),
        parseInt(tempExpired.rows[0].count, 10),
        parseInt(permRegistered.rows[0].count, 10),
        parseInt(loginAttempts.rows[0].total, 10),
        parseInt(loginAttempts.rows[0].failures, 10),
        parseInt(serviceBlocks.rows[0].count, 10),
        parseInt(uniqueIps.rows[0].count, 10),
      ]
    );

    console.log(`[Analytics] Daily stats aggregated for ${date}`);
  } catch (err) {
    console.error('[Analytics] Daily aggregation failed:', err.message);
  }
}

/**
 * Aggregate hourly stats.
 * Can be called multiple times per day for real-time-ish metrics.
 */
export async function aggregateHourlyStats() {
  const now = new Date();
  now.setMinutes(0, 0, 0);
  const hourTimestamp = now.toISOString();

  try {
    const tempCreated = await query(
      `SELECT COUNT(*)::int as count FROM temp_addresses
       WHERE created_at >= date_trunc('hour', NOW()) AND created_at < date_trunc('hour', NOW()) + INTERVAL '1 hour'`
    );

    await query(
      `INSERT INTO hourly_stats (hour, temp_created)
       VALUES ($1, $2)
       ON CONFLICT (hour) DO UPDATE SET
         temp_created = EXCLUDED.temp_created`,
      [hourTimestamp, parseInt(tempCreated.rows[0].count, 10)]
    );
  } catch (err) {
    console.error('[Analytics] Hourly aggregation failed:', err.message);
  }
}

/**
 * Run full nightly aggregation.
 */
export async function runNightlyAggregation() {
  await aggregateDailyStats();
  await aggregateHourlyStats();
}

export default { aggregateDailyStats, aggregateHourlyStats, runNightlyAggregation };
