import React, { useState } from 'react';

/**
 * Interactive Sandboxed Safe Web Preview Modal
 * Allows users to inspect embedded links with SSL verification,
 * security warnings, and an isolated sandbox iframe.
 */
export default function LinkPreviewModal({ url, preview, onClose }) {
  const [viewMode, setViewMode] = useState('card'); // 'card' | 'sandbox'
  const [copied, setCopied] = useState(false);

  if (!url) return null;

  let hostname = '';
  let isHttps = false;
  try {
    const parsed = new URL(url);
    hostname = parsed.hostname;
    isHttps = parsed.protocol === 'https:';
  } catch {
    hostname = url;
  }

  const copyUrl = () => {
    navigator.clipboard.writeText(url);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
    if (window.WoxToast) window.WoxToast.success('Link copied to clipboard');
  };

  return (
    <div className="compose-overlay" onClick={onClose}>
      <div
        className="card link-preview-modal-dialog"
        onClick={(e) => e.stopPropagation()}
        style={{
          width: '90vw',
          maxWidth: 820,
          maxHeight: '88vh',
          display: 'flex',
          flexDirection: 'column',
          padding: 0,
          overflow: 'hidden',
          borderRadius: 'var(--radius-xl)',
          border: '1px solid rgba(124, 58, 237, 0.35)',
          boxShadow: '0 24px 60px rgba(0, 0, 0, 0.7), 0 0 40px rgba(124, 58, 237, 0.15)',
        }}
      >
        {/* Top Header */}
        <div
          style={{
            padding: '1.25rem 1.5rem',
            background: 'var(--color-bg-elevated)',
            borderBottom: '1px solid var(--color-border)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            flexWrap: 'wrap',
            gap: '0.75rem',
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', overflow: 'hidden' }}>
            <div
              style={{
                width: 36,
                height: 36,
                borderRadius: 'var(--radius-sm)',
                background: 'rgba(124, 58, 237, 0.15)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                color: '#c084fc',
                fontSize: '1.1rem',
              }}
            >
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="10"/><line x1="2" x2="22" y1="12" y2="12"/><path d="M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z"/></svg>
            </div>
            <div style={{ overflow: 'hidden' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                <strong style={{ fontSize: '0.9375rem', color: '#fff' }}>{preview?.siteName || hostname}</strong>
                {isHttps ? (
                  <span className="admin-badge admin-badge-green" style={{ fontSize: '0.65rem' }}>
                    HTTPS SECURE
                  </span>
                ) : (
                  <span className="admin-badge admin-badge-amber" style={{ fontSize: '0.65rem' }}>
                    HTTP UNENCRYPTED
                  </span>
                )}
              </div>
              <div
                className="text-secondary mono truncate"
                style={{ fontSize: '0.75rem', maxWidth: 450 }}
                title={url}
              >
                {url}
              </div>
            </div>
          </div>

          {/* View switcher & Close */}
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
            <div style={{ display: 'flex', background: 'var(--color-bg-input)', padding: 3, borderRadius: 'var(--radius-md)', border: '1px solid var(--color-border)' }}>
              <button
                type="button"
                className={`btn btn-xs ${viewMode === 'card' ? 'btn-primary' : 'btn-ghost'}`}
                onClick={() => setViewMode('card')}
                style={{ fontSize: '0.75rem', borderRadius: 'var(--radius-sm)' }}
              >
                Smart Card
              </button>
              <button
                type="button"
                className={`btn btn-xs ${viewMode === 'sandbox' ? 'btn-primary' : 'btn-ghost'}`}
                onClick={() => setViewMode('sandbox')}
                style={{ fontSize: '0.75rem', borderRadius: 'var(--radius-sm)' }}
              >
                Live Sandbox
              </button>
            </div>
            <button
              type="button"
              className="btn btn-ghost btn-xs"
              onClick={onClose}
              style={{ fontSize: '1rem', padding: '0.25rem 0.5rem' }}
            >
              ✕
            </button>
          </div>
        </div>

        {/* Modal Body */}
        <div style={{ flex: 1, overflowY: 'auto', padding: viewMode === 'sandbox' ? 0 : '1.75rem' }}>
          {viewMode === 'card' ? (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>
              {/* Preview Hero Card */}
              <div
                style={{
                  background: 'var(--color-bg-card)',
                  border: '1px solid var(--color-border)',
                  borderRadius: 'var(--radius-lg)',
                  overflow: 'hidden',
                  display: 'flex',
                  flexDirection: 'column',
                }}
              >
                {preview?.image && (
                  <div
                    style={{
                      width: '100%',
                      height: 240,
                      background: `url(${preview.image}) center/cover no-repeat`,
                      borderBottom: '1px solid var(--color-border)',
                      position: 'relative',
                    }}
                  >
                    <div
                      style={{
                        position: 'absolute',
                        top: '1rem',
                        left: '1rem',
                        background: 'rgba(10, 10, 20, 0.75)',
                        backdropFilter: 'blur(8px)',
                        padding: '0.25rem 0.6rem',
                        borderRadius: 'var(--radius-pill)',
                        fontSize: '0.75rem',
                        color: '#c084fc',
                        fontWeight: 600,
                      }}
                    >
                      {preview.type?.toUpperCase() || 'WEBSITE'}
                    </div>
                  </div>
                )}

                <div style={{ padding: '1.5rem', display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
                  <h3 style={{ margin: 0, fontSize: '1.25rem', color: '#fff', fontWeight: 700, lineHeight: 1.3 }}>
                    {preview?.title || hostname}
                  </h3>
                  <p style={{ margin: 0, color: 'var(--color-text-secondary)', fontSize: '0.875rem', lineHeight: 1.6 }}>
                    {preview?.description || 'No meta description provided by the remote server.'}
                  </p>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginTop: '0.5rem' }}>
                    {preview?.favicon && (
                      <img src={preview.favicon} alt="" style={{ width: 16, height: 16, borderRadius: 2 }} onError={(e) => { e.target.style.display = 'none'; }} />
                    )}
                    <span className="mono text-tertiary" style={{ fontSize: '0.75rem' }}>{hostname}</span>
                  </div>
                </div>
              </div>

              {/* Safety Interstitial Warning Card */}
              <div
                style={{
                  background: 'rgba(245, 158, 11, 0.08)',
                  border: '1px solid rgba(245, 158, 11, 0.25)',
                  borderRadius: 'var(--radius-md)',
                  padding: '1rem 1.25rem',
                  display: 'flex',
                  alignItems: 'flex-start',
                  gap: '0.75rem',
                }}
              >
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/></svg>
                <div style={{ fontSize: '0.8125rem', color: 'var(--color-text-secondary)', lineHeight: 1.5 }}>
                  <strong style={{ color: '#fbbf24' }}>External Domain Protection:</strong> You are about to visit an external website outside of WoxMail. Never enter your WoxMail credentials or OTP keys on untrusted third-party sites.
                </div>
              </div>
            </div>
          ) : (
            <div style={{ width: '100%', height: '55vh', position: 'relative', background: '#fff' }}>
              <iframe
                src={url}
                title="Sandboxed Web Preview"
                sandbox="allow-scripts allow-forms"
                style={{ width: '100%', height: '100%', border: 'none' }}
              />
            </div>
          )}
        </div>

        {/* Footer Actions */}
        <div
          style={{
            padding: '1rem 1.5rem',
            background: 'var(--color-bg-elevated)',
            borderTop: '1px solid var(--color-border)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            flexWrap: 'wrap',
            gap: '0.75rem',
          }}
        >
          <button
            type="button"
            className="btn btn-secondary btn-sm"
            onClick={copyUrl}
            style={{ gap: '0.4rem' }}
          >
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect width="14" height="14" x="8" y="8" rx="2" ry="2"/><path d="M4 16c-1.1 0-2-.9-2-2V4c0-1.1.9-2 2-2h10c1.1 0 2 .9 2 2"/></svg>
            <span>{copied ? 'Copied!' : 'Copy Link URL'}</span>
          </button>

          <div style={{ display: 'flex', gap: '0.75rem' }}>
            <button
              type="button"
              className="btn btn-ghost btn-sm"
              onClick={onClose}
            >
              Cancel
            </button>
            <a
              href={url}
              target="_blank"
              rel="noopener noreferrer nofollow"
              className="btn btn-primary btn-sm"
              style={{ gap: '0.4rem', fontWeight: 600 }}
            >
              <span>Visit External Site</span>
              <span>↗</span>
            </a>
          </div>
        </div>
      </div>
    </div>
  );
}
