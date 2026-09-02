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

/**
 * Sanitize HTML email content for safe rendering.
 * Strips XSS vectors while preserving legitimate formatting.
 *
 * @param {string} html - Raw HTML email body
 * @param {object} [options]
 * @param {boolean} [options.loadImages=false] - Whether to allow external images
 * @param {string} [options.proxyBase='/api/mail/proxy-image'] - Image proxy URL base
 * @returns {{ html: string, trackers: number }}
 */
export function sanitizeEmail(html, options = {}) {
  const { loadImages = true, allowScripts = false, proxyBase = '/api/mail/proxy-image' } = options;
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

  if (allowScripts) {
    allowedTags.push('script', 'form', 'input', 'textarea', 'button', 'select', 'canvas', 'noscript');
  }

  // DOMPurify config — preserve email CSS layouts, tables, and typography
  const clean = DOMPurify.sanitize(html, {
    ALLOWED_TAGS: allowedTags,
    ALLOWED_ATTR: [
      'href', 'src', 'alt', 'title', 'width', 'height', 'style',
      'class', 'colspan', 'rowspan', 'align', 'valign', 'border',
      'cellpadding', 'cellspacing', 'bgcolor', 'background', 'color', 'face',
      'size', 'dir', 'target', 'viewBox', 'xmlns', 'fill', 'stroke', 'stroke-width',
      'data-original-src', 'data-loaded', 'type', 'id', 'name', 'value', 'placeholder', 'action', 'method',
    ],
    ALLOW_DATA_ATTR: true,
    ADD_ATTR: ['target'],
    FORBID_TAGS: allowScripts ? ['iframe', 'object', 'embed', 'applet'] : ['script', 'iframe', 'form', 'input', 'textarea', 'button', 'select', 'object', 'embed', 'applet'],
    FORBID_ATTR: allowScripts ? [] : ['onerror', 'onload', 'onclick', 'onmouseover', 'onfocus', 'onblur'],
  });

  // Parse sanitized HTML for further processing
  const dom = new JSDOM(clean);
  const doc = dom.window.document;

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

    // Strip invisible 1x1 tracking pixels
    const width = parseInt(img.getAttribute('width'), 10) || 0;
    const height = parseInt(img.getAttribute('height'), 10) || 0;
    const isTracker =
      (width === 1 && height === 1) ||
      (width === 0 && height === 0 && !img.getAttribute('alt')) ||
      TRACKING_DOMAINS.some((d) => src.includes(d));

    if (isTracker) {
      img.remove();
      trackerCount++;
      return;
    }

    // Keep CID images and inline data URLs intact
    if (src.startsWith('cid:') || src.startsWith('data:')) {
      return;
    }

    if (src.startsWith('http://') || src.startsWith('https://')) {
      if (!loadImages) {
        img.setAttribute('data-original-src', src);
        img.setAttribute('src', '');
        const existingClass = img.getAttribute('class') || '';
        if (!existingClass.includes('blocked-image')) {
          img.setAttribute('class', `${existingClass} blocked-image`.trim());
        }
        img.setAttribute('alt', img.getAttribute('alt') || '[Remote image blocked — Click to load]');
      } else {
        img.setAttribute('src', src);
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
