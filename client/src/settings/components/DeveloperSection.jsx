import React, { useState, useEffect } from 'react';
import { get, post, del } from '../../shared/api.js';

export default function DeveloperSection() {
  const [apiKeys, setApiKeys] = useState([]);
  const [loading, setLoading] = useState(true);
  const [name, setName] = useState('');
  const [scopes, setScopes] = useState(['mail:read', 'mail:send']);
  const [createdKey, setCreatedKey] = useState(null);
  const [error, setError] = useState(null);
  const [copied, setCopied] = useState(false);

  const loadKeys = async () => {
    try {
      setLoading(true);
      const res = await get('/api/settings/api-keys');
      setApiKeys(res.apiKeys || []);
    } catch (err) {
      setError(err.message || 'Failed to load API keys.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadKeys();
  }, []);

  const handleCreateKey = async (e) => {
    e.preventDefault();
    if (!name) return;
    try {
      setError(null);
      const res = await post('/api/settings/api-keys', { name, scopes });
      setCreatedKey(res.apiKey);
      setName('');
      await loadKeys();
    } catch (err) {
      setError(err.message || 'Failed to generate API key.');
    }
  };

  const handleRevoke = async (id, keyName) => {
    if (!window.confirm(`Revoke API key "${keyName}"? Any scripts using it will stop working.`)) return;
    try {
      await del(`/api/settings/api-keys/${id}`);
      await loadKeys();
    } catch (err) {
      setError(err.message || 'Failed to revoke key.');
    }
  };

  const copyToClipboard = (text) => {
    navigator.clipboard.writeText(text);
    setCopied(true);
    setTimeout(() => setCopied(false), 3000);
  };

  return (
    <div className="settings-section">
      <div className="section-header">
        <h2>Developer Arsenal & Personal API Keys</h2>
        <p className="text-secondary">
          Generate scoped REST API tokens for command-line scripts, Raycast extensions, and custom automated email workflows.
        </p>
      </div>

      {error && <div className="toast toast-error" style={{ position: 'static', marginBottom: '1rem', width: '100%' }}>{error}</div>}

      {/* Newly Created Key Banner */}
      {createdKey?.secretKey && (
        <div style={{ padding: '1.25rem', background: 'rgba(124, 58, 237, 0.15)', border: '2px solid var(--color-primary)', borderRadius: 'var(--radius-md)', marginBottom: '1.5rem' }}>
          <strong style={{ display: 'block', color: 'var(--color-primary-light)', marginBottom: '0.4rem' }}>
            ⚠️ Save Your API Key Now (It will never be shown again)
          </strong>
          <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'center', marginTop: '0.5rem' }}>
            <input
              type="text"
              readOnly
              className="input mono"
              value={createdKey.secretKey}
              style={{ flex: 1, background: 'var(--color-bg-page)', fontSize: '0.875rem' }}
            />
            <button className="btn btn-primary btn-sm" onClick={() => copyToClipboard(createdKey.secretKey)}>
              {copied ? '✓ Copied' : 'Copy Key'}
            </button>
          </div>
        </div>
      )}

      {/* Active API Keys List */}
      <div className="card" style={{ marginBottom: '2rem' }}>
        <h3 style={{ marginBottom: '1rem' }}>Active Personal API Keys ({apiKeys.length})</h3>
        {loading ? (
          <p className="text-secondary">Loading keys...</p>
        ) : apiKeys.length === 0 ? (
          <p className="text-secondary">No API keys created yet. Generate one below.</p>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
            {apiKeys.map((key) => (
              <div
                key={key.id}
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
                <div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '0.25rem' }}>
                    <strong>{key.name}</strong>
                    <code className="mono" style={{ fontSize: '0.75rem', background: 'var(--color-bg-page)', padding: '2px 6px', borderRadius: 4 }}>
                      {key.key_prefix}••••••••
                    </code>
                  </div>
                  <div className="text-secondary" style={{ fontSize: '0.75rem' }}>
                    Scopes: {key.scopes?.join(', ') || 'all'} · Created: {new Date(key.created_at).toLocaleDateString()}
                  </div>
                </div>
                <button className="btn btn-danger btn-sm" onClick={() => handleRevoke(key.id, key.name)}>Revoke</button>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Generate API Key Form */}
      <div className="card">
        <h3 style={{ marginBottom: '1rem' }}>Generate New API Key</h3>
        <form onSubmit={handleCreateKey}>
          <div style={{ marginBottom: '1rem' }}>
            <label style={{ display: 'block', marginBottom: '0.4rem', fontSize: '0.875rem' }}>Key Name / Description</label>
            <input
              type="text"
              className="input"
              required
              placeholder="e.g. My Backup Script or Raycast Extension"
              value={name}
              onChange={(e) => setName(e.target.value)}
            />
          </div>

          <div style={{ marginBottom: '1.25rem' }}>
            <label style={{ display: 'block', marginBottom: '0.5rem', fontSize: '0.875rem', fontWeight: 600 }}>Scopes & Permissions</label>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: '1rem' }}>
              {[
                { id: 'mail:read', label: 'Read Mail' },
                { id: 'mail:send', label: 'Send Mail' },
                { id: 'contacts:read', label: 'Read Contacts' },
                { id: 'settings:read', label: 'Read Settings' },
              ].map((s) => (
                <label key={s.id} style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', fontSize: '0.875rem', cursor: 'pointer' }}>
                  <input
                    type="checkbox"
                    checked={scopes.includes(s.id)}
                    onChange={(e) => {
                      if (e.target.checked) setScopes([...scopes, s.id]);
                      else setScopes(scopes.filter((sc) => sc !== s.id));
                    }}
                    style={{ accentColor: 'var(--color-primary)' }}
                  />
                  <span>{s.label}</span>
                </label>
              ))}
            </div>
          </div>

          <button type="submit" className="btn btn-primary">Generate API Key</button>
        </form>
      </div>
    </div>
  );
}
