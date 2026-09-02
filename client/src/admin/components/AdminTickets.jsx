import React, { useState, useEffect } from 'react';

/**
 * AdminTickets — Staff Helpdesk Triage Board for Support Tickets
 */
export default function AdminTickets() {
  const [tickets, setTickets] = useState([]);
  const [stats, setStats] = useState(null);
  const [loading, setLoading] = useState(true);
  const [selectedTicketId, setSelectedTicketId] = useState(null);
  const [threadData, setThreadData] = useState(null);
  const [statusFilter, setStatusFilter] = useState('open');
  const [priorityFilter, setPriorityFilter] = useState('all');

  // Reply form
  const [replyText, setReplyText] = useState('');
  const [isInternalNote, setIsInternalNote] = useState(false);
  const [sending, setSending] = useState(false);

  const fetchStats = async () => {
    try {
      const res = await fetch('/api/support/admin/stats', { credentials: 'include' });
      const data = await res.json();
      setStats(data.stats);
    } catch {}
  };

  const fetchTickets = async () => {
    try {
      setLoading(true);
      const res = await fetch(`/api/support/admin/tickets?status=${statusFilter}&priority=${priorityFilter}`, {
        credentials: 'include',
      });
      const data = await res.json();
      setTickets(data.tickets || []);
    } catch (err) {
      console.error('Failed to fetch admin tickets', err);
    } finally {
      setLoading(false);
    }
  };

  const fetchThread = async (id) => {
    try {
      const res = await fetch(`/api/support/admin/tickets/${id}`, { credentials: 'include' });
      const data = await res.json();
      setThreadData(data);
      setSelectedTicketId(id);
    } catch (err) {
      alert('Failed to load thread: ' + err.message);
    }
  };

  useEffect(() => {
    fetchStats();
    fetchTickets();
  }, [statusFilter, priorityFilter]);

  const handleUpdateStatus = async (ticketId, newStatus) => {
    try {
      await fetch(`/api/support/admin/tickets/${ticketId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ status: newStatus }),
      });
      fetchStats();
      fetchTickets();
      if (selectedTicketId === ticketId) fetchThread(ticketId);
    } catch (err) {
      alert('Failed to update status: ' + err.message);
    }
  };

  const handleSendReply = async (e) => {
    e.preventDefault();
    if (!replyText.trim() || !selectedTicketId) return;

    setSending(true);
    try {
      const res = await fetch(`/api/support/admin/tickets/${selectedTicketId}/messages`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({
          messageText: replyText.trim(),
          isInternalNote,
        }),
      });
      const data = await res.json();
      if (data.success) {
        setReplyText('');
        fetchThread(selectedTicketId);
        fetchTickets();
      }
    } catch (err) {
      alert('Failed to post reply: ' + err.message);
    } finally {
      setSending(false);
    }
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '1.25rem' }}>
      {/* Telemetry Metrics Bar */}
      {stats && (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(130px, 1fr))', gap: '0.75rem' }}>
          <div className="card" style={{ padding: '0.75rem 1rem', background: 'var(--color-bg-page)' }}>
            <span className="text-secondary" style={{ fontSize: '0.75rem' }}>TOTAL TICKETS</span>
            <strong style={{ fontSize: '1.25rem', display: 'block' }}>{stats.total_tickets || 0}</strong>
          </div>
          <div className="card" style={{ padding: '0.75rem 1rem', background: 'var(--color-bg-page)' }}>
            <span className="text-secondary" style={{ fontSize: '0.75rem' }}>OPEN</span>
            <strong className="text-purple" style={{ fontSize: '1.25rem', display: 'block' }}>{stats.open_tickets || 0}</strong>
          </div>
          <div className="card" style={{ padding: '0.75rem 1rem', background: 'var(--color-bg-page)' }}>
            <span className="text-secondary" style={{ fontSize: '0.75rem' }}>IN PROGRESS</span>
            <strong className="text-blue" style={{ fontSize: '1.25rem', display: 'block' }}>{stats.in_progress_tickets || 0}</strong>
          </div>
          <div className="card" style={{ padding: '0.75rem 1rem', background: 'var(--color-bg-page)' }}>
            <span className="text-secondary" style={{ fontSize: '0.75rem' }}>WAITING USER</span>
            <strong className="text-amber" style={{ fontSize: '1.25rem', display: 'block' }}>{stats.waiting_tickets || 0}</strong>
          </div>
          <div className="card" style={{ padding: '0.75rem 1rem', background: 'var(--color-bg-page)' }}>
            <span className="text-secondary" style={{ fontSize: '0.75rem' }}>RESOLVED</span>
            <strong className="text-green" style={{ fontSize: '1.25rem', display: 'block' }}>{stats.resolved_tickets || 0}</strong>
          </div>
        </div>
      )}

      {/* Filter Row & Controls */}
      <div className="card" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '0.75rem', padding: '0.75rem 1.25rem', background: 'var(--color-bg-card)', border: '1px solid var(--color-border)' }}>
        <div style={{ display: 'flex', gap: '0.75rem', alignItems: 'center', flexWrap: 'wrap' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
            <span style={{ fontSize: '0.8125rem', fontWeight: 600, color: 'var(--color-text-secondary)' }}>Status:</span>
            <select className="input" style={{ width: 140, padding: '0.4rem 0.6rem', fontSize: '0.8125rem' }} value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)}>
              <option value="all">All Statuses</option>
              <option value="open">Open</option>
              <option value="in_progress">In Progress</option>
              <option value="waiting_customer">Waiting User</option>
              <option value="resolved">Resolved</option>
              <option value="closed">Closed</option>
            </select>
          </div>

          <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
            <span style={{ fontSize: '0.8125rem', fontWeight: 600, color: 'var(--color-text-secondary)' }}>Priority:</span>
            <select className="input" style={{ width: 130, padding: '0.4rem 0.6rem', fontSize: '0.8125rem' }} value={priorityFilter} onChange={(e) => setPriorityFilter(e.target.value)}>
              <option value="all">All Priorities</option>
              <option value="urgent">Urgent</option>
              <option value="high">High</option>
              <option value="medium">Medium</option>
              <option value="low">Low</option>
            </select>
          </div>
        </div>

        <button type="button" className="btn btn-secondary btn-sm" onClick={() => { fetchStats(); fetchTickets(); }} style={{ display: 'inline-flex', alignItems: 'center', gap: '0.4rem', padding: '0.45rem 0.85rem' }}>
          <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M21 12a9 9 0 0 0-9-9 9.75 9.75 0 0 0-6.74 2.74L3 8"/><path d="M3 3v5h5"/><path d="M3 12a9 9 0 0 0 9 9 9.75 9.75 0 0 0 6.74-2.74L21 16"/><path d="M16 21h5v-5"/></svg>
          <span>Refresh Tickets</span>
        </button>
      </div>

      {/* 2-Pane Board: Ticket List (Left) | Thread & Response (Right) */}
      <div style={{ display: 'grid', gridTemplateColumns: selectedTicketId ? '1fr 1.2fr' : '1fr', gap: '1rem', minHeight: 450 }}>
        {/* Ticket List */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
          {loading ? (
            <div className="text-secondary" style={{ textAlign: 'center', padding: '2rem' }}>Loading tickets...</div>
          ) : tickets.length === 0 ? (
            <div className="card" style={{ textAlign: 'center', padding: '2.5rem' }}>
              <p className="text-secondary">No tickets matching the current filter.</p>
            </div>
          ) : (
            tickets.map((t) => (
              <div
                key={t.id}
                className={`card card-interactive ${selectedTicketId === t.id ? 'active' : ''}`}
                style={{
                  padding: '0.75rem 1rem',
                  cursor: 'pointer',
                  borderLeft: selectedTicketId === t.id ? '4px solid var(--color-primary)' : '1px solid var(--color-border)',
                }}
                onClick={() => fetchThread(t.id)}
              >
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.25rem' }}>
                  <span className="mono text-purple" style={{ fontWeight: 700, fontSize: '0.8125rem' }}>
                    {t.ticket_number}
                  </span>
                  <span
                    className={`badge ${
                      t.priority === 'urgent'
                        ? 'badge-red'
                        : t.priority === 'high'
                        ? 'badge-amber'
                        : 'badge-purple'
                    }`}
                    style={{ fontSize: '0.6875rem' }}
                  >
                    {t.priority.toUpperCase()}
                  </span>
                </div>
                <strong style={{ fontSize: '0.875rem', display: 'block' }}>{t.subject}</strong>
                <div className="text-secondary" style={{ fontSize: '0.75rem', marginTop: '0.25rem' }}>
                  From: {t.creator_email} · Status: <strong>{t.status.toUpperCase()}</strong>
                </div>
              </div>
            ))
          )}
        </div>

        {/* Selected Thread Pane */}
        {selectedTicketId && threadData && (
          <div className="card" style={{ display: 'flex', flexDirection: 'column', height: '100%', gap: '0.75rem' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', borderBottom: '1px solid var(--color-border)', paddingBottom: '0.5rem' }}>
              <div>
                <h4 style={{ margin: 0 }}>{threadData.ticket.subject}</h4>
                <div className="text-secondary" style={{ fontSize: '0.75rem', marginTop: '0.2rem' }}>
                  From: <strong>{threadData.ticket.creator_email}</strong> ({threadData.ticket.creator_name || 'Member'})
                </div>
              </div>
              <div style={{ display: 'flex', gap: '0.35rem' }}>
                <button
                  type="button"
                  className="btn btn-secondary btn-xs"
                  onClick={() => handleUpdateStatus(threadData.ticket.id, 'in_progress')}
                >
                  In Progress
                </button>
                <button
                  type="button"
                  className="btn btn-secondary btn-xs"
                  onClick={() => handleUpdateStatus(threadData.ticket.id, 'resolved')}
                  style={{ display: 'inline-flex', alignItems: 'center', gap: '0.3rem' }}
                >
                  <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><polyline points="20 6 9 17 4 12"/></svg>
                  <span>Resolve</span>
                </button>
                <button
                  type="button"
                  className="btn btn-ghost btn-xs text-secondary"
                  onClick={() => setSelectedTicketId(null)}
                  style={{ display: 'inline-flex', alignItems: 'center', justifyContent: 'center', width: 24, height: 24, padding: 0 }}
                >
                  <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
                </button>
              </div>
            </div>

            {/* Thread messages feed */}
            <div style={{ flex: 1, overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: '0.6rem', maxHeight: 350 }}>
              {threadData.messages?.map((m) => (
                <div
                  key={m.id}
                  style={{
                    padding: '0.75rem',
                    borderRadius: 'var(--radius-sm)',
                    background: m.is_internal_note ? 'rgba(245, 158, 11, 0.12)' : (m.sender_type === 'staff' ? 'rgba(124, 58, 237, 0.12)' : 'var(--color-bg-page)'),
                    borderLeft: m.is_internal_note ? '3px solid var(--color-warning)' : (m.sender_type === 'staff' ? '3px solid var(--color-primary)' : '3px solid var(--color-border)'),
                  }}
                >
                  <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.75rem', marginBottom: '0.25rem' }}>
                    <strong style={{ display: 'inline-flex', alignItems: 'center', gap: '0.35rem' }}>
                      {m.is_internal_note ? (
                        <>
                          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect width="18" height="11" x="3" y="11" rx="2" ry="2"/><path d="M7 11V7a5 5 0 0 1 10 0v4"/></svg>
                          <span>Internal Staff Note</span>
                        </>
                      ) : m.sender_type === 'staff' ? (
                        <>
                          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2"/></svg>
                          <span>Staff Reply</span>
                        </>
                      ) : (
                        m.sender_email
                      )}
                    </strong>
                    <span className="text-tertiary">{new Date(m.created_at).toLocaleString()}</span>
                  </div>
                  <p style={{ margin: 0, fontSize: '0.8125rem', whiteSpace: 'pre-wrap', lineHeight: 1.5 }}>
                    {m.message_text}
                  </p>
                </div>
              ))}
            </div>

            {/* Reply composer */}
            <form onSubmit={handleSendReply} style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem', borderTop: '1px solid var(--color-border)', paddingTop: '0.75rem' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <label style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', fontSize: '0.75rem', cursor: 'pointer', color: isInternalNote ? 'var(--color-warning)' : 'var(--color-text-secondary)' }}>
                  <input
                    type="checkbox"
                    checked={isInternalNote}
                    onChange={(e) => setIsInternalNote(e.target.checked)}
                  />
                  <span style={{ display: 'inline-flex', alignItems: 'center', gap: '0.3rem' }}>
                    <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect width="18" height="11" x="3" y="11" rx="2" ry="2"/><path d="M7 11V7a5 5 0 0 1 10 0v4"/></svg>
                    <span>Internal Note (Only visible to admins)</span>
                  </span>
                </label>
              </div>

              <div style={{ display: 'flex', gap: '0.5rem' }}>
                <textarea
                  className="input"
                  rows={3}
                  placeholder={isInternalNote ? "Write an internal note for other staff members..." : "Write a customer reply (will be emailed to the user)..."}
                  value={replyText}
                  onChange={(e) => setReplyText(e.target.value)}
                  required
                />
                <button
                  type="submit"
                  className={`btn btn-sm ${isInternalNote ? 'btn-secondary' : 'btn-primary'}`}
                  disabled={sending}
                  style={{ alignSelf: 'flex-end' }}
                >
                  {sending ? 'Posting...' : isInternalNote ? 'Add Note' : 'Send Reply'}
                </button>
              </div>
            </form>
          </div>
        )}
      </div>
    </div>
  );
}
