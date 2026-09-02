import React, { useState, useEffect } from 'react';
import { get, put } from '../../shared/api.js';

export default function AdminGovernanceTab() {
  const [policy, setPolicy] = useState({
    mfa_enforced: false,
    session_timeout_minutes: 480,
    max_attachment_size_mb: 25,
    blocked_extensions: ['.exe', '.bat', '.cmd', '.scr', '.vbs', '.js', '.jar', '.iso', '.ps1'],
    outbound_rate_limit_per_hour: 100,
    dlp_enabled: true,
    dlp_rules: [],
  });
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [newExt, setNewExt] = useState('');

  useEffect(() => {
    fetchPolicy();
  }, []);

  const fetchPolicy = async () => {
    setLoading(true);
    try {
      const data = await get('/admin/governance');
      if (data.policy) setPolicy(data.policy);
    } catch (err) {
      if (window.WoxToast) window.WoxToast.error(err.message || 'Failed to load governance policy');
    } finally {
      setLoading(false);
    }
  };

  const handleSave = async (e) => {
    if (e) e.preventDefault();
    setSaving(true);
    try {
      await put('/admin/governance', policy);
      if (window.WoxToast) window.WoxToast.success('Security governance policies updated successfully');
    } catch (err) {
      if (window.WoxToast) window.WoxToast.error(err.message || 'Failed to save governance policy');
    } finally {
      setSaving(false);
    }
  };

  const handleAddExt = (e) => {
    e.preventDefault();
    let ext = newExt.trim().toLowerCase();
    if (!ext) return;
    if (!ext.startsWith('.')) ext = '.' + ext;
    if (!policy.blocked_extensions.includes(ext)) {
      setPolicy({ ...policy, blocked_extensions: [...policy.blocked_extensions, ext] });
    }
    setNewExt('');
  };

  const handleRemoveExt = (extToRemove) => {
    setPolicy({
      ...policy,
      blocked_extensions: policy.blocked_extensions.filter((ext) => ext !== extToRemove),
    });
  };

  const toggleDlpRule = (id) => {
    setPolicy({
      ...policy,
      dlp_rules: policy.dlp_rules.map((r) =>
        r.id === id ? { ...r, enabled: !r.enabled } : r
      ),
    });
  };

  return (
    <div className="admin-tab-content">
      <div className="admin-page-header">
        <div>
          <h2 className="admin-page-title">Security Governance & DLP Shield</h2>
          <p className="admin-page-desc">
            Enforce organization-wide identity policies, session lifetimes, outbound rate limits, attachment sandbox defenses, and automated Data Loss Prevention (DLP).
          </p>
        </div>
        <div>
          <button
            type="button"
            className="btn btn-primary"
            onClick={handleSave}
            disabled={saving}
          >
            {saving ? 'Applying Policies...' : 'Save Governance Policies'}
          </button>
        </div>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(360px, 1fr))', gap: '1.25rem' }}>
        {/* Identity & Authentication Controls */}
        <div className="admin-card" style={{ padding: '1.25rem' }}>
          <h3 style={{ fontSize: '1rem', fontWeight: 700, marginBottom: '0.75rem' }}>
            Identity & Authentication Controls
          </h3>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
            <label style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', cursor: 'pointer' }}>
              <div>
                <div style={{ fontWeight: 600, fontSize: '0.9rem' }}>Enforce Mandatory 2FA / WebAuthn</div>
                <div style={{ fontSize: '0.8rem', color: 'var(--color-text-secondary)' }}>
                  Require TOTP or FIDO2/Passkey registration for all domain accounts.
                </div>
              </div>
              <input
                type="checkbox"
                checked={policy.mfa_enforced}
                onChange={(e) => setPolicy({ ...policy, mfa_enforced: e.target.checked })}
                style={{ width: '18px', height: '18px', accentColor: 'var(--color-primary)' }}
              />
            </label>

            <div>
              <div style={{ fontWeight: 600, fontSize: '0.9rem', marginBottom: '0.35rem' }}>
                Admin & User Session Timeout
              </div>
              <select
                className="admin-input"
                value={policy.session_timeout_minutes}
                onChange={(e) => setPolicy({ ...policy, session_timeout_minutes: parseInt(e.target.value, 10) })}
              >
                <option value={15}>15 Minutes (High Security)</option>
                <option value={60}>1 Hour</option>
                <option value={480}>8 Hours (Standard Working Day)</option>
                <option value={1440}>24 Hours</option>
                <option value={10080}>7 Days</option>
              </select>
            </div>
          </div>
        </div>

        {/* Outbound Throttling & Attachment Sandbox */}
        <div className="admin-card" style={{ padding: '1.25rem' }}>
          <h3 style={{ fontSize: '1rem', fontWeight: 700, marginBottom: '0.75rem' }}>
            Outbound Abuse & Attachment Shield
          </h3>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
            <div>
              <div style={{ fontWeight: 600, fontSize: '0.9rem', marginBottom: '0.35rem' }}>
                Outbound Rate Limit (Emails / Hour / User)
              </div>
              <input
                type="number"
                className="admin-input"
                value={policy.outbound_rate_limit_per_hour}
                onChange={(e) => setPolicy({ ...policy, outbound_rate_limit_per_hour: parseInt(e.target.value, 10) || 100 })}
                min={10}
                max={5000}
              />
            </div>

            <div>
              <div style={{ fontWeight: 600, fontSize: '0.9rem', marginBottom: '0.35rem' }}>
                Maximum Inbound/Outbound Attachment Size (MB)
              </div>
              <input
                type="number"
                className="admin-input"
                value={policy.max_attachment_size_mb}
                onChange={(e) => setPolicy({ ...policy, max_attachment_size_mb: parseInt(e.target.value, 10) || 25 })}
                min={1}
                max={100}
              />
            </div>
          </div>
        </div>
      </div>

      {/* Blocked File Extensions */}
      <div className="admin-card" style={{ marginTop: '1.25rem', padding: '1.25rem' }}>
        <h3 style={{ fontSize: '1rem', fontWeight: 700, marginBottom: '0.5rem' }}>
          Restricted Attachment File Types
        </h3>
        <p style={{ fontSize: '0.85rem', color: 'var(--color-text-secondary)', marginBottom: '1rem' }}>
          Automatically reject or quarantine incoming/outgoing emails containing executable or high-risk file payloads.
        </p>

        <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.5rem', marginBottom: '1rem' }}>
          {policy.blocked_extensions.map((ext) => (
            <span
              key={ext}
              className="badge badge-purple"
              style={{ padding: '0.35rem 0.65rem', display: 'inline-flex', alignItems: 'center', gap: '0.35rem' }}
            >
              <span>{ext}</span>
              <button
                type="button"
                onClick={() => handleRemoveExt(ext)}
                style={{ background: 'transparent', border: 'none', color: 'inherit', cursor: 'pointer', fontSize: '0.8rem', padding: 0 }}
                aria-label={`Remove ${ext}`}
              >
                x
              </button>
            </span>
          ))}
        </div>

        <form onSubmit={handleAddExt} style={{ display: 'flex', gap: '0.5rem', maxWidth: '300px' }}>
          <input
            type="text"
            className="admin-input"
            placeholder="e.g. .apk"
            value={newExt}
            onChange={(e) => setNewExt(e.target.value)}
          />
          <button type="submit" className="btn btn-secondary btn-sm">
            Add Extension
          </button>
        </form>
      </div>

      {/* Data Loss Prevention (DLP) Rules */}
      <div className="admin-card" style={{ marginTop: '1.25rem', padding: '1.25rem' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.5rem' }}>
          <h3 style={{ fontSize: '1rem', fontWeight: 700 }}>Data Loss Prevention (DLP) Patterns</h3>
          <label style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', cursor: 'pointer' }}>
            <span style={{ fontSize: '0.85rem', fontWeight: 600 }}>DLP Engine Active:</span>
            <input
              type="checkbox"
              checked={policy.dlp_enabled}
              onChange={(e) => setPolicy({ ...policy, dlp_enabled: e.target.checked })}
              style={{ width: '16px', height: '16px', accentColor: 'var(--color-primary)' }}
            />
          </label>
        </div>
        <p style={{ fontSize: '0.85rem', color: 'var(--color-text-secondary)', marginBottom: '1rem' }}>
          Scans outgoing message bodies and attachments in real time to prevent accidental exfiltration of confidential credentials or PII.
        </p>

        <table className="admin-table" style={{ width: '100%', borderCollapse: 'collapse' }}>
          <thead>
            <tr style={{ background: 'var(--color-bg-elevated)', textAlign: 'left', borderBottom: '1px solid var(--color-border)' }}>
              <th style={{ padding: '0.75rem 1rem' }}>Detector Name</th>
              <th style={{ padding: '0.75rem 1rem' }}>Action</th>
              <th style={{ padding: '0.75rem 1rem' }}>Status</th>
            </tr>
          </thead>
          <tbody>
            {(policy.dlp_rules || []).map((r) => (
              <tr key={r.id} style={{ borderBottom: '1px solid var(--color-border)' }}>
                <td style={{ padding: '0.75rem 1rem', fontSize: '0.85rem', fontWeight: 600 }}>{r.name}</td>
                <td style={{ padding: '0.75rem 1rem' }}>
                  <span className={`badge ${r.action === 'block' ? 'badge-red' : 'badge-amber'}`}>
                    {r.action ? r.action.toUpperCase() : 'QUARANTINE'}
                  </span>
                </td>
                <td style={{ padding: '0.75rem 1rem' }}>
                  <button
                    type="button"
                    className={`btn btn-xs ${r.enabled ? 'btn-primary' : 'btn-ghost'}`}
                    onClick={() => toggleDlpRule(r.id)}
                  >
                    {r.enabled ? 'ENABLED' : 'DISABLED'}
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
