import dns from 'dns';
import pino from 'pino';

const logger = pino({ name: 'woxmail:email-verifier' });

// Ensure reliable DNS nameservers (Cloudflare + Google Public DNS)
try {
  dns.setServers(['1.1.1.1', '8.8.8.8', '1.0.0.1', '8.8.4.4']);
} catch (e) {
  logger.debug({ err: e.message }, 'Failed setting custom DNS nameservers — using system default');
}

const { promises: dnsPromises } = dns;

// In-Memory MX Cache: domain -> { hasMx: boolean, mxRecords: Array, timestamp: number }
const mxCache = new Map();
const MX_CACHE_TTL_MS = 60 * 60 * 1000; // 1 hour

// Top Known Reliable Email Providers (instant fallback)
const KNOWN_VALID_DOMAINS = new Set([
  'gmail.com',
  'googlemail.com',
  'outlook.com',
  'hotmail.com',
  'live.com',
  'msn.com',
  'yahoo.com',
  'ymail.com',
  'icloud.com',
  'me.com',
  'mac.com',
  'proton.me',
  'protonmail.com',
  'zoho.com',
  'aol.com',
  'mail.com',
  'gmx.com',
  'wox.world',
  'mail.wox.world',
  'purelymail.com',
]);

// RFC 5322 Compliant Email Syntax Regex
const EMAIL_REGEX = /^[a-zA-Z0-9.!#$%&'*+/=?^_`{|}~-]+@[a-zA-Z0-9](?:[a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?(?:\.[a-zA-Z0-9](?:[a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?)+$/;

// Common Email Provider Typo Map
const DOMAIN_TYPOS = {
  // Gmail typos
  'gamil.com': 'gmail.com',
  'gmial.com': 'gmail.com',
  'gmaill.com': 'gmail.com',
  'gmai.com': 'gmail.com',
  'gmeil.com': 'gmail.com',
  'gmaik.com': 'gmail.com',
  'gmail.co': 'gmail.com',
  'gmail.con': 'gmail.com',
  'gmaol.com': 'gmail.com',
  // Outlook / Hotmail typos
  'hotmial.com': 'hotmail.com',
  'hotmai.com': 'hotmail.com',
  'hotmaill.com': 'hotmail.com',
  'homail.com': 'hotmail.com',
  'outlok.com': 'outlook.com',
  'outloo.com': 'outlook.com',
  'outlock.com': 'outlook.com',
  'outlook.co': 'outlook.com',
  'outlook.con': 'outlook.com',
  // Yahoo typos
  'yaho.com': 'yahoo.com',
  'yahooo.com': 'yahoo.com',
  'yaho.co': 'yahoo.com',
  'yahoo.con': 'yahoo.com',
  'ymail.con': 'ymail.com',
  // iCloud typos
  'iclud.com': 'icloud.com',
  'icould.com': 'icloud.com',
  'icloud.con': 'icloud.com',
  // Proton typos
  'protonmial.com': 'protonmail.com',
  'prtonmail.com': 'protonmail.com',
  'protonmai.com': 'protonmail.com',
  'proton.con': 'proton.me',
};

/**
 * Check if the email syntax is strictly valid.
 * @param {string} email
 * @returns {boolean}
 */
export function isValidEmailSyntax(email) {
  if (!email || typeof email !== 'string') return false;
  const trimmed = email.trim();
  if (trimmed.length > 254) return false;
  if (!EMAIL_REGEX.test(trimmed)) return false;

  const [localPart, domain] = trimmed.split('@');
  if (!localPart || !domain) return false;
  if (localPart.length > 64) return false;
  if (domain.length > 253) return false;

  // Domain cannot start or end with a hyphen or dot
  if (domain.startsWith('-') || domain.endsWith('-') || domain.startsWith('.') || domain.endsWith('.')) {
    return false;
  }

  // TLD must have at least 2 characters
  const parts = domain.split('.');
  if (parts.length < 2 || parts[parts.length - 1].length < 2) {
    return false;
  }

  return true;
}

/**
 * Check if domain has a known typo and suggest correct domain.
 * @param {string} domain
 * @returns {string|null}
 */
export function getDomainTypoSuggestion(domain) {
  if (!domain) return null;
  const d = domain.toLowerCase().trim();
  return DOMAIN_TYPOS[d] || null;
}

/**
 * Check DNS Mail Exchange (MX) records for a domain.
 * Falls back to A record resolution (RFC 5321 implicit MX).
 * Results are cached in memory for high performance.
 *
 * @param {string} domain
 * @returns {Promise<{ hasMx: boolean, mxRecords: Array, isCached: boolean }>}
 */
export async function resolveDomainMx(domain) {
  const d = domain.toLowerCase().trim();

  // Check cache
  const cached = mxCache.get(d);
  if (cached && (Date.now() - cached.timestamp < MX_CACHE_TTL_MS)) {
    return { hasMx: cached.hasMx, mxRecords: cached.mxRecords, isCached: true };
  }

  // Instant match for top known reliable providers
  if (KNOWN_VALID_DOMAINS.has(d)) {
    const knownMx = [{ exchange: `mail.${d}`, priority: 10, isKnown: true }];
    mxCache.set(d, { hasMx: true, mxRecords: knownMx, timestamp: Date.now() });
    return { hasMx: true, mxRecords: knownMx, isCached: false };
  }

  try {
    // 1. Try MX record lookup
    const mxRecords = await dnsPromises.resolveMx(d);
    if (mxRecords && mxRecords.length > 0) {
      const sorted = mxRecords.sort((a, b) => a.priority - b.priority);
      mxCache.set(d, { hasMx: true, mxRecords: sorted, timestamp: Date.now() });
      return { hasMx: true, mxRecords: sorted, isCached: false };
    }
  } catch (mxErr) {
    // If NO DATA or NOT FOUND, try fallback A record lookup
    if (mxErr.code !== 'ENODATA' && mxErr.code !== 'ENOTFOUND') {
      logger.debug({ domain: d, code: mxErr.code }, 'MX resolution warning');
    }
  }

  // 2. RFC 5321 Fallback: Query A / AAAA records
  try {
    const aRecords = await dnsPromises.resolve4(d);
    if (aRecords && aRecords.length > 0) {
      const fallbackMx = [{ exchange: d, priority: 0, isFallbackA: true }];
      mxCache.set(d, { hasMx: true, mxRecords: fallbackMx, timestamp: Date.now() });
      return { hasMx: true, mxRecords: fallbackMx, isCached: false };
    }
  } catch (aErr) {
    logger.debug({ domain: d, code: aErr.code }, 'A record resolution failed for domain');
  }

  // Domain cannot accept inbound mail
  mxCache.set(d, { hasMx: false, mxRecords: [], timestamp: Date.now() });
  return { hasMx: false, mxRecords: [], isCached: false };
}

/**
 * Perform comprehensive pre-flight verification of a single recipient email.
 *
 * @param {string} email
 * @param {object} options
 * @param {boolean} [options.checkMx=true] - Perform DNS MX check
 * @returns {Promise<{
 *   valid: boolean,
 *   email: string,
 *   localPart?: string,
 *   domain?: string,
 *   reason?: string,
 *   suggestion?: string,
 *   mxRecords?: Array
 * }>}
 */
export async function verifyRecipientEmail(email, { checkMx = true } = {}) {
  if (!email || typeof email !== 'string') {
    return { valid: false, email: String(email || ''), reason: 'Recipient email cannot be empty' };
  }

  const clean = email.trim();

  // 1. Syntax check
  if (!isValidEmailSyntax(clean)) {
    return { valid: false, email: clean, reason: 'Invalid email address format' };
  }

  const [localPart, domain] = clean.split('@');
  const dLower = domain.toLowerCase();

  // 2. Typo suggestion
  const typoSuggestion = getDomainTypoSuggestion(dLower);
  const suggestion = typoSuggestion ? `${localPart}@${typoSuggestion}` : null;

  // 3. DNS MX check
  let mxResult = { hasMx: true, mxRecords: [] };
  if (checkMx) {
    try {
      mxResult = await resolveDomainMx(dLower);
      if (!mxResult.hasMx) {
        return {
          valid: false,
          email: clean,
          localPart,
          domain: dLower,
          suggestion,
          reason: `Domain "${dLower}" does not have active mail servers (MX) and cannot receive email.`,
        };
      }
    } catch (err) {
      logger.warn({ domain: dLower, err: err.message }, 'DNS lookup failure during recipient verification');
    }
  }

  return {
    valid: true,
    email: clean,
    localPart,
    domain: dLower,
    suggestion,
    mxRecords: mxResult.mxRecords || [],
  };
}

/**
 * Validate a batch or list of recipient emails (To, CC, BCC).
 *
 * @param {string|string[]} recipients - Comma-separated string or array of emails
 * @param {object} options
 * @returns {Promise<{
 *   valid: boolean,
 *   verifiedCount: number,
 *   invalidEmails: Array<{ email: string, reason: string, suggestion?: string }>,
 *   suggestions: Array<{ original: string, suggested: string }>
 * }>}
 */
export async function verifyRecipientList(recipients, { checkMx = true } = {}) {
  let list = [];
  if (Array.isArray(recipients)) {
    list = recipients.map((r) => String(r || '').trim()).filter(Boolean);
  } else if (typeof recipients === 'string') {
    list = recipients.split(',').map((r) => r.trim()).filter(Boolean);
  }

  const invalidEmails = [];
  const suggestions = [];

  for (const raw of list) {
    // Extract email from "Name <email@example.com>" if present
    const match = raw.match(/<([^>]+)>/) || [null, raw];
    const emailToTest = (match[1] || raw).trim();

    const check = await verifyRecipientEmail(emailToTest, { checkMx });
    if (!check.valid) {
      invalidEmails.push({ email: raw, reason: check.reason, suggestion: check.suggestion });
    }
    if (check.suggestion) {
      suggestions.push({ original: raw, suggested: check.suggestion });
    }
  }

  return {
    valid: invalidEmails.length === 0,
    verifiedCount: list.length - invalidEmails.length,
    invalidEmails,
    suggestions,
  };
}

export default {
  isValidEmailSyntax,
  getDomainTypoSuggestion,
  resolveDomainMx,
  verifyRecipientEmail,
  verifyRecipientList,
};
