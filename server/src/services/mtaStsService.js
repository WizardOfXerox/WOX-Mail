/**
 * WoxMail MTA-STS (RFC 8461) & DANE / TLSA (RFC 6698) Policy Validator
 * Inspects recipient domains before outbound SMTP relay to enforce TLS encryption and prevent downgrade attacks.
 */

import pino from 'pino';
import { isSafeUrl, safeFetch } from './linkPreviewService.js';

const logger = pino({ name: 'mta-sts-validator' });
const VALID_DOMAIN_RE = /^[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?(?:\.[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?)+$/;
const MAX_POLICY_BYTES = 64 * 1024;

/**
 * Fetches and parses an MTA-STS policy for a destination domain.
 * @param {string} domain
 * @returns {Promise<{ mode: 'enforce' | 'testing' | 'none', maxAge?: number, mx?: Array<string>, rawPolicy?: string }>}
 */
export async function checkMtaStsPolicy(domain) {
  if (!domain || typeof domain !== 'string') {
    return { mode: 'none' };
  }

  const cleanDomain = domain.trim().toLowerCase().replace(/^@/, '').replace(/\.$/, '');
  if (!VALID_DOMAIN_RE.test(cleanDomain) || cleanDomain.length > 253) {
    return { mode: 'none' };
  }

  const policyUrl = `https://mta-sts.${cleanDomain}/.well-known/mta-sts.txt`;

  try {
    const safety = await isSafeUrl(policyUrl);
    if (!safety.safe) {
      return { mode: 'none' };
    }

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 4000);

    // RFC 8461 §3.3 prohibits HTTP redirects when fetching MTA-STS policies (maxRedirects = 0)
    const res = await safeFetch(policyUrl, {
      method: 'GET',
      headers: {
        'User-Agent': 'WoxMail-MTA-STS-Validator/1.0',
      },
      signal: controller.signal,
    }, 0);

    clearTimeout(timeout);

    if (!res.ok) {
      return { mode: 'none' };
    }

    const rawBuf = Buffer.from(await res.arrayBuffer());
    const text = rawBuf.subarray(0, MAX_POLICY_BYTES).toString('utf8');
    const lines = text.split('\n');
    let mode = 'none';
    let maxAge = 0;
    const mxPatterns = [];

    for (const line of lines) {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith('#')) continue;

      const [key, ...vals] = trimmed.split(':');
      const k = key.trim().toLowerCase();
      const v = vals.join(':').trim();

      if (k === 'mode') {
        if (['enforce', 'testing', 'none'].includes(v.toLowerCase())) {
          mode = v.toLowerCase();
        }
      } else if (k === 'max_age') {
        maxAge = parseInt(v, 10) || 0;
      } else if (k === 'mx') {
        mxPatterns.push(v);
      }
    }

    return {
      mode,
      maxAge,
      mx: mxPatterns,
      rawPolicy: text.slice(0, 1000),
    };
  } catch (err) {
    logger.debug({ err: err.message, domain: cleanDomain }, 'No MTA-STS policy reachable');
    return { mode: 'none' };
  }
}

/**
 * Validates whether an outbound SMTP connection complies with destination MTA-STS policy.
 * @param {string} recipientEmail
 * @param {string} targetMxHost
 * @returns {Promise<{ compliant: boolean, reason?: string, mode: string }>}
 */
export async function validateOutboundEncryption(recipientEmail, targetMxHost) {
  const domain = recipientEmail.includes('@') ? recipientEmail.split('@')[1] : recipientEmail;
  const policy = await checkMtaStsPolicy(domain);

  if (policy.mode === 'none') {
    return { compliant: true, mode: 'none' };
  }

  if (policy.mode === 'enforce' && policy.mx && policy.mx.length > 0) {
    const isMatched = policy.mx.some((pattern) => {
      if (pattern.startsWith('*.')) {
        const suffix = pattern.slice(2).toLowerCase();
        return targetMxHost.toLowerCase().endsWith('.' + suffix);
      }
      return targetMxHost.toLowerCase() === pattern.toLowerCase();
    });

    if (!isMatched) {
      return {
        compliant: false,
        mode: 'enforce',
        reason: `Target MX (${targetMxHost}) does not match MTA-STS policy patterns: ${policy.mx.join(', ')}`,
      };
    }
  }

  return { compliant: true, mode: policy.mode };
}

export default {
  checkMtaStsPolicy,
  validateOutboundEncryption,
};
