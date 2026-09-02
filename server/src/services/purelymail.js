import pino from 'pino';

const logger = pino({ name: 'woxmail:purelymail' });
const API_BASE = 'https://purelymail.com/api/v0';

/**
 * Purelymail API v0 wrapper.
 * All endpoints use POST with JSON body and API token auth.
 *
 * @see https://purelymail.com/docs/api
 */

/**
 * Make an API call to Purelymail.
 * @param {string} endpoint - API endpoint name (e.g. 'createUser')
 * @param {object} data - Request body
 * @returns {Promise<object>} API response
 */
async function apiCall(endpoint, data = {}) {
  const token = process.env.PURELYMAIL_API_TOKEN;
  if (!token || token.includes('your-') || token === 'test-token') {
    if (process.env.NODE_ENV === 'development' || process.env.NODE_ENV === 'test') {
      logger.warn({ endpoint }, 'PURELYMAIL_API_TOKEN unconfigured in dev/test — returning mock success');
      if (endpoint === 'listUser') {
        return { type: 'success', result: { users: [data.userName] } };
      }
      return { type: 'success', message: 'Mock response in development/test mode' };
    }
    throw new Error('PURELYMAIL_API_TOKEN not configured');
  }

  const body = { ...data, apiToken: token };

  try {
    const response = await fetch(`${API_BASE}/${endpoint}`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Purelymail-Api-Token': token,
      },
      body: JSON.stringify(body),
    });

    const result = await response.json();

    if (result.type === 'error') {
      // Idempotent deletion: if deleting a user that is already absent in Purelymail, treat as success
      if (endpoint === 'deleteUser' && (result.message?.includes('Unknown user') || result.code === 'unknownUser' || result.message?.includes('not found') || result.code === 'internalError')) {
        logger.debug({ endpoint, message: result.message }, 'Purelymail user already deleted/absent');
        return { type: 'success', message: result.message };
      }

      const err = new Error(result.message || `Purelymail API error: ${endpoint}`);
      err.code = result.code;
      err.status = response.status;
      logger.error({ endpoint, code: result.code, message: result.message }, 'Purelymail API error');
      throw err;
    }

    logger.debug({ endpoint }, 'Purelymail API success');
    return result;
  } catch (err) {
    if (err.code) throw err; // Re-throw API errors
    logger.error({ endpoint, err }, 'Purelymail API request failed');
    throw new Error(`Purelymail API unreachable: ${err.message}`);
  }
}

// ─── User Management ─────────────────────────────────────

/**
 * Create a new mailbox user in Purelymail.
 * @param {string} email - Full email address
 * @param {string} password - IMAP/SMTP password
 * @returns {Promise<object>}
 */
export async function createUser(email, password) {
  let userName = email;
  let domainName = process.env.DOMAIN_PERMANENT || 'wox.world';
  if (email.includes('@')) {
    const parts = email.split('@');
    userName = parts[0];
    domainName = parts[1];
  }

  // Purelymail requires alphanumeric username without subaddressing symbols
  userName = userName.toLowerCase().replace(/[^a-z0-9]/g, '');

  return apiCall('createUser', {
    userName,
    domainName,
    password,
    enablePasswordReset: false,
    enableSearchIndexing: true,
  });
}

/**
 * Delete a mailbox user from Purelymail.
 * @param {string} email - Full email address
 * @returns {Promise<object>}
 */
export async function deleteUser(email) {
  const fullEmail = email.includes('@') ? email : `${email}@${process.env.DOMAIN_TEMP || 'mail.wox.world'}`;

  try {
    return await apiCall('deleteUser', { userName: fullEmail });
  } catch (err) {
    if (err.message && (err.message.includes('Unknown user') || err.message.includes('not found') || err.code === 'unknownUser' || err.code === 'internalError')) {
      return { type: 'success', message: 'User already absent in Purelymail' };
    }
    throw err;
  }
}

/**
 * Modify a user's settings in Purelymail.
 * @param {string} email - Full email address
 * @param {object} options - Settings to modify
 * @returns {Promise<object>}
 */
export async function modifyUser(email, options = {}) {
  return apiCall('modifyUser', { userName: email, ...options });
}

/**
 * Get user info from Purelymail.
 * @param {string} email - Full email address
 * @returns {Promise<object>}
 */
export async function listUser(email) {
  return apiCall('listUser', { userName: email });
}

// ─── Domain Management ───────────────────────────────────

/**
 * Add a domain to Purelymail.
 * @param {string} domain - Domain name
 * @returns {Promise<object>}
 */
export async function addDomain(domain) {
  return apiCall('addDomain', { domainName: domain });
}

// ─── Routing Rules ───────────────────────────────────────

/**
 * List all routing rules for the account or domain.
 * @param {string} [domain] - Optional domain name filter
 * @returns {Promise<object>}
 */
export async function listRoutingRules(domain = null) {
  const data = domain ? { domainName: domain } : {};
  return apiCall('listRoutingRules', data);
}

/**
 * Create a routing rule (for email aliases, dual delivery, shadow archive, or catch-all).
 * @param {string|object} matchOrOptions - Address pattern OR options object
 * @param {string|string[]} [targetUser] - Target email(s) to forward to
 * @param {string} [domain] - Domain name
 * @param {object} [extraOptions] - { prefix?: boolean, catchall?: boolean }
 * @returns {Promise<object>}
 */
export async function createRoutingRule(matchOrOptions, targetUser, domain, extraOptions = {}) {
  if (typeof matchOrOptions === 'object' && matchOrOptions !== null) {
    const opts = matchOrOptions;
    const domainName = opts.domainName || (opts.matchUser?.includes('@') ? opts.matchUser.split('@')[1] : (process.env.DOMAIN_PERMANENT || 'wox.world'));
    const userPrefix = opts.matchUser?.includes('@') ? opts.matchUser.split('@')[0] : (opts.matchUser || '');
    const targets = Array.isArray(opts.targetAddresses)
      ? opts.targetAddresses
      : (opts.targetAddresses ? [opts.targetAddresses] : (opts.targetUser ? (Array.isArray(opts.targetUser) ? opts.targetUser : [opts.targetUser]) : []));

    return apiCall('createRoutingRule', {
      domainName,
      matchUser: userPrefix,
      prefix: !!opts.prefix,
      targetAddresses: targets,
      catchall: !!opts.catchall,
    });
  }

  const matchUser = matchOrOptions;
  const domainName = domain || (matchUser.includes('@') ? matchUser.split('@')[1] : (process.env.DOMAIN_PERMANENT || 'wox.world'));
  const userPrefix = matchUser.includes('@') ? matchUser.split('@')[0] : matchUser;
  const targets = Array.isArray(targetUser) ? targetUser : (targetUser ? [targetUser] : []);

  return apiCall('createRoutingRule', {
    domainName,
    matchUser: userPrefix,
    prefix: !!extraOptions.prefix,
    targetAddresses: targets,
    catchall: !!extraOptions.catchall,
  });
}

/**
 * Delete a routing rule.
 * @param {number} ruleId - Routing rule ID
 * @returns {Promise<object>}
 */
export async function deleteRoutingRule(ruleId) {
  return apiCall('deleteRoutingRule', { routingRuleId: ruleId });
}

export default {
  createUser,
  deleteUser,
  modifyUser,
  listUser,
  addDomain,
  listRoutingRules,
  createRoutingRule,
  deleteRoutingRule,
};
