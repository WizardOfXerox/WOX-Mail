/**
 * @fileoverview Cleanup service — manages temp address lifecycle transitions.
 * ACTIVE → EXPIRED → PURGING → QUARANTINE
 */

import { query } from '../config/database.js';
import { deleteUser } from './purelymail.js';

/**
 * Expire active addresses past their expiry time.
 * ACTIVE → EXPIRED
 * @returns {Promise<number>} Number of expired addresses
 */
export async function expireAddresses() {
  const result = await query(
    `UPDATE temp_addresses
     SET status = 'expired'
     WHERE status = 'active' AND expires_at < NOW()
     RETURNING id, address`
  );
  return result.rowCount;
}

/**
 * Purge expired addresses — delete from Purelymail and remove record.
 * @returns {Promise<number>} Number of purged addresses
 */
export async function purgeExpired() {
  const expired = await query(
    `SELECT id, address FROM temp_addresses
     WHERE status = 'expired'
     LIMIT 100`
  );

  let purged = 0;

  for (const row of expired.rows) {
    try {
      await deleteUser(row.address);
      await query('DELETE FROM temp_addresses WHERE id = $1', [row.id]);
      purged++;
    } catch (err) {
      console.error(`Failed to purge ${row.address} from Purelymail:`, err.message);
    }
  }

  return purged;
}

/**
 * Release quarantined addresses back to available pool.
 * QUARANTINE (past quarantine_until) → AVAILABLE
 * @returns {Promise<number>} Number of released addresses
 */
export async function releaseQuarantined() {
  const result = await query(
    `UPDATE temp_addresses
     SET status = 'available', password_hash = NULL, session_token = NULL,
         custom_username = NULL, ip_address = NULL, message_count = 0,
         activated_at = NULL, expires_at = NULL, purged_at = NULL,
         quarantine_until = NULL, last_accessed = NULL
     WHERE status = 'quarantine' AND quarantine_until < NOW()
     RETURNING id`
  );
  return result.rowCount;
}

/**
 * Purge permanent user accounts that exceeded their 14-day deletion grace period.
 */
export async function purgeScheduledAccountDeletions() {
  const expired = await query(
    `SELECT id, email, username FROM users
     WHERE deletion_scheduled_at IS NOT NULL
       AND deletion_scheduled_at <= NOW()`
  );

  let purged = 0;
  for (const user of expired.rows) {
    try {
      // 1. Delete from Purelymail if domain matches
      const domainPerm = process.env.DOMAIN_PERMANENT || 'wox.world';
      if (user.email && (user.email.endsWith(`@${domainPerm}`) || user.email.endsWith('@mail.wox.world'))) {
        try {
          await deleteUser(user.email);
        } catch (pmErr) {
          console.warn(`[Cleanup] Purelymail delete notice for ${user.email}:`, pmErr.message);
        }
      }

      // 2. Cascade delete dependent user data
      await query('DELETE FROM user_sessions WHERE user_id = $1', [user.id]);
      await query('DELETE FROM personal_api_keys WHERE user_id = $1', [user.id]);
      await query('DELETE FROM app_passwords WHERE user_id = $1', [user.id]);
      await query('DELETE FROM user_passkeys WHERE user_id = $1', [user.id]);
      await query('DELETE FROM user_notes WHERE user_id = $1', [user.id]);
      await query('DELETE FROM email_templates WHERE user_id = $1', [user.id]);
      await query('DELETE FROM aliases WHERE user_id = $1', [user.id]);
      await query('DELETE FROM contacts WHERE user_id = $1', [user.id]);
      await query('DELETE FROM screener_rules WHERE user_id = $1', [user.id]);
      await query('DELETE FROM webhooks WHERE user_id = $1', [user.id]);
      await query('DELETE FROM calendar_events WHERE user_id = $1', [user.id]);
      await query('DELETE FROM outbox_emails WHERE user_id = $1', [user.id]);
      await query('DELETE FROM scheduled_emails WHERE user_id = $1', [user.id]);

      // 3. Delete user row
      await query('DELETE FROM users WHERE id = $1', [user.id]);

      // 4. Log audit entry
      await query(
        `INSERT INTO audit_log (actor_type, actor_id, action, details)
         VALUES ('system', $1, 'account_permanently_purged', $2)`,
        [String(user.id), JSON.stringify({ email: user.email, username: user.username })]
      );

      purged++;
    } catch (err) {
      console.error(`[Cleanup] Failed to purge user ${user.email}:`, err.message);
    }
  }

  return purged;
}

/**
 * Clean up old sessions, login history, and audit logs.
 */
export async function dailyCleanup() {
  // 1. Expire past-due temporary addresses and purge them from Purelymail
  try {
    await expireAddresses();
    await purgeExpired();
    await releaseQuarantined();
  } catch (err) {
    console.error('Error during temp address lifecycle cleanup:', err.message);
  }

  // 2. Purge permanent user accounts past their 14-day deletion grace period
  try {
    await purgeScheduledAccountDeletions();
  } catch (err) {
    console.error('Error during 14-day account purge cleanup:', err.message);
  }

  // 3. Revoke expired JWT sessions
  await query(
    `UPDATE user_sessions SET is_revoked = TRUE
     WHERE is_revoked = FALSE AND expires_at < NOW()`
  );

  // Delete login history older than 90 days
  await query(
    `DELETE FROM login_history WHERE created_at < NOW() - INTERVAL '90 days'`
  );

  // Delete audit log older than 1 year
  await query(
    `DELETE FROM audit_log WHERE created_at < NOW() - INTERVAL '365 days'`
  );

  // Delete expired announcements
  await query(
    `DELETE FROM announcements WHERE ends_at IS NOT NULL AND ends_at < NOW()`
  );

  // Unblock expired IPs
  await query(
    `DELETE FROM blocked_ips WHERE expires_at IS NOT NULL AND expires_at < NOW()`
  );
}

export default { expireAddresses, purgeExpired, releaseQuarantined, purgeScheduledAccountDeletions, dailyCleanup };
