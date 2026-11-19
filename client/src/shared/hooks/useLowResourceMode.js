import { useState, useEffect, useCallback } from 'react';

const STORAGE_KEY = 'woxmail_low_resource';
const EVENT_NAME = 'woxmail:low-resource-change';

/**
 * Hook to manage Low Resource Mode (Lite / Data Saver).
 * Provides one-click toggling, persistent storage, and automatic
 * slow-connection detection (Save-Data, 2G/3G).
 */
export function useLowResourceMode() {
  const [isLowResource, setIsLowResource] = useState(() => {
    try {
      if (typeof window !== 'undefined') {
        const stored = localStorage.getItem(STORAGE_KEY);
        if (stored !== null) return stored === 'true';
        // Auto-detect slow connections or Save-Data header
        if (navigator.connection) {
          if (navigator.connection.saveData === true) return true;
          if (navigator.connection.effectiveType === 'slow-2g' || navigator.connection.effectiveType === '2g') return true;
        }
      }
    } catch {}
    return false;
  });

  const setLowResource = useCallback((enabled) => {
    try {
      localStorage.setItem(STORAGE_KEY, enabled ? 'true' : 'false');
      setIsLowResource(enabled);
      if (enabled) {
        document.documentElement.setAttribute('data-low-resource', 'true');
      } else {
        document.documentElement.removeAttribute('data-low-resource');
      }
      window.dispatchEvent(new CustomEvent(EVENT_NAME, { detail: { enabled } }));
    } catch {}
  }, []);

  const toggleLowResource = useCallback(() => {
    setLowResource(!isLowResource);
  }, [isLowResource, setLowResource]);

  useEffect(() => {
    // Initial sync with DOM attribute
    if (isLowResource) {
      document.documentElement.setAttribute('data-low-resource', 'true');
    }

    const handleStorage = (e) => {
      if (e.key === STORAGE_KEY) {
        const val = e.newValue === 'true';
        setIsLowResource(val);
        if (val) document.documentElement.setAttribute('data-low-resource', 'true');
        else document.documentElement.removeAttribute('data-low-resource');
      }
    };

    const handleCustom = (e) => {
      if (e.detail?.enabled !== undefined) {
        setIsLowResource(e.detail.enabled);
        if (e.detail.enabled) document.documentElement.setAttribute('data-low-resource', 'true');
        else document.documentElement.removeAttribute('data-low-resource');
      }
    };

    window.addEventListener('storage', handleStorage);
    window.addEventListener(EVENT_NAME, handleCustom);
    return () => {
      window.removeEventListener('storage', handleStorage);
      window.removeEventListener(EVENT_NAME, handleCustom);
    };
  }, [isLowResource]);

  return { isLowResource, setLowResource, toggleLowResource };
}

export default useLowResourceMode;
