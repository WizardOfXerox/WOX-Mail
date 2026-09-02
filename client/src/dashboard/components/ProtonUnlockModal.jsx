import React, { useState } from 'react';
import { protonClient } from '../../services/protonAPI.js';

export default function ProtonUnlockModal({ email, onUnlocked, onClose }) {
  const [authMode, setAuthMode] = useState('password'); // 'password' | 'token'
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [sessionToken, setSessionToken] = useState('');
  const [sessionUid, setSessionUid] = useState('');
  const [totpCode, setTotpCode] = useState('');
  const [requires2FA, setRequires2FA] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  const handleLogin = async (e) => {
    e.preventDefault();
    if (!password) {
      setError('Please enter your Proton mailbox password.');
      return;
    }

    setLoading(true);
    setError(null);

    try {
      if (authMode === 'token') {
        let uid = sessionUid.trim();
        let token = sessionToken.trim();

        // Check if user pasted a JSON blob
        if (token.startsWith('{') && token.endsWith('}')) {
          try {
            const parsed = JSON.parse(token);
            token = parsed.AccessToken || parsed.access_token || parsed.token || token;
            uid = parsed.UID || parsed.uid || uid;
          } catch {}
        }

        if (!token) {
          setError('Please provide a valid Proton Access Token.');
          setLoading(false);
          return;
        }

        await protonClient.loginWithSession(uid, token, password);
        onUnlocked();
        return;
      }

      // Standard SRP Password login
      const res = await protonClient.login(email, password);
      if (res.requires2FA) {
        setRequires2FA(true);
        setLoading(false);
        return;
      }

      onUnlocked();
    } catch (err) {
      setError(err.message || 'Failed to authenticate with Proton. Please check your credentials.');
    } finally {
      setLoading(false);
    }
  };

  const handle2FASubmit = async (e) => {
    e.preventDefault();
    if (!totpCode || totpCode.trim().length < 6) {
      setError('Please enter your 6-digit authenticator code.');
      return;
    }

    setLoading(true);
    setError(null);

    try {
      await protonClient.submit2FA(totpCode.trim(), password);
      onUnlocked();
    } catch (err) {
      setError(err.message || 'Invalid 2FA code. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div style={{
      position: 'fixed',
      inset: 0,
      background: 'rgba(10, 10, 20, 0.85)',
      backdropFilter: 'blur(12px)',
      zIndex: 99999,
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      padding: '1.5rem',
      animation: 'fadeIn 0.2s ease',
    }}>
      <div className="card" style={{
        maxWidth: 480,
        width: '100%',
        padding: '2.5rem',
        borderRadius: 'var(--radius-xl)',
        background: 'var(--color-bg-card)',
        border: '1px solid rgba(124, 58, 237, 0.35)',
        boxShadow: '0 25px 60px rgba(0,0,0,0.6), 0 0 30px rgba(124, 58, 237, 0.15)',
        position: 'relative',
      }}>
        {onClose && (
          <button
            type="button"
            onClick={onClose}
            style={{
              position: 'absolute',
              top: '1.25rem',
              right: '1.25rem',
              background: 'transparent',
              border: 'none',
              color: 'var(--color-text-tertiary)',
              cursor: 'pointer',
              padding: '0.25rem',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
            }}
            aria-label="Close"
          >
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
          </button>
        )}

        <div style={{ textAlign: 'center', marginBottom: '1.5rem' }}>
          <div style={{
            width: 56,
            height: 56,
            borderRadius: 16,
            background: 'linear-gradient(135deg, rgba(124, 58, 237, 0.25) 0%, rgba(109, 74, 255, 0.15) 100%)',
            border: '1px solid rgba(124, 58, 237, 0.4)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            margin: '0 auto 1rem',
            color: '#c084fc',
            boxShadow: '0 8px 20px rgba(124, 58, 237, 0.25)',
          }}>
            <svg width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect width="18" height="11" x="3" y="11" rx="2" ry="2"/><path d="M7 11V7a5 5 0 0 1 10 0v4"/></svg>
          </div>
          <h2 style={{ fontSize: '1.4rem', fontWeight: 800, margin: '0 0 0.4rem', color: '#ffffff', letterSpacing: '-0.02em' }}>
            {requires2FA ? 'Proton 2FA Verification' : 'Unlock Proton Mailbox'}
          </h2>
          <p className="text-secondary" style={{ fontSize: '0.8125rem', margin: '0 auto', maxWidth: 380, lineHeight: 1.45 }}>
            {requires2FA
              ? 'Enter the 6-digit TOTP code from your authenticator app to complete login.'
              : <span>Decrypting <strong>{email}</strong> via client-side OpenPGP. Enter your Proton credentials to unlock your inbox.</span>}
          </p>
        </div>

        {/* Tab Toggle: Password SRP vs Session Token (Sentinel Bypass) */}
        {!requires2FA && (
          <div style={{
            display: 'flex',
            background: 'rgba(0,0,0,0.25)',
            padding: '4px',
            borderRadius: 'var(--radius-pill)',
            border: '1px solid var(--color-border)',
            marginBottom: '1.25rem',
            gap: '4px',
          }}>
            <button
              type="button"
              onClick={() => { setAuthMode('password'); setError(null); }}
              style={{
                flex: 1,
                padding: '0.45rem 0.75rem',
                border: 'none',
                borderRadius: 'var(--radius-pill)',
                fontSize: '0.75rem',
                fontWeight: 600,
                cursor: 'pointer',
                background: authMode === 'password' ? 'var(--color-primary)' : 'transparent',
                color: authMode === 'password' ? '#ffffff' : 'var(--color-text-secondary)',
                transition: 'all 0.15s ease',
              }}
            >
              🔑 Password (Direct API)
            </button>
            <button
              type="button"
              onClick={() => { setAuthMode('token'); setError(null); }}
              style={{
                flex: 1,
                padding: '0.45rem 0.75rem',
                border: 'none',
                borderRadius: 'var(--radius-pill)',
                fontSize: '0.75rem',
                fontWeight: 600,
                cursor: 'pointer',
                background: authMode === 'token' ? 'var(--color-primary)' : 'transparent',
                color: authMode === 'token' ? '#ffffff' : 'var(--color-text-secondary)',
                transition: 'all 0.15s ease',
              }}
            >
              ⚡ Session Token (Sentinel Bypass)
            </button>
          </div>
        )}

        {error && (
          <div style={{
            padding: '0.85rem 1.15rem',
            background: 'rgba(239, 68, 68, 0.12)',
            border: '1px solid var(--color-error)',
            borderRadius: 'var(--radius-md)',
            color: '#fca5a5',
            fontSize: '0.8125rem',
            marginBottom: '1.25rem',
            lineHeight: 1.4,
          }}>
            ⚠️ {error}
            {(error.includes('mail.proton.me') || error.includes('verification') || error.includes('cooldown') || error.includes('unusual activity') || error.includes('Forbidden')) && (
              <div style={{ marginTop: '0.5rem', fontSize: '0.75rem', lineHeight: 1.4 }}>
                <div>If Proton Sentinel is blocking direct password login:</div>
                <div style={{ marginTop: '0.25rem' }}>
                  1. Switch to the <strong>"⚡ Session Token"</strong> tab above.
                </div>
                <div style={{ marginTop: '0.25rem' }}>
                  2. Or <a href="https://mail.proton.me" target="_blank" rel="noopener noreferrer" style={{ color: '#a78bfa', textDecoration: 'underline', fontWeight: 600 }}>open mail.proton.me in a new tab ↗</a> to clear the challenge.
                </div>
              </div>
            )}
          </div>
        )}

        {!requires2FA ? (
          <form onSubmit={handleLogin} style={{ display: 'flex', flexDirection: 'column', gap: '1.15rem' }}>
            {authMode === 'token' && (
              <>
                <div className="form-group">
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.35rem' }}>
                    <label className="form-label" style={{ fontSize: '0.8125rem', fontWeight: 600, color: 'var(--color-text-secondary)', margin: 0 }}>
                      Proton Access Token or Session JSON
                    </label>
                  </div>
                  <input
                    type="text"
                    className="input mono"
                    value={sessionToken}
                    onChange={(e) => setSessionToken(e.target.value)}
                    placeholder="Paste AccessToken or session JSON from mail.proton.me"
                    autoFocus
                    required
                    style={{ fontSize: '0.8125rem' }}
                  />
                  <div style={{ fontSize: '0.72rem', color: 'var(--color-text-tertiary)', marginTop: '0.35rem', lineHeight: 1.4 }}>
                    💡 <strong>Quick Copy:</strong> On <a href="https://mail.proton.me" target="_blank" rel="noreferrer" style={{ color: 'var(--color-primary-light)' }}>mail.proton.me</a>, open DevTools (F12) → Console → type: <code style={{ background: 'rgba(255,255,255,0.08)', padding: '1px 4px', borderRadius: 4 }}>copy(sessionStorage.getItem('proton:oauth') || localStorage.getItem('AUTH_TOKEN'))</code> and paste here.
                  </div>
                </div>

                <div className="form-group">
                  <label className="form-label" style={{ fontSize: '0.8125rem', fontWeight: 600, color: 'var(--color-text-secondary)' }}>
                    Proton UID (Optional if pasted JSON)
                  </label>
                  <input
                    type="text"
                    className="input mono"
                    value={sessionUid}
                    onChange={(e) => setSessionUid(e.target.value)}
                    placeholder="e.g. 5f5fe62a2616..."
                    style={{ fontSize: '0.8125rem' }}
                  />
                </div>
              </>
            )}

            <div className="form-group">
              <label className="form-label" style={{ fontSize: '0.8125rem', fontWeight: 600, color: 'var(--color-text-secondary)' }}>
                {authMode === 'token' ? 'Proton Mailbox Password (to decrypt PGP keys)' : 'Proton Account Password'}
              </label>
              <div className="input-wrapper" style={{ position: 'relative' }}>
                <input
                  type={showPassword ? 'text' : 'password'}
                  className="input"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="••••••••••••"
                  autoFocus={authMode === 'password'}
                  required
                  style={{ paddingRight: '2.75rem' }}
                />
                <button
                  type="button"
                  onClick={() => setShowPassword(!showPassword)}
                  style={{
                    position: 'absolute',
                    right: '0.75rem',
                    top: '50%',
                    transform: 'translateY(-50%)',
                    background: 'transparent',
                    border: 'none',
                    color: 'var(--color-text-tertiary)',
                    cursor: 'pointer',
                    display: 'flex',
                    alignItems: 'center',
                    padding: '0.25rem',
                  }}
                  aria-label="Toggle password visibility"
                >
                  {showPassword ? (
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19m-6.72-1.07a3 3 0 1 1-4.24-4.24"/><line x1="1" y1="1" x2="23" y2="23"/></svg>
                  ) : (
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/><circle cx="12" cy="12" r="3"/></svg>
                  )}
                </button>
              </div>
            </div>

            <button
              type="submit"
              className="btn btn-primary btn-full btn-lg"
              disabled={loading || !password}
              style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '0.5rem', fontWeight: 600 }}
            >
              {loading ? (
                <span>Unlocking &amp; Decrypting...</span>
              ) : (
                <>
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><polyline points="20 6 9 17 4 12"/></svg>
                  <span>Decrypt &amp; Sync Mailbox</span>
                </>
              )}
            </button>

            <div style={{ textAlign: 'center', fontSize: '0.72rem', color: 'var(--color-text-tertiary)' }}>
              🔒 Zero Knowledge: Keys are decrypted strictly in your browser RAM and never sent to any server.
            </div>
          </form>
        ) : (
          <form onSubmit={handle2FASubmit} style={{ display: 'flex', flexDirection: 'column', gap: '1.25rem' }}>
            <div className="form-group">
              <label className="form-label" style={{ textAlign: 'center', display: 'block', fontSize: '0.8125rem' }}>
                6-Digit Authenticator Token
              </label>
              <input
                type="text"
                inputMode="numeric"
                pattern="[0-9]*"
                maxLength={8}
                autoFocus
                className="input mono"
                value={totpCode}
                onChange={(e) => setTotpCode(e.target.value.replace(/\\D/g, ''))}
                placeholder="123456"
                style={{
                  fontSize: '1.6rem',
                  textAlign: 'center',
                  letterSpacing: '0.35em',
                  padding: '0.75rem',
                }}
              />
            </div>

            <div style={{ display: 'flex', gap: '0.75rem' }}>
              <button
                type="button"
                className="btn btn-secondary btn-full"
                onClick={() => setRequires2FA(false)}
                disabled={loading}
              >
                Back
              </button>
              <button
                type="submit"
                className="btn btn-primary btn-full"
                disabled={loading || totpCode.length < 6}
              >
                {loading ? 'Verifying...' : 'Verify & Decrypt'}
              </button>
            </div>
          </form>
        )}
      </div>
    </div>
  );
}
