import React, { useState, useEffect } from 'react';
import { get, put } from '../../shared/api.js';

export default function AppearanceSection() {
  const [accent, setAccent] = useState(() => localStorage.getItem('woxmail_accent') || 'purple');
  const [bgMode, setBgMode] = useState(() => localStorage.getItem('woxmail_bg_mode') || 'aurora');
  const [bgIntensity, setBgIntensity] = useState(() => parseFloat(localStorage.getItem('woxmail_bg_intensity') || '1.0'));
  const [density, setDensity] = useState(() => localStorage.getItem('woxmail_density') || 'comfortable');
  const [font, setFont] = useState(() => localStorage.getItem('woxmail_font') || 'inter');
  const [saving, setSaving] = useState(false);
  const [success, setSuccess] = useState(null);

  const ACCENTS = [
    { id: 'purple', name: 'Sovereign Purple', color: '#7c3aed' },
    { id: 'emerald', name: 'Cyber Emerald', color: '#10b981' },
    { id: 'cobalt', name: 'Midnight Cobalt', color: '#3b82f6' },
    { id: 'amber', name: 'Sunset Amber', color: '#f59e0b' },
    { id: 'cyan', name: 'Matrix Cyan', color: '#06b6d4' },
    { id: 'crimson', name: 'Crimson Red', color: '#ef4444' },
    { id: 'oled', name: 'OLED Monochrome', color: '#e5e7eb' },
  ];

  const BG_MODES = [
    { id: 'aurora', name: 'Aurora Waves', desc: 'Drifting violet & cyan light waves reacting to cursor motion' },
    { id: 'cyber_mesh', name: 'Cyber Mesh 3D', desc: 'Glowing perspective wireframe grid with illumination ripples' },
    { id: 'deep_space', name: 'Deep Space Starfield', desc: 'Parallax star particles with cursor gravity repulsion' },
    { id: 'matrix', name: 'Matrix Stream', desc: 'Cascading Sovereign glyph terminal rain' },
    { id: 'zen_drift', name: 'Zen Radial Drift', desc: 'Calming breathing chromatic radial blooms' },
    { id: 'oled_monochrome', name: 'Pure OLED Pitch Black', desc: 'Pitch-black distraction-free power-saving background' },
  ];

  const DENSITIES = [
    { id: 'compact', name: 'Compact Density', desc: 'High density, 52px rows, maximum emails on screen' },
    { id: 'comfortable', name: 'Comfortable (Default)', desc: 'Standard balanced spacing with single-line snippets' },
    { id: 'relaxed', name: 'Relaxed Spacing', desc: 'Spacious 84px rows with 2-line snippets and large avatars' },
  ];

  const FONTS = [
    { id: 'inter', name: 'Inter (Modern Sans)', preview: 'The quick brown fox jumps over the lazy dog' },
    { id: 'mono', name: 'JetBrains Mono (Developer)', preview: 'const mail = await woxmail.decrypt();' },
    { id: 'serif', name: 'Newsreader (Editorial Serif)', preview: 'Timeless typography for focused long-form reading.' },
  ];

  const handleAccentChange = (a) => {
    setAccent(a);
    if (window.WoxTheme) window.WoxTheme.setAccent(a);
    else {
      localStorage.setItem('woxmail_accent', a);
      document.documentElement.setAttribute('data-accent', a);
    }
  };

  const handleBgModeChange = (mode) => {
    setBgMode(mode);
    if (window.WoxBackground) window.WoxBackground.setMode(mode);
    else localStorage.setItem('woxmail_bg_mode', mode);
  };

  const handleIntensityChange = (val) => {
    const num = parseFloat(val);
    setBgIntensity(num);
    if (window.WoxBackground) window.WoxBackground.setIntensity(num);
    else localStorage.setItem('woxmail_bg_intensity', String(num));
  };

  const handleDensityChange = (d) => {
    setDensity(d);
    if (window.WoxTheme) window.WoxTheme.setDensity(d);
    else {
      localStorage.setItem('woxmail_density', d);
      document.documentElement.setAttribute('data-density', d);
    }
  };

  const handleFontChange = (f) => {
    setFont(f);
    if (window.WoxTheme) window.WoxTheme.setFont(f);
    else {
      localStorage.setItem('woxmail_font', f);
      document.documentElement.setAttribute('data-font', f);
    }
  };

  const savePreferencesToCloud = async () => {
    try {
      setSaving(true);
      await put('/api/settings/preferences', {
        preferences: {
          accent,
          bgMode,
          bgIntensity,
          density,
          font
        }
      });
      setSuccess('Appearance preferences saved to your cloud profile!');
      setTimeout(() => setSuccess(null), 4000);
    } catch (err) {
      console.warn('Failed to sync to cloud:', err.message);
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="settings-section">
      <div className="section-header">
        <h2>Appearance & Interactive Themes</h2>
        <p className="text-secondary">
          Customize color accents, real-time hardware-accelerated interactive canvas shaders, display density, and reading typography.
        </p>
      </div>

      {success && <div className="toast toast-success" style={{ position: 'static', marginBottom: '1.5rem', width: '100%' }}>{success}</div>}

      {/* 1. Sovereign Color Accents */}
      <div className="card" style={{ marginBottom: '1.5rem' }}>
        <h3 style={{ marginBottom: '0.5rem' }}>Sovereign Color Accent</h3>
        <p className="text-secondary" style={{ fontSize: '0.875rem', marginBottom: '1rem' }}>
          Select the primary highlight palette across all buttons, badges, glows, and active indicators.
        </p>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(140px, 1fr))', gap: '0.75rem' }}>
          {ACCENTS.map((item) => (
            <button
              key={item.id}
              type="button"
              onClick={() => handleAccentChange(item.id)}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: '0.625rem',
                padding: '0.75rem',
                borderRadius: 'var(--radius-md)',
                border: accent === item.id ? `2px solid ${item.color}` : '1px solid var(--color-border)',
                background: accent === item.id ? 'var(--color-bg-hover)' : 'var(--color-bg-elevated)',
                cursor: 'pointer',
                textAlign: 'left'
              }}
            >
              <span style={{ width: 16, height: 16, borderRadius: '50%', backgroundColor: item.color, display: 'inline-block', boxShadow: `0 0 10px ${item.color}` }} />
              <span style={{ fontSize: '0.8125rem', fontWeight: 600, color: 'var(--color-text-primary)' }}>{item.name}</span>
            </button>
          ))}
        </div>
      </div>

      {/* 2. Interactive Background Shaders */}
      <div className="card" style={{ marginBottom: '1.5rem' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.5rem' }}>
          <h3>Interactive Canvas Shaders (60 FPS GPU)</h3>
          <span className="badge badge-purple">Hardware Accelerated</span>
        </div>
        <p className="text-secondary" style={{ fontSize: '0.875rem', marginBottom: '1.25rem' }}>
          Cursor-reactive animated canvas backgrounds. Subtly reacts to pointer velocity and parallax.
        </p>

        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: '1rem', marginBottom: '1.5rem' }}>
          {BG_MODES.map((item) => (
            <div
              key={item.id}
              onClick={() => handleBgModeChange(item.id)}
              style={{
                padding: '1rem',
                borderRadius: 'var(--radius-md)',
                border: bgMode === item.id ? '2px solid var(--color-primary)' : '1px solid var(--color-border)',
                background: bgMode === item.id ? 'rgba(124, 58, 237, 0.12)' : 'var(--color-bg-elevated)',
                cursor: 'pointer',
                transition: 'all var(--transition-fast)'
              }}
            >
              <div style={{ fontWeight: 600, fontSize: '0.875rem', color: 'var(--color-text-primary)', marginBottom: '0.25rem' }}>
                {item.name}
              </div>
              <div className="text-secondary" style={{ fontSize: '0.75rem', lineHeight: 1.4 }}>
                {item.desc}
              </div>
            </div>
          ))}
        </div>

        {/* Intensity Slider */}
        <div style={{ padding: '1rem', background: 'var(--color-bg-page)', borderRadius: 'var(--radius-md)', border: '1px solid var(--color-border)' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '0.5rem' }}>
            <label style={{ fontSize: '0.875rem', fontWeight: 600 }}>Shader Opacity & Intensity</label>
            <span style={{ fontSize: '0.8125rem', fontFamily: 'var(--font-mono)' }}>{Math.round(bgIntensity * 100)}%</span>
          </div>
          <input
            type="range"
            min="0.1"
            max="1.0"
            step="0.05"
            value={bgIntensity}
            onChange={(e) => handleIntensityChange(e.target.value)}
            style={{ width: '100%', accentColor: 'var(--color-primary)' }}
          />
        </div>
      </div>

      {/* 3. Display Density */}
      <div className="card" style={{ marginBottom: '1.5rem' }}>
        <h3 style={{ marginBottom: '0.5rem' }}>Display Density</h3>
        <p className="text-secondary" style={{ fontSize: '0.875rem', marginBottom: '1rem' }}>
          Adjust row height and snippet volume in the inbox list view.
        </p>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '0.75rem' }}>
          {DENSITIES.map((item) => (
            <div
              key={item.id}
              onClick={() => handleDensityChange(item.id)}
              style={{
                padding: '1rem',
                borderRadius: 'var(--radius-md)',
                border: density === item.id ? '2px solid var(--color-primary)' : '1px solid var(--color-border)',
                background: density === item.id ? 'rgba(124, 58, 237, 0.12)' : 'var(--color-bg-elevated)',
                cursor: 'pointer'
              }}
            >
              <div style={{ fontWeight: 600, fontSize: '0.875rem' }}>{item.name}</div>
              <div className="text-secondary" style={{ fontSize: '0.75rem', marginTop: '0.25rem' }}>{item.desc}</div>
            </div>
          ))}
        </div>
      </div>

      {/* 4. Reading Typography */}
      <div className="card" style={{ marginBottom: '1.5rem' }}>
        <h3 style={{ marginBottom: '0.5rem' }}>Reading Typography</h3>
        <p className="text-secondary" style={{ fontSize: '0.875rem', marginBottom: '1rem' }}>
          Choose your preferred typeface across email bodies and UI headers.
        </p>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: '0.75rem' }}>
          {FONTS.map((item) => (
            <div
              key={item.id}
              onClick={() => handleFontChange(item.id)}
              style={{
                padding: '1rem',
                borderRadius: 'var(--radius-md)',
                border: font === item.id ? '2px solid var(--color-primary)' : '1px solid var(--color-border)',
                background: font === item.id ? 'rgba(124, 58, 237, 0.12)' : 'var(--color-bg-elevated)',
                cursor: 'pointer'
              }}
            >
              <div style={{ fontWeight: 600, fontSize: '0.875rem', marginBottom: '0.25rem' }}>{item.name}</div>
              <div className="text-secondary" style={{ fontSize: '0.8125rem', fontStyle: 'italic' }}>{item.preview}</div>
            </div>
          ))}
        </div>
      </div>

      <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
        <button
          type="button"
          className="btn btn-primary"
          disabled={saving}
          onClick={savePreferencesToCloud}
        >
          {saving ? 'Saving...' : 'Sync Preferences to Cloud Profile'}
        </button>
      </div>
    </div>
  );
}
