import { Router } from 'express';
import dns from 'dns/promises';
import { requireAuth } from '../middleware/auth.js';

const router = Router();

/**
 * GET /api/settings/dns-health
 * Diagnostic audit tool for domain MX, SPF, DKIM, DMARC, and BIMI DNS records.
 */
router.get('/', requireAuth, async (req, res) => {
  const domain = (req.query.domain || process.env.DOMAIN_PERMANENT || 'wox.world')
    .toLowerCase()
    .trim()
    .replace(/^https?:\/\//, '')
    .split('/')[0];

  const checks = {
    mx: { passed: false, records: [], message: '' },
    spf: { passed: false, record: '', message: '' },
    dkim: { passed: false, selector: 'purelymail', record: '', message: '' },
    dmarc: { passed: false, record: '', message: '' },
    bimi: { passed: false, record: '', message: '' },
  };

  let score = 0;

  // 1. Check MX Records
  try {
    const mxRecords = await dns.resolveMx(domain);
    if (mxRecords && mxRecords.length > 0) {
      checks.mx.passed = true;
      checks.mx.records = mxRecords;
      checks.mx.message = `Found ${mxRecords.length} active MX server(s)`;
      score += 25;
    } else {
      checks.mx.message = 'No MX records found for domain';
    }
  } catch (err) {
    checks.mx.message = `MX lookup notice: ${err.code || err.message}`;
  }

  // 2. Check SPF Record (TXT)
  try {
    const txtRecords = await dns.resolveTxt(domain);
    const flattened = txtRecords.map((chunk) => chunk.join(''));
    const spf = flattened.find((r) => r.startsWith('v=spf1'));
    if (spf) {
      checks.spf.passed = true;
      checks.spf.record = spf;
      checks.spf.message = 'Valid SPF record configured';
      score += 25;
    } else {
      checks.spf.message = 'Missing v=spf1 TXT record';
    }
  } catch (err) {
    checks.spf.message = `SPF lookup notice: ${err.code || err.message}`;
  }

  // 3. Check DKIM Record
  const dkimSelectors = ['purelymail', 'default', 'mail', 'k1'];
  for (const sel of dkimSelectors) {
    try {
      const dkimHost = `${sel}._domainkey.${domain}`;
      const txt = await dns.resolveTxt(dkimHost);
      const dkim = txt.map((c) => c.join('')).find((r) => r.includes('v=DKIM1') || r.includes('p='));
      if (dkim) {
        checks.dkim.passed = true;
        checks.dkim.selector = sel;
        checks.dkim.record = dkim.slice(0, 80) + '...';
        checks.dkim.message = `Valid DKIM key found on selector '${sel}'`;
        score += 25;
        break;
      }
    } catch {}
  }
  if (!checks.dkim.passed) {
    checks.dkim.message = 'No DKIM public key found across common selectors';
  }

  // 4. Check DMARC Record
  try {
    const dmarcHost = `_dmarc.${domain}`;
    const txt = await dns.resolveTxt(dmarcHost);
    const dmarc = txt.map((c) => c.join('')).find((r) => r.startsWith('v=DMARC1'));
    if (dmarc) {
      checks.dmarc.passed = true;
      checks.dmarc.record = dmarc;
      checks.dmarc.message = 'Valid DMARC policy configured';
      score += 20;
    } else {
      checks.dmarc.message = 'Missing _dmarc TXT record';
    }
  } catch (err) {
    checks.dmarc.message = `DMARC lookup notice: ${err.code || err.message}`;
  }

  // 5. Check BIMI Record
  try {
    const bimiHost = `default._bimi.${domain}`;
    const txt = await dns.resolveTxt(bimiHost);
    const bimi = txt.map((c) => c.join('')).find((r) => r.startsWith('v=BIMI1'));
    if (bimi) {
      checks.bimi.passed = true;
      checks.bimi.record = bimi;
      checks.bimi.message = 'BIMI brand indicator configured';
      score += 5;
    } else {
      checks.bimi.message = 'Optional: No BIMI record found';
    }
  } catch {
    checks.bimi.message = 'Optional: No BIMI record found';
  }

  res.json({
    domain,
    score: Math.min(100, score),
    status: score >= 75 ? 'optimal' : score >= 50 ? 'warning' : 'critical',
    checks,
    recommendations: [
      !checks.mx.passed && 'Configure MX records pointing to your mail server.',
      !checks.spf.passed && 'Add a TXT record for v=spf1 to prevent email spoofing.',
      !checks.dkim.passed && 'Publish DKIM public key selector on _domainkey subdomain.',
      !checks.dmarc.passed && 'Add a _dmarc TXT record with p=quarantine or p=reject.',
    ].filter(Boolean),
  });
});

export default router;
