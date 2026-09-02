import React, { useState, useCallback, useEffect } from 'react';
import { useUser, useFolders, useMessages, useMessage, useKeyboard } from '../shared/hooks.js';
import { post, put } from '../shared/api.js';
import Sidebar from './components/Sidebar.jsx';
import MessageList from './components/MessageList.jsx';
import MessageView from './components/MessageView.jsx';
import ComposeModal from './components/ComposeModal.jsx';
import CommandPalette from '../shared/components/CommandPalette.jsx';
import SplitDivider from './components/SplitDivider.jsx';
import CompanionDock from './components/CompanionDock.jsx';
import GatekeeperView from './components/GatekeeperView.jsx';
import CampaignsView from './components/CampaignsView.jsx';
import SupportModal from './components/SupportModal.jsx';
import KeyboardShortcutsModal from './components/KeyboardShortcutsModal.jsx';
import UndoSendToast from './components/UndoSendToast.jsx';
import AccountSwitcherModal from './components/AccountSwitcherModal.jsx';
import KanbanBoard from './components/KanbanBoard.jsx';
import TemplatePickerModal from './components/TemplatePickerModal.jsx';
import ThemeCustomizerModal from './components/ThemeCustomizerModal.jsx';
import BackgroundCanvas from './components/BackgroundCanvas.jsx';
import ProtonUnlockModal from './components/ProtonUnlockModal.jsx';
import { protonClient } from '../services/protonAPI.js';
import { protonCrypto } from '../services/protonCrypto.js';
import { ProtonSessionStore } from '../services/protonSessionStore.js';
import { sendProtonMessage } from '../services/protonAdapter.js';
import { NotificationService } from '../services/notifications.js';
import '../shared/styles/globals.css';

export default function App() {
  const { user, loading: userLoading } = useUser();
  const [activeFolder, setActiveFolder] = useState('INBOX');
  const [page, setPage] = useState(1);
  const [selectedUid, setSelectedUid] = useState(null);
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [composing, setComposing] = useState(false);
  const [replyData, setReplyData] = useState(null);
  const [cmdPaletteOpen, setCmdPaletteOpen] = useState(false);

  // ─── Phase 2 & 5 Layout & Dock State ─────────────────────
  const [layoutMode, setLayoutMode] = useState(() => {
    return localStorage.getItem('woxmail_layout_mode') || 'vertical';
  });
  const [splitRatio, setSplitRatio] = useState(() => {
    const saved = parseInt(localStorage.getItem('woxmail_split_ratio'), 10);
    return saved && saved >= 20 && saved <= 60 ? saved : 28;
  });
  const [dockOpen, setDockOpen] = useState(() => {
    return localStorage.getItem('woxmail_dock_open') === 'true';
  });
  const [sidebarCollapsed, setSidebarCollapsed] = useState(() => {
    return localStorage.getItem('woxmail_sidebar_collapsed') === 'true';
  });
  const [activeFilterLabel, setActiveFilterLabel] = useState('');
  const [showSupportModal, setShowSupportModal] = useState(false);
  const [showShortcutsModal, setShowShortcutsModal] = useState(false);
  const [undoSendState, setUndoSendState] = useState(null);
  const [accountSwitcherOpen, setAccountSwitcherOpen] = useState(false);
  const [showKanban, setShowKanban] = useState(false);
  const [templatePickerOpen, setTemplatePickerOpen] = useState(false);
  const [showThemeModal, setShowThemeModal] = useState(false);
  const [activeAccount, setActiveAccount] = useState(null);
  const [showProtonUnlock, setShowProtonUnlock] = useState(false);
  const [isProtonUnlocked, setIsProtonUnlocked] = useState(false);
  const [isMobile, setIsMobile] = useState(() => typeof window !== 'undefined' && window.innerWidth <= 768);

  useEffect(() => {
    // Restore persistent Proton session on load if available
    if (ProtonSessionStore.hasActiveSession()) {
      protonClient.restoreSession();
    }
  }, []);

  // Listen for Proton session lock events from failed requests
  useEffect(() => {
    const handleLocked = () => {
      setIsProtonUnlocked(false);
      setShowProtonUnlock(true);
    };
    window.addEventListener('woxmail:proton-locked', handleLocked);
    return () => window.removeEventListener('woxmail:proton-locked', handleLocked);
  }, []);

  // Automatically detect if user logged in with a Proton email and check server session status
  useEffect(() => {
    if (user && user.email && (user.email.includes('@proton.') || user.email.includes('@pm.me'))) {
      setActiveAccount({
        provider: 'proton',
        email: user.email,
        name: user.display_name || user.email,
        color: '#6d4aff',
      });

      // Probe backend session liveness
      fetch(`/api/proton/sync/status?email=${encodeURIComponent(user.email)}`)
        .then((res) => res.json())
        .then((data) => {
          if (data && !data.active) {
            setIsProtonUnlocked(false);
            setShowProtonUnlock(true);
          } else if (data && data.active) {
            setIsProtonUnlocked(true);
            setShowProtonUnlock(false);
          }
        })
        .catch(() => {
          setShowProtonUnlock(true);
        });
    }
  }, [user]);

  useEffect(() => {
    const handleResize = () => {
      setIsMobile(window.innerWidth <= 768);
    };
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, []);

  const knownMsgUidsRef = React.useRef(new Set());
  const initialLoadDoneRef = React.useRef(false);
  const previousFolderRef = React.useRef(activeFolder);

  // Request notifications on load
  useEffect(() => {
    NotificationService.requestPermission();
  }, []);

  const { folders, refetch: refetchFolders } = useFolders(activeAccount);
  const { messages, pagination, loading: msgsLoading, refetch: refetchMessages } = useMessages(activeFolder, page, activeAccount);
  const { message, loading: msgLoading } = useMessage(selectedUid, activeFolder, activeAccount);

  // Monitor incoming emails for desktop notification & sound
  useEffect(() => {
    if (!messages || messages.length === 0) return;

    if (!initialLoadDoneRef.current || previousFolderRef.current !== activeFolder) {
      // First load or folder changed: seed existing messages without playing chime
      previousFolderRef.current = activeFolder;
      knownMsgUidsRef.current = new Set(messages.map((m) => m.uid));
      initialLoadDoneRef.current = true;
      return;
    }

    // Check for newly arrived unread messages in CURRENT active folder
    const newlyArrived = messages.filter((m) => !knownMsgUidsRef.current.has(m.uid) && !m.seen && !m.isRead);
    if (newlyArrived.length > 0) {
      const top = newlyArrived[0];
      const fromDisplay = top.from?.name || top.from?.address || 'Someone';
      NotificationService.notify({
        from: fromDisplay,
        subject: top.subject || '(No Subject)',
        preview: top.snippet || top.preview || '',
        onClick: () => {
          setSelectedUid(top.uid);
        }
      });
    }

    // Update known set
    messages.forEach((m) => knownMsgUidsRef.current.add(m.uid));
  }, [messages, activeFolder]);

  const handleProtonUnlocked = () => {
    setIsProtonUnlocked(true);
    setShowProtonUnlock(false);
    setActiveAccount({
      provider: 'proton',
      email: user?.email,
      name: user?.display_name || user?.email,
      color: '#6d4aff',
    });
    setTimeout(() => {
      refetchMessages();
      refetchFolders();
    }, 200);
  };

  // Persist layout choices
  const changeLayoutMode = (mode) => {
    setLayoutMode(mode);
    localStorage.setItem('woxmail_layout_mode', mode);
    if (mode === 'horizontal' && splitRatio < 35) {
      setSplitRatio(42);
      localStorage.setItem('woxmail_split_ratio', '42');
    } else if (mode === 'vertical' && splitRatio > 40) {
      setSplitRatio(28);
      localStorage.setItem('woxmail_split_ratio', '28');
    }
  };

  const toggleSidebarCollapse = () => {
    setSidebarCollapsed((prev) => {
      const next = !prev;
      localStorage.setItem('woxmail_sidebar_collapsed', String(next));
      return next;
    });
  };

  const handleSplitResize = (newRatio) => {
    setSplitRatio(newRatio);
    localStorage.setItem('woxmail_split_ratio', String(newRatio));
  };

  const toggleDock = () => {
    setDockOpen((prev) => {
      const next = !prev;
      localStorage.setItem('woxmail_dock_open', String(next));
      return next;
    });
  };

  // Keyboard navigation & power shortcuts
  const navigateMessage = useCallback((direction) => {
    if (!messages.length) return;
    const idx = messages.findIndex((m) => m.uid === selectedUid);
    const next = idx + direction;
    if (next >= 0 && next < messages.length) {
      setSelectedUid(messages[next].uid);
    }
  }, [messages, selectedUid]);

  useKeyboard({
    'c': () => { setReplyData(null); setComposing(true); },
    'Escape': () => {
      setSelectedUid(null);
      setComposing(false);
      setCmdPaletteOpen(false);
      setSidebarOpen(false);
      setShowSupportModal(false);
      setShowShortcutsModal(false);
    },
    '?': () => setShowShortcutsModal((prev) => !prev),
    '/': () => {
      const searchEl = document.querySelector('input[type="search"], .search-input, input[placeholder*="Search"]');
      if (searchEl) searchEl.focus();
    },
    'r': () => { if (message) handleReply(false); },
    'a': () => { if (message) handleReply(true); },
    'f': () => { if (message) handleForward(); },
    'j': () => navigateMessage(1),
    'k': () => navigateMessage(-1),
    'e': () => { if (selectedUid) handleBatchArchive([selectedUid]); },
    '#': () => { if (selectedUid) handleBatchDelete([selectedUid]); },
    'd': () => { if (selectedUid) handleBatchDelete([selectedUid]); },
    's': () => { if (selectedUid) handleStar(selectedUid); },
    'u': () => { if (selectedUid) handleBatchMarkUnread([selectedUid]); },
    'Ctrl+k': () => setCmdPaletteOpen(true),
    'Ctrl+1': () => changeLayoutMode('list'),
    'Ctrl+2': () => changeLayoutMode('vertical'),
    'Ctrl+3': () => changeLayoutMode('horizontal'),
    'Ctrl+.': () => toggleDock(),
    'b': () => setShowKanban((prev) => !prev),
    't': () => setShowThemeModal((prev) => !prev),
    'Ctrl+/': () => setAccountSwitcherOpen((prev) => !prev),
  });

  // Auto-select first message in split mode when switching folders on desktop (disabled on mobile)
  useEffect(() => {
    if (!isMobile && layoutMode !== 'list' && messages.length > 0 && !selectedUid && !activeFolder.startsWith('__')) {
      setSelectedUid(messages[0].uid);
    }
  }, [messages, layoutMode, activeFolder, isMobile]);

  const handleFolderChange = (folder) => {
    setActiveFolder(folder);
    setSelectedUid(null);
    setPage(1);
    setSidebarOpen(false);
    setActiveFilterLabel('');
  };

  // ─── Actions & Batch Handlers ───────────────────────────
  const handleStar = async (uid) => {
    const msg = messages.find((m) => m.uid === uid);
    await put(`/mail/star/${uid}?folder=${activeFolder}`, { starred: !msg?.isStarred });
    refetchMessages();
  };

  const handleToggleRead = async (uid) => {
    const msg = messages.find((m) => m.uid === uid);
    await put(`/mail/read/${uid}?folder=${activeFolder}`, { read: !msg?.isRead });
    refetchMessages();
  };

  const handleBatchDelete = async (rawUids) => {
    let uids = [];
    if (Array.isArray(rawUids)) {
      uids = rawUids.map((u) => parseInt(u, 10)).filter((u) => !isNaN(u));
    } else if (rawUids !== undefined && rawUids !== null) {
      const parsed = parseInt(rawUids, 10);
      if (!isNaN(parsed)) uids = [parsed];
    } else if (selectedUid) {
      const parsed = parseInt(selectedUid, 10);
      if (!isNaN(parsed)) uids = [parsed];
    }
    if (uids.length === 0) return;

    const isTrash = (activeFolder || 'INBOX').toLowerCase() === 'trash';

    // If currently in Trash folder, this is permanent deletion -> Ask for explicit confirmation!
    if (isTrash) {
      const count = uids.length;
      const confirmed = window.confirm(
        `Are you sure you want to permanently delete ${count === 1 ? 'this email' : `these ${count} emails`}? This action cannot be undone.`
      );
      if (!confirmed) return;

      try {
        await post('/mail/batch', { uids, action: 'delete', folder: activeFolder, permanent: true });
        if (selectedUid && uids.includes(Number(selectedUid))) setSelectedUid(null);
        if (window.WoxToast) {
          window.WoxToast.info(`Permanently deleted ${count} message${count > 1 ? 's' : ''}`);
        }
        refetchMessages();
        refetchFolders();
      } catch (err) {
        if (window.WoxToast) window.WoxToast.error('Failed to permanently delete email(s)');
      }
      return;
    }

    // Moving to Trash folder (Safe delete with Undo support)
    const originalFolder = activeFolder;
    try {
      const res = await post('/mail/batch', { uids, action: 'delete', folder: originalFolder });
      if (selectedUid && uids.includes(Number(selectedUid))) setSelectedUid(null);

      const targetUids = res?.trashUids?.length > 0 ? res.trashUids.map((u) => parseInt(u, 10)) : uids;

      // Provide immediate Undo action in the Toast
      if (window.WoxToast && typeof window.WoxToast.action === 'function') {
        window.WoxToast.action(
          `Moved ${uids.length} message${uids.length > 1 ? 's' : ''} to Trash`,
          {
            text: 'Undo',
            onClick: async () => {
              try {
                await post('/mail/move', { uids: targetUids, from: 'Trash', to: originalFolder });
                if (window.WoxToast) window.WoxToast.success(`Restored to ${originalFolder}`);
                refetchMessages();
                refetchFolders();
              } catch (err) {
                if (window.WoxToast) window.WoxToast.error('Failed to undo deletion');
              }
            },
          },
          7000,
          'info'
        );
      } else if (window.WoxToast) {
        window.WoxToast.info(`Moved ${uids.length} message${uids.length > 1 ? 's' : ''} to Trash`);
      }

      refetchMessages();
      refetchFolders();
    } catch (err) {
      if (window.WoxToast) window.WoxToast.error('Failed to delete email(s)');
    }
  };

  const handleBatchArchive = async (rawUids) => {
    let uids = [];
    if (Array.isArray(rawUids)) {
      uids = rawUids.map((u) => parseInt(u, 10)).filter((u) => !isNaN(u));
    } else if (rawUids !== undefined && rawUids !== null) {
      const parsed = parseInt(rawUids, 10);
      if (!isNaN(parsed)) uids = [parsed];
    } else if (selectedUid) {
      const parsed = parseInt(selectedUid, 10);
      if (!isNaN(parsed)) uids = [parsed];
    }
    if (uids.length === 0) return;

    const originalFolder = activeFolder;
    try {
      const res = await post('/mail/batch', { uids, action: 'archive', folder: originalFolder });
      if (selectedUid && uids.includes(Number(selectedUid))) setSelectedUid(null);

      const targetUids = res?.archiveUids?.length > 0 ? res.archiveUids.map((u) => parseInt(u, 10)) : uids;

      if (window.WoxToast && typeof window.WoxToast.action === 'function') {
        window.WoxToast.action(
          `Archived ${uids.length} message${uids.length > 1 ? 's' : ''}`,
          {
            text: 'Undo',
            onClick: async () => {
              try {
                await post('/mail/move', { uids: targetUids, from: 'Archive', to: originalFolder });
                if (window.WoxToast) window.WoxToast.success(`Restored from Archive to ${originalFolder}`);
                refetchMessages();
                refetchFolders();
              } catch (err) {
                if (window.WoxToast) window.WoxToast.error('Failed to undo archive');
              }
            },
          },
          7000,
          'success'
        );
      } else if (window.WoxToast) {
        window.WoxToast.success(`Archived ${uids.length} message${uids.length > 1 ? 's' : ''}`);
      }

      refetchMessages();
      refetchFolders();
    } catch (err) {
      if (window.WoxToast) window.WoxToast.error('Failed to archive email(s)');
    }
  };

  const handleBatchSnooze = async (rawUids, snoozeUntil) => {
    let uids = [];
    if (Array.isArray(rawUids)) {
      uids = rawUids.map((u) => parseInt(u, 10)).filter((u) => !isNaN(u));
    } else if (rawUids !== undefined && rawUids !== null) {
      const parsed = parseInt(rawUids, 10);
      if (!isNaN(parsed)) uids = [parsed];
    } else if (selectedUid) {
      const parsed = parseInt(selectedUid, 10);
      if (!isNaN(parsed)) uids = [parsed];
    }
    if (uids.length === 0) return;

    for (const uid of uids) {
      await post('/mail/snooze', { messageUid: uid, folder: activeFolder, snoozeUntil });
    }
    if (selectedUid && uids.includes(Number(selectedUid))) setSelectedUid(null);
    refetchMessages();
  };

  const handleBatchMove = async (rawUids, toFolder) => {
    let uids = [];
    if (Array.isArray(rawUids)) {
      uids = rawUids.map((u) => parseInt(u, 10)).filter((u) => !isNaN(u));
    } else if (rawUids !== undefined && rawUids !== null) {
      const parsed = parseInt(rawUids, 10);
      if (!isNaN(parsed)) uids = [parsed];
    } else if (selectedUid) {
      const parsed = parseInt(selectedUid, 10);
      if (!isNaN(parsed)) uids = [parsed];
    }
    if (uids.length === 0 || !toFolder) return;

    await post('/mail/move', { uids, from: activeFolder, to: toFolder });
    if (selectedUid && uids.includes(Number(selectedUid))) setSelectedUid(null);
    refetchMessages();
    refetchFolders();
  };

  const handleBatchStar = async (uids) => {
    await post('/mail/batch', { uids, action: 'star', folder: activeFolder });
    refetchMessages();
  };

  const handleBatchMarkRead = async (uids) => {
    await post('/mail/batch', { uids, action: 'read', folder: activeFolder });
    refetchMessages();
  };

  const handleBatchMarkUnread = async (uids) => {
    await post('/mail/batch', { uids, action: 'unread', folder: activeFolder });
    refetchMessages();
  };

  const handleBatchSpam = async (uids) => {
    await post('/mail/batch', { uids, action: 'spam', folder: activeFolder });
    if (uids.includes(selectedUid)) setSelectedUid(null);
    refetchMessages();
    refetchFolders();
  };

  const handleSpam = async (uid) => {
    await put(`/mail/spam/${uid}?folder=${activeFolder}`);
    setSelectedUid(null);
    refetchMessages();
    refetchFolders();
  };

  const handleReply = (replyAll = false, targetMsg = null) => {
    const target = targetMsg || message;
    if (!target) return;
    setReplyData({ uid: target.uid, folder: target.folder || activeFolder, replyAll, subject: target.subject, from: target.from, to: target.to });
    setComposing(true);
  };

  const handleForward = (targetMsg = null) => {
    const target = targetMsg || message;
    if (!target) return;
    setReplyData({ uid: target.uid, folder: target.folder || activeFolder, forward: true, subject: target.subject, text: target.text, html: target.html });
    setComposing(true);
  };

  const handleSend = async (data) => {
    const fromAddr = String(data.from || '').trim().toLowerCase();
    const isProtonSender = fromAddr.endsWith('@proton.me') || fromAddr.endsWith('@pm.me') || fromAddr.endsWith('@protonmail.com') || fromAddr.endsWith('@protonmail.ch') || fromAddr === (activeAccount?.email || '').toLowerCase() || fromAddr === (user?.email || '').toLowerCase();

    if ((activeAccount?.provider === 'proton' || user?.provider === 'proton') && isProtonSender) {
      try {
        await sendProtonMessage({
          ...data,
          from: data.from || activeAccount?.email || user?.email,
          email: activeAccount?.email || user?.email,
        });
        if (window.WoxToast) window.WoxToast.success(`Email dispatched securely from ${data.from || activeAccount?.email || user?.email}!`);
        setComposing(false);
        setReplyData(null);
        setTimeout(() => {
          refetchMessages();
          refetchFolders();
        }, 2000);
        return;
      } catch (protonSendErr) {
        if (window.WoxToast) window.WoxToast.error(`Proton Send Error: ${protonSendErr.message}`);
        throw protonSendErr;
      }
    }

    if (data.scheduledAt) {
      await post('/mail/schedule', {
        ...data,
        sendAt: data.scheduledAt,
      });
      setComposing(false);
      setReplyData(null);
    } else if (replyData?.forward) {
      await post('/mail/forward', { uid: replyData.uid, folder: replyData.folder, ...data });
      setComposing(false);
      setReplyData(null);
    } else if (replyData) {
      await post('/mail/reply', { uid: replyData.uid, folder: replyData.folder, replyAll: replyData.replyAll, ...data });
      setComposing(false);
      setReplyData(null);
    } else {
      // Standard outbound send with 10-second Undo Send buffer
      try {
        const res = await post('/mail/send', { ...data, undoDelaySeconds: 10 });
        if (res && res.dispatchId) {
          setUndoSendState({
            dispatchId: res.dispatchId,
            delaySeconds: res.delaySeconds || 10,
            lastSentPayload: data,
          });
        }
      } catch (sendErr) {
        if (window.WoxToast) window.WoxToast.error(sendErr.message || 'Failed to send message');
      }
      setComposing(false);
      setReplyData(null);
    }
    refetchMessages();
    refetchFolders();
  };

  const handleCancelUndoSend = async (dispatchId) => {
    try {
      const res = await post(`/mail/undo-send/${dispatchId}`);
      if (res && res.success) {
        if (window.WoxToast) window.WoxToast.info('Send cancelled. Restoring draft...');
        // Restore drafted content to composer
        if (undoSendState?.lastSentPayload) {
          setReplyData(null);
          setComposing(true);
        }
      }
    } catch (err) {
      if (window.WoxToast) window.WoxToast.error('Could not cancel send (already dispatched)');
    } finally {
      setUndoSendState(null);
    }
  };

  if (userLoading) return null;

  const isSpecialView = activeFolder.startsWith('__');

  return (
    <div className={`dashboard ${selectedUid ? 'has-selected-message' : ''} ${sidebarOpen ? 'sidebar-is-open' : ''}`}>
      <BackgroundCanvas />
      {/* Admin Impersonation Floating Popup Pill */}
      {user?.impersonated && (
        <aside
          role="status"
          aria-live="polite"
          className="impersonation-floating-pill"
          style={{
            position: 'fixed',
            top: '1rem',
            left: '50%',
            transform: 'translateX(-50%)',
            zIndex: 9999,
            background: 'linear-gradient(135deg, rgba(154, 52, 18, 0.95), rgba(234, 88, 12, 0.95))',
            backdropFilter: 'blur(12px)',
            WebkitBackdropFilter: 'blur(12px)',
            color: '#ffffff',
            padding: '0.4rem 0.85rem 0.4rem 1rem',
            display: 'flex',
            alignItems: 'center',
            gap: '0.75rem',
            fontSize: '0.8125rem',
            fontWeight: 500,
            borderRadius: '9999px',
            boxShadow: '0 8px 30px rgba(0, 0, 0, 0.45), 0 0 15px rgba(234, 88, 12, 0.35)',
            border: '1px solid rgba(255, 255, 255, 0.25)',
            maxWidth: 'calc(100vw - 2rem)',
            animation: 'slideDownFade 0.3s ease-out',
            pointerEvents: 'auto',
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', minWidth: 0 }}>
            <span style={{ display: 'inline-flex', alignItems: 'center', justifyContent: 'center', width: '22px', height: '22px', borderRadius: '50%', background: 'rgba(0,0,0,0.25)', flexShrink: 0 }}>
              <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/><circle cx="12" cy="11" r="2"/></svg>
            </span>
            <span style={{ whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
              Viewing mailbox as Admin: <strong style={{ color: '#fff', textDecoration: 'underline' }}>{user.email}</strong>
            </span>
          </div>
          <a
            href="/api/admin/impersonate/exit"
            className="btn btn-xs"
            style={{
              background: '#0f0f1a',
              color: '#f0f0f5',
              border: '1px solid rgba(255,255,255,0.2)',
              fontWeight: 700,
              fontSize: '0.75rem',
              textDecoration: 'none',
              padding: '0.25rem 0.75rem',
              borderRadius: '9999px',
              display: 'inline-flex',
              alignItems: 'center',
              gap: '0.35rem',
              whiteSpace: 'nowrap',
              flexShrink: 0,
              transition: 'all 0.2s ease',
              boxShadow: '0 2px 6px rgba(0,0,0,0.3)',
            }}
            onMouseOver={(e) => { e.currentTarget.style.background = '#252545'; e.currentTarget.style.color = '#ffffff'; }}
            onMouseOut={(e) => { e.currentTarget.style.background = '#0f0f1a'; e.currentTarget.style.color = '#f0f0f5'; }}
          >
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"/><polyline points="16 17 21 12 16 7"/><line x1="21" y1="12" x2="9" y2="12"/></svg>
            <span>Exit Impersonation</span>
          </a>
        </aside>
      )}

      {/* Mobile Top App Bar */}
      <header className="dashboard-mobile-header hide-desktop">
        <button
          type="button"
          className="btn btn-ghost btn-icon"
          onClick={() => setSidebarOpen(true)}
          aria-label="Open folders menu"
        >
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><line x1="3" y1="12" x2="21" y2="12"/><line x1="3" y1="6" x2="21" y2="6"/><line x1="3" y1="18" x2="21" y2="18"/></svg>
        </button>
        <span className="dashboard-mobile-title">
          {activeFolder === 'INBOX' ? 'Inbox' : activeFolder === '__all_inboxes' || activeFolder === 'All Inboxes' ? 'All Inboxes' : activeFolder.replace('__', '').replace(/_/g, ' ')}
        </span>
        <div style={{ display: 'flex', gap: '0.35rem', alignItems: 'center' }}>
          <button
            type="button"
            className="btn btn-ghost btn-icon"
            onClick={() => setShowThemeModal(true)}
            title="Themes & Shaders"
            aria-label="Theme customizer"
          >
            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="10"/><path d="M12 2a10 10 0 0 1 0 20z"/></svg>
          </button>
          <button
            type="button"
            className="btn btn-primary btn-sm"
            onClick={() => { setReplyData(null); setComposing(true); }}
            aria-label="Compose email"
          >
            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M12 20h9"/><path d="M16.5 3.5a2.121 2.121 0 0 1 3 3L7 19l-4 1 1-4L16.5 3.5z"/></svg>
          </button>
          <button
            type="button"
            className="btn btn-ghost btn-icon"
            onClick={toggleDock}
            aria-label="Productivity dock"
          >
            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect width="18" height="18" x="3" y="3" rx="2"/><path d="M3 9h18"/><path d="M9 21V9"/></svg>
          </button>
        </div>
      </header>

      {/* Mobile Drawer Backdrop */}
      {sidebarOpen && (
        <div
          className="dashboard-drawer-backdrop"
          onClick={() => setSidebarOpen(false)}
        />
      )}

      {/* Left Sidebar */}
      <Sidebar
        user={user}
        folders={folders}
        refetchFolders={refetchFolders}
        activeFolder={activeFolder}
        isOpen={sidebarOpen}
        collapsed={sidebarCollapsed}
        onToggleCollapse={toggleSidebarCollapse}
        onClose={() => setSidebarOpen(false)}
        onFolderChange={handleFolderChange}
        onOpenSupport={() => setShowSupportModal(true)}
        onOpenTheme={() => setShowThemeModal(true)}
        onCompose={() => { setReplyData(null); setComposing(true); setSidebarOpen(false); }}
        onUnlockProton={() => setShowProtonUnlock(true)}
      />

      {/* Main Content Area */}
      <div className="dashboard-main-content" style={{ display: 'flex', flex: 1, height: '100vh', overflow: 'hidden' }}>
        {/* Special Views (Gatekeeper / Campaigns / Kanban) */}
        {activeFolder === '__gatekeeper' ? (
          <GatekeeperView onBack={() => handleFolderChange('INBOX')} />
        ) : activeFolder === '__campaigns' ? (
          <CampaignsView />
        ) : showKanban ? (
          <KanbanBoard onClose={() => setShowKanban(false)} />
        ) : (
          /* Normal Mailbox Layout: Mobile Full-Screen or Desktop Split/List */
          isMobile ? (
            <div
              className={`dashboard-layout-mobile ${selectedUid ? 'mobile-reading-mode' : 'mobile-list-mode'}`}
              style={{
                display: 'flex',
                flexDirection: 'column',
                flex: 1,
                width: '100vw',
                height: 'calc(100vh - 56px)',
                overflow: 'hidden',
              }}
            >
              {selectedUid ? (
                <div className="dashboard-viewer-container" style={{ width: '100%', height: '100%', flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
                  <MessageView
                    message={message}
                    loading={msgLoading}
                    embedded={false}
                    folders={folders}
                    onBack={() => setSelectedUid(null)}
                    onReply={() => handleReply(false)}
                    onReplyAll={() => handleReply(true)}
                    onForward={handleForward}
                    onArchive={(uid) => handleBatchArchive(uid || message?.uid || selectedUid)}
                    onDelete={(uid) => handleBatchDelete(uid || message?.uid || selectedUid)}
                    onSnooze={(isoDate, uid) => handleBatchSnooze(uid || message?.uid || selectedUid, isoDate)}
                    onMove={(targetFolder, uid) => handleBatchMove(uid || message?.uid || selectedUid, targetFolder)}
                    onSpam={() => handleSpam(message?.uid || selectedUid)}
                    onToggleRead={() => handleToggleRead(message?.uid || selectedUid)}
                    onStar={() => handleStar(message?.uid || selectedUid)}
                  />
                </div>
              ) : (
                <div className="dashboard-list-container" style={{ width: '100%', height: '100%', flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
                  <MessageList
                    messages={messages}
                    loading={msgsLoading}
                    pagination={pagination}
                    selectedUid={selectedUid}
                    folder={activeFolder}
                    folders={folders}
                    activeFilterLabel={activeFilterLabel}
                    layoutMode="list"
                    onLayoutChange={changeLayoutMode}
                    dockOpen={dockOpen}
                    onToggleDock={toggleDock}
                    onClearFilter={() => { setActiveFilterLabel(''); refetchMessages(); }}
                    onSelect={setSelectedUid}
                    onStar={handleStar}
                    onDelete={handleBatchDelete}
                    onBatchArchive={handleBatchArchive}
                    onBatchDelete={handleBatchDelete}
                    onBatchSnooze={handleBatchSnooze}
                    onBatchMove={handleBatchMove}
                    onBatchStar={handleBatchStar}
                    onBatchMarkRead={handleBatchMarkRead}
                    onBatchMarkUnread={handleBatchMarkUnread}
                    onBatchSpam={handleBatchSpam}
                    onPage={setPage}
                    onRefresh={() => { refetchMessages(); refetchFolders(); }}
                    onReply={(msg) => handleReply(false, msg)}
                    onReplyAll={(msg) => handleReply(true, msg)}
                    onForward={(msg) => handleForward(msg)}
                    activeAccount={activeAccount}
                    isProtonLocked={activeAccount?.provider === 'proton' && !isProtonUnlocked}
                    onUnlockProton={() => setShowProtonUnlock(true)}
                  />
                </div>
              )}
            </div>
          ) : (
            <div
              className={`dashboard-layout-${layoutMode} ${selectedUid ? 'has-message-selected' : ''}`}
              style={{
                display: 'flex',
                flexDirection: layoutMode === 'horizontal' ? 'column' : 'row',
                flex: 1,
                width: '100%',
                height: '100vh',
                overflow: 'hidden',
              }}
            >
              {/* In List Mode: Render MessageList when !selectedUid, or MessageView when selectedUid */}
              {layoutMode === 'list' ? (
                selectedUid ? (
                  <div className="dashboard-viewer-container" style={{ width: '100%', height: '100vh', flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
                    <MessageView
                      message={message}
                      loading={msgLoading}
                      embedded={false}
                      folders={folders}
                      onBack={() => setSelectedUid(null)}
                      onReply={() => handleReply(false)}
                      onReplyAll={() => handleReply(true)}
                      onForward={handleForward}
                      onArchive={(uid) => handleBatchArchive(uid || message?.uid || selectedUid)}
                      onDelete={(uid) => handleBatchDelete(uid || message?.uid || selectedUid)}
                      onSnooze={(isoDate, uid) => handleBatchSnooze(uid || message?.uid || selectedUid, isoDate)}
                      onMove={(targetFolder, uid) => handleBatchMove(uid || message?.uid || selectedUid, targetFolder)}
                      onSpam={() => handleSpam(message?.uid || selectedUid)}
                      onToggleRead={() => handleToggleRead(message?.uid || selectedUid)}
                      onStar={() => handleStar(message?.uid || selectedUid)}
                    />
                  </div>
                ) : (
                  <div className="dashboard-list-container" style={{ width: '100%', height: '100vh', flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
                    <MessageList
                      messages={messages}
                      loading={msgsLoading}
                      pagination={pagination}
                      selectedUid={selectedUid}
                      folder={activeFolder}
                      folders={folders}
                      activeFilterLabel={activeFilterLabel}
                      layoutMode={layoutMode}
                      onLayoutChange={changeLayoutMode}
                      dockOpen={dockOpen}
                      onToggleDock={toggleDock}
                      onClearFilter={() => { setActiveFilterLabel(''); refetchMessages(); }}
                      onSelect={setSelectedUid}
                      onStar={handleStar}
                      onDelete={handleBatchDelete}
                      onBatchArchive={handleBatchArchive}
                      onBatchDelete={handleBatchDelete}
                      onBatchSnooze={handleBatchSnooze}
                      onBatchMove={handleBatchMove}
                      onBatchStar={handleBatchStar}
                      onBatchMarkRead={handleBatchMarkRead}
                      onBatchMarkUnread={handleBatchMarkUnread}
                      onBatchSpam={handleBatchSpam}
                      onPage={setPage}
                      onRefresh={() => { refetchMessages(); refetchFolders(); }}
                      onReply={(msg) => handleReply(false, msg)}
                      onReplyAll={(msg) => handleReply(true, msg)}
                      onForward={(msg) => handleForward(msg)}
                      activeAccount={activeAccount}
                      isProtonLocked={activeAccount?.provider === 'proton' && !isProtonUnlocked}
                      onUnlockProton={() => setShowProtonUnlock(true)}
                    />
                  </div>
                )
              ) : (
                /* Vertical and Horizontal Split Modes */
                <>
                  <div
                    className="dashboard-list-container"
                    style={{
                      width: layoutMode === 'vertical' ? `${splitRatio}%` : '100%',
                      height: layoutMode === 'horizontal' ? `${splitRatio}%` : '100%',
                      flexShrink: 0,
                      minWidth: layoutMode === 'vertical' ? '280px' : 'auto',
                      maxWidth: layoutMode === 'vertical' ? '440px' : 'none',
                      minHeight: layoutMode === 'horizontal' ? '180px' : 'auto',
                      maxHeight: layoutMode === 'horizontal' ? '60%' : 'none',
                      display: 'flex',
                      flexDirection: 'column',
                      overflow: 'hidden',
                    }}
                  >
                    <MessageList
                      messages={messages}
                      loading={msgsLoading}
                      pagination={pagination}
                      selectedUid={selectedUid}
                      folder={activeFolder}
                      folders={folders}
                      activeFilterLabel={activeFilterLabel}
                      layoutMode={layoutMode}
                      onLayoutChange={changeLayoutMode}
                      dockOpen={dockOpen}
                      onToggleDock={toggleDock}
                      onClearFilter={() => { setActiveFilterLabel(''); refetchMessages(); }}
                      onSelect={setSelectedUid}
                      onStar={handleStar}
                      onDelete={handleBatchDelete}
                      onBatchArchive={handleBatchArchive}
                      onBatchDelete={handleBatchDelete}
                      onBatchSnooze={handleBatchSnooze}
                      onBatchMove={handleBatchMove}
                      onBatchStar={handleBatchStar}
                      onBatchMarkRead={handleBatchMarkRead}
                      onBatchMarkUnread={handleBatchMarkUnread}
                      onBatchSpam={handleBatchSpam}
                      onPage={setPage}
                      onRefresh={() => { refetchMessages(); refetchFolders(); }}
                      onReply={(msg) => handleReply(false, msg)}
                      onReplyAll={(msg) => handleReply(true, msg)}
                      onForward={(msg) => handleForward(msg)}
                      activeAccount={activeAccount}
                      isProtonLocked={activeAccount?.provider === 'proton' && !isProtonUnlocked}
                      onUnlockProton={() => setShowProtonUnlock(true)}
                    />
                  </div>

                  <SplitDivider
                    direction={layoutMode === 'vertical' ? 'vertical' : 'horizontal'}
                    currentRatio={splitRatio}
                    onResize={handleSplitResize}
                  />

                  <div
                    className="dashboard-viewer-container"
                    style={{
                      width: layoutMode === 'vertical' ? `${100 - splitRatio}%` : '100%',
                      height: layoutMode === 'horizontal' ? `${100 - splitRatio}%` : '100%',
                      flex: 1,
                      minWidth: 0,
                      display: 'flex',
                      flexDirection: 'column',
                      overflow: 'hidden',
                    }}
                  >
                    {selectedUid ? (
                      <MessageView
                        message={message}
                        loading={msgLoading}
                        embedded={true}
                        folders={folders}
                        onBack={() => setSelectedUid(null)}
                        onReply={() => handleReply(false)}
                        onReplyAll={() => handleReply(true)}
                        onForward={handleForward}
                        onArchive={(uid) => handleBatchArchive(uid || message?.uid || selectedUid)}
                        onDelete={(uid) => handleBatchDelete(uid || message?.uid || selectedUid)}
                        onSnooze={(isoDate, uid) => handleBatchSnooze(uid || message?.uid || selectedUid, isoDate)}
                        onMove={(targetFolder, uid) => handleBatchMove(uid || message?.uid || selectedUid, targetFolder)}
                        onSpam={() => handleSpam(message?.uid || selectedUid)}
                        onToggleRead={() => handleToggleRead(message?.uid || selectedUid)}
                        onStar={() => handleStar(message?.uid || selectedUid)}
                      />
                    ) : (
                      <div
                        className="dashboard-viewer-empty"
                        style={{
                          flex: 1,
                          display: 'flex',
                          flexDirection: 'column',
                          alignItems: 'center',
                          justifyContent: 'center',
                          textAlign: 'center',
                          margin: 'auto',
                          width: '100%',
                          height: '100%',
                          padding: '2rem 1.5rem',
                        }}
                      >
                        <div className="empty-icon-large" style={{ display: 'inline-flex', color: 'var(--color-primary-light)' }}>
      <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
        <path d="M22 13V6a2 2 0 0 0-2-2H4a2 2 0 0 0-2 2v12c0 1.1.9 2 2 2h9"/>
        <path d="m22 7-8.97 5.7a1.94 1.94 0 0 1-2.06 0L2 7"/>
      </svg>
    </div>
                        <h3>No Conversation Selected</h3>
                        <p>Choose an email from the list to preview its contents and private notes.</p>
                        <div className="keyboard-shortcuts-pill">
                          <span><kbd>J</kbd> / <kbd>K</kbd> Navigate</span>
                          <span><kbd>Enter</kbd> Open</span>
                          <span><kbd>C</kbd> New Email</span>
                          <span><kbd>Ctrl+K</kbd> Command Palette</span>
                        </div>
                      </div>
                    )}
                  </div>
                </>
              )}
            </div>
          )
        )}

        {/* Right Companion Dock Slide-Over Drawer */}
        {dockOpen && (
          <>
            <div className="dock-overlay-backdrop" onClick={toggleDock} />
            <CompanionDock
              user={user}
              activeMessage={message}
              onClose={toggleDock}
              onComposeTo={(recipient) => {
                setReplyData(null);
                setComposing(true);
              }}
              onFilterBySender={(senderEmail) => {
                const searchEl = document.querySelector('input[type="search"], .search-input, input[placeholder*="Search"]');
                if (searchEl) {
                  searchEl.value = `from:${senderEmail}`;
                  searchEl.dispatchEvent(new Event('input', { bubbles: true }));
                  searchEl.focus();
                }
              }}
            />
          </>
        )}
      </div>

      {/* Compose Modal */}
      {composing && (
        <ComposeModal
          user={user}
          activeAccount={activeAccount}
          replyData={replyData}
          originalMessage={replyData ? message : null}
          onSend={handleSend}
          onClose={() => { setComposing(false); setReplyData(null); }}
        />
      )}

      {/* Support Desk Modal */}
      {showSupportModal && (
        <SupportModal
          user={user}
          onClose={() => setShowSupportModal(false)}
        />
      )}

      {/* Command Palette */}
      <CommandPalette
        isOpen={cmdPaletteOpen}
        folders={folders}
        user={user}
        onClose={setCmdPaletteOpen}
        onAction={(action, payload) => {
          if (action === 'compose') { setReplyData(null); setComposing(true); }
          else if (action === 'secure') { setReplyData(null); setComposing(true); }
          else if (action === 'folder') { handleFolderChange(payload); }
          else if (action === 'gatekeeper') { handleFolderChange('__gatekeeper'); }
          else if (action === 'campaigns') { handleFolderChange('__campaigns'); }
          else if (action === 'kanban') { setShowKanban(true); }
          else if (action === 'templates') { setTemplatePickerOpen(true); }
          else if (action === 'accounts') { setAccountSwitcherOpen(true); }
          else if (action === 'support') { setShowSupportModal(true); }
          else if (action === 'theme') { setShowThemeModal(true); }
          else if (action === 'refresh') { refetchMessages(); refetchFolders(); }
        }}
      />

      {/* Keyboard Shortcuts Guide Modal */}
      <KeyboardShortcutsModal
        isOpen={showShortcutsModal}
        onClose={() => setShowShortcutsModal(false)}
      />

      {/* Undo Send Floating Countdown Toast */}
      {undoSendState && (
        <UndoSendToast
          dispatchId={undoSendState.dispatchId}
          delaySeconds={undoSendState.delaySeconds}
          onUndo={handleCancelUndoSend}
          onFinish={() => {
            if (window.WoxToast) window.WoxToast.success('Email sent successfully');
            setUndoSendState(null);
            refetchMessages();
            refetchFolders();
          }}
        />
      )}

      {/* Account Switcher Modal */}
      {accountSwitcherOpen && (
        <AccountSwitcherModal
          user={user}
          activeAccount={activeAccount}
          onSelectAccount={(acc) => {
            setActiveAccount(acc);
            setSelectedUid(null);
            setPage(1);
            setAccountSwitcherOpen(false);
          }}
          onClose={() => setAccountSwitcherOpen(false)}
        />
      )}

      {/* Template Picker Modal (used by Compose) */}
      {templatePickerOpen && (
        <TemplatePickerModal
          onSelect={(templateBody) => {
            setReplyData(null);
            setComposing(true);
            setTemplatePickerOpen(false);
          }}
          onClose={() => setTemplatePickerOpen(false)}
        />
      )}

      {/* Theme & Background Customizer Modal */}
      {showThemeModal && (
        <ThemeCustomizerModal
          onClose={() => setShowThemeModal(false)}
        />
      )}

      {/* Proton Mailbox Decryption Modal */}
      {showProtonUnlock && (
        <ProtonUnlockModal
          email={user?.email || activeAccount?.email}
          onUnlocked={handleProtonUnlocked}
          onClose={() => setShowProtonUnlock(false)}
        />
      )}

      {/* Interactive Background Canvas */}
      <BackgroundCanvas />
    </div>
  );
}
