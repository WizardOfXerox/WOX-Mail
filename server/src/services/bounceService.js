/**
 * @fileoverview Automated Bounce & NDR (Non-Delivery Report) Ingestion Service.
 * Detects hard and soft bounces from incoming mail delivery failure notifications,
 * extracts bounced recipient addresses and diagnostic error codes, and updates subscriber records.
 */

import { query } from '../config/database.js';
import pino from 'pino';

const logger = pino({ name: 'woxmail:bounce-service' });

const BOUNCE_SENDER_PATTERNS = [
  /mailer-daemon@/i,
  /postmaster@/i,
  /mail-delivery-system@/i,
  /bounce.*@/i,
  /noreply.*@.*(?:bounce|mail)/i,
];

const BOUNCE_SUBJECT_PATTERNS = [
  /undelivered mail returned to sender/i,
  /delivery status notification \(failure\)/i,
  /delivery status notification/i,
  /failure notice/i,
  /mail delivery subsystem/i,
  /undeliverable:/i,
  /undelivered mail/i,
  /mail delivery failed/i,
  /returned mail: see transcript for details/i,
];

/**
 * Extracts a normalized header value from parsed email headers.
 * Supports Map, object, or array representations.
 * @param {Map|Object} headers
 * @param {string} headerName
 * @returns {string|null}
 */
function getHeaderValue(headers, headerName) {
  if (!headers) return null;
  const nameLower = headerName.toLowerCase();

  if (typeof headers.get === 'function') {
    const val = headers.get(nameLower);
    if (!val) return null;
    return typeof val === 'object' && val.text ? val.text : String(val);
  }

  for (const [key, val] of Object.entries(headers)) {
    if (key.toLowerCase() === nameLower) {
      if (!val) return null;
      return typeof val === 'object' && val.text ? val.text : String(val);
    }
  }

  return null;
}

/**
 * Extracts the first valid email address from a string.
 * @param {string} text
 * @returns {string|null}
 */
function extractEmailFromString(text) {
  if (!text) return null;
  const match = text.match(/[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/);
  return match ? match[0].toLowerCase() : null;
}

/**
 * Parses an email to determine if it is a bounce notification / NDR.
 * @param {Object} parsedEmail Mailparser object or custom parsed message
 * @returns {{ isBounce: boolean, bouncedEmail: string | null, bounceType: 'hard' | 'soft' | 'unknown', reason: string, diagnosticCode: string | null }}
 */
export function parseBounceNotification(parsedEmail) {
  if (!parsedEmail) {
    return {
      isBounce: false,
      bouncedEmail: null,
      bounceType: 'unknown',
      reason: 'No email provided',
      diagnosticCode: null,
    };
  }

  const headers = parsedEmail.headers || {};
  const subject = parsedEmail.subject || '';
  const textBody = parsedEmail.text || '';
  const htmlBody = parsedEmail.html || '';
  const fullBody = `${textBody}\n${htmlBody}`;

  // 1. Detect bounce indicators
  let isBounce = false;

  // From address check
  let fromAddress = '';
  if (parsedEmail.from) {
    if (typeof parsedEmail.from === 'string') {
      fromAddress = parsedEmail.from;
    } else if (parsedEmail.from.value && Array.isArray(parsedEmail.from.value) && parsedEmail.from.value[0]) {
      fromAddress = parsedEmail.from.value[0].address || '';
    } else if (parsedEmail.from.text) {
      fromAddress = parsedEmail.from.text;
    }
  }
  if (!fromAddress) {
    fromAddress = getHeaderValue(headers, 'from') || '';
  }

  if (BOUNCE_SENDER_PATTERNS.some((pattern) => pattern.test(fromAddress))) {
    isBounce = true;
  }

  // Subject check
  if (BOUNCE_SUBJECT_PATTERNS.some((pattern) => pattern.test(subject))) {
    isBounce = true;
  }

  // Content-Type check
  const contentType = getHeaderValue(headers, 'content-type') || parsedEmail.contentType || '';
  if (/multipart\/report/i.test(contentType) || /delivery-status/i.test(contentType)) {
    isBounce = true;
  }

  // Header check: X-Failed-Recipients
  const xFailedRecipients = getHeaderValue(headers, 'x-failed-recipients');
  if (xFailedRecipients) {
    isBounce = true;
  }

  // 2. Extract bounced recipient address
  let bouncedEmail = null;

  if (xFailedRecipients) {
    bouncedEmail = extractEmailFromString(xFailedRecipients);
  }

  if (!bouncedEmail) {
    const finalRecipientHeader = getHeaderValue(headers, 'final-recipient');
    if (finalRecipientHeader) {
      bouncedEmail = extractEmailFromString(finalRecipientHeader);
    }
  }

  if (!bouncedEmail) {
    const origRecipientHeader = getHeaderValue(headers, 'original-recipient');
    if (origRecipientHeader) {
      bouncedEmail = extractEmailFromString(origRecipientHeader);
    }
  }

  // Body extraction regexes for delivery reports
  if (!bouncedEmail && fullBody) {
    // Standard RFC 3464 format: "Final-Recipient: rfc822; user@example.com"
    const finalMatch = fullBody.match(/Final-Recipient\s*:\s*(?:rfc822\s*;\s*)?([^\r\n;<>]+@[^\r\n;<>]+)/i);
    if (finalMatch) {
      bouncedEmail = extractEmailFromString(finalMatch[1]);
    }

    // Original-Recipient
    if (!bouncedEmail) {
      const origMatch = fullBody.match(/Original-Recipient\s*:\s*(?:rfc822\s*;\s*)?([^\r\n;<>]+@[^\r\n;<>]+)/i);
      if (origMatch) {
        bouncedEmail = extractEmailFromString(origMatch[1]);
      }
    }

    // Postfix / Sendmail format: "<user@example.com>: host ..."
    if (!bouncedEmail) {
      const bracketMatch = fullBody.match(/<([a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,})>\s*:/i);
      if (bracketMatch) {
        bouncedEmail = bracketMatch[1].toLowerCase();
      }
    }

    // "Failed to deliver to user@example.com"
    if (!bouncedEmail) {
      const failedToMatch = fullBody.match(/(?:failed to deliver to|undeliverable to|failed recipient(?: is)?)\s*<?([a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,})>?/i);
      if (failedToMatch) {
        bouncedEmail = failedToMatch[1].toLowerCase();
      }
    }
  }

  // 3. Extract diagnostic code & status code
  let diagnosticCode = getHeaderValue(headers, 'diagnostic-code');
  if (!diagnosticCode && fullBody) {
    const diagMatch = fullBody.match(/Diagnostic-Code\s*:\s*([^\r\n]+(?:\r?\n\s+[^\r\n]+)*)/i);
    if (diagMatch) {
      diagnosticCode = diagMatch[1].trim().replace(/\r?\n\s+/g, ' ');
    }
  }

  let statusCode = getHeaderValue(headers, 'status');
  if (!statusCode && fullBody) {
    const statusMatch = fullBody.match(/Status\s*:\s*([45]\.\d+\.\d+)/i);
    if (statusMatch) {
      statusCode = statusMatch[1];
    }
  }

  // 4. Classify bounce type (hard vs soft)
  let bounceType = 'unknown';
  let reason = 'Undelivered message';

  const fullTextToInspect = `${diagnosticCode || ''} ${statusCode || ''} ${fullBody}`;

  // Check 5.x.x status code or 5xx SMTP diagnostic code (Hard bounce)
  if (
    (statusCode && statusCode.startsWith('5.')) ||
    /Diagnostic-Code:\s*smtp;\s*5\d\d/i.test(fullTextToInspect) ||
    /\b5\.\d+\.\d+\b/.test(fullTextToInspect) ||
    /\b55[0-4]\b/.test(fullTextToInspect)
  ) {
    bounceType = 'hard';
    reason = diagnosticCode || (statusCode ? `Permanent delivery failure (${statusCode})` : 'Hard bounce: Recipient address rejected or does not exist');
  }
  // Check 4.x.x status code or 4xx SMTP diagnostic code (Soft bounce)
  else if (
    (statusCode && statusCode.startsWith('4.')) ||
    /Diagnostic-Code:\s*smtp;\s*4\d\d/i.test(fullTextToInspect) ||
    /\b4\.\d+\.\d+\b/.test(fullTextToInspect) ||
    /\b421\b|\b45[0-2]\b/.test(fullTextToInspect)
  ) {
    bounceType = 'soft';
    reason = diagnosticCode || (statusCode ? `Temporary delivery delay/failure (${statusCode})` : 'Soft bounce: Mailbox full or temporary server issue');
  } else if (isBounce) {
    bounceType = 'unknown';
    reason = diagnosticCode || subject || 'Delivery status failure';
  }

  return {
    isBounce,
    bouncedEmail: bouncedEmail || null,
    bounceType,
    reason,
    diagnosticCode: diagnosticCode || null,
  };
}

/**
 * Records a bounce event in PostgreSQL subscribers table.
 * If hard bounce, updates status to 'bounced'.
 * @param {string} bouncedEmail Recipient email that bounced
 * @param {Object} details Bounce details from parseBounceNotification
 * @returns {Promise<{ success: boolean, updated: boolean, bouncedEmail: string }>}
 */
export async function recordBounce(bouncedEmail, details = {}) {
  if (!bouncedEmail) {
    return { success: false, updated: false, bouncedEmail: null };
  }

  const emailLower = bouncedEmail.toLowerCase().trim();
  const bounceType = details.bounceType || 'unknown';

  logger.info(
    {
      bouncedEmail: emailLower,
      bounceType,
      reason: details.reason,
      diagnosticCode: details.diagnosticCode,
    },
    'Processing email bounce record'
  );

  let updated = false;

  if (bounceType === 'hard') {
    try {
      // Execute the standard update query
      const result = await query(
        `UPDATE subscribers SET status = 'bounced', updated_at = NOW() WHERE LOWER(email) = LOWER($1)`,
        [emailLower]
      );
      updated = (result.rowCount || 0) > 0;
    } catch (err) {
      if (err.message && err.message.includes('updated_at')) {
        // If column updated_at is missing, add it and retry, or update status only
        try {
          await query(`ALTER TABLE subscribers ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ DEFAULT NOW()`);
          const result = await query(
            `UPDATE subscribers SET status = 'bounced', updated_at = NOW() WHERE LOWER(email) = LOWER($1)`,
            [emailLower]
          );
          updated = (result.rowCount || 0) > 0;
        } catch {
          const result = await query(
            `UPDATE subscribers SET status = 'bounced' WHERE LOWER(email) = LOWER($1)`,
            [emailLower]
          );
          updated = (result.rowCount || 0) > 0;
        }
      } else {
        logger.error({ err: err.message, email: emailLower }, 'Failed to update subscriber bounce status');
        throw err;
      }
    }
  }

  logger.info(
    { bouncedEmail: emailLower, bounceType, subscriberUpdated: updated },
    'Bounce recorded successfully'
  );

  return { success: true, updated, bouncedEmail: emailLower, bounceType };
}

/**
 * Parses and records a bounce notification if applicable.
 * @param {Object} parsedEmail
 * @returns {Promise<{ isBounce: boolean, bouncedEmail: string | null, bounceType: string, reason: string, diagnosticCode: string | null }>}
 */
export async function processBounceIfApplicable(parsedEmail) {
  const result = parseBounceNotification(parsedEmail);

  if (result.isBounce && result.bouncedEmail) {
    try {
      await recordBounce(result.bouncedEmail, result);
    } catch (err) {
      logger.warn({ err: err.message, email: result.bouncedEmail }, 'Error during recordBounce execution');
    }
  }

  return result;
}

export default {
  parseBounceNotification,
  recordBounce,
  processBounceIfApplicable,
};
