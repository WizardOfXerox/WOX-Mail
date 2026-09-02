/**
 * @fileoverview SMS OTP code extraction utility.
 * Detects verification codes in SMS messages for WoxSMS.
 */

/**
 * Common OTP patterns (4-8 digit codes preceded by keywords).
 */
const OTP_PATTERNS = [
  // "Your code is 123456" / "verification code: 123456"
  /(?:code|código|kode|otp|pin|token|passcode)[:\s]*(\d{4,8})/i,
  // "123456 is your code"
  /(\d{4,8})\s*(?:is your|est votre|adalah)\s*(?:code|otp|pin|verification)/i,
  // G-123456 (Google style)
  /[gG]-(\d{4,8})/,
  // Standalone 6-digit code on its own line
  /^\s*(\d{6})\s*$/m,
  // "Use 123456 to verify" / "enter 123456"
  /(?:use|enter|input|type|submit|confirm)\s+(\d{4,8})/i,
  // Code at end of message: "... 123456"
  /[\s:](\d{6})\s*\.?\s*$/,
];

/**
 * Extract an OTP code from SMS text.
 * @param {string} message - SMS message body
 * @returns {{isOtp: boolean, code: string|null}}
 */
export function extractOTP(message) {
  if (!message || typeof message !== 'string') {
    return { isOtp: false, code: null };
  }

  // Check for keywords that suggest this is an OTP message
  const otpKeywords = /verif|code|otp|pin|passcode|authentication|confirm|token|2fa|two.?factor/i;
  const hasKeyword = otpKeywords.test(message);

  for (const pattern of OTP_PATTERNS) {
    const match = message.match(pattern);
    if (match && match[1]) {
      return { isOtp: true, code: match[1] };
    }
  }

  // Fallback: if message is short and contains a 6-digit number
  if (hasKeyword && message.length < 200) {
    const digitMatch = message.match(/\b(\d{6})\b/);
    if (digitMatch) {
      return { isOtp: true, code: digitMatch[1] };
    }
  }

  return { isOtp: false, code: null };
}

/**
 * Check if a message is likely an OTP/verification SMS.
 * @param {string} message - SMS body
 * @returns {boolean}
 */
export function isOtpMessage(message) {
  return extractOTP(message).isOtp;
}

export default { extractOTP, isOtpMessage };
