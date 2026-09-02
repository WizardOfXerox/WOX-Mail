import React, { useState, useEffect } from 'react';
import { get, put, post } from '../../shared/api.js';

export default function IntelligenceSection() {
  const [provider, setProvider] = useState('auto');
  const [apiKey, setApiKey] = useState('');
  const [defaultTone, setDefaultTone] = useState('professional');
  const [smartRepliesEnabled, setSmartRepliesEnabled] = useState(true);
  const [summariesEnabled, setSummariesEnabled] = useState(true);
  const [testText, setTestText] = useState('hey john can we talk about the project deadline tomorrow thx');
  const [testedOutput, setTestedOutput] = useState(null);
  const [testing, setTesting] = useState(false);
  const [saving, setSaving] = useState(false);
  const [success, setSuccess] = useState(null);

  useEffect(() => {
    get('/api/settings/preferences')
      .then((res) => {
        const p = res.preferences || {};
        if (p.aiProvider) setProvider(p.aiProvider);
        if (p.aiDefaultTone) setDefaultTone(p.aiDefaultTone);
        if (p.aiSmartReplies !== undefined) setSmartRepliesEnabled(p.aiSmartReplies);
        if (p.aiSummaries !== undefined) setSummariesEnabled(p.aiSummaries);
      })
      .catch(() => {});
  }, []);

  const handleTestTone = async () => {
    try {
      setTesting(true);
      setTestedOutput(null);
      const res = await post('/api/ai/rewrite', {
        text: testText,
        tone: defaultTone,
        provider,
        apiKey
      });
      setTestedOutput(res.rewritten);
    } catch (err) {
      setTestedOutput(`Error: ${err.message}`);
    } finally {
      setTesting(false);
    }
  };

  const handleSave = async () => {
    try {
      setSaving(true);
      await put('/api/settings/preferences', {
        preferences: {
          aiProvider: provider,
          aiDefaultTone: defaultTone,
          aiSmartReplies: smartRepliesEnabled,
          aiSummaries: summariesEnabled
        }
      });
      setSuccess('AI Intelligence settings saved successfully!');
      setTimeout(() => setSuccess(null), 4000);
    } catch (err) {
      console.warn('Failed to save AI preferences:', err.message);
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="settings-section">
      <div className="section-header">
        <h2>AI Intelligence & Copilot Suite</h2>
        <p className="text-secondary">
          Configure multi-provider email intelligence. Supports <strong>Local Ollama ($0 Free / Private)</strong>, <strong>Google Gemini (Free tier)</strong>, and <strong>OpenAI / Anthropic</strong>.
        </p>
      </div>

      {success && <div className="toast toast-success" style={{ position: 'static', marginBottom: '1.5rem', width: '100%' }}>{success}</div>}

      {/* Provider Selector */}
      <div className="card" style={{ marginBottom: '1.5rem' }}>
        <h3 style={{ marginBottom: '0.75rem' }}>AI Model Provider</h3>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '0.75rem', marginBottom: '1rem' }}>
          {[
            { id: 'auto', name: 'Auto / Smart Default', desc: 'Uses local Ollama if available, otherwise free heuristic fallback' },
            { id: 'ollama', name: 'Local Ollama ($0 Free)', desc: '100% private on localhost:11434 (Llama 3.2, Mistral, DeepSeek)' },
            { id: 'gemini', name: 'Google Gemini API', desc: 'Free tier up to 15 RPM for ultra-fast composition & summaries' },
            { id: 'openai', name: 'OpenAI (GPT-4o-mini)', desc: 'Use OpenAI completions API with your API key' },
          ].map((item) => (
            <div
              key={item.id}
              onClick={() => setProvider(item.id)}
              style={{
                padding: '1rem',
                borderRadius: 'var(--radius-md)',
                border: provider === item.id ? '2px solid var(--color-primary)' : '1px solid var(--color-border)',
                background: provider === item.id ? 'rgba(124, 58, 237, 0.12)' : 'var(--color-bg-elevated)',
                cursor: 'pointer'
              }}
            >
              <div style={{ fontWeight: 600, fontSize: '0.875rem', marginBottom: '0.25rem' }}>{item.name}</div>
              <div className="text-secondary" style={{ fontSize: '0.75rem' }}>{item.desc}</div>
            </div>
          ))}
        </div>

        {(provider === 'gemini' || provider === 'openai') && (
          <div style={{ marginTop: '1rem' }}>
            <label style={{ display: 'block', marginBottom: '0.4rem', fontSize: '0.875rem' }}>Optional Custom API Key</label>
            <input
              type="password"
              className="input"
              placeholder="Paste your API key here (saved locally/in memory)..."
              value={apiKey}
              onChange={(e) => setApiKey(e.target.value)}
            />
          </div>
        )}
      </div>

      {/* Feature Toggles & Default Tone */}
      <div className="card" style={{ marginBottom: '1.5rem' }}>
        <h3 style={{ marginBottom: '1rem' }}>Copilot Features & Defaults</h3>

        <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
          <div>
            <label style={{ display: 'block', marginBottom: '0.4rem', fontSize: '0.875rem', fontWeight: 600 }}>Default Rewriting Tone</label>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.5rem' }}>
              {['professional', 'formal', 'friendly', 'concise', 'diplomatic', 'urgent'].map((t) => (
                <button
                  key={t}
                  type="button"
                  className={`btn btn-sm ${defaultTone === t ? 'btn-primary' : 'btn-secondary'}`}
                  onClick={() => setDefaultTone(t)}
                  style={{ textTransform: 'capitalize' }}
                >
                  {t}
                </button>
              ))}
            </div>
          </div>

          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '0.75rem 0', borderTop: '1px solid var(--color-border)' }}>
            <div>
              <div style={{ fontWeight: 600, fontSize: '0.875rem' }}>1-Click Smart Reply Pills</div>
              <div className="text-secondary" style={{ fontSize: '0.75rem' }}>Show quick response suggestions under incoming emails</div>
            </div>
            <input
              type="checkbox"
              checked={smartRepliesEnabled}
              onChange={(e) => setSmartRepliesEnabled(e.target.checked)}
              style={{ width: 18, height: 18, accentColor: 'var(--color-primary)' }}
            />
          </div>

          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '0.75rem 0', borderTop: '1px solid var(--color-border)' }}>
            <div>
              <div style={{ fontWeight: 600, fontSize: '0.875rem' }}>Thread TL;DR Summarizer</div>
              <div className="text-secondary" style={{ fontSize: '0.75rem' }}>Automatically generate 2-bullet executive summaries on long threads</div>
            </div>
            <input
              type="checkbox"
              checked={summariesEnabled}
              onChange={(e) => setSummariesEnabled(e.target.checked)}
              style={{ width: 18, height: 18, accentColor: 'var(--color-primary)' }}
            />
          </div>
        </div>
      </div>

      {/* Live AI Copilot Test Playground */}
      <div className="card" style={{ marginBottom: '1.5rem' }}>
        <h3 style={{ marginBottom: '0.5rem' }}>AI Copilot Live Playground</h3>
        <p className="text-secondary" style={{ fontSize: '0.875rem', marginBottom: '1rem' }}>
          Test tone adjustment live against your chosen model configuration.
        </p>

        <textarea
          className="input"
          rows={3}
          value={testText}
          onChange={(e) => setTestText(e.target.value)}
          style={{ width: '100%', marginBottom: '1rem', resize: 'vertical' }}
        />

        <div style={{ display: 'flex', gap: '0.75rem', marginBottom: '1rem' }}>
          <button
            type="button"
            className="btn btn-secondary"
            disabled={testing}
            onClick={handleTestTone}
          >
            {testing ? 'Rewriting with AI...' : `Rewrite in ${defaultTone} tone`}
          </button>
        </div>

        {testedOutput && (
          <div style={{ padding: '1rem', background: 'var(--color-bg-page)', borderRadius: 'var(--radius-md)', border: '1px solid var(--color-border)', fontSize: '0.875rem', whiteSpace: 'pre-wrap' }}>
            <strong style={{ display: 'block', color: 'var(--color-primary-light)', marginBottom: '0.4rem' }}>AI Output:</strong>
            {testedOutput}
          </div>
        )}
      </div>

      <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
        <button
          type="button"
          className="btn btn-primary"
          disabled={saving}
          onClick={handleSave}
        >
          {saving ? 'Saving...' : 'Save AI Settings'}
        </button>
      </div>
    </div>
  );
}
