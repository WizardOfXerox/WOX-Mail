import React, { useState, useRef, useEffect, useCallback } from 'react';

/**
 * Search bar with debounced input, advanced search filter chips, suggestions, and modal.
 */
export default function SearchBar({ onSearch, placeholder = 'Search mail...', initialValue = '' }) {
  const [query, setQuery] = useState(initialValue);
  const [focused, setFocused] = useState(false);
  const [showModal, setShowModal] = useState(false);
  const [activeChips, setActiveChips] = useState(new Set());
  const inputRef = useRef(null);
  const debounceRef = useRef(null);

  // Advanced search form state
  const [advFrom, setAdvFrom] = useState('');
  const [advTo, setAdvTo] = useState('');
  const [advSubject, setAdvSubject] = useState('');
  const [advContains, setAdvContains] = useState('');
  const [advHasAttachment, setAdvHasAttachment] = useState(false);
  const [advIsStarred, setAdvIsStarred] = useState(false);
  const [advDateAfter, setAdvDateAfter] = useState('');
  const [advDateBefore, setAdvDateBefore] = useState('');

  const suggestions = [
    { label: 'from:', desc: 'Search by sender', example: 'from:john@example.com' },
    { label: 'to:', desc: 'Search by recipient', example: 'to:me@example.com' },
    { label: 'subject:', desc: 'Search by subject', example: 'subject:meeting' },
    { label: 'has:attachment', desc: 'Has attachments', example: 'has:attachment' },
    { label: 'is:unread', desc: 'Unread only', example: 'is:unread' },
    { label: 'is:starred', desc: 'Starred only', example: 'is:starred' },
    { label: 'before:', desc: 'Before date', example: 'before:2026-01-01' },
    { label: 'after:', desc: 'After date', example: 'after:2026-08-01' },
  ];

  const chipsList = [
    { id: 'attachment', label: 'Attachments', query: 'has:attachment' },
    { id: 'unread', label: 'Unread', query: 'is:unread' },
    { id: 'starred', label: '⭐ Starred', query: 'is:starred' },
    { id: '7d', label: 'Past 7 Days', query: 'after:7d' },
    { id: '30d', label: 'Past 30 Days', query: 'after:30d' },
  ];

  const triggerSearch = useCallback((newQuery) => {
    setQuery(newQuery);
    clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => {
      onSearch?.(newQuery);
    }, 300);
  }, [onSearch]);

  const toggleChip = (chip) => {
    setActiveChips((prev) => {
      const next = new Set(prev);
      let newQuery = query;

      if (next.has(chip.id)) {
        next.delete(chip.id);
        newQuery = newQuery.replace(chip.query, '').trim();
      } else {
        // Handle mutual exclusion for time chips
        if (chip.id === '7d' && next.has('30d')) {
          next.delete('30d');
          newQuery = newQuery.replace('after:30d', '').trim();
        } else if (chip.id === '30d' && next.has('7d')) {
          next.delete('7d');
          newQuery = newQuery.replace('after:7d', '').trim();
        }

        next.add(chip.id);
        newQuery = `${newQuery} ${chip.query}`.trim();
      }

      triggerSearch(newQuery);
      return next;
    });
  };

  const handleClearAll = () => {
    setActiveChips(new Set());
    setQuery('');
    onSearch?.('');
    inputRef.current?.focus();
  };

  const handleAdvancedSubmit = (e) => {
    e.preventDefault();
    const parts = [];
    if (advFrom) parts.push(`from:${advFrom}`);
    if (advTo) parts.push(`to:${advTo}`);
    if (advSubject) parts.push(`subject:${advSubject}`);
    if (advContains) parts.push(advContains);
    if (advHasAttachment) parts.push('has:attachment');
    if (advIsStarred) parts.push('is:starred');
    if (advDateAfter) parts.push(`after:${advDateAfter}`);
    if (advDateBefore) parts.push(`before:${advDateBefore}`);

    const finalQuery = parts.join(' ');
    setQuery(finalQuery);
    onSearch?.(finalQuery);
    setShowModal(false);
  };

  // Keyboard shortcut: / to focus
  useEffect(() => {
    const handler = (e) => {
      if (e.key === '/' && !e.target.closest('input, textarea, [contenteditable]')) {
        e.preventDefault();
        inputRef.current?.focus();
      }
    };
    document.addEventListener('keydown', handler);
    return () => document.removeEventListener('keydown', handler);
  }, []);

  useEffect(() => () => clearTimeout(debounceRef.current), []);

  const showSuggestions = focused && !query;

  return (
    <div className="search-bar-wrapper">
      <form className="search-bar" onSubmit={(e) => { e.preventDefault(); onSearch?.(query); setFocused(false); }}>
        <span className="search-icon" style={{ display: "inline-flex", alignItems: "center" }}><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/></svg></span>
        <input
          ref={inputRef}
          className="search-input"
          type="text"
          value={query}
          onChange={(e) => triggerSearch(e.target.value)}
          onFocus={() => setFocused(true)}
          onBlur={() => setTimeout(() => setFocused(false), 200)}
          placeholder={placeholder}
          aria-label="Search"
        />
        {query && (
          <button type="button" className="search-clear" onClick={handleClearAll} aria-label="Clear">✕</button>
        )}
        <button
          type="button"
          className="btn btn-ghost btn-xs"
          onClick={() => setShowModal(true)}
          title="Advanced Search Filters"
          style={{ padding: '0 4px', fontSize: '0.875rem' }}
        >
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1 0 2.83 2 2 0 0 1-2.83 0l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-2 2 2 2 0 0 1-2-2v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83 0 2 2 0 0 1 0-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1-2-2 2 2 0 0 1 2-2h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 0-2.83 2 2 0 0 1 2.83 0l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 2-2 2 2 0 0 1 2 2v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 0 2 2 0 0 1 0 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 2 2 2 2 0 0 1-2 2h-.09a1.65 1.65 0 0 0-1.51 1z"/></svg>
        </button>
        <kbd className="search-kbd">/</kbd>
      </form>

      {/* Quick Filter Chips */}
      <div className="filter-chips-row">
        {chipsList.map((chip) => (
          <button
            key={chip.id}
            type="button"
            className={`filter-chip ${activeChips.has(chip.id) ? 'active' : ''}`}
            onClick={() => toggleChip(chip)}
          >
            {chip.label}
          </button>
        ))}
        {activeChips.size > 0 && (
          <button
            type="button"
            className="filter-chip"
            onClick={handleClearAll}
            style={{ color: 'var(--color-error)' }}
          >
            ✕ Reset
          </button>
        )}
      </div>

      {showSuggestions && (
        <div className="search-suggestions">
          <div className="search-suggestions-title">Search operators</div>
          {suggestions.map((s) => (
            <button
              key={s.label}
              className="search-suggestion"
              onMouseDown={(e) => {
                e.preventDefault();
                const newQ = query ? `${query} ${s.example}` : s.example;
                triggerSearch(newQ);
              }}
            >
              <span className="suggestion-label">{s.label}</span>
              <span className="suggestion-desc">{s.desc}</span>
            </button>
          ))}
        </div>
      )}

      {/* Advanced Filter Modal */}
      {showModal && (
        <div className="compose-overlay" onClick={() => setShowModal(false)}>
          <div className="compose-modal card" style={{ maxWidth: 520 }} onClick={(e) => e.stopPropagation()}>
            <div className="compose-header">
              <h3>Advanced Search Filters</h3>
              <button type="button" className="btn btn-ghost btn-xs" onClick={() => setShowModal(false)}>✕</button>
            </div>
            <form onSubmit={handleAdvancedSubmit} style={{ padding: '1.25rem', display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
              <div className="form-group" style={{ marginBottom: 0 }}>
                <label className="form-label">From:</label>
                <input className="input" placeholder="sender@example.com" value={advFrom} onChange={(e) => setAdvFrom(e.target.value)} />
              </div>
              <div className="form-group" style={{ marginBottom: 0 }}>
                <label className="form-label">To:</label>
                <input className="input" placeholder="recipient@example.com" value={advTo} onChange={(e) => setAdvTo(e.target.value)} />
              </div>
              <div className="form-group" style={{ marginBottom: 0 }}>
                <label className="form-label">Subject:</label>
                <input className="input" placeholder="Keywords in subject line" value={advSubject} onChange={(e) => setAdvSubject(e.target.value)} />
              </div>
              <div className="form-group" style={{ marginBottom: 0 }}>
                <label className="form-label">Has the words:</label>
                <input className="input" placeholder="Keywords in email body" value={advContains} onChange={(e) => setAdvContains(e.target.value)} />
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.75rem' }}>
                <div>
                  <label className="form-label">After date:</label>
                  <input type="date" className="input" value={advDateAfter} onChange={(e) => setAdvDateAfter(e.target.value)} />
                </div>
                <div>
                  <label className="form-label">Before date:</label>
                  <input type="date" className="input" value={advDateBefore} onChange={(e) => setAdvDateBefore(e.target.value)} />
                </div>
              </div>
              <div style={{ display: 'flex', gap: '1.5rem', marginTop: '0.25rem' }}>
                <label style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', fontSize: '0.8125rem', cursor: 'pointer' }}>
                  <input type="checkbox" checked={advHasAttachment} onChange={(e) => setAdvHasAttachment(e.target.checked)} />
                  Has attachment
                </label>
                <label style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', fontSize: '0.8125rem', cursor: 'pointer' }}>
                  <input type="checkbox" checked={advIsStarred} onChange={(e) => setAdvIsStarred(e.target.checked)} />
                  ⭐ Starred only
                </label>
              </div>
              <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '0.5rem', marginTop: '0.75rem' }}>
                <button type="button" className="btn btn-ghost btn-sm" onClick={() => setShowModal(false)}>Cancel</button>
                <button type="submit" className="btn btn-primary btn-sm">Search Mail</button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
