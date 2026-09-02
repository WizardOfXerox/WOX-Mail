/**
 * @fileoverview Formatting utilities for dates, sizes, email addresses, and more.
 */

/**
 * Format a date for display in message list.
 * Today → "3:45 PM", This year → "Aug 20", Older → "Aug 20, 2024"
 */
export function formatDate(dateStr) {
  if (!dateStr) return '';
  const date = new Date(dateStr);
  const now = new Date();
  const isToday = date.toDateString() === now.toDateString();
  const isThisYear = date.getFullYear() === now.getFullYear();

  if (isToday) {
    return date.toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' });
  }
  if (isThisYear) {
    return date.toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
  }
  return date.toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' });
}

/**
 * Format a full date + time (for message viewer).
 */
export function formatFullDate(dateStr) {
  if (!dateStr) return '';
  return new Date(dateStr).toLocaleString(undefined, {
    weekday: 'short', month: 'short', day: 'numeric', year: 'numeric',
    hour: 'numeric', minute: '2-digit',
  });
}

/**
 * Format relative time ("2 minutes ago", "3 hours ago", "yesterday").
 */
export function formatRelative(dateStr) {
  if (!dateStr) return '';
  const diff = Date.now() - new Date(dateStr).getTime();
  const seconds = Math.floor(diff / 1000);
  const minutes = Math.floor(seconds / 60);
  const hours = Math.floor(minutes / 60);
  const days = Math.floor(hours / 24);

  if (seconds < 60) return 'just now';
  if (minutes < 60) return `${minutes}m ago`;
  if (hours < 24) return `${hours}h ago`;
  if (days === 1) return 'yesterday';
  if (days < 7) return `${days}d ago`;
  return formatDate(dateStr);
}

/**
 * Format file size (bytes → human-readable).
 */
export function formatSize(bytes) {
  if (!bytes || bytes === 0) return '0 B';
  const units = ['B', 'KB', 'MB', 'GB'];
  const i = Math.floor(Math.log(bytes) / Math.log(1024));
  return `${(bytes / Math.pow(1024, i)).toFixed(i > 0 ? 1 : 0)} ${units[i]}`;
}

/**
 * Extract display name from email address.
 * "John Doe <john@example.com>" → "John Doe"
 * "john@example.com" → "john"
 */
export function formatSender(email) {
  if (!email) return '';
  const match = email.match(/^"?([^"<]+)"?\s*<.+>$/);
  if (match) return match[1].trim();
  return email.split('@')[0];
}

/**
 * Format email for display (truncate long addresses).
 */
export function formatEmail(email, maxLen = 30) {
  if (!email) return '';
  const addr = email.match(/<(.+)>/)?.[1] || email;
  return addr.length > maxLen ? addr.slice(0, maxLen) + '…' : addr;
}

/**
 * Truncate text with ellipsis.
 */
export function truncate(text, maxLen = 100) {
  if (!text) return '';
  return text.length > maxLen ? text.slice(0, maxLen) + '…' : text;
}

/**
 * Format a countdown timer (seconds → "2h 15m" or "45s").
 */
export function formatCountdown(seconds) {
  if (seconds <= 0) return 'Expired';
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = seconds % 60;
  if (h > 0) return `${h}h ${m}m`;
  if (m > 0) return `${m}m ${s}s`;
  return `${s}s`;
}

/**
 * Generate initials from a name or email.
 * "John Doe" → "JD", "john@example.com" → "J"
 */
export function getInitials(name) {
  if (!name) return '?';
  const parts = name.replace(/<.+>/, '').trim().split(/\s+/);
  return parts.map((p) => p[0]?.toUpperCase()).filter(Boolean).slice(0, 2).join('');
}

/**
 * Generate a consistent color from a string (for avatars).
 */
export function stringToColor(str) {
  if (!str) return '#7c3aed';
  let hash = 0;
  for (let i = 0; i < str.length; i++) {
    hash = str.charCodeAt(i) + ((hash << 5) - hash);
  }
  const colors = ['#7c3aed', '#2563eb', '#0891b2', '#059669', '#d97706', '#dc2626', '#db2777', '#7c3aed'];
  return colors[Math.abs(hash) % colors.length];
}
