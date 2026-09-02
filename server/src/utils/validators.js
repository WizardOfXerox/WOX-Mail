/**
 * Validation utilities for user input.
 */

/**
 * Validate email format.
 * @param {string} email
 * @returns {boolean}
 */
export function isValidEmail(email) {
  if (!email || typeof email !== 'string') return false;
  // RFC 5322 simplified — covers 99.9% of real addresses
  return /^[a-zA-Z0-9.!#$%&'*+/=?^_`{|}~-]+@[a-zA-Z0-9](?:[a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?(?:\.[a-zA-Z0-9](?:[a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?)*$/.test(email);
}

/**
 * Validate username format.
 * Rules: 3-30 chars, alphanumeric + underscores + dots, must start with letter.
 * @param {string} username
 * @returns {{ valid: boolean, error?: string }}
 */
export function validateUsername(username) {
  if (!username || typeof username !== 'string') {
    return { valid: false, error: 'Username is required' };
  }
  if (username.length < 3) {
    return { valid: false, error: 'Username must be at least 3 characters' };
  }
  if (username.length > 30) {
    return { valid: false, error: 'Username must be at most 30 characters' };
  }
  if (!/^[a-zA-Z]/.test(username)) {
    return { valid: false, error: 'Username must start with a letter' };
  }
  if (!/^[a-zA-Z0-9._]+$/.test(username)) {
    return { valid: false, error: 'Username can only contain letters, numbers, dots, and underscores' };
  }
  if (/\.\./.test(username) || /__/.test(username)) {
    return { valid: false, error: 'Username cannot have consecutive dots or underscores' };
  }

  // Reserved usernames that could be confused with system addresses
  const reserved = [
    'admin', 'administrator', 'postmaster', 'webmaster', 'hostmaster',
    'abuse', 'support', 'noreply', 'no-reply', 'mailer-daemon',
    'info', 'contact', 'security', 'root', 'system', 'mail',
    'help', 'billing', 'sales', 'dev', 'api', 'www', 'ftp',
  ];
  if (reserved.includes(username.toLowerCase())) {
    return { valid: false, error: 'This username is reserved' };
  }

  return { valid: true };
}

/**
 * Validate password strength.
 * Rules: min 8 chars, must have: uppercase, lowercase, number, special char.
 * @param {string} password
 * @returns {{ valid: boolean, score: number, errors: string[] }}
 */
export function validatePassword(password) {
  const errors = [];
  let score = 0;

  if (!password || typeof password !== 'string') {
    return { valid: false, score: 0, errors: ['Password is required'] };
  }

  if (password.length >= 8) score++;
  else errors.push('At least 8 characters');

  if (password.length >= 12) score++;

  if (/[a-z]/.test(password)) score++;
  else errors.push('At least one lowercase letter');

  if (/[A-Z]/.test(password)) score++;
  else errors.push('At least one uppercase letter');

  if (/[0-9]/.test(password)) score++;
  else errors.push('At least one number');

  if (/[^a-zA-Z0-9]/.test(password)) score++;
  else errors.push('At least one special character');

  if (password.length >= 16) score++;

  return {
    valid: errors.length === 0,
    score: Math.min(5, score), // 0-5 scale
    errors,
  };
}

/**
 * Validate invite code format.
 * @param {string} code
 * @returns {boolean}
 */
export function isValidInviteCode(code) {
  if (!code || typeof code !== 'string') return false;
  // Invite codes: 6-40 alphanumeric characters, hyphens, and underscores (e.g. WOX-ABCD-1234)
  return /^[A-Za-z0-9_-]{6,40}$/.test(code.trim());
}
