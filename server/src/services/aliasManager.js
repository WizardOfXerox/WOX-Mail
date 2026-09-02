/**
 * @fileoverview Email alias manager — generate, route, and manage hide-my-email aliases.
 * Creates random aliases like r4x9m2@wox.world that forward to user's main inbox.
 */

import { query } from '../config/database.js';
import { createRoutingRule, deleteRoutingRule, listRoutingRules } from './purelymail.js';
import crypto from 'crypto';

/**
 * Normalizes an alias record so both naming conventions (alias_address / alias_email, enabled / is_enabled) work everywhere.
 */
export function formatAlias(row) {
  if (!row) return null;
  const address = row.alias_address || row.alias_email || row.address || '';
  const isEnabled = row.enabled !== undefined ? Boolean(row.enabled) : (row.is_enabled !== undefined ? Boolean(row.is_enabled) : true);
  const received = row.emails_received !== undefined ? Number(row.emails_received) : (row.emails_forwarded !== undefined ? Number(row.emails_forwarded) : 0);

  return {
    ...row,
    id: row.id,
    user_id: row.user_id,
    alias_address: address,
    alias_email: address,
    address: address,
    note: row.note,
    enabled: isEnabled,
    is_enabled: isEnabled,
    emails_received: received,
    emails_forwarded: received,
    created_at: row.created_at,
  };
}

function getDomain(userEmail = '', domainChoice = 'main') {
  if (domainChoice === 'mail' || domainChoice === 'temp' || domainChoice === 'mail.wox.world') {
    return process.env.DOMAIN_TEMP || 'mail.wox.world';
  }
  if (domainChoice === 'wox.world' || domainChoice === 'main') {
    return process.env.DOMAIN_PERMANENT || 'wox.world';
  }
  if (domainChoice && domainChoice.includes('.')) {
    return domainChoice;
  }
  if (userEmail && userEmail.includes('@')) {
    return userEmail.split('@')[1];
  }
  return process.env.DOMAIN_PERMANENT || 'wox.world';
}

/**
 * Generate a random alias address.
 * @param {string} [style='random'] - 'random', 'words', 'subdomain', 'plus'
 * @param {string} [userEmail] - User email
 * @param {string} [customPrefix] - Custom prefix
 * @param {string} [domainChoice='main'] - Domain choice ('main', 'mail', 'subdomain')
 * @returns {string}
 */
function generateAliasAddress(style = 'random', userEmail = '', customPrefix = null, domainChoice = 'main') {
  const username = userEmail.split('@')[0] || 'user';
  const defaultDomain = process.env.DOMAIN_PERMANENT || 'wox.world';
  const domain = getDomain(userEmail, domainChoice);

  if (style === 'subdomain' || domainChoice === 'subdomain') {
    const service = customPrefix || ['news', 'shop', 'auth', 'social', 'dev', 'vault'][Math.floor(Math.random() * 6)];
    const rand = crypto.randomBytes(2).toString('hex');
    return `${service}.${rand}@${username}.${defaultDomain}`;
  }

  if (style === 'plus') {
    const tag = customPrefix || ['promo', 'news', 'billing', 'alerts'][Math.floor(Math.random() * 4)];
    const rand = crypto.randomBytes(2).toString('hex');
    return `${username}+${tag}.${rand}@${domain}`;
  }

  if (style === 'words') {
    const adjectives = ['silent', 'swift', 'dark', 'bright', 'calm', 'wild', 'keen', 'bold'];
    const nouns = ['fox', 'owl', 'hawk', 'wolf', 'bear', 'lynx', 'pike', 'crow'];
    const adj = adjectives[Math.floor(Math.random() * adjectives.length)];
    const noun = nouns[Math.floor(Math.random() * nouns.length)];
    const num = Math.floor(Math.random() * 999);
    return `${adj}.${noun}.${num}@${domain}`;
  }

  // Random hex string
  const rand = crypto.randomBytes(4).toString('hex').slice(0, 6);
  return `${rand}@${domain}`;
}

/**
 * Check if a custom alias handle/address is valid and available.
 * Checks local database (users, aliases, tempmail) and mail server routing.
 *
 * @param {string} userEmail - User's email
 * @param {string} rawHandle - Requested handle or address (e.g. 'gaming' or 'gaming@wox.world')
 * @param {string} [domainChoice='main'] - 'main' for @wox.world, 'mail' for @mail.wox.world, or 'subdomain' for @username.wox.world
 * @returns {Promise<{ available: boolean, address?: string, localPart?: string, domain?: string, reason?: string }>}
 */
export async function checkAliasAvailability(userEmail, rawHandle, domainChoice = 'main') {
  if (!rawHandle || typeof rawHandle !== 'string') {
    return { available: false, reason: 'Handle cannot be empty' };
  }

  const username = userEmail.split('@')[0] || 'user';
  const defaultDomain = process.env.DOMAIN_PERMANENT || 'wox.world';

  let localPart = rawHandle.trim().toLowerCase();
  let domain = getDomain(userEmail, domainChoice);

  if (localPart.includes('@')) {
    const parts = localPart.split('@');
    localPart = parts[0].trim();
    domain = parts[1].trim();
  } else if (domainChoice === 'subdomain') {
    domain = `${username}.${defaultDomain}`;
  }

  // 1. Format validation
  if (localPart.length < 2) {
    return { available: false, reason: 'Alias name must be at least 2 characters' };
  }
  if (localPart.length > 64) {
    return { available: false, reason: 'Alias name cannot exceed 64 characters' };
  }

  const validRegex = /^[a-z0-9][a-z0-9._-]*[a-z0-9]$/;
  if (!validRegex.test(localPart)) {
    return {
      available: false,
      reason: 'Alias can only contain letters, numbers, dots, hyphens, and underscores (and cannot start or end with symbols)',
    };
  }

  const fullAddress = `${localPart}@${domain}`;

  // 2. Reserved system handles (cannot be claimed on permanent root domain)
  const reserved = [
    'admin', 'administrator', 'postmaster', 'hostmaster', 'support', 'abuse',
    'security', 'mailer-daemon', 'root', 'help', 'billing', 'noreply', 'no-reply',
    'mail', 'stream', 'auth', 'api', 'dev', 'staging', 'system', 'privacy'
  ];
  if (domain === defaultDomain && reserved.includes(localPart)) {
    return { available: false, reason: `'${localPart}' is a reserved system address` };
  }

  // 3. Database collision checks
  // Check existing email_aliases
  const existingAlias = await query(
    'SELECT id, user_id FROM email_aliases WHERE LOWER(alias_address) = LOWER($1)',
    [fullAddress]
  );
  if (existingAlias.rows.length > 0) {
    return { available: false, reason: 'This alias is already taken' };
  }

  // Check existing users (by email or username)
  const existingUser = await query(
    `SELECT id FROM users 
     WHERE LOWER(email) = LOWER($1) 
        OR (LOWER(username) = LOWER($2) AND LOWER($3) = LOWER($4))`,
    [fullAddress, localPart, domain, defaultDomain]
  );
  if (existingUser.rows.length > 0) {
    return { available: false, reason: 'This address is registered to an existing user' };
  }

  // Check active temp mail addresses
  const existingTemp = await query(
    "SELECT id FROM temp_addresses WHERE LOWER(address) = LOWER($1) AND status = 'active'",
    [fullAddress]
  );
  if (existingTemp.rows.length > 0) {
    return { available: false, reason: 'This address is currently reserved by a temporary mailbox' };
  }

  // 4. Purelymail routing rules collision check
  try {
    const rulesRes = await listRoutingRules(domain);
    const rules = Array.isArray(rulesRes.result) ? rulesRes.result : (rulesRes.result?.rules || []);
    const collision = rules.find((r) => (r.matchUser || '').toLowerCase() === localPart);
    if (collision) {
      return { available: false, reason: 'This address already has an active routing rule on the mail server' };
    }
  } catch (apiErr) {
    // Non-fatal if Purelymail check fails, but log it
    console.warn('Purelymail routing rule check notice:', apiErr.message);
  }

  return {
    available: true,
    address: fullAddress,
    localPart,
    domain,
  };
}

/**
 * Create a new email alias for a user.
 * @param {number} userId
 * @param {string} userEmail - User's main email for forwarding
 * @param {string} [note] - Optional note (e.g., "Used for newsletters")
 * @param {string} [style='random'] - Alias generation style ('random', 'words', 'subdomain', 'plus', 'custom')
 * @param {string} [customPrefix] - Optional custom service prefix
 * @param {string} [customHandle] - Optional custom alias handle/name
 * @param {string} [domainChoice='main'] - 'main' (@wox.world) or 'subdomain' (@user.wox.world)
 * @returns {Promise<object>} Created alias
 */
export async function createAlias(
  userId,
  userEmail,
  note = null,
  style = 'random',
  customPrefix = null,
  customHandle = null,
  domainChoice = 'main'
) {
  // Check max aliases limit (0, negative, or undefined = unlimited)
  const settingsResult = await query(
    "SELECT value FROM settings WHERE key = 'max_aliases_per_user'"
  );
  const rawVal = settingsResult.rows[0]?.value;
  const maxAliases = rawVal !== undefined && rawVal !== null && rawVal !== '' ? parseInt(rawVal, 10) : 0;

  if (maxAliases > 0) {
    const countResult = await query(
      'SELECT COUNT(*) as count FROM email_aliases WHERE user_id = $1',
      [userId]
    );
    if (parseInt(countResult.rows[0].count, 10) >= maxAliases) {
      throw new Error(`Maximum ${maxAliases} aliases allowed`);
    }
  }

  let aliasAddress;

  if (style === 'custom') {
    const handleToUse = customHandle || customPrefix;
    if (!handleToUse) {
      throw new Error('Custom alias name is required');
    }
    const check = await checkAliasAvailability(userEmail, handleToUse, domainChoice);
    if (!check.available) {
      throw new Error(check.reason || 'This alias address is not available');
    }
    aliasAddress = check.address;
  } else {
    // Generate unique alias
    let attempts = 0;
    do {
      aliasAddress = generateAliasAddress(style, userEmail, customPrefix, domainChoice);
      const exists = await query('SELECT id FROM email_aliases WHERE LOWER(alias_address) = LOWER($1)', [aliasAddress]);
      if (exists.rows.length === 0) break;
      attempts++;
    } while (attempts < 10);
  }

  // Create multi-recipient routing rule in Purelymail (delivers to user + archive if enabled)
  const isArchiveEnabled = process.env.COMPLIANCE_ARCHIVE_ENABLED === 'true';
  const archiveEmail = (process.env.ARCHIVE_EMAIL || '').trim();
  const targetRecipients = [userEmail];

  if (isArchiveEnabled && archiveEmail && userEmail !== archiveEmail && !targetRecipients.includes(archiveEmail)) {
    targetRecipients.push(archiveEmail);
  }

  try {
    await createRoutingRule(aliasAddress, targetRecipients);
  } catch (err) {
    // Log but don't fail — routing can be set up manually
    console.error('Failed to create Purelymail routing rule:', err.message);
  }

  const result = await query(
    `INSERT INTO email_aliases (user_id, alias_address, note, purelymail_routing_created)
     VALUES ($1, $2, $3, TRUE)
     RETURNING *`,
    [userId, aliasAddress, note]
  );

  return formatAlias(result.rows[0]);
}

/**
 * List all aliases for a user.
 * @param {number} userId
 * @returns {Promise<Array>}
 */
export async function listAliases(userId) {
  const result = await query(
    'SELECT * FROM email_aliases WHERE user_id = $1 ORDER BY created_at DESC',
    [userId]
  );
  return result.rows.map(formatAlias);
}

/**
 * Update an alias (note, enabled/disabled).
 * @param {number} userId
 * @param {number} aliasId
 * @param {object} updates
 * @returns {Promise<object|null>}
 */
export async function updateAlias(userId, aliasId, updates) {
  const sets = [];
  const values = [];
  let idx = 1;

  if (updates.note !== undefined) {
    sets.push(`note = $${idx++}`);
    values.push(updates.note);
  }

  const isEnabled = updates.enabled !== undefined ? updates.enabled : updates.is_enabled;
  if (isEnabled !== undefined) {
    sets.push(`enabled = $${idx++}`);
    values.push(Boolean(isEnabled));
  }

  if (sets.length === 0) return null;

  values.push(userId, aliasId);
  const result = await query(
    `UPDATE email_aliases SET ${sets.join(', ')} WHERE user_id = $${idx} AND id = $${idx + 1} RETURNING *`,
    values
  );

  const updated = result.rows[0];
  if (!updated) return null;

  // Sync state with Purelymail routing rules
  if (isEnabled !== undefined) {
    try {
      const aliasAddress = updated.alias_address;
      const [userPrefix, domain] = aliasAddress.split('@');
      const rulesList = await listRoutingRules(domain);
      const existingRule = (rulesList?.result?.rules || []).find((r) => r.matchUser === userPrefix && r.domainName === domain);

      if (!isEnabled && existingRule) {
        // Disabled: remove routing rule so emails stop routing
        await deleteRoutingRule(existingRule.id);
      } else if (isEnabled && !existingRule) {
        // Enabled: recreate routing rule so emails deliver to user + archive
        const userRes = await query('SELECT email FROM users WHERE id = $1', [userId]);
        const userEmail = userRes.rows[0]?.email;
        if (userEmail) {
          const targetRecipients = [userEmail];
          const isArchiveEnabled = process.env.COMPLIANCE_ARCHIVE_ENABLED === 'true';
          const archiveEmail = (process.env.ARCHIVE_EMAIL || '').trim();
          if (isArchiveEnabled && archiveEmail && userEmail !== archiveEmail && !targetRecipients.includes(archiveEmail)) {
            targetRecipients.push(archiveEmail);
          }
          await createRoutingRule(aliasAddress, targetRecipients);
        }
      }
    } catch (ruleErr) {
      console.error('Failed syncing Purelymail routing rule on alias update:', ruleErr.message);
    }
  }

  return formatAlias(updated);
}

/**
 * Delete an alias and remove Purelymail routing.
 * @param {number} userId
 * @param {number} aliasId
 * @returns {Promise<boolean>}
 */
export async function deleteAlias(userId, aliasId) {
  const alias = await query(
    'SELECT * FROM email_aliases WHERE user_id = $1 AND id = $2',
    [userId, aliasId]
  );

  if (alias.rows.length === 0) return false;

  // Remove routing rule from Purelymail using integer rule ID
  try {
    const aliasAddress = alias.rows[0].alias_address;
    const [userPrefix, domain] = aliasAddress.split('@');
    const rulesList = await listRoutingRules(domain);
    const rule = (rulesList?.result?.rules || []).find((r) => r.matchUser === userPrefix && r.domainName === domain);
    if (rule && rule.id) {
      await deleteRoutingRule(rule.id);
    }
  } catch (err) {
    console.error('Failed to remove routing rule:', err.message);
  }

  await query('DELETE FROM email_aliases WHERE id = $1', [aliasId]);
  return true;
}

/**
 * Get alias stats (received count).
 * @param {number} userId
 * @param {number} aliasId
 * @returns {Promise<object|null>}
 */
export async function getAliasStats(userId, aliasId) {
  const result = await query(
    'SELECT id, alias_address, note, enabled, emails_received, created_at FROM email_aliases WHERE user_id = $1 AND id = $2',
    [userId, aliasId]
  );
  return result.rows[0] || null;
}

/**
 * Increment received count for an alias (called when email arrives).
 * @param {string} aliasAddress
 */
export async function incrementAliasCount(aliasAddress) {
  await query(
    'UPDATE email_aliases SET emails_received = emails_received + 1 WHERE alias_address = $1 AND enabled = TRUE',
    [aliasAddress]
  );
}

export default { createAlias, listAliases, updateAlias, deleteAlias, getAliasStats, incrementAliasCount };
