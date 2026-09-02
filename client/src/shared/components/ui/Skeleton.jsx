import React from 'react';

/**
 * Skeleton loading placeholder.
 * @param {'text'|'circle'|'rect'} [variant='text']
 * @param {number} [lines=1] - Number of text lines
 * @param {string} [width] - CSS width
 * @param {string} [height] - CSS height
 */
export default function Skeleton({ variant = 'text', lines = 1, width, height, className = '' }) {
  if (variant === 'circle') {
    return (
      <div
        className={`skeleton skeleton-circle ${className}`}
        style={{ width: width || '40px', height: height || '40px' }}
      />
    );
  }

  if (variant === 'rect') {
    return (
      <div
        className={`skeleton skeleton-rect ${className}`}
        style={{ width: width || '100%', height: height || '100px' }}
      />
    );
  }

  // Text lines
  return (
    <div className={`skeleton-lines ${className}`}>
      {Array.from({ length: lines }, (_, i) => (
        <div
          key={i}
          className="skeleton skeleton-text"
          style={{
            width: i === lines - 1 && lines > 1 ? '60%' : width || '100%',
            height: height || '14px',
          }}
        />
      ))}
    </div>
  );
}
