import React, { useState, useEffect } from 'react';

const STORAGE_KEY = 'woxmail_email_privacy';

export const DEFAULT_PRIVACY_PREFS = {
  remoteImages: 'block_all', // 'block_all' | 'trusted_only' | 'allow_all'
  trustedSenders: [],
  allowScripts: false,
  interceptLinks: true,
};

export function getStoredPrivacyPrefs() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return DEFAULT_PRIVACY_PREFS;
    const parsed = JSON.parse(raw);
    return { ...DEFAULT_PRIVACY_PREFS, ...parsed };
  } catch {
    return DEFAULT_PRIVACY_PREFS;
  }
}

export function saveStoredPrivacyPrefs(prefs) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(prefs));
  } catch (e) {
    console.error('Failed to save privacy prefs', e);
  }
}

export default function EmailPrivacyModal({
  currentSender = '',
  isOpen,
  onClose,
  allowImagesThisEmail,
  setAllowImagesThisEmail,
  allowScriptsThisEmail,
  setAllowScriptsThisEmail,
  onPrefsChanged,
}) {
  const [prefs, setPrefs] = useState(() => getStoredPrivacyPrefs());
  const [newSenderInput, setNewSenderInput] = useState('');

  useEffect(() => {
    if (isOpen) {
      setPrefs(getStoredPrivacyPrefs());
    }
  }, [isOpen]);

  if (!isOpen) return null;

  const updatePref = (key, value) => {
    const updated = { ...prefs, [key]: value };
    setPrefs(updated);
    saveStoredPrivacyPrefs(updated);
    if (onPrefsChanged) onPrefsChanged(updated);
  };

  const addTrustedSender = (senderToAdd) => {
    const clean = (senderToAdd || '').trim().toLowerCase();
    if (!clean) return;
    if (prefs.trustedSenders.includes(clean)) return;
    const updatedSenders = [...prefs.trustedSenders, clean];
    updatePref('trustedSenders', updatedSenders);
    setNewSenderInput('');
  };

  const removeTrustedSender = (senderToRemove) => {
    const updatedSenders = prefs.trustedSenders.filter((s) => s !== senderToRemove);
    updatePref('trustedSenders', updatedSenders);
  };

  const handleResetDefaults = () => {
    if (confirm('Reset all email privacy & security preferences to safe defaults?')) {
      setPrefs(DEFAULT_PRIVACY_PREFS);
      saveStoredPrivacyPrefs(DEFAULT_PRIVACY_PREFS);
      if (setAllowImagesThisEmail) setAllowImagesThisEmail(false);
      if (setAllowScriptsThisEmail) setAllowScriptsThisEmail(false);
      if (onPrefsChanged) onPrefsChanged(DEFAULT_PRIVACY_PREFS);
    }
  };

  return (
    <div
      className="modal-backdrop"
      style={{
        position: 'fixed',
        inset: 0,
        backgroundColor: 'rgba(7, 5, 13, 0.85)',
        backdropFilter: 'blur(12px)',
        zIndex: 99999,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: '1rem',
      }}
      onClick={onClose}
    >
      <div
        className="card"
        style={{
          maxWidth: '560px',
          width: '100%',
          maxHeight: '90vh',
          overflowY: 'auto',
          padding: '1.75rem',
          background: 'var(--color-bg-card)',
          border: '1px solid var(--color-border)',
          borderRadius: 'var(--radius-xl)',
          boxShadow: 'var(--shadow-lg)',
          animation: 'fadeIn 0.2s ease',
        }}
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '1.25rem', borderBottom: '1px solid var(--color-border)', paddingBottom: '0.75rem' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.65rem' }}>
            <span style={{ fontSize: '1.4rem' }}>🛡️</span>
            <div>
              <h3 style={{ margin: 0, fontSize: '1.15rem', fontWeight: 800 }}>Email Viewer Security & Privacy</h3>
              <p style={{ margin: 0, fontSize: '0.75rem', color: 'var(--color-text-secondary)' }}>User preferences for remote images, JavaScript execution, and link shielding.</p>
            </div>
          </div>
          <button
            type="button"
            className="btn btn-ghost btn-xs"
            onClick={onClose}
            style={{ fontSize: '1.1rem', padding: '0.25rem 0.5rem', color: 'var(--color-text-secondary)' }}
          >
            ✕
          </button>
        </div>

        {/* Current Email Overrides */}
        <div style={{ marginBottom: '1.5rem', padding: '0.85rem 1rem', background: 'rgba(124, 58, 237, 0.08)', borderRadius: 'var(--radius-md)', border: '1px solid rgba(139, 92, 246, 0.25)' }}>
          <div style={{ fontSize: '0.8125rem', fontWeight: 700, marginBottom: '0.6rem', color: 'var(--color-primary-light)' }}>
            This Email Thread Controls:
          </div>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.5rem' }}>
            <button
              type="button"
              className={`btn btn-xs ${allowImagesThisEmail ? 'btn-primary' : 'btn-secondary'}`}
              onClick={() => setAllowImagesThisEmail && setAllowImagesThisEmail(!allowImagesThisEmail)}
              style={{ display: 'inline-flex', alignItems: 'center', gap: '0.35rem' }}
            >
              <span>🖼️</span>
              <span>{allowImagesThisEmail ? 'Images Allowed (Loaded)' : 'Load Remote Images'}</span>
            </button>

            <button
              type="button"
              className={`btn btn-xs ${allowScriptsThisEmail ? 'btn-danger' : 'btn-secondary'}`}
              onClick={() => {
                if (!allowScriptsThisEmail) {
                  if (confirm('Warning: Enabling JavaScript allows executable scripts in this email. Scripts run in a sandboxed realm. Continue?')) {
                    setAllowScriptsThisEmail(true);
                  }
                } else {
                  setAllowScriptsThisEmail(false);
                }
              }}
              style={{ display: 'inline-flex', alignItems: 'center', gap: '0.35rem' }}
            >
              <span>⚡</span>
              <span>{allowScriptsThisEmail ? 'JavaScript Enabled' : 'Allow JavaScript'}</span>
            </button>
          </div>
        </div>

        {/* Global Preference 1: Remote Images */}
        <div style={{ marginBottom: '1.5rem' }}>
          <label style={{ display: 'block', fontSize: '0.875rem', fontWeight: 700, marginBottom: '0.4rem' }}>
            🖼️ Remote Content & Tracking Pixels
          </label>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '0.45rem', fontSize: '0.8125rem' }}>
            <label style={{ display: 'flex', alignItems: 'flex-start', gap: '0.5rem', cursor: 'pointer' }}>
              <input
                type="radio"
                name="remoteImages"
                value="block_all"
                checked={prefs.remoteImages === 'block_all'}
                onChange={() => updatePref('remoteImages', 'block_all')}
                style={{ marginTop: '3px' }}
              />
              <div>
                <strong>Block all remote images by default (Recommended)</strong>
                <div style={{ color: 'var(--color-text-secondary)', fontSize: '0.75rem' }}>Prevents tracking pixels from recording your IP, device, and open times.</div>
              </div>
            </label>

            <label style={{ display: 'flex', alignItems: 'flex-start', gap: '0.5rem', cursor: 'pointer' }}>
              <input
                type="radio"
                name="remoteImages"
                value="trusted_only"
                checked={prefs.remoteImages === 'trusted_only'}
                onChange={() => updatePref('remoteImages', 'trusted_only')}
                style={{ marginTop: '3px' }}
              />
              <div>
                <strong>Always load images from trusted senders</strong>
                <div style={{ color: 'var(--color-text-secondary)', fontSize: '0.75rem' }}>Only loads images automatically if the sender is in your whitelist.</div>
              </div>
            </label>

            <label style={{ display: 'flex', alignItems: 'flex-start', gap: '0.5rem', cursor: 'pointer' }}>
              <input
                type="radio"
                name="remoteImages"
                value="allow_all"
                checked={prefs.remoteImages === 'allow_all'}
                onChange={() => updatePref('remoteImages', 'allow_all')}
                style={{ marginTop: '3px' }}
              />
              <div>
                <strong>Always load all remote images</strong>
                <div style={{ color: 'var(--color-text-secondary)', fontSize: '0.75rem' }}>Loads all external content automatically without asking.</div>
              </div>
            </label>
          </div>
        </div>

        {/* Global Preference 2: JavaScript & Dynamic Scripts */}
        <div style={{ marginBottom: '1.5rem' }}>
          <label style={{ display: 'block', fontSize: '0.875rem', fontWeight: 700, marginBottom: '0.4rem' }}>
            ⚡ JavaScript & Executable Content
          </label>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '0.45rem', fontSize: '0.8125rem' }}>
            <label style={{ display: 'flex', alignItems: 'flex-start', gap: '0.5rem', cursor: 'pointer' }}>
              <input
                type="checkbox"
                checked={!prefs.allowScripts}
                onChange={(e) => updatePref('allowScripts', !e.target.checked)}
                style={{ marginTop: '3px' }}
              />
              <div>
                <strong>Block all JavaScript by default (Recommended)</strong>
                <div style={{ color: 'var(--color-text-secondary)', fontSize: '0.75rem' }}>Keeps email viewing completely sandboxed from malicious scripts.</div>
              </div>
            </label>
          </div>
        </div>

        {/* Global Preference 3: Link Shield & Preview */}
        <div style={{ marginBottom: '1.5rem' }}>
          <label style={{ display: 'block', fontSize: '0.875rem', fontWeight: 700, marginBottom: '0.4rem' }}>
            🔗 Link Inspection & Phishing Shield
          </label>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '0.45rem', fontSize: '0.8125rem' }}>
            <label style={{ display: 'flex', alignItems: 'flex-start', gap: '0.5rem', cursor: 'pointer' }}>
              <input
                type="checkbox"
                checked={prefs.interceptLinks}
                onChange={(e) => updatePref('interceptLinks', e.target.checked)}
                style={{ marginTop: '3px' }}
              />
              <div>
                <strong>Inspect external links with security preview before opening</strong>
                <div style={{ color: 'var(--color-text-secondary)', fontSize: '0.75rem' }}>Displays domain verification, SSL health, and site metadata before visiting.</div>
              </div>
            </label>
          </div>
        </div>

        {/* Whitelist: Trusted Senders */}
        <div style={{ marginBottom: '1.5rem' }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '0.5rem' }}>
            <label style={{ fontSize: '0.875rem', fontWeight: 700, margin: 0 }}>
              🛡️ Trusted Senders Whitelist ({prefs.trustedSenders.length})
            </label>
            {currentSender && !prefs.trustedSenders.includes(currentSender.toLowerCase()) && (
              <button
                type="button"
                className="btn btn-ghost btn-xs"
                onClick={() => addTrustedSender(currentSender)}
                style={{ color: 'var(--color-primary-light)', fontSize: '0.75rem' }}
              >
                + Trust Current Sender
              </button>
            )}
          </div>

          <div style={{ display: 'flex', gap: '0.5rem', marginBottom: '0.75rem' }}>
            <input
              type="text"
              className="input input-sm"
              placeholder="e.g. newsletter@github.com or @company.com"
              value={newSenderInput}
              onChange={(e) => setNewSenderInput(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') {
                  e.preventDefault();
                  addTrustedSender(newSenderInput);
                }
              }}
              style={{ flex: 1, fontSize: '0.8125rem' }}
            />
            <button
              type="button"
              className="btn btn-secondary btn-sm"
              onClick={() => addTrustedSender(newSenderInput)}
            >
              Add
            </button>
          </div>

          <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.4rem', maxHeight: '120px', overflowY: 'auto', padding: '0.5rem', background: 'var(--color-bg-elevated)', borderRadius: 'var(--radius-md)', border: '1px solid var(--color-border)' }}>
            {prefs.trustedSenders.length === 0 ? (
              <span style={{ fontSize: '0.75rem', color: 'var(--color-text-tertiary)', fontStyle: 'italic' }}>
                No trusted senders added yet. Remote images from all senders will be blocked until approved.
              </span>
            ) : (
              prefs.trustedSenders.map((sender) => (
                <span
                  key={sender}
                  className="badge badge-purple"
                  style={{ display: 'inline-flex', alignItems: 'center', gap: '0.35rem', padding: '0.2rem 0.5rem', fontSize: '0.75rem' }}
                >
                  <span>{sender}</span>
                  <button
                    type="button"
                    onClick={() => removeTrustedSender(sender)}
                    style={{ background: 'none', border: 'none', color: 'inherit', cursor: 'pointer', padding: 0, fontSize: '0.8rem', lineHeight: 1 }}
                    title="Remove sender"
                  >
                    ✕
                  </button>
                </span>
              ))
            )}
          </div>
        </div>

        {/* Footer Actions */}
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', borderTop: '1px solid var(--color-border)', paddingTop: '1rem' }}>
          <button
            type="button"
            className="btn btn-ghost btn-xs text-secondary"
            onClick={handleResetDefaults}
          >
            Reset to Safe Defaults
          </button>
          <button
            type="button"
            className="btn btn-primary btn-sm"
            onClick={onClose}
          >
            Done
          </button>
        </div>
      </div>
    </div>
  );
}
