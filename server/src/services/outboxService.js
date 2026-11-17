import { query } from '../config/database.js';
import { sanitizeEmail } from './emailSanitizer.js';
import { pino } from 'pino';

const logger = pino({ name: 'woxmail:outbox' });

function escapeHtml(str) {
  return String(str || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

/**
 * Creates a new outbox entry when an email is submitted to send, queued, or scheduled.
 */
export async function createOutboxEntry({
  userId,
  dispatchId,
  emailPayload,
  status = 'queued_undo',
  scheduledAt = new Date(),
}) {
  try {
    const toAddrs = Array.isArray(emailPayload.to) ? emailPayload.to : (emailPayload.to ? [emailPayload.to] : []);
    const ccAddrs = Array.isArray(emailPayload.cc) ? emailPayload.cc : (emailPayload.cc ? [emailPayload.cc] : []);
    const bccAddrs = Array.isArray(emailPayload.bcc) ? emailPayload.bcc : (emailPayload.bcc ? [emailPayload.bcc] : []);

    const safeAttachments = (emailPayload.attachments || []).map((a) => {
      let rawBuf = null;
      if (Buffer.isBuffer(a.content)) {
        rawBuf = a.content;
      } else if (typeof a.content === 'string') {
        if (a.content.includes('base64,')) {
          rawBuf = Buffer.from(a.content.split('base64,')[1], 'base64');
        } else {
          rawBuf = Buffer.from(a.content, 'utf8');
        }
      } else if (typeof a.contentBase64 === 'string') {
        rawBuf = Buffer.from(a.contentBase64, 'base64');
      }

      const size = rawBuf ? rawBuf.byteLength : (Number(a.size) || 0);
      // Preserve base64 payload up to 10MB per attachment so retries work cleanly
      const contentBase64 = rawBuf && rawBuf.byteLength <= 10 * 1024 * 1024
        ? rawBuf.toString('base64')
        : null;

      return {
        filename: a.filename || a.name || 'attachment',
        contentType: a.contentType || a.type || 'application/octet-stream',
        size,
        ...(contentBase64 ? { contentBase64 } : {}),
      };
    });

    const res = await query(
      `INSERT INTO outbox_emails (
        user_id, dispatch_id, from_address, to_addresses, cc_addresses, bcc_addresses,
        subject, body_html, body_text, attachments, status, scheduled_at
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12)
      RETURNING *`,
      [
        userId,
        dispatchId,
        emailPayload.from || '',
        toAddrs,
        ccAddrs,
        bccAddrs,
        emailPayload.subject || '(no subject)',
        emailPayload.html || null,
        emailPayload.text || null,
        JSON.stringify(safeAttachments),
        status,
        scheduledAt,
      ]
    );

    return res.rows[0];
  } catch (err) {
    logger.error({ err: err.message, userId, dispatchId }, 'Failed to create outbox entry');
    return null;
  }
}

/**
 * Updates status of an outbox message by dispatch_id or numeric ID (optionally scoped by userId).
 */
export async function updateOutboxStatus(dispatchIdOrId, { status, sentAt = null, errorMessage = null }, userId = null) {
  try {
    const cleanKey = String(dispatchIdOrId).replace(/^outbox_/, '');
    const isNumeric = /^\d+$/.test(cleanKey);
    const targetValue = isNumeric ? parseInt(cleanKey, 10) : cleanKey;
    const whereClause = isNumeric ? 'id = $1' : 'dispatch_id = $1';

    const sets = ['status = $2', 'updated_at = NOW()'];
    const params = [targetValue, status];
    let pIdx = 3;

    if (sentAt !== undefined && sentAt !== null) {
      sets.push(`sent_at = $${pIdx++}`);
      params.push(sentAt);
    }
    if (errorMessage !== undefined) {
      sets.push(`error_message = $${pIdx++}`);
      params.push(errorMessage);
    }
    if (status === 'failed') {
      sets.push('retry_count = retry_count + 1');
    }

    let userScope = '';
    if (userId !== null && userId !== undefined) {
      userScope = ` AND user_id = $${pIdx++}`;
      params.push(userId);
    }

    const sql = `UPDATE outbox_emails SET ${sets.join(', ')} WHERE ${whereClause}${userScope} RETURNING *`;
    const res = await query(sql, params);
    return res.rows[0] || null;
  } catch (err) {
    logger.error({ err: err.message, dispatchIdOrId, status }, 'Failed to update outbox status');
    return null;
  }
}

/**
 * Gets count of active, sending, and failed outbox messages for badge display.
 */
export async function getOutboxCount(userId) {
  try {
    const res = await query(
      `SELECT COUNT(*)::int as count FROM outbox_emails
       WHERE user_id = $1 AND status IN ('queued_undo', 'sending', 'scheduled', 'failed')`,
      [userId]
    );
    return res.rows[0]?.count || 0;
  } catch (err) {
    logger.error({ err: err.message, userId }, 'Failed to get outbox count');
    return 0;
  }
}

/**
 * Formats an outbox row into a message object compatible with WoxMail's MessageList and MessageView.
 */
export function formatOutboxMessage(row, { includeAttachmentContent = false } = {}) {
  if (!row) return null;
  const toList = (row.to_addresses || []).map((a) => ({ address: a, name: a }));
  const ccList = (row.cc_addresses || []).map((a) => ({ address: a, name: a }));
  const bccList = (row.bcc_addresses || []).map((a) => ({ address: a, name: a }));

  const cleanSnippet = row.body_text
    ? row.body_text.slice(0, 160).replace(/\s+/g, ' ').trim()
    : row.body_html
    ? row.body_html.replace(/<[^>]+>/g, ' ').slice(0, 160).replace(/\s+/g, ' ').trim()
    : '';

  let fromName = row.from_address || 'Me';
  let fromAddr = row.from_address || '';
  if (row.from_address && row.from_address.includes('<') && row.from_address.includes('>')) {
    const match = row.from_address.match(/^(.*?)\s*<([^>]+)>/);
    if (match) {
      fromName = match[1].replace(/["']/g, '').trim() || match[2].trim();
      fromAddr = match[2].trim();
    }
  }

  const sanitizedHtml = row.body_html
    ? sanitizeEmail(row.body_html, { loadImages: true }).html
    : `<pre style="white-space:pre-wrap;font-family:inherit;">${escapeHtml(row.body_text || '')}</pre>`;

  const rawAttachments = Array.isArray(row.attachments) ? row.attachments : [];
  const attachments = rawAttachments.map((a) => ({
    filename: a.filename || 'attachment',
    contentType: a.contentType || 'application/octet-stream',
    size: Number(a.size) || 0,
    hasContent: Boolean(a.contentBase64 || a.content),
    ...(includeAttachmentContent && a.contentBase64
      ? { content: Buffer.from(a.contentBase64, 'base64') }
      : {}),
  }));

  return {
    uid: `outbox_${row.id}`,
    outboxId: row.id,
    dispatchId: row.dispatch_id,
    isOutbox: true,
    folder: 'Outbox',
    from: {
      address: fromAddr,
      name: fromName,
    },
    to: toList,
    cc: ccList,
    bcc: bccList,
    subject: row.subject || '(no subject)',
    date: row.created_at,
    snippet: cleanSnippet,
    html: sanitizedHtml,
    text: row.body_text || '',
    attachments,
    hasAttachments: attachments.length > 0,
    status: row.status,
    errorMessage: row.error_message,
    scheduledAt: row.scheduled_at,
    sentAt: row.sent_at,
    retryCount: row.retry_count || 0,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

/**
 * Returns paginated outbox messages for a user.
 */
export async function getOutboxMessages(userId, { page = 1, limit = 25, filter = null } = {}) {
  try {
    const offset = Math.max(0, (page - 1) * limit);
    let countSql = 'SELECT COUNT(*)::int as total FROM outbox_emails WHERE user_id = $1';
    let querySql = `
      SELECT * FROM outbox_emails
      WHERE user_id = $1
      ORDER BY 
        CASE 
          WHEN status = 'failed' THEN 1
          WHEN status = 'sending' THEN 2
          WHEN status = 'queued_undo' THEN 3
          WHEN status = 'scheduled' THEN 4
          ELSE 5 
        END ASC,
        created_at DESC
      LIMIT $2 OFFSET $3
    `;

    const countRes = await query(countSql, [userId]);
    const total = countRes.rows[0]?.total || 0;

    const listRes = await query(querySql, [userId, limit, offset]);
    const messages = listRes.rows.map((row) => formatOutboxMessage(row));

    return {
      messages,
      total,
      page,
      limit,
    };
  } catch (err) {
    logger.error({ err: err.message, userId }, 'Failed to fetch outbox messages');
    return { messages: [], total: 0, page: 1, limit };
  }
}

/**
 * Get a single outbox message by its numeric id, outbox_ prefixed id, or dispatch_id.
 */
export async function getOutboxMessageById(userId, outboxIdOrUid, { includeAttachmentContent = false } = {}) {
  try {
    const rawId = String(outboxIdOrUid).replace(/^outbox_/, '');
    if (!rawId) return null;

    const isNumeric = /^\d+$/.test(rawId);
    const res = isNumeric
      ? await query('SELECT * FROM outbox_emails WHERE user_id = $1 AND id = $2', [userId, parseInt(rawId, 10)])
      : await query('SELECT * FROM outbox_emails WHERE user_id = $1 AND dispatch_id = $2', [userId, rawId]);

    if (res.rows.length === 0) return null;
    return formatOutboxMessage(res.rows[0], { includeAttachmentContent });
  } catch (err) {
    logger.error({ err: err.message, userId, outboxIdOrUid }, 'Failed to fetch outbox message by ID');
    return null;
  }
}

/**
 * Deletes an outbox entry by numeric id, outbox_ prefixed id, or dispatch_id.
 */
export async function deleteOutboxMessage(userId, outboxIdOrUid) {
  try {
    const rawId = String(outboxIdOrUid).replace(/^outbox_/, '');
    if (!rawId) return false;

    const isNumeric = /^\d+$/.test(rawId);
    const res = isNumeric
      ? await query('DELETE FROM outbox_emails WHERE user_id = $1 AND id = $2 RETURNING id', [userId, parseInt(rawId, 10)])
      : await query('DELETE FROM outbox_emails WHERE user_id = $1 AND dispatch_id = $2 RETURNING id', [userId, rawId]);

    return res.rows.length > 0;
  } catch (err) {
    logger.error({ err: err.message, userId, outboxIdOrUid }, 'Failed to delete outbox message');
    return false;
  }
}

export default {
  createOutboxEntry,
  updateOutboxStatus,
  getOutboxCount,
  getOutboxMessages,
  getOutboxMessageById,
  deleteOutboxMessage,
  formatOutboxMessage,
};
