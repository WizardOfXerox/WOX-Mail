import React, { useState } from 'react';

const SHORTCUT_GROUPS = [
  {
    category: 'Navigation & Selection',
    shortcuts: [
      { key: 'j', desc: 'Next email in list' },
      { key: 'k', desc: 'Previous email in list' },
      { key: 'Enter / o', desc: 'Open selected email' },
      { key: 'x', desc: 'Select / unselect message checkbox' },
      { key: '/', desc: 'Focus search bar' },
      { key: 'Esc', desc: 'Close open modal / Return to list' },
    ],
  },
  {
    category: 'Actions & Triage',
    shortcuts: [
      { key: 'e', desc: 'Archive selected email' },
      { key: '# / d', desc: 'Move to Trash' },
      { key: 's', desc: 'Star / Unstar email' },
      { key: 'u', desc: 'Mark as Unread' },
      { key: '!', desc: 'Mark as Spam' },
    ],
  },
  {
    category: 'Compose & Reply',
    shortcuts: [
      { key: 'c', desc: 'Compose new email (single key)' },
      { key: 'Ctrl + C', desc: 'Copy selected text (native clipboard)' },
      { key: 'r', desc: 'Reply to current sender' },
      { key: 'a', desc: 'Reply All' },
      { key: 'f', desc: 'Forward message' },
      { key: 'Ctrl + Enter', desc: 'Send message immediately' },
    ],
  },
  {
    category: 'Layout & Navigation',
    shortcuts: [
      { key: 'Ctrl + 1', desc: 'Single column list view' },
      { key: 'Ctrl + 2', desc: '3-Pane vertical split layout' },
      { key: 'Ctrl + 3', desc: 'Horizontal split layout' },
      { key: 'Ctrl + .', desc: 'Toggle side dock panel' },
      { key: 'Ctrl + k', desc: 'Open Command Palette' },
      { key: '?', desc: 'Show this keyboard shortcuts guide' },
    ],
  },
];

export default function KeyboardShortcutsModal({ isOpen, onClose }) {
  const [filter, setFilter] = useState('');

  if (!isOpen) return null;

  const filteredGroups = SHORTCUT_GROUPS.map((group) => ({
    ...group,
    shortcuts: group.shortcuts.filter(
      (s) =>
        s.key.toLowerCase().includes(filter.toLowerCase()) ||
        s.desc.toLowerCase().includes(filter.toLowerCase())
    ),
  })).filter((group) => group.shortcuts.length > 0);

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm p-4 animate-fade-in"
      onClick={onClose}
    >
      <div
        className="relative w-full max-w-2xl max-h-[85vh] bg-[#16162a] border border-[#2a2a4a] rounded-2xl shadow-2xl overflow-hidden flex flex-col"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-[#2a2a4a] bg-[#1a1a32]/80">
          <div className="flex items-center gap-3">
            <span className="text-xl inline-flex text-[#a78bfa]">
              <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect width="20" height="16" x="2" y="4" rx="2"/><path d="M6 8h.001"/><path d="M10 8h.001"/><path d="M14 8h.001"/><path d="M18 8h.001"/><path d="M6 12h.001"/><path d="M10 12h.001"/><path d="M14 12h.001"/><path d="M18 12h.001"/><path d="M7 16h10"/></svg>
            </span>
            <div>
              <h2 className="text-lg font-bold text-[#f0f0f5]">Keyboard Shortcuts</h2>
              <p className="text-xs text-[#9898b0]">Superhuman & VIM-grade velocity shortcuts</p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="w-8 h-8 flex items-center justify-center rounded-lg text-[#9898b0] hover:text-white hover:bg-[#252545] transition-colors"
          >
            ✕
          </button>
        </div>

        {/* Filter Input */}
        <div className="px-6 pt-4 pb-2">
          <input
            type="text"
            placeholder="Search shortcuts (e.g. compose, copy, archive, j/k)..."
            value={filter}
            onChange={(e) => setFilter(e.target.value)}
            autoFocus
            className="w-full px-4 py-2 bg-[#0f0f1a] border border-[#2a2a4a] focus:border-[#7c3aed] rounded-xl text-sm text-[#f0f0f5] placeholder-[#6868a0] outline-none transition-colors"
          />
        </div>

        {/* Shortcuts Grid */}
        <div className="flex-1 overflow-y-auto px-6 py-4 space-y-6">
          {filteredGroups.length === 0 ? (
            <p className="text-center text-sm text-[#6868a0] py-8">
              No shortcuts found for "{filter}"
            </p>
          ) : (
            filteredGroups.map((group) => (
              <div key={group.category}>
                <h3 className="text-xs font-semibold uppercase tracking-wider text-[#7c3aed] mb-3">
                  {group.category}
                </h3>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
                  {group.shortcuts.map((s) => (
                    <div
                      key={s.key}
                      className="flex items-center justify-between p-2.5 rounded-lg bg-[#1a1a30] border border-[#252545] hover:border-[#7c3aed]/40 transition-colors"
                    >
                      <span className="text-sm text-[#d0d0e0]">{s.desc}</span>
                      <kbd className="px-2 py-1 text-xs font-mono font-semibold text-[#a78bfa] bg-[#0f0f1a] border border-[#3a3a5e] rounded shadow-sm">
                        {s.key}
                      </kbd>
                    </div>
                  ))}
                </div>
              </div>
            ))
          )}
        </div>

        {/* Footer */}
        <div className="px-6 py-3 border-t border-[#2a2a4a] bg-[#1a1a32]/50 text-right">
          <span className="text-xs text-[#6868a0]">
            Press <kbd className="px-1.5 py-0.5 font-mono text-[10px] bg-[#0f0f1a] border border-[#3a3a5e] rounded text-[#9898b0]">Esc</kbd> or click outside to dismiss
          </span>
        </div>
      </div>
    </div>
  );
}
