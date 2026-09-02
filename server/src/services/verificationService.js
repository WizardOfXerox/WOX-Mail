/**
 * @fileoverview Dual-Mode Verification Engine (Type 6-Digit Code OR Reply-to-Verify).
 * Manages verification sessions, cryptographic 6-digit codes, VERP Reply-To email dispatch,
 * inbound reply parsing, and real-time WebSocket push notifications.
 */

import crypto from 'crypto';
import { query } from '../config/database.js';
import { get, setex, del } from '../config/redis.js';
import { createTransporter } from './smtp.js';
import { generateUrlSafeToken } from '../utils/crypto.js';
import pino from 'pino';

const logger = pino({ name: 'woxmail:verification-service' });

let ioInstance = null;

/**
 * Attach global Socket.IO instance for real-time broadcast.
 * @param {import('socket.io').Server} io
 */
export function setVerificationSocketIO(io) {
  ioInstance = io;
}

/**
 * Generate a cryptographically secure 6-digit numeric verification code.
 * @returns {string} e.g. "482910"
 */
export function generateNumericCode() {
  const num = crypto.randomInt(100000, 999999);
  return String(num);
}

/**
 * Create and dispatch a dual-mode verification challenge.
 *
 * @param {Object} params
 * @param {'recovery_email'|'newsletter_optin'|'step_up'} params.type
 * @param {string} params.targetEmail - Recipient email address to verify
 * @param {number} [params.userId] - Associated permanent user ID (if applicable)
 * @param {Object} [params.meta] - Additional action payload
 * @param {number} [params.ttlSeconds=900] - Expiry in seconds (default 15 minutes)
 * @returns {Promise<{ sessionToken: string, expiresAt: Date, targetEmail: string }>}
 */
export async function createVerificationSession({ type, targetEmail, userId = null, meta = {}, ttlSeconds = 900 }) {
  const cleanEmail = targetEmail.trim().toLowerCase();
  const code = generateNumericCode();
  const sessionToken = `vtok_${generateUrlSafeToken(16)}`;
  const expiresAt = new Date(Date.now() + ttlSeconds * 1000);

  const sessionData = {
    sessionToken,
    type,
    targetEmail: cleanEmail,
    userId,
    code,
    meta,
    expiresAt: expiresAt.toISOString(),
    status: 'pending',
    createdAt: new Date().toISOString(),
  };

  // 1. Store in Redis/Memory store
  await setex(`vsession:${sessionToken}`, ttlSeconds, JSON.stringify(sessionData));
  await setex(`vcode:${cleanEmail}:${code}`, ttlSeconds, sessionToken);

  // 2. Dispatch Dual-Mode Verification Email
  const domain = process.env.DOMAIN_PERMANENT || 'wox.world';
  const replyTo = `verify+${sessionToken}@${domain}`;
  const senderEmail = process.env.NO_REPLY_EMAIL || `noreply@${domain}`;

  let subjectTitle = 'Email Verification';
  let actionDescription = 'verify your request';

  if (type === 'recovery_email') {
    subjectTitle = 'Link Secondary Recovery Email';
    actionDescription = 'link this address as your trusted recovery email for WoxMail';
  } else if (type === 'newsletter_optin') {
    subjectTitle = 'Confirm Newsletter Subscription';
    actionDescription = `confirm your subscription to "${meta.listName || 'our newsletter'}"`;
  } else if (type === 'step_up') {
    subjectTitle = 'Security Authorization Code';
    actionDescription = 'authorize a high-security action on your WoxMail account';
  }

  const subject = `🔐 [Code: ${code}] ${subjectTitle} — WoxMail [VERIFY-${sessionToken}]`;

  const htmlBody = `
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <style>
    body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, sans-serif; background: #0f0f1a; color: #f0f0f5; margin: 0; padding: 30px 15px; }
    .card { max-width: 540px; margin: 0 auto; background: #1a1a2e; border: 1px solid #2a2a4a; border-radius: 16px; padding: 36px 30px; box-shadow: 0 10px 30px rgba(0,0,0,0.5); }
    .badge { display: inline-block; background: rgba(124, 58, 237, 0.18); color: #c084fc; border: 1px solid rgba(124, 58, 237, 0.35); font-size: 11px; font-weight: 700; text-transform: uppercase; letter-spacing: 1px; padding: 4px 12px; border-radius: 999px; margin-bottom: 16px; }
    h1 { font-size: 22px; margin: 0 0 12px; color: #ffffff; }
    p { font-size: 14px; line-height: 1.6; color: #a1a1c2; margin: 0 0 20px; }
    .code-box { background: #0b0b14; border: 1px solid #7c3aed; border-radius: 12px; padding: 20px; text-align: center; margin: 24px 0; }
    .code-digits { font-family: 'JetBrains Mono', Consolas, monospace; font-size: 36px; font-weight: 800; letter-spacing: 10px; color: #a78bfa; margin: 0; }
    .dual-box { background: rgba(59, 130, 246, 0.08); border-left: 3px solid #3b82f6; padding: 14px 16px; border-radius: 0 8px 8px 0; margin: 20px 0; font-size: 13px; color: #93c5fd; line-height: 1.5; }
    .footer { text-align: center; margin-top: 28px; font-size: 12px; color: #6868a0; }
  </style>
</head>
<body>
  <div class="card">
    <div class="badge">🛡️ WoxMail Sovereign Verification</div>
    <h1>${subjectTitle}</h1>
    <p>You requested to ${actionDescription}. Choose whichever verification method is most convenient for you:</p>

    <div class="code-box">
      <div style="font-size: 12px; text-transform: uppercase; letter-spacing: 1px; color: #8b5cf6; margin-bottom: 8px; font-weight: 600;">Your 6-Digit Verification Code</div>
      <div class="code-digits">${code}</div>
      <div style="font-size: 12px; color: #71719a; margin-top: 8px;">Expires in ${Math.round(ttlSeconds / 60)} minutes</div>
    </div>

    <div class="dual-box">
      <strong>⚡ Zero-Friction Option:</strong> You can simply <strong>hit Reply</strong> to this email with the code <strong>${code}</strong> in your message. Your browser screen will automatically verify and advance live!
    </div>

    <p style="font-size: 12px; color: #71719a;">If you did not request this verification, you can safely ignore this email.</p>
  </div>
  <div class="footer">
    &copy; ${new Date().getFullYear()} WoxMail Privacy Suite &bull; wox.world
  </div>
</body>
</html>
`;

  const plainBody = `
WoxMail Verification Code: ${code}

You requested to ${actionDescription}.

Option 1: Enter code "${code}" on screen.
Option 2 (Zero Friction): Simply hit Reply to this email and send the code "${code}".

This code expires in ${Math.round(ttlSeconds / 60)} minutes.
Session: [VERIFY-${sessionToken}]
`;

  try {
    const transporter = await createTransporter();
    await transporter.sendMail({
      from: `"WoxMail Security" <${senderEmail}>`,
      to: cleanEmail,
      replyTo: replyTo,
      subject: subject,
      text: plainBody,
      html: htmlBody,
      headers: {
        'X-WoxMail-Verification-Token': sessionToken,
        'X-WoxMail-Verification-Type': type,
      },
    });
    logger.info({ email: cleanEmail, type, sessionToken }, 'Dual-mode verification email dispatched');
  } catch (err) {
    logger.warn({ err: err.message, email: cleanEmail }, 'SMTP dispatch warning in dev mode — verification session is still active');
  }

  return { sessionToken, expiresAt, targetEmail: cleanEmail };
}

/**
 * Complete a verification session and execute registered post-action.
 *
 * @param {Object} session - Active session object
 * @param {'code_entry'|'inbound_reply'} method - Verification pathway
 * @returns {Promise<{ success: boolean, type: string, message: string }>}
 */
async function executePostVerification(session, method = 'code_entry') {
  const { type, targetEmail, userId, meta, sessionToken } = session;
  let message = 'Verification successful';

  if (type === 'recovery_email') {
    if (userId) {
      await query(
        'UPDATE users SET recovery_email = $1, updated_at = NOW() WHERE id = $2',
        [targetEmail, userId]
      );
      message = `Recovery email ${targetEmail} verified and attached to account.`;
    }
  } else if (type === 'newsletter_optin') {
    const listId = meta.listId;
    if (listId) {
      await query(
        `UPDATE subscribers
         SET status = 'active', confirmed_at = NOW()
         WHERE list_id = $1 AND email = $2`,
        [listId, targetEmail]
      );
      message = `Subscription to ${meta.listName || 'mailing list'} confirmed!`;
    }
  } else if (type === 'step_up') {
    // Generate 5-minute step-up authorization token
    const stepUpAuthToken = `stepup_${generateUrlSafeToken(24)}`;
    await setex(`stepup_auth:${stepUpAuthToken}`, 300, JSON.stringify({ userId, targetEmail, meta }));
    message = 'Step-up security challenge authorized.';
    session.stepUpAuthToken = stepUpAuthToken;
  }

  // Update session status in store
  session.status = 'verified';
  session.verifiedAt = new Date().toISOString();
  session.verifiedMethod = method;
  await setex(`vsession:${sessionToken}`, 300, JSON.stringify(session));

  // Clean up code map
  await del(`vcode:${targetEmail}:${session.code}`);

  // Broadcast WebSocket notification to connected browser tabs
  if (ioInstance) {
    ioInstance.emit('verification_success', {
      sessionToken,
      type,
      targetEmail,
      method,
      message,
      stepUpAuthToken: session.stepUpAuthToken || null,
    });
  }

  logger.info({ sessionToken, type, targetEmail, method }, 'Verification completed successfully');
  return { success: true, type, message, stepUpAuthToken: session.stepUpAuthToken || null };
}

/**
 * Manually verify 6-digit code submitted via web UI.
 *
 * @param {string} sessionToken
 * @param {string} inputCode
 * @returns {Promise<{ success: boolean, message: string }>}
 */
export async function verifyCode(sessionToken, inputCode) {
  if (!sessionToken || !inputCode) {
    throw new Error('Session token and verification code are required');
  }

  const rawSession = await get(`vsession:${sessionToken}`);
  if (!rawSession) {
    throw new Error('Verification session expired or invalid');
  }

  const session = JSON.parse(rawSession);
  if (session.status === 'verified') {
    return { success: true, message: 'Already verified' };
  }

  const cleanInput = String(inputCode).trim();
  if (cleanInput !== String(session.code).trim()) {
    throw new Error('Incorrect 6-digit verification code. Please check and try again.');
  }

  return await executePostVerification(session, 'code_entry');
}

/**
 * Process inbound email reply received by the system.
 * Scans for VERP token `verify+<token>`, subject tag `[VERIFY-<token>]`, or sender code match.
 *
 * @param {Object} params
 * @param {string} params.fromEmail
 * @param {string} [params.toEmail]
 * @param {string} [params.subject]
 * @param {string} [params.textBody]
 * @returns {Promise<{ processed: boolean, sessionToken?: string, error?: string }>}
 */
export async function processInboundReply({ fromEmail, toEmail = '', subject = '', textBody = '' }) {
  const cleanFrom = fromEmail.trim().toLowerCase();

  // 1. Extract sessionToken from To: address (e.g. verify+vtok_12345@wox.world)
  let sessionToken = null;
  const verpMatch = toEmail.match(/verify\+([a-zA-Z0-9_-]+)@/i);
  if (verpMatch) {
    sessionToken = verpMatch[1];
  }

  // 2. Fallback: Extract sessionToken from Subject [VERIFY-vtok_12345]
  if (!sessionToken) {
    const subjectMatch = subject.match(/\[VERIFY-([a-zA-Z0-9_-]+)\]/i);
    if (subjectMatch) {
      sessionToken = subjectMatch[1];
    }
  }

  // 3. Extract 6-digit code from subject or body
  const combinedText = `${subject} ${textBody}`;
  const codeMatch = combinedText.match(/\b([0-9]{6})\b/);
  const detectedCode = codeMatch ? codeMatch[1] : null;

  // 4. If we have sessionToken:
  if (sessionToken) {
    const rawSession = await get(`vsession:${sessionToken}`);
    if (rawSession) {
      const session = JSON.parse(rawSession);
      if (session.status === 'verified') {
        return { processed: true, sessionToken, message: 'Already verified' };
      }
      // If the email is from the target recipient OR contains the valid code
      if (session.targetEmail === cleanFrom || (detectedCode && detectedCode === session.code)) {
        await executePostVerification(session, 'inbound_reply');
        return { processed: true, sessionToken, message: 'Inbound reply verified via session' };
      }
    }
  }

  // 5. Fallback: Look up by fromEmail + detectedCode
  if (detectedCode) {
    const matchedToken = await get(`vcode:${cleanFrom}:${detectedCode}`);
    if (matchedToken) {
      const rawSession = await get(`vsession:${matchedToken}`);
      if (rawSession) {
        const session = JSON.parse(rawSession);
        await executePostVerification(session, 'inbound_reply');
        return { processed: true, sessionToken: matchedToken, message: 'Inbound reply verified via code match' };
      }
    }
  }

  return { processed: false, error: 'No matching active verification session' };
}

/**
 * Get status of an ongoing verification session.
 * @param {string} sessionToken
 */
export async function getVerificationStatus(sessionToken) {
  const rawSession = await get(`vsession:${sessionToken}`);
  if (!rawSession) {
    return { status: 'expired' };
  }
  const session = JSON.parse(rawSession);
  return {
    status: session.status,
    type: session.type,
    targetEmail: session.targetEmail,
    expiresAt: session.expiresAt,
    stepUpAuthToken: session.stepUpAuthToken || null,
  };
}

export default {
  setVerificationSocketIO,
  generateNumericCode,
  createVerificationSession,
  verifyCode,
  processInboundReply,
  getVerificationStatus,
};
