/**
 * @fileoverview PGP Encryption service — validates OpenPGP public keys,
 * auto-encrypts forwarded emails and attachments, and generates armored keypairs.
 */

import * as openpgp from 'openpgp';
import pino from 'pino';

const logger = pino({ name: 'woxmail:pgp' });

/**
 * Validate an ASCII-armored OpenPGP public key and extract metadata.
 * @param {string} armoredKey - The -----BEGIN PGP PUBLIC KEY BLOCK----- string
 * @returns {Promise<{ valid: boolean, fingerprint: string, keyId: string, userIds: string[], createdAt: Date }>}
 */
export async function validatePublicKey(armoredKey) {
  if (!armoredKey || typeof armoredKey !== 'string' || !armoredKey.includes('BEGIN PGP PUBLIC KEY BLOCK')) {
    throw new Error('Invalid PGP key format. Must be an ASCII-armored public key block.');
  }

  try {
    const publicKey = await openpgp.readKey({ armoredKey: armoredKey.trim() });
    const fingerprint = publicKey.getFingerprint();
    const keyId = publicKey.getKeyID().toHex();
    const userIds = await publicKey.getUserIDs();
    const createdAt = publicKey.getCreationTime();

    return {
      valid: true,
      fingerprint,
      keyId,
      userIds,
      createdAt,
    };
  } catch (err) {
    logger.warn({ err: err.message }, 'PGP public key parsing failed');
    throw new Error(`Failed to parse PGP public key: ${err.message}`);
  }
}

/**
 * Encrypt plain text or HTML email content with a recipient's armored PGP public key.
 * @param {string} content - Plain text or HTML body
 * @param {string} armoredPublicKey - The recipient's public key
 * @returns {Promise<string>} ASCII-armored PGP encrypted message
 */
export async function encryptMessage(content, armoredPublicKey) {
  if (!content || !armoredPublicKey) return content;

  try {
    const publicKey = await openpgp.readKey({ armoredKey: armoredPublicKey.trim() });
    const message = await openpgp.createMessage({ text: content });

    const encrypted = await openpgp.encrypt({
      message,
      encryptionKeys: publicKey,
    });

    return encrypted;
  } catch (err) {
    logger.error({ err: err.message }, 'PGP encryption failed');
    throw new Error(`PGP encryption failed: ${err.message}`);
  }
}

/**
 * Generate a new OpenPGP key pair (for users who don't have GPG installed).
 * @param {string} name - e.g. "Alex Wox"
 * @param {string} email - e.g. "alex@wox.world"
 * @returns {Promise<{ privateKey: string, publicKey: string, fingerprint: string }>}
 */
export async function generateKeyPair(name, email) {
  try {
    const { privateKey, publicKey } = await openpgp.generateKey({
      type: 'ecc',
      curve: 'curve25519',
      userIDs: [{ name, email }],
      format: 'armored',
    });

    const parsed = await openpgp.readKey({ armoredKey: publicKey });
    return {
      privateKey,
      publicKey,
      fingerprint: parsed.getFingerprint(),
    };
  } catch (err) {
    logger.error({ err: err.message }, 'PGP keypair generation failed');
    throw err;
  }
}

export default {
  validatePublicKey,
  encryptMessage,
  generateKeyPair,
};
