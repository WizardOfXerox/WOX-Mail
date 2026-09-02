import React from 'react';

/**
 * Badge component (unread counts, status indicators, labels).
 */
export default function Badge({ children, variant = 'default', size = 'sm', dot = false, className = '' }) {
  if (dot) {
    return <span className={`badge-dot badge-dot-${variant} ${className}`} />;
  }

  return (
    <span className={`badge badge-${variant} badge-${size} ${className}`}>
      {children}
    </span>
  );
}
