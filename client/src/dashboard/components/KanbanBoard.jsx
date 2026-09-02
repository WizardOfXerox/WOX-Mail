import React, { useState, useEffect } from 'react';
import { get, post, put, del } from '../../shared/api.js';

export default function KanbanBoard({ onClose, onOpenEmail }) {
  const [board, setBoard] = useState(null);
  const [cards, setCards] = useState([]);
  const [loading, setLoading] = useState(true);
  const [draggedCardId, setDraggedCardId] = useState(null);
  const [newCardCol, setNewCardCol] = useState(null);
  const [newCardTitle, setNewCardTitle] = useState('');

  const loadBoard = async () => {
    try {
      setLoading(true);
      const res = await get('/api/kanban');
      setBoard(res.board);
      setCards(res.cards || []);
    } catch (err) {
      console.error('Failed to load kanban:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadBoard();
  }, []);

  const columns = board?.columns || [
    { id: 'todo', title: 'To Do', color: '#7c3aed' },
    { id: 'inprogress', title: 'In Progress', color: '#3b82f6' },
    { id: 'waiting', title: 'Waiting Reply', color: '#f59e0b' },
    { id: 'done', title: 'Done', color: '#22c55e' }
  ];

  const handleDragStart = (e, cardId) => {
    setDraggedCardId(cardId);
    e.dataTransfer.setData('text/plain', cardId);
  };

  const handleDragOver = (e) => {
    e.preventDefault();
  };

  const handleDrop = async (e, targetColId) => {
    e.preventDefault();
    if (!draggedCardId) return;

    // Optimistic UI update
    setCards(cards.map(c => c.id === draggedCardId ? { ...c, column_id: targetColId } : c));

    try {
      await put(`/api/kanban/cards/${draggedCardId}`, { column_id: targetColId });
    } catch (err) {
      console.error('Failed to update card column:', err);
      await loadBoard();
    } finally {
      setDraggedCardId(null);
    }
  };

  const handleAddCard = async (colId) => {
    if (!newCardTitle.trim()) return;
    try {
      const res = await post('/api/kanban/cards', {
        board_id: board.id,
        column_id: colId,
        title: newCardTitle.trim()
      });
      setCards([...cards, res.card]);
      setNewCardTitle('');
      setNewCardCol(null);
    } catch (err) {
      console.error('Failed to add card:', err);
    }
  };

  const handleDeleteCard = async (cardId) => {
    try {
      await del(`/api/kanban/cards/${cardId}`);
      setCards(cards.filter(c => c.id !== cardId));
    } catch (err) {
      console.error('Failed to delete card:', err);
    }
  };

  if (loading) {
    return (
      <div style={{ padding: '2rem', textAlign: 'center' }} className="text-secondary">
        Loading Kanban board...
      </div>
    );
  }

  return (
    <div
      style={{
        display: 'flex',
        flexDirection: 'column',
        height: '100%',
        background: 'var(--color-bg-page)',
        overflow: 'hidden'
      }}
    >
      {/* Header */}
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          padding: '0.875rem 1.5rem',
          borderBottom: '1px solid var(--color-border)',
          background: 'var(--color-bg-card)'
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
          <span style={{ fontSize: '1.25rem' }}>📋</span>
          <strong style={{ fontSize: '1.1rem' }}>Mailbox Kanban Workflow</strong>
          <span className="badge badge-purple" style={{ fontSize: '0.75rem' }}>{cards.length} Tasks</span>
        </div>
        {onClose && (
          <button className="btn btn-ghost btn-sm" onClick={onClose}>
            ✕ Close Board
          </button>
        )}
      </div>

      {/* Columns Container */}
      <div
        style={{
          display: 'grid',
          gridTemplateColumns: `repeat(${columns.length}, 1fr)`,
          gap: '1rem',
          padding: '1.25rem',
          flex: 1,
          overflowX: 'auto'
        }}
      >
        {columns.map((col) => {
          const colCards = cards.filter(c => c.column_id === col.id);
          return (
            <div
              key={col.id}
              onDragOver={handleDragOver}
              onDrop={(e) => handleDrop(e, col.id)}
              style={{
                display: 'flex',
                flexDirection: 'column',
                background: 'var(--color-bg-card)',
                borderRadius: 'var(--radius-md)',
                border: '1px solid var(--color-border)',
                height: '100%',
                maxHeight: 'calc(100vh - 180px)',
                overflow: 'hidden'
              }}
            >
              {/* Column Header */}
              <div
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  padding: '0.75rem 1rem',
                  borderBottom: '1px solid var(--color-border)',
                  background: 'var(--color-bg-elevated)'
                }}
              >
                <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                  <span style={{ width: 10, height: 10, borderRadius: '50%', backgroundColor: col.color }} />
                  <strong style={{ fontSize: '0.875rem' }}>{col.title}</strong>
                </div>
                <span className="badge" style={{ fontSize: '0.6875rem', background: 'var(--color-bg-hover)' }}>
                  {colCards.length}
                </span>
              </div>

              {/* Cards List */}
              <div
                style={{
                  padding: '0.75rem',
                  overflowY: 'auto',
                  flex: 1,
                  display: 'flex',
                  flexDirection: 'column',
                  gap: '0.625rem'
                }}
              >
                {colCards.map((card) => (
                  <div
                    key={card.id}
                    draggable
                    onDragStart={(e) => handleDragStart(e, card.id)}
                    style={{
                      padding: '0.875rem',
                      background: 'var(--color-bg-elevated)',
                      borderRadius: 'var(--radius-sm)',
                      border: '1px solid var(--color-border)',
                      cursor: 'grab',
                      boxShadow: 'var(--shadow-sm)',
                      transition: 'transform var(--transition-fast)'
                    }}
                  >
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '0.35rem' }}>
                      <div style={{ fontWeight: 600, fontSize: '0.8125rem', lineHeight: 1.4 }}>
                        {card.title}
                      </div>
                      <button
                        onClick={() => handleDeleteCard(card.id)}
                        style={{ background: 'none', border: 'none', color: 'var(--color-text-tertiary)', cursor: 'pointer', fontSize: '0.75rem', padding: '0 0.2rem' }}
                      >
                        ✕
                      </button>
                    </div>

                    {card.sender_email && (
                      <div className="text-secondary" style={{ fontSize: '0.6875rem', marginBottom: '0.4rem' }}>
                        From: {card.sender_email}
                      </div>
                    )}

                    {card.message_uid && (
                      <button
                        className="btn btn-ghost btn-sm"
                        onClick={() => onOpenEmail && onOpenEmail(card.message_uid, card.folder)}
                        style={{ fontSize: '0.6875rem', padding: '0.2rem 0.5rem', width: '100%', marginTop: '0.25rem' }}
                      >
                        📨 View Email
                      </button>
                    )}
                  </div>
                ))}

                {/* Add Card Inline Form */}
                {newCardCol === col.id ? (
                  <div style={{ marginTop: '0.5rem' }}>
                    <input
                      type="text"
                      className="input"
                      autoFocus
                      placeholder="Task title or email summary..."
                      value={newCardTitle}
                      onChange={(e) => setNewCardTitle(e.target.value)}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter') handleAddCard(col.id);
                        if (e.key === 'Escape') setNewCardCol(null);
                      }}
                      style={{ fontSize: '0.8125rem', marginBottom: '0.4rem' }}
                    />
                    <div style={{ display: 'flex', gap: '0.4rem' }}>
                      <button className="btn btn-primary btn-sm" onClick={() => handleAddCard(col.id)}>Add</button>
                      <button className="btn btn-ghost btn-sm" onClick={() => setNewCardCol(null)}>Cancel</button>
                    </div>
                  </div>
                ) : (
                  <button
                    className="btn btn-ghost btn-sm"
                    onClick={() => { setNewCardCol(col.id); setNewCardTitle(''); }}
                    style={{ border: '1px dashed var(--color-border)', width: '100%', marginTop: '0.25rem', fontSize: '0.75rem' }}
                  >
                    + Add Task
                  </button>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
