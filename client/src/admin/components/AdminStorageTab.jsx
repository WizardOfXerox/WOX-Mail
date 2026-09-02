import React, { useState, useEffect } from 'react';
import { get } from '../../shared/api.js';

export default function AdminStorageTab() {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetchStorage();
  }, []);

  const fetchStorage = async () => {
    setLoading(true);
    try {
      const res = await get('/admin/storage');
      setData(res);
    } catch (err) {
      if (window.WoxToast) window.WoxToast.error(err.message || 'Failed to load storage telemetry');
    } finally {
      setLoading(false);
    }
  };

  const formatBytes = (bytes) => {
    const num = Number(bytes);
    if (!num || num === 0) return '0 B';
    const k = 1024;
    const sizes = ['B', 'KB', 'MB', 'GB', 'TB'];
    const i = Math.floor(Math.log(num) / Math.log(k));
    return parseFloat((num / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
  };

  return (
    <div className="admin-tab-content">
      <div className="admin-page-header">
        <div>
          <h2 className="admin-page-title">Storage & Quotas Telemetry</h2>
          <p className="admin-page-desc">
            Monitor PostgreSQL database disk footprint, table-level index overhead, and user storage quota allocations.
          </p>
        </div>
        <div>
          <button
            type="button"
            className="btn btn-secondary"
            onClick={fetchStorage}
            disabled={loading}
          >
            Refresh Metrics
          </button>
        </div>
      </div>

      {data && (
        <>
          {/* Top Database Size Card */}
          <div
            className="admin-card"
            style={{
              marginBottom: '1.25rem',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              padding: '1.25rem',
              background: 'linear-gradient(135deg, rgba(124, 58, 237, 0.1) 0%, rgba(26, 26, 46, 0.9) 100%)',
              border: '1px solid var(--color-primary-glow)',
            }}
          >
            <div>
              <div style={{ fontSize: '0.8rem', textTransform: 'uppercase', letterSpacing: '0.05em', color: 'var(--color-primary-light)', fontWeight: 700 }}>
                Total Database Storage
              </div>
              <div style={{ fontSize: '1.75rem', fontWeight: 800, marginTop: '0.2rem' }}>
                {data.database?.total_size || '0 MB'}
              </div>
            </div>
            <div>
              <span className="badge badge-purple" style={{ fontSize: '0.85rem', padding: '0.4rem 0.85rem' }}>
                POSTGRESQL RELATIONAL CLUSTER
              </span>
            </div>
          </div>

          {/* User Quotas Leaderboard */}
          <div className="admin-card" style={{ marginBottom: '1.25rem', padding: '1.25rem' }}>
            <h3 style={{ fontSize: '1rem', fontWeight: 700, marginBottom: '0.5rem' }}>
              Top Storage Consumers (Mailbox & Attachments)
            </h3>
            <p style={{ fontSize: '0.85rem', color: 'var(--color-text-secondary)', marginBottom: '1rem' }}>
              Accounts utilizing the highest storage footprint against their configured quota limits.
            </p>

            <table className="admin-table" style={{ width: '100%', borderCollapse: 'collapse' }}>
              <thead>
                <tr style={{ background: 'var(--color-bg-elevated)', textAlign: 'left', borderBottom: '1px solid var(--color-border)' }}>
                  <th style={{ padding: '0.75rem 1rem' }}>User / Account</th>
                  <th style={{ padding: '0.75rem 1rem' }}>Mailbox Size</th>
                  <th style={{ padding: '0.75rem 1rem' }}>Attachment Vault</th>
                  <th style={{ padding: '0.75rem 1rem' }}>Total Used</th>
                  <th style={{ padding: '0.75rem 1rem' }}>Quota Allocation</th>
                </tr>
              </thead>
              <tbody>
                {(data.topUsers || []).length === 0 ? (
                  <tr>
                    <td colSpan="5" style={{ padding: '1.5rem', textAlign: 'center', color: 'var(--color-text-secondary)' }}>
                      No quota usage records found.
                    </td>
                  </tr>
                ) : (
                  data.topUsers.map((u) => {
                    const pct = Math.min(100, Math.round((Number(u.total_used_bytes || 0) / Number(u.max_bytes || 1)) * 100));
                    return (
                      <tr key={u.id} style={{ borderBottom: '1px solid var(--color-border)' }}>
                        <td style={{ padding: '0.75rem 1rem', fontSize: '0.85rem' }}>
                          <div style={{ fontWeight: 600 }}>{u.email}</div>
                          <div style={{ fontSize: '0.75rem', color: 'var(--color-text-secondary)' }}>{u.name || 'Anonymous User'}</div>
                        </td>
                        <td style={{ padding: '0.75rem 1rem', fontSize: '0.85rem' }}>{formatBytes(u.mail_bytes)}</td>
                        <td style={{ padding: '0.75rem 1rem', fontSize: '0.85rem' }}>{formatBytes(u.attach_bytes)}</td>
                        <td style={{ padding: '0.75rem 1rem', fontSize: '0.85rem', fontWeight: 600 }}>
                          {formatBytes(u.total_used_bytes)}
                        </td>
                        <td style={{ padding: '0.75rem 1rem', width: '200px' }}>
                          <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.75rem', marginBottom: '0.25rem' }}>
                            <span>{pct}%</span>
                            <span>Limit: {formatBytes(u.max_bytes)}</span>
                          </div>
                          <div style={{ width: '100%', height: '6px', background: 'var(--color-bg-elevated)', borderRadius: '3px', overflow: 'hidden' }}>
                            <div style={{ width: `${pct}%`, height: '100%', background: pct > 90 ? 'var(--color-error)' : pct > 75 ? 'var(--color-warning)' : 'var(--color-primary)' }} />
                          </div>
                        </td>
                      </tr>
                    );
                  })
                )}
              </tbody>
            </table>
          </div>

          {/* Database Table Storage Metrics */}
          <div className="admin-card" style={{ padding: '1.25rem' }}>
            <h3 style={{ fontSize: '1rem', fontWeight: 700, marginBottom: '0.5rem' }}>
              Database Table Footprint & Index Overhead
            </h3>
            <p style={{ fontSize: '0.85rem', color: 'var(--color-text-secondary)', marginBottom: '1rem' }}>
              Physical disk consumption per relation including table data and B-Tree indexes.
            </p>

            <table className="admin-table" style={{ width: '100%', borderCollapse: 'collapse' }}>
              <thead>
                <tr style={{ background: 'var(--color-bg-elevated)', textAlign: 'left', borderBottom: '1px solid var(--color-border)' }}>
                  <th style={{ padding: '0.75rem 1rem' }}>Table Name</th>
                  <th style={{ padding: '0.75rem 1rem' }}>Total Size</th>
                  <th style={{ padding: '0.75rem 1rem' }}>Table Data</th>
                  <th style={{ padding: '0.75rem 1rem' }}>Index Overhead</th>
                </tr>
              </thead>
              <tbody>
                {(data.tables || []).map((t) => (
                  <tr key={t.table_name} style={{ borderBottom: '1px solid var(--color-border)' }}>
                    <td style={{ padding: '0.75rem 1rem', fontFamily: 'var(--font-mono)', fontSize: '0.85rem' }}>{t.table_name}</td>
                    <td style={{ padding: '0.75rem 1rem', fontSize: '0.85rem', fontWeight: 600 }}>{t.total_size}</td>
                    <td style={{ padding: '0.75rem 1rem', fontSize: '0.85rem', color: 'var(--color-text-secondary)' }}>{t.table_size}</td>
                    <td style={{ padding: '0.75rem 1rem', fontSize: '0.85rem', color: 'var(--color-text-tertiary)' }}>{t.index_size}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      )}
    </div>
  );
}
