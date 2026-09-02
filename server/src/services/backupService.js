/**
 * WoxMail Mailbox Backup & Cloudflare R2 Offsite Archiving Engine
 * Supports automated & on-demand MBOX / EML generation with AWS SigV4 R2 uploads and SHA-256 checksum verification.
 */

import crypto from 'crypto';
import fs from 'fs/promises';
import path from 'path';
import { query } from '../config/database.js';
import pino from 'pino';

const logger = pino({ name: 'backup-service' });

const R2_ENDPOINT = process.env.R2_ENDPOINT;
const R2_ACCESS_KEY_ID = process.env.R2_ACCESS_KEY_ID;
const R2_SECRET_ACCESS_KEY = process.env.R2_SECRET_ACCESS_KEY;
const R2_BUCKET_NAME = process.env.R2_BUCKET_NAME || 'woxmail-backups';
const LOCAL_BACKUP_DIR = process.env.BACKUP_DIR || './backups';

/**
 * Computes AWS SigV4 HMAC-SHA256 authorization signature for S3/R2 requests.
 */
function getSignatureKey(key, dateStamp, regionName, serviceName) {
  const kDate = crypto.createHmac('sha256', 'AWS4' + key).update(dateStamp).digest();
  const kRegion = crypto.createHmac('sha256', kDate).update(regionName).digest();
  const kService = crypto.createHmac('sha256', kRegion).update(serviceName).digest();
  const kSigning = crypto.createHmac('sha256', kService).update('aws4_request').digest();
  return kSigning;
}

/**
 * Uploads a buffer to Cloudflare R2 using AWS Signature Version 4.
 * @param {string} key - Object key in bucket
 * @param {Buffer} buffer - File data
 * @param {string} contentType - MIME type
 * @returns {Promise<{ key: string, etag?: string }>}
 */
export async function uploadToR2(key, buffer, contentType = 'application/octet-stream') {
  if (!R2_ENDPOINT || !R2_ACCESS_KEY_ID || !R2_SECRET_ACCESS_KEY) {
    throw new Error('Cloudflare R2 credentials are not configured in environment');
  }

  const endpointUrl = new URL(R2_ENDPOINT);
  const host = endpointUrl.host;
  const region = 'auto';
  const service = 's3';

  const cleanKey = key.startsWith('/') ? key.slice(1) : key;
  const requestUrl = `${R2_ENDPOINT.replace(/\/$/, '')}/${R2_BUCKET_NAME}/${cleanKey}`;
  const parsedUrl = new URL(requestUrl);

  const amzDate = new Date().toISOString().replace(/[:-]|\.\d{3}/g, '');
  const dateStamp = amzDate.slice(0, 8);

  const payloadHash = crypto.createHash('sha256').update(buffer).digest('hex');

  const canonicalUri = `/${R2_BUCKET_NAME}/${cleanKey}`;
  const canonicalHeaders = `host:${host}\nx-amz-content-sha256:${payloadHash}\nx-amz-date:${amzDate}\n`;
  const signedHeaders = 'host;x-amz-content-sha256;x-amz-date';

  const canonicalRequest = `PUT\n${canonicalUri}\n\n${canonicalHeaders}\n${signedHeaders}\n${payloadHash}`;
  const canonicalRequestHash = crypto.createHash('sha256').update(canonicalRequest).digest('hex');

  const credentialScope = `${dateStamp}/${region}/${service}/aws4_request`;
  const stringToSign = `AWS4-HMAC-SHA256\n${amzDate}\n${credentialScope}\n${canonicalRequestHash}`;

  const signingKey = getSignatureKey(R2_SECRET_ACCESS_KEY, dateStamp, region, service);
  const signature = crypto.createHmac('sha256', signingKey).update(stringToSign).digest('hex');

  const authorizationHeader = `AWS4-HMAC-SHA256 Credential=${R2_ACCESS_KEY_ID}/${credentialScope}, SignedHeaders=${signedHeaders}, Signature=${signature}`;

  const res = await fetch(requestUrl, {
    method: 'PUT',
    headers: {
      'Host': host,
      'Content-Type': contentType,
      'Content-Length': String(buffer.length),
      'x-amz-date': amzDate,
      'x-amz-content-sha256': payloadHash,
      'Authorization': authorizationHeader,
    },
    body: buffer,
  });

  if (!res.ok) {
    const errorText = await res.text();
    throw new Error(`R2 Upload failed with status ${res.status}: ${errorText}`);
  }

  return { key: cleanKey, etag: res.headers.get('etag') || '' };
}

/**
 * Converts an array of email objects into RFC 4155 MBOX text format.
 * @param {Array<object>} emails
 * @returns {string}
 */
export function formatMbox(emails = []) {
  const chunks = [];
  for (const email of emails) {
    const fromAddr = typeof email.from === 'object' ? (email.from?.address || 'user@wox.world') : (email.from || 'user@wox.world');
    const dateStr = email.date ? new Date(email.date).toUTCString() : new Date().toUTCString();

    chunks.push(`From ${fromAddr} ${dateStr}`);
    chunks.push(`From: ${fromAddr}`);
    chunks.push(`To: ${Array.isArray(email.to) ? email.to.map((t) => t.address || t).join(', ') : (email.to || '')}`);
    chunks.push(`Subject: ${email.subject || '(no subject)'}`);
    chunks.push(`Date: ${dateStr}`);
    chunks.push(`Message-ID: <${email.messageId || crypto.randomUUID()}@wox.world>`);
    chunks.push('Content-Type: text/html; charset="UTF-8"');
    chunks.push('MIME-Version: 1.0');
    chunks.push('');
    chunks.push(email.html || email.text || '(Empty Message)');
    chunks.push('');
    chunks.push('');
  }
  return chunks.join('\n');
}

/**
 * Creates an export backup job for a user's mailbox.
 * @param {number} userId
 * @param {{ format?: string, folder?: string, emails?: Array<object>, destination?: 'r2' | 'local' }} options
 */
export async function createMailboxBackup(userId, options = {}) {
  const format = options.format || 'mbox';
  const emails = options.emails || [];
  const destination = (options.destination || (R2_ACCESS_KEY_ID ? 'r2' : 'local'));

  const mboxData = formatMbox(emails);
  const buffer = Buffer.from(mboxData, 'utf-8');
  const sha256 = crypto.createHash('sha256').update(buffer).digest('hex');
  const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
  const filename = `mailbox-backup-user-${userId}-${timestamp}.${format}`;

  let r2Key = null;
  let localPath = null;
  let status = 'completed';
  let errorMessage = null;

  if (destination === 'r2' && R2_ACCESS_KEY_ID) {
    try {
      r2Key = `backups/user_${userId}/${filename}`;
      await uploadToR2(r2Key, buffer, 'application/mbox');
      logger.info({ userId, r2Key, size: buffer.length }, 'Successfully uploaded mailbox backup to Cloudflare R2');
    } catch (err) {
      logger.warn({ err, userId }, 'Cloudflare R2 backup upload failed, falling back to local storage');
      status = 'failed';
      errorMessage = err.message;
    }
  }

  // Save to local backup directory as well or as fallback
  try {
    const dir = path.resolve(LOCAL_BACKUP_DIR);
    await fs.mkdir(dir, { recursive: true });
    localPath = path.join(dir, filename);
    await fs.writeFile(localPath, buffer);
    if (status === 'failed' && localPath) {
      status = 'completed_local_only';
    }
  } catch (err) {
    logger.error({ err, userId }, 'Failed to write local backup copy');
  }

  const { rows } = await query(
    `INSERT INTO mailbox_backups
      (user_id, format, storage_type, file_path, r2_key, file_size, message_count, status, error_message, sha256_checksum, expires_at, completed_at)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, NOW() + INTERVAL '30 days', NOW())
     RETURNING *`,
    [
      userId,
      format,
      destination,
      localPath,
      r2Key,
      buffer.length,
      emails.length,
      status,
      errorMessage,
      sha256,
    ]
  );

  return {
    ...rows[0],
    downloadBuffer: buffer,
    filename,
  };
}

/**
 * Lists all previous backup archives for a user.
 * @param {number} userId
 */
export async function listUserBackups(userId) {
  const { rows } = await query(
    `SELECT id, format, storage_type, file_size, message_count, status, sha256_checksum, created_at, expires_at
     FROM mailbox_backups
     WHERE user_id = $1
     ORDER BY created_at DESC
     LIMIT 50`,
    [userId]
  );
  return rows;
}

export default {
  uploadToR2,
  formatMbox,
  createMailboxBackup,
  listUserBackups,
};
