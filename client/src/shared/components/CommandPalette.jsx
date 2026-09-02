import React, { useState, useEffect, useRef, useMemo } from 'react';

/**
 * Superhuman-grade Command Palette (Ctrl+K / Cmd+K)
 * Dynamic folder jumps, live unread counts, search operators, snippets, and frequency sorting.
 */
export default function CommandPalette({ isOpen, onClose, onAction, folders = [], user }) {
  const [query, setQuery] = useState('');
  const [selectedIndex, setSelectedIndex] = useState(0);
  const inputRef = useRef(null);

  // Load command usage frequencies from localStorage
  const usageMap = useMemo(() => {
    try {
      return JSON.parse(localStorage.getItem('woxmail_cmd_usage') || '{}');
    } catch {
      return {};
    }
  }, [isOpen]);

  const recordUsage = (cmdId) => {
    try {
      const current = JSON.parse(localStorage.getItem('woxmail_cmd_usage') || '{}');
      current[cmdId] = (current[cmdId] || 0) + 1;
      localStorage.setItem('woxmail_cmd_usage', JSON.stringify(current));
    } catch {}
  };

const renderCommandIcon = (item) => {
  const { id } = item;
  if (id === 'compose') return <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M12 20h9"/><path d="M16.5 3.5a2.121 2.121 0 0 1 3 3L7 19l-4 1 1-4L16.5 3.5z"/></svg>;
  if (id === 'secure') return <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect width="18" height="11" x="3" y="11" rx="2" ry="2"/><path d="M7 11V7a5 5 0 0 1 10 0v4"/></svg>;
  if (id === 'refresh') return <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M21 12a9 9 0 0 0-9-9 9.75 9.75 0 0 0-6.74 2.74L3 8"/><path d="M3 3v5h5"/><path d="M3 12a9 9 0 0 0 9 9 9.75 9.75 0 0 0 6.74-2.74L21 16"/><path d="M16 21h5v-5"/></svg>;
  if (id === 'gatekeeper') return <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/></svg>;
  if (id === 'campaigns') return <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="m3 11 18-5v12L3 14v-3z"/><path d="M11.6 16.8a3 3 0 1 1-5.8-1.6"/></svg>;
  if (id === 'support') return <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="10"/><path d="M9.09 9a3 3 0 0 1 5.83 1c0 2-3 3-3 3"/><line x1="12" y1="17" x2="12.01" y2="17"/></svg>;
  if (id === 'futureme') return <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 14 14"/></svg>;
  if (id === 'tempmail') return <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2"/></svg>;
  if (id === 'theme') return <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="10"/><path d="M12 2a10 10 0 0 1 0 20z"/></svg>;
  if (id === 'settings') return <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1 0 2.83 2 2 0 0 1-2.83 0l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-2 2 2 2 0 0 1-2-2v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83 0 2 2 0 0 1 0-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1-2-2 2 2 0 0 1 2-2h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 0-2.83 2 2 0 0 1 2.83 0l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 2-2 2 2 0 0 1 2 2v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 0 2 2 0 0 1 0 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 2 2 2 2 0 0 1-2 2h-.09a1.65 1.65 0 0 0-1.51 1z"/></svg>;
  if (id === 'admin') return <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M12 2l3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01L12 2z"/></svg>;
  if (item.category === 'Folders') return <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z"/></svg>;
  return <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="4 17 10 11 4 5"/><line x1="12" y1="19" x2="20" y2="19"/></svg>;
};

// Base System Commands
const baseCommands = useMemo(() => {
  const list = [
    { id: 'compose', title: 'New Message', category: 'Mail', desc: 'Compose standard or encrypted email', action: () => onAction('compose') },
    { id: 'secure', title: 'Send Confidential Locked Email', category: 'Privacy', desc: 'Zero-knowledge AES-256 password locked email', action: () => onAction('secure') },
    { id: 'refresh', title: 'Refresh Mailbox', category: 'Mail', desc: 'Fetch latest messages and folder counts', action: () => onAction('refresh') },
    { id: 'gatekeeper', title: 'The Gatekeeper', category: 'Privacy', desc: 'Quarantine & screen first-contact senders', action: () => onAction('gatekeeper') },
    { id: 'campaigns', title: 'WoxNewsletter & Campaigns', category: 'Broadcasting', desc: 'Mailing list broadcaster & subscriber manager', action: () => onAction('campaigns') },
    { id: 'support', title: 'Sovereign Support Desk', category: 'Help', desc: 'Open tickets, live support & diagnostics', action: () => onAction('support') },
    { id: 'futureme', title: 'Write Letter to the Future', category: 'Time Capsule', desc: 'Deliver letter 1, 3, 5, 10 years from now', action: () => { window.location.href = '/futureme'; } },
    { id: 'tempmail', title: 'Generate Disposable Temp Mail', category: 'Temp Mail', desc: 'Instant anonymous mailbox with SSE', action: () => { window.location.href = '/tempmail'; } },
    { id: 'theme', title: 'Toggle Dark / Light Theme', category: 'Preferences', desc: 'Switch visual appearance', action: () => onAction('theme') },
    { id: 'settings', title: 'Account Settings & PGP Vault', category: 'Navigation', desc: 'Open settings and security dashboard', action: () => { window.location.href = '/settings'; } },
  ];

  // Dynamic folder commands
  folders.forEach((f) => {
    list.push({
      id: `folder-${f.name}`,
      title: `Go to ${f.name}`,
      category: 'Folders',
      desc: `${f.unseen || 0} unread · ${f.messages || 0} total messages`,
      action: () => onAction('folder', f.name),
    });
  });

  // Admin only command
  if (user?.is_admin) {
    list.push({
      id: 'admin',
      title: 'Admin Control Panel',
      category: 'Admin',
      desc: 'Open administrator suite & system terminal',
      action: () => { window.location.href = '/admin'; },
    });
  }

  return list;
}, [folders, user, onAction]);

  // Filter & sort by search query and usage frequency
  const filtered = useMemo(() => {
    const q = query.toLowerCase().trim();
    const matched = baseCommands.filter(
      (c) =>
        c.title.toLowerCase().includes(q) ||
        c.category.toLowerCase().includes(q) ||
        c.desc.toLowerCase().includes(q)
    );

    return matched.sort((a, b) => {
      const scoreA = (usageMap[a.id] || 0) + (a.title.toLowerCase().startsWith(q) ? 50 : 0);
      const scoreB = (usageMap[b.id] || 0) + (b.title.toLowerCase().startsWith(q) ? 50 : 0);
      return scoreB - scoreA;
    });
  }, [baseCommands, query, usageMap]);

  useEffect(() => {
    if (isOpen) {
      setQuery('');
      setSelectedIndex(0);
      setTimeout(() => inputRef.current?.focus(), 50);
    }
  }, [isOpen]);

  useEffect(() => {
    const handleKeyDown = (e) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault();
        onClose(!isOpen);
      } else if (e.key === 'Escape' && isOpen) {
        onClose(false);
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, onClose]);

  if (!isOpen) return null;

  const handleSelect = (idx) => {
    const item = filtered[idx];
    if (item) {
      recordUsage(item.id);
      onClose(false);
      item.action();
    }
  };

  return (
    <div
      style={{
        position: 'fixed',
        inset: 0,
        backgroundColor: 'rgba(10, 10, 20, 0.75)',
        backdropFilter: 'blur(8px)',
        zIndex: 10000,
        display: 'flex',
        alignItems: 'flex-start',
        justifyContent: 'center',
        paddingTop: '10vh',
      }}
      onClick={(e) => { if (e.target === e.currentTarget) onClose(false); }}
      role="dialog"
      aria-modal="true"
      aria-label="Command Palette"
    >
      <div
        className="card"
        style={{
          width: '100%',
          maxWidth: '640px',
          padding: 0,
          overflow: 'hidden',
          boxShadow: '0 20px 60px rgba(0,0,0,0.7)',
          border: '1px solid var(--color-border)',
          borderRadius: 'var(--radius-lg)',
          animation: 'slideIn 0.15s ease',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', padding: '1rem 1.25rem', borderBottom: '1px solid var(--color-border)', background: 'var(--color-bg-elevated)', gap: '0.75rem' }}>
          <span style={{ display: 'inline-flex', alignItems: 'center', color: 'var(--color-primary-light)' }}>
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="4 17 10 11 4 5"/><line x1="12" y1="19" x2="20" y2="19"/></svg>
          </span>
          <input
            ref={inputRef}
            type="text"
            className="input"
            value={query}
            onChange={(e) => { setQuery(e.target.value); setSelectedIndex(0); }}
            onKeyDown={(e) => {
              if (e.key === 'ArrowDown') {
                e.preventDefault();
                setSelectedIndex((prev) => (prev + 1) % (filtered.length || 1));
              } else if (e.key === 'ArrowUp') {
                e.preventDefault();
                setSelectedIndex((prev) => (prev - 1 + filtered.length) % (filtered.length || 1));
              } else if (e.key === 'Enter') {
                e.preventDefault();
                handleSelect(selectedIndex);
              }
            }}
            placeholder="Type a command or jump to folder (e.g. compose, gatekeeper, campaigns)..."
            style={{ border: 'none', background: 'transparent', boxShadow: 'none', fontSize: '1rem', padding: 0, flex: 1 }}
          />
          <kbd style={{ background: 'var(--color-bg-page)', border: '1px solid var(--color-border)', padding: '2px 6px', borderRadius: 4, fontSize: '0.75rem', color: 'var(--color-text-tertiary)' }}>ESC</kbd>
        </div>

        <div style={{ maxHeight: '380px', overflowY: 'auto', padding: '0.5rem' }}>
          {filtered.length === 0 ? (
            <div style={{ padding: '2rem', textAlign: 'center' }} className="text-secondary">
              No matching commands found.
            </div>
          ) : (
            filtered.map((item, idx) => (
              <div
                key={item.id}
                onClick={() => handleSelect(idx)}
                onMouseEnter={() => setSelectedIndex(idx)}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  padding: '0.75rem 1rem',
                  borderRadius: 'var(--radius-md)',
                  cursor: 'pointer',
                  backgroundColor: selectedIndex === idx ? 'var(--color-bg-hover)' : 'transparent',
                  border: selectedIndex === idx ? '1px solid var(--color-border)' : '1px solid transparent',
                  transition: 'background var(--transition-fast)',
                }}
              >
                <div style={{ display: 'flex', alignItems: 'center' }}>
                  <span style={{ display: 'inline-flex', alignItems: 'center', color: selectedIndex === idx ? 'var(--color-primary-light)' : 'var(--color-text-tertiary)', marginRight: '0.65rem' }}>
                    {renderCommandIcon(item)}
                  </span>
                  <div>
                    <div style={{ fontWeight: 600, fontSize: '0.875rem', color: selectedIndex === idx ? 'var(--color-primary-light)' : 'var(--color-text-primary)' }}>
                      {item.title}
                    </div>
                    <div className="text-secondary" style={{ fontSize: '0.75rem' }}>{item.desc}</div>
                  </div>
                </div>
                <span className="badge badge-purple" style={{ fontSize: '0.6875rem' }}>{item.category}</span>
              </div>
            ))
          )}
        </div>

        <div style={{ padding: '0.5rem 1.25rem', borderTop: '1px solid var(--color-border)', fontSize: '0.75rem', display: 'flex', justifyContent: 'space-between', background: 'var(--color-bg-page)' }} className="text-tertiary">
          <span>Navigate with <kbd>↑</kbd> <kbd>↓</kbd></span>
          <span>Execute with <kbd>Enter</kbd></span>
        </div>
      </div>
    </div>
  );
}
