import React, { useState, useEffect } from 'react';
import { get, put } from '../../shared/api.js';

export default function AccountSwitcherModal({ activeAccount, onSelectAccount, user }) {
  const [isOpen, setIsOpen] = useState(false);
  const [accounts, setAccounts] = useState([]);
  const [savedDeviceAccounts, setSavedDeviceAccounts] = useState([]);
  const [loading, setLoading] = useState(false);

  const loadAccounts = async () => {
    try {
      setLoading(true);
      const res = await get('/api/accounts');
      setAccounts(res.accounts || []);
    } catch (err) {
      console.warn('Failed to load accounts for switcher:', err.message);
    } finally {
      setLoading(false);
    }

    if (typeof window !== 'undefined' && window.WoxAccountManager) {
      const devAccounts = window.WoxAccountManager.getAccounts() || [];
      // Filter out current user
      const otherSaved = devAccounts.filter(a => a.email && a.email.toLowerCase() !== (user?.email || '').toLowerCase());
      setSavedDeviceAccounts(otherSaved);
    }
  };

  useEffect(() => {
    if (isOpen) {
      loadAccounts();
    }
  }, [isOpen]);

  const handleSwitch = (acc) => {
    onSelectAccount(acc);
    setIsOpen(false);
  };

  const handleSwitchProfile = (savedAcc) => {
    if (typeof window !== 'undefined' && window.WoxAccountManager) {
      window.WoxAccountManager.switchToAccount(savedAcc.email);
    } else {
      window.location.href = `/login?email=${encodeURIComponent(savedAcc.email)}`;
    }
  };

  return (
    <div style={{ position: 'relative' }}>
      <button
        type="button"
        className="btn btn-secondary btn-sm"
        onClick={() => setIsOpen(!isOpen)}
        style={{
          display: 'inline-flex',
          alignItems: 'center',
          gap: '0.5rem',
          padding: '0.4rem 0.75rem',
          borderRadius: 'var(--radius-pill)',
          background: 'var(--color-bg-elevated)',
          border: '1px solid var(--color-border)'
        }}
      >
        <span
          style={{
            width: 10,
            height: 10,
            borderRadius: '50%',
            backgroundColor: activeAccount ? (activeAccount.color || 'var(--color-primary)') : 'var(--color-primary)',
            display: 'inline-block'
          }}
        />
        <span style={{ fontSize: '0.8125rem', fontWeight: 600, maxWidth: 160, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
          {activeAccount ? activeAccount.email : (user?.email || 'Sovereign')}
        </span>
        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <polyline points="6 9 12 15 18 9" />
        </svg>
      </button>

      {isOpen && (
        <div
          style={{
            position: 'absolute',
            top: 'calc(100% + 8px)',
            left: 0,
            zIndex: 9999,
            minWidth: 280,
            background: 'var(--color-bg-elevated)',
            border: '1px solid var(--color-border)',
            borderRadius: 'var(--radius-md)',
            boxShadow: 'var(--shadow-lg)',
            padding: '0.5rem',
            animation: 'slideIn 0.15s ease'
          }}
        >
          <div style={{ padding: '0.4rem 0.6rem', fontSize: '0.6875rem', fontWeight: 700, color: 'var(--color-text-tertiary)', textTransform: 'uppercase' }}>
            Active Account
          </div>

          {/* Primary Sovereign Account */}
          <div
            onClick={() => handleSwitch(null)}
            style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              padding: '0.5rem 0.75rem',
              borderRadius: 'var(--radius-sm)',
              cursor: 'pointer',
              background: !activeAccount ? 'rgba(124, 58, 237, 0.15)' : 'transparent'
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
              <span style={{ display: 'inline-flex', color: 'var(--color-primary-light)' }}>
                <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/></svg>
              </span>
              <div>
                <div style={{ fontWeight: 600, fontSize: '0.8125rem' }}>{user?.email || 'Sovereign Mail'}</div>
                <div className="text-secondary" style={{ fontSize: '0.6875rem' }}>Primary Sovereign Inbox</div>
              </div>
            </div>
            {!activeAccount && (
              <span style={{ color: 'var(--color-primary-light)', display: 'inline-flex' }}>
                <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><polyline points="20 6 9 17 4 12"/></svg>
              </span>
            )}
          </div>

          {/* External Connected Accounts */}
          {accounts.length > 0 && (
            <>
              <div style={{ padding: '0.5rem 0.6rem 0.2rem', fontSize: '0.6875rem', fontWeight: 700, color: 'var(--color-text-tertiary)', textTransform: 'uppercase' }}>
                Connected Mailboxes
              </div>
              {accounts.map((acc) => (
                <div
                  key={acc.id}
                  onClick={() => handleSwitch(acc)}
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    padding: '0.5rem 0.75rem',
                    borderRadius: 'var(--radius-sm)',
                    cursor: 'pointer',
                    background: activeAccount?.id === acc.id ? 'rgba(124, 58, 237, 0.15)' : 'transparent'
                  }}
                >
                  <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                    <span style={{ display: 'inline-flex', color: 'var(--color-info)' }}>
                      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M4 4h16c1.1 0 2 .9 2 2v12c0 1.1-.9 2-2 2H4c-1.1 0-2-.9-2-2V6c0-1.1.9-2 2-2z"/><polyline points="22,6 12,13 2,6"/></svg>
                    </span>
                    <div>
                      <div style={{ fontWeight: 600, fontSize: '0.8125rem' }}>{acc.email}</div>
                      <div className="text-secondary" style={{ fontSize: '0.6875rem' }}>{acc.provider || 'IMAP'} External</div>
                    </div>
                  </div>
                  {activeAccount?.id === acc.id && (
                    <span style={{ color: 'var(--color-primary-light)', display: 'inline-flex' }}>
                      <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><polyline points="20 6 9 17 4 12"/></svg>
                    </span>
                  )}
                </div>
              ))}
            </>
          )}

          {/* Saved Multi-User Device Accounts (Fast Switch) */}
          {savedDeviceAccounts.length > 0 && (
            <>
              <div style={{ padding: '0.6rem 0.6rem 0.2rem', fontSize: '0.6875rem', fontWeight: 700, color: 'var(--color-text-tertiary)', textTransform: 'uppercase', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <span>Saved Device Profiles</span>
                <span className="badge badge-purple" style={{ fontSize: '0.6rem', padding: '0.1rem 0.4rem' }}>Fast Switch</span>
              </div>
              {savedDeviceAccounts.map((saved) => (
                <div
                  key={saved.email}
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    padding: '0.45rem 0.75rem',
                    borderRadius: 'var(--radius-sm)',
                    background: 'rgba(255,255,255,0.02)',
                    marginBottom: '0.2rem'
                  }}
                >
                  <div
                    onClick={() => handleSwitchProfile(saved)}
                    style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', flex: 1, minWidth: 0, cursor: 'pointer' }}
                    title="Click to instantly switch to this saved account"
                  >
                    <span style={{ display: 'inline-flex', color: 'var(--color-warning)' }}>
                      <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2"/></svg>
                    </span>
                    <div style={{ minWidth: 0, flex: 1 }}>
                      <div style={{ fontWeight: 600, fontSize: '0.8125rem', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{saved.displayName || saved.username}</div>
                      <div className="text-secondary" style={{ fontSize: '0.6875rem', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{saved.email}</div>
                    </div>
                  </div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '0.35rem' }}>
                    <button
                      type="button"
                      className="btn btn-primary btn-xs"
                      style={{ padding: '0.2rem 0.5rem', fontSize: '0.7rem' }}
                      onClick={() => handleSwitchProfile(saved)}
                    >
                      Switch
                    </button>
                    <button
                      type="button"
                      className="btn btn-ghost btn-xs"
                      title={`Remove ${saved.email} from device`}
                      style={{ padding: '0.2rem 0.35rem', color: 'var(--color-text-tertiary)', display: 'inline-flex', alignItems: 'center', justifyContent: 'center' }}
                      onClick={(e) => {
                        e.stopPropagation();
                        if (window.confirm(`Remove ${saved.email} from saved profiles?`)) {
                          if (window.WoxAccountManager) {
                            window.WoxAccountManager.removeAccount(saved.email);
                          }
                          setSavedDeviceAccounts(prev => prev.filter(a => a.email.toLowerCase() !== saved.email.toLowerCase()));
                        }
                      }}
                    >
                      <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
                    </button>
                  </div>
                </div>
              ))}
            </>
          )}

          <div style={{ borderTop: '1px solid var(--color-border)', marginTop: '0.5rem', paddingTop: '0.5rem', display: 'flex', flexDirection: 'column', gap: '0.25rem' }}>
            <a
              href="/settings#accounts"
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: '0.5rem',
                padding: '0.4rem 0.6rem',
                fontSize: '0.8125rem',
                color: 'var(--color-primary-light)',
                textDecoration: 'none',
                borderRadius: 'var(--radius-sm)'
              }}
            >
              <span style={{ display: 'inline-flex' }}>
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>
              </span>
              <span>Connect Mailbox (IMAP/SMTP)...</span>
            </a>
            <a
              href="/login?add_account=1"
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: '0.5rem',
                padding: '0.4rem 0.6rem',
                fontSize: '0.8125rem',
                color: 'var(--color-text-secondary)',
                textDecoration: 'none',
                borderRadius: 'var(--radius-sm)'
              }}
            >
              <span style={{ display: 'inline-flex' }}>
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/><circle cx="12" cy="7" r="4"/></svg>
              </span>
              <span>Add Another Wox User...</span>
            </a>
          </div>
        </div>
      )}
    </div>
  );
}
