import crypto from 'crypto';
import { query } from '../config/database.js';

/**
 * Store an attachment with SHA-256 deduplication per user.
 * @param {number} userId 
 * @param {string} filename 
 * @param {string} mimeType 
 * @param {Buffer} buffer 
 * @returns {Promise<Object>} Attachment metadata (excluding raw content)
 */
export async function storeAttachment(userId, filename, mimeType, buffer) {
  if (!buffer || !Buffer.isBuffer(buffer)) {
    throw new Error('Valid buffer is required for attachment storage');
  }

  const sha256 = crypto.createHash('sha256').update(buffer).digest('hex');
  const sizeBytes = buffer.length;
  const cleanFilename = String(filename || 'attachment.bin').trim();
  const cleanMime = String(mimeType || 'application/octet-stream').trim();

  // Atomic upsert with SHA-256 conflict resolution
  const upsert = await query(
    `INSERT INTO attachment_store 
     (user_id, sha256, filename, mime_type, size_bytes, content, reference_count)
     VALUES ($1, $2, $3, $4, $5, $6, 1)
     ON CONFLICT (user_id, sha256) 
     DO UPDATE SET reference_count = attachment_store.reference_count + 1
     RETURNING id, sha256, filename, mime_type, size_bytes, reference_count, created_at,
               (xmax != 0) AS is_duplicate`,
    [userId, sha256, cleanFilename, cleanMime, sizeBytes, buffer]
  );

  const row = upsert.rows[0];
  return {
    id: row.id,
    sha256: row.sha256,
    filename: row.filename,
    mime_type: row.mime_type,
    size_bytes: row.size_bytes,
    reference_count: row.reference_count,
    created_at: row.created_at,
    isDuplicate: Boolean(row.is_duplicate)
  };
}

/**
 * Retrieve an attachment with its raw content by SHA-256 hash.
 */
export async function getAttachmentByHash(userId, sha256) {
  const result = await query(
    `SELECT id, sha256, filename, mime_type, size_bytes, content, reference_count, created_at
     FROM attachment_store
     WHERE user_id = $1 AND sha256 = $2`,
    [userId, sha256]
  );
  return result.rows[0] || null;
}

/**
 * Decrement attachment reference count or delete if count reaches 0.
 */
export async function deleteAttachmentRef(userId, sha256) {
  const check = await query(
    `SELECT id, reference_count FROM attachment_store WHERE user_id = $1 AND sha256 = $2`,
    [userId, sha256]
  );

  if (check.rows.length === 0) {
    return { deleted: false, referenceCount: 0 };
  }

  const currentCount = check.rows[0].reference_count;
  if (currentCount <= 1) {
    await query(`DELETE FROM attachment_store WHERE user_id = $1 AND sha256 = $2`, [userId, sha256]);
    return { deleted: true, referenceCount: 0 };
  } else {
    const updated = await query(
      `UPDATE attachment_store SET reference_count = reference_count - 1 
       WHERE user_id = $1 AND sha256 = $2 
       RETURNING reference_count`,
      [userId, sha256]
    );
    return { deleted: false, referenceCount: updated.rows[0].reference_count };
  }
}

/**
 * Calculate user storage savings from attachment deduplication.
 */
export async function getDeduplicationStats(userId) {
  const res = await query(
    `SELECT 
       COUNT(*)::int AS unique_attachments,
       COALESCE(SUM(reference_count), 0)::int AS total_logical_references,
       COALESCE(SUM(size_bytes), 0)::bigint AS physical_bytes_stored,
       COALESCE(SUM(size_bytes * GREATEST(reference_count - 1, 0)), 0)::bigint AS bytes_saved
     FROM attachment_store
     WHERE user_id = $1`,
    [userId]
  );

  const row = res.rows[0];
  const uniqueCount = row.unique_attachments || 0;
  const logicalRefs = row.total_logical_references || 0;
  const dedupCount = Math.max(0, logicalRefs - uniqueCount);

  return {
    uniqueAttachments: uniqueCount,
    totalReferences: logicalRefs,
    deduplicatedCount: dedupCount,
    physicalBytesStored: Number(row.physical_bytes_stored || 0),
    bytesSaved: Number(row.bytes_saved || 0)
  };
}
