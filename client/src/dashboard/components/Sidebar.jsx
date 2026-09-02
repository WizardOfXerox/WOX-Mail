import React, { useState, useEffect } from 'react';
import { createPortal } from 'react-dom';
import { post, del } from '../../shared/api.js';

const SYSTEM_FOLDERS = [
  { name: 'INBOX', label: 'Inbox', specialUse: '\\Inbox' },
  { name: 'The Feed', label: 'The Feed', specialUse: null },
  { name: 'Paper Trail', label: 'Paper Trail', specialUse: null },
  { name: 'Promotions', label: 'Promotions', specialUse: '\\Promotions' },
  { name: 'Social', label: 'Social', specialUse: '\\Social' },
  { name: 'Starred', label: 'Starred', specialUse: null },
  { name: 'Archive', label: 'Archive', specialUse: '\\Archive' },
  { name: 'Sent', label: 'Sent', specialUse: '\\Sent' },
  { name: 'Outbox', label: 'Outbox', specialUse: null },
  { name: 'Drafts', label: 'Drafts', specialUse: '\\Drafts' },
  { name: 'Trash', label: 'Trash', specialUse: '\\Trash' },
  { name: 'Spam', label: 'Spam', specialUse: '\\Junk' },
];

export const getFolderIcon = (name, specialUse) => {
  const lower = (name || '').toLowerCase();
  if (lower === '__all_inboxes' || lower === 'all inboxes') {
    return (
      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <polyline points="22 12 16 12 14 15 10 15 8 12 2 12" />
        <path d="M5.45 5.11 2 12v6a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2v-6l-3.45-6.89A2 2 0 0 0 16.76 4H7.24a2 2 0 0 0-1.79 1.11z" />
        <path d="M6 16l-2-4 1.5-3" />
        <path d="M18 16l2-4-1.5-3" />
      </svg>
    );
  }
  if (lower === 'inbox' || specialUse === '\\Inbox') {
    return (
      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <polyline points="22 12 16 12 14 15 10 15 8 12 2 12" />
        <path d="M5.45 5.11 2 12v6a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2v-6l-3.45-6.89A2 2 0 0 0 16.76 4H7.24a2 2 0 0 0-1.79 1.11z" />
      </svg>
    );
  }
  if (lower === 'the feed') {
    return (
      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <path d="M4 11a9 9 0 0 1 9 9" />
        <path d="M4 4a16 16 0 0 1 16 16" />
        <circle cx="5" cy="19" r="1" />
      </svg>
    );
  }
  if (lower === 'paper trail') {
    return (
      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
        <polyline points="14 2 14 8 20 8" />
        <line x1="16" y1="13" x2="8" y2="13" />
        <line x1="16" y1="17" x2="8" y2="17" />
        <polyline points="10 9 9 9 8 9" />
      </svg>
    );
  }
  if (lower === 'promotions' || specialUse === '\\Promotions') {
    return (
      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <path d="M20.59 13.41l-7.17 7.17a2 2 0 0 1-2.83 0L2 12V2h10l8.59 8.59a2 2 0 0 1 0 2.82z" />
        <line x1="7" y1="7" x2="7.01" y2="7" />
      </svg>
    );
  }
  if (lower === 'social' || specialUse === '\\Social') {
    return (
      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2" />
        <circle cx="9" cy="7" r="4" />
        <path d="M23 21v-2a4 4 0 0 0-3-3.87" />
        <path d="M16 3.13a4 4 0 0 1 0 7.75" />
      </svg>
    );
  }
  if (lower === 'sent' || specialUse === '\\Sent') {
    return (
      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <line x1="22" y1="2" x2="11" y2="13" />
        <polygon points="22 2 15 22 11 13 2 9 22 2" />
      </svg>
    );
  }
  if (lower === 'outbox') {
    return (
      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <polyline points="16 16 12 12 8 16" />
        <line x1="12" y1="12" x2="12" y2="21" />
        <path d="M20.39 18.39A5 5 0 0 0 18 9h-1.26A8 8 0 1 0 3 16.3" />
      </svg>
    );
  }
  if (lower === 'drafts' || specialUse === '\\Drafts') {
    return (
      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7" />
        <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z" />
      </svg>
    );
  }
  if (lower === 'starred') {
    return (
      <svg width="16" height="16" viewBox="0 0 24 24" fill="#f59e0b" stroke="#f59e0b" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2" />
      </svg>
    );
  }
  if (lower === 'archive' || specialUse === '\\Archive' || lower === 'all mail') {
    return (
      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <polyline points="21 8 21 21 3 21 3 8" />
        <rect width="22" height="5" x="1" y="3" />
        <line x1="10" x2="14" y1="12" y2="12" />
      </svg>
    );
  }
  if (lower === 'trash' || specialUse === '\\Trash') {
    return (
      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <path d="M3 6h18" />
        <path d="M19 6v14c0 1-1 2-2 2H7c-1 0-2-1-2-2V6" />
        <path d="M8 6V4c0-1 1-2 2-2h4c1 0 2 1 2 2v2" />
      </svg>
    );
  }
  if (lower === 'spam' || lower === 'junk' || specialUse === '\\Junk') {
    return (
      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" />
      </svg>
    );
  }
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z" />
    </svg>
  );
};

export default function Sidebar({
  user,
  folders = [],
  refetchFolders,
  activeFolder,
  isOpen,
  collapsed = false,
  onToggleCollapse,
  onClose,
  onFolderChange,
  onOpenSupport,
  onOpenTheme,
  onCompose,
  onUnlockProton,
}) {
  const [screenerPendingCount, setScreenerPendingCount] = useState(0);
  const [showAccountSwitcher, setShowAccountSwitcher] = useState(false);
  const [savedAccounts, setSavedAccounts] = useState([]);
  const [showCreateFolderModal, setShowCreateFolderModal] = useState(false);
  const [newFolderName, setNewFolderName] = useState('');
  const [folderLoading, setFolderLoading] = useState(false);
  const [canInstallPwa, setCanInstallPwa] = useState(() => {
    return typeof window !== 'undefined' && !window.matchMedia('(display-mode: standalone)').matches && !(window.navigator.standalone === true);
  });
  const [isMobile, setIsMobile] = useState(() => typeof window !== 'undefined' ? window.innerWidth < 768 : false);

  useEffect(() => {
    const handleResize = () => setIsMobile(window.innerWidth < 768);
    window.addEventListener('resize', handleResize, { passive: true });
    return () => window.removeEventListener('resize', handleResize);
  }, []);

  const isEffectivelyCollapsed = collapsed && !isMobile;

  useEffect(() => {
    const handlePrompt = () => setCanInstallPwa(true);
    window.addEventListener('beforeinstallprompt', handlePrompt);
    window.addEventListener('appinstalled', () => setCanInstallPwa(false));
    return () => {
      window.removeEventListener('beforeinstallprompt', handlePrompt);
    };
  }, []);

  useEffect(() => {
    if (user && window.WoxAccountManager) {
      window.WoxAccountManager.syncCurrentSession(user);
    }
  }, [user]);

  // Fetch pending screener quarantine count
  useEffect(() => {
    let isMounted = true;
    const fetchScreenerCount = async () => {
      try {
        const res = await fetch('/api/screener/pending/count', { credentials: 'include' });
        const data = await res.json();
        if (isMounted) setScreenerPendingCount(data.count || 0);
      } catch {}
    };
    fetchScreenerCount();
    const interval = setInterval(fetchScreenerCount, 30000);
    return () => {
      isMounted = false;
      clearInterval(interval);
    };
  }, []);

  // Merge system folders with IMAP folder counts
  const enrichedFolders = SYSTEM_FOLDERS.map((sf) => {
    const match = folders.find((f) => {
      if (!f) return false;
      const fName = (f.name || '').toLowerCase();
      const fPath = (f.path || '').toLowerCase();
      const sfName = sf.name.toLowerCase();

      // Direct name or path match
      if (fName === sfName || fPath === sfName) return true;

      // Special-use match (strictly non-null)
      if (sf.specialUse && f.specialUse === sf.specialUse) return true;

      // Provider-specific aliases (e.g. Gmail [Gmail]/Bin, [Gmail]/Sent Mail, [Gmail]/Drafts)
      if (sf.name === 'Spam' && (fName === 'junk' || f.specialUse === '\\Junk' || fPath.includes('spam') || fPath.includes('junk'))) return true;
      if (sf.name === 'Trash' && (fName === 'bin' || fName === 'deleted' || f.specialUse === '\\Trash' || fPath.includes('trash') || fPath.includes('bin'))) return true;
      if (sf.name === 'Sent' && (fName.includes('sent') || f.specialUse === '\\Sent' || fPath.includes('sent'))) return true;
      if (sf.name === 'Drafts' && (fName.includes('draft') || f.specialUse === '\\Drafts' || fPath.includes('draft'))) return true;
      if (sf.name === 'Archive' && (fName === 'all mail' || f.specialUse === '\\Archive' || f.specialUse === '\\All' || fPath.includes('all mail'))) return true;
      if (sf.name === 'Starred' && (fName === 'starred' || f.specialUse === '\\Flagged' || fPath.includes('starred'))) return true;
      if (sf.name === 'Promotions' && (fName.includes('promotion') || f.specialUse === '\\Promotions' || fPath.includes('promotion'))) return true;
      if (sf.name === 'Social' && (fName.includes('social') || f.specialUse === '\\Social' || fPath.includes('social'))) return true;

      return false;
    });
    return { ...sf, messages: match?.messages || 0, unseen: match?.unseen || 0 };
  });

  // Custom folders (not in system list)
  const systemNames = new Set(SYSTEM_FOLDERS.map((f) => (f.name || '').toLowerCase()));
  const providerSystemPatterns = [
    '[gmail]', 'important', 'all mail', 'bin', 'sent mail',
    'sent items', 'deleted items', 'junk email', 'bulk mail',
    'sent messages', 'deleted messages', 'conversation history', 'sync issues'
  ];
  const customFolders = (folders || []).filter((f) => {
    if (!f) return false;
    const fName = (typeof f === 'string' ? f : f.name || f.path || '').toLowerCase().trim();
    const fPath = (typeof f === 'string' ? f : f.path || f.name || '').toLowerCase().trim();
    if (!fName || systemNames.has(fName)) return false;
    if (f.specialUse) return false;
    if (providerSystemPatterns.includes(fName) || providerSystemPatterns.includes(fPath)) return false;
    return true;
  });

  const handleCreateFolder = async (e) => {
    if (e) e.preventDefault();
    const trimmed = newFolderName.trim();
    if (!trimmed) return;
    setFolderLoading(true);
    try {
      await post('/mail/folders', { name: trimmed });
      if (window.WoxToast) window.WoxToast.success(`Folder "${trimmed}" created`);
      setNewFolderName('');
      setShowCreateFolderModal(false);
      if (typeof refetchFolders === 'function') refetchFolders();
      onFolderChange(trimmed);
    } catch (err) {
      if (window.WoxToast) window.WoxToast.error(err.message || 'Error creating folder');
    } finally {
      setFolderLoading(false);
    }
  };

  const handleDeleteFolder = async (folderName) => {
    if (!confirm(`Are you sure you want to delete folder "${folderName}"?`)) return;
    try {
      await del(`/mail/folders/${encodeURIComponent(folderName)}`);
      if (window.WoxToast) window.WoxToast.success(`Folder "${folderName}" deleted`);
      if (typeof refetchFolders === 'function') refetchFolders();
      if (activeFolder === folderName) onFolderChange('INBOX');
    } catch (err) {
      if (window.WoxToast) window.WoxToast.error(err.message || 'Error deleting folder');
    }
  };

  return (
    <aside className={`dashboard-sidebar ${isOpen ? 'mobile-open' : ''} ${isEffectivelyCollapsed ? 'collapsed' : ''}`}>
      <div className="sidebar-header">
        <a
          href="/"
          className="sidebar-logo"
          title="Go to WoxMail Home Portal"
          style={{ textDecoration: 'none', color: 'inherit', display: 'flex', alignItems: 'center', gap: '0.6rem', fontWeight: 800, fontSize: '1.25rem', letterSpacing: '-0.02em' }}
        >
          <img src="/assets/favicon.svg" alt="WoxMail" style={{ width: 28, height: 28, objectFit: 'contain' }} />
          <span>Wox<span style={{ color: 'var(--color-primary-light)' }}>Mail</span></span>
        </a>
        <div style={{ display: 'flex', gap: '0.35rem', alignItems: 'center' }}>
          {!collapsed && (
            <a
              href="/"
              className="btn btn-ghost btn-xs hide-mobile"
              title="Return to WoxMail Home Portal"
              style={{
                padding: '0.3rem 0.55rem',
                fontSize: '0.75rem',
                display: 'inline-flex',
                alignItems: 'center',
                gap: '0.3rem',
                borderRadius: 'var(--radius-pill)',
                border: '1px solid var(--color-border)',
                color: 'var(--color-text-secondary)',
              }}
            >
              <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="m3 9 9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/><polyline points="9 22 9 12 15 12 15 22"/></svg>
              <span>Home</span>
            </a>
          )}
          {onClose && (
            <button
              type="button"
              className="btn btn-ghost btn-icon hide-desktop"
              onClick={onClose}
              aria-label="Close sidebar drawer"
              title="Close sidebar drawer"
              style={{ fontSize: '1.25rem', padding: '0.35rem 0.5rem', color: 'var(--color-text-secondary)', display: 'inline-flex', alignItems: 'center', justifyContent: 'center' }}
            >
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
            </button>
          )}
        </div>
      </div>

      {/* Prominent Compose Button */}
      <div className="sidebar-compose-wrap" style={{ padding: '0.75rem 0.75rem 0.4rem' }}>
        <button
          type="button"
          className="btn btn-primary btn-full sidebar-compose-btn"
          onClick={onCompose}
          title="Compose new email (Key: C)"
          style={{
            width: '100%',
            justifyContent: 'center',
            fontWeight: 700,
            fontSize: '0.9rem',
            padding: '0.65rem 1rem',
            boxShadow: '0 4px 14px var(--color-primary-glow)',
            gap: '0.5rem',
            display: 'inline-flex',
            alignItems: 'center',
          }}
        >
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"><path d="M12 20h9"/><path d="M16.5 3.5a2.121 2.121 0 0 1 3 3L7 19l-4 1 1-4L16.5 3.5z"/></svg>
          <span>Compose</span>
        </button>
      </div>

      {user?.is_admin && (
        <div style={{ padding: '0.625rem 0.75rem', borderBottom: '1px solid var(--color-border-subtle)' }}>
          <a
            href="/admin"
            className="btn btn-secondary btn-sm sidebar-admin-link"
            title="Admin Control Center"
            style={{
              width: '100%',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              gap: '0.5rem',
              background: 'linear-gradient(135deg, rgba(124, 58, 237, 0.25), rgba(168, 85, 247, 0.15))',
              borderColor: 'var(--color-primary-light)',
              color: 'var(--color-text-primary)',
              fontWeight: 600,
              padding: '0.5rem 0.75rem',
            }}
          >
            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M12 2l3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01L12 2z"/></svg>
            <span>Admin Control Panel</span>
          </a>
        </div>
      )}

      <nav className="sidebar-nav">
        <div className="nav-section">
          <div className="nav-section-title">Mailbox</div>
          <button
            type="button"
            className={`sidebar-item ${activeFolder === '__all_inboxes' ? 'active' : ''}`}
            onClick={() => onFolderChange('__all_inboxes')}
            title="All Inboxes (Unified across all connected accounts)"
            style={{
              background: activeFolder === '__all_inboxes' ? 'rgba(124, 58, 237, 0.18)' : undefined,
              fontWeight: activeFolder === '__all_inboxes' ? 600 : 500,
            }}
          >
            <span className="sidebar-icon">
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <polyline points="22 12 16 12 14 15 10 15 8 12 2 12" />
                <path d="M5.45 5.11L2 12v6a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2v-6l-3.45-6.89A2 2 0 0 0 16.76 4H7.24a2 2 0 0 0-1.79 1.11z" />
              </svg>
            </span>
            <span className="sidebar-label">All Inboxes</span>
          </button>
          {enrichedFolders.map((f) => (
            <button
              key={f.name}
              type="button"
              className={`sidebar-item ${activeFolder === f.name ? 'active' : ''}`}
              onClick={() => onFolderChange(f.name)}
              title={`${f.label}${f.unseen ? ` (${f.unseen} unread)` : ''}`}
            >
              <span className="sidebar-icon">{getFolderIcon(f.name, f.specialUse)}</span>
              <span className="sidebar-label">{f.label}</span>
              {f.unseen > 0 && <span className="sidebar-badge">{f.unseen}</span>}
            </button>
          ))}
        </div>

        {/* Quarantine Screener Pill */}
        <div className="nav-section">
          <div className="nav-section-title">Security & Screening</div>
          <button
            type="button"
            className={`sidebar-item ${activeFolder === '__gatekeeper' ? 'active' : ''}`}
            onClick={() => onFolderChange('__gatekeeper')}
            title="The Gatekeeper (Cold Email Screener)"
          >
            <span className="sidebar-icon">
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/><circle cx="12" cy="11" r="2"/></svg>
            </span>
            <span className="sidebar-label">The Gatekeeper</span>
            {screenerPendingCount > 0 && (
              <span className="sidebar-badge" style={{ background: '#f59e0b', color: '#000' }}>
                {screenerPendingCount}
              </span>
            )}
          </button>
          <button
            type="button"
            className={`sidebar-item ${activeFolder === '__campaigns' ? 'active' : ''}`}
            onClick={() => onFolderChange('__campaigns')}
            title="Sovereign Mass Broadcasts"
          >
            <span className="sidebar-icon">
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="m3 11 18-5v12L3 14v-3z"/><path d="M11.6 16.8a3 3 0 1 1-5.8-1.6"/></svg>
            </span>
            <span className="sidebar-label">Mass Broadcasts</span>
          </button>
          <button
            type="button"
            className="sidebar-item"
            title="Helpdesk & Support"
            onClick={onOpenSupport}
          >
            <span className="sidebar-icon">
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="10"/><path d="M9.09 9a3 3 0 0 1 5.83 1c0 2-3 3-3 3"/><line x1="12" y1="17" x2="12.01" y2="17"/></svg>
            </span>
            <span className="sidebar-label">Help & Support</span>
          </button>
        </div>

        <div className="nav-section">
          <div className="nav-section-header" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '0.4rem 0.75rem 0.2rem' }}>
            <div className="nav-section-title" style={{ margin: 0 }}>Custom Folders</div>
            {!collapsed && (
              <button
                type="button"
                className="btn btn-ghost btn-xs"
                style={{ padding: '0.15rem 0.45rem', fontSize: '0.75rem', color: 'var(--color-primary-light)', borderRadius: 'var(--radius-pill)', border: '1px solid rgba(124, 58, 237, 0.25)', display: 'inline-flex', alignItems: 'center', gap: '0.2rem' }}
                title="Create New Custom Folder"
                onClick={() => setShowCreateFolderModal(true)}
              >
                <span>+ New</span>
              </button>
            )}
          </div>
          {customFolders.length === 0 && !collapsed && (
            <button
              type="button"
              className="sidebar-item"
              onClick={() => setShowCreateFolderModal(true)}
              style={{ fontSize: '0.78rem', color: 'var(--color-text-tertiary)', border: '1px dashed var(--color-border)', justifyContent: 'center', margin: '0.25rem 0.5rem', borderRadius: 'var(--radius-md)', padding: '0.45rem' }}
            >
              <span>+ Create Folder</span>
            </button>
          )}
          {customFolders.map((f) => {
            const fPath = typeof f === 'string' ? f : f.path || f.name || '';
            const fName = typeof f === 'string' ? f : f.name || f.path || '';
            return (
              <div key={fPath} style={{ display: 'flex', alignItems: 'center', width: '100%', position: 'relative' }}>
                <button
                  type="button"
                  className={`sidebar-item ${activeFolder === fPath ? 'active' : ''}`}
                  onClick={() => onFolderChange(fPath)}
                  title={`${fName}${f.unseen ? ` (${f.unseen} unread)` : ''}`}
                  style={{ flex: 1, minWidth: 0 }}
                >
                  <span className="sidebar-icon">{getFolderIcon(fName)}</span>
                  <span className="sidebar-label" style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{fName}</span>
                  {f && f.unseen > 0 && <span className="sidebar-badge">{f.unseen}</span>}
                </button>
                {!collapsed && (
                  <button
                    type="button"
                    onClick={(e) => { e.stopPropagation(); handleDeleteFolder(fName); }}
                    title={`Delete folder "${fName}"`}
                    style={{ background: 'transparent', border: 'none', color: 'var(--color-text-tertiary)', cursor: 'pointer', padding: '0.35rem', borderRadius: '4px', display: 'flex', alignItems: 'center', opacity: 0.6 }}
                    onMouseEnter={(e) => { e.currentTarget.style.opacity = 1; e.currentTarget.style.color = 'var(--color-error)'; }}
                    onMouseLeave={(e) => { e.currentTarget.style.opacity = 0.6; e.currentTarget.style.color = 'var(--color-text-tertiary)'; }}
                  >
                    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M3 6h18"/><path d="M19 6v14c0 1-1 2-2 2H7c-1 0-2-1-2-2V6"/><path d="M8 6V4c0-1 1-2 2-2h4c1 0 2 1 2 2v2"/></svg>
                  </button>
                )}
              </div>
            );
          })}
        </div>

        <div className="nav-section">
          <div className="nav-section-title">Tools & Features</div>
          <a href="/" className="sidebar-item" title="Home Portal">
            <span className="sidebar-icon">
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="m3 9 9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/><polyline points="9 22 9 12 15 12 15 22"/></svg>
            </span>
            <span className="sidebar-label">Home Portal</span>
          </a>
          <a href="/futureme" className="sidebar-item" title="Letters to Future">
            <span className="sidebar-icon">
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 14 14"/></svg>
            </span>
            <span className="sidebar-label">Letters to Future</span>
          </a>
          <a href="/tempmail" className="sidebar-item" title="Disposable Temp Mail">
            <span className="sidebar-icon">
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2"/></svg>
            </span>
            <span className="sidebar-label">Disposable Temp Mail</span>
          </a>
          <button
            type="button"
            className="sidebar-item"
            title="Command Bar (Ctrl+K)"
            onClick={() => window.dispatchEvent(new KeyboardEvent('keydown', { key: 'k', metaKey: true, ctrlKey: true }))}
          >
            <span className="sidebar-icon">
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="4 17 10 11 4 5"/><line x1="12" y1="19" x2="20" y2="19"/></svg>
            </span>
            <span className="sidebar-label">Command Bar (Cmd+K)</span>
          </button>
        </div>
      </nav>

      <div className="sidebar-footer">
        {onToggleCollapse && (
          <button
            type="button"
            className="sidebar-collapse-toggle hide-mobile"
            onClick={onToggleCollapse}
            title={collapsed ? 'Expand Sidebar (Reclaim Full Names)' : 'Collapse Sidebar to Mini-Rail'}
          >
            <span>{collapsed ? '▶' : '◀'}</span>
            <span className="collapse-text">{collapsed ? '' : 'Collapse Sidebar'}</span>
          </button>
        )}

        {canInstallPwa && (
          <button
            type="button"
            className="sidebar-item"
            title="Install WoxMail as Desktop or Mobile App"
            onClick={() => {
              if (window.triggerPWAInstall) {
                window.triggerPWAInstall();
              } else {
                alert('To install WoxMail:\n• On Chrome/Edge: Click the install icon in the address bar (⊕).\n• On iPhone/iPad: Tap Share -> Add to Home Screen.');
              }
            }}
            style={{ color: 'var(--color-primary-light)', fontWeight: 600 }}
          >
            <span className="sidebar-icon">
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect width="14" height="20" x="5" y="2" rx="2" ry="2"/><path d="M12 18h.01"/></svg>
            </span>
            <span className="sidebar-label">Install App</span>
          </button>
        )}

        <button type="button" className="sidebar-item" title="Support Desk" onClick={() => window.location.href = '/support'}>
          <span className="sidebar-icon">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="10"/><path d="M9.09 9a3 3 0 0 1 5.83 1c0 2-3 3-3 3"/><line x1="12" y1="17" x2="12.01" y2="17"/></svg>
          </span>
          <span className="sidebar-label">Support Desk</span>
        </button>
        {(user?.email?.includes('@proton.') || user?.email?.includes('@pm.me')) && (
          <button
            type="button"
            className="sidebar-item"
            title="Unlock & Decrypt Proton Mailbox"
            onClick={() => {
              if (onUnlockProton) onUnlockProton();
              else window.dispatchEvent(new CustomEvent('woxmail:proton-locked'));
            }}
            style={{ color: '#c084fc', background: 'rgba(124, 58, 237, 0.12)', border: '1px solid rgba(124, 58, 237, 0.3)', margin: '0.25rem 0.5rem', borderRadius: 'var(--radius-sm)' }}
          >
            <span className="sidebar-icon">
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect width="18" height="11" x="3" y="11" rx="2" ry="2"/><path d="M7 11V7a5 5 0 0 1 10 0v4"/></svg>
            </span>
            <span className="sidebar-label" style={{ fontWeight: 600 }}>Unlock Proton</span>
          </button>
        )}
        <button type="button" className="sidebar-item" title="Settings" onClick={() => window.location.href = '/settings'}>
          <span className="sidebar-icon">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1 0 2.83 2 2 0 0 1-2.83 0l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-2 2 2 2 0 0 1-2-2v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83 0 2 2 0 0 1 0-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1-2-2 2 2 0 0 1 2-2h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 0-2.83 2 2 0 0 1 2.83 0l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 2-2 2 2 0 0 1 2 2v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 0 2 2 0 0 1 0 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 2 2 2 2 0 0 1-2 2h-.09a1.65 1.65 0 0 0-1.51 1z"/></svg>
          </span>
          <span className="sidebar-label">Settings</span>
        </button>
        <button
          type="button"
          className="sidebar-item"
          title="Themes & Interactive Backgrounds (Key: T)"
          onClick={() => {
            if (onOpenTheme) onOpenTheme();
            else if (window.WoxTheme) window.WoxTheme.toggle();
          }}
        >
          <span className="sidebar-icon">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="10"/><path d="M12 2a10 10 0 0 1 0 20z"/></svg>
          </span>
          <span className="sidebar-label">Theme & Shaders</span>
        </button>
        <div className="sidebar-user">
          <span className="text-secondary" title={user?.email}>{user?.email}</span>
          {user?.is_admin && <span className="badge badge-purple" style={{ marginLeft: '0.25rem', fontSize: '0.625rem' }}>ADMIN</span>}
        </div>
        <button
          type="button"
          className="sidebar-item"
          title="Switch Account"
          onClick={() => {
            if (window.WoxAccountManager) {
              setSavedAccounts(window.WoxAccountManager.getAccounts());
            }
            setShowAccountSwitcher(true);
          }}
        >
          <span className="sidebar-icon">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M22 21v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/></svg>
          </span>
          <span className="sidebar-label">Switch Account</span>
        </button>
        <button
          type="button"
          className="sidebar-item"
          title="Logout"
          onClick={async () => {
            await fetch('/api/auth/logout', { method: 'POST', credentials: 'include' });
            window.location.href = '/login';
          }}
        >
          <span className="sidebar-icon">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"/><polyline points="16 17 21 12 16 7"/><line x1="21" y1="12" x2="9" y2="12"/></svg>
          </span>
          <span className="sidebar-label">Logout</span>
        </button>
      </div>

      {/* Account Switcher Modal (Rendered at Root via Portal in Screen Center) */}
      {showAccountSwitcher && typeof document !== 'undefined' && createPortal(
        <div
          className="account-switcher-backdrop"
          onClick={() => setShowAccountSwitcher(false)}
          style={{
            position: 'fixed',
            top: 0,
            left: 0,
            right: 0,
            bottom: 0,
            width: '100vw',
            height: '100vh',
            background: 'rgba(0, 0, 0, 0.78)',
            backdropFilter: 'blur(12px)',
            WebkitBackdropFilter: 'blur(12px)',
            zIndex: 999999,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            padding: '1.25rem',
            boxSizing: 'border-box',
          }}
        >
          <div
            className="account-switcher-modal card"
            onClick={(e) => e.stopPropagation()}
            style={{
              width: '100%',
              maxWidth: 440,
              padding: '1.5rem',
              background: 'var(--color-bg-card)',
              border: '1px solid var(--color-border)',
              borderRadius: 'var(--radius-xl)',
              boxShadow: '0 25px 60px rgba(0, 0, 0, 0.8), 0 0 0 1px rgba(124, 58, 237, 0.25)',
              position: 'relative',
              zIndex: 1000000,
            }}
          >
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '1.25rem' }}>
              <div>
                <h3 style={{ margin: 0, fontSize: '1.15rem', fontWeight: 800, display: 'flex', alignItems: 'center', gap: '0.5rem', letterSpacing: '-0.01em' }}>
                  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" style={{ color: 'var(--color-primary-light)' }}>
                    <path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2" />
                    <circle cx="9" cy="7" r="4" />
                    <path d="M22 21v-2a4 4 0 0 0-3-3.87" />
                    <path d="M16 3.13a4 4 0 0 1 0 7.75" />
                  </svg>
                  <span>Switch Account</span>
                </h3>
                <p style={{ margin: '0.25rem 0 0', fontSize: '0.8rem', color: 'var(--color-text-secondary)' }}>
                  Switch profiles or manage saved accounts on this device
                </p>
              </div>
              <button
                type="button"
                className="btn btn-ghost btn-icon btn-sm"
                onClick={() => setShowAccountSwitcher(false)}
                title="Close (Esc)"
                aria-label="Close"
                style={{ width: 32, height: 32, borderRadius: '50%', padding: 0, display: 'flex', alignItems: 'center', justifyContent: 'center' }}
              >
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
                  <line x1="18" y1="6" x2="6" y2="18" />
                  <line x1="6" y1="6" x2="18" y2="18" />
                </svg>
              </button>
            </div>

            {/* Active Account */}
            <div style={{ marginBottom: '1.25rem' }}>
              <div style={{ fontSize: '0.72rem', fontWeight: 700, color: 'var(--color-text-tertiary)', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: '0.45rem' }}>
                Current Active Session
              </div>
              <div style={{
                padding: '0.85rem 1rem',
                borderRadius: 'var(--radius-md)',
                background: 'linear-gradient(135deg, rgba(124, 58, 237, 0.16), rgba(59, 130, 246, 0.1))',
                border: '1px solid rgba(124, 58, 237, 0.35)',
                display: 'flex',
                alignItems: 'center',
                gap: '0.85rem',
              }}>
                <div style={{
                  width: 40,
                  height: 40,
                  borderRadius: '50%',
                  background: 'linear-gradient(135deg, #7c3aed, #3b82f6)',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  color: '#fff',
                  fontWeight: 800,
                  fontSize: '1rem',
                  boxShadow: '0 2px 8px rgba(124, 58, 237, 0.4)',
                  flexShrink: 0,
                }}>
                  {(user?.username || user?.email || 'U').slice(0, 1).toUpperCase()}
                </div>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontWeight: 700, fontSize: '0.92rem', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                    {user?.username || 'Current User'} {user?.is_admin && <span className="badge badge-purple" style={{ fontSize: '0.625rem', verticalAlign: 'middle', marginLeft: '0.35rem' }}>Admin</span>}
                  </div>
                  <div style={{ fontSize: '0.78rem', color: 'var(--color-text-secondary)', fontFamily: 'monospace', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                    {user?.email}
                  </div>
                </div>
                <span className="badge badge-green" style={{ fontSize: '0.72rem', padding: '0.2rem 0.6rem', fontWeight: 700 }}>
                  Active
                </span>
              </div>
            </div>

            {/* Other Profiles */}
            <div style={{ marginBottom: '1.25rem' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.45rem' }}>
                <div style={{ fontSize: '0.72rem', fontWeight: 700, color: 'var(--color-text-tertiary)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                  Saved Accounts on This Device
                </div>
                {savedAccounts.filter((a) => a.email.toLowerCase() !== (user?.email || '').toLowerCase()).length > 0 && (
                  <div style={{ fontSize: '0.72rem', color: 'var(--color-text-tertiary)' }}>
                    {savedAccounts.filter((a) => a.email.toLowerCase() !== (user?.email || '').toLowerCase()).length} saved
                  </div>
                )}
              </div>

              <div style={{ maxHeight: 220, overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: '0.5rem', paddingRight: '0.25rem' }}>
                {savedAccounts
                  .filter((a) => a.email.toLowerCase() !== (user?.email || '').toLowerCase())
                  .map((acc) => (
                    <div
                      key={acc.email}
                      style={{
                        display: 'flex',
                        alignItems: 'center',
                        gap: '0.75rem',
                        padding: '0.65rem 0.85rem',
                        borderRadius: 'var(--radius-md)',
                        border: '1px solid var(--color-border)',
                        background: 'var(--color-bg-elevated)',
                        transition: 'border-color 0.15s ease, background 0.15s ease',
                      }}
                    >
                      <div style={{
                        width: 36,
                        height: 36,
                        borderRadius: '50%',
                        background: acc.avatarStyle?.bg || 'linear-gradient(135deg, #ec4899, #8b5cf6)',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        color: '#fff',
                        fontWeight: 800,
                        fontSize: '0.85rem',
                        flexShrink: 0,
                      }}>
                        {(acc.displayName || acc.username || acc.email).slice(0, 1).toUpperCase()}
                      </div>
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div style={{ fontWeight: 600, fontSize: '0.875rem', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                          {acc.displayName || acc.username} {acc.isAdmin && <span className="badge badge-purple" style={{ fontSize: '0.6rem', marginLeft: '0.25rem' }}>Admin</span>}
                        </div>
                        <div style={{ fontSize: '0.75rem', color: 'var(--color-text-secondary)', fontFamily: 'monospace', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                          {acc.email}
                        </div>
                      </div>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
                        <button
                          type="button"
                          className="btn btn-primary btn-xs"
                          style={{ padding: '0.35rem 0.75rem', fontSize: '0.78rem', fontWeight: 600 }}
                          onClick={() => {
                            if (window.WoxAccountManager) {
                              window.WoxAccountManager.switchToAccount(acc.email);
                            } else {
                              window.location.href = `/login?email=${encodeURIComponent(acc.email)}&switch=1`;
                            }
                          }}
                        >
                          Switch
                        </button>
                        <button
                          type="button"
                          className="btn btn-ghost btn-icon btn-xs"
                          title={`Remove ${acc.email} from this device`}
                          aria-label={`Remove ${acc.email} from this device`}
                          style={{
                            width: 28,
                            height: 28,
                            padding: 0,
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'center',
                            color: 'var(--color-text-tertiary)',
                            borderRadius: 'var(--radius-sm)',
                          }}
                          onMouseEnter={(e) => {
                            e.currentTarget.style.color = 'var(--color-error)';
                            e.currentTarget.style.background = 'rgba(239, 68, 68, 0.12)';
                          }}
                          onMouseLeave={(e) => {
                            e.currentTarget.style.color = 'var(--color-text-tertiary)';
                            e.currentTarget.style.background = 'transparent';
                          }}
                          onClick={(e) => {
                            e.stopPropagation();
                            if (window.confirm(`Remove "${acc.email}" from saved profiles on this device?`)) {
                              if (window.WoxAccountManager) {
                                const updated = window.WoxAccountManager.removeAccount(acc.email);
                                setSavedAccounts(updated || []);
                              } else {
                                const raw = localStorage.getItem('woxmail_saved_accounts');
                                if (raw) {
                                  const list = JSON.parse(raw).filter((a) => a.email.toLowerCase() !== acc.email.toLowerCase());
                                  localStorage.setItem('woxmail_saved_accounts', JSON.stringify(list));
                                  setSavedAccounts(list);
                                }
                              }
                            }
                          }}
                        >
                          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                            <polyline points="3 6 5 6 21 6" />
                            <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" />
                          </svg>
                        </button>
                      </div>
                    </div>
                  ))}

                {savedAccounts.filter((a) => a.email.toLowerCase() !== (user?.email || '').toLowerCase()).length === 0 && (
                  <div style={{
                    textAlign: 'center',
                    padding: '1.25rem 1rem',
                    fontSize: '0.82rem',
                    color: 'var(--color-text-tertiary)',
                    background: 'rgba(255, 255, 255, 0.02)',
                    borderRadius: 'var(--radius-md)',
                    border: '1px dashed var(--color-border)',
                  }}>
                    No other saved profiles on this device yet.
                  </div>
                )}
              </div>
            </div>

            {/* Actions */}
            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem', borderTop: '1px solid var(--color-border)', paddingTop: '1rem' }}>
              <button
                type="button"
                className="btn btn-secondary btn-full"
                style={{ width: '100%', justifyContent: 'center', gap: '0.5rem', fontWeight: 600, padding: '0.65rem 1rem' }}
                onClick={() => {
                  if (window.WoxAccountManager) {
                    window.WoxAccountManager.prepareAddAccount();
                  } else {
                    window.location.href = '/login?add_account=1';
                  }
                }}
              >
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                  <line x1="12" y1="5" x2="12" y2="19" />
                  <line x1="5" y1="12" x2="19" y2="12" />
                </svg>
                <span>Add another account</span>
              </button>

              {savedAccounts.filter((a) => a.email.toLowerCase() !== (user?.email || '').toLowerCase()).length > 0 && (
                <button
                  type="button"
                  className="btn btn-ghost btn-xs"
                  style={{ color: 'var(--color-text-tertiary)', fontSize: '0.75rem', alignSelf: 'center', marginTop: '0.25rem' }}
                  onClick={() => {
                    if (window.confirm('Clear all other saved profiles from this device?')) {
                      if (window.WoxAccountManager) {
                        const current = savedAccounts.filter((a) => a.email.toLowerCase() === (user?.email || '').toLowerCase());
                        try {
                          localStorage.setItem('woxmail_saved_accounts', JSON.stringify(current));
                        } catch {}
                        setSavedAccounts(current);
                      }
                    }
                  }}
                >
                  Clear other saved profiles
                </button>
              )}
            </div>
          </div>
        </div>,
        document.body
      )}

      {/* Create Custom Folder Modal */}
      {showCreateFolderModal && createPortal(
        <div
          className="modal-backdrop"
          onClick={() => setShowCreateFolderModal(false)}
          style={{
            position: 'fixed',
            inset: 0,
            background: 'rgba(0, 0, 0, 0.7)',
            backdropFilter: 'blur(8px)',
            WebkitBackdropFilter: 'blur(8px)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            zIndex: 10000,
            padding: '1rem',
          }}
        >
          <div
            className="modal-card card"
            onClick={(e) => e.stopPropagation()}
            style={{
              width: '100%',
              maxWidth: '420px',
              background: 'var(--color-bg-card)',
              border: '1px solid var(--color-border)',
              borderRadius: 'var(--radius-lg)',
              padding: '1.5rem',
              boxShadow: 'var(--shadow-lg)',
            }}
          >
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.25rem' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.6rem' }}>
                <span style={{ display: 'inline-flex', color: 'var(--color-primary-light)' }}>
                  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z" />
                  </svg>
                </span>
                <h3 style={{ margin: 0, fontSize: '1.15rem', fontWeight: 800 }}>New Custom Folder</h3>
              </div>
              <button
                type="button"
                className="btn btn-ghost btn-icon"
                onClick={() => setShowCreateFolderModal(false)}
                aria-label="Close"
              >
                <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                  <line x1="18" y1="6" x2="6" y2="18" />
                  <line x1="6" y1="6" x2="18" y2="18" />
                </svg>
              </button>
            </div>

            <form onSubmit={handleCreateFolder}>
              <div style={{ marginBottom: '1.25rem' }}>
                <label style={{ display: 'block', fontSize: '0.8125rem', fontWeight: 700, marginBottom: '0.45rem', color: 'var(--color-text-secondary)' }}>
                  Folder Name
                </label>
                <input
                  type="text"
                  className="input"
                  placeholder="e.g. Work, Taxes, Project Alpha"
                  value={newFolderName}
                  onChange={(e) => setNewFolderName(e.target.value)}
                  autoFocus
                  required
                  maxLength={100}
                  style={{ width: '100%', fontSize: '0.95rem' }}
                />
                <span style={{ fontSize: '0.72rem', color: 'var(--color-text-tertiary)', marginTop: '0.35rem', display: 'block' }}>
                  This creates an IMAP-compliant folder synced across all your devices and webmail.
                </span>
              </div>

              <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '0.6rem' }}>
                <button
                  type="button"
                  className="btn btn-secondary btn-sm"
                  onClick={() => setShowCreateFolderModal(false)}
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="btn btn-primary btn-sm"
                  disabled={!newFolderName.trim() || folderLoading}
                >
                  {folderLoading ? 'Creating...' : 'Create Folder'}
                </button>
              </div>
            </form>
          </div>
        </div>,
        document.body
      )}
    </aside>
  );
}
