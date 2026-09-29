import React from 'react';
import { useIntl } from '../../i18n/IntlProvider.jsx';

const SUPPORTED_LANGUAGES = [
  { code: 'en', name: 'English', nativeName: 'English', region: 'Global / US' },
  { code: 'es', name: 'Spanish', nativeName: 'Español', region: 'Spain / Latin America' },
  { code: 'fr', name: 'French', nativeName: 'Français', region: 'France / Canada' },
  { code: 'de', name: 'German', nativeName: 'Deutsch', region: 'Germany / Austria / Switzerland' },
];

export default function LanguageSection() {
  const { locale, setLocale, t, isRtl } = useIntl();

  return (
    <div className="card settings-section" style={{ maxWidth: '780px', margin: '0 auto' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', marginBottom: '1.25rem' }}>
        <div style={{
          width: '38px',
          height: '38px',
          borderRadius: '10px',
          background: 'var(--color-primary-glow)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          color: 'var(--color-primary-light)'
        }}>
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <circle cx="12" cy="12" r="10" />
            <line x1="2" y1="12" x2="22" y2="12" />
            <path d="M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z" />
          </svg>
        </div>
        <div>
          <h2 style={{ margin: 0, fontSize: '1.25rem', fontWeight: 600 }}>
            {t('settings.language', 'Language & Locale')}
          </h2>
          <p className="text-secondary" style={{ margin: '0.2rem 0 0 0', fontSize: '0.85rem' }}>
            Choose your preferred display language and regional settings for WoxMail.
          </p>
        </div>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))', gap: '1rem', marginBottom: '1.5rem' }}>
        {SUPPORTED_LANGUAGES.map((lang) => {
          const isSelected = locale === lang.code;
          return (
            <div
              key={lang.code}
              onClick={() => setLocale(lang.code)}
              style={{
                border: isSelected ? '2px solid var(--color-primary)' : '1px solid var(--color-border)',
                borderRadius: 'var(--radius-md)',
                padding: '1rem',
                cursor: 'pointer',
                background: isSelected ? 'rgba(124, 58, 237, 0.08)' : 'var(--color-bg-card)',
                transition: 'all var(--transition-fast)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
              }}
            >
              <div>
                <div style={{ fontWeight: 600, fontSize: '0.95rem', color: isSelected ? 'var(--color-primary-light)' : 'var(--color-text-primary)' }}>
                  {lang.nativeName}
                </div>
                <div className="text-secondary" style={{ fontSize: '0.8rem', marginTop: '0.15rem' }}>
                  {lang.name} &bull; {lang.region}
                </div>
              </div>
              <div>
                {isSelected ? (
                  <span className="badge badge-purple">[ACTIVE]</span>
                ) : (
                  <span className="badge" style={{ background: 'var(--color-bg-hover)', color: 'var(--color-text-secondary)' }}>
                    Select
                  </span>
                )}
              </div>
            </div>
          );
        })}
      </div>

      <div style={{
        padding: '0.85rem 1rem',
        borderRadius: 'var(--radius-md)',
        background: 'var(--color-bg-elevated)',
        border: '1px solid var(--color-border)',
        fontSize: '0.8125rem',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between'
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
          <span className="text-secondary">Layout Direction:</span>
          <strong>{isRtl ? 'Right-to-Left (RTL)' : 'Left-to-Right (LTR)'}</strong>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
          <span className="text-secondary">Current Tag:</span>
          <span className="mono">{locale}</span>
        </div>
      </div>
    </div>
  );
}
