import React, { useState, useEffect } from 'react';

/**
 * ThemeCustomizerModal
 * Allows instant selection of Theme (Dark/Light/System), 7 Accent Palettes,
 * 6 GPU-accelerated Interactive Canvas Background Shaders, Display Density, and Typography.
 */
export default function ThemeCustomizerModal({ onClose }) {
  const [theme, setThemeState] = useState(() => localStorage.getItem('woxmail_theme') || 'dark');
  const [accent, setAccentState] = useState(() => localStorage.getItem('woxmail_accent') || 'purple');
  const [bgMode, setBgModeState] = useState(() => localStorage.getItem('woxmail_bg_mode') || 'aurora');
  const [bgIntensity, setBgIntensityState] = useState(() => parseFloat(localStorage.getItem('woxmail_bg_intensity') || '1.0'));
  const [density, setDensityState] = useState(() => localStorage.getItem('woxmail_density') || 'comfortable');
  const [font, setFontState] = useState(() => localStorage.getItem('woxmail_font') || 'inter');
  const [glassEnabled, setGlassEnabled] = useState(() => localStorage.getItem('woxmail_glass') === 'true');
  const [saving, setSaving] = useState(false);
  const [savedNotice, setSavedNotice] = useState(false);

  const THEMES = [
    {
      id: 'dark',
      name: 'Dark Mode',
      icon: (
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z" />
        </svg>
      ),
      desc: 'Deep violet dark space optimized for low-light focus',
    },
    {
      id: 'light',
      name: 'Light Mode',
      icon: (
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <circle cx="12" cy="12" r="5" />
          <line x1="12" y1="1" x2="12" y2="3" />
          <line x1="12" y1="21" x2="12" y2="23" />
          <line x1="4.22" y1="4.22" x2="5.64" y2="5.64" />
          <line x1="18.36" y1="18.36" x2="19.78" y2="19.78" />
          <line x1="1" y1="12" x2="3" y2="12" />
          <line x1="21" y1="12" x2="23" y2="12" />
          <line x1="4.22" y1="19.78" x2="5.64" y2="18.36" />
          <line x1="18.36" y1="5.64" x2="19.78" y2="4.22" />
        </svg>
      ),
      desc: 'Crisp, high-contrast light workspace for daytime clarity',
    },
    {
      id: 'system',
      name: 'Auto System',
      icon: (
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <rect width="20" height="14" x="2" y="3" rx="2" />
          <line x1="8" y1="21" x2="16" y2="21" />
          <line x1="12" y1="17" x2="12" y2="21" />
        </svg>
      ),
      desc: 'Follows your operating system preference automatically',
    },
  ];

  const ACCENTS = [
    { id: 'purple', name: 'Sovereign Purple', color: '#7c3aed' },
    { id: 'emerald', name: 'Cyber Emerald', color: '#10b981' },
    { id: 'cobalt', name: 'Midnight Cobalt', color: '#3b82f6' },
    { id: 'amber', name: 'Sunset Amber', color: '#f59e0b' },
    { id: 'cyan', name: 'Matrix Cyan', color: '#06b6d4' },
    { id: 'crimson', name: 'Crimson Red', color: '#ef4444' },
    { id: 'oled', name: 'OLED Mono', color: '#e5e7eb' },
  ];

  const BG_MODES = [
    { id: 'aurora', name: 'Aurora Waves', desc: 'Drifting violet & cyan atmospheric light waves reacting to cursor motion' },
    { id: 'cyber_mesh', name: 'Cyber Mesh 3D', desc: 'Glowing perspective wireframe grid with illumination ripples' },
    { id: 'deep_space', name: 'Deep Space Starfield', desc: 'Parallax star particles with cursor gravity repulsion' },
    { id: 'matrix', name: 'Matrix Stream', desc: 'Cascading Sovereign glyph terminal rain' },
    { id: 'zen_drift', name: 'Zen Radial Drift', desc: 'Calming breathing chromatic radial blooms' },
    { id: 'oled_monochrome', name: 'Pure OLED Pitch Black', desc: 'Pitch-black distraction-free power-saving background' },
  ];

  const DENSITIES = [
    { id: 'compact', name: 'Compact', desc: 'High density, 52px rows' },
    { id: 'comfortable', name: 'Comfortable', desc: 'Balanced spacing (Default)' },
    { id: 'relaxed', name: 'Relaxed', desc: 'Spacious 84px rows' },
  ];

  const FONTS = [
    { id: 'inter', name: 'Inter (Modern Sans)', preview: 'The quick brown fox jumps over the lazy dog' },
    { id: 'mono', name: 'JetBrains Mono (Developer)', preview: 'const mail = await woxmail.decrypt();' },
    { id: 'serif', name: 'Newsreader (Editorial)', preview: 'Timeless typography for focused reading.' },
  ];

  const handleThemeChange = (newTheme) => {
    setThemeState(newTheme);
    if (window.WoxTheme?.setTheme) {
      window.WoxTheme.setTheme(newTheme);
    } else {
      localStorage.setItem('woxmail_theme', newTheme);
      document.documentElement.setAttribute('data-theme', newTheme === 'system' ? (window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light') : newTheme);
    }
  };

  const handleAccentChange = (newAccent) => {
    setAccentState(newAccent);
    if (window.WoxTheme?.setAccent) {
      window.WoxTheme.setAccent(newAccent);
    } else {
      localStorage.setItem('woxmail_accent', newAccent);
      document.documentElement.setAttribute('data-accent', newAccent);
    }
  };

  const handleBgModeChange = (mode) => {
    setBgModeState(mode);
    localStorage.setItem('woxmail_bg_mode', mode);
    if (window.WoxBackground?.setMode) {
      window.WoxBackground.setMode(mode);
    }
  };

  const handleIntensityChange = (val) => {
    const num = parseFloat(val);
    setBgIntensityState(num);
    localStorage.setItem('woxmail_bg_intensity', String(num));
    if (window.WoxBackground?.setIntensity) {
      window.WoxBackground.setIntensity(num);
    }
  };

  const handleDensityChange = (d) => {
    setDensityState(d);
    if (window.WoxTheme?.setDensity) {
      window.WoxTheme.setDensity(d);
    } else {
      localStorage.setItem('woxmail_density', d);
      document.documentElement.setAttribute('data-density', d);
    }
  };

  const handleFontChange = (f) => {
    setFontState(f);
    if (window.WoxTheme?.setFont) {
      window.WoxTheme.setFont(f);
    } else {
      localStorage.setItem('woxmail_font', f);
      document.documentElement.setAttribute('data-font', f);
    }
  };

  const handleGlassToggle = () => {
    const next = !glassEnabled;
    setGlassEnabled(next);
    localStorage.setItem('woxmail_glass', String(next));
    if (next) {
      document.documentElement.setAttribute('data-glass', 'true');
    } else {
      document.documentElement.removeAttribute('data-glass');
    }
  };

  const saveToCloud = async () => {
    try {
      setSaving(true);
      await fetch('/api/settings/preferences', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({
          preferences: {
            theme,
            accent,
            bgMode,
            bgIntensity,
            density,
            font,
            glass: glassEnabled
          }
        })
      });
      setSavedNotice(true);
      setTimeout(() => setSavedNotice(false), 3000);
      if (window.WoxToast) window.WoxToast.success('Theme preferences saved to profile');
    } catch (err) {
      if (window.WoxToast) window.WoxToast.info('Preferences saved locally on this device');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div
      className="modal-backdrop"
      onClick={onClose}
      style={{
        position: 'fixed',
        inset: 0,
        background: 'rgba(0,0,0,0.7)',
        backdropFilter: 'blur(8px)',
        zIndex: 99999,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: '1rem',
      }}
    >
      <div
        className="card theme-customizer-modal"
        onClick={(e) => e.stopPropagation()}
        style={{
          width: '100%',
          maxWidth: 720,
          maxHeight: '90vh',
          display: 'flex',
          flexDirection: 'column',
          padding: 0,
          overflow: 'hidden',
          background: 'var(--color-bg-card)',
          border: '1px solid var(--color-border)',
          borderRadius: 'var(--radius-lg)',
          boxShadow: 'var(--shadow-lg)',
        }}
      >
        {/* Header */}
        <div style={{ padding: '1.25rem 1.5rem', borderBottom: '1px solid var(--color-border)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <div>
            <h2 style={{ margin: 0, fontSize: '1.2rem', fontWeight: 800, display: 'flex', alignItems: 'center', gap: '0.6rem' }}>
              <span style={{ display: 'inline-flex', color: 'var(--color-primary-light)' }}>
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <circle cx="13.5" cy="6.5" r=".5" fill="currentColor" />
                  <circle cx="17.5" cy="10.5" r=".5" fill="currentColor" />
                  <circle cx="8.5" cy="7.5" r=".5" fill="currentColor" />
                  <circle cx="6.5" cy="12.5" r=".5" fill="currentColor" />
                  <path d="M12 2C6.5 2 2 6.5 2 12s4.5 10 10 10c.926 0 1.648-.746 1.648-1.688 0-.437-.18-.835-.437-1.125-.29-.289-.438-.652-.438-1.125a1.64 1.64 0 0 1 1.668-1.668h1.996c3.051 0 5.555-2.503 5.555-5.554C21.965 6.012 17.461 2 12 2z" />
                </svg>
              </span>
              <span>Theme & Interactive Backgrounds</span>
            </h2>
            <p className="text-secondary" style={{ margin: '0.25rem 0 0', fontSize: '0.8rem' }}>
              Live customize color palettes, shaders, display density, and reading typography.
            </p>
          </div>
          <button type="button" className="btn btn-ghost btn-icon" onClick={onClose} aria-label="Close">
            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
              <line x1="18" y1="6" x2="6" y2="18" />
              <line x1="6" y1="6" x2="18" y2="18" />
            </svg>
          </button>
        </div>

        {/* Scrollable Body */}
        <div style={{ flex: 1, overflowY: 'auto', padding: '1.5rem', display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>
          {savedNotice && (
            <div className="badge badge-green" style={{ width: '100%', padding: '0.6rem', textAlign: 'center', fontSize: '0.8125rem' }}>
              ✓ Settings saved & synced to your account
            </div>
          )}

          {/* 1. Theme Selection */}
          <div>
            <label style={{ fontSize: '0.875rem', fontWeight: 700, display: 'block', marginBottom: '0.6rem', color: 'var(--color-text-primary)' }}>
              1. Theme Mode
            </label>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(190px, 1fr))', gap: '0.75rem' }}>
              {THEMES.map((t) => (
                <button
                  key={t.id}
                  type="button"
                  onClick={() => handleThemeChange(t.id)}
                  style={{
                    display: 'flex',
                    flexDirection: 'column',
                    alignItems: 'flex-start',
                    padding: '0.875rem',
                    borderRadius: 'var(--radius-md)',
                    border: theme === t.id ? '2px solid var(--color-primary)' : '1px solid var(--color-border)',
                    background: theme === t.id ? 'rgba(124, 58, 237, 0.12)' : 'var(--color-bg-elevated)',
                    cursor: 'pointer',
                    textAlign: 'left',
                    transition: 'all var(--transition-fast)'
                  }}
                >
                  <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '0.25rem' }}>
                    <span style={{ fontSize: '1.1rem' }}>{t.icon}</span>
                    <span style={{ fontWeight: 700, fontSize: '0.875rem', color: 'var(--color-text-primary)' }}>{t.name}</span>
                  </div>
                  <span className="text-secondary" style={{ fontSize: '0.72rem', lineHeight: 1.35 }}>{t.desc}</span>
                </button>
              ))}
            </div>
          </div>

          {/* 2. Color Accent */}
          <div>
            <label style={{ fontSize: '0.875rem', fontWeight: 700, display: 'block', marginBottom: '0.6rem', color: 'var(--color-text-primary)' }}>
              2. Sovereign Color Accent
            </label>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(130px, 1fr))', gap: '0.6rem' }}>
              {ACCENTS.map((item) => (
                <button
                  key={item.id}
                  type="button"
                  onClick={() => handleAccentChange(item.id)}
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: '0.5rem',
                    padding: '0.65rem 0.75rem',
                    borderRadius: 'var(--radius-md)',
                    border: accent === item.id ? `2px solid ${item.color}` : '1px solid var(--color-border)',
                    background: accent === item.id ? 'var(--color-bg-hover)' : 'var(--color-bg-elevated)',
                    cursor: 'pointer',
                    textAlign: 'left'
                  }}
                >
                  <span style={{ width: 14, height: 14, borderRadius: '50%', backgroundColor: item.color, display: 'inline-block', boxShadow: `0 0 8px ${item.color}`, flexShrink: 0 }} />
                  <span style={{ fontSize: '0.78rem', fontWeight: 600, color: 'var(--color-text-primary)' }}>{item.name}</span>
                </button>
              ))}
            </div>
          </div>

          {/* 3. Interactive Background Canvas Shaders */}
          <div>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.6rem' }}>
              <label style={{ fontSize: '0.875rem', fontWeight: 700, color: 'var(--color-text-primary)' }}>
                3. Interactive Canvas Backgrounds (60 FPS GPU)
              </label>
              <button
                type="button"
                className="btn btn-ghost btn-xs"
                onClick={handleGlassToggle}
                style={{
                  cursor: 'pointer',
                  borderRadius: 'var(--radius-pill)',
                  fontSize: '0.75rem',
                  padding: '0.25rem 0.75rem',
                  border: '1px solid var(--color-border)',
                  background: glassEnabled ? 'rgba(124, 58, 237, 0.2)' : 'transparent',
                  color: glassEnabled ? 'var(--color-primary-light)' : 'var(--color-text-secondary)',
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: '0.35rem',
                  fontWeight: 600,
                }}
              >
                <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <polygon points="12 2 2 7 12 12 22 7 12 2" />
                  <polyline points="2 17 12 22 22 17" />
                  <polyline points="2 12 12 17 22 12" />
                </svg>
                <span>{glassEnabled ? 'Glassmorphism Enabled' : 'Glassmorphism Disabled'}</span>
              </button>
            </div>
            
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '0.75rem', marginBottom: '0.85rem' }}>
              {BG_MODES.map((item) => (
                <div
                  key={item.id}
                  onClick={() => handleBgModeChange(item.id)}
                  style={{
                    padding: '0.85rem',
                    borderRadius: 'var(--radius-md)',
                    border: bgMode === item.id ? '2px solid var(--color-primary)' : '1px solid var(--color-border)',
                    background: bgMode === item.id ? 'rgba(124, 58, 237, 0.12)' : 'var(--color-bg-elevated)',
                    cursor: 'pointer',
                    transition: 'all var(--transition-fast)'
                  }}
                >
                  <div style={{ fontWeight: 700, fontSize: '0.825rem', color: 'var(--color-text-primary)', marginBottom: '0.2rem' }}>
                    {item.name}
                  </div>
                  <div className="text-secondary" style={{ fontSize: '0.7rem', lineHeight: 1.35 }}>
                    {item.desc}
                  </div>
                </div>
              ))}
            </div>

            {/* Opacity & Intensity slider */}
            <div style={{ padding: '0.75rem 1rem', background: 'var(--color-bg-input)', borderRadius: 'var(--radius-md)', border: '1px solid var(--color-border)' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '0.4rem' }}>
                <span style={{ fontSize: '0.8rem', fontWeight: 600 }}>Shader Glow & Particle Opacity</span>
                <span style={{ fontSize: '0.75rem', fontFamily: 'var(--font-mono)' }}>{Math.round(bgIntensity * 100)}%</span>
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

          {/* 4. Display Density */}
          <div>
            <label style={{ fontSize: '0.875rem', fontWeight: 700, display: 'block', marginBottom: '0.6rem', color: 'var(--color-text-primary)' }}>
              4. Display Density
            </label>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '0.6rem' }}>
              {DENSITIES.map((d) => (
                <div
                  key={d.id}
                  onClick={() => handleDensityChange(d.id)}
                  style={{
                    padding: '0.75rem',
                    borderRadius: 'var(--radius-md)',
                    border: density === d.id ? '2px solid var(--color-primary)' : '1px solid var(--color-border)',
                    background: density === d.id ? 'rgba(124, 58, 237, 0.12)' : 'var(--color-bg-elevated)',
                    cursor: 'pointer',
                    textAlign: 'center'
                  }}
                >
                  <div style={{ fontWeight: 700, fontSize: '0.8125rem' }}>{d.name}</div>
                  <div className="text-secondary" style={{ fontSize: '0.68rem', marginTop: '0.15rem' }}>{d.desc}</div>
                </div>
              ))}
            </div>
          </div>

          {/* 5. Typography */}
          <div>
            <label style={{ fontSize: '0.875rem', fontWeight: 700, display: 'block', marginBottom: '0.6rem', color: 'var(--color-text-primary)' }}>
              5. Reading Typography
            </label>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '0.6rem' }}>
              {FONTS.map((f) => (
                <div
                  key={f.id}
                  onClick={() => handleFontChange(f.id)}
                  style={{
                    padding: '0.75rem',
                    borderRadius: 'var(--radius-md)',
                    border: font === f.id ? '2px solid var(--color-primary)' : '1px solid var(--color-border)',
                    background: font === f.id ? 'rgba(124, 58, 237, 0.12)' : 'var(--color-bg-elevated)',
                    cursor: 'pointer'
                  }}
                >
                  <div style={{ fontWeight: 700, fontSize: '0.8125rem' }}>{f.name}</div>
                  <div className="text-secondary" style={{ fontSize: '0.72rem', fontStyle: 'italic', marginTop: '0.2rem' }}>{f.preview}</div>
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* Footer Actions */}
        <div style={{ padding: '1rem 1.5rem', borderTop: '1px solid var(--color-border)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <button
            type="button"
            className="btn btn-ghost btn-sm"
            onClick={() => {
              handleThemeChange('dark');
              handleAccentChange('purple');
              handleBgModeChange('aurora');
              handleIntensityChange(1.0);
              handleDensityChange('comfortable');
              handleFontChange('inter');
            }}
          >
            Reset Defaults
          </button>
          <div style={{ display: 'flex', gap: '0.5rem' }}>
            <button type="button" className="btn btn-secondary btn-sm" onClick={onClose}>
              Close
            </button>
            <button
              type="button"
              className="btn btn-primary btn-sm"
              disabled={saving}
              onClick={saveToCloud}
            >
              {saving ? 'Saving...' : 'Sync to Cloud'}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
