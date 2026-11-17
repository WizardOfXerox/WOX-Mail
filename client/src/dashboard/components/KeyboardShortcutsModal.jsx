import React, { useState } from 'react';

const SHORTCUT_GROUPS = [
  {
    category: 'Navigation & Selection',
    shortcuts: [
      { key: 'j', desc: 'Next email in list' },
      { key: 'k', desc: 'Previous email in list' },
      { key: 'Enter / o', desc: 'Open selected email' },
      { key: 'x', desc: 'Select / unselect message checkbox' },
      { key: '/', desc: 'Focus search bar' },
      { key: 'Esc', desc: 'Close open modal / Return to list' },
    ],
  },
  {
    category: 'Actions & Triage',
    shortcuts: [
      { key: 'e', desc: 'Archive selected email' },
      { key: '# / d', desc: 'Move to Trash' },
      { key: 's', desc: 'Star / Unstar email' },
      { key: 'u', desc: 'Mark as Unread' },
      { key: '!', desc: 'Mark as Spam' },
    ],
  },
  {
    category: 'Compose & Reply',
    shortcuts: [
      { key: 'c', desc: 'Compose new email (single key)' },
      { key: 'Ctrl + C', desc: 'Copy selected text (native clipboard)' },
      { key: 'r', desc: 'Reply to current sender' },
      { key: 'a', desc: 'Reply All' },
      { key: 'f', desc: 'Forward message' },
      { key: 'Ctrl + Enter', desc: 'Send message immediately' },
    ],
  },
  {
    category: 'Layout & Navigation',
    shortcuts: [
      { key: 'Ctrl + 1', desc: 'Single column list view' },
      { key: 'Ctrl + 2', desc: '3-Pane vertical split layout' },
      { key: 'Ctrl + 3', desc: 'Horizontal split layout' },
      { key: 'Ctrl + .', desc: 'Toggle side dock panel' },
      { key: 'Alt + A', desc: 'Open WoxApps & Suites switcher' },
      { key: 'Ctrl + k', desc: 'Open Command Palette' },
      { key: '?', desc: 'Show this keyboard shortcuts guide' },
    ],
  },
];

export default function KeyboardShortcutsModal({ isOpen, onClose }) {
  const [filter, setFilter] = useState('');

  if (!isOpen) return null;

  const filteredGroups = SHORTCUT_GROUPS.map((group) => ({
    ...group,
    shortcuts: group.shortcuts.filter(
      (s) =>
        s.key.toLowerCase().includes(filter.toLowerCase()) ||
        s.desc.toLowerCase().includes(filter.toLowerCase())
    ),
  })).filter((group) => group.shortcuts.length > 0);

  return (
    <div
      className="compose-overlay"
      onClick={onClose}
      role="dialog"
      aria-modal="true"
      aria-label="Keyboard Shortcuts"
      style={{ zIndex: 10001 }}
    >
      <div
        className="card"
        onClick={(e) => e.stopPropagation()}
        style={{
          position: 'relative',
          width: '100%',
          maxWidth: '680px',
          maxHeight: '85vh',
          padding: 0,
          overflow: 'hidden',
          display: 'flex',
          flexDirection: 'column',
          borderRadius: 'var(--radius-lg)',
          border: '1px solid var(--color-border)',
          background: 'var(--color-bg-card)',
          boxShadow: 'var(--shadow-lg)',
        }}
      >
        {/* Header */}
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            padding: '1rem 1.5rem',
            borderBottom: '1px solid var(--color-border)',
            background: 'var(--color-bg-elevated)',
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
            <span style={{ display: 'inline-flex', color: 'var(--color-primary-light)' }}>
              <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect width="20" height="16" x="2" y="4" rx="2"/><path d="M6 8h.001"/><path d="M10 8h.001"/><path d="M14 8h.001"/><path d="M18 8h.001"/><path d="M6 12h.001"/><path d="M10 12h.001"/><path d="M14 12h.001"/><path d="M18 12h.001"/><path d="M7 16h10"/></svg>
            </span>
            <div>
              <h2 style={{ margin: 0, fontSize: '1.1rem', fontWeight: 700, color: 'var(--color-text-primary)' }}>
                Keyboard Shortcuts
              </h2>
              <p style={{ margin: 0, fontSize: '0.75rem', color: 'var(--color-text-secondary)' }}>
                High-velocity navigation and triage shortcuts
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="btn btn-ghost btn-icon"
            aria-label="Close keyboard shortcuts"
            style={{ width: 32, height: 32 }}
          >
            ✕
          </button>
        </div>

        {/* Filter Input */}
        <div style={{ padding: '1rem 1.5rem 0.5rem' }}>
          <input
            type="text"
            className="input"
            placeholder="Search shortcuts (e.g. compose, archive, j/k)..."
            value={filter}
            onChange={(e) => setFilter(e.target.value)}
            autoFocus
            style={{ width: '100%', fontSize: '0.875rem' }}
          />
        </div>

        {/* Shortcuts Grid */}
        <div
          style={{
            flex: 1,
            overflowY: 'auto',
            padding: '1rem 1.5rem',
            display: 'flex',
            flexDirection: 'column',
            gap: '1.5rem',
            minHeight: 0,
          }}
        >
          {filteredGroups.length === 0 ? (
            <p style={{ textAlign: 'center', fontSize: '0.875rem', color: 'var(--color-text-tertiary)', padding: '2rem 0' }}>
              No shortcuts found for "{filter}"
            </p>
          ) : (
            filteredGroups.map((group) => (
              <div key={group.category}>
                <h3
                  style={{
                    fontSize: '0.72rem',
                    fontWeight: 700,
                    textTransform: 'uppercase',
                    letterSpacing: '0.06em',
                    color: 'var(--color-primary-light)',
                    margin: '0 0 0.75rem',
                  }}
                >
                  {group.category}
                </h3>
                <div
                  style={{
                    display: 'grid',
                    gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))',
                    gap: '0.5rem',
                  }}
                >
                  {group.shortcuts.map((s) => (
                    <div
                      key={s.key}
                      style={{
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'space-between',
                        gap: '0.75rem',
                        padding: '0.6rem 0.75rem',
                        borderRadius: 'var(--radius-md)',
                        background: 'var(--color-bg-elevated)',
                        border: '1px solid var(--color-border-subtle)',
                      }}
                    >
                      <span style={{ fontSize: '0.84rem', color: 'var(--color-text-primary)' }}>{s.desc}</span>
                      <kbd
                        className="mono"
                        style={{
                          padding: '0.2rem 0.5rem',
                          fontSize: '0.72rem',
                          fontWeight: 600,
                          color: 'var(--color-primary-light)',
                          background: 'var(--color-bg-page)',
                          border: '1px solid var(--color-border)',
                          borderRadius: '5px',
                          whiteSpace: 'nowrap',
                        }}
                      >
                        {s.key}
                      </kbd>
                    </div>
                  ))}
                </div>
              </div>
            ))
          )}
        </div>

        {/* Footer */}
        <div
          style={{
            padding: '0.75rem 1.5rem',
            borderTop: '1px solid var(--color-border)',
            background: 'var(--color-bg-elevated)',
            textAlign: 'right',
            fontSize: '0.75rem',
            color: 'var(--color-text-tertiary)',
          }}
        >
          Press <kbd className="mono" style={{ padding: '1px 6px', background: 'var(--color-bg-page)', border: '1px solid var(--color-border)', borderRadius: '4px', color: 'var(--color-text-secondary)' }}>Esc</kbd> or click outside to dismiss
        </div>
      </div>
    </div>
  );
}
