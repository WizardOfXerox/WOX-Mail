import React, { useState, useEffect } from 'react';
import CampaignComposer from './CampaignComposer.jsx';

/**
 * CampaignsView — WoxNewsletter & Bulk Campaign Broadcaster Dashboard
 * Upgraded with 4 Tabs: Campaigns, Mailing Lists, Drip Automations, and Dynamic Segments.
 */
export default function CampaignsView() {
  const [activeTab, setActiveTab] = useState('campaigns'); // 'campaigns' | 'lists' | 'automations' | 'segments'
  const [campaigns, setCampaigns] = useState([]);
  const [lists, setLists] = useState([]);
  const [sequences, setSequences] = useState([]);
  const [segments, setSegments] = useState([]);
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

  // New Sequence Modal
  const [showNewSeqModal, setShowNewSeqModal] = useState(false);
  const [newSeqName, setNewSeqName] = useState('');
  const [newSeqDesc, setNewSeqDesc] = useState('');
  const [newSeqListId, setNewSeqListId] = useState('');

  // Add Step Modal
  const [activeSeqForStep, setActiveSeqForStep] = useState(null);
  const [stepSubject, setStepSubject] = useState('');
  const [stepDays, setStepDays] = useState(1);
  const [stepHours, setStepHours] = useState(0);
  const [stepHtml, setStepHtml] = useState('<p>Hello {{first_name}},</p><p>Welcome to step 2!</p>');

  // New Segment Modal
  const [showNewSegmentModal, setShowNewSegmentModal] = useState(false);
  const [newSegmentName, setNewSegmentName] = useState('');
  const [newSegmentListId, setNewSegmentListId] = useState('');
  const [segmentTag, setSegmentTag] = useState('');
  const [segmentStatus, setSegmentStatus] = useState('active');
  const [previewCount, setPreviewCount] = useState(null);

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
      if (data.lists?.[0]?.id) {
        setNewSeqListId(data.lists[0].id);
        setNewSegmentListId(data.lists[0].id);
      }
    } catch (err) {
      console.error('Failed to fetch mailing lists', err);
    }
  };

  const fetchSequences = async () => {
    try {
      const res = await fetch('/api/campaigns/drip/sequences', { credentials: 'include' });
      const data = await res.json();
      setSequences(data.sequences || []);
    } catch (err) {
      console.error('Failed to fetch drip sequences', err);
    }
  };

  const fetchSegments = async () => {
    try {
      const res = await fetch('/api/campaigns/segments', { credentials: 'include' });
      const data = await res.json();
      setSegments(data.segments || []);
    } catch (err) {
      console.error('Failed to fetch segments', err);
    }
  };

  const refreshAll = () => {
    setLoading(true);
    Promise.all([fetchCampaigns(), fetchLists(), fetchSequences(), fetchSegments()]).finally(() => setLoading(false));
  };

  useEffect(() => {
    refreshAll();
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

  const handleCreateSequence = async (e) => {
    e.preventDefault();
    if (!newSeqName.trim() || !newSeqListId) return;
    try {
      const res = await fetch('/api/campaigns/drip/sequences', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({
          list_id: parseInt(newSeqListId, 10),
          name: newSeqName.trim(),
          description: newSeqDesc.trim()
        })
      });
      const data = await res.json();
      if (data.success) {
        setShowNewSeqModal(false);
        setNewSeqName('');
        setNewSeqDesc('');
        fetchSequences();
      }
    } catch (err) {
      alert('Failed to create drip sequence: ' + err.message);
    }
  };

  const handleAddStep = async (e) => {
    e.preventDefault();
    if (!activeSeqForStep || !stepSubject.trim() || !stepHtml.trim()) return;
    try {
      const res = await fetch(`/api/campaigns/drip/sequences/${activeSeqForStep.id}/steps`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({
          delay_days: parseInt(stepDays, 10) || 0,
          delay_hours: parseInt(stepHours, 10) || 0,
          subject: stepSubject.trim(),
          html_content: stepHtml.trim()
        })
      });
      const data = await res.json();
      if (data.success) {
        setActiveSeqForStep(null);
        setStepSubject('');
        setStepDays(1);
        setStepHours(0);
        fetchSequences();
      }
    } catch (err) {
      alert('Failed to add step: ' + err.message);
    }
  };

  const handlePreviewSegmentCount = async () => {
    if (!newSegmentListId) return;
    const rules = {
      match_type: 'all',
      conditions: []
    };
    if (segmentTag.trim()) {
      rules.conditions.push({ field: 'tags', operator: 'contains', value: [segmentTag.trim().toUpperCase()] });
    }
    if (segmentStatus) {
      rules.conditions.push({ field: 'status', operator: 'equals', value: segmentStatus });
    }

    try {
      const res = await fetch('/api/campaigns/segments/preview-count', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ list_id: parseInt(newSegmentListId, 10), rules })
      });
      const data = await res.json();
      setPreviewCount(data.count);
    } catch (err) {
      console.warn('Count preview error', err);
    }
  };

  const handleCreateSegment = async (e) => {
    e.preventDefault();
    if (!newSegmentName.trim() || !newSegmentListId) return;

    const rules = {
      match_type: 'all',
      conditions: []
    };
    if (segmentTag.trim()) {
      rules.conditions.push({ field: 'tags', operator: 'contains', value: [segmentTag.trim().toUpperCase()] });
    }
    if (segmentStatus) {
      rules.conditions.push({ field: 'status', operator: 'equals', value: segmentStatus });
    }

    try {
      const res = await fetch('/api/campaigns/segments', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({
          list_id: parseInt(newSegmentListId, 10),
          name: newSegmentName.trim(),
          rules
        })
      });
      const data = await res.json();
      if (data.success) {
        setShowNewSegmentModal(false);
        setNewSegmentName('');
        setSegmentTag('');
        setPreviewCount(null);
        fetchSegments();
      }
    } catch (err) {
      alert('Failed to create segment: ' + err.message);
    }
  };

  const handleStartBroadcast = async (campaignId) => {
    if (!confirm('Are you sure you want to broadcast this campaign to active subscribers?')) return;
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
          tags: parts[3] ? parts[3].split('|') : []
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
        alert(`Successfully imported ${data.imported} subscribers! (${data.skipped} skipped)`);
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
      setEmbedHtml(data.embedHtml);
    } catch (err) {
      alert('Failed to get embed code: ' + err.message);
    }
  };

  if (isComposing) {
    return (
      <div style={{ flex: 1, height: '100vh', overflowY: 'auto', background: 'var(--color-bg-page)' }}>
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
            <span>WoxNewsletter & Marketing Suite</span>
          </h2>
          <p className="text-secondary" style={{ margin: 0, fontSize: '0.75rem' }}>
            Notion block editor, multi-step drip funnels, dynamic segmentation, and one-click deliverability.
          </p>
        </div>

        <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'center', flexWrap: 'wrap' }}>
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
            <button
              type="button"
              className={`btn btn-xs ${activeTab === 'automations' ? 'btn-primary' : 'btn-ghost'}`}
              onClick={() => setActiveTab('automations')}
            >
              Drip Automations ({sequences.length})
            </button>
            <button
              type="button"
              className={`btn btn-xs ${activeTab === 'segments' ? 'btn-primary' : 'btn-ghost'}`}
              onClick={() => setActiveTab('segments')}
            >
              Segments ({segments.length})
            </button>
          </div>

          <button
            type="button"
            className="btn btn-primary btn-sm"
            onClick={() => setIsComposing(true)}
            disabled={lists.length === 0}
          >
            Compose Campaign
          </button>
        </div>
      </div>

      {/* Main Content Area */}
      <div style={{ padding: '1.5rem', maxWidth: 1050, margin: '0 auto', width: '100%' }}>
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
              <h3 style={{ margin: '0.5rem 0' }}>No Campaigns Created Yet</h3>
              <p className="text-secondary" style={{ maxWidth: 450, margin: '0 auto 1.5rem', fontSize: '0.875rem' }}>
                Design branded newsletters using our hybrid Notion block editor with spam score checks and responsive previews.
              </p>
              <button type="button" className="btn btn-primary btn-sm" onClick={() => setIsComposing(true)} disabled={lists.length === 0}>
                Create Your First Campaign
              </button>
            </div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
              {campaigns.map((camp) => (
                <div key={camp.id} className="card" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '1rem' }}>
                  <div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '4px' }}>
                      <span className={`badge ${camp.status === 'sent' ? 'badge-green' : camp.status === 'sending' ? 'badge-purple' : 'badge-neutral'}`}>
                        [{camp.status.toUpperCase()}]
                      </span>
                      <strong style={{ fontSize: '1rem' }}>{camp.title}</strong>
                    </div>
                    <div className="text-secondary" style={{ fontSize: '0.8rem' }}>
                      Subject: "{camp.subject}" &bull; List: {camp.list_name || 'N/A'} &bull; Recipients: {camp.sent_count || 0} / {camp.total_recipients || 0}
                    </div>
                  </div>

                  <div style={{ display: 'flex', gap: '0.5rem' }}>
                    {camp.status === 'draft' && (
                      <button type="button" className="btn btn-primary btn-sm" onClick={() => handleStartBroadcast(camp.id)}>
                        Send Broadcast
                      </button>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )
        ) : activeTab === 'lists' ? (
          /* ── MAILING LISTS TAB ────────────────────────────── */
          <div>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.25rem' }}>
              <div>
                <h3 style={{ margin: 0, fontSize: '1.1rem' }}>Audience Lists</h3>
                <p className="text-secondary" style={{ margin: 0, fontSize: '0.8rem' }}>Manage contact lists, tags, and public subscribe forms.</p>
              </div>
              <button type="button" className="btn btn-secondary btn-sm" onClick={() => setShowNewListModal(true)}>
                + New Mailing List
              </button>
            </div>

            {lists.length === 0 ? (
              <div className="card" style={{ textAlign: 'center', padding: '3rem 1.5rem' }}>
                <h3>No Lists Configured</h3>
                <p className="text-secondary" style={{ fontSize: '0.875rem', marginBottom: '1rem' }}>Create a list to import contacts and trigger automated welcome drips.</p>
                <button type="button" className="btn btn-primary btn-sm" onClick={() => setShowNewListModal(true)}>Create List</button>
              </div>
            ) : (
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(300px, 1fr))', gap: '1rem' }}>
                {lists.map(l => (
                  <div key={l.id} className="card" style={{ display: 'flex', flexDirection: 'column', justifyContent: 'space-between' }}>
                    <div>
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                        <strong style={{ fontSize: '1.1rem' }}>{l.name}</strong>
                        <span className="badge badge-purple">{l.total_subscribers || 0} subs</span>
                      </div>
                      <p className="text-secondary" style={{ fontSize: '0.8rem', margin: '0.5rem 0' }}>{l.description || 'No description provided.'}</p>
                    </div>

                    <div style={{ display: 'flex', gap: '0.5rem', marginTop: '1rem', borderTop: '1px solid var(--color-border)', paddingTop: '0.75rem' }}>
                      <button type="button" className="btn btn-secondary btn-xs" onClick={() => setImportListId(l.id)}>
                        Import CSV
                      </button>
                      <button type="button" className="btn btn-ghost btn-xs" onClick={() => showEmbedCode(l.id)}>
                        Embed Form
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        ) : activeTab === 'automations' ? (
          /* ── DRIP AUTOMATIONS TAB ─────────────────────────── */
          <div>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.25rem' }}>
              <div>
                <h3 style={{ margin: 0, fontSize: '1.1rem' }}>Drip Sequences</h3>
                <p className="text-secondary" style={{ margin: 0, fontSize: '0.8rem' }}>Automated welcome funnels and timed email sequences triggered on signup.</p>
              </div>
              <button type="button" className="btn btn-secondary btn-sm" onClick={() => setShowNewSeqModal(true)} disabled={lists.length === 0}>
                + New Drip Funnel
              </button>
            </div>

            {sequences.length === 0 ? (
              <div className="card" style={{ textAlign: 'center', padding: '3rem 1.5rem' }}>
                <h3>No Drip Sequences Configured</h3>
                <p className="text-secondary" style={{ fontSize: '0.875rem', marginBottom: '1rem' }}>Set up an automated sequence (e.g. Day 0 Welcome, Day 3 Onboarding, Day 7 Feature Spotlight).</p>
                <button type="button" className="btn btn-primary btn-sm" onClick={() => setShowNewSeqModal(true)} disabled={lists.length === 0}>Create Sequence</button>
              </div>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
                {sequences.map(seq => (
                  <div key={seq.id} className="card">
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.75rem' }}>
                      <div>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                          <span className={`badge ${seq.is_active ? 'badge-green' : 'badge-neutral'}`}>
                            {seq.is_active ? '[ACTIVE]' : '[PAUSED]'}
                          </span>
                          <strong style={{ fontSize: '1.1rem' }}>{seq.name}</strong>
                        </div>
                        <div className="text-secondary" style={{ fontSize: '0.8rem', marginTop: '2px' }}>
                          {seq.description || 'Automated drip funnel'} &bull; {seq.total_steps || 0} Steps &bull; {seq.total_queued || 0} in queue
                        </div>
                      </div>

                      <button type="button" className="btn btn-secondary btn-sm" onClick={() => setActiveSeqForStep(seq)}>
                        + Add Step
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        ) : (
          /* ── DYNAMIC SEGMENTS TAB ─────────────────────────── */
          <div>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.25rem' }}>
              <div>
                <h3 style={{ margin: 0, fontSize: '1.1rem' }}>Audience Segments</h3>
                <p className="text-secondary" style={{ margin: 0, fontSize: '0.8rem' }}>Filter subscribers by tags, engagement, and status for laser-targeted broadcasts.</p>
              </div>
              <button type="button" className="btn btn-secondary btn-sm" onClick={() => setShowNewSegmentModal(true)} disabled={lists.length === 0}>
                + New Segment
              </button>
            </div>

            {segments.length === 0 ? (
              <div className="card" style={{ textAlign: 'center', padding: '3rem 1.5rem' }}>
                <h3>No Segments Defined</h3>
                <p className="text-secondary" style={{ fontSize: '0.875rem', marginBottom: '1rem' }}>Build rule-based groups like [VIP], [BETA], or active customers.</p>
                <button type="button" className="btn btn-primary btn-sm" onClick={() => setShowNewSegmentModal(true)} disabled={lists.length === 0}>Create Segment</button>
              </div>
            ) : (
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(300px, 1fr))', gap: '1rem' }}>
                {segments.map(seg => (
                  <div key={seg.id} className="card">
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                      <strong style={{ fontSize: '1rem' }}>{seg.name}</strong>
                      <span className="badge badge-purple">[RULE-BASED]</span>
                    </div>
                    <p className="text-secondary" style={{ fontSize: '0.8rem', margin: '0.5rem 0' }}>List: {seg.list_name}</p>
                    <div style={{ background: 'var(--color-bg-input)', padding: '6px 10px', borderRadius: 'var(--radius-sm)', fontSize: '12px', fontFamily: 'monospace' }}>
                      {JSON.stringify(seg.rules)}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}
      </div>

      {/* New List Modal */}
      {showNewListModal && (
        <div className="modal-backdrop" onClick={() => setShowNewListModal(false)} style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.7)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 9999 }}>
          <div className="card" onClick={(e) => e.stopPropagation()} style={{ width: '90%', maxWidth: '480px' }}>
            <h3 style={{ margin: '0 0 1rem' }}>Create New Mailing List</h3>
            <form onSubmit={handleCreateList}>
              <div style={{ marginBottom: '1rem' }}>
                <label style={{ fontSize: '0.8rem', fontWeight: 600, display: 'block', marginBottom: '4px' }}>LIST NAME</label>
                <input className="input" type="text" placeholder="e.g. VIP Founders" value={newListName} onChange={e => setNewListName(e.target.value)} required />
              </div>
              <div style={{ marginBottom: '1.5rem' }}>
                <label style={{ fontSize: '0.8rem', fontWeight: 600, display: 'block', marginBottom: '4px' }}>DESCRIPTION</label>
                <input className="input" type="text" placeholder="e.g. Weekly dispatch subscribers" value={newListDesc} onChange={e => setNewListDesc(e.target.value)} />
              </div>
              <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '0.5rem' }}>
                <button type="button" className="btn btn-ghost" onClick={() => setShowNewListModal(false)}>Cancel</button>
                <button type="submit" className="btn btn-primary">Create List</button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* New Drip Sequence Modal */}
      {showNewSeqModal && (
        <div className="modal-backdrop" onClick={() => setShowNewSeqModal(false)} style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.7)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 9999 }}>
          <div className="card" onClick={(e) => e.stopPropagation()} style={{ width: '90%', maxWidth: '480px' }}>
            <h3 style={{ margin: '0 0 1rem' }}>Create Drip Automation Funnel</h3>
            <form onSubmit={handleCreateSequence}>
              <div style={{ marginBottom: '1rem' }}>
                <label style={{ fontSize: '0.8rem', fontWeight: 600, display: 'block', marginBottom: '4px' }}>TARGET MAILING LIST</label>
                <select className="input" value={newSeqListId} onChange={e => setNewSeqListId(e.target.value)} required>
                  {lists.map(l => (
                    <option key={l.id} value={l.id}>{l.name}</option>
                  ))}
                </select>
              </div>
              <div style={{ marginBottom: '1rem' }}>
                <label style={{ fontSize: '0.8rem', fontWeight: 600, display: 'block', marginBottom: '4px' }}>FUNNEL NAME</label>
                <input className="input" type="text" placeholder="e.g. Onboarding Drip" value={newSeqName} onChange={e => setNewSeqName(e.target.value)} required />
              </div>
              <div style={{ marginBottom: '1.5rem' }}>
                <label style={{ fontSize: '0.8rem', fontWeight: 600, display: 'block', marginBottom: '4px' }}>DESCRIPTION</label>
                <input className="input" type="text" placeholder="e.g. Welcome emails sent over 7 days" value={newSeqDesc} onChange={e => setNewSeqDesc(e.target.value)} />
              </div>
              <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '0.5rem' }}>
                <button type="button" className="btn btn-ghost" onClick={() => setShowNewSeqModal(false)}>Cancel</button>
                <button type="submit" className="btn btn-primary">Create Funnel</button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Add Step Modal */}
      {activeSeqForStep && (
        <div className="modal-backdrop" onClick={() => setActiveSeqForStep(null)} style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.7)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 9999 }}>
          <div className="card" onClick={(e) => e.stopPropagation()} style={{ width: '90%', maxWidth: '560px' }}>
            <h3 style={{ margin: '0 0 1rem' }}>Add Step to: {activeSeqForStep.name}</h3>
            <form onSubmit={handleAddStep}>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.75rem', marginBottom: '1rem' }}>
                <div>
                  <label style={{ fontSize: '0.8rem', fontWeight: 600, display: 'block', marginBottom: '4px' }}>DELAY (DAYS)</label>
                  <input className="input" type="number" min="0" value={stepDays} onChange={e => setStepDays(e.target.value)} required />
                </div>
                <div>
                  <label style={{ fontSize: '0.8rem', fontWeight: 600, display: 'block', marginBottom: '4px' }}>DELAY (HOURS)</label>
                  <input className="input" type="number" min="0" max="23" value={stepHours} onChange={e => setStepHours(e.target.value)} required />
                </div>
              </div>
              <div style={{ marginBottom: '1rem' }}>
                <label style={{ fontSize: '0.8rem', fontWeight: 600, display: 'block', marginBottom: '4px' }}>EMAIL SUBJECT</label>
                <input className="input" type="text" placeholder="e.g. Quick tip for getting started" value={stepSubject} onChange={e => setStepSubject(e.target.value)} required />
              </div>
              <div style={{ marginBottom: '1.5rem' }}>
                <label style={{ fontSize: '0.8rem', fontWeight: 600, display: 'block', marginBottom: '4px' }}>HTML CONTENT</label>
                <textarea className="input" rows={6} value={stepHtml} onChange={e => setStepHtml(e.target.value)} required />
              </div>
              <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '0.5rem' }}>
                <button type="button" className="btn btn-ghost" onClick={() => setActiveSeqForStep(null)}>Cancel</button>
                <button type="submit" className="btn btn-primary">Add Step</button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* New Segment Modal */}
      {showNewSegmentModal && (
        <div className="modal-backdrop" onClick={() => setShowNewSegmentModal(false)} style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.7)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 9999 }}>
          <div className="card" onClick={(e) => e.stopPropagation()} style={{ width: '90%', maxWidth: '500px' }}>
            <h3 style={{ margin: '0 0 1rem' }}>Build Dynamic Audience Segment</h3>
            <form onSubmit={handleCreateSegment}>
              <div style={{ marginBottom: '1rem' }}>
                <label style={{ fontSize: '0.8rem', fontWeight: 600, display: 'block', marginBottom: '4px' }}>SOURCE MAILING LIST</label>
                <select className="input" value={newSegmentListId} onChange={e => setNewSegmentListId(e.target.value)} required>
                  {lists.map(l => (
                    <option key={l.id} value={l.id}>{l.name}</option>
                  ))}
                </select>
              </div>
              <div style={{ marginBottom: '1rem' }}>
                <label style={{ fontSize: '0.8rem', fontWeight: 600, display: 'block', marginBottom: '4px' }}>SEGMENT NAME</label>
                <input className="input" type="text" placeholder="e.g. VIP Founders" value={newSegmentName} onChange={e => setNewSegmentName(e.target.value)} required />
              </div>
              <div style={{ marginBottom: '1rem' }}>
                <label style={{ fontSize: '0.8rem', fontWeight: 600, display: 'block', marginBottom: '4px' }}>FILTER BY TAG (OPTIONAL)</label>
                <input className="input" type="text" placeholder="e.g. VIP or BETA" value={segmentTag} onChange={e => setSegmentTag(e.target.value)} />
              </div>
              <div style={{ marginBottom: '1.5rem' }}>
                <label style={{ fontSize: '0.8rem', fontWeight: 600, display: 'block', marginBottom: '4px' }}>SUBSCRIBER STATUS</label>
                <select className="input" value={segmentStatus} onChange={e => setSegmentStatus(e.target.value)}>
                  <option value="active">Active Only</option>
                  <option value="unsubscribed">Unsubscribed</option>
                </select>
              </div>

              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: '1rem' }}>
                <button type="button" className="btn btn-secondary btn-xs" onClick={handlePreviewSegmentCount}>
                  Preview Count {previewCount !== null ? `(${previewCount} subs)` : ''}
                </button>
                <div style={{ display: 'flex', gap: '0.5rem' }}>
                  <button type="button" className="btn btn-ghost" onClick={() => setShowNewSegmentModal(false)}>Cancel</button>
                  <button type="submit" className="btn btn-primary">Save Segment</button>
                </div>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* CSV Import Modal */}
      {importListId && (
        <div className="modal-backdrop" onClick={() => setImportListId(null)} style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.7)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 9999 }}>
          <div className="card" onClick={(e) => e.stopPropagation()} style={{ width: '90%', maxWidth: '520px' }}>
            <h3 style={{ margin: '0 0 1rem' }}>Import Subscribers via CSV</h3>
            <form onSubmit={handleCsvImport}>
              <p className="text-secondary" style={{ fontSize: '0.8rem', marginBottom: '0.75rem' }}>
                Format: <code>email, first_name, last_name, tag1|tag2</code> (one per line)
              </p>
              <textarea
                className="input mono"
                rows={8}
                placeholder="alice@example.com, Alice, Smith, VIP&#10;bob@example.com, Bob, Jones, BETA"
                value={csvText}
                onChange={e => setCsvText(e.target.value)}
                required
              />
              <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '0.5rem', marginTop: '1rem' }}>
                <button type="button" className="btn btn-ghost" onClick={() => setImportListId(null)}>Cancel</button>
                <button type="submit" className="btn btn-primary" disabled={importing}>
                  {importing ? 'Importing...' : 'Import Subscribers'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Embed Modal */}
      {embedHtml && (
        <div className="modal-backdrop" onClick={() => setEmbedHtml('')} style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.7)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 9999 }}>
          <div className="card" onClick={(e) => e.stopPropagation()} style={{ width: '90%', maxWidth: '520px' }}>
            <h3 style={{ margin: '0 0 1rem' }}>Embed Signup Form</h3>
            <textarea className="input mono" rows={8} readOnly value={embedHtml} />
            <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: '1rem' }}>
              <button type="button" className="btn btn-primary" onClick={() => { navigator.clipboard.writeText(embedHtml); alert('Copied to clipboard!'); }}>Copy Code</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
