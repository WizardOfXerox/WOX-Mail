import { query } from '../config/database.js';

// Top recognized throwaway domains for instant memory-speed checking
const IN_MEMORY_DOMAINS = new Set([
  'yopmail.com', 'yopmail.fr', 'yopmail.net',
  'mailinator.com', 'guerrillamail.com', 'guerrillamail.net', 'guerrillamail.org',
  '10minutemail.com', 'temp-mail.org', 'tempmail.net', 'tempmail.com',
  'throwawaymail.com', 'maildrop.cc', 'emailondeck.com', 'sharklasers.com',
  'dispostable.com', 'trashmail.com', 'trashmail.net', 'trashmail.me',
  'getairmail.com', 'mohmal.com', 'fakeinbox.com', 'meltmail.com',
  'inboxkitten.com', 'burnermail.io', 'duck.com', 'crazymailing.com',
  'generator.email', 'tempail.com', 'emailfake.com', 'mytemp.email'
]);

/**
 * Check whether an email domain is in the disposable blocklist
 */
export async function isDisposableEmail(email) {
  if (!email || !email.includes('@')) return false;

  const domain = email.split('@')[1].toLowerCase().trim();

  // 1. Fast in-memory check
  if (IN_MEMORY_DOMAINS.has(domain)) {
    return true;
  }

  // 2. Database lookup
  try {
    const res = await query('SELECT id FROM disposable_domains WHERE domain = $1 LIMIT 1', [domain]);
    return res.rows.length > 0;
  } catch (err) {
    return false;
  }
}

/**
 * Add domains to the database blocklist
 */
export async function addDisposableDomains(domains = []) {
  let added = 0;
  for (const d of domains) {
    const clean = d.toLowerCase().trim();
    if (!clean) continue;
    try {
      await query(`
        INSERT INTO disposable_domains (domain)
        VALUES ($1)
        ON CONFLICT (domain) DO NOTHING
      `, [clean]);
      added++;
    } catch (e) {}
  }
  return added;
}

export default {
  isDisposableEmail,
  addDisposableDomains
};
