import React, { useState, useEffect } from 'react';
import { get, post, del } from '../../shared/api.js';

export default function AdminQueueTab() {
  const [jobs, setJobs] = useState([]);
  const [stats, setStats] = useState({ total: 0, queued: 0, retrying: 0, sent: 0, failed: 0 });
  const [screenerRules, setScreenerRules] = useState([]);
  const [spamRules, setSpamRules] = useState([]);
  const [loading, setLoading] = useState(true);
  const [flushing, setFlushing] = useState(false);
  const [activeSubView, setActiveSubView] = useState('queue'); // 'queue' | 'quarantine'

  useEffect(() => {
    fetchData();
  }, []);

  const fetchData = async () => {
    setLoading(true);
    try {
      const [queueData, quarantineData] = await Promise.all([
        get('/admin/queue'),
        get('/admin/quarantine'),
      ]);
      setJobs(queueData.jobs || []);
      setStats(queueData.stats || { total: 0, queued: 0, retrying: 0, sent: 0, failed: 0 });
      setScreenerRules(quarantineData.screenerRules || []);
      setSpamRules(quarantineData.spamRules || []);
    } catch (err) {
      if (window.WoxToast) window.WoxToast.error(err.message || 'Failed to load queue data');
    } finally {
      setLoading(false);
    }
  };

  const handleFlushQueue = async () => {
    setFlushing(true);
    try {
      const res = await post('/admin/queue/flush');
      if (window.WoxToast) window.WoxToast.success(res.message || 'Queue flushed');
      await fetchData();
    } catch (err) {
      if (window.WoxToast) window.WoxToast.error(err.message || 'Failed to flush queue');
    } finally {
      setFlushing(false);
    }
  };

  const handleDeleteJob = async (id) => {
    if (!confirm('Are you sure you want to cancel and remove this queue item?')) return;
    try {
      await del(`/admin/queue/${id}`);
      if (window.WoxToast) window.WoxToast.success('Queue item removed');
      fetchData();
    } catch (err) {
      if (window.WoxToast) window.WoxToast.error(err.message || 'Failed to remove queue item');
    }
  };

  const getStatusBadge = (status) => {
    switch (status) {
      case 'queued':
        return <span className="badge badge-purple">QUEUED</span>;
      case 'sent':
        return <span className="badge badge-green">SENT</span>;
      case 'retrying':
      case 'deferred':
        return <span className="badge badge-amber">RETRYING</span>;
      case 'failed':
        return <span className="badge badge-red">FAILED</span>;
      default:
        return <span className="badge badge-secondary">{status?.toUpperCase() || 'UNKNOWN'}</span>;
    }
  };

  return (
    <div className="admin-tab-content">
      <div className="admin-page-header">
        <div>
          <h2 className="admin-page-title">Mail Delivery Queue & Quarantine Bay</h2>
          <p className="admin-page-desc">
            Monitor outbound SMTP retry queues, flush deferred delivery batches, and inspect screener quarantine holding bays.
          </p>
        </div>
        <div style={{ display: 'flex', gap: '0.5rem' }}>
          <button
            type="button"
            className="btn btn-secondary"
            onClick={fetchData}
            disabled={loading}
          >
            Refresh
          </button>
          <button
            type="button"
            className="btn btn-primary"
            onClick={handleFlushQueue}
            disabled={flushing || stats.retrying + stats.failed === 0}
          >
            {flushing ? 'Flushing Queue...' : 'Flush & Retry Deferred Jobs'}
          </button>
        </div>
      </div>

      {/* Sub-navigation tabs */}
      <div style={{ display: 'flex', gap: '0.5rem', marginBottom: '1.25rem', borderBottom: '1px solid var(--color-border)', paddingBottom: '0.5rem' }}>
        <button
          type="button"
          className={`btn ${activeSubView === 'queue' ? 'btn-primary btn-sm' : 'btn-ghost btn-sm'}`}
          onClick={() => setActiveSubView('queue')}
        >
          Outbound Delivery Queue ({stats.total})
        </button>
        <button
          type="button"
          className={`btn ${activeSubView === 'quarantine' ? 'btn-primary btn-sm' : 'btn-ghost btn-sm'}`}
          onClick={() => setActiveSubView('quarantine')}
        >
          Screener & Quarantine Bay ({screenerRules.length + spamRules.length})
        </button>
      </div>

      {activeSubView === 'queue' && (
        <>
          {/* Metrics summary cards */}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: '1rem', marginBottom: '1.25rem' }}>
            <div className="admin-card" style={{ padding: '1rem' }}>
              <div style={{ fontSize: '0.75rem', textTransform: 'uppercase', color: 'var(--color-text-secondary)' }}>Total Jobs</div>
              <div style={{ fontSize: '1.5rem', fontWeight: 800 }}>{stats.total}</div>
            </div>
            <div className="admin-card" style={{ padding: '1rem' }}>
              <div style={{ fontSize: '0.75rem', textTransform: 'uppercase', color: 'var(--color-primary-light)' }}>Queued</div>
              <div style={{ fontSize: '1.5rem', fontWeight: 800 }}>{stats.queued}</div>
            </div>
            <div className="admin-card" style={{ padding: '1rem' }}>
              <div style={{ fontSize: '0.75rem', textTransform: 'uppercase', color: 'var(--color-warning)' }}>Deferred / Retrying</div>
              <div style={{ fontSize: '1.5rem', fontWeight: 800 }}>{stats.retrying}</div>
            </div>
            <div className="admin-card" style={{ padding: '1rem' }}>
              <div style={{ fontSize: '0.75rem', textTransform: 'uppercase', color: 'var(--color-success)' }}>Delivered</div>
              <div style={{ fontSize: '1.5rem', fontWeight: 800 }}>{stats.sent}</div>
            </div>
            <div className="admin-card" style={{ padding: '1rem' }}>
              <div style={{ fontSize: '0.75rem', textTransform: 'uppercase', color: 'var(--color-error)' }}>Failed</div>
              <div style={{ fontSize: '1.5rem', fontWeight: 800 }}>{stats.failed}</div>
            </div>
          </div>

          {/* Queue Jobs Table */}
          <div className="admin-card" style={{ padding: '0', overflow: 'hidden' }}>
            <table className="admin-table" style={{ width: '100%', borderCollapse: 'collapse' }}>
              <thead>
                <tr style={{ background: 'var(--color-bg-elevated)', textAlign: 'left', borderBottom: '1px solid var(--color-border)' }}>
                  <th style={{ padding: '0.75rem 1rem' }}>ID</th>
                  <th style={{ padding: '0.75rem 1rem' }}>From</th>
                  <th style={{ padding: '0.75rem 1rem' }}>To</th>
                  <th style={{ padding: '0.75rem 1rem' }}>Subject</th>
                  <th style={{ padding: '0.75rem 1rem' }}>Status</th>
                  <th style={{ padding: '0.75rem 1rem' }}>Retries</th>
                  <th style={{ padding: '0.75rem 1rem' }}>Created</th>
                  <th style={{ padding: '0.75rem 1rem' }}>Actions</th>
                </tr>
              </thead>
              <tbody>
                {jobs.length === 0 ? (
                  <tr>
                    <td colSpan="8" style={{ padding: '2rem', textAlign: 'center', color: 'var(--color-text-secondary)' }}>
                      No queued messages in outbound spool.
                    </td>
                  </tr>
                ) : (
                  jobs.map((job) => (
                    <tr key={job.id} style={{ borderBottom: '1px solid var(--color-border)' }}>
                      <td style={{ padding: '0.75rem 1rem', fontFamily: 'var(--font-mono)', fontSize: '0.85rem' }}>#{job.id}</td>
                      <td style={{ padding: '0.75rem 1rem', fontSize: '0.85rem' }}>{job.from_address}</td>
                      <td style={{ padding: '0.75rem 1rem', fontSize: '0.85rem' }}>{(job.to_addresses || []).join(', ')}</td>
                      <td style={{ padding: '0.75rem 1rem', fontSize: '0.85rem', maxWidth: '240px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                        {job.subject || '(no subject)'}
                      </td>
                      <td style={{ padding: '0.75rem 1rem' }}>{getStatusBadge(job.status)}</td>
                      <td style={{ padding: '0.75rem 1rem', fontSize: '0.85rem' }}>{job.retry_count || 0}</td>
                      <td style={{ padding: '0.75rem 1rem', fontSize: '0.8rem', color: 'var(--color-text-secondary)' }}>
                        {new Date(job.created_at).toLocaleString()}
                      </td>
                      <td style={{ padding: '0.75rem 1rem' }}>
                        <button
                          type="button"
                          className="btn btn-ghost btn-xs"
                          onClick={() => handleDeleteJob(job.id)}
                          style={{ color: 'var(--color-error)' }}
                        >
                          Cancel
                        </button>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </>
      )}

      {activeSubView === 'quarantine' && (
        <div className="admin-card" style={{ padding: '1.25rem' }}>
          <h3 style={{ fontSize: '1rem', fontWeight: 700, marginBottom: '0.75rem' }}>
            The Gatekeeper Screener & Quarantine Policies
          </h3>
          <p style={{ fontSize: '0.85rem', color: 'var(--color-text-secondary)', marginBottom: '1rem' }}>
            Active screening rules filtering unknown inbound senders into quarantine bays or cold email holding lists.
          </p>

          <table className="admin-table" style={{ width: '100%', borderCollapse: 'collapse' }}>
            <thead>
              <tr style={{ background: 'var(--color-bg-elevated)', textAlign: 'left', borderBottom: '1px solid var(--color-border)' }}>
                <th style={{ padding: '0.75rem 1rem' }}>User Email</th>
                <th style={{ padding: '0.75rem 1rem' }}>Sender Pattern</th>
                <th style={{ padding: '0.75rem 1rem' }}>Match Type</th>
                <th style={{ padding: '0.75rem 1rem' }}>Destination</th>
                <th style={{ padding: '0.75rem 1rem' }}>Created At</th>
              </tr>
            </thead>
            <tbody>
              {screenerRules.length === 0 ? (
                <tr>
                  <td colSpan="5" style={{ padding: '1.5rem', textAlign: 'center', color: 'var(--color-text-secondary)' }}>
                    No active screener rules.
                  </td>
                </tr>
              ) : (
                screenerRules.map((rule) => (
                  <tr key={rule.id} style={{ borderBottom: '1px solid var(--color-border)' }}>
                    <td style={{ padding: '0.75rem 1rem', fontSize: '0.85rem' }}>{rule.user_email || `User #${rule.user_id}`}</td>
                    <td style={{ padding: '0.75rem 1rem', fontFamily: 'var(--font-mono)', fontSize: '0.85rem' }}>{rule.sender_pattern}</td>
                    <td style={{ padding: '0.75rem 1rem', fontSize: '0.85rem' }}>
                      <span className="badge badge-purple">{rule.match_type}</span>
                    </td>
                    <td style={{ padding: '0.75rem 1rem', fontSize: '0.85rem' }}>{rule.destination}</td>
                    <td style={{ padding: '0.75rem 1rem', fontSize: '0.8rem', color: 'var(--color-text-secondary)' }}>
                      {new Date(rule.created_at).toLocaleDateString()}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
