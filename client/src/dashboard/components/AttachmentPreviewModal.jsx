import React, { useState, useEffect } from 'react';

export default function AttachmentPreviewModal({
  attachment,
  messageUid,
  folder = 'INBOX',
  onClose,
}) {
  const [textContent, setTextContent] = useState(null);
  const [loadingText, setLoadingText] = useState(false);
  const [copySuccess, setCopySuccess] = useState(false);
  const [imgZoom, setImgZoom] = useState(1);
  const [sha256Hash, setSha256Hash] = useState(null);
  const [calculatingHash, setCalculatingHash] = useState(false);
  const [hashCopied, setHashCopied] = useState(false);

  if (!attachment) return null;

  const filename = attachment.filename || 'attachment';
  const ext = filename.split('.').pop()?.toLowerCase() || '';
  const contentType = (attachment.contentType || '').toLowerCase();
  const index = attachment.index !== undefined ? attachment.index : filename;

  const isImage = contentType.startsWith('image/') || ['png', 'jpg', 'jpeg', 'gif', 'webp', 'svg', 'bmp', 'ico'].includes(ext);
  const isPdf = contentType === 'application/pdf' || ext === 'pdf';
  const isAudio = contentType.startsWith('audio/') || ['mp3', 'wav', 'ogg', 'm4a', 'aac', 'flac'].includes(ext);
  const isVideo = contentType.startsWith('video/') || ['mp4', 'webm', 'mov', 'avi', 'mkv'].includes(ext);
  const isDocx = ext === 'docx' || contentType.includes('wordprocessingml');
  const isXlsx = ['xlsx', 'xls', 'csv', 'tsv'].includes(ext) || contentType.includes('spreadsheetml');
  const isText = contentType.startsWith('text/') || ['txt', 'json', 'csv', 'log', 'dat', 'xml', 'md', 'html', 'js', 'ts', 'css', 'py', 'sh', 'env', 'yml', 'yaml', 'ini', 'conf'].includes(ext);

  const previewUrl = `/api/mail/message/${messageUid}/attachment/${encodeURIComponent(index)}?preview=true&folder=${encodeURIComponent(folder)}`;
  const downloadUrl = `/api/mail/message/${messageUid}/attachment/${encodeURIComponent(index)}?download=true&folder=${encodeURIComponent(folder)}`;

  // Fetch text/dat/log content if text-like
  useEffect(() => {
    if (isText && !isImage && !isPdf) {
      setLoadingText(true);
      fetch(previewUrl, { credentials: 'include' })
        .then((res) => {
          if (!res.ok) throw new Error('Failed to load text preview');
          return res.text();
        })
        .then((txt) => setTextContent(txt))
        .catch((err) => setTextContent(`Error loading preview: ${err.message}`))
        .finally(() => setLoadingText(false));
    }
  }, [previewUrl, isText, isImage, isPdf]);

  // Compute SHA-256 integrity hash on demand or on mount
  const handleCalculateHash = async () => {
    if (sha256Hash || calculatingHash) return;
    setCalculatingHash(true);
    try {
      const res = await fetch(previewUrl, { credentials: 'include' });
      if (!res.ok) throw new Error('Failed to fetch attachment buffer');
      const buffer = await res.arrayBuffer();
      const hashBuffer = await crypto.subtle.digest('SHA-256', buffer);
      const hashArray = Array.from(new Uint8Array(hashBuffer));
      const hashHex = hashArray.map((b) => b.toString(16).padStart(2, '0')).join('');
      setSha256Hash(hashHex);
    } catch (err) {
      setSha256Hash(`Hash computation failed: ${err.message}`);
    } finally {
      setCalculatingHash(false);
    }
  };

  // Keyboard close
  useEffect(() => {
    const handleKeyDown = (e) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [onClose]);

  const copyText = () => {
    if (!textContent) return;
    navigator.clipboard.writeText(textContent).then(() => {
      setCopySuccess(true);
      setTimeout(() => setCopySuccess(false), 2000);
    });
  };

  const copyHash = () => {
    if (!sha256Hash) return;
    navigator.clipboard.writeText(sha256Hash).then(() => {
      setHashCopied(true);
      setTimeout(() => setHashCopied(false), 2000);
    });
  };

  const formatSize = (bytes) => {
    if (!bytes) return 'Unknown size';
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`;
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  };

  return (
    <div
      className="compose-overlay"
      onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}
      style={{
        zIndex: 1100,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: '1rem',
      }}
    >
      <div
        className="card"
        style={{
          width: '100%',
          maxWidth: isPdf || isText ? '940px' : '840px',
          maxHeight: '92vh',
          display: 'flex',
          flexDirection: 'column',
          background: 'var(--color-bg-elevated)',
          border: '1px solid var(--color-border)',
          borderRadius: 'var(--radius-lg)',
          boxShadow: 'var(--shadow-lg)',
          overflow: 'hidden',
          animation: 'fadeIn 0.2s ease-out',
        }}
        onClick={(e) => e.stopPropagation()}
      >
        {/* Modal Header */}
        <div
          style={{
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            padding: '0.85rem 1.25rem',
            borderBottom: '1px solid var(--color-border)',
            background: 'var(--color-bg-card)',
            flexWrap: 'wrap',
            gap: '0.75rem',
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.625rem', minWidth: 0 }}>
            <span style={{ display: 'inline-flex', color: 'var(--color-primary-light)' }}>
              {isImage ? (
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect width="18" height="18" x="3" y="3" rx="2" ry="2"/><circle cx="9" cy="9" r="2"/><path d="m21 15-3.086-3.086a2 2 0 0 0-2.828 0L6 21"/></svg>
              ) : isPdf ? (
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/></svg>
              ) : (
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M21.44 11.05-9.19 9.19a6 6 0 0 1-8.49-8.49l8.57-8.57A4 4 0 1 1 18 8.84l-8.59 8.57a2 2 0 0 1-2.83-2.83l8.49-8.48"/></svg>
              )}
            </span>
            <div style={{ minWidth: 0 }}>
              <h3
                style={{
                  fontSize: '0.9375rem',
                  fontWeight: 600,
                  margin: 0,
                  overflow: 'hidden',
                  textOverflow: 'ellipsis',
                  whiteSpace: 'nowrap',
                  maxWidth: '380px',
                }}
                title={filename}
              >
                {filename}
              </h3>
              <div style={{ fontSize: '0.75rem', color: 'var(--color-text-tertiary)', display: 'flex', gap: '0.5rem' }}>
                <span>{formatSize(attachment.size)}</span>
                {contentType && <span>• {contentType}</span>}
              </div>
            </div>
          </div>

          <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', flexWrap: 'wrap' }}>
            {isImage && (
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.25rem', marginRight: '0.5rem' }}>
                <button
                  type="button"
                  className="btn btn-ghost btn-xs"
                  onClick={() => setImgZoom((z) => Math.max(0.5, z - 0.25))}
                  title="Zoom Out"
                >
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/><line x1="8" y1="11" x2="14" y2="11"/></svg>
                </button>
                <span className="mono text-secondary" style={{ fontSize: '0.75rem', minWidth: 40, textAlign: 'center' }}>
                  {Math.round(imgZoom * 100)}%
                </span>
                <button
                  type="button"
                  className="btn btn-ghost btn-xs"
                  onClick={() => setImgZoom((z) => Math.min(3, z + 0.25))}
                  title="Zoom In"
                >
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/><line x1="11" y1="8" x2="11" y2="14"/><line x1="8" y1="11" x2="14" y2="11"/></svg>
                </button>
              </div>
            )}

            {isText && textContent && (
              <button
                type="button"
                className="btn btn-secondary btn-xs"
                onClick={copyText}
                title="Copy text to clipboard"
              >
                {copySuccess ? 'Copied' : 'Copy Text'}
              </button>
            )}

            <button
              type="button"
              className="btn btn-secondary btn-xs"
              onClick={handleCalculateHash}
              title="Verify SHA-256 Checksum"
              disabled={calculatingHash}
            >
              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/></svg>
              <span>{calculatingHash ? 'Hashing...' : sha256Hash ? 'SHA-256 Ready' : 'Inspect SHA-256'}</span>
            </button>

            <a
              href={downloadUrl}
              download={filename}
              className="btn btn-primary btn-xs"
              style={{ display: 'inline-flex', alignItems: 'center', gap: '0.35rem', textDecoration: 'none' }}
              title="Download file to computer"
            >
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/></svg>
              <span>Download</span>
            </a>

            <button
              type="button"
              className="btn btn-ghost btn-xs"
              onClick={onClose}
              style={{ display: 'inline-flex', alignItems: 'center', justifyContent: 'center', width: 28, height: 28, padding: 0, color: 'var(--color-text-secondary)' }}
              title="Close Preview (Esc)"
            >
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
            </button>
          </div>
        </div>

        {/* SHA-256 Checksum Banner (if computed) */}
        {sha256Hash && (
          <div
            style={{
              padding: '0.45rem 1.25rem',
              background: 'rgba(124, 58, 237, 0.1)',
              borderBottom: '1px solid var(--color-border)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              fontSize: '0.75rem',
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', overflow: 'hidden' }}>
              <span style={{ fontWeight: 700, color: 'var(--color-primary-light)' }}>SHA-256:</span>
              <span className="mono truncate text-secondary" style={{ maxWidth: '480px' }}>
                {sha256Hash}
              </span>
            </div>
            <button
              type="button"
              className="btn btn-ghost btn-xs"
              onClick={copyHash}
              style={{ padding: '0.1rem 0.4rem', fontSize: '0.7rem' }}
            >
              {hashCopied ? 'Copied' : 'Copy Hash'}
            </button>
          </div>
        )}

        {/* Modal Body */}
        <div
          style={{
            flex: 1,
            overflowY: 'auto',
            padding: isPdf ? 0 : '1.25rem',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            background: 'var(--color-bg-page)',
            minHeight: isPdf ? '600px' : isImage ? '400px' : '260px',
          }}
        >
          {isImage ? (
            <div style={{ textAlign: 'center', overflow: 'auto', maxWidth: '100%', maxHeight: '75vh' }}>
              <img
                src={previewUrl}
                alt={filename}
                style={{
                  maxWidth: '100%',
                  maxHeight: '70vh',
                  objectFit: 'contain',
                  transform: `scale(${imgZoom})`,
                  transformOrigin: 'center center',
                  transition: 'transform 0.15s ease',
                  borderRadius: 'var(--radius-md)',
                  boxShadow: 'var(--shadow-md)',
                }}
              />
            </div>
          ) : isPdf ? (
            <iframe
              src={previewUrl}
              title={filename}
              style={{
                width: '100%',
                height: '70vh',
                border: 'none',
                background: '#fff',
              }}
            />
          ) : isAudio ? (
            <div style={{ textAlign: 'center', padding: '2rem', width: '100%', maxWidth: '460px' }}>
              <div style={{ display: 'inline-flex', color: 'var(--color-primary-light)', marginBottom: '1rem' }}><svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"><path d="M9 18V5l12-2v13"/><circle cx="6" cy="18" r="3"/><circle cx="18" cy="16" r="3"/></svg></div>
              <p style={{ fontWeight: 600, marginBottom: '1.5rem' }}>{filename}</p>
              <audio controls src={previewUrl} style={{ width: '100%' }} />
            </div>
          ) : isVideo ? (
            <div style={{ textAlign: 'center', width: '100%', maxWidth: '720px' }}>
              <video controls src={previewUrl} style={{ width: '100%', maxHeight: '65vh', borderRadius: 'var(--radius-md)' }} />
            </div>
          ) : isText ? (
            <div style={{ width: '100%', height: '100%' }}>
              {loadingText ? (
                <div style={{ padding: '3rem', textAlign: 'center', color: 'var(--color-text-secondary)' }}>
                  Loading text content...
                </div>
              ) : (
                <pre
                  className="mono"
                  style={{
                    background: 'var(--color-bg-elevated)',
                    border: '1px solid var(--color-border)',
                    borderRadius: 'var(--radius-md)',
                    padding: '1.25rem',
                    fontSize: '0.8125rem',
                    lineHeight: 1.6,
                    maxHeight: '65vh',
                    overflowY: 'auto',
                    whiteSpace: 'pre-wrap',
                    wordBreak: 'break-all',
                    color: 'var(--color-text-primary)',
                    margin: 0,
                  }}
                >
                  {textContent || '(Empty content)'}
                </pre>
              )}
            </div>
          ) : isDocx || isXlsx ? (
            <div style={{ textAlign: 'center', padding: '3rem 1.5rem', maxWidth: '520px' }}>
              <div style={{ display: 'inline-flex', color: 'var(--color-primary-light)', marginBottom: '1rem' }}>
                <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/><line x1="16" y1="13" x2="8" y2="13"/><line x1="16" y1="17" x2="8" y2="17"/><polyline points="10 9 9 9 8 9"/></svg>
              </div>
              <h3 style={{ fontSize: '1.05rem', marginBottom: '0.5rem' }}>{filename}</h3>
              <p className="text-secondary" style={{ fontSize: '0.8125rem', marginBottom: '1.5rem', lineHeight: 1.5 }}>
                Office Document ({ext.toUpperCase()}). To prevent malicious macro or binary execution, WoxMail provides zero-trust sandboxed file download with client-side SHA-256 integrity inspection.
              </p>
              <div style={{ display: 'flex', justifyContent: 'center', gap: '0.5rem' }}>
                <a href={downloadUrl} download={filename} className="btn btn-primary btn-sm">
                  Download Safe Document ({formatSize(attachment.size)})
                </a>
              </div>
            </div>
          ) : (
            <div style={{ textAlign: 'center', padding: '3rem 1.5rem' }}>
              <div style={{ display: 'inline-flex', color: 'var(--color-primary-light)', marginBottom: '1rem' }}><svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"><polyline points="21 8 21 21 3 21 3 8"/><rect width="22" height="5" x="1" y="3"/><line x1="10" x2="14" y1="12" y2="12"/></svg></div>
              <h3 style={{ fontSize: '1.1rem', marginBottom: '0.5rem' }}>{filename}</h3>
              <p className="text-secondary" style={{ fontSize: '0.875rem', marginBottom: '1.5rem' }}>
                Preview is not available for this binary file format ({ext.toUpperCase() || 'DAT'}). You can download the file to inspect it on your device.
              </p>
              <a href={downloadUrl} download={filename} className="btn btn-primary">
                Download File ({formatSize(attachment.size)})
              </a>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
