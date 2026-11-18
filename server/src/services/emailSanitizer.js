import { JSDOM } from 'jsdom';
import createDOMPurify from 'dompurify';

// Create DOMPurify with jsdom for server-side sanitization
const window = new JSDOM('').window;
const DOMPurify = createDOMPurify(window);

// Known tracking pixel domains and spy beacons
const TRACKING_DOMAINS = [
  'pixel.', 'track.', 'open.', 'beacon.', 'click.',
  'mailchimp.com/track', 'sendgrid.net/wf/', 'sendgrid.net/ls/click',
  'list-manage.com/track', 'mandrillapp.com/track',
  'google-analytics.com', 'doubleclick.net',
  'hs-analytics.net', 'track.hubspot.com', 'hubspot.com/email',
  'klaviyo.com', 'iterable.com', 'customer.io', 'mixpanel.com',
  'segment.io', 'intercom-mail.com', 'salesforce.com', 'marketo.com',
  'activecampaign.com', 'getresponse.com', 'emlnk1.com',
];

/**
 * Remove tracking query parameters from legitimate URLs
 */
function cleanUrlParams(rawUrl) {
  try {
    const url = new URL(rawUrl);
    const trackingParams = [
      'utm_source', 'utm_medium', 'utm_campaign', 'utm_term', 'utm_content',
      'fbclid', 'gclid', 'mc_cid', 'mc_eid', '_hsenc', '_hsmi',
      'vero_id', 'mkt_tok', 'wickedid', 'yclid',
    ];
    trackingParams.forEach((param) => url.searchParams.delete(param));
    return url.toString();
  } catch {
    return rawUrl;
  }
}

function stripUnsafeCss(cssText, blockRemoteUrls) {
  if (!cssText || typeof cssText !== 'string') return '';
  let out = cssText
    // Neutralize CSS hex backslash escapes that could bypass keyword/url regexes
    .replace(/\\[0-9a-f]{1,6}\s?/gi, '')
    .replace(/@import\b[^;]*(;|$)/gi, '/* @import blocked */')
    .replace(/expression\s*\([^)]*\)/gi, 'none')
    .replace(/javascript\s*:/gi, 'blocked:')
    .replace(/vbscript\s*:/gi, 'blocked:')
    .replace(/data\s*:\s*(?:text\/html|text\/javascript|text\/xml|application\/|image\/svg\+xml)/gi, 'blocked:');

  if (blockRemoteUrls) {
    out = out.replace(/url\(\s*(['"]?)\s*([^)'"]*?)\s*\1\s*\)/gi, (full, _q, inner) => {
      const trimmed = (inner || '').trim();
      const lower = trimmed.toLowerCase();
      if (
        (lower.startsWith('data:image/') && !lower.startsWith('data:image/svg+xml')) ||
        lower.startsWith('cid:') ||
        lower.startsWith('#')
      ) {
        return full;
      }
      return 'none';
    });
    out = out.replace(/image-set\s*\([^)]*\)/gi, 'none');
  }
  return out;
}

function isDangerousScheme(val) {
  if (!val || typeof val !== 'string') return false;
  const normalized = val.replace(/[\u0000-\u0020]+/g, '').toLowerCase();
  return (
    normalized.startsWith('javascript:') ||
    normalized.startsWith('vbscript:') ||
    normalized.startsWith('data:text/html') ||
    normalized.startsWith('data:text/javascript') ||
    normalized.startsWith('data:text/xml') ||
    normalized.startsWith('data:image/svg+xml') ||
    normalized.startsWith('data:application/')
  );
}

/**
 * Sanitize HTML email content for safe rendering.
 * Strips XSS vectors while preserving legitimate formatting.
 *
 * @param {string} html - Raw HTML email body
 * @param {object} [options]
 * @param {boolean} [options.loadImages=true] - Whether to allow external images
 * @param {boolean} [options.blockRemoteImages=false] - Alias to force loadImages=false
 * @param {boolean} [options.proxyImages=false] - Whether to rewrite remote image URLs through proxyBase
 * @param {string} [options.proxyBase='/api/mail/proxy-image'] - Image proxy URL base
 * @returns {{ html: string, trackers: number }}
 */
export function sanitizeEmail(html, options = {}) {
  const { loadImages = true, blockRemoteImages = false, proxyImages = false, proxyBase = '/api/mail/proxy-image' } = options;
  const allowImages = blockRemoteImages ? false : loadImages;
  let trackerCount = 0;

  if (!html) return { html: '', trackers: 0 };

  const allowedTags = [
    'a', 'abbr', 'b', 'blockquote', 'br', 'caption', 'code', 'col',
    'colgroup', 'dd', 'del', 'div', 'dl', 'dt', 'em', 'h1', 'h2',
    'h3', 'h4', 'h5', 'h6', 'hr', 'i', 'img', 'ins', 'li', 'mark',
    'ol', 'p', 'pre', 'q', 's', 'small', 'span', 'strong', 'sub',
    'sup', 'table', 'tbody', 'td', 'tfoot', 'th', 'thead', 'tr',
    'u', 'ul', 'font', 'center', 'style', 'svg', 'path', 'circle', 'rect',
  ];

  // DOMPurify config — scripts, forms, interactive controls, and event handlers are ALWAYS forbidden
  const clean = DOMPurify.sanitize(html, {
    ALLOWED_TAGS: allowedTags,
    ALLOWED_ATTR: [
      'href', 'src', 'alt', 'title', 'width', 'height', 'style',
      'class', 'colspan', 'rowspan', 'align', 'valign', 'border',
      'cellpadding', 'cellspacing', 'bgcolor', 'background', 'color', 'face',
      'size', 'dir', 'target', 'viewBox', 'xmlns', 'fill', 'stroke', 'stroke-width',
      'data-original-src', 'data-loaded', 'id',
    ],
    ALLOW_DATA_ATTR: true,
    ADD_ATTR: ['target'],
    FORBID_TAGS: [
      'script', 'iframe', 'frame', 'frameset', 'object', 'embed', 'applet',
      'form', 'input', 'textarea', 'button', 'select', 'option', 'canvas',
      'noscript', 'meta', 'base', 'link', 'foreignObject', 'animate',
      'animateMotion', 'animateTransform', 'set', 'use',
    ],
    FORBID_ATTR: [
      'onerror', 'onload', 'onclick', 'onmouseover', 'onmouseenter', 'onmouseleave',
      'onfocus', 'onblur', 'onsubmit', 'onchange', 'oninput', 'onkeydown', 'onkeyup',
      'action', 'method', 'formaction',
    ],
  });

  // Parse sanitized HTML for further processing
  const dom = new JSDOM(clean);
  const doc = dom.window.document;

  // Defense-in-depth: strip any residual on* handlers, dangerous URI schemes, and CSS remote fetches
  doc.querySelectorAll('*').forEach((el) => {
    for (const attr of Array.from(el.attributes)) {
      const nameLower = attr.name.toLowerCase();
      if (nameLower.startsWith('on')) {
        el.removeAttribute(attr.name);
        continue;
      }
      if (['href', 'src', 'xlink:href', 'background'].includes(nameLower) && isDangerousScheme(attr.value)) {
        el.removeAttribute(attr.name);
        continue;
      }
      if (nameLower === 'style') {
        const sanitizedStyle = stripUnsafeCss(attr.value, !allowImages);
        if (sanitizedStyle) {
          el.setAttribute('style', sanitizedStyle);
        } else {
          el.removeAttribute('style');
        }
      }
      if (!allowImages && nameLower === 'background') {
        const bgVal = attr.value.trim();
        if (bgVal.startsWith('http://') || bgVal.startsWith('https://') || bgVal.startsWith('//')) {
          el.setAttribute('data-original-background', bgVal);
          el.removeAttribute('background');
        }
      }
    }
  });

  // Sanitize <style> blocks (strip @import / expression, and neutralize remote url() when images blocked)
  doc.querySelectorAll('style').forEach((styleEl) => {
    styleEl.textContent = stripUnsafeCss(styleEl.textContent || '', !allowImages);
  });

  // Process all links — clean tracking query params and force safe rel
  doc.querySelectorAll('a').forEach((a) => {
    const rawHref = a.getAttribute('href');
    if (rawHref && (rawHref.startsWith('http://') || rawHref.startsWith('https://'))) {
      a.setAttribute('href', cleanUrlParams(rawHref));
    }
    a.setAttribute('target', '_blank');
    a.setAttribute('rel', 'noopener noreferrer');
  });

  // Process all images
  doc.querySelectorAll('img').forEach((img) => {
    const src = img.getAttribute('src') || img.getAttribute('data-original-src') || '';

    // Strip invisible 0x0 / 1x1 tracking pixels (HTML attributes OR inline CSS style dimensions)
    const hasWidth = img.hasAttribute('width');
    const hasHeight = img.hasAttribute('height');
    const rawWidth = hasWidth ? parseInt(img.getAttribute('width'), 10) : NaN;
    const rawHeight = hasHeight ? parseInt(img.getAttribute('height'), 10) : NaN;
    const isAttrDimensionTracker =
      (hasWidth || hasHeight) &&
      (!hasWidth || (!Number.isNaN(rawWidth) && rawWidth <= 1)) &&
      (!hasHeight || (!Number.isNaN(rawHeight) && rawHeight <= 1));

    const styleAttr = (img.getAttribute('style') || '').toLowerCase();
    const cssWidthMatch = styleAttr.match(/(?:^|;)\s*width\s*:\s*([0-9.]+)\s*px\b/);
    const cssHeightMatch = styleAttr.match(/(?:^|;)\s*height\s*:\s*([0-9.]+)\s*px\b/);
    const isCssDimensionTracker =
      (cssWidthMatch && parseFloat(cssWidthMatch[1]) <= 1) &&
      (cssHeightMatch && parseFloat(cssHeightMatch[1]) <= 1);
    const isDimensionTracker = isAttrDimensionTracker || Boolean(isCssDimensionTracker);

    const isTracker =
      isDimensionTracker ||
      TRACKING_DOMAINS.some((d) => src.toLowerCase().includes(d));

    if (isTracker) {
      img.remove();
      trackerCount++;
      return;
    }

    // Keep CID images and inline data URLs intact
    if (src.startsWith('cid:') || src.startsWith('data:')) {
      return;
    }

    if (src.startsWith('http://') || src.startsWith('https://') || src.startsWith('//')) {
      const normalizedRemoteSrc = src.startsWith('//') ? `https:${src}` : src;
      if (!allowImages) {
        img.setAttribute('data-original-src', normalizedRemoteSrc);
        img.setAttribute('src', '');
        const existingClass = img.getAttribute('class') || '';
        if (!existingClass.includes('blocked-image')) {
          img.setAttribute('class', `${existingClass} blocked-image`.trim());
        }
        img.setAttribute('alt', img.getAttribute('alt') || '[Remote image blocked — Click to load]');
      } else {
        const finalSrc = proxyImages && !normalizedRemoteSrc.startsWith(proxyBase)
          ? `${proxyBase}${proxyBase.includes('?') ? '&' : '?'}url=${encodeURIComponent(normalizedRemoteSrc)}`
          : normalizedRemoteSrc;
        img.setAttribute('src', finalSrc);
        img.removeAttribute('data-original-src');
        img.setAttribute('data-loaded', 'true');
        const existingClass = img.getAttribute('class') || '';
        img.setAttribute('class', existingClass.replace(/\bblocked-image\b/g, '').trim());
      }
    }
  });

  return {
    html: doc.body.innerHTML,
    trackers: trackerCount,
  };
}

/**
 * Convert HTML to plain text (strip all tags).
 * @param {string} html
 * @returns {string}
 */
export function htmlToPlainText(html) {
  if (!html) return '';
  const dom = new JSDOM(html);
  return dom.window.document.body.textContent?.trim() || '';
}

/**
 * Extract a preview snippet from email HTML.
 * @param {string} html
 * @param {number} [maxLength=120]
 * @returns {string}
 */
export function extractPreview(html, maxLength = 120) {
  const text = htmlToPlainText(html);
  if (text.length <= maxLength) return text;
  return text.slice(0, maxLength).trim() + '…';
}

export default { sanitizeEmail, htmlToPlainText, extractPreview };
