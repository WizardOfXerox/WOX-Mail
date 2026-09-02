import React from 'react';

/**
 * Visual status indicator for tracked outbound emails (✓ Delivered / ✓✓ Opened)
 */
export default function ReadReceiptIndicator({ openedAt, openCount }) {
  if (openedAt || openCount > 0) {
    return (
      <span
        title={`Read ${openCount} time(s)${openedAt ? ` · Last opened: ${new Date(openedAt).toLocaleString()}` : ''}`}
        style={{
          display: 'inline-flex',
          alignItems: 'center',
          gap: '0.2rem',
          color: 'var(--color-success)',
          fontSize: '0.75rem',
          fontWeight: 700,
          cursor: 'help'
        }}
      >
        <span>✓✓</span>
        <span style={{ fontSize: '0.6875rem' }}>Read</span>
      </span>
    );
  }

  return (
    <span
      title="Delivered (not yet opened)"
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        color: 'var(--color-text-tertiary)',
        fontSize: '0.75rem',
        cursor: 'help'
      }}
    >
      <span>✓</span>
      <span style={{ fontSize: '0.6875rem', marginLeft: '0.2rem' }}>Delivered</span>
    </span>
  );
}
