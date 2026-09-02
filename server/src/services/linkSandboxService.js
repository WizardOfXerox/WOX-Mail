/**
 * WoxMail Link Isolation Sandbox Service
 * Provides server-side headless URL inspection, TLS certificate health audits,
 * step-by-step multi-hop redirect resolution, Playwright headless screenshot capture,
 * marketing parameter stripping, Homograph spoof detection, and clean reader view extraction.
 */

import tls from 'tls';
import { URL } from 'url';
import { JSDOM } from 'jsdom';
import createDOMPurify from 'dompurify';

const window = new JSDOM('').window;
const DOMPurify = createDOMPurify(window);

// Known tracking parameters to strip
const TRACKING_PARAMS = [
  'utm_source', 'utm_medium', 'utm_campaign', 'utm_term', 'utm_content',
  'fbclid', 'gclid', 'mc_eid', '_hsenc', '_hsmi', 'msclkid', 'dclid',
  'ref', 'source', 'trk', 's_kwcid', 'sc_src', 'sc_lid', 'sc_uid'
];

// High risk TLDs commonly used in phishing
const HIGH_RISK_TLDS = ['.zip', '.mov', '.top', '.xyz', '.click', '.country', '.work', '.kim', '.gq', '.cf', '.tk', '.ml', '.ga'];

/**
 * Strips marketing and analytics tracking parameters from a URL.
 * @param {string} rawUrl
 * @returns {string}
 */
export function stripTrackingParams(rawUrl) {
  try {
    const parsed = new URL(rawUrl);
    const cleanParams = new URLSearchParams();
    for (const [k, v] of parsed.searchParams.entries()) {
      if (!TRACKING_PARAMS.includes(k.toLowerCase()) && !k.toLowerCase().startsWith('utm_')) {
        cleanParams.append(k, v);
      }
    }
    parsed.search = cleanParams.toString();
    return parsed.toString();
  } catch {
    return rawUrl;
  }
}

/**
 * Checks for Homograph / Punycode domain spoofing attacks.
 * @param {string} domain
 * @returns {{ isSpoofRisk: boolean, punycode: string, details?: string }}
 */
export function detectHomographRisk(domain) {
  try {
    const isPunycode = domain.toLowerCase().includes('xn--');
    const nonAscii = /[^\u0000-\u007F]/.test(domain);
    if (isPunycode || nonAscii) {
      return {
        isSpoofRisk: true,
        punycode: domain,
        details: 'Domain contains Internationalized (IDN) or Cyrillic/Greek characters that may impersonate legitimate brands.',
      };
    }
    return { isSpoofRisk: false, punycode: domain };
  } catch {
    return { isSpoofRisk: false, punycode: domain };
  }
}

/**
 * Performs a real TLS socket handshake to audit SSL certificate health and cipher suites.
 * @param {string} hostname
 * @param {number} [port=443]
 * @returns {Promise<object>}
 */
export async function auditTlsCertificate(hostname, port = 443) {
  return new Promise((resolve) => {
    const timeout = 4000;
    let timer;

    try {
      const socket = tls.connect(
        {
          host: hostname,
          port,
          servername: hostname,
          rejectUnauthorized: false,
        },
        () => {
          clearTimeout(timer);
          try {
            const cert = socket.getPeerCertificate(true);
            const cipher = socket.getCipher();
            const protocol = socket.getProtocol();
            const authorized = socket.authorized;
            const validTo = cert ? new Date(cert.valid_to) : null;
            const daysRemaining = validTo ? Math.round((validTo.getTime() - Date.now()) / (1000 * 3600 * 24)) : null;

            socket.end();

            resolve({
              valid: authorized || (cert && validTo > new Date()),
              authorized,
              protocol,
              cipherName: cipher?.name || 'Unknown',
              cipherVersion: cipher?.version || protocol,
              issuer: cert?.issuer ? (cert.issuer.O || cert.issuer.CN || 'Unknown') : 'Unknown',
              subject: cert?.subject ? (cert.subject.CN || hostname) : hostname,
              validFrom: cert?.valid_from,
              validTo: cert?.valid_to,
              daysRemaining,
              fingerprint256: cert?.fingerprint256,
            });
          } catch {
            socket.end();
            resolve({ valid: false, error: 'Failed to inspect certificate data' });
          }
        }
      );

      socket.on('error', (err) => {
        clearTimeout(timer);
        resolve({ valid: false, error: err.message });
      });

      timer = setTimeout(() => {
        try { socket.destroy(); } catch {}
        resolve({ valid: false, error: 'TLS audit handshake timed out' });
      }, timeout);
    } catch (err) {
      resolve({ valid: false, error: err.message });
    }
  });
}

/**
 * Captures an isolated headless Playwright screenshot preview of the page.
 * @param {string} targetUrl
 * @returns {Promise<string|null>} Data URI string or null
 */
export async function captureHeadlessScreenshot(targetUrl) {
  try {
    const { chromium } = await import('playwright');
    const browser = await chromium.launch({ headless: true });
    try {
      const page = await browser.newPage({ viewport: { width: 1024, height: 768 } });
      await page.goto(targetUrl, { timeout: 6000, waitUntil: 'domcontentloaded' });
      const buffer = await page.screenshot({ type: 'jpeg', quality: 70 });
      await browser.close();
      return `data:image/jpeg;base64,${buffer.toString('base64')}`;
    } catch {
      await browser.close();
      return null;
    }
  } catch {
    return null;
  }
}

/**
 * Inspects an external URL by resolving redirect chains step-by-step, auditing SSL,
 * capturing headless screenshots, and extracting metadata.
 * @param {string} targetUrl
 * @param {boolean} [withScreenshot=false]
 * @returns {Promise<object>}
 */
export async function inspectLink(targetUrl, withScreenshot = false) {
  if (!targetUrl || typeof targetUrl !== 'string') {
    throw new Error('Valid URL is required for sandbox inspection');
  }

  const cleanUrl = stripTrackingParams(targetUrl);
  const parsed = new URL(cleanUrl);

  const domain = parsed.hostname;
  const isHttps = parsed.protocol === 'https:';
  const homograph = detectHomographRisk(domain);
  const isHighRiskTld = HIGH_RISK_TLDS.some((tld) => domain.toLowerCase().endsWith(tld));

  // Multi-hop step-by-step redirect chain resolution
  const redirectChain = [cleanUrl];
  let currUrl = cleanUrl;
  let pageTitle = domain;
  let pageSnippet = '';

  try {
    for (let hop = 0; hop < 8; hop++) {
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 4000);

      const res = await fetch(currUrl, {
        method: 'GET',
        headers: {
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36 WoxMailSandbox/1.0',
          'Accept': 'text/html,application/xhtml+xml',
        },
        signal: controller.signal,
        redirect: 'manual',
      });

      clearTimeout(timeout);

      // Follow HTTP redirects explicitly to record each intermediate hop
      if ([301, 302, 303, 307, 308].includes(res.status)) {
        const location = res.headers.get('location');
        if (location) {
          const nextUrl = new URL(location, currUrl).toString();
          if (!redirectChain.includes(nextUrl)) {
            currUrl = nextUrl;
            redirectChain.push(currUrl);
            continue;
          }
        }
      }

      // Reached destination, parse metadata
      const html = await res.text();
      const dom = new JSDOM(html.slice(0, 150000));
      const titleEl = dom.window.document.querySelector('title');
      if (titleEl && titleEl.textContent) {
        pageTitle = titleEl.textContent.trim().slice(0, 120);
      }

      const descEl = dom.window.document.querySelector('meta[name="description"]') || dom.window.document.querySelector('meta[property="og:description"]');
      if (descEl && descEl.getAttribute('content')) {
        pageSnippet = descEl.getAttribute('content').trim().slice(0, 240);
      }
      break;
    }
  } catch (err) {
    pageSnippet = `Preview extraction: ${err.message}`;
  }

  // Audit real TLS certificate if HTTPS
  let sslDetails = { valid: isHttps, protocol: parsed.protocol };
  if (isHttps) {
    sslDetails = await auditTlsCertificate(domain, parsed.port ? parseInt(parsed.port, 10) : 443);
  }

  // Capture Playwright screenshot preview if requested
  let screenshot = null;
  if (withScreenshot) {
    screenshot = await captureHeadlessScreenshot(currUrl);
  }

  return {
    originalUrl: targetUrl,
    cleanUrl,
    finalUrl: currUrl,
    domain,
    protocol: parsed.protocol,
    isHttps,
    redirectChain,
    redirectCount: redirectChain.length - 1,
    homograph,
    isHighRiskTld,
    sslDetails,
    pageTitle,
    pageSnippet,
    screenshot,
    inspectedAt: new Date().toISOString(),
    securityVerdict: !homograph.isSpoofRisk && !isHighRiskTld && isHttps && (sslDetails.valid !== false) ? 'SAFE' : 'CAUTION',
  };
}

/**
 * Extracts a script-free, sanitized, readable HTML document from a URL.
 * @param {string} targetUrl
 * @returns {Promise<{ title: string, contentHtml: string, domain: string, cleanUrl: string }>}
 */
export async function renderSafeReader(targetUrl) {
  const cleanUrl = stripTrackingParams(targetUrl);
  const parsed = new URL(cleanUrl);

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 8000);

  let rawHtml = '';
  try {
    const res = await fetch(cleanUrl, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36 WoxMailSandbox/1.0',
        'Accept': 'text/html,application/xhtml+xml',
      },
      signal: controller.signal,
      redirect: 'follow',
    });
    rawHtml = await res.text();
  } finally {
    clearTimeout(timeout);
  }

  const dom = new JSDOM(rawHtml);
  const doc = dom.window.document;

  // Extract page title
  const title = doc.querySelector('title')?.textContent?.trim() || doc.querySelector('h1')?.textContent?.trim() || parsed.hostname;

  // Disarm all active elements
  doc.querySelectorAll('script, style, link, form, input, button, select, iframe, embed, object, noscript').forEach((el) => el.remove());

  // Extract article body
  const articleEl = doc.querySelector('article') || doc.querySelector('main') || doc.querySelector('.post-content') || doc.querySelector('.article-body') || doc.body;

  const sanitized = DOMPurify.sanitize(articleEl ? articleEl.innerHTML : rawHtml, {
    ALLOWED_TAGS: ['h1', 'h2', 'h3', 'h4', 'h5', 'h6', 'p', 'a', 'b', 'strong', 'i', 'em', 'u', 'ul', 'ol', 'li', 'blockquote', 'code', 'pre', 'hr', 'table', 'thead', 'tbody', 'tr', 'th', 'td', 'img'],
    ALLOWED_ATTR: ['href', 'src', 'alt', 'title', 'target', 'rel'],
  });

  return {
    title,
    contentHtml: sanitized,
    domain: parsed.hostname,
    cleanUrl,
  };
}

export default {
  stripTrackingParams,
  detectHomographRisk,
  auditTlsCertificate,
  captureHeadlessScreenshot,
  inspectLink,
  renderSafeReader,
};
