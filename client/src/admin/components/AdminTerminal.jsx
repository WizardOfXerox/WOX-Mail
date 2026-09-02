import React, { useState, useEffect, useRef } from 'react';

/**
 * AdminTerminal — Full-Featured Developer Console Embedded in Admin Panel (Component 13)
 */
export default function AdminTerminal() {
  const [history, setHistory] = useState([
    {
      type: 'output',
      text: [
        '╔══════════════════════════════════════════════════════════════════╗',
        '║            WOXMAIL SOVEREIGN ADMIN TERMINAL v2.0                ║',
        '║  Complete root platform control: users, pool, tickets, SQL, db   ║',
        '╚══════════════════════════════════════════════════════════════════╝',
        'Type "help" for full command documentation.',
      ].join('\n'),
    },
  ]);
  const [inputVal, setInputVal] = useState('');
  const [prompt, setPrompt] = useState('admin@woxmail:~$ ');
  const [cmdHistory, setCmdHistory] = useState([]);
  const [historyIdx, setHistoryIdx] = useState(-1);
  const [executing, setExecuting] = useState(false);

  const inputRef = useRef(null);
  const outputRef = useRef(null);

  // Quick command chips
  const quickChips = [
    'help',
    'users list',
    'pool status',
    'stats',
    'tickets list',
    'campaigns list',
    'audit',
    'backup now',
    'clear',
  ];

  useEffect(() => {
    outputRef.current?.scrollTo({ top: outputRef.current.scrollHeight, behavior: 'smooth' });
  }, [history]);

  const executeCommand = async (cmdToRun) => {
    const rawCmd = (cmdToRun !== undefined ? cmdToRun : inputVal).trim();
    if (!rawCmd) return;

    if (rawCmd === 'clear') {
      setHistory([]);
      setInputVal('');
      return;
    }

    // Add command to visible history
    setHistory((prev) => [...prev, { type: 'command', text: `${prompt}${rawCmd}` }]);
    setCmdHistory((prev) => [rawCmd, ...prev]);
    setHistoryIdx(-1);
    setInputVal('');
    setExecuting(true);

    try {
      const res = await fetch('/api/cli/exec', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ command: rawCmd }),
      });
      const data = await res.json();

      setHistory((prev) => [
        ...prev,
        {
          type: data.error ? 'error' : 'output',
          text: data.output || '(No output returned)',
        },
      ]);
      if (data.prompt) setPrompt(data.prompt);
    } catch (err) {
      setHistory((prev) => [
        ...prev,
        { type: 'error', text: `Execution failed: ${err.message}` },
      ]);
    } finally {
      setExecuting(false);
      inputRef.current?.focus();
    }
  };

  const handleKeyDown = (e) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      executeCommand();
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      if (cmdHistory.length > 0) {
        const nextIdx = Math.min(historyIdx + 1, cmdHistory.length - 1);
        setHistoryIdx(nextIdx);
        setInputVal(cmdHistory[nextIdx]);
      }
    } else if (e.key === 'ArrowDown') {
      e.preventDefault();
      if (historyIdx > 0) {
        const nextIdx = historyIdx - 1;
        setHistoryIdx(nextIdx);
        setInputVal(cmdHistory[nextIdx]);
      } else if (historyIdx === 0) {
        setHistoryIdx(-1);
        setInputVal('');
      }
    }
  };

  const copyAllOutput = () => {
    const text = history.map((h) => h.text).join('\n');
    navigator.clipboard.writeText(text);
    alert('Console output copied to clipboard!');
  };

  return (
    <div
      className="card"
      style={{
        padding: 0,
        overflow: 'hidden',
        background: '#0a0a14',
        border: '1px solid var(--color-border)',
        borderRadius: 'var(--radius-lg)',
        boxShadow: '0 8px 32px rgba(0,0,0,0.6)',
        display: 'flex',
        flexDirection: 'column',
        height: '75vh',
        minHeight: 520,
      }}
    >
      {/* macOS Terminal Title Bar */}
      <div
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          padding: '0.65rem 1rem',
          background: 'rgba(255,255,255,0.03)',
          borderBottom: '1px solid var(--color-border)',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
          <div style={{ display: 'flex', gap: '6px' }}>
            <span style={{ width: 12, height: 12, borderRadius: '50%', background: '#ef4444', display: 'inline-block' }} />
            <span style={{ width: 12, height: 12, borderRadius: '50%', background: '#f59e0b', display: 'inline-block' }} />
            <span style={{ width: 12, height: 12, borderRadius: '50%', background: '#22c55e', display: 'inline-block' }} />
          </div>
          <span className="mono text-secondary" style={{ fontSize: '0.8125rem', marginLeft: '0.5rem', fontWeight: 600 }}>
            admin@woxmail-terminal (xterm-256color)
          </span>
        </div>

        <div style={{ display: 'flex', gap: '0.5rem' }}>
          <button type="button" className="btn btn-ghost btn-xs text-secondary" onClick={copyAllOutput} style={{ display: 'inline-flex', alignItems: 'center', gap: '0.35rem' }}>
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect width="14" height="14" x="8" y="8" rx="2" ry="2"/><path d="M4 16c-1.1 0-2-.9-2-2V4c0-1.1.9-2 2-2h10c1.1 0 2 .9 2 2"/></svg>
            <span>Copy Output</span>
          </button>
          <button type="button" className="btn btn-ghost btn-xs text-secondary" onClick={() => setHistory([])} style={{ display: 'inline-flex', alignItems: 'center', gap: '0.35rem' }}>
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M3 6h18"/><path d="M19 6v14c0 1-1 2-2 2H7c-1 0-2-1-2-2V6"/><path d="M8 6V4c0-1 1-2 2-2h4c1 0 2 1 2 2v2"/></svg>
            <span>Clear</span>
          </button>
        </div>
      </div>

      {/* Terminal Console Output */}
      <div
        ref={outputRef}
        style={{
          flex: 1,
          overflowY: 'auto',
          padding: '1rem',
          fontFamily: 'var(--font-mono)',
          fontSize: '0.8125rem',
          lineHeight: 1.5,
          color: '#f0f0f5',
          whiteSpace: 'pre-wrap',
          wordBreak: 'break-all',
        }}
      >
        {history.map((h, i) => (
          <div
            key={i}
            style={{
              color: h.type === 'command' ? 'var(--color-primary-light)' : (h.type === 'error' ? 'var(--color-error)' : '#d0d0e0'),
              fontWeight: h.type === 'command' ? 700 : 400,
              marginBottom: '0.35rem',
            }}
          >
            {h.text}
          </div>
        ))}

        {executing && (
          <div className="text-purple mono" style={{ animation: 'pulse 1s infinite' }}>
            ⠋ Executing command...
          </div>
        )}
      </div>

      {/* Command Input Prompt */}
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          padding: '0.65rem 1rem',
          background: 'rgba(255,255,255,0.02)',
          borderTop: '1px solid var(--color-border)',
        }}
      >
        <span className="mono" style={{ color: 'var(--color-primary-light)', fontWeight: 700, marginRight: '0.5rem' }}>
          {prompt}
        </span>
        <input
          ref={inputRef}
          type="text"
          value={inputVal}
          onChange={(e) => setInputVal(e.target.value)}
          onKeyDown={handleKeyDown}
          placeholder="Type admin command..."
          style={{
            flex: 1,
            background: 'transparent',
            border: 'none',
            outline: 'none',
            color: '#f0f0f5',
            fontFamily: 'var(--font-mono)',
            fontSize: '0.875rem',
          }}
          autoFocus
        />
      </div>

      {/* Quick Command Chips Bar */}
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: '0.35rem',
          padding: '0.4rem 1rem',
          background: 'rgba(0,0,0,0.3)',
          borderTop: '1px solid var(--color-border-subtle)',
          overflowX: 'auto',
          whiteSpace: 'nowrap',
        }}
      >
        <span className="text-tertiary mono" style={{ fontSize: '0.75rem' }}>Quick:</span>
        {quickChips.map((chip) => (
          <button
            key={chip}
            type="button"
            className="filter-chip mono"
            onClick={() => executeCommand(chip)}
            style={{ fontSize: '0.75rem', padding: '0.15rem 0.5rem' }}
          >
            {chip}
          </button>
        ))}
      </div>
    </div>
  );
}
