import React, { useState } from 'react';

export default function Proton2FAModal({ onSubmit, onCancel, loading }) {
  const [code, setCode] = useState('');
  const [error, setError] = useState(null);

  const handleSubmit = (e) => {
    e.preventDefault();
    if (!code || code.trim().length < 6) {
      setError('Please enter your 6-digit TOTP authentication code.');
      return;
    }
    onSubmit(code.trim());
  };

  return (
    <div style={{
      position: 'fixed',
      inset: 0,
      background: 'rgba(0,0,0,0.8)',
      backdropFilter: 'blur(10px)',
      zIndex: 99999,
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      padding: '1rem',
    }}>
      <div className="card" style={{
        maxWidth: 440,
        width: '100%',
        padding: '2rem',
        borderRadius: 'var(--radius-xl)',
        background: 'var(--color-bg-card)',
        border: '1px solid var(--color-border)',
        boxShadow: '0 20px 50px rgba(0,0,0,0.6)',
      }}>
        <div style={{ textAlign: 'center', marginBottom: '1.5rem' }}>
          <div style={{
            width: 54,
            height: 54,
            borderRadius: 16,
            background: 'rgba(124, 58, 237, 0.15)',
            border: '1px solid rgba(124, 58, 237, 0.3)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            margin: '0 auto 1rem',
            color: 'var(--color-primary-light)',
          }}>
            <svg width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect width="18" height="11" x="3" y="11" rx="2" ry="2"/><path d="M7 11V7a5 5 0 0 1 10 0v4"/></svg>
          </div>
          <h2 style={{ fontSize: '1.4rem', fontWeight: 800, margin: '0 0 0.4rem', color: '#ffffff' }}>
            Proton 2FA Verification
          </h2>
          <p className="text-secondary" style={{ fontSize: '0.875rem', margin: 0 }}>
            Enter the 6-digit verification code from your Proton authenticator app.
          </p>
        </div>

        {error && (
          <div style={{
            padding: '0.75rem 1rem',
            background: 'rgba(239, 68, 68, 0.12)',
            border: '1px solid var(--color-error)',
            borderRadius: 'var(--radius-md)',
            color: '#fca5a5',
            fontSize: '0.8125rem',
            marginBottom: '1.25rem',
          }}>
            {error}
          </div>
        )}

        <form onSubmit={handleSubmit}>
          <div className="form-group" style={{ marginBottom: '1.5rem' }}>
            <label className="form-label" style={{ textAlign: 'center', display: 'block' }}>
              6-Digit Authenticator Code
            </label>
            <input
              type="text"
              inputMode="numeric"
              pattern="[0-9]*"
              maxLength={8}
              autoFocus
              className="input mono"
              value={code}
              onChange={(e) => setCode(e.target.value.replace(/\D/g, ''))}
              placeholder="123456"
              style={{
                fontSize: '1.5rem',
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
              onClick={onCancel}
              disabled={loading}
            >
              Cancel
            </button>
            <button
              type="submit"
              className="btn btn-primary btn-full"
              disabled={loading || code.length < 6}
            >
              {loading ? 'Verifying...' : 'Verify & Decrypt'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
