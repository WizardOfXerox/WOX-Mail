/**
 * WoxMail DNS-over-HTTPS (DoH) Deliverability & Security Health Probe
 * Validates MX, SPF, DKIM, DMARC, MTA-STS, BIMI, and WKD records in real time.
 */

import pino from 'pino';

const logger = pino({ name: 'dns-health-probe' });

/**
 * Queries Cloudflare DoH API for a given DNS record type.
 * @param {string} name - e.g. "wox.world"
 * @param {string} type - e.g. "TXT", "MX", "CNAME", "A"
 * @returns {Promise<Array<string>>}
 */
export async function queryDoh(name, type = 'TXT') {
  try {
    const dohUrl = `https://cloudflare-dns.com/dns-query?name=${encodeURIComponent(name)}&type=${encodeURIComponent(type)}`;
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 5000);

    const res = await fetch(dohUrl, {
      headers: { 'Accept': 'application/dns-json' },
      signal: controller.signal,
    });

    clearTimeout(timeout);

    if (!res.ok) return [];
    const data = await res.json();
    if (!data.Answer || !Array.isArray(data.Answer)) return [];

    return data.Answer.map((ans) => {
      let val = ans.data || '';
      if (val.startsWith('"') && val.endsWith('"')) {
        val = val.slice(1, -1);
      }
      return val;
    });
  } catch (err) {
    logger.debug({ err: err.message, name, type }, 'DoH query failed');
    return [];
  }
}

/**
 * Performs a comprehensive DNS deliverability and security audit on a domain.
 * @param {string} domain - e.g. "wox.world"
 * @returns {Promise<object>}
 */
export async function auditDomainDnsHealth(domain = 'wox.world') {
  const cleanDomain = domain.toLowerCase().trim();

  // Run DoH queries in parallel
  const [mxRecords, txtRecords, dmarcRecords, dkimRecords, mtaStsTxt, mtaStsCname, bimiRecords, wkdCname] = await Promise.all([
    queryDoh(cleanDomain, 'MX'),
    queryDoh(cleanDomain, 'TXT'),
    queryDoh(`_dmarc.${cleanDomain}`, 'TXT'),
    queryDoh(`default._domainkey.${cleanDomain}`, 'TXT'),
    queryDoh(`_mta-sts.${cleanDomain}`, 'TXT'),
    queryDoh(`mta-sts.${cleanDomain}`, 'CNAME'),
    queryDoh(`default._bimi.${cleanDomain}`, 'TXT'),
    queryDoh(`openpgpkey.${cleanDomain}`, 'CNAME'),
  ]);

  const spfRecord = txtRecords.find((r) => r.toLowerCase().startsWith('v=spf1')) || null;
  const dmarcRecord = dmarcRecords.find((r) => r.toLowerCase().startsWith('v=dmarc1')) || null;
  const dkimRecord = dkimRecords.find((r) => r.toLowerCase().startsWith('v=dkim1') || r.includes('k=rsa') || r.includes('k=ed25519')) || null;
  const mtaStsPolicy = mtaStsTxt.find((r) => r.toLowerCase().startsWith('v=stas1')) || null;
  const bimiRecord = bimiRecords.find((r) => r.toLowerCase().startsWith('v=bimi1')) || null;

  let score = 0;
  const items = [];

  // 1. MX Record Check (Weight: 25)
  if (mxRecords.length > 0) {
    score += 25;
    items.push({ check: 'MX Records', status: 'PASS', score: 25, value: mxRecords.join(', ') });
  } else {
    items.push({ check: 'MX Records', status: 'FAIL', score: 0, reason: 'No MX records found for incoming mail.' });
  }

  // 2. SPF Record Check (Weight: 20)
  if (spfRecord) {
    score += 20;
    items.push({ check: 'SPF Record', status: 'PASS', score: 20, value: spfRecord });
  } else {
    items.push({ check: 'SPF Record', status: 'FAIL', score: 0, reason: 'Missing v=spf1 TXT record.' });
  }

  // 3. DKIM Record Check (Weight: 20)
  if (dkimRecord) {
    score += 20;
    items.push({ check: 'DKIM Signature Record', status: 'PASS', score: 20, value: dkimRecord });
  } else {
    items.push({ check: 'DKIM Signature Record', status: 'WARN', score: 0, reason: 'DKIM record default._domainkey not found or using provider-specific selector.' });
  }

  // 4. DMARC Policy Check (Weight: 15)
  if (dmarcRecord) {
    score += 15;
    items.push({ check: 'DMARC Policy', status: 'PASS', score: 15, value: dmarcRecord });
  } else {
    items.push({ check: 'DMARC Policy', status: 'FAIL', score: 0, reason: 'Missing _dmarc TXT record for policy enforcement.' });
  }

  // 5. MTA-STS & TLS Security (Weight: 10)
  if (mtaStsPolicy && mtaStsCname.length > 0) {
    score += 10;
    items.push({ check: 'MTA-STS TLS Enclave', status: 'PASS', score: 10, value: `${mtaStsPolicy} (Host: ${mtaStsCname[0]})` });
  } else if (mtaStsPolicy || mtaStsCname.length > 0) {
    score += 5;
    items.push({ check: 'MTA-STS TLS Enclave', status: 'PARTIAL', score: 5, reason: 'Partial MTA-STS setup. Ensure both _mta-sts TXT and mta-sts CNAME exist.' });
  } else {
    items.push({ check: 'MTA-STS TLS Enclave', status: 'INFO', score: 0, reason: 'Optional: MTA-STS prevents TLS downgrade attacks.' });
  }

  // 6. Web Key Directory (WKD) Check (Weight: 5)
  if (wkdCname.length > 0) {
    score += 5;
    items.push({ check: 'Web Key Directory (WKD)', status: 'PASS', score: 5, value: `openpgpkey -> ${wkdCname[0]}` });
  } else {
    items.push({ check: 'Web Key Directory (WKD)', status: 'INFO', score: 0, reason: 'Optional: WKD allows automatic OpenPGP key discovery.' });
  }

  // 7. BIMI Brand Indicator (Weight: 5)
  if (bimiRecord) {
    score += 5;
    items.push({ check: 'BIMI Brand Indicator', status: 'PASS', score: 5, value: bimiRecord });
  } else {
    items.push({ check: 'BIMI Brand Indicator', status: 'INFO', score: 0, reason: 'Optional: Displays verified brand SVG logo in mail clients.' });
  }

  return {
    domain: cleanDomain,
    healthScore: Math.min(100, score),
    items,
    auditedAt: new Date().toISOString(),
  };
}

export default {
  queryDoh,
  auditDomainDnsHealth,
};
