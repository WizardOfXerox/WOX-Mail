import React, { useState, useEffect } from 'react';

/**
 * GatekeeperView — HEY-Grade Sender Screening Quarantine Queue & Rules Management
 */
export default function GatekeeperView({ onBack }) {
  const [activeTab, setActiveTab] = useState('pending'); // 'pending' | 'rules'
  const [pending, setPending] = useState([]);
  const [rules, setRules] = useState([]);
  const [loading, setLoading] = useState(true);
  const [actionLoading, setActionLoading] = useState({});
  const [ruleSearch, setRuleSearch] = useState('');

  const fetchPending = async () => {
    try {
      const res = await fetch('/api/screener/pending', { credentials: 'include' });
      const data = await res.json();
      setPending(data.pending || []);
    } catch (err) {
      console.error('Failed to fetch pending senders', err);
    }
  };

  const fetchRules = async () => {
    try {
      const res = await fetch('/api/screener/rules', { credentials: 'include' });
      const data = await res.json();
      setRules(data.rules || []);
    } catch (err) {
      console.error('Failed to fetch screener rules', err);
    }
  };

  useEffect(() => {
    setLoading(true);
    Promise.all([fetchPending(), fetchRules()]).finally(() => setLoading(false));
  }, []);

  const handleDecide = async (senderEmail, domain, destination, matchType = 'exact') => {
    setActionLoading((prev) => ({ ...prev, [senderEmail]: true }));
    const pattern = matchType === 'domain' ? domain : senderEmail;

    try {
      const res = await fetch('/api/screener/decide', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({
          senderPattern: pattern,
          matchType,
          destination,
        }),
      });
      const data = await res.json();
      if (data.success) {
        // Remove from pending list
        setPending((prev) => prev.filter((p) => p.email !== senderEmail && (matchType !== 'domain' || p.domain !== domain)));
        fetchRules();
      }
    } catch (err) {
      alert('Failed to save decision: ' + err.message);
    } finally {
      setActionLoading((prev) => ({ ...prev, [senderEmail]: false }));
    }
  };

  const handleDeleteRule = async (ruleId) => {
    if (!confirm('Are you sure you want to remove this screening rule?')) return;
    try {
      await fetch(`/api/screener/rules/${ruleId}`, {
        method: 'DELETE',
        credentials: 'include',
      });
      fetchRules();
    } catch (err) {
      alert('Failed to remove rule: ' + err.message);
    }
  };

  const filteredRules = rules.filter(
    (r) =>
      r.sender_pattern.toLowerCase().includes(ruleSearch.toLowerCase()) ||
      r.destination.toLowerCase().includes(ruleSearch.toLowerCase())
  );

  return (
    <div className="gatekeeper-view" style={{ flex: 1, display: 'flex', flexDirection: 'column', height: '100vh', overflowY: 'auto', background: 'var(--color-bg-page)' }}>
      {/* Header Bar */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '1.25rem 1.5rem', borderBottom: '1px solid var(--color-border)', background: 'var(--color-bg-card)' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
          <button type="button" className="btn btn-secondary btn-sm" onClick={onBack} title="Back to Inbox">
            ← Back
          </button>
          <div>
            <h2 style={{ margin: 0, fontSize: '1.25rem', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/></svg>
              <span>The Gatekeeper (Sender Screener)</span>
            </h2>
            <p className="text-secondary" style={{ margin: 0, fontSize: '0.75rem' }}>
              Quarantine and screen first-contact senders before they ever reach your inbox.
            </p>
          </div>
        </div>

        {/* Tab Toggle */}
        <div style={{ display: 'flex', gap: '0.5rem' }}>
          <button
            type="button"
            className={`btn btn-sm ${activeTab === 'pending' ? 'btn-primary' : 'btn-secondary'}`}
            onClick={() => setActiveTab('pending')}
          >
            Pending Senders ({pending.length})
          </button>
          <button
            type="button"
            className={`btn btn-sm ${activeTab === 'rules' ? 'btn-primary' : 'btn-secondary'}`}
            onClick={() => setActiveTab('rules')}
          >
            Active Rules ({rules.length})
          </button>
        </div>
      </div>

      {/* Main Body */}
      <div style={{ padding: '1.5rem', maxWidth: 900, margin: '0 auto', width: '100%' }}>
        {loading ? (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
            {[...Array(4)].map((_, i) => (
              <div key={i} className="skeleton" style={{ height: 100, borderRadius: 'var(--radius-md)' }} />
            ))}
          </div>
        ) : activeTab === 'pending' ? (
          pending.length === 0 ? (
            <div className="card" style={{ textAlign: 'center', padding: '3rem 1.5rem' }}>
              <span style={{ display: 'inline-flex', color: 'var(--color-primary-light)' }}><svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/><circle cx="12" cy="11" r="2"/></svg></span>
              <h3 style={{ margin: '0.5rem 0' }}>Quarantine Queue is Clear</h3>
              <p className="text-secondary" style={{ fontSize: '0.875rem' }}>
                All senders have been screened. New first-time senders will appear here for triage.
              </p>
            </div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
              <div style={{ fontSize: '0.8125rem', color: 'var(--color-text-secondary)' }}>
                Choose where emails from these new senders should be automatically routed:
              </div>

              {pending.map((p) => (
                <div
                  key={p.email}
                  className="card"
                  style={{
                    display: 'flex',
                    flexDirection: 'column',
                    gap: '0.75rem',
                    border: '1px solid var(--color-border)',
                  }}
                >
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap', gap: '0.5rem' }}>
                    <div>
                      <strong style={{ fontSize: '1rem', color: 'var(--color-text-primary)' }}>
                        {p.name ? `${p.name} (${p.email})` : p.email}
                      </strong>
                      <div className="text-secondary" style={{ fontSize: '0.8125rem', marginTop: '0.2rem' }}>
                        Subject: <em>"{p.firstSubject}"</em>
                      </div>
                    </div>
                    <span className="badge badge-purple" style={{ fontSize: '0.75rem' }}>
                      {p.totalEmails} email{p.totalEmails > 1 ? 's' : ''} received
                    </span>
                  </div>

                  {/* Triage Buttons */}
                  <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap', marginTop: '0.25rem' }}>
                    <button
                      type="button"
                      className="btn btn-sm btn-primary"
                      disabled={actionLoading[p.email]}
                      onClick={() => handleDecide(p.email, p.domain, 'inbox', 'exact')}
                      title="Route future emails directly to primary inbox"
                    >
                      Let In (Inbox)
                    </button>
                    <button
                      type="button"
                      className="btn btn-sm btn-secondary"
                      disabled={actionLoading[p.email]}
                      onClick={() => handleDecide(p.email, p.domain, 'feed', 'exact')}
                      title="Route to The Feed (Newsletters & reading)"
                    >
                      The Feed
                    </button>
                    <button
                      type="button"
                      className="btn btn-sm btn-secondary"
                      disabled={actionLoading[p.email]}
                      onClick={() => handleDecide(p.email, p.domain, 'paper_trail', 'exact')}
                      title="Route to Paper Trail (Receipts, logs & bills)"
                    >
                      Paper Trail
                    </button>
                    <button
                      type="button"
                      className="btn btn-sm btn-danger"
                      disabled={actionLoading[p.email]}
                      onClick={() => handleDecide(p.email, p.domain, 'blocked', 'exact')}
                      title="Silently discard future emails from this sender"
                    >
                      Block
                    </button>
                    {p.domain && (
                      <button
                        type="button"
                        className="btn btn-sm btn-ghost"
                        disabled={actionLoading[p.email]}
                        onClick={() => handleDecide(p.email, p.domain, 'inbox', 'domain')}
                        title={`Approve all senders from *@${p.domain}`}
                        style={{ marginLeft: 'auto', fontSize: '0.75rem' }}
                      >
                        Allow Domain (*@{p.domain})
                      </button>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )
        ) : (
          /* Rules Tab */
          <div>
            <div style={{ marginBottom: '1rem', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <input
                className="input"
                placeholder="Search screening rules..."
                value={ruleSearch}
                onChange={(e) => setRuleSearch(e.target.value)}
                style={{ maxWidth: 300 }}
              />
              <span className="text-secondary" style={{ fontSize: '0.8125rem' }}>
                {filteredRules.length} rule{filteredRules.length !== 1 ? 's' : ''}
              </span>
            </div>

            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
              {filteredRules.map((r) => (
                <div
                  key={r.id}
                  className="card"
                  style={{
                    display: 'flex',
                    justifyContent: 'space-between',
                    alignItems: 'center',
                    padding: '0.75rem 1rem',
                  }}
                >
                  <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
                    <span className="mono" style={{ fontWeight: 600 }}>
                      {r.match_type === 'domain' ? `@${r.sender_pattern}` : r.sender_pattern}
                    </span>
                    <span
                      className={`badge ${
                        r.destination === 'inbox'
                          ? 'badge-green'
                          : r.destination === 'feed'
                          ? 'badge-purple'
                          : r.destination === 'paper_trail'
                          ? 'badge-blue'
                          : 'badge-red'
                      }`}
                    >
                      {r.destination.toUpperCase()}
                    </span>
                  </div>
                  <button
                    type="button"
                    className="btn btn-ghost btn-xs text-secondary"
                    onClick={() => handleDeleteRule(r.id)}
                    title="Remove rule"
                  >
                    Remove
                  </button>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
