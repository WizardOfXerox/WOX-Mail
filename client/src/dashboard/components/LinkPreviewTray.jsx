import React, { useState, useEffect } from 'react';

/**
 * Extract distinct external HTTP/HTTPS URLs from HTML string or plaintext.
 * @param {string} html
 * @param {string} text
 * @returns {string[]}
 */
export function extractEmbeddedUrls(html = '', text = '') {
  const urls = new Set();

  // 1. Extract hrefs from HTML
  if (html) {
    const hrefRegex = /href=["'](https?:\/\/[^"'\s>]+)["']/gi;
    let match;
    while ((match = hrefRegex.exec(html)) !== null) {
      const u = match[1];
      if (!isIgnoredUrl(u)) {
        urls.add(u);
      }
    }
  }

  // 2. Extract bare URLs from plaintext
  const rawText = (text || '') + ' ' + (html || '').replace(/<[^>]*>/g, ' ');
  const textUrlRegex = /https?:\/\/[^\s<>"'{}|\\^`[\]]+/gi;
  let match;
  while ((match = textUrlRegex.exec(rawText)) !== null) {
    const u = match[0].replace(/[.,;:)]+$/, ''); // Strip trailing punctuation
    if (!isIgnoredUrl(u)) {
      urls.add(u);
    }
  }

  return Array.from(urls).slice(0, 8);
}

function isIgnoredUrl(url) {
  if (!url || typeof url !== 'string') return true;
  const lower = url.toLowerCase();
  // Filter out internal / tracking / unsubscribe links
  if (lower.startsWith('mailto:') || lower.startsWith('tel:') || lower.startsWith('#')) return true;
  if (lower.includes('unsubscribe') || lower.includes('optout') || lower.includes('list-manage.com/unsubscribe')) return true;
  if (lower.includes('/api/mail/proxy-image') || lower.includes('tracking') || lower.includes('open.gif')) return true;
  return false;
}

export default function LinkPreviewTray({
  message,
  onOpenModalPreview,
}) {
  const [urls, setUrls] = useState([]);
  const [previews, setPreviews] = useState({});
  const [loading, setLoading] = useState(false);
  const [collapsed, setCollapsed] = useState(true);

  useEffect(() => {
    if (!message) {
      setUrls([]);
      setPreviews({});
      return;
    }

    const foundUrls = extractEmbeddedUrls(message.html, message.text);
    setUrls(foundUrls);
    // Collapse if more than 2 links
    setCollapsed(foundUrls.length > 2);

    if (foundUrls.length === 0) {
      setPreviews({});
      return;
    }

    let isMounted = true;
    setLoading(true);

    fetch('/api/mail/link-previews', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      credentials: 'include',
      body: JSON.stringify({ urls: foundUrls }),
    })
      .then((res) => res.json())
      .then((data) => {
        if (isMounted && data.previews) {
          setPreviews(data.previews);
        }
      })
      .catch((err) => {
        console.error('Failed fetching link previews', err);
      })
      .finally(() => {
        if (isMounted) setLoading(false);
      });

    return () => { isMounted = false; };
  }, [message?.uid, message?.subject]);

  if (urls.length === 0) return null;

  return (
    <div className="link-preview-tray">
      {/* Tray Header */}
      <div className="link-preview-tray-header">
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71"/><path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71"/></svg>
          <strong style={{ fontSize: '0.875rem', color: '#fff' }}>
            Embedded Web Previews ({urls.length})
          </strong>
          {loading && (
            <span className="text-tertiary" style={{ fontSize: '0.75rem' }}>
              • Fetching rich meta...
            </span>
          )}
        </div>

        <button
          type="button"
          className="btn btn-ghost btn-xs"
          onClick={() => setCollapsed(!collapsed)}
          style={{ fontSize: '0.75rem', color: 'var(--color-text-secondary)' }}
        >
          {collapsed ? 'Show Previews ▼' : 'Hide ▲'}
        </button>
      </div>

      {/* Grid of Preview Cards */}
      {!collapsed && (
        <div className="link-preview-grid">
          {urls.map((u) => {
            const p = previews[u];
            let hostname = '';
            try { hostname = new URL(u).hostname.replace(/^www\./, ''); } catch { hostname = u; }

            return (
              <div key={u} className="link-preview-card">
                {p?.image ? (
                  <div
                    className="link-preview-thumb"
                    style={{ backgroundImage: `url(${p.image})` }}
                  />
                ) : (
                  <div className="link-preview-thumb-placeholder">
                    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="10"/><line x1="2" x2="22" y1="12" y2="12"/><path d="M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z"/></svg>
                  </div>
                )}

                <div className="link-preview-content">
                  <div className="link-preview-site-row">
                    {p?.favicon && (
                      <img
                        src={p.favicon}
                        alt=""
                        className="link-preview-favicon"
                        onError={(e) => { e.target.style.display = 'none'; }}
                      />
                    )}
                    <span className="link-preview-hostname">{p?.siteName || hostname}</span>
                    <span className="admin-badge admin-badge-purple" style={{ fontSize: '0.6rem', padding: '0.1rem 0.35rem' }}>
                      {p?.type || 'WEB'}
                    </span>
                  </div>

                  <h4 className="link-preview-title" title={p?.title || hostname}>
                    {p?.title || hostname}
                  </h4>

                  {p?.description && (
                    <p className="link-preview-desc">
                      {p.description}
                    </p>
                  )}

                  <div className="link-preview-actions">
                    <button
                      type="button"
                      className="btn btn-secondary btn-xs"
                      onClick={() => onOpenModalPreview && onOpenModalPreview(u, p)}
                      title="Inspect link in safe sandbox modal"
                      style={{ fontSize: '0.75rem', gap: '0.3rem' }}
                    >
                      <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/></svg>
                      <span>Safe Preview</span>
                    </button>

                    <a
                      href={u}
                      target="_blank"
                      rel="noopener noreferrer nofollow"
                      className="btn btn-ghost btn-xs"
                      title="Open external website"
                      style={{ fontSize: '0.75rem', gap: '0.3rem', color: 'var(--color-primary-light)' }}
                    >
                      <span>Visit</span>
                      <span>↗</span>
                    </a>

                    <button
                      type="button"
                      className="btn btn-ghost btn-xs"
                      onClick={() => {
                        navigator.clipboard.writeText(u);
                        if (window.WoxToast) window.WoxToast.success('Link copied');
                      }}
                      title="Copy URL"
                      style={{ fontSize: '0.75rem' }}
                    >
                      📋
                    </button>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
