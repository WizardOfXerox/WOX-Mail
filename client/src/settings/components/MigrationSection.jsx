import React, { useState, useEffect, useRef } from 'react';
import { post, get } from '../../shared/api.js';

export default function MigrationSection() {
  const [formData, setFormData] = useState({
    host: '',
    port: 993,
    secure: true,
    username: '',
    password: '',
  });

  const [connecting, setConnecting] = useState(false);
  const [connectError, setConnectError] = useState('');
  const [discoveredFolders, setDiscoveredFolders] = useState([]);
  const [folderMappings, setFolderMappings] = useState([]);

  const [starting, setStarting] = useState(false);
  const [startError, setStartError] = useState('');
  const [migrationStatus, setMigrationStatus] = useState(null);
  const [cancelling, setCancelling] = useState(false);

  const pollIntervalRef = useRef(null);

  // Poll migration status
  const fetchStatus = async () => {
    try {
      const res = await get('/mail/migration/status');
      if (res) {
        setMigrationStatus(res);
      }
    } catch {
      // ignore transient poll errors
    }
  };

  useEffect(() => {
    fetchStatus();
    pollIntervalRef.current = setInterval(fetchStatus, 3000);
    return () => {
      if (pollIntervalRef.current) clearInterval(pollIntervalRef.current);
    };
  }, []);

  const handleConnect = async (e) => {
    e.preventDefault();
    setConnecting(true);
    setConnectError('');
    try {
      const res = await post('/mail/migration/connect', {
        host: formData.host.trim(),
        port: parseInt(formData.port, 10) || 993,
        secure: formData.secure,
        username: formData.username.trim(),
        password: formData.password,
      });

      if (res && res.success) {
        setDiscoveredFolders(res.folders || []);
        const mappings = (res.recommendedMapping || []).map((m) => ({
          enabled: true,
          source: m.source,
          target: m.target,
        }));
        setFolderMappings(mappings);
      } else {
        setConnectError(res?.error || 'Failed to connect to source server.');
      }
    } catch (err) {
      setConnectError(err.message || 'Connection failed.');
    } finally {
      setConnecting(false);
    }
  };

  const handleStartMigration = async () => {
    const selected = folderMappings
      .filter((m) => m.enabled)
      .map((m) => ({ source: m.source, target: m.target }));

    if (selected.length === 0) {
      setStartError('Please select at least one folder to migrate.');
      return;
    }

    setStarting(true);
    setStartError('');
    try {
      const res = await post('/mail/migration/start', {
        host: formData.host.trim(),
        port: parseInt(formData.port, 10) || 993,
        secure: formData.secure,
        username: formData.username.trim(),
        password: formData.password,
        folderMapping: selected,
      });

      if (res && res.success) {
        fetchStatus();
      } else {
        setStartError(res?.error || 'Failed to launch migration.');
      }
    } catch (err) {
      setStartError(err.message || 'Failed to start migration.');
    } finally {
      setStarting(false);
    }
  };

  const handleCancelMigration = async () => {
    if (!window.confirm('Are you sure you want to halt this mailbox migration?')) return;
    setCancelling(true);
    try {
      await post('/mail/migration/cancel');
      fetchStatus();
    } catch (err) {
      alert(err.message || 'Failed to cancel migration.');
    } finally {
      setCancelling(false);
    }
  };

  const toggleFolder = (index) => {
    setFolderMappings((prev) =>
      prev.map((item, idx) => (idx === index ? { ...item, enabled: !item.enabled } : item))
    );
  };

  const updateTargetFolder = (index, targetVal) => {
    setFolderMappings((prev) =>
      prev.map((item, idx) => (idx === index ? { ...item, target: targetVal } : item))
    );
  };

  const isRunning = migrationStatus && migrationStatus.status === 'running';
  const progressPercent =
    migrationStatus && migrationStatus.totalMessages > 0
      ? Math.min(100, Math.round((migrationStatus.migratedMessages / migrationStatus.totalMessages) * 100))
      : 0;

  return (
    <div className="card settings-section" style={{ maxWidth: '820px', margin: '0 auto' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', marginBottom: '1.25rem' }}>
        <div style={{
          width: '38px',
          height: '38px',
          borderRadius: '10px',
          background: 'var(--color-primary-glow)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          color: 'var(--color-primary-light)'
        }}>
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <polyline points="16 3 21 3 21 8" />
            <line x1="4" y1="20" x2="21" y2="3" />
            <polyline points="21 16 21 21 16 21" />
            <line x1="15" y1="15" x2="21" y2="21" />
            <line x1="4" y1="4" x2="9" y2="9" />
          </svg>
        </div>
        <div>
          <h2 style={{ margin: 0, fontSize: '1.25rem', fontWeight: 600 }}>
            Mailbox Migration
          </h2>
          <p className="text-secondary" style={{ margin: '0.2rem 0 0 0', fontSize: '0.85rem' }}>
            Migrate messages and folder hierarchies from Gmail, Outlook, Yahoo, or any standard IMAP server into WoxMail.
          </p>
        </div>
      </div>

      {/* Active Migration Status Banner */}
      {migrationStatus && migrationStatus.status !== 'idle' && (
        <div style={{
          padding: '1.25rem',
          borderRadius: 'var(--radius-md)',
          background: 'var(--color-bg-elevated)',
          border: '1px solid var(--color-border)',
          marginBottom: '1.5rem',
        }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.75rem' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.6rem' }}>
              <span style={{ fontWeight: 600, fontSize: '0.95rem' }}>Migration Status:</span>
              <span className={`badge ${
                isRunning ? 'badge-purple' : migrationStatus.status === 'completed' ? 'badge-green' : 'badge-amber'
              }`}>
                [{migrationStatus.status.toUpperCase()}]
              </span>
            </div>
            {isRunning && (
              <button
                type="button"
                className="btn btn-ghost btn-sm"
                onClick={handleCancelMigration}
                disabled={cancelling}
                style={{ color: 'var(--color-error)' }}
              >
                {cancelling ? 'Halting...' : 'Cancel Migration'}
              </button>
            )}
          </div>

          <div style={{ marginBottom: '0.6rem' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.8125rem', color: 'var(--color-text-secondary)', marginBottom: '0.35rem' }}>
              <span>Folder: <strong>{migrationStatus.currentFolder || 'Preparing...'}</strong> ({migrationStatus.completedFolders || 0}/{migrationStatus.totalFolders || 0})</span>
              <span>{migrationStatus.migratedMessages || 0} / {migrationStatus.totalMessages || 0} messages ({progressPercent}%)</span>
            </div>
            <div style={{
              width: '100%',
              height: '8px',
              borderRadius: '4px',
              background: 'var(--color-bg-input)',
              overflow: 'hidden'
            }}>
              <div style={{
                height: '100%',
                width: `${progressPercent}%`,
                background: isRunning ? 'linear-gradient(90deg, var(--color-primary), var(--color-primary-light))' : 'var(--color-success)',
                transition: 'width 0.4s ease'
              }} />
            </div>
          </div>

          {migrationStatus.error && (
            <div style={{ color: 'var(--color-error)', fontSize: '0.8125rem', marginTop: '0.5rem' }}>
              [ERROR]: {migrationStatus.error}
            </div>
          )}
        </div>
      )}

      {/* Step 1: Connect Source IMAP */}
      <form onSubmit={handleConnect} style={{ marginBottom: '1.5rem' }}>
        <h3 style={{ fontSize: '1rem', fontWeight: 600, marginBottom: '0.75rem' }}>
          Step 1: Connect Source IMAP Server
        </h3>

        <div style={{ display: 'grid', gridTemplateColumns: '1fr 140px', gap: '0.75rem', marginBottom: '0.75rem' }}>
          <div>
            <label className="text-secondary" style={{ fontSize: '0.8125rem', display: 'block', marginBottom: '0.25rem' }}>
              IMAP Server Host
            </label>
            <input
              type="text"
              className="input"
              placeholder="e.g. imap.gmail.com"
              value={formData.host}
              onChange={(e) => setFormData({ ...formData, host: e.target.value })}
              required
            />
          </div>
          <div>
            <label className="text-secondary" style={{ fontSize: '0.8125rem', display: 'block', marginBottom: '0.25rem' }}>
              Port
            </label>
            <input
              type="number"
              className="input"
              value={formData.port}
              onChange={(e) => setFormData({ ...formData, port: e.target.value })}
              required
            />
          </div>
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.75rem', marginBottom: '0.75rem' }}>
          <div>
            <label className="text-secondary" style={{ fontSize: '0.8125rem', display: 'block', marginBottom: '0.25rem' }}>
              Username / Email
            </label>
            <input
              type="text"
              className="input"
              placeholder="user@example.com"
              value={formData.username}
              onChange={(e) => setFormData({ ...formData, username: e.target.value })}
              required
            />
          </div>
          <div>
            <label className="text-secondary" style={{ fontSize: '0.8125rem', display: 'block', marginBottom: '0.25rem' }}>
              Password / App Password
            </label>
            <input
              type="password"
              className="input"
              placeholder="••••••••••••"
              value={formData.password}
              onChange={(e) => setFormData({ ...formData, password: e.target.value })}
              required
            />
          </div>
        </div>

        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginTop: '1rem' }}>
          <label style={{ display: 'inline-flex', alignItems: 'center', gap: '0.5rem', fontSize: '0.875rem', cursor: 'pointer' }}>
            <input
              type="checkbox"
              checked={formData.secure}
              onChange={(e) => setFormData({ ...formData, secure: e.target.checked })}
            />
            <span>Use TLS / SSL (Port 993)</span>
          </label>

          <button
            type="submit"
            className="btn btn-secondary"
            disabled={connecting || isRunning}
          >
            {connecting ? 'Testing Connection...' : 'Test Connection & Discover Folders'}
          </button>
        </div>

        {connectError && (
          <div style={{ color: 'var(--color-error)', fontSize: '0.8125rem', marginTop: '0.75rem' }}>
            [FAIL]: {connectError}
          </div>
        )}
      </form>

      {/* Step 2: Folder Selection & Mapping */}
      {discoveredFolders.length > 0 && (
        <div style={{
          paddingTop: '1.25rem',
          borderTop: '1px solid var(--color-border)',
          marginBottom: '1.5rem',
        }}>
          <h3 style={{ fontSize: '1rem', fontWeight: 600, marginBottom: '0.5rem' }}>
            Step 2: Map & Select Folders ({discoveredFolders.length} Discovered)
          </h3>
          <p className="text-secondary" style={{ fontSize: '0.8125rem', marginBottom: '1rem' }}>
            Select which folders to migrate and customize their destination folder names in your WoxMail mailbox.
          </p>

          <div style={{ maxHeight: '280px', overflowY: 'auto', border: '1px solid var(--color-border)', borderRadius: 'var(--radius-md)', padding: '0.5rem' }}>
            {folderMappings.map((mapping, idx) => (
              <div
                key={mapping.source}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: '0.75rem',
                  padding: '0.5rem 0.75rem',
                  borderBottom: idx < folderMappings.length - 1 ? '1px solid var(--color-border)' : 'none',
                  background: mapping.enabled ? 'transparent' : 'rgba(0,0,0,0.15)',
                  opacity: mapping.enabled ? 1 : 0.6
                }}
              >
                <input
                  type="checkbox"
                  checked={mapping.enabled}
                  onChange={() => toggleFolder(idx)}
                />
                <div style={{ flex: 1, minWidth: '140px', fontWeight: 500, fontSize: '0.875rem' }}>
                  {mapping.source}
                </div>
                <div style={{ color: 'var(--color-text-tertiary)', fontSize: '0.8125rem' }}>&rarr;</div>
                <div style={{ flex: 1 }}>
                  <input
                    type="text"
                    className="input"
                    value={mapping.target}
                    onChange={(e) => updateTargetFolder(idx, e.target.value)}
                    style={{ padding: '0.35rem 0.6rem', fontSize: '0.8125rem' }}
                    disabled={!mapping.enabled}
                  />
                </div>
              </div>
            ))}
          </div>

          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: '1rem' }}>
            <span className="text-secondary" style={{ fontSize: '0.8125rem' }}>
              {folderMappings.filter((m) => m.enabled).length} of {folderMappings.length} folders selected
            </span>
            <button
              type="button"
              className="btn btn-primary"
              onClick={handleStartMigration}
              disabled={starting || isRunning}
            >
              {starting ? 'Starting Migration...' : 'Start Mailbox Migration'}
            </button>
          </div>

          {startError && (
            <div style={{ color: 'var(--color-error)', fontSize: '0.8125rem', marginTop: '0.75rem' }}>
              [FAIL]: {startError}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
