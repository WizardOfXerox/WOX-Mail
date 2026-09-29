import React, { useState, useEffect, useMemo } from 'react';

/**
 * Priority weighting for announcement classification:
 * Emergency / Critical (3) > Warning / Maintenance (2) > Info (1)
 */
function getPriorityWeight(type) {
  const t = (type || '').toLowerCase();
  if (t === 'emergency' || t === 'critical') return 3;
  if (t === 'warning' || t === 'maintenance') return 2;
  return 1;
}

function getTypeDetails(type) {
  const t = (type || '').toLowerCase();
  if (t === 'emergency' || t === 'critical') {
    return {
      label: 'EMERGENCY',
      icon: '🚨',
      gradient: 'linear-gradient(135deg, #dc2626 0%, #991b1b 100%)',
      progressBarBg: 'rgba(255, 255, 255, 0.45)',
      borderColor: 'rgba(254, 202, 202, 0.25)',
      badgeBg: 'rgba(0, 0, 0, 0.35)',
    };
  }
  if (t === 'warning') {
    return {
      label: 'WARNING',
      icon: '⚠️',
      gradient: 'linear-gradient(135deg, #d97706 0%, #b45309 100%)',
      progressBarBg: 'rgba(255, 255, 255, 0.4)',
      borderColor: 'rgba(254, 240, 138, 0.25)',
      badgeBg: 'rgba(0, 0, 0, 0.3)',
    };
  }
  if (t === 'maintenance') {
    return {
      label: 'MAINTENANCE',
      icon: '🛠️',
      gradient: 'linear-gradient(135deg, #ea580c 0%, #c2410c 100%)',
      progressBarBg: 'rgba(255, 255, 255, 0.4)',
      borderColor: 'rgba(254, 215, 170, 0.25)',
      badgeBg: 'rgba(0, 0, 0, 0.3)',
    };
  }
  return {
    label: (type || 'INFO').toUpperCase(),
    icon: 'ℹ️',
    gradient: 'linear-gradient(135deg, #6d28d9 0%, #4f46e5 100%)',
    progressBarBg: 'rgba(255, 255, 255, 0.4)',
    borderColor: 'rgba(199, 210, 254, 0.25)',
    badgeBg: 'rgba(0, 0, 0, 0.3)',
  };
}

export default function GlobalAnnouncements({
  announcements = [],
  dismissedIds = [],
  onDismiss,
  onDismissAll,
}) {
  const [currentIndex, setCurrentIndex] = useState(0);
  const [isPaused, setIsPaused] = useState(false);
  const [remainingMs, setRemainingMs] = useState(5000);
  const [showModal, setShowModal] = useState(false);

  // Active (non-dismissed) announcements, sorted by priority and date
  const sorted = useMemo(() => {
    return announcements
      .filter((a) => !dismissedIds.includes(a.id))
      .sort((a, b) => {
        const weightDiff = getPriorityWeight(b.type) - getPriorityWeight(a.type);
        if (weightDiff !== 0) return weightDiff;
        return new Date(b.created_at || 0) - new Date(a.created_at || 0);
      });
  }, [announcements, dismissedIds]);

  // Clamp index if active announcements count shrinks
  useEffect(() => {
    if (currentIndex >= sorted.length && sorted.length > 0) {
      setCurrentIndex(sorted.length - 1);
    }
  }, [sorted.length, currentIndex]);

  const current = sorted[currentIndex];

  // Reset 5-second countdown whenever current announcement changes
  useEffect(() => {
    setRemainingMs(5000);
  }, [current?.id, currentIndex]);

  // 5-Second countdown timer with tick resolution of 50ms
  useEffect(() => {
    if (!current || isPaused || showModal) return;

    const interval = setInterval(() => {
      setRemainingMs((prev) => {
        if (prev <= 50) {
          // Auto-dismiss current announcement after 5 seconds
          if (onDismiss && current) {
            onDismiss(current.id);
          }
          return 5000;
        }
        return prev - 50;
      });
    }, 50);

    return () => clearInterval(interval);
  }, [current, isPaused, showModal, onDismiss]);

  // Close modal on Escape
  useEffect(() => {
    const handleKeyDown = (e) => {
      if (e.key === 'Escape' && showModal) {
        setShowModal(false);
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [showModal]);

  if (!current) return null;

  const typeConfig = getTypeDetails(current.type);
  const progressPct = Math.max(0, Math.min(100, (remainingMs / 5000) * 100));

  const handlePrev = (e) => {
    e.stopPropagation();
    setCurrentIndex((prev) => (prev > 0 ? prev - 1 : sorted.length - 1));
  };

  const handleNext = (e) => {
    e.stopPropagation();
    setCurrentIndex((prev) => (prev < sorted.length - 1 ? prev + 1 : 0));
  };

  return (
    <>
      <div
        className="global-announcements-container"
        role="region"
        aria-label="System Announcements"
        aria-live="polite"
        style={{
          zIndex: 30,
          position: 'relative',
          display: 'flex',
          flexDirection: 'column',
          width: '100%',
        }}
      >
        <div
          className="global-announcement-banner"
          onMouseEnter={() => setIsPaused(true)}
          onMouseLeave={() => setIsPaused(false)}
          onFocus={() => setIsPaused(true)}
          onBlur={() => setIsPaused(false)}
          style={{
            background: typeConfig.gradient,
            color: '#ffffff',
            padding: '0.45rem 1rem',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            gap: '0.75rem',
            fontSize: '0.8125rem',
            fontWeight: 500,
            boxShadow: '0 2px 8px rgba(0,0,0,0.18)',
            borderBottom: `1px solid ${typeConfig.borderColor}`,
            position: 'relative',
            userSelect: 'none',
          }}
        >
          {/* Main message snippet */}
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: '0.6rem',
              flex: 1,
              minWidth: 0,
            }}
          >
            <span
              style={{
                fontSize: '0.65rem',
                fontWeight: 800,
                padding: '0.12rem 0.45rem',
                borderRadius: '9999px',
                background: typeConfig.badgeBg,
                letterSpacing: '0.05em',
                textTransform: 'uppercase',
                display: 'inline-flex',
                alignItems: 'center',
                gap: '0.25rem',
                flexShrink: 0,
                border: '1px solid rgba(255,255,255,0.15)',
              }}
            >
              <span>{typeConfig.icon}</span>
              <span>{typeConfig.label}</span>
            </span>

            <strong
              style={{
                color: '#ffffff',
                whiteSpace: 'nowrap',
                fontWeight: 600,
              }}
            >
              {current.title}:
            </strong>

            <span
              title={current.content || current.body}
              style={{
                color: '#f3f4f6',
                overflow: 'hidden',
                textOverflow: 'ellipsis',
                whiteSpace: 'nowrap',
                flex: 1,
              }}
            >
              {current.content || current.body}
            </span>
          </div>

          {/* Action and Carousel Controls */}
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: '0.5rem',
              flexShrink: 0,
            }}
          >
            {/* Multi-item carousel controls */}
            {sorted.length > 1 && (
              <div
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  background: 'rgba(0,0,0,0.25)',
                  borderRadius: '9999px',
                  padding: '0.1rem 0.35rem',
                  fontSize: '0.72rem',
                  gap: '0.25rem',
                  border: '1px solid rgba(255,255,255,0.18)',
                }}
              >
                <button
                  type="button"
                  onClick={handlePrev}
                  title="Previous announcement"
                  aria-label="Previous announcement"
                  style={{
                    background: 'none',
                    border: 'none',
                    color: '#ffffff',
                    cursor: 'pointer',
                    padding: '0 0.25rem',
                    fontSize: '0.75rem',
                    lineHeight: 1,
                    opacity: 0.85,
                  }}
                >
                  ◀
                </button>
                <span style={{ fontWeight: 600, letterSpacing: '0.02em', minWidth: '38px', textAlign: 'center' }}>
                  {currentIndex + 1} of {sorted.length}
                </span>
                <button
                  type="button"
                  onClick={handleNext}
                  title="Next announcement"
                  aria-label="Next announcement"
                  style={{
                    background: 'none',
                    border: 'none',
                    color: '#ffffff',
                    cursor: 'pointer',
                    padding: '0 0.25rem',
                    fontSize: '0.75rem',
                    lineHeight: 1,
                    opacity: 0.85,
                  }}
                >
                  ▶
                </button>
              </div>
            )}

            {/* View all modal button */}
            <button
              type="button"
              onClick={() => setShowModal(true)}
              title="View full announcement details"
              style={{
                background: 'rgba(255,255,255,0.18)',
                border: '1px solid rgba(255,255,255,0.3)',
                color: '#ffffff',
                borderRadius: '6px',
                padding: '0.15rem 0.5rem',
                fontSize: '0.72rem',
                fontWeight: 600,
                cursor: 'pointer',
                transition: 'background 0.15s ease',
                whiteSpace: 'nowrap',
              }}
            >
              View all ({sorted.length})
            </button>

            {/* Immediate Dismiss Button */}
            <button
              type="button"
              onClick={() => onDismiss(current.id)}
              title="Dismiss notification"
              aria-label="Dismiss announcement"
              style={{
                background: 'rgba(0,0,0,0.25)',
                border: '1px solid rgba(255,255,255,0.3)',
                color: '#ffffff',
                borderRadius: '50%',
                width: '20px',
                height: '20px',
                display: 'inline-flex',
                alignItems: 'center',
                justifyContent: 'center',
                cursor: 'pointer',
                fontSize: '0.75rem',
                lineHeight: 1,
                flexShrink: 0,
                transition: 'transform 0.15s ease, background 0.15s ease',
              }}
            >
              ✕
            </button>
          </div>

          {/* 5-second countdown progress bar */}
          <div
            style={{
              position: 'absolute',
              bottom: 0,
              left: 0,
              height: '2.5px',
              width: `${progressPct}%`,
              background: typeConfig.progressBarBg,
              transition: isPaused ? 'none' : 'width 50ms linear',
              boxShadow: '0 0 4px rgba(255,255,255,0.5)',
            }}
          />
        </div>
      </div>

      {/* "All Announcements" Modal */}
      {showModal && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center p-4"
          style={{
            position: 'fixed',
            inset: 0,
            zIndex: 9999,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            background: 'rgba(0, 0, 0, 0.65)',
            backdropFilter: 'blur(4px)',
            padding: '1rem',
          }}
          onClick={() => setShowModal(false)}
        >
          <div
            role="dialog"
            aria-modal="true"
            aria-labelledby="announcements-dialog-title"
            onClick={(e) => e.stopPropagation()}
            style={{
              position: 'relative',
              width: '100%',
              maxWidth: '560px',
              maxHeight: '85vh',
              background: '#16162a',
              border: '1px solid #2a2a4a',
              borderRadius: '1rem',
              boxShadow: '0 25px 50px -12px rgba(0, 0, 0, 0.5)',
              display: 'flex',
              flexDirection: 'column',
              overflow: 'hidden',
              color: '#f0f0f5',
            }}
          >
            {/* Modal Header */}
            <div
              style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                padding: '1rem 1.25rem',
                borderBottom: '1px solid #2a2a4a',
                background: '#1a1a32',
              }}
            >
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.6rem' }}>
                <span style={{ fontSize: '1.25rem' }}>📢</span>
                <div>
                  <h2
                    id="announcements-dialog-title"
                    style={{
                      fontSize: '1.05rem',
                      fontWeight: 700,
                      color: '#f0f0f5',
                      margin: 0,
                    }}
                  >
                    System Announcements
                  </h2>
                  <span style={{ fontSize: '0.75rem', color: '#9898b0' }}>
                    {sorted.length} active broadcast{sorted.length !== 1 ? 's' : ''}
                  </span>
                </div>
              </div>

              <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                {sorted.length > 0 && onDismissAll && (
                  <button
                    type="button"
                    onClick={() => {
                      onDismissAll(sorted.map((a) => a.id));
                      setShowModal(false);
                    }}
                    style={{
                      background: 'rgba(239, 68, 68, 0.15)',
                      border: '1px solid rgba(239, 68, 68, 0.3)',
                      color: '#f87171',
                      borderRadius: '6px',
                      padding: '0.25rem 0.6rem',
                      fontSize: '0.75rem',
                      fontWeight: 600,
                      cursor: 'pointer',
                    }}
                  >
                    Dismiss all
                  </button>
                )}
                <button
                  type="button"
                  onClick={() => setShowModal(false)}
                  aria-label="Close dialog"
                  style={{
                    background: 'none',
                    border: 'none',
                    color: '#9898b0',
                    cursor: 'pointer',
                    fontSize: '1.2rem',
                    width: '32px',
                    height: '32px',
                    borderRadius: '8px',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                  }}
                >
                  ✕
                </button>
              </div>
            </div>

            {/* Modal Body: List of Announcements */}
            <div
              style={{
                flex: 1,
                overflowY: 'auto',
                padding: '1.25rem',
                display: 'flex',
                flexDirection: 'column',
                gap: '1rem',
              }}
            >
              {sorted.length === 0 ? (
                <div style={{ textAlign: 'center', padding: '2rem 1rem', color: '#9898b0' }}>
                  <p style={{ fontSize: '0.9rem' }}>No active announcements</p>
                </div>
              ) : (
                sorted.map((a) => {
                  const details = getTypeDetails(a.type);
                  return (
                    <div
                      key={a.id}
                      style={{
                        background: '#1f1f38',
                        border: '1px solid #2f2f55',
                        borderRadius: '0.75rem',
                        padding: '1rem',
                        display: 'flex',
                        flexDirection: 'column',
                        gap: '0.5rem',
                        position: 'relative',
                      }}
                    >
                      <div
                        style={{
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'space-between',
                          gap: '0.5rem',
                        }}
                      >
                        <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                          <span
                            style={{
                              fontSize: '0.65rem',
                              fontWeight: 800,
                              padding: '0.12rem 0.45rem',
                              borderRadius: '9999px',
                              background: details.badgeBg,
                              border: '1px solid rgba(255,255,255,0.2)',
                              letterSpacing: '0.05em',
                              textTransform: 'uppercase',
                              color: '#ffffff',
                            }}
                          >
                            {details.icon} {details.label}
                          </span>
                          <span style={{ fontSize: '0.75rem', color: '#9898b0' }}>
                            {a.created_at ? new Date(a.created_at).toLocaleString() : 'Recent'}
                          </span>
                        </div>
                        <button
                          type="button"
                          onClick={() => onDismiss(a.id)}
                          title="Dismiss"
                          style={{
                            background: 'rgba(255,255,255,0.06)',
                            border: '1px solid rgba(255,255,255,0.12)',
                            color: '#c4c4d4',
                            borderRadius: '6px',
                            padding: '0.2rem 0.5rem',
                            fontSize: '0.72rem',
                            cursor: 'pointer',
                          }}
                        >
                          Dismiss
                        </button>
                      </div>

                      <h3
                        style={{
                          fontSize: '0.95rem',
                          fontWeight: 700,
                          color: '#ffffff',
                          margin: '0.2rem 0 0 0',
                        }}
                      >
                        {a.title}
                      </h3>

                      <p
                        style={{
                          fontSize: '0.825rem',
                          color: '#c4c4d4',
                          lineHeight: 1.5,
                          margin: 0,
                          whiteSpace: 'pre-wrap',
                          wordBreak: 'break-word',
                        }}
                      >
                        {a.content || a.body}
                      </p>
                    </div>
                  );
                })
              )}
            </div>

            {/* Modal Footer */}
            <div
              style={{
                padding: '0.75rem 1.25rem',
                borderTop: '1px solid #2a2a4a',
                background: '#1a1a32',
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center',
                fontSize: '0.75rem',
                color: '#9898b0',
              }}
            >
              <span>Press Esc to close</span>
              <button
                type="button"
                onClick={() => setShowModal(false)}
                style={{
                  background: '#252545',
                  border: '1px solid #353560',
                  color: '#ffffff',
                  borderRadius: '6px',
                  padding: '0.35rem 0.85rem',
                  fontSize: '0.78rem',
                  fontWeight: 600,
                  cursor: 'pointer',
                }}
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
