/**
 * WoxMail Cloudflare R2 & Local Mailbox Backup Engine
 * Handles automated and on-demand generation of RFC 4155 .mbox snapshots,
 * zipped .eml archive packages, AES-256-GCM encrypted backup snapshots,
 * and direct streaming/upload to Cloudflare R2 via AWS SigV4.
 */

import crypto from 'crypto';
import fs from 'fs/promises';
import path from 'path';
import zlib from 'zlib';
import { query } from '../config/database.js';
import pino from 'pino';

const logger = pino({ name: 'backup-service' });

const R2_ACCOUNT_ENDPOINT = process.env.R2_ACCOUNT_ENDPOINT || 'https://fcd975b0389eb5f8d8eaff45532b4f3a.r2.cloudflarestorage.com';
const R2_BUCKET_NAME = process.env.R2_BUCKET_NAME || 'woxmail-backups';
const R2_ACCESS_KEY_ID = process.env.R2_ACCESS_KEY_ID || '';
const R2_SECRET_ACCESS_KEY = process.env.R2_SECRET_ACCESS_KEY || '';
const LOCAL_BACKUP_DIR = process.env.BACKUP_LOCAL_DIR || './backups';

/**
 * Derives an AWS SigV4 signing key.
 */
function getSignatureKey(key, dateStamp, regionName, serviceName) {
  const kDate = crypto.createHmac('sha256', 'AWS4' + key).update(dateStamp).digest();
  const kRegion = crypto.createHmac('sha256', kDate).update(regionName).digest();
  const kService = crypto.createHmac('sha256', kRegion).update(serviceName).digest();
  const kSigning = crypto.createHmac('sha256', kService).update('aws4_request').digest();
  return kSigning;
}

/**
 * Uploads a buffer directly to Cloudflare R2 using AWS Signature Version 4.
 * @param {string} key - S3 object key
 * @param {Buffer} buffer - File buffer
 * @param {string} contentType - MIME type
 * @returns {Promise<boolean>}
 */
export async function uploadToR2(key, buffer, contentType = 'application/octet-stream') {
  if (!R2_ACCESS_KEY_ID || !R2_SECRET_ACCESS_KEY) {
    throw new Error('Cloudflare R2 credentials (R2_ACCESS_KEY_ID / R2_SECRET_ACCESS_KEY) are not configured');
  }

  const endpointUrl = new URL(R2_ACCOUNT_ENDPOINT);
  const host = `${R2_BUCKET_NAME}.${endpointUrl.host}`;
  const canonicalUri = `/${encodeURIComponent(key).replace(/%2F/g, '/')}`;

  const now = new Date();
  const amzDate = now.toISOString().replace(/[:-]|\.\d{3}/g, '');
  const dateStamp = amzDate.slice(0, 8);
  const region = 'auto';
  const service = 's3';

  const payloadHash = crypto.createHash('sha256').update(buffer).digest('hex');

  const canonicalHeaders = `content-length:${buffer.length}\ncontent-type:${contentType}\nhost:${host}\nx-amz-content-sha256:${payloadHash}\nx-amz-date:${amzDate}\n`;
  const signedHeaders = 'content-length;content-type;host;x-amz-content-sha256;x-amz-date';

  const canonicalRequest = `PUT\n${canonicalUri}\n\n${canonicalHeaders}\n${signedHeaders}\n${payloadHash}`;
  const canonicalRequestHash = crypto.createHash('sha256').update(canonicalRequest).digest('hex');

  const credentialScope = `${dateStamp}/${region}/${service}/aws4_request`;
  const stringToSign = `AWS4-HMAC-SHA256\n${amzDate}\n${credentialScope}\n${canonicalRequestHash}`;

  const signingKey = getSignatureKey(R2_SECRET_ACCESS_KEY, dateStamp, region, service);
  const signature = crypto.createHmac('sha256', signingKey).update(stringToSign).digest('hex');

  const authorizationHeader = `AWS4-HMAC-SHA256 Credential=${R2_ACCESS_KEY_ID}/${credentialScope}, SignedHeaders=${signedHeaders}, Signature=${signature}`;

  const putUrl = `https://${host}${canonicalUri}`;
  const res = await fetch(putUrl, {
    method: 'PUT',
    headers: {
      'Host': host,
      'Content-Length': String(buffer.length),
      'Content-Type': contentType,
      'x-amz-date': amzDate,
      'x-amz-content-sha256': payloadHash,
      'Authorization': authorizationHeader,
    },
    body: buffer,
  });

  if (!res.ok) {
    const errorText = await res.text();
    throw new Error(`Cloudflare R2 PUT failed with status ${res.status}: ${errorText}`);
  }

  return true;
}

/**
 * Serializes an array of email objects into RFC 4155 MBOX format.
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
 * Creates a standard, compressed ZIP archive buffer containing individual files.
 * Uses native Node.js zlib Deflate with CRC32 calculation.
 * @param {Array<{ name: string, data: Buffer|string }>} files
 * @returns {Buffer}
 */
export function createZipArchive(files = []) {
  const localHeaders = [];
  const centralHeaders = [];
  let offset = 0;

  for (const file of files) {
    const nameBuf = Buffer.from(file.name, 'utf8');
    const rawData = Buffer.isBuffer(file.data) ? file.data : Buffer.from(file.data || '', 'utf8');
    const compressed = zlib.deflateRawSync(rawData);
    const crc = zlib.crc32(rawData);

    // Local file header (30 bytes + name + compressed data)
    const localHeader = Buffer.alloc(30);
    localHeader.writeUInt32LE(0x04034b50, 0); // signature
    localHeader.writeUInt16LE(20, 4); // version needed (2.0)
    localHeader.writeUInt16LE(0x0800, 6); // flags (UTF-8)
    localHeader.writeUInt16LE(8, 8); // compression method (deflate)
    localHeader.writeUInt16LE(0, 10); // mod time
    localHeader.writeUInt16LE(0, 12); // mod date
    localHeader.writeUInt32LE(crc, 14); // crc-32
    localHeader.writeUInt32LE(compressed.length, 18); // compressed size
    localHeader.writeUInt32LE(rawData.length, 22); // uncompressed size
    localHeader.writeUInt16LE(nameBuf.length, 26); // file name length
    localHeader.writeUInt16LE(0, 28); // extra field length

    localHeaders.push(localHeader, nameBuf, compressed);

    // Central directory header (46 bytes + name)
    const centralHeader = Buffer.alloc(46);
    centralHeader.writeUInt32LE(0x02014b50, 0); // signature
    centralHeader.writeUInt16LE(20, 4); // version made by
    centralHeader.writeUInt16LE(20, 6); // version needed
    centralHeader.writeUInt16LE(0x0800, 8); // flags (UTF-8)
    centralHeader.writeUInt16LE(8, 10); // compression method
    centralHeader.writeUInt16LE(0, 12); // mod time
    centralHeader.writeUInt16LE(0, 14); // mod date
    centralHeader.writeUInt32LE(crc, 16); // crc-32
    centralHeader.writeUInt32LE(compressed.length, 20); // compressed size
    centralHeader.writeUInt32LE(rawData.length, 24); // uncompressed size
    centralHeader.writeUInt16LE(nameBuf.length, 28); // file name length
    centralHeader.writeUInt16LE(0, 30); // extra field length
    centralHeader.writeUInt16LE(0, 32); // comment length
    centralHeader.writeUInt16LE(0, 34); // disk number start
    centralHeader.writeUInt16LE(0, 36); // internal file attributes
    centralHeader.writeUInt32LE(0, 38); // external file attributes
    centralHeader.writeUInt32LE(offset, 42); // relative offset of local header

    centralHeaders.push(centralHeader, nameBuf);

    offset += 30 + nameBuf.length + compressed.length;
  }

  const centralDirOffset = offset;
  const centralDirSize = centralHeaders.reduce((sum, b) => sum + b.length, 0);

  // End of central directory record (22 bytes)
  const eocd = Buffer.alloc(22);
  eocd.writeUInt32LE(0x06054b50, 0); // signature
  eocd.writeUInt16LE(0, 4); // disk number
  eocd.writeUInt16LE(0, 6); // disk with central directory
  eocd.writeUInt16LE(files.length, 8); // total entries on this disk
  eocd.writeUInt16LE(files.length, 10); // total entries overall
  eocd.writeUInt32LE(centralDirSize, 12); // size of central directory
  eocd.writeUInt32LE(centralDirOffset, 16); // offset of central directory
  eocd.writeUInt16LE(0, 20); // comment length

  return Buffer.concat([...localHeaders, ...centralHeaders, eocd]);
}

/**
 * Encrypts a backup payload with AES-256-GCM using a user passphrase.
 * Header: "WOXENC" (6 bytes) + salt(16) + iv(12) + authTag(16) + ciphertext
 * @param {Buffer} buffer
 * @param {string} passphrase
 * @returns {Buffer}
 */
export function encryptBackupBuffer(buffer, passphrase) {
  const salt = crypto.randomBytes(16);
  const iv = crypto.randomBytes(12);
  const key = crypto.scryptSync(passphrase, salt, 32);
  const cipher = crypto.createCipheriv('aes-256-gcm', key, iv);
  const encrypted = Buffer.concat([cipher.update(buffer), cipher.final()]);
  const authTag = cipher.getAuthTag();

  const magic = Buffer.from('WOXENC', 'utf8');
  return Buffer.concat([magic, salt, iv, authTag, encrypted]);
}

/**
 * Decrypts an AES-256-GCM encrypted backup payload.
 * @param {Buffer} encryptedBuffer
 * @param {string} passphrase
 * @returns {Buffer}
 */
export function decryptBackupBuffer(encryptedBuffer, passphrase) {
  const magic = encryptedBuffer.subarray(0, 6).toString('utf8');
  if (magic !== 'WOXENC') {
    throw new Error('Invalid encrypted backup format or missing magic signature');
  }
  const salt = encryptedBuffer.subarray(6, 22);
  const iv = encryptedBuffer.subarray(22, 34);
  const authTag = encryptedBuffer.subarray(34, 50);
  const ciphertext = encryptedBuffer.subarray(50);

  const key = crypto.scryptSync(passphrase, salt, 32);
  const decipher = crypto.createDecipheriv('aes-256-gcm', key, iv);
  decipher.setAuthTag(authTag);
  return Buffer.concat([decipher.update(ciphertext), decipher.final()]);
}

/**
 * Creates an export backup job for a user's mailbox.
 * Supports mbox, zip, and aes-256-gcm encrypted snapshots.
 * @param {number} userId
 * @param {{ format?: 'mbox' | 'zip' | 'encrypted_mbox' | 'encrypted_zip', folder?: string, emails?: Array<object>, destination?: 'r2' | 'local', passphrase?: string }} options
 */
export async function createMailboxBackup(userId, options = {}) {
  const format = options.format || 'mbox';
  const emails = options.emails || [];
  const destination = (options.destination || (R2_ACCESS_KEY_ID ? 'r2' : 'local'));
  const passphrase = options.passphrase || options.encryptionKey;

  let rawBuffer;
  let contentType = 'application/octet-stream';
  let fileExt = format;

  if (format === 'zip' || format === 'eml_zip' || format === 'encrypted_zip') {
    // Generate .zip archive with individual .eml files
    const emlFiles = emails.map((email, i) => {
      const fromAddr = typeof email.from === 'object' ? (email.from?.address || 'user@wox.world') : (email.from || 'user@wox.world');
      const safeSubj = (email.subject || 'message').replace(/[^a-zA-Z0-9_-]/g, '_').slice(0, 40);
      const dateStr = email.date ? new Date(email.date).toUTCString() : new Date().toUTCString();
      const content = [
        `From: ${fromAddr}`,
        `To: ${Array.isArray(email.to) ? email.to.map((t) => t.address || t).join(', ') : (email.to || '')}`,
        `Subject: ${email.subject || '(no subject)'}`,
        `Date: ${dateStr}`,
        `Content-Type: text/html; charset="UTF-8"`,
        `MIME-Version: 1.0`,
        '',
        email.html || email.text || '(Empty)',
      ].join('\n');

      return {
        name: `${String(i + 1).padStart(4, '0')}_${safeSubj}.eml`,
        data: Buffer.from(content, 'utf8'),
      };
    });

    rawBuffer = createZipArchive(emlFiles);
    contentType = 'application/zip';
    fileExt = format.startsWith('encrypted') ? 'enc.zip' : 'zip';
  } else {
    // Standard MBOX format
    const mboxData = formatMbox(emails);
    rawBuffer = Buffer.from(mboxData, 'utf-8');
    contentType = 'application/mbox';
    fileExt = format.startsWith('encrypted') ? 'enc.mbox' : 'mbox';
  }

  // Apply AES-256-GCM encryption if requested or format is encrypted
  let buffer = rawBuffer;
  if (passphrase || format.startsWith('encrypted')) {
    const keyToUse = passphrase || 'WoxMail-ZeroTrust-Sovereign-Key';
    buffer = encryptBackupBuffer(rawBuffer, keyToUse);
    contentType = 'application/octet-stream';
  }

  const sha256 = crypto.createHash('sha256').update(buffer).digest('hex');
  const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
  const filename = `mailbox-backup-user-${userId}-${timestamp}.${fileExt}`;

  let r2Key = null;
  let localPath = null;
  let status = 'completed';
  let errorMessage = null;

  if (destination === 'r2' && R2_ACCESS_KEY_ID) {
    try {
      r2Key = `backups/user_${userId}/${filename}`;
      await uploadToR2(r2Key, buffer, contentType);
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
    backup: rows[0],
    buffer,
    filename,
    contentType,
    sha256,
  };
}

/**
 * Lists all previous mailbox backups for a given user.
 * @param {number} userId
 */
export async function listUserBackups(userId) {
  const { rows } = await query(
    `SELECT id, user_id, format, storage_type, r2_key, file_size, message_count, status, sha256_checksum, expires_at, created_at, completed_at
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
  createZipArchive,
  encryptBackupBuffer,
  decryptBackupBuffer,
  createMailboxBackup,
  listUserBackups,
};
