import React, { useState, useEffect } from 'react';
import { get, post, del, put } from '../../shared/api.js';

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

  useEffect(() => {
    loadTemplates();
  }, []);

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

  const handleDelete = async (id, name) => {
    if (!window.confirm(`Delete template "${name}"?`)) return;
    try {
      await del(`/api/templates/${id}`);
      await loadTemplates();
    } catch (err) {
      setError(err.message || 'Failed to delete template.');
    }
  };

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
                  <button className="btn btn-ghost btn-sm" onClick={() => handleEdit(tmpl)}>Edit</button>
                  <button className="btn btn-danger btn-sm" onClick={() => handleDelete(tmpl.id, tmpl.name)}>Delete</button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Template Builder Form */}
      <div className="card">
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
      </div>
    </div>
  );
}
