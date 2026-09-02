import React, { useEffect, useRef, useState } from 'react';

/**
 * ContextMenu Component:
 * - Desktop: Floating glassmorphic popover with viewport collision avoidance and keyboard navigation.
 * - Mobile (<= 768px): Bottom Slide-Up Action Sheet with smooth backdrop and large touch targets.
 *
 * @param {object} props
 * @param {number} props.x - clientX
 * @param {number} props.y - clientY
 * @param {Array<{label: string, icon?: React.ReactNode, onClick: Function, danger?: boolean, shortcut?: string, divider?: boolean}>} props.items
 * @param {Function} props.onClose
 * @param {string} [props.title] - optional header title for mobile action sheet
 */
export default function ContextMenu({ x, y, items = [], onClose, title }) {
  const menuRef = useRef(null);
  const [isMobile, setIsMobile] = useState(() => typeof window !== 'undefined' && window.innerWidth <= 768);
  const [pos, setPos] = useState({ left: x, top: y });
  const [focusedIdx, setFocusedIdx] = useState(0);

  // Resize listener for mobile switch
  useEffect(() => {
    const handleResize = () => setIsMobile(window.innerWidth <= 768);
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, []);

  // Viewport collision bounds calculation for desktop
  useEffect(() => {
    if (isMobile) return;
    if (menuRef.current) {
      const rect = menuRef.current.getBoundingClientRect();
      const pad = 12;
      let left = x;
      let top = y;

      if (left + rect.width > window.innerWidth - pad) {
        left = Math.max(pad, window.innerWidth - rect.width - pad);
      }
      if (top + rect.height > window.innerHeight - pad) {
        top = Math.max(pad, window.innerHeight - rect.height - pad);
      }

      setPos({ left, top });
    }
  }, [x, y, isMobile]);

  // Click outside & Escape / Arrow keyboard handling
  useEffect(() => {
    const handleClickOutside = (e) => {
      if (menuRef.current && !menuRef.current.contains(e.target)) {
        onClose();
      }
    };

    const handleKeyDown = (e) => {
      if (e.key === 'Escape') {
        e.preventDefault();
        onClose();
      } else if (e.key === 'ArrowDown') {
        e.preventDefault();
        setFocusedIdx((prev) => (prev + 1) % items.filter((i) => !i.divider).length);
      } else if (e.key === 'ArrowUp') {
        e.preventDefault();
        const nonDividers = items.filter((i) => !i.divider).length;
        setFocusedIdx((prev) => (prev - 1 + nonDividers) % nonDividers);
      } else if (e.key === 'Enter') {
        e.preventDefault();
        const actionItems = items.filter((i) => !i.divider);
        if (actionItems[focusedIdx]?.onClick) {
          actionItems[focusedIdx].onClick();
          onClose();
        }
      }
    };

    window.addEventListener('mousedown', handleClickOutside);
    window.addEventListener('touchstart', handleClickOutside);
    window.addEventListener('keydown', handleKeyDown);
    window.addEventListener('scroll', onClose, true);

    return () => {
      window.removeEventListener('mousedown', handleClickOutside);
      window.removeEventListener('touchstart', handleClickOutside);
      window.removeEventListener('keydown', handleKeyDown);
      window.removeEventListener('scroll', onClose, true);
    };
  }, [onClose, items, focusedIdx]);

  let actionCounter = -1;

  if (isMobile) {
    return (
      <div
        className="context-menu-overlay"
        style={{
          position: 'fixed',
          inset: 0,
          zIndex: 9999,
          background: 'rgba(0, 0, 0, 0.65)',
          backdropFilter: 'blur(4px)',
          display: 'flex',
          flexDirection: 'column',
          justifyContent: 'flex-end',
          animation: 'fadeIn 0.15s ease-out',
        }}
        onClick={(e) => {
          if (e.target === e.currentTarget) onClose();
        }}
      >
        <div
          ref={menuRef}
          className="context-menu-sheet"
          style={{
            background: 'var(--color-bg-card)',
            borderTopLeftRadius: 'var(--radius-lg)',
            borderTopRightRadius: 'var(--radius-lg)',
            borderTop: '1px solid var(--color-border)',
            padding: '1rem',
            maxHeight: '80vh',
            overflowY: 'auto',
            animation: 'slideUp 0.2s cubic-bezier(0.16, 1, 0.3, 1)',
            boxShadow: '0 -8px 32px rgba(0, 0, 0, 0.6)',
          }}
          onClick={(e) => e.stopPropagation()}
        >
          {/* Grab Bar */}
          <div
            style={{
              width: 36,
              height: 4,
              background: 'var(--color-border)',
              borderRadius: 2,
              margin: '0 auto 0.75rem auto',
            }}
          />

          {title && (
            <div
              style={{
                fontSize: '0.8125rem',
                fontWeight: 700,
                color: 'var(--color-text-secondary)',
                marginBottom: '0.75rem',
                textTransform: 'uppercase',
                letterSpacing: '0.5px',
                textAlign: 'center',
              }}
            >
              {title}
            </div>
          )}

          <div style={{ display: 'flex', flexDirection: 'column', gap: '0.35rem' }}>
            {items.map((item, idx) => {
              if (item.divider) {
                return (
                  <div
                    key={`div-${idx}`}
                    style={{
                      height: 1,
                      background: 'var(--color-border)',
                      margin: '0.35rem 0',
                    }}
                  />
                );
              }

              return (
                <button
                  key={idx}
                  type="button"
                  onClick={() => {
                    if (item.onClick) item.onClick();
                    onClose();
                  }}
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    width: '100%',
                    padding: '0.85rem 1rem',
                    background: 'transparent',
                    border: 'none',
                    borderRadius: 'var(--radius-md)',
                    color: item.danger ? 'var(--color-error)' : 'var(--color-text-primary)',
                    fontSize: '0.9375rem',
                    fontWeight: 500,
                    cursor: 'pointer',
                    minHeight: 48,
                    textAlign: 'left',
                    transition: 'background var(--transition-fast)',
                  }}
                  onMouseEnter={(e) => (e.currentTarget.style.background = 'var(--color-bg-hover)')}
                  onMouseLeave={(e) => (e.currentTarget.style.background = 'transparent')}
                >
                  <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
                    {item.icon && (
                      <span style={{ display: 'inline-flex', alignItems: 'center', color: item.danger ? 'var(--color-error)' : 'var(--color-primary-light)' }}>
                        {item.icon}
                      </span>
                    )}
                    <span>{item.label}</span>
                  </div>
                  {item.shortcut && (
                    <span className="mono text-tertiary" style={{ fontSize: '0.75rem' }}>
                      {item.shortcut}
                    </span>
                  )}
                </button>
              );
            })}

            <button
              type="button"
              className="btn btn-secondary"
              style={{ width: '100%', marginTop: '0.5rem', minHeight: 44, justifyContent: 'center' }}
              onClick={onClose}
            >
              Cancel
            </button>
          </div>
        </div>
      </div>
    );
  }

  // Desktop Floating Popover
  return (
    <div
      ref={menuRef}
      className="context-menu-popover"
      style={{
        position: 'fixed',
        left: pos.left,
        top: pos.top,
        zIndex: 9999,
        minWidth: 220,
        maxWidth: 320,
        background: 'var(--color-bg-elevated)',
        border: '1px solid var(--color-border)',
        borderRadius: 'var(--radius-md)',
        boxShadow: 'var(--shadow-lg)',
        padding: '0.35rem',
        animation: 'fadeIn 0.12s ease-out',
        backdropFilter: 'blur(12px)',
        userSelect: 'none',
      }}
      onClick={(e) => e.stopPropagation()}
    >
      {items.map((item, idx) => {
        if (item.divider) {
          return (
            <div
              key={`div-${idx}`}
              style={{
                height: 1,
                background: 'var(--color-border)',
                margin: '0.25rem 0',
              }}
            />
          );
        }

        actionCounter++;
        const isFocused = actionCounter === focusedIdx;

        return (
          <button
            key={idx}
            type="button"
            onClick={() => {
              if (item.onClick) item.onClick();
              onClose();
            }}
            style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              width: '100%',
              padding: '0.45rem 0.65rem',
              background: isFocused ? 'var(--color-bg-hover)' : 'transparent',
              border: 'none',
              borderRadius: 'var(--radius-sm)',
              color: item.danger ? 'var(--color-error)' : 'var(--color-text-primary)',
              fontSize: '0.8125rem',
              fontWeight: 500,
              cursor: 'pointer',
              textAlign: 'left',
              transition: 'background var(--transition-fast)',
            }}
            onMouseEnter={(e) => {
              e.currentTarget.style.background = 'var(--color-bg-hover)';
              setFocusedIdx(actionCounter);
            }}
            onMouseLeave={(e) => {
              if (!isFocused) e.currentTarget.style.background = 'transparent';
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', overflow: 'hidden' }}>
              {item.icon && (
                <span style={{ display: 'inline-flex', alignItems: 'center', color: item.danger ? 'var(--color-error)' : 'var(--color-primary-light)' }}>
                  {item.icon}
                </span>
              )}
              <span className="truncate">{item.label}</span>
            </div>
            {item.shortcut && (
              <span className="mono text-tertiary" style={{ fontSize: '0.6875rem', marginLeft: '0.75rem' }}>
                {item.shortcut}
              </span>
            )}
          </button>
        );
      })}
    </div>
  );
}
