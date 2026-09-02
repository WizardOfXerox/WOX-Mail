import React, { useState, useEffect, useRef } from 'react';
import { get } from '../../shared/api.js';
import { protonClient } from '../../services/protonAPI.js';
import { ProtonSessionStore } from '../../services/protonSessionStore.js';

// Color generator for contact avatars based on email string
function getAvatarGradient(str = '') {
  let hash = 0;
  for (let i = 0; i < str.length; i++) {
    hash = str.charCodeAt(i) + ((hash << 5) - hash);
  }
  const hues = [
    ['#7c3aed', '#a78bfa'], // Purple
    ['#2563eb', '#60a5fa'], // Blue
    ['#059669', '#34d399'], // Emerald
    ['#d97706', '#fbbf24'], // Amber
    ['#db2777', '#f472b6'], // Pink
    ['#0891b2', '#22d3ee'], // Cyan
  ];
  const pair = hues[Math.abs(hash) % hues.length];
  return `linear-gradient(135deg, ${pair[0]}, ${pair[1]})`;
}

function getInitials(name = '', email = '') {
  if (name && name.trim()) {
    const parts = name.trim().split(/\s+/);
    if (parts.length >= 2) {
      return (parts[0][0] + parts[1][0]).toUpperCase();
    }
    return name.slice(0, 2).toUpperCase();
  }
  if (email && email.trim()) {
    return email.slice(0, 2).toUpperCase();
  }
  return '??';
}

export default function RecipientInput({
  value = '',
  onChange,
  placeholder = 'recipient@example.com',
  inputRef,
  autoFocus = false,
  style = {},
  className = 'compose-input',
  required = false,
  onKeyDown,
  ...props
}) {
  const [suggestions, setSuggestions] = useState([]);
  const [isOpen, setIsOpen] = useState(false);
  const [activeIndex, setActiveIndex] = useState(0);
  const [currentToken, setCurrentToken] = useState('');
  const wrapperRef = useRef(null);
  const internalRef = useRef(null);
  const resolvedRef = inputRef || internalRef;

  // Extract currently typed token (text after the last comma)
  const extractCurrentToken = (text, cursorPos) => {
    const textBeforeCursor = text.slice(0, cursorPos !== undefined ? cursorPos : text.length);
    const lastComma = textBeforeCursor.lastIndexOf(',');
    const token = (lastComma === -1 ? textBeforeCursor : textBeforeCursor.slice(lastComma + 1)).trimStart();
    return token;
  };

  const handleInputChange = (e) => {
    const val = e.target.value;
    onChange(val);

    const token = extractCurrentToken(val, e.target.selectionStart);
    setCurrentToken(token);
  };

  // Fetch suggestions when currentToken changes
  useEffect(() => {
    const clean = currentToken.trim();
    if (!clean || clean.length < 1) {
      setSuggestions([]);
      setIsOpen(false);
      return;
    }

    const timer = setTimeout(async () => {
      try {
        const res = await get(`/settings/contacts?q=${encodeURIComponent(clean)}`);
        let list = res?.contacts || [];

        // Bridge decrypted Proton contacts if active session exists
        try {
          if (ProtonSessionStore.hasActiveSession()) {
            const protonContacts = await protonClient.getContacts();
            const matchedProton = (protonContacts || []).filter((pc) => 
              (pc.name && pc.name.toLowerCase().includes(clean.toLowerCase())) ||
              (pc.email && pc.email.toLowerCase().includes(clean.toLowerCase()))
            );
            list = [...list, ...matchedProton];
          }
        } catch {}

        // Filter out emails that are already fully present in the field
        const existingEmails = value
          .split(',')
          .map((p) => {
            const m = p.match(/<([^>]+)>/);
            return (m ? m[1] : p).trim().toLowerCase();
          })
          .filter(Boolean);

        const filtered = list.filter((c) => {
          const email = (c.email || '').trim().toLowerCase();
          return !existingEmails.includes(email);
        });

        setSuggestions(filtered);
        setActiveIndex(0);
        setIsOpen(filtered.length > 0);
      } catch {
        setSuggestions([]);
        setIsOpen(false);
      }
    }, 180);

    return () => clearTimeout(timer);
  }, [currentToken, value]);

  // Close on outside click
  useEffect(() => {
    const handleOutsideClick = (e) => {
      if (wrapperRef.current && !wrapperRef.current.contains(e.target)) {
        setIsOpen(false);
      }
    };
    document.addEventListener('mousedown', handleOutsideClick);
    return () => document.removeEventListener('mousedown', handleOutsideClick);
  }, []);

  const selectContact = (contact) => {
    const email = contact.email;
    const name = contact.name && contact.name !== email ? contact.name : '';
    const formatted = name ? `${name} <${email}>` : email;

    // Replace the current token with formatted recipient
    const inputEl = resolvedRef.current;
    const cursorPos = inputEl ? inputEl.selectionStart : value.length;
    const textBeforeCursor = value.slice(0, cursorPos);
    const lastComma = textBeforeCursor.lastIndexOf(',');

    const prefix = lastComma === -1 ? '' : value.slice(0, lastComma + 1) + ' ';
    const remainder = value.slice(cursorPos).trimStart();
    const newValue = `${prefix}${formatted}, ${remainder}`;

    onChange(newValue);
    setIsOpen(false);
    setSuggestions([]);
    setCurrentToken('');

    if (inputEl) {
      inputEl.focus();
      // Position cursor right after the added recipient
      setTimeout(() => {
        const nextPos = (prefix + formatted + ', ').length;
        inputEl.setSelectionRange(nextPos, nextPos);
      }, 10);
    }
  };

  const handleKeyNavigation = (e) => {
    if (isOpen && suggestions.length > 0) {
      if (e.key === 'ArrowDown') {
        e.preventDefault();
        setActiveIndex((prev) => (prev + 1) % suggestions.length);
        return;
      }
      if (e.key === 'ArrowUp') {
        e.preventDefault();
        setActiveIndex((prev) => (prev - 1 + suggestions.length) % suggestions.length);
        return;
      }
      if (e.key === 'Enter' || e.key === 'Tab') {
        if (activeIndex >= 0 && activeIndex < suggestions.length) {
          e.preventDefault();
          selectContact(suggestions[activeIndex]);
          return;
        }
      }
      if (e.key === 'Escape') {
        e.preventDefault();
        setIsOpen(false);
        return;
      }
    }

    if (onKeyDown) onKeyDown(e);
  };

  // Highlight matching letters in query
  const highlightMatch = (text, query) => {
    if (!text || !query) return text;
    const q = query.trim();
    const idx = text.toLowerCase().indexOf(q.toLowerCase());
    if (idx === -1) return text;
    return (
      <>
        {text.slice(0, idx)}
        <strong style={{ color: 'var(--color-primary-light)', textDecoration: 'underline' }}>
          {text.slice(idx, idx + q.length)}
        </strong>
        {text.slice(idx + q.length)}
      </>
    );
  };

  return (
    <div ref={wrapperRef} style={{ position: 'relative', flex: 1, display: 'flex', flexDirection: 'column' }}>
      <input
        ref={resolvedRef}
        type="text"
        className={className}
        style={style}
        value={value}
        onChange={handleInputChange}
        onKeyDown={handleKeyNavigation}
        onFocus={() => {
          if (suggestions.length > 0 && currentToken.trim()) setIsOpen(true);
        }}
        placeholder={placeholder}
        required={required}
        autoFocus={autoFocus}
        autoComplete="off"
        role="combobox"
        aria-autocomplete="list"
        aria-expanded={isOpen}
        aria-haspopup="listbox"
        {...props}
      />

      {isOpen && suggestions.length > 0 && (
        <ul
          role="listbox"
          className="autocomplete-dropdown"
          style={{
            position: 'absolute',
            top: 'calc(100% + 4px)',
            left: 0,
            right: 0,
            zIndex: 9999,
            backgroundColor: 'var(--color-bg-elevated, #16162a)',
            border: '1px solid var(--color-border, #2a2a4a)',
            borderRadius: 'var(--radius-md, 12px)',
            boxShadow: '0 12px 32px rgba(0, 0, 0, 0.65)',
            maxHeight: '230px',
            overflowY: 'auto',
            padding: '0.35rem',
            margin: 0,
            listStyle: 'none',
            backdropFilter: 'blur(16px)',
          }}
        >
          {suggestions.map((item, idx) => {
            const isSelected = idx === activeIndex;
            const initials = getInitials(item.name, item.email);
            const avatarBg = getAvatarGradient(item.email);

            return (
              <li
                key={item.id || item.email}
                role="option"
                aria-selected={isSelected}
                onClick={() => selectContact(item)}
                onMouseEnter={() => setActiveIndex(idx)}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: '0.65rem',
                  padding: '0.5rem 0.65rem',
                  borderRadius: 'var(--radius-sm, 8px)',
                  cursor: 'pointer',
                  backgroundColor: isSelected ? 'rgba(124, 58, 237, 0.2)' : 'transparent',
                  border: isSelected ? '1px solid rgba(124, 58, 237, 0.4)' : '1px solid transparent',
                  transition: 'all 120ms ease',
                }}
              >
                {/* Avatar */}
                <div
                  style={{
                    width: 30,
                    height: 30,
                    borderRadius: '50%',
                    background: avatarBg,
                    color: '#ffffff',
                    fontWeight: 700,
                    fontSize: '0.72rem',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    flexShrink: 0,
                    boxShadow: '0 2px 6px rgba(0,0,0,0.3)',
                  }}
                >
                  {initials}
                </div>

                {/* Info */}
                <div style={{ display: 'flex', flexDirection: 'column', flex: 1, minWidth: 0 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', justifyContent: 'space-between' }}>
                    <span
                      style={{
                        fontWeight: 600,
                        fontSize: '0.825rem',
                        color: 'var(--color-text-primary)',
                        overflow: 'hidden',
                        textOverflow: 'ellipsis',
                        whiteSpace: 'nowrap',
                      }}
                    >
                      {item.name ? highlightMatch(item.name, currentToken) : highlightMatch(item.email, currentToken)}
                    </span>
                    {item.is_alias ? (
                      <span className="badge badge-purple" style={{ fontSize: '0.65rem', padding: '0.1rem 0.4rem' }}>
                        Alias
                      </span>
                    ) : item.last_emailed ? (
                      <span className="badge badge-green" style={{ fontSize: '0.65rem', padding: '0.1rem 0.4rem' }}>
                        Recent
                      </span>
                    ) : (
                      <span className="badge badge-amber" style={{ fontSize: '0.65rem', padding: '0.1rem 0.4rem' }}>
                        ⭐ Contact
                      </span>
                    )}
                  </div>
                  {item.name && item.name !== item.email && (
                    <span
                      style={{
                        fontSize: '0.75rem',
                        color: 'var(--color-text-secondary)',
                        overflow: 'hidden',
                        textOverflow: 'ellipsis',
                        whiteSpace: 'nowrap',
                      }}
                    >
                      {highlightMatch(item.email, currentToken)}
                    </span>
                  )}
                </div>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
