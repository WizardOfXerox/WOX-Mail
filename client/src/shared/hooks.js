import { useState, useEffect, useCallback, useRef } from 'react';
import { get, post, put, del } from './api.js';
import { fetchProtonMessages, fetchProtonMessage } from '../services/protonAdapter.js';
import { ProtonSessionStore } from '../services/protonSessionStore.js';

/**
 * Hook to fetch data from an API endpoint.
 * @param {string} path - API path
 * @param {object} [deps] - Re-fetch when these change
 */
export function useApi(path, deps = []) {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(Boolean(path));
  const [error, setError] = useState(null);

  const refetch = useCallback(async () => {
    if (!path) {
      setData(null);
      setLoading(false);
      return;
    }
    setLoading(true);
    setError(null);
    try {
      const result = await get(path);
      setData(result);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }, [path]);

  useEffect(() => { refetch(); }, [refetch, ...deps]);

  return { data, loading, error, refetch };
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
 */
export function useFolders() {
  const { data, loading, refetch } = useApi('/mail/folders');
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

  const isProton = activeAccount?.provider === 'proton';
  const isAllInboxes = folder === '__all_inboxes' || folder === 'All Inboxes';

  const refetchAllInboxes = useCallback(async () => {
    if (!isAllInboxes) return;
    setAllInboxesLoading(true);
    try {
      // 1. Fetch Primary / IMAP Inbox
      const primaryPromise = fetch(`/api/mail/inbox?page=1&limit=50`, { credentials: 'include' })
        .then((r) => (r.ok ? r.json() : { messages: [] }))
        .catch(() => ({ messages: [] }));

      // 2. Fetch Proton Inbox ONLY if user has an active logged-in Proton session
      let protonPromise = Promise.resolve({ messages: [] });
      try {
        if (typeof fetchProtonMessages === 'function' && ProtonSessionStore.hasActiveSession()) {
          protonPromise = fetchProtonMessages('INBOX', 1, 50).catch(() => ({ messages: [] }));
        }
      } catch {}

      const [primaryRes, protonRes] = await Promise.all([primaryPromise, protonPromise]);

      const primaryMsgs = ((primaryRes && primaryRes.messages) || []).map((m) => ({
        ...m,
        accountBadge: { name: 'WoxMail', color: '#7c3aed' },
      }));

      const protonMsgs = ((protonRes && protonRes.messages) || []).map((m) => ({
        ...m,
        accountBadge: { name: 'Proton', color: '#6d4aff' },
      }));

      const combined = [...primaryMsgs, ...protonMsgs].sort((a, b) => {
        const timeA = new Date(a.date || a.received_at || 0).getTime();
        const timeB = new Date(b.date || b.received_at || 0).getTime();
        return timeB - timeA;
      });

      setAllInboxesData({
        messages: combined,
        pagination: { page: 1, limit: 50, total: combined.length, pages: 1 },
      });
    } catch (err) {
      console.warn('Failed to aggregate all inboxes:', err);
    } finally {
      setAllInboxesLoading(false);
    }
  }, [isAllInboxes]);

  useEffect(() => {
    if (isAllInboxes) {
      refetchAllInboxes();
    }
  }, [isAllInboxes, refetchAllInboxes]);

  const refetchProton = useCallback(async () => {
    if (!isProton || !ProtonSessionStore.hasActiveSession()) return;
    setProtonLoading(true);
    setProtonError(null);
    try {
      const res = await fetchProtonMessages(folder, page, 25);
      setProtonData(res);
    } catch (err) {
      setProtonError(err.message);
      if (err.message && (err.message.includes('unlock') || err.message.includes('session not active') || err.message.includes('401'))) {
        window.dispatchEvent(new CustomEvent('woxmail:proton-locked'));
      }
    } finally {
      setProtonLoading(false);
    }
  }, [folder, page, isProton]);

  useEffect(() => {
    if (isProton && !isAllInboxes) {
      refetchProton();
    }
  }, [refetchProton, isProton, isAllInboxes, folder, page]);

  const path = isAllInboxes || isProton
    ? null
    : folder === 'INBOX'
      ? `/mail/inbox?page=${page}&limit=25`
      : `/mail/folder/${encodeURIComponent(folder)}?page=${page}&limit=25`;

  const { data, loading, error, refetch } = useApi(path, [folder, page, activeAccount]);

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

  return {
    messages: data?.messages || [],
    pagination: data?.pagination || null,
    loading,
    error,
    refetch,
  };
}

/**
 * Hook for a single message.
 * @param {number|string|null} uid
 * @param {string} folder
 * @param {object|null} activeAccount
 */
export function useMessage(uid, folder = 'INBOX', activeAccount = null) {
  const [message, setMessage] = useState(null);
  const [loading, setLoading] = useState(false);

  const isProton = activeAccount?.provider === 'proton';
  const cleanFolder = (folder === '__all_inboxes' || folder === 'All Inboxes') ? 'INBOX' : (folder || 'INBOX');

  useEffect(() => {
    if (!uid) { setMessage(null); return; }
    setLoading(true);

    if (isProton && ProtonSessionStore.hasActiveSession()) {
      fetchProtonMessage(uid)
        .then(setMessage)
        .catch(() => setMessage(null))
        .finally(() => setLoading(false));
    } else {
      get(`/mail/message/${uid}?folder=${encodeURIComponent(cleanFolder)}`)
        .then(setMessage)
        .catch(() => setMessage(null))
        .finally(() => setLoading(false));
    }
  }, [uid, cleanFolder, isProton]);

  return { message, loading };
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
 * @param {Object<string, Function>} shortcuts - key → handler
 */
export function useKeyboard(shortcuts) {
  useEffect(() => {
    function handler(e) {
      // 1. Guard against IME composition events (Chinese/Japanese/Korean text entry)
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

      const hasMod = e.ctrlKey || e.metaKey;
      const keyParts = [];
      if (hasMod) keyParts.push('Ctrl+');
      if (e.shiftKey) keyParts.push('Shift+');
      if (e.altKey) keyParts.push('Alt+');
      keyParts.push(e.key);

      const combinedKey = keyParts.join('');

      if (shortcuts[combinedKey]) {
        e.preventDefault();
        shortcuts[combinedKey](e);
      } else if (shortcuts[e.key]) {
        e.preventDefault();
        shortcuts[e.key](e);
      }
    }

    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [shortcuts]);
}

export default { useApi, useUser, useFolders, useMessages, useMessage, useDebounce, useKeyboard };
