import argon2 from 'argon2';
import crypto from 'crypto';

/**
 * Hash a password with Argon2id.
 * Uses recommended OWASP parameters for server-side hashing.
 * @param {string} password - Plain text password
 * @returns {Promise<string>} Argon2id hash string
 */
export async function hashPassword(password) {
  return argon2.hash(password, {
    type: argon2.argon2id,
    memoryCost: 65536,    // 64 MB
    timeCost: 3,          // 3 iterations
    parallelism: 4,
  });
}

/**
 * Verify a password against an Argon2id hash.
 * @param {string} hash - Stored hash
 * @param {string} password - Plain text password to verify
 * @returns {Promise<boolean>}
 */
export async function verifyPassword(hash, password) {
  try {
    return await argon2.verify(hash, password);
  } catch {
    return false;
  }
}

/**
 * Generate a cryptographically secure random token.
 * @param {number} [bytes=32] - Number of random bytes
 * @returns {string} Hex-encoded token
 */
export function generateToken(bytes = 32) {
  return crypto.randomBytes(bytes).toString('hex');
}

/**
 * Generate a URL-safe random token (base64url).
 * @param {number} [bytes=32] - Number of random bytes
 * @returns {string} Base64url-encoded token
 */
export function generateUrlSafeToken(bytes = 32) {
  return crypto.randomBytes(bytes).toString('base64url');
}

/**
 * Timing-safe string comparison to prevent timing attacks.
 * @param {string} a
 * @param {string} b
 * @returns {boolean}
 */
export function timingSafeEqual(a, b) {
  if (typeof a !== 'string' || typeof b !== 'string') return false;
  if (a.length !== b.length) return false;
  return crypto.timingSafeEqual(Buffer.from(a), Buffer.from(b));
}

/**
 * Generate recovery codes for 2FA backup.
 * Returns an array of 8 codes, each 10 characters.
 * @returns {string[]}
 */
export function generateRecoveryCodes() {
  return Array.from({ length: 8 }, () =>
    crypto.randomBytes(5).toString('hex').toUpperCase()
  );
}

/**
 * Encrypt plaintext using AES-256-GCM.
 * @param {string} plaintext - Plaintext to encrypt
 * @param {string} secretKey - Passphrase or key
 * @returns {string} Encrypted payload (salt:iv:tag:ciphertext)
 */
export function encryptPayload(plaintext, secretKey) {
  const salt = crypto.randomBytes(16);
  const key = crypto.scryptSync(secretKey, salt, 32);
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv('aes-256-gcm', key, iv);
  let encrypted = cipher.update(plaintext, 'utf8', 'hex');
  encrypted += cipher.final('hex');
  const tag = cipher.getAuthTag().toString('hex');
  return `${salt.toString('hex')}:${iv.toString('hex')}:${tag}:${encrypted}`;
}

/**
 * Decrypt ciphertext using AES-256-GCM.
 * @param {string} payload - Encrypted string (salt:iv:tag:ciphertext)
 * @param {string} secretKey - Passphrase or key
 * @returns {string|null} Decrypted string or null if invalid key
 */
export function decryptPayload(payload, secretKey) {
  try {
    const [saltHex, ivHex, tagHex, encryptedHex] = payload.split(':');
    if (!saltHex || !ivHex || !tagHex || !encryptedHex) return null;
    const salt = Buffer.from(saltHex, 'hex');
    const iv = Buffer.from(ivHex, 'hex');
    const tag = Buffer.from(tagHex, 'hex');
    const key = crypto.scryptSync(secretKey, salt, 32);
    const decipher = crypto.createDecipheriv('aes-256-gcm', key, iv);
    decipher.setAuthTag(tag);
    let decrypted = decipher.update(encryptedHex, 'hex', 'utf8');
    decrypted += decipher.final('utf8');
    return decrypted;
  } catch {
    return null;
  }
}

