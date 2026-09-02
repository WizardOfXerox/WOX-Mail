import React, { useState, useEffect } from 'react';
import { apiFetch } from '../../shared/api.js';

/**
 * Labels management panel — create, edit, delete color-coded labels.
 */
export default function LabelsPanel({ onApplyLabel }) {
  const [labels, setLabels] = useState([]);
  const [adding, setAdding] = useState(false);
  const [newName, setNewName] = useState('');
  const [newColor, setNewColor] = useState('#7c3aed');
  const [editingId, setEditingId] = useState(null);

  const presetColors = ['#7c3aed', '#2563eb', '#0891b2', '#059669', '#d97706', '#dc2626', '#db2777', '#6366f1'];

  useEffect(() => {
    loadLabels();
  }, []);

  async function loadLabels() {
    try {
      const data = await apiFetch('/api/mail/labels');
      setLabels(data.labels || []);
    } catch (err) {
      console.error('Failed to load labels:', err);
    }
  }

  async function handleCreate() {
    if (!newName.trim()) return;
    try {
      await apiFetch('/api/mail/labels', {
        method: 'POST',
        body: JSON.stringify({ name: newName.trim(), color: newColor }),
      });
      setNewName('');
      setAdding(false);
      loadLabels();
    } catch (err) {
      console.error('Failed to create label:', err);
    }
  }

  async function handleDelete(id) {
    if (!confirm('Delete this label?')) return;
    try {
      await apiFetch(`/api/mail/labels/${id}`, { method: 'DELETE' });
      loadLabels();
    } catch (err) {
      console.error('Failed to delete label:', err);
    }
  }

  async function handleUpdate(id, updates) {
    try {
      await apiFetch(`/api/mail/labels/${id}`, {
        method: 'PUT',
        body: JSON.stringify(updates),
      });
      setEditingId(null);
      loadLabels();
    } catch (err) {
      console.error('Failed to update label:', err);
    }
  }

  return (
    <div className="labels-panel">
      <div className="labels-header">
        <h3>Labels</h3>
        <button className="btn btn-sm btn-ghost" onClick={() => setAdding(!adding)}>
          {adding ? '✕' : '+'}
        </button>
      </div>

      {adding && (
        <div className="labels-add-form">
          <input
            placeholder="Label name"
            value={newName}
            onChange={(e) => setNewName(e.target.value)}
            className="input-field"
            onKeyDown={(e) => e.key === 'Enter' && handleCreate()}
          />
          <div className="labels-color-picker">
            {presetColors.map((c) => (
              <button
                key={c}
                className={`color-swatch ${newColor === c ? 'active' : ''}`}
                style={{ backgroundColor: c }}
                onClick={() => setNewColor(c)}
              />
            ))}
          </div>
          <button className="btn btn-sm btn-primary" onClick={handleCreate}>Create</button>
        </div>
      )}

      <div className="labels-list">
        {labels.length === 0 ? (
          <div className="labels-empty">No labels yet</div>
        ) : (
          labels.map((label) => (
            <div key={label.id} className="label-item">
              <span className="label-dot" style={{ backgroundColor: label.color }} />
              <span
                className="label-name"
                onClick={() => onApplyLabel?.(label.id)}
              >
                {label.name}
              </span>
              <button
                className="label-delete"
                onClick={() => handleDelete(label.id)}
                title="Delete"
              >✕</button>
            </div>
          ))
        )}
      </div>
    </div>
  );
}
