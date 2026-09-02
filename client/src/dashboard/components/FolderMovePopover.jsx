import { getFolderIcon } from './Sidebar.jsx';
import React, { useEffect, useRef } from 'react';

const FOLDER_TARGETS = [
  { name: 'INBOX', label: 'Inbox' },
  { name: 'Archive', label: 'Archive' },
  { name: 'The Feed', label: 'The Feed' },
  { name: 'Paper Trail', label: 'Paper Trail' },
  { name: 'Trash', label: 'Trash' },
  { name: 'Spam', label: 'Spam' },
];

export default function FolderMovePopover({
  folders = [],
  currentFolder = 'INBOX',
  onSelectFolder,
  onClose,
  anchorRect,
}) {
  const popoverRef = useRef(null);

  useEffect(() => {
    const handleOutsideClick = (e) => {
      if (popoverRef.current && !popoverRef.current.contains(e.target)) {
        onClose();
      }
    };
    const handleEscape = (e) => {
      if (e.key === 'Escape') onClose();
    };

    document.addEventListener('mousedown', handleOutsideClick);
    document.addEventListener('keydown', handleEscape);
    return () => {
      document.removeEventListener('mousedown', handleOutsideClick);
      document.removeEventListener('keydown', handleEscape);
    };
  }, [onClose]);

  // Combine system folders with custom user folders
  const allTargets = [...FOLDER_TARGETS];
  (folders || []).forEach((f) => {
    const name = typeof f === 'string' ? f : f.name || f.path;
    if (name && !allTargets.some((t) => t.name.toLowerCase() === name.toLowerCase()) && name !== 'Sent' && name !== 'Drafts') {
      allTargets.push({ name, label: name });
    }
  });

  const style = anchorRect
    ? {
        position: 'fixed',
        top: Math.min(window.innerHeight - 300, Math.max(10, anchorRect.bottom + 6)),
        left: Math.min(window.innerWidth - 220, Math.max(10, anchorRect.left)),
        zIndex: 9999,
      }
    : {
        position: 'absolute',
        top: '100%',
        left: 0,
        zIndex: 9999,
        marginTop: '6px',
      };

  return (
    <div
      ref={popoverRef}
      className="folder-move-popover card"
      style={{
        ...style,
        width: 200,
        padding: '0.4rem',
        background: 'var(--color-bg-card)',
        border: '1px solid var(--color-border)',
        borderRadius: 'var(--radius-md)',
        boxShadow: '0 8px 24px rgba(0,0,0,0.5), 0 0 12px rgba(124, 58, 237, 0.25)',
        animation: 'fadeIn 0.15s ease',
      }}
      role="menu"
      aria-label="Move to folder"
    >
      <div style={{ padding: '0.35rem 0.5rem', fontSize: '0.72rem', fontWeight: 700, color: 'var(--color-text-tertiary)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
        Move to folder:
      </div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: '0.2rem', maxHeight: 220, overflowY: 'auto' }}>
        {allTargets.map((f) => {
          const isCurrent = f.name.toLowerCase() === (currentFolder || '').toLowerCase();
          return (
            <button
              key={f.name}
              type="button"
              className="folder-move-item"
              disabled={isCurrent}
              onClick={() => {
                onSelectFolder(f.name);
                onClose();
              }}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: '0.5rem',
                width: '100%',
                padding: '0.4rem 0.6rem',
                border: 'none',
                background: isCurrent ? 'var(--color-bg-hover)' : 'transparent',
                color: isCurrent ? 'var(--color-text-tertiary)' : 'var(--color-text-primary)',
                borderRadius: 'var(--radius-sm)',
                fontSize: '0.8125rem',
                fontWeight: isCurrent ? 400 : 500,
                textAlign: 'left',
                cursor: isCurrent ? 'default' : 'pointer',
                transition: 'background 120ms ease, color 120ms ease',
              }}
            >
              <span style={{ display: 'inline-flex', alignItems: 'center' }}>{getFolderIcon(f.name)}</span>
              <span style={{ flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                {f.label}
              </span>
              {isCurrent && <span style={{ fontSize: '0.7rem', color: 'var(--color-text-tertiary)' }}>(current)</span>}
            </button>
          );
        })}
      </div>
    </div>
  );
}
