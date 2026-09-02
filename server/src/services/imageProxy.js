/**
 * @fileoverview Image proxy service — fetches external images securely.
 * Enforces strict SSRF protection, redirect recursion depth limits, size limits, and SVG sanitization.
 */

import https from 'https';
import http from 'http';
import { isSafeUrl } from './linkPreviewService.js';
import { JSDOM } from 'jsdom';
import createDOMPurify from 'dompurify';

const window = new JSDOM('').window;
const DOMPurify = createDOMPurify(window);

const MAX_SIZE = 5 * 1024 * 1024; // 5MB
const TIMEOUT = 8000; // 8s
const MAX_REDIRECTS = 3;
const ALLOWED_TYPES = ['image/jpeg', 'image/png', 'image/gif', 'image/webp', 'image/svg+xml'];

/**
 * Fetch an external image by URL and return the buffer + content type.
 * @param {string} url - External image URL
 * @param {number} [redirectCount=0]
 * @returns {Promise<{buffer: Buffer, contentType: string}>}
 */
export async function fetchImage(url, redirectCount = 0) {
  if (redirectCount > MAX_REDIRECTS) {
    throw new Error('Too many redirects');
  }

  // SSRF pre-flight validation
  const check = await isSafeUrl(url);
  if (!check.safe) {
    throw new Error(`SSRF Blocked: ${check.error || 'Private/internal IP prohibited'}`);
  }

  return new Promise((resolve, reject) => {
    let parsedUrl;
    try {
      parsedUrl = new URL(url);
    } catch {
      return reject(new Error('Invalid URL format'));
    }

    const client = parsedUrl.protocol === 'https:' ? https : http;

    const req = client.get(url, {
      timeout: TIMEOUT,
      headers: {
        'User-Agent': 'WoxMail-ImageProxy/1.0',
        'Accept': 'image/webp,image/png,image/jpeg,image/*;q=0.8',
      },
    }, (res) => {
      // Follow redirects safely (max 3)
      if ([301, 302, 303, 307, 308].includes(res.statusCode) && res.headers.location) {
        let redirectTarget = res.headers.location;
        try {
          // Resolve relative redirect paths
          redirectTarget = new URL(redirectTarget, url).toString();
        } catch {
          return reject(new Error('Invalid redirect target URL'));
        }
        return fetchImage(redirectTarget, redirectCount + 1).then(resolve).catch(reject);
      }

      if (res.statusCode !== 200) {
        return reject(new Error(`HTTP ${res.statusCode}`));
      }

      const contentType = (res.headers['content-type'] || '').split(';')[0].trim().toLowerCase();
      if (!ALLOWED_TYPES.includes(contentType)) {
        return reject(new Error(`Disallowed content type: ${contentType}`));
      }

      const chunks = [];
      let totalSize = 0;

      res.on('data', (chunk) => {
        totalSize += chunk.length;
        if (totalSize > MAX_SIZE) {
          res.destroy();
          reject(new Error('Image too large'));
          return;
        }
        chunks.push(chunk);
      });

      res.on('end', () => {
        let finalBuffer = Buffer.concat(chunks);

        // Sanitize SVG to prevent stored XSS via SVG scripts
        if (contentType === 'image/svg+xml') {
          const rawSvg = finalBuffer.toString('utf8');
          const cleanSvg = DOMPurify.sanitize(rawSvg, {
            USE_PROFILES: { svg: true, svgFilters: true },
            FORBID_TAGS: ['script', 'iframe', 'object', 'embed', 'foreignObject'],
            FORBID_ATTR: ['onerror', 'onload', 'onclick', 'onmouseover', 'onfocus', 'onblur'],
          });
          finalBuffer = Buffer.from(cleanSvg, 'utf8');
        }

        resolve({
          buffer: finalBuffer,
          contentType,
        });
      });

      res.on('error', reject);
    });

    req.on('timeout', () => {
      req.destroy();
      reject(new Error('Image fetch timeout'));
    });

    req.on('error', reject);
  });
}

/**
 * Validate and sanitize an image proxy URL.
 * @param {string} url - URL to validate
 * @returns {boolean}
 */
export function isValidImageUrl(url) {
  try {
    const parsed = new URL(url);
    return ['http:', 'https:'].includes(parsed.protocol);
  } catch {
    return false;
  }
}

export default { fetchImage, isValidImageUrl };
