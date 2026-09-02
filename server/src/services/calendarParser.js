/**
 * @fileoverview Calendar .ics file parser using ical.js.
 * Extracts events from .ics attachments in emails for WoxCalendar integration.
 */

/**
 * Parse an .ics string into an array of event objects.
 * Uses a lightweight regex-based parser since ical.js may not be installed yet.
 * @param {string} icsContent - Raw .ics file content
 * @returns {Array<object>} Parsed events
 */
export function parseICS(icsContent) {
  const events = [];
  const eventBlocks = icsContent.split('BEGIN:VEVENT');

  for (let i = 1; i < eventBlocks.length; i++) {
    const block = eventBlocks[i].split('END:VEVENT')[0];
    const event = {};

    const getValue = (key) => {
      const regex = new RegExp(`^${key}[;:](.+)$`, 'mi');
      const match = block.match(regex);
      if (!match) return null;
      let val = match[1];
      // Handle parameters like DTSTART;VALUE=DATE:20240101
      if (val.includes(':')) val = val.split(':').pop();
      return val.trim();
    };

    event.uid = getValue('UID');
    event.summary = getValue('SUMMARY') || 'Untitled Event';
    event.description = unfold(getValue('DESCRIPTION') || '');
    event.location = getValue('LOCATION') || '';

    // Parse dates
    const dtstart = getValue('DTSTART');
    const dtend = getValue('DTEND');
    event.startTime = parseICSDate(dtstart);
    event.endTime = parseICSDate(dtend);
    event.allDay = dtstart && dtstart.length === 8; // YYYYMMDD = all-day

    event.recurrenceRule = getValue('RRULE') || null;
    event.organizer = getValue('ORGANIZER') || '';
    event.status = getValue('STATUS') || 'CONFIRMED';

    if (event.startTime) {
      events.push(event);
    }
  }

  return events;
}

/**
 * Parse an ICS date string into a JS Date.
 * Handles: YYYYMMDD, YYYYMMDDTHHmmss, YYYYMMDDTHHmmssZ
 * @param {string} dateStr
 * @returns {Date|null}
 */
function parseICSDate(dateStr) {
  if (!dateStr) return null;

  // Remove any leading/trailing whitespace
  dateStr = dateStr.trim();

  // YYYYMMDD
  if (dateStr.length === 8) {
    return new Date(`${dateStr.slice(0, 4)}-${dateStr.slice(4, 6)}-${dateStr.slice(6, 8)}`);
  }

  // YYYYMMDDTHHmmss or YYYYMMDDTHHmmssZ
  if (dateStr.length >= 15) {
    const y = dateStr.slice(0, 4);
    const m = dateStr.slice(4, 6);
    const d = dateStr.slice(6, 8);
    const h = dateStr.slice(9, 11);
    const mi = dateStr.slice(11, 13);
    const s = dateStr.slice(13, 15);
    const isUTC = dateStr.endsWith('Z');
    return new Date(`${y}-${m}-${d}T${h}:${mi}:${s}${isUTC ? 'Z' : ''}`);
  }

  return null;
}

/**
 * Unfold ICS line continuations (lines starting with space/tab).
 * @param {string} text
 * @returns {string}
 */
function unfold(text) {
  if (!text) return '';
  return text
    .replace(/\r?\n[ \t]/g, '')
    .replace(/\\n/g, '\n')
    .replace(/\\,/g, ',')
    .replace(/\\\\/g, '\\');
}

/**
 * Convert a parsed event to WoxCalendar DB format.
 * @param {object} event - Parsed ICS event
 * @param {number} userId - User ID
 * @param {number} [emailUid] - Source email UID
 * @returns {object} DB-ready event object
 */
export function toCalendarEvent(event, userId, emailUid = null) {
  return {
    user_id: userId,
    title: event.summary,
    description: event.description || null,
    location: event.location || null,
    start_time: event.startTime,
    end_time: event.endTime || event.startTime,
    all_day: event.allDay || false,
    color: '#7c3aed',
    recurrence_rule: event.recurrenceRule || null,
    reminder_minutes: 15,
    source_email_uid: emailUid,
  };
}

export default { parseICS, toCalendarEvent };
