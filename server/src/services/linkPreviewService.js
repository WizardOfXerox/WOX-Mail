/**
 * @fileoverview Safe OpenGraph & Web Link Preview Engine
 * Fetches page metadata, OpenGraph, Twitter Cards, favicons, and security details.
 * Implements strict SSRF protection against private/loopback IP addresses.
 */

import dns from 'dns/promises';
import { parse as parseUrl } from 'url';
import pino from 'pino';

const logger = pino({ name: 'woxmail:link-preview' });

const MAX_HTML_SIZE = 512 * 1024; // 512KB max
const FETCH_TIMEOUT_MS = 4000; // 4s timeout
const CACHE_TTL_MS = 2 * 60 * 60 * 1000; // 2 hours

// In-memory cache: URL -> { data, expiresAt }
const previewCache = new Map();

// Periodic cache cleanup
setInterval(() => {
  const now = Date.now();
  for (const [k, v] of previewCache.entries()) {
    if (v.expiresAt <= now) {
      previewCache.delete(k);
    }
  }
}, 10 * 60 * 1000);

/**
 * Check if an IP address is a private, reserved, loopback, or cloud-metadata IP.
 * Covers RFC 1122, RFC 1918, RFC 3927, RFC 6598, RFC 6890, RFC 4291, and cloud metadata.
 * @param {string} rawIp
 * @returns {boolean}
 */
export function isPrivateIp(rawIp) {
  if (!rawIp || typeof rawIp !== 'string') return true;

  let ip = rawIp.trim().toLowerCase();

  // Strip brackets if IPv6 literal like [::1]
  if (ip.startsWith('[') && ip.endsWith(']')) {
    ip = ip.slice(1, -1);
  }

  // Normalize IPv4-mapped IPv6 (e.g. ::ffff:127.0.0.1 or ::ffff:7f00:1)
  if (ip.startsWith('::ffff:')) {
    const remainder = ip.slice(7);
    if (remainder.includes(':')) {
      const parts = remainder.split(':');
      if (parts.length === 2) {
        const w1 = parseInt(parts[0], 16);
        const w2 = parseInt(parts[1], 16);
        if (!isNaN(w1) && !isNaN(w2)) {
          ip = [(w1 >> 8) & 0xff, w1 & 0xff, (w2 >> 8) & 0xff, w2 & 0xff].join('.');
        }
      }
    } else {
      ip = remainder;
    }
  }

  // Common local keywords and loopback literals
  if (
    ip === 'localhost' ||
    ip === '::1' ||
    ip === '::' ||
    ip === '0.0.0.0' ||
    /^0*(:0*)*:?0*1$/.test(ip) ||
    /^0*(:0*)+$/.test(ip)
  ) {
    return true;
  }

  // IPv4 dotted decimal check
  const ipv4Match = /^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/.exec(ip);
  if (ipv4Match) {
    const [o1, o2, o3, o4] = ipv4Match.slice(1).map(Number);
    if (o1 > 255 || o2 > 255 || o3 > 255 || o4 > 255) return true; // Invalid octet, treat as unsafe

    // 0.0.0.0/8 (Current network / local)
    if (o1 === 0) return true;
    // 10.0.0.0/8 (Private network, RFC 1918)
    if (o1 === 10) return true;
    // 100.64.0.0/10 (Shared address / CGNAT, RFC 6598: 100.64.0.0 - 100.127.255.255)
    if (o1 === 100 && o2 >= 64 && o2 <= 127) return true;
    // 127.0.0.0/8 (Loopback, RFC 1122)
    if (o1 === 127) return true;
    // 169.254.0.0/16 (Link-local & AWS/GCP/Azure cloud metadata)
    if (o1 === 169 && o2 === 254) return true;
    // 172.16.0.0/12 (Private network, RFC 1918: 172.16.0.0 - 172.31.255.255)
    if (o1 === 172 && o2 >= 16 && o2 <= 31) return true;
    // 192.0.0.0/24 (IETF protocol assignments, RFC 6890)
    if (o1 === 192 && o2 === 0 && o3 === 0) return true;
    // 192.0.2.0/24 (TEST-NET-1, RFC 5737)
    if (o1 === 192 && o2 === 0 && o3 === 2) return true;
    // 192.88.99.0/24 (6to4 relay anycast, RFC 3068)
    if (o1 === 192 && o2 === 88 && o3 === 99) return true;
    // 192.168.0.0/16 (Private network, RFC 1918)
    if (o1 === 192 && o2 === 168) return true;
    // 198.18.0.0/15 (Network benchmark tests, RFC 2544: 198.18.0.0 - 198.19.255.255)
    if (o1 === 198 && (o2 === 18 || o2 === 19)) return true;
    // 198.51.100.0/24 (TEST-NET-2, RFC 5737)
    if (o1 === 198 && o2 === 51 && o3 === 100) return true;
    // 203.0.113.0/24 (TEST-NET-3, RFC 5737)
    if (o1 === 203 && o2 === 0 && o3 === 113) return true;
    // 224.0.0.0/4 (Multicast, RFC 5771: 224.0.0.0 - 239.255.255.255)
    if (o1 >= 224 && o1 <= 239) return true;
    // 240.0.0.0/4 (Reserved for future use & Broadcast, RFC 1112: 240.0.0.0 - 255.255.255.255)
    if (o1 >= 240) return true;

    return false;
  }

  // IPv6 checks
  if (ip.startsWith('fc00:') || ip.startsWith('fd00:') || ip.startsWith('fe80:') || ip.startsWith('fe90:') || ip.startsWith('fea0:') || ip.startsWith('feb0:')) return true;
  if (ip.startsWith('ff')) return true; // Multicast
  if (ip.startsWith('2001:db8:')) return true; // Documentation
  if (ip.startsWith('100::') || ip.startsWith('64:ff9b::')) return true;

  return false;
}

/**
 * Validate URL protocol and resolve hostname to ensure it does not point to internal IP.
 * @param {string} rawUrl
 * @returns {Promise<{safe: boolean, hostname: string, error?: string}>}
 */
export async function isSafeUrl(rawUrl) {
  try {
    const parsed = new URL(rawUrl);
    if (!['http:', 'https:'].includes(parsed.protocol)) {
      return { safe: false, hostname: '', error: 'Disallowed protocol' };
    }

    const hostname = parsed.hostname.toLowerCase();

    // Check common local keywords & metadata endpoints
    if ([
      'localhost',
      '127.0.0.1',
      '0.0.0.0',
      'metadata.google.internal',
      'instance-data',
      '169.254.169.254',
    ].includes(hostname) || hostname.endsWith('.localhost') || hostname.endsWith('.local') || hostname.endsWith('.internal')) {
      return { safe: false, hostname, error: 'Target resolves to loopback/metadata' };
    }

    // Direct IP address check (handles both IPv4 and IPv6)
    if (/^(\d{1,3}\.){3}\d{1,3}$/.test(hostname) || hostname.includes(':')) {
      if (isPrivateIp(hostname)) {
        return { safe: false, hostname, error: 'Direct private IP access blocked' };
      }
    } else {
      // Resolve DNS to verify actual IP
      try {
        const addresses = await dns.lookup(hostname, { all: true });
        for (const addr of addresses) {
          if (isPrivateIp(addr.address)) {
            return { safe: false, hostname, error: `Resolved to private IP: ${addr.address}` };
          }
        }
      } catch (dnsErr) {
        return { safe: false, hostname, error: `DNS resolution failed: ${dnsErr.message}` };
      }
    }

    return { safe: true, hostname };
  } catch (err) {
    return { safe: false, hostname: '', error: err.message };
  }
}

/**
 * Safe fetch wrapper that prevents SSRF across HTTP 3xx redirect chains.
 * Enforces redirect: 'manual' and re-validates each destination against isSafeUrl.
 * @param {string} targetUrl
 * @param {RequestInit} [options={}]
 * @param {number} [maxRedirects=5]
 * @returns {Promise<Response>}
 */
export async function safeFetch(targetUrl, options = {}, maxRedirects = 5) {
  let currUrl = targetUrl;
  const seenUrls = new Set([currUrl]);

  for (let hop = 0; hop <= maxRedirects; hop++) {
    const safety = await isSafeUrl(currUrl);
    if (!safety.safe) {
      throw new Error(`SSRF Protection: Access to private or local network is blocked (${safety.error || 'unsafe URL'}).`);
    }

    const fetchOptions = {
      ...options,
      redirect: 'manual',
    };

    const response = await fetch(currUrl, fetchOptions);

    if ([301, 302, 303, 307, 308].includes(response.status)) {
      const location = response.headers.get('location');
      if (!location) {
        return response;
      }

      const nextUrl = new URL(location, currUrl).toString();
      if (seenUrls.has(nextUrl)) {
        throw new Error('SSRF Protection: Redirect loop detected');
      }

      if (hop === maxRedirects) {
        throw new Error('SSRF Protection: Maximum redirects exceeded');
      }

      seenUrls.add(nextUrl);
      currUrl = nextUrl;
      continue;
    }

    return response;
  }

  throw new Error('SSRF Protection: Unexpected redirect resolution error');
}

/**
 * Extract OpenGraph, Twitter, and meta tags from HTML string.
 * @param {string} html
 * @param {string} targetUrl
 * @returns {object}
 */
export function extractMetaTags(html, targetUrl) {
  const meta = {
    title: '',
    description: '',
    image: '',
    siteName: '',
    favicon: '',
    url: targetUrl,
    type: 'website',
    themeColor: '',
  };

  try {
    const parsedUrl = new URL(targetUrl);
    const origin = parsedUrl.origin;

    // Default siteName to hostname
    meta.siteName = parsedUrl.hostname.replace(/^www\./i, '');
    meta.favicon = `${origin}/favicon.ico`;

    // Regex extraction for <title>
    const titleMatch = html.match(/<title[^>]*>([^<]+)<\/title>/i);
    if (titleMatch && titleMatch[1]) {
      meta.title = decodeHtmlEntities(titleMatch[1].trim());
    }

    // Meta tags regex
    const metaRegex = /<meta\s+([^>]+)>/gi;
    let match;
    while ((match = metaRegex.exec(html)) !== null) {
      const attrs = match[1];
      const nameMatch = attrs.match(/(?:name|property|itemprop)=["']([^"']+)["']/i);
      const contentMatch = attrs.match(/content=["']([^"']*)["']/i);

      if (nameMatch && contentMatch) {
        const key = nameMatch[1].toLowerCase();
        const value = decodeHtmlEntities(contentMatch[1].trim());

        if (key === 'og:title' || key === 'twitter:title') {
          meta.title = value || meta.title;
        } else if (key === 'og:description' || key === 'twitter:description' || key === 'description') {
          if (!meta.description || key.startsWith('og:')) {
            meta.description = value;
          }
        } else if (key === 'og:image' || key === 'twitter:image' || key === 'twitter:image:src') {
          if (!meta.image || key === 'og:image') {
            meta.image = resolveAbsoluteUrl(value, targetUrl);
          }
        } else if (key === 'og:site_name') {
          meta.siteName = value;
        } else if (key === 'og:type') {
          meta.type = value;
        } else if (key === 'theme-color') {
          meta.themeColor = value;
        }
      }
    }

    // Link rel="icon" or rel="shortcut icon"
    const iconRegex = /<link\s+[^>]*rel=["'](?:shortcut )?icon["'][^>]*href=["']([^"']+)["']/i;
    const iconMatch = html.match(iconRegex);
    if (iconMatch && iconMatch[1]) {
      meta.favicon = resolveAbsoluteUrl(iconMatch[1], targetUrl);
    }

    // Truncate long strings
    if (meta.title && meta.title.length > 150) meta.title = meta.title.slice(0, 147) + '...';
    if (meta.description && meta.description.length > 300) meta.description = meta.description.slice(0, 297) + '...';

    // Special rich domain enhancements (e.g. GitHub, YouTube, Linear, NPM)
    if (parsedUrl.hostname.includes('youtube.com') || parsedUrl.hostname.includes('youtu.be')) {
      meta.type = 'video';
      meta.siteName = 'YouTube';
    } else if (parsedUrl.hostname.includes('github.com')) {
      meta.siteName = 'GitHub';
    } else if (parsedUrl.hostname.includes('twitter.com') || parsedUrl.hostname.includes('x.com')) {
      meta.siteName = 'X (Twitter)';
    }

    return meta;
  } catch (err) {
    logger.warn({ err: err.message, targetUrl }, 'Failed parsing meta tags');
    return meta;
  }
}

/**
 * Resolve relative URLs against a base URL.
 */
function resolveAbsoluteUrl(url, base) {
  if (!url) return '';
  if (url.startsWith('http://') || url.startsWith('https://')) return url;
  if (url.startsWith('//')) return 'https:' + url;
  try {
    return new URL(url, base).toString();
  } catch {
    return url;
  }
}

/**
 * Decode basic HTML entities.
 */
function decodeHtmlEntities(str) {
  if (!str) return '';
  return str
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#039;/g, "'")
    .replace(/&#39;/g, "'")
    .replace(/&nbsp;/g, ' ');
}

/**
 * Fetch and extract rich link preview metadata with caching and SSRF safety.
 * @param {string} targetUrl
 * @returns {Promise<object>}
 */
export async function fetchLinkMetadata(targetUrl) {
  if (!targetUrl || typeof targetUrl !== 'string') {
    throw new Error('Valid URL string is required');
  }

  // Normalize URL
  let cleanUrl = targetUrl.trim();
  if (!cleanUrl.startsWith('http://') && !cleanUrl.startsWith('https://')) {
    cleanUrl = 'https://' + cleanUrl;
  }

  // Check cache
  const cached = previewCache.get(cleanUrl);
  if (cached && cached.expiresAt > Date.now()) {
    return cached.data;
  }

  // Check SSRF safety
  const safety = await isSafeUrl(cleanUrl);
  if (!safety.safe) {
    const fallback = {
      url: cleanUrl,
      title: safety.hostname || cleanUrl,
      description: 'Preview unavailable for security reasons.',
      image: '',
      siteName: safety.hostname || 'External Link',
      favicon: '',
      safe: false,
      error: safety.error,
    };
    return fallback;
  }

  // Fetch target page using safeFetch to prevent redirect SSRF
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);

  try {
    const res = await safeFetch(cleanUrl, {
      signal: controller.signal,
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) WoxMail-LinkBot/1.0 (+https://wox.world)',
        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
        'Accept-Language': 'en-US,en;q=0.9',
      },
    });

    clearTimeout(timeoutId);

    if (!res.ok) {
      const fallback = {
        url: cleanUrl,
        title: safety.hostname,
        description: `Server responded with HTTP ${res.status}`,
        image: '',
        siteName: safety.hostname,
        favicon: `https://${safety.hostname}/favicon.ico`,
        safe: true,
        httpStatus: res.status,
      };
      previewCache.set(cleanUrl, { data: fallback, expiresAt: Date.now() + 15 * 60 * 1000 });
      return fallback;
    }

    const contentType = res.headers.get('content-type') || '';
    if (!contentType.includes('text/html') && !contentType.includes('application/xhtml+xml')) {
      // Direct image/media URL
      if (contentType.startsWith('image/')) {
        const imgMeta = {
          url: cleanUrl,
          title: cleanUrl.split('/').pop() || 'Image Preview',
          description: `Direct Image (${contentType})`,
          image: cleanUrl,
          siteName: safety.hostname,
          favicon: `https://${safety.hostname}/favicon.ico`,
          type: 'image',
          safe: true,
        };
        previewCache.set(cleanUrl, { data: imgMeta, expiresAt: Date.now() + CACHE_TTL_MS });
        return imgMeta;
      }

      const rawMeta = {
        url: cleanUrl,
        title: cleanUrl.split('/').pop() || safety.hostname,
        description: `Direct File Download (${contentType})`,
        image: '',
        siteName: safety.hostname,
        favicon: `https://${safety.hostname}/favicon.ico`,
        safe: true,
      };
      return rawMeta;
    }

    // Read only up to MAX_HTML_SIZE
    const text = await res.text();
    const truncatedHtml = text.slice(0, MAX_HTML_SIZE);

    const meta = extractMetaTags(truncatedHtml, cleanUrl);
    meta.safe = true;
    meta.https = cleanUrl.startsWith('https://');

    // Cache successful lookup
    previewCache.set(cleanUrl, { data: meta, expiresAt: Date.now() + CACHE_TTL_MS });
    return meta;
  } catch (err) {
    clearTimeout(timeoutId);
    logger.warn({ err: err.message, cleanUrl }, 'Link preview fetch error');
    const fallback = {
      url: cleanUrl,
      title: safety.hostname || cleanUrl,
      description: 'Could not fetch web preview.',
      image: '',
      siteName: safety.hostname || 'Link',
      favicon: safety.hostname ? `https://${safety.hostname}/favicon.ico` : '',
      safe: true,
      error: err.name === 'AbortError' ? 'Request timed out' : err.message,
    };
    return fallback;
  }
}

/**
 * Fetch batch metadata for an array of URLs (max 6 parallel).
 * @param {string[]} urls
 * @returns {Promise<Record<string, object>>}
 */
export async function fetchBatchLinkMetadata(urls = []) {
  const uniqueUrls = [...new Set(urls.filter(Boolean))].slice(0, 6);
  const results = {};

  await Promise.allSettled(
    uniqueUrls.map(async (u) => {
      try {
        results[u] = await fetchLinkMetadata(u);
      } catch (err) {
        results[u] = { url: u, title: u, description: '', safe: false, error: err.message };
      }
    })
  );

  return results;
}

export default {
  isSafeUrl,
  isPrivateIp,
  safeFetch,
  extractMetaTags,
  fetchLinkMetadata,
  fetchBatchLinkMetadata,
};
