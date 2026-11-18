import React, { useState, useEffect } from 'react';
import { get, post, del } from '../../shared/api.js';

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
      const data = await get('/screener/pending');
      setPending(data.pending || []);
    } catch (err) {
      if (window.WoxToast) window.WoxToast.error('Failed to load pending senders: ' + err.message);
    }
  };

  const fetchRules = async () => {
    try {
      const data = await get('/screener/rules');
      setRules(data.rules || []);
    } catch (err) {
      if (window.WoxToast) window.WoxToast.error('Failed to load screener rules: ' + err.message);
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
      const data = await post('/screener/decide', {
        senderPattern: pattern,
        matchType,
        destination,
      });
      if (data.success) {
        setPending((prev) => prev.filter((p) => p.email !== senderEmail && (matchType !== 'domain' || p.domain !== domain)));
        if (window.WoxToast) window.WoxToast.success(`Screener rule saved (${destination})`);
        fetchRules();
      } else {
        throw new Error(data.error || 'Failed to save screening rule');
      }
    } catch (err) {
      if (window.WoxToast) window.WoxToast.error('Failed to save decision: ' + err.message);
    } finally {
      setActionLoading((prev) => ({ ...prev, [senderEmail]: false }));
    }
  };

  const handleDeleteRule = async (ruleId) => {
    if (!confirm('Are you sure you want to remove this screening rule?')) return;
    try {
      await del(`/screener/rules/${ruleId}`);
      if (window.WoxToast) window.WoxToast.success('Screening rule removed');
      fetchRules();
    } catch (err) {
      if (window.WoxToast) window.WoxToast.error('Failed to remove rule: ' + err.message);
    }
  };

  const filteredRules = rules.filter(
    (r) =>
      r.sender_pattern.toLowerCase().includes(ruleSearch.toLowerCase()) ||
      r.destination.toLowerCase().includes(ruleSearch.toLowerCase())
  );

  const formatSenderHeading = (p) => {
    const cleanName = String(p.name || '').trim();
    const cleanEmail = String(p.email || '').trim();
    if (!cleanName || cleanName.toLowerCase() === cleanEmail.toLowerCase()) {
      return cleanEmail;
    }
    return `${cleanName} (${cleanEmail})`;
  };

  return (
    <div className="gatekeeper-view">
      {/* Header Bar */}
      <div className="gatekeeper-header">
        <div className="gatekeeper-header-left">
          <button
            type="button"
            className="btn btn-secondary btn-sm gatekeeper-back-btn"
            onClick={onBack}
            title="Back to Inbox"
          >
            ← Back
          </button>
          <div className="gatekeeper-title-wrap">
            <h2 className="gatekeeper-title">
              <svg
                width="18"
                height="18"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
                style={{ flexShrink: 0, color: 'var(--color-primary-light)' }}
              >
                <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" />
              </svg>
              <span>The Gatekeeper</span>
              <span className="gatekeeper-title-tag">Sender Screener</span>
            </h2>
            <p className="text-secondary gatekeeper-subtitle">
              Quarantine and screen first-contact senders before they ever reach your inbox.
            </p>
          </div>
        </div>

        {/* Tab Toggle */}
        <div className="gatekeeper-tabs" role="tablist" aria-label="Gatekeeper sections">
          <button
            type="button"
            role="tab"
            aria-selected={activeTab === 'pending'}
            className={`btn btn-sm gatekeeper-tab-btn ${activeTab === 'pending' ? 'btn-primary' : 'btn-secondary'}`}
            onClick={() => setActiveTab('pending')}
          >
            Pending Senders ({pending.length})
          </button>
          <button
            type="button"
            role="tab"
            aria-selected={activeTab === 'rules'}
            className={`btn btn-sm gatekeeper-tab-btn ${activeTab === 'rules' ? 'btn-primary' : 'btn-secondary'}`}
            onClick={() => setActiveTab('rules')}
          >
            Active Rules ({rules.length})
          </button>
        </div>
      </div>

      {/* Main Body */}
      <div className="gatekeeper-body">
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
            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.875rem' }}>
              <div style={{ fontSize: '0.8125rem', color: 'var(--color-text-secondary)' }}>
                Choose where emails from these new senders should be automatically routed:
              </div>

              {pending.map((p) => (
                <div
                  key={p.email}
                  className="card gatekeeper-card"
                >
                  <div className="gatekeeper-card-header">
                    <div className="gatekeeper-sender-meta">
                      <strong className="gatekeeper-sender-name">
                        {formatSenderHeading(p)}
                      </strong>
                      <div className="text-secondary gatekeeper-sender-subject">
                        Subject: <em>"{p.firstSubject}"</em>
                      </div>
                    </div>
                    <span className="badge badge-purple gatekeeper-count-badge">
                      {p.totalEmails} email{p.totalEmails > 1 ? 's' : ''} received
                    </span>
                  </div>

                  {/* Triage Buttons */}
                  <div className="gatekeeper-actions">
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
                        className="btn btn-sm btn-ghost gatekeeper-allow-domain"
                        disabled={actionLoading[p.email]}
                        onClick={() => handleDecide(p.email, p.domain, 'inbox', 'domain')}
                        title={`Approve all senders from *@${p.domain}`}
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
            <div className="gatekeeper-rules-toolbar">
              <input
                className="input gatekeeper-rules-search"
                placeholder="Search screening rules..."
                value={ruleSearch}
                onChange={(e) => setRuleSearch(e.target.value)}
              />
              <span className="text-secondary gatekeeper-rules-count">
                {filteredRules.length} rule{filteredRules.length !== 1 ? 's' : ''}
              </span>
            </div>

            {filteredRules.length === 0 ? (
              <div className="card" style={{ textAlign: 'center', padding: '2.5rem 1.25rem' }}>
                <h3 style={{ margin: '0 0 0.4rem', fontSize: '1rem' }}>
                  {ruleSearch ? 'No Matching Rules' : 'No Active Screening Rules Yet'}
                </h3>
                <p className="text-secondary" style={{ margin: 0, fontSize: '0.85rem' }}>
                  {ruleSearch
                    ? 'Try a different sender address or destination filter.'
                    : 'Screen senders from the Pending Senders tab to automatically route or block future emails.'}
                </p>
              </div>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
                {filteredRules.map((r) => (
                  <div
                    key={r.id}
                    className="card gatekeeper-rule-row"
                  >
                    <div className="gatekeeper-rule-meta">
                      <span className="mono gatekeeper-rule-pattern">
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
                      style={{ flexShrink: 0 }}
                    >
                      Remove
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
