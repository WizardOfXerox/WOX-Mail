/**
 * @fileoverview OTP (TOTP) service for WoxMail.
 * Wraps otplib for generating secrets, QR codes, and verification.
 */

import { authenticator } from 'otplib';
import qrcode from 'qrcode';

authenticator.options = {
  window: 1, // Allow 1 step drift (30s before/after)
};

/**
 * Generate a new TOTP secret.
 * @returns {string} Base32-encoded secret
 */
export function generateSecret() {
  return authenticator.generateSecret();
}

/**
 * Generate a QR code data URL for adding to an authenticator app.
 * @param {string} secret - Base32 secret
 * @param {string} email - User's email (label)
 * @returns {Promise<string>} QR code as data:image/png;base64 URL
 */
export async function generateQRCode(secret, email) {
  const otpauth = authenticator.keyuri(email, 'WoxMail', secret);
  return qrcode.toDataURL(otpauth, {
    width: 256,
    margin: 2,
    color: {
      dark: '#f0f0f5',
      light: '#1a1a2e',
    },
  });
}

/**
 * Verify a TOTP code against a secret.
 * @param {string} code - 6-digit code from authenticator
 * @param {string} secret - Base32 secret
 * @returns {boolean} Whether the code is valid
 */
export function verifyCode(code, secret) {
  return authenticator.check(code, secret);
}

/**
 * Generate a current TOTP code (for testing).
 * @param {string} secret - Base32 secret
 * @returns {string} Current 6-digit code
 */
export function generateCode(secret) {
  return authenticator.generate(secret);
}

/**
 * Get time remaining until current code expires.
 * @returns {number} Seconds remaining (0-30)
 */
export function getTimeRemaining() {
  return authenticator.timeRemaining();
}

export default { generateSecret, generateQRCode, verifyCode, generateCode, getTimeRemaining };
