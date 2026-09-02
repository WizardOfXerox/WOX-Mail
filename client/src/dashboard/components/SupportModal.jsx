import React, { useState, useEffect } from 'react';

/**
 * SupportModal — User Helpdesk Portal with Ticket Tracking, Live Thread & Diagnostics
 */
export default function SupportModal({ user, onClose }) {
  const [activeView, setActiveView] = useState('list'); // 'list' | 'create' | 'thread'
  const [tickets, setTickets] = useState([]);
  const [loading, setLoading] = useState(true);
  const [selectedTicketId, setSelectedTicketId] = useState(null);
  const [threadData, setThreadData] = useState(null);
  const [loadingThread, setLoadingThread] = useState(false);

  // New ticket form state
  const [subject, setSubject] = useState('');
  const [category, setCategory] = useState('general');
  const [priority, setPriority] = useState('medium');
  const [messageText, setMessageText] = useState('');
  const [creating, setCreating] = useState(false);
  const [replyText, setReplyText] = useState('');
  const [sendingReply, setSendingReply] = useState(false);

  // Diagnostics
  const [diagnosticsInfo, setDiagnosticsInfo] = useState(null);

  const fetchTickets = async () => {
    try {
      setLoading(true);
      const res = await fetch('/api/support/tickets', { credentials: 'include' });
      const data = await res.json();
      setTickets(data.tickets || []);
    } catch (err) {
      console.error('Failed to fetch tickets', err);
    } finally {
      setLoading(false);
    }
  };

  const fetchThread = async (id) => {
    try {
      setLoadingThread(true);
      const res = await fetch(`/api/support/tickets/${id}`, { credentials: 'include' });
      const data = await res.json();
      setThreadData(data);
      setSelectedTicketId(id);
      setActiveView('thread');
    } catch (err) {
      alert('Failed to load ticket thread: ' + err.message);
    } finally {
      setLoadingThread(false);
    }
  };

  useEffect(() => {
    fetchTickets();
    // Gather client diagnostics
    setDiagnosticsInfo({
      userAgent: navigator.userAgent,
      screen: `${window.innerWidth}x${window.innerHeight}`,
      language: navigator.language,
      timeZone: Intl.DateTimeFormat().resolvedOptions().timeZone,
      timestamp: new Date().toISOString(),
    });
  }, []);

  const handleCreateTicket = async (e) => {
    e.preventDefault();
    if (!subject.trim() || !messageText.trim()) return;

    setCreating(true);
    try {
      const fullMessage = `${messageText.trim()}\n\n---\n[System Diagnostics Info]\nBrowser: ${diagnosticsInfo.userAgent}\nScreen: ${diagnosticsInfo.screen}\nTimezone: ${diagnosticsInfo.timeZone}`;

      const res = await fetch('/api/support/tickets', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({
          subject: subject.trim(),
          category,
          priority,
          messageText: fullMessage,
        }),
      });
      const data = await res.json();
      if (data.success) {
        setSubject('');
        setMessageText('');
        fetchTickets();
        fetchThread(data.ticket.id);
      }
    } catch (err) {
      alert('Failed to create ticket: ' + err.message);
    } finally {
      setCreating(false);
    }
  };

  const handleSendReply = async (e) => {
    e.preventDefault();
    if (!replyText.trim() || !selectedTicketId) return;

    setSendingReply(true);
    try {
      const res = await fetch(`/api/support/tickets/${selectedTicketId}/messages`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ messageText: replyText.trim() }),
      });
      const data = await res.json();
      if (data.success) {
        setReplyText('');
        fetchThread(selectedTicketId);
      }
    } catch (err) {
      alert('Failed to post reply: ' + err.message);
    } finally {
      setSendingReply(false);
    }
  };

  return (
    <div className="compose-overlay" onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <div className="compose-modal card" style={{ maxWidth: 780, maxHeight: '88vh', display: 'flex', flexDirection: 'column' }}>
        {/* Header */}
        <div className="compose-header">
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
            {activeView !== 'list' && (
              <button
                type="button"
                className="btn btn-ghost btn-xs"
                onClick={() => { setActiveView('list'); setThreadData(null); }}
              >
                ← Back
              </button>
            )}
            <h3 style={{ margin: 0 }}>
              {activeView === 'create' ? 'Open New Support Ticket' : activeView === 'thread' ? `Ticket #${threadData?.ticket?.ticket_number || ''}` : 'Sovereign Help & Support Desk'}
            </h3>
          </div>
          <button type="button" className="btn btn-ghost btn-xs" onClick={onClose}>✕</button>
        </div>

        {/* Content Body */}
        <div style={{ padding: '1.25rem', overflowY: 'auto', flex: 1, display: 'flex', flexDirection: 'column' }}>
          {activeView === 'list' && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <div>
                  <span style={{ fontSize: '0.875rem', fontWeight: 600 }}>Your Tickets</span>
                  <div className="text-secondary" style={{ fontSize: '0.75rem' }}>
                    Need assistance? Submit a ticket below or reply directly to any ticket notification.
                  </div>
                </div>
                <button type="button" className="btn btn-primary btn-sm" onClick={() => setActiveView('create')}>
                  + Open New Ticket
                </button>
              </div>

              {loading ? (
                <div className="text-secondary" style={{ textAlign: 'center', padding: '2rem' }}>Loading support tickets...</div>
              ) : tickets.length === 0 ? (
                <div className="card" style={{ textAlign: 'center', padding: '3rem 1.5rem', background: 'var(--color-bg-page)' }}>
                  <span style={{ display: 'inline-flex', color: 'var(--color-primary-light)' }}><svg width="36" height="36" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="10"/><path d="M9.09 9a3 3 0 0 1 5.83 1c0 2-3 3-3 3"/><line x1="12" y1="17" x2="12.01" y2="17"/></svg></span>
                  <h4 style={{ margin: '0.5rem 0' }}>No Support Tickets</h4>
                  <p className="text-secondary" style={{ fontSize: '0.8125rem', marginBottom: '1.25rem' }}>
                    Everything is operating normally. If you encounter any issues, open a ticket anytime.
                  </p>
                  <button type="button" className="btn btn-primary btn-sm" onClick={() => setActiveView('create')}>
                    Open Support Request
                  </button>
                </div>
              ) : (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '0.6rem' }}>
                  {tickets.map((t) => (
                    <div
                      key={t.id}
                      className="card card-interactive"
                      style={{
                        padding: '0.875rem 1rem',
                        cursor: 'pointer',
                        display: 'flex',
                        justifyContent: 'space-between',
                        alignItems: 'center',
                      }}
                      onClick={() => fetchThread(t.id)}
                    >
                      <div>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                          <span className="mono text-purple" style={{ fontWeight: 700, fontSize: '0.8125rem' }}>
                            {t.ticket_number}
                          </span>
                          <strong style={{ fontSize: '0.875rem' }}>{t.subject}</strong>
                        </div>
                        <div className="text-secondary" style={{ fontSize: '0.75rem', marginTop: '0.2rem' }}>
                          Category: <strong>{t.category.toUpperCase()}</strong> · Last updated: {new Date(t.updated_at).toLocaleString()}
                        </div>
                      </div>

                      <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                        <span
                          className={`badge ${
                            t.status === 'open'
                              ? 'badge-purple'
                              : t.status === 'in_progress'
                              ? 'badge-blue'
                              : t.status === 'waiting_customer'
                              ? 'badge-amber'
                              : 'badge-green'
                          }`}
                        >
                          {t.status.replace('_', ' ').toUpperCase()}
                        </span>
                        <span className="text-tertiary" style={{ fontSize: '0.8125rem' }}>➔</span>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}

          {/* ── CREATE VIEW ─────────────────────────────────── */}
          {activeView === 'create' && (
            <form onSubmit={handleCreateTicket} style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem' }}>
                <div>
                  <label className="form-label">Category:</label>
                  <select className="input" value={category} onChange={(e) => setCategory(e.target.value)}>
                    <option value="general">General Inquiry</option>
                    <option value="delivery">Email Delivery & SMTP</option>
                    <option value="security">Security & PGP Vault</option>
                    <option value="tempmail">Disposable Temp Mail</option>
                    <option value="bug">Report a Bug</option>
                    <option value="feature">Feature Suggestion</option>
                  </select>
                </div>
                <div>
                  <label className="form-label">Priority:</label>
                  <select className="input" value={priority} onChange={(e) => setPriority(e.target.value)}>
                    <option value="low">Low (Standard response)</option>
                    <option value="medium">Medium</option>
                    <option value="high">High</option>
                    <option value="urgent">Urgent (Critical issue)</option>
                  </select>
                </div>
              </div>

              <div>
                <label className="form-label">Subject:</label>
                <input
                  className="input"
                  placeholder="Brief summary of the issue..."
                  value={subject}
                  onChange={(e) => setSubject(e.target.value)}
                  required
                />
              </div>

              <div>
                <label className="form-label">Detailed Description:</label>
                <textarea
                  className="input"
                  rows={6}
                  placeholder="Describe what happened, error messages, and steps to reproduce..."
                  value={messageText}
                  onChange={(e) => setMessageText(e.target.value)}
                  required
                />
              </div>

              <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '0.5rem', marginTop: '0.5rem' }}>
                <button type="button" className="btn btn-secondary" onClick={() => setActiveView('list')}>
                  Cancel
                </button>
                <button type="submit" className="btn btn-primary" disabled={creating}>
                  {creating ? 'Opening Ticket...' : 'Submit Support Request'}
                </button>
              </div>
            </form>
          )}

          {/* ── THREAD VIEW ─────────────────────────────────── */}
          {activeView === 'thread' && threadData && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem', height: '100%' }}>
              <div style={{ background: 'var(--color-bg-page)', padding: '0.75rem 1rem', borderRadius: 'var(--radius-sm)', border: '1px solid var(--color-border)' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <h4 style={{ margin: 0 }}>{threadData.ticket.subject}</h4>
                  <span className="badge badge-purple">{threadData.ticket.status.toUpperCase()}</span>
                </div>
                <div className="text-secondary" style={{ fontSize: '0.75rem', marginTop: '0.25rem' }}>
                  Opened by: {threadData.ticket.creator_email} · Priority: <strong>{threadData.ticket.priority.toUpperCase()}</strong>
                </div>
              </div>

              {/* Message Feed */}
              <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem', flex: 1 }}>
                {threadData.messages?.map((m) => (
                  <div
                    key={m.id}
                    className="card"
                    style={{
                      padding: '0.875rem 1rem',
                      background: m.sender_type === 'staff' ? 'rgba(124, 58, 237, 0.1)' : 'var(--color-bg-card)',
                      borderLeft: m.sender_type === 'staff' ? '4px solid var(--color-primary)' : '4px solid var(--color-border)',
                    }}
                  >
                    <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '0.35rem', fontSize: '0.75rem' }}>
                      <strong>
                        {m.sender_type === 'staff' ? 'WoxMail Sovereign Support' : m.sender_email}
                      </strong>
                      <span className="text-tertiary">{new Date(m.created_at).toLocaleString()}</span>
                    </div>
                    <p style={{ margin: 0, fontSize: '0.875rem', whiteSpace: 'pre-wrap', lineHeight: 1.5 }}>
                      {m.message_text}
                    </p>
                  </div>
                ))}
              </div>

              {/* Reply Box */}
              <form onSubmit={handleSendReply} style={{ display: 'flex', gap: '0.5rem', marginTop: '0.5rem' }}>
                <textarea
                  className="input"
                  rows={2}
                  placeholder="Type a reply..."
                  value={replyText}
                  onChange={(e) => setReplyText(e.target.value)}
                  required
                />
                <button type="submit" className="btn btn-primary" disabled={sendingReply} style={{ alignSelf: 'flex-end' }}>
                  {sendingReply ? 'Sending...' : 'Reply'}
                </button>
              </form>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
