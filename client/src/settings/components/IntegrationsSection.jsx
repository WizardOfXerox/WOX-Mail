import React, { useState, useEffect } from 'react';
import { get, post, del } from '../../shared/api.js';

export default function IntegrationsSection() {
  const [rules, setRules] = useState([]);
  const [loading, setLoading] = useState(true);
  const [testing, setTesting] = useState(false);
  const [saving, setSaving] = useState(false);
  const [testSuccess, setTestSuccess] = useState(null);
  const [error, setError] = useState(null);
  const [success, setSuccess] = useState(null);

  const [form, setForm] = useState({
    platform: 'telegram',
    name: 'My Telegram Alerts',
    bot_token: '',
    chat_id: '',
    webhook_url: '',
    forward_all: true,
    filter_from: ''
  });

  const loadRules = async () => {
    try {
      setLoading(true);
      const res = await get('/api/integrations/chat');
      setRules(res.rules || []);
    } catch (err) {
      setError(err.message || 'Failed to load chat rules.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadRules();
  }, []);

  const handleTest = async () => {
    try {
      setTesting(true);
      setError(null);
      setTestSuccess(null);
      await post('/api/integrations/chat/test', form);
      setTestSuccess('Test message sent successfully! Check your chat app.');
    } catch (err) {
      setError(err.message || 'Test dispatch failed.');
    } finally {
      setTesting(false);
    }
  };

  const handleCreate = async (e) => {
    e.preventDefault();
    try {
      setSaving(true);
      setError(null);
      setSuccess(null);
      await post('/api/integrations/chat', {
        platform: form.platform,
        name: form.name,
        bot_token: form.bot_token,
        chat_id: form.chat_id,
        webhook_url: form.webhook_url,
        filter_criteria: {
          forward_all: form.forward_all,
          from: form.filter_from
        }
      });
      setSuccess('Chat forwarding rule created!');
      setForm({
        platform: 'telegram',
        name: 'My Telegram Alerts',
        bot_token: '',
        chat_id: '',
        webhook_url: '',
        forward_all: true,
        filter_from: ''
      });
      await loadRules();
    } catch (err) {
      setError(err.message || 'Failed to create chat rule.');
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (id) => {
    if (!window.confirm('Delete this chat forwarding rule?')) return;
    try {
      await del(`/api/integrations/chat/${id}`);
      await loadRules();
    } catch (err) {
      setError(err.message || 'Failed to delete rule.');
    }
  };

  return (
    <div className="settings-section">
      <div className="section-header">
        <h2>Chat Platform Forwarding & Alerts</h2>
        <p className="text-secondary">
          Forward incoming emails instantly to <strong>Telegram bots, Discord channels, or Slack channels</strong> ($0 Free unlimited).
        </p>
      </div>

      {error && <div className="toast toast-error" style={{ position: 'static', marginBottom: '1rem', width: '100%' }}>{error}</div>}
      {success && <div className="toast toast-success" style={{ position: 'static', marginBottom: '1rem', width: '100%' }}>{success}</div>}
      {testSuccess && <div className="toast toast-success" style={{ position: 'static', marginBottom: '1rem', width: '100%' }}>{testSuccess}</div>}

      {/* Rules List */}
      <div className="card" style={{ marginBottom: '2rem' }}>
        <h3 style={{ marginBottom: '1rem' }}>Active Forwarding Rules ({rules.length})</h3>
        {loading ? (
          <p className="text-secondary">Loading forwarding rules...</p>
        ) : rules.length === 0 ? (
          <p className="text-secondary">No forwarding rules active yet. Add a chat rule below.</p>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
            {rules.map((rule) => (
              <div
                key={rule.id}
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
                    <strong style={{ textTransform: 'capitalize' }}>{rule.name}</strong>
                    <span className="badge badge-purple" style={{ textTransform: 'uppercase', fontSize: '0.6875rem' }}>{rule.platform}</span>
                  </div>
                  <div className="text-secondary" style={{ fontSize: '0.75rem' }}>
                    Deliveries: {rule.deliveries_count || 0} · Last: {rule.last_delivery_at ? new Date(rule.last_delivery_at).toLocaleString() : 'Never'}
                  </div>
                </div>
                <button className="btn btn-danger btn-sm" onClick={() => handleDelete(rule.id)}>Delete</button>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Create Rule Form */}
      <div className="card">
        <h3 style={{ marginBottom: '1rem' }}>Add Chat Forwarding Rule</h3>

        {/* Platform Selector */}
        <div style={{ display: 'flex', gap: '0.5rem', marginBottom: '1.5rem' }}>
          {[
            { id: 'telegram', name: 'Telegram Bot ($0 Free)' },
            { id: 'discord', name: 'Discord Webhook ($0 Free)' },
            { id: 'slack', name: 'Slack Webhook ($0 Free)' },
          ].map((p) => (
            <button
              key={p.id}
              type="button"
              className={`btn btn-sm ${form.platform === p.id ? 'btn-primary' : 'btn-secondary'}`}
              onClick={() => setForm({ ...form, platform: p.id })}
            >
              {p.name}
            </button>
          ))}
        </div>

        <form onSubmit={handleCreate}>
          <div style={{ marginBottom: '1rem' }}>
            <label style={{ display: 'block', marginBottom: '0.4rem', fontSize: '0.875rem' }}>Rule Name</label>
            <input
              type="text"
              className="input"
              required
              placeholder="e.g. VIP Alerts on Telegram"
              value={form.name}
              onChange={(e) => setForm({ ...form, name: e.target.value })}
            />
          </div>

          {form.platform === 'telegram' ? (
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))', gap: '1rem', marginBottom: '1rem' }}>
              <div>
                <label style={{ display: 'block', marginBottom: '0.4rem', fontSize: '0.875rem' }}>Telegram Bot Token</label>
                <input
                  type="password"
                  className="input"
                  required
                  placeholder="123456789:ABCdefGhIJKlmNoPQRstuVWXyz"
                  value={form.bot_token}
                  onChange={(e) => setForm({ ...form, bot_token: e.target.value })}
                />
              </div>
              <div>
                <label style={{ display: 'block', marginBottom: '0.4rem', fontSize: '0.875rem' }}>Telegram Chat ID</label>
                <input
                  type="text"
                  className="input"
                  required
                  placeholder="e.g. 987654321 or @mychannel"
                  value={form.chat_id}
                  onChange={(e) => setForm({ ...form, chat_id: e.target.value })}
                />
              </div>
            </div>
          ) : (
            <div style={{ marginBottom: '1rem' }}>
              <label style={{ display: 'block', marginBottom: '0.4rem', fontSize: '0.875rem' }}>
                {form.platform === 'discord' ? 'Discord Webhook URL' : 'Slack Webhook URL'}
              </label>
              <input
                type="url"
                className="input"
                required
                placeholder="https://discord.com/api/webhooks/..."
                value={form.webhook_url}
                onChange={(e) => setForm({ ...form, webhook_url: e.target.value })}
              />
            </div>
          )}

          <div style={{ padding: '1rem', background: 'var(--color-bg-page)', borderRadius: 'var(--radius-md)', border: '1px solid var(--color-border)', marginBottom: '1.25rem' }}>
            <label style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', fontSize: '0.875rem', cursor: 'pointer', marginBottom: form.forward_all ? 0 : '0.75rem' }}>
              <input
                type="checkbox"
                checked={form.forward_all}
                onChange={(e) => setForm({ ...form, forward_all: e.target.checked })}
                style={{ width: 16, height: 16, accentColor: 'var(--color-primary)' }}
              />
              <strong>Forward all incoming emails</strong>
            </label>

            {!form.forward_all && (
              <div>
                <label style={{ display: 'block', marginBottom: '0.3rem', fontSize: '0.8125rem' }}>Only forward emails from sender containing:</label>
                <input
                  type="text"
                  className="input"
                  placeholder="e.g. alerts@bank.com or @company.com"
                  value={form.filter_from}
                  onChange={(e) => setForm({ ...form, filter_from: e.target.value })}
                />
              </div>
            )}
          </div>

          <div style={{ display: 'flex', gap: '0.75rem' }}>
            <button
              type="button"
              className="btn btn-secondary"
              disabled={testing || saving}
              onClick={handleTest}
            >
              {testing ? 'Dispatching Test...' : 'Test Alert Dispatch'}
            </button>
            <button
              type="submit"
              className="btn btn-primary"
              disabled={testing || saving}
            >
              {saving ? 'Creating...' : 'Create Forwarding Rule'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
