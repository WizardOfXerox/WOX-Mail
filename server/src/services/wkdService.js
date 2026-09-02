/**
 * WoxMail OpenPGP Web Key Directory (WKD) Service (RFC 9216)
 * Generates and serves z-base-32 WKD local-part hashes for ProtonMail and Thunderbird discovery.
 */

import crypto from 'crypto';
import { query } from '../config/database.js';

// z-base-32 alphabet specified in RFC 9216 / RFC 6189
const ZBASE32_ALPHABET = 'ybndrfg8ejkmcpqxot1uwisza345h769';

/**
 * Encodes a buffer into z-base-32 string.
 * @param {Buffer} buffer
 * @returns {string}
 */
export function encodeZBase32(buffer) {
  let bits = 0;
  let value = 0;
  let output = '';

  for (let i = 0; i < buffer.length; i++) {
    value = (value << 8) | buffer[i];
    bits += 8;

    while (bits >= 5) {
      output += ZBASE32_ALPHABET[(value >>> (bits - 5)) & 31];
      bits -= 5;
    }
  }

  if (bits > 0) {
    output += ZBASE32_ALPHABET[(value << (5 - bits)) & 31];
  }

  return output;
}

/**
 * Computes the 32-character WKD SHA-1 local-part hash in z-base-32 format.
 * @param {string} localPart - e.g. "admin" from "admin@wox.world"
 * @returns {string} - 32-character z-base-32 string
 */
export function computeWkdHash(localPart) {
  if (!localPart || typeof localPart !== 'string') return '';
  const clean = localPart.trim().toLowerCase();
  const sha1Buffer = crypto.createHash('sha1').update(clean, 'utf-8').digest();
  return encodeZBase32(sha1Buffer);
}

/**
 * Resolves a WKD public key for a domain and hash.
 * @param {string} domain
 * @param {string} wkdHash
 * @returns {Promise<{ email: string, publicKeyArmored: string } | null>}
 */
export async function getPublicKeyByWkdHash(domain, wkdHash) {
  const { rows } = await query(
    `SELECT u.email, pk.public_key
     FROM pgp_keypairs pk
     JOIN users u ON u.id = pk.user_id
     WHERE pk.is_active = true`
  );

  for (const row of rows) {
    const email = (row.email || '').toLowerCase();
    if (!email.includes('@')) continue;

    const [userLocal, userDomain] = email.split('@');
    if (domain && userDomain !== domain.toLowerCase()) continue;

    const hash = computeWkdHash(userLocal);
    if (hash === wkdHash) {
      return {
        email: row.email,
        publicKeyArmored: row.public_key,
      };
    }
  }

  return null;
}

export default {
  encodeZBase32,
  computeWkdHash,
  getPublicKeyByWkdHash,
};
