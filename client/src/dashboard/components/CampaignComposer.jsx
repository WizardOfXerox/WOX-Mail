import React, { useState, useEffect, useRef } from 'react';
import { compileEmail, renderBlock } from '../../shared/utils/emailTemplateCompiler.js';
import { validateEmailHtml } from '../../shared/utils/emailCompatValidator.js';
import { STARTER_TEMPLATES, getTemplateById } from '../../shared/templates/index.js';

export default function CampaignComposer({ lists = [], onSave, onCancel }) {
  const [selectedListId, setSelectedListId] = useState(lists[0]?.id || '');
  const [selectedSegmentId, setSelectedSegmentId] = useState('');
  const [segments, setSegments] = useState([]);
  const [title, setTitle] = useState('');
  const [subject, setSubject] = useState('');
  const [fromName, setFromName] = useState('WoxMail Broadcaster');
  const [fromEmail, setFromEmail] = useState('');
  
  // Editor State
  const [editorMode, setEditorMode] = useState('visual'); // 'visual' | 'code'
  const [viewportMode, setViewportMode] = useState('desktop'); // 'desktop' (600px) | 'mobile' (360px)
  const [sidebarOpen, setSidebarOpen] = useState(true);
  const [selectedBlockId, setSelectedBlockId] = useState(null);

  // Block Document Model
  const [blocks, setBlocks] = useState([
    { id: 'b1', type: 'header', title: 'WoxMail Dispatch', align: 'center' },
    { id: 'b2', type: 'heading', level: 1, text: 'Welcome to WoxMail, {{first_name}}!', align: 'center' },
    { id: 'b3', type: 'text', html: '<p>Here are this week\'s top updates and private insights.</p>' },
    { id: 'b4', type: 'button', label: 'Explore Your Mailbox', url: 'https://mail.wox.world/dashboard', bgColor: '#7c3aed', textColor: '#ffffff', radius: 'pill', align: 'center' },
    { id: 'b5', type: 'divider', style: 'solid', color: '#2a2a4a' },
    { id: 'b6', type: 'footer', text: 'WoxMail Sovereign Privacy Suite', unsubscribeText: 'One-Click Unsubscribe' }
  ]);

  // Raw HTML state (synced with blocks)
  const [htmlContent, setHtmlContent] = useState('');
  const [plainContent, setPlainContent] = useState('');

  // Modals & Panels
  const [showTemplatesModal, setShowTemplatesModal] = useState(false);
  const [showSpamModal, setShowSpamModal] = useState(false);
  const [spamAnalysis, setSpamAnalysis] = useState(null);
  const [checkingSpam, setCheckingSpam] = useState(false);
  
  const [showCompatModal, setShowCompatModal] = useState(false);
  const [compatAnalysis, setCompatAnalysis] = useState(null);

  // Slash Command Menu State
  const [slashMenuOpen, setSlashMenuOpen] = useState(false);
  const [slashFilter, setSlashFilter] = useState('');
  const [slashBlockIndex, setSlashBlockIndex] = useState(null);

  // Test send state
  const [testEmail, setTestEmail] = useState('');
  const [testing, setTesting] = useState(false);
  const [saving, setSaving] = useState(false);

  // Sync blocks to HTML on change
  useEffect(() => {
    const compiled = compileEmail(blocks, {
      title: subject || title || 'Newsletter Preview',
      contentWidth: 600
    });
    setHtmlContent(compiled);
  }, [blocks, subject, title]);

  // Fetch segments for chosen list
  useEffect(() => {
    if (!selectedListId) return;
    fetch(`/api/campaigns/segments?list_id=${selectedListId}`, { credentials: 'include' })
      .then(res => res.json())
      .then(data => {
        if (data.segments) setSegments(data.segments);
      })
      .catch(() => {});
  }, [selectedListId]);

  // Add block to document
  const addBlock = (type, index = null) => {
    const id = `b_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`;
    let newBlock = { id, type };

    switch (type) {
      case 'heading':
        newBlock = { ...newBlock, level: 2, text: 'New Section Heading', align: 'left' };
        break;
      case 'text':
        newBlock = { ...newBlock, html: '<p>Write your paragraph text here...</p>', align: 'left' };
        break;
      case 'button':
        newBlock = { ...newBlock, label: 'Click Here', url: 'https://', bgColor: '#7c3aed', textColor: '#ffffff', radius: 'pill', align: 'center' };
        break;
      case 'image':
        newBlock = { ...newBlock, src: 'https://via.placeholder.com/600x240/1e1e38/8b5cf6?text=Banner+Image', alt: 'Banner', width: '100%', align: 'center' };
        break;
      case 'columns':
        newBlock = {
          ...newBlock,
          columns: [
            { blocks: [{ id: `c1_${Date.now()}`, type: 'text', html: '<p>Column A content</p>' }] },
            { blocks: [{ id: `c2_${Date.now()}`, type: 'text', html: '<p>Column B content</p>' }] }
          ]
        };
        break;
      case 'divider':
        newBlock = { ...newBlock, style: 'solid', color: '#2a2a4a' };
        break;
      case 'spacer':
        newBlock = { ...newBlock, height: 24 };
        break;
      case 'variable':
        newBlock = { ...newBlock, key: 'first_name' };
        break;
      case 'social':
        newBlock = {
          ...newBlock,
          links: [
            { platform: 'github', url: 'https://github.com' },
            { platform: 'discord', url: 'https://discord.gg' }
          ]
        };
        break;
      case 'footer':
        newBlock = { ...newBlock, text: 'WoxMail Sovereign Privacy Suite', unsubscribeText: 'Unsubscribe' };
        break;
      case 'header':
        newBlock = { ...newBlock, title: 'WoxMail', align: 'center' };
        break;
      default:
        break;
    }

    setBlocks(prev => {
      if (index !== null && index >= 0) {
        const copy = [...prev];
        copy.splice(index, 0, newBlock);
        return copy;
      }
      return [...prev, newBlock];
    });

    setSelectedBlockId(id);
    setSlashMenuOpen(false);
  };

  const updateBlock = (id, updates) => {
    setBlocks(prev => prev.map(b => b.id === id ? { ...b, ...updates } : b));
  };

  const deleteBlock = (id) => {
    setBlocks(prev => prev.filter(b => b.id !== id));
    if (selectedBlockId === id) setSelectedBlockId(null);
  };

  const moveBlock = (id, direction) => {
    setBlocks(prev => {
      const idx = prev.findIndex(b => b.id === id);
      if (idx === -1) return prev;
      const targetIdx = direction === 'up' ? idx - 1 : idx + 1;
      if (targetIdx < 0 || targetIdx >= prev.length) return prev;
      const copy = [...prev];
      const [item] = copy.splice(idx, 1);
      copy.splice(targetIdx, 0, item);
      return copy;
    });
  };

  const loadTemplate = (templateId) => {
    const tmpl = getTemplateById(templateId);
    if (tmpl && Array.isArray(tmpl.blocks)) {
      setBlocks(JSON.parse(JSON.stringify(tmpl.blocks)));
      setShowTemplatesModal(false);
    }
  };

  // Check Spam Score via API
  const handleCheckSpam = async () => {
    setCheckingSpam(true);
    setShowSpamModal(true);
    try {
      const res = await fetch('/api/campaigns/spam-check', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({
          subject: subject || title,
          htmlContent,
          plainContent
        })
      });
      const data = await res.json();
      setSpamAnalysis(data);
    } catch (err) {
      setSpamAnalysis({ error: err.message });
    } finally {
      setCheckingSpam(false);
    }
  };

  // Check Email Compatibility
  const handleCheckCompat = () => {
    const result = validateEmailHtml(htmlContent);
    setCompatAnalysis(result);
    setShowCompatModal(true);
  };

  const handleTestSend = async () => {
    if (!testEmail || !testEmail.includes('@')) {
      alert('Please enter a valid test recipient email address');
      return;
    }
    setTesting(true);
    try {
      const campRes = await fetch('/api/campaigns', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({
          listId: parseInt(selectedListId, 10),
          title: title || 'Draft Campaign Test',
          subject: subject || 'Newsletter Preview',
          fromName,
          fromEmail: fromEmail || undefined,
          htmlContent,
          plainContent,
        }),
      });
      const campData = await campRes.json();
      if (!campData.campaign?.id) throw new Error('Failed to create test draft');

      const testRes = await fetch(`/api/campaigns/${campData.campaign.id}/test`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ testEmail }),
      });
      const testData = await testRes.json();
      if (testData.success) {
        alert(`Test email sent successfully to ${testEmail}`);
      } else {
        alert(`Failed: ${testData.error || 'Check server logs'}`);
      }
    } catch (err) {
      alert(`Error sending test email: ${err.message}`);
    } finally {
      setTesting(false);
    }
  };

  const handleSaveCampaign = async (status = 'draft') => {
    if (!title.trim() || !subject.trim()) {
      alert('Campaign Title and Email Subject are required.');
      return;
    }
    setSaving(true);
    try {
      const payload = {
        listId: parseInt(selectedListId, 10),
        segmentId: selectedSegmentId ? parseInt(selectedSegmentId, 10) : undefined,
        title,
        subject,
        fromName,
        fromEmail: fromEmail || undefined,
        htmlContent,
        plainContent,
        status,
      };

      const res = await fetch('/api/campaigns', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify(payload),
      });
      const data = await res.json();
      if (data.campaign) {
        onSave && onSave(data.campaign);
      } else {
        alert(`Save failed: ${data.error || 'Server error'}`);
      }
    } catch (err) {
      alert(`Error saving campaign: ${err.message}`);
    } finally {
      setSaving(false);
    }
  };

  const selectedBlock = blocks.find(b => b.id === selectedBlockId);

  return (
    <div className="campaign-composer" style={{ display: 'flex', flexDirection: 'column', height: '100%', background: 'var(--color-bg-page)' }}>
      {/* Top Header Controls */}
      <div style={{ padding: '1rem 1.5rem', background: 'var(--color-bg-card)', borderBottom: '1px solid var(--color-border)', display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '1rem' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
          <h2 style={{ margin: 0, fontSize: '1.25rem', fontWeight: 700 }}>Campaign Composer</h2>
          <span className="badge badge-purple">[MAILY BLOCK ENGINE]</span>
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', flexWrap: 'wrap' }}>
          <button type="button" className="btn btn-secondary btn-sm" onClick={() => setShowTemplatesModal(true)}>
            [TEMPLATES]
          </button>
          <button type="button" className="btn btn-secondary btn-sm" onClick={handleCheckSpam}>
            [SPAM SCORE]
          </button>
          <button type="button" className="btn btn-secondary btn-sm" onClick={handleCheckCompat}>
            [COMPATIBILITY]
          </button>

          <div style={{ borderLeft: '1px solid var(--color-border)', height: '24px', margin: '0 4px' }} />

          {/* Mode Switcher */}
          <div style={{ display: 'inline-flex', background: 'var(--color-bg-input)', padding: '2px', borderRadius: 'var(--radius-pill)', border: '1px solid var(--color-border)' }}>
            <button
              type="button"
              className={`btn btn-sm ${editorMode === 'visual' ? 'btn-primary' : 'btn-ghost'}`}
              style={{ borderRadius: 'var(--radius-pill)', padding: '0.25rem 0.75rem' }}
              onClick={() => setEditorMode('visual')}
            >
              Visual
            </button>
            <button
              type="button"
              className={`btn btn-sm ${editorMode === 'code' ? 'btn-primary' : 'btn-ghost'}`}
              style={{ borderRadius: 'var(--radius-pill)', padding: '0.25rem 0.75rem' }}
              onClick={() => setEditorMode('code')}
            >
              HTML Code
            </button>
          </div>

          {/* Viewport Switcher */}
          {editorMode === 'visual' && (
            <div style={{ display: 'inline-flex', background: 'var(--color-bg-input)', padding: '2px', borderRadius: 'var(--radius-pill)', border: '1px solid var(--color-border)' }}>
              <button
                type="button"
                className={`btn btn-sm ${viewportMode === 'desktop' ? 'btn-primary' : 'btn-ghost'}`}
                style={{ borderRadius: 'var(--radius-pill)', padding: '0.25rem 0.75rem' }}
                onClick={() => setViewportMode('desktop')}
                title="Desktop Width (600px)"
              >
                Desktop
              </button>
              <button
                type="button"
                className={`btn btn-sm ${viewportMode === 'mobile' ? 'btn-primary' : 'btn-ghost'}`}
                style={{ borderRadius: 'var(--radius-pill)', padding: '0.25rem 0.75rem' }}
                onClick={() => setViewportMode('mobile')}
                title="Mobile Width (360px)"
              >
                Mobile
              </button>
            </div>
          )}

          <button
            type="button"
            className="btn btn-secondary btn-sm"
            onClick={() => setSidebarOpen(!sidebarOpen)}
            title="Toggle Sidebar"
          >
            {sidebarOpen ? '[>>]' : '[<< BLOCKS]'}
          </button>
        </div>
      </div>

      {/* Campaign Metadata Fields */}
      <div style={{ padding: '1rem 1.5rem', background: 'var(--color-bg-elevated)', borderBottom: '1px solid var(--color-border)', display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '0.75rem' }}>
        <div>
          <label style={{ fontSize: '0.75rem', fontWeight: 600, color: 'var(--color-text-secondary)', display: 'block', marginBottom: '4px' }}>TARGET MAILING LIST</label>
          <select
            className="input"
            value={selectedListId}
            onChange={(e) => { setSelectedListId(e.target.value); setSelectedSegmentId(''); }}
          >
            {lists.map(l => (
              <option key={l.id} value={l.id}>{l.name} ({l.total_subscribers || 0} subs)</option>
            ))}
          </select>
        </div>

        <div>
          <label style={{ fontSize: '0.75rem', fontWeight: 600, color: 'var(--color-text-secondary)', display: 'block', marginBottom: '4px' }}>AUDIENCE SEGMENT (OPTIONAL)</label>
          <select
            className="input"
            value={selectedSegmentId}
            onChange={(e) => setSelectedSegmentId(e.target.value)}
          >
            <option value="">All Subscribers on List</option>
            {segments.map(s => (
              <option key={s.id} value={s.id}>{s.name}</option>
            ))}
          </select>
        </div>

        <div>
          <label style={{ fontSize: '0.75rem', fontWeight: 600, color: 'var(--color-text-secondary)', display: 'block', marginBottom: '4px' }}>INTERNAL TITLE</label>
          <input
            className="input"
            type="text"
            placeholder="e.g. September Product Update"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
          />
        </div>

        <div>
          <label style={{ fontSize: '0.75rem', fontWeight: 600, color: 'var(--color-text-secondary)', display: 'block', marginBottom: '4px' }}>EMAIL SUBJECT LINE</label>
          <input
            className="input"
            type="text"
            placeholder="e.g. Major updates inside..."
            value={subject}
            onChange={(e) => setSubject(e.target.value)}
          />
        </div>
      </div>

      {/* Main Workspace Area (Canvas + Sidebar) */}
      <div style={{ display: 'flex', flex: 1, overflow: 'hidden', position: 'relative' }}>
        
        {/* Left/Center Canvas Area */}
        <div style={{ flex: 1, overflowY: 'auto', padding: '2rem 1rem', display: 'flex', justifyContent: 'center', background: 'var(--color-bg-page)' }}>
          {editorMode === 'visual' ? (
            <div
              style={{
                width: viewportMode === 'desktop' ? '600px' : '360px',
                transition: 'width 0.25s ease',
                background: 'var(--color-bg-card)',
                borderRadius: 'var(--radius-lg)',
                border: '1px solid var(--color-border)',
                padding: '2rem 1.5rem',
                minHeight: '400px',
                boxShadow: 'var(--shadow-md)'
              }}
            >
              {blocks.map((block, index) => {
                const isSelected = block.id === selectedBlockId;
                return (
                  <div
                    key={block.id}
                    onClick={() => setSelectedBlockId(block.id)}
                    style={{
                      position: 'relative',
                      border: isSelected ? '1px solid var(--color-primary)' : '1px solid transparent',
                      borderRadius: 'var(--radius-sm)',
                      padding: '4px 8px',
                      marginBottom: '8px',
                      transition: 'all 0.15s ease',
                      cursor: 'pointer'
                    }}
                    onMouseEnter={(e) => {
                      if (!isSelected) e.currentTarget.style.borderColor = 'rgba(124, 58, 237, 0.3)';
                    }}
                    onMouseLeave={(e) => {
                      if (!isSelected) e.currentTarget.style.borderColor = 'transparent';
                    }}
                  >
                    {/* Block hover reorder & action controls */}
                    {isSelected && (
                      <div style={{
                        position: 'absolute',
                        top: '-12px',
                        right: '8px',
                        display: 'flex',
                        gap: '4px',
                        background: 'var(--color-bg-elevated)',
                        border: '1px solid var(--color-border)',
                        borderRadius: 'var(--radius-pill)',
                        padding: '2px 6px',
                        fontSize: '11px',
                        zIndex: 10
                      }}>
                        <button type="button" className="btn-ghost" style={{ padding: '0 4px' }} onClick={(e) => { e.stopPropagation(); moveBlock(block.id, 'up'); }}>[UP]</button>
                        <button type="button" className="btn-ghost" style={{ padding: '0 4px' }} onClick={(e) => { e.stopPropagation(); moveBlock(block.id, 'down'); }}>[DOWN]</button>
                        <button type="button" className="btn-ghost" style={{ padding: '0 4px', color: 'var(--color-error)' }} onClick={(e) => { e.stopPropagation(); deleteBlock(block.id); }}>[DEL]</button>
                      </div>
                    )}

                    {/* Block Render Output */}
                    <div dangerouslySetInnerHTML={{ __html: renderBlock(block) }} />
                  </div>
                );
              })}

              {/* Slash Command Trigger Input at bottom */}
              <div style={{ marginTop: '1.5rem', borderTop: '1px dashed var(--color-border)', paddingTop: '1rem', position: 'relative' }}>
                <input
                  type="text"
                  placeholder="Type '/' for slash commands or drag blocks from sidebar..."
                  className="input"
                  style={{ fontSize: '0.875rem' }}
                  value={slashFilter}
                  onChange={(e) => {
                    const val = e.target.value;
                    setSlashFilter(val);
                    if (val.startsWith('/')) {
                      setSlashMenuOpen(true);
                      setSlashBlockIndex(blocks.length);
                    } else {
                      setSlashMenuOpen(false);
                    }
                  }}
                />

                {/* Slash Menu Dropdown */}
                {slashMenuOpen && (
                  <div style={{
                    position: 'absolute',
                    bottom: '48px',
                    left: 0,
                    width: '280px',
                    background: 'var(--color-bg-elevated)',
                    border: '1px solid var(--color-border)',
                    borderRadius: 'var(--radius-md)',
                    boxShadow: 'var(--shadow-lg)',
                    padding: '6px',
                    zIndex: 20
                  }}>
                    <div style={{ fontSize: '11px', fontWeight: 600, color: 'var(--color-text-secondary)', padding: '4px 8px' }}>
                      INSERT COMPONENT
                    </div>
                    {[
                      { type: 'text', label: '/text', desc: 'Paragraph text' },
                      { type: 'heading', label: '/heading', desc: 'H1, H2, or H3' },
                      { type: 'button', label: '/button', desc: 'Call to action button' },
                      { type: 'columns', label: '/columns', desc: '2-column responsive grid' },
                      { type: 'divider', label: '/divider', desc: 'Separator line' },
                      { type: 'image', label: '/image', desc: 'Image or hero banner' },
                      { type: 'variable', label: '/variable', desc: 'Insert merge tag' },
                      { type: 'social', label: '/social', desc: 'Social media links' },
                      { type: 'footer', label: '/footer', desc: 'Unsubscribe compliance footer' }
                    ]
                      .filter(cmd => cmd.label.includes(slashFilter.toLowerCase()))
                      .map(cmd => (
                        <div
                          key={cmd.type}
                          onClick={() => { addBlock(cmd.type, slashBlockIndex); setSlashFilter(''); }}
                          style={{
                            padding: '6px 8px',
                            borderRadius: 'var(--radius-sm)',
                            cursor: 'pointer',
                            display: 'flex',
                            justifyContent: 'space-between',
                            alignItems: 'center'
                          }}
                          onMouseEnter={(e) => e.currentTarget.style.background = 'var(--color-bg-hover)'}
                          onMouseLeave={(e) => e.currentTarget.style.background = 'transparent'}
                        >
                          <span style={{ fontWeight: 600, color: 'var(--color-primary-light)', fontSize: '13px' }}>{cmd.label}</span>
                          <span style={{ fontSize: '11px', color: 'var(--color-text-secondary)' }}>{cmd.desc}</span>
                        </div>
                      ))}
                  </div>
                )}
              </div>
            </div>
          ) : (
            /* HTML Code View */
            <div style={{ width: '100%', maxWidth: '900px', height: '100%' }}>
              <textarea
                className="input mono"
                style={{ width: '100%', height: '500px', fontSize: '13px', lineHeight: '1.5', resize: 'vertical' }}
                value={htmlContent}
                onChange={(e) => setHtmlContent(e.target.value)}
              />
            </div>
          )}
        </div>

        {/* Right Collapsible Sidebar (Palette + Inspector) */}
        {sidebarOpen && editorMode === 'visual' && (
          <div style={{
            width: '320px',
            background: 'var(--color-bg-card)',
            borderLeft: '1px solid var(--color-border)',
            display: 'flex',
            flexDirection: 'column',
            overflowY: 'auto'
          }}>
            {/* Top: Block Palette */}
            <div style={{ padding: '1rem', borderBottom: '1px solid var(--color-border)' }}>
              <div style={{ fontSize: '0.75rem', fontWeight: 700, color: 'var(--color-text-secondary)', marginBottom: '0.75rem' }}>
                BLOCK PALETTE (CLICK TO ADD)
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: '0.5rem' }}>
                {[
                  { type: 'text', label: '[Aa] Text' },
                  { type: 'heading', label: '[H] Heading' },
                  { type: 'button', label: '[BTN] Button' },
                  { type: 'image', label: '[IMG] Image' },
                  { type: 'columns', label: '[COLS] 2-Column' },
                  { type: 'divider', label: '[---] Divider' },
                  { type: 'spacer', label: '[SPC] Spacer' },
                  { type: 'variable', label: '[VAR] Merge Tag' },
                  { type: 'social', label: '[SOC] Social' },
                  { type: 'footer', label: '[FTR] Footer' },
                  { type: 'header', label: '[HDR] Header' }
                ].map(item => (
                  <button
                    key={item.type}
                    type="button"
                    className="btn btn-secondary btn-sm"
                    style={{ justifyContent: 'center', fontSize: '12px' }}
                    onClick={() => addBlock(item.type)}
                  >
                    {item.label}
                  </button>
                ))}
              </div>
            </div>

            {/* Bottom: Property Inspector for Selected Block */}
            <div style={{ padding: '1rem', flex: 1 }}>
              <div style={{ fontSize: '0.75rem', fontWeight: 700, color: 'var(--color-text-secondary)', marginBottom: '0.75rem' }}>
                PROPERTIES: {selectedBlock ? selectedBlock.type.toUpperCase() : 'NO SELECTION'}
              </div>

              {selectedBlock ? (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
                  {/* Button Properties */}
                  {selectedBlock.type === 'button' && (
                    <>
                      <div>
                        <label style={{ fontSize: '11px', color: 'var(--color-text-secondary)' }}>BUTTON LABEL</label>
                        <input
                          className="input"
                          type="text"
                          value={selectedBlock.label || ''}
                          onChange={(e) => updateBlock(selectedBlock.id, { label: e.target.value })}
                        />
                      </div>
                      <div>
                        <label style={{ fontSize: '11px', color: 'var(--color-text-secondary)' }}>LINK URL</label>
                        <input
                          className="input"
                          type="text"
                          value={selectedBlock.url || ''}
                          onChange={(e) => updateBlock(selectedBlock.id, { url: e.target.value })}
                        />
                      </div>
                      <div>
                        <label style={{ fontSize: '11px', color: 'var(--color-text-secondary)' }}>BACKGROUND COLOR</label>
                        <input
                          className="input"
                          type="color"
                          style={{ height: '36px', padding: '2px' }}
                          value={selectedBlock.bgColor || '#7c3aed'}
                          onChange={(e) => updateBlock(selectedBlock.id, { bgColor: e.target.value })}
                        />
                      </div>
                      <div>
                        <label style={{ fontSize: '11px', color: 'var(--color-text-secondary)' }}>CORNER RADIUS</label>
                        <select
                          className="input"
                          value={selectedBlock.radius || 'pill'}
                          onChange={(e) => updateBlock(selectedBlock.id, { radius: e.target.value })}
                        >
                          <option value="pill">Pill (Rounded)</option>
                          <option value="rounded">Slightly Rounded (8px)</option>
                          <option value="square">Square (0px)</option>
                        </select>
                      </div>
                    </>
                  )}

                  {/* Heading Properties */}
                  {selectedBlock.type === 'heading' && (
                    <>
                      <div>
                        <label style={{ fontSize: '11px', color: 'var(--color-text-secondary)' }}>HEADING LEVEL</label>
                        <select
                          className="input"
                          value={selectedBlock.level || 1}
                          onChange={(e) => updateBlock(selectedBlock.id, { level: parseInt(e.target.value, 10) })}
                        >
                          <option value={1}>H1 (24px)</option>
                          <option value={2}>H2 (20px)</option>
                          <option value={3}>H3 (16px)</option>
                        </select>
                      </div>
                      <div>
                        <label style={{ fontSize: '11px', color: 'var(--color-text-secondary)' }}>TEXT</label>
                        <input
                          className="input"
                          type="text"
                          value={selectedBlock.text || ''}
                          onChange={(e) => updateBlock(selectedBlock.id, { text: e.target.value })}
                        />
                      </div>
                      <div>
                        <label style={{ fontSize: '11px', color: 'var(--color-text-secondary)' }}>ALIGNMENT</label>
                        <select
                          className="input"
                          value={selectedBlock.align || 'left'}
                          onChange={(e) => updateBlock(selectedBlock.id, { align: e.target.value })}
                        >
                          <option value="left">Left</option>
                          <option value="center">Center</option>
                          <option value="right">Right</option>
                        </select>
                      </div>
                    </>
                  )}

                  {/* Text Properties */}
                  {selectedBlock.type === 'text' && (
                    <>
                      <div>
                        <label style={{ fontSize: '11px', color: 'var(--color-text-secondary)' }}>HTML CONTENT</label>
                        <textarea
                          className="input"
                          rows={5}
                          value={selectedBlock.html || ''}
                          onChange={(e) => updateBlock(selectedBlock.id, { html: e.target.value })}
                        />
                      </div>
                    </>
                  )}

                  {/* Image Properties */}
                  {selectedBlock.type === 'image' && (
                    <>
                      <div>
                        <label style={{ fontSize: '11px', color: 'var(--color-text-secondary)' }}>IMAGE SOURCE URL</label>
                        <input
                          className="input"
                          type="text"
                          value={selectedBlock.src || ''}
                          onChange={(e) => updateBlock(selectedBlock.id, { src: e.target.value })}
                        />
                      </div>
                      <div>
                        <label style={{ fontSize: '11px', color: 'var(--color-text-secondary)' }}>ALT TEXT</label>
                        <input
                          className="input"
                          type="text"
                          value={selectedBlock.alt || ''}
                          onChange={(e) => updateBlock(selectedBlock.id, { alt: e.target.value })}
                        />
                      </div>
                    </>
                  )}

                  {/* Spacer Properties */}
                  {selectedBlock.type === 'spacer' && (
                    <div>
                      <label style={{ fontSize: '11px', color: 'var(--color-text-secondary)' }}>HEIGHT (PX): {selectedBlock.height || 24}px</label>
                      <input
                        type="range"
                        min="8"
                        max="64"
                        step="8"
                        value={selectedBlock.height || 24}
                        onChange={(e) => updateBlock(selectedBlock.id, { height: parseInt(e.target.value, 10) })}
                      />
                    </div>
                  )}

                  <button
                    type="button"
                    className="btn btn-danger btn-sm"
                    style={{ marginTop: '1rem' }}
                    onClick={() => deleteBlock(selectedBlock.id)}
                  >
                    [DELETE BLOCK]
                  </button>
                </div>
              ) : (
                <div style={{ fontSize: '13px', color: 'var(--color-text-secondary)', textAlign: 'center', padding: '2rem 0' }}>
                  Click any block on the canvas to inspect and edit its properties.
                </div>
              )}
            </div>
          </div>
        )}
      </div>

      {/* Bottom Dispatch & Test Action Bar */}
      <div style={{ padding: '0.75rem 1.5rem', background: 'var(--color-bg-card)', borderTop: '1px solid var(--color-border)', display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '0.75rem' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
          <input
            className="input"
            type="email"
            placeholder="Test recipient (you@domain.com)"
            value={testEmail}
            onChange={(e) => setTestEmail(e.target.value)}
            style={{ width: '240px' }}
          />
          <button
            type="button"
            className="btn btn-secondary btn-sm"
            onClick={handleTestSend}
            disabled={testing}
          >
            {testing ? 'Sending...' : 'Send Test'}
          </button>
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
          <button
            type="button"
            className="btn btn-ghost"
            onClick={onCancel}
          >
            Cancel
          </button>
          <button
            type="button"
            className="btn btn-secondary"
            onClick={() => handleSaveCampaign('draft')}
            disabled={saving}
          >
            Save Draft
          </button>
          <button
            type="button"
            className="btn btn-primary"
            onClick={() => handleSaveCampaign('sending')}
            disabled={saving}
          >
            {saving ? 'Processing...' : 'Broadcast Campaign'}
          </button>
        </div>
      </div>

      {/* Templates Picker Modal */}
      {showTemplatesModal && (
        <div className="modal-backdrop" onClick={() => setShowTemplatesModal(false)} style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.7)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 9999 }}>
          <div className="card" onClick={(e) => e.stopPropagation()} style={{ width: '90%', maxWidth: '720px', maxHeight: '80vh', overflowY: 'auto' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.5rem' }}>
              <h3 style={{ margin: 0 }}>Select Starter Template</h3>
              <button type="button" className="btn-ghost" onClick={() => setShowTemplatesModal(false)}>[CLOSE]</button>
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '1rem' }}>
              {STARTER_TEMPLATES.map(tmpl => (
                <div
                  key={tmpl.id}
                  className="card"
                  onClick={() => loadTemplate(tmpl.id)}
                  style={{ cursor: 'pointer', padding: '1rem', border: '1px solid var(--color-border)', transition: 'border-color 0.2s' }}
                  onMouseEnter={(e) => e.currentTarget.style.borderColor = 'var(--color-primary)'}
                  onMouseLeave={(e) => e.currentTarget.style.borderColor = 'var(--color-border)'}
                >
                  <span className="badge badge-purple" style={{ marginBottom: '8px' }}>{tmpl.badge}</span>
                  <div style={{ fontWeight: 600, fontSize: '14px', marginBottom: '4px' }}>{tmpl.name}</div>
                  <div style={{ fontSize: '12px', color: 'var(--color-text-secondary)' }}>{tmpl.description}</div>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* Spam Score Modal */}
      {showSpamModal && (
        <div className="modal-backdrop" onClick={() => setShowSpamModal(false)} style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.7)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 9999 }}>
          <div className="card" onClick={(e) => e.stopPropagation()} style={{ width: '90%', maxWidth: '520px' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1rem' }}>
              <h3 style={{ margin: 0 }}>Spam Score Analysis</h3>
              <button type="button" className="btn-ghost" onClick={() => setShowSpamModal(false)}>[CLOSE]</button>
            </div>
            {checkingSpam ? (
              <div style={{ padding: '2rem', textAlign: 'center' }}>Evaluating email heuristics...</div>
            ) : spamAnalysis ? (
              <div>
                <div style={{ display: 'flex', alignItems: 'center', gap: '1rem', marginBottom: '1.5rem', background: 'var(--color-bg-elevated)', padding: '1rem', borderRadius: 'var(--radius-md)' }}>
                  <div style={{ fontSize: '2rem', fontWeight: 800, color: spamAnalysis.riskLevel === 'LOW' ? 'var(--color-success)' : spamAnalysis.riskLevel === 'MODERATE' ? 'var(--color-warning)' : 'var(--color-error)' }}>
                    {spamAnalysis.score} <span style={{ fontSize: '1rem', color: 'var(--color-text-secondary)' }}>/ 10</span>
                  </div>
                  <div>
                    <div style={{ fontWeight: 700 }}>{spamAnalysis.badge}</div>
                    <div style={{ fontSize: '12px', color: 'var(--color-text-secondary)' }}>
                      {spamAnalysis.isCompliant ? 'Deliverability posture is strong.' : 'High likelihood of landing in junk.'}
                    </div>
                  </div>
                </div>

                <div style={{ fontSize: '12px', fontWeight: 600, color: 'var(--color-text-secondary)', marginBottom: '8px' }}>RULES TRIGGERED:</div>
                {spamAnalysis.rulesTriggered && spamAnalysis.rulesTriggered.length > 0 ? (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', maxHeight: '240px', overflowY: 'auto' }}>
                    {spamAnalysis.rulesTriggered.map((rule, idx) => (
                      <div key={idx} style={{ padding: '8px', background: 'var(--color-bg-input)', borderRadius: 'var(--radius-sm)', borderLeft: '3px solid var(--color-warning)' }}>
                        <div style={{ fontWeight: 600, fontSize: '13px' }}>{rule.name} (+{rule.penalty} pts)</div>
                        <div style={{ fontSize: '12px', color: 'var(--color-text-secondary)', margin: '2px 0' }}>{rule.description}</div>
                        <div style={{ fontSize: '11px', color: 'var(--color-primary-light)' }}>Suggestion: {rule.recommendation}</div>
                      </div>
                    ))}
                  </div>
                ) : (
                  <div style={{ fontSize: '13px', color: 'var(--color-success)', padding: '0.5rem 0' }}>[PASS] No spam flags triggered. Clean draft!</div>
                )}
              </div>
            ) : null}
          </div>
        </div>
      )}

      {/* Compatibility Modal */}
      {showCompatModal && (
        <div className="modal-backdrop" onClick={() => setShowCompatModal(false)} style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.7)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 9999 }}>
          <div className="card" onClick={(e) => e.stopPropagation()} style={{ width: '90%', maxWidth: '560px' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1rem' }}>
              <h3 style={{ margin: 0 }}>Client Compatibility Report</h3>
              <button type="button" className="btn-ghost" onClick={() => setShowCompatModal(false)}>[CLOSE]</button>
            </div>
            {compatAnalysis && (
              <div>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '0.5rem', marginBottom: '1.5rem' }}>
                  {Object.entries(compatAnalysis.clientMatrix).map(([clientKey, info]) => (
                    <div key={clientKey} style={{ background: 'var(--color-bg-elevated)', padding: '0.75rem', borderRadius: 'var(--radius-md)', textAlign: 'center' }}>
                      <div style={{ fontSize: '11px', color: 'var(--color-text-secondary)', textTransform: 'uppercase' }}>{clientKey}</div>
                      <div style={{ fontWeight: 700, fontSize: '13px', marginTop: '4px', color: info.status === 'PASS' ? 'var(--color-success)' : info.status === 'WARN' ? 'var(--color-warning)' : 'var(--color-error)' }}>
                        [{info.status}]
                      </div>
                    </div>
                  ))}
                </div>

                <div style={{ fontSize: '12px', fontWeight: 600, color: 'var(--color-text-secondary)', marginBottom: '8px' }}>COMPATIBILITY WARNINGS:</div>
                {compatAnalysis.issues.length > 0 ? (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', maxHeight: '220px', overflowY: 'auto' }}>
                    {compatAnalysis.issues.map((issue, i) => (
                      <div key={i} style={{ padding: '8px', background: 'var(--color-bg-input)', borderRadius: 'var(--radius-sm)', borderLeft: '3px solid var(--color-warning)' }}>
                        <div style={{ fontWeight: 600, fontSize: '13px' }}>{issue.client}: {issue.feature}</div>
                        <div style={{ fontSize: '12px', color: 'var(--color-text-secondary)', margin: '2px 0' }}>{issue.message}</div>
                        <div style={{ fontSize: '11px', color: 'var(--color-primary-light)' }}>Fix: {issue.suggestion}</div>
                      </div>
                    ))}
                  </div>
                ) : (
                  <div style={{ fontSize: '13px', color: 'var(--color-success)' }}>[PASS] No compatibility issues found. HTML is optimized across all clients.</div>
                )}
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
