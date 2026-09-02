import React, { useState, useEffect, useRef } from 'react';

/**
 * SchedulePopover — Presets and custom date-time picker for scheduled email sending.
 */
export default function SchedulePopover({ onSchedule, onClose, anchorRect }) {
  const [customDateTime, setCustomDateTime] = useState('');
  const [showCustom, setShowCustom] = useState(false);
  const popoverRef = useRef(null);

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

  const now = new Date();

  // Presets
  const tomorrowMorning = new Date(now);
  tomorrowMorning.setDate(tomorrowMorning.getDate() + 1);
  tomorrowMorning.setHours(8, 0, 0, 0);

  const tomorrowAfternoon = new Date(now);
  tomorrowAfternoon.setDate(tomorrowAfternoon.getDate() + 1);
  tomorrowAfternoon.setHours(13, 0, 0, 0);

  const nextWeek = new Date(now);
  const day = nextWeek.getDay();
  const daysUntilMonday = ((8 - day) % 7) || 7;
  nextWeek.setDate(nextWeek.getDate() + daysUntilMonday);
  nextWeek.setHours(8, 0, 0, 0);

  const presets = [
    { label: 'Tomorrow morning', desc: '8:00 AM', date: tomorrowMorning },
    { label: 'Tomorrow afternoon', desc: '1:00 PM', date: tomorrowAfternoon },
    { label: 'Monday morning', desc: '8:00 AM', date: nextWeek },
  ];

  const handleSubmitCustom = (e) => {
    e.preventDefault();
    if (!customDateTime) return;
    const d = new Date(customDateTime);
    if (d <= new Date()) {
      alert('Please choose a future time');
      return;
    }
    onSchedule(d.toISOString());
  };

  const style = anchorRect
    ? {
        position: 'fixed',
        top: `${anchorRect.bottom + 8}px`,
        left: `${Math.max(10, Math.min(anchorRect.left, window.innerWidth - 280))}px`,
        zIndex: 10005,
      }
    : {};

  return (
    <div
      ref={popoverRef}
      className="snooze-popover-container card"
      style={style}
      role="dialog"
      aria-label="Schedule send options"
    >
      <div className="snooze-header" style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <span style={{ display: 'inline-flex', alignItems: 'center', gap: '0.45rem', fontWeight: 700 }}>
          <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <circle cx="12" cy="12" r="10" />
            <polyline points="12 6 12 12 14 14" />
          </svg>
          <span>Schedule Send</span>
        </span>
        <button type="button" className="btn-ghost btn-xs" onClick={onClose} aria-label="Close" style={{ display: 'inline-flex', alignItems: 'center', justifyContent: 'center' }}>
          <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
            <line x1="18" y1="6" x2="6" y2="18" />
            <line x1="6" y1="6" x2="18" y2="18" />
          </svg>
        </button>
      </div>

      {!showCustom ? (
        <div className="snooze-preset-list">
          {presets.map((p, i) => (
            <button
              key={i}
              type="button"
              className="snooze-preset-item"
              onClick={() => onSchedule(p.date.toISOString())}
            >
              <span className="snooze-preset-label">{p.label}</span>
              <span className="snooze-preset-desc">{p.desc}</span>
            </button>
          ))}
          <div className="snooze-divider" />
          <button
            type="button"
            className="snooze-preset-item snooze-custom-btn"
            onClick={() => setShowCustom(true)}
          >
            <span>Pick Date & Time...</span>
          </button>
        </div>
      ) : (
        <form onSubmit={handleSubmitCustom} className="snooze-custom-form">
          <label className="snooze-input-label">Select dispatch time:</label>
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
            <button type="button" className="btn btn-ghost btn-sm" onClick={() => setShowCustom(false)}>Back</button>
            <button type="submit" className="btn btn-primary btn-sm">Schedule</button>
          </div>
        </form>
      )}
    </div>
  );
}
