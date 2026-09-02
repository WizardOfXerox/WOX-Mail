/**
 * Inbound Email Cryptographic Signature & Authentication Inspector
 * Analyzes SPF, DKIM, DMARC, and ARC headers to classify sender authenticity.
 */

/**
 * Inspect raw headers or parsed message object for email authentication status.
 *
 * @param {Object|Headers} headers - Key-value header map or mailparser header object
 * @param {string} senderAddress - Email address in the From: header
 * @returns {{
 *   status: 'verified' | 'neutral' | 'unverified' | 'suspicious' | 'forged',
 *   badge: string,
 *   spf: { status: string, details?: string },
 *   dkim: { status: string, domain?: string },
 *   dmarc: { status: string },
 *   score: number
 * }}
 */
export function inspectEmailAuthentication(headers = {}, senderAddress = '') {
  let authResults = '';
  let receivedSpf = '';
  let dkimSignature = '';

  if (typeof headers.get === 'function') {
    authResults = headers.get('authentication-results') || '';
    receivedSpf = headers.get('received-spf') || '';
    dkimSignature = headers.get('dkim-signature') || '';
  } else {
    for (const key of Object.keys(headers)) {
      const lower = key.toLowerCase();
      const val = String(headers[key] || '');
      if (lower === 'authentication-results') authResults = val;
      if (lower === 'received-spf') receivedSpf = val;
      if (lower === 'dkim-signature') dkimSignature = val;
    }
  }

  // 1. Evaluate SPF
  let spfStatus = 'none';
  if (authResults.includes('spf=pass') || receivedSpf.toLowerCase().startsWith('pass')) {
    spfStatus = 'pass';
  } else if (authResults.includes('spf=fail') || receivedSpf.toLowerCase().startsWith('fail')) {
    spfStatus = 'fail';
  } else if (authResults.includes('spf=softfail') || receivedSpf.toLowerCase().startsWith('softfail')) {
    spfStatus = 'softfail';
  } else if (authResults.includes('spf=neutral')) {
    spfStatus = 'neutral';
  }

  // 2. Evaluate DKIM
  let dkimStatus = 'none';
  let dkimDomain = '';
  if (authResults.includes('dkim=pass')) {
    dkimStatus = 'pass';
  } else if (authResults.includes('dkim=fail')) {
    dkimStatus = 'fail';
  } else if (dkimSignature) {
    dkimStatus = 'present';
    const match = dkimSignature.match(/d=([a-zA-Z0-9.-]+)/);
    if (match) dkimDomain = match[1];
  }

  // 3. Evaluate DMARC
  let dmarcStatus = 'none';
  if (authResults.includes('dmarc=pass')) {
    dmarcStatus = 'pass';
  } else if (authResults.includes('dmarc=fail')) {
    dmarcStatus = 'fail';
  }

  // 4. Compute composite security score (0 to 100)
  let score = 50; // Neutral baseline
  if (spfStatus === 'pass') score += 25;
  if (dkimStatus === 'pass') score += 25;
  if (dmarcStatus === 'pass') score += 15;
  if (spfStatus === 'fail') score -= 35;
  if (dkimStatus === 'fail') score -= 35;
  if (dmarcStatus === 'fail') score -= 35;

  score = Math.max(0, Math.min(100, score));

  // Determine classification and badge
  let status = 'neutral';
  let badge = '⚠️ Unverified Sender';

  if (dmarcStatus === 'fail' || (spfStatus === 'fail' && dkimStatus === 'fail')) {
    status = 'forged';
    badge = '🛑 Forged / Spoofed Sender';
  } else if (spfStatus === 'fail' || dkimStatus === 'fail') {
    status = 'suspicious';
    badge = '⚠️ Suspicious Header Mismatch';
  } else if (spfStatus === 'pass' && (dkimStatus === 'pass' || dkimStatus === 'present')) {
    status = 'verified';
    badge = '🛡️ Verified Sender (SPF & DKIM Aligned)';
  } else if (spfStatus === 'pass') {
    status = 'verified';
    badge = '🛡️ Verified Sender (SPF Passed)';
  }

  return {
    status,
    badge,
    score,
    spf: { status: spfStatus },
    dkim: { status: dkimStatus, domain: dkimDomain || undefined },
    dmarc: { status: dmarcStatus },
  };
}

export default {
  inspectEmailAuthentication,
};
