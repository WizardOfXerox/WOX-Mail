import React, { useEffect, useState } from 'react';

export default function UndoSendToast({ dispatchId, delaySeconds = 10, onUndo, onFinish }) {
  const [secondsLeft, setSecondsLeft] = useState(delaySeconds);

  useEffect(() => {
    if (secondsLeft <= 0) {
      onFinish?.();
      return;
    }

    const interval = setInterval(() => {
      setSecondsLeft((prev) => {
        if (prev <= 1) {
          clearInterval(interval);
          onFinish?.();
          return 0;
        }
        return prev - 1;
      });
    }, 1000);

    return () => clearInterval(interval);
  }, [secondsLeft, onFinish]);

  const percentage = ((delaySeconds - secondsLeft) / delaySeconds) * 100;

  return (
    <aside
      role="alert"
      aria-live="assertive"
      className="undo-send-toast"
      style={{
        position: 'fixed',
        bottom: '1.5rem',
        right: '1.5rem',
        zIndex: 99999,
        background: 'linear-gradient(135deg, rgba(26, 26, 46, 0.95), rgba(37, 37, 69, 0.95))',
        backdropFilter: 'blur(16px)',
        WebkitBackdropFilter: 'blur(16px)',
        border: '1px solid var(--color-primary-light, #8b5cf6)',
        color: '#f0f0f5',
        padding: '0.85rem 1.15rem',
        borderRadius: '16px',
        boxShadow: '0 12px 35px rgba(0, 0, 0, 0.55), 0 0 25px rgba(124, 58, 237, 0.25)',
        minWidth: '320px',
        maxWidth: 'calc(100vw - 3rem)',
        display: 'flex',
        flexDirection: 'column',
        gap: '0.65rem',
        animation: 'slideUpFade 0.3s cubic-bezier(0.16, 1, 0.3, 1)',
        boxSizing: 'border-box',
      }}
    >
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '1rem' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.65rem' }}>
          <span
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              justifyContent: 'center',
              width: '24px',
              height: '24px',
              borderRadius: '50%',
              background: 'rgba(124, 58, 237, 0.2)',
              color: 'var(--color-primary-light, #a78bfa)',
              flexShrink: 0,
            }}
          >
            <svg
              width="14"
              height="14"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2.5"
              strokeLinecap="round"
              strokeLinejoin="round"
              style={{ animation: 'spin 1.5s linear infinite' }}
            >
              <circle cx="12" cy="12" r="10" strokeDasharray="32" strokeDashoffset="12" />
            </svg>
          </span>
          <span style={{ fontSize: '0.875rem', fontWeight: 600, color: '#f0f0f5', letterSpacing: '-0.01em' }}>
            Sending message... <span style={{ color: 'var(--color-primary-light, #a78bfa)', fontWeight: 700 }}>({secondsLeft}s)</span>
          </span>
        </div>
        <button
          type="button"
          onClick={() => onUndo?.(dispatchId)}
          style={{
            background: 'linear-gradient(135deg, #7c3aed, #6d28d9)',
            color: '#ffffff',
            border: '1px solid rgba(255, 255, 255, 0.2)',
            padding: '0.35rem 0.85rem',
            borderRadius: '9999px',
            fontSize: '0.75rem',
            fontWeight: 700,
            cursor: 'pointer',
            boxShadow: '0 2px 8px rgba(124, 58, 237, 0.4)',
            transition: 'all 0.2s ease',
            display: 'inline-flex',
            alignItems: 'center',
            gap: '0.4rem',
            flexShrink: 0,
          }}
          onMouseOver={(e) => {
            e.currentTarget.style.transform = 'scale(1.04)';
            e.currentTarget.style.boxShadow = '0 4px 12px rgba(124, 58, 237, 0.6)';
          }}
          onMouseOut={(e) => {
            e.currentTarget.style.transform = 'scale(1)';
            e.currentTarget.style.boxShadow = '0 2px 8px rgba(124, 58, 237, 0.4)';
          }}
        >
          <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="M3 7v6h6"/><path d="M21 17a9 9 0 0 0-9-9 9 9 0 0 0-6 2.3L3 13"/></svg>
          <span>Undo</span>
        </button>
      </div>

      {/* Progress countdown bar */}
      <div
        style={{
          width: '100%',
          height: '4px',
          background: 'rgba(255, 255, 255, 0.08)',
          borderRadius: '9999px',
          overflow: 'hidden',
        }}
      >
        <div
          style={{
            width: `${100 - percentage}%`,
            height: '100%',
            background: 'linear-gradient(90deg, #7c3aed, #a78bfa, #c084fc)',
            borderRadius: '9999px',
            transition: 'width 1s linear',
            boxShadow: '0 0 8px rgba(167, 139, 250, 0.6)',
          }}
        />
      </div>
    </aside>
  );
}
