import React, { useEffect, useRef, useState } from 'react';

/**
 * ContextMenu Component:
 * - Desktop: Floating glassmorphic popover with viewport collision avoidance, nested flyout submenus, and keyboard navigation.
 * - Mobile (<= 768px): Bottom Slide-Up Action Sheet with smooth backdrop, nested drilldown submenus, and large touch targets.
 *
 * @param {object} props
 * @param {number} props.x - clientX
 * @param {number} props.y - clientY
 * @param {Array<{label: string, icon?: React.ReactNode, onClick?: Function, danger?: boolean, shortcut?: string, divider?: boolean, children?: Array<any>}>} props.items
 * @param {Function} props.onClose
 * @param {string} [props.title] - optional header title for mobile action sheet
 */
export default function ContextMenu({ x, y, items = [], onClose, title }) {
  const menuRef = useRef(null);
  const [isMobile, setIsMobile] = useState(() => typeof window !== 'undefined' && window.innerWidth <= 768);
  const [pos, setPos] = useState({ left: x, top: y });
  const [focusedIdx, setFocusedIdx] = useState(0);

  // Submenu state: for desktop flyouts and mobile drilldowns
  const [activeSubmenuIdx, setActiveSubmenuIdx] = useState(null);
  const [drilldownStack, setDrilldownStack] = useState([]); // for mobile drilldown { title, items }

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
      const currentList = drilldownStack.length > 0 ? drilldownStack[drilldownStack.length - 1].items : items;
      const actionItems = currentList.filter((i) => !i.divider);

      if (e.key === 'Escape') {
        e.preventDefault();
        if (drilldownStack.length > 0) {
          setDrilldownStack((prev) => prev.slice(0, -1));
        } else if (activeSubmenuIdx !== null) {
          setActiveSubmenuIdx(null);
        } else {
          onClose();
        }
      } else if (e.key === 'ArrowDown') {
        e.preventDefault();
        setFocusedIdx((prev) => (prev + 1) % actionItems.length);
      } else if (e.key === 'ArrowUp') {
        e.preventDefault();
        setFocusedIdx((prev) => (prev - 1 + actionItems.length) % actionItems.length);
      } else if (e.key === 'ArrowRight') {
        const item = actionItems[focusedIdx];
        if (item && item.children && item.children.length > 0) {
          e.preventDefault();
          setActiveSubmenuIdx(focusedIdx);
        }
      } else if (e.key === 'ArrowLeft') {
        if (activeSubmenuIdx !== null) {
          e.preventDefault();
          setActiveSubmenuIdx(null);
        }
      } else if (e.key === 'Enter') {
        e.preventDefault();
        const item = actionItems[focusedIdx];
        if (item) {
          if (item.children && item.children.length > 0) {
            setActiveSubmenuIdx(activeSubmenuIdx === focusedIdx ? null : focusedIdx);
          } else if (item.onClick) {
            item.onClick();
            onClose();
          }
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
  }, [onClose, items, focusedIdx, activeSubmenuIdx, drilldownStack]);

  // Current items for mobile action sheet
  const activeMobileItems = drilldownStack.length > 0
    ? drilldownStack[drilldownStack.length - 1].items
    : items;
  const activeMobileTitle = drilldownStack.length > 0
    ? drilldownStack[drilldownStack.length - 1].title
    : (title || 'Actions');

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
            display: 'flex',
            flexDirection: 'column',
            gap: '0.5rem',
            animation: 'slideUp 0.2s cubic-bezier(0.16, 1, 0.3, 1)',
            boxShadow: '0 -8px 30px rgba(0, 0, 0, 0.5)',
          }}
          onClick={(e) => e.stopPropagation()}
        >
          {/* Grab Bar */}
          <div
            style={{
              width: 36,
              height: 4,
              borderRadius: 2,
              background: 'var(--color-border)',
              margin: '0 auto 0.5rem auto',
            }}
          />

          {/* Header with Back Button for Drilldown */}
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '0 0.25rem 0.5rem 0.25rem', borderBottom: '1px solid var(--color-border)' }}>
            {drilldownStack.length > 0 ? (
              <button
                type="button"
                className="btn btn-ghost btn-sm"
                style={{ padding: '0.25rem 0.5rem', display: 'flex', alignItems: 'center', gap: '0.25rem' }}
                onClick={() => setDrilldownStack((prev) => prev.slice(0, -1))}
              >
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="15 18 9 12 15 6"/></svg>
                <span>Back</span>
              </button>
            ) : (
              <span style={{ fontSize: '0.875rem', fontWeight: 600, color: 'var(--color-text-secondary)' }}>
                {activeMobileTitle}
              </span>
            )}
            <button
              type="button"
              className="btn btn-ghost btn-sm"
              onClick={onClose}
              style={{ padding: '0.25rem' }}
              aria-label="Close"
            >
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
            </button>
          </div>

          {/* Items List */}
          <div style={{ overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: '0.25rem', paddingBottom: '0.5rem' }}>
            {activeMobileItems.map((item, idx) => {
              if (item.divider) {
                return <div key={`div-${idx}`} style={{ height: 1, background: 'var(--color-border)', margin: '0.25rem 0' }} />;
              }

              const hasChildren = item.children && item.children.length > 0;

              return (
                <button
                  key={idx}
                  type="button"
                  onClick={() => {
                    if (hasChildren) {
                      setDrilldownStack((prev) => [...prev, { title: item.label, items: item.children }]);
                    } else if (item.onClick) {
                      item.onClick();
                      onClose();
                    }
                  }}
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    width: '100%',
                    padding: '0.75rem 1rem',
                    background: 'var(--color-bg-hover)',
                    border: '1px solid var(--color-border)',
                    borderRadius: 'var(--radius-md)',
                    color: item.danger ? 'var(--color-error)' : 'var(--color-text-primary)',
                    fontSize: '0.9375rem',
                    fontWeight: 500,
                    cursor: 'pointer',
                    textAlign: 'left',
                    minHeight: 48,
                  }}
                >
                  <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
                    {item.icon && (
                      <span style={{ display: 'inline-flex', alignItems: 'center', color: item.danger ? 'var(--color-error)' : 'var(--color-primary-light)' }}>
                        {item.icon}
                      </span>
                    )}
                    <span>{item.label}</span>
                  </div>
                  {hasChildren ? (
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ color: 'var(--color-text-tertiary)' }}><polyline points="9 18 15 12 9 6"/></svg>
                  ) : item.shortcut ? (
                    <span className="mono text-tertiary" style={{ fontSize: '0.75rem' }}>
                      {item.shortcut}
                    </span>
                  ) : null}
                </button>
              );
            })}

            <button
              type="button"
              className="btn btn-secondary"
              style={{ width: '100%', marginTop: '0.5rem', minHeight: 48, justifyContent: 'center' }}
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
  let actionCounter = -1;

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
        const hasChildren = item.children && item.children.length > 0;
        const isSubmenuOpen = activeSubmenuIdx === idx;

        return (
          <div
            key={idx}
            style={{ position: 'relative' }}
            onMouseEnter={() => {
              setFocusedIdx(actionCounter);
              if (hasChildren) setActiveSubmenuIdx(idx);
              else setActiveSubmenuIdx(null);
            }}
          >
            <button
              type="button"
              onClick={() => {
                if (hasChildren) {
                  setActiveSubmenuIdx(isSubmenuOpen ? null : idx);
                } else if (item.onClick) {
                  item.onClick();
                  onClose();
                }
              }}
              style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                width: '100%',
                padding: '0.45rem 0.65rem',
                background: (isFocused || isSubmenuOpen) ? 'var(--color-bg-hover)' : 'transparent',
                border: 'none',
                borderRadius: 'var(--radius-sm)',
                color: item.danger ? 'var(--color-error)' : 'var(--color-text-primary)',
                fontSize: '0.8125rem',
                fontWeight: 500,
                cursor: 'pointer',
                textAlign: 'left',
                transition: 'background var(--transition-fast)',
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
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.25rem' }}>
                {item.shortcut && (
                  <span className="mono text-tertiary" style={{ fontSize: '0.6875rem' }}>
                    {item.shortcut}
                  </span>
                )}
                {hasChildren && (
                  <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ color: 'var(--color-text-tertiary)' }}><polyline points="9 18 15 12 9 6"/></svg>
                )}
              </div>
            </button>

            {/* Desktop Nested Flyout Submenu */}
            {hasChildren && isSubmenuOpen && (
              <div
                style={{
                  position: 'absolute',
                  left: '100%',
                  top: 0,
                  marginLeft: 4,
                  minWidth: 180,
                  background: 'var(--color-bg-elevated)',
                  border: '1px solid var(--color-border)',
                  borderRadius: 'var(--radius-md)',
                  boxShadow: 'var(--shadow-lg)',
                  padding: '0.35rem',
                  zIndex: 10000,
                  backdropFilter: 'blur(12px)',
                }}
              >
                {item.children.map((subItem, sIdx) => {
                  if (subItem.divider) {
                    return <div key={`sdiv-${sIdx}`} style={{ height: 1, background: 'var(--color-border)', margin: '0.25rem 0' }} />;
                  }
                  return (
                    <button
                      key={sIdx}
                      type="button"
                      onClick={() => {
                        if (subItem.onClick) subItem.onClick();
                        onClose();
                      }}
                      style={{
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'space-between',
                        width: '100%',
                        padding: '0.45rem 0.65rem',
                        background: 'transparent',
                        border: 'none',
                        borderRadius: 'var(--radius-sm)',
                        color: subItem.danger ? 'var(--color-error)' : 'var(--color-text-primary)',
                        fontSize: '0.8125rem',
                        fontWeight: 500,
                        cursor: 'pointer',
                        textAlign: 'left',
                        transition: 'background var(--transition-fast)',
                      }}
                      onMouseEnter={(e) => {
                        e.currentTarget.style.background = 'var(--color-bg-hover)';
                      }}
                      onMouseLeave={(e) => {
                        e.currentTarget.style.background = 'transparent';
                      }}
                    >
                      <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', overflow: 'hidden' }}>
                        {subItem.icon && (
                          <span style={{ display: 'inline-flex', alignItems: 'center', color: subItem.danger ? 'var(--color-error)' : 'var(--color-primary-light)' }}>
                            {subItem.icon}
                          </span>
                        )}
                        <span className="truncate">{subItem.label}</span>
                      </div>
                      {subItem.shortcut && (
                        <span className="mono text-tertiary" style={{ fontSize: '0.6875rem' }}>
                          {subItem.shortcut}
                        </span>
                      )}
                    </button>
                  );
                })}
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}
