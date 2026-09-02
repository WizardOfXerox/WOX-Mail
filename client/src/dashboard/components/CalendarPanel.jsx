import React, { useState, useEffect } from 'react';
import { apiFetch } from '../../shared/api.js';
import { formatFullDate } from '../../shared/utils/formatters.js';

/**
 * Calendar sidebar panel — shows upcoming events and quick add.
 */
export default function CalendarPanel() {
  const [events, setEvents] = useState([]);
  const [adding, setAdding] = useState(false);
  const [form, setForm] = useState({ title: '', startTime: '', endTime: '' });
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    loadUpcoming();
  }, []);

  async function loadUpcoming() {
    try {
      const data = await apiFetch('/api/calendar/upcoming');
      setEvents(data.events || []);
    } catch (err) {
      console.error('Failed to load calendar:', err);
    } finally {
      setLoading(false);
    }
  }

  async function handleAdd() {
    if (!form.title || !form.startTime) return;
    try {
      await apiFetch('/api/calendar/events', {
        method: 'POST',
        body: JSON.stringify({
          title: form.title,
          startTime: form.startTime,
          endTime: form.endTime || form.startTime,
        }),
      });
      setForm({ title: '', startTime: '', endTime: '' });
      setAdding(false);
      loadUpcoming();
    } catch (err) {
      console.error('Failed to create event:', err);
    }
  }

  async function handleDelete(id) {
    try {
      await apiFetch(`/api/calendar/events/${id}`, { method: 'DELETE' });
      loadUpcoming();
    } catch (err) {
      console.error('Failed to delete event:', err);
    }
  }

  return (
    <div className="calendar-panel">
      <div className="calendar-header">
        <h3>Calendar</h3>
        <button className="btn btn-sm btn-ghost" onClick={() => setAdding(!adding)} style={{ display: 'inline-flex', alignItems: 'center', justifyContent: 'center', width: 28, height: 28, padding: 0 }}>
          {adding ? (
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
          ) : (
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>
          )}
        </button>
      </div>

      {adding && (
        <div className="calendar-add-form">
          <input
            placeholder="Event title"
            value={form.title}
            onChange={(e) => setForm({ ...form, title: e.target.value })}
            className="input-field"
          />
          <input
            type="datetime-local"
            value={form.startTime}
            onChange={(e) => setForm({ ...form, startTime: e.target.value })}
            className="input-field"
          />
          <input
            type="datetime-local"
            value={form.endTime}
            onChange={(e) => setForm({ ...form, endTime: e.target.value })}
            className="input-field"
            placeholder="End time (optional)"
          />
          <button className="btn btn-sm btn-primary" onClick={handleAdd}>Add Event</button>
        </div>
      )}

      <div className="calendar-events">
        {loading ? (
          <div className="calendar-loading">Loading...</div>
        ) : events.length === 0 ? (
          <div className="calendar-empty">
            <p>No upcoming events</p>
            <p className="text-muted">Next 7 days are clear</p>
          </div>
        ) : (
          events.map((event) => (
            <div key={event.id} className="calendar-event" style={{ borderLeftColor: event.color }}>
              <div className="calendar-event-info">
                <div className="calendar-event-title">{event.title}</div>
                <div className="calendar-event-time">
                  {event.all_day ? 'All day' : formatFullDate(event.start_time)}
                </div>
                {event.location && (
                  <div className="calendar-event-location">{event.location}</div>
                )}
              </div>
              <button
                className="calendar-event-delete"
                onClick={() => handleDelete(event.id)}
                title="Delete"
                style={{ display: 'inline-flex', alignItems: 'center', justifyContent: 'center', width: 22, height: 22, padding: 0 }}
              >
                <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
              </button>
            </div>
          ))
        )}
      </div>
    </div>
  );
}
