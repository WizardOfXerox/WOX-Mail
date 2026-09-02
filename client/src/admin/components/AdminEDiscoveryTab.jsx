import React, { useState, useEffect } from 'react';
import { get, post } from '../../shared/api.js';

export default function AdminEDiscoveryTab() {
  const [messages, setMessages] = useState([]);
  const [pagination, setPagination] = useState({ page: 1, limit: 25, total: 0, pages: 1 });
  const [search, setSearch] = useState('');
  const [sender, setSender] = useState('');
  const [recipient, setRecipient] = useState('');
  const [direction, setDirection] = useState('');
  const [loading, setLoading] = useState(true);
  const [selectedMsg, setSelectedMsg] = useState(null);
  const [verifyingHash, setVerifyingHash] = useState(false);
  const [hashResult, setHashResult] = useState(null);

  useEffect(() => {
    fetchMessages(1);
  }, []);

  const fetchMessages = async (page = 1) => {
    setLoading(true);
    try {
      const params = new URLSearchParams({
        page: String(page),
        limit: '25',
      });
      if (search.trim()) params.append('search', search.trim());
      if (sender.trim()) params.append('sender', sender.trim());
      if (recipient.trim()) params.append('recipient', recipient.trim());
      if (direction) params.append('direction', direction);

      const data = await get(`/admin/ediscovery?${params.toString()}`);
      setMessages(data.messages || []);
      setPagination(data.pagination || { page: 1, limit: 25, total: 0, pages: 1 });
    } catch (err) {
      if (window.WoxToast) window.WoxToast.error(err.message || 'Failed to search archive');
    } finally {
      setLoading(false);
    }
  };

  const handleSearch = (e) => {
    e.preventDefault();
    fetchMessages(1);
  };

  const handleVerifyHash = async (id) => {
    setVerifyingHash(true);
    setHashResult(null);
    try {
      const res = await post('/admin/ediscovery/verify-hash', { id });
      setHashResult(res);
      if (res.isVerified) {
        if (window.WoxToast) window.WoxToast.success('Cryptographic SHA-256 match confirmed');
      } else {
        if (window.WoxToast) window.WoxToast.error('Hash mismatch detected');
      }
    } catch (err) {
      if (window.WoxToast) window.WoxToast.error(err.message || 'Verification failed');
    } finally {
      setVerifyingHash(false);
    }
  };

  return (
    <div className="admin-tab-content">
      <div className="admin-page-header">
        <div>
          <h2 className="admin-page-title">eDiscovery & Universal Compliance Archive</h2>
          <p className="admin-page-desc">
            Cryptographically audited non-repudiation journal archiving all domain inbound and outbound communications with SHA-256 hashes and legal discovery export.
          </p>
        </div>
        <div style={{ display: 'flex', gap: '0.5rem' }}>
          <a
            href="/api/admin/ediscovery/export"
            download="woxmail_ediscovery_export.mbox"
            className="btn btn-secondary"
          >
            Export MBOX Archive
          </a>
        </div>
      </div>

      {/* Search & Filter Controls */}
      <div className="admin-card" style={{ marginBottom: '1.25rem', padding: '1rem 1.25rem' }}>
        <form onSubmit={handleSearch} style={{ display: 'flex', flexWrap: 'wrap', gap: '0.75rem', alignItems: 'center' }}>
          <input
            type="text"
            className="admin-input"
            placeholder="Search keywords or subject..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            style={{ flex: '1 1 200px' }}
          />
          <input
            type="text"
            className="admin-input"
            placeholder="Filter sender address..."
            value={sender}
            onChange={(e) => setSender(e.target.value)}
            style={{ width: '180px' }}
          />
          <input
            type="text"
            className="admin-input"
            placeholder="Filter recipient..."
            value={recipient}
            onChange={(e) => setRecipient(e.target.value)}
            style={{ width: '180px' }}
          />
          <select
            className="admin-input"
            value={direction}
            onChange={(e) => setDirection(e.target.value)}
            style={{ width: '130px' }}
          >
            <option value="">All Traffic</option>
            <option value="inbound">Inbound</option>
            <option value="outbound">Outbound</option>
          </select>
          <button type="submit" className="btn btn-primary" disabled={loading}>
            Search Archive
          </button>
        </form>
      </div>

      {/* Results Table */}
      <div className="admin-card" style={{ padding: '0', overflow: 'hidden', marginBottom: '1.25rem' }}>
        <table className="admin-table" style={{ width: '100%', borderCollapse: 'collapse' }}>
          <thead>
            <tr style={{ background: 'var(--color-bg-elevated)', textAlign: 'left', borderBottom: '1px solid var(--color-border)' }}>
              <th style={{ padding: '0.75rem 1rem' }}>ID</th>
              <th style={{ padding: '0.75rem 1rem' }}>Direction</th>
              <th style={{ padding: '0.75rem 1rem' }}>Sender</th>
              <th style={{ padding: '0.75rem 1rem' }}>Recipients</th>
              <th style={{ padding: '0.75rem 1rem' }}>Subject</th>
              <th style={{ padding: '0.75rem 1rem' }}>Cryptographic Hash</th>
              <th style={{ padding: '0.75rem 1rem' }}>Timestamp</th>
              <th style={{ padding: '0.75rem 1rem' }}>Inspect</th>
            </tr>
          </thead>
          <tbody>
            {messages.length === 0 ? (
              <tr>
                <td colSpan="8" style={{ padding: '2rem', textAlign: 'center', color: 'var(--color-text-secondary)' }}>
                  No archived communications found matching query.
                </td>
              </tr>
            ) : (
              messages.map((msg) => (
                <tr key={msg.id} style={{ borderBottom: '1px solid var(--color-border)' }}>
                  <td style={{ padding: '0.75rem 1rem', fontFamily: 'var(--font-mono)', fontSize: '0.85rem' }}>#{msg.id}</td>
                  <td style={{ padding: '0.75rem 1rem' }}>
                    <span className={`badge ${msg.direction === 'inbound' ? 'badge-purple' : 'badge-green'}`}>
                      {msg.direction ? msg.direction.toUpperCase() : 'UNKNOWN'}
                    </span>
                  </td>
                  <td style={{ padding: '0.75rem 1rem', fontSize: '0.85rem' }}>{msg.sender_address}</td>
                  <td style={{ padding: '0.75rem 1rem', fontSize: '0.85rem' }}>{(msg.recipient_addresses || []).join(', ')}</td>
                  <td style={{ padding: '0.75rem 1rem', fontSize: '0.85rem', maxWidth: '220px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                    {msg.subject || '(no subject)'}
                  </td>
                  <td style={{ padding: '0.75rem 1rem', fontFamily: 'var(--font-mono)', fontSize: '0.75rem', color: 'var(--color-primary-light)' }}>
                    {msg.checksum ? `${msg.checksum.slice(0, 12)}...` : 'N/A'}
                  </td>
                  <td style={{ padding: '0.75rem 1rem', fontSize: '0.8rem', color: 'var(--color-text-secondary)' }}>
                    {new Date(msg.sent_or_received_at || msg.created_at).toLocaleString()}
                  </td>
                  <td style={{ padding: '0.75rem 1rem' }}>
                    <button
                      type="button"
                      className="btn btn-ghost btn-xs"
                      onClick={() => {
                        setSelectedMsg(msg);
                        setHashResult(null);
                      }}
                    >
                      Audit
                    </button>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      {/* Pagination Controls */}
      {pagination.pages > 1 && (
        <div style={{ display: 'flex', justifyContent: 'center', gap: '0.5rem', marginBottom: '1.5rem' }}>
          <button
            type="button"
            className="btn btn-ghost btn-sm"
            disabled={pagination.page <= 1}
            onClick={() => fetchMessages(pagination.page - 1)}
          >
            Previous
          </button>
          <span style={{ display: 'flex', alignItems: 'center', padding: '0 0.75rem', fontSize: '0.875rem' }}>
            Page {pagination.page} of {pagination.pages} ({pagination.total} records)
          </span>
          <button
            type="button"
            className="btn btn-ghost btn-sm"
            disabled={pagination.page >= pagination.pages}
            onClick={() => fetchMessages(pagination.page + 1)}
          >
            Next
          </button>
        </div>
      )}

      {/* Cryptographic Hash Verification Modal / Drawer */}
      {selectedMsg && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.8)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 9999, padding: '1rem' }}>
          <div className="admin-card" style={{ width: '100%', maxWidth: '640px', maxHeight: '85vh', overflowY: 'auto', padding: '1.5rem' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1rem' }}>
              <h3 style={{ fontSize: '1.1rem', fontWeight: 700 }}>Compliance Record Audit #{selectedMsg.id}</h3>
              <button
                type="button"
                className="btn btn-ghost btn-xs"
                onClick={() => setSelectedMsg(null)}
              >
                Close
              </button>
            </div>

            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem', fontSize: '0.875rem', marginBottom: '1.25rem' }}>
              <div><strong>Subject:</strong> {selectedMsg.subject}</div>
              <div><strong>Sender:</strong> {selectedMsg.sender_address} ({selectedMsg.sender_name || 'N/A'})</div>
              <div><strong>Recipients:</strong> {(selectedMsg.recipient_addresses || []).join(', ')}</div>
              <div><strong>Direction:</strong> {selectedMsg.direction}</div>
              <div><strong>Recorded Checksum:</strong> <span style={{ fontFamily: 'var(--font-mono)', fontSize: '0.8rem', wordBreak: 'break-all' }}>{selectedMsg.checksum || 'None'}</span></div>
            </div>

            <div style={{ borderTop: '1px solid var(--color-border)', paddingTop: '1rem', marginBottom: '1.25rem' }}>
              <button
                type="button"
                className="btn btn-primary"
                onClick={() => handleVerifyHash(selectedMsg.id)}
                disabled={verifyingHash}
                style={{ width: '100%' }}
              >
                {verifyingHash ? 'Recalculating SHA-256 Hash...' : 'Verify Cryptographic SHA-256 Non-Repudiation Proof'}
              </button>

              {hashResult && (
                <div style={{ marginTop: '1rem', padding: '1rem', borderRadius: 'var(--radius-sm)', background: hashResult.isVerified ? 'rgba(34, 197, 94, 0.15)' : 'rgba(239, 68, 68, 0.15)', border: `1px solid ${hashResult.isVerified ? 'var(--color-success)' : 'var(--color-error)'}` }}>
                  <div style={{ fontWeight: 700, color: hashResult.isVerified ? 'var(--color-success)' : 'var(--color-error)', marginBottom: '0.5rem' }}>
                    {hashResult.status}
                  </div>
                  <div style={{ fontSize: '0.8rem', fontFamily: 'var(--font-mono)', wordBreak: 'break-all' }}>
                    <div><strong>Stored:</strong> {hashResult.storedChecksum}</div>
                    <div><strong>Calculated:</strong> {hashResult.calculatedChecksum}</div>
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
