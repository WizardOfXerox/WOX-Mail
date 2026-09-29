import { query } from '../config/database.js';

/**
 * Domain-to-timezone heuristics map
 */
const TLD_TIMEZONE_MAP = {
  'uk': { timezone: 'Europe/London', label: 'UK (GMT/BST)', offset: 0 },
  'de': { timezone: 'Europe/Berlin', label: 'Germany (CET)', offset: 1 },
  'fr': { timezone: 'Europe/Paris', label: 'France (CET)', offset: 1 },
  'jp': { timezone: 'Asia/Tokyo', label: 'Japan (JST)', offset: 9 },
  'au': { timezone: 'Australia/Sydney', label: 'Australia (AEST)', offset: 10 },
  'ca': { timezone: 'America/Toronto', label: 'Canada (EST)', offset: -5 },
  'in': { timezone: 'Asia/Kolkata', label: 'India (IST)', offset: 5.5 },
  'sg': { timezone: 'Asia/Singapore', label: 'Singapore (SGT)', offset: 8 },
  'hk': { timezone: 'Asia/Hong_Kong', label: 'Hong Kong (HKT)', offset: 8 },
};

/**
 * CRM-Lite Note Operations
 */
export async function addContactNote(userId, contactEmail, note) {
  const cleanEmail = contactEmail.trim().toLowerCase();
  const res = await query(
    `INSERT INTO contact_notes (user_id, contact_email, note)
     VALUES ($1, $2, $3)
     RETURNING *`,
    [userId, cleanEmail, String(note).trim()]
  );
  return res.rows[0];
}

export async function listContactNotes(userId, contactEmail) {
  const cleanEmail = contactEmail.trim().toLowerCase();
  const res = await query(
    `SELECT id, note, created_at
     FROM contact_notes
     WHERE user_id = $1 AND contact_email = $2
     ORDER BY created_at DESC`,
    [userId, cleanEmail]
  );
  return res.rows;
}

export async function deleteContactNote(userId, noteId) {
  const res = await query(
    `DELETE FROM contact_notes WHERE id = $1 AND user_id = $2 RETURNING id`,
    [noteId, userId]
  );
  return res.rows.length > 0;
}

/**
 * CRM-Lite Tag Operations
 */
export async function addContactTag(userId, contactEmail, tag) {
  const cleanEmail = contactEmail.trim().toLowerCase();
  const cleanTag = tag.trim().toUpperCase();
  const res = await query(
    `INSERT INTO contact_tags (user_id, contact_email, tag)
     VALUES ($1, $2, $3)
     ON CONFLICT (user_id, contact_email, tag) DO NOTHING
     RETURNING *`,
    [userId, cleanEmail, cleanTag]
  );
  return res.rows[0] || { user_id: userId, contact_email: cleanEmail, tag: cleanTag };
}

export async function listContactTags(userId, contactEmail) {
  const cleanEmail = contactEmail.trim().toLowerCase();
  const res = await query(
    `SELECT tag FROM contact_tags WHERE user_id = $1 AND contact_email = $2 ORDER BY tag ASC`,
    [userId, cleanEmail]
  );
  return res.rows.map(r => r.tag);
}

export async function removeContactTag(userId, contactEmail, tag) {
  const cleanEmail = contactEmail.trim().toLowerCase();
  const cleanTag = tag.trim().toUpperCase();
  const res = await query(
    `DELETE FROM contact_tags WHERE user_id = $1 AND contact_email = $2 AND tag = $3 RETURNING id`,
    [userId, cleanEmail, cleanTag]
  );
  return res.rows.length > 0;
}

/**
 * CRM-Lite Deal Pipeline Operations
 */
export async function createContactDeal(userId, contactEmail, { title, value = 0, currency = 'USD', stage = 'lead' }) {
  const cleanEmail = contactEmail.trim().toLowerCase();
  const res = await query(
    `INSERT INTO contact_deals (user_id, contact_email, title, value, currency, stage)
     VALUES ($1, $2, $3, $4, $5, $6)
     RETURNING *`,
    [userId, cleanEmail, title.trim(), parseFloat(value) || 0, currency.trim().toUpperCase(), stage]
  );
  return res.rows[0];
}

export async function listContactDeals(userId, contactEmail = null) {
  let q = `SELECT * FROM contact_deals WHERE user_id = $1`;
  const params = [userId];

  if (contactEmail) {
    params.push(contactEmail.trim().toLowerCase());
    q += ` AND contact_email = $2`;
  }

  q += ` ORDER BY created_at DESC`;
  const res = await query(q, params);
  return res.rows;
}

export async function updateContactDeal(userId, dealId, { title, value, currency, stage, closed_at }) {
  const cur = await query(`SELECT * FROM contact_deals WHERE id = $1 AND user_id = $2`, [dealId, userId]);
  if (cur.rows.length === 0) return null;

  const current = cur.rows[0];
  const newTitle = title !== undefined ? title.trim() : current.title;
  const newValue = value !== undefined ? parseFloat(value) : current.value;
  const newCurr = currency !== undefined ? currency.trim().toUpperCase() : current.currency;
  const newStage = stage !== undefined ? stage : current.stage;
  const newClosed = closed_at !== undefined ? closed_at : (newStage === 'won' || newStage === 'lost' ? new Date() : current.closed_at);

  const res = await query(
    `UPDATE contact_deals 
     SET title = $1, value = $2, currency = $3, stage = $4, closed_at = $5
     WHERE id = $6 AND user_id = $7
     RETURNING *`,
    [newTitle, newValue, newCurr, newStage, newClosed, dealId, userId]
  );
  return res.rows[0];
}

export async function deleteContactDeal(userId, dealId) {
  const res = await query(
    `DELETE FROM contact_deals WHERE id = $1 AND user_id = $2 RETURNING id`,
    [dealId, userId]
  );
  return res.rows.length > 0;
}

/**
 * Aggregate contact intelligence and communication telemetry (Dossier + CRM)
 */
export async function getContactDossier({ userId, contactEmail }) {
  if (!contactEmail) return null;

  const email = contactEmail.trim().toLowerCase();
  const domain = email.split('@')[1] || '';
  const tld = domain.split('.').pop();

  // 1. Fetch tracking interaction history
  const trackingHistory = await query(`
    SELECT id, subject, sent_at, opened_at, open_count, last_user_agent
    FROM email_tracking
    WHERE user_id = $1 AND LOWER(recipient_email) = $2
    ORDER BY sent_at DESC
    LIMIT 20
  `, [userId, email]);

  // 2. Fetch attachments shared with this contact
  const attachmentsHistory = await query(`
    SELECT id, filename, content_type, file_size, max_views, view_count, max_downloads, download_count, created_at
    FROM secure_attachments
    WHERE user_id = $1 AND watermark_text ILIKE $2
    ORDER BY created_at DESC
    LIMIT 10
  `, [userId, `%${email}%`]);

  // 3. Fetch active reminders for this contact
  const remindersHistory = await query(`
    SELECT id, subject, due_at, status, created_at
    FROM email_followup_reminders
    WHERE user_id = $1 AND LOWER(recipient_email) = $2
    ORDER BY created_at DESC
    LIMIT 5
  `, [userId, email]);

  // 4. Fetch CRM notes, tags, and deals
  const notes = await listContactNotes(userId, email);
  const tags = await listContactTags(userId, email);
  const deals = await listContactDeals(userId, email);

  const totalSent = trackingHistory.rows.length;
  const openedMessages = trackingHistory.rows.filter(t => t.open_count > 0);
  const openRatePercent = totalSent > 0 ? Math.round((openedMessages.length / totalSent) * 100) : 0;

  // 5. Timezone resolution
  let timezoneInfo = TLD_TIMEZONE_MAP[tld] || { timezone: 'UTC', label: 'UTC', offset: 0 };
  let localTimeStr = 'Unknown';
  try {
    const now = new Date();
    localTimeStr = new Intl.DateTimeFormat('en-US', {
      timeZone: timezoneInfo.timezone,
      hour: 'numeric',
      minute: 'numeric',
      hour12: true,
      weekday: 'short',
    }).format(now);
  } catch {
    localTimeStr = new Date().toLocaleTimeString();
  }

  // 6. Response speed & active hours estimation
  let averageResponseTimeHours = null;
  const latencies = [];
  for (const item of openedMessages) {
    if (item.sent_at && item.opened_at) {
      const diffMs = new Date(item.opened_at) - new Date(item.sent_at);
      if (diffMs > 0 && diffMs < 7 * 24 * 3600 * 1000) {
        latencies.push(diffMs / (3600 * 1000));
      }
    }
  }

  if (latencies.length > 0) {
    const sum = latencies.reduce((a, b) => a + b, 0);
    averageResponseTimeHours = Math.round((sum / latencies.length) * 10) / 10;
  }

  return {
    email,
    domain,
    localTime: localTimeStr,
    timezoneLabel: timezoneInfo.label,
    metrics: {
      totalEmailsSent: totalSent,
      totalOpened: openedMessages.length,
      openRatePercent,
      averageOpenLatencyHours: averageResponseTimeHours,
      sharedAttachmentsCount: attachmentsHistory.rows.length,
    },
    crm: {
      tags,
      notes,
      deals,
    },
    recentEmails: trackingHistory.rows.slice(0, 5),
    sharedAttachments: attachmentsHistory.rows,
    activeReminders: remindersHistory.rows.filter(r => r.status === 'pending'),
  };
}

export default {
  getContactDossier,
  addContactNote,
  listContactNotes,
  deleteContactNote,
  addContactTag,
  listContactTags,
  removeContactTag,
  createContactDeal,
  listContactDeals,
  updateContactDeal,
  deleteContactDeal
};
