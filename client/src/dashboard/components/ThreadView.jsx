import React, { useState, useEffect } from 'react';
import { apiFetch } from '../../shared/api.js';
import { formatDate, formatSender } from '../../shared/utils/formatters.js';

/**
 * Thread/conversation view — groups emails by In-Reply-To/References headers.
 * Shows a stacked card view with each message expandable.
 */
export default function ThreadView({ messages, onReply, onForward, onClose }) {
  const [expanded, setExpanded] = useState(new Set([messages.length - 1])); // Last message expanded

  const toggle = (idx) => {
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(idx)) next.delete(idx);
      else next.add(idx);
      return next;
    });
  };

  if (!messages || messages.length === 0) return null;

  const subject = messages[0]?.subject || '(no subject)';

  return (
    <div className="thread-view">
      <div className="thread-header">
        <button className="btn-ghost" onClick={onClose} title="Back">←</button>
        <h2 className="thread-subject">{subject}</h2>
        <span className="thread-count">{messages.length} messages</span>
      </div>

      <div className="thread-messages">
        {messages.map((msg, idx) => (
          <div key={msg.uid || idx} className={`thread-message ${expanded.has(idx) ? 'expanded' : 'collapsed'}`}>
            <div className="thread-message-header" onClick={() => toggle(idx)}>
              <div className="thread-sender-avatar" style={{ background: `hsl(${(msg.from?.charCodeAt(0) || 0) * 5}, 50%, 40%)` }}>
                {formatSender(msg.from)?.[0]?.toUpperCase() || '?'}
              </div>
              <div className="thread-sender-info">
                <span className="thread-from">{formatSender(msg.from)}</span>
                <span className="thread-date">{formatDate(msg.date)}</span>
              </div>
              {!expanded.has(idx) && (
                <span className="thread-preview">{msg.preview || msg.text?.slice(0, 80)}</span>
              )}
              <span className="thread-expand-icon">{expanded.has(idx) ? '▾' : '▸'}</span>
            </div>

            {expanded.has(idx) && (
              <div className="thread-message-body">
                <div className="thread-meta">
                  <span>To: {msg.to}</span>
                  {msg.cc && <span>Cc: {msg.cc}</span>}
                </div>
                <div className="thread-content">
                  {msg.html ? (
                    <iframe
                      srcDoc={msg.html}
                      sandbox="allow-same-origin"
                      className="thread-iframe"
                      title={`Message ${idx + 1}`}
                    />
                  ) : (
                    <pre className="thread-text">{msg.text}</pre>
                  )}
                </div>
                {msg.attachments?.length > 0 && (
                  <div className="thread-attachments">
                    {msg.attachments.map((att, i) => (
                      <a key={i} className="thread-attachment" href={`/api/mail/attachment/${msg.uid}/${i}`}>
                        {att.filename} ({att.size})
                      </a>
                    ))}
                  </div>
                )}
                <div className="thread-actions">
                  <button className="btn btn-sm btn-ghost" onClick={() => onReply?.(msg)} style={{ display: "inline-flex", alignItems: "center", gap: "0.3rem" }}><svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="9 17 4 12 9 7"/><path d="M20 18v-2a4 4 0 0 0-4-4H4"/></svg><span>Reply</span></button>
                  <button className="btn btn-sm btn-ghost" onClick={() => onReply?.(msg, true)} style={{ display: "inline-flex", alignItems: "center", gap: "0.3rem" }}><svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="7 17 2 12 7 7"/><polyline points="12 17 7 12 12 7"/><path d="M22 18v-2a4 4 0 0 0-4-4H7"/></svg><span>Reply All</span></button>
                  <button className="btn btn-sm btn-ghost" onClick={() => onForward?.(msg)} style={{ display: "inline-flex", alignItems: "center", gap: "0.3rem" }}><svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="15 17 20 12 15 7"/><path d="M4 18v-2a4 4 0 0 1 4-4h12"/></svg><span>Forward</span></button>
                </div>
              </div>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}
