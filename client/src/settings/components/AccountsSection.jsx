import React, { useState, useEffect } from 'react';
import { get, post, del, put } from '../../shared/api.js';
import { protonClient } from '../../services/protonAPI.js';
import Proton2FAModal from '../../dashboard/components/Proton2FAModal.jsx';

export default function AccountsSection() {
  const [accounts, setAccounts] = useState([]);
  const [presets, setPresets] = useState({});
  const [loading, setLoading] = useState(true);
  const [testing, setTesting] = useState(false);
  const [saving, setSaving] = useState(false);
  const [testResult, setTestResult] = useState(null);
  const [error, setError] = useState(null);
  const [success, setSuccess] = useState(null);
  const [show2FAModal, setShow2FAModal] = useState(false);
  const [pendingProtonPassword, setPendingProtonPassword] = useState('');

  // Form State
  const [form, setForm] = useState({
    provider: 'gmail',
    email: '',
    password: '',
    display_name: '',
    imap_host: '',
    imap_port: 993,
    imap_secure: true,
    smtp_host: '',
    smtp_port: 465,
    smtp_secure: true,
    is_default: false
  });

  const loadData = async () => {
    try {
      setLoading(true);
      const [accRes, presRes] = await Promise.all([
        get('/api/accounts'),
        get('/api/accounts/presets')
      ]);
      setAccounts(accRes.accounts || []);
      setPresets(presRes.presets || {});
    } catch (err) {
      setError(err.message || 'Failed to load accounts.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadData();
  }, []);

  const handleProviderChange = (p) => {
    const preset = presets[p] || presets.custom;
    setForm({
      ...form,
      provider: p,
      imap_host: preset?.imap_host || '',
      imap_port: preset?.imap_port || 993,
      imap_secure: preset?.imap_secure !== undefined ? preset.imap_secure : true,
      smtp_host: preset?.smtp_host || '',
      smtp_port: preset?.smtp_port || 465,
      smtp_secure: preset?.smtp_secure !== undefined ? preset.smtp_secure : true
    });
    setTestResult(null);
  };

  const handleTest = async (e) => {
    e.preventDefault();
    if (!form.email || !form.password) {
      setError('Please enter both email and password / App Password.');
      return;
    }
    try {
      setTesting(true);
      setError(null);
      setTestResult(null);
      const res = await post('/api/accounts/test', form);
      setTestResult(res.testResults);
    } catch (err) {
      setError(err.message || 'Connection test failed.');
    } finally {
      setTesting(false);
    }
  };

  const handleConnect = async (e) => {
    e.preventDefault();
    try {
      setSaving(true);
      setError(null);
      setSuccess(null);

      // Direct Proton Mail SRP-6a & OpenPGP Flow
      if (form.provider === 'proton') {
        setPendingProtonPassword(form.password);
        const loginRes = await protonClient.login(form.email, form.password);
        if (loginRes.requires2FA) {
          setShow2FAModal(true);
          setSaving(false);
          return;
        }
      }

      await post('/api/accounts/connect', form);
      setSuccess(`Connected ${form.email} successfully!`);
      setForm({
        provider: 'gmail',
        email: '',
        password: '',
        display_name: '',
        imap_host: '',
        imap_port: 993,
        imap_secure: true,
        smtp_host: '',
        smtp_port: 465,
        smtp_secure: true,
        is_default: false
      });
      setTestResult(null);
      await loadData();
    } catch (err) {
      setError(err.message || 'Failed to connect account.');
    } finally {
      setSaving(false);
    }
  };

  const handle2FASubmit = async (totpCode) => {
    try {
      setSaving(true);
      setError(null);
      await protonClient.submit2FA(totpCode, pendingProtonPassword);
      setShow2FAModal(false);
      await post('/api/accounts/connect', form);
      setSuccess(`Connected ${form.email} with 2FA successfully!`);
      setForm({
        provider: 'gmail',
        email: '',
        password: '',
        display_name: '',
        imap_host: '',
        imap_port: 993,
        imap_secure: true,
        smtp_host: '',
        smtp_port: 465,
        smtp_secure: true,
        is_default: false
      });
      setPendingProtonPassword('');
      await loadData();
    } catch (err) {
      setError(err.message || 'Proton 2FA verification failed.');
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (id, email) => {
    if (!window.confirm(`Disconnect and remove ${email}?`)) return;
    try {
      await del(`/api/accounts/${id}`);
      await loadData();
    } catch (err) {
      setError(err.message || 'Failed to disconnect account.');
    }
  };

  const handleSetDefault = async (id) => {
    try {
      await put(`/api/accounts/${id}/default`);
      await loadData();
    } catch (err) {
      setError(err.message || 'Failed to set default account.');
    }
  };

  return (
    <div className="settings-section">
      <div className="section-header">
        <h2>Connected Accounts & External Inboxes</h2>
        <p className="text-secondary">
          Connect your existing <strong>Gmail, Microsoft Outlook, Yahoo, Fastmail, or Custom IMAP</strong> accounts to manage all your mailboxes in WoxMail with full encryption.
        </p>
      </div>

      {error && <div className="toast toast-error" style={{ position: 'static', marginBottom: '1rem', width: '100%' }}>{error}</div>}
      {success && <div className="toast toast-success" style={{ position: 'static', marginBottom: '1rem', width: '100%' }}>{success}</div>}

      {/* Connected Accounts List */}
      <div className="card" style={{ marginBottom: '2rem' }}>
        <h3 style={{ marginBottom: '1rem' }}>Active Accounts ({accounts.length})</h3>
        {loading ? (
          <p className="text-secondary">Loading accounts...</p>
        ) : accounts.length === 0 ? (
          <p className="text-secondary">No external accounts connected yet. Connect your first account below.</p>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
            {accounts.map((acc) => (
              <div
                key={acc.id}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  padding: '1rem',
                  background: 'var(--color-bg-elevated)',
                  borderRadius: 'var(--radius-md)',
                  border: '1px solid var(--color-border)'
                }}
              >
                <div style={{ display: 'flex', alignItems: 'center', gap: '0.875rem' }}>
                  <div
                    style={{
                      width: 12,
                      height: 12,
                      borderRadius: '50%',
                      backgroundColor: acc.color || 'var(--color-primary)'
                    }}
                  />
                  <div>
                    <div style={{ fontWeight: 600, display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                      <span>{acc.email}</span>
                      {acc.is_default && <span className="badge badge-purple" style={{ fontSize: '0.6875rem' }}>Default</span>}
                      <span className="badge" style={{ fontSize: '0.6875rem', textTransform: 'uppercase' }}>{acc.provider}</span>
                    </div>
                    <div className="text-secondary" style={{ fontSize: '0.75rem' }}>
                      IMAP: {acc.imap_host}:{acc.imap_port} · SMTP: {acc.smtp_host}:{acc.smtp_port}
                    </div>
                  </div>
                </div>

                <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                  {!acc.is_default && (
                    <button
                      className="btn btn-ghost btn-sm"
                      onClick={() => handleSetDefault(acc.id)}
                    >
                      Set as Default
                    </button>
                  )}
                  <button
                    className="btn btn-danger btn-sm"
                    onClick={() => handleDelete(acc.id, acc.email)}
                  >
                    Disconnect
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Connect New Account Form */}
      <div className="card">
        <h3 style={{ marginBottom: '1rem' }}>Connect New Email Account</h3>

        {/* Provider Select Pills */}
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.5rem', marginBottom: '1.5rem' }}>
          {['gmail', 'outlook', 'yahoo', 'fastmail', 'proton', 'custom'].map((p) => (
            <button
              key={p}
              type="button"
              className={`btn btn-sm ${form.provider === p ? 'btn-primary' : 'btn-secondary'}`}
              onClick={() => handleProviderChange(p)}
              style={{ textTransform: 'capitalize' }}
            >
              {p === 'proton' ? 'Proton Mail (Direct API)' : p === 'custom' ? 'Custom IMAP' : p}
            </button>
          ))}
        </div>

        {presets[form.provider]?.auth_help && (
          <div style={{ padding: '0.75rem 1rem', background: 'var(--color-bg-page)', borderRadius: 'var(--radius-md)', border: '1px solid var(--color-border)', marginBottom: '1.5rem', fontSize: '0.8125rem' }}>
            ℹ️ <strong>Setup Tip:</strong> {presets[form.provider].auth_help}
          </div>
        )}

        <form onSubmit={handleConnect}>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: '1rem', marginBottom: '1rem' }}>
            <div>
              <label style={{ display: 'block', marginBottom: '0.4rem', fontSize: '0.875rem' }}>Email Address</label>
              <input
                type="email"
                className="input"
                required
                placeholder="your.name@gmail.com"
                value={form.email}
                onChange={(e) => setForm({ ...form, email: e.target.value })}
              />
            </div>

            <div>
              <label style={{ display: 'block', marginBottom: '0.4rem', fontSize: '0.875rem' }}>Password / App Password</label>
              <input
                type="password"
                className="input"
                required
                placeholder="••••••••••••••••"
                value={form.password}
                onChange={(e) => setForm({ ...form, password: e.target.value })}
              />
            </div>
          </div>

          {form.provider === 'custom' && (
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '1rem', marginBottom: '1rem' }}>
              <div>
                <label style={{ display: 'block', marginBottom: '0.4rem', fontSize: '0.875rem' }}>IMAP Host</label>
                <input
                  type="text"
                  className="input"
                  required
                  placeholder="imap.mail.com"
                  value={form.imap_host}
                  onChange={(e) => setForm({ ...form, imap_host: e.target.value })}
                />
              </div>
              <div>
                <label style={{ display: 'block', marginBottom: '0.4rem', fontSize: '0.875rem' }}>IMAP Port</label>
                <input
                  type="number"
                  className="input"
                  value={form.imap_port}
                  onChange={(e) => setForm({ ...form, imap_port: parseInt(e.target.value, 10) })}
                />
              </div>
              <div>
                <label style={{ display: 'block', marginBottom: '0.4rem', fontSize: '0.875rem' }}>SMTP Host</label>
                <input
                  type="text"
                  className="input"
                  required
                  placeholder="smtp.mail.com"
                  value={form.smtp_host}
                  onChange={(e) => setForm({ ...form, smtp_host: e.target.value })}
                />
              </div>
              <div>
                <label style={{ display: 'block', marginBottom: '0.4rem', fontSize: '0.875rem' }}>SMTP Port</label>
                <input
                  type="number"
                  className="input"
                  value={form.smtp_port}
                  onChange={(e) => setForm({ ...form, smtp_port: parseInt(e.target.value, 10) })}
                />
              </div>
            </div>
          )}

          {testResult && (
            <div style={{ padding: '0.875rem', background: 'var(--color-bg-page)', borderRadius: 'var(--radius-md)', border: '1px solid var(--color-border)', marginBottom: '1.25rem', fontSize: '0.8125rem' }}>
              <div style={{ color: testResult.imap.success ? 'var(--color-success)' : 'var(--color-error)' }}>
                {testResult.imap.success ? '✓ IMAP Authentication Succeeded' : `✗ IMAP Error: ${testResult.imap.error}`}
              </div>
              <div style={{ color: testResult.smtp.success ? 'var(--color-success)' : 'var(--color-error)', marginTop: '0.25rem' }}>
                {testResult.smtp.success ? '✓ SMTP Handshake Succeeded' : `✗ SMTP Error: ${testResult.smtp.error}`}
              </div>
            </div>
          )}

          <div style={{ display: 'flex', gap: '0.75rem' }}>
            <button
              type="button"
              className="btn btn-secondary"
              disabled={testing || saving}
              onClick={handleTest}
            >
              {testing ? 'Testing...' : 'Test Connection'}
            </button>
            <button
              type="submit"
              className="btn btn-primary"
              disabled={testing || saving}
            >
              {saving ? 'Connecting...' : 'Connect Account'}
            </button>
          </div>
        </form>
      </div>

      {show2FAModal && (
        <Proton2FAModal
          onSubmit={handle2FASubmit}
          onCancel={() => setShow2FAModal(false)}
          loading={saving}
        />
      )}
    </div>
  );
}
