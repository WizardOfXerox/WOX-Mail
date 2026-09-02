import React, { useState, useEffect } from 'react';

const STORAGE_KEY = 'woxmail_email_privacy';

export const DEFAULT_PRIVACY_PREFS = {
  remoteImages: 'proxy_cloak', // 'proxy_cloak' | 'neutralize_pixels' | 'block_all' | 'trusted_only' | 'allow_all'
  trustedSenders: [],
  allowScripts: false,
  interceptLinks: true,
  blockWebFonts: true,
  disarmForms: true,
  homographShield: true,
  stripMarketingRedirects: true,
  authFailurePolicy: 'warning', // 'warning' | 'quarantine' | 'block'
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
          maxWidth: '580px',
          width: '100%',
          maxHeight: '90vh',
          overflowY: 'auto',
          padding: '1.5rem',
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
            <span style={{ display: 'inline-flex', color: 'var(--color-primary-light)' }}>
              <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/></svg>
            </span>
            <div>
              <h3 style={{ margin: 0, fontSize: '1.05rem', fontWeight: 800 }}>Email Viewer Security & Privacy</h3>
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
        <div style={{ marginBottom: '1.25rem', padding: '0.85rem 1rem', background: 'rgba(124, 58, 237, 0.08)', borderRadius: 'var(--radius-md)', border: '1px solid rgba(139, 92, 246, 0.25)' }}>
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
              <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect width="18" height="18" x="3" y="3" rx="2" ry="2"/><circle cx="9" cy="9" r="2"/><path d="m21 15-3.086-3.086a2 2 0 0 0-2.828 0L6 21"/></svg>
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
              <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2"/></svg>
              <span>{allowScriptsThisEmail ? 'JavaScript Enabled' : 'Allow JavaScript'}</span>
            </button>
          </div>
        </div>

        {/* 1. Remote Content & Tracking Pixels */}
        <div style={{ marginBottom: '1.25rem' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', marginBottom: '0.4rem' }}>
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect width="18" height="18" x="3" y="3" rx="2" ry="2"/><circle cx="9" cy="9" r="2"/><path d="m21 15-3.086-3.086a2 2 0 0 0-2.828 0L6 21"/></svg>
            <strong style={{ fontSize: '0.875rem' }}>Remote Content & Tracking Pixels</strong>
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '0.45rem', fontSize: '0.8125rem' }}>
            <label style={{ display: 'flex', alignItems: 'flex-start', gap: '0.5rem', cursor: 'pointer' }}>
              <input
                type="radio"
                name="remoteImages"
                value="proxy_cloak"
                checked={prefs.remoteImages === 'proxy_cloak'}
                onChange={() => updatePref('remoteImages', 'proxy_cloak')}
                style={{ marginTop: '3px' }}
              />
              <div>
                <strong>Cloak IP via Encrypted Image Proxy (Recommended)</strong>
                <div style={{ color: 'var(--color-text-secondary)', fontSize: '0.72rem' }}>Routes images through WoxMail backend cache. Sender never sees your real IP or location.</div>
              </div>
            </label>

            <label style={{ display: 'flex', alignItems: 'flex-start', gap: '0.5rem', cursor: 'pointer' }}>
              <input
                type="radio"
                name="remoteImages"
                value="neutralize_pixels"
                checked={prefs.remoteImages === 'neutralize_pixels'}
                onChange={() => updatePref('remoteImages', 'neutralize_pixels')}
                style={{ marginTop: '3px' }}
              />
              <div>
                <strong>Neutralize Spy-Pixels Only (Preserve layout)</strong>
                <div style={{ color: 'var(--color-text-secondary)', fontSize: '0.72rem' }}>Disarms invisible 1x1 marketing trackers while rendering newsletter images safely.</div>
              </div>
            </label>

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
                <strong>Block all remote images by default</strong>
                <div style={{ color: 'var(--color-text-secondary)', fontSize: '0.72rem' }}>Prevents all external images from loading until explicitly allowed.</div>
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
                <div style={{ color: 'var(--color-text-secondary)', fontSize: '0.72rem' }}>Only loads images automatically if the sender is in your whitelist.</div>
              </div>
            </label>
          </div>

          <label style={{ display: 'inline-flex', alignItems: 'center', gap: '0.5rem', marginTop: '0.6rem', fontSize: '0.78rem', cursor: 'pointer' }}>
            <input
              type="checkbox"
              checked={Boolean(prefs.blockWebFonts)}
              onChange={(e) => updatePref('blockWebFonts', e.target.checked)}
            />
            <span>Block remote web fonts (@font-face CDN tracking)</span>
          </label>
        </div>

        {/* 2. JavaScript & Code Sandboxing */}
        <div style={{ marginBottom: '1.25rem' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', marginBottom: '0.4rem' }}>
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2"/></svg>
            <strong style={{ fontSize: '0.875rem' }}>JavaScript & Executable Content</strong>
          </div>
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
                <div style={{ color: 'var(--color-text-secondary)', fontSize: '0.72rem' }}>Keeps email viewing completely sandboxed from malicious scripts.</div>
              </div>
            </label>

            <label style={{ display: 'flex', alignItems: 'flex-start', gap: '0.5rem', cursor: 'pointer' }}>
              <input
                type="checkbox"
                checked={Boolean(prefs.disarmForms)}
                onChange={(e) => updatePref('disarmForms', e.target.checked)}
                style={{ marginTop: '3px' }}
              />
              <div>
                <strong>Disarm embedded HTML forms & password inputs (Anti-Phishing)</strong>
                <div style={{ color: 'var(--color-text-secondary)', fontSize: '0.72rem' }}>Neutralizes credential harvesting forms embedded in incoming emails.</div>
              </div>
            </label>
          </div>
        </div>

        {/* 3. Link Inspection & Phishing Shield */}
        <div style={{ marginBottom: '1.25rem' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', marginBottom: '0.4rem' }}>
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71"/><path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71"/></svg>
            <strong style={{ fontSize: '0.875rem' }}>Link Inspection & Phishing Shield</strong>
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '0.45rem', fontSize: '0.8125rem' }}>
            <label style={{ display: 'flex', alignItems: 'flex-start', gap: '0.5rem', cursor: 'pointer' }}>
              <input
                type="checkbox"
                checked={Boolean(prefs.interceptLinks)}
                onChange={(e) => updatePref('interceptLinks', e.target.checked)}
                style={{ marginTop: '3px' }}
              />
              <div>
                <strong>Inspect external links with security preview before opening</strong>
                <div style={{ color: 'var(--color-text-secondary)', fontSize: '0.72rem' }}>Displays domain verification, SSL health, and site metadata before visiting.</div>
              </div>
            </label>

            <label style={{ display: 'flex', alignItems: 'flex-start', gap: '0.5rem', cursor: 'pointer' }}>
              <input
                type="checkbox"
                checked={Boolean(prefs.homographShield)}
                onChange={(e) => updatePref('homographShield', e.target.checked)}
                style={{ marginTop: '3px' }}
              />
              <div>
                <strong>Detect Homograph / Punycode domain spoofing attacks</strong>
                <div style={{ color: 'var(--color-text-secondary)', fontSize: '0.72rem' }}>Alerts on deceptive Cyrillic/Unicode characters disguised as legitimate domains.</div>
              </div>
            </label>

            <label style={{ display: 'flex', alignItems: 'flex-start', gap: '0.5rem', cursor: 'pointer' }}>
              <input
                type="checkbox"
                checked={Boolean(prefs.stripMarketingRedirects)}
                onChange={(e) => updatePref('stripMarketingRedirects', e.target.checked)}
                style={{ marginTop: '3px' }}
              />
              <div>
                <strong>Strip marketing click-tracking redirect wrappers</strong>
                <div style={{ color: 'var(--color-text-secondary)', fontSize: '0.72rem' }}>Unwraps tracking links directly to the clean destination URL.</div>
              </div>
            </label>
          </div>
        </div>

        {/* 4. Sender Authentication Policy (SPF/DKIM/DMARC Failure Action) */}
        <div style={{ marginBottom: '1.25rem' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', marginBottom: '0.4rem' }}>
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/></svg>
            <strong style={{ fontSize: '0.875rem' }}>Sender Authentication Policy (SPF / DKIM / DMARC)</strong>
          </div>
          <p style={{ color: 'var(--color-text-secondary)', fontSize: '0.75rem', margin: '0 0 0.5rem 0' }}>
            Choose how WoxMail protects you when an incoming email fails sender cryptographic authentication checks.
          </p>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(140px, 1fr))', gap: '0.5rem' }}>
            <label
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: '0.5rem',
                padding: '0.5rem 0.75rem',
                borderRadius: 'var(--radius-md)',
                border: `1px solid ${prefs.authFailurePolicy === 'warning' ? 'var(--color-primary)' : 'var(--color-border)'}`,
                background: prefs.authFailurePolicy === 'warning' ? 'var(--color-bg-hover)' : 'transparent',
                cursor: 'pointer',
                fontSize: '0.8125rem',
              }}
            >
              <input
                type="radio"
                name="authFailurePolicy"
                value="warning"
                checked={prefs.authFailurePolicy === 'warning'}
                onChange={() => updatePref('authFailurePolicy', 'warning')}
              />
              <div>
                <strong>Warning Banner</strong>
                <div style={{ fontSize: '0.7rem', color: 'var(--color-text-secondary)' }}>Show alert header</div>
              </div>
            </label>

            <label
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: '0.5rem',
                padding: '0.5rem 0.75rem',
                borderRadius: 'var(--radius-md)',
                border: `1px solid ${prefs.authFailurePolicy === 'blur' ? 'var(--color-primary)' : 'var(--color-border)'}`,
                background: prefs.authFailurePolicy === 'blur' ? 'var(--color-bg-hover)' : 'transparent',
                cursor: 'pointer',
                fontSize: '0.8125rem',
              }}
            >
              <input
                type="radio"
                name="authFailurePolicy"
                value="blur"
                checked={prefs.authFailurePolicy === 'blur'}
                onChange={() => updatePref('authFailurePolicy', 'blur')}
              />
              <div>
                <strong>Blur Body</strong>
                <div style={{ fontSize: '0.7rem', color: 'var(--color-text-secondary)' }}>Click to unblur</div>
              </div>
            </label>

            <label
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: '0.5rem',
                padding: '0.5rem 0.75rem',
                borderRadius: 'var(--radius-md)',
                border: `1px solid ${prefs.authFailurePolicy === 'quarantine' ? 'var(--color-primary)' : 'var(--color-border)'}`,
                background: prefs.authFailurePolicy === 'quarantine' ? 'var(--color-bg-hover)' : 'transparent',
                cursor: 'pointer',
                fontSize: '0.8125rem',
              }}
            >
              <input
                type="radio"
                name="authFailurePolicy"
                value="quarantine"
                checked={prefs.authFailurePolicy === 'quarantine'}
                onChange={() => updatePref('authFailurePolicy', 'quarantine')}
              />
              <div>
                <strong>Quarantine</strong>
                <div style={{ fontSize: '0.7rem', color: 'var(--color-text-secondary)' }}>Isolate in Screener</div>
              </div>
            </label>
          </div>
        </div>

        {/* 5. Trusted Senders Whitelist */}
        <div style={{ marginBottom: '1.25rem' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.4rem' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/></svg>
              <strong style={{ fontSize: '0.875rem' }}>Trusted Senders Whitelist ({prefs.trustedSenders.length})</strong>
            </div>
            {currentSender && (
              <button
                type="button"
                className="btn btn-ghost btn-xs"
                onClick={() => addTrustedSender(currentSender)}
                style={{ fontSize: '0.72rem', color: 'var(--color-primary-light)' }}
              >
                + Trust Current Sender
              </button>
            )}
          </div>

          <div style={{ display: 'flex', gap: '0.4rem', marginBottom: '0.5rem' }}>
            <input
              type="text"
              className="input"
              placeholder="e.g. newsletter@github.com or @company.com"
              value={newSenderInput}
              onChange={(e) => setNewSenderInput(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') {
                  e.preventDefault();
                  addTrustedSender(newSenderInput);
                }
              }}
              style={{ fontSize: '0.78rem', flex: 1 }}
            />
            <button
              type="button"
              className="btn btn-secondary btn-sm"
              onClick={() => addTrustedSender(newSenderInput)}
            >
              Add
            </button>
          </div>

          <div style={{ maxHeight: '120px', overflowY: 'auto', background: 'var(--color-bg-input)', borderRadius: 'var(--radius-md)', padding: '0.4rem', border: '1px solid var(--color-border)' }}>
            {prefs.trustedSenders.length === 0 ? (
              <div style={{ fontSize: '0.72rem', color: 'var(--color-text-tertiary)', textAlign: 'center', padding: '0.5rem 0' }}>
                No trusted senders added yet. Remote images from all senders will be blocked until approved.
              </div>
            ) : (
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.35rem' }}>
                {prefs.trustedSenders.map((sender) => (
                  <span
                    key={sender}
                    className="badge badge-purple"
                    style={{ fontSize: '0.72rem', padding: '0.2rem 0.5rem', display: 'inline-flex', alignItems: 'center', gap: '0.35rem' }}
                  >
                    <span>{sender}</span>
                    <button
                      type="button"
                      onClick={() => removeTrustedSender(sender)}
                      style={{ background: 'transparent', border: 'none', color: 'inherit', cursor: 'pointer', padding: 0 }}
                    >
                      ✕
                    </button>
                  </span>
                ))}
              </div>
            )}
          </div>
        </div>

        {/* Footer Actions */}
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', paddingTop: '0.75rem', borderTop: '1px solid var(--color-border)', flexWrap: 'wrap', gap: '0.5rem' }}>
          <button
            type="button"
            className="btn btn-ghost btn-xs"
            onClick={handleResetDefaults}
            style={{ color: 'var(--color-text-tertiary)', fontSize: '0.75rem' }}
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
