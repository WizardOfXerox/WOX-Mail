/**
 * @fileoverview WoxAuth cryptography helpers.
 * AES-256-GCM encryption/decryption for TOTP secrets stored server-side.
 * Keys are derived client-side from user's password via PBKDF2 — server never sees plaintext secrets.
 */

import crypto from 'crypto';

const ALGORITHM = 'aes-256-gcm';
const IV_LENGTH = 16;
const TAG_LENGTH = 16;

/**
 * Encrypt a TOTP secret with AES-256-GCM.
 * Called when user adds a new WoxAuth entry — the encrypted blob is stored in DB.
 * @param {string} plaintext - TOTP secret (Base32)
 * @param {Buffer|string} key - 32-byte encryption key (from client PBKDF2)
 * @returns {{ciphertext: string, iv: string, tag: string}}
 */
export function encrypt(plaintext, key) {
  const keyBuf = typeof key === 'string' ? Buffer.from(key, 'hex') : key;
  const iv = crypto.randomBytes(IV_LENGTH);
  const cipher = crypto.createCipheriv(ALGORITHM, keyBuf, iv);

  let encrypted = cipher.update(plaintext, 'utf8', 'hex');
  encrypted += cipher.final('hex');
  const tag = cipher.getAuthTag();

  return {
    ciphertext: encrypted,
    iv: iv.toString('hex'),
    tag: tag.toString('hex'),
  };
}

/**
 * Decrypt a TOTP secret.
 * @param {string} ciphertext - Hex-encoded ciphertext
 * @param {string} iv - Hex-encoded IV
 * @param {string} tag - Hex-encoded auth tag
 * @param {Buffer|string} key - 32-byte decryption key
 * @returns {string} Plaintext TOTP secret
 */
export function decrypt(ciphertext, iv, tag, key) {
  const keyBuf = typeof key === 'string' ? Buffer.from(key, 'hex') : key;
  const decipher = crypto.createDecipheriv(ALGORITHM, keyBuf, Buffer.from(iv, 'hex'));
  decipher.setAuthTag(Buffer.from(tag, 'hex'));

  let decrypted = decipher.update(ciphertext, 'hex', 'utf8');
  decrypted += decipher.final('utf8');

  return decrypted;
}

/**
 * Derive an encryption key from a password using PBKDF2.
 * This is a server-side fallback — normally key derivation happens client-side.
 * @param {string} password - User's password
 * @param {string} salt - Salt (e.g., user's email)
 * @param {number} [iterations=100000] - PBKDF2 iterations
 * @returns {Promise<Buffer>} 32-byte key
 */
export function deriveKey(password, salt, iterations = 100000) {
  return new Promise((resolve, reject) => {
    crypto.pbkdf2(password, salt, iterations, 32, 'sha256', (err, key) => {
      if (err) reject(err);
      else resolve(key);
    });
  });
}

export default { encrypt, decrypt, deriveKey };
