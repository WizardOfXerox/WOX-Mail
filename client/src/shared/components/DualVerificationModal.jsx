import React, { useState, useEffect, useRef } from 'react';

/**
 * DualVerificationModal — Sovereign Dual-Mode Verification Component.
 * Supports manual 6-digit PIN entry AND zero-friction Inbound Email Reply.
 *
 * @param {Object} props
 * @param {string} props.sessionToken - Verification session token
 * @param {string} props.targetEmail - Recipient email address
 * @param {string} [props.title='Security Verification'] - Modal title
 * @param {string} [props.description] - Action context description
 * @param {Function} props.onVerified - Callback when verification completes: (data) => void
 * @param {Function} props.onClose - Dismiss callback
 * @param {Function} [props.onResend] - Resend challenge callback
 */
export default function DualVerificationModal({
  sessionToken,
  targetEmail,
  title = 'Security Verification',
  description,
  onVerified,
  onClose,
  onResend,
}) {
  const [digits, setDigits] = useState(['', '', '', '', '', '']);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');
  const [verifiedSuccess, setVerifiedSuccess] = useState(false);
  const [successMsg, setSuccessMsg] = useState('');
  const [resendCooldown, setResendCooldown] = useState(60);

  const inputRefs = useRef([]);
  const hasFinishedRef = useRef(false);

  // 1. Focus first input on mount
  useEffect(() => {
    if (inputRefs.current[0]) {
      inputRefs.current[0].focus();
    }
  }, []);

  // 2. Resend countdown timer
  useEffect(() => {
    if (resendCooldown <= 0) return;
    const timer = setInterval(() => {
      setResendCooldown((prev) => prev - 1);
    }, 1000);
    return () => clearInterval(timer);
  }, [resendCooldown]);

  const handleSuccessTransition = (data) => {
    if (hasFinishedRef.current) return;
    hasFinishedRef.current = true;
    setVerifiedSuccess(true);
    setSuccessMsg(data.message || 'Verification completed successfully!');
    if (window.WoxToast) {
      window.WoxToast.success(data.message || 'Verified via email reply!');
    }
    setTimeout(() => {
      if (onVerified) onVerified(data);
    }, 1200);
  };

  // 3. Real-Time WebSocket Listener (if Socket.io is loaded in window)
  useEffect(() => {
    let socket = null;
    if (typeof window !== 'undefined' && window.io) {
      try {
        socket = window.io();
        socket.on('verification_success', (data) => {
          if (data && data.sessionToken === sessionToken) {
            handleSuccessTransition(data);
          }
        });
      } catch (err) {
        console.warn('[VerificationModal] Socket.io error:', err.message);
      }
    }

    // 4. Polling Fallback (every 2s) for Inbound Email Reply ingestion
    const pollInterval = setInterval(async () => {
      if (hasFinishedRef.current) return;
      try {
        const res = await fetch(`/api/verify/status/${encodeURIComponent(sessionToken)}`);
        const json = await res.json();
        if (json.status === 'verified') {
          handleSuccessTransition({
            sessionToken,
            type: json.type,
            targetEmail: json.targetEmail,
            message: 'Email reply verified!',
            stepUpAuthToken: json.stepUpAuthToken,
          });
        }
      } catch {}
    }, 2000);

    return () => {
      if (socket) socket.disconnect();
      clearInterval(pollInterval);
    };
  }, [sessionToken]);

  const handleDigitChange = (index, value) => {
    const char = value.slice(-1);
    if (char && !/^[0-9]$/.test(char)) return;

    const newDigits = [...digits];
    newDigits[index] = char;
    setDigits(newDigits);
    setError('');

    // Advance to next input
    if (char && index < 5 && inputRefs.current[index + 1]) {
      inputRefs.current[index + 1].focus();
    }

    // Auto-submit if all 6 digits are filled
    if (char && index === 5 && newDigits.every((d) => d !== '')) {
      submitCode(newDigits.join(''));
    }
  };

  const handleKeyDown = (index, e) => {
    if (e.key === 'Backspace' && !digits[index] && index > 0 && inputRefs.current[index - 1]) {
      inputRefs.current[index - 1].focus();
    }
  };

  const handlePaste = (e) => {
    e.preventDefault();
    const pastedData = e.clipboardData.getData('text').trim();
    const match = pastedData.match(/\b([0-9]{6})\b/);
    if (match) {
      const code = match[1];
      const newDigits = code.split('');
      setDigits(newDigits);
      if (inputRefs.current[5]) inputRefs.current[5].focus();
      submitCode(code);
    }
  };

  const submitCode = async (codeStr) => {
    const code = codeStr || digits.join('');
    if (code.length !== 6) {
      setError('Please enter all 6 digits');
      return;
    }

    setSubmitting(true);
    setError('');

    try {
      const res = await fetch('/api/verify/confirm', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ sessionToken, code }),
      });
      const data = await res.json();
      if (!res.ok || data.error) {
        throw new Error(data.error || 'Verification failed');
      }
      handleSuccessTransition(data);
    } catch (err) {
      setError(err.message);
      setSubmitting(false);
    }
  };

  const handleResendClick = async () => {
    if (resendCooldown > 0) return;
    setResendCooldown(60);
    setError('');
    if (onResend) {
      onResend();
    }
  };

  return (
    <div className="compose-overlay" onClick={onClose} style={{ zIndex: 10000 }}>
      <div
        className="compose-modal card"
        style={{ maxWidth: 480, padding: 0, overflow: 'hidden' }}
        onClick={(e) => e.stopPropagation()}
      >
        {/* Modal Header */}
        <div
          className="compose-header"
          style={{
            background: 'linear-gradient(135deg, rgba(124, 58, 237, 0.15), rgba(59, 130, 246, 0.1))',
            padding: '1.25rem 1.5rem',
            borderBottom: '1px solid var(--color-border)',
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.6rem' }}>
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style="color:var(--color-primary-light)"><rect width="18" height="11" x="3" y="11" rx="2" ry="2"/><path d="M7 11V7a5 5 0 0 1 10 0v4"/></svg>
            <h3 style={{ margin: 0, fontSize: '1.05rem', fontWeight: 700 }}>{title}</h3>
          </div>
          <button type="button" className="btn btn-ghost btn-xs" onClick={onClose}>✕</button>
        </div>

        {/* Modal Content */}
        <div style={{ padding: '1.5rem', display: 'flex', flexDirection: 'column', gap: '1.25rem' }}>
          {verifiedSuccess ? (
            <div style={{ textAlign: 'center', padding: '2rem 1rem' }}>
              <div style={{ fontSize: '3.5rem', marginBottom: '0.75rem', animation: 'pulseSlow 1.5s infinite' }}>
                
              </div>
              <h3 style={{ color: 'var(--color-success)', margin: '0 0 0.5rem', fontSize: '1.25rem' }}>
                Verification Confirmed!
              </h3>
              <p className="text-secondary" style={{ margin: 0, fontSize: '0.875rem' }}>
                {successMsg}
              </p>
            </div>
          ) : (
            <>
              <div>
                <p style={{ fontSize: '0.875rem', color: 'var(--color-text-primary)', margin: '0 0 0.35rem', lineHeight: 1.5 }}>
                  {description || 'We sent a verification code to your email address:'}
                </p>
                <div className="mono text-purple" style={{ fontWeight: 700, fontSize: '0.9375rem' }}>
                  {targetEmail}
                </div>
              </div>

              {error && (
                <div
                  className="admin-badge admin-badge-red"
                  style={{ width: '100%', padding: '0.6rem 0.75rem', fontSize: '0.8125rem' }}
                >
                  {error}
                </div>
              )}

              {/* 6 Segmented PIN Inputs */}
              <div>
                <label style={{ fontSize: '0.75rem', fontWeight: 600, color: 'var(--color-text-secondary)', display: 'block', marginBottom: '0.5rem' }}>
                  Enter 6-Digit Code:
                </label>
                <div
                  className="digit-input-group"
                  onPaste={handlePaste}
                  style={{ display: 'flex', gap: '0.5rem', justifyContent: 'center' }}
                >
                  {digits.map((digit, idx) => (
                    <input
                      key={idx}
                      ref={(el) => (inputRefs.current[idx] = el)}
                      className="digit-box"
                      type="text"
                      inputMode="numeric"
                      maxLength={1}
                      value={digit}
                      onChange={(e) => handleDigitChange(idx, e.target.value)}
                      onKeyDown={(e) => handleKeyDown(idx, e)}
                      disabled={submitting}
                      style={{
                        width: '46px',
                        height: '54px',
                        fontSize: '1.5rem',
                        fontWeight: 700,
                        textAlign: 'center',
                        background: 'var(--color-bg-input)',
                        border: digit ? '2px solid var(--color-primary)' : '1px solid var(--color-border)',
                        borderRadius: 'var(--radius-md)',
                        color: 'var(--color-text-primary)',
                        outline: 'none',
                        transition: 'all 0.15s ease',
                      }}
                    />
                  ))}
                </div>
              </div>

              {/* Zero-Friction Inbound Email Reply Callout */}
              <div
                style={{
                  background: 'rgba(59, 130, 246, 0.08)',
                  border: '1px solid rgba(59, 130, 246, 0.25)',
                  borderRadius: 'var(--radius-md)',
                  padding: '0.875rem 1rem',
                  display: 'flex',
                  alignItems: 'flex-start',
                  gap: '0.75rem',
                }}
              >
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style="color:var(--color-primary-light)"><polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2"/></svg>
                <div style={{ fontSize: '0.8125rem', color: '#93c5fd', lineHeight: 1.5 }}>
                  <strong>Zero-Friction Option:</strong> Open the email in your mail app and simply <strong>hit Reply</strong> with the code. This screen will verify and unlock automatically!
                </div>
              </div>

              {/* Actions Footer */}
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: '0.5rem' }}>
                <button
                  type="button"
                  className="btn btn-ghost btn-xs"
                  onClick={handleResendClick}
                  disabled={resendCooldown > 0}
                  style={{ color: resendCooldown > 0 ? 'var(--color-text-tertiary)' : 'var(--color-primary-light)' }}
                >
                  {resendCooldown > 0 ? `Resend code in ${resendCooldown}s` : 'Resend Email'}
                </button>

                <div style={{ display: 'flex', gap: '0.5rem' }}>
                  <button type="button" className="btn btn-secondary btn-sm" onClick={onClose} disabled={submitting}>
                    Cancel
                  </button>
                  <button
                    type="button"
                    className="btn btn-primary btn-sm"
                    onClick={() => submitCode()}
                    disabled={submitting || digits.some((d) => d === '')}
                  >
                    {submitting ? 'Verifying...' : 'Confirm Code'}
                  </button>
                </div>
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
