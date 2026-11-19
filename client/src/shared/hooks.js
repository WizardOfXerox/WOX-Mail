import { useState, useEffect, useCallback, useRef } from 'react';
import { get, post, put, del } from './api.js';
import { fetchProtonMessages, fetchProtonMessage } from '../services/protonAdapter.js';
import { ProtonSessionStore } from '../services/protonSessionStore.js';
import { cacheMessages, getCachedMessages } from '../services/offlineStore.js';

/**
 * Hook to fetch data from an API endpoint.
 * @param {string} path - API path
 * @param {object} [deps] - Re-fetch when these change
 */
export function useApi(path, deps = []) {
  const [data, setData] = useState(null);
  const [dataPath, setDataPath] = useState(null);
  const [loading, setLoading] = useState(Boolean(path));
  const [error, setError] = useState(null);
  const reqIdRef = useRef(0);

  const refetch = useCallback(async () => {
    const reqId = ++reqIdRef.current;
    if (!path) {
      setData(null);
      setDataPath(null);
      setLoading(false);
      return;
    }
    setLoading(true);
    setError(null);
    try {
      const result = await get(path);
      if (reqId === reqIdRef.current) {
        setData(result);
        setDataPath(path);
      }
    } catch (err) {
      if (reqId === reqIdRef.current) {
        setError(err.message || 'Failed to fetch data');
        setData(null);
        setDataPath(path);
      }
    } finally {
      if (reqId === reqIdRef.current) {
        setLoading(false);
      }
    }
  }, [path]);

  useEffect(() => {
    setData(null);
    setDataPath(null);
    refetch();
  }, [refetch, ...deps]);

  const isStale = Boolean(path) && dataPath !== path;
  return {
    data: isStale ? null : data,
    loading: loading || isStale,
    error: isStale ? null : error,
    refetch,
  };
}

/**
 * Hook for the current authenticated user.
 */
export function useUser() {
  const { data, loading, error, refetch } = useApi('/auth/me');
  return { user: data?.user || null, loading, error, refetch };
}

/**
 * Hook for IMAP folders.
 * @param {object|null} [activeAccount]
 */
export function useFolders(activeAccount = null) {
  const accountParam = activeAccount?.id ? `?accountId=${encodeURIComponent(activeAccount.id)}` : '';
  const { data, loading, refetch } = useApi(`/mail/folders${accountParam}`, [activeAccount?.id]);
  return { folders: data?.folders || [], loading, refetch };
}

/**
 * Hook for paginated messages in a folder.
 * @param {string} folder
 * @param {number} page
 * @param {object|null} activeAccount
 */
export function useMessages(folder, page = 1, activeAccount = null) {
  const [protonData, setProtonData] = useState(null);
  const [protonLoading, setProtonLoading] = useState(false);
  const [protonError, setProtonError] = useState(null);
  const [allInboxesData, setAllInboxesData] = useState(null);
  const [allInboxesLoading, setAllInboxesLoading] = useState(false);
  const [cachedFallback, setCachedFallback] = useState(null);

  const isProton = activeAccount?.provider === 'proton';
  const isAllInboxes = folder === '__all_inboxes' || folder === 'All Inboxes';

  const normalizeImapMessage = useCallback((m, account = null) => {
    const accId = account?.id || activeAccount?.id || null;
    const msgFolder = m.folder || (isAllInboxes ? 'INBOX' : folder) || 'INBOX';
    return {
      ...m,
      folder: msgFolder,
      provider: m.provider || 'imap',
      accountId: m.accountId ?? accId,
      accountEmail: m.accountEmail || account?.email || activeAccount?.email || null,
      _key: m._key || `${m.provider || 'imap'}:${accId || 'primary'}:${msgFolder}:${m.uid}`,
      isRead: Boolean(m.isRead ?? m.seen ?? m.flags?.includes('\\Seen')),
      isStarred: Boolean(m.isStarred ?? m.starred ?? m.flags?.includes('\\Flagged')),
      hasAttachments: Boolean(m.hasAttachments ?? m.has_attachments ?? (m.attachments?.length > 0)),
    };
  }, [activeAccount?.id, activeAccount?.email, folder, isAllInboxes]);

  const refetchAllInboxes = useCallback(async () => {
    if (!isAllInboxes) return;
    setAllInboxesLoading(true);
    try {
      // 1. Fetch Primary IMAP Inbox + linked accounts list
      const [primaryRes, accountsRes] = await Promise.all([
        get('/mail/inbox?page=1&limit=50').catch(() => ({ messages: [] })),
        get('/accounts').catch(() => ({ accounts: [] })),
      ]);

      const primaryMsgs = ((primaryRes && primaryRes.messages) || []).map((m) => ({
        ...normalizeImapMessage(m, null),
        accountId: null,
        _key: `imap:primary:INBOX:${m.uid}`,
        accountBadge: { name: 'WoxMail', color: '#7c3aed' },
      }));

      // 2. Fetch linked external IMAP accounts (non-Proton)
      const linkedImap = (accountsRes?.accounts || []).filter(
        (acc) => acc && acc.provider !== 'proton' && acc.type !== 'proton' && !acc.isPrimary
      );
      const linkedResults = await Promise.all(
        linkedImap.map((acc) =>
          get(`/mail/inbox?page=1&limit=25&accountId=${encodeURIComponent(acc.id)}`)
            .then((res) =>
              (res?.messages || []).map((m) => ({
                ...normalizeImapMessage(m, acc),
                accountId: acc.id,
                accountEmail: acc.email,
                _key: `imap:${acc.id}:INBOX:${m.uid}`,
                accountBadge: { name: acc.label || acc.email, color: acc.color || '#06b6d4' },
              }))
            )
            .catch(() => [])
        )
      );

      // 3. Fetch Proton Inbox ONLY if user has an active logged-in Proton session
      let protonMsgs = [];
      try {
        if (typeof fetchProtonMessages === 'function' && ProtonSessionStore.hasActiveSession()) {
          const protonSession = ProtonSessionStore.getSession();
          const protonEmail = protonSession?.email || protonSession?.user?.Email || null;
          const protonRes = await fetchProtonMessages('INBOX', 1, 50, protonEmail).catch(() => ({ messages: [] }));
          protonMsgs = ((protonRes && protonRes.messages) || []).map((m) => ({
            ...m,
            folder: 'INBOX',
            provider: 'proton',
            accountEmail: protonEmail || m.accountEmail || '',
            _key: `proton:${protonEmail || 'proton'}:${m.uid}`,
            accountBadge: { name: 'Proton', color: '#6d4aff' },
          }));
        }
      } catch {}

      const deduped = new Map();
      for (const msg of [...primaryMsgs, ...linkedResults.flat(), ...protonMsgs]) {
        if (!deduped.has(msg._key)) deduped.set(msg._key, msg);
      }

      const combined = Array.from(deduped.values()).sort((a, b) => {
        const timeA = new Date(a.date || a.received_at || 0).getTime();
        const timeB = new Date(b.date || b.received_at || 0).getTime();
        return timeB - timeA;
      });

      setAllInboxesData({
        messages: combined,
        pagination: { page: 1, limit: 50, total: combined.length, pages: 1, totalPages: 1 },
      });
    } catch (err) {
      console.warn('Failed to aggregate all inboxes:', err);
    } finally {
      setAllInboxesLoading(false);
    }
  }, [isAllInboxes, normalizeImapMessage]);

  useEffect(() => {
    if (isAllInboxes) {
      refetchAllInboxes();
    }
  }, [isAllInboxes, refetchAllInboxes]);

  const refetchProton = useCallback(async () => {
    if (!isProton) return;
    setProtonLoading(true);
    setProtonError(null);
    try {
      const email = activeAccount?.email || localStorage.getItem('woxmail_proton_email') || '';
      const res = await fetchProtonMessages(folder, page, 25, email);
      setProtonData(res);
      if (res?.messages?.length > 0) {
        window.dispatchEvent(new CustomEvent('woxmail:proton-unlocked'));
      }
    } catch (err) {
      setProtonError(err.message);
      if (err.message && (err.message.includes('unlock') || err.message.includes('session not active') || err.message.includes('401'))) {
        window.dispatchEvent(new CustomEvent('woxmail:proton-locked'));
      }
    } finally {
      setProtonLoading(false);
    }
  }, [folder, page, isProton, activeAccount?.email]);

  useEffect(() => {
    if (isProton && !isAllInboxes) {
      refetchProton();
    }
  }, [refetchProton, isProton, isAllInboxes, folder, page]);

  const accountParam = activeAccount?.id ? `&accountId=${encodeURIComponent(activeAccount.id)}` : '';
  const isInboxFolder = folder === 'INBOX' || folder === 'Inbox' || folder === 'Inboxes';
  const isLowRes = typeof window !== 'undefined' && (
    document.documentElement.getAttribute('data-low-resource') === 'true' ||
    localStorage.getItem('woxmail_low_resource') === 'true'
  );
  const limit = isLowRes ? 15 : 25;
  const path = isAllInboxes || isProton
    ? null
    : isInboxFolder
      ? `/mail/inbox?page=${page}&limit=${limit}${accountParam}`
      : `/mail/folder/${encodeURIComponent(folder)}?page=${page}&limit=${limit}${accountParam}`;

  const { data, loading, error, refetch } = useApi(path, [folder, page, activeAccount?.id]);

  // Cache page-1 IMAP messages for offline reading and recover when offline
  const cacheFolderKey = `${activeAccount?.id || 'primary'}:${folder || 'INBOX'}`;
  useEffect(() => {
    if (isAllInboxes || isProton) return;
    if (data?.messages && page === 1) {
      setCachedFallback(null);
      cacheMessages(cacheFolderKey, data.messages).catch(() => {});
    }
  }, [data, page, cacheFolderKey, isAllInboxes, isProton]);

  useEffect(() => {
    if (isAllInboxes || isProton || data?.messages) return;
    if (error || (typeof navigator !== 'undefined' && !navigator.onLine)) {
      getCachedMessages(cacheFolderKey).then((cached) => {
        if (cached?.length > 0) setCachedFallback(cached);
      }).catch(() => {});
    }
  }, [error, data, cacheFolderKey, isAllInboxes, isProton]);

  if (isAllInboxes) {
    return {
      messages: allInboxesData?.messages || [],
      pagination: allInboxesData?.pagination || null,
      loading: allInboxesLoading,
      error: null,
      refetch: refetchAllInboxes,
    };
  }

  if (isProton) {
    return {
      messages: protonData?.messages || [],
      pagination: protonData?.pagination || null,
      loading: protonLoading,
      error: protonError,
      refetch: refetchProton,
    };
  }

  const rawPagination = data?.pagination || null;
  const normalizedPagination = rawPagination
    ? {
        ...rawPagination,
        totalPages: rawPagination.totalPages ?? rawPagination.pages ?? 1,
        pages: rawPagination.pages ?? rawPagination.totalPages ?? 1,
      }
    : null;

  const activeMessages = (data?.messages || cachedFallback || []).map((m) => normalizeImapMessage(m));

  return {
    messages: activeMessages,
    pagination: normalizedPagination,
    loading,
    error: cachedFallback && activeMessages.length > 0 ? null : error,
    isOfflineCache: Boolean(!data?.messages && cachedFallback?.length > 0),
    refetch,
  };
}

/**
 * Hook for a single message.
 * @param {number|string|null} uid
 * @param {string} folder
 * @param {object|null} activeAccount
 * @param {object|null} selectedMsgMeta - Optional metadata from list item (provider, accountId, folder)
 */
export function useMessage(uid, folder = 'INBOX', activeAccount = null, selectedMsgMeta = null) {
  const [message, setMessage] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  const msgProvider = selectedMsgMeta?.provider || activeAccount?.provider || 'imap';
  const isProton = msgProvider === 'proton';
  const effectiveAccountId = !isProton ? (selectedMsgMeta?.accountId ?? activeAccount?.id ?? null) : null;
  const rawFolder = selectedMsgMeta?.folder || folder || 'INBOX';
  const cleanFolder = (rawFolder === '__all_inboxes' || rawFolder === 'All Inboxes' || rawFolder === 'Inboxes') ? 'INBOX' : rawFolder;
  const accountParam = effectiveAccountId ? `&accountId=${encodeURIComponent(effectiveAccountId)}` : '';

  useEffect(() => {
    if (!uid) {
      setMessage(null);
      setError(null);
      setLoading(false);
      return;
    }
    setLoading(true);
    setError(null);
    let active = true;

    if (isProton) {
      const email = selectedMsgMeta?.accountEmail || activeAccount?.email || localStorage.getItem('woxmail_proton_email') || '';
      fetchProtonMessage(uid, email)
        .then((data) => {
          if (active) setMessage({ ...data, provider: 'proton', folder: cleanFolder });
        })
        .catch((err) => {
          if (active) {
            setError(err);
            setMessage(null);
          }
        })
        .finally(() => {
          if (active) setLoading(false);
        });
    } else {
      get(`/mail/message/${uid}?folder=${encodeURIComponent(cleanFolder)}${accountParam}`)
        .then((data) => {
          if (active) setMessage({ ...data, accountId: effectiveAccountId, provider: 'imap' });
        })
        .catch((err) => {
          if (active) {
            setError(err);
            setMessage(null);
          }
        })
        .finally(() => {
          if (active) setLoading(false);
        });
    }

    return () => {
      active = false;
    };
  }, [uid, cleanFolder, isProton, effectiveAccountId, selectedMsgMeta?.accountEmail]);

  return { message, loading, error };
}

/**
 * Hook for debounced values.
 */
export function useDebounce(value, delay = 300) {
  const [debounced, setDebounced] = useState(value);

  useEffect(() => {
    const timer = setTimeout(() => setDebounced(value), delay);
    return () => clearTimeout(timer);
  }, [value, delay]);

  return debounced;
}

/**
 * Hook for keyboard shortcuts with IME composition guards, contenteditable protection,
 * and cross-platform modifier normalization (Cmd/Ctrl).
 * Strictly isolates modifier keys (Ctrl/Cmd) to prevent intercepting native copy/paste/cut.
 * @param {Object<string, Function>} shortcuts - key → handler
 */
export function useKeyboard(shortcuts) {
  useEffect(() => {
    function handler(e) {
      // 1. Guard against IME composition events
      if (e.isComposing || e.keyCode === 229) return;

      // 2. Guard against typing inside form inputs, textareas, selects, or rich text contenteditable elements
      const target = e.target;
      if (
        target &&
        (['INPUT', 'TEXTAREA', 'SELECT'].includes(target.tagName) ||
          target.isContentEditable ||
          Boolean(target.closest?.('[contenteditable="true"]')) ||
          Boolean(target.closest?.('.ql-editor')) ||
          Boolean(target.closest?.('.monaco-editor')))
      ) {
        // Allow Escape inside inputs to blur or close popups
        if (e.key === 'Escape' && shortcuts['Escape']) {
          target.blur();
          shortcuts['Escape'](e);
        }
        return;
      }

      const hasCtrlOrCmd = e.ctrlKey || e.metaKey;
      const hasAlt = e.altKey;
      const hasShift = e.shiftKey;

      // 3. If any modifier key (Ctrl/Cmd/Alt) is pressed:
      if (hasCtrlOrCmd || hasAlt) {
        const keyParts = [];
        if (hasCtrlOrCmd) keyParts.push('Ctrl+');
        if (hasShift) keyParts.push('Shift+');
        if (hasAlt) keyParts.push('Alt+');
        keyParts.push(e.key);

        const combinedKey = keyParts.join('');
        const lowerCombinedKey = keyParts.slice(0, -1).join('') + e.key.toLowerCase();

        if (shortcuts[combinedKey]) {
          e.preventDefault();
          shortcuts[combinedKey](e);
        } else if (shortcuts[lowerCombinedKey]) {
          e.preventDefault();
          shortcuts[lowerCombinedKey](e);
        }
        // When a modifier is pressed, NEVER fall back to single naked character shortcuts!
        // This ensures native browser Ctrl+C (copy), Ctrl+V (paste), Ctrl+X (cut), Ctrl+A (select all) pass safely.
        return;
      }

      // 4. Naked single key shortcuts (e.g. 'c', 'j', 'k', 'r', 'a', 'f', 'e', 'd', 's', 'u', '?')
      // If user has active text selected in the document, do NOT intercept 'c' or alphanumeric keys
      const selection = window.getSelection ? window.getSelection().toString() : '';
      if (selection && selection.length > 0 && e.key.length === 1 && !['j', 'k', 'Escape'].includes(e.key)) {
        return;
      }

      if (shortcuts[e.key]) {
        e.preventDefault();
        shortcuts[e.key](e);
      } else if (shortcuts[e.key.toLowerCase()]) {
        e.preventDefault();
        shortcuts[e.key.toLowerCase()](e);
      }
    }

    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [shortcuts]);
}

/**
 * Hook for long-press gesture handling on mobile touch devices.
 * @param {Function} callback - function to invoke on long press
 * @param {number} ms - duration threshold in ms (default 500)
 */
export function useLongPress(callback, ms = 500) {
  const timerRef = useRef(null);
  const isLongPressRef = useRef(false);

  const start = useCallback((e) => {
    isLongPressRef.current = false;
    const clientX = e.touches ? e.touches[0]?.clientX : e.clientX;
    const clientY = e.touches ? e.touches[0]?.clientY : e.clientY;
    timerRef.current = setTimeout(() => {
      isLongPressRef.current = true;
      if (callback) callback({ ...e, clientX, clientY, isLongPress: true });
    }, ms);
  }, [callback, ms]);

  const clear = useCallback(() => {
    if (timerRef.current) {
      clearTimeout(timerRef.current);
      timerRef.current = null;
    }
  }, []);

  return {
    onTouchStart: start,
    onTouchEnd: clear,
    onTouchMove: clear,
    onMouseDown: start,
    onMouseUp: clear,
    onMouseLeave: clear,
    onContextMenu: (e) => {
      if (isLongPressRef.current) {
        e.preventDefault();
      }
    },
  };
}

export default { useApi, useUser, useFolders, useMessages, useMessage, useDebounce, useKeyboard, useLongPress };
