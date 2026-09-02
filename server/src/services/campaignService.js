import crypto from 'crypto';
import { query } from '../config/database.js';
import { createTransporter, sendEmail } from './smtp.js';
import pino from 'pino';

const logger = pino({ name: 'woxmail:campaigns' });

/**
 * Create a new mailing list
 */
export async function createList(userId, { name, description = '', optinType = 'single' }) {
  const result = await query(
    `INSERT INTO mailing_lists (user_id, name, description, optin_type)
     VALUES ($1, $2, $3, $4)
     RETURNING *`,
    [userId, name.trim(), description.trim(), optinType]
  );
  return result.rows[0];
}

/**
 * List all mailing lists for a user with subscriber counts
 */
export async function listLists(userId) {
  const result = await query(
    `SELECT l.*,
            COUNT(s.id)::int AS total_subscribers,
            COUNT(CASE WHEN s.status = 'active' THEN 1 END)::int AS active_subscribers
     FROM mailing_lists l
     LEFT JOIN subscribers s ON s.list_id = l.id
     WHERE l.user_id = $1
     GROUP BY l.id
     ORDER BY l.created_at DESC`,
    [userId]
  );
  return result.rows;
}

/**
 * Delete a mailing list and all associated subscribers
 */
export async function deleteList(userId, listId) {
  const result = await query(
    `DELETE FROM mailing_lists WHERE id = $1 AND user_id = $2 RETURNING id`,
    [listId, userId]
  );
  return result.rows.length > 0;
}

/**
 * Add or upsert a single subscriber
 */
export async function addSubscriber(listId, { email, firstName = '', lastName = '', customFields = {} }) {
  const cleanEmail = email.toLowerCase().trim();
  const unsubToken = crypto.randomBytes(24).toString('hex');

  const result = await query(
    `INSERT INTO subscribers (list_id, email, first_name, last_name, status, custom_fields, unsubscribe_token)
     VALUES ($1, $2, $3, $4, 'active', $5, $6)
     ON CONFLICT (list_id, email)
     DO UPDATE SET
       first_name = COALESCE(EXCLUDED.first_name, subscribers.first_name),
       last_name = COALESCE(EXCLUDED.last_name, subscribers.last_name),
       status = 'active',
       custom_fields = EXCLUDED.custom_fields
     RETURNING *`,
    [listId, cleanEmail, firstName.trim(), lastName.trim(), JSON.stringify(customFields), unsubToken]
  );
  return result.rows[0];
}

/**
 * Import subscribers in bulk from parsed rows
 */
export async function importSubscribers(listId, rows) {
  let imported = 0;
  let skipped = 0;

  for (const row of rows) {
    const email = (row.email || row.Email || row.EMAIL || '').toLowerCase().trim();
    if (!email || !email.includes('@')) {
      skipped++;
      continue;
    }

    const firstName = (row.first_name || row.firstName || row.name || row.Name || '').trim();
    const lastName = (row.last_name || row.lastName || '').trim();
    const unsubToken = crypto.randomBytes(24).toString('hex');

    try {
      await query(
        `INSERT INTO subscribers (list_id, email, first_name, last_name, status, unsubscribe_token)
         VALUES ($1, $2, $3, $4, 'active', $5)
         ON CONFLICT (list_id, email) DO NOTHING`,
        [listId, email, firstName, lastName, unsubToken]
      );
      imported++;
    } catch {
      skipped++;
    }
  }

  return { imported, skipped, total: rows.length };
}

/**
 * List subscribers for a list
 */
export async function listSubscribers(listId, { page = 1, limit = 50, status = 'all' } = {}) {
  const offset = (page - 1) * limit;
  let where = 'WHERE list_id = $1';
  const params = [listId];

  if (status !== 'all') {
    params.push(status);
    where += ` AND status = $${params.length}`;
  }

  const countRes = await query(`SELECT COUNT(*)::int AS total FROM subscribers ${where}`, params);
  const total = countRes.rows[0]?.total || 0;

  params.push(limit, offset);
  const rowsRes = await query(
    `SELECT * FROM subscribers ${where} ORDER BY subscribed_at DESC LIMIT $${params.length - 1} OFFSET $${params.length}`,
    params
  );

  return {
    subscribers: rowsRes.rows,
    total,
    page,
    limit,
    totalPages: Math.ceil(total / limit)
  };
}

/**
 * Create a new campaign
 */
export async function createCampaign(userId, { listId, title, subject, fromName, fromEmail, htmlContent, plainContent = '' }) {
  const result = await query(
    `INSERT INTO campaigns (user_id, list_id, title, subject, from_name, from_email, html_content, plain_content, status)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, 'draft')
     RETURNING *`,
    [userId, listId, title.trim(), subject.trim(), fromName?.trim() || 'WoxMail Broadcast', fromEmail?.trim(), htmlContent, plainContent]
  );
  return result.rows[0];
}

/**
 * List campaigns for user
 */
export async function listCampaigns(userId) {
  const result = await query(
    `SELECT c.*, l.name AS list_name
     FROM campaigns c
     LEFT JOIN mailing_lists l ON l.id = c.list_id
     WHERE c.user_id = $1
     ORDER BY c.created_at DESC`,
    [userId]
  );
  return result.rows;
}

/**
 * Send test email for campaign
 */
export async function sendTestEmail(userId, campaignId, testEmail) {
  const campRes = await query(
    `SELECT c.*, u.imap_password, u.email as user_email
     FROM campaigns c
     JOIN users u ON u.id = c.user_id
     WHERE c.id = $1 AND c.user_id = $2`,
    [campaignId, userId]
  );

  if (campRes.rows.length === 0) {
    throw new Error('Campaign not found');
  }

  const campaign = campRes.rows[0];
  const senderEmail = campaign.from_email || campaign.user_email;
  const pass = campaign.imap_password || process.env.ADMIN_PASSWORD;

  const transporter = createTransporter(senderEmail, pass);

  let previewHtml = campaign.html_content
    .replace(/\{\{first_name\}\}/gi, 'Valued')
    .replace(/\{\{last_name\}\}/gi, 'Member')
    .replace(/\{\{email\}\}/gi, testEmail)
    .replace(/\{\{unsubscribe_url\}\}/gi, '#test-unsubscribe');

  await sendEmail(transporter, {
    from: `"${campaign.from_name || 'WoxMail Broadcast'}" <${senderEmail}>`,
    to: testEmail,
    subject: `[TEST PREVIEW] ${campaign.subject}`,
    html: previewHtml,
    text: campaign.plain_content || 'Campaign preview content'
  });

  return { success: true, testEmail };
}

/**
 * Start sending campaign
 */
export async function startCampaign(userId, campaignId) {
  const campRes = await query(
    `SELECT c.*, (SELECT COUNT(*)::int FROM subscribers WHERE list_id = c.list_id AND status = 'active') AS active_count
     FROM campaigns c
     WHERE c.id = $1 AND c.user_id = $2`,
    [campaignId, userId]
  );

  if (campRes.rows.length === 0) {
    throw new Error('Campaign not found');
  }

  const campaign = campRes.rows[0];
  if (campaign.active_count === 0) {
    throw new Error('The selected mailing list has no active subscribers');
  }

  const updated = await query(
    `UPDATE campaigns
     SET status = 'sending',
         total_recipients = $1,
         started_at = NOW()
     WHERE id = $2
     RETURNING *`,
    [campaign.active_count, campaignId]
  );

  return updated.rows[0];
}

/**
 * Process next batch of pending campaigns (dispatched via cron)
 */
export async function processPendingCampaigns(batchSize = 20) {
  const activeCampaigns = await query(
    `SELECT c.*, u.email AS user_email, u.imap_password
     FROM campaigns c
     JOIN users u ON u.id = c.user_id
     WHERE c.status = 'sending'
     LIMIT 5`
  );

  if (activeCampaigns.rows.length === 0) return 0;

  const appUrl = process.env.APP_URL || 'https://mail.wox.world';
  let totalDispatched = 0;

  for (const campaign of activeCampaigns.rows) {
    const senderEmail = campaign.from_email || campaign.user_email;
    const pass = campaign.imap_password || process.env.ADMIN_PASSWORD;
    const transporter = createTransporter(senderEmail, pass);

    // Fetch batch of active subscribers who haven't received it yet (using offset of sent_count)
    const subsRes = await query(
      `SELECT * FROM subscribers
       WHERE list_id = $1 AND status = 'active'
       ORDER BY id ASC
       LIMIT $2 OFFSET $3`,
      [campaign.list_id, batchSize, campaign.sent_count]
    );

    const subscribers = subsRes.rows;

    if (subscribers.length === 0) {
      // Completed!
      await query(
        `UPDATE campaigns
         SET status = 'sent',
             completed_at = NOW()
         WHERE id = $1`,
        [campaign.id]
      );
      logger.info({ campaignId: campaign.id }, 'Campaign finished broadcasting');
      continue;
    }

    let batchSent = 0;
    let batchFailed = 0;

    for (const sub of subscribers) {
      const unsubUrl = `${appUrl}/api/campaigns/unsubscribe/${sub.unsubscribe_token}`;
      const htmlBody = campaign.html_content
        .replace(/\{\{first_name\}\}/gi, sub.first_name || 'Friend')
        .replace(/\{\{last_name\}\}/gi, sub.last_name || '')
        .replace(/\{\{email\}\}/gi, sub.email)
        .replace(/\{\{unsubscribe_url\}\}/gi, unsubUrl);

      const domain = process.env.DOMAIN_PERMANENT || 'wox.world';
      const headers = {
        'List-Unsubscribe': `<mailto:unsubscribe@${domain}?subject=unsubscribe-${sub.unsubscribe_token}>, <${unsubUrl}>`,
        'List-Unsubscribe-Post': 'List-Unsubscribe=One-Click',
        'Precedence': 'bulk',
        'X-Campaign-ID': String(campaign.id)
      };

      try {
        await sendEmail(transporter, {
          from: `"${campaign.from_name || 'WoxMail Broadcast'}" <${senderEmail}>`,
          to: sub.email,
          subject: campaign.subject,
          html: htmlBody,
          text: campaign.plain_content || 'WoxMail Campaign Message',
          headers
        });
        batchSent++;
        totalDispatched++;
      } catch (err) {
        logger.warn({ err: err.message, email: sub.email }, 'Campaign email dispatch failed');
        batchFailed++;
      }

      // Small 50ms jitter to prevent bursting
      await new Promise(r => setTimeout(r, 50));
    }

    await query(
      `UPDATE campaigns
       SET sent_count = sent_count + $1,
           failed_count = failed_count + $2
       WHERE id = $3`,
      [batchSent, batchFailed, campaign.id]
    );
  }

  return totalDispatched;
}

/**
 * Handle unsubscribe by token
 */
export async function handleUnsubscribe(token) {
  const result = await query(
    `UPDATE subscribers
     SET status = 'unsubscribed',
         unsubscribed_at = NOW()
     WHERE unsubscribe_token = $1
     RETURNING email, list_id`,
    [token]
  );
  return result.rows[0] || null;
}

/**
 * Generate embeddable HTML signup form
 */
export function generateSignupForm(listId) {
  const appUrl = process.env.APP_URL || 'https://mail.wox.world';
  return `
<!-- WoxMail Sovereign Newsletter Embed Form -->
<form action="${appUrl}/api/campaigns/subscribe/${listId}" method="POST" style="max-width: 400px; font-family: sans-serif; display: flex; flex-direction: column; gap: 8px;">
  <input type="text" name="first_name" placeholder="First Name" style="padding: 10px; border: 1px solid #ccc; border-radius: 6px;" />
  <input type="email" name="email" placeholder="Your Email Address" required style="padding: 10px; border: 1px solid #ccc; border-radius: 6px;" />
  <button type="submit" style="padding: 10px; background: #7c3aed; color: #fff; border: none; border-radius: 6px; font-weight: bold; cursor: pointer;">Subscribe</button>
</form>
`.trim();
}

export default {
  createList,
  listLists,
  deleteList,
  addSubscriber,
  importSubscribers,
  listSubscribers,
  createCampaign,
  listCampaigns,
  sendTestEmail,
  startCampaign,
  processPendingCampaigns,
  handleUnsubscribe,
  generateSignupForm
};
