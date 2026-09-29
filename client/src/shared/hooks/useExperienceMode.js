import { useState, useEffect, useCallback } from 'react';

export const EXPERIENCE_MODES = {
  ZEN: 'zen',
  POWER: 'power',
  BUSINESS: 'business',
};

export const MODE_METADATA = {
  [EXPERIENCE_MODES.ZEN]: {
    id: 'zen',
    label: 'Zen Minimalist',
    tagline: 'Pure, distraction-free sovereign inbox',
    badge: 'Zen',
    icon: '🍃',
  },
  [EXPERIENCE_MODES.POWER]: {
    id: 'power',
    label: 'Power Pro',
    tagline: 'High-speed triage, screener & keyboard mastery',
    badge: 'Pro',
    icon: '⚡',
  },
  [EXPERIENCE_MODES.BUSINESS]: {
    id: 'business',
    label: 'Business & Developer',
    tagline: 'Campaign broadcasts, CRM deals, REST API & automations',
    badge: 'Biz',
    icon: '🚀',
  },
};

const STORAGE_KEY = 'woxmail_experience_mode';
const EVENT_NAME = 'woxmail:mode-change';

/**
 * Hook to read and toggle the active experience mode across WoxMail.
 * Synchronizes across tabs and components via localStorage and CustomEvent.
 */
export function useExperienceMode() {
  const [mode, setModeState] = useState(() => {
    try {
      const stored = localStorage.getItem(STORAGE_KEY);
      if (stored && Object.values(EXPERIENCE_MODES).includes(stored)) {
        return stored;
      }
    } catch {}
    return EXPERIENCE_MODES.POWER; // Default to Power Pro
  });

  const setMode = useCallback((newMode) => {
    if (!Object.values(EXPERIENCE_MODES).includes(newMode)) return;
    try {
      localStorage.setItem(STORAGE_KEY, newMode);
      setModeState(newMode);
      window.dispatchEvent(new CustomEvent(EVENT_NAME, { detail: { mode: newMode } }));
    } catch {}
  }, []);

  useEffect(() => {
    const handleStorage = (e) => {
      if (e.key === STORAGE_KEY && e.newValue && Object.values(EXPERIENCE_MODES).includes(e.newValue)) {
        setModeState(e.newValue);
      }
    };

    const handleCustom = (e) => {
      if (e.detail?.mode && Object.values(EXPERIENCE_MODES).includes(e.detail.mode)) {
        setModeState(e.detail.mode);
      }
    };

    window.addEventListener('storage', handleStorage);
    window.addEventListener(EVENT_NAME, handleCustom);
    return () => {
      window.removeEventListener('storage', handleStorage);
      window.removeEventListener(EVENT_NAME, handleCustom);
    };
  }, []);

  const isFeatureVisible = useCallback((featureKey) => {
    // Zen mode keeps only essential personal mail
    if (mode === EXPERIENCE_MODES.ZEN) {
      const allowedInZen = [
        'inbox', 'sent', 'drafts', 'trash', 'starred', 'archive', 'aliases', 'search', 'compose'
      ];
      return allowedInZen.includes(featureKey.toLowerCase());
    }

    // Power mode adds screener, snooze, split views, companion dock
    if (mode === EXPERIENCE_MODES.POWER) {
      const blockedInPower = [
        'campaigns', 'drip_automations', 'segments', 'crm_deals', 'developer_keys'
      ];
      return !blockedInPower.includes(featureKey.toLowerCase());
    }

    // Business mode has everything visible
    return true;
  }, [mode]);

  return {
    mode,
    setMode,
    isFeatureVisible,
    metadata: MODE_METADATA[mode] || MODE_METADATA[EXPERIENCE_MODES.POWER],
    allModes: Object.values(MODE_METADATA),
  };
}

export default useExperienceMode;
