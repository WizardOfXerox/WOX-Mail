import React from 'react';

/**
 * Production-grade React Error Boundary.
 * Catches unhandled runtime exceptions in component trees,
 * prevents white-screen crashes, and provides 1-click recovery.
 */
export class ErrorBoundary extends React.Component {
  constructor(props) {
    super(props);
    this.state = { hasError: false, error: null, errorInfo: null };
  }

  static getDerivedStateFromError(error) {
    return { hasError: true, error };
  }

  componentDidCatch(error, errorInfo) {
    this.setState({ errorInfo });
    console.error('[WoxMail ErrorBoundary Caught Exception]:', error, errorInfo);
  }

  handleReload = () => {
    window.location.reload();
  };

  handleResetAndReload = () => {
    try {
      localStorage.removeItem('woxmail_layout_mode');
      localStorage.removeItem('woxmail_split_ratio');
      localStorage.removeItem('woxmail_active_account');
    } catch {}
    window.location.reload();
  };

  render() {
    if (this.state.hasError) {
      return (
        <div style={{
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          justifyContent: 'center',
          minHeight: '100vh',
          width: '100vw',
          background: 'var(--color-bg-base, #0d0d17)',
          color: 'var(--color-text-primary, #f0f0f5)',
          padding: '2rem 1.5rem',
          textAlign: 'center',
          fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif',
          boxSizing: 'border-box',
        }}>
          <div style={{
            maxWidth: '460px',
            width: '100%',
            background: 'var(--color-bg-card, #16162a)',
            border: '1px solid rgba(139, 92, 246, 0.3)',
            borderRadius: '16px',
            padding: '2rem 1.5rem',
            boxShadow: '0 16px 48px rgba(0, 0, 0, 0.6), 0 0 24px rgba(124, 58, 237, 0.15)',
          }}>
            <div style={{
              width: 56,
              height: 56,
              borderRadius: '50%',
              background: 'rgba(239, 68, 68, 0.15)',
              border: '1px solid rgba(239, 68, 68, 0.3)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              margin: '0 auto 1.25rem',
              color: '#f87171',
            }}>
              <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <circle cx="12" cy="12" r="10" />
                <line x1="12" y1="8" x2="12" y2="12" />
                <line x1="12" y1="16" x2="12.01" y2="16" />
              </svg>
            </div>

            <h2 style={{ fontSize: '1.25rem', fontWeight: 800, margin: '0 0 0.5rem', color: '#ffffff' }}>
              Interface Recovery
            </h2>
            <p style={{ fontSize: '0.875rem', color: 'var(--color-text-secondary, #9ca3af)', margin: '0 0 1.25rem', lineHeight: 1.5 }}>
              An unexpected render exception occurred. Your emails and data are completely safe.
            </p>

            {this.state.error?.message && (
              <div style={{
                background: 'rgba(0, 0, 0, 0.35)',
                border: '1px solid rgba(255, 255, 255, 0.08)',
                borderRadius: '8px',
                padding: '0.75rem',
                fontSize: '0.75rem',
                fontFamily: 'monospace',
                color: '#fca5a5',
                textAlign: 'left',
                overflow: 'auto',
                maxHeight: '100px',
                marginBottom: '1.5rem',
                wordBreak: 'break-word',
              }}>
                {this.state.error.message}
              </div>
            )}

            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.65rem' }}>
              <button
                type="button"
                onClick={this.handleReload}
                style={{
                  background: 'linear-gradient(135deg, #7c3aed 0%, #6d4aff 100%)',
                  color: '#ffffff',
                  border: 'none',
                  borderRadius: '10px',
                  padding: '0.75rem 1.25rem',
                  fontSize: '0.875rem',
                  fontWeight: 700,
                  cursor: 'pointer',
                  boxShadow: '0 0 20px rgba(124, 58, 237, 0.3)',
                }}
              >
                Reload Application
              </button>
              <button
                type="button"
                onClick={this.handleResetAndReload}
                style={{
                  background: 'transparent',
                  color: 'var(--color-text-secondary, #9ca3af)',
                  border: '1px solid rgba(255, 255, 255, 0.12)',
                  borderRadius: '10px',
                  padding: '0.65rem 1.25rem',
                  fontSize: '0.8125rem',
                  fontWeight: 600,
                  cursor: 'pointer',
                }}
              >
                Reset Layout &amp; Reload
              </button>
            </div>
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}
