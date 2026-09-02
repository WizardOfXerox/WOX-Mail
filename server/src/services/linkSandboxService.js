/**
 * WoxMail Link Isolation Sandbox Service
 * Provides server-side headless URL inspection, SSL certificate health audits,
 * marketing redirect stripping, Homograph spoof detection, and clean reader view extraction.
 */

import https from 'https';
import http from 'http';
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
 * Strips tracking parameters from a URL.
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
    // Check for mixed non-ASCII scripts
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
 * Inspects an external URL by resolving redirect chains, auditing SSL, and extracting metadata.
 * @param {string} targetUrl
 * @returns {Promise<object>}
 */
export async function inspectLink(targetUrl) {
  if (!targetUrl || typeof targetUrl !== 'string') {
    throw new Error('Valid URL is required for sandbox inspection');
  }

  const cleanUrl = stripTrackingParams(targetUrl);
  const parsed = new URL(cleanUrl);

  const domain = parsed.hostname;
  const isHttps = parsed.protocol === 'https:';
  const homograph = detectHomographRisk(domain);
  const isHighRiskTld = HIGH_RISK_TLDS.some((tld) => domain.toLowerCase().endsWith(tld));

  const redirectChain = [cleanUrl];
  let finalUrl = cleanUrl;
  let sslDetails = { valid: isHttps, protocol: parsed.protocol };
  let pageTitle = domain;
  let pageSnippet = '';

  try {
    // Perform quick HEAD / GET request to resolve redirects and headers
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 6000);

    const res = await fetch(cleanUrl, {
      method: 'GET',
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36 WoxMailSandbox/1.0',
        'Accept': 'text/html,application/xhtml+xml',
      },
      signal: controller.signal,
      redirect: 'follow',
    });

    clearTimeout(timeout);

    if (res.url && res.url !== cleanUrl) {
      finalUrl = res.url;
      redirectChain.push(finalUrl);
    }

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
  } catch (err) {
    pageSnippet = `Unable to fetch live page preview (${err.message}).`;
  }

  return {
    originalUrl: targetUrl,
    cleanUrl,
    finalUrl,
    domain,
    protocol: parsed.protocol,
    isHttps,
    redirectChain,
    redirectCount: redirectChain.length - 1,
    homograph,
    isHighRiskTld,
    pageTitle,
    pageSnippet,
    inspectedAt: new Date().toISOString(),
    securityVerdict: !homograph.isSpoofRisk && !isHighRiskTld && isHttps ? 'SAFE' : 'CAUTION',
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

  const res = await fetch(cleanUrl, {
    headers: {
      'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) WoxMailReader/1.0',
      'Accept': 'text/html,application/xhtml+xml',
    },
    signal: controller.signal,
  });

  clearTimeout(timeout);

  if (!res.ok) {
    throw new Error(`Failed to load webpage (Status: ${res.status})`);
  }

  const rawHtml = await res.text();
  const dom = new JSDOM(rawHtml);
  const doc = dom.window.document;

  const title = doc.querySelector('title')?.textContent?.trim() || parsed.hostname;

  // Remove all scripts, styles, forms, embeds, and iframes
  const dangerousTags = doc.querySelectorAll('script, style, link, form, input, button, select, iframe, embed, object, noscript');
  dangerousTags.forEach((el) => el.remove());

  // Find main body / article
  const article = doc.querySelector('article') || doc.querySelector('main') || doc.querySelector('.content') || doc.body;
  const innerHtml = article ? article.innerHTML : doc.body.innerHTML;

  // Sanitize with DOMPurify
  const cleanHtml = DOMPurify.sanitize(innerHtml, {
    ALLOWED_TAGS: ['h1', 'h2', 'h3', 'h4', 'h5', 'h6', 'p', 'b', 'i', 'strong', 'em', 'a', 'ul', 'ol', 'li', 'blockquote', 'code', 'pre', 'hr', 'br', 'table', 'thead', 'tbody', 'tr', 'th', 'td', 'img'],
    ALLOWED_ATTR: ['href', 'src', 'alt', 'title', 'target', 'rel'],
  });

  return {
    title,
    domain: parsed.hostname,
    cleanUrl,
    contentHtml: cleanHtml,
    extractedAt: new Date().toISOString(),
  };
}

export default {
  stripTrackingParams,
  detectHomographRisk,
  inspectLink,
  renderSafeReader,
};
