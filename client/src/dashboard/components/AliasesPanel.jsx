import React, { useState, useEffect } from 'react';
import { apiFetch } from '../../shared/api.js';
import { formatDate } from '../../shared/utils/formatters.js';

/**
 * Email Aliases panel — generate and manage hide-my-email addresses.
 */
export default function AliasesPanel() {
  const [aliases, setAliases] = useState([]);
  const [adding, setAdding] = useState(false);
  const [note, setNote] = useState('');
  const [style, setStyle] = useState('random');
  const [domainChoice, setDomainChoice] = useState('main');
  const [customHandle, setCustomHandle] = useState('');
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    loadAliases();
  }, []);

  async function loadAliases() {
    try {
      const data = await apiFetch('/api/aliases');
      setAliases(data.aliases || []);
    } catch (err) {
      console.error('Failed to load aliases:', err);
    } finally {
      setLoading(false);
    }
  }

  async function handleCreate() {
    try {
      await apiFetch('/api/aliases', {
        method: 'POST',
        body: JSON.stringify({
          note: note || null,
          style,
          domainChoice,
          customHandle: style === 'custom' ? customHandle : null,
        }),
      });
      setNote('');
      setCustomHandle('');
      setAdding(false);
      loadAliases();
    } catch (err) {
      console.error('Failed to create alias:', err);
      if (window.WoxToast) window.WoxToast.error(err.message || 'Failed to create alias');
    }
  }

  async function handleToggle(alias) {
    try {
      await apiFetch(`/api/aliases/${alias.id}`, {
        method: 'PUT',
        body: JSON.stringify({ enabled: !alias.enabled }),
      });
      loadAliases();
    } catch (err) {
      console.error('Failed to toggle alias:', err);
    }
  }

  async function handleDelete(id) {
    if (!confirm('Delete this alias? Emails sent to it will stop forwarding.')) return;
    try {
      await apiFetch(`/api/aliases/${id}`, { method: 'DELETE' });
      loadAliases();
    } catch (err) {
      console.error('Failed to delete alias:', err);
    }
  }

  function copyAlias(address) {
    navigator.clipboard.writeText(address);
    if (window.WoxToast) window.WoxToast.success('Alias copied!');
  }

  return (
    <div className="aliases-panel">
      <div className="aliases-header">
        <h3>Aliases</h3>
        <button className="btn btn-sm btn-ghost" onClick={() => setAdding(!adding)} style={{ display: 'inline-flex', alignItems: 'center', justifyContent: 'center', width: 28, height: 28, padding: 0 }}>
          {adding ? (
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
          ) : (
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>
          )}
        </button>
      </div>

      {adding && (
        <div className="aliases-add-form" style={{ display: 'flex', flexDirection: 'column', gap: '0.45rem', padding: '0.75rem', background: 'var(--color-bg-elevated)', borderRadius: 'var(--radius-md)', border: '1px solid var(--color-border)', marginBottom: '0.75rem' }}>
          <input
            placeholder="Note (e.g., For newsletters)"
            value={note}
            onChange={(e) => setNote(e.target.value)}
            className="input-field input"
            style={{ fontSize: '0.8rem' }}
          />

          <div style={{ display: 'flex', gap: '0.35rem' }}>
            <select
              className="input-field input"
              value={domainChoice}
              onChange={(e) => setDomainChoice(e.target.value)}
              style={{ fontSize: '0.75rem', flex: 1 }}
              title="Target domain"
            >
              <option value="main">@wox.world (Primary)</option>
              <option value="mail">@mail.wox.world (Subdomain)</option>
              <option value="subdomain">@username.wox.world</option>
            </select>

            <select
              className="input-field input"
              value={style}
              onChange={(e) => setStyle(e.target.value)}
              style={{ fontSize: '0.75rem', flex: 1 }}
            >
              <option value="random">Random (hex)</option>
              <option value="words">Words (adjective.noun)</option>
              <option value="custom">Custom Handle</option>
            </select>
          </div>

          {style === 'custom' && (
            <input
              placeholder="custom-alias-name"
              value={customHandle}
              onChange={(e) => setCustomHandle(e.target.value.toLowerCase().replace(/[^a-z0-9._-]/g, ''))}
              className="input-field input mono"
              style={{ fontSize: '0.8rem' }}
              autoFocus
            />
          )}

          <button
            className="btn btn-sm btn-primary"
            onClick={handleCreate}
            disabled={style === 'custom' && customHandle.trim().length < 2}
            style={{ marginTop: '0.2rem' }}
          >
            Create Alias
          </button>
        </div>
      )}

      <div className="aliases-list">
        {loading ? (
          <div className="aliases-loading">Loading...</div>
        ) : aliases.length === 0 ? (
          <div className="aliases-empty">
            <p>No aliases yet</p>
            <p className="text-muted">Create hide-my-email addresses</p>
          </div>
        ) : (
          aliases.map((alias) => (
            <div key={alias.id} className={`alias-item ${alias.enabled ? '' : 'disabled'}`}>
              <div className="alias-info">
                <div className="alias-address" onClick={() => copyAlias(alias.alias_address)}>
                  {alias.alias_address}
                </div>
                {alias.note && <div className="alias-note">{alias.note}</div>}
                <div className="alias-meta">
                  {alias.emails_received} received · {formatDate(alias.created_at)}
                </div>
              </div>
              <div className="alias-actions">
                <button
                  className={`alias-toggle ${alias.enabled ? 'on' : 'off'}`}
                  onClick={() => handleToggle(alias)}
                  title={alias.enabled ? 'Disable' : 'Enable'}
                >
                  {alias.enabled ? (
      <span className="badge badge-green" style={{ fontSize: '0.65rem' }}>Active</span>
    ) : (
      <span className="badge badge-red" style={{ fontSize: '0.65rem' }}>Disabled</span>
    )}
                </button>
                <button className="alias-delete" onClick={() => handleDelete(alias.id)} title="Delete">
                  <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M3 6h18"/><path d="M19 6v14c0 1-1 2-2 2H7c-1 0-2-1-2-2V6"/><path d="M8 6V4c0-1 1-2 2-2h4c1 0 2 1 2 2v2"/></svg>
                </button>
              </div>
            </div>
          ))
        )}
      </div>
    </div>
  );
}
