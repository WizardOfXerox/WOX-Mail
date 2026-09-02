import React, { useState } from 'react';

/**
 * Parses and separates main email body from quoted reply chains (> text or -----Original Message-----)
 */
export default function QuotedTextFolder({ htmlContent, textContent }) {
  const [isExpanded, setIsExpanded] = useState(false);

  if (!htmlContent && !textContent) return null;

  // Search for common quoted text delimiters
  const raw = htmlContent || textContent || '';
  const blockquoteRegex = /<blockquote[\s\S]*?<\/blockquote>/gi;
  const originalMsgRegex = /(-{3,}\s*Original Message\s*-{3,}[\s\S]*)/i;

  const hasBlockquote = blockquoteRegex.test(raw);
  const hasOriginalMsg = originalMsgRegex.test(raw);

  if (!hasBlockquote && !hasOriginalMsg) {
    return <div dangerouslySetInnerHTML={{ __html: raw }} />;
  }

  // Extract main vs quoted
  let mainPart = raw;
  let quotedPart = '';

  if (hasBlockquote) {
    const matches = raw.match(blockquoteRegex);
    quotedPart = matches ? matches.join('\n') : '';
    mainPart = raw.replace(blockquoteRegex, '');
  } else if (hasOriginalMsg) {
    const parts = raw.split(originalMsgRegex);
    mainPart = parts[0];
    quotedPart = parts.slice(1).join('');
  }

  return (
    <div>
      <div dangerouslySetInnerHTML={{ __html: mainPart }} />

      {quotedPart && (
        <div style={{ marginTop: '1rem', borderTop: '1px dashed var(--color-border)', paddingTop: '0.75rem' }}>
          <button
            type="button"
            className="btn btn-ghost btn-sm"
            onClick={() => setIsExpanded(!isExpanded)}
            style={{ fontSize: '0.75rem', display: 'inline-flex', alignItems: 'center', gap: '0.4rem', color: 'var(--color-primary-light)' }}
          >
            <span>{isExpanded ? '▼ Hide Quoted Text' : '▶ Show Quoted Replies'}</span>
          </button>

          {isExpanded && (
            <div
              style={{
                marginTop: '0.75rem',
                padding: '0.875rem 1.25rem',
                background: 'var(--color-bg-elevated)',
                borderLeft: '3px solid var(--color-primary)',
                borderRadius: '0 var(--radius-sm) var(--radius-sm) 0',
                fontSize: '0.8125rem',
                color: 'var(--color-text-secondary)'
              }}
              dangerouslySetInnerHTML={{ __html: quotedPart }}
            />
          )}
        </div>
      )}
    </div>
  );
}
