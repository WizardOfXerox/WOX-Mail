import React, { useState, useEffect } from 'react';
import { get, post, del, put } from '../../shared/api.js';

function extractTemplateVars(subject = '', body = '') {
  const combined = `${subject}\n${body}`;
  const matches = combined.matchAll(/\{\{([a-zA-Z0-9_]+)\}\}/g);
  const set = new Set(['name', 'company']);
  for (const m of matches) {
    set.add(m[1]);
  }
  return Array.from(set);
}

function interpolateTemplate(text = '', values = {}) {
  if (!text) return '';
  return text.replace(/\{\{([a-zA-Z0-9_]+)\}\}/g, (match, key) => {
    if (values[key] !== undefined && values[key] !== '') return values[key];
    if (key === 'date') return new Date().toLocaleDateString();
    return match;
  });
}

export default function TemplatesSection() {
  const [templates, setTemplates] = useState([]);
  const [loading, setLoading] = useState(true);
  const [editingId, setEditingId] = useState(null);
  const [form, setForm] = useState({
    name: '',
    category: 'Sales',
    subject: '',
    body_html: ''
  });
  const [testValues, setTestValues] = useState({ name: 'Alex', company: 'Acme Corp' });
  const [renderedPreview, setRenderedPreview] = useState(null);

  // Snippets CRUD state
  const [snippets, setSnippets] = useState([]);
  const [snippetsLoading, setSnippetsLoading] = useState(true);
  const [editingSnippetId, setEditingSnippetId] = useState(null);
  const [snippetForm, setSnippetForm] = useState({ shortcut: '', title: '', contentHtml: '' });
  const [savingSnippet, setSavingSnippet] = useState(false);

  const [error, setError] = useState(null);
  const [success, setSuccess] = useState(null);

  const loadTemplates = async () => {
    try {
      setLoading(true);
      const res = await get('/api/templates');
      setTemplates(res.templates || []);
    } catch (err) {
      setError(err.message || 'Failed to load templates.');
    } finally {
      setLoading(false);
    }
  };

  const loadSnippets = async () => {
    try {
      setSnippetsLoading(true);
      const res = await get('/api/snippets');
      setSnippets(res.snippets || []);
    } catch (err) {
      setError(err.message || 'Failed to load snippets.');
    } finally {
      setSnippetsLoading(false);
    }
  };

  useEffect(() => {
    loadTemplates();
    loadSnippets();
  }, []);

  useEffect(() => {
    if (!form.subject && !form.body_html) {
      setRenderedPreview(null);
      return;
    }
    setRenderedPreview({
      subject: interpolateTemplate(form.subject, testValues),
      body_html: interpolateTemplate(form.body_html, testValues),
    });
  }, [form.subject, form.body_html, testValues]);

  const handleSave = async (e) => {
    e.preventDefault();
    if (!form.name || !form.body_html) {
      setError('Template name and body content are required.');
      return;
    }
    try {
      setError(null);
      if (editingId) {
        await put(`/api/templates/${editingId}`, form);
        setSuccess('Template updated successfully!');
      } else {
        await post('/api/templates', form);
        setSuccess('Template created successfully!');
      }
      setForm({ name: '', category: 'Sales', subject: '', body_html: '' });
      setEditingId(null);
      await loadTemplates();
    } catch (err) {
      setError(err.message || 'Failed to save template.');
    }
  };

  const handleEdit = (tmpl) => {
    setEditingId(tmpl.id);
    setForm({
      name: tmpl.name,
      category: tmpl.category || 'General',
      subject: tmpl.subject || '',
      body_html: tmpl.body_html || ''
    });
  };

  const handlePreviewTemplate = async (tmpl) => {
    try {
      setError(null);
      const res = await post(`/api/templates/${tmpl.id}/render`, { values: testValues });
      if (res?.rendered) {
        setRenderedPreview({
          title: tmpl.name,
          subject: res.rendered.subject || '',
          body_html: res.rendered.body_html || res.rendered.body_text || '',
        });
      }
    } catch (err) {
      setError(err.message || 'Failed to render template preview.');
    }
  };

  const handleDelete = async (id, name) => {
    if (!window.confirm(`Delete template "${name}"?`)) return;
    try {
      await del(`/api/templates/${id}`);
      await loadTemplates();
    } catch (err) {
      setError(err.message || 'Failed to delete template.');
    }
  };

  const handleSaveSnippet = async (e) => {
    e.preventDefault();
    const shortcut = snippetForm.shortcut.replace(/^\/+/, '').trim().toLowerCase();
    const title = snippetForm.title.trim();
    const contentHtml = snippetForm.contentHtml.trim();
    if (!shortcut || !title || !contentHtml) {
      setError('Snippet shortcut, title, and content are required.');
      return;
    }
    try {
      setSavingSnippet(true);
      setError(null);
      setSuccess(null);
      if (editingSnippetId) {
        await put(`/api/snippets/${editingSnippetId}`, { shortcut, title, contentHtml });
        setSuccess(`Snippet /${shortcut} updated!`);
      } else {
        await post('/api/snippets', { shortcut, title, contentHtml });
        setSuccess(`Snippet /${shortcut} created!`);
      }
      setEditingSnippetId(null);
      setSnippetForm({ shortcut: '', title: '', contentHtml: '' });
      await loadSnippets();
    } catch (err) {
      setError(err.message || 'Failed to save snippet.');
    } finally {
      setSavingSnippet(false);
    }
  };

  const handleDeleteSnippet = async (id, shortcut) => {
    if (!window.confirm(`Delete snippet "/${shortcut}"?`)) return;
    try {
      setError(null);
      await del(`/api/snippets/${id}`);
      setSuccess(`Snippet /${shortcut} deleted.`);
      await loadSnippets();
    } catch (err) {
      setError(err.message || 'Failed to delete snippet.');
    }
  };

  const detectedVars = extractTemplateVars(form.subject, form.body_html);

  return (
    <div className="settings-section">
      <div className="section-header">
        <h2>Email Templates & Snippets</h2>
        <p className="text-secondary">
          Create reusable message templates with dynamic variable placeholders (e.g. <code>{'{{name}}'}</code>, <code>{'{{company}}'}</code>, <code>{'{{date}}'}</code>).
        </p>
      </div>

      {error && <div className="toast toast-error" style={{ position: 'static', marginBottom: '1rem', width: '100%' }}>{error}</div>}
      {success && <div className="toast toast-success" style={{ position: 'static', marginBottom: '1rem', width: '100%' }}>{success}</div>}

      {/* Templates List */}
      <div className="card" style={{ marginBottom: '2rem' }}>
        <h3 style={{ marginBottom: '1rem' }}>Saved Templates ({templates.length})</h3>
        {loading ? (
          <p className="text-secondary">Loading templates...</p>
        ) : templates.length === 0 ? (
          <p className="text-secondary">No templates created yet. Create your first template below.</p>
        ) : (
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: '1rem' }}>
            {templates.map((tmpl) => (
              <div
                key={tmpl.id}
                style={{
                  padding: '1rem',
                  background: 'var(--color-bg-elevated)',
                  borderRadius: 'var(--radius-md)',
                  border: '1px solid var(--color-border)',
                  display: 'flex',
                  flexDirection: 'column',
                  justifyContent: 'space-between'
                }}
              >
                <div>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.4rem' }}>
                    <strong style={{ fontSize: '0.9375rem' }}>{tmpl.name}</strong>
                    <span className="badge badge-purple" style={{ fontSize: '0.6875rem' }}>{tmpl.category}</span>
                  </div>
                  {tmpl.subject && (
                    <div style={{ fontSize: '0.8125rem', color: 'var(--color-primary-light)', marginBottom: '0.4rem' }}>
                      Subject: {tmpl.subject}
                    </div>
                  )}
                  <div
                    className="text-secondary"
                    style={{
                      fontSize: '0.75rem',
                      display: '-webkit-box',
                      WebkitLineClamp: 3,
                      WebkitBoxOrient: 'vertical',
                      overflow: 'hidden'
                    }}
                  >
                    {tmpl.body_html.replace(/<[^>]*>?/gm, '')}
                  </div>
                  {tmpl.variables?.length > 0 && (
                    <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.25rem', marginTop: '0.5rem' }}>
                      {tmpl.variables.map((v) => (
                        <span key={v} className="badge" style={{ fontSize: '0.625rem', background: 'rgba(255,255,255,0.06)' }}>
                          {`{{${v}}}`}
                        </span>
                      ))}
                    </div>
                  )}
                </div>

                <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '0.5rem', marginTop: '1rem', borderTop: '1px solid var(--color-border)', paddingTop: '0.5rem' }}>
                  <button type="button" className="btn btn-ghost btn-sm" onClick={() => handlePreviewTemplate(tmpl)}>Preview</button>
                  <button type="button" className="btn btn-ghost btn-sm" onClick={() => handleEdit(tmpl)}>Edit</button>
                  <button type="button" className="btn btn-danger btn-sm" onClick={() => handleDelete(tmpl.id, tmpl.name)}>Delete</button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Template Builder Form */}
      <div className="card" style={{ marginBottom: '2rem' }}>
        <h3 style={{ marginBottom: '1rem' }}>{editingId ? 'Edit Template' : 'Create New Template'}</h3>
        <form onSubmit={handleSave}>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))', gap: '1rem', marginBottom: '1rem' }}>
            <div>
              <label style={{ display: 'block', marginBottom: '0.4rem', fontSize: '0.875rem' }}>Template Name</label>
              <input
                type="text"
                className="input"
                required
                placeholder="e.g. Meeting Follow-up"
                value={form.name}
                onChange={(e) => setForm({ ...form, name: e.target.value })}
              />
            </div>
            <div>
              <label style={{ display: 'block', marginBottom: '0.4rem', fontSize: '0.875rem' }}>Category</label>
              <input
                type="text"
                className="input"
                placeholder="Sales, Support, Follow-up..."
                value={form.category}
                onChange={(e) => setForm({ ...form, category: e.target.value })}
              />
            </div>
          </div>

          <div style={{ marginBottom: '1rem' }}>
            <label style={{ display: 'block', marginBottom: '0.4rem', fontSize: '0.875rem' }}>Default Subject Line</label>
            <input
              type="text"
              className="input"
              placeholder="e.g. Great meeting you at {{company}}!"
              value={form.subject}
              onChange={(e) => setForm({ ...form, subject: e.target.value })}
            />
          </div>

          <div style={{ marginBottom: '1rem' }}>
            <label style={{ display: 'block', marginBottom: '0.4rem', fontSize: '0.875rem' }}>Email Body</label>
            <textarea
              className="input"
              rows={6}
              required
              placeholder="Hi {{name}},\n\nThank you for taking the time to speak today..."
              value={form.body_html}
              onChange={(e) => setForm({ ...form, body_html: e.target.value })}
              style={{ width: '100%', resize: 'vertical' }}
            />
          </div>

          <div style={{ display: 'flex', gap: '0.75rem' }}>
            <button type="submit" className="btn btn-primary">
              {editingId ? 'Update Template' : 'Save Template'}
            </button>
            {editingId && (
              <button
                type="button"
                className="btn btn-secondary"
                onClick={() => {
                  setEditingId(null);
                  setForm({ name: '', category: 'Sales', subject: '', body_html: '' });
                }}
              >
                Cancel Edit
              </button>
            )}
          </div>
        </form>

        {/* Live Variable Tester & Rendered Preview */}
        <div style={{ marginTop: '1.5rem', paddingTop: '1.25rem', borderTop: '1px solid var(--color-border)' }}>
          <h4 style={{ fontSize: '0.95rem', marginBottom: '0.65rem' }}>Live Placeholder Preview</h4>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(170px, 1fr))', gap: '0.65rem', marginBottom: '1rem' }}>
            {detectedVars.map((varName) => (
              <div key={varName}>
                <label className="text-secondary" style={{ display: 'block', fontSize: '0.75rem', marginBottom: '0.25rem' }}>
                  <code>{`{{${varName}}}`}</code>
                </label>
                <input
                  type="text"
                  className="input input-sm"
                  placeholder={`Test ${varName}...`}
                  value={testValues[varName] ?? ''}
                  onChange={(e) => setTestValues((prev) => ({ ...prev, [varName]: e.target.value }))}
                />
              </div>
            ))}
          </div>

          {renderedPreview ? (
            <div style={{ padding: '1rem', background: 'var(--color-bg-page)', borderRadius: 'var(--radius-md)', border: '1px solid var(--color-border)' }}>
              {renderedPreview.title && (
                <div className="text-secondary" style={{ fontSize: '0.75rem', marginBottom: '0.25rem' }}>
                  Previewing saved template: <strong>{renderedPreview.title}</strong>
                </div>
              )}
              <div style={{ fontSize: '0.85rem', marginBottom: '0.5rem' }}>
                <strong>Subject:</strong> {renderedPreview.subject || '(no subject)'}
              </div>
              <iframe
                title="Template Live Preview"
                sandbox=""
                srcDoc={`<!DOCTYPE html><html><body style="margin:0;padding:12px;font-family:-apple-system,BlinkMacSystemFont,Segoe UI,Roboto,sans-serif;font-size:14px;line-height:1.5;color:#e5e7eb;background:#111827;white-space:pre-wrap;">${renderedPreview.body_html || ''}</body></html>`}
                style={{ width: '100%', minHeight: 140, border: '1px solid var(--color-border)', borderRadius: 'var(--radius-sm)', background: '#111827' }}
              />
            </div>
          ) : (
            <p className="text-secondary" style={{ fontSize: '0.8125rem', margin: 0 }}>
              Type a template above or click <strong>Preview</strong> on any saved template to inspect interpolated variables.
            </p>
          )}
        </div>
      </div>

      {/* Quick Text Snippets (/shortcut CRUD) */}
      <div className="card">
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1rem', flexWrap: 'wrap', gap: '0.5rem' }}>
          <div>
            <h3 style={{ margin: 0 }}>Quick Text Snippets ({snippets.length})</h3>
            <p className="text-secondary" style={{ fontSize: '0.8125rem', margin: '0.25rem 0 0 0' }}>
              Trigger reusable canned phrases in the composer using <code>/shortcut</code> commands.
            </p>
          </div>
        </div>

        {snippetsLoading ? (
          <p className="text-secondary">Loading snippets...</p>
        ) : snippets.length === 0 ? (
          <p className="text-secondary" style={{ fontSize: '0.875rem', marginBottom: '1.25rem' }}>
            No snippets created yet. Add your first shortcut below.
          </p>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '0.65rem', marginBottom: '1.5rem' }}>
            {snippets.map((s) => (
              <div
                key={s.id}
                style={{
                  display: 'flex',
                  justifyContent: 'space-between',
                  alignItems: 'center',
                  gap: '1rem',
                  padding: '0.85rem 1rem',
                  background: 'var(--color-bg-elevated)',
                  border: '1px solid var(--color-border)',
                  borderRadius: 'var(--radius-md)',
                  flexWrap: 'wrap',
                }}
              >
                <div style={{ flex: 1, minWidth: 200 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '0.25rem' }}>
                    <code className="badge badge-purple mono" style={{ fontSize: '0.75rem' }}>/{s.shortcut}</code>
                    <strong style={{ fontSize: '0.9rem' }}>{s.title}</strong>
                  </div>
                  <div className="text-secondary" style={{ fontSize: '0.78rem', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', maxWidth: 520 }}>
                    {(s.content_html || '').replace(/<[^>]*>?/gm, '')}
                  </div>
                </div>
                <div style={{ display: 'flex', gap: '0.4rem' }}>
                  <button
                    type="button"
                    className="btn btn-ghost btn-xs"
                    onClick={() => {
                      setEditingSnippetId(s.id);
                      setSnippetForm({
                        shortcut: s.shortcut || '',
                        title: s.title || '',
                        contentHtml: s.content_html || '',
                      });
                    }}
                  >
                    Edit
                  </button>
                  <button
                    type="button"
                    className="btn btn-danger btn-xs"
                    onClick={() => handleDeleteSnippet(s.id, s.shortcut)}
                  >
                    Delete
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}

        <form onSubmit={handleSaveSnippet} style={{ paddingTop: '1rem', borderTop: '1px solid var(--color-border)', display: 'flex', flexDirection: 'column', gap: '0.85rem' }}>
          <h4 style={{ margin: 0, fontSize: '0.95rem' }}>{editingSnippetId ? 'Edit Snippet' : 'Add New Snippet'}</h4>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: '0.75rem' }}>
            <div>
              <label style={{ display: 'block', marginBottom: '0.35rem', fontSize: '0.8125rem' }}>Shortcut Trigger</label>
              <input
                type="text"
                className="input mono"
                required
                placeholder="e.g. intro (typed as /intro)"
                value={snippetForm.shortcut}
                onChange={(e) => setSnippetForm({ ...snippetForm, shortcut: e.target.value })}
              />
            </div>
            <div>
              <label style={{ display: 'block', marginBottom: '0.35rem', fontSize: '0.8125rem' }}>Snippet Title</label>
              <input
                type="text"
                className="input"
                required
                placeholder="e.g. Quick Meeting Intro"
                value={snippetForm.title}
                onChange={(e) => setSnippetForm({ ...snippetForm, title: e.target.value })}
              />
            </div>
          </div>
          <div>
            <label style={{ display: 'block', marginBottom: '0.35rem', fontSize: '0.8125rem' }}>Snippet Content</label>
            <textarea
              className="input"
              rows={3}
              required
              placeholder="Thanks for reaching out! Here is my calendar link..."
              value={snippetForm.contentHtml}
              onChange={(e) => setSnippetForm({ ...snippetForm, contentHtml: e.target.value })}
            />
          </div>
          <div style={{ display: 'flex', gap: '0.6rem' }}>
            <button type="submit" className="btn btn-primary btn-sm" disabled={savingSnippet}>
              {savingSnippet ? 'Saving...' : editingSnippetId ? 'Update Snippet' : 'Save Snippet'}
            </button>
            {editingSnippetId && (
              <button
                type="button"
                className="btn btn-secondary btn-sm"
                onClick={() => {
                  setEditingSnippetId(null);
                  setSnippetForm({ shortcut: '', title: '', contentHtml: '' });
                }}
              >
                Cancel Edit
              </button>
            )}
          </div>
        </form>
      </div>
    </div>
  );
}
