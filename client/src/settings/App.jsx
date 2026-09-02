import React, { useState, useEffect } from 'react';
import { useUser } from '../shared/hooks.js';
import { get, put, del, post } from '../shared/api.js';
import DualVerificationModal from '../shared/components/DualVerificationModal.jsx';
import AccountsSection from './components/AccountsSection.jsx';
import AppearanceSection from './components/AppearanceSection.jsx';
import IntelligenceSection from './components/IntelligenceSection.jsx';
import TemplatesSection from './components/TemplatesSection.jsx';
import IntegrationsSection from './components/IntegrationsSection.jsx';
import AnalyticsSection from './components/AnalyticsSection.jsx';
import DeveloperSection from './components/DeveloperSection.jsx';
import ThemeCustomizerModal from '../dashboard/components/ThemeCustomizerModal.jsx';
import BackgroundCanvas from '../dashboard/components/BackgroundCanvas.jsx';
import '../shared/styles/globals.css';

const VALID_SECTIONS = [
  'accounts', 'appearance', 'ai', 'templates', 'integrations_chat', 'analytics', 'developer',
  'profile', 'security', 'autoconfig', 'deadman', 'rss', 'pgp', 'screener',
  'webhooks', 'aliases', 'reverse', 'vacation', 'forwarding',
  'signature', 'filters', 'sessions', 'contacts', 'history', 'danger',
];

export default function App() {
  const { user, loading, refetch: refetchUser } = useUser();
  const [activeSection, setActiveSection] = useState(() => {
    const hash = window.location.hash.replace('#', '');
    return VALID_SECTIONS.includes(hash) ? hash : null;
  });
  const [themeModalOpen, setThemeModalOpen] = useState(false);

  useEffect(() => {
    const handleKeyDown = (e) => {
      if ((e.key === 't' || e.key === 'T') && !['INPUT', 'TEXTAREA', 'SELECT'].includes(e.target.tagName) && !e.target.isContentEditable && !e.ctrlKey && !e.metaKey) {
        e.preventDefault();
        setThemeModalOpen(prev => !prev);
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, []);

  useEffect(() => {
    const handleHash = () => {
      const hash = window.location.hash.replace('#', '');
      setActiveSection(VALID_SECTIONS.includes(hash) ? hash : null);
    };
    window.addEventListener('hashchange', handleHash);
    return () => window.removeEventListener('hashchange', handleHash);
  }, []);

  const selectSection = (id) => {
    setActiveSection(id);
    if (id) {
      window.location.hash = id;
    } else {
      history.pushState('', document.title, window.location.pathname + window.location.search);
    }
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  if (loading) return null;

  const getSettingIcon = (id) => {
    switch (id) {
      case 'accounts':
        return <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M22 21v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/></svg>;
      case 'appearance':
        return <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="10"/><path d="M12 2a10 10 0 0 1 0 20z"/></svg>;
      case 'ai':
        return <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="m12 3-1.912 5.813a2 2 0 0 1-1.275 1.275L3 12l5.813 1.912a2 2 0 0 1 1.275 1.275L12 21l1.912-5.813a2 2 0 0 1 1.275-1.275L21 12l-5.813-1.912a2 2 0 0 1-1.275-1.275L12 3Z"/></svg>;
      case 'templates':
        return <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/><line x1="16" y1="13" x2="8" y2="13"/><line x1="16" y1="17" x2="8" y2="17"/><polyline points="10 9 9 9 8 9"/></svg>;
      case 'integrations_chat':
        return <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="m3 21 1.9-5.7a8.5 8.5 0 1 1 3.8 3.8z"/></svg>;
      case 'analytics':
        return <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><line x1="18" y1="20" x2="18" y2="10"/><line x1="12" y1="20" x2="12" y2="4"/><line x1="6" y1="20" x2="6" y2="14"/></svg>;
      case 'developer':
        return <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="16 18 22 12 16 6"/><polyline points="8 6 2 12 8 18"/></svg>;
      case 'profile':
        return <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M19 21v-2a4 4 0 0 0-4-4H9a4 4 0 0 0-4 4v2"/><circle cx="12" cy="7" r="4"/></svg>;
      case 'security':
        return <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect width="18" height="11" x="3" y="11" rx="2" ry="2"/><path d="M7 11V7a5 5 0 0 1 10 0v4"/></svg>;
      case 'autoconfig':
        return <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect width="14" height="20" x="5" y="2" rx="2" ry="2"/><path d="M12 18h.01"/></svg>;
      case 'screener':
        return <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/><circle cx="12" cy="11" r="2"/></svg>;
      case 'pgp':
        return <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="7.5" cy="15.5" r="5.5"/><path d="m21 2-9.6 9.6"/><path d="m15.5 7.5 3 3L22 7l-3-3"/></svg>;
      case 'aliases':
        return <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M22 21v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/></svg>;
      case 'reverse':
        return <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="16 3 21 3 21 8"/><line x1="4" y1="20" x2="21" y2="3"/><polyline points="21 16 21 21 16 21"/><line x1="15" y1="15" x2="21" y2="21"/><line x1="4" y1="4" x2="9" y2="9"/></svg>;
      case 'deadman':
        return <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 14 14"/></svg>;
      case 'rss':
        return <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M4 11a9 9 0 0 1 9 9"/><path d="M4 4a16 16 0 0 1 16 16"/><circle cx="5" cy="19" r="1"/></svg>;
      case 'vacation':
        return <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="4"/><path d="M12 2v2"/><path d="M12 20v2"/><path d="m4.93 4.93 1.41 1.41"/><path d="m17.66 17.66 1.41 1.41"/><path d="M2 12h2"/><path d="M20 12h2"/><path d="m6.34 17.66-1.41 1.41"/><path d="m19.07 4.93-1.41 1.41"/></svg>;
      case 'forwarding':
        return <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="15 3 21 3 21 9"/><line x1="10" y1="14" x2="21" y2="3"/><path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6"/></svg>;
      case 'webhooks':
        return <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2"/></svg>;
      case 'signature':
        return <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M12 20h9"/><path d="M16.5 3.5a2.121 2.121 0 0 1 3 3L7 19l-4 1 1-4L16.5 3.5z"/></svg>;
      case 'filters':
        return <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polygon points="22 3 2 3 10 12.46 10 19 14 21 14 12.46 22 3"/></svg>;
      case 'sessions':
        return <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect width="20" height="14" x="2" y="3" rx="2"/><line x1="8" x2="16" y1="21" y2="21"/><line x1="12" x2="12" y1="17" y2="21"/></svg>;
      case 'danger':
        return <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="3 6 5 6 21 6"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/><line x1="10" y1="11" x2="10" y2="17"/><line x1="14" y1="11" x2="14" y2="17"/></svg>;
      default:
        return <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1 0 2.83 2 2 0 0 1-2.83 0l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-2 2 2 2 0 0 1-2-2v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83 0 2 2 0 0 1 0-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1-2-2 2 2 0 0 1 2-2h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 0-2.83 2 2 0 0 1 2.83 0l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 2-2 2 2 0 0 1 2 2v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 0 2 2 0 0 1 0 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 2 2 2 2 0 0 1-2 2h-.09a1.65 1.65 0 0 0-1.51 1z"/></svg>;
    }
  };

  const cards = [
    { id: 'accounts', title: 'Connected Accounts', desc: 'Connect Gmail, Outlook, Yahoo, Custom IMAP/SMTP' },
    { id: 'appearance', title: 'Appearance & Themes', desc: '7 color accents, 6 interactive shaders, density, fonts' },
    { id: 'ai', title: 'AI Copilot & Writing', desc: 'Ollama local ($0), Gemini, tone adjuster, smart replies' },
    { id: 'templates', title: 'Templates & Snippets', desc: 'Reusable email bodies with {{variable}} placeholders' },
    { id: 'integrations_chat', title: 'Chat Forwarding', desc: 'Forward emails to Telegram bots, Discord, Slack' },
    { id: 'analytics', title: 'Mailbox Analytics', desc: 'Open tracking, response times, activity trends' },
    { id: 'developer', title: 'Developer & API Keys', desc: 'Scoped personal API keys for automation' },
    { id: 'profile', title: 'Profile', desc: 'Display name, avatar, recovery email' },
    { id: 'security', title: 'Security', desc: 'Password, Two-factor auth, Recovery keys' },
    { id: 'autoconfig', title: 'Mobile & Mail App Setup', desc: 'Auto-configure iOS, Android, Outlook, Thunderbird' },
    { id: 'screener', title: 'The Gatekeeper', desc: 'HEY-grade sender triage & domain firewall rules' },
    { id: 'pgp', title: 'PGP / E2E Encryption', desc: 'OpenPGP keys, WoxCrypt zero-knowledge vault' },
    { id: 'aliases', title: 'Aliases & Personas', desc: 'Send-as aliases and custom identities' },
    { id: 'reverse', title: 'Reverse Aliases', desc: 'Cloaked relay addresses for anonymous replies' },
    { id: 'deadman', title: "Dead Man's Switch", desc: 'Automated digital legacy dispatch' },
    { id: 'rss', title: 'Feed & Newsletter Hub', desc: 'Curate subscriptions and WebSub feeds' },
    { id: 'vacation', title: 'Auto-Responder', desc: 'Vacation notices and smart out-of-office' },
    { id: 'forwarding', title: 'Email Forwarding', desc: 'Encrypted inbound redirection' },
    { id: 'webhooks', title: 'Webhooks & Zapier', desc: 'Real-time JSON event dispatch' },
    { id: 'signature', title: 'Email Signature', desc: 'Rich-text & HTML signatures' },
    { id: 'filters', title: 'Rules & Filters', desc: 'Server-side mailbox automation rules' },
    { id: 'sessions', title: 'Active Sessions', desc: 'Manage logged-in devices and revoke access' },
    { id: 'danger', title: 'Danger Zone / Deletion', desc: 'Schedule permanent self-deletion with 14-day recovery grace period' },
  ];

  return (
    <div className="settings-page">
      <header className="settings-header" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '1rem' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.85rem' }}>
          <a href="/dashboard" className="btn btn-ghost btn-sm" style={{ display: 'inline-flex', alignItems: 'center', gap: '0.35rem' }}>
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="15 18 9 12 15 6"/></svg>
            <span>Inbox</span>
          </a>
          <h1 style={{ margin: 0, fontSize: '1.65rem' }}>
            <span>Settings</span>
            {activeSection && (
              <span style={{ color: 'var(--color-primary-light)', fontWeight: 600, fontSize: '1.25rem' }}>
                {' '}/ {cards.find(c => c.id === activeSection)?.title || activeSection}
              </span>
            )}
          </h1>
        </div>
        <button
          type="button"
          className="btn btn-secondary btn-sm"
          onClick={() => setThemeModalOpen(true)}
          style={{ display: 'inline-flex', alignItems: 'center', gap: '0.45rem' }}
          title="Themes, Accents & Interactive Shaders (Key: T)"
        >
          <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="10"/><path d="M12 2a10 10 0 0 1 0 20z"/></svg>
          <span>Theme & Shaders</span>
        </button>
      </header>

      {!activeSection ? (
        <div className="settings-grid">
          {cards.map((card) => (
            <div key={card.id} className="card settings-card" onClick={() => selectSection(card.id)}>
              <span className="settings-card-icon" style={{ display: 'inline-flex', color: card.id === 'danger' ? 'var(--color-error)' : 'var(--color-primary-light)' }}>
                {getSettingIcon(card.id)}
              </span>
              <h3 style={{ color: card.id === 'danger' ? 'var(--color-error)' : undefined }}>{card.title}</h3>
              <p className="text-secondary">{card.desc}</p>
            </div>
          ))}
        </div>
      ) : (
        <div>
          <button
            type="button"
            className="btn btn-secondary btn-sm"
            onClick={() => selectSection(null)}
            style={{ marginBottom: '1.25rem', display: 'inline-flex', alignItems: 'center', gap: '0.4rem', fontWeight: 600 }}
          >
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><line x1="19" y1="12" x2="5" y2="12"/><polyline points="12 19 5 12 12 5"/></svg>
            <span>Back to All Settings</span>
          </button>
          {activeSection === 'accounts' && <AccountsSection />}
          {activeSection === 'appearance' && <AppearanceSection />}
          {activeSection === 'ai' && <IntelligenceSection />}
          {activeSection === 'templates' && <TemplatesSection />}
          {activeSection === 'integrations_chat' && <IntegrationsSection />}
          {activeSection === 'analytics' && <AnalyticsSection />}
          {activeSection === 'developer' && <DeveloperSection />}
          {activeSection === 'profile' && <ProfileSection user={user} onUpdate={refetchUser} />}
          {activeSection === 'security' && <SecuritySection user={user} onUpdate={refetchUser} />}
          {activeSection === 'autoconfig' && <DeviceSetupSection user={user} />}
          {activeSection === 'deadman' && <DeadManSection />}
          {activeSection === 'rss' && <FeedRssSection />}
          {activeSection === 'pgp' && <PgpSection />}
          {activeSection === 'screener' && <ScreenerRulesSection />}
          {activeSection === 'webhooks' && <WebhooksSection />}
          {activeSection === 'aliases' && <AliasesSection user={user} />}
          {activeSection === 'reverse' && <ReverseAliasesSection />}
          {activeSection === 'vacation' && <VacationSection />}
          {activeSection === 'forwarding' && <ForwardingSection />}
          {activeSection === 'signature' && <SignatureSection />}
          {activeSection === 'filters' && <FiltersSection />}
          {activeSection === 'sessions' && <SessionsSection />}
          {activeSection === 'contacts' && <ContactsSection />}
          {activeSection === 'history' && <HistorySection />}
          {activeSection === 'danger' && <DangerZoneSection user={user} onUpdate={refetchUser} />}
        </div>
      )}

      {/* Theme & Background Customizer Modal */}
      {themeModalOpen && (
        <ThemeCustomizerModal
          onClose={() => setThemeModalOpen(false)}
        />
      )}

      {/* Interactive Background Canvas */}
      <BackgroundCanvas />
    </div>
  );
}

// ─── Profile Section ──────────────────────────
function ProfileSection({ user, onUpdate }) {
  const [form, setForm] = useState({
    displayName: user?.display_name || '',
    recoveryEmail: user?.recovery_email || '',
    timezone: user?.timezone || 'UTC',
    language: user?.language || 'en',
  });
  const [saving, setSaving] = useState(false);
  const [msg, setMsg] = useState('');
  const [verifySession, setVerifySession] = useState(null);

  const handleSave = async (e) => {
    e.preventDefault();
    setSaving(true);
    try {
      // Check if recovery email changed and requires dual verification
      const cleanNew = (form.recoveryEmail || '').trim();
      const currentEmail = (user?.recovery_email || '').trim();

      if (cleanNew && cleanNew !== currentEmail) {
        const res = await post('/verify/start', {
          type: 'recovery_email',
          targetEmail: cleanNew,
        });
        setVerifySession({
          sessionToken: res.sessionToken,
          targetEmail: res.targetEmail,
        });
        setSaving(false);
        return;
      }

      await put('/settings/profile', form);
      setMsg('Profile updated!');
      onUpdate();
      setTimeout(() => setMsg(''), 3000);
    } catch (err) {
      setMsg(err.message);
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="card" style={{ padding: '1.5rem' }}>
      <h2 style={{ marginBottom: '1rem' }}>Profile</h2>
      {msg && <div className="toast-text" style={{ marginBottom: '1rem' }}>{msg}</div>}
      <form onSubmit={handleSave} style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
        <div>
          <label className="text-secondary" style={{ fontSize: '0.8125rem', display: 'block', marginBottom: '0.25rem' }}>Email</label>
          <input className="input" value={user?.email || ''} disabled />
        </div>
        <div>
          <label className="text-secondary" style={{ fontSize: '0.8125rem', display: 'block', marginBottom: '0.25rem' }}>Display Name</label>
          <input className="input" value={form.displayName} onChange={(e) => setForm({ ...form, displayName: e.target.value })} />
        </div>
        <div>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.25rem' }}>
            <label className="text-secondary" style={{ fontSize: '0.8125rem' }}>Secondary Recovery Email</label>
            {user?.recovery_email && (
              <span className="badge badge-green" style={{ fontSize: '0.7rem', display: 'inline-flex', alignItems: 'center', gap: '0.25rem' }}>
                <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/></svg>
                <span>Verified Active</span>
              </span>
            )}
          </div>
          <input
            className="input"
            type="email"
            placeholder="e.g. yourname@gmail.com"
            value={form.recoveryEmail}
            onChange={(e) => setForm({ ...form, recoveryEmail: e.target.value })}
          />
          <p className="text-secondary" style={{ fontSize: '0.75rem', marginTop: '0.35rem' }}>
            Used for account recovery. Setting a new address dispatches a 6-digit code with instant reply verification.
          </p>
        </div>
        <div>
          <label className="text-secondary" style={{ fontSize: '0.8125rem', display: 'block', marginBottom: '0.25rem' }}>Timezone</label>
          <select className="input" value={form.timezone} onChange={(e) => setForm({ ...form, timezone: e.target.value })}>
            {['UTC', 'Asia/Manila', 'Asia/Tokyo', 'America/New_York', 'America/Los_Angeles', 'Europe/London'].map((tz) => (
              <option key={tz} value={tz}>{tz}</option>
            ))}
          </select>
        </div>
        <button type="submit" className="btn btn-primary" disabled={saving} style={{ alignSelf: 'flex-start' }}>
          {saving ? 'Saving...' : 'Save Profile'}
        </button>
      </form>

      {/* Dual Verification Modal */}
      {verifySession && (
        <DualVerificationModal
          sessionToken={verifySession.sessionToken}
          targetEmail={verifySession.targetEmail}
          title="Verify Recovery Email"
          description="To link this recovery address, enter the 6-digit code or simply reply to the email:"
          onVerified={() => {
            setVerifySession(null);
            setMsg('Recovery email verified and attached to your account!');
            onUpdate();
            setTimeout(() => setMsg(''), 4000);
          }}
          onClose={() => setVerifySession(null)}
        />
      )}
    </div>
  );
}

// ─── Security Section ─────────────────────────
function SecuritySection({ user, onUpdate }) {
  const [passwords, setPasswords] = useState({ currentPassword: '', newPassword: '' });
  const [msg, setMsg] = useState('');
  const [saving, setSaving] = useState(false);
  const [stepUpSession, setStepUpSession] = useState(null);

  const changePassword = async (e) => {
    e.preventDefault();
    setSaving(true);
    try {
      await put('/settings/password', passwords);
      setMsg('Password changed!');
      setPasswords({ currentPassword: '', newPassword: '' });
    } catch (err) {
      setMsg(err.message);
    } finally {
      setSaving(false);
      setTimeout(() => setMsg(''), 3000);
    }
  };

  const handleDisable2FAClick = async () => {
    try {
      const res = await post('/verify/start', {
        type: 'step_up',
        targetEmail: user?.email || '',
        meta: { action: 'disable_2fa' },
      });
      setStepUpSession({
        sessionToken: res.sessionToken,
        targetEmail: res.targetEmail,
      });
    } catch (err) {
      alert('Security challenge failed: ' + err.message);
    }
  };

  return (
    <div className="card" style={{ padding: '1.5rem' }}>
      <h2 style={{ marginBottom: '1rem' }}>Security</h2>
      {msg && <div className="toast-text" style={{ marginBottom: '1rem' }}>{msg}</div>}

      <h3 style={{ fontSize: '1rem', marginBottom: '0.75rem' }}>Change Password</h3>
      <form onSubmit={changePassword} style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem', marginBottom: '2rem' }}>
        <input className="input" type="password" placeholder="Current password" value={passwords.currentPassword}
          onChange={(e) => setPasswords({ ...passwords, currentPassword: e.target.value })} required />
        <input className="input" type="password" placeholder="New password (min 8 chars)" value={passwords.newPassword}
          onChange={(e) => setPasswords({ ...passwords, newPassword: e.target.value })} required minLength={8} />
        <button type="submit" className="btn btn-primary" disabled={saving} style={{ alignSelf: 'flex-start' }}>
          {saving ? 'Changing...' : 'Change Password'}
        </button>
      </form>

      <h3 style={{ fontSize: '1rem', marginBottom: '0.75rem' }}>Two-Factor Authentication</h3>
      <div style={{ display: 'flex', gap: '0.75rem', alignItems: 'center' }}>
        <a href="/otp-setup" className="btn btn-secondary">Setup / Reset 2FA</a>
        {user?.otp_enabled && (
          <button className="btn btn-danger" onClick={handleDisable2FAClick}>
            Disable 2FA (Step-Up Challenge)
          </button>
        )}
      </div>

      <h3 style={{ fontSize: '1rem', marginTop: '2rem', marginBottom: '0.75rem' }}>Email Viewer Privacy & Security Defaults</h3>
      <p style={{ fontSize: '0.8125rem', color: 'var(--color-text-secondary)', marginBottom: '1rem' }}>
        Control how external images, tracking pixels, dynamic scripts, and links are handled when viewing emails. All settings are zero-trust by default.
      </p>

      {(() => {
        const STORAGE_KEY = 'woxmail_email_privacy';
        const [privacyPrefs, setPrivacyPrefs] = React.useState(() => {
          try {
            const raw = localStorage.getItem(STORAGE_KEY);
            return raw ? JSON.parse(raw) : { remoteImages: 'block_all', trustedSenders: [], allowScripts: false, interceptLinks: true };
          } catch {
            return { remoteImages: 'block_all', trustedSenders: [], allowScripts: false, interceptLinks: true };
          }
        });
        const [newSender, setNewSender] = React.useState('');

        const updatePrivacyPref = (key, val) => {
          const updated = { ...privacyPrefs, [key]: val };
          setPrivacyPrefs(updated);
          localStorage.setItem(STORAGE_KEY, JSON.stringify(updated));
        };

        const addSender = (e) => {
          e.preventDefault();
          const clean = (newSender || '').trim().toLowerCase();
          if (!clean || privacyPrefs.trustedSenders?.includes(clean)) return;
          const updatedSenders = [...(privacyPrefs.trustedSenders || []), clean];
          updatePrivacyPref('trustedSenders', updatedSenders);
          setNewSender('');
        };

        const removeSender = (sender) => {
          const updatedSenders = (privacyPrefs.trustedSenders || []).filter((s) => s !== sender);
          updatePrivacyPref('trustedSenders', updatedSenders);
        };

        return (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '1.25rem', background: 'var(--color-bg-page)', padding: '1.25rem', borderRadius: 'var(--radius-md)', border: '1px solid var(--color-border)' }}>
            <div>
              <label style={{ display: 'flex', alignItems: 'center', gap: '0.45rem', fontSize: '0.875rem', fontWeight: 700, marginBottom: '0.4rem' }}>
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="3" width="18" height="18" rx="2" ry="2"/><circle cx="8.5" cy="8.5" r="1.5"/><polyline points="21 15 16 10 5 21"/></svg>
                <span>Remote Images & Tracking Beacons</span>
              </label>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '0.45rem', fontSize: '0.8125rem' }}>
                <label style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', cursor: 'pointer' }}>
                  <input
                    type="radio"
                    name="settingsRemoteImages"
                    value="block_all"
                    checked={privacyPrefs.remoteImages === 'block_all'}
                    onChange={() => updatePrivacyPref('remoteImages', 'block_all')}
                  />
                  <span><strong>Block all remote images by default</strong> (Recommended - Maximum Privacy)</span>
                </label>
                <label style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', cursor: 'pointer' }}>
                  <input
                    type="radio"
                    name="settingsRemoteImages"
                    value="trusted_only"
                    checked={privacyPrefs.remoteImages === 'trusted_only'}
                    onChange={() => updatePrivacyPref('remoteImages', 'trusted_only')}
                  />
                  <span><strong>Load images only from trusted senders</strong></span>
                </label>
                <label style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', cursor: 'pointer' }}>
                  <input
                    type="radio"
                    name="settingsRemoteImages"
                    value="allow_all"
                    checked={privacyPrefs.remoteImages === 'allow_all'}
                    onChange={() => updatePrivacyPref('remoteImages', 'allow_all')}
                  />
                  <span><strong>Always load all remote images automatically</strong></span>
                </label>
              </div>
            </div>

            <div>
              <label style={{ display: 'flex', alignItems: 'center', gap: '0.45rem', fontSize: '0.875rem', fontWeight: 700, marginBottom: '0.4rem' }}>
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2"/></svg>
                <span>JavaScript & Dynamic Content</span>
              </label>
              <label style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', cursor: 'pointer', fontSize: '0.8125rem' }}>
                <input
                  type="checkbox"
                  checked={privacyPrefs.allowScripts}
                  onChange={(e) => updatePrivacyPref('allowScripts', e.target.checked)}
                />
                <span><strong>Enable JavaScript in Sandboxed Viewer</strong> (Default is Blocked)</span>
              </label>
            </div>

            <div>
              <label style={{ display: 'flex', alignItems: 'center', gap: '0.45rem', fontSize: '0.875rem', fontWeight: 700, marginBottom: '0.4rem' }}>
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71"/><path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71"/></svg>
                <span>Link Safety & Phishing Protection</span>
              </label>
              <label style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', cursor: 'pointer', fontSize: '0.8125rem' }}>
                <input
                  type="checkbox"
                  checked={privacyPrefs.interceptLinks}
                  onChange={(e) => updatePrivacyPref('interceptLinks', e.target.checked)}
                />
                <span><strong>Intercept external links with domain inspection & preview</strong> (Recommended)</span>
              </label>
            </div>

            <div>
              <label style={{ display: 'flex', alignItems: 'center', gap: '0.45rem', fontSize: '0.875rem', fontWeight: 700, marginBottom: '0.4rem' }}>
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/></svg>
                <span>Trusted Senders Whitelist ({privacyPrefs.trustedSenders?.length || 0})</span>
              </label>
              <form onSubmit={addSender} style={{ display: 'flex', gap: '0.5rem', marginBottom: '0.5rem' }}>
                <input
                  type="text"
                  className="input input-sm"
                  placeholder="e.g. newsletter@github.com or @stripe.com"
                  value={newSender}
                  onChange={(e) => setNewSender(e.target.value)}
                  style={{ flex: 1 }}
                />
                <button type="submit" className="btn btn-secondary btn-sm">Add Sender</button>
              </form>

              <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.4rem' }}>
                {(privacyPrefs.trustedSenders || []).length === 0 ? (
                  <span style={{ fontSize: '0.75rem', color: 'var(--color-text-tertiary)', fontStyle: 'italic' }}>
                    No senders in whitelist. Images from all senders require confirmation.
                  </span>
                ) : (
                  privacyPrefs.trustedSenders.map((s) => (
                    <span key={s} className="badge badge-purple" style={{ display: 'inline-flex', alignItems: 'center', gap: '0.35rem' }}>
                      <span>{s}</span>
                      <button
                        type="button"
                        onClick={() => removeSender(s)}
                        aria-label="Remove sender"
                        style={{ background: 'none', border: 'none', color: 'inherit', cursor: 'pointer', padding: 0, display: 'inline-flex', alignItems: 'center' }}
                      >
                        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
                      </button>
                    </span>
                  ))
                )}
              </div>
            </div>
          </div>
        );
      })()}

      {/* Step-Up Dual Verification Modal */}
      {stepUpSession && (
        <DualVerificationModal
          sessionToken={stepUpSession.sessionToken}
          targetEmail={stepUpSession.targetEmail}
          title="Security Step-Up Authorization"
          description="High-security action: Enter the 6-digit code or reply to the email to confirm disabling 2FA:"
          onVerified={async (data) => {
            setStepUpSession(null);
            try {
              const pw = prompt('Enter your current password to finalize disabling 2FA:');
              if (pw) {
                await del('/settings/2fa', { password: pw, stepUpToken: data.stepUpAuthToken });
                setMsg('2FA disabled successfully.');
                if (onUpdate) onUpdate();
              }
            } catch (err) {
              setMsg(err.message);
            }
          }}
          onClose={() => setStepUpSession(null)}
        />
      )}

      {/* Danger Zone: Account Deletion */}
      <div style={{ marginTop: '2.5rem' }}>
        <DangerZoneSection user={user} onUpdate={onUpdate} />
      </div>
    </div>
  );
}

// ─── Danger Zone / Account Deletion Section ─────────────────────
function DangerZoneSection({ user, onUpdate }) {
  const [status, setStatus] = useState(null);
  const [loading, setLoading] = useState(true);
  const [modalOpen, setModalOpen] = useState(false);
  const [password, setPassword] = useState('');
  const [reason, setReason] = useState('');
  const [confirmedCheck, setConfirmedCheck] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [msg, setMsg] = useState('');

  const fetchStatus = () => {
    setLoading(true);
    get('/settings/account/deletion-status')
      .then((d) => setStatus(d))
      .catch(() => {})
      .finally(() => setLoading(false));
  };

  useEffect(() => {
    fetchStatus();
  }, []);

  const handleRequestDeletion = async (e) => {
    e.preventDefault();
    if (!password) {
      alert('Please enter your current password.');
      return;
    }
    if (!confirmedCheck) {
      alert('Please confirm that you understand the 14-day deletion grace period.');
      return;
    }
    setSubmitting(true);
    try {
      const res = await post('/settings/account/delete-request', { password, reason });
      setModalOpen(false);
      setPassword('');
      setReason('');
      setConfirmedCheck(false);
      setMsg(res.message || 'Account scheduled for permanent deletion in 14 days.');
      fetchStatus();
      if (onUpdate) onUpdate();
    } catch (err) {
      alert(err.message || 'Failed to schedule account deletion.');
    } finally {
      setSubmitting(false);
    }
  };

  const handleCancelDeletion = async () => {
    setSubmitting(true);
    try {
      const res = await post('/settings/account/cancel-deletion');
      setMsg(res.message || 'Account deletion cancelled. Your account is fully active!');
      fetchStatus();
      if (onUpdate) onUpdate();
    } catch (err) {
      alert(err.message || 'Failed to cancel deletion.');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="card" style={{ padding: '1.75rem', borderColor: 'rgba(239, 68, 68, 0.4)' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: '0.65rem', marginBottom: '0.75rem' }}>
        <span style={{ display: 'inline-flex', color: 'var(--color-error)' }}>
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="m21.73 18-8-14a2 2 0 0 0-3.48 0l-8 14A2 2 0 0 0 4 21h16a2 2 0 0 0 1.73-3Z" />
            <line x1="12" y1="9" x2="12" y2="13" />
            <line x1="12" y1="17" x2="12.01" y2="17" />
          </svg>
        </span>
        <h2 style={{ margin: 0, color: 'var(--color-error)' }}>Danger Zone: Account & Mailbox Deletion</h2>
      </div>

      <p className="text-secondary" style={{ fontSize: '0.875rem', lineHeight: '1.6', marginBottom: '1.25rem' }}>
        Permanent users can request sovereign self-deletion of their account and all associated mailboxes.
        WoxMail provides a <strong>14-day recovery grace period</strong> before permanent purge:
      </p>

      <div style={{ background: 'var(--color-bg-page)', border: '1px solid var(--color-border)', borderRadius: 'var(--radius-md)', padding: '1rem 1.25rem', marginBottom: '1.5rem', fontSize: '0.8125rem', color: 'var(--color-text-secondary)' }}>
        <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
          <div style={{ display: 'flex', alignItems: 'flex-start', gap: '0.45rem' }}>
            <span style={{ display: 'inline-flex', color: 'var(--color-primary-light)', marginTop: '2px' }}>
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/></svg>
            </span>
            <span><strong>14-Day Recovery Grace Period:</strong> You can log back into your account at any time within 14 days to automatically cancel the deletion and restore full access.</span>
          </div>
          <div style={{ display: 'flex', alignItems: 'flex-start', gap: '0.45rem' }}>
            <span style={{ display: 'inline-flex', color: 'var(--color-info)', marginTop: '2px' }}>
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M4 4h16c1.1 0 2 .9 2 2v12c0 1.1-.9 2-2 2H4c-1.1 0-2-.9-2-2V6c0-1.1.9-2 2-2z"/><polyline points="22,6 12,13 2,6"/></svg>
            </span>
            <span><strong>Active During Grace Period:</strong> Your inbox continues receiving mail normally until the 14 days elapse.</span>
          </div>
          <div style={{ display: 'flex', alignItems: 'flex-start', gap: '0.45rem' }}>
            <span style={{ display: 'inline-flex', color: 'var(--color-error)', marginTop: '2px' }}>
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="3 6 5 6 21 6"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/></svg>
            </span>
            <span><strong>Permanent Purge:</strong> After 14 days without logging in, all emails, attachments, PGP vaults, aliases, contacts, and user records are permanently destroyed and cannot be recovered.</span>
          </div>
        </div>
      </div>

      {msg && (
        <div style={{ padding: '0.75rem 1rem', background: 'rgba(34, 197, 94, 0.15)', border: '1px solid var(--color-success)', color: '#4ade80', borderRadius: 'var(--radius-md)', marginBottom: '1.25rem', fontSize: '0.875rem' }}>
          {msg}
        </div>
      )}

      {loading ? (
        <p className="text-secondary">Checking deletion status...</p>
      ) : status?.isScheduled ? (
        <div style={{ background: 'rgba(239, 68, 68, 0.12)', border: '1px solid rgba(239, 68, 68, 0.4)', borderRadius: 'var(--radius-md)', padding: '1.25rem' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '1rem' }}>
            <div>
              <div style={{ fontWeight: 700, color: 'var(--color-error)', fontSize: '1rem', marginBottom: '0.25rem' }}>
                Account Deletion Scheduled ({status.daysRemaining} days remaining)
              </div>
              <div style={{ fontSize: '0.8125rem', color: 'var(--color-text-secondary)' }}>
                Scheduled for permanent purge on: <strong>{new Date(status.deletionScheduledAt).toLocaleString()}</strong>
              </div>
              {status.deletionReason && (
                <div style={{ fontSize: '0.75rem', color: 'var(--color-text-tertiary)', marginTop: '0.35rem' }}>
                  Reason: "{status.deletionReason}"
                </div>
              )}
            </div>

            <button
              type="button"
              className="btn btn-primary"
              onClick={handleCancelDeletion}
              disabled={submitting}
              style={{ fontWeight: 700 }}
            >
              {submitting ? 'Cancelling...' : 'Cancel Deletion & Keep Account'}
            </button>
          </div>
        </div>
      ) : (
        <div>
          <button
            type="button"
            className="btn btn-danger"
            onClick={() => setModalOpen(true)}
            style={{ fontWeight: 600, display: 'inline-flex', alignItems: 'center', gap: '0.45rem' }}
          >
            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="3 6 5 6 21 6"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/><line x1="10" y1="11" x2="10" y2="17"/><line x1="14" y1="11" x2="14" y2="17"/></svg>
            <span>Request Account Deletion (14-Day Grace Period)</span>
          </button>
        </div>
      )}

      {/* Confirmation Modal */}
      {modalOpen && (
        <div
          style={{
            position: 'fixed',
            inset: 0,
            background: 'rgba(0, 0, 0, 0.82)',
            backdropFilter: 'blur(10px)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            zIndex: 99999,
            padding: '1rem',
          }}
          onClick={(e) => { if (e.target === e.currentTarget) setModalOpen(false); }}
        >
          <div
            className="card"
            style={{
              maxWidth: '480px',
              width: '100%',
              background: 'var(--color-bg-elevated)',
              border: '1px solid rgba(239, 68, 68, 0.4)',
              boxShadow: '0 20px 50px rgba(0, 0, 0, 0.7)',
              padding: '1.75rem',
            }}
          >
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1rem' }}>
              <h3 style={{ margin: 0, color: 'var(--color-error)', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                <span style={{ display: 'inline-flex' }}>
                  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="3 6 5 6 21 6"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/></svg>
                </span>
                <span>Confirm Account Deletion</span>
              </h3>
              <button type="button" className="btn btn-ghost btn-xs" onClick={() => setModalOpen(false)} aria-label="Close">
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
              </button>
            </div>

            <p style={{ fontSize: '0.84375rem', color: 'var(--color-text-secondary)', lineHeight: '1.5', marginBottom: '1.25rem' }}>
              Your account will enter a <strong>14-day recovery window</strong>. If you log back in anytime within 14 days, deletion is stopped immediately.
            </p>

            <form onSubmit={handleRequestDeletion} style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
              <div>
                <label style={{ display: 'block', fontSize: '0.8125rem', fontWeight: 600, marginBottom: '0.35rem' }}>
                  Current Password <span style={{ color: 'var(--color-error)' }}>*</span>
                </label>
                <input
                  type="password"
                  className="input"
                  placeholder="Enter your account password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  required
                  autoFocus
                />
              </div>

              <div>
                <label style={{ display: 'block', fontSize: '0.8125rem', fontWeight: 600, marginBottom: '0.35rem' }}>
                  Reason for leaving (optional)
                </label>
                <textarea
                  className="input"
                  placeholder="Help us improve WoxMail..."
                  value={reason}
                  onChange={(e) => setReason(e.target.value)}
                  rows={2}
                  style={{ resize: 'vertical' }}
                />
              </div>

              <label style={{ display: 'flex', alignItems: 'flex-start', gap: '0.65rem', cursor: 'pointer', fontSize: '0.8125rem', color: 'var(--color-text-secondary)' }}>
                <input
                  type="checkbox"
                  checked={confirmedCheck}
                  onChange={(e) => setConfirmedCheck(e.target.checked)}
                  style={{ marginTop: '0.2rem' }}
                />
                <span>I understand that I have 14 days to log back in to stop this deletion, after which my account and emails are permanently destroyed.</span>
              </label>

              <div style={{ display: 'flex', gap: '0.75rem', justifyContent: 'flex-end', marginTop: '0.5rem' }}>
                <button type="button" className="btn btn-secondary" onClick={() => setModalOpen(false)}>
                  Cancel
                </button>
                <button type="submit" className="btn btn-danger" disabled={submitting || !confirmedCheck || !password}>
                  {submitting ? 'Scheduling...' : 'Schedule 14-Day Deletion'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}

// ─── Sessions Section ─────────────────────────
function SessionsSection() {
  const [sessions, setSessions] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    get('/settings/sessions').then((d) => setSessions(d.sessions || [])).finally(() => setLoading(false));
  }, []);

  const revoke = async (id) => {
    await del(`/settings/sessions/${id}`);
    setSessions((prev) => prev.filter((s) => s.id !== id));
  };

  const revokeAll = async () => {
    if (!confirm('Revoke all other sessions?')) return;
    await del('/settings/sessions');
    setSessions([]);
  };

  return (
    <div className="card" style={{ padding: '1.5rem' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1rem' }}>
        <h2>Active Sessions</h2>
        <button className="btn btn-danger btn-sm" onClick={revokeAll}>Revoke All Others</button>
      </div>
      {loading ? <p className="text-secondary">Loading...</p> : sessions.length === 0 ? (
        <p className="text-secondary">No active sessions</p>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
          {sessions.map((s) => (
            <div key={s.id} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '0.75rem', border: '1px solid var(--color-border)', borderRadius: 'var(--radius-md)' }}>
              <div>
                <div style={{ fontSize: '0.875rem' }}>{s.ip_address}</div>
                <div className="text-secondary" style={{ fontSize: '0.75rem' }}>{s.user_agent?.slice(0, 60)}</div>
                <div className="text-tertiary" style={{ fontSize: '0.6875rem' }}>{new Date(s.created_at).toLocaleString()}</div>
              </div>
              <button className="btn btn-ghost btn-xs" onClick={() => revoke(s.id)}>Revoke</button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// ─── Contacts Section ─────────────────────────
function ContactsSection() {
  const [contacts, setContacts] = useState([]);
  const [search, setSearch] = useState('');
  const [newEmail, setNewEmail] = useState('');
  const [newName, setNewName] = useState('');

  useEffect(() => {
    const q = search ? `?q=${encodeURIComponent(search)}` : '';
    get(`/settings/contacts${q}`).then((d) => setContacts(d.contacts || []));
  }, [search]);

  const addContact = async (e) => {
    e.preventDefault();
    if (!newEmail) return;
    const result = await post('/settings/contacts', { email: newEmail, name: newName || undefined });
    setContacts((prev) => [result.contact, ...prev]);
    setNewEmail('');
    setNewName('');
  };

  const deleteContact = async (id) => {
    await del(`/settings/contacts/${id}`);
    setContacts((prev) => prev.filter((c) => c.id !== id));
  };

  return (
    <div className="card" style={{ padding: '1.5rem' }}>
      <h2 style={{ marginBottom: '1rem' }}>Contacts</h2>
      <input className="input" placeholder="Search contacts..." value={search} onChange={(e) => setSearch(e.target.value)} style={{ marginBottom: '1rem' }} />

      <form onSubmit={addContact} style={{ display: 'flex', gap: '0.5rem', marginBottom: '1rem' }}>
        <input className="input" placeholder="Email" value={newEmail} onChange={(e) => setNewEmail(e.target.value)} required style={{ flex: 1 }} />
        <input className="input" placeholder="Name (optional)" value={newName} onChange={(e) => setNewName(e.target.value)} style={{ flex: 1 }} />
        <button type="submit" className="btn btn-primary btn-sm">Add</button>
      </form>

      <div style={{ display: 'flex', flexDirection: 'column', gap: '0.375rem' }}>
        {contacts.map((c) => (
          <div key={c.id} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '0.5rem 0.75rem', border: '1px solid var(--color-border)', borderRadius: 'var(--radius-md)' }}>
            <div>
              <div style={{ fontSize: '0.875rem' }}>{c.name || c.email}</div>
              {c.name && <div className="text-secondary" style={{ fontSize: '0.75rem' }}>{c.email}</div>}
            </div>
            <button className="btn btn-ghost btn-xs" onClick={() => deleteContact(c.id)}>✕</button>
          </div>
        ))}
        {contacts.length === 0 && <p className="text-secondary">No contacts yet</p>}
      </div>
    </div>
  );
}

// ─── Login History Section ────────────────────
function HistorySection() {
  const [history, setHistory] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    get('/settings/login-history').then((d) => setHistory(d.history || [])).finally(() => setLoading(false));
  }, []);

  return (
    <div className="card" style={{ padding: '1.5rem' }}>
      <h2 style={{ marginBottom: '1rem' }}>Login History</h2>
      {loading ? <p className="text-secondary">Loading...</p> : (
        <div style={{ overflowX: 'auto' }}>
          <table style={{ width: '100%', fontSize: '0.8125rem', borderCollapse: 'collapse' }}>
            <thead>
              <tr style={{ borderBottom: '1px solid var(--color-border)' }}>
                <th style={{ textAlign: 'left', padding: '0.5rem' }}>Date</th>
                <th style={{ textAlign: 'left', padding: '0.5rem' }}>IP</th>
                <th style={{ textAlign: 'left', padding: '0.5rem' }}>Status</th>
                <th style={{ textAlign: 'left', padding: '0.5rem' }}>Details</th>
              </tr>
            </thead>
            <tbody>
              {history.map((h, i) => (
                <tr key={i} style={{ borderBottom: '1px solid var(--color-border)' }}>
                  <td style={{ padding: '0.5rem' }}>{new Date(h.created_at).toLocaleString()}</td>
                  <td style={{ padding: '0.5rem' }}>{h.ip_address}</td>
                  <td style={{ padding: '0.5rem' }}>
                    <span className={`badge ${h.success ? 'badge-green' : 'badge-red'}`}>
                      {h.success ? 'Success' : 'Failed'}
                    </span>
                  </td>
                  <td style={{ padding: '0.5rem' }} className="text-secondary">{h.failure_reason || '—'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

// ─── Hide-My-Email Aliases Section ────────────
function AliasesSection({ user }) {
  const [aliases, setAliases] = useState([]);
  const [loading, setLoading] = useState(true);
  const [note, setNote] = useState('');
  const [style, setStyle] = useState('random');
  const [customHandle, setCustomHandle] = useState('');
  const [domainChoice, setDomainChoice] = useState('main');
  const [availability, setAvailability] = useState(null);
  const [msg, setMsg] = useState(null);

  const fetchAliases = () => {
    get('/aliases').then((d) => setAliases(d.aliases || [])).finally(() => setLoading(false));
  };

  useEffect(() => {
    fetchAliases();
  }, []);

  // Live real-time availability check for custom alias
  useEffect(() => {
    if (style !== 'custom') {
      setAvailability(null);
      return;
    }
    const clean = customHandle.trim().toLowerCase();
    if (!clean || clean.length < 2) {
      setAvailability(null);
      return;
    }

    setAvailability({ checking: true });
    const timer = setTimeout(async () => {
      try {
        const res = await get(`/aliases/check-availability?handle=${encodeURIComponent(clean)}&domainChoice=${domainChoice}`);
        setAvailability(res);
      } catch (err) {
        setAvailability({ available: false, reason: err.message || 'Availability check failed' });
      }
    }, 350);

    return () => clearTimeout(timer);
  }, [style, customHandle, domainChoice]);

  const handleCreate = async (e) => {
    e.preventDefault();
    if (style === 'custom') {
      if (!customHandle.trim()) {
        alert('Please enter a custom alias handle');
        return;
      }
      if (!availability || !availability.available) {
        alert(availability?.reason || 'Please wait for address availability verification');
        return;
      }
    }
    try {
      await post('/aliases', {
        note,
        style,
        customHandle: style === 'custom' ? customHandle.trim() : undefined,
        domainChoice: style === 'custom' ? domainChoice : undefined,
      });
      setNote('');
      setCustomHandle('');
      setAvailability(null);
      setMsg('Alias created successfully!');
      fetchAliases();
      setTimeout(() => setMsg(null), 3500);
    } catch (err) {
      alert(err.message || 'Failed to generate alias');
    }
  };

  const handleToggle = async (id, isEnabled) => {
    try {
      await put(`/aliases/${id}`, { enabled: !isEnabled, is_enabled: !isEnabled });
      fetchAliases();
      if (window.WoxToast) window.WoxToast.success(`Alias ${!isEnabled ? 'enabled' : 'disabled'}`);
    } catch (err) {
      alert(err.message);
    }
  };

  const handleDelete = async (id) => {
    if (!confirm('Delete this alias permanently?')) return;
    try {
      await del(`/aliases/${id}`);
      fetchAliases();
      if (window.WoxToast) window.WoxToast.info('Alias deleted');
    } catch (err) {
      alert(err.message);
    }
  };

  return (
    <div className="card" style={{ padding: '1.5rem' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.25rem' }}>
        <div>
          <h2>Hide-My-Email Aliases</h2>
          <p className="text-secondary" style={{ fontSize: '0.875rem' }}>
            Create on-demand disposable forwarding addresses that route directly to your inbox.
          </p>
        </div>
      </div>

      {msg && <div className="toast toast-success" style={{ position: 'static', marginBottom: '1rem' }}>{msg}</div>}

      <form onSubmit={handleCreate} style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem', marginBottom: '1.5rem', background: 'var(--color-bg-elevated)', padding: '1rem', borderRadius: 'var(--radius-md)', border: '1px solid var(--color-border)' }}>
        <div style={{ display: 'flex', gap: '0.75rem', flexWrap: 'wrap', alignItems: 'center' }}>
          <select
            className="input"
            value={style}
            onChange={(e) => {
              setStyle(e.target.value);
              setAvailability(null);
            }}
            style={{ width: 170 }}
          >
            <option value="random">Random Suffix</option>
            <option value="words">Word Combo</option>
            <option value="custom">Custom Handle</option>
          </select>

          <input
            className="input"
            placeholder="Note / Label (e.g. Amazon, GitHub, Banking)"
            value={note}
            onChange={(e) => setNote(e.target.value)}
            style={{ flex: 1, minWidth: 200 }}
          />

          <button
            type="submit"
            className="btn btn-primary btn-sm"
            disabled={style === 'custom' && (!availability || !availability.available || availability.checking)}
          >
            {style === 'custom' ? '+ Create Custom Alias' : '+ Generate Alias'}
          </button>
        </div>

        {/* Custom Handle Configuration & Live Verification */}
        {style === 'custom' && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem', marginTop: '0.25rem' }}>
            <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'center', flexWrap: 'wrap' }}>
              <div style={{ display: 'flex', alignItems: 'center', flex: 1, minWidth: 260, position: 'relative' }}>
                <input
                  className="input"
                  placeholder="e.g. gaming, newsletter, shop"
                  value={customHandle}
                  onChange={(e) => setCustomHandle(e.target.value)}
                  style={{
                    paddingRight: '1rem',
                    borderRight: 'none',
                    borderTopRightRadius: 0,
                    borderBottomRightRadius: 0,
                  }}
                  autoFocus
                />
                <span
                  style={{
                    background: 'var(--color-bg-input)',
                    border: '1px solid var(--color-border)',
                    borderLeft: 'none',
                    padding: '0.625rem 0.85rem',
                    fontSize: '0.875rem',
                    color: 'var(--color-text-secondary)',
                    borderTopRightRadius: 'var(--radius-md)',
                    borderBottomRightRadius: 'var(--radius-md)',
                    whiteSpace: 'nowrap',
                  }}
                >
                  @{domainChoice === 'subdomain' ? `${user?.username || 'user'}.wox.world` : 'wox.world'}
                </span>
              </div>

              <select
                className="input"
                value={domainChoice}
                onChange={(e) => setDomainChoice(e.target.value)}
                style={{ width: 200 }}
              >
                <option value="main">@wox.world (Root Domain)</option>
                <option value="subdomain">@{user?.username || 'user'}.wox.world (Subdomain)</option>
              </select>
            </div>

            {/* Live Availability Status Indicator */}
            {availability && (
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.45rem', fontSize: '0.8125rem' }}>
                {availability.checking ? (
                  <span className="text-secondary" style={{ fontStyle: 'italic' }}>
                    Verifying address availability on mail server...
                  </span>
                ) : availability.available ? (
                  <span className="badge badge-green" style={{ display: 'inline-flex', alignItems: 'center', gap: '0.35rem', padding: '0.25rem 0.65rem' }}>
                    <span style={{ display: "inline-flex", alignItems: "center", color: "var(--color-success)" }}><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><polyline points="20 6 9 17 4 12"/></svg></span> <strong>{availability.address}</strong> is available to claim!
                  </span>
                ) : (
                  <span className="badge badge-red" style={{ display: 'inline-flex', alignItems: 'center', gap: '0.35rem', padding: '0.25rem 0.65rem' }}>
                    <span style={{ display: "inline-flex", alignItems: "center", color: "var(--color-error)" }}><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg></span> <strong>Unavailable:</strong> {availability.reason || 'Already taken'}
                  </span>
                )}
              </div>
            )}
          </div>
        )}
      </form>

      <div style={{ overflowX: 'auto' }}>
        <table style={{ width: '100%', fontSize: '0.875rem', borderCollapse: 'collapse' }}>
          <thead>
            <tr style={{ borderBottom: '2px solid var(--color-border)', textAlign: 'left' }}>
              <th style={{ padding: '0.5rem' }}>Alias Address</th>
              <th style={{ padding: '0.5rem' }}>Note</th>
              <th style={{ padding: '0.5rem' }}>Status</th>
              <th style={{ padding: '0.5rem' }}>Received</th>
              <th style={{ padding: '0.5rem', textAlign: 'right' }}>Actions</th>
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr><td colSpan={5} style={{ padding: '1rem', textAlign: 'center' }} className="text-secondary">Loading aliases...</td></tr>
            ) : aliases.length === 0 ? (
              <tr><td colSpan={5} style={{ padding: '1rem', textAlign: 'center' }} className="text-secondary">No aliases generated yet.</td></tr>
            ) : (
              aliases.map((a) => {
                const addr = a.alias_address || a.alias_email || '';
                const isEnabled = a.enabled !== undefined ? a.enabled : (a.is_enabled !== undefined ? a.is_enabled : true);
                const received = a.emails_received !== undefined ? a.emails_received : (a.emails_forwarded || 0);

                return (
                  <tr key={a.id} style={{ borderBottom: '1px solid var(--color-border)' }}>
                    <td style={{ padding: '0.5rem' }} className="mono text-purple">
                      <span>{addr}</span>
                      <button
                        type="button"
                        className="btn btn-ghost btn-xs"
                        style={{ marginLeft: 6, padding: '2px 6px', fontSize: '0.75rem' }}
                        onClick={() => {
                          navigator.clipboard.writeText(addr);
                          if (window.WoxToast) window.WoxToast.success('Alias copied to clipboard');
                        }}
                        title="Copy alias address"
                      >
                        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect width="14" height="14" x="8" y="8" rx="2" ry="2"/><path d="M4 16c-1.1 0-2-.9-2-2V4c0-1.1.9-2 2-2h10c1.1 0 2 .9 2 2"/></svg>
                      </button>
                    </td>
                    <td style={{ padding: '0.5rem' }} className="text-secondary">{a.note || '—'}</td>
                    <td style={{ padding: '0.5rem' }}>
                      <span className={`badge ${isEnabled ? 'badge-green' : 'badge-amber'}`}>
                        {isEnabled ? 'Active' : 'Disabled'}
                      </span>
                    </td>
                    <td style={{ padding: '0.5rem' }}>{received}</td>
                    <td style={{ padding: '0.5rem', textAlign: 'right' }}>
                      <button className="btn btn-ghost btn-xs" onClick={() => handleToggle(a.id, isEnabled)} style={{ marginRight: 6 }}>
                        {isEnabled ? 'Disable' : 'Enable'}
                      </button>
                      <button className="btn btn-ghost btn-xs text-error" onClick={() => handleDelete(a.id)}>Delete</button>
                    </td>
                  </tr>
                );
              })
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}

// ─── Vacation & Auto-Responder Section ────────
function VacationSection() {
  const [form, setForm] = useState({
    enabled: false,
    subject: '',
    body: '',
    startDate: '',
    endDate: '',
  });
  const [saving, setSaving] = useState(false);
  const [msg, setMsg] = useState(null);

  useEffect(() => {
    get('/settings/auto-reply').then((d) => {
      setForm({
        enabled: !!d.enabled,
        subject: d.subject || '',
        body: d.body || '',
        startDate: d.startDate ? d.startDate.slice(0, 10) : '',
        endDate: d.endDate ? d.endDate.slice(0, 10) : '',
      });
    }).catch(console.error);
  }, []);

  const handleSave = async (e) => {
    e.preventDefault();
    setSaving(true);
    try {
      await put('/settings/auto-reply', form);
      setMsg({ type: 'success', text: 'Vacation responder updated!' });
      setTimeout(() => setMsg(null), 3000);
    } catch (err) {
      setMsg({ type: 'error', text: err.message });
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="card" style={{ padding: '1.5rem', maxWidth: 640 }}>
      <h2 style={{ marginBottom: '0.5rem' }}>Vacation & Out-of-Office Auto-Responder</h2>
      <p className="text-secondary" style={{ fontSize: '0.875rem', marginBottom: '1.5rem' }}>
        Automatically reply to incoming messages when you are away or on vacation.
      </p>

      {msg && <div className={`toast toast-${msg.type}`} style={{ position: 'static', marginBottom: '1rem' }}>{msg.text}</div>}

      <form onSubmit={handleSave} style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
        <label style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', cursor: 'pointer' }}>
          <input type="checkbox" checked={form.enabled} onChange={(e) => setForm({ ...form, enabled: e.target.checked })} />
          <span style={{ fontWeight: 600 }}>Enable automated vacation responder</span>
        </label>

        <div>
          <label className="text-secondary" style={{ fontSize: '0.8125rem', display: 'block', marginBottom: 4 }}>Auto-Reply Subject</label>
          <input className="input" placeholder="Out of Office: Thank you for your email" value={form.subject} onChange={(e) => setForm({ ...form, subject: e.target.value })} />
        </div>

        <div>
          <label className="text-secondary" style={{ fontSize: '0.8125rem', display: 'block', marginBottom: 4 }}>Message Body</label>
          <textarea className="input" rows={4} placeholder="I am currently away and will respond upon my return." value={form.body} onChange={(e) => setForm({ ...form, body: e.target.value })} />
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem' }}>
          <div>
            <label className="text-secondary" style={{ fontSize: '0.8125rem', display: 'block', marginBottom: 4 }}>Start Date</label>
            <input className="input" type="date" value={form.startDate} onChange={(e) => setForm({ ...form, startDate: e.target.value })} />
          </div>
          <div>
            <label className="text-secondary" style={{ fontSize: '0.8125rem', display: 'block', marginBottom: 4 }}>End Date</label>
            <input className="input" type="date" value={form.endDate} onChange={(e) => setForm({ ...form, endDate: e.target.value })} />
          </div>
        </div>

        <button type="submit" className="btn btn-primary btn-sm" disabled={saving} style={{ alignSelf: 'flex-start', marginTop: '0.5rem' }}>
          {saving ? 'Saving...' : 'Save Settings'}
        </button>
      </form>
    </div>
  );
}

// ─── Forwarding Section ───────────────────────
function ForwardingSection() {
  const [addr, setAddr] = useState('');
  const [saving, setSaving] = useState(false);
  const [msg, setMsg] = useState(null);

  useEffect(() => {
    get('/settings/forwarding').then((d) => setAddr(d.forwardingAddress || '')).catch(console.error);
  }, []);

  const handleSave = async (e) => {
    e.preventDefault();
    setSaving(true);
    try {
      await put('/settings/forwarding', { forwardingAddress: addr });
      setMsg({ type: 'success', text: 'Forwarding rules updated!' });
      setTimeout(() => setMsg(null), 3000);
    } catch (err) {
      setMsg({ type: 'error', text: err.message });
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="card" style={{ padding: '1.5rem', maxWidth: 540 }}>
      <h2 style={{ marginBottom: '0.5rem' }}>Email Forwarding</h2>
      <p className="text-secondary" style={{ fontSize: '0.875rem', marginBottom: '1.5rem' }}>
        Forward a copy of all incoming emails to an external email address.
      </p>

      {msg && <div className={`toast toast-${msg.type}`} style={{ position: 'static', marginBottom: '1rem' }}>{msg.text}</div>}

      <form onSubmit={handleSave} style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
        <div>
          <label className="text-secondary" style={{ fontSize: '0.8125rem', display: 'block', marginBottom: 4 }}>Destination Email Address</label>
          <input className="input" type="email" placeholder="personal@example.com (leave blank to disable)" value={addr} onChange={(e) => setAddr(e.target.value)} />
        </div>
        <button type="submit" className="btn btn-primary btn-sm" disabled={saving} style={{ alignSelf: 'flex-start' }}>
          {saving ? 'Saving...' : 'Update Forwarding'}
        </button>
      </form>
    </div>
  );
}

// ─── Signature Section ────────────────────────
function SignatureSection() {
  const [signature, setSignature] = useState('');
  const [saving, setSaving] = useState(false);
  const [msg, setMsg] = useState(null);

  useEffect(() => {
    get('/settings/signature').then((d) => setSignature(d.signature || '')).catch(console.error);
  }, []);

  const handleSave = async (e) => {
    e.preventDefault();
    setSaving(true);
    try {
      await put('/settings/signature', { signature });
      setMsg({ type: 'success', text: 'Signature saved!' });
      setTimeout(() => setMsg(null), 3000);
    } catch (err) {
      setMsg({ type: 'error', text: err.message });
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="card" style={{ padding: '1.5rem', maxWidth: 640 }}>
      <h2 style={{ marginBottom: '0.5rem' }}>Outbound Email Signature</h2>
      <p className="text-secondary" style={{ fontSize: '0.875rem', marginBottom: '1.5rem' }}>
        Appended automatically to new emails, replies, and forwarded messages.
      </p>

      {msg && <div className={`toast toast-${msg.type}`} style={{ position: 'static', marginBottom: '1rem' }}>{msg.text}</div>}

      <form onSubmit={handleSave} style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
        <textarea className="input" rows={5} placeholder="Best regards,\nAlex" value={signature} onChange={(e) => setSignature(e.target.value)} />
        <button type="submit" className="btn btn-primary btn-sm" disabled={saving} style={{ alignSelf: 'flex-start' }}>
          {saving ? 'Saving...' : 'Save Signature'}
        </button>
      </form>
    </div>
  );
}

// ─── Filters & Rules Section ──────────────────
function FiltersSection() {
  const [filters, setFilters] = useState([]);
  const [loading, setLoading] = useState(true);
  const [name, setName] = useState('');
  const [field, setField] = useState('from');
  const [operator, setOperator] = useState('contains');
  const [value, setValue] = useState('');
  const [action, setAction] = useState('star');

  const fetchFilters = () => {
    get('/settings/filters').then((d) => setFilters(d.filters || [])).finally(() => setLoading(false));
  };

  useEffect(() => {
    fetchFilters();
  }, []);

  const handleCreate = async (e) => {
    e.preventDefault();
    try {
      await post('/settings/filters', {
        name,
        condition_field: field,
        condition_operator: operator,
        condition_value: value,
        action,
      });
      setName(''); setValue('');
      fetchFilters();
    } catch (err) {
      alert(err.message);
    }
  };

  const handleDelete = async (id) => {
    try {
      await del(`/settings/filters/${id}`);
      fetchFilters();
    } catch (err) {
      alert(err.message);
    }
  };

  return (
    <div className="card" style={{ padding: '1.5rem' }}>
      <h2 style={{ marginBottom: '0.5rem' }}>Inbox Rules & Sorting Filters</h2>
      <p className="text-secondary" style={{ fontSize: '0.875rem', marginBottom: '1.5rem' }}>
        Automatically categorize, star, label, or move incoming emails matching specific criteria.
      </p>

      <form onSubmit={handleCreate} style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap', marginBottom: '1.5rem' }}>
        <input className="input" placeholder="Rule Name" value={name} onChange={(e) => setName(e.target.value)} required style={{ minWidth: 140, flex: 1 }} />
        <select className="input" value={field} onChange={(e) => setField(e.target.value)} style={{ width: 110 }}>
          <option value="from">From</option>
          <option value="subject">Subject</option>
          <option value="body">Body</option>
        </select>
        <select className="input" value={operator} onChange={(e) => setOperator(e.target.value)} style={{ width: 120 }}>
          <option value="contains">Contains</option>
          <option value="equals">Equals</option>
          <option value="starts_with">Starts with</option>
        </select>
        <input className="input" placeholder="Value to match" value={value} onChange={(e) => setValue(e.target.value)} required style={{ minWidth: 140, flex: 1 }} />
        <select className="input" value={action} onChange={(e) => setAction(e.target.value)} style={{ width: 130 }}>
          <option value="star">Star Email</option>
          <option value="read">Mark as Read</option>
          <option value="delete">Delete</option>
        </select>
        <button type="submit" className="btn btn-primary btn-sm">+ Add Rule</button>
      </form>

      <div style={{ overflowX: 'auto' }}>
        <table style={{ width: '100%', fontSize: '0.875rem', borderCollapse: 'collapse' }}>
          <thead>
            <tr style={{ borderBottom: '2px solid var(--color-border)', textAlign: 'left' }}>
              <th style={{ padding: '0.5rem' }}>Rule Name</th>
              <th style={{ padding: '0.5rem' }}>Condition</th>
              <th style={{ padding: '0.5rem' }}>Action</th>
              <th style={{ padding: '0.5rem', textAlign: 'right' }}>Remove</th>
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr><td colSpan={4} style={{ padding: '1rem', textAlign: 'center' }} className="text-secondary">Loading filters...</td></tr>
            ) : filters.length === 0 ? (
              <tr><td colSpan={4} style={{ padding: '1rem', textAlign: 'center' }} className="text-secondary">No custom sorting rules created.</td></tr>
            ) : (
              filters.map((f) => (
                <tr key={f.id} style={{ borderBottom: '1px solid var(--color-border)' }}>
                  <td style={{ padding: '0.5rem', fontWeight: 600 }}>{f.name}</td>
                  <td style={{ padding: '0.5rem' }} className="text-secondary">If <strong>{f.condition_field}</strong> {f.condition_operator} "{f.condition_value}"</td>
                  <td style={{ padding: '0.5rem' }}><span className="badge badge-purple">{f.action}</span></td>
                  <td style={{ padding: '0.5rem', textAlign: 'right' }}>
                    <button className="btn btn-ghost btn-xs text-error" onClick={() => handleDelete(f.id)}>Delete</button>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}

// ─── The Screener Rules Section ───────────────
function ScreenerRulesSection() {
  const [rules, setRules] = useState([]);
  const [loading, setLoading] = useState(true);
  const [pattern, setPattern] = useState('');
  const [matchType, setMatchType] = useState('domain');
  const [destination, setDestination] = useState('inbox');

  const fetchRules = () => {
    get('/mail/screener/rules').then((d) => setRules(d.rules || [])).finally(() => setLoading(false));
  };

  useEffect(() => {
    fetchRules();
  }, []);

  const handleAdd = async (e) => {
    e.preventDefault();
    try {
      await post('/mail/screener/decide', {
        senderPattern: pattern,
        matchType,
        destination,
      });
      setPattern('');
      fetchRules();
    } catch (err) {
      alert(err.message);
    }
  };

  const handleDelete = async (id) => {
    try {
      await del(`/mail/screener/rules/${id}`);
      fetchRules();
    } catch (err) {
      alert(err.message);
    }
  };

  return (
    <div className="card" style={{ padding: '1.5rem' }}>
      <h2 style={{ marginBottom: '0.5rem' }}>The Screener — Sender & Domain Rules</h2>
      <p className="text-secondary" style={{ fontSize: '0.875rem', marginBottom: '1.5rem' }}>
        Control which senders reach your main <strong>Inbox</strong>, get filed into <strong>The Feed</strong> (newsletters), <strong>Paper Trail</strong> (receipts), or get <strong>Blocked</strong>.
      </p>

      <form onSubmit={handleAdd} style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap', marginBottom: '1.5rem' }}>
        <input
          className="input"
          placeholder="Sender email or domain (e.g. domain.com or sender@domain.com)"
          value={pattern}
          onChange={(e) => setPattern(e.target.value)}
          required
          style={{ minWidth: 260, flex: 1 }}
        />
        <select className="input" value={matchType} onChange={(e) => setMatchType(e.target.value)} style={{ width: 140 }}>
          <option value="domain">Entire Domain</option>
          <option value="exact">Exact Address</option>
        </select>
        <select className="input" value={destination} onChange={(e) => setDestination(e.target.value)} style={{ width: 150 }}>
          <option value="inbox">Inbox (Allowed)</option>
          <option value="feed">The Feed</option>
          <option value="paper_trail">Paper Trail</option>
          <option value="blocked">Blocked</option>
        </select>
        <button type="submit" className="btn btn-primary btn-sm">+ Save Rule</button>
      </form>

      <div style={{ overflowX: 'auto' }}>
        <table style={{ width: '100%', fontSize: '0.875rem', borderCollapse: 'collapse' }}>
          <thead>
            <tr style={{ borderBottom: '2px solid var(--color-border)', textAlign: 'left' }}>
              <th style={{ padding: '0.5rem' }}>Sender / Domain</th>
              <th style={{ padding: '0.5rem' }}>Match Type</th>
              <th style={{ padding: '0.5rem' }}>Destination</th>
              <th style={{ padding: '0.5rem', textAlign: 'right' }}>Remove</th>
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr><td colSpan={4} style={{ padding: '1rem', textAlign: 'center' }} className="text-secondary">Loading screener rules...</td></tr>
            ) : rules.length === 0 ? (
              <tr><td colSpan={4} style={{ padding: '1rem', textAlign: 'center' }} className="text-secondary">No custom screener rules set. First-time senders will prompt for review.</td></tr>
            ) : (
              rules.map((r) => (
                <tr key={r.id} style={{ borderBottom: '1px solid var(--color-border)' }}>
                  <td style={{ padding: '0.5rem' }} className="mono text-purple">{r.sender_pattern}</td>
                  <td style={{ padding: '0.5rem' }} className="text-secondary">{r.match_type === 'domain' ? 'Entire Domain' : 'Exact Email'}</td>
                  <td style={{ padding: '0.5rem' }}>
                    <span className={`badge ${
                      r.destination === 'inbox' ? 'badge-green' :
                      r.destination === 'feed' ? 'badge-purple' :
                      r.destination === 'paper_trail' ? 'badge-amber' : 'badge-red'
                    }`}>
                      {r.destination === 'inbox' ? 'Inbox' :
                       r.destination === 'feed' ? 'The Feed' :
                       r.destination === 'paper_trail' ? 'Paper Trail' : 'Blocked'}
                    </span>
                  </td>
                  <td style={{ padding: '0.5rem', textAlign: 'right' }}>
                    <button className="btn btn-ghost btn-xs text-error" onClick={() => handleDelete(r.id)}>Delete</button>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}

// ─── Event Webhooks Section ───────────────────
function WebhooksSection() {
  const [webhooks, setWebhooks] = useState([]);
  const [loading, setLoading] = useState(true);
  const [name, setName] = useState('');
  const [targetUrl, setTargetUrl] = useState('');
  const [deliveriesModal, setDeliveriesModal] = useState(null);
  const [deliveries, setDeliveries] = useState([]);
  const [msg, setMsg] = useState(null);

  const fetchWebhooks = () => {
    get('/mail/webhooks').then((d) => setWebhooks(d.webhooks || [])).finally(() => setLoading(false));
  };

  useEffect(() => {
    fetchWebhooks();
  }, []);

  const handleCreate = async (e) => {
    e.preventDefault();
    try {
      await post('/mail/webhooks', { name, targetUrl });
      setName(''); setTargetUrl('');
      setMsg({ type: 'success', text: 'Webhook created with HMAC-SHA256 secret key!' });
      fetchWebhooks();
      setTimeout(() => setMsg(null), 3000);
    } catch (err) {
      alert(err.message);
    }
  };

  const handleTest = async (id) => {
    try {
      const res = await post(`/mail/webhooks/${id}/test`, {});
      alert(`Test ping dispatched! Status: ${res.result?.status || 'Sent'}`);
      fetchWebhooks();
    } catch (err) {
      alert(err.message);
    }
  };

  const handleDelete = async (id) => {
    if (!confirm('Delete this webhook subscription?')) return;
    try {
      await del(`/mail/webhooks/${id}`);
      fetchWebhooks();
    } catch (err) {
      alert(err.message);
    }
  };

  const viewDeliveries = async (wh) => {
    setDeliveriesModal(wh);
    const d = await get(`/mail/webhooks/${wh.id}/deliveries`);
    setDeliveries(d.deliveries || []);
  };

  return (
    <div className="card" style={{ padding: '1.5rem' }}>
      <h2 style={{ marginBottom: '0.5rem' }}>Inbound & Event Webhooks</h2>
      <p className="text-secondary" style={{ fontSize: '0.875rem', marginBottom: '1.5rem' }}>
        Deliver incoming emails, extracted OTP verification codes, and outbound sent events as signed JSON payloads to your HTTP endpoint.
      </p>

      {msg && <div className={`toast toast-${msg.type}`} style={{ position: 'static', marginBottom: '1rem' }}>{msg.text}</div>}

      <form onSubmit={handleCreate} style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap', marginBottom: '1.5rem' }}>
        <input className="input" placeholder="Webhook Name (e.g. Slack Bot, Zapier)" value={name} onChange={(e) => setName(e.target.value)} required style={{ minWidth: 160, flex: 1 }} />
        <input className="input" type="url" placeholder="https://api.myapp.com/webhooks/mail" value={targetUrl} onChange={(e) => setTargetUrl(e.target.value)} required style={{ minWidth: 260, flex: 2 }} />
        <button type="submit" className="btn btn-primary btn-sm">+ Create Webhook</button>
      </form>

      <div style={{ overflowX: 'auto' }}>
        <table style={{ width: '100%', fontSize: '0.875rem', borderCollapse: 'collapse' }}>
          <thead>
            <tr style={{ borderBottom: '2px solid var(--color-border)', textAlign: 'left' }}>
              <th style={{ padding: '0.5rem' }}>Name</th>
              <th style={{ padding: '0.5rem' }}>Target URL</th>
              <th style={{ padding: '0.5rem' }}>HMAC Secret</th>
              <th style={{ padding: '0.5rem' }}>Status</th>
              <th style={{ padding: '0.5rem', textAlign: 'right' }}>Actions</th>
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr><td colSpan={5} style={{ padding: '1rem', textAlign: 'center' }} className="text-secondary">Loading webhooks...</td></tr>
            ) : webhooks.length === 0 ? (
              <tr><td colSpan={5} style={{ padding: '1rem', textAlign: 'center' }} className="text-secondary">No active webhooks configured.</td></tr>
            ) : (
              webhooks.map((w) => (
                <tr key={w.id} style={{ borderBottom: '1px solid var(--color-border)' }}>
                  <td style={{ padding: '0.5rem', fontWeight: 600 }}>{w.name}</td>
                  <td style={{ padding: '0.5rem', maxWidth: 220 }} className="mono truncate">{w.target_url}</td>
                  <td style={{ padding: '0.5rem', fontSize: '0.75rem' }} className="mono text-secondary">{w.secret_key.slice(0, 10)}••••••••</td>
                  <td style={{ padding: '0.5rem' }}>
                    <span className={`badge ${w.is_active ? 'badge-green' : 'badge-red'}`}>
                      {w.is_active ? 'Active' : 'Disabled'}
                    </span>
                  </td>
                  <td style={{ padding: '0.5rem', textAlign: 'right' }}>
                    <button className="btn btn-ghost btn-xs" onClick={() => handleTest(w.id)} style={{ marginRight: 4 }}>Test Ping</button>
                    <button className="btn btn-ghost btn-xs text-purple" onClick={() => viewDeliveries(w)} style={{ marginRight: 4 }}>Logs</button>
                    <button className="btn btn-ghost btn-xs text-error" onClick={() => handleDelete(w.id)}>Delete</button>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      {deliveriesModal && (
        <div style={{ marginTop: '1.5rem', padding: '1rem', background: 'var(--color-bg-elevated)', borderRadius: 'var(--radius-md)', border: '1px solid var(--color-border)' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '0.75rem' }}>
            <h4 style={{ margin: 0 }}>Delivery Logs for {deliveriesModal.name}</h4>
            <button className="btn btn-ghost btn-xs" onClick={() => setDeliveriesModal(null)}>Close</button>
          </div>
          {deliveries.length === 0 ? (
            <p className="text-secondary" style={{ fontSize: '0.8125rem', margin: 0 }}>No delivery events recorded yet.</p>
          ) : (
            <div style={{ maxHeight: 200, overflowY: 'auto' }}>
              <table style={{ width: '100%', fontSize: '0.75rem', borderCollapse: 'collapse' }}>
                <thead>
                  <tr style={{ borderBottom: '1px solid var(--color-border)', textAlign: 'left' }}>
                    <th style={{ padding: '0.25rem' }}>Event</th>
                    <th style={{ padding: '0.25rem' }}>Status</th>
                    <th style={{ padding: '0.25rem' }}>Latency</th>
                    <th style={{ padding: '0.25rem' }}>Time</th>
                  </tr>
                </thead>
                <tbody>
                  {deliveries.map((d, i) => (
                    <tr key={i} style={{ borderBottom: '1px solid var(--color-border)' }}>
                      <td style={{ padding: '0.25rem' }} className="mono">{d.event_type}</td>
                      <td style={{ padding: '0.25rem' }}><span className={`badge ${d.success ? 'badge-green' : 'badge-red'}`}>{d.response_status || (d.success ? 'OK' : 'FAIL')}</span></td>
                      <td style={{ padding: '0.25rem' }}>{d.execution_ms}ms</td>
                      <td style={{ padding: '0.25rem' }} className="text-secondary">{new Date(d.created_at).toLocaleTimeString()}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// ─── Reverse Aliases Section ──────────────────
function ReverseAliasesSection() {
  const [reverseAliases, setReverseAliases] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    get('/mail/reverse-aliases').then((d) => setReverseAliases(d.reverseAliases || [])).finally(() => setLoading(false));
  }, []);

  return (
    <div className="card" style={{ padding: '1.5rem' }}>
      <h2 style={{ marginBottom: '0.5rem' }}>Reverse Aliases (Outbound Sender Masking)</h2>
      <p className="text-secondary" style={{ fontSize: '0.875rem', marginBottom: '1.5rem' }}>
        Cryptographic reply targets that let you reply to external senders using your alias identities without revealing your real personal email.
      </p>

      <div style={{ overflowX: 'auto' }}>
        <table style={{ width: '100%', fontSize: '0.875rem', borderCollapse: 'collapse' }}>
          <thead>
            <tr style={{ borderBottom: '2px solid var(--color-border)', textAlign: 'left' }}>
              <th style={{ padding: '0.5rem' }}>Your Alias Identity</th>
              <th style={{ padding: '0.5rem' }}>External Recipient</th>
              <th style={{ padding: '0.5rem' }}>Reverse Reply Target</th>
              <th style={{ padding: '0.5rem' }}>Last Used</th>
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr><td colSpan={4} style={{ padding: '1rem', textAlign: 'center' }} className="text-secondary">Loading reverse aliases...</td></tr>
            ) : reverseAliases.length === 0 ? (
              <tr><td colSpan={4} style={{ padding: '1rem', textAlign: 'center' }} className="text-secondary">No active reverse aliases. They are generated automatically when replying to alias emails.</td></tr>
            ) : (
              reverseAliases.map((r) => (
                <tr key={r.id} style={{ borderBottom: '1px solid var(--color-border)' }}>
                  <td style={{ padding: '0.5rem' }} className="mono text-purple">{r.alias_address}</td>
                  <td style={{ padding: '0.5rem' }} className="mono">{r.external_email}</td>
                  <td style={{ padding: '0.5rem' }} className="mono text-green">{r.reverse_token}</td>
                  <td style={{ padding: '0.5rem' }} className="text-secondary">{r.last_used_at ? new Date(r.last_used_at).toLocaleDateString() : 'Never'}</td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}

// ─── PGP Encryption Section ───────────────────
function PgpSection() {
  const [pgpKey, setPgpKey] = useState('');
  const [enabled, setEnabled] = useState(false);
  const [fingerprint, setFingerprint] = useState(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [msg, setMsg] = useState(null);

  useEffect(() => {
    get('/settings/pgp').then((d) => {
      setPgpKey(d.pgpPublicKey || '');
      setEnabled(!!d.pgpEnabled);
      setFingerprint(d.fingerprint || null);
    }).finally(() => setLoading(false));
  }, []);

  const handleSave = async (e) => {
    e.preventDefault();
    setSaving(true);
    try {
      const res = await put('/settings/pgp', {
        pgpPublicKey: pgpKey,
        pgpEnabled: enabled,
      });
      setFingerprint(res.fingerprint || null);
      setMsg({ type: 'success', text: 'PGP configuration saved successfully!' });
      setTimeout(() => setMsg(null), 3000);
    } catch (err) {
      setMsg({ type: 'error', text: err.message });
    } finally {
      setSaving(false);
    }
  };

  const handleGenerate = async () => {
    if (!confirm('Generate a new OpenPGP Curve25519 keypair? This will overwrite your existing key.')) return;
    setSaving(true);
    try {
      const res = await post('/settings/pgp/generate', {});
      setPgpKey(res.publicKey);
      setEnabled(true);
      setFingerprint(res.fingerprint);
      setMsg({ type: 'success', text: 'New PGP keypair generated! Make sure to save your private key.' });
      prompt('COPY YOUR PRIVATE KEY SAFELY (Do not lose it):', res.privateKey);
    } catch (err) {
      setMsg({ type: 'error', text: err.message });
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="card" style={{ padding: '1.5rem', maxWidth: 700 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1rem' }}>
        <div>
          <h2>OpenPGP End-to-End Encryption</h2>
          <p className="text-secondary" style={{ fontSize: '0.875rem' }}>
            Encrypt all forwarded alias emails with your public PGP key so third-party providers (Gmail, Outlook) cannot scan your mail.
          </p>
        </div>
        <button className="btn btn-secondary btn-xs" onClick={handleGenerate} disabled={saving} style={{ display: 'inline-flex', alignItems: 'center', gap: '0.35rem' }}>
          <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="7.5" cy="15.5" r="5.5"/><path d="m21 2-9.6 9.6"/><path d="m15.5 7.5 3 3L22 7l-3-3"/></svg>
          <span>Generate Keypair</span>
        </button>
      </div>

      {msg && <div className={`toast toast-${msg.type}`} style={{ position: 'static', marginBottom: '1rem' }}>{msg.text}</div>}

      {fingerprint && (
        <div style={{ padding: '0.75rem 1rem', background: 'rgba(34, 197, 94, 0.1)', border: '1px solid rgba(34, 197, 94, 0.3)', borderRadius: 'var(--radius-md)', marginBottom: '1.25rem' }}>
          <span style={{ fontSize: '0.75rem', fontWeight: 600, color: 'var(--color-success)', display: 'block' }}>VALID PGP PUBLIC KEY DETECTED</span>
          <span className="mono" style={{ fontSize: '0.8125rem', wordBreak: 'break-all' }}>{fingerprint}</span>
        </div>
      )}

      <form onSubmit={handleSave} style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
        <label style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', cursor: 'pointer' }}>
          <input type="checkbox" checked={enabled} onChange={(e) => setEnabled(e.target.checked)} />
          <span style={{ fontWeight: 600 }}>Enable automatic OpenPGP encryption for forwarded emails</span>
        </label>

        <div>
          <label className="text-secondary" style={{ fontSize: '0.8125rem', display: 'block', marginBottom: 4 }}>
            ASCII-Armored OpenPGP Public Key (-----BEGIN PGP PUBLIC KEY BLOCK-----)
          </label>
          <textarea
            className="input mono"
            rows={8}
            placeholder="-----BEGIN PGP PUBLIC KEY BLOCK-----\n...\n-----END PGP PUBLIC KEY BLOCK-----"
            value={pgpKey}
            onChange={(e) => setPgpKey(e.target.value)}
            style={{ fontSize: '0.75rem', lineHeight: 1.4 }}
          />
        </div>

        <button type="submit" className="btn btn-primary btn-sm" disabled={saving} style={{ alignSelf: 'flex-start' }}>
          {saving ? 'Saving...' : 'Save PGP Key'}
        </button>
      </form>
    </div>
  );
}

// ─── Dead Man's Switch Section ────────────────
function DeadManSection() {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [enabled, setEnabled] = useState(false);
  const [intervalDays, setIntervalDays] = useState(90);
  const [finalSubject, setFinalSubject] = useState('');
  const [finalInstructions, setFinalInstructions] = useState('');
  const [beneficiaries, setBeneficiaries] = useState('');

  const loadData = async () => {
    try {
      const res = await get('/deadman/status');
      setData(res);
      setEnabled(res.enabled);
      setIntervalDays(res.intervalDays || 90);
      setFinalSubject(res.finalSubject || 'Emergency Digital Inheritance & Last Instructions');
      setFinalInstructions(res.finalInstructions || '');
      setBeneficiaries((res.beneficiaryEmails || []).join(', '));
    } catch {}
    setLoading(false);
  };

  useEffect(() => { loadData(); }, []);

  const handleSave = async (e) => {
    e.preventDefault();
    setSaving(true);
    try {
      const emails = beneficiaries.split(',').map(s => s.trim()).filter(Boolean);
      await post('/deadman/config', {
        enabled,
        intervalDays: parseInt(intervalDays, 10),
        finalSubject,
        finalInstructions,
        beneficiaryEmails: emails,
      });
      alert('Dead Man\'s Switch configuration saved successfully!');
      loadData();
    } catch (err) {
      alert('Save failed: ' + err.message);
    } finally {
      setSaving(false);
    }
  };

  const handleCheckin = async () => {
    try {
      const res = await post('/deadman/checkin');
      alert(res.message);
      loadData();
    } catch (err) {
      alert('Checkin failed: ' + err.message);
    }
  };

  if (loading) return <div>Loading Dead Man's Switch...</div>;

  return (
    <div className="card settings-section">
      <div className="section-header" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
        <div>
          <h2>Dead Man's Switch & Digital Inheritance Vault</h2>
          <p className="text-secondary">
            If you become inactive and do not check in within your chosen timeframe, WoxMail will automatically and securely dispatch your pre-configured digital credentials, password vault keys, or final legacy instructions to your designated trusted beneficiaries.
          </p>
        </div>
        <button type="button" className="btn btn-secondary btn-sm" onClick={handleCheckin} style={{ color: 'var(--color-success)', borderColor: 'var(--color-success)', flexShrink: 0, display: 'inline-flex', alignItems: 'center', gap: '0.4rem' }}>
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"/><polyline points="22 4 12 14.01 9 11.01"/></svg>
          <span>I'm Alive (Reset Clock)</span>
        </button>
      </div>

      {data?.status && (
        <div style={{ margin: '1rem 0', padding: '0.75rem 1rem', background: 'var(--color-bg-page)', border: '1px solid var(--color-border)', borderRadius: 'var(--radius-md)', display: 'flex', gap: '1.5rem', fontSize: '0.8125rem' }}>
          <div>STATUS: <strong style={{ color: data.enabled ? (data.status === 'warning' ? 'var(--color-warning)' : 'var(--color-success)') : 'var(--color-text-secondary)', textTransform: 'uppercase' }}>{data.status}</strong></div>
          <div>LAST CHECK-IN: <strong>{new Date(data.lastCheckin).toLocaleString()}</strong></div>
          <div>INTERVAL: <strong>{data.intervalDays} Days</strong></div>
        </div>
      )}

      <form onSubmit={handleSave} style={{ display: 'flex', flexDirection: 'column', gap: '1.25rem', marginTop: '1rem' }}>
        <label style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', cursor: 'pointer' }}>
          <input type="checkbox" checked={enabled} onChange={(e) => setEnabled(e.target.checked)} />
          <span style={{ fontWeight: 600 }}>Enable Automated Dead Man's Switch</span>
        </label>

        <div>
          <label className="text-secondary" style={{ fontSize: '0.8125rem', display: 'block', marginBottom: 4 }}>Check-in Inactivity Interval</label>
          <select className="input" value={intervalDays} onChange={(e) => setIntervalDays(e.target.value)}>
            <option value="30">30 Days (1 Month)</option>
            <option value="60">60 Days (2 Months)</option>
            <option value="90">90 Days (3 Months — Recommended)</option>
            <option value="180">180 Days (6 Months)</option>
            <option value="365">365 Days (1 Year)</option>
          </select>
        </div>

        <div>
          <label className="text-secondary" style={{ fontSize: '0.8125rem', display: 'block', marginBottom: 4 }}>Beneficiary Email Addresses (comma separated)</label>
          <input type="text" className="input" placeholder="spouse@example.com, lawyer@example.com" value={beneficiaries} onChange={(e) => setBeneficiaries(e.target.value)} />
        </div>

        <div>
          <label className="text-secondary" style={{ fontSize: '0.8125rem', display: 'block', marginBottom: 4 }}>Release Email Subject</label>
          <input type="text" className="input" value={finalSubject} onChange={(e) => setFinalSubject(e.target.value)} />
        </div>

        <div>
          <label className="text-secondary" style={{ fontSize: '0.8125rem', display: 'block', marginBottom: 4 }}>Emergency Instructions / Master Keys / Inheritance Letter</label>
          <textarea className="input mono" rows={6} placeholder="Enter your confidential instructions, key recovery phrases, or final letter to beneficiaries..." value={finalInstructions} onChange={(e) => setFinalInstructions(e.target.value)} />
        </div>

        <button type="submit" className="btn btn-primary btn-sm" disabled={saving} style={{ alignSelf: 'flex-start' }}>
          {saving ? 'Saving...' : 'Save Switch Settings'}
        </button>
      </form>
    </div>
  );
}

// ─── The Feed RSS Bridge Section ─────────────
function FeedRssSection() {
  const [feedUrl, setFeedUrl] = useState('');
  const [loading, setLoading] = useState(false);

  const generateToken = async () => {
    setLoading(true);
    try {
      const res = await post('/settings/feed-rss/token');
      setFeedUrl(res.feedUrl);
    } catch (err) {
      alert('Error generating RSS token: ' + err.message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="card settings-section">
      <div className="section-header">
        <h2>The Feed to RSS / Atom Bridge (Kill the Newsletter)</h2>
        <p className="text-secondary">
          Subscribe to email newsletters in WoxMail and read them inside your favorite external RSS readers (NetNewsWire, Feedly, Reeder, Inoreader).
        </p>
      </div>

      <div style={{ marginTop: '1.5rem' }}>
        <button type="button" className="btn btn-primary btn-sm" onClick={generateToken} disabled={loading} style={{ display: 'inline-flex', alignItems: 'center', gap: '0.4rem' }}>
          {loading ? 'Generating...' : (feedUrl ? 'Regenerate Private RSS Feed Token' : 'Generate My Private RSS Feed URL')}
        </button>

        {feedUrl && (
          <div style={{ marginTop: '1.5rem', background: 'var(--color-bg-page)', border: '1px solid var(--color-border)', borderRadius: 'var(--radius-md)', padding: '1rem' }}>
            <label className="text-secondary" style={{ fontSize: '0.8125rem', display: 'block', marginBottom: 4 }}>Your Private Atom / RSS 2.0 Feed URL:</label>
            <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'center' }}>
              <input type="text" className="input mono" readOnly value={feedUrl} style={{ fontSize: '0.8125rem' }} />
              <button type="button" className="btn btn-secondary btn-sm" onClick={() => { navigator.clipboard.writeText(feedUrl); alert('Copied feed URL to clipboard!'); }} style={{ display: 'inline-flex', alignItems: 'center', gap: '0.35rem' }}>
                <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect width="14" height="14" x="8" y="8" rx="2" ry="2"/><path d="M4 16c-1.1 0-2-.9-2-2V4c0-1.1.9-2 2-2h10c1.1 0 2 .9 2 2"/></svg>
                <span>Copy</span>
              </button>
            </div>
            <p className="text-tertiary" style={{ fontSize: '0.75rem', marginTop: '0.5rem' }}>
              Paste this URL into NetNewsWire, Feedly, Reeder, or Inoreader. It streams all newsletters delivered to "The Feed" folder.
            </p>
          </div>
        )}
      </div>
    </div>
  );
}

function DeviceSetupSection({ user }) {
  const userEmail = user?.email || 'your-email@wox.world';

  return (
    <div className="card settings-section">
      <div className="section-header">
        <h2>Mobile & Desktop Mail App Auto-Setup</h2>
        <p className="text-secondary">
          Connect your WoxMail inbox to Apple Mail, Outlook, Thunderbird, Android Gmail app, or any standard IMAP/SMTP client.
        </p>
      </div>

      <div style={{ marginTop: '1.5rem', display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>
        {/* Apple 1-Click Profile */}
        <div style={{ background: 'linear-gradient(135deg, rgba(124, 58, 237, 0.15), rgba(59, 130, 246, 0.08))', border: '1px solid rgba(124, 58, 237, 0.3)', borderRadius: 'var(--radius-lg)', padding: '1.5rem' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '1rem' }}>
            <div>
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '0.25rem' }}>
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ color: 'var(--color-primary-light)' }}><rect width="14" height="20" x="5" y="2" rx="2" ry="2"/><path d="M12 18h.01"/></svg>
                <strong style={{ fontSize: '1.1rem', color: '#fff' }}>Apple iOS & macOS 1-Click Profile</strong>
              </div>
              <p className="text-secondary" style={{ fontSize: '0.875rem', margin: 0 }}>
                Instant zero-typing configuration for iPhone, iPad, and Mac Mail.
              </p>
            </div>
            <a
              href={`/api/autodiscover/mobileconfig?email=${encodeURIComponent(userEmail)}`}
              download={`${userEmail.split('@')[0]}-woxmail.mobileconfig`}
              className="btn btn-primary btn-sm"
              style={{ display: 'inline-flex', alignItems: 'center', gap: '0.4rem', textDecoration: 'none' }}
            >
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/></svg>
              <span>Download Apple Profile</span>
            </a>
          </div>
        </div>

        {/* Mozilla & Microsoft Autodiscovery */}
        <div style={{ background: 'var(--color-bg-page)', border: '1px solid var(--color-border)', borderRadius: 'var(--radius-md)', padding: '1.25rem' }}>
          <strong style={{ display: 'block', marginBottom: '0.5rem', color: 'var(--color-primary-light)' }}>
            Standard Autodiscovery Endpoints Active
          </strong>
          <p className="text-secondary" style={{ fontSize: '0.8125rem', lineHeight: 1.6, margin: 0 }}>
            Thunderbird, Outlook, K-9 Mail, and FairEmail will automatically fetch server settings directly via:
          </p>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '0.4rem', marginTop: '0.75rem', fontFamily: 'var(--font-mono)', fontSize: '0.75rem', color: 'var(--color-text-secondary)' }}>
            <div>• Mozilla Autoconfig: <code>/mail/config-v1.1.xml</code></div>
            <div>• Microsoft Outlook POX: <code>/autodiscover/autodiscover.xml</code></div>
            <div>• Microsoft 365 JSON: <code>/autodiscover/autodiscover.json</code></div>
          </div>
        </div>

        {/* Manual Server Settings Reference */}
        <div style={{ background: 'var(--color-bg-page)', border: '1px solid var(--color-border)', borderRadius: 'var(--radius-md)', padding: '1.25rem' }}>
          <strong style={{ display: 'block', marginBottom: '0.75rem' }}>Manual Server Configuration</strong>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))', gap: '1rem' }}>
            <div style={{ background: 'var(--color-bg-card)', padding: '0.875rem', borderRadius: 'var(--radius-sm)', border: '1px solid var(--color-border)' }}>
              <div style={{ fontSize: '0.75rem', fontWeight: 700, color: 'var(--color-primary-light)', marginBottom: '0.4rem' }}>INCOMING (IMAP)</div>
              <div style={{ fontSize: '0.8125rem' }}><strong>Host:</strong> <code className="mono">imap.purelymail.com</code></div>
              <div style={{ fontSize: '0.8125rem' }}><strong>Port:</strong> <code className="mono">993</code> (SSL/TLS)</div>
              <div style={{ fontSize: '0.8125rem' }}><strong>Username:</strong> <code className="mono">{userEmail}</code></div>
            </div>

            <div style={{ background: 'var(--color-bg-card)', padding: '0.875rem', borderRadius: 'var(--radius-sm)', border: '1px solid var(--color-border)' }}>
              <div style={{ fontSize: '0.75rem', fontWeight: 700, color: 'var(--color-success)', marginBottom: '0.4rem' }}>OUTGOING (SMTP)</div>
              <div style={{ fontSize: '0.8125rem' }}><strong>Host:</strong> <code className="mono">smtp.purelymail.com</code></div>
              <div style={{ fontSize: '0.8125rem' }}><strong>Port:</strong> <code className="mono">465</code> (SSL/TLS) or <code className="mono">587</code></div>
              <div style={{ fontSize: '0.8125rem' }}><strong>Username:</strong> <code className="mono">{userEmail}</code></div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}


