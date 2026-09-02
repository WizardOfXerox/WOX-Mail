import React, { useState, useEffect, useRef } from 'react';

/**
 * SnoozePopover — Floating date/time preset picker for email snoozing.
 *
 * @param {Object} props
 * @param {Function} props.onSelect - Callback with ISO date string
 * @param {Function} props.onClose - Close popover callback
 * @param {Object} [props.anchorRect] - DOMRect of trigger button
 */
export default function SnoozePopover({ onSelect, onClose, anchorRect }) {
  const [customDateTime, setCustomDateTime] = useState('');
  const [showCustomPicker, setShowCustomPicker] = useState(false);
  const popoverRef = useRef(null);

  // Close on outside click or Escape
  useEffect(() => {
    function handleKeyDown(e) {
      if (e.key === 'Escape') onClose();
    }
    function handleClickOutside(e) {
      if (popoverRef.current && !popoverRef.current.contains(e.target)) {
        onClose();
      }
    }

    document.addEventListener('keydown', handleKeyDown);
    document.addEventListener('mousedown', handleClickOutside);
    return () => {
      document.removeEventListener('keydown', handleKeyDown);
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, [onClose]);

  // Compute Presets
  const now = new Date();

  // 1. Later Today (+3 hours)
  const laterToday = new Date(now.getTime() + 3 * 60 * 60 * 1000);
  const laterTodayLabel = laterToday.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });

  // 2. Tomorrow Morning (Next day 8:00 AM)
  const tomorrowMorning = new Date(now);
  tomorrowMorning.setDate(tomorrowMorning.getDate() + 1);
  tomorrowMorning.setHours(8, 0, 0, 0);

  // 3. Tomorrow Afternoon (Next day 1:00 PM)
  const tomorrowAfternoon = new Date(now);
  tomorrowAfternoon.setDate(tomorrowAfternoon.getDate() + 1);
  tomorrowAfternoon.setHours(13, 0, 0, 0);

  // 4. Next Week (Next Monday 8:00 AM)
  const nextWeek = new Date(now);
  const day = nextWeek.getDay();
  const daysUntilMonday = ((8 - day) % 7) || 7;
  nextWeek.setDate(nextWeek.getDate() + daysUntilMonday);
  nextWeek.setHours(8, 0, 0, 0);

  const presets = [
    { label: 'Later today', desc: laterTodayLabel, date: laterToday },
    { label: 'Tomorrow morning', desc: '8:00 AM', date: tomorrowMorning },
    { label: 'Tomorrow afternoon', desc: '1:00 PM', date: tomorrowAfternoon },
    { label: 'Next week', desc: 'Monday 8:00 AM', date: nextWeek },
  ];

  function handleCustomSubmit(e) {
    e.preventDefault();
    if (!customDateTime) return;
    const selected = new Date(customDateTime);
    if (selected <= new Date()) {
      alert('Please select a future date and time');
      return;
    }
    onSelect(selected.toISOString());
  }

  // Calculate style positioning if anchorRect provided
  const style = anchorRect
    ? {
        position: 'fixed',
        top: `${anchorRect.bottom + 8}px`,
        left: `${Math.max(10, Math.min(anchorRect.left, window.innerWidth - 300))}px`,
        zIndex: 9999,
      }
    : {};

  return (
    <div
      ref={popoverRef}
      className="snooze-popover-container card"
      style={style}
      role="dialog"
      aria-label="Snooze email options"
    >
      <div className="snooze-header" style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <span style={{ display: 'inline-flex', alignItems: 'center', gap: '0.45rem', fontWeight: 700 }}>
          <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <circle cx="12" cy="12" r="10" />
            <polyline points="12 6 12 12 14 14" />
          </svg>
          <span>Snooze until...</span>
        </span>
        <button className="btn-ghost btn-xs" onClick={onClose} aria-label="Close snooze popover" style={{ display: 'inline-flex', alignItems: 'center', justifyContent: 'center' }}>
          <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
            <line x1="18" y1="6" x2="6" y2="18" />
            <line x1="6" y1="6" x2="18" y2="18" />
          </svg>
        </button>
      </div>

      {!showCustomPicker ? (
        <div className="snooze-preset-list">
          {presets.map((p, idx) => (
            <button
              key={idx}
              className="snooze-preset-item"
              onClick={() => onSelect(p.date.toISOString())}
            >
              <span className="snooze-preset-label">{p.label}</span>
              <span className="snooze-preset-desc">{p.desc}</span>
            </button>
          ))}

          <div className="snooze-divider" />

          <button
            className="snooze-preset-item snooze-custom-btn"
            onClick={() => setShowCustomPicker(true)}
          >
            <span>Pick Date & Time...</span>
          </button>
        </div>
      ) : (
        <form onSubmit={handleCustomSubmit} className="snooze-custom-form">
          <label className="snooze-input-label">Choose date and time:</label>
          <input
            type="datetime-local"
            className="input"
            value={customDateTime}
            onChange={(e) => setCustomDateTime(e.target.value)}
            min={new Date().toISOString().slice(0, 16)}
            required
            autoFocus
          />
          <div className="snooze-form-actions">
            <button
              type="button"
              className="btn btn-ghost btn-sm"
              onClick={() => setShowCustomPicker(false)}
            >
              Back
            </button>
            <button type="submit" className="btn btn-primary btn-sm">
              Snooze
            </button>
          </div>
        </form>
      )}
    </div>
  );
}
