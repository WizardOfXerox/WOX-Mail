import { query } from '../config/database.js';
import { decryptCredentials } from './accountService.js';

// ─── SSRF Protection ────────────────────────────────────
export const ALLOWED_WEBHOOK_DOMAINS = [
  'discord.com', 'discordapp.com',
  'hooks.slack.com',
  'api.telegram.org',
];

export function validateWebhookUrl(url) {
  if (!url) return;
  let parsed;
  try {
    parsed = new URL(url);
  } catch {
    throw new Error('Invalid webhook URL format.');
  }
  if (parsed.protocol !== 'https:') {
    throw new Error('Webhook URLs must use HTTPS.');
  }
  const hostname = parsed.hostname.toLowerCase();
  // Block private/internal IPs
  if (
    hostname === 'localhost' ||
    hostname === '127.0.0.1' ||
    hostname.startsWith('10.') ||
    hostname.startsWith('192.168.') ||
    hostname.startsWith('172.') ||
    hostname.startsWith('169.254.') ||
    hostname.endsWith('.internal') ||
    hostname.endsWith('.local') ||
    /^\[.*\]$/.test(hostname) // IPv6 bracket notation
  ) {
    throw new Error('Webhook URLs cannot target private or internal addresses.');
  }
  const isAllowed = ALLOWED_WEBHOOK_DOMAINS.some(d => hostname === d || hostname.endsWith('.' + d));
  if (!isAllowed) {
    throw new Error(`Webhook domain "${hostname}" is not in the allowlist. Allowed: ${ALLOWED_WEBHOOK_DOMAINS.join(', ')}`);
  }
}
/**
 * Format and dispatch an email alert to Telegram
 */
export async function sendTelegramAlert(botToken, chatId, { from, subject, text, messageUid, date }) {
  const preview = (text || '').substring(0, 300);
  const textMessage = `📬 *WoxMail Alert*\n\n*From:* ${from}\n*Subject:* ${subject}\n*Date:* ${date || new Date().toLocaleTimeString()}\n\n_${preview}..._`;

  const url = `https://api.telegram.org/bot${botToken}/sendMessage`;
  validateWebhookUrl(url);
  const response = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      chat_id: chatId,
      text: textMessage,
      parse_mode: 'Markdown'
    })
  });

  const resJson = await response.json();
  if (!resJson.ok) {
    throw new Error(resJson.description || 'Telegram API rejected message.');
  }
  return resJson;
}

/**
 * Format and dispatch an email alert to Discord webhook
 */
export async function sendDiscordAlert(webhookUrl, { from, subject, text, messageUid, date }) {
  const preview = (text || '').substring(0, 500);

  const payload = {
    username: 'WoxMail Sovereign',
    avatar_url: 'https://mail.wox.world/favicon.ico',
    embeds: [
      {
        title: `📬 ${subject || '(No Subject)'}`,
        description: preview,
        color: 0x7c3aed, // Purple
        fields: [
          { name: 'From', value: from || 'Unknown', inline: true },
          { name: 'Time', value: date || new Date().toLocaleString(), inline: true }
        ],
        footer: { text: 'WoxMail Real-Time Forwarding' }
      }
    ]
  };

  validateWebhookUrl(webhookUrl);
  const response = await fetch(webhookUrl, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload)
  });

  if (!response.ok) {
    const errText = await response.text();
    throw new Error(`Discord Webhook failed: ${response.status} ${errText}`);
  }
  return { success: true };
}

/**
 * Format and dispatch an email alert to Slack webhook
 */
export async function sendSlackAlert(webhookUrl, { from, subject, text, date }) {
  const preview = (text || '').substring(0, 400);

  const payload = {
    blocks: [
      {
        type: 'header',
        text: { type: 'plain_text', text: `📬 New Email: ${subject || '(No Subject)'}` }
      },
      {
        type: 'section',
        fields: [
          { type: 'mrkdwn', text: `*From:*\n${from}` },
          { type: 'mrkdwn', text: `*Received:*\n${date || new Date().toLocaleTimeString()}` }
        ]
      },
      {
        type: 'section',
        text: { type: 'mrkdwn', text: `>${preview}` }
      }
    ]
  };

  validateWebhookUrl(webhookUrl);
  const response = await fetch(webhookUrl, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload)
  });

  if (!response.ok) {
    const errText = await response.text();
    throw new Error(`Slack Webhook failed: ${response.status} ${errText}`);
  }
  return { success: true };
}

/**
 * Test a chat forwarding rule
 */
export async function testChatRule({ platform, webhook_url, bot_token, chat_id }) {
  const testMail = {
    from: 'vip-client@example.com',
    subject: 'Test Notification from WoxMail Sovereign',
    text: 'This is a test notification verifying that your chat forwarding integration is working perfectly.',
    date: new Date().toLocaleString()
  };

  if (platform === 'telegram') {
    if (!bot_token || !chat_id) throw new Error('Bot token and Chat ID are required for Telegram.');
    return await sendTelegramAlert(bot_token, chat_id, testMail);
  } else if (platform === 'discord') {
    if (!webhook_url) throw new Error('Webhook URL is required for Discord.');
    return await sendDiscordAlert(webhook_url, testMail);
  } else if (platform === 'slack') {
    if (!webhook_url) throw new Error('Webhook URL is required for Slack.');
    return await sendSlackAlert(webhook_url, testMail);
  } else {
    throw new Error(`Unsupported platform: ${platform}`);
  }
}

/**
 * Process an incoming email against active rules for a user
 */
export async function processEmailForChatForward(userId, emailData) {
  const rulesRes = await query(`
    SELECT * FROM chat_forward_rules
    WHERE user_id = $1 AND is_active = TRUE
  `, [userId]);

  for (const rule of rulesRes.rows) {
    try {
      const criteria = rule.filter_criteria || {};
      if (!criteria.forward_all) {
        if (criteria.from && !emailData.from.toLowerCase().includes(criteria.from.toLowerCase())) {
          continue;
        }
        if (criteria.subject && !emailData.subject.toLowerCase().includes(criteria.subject.toLowerCase())) {
          continue;
        }
      }

      if (rule.platform === 'telegram') {
        let finalToken = rule.bot_token;
        if (finalToken && finalToken.includes(':') && finalToken.split(':').length === 3) {
          const [cipher, iv, tag] = finalToken.split(':');
          try {
            finalToken = decryptCredentials(cipher, iv, tag);
          } catch {}
        }
        await sendTelegramAlert(finalToken, rule.chat_id, emailData);
      } else if (rule.platform === 'discord') {
        await sendDiscordAlert(rule.webhook_url, emailData);
      } else if (rule.platform === 'slack') {
        await sendSlackAlert(rule.webhook_url, emailData);
      }

      await query(`
        UPDATE chat_forward_rules
        SET deliveries_count = deliveries_count + 1, last_delivery_at = NOW()
        WHERE id = $1
      `, [rule.id]);
    } catch (err) {
      console.error(`Chat forwarding rule ${rule.id} failed:`, err.message);
    }
  }
}

export default {
  sendTelegramAlert,
  sendDiscordAlert,
  sendSlackAlert,
  testChatRule,
  processEmailForChatForward
};
