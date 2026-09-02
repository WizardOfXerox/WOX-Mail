import * as openpgp from 'openpgp';

/**
 * Proton OpenPGP Cryptographic Engine.
 * Manages client-side unlocking of private keys, message body decryption,
 * attachment decryption, and outbound compose encryption.
 */

class ProtonCryptoEngine {
  constructor() {
    this.privateKeys = new Map(); // addressId -> unlocked PrivateKey
    this.primaryKey = null;       // primary unlocked PrivateKey
  }

  /**
   * Unlock user and address keys with the mailbox password.
   * @param {Array} keys - User and address keys from Proton API
   * @param {string} password - User password or key passphrase
   */
  async unlockKeys(keys, password) {
    this.privateKeys.clear();
    this.primaryKey = null;

    for (const k of keys) {
      try {
        const privateKeyArmored = k.PrivateKey || k.Key;
        if (!privateKeyArmored) continue;

        const privKey = await openpgp.readPrivateKey({ armoredKey: privateKeyArmored });
        const unlockedKey = await openpgp.decryptKey({
          privateKey: privKey,
          passphrase: password,
        });

        if (k.AddressID) {
          this.privateKeys.set(k.AddressID, unlockedKey);
        }
        if (k.Primary === 1 || !this.primaryKey) {
          this.primaryKey = unlockedKey;
        }
      } catch (err) {
        console.warn(`[ProtonCrypto] Failed to unlock key ${k.ID}:`, err.message);
      }
    }

    if (!this.primaryKey) {
      throw new Error('Could not unlock any Proton PGP private keys. Please check your password.');
    }
  }

  /**
   * Decrypt a PGP-encrypted message body.
   * @param {string} armoredMessage - PGP Armored Message Body
   * @param {string} addressId - Target address ID
   * @returns {Promise<string>} - Decrypted HTML / Plaintext
   */
  async decryptMessageBody(armoredMessage, addressId = null) {
    if (!armoredMessage) return '';
    if (!armoredMessage.includes('-----BEGIN PGP MESSAGE-----')) {
      return armoredMessage; // Plaintext fallback
    }

    const decryptionKey = (addressId && this.privateKeys.get(addressId)) || this.primaryKey;
    if (!decryptionKey) {
      throw new Error('No unlocked private key available for decryption.');
    }

    try {
      const message = await openpgp.readMessage({ armoredMessage });
      const { data: decrypted } = await openpgp.decrypt({
        message,
        decryptionKeys: decryptionKey,
      });

      return decrypted;
    } catch (err) {
      console.error('[ProtonCrypto] Body decryption failure:', err);
      return `<div class="text-error" style="padding: 1rem; border: 1px solid var(--color-error); border-radius: 8px;">
        <strong>Decryption Error:</strong> Unable to decrypt message with active session key. (${err.message})
      </div>`;
    }
  }

  /**
   * Decrypt an attachment payload.
   * @param {Uint8Array} encryptedBytes - Encrypted attachment binary
   * @param {string} sessionKeyPacket - Optional session key packet
   * @param {string} addressId - Target address ID
   * @returns {Promise<Uint8Array>} - Decrypted binary bytes
   */
  async decryptAttachment(encryptedBytes, sessionKeyPacket = null, addressId = null) {
    const decryptionKey = (addressId && this.privateKeys.get(addressId)) || this.primaryKey;
    const message = await openpgp.readMessage({ binaryMessage: encryptedBytes });
    const { data: decrypted } = await openpgp.decrypt({
      message,
      decryptionKeys: decryptionKey,
      format: 'binary',
    });

    return decrypted;
  }

  /**
   * Encrypt an outbound message for recipients.
   * @param {string} plaintext - HTML or Text message body
   * @param {Array<string>} recipientPublicKeys - Armored public keys of recipients
   * @param {string} fromAddressId - Sender address ID
   * @returns {Promise<{armoredBody: string}>}
   */
  async encryptOutboundMessage(plaintext, recipientPublicKeys = [], fromAddressId = null) {
    const signingKey = (fromAddressId && this.privateKeys.get(fromAddressId)) || this.primaryKey;
    const encryptionKeys = [];

    // Always include sender key so sent message can be read in Sent folder
    if (signingKey) {
      encryptionKeys.push(signingKey.toPublic());
    }

    for (const pubArmored of recipientPublicKeys) {
      try {
        const pubKey = await openpgp.readKey({ armoredKey: pubArmored });
        encryptionKeys.push(pubKey);
      } catch (err) {
        console.warn('[ProtonCrypto] Invalid recipient public key:', err.message);
      }
    }

    const message = await openpgp.createMessage({ text: plaintext });
    const armoredBody = await openpgp.encrypt({
      message,
      encryptionKeys,
      signingKeys: signingKey,
    });

    return { armoredBody };
  }
}

export const protonCrypto = new ProtonCryptoEngine();
