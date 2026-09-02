import { PAGINATION } from '../config/constants.js';

/**
 * Format a date to a human-readable relative string.
 * @param {Date|string} date
 * @returns {string} e.g. "2 hours ago", "Yesterday", "Aug 15"
 */
export function formatRelativeDate(date) {
  const d = new Date(date);
  const now = new Date();
  const diffMs = now - d;
  const diffSec = Math.floor(diffMs / 1000);
  const diffMin = Math.floor(diffSec / 60);
  const diffHour = Math.floor(diffMin / 60);
  const diffDay = Math.floor(diffHour / 24);

  if (diffSec < 60) return 'Just now';
  if (diffMin < 60) return `${diffMin}m ago`;
  if (diffHour < 24) return `${diffHour}h ago`;
  if (diffDay === 1) return 'Yesterday';
  if (diffDay < 7) return `${diffDay}d ago`;

  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
}

/**
 * Format file size in bytes to human-readable string.
 * @param {number} bytes
 * @returns {string} e.g. "1.5 MB", "256 KB"
 */
export function formatFileSize(bytes) {
  if (bytes === 0) return '0 B';
  const units = ['B', 'KB', 'MB', 'GB'];
  const i = Math.floor(Math.log(bytes) / Math.log(1024));
  return `${(bytes / Math.pow(1024, i)).toFixed(i > 0 ? 1 : 0)} ${units[i]}`;
}

/**
 * Parse pagination parameters from request query.
 * @param {object} query - req.query object
 * @returns {{ page: number, limit: number, offset: number }}
 */
export function parsePagination(query) {
  const page = Math.max(1, parseInt(query.page, 10) || 1);
  const limit = Math.min(
    PAGINATION.MAX_PAGE_SIZE,
    Math.max(1, parseInt(query.limit, 10) || PAGINATION.DEFAULT_PAGE_SIZE)
  );
  const offset = (page - 1) * limit;
  return { page, limit, offset };
}

/**
 * Build pagination metadata for API responses.
 * @param {number} total - Total record count
 * @param {number} page - Current page
 * @param {number} limit - Items per page
 * @returns {object}
 */
export function paginationMeta(total, page, limit) {
  return {
    total,
    page,
    limit,
    totalPages: Math.ceil(total / limit),
    hasNext: page * limit < total,
    hasPrev: page > 1,
  };
}

/**
 * Extract display name from an email address.
 * "John Doe <john@example.com>" → "John Doe"
 * "john@example.com" → "john"
 * @param {string} emailStr
 * @returns {{ name: string, address: string }}
 */
export function parseEmailAddress(emailStr) {
  if (!emailStr) return { name: '', address: '' };

  const match = emailStr.match(/^(.+?)\s*<(.+?)>$/);
  if (match) {
    return { name: match[1].trim().replace(/^"|"$/g, ''), address: match[2].trim() };
  }

  const address = emailStr.trim();
  return { name: address.split('@')[0], address };
}

/**
 * Generate a convincing, realistic, human-like email username that is purely alphanumeric.
 * (Purelymail disables usernames with dots/underscores when symbolic subaddressing is enabled).
 * e.g. "alexrivera84", "jordanhayes", "lucasvance92", "sophiamercer", "masonwest45"
 * @returns {string}
 */
export function generateRandomUsername() {
  const firstNames = [
    'alex', 'jordan', 'taylor', 'marcus', 'sophia', 'lucas', 'elena', 'ryan',
    'chloe', 'noah', 'maya', 'daniel', 'olivia', 'ethan', 'clara', 'liam',
    'emma', 'samuel', 'ava', 'victor', 'hannah', 'adrian', 'mia', 'julian',
    'nora', 'leo', 'zoe', 'felix', 'isla', 'mason', 'aiden', 'grace', 'logan',
  ];

  const lastNames = [
    'rivera', 'hayes', 'vance', 'bennett', 'reid', 'mercer', 'sterling',
    'foster', 'cross', 'sinclair', 'cooper', 'mitchell', 'frost', 'palmer',
    'chen', 'novak', 'bishop', 'drake', 'ellis', 'knight', 'west', 'hart',
    'brooks', 'hayward', 'turner', 'morgan', 'sinclair', 'lowell', 'holmes',
  ];

  const first = firstNames[Math.floor(Math.random() * firstNames.length)];
  const last = lastNames[Math.floor(Math.random() * lastNames.length)];
  const pattern = Math.floor(Math.random() * 3);

  if (pattern === 0) {
    // e.g. alexrivera84
    const num = Math.floor(Math.random() * 90) + 10;
    return `${first}${last}${num}`;
  } else if (pattern === 1) {
    // e.g. jordanhayes
    return `${first}${last}`;
  } else {
    // e.g. masonwest57
    const num = Math.floor(Math.random() * 90) + 10;
    return `${first}${last}${num}`;
  }
}

/**
 * Sleep utility for async/await.
 * @param {number} ms
 */
export function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Identify and suppress default Purelymail platform welcome email.
 * Legitimate user emails, security alerts, and system confirmations are NEVER suppressed.
 * @param {object} msg
 * @returns {boolean}
 */
export function isPurelymailWelcomeEmail(msg) {
  if (!msg) return false;
  const fromAddr = (typeof msg.from === 'object' ? (msg.from?.address || msg.from?.name || '') : String(msg.from || '')).toLowerCase();
  const subject = String(msg.subject || '').toLowerCase().trim();
  return (
    subject.includes('welcome to purelymail') ||
    (fromAddr.includes('support@purelymail.com') && subject.includes('welcome'))
  );
}

/**
 * Safely parse integer from string, URL param, or query with bounds.
 * @param {any} val
 * @param {number} defaultVal
 * @param {number|null} min
 * @param {number|null} max
 * @returns {number}
 */
export function safeParseInt(val, defaultVal = 0, min = null, max = null) {
  let num = parseInt(val, 10);
  if (isNaN(num)) num = defaultVal;
  if (min !== null && num < min) num = min;
  if (max !== null && num > max) num = max;
  return num;
}

/**
 * Escape special wildcard characters for SQL LIKE / ILIKE queries (%, _, \).
 * @param {string} str
 * @returns {string}
 */
export function escapeSqlLike(str) {
  if (typeof str !== 'string') return '';
  return str.replace(/[%_\\]/g, '\\$&');
}
