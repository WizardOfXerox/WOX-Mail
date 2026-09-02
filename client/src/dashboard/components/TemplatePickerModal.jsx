import React, { useState, useEffect } from 'react';
import { get, post } from '../../shared/api.js';

export default function TemplatePickerModal({ isOpen, onClose, onSelectTemplate }) {
  const [templates, setTemplates] = useState([]);
  const [loading, setLoading] = useState(false);
  const [selectedTmpl, setSelectedTmpl] = useState(null);
  const [variableValues, setVariableValues] = useState({});

  useEffect(() => {
    if (isOpen) {
      setLoading(true);
      setSelectedTmpl(null);
      setVariableValues({});
      get('/api/templates')
        .then(res => setTemplates(res.templates || []))
        .catch(err => console.error('Failed to load templates:', err))
        .finally(() => setLoading(false));
    }
  }, [isOpen]);

  if (!isOpen) return null;

  const handleSelect = (tmpl) => {
    setSelectedTmpl(tmpl);
    const initialVals = {};
    (tmpl.variables || []).forEach(v => {
      initialVals[v] = '';
    });
    setVariableValues(initialVals);
  };

  const handleInsert = async () => {
    if (!selectedTmpl) return;

    if (selectedTmpl.variables?.length > 0) {
      try {
        const res = await post(`/api/templates/${selectedTmpl.id}/render`, { values: variableValues });
        onSelectTemplate(res.rendered);
        onClose();
      } catch (err) {
        console.error('Failed to render template:', err);
      }
    } else {
      onSelectTemplate({
        subject: selectedTmpl.subject,
        body_html: selectedTmpl.body_html,
        body_text: selectedTmpl.body_text
      });
      onClose();
    }
  };

  return (
    <div
      style={{
        position: 'fixed',
        inset: 0,
        backgroundColor: 'rgba(10, 10, 20, 0.75)',
        backdropFilter: 'blur(8px)',
        zIndex: 10001,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: '1rem'
      }}
      onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}
    >
      <div
        className="card"
        style={{
          width: '100%',
          maxWidth: '680px',
          maxHeight: '85vh',
          display: 'flex',
          flexDirection: 'column',
          padding: 0,
          overflow: 'hidden',
          boxShadow: 'var(--shadow-lg)',
          borderRadius: 'var(--radius-lg)'
        }}
      >
        <div style={{ padding: '1rem 1.5rem', borderBottom: '1px solid var(--color-border)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.6rem' }}>
            <span style={{ display: 'inline-flex', color: 'var(--color-primary-light)' }}>
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
                <polyline points="14 2 14 8 20 8" />
                <line x1="16" y1="13" x2="8" y2="13" />
                <line x1="16" y1="17" x2="8" y2="17" />
                <polyline points="10 9 9 9 8 9" />
              </svg>
            </span>
            <strong style={{ fontSize: '1.1rem' }}>Insert Email Template</strong>
          </div>
          <button className="btn btn-ghost btn-sm" onClick={onClose} aria-label="Close" style={{ display: 'inline-flex', alignItems: 'center', justifyContent: 'center' }}>
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
              <line x1="18" y1="6" x2="6" y2="18" />
              <line x1="6" y1="6" x2="18" y2="18" />
            </svg>
          </button>
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: selectedTmpl ? '1fr 1fr' : '1fr', flex: 1, overflow: 'hidden' }}>
          {/* Templates Column */}
          <div style={{ padding: '1rem', overflowY: 'auto', borderRight: selectedTmpl ? '1px solid var(--color-border)' : 'none', maxHeight: '55vh' }}>
            {loading ? (
              <p className="text-secondary" style={{ padding: '1rem' }}>Loading templates...</p>
            ) : templates.length === 0 ? (
              <div style={{ padding: '2rem 1rem', textAlign: 'center' }}>
                <p className="text-secondary">No templates found.</p>
                <a href="/settings#templates" className="btn btn-primary btn-sm" style={{ marginTop: '0.5rem', display: 'inline-block' }}>
                  Create Templates
                </a>
              </div>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
                {templates.map(tmpl => (
                  <div
                    key={tmpl.id}
                    onClick={() => handleSelect(tmpl)}
                    style={{
                      padding: '0.75rem 1rem',
                      borderRadius: 'var(--radius-md)',
                      border: selectedTmpl?.id === tmpl.id ? '2px solid var(--color-primary)' : '1px solid var(--color-border)',
                      background: selectedTmpl?.id === tmpl.id ? 'rgba(124, 58, 237, 0.12)' : 'var(--color-bg-elevated)',
                      cursor: 'pointer'
                    }}
                  >
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.2rem' }}>
                      <strong style={{ fontSize: '0.875rem' }}>{tmpl.name}</strong>
                      <span className="badge badge-purple" style={{ fontSize: '0.625rem' }}>{tmpl.category}</span>
                    </div>
                    {tmpl.subject && (
                      <div className="text-secondary" style={{ fontSize: '0.75rem', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                        {tmpl.subject}
                      </div>
                    )}
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Fill Variables & Preview Column */}
          {selectedTmpl && (
            <div style={{ padding: '1rem', overflowY: 'auto', maxHeight: '55vh', background: 'var(--color-bg-page)' }}>
              <strong style={{ display: 'block', fontSize: '0.9375rem', marginBottom: '0.75rem', color: 'var(--color-primary-light)' }}>
                Template Variables
              </strong>

              {selectedTmpl.variables?.length > 0 ? (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem', marginBottom: '1rem' }}>
                  {selectedTmpl.variables.map(v => (
                    <div key={v}>
                      <label style={{ display: 'block', marginBottom: '0.25rem', fontSize: '0.75rem', fontWeight: 600, textTransform: 'capitalize' }}>
                        {`{{${v}}}`}
                      </label>
                      <input
                        type="text"
                        className="input"
                        placeholder={`Value for ${v}...`}
                        value={variableValues[v] || ''}
                        onChange={(e) => setVariableValues({ ...variableValues, [v]: e.target.value })}
                        style={{ fontSize: '0.8125rem' }}
                      />
                    </div>
                  ))}
                </div>
              ) : (
                <p className="text-secondary" style={{ fontSize: '0.8125rem' }}>
                  This template does not require any dynamic variables.
                </p>
              )}

              <div style={{ marginTop: '1rem' }}>
                <strong style={{ display: 'block', fontSize: '0.75rem', color: 'var(--color-text-tertiary)', marginBottom: '0.35rem' }}>
                  Preview:
                </strong>
                <div style={{ fontSize: '0.8125rem', padding: '0.75rem', background: 'var(--color-bg-card)', borderRadius: 'var(--radius-sm)', border: '1px solid var(--color-border)' }}>
                  {selectedTmpl.body_html.replace(/<[^>]*>?/gm, '')}
                </div>
              </div>
            </div>
          )}
        </div>

        {selectedTmpl && (
          <div style={{ padding: '0.75rem 1.5rem', borderTop: '1px solid var(--color-border)', display: 'flex', justifyContent: 'flex-end', gap: '0.5rem', background: 'var(--color-bg-elevated)' }}>
            <button className="btn btn-secondary btn-sm" onClick={onClose}>Cancel</button>
            <button className="btn btn-primary btn-sm" onClick={handleInsert}>Insert into Compose</button>
          </div>
        )}
      </div>
    </div>
  );
}
