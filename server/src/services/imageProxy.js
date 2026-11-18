/**
 * @fileoverview Image proxy service — fetches external images securely.
 * Enforces strict SSRF protection, redirect recursion depth limits, size limits, and SVG sanitization.
 */

import { isSafeUrl, safeFetch } from './linkPreviewService.js';
import { JSDOM } from 'jsdom';
import createDOMPurify from 'dompurify';

const window = new JSDOM('').window;
const DOMPurify = createDOMPurify(window);

const MAX_BYTES = 5 * 1024 * 1024; // 5MB
const TIMEOUT = 8000; // 8s
const MAX_REDIRECTS = 3;
const ALLOWED_TYPES = ['image/jpeg', 'image/png', 'image/gif', 'image/webp', 'image/svg+xml'];
const FORBIDDEN_SVG_TAGS = [
  'script', 'iframe', 'frame', 'frameset', 'object', 'embed', 'applet',
  'foreignObject', 'animate', 'animateMotion', 'animateTransform', 'set',
  'use', 'handler', 'listener',
];

function isUnsafeUriValue(val) {
  if (!val || typeof val !== 'string') return false;
  const normalized = val.replace(/[\u0000-\u0020]+/g, '').toLowerCase();
  return (
    normalized.startsWith('javascript:') ||
    normalized.startsWith('vbscript:') ||
    normalized.startsWith('data:text/html') ||
    normalized.startsWith('data:application/') ||
    normalized.startsWith('http://') ||
    normalized.startsWith('https://') ||
    normalized.startsWith('//')
  );
}

function sanitizeSvgContent(rawSvg) {
  const cleanSvg = DOMPurify.sanitize(rawSvg, {
    USE_PROFILES: { svg: true, svgFilters: true },
    FORBID_TAGS: FORBIDDEN_SVG_TAGS,
    FORBID_ATTR: [
      'onerror', 'onload', 'onclick', 'onmouseover', 'onmouseenter', 'onmouseleave',
      'onfocus', 'onblur', 'onanimationstart', 'onanimationend', 'onbegin', 'onend',
      'onrepeat', 'ontoggle', 'action', 'formaction',
    ],
  });

  if (!cleanSvg || !cleanSvg.trim()) {
    throw new Error('Invalid or unsafe SVG content');
  }

  const dom = new JSDOM(cleanSvg);
  const doc = dom.window.document;

  doc.querySelectorAll(FORBIDDEN_SVG_TAGS.join(',')).forEach((el) => el.remove());

  doc.querySelectorAll('*').forEach((el) => {
    for (const attr of Array.from(el.attributes)) {
      const nameLower = attr.name.toLowerCase();
      if (nameLower.startsWith('on')) {
        el.removeAttribute(attr.name);
        continue;
      }
      if (['href', 'xlink:href', 'src', 'action', 'formaction'].includes(nameLower)) {
        if (isUnsafeUriValue(attr.value)) {
          el.removeAttribute(attr.name);
        }
      }
      if (nameLower === 'style') {
        const cleanedStyle = attr.value
          .replace(/expression\s*\([^)]*\)/gi, '')
          .replace(/url\s*\(\s*(['"]?)\s*(?!#)(?!data:image\/(?!svg\+xml))[^)]*\1\s*\)/gi, 'none');
        el.setAttribute('style', cleanedStyle);
      }
    }
  });

  doc.querySelectorAll('style').forEach((styleEl) => {
    const cleanedBlock = (styleEl.textContent || '')
      .replace(/\\[0-9a-f]{1,6}\s?/gi, '')
      .replace(/@import\b[^;]*(;|$)/gi, '')
      .replace(/expression\s*\([^)]*\)/gi, 'none')
      .replace(/javascript\s*:/gi, 'blocked:')
      .replace(/vbscript\s*:/gi, 'blocked:')
      .replace(/url\s*\(\s*(['"]?)\s*(?!#)(?!data:image\/(?!svg\+xml))[^)]*\1\s*\)/gi, 'none');
    styleEl.textContent = cleanedBlock;
  });

  const svgEl = doc.querySelector('svg');
  if (!svgEl) {
    throw new Error('Invalid or unsafe SVG content');
  }

  return svgEl.outerHTML;
}

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

  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(new Error('Image fetch timeout')), TIMEOUT);

  try {
    const remainingRedirects = Math.max(0, MAX_REDIRECTS - redirectCount);
    const res = await safeFetch(url, {
      signal: controller.signal,
      headers: {
        'User-Agent': 'WoxMail-ImageProxy/1.0',
        'Accept': 'image/webp,image/png,image/jpeg,image/*;q=0.8',
      },
    }, remainingRedirects);

    if (res.status !== 200) {
      await res.body?.cancel().catch(() => {});
      throw new Error(`HTTP ${res.status}`);
    }

    const contentType = (res.headers.get('content-type') || '').split(';')[0].trim().toLowerCase();
    if (!ALLOWED_TYPES.includes(contentType)) {
      await res.body?.cancel().catch(() => {});
      throw new Error(`Disallowed content type: ${contentType}`);
    }

    const contentLengthHeader = res.headers.get('content-length');
    if (contentLengthHeader !== null) {
      const declaredSize = Number(contentLengthHeader);
      if (!Number.isNaN(declaredSize) && declaredSize > MAX_BYTES) {
        controller.abort();
        await res.body?.cancel().catch(() => {});
        throw new Error('Image too large');
      }
    }

    const chunks = [];
    let totalSize = 0;

    if (res.body) {
      const reader = res.body.getReader();
      try {
        while (true) {
          const { done, value } = await reader.read();
          if (done) break;
          if (value) {
            totalSize += value.byteLength;
            if (totalSize > MAX_BYTES) {
              controller.abort();
              await reader.cancel().catch(() => {});
              throw new Error('Image too large');
            }
            chunks.push(Buffer.from(value));
          }
        }
      } finally {
        reader.releaseLock();
      }
    }

    let finalBuffer = Buffer.concat(chunks);

    // Strictly sanitize SVG to prevent stored XSS via SVG scripts/handlers/foreignObject
    if (contentType === 'image/svg+xml') {
      const rawSvg = finalBuffer.toString('utf8');
      const cleanSvg = sanitizeSvgContent(rawSvg);
      finalBuffer = Buffer.from(cleanSvg, 'utf8');
    }

    return {
      buffer: finalBuffer,
      contentType,
    };
  } catch (err) {
    if (err.name === 'AbortError' || err.message === 'Image fetch timeout') {
      throw new Error('Image fetch timeout');
    }
    throw err;
  } finally {
    clearTimeout(timeoutId);
  }
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
