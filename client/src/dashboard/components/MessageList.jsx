import React, { useState, useMemo, useRef, useEffect, useCallback } from 'react';
import { useDebounce } from '../../shared/hooks.js';
import { formatDate } from '../../shared/utils/formatters.js';
import BatchToolbar from './BatchToolbar.jsx';
import ContextMenu from './ContextMenu.jsx';
import { getFolderIcon } from './Sidebar.jsx';

export default function MessageList({
  messages = [],
  loading = false,
  pagination,
  selectedUid,
  folder = 'INBOX',
  folders = [],
  activeFilterLabel = '',
  layoutMode = 'vertical',
  onLayoutChange,
  dockOpen = false,
  onToggleDock,
  onClearFilter,
  onSelect,
  onStar,
  onDelete,
  onBatchArchive,
  onBatchDelete,
  onBatchSnooze,
  onBatchMove,
  onBatchStar,
  onBatchMarkRead,
  onBatchMarkUnread,
  onSpam: onBatchSpam,
  onPage,
  onRefresh,
  onReply,
  onReplyAll,
  onForward,
  activeAccount,
  isProtonLocked,
  onUnlockProton,
}) {
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedUids, setSelectedUids] = useState(new Set());
  const [isSelectionMode, setIsSelectionMode] = useState(false);
  const [contextMenu, setContextMenu] = useState(null);
  const longPressTimerRef = useRef(null);
  const isLongPressActiveRef = useRef(false);
  const listBodyRef = useRef(null);
  const debouncedSearch = useDebounce(searchQuery, 300);

  // List Mode: 'paged' (with page jump textbox) vs 'continuous' (infinite stream)
  const [listMode, setListMode] = useState(() => {
    return localStorage.getItem('woxmail_list_mode') || 'paged';
  });
  const [jumpPageInput, setJumpPageInput] = useState('');

  // Continuous Scrolling State
  const [continuousMessages, setContinuousMessages] = useState([]);
  const [continuousPage, setContinuousPage] = useState(1);
  const [loadingMore, setLoadingMore] = useState(false);
  const [hasMore, setHasMore] = useState(true);
  const [showScrollTop, setShowScrollTop] = useState(false);

  // Sync page 1 messages to continuous stream when folder/filter/refresh changes
  useEffect(() => {
    if (pagination?.page === 1 || continuousPage === 1 || !pagination) {
      setContinuousMessages(messages);
      setContinuousPage(1);
      setHasMore(pagination ? pagination.page < pagination.totalPages : true);
    }
  }, [messages, folder, activeFilterLabel]);

  // Sync jump input value when page changes in paged mode
  useEffect(() => {
    if (pagination?.page) {
      setJumpPageInput(String(pagination.page));
    }
  }, [pagination?.page]);

  const handleModeChange = (mode) => {
    setListMode(mode);
    localStorage.setItem('woxmail_list_mode', mode);
    if (mode === 'continuous') {
      if (continuousMessages.length === 0 && messages.length > 0) {
        setContinuousMessages(messages);
      }
    }
  };

  const handlePageJumpSubmit = (e) => {
    if (e) e.preventDefault();
    if (!pagination || !onPage) return;
    const parsed = parseInt(jumpPageInput, 10);
    if (!isNaN(parsed) && parsed >= 1 && parsed <= pagination.totalPages) {
      if (parsed !== pagination.page) {
        onPage(parsed);
        if (listBodyRef.current) {
          listBodyRef.current.scrollTo({ top: 0, behavior: 'smooth' });
        }
      }
    } else {
      setJumpPageInput(String(pagination.page));
    }
  };

  const loadMoreContinuous = useCallback(async () => {
    if (loadingMore || !hasMore || loading) return;
    const nextPage = continuousPage + 1;
    if (pagination && nextPage > pagination.totalPages) {
      setHasMore(false);
      return;
    }

    setLoadingMore(true);
    try {
      const isAllInboxes = folder === '__all_inboxes' || folder === 'All Inboxes';
      const cleanFolder = isAllInboxes ? 'INBOX' : folder;
      const endpoint = cleanFolder === 'INBOX'
        ? `/api/mail/inbox?page=${nextPage}&limit=25`
        : `/api/mail/folder/${encodeURIComponent(cleanFolder)}?page=${nextPage}&limit=25`;

      const res = await fetch(endpoint, { credentials: 'include' });
      if (!res.ok) throw new Error('Failed to fetch more emails');
      const data = await res.json();
      const newMsgs = data.messages || [];

      if (newMsgs.length === 0) {
        setHasMore(false);
      } else {
        setContinuousMessages((prev) => {
          const existingUids = new Set(prev.map((m) => m.uid));
          const uniqueNew = newMsgs.filter((m) => !existingUids.has(m.uid));
          return [...prev, ...uniqueNew];
        });
        setContinuousPage(nextPage);
        if (data.pagination && nextPage >= data.pagination.totalPages) {
          setHasMore(false);
        }
      }
    } catch (err) {
      console.warn('Continuous scroll load failed:', err.message);
      setHasMore(false);
    } finally {
      setLoadingMore(false);
    }
  }, [continuousPage, folder, hasMore, loading, loadingMore, pagination]);

  const handleScroll = (e) => {
    const { scrollTop, scrollHeight, clientHeight } = e.currentTarget;
    setShowScrollTop(scrollTop > 450);

    if (listMode === 'continuous') {
      if (scrollTop + clientHeight >= scrollHeight - 250) {
        loadMoreContinuous();
      }
    }
  };

  const scrollToTop = () => {
    if (listBodyRef.current) {
      listBodyRef.current.scrollTo({ top: 0, behavior: 'smooth' });
    }
  };

  const rawMessagesList = listMode === 'continuous' ? continuousMessages : messages;

  const isMultiSelectActive = isSelectionMode || selectedUids.size > 0;

  // Client-side filter (server search is handled via SearchBar)
  const filtered = useMemo(() => {
    if (!debouncedSearch) return rawMessagesList;
    const q = debouncedSearch.toLowerCase();
    return rawMessagesList.filter(
      (m) =>
        (m.subject || '').toLowerCase().includes(q) ||
        (m.from?.name || '').toLowerCase().includes(q) ||
        (m.from?.address || '').toLowerCase().includes(q) ||
        (m.snippet || '').toLowerCase().includes(q)
    );
  }, [rawMessagesList, debouncedSearch]);

  const toggleSelect = (uid, e) => {
    if (e) e.stopPropagation();
    setSelectedUids((prev) => {
      const next = new Set(prev);
      next.has(uid) ? next.delete(uid) : next.add(uid);
      return next;
    });
  };

  const handleMasterSelectToggle = () => {
    if (isMultiSelectActive) {
      clearSelection();
    } else {
      setIsSelectionMode(true);
      setSelectedUids(new Set());
    }
  };

  const selectAll = () => {
    if (selectedUids.size === filtered.length) {
      setSelectedUids(new Set());
      setIsSelectionMode(false);
    } else {
      setIsSelectionMode(true);
      setSelectedUids(new Set(filtered.map((m) => m.uid)));
    }
  };

  const clearSelection = () => {
    setSelectedUids(new Set());
    setIsSelectionMode(false);
  };

  // Mobile Long-Press Gesture (context menu action sheet trigger or selection toggle)
  const handleTouchStart = (e, msg) => {
    isLongPressActiveRef.current = false;
    if (longPressTimerRef.current) clearTimeout(longPressTimerRef.current);
    const touch = e.touches ? e.touches[0] : e;
    const clientX = touch.clientX;
    const clientY = touch.clientY;

    longPressTimerRef.current = setTimeout(() => {
      isLongPressActiveRef.current = true;
      if (isMultiSelectActive) {
        setSelectedUids((prev) => {
          const next = new Set(prev);
          next.add(msg.uid);
          return next;
        });
      } else {
        handleRowContextMenu({ clientX, clientY, preventDefault: () => {}, stopPropagation: () => {} }, msg);
      }
      if (navigator.vibrate) {
        try { navigator.vibrate(40); } catch (err) {}
      }
    }, 450);
  };

  const handleTouchEnd = () => {
    if (longPressTimerRef.current) {
      clearTimeout(longPressTimerRef.current);
      longPressTimerRef.current = null;
    }
  };

  const handleTouchMove = () => {
    if (longPressTimerRef.current) {
      clearTimeout(longPressTimerRef.current);
      longPressTimerRef.current = null;
    }
  };

  const handleRowClick = (uid) => {
    if (isLongPressActiveRef.current) {
      isLongPressActiveRef.current = false;
      return;
    }
    if (isMultiSelectActive) {
      toggleSelect(uid);
    } else {
      onSelect(uid);
    }
  };

  const handleRowContextMenu = (e, msg) => {
    e.preventDefault();
    e.stopPropagation();
    const x = e.clientX !== undefined ? e.clientX : (e.touches && e.touches[0] ? e.touches[0].clientX : window.innerWidth / 2);
    const y = e.clientY !== undefined ? e.clientY : (e.touches && e.touches[0] ? e.touches[0].clientY : window.innerHeight / 2);
    const isStarred = Boolean(msg.isStarred || msg.flags?.includes('\\Flagged') || msg.starred);
    const senderAddr = typeof msg.from === 'object' ? (msg.from?.address || '') : String(msg.from || '');

    // Available target folders for Move submenu
    const targetFolders = (folders || [])
      .map((f) => (typeof f === 'string' ? f : (f.name || f.id || '')))
      .filter((fName) => fName && fName.toLowerCase() !== (folder || '').toLowerCase());

    const items = [
      {
        label: 'Reply',
        icon: <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="9 17 4 12 9 7"/><path d="M20 18v-2a4 4 0 0 0-4-4H4"/></svg>,
        shortcut: 'R',
        onClick: () => { if (onReply) onReply(msg); },
      },
      {
        label: 'Reply All',
        icon: <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="7 17 2 12 7 7"/><polyline points="12 17 7 12 12 7"/><path d="M22 18v-2a4 4 0 0 0-4-4H7"/></svg>,
        shortcut: 'A',
        onClick: () => { if (onReplyAll) onReplyAll(msg); },
      },
      {
        label: 'Forward',
        icon: <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="15 17 20 12 15 7"/><path d="M4 18v-2a4 4 0 0 1 4-4h12"/></svg>,
        shortcut: 'F',
        onClick: () => { if (onForward) onForward(msg); },
      },
      { divider: true },
      {
        label: msg.isRead ? 'Mark as Unread' : 'Mark as Read',
        icon: <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M22 13V6a2 2 0 0 0-2-2H4a2 2 0 0 0-2 2v12c0 1.1.9 2 2 2h9"/><path d="m22 7-8.97 5.7a1.94 1.94 0 0 1-2.06 0L2 7"/></svg>,
        shortcut: 'U',
        onClick: () => {
          if (msg.isRead) {
            onBatchMarkUnread ? onBatchMarkUnread([msg.uid]) : null;
          } else {
            onBatchMarkRead ? onBatchMarkRead([msg.uid]) : null;
          }
        },
      },
      {
        label: isStarred ? 'Unstar Message' : 'Star Message',
        icon: <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2"/></svg>,
        shortcut: 'S',
        onClick: () => { if (onStar) onStar(msg.uid); },
      },
      {
        label: 'Snooze',
        icon: <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/></svg>,
        children: [
          {
            label: 'Later Today (+4 hours)',
            onClick: () => {
              const later = new Date(Date.now() + 4 * 3600000).toISOString();
              if (onBatchSnooze) onBatchSnooze([msg.uid], later);
            },
          },
          {
            label: 'Tomorrow Morning (9:00 AM)',
            onClick: () => {
              const tom = new Date();
              tom.setDate(tom.getDate() + 1);
              tom.setHours(9, 0, 0, 0);
              if (onBatchSnooze) onBatchSnooze([msg.uid], tom.toISOString());
            },
          },
          {
            label: 'This Weekend (Saturday 9:00 AM)',
            onClick: () => {
              const sat = new Date();
              sat.setDate(sat.getDate() + ((6 - sat.getDay() + 7) % 7 || 7));
              sat.setHours(9, 0, 0, 0);
              if (onBatchSnooze) onBatchSnooze([msg.uid], sat.toISOString());
            },
          },
          {
            label: 'Next Week (+7 days)',
            onClick: () => {
              const nextW = new Date(Date.now() + 7 * 86400000);
              if (onBatchSnooze) onBatchSnooze([msg.uid], nextW.toISOString());
            },
          },
        ],
      },
      {
        label: 'Move to Folder',
        icon: <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z"/></svg>,
        children: targetFolders.length > 0 ? targetFolders.map((fName) => ({
          label: fName,
          onClick: () => {
            if (onBatchMove) onBatchMove([msg.uid], fName);
            if (window.WoxToast) window.WoxToast.success(`Moved message to ${fName}`);
          },
        })) : [
          { label: 'Archive', onClick: () => onBatchArchive && onBatchArchive([msg.uid]) },
          { label: 'Trash', onClick: () => onDelete && onDelete(msg.uid) },
        ],
      },
      {
        label: 'Apply Labels / Tags',
        icon: <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M20.59 13.41l-7.17 7.17a2 2 0 0 1-2.83 0L2 12V2h10l8.59 8.59a2 2 0 0 1 0 2.82z"/><line x1="7" y1="7" x2="7.01" y2="7"/></svg>,
        children: ['Important', 'Work', 'Personal', 'Finance', 'Newsletter'].map((labelName) => ({
          label: labelName,
          onClick: async () => {
            try {
              await fetch(`/api/mail/tag`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ uid: msg.uid, tag: labelName.toLowerCase(), folder }),
              });
              if (window.WoxToast) window.WoxToast.success(`Tag '${labelName}' applied`);
            } catch {
              if (window.WoxToast) window.WoxToast.info(`Tag '${labelName}' marked`);
            }
          },
        })),
      },
      {
        label: 'Bump If No Reply',
        icon: <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 14 14"/></svg>,
        onClick: async () => {
          try {
            await fetch(`/api/followup/schedule`, {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ messageId: msg.messageId || msg.uid, days: 3, recipient: senderAddr }),
            });
            if (window.WoxToast) window.WoxToast.success(`Follow-up reminder set: bump in 3 days if no reply`);
          } catch {
            if (window.WoxToast) window.WoxToast.success(`Follow-up scheduled for 3 days`);
          }
        },
      },
      {
        label: 'Open Contact Dossier',
        icon: <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M23 21v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/></svg>,
        onClick: () => {
          if (onToggleDock) onToggleDock(true);
          window.dispatchEvent(new CustomEvent('woxmail:select-dossier-contact', { detail: { email: senderAddr } }));
        },
      },
      { divider: true },
      {
        label: 'Archive',
        icon: <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect width="20" height="5" x="2" y="3" rx="1"/><path d="M4 8v11a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8"/><path d="M10 12h4"/></svg>,
        shortcut: 'E',
        onClick: () => { if (onBatchArchive) onBatchArchive([msg.uid]); },
      },
      {
        label: 'Copy Subject',
        icon: <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect width="14" height="14" x="8" y="8" rx="2" ry="2"/><path d="M4 16c-1.1 0-2-.9-2-2V4c0-1.1.9-2 2-2h10c1.1 0 2 .9 2 2"/></svg>,
        onClick: () => {
          navigator.clipboard.writeText(msg.subject || '');
          if (window.WoxToast) window.WoxToast.success('Subject copied');
        },
      },
      {
        label: 'Copy Sender Address',
        icon: <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="4"/><path d="M16 8v5a3 3 0 0 0 6 0v-1a10 10 0 1 0-4 8"/></svg>,
        onClick: () => {
          navigator.clipboard.writeText(senderAddr);
          if (window.WoxToast) window.WoxToast.success('Sender address copied');
        },
      },
      { divider: true },
      {
        label: 'Report as Spam',
        icon: <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/></svg>,
        danger: true,
        onClick: () => { if (onBatchSpam) onBatchSpam([msg.uid]); },
      },
      {
        label: 'Delete Message',
        icon: <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="3 6 5 6 21 6"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/></svg>,
        danger: true,
        shortcut: '#',
        onClick: () => { if (onDelete) onDelete(msg.uid); },
      },
    ];

    setContextMenu({
      x,
      y,
      items,
      title: msg.subject || '(No Subject)',
    });
  };

  // Retry failed outbox message
  const handleRetryOutbox = async (outboxId, e) => {
    e.stopPropagation();
    try {
      if (window.WoxToast) window.WoxToast.info('Retrying email delivery...');
      const res = await fetch(`/api/mail/outbox/${outboxId}/retry`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Retry failed');
      if (window.WoxToast) window.WoxToast.success('Email delivered successfully!');
      if (onRefresh) onRefresh();
    } catch (err) {
      if (window.WoxToast) window.WoxToast.error(err.message || 'Failed to retry email');
    }
  };

  const renderOutboxBadge = (msg) => {
    if (!msg.isOutbox && folder !== 'Outbox') return null;
    switch (msg.status) {
      case 'failed':
        return (
          <span className="badge badge-red" style={{ fontSize: '0.68rem', padding: '0.15rem 0.45rem', marginRight: '0.35rem', verticalAlign: 'middle' }} title={msg.errorMessage || 'Delivery failed'}>
            Delivery Failed
          </span>
        );
      case 'sending':
        return (
          <span className="badge badge-blue" style={{ fontSize: '0.68rem', padding: '0.15rem 0.45rem', marginRight: '0.35rem', background: 'rgba(59, 130, 246, 0.15)', color: '#60a5fa', verticalAlign: 'middle' }}>
            Sending...
          </span>
        );
      case 'queued_undo':
        return (
          <span className="badge badge-amber" style={{ fontSize: '0.68rem', padding: '0.15rem 0.45rem', marginRight: '0.35rem', verticalAlign: 'middle' }}>
            ⏳ Undo Window
          </span>
        );
      case 'scheduled':
        return (
          <span className="badge badge-purple" style={{ fontSize: '0.68rem', padding: '0.15rem 0.45rem', marginRight: '0.35rem', verticalAlign: 'middle' }}>
            Scheduled
          </span>
        );
      case 'sent':
        return (
          <span className="badge badge-green" style={{ fontSize: '0.68rem', padding: '0.15rem 0.45rem', marginRight: '0.35rem', verticalAlign: 'middle' }}>
            Confirmed Sent
          </span>
        );
      default:
        return null;
    }
  };

  // Batch action handlers wrapper
  const handleBatch = (actionFn) => {
    if (selectedUids.size === 0 || !actionFn) return;
    const uidsArray = Array.from(selectedUids);
    clearSelection();
    actionFn(uidsArray);
  };

  return (
    <section className="dashboard-list" aria-label="Messages list">
      <div className="list-header" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '0.5rem', padding: '0.75rem 1rem', borderBottom: '1px solid rgba(255, 255, 255, 0.08)', background: 'rgba(18, 14, 30, 0.75)', backdropFilter: 'blur(16px)', WebkitBackdropFilter: 'blur(16px)' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', minWidth: 0, flex: 1 }}>
          <h2 style={{ margin: 0, fontSize: '1.05rem', fontWeight: 700, textTransform: 'capitalize', display: 'flex', alignItems: 'center', gap: '0.45rem', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
            <span style={{ display: 'inline-flex', alignItems: 'center', color: 'var(--color-primary-light)' }}>{getFolderIcon(folder)}</span>
            <span>{folder === '__all_inboxes' || folder === 'All Inboxes' ? 'All Inboxes' : folder}</span>
          </h2>
          {pagination?.total !== undefined && (
            <span style={{ fontSize: '0.75rem', color: 'var(--color-text-tertiary)', background: 'rgba(255, 255, 255, 0.06)', padding: '0.1rem 0.45rem', borderRadius: 'var(--radius-pill)', border: '1px solid var(--color-border-subtle)', flexShrink: 0 }}>
              {pagination.total}
            </span>
          )}
          {activeAccount?.provider === 'proton' && (
            <button
              type="button"
              className={`badge ${isProtonLocked ? 'badge-amber' : 'badge-purple'}`}
              onClick={onUnlockProton}
              style={{
                cursor: 'pointer',
                border: isProtonLocked ? '1px solid rgba(245, 158, 11, 0.4)' : '1px solid rgba(124, 58, 237, 0.4)',
                fontSize: '0.72rem',
                fontWeight: 600,
                padding: '0.15rem 0.5rem',
                display: 'inline-flex',
                alignItems: 'center',
                gap: '0.25rem',
                whiteSpace: 'nowrap',
                flexShrink: 0,
                borderRadius: 'var(--radius-pill)',
              }}
              title={isProtonLocked ? "Proton PGP keys locked. Click to decrypt inbox." : "Proton Cloud Sync. Click to re-authenticate or decrypt."}
            >
              {isProtonLocked ? '🔒 Unlock' : '⚡ Proton Sync'}
            </button>
          )}
          {onRefresh && (
            <button
              type="button"
              className="btn btn-ghost btn-xs"
              onClick={onRefresh}
              title="Refresh messages from server (r)"
              disabled={loading}
              style={{ display: 'inline-flex', alignItems: 'center', padding: '0.25rem 0.4rem', color: 'var(--color-primary-light)', flexShrink: 0 }}
            >
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"><path d="M21 12a9 9 0 0 0-9-9 9.75 9.75 0 0 0-6.74 2.74L3 8"/><path d="M3 3v5h5"/><path d="M3 12a9 9 0 0 0 9 9 9.75 9.75 0 0 0 6.74-2.74L21 16"/><path d="M16 21h5v-5"/></svg>
            </button>
          )}
          {(folder || '').toLowerCase() === 'trash' && messages.length > 0 && (onBatchDelete || onDelete) && (
            <button
              type="button"
              className="btn btn-ghost btn-xs"
              onClick={() => {
                const uids = messages.map((m) => m.uid);
                if (onBatchDelete) onBatchDelete(uids);
                else if (onDelete) onDelete(uids);
              }}
              title="Permanently empty all messages in Trash"
              style={{ color: 'var(--color-error)', fontSize: '0.75rem', padding: '0.2rem 0.5rem', fontWeight: 600, flexShrink: 0 }}
            >
              Empty Trash
            </button>
          )}
        </div>

        {/* Layout Mode Switcher & Dock Trigger */}
        <div className="layout-switcher hide-mobile" style={{ flexShrink: 0 }}>
          {onLayoutChange && (
            <>
              <button
                type="button"
                className={`layout-btn ${layoutMode === 'list' ? 'active' : ''}`}
                onClick={() => onLayoutChange('list')}
                title="Full List View (Ctrl+1)"
                aria-label="List View"
              >
                <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
                  <line x1="8" y1="6" x2="21" y2="6"></line>
                  <line x1="8" y1="12" x2="21" y2="12"></line>
                  <line x1="8" y1="18" x2="21" y2="18"></line>
                  <line x1="3" y1="6" x2="3.01" y2="6"></line>
                  <line x1="3" y1="12" x2="3.01" y2="12"></line>
                  <line x1="3" y1="18" x2="3.01" y2="18"></line>
                </svg>
              </button>
              <button
                type="button"
                className={`layout-btn ${layoutMode === 'vertical' ? 'active' : ''}`}
                onClick={() => onLayoutChange('vertical')}
                title="Vertical Split View (Ctrl+2)"
                aria-label="Vertical Split View"
              >
                <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
                  <rect x="3" y="3" width="18" height="18" rx="3" ry="3"></rect>
                  <line x1="11" y1="3" x2="11" y2="21"></line>
                </svg>
              </button>
              <button
                type="button"
                className={`layout-btn ${layoutMode === 'horizontal' ? 'active' : ''}`}
                onClick={() => onLayoutChange('horizontal')}
                title="Horizontal Rows View (Ctrl+3)"
                aria-label="Horizontal Rows View"
              >
                <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
                  <rect x="3" y="3" width="18" height="18" rx="3" ry="3"></rect>
                  <line x1="3" y1="11" x2="21" y2="11"></line>
                </svg>
              </button>
            </>
          )}

          {onToggleDock && (
            <button
              type="button"
              className={`layout-btn ${dockOpen ? 'active' : ''}`}
              onClick={onToggleDock}
              title="Productivity Hub & Scratchpad (Ctrl+.)"
              aria-label="Toggle Productivity Dock"
              style={{ marginLeft: 2, borderLeft: '1px solid var(--color-border-subtle)', borderRadius: '0 4px 4px 0', display: 'inline-flex', alignItems: 'center', justifyContent: 'center' }}
            >
              <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect width="18" height="18" x="3" y="3" rx="2"/><path d="M15 3v18"/></svg>
            </button>
          )}
        </div>
      </div>

      {/* Sub-Header Search & Master Multi-Select Toggle */}
      <div
        className="list-search-bar"
        style={{
          padding: '0.4rem 0.75rem',
          borderBottom: '1px solid var(--color-border)',
          background: 'var(--color-bg-card)',
          display: 'flex',
          alignItems: 'center',
          gap: '0.4rem',
        }}
      >
        <button
          type="button"
          className={`btn btn-ghost btn-xs ${isMultiSelectActive ? 'active' : ''}`}
          onClick={handleMasterSelectToggle}
          title={isMultiSelectActive ? 'Exit multi-selection mode (Esc)' : 'Enter multi-selection mode'}
          style={{
            height: 30,
            padding: '0 0.55rem',
            display: 'inline-flex',
            alignItems: 'center',
            gap: '0.35rem',
            borderRadius: 'var(--radius-sm)',
            border: isMultiSelectActive ? '1px solid var(--color-primary)' : '1px solid var(--color-border)',
            background: isMultiSelectActive ? 'var(--color-primary-glow)' : 'var(--color-bg-hover)',
            color: isMultiSelectActive ? 'var(--color-primary-light)' : 'var(--color-text-secondary)',
            flexShrink: 0,
            fontSize: '0.75rem',
            fontWeight: 600,
            cursor: 'pointer',
            transition: 'all 0.15s ease',
          }}
          aria-label="Multi-select toggle"
        >
          {isMultiSelectActive ? (
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
          ) : (
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="3" width="18" height="18" rx="3"/><polyline points="9 11 12 14 22 4"/></svg>
          )}
          <span>{selectedUids.size > 0 ? `${selectedUids.size} selected` : isSelectionMode ? 'Done' : 'Select'}</span>
        </button>

        <input
          className="input"
          placeholder="Filter messages in this folder..."
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          style={{
            width: '100%',
            height: 30,
            fontSize: '0.78rem',
            padding: '0.2rem 0.6rem',
            borderRadius: 'var(--radius-sm)',
            background: 'var(--color-bg-input)',
            border: '1px solid var(--color-border)',
            color: 'var(--color-text-primary)',
          }}
          aria-label="Filter loaded messages"
        />
      </div>

      {/* Active filter banner */}
      {activeFilterLabel && (
        <div className="filter-active-banner">
          <span>Filter: <strong>{activeFilterLabel}</strong></span>
          {onClearFilter && (
            <button type="button" className="btn-ghost btn-xs" onClick={onClearFilter} title="Clear filter">
              ✕ Clear
            </button>
          )}
        </div>
      )}

      {/* Contextual Batch Ribbon */}
      <BatchToolbar
        selectedCount={selectedUids.size}
        totalCount={filtered.length}
        folders={folders}
        currentFolder={folder}
        onSelectAll={selectAll}
        onDeselectAll={clearSelection}
        onArchive={onBatchArchive ? () => handleBatch(onBatchArchive) : undefined}
        onDelete={onBatchDelete ? () => handleBatch(onBatchDelete) : (onDelete ? () => handleBatch(onDelete) : undefined)}
        onSnooze={onBatchSnooze ? (isoDate) => {
          const uids = Array.from(selectedUids);
          clearSelection();
          onBatchSnooze(uids, isoDate);
        } : undefined}
        onMove={onBatchMove ? (target) => handleBatch((uids) => onBatchMove(uids, target)) : undefined}
        onStar={onBatchStar ? () => handleBatch(onBatchStar) : undefined}
        onMarkRead={onBatchMarkRead ? () => handleBatch(onBatchMarkRead) : undefined}
        onMarkUnread={onBatchMarkUnread ? () => handleBatch(onBatchMarkUnread) : undefined}
        onSpam={onBatchSpam ? () => handleBatch(onBatchSpam) : undefined}
      />

      <div className="list-body" ref={listBodyRef} onScroll={handleScroll}>
        {loading && filtered.length === 0 ? (
          <div className="list-loading" style={{ display: 'flex', flexDirection: 'column' }}>
            {[...Array(8)].map((_, i) => (
              <div
                key={i}
                className="skeleton-row-item"
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: '0.75rem',
                  padding: '0.75rem 1rem',
                  borderBottom: '1px solid var(--color-border)',
                }}
              >
                <div className="skeleton skeleton-avatar skeleton-shimmer" style={{ width: 34, height: 34, borderRadius: '50%' }} />
                <div style={{ flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column', gap: '0.35rem' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <div className="skeleton skeleton-line skeleton-shimmer" style={{ width: '35%', height: '0.85rem' }} />
                    <div className="skeleton skeleton-line skeleton-shimmer" style={{ width: '15%', height: '0.75rem' }} />
                  </div>
                  <div className="skeleton skeleton-line skeleton-shimmer" style={{ width: '70%', height: '0.8rem' }} />
                  <div className="skeleton skeleton-line skeleton-shimmer" style={{ width: '90%', height: '0.7rem', opacity: 0.6 }} />
                </div>
              </div>
            ))}
          </div>
        ) : filtered.length === 0 ? (
          activeAccount?.provider === 'proton' && (isProtonLocked || messages.length === 0) ? (
            <div className="empty-state" style={{ padding: '3rem 1.5rem', textAlign: 'center' }}>
              <div style={{
                width: 60,
                height: 60,
                borderRadius: 18,
                background: 'linear-gradient(135deg, rgba(124, 58, 237, 0.25) 0%, rgba(109, 74, 255, 0.15) 100%)',
                border: '1px solid rgba(124, 58, 237, 0.4)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                margin: '0 auto 1.25rem',
                color: '#c084fc',
                boxShadow: '0 8px 24px rgba(124, 58, 237, 0.25)',
              }}>
                <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect width="18" height="11" x="3" y="11" rx="2" ry="2"/><path d="M7 11V7a5 5 0 0 1 10 0v4"/></svg>
              </div>
              <h3 style={{ fontSize: '1.2rem', fontWeight: 800, margin: '0 0 0.5rem', color: '#ffffff' }}>
                {isProtonLocked ? 'Proton Mailbox is Locked' : 'Decrypt & Sync Proton Mailbox'}
              </h3>
              <p className="text-secondary" style={{ fontSize: '0.875rem', maxWidth: 380, margin: '0 auto 1.5rem', lineHeight: 1.5 }}>
                Enter your Proton mailbox password to unlock browser RAM decryption and sync messages from <strong>{activeAccount?.email}</strong>.
              </p>
              <button
                type="button"
                className="btn btn-primary btn-lg"
                onClick={onUnlockProton}
                style={{ fontWeight: 700, padding: '0.65rem 1.6rem', boxShadow: '0 0 25px var(--color-primary-glow)' }}
              >
                🔓 Unlock &amp; Decrypt Inbox
              </button>
            </div>
          ) : (
            <div className="empty-state">
              <span className="empty-icon" style={{ display: 'inline-flex', color: 'var(--color-text-tertiary)' }}>
                <svg width="42" height="42" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"><polyline points="22 12 16 12 14 15 10 15 8 12 2 12"/><path d="M5.45 5.11 2 12v6a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2v-6l-3.45-6.89A2 2 0 0 0 16.76 4H7.24a2 2 0 0 0-1.79 1.11z"/></svg>
              </span>
              <p>{searchQuery ? 'No matches found' : folder === 'Outbox' ? 'All outgoing emails have been delivered. Outbox is clear.' : `No messages in ${folder}`}</p>
            </div>
          )
        ) : (
          filtered.map((msg) => {
            const isOutboxItem = msg.isOutbox || folder === 'Outbox';
            let fromName = '';
            let fromEmail = '';

            if (isOutboxItem) {
              const toObj = msg.to?.[0];
              const addr = typeof toObj === 'object' ? toObj.address : toObj;
              const name = typeof toObj === 'object' ? toObj.name : '';
              fromName = name && name !== addr ? `To: ${name}` : `To: ${addr || 'Recipient'}`;
              fromEmail = addr && name && name !== addr ? addr : '';
            } else {
              const rawName = msg.from?.name || '';
              const rawAddr = msg.from?.address || '';
              fromName = rawName || rawAddr || 'Unknown';
              fromEmail = rawAddr && rawName && rawName.toLowerCase() !== rawAddr.toLowerCase() ? rawAddr : '';
            }

            const fromTitle = fromEmail ? `${fromName} <${fromEmail}>` : fromName;

            return (
              <div
                key={msg.uid}
                className={[
                  'list-item',
                  layoutMode === 'horizontal' || layoutMode === 'list' ? 'list-item-row' : 'list-item-card',
                  msg.isRead ? '' : 'unread',
                  selectedUid === msg.uid ? 'selected' : '',
                  selectedUids.has(msg.uid) ? 'batch-selected' : '',
                  msg.status === 'failed' ? 'outbox-item-failed' : '',
                ].filter(Boolean).join(' ')}
                onClick={() => handleRowClick(msg.uid)}
                onContextMenu={(e) => handleRowContextMenu(e, msg)}
                onTouchStart={(e) => handleTouchStart(e, msg)}
                onTouchEnd={handleTouchEnd}
                onTouchMove={handleTouchMove}
                tabIndex={0}
                role="button"
                aria-label={`Email to ${fromTitle}, subject: ${msg.subject || '(no subject)'}`}
              >
                {/* Only display checkbox when multi-selection mode is active */}
                {isMultiSelectActive && (
                  <input
                    type="checkbox"
                    className="list-item-check"
                    checked={selectedUids.has(msg.uid)}
                    onChange={(e) => toggleSelect(msg.uid, e)}
                    onClick={(e) => e.stopPropagation()}
                    aria-label={`Select message`}
                    style={{
                      marginRight: '0.35rem',
                      cursor: 'pointer',
                      accentColor: 'var(--color-primary)',
                      animation: 'fadeIn 0.15s ease-out'
                    }}
                  />
                )}
                {(() => {
                  const isStarred = Boolean(msg.isStarred || msg.flags?.includes('\\Flagged') || msg.starred);
                  return (
                    <button
                      type="button"
                      className={`list-item-star ${isStarred ? 'starred' : ''}`}
                      onClick={(e) => {
                        e.stopPropagation();
                        if (onStar) onStar(msg.uid);
                      }}
                      title={isStarred ? 'Unstar message (s)' : 'Star message (s)'}
                      aria-label={isStarred ? 'Unstar message' : 'Star message'}
                    >
                      <svg
                        width="15"
                        height="15"
                        viewBox="0 0 24 24"
                        fill={isStarred ? '#f59e0b' : 'none'}
                        stroke={isStarred ? '#f59e0b' : 'currentColor'}
                        strokeWidth="2"
                        strokeLinecap="round"
                        strokeLinejoin="round"
                      >
                        <polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2" />
                      </svg>
                    </button>
                  );
                })()}

                {layoutMode === 'horizontal' || layoutMode === 'list' ? (
                  /* Horizontal Single-Line Desktop Row (Gmail/Outlook style) */
                  <>
                    <span className="list-item-from" title={fromTitle} style={{ display: 'flex', alignItems: 'center', gap: '0.35rem' }}>
                      {msg.accountBadge && (
                        <span
                          style={{
                            fontSize: '0.6875rem',
                            fontWeight: 700,
                            padding: '0.1rem 0.4rem',
                            borderRadius: 'var(--radius-pill)',
                            backgroundColor: `${msg.accountBadge.color || 'var(--color-primary)'}22`,
                            color: msg.accountBadge.color || 'var(--color-primary-light)',
                            border: `1px solid ${msg.accountBadge.color || 'var(--color-primary)'}44`,
                            flexShrink: 0,
                          }}
                        >
                          {msg.accountBadge.name}
                        </span>
                      )}
                      <span className="list-item-from-name">{fromName}</span>
                      {fromEmail && (
                        <span className="list-item-from-email text-tertiary">
                          &lt;{fromEmail}&gt;
                        </span>
                      )}
                    </span>
                    <div className="list-item-subject-wrap" style={{ display: 'flex', alignItems: 'center' }}>
                      {renderOutboxBadge(msg)}
                      <span className="list-item-subject">{msg.subject || '(no subject)'}</span>
                      {msg.snippet && (
                        <span className="list-item-snippet"> — {msg.snippet}</span>
                      )}
                    </div>
                    {msg.status === 'failed' && (
                      <button
                        type="button"
                        className="btn btn-primary btn-xs"
                        style={{ padding: '0.15rem 0.5rem', fontSize: '0.7rem', marginRight: '0.5rem', flexShrink: 0 }}
                        onClick={(e) => handleRetryOutbox(msg.outboxId, e)}
                      >
                        Retry
                      </button>
                    )}
                    {msg.hasAttachments && (
                      <span className="list-item-attachment" title="Has attachments" style={{ display: 'inline-flex', alignItems: 'center', opacity: 0.65 }}>
                        <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="m21.44 11.05-9.19 9.19a6 6 0 0 1-8.49-8.49l8.57-8.57A4 4 0 1 1 18 8.84l-8.59 8.57a2 2 0 0 1-2.83-2.83l8.49-8.48"/></svg>
                      </span>
                    )}
                    <span className="list-item-date">{formatDate(msg.date)}</span>
                  </>
                ) : (
                  /* Vertical Split Card Item */
                  <>
                    <div className="list-item-content">
                      <div className="list-item-top">
                        <span className="list-item-from" title={fromTitle} style={{ display: 'flex', alignItems: 'center', gap: '0.35rem' }}>
                          {msg.accountBadge && (
                            <span
                              style={{
                                fontSize: '0.65rem',
                                fontWeight: 700,
                                padding: '0.08rem 0.35rem',
                                borderRadius: 'var(--radius-pill)',
                                backgroundColor: `${msg.accountBadge.color || 'var(--color-primary)'}22`,
                                color: msg.accountBadge.color || 'var(--color-primary-light)',
                                border: `1px solid ${msg.accountBadge.color || 'var(--color-primary)'}44`,
                                flexShrink: 0,
                              }}
                            >
                              {msg.accountBadge.name}
                            </span>
                          )}
                          <span className="list-item-from-name">{fromName}</span>
                          {fromEmail && (
                            <span className="list-item-from-email text-tertiary">
                              &lt;{fromEmail}&gt;
                            </span>
                          )}
                        </span>
                        <span className="list-item-date">{formatDate(msg.date)}</span>
                      </div>
                      <div className="list-item-subject" style={{ display: 'flex', alignItems: 'center', flexWrap: 'wrap' }}>
                        {renderOutboxBadge(msg)}
                        <span>{msg.subject || '(no subject)'}</span>
                      </div>
                      {msg.snippet && <div className="list-item-snippet">{msg.snippet}</div>}
                      {msg.status === 'failed' && (
                        <div style={{ marginTop: '0.35rem' }}>
                          <button
                            type="button"
                            className="btn btn-primary btn-xs"
                            style={{ padding: '0.15rem 0.5rem', fontSize: '0.7rem' }}
                            onClick={(e) => handleRetryOutbox(msg.outboxId, e)}
                          >
                            Retry Delivery
                          </button>
                        </div>
                      )}
                    </div>
                    {msg.hasAttachments && (
                      <span className="list-item-attachment" title="Has attachments" style={{ display: 'inline-flex', alignItems: 'center', opacity: 0.65 }}>
                        <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="m21.44 11.05-9.19 9.19a6 6 0 0 1-8.49-8.49l8.57-8.57A4 4 0 1 1 18 8.84l-8.59 8.57a2 2 0 0 1-2.83-2.83l8.49-8.48"/></svg>
                      </span>
                    )}
                  </>
                )}
              </div>
            );
          })
        )}

        {/* Continuous Scroll Load More Indicator / End of List Banner */}
        {listMode === 'continuous' && filtered.length > 0 && (
          <div style={{ padding: '1rem 0.75rem', textAlign: 'center' }}>
            {loadingMore ? (
              <div style={{ display: 'inline-flex', alignItems: 'center', gap: '0.5rem', color: 'var(--color-primary-light)', fontSize: '0.8rem', fontWeight: 600 }}>
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" style={{ animation: 'spin 0.8s linear infinite' }}><line x1="12" y1="2" x2="12" y2="6"/><line x1="12" y1="18" x2="12" y2="22"/><line x1="4.93" y1="4.93" x2="7.76" y2="7.76"/><line x1="16.24" y1="16.24" x2="19.07" y2="19.07"/><line x1="2" y1="12" x2="6" y2="12"/><line x1="18" y1="12" x2="22" y2="12"/><line x1="4.93" y1="19.07" x2="7.76" y2="16.24"/><line x1="16.24" y1="7.76" x2="19.07" y2="4.93"/></svg>
                <span>Loading more emails...</span>
              </div>
            ) : !hasMore ? (
              <div style={{ display: 'inline-flex', alignItems: 'center', gap: '0.35rem', color: 'var(--color-text-tertiary)', fontSize: '0.75rem', background: 'rgba(255, 255, 255, 0.04)', padding: '0.35rem 0.75rem', borderRadius: 'var(--radius-pill)', border: '1px solid var(--color-border-subtle)' }}>
                <span>✓</span>
                <span>You've reached the end of {folder} ({continuousMessages.length.toLocaleString()} emails)</span>
              </div>
            ) : (
              <button
                type="button"
                className="btn btn-ghost btn-xs"
                onClick={loadMoreContinuous}
                style={{ fontSize: '0.75rem', color: 'var(--color-primary-light)', fontWeight: 600 }}
              >
                Load next 25 emails ↓
              </button>
            )}
          </div>
        )}
      </div>

      {/* Unified Pagination & List Mode Bar */}
      <div
        className="list-pagination-bar"
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          flexWrap: 'wrap',
          gap: '0.5rem',
          padding: '0.45rem 0.75rem',
          background: 'rgba(18, 14, 30, 0.85)',
          backdropFilter: 'blur(16px)',
          WebkitBackdropFilter: 'blur(16px)',
          borderTop: '1px solid rgba(255, 255, 255, 0.08)',
          fontSize: '0.78rem',
          zIndex: 10,
        }}
      >
        {/* Left: View Mode Segmented Control (Paged vs Continuous) */}
        <div
          className="list-mode-toggle"
          role="radiogroup"
          aria-label="Message list pagination mode"
          style={{
            display: 'inline-flex',
            alignItems: 'center',
            background: 'rgba(10, 10, 22, 0.75)',
            padding: '3px',
            borderRadius: '9999px',
            border: '1px solid rgba(255, 255, 255, 0.1)',
            boxShadow: 'inset 0 1px 3px rgba(0, 0, 0, 0.4)',
            gap: '2px',
          }}
        >
          <button
            type="button"
            role="radio"
            aria-checked={listMode === 'paged'}
            onClick={() => handleModeChange('paged')}
            style={{
              padding: '0.2rem 0.65rem',
              fontSize: '0.72rem',
              fontWeight: listMode === 'paged' ? 700 : 500,
              borderRadius: '9999px',
              height: '24px',
              display: 'inline-flex',
              alignItems: 'center',
              gap: '0.35rem',
              border: listMode === 'paged' ? '1px solid rgba(255, 255, 255, 0.2)' : '1px solid transparent',
              background: listMode === 'paged'
                ? 'linear-gradient(135deg, var(--color-primary, #7c3aed), #6d28d9)'
                : 'transparent',
              color: listMode === 'paged' ? '#ffffff' : 'var(--color-text-secondary, #9898b0)',
              boxShadow: listMode === 'paged'
                ? '0 2px 8px rgba(124, 58, 237, 0.45), 0 1px 2px rgba(0, 0, 0, 0.3)'
                : 'none',
              cursor: 'pointer',
              transition: 'all 0.2s cubic-bezier(0.16, 1, 0.3, 1)',
            }}
            onMouseOver={(e) => {
              if (listMode !== 'paged') {
                e.currentTarget.style.color = '#ffffff';
                e.currentTarget.style.background = 'rgba(255, 255, 255, 0.06)';
              }
            }}
            onMouseOut={(e) => {
              if (listMode !== 'paged') {
                e.currentTarget.style.color = 'var(--color-text-secondary, #9898b0)';
                e.currentTarget.style.background = 'transparent';
              }
            }}
            title="Standard pagination with direct page jump"
          >
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
              <rect x="4" y="3" width="16" height="18" rx="2" />
              <line x1="8" y1="7" x2="16" y2="7" />
              <line x1="8" y1="11" x2="16" y2="11" />
              <line x1="8" y1="15" x2="12" y2="15" />
            </svg>
            <span>Paged</span>
          </button>

          <button
            type="button"
            role="radio"
            aria-checked={listMode === 'continuous'}
            onClick={() => handleModeChange('continuous')}
            style={{
              padding: '0.2rem 0.65rem',
              fontSize: '0.72rem',
              fontWeight: listMode === 'continuous' ? 700 : 500,
              borderRadius: '9999px',
              height: '24px',
              display: 'inline-flex',
              alignItems: 'center',
              gap: '0.35rem',
              border: listMode === 'continuous' ? '1px solid rgba(255, 255, 255, 0.2)' : '1px solid transparent',
              background: listMode === 'continuous'
                ? 'linear-gradient(135deg, var(--color-primary, #7c3aed), #6d28d9)'
                : 'transparent',
              color: listMode === 'continuous' ? '#ffffff' : 'var(--color-text-secondary, #9898b0)',
              boxShadow: listMode === 'continuous'
                ? '0 2px 8px rgba(124, 58, 237, 0.45), 0 1px 2px rgba(0, 0, 0, 0.3)'
                : 'none',
              cursor: 'pointer',
              transition: 'all 0.2s cubic-bezier(0.16, 1, 0.3, 1)',
            }}
            onMouseOver={(e) => {
              if (listMode !== 'continuous') {
                e.currentTarget.style.color = '#ffffff';
                e.currentTarget.style.background = 'rgba(255, 255, 255, 0.06)';
              }
            }}
            onMouseOut={(e) => {
              if (listMode !== 'continuous') {
                e.currentTarget.style.color = 'var(--color-text-secondary, #9898b0)';
                e.currentTarget.style.background = 'transparent';
              }
            }}
            title="Continuous infinite scrolling until end of inbox"
          >
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
              <polyline points="7 8 12 13 17 8" />
              <polyline points="7 13 12 18 17 13" />
            </svg>
            <span>Continuous</span>
          </button>
        </div>

        {/* Right: Mode-Specific Controls */}
        {listMode === 'paged' ? (
          pagination && pagination.totalPages > 1 ? (
            <div style={{ display: 'inline-flex', alignItems: 'center', gap: '0.35rem' }}>
              <button
                type="button"
                className="btn btn-ghost btn-xs"
                disabled={pagination.page <= 1}
                onClick={() => onPage(1)}
                title="First Page"
                aria-label="First page"
                style={{ padding: '0.2rem 0.45rem', height: '26px', display: 'inline-flex', alignItems: 'center', justifyContent: 'center', borderRadius: '6px' }}
              >
                <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><polyline points="11 17 6 12 11 7"/><polyline points="18 17 13 12 18 7"/></svg>
              </button>
              <button
                type="button"
                className="btn btn-ghost btn-xs"
                disabled={pagination.page <= 1}
                onClick={() => onPage(pagination.page - 1)}
                title="Previous Page"
                aria-label="Previous page"
                style={{ padding: '0.2rem 0.45rem', height: '26px', display: 'inline-flex', alignItems: 'center', justifyContent: 'center', borderRadius: '6px' }}
              >
                <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><polyline points="15 18 9 12 15 6"/></svg>
              </button>

              {/* Interactive Page Input Box */}
              <form onSubmit={handlePageJumpSubmit} style={{ display: 'inline-flex', alignItems: 'center', gap: '0.3rem' }}>
                <span className="text-secondary" style={{ fontSize: '0.72rem', fontWeight: 500 }}>Page</span>
                <input
                  type="number"
                  min="1"
                  max={pagination.totalPages}
                  value={jumpPageInput}
                  onChange={(e) => setJumpPageInput(e.target.value)}
                  onBlur={handlePageJumpSubmit}
                  className="input input-sm mono"
                  style={{
                    width: '46px',
                    height: '24px',
                    padding: '0.1rem 0.2rem',
                    textAlign: 'center',
                    fontSize: '0.75rem',
                    fontWeight: 700,
                    borderRadius: 'var(--radius-sm)',
                    background: 'var(--color-bg-input)',
                    border: '1px solid var(--color-border)',
                    color: '#ffffff',
                  }}
                  title="Type page number and press Enter"
                  aria-label="Target page number"
                />
                <span className="text-secondary" style={{ fontSize: '0.72rem', fontWeight: 500 }}>
                  / {pagination.totalPages.toLocaleString()}
                </span>
              </form>

              <button
                type="button"
                className="btn btn-ghost btn-xs"
                disabled={pagination.page >= pagination.totalPages}
                onClick={() => onPage(pagination.page + 1)}
                title="Next Page"
                aria-label="Next page"
                style={{ padding: '0.2rem 0.45rem', height: '26px', display: 'inline-flex', alignItems: 'center', justifyContent: 'center', borderRadius: '6px' }}
              >
                <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><polyline points="9 18 15 12 9 6"/></svg>
              </button>
              <button
                type="button"
                className="btn btn-ghost btn-xs"
                disabled={pagination.page >= pagination.totalPages}
                onClick={() => onPage(pagination.totalPages)}
                title="Last Page"
                aria-label="Last page"
                style={{ padding: '0.2rem 0.45rem', height: '26px', display: 'inline-flex', alignItems: 'center', justifyContent: 'center', borderRadius: '6px' }}
              >
                <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><polyline points="13 17 18 12 13 7"/><polyline points="6 17 11 12 6 7"/></svg>
              </button>
            </div>
          ) : null
        ) : (
          /* Continuous Scroll Stats */
          <div style={{ display: 'inline-flex', alignItems: 'center', gap: '0.5rem', color: 'var(--color-text-secondary)', fontSize: '0.72rem' }}>
            <span>
              <strong style={{ color: '#ffffff' }}>{filtered.length.toLocaleString()}</strong> of <strong style={{ color: '#ffffff' }}>{(pagination?.total || filtered.length).toLocaleString()}</strong> emails
            </span>
            {showScrollTop && (
              <button
                type="button"
                className="btn btn-ghost btn-xs"
                onClick={scrollToTop}
                title="Scroll back to top"
                style={{
                  padding: '0.15rem 0.45rem',
                  fontSize: '0.7rem',
                  color: 'var(--color-primary-light)',
                  fontWeight: 600,
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: '0.25rem',
                  borderRadius: 'var(--radius-pill)',
                  border: '1px solid rgba(124, 58, 237, 0.3)',
                  background: 'rgba(124, 58, 237, 0.1)',
                }}
              >
                <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><line x1="12" y1="19" x2="12" y2="5"/><polyline points="5 12 12 5 19 12"/></svg>
                <span>Top</span>
              </button>
            )}
          </div>
        )}
      </div>

      {/* Context Menu / Mobile Action Sheet */}
      {contextMenu && (
        <ContextMenu
          x={contextMenu.x}
          y={contextMenu.y}
          items={contextMenu.items}
          title={contextMenu.title}
          onClose={() => setContextMenu(null)}
        />
      )}
    </section>
  );
}
