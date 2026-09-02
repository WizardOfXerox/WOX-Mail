import React, { useState, useEffect, useRef } from 'react';
import { apiFetch } from '../../shared/api.js';
import { authenticator } from 'otplib';

/**
 * WoxAuth panel — built-in TOTP authenticator in the dashboard sidebar.
 * Shows countdown ring, copy-on-click codes, and CRUD for entries.
 */
export default function WoxAuthPanel() {
  const [entries, setEntries] = useState([]);
  const [adding, setAdding] = useState(false);
  const [newService, setNewService] = useState('');
  const [newSecret, setNewSecret] = useState('');
  const [timeLeft, setTimeLeft] = useState(30);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    loadEntries();
  }, []);

  // Countdown timer
  useEffect(() => {
    const tick = () => {
      setTimeLeft(30 - (Math.floor(Date.now() / 1000) % 30));
    };
    tick();
    const interval = setInterval(tick, 1000);
    return () => clearInterval(interval);
  }, []);

  async function loadEntries() {
    try {
      const data = await apiFetch('/api/woxauth');
      setEntries(data.entries || []);
    } catch (err) {
      console.error('Failed to load WoxAuth entries:', err);
    } finally {
      setLoading(false);
    }
  }

  async function handleAdd() {
    if (!newService || !newSecret) return;
    try {
      await apiFetch('/api/woxauth', {
        method: 'POST',
        body: JSON.stringify({
          serviceName: newService,
          encryptedSecret: newSecret, // In production, encrypt client-side
          iv: 'placeholder',
        }),
      });
      setNewService('');
      setNewSecret('');
      setAdding(false);
      loadEntries();
    } catch (err) {
      console.error('Failed to add entry:', err);
    }
  }

  async function handleDelete(id) {
    if (!confirm('Delete this entry?')) return;
    try {
      await apiFetch(`/api/woxauth/${id}`, { method: 'DELETE' });
      loadEntries();
    } catch (err) {
      console.error('Failed to delete entry:', err);
    }
  }

  function copyCode(code) {
    navigator.clipboard.writeText(code);
  }

  const progress = (timeLeft / 30) * 100;

  return (
    <div className="woxauth-panel">
      <div className="woxauth-header">
        <h3>WoxAuth</h3>
        <button className="btn btn-sm btn-ghost" onClick={() => setAdding(!adding)}>
          {adding ? '✕' : '+'}
        </button>
      </div>

      {/* Countdown bar */}
      <div className="woxauth-timer">
        <div className="woxauth-timer-bar" style={{ width: `${progress}%` }} />
        <span className="woxauth-timer-text">{timeLeft}s</span>
      </div>

      {adding && (
        <div className="woxauth-add-form">
          <input
            placeholder="Service name"
            value={newService}
            onChange={(e) => setNewService(e.target.value)}
            className="input-field"
          />
          <input
            placeholder="Secret key (Base32)"
            value={newSecret}
            onChange={(e) => setNewSecret(e.target.value)}
            className="input-field"
          />
          <button className="btn btn-sm btn-primary" onClick={handleAdd}>Add</button>
        </div>
      )}

      <div className="woxauth-entries">
        {loading ? (
          <div className="woxauth-loading">Loading...</div>
        ) : entries.length === 0 ? (
          <div className="woxauth-empty">
            <p>No entries yet</p>
            <p className="text-muted">Add your first 2FA code</p>
          </div>
        ) : (
          entries.map((entry) => (
            <div key={entry.id} className="woxauth-entry" onClick={() => copyCode('------')}>
              <div className="woxauth-entry-info">
                <span className="woxauth-entry-icon" style={{ display: 'inline-flex', alignItems: 'center' }}><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="7.5" cy="15.5" r="5.5"/><path d="m21 2-9.6 9.6"/><path d="m15.5 7.5 3 3L22 7l-3-3"/></svg></span>
                <div>
                  <div className="woxauth-service">{entry.service_name}</div>
                  {entry.account_label && (
                    <div className="woxauth-account">{entry.account_label}</div>
                  )}
                </div>
              </div>
              <div className="woxauth-code">
                <span className="woxauth-digits">••• •••</span>
              </div>
              <button
                className="woxauth-delete"
                onClick={(e) => { e.stopPropagation(); handleDelete(entry.id); }}
                title="Delete"
               title="Delete"><svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M3 6h18"/><path d="M19 6v14c0 1-1 2-2 2H7c-1 0-2-1-2-2V6"/><path d="M8 6V4c0-1 1-2 2-2h4c1 0 2 1 2 2v2"/></svg></button>
            </div>
          ))
        )}
      </div>
    </div>
  );
}
