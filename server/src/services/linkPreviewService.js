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
 * @param {string} ip
 * @returns {boolean}
 */
export function isPrivateIp(ip) {
  if (!ip) return true;

  // IPv4 checks
  if (ip === '127.0.0.1' || ip === 'localhost' || ip === '::1' || ip === '0.0.0.0') return true;
  if (ip.startsWith('10.')) return true;
  if (ip.startsWith('192.168.')) return true;
  if (ip.startsWith('169.254.')) return true; // Link-local & AWS/GCP metadata
  if (/^172\.(1[6-9]|2[0-9]|3[0-1])\./.test(ip)) return true;
  if (ip.startsWith('100.64.')) return true; // Carrier-grade NAT

  // IPv6 checks
  if (ip.startsWith('fc00:') || ip.startsWith('fd00:') || ip.startsWith('fe80:')) return true;

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

    // Check common local keywords
    if (['localhost', '127.0.0.1', '0.0.0.0', 'metadata.google.internal', 'instance-data'].includes(hostname)) {
      return { safe: false, hostname, error: 'Target resolves to loopback/metadata' };
    }

    // Direct IP address check
    if (/^(\d{1,3}\.){3}\d{1,3}$/.test(hostname)) {
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

  // Fetch target page
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);

  try {
    const res = await fetch(cleanUrl, {
      signal: controller.signal,
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) WoxMail-LinkBot/1.0 (+https://wox.world)',
        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
        'Accept-Language': 'en-US,en;q=0.9',
      },
      redirect: 'follow',
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
  extractMetaTags,
  fetchLinkMetadata,
  fetchBatchLinkMetadata,
};
