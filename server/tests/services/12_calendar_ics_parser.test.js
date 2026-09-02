import test from 'node:test';
import assert from 'node:assert/strict';
import { parseICS, toCalendarEvent } from '../../src/services/calendarParser.js';
import { createEvent, listEvents, getEvent } from '../../src/services/calendarService.js';
import { getOrCreateTestUser } from '../test_helper.js';

test('Suite 12: WoxCalendar Service & RFC 5545 ICS Parser Engine', async (t) => {
  let testUser;

  await t.test('Setup: Prepare test user for calendar', async () => {
    testUser = await getOrCreateTestUser('calendar_user', 'Pass123!#', false);
    assert.ok(testUser.id);
  });

  await t.test('1. parseICS() parses VEVENT components with dates, location, and description', () => {
    const rawIcs = `BEGIN:VCALENDAR
VERSION:2.0
PRODID:-//WoxMail//WoxCalendar 1.0//EN
BEGIN:VEVENT
UID:wox-event-20260825-9988@wox.world
SUMMARY:Sovereign Privacy Architecture Review
DESCRIPTION:Quarterly deep-dive into zero-knowledge encrypted messaging protocols.
LOCATION:Virtual Enclave Room #4
DTSTART:20260901T140000Z
DTEND:20260901T153000Z
ORGANIZER;CN=Alice:mailto:alice@wox.world
STATUS:CONFIRMED
END:VEVENT
END:VCALENDAR`;

    const events = parseICS(rawIcs);
    assert.equal(events.length, 1);

    const event = events[0];
    assert.equal(event.summary, 'Sovereign Privacy Architecture Review');
    assert.equal(event.location, 'Virtual Enclave Room #4');
    assert.ok(event.startTime instanceof Date);
    assert.ok(event.endTime instanceof Date);
    assert.equal(event.allDay, false);
  });

  await t.test('2. toCalendarEvent() and createEvent() persistence in WoxCalendar', async () => {
    const parsedEvent = {
      summary: 'Executive Security Briefing',
      description: 'Review of cryptographic threat models',
      location: 'HQ Room 10',
      startTime: new Date('2026-09-10T10:00:00Z'),
      endTime: new Date('2026-09-10T11:00:00Z'),
      allDay: false,
      recurrenceRule: null,
    };

    const dbPayload = toCalendarEvent(parsedEvent, testUser.id, 9901);
    const created = await createEvent(dbPayload);

    assert.ok(created.id);
    assert.equal(created.title, 'Executive Security Briefing');
    assert.equal(created.user_id, testUser.id);

    // Verify listEvents retrieves the event
    const eventsList = await listEvents(
      testUser.id,
      '2026-09-01T00:00:00Z',
      '2026-09-30T23:59:59Z'
    );
    assert.ok(eventsList.some((e) => e.title === 'Executive Security Briefing'));

    // Verify getEvent retrieves single event
    const single = await getEvent(testUser.id, created.id);
    assert.ok(single);
    assert.equal(single.id, created.id);
  });
});
