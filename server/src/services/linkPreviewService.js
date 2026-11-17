/**
 * @fileoverview Safe OpenGraph & Web Link Preview Engine
 * Fetches page metadata, OpenGraph, Twitter Cards, favicons, and security details.
 * Implements strict SSRF protection against private/loopback IP addresses.
 */

import http from 'http';
import https from 'https';
import net from 'net';
import { Readable } from 'stream';
import dnsPromises from 'dns/promises';
import pino from 'pino';

const logger = pino({ name: 'woxmail:link-preview' });

const MAX_HTML_SIZE = 512 * 1024; // 512KB max
const FETCH_TIMEOUT_MS = 4000; // 4s timeout
const CACHE_TTL_MS = 2 * 60 * 60 * 1000; // 2 hours

// In-memory cache: URL -> { data, expiresAt }
const previewCache = new Map();

// Periodic cache cleanup
const cleanupInterval = setInterval(() => {
  const now = Date.now();
  for (const [k, v] of previewCache.entries()) {
    if (v.expiresAt <= now) {
      previewCache.delete(k);
    }
  }
}, 10 * 60 * 1000);
if (cleanupInterval.unref) {
  cleanupInterval.unref();
}

/**
 * Parse dotted or single-number IPv4 strings in decimal, hex, or octal representations.
 * Handles POSIX standard IP formats (e.g., 0177.0.0.1, 0x7f000001, 2130706433).
 * @param {string} str
 * @returns {string|null} Canonical dotted decimal IPv4 string or null
 */
function parseIpv4Parts(str) {
  if (!str || typeof str !== 'string') return null;
  const s = str.trim();
  if (s.includes(':')) return null;

  const parts = s.split('.');
  if (parts.length > 4 || parts.length === 0) return null;

  const nums = [];
  for (let i = 0; i < parts.length; i++) {
    const p = parts[i].trim();
    if (!p) return null;
    let n;
    if (/^0x[0-9a-fA-F]+$/i.test(p)) {
      n = parseInt(p, 16);
    } else if (p.length > 1 && p.startsWith('0') && /^[0-7]+$/.test(p)) {
      n = parseInt(p, 8);
    } else if (/^\d+$/.test(p)) {
      n = parseInt(p, 10);
    } else {
      return null;
    }
    if (isNaN(n) || n < 0) return null;
    nums.push(n);
  }

  let fullInt = 0;
  if (nums.length === 4) {
    if (nums.some(n => n > 255)) return null;
    fullInt = nums[0] * 16777216 + nums[1] * 65536 + nums[2] * 256 + nums[3];
  } else if (nums.length === 3) {
    if (nums[0] > 255 || nums[1] > 255 || nums[2] > 65535) return null;
    fullInt = nums[0] * 16777216 + nums[1] * 65536 + nums[2];
  } else if (nums.length === 2) {
    if (nums[0] > 255 || nums[1] > 16777215) return null;
    fullInt = nums[0] * 16777216 + nums[1];
  } else if (nums.length === 1) {
    if (nums[0] > 4294967295) return null;
    fullInt = nums[0];
  } else {
    return null;
  }

  if (fullInt < 0 || fullInt > 4294967295) return null;

  const o1 = Math.floor(fullInt / 16777216) & 255;
  const o2 = Math.floor(fullInt / 65536) & 255;
  const o3 = Math.floor(fullInt / 256) & 255;
  const o4 = fullInt & 255;
  return `${o1}.${o2}.${o3}.${o4}`;
}

/**
 * Parse and normalize an IP address representation (handling octal, hex, dword, IPv4-mapped IPv6, etc.)
 * Returns normalized string (e.g. '127.0.0.1' or '::1') or null if not a parseable IP.
 * @param {string} rawIp
 * @returns {string|null}
 */
export function normalizeIpAddress(rawIp) {
  if (!rawIp || typeof rawIp !== 'string') return null;
  let ip = rawIp.trim().toLowerCase();

  // Strip brackets if IPv6 literal like [::1] or [127.0.0.1]
  if (ip.startsWith('[') && ip.endsWith(']')) {
    ip = ip.slice(1, -1).trim();
  }

  // IPv4-mapped IPv6 formats:
  // e.g. ::ffff:127.0.0.1, [::ffff:7f00:1], 0:0:0:0:0:ffff:127.0.0.1, ::ffff:a9fe:a9fe, ::ffff:0177.0.0.1
  const ipv4MappedMatch = /(?:^|:)(?:ffff|0*ffff):([0-9a-fA-F:.]+)$/i.exec(ip);
  if (ipv4MappedMatch) {
    const rem = ipv4MappedMatch[1];
    if (rem.includes(':')) {
      const parts = rem.split(':');
      if (parts.length === 2) {
        const w1 = parseInt(parts[0], 16);
        const w2 = parseInt(parts[1], 16);
        if (!isNaN(w1) && !isNaN(w2) && w1 >= 0 && w1 <= 0xffff && w2 >= 0 && w2 <= 0xffff) {
          return `${(w1 >> 8) & 0xff}.${w1 & 0xff}.${(w2 >> 8) & 0xff}.${w2 & 0xff}`;
        }
      }
    } else {
      const normalizedRem = parseIpv4Parts(rem);
      if (normalizedRem) return normalizedRem;
    }
  }

  // IPv4-compatible IPv6 format (::127.0.0.1)
  const ipv4CompatMatch = /^::(\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3})$/.exec(ip);
  if (ipv4CompatMatch) {
    const normalizedCompat = parseIpv4Parts(ipv4CompatMatch[1]);
    if (normalizedCompat) return normalizedCompat;
  }

  // Try dotted or single-number IPv4 formats (decimal, hex, octal)
  const normalizedIpv4 = parseIpv4Parts(ip);
  if (normalizedIpv4) return normalizedIpv4;

  return ip;
}

/**
 * Check if an IP address is a private, reserved, loopback, or cloud-metadata IP.
 * Covers RFC 1122, RFC 1918, RFC 3927, RFC 6598, RFC 6890, RFC 4291, and cloud metadata.
 * Strictly blocks IPv4-mapped IPv6, octal/hex IP formats, and cloud metadata (169.254.169.254).
 * @param {string} rawIp
 * @returns {boolean}
 */
export function isPrivateIp(rawIp) {
  if (!rawIp || typeof rawIp !== 'string') return true;

  const ip = normalizeIpAddress(rawIp);
  if (!ip) return true;

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
    // 169.254.0.0/16 (Link-local & AWS/GCP/Azure/OpenStack cloud metadata: 169.254.169.254)
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

  // IPv6 checks (RFC 4193 ULA fc00::/7, link-local fe80::/10, multicast ff00::/8, etc.)
  if (/^f[cd][0-9a-f]{2}:/i.test(ip) || /^fe[89ab][0-9a-f]:/i.test(ip)) {
    return true;
  }
  if (ip.startsWith('ff')) return true; // Multicast
  if (ip.startsWith('2001:db8:')) return true; // Documentation
  if (ip.startsWith('100::') || ip.startsWith('64:ff9b::')) return true;
  if (ip.includes('ec2::254') || ip === 'fd00:ec2::254') return true; // AWS IPv6 metadata
  if (ip.startsWith('::ffff:')) return true;

  return false;
}

/**
 * Validate URL protocol and resolve hostname to ensure it does not point to internal IP.
 * Returns the resolved IP to enable DNS-pinning and prevent DNS rebinding attacks.
 * @param {string} rawUrl
 * @returns {Promise<{safe: boolean, hostname: string, resolvedIp?: string, addresses?: string[], resolvedEntries?: Array<{address: string, family: number}>, error?: string}>}
 */
export async function isSafeUrl(rawUrl) {
  try {
    const parsed = new URL(rawUrl);
    if (!['http:', 'https:'].includes(parsed.protocol)) {
      return { safe: false, hostname: '', error: 'Disallowed protocol' };
    }

    const hostname = parsed.hostname.toLowerCase().replace(/\.+$/, '');
    if (!hostname) {
      return { safe: false, hostname: '', error: 'Missing hostname' };
    }

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

    // Direct IP address check (handles dotted IPv4, octal, hex, dword, IPv6, IPv4-mapped IPv6)
    const normalizedIp = normalizeIpAddress(hostname);
    const isDirectIp = normalizedIp !== null && (
      /^(\d{1,3}\.){3}\d{1,3}$/.test(normalizedIp) ||
      normalizedIp.includes(':')
    );

    if (isDirectIp) {
      if (isPrivateIp(normalizedIp)) {
        return { safe: false, hostname, error: 'Direct private IP access blocked' };
      }
      const family = net.isIP(normalizedIp) || (normalizedIp.includes(':') ? 6 : 4);
      return {
        safe: true,
        hostname,
        resolvedIp: normalizedIp,
        addresses: [normalizedIp],
        resolvedEntries: [{ address: normalizedIp, family }],
      };
    }

    // Resolve DNS to verify actual IP
    let addresses;
    try {
      addresses = await dnsPromises.lookup(hostname, { all: true });
      if (!addresses || addresses.length === 0) {
        return { safe: false, hostname, error: 'DNS resolution returned no addresses' };
      }
      for (const addr of addresses) {
        if (isPrivateIp(addr.address)) {
          return { safe: false, hostname, error: `Resolved to private IP: ${addr.address}` };
        }
      }
    } catch (dnsErr) {
      return { safe: false, hostname, error: `DNS resolution failed: ${dnsErr.message}` };
    }

    const resolvedEntries = addresses.map((a) => ({
      address: a.address,
      family: a.family || net.isIP(a.address) || (a.address.includes(':') ? 6 : 4),
    }));
    const resolvedIp = resolvedEntries[0].address;
    return {
      safe: true,
      hostname,
      resolvedIp,
      addresses: resolvedEntries.map((a) => a.address),
      resolvedEntries,
    };
  } catch (err) {
    return { safe: false, hostname: '', error: err.message };
  }
}

function normalizeRequestHeaders(inputHeaders) {
  const out = {};
  if (!inputHeaders) return out;
  if (inputHeaders instanceof Headers) {
    for (const [k, v] of inputHeaders.entries()) {
      out[k] = v;
    }
  } else if (Array.isArray(inputHeaders)) {
    for (const [k, v] of inputHeaders) {
      if (v !== undefined) out[k] = v;
    }
  } else if (typeof inputHeaders === 'object') {
    for (const [k, v] of Object.entries(inputHeaders)) {
      if (v !== undefined) out[k] = v;
    }
  }
  return out;
}

function createPinnedLookup(expectedHostname, resolvedEntries) {
  return (hostname, opts, cb) => {
    if (typeof opts === 'function') {
      cb = opts;
      opts = {};
    }
    const cleanHost = String(hostname || '').toLowerCase().replace(/\.+$/, '');
    if (cleanHost !== expectedHostname) {
      return cb(new Error(`SSRF Protection: Unexpected hostname lookup mismatch (${cleanHost})`));
    }

    const safeEntries = (resolvedEntries || []).filter((entry) => !isPrivateIp(entry.address));
    if (safeEntries.length === 0) {
      return cb(new Error('SSRF Protection: No validated public IP addresses available'));
    }

    const requestedFamily = opts && (opts.family === 4 || opts.family === 6) ? opts.family : null;
    const filtered = requestedFamily
      ? safeEntries.filter((e) => e.family === requestedFamily)
      : safeEntries;

    if (filtered.length === 0) {
      const err = new Error(`ENOTFOUND ${cleanHost}`);
      err.code = 'ENOTFOUND';
      return cb(err);
    }

    if (opts && opts.all) {
      return cb(null, filtered.map((e) => ({ address: e.address, family: e.family })));
    }
    return cb(null, filtered[0].address, filtered[0].family);
  };
}

function executePinnedRequest(targetUrl, safety, options = {}) {
  return new Promise((resolve, reject) => {
    let parsed;
    try {
      parsed = new URL(targetUrl);
    } catch (err) {
      return reject(err);
    }

    const client = parsed.protocol === 'https:' ? https : http;
    const method = String(options.method || 'GET').toUpperCase();
    const headers = normalizeRequestHeaders(options.headers);
    const body = options.body;

    if (body !== undefined && body !== null) {
      const hasContentLength = Object.keys(headers).some((k) => k.toLowerCase() === 'content-length');
      if (!hasContentLength && (typeof body === 'string' || Buffer.isBuffer(body) || body instanceof Uint8Array)) {
        headers['Content-Length'] = Buffer.byteLength(body);
      }
    }

    const cleanHost = parsed.hostname.toLowerCase().replace(/\.+$/, '');
    const resolvedEntries = safety.resolvedEntries && safety.resolvedEntries.length > 0
      ? safety.resolvedEntries
      : (safety.addresses || [safety.resolvedIp]).filter(Boolean).map((addr) => ({
          address: addr,
          family: net.isIP(addr) || (addr.includes(':') ? 6 : 4),
        }));

    const reqOptions = {
      protocol: parsed.protocol,
      hostname: cleanHost,
      port: parsed.port ? Number(parsed.port) : (parsed.protocol === 'https:' ? 443 : 80),
      path: `${parsed.pathname || '/'}${parsed.search || ''}`,
      method,
      headers,
      agent: false,
      lookup: createPinnedLookup(cleanHost, resolvedEntries),
      timeout: options.timeout || 10000,
    };

    if (options.signal) {
      reqOptions.signal = options.signal;
    }

    if (parsed.protocol === 'https:' && !net.isIP(cleanHost)) {
      reqOptions.servername = cleanHost;
    }

    const req = client.request(reqOptions, (nodeRes) => {
      resolve(nodeRes);
    });

    req.on('timeout', () => {
      req.destroy(new Error('Request timed out'));
    });

    req.on('error', (err) => {
      reject(err);
    });

    if (body !== undefined && body !== null && method !== 'GET' && method !== 'HEAD') {
      req.write(body);
    }

    req.end();
  });
}

function nodeResponseToWebResponse(nodeRes) {
  const headers = new Headers();
  for (const [key, val] of Object.entries(nodeRes.headers || {})) {
    if (Array.isArray(val)) {
      for (const item of val) headers.append(key, String(item));
    } else if (val !== undefined) {
      headers.set(key, String(val));
    }
  }

  const status = nodeRes.statusCode || 200;
  const nullBodyStatuses = new Set([204, 205, 304]);
  let bodyStream = null;
  if (nullBodyStatuses.has(status)) {
    nodeRes.resume();
  } else {
    bodyStream = Readable.toWeb(nodeRes);
  }

  return new Response(bodyStream, {
    status,
    statusText: nodeRes.statusMessage || '',
    headers,
  });
}

/**
 * Safe fetch wrapper that prevents SSRF across HTTP 3xx redirect chains and DNS Rebinding.
 * Pins validated IPs in DNS lookup so outbound connections cannot be switched mid-request.
 * Enforces redirect: 'manual' and re-validates each destination against isSafeUrl.
 * @param {string} targetUrl
 * @param {RequestInit} [options={}]
 * @param {number} [maxRedirects=5]
 * @returns {Promise<Response>}
 */
export async function safeFetch(targetUrl, options = {}, maxRedirects = 5) {
  let currUrl = targetUrl;
  let currOptions = { ...options };
  const seenUrls = new Set([currUrl]);

  for (let hop = 0; hop <= maxRedirects; hop++) {
    const safety = await isSafeUrl(currUrl);
    if (!safety.safe) {
      throw new Error(`SSRF Protection: Access to private or local network is blocked (${safety.error || 'unsafe URL'}).`);
    }

    const nodeRes = await executePinnedRequest(currUrl, safety, currOptions);
    const status = nodeRes.statusCode || 200;

    if ([301, 302, 303, 307, 308].includes(status)) {
      const rawLocation = nodeRes.headers.location;
      const location = Array.isArray(rawLocation) ? rawLocation[0] : rawLocation;
      if (!location) {
        return nodeResponseToWebResponse(nodeRes);
      }

      nodeRes.resume();

      const nextUrl = new URL(location, currUrl).toString();
      if (seenUrls.has(nextUrl)) {
        throw new Error('SSRF Protection: Redirect loop detected');
      }

      if (hop === maxRedirects) {
        throw new Error('SSRF Protection: Maximum redirects exceeded');
      }

      if ([301, 302, 303].includes(status) && currOptions.method && currOptions.method.toUpperCase() !== 'GET' && currOptions.method.toUpperCase() !== 'HEAD') {
        const nextHeaders = normalizeRequestHeaders(currOptions.headers);
        for (const hKey of Object.keys(nextHeaders)) {
          if (['content-length', 'content-type'].includes(hKey.toLowerCase())) {
            delete nextHeaders[hKey];
          }
        }
        currOptions = {
          ...currOptions,
          method: 'GET',
          headers: nextHeaders,
          body: undefined,
        };
      }

      seenUrls.add(nextUrl);
      currUrl = nextUrl;
      continue;
    }

    return nodeResponseToWebResponse(nodeRes);
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

    if (!res.ok) {
      await res.body?.cancel().catch(() => {});
      clearTimeout(timeoutId);
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
      await res.body?.cancel().catch(() => {});
      clearTimeout(timeoutId);
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

    // Read only up to MAX_HTML_SIZE bytes via stream to prevent OOM
    let truncatedHtml = '';
    if (res.body) {
      const reader = res.body.getReader();
      const chunks = [];
      let totalBytes = 0;
      try {
        while (true) {
          const { done, value } = await reader.read();
          if (done) break;
          if (value) {
            const remaining = MAX_HTML_SIZE - totalBytes;
            if (value.byteLength >= remaining) {
              chunks.push(Buffer.from(value.subarray(0, remaining)));
              totalBytes += remaining;
              await reader.cancel().catch(() => {});
              break;
            }
            chunks.push(Buffer.from(value));
            totalBytes += value.byteLength;
          }
        }
      } finally {
        reader.releaseLock();
      }
      truncatedHtml = Buffer.concat(chunks).toString('utf8');
    }
    clearTimeout(timeoutId);

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
