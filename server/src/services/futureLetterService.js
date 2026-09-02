import crypto from 'crypto';
import { query } from '../config/database.js';
import { createTransporter, sendEmail } from './smtp.js';
import * as complianceArchiveService from './complianceArchiveService.js';
import { hashPassword, verifyPassword, encryptPayload, decryptPayload } from '../utils/crypto.js';
import pino from 'pino';

const logger = pino({ name: 'woxmail:future-letters' });

/**
 * Calculate human-readable time difference (e.g., "1 year ago", "3 years ago")
 */
function getHumanTimeAgo(fromDate, toDate = new Date()) {
  const diffMs = toDate - fromDate;
  const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));
  const diffMonths = Math.floor(diffDays / 30.4375);
  const diffYears = Math.floor(diffDays / 365.25);

  if (diffYears >= 1) return `${diffYears} year${diffYears > 1 ? 's' : ''} ago`;
  if (diffMonths >= 1) return `${diffMonths} month${diffMonths > 1 ? 's' : ''} ago`;
  if (diffDays >= 1) return `${diffDays} day${diffDays > 1 ? 's' : ''} ago`;
  return 'earlier';
}

/**
 * Create and register a letter to the future
 */
export async function createFutureLetter({
  userId = null,
  senderEmail,
  recipientEmail,
  subject,
  body,
  deliveryDate,
  deliveryPreset = '1y',
  visibility = 'private',
  category = 'General',
  sendToSelf = true,
  isLocked = false,
  passcode = null,
}) {
  const targetDate = new Date(deliveryDate);
  if (isNaN(targetDate.getTime()) || targetDate <= new Date()) {
    throw new Error('Delivery date must be a valid date in the future');
  }

  const cleanSubject = (subject || 'A letter from the past').trim();
  const cleanBody = (body || '').trim();
  const wordCount = cleanBody.split(/\s+/).filter(Boolean).length;
  const finalRecipient = sendToSelf ? senderEmail.trim().toLowerCase() : (recipientEmail || senderEmail).trim().toLowerCase();

  const isAuthed = Boolean(userId);
  const verificationToken = isAuthed ? null : crypto.randomBytes(24).toString('hex');
  const verified = isAuthed;
  const status = isAuthed ? 'scheduled' : 'pending_verification';

  let passcodeHash = null;
  let encryptedBody = null;
  let storedBody = cleanBody;

  if (isLocked && passcode && passcode.trim()) {
    passcodeHash = await hashPassword(passcode.trim());
    encryptedBody = encryptPayload(cleanBody, passcode.trim());
    storedBody = cleanBody; // Retained for scheduled dispatcher or sealed preview
  }

  const result = await query(
    `INSERT INTO future_letters (
       user_id, sender_email, recipient_email, subject, body,
       send_to_self, delivery_date, delivery_preset, visibility,
       verification_token, verified, status, category, word_count,
       is_locked, passcode_hash, encrypted_body
     ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17)
     RETURNING id, sender_email, recipient_email, subject, delivery_date, delivery_preset, visibility, status, is_locked, created_at`,
    [
      userId,
      senderEmail.trim().toLowerCase(),
      finalRecipient,
      cleanSubject,
      storedBody,
      sendToSelf,
      targetDate,
      deliveryPreset,
      visibility,
      verificationToken,
      verified,
      status,
      category,
      wordCount,
      Boolean(isLocked && passcodeHash),
      passcodeHash,
      encryptedBody,
    ]
  );

  const letter = result.rows[0];
  const baseUrl = process.env.BASE_URL || process.env.APP_URL || 'https://mail.wox.world';

  // If unauthenticated guest, dispatch verification email
  if (!isAuthed && verificationToken) {
    const verifyUrl = `${baseUrl}/futureme/verify/${verificationToken}`;
    const verificationHtml = `
      <!DOCTYPE html>
      <html>
      <head>
        <meta charset="utf-8">
        <style>
          body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; background: #0f0f1a; color: #f0f0f5; padding: 24px; }
          .card { max-width: 560px; margin: 0 auto; background: #1a1a2e; border: 1px solid #2a2a4a; border-radius: 16px; padding: 32px; }
          .btn { display: inline-block; background: #7c3aed; color: #ffffff !important; text-decoration: none; padding: 14px 28px; border-radius: 9999px; font-weight: 600; font-size: 15px; margin: 20px 0; }
        </style>
      </head>
      <body>
        <div class="card">
          <h2>⏳ Confirm Your Letter to the Future</h2>
          <p>You wrote a letter scheduled for delivery on <strong>${targetDate.toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' })}</strong>.</p>
          <p style="color: #9898b0;">Please confirm your email address so our time capsule vault can seal and preserve your letter until delivery day.</p>
          <div style="text-align: center;">
            <a href="${verifyUrl}" class="btn">🚀 Verify & Seal Letter</a>
          </div>
          <p style="font-size: 12px; color: #6868a0;">If you didn't write this letter, you can safely ignore this email.</p>
        </div>
      </body>
      </html>
    `;

    (async () => {
      try {
        const adminEmail = process.env.ADMIN_EMAIL;
        const adminPass = (process.env.ADMIN_PASSWORD || '').replace(/^['"]|['"]$/g, '');
        const systemSender = process.env.FUTUREME_EMAIL || process.env.NO_REPLY_EMAIL || process.env.ADMIN_EMAIL || 'noreply@wox.world';
        if (adminEmail && adminPass) {
          const transporter = createTransporter(adminEmail, adminPass);
          await sendEmail(transporter, {
            from: `FutureMe Time Capsule <${systemSender}>`,
            to: senderEmail,
            subject: '⏳ Please Confirm Your Letter to the Future',
            html: verificationHtml,
          });
          logger.info({ letterId: letter.id, senderEmail, sender: systemSender }, 'Sent future letter verification email');
        }
      } catch (err) {
        logger.error({ err: err.message }, 'Failed sending future letter verification email');
      }
    })();
  }

  return {
    ...letter,
    requiresVerification: !isAuthed,
  };
}

/**
 * Verify a guest's letter to the future
 */
export async function verifyFutureLetter(token) {
  const result = await query(
    `UPDATE future_letters SET
       verified = TRUE,
       status = 'scheduled',
       verification_token = NULL,
       updated_at = NOW()
     WHERE verification_token = $1 AND status = 'pending_verification'
     RETURNING id, sender_email, recipient_email, subject, delivery_date, delivery_preset, status`,
    [token]
  );

  if (result.rows.length === 0) {
    return { error: 'invalid_token', message: 'Verification link is invalid or already verified' };
  }

  return result.rows[0];
}

/**
 * Background worker to deliver all due future letters
 */
export async function deliverDueLetters() {
  const result = await query(
    `SELECT * FROM future_letters
     WHERE status = 'scheduled' AND verified = TRUE AND delivery_date <= NOW()
     ORDER BY delivery_date ASC
     LIMIT 25`
  );

  let deliveredCount = 0;
  for (const letter of result.rows) {
    try {
      await sendSingleLetter(letter);
      deliveredCount++;
    } catch (err) {
      logger.error({ letterId: letter.id, err: err.message }, 'Failed delivering future letter');
    }
  }

  return deliveredCount;
}

/**
 * Helper to dispatch a single future letter via SMTP
 */
export async function sendSingleLetter(letter) {
  const adminEmail = process.env.ADMIN_EMAIL;
  const adminPass = (process.env.ADMIN_PASSWORD || '').replace(/^['"]|['"]$/g, '');
  if (!adminEmail || !adminPass) throw new Error('SMTP administrator credentials not configured');
  const transporter = createTransporter(adminEmail, adminPass);

  const writtenDate = new Date(letter.created_at);
  const timeAgo = getHumanTimeAgo(writtenDate, new Date());
  const writtenDateStr = writtenDate.toLocaleDateString('en-US', {
    month: 'long',
    day: 'numeric',
    year: 'numeric',
  });

  const deliveryHtml = `
    <!DOCTYPE html>
    <html>
    <head>
      <meta charset="utf-8">
      <style>
        body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; background: #0f0f1a; color: #f0f0f5; padding: 24px; line-height: 1.6; }
        .container { max-width: 600px; margin: 0 auto; background: #1a1a2e; border: 1px solid #2a2a4a; border-radius: 20px; padding: 36px; box-shadow: 0 10px 30px rgba(0,0,0,0.5); }
        .header-badge { display: inline-flex; align-items: center; gap: 6px; background: rgba(124, 58, 237, 0.2); color: #a78bfa; padding: 6px 14px; border-radius: 9999px; font-size: 13px; font-weight: 700; text-transform: uppercase; letter-spacing: 0.05em; margin-bottom: 16px; }
        .letter-title { font-size: 24px; font-weight: 800; color: #ffffff; margin: 0 0 8px 0; }
        .meta-bar { font-size: 14px; color: #9898b0; margin-bottom: 24px; padding-bottom: 16px; border-bottom: 1px solid #2a2a4a; }
        .letter-content { font-size: 16px; color: #e4e4f0; white-space: pre-wrap; background: #141425; border: 1px solid #252548; border-radius: 12px; padding: 24px; margin: 20px 0; font-family: Georgia, serif; line-height: 1.8; }
        .cta-box { text-align: center; margin-top: 32px; padding-top: 24px; border-top: 1px solid #2a2a4a; }
        .btn { display: inline-block; background: #7c3aed; color: #ffffff !important; text-decoration: none; padding: 12px 24px; border-radius: 9999px; font-weight: 600; font-size: 14px; }
        .footer { font-size: 12px; color: #6868a0; text-align: center; margin-top: 24px; }
      </style>
    </head>
    <body>
      <div class="container">
        <div class="header-badge">⏳ Time Capsule Unsealed</div>
        <h1 class="letter-title">${letter.subject}</h1>
        <div class="meta-bar">
          Written by <strong>${letter.sender_email}</strong> on <strong>${writtenDateStr}</strong> (${timeAgo})
        </div>

        <div class="letter-content">${(letter.body || '').replace(/</g, '&lt;').replace(/>/g, '&gt;')}</div>

        <div class="cta-box">
          <p style="font-size: 14px; color: #9898b0; margin-bottom: 16px;">
            How did your goals, predictions, and life turn out? Write your next letter to the future now.
          </p>
          <a href="${process.env.BASE_URL || process.env.APP_URL || 'https://mail.wox.world'}/futureme" class="btn">
            ✍️ Write a Letter Back to the Future
          </a>
        </div>

        <div class="footer">
          Sent via WoxFuture Time Capsule Service • WoxMail Privacy Suite
        </div>
      </div>
    </body>
    </html>
  `;

  const systemSender = process.env.FUTUREME_EMAIL || process.env.NO_REPLY_EMAIL || process.env.ADMIN_EMAIL || 'noreply@wox.world';
  const fromHeader = `FutureMe Time Capsule <${systemSender}>`;

  await sendEmail(transporter, {
    from: fromHeader,
    to: letter.recipient_email,
    subject: `⏳ A Letter From Your Past Self: ${letter.subject}`,
    html: deliveryHtml,
  });

  // Record outbound FutureMe delivery to Compliance Archive
  complianceArchiveService.archiveEmail({
    direction: 'outbound',
    mailboxOwnerEmail: systemSender,
    senderAddress: systemSender,
    senderName: 'FutureMe Time Capsule',
    recipientAddresses: [letter.recipient_email],
    subject: `⏳ A Letter From Your Past Self: ${letter.subject}`,
    bodyHtml: deliveryHtml,
    bodyText: letter.body || '',
    provider: 'woxmail',
    sentOrReceivedAt: new Date(),
    messageId: `futureme-${letter.id}-${Date.now()}`,
  }).catch((err) => logger.warn({ err: err.message }, 'Failed to record FutureMe dispatch in compliance archive'));

  await query(
    `UPDATE future_letters SET
       status = 'delivered',
       delivered_at = NOW(),
       updated_at = NOW()
     WHERE id = $1`,
    [letter.id]
  );

  logger.info({ letterId: letter.id, to: letter.recipient_email, sender: systemSender }, 'Dispatched future letter via SMTP');
  return true;
}

/**
 * List public anonymous letters for community reflections feed
 */
export async function listPublicLetters({ category = 'all', page = 1, limit = 12 }) {
  const offset = (page - 1) * limit;
  const whereClauses = ["visibility = 'public_anonymous' AND status = 'delivered'"];
  const params = [];

  if (category && category !== 'all') {
    params.push(category);
    whereClauses.push(`category = $${params.length}`);
  }

  const whereSql = whereClauses.join(' AND ');

  const countResult = await query(`SELECT COUNT(*) as total FROM future_letters WHERE ${whereSql}`, params);
  const total = parseInt(countResult.rows[0]?.total || '0', 10);

  params.push(limit, offset);
  const result = await query(
    `SELECT id, subject, body, category, word_count, delivery_preset, created_at, delivered_at
     FROM future_letters
     WHERE ${whereSql}
     ORDER BY delivered_at DESC
     LIMIT $${params.length - 1} OFFSET $${params.length}`,
    params
  );

  return {
    letters: result.rows.map((row) => ({
      ...row,
      timeSpan: getHumanTimeAgo(new Date(row.created_at), new Date(row.delivered_at || new Date())),
      excerpt: row.body.length > 280 ? row.body.substring(0, 280) + '...' : row.body,
    })),
    pagination: {
      page,
      limit,
      total,
      totalPages: Math.ceil(total / limit) || 1,
    },
  };
}

/**
 * Get all scheduled letters for an authenticated user
 */
export async function getUserLetters(userId) {
  const result = await query(
    `SELECT id, sender_email, recipient_email, subject, body, delivery_date,
            delivery_preset, visibility, status, category, word_count,
            is_locked, delivered_at, created_at
     FROM future_letters
     WHERE user_id = $1
     ORDER BY delivery_date ASC`,
    [userId]
  );

  return result.rows.map((row) => {
    const isLockedAndPending = Boolean(row.is_locked && row.status !== 'delivered');
    return {
      ...row,
      body: isLockedAndPending ? '[ 🔒 Sealed Time Capsule — Protected with Passcode ]' : row.body,
      isSealed: isLockedAndPending,
    };
  });
}

/**
 * Unlock and peek at a user's passcode-protected letter
 */
export async function unlockUserLetter(letterId, userId, passcode) {
  const result = await query(
    `SELECT id, body, is_locked, passcode_hash, encrypted_body, status, delivery_date
     FROM future_letters
     WHERE id = $1 AND user_id = $2`,
    [letterId, userId]
  );

  if (result.rows.length === 0) {
    return { error: 'not_found', message: 'Letter not found in your vault' };
  }

  const letter = result.rows[0];
  if (!letter.is_locked || letter.status === 'delivered') {
    return { success: true, body: letter.body };
  }

  if (!passcode) {
    return { error: 'passcode_required', message: 'Passcode is required to unlock this time capsule' };
  }

  const isValid = await verifyPassword(letter.passcode_hash, passcode.trim());
  if (!isValid) {
    return { error: 'invalid_passcode', message: 'Incorrect passcode. Access denied.' };
  }

  if (letter.encrypted_body) {
    const decrypted = decryptPayload(letter.encrypted_body, passcode.trim());
    return { success: true, body: decrypted || letter.body };
  }

  return { success: true, body: letter.body };
}

/**
 * Cancel a user's scheduled letter
 */
export async function cancelUserLetter(letterId, userId) {
  const result = await query(
    `UPDATE future_letters SET
       status = 'cancelled',
       cancelled_at = NOW(),
       updated_at = NOW()
     WHERE id = $1 AND user_id = $2 AND status = 'scheduled'
     RETURNING id`,
    [letterId, userId]
  );

  if (result.rows.length === 0) {
    return { error: 'not_found', message: 'Letter not found or cannot be cancelled' };
  }

  return { success: true, message: 'Letter cancelled successfully' };
}

/**
 * Global FutureMe telemetry stats
 */
export async function getFutureStats() {
  const res = await query(`
    SELECT
      COUNT(*) FILTER (WHERE status = 'scheduled') as scheduled_count,
      COUNT(*) FILTER (WHERE status = 'delivered') as delivered_count,
      COALESCE(SUM(word_count), 0) as total_words,
      COUNT(*) FILTER (WHERE visibility = 'public_anonymous' AND status = 'delivered') as public_count
    FROM future_letters
  `);

  const row = res.rows[0];
  return {
    scheduled: parseInt(row.scheduled_count, 10),
    delivered: parseInt(row.delivered_count, 10),
    totalWords: parseInt(row.total_words, 10),
    publicCount: parseInt(row.public_count, 10),
  };
}

// ═════════════════════════════════════════════════════════
// ADMIN MANAGEMENT SUITE
// ═════════════════════════════════════════════════════════

/**
 * Admin: List all future letters with search, filter, and pagination
 */
export async function getAdminFutureLetters({ page = 1, limit = 20, status = 'all', search = '', category = 'all' }) {
  const offset = (page - 1) * limit;
  const whereClauses = [];
  const params = [];

  if (status && status !== 'all') {
    params.push(status);
    whereClauses.push(`fl.status = $${params.length}`);
  }

  if (category && category !== 'all') {
    params.push(category);
    whereClauses.push(`fl.category = $${params.length}`);
  }

  if (search && search.trim()) {
    params.push(`%${search.trim()}%`);
    whereClauses.push(`(fl.subject ILIKE $${params.length} OR fl.sender_email ILIKE $${params.length} OR fl.recipient_email ILIKE $${params.length})`);
  }

  const whereSql = whereClauses.length > 0 ? `WHERE ${whereClauses.join(' AND ')}` : '';

  const countResult = await query(`SELECT COUNT(*) as total FROM future_letters fl ${whereSql}`, params);
  const total = parseInt(countResult.rows[0]?.total || '0', 10);

  // Fetch summary counts
  const statsRes = await query(`
    SELECT
      COUNT(*) as total_all,
      COUNT(*) FILTER (WHERE status = 'scheduled') as scheduled,
      COUNT(*) FILTER (WHERE status = 'delivered') as delivered,
      COUNT(*) FILTER (WHERE status = 'cancelled') as cancelled,
      COUNT(*) FILTER (WHERE status = 'pending_verification') as pending,
      COUNT(*) FILTER (WHERE visibility = 'public_anonymous') as public_count
    FROM future_letters
  `);

  params.push(limit, offset);
  const dataResult = await query(
    `SELECT fl.id, fl.user_id, fl.sender_email, fl.recipient_email, fl.subject, fl.body,
            fl.delivery_date, fl.delivery_preset, fl.visibility, fl.status, fl.category,
            fl.word_count, fl.is_locked, fl.verified, fl.delivered_at, fl.cancelled_at, fl.created_at,
            u.username as author_username, u.email as author_email
     FROM future_letters fl
     LEFT JOIN users u ON fl.user_id = u.id
     ${whereSql}
     ORDER BY fl.created_at DESC
     LIMIT $${params.length - 1} OFFSET $${params.length}`,
    params
  );

  return {
    letters: dataResult.rows,
    stats: statsRes.rows[0],
    pagination: {
      page,
      limit,
      total,
      totalPages: Math.ceil(total / limit) || 1,
    },
  };
}

/**
 * Admin: Get single future letter
 */
export async function getAdminFutureLetter(id) {
  const result = await query(
    `SELECT fl.*, u.username as author_username, u.email as author_email
     FROM future_letters fl
     LEFT JOIN users u ON fl.user_id = u.id
     WHERE fl.id = $1`,
    [id]
  );
  if (result.rows.length === 0) return null;
  return result.rows[0];
}

/**
 * Admin: Immediate delivery dispatch
 */
export async function adminDeliverFutureLetterNow(id) {
  const result = await query('SELECT * FROM future_letters WHERE id = $1', [id]);
  if (result.rows.length === 0) throw new Error('Future letter not found');
  const letter = result.rows[0];

  await sendSingleLetter(letter);
  const updated = await query('SELECT * FROM future_letters WHERE id = $1', [id]);
  return updated.rows[0];
}

/**
 * Admin: Update letter details
 */
export async function adminUpdateFutureLetter(id, fields) {
  const { deliveryDate, recipientEmail, subject, body, status, visibility, category } = fields;
  const updates = [];
  const values = [];
  let idx = 1;

  if (deliveryDate) { updates.push(`delivery_date = $${idx++}`); values.push(new Date(deliveryDate)); }
  if (recipientEmail) { updates.push(`recipient_email = $${idx++}`); values.push(recipientEmail.trim().toLowerCase()); }
  if (subject) { updates.push(`subject = $${idx++}`); values.push(subject.trim()); }
  if (body) { updates.push(`body = $${idx++}`); values.push(body.trim()); }
  if (status) { updates.push(`status = $${idx++}`); values.push(status); }
  if (visibility) { updates.push(`visibility = $${idx++}`); values.push(visibility); }
  if (category) { updates.push(`category = $${idx++}`); values.push(category); }

  if (updates.length === 0) throw new Error('No fields provided to update');

  updates.push(`updated_at = NOW()`);
  values.push(id);

  const result = await query(
    `UPDATE future_letters SET ${updates.join(', ')} WHERE id = $${idx} RETURNING *`,
    values
  );

  if (result.rows.length === 0) throw new Error('Future letter not found');
  return result.rows[0];
}

/**
 * Admin: Delete future letter
 */
export async function adminDeleteFutureLetter(id) {
  const result = await query('DELETE FROM future_letters WHERE id = $1 RETURNING id, subject', [id]);
  if (result.rows.length === 0) throw new Error('Future letter not found');
  return result.rows[0];
}

