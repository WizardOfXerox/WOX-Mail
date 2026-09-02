import crypto from 'crypto';
import pino from 'pino';
import { query } from '../config/database.js';
import { getIO } from '../config/socket.js';

const logger = pino({ name: 'woxmail:secure-attachments' });
const MASTER_SECRET = process.env.SESSION_SECRET || 'woxmail-secure-attachment-master-key-32';

/**
 * Derive per-attachment AES-256 key deterministically from accessToken + MASTER_SECRET
 */
function deriveAttachmentKey(accessToken) {
  return crypto.createHmac('sha256', MASTER_SECRET).update(accessToken).digest();
}

/**
 * Encrypt binary buffer using AES-256-GCM
 */
function encryptBuffer(buffer, accessToken) {
  const key = deriveAttachmentKey(accessToken);
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv('aes-256-gcm', key, iv);

  const encrypted = Buffer.concat([cipher.update(buffer), cipher.final()]);
  const authTag = cipher.getAuthTag();

  return {
    encryptedPayload: encrypted.toString('base64'),
    iv: iv.toString('hex'),
    authTag: authTag.toString('hex'),
  };
}

/**
 * Decrypt binary buffer using AES-256-GCM
 */
function decryptBuffer(encryptedBase64, ivHex, authTagHex, accessToken) {
  const key = deriveAttachmentKey(accessToken);
  const iv = Buffer.from(ivHex, 'hex');
  const authTag = Buffer.from(authTagHex, 'hex');
  const encrypted = Buffer.from(encryptedBase64, 'base64');

  const decipher = crypto.createDecipheriv('aes-256-gcm', key, iv);
  decipher.setAuthTag(authTag);

  return Buffer.concat([decipher.update(encrypted), decipher.final()]);
}

/**
 * Store a controlled secure attachment with view/download limits
 */
export async function createSecureAttachment({
  userId,
  messageId = null,
  filename,
  contentType,
  buffer,
  maxViews = null,
  maxDownloads = null,
  watermarkText = null,
  expiresInHours = null,
}) {
  const accessToken = `sec_att_${crypto.randomBytes(24).toString('hex')}`;
  const fileSize = buffer.length;
  const { encryptedPayload, iv, authTag } = encryptBuffer(buffer, accessToken);

  let expiresAt = null;
  if (expiresInHours && expiresInHours > 0) {
    expiresAt = new Date(Date.now() + expiresInHours * 3600 * 1000);
  }

  const res = await query(`
    INSERT INTO secure_attachments (
      user_id, message_id, filename, content_type, file_size,
      encrypted_payload, iv, auth_tag, access_token,
      max_views, max_downloads, watermark_text, expires_at
    )
    VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13)
    RETURNING id, access_token, filename, content_type, file_size, max_views, max_downloads, watermark_text, expires_at, created_at
  `, [
    userId, messageId, filename, contentType, fileSize,
    encryptedPayload, iv, authTag, accessToken,
    maxViews === '' || maxViews === undefined ? null : maxViews,
    maxDownloads === '' || maxDownloads === undefined ? null : maxDownloads,
    watermarkText || null,
    expiresAt,
  ]);

  const row = res.rows[0];
  const baseUrl = process.env.BASE_URL || 'https://mail.wox.world';

  return {
    ...row,
    viewUrl: `${baseUrl}/secure-attachment/${row.access_token}`,
    downloadUrl: `${baseUrl}/api/secure-attachments/download/${row.access_token}`,
  };
}

/**
 * Get attachment metadata and status by access token
 */
export async function getAttachmentMetadata(accessToken) {
  const res = await query(`
    SELECT id, user_id, message_id, filename, content_type, file_size,
           access_token, max_views, view_count, max_downloads, download_count,
           watermark_text, expires_at, revoked_at, created_at
    FROM secure_attachments
    WHERE access_token = $1
  `, [accessToken]);

  if (res.rows.length === 0) return null;
  const row = res.rows[0];

  const isExpired = row.expires_at ? new Date(row.expires_at) < new Date() : false;
  const isRevoked = Boolean(row.revoked_at);
  const isViewExhausted = row.max_views !== null && row.view_count >= row.max_views;
  const isDownloadExhausted = row.max_downloads !== null && row.download_count >= row.max_downloads;

  return {
    ...row,
    isExpired,
    isRevoked,
    isViewExhausted,
    isDownloadExhausted,
    isAccessible: !isExpired && !isRevoked && (!isViewExhausted || !isDownloadExhausted),
    remainingViews: row.max_views !== null ? Math.max(0, row.max_views - row.view_count) : null,
    remainingDownloads: row.max_downloads !== null ? Math.max(0, row.max_downloads - row.download_count) : null,
  };
}

/**
 * Process in-browser preview view (increments view_count)
 */
export async function previewAttachment(accessToken, req = {}) {
  const meta = await getAttachmentMetadata(accessToken);
  if (!meta) {
    return { ok: false, error: 'Attachment not found or invalid link', code: 404 };
  }

  if (meta.isRevoked) {
    return { ok: false, error: 'Access to this attachment has been revoked by the sender', code: 403, revoked: true };
  }

  if (meta.isExpired) {
    return { ok: false, error: 'This secure attachment link has expired', code: 410, expired: true };
  }

  if (meta.isViewExhausted) {
    return { ok: false, error: `View limit of ${meta.max_views} has been reached for this attachment`, code: 403, exhausted: true };
  }

  // Increment view counter and log access
  const ip = req.ip || req.headers?.['x-forwarded-for'] || req.socket?.remoteAddress || '';
  const ipHash = ip ? crypto.createHash('sha256').update(ip).digest('hex').substring(0, 32) : null;
  const userAgent = req.headers?.['user-agent'] || 'Unknown';

  await query(`
    UPDATE secure_attachments 
    SET view_count = view_count + 1 
    WHERE id = $1
  `, [meta.id]);

  await query(`
    INSERT INTO secure_attachment_logs (attachment_id, action, ip_hash, user_agent)
    VALUES ($1, 'view', $2, $3)
  `, [meta.id, ipHash, userAgent]);

  // Fetch encrypted payload to decrypt
  const payloadRes = await query(`
    SELECT encrypted_payload, iv, auth_tag FROM secure_attachments WHERE id = $1
  `, [meta.id]);

  const { encrypted_payload, iv, auth_tag } = payloadRes.rows[0];
  const decryptedBuffer = decryptBuffer(encrypted_payload, iv, auth_tag, accessToken);

  // Real-time alert to sender via Socket.IO
  try {
    const io = getIO();
    if (io && meta.user_id) {
      io.to(`user:${meta.user_id}`).emit('secure_attachment_activity', {
        action: 'view',
        attachmentId: meta.id,
        filename: meta.filename,
        viewCount: meta.view_count + 1,
        maxViews: meta.max_views,
        timestamp: new Date().toISOString(),
      });
    }
  } catch (err) {
    logger.debug({ err: err.message }, 'Socket.IO notification skipped');
  }

  return {
    ok: true,
    buffer: decryptedBuffer,
    filename: meta.filename,
    contentType: meta.content_type || 'application/octet-stream',
    watermarkText: meta.watermark_text,
    remainingViews: meta.max_views !== null ? Math.max(0, meta.max_views - (meta.view_count + 1)) : null,
    maxViews: meta.max_views,
    viewCount: meta.view_count + 1,
  };
}

/**
 * Process binary file download (increments download_count)
 */
export async function downloadAttachment(accessToken, req = {}) {
  const meta = await getAttachmentMetadata(accessToken);
  if (!meta) {
    return { ok: false, error: 'Attachment not found or invalid link', code: 404 };
  }

  if (meta.isRevoked) {
    return { ok: false, error: 'Access to this attachment has been revoked by the sender', code: 403, revoked: true };
  }

  if (meta.isExpired) {
    return { ok: false, error: 'This secure attachment link has expired', code: 410, expired: true };
  }

  if (meta.max_downloads === 0) {
    return { ok: false, error: 'This attachment is set to View-Only and cannot be downloaded', code: 403, viewOnly: true };
  }

  if (meta.isDownloadExhausted) {
    return { ok: false, error: `Download limit of ${meta.max_downloads} has been reached for this attachment`, code: 403, exhausted: true };
  }

  // Increment download counter and log access
  const ip = req.ip || req.headers?.['x-forwarded-for'] || req.socket?.remoteAddress || '';
  const ipHash = ip ? crypto.createHash('sha256').update(ip).digest('hex').substring(0, 32) : null;
  const userAgent = req.headers?.['user-agent'] || 'Unknown';

  await query(`
    UPDATE secure_attachments 
    SET download_count = download_count + 1 
    WHERE id = $1
  `, [meta.id]);

  await query(`
    INSERT INTO secure_attachment_logs (attachment_id, action, ip_hash, user_agent)
    VALUES ($1, 'download', $2, $3)
  `, [meta.id, ipHash, userAgent]);

  // Fetch encrypted payload to decrypt
  const payloadRes = await query(`
    SELECT encrypted_payload, iv, auth_tag FROM secure_attachments WHERE id = $1
  `, [meta.id]);

  const { encrypted_payload, iv, auth_tag } = payloadRes.rows[0];
  const decryptedBuffer = decryptBuffer(encrypted_payload, iv, auth_tag, accessToken);

  // Real-time alert to sender via Socket.IO
  try {
    const io = getIO();
    if (io && meta.user_id) {
      io.to(`user:${meta.user_id}`).emit('secure_attachment_activity', {
        action: 'download',
        attachmentId: meta.id,
        filename: meta.filename,
        downloadCount: meta.download_count + 1,
        maxDownloads: meta.max_downloads,
        timestamp: new Date().toISOString(),
      });
    }
  } catch (err) {
    logger.debug({ err: err.message }, 'Socket.IO notification skipped');
  }

  return {
    ok: true,
    buffer: decryptedBuffer,
    filename: meta.filename,
    contentType: meta.content_type || 'application/octet-stream',
    remainingDownloads: meta.max_downloads !== null ? Math.max(0, meta.max_downloads - (meta.download_count + 1)) : null,
    downloadCount: meta.download_count + 1,
  };
}

/**
 * Revoke an attachment by ID (sender action)
 */
export async function revokeAttachment(id, userId) {
  const res = await query(`
    UPDATE secure_attachments
    SET revoked_at = NOW()
    WHERE id = $1 AND user_id = $2
    RETURNING id, filename, revoked_at
  `, [id, userId]);

  return res.rows[0] || null;
}

/**
 * Get list of secure attachments uploaded by a user
 */
export async function getUserSecureAttachments(userId) {
  const res = await query(`
    SELECT id, filename, content_type, file_size, access_token,
           max_views, view_count, max_downloads, download_count,
           watermark_text, expires_at, revoked_at, created_at
    FROM secure_attachments
    WHERE user_id = $1
    ORDER BY created_at DESC
  `, [userId]);

  const baseUrl = process.env.BASE_URL || 'https://mail.wox.world';
  return res.rows.map(r => ({
    ...r,
    viewUrl: `${baseUrl}/secure-attachment/${r.access_token}`,
    downloadUrl: `${baseUrl}/api/secure-attachments/download/${r.access_token}`,
  }));
}
