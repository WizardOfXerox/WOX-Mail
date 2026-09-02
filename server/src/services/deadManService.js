import crypto from 'crypto';
import { query } from '../config/database.js';
import { createTransporter, sendEmail } from './smtp.js';
import pino from 'pino';

const logger = pino({ name: 'woxmail:dead-man' });

/**
 * Get Dead Man's Switch status for user
 */
export async function getDeadManSwitch(userId) {
  const result = await query(
    'SELECT * FROM dead_man_switches WHERE user_id = $1',
    [userId]
  );
  if (result.rows.length === 0) {
    return {
      enabled: false,
      intervalDays: 90,
      status: 'disabled',
      lastCheckin: new Date(),
      beneficiaryEmails: [],
      finalInstructions: '',
    };
  }
  const row = result.rows[0];
  return {
    id: row.id,
    enabled: row.enabled,
    intervalDays: row.interval_days,
    lastCheckin: row.last_checkin,
    warningSentAt: row.warning_sent_at,
    status: row.status,
    finalSubject: row.final_subject,
    finalInstructions: row.final_instructions,
    beneficiaryEmails: row.beneficiary_emails || [],
    triggeredAt: row.triggered_at,
  };
}

/**
 * Configure / update Dead Man's Switch
 */
export async function updateDeadManSwitch(userId, {
  enabled = false,
  intervalDays = 90,
  finalSubject = 'Emergency Digital Inheritance & Last Instructions',
  finalInstructions = '',
  beneficiaryEmails = [],
}) {
  const token = crypto.randomBytes(24).toString('hex');
  const validInterval = Math.max(7, Math.min(365, parseInt(intervalDays, 10) || 90));
  const validBeneficiaries = (beneficiaryEmails || [])
    .map(e => e.trim().toLowerCase())
    .filter(e => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(e));

  const result = await query(
    `INSERT INTO dead_man_switches (
       user_id, enabled, interval_days, last_checkin, status,
       final_subject, final_instructions, beneficiary_emails, checkin_token
     ) VALUES ($1, $2, $3, NOW(), $4, $5, $6, $7, $8)
     ON CONFLICT (user_id) DO UPDATE SET
       enabled = $2,
       interval_days = $3,
       final_subject = $5,
       final_instructions = $6,
       beneficiary_emails = $7,
       status = CASE WHEN $2 = TRUE AND dead_man_switches.status = 'disabled' THEN 'active' ELSE dead_man_switches.status END,
       updated_at = NOW()
     RETURNING *`,
    [
      userId,
      enabled,
      validInterval,
      enabled ? 'active' : 'disabled',
      finalSubject,
      finalInstructions,
      validBeneficiaries,
      token,
    ]
  );

  return result.rows[0];
}

/**
 * Check-in heartbeat signal
 */
export async function checkin(userId) {
  const token = crypto.randomBytes(24).toString('hex');
  const result = await query(
    `UPDATE dead_man_switches SET
       last_checkin = NOW(),
       status = CASE WHEN enabled THEN 'active' ELSE 'disabled' END,
       warning_sent_at = NULL,
       checkin_token = $2,
       updated_at = NOW()
     WHERE user_id = $1
     RETURNING *`,
    [userId, token]
  );

  if (result.rows.length === 0) {
    await query(
      `INSERT INTO dead_man_switches (user_id, enabled, interval_days, last_checkin, status, checkin_token)
       VALUES ($1, FALSE, 90, NOW(), 'disabled', $2)`,
      [userId, token]
    );
  }

  return { success: true, message: 'Heartbeat check-in recorded successfully. Clock reset.' };
}

/**
 * Process Dead Man switches in background cron job
 */
export async function processDeadManSwitches() {
  const adminEmail = process.env.ADMIN_EMAIL;
  const adminPass = (process.env.ADMIN_PASSWORD || '').replace(/^['"]|['"]$/g, '');
  if (!adminEmail || !adminPass) return;
  const transporter = createTransporter(adminEmail, adminPass);
  const baseUrl = process.env.BASE_URL || process.env.APP_URL || 'https://mail.wox.world';

  // 1. Find switches needing a 7-day warning
  const warningCandidates = await query(`
    SELECT dms.*, u.email as user_email, u.username
    FROM dead_man_switches dms
    JOIN users u ON u.id = dms.user_id
    WHERE dms.enabled = TRUE
      AND dms.status = 'active'
      AND dms.last_checkin + (dms.interval_days * INTERVAL '1 day') - INTERVAL '7 days' <= NOW()
  `);

  for (const row of warningCandidates.rows) {
    try {
      const checkinUrl = `${baseUrl}/api/deadman/ping/${row.checkin_token}`;
      const warningHtml = `
        <!DOCTYPE html>
        <html>
        <body style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif; background: #0f0f1a; color: #f0f0f5; padding: 24px;">
          <div style="max-width: 560px; margin: 0 auto; background: #1a1a2e; border: 1px solid #eab308; border-radius: 16px; padding: 32px;">
            <div style="font-size: 13px; font-weight: 700; color: #eab308; text-transform: uppercase;">⚠️ Dead Man's Switch Check-in Reminder</div>
            <h2 style="color: #ffffff; margin: 12px 0;">Are you okay, ${row.username}?</h2>
            <p style="color: #9898b0; line-height: 1.6;">
              Your configured Dead Man's Switch check-in interval (${row.interval_days} days) will elapse in <strong>7 days</strong>.
              If no check-in is received, your pre-configured digital inheritance instructions will be automatically released to your designated beneficiaries.
            </p>
            <div style="text-align: center; margin: 24px 0;">
              <a href="${checkinUrl}" style="background: #22c55e; color: #ffffff; text-decoration: none; padding: 14px 28px; border-radius: 9999px; font-weight: 700; display: inline-block;">
                💚 I am Alive — Reset Timer
              </a>
            </div>
            <p style="font-size: 12px; color: #6868a0;">Clicking the button immediately confirms your status and resets your timer for another ${row.interval_days} days.</p>
          </div>
        </body>
        </html>
      `;

      await sendEmail(transporter, {
        from: `WoxMail Security <${adminEmail}>`,
        to: row.user_email,
        subject: `⚠️ Dead Man's Switch: Action Required within 7 Days`,
        html: warningHtml,
      });

      await query(
        `UPDATE dead_man_switches SET status = 'warning', warning_sent_at = NOW(), updated_at = NOW() WHERE id = $1`,
        [row.id]
      );
      logger.info({ userId: row.user_id }, 'Sent Dead Man switch 7-day warning email');
    } catch (err) {
      logger.error({ userId: row.user_id, err: err.message }, 'Failed sending dead man warning');
    }
  }

  // 2. Find switches that have timed out and need triggering
  const triggerCandidates = await query(`
    SELECT dms.*, u.email as user_email, u.username
    FROM dead_man_switches dms
    JOIN users u ON u.id = dms.user_id
    WHERE dms.enabled = TRUE
      AND dms.status IN ('active', 'warning')
      AND dms.last_checkin + (dms.interval_days * INTERVAL '1 day') <= NOW()
  `);

  for (const row of triggerCandidates.rows) {
    try {
      const beneficiaries = row.beneficiary_emails || [];
      if (beneficiaries.length > 0 && row.final_instructions) {
        const releaseHtml = `
          <!DOCTYPE html>
          <html>
          <body style="font-family: Georgia, serif; background: #0f0f1a; color: #f0f0f5; padding: 24px; line-height: 1.7;">
            <div style="max-width: 600px; margin: 0 auto; background: #1a1a2e; border: 1px solid #2a2a4a; border-radius: 16px; padding: 36px;">
              <div style="font-size: 12px; font-weight: 700; color: #8b5cf6; text-transform: uppercase; letter-spacing: 0.05em; margin-bottom: 12px;">
                🏛️ Digital Inheritance & Emergency Capsule
              </div>
              <h1 style="font-size: 22px; color: #ffffff; margin-bottom: 16px;">${row.final_subject}</h1>
              <p style="color: #9898b0; font-size: 14px;">
                This message was pre-configured by <strong>${row.username} (${row.user_email})</strong> via the WoxMail Dead Man's Switch system.
                The switch has triggered following ${row.interval_days} days of inactivity.
              </p>
              <div style="background: #141425; border: 1px solid #252548; border-radius: 12px; padding: 24px; margin: 24px 0; color: #e4e4f0; white-space: pre-wrap;">
                ${row.final_instructions.replace(/</g, '&lt;').replace(/>/g, '&gt;')}
              </div>
              <div style="font-size: 12px; color: #6868a0; text-align: center;">
                Delivered securely via WoxMail Digital Inheritance Vault
              </div>
            </div>
          </body>
          </html>
        `;

        for (const recipient of beneficiaries) {
          await sendEmail(transporter, {
            from: `WoxVault <${adminEmail}>`,
            to: recipient,
            subject: `🏛️ ${row.final_subject} (from ${row.username})`,
            html: releaseHtml,
          });
        }
      }

      await query(
        `UPDATE dead_man_switches SET status = 'triggered', triggered_at = NOW(), updated_at = NOW() WHERE id = $1`,
        [row.id]
      );
      logger.info({ userId: row.user_id }, 'Dead Man switch triggered and released instructions to beneficiaries');
    } catch (err) {
      logger.error({ userId: row.user_id, err: err.message }, 'Failed triggering dead man switch');
    }
  }
}
