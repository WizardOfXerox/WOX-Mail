import React, { useState, useEffect } from 'react';
import CampaignComposer from './CampaignComposer.jsx';

/**
 * CampaignsView — WoxNewsletter & Bulk Campaign Broadcaster Dashboard
 */
export default function CampaignsView() {
  const [activeTab, setActiveTab] = useState('campaigns'); // 'campaigns' | 'lists'
  const [campaigns, setCampaigns] = useState([]);
  const [lists, setLists] = useState([]);
  const [loading, setLoading] = useState(true);
  const [isComposing, setIsComposing] = useState(false);

  // New list modal
  const [showNewListModal, setShowNewListModal] = useState(false);
  const [newListName, setNewListName] = useState('');
  const [newListDesc, setNewListDesc] = useState('');

  // CSV Import state
  const [importListId, setImportListId] = useState(null);
  const [csvText, setCsvText] = useState('');
  const [importing, setImporting] = useState(false);

  // Embed form modal
  const [embedHtml, setEmbedHtml] = useState('');

  const fetchCampaigns = async () => {
    try {
      const res = await fetch('/api/campaigns', { credentials: 'include' });
      const data = await res.json();
      setCampaigns(data.campaigns || []);
    } catch (err) {
      console.error('Failed to fetch campaigns', err);
    }
  };

  const fetchLists = async () => {
    try {
      const res = await fetch('/api/campaigns/lists', { credentials: 'include' });
      const data = await res.json();
      setLists(data.lists || []);
    } catch (err) {
      console.error('Failed to fetch mailing lists', err);
    }
  };

  useEffect(() => {
    setLoading(true);
    Promise.all([fetchCampaigns(), fetchLists()]).finally(() => setLoading(false));
  }, []);

  const handleCreateList = async (e) => {
    e.preventDefault();
    if (!newListName.trim()) return;
    try {
      const res = await fetch('/api/campaigns/lists', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ name: newListName.trim(), description: newListDesc.trim() }),
      });
      const data = await res.json();
      if (data.success) {
        setShowNewListModal(false);
        setNewListName('');
        setNewListDesc('');
        fetchLists();
      }
    } catch (err) {
      alert('Failed to create list: ' + err.message);
    }
  };

  const handleStartBroadcast = async (campaignId) => {
    if (!confirm('Are you sure you want to broadcast this campaign to all active subscribers?')) return;
    try {
      const res = await fetch(`/api/campaigns/${campaignId}/send`, {
        method: 'POST',
        credentials: 'include',
      });
      const data = await res.json();
      if (data.success) {
        alert('Campaign broadcast started! Emails are being dispatched.');
        fetchCampaigns();
      }
    } catch (err) {
      alert('Failed to start broadcast: ' + err.message);
    }
  };

  const handleCsvImport = async (e) => {
    e.preventDefault();
    if (!csvText.trim() || !importListId) return;

    // Parse simple CSV rows
    const lines = csvText.trim().split('\n');
    const subscribers = [];

    for (let i = 0; i < lines.length; i++) {
      const line = lines[i].trim();
      if (!line) continue;
      const parts = line.split(',').map((p) => p.trim().replace(/^["']|["']$/g, ''));
      if (parts[0] && parts[0].includes('@')) {
        subscribers.push({
          email: parts[0],
          first_name: parts[1] || '',
          last_name: parts[2] || '',
        });
      }
    }

    if (subscribers.length === 0) {
      alert('No valid email addresses found in the CSV text.');
      return;
    }

    setImporting(true);
    try {
      const res = await fetch(`/api/campaigns/lists/${importListId}/import`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ subscribers }),
      });
      const data = await res.json();
      if (data.success) {
        alert(`✓ Successfully imported ${data.imported} subscribers! (${data.skipped} skipped)`);
        setImportListId(null);
        setCsvText('');
        fetchLists();
      }
    } catch (err) {
      alert('Failed to import subscribers: ' + err.message);
    } finally {
      setImporting(false);
    }
  };

  const showEmbedCode = async (listId) => {
    try {
      const res = await fetch(`/api/campaigns/lists/${listId}/embed`, { credentials: 'include' });
      const data = await res.json();
      setEmbedHtml(data.html);
    } catch (err) {
      alert('Failed to load embed form');
    }
  };

  if (isComposing) {
    return (
      <div style={{ flex: 1, padding: '2rem', height: '100vh', overflowY: 'auto', background: 'var(--color-bg-page)' }}>
        <CampaignComposer
          lists={lists}
          onSave={() => {
            setIsComposing(false);
            fetchCampaigns();
          }}
          onCancel={() => setIsComposing(false)}
        />
      </div>
    );
  }

  return (
    <div className="campaigns-view" style={{ flex: 1, display: 'flex', flexDirection: 'column', height: '100vh', overflowY: 'auto', background: 'var(--color-bg-page)' }}>
      {/* Header Bar */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '1.25rem 1.5rem', borderBottom: '1px solid var(--color-border)', background: 'var(--color-bg-card)', flexWrap: 'wrap', gap: '0.75rem' }}>
        <div>
          <h2 style={{ margin: 0, fontSize: '1.25rem', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect width="7" height="9" x="3" y="3" rx="1"/><rect width="7" height="5" x="14" y="3" rx="1"/><rect width="7" height="9" x="14" y="12" rx="1"/><rect width="7" height="5" x="3" y="16" rx="1"/></svg>
            <span>WoxNewsletter & Bulk Broadcaster</span>
          </h2>
          <p className="text-secondary" style={{ margin: 0, fontSize: '0.75rem' }}>
            Broadcast branded emails with merge tags, deliverability throttles, and RFC 8058 one-click unsubscribes.
          </p>
        </div>

        <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'center' }}>
          <div style={{ display: 'flex', gap: '0.35rem', background: 'var(--color-bg-input)', padding: '2px', borderRadius: 'var(--radius-sm)', border: '1px solid var(--color-border)' }}>
            <button
              type="button"
              className={`btn btn-xs ${activeTab === 'campaigns' ? 'btn-primary' : 'btn-ghost'}`}
              onClick={() => setActiveTab('campaigns')}
            >
              Campaigns ({campaigns.length})
            </button>
            <button
              type="button"
              className={`btn btn-xs ${activeTab === 'lists' ? 'btn-primary' : 'btn-ghost'}`}
              onClick={() => setActiveTab('lists')}
            >
              Mailing Lists ({lists.length})
            </button>
          </div>

          <button
            type="button"
            className="btn btn-primary btn-sm"
            onClick={() => setIsComposing(true)}
            disabled={lists.length === 0}
          >
            New Campaign
          </button>
        </div>
      </div>

      {/* Main Container */}
      <div style={{ padding: '1.5rem', maxWidth: 1000, margin: '0 auto', width: '100%' }}>
        {loading ? (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
            {[...Array(3)].map((_, i) => (
              <div key={i} className="skeleton" style={{ height: 110, borderRadius: 'var(--radius-md)' }} />
            ))}
          </div>
        ) : activeTab === 'campaigns' ? (
          /* ── CAMPAIGNS TAB ────────────────────────────────── */
          campaigns.length === 0 ? (
            <div className="card" style={{ textAlign: 'center', padding: '3rem 1.5rem' }}>
              <span style={{ display: 'inline-flex', color: 'var(--color-primary-light)' }}><svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"><path d="m3 11 18-5v12L3 14v-3z"/><path d="M11.6 16.8a3 3 0 1 1-5.8-1.6"/></svg></span>
              <h3 style={{ margin: '0.5rem 0' }}>No Campaigns Created Yet</h3>
              <p className="text-secondary" style={{ fontSize: '0.875rem', marginBottom: '1.5rem' }}>
                Create your first mailing list, import subscribers, and dispatch newsletters.
              </p>
              {lists.length === 0 ? (
                <button type="button" className="btn btn-primary" onClick={() => setShowNewListModal(true)}>
                  Create Your First List
                </button>
              ) : (
                <button type="button" className="btn btn-primary" onClick={() => setIsComposing(true)}>
                  Compose New Campaign
                </button>
              )}
            </div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
              {campaigns.map((c) => (
                <div key={c.id} className="card" style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap', gap: '0.5rem' }}>
                    <div>
                      <strong style={{ fontSize: '1.05rem', color: 'var(--color-text-primary)' }}>{c.title}</strong>
                      <div className="text-secondary" style={{ fontSize: '0.8125rem', marginTop: '0.2rem' }}>
                        Subject: <em>"{c.subject}"</em> · List: <strong>{c.list_name || 'Unassigned'}</strong>
                      </div>
                    </div>
                    <span
                      className={`badge ${
                        c.status === 'sent'
                          ? 'badge-green'
                          : c.status === 'sending'
                          ? 'badge-purple'
                          : c.status === 'draft'
                          ? 'badge-amber'
                          : 'badge-blue'
                      }`}
                    >
                      {c.status.toUpperCase()}
                    </span>
                  </div>

                  {/* Telemetry metrics bar */}
                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(120px, 1fr))', gap: '0.5rem', background: 'var(--color-bg-page)', padding: '0.6rem 0.8rem', borderRadius: 'var(--radius-sm)', border: '1px solid var(--color-border-subtle)' }}>
                    <div>
                      <span className="text-tertiary" style={{ fontSize: '0.6875rem', display: 'block' }}>RECIPIENTS</span>
                      <strong style={{ fontSize: '0.9rem' }}>{c.total_recipients || 0}</strong>
                    </div>
                    <div>
                      <span className="text-tertiary" style={{ fontSize: '0.6875rem', display: 'block' }}>DELIVERED</span>
                      <strong className="text-green" style={{ fontSize: '0.9rem' }}>{c.sent_count || 0}</strong>
                    </div>
                    <div>
                      <span className="text-tertiary" style={{ fontSize: '0.6875rem', display: 'block' }}>FAILED / BOUNCED</span>
                      <strong className="text-secondary" style={{ fontSize: '0.9rem' }}>{c.failed_count || 0}</strong>
                    </div>
                    <div>
                      <span className="text-tertiary" style={{ fontSize: '0.6875rem', display: 'block' }}>OPENED</span>
                      <strong className="text-purple" style={{ fontSize: '0.9rem' }}>{c.open_count || 0}</strong>
                    </div>
                  </div>

                  {/* Actions */}
                  <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '0.5rem' }}>
                    {c.status === 'draft' && (
                      <button
                        type="button"
                        className="btn btn-primary btn-sm"
                        onClick={() => handleStartBroadcast(c.id)}
                      >
                        Start Broadcast
                      </button>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )
        ) : (
          /* ── LISTS TAB ────────────────────────────────────── */
          <div>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1rem' }}>
              <span style={{ fontSize: '0.875rem', color: 'var(--color-text-secondary)' }}>
                Organize subscribers into segmented broadcast groups.
              </span>
              <button
                type="button"
                className="btn btn-primary btn-sm"
                onClick={() => setShowNewListModal(true)}
              >
                + New Mailing List
              </button>
            </div>

            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
              {lists.map((l) => (
                <div key={l.id} className="card" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '1rem 1.25rem' }}>
                  <div>
                    <strong style={{ fontSize: '1rem', color: 'var(--color-text-primary)' }}>{l.name}</strong>
                    <div className="text-secondary" style={{ fontSize: '0.75rem', marginTop: '0.2rem' }}>
                      {l.description || 'No description'} · <strong>{l.active_subscribers || 0}</strong> active subscribers ({l.total_subscribers || 0} total)
                    </div>
                  </div>

                  <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'center' }}>
                    <button
                      type="button"
                      className="btn btn-secondary btn-xs"
                      onClick={() => setImportListId(l.id)}
                      title="Bulk import subscribers from CSV"
                    >
                      Import CSV
                    </button>
                    <button
                      type="button"
                      className="btn btn-secondary btn-xs"
                      onClick={() => showEmbedCode(l.id)}
                      title="Get embeddable signup form HTML"
                    >
                      &lt;/&gt; Embed Form
                    </button>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>

      {/* New List Modal */}
      {showNewListModal && (
        <div className="compose-overlay" onClick={() => setShowNewListModal(false)}>
          <div className="compose-modal card" style={{ maxWidth: 450 }} onClick={(e) => e.stopPropagation()}>
            <div className="compose-header">
              <h3>Create Mailing List</h3>
              <button type="button" className="btn btn-ghost btn-xs" onClick={() => setShowNewListModal(false)}>✕</button>
            </div>
            <form onSubmit={handleCreateList} style={{ padding: '1.25rem', display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
              <div className="form-group" style={{ marginBottom: 0 }}>
                <label className="form-label">List Name:</label>
                <input className="input" placeholder="e.g. VIP Customers, Early Adopters" value={newListName} onChange={(e) => setNewListName(e.target.value)} required />
              </div>
              <div className="form-group" style={{ marginBottom: 0 }}>
                <label className="form-label">Description:</label>
                <input className="input" placeholder="Optional notes about audience" value={newListDesc} onChange={(e) => setNewListDesc(e.target.value)} />
              </div>
              <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '0.5rem', marginTop: '0.5rem' }}>
                <button type="button" className="btn btn-ghost btn-sm" onClick={() => setShowNewListModal(false)}>Cancel</button>
                <button type="submit" className="btn btn-primary btn-sm">Create List</button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* CSV Import Modal */}
      {importListId && (
        <div className="compose-overlay" onClick={() => setImportListId(null)}>
          <div className="compose-modal card" style={{ maxWidth: 520 }} onClick={(e) => e.stopPropagation()}>
            <div className="compose-header">
              <h3>Bulk Import Subscribers</h3>
              <button type="button" className="btn btn-ghost btn-xs" onClick={() => setImportListId(null)}>✕</button>
            </div>
            <form onSubmit={handleCsvImport} style={{ padding: '1.25rem', display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
              <p className="text-secondary" style={{ fontSize: '0.8125rem', margin: 0 }}>
                Paste CSV rows in <code>email, first_name, last_name</code> format:
              </p>
              <textarea
                className="input mono"
                style={{ minHeight: '160px', fontSize: '0.75rem' }}
                placeholder={`john@example.com, John, Doe\nsarah@company.com, Sarah, Smith`}
                value={csvText}
                onChange={(e) => setCsvText(e.target.value)}
                required
              />
              <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '0.5rem' }}>
                <button type="button" className="btn btn-ghost btn-sm" onClick={() => setImportListId(null)}>Cancel</button>
                <button type="submit" className="btn btn-primary btn-sm" disabled={importing}>
                  {importing ? 'Importing...' : 'Import Subscribers'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Embed HTML Form Modal */}
      {embedHtml && (
        <div className="compose-overlay" onClick={() => setEmbedHtml('')}>
          <div className="compose-modal card" style={{ maxWidth: 560 }} onClick={(e) => e.stopPropagation()}>
            <div className="compose-header">
              <h3>&lt;/&gt; Embeddable Signup Form HTML</h3>
              <button type="button" className="btn btn-ghost btn-xs" onClick={() => setEmbedHtml('')}>✕</button>
            </div>
            <div style={{ padding: '1.25rem', display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
              <p className="text-secondary" style={{ fontSize: '0.8125rem', margin: 0 }}>
                Paste this HTML snippet into your website or landing page:
              </p>
              <pre className="input mono" style={{ fontSize: '0.75rem', height: 140, overflowY: 'auto', whiteSpace: 'pre-wrap' }}>
                {embedHtml}
              </pre>
              <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
                <button
                  type="button"
                  className="btn btn-primary btn-sm"
                  onClick={() => {
                    navigator.clipboard.writeText(embedHtml);
                    alert('Copied embed code to clipboard!');
                    setEmbedHtml('');
                  }}
                >
                  Copy to Clipboard
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
