import React, { useRef, useEffect, useState, useMemo } from 'react';
import LinkPreviewTray from './LinkPreviewTray.jsx';
import LinkPreviewModal from './LinkPreviewModal.jsx';
import AttachmentPreviewModal from './AttachmentPreviewModal.jsx';
import SnoozePopover from './SnoozePopover.jsx';
import FolderMovePopover from './FolderMovePopover.jsx';
import ContextMenu from './ContextMenu.jsx';
import EmailPrivacyModal, { getStoredPrivacyPrefs, saveStoredPrivacyPrefs } from './EmailPrivacyModal.jsx';

const NOTE_COLORS = [
  { id: 'purple', bg: 'rgba(124, 58, 237, 0.08)', text: '#f3e8ff', border: 'rgba(124, 58, 237, 0.35)', accent: '#a78bfa', dot: '#a78bfa', label: 'Amethyst' },
  { id: 'blue', bg: 'rgba(59, 130, 246, 0.08)', text: '#eff6ff', border: 'rgba(59, 130, 246, 0.35)', accent: '#60a5fa', dot: '#60a5fa', label: 'Sapphire' },
  { id: 'emerald', bg: 'rgba(16, 185, 129, 0.08)', text: '#ecfdf5', border: 'rgba(16, 185, 129, 0.35)', accent: '#34d399', dot: '#34d399', label: 'Emerald' },
  { id: 'amber', bg: 'rgba(245, 158, 11, 0.08)', text: '#fffbeb', border: 'rgba(245, 158, 11, 0.35)', accent: '#fbbf24', dot: '#fbbf24', label: 'Amber' },
  { id: 'rose', bg: 'rgba(244, 63, 94, 0.08)', text: '#fff1f2', border: 'rgba(244, 63, 94, 0.35)', accent: '#fb7185', dot: '#fb7185', label: 'Rose' },
];

export default function MessageView({
  message,
  loading,
  embedded = false,
  folders = [],
  onBack,
  onReply,
  onReplyAll,
  onForward,
  onArchive,
  onDelete,
  onSnooze,
  onMove,
  onSpam,
  onToggleRead,
  onStar,
}) {
  const iframeRef = useRef(null);
  const [showHeadersModal, setShowHeadersModal] = useState(false);
  const [headersData, setHeadersData] = useState(null);
  const [loadingHeaders, setLoadingHeaders] = useState(false);
  const [modalPreview, setModalPreview] = useState(null); // { url, preview }
  const [previewAttachment, setPreviewAttachment] = useState(null); // attachment object for lightbox preview
  const [showSnooze, setShowSnooze] = useState(false);
  const [showMove, setShowMove] = useState(false);
  const [showMoreMenu, setShowMoreMenu] = useState(false);
  const [isMobile, setIsMobile] = useState(() => typeof window !== 'undefined' ? window.innerWidth < 768 : false);
  const [showPrivacyModal, setShowPrivacyModal] = useState(false);
  const [privacyPrefs, setPrivacyPrefs] = useState(() => getStoredPrivacyPrefs());
  const [allowImagesThisEmail, setAllowImagesThisEmail] = useState(false);
  const [allowScriptsThisEmail, setAllowScriptsThisEmail] = useState(false);
  const [contextMenu, setContextMenu] = useState(null);
  const [readerArticle, setReaderArticle] = useState(null);
  const [securityReport, setSecurityReport] = useState(null);
  const snoozeBtnRef = useRef(null);
  const moveBtnRef = useRef(null);
  const moreMenuRef = useRef(null);

  const senderEmail = useMemo(() => {
    return (typeof message?.from === 'object' ? (message?.from?.address || message?.from?.value?.[0]?.address || '') : String(message?.from || '')).toLowerCase();
  }, [message?.from]);

  const senderDomain = useMemo(() => {
    return senderEmail.includes('@') ? '@' + senderEmail.split('@')[1] : '';
  }, [senderEmail]);

  // Sync allowImages & allowScripts whenever message or prefs change
  useEffect(() => {
    const prefs = getStoredPrivacyPrefs();
    setPrivacyPrefs(prefs);
    if (!message?.uid) {
      setAllowImagesThisEmail(false);
      setAllowScriptsThisEmail(false);
      return;
    }

    // Determine initial image loading permission
    if (prefs.remoteImages === 'allow_all') {
      setAllowImagesThisEmail(true);
    } else {
      const isTrusted = (prefs.trustedSenders || []).some((s) => s.toLowerCase() === senderEmail || (senderDomain && s.toLowerCase() === senderDomain));
      setAllowImagesThisEmail(isTrusted);
    }

    setAllowScriptsThisEmail(Boolean(prefs.allowScripts));
  }, [message?.uid, senderEmail, senderDomain]);

  const hasRemoteImages = useMemo(() => {
    if (!message?.html) return false;
    return message.html.includes('data-original-src') || /<img[^>]+src=["']https?:\/\//i.test(message.html);
  }, [message?.html]);

  const hasScripts = useMemo(() => {
    if (!message?.html) return false;
    return /<script/i.test(message.html) || /<form/i.test(message.html) || /<embed/i.test(message.html);
  }, [message?.html]);

  const handleTrustSender = () => {
    if (!senderEmail) return;
    const current = getStoredPrivacyPrefs();
    const updated = {
      ...current,
      trustedSenders: [...new Set([...(current.trustedSenders || []), senderEmail])],
    };
    saveStoredPrivacyPrefs(updated);
    setPrivacyPrefs(updated);
    setAllowImagesThisEmail(true);
    if (window.WoxToast) window.WoxToast.success(`Added ${senderEmail} to trusted senders whitelist.`);
  };

  useEffect(() => {
    const handleResize = () => setIsMobile(window.innerWidth < 768);
    window.addEventListener('resize', handleResize, { passive: true });
    return () => window.removeEventListener('resize', handleResize);
  }, []);

  useEffect(() => {
    const handleClickOutside = (e) => {
      if (moreMenuRef.current && !moreMenuRef.current.contains(e.target)) {
        setShowMoreMenu(false);
      }
    };
    if (showMoreMenu) {
      document.addEventListener('mousedown', handleClickOutside);
    }
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, [showMoreMenu]);

  // ─── Private Sticky Note State ─────────────────────────────
  const [note, setNote] = useState(null);
  const [noteText, setNoteText] = useState('');
  const [noteColor, setNoteColor] = useState('purple');
  const [isEditingNote, setIsEditingNote] = useState(false);
  const [isSavingNote, setIsSavingNote] = useState(false);
  const [showNoteBox, setShowNoteBox] = useState(false);

  // Load sticky note whenever message changes
  useEffect(() => {
    if (!message?.uid) {
      setNote(null);
      setNoteText('');
      setShowNoteBox(false);
      return;
    }

    let isMounted = true;
    const fetchNote = async () => {
      try {
        const res = await fetch(`/api/notes/${message.uid}?folder=${encodeURIComponent(message.folder || 'INBOX')}`, {
          credentials: 'include',
        });
        const data = await res.json();
        if (isMounted) {
          if (data.note) {
            setNote(data.note);
            setNoteText(data.note.noteText || '');
            const colorId = data.note.color === 'yellow' ? 'amber' : (data.note.color || 'purple');
            setNoteColor(colorId);
            setShowNoteBox(true);
          } else {
            setNote(null);
            setNoteText('');
            setShowNoteBox(false);
          }
        }
      } catch (err) {
        console.error('Failed to load note', err);
      }
    };

    fetchNote();
    return () => { isMounted = false; };
  }, [message?.uid, message?.folder]);

  // Save note to server
  const saveNote = async (textToSave, colorToSave) => {
    if (!message?.uid) return;
    setIsSavingNote(true);
    try {
      const res = await fetch(`/api/notes/${message.uid}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({
          folder: message.folder || 'INBOX',
          noteText: textToSave,
          color: colorToSave || noteColor,
        }),
      });
      const data = await res.json();
      if (data.note) {
        setNote(data.note);
      } else {
        setNote(null);
        setShowNoteBox(false);
      }
    } catch (err) {
      console.error('Failed to save note', err);
    } finally {
      setIsSavingNote(false);
    }
  };

  const deleteNote = async () => {
    if (!message?.uid) return;
    try {
      await fetch(`/api/notes/${message.uid}?folder=${encodeURIComponent(message.folder || 'INBOX')}`, {
        method: 'DELETE',
        credentials: 'include',
      });
      setNote(null);
      setNoteText('');
      setShowNoteBox(false);
      setIsEditingNote(false);
    } catch (err) {
      console.error('Failed to delete note', err);
    }
  };

  const fetchSecurityHeaders = async () => {
    setShowHeadersModal(true);
    setLoadingHeaders(true);
    try {
      const res = await fetch(`/api/mail/message/${message.uid}/headers?folder=${message.folder || 'INBOX'}`, { credentials: 'include' });
      const data = await res.json();
      setHeadersData(data);
    } catch (err) {
      console.error('Failed to load headers', err);
    } finally {
      setLoadingHeaders(false);
    }
  };

  // Render HTML in sandboxed iframe
  useEffect(() => {
    if (!message?.html || !iframeRef.current) return;

    const isLight = document.documentElement.getAttribute('data-theme') === 'light';
    const textColor = isLight ? '#1f2937' : '#e0e0e0';
    const bodyBg = 'transparent';
    const quoteBorder = isLight ? '#7c3aed' : '#7c3aed';
    const quoteColor = isLight ? '#4b5563' : '#a1a1aa';
    const quoteBg = isLight ? '#f9fafb' : 'rgba(255, 255, 255, 0.03)';
    const tableBorder = isLight ? '#e5e7eb' : '#2d2d48';
    const linkColor = isLight ? '#7c3aed' : '#a78bfa';

    let processedHtml = message.html;
    if (allowImagesThisEmail) {
      // Unblock all remote images cleanly by replacing data-original-src with active src
      processedHtml = processedHtml.replace(/<img\b([^>]*?)\bdata-original-src=(["'])(.*?)\2([^>]*?)>/gi, (match, before, quote, origSrc, after) => {
        let clean = (before + ' ' + after)
          .replace(/\bsrc=(["'])[\s\S]*?\1/gi, '')
          .replace(/\bclass=(["'])(.*?)\1/gi, (cm, cq, classes) => {
            const newClasses = classes.replace(/\bblocked-image\b/g, '').trim();
            return newClasses ? `class="${newClasses}"` : '';
          })
          .trim();
        return `<img src="${origSrc}" data-loaded="true" ${clean}>`;
      });
      processedHtml = processedHtml.replace(/data-original-src="([^"]+)"/g, 'src="$1" data-loaded="true"');
      processedHtml = processedHtml.replace(/class="([^"]*)blocked-image([^"]*)"/g, 'class="$1$2"');
    }

    const iframe = iframeRef.current;
    const doc = iframe.contentDocument;
    if (!doc) return;
    doc.open();
    doc.write(`
      <!DOCTYPE html>
      <html>
      <head>
        <meta charset="utf-8">
        <base target="_blank">
        <style>
          *, *::before, *::after { box-sizing: border-box; }
          body {
            font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif;
            font-size: 14.5px;
            line-height: 1.65;
            color: ${textColor};
            background: ${bodyBg};
            margin: 0;
            padding: 16px 8px;
            word-wrap: break-word;
          }
          a { color: ${linkColor}; text-decoration: underline; cursor: pointer; }
          img { max-width: 100%; height: auto; border-radius: 4px; }
          img.blocked-image, img[data-original-src]:not([data-loaded="true"]) {
            min-width: 100px;
            min-height: 36px;
            border: 1px dashed rgba(139, 92, 246, 0.4);
            border-radius: 6px;
            padding: 6px;
            background: rgba(124, 58, 237, 0.05);
            cursor: pointer;
            display: inline-block;
          }
          table { border-collapse: collapse; max-width: 100%; }
          td, th { border: 1px solid ${tableBorder}; padding: 6px 10px; }
          pre, code { font-family: 'JetBrains Mono', monospace; font-size: 13px; background: ${quoteBg}; padding: 2px 5px; border-radius: 4px; overflow-x: auto; }
          blockquote {
            border-left: 3px solid ${quoteBorder};
            margin: 0.75rem 0;
            padding: 0.5rem 1rem;
            color: ${quoteColor};
            background: ${quoteBg};
            border-radius: 0 6px 6px 0;
          }
          ${isLight ? `
            div[style*="background"], table[style*="background"], td[style*="background"] {
              color: inherit;
            }
          ` : ''}
        </style>
      </head>
      <body>${processedHtml}</body>
      </html>
    `);
    doc.close();

    const resize = () => {
      if (iframe.contentDocument?.body) {
        iframe.style.height = Math.max(200, iframe.contentDocument.body.scrollHeight + 32) + 'px';
      }
    };
    iframe.onload = resize;
    setTimeout(resize, 100);

    doc.addEventListener('click', (e) => {
      const link = e.target.closest('a');
      if (link && link.href && (link.href.startsWith('http://') || link.href.startsWith('https://'))) {
        e.preventDefault();
        if (privacyPrefs.interceptLinks) {
          setModalPreview({ url: link.href, preview: null });
        } else {
          window.open(link.href, '_blank', 'noopener,noreferrer');
        }
        return;
      }

      const imgTarget = e.target.closest('img');
      if (imgTarget && (imgTarget.classList?.contains('blocked-image') || imgTarget.hasAttribute('data-original-src'))) {
        const origSrc = imgTarget.dataset.originalSrc || imgTarget.getAttribute('data-original-src');
        if (origSrc) {
          imgTarget.src = origSrc.startsWith('http') ? `/api/mail/proxy-image?url=${encodeURIComponent(origSrc)}` : origSrc;
          imgTarget.classList.remove('blocked-image');
          imgTarget.removeAttribute('data-original-src');
          imgTarget.setAttribute('data-loaded', 'true');
          imgTarget.setAttribute('alt', '');
          resize();
        }
      }
    });

    doc.addEventListener('contextmenu', (e) => {
      const link = e.target.closest('a');
      const iframeRect = iframe.getBoundingClientRect();
      const x = iframeRect.left + e.clientX;
      const y = iframeRect.top + e.clientY;
      const selection = doc.getSelection ? doc.getSelection().toString() : '';

      if (link && link.href) {
        e.preventDefault();
        setContextMenu({
          x,
          y,
          title: link.href,
          items: [
            {
              label: 'Safe Sandbox Preview',
              icon: <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/></svg>,
              onClick: () => setModalPreview({ url: link.href, preview: null }),
            },
            {
              label: 'Open in Sandboxed Reader Mode',
              icon: <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M2 3h6a4 4 0 0 1 4 4v14a3 3 0 0 0-3-3H2z"/><path d="M22 3h-6a4 4 0 0 0-4 4v14a3 3 0 0 1 3-3h7z"/></svg>,
              onClick: async () => {
                try {
                  if (window.WoxToast) window.WoxToast.info('Loading clean reader view...');
                  const res = await fetch(`/api/security/reader-view?url=${encodeURIComponent(link.href)}`);
                  const data = await res.json();
                  if (data.success && data.reader) {
                    setReaderArticle(data.reader);
                  } else {
                    if (window.WoxToast) window.WoxToast.error('Failed to load reader mode view');
                  }
                } catch (err) {
                  if (window.WoxToast) window.WoxToast.error(`Reader mode error: ${err.message}`);
                }
              },
            },
            {
              label: 'Inspect Domain Security & SSL',
              icon: <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect width="18" height="11" x="3" y="11" rx="2" ry="2"/><path d="M7 11V7a5 5 0 0 1 10 0v4"/></svg>,
              onClick: async () => {
                try {
                  if (window.WoxToast) window.WoxToast.info('Inspecting domain & SSL certificate...');
                  const res = await fetch('/api/security/inspect-link', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ url: link.href }),
                  });
                  const data = await res.json();
                  if (data.success && data.report) {
                    setSecurityReport(data.report);
                  } else {
                    if (window.WoxToast) window.WoxToast.error('Domain inspection failed');
                  }
                } catch (err) {
                  if (window.WoxToast) window.WoxToast.error('Domain inspection error');
                }
              },
            },
            {
              label: 'Block Destination Domain',
              icon: <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="10"/><line x1="4.93" y1="4.93" x2="19.07" y2="19.07"/></svg>,
              danger: true,
              onClick: () => {
                try {
                  const u = new URL(link.href);
                  if (window.WoxToast) window.WoxToast.success(`Domain ${u.hostname} added to blocklist`);
                } catch {
                  if (window.WoxToast) window.WoxToast.success('Destination link blocked');
                }
              },
            },
            { divider: true },
            {
              label: 'Copy Clean Link (No Trackers)',
              icon: <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect width="14" height="14" x="8" y="8" rx="2" ry="2"/><path d="M4 16c-1.1 0-2-.9-2-2V4c0-1.1.9-2 2-2h10c1.1 0 2 .9 2 2"/></svg>,
              onClick: () => {
                try {
                  const u = new URL(link.href);
                  const cleanParams = new URLSearchParams();
                  for (const [k, v] of u.searchParams.entries()) {
                    if (!k.startsWith('utm_') && !['fbclid', 'gclid', 'mc_eid', '_hsenc'].includes(k.toLowerCase())) {
                      cleanParams.append(k, v);
                    }
                  }
                  u.search = cleanParams.toString();
                  navigator.clipboard.writeText(u.toString());
                  if (window.WoxToast) window.WoxToast.success('Clean URL copied to clipboard');
                } catch {
                  navigator.clipboard.writeText(link.href);
                  if (window.WoxToast) window.WoxToast.success('Link copied');
                }
              },
            },
            {
              label: 'Open in New Tab',
              icon: <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6"/><polyline points="15 3 21 3 21 9"/><line x1="10" y1="14" x2="21" y2="3"/></svg>,
              onClick: () => window.open(link.href, '_blank', 'noopener,noreferrer'),
            },
          ],
        });
      } else if (selection && selection.trim().length > 0) {
        e.preventDefault();
        setContextMenu({
          x,
          y,
          title: `Selection (${selection.slice(0, 24)}...)`,
          items: [
            {
              label: 'Copy Clean Text',
              icon: <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect width="14" height="14" x="8" y="8" rx="2" ry="2"/><path d="M4 16c-1.1 0-2-.9-2-2V4c0-1.1.9-2 2-2h10c1.1 0 2 .9 2 2"/></svg>,
              onClick: () => {
                navigator.clipboard.writeText(selection.trim());
                if (window.WoxToast) window.WoxToast.success('Text copied');
              },
            },
            {
              label: 'Search in Mailbox',
              icon: <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/></svg>,
              onClick: () => {
                window.dispatchEvent(new CustomEvent('woxmail:global-search', { detail: { query: selection.trim() } }));
              },
            },
            {
              label: 'Create Private Sticky Note',
              icon: <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/></svg>,
              onClick: () => {
                setShowNoteBox(true);
                setIsEditingNote(true);
                setNoteText((prev) => (prev ? `${prev}\n\n> ${selection.trim()}` : `> ${selection.trim()}`));
              },
            },
          ],
        });
      }
    });
  }, [message?.html, message?.uid, allowImagesThisEmail, allowScriptsThisEmail, privacyPrefs]);

  if (!message && !loading) {
    return (
      <section className={`dashboard-viewer ${embedded ? 'dashboard-viewer-embedded' : ''}`}>
        <div className="empty-state">
          <span className="empty-icon" style={{ display: 'inline-flex', color: 'var(--color-primary-light)' }}><svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"><path d="M22 13V6a2 2 0 0 0-2-2H4a2 2 0 0 0-2 2v12c0 1.1.9 2 2 2h9"/><path d="m22 7-8.97 5.7a1.94 1.94 0 0 1-2.06 0L2 7"/></svg></span>
          <p>Select a message to read</p>
          <p className="text-tertiary" style={{ fontSize: '0.75rem', marginTop: '0.5rem' }}>
            Shortcuts: <kbd>j</kbd>/<kbd>k</kbd> navigate, <kbd>r</kbd> reply, <kbd>c</kbd> compose
          </p>
        </div>
      </section>
    );
  }

  if (loading) {
    return (
      <section className={`dashboard-viewer ${embedded ? 'dashboard-viewer-embedded' : ''}`} style={{ padding: '1.5rem' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', marginBottom: '1.25rem' }}>
          <div className="skeleton skeleton-avatar skeleton-shimmer" style={{ width: 44, height: 44, borderRadius: '50%' }} />
          <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: '0.4rem' }}>
            <div className="skeleton skeleton-line skeleton-shimmer" style={{ width: '45%', height: '1.1rem' }} />
            <div className="skeleton skeleton-line skeleton-shimmer" style={{ width: '25%', height: '0.8rem' }} />
          </div>
        </div>
        <div className="skeleton skeleton-line skeleton-shimmer" style={{ width: '80%', height: '1.4rem', marginBottom: '1.5rem' }} />
        <div className="skeleton-card skeleton-shimmer" style={{ minHeight: '320px', display: 'flex', flexDirection: 'column', gap: '0.75rem', padding: '1.5rem' }}>
          <div className="skeleton skeleton-line skeleton-shimmer" style={{ width: '95%', height: '0.9rem' }} />
          <div className="skeleton skeleton-line skeleton-shimmer" style={{ width: '90%', height: '0.9rem' }} />
          <div className="skeleton skeleton-line skeleton-shimmer" style={{ width: '75%', height: '0.9rem' }} />
          <div className="skeleton skeleton-line skeleton-shimmer" style={{ width: '88%', height: '0.9rem', marginTop: '1rem' }} />
          <div className="skeleton skeleton-line skeleton-shimmer" style={{ width: '60%', height: '0.9rem' }} />
        </div>
      </section>
    );
  }

  const currentColorObj = NOTE_COLORS.find((c) => c.id === noteColor) || NOTE_COLORS[0];

  return (
    <section className={`dashboard-viewer ${embedded ? 'dashboard-viewer-embedded' : ''}`} aria-label="Message content viewer">
      <div className="viewer-content-wrapper">
        {/* Actions toolbar — Sleek Compact Design */}
        <div className="viewer-toolbar" style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '0.35rem', flexWrap: 'nowrap', minHeight: '44px', padding: '0.35rem 0.65rem', position: 'relative', zIndex: 100, overflow: 'visible' }}>
          {/* Left Group: Navigation & Primary Composition */}
          <div className="viewer-toolbar-left" style={{ display: 'flex', alignItems: 'center', gap: '0.3rem', flexShrink: 0 }}>
            {onBack && (
              <button
                type="button"
                className="btn btn-secondary btn-xs viewer-back-btn"
                onClick={onBack}
                title="Back to Inbox List (Esc)"
                style={{
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: '0.25rem',
                  padding: '0.35rem 0.65rem',
                  fontWeight: 600,
                  background: 'var(--color-bg-hover)',
                  borderColor: 'var(--color-border)',
                }}
              >
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"><path d="m15 18-6-6 6-6"/></svg>
                <span>Back</span>
              </button>
            )}

            {!isMobile && (
              <div style={{ display: 'inline-flex', background: 'var(--color-bg-elevated)', borderRadius: 'var(--radius-pill)', padding: '2px', border: '1px solid var(--color-border)' }}>
                <button
                  type="button"
                  className="btn btn-ghost btn-xs"
                  onClick={onReply}
                  title="Reply (r)"
                  style={{ padding: '0.25rem 0.5rem', fontSize: '0.75rem', fontWeight: 600, display: 'inline-flex', alignItems: 'center', gap: '0.25rem' }}
                >
                  <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"><polyline points="9 17 4 12 9 7"/><path d="M20 18v-2a4 4 0 0 0-4-4H4"/></svg>
                  <span>Reply</span>
                </button>
                <button
                  type="button"
                  className="btn btn-ghost btn-xs"
                  onClick={onReplyAll}
                  title="Reply All (a)"
                  style={{ padding: '0.25rem 0.45rem', fontSize: '0.75rem', display: 'inline-flex', alignItems: 'center', gap: '0.25rem' }}
                >
                  <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"><polyline points="7 17 2 12 7 7"/><polyline points="12 17 7 12 12 7"/><path d="M22 18v-2a4 4 0 0 0-4-4H7"/></svg>
                  <span className="hide-mobile">All</span>
                </button>
                <button
                  type="button"
                  className="btn btn-ghost btn-xs"
                  onClick={onForward}
                  title="Forward (f)"
                  style={{ padding: '0.25rem 0.45rem', fontSize: '0.75rem', display: 'inline-flex', alignItems: 'center', gap: '0.25rem' }}
                >
                  <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"><polyline points="15 17 20 12 15 7"/><path d="M4 18v-2a4 4 0 0 1 4-4h12"/></svg>
                  <span className="hide-mobile">Fwd</span>
                </button>
              </div>
            )}
          </div>

          {/* Right Group: Key Actions + More Menu */}
          <div className="viewer-toolbar-right" style={{ display: 'flex', alignItems: 'center', gap: '0.25rem', flexShrink: 0 }}>
            {/* On Mobile: Quick Reply button */}
            {isMobile && (
              <button
                type="button"
                className="btn btn-ghost btn-xs viewer-action-btn"
                onClick={onReply}
                title="Reply (r)"
                style={{ padding: '0.35rem 0.55rem' }}
              >
                <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"><polyline points="9 17 4 12 9 7"/><path d="M20 18v-2a4 4 0 0 0-4-4H4"/></svg>
              </button>
            )}

            {/* Quick Star Toggle */}
            <button
              type="button"
              className={`btn btn-ghost btn-xs viewer-action-btn ${message.isStarred ? 'viewer-star-active' : ''}`}
              onClick={() => onStar && onStar(message?.uid)}
              title={message.isStarred ? 'Unstar email (s)' : 'Star email (s)'}
              style={{
                padding: '0.35rem 0.45rem',
                color: message.isStarred ? '#f59e0b' : 'var(--color-text-secondary)',
              }}
            >
              <svg width="15" height="15" viewBox="0 0 24 24" fill={message.isStarred ? 'currentColor' : 'none'} stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2"/></svg>
            </button>

            {/* Quick Archive */}
            {onArchive && (
              <button
                type="button"
                className="btn btn-ghost btn-xs viewer-action-btn"
                onClick={() => onArchive(message.uid)}
                title="Archive message (e)"
                style={{ padding: '0.35rem 0.45rem' }}
              >
                <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect width="20" height="5" x="2" y="3" rx="1"/><path d="M4 8v11a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8"/><path d="M10 12h4"/></svg>
              </button>
            )}

            {/* Quick Delete */}
            {onDelete && (
              <button
                type="button"
                className="btn btn-ghost btn-xs viewer-action-btn viewer-btn-danger"
                onClick={() => onDelete(message.uid)}
                title="Delete message (#)"
                style={{ padding: '0.35rem 0.45rem', color: 'var(--color-error)' }}
              >
                <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M3 6h18"/><path d="M19 6v14c0 1-1 2-2 2H7c-1 0-2-1-2-2V6"/><path d="M8 6V4c0-1 1-2 2-2h4c1 0 2 1 2 2v2"/></svg>
              </button>
            )}

            {/* Quick Sticky Note Button (Desktop only, on mobile accessible via More) */}
            {!isMobile && (
              <button
                type="button"
                className={`btn btn-ghost btn-xs viewer-action-btn ${showNoteBox ? 'btn-active' : ''}`}
                onClick={() => {
                  setShowNoteBox(!showNoteBox);
                  setIsEditingNote(!showNoteBox);
                }}
                title={note ? 'View Private Note' : 'Add Private Sticky Note'}
                style={{
                  padding: '0.35rem 0.45rem',
                  color: note ? 'var(--color-primary-light)' : 'var(--color-text-secondary)',
                }}
              >
                <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M15.5 3H5a2 2 0 0 0-2 2v14c0 1.1.9 2 2 2h14a2 2 0 0 0 2-2V8.5L15.5 3Z"/><path d="M15 3v6h6"/><path d="M9 13h6"/><path d="M9 17h3"/></svg>
              </button>
            )}

            {/* Email Privacy & Security Controls Button */}
            <button
              type="button"
              className={`btn btn-ghost btn-xs viewer-action-btn ${allowImagesThisEmail ? 'btn-active' : ''}`}
              onClick={() => setShowPrivacyModal(true)}
              title="Email Privacy, Images & Script Controls"
              style={{
                padding: '0.35rem 0.45rem',
                color: (hasRemoteImages && !allowImagesThisEmail) ? 'var(--color-warning)' : 'var(--color-primary-light)',
              }}
            >
              <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/></svg>
            </button>

            {/* Snooze Popover Hook */}
            {onSnooze && showSnooze && (
              <SnoozePopover
                onSelect={(isoDate) => {
                  setShowSnooze(false);
                  onSnooze(isoDate);
                }}
                onClose={() => setShowSnooze(false)}
                anchorRect={moreMenuRef.current?.getBoundingClientRect()}
              />
            )}

            {/* Move to Folder Popover Hook */}
            {onMove && showMove && (
              <FolderMovePopover
                folders={folders}
                currentFolder={message.folder || 'INBOX'}
                onSelectFolder={(target) => {
                  setShowMove(false);
                  onMove(target);
                }}
                onClose={() => setShowMove(false)}
                anchorRect={moreMenuRef.current?.getBoundingClientRect()}
              />
            )}

            {/* More Actions (•••) Dropdown Menu / Bottom Sheet */}
            <div ref={moreMenuRef} style={{ position: 'relative', display: 'inline-flex', zIndex: 101 }}>
              <button
                type="button"
                className={`btn btn-ghost btn-xs viewer-action-btn ${showMoreMenu ? 'btn-active' : ''}`}
                onClick={() => setShowMoreMenu(!showMoreMenu)}
                title="More message actions"
                style={{ padding: '0.35rem 0.45rem' }}
              >
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="1.5"/><circle cx="19" cy="12" r="1.5"/><circle cx="5" cy="12" r="1.5"/></svg>
              </button>

              {showMoreMenu && (
                <div
                  className="viewer-more-dropdown"
                  style={{
                    position: 'absolute',
                    right: 0,
                    top: '100%',
                    marginTop: '0.45rem',
                    background: 'rgba(18, 18, 38, 0.94)',
                    border: '1px solid var(--color-border)',
                    borderRadius: 'var(--radius-md)',
                    boxShadow: '0 12px 36px rgba(0, 0, 0, 0.6), 0 0 20px var(--color-primary-glow)',
                    padding: '0.4rem',
                    display: 'flex',
                    flexDirection: 'column',
                    gap: '0.2rem',
                    minWidth: '200px',
                    zIndex: 99999,
                    backdropFilter: 'blur(20px) saturate(180%)',
                    WebkitBackdropFilter: 'blur(20px) saturate(180%)',
                    animation: 'dropdownFadeIn 0.15s ease-out',
                  }}
                >
                  {onSnooze && (
                    <button
                      type="button"
                      className="btn btn-ghost btn-xs"
                      onClick={() => {
                        setShowMoreMenu(false);
                        setShowSnooze(true);
                      }}
                      style={{ justifyContent: 'flex-start', padding: '0.5rem 0.65rem', fontSize: '0.8125rem', gap: '0.5rem' }}
                    >
                      <span style={{ fontSize: '1rem' }}>⏰</span>
                      <span>Snooze Message</span>
                    </button>
                  )}

                  {onMove && (
                    <button
                      type="button"
                      className="btn btn-ghost btn-xs"
                      onClick={() => {
                        setShowMoreMenu(false);
                        setShowMove(true);
                      }}
                      style={{ justifyContent: 'flex-start', padding: '0.5rem 0.65rem', fontSize: '0.8125rem', gap: '0.5rem' }}
                    >
                      <span style={{ fontSize: '1rem' }}>📁</span>
                      <span>Move to Folder</span>
                    </button>
                  )}

                  <button
                    type="button"
                    className="btn btn-ghost btn-xs"
                    onClick={() => {
                      setShowMoreMenu(false);
                      setShowNoteBox(!showNoteBox);
                      setIsEditingNote(!showNoteBox);
                    }}
                    style={{ justifyContent: 'flex-start', padding: '0.5rem 0.65rem', fontSize: '0.8125rem', gap: '0.5rem' }}
                  >
                    <span style={{ fontSize: '1rem' }}>📝</span>
                    <span>{note ? 'View Private Note' : 'Add Private Note'}</span>
                  </button>

                  <button
                    type="button"
                    className="btn btn-ghost btn-xs"
                    onClick={() => {
                      setShowMoreMenu(false);
                      onReplyAll();
                    }}
                    style={{ justifyContent: 'flex-start', padding: '0.5rem 0.65rem', fontSize: '0.8125rem', gap: '0.5rem' }}
                  >
                    <span style={{ fontSize: '1rem' }}>👥</span>
                    <span>Reply All</span>
                  </button>

                  <button
                    type="button"
                    className="btn btn-ghost btn-xs"
                    onClick={() => {
                      setShowMoreMenu(false);
                      onForward();
                    }}
                    style={{ justifyContent: 'flex-start', padding: '0.5rem 0.65rem', fontSize: '0.8125rem', gap: '0.5rem' }}
                  >
                    <span style={{ fontSize: '1rem' }}>➡️</span>
                    <span>Forward</span>
                  </button>

                  <button
                    type="button"
                    className="btn btn-ghost btn-xs"
                    onClick={() => {
                      setShowMoreMenu(false);
                      onToggleRead();
                    }}
                    style={{ justifyContent: 'flex-start', padding: '0.5rem 0.65rem', fontSize: '0.8125rem', gap: '0.5rem' }}
                  >
                    <span style={{ fontSize: '1rem' }}>✉️</span>
                    <span>{message.flags?.includes('\\Seen') ? 'Mark as Unread' : 'Mark as Read'}</span>
                  </button>

                  <button
                    type="button"
                    className="btn btn-ghost btn-xs"
                    onClick={() => {
                      setShowMoreMenu(false);
                      setShowPrivacyModal(true);
                    }}
                    style={{ justifyContent: 'flex-start', padding: '0.5rem 0.65rem', fontSize: '0.8125rem', gap: '0.5rem' }}
                  >
                    <span style={{ fontSize: '1rem' }}>🛡️</span>
                    <span>Privacy, Images & Scripts</span>
                  </button>

                  <button
                    type="button"
                    className="btn btn-ghost btn-xs"
                    onClick={() => {
                      setShowMoreMenu(false);
                      fetchSecurityHeaders();
                    }}
                    style={{ justifyContent: 'flex-start', padding: '0.5rem 0.65rem', fontSize: '0.8125rem', gap: '0.5rem' }}
                  >
                    <span style={{ fontSize: '1rem' }}>🔍</span>
                    <span>Raw Security Headers</span>
                  </button>

                  {onArchive && (
                    <button
                      type="button"
                      className="btn btn-ghost btn-xs"
                      onClick={() => {
                        setShowMoreMenu(false);
                        onArchive(message?.uid);
                      }}
                      style={{ justifyContent: 'flex-start', padding: '0.5rem 0.65rem', fontSize: '0.8125rem', gap: '0.5rem' }}
                    >
                      <span style={{ fontSize: '1rem' }}>📦</span>
                      <span>Archive</span>
                    </button>
                  )}

                  {onDelete && (
                    <button
                      type="button"
                      className="btn btn-ghost btn-xs text-error"
                      onClick={() => {
                        setShowMoreMenu(false);
                        onDelete(message?.uid);
                      }}
                      style={{ justifyContent: 'flex-start', padding: '0.5rem 0.65rem', fontSize: '0.8125rem', color: 'var(--color-error)', gap: '0.5rem' }}
                    >
                      <span style={{ fontSize: '1rem' }}>🗑️</span>
                      <span>Delete</span>
                    </button>
                  )}

                  {onSpam && (
                    <button
                      type="button"
                      className="btn btn-ghost btn-xs text-warning"
                      onClick={() => {
                        setShowMoreMenu(false);
                        onSpam();
                      }}
                      style={{ justifyContent: 'flex-start', padding: '0.5rem 0.65rem', fontSize: '0.8125rem', color: 'var(--color-warning)', gap: '0.5rem' }}
                    >
                      <span style={{ fontSize: '1rem' }}>⚠️</span>
                      <span>Report Spam</span>
                    </button>
                  )}

                  <a
                    className="btn btn-ghost btn-xs"
                    href={`/api/mail/message/${message.uid}/eml?folder=${message.folder || 'INBOX'}`}
                    target="_blank"
                    rel="noreferrer"
                    onClick={() => setShowMoreMenu(false)}
                    style={{ justifyContent: 'flex-start', padding: '0.5rem 0.65rem', fontSize: '0.8125rem', textDecoration: 'none', gap: '0.5rem' }}
                  >
                    <span style={{ fontSize: '1rem' }}>📥</span>
                    <span>Download Raw .eml</span>
                  </a>
                </div>
              )}
            </div>
          </div>
        </div>

      {/* ─── Private Sticky Note Card ──────────────────────── */}
      {showNoteBox && (
        <div
          className="sticky-note-card"
          style={{
            backgroundColor: currentColorObj.bg,
            borderColor: currentColorObj.border,
          }}
        >
          <div className="sticky-note-header">
            <div className="sticky-note-title-wrap">
              <span
                className="sticky-note-badge"
                style={{
                  color: currentColorObj.accent,
                  borderColor: currentColorObj.border,
                  backgroundColor: currentColorObj.bg,
                }}
              >
                AES-256 Encrypted Note
              </span>
              <span className="sticky-note-subtitle">
                Only visible to you on this email thread
              </span>
            </div>

            <div className="sticky-note-actions">
              {/* Color pickers */}
              <div className="sticky-note-colors">
                {NOTE_COLORS.map((c) => (
                  <button
                    key={c.id}
                    type="button"
                    className={`sticky-color-dot ${noteColor === c.id ? 'active' : ''}`}
                    style={{ backgroundColor: c.dot }}
                    onClick={() => {
                      setNoteColor(c.id);
                      if (noteText) saveNote(noteText, c.id);
                    }}
                    title={`${c.label} Theme`}
                  />
                ))}
              </div>

              <button
                type="button"
                className="btn btn-ghost btn-xs sticky-note-btn"
                onClick={() => setIsEditingNote(!isEditingNote)}
              >
                {isEditingNote ? 'Done' : 'Edit'}
              </button>

              <button
                type="button"
                className="btn btn-ghost btn-xs sticky-note-btn sticky-note-btn-danger"
                onClick={deleteNote}
                title="Delete note"
                style={{ display: 'inline-flex', alignItems: 'center', justifyContent: 'center' }}
              >
                <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M3 6h18"/><path d="M19 6v14c0 1-1 2-2 2H7c-1 0-2-1-2-2V6"/><path d="M8 6V4c0-1 1-2 2-2h4c1 0 2 1 2 2v2"/></svg>
              </button>

              <button
                type="button"
                className="btn btn-ghost btn-xs sticky-note-btn"
                onClick={() => setShowNoteBox(false)}
                title="Close note view"
              >
                ✕
              </button>
            </div>
          </div>

          {isEditingNote ? (
            <div className="sticky-note-edit">
              <textarea
                className="sticky-note-textarea"
                value={noteText}
                placeholder="Write private notes, phone numbers, task reminders, or follow-up memos on this thread..."
                onChange={(e) => setNoteText(e.target.value)}
                onBlur={() => saveNote(noteText, noteColor)}
                autoFocus
              />
              <div className="sticky-note-footer">
                <span className="sticky-note-status">
                  {isSavingNote ? 'Encrypting & saving...' : 'Auto-saves securely on blur'}
                </span>
                <button
                  type="button"
                  className="btn btn-sm btn-primary sticky-note-save-btn"
                  onClick={() => {
                    saveNote(noteText, noteColor);
                    setIsEditingNote(false);
                  }}
                >
                  Save Note
                </button>
              </div>
            </div>
          ) : (
            <div className="sticky-note-body" onClick={() => setIsEditingNote(true)} title="Click to edit note">
              {noteText ? (
                <p className="sticky-note-text">{noteText}</p>
              ) : (
                <p className="sticky-note-placeholder">Click to type a private note...</p>
              )}
            </div>
          )}
        </div>
      )}

      {/* Header */}
      <div className="viewer-header-info">
        {/* Archive Compliance Journal Audit Banner */}
        {message.archiveJournal && (
          <div
            className="archive-journal-banner"
            style={{
              marginBottom: '1rem',
              padding: '0.75rem 1rem',
              background: 'linear-gradient(135deg, rgba(124, 58, 237, 0.15), rgba(59, 130, 246, 0.12))',
              border: '1px solid rgba(124, 58, 237, 0.35)',
              borderRadius: 'var(--radius-md)',
              display: 'flex',
              flexDirection: 'column',
              gap: '0.35rem',
              fontSize: '0.8125rem',
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
              <span style={{ fontWeight: 700, color: 'var(--color-primary-light)', display: 'flex', alignItems: 'center', gap: '0.4rem', letterSpacing: '0.02em', textTransform: 'uppercase', fontSize: '0.75rem' }}>
                Compliance Archive Journal
              </span>
              <span className="badge badge-purple" style={{ fontSize: '0.6875rem' }}>
                {message.archiveJournal.direction ? message.archiveJournal.direction.toUpperCase() : 'OUTBOUND'}
              </span>
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: 'auto 1fr', gap: '0.25rem 0.75rem', color: 'var(--color-text-secondary)', marginTop: '0.25rem' }}>
              <strong style={{ color: 'var(--color-text-primary)' }}>Original Sender:</strong>
              <span className="mono" style={{ color: 'var(--color-text-primary)' }}>{message.archiveJournal.originalFrom || message.from?.address || '—'}</span>
              <strong style={{ color: 'var(--color-text-primary)' }}>Intended Recipient:</strong>
              <span className="mono" style={{ color: 'var(--color-text-primary)' }}>{message.archiveJournal.originalTo || (message.to || []).map((r) => r.address).join(', ') || '—'}</span>
              {message.archiveJournal.originalCc && (
                <>
                  <strong style={{ color: 'var(--color-text-primary)' }}>Original CC:</strong>
                  <span className="mono">{message.archiveJournal.originalCc}</span>
                </>
              )}
              {message.archiveJournal.alias && (
                <>
                  <strong style={{ color: 'var(--color-text-primary)' }}>Relayed Via Alias:</strong>
                  <span className="mono text-purple">{message.archiveJournal.alias}</span>
                </>
              )}
              {message.archiveJournal.timestamp && (
                <>
                  <strong style={{ color: 'var(--color-text-primary)' }}>Archived At:</strong>
                  <span>{new Date(message.archiveJournal.timestamp).toLocaleString()}</span>
                </>
              )}
            </div>
          </div>
        )}

        {/* Outbox Real-Time Delivery Tracking Banner */}
        {(message.isOutbox || message.folder === 'Outbox') && (
          <div
            className="outbox-tracking-banner"
            style={{
              marginBottom: '1rem',
              padding: '0.85rem 1rem',
              borderRadius: 'var(--radius-md)',
              border:
                message.status === 'failed'
                  ? '1px solid rgba(239, 68, 68, 0.4)'
                  : message.status === 'sent'
                  ? '1px solid rgba(34, 197, 94, 0.4)'
                  : message.status === 'queued_undo'
                  ? '1px solid rgba(245, 158, 11, 0.4)'
                  : '1px solid rgba(59, 130, 246, 0.4)',
              background:
                message.status === 'failed'
                  ? 'rgba(239, 68, 68, 0.1)'
                  : message.status === 'sent'
                  ? 'rgba(34, 197, 94, 0.1)'
                  : message.status === 'queued_undo'
                  ? 'rgba(245, 158, 11, 0.1)'
                  : 'rgba(59, 130, 246, 0.1)',
              display: 'flex',
              flexDirection: 'column',
              gap: '0.5rem',
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: '0.5rem' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                <span style={{ fontSize: '1.1rem' }}>
                  {message.status === 'failed' ? (
      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="var(--color-error)" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
    ) : message.status === 'sent' ? (
      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="var(--color-success)" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><polyline points="20 6 9 17 4 12"/></svg>
    ) : (
      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ animation: 'spin 1s linear infinite' }}><circle cx="12" cy="12" r="10"/><path d="M12 2a10 10 0 0 1 10 10"/></svg>
    )}
                </span>
                <strong style={{ fontSize: '0.9rem' }}>
                  {message.status === 'failed' && 'Delivery Failed'}
                  {message.status === 'sent' && 'Confirmed Sent via SMTP'}
                  {message.status === 'queued_undo' && 'In Undo Send Buffer'}
                  {message.status === 'sending' && 'Transmitting to Mail Server...'}
                  {message.status === 'scheduled' && 'Scheduled for Delivery'}
                </strong>
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
                {message.status === 'failed' && (
                  <button
                    type="button"
                    className="btn btn-primary btn-xs"
                    onClick={async () => {
                      try {
                        if (window.WoxToast) window.WoxToast.info('Retrying send...');
                        const res = await fetch(`/api/mail/outbox/${message.outboxId}/retry`, { method: 'POST', credentials: 'include' });
                        const data = await res.json();
                        if (!res.ok) throw new Error(data.error || 'Retry failed');
                        if (window.WoxToast) window.WoxToast.success('Email sent successfully!');
                        if (onBack) onBack();
                      } catch (err) {
                        if (window.WoxToast) window.WoxToast.error(err.message || 'Retry failed');
                      }
                    }}
                  >
                    Retry Send
                  </button>
                )}
                {(message.status === 'failed' || message.status === 'queued_undo') && (
                  <button
                    type="button"
                    className="btn btn-secondary btn-xs"
                    onClick={async () => {
                      try {
                        const res = await fetch(`/api/mail/outbox/${message.outboxId}/cancel`, { method: 'POST', credentials: 'include' });
                        const data = await res.json();
                        if (!res.ok) throw new Error(data.error || 'Cancel failed');
                        if (window.WoxToast) window.WoxToast.info('Message cancelled and removed from outbox.');
                        if (onBack) onBack();
                      } catch (err) {
                        if (window.WoxToast) window.WoxToast.error(err.message || 'Cancel failed');
                      }
                    }}
                  >
                    {message.status === 'queued_undo' ? 'Undo Send' : 'Discard'}
                  </button>
                )}
              </div>
            </div>

            {message.status === 'failed' && message.errorMessage && (
              <div style={{ fontSize: '0.8rem', color: 'var(--color-error)', background: 'rgba(0,0,0,0.2)', padding: '0.4rem 0.65rem', borderRadius: 'var(--radius-sm)' }}>
                <strong>Error details:</strong> {message.errorMessage}
              </div>
            )}

            {message.status === 'sent' && message.sentAt && (
              <div style={{ fontSize: '0.8rem', color: 'var(--color-success)' }}>
                Dispatched and saved to Sent folder on {new Date(message.sentAt).toLocaleString()}.
              </div>
            )}
          </div>
        )}

        <h2 className="viewer-subject">{message.subject || '(no subject)'}</h2>
        <div className="viewer-meta-row">
          <div
            className="viewer-from"
            style={{ cursor: 'context-menu' }}
            title="Right-click for sender options"
            onContextMenu={(e) => {
              e.preventDefault();
              e.stopPropagation();
              setContextMenu({
                x: e.clientX,
                y: e.clientY,
                title: senderEmail,
                items: [
                  {
                    label: 'View Contact Dossier in Dock',
                    icon: <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M23 21v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/></svg>,
                    onClick: () => {
                      window.dispatchEvent(new CustomEvent('woxmail:select-dossier-contact', { detail: { email: senderEmail } }));
                    },
                  },
                  {
                    label: 'Add to Trusted Senders Whitelist',
                    icon: <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/></svg>,
                    onClick: handleTrustCurrentSender,
                  },
                  {
                    label: 'Filter All Emails from this Sender',
                    icon: <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/></svg>,
                    onClick: () => {
                      window.dispatchEvent(new CustomEvent('woxmail:global-search', { detail: { query: `from:${senderEmail}` } }));
                    },
                  },
                  { divider: true },
                  {
                    label: 'Copy Sender Address',
                    icon: <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect width="14" height="14" x="8" y="8" rx="2" ry="2"/><path d="M4 16c-1.1 0-2-.9-2-2V4c0-1.1.9-2 2-2h10c1.1 0 2 .9 2 2"/></svg>,
                    onClick: () => {
                      navigator.clipboard.writeText(senderEmail);
                      if (window.WoxToast) window.WoxToast.success('Sender address copied');
                    },
                  },
                ],
              });
            }}
          >
            <strong>{message.from?.name || message.from?.address || 'Unknown'}</strong>
            {message.from?.name && (
              <span className="text-tertiary"> &lt;{message.from.address}&gt;</span>
            )}
          </div>
          <span className="viewer-date">
            {message.date ? new Date(message.date).toLocaleString() : ''}
          </span>
        </div>

        {/* Recipients */}
        <div className="viewer-recipients text-tertiary" style={{ fontSize: '0.8125rem' }}>
          <span>To: {(message.to || []).map((r) => r.name || r.address).join(', ')}</span>
          {message.cc?.length > 0 && (
            <span> · CC: {message.cc.map((r) => r.name || r.address).join(', ')}</span>
          )}
        </div>

        {/* Real-Time Read Receipt & Open Tracking Status (for Outbound / Sent Emails) */}
        {message.trackingInfo && (
          <div
            className="read-receipt-card"
            style={{
              marginTop: '0.75rem',
              marginBottom: '0.5rem',
              padding: '0.75rem 1rem',
              borderRadius: 'var(--radius-md)',
              border: message.trackingInfo.opened_at
                ? '1px solid rgba(34, 197, 94, 0.35)'
                : '1px solid rgba(245, 158, 11, 0.35)',
              background: message.trackingInfo.opened_at
                ? 'rgba(34, 197, 94, 0.08)'
                : 'rgba(245, 158, 11, 0.08)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              flexWrap: 'wrap',
              gap: '0.5rem',
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.6rem' }}>
              <span style={{ fontSize: '1.2rem' }}>
                {message.trackingInfo.opened_at ? '👁️' : '⏳'}
              </span>
              <div>
                <div style={{ display: 'flex', alignItems: 'center', gap: '0.45rem' }}>
                  <strong style={{ fontSize: '0.875rem', color: 'var(--color-text-primary)' }}>
                    {message.trackingInfo.opened_at
                      ? `Read by recipient (${message.trackingInfo.open_count} time${message.trackingInfo.open_count > 1 ? 's' : ''})`
                      : 'Delivered — Awaiting Recipient Open'}
                  </strong>
                  <span
                    className={`badge ${message.trackingInfo.opened_at ? 'badge-green' : 'badge-amber'}`}
                    style={{ fontSize: '0.7rem', padding: '0.1rem 0.45rem' }}
                  >
                    {message.trackingInfo.opened_at ? '✓✓ Read' : '✓ Unopened'}
                  </span>
                </div>
                <p style={{ margin: '0.15rem 0 0 0', fontSize: '0.75rem', color: 'var(--color-text-secondary)' }}>
                  {message.trackingInfo.opened_at
                    ? `First read on ${new Date(message.trackingInfo.opened_at).toLocaleString()}${message.trackingInfo.last_user_agent ? ` · Device: ${message.trackingInfo.last_user_agent.split(' ')[0]}` : ''}`
                    : `Dispatched with active open tracking pixel · Sent to ${message.trackingInfo.recipient_email}`}
                </p>
              </div>
            </div>
          </div>
        )}

        {/* Tracker & Unsubscribe info */}
        <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap', marginTop: '0.5rem', alignItems: 'center' }}>
          {message.trackersBlocked > 0 && (
            <div className="viewer-tracker-info" style={{ display: 'inline-flex', alignItems: 'center', gap: '0.4rem', background: 'rgba(34, 197, 94, 0.15)', color: 'var(--color-success)', padding: '0.25rem 0.6rem', borderRadius: 'var(--radius-pill)', fontSize: '0.75rem', fontWeight: 600 }}>
              {message.trackersBlocked} Spy Tracker{message.trackersBlocked > 1 ? 's' : ''} Deflected & Removed
            </div>
          )}

          {message.unsubscribe && (
            <button
              type="button"
              className="btn btn-secondary btn-xs"
              style={{
                fontSize: '0.75rem',
                padding: '0.25rem 0.6rem',
                borderColor: 'var(--color-border)',
                background: 'rgba(239, 68, 68, 0.1)',
                color: 'var(--color-error)',
                fontWeight: 600,
              }}
              onClick={async () => {
                try {
                  const res = await fetch(`/api/mail/unsubscribe/${message.uid}?folder=${encodeURIComponent(message.folder || 'INBOX')}`, {
                    method: 'POST',
                    credentials: 'include',
                  });
                  const data = await res.json();
                  if (data.method === 'browser' && data.url) {
                    window.open(data.url, '_blank');
                  } else {
                    alert(data.message || 'Unsubscribe request completed.');
                  }
                } catch (err) {
                  alert('Unsubscribe failed: ' + err.message);
                }
              }}
              title="RFC 8058 One-Click List Unsubscribe"
            >
              One-Click Unsubscribe
            </button>
          )}
        </div>
      </div>

        {/* Email Privacy & Remote Content Security Banner */}
        {hasRemoteImages && !allowImagesThisEmail && (
          <div
            className="viewer-security-banner"
            style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              flexWrap: 'wrap',
              gap: '0.75rem',
              padding: '0.75rem 1rem',
              background: 'rgba(124, 58, 237, 0.08)',
              border: '1px solid rgba(139, 92, 246, 0.25)',
              borderRadius: 'var(--radius-md)',
              marginTop: '0.75rem',
              marginBottom: '0.75rem',
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.65rem' }}>
              <span style={{ fontSize: '1.25rem' }}>🛡️</span>
              <div>
                <strong style={{ fontSize: '0.85rem', color: 'var(--color-text-primary)' }}>Remote images & tracking beacons are blocked</strong>
                <p style={{ margin: 0, fontSize: '0.75rem', color: 'var(--color-text-secondary)' }}>Images are blocked to prevent the sender from tracking your location and IP. You can safely load them below.</p>
              </div>
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
              <button
                type="button"
                className="btn btn-primary btn-xs"
                onClick={() => setAllowImagesThisEmail(true)}
                style={{ fontWeight: 600 }}
              >
                Load Images
              </button>
              {senderEmail && (
                <button
                  type="button"
                  className="btn btn-secondary btn-xs"
                  onClick={handleTrustSender}
                  title={`Always load remote images from ${senderEmail}`}
                >
                  Always trust {senderEmail.length > 22 ? senderEmail.slice(0, 19) + '…' : senderEmail}
                </button>
              )}
              <button
                type="button"
                className="btn btn-ghost btn-xs"
                onClick={() => setShowPrivacyModal(true)}
                title="Configure viewer privacy & script permissions"
              >
                ⚙️ Options
              </button>
            </div>
          </div>
        )}

        {/* Dynamic Scripts Sandboxed Alert */}
        {allowScriptsThisEmail && (
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              padding: '0.5rem 0.85rem',
              background: 'rgba(239, 68, 68, 0.1)',
              border: '1px solid rgba(239, 68, 68, 0.3)',
              borderRadius: 'var(--radius-md)',
              marginTop: '0.5rem',
              marginBottom: '0.75rem',
              fontSize: '0.75rem',
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', color: 'var(--color-error)' }}>
              <span>⚡</span>
              <span><strong>Dynamic JavaScript Active:</strong> Sandboxed execution is enabled for this email.</span>
            </div>
            <button
              type="button"
              className="btn btn-ghost btn-xs"
              onClick={() => setAllowScriptsThisEmail(false)}
              style={{ color: 'var(--color-error)', fontWeight: 600, padding: '0.1rem 0.4rem' }}
            >
              Disable Scripts
            </button>
          </div>
        )}

        {/* Body */}
        <div className="viewer-body-container">
          {message.html ? (
            <iframe
              key={`email-body-${message.uid}-${allowScriptsThisEmail ? 'scripts' : 'safe'}-${allowImagesThisEmail ? 'images' : 'noimages'}`}
              ref={iframeRef}
              sandbox={allowScriptsThisEmail ? "allow-scripts allow-same-origin allow-popups allow-forms" : "allow-same-origin allow-popups"}
              className="viewer-iframe"
              title="Email content"
            />
          ) : (
            <pre className="viewer-text">{message.text || 'No content'}</pre>
          )}
        </div>

      {/* ─── Embedded Web Previews Tray ────────────────── */}
      <LinkPreviewTray
        message={message}
        onOpenModalPreview={(url, preview) => setModalPreview({ url, preview })}
      />

      {/* ─── Interactive Safe Web Preview Modal ─────────── */}
      {modalPreview && (
        <LinkPreviewModal
          url={modalPreview.url}
          preview={modalPreview.preview}
          onClose={() => setModalPreview(null)}
        />
      )}

      {/* Attachments */}
      {message.attachments?.length > 0 && (
        <div className="viewer-attachments">
          <div className="viewer-attachments-title" style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '0.75rem' }}>
            <span style={{ fontWeight: 600, fontSize: '0.875rem' }}>
              {message.attachments.length} attachment{message.attachments.length > 1 ? 's' : ''}
            </span>
            <span className="text-secondary" style={{ fontSize: '0.75rem' }}>
              Click any file to preview in-app or download
            </span>
          </div>
          <div className="viewer-attachments-list" style={{ display: 'flex', flexWrap: 'wrap', gap: '0.75rem' }}>
            {message.attachments.map((att, i) => {
              const filename = att.filename || `attachment-${i + 1}`;
              const ext = filename.split('.').pop()?.toLowerCase() || '';
              const contentType = (att.contentType || '').toLowerCase();
              const isImg = contentType.startsWith('image/') || ['png', 'jpg', 'jpeg', 'gif', 'webp', 'svg'].includes(ext);
              const isPdf = contentType === 'application/pdf' || ext === 'pdf';
              const isAudio = contentType.startsWith('audio/') || ['mp3', 'wav', 'ogg'].includes(ext);
              const isVideo = contentType.startsWith('video/') || ['mp4', 'webm'].includes(ext);
              const isTxt = contentType.startsWith('text/') || ['txt', 'json', 'csv', 'log', 'dat', 'xml', 'md'].includes(ext);
              const isArchive = ['zip', 'tar', 'gz', '7z', 'rar'].includes(ext);

              const icon = '';
              const attWithIndex = { ...att, index: att.index !== undefined ? att.index : i };
              const downloadUrl = `/api/mail/message/${message.uid}/attachment/${encodeURIComponent(i)}?download=true&folder=${encodeURIComponent(message.folder || 'INBOX')}`;

              return (
                <div
                  key={i}
                  className="viewer-attachment-card"
                  onClick={() => setPreviewAttachment(attWithIndex)}
                  onContextMenu={(e) => {
                    e.preventDefault();
                    e.stopPropagation();
                    setContextMenu({
                      x: e.clientX,
                      y: e.clientY,
                      title: filename,
                      items: [
                        {
                          label: 'Quick Sandboxed Preview',
                          icon: <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M2 12s3-7 10-7 10 7 10 7-3 7-10 7-10-7-10-7Z"/><circle cx="12" cy="12" r="3"/></svg>,
                          onClick: () => setPreviewAttachment(attWithIndex),
                        },
                        {
                          label: 'Download File',
                          icon: <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/></svg>,
                          onClick: () => {
                            const a = document.createElement('a');
                            a.href = downloadUrl;
                            a.download = filename;
                            a.click();
                          },
                        },
                        {
                          label: 'Inspect SHA-256 Checksum',
                          icon: <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/></svg>,
                          onClick: () => setPreviewAttachment({ ...attWithIndex, showChecksumInitial: true }),
                        },
                        { divider: true },
                        {
                          label: 'Copy Download Link',
                          icon: <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect width="14" height="14" x="8" y="8" rx="2" ry="2"/><path d="M4 16c-1.1 0-2-.9-2-2V4c0-1.1.9-2 2-2h10c1.1 0 2 .9 2 2"/></svg>,
                          onClick: () => {
                            navigator.clipboard.writeText(new URL(downloadUrl, window.location.origin).toString());
                            if (window.WoxToast) window.WoxToast.success('Attachment link copied');
                          },
                        },
                      ],
                    });
                  }}
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: '0.625rem',
                    padding: '0.5rem 0.875rem',
                    background: 'var(--color-bg-card)',
                    border: '1px solid var(--color-border)',
                    borderRadius: 'var(--radius-md)',
                    cursor: 'pointer',
                    transition: 'all 150ms ease',
                    userSelect: 'none',
                    boxShadow: 'var(--shadow-sm)',
                  }}
                  onMouseEnter={(e) => {
                    e.currentTarget.style.borderColor = 'var(--color-primary-light)';
                    e.currentTarget.style.background = 'var(--color-bg-hover)';
                    e.currentTarget.style.transform = 'translateY(-1px)';
                  }}
                  onMouseLeave={(e) => {
                    e.currentTarget.style.borderColor = 'var(--color-border)';
                    e.currentTarget.style.background = 'var(--color-bg-card)';
                    e.currentTarget.style.transform = 'translateY(0)';
                  }}
                  title={`Preview ${filename}`}
                >
                  <span style={{ fontSize: '1.25rem', flexShrink: 0 }}>{icon}</span>
                  <div style={{ display: 'flex', flexDirection: 'column', minWidth: 0 }}>
                    <span
                      style={{
                        fontWeight: 600,
                        fontSize: '0.8125rem',
                        color: 'var(--color-text-primary)',
                        maxWidth: '180px',
                        overflow: 'hidden',
                        textOverflow: 'ellipsis',
                        whiteSpace: 'nowrap',
                      }}
                      title={filename}
                    >
                      {filename}
                    </span>
                    <span className="text-secondary" style={{ fontSize: '0.6875rem' }}>
                      {att.size ? (att.size < 1024 ? `${att.size} B` : att.size < 1048576 ? `${Math.round(att.size / 1024)} KB` : `${(att.size / 1048576).toFixed(1)} MB`) : 'Ready'}
                    </span>
                  </div>

                  <div style={{ display: 'flex', gap: '0.25rem', marginLeft: '0.5rem', alignItems: 'center' }}>
                    <button
                      type="button"
                      className="btn btn-ghost btn-xs"
                      onClick={(e) => {
                        e.stopPropagation();
                        setPreviewAttachment(attWithIndex);
                      }}
                      style={{ padding: '0.2rem 0.4rem', fontSize: '0.75rem', display: 'inline-flex', alignItems: 'center', justifyContent: 'center' }}
                      title="Preview in-app"
                    >
                      <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M2 12s3-7 10-7 10 7 10 7-3 7-10 7-10-7-10-7Z"/><circle cx="12" cy="12" r="3"/></svg>
                    </button>
                    <a
                      href={downloadUrl}
                      download={filename}
                      className="btn btn-ghost btn-xs"
                      onClick={(e) => e.stopPropagation()}
                      style={{ padding: '0.2rem 0.4rem', fontSize: '0.75rem', textDecoration: 'none', color: 'inherit', display: 'inline-flex', alignItems: 'center', justifyContent: 'center' }}
                      title="Download file"
                    >
                      <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/></svg>
                    </a>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* ─── Bottom Quick Reply / Actions Bar ────────────────── */}
      <div
        className="viewer-quick-reply-card"
        style={{
          marginTop: '1.5rem',
          marginBottom: '2rem',
          padding: '1.25rem',
          background: 'var(--color-bg-card)',
          border: '1px solid var(--color-border)',
          borderRadius: 'var(--radius-lg)',
          boxShadow: 'var(--shadow-md)',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '0.75rem', flexWrap: 'wrap', gap: '0.5rem' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
            <div style={{
              width: 28,
              height: 28,
              borderRadius: '50%',
              background: 'var(--color-primary-glow)',
              color: 'var(--color-primary-light)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              fontWeight: 700,
              fontSize: '0.875rem',
            }}>
              ↩
            </div>
            <span style={{ fontSize: '0.875rem', fontWeight: 600, color: 'var(--color-text-primary)' }}>
              Reply to {message.from?.name || message.from?.address || 'sender'}
            </span>
          </div>

          <div style={{ display: 'flex', gap: '0.4rem' }}>
            <button
              type="button"
              className="btn btn-primary btn-xs"
              onClick={onReply}
              style={{ display: 'inline-flex', alignItems: 'center', gap: '0.3rem', fontSize: '0.75rem' }}
            >
              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"><polyline points="9 17 4 12 9 7"/><path d="M20 18v-2a4 4 0 0 0-4-4H4"/></svg>
              <span>Reply</span>
            </button>
            <button
              type="button"
              className="btn btn-secondary btn-xs"
              onClick={onReplyAll}
              style={{ display: 'inline-flex', alignItems: 'center', gap: '0.3rem', fontSize: '0.75rem' }}
            >
              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"><polyline points="7 17 2 12 7 7"/><polyline points="12 17 7 12 12 7"/><path d="M22 18v-2a4 4 0 0 0-4-4H7"/></svg>
              <span>Reply All</span>
            </button>
            <button
              type="button"
              className="btn btn-ghost btn-xs"
              onClick={onForward}
              style={{ display: 'inline-flex', alignItems: 'center', gap: '0.3rem', fontSize: '0.75rem' }}
            >
              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"><polyline points="15 17 20 12 15 7"/><path d="M4 18v-2a4 4 0 0 1 4-4h12"/></svg>
              <span>Forward</span>
            </button>
          </div>
        </div>

        <div
          onClick={onReply}
          style={{
            padding: '0.875rem 1rem',
            background: 'var(--color-bg-input)',
            border: '1px dashed var(--color-border)',
            borderRadius: 'var(--radius-md)',
            color: 'var(--color-text-tertiary)',
            fontSize: '0.875rem',
            cursor: 'pointer',
            transition: 'all 150ms ease',
          }}
          onMouseEnter={(e) => {
            e.currentTarget.style.borderColor = 'var(--color-primary)';
            e.currentTarget.style.color = 'var(--color-text-primary)';
          }}
          onMouseLeave={(e) => {
            e.currentTarget.style.borderColor = 'var(--color-border)';
            e.currentTarget.style.color = 'var(--color-text-tertiary)';
          }}
        >
          Click here to write a fast reply, or press shortcut <kbd style={{ padding: '0.1rem 0.35rem', background: 'rgba(255,255,255,0.08)', borderRadius: 4, fontSize: '0.75rem', color: 'var(--color-primary-light)' }}>R</kbd>...
        </div>
      </div>

      {/* Interactive Lightbox Attachment Preview Modal */}
      {previewAttachment && (
        <AttachmentPreviewModal
          attachment={previewAttachment}
          messageUid={message.uid}
          folder={message.folder || 'INBOX'}
          onClose={() => setPreviewAttachment(null)}
        />
      )}

      {/* Security & Header Inspector Modal */}
      {showHeadersModal && (
        <div className="compose-overlay" onClick={() => setShowHeadersModal(false)}>
          <div className="compose-modal card" style={{ maxWidth: 720, maxHeight: '85vh', display: 'flex', flexDirection: 'column' }} onClick={(e) => e.stopPropagation()}>
            <div className="compose-header">
              <h3>Security & RFC822 Header Inspector</h3>
              <button type="button" className="btn btn-ghost btn-xs" onClick={() => setShowHeadersModal(false)}>✕</button>
            </div>

            <div style={{ padding: '1.25rem', overflowY: 'auto', flex: 1, display: 'flex', flexDirection: 'column', gap: '1rem' }}>
              {loadingHeaders ? (
                <div style={{ padding: '2rem', textAlign: 'center' }} className="text-secondary">Analyzing security headers...</div>
              ) : headersData ? (
                <>
                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(140px, 1fr))', gap: '0.75rem' }}>
                    <div className="card" style={{ padding: '0.75rem', background: 'var(--color-bg-page)', textAlign: 'center' }}>
                      <span className="text-secondary" style={{ fontSize: '0.75rem', display: 'block' }}>SPF VERDICT</span>
                      <strong className={headersData.security?.spf === 'PASS' ? 'text-green' : 'text-secondary'}>
                        {headersData.security?.spf === 'PASS' ? 'PASS' : 'NEUTRAL'}
                      </strong>
                    </div>
                    <div className="card" style={{ padding: '0.75rem', background: 'var(--color-bg-page)', textAlign: 'center' }}>
                      <span className="text-secondary" style={{ fontSize: '0.75rem', display: 'block' }}>DKIM SIGNATURE</span>
                      <strong className={headersData.security?.dkim === 'PASS' ? 'text-green' : 'text-secondary'}>
                        {headersData.security?.dkim === 'PASS' ? 'PASS' : 'NEUTRAL'}
                      </strong>
                    </div>
                    <div className="card" style={{ padding: '0.75rem', background: 'var(--color-bg-page)', textAlign: 'center' }}>
                      <span className="text-secondary" style={{ fontSize: '0.75rem', display: 'block' }}>DMARC POLICY</span>
                      <strong className={headersData.security?.dmarc === 'PASS' ? 'text-green' : 'text-secondary'}>
                        {headersData.security?.dmarc === 'PASS' ? 'ALIGNED' : 'NONE'}
                      </strong>
                    </div>
                    <div className="card" style={{ padding: '0.75rem', background: 'var(--color-bg-page)', textAlign: 'center' }}>
                      <span className="text-secondary" style={{ fontSize: '0.75rem', display: 'block' }}>TRANSPORT</span>
                      <strong className="text-purple">{headersData.security?.tls || 'Standard'}</strong>
                    </div>
                  </div>

                  <div>
                    <h4 style={{ margin: '0 0 0.5rem', fontSize: '0.875rem' }}>MTA Transit Hops ({headersData.hops?.length || 0})</h4>
                    <div style={{ background: 'var(--color-bg-page)', border: '1px solid var(--color-border)', borderRadius: 'var(--radius-md)', padding: '0.75rem', fontSize: '0.75rem', display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
                      {headersData.hops?.map((hop) => (
                        <div key={hop.index} style={{ borderBottom: '1px solid var(--color-border-subtle)', paddingBottom: '0.25rem' }}>
                          <span className="mono text-purple" style={{ fontWeight: 700 }}>Hop #{hop.index}: </span>
                          <span className="mono">{hop.from}</span> &rarr; <span className="mono text-green">{hop.by}</span>
                          {hop.date && <div className="text-secondary" style={{ fontSize: '0.6875rem' }}>{hop.date}</div>}
                        </div>
                      ))}
                    </div>
                  </div>

                  <div>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.25rem' }}>
                      <h4 style={{ margin: 0, fontSize: '0.875rem' }}>Raw RFC822 Header Map</h4>
                      <button
                        type="button"
                        className="btn btn-secondary btn-xs"
                        onClick={() => {
                          navigator.clipboard.writeText(JSON.stringify(headersData.rawHeaders, null, 2));
                          alert('Copied raw headers to clipboard!');
                        }}
                      >
                        Copy JSON
                      </button>
                    </div>
                    <pre className="input mono" style={{ fontSize: '0.6875rem', height: 160, overflowY: 'auto', whiteSpace: 'pre-wrap' }}>
                      {JSON.stringify(headersData.rawHeaders, null, 2)}
                    </pre>
                  </div>
                </>
              ) : (
                <div className="text-secondary">No header information available.</div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* ─── Clean Reader Mode Modal ──────── */}
      {readerArticle && (
        <div
          className="modal-backdrop"
          style={{ position: 'fixed', inset: 0, zIndex: 9998, background: 'rgba(0,0,0,0.7)', backdropFilter: 'blur(6px)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '1rem' }}
          onClick={() => setReaderArticle(null)}
        >
          <div
            className="modal-card card"
            style={{ maxWidth: 800, width: '100%', maxHeight: '85vh', display: 'flex', flexDirection: 'column', padding: 0, overflow: 'hidden' }}
            onClick={(e) => e.stopPropagation()}
          >
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '1rem 1.5rem', borderBottom: '1px solid var(--color-border)' }}>
              <div>
                <span className="badge badge-purple" style={{ marginBottom: '0.35rem' }}>Clean Reader Mode</span>
                <h3 style={{ margin: 0, fontSize: '1.125rem' }}>{readerArticle.title}</h3>
                <span className="text-secondary" style={{ fontSize: '0.75rem' }}>{readerArticle.domain}</span>
              </div>
              <button type="button" className="btn btn-ghost btn-sm" onClick={() => setReaderArticle(null)}>
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
              </button>
            </div>
            <div style={{ flex: 1, overflowY: 'auto', padding: '1.5rem', lineHeight: 1.8, fontSize: '0.9375rem' }}>
              <div
                className="reader-content"
                dangerouslySetInnerHTML={{ __html: readerArticle.contentHtml }}
              />
            </div>
          </div>
        </div>
      )}

      {/* ─── Domain Security & SSL Audit Modal ──────── */}
      {securityReport && (
        <div
          className="modal-backdrop"
          style={{ position: 'fixed', inset: 0, zIndex: 9998, background: 'rgba(0,0,0,0.7)', backdropFilter: 'blur(6px)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '1rem' }}
          onClick={() => setSecurityReport(null)}
        >
          <div
            className="modal-card card"
            style={{ maxWidth: 640, width: '100%', maxHeight: '85vh', display: 'flex', flexDirection: 'column', padding: '1.5rem', gap: '1rem', overflowY: 'auto' }}
            onClick={(e) => e.stopPropagation()}
          >
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', borderBottom: '1px solid var(--color-border)', paddingBottom: '0.75rem' }}>
              <div>
                <span className={`badge ${securityReport.securityVerdict === 'SAFE' ? 'badge-green' : 'badge-amber'}`} style={{ marginBottom: '0.35rem' }}>
                  Verdict: {securityReport.securityVerdict}
                </span>
                <h3 style={{ margin: 0, fontSize: '1.125rem' }}>Domain & SSL Security Audit</h3>
              </div>
              <button type="button" className="btn btn-ghost btn-sm" onClick={() => setSecurityReport(null)}>
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
              </button>
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(140px, 1fr))', gap: '0.75rem' }}>
              <div className="card" style={{ padding: '0.75rem', background: 'var(--color-bg-page)', textAlign: 'center' }}>
                <span className="text-secondary" style={{ fontSize: '0.75rem', display: 'block' }}>DOMAIN</span>
                <strong>{securityReport.domain}</strong>
              </div>
              <div className="card" style={{ padding: '0.75rem', background: 'var(--color-bg-page)', textAlign: 'center' }}>
                <span className="text-secondary" style={{ fontSize: '0.75rem', display: 'block' }}>PROTOCOL</span>
                <strong className={securityReport.isHttps ? 'text-green' : 'text-amber'}>{securityReport.protocol || 'https:'}</strong>
              </div>
              <div className="card" style={{ padding: '0.75rem', background: 'var(--color-bg-page)', textAlign: 'center' }}>
                <span className="text-secondary" style={{ fontSize: '0.75rem', display: 'block' }}>REDIRECT HOPS</span>
                <strong>{securityReport.redirectCount || (securityReport.redirectChain ? securityReport.redirectChain.length - 1 : 0)}</strong>
              </div>
            </div>

            {securityReport.homograph?.isSpoofRisk && (
              <div style={{ background: 'rgba(239, 68, 68, 0.15)', border: '1px solid var(--color-error)', borderRadius: 'var(--radius-md)', padding: '0.75rem', color: 'var(--color-error)', fontSize: '0.8125rem' }}>
                <strong>Warning: Homograph Spoof Risk Detected</strong>
                <p style={{ margin: '0.25rem 0 0 0' }}>{securityReport.homograph.details}</p>
              </div>
            )}

            <div>
              <h4 style={{ margin: '0 0 0.5rem', fontSize: '0.875rem' }}>Destination & Redirect Chain</h4>
              <div style={{ background: 'var(--color-bg-page)', border: '1px solid var(--color-border)', borderRadius: 'var(--radius-md)', padding: '0.75rem', fontSize: '0.75rem', display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
                {securityReport.redirectChain?.map((url, idx) => (
                  <div key={idx} style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                    <span className="badge badge-purple" style={{ fontSize: '0.6875rem' }}>Hop #{idx + 1}</span>
                    <span className="mono truncate" title={url} style={{ flex: 1 }}>{url}</span>
                  </div>
                ))}
              </div>
            </div>

            <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: '0.5rem' }}>
              <button type="button" className="btn btn-secondary" onClick={() => setSecurityReport(null)}>
                Close Audit
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ─── Email Privacy & Security Controls Modal ──────── */}
      <EmailPrivacyModal
        currentSender={senderEmail}
        isOpen={showPrivacyModal}
        onClose={() => setShowPrivacyModal(false)}
        allowImagesThisEmail={allowImagesThisEmail}
        setAllowImagesThisEmail={setAllowImagesThisEmail}
        allowScriptsThisEmail={allowScriptsThisEmail}
        setAllowScriptsThisEmail={setAllowScriptsThisEmail}
        onPrefsChanged={(updated) => {
          setPrivacyPrefs(updated);
        }}
      />

      {/* Context Menu on Links / Selections */}
      {contextMenu && (
        <ContextMenu
          x={contextMenu.x}
          y={contextMenu.y}
          items={contextMenu.items}
          title={contextMenu.title}
          onClose={() => setContextMenu(null)}
        />
      )}
      </div>
    </section>
  );
}
