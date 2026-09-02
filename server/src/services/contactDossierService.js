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
 * Aggregate contact intelligence and communication telemetry
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

  const totalSent = trackingHistory.rows.length;
  const openedMessages = trackingHistory.rows.filter(t => t.open_count > 0);
  const openRatePercent = totalSent > 0 ? Math.round((openedMessages.length / totalSent) * 100) : 0;

  // 4. Timezone resolution
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

  // 5. Response speed & active hours estimation
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
    recentEmails: trackingHistory.rows.slice(0, 5),
    sharedAttachments: attachmentsHistory.rows,
    activeReminders: remindersHistory.rows.filter(r => r.status === 'pending'),
  };
}

export default {
  getContactDossier,
};
