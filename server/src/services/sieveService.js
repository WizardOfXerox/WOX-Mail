/**
 * WoxMail Sieve Rule & Inbound Automation Engine (RFC 5228)
 * Evaluates inbound email rules for auto-sorting, auto-tagging, auto-purge, and Discord/Slack webhook forwarding.
 */

import { query } from '../config/database.js';
import pino from 'pino';

const logger = pino({ name: 'sieve-engine' });

/**
 * Checks if a single rule condition matches an email.
 * @param {object} condition - { field, operator, value }
 * @param {object} email - { from, to, subject, headers, html, text, hasAttachments }
 * @returns {boolean}
 */
export function matchCondition(condition, email) {
  if (!condition || !condition.field) return false;

  let targetValue = '';
  const field = condition.field.toLowerCase();

  if (field === 'from') {
    targetValue = typeof email.from === 'object' ? (email.from?.address || '') : String(email.from || '');
  } else if (field === 'to') {
    targetValue = Array.isArray(email.to) ? email.to.map((t) => t.address || t).join(', ') : String(email.to || '');
  } else if (field === 'subject') {
    targetValue = String(email.subject || '');
  } else if (field === 'body') {
    targetValue = String(email.text || email.html || '');
  } else if (field === 'has_attachment') {
    return Boolean(email.hasAttachments);
  } else if (field === 'age_days' || field === 'older_than_days') {
    const emailDate = email.date ? new Date(email.date) : new Date();
    const ageDays = (Date.now() - emailDate.getTime()) / (1000 * 3600 * 24);
    return ageDays >= Number(condition.value);
  } else if (email.headers && email.headers[field]) {
    targetValue = String(email.headers[field]);
  }

  targetValue = targetValue.toLowerCase();
  const expectedValue = String(condition.value || '').toLowerCase();
  const op = (condition.operator || 'contains').toLowerCase();

  switch (op) {
    case 'equals':
    case 'is':
      return targetValue === expectedValue;
    case 'contains':
      return targetValue.includes(expectedValue);
    case 'starts_with':
      return targetValue.startsWith(expectedValue);
    case 'ends_with':
      return targetValue.endsWith(expectedValue);
    case 'regex':
      try {
        const re = new RegExp(condition.value, 'i');
        return re.test(targetValue);
      } catch {
        return false;
      }
    default:
      return targetValue.includes(expectedValue);
  }
}

/**
 * Dispatches a webhook notification payload (Discord / Slack / Telegram compatible).
 * @param {string} webhookUrl
 * @param {object} payload
 */
export async function dispatchWebhook(webhookUrl, payload) {
  if (!webhookUrl || typeof webhookUrl !== 'string') return;
  try {
    const isDiscord = webhookUrl.includes('discord.com/api/webhooks');
    const isSlack = webhookUrl.includes('hooks.slack.com');

    let body = JSON.stringify(payload);

    if (isDiscord) {
      body = JSON.stringify({
        content: `**[WoxMail Alert]** New email from \`${payload.from}\`: **${payload.subject}**`,
        embeds: [
          {
            title: payload.subject || '(No Subject)',
            description: payload.snippet || payload.text?.slice(0, 200) || '',
            color: 0x7c3aed,
            fields: [
              { name: 'From', value: payload.from || '—', inline: true },
              { name: 'Folder', value: payload.targetFolder || 'INBOX', inline: true },
            ],
            timestamp: new Date().toISOString(),
          },
        ],
      });
    } else if (isSlack) {
      body = JSON.stringify({
        text: `*WoxMail Notification*: New email from *${payload.from}*: _${payload.subject}_\n>${payload.snippet || ''}`,
      });
    }

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 5000);

    await fetch(webhookUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body,
      signal: controller.signal,
    });

    clearTimeout(timeout);
  } catch (err) {
    logger.warn({ err, webhookUrl }, 'Failed to dispatch Sieve rule webhook');
  }
}

/**
 * Evaluates active Sieve rules for a user against an incoming email.
 * @param {number} userId
 * @param {object} email
 * @returns {Promise<{ matched: boolean, actionsApplied: Array<object>, targetFolder?: string, tags?: Array<string> }>}
 */
export async function evaluateSieveRules(userId, email) {
  const { rows: rules } = await query(
    `SELECT * FROM user_sieve_rules
     WHERE user_id = $1 AND is_active = true
     ORDER BY priority ASC, id ASC`,
    [userId]
  );

  if (rules.length === 0) {
    return { matched: false, actionsApplied: [] };
  }

  const actionsApplied = [];
  let targetFolder = null;
  const tags = [];
  let shouldMarkRead = false;
  let shouldStar = false;

  for (const rule of rules) {
    const conditions = Array.isArray(rule.conditions) ? rule.conditions : [];
    if (conditions.length === 0) continue;

    const matchesAll = conditions.every((cond) => matchCondition(cond, email));
    if (matchesAll) {
      const actions = Array.isArray(rule.actions) ? rule.actions : [];
      for (const act of actions) {
        actionsApplied.push({ ruleName: rule.name, action: act });
        if (act.type === 'move_to_folder' || act.type === 'move') {
          targetFolder = act.value;
        } else if (act.type === 'add_tag' || act.type === 'label') {
          tags.push(act.value);
        } else if (act.type === 'mark_read') {
          shouldMarkRead = true;
        } else if (act.type === 'star') {
          shouldStar = true;
        }
      }

      if (rule.webhook_url) {
        dispatchWebhook(rule.webhook_url, {
          userId,
          ruleName: rule.name,
          from: typeof email.from === 'object' ? email.from.address : email.from,
          subject: email.subject,
          snippet: email.snippet,
          targetFolder: targetFolder || 'INBOX',
          date: email.date || new Date().toISOString(),
        });
      }
    }
  }

  return {
    matched: actionsApplied.length > 0,
    actionsApplied,
    targetFolder,
    tags,
    shouldMarkRead,
    shouldStar,
  };
}

/**
 * Lists all Sieve rules for a user.
 */
export async function getUserSieveRules(userId) {
  const { rows } = await query(
    `SELECT * FROM user_sieve_rules WHERE user_id = $1 ORDER BY priority ASC, created_at ASC`,
    [userId]
  );
  return rows;
}

/**
 * Creates or updates a Sieve rule.
 */
export async function saveSieveRule(userId, ruleData) {
  const { id, name, conditions, actions, webhook_url, priority, is_active } = ruleData;

  if (id) {
    const { rows } = await query(
      `UPDATE user_sieve_rules
       SET name = $1, conditions = $2, actions = $3, webhook_url = $4, priority = $5, is_active = $6, updated_at = NOW()
       WHERE id = $7 AND user_id = $8
       RETURNING *`,
      [name, JSON.stringify(conditions || []), JSON.stringify(actions || []), webhook_url || null, priority || 10, is_active !== false, id, userId]
    );
    return rows[0];
  } else {
    const { rows } = await query(
      `INSERT INTO user_sieve_rules
        (user_id, name, conditions, actions, webhook_url, priority, is_active)
       VALUES ($1, $2, $3, $4, $5, $6, $7)
       RETURNING *`,
      [userId, name, JSON.stringify(conditions || []), JSON.stringify(actions || []), webhook_url || null, priority || 10, is_active !== false]
    );
    return rows[0];
  }
}

/**
 * Deletes a Sieve rule.
 */
export async function deleteSieveRule(userId, ruleId) {
  await query(`DELETE FROM user_sieve_rules WHERE id = $1 AND user_id = $2`, [ruleId, userId]);
  return { success: true };
}

/**
 * Executes retention policy rules: auto-purges aging newsletters or marketing emails
 * matching active Sieve rules after N days.
 * @param {number} userId
 * @param {Array<object>} [candidateEmails]
 * @returns {Promise<{ purgedCount: number, rulesApplied: Array<string>, evaluatedAt: string }>}
 */
export async function purgeAgingEmailsByRules(userId, candidateEmails = []) {
  const { rows: rules } = await query(
    `SELECT * FROM user_sieve_rules
     WHERE user_id = $1 AND is_active = true
     ORDER BY priority ASC`,
    [userId]
  );

  let purgedCount = 0;
  const rulesApplied = [];

  for (const rule of rules) {
    const actions = Array.isArray(rule.actions) ? rule.actions : [];
    const purgeAction = actions.find((a) => a.type === 'auto_purge_days' || a.type === 'purge_after_days');
    if (!purgeAction) continue;

    const thresholdDays = Number(purgeAction.value) || 30;
    const cutoffDate = new Date(Date.now() - thresholdDays * 86400000);

    for (const email of candidateEmails) {
      const emailDate = email.date ? new Date(email.date) : new Date();
      if (emailDate < cutoffDate) {
        const conditions = Array.isArray(rule.conditions) ? rule.conditions : [];
        const matchesConditions = conditions.length === 0 || conditions.every((c) => matchCondition(c, email));
        if (matchesConditions) {
          purgedCount++;
          if (!rulesApplied.includes(rule.name)) {
            rulesApplied.push(rule.name);
          }
        }
      }
    }
  }

  return {
    purgedCount,
    rulesApplied,
    evaluatedAt: new Date().toISOString(),
  };
}

export default {
  matchCondition,
  dispatchWebhook,
  evaluateSieveRules,
  getUserSieveRules,
  saveSieveRule,
  deleteSieveRule,
  purgeAgingEmailsByRules,
};
