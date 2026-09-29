import React, { useState, useEffect, useRef, useCallback } from 'react';
import { createPortal } from 'react-dom';
import { useExperienceMode, EXPERIENCE_MODES } from '../hooks/useExperienceMode.js';

/**
 * 9-Dot Floating App Launcher & Workspace Hub (Google Workspace / Fastmail style).
 * Allows instant navigation across all WoxMail apps and quick persona switching.
 */
export default function AppSwitcher({ currentApp = 'mail', onSelectApp = null }) {
  const [isOpen, setIsOpen] = useState(false);
  const containerRef = useRef(null);
  const buttonRef = useRef(null);
  const popoverRef = useRef(null);
  const [popoverCoords, setPopoverCoords] = useState({ top: 0, left: 0 });
  const { mode, setMode, metadata, allModes } = useExperienceMode();

  const updatePosition = useCallback(() => {
    if (buttonRef.current) {
      const rect = buttonRef.current.getBoundingClientRect();
      const popoverWidth = 340;
      let left = rect.left;
      if (left + popoverWidth > window.innerWidth - 16) {
        left = Math.max(16, window.innerWidth - popoverWidth - 16);
      }
      let top = rect.bottom + 8;
      if (top + 450 > window.innerHeight && rect.top > 450) {
        top = Math.max(16, rect.top - 450);
      }
      setPopoverCoords({ top, left });
    }
  }, []);

  useEffect(() => {
    if (isOpen) {
      updatePosition();
      window.addEventListener('resize', updatePosition);
      window.addEventListener('scroll', updatePosition, true);
    }
    return () => {
      window.removeEventListener('resize', updatePosition);
      window.removeEventListener('scroll', updatePosition, true);
    };
  }, [isOpen, updatePosition]);

  // Close on outside click
  useEffect(() => {
    function handleClickOutside(e) {
      if (
        containerRef.current &&
        !containerRef.current.contains(e.target) &&
        popoverRef.current &&
        !popoverRef.current.contains(e.target)
      ) {
        setIsOpen(false);
      }
    }
    function handleKeyDown(e) {
      if (e.key === 'Escape' && isOpen) {
        setIsOpen(false);
      }
      // Ctrl+. or Alt+A toggles app switcher
      if ((e.ctrlKey || e.metaKey) && e.key === '.') {
        e.preventDefault();
        setIsOpen((prev) => !prev);
      }
    }

    if (isOpen) {
      document.addEventListener('mousedown', handleClickOutside);
      document.addEventListener('keydown', handleKeyDown);
    }
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
      document.removeEventListener('keydown', handleKeyDown);
    };
  }, [isOpen]);

  const handleLaunch = (appId, externalUrl = null) => {
    setIsOpen(false);
    if (onSelectApp) {
      onSelectApp(appId);
    } else if (externalUrl) {
      window.location.href = externalUrl;
    }
  };

  const apps = [
    {
      id: 'mail',
      label: 'Mailbox',
      tagline: 'Core sovereign email',
      icon: (
        <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <polyline points="22 12 16 12 14 15 10 15 8 12 2 12" />
          <path d="M5.45 5.11 2 12v6a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2v-6l-3.45-6.89A2 2 0 0 0 16.76 4H7.24a2 2 0 0 0-1.79 1.11z" />
        </svg>
      ),
      color: '#8b5cf6',
      bg: 'rgba(139, 92, 246, 0.12)',
      url: '/dashboard',
    },
    {
      id: 'gatekeeper',
      label: 'The Gatekeeper',
      tagline: 'Cold sender screening',
      icon: (
        <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" />
          <circle cx="12" cy="11" r="2" />
        </svg>
      ),
      color: '#f59e0b',
      bg: 'rgba(245, 158, 11, 0.12)',
    },
    {
      id: 'campaigns',
      label: 'Broadcasts & Drips',
      tagline: 'Mailing lists & campaigns',
      icon: (
        <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <path d="m3 11 18-5v12L3 14v-3z" />
          <path d="M11.6 16.8a3 3 0 1 1-5.8-1.6" />
        </svg>
      ),
      color: '#ec4899',
      bg: 'rgba(236, 72, 153, 0.12)',
    },
    {
      id: 'kanban',
      label: 'Contacts & CRM',
      tagline: 'Dossiers & deal pipeline',
      icon: (
        <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <rect width="18" height="18" x="3" y="3" rx="2" />
          <path d="M8 7v7" />
          <path d="M12 7v4" />
          <path d="M16 7v9" />
        </svg>
      ),
      color: '#10b981',
      bg: 'rgba(16, 185, 129, 0.12)',
    },
    {
      id: 'tempmail',
      label: 'Disposable Mail',
      tagline: 'Zero-trace burner inbox',
      icon: (
        <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2" />
        </svg>
      ),
      color: '#06b6d4',
      bg: 'rgba(6, 182, 212, 0.12)',
      url: '/tempmail',
    },
    {
      id: 'futureme',
      label: 'Letters to Future',
      tagline: 'Time-capsule deliveries',
      icon: (
        <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <circle cx="12" cy="12" r="10" />
          <polyline points="12 6 12 12 14 14" />
        </svg>
      ),
      color: '#3b82f6',
      bg: 'rgba(59, 130, 246, 0.12)',
      url: '/futureme',
    },
    {
      id: 'developer',
      label: 'Developer Studio',
      tagline: 'REST API, keys & webhooks',
      icon: (
        <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <polyline points="16 18 22 12 16 6" />
          <polyline points="8 6 2 12 8 18" />
        </svg>
      ),
      color: '#6366f1',
      bg: 'rgba(99, 102, 241, 0.12)',
      url: '/settings#developer',
    },
    {
      id: 'support',
      label: 'Helpdesk & Tickets',
      tagline: 'Customer support desk',
      icon: (
        <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <circle cx="12" cy="12" r="10" />
          <path d="M9.09 9a3 3 0 0 1 5.83 1c0 2-3 3-3 3" />
          <line x1="12" y1="17" x2="12.01" y2="17" />
        </svg>
      ),
      color: '#eab308',
      bg: 'rgba(234, 179, 8, 0.12)',
    },
    {
      id: 'settings',
      label: 'System Settings',
      tagline: 'Preferences & security',
      icon: (
        <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <path d="M12.22 2h-.44a2 2 0 0 0-2 2v.18a2 2 0 0 1-1 1.73l-.43.25a2 2 0 0 1-2 0l-.15-.08a2 2 0 0 0-2.73.73l-.22.38a2 2 0 0 0 .73 2.73l.15.1a2 2 0 0 1 1 1.72v.51a2 2 0 0 1-1 1.74l-.15.09a2 2 0 0 0-.73 2.73l.22.38a2 2 0 0 0 2.73.73l.15-.08a2 2 0 0 1 2 0l.43.25a2 2 0 0 1 1 1.73V20a2 2 0 0 0 2 2h.44a2 2 0 0 0 2-2v-.18a2 2 0 0 1 1-1.73l.43-.25a2 2 0 0 1 2 0l.15.08a2 2 0 0 0 2.73-.73l.22-.39a2 2 0 0 0-.73-2.73l-.15-.08a2 2 0 0 1-1-1.74v-.5a2 2 0 0 1 1-1.74l.15-.09a2 2 0 0 0 .73-2.73l-.22-.38a2 2 0 0 0-2.73-.73l-.15.08a2 2 0 0 1-2 0l-.43-.25a2 2 0 0 1-1-1.73V4a2 2 0 0 0-2-2z" />
          <circle cx="12" cy="12" r="3" />
        </svg>
      ),
      color: '#94a3b8',
      bg: 'rgba(148, 163, 184, 0.12)',
      url: '/settings',
    },
  ];

  return (
    <div className="app-switcher-container" ref={containerRef} style={{ position: 'relative' }}>
      {/* 9-Dot Launcher Button */}
      <button
        ref={buttonRef}
        type="button"
        className={`btn btn-ghost btn-icon app-switcher-btn ${isOpen ? 'active' : ''}`}
        onClick={() => setIsOpen(!isOpen)}
        title="WoxApps & Suites (Ctrl+.)"
        aria-label="WoxApps and Suites launcher"
        style={{
          width: '36px',
          height: '36px',
          padding: 0,
          display: 'inline-flex',
          alignItems: 'center',
          justifyContent: 'center',
          borderRadius: '8px',
          border: '1px solid var(--color-border-subtle, rgba(255, 255, 255, 0.1))',
          background: isOpen ? 'var(--color-primary-glow, rgba(124, 58, 237, 0.2))' : 'transparent',
          color: isOpen ? 'var(--color-primary-light, #a78bfa)' : 'var(--color-text-secondary, #cbd5e1)',
          transition: 'all 0.18s ease',
        }}
      >
        <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor">
          <circle cx="5" cy="5" r="2" />
          <circle cx="12" cy="5" r="2" />
          <circle cx="19" cy="5" r="2" />
          <circle cx="5" cy="12" r="2" />
          <circle cx="12" cy="12" r="2" />
          <circle cx="19" cy="12" r="2" />
          <circle cx="5" cy="19" r="2" />
          <circle cx="12" cy="19" r="2" />
          <circle cx="19" cy="19" r="2" />
        </svg>
      </button>

      {/* Floating Popover Drawer */}
      {isOpen && typeof document !== 'undefined' && createPortal(
        <div
          ref={popoverRef}
          className="app-switcher-popover animate-fade-in"
          style={{
            position: 'fixed',
            top: `${popoverCoords.top}px`,
            left: `${popoverCoords.left}px`,
            width: '340px',
            maxWidth: 'calc(100vw - 32px)',
            background: 'var(--color-surface, #13131f)',
            border: '1px solid var(--color-border, rgba(124, 58, 237, 0.28))',
            borderRadius: '14px',
            boxShadow: '0 16px 40px rgba(0, 0, 0, 0.75), 0 0 24px rgba(124, 58, 237, 0.25)',
            padding: '1rem',
            zIndex: 999999,
            backdropFilter: 'blur(20px)',
            WebkitBackdropFilter: 'blur(20px)',
          }}
        >
          {/* Header */}
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '0.75rem', paddingBottom: '0.5rem', borderBottom: '1px solid var(--color-border-subtle, rgba(255,255,255,0.08))' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
              <span style={{ fontSize: '1rem' }}>{metadata.icon}</span>
              <span style={{ fontWeight: 700, fontSize: '0.88rem', color: 'var(--color-text-primary, #fff)' }}>WoxMail Suites</span>
            </div>
            <span
              style={{
                fontSize: '0.7rem',
                fontWeight: 600,
                padding: '2px 8px',
                borderRadius: '12px',
                background: 'rgba(124, 58, 237, 0.2)',
                color: 'var(--color-primary-light, #c084fc)',
                border: '1px solid rgba(124, 58, 237, 0.4)',
              }}
            >
              {metadata.badge} Mode
            </span>
          </div>

          {/* Quick Experience Mode Switcher Pills */}
          <div style={{ display: 'flex', gap: '4px', background: 'rgba(0, 0, 0, 0.25)', padding: '3px', borderRadius: '8px', marginBottom: '0.9rem' }}>
            {allModes.map((m) => (
              <button
                key={m.id}
                type="button"
                onClick={() => setMode(m.id)}
                title={m.tagline}
                style={{
                  flex: 1,
                  fontSize: '0.72rem',
                  fontWeight: mode === m.id ? 700 : 500,
                  padding: '4px 6px',
                  borderRadius: '6px',
                  border: 'none',
                  cursor: 'pointer',
                  background: mode === m.id ? 'var(--color-primary, #7c3aed)' : 'transparent',
                  color: mode === m.id ? '#fff' : 'var(--color-text-tertiary, #94a3b8)',
                  transition: 'all 0.15s ease',
                  whiteSpace: 'nowrap',
                }}
              >
                {m.icon} {m.badge}
              </button>
            ))}
          </div>

          {/* 3x3 App Grid */}
          <div
            style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(3, 1fr)',
              gap: '8px',
            }}
          >
            {apps.map((app) => {
              const isActive = currentApp === app.id;
              return (
                <button
                  key={app.id}
                  type="button"
                  onClick={() => handleLaunch(app.id, app.url)}
                  title={app.tagline}
                  style={{
                    display: 'flex',
                    flexDirection: 'column',
                    alignItems: 'center',
                    justifyContent: 'center',
                    padding: '0.65rem 0.4rem',
                    borderRadius: '10px',
                    border: isActive ? `1px solid ${app.color}` : '1px solid transparent',
                    background: isActive ? app.bg : 'rgba(255, 255, 255, 0.02)',
                    cursor: 'pointer',
                    transition: 'all 0.15s ease',
                    textAlign: 'center',
                    gap: '4px',
                  }}
                  onMouseEnter={(e) => {
                    if (!isActive) {
                      e.currentTarget.style.background = 'rgba(255, 255, 255, 0.06)';
                      e.currentTarget.style.transform = 'translateY(-1px)';
                    }
                  }}
                  onMouseLeave={(e) => {
                    if (!isActive) {
                      e.currentTarget.style.background = 'rgba(255, 255, 255, 0.02)';
                      e.currentTarget.style.transform = 'translateY(0)';
                    }
                  }}
                >
                  <div
                    style={{
                      width: '36px',
                      height: '36px',
                      borderRadius: '8px',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      background: app.bg,
                      color: app.color,
                      marginBottom: '2px',
                    }}
                  >
                    {app.icon}
                  </div>
                  <span
                    style={{
                      fontSize: '0.75rem',
                      fontWeight: isActive ? 700 : 500,
                      color: isActive ? '#fff' : 'var(--color-text-secondary, #cbd5e1)',
                      lineHeight: 1.15,
                    }}
                  >
                    {app.label}
                  </span>
                </button>
              );
            })}
          </div>

          {/* Footer hint */}
          <div style={{ marginTop: '0.75rem', paddingTop: '0.5rem', borderTop: '1px solid var(--color-border-subtle, rgba(255,255,255,0.06))', textAlign: 'center', fontSize: '0.68rem', color: 'var(--color-text-tertiary, #64748b)' }}>
            Tip: Press <kbd style={{ padding: '1px 4px', background: 'rgba(255,255,255,0.1)', borderRadius: '3px' }}>Ctrl+.</kbd> anywhere to open suites
          </div>
        </div>,
        document.body
      )}
    </div>
  );
}
