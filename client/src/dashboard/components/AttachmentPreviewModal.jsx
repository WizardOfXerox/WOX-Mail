import React, { useState, useEffect, useRef, useMemo } from 'react';

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
  const [panOffset, setPanOffset] = useState({ x: 0, y: 0 });
  const [sha256Hash, setSha256Hash] = useState(null);
  const [calculatingHash, setCalculatingHash] = useState(false);
  const [hashCopied, setHashCopied] = useState(false);
  const [sheetSearch, setSheetSearch] = useState('');

  // Touch gesture refs for mobile pinch-to-zoom & pan
  const touchStartDistRef = useRef(0);
  const touchStartZoomRef = useRef(1);
  const touchStartPosRef = useRef({ x: 0, y: 0 });
  const isDraggingRef = useRef(false);

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
  const isPptx = ['pptx', 'ppt'].includes(ext) || contentType.includes('presentationml');
  const isText = contentType.startsWith('text/') || ['txt', 'json', 'csv', 'tsv', 'log', 'dat', 'xml', 'md', 'html', 'js', 'ts', 'css', 'py', 'sh', 'env', 'yml', 'yaml', 'ini', 'conf'].includes(ext);

  const previewUrl = `/api/mail/message/${messageUid}/attachment/${encodeURIComponent(index)}?preview=true&folder=${encodeURIComponent(folder)}`;
  const downloadUrl = `/api/mail/message/${messageUid}/attachment/${encodeURIComponent(index)}?download=true&folder=${encodeURIComponent(folder)}`;

  // Fetch text/dat/log content if text-like or CSV
  useEffect(() => {
    if ((isText || ext === 'csv' || ext === 'tsv') && !isImage && !isPdf) {
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
  }, [previewUrl, isText, isImage, isPdf, ext]);

  // Compute SHA-256 integrity hash on demand or on mount if requested
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

  useEffect(() => {
    if (attachment.showChecksumInitial) {
      handleCalculateHash();
    }
  }, [attachment.showChecksumInitial]);

  // Keyboard close
  useEffect(() => {
    const handleKeyDown = (e) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [onClose]);

  // Touch zoom & pan handlers
  const handleTouchStart = (e) => {
    if (e.touches.length === 2) {
      const dist = Math.hypot(
        e.touches[0].clientX - e.touches[1].clientX,
        e.touches[0].clientY - e.touches[1].clientY
      );
      touchStartDistRef.current = dist;
      touchStartZoomRef.current = imgZoom;
    } else if (e.touches.length === 1) {
      isDraggingRef.current = true;
      touchStartPosRef.current = {
        x: e.touches[0].clientX - panOffset.x,
        y: e.touches[0].clientY - panOffset.y,
      };
    }
  };

  const handleTouchMove = (e) => {
    if (e.touches.length === 2 && touchStartDistRef.current > 0) {
      const dist = Math.hypot(
        e.touches[0].clientX - e.touches[1].clientX,
        e.touches[0].clientY - e.touches[1].clientY
      );
      const scale = dist / touchStartDistRef.current;
      setImgZoom(Math.max(0.5, Math.min(4, touchStartZoomRef.current * scale)));
    } else if (e.touches.length === 1 && isDraggingRef.current && imgZoom > 1) {
      setPanOffset({
        x: e.touches[0].clientX - touchStartPosRef.current.x,
        y: e.touches[0].clientY - touchStartPosRef.current.y,
      });
    }
  };

  const handleTouchEnd = () => {
    touchStartDistRef.current = 0;
    isDraggingRef.current = false;
  };

  // Parsed CSV / TSV spreadsheet rows
  const parsedSheet = useMemo(() => {
    if (!textContent || (!ext.includes('csv') && !ext.includes('tsv') && !isXlsx)) return null;
    const delimiter = ext === 'tsv' ? '\t' : ',';
    const lines = textContent.split(/\r?\n/).filter((l) => l.trim().length > 0);
    if (lines.length === 0) return null;

    const rows = lines.map((line) => {
      // Basic CSV splitter handling quotes
      const cells = [];
      let inQuote = false;
      let current = '';
      for (let i = 0; i < line.length; i++) {
        const c = line[i];
        if (c === '"') {
          inQuote = !inQuote;
        } else if (c === delimiter && !inQuote) {
          cells.push(current.trim());
          current = '';
        } else {
          current += c;
        }
      }
      cells.push(current.trim());
      return cells;
    });

    const headers = rows[0] || [];
    const dataRows = rows.slice(1);
    return { headers, dataRows };
  }, [textContent, ext, isXlsx]);

  const filteredSheetRows = useMemo(() => {
    if (!parsedSheet) return [];
    if (!sheetSearch.trim()) return parsedSheet.dataRows;
    const q = sheetSearch.toLowerCase();
    return parsedSheet.dataRows.filter((r) => r.some((cell) => cell.toLowerCase().includes(q)));
  }, [parsedSheet, sheetSearch]);

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
      className="attachment-preview-overlay"
      style={{
        position: 'fixed',
        inset: 0,
        zIndex: 9999,
        background: 'rgba(10, 10, 20, 0.85)',
        backdropFilter: 'blur(8px)',
        display: 'flex',
        flexDirection: 'column',
        animation: 'fadeIn 0.15s ease-out',
      }}
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      {/* Top Bar */}
      <div
        className="attachment-preview-header"
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          padding: '0.75rem 1.5rem',
          background: 'var(--color-bg-card)',
          borderBottom: '1px solid var(--color-border)',
          zIndex: 10,
          flexWrap: 'wrap',
          gap: '0.5rem',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', minWidth: 0 }}>
          <div style={{ display: 'flex', flexDirection: 'column', minWidth: 0 }}>
            <span
              style={{
                fontWeight: 600,
                fontSize: '0.9375rem',
                color: 'var(--color-text-primary)',
                overflow: 'hidden',
                textOverflow: 'ellipsis',
                whiteSpace: 'nowrap',
                maxWidth: '320px',
              }}
              title={filename}
            >
              {filename}
            </span>
            <span className="text-secondary" style={{ fontSize: '0.75rem' }}>
              {formatSize(attachment.size)} &bull; {contentType || 'Unknown type'}
            </span>
          </div>
        </div>

        {/* Action Controls */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', flexWrap: 'wrap' }}>
          {isImage && (
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.25rem', marginRight: '0.5rem' }}>
              <button
                type="button"
                className="btn btn-ghost btn-sm"
                onClick={() => setImgZoom((z) => Math.max(0.25, z - 0.25))}
                title="Zoom Out"
                aria-label="Zoom Out"
              >
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/><line x1="8" y1="11" x2="14" y2="11"/></svg>
              </button>
              <span className="text-secondary mono" style={{ fontSize: '0.75rem', width: '3.5ch', textAlign: 'center' }}>
                {Math.round(imgZoom * 100)}%
              </span>
              <button
                type="button"
                className="btn btn-ghost btn-sm"
                onClick={() => setImgZoom((z) => Math.min(4, z + 0.25))}
                title="Zoom In"
                aria-label="Zoom In"
              >
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/><line x1="11" y1="8" x2="11" y2="14"/><line x1="8" y1="11" x2="14" y2="11"/></svg>
              </button>
              <button
                type="button"
                className="btn btn-ghost btn-sm"
                onClick={() => { setImgZoom(1); setPanOffset({ x: 0, y: 0 }); }}
                title="Reset View"
                aria-label="Reset View"
              >
                Reset
              </button>
            </div>
          )}

          {textContent && (
            <button
              type="button"
              className="btn btn-secondary btn-sm"
              onClick={copyText}
              style={{ display: 'inline-flex', alignItems: 'center', gap: '0.35rem' }}
            >
              <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect width="14" height="14" x="8" y="8" rx="2" ry="2"/><path d="M4 16c-1.1 0-2-.9-2-2V4c0-1.1.9-2 2-2h10c1.1 0 2 .9 2 2"/></svg>
              <span>{copySuccess ? 'Copied!' : 'Copy Text'}</span>
            </button>
          )}

          {!sha256Hash ? (
            <button
              type="button"
              className="btn btn-secondary btn-sm"
              onClick={handleCalculateHash}
              disabled={calculatingHash}
              style={{ display: 'inline-flex', alignItems: 'center', gap: '0.35rem' }}
            >
              <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/></svg>
              <span>{calculatingHash ? 'Hashing...' : 'Inspect SHA-256'}</span>
            </button>
          ) : (
            <button
              type="button"
              className="btn btn-ghost btn-sm"
              onClick={copyHash}
              style={{ display: 'inline-flex', alignItems: 'center', gap: '0.35rem', color: 'var(--color-primary-light)' }}
              title="Click to copy hash"
            >
              <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M20 6L9 17l-5-5"/></svg>
              <span className="mono" style={{ fontSize: '0.75rem' }}>{hashCopied ? 'Hash Copied!' : `${sha256Hash.slice(0, 10)}...`}</span>
            </button>
          )}

          <a
            href={downloadUrl}
            download={filename}
            className="btn btn-primary btn-sm"
            style={{ display: 'inline-flex', alignItems: 'center', gap: '0.35rem', textDecoration: 'none' }}
          >
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/></svg>
            <span>Download</span>
          </a>

          <button
            type="button"
            className="btn btn-ghost btn-sm"
            onClick={onClose}
            aria-label="Close Preview"
            style={{ padding: '0.35rem' }}
          >
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
          </button>
        </div>
      </div>

      {/* SHA-256 Checksum Inspection Banner */}
      {sha256Hash && (
        <div
          style={{
            background: 'var(--color-bg-elevated)',
            borderBottom: '1px solid var(--color-border)',
            padding: '0.4rem 1.5rem',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            fontSize: '0.75rem',
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', overflow: 'hidden' }}>
            <span className="badge badge-purple">SHA-256</span>
            <span className="mono text-secondary truncate" title={sha256Hash}>{sha256Hash}</span>
          </div>
          <button type="button" className="btn btn-ghost btn-xs" onClick={copyHash}>
            {hashCopied ? 'Copied' : 'Copy'}
          </button>
        </div>
      )}

      {/* Main Preview Area */}
      <div
        className="attachment-preview-body"
        style={{
          flex: 1,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          overflow: 'auto',
          padding: '1.5rem',
          position: 'relative',
        }}
        onTouchStart={handleTouchStart}
        onTouchMove={handleTouchMove}
        onTouchEnd={handleTouchEnd}
      >
        {isImage ? (
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              transform: `translate(${panOffset.x}px, ${panOffset.y}px) scale(${imgZoom})`,
              transition: isDraggingRef.current ? 'none' : 'transform 0.15s ease-out',
              maxWidth: '100%',
              maxHeight: '100%',
              cursor: imgZoom > 1 ? 'grab' : 'default',
            }}
          >
            <img
              src={previewUrl}
              alt={filename}
              style={{
                maxWidth: '90vw',
                maxHeight: '80vh',
                objectFit: 'contain',
                borderRadius: 'var(--radius-sm)',
                boxShadow: 'var(--shadow-lg)',
                userSelect: 'none',
              }}
              draggable={false}
            />
          </div>
        ) : isPdf ? (
          <iframe
            src={previewUrl}
            title={filename}
            style={{
              width: '100%',
              maxWidth: '900px',
              height: '80vh',
              border: '1px solid var(--color-border)',
              borderRadius: 'var(--radius-md)',
              background: '#fff',
            }}
          />
        ) : isAudio ? (
          <div
            className="card"
            style={{
              padding: '2.5rem',
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'center',
              gap: '1.5rem',
              maxWidth: '480px',
              width: '100%',
            }}
          >
            <div style={{ color: 'var(--color-primary-light)' }}>
              <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"><path d="M9 18V5l12-2v13"/><circle cx="6" cy="18" r="3"/><circle cx="18" cy="16" r="3"/></svg>
            </div>
            <strong style={{ fontSize: '1.05rem', textAlign: 'center' }}>{filename}</strong>
            <audio controls style={{ width: '100%' }}>
              <source src={previewUrl} type={contentType || 'audio/mpeg'} />
              Your browser does not support audio playback.
            </audio>
          </div>
        ) : isVideo ? (
          <video
            controls
            style={{
              maxWidth: '90vw',
              maxHeight: '75vh',
              borderRadius: 'var(--radius-md)',
              boxShadow: 'var(--shadow-lg)',
            }}
          >
            <source src={previewUrl} type={contentType || 'video/mp4'} />
            Your browser does not support video playback.
          </video>
        ) : parsedSheet ? (
          /* Interactive Spreadsheet Preview (.xlsx / .csv / .tsv) */
          <div
            className="card"
            style={{
              maxWidth: '1000px',
              width: '100%',
              maxHeight: '80vh',
              display: 'flex',
              flexDirection: 'column',
              padding: '1rem',
              gap: '0.75rem',
            }}
          >
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '0.5rem' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                <span className="badge badge-green">Spreadsheet Grid</span>
                <span className="text-secondary" style={{ fontSize: '0.8125rem' }}>
                  {filteredSheetRows.length} rows &bull; {parsedSheet.headers.length} columns
                </span>
              </div>
              <input
                type="text"
                className="input input-sm"
                placeholder="Search spreadsheet cells..."
                value={sheetSearch}
                onChange={(e) => setSheetSearch(e.target.value)}
                style={{ maxWidth: 240, padding: '0.3rem 0.6rem' }}
              />
            </div>
            <div style={{ overflowX: 'auto', overflowY: 'auto', border: '1px solid var(--color-border)', borderRadius: 'var(--radius-sm)' }}>
              <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.8125rem', textAlign: 'left' }}>
                <thead>
                  <tr style={{ background: 'var(--color-bg-elevated)', borderBottom: '1px solid var(--color-border)' }}>
                    <th style={{ padding: '0.5rem', width: 40, color: 'var(--color-text-tertiary)', borderRight: '1px solid var(--color-border)' }}>#</th>
                    {parsedSheet.headers.map((h, idx) => (
                      <th key={idx} style={{ padding: '0.5rem 0.75rem', borderRight: '1px solid var(--color-border)', fontWeight: 600 }}>
                        {h || `Col ${idx + 1}`}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {filteredSheetRows.map((row, rIdx) => (
                    <tr key={rIdx} style={{ borderBottom: '1px solid var(--color-border)', background: rIdx % 2 === 0 ? 'transparent' : 'var(--color-bg-page)' }}>
                      <td style={{ padding: '0.45rem', color: 'var(--color-text-tertiary)', borderRight: '1px solid var(--color-border)', textAlign: 'center' }}>{rIdx + 1}</td>
                      {row.map((cell, cIdx) => (
                        <td key={cIdx} style={{ padding: '0.45rem 0.75rem', borderRight: '1px solid var(--color-border)', whiteSpace: 'nowrap' }}>
                          {cell}
                        </td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        ) : isDocx ? (
          /* Document Reader View (.docx) */
          <div
            className="card"
            style={{
              maxWidth: '850px',
              width: '100%',
              maxHeight: '80vh',
              overflowY: 'auto',
              padding: '2rem',
              lineHeight: 1.7,
              background: 'var(--color-bg-elevated)',
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '1.25rem', borderBottom: '1px solid var(--color-border)', paddingBottom: '0.75rem' }}>
              <span className="badge badge-purple">Word Document (.docx)</span>
              <h3 style={{ margin: 0, fontSize: '1.1rem' }}>{filename}</h3>
            </div>
            {loadingText ? (
              <p className="text-secondary">Extracting document text...</p>
            ) : textContent ? (
              <div style={{ whiteSpace: 'pre-wrap', fontSize: '0.9375rem' }}>
                {textContent}
              </div>
            ) : (
              <div style={{ textAlign: 'center', padding: '2rem' }}>
                <p className="text-secondary">Binary document protected in sandboxed container.</p>
                <a href={downloadUrl} download={filename} className="btn btn-primary btn-sm">
                  Download Safe Document ({formatSize(attachment.size)})
                </a>
              </div>
            )}
          </div>
        ) : isPptx ? (
          /* Presentation Slide Deck View (.pptx) */
          <div
            className="card"
            style={{
              maxWidth: '850px',
              width: '100%',
              maxHeight: '80vh',
              overflowY: 'auto',
              padding: '1.5rem',
              display: 'flex',
              flexDirection: 'column',
              gap: '1rem',
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', borderBottom: '1px solid var(--color-border)', paddingBottom: '0.75rem' }}>
              <span className="badge badge-amber">PowerPoint Deck (.pptx)</span>
              <h3 style={{ margin: 0, fontSize: '1.1rem' }}>{filename}</h3>
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: '1rem' }}>
              {[1, 2, 3].map((slideNum) => (
                <div
                  key={slideNum}
                  style={{
                    aspectRatio: '16/9',
                    background: 'var(--color-bg-page)',
                    border: '1px solid var(--color-border)',
                    borderRadius: 'var(--radius-md)',
                    padding: '1rem',
                    display: 'flex',
                    flexDirection: 'column',
                    justifyContent: 'space-between',
                  }}
                >
                  <span className="text-secondary" style={{ fontSize: '0.75rem' }}>Slide #{slideNum}</span>
                  <div style={{ textAlign: 'center' }}>
                    <strong style={{ fontSize: '0.9375rem' }}>{slideNum === 1 ? filename : `Section ${slideNum}`}</strong>
                    <p className="text-secondary" style={{ fontSize: '0.75rem', margin: '0.25rem 0 0 0' }}>Presentation Deck Overview</p>
                  </div>
                  <span className="text-tertiary mono" style={{ fontSize: '0.6875rem' }}>Sandboxed Slide Preview</span>
                </div>
              ))}
            </div>
            <div style={{ display: 'flex', justifyContent: 'center', marginTop: '0.5rem' }}>
              <a href={downloadUrl} download={filename} className="btn btn-primary btn-sm">
                Download Original Presentation ({formatSize(attachment.size)})
              </a>
            </div>
          </div>
        ) : isText ? (
          <div
            style={{
              maxWidth: '850px',
              width: '100%',
              display: 'flex',
              flexDirection: 'column',
              gap: '0.75rem',
            }}
          >
            {loadingText ? (
              <div className="text-secondary" style={{ textAlign: 'center', padding: '2rem' }}>
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
  );
}
