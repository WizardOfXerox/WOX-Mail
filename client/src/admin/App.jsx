import React, { useState, useEffect } from 'react';
import { useUser } from '../shared/hooks.js';
import { get, put, post, del, patch } from '../shared/api.js';
import AdminTickets from './components/AdminTickets.jsx';
import AdminTerminal from './components/AdminTerminal.jsx';
import AdminDomainsTab from './components/AdminDomainsTab.jsx';
import AdminQueueTab from './components/AdminQueueTab.jsx';
import AdminEDiscoveryTab from './components/AdminEDiscoveryTab.jsx';
import AdminGovernanceTab from './components/AdminGovernanceTab.jsx';
import AdminStorageTab from './components/AdminStorageTab.jsx';
import ThemeCustomizerModal from '../dashboard/components/ThemeCustomizerModal.jsx';
import BackgroundCanvas from '../dashboard/components/BackgroundCanvas.jsx';
import '../shared/styles/globals.css';

const getAdminIcon = (id, width = 15, height = 15) => {
  switch (id) {
    case 'overview':
      return <svg width={width} height={height} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect width="7" height="9" x="3" y="3" rx="1"/><rect width="7" height="5" x="14" y="3" rx="1"/><rect width="7" height="9" x="14" y="12" rx="1"/><rect width="7" height="5" x="3" y="16" rx="1"/></svg>;
    case 'diagnostics':
      return <svg width={width} height={height} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2"/></svg>;
    case 'domains':
      return <svg width={width} height={height} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="10"/><line x1="2" y1="12" x2="22" y2="12"/><path d="M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z"/></svg>;
    case 'queue':
      return <svg width={width} height={height} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><line x1="10" y1="6" x2="21" y2="6"/><line x1="10" y1="12" x2="21" y2="12"/><line x1="10" y1="18" x2="21" y2="18"/><polyline points="3 6 4 7 6 5"/><polyline points="3 12 4 13 6 11"/><polyline points="3 18 4 19 6 17"/></svg>;
    case 'ediscovery':
      return <svg width={width} height={height} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/><line x1="11" y1="8" x2="11" y2="14"/><line x1="8" y1="11" x2="14" y2="11"/></svg>;
    case 'governance':
      return <svg width={width} height={height} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect width="18" height="11" x="3" y="11" rx="2" ry="2"/><path d="M7 11V7a5 5 0 0 1 10 0v4"/></svg>;
    case 'storage':
      return <svg width={width} height={height} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><ellipse cx="12" cy="5" rx="9" ry="3"/><path d="M21 12c0 1.66-4 3-9 3s-9-1.34-9-3"/><path d="M3 5v14c0 1.66 4 3 9 3s9-1.34 9-3V5"/></svg>;
    case 'users':
      return <svg width={width} height={height} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M22 21v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/></svg>;
    case 'admins':
      return <svg width={width} height={height} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2"/></svg>;
    case 'invites':
      return <svg width={width} height={height} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="7.5" cy="15.5" r="5.5"/><path d="m21 2-9.6 9.6"/><path d="m15.5 7.5 3 3L22 7l-3-3"/></svg>;
    case 'ips':
      return <svg width={width} height={height} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="10"/><line x1="4.93" y1="4.93" x2="19.07" y2="19.07"/></svg>;
    case 'tickets':
      return <svg width={width} height={height} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="10"/><path d="M9.09 9a3 3 0 0 1 5.83 1c0 2-3 3-3 3"/><line x1="12" y1="17" x2="12.01" y2="17"/></svg>;
    case 'terminal':
      return <svg width={width} height={height} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="4 17 10 11 4 5"/><line x1="12" y1="19" x2="20" y2="19"/></svg>;
    case 'futureme':
      return <svg width={width} height={height} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 14 14"/></svg>;
    case 'pool':
      return <svg width={width} height={height} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M22 13V6a2 2 0 0 0-2-2H4a2 2 0 0 0-2 2v12c0 1.1.9 2 2 2h9"/><path d="m22 7-8.97 5.7a1.94 1.94 0 0 1-2.06 0L2 7"/><path d="M19 16v6"/><path d="M16 19h6"/></svg>;
    case 'services':
      return <svg width={width} height={height} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/></svg>;
    case 'settings':
      return <svg width={width} height={height} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1 0 2.83 2 2 0 0 1-2.83 0l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-2 2 2 2 0 0 1-2-2v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83 0 2 2 0 0 1 0-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1-2-2 2 2 0 0 1 2-2h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 0-2.83 2 2 0 0 1 2.83 0l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 2-2 2 2 0 0 1 2 2v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 0 2 2 0 0 1 0 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 2 2 2 2 0 0 1-2 2h-.09a1.65 1.65 0 0 0-1.51 1z"/></svg>;
    case 'audit':
      return <svg width={width} height={height} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/><line x1="16" y1="13" x2="8" y2="13"/><line x1="16" y1="17" x2="8" y2="17"/><polyline points="10 9 9 9 8 9"/></svg>;
    case 'announcements':
      return <svg width={width} height={height} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="m3 11 18-5v12L3 14v-3z"/><path d="M11.6 16.8a3 3 0 1 1-5.8-1.6"/></svg>;
    default:
      return <svg width={width} height={height} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="10"/></svg>;
  }
};


export default function App() {
  const { user, loading: userLoading } = useUser();
  const [sidebarCollapsed, setSidebarCollapsed] = useState(() => {
    return localStorage.getItem('woxmail_admin_sidebar_collapsed') === 'true';
  });
  const [mobileSidebarOpen, setMobileSidebarOpen] = useState(false);
  const [activeTab, setActiveTab] = useState(() => {
    const hash = window.location.hash.replace('#', '');
    return ['overview', 'admins', 'users', 'invites', 'services', 'pool', 'ips', 'diagnostics', 'settings', 'audit', 'announcements', 'tickets', 'terminal'].includes(hash)
      ? hash
      : 'overview';
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

  const toggleSidebarCollapse = () => {
    setSidebarCollapsed((prev) => {
      const next = !prev;
      localStorage.setItem('woxmail_admin_sidebar_collapsed', String(next));
      return next;
    });
  };

  useEffect(() => {
    if (!userLoading && (!user || !user.is_admin)) {
      window.location.href = '/login?redirect=/admin';
    }
  }, [user, userLoading]);

  const handleTabChange = (tabId) => {
    setActiveTab(tabId);
    window.location.hash = tabId;
  };

  if (userLoading) {
    return (
      <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', height: '100vh', gap: '1rem', background: '#0a0a14', color: '#f0f0f5' }}>
        <div style={{ width: 44, height: 44, border: '3px solid rgba(124,58,237,0.2)', borderTop: '3px solid #7c3aed', borderRadius: '50%', animation: 'spin 0.8s linear infinite' }} />
        <p style={{ color: 'var(--color-text-secondary)', fontSize: '0.875rem' }}>Authenticating Sovereign Admin Session...</p>
        <style>{`@keyframes spin { 0% { transform: rotate(0deg); } 100% { transform: rotate(360deg); } }`}</style>
      </div>
    );
  }

  if (!user || !user.is_admin) {
    return null;
  }

  const navSections = [
    {
      title: 'Analytics & Health',
      items: [
        { id: 'overview', label: 'Executive Overview' },
        { id: 'diagnostics', label: 'Diagnostics & Backups' },
        { id: 'storage', label: 'Storage & Quotas' },
      ],
    },
    {
      title: 'Identity & Access',
      items: [
        { id: 'users', label: 'User Directory' },
        { id: 'admins', label: 'Admin Officers' },
        { id: 'invites', label: 'Invite Codes' },
      ],
    },
    {
      title: 'Mail Engines',
      items: [
        { id: 'domains', label: 'Domain & DNS Center' },
        { id: 'queue', label: 'Delivery Queue & Quarantine' },
        { id: 'pool', label: 'Temp Mail Pool' },
        { id: 'futureme', label: 'Time Capsule Letters' },
        { id: 'services', label: 'System Mailboxes' },
      ],
    },
    {
      title: 'Infrastructure & SecOps',
      items: [
        { id: 'ediscovery', label: 'eDiscovery & Compliance' },
        { id: 'governance', label: 'Security Policies & DLP' },
        { id: 'ips', label: 'Firewall & IP Bans' },
        { id: 'tickets', label: 'Support Desk' },
        { id: 'settings', label: 'System Configuration' },
        { id: 'audit', label: 'Security Audit Log' },
        { id: 'announcements', label: 'Global Announcements' },
      ],
    },
  ];

  let activeLabel = 'Overview';
  for (const s of navSections) {
    const it = s.items.find((i) => i.id === activeTab);
    if (it) {
      activeLabel = it.label;
      break;
    }
  }

  return (
    <div className="admin-layout-wrapper">
      {/* Mobile Drawer Backdrop */}
      {mobileSidebarOpen && (
        <div
          className="admin-drawer-backdrop"
          onClick={() => setMobileSidebarOpen(false)}
          style={{
            position: 'fixed',
            inset: 0,
            background: 'rgba(0,0,0,0.7)',
            backdropFilter: 'blur(4px)',
            zIndex: 99,
          }}
        />
      )}

      {/* ── Left Modern Sidebar ────────────────────────────── */}
      <aside className={`admin-saas-sidebar ${sidebarCollapsed ? 'collapsed' : ''} ${mobileSidebarOpen ? 'open mobile-open' : ''}`}>
        <div className="admin-sidebar-brand">
          <a href="/admin" className="admin-brand-logo" title="WoxAdmin Sovereign Enclave">
            <div className="admin-shield-icon"><svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2"/></svg></div>
            <div>
              <span style={{ color: '#ffffff' }}>Wox</span>
              <span style={{ color: 'var(--color-primary-light)' }}>Admin</span>
            </div>
          </a>
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.35rem' }}>
            {!sidebarCollapsed && (
              <div className="admin-status-indicator" title="All server services operational">
                <span className="status-dot-pulse" />
                <span>LIVE</span>
              </div>
            )}
            <button
              type="button"
              className="btn btn-ghost btn-icon hide-desktop"
              onClick={() => setMobileSidebarOpen(false)}
              aria-label="Close admin menu"
              style={{ padding: '0.25rem', color: 'var(--color-text-secondary)' }}
            >
              ✕
            </button>
          </div>
        </div>

        <nav className="admin-nav-scroller">
          {navSections.map((sec) => (
            <div key={sec.title} className="admin-nav-group">
              <div className="admin-group-title">{sec.title}</div>
              {sec.items.map((item) => (
                <button
                  key={item.id}
                  type="button"
                  data-tab={item.id}
                  className={`admin-nav-btn admin-tab ${activeTab === item.id ? 'active' : ''}`}
                  onClick={() => handleTabChange(item.id)}
                  title={item.label}
                >
                  <div className="admin-nav-btn-left">
                    <span style={{ display: "inline-flex", alignItems: "center" }}>{getAdminIcon(item.id)}</span>
                    <span>{item.label}</span>
                  </div>
                  {item.id === 'tickets' && (
                    <span className="admin-nav-badge">WOX-TK</span>
                  )}
                  {item.id === 'terminal' && (
                    <span className="admin-nav-badge" style={{ background: '#3b82f6' }}>CLI</span>
                  )}
                </button>
              ))}
            </div>
          ))}
        </nav>

        <div className="admin-sidebar-footer">
          <button
            type="button"
            className="sidebar-collapse-toggle hide-mobile"
            onClick={toggleSidebarCollapse}
            title={sidebarCollapsed ? 'Expand Admin Sidebar' : 'Collapse Admin Sidebar'}
          >
            <span>{sidebarCollapsed ? '▶' : '◀'}</span>
            <span className="admin-collapse-text">{sidebarCollapsed ? '' : 'Collapse Menu'}</span>
          </button>

          <div className="admin-user-card">
            <div className="admin-user-info">
              <span className="admin-user-name">{user?.username || user?.email}</span>
              <span className="admin-user-role">SUPER ADMIN</span>
            </div>
            <button
              type="button"
              className="btn btn-ghost btn-xs"
              onClick={() => setThemeModalOpen(true)}
              title="Themes, Accents & Interactive Shaders (Key: T)"
            >
              <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="10"/><path d="M12 2a10 10 0 0 1 0 20z"/></svg>
            </button>
          </div>
          <a href="/dashboard" className="btn btn-secondary btn-sm" title="Back to Webmail Inbox" style={{ width: '100%', justifyContent: 'center', gap: '0.4rem', fontSize: '0.8125rem' }}>
            <span>←</span>
            <span className="admin-collapse-text">Back to Inbox</span>
          </a>
        </div>
      </aside>

      {/* ── Main View Container ────────────────────────────── */}
      <main className="admin-saas-main admin-content">
        <header className="admin-topbar">
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
            <button
              type="button"
              className="btn btn-ghost btn-icon hide-desktop admin-mobile-nav-toggle"
              onClick={() => setMobileSidebarOpen(!mobileSidebarOpen)}
              aria-label="Toggle admin navigation"
              title="Open Navigation"
              style={{ display: 'inline-flex', alignItems: 'center', padding: '0.35rem 0.5rem' }}
            >
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><line x1="3" y1="12" x2="21" y2="12"/><line x1="3" y1="6" x2="21" y2="6"/><line x1="3" y1="18" x2="21" y2="18"/></svg>
            </button>
            <div className="admin-breadcrumb">
              <span className="admin-breadcrumb-root">Admin Command Center</span>
              <span className="admin-breadcrumb-separator" style={{ color: 'var(--color-text-tertiary)' }}>/</span>
              <span className="admin-breadcrumb-current">{activeLabel}</span>
            </div>
          </div>

          <div className="admin-topbar-actions">
            <span className="admin-badge admin-badge-purple">
              ROOT ENCLAVE
            </span>
            <button
              type="button"
              className="btn btn-secondary btn-xs hide-mobile"
              onClick={() => setThemeModalOpen(true)}
              title="Visual Themes & Shaders (Key: T)"
              style={{ gap: '0.35rem' }}
            >
              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="10"/><path d="M12 2a10 10 0 0 1 0 20z"/></svg>
              <span>Theme</span>
            </button>
            <a
              href="#"
              onClick={(e) => {
                e.preventDefault();
                post('/auth/logout').finally(() => {
                  window.location.href = '/login';
                });
              }}
              className="btn btn-ghost btn-xs"
              style={{ color: 'var(--color-error)' }}
              title="Sign out admin session"
            >
              Sign Out
            </a>
          </div>
        </header>

        <div className="admin-content-canvas">
          {activeTab === 'overview' && <OverviewTab onNavigate={handleTabChange} />}
          {activeTab === 'users' && <UsersTab />}
          {activeTab === 'admins' && <AdminsTab />}
          {activeTab === 'invites' && <InvitesTab />}
          {activeTab === 'services' && <ServicesTab />}
          {activeTab === 'futureme' && <FutureLettersTab />}
          {activeTab === 'pool' && <PoolTab />}
          {activeTab === 'ips' && <IpsTab />}
          {activeTab === 'tickets' && <AdminTickets />}
          {activeTab === 'terminal' && <AdminTerminal />}
          {activeTab === 'diagnostics' && <DiagnosticsTab />}
          {activeTab === 'settings' && <SettingsTab />}
          {activeTab === 'audit' && <AuditTab />}
          {activeTab === 'announcements' && <AnnouncementsTab />}
          {activeTab === 'domains' && <AdminDomainsTab />}
          {activeTab === 'queue' && <AdminQueueTab />}
          {activeTab === 'ediscovery' && <AdminEDiscoveryTab />}
          {activeTab === 'governance' && <AdminGovernanceTab />}
          {activeTab === 'storage' && <AdminStorageTab />}
        </div>
      </main>

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

// ─── Overview Tab Component ─────────────────────────────────
function OverviewTab({ onNavigate }) {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    get('/admin/overview')
      .then((d) => { setData(d); setLoading(false); })
      .catch(() => setLoading(false));
  }, []);

  if (loading) {
    return (
      <div className="admin-kpi-grid">
        {[...Array(6)].map((_, i) => (
          <div key={i} className="skeleton" style={{ height: 120, borderRadius: 'var(--radius-lg)' }} />
        ))}
      </div>
    );
  }

  if (!data) return <p className="text-secondary">Failed to load overview data.</p>;

  const cards = [
    { id: 'users', icon: getAdminIcon('users', 18, 18), bg: 'rgba(124, 58, 237, 0.2)', color: '#c084fc', label: 'Registered Users', value: data.totalUsers || 0, sub: 'Permanent Accounts', tab: 'users' },
    { id: 'pool', icon: getAdminIcon('pool', 18, 18), bg: 'rgba(59, 130, 246, 0.2)', color: '#60a5fa', label: 'Active Temp Mail', value: data.activeTempAddresses || 0, sub: 'Ephemeral Inboxes', tab: 'pool' },
    { id: 'diagnostics', icon: getAdminIcon('diagnostics', 18, 18), bg: 'rgba(245, 158, 11, 0.2)', color: '#fbbf24', label: 'Emails Today', value: data.emailsToday || 0, sub: 'Inbound & Outbound', tab: 'overview' },
    { id: 'tickets', icon: getAdminIcon('tickets', 18, 18), bg: 'rgba(239, 68, 68, 0.2)', color: '#f87171', label: 'Support Tickets', value: data.supportTickets?.open || 0, sub: `${data.supportTickets?.total || 0} Total Logged`, tab: 'tickets' },
    { id: 'invites', icon: getAdminIcon('invites', 18, 18), bg: 'rgba(34, 197, 94, 0.2)', color: '#4ade80', label: 'Available Invites', value: data.unusedInvites || 0, sub: 'Registration Quota', tab: 'invites' },
    { id: 'services', icon: getAdminIcon('services', 18, 18), bg: 'rgba(168, 85, 247, 0.2)', color: '#d8b4fe', label: 'Pool Standby', value: data.pool?.available || 0, sub: `Target: ${data.pool?.target || 20}`, tab: 'pool' },
  ];

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '2rem' }}>
      {/* Hero Welcome Banner */}
      <div className="admin-hero-banner" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '1.25rem', padding: '1.75rem 2rem', background: 'linear-gradient(135deg, rgba(124, 58, 237, 0.16) 0%, rgba(59, 130, 246, 0.08) 100%)', border: '1px solid rgba(124, 58, 237, 0.35)', borderRadius: 'var(--radius-lg)', boxShadow: '0 8px 32px rgba(0, 0, 0, 0.3)' }}>
        <div className="admin-hero-content">
          <h1 style={{ fontFamily: "'Outfit', var(--font-body)", fontSize: '1.65rem', fontWeight: 800, color: '#ffffff', letterSpacing: '-0.02em', margin: '0 0 0.4rem' }}>
            Sovereign Command &amp; Operations Center
          </h1>
          <p style={{ color: 'var(--color-text-secondary, #c4c4dc)', fontSize: '0.875rem', margin: 0, lineHeight: 1.5 }}>
            Real-time cluster telemetry, user management, and security triage for <strong style={{ color: '#ffffff' }}>wox.world</strong>.
          </p>
        </div>
        <div className="admin-hero-actions" style={{ display: 'flex', gap: '0.65rem', alignItems: 'center', flexWrap: 'wrap' }}>
          <button
            type="button"
            className="btn btn-primary btn-sm"
            onClick={() => onNavigate && onNavigate('terminal')}
            style={{ display: 'inline-flex', alignItems: 'center', gap: '0.4rem', padding: '0.5rem 1rem', fontWeight: 600 }}
          >
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="4 17 10 11 4 5"/><line x1="12" y1="19" x2="20" y2="19"/></svg>
            <span>Developer Terminal</span>
          </button>
          <button
            type="button"
            className="btn btn-secondary btn-sm"
            onClick={() => onNavigate && onNavigate('tickets')}
            style={{ display: 'inline-flex', alignItems: 'center', gap: '0.4rem', padding: '0.5rem 1rem', fontWeight: 600 }}
          >
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="10"/><path d="M9.09 9a3 3 0 0 1 5.83 1c0 2-3 3-3 3"/><line x1="12" y1="17" x2="12.01" y2="17"/></svg>
            <span>Support Desk</span>
          </button>
        </div>
      </div>

      {/* 6-Card KPI Bento Grid */}
      <div className="admin-kpi-grid">
        {cards.map((c) => (
          <div
            key={c.label}
            className="admin-kpi-card"
            onClick={() => onNavigate && onNavigate(c.tab)}
            style={{ cursor: 'pointer' }}
          >
            <div className="admin-kpi-header">
              <span className="admin-kpi-title">{c.label}</span>
              <div className="kpi-icon-wrap" style={{ background: c.bg, color: c.color }}>
                {c.icon}
              </div>
            </div>
            <div className="admin-kpi-val">{c.value}</div>
            <div className="admin-kpi-sub">
              <span>●</span>
              <span>{c.sub}</span>
            </div>
          </div>
        ))}
      </div>

      {/* Operations & Cluster Health Bento Grid */}
      <div className="admin-bento-grid">
        {/* Left: Cluster Telemetry */}
        <div className="admin-bento-card">
          <div className="admin-bento-header">
            <div className="admin-bento-title">
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect width="20" height="14" x="2" y="3" rx="2"/><line x1="8" x2="16" y1="21" y2="21"/><line x1="12" x2="12" y1="17" y2="21"/></svg>
              <span>Cluster Diagnostics & Service Mesh</span>
            </div>
            <span className="admin-badge admin-badge-green">ALL HEALTHY</span>
          </div>

          <div className="admin-telemetry-list">
            <div className="admin-telemetry-row">
              <div>
                <strong>PostgreSQL 16 Engine</strong>
                <div className="text-secondary" style={{ fontSize: '0.75rem' }}>Connection pool limit: 20 max</div>
              </div>
              <span className="admin-badge admin-badge-green">CONNECTED</span>
            </div>

            <div className="admin-telemetry-row">
              <div>
                <strong>In-Memory Cache & Session Store</strong>
                <div className="text-secondary" style={{ fontSize: '0.75rem' }}>Rate limiting & anti-abuse cache</div>
              </div>
              <span className="admin-badge admin-badge-purple">ACTIVE</span>
            </div>

            <div className="admin-telemetry-row">
              <div>
                <strong>Background Automation Workers</strong>
                <div className="text-secondary" style={{ fontSize: '0.75rem' }}>11 active cron tasks (cleanup, futureme, support)</div>
              </div>
              <span className="admin-badge admin-badge-blue">RUNNING</span>
            </div>

            <div className="admin-telemetry-row">
              <div>
                <strong>Purelymail IMAP/SMTP Gateway</strong>
                <div className="text-secondary" style={{ fontSize: '0.75rem' }}>Encrypted TLS 993/465 routing</div>
              </div>
              <span className="admin-badge admin-badge-green">OPERATIONAL</span>
            </div>
          </div>
        </div>

        {/* Right: Live Quick Action Launcher */}
        <div className="admin-bento-card">
          <div className="admin-bento-header">
            <div className="admin-bento-title">
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2"/></svg>
              <span>Quick Action Launcher</span>
            </div>
          </div>

          <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
            <button
              type="button"
              className="btn btn-secondary btn-sm"
              style={{ justifyContent: 'flex-start', padding: '0.75rem 1rem' }}
              onClick={() => onNavigate && onNavigate('users')}
            >
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/></svg>
              <span>Manage User Directory & Quotas</span>
            </button>

            <button
              type="button"
              className="btn btn-secondary btn-sm"
              style={{ justifyContent: 'flex-start', padding: '0.75rem 1rem' }}
              onClick={() => onNavigate && onNavigate('invites')}
            >
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="7.5" cy="15.5" r="5.5"/><path d="m21 2-9.6 9.6"/></svg>
              <span>Generate VIP Registration Invites</span>
            </button>

            <button
              type="button"
              className="btn btn-secondary btn-sm"
              style={{ justifyContent: 'flex-start', padding: '0.75rem 1rem' }}
              onClick={() => onNavigate && onNavigate('pool')}
            >
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M22 13V6a2 2 0 0 0-2-2H4a2 2 0 0 0-2 2v12c0 1.1.9 2 2 2h9"/><path d="m22 7-8.97 5.7a1.94 1.94 0 0 1-2.06 0L2 7"/><path d="M19 16v6"/><path d="M16 19h6"/></svg>
              <span>Top Up Disposable Mail Standby Pool</span>
            </button>

            <button
              type="button"
              className="btn btn-secondary btn-sm"
              style={{ justifyContent: 'flex-start', padding: '0.75rem 1rem' }}
              onClick={() => onNavigate && onNavigate('terminal')}
            >
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="4 17 10 11 4 5"/><line x1="12" y1="19" x2="20" y2="19"/></svg>
              <span>Launch Root Web Terminal</span>
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

// ─── Users Directory & Full Management Suite ────────────────
function UsersTab() {
  const [users, setUsers] = useState([]);
  const [counts, setCounts] = useState({ total: 0, permanent: 0, personal: 0, public: 0 });
  const [tierFilter, setTierFilter] = useState('all'); // 'all' | 'permanent' | 'personal' | 'public'
  const [statusFilter, setStatusFilter] = useState('all'); // 'all' | 'active' | 'suspended' | 'available' | 'expired'
  const [search, setSearch] = useState('');
  const [page, setPage] = useState(1);
  const [pagination, setPagination] = useState(null);
  const [loading, setLoading] = useState(true);

  // Modal States
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [editUser, setEditUser] = useState(null);
  const [resetPwUser, setResetPwUser] = useState(null);
  const [deleteUserTarget, setDeleteUserTarget] = useState(null);

  const fetchUsers = () => {
    setLoading(true);
    const q = search ? `&q=${encodeURIComponent(search)}` : '';
    const st = statusFilter !== 'all' ? `&status=${encodeURIComponent(statusFilter)}` : '';
    get(`/admin/users?page=${page}&limit=25&tier=${tierFilter}${st}${q}`)
      .then((d) => {
        setUsers(d.users || []);
        if (d.counts) setCounts(d.counts);
        setPagination(d.pagination);
      })
      .finally(() => setLoading(false));
  };

  useEffect(() => {
    fetchUsers();
  }, [page, search, tierFilter, statusFilter]);

  const toggleSuspend = async (u) => {
    try {
      await put(`/admin/users/${u.id}`, { is_suspended: !u.is_suspended });
      setUsers((prev) => prev.map((x) => x.id === u.id ? { ...x, is_suspended: !x.is_suspended, status: !x.is_suspended ? 'suspended' : 'active' } : x));
      if (window.WoxToast) window.WoxToast.success(`User ${u.username} ${u.is_suspended ? 'unsuspended' : 'suspended'}`);
    } catch (err) {
      alert('Failed to update user status: ' + err.message);
    }
  };

  const handleOpenInbox = (u) => {
    window.open(`/api/admin/impersonate/${u.id}`, '_blank');
  };

  const formatExpiry = (u) => {
    if (u.tier === 'permanent') return <span className="text-secondary">Permanent</span>;
    if (!u.expires_at) return <span className="text-secondary">—</span>;
    const diffMs = new Date(u.expires_at).getTime() - Date.now();
    if (diffMs <= 0) return <span className="admin-badge admin-badge-red">Expired</span>;
    const days = Math.floor(diffMs / (86400 * 1000));
    const hours = Math.floor((diffMs % (86400 * 1000)) / 3600000);
    if (days > 0) return <span className="admin-badge admin-badge-amber">{days}d {hours}h left</span>;
    return <span className="admin-badge admin-badge-red">{hours}h left</span>;
  };

  return (
    <div className="admin-table-panel">
      {/* Directory Header Toolbar */}
      <div className="admin-table-toolbar" style={{ flexWrap: 'wrap', gap: '1rem' }}>
        <div>
          <h2 style={{ fontSize: '1.15rem', margin: 0, display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
            <span>User & Mailbox Directory</span>
            <span className="admin-badge admin-badge-purple">
              {tierFilter === 'personal' ? `${counts.personal} Personal Temp` : tierFilter === 'permanent' ? `${counts.permanent} Permanent` : tierFilter === 'public' ? `${counts.public} Public` : `${counts.total} Total Accounts`}
            </span>
          </h2>
          <p className="text-secondary" style={{ fontSize: '0.75rem', margin: '0.2rem 0 0' }}>
            Unified control across Permanent Webmail (@wox.world), Personal Temp Mail (@mail.wox.world), and Community pools.
          </p>
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', flexWrap: 'wrap' }}>
          <button
            type="button"
            className="btn btn-primary btn-sm"
            onClick={() => setShowCreateModal(true)}
            style={{ display: 'inline-flex', alignItems: 'center', gap: '0.4rem', fontWeight: 600 }}
          >
            <span>+</span>
            <span>Create New User</span>
          </button>

          <div className="admin-search-wrap">
            <span className="admin-search-icon" style={{ display: "inline-flex", alignItems: "center" }}><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/></svg></span>
            <input
              className="admin-search-input"
              placeholder="Search username, email, address..."
              value={search}
              onChange={(e) => { setSearch(e.target.value); setPage(1); }}
            />
          </div>
        </div>
      </div>

      {/* Tier and Status Filter Bar */}
      <div style={{ display: 'flex', gap: '0.5rem', padding: '0.75rem 1.25rem', borderBottom: '1px solid var(--color-border)', background: 'var(--color-bg-page)', flexWrap: 'wrap', alignItems: 'center', justifyContent: 'space-between' }}>
        <div style={{ display: 'flex', gap: '0.4rem', flexWrap: 'wrap', alignItems: 'center' }}>
          <button
            type="button"
            className={`btn btn-xs ${tierFilter === 'all' ? 'btn-primary' : 'btn-secondary'}`}
            onClick={() => { setTierFilter('all'); setPage(1); }}
          >
            All Accounts ({counts.total})
          </button>
          <button
            type="button"
            className={`btn btn-xs ${tierFilter === 'permanent' ? 'btn-primary' : 'btn-secondary'}`}
            onClick={() => { setTierFilter('permanent'); setPage(1); }}
          >
            Permanent Webmail ({counts.permanent})
          </button>
          <button
            type="button"
            className={`btn btn-xs ${tierFilter === 'personal' ? 'btn-primary' : 'btn-secondary'}`}
            onClick={() => { setTierFilter('personal'); setPage(1); }}
          >
            Personal Temp Mail ({counts.personal})
          </button>
          <button
            type="button"
            className={`btn btn-xs ${tierFilter === 'public' ? 'btn-primary' : 'btn-secondary'}`}
            onClick={() => { setTierFilter('public'); setPage(1); }}
          >
            Public Pool ({counts.public})
          </button>
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
          <label style={{ fontSize: '0.75rem', color: 'var(--color-text-secondary)', fontWeight: 500 }}>Status Filter:</label>
          <select
            className="input input-xs"
            value={statusFilter}
            onChange={(e) => { setStatusFilter(e.target.value); setPage(1); }}
            style={{ width: 130, padding: '0.2rem 0.5rem' }}
          >
            <option value="all">All Statuses</option>
            <option value="active">Active Only</option>
            <option value="suspended">Suspended</option>
            <option value="expired">Expired Only</option>
          </select>
        </div>
      </div>

      <div className="admin-table-responsive">
        <table className="admin-data-table">
          <thead>
            <tr>
              <th>Account</th>
              <th>Email Address</th>
              <th>Tier / Role</th>
              <th>Status</th>
              <th>Lifespan / Expiry</th>
              <th>Registered</th>
              <th style={{ textAlign: 'right' }}>Actions</th>
            </tr>
          </thead>
          <tbody>
            {loading && users.length === 0 ? (
              [...Array(5)].map((_, i) => (
                <tr key={i}>
                  <td colSpan={7}>
                    <div className="skeleton" style={{ height: 36, borderRadius: 'var(--radius-sm)' }} />
                  </td>
                </tr>
              ))
            ) : users.length === 0 ? (
              <tr>
                <td colSpan={7} style={{ textAlign: 'center', padding: '3rem', color: 'var(--color-text-tertiary)' }}>
                  No mailboxes found in this view.
                </td>
              </tr>
            ) : (
              users.map((u) => (
                <tr key={u.id}>
                  <td>
                    <div className="admin-avatar-cell">
                      <div className="admin-avatar" style={{ background: u.tier === 'personal' ? 'linear-gradient(135deg, #f59e0b, #d97706)' : undefined }}>
                        {u.username ? u.username[0].toUpperCase() : 'U'}
                      </div>
                      <div>
                        <strong>{u.username}</strong>
                        {u.display_name && u.display_name !== u.username && (
                          <div className="text-secondary" style={{ fontSize: '0.7rem' }}>{u.display_name}</div>
                        )}
                      </div>
                    </div>
                  </td>
                  <td className="mono" style={{ fontSize: '0.8125rem' }}>{u.email}</td>
                  <td>
                    {u.is_admin ? (
                      <span className="admin-badge admin-badge-purple">SUPER ADMIN</span>
                    ) : u.tier === 'personal' ? (
                      <span className="admin-badge admin-badge-amber">PERSONAL TEMP</span>
                    ) : u.tier === 'public' ? (
                      <span className="admin-badge admin-badge-blue">PUBLIC DISPOSABLE</span>
                    ) : (
                      <span className="admin-badge admin-badge-blue">PERMANENT</span>
                    )}
                  </td>
                  <td>
                    {u.is_suspended || u.status === 'suspended' ? (
                      <span className="admin-badge admin-badge-red">SUSPENDED</span>
                    ) : u.status === 'expired' ? (
                      <span className="admin-badge admin-badge-red">EXPIRED</span>
                    ) : (
                      <span className="admin-badge admin-badge-green">ACTIVE</span>
                    )}
                  </td>
                  <td>
                    {formatExpiry(u)}
                  </td>
                  <td className="text-secondary" style={{ fontSize: '0.75rem' }}>
                    {u.created_at ? new Date(u.created_at).toLocaleDateString() : '—'}
                  </td>
                  <td>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '0.35rem', justifyContent: 'flex-end' }}>
                      <button
                        type="button"
                        className="btn btn-primary btn-xs"
                        onClick={() => handleOpenInbox(u)}
                        title={`Open and inspect ${u.username}'s inbox in new tab`}
                        style={{ display: 'inline-flex', alignItems: 'center', gap: '0.25rem', padding: '0.2rem 0.5rem', fontWeight: 600 }}
                      >
                        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M22 13V6a2 2 0 0 0-2-2H4a2 2 0 0 0-2 2v12c0 1.1.9 2 2 2h9"/><path d="m22 7-8.97 5.7a1.94 1.94 0 0 1-2.06 0L2 7"/></svg>
                        <span>Open Inbox</span>
                      </button>

                      {u.tier !== 'public' && (
                        <button
                          type="button"
                          className="btn btn-secondary btn-xs"
                          onClick={() => setResetPwUser(u)}
                          title="Reset mailbox password"
                          style={{ padding: '0.2rem 0.45rem' }}
                        >
                          Reset PW
                        </button>
                      )}

                      {u.tier !== 'public' && (
                        <button
                          type="button"
                          className="btn btn-ghost btn-xs"
                          onClick={() => setEditUser(u)}
                          title="Edit user details"
                          style={{ padding: '0.2rem 0.45rem' }}
                        >
                          Edit
                        </button>
                      )}

                      <button
                        type="button"
                        className={`btn ${u.is_suspended || u.status === 'suspended' ? 'btn-primary' : 'btn-ghost'} btn-xs`}
                        onClick={() => toggleSuspend(u)}
                        title={u.is_suspended || u.status === 'suspended' ? 'Reactivate account' : 'Suspend account'}
                        style={{ padding: '0.2rem 0.45rem' }}
                      >
                        {u.is_suspended || u.status === 'suspended' ? 'Unsuspend' : 'Suspend'}
                      </button>

                      <button
                        type="button"
                        className="btn btn-ghost btn-xs"
                        onClick={() => setDeleteUserTarget(u)}
                        title="Permanently delete user and mailbox"
                        style={{ color: 'var(--color-error)', padding: '0.2rem 0.45rem' }}
                      >
                        <svg width='12' height='12' viewBox='0 0 24 24' fill='none' stroke='currentColor' strokeWidth='2' strokeLinecap='round' strokeLinejoin='round'><path d='M3 6h18'/><path d='M19 6v14c0 1-1 2-2 2H7c-1 0-2-1-2-2V6'/><path d='M8 6V4c0-1 1-2 2-2h4c1 0 2 1 2 2v2'/></svg>
                      </button>
                    </div>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      {/* ── Create User Modal ─────────────────────────────── */}
      {showCreateModal && (
        <CreateUserModal
          onClose={() => setShowCreateModal(false)}
          onCreated={(newUser) => {
            setShowCreateModal(false);
            fetchUsers();
            if (window.WoxToast) window.WoxToast.success(`Created account for ${newUser.username}`);
          }}
        />
      )}

      {/* ── Edit User Modal ───────────────────────────────── */}
      {editUser && (
        <EditUserModal
          user={editUser}
          onClose={() => setEditUser(null)}
          onUpdated={(updated) => {
            setEditUser(null);
            fetchUsers();
            if (window.WoxToast) window.WoxToast.success(`User ${updated.username} updated`);
          }}
        />
      )}

      {/* ── Reset Password Modal ──────────────────────────── */}
      {resetPwUser && (
        <ResetPasswordModal
          user={resetPwUser}
          onClose={() => setResetPwUser(null)}
        />
      )}

      {/* ── Delete User Confirmation Modal ────────────────── */}
      {deleteUserTarget && (
        <DeleteUserModal
          user={deleteUserTarget}
          onClose={() => setDeleteUserTarget(null)}
          onDeleted={(deletedId) => {
            setDeleteUserTarget(null);
            fetchUsers();
            if (window.WoxToast) window.WoxToast.success('Mailbox deleted successfully');
          }}
        />
      )}
    </div>
  );
}

// ─── Modal Subcomponents ────────────────────────────────────

function CreateUserModal({ onClose, onCreated }) {
  const [tier, setTier] = useState('permanent'); // 'permanent' | 'personal'
  const [username, setUsername] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [displayName, setDisplayName] = useState('');
  const [expiryHours, setExpiryHours] = useState(720); // 30 days default
  const [isAdmin, setIsAdmin] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');

  const generateRandomPassword = () => {
    const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnpqrstuvwxyz23456789!@#$%^&*';
    let res = '';
    for (let i = 0; i < 14; i++) res += chars.charAt(Math.floor(Math.random() * chars.length));
    setPassword(res);
  };

  const domain = tier === 'personal' ? 'mail.wox.world' : 'wox.world';

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!username.trim() || !password.trim()) {
      setError('Username and password are required');
      return;
    }
    setSubmitting(true);
    setError('');
    try {
      const res = await post('/admin/users', {
        tier,
        username: username.trim(),
        email: email.trim() || undefined,
        password: password.trim(),
        displayName: displayName.trim() || undefined,
        isAdmin: tier === 'permanent' ? isAdmin : false,
        expiryHours: tier === 'personal' ? Number(expiryHours) : undefined,
      });
      if (res.user) {
        onCreated(res.user);
      } else {
        setError(res.error || 'Failed to create user');
      }
    } catch (err) {
      setError(err.message);
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="compose-overlay" onClick={onClose}>
      <div className="compose-modal card" style={{ maxWidth: 520 }} onClick={(e) => e.stopPropagation()}>
        <div className="compose-header">
          <h3>Create New Mailbox Account</h3>
          <button type="button" className="btn btn-ghost btn-xs" onClick={onClose}>✕</button>
        </div>

        <form onSubmit={handleSubmit} style={{ padding: '1.25rem', display: 'flex', flexDirection: 'column', gap: '0.875rem' }}>
          {error && <div className="admin-badge admin-badge-red" style={{ padding: '0.5rem', width: '100%' }}>{error}</div>}

          {/* Account Tier Toggle */}
          <div>
            <label style={{ fontSize: '0.75rem', fontWeight: 600, color: 'var(--color-text-secondary)', display: 'block', marginBottom: '0.4rem' }}>
              ACCOUNT TIER
            </label>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.5rem' }}>
              <button
                type="button"
                className={`btn btn-sm ${tier === 'permanent' ? 'btn-primary' : 'btn-secondary'}`}
                onClick={() => {
                  setTier('permanent');
                  setEmail(username ? `${username.toLowerCase()}@wox.world` : '');
                }}
                style={{ justifyContent: 'center' }}
              >
                Permanent (@wox.world)
              </button>
              <button
                type="button"
                className={`btn btn-sm ${tier === 'personal' ? 'btn-primary' : 'btn-secondary'}`}
                onClick={() => {
                  setTier('personal');
                  setEmail(username ? `${username.toLowerCase()}@mail.wox.world` : '');
                }}
                style={{ justifyContent: 'center' }}
              >
                Personal Temp (@mail.wox.world)
              </button>
            </div>
          </div>

          <div>
            <label style={{ fontSize: '0.75rem', fontWeight: 600, color: 'var(--color-text-secondary)', display: 'block', marginBottom: '0.25rem' }}>Username *</label>
            <input
              className="input"
              placeholder="e.g. johndoe"
              value={username}
              onChange={(e) => {
                setUsername(e.target.value);
                setEmail(`${e.target.value.toLowerCase()}@${domain}`);
              }}
              required
            />
          </div>

          <div>
            <label style={{ fontSize: '0.75rem', fontWeight: 600, color: 'var(--color-text-secondary)', display: 'block', marginBottom: '0.25rem' }}>Email Address</label>
            <input
              className="input mono"
              placeholder={`johndoe@${domain}`}
              value={email}
              onChange={(e) => setEmail(e.target.value)}
            />
          </div>

          {tier === 'personal' && (
            <div>
              <label style={{ fontSize: '0.75rem', fontWeight: 600, color: 'var(--color-text-secondary)', display: 'block', marginBottom: '0.25rem' }}>Lifespan / Retention Duration</label>
              <select className="input" value={expiryHours} onChange={(e) => setExpiryHours(Number(e.target.value))}>
                <option value="24">24 Hours (1 Day)</option>
                <option value="168">7 Days (1 Week)</option>
                <option value="720">30 Days (Recommended)</option>
                <option value="1440">60 Days (Maximum Lifetime)</option>
              </select>
            </div>
          )}

          <div>
            <label style={{ fontSize: '0.75rem', fontWeight: 600, color: 'var(--color-text-secondary)', display: 'block', marginBottom: '0.25rem' }}>Display Name</label>
            <input
              className="input"
              placeholder={tier === 'personal' ? 'Personal Disposable Mailbox' : 'e.g. John Doe'}
              value={displayName}
              onChange={(e) => setDisplayName(e.target.value)}
            />
          </div>

          <div>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.25rem' }}>
              <label style={{ fontSize: '0.75rem', fontWeight: 600, color: 'var(--color-text-secondary)' }}>Password * (min 6 chars)</label>
              <button type="button" className="btn-link" style={{ fontSize: '0.75rem', color: 'var(--color-primary-light)' }} onClick={generateRandomPassword}>Generate Strong</button>
            </div>
            <input
              className="input mono"
              type="text"
              placeholder="Enter or generate password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
            />
          </div>

          {tier === 'permanent' && (
            <label style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', cursor: 'pointer', marginTop: '0.25rem', fontSize: '0.8125rem' }}>
              <input
                type="checkbox"
                checked={isAdmin}
                onChange={(e) => setIsAdmin(e.target.checked)}
              />
              <span>Grant Super Administrator privileges</span>
            </label>
          )}

          <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '0.5rem', marginTop: '0.75rem' }}>
            <button type="button" className="btn btn-secondary btn-sm" onClick={onClose} disabled={submitting}>Cancel</button>
            <button type="submit" className="btn btn-primary btn-sm" disabled={submitting}>
              {submitting ? 'Provisioning...' : `Create ${tier === 'personal' ? 'Personal Temp' : 'Permanent'} Account`}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

function EditUserModal({ user, onClose, onUpdated }) {
  const [username, setUsername] = useState(user.username || '');
  const [email, setEmail] = useState(user.email || '');
  const [displayName, setDisplayName] = useState(user.display_name || '');
  const [isAdmin, setIsAdmin] = useState(Boolean(user.is_admin));
  const [isSuspended, setIsSuspended] = useState(Boolean(user.is_suspended));
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');

  const handleSubmit = async (e) => {
    e.preventDefault();
    setSubmitting(true);
    setError('');
    try {
      const res = await put(`/admin/users/${user.id}`, {
        username: username.trim(),
        email: email.trim(),
        displayName: displayName.trim(),
        is_admin: isAdmin,
        is_suspended: isSuspended,
      });
      if (res.user) {
        onUpdated(res.user);
      } else {
        setError(res.error || 'Failed to update user');
      }
    } catch (err) {
      setError(err.message);
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="compose-overlay" onClick={onClose}>
      <div className="compose-modal card" style={{ maxWidth: 500 }} onClick={(e) => e.stopPropagation()}>
        <div className="compose-header">
          <h3>Edit User: {user.username}</h3>
          <button type="button" className="btn btn-ghost btn-xs" onClick={onClose}>✕</button>
        </div>

        <form onSubmit={handleSubmit} style={{ padding: '1.25rem', display: 'flex', flexDirection: 'column', gap: '0.875rem' }}>
          {error && <div className="admin-badge admin-badge-red" style={{ padding: '0.5rem', width: '100%' }}>{error}</div>}

          <div>
            <label style={{ fontSize: '0.75rem', fontWeight: 600, color: 'var(--color-text-secondary)', display: 'block', marginBottom: '0.25rem' }}>Username</label>
            <input
              className="input"
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              required
            />
          </div>

          <div>
            <label style={{ fontSize: '0.75rem', fontWeight: 600, color: 'var(--color-text-secondary)', display: 'block', marginBottom: '0.25rem' }}>Email Address</label>
            <input
              className="input mono"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
            />
          </div>

          <div>
            <label style={{ fontSize: '0.75rem', fontWeight: 600, color: 'var(--color-text-secondary)', display: 'block', marginBottom: '0.25rem' }}>Display Name</label>
            <input
              className="input"
              value={displayName}
              onChange={(e) => setDisplayName(e.target.value)}
            />
          </div>

          <div style={{ display: 'flex', gap: '1.5rem', marginTop: '0.25rem' }}>
            <label style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', cursor: 'pointer', fontSize: '0.8125rem' }}>
              <input
                type="checkbox"
                checked={isAdmin}
                onChange={(e) => setIsAdmin(e.target.checked)}
              />
              <span>Super Administrator</span>
            </label>

            <label style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', cursor: 'pointer', fontSize: '0.8125rem' }}>
              <input
                type="checkbox"
                checked={isSuspended}
                onChange={(e) => setIsSuspended(e.target.checked)}
              />
              <span style={{ color: isSuspended ? 'var(--color-error)' : 'inherit' }}>Account Suspended</span>
            </label>
          </div>

          <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '0.5rem', marginTop: '0.75rem' }}>
            <button type="button" className="btn btn-secondary btn-sm" onClick={onClose} disabled={submitting}>Cancel</button>
            <button type="submit" className="btn btn-primary btn-sm" disabled={submitting}>
              {submitting ? 'Saving...' : 'Save Changes'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

function ResetPasswordModal({ user, onClose }) {
  const [newPassword, setNewPassword] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [copied, setCopied] = useState(false);
  const [successMsg, setSuccessMsg] = useState('');
  const [error, setError] = useState('');

  const generateRandomPassword = () => {
    const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnpqrstuvwxyz23456789!@#$%^&*';
    let res = '';
    for (let i = 0; i < 14; i++) res += chars.charAt(Math.floor(Math.random() * chars.length));
    setNewPassword(res);
  };

  const handleCopy = () => {
    navigator.clipboard.writeText(newPassword);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (newPassword.length < 8) {
      setError('Password must be at least 8 characters');
      return;
    }
    setSubmitting(true);
    setError('');
    try {
      const res = await post(`/admin/users/${user.id}/reset-password`, { newPassword });
      setSuccessMsg(res.message || 'Password successfully reset and sessions revoked.');
      if (window.WoxToast) window.WoxToast.success(`Password reset for ${user.username}`);
    } catch (err) {
      setError(err.message);
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="compose-overlay" onClick={onClose}>
      <div className="compose-modal card" style={{ maxWidth: 480 }} onClick={(e) => e.stopPropagation()}>
        <div className="compose-header">
          <h3>Reset Password: {user.username}</h3>
          <button type="button" className="btn btn-ghost btn-xs" onClick={onClose}>✕</button>
        </div>

        <form onSubmit={handleSubmit} style={{ padding: '1.25rem', display: 'flex', flexDirection: 'column', gap: '1rem' }}>
          {error && <div className="admin-badge admin-badge-red" style={{ padding: '0.5rem', width: '100%' }}>{error}</div>}
          {successMsg && <div className="admin-badge admin-badge-green" style={{ padding: '0.5rem', width: '100%' }}>{successMsg}</div>}

          <div>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.35rem' }}>
              <label style={{ fontSize: '0.75rem', fontWeight: 600, color: 'var(--color-text-secondary)' }}>New Password</label>
              <button type="button" className="btn-link" style={{ fontSize: '0.75rem', color: 'var(--color-primary-light)' }} onClick={generateRandomPassword}>Generate Strong</button>
            </div>
            <div style={{ display: 'flex', gap: '0.5rem' }}>
              <input
                className="input mono"
                type="text"
                placeholder="Enter new password (min 8 chars)"
                value={newPassword}
                onChange={(e) => setNewPassword(e.target.value)}
                required
              />
              <button
                type="button"
                className="btn btn-secondary btn-sm"
                onClick={handleCopy}
                disabled={!newPassword}
                style={{ flexShrink: 0 }}
              >
                {copied ? '✓' : 'Copy'}
              </button>
            </div>
          </div>

          <p className="text-secondary" style={{ fontSize: '0.75rem', margin: 0 }}>
            Resetting the password immediately revokes all active web sessions for this account.
          </p>

          <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '0.5rem', marginTop: '0.5rem' }}>
            <button type="button" className="btn btn-secondary btn-sm" onClick={onClose}>
              {successMsg ? 'Close' : 'Cancel'}
            </button>
            {!successMsg && (
              <button type="submit" className="btn btn-primary btn-sm" disabled={submitting || !newPassword}>
                {submitting ? 'Resetting...' : 'Confirm Reset Password'}
              </button>
            )}
          </div>
        </form>
      </div>
    </div>
  );
}

function DeleteUserModal({ user, onClose, onDeleted }) {
  const [confirmUsername, setConfirmUsername] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');

  const handleDelete = async (e) => {
    e.preventDefault();
    if (confirmUsername !== user.username) {
      setError(`Type "${user.username}" to confirm deletion`);
      return;
    }
    setSubmitting(true);
    setError('');
    try {
      await del(`/admin/users/${user.id}`);
      onDeleted(user.id);
    } catch (err) {
      setError(err.message);
      setSubmitting(false);
    }
  };

  return (
    <div className="compose-overlay" onClick={onClose}>
      <div className="compose-modal card" style={{ maxWidth: 460 }} onClick={(e) => e.stopPropagation()}>
        <div className="compose-header" style={{ borderBottomColor: 'rgba(239, 68, 68, 0.3)' }}>
          <h3 style={{ color: 'var(--color-error)' }}>Delete User Account</h3>
          <button type="button" className="btn btn-ghost btn-xs" onClick={onClose}>✕</button>
        </div>

        <form onSubmit={handleDelete} style={{ padding: '1.25rem', display: 'flex', flexDirection: 'column', gap: '1rem' }}>
          {error && <div className="admin-badge admin-badge-red" style={{ padding: '0.5rem', width: '100%' }}>{error}</div>}

          <p style={{ fontSize: '0.875rem', margin: 0, lineHeight: 1.5 }}>
            Are you sure you want to permanently delete <strong>{user.username}</strong> ({user.email})?
            This will purge their mailbox, stored emails, and user records.
          </p>

          <div>
            <label style={{ fontSize: '0.75rem', fontWeight: 600, color: 'var(--color-text-secondary)', display: 'block', marginBottom: '0.25rem' }}>
              Type <strong>{user.username}</strong> to confirm:
            </label>
            <input
              className="input"
              placeholder={user.username}
              value={confirmUsername}
              onChange={(e) => setConfirmUsername(e.target.value)}
              required
            />
          </div>

          <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '0.5rem', marginTop: '0.5rem' }}>
            <button type="button" className="btn btn-secondary btn-sm" onClick={onClose} disabled={submitting}>Cancel</button>
            <button
              type="submit"
              className="btn btn-danger btn-sm"
              disabled={submitting || confirmUsername !== user.username}
            >
              {submitting ? 'Deleting...' : 'Permanently Delete User'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

// ─── Administrators Tab ─────────────────────────────────────
function AdminsTab() {
  const [admins, setAdmins] = useState([]);
  const [newEmail, setNewEmail] = useState('');
  const [msg, setMsg] = useState('');

  const loadAdmins = () => {
    get('/admin/users?limit=100').then((d) => {
      setAdmins((d.users || []).filter((u) => u.is_admin));
    });
  };

  useEffect(() => { loadAdmins(); }, []);

  const makeAdmin = async (e) => {
    e.preventDefault();
    try {
      await post('/admin/make-admin', { email: newEmail });
      setMsg(`Elevated ${newEmail} to root administrator.`);
      setNewEmail('');
      loadAdmins();
    } catch (err) {
      setMsg(err.message);
    }
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>
      <div className="card" style={{ padding: '1.5rem' }}>
        <h2 style={{ fontSize: '1.15rem', marginBottom: '0.5rem' }}>Root Administrators</h2>
        <p className="text-secondary" style={{ fontSize: '0.8125rem', marginBottom: '1.25rem' }}>
          Grant full administrative access across server configurations and user directories.
        </p>

        <form onSubmit={makeAdmin} style={{ display: 'flex', gap: '0.5rem', marginBottom: '1.5rem' }}>
          <input
            className="input"
            placeholder="admin@domain.com"
            value={newEmail}
            onChange={(e) => setNewEmail(e.target.value)}
            required
            style={{ maxWidth: 320 }}
          />
          <button type="submit" className="btn btn-primary btn-sm">Grant Admin Access</button>
        </form>

        {msg && <p className="text-secondary" style={{ fontSize: '0.8125rem' }}>{msg}</p>}

        <div className="admin-table-responsive">
          <table className="admin-data-table">
            <thead>
              <tr>
                <th>Admin Username</th>
                <th>Email Address</th>
                <th>2FA Security</th>
                <th>Created</th>
              </tr>
            </thead>
            <tbody>
              {admins.map((a) => (
                <tr key={a.id}>
                  <td><strong>{a.username}</strong></td>
                  <td className="mono">{a.email}</td>
                  <td>
                    {a.otp_enabled ? (
                      <span className="admin-badge admin-badge-green">2FA ACTIVE</span>
                    ) : (
                      <span className="admin-badge admin-badge-amber">2FA DISABLED</span>
                    )}
                  </td>
                  <td className="text-secondary">{new Date(a.created_at).toLocaleDateString()}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}

// ─── Invites Tab ────────────────────────────────────────────
function InvitesTab() {
  const [invites, setInvites] = useState([]);
  const [loading, setLoading] = useState(true);
  const [subTab, setSubTab] = useState('available'); // 'available' | 'used' | 'all'
  const [search, setSearch] = useState('');
  const [count, setCount] = useState(1);
  const [expiresInDays, setExpiresInDays] = useState(0); // 0 = never
  const [note, setNote] = useState('');
  const [generating, setGenerating] = useState(false);
  const [copiedCode, setCopiedCode] = useState(null);
  const [copiedLink, setCopiedLink] = useState(null);

  const loadInvites = () => {
    setLoading(true);
    get('/admin/invites')
      .then((d) => setInvites(d.invites || []))
      .finally(() => setLoading(false));
  };

  useEffect(() => { loadInvites(); }, []);

  const generateInvites = async (e) => {
    e.preventDefault();
    setGenerating(true);
    try {
      const res = await post('/admin/invites', {
        count: Number(count),
        expiresInDays: expiresInDays > 0 ? Number(expiresInDays) : null,
        note: note.trim() || undefined,
      });
      if (window.WoxToast) window.WoxToast.success(`Generated ${res.codes?.length || count} invitation code(s)`);
      setNote('');
      loadInvites();
    } catch (err) {
      if (window.WoxToast) window.WoxToast.error(err.message);
    } finally {
      setGenerating(false);
    }
  };

  const revokeInvite = async (code) => {
    if (!window.confirm(`Are you sure you want to permanently revoke invitation code ${code}? It will be deleted immediately and can never be used.`)) return;
    try {
      await del(`/admin/invites/${encodeURIComponent(code)}`);
      if (window.WoxToast) window.WoxToast.info(`Revoked invite code ${code}`);
      loadInvites();
    } catch (err) {
      if (window.WoxToast) window.WoxToast.error(err.message);
    }
  };

  const copyCode = (code) => {
    navigator.clipboard.writeText(code);
    setCopiedCode(code);
    if (window.WoxToast) window.WoxToast.success('Invite code copied to clipboard');
    setTimeout(() => setCopiedCode(null), 2000);
  };

  const copyRegisterLink = (code) => {
    const origin = window.location.origin;
    const link = `${origin}/register?invite=${encodeURIComponent(code)}`;
    navigator.clipboard.writeText(link);
    setCopiedLink(code);
    if (window.WoxToast) window.WoxToast.success('Direct registration link copied');
    setTimeout(() => setCopiedLink(null), 2000);
  };

  // Filter lists
  const availableInvites = invites.filter((i) => !i.is_used && !i.is_expired);
  const usedInvites = invites.filter((i) => i.is_used);
  const expiredInvites = invites.filter((i) => !i.is_used && i.is_expired);

  const displayedList = (subTab === 'available'
    ? availableInvites
    : subTab === 'used'
    ? usedInvites
    : invites
  ).filter((i) => {
    if (!search.trim()) return true;
    const q = search.toLowerCase();
    return (
      i.code.toLowerCase().includes(q) ||
      (i.note && i.note.toLowerCase().includes(q)) ||
      (i.used_by_username && i.used_by_username.toLowerCase().includes(q)) ||
      (i.used_by_email && i.used_by_email.toLowerCase().includes(q))
    );
  });

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>
      {/* Top Metrics Cards */}
      <div className="admin-kpi-grid">
        <div className="admin-kpi-card" onClick={() => setSubTab('available')} style={{ cursor: 'pointer', border: subTab === 'available' ? '1px solid var(--color-primary)' : '1px solid var(--color-border)' }}>
          <span className="admin-kpi-title">Available Unused</span>
          <div className="admin-kpi-val" style={{ color: 'var(--color-success)' }}>{availableInvites.length}</div>
          <div className="admin-kpi-sub text-secondary">Ready to distribute</div>
        </div>

        <div className="admin-kpi-card" onClick={() => setSubTab('used')} style={{ cursor: 'pointer', border: subTab === 'used' ? '1px solid var(--color-primary)' : '1px solid var(--color-border)' }}>
          <span className="admin-kpi-title">Claimed & Used</span>
          <div className="admin-kpi-val" style={{ color: 'var(--color-primary-light)' }}>{usedInvites.length}</div>
          <div className="admin-kpi-sub text-secondary">Registered accounts</div>
        </div>

        <div className="admin-kpi-card" onClick={() => setSubTab('all')} style={{ cursor: 'pointer', border: subTab === 'all' ? '1px solid var(--color-primary)' : '1px solid var(--color-border)' }}>
          <span className="admin-kpi-title">Total Generated</span>
          <div className="admin-kpi-val">{invites.length}</div>
          <div className="admin-kpi-sub text-secondary">{expiredInvites.length} Expired</div>
        </div>
      </div>

      {/* Main Generator & List Card */}
      <div className="card" style={{ padding: '1.5rem' }}>
        <h2 style={{ fontSize: '1.15rem', marginBottom: '0.5rem' }}>Registration Invitation Tokens</h2>
        <p className="text-secondary" style={{ fontSize: '0.8125rem', marginBottom: '1.5rem' }}>
          Generate cryptographic 1-time invitation tokens for gated private registration.
        </p>

        {/* Generator Form */}
        <form onSubmit={generateInvites} style={{ background: 'var(--color-bg-elevated)', padding: '1.25rem', borderRadius: 'var(--radius-md)', border: '1px solid var(--color-border)', marginBottom: '1.75rem', display: 'flex', flexDirection: 'column', gap: '0.875rem' }}>
          <div style={{ fontWeight: 600, fontSize: '0.875rem', display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2"/></svg>
            <span>Batch Invite Generator</span>
          </div>
          <div style={{ display: 'flex', gap: '0.75rem', alignItems: 'center', flexWrap: 'wrap' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
              <label style={{ fontSize: '0.8125rem', color: 'var(--color-text-secondary)' }}>Quantity:</label>
              <input className="input" type="number" min="1" max="50" value={count} onChange={(e) => setCount(e.target.value)} style={{ width: 70 }} />
            </div>

            <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
              <label style={{ fontSize: '0.8125rem', color: 'var(--color-text-secondary)' }}>Lifespan:</label>
              <select className="input" value={expiresInDays} onChange={(e) => setExpiresInDays(Number(e.target.value))} style={{ width: 140 }}>
                <option value="0">Never (Permanent)</option>
                <option value="1">24 Hours</option>
                <option value="7">7 Days</option>
                <option value="30">30 Days</option>
                <option value="90">90 Days</option>
              </select>
            </div>

            <div style={{ flex: 1, minWidth: 200 }}>
              <input className="input" placeholder="Optional admin note (e.g. VIP Founders, Team onboarding)" value={note} onChange={(e) => setNote(e.target.value)} />
            </div>

            <button type="submit" className="btn btn-primary btn-sm" disabled={generating}>
              {generating ? 'Generating...' : '+ Generate Invite Codes'}
            </button>
          </div>
        </form>

        {/* Tab & Search Filter Toolstrip */}
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1rem', flexWrap: 'wrap', gap: '0.75rem' }}>
          <div style={{ display: 'flex', gap: '0.4rem' }}>
            <button
              type="button"
              className={`btn btn-sm ${subTab === 'available' ? 'btn-primary' : 'btn-secondary'}`}
              onClick={() => setSubTab('available')}
            >
              Available Unused ({availableInvites.length})
            </button>
            <button
              type="button"
              className={`btn btn-sm ${subTab === 'used' ? 'btn-primary' : 'btn-secondary'}`}
              onClick={() => setSubTab('used')}
            >
              Claimed & Used ({usedInvites.length})
            </button>
            <button
              type="button"
              className={`btn btn-sm ${subTab === 'all' ? 'btn-primary' : 'btn-secondary'}`}
              onClick={() => setSubTab('all')}
            >
              All Records ({invites.length})
            </button>
          </div>

          <input
            className="input"
            placeholder="Search code, note, username..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            style={{ maxWidth: 260 }}
          />
        </div>

        {/* Table Content */}
        <div className="admin-table-responsive">
          <table className="admin-data-table">
            <thead>
              <tr>
                <th>Invite Code</th>
                {subTab === 'used' ? (
                  <>
                    <th>Redeemed By</th>
                    <th>Claimed At</th>
                  </>
                ) : (
                  <>
                    <th>Quick Share</th>
                    <th>Expires</th>
                  </>
                )}
                <th>Admin Note</th>
                <th>Status</th>
                <th>Actions</th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr>
                  <td colSpan={6} style={{ textAlign: 'center', padding: '2rem' }}>
                    <div className="skeleton" style={{ height: '1.5rem', width: '60%', margin: '0 auto' }} />
                  </td>
                </tr>
              ) : displayedList.length === 0 ? (
                <tr>
                  <td colSpan={6} style={{ textAlign: 'center', padding: '2rem', color: 'var(--color-text-secondary)' }}>
                    {search ? 'No invite codes match your search criteria.' : subTab === 'available' ? 'No available unused invite codes. Generate a new batch above.' : subTab === 'used' ? 'No invite codes have been redeemed yet.' : 'No invite codes recorded.'}
                  </td>
                </tr>
              ) : (
                displayedList.map((inv) => {
                  const isClaimed = inv.is_used;
                  const isExpired = !inv.is_used && inv.is_expired;
                  return (
                    <tr key={inv.id}>
                      <td className="mono" style={{ fontWeight: 700, color: 'var(--color-primary-light)', fontSize: '0.9rem' }}>
                        {inv.code}
                      </td>

                      {subTab === 'used' ? (
                        <>
                          <td>
                            <strong>{inv.used_by_username || `User #${inv.used_by}`}</strong>
                            {inv.used_by_email && (
                              <div className="text-secondary mono" style={{ fontSize: '0.75rem' }}>{inv.used_by_email}</div>
                            )}
                          </td>
                          <td className="text-secondary">{inv.used_at ? new Date(inv.used_at).toLocaleString() : 'N/A'}</td>
                        </>
                      ) : (
                        <>
                          <td>
                            <div style={{ display: 'flex', gap: '0.35rem' }}>
                              <button
                                type="button"
                                className="btn btn-secondary btn-xs"
                                onClick={() => copyCode(inv.code)}
                                title="Copy raw code"
                              >
                                {copiedCode === inv.code ? '✓ Code' : 'Copy Code'}
                              </button>
                              <button
                                type="button"
                                className="btn btn-secondary btn-xs"
                                onClick={() => copyRegisterLink(inv.code)}
                                title="Copy 1-click register URL"
                              >
                                {copiedLink === inv.code ? '✓ Link' : 'Copy Link'}
                              </button>
                            </div>
                          </td>
                          <td className="text-secondary" style={{ fontSize: '0.8125rem' }}>
                            {inv.expires_at ? new Date(inv.expires_at).toLocaleDateString() : 'Never (Permanent)'}
                          </td>
                        </>
                      )}

                      <td className="text-secondary" style={{ fontSize: '0.8125rem' }}>
                        {inv.note || '—'}
                      </td>

                      <td>
                        {isClaimed ? (
                          <span className="admin-badge admin-badge-purple">CLAIMED</span>
                        ) : isExpired ? (
                          <span className="admin-badge admin-badge-red">EXPIRED</span>
                        ) : (
                          <span className="admin-badge admin-badge-green">AVAILABLE</span>
                        )}
                      </td>

                      <td>
                        <button
                          type="button"
                          className="btn btn-ghost btn-xs"
                          onClick={() => revokeInvite(inv.code)}
                          style={{ color: 'var(--color-error)' }}
                          title="Revoke and delete this invite code"
                        >
                          Revoke
                        </button>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>

        {/* Revocation Protocol Notice Box */}
        <div style={{ marginTop: '1.5rem', background: 'rgba(124, 58, 237, 0.08)', border: '1px solid rgba(124, 58, 237, 0.25)', borderRadius: 'var(--radius-md)', padding: '1rem', fontSize: '0.8125rem' }}>
          <strong>Revocation Protocol:</strong> Revoking an unused invite code immediately purges it from the active authorization registry. Any subsequent attempt to register with that code will be rejected instantly (<code>"Invalid or expired invitation code"</code>). Revoking an already-used code closes the token while preserving the registered user's existing account.
        </div>
      </div>
    </div>
  );
}

// ─── IP Firewall Tab ────────────────────────────────────────
function IpsTab() {
  const [blockedIps, setBlockedIps] = useState([]);
  const [ip, setIp] = useState('');
  const [reason, setReason] = useState('');

  const loadIps = () => {
    get('/admin/blocked-ips').then((d) => setBlockedIps(d.blockedIps || []));
  };

  useEffect(() => { loadIps(); }, []);

  const blockIp = async (e) => {
    e.preventDefault();
    await post('/admin/blocked-ips', { ip, reason });
    setIp('');
    setReason('');
    loadIps();
  };

  const unblockIp = async (id) => {
    await del(`/admin/blocked-ips/${id}`);
    loadIps();
  };

  return (
    <div className="card" style={{ padding: '1.5rem' }}>
      <h2 style={{ fontSize: '1.15rem', marginBottom: '0.5rem' }}>IP Firewall & Anti-Abuse Shield</h2>
      <p className="text-secondary" style={{ fontSize: '0.8125rem', marginBottom: '1.25rem' }}>
        Block malicious IP addresses from accessing the webmail and API gateways.
      </p>

      <form onSubmit={blockIp} style={{ display: 'flex', gap: '0.75rem', marginBottom: '1.5rem', flexWrap: 'wrap' }}>
        <input className="input" placeholder="IP Address (e.g. 192.168.1.1)" value={ip} onChange={(e) => setIp(e.target.value)} required style={{ maxWidth: 220 }} />
        <input className="input" placeholder="Reason (e.g. Brute force attack)" value={reason} onChange={(e) => setReason(e.target.value)} style={{ maxWidth: 300 }} />
        <button type="submit" className="btn btn-danger btn-sm">Block IP Address</button>
      </form>

      <div className="admin-table-responsive">
        <table className="admin-data-table">
          <thead>
            <tr>
              <th>Blocked IP</th>
              <th>Reason</th>
              <th>Blocked At</th>
              <th>Actions</th>
            </tr>
          </thead>
          <tbody>
            {blockedIps.map((b) => (
              <tr key={b.id}>
                <td className="mono" style={{ color: 'var(--color-error)', fontWeight: 700 }}>{b.ip_address}</td>
                <td>{b.reason || 'Manual block'}</td>
                <td className="text-secondary">{new Date(b.created_at).toLocaleString()}</td>
                <td>
                  <button type="button" className="btn btn-ghost btn-xs" onClick={() => unblockIp(b.id)}>
                    Unblock
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

// ─── Temp Mail Pool Tab ─────────────────────────────────────
function PoolTab() {
  const [stats, setStats] = useState(null);
  const [topupCount, setTopupCount] = useState(5);
  const [loading, setLoading] = useState(false);
  const [purging, setPurging] = useState(false);

  const loadStats = () => {
    get('/admin/pool').then((d) => setStats(d.pool || d));
  };

  useEffect(() => { loadStats(); }, []);

  const triggerTopup = async () => {
    setLoading(true);
    try {
      await post('/admin/pool/replenish', { count: topupCount });
      if (window.WoxToast) window.WoxToast.success('Standby pool topped up successfully');
      loadStats();
    } catch (err) {
      if (window.WoxToast) window.WoxToast.error(err.message);
    } finally {
      setLoading(false);
    }
  };

  const triggerPurgeAllAndRecreate = async () => {
    if (!window.confirm('WARNING: This will immediately PURGE ALL existing public temp mail addresses from Purelymail and the database, and generate a brand-new pool of 20 mailboxes with a fresh 48-hour lifespan. Proceed?')) {
      return;
    }
    setPurging(true);
    try {
      const res = await post('/admin/pool/purge-all', { lifespanHours: 48, targetSize: 20 });
      if (window.WoxToast) window.WoxToast.success(res.message || 'All temp pool mailboxes purged and 48h pool regenerated in Purelymail!');
      loadStats();
    } catch (err) {
      if (window.WoxToast) window.WoxToast.error('Purge failed: ' + err.message);
    } finally {
      setPurging(false);
    }
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>
      <div className="card" style={{ padding: '1.5rem' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap', gap: '1rem', marginBottom: '1.5rem' }}>
          <div>
            <h2 style={{ fontSize: '1.2rem', marginBottom: '0.4rem', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
              <span>Disposable Temp Mail Standby Pool</span>
              <span className="admin-badge admin-badge-purple">48-Hour Cycle</span>
            </h2>
            <p className="text-secondary" style={{ fontSize: '0.8125rem', margin: 0 }}>
              Pre-warmed Purelymail mailboxes ready for instant disposable allocation with continuous 48-hour automated cycling.
            </p>
          </div>

          <button
            type="button"
            className="btn btn-danger btn-sm"
            onClick={triggerPurgeAllAndRecreate}
            disabled={purging}
            style={{ fontWeight: 600, display: 'inline-flex', alignItems: 'center', gap: '0.4rem', boxShadow: 'var(--shadow-sm)' }}
          >
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M3 6h18"/><path d="M19 6v14c0 1-1 2-2 2H7c-1 0-2-1-2-2V6"/><polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2"/></svg>
            <span>{purging ? 'Purging Purelymail & Regenerating...' : 'Purge All & Regenerate 48h Pool'}</span>
          </button>
        </div>

        {stats && (
          <div className="admin-kpi-grid" style={{ marginBottom: '1.75rem' }}>
            <div className="admin-kpi-card">
              <span className="admin-kpi-title">Available Ready (Hot)</span>
              <div className="admin-kpi-val" style={{ color: 'var(--color-success)' }}>{stats.available || 0}</div>
              <div className="admin-kpi-sub text-secondary">Instant allocation</div>
            </div>
            <div className="admin-kpi-card">
              <span className="admin-kpi-title">Active Claimed</span>
              <div className="admin-kpi-val" style={{ color: 'var(--color-primary-light)' }}>{stats.active || 0}</div>
              <div className="admin-kpi-sub text-secondary">In active session</div>
            </div>
            <div className="admin-kpi-card">
              <span className="admin-kpi-title">Lifespan / Target</span>
              <div className="admin-kpi-val">48h / 20</div>
              <div className="admin-kpi-sub text-secondary">Auto-recycled cron</div>
            </div>
            <div className="admin-kpi-card">
              <span className="admin-kpi-title">Total in DB</span>
              <div className="admin-kpi-val">{stats.total || (stats.available + stats.active + (stats.expired || 0))}</div>
              <div className="admin-kpi-sub text-secondary">{stats.expired || 0} Expired</div>
            </div>
          </div>
        )}

        <div style={{ background: 'var(--color-bg-elevated)', padding: '1.25rem', borderRadius: 'var(--radius-md)', border: '1px solid var(--color-border)', marginBottom: '1.5rem', display: 'flex', flexDirection: 'column', gap: '0.875rem' }}>
          <div style={{ fontWeight: 600, fontSize: '0.875rem', display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2"/></svg>
            <span>Manual Top-Up Provisioning</span>
          </div>
          <div style={{ display: 'flex', gap: '0.75rem', alignItems: 'center', flexWrap: 'wrap' }}>
            <label style={{ fontSize: '0.8125rem', color: 'var(--color-text-secondary)' }}>Add addresses:</label>
            <input className="input" type="number" min="1" max="20" value={topupCount} onChange={(e) => setTopupCount(e.target.value)} style={{ width: 80 }} />
            <button type="button" className="btn btn-primary btn-sm" onClick={triggerTopup} disabled={loading}>
              {loading ? 'Provisioning Purelymail...' : 'Top Up Standby Pool'}
            </button>
          </div>
        </div>

        {/* Continuous 48-Hour Cycle Architecture Box */}
        <div style={{ background: 'rgba(124, 58, 237, 0.08)', border: '1px solid rgba(124, 58, 237, 0.25)', borderRadius: 'var(--radius-md)', padding: '1rem 1.25rem', fontSize: '0.8125rem', lineHeight: 1.6 }}>
          <div style={{ fontWeight: 700, marginBottom: '0.35rem', color: 'var(--color-primary-light)', display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M21 12a9 9 0 0 0-9-9 9.75 9.75 0 0 0-6.74 2.74L3 8"/><path d="M3 3v5h5"/><path d="M3 12a9 9 0 0 0 9 9 9.75 9.75 0 0 0 6.74-2.74L21 16"/><path d="M16 21h5v-5"/></svg>
            <span>Automated 48-Hour Cycle & Purelymail Sync Protocol</span>
          </div>
          <div>
            Every 15 minutes, the background daemon inspects the pool. Any pool address that exceeds its 48-hour expiration window is <strong>permanently deleted from Purelymail API</strong> and purged from the database. The system then automatically provisions fresh mailboxes to maintain a hot standby capacity of <strong>20 ready inboxes</strong> at all times.
          </div>
        </div>
      </div>
    </div>
  );
}

// ─── Broadcast Services Tab ─────────────────────────────────
function ServicesTab() {
  const [services, setServices] = useState([]);
  const [loading, setLoading] = useState(true);
  const [newServiceName, setNewServiceName] = useState('');
  const [newDomains, setNewDomains] = useState('');
  const [submitting, setSubmitting] = useState(false);

  const loadServices = () => {
    setLoading(true);
    get('/admin/services')
      .then((d) => setServices(d.services || []))
      .finally(() => setLoading(false));
  };

  useEffect(() => { loadServices(); }, []);

  const handleToggleTier = async (serviceId, tier, currentValue) => {
    try {
      const field = `${tier}_enabled`;
      await put(`/admin/services/${serviceId}`, { [field]: !currentValue });
      if (window.WoxToast) window.WoxToast.success('Service policy updated');
      loadServices();
    } catch (err) {
      if (window.WoxToast) window.WoxToast.error(err.message);
    }
  };

  const handleAddService = async (e) => {
    e.preventDefault();
    if (!newServiceName.trim() || !newDomains.trim()) return;
    setSubmitting(true);
    try {
      const domainsArr = newDomains.split(',').map((d) => d.trim()).filter(Boolean);
      await post('/admin/services', {
        service_name: newServiceName.trim(),
        service_domains: domainsArr,
        public_enabled: true,
        personal_enabled: true,
        permanent_enabled: true,
      });
      setNewServiceName('');
      setNewDomains('');
      if (window.WoxToast) window.WoxToast.success(`Created rule for ${newServiceName}`);
      loadServices();
    } catch (err) {
      if (window.WoxToast) window.WoxToast.error(err.message);
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>
      <div className="card" style={{ padding: '1.5rem' }}>
        <h2 style={{ fontSize: '1.15rem', marginBottom: '0.5rem' }}>Service Control & Domain Firewall Rules</h2>
        <p className="text-secondary" style={{ fontSize: '0.8125rem', marginBottom: '1.5rem' }}>
          Define which third-party sender domains are permitted across Public Disposable, Personal Temp, and Sovereign Permanent mailboxes.
        </p>

        <form onSubmit={handleAddService} style={{ display: 'flex', gap: '0.75rem', marginBottom: '1.5rem', flexWrap: 'wrap' }}>
          <input
            className="input"
            placeholder="Service Name (e.g. PayPal, Steam)"
            value={newServiceName}
            onChange={(e) => setNewServiceName(e.target.value)}
            required
            style={{ maxWidth: 240 }}
          />
          <input
            className="input mono"
            placeholder="Domains (comma-separated, e.g. paypal.com, service.paypal.com)"
            value={newDomains}
            onChange={(e) => setNewDomains(e.target.value)}
            required
            style={{ flex: 1, minWidth: 260 }}
          />
          <button type="submit" className="btn btn-primary btn-sm" disabled={submitting}>
            {submitting ? 'Adding...' : '+ Add Service Rule'}
          </button>
        </form>

        <div className="admin-table-responsive">
          <table className="admin-data-table">
            <thead>
              <tr>
                <th>Service Name</th>
                <th>Monitored Sender Domains</th>
                <th style={{ textAlign: 'center' }}>Public Temp</th>
                <th style={{ textAlign: 'center' }}>Personal Temp</th>
                <th style={{ textAlign: 'center' }}>Permanent Webmail</th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr>
                  <td colSpan={5} style={{ textAlign: 'center', padding: '2rem' }}>
                    <div className="skeleton" style={{ height: '1.5rem', width: '60%', margin: '0 auto' }} />
                  </td>
                </tr>
              ) : services.length === 0 ? (
                <tr>
                  <td colSpan={5} style={{ textAlign: 'center', padding: '2rem', color: 'var(--color-text-secondary)' }}>
                    No custom service filtering rules defined yet. All inbound traffic follows default mailbox policies.
                  </td>
                </tr>
              ) : (
                services.map((s) => (
                  <tr key={s.id}>
                    <td><strong>{s.service_name}</strong></td>
                    <td className="mono" style={{ fontSize: '0.75rem' }}>
                      {Array.isArray(s.service_domains) ? s.service_domains.join(', ') : s.service_domains}
                    </td>
                    <td style={{ textAlign: 'center' }}>
                      <button
                        type="button"
                        className={`admin-badge ${s.public_enabled ? 'admin-badge-green' : 'admin-badge-red'}`}
                        style={{ cursor: 'pointer', border: 'none' }}
                        onClick={() => handleToggleTier(s.id, 'public', s.public_enabled)}
                      >
                        {s.public_enabled ? 'ALLOWED' : 'BLOCKED'}
                      </button>
                    </td>
                    <td style={{ textAlign: 'center' }}>
                      <button
                        type="button"
                        className={`admin-badge ${s.personal_enabled ? 'admin-badge-green' : 'admin-badge-red'}`}
                        style={{ cursor: 'pointer', border: 'none' }}
                        onClick={() => handleToggleTier(s.id, 'personal', s.personal_enabled)}
                      >
                        {s.personal_enabled ? 'ALLOWED' : 'BLOCKED'}
                      </button>
                    </td>
                    <td style={{ textAlign: 'center' }}>
                      <button
                        type="button"
                        className={`admin-badge ${s.permanent_enabled ? 'admin-badge-green' : 'admin-badge-red'}`}
                        style={{ cursor: 'pointer', border: 'none' }}
                        onClick={() => handleToggleTier(s.id, 'permanent', s.permanent_enabled)}
                      >
                        {s.permanent_enabled ? 'ALLOWED' : 'BLOCKED'}
                      </button>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}

// ─── Diagnostics Tab ────────────────────────────────────────
function DiagnosticsTab() {
  const [diag, setDiag] = useState(null);
  const [backups, setBackups] = useState([]);
  const [loading, setLoading] = useState(true);
  const [actionLoading, setActionLoading] = useState('');

  const loadData = () => {
    setLoading(true);
    Promise.all([
      get('/admin/diagnostics/full'),
      get('/admin/backups'),
    ])
      .then(([diagData, backupData]) => {
        setDiag(diagData);
        setBackups(backupData.backups || []);
      })
      .catch((err) => {
        if (window.WoxToast) window.WoxToast.error(err.message);
      })
      .finally(() => setLoading(false));
  };

  useEffect(() => { loadData(); }, []);

  const triggerBackup = async () => {
    setActionLoading('backup');
    try {
      const res = await post('/admin/backups/create');
      if (window.WoxToast) window.WoxToast.success(res.message || 'Backup snapshot created');
      loadData();
    } catch (err) {
      if (window.WoxToast) window.WoxToast.error(err.message);
    } finally {
      setActionLoading('');
    }
  };

  const triggerVacuum = async () => {
    setActionLoading('vacuum');
    try {
      const res = await post('/admin/diagnostics/vacuum');
      if (window.WoxToast) window.WoxToast.success(res.message || 'Database vacuum complete');
      loadData();
    } catch (err) {
      if (window.WoxToast) window.WoxToast.error(err.message);
    } finally {
      setActionLoading('');
    }
  };

  const triggerFlushCache = async () => {
    setActionLoading('cache');
    try {
      const res = await post('/admin/diagnostics/flush-cache');
      if (window.WoxToast) window.WoxToast.success(res.message || 'Cache purged');
      loadData();
    } catch (err) {
      if (window.WoxToast) window.WoxToast.error(err.message);
    } finally {
      setActionLoading('');
    }
  };

  const formatUptime = (seconds) => {
    if (!seconds) return '0s';
    const hrs = Math.floor(seconds / 3600);
    const mins = Math.floor((seconds % 3600) / 60);
    const secs = Math.floor(seconds % 60);
    if (hrs > 0) return `${hrs}h ${mins}m ${secs}s`;
    if (mins > 0) return `${mins}m ${secs}s`;
    return `${secs}s`;
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>
      {/* Top Action Bar */}
      <div className="card" style={{ padding: '1.25rem', display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '1rem' }}>
        <div>
          <h2 style={{ fontSize: '1.15rem', margin: 0 }}>Cluster Diagnostics & Database Snapshot</h2>
          <p className="text-secondary" style={{ fontSize: '0.8125rem', margin: '0.25rem 0 0 0' }}>
            Live telemetry across PostgreSQL, Node.js runtime, background cron daemons, and database snapshot tools.
          </p>
        </div>
        <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap' }}>
          <a
            href="/api/admin/diagnostics/export-snapshot"
            className="btn btn-primary btn-sm"
            style={{ textDecoration: 'none', display: 'inline-flex', alignItems: 'center', gap: '0.35rem' }}
          >
            <span>Export Database (JSON)</span>
          </a>
          <button
            type="button"
            className="btn btn-secondary btn-sm"
            onClick={triggerBackup}
            disabled={Boolean(actionLoading)}
          >
            {actionLoading === 'backup' ? 'Snapshotting...' : 'Trigger Backup Snapshot'}
          </button>
          <button
            type="button"
            className="btn btn-secondary btn-sm"
            onClick={triggerVacuum}
            disabled={Boolean(actionLoading)}
          >
            {actionLoading === 'vacuum' ? 'Optimizing...' : 'Vacuum & Optimize DB'}
          </button>
          <button
            type="button"
            className="btn btn-secondary btn-sm"
            onClick={triggerFlushCache}
            disabled={Boolean(actionLoading)}
          >
            {actionLoading === 'cache' ? 'Purging...' : 'Flush Cache'}
          </button>
          <button
            type="button"
            className="btn btn-ghost btn-sm"
            onClick={loadData}
            title="Refresh diagnostics"
          >
            Refresh
          </button>
        </div>
      </div>

      {/* Cluster Vital KPI Cards */}
      {diag && (
        <div className="admin-kpi-grid">
          <div className="admin-kpi-card">
            <span className="admin-kpi-title">PostgreSQL Database</span>
            <div className="admin-kpi-val" style={{ color: 'var(--color-success)' }}>
              {diag.database?.connected ? 'ONLINE' : 'DEGRADED'}
            </div>
            <div className="admin-kpi-sub text-secondary">
              Latency: <strong>{diag.database?.latencyMs || 0}ms</strong> · Size: <strong>{diag.database?.databaseSize || 'N/A'}</strong>
            </div>
          </div>

          <div className="admin-kpi-card">
            <span className="admin-kpi-title">Node.js Server Runtime</span>
            <div className="admin-kpi-val" style={{ color: 'var(--color-primary-light)' }}>
              {diag.system?.nodeVersion || process.version}
            </div>
            <div className="admin-kpi-sub text-secondary">
              Heap: <strong>{diag.system?.heapUsedMb} MB</strong> / {diag.system?.heapTotalMb} MB (RSS: {diag.system?.rssMb} MB)
            </div>
          </div>

          <div className="admin-kpi-card">
            <span className="admin-kpi-title">Server Uptime</span>
            <div className="admin-kpi-val" style={{ color: '#38bdf8' }}>
              {formatUptime(diag.uptime)}
            </div>
            <div className="admin-kpi-sub text-secondary">
              PID: <strong>{diag.system?.pid}</strong> · Platform: <strong>{diag.system?.platform} ({diag.system?.arch})</strong>
            </div>
          </div>

          <div className="admin-kpi-card">
            <span className="admin-kpi-title">Background Cron Scheduler</span>
            <div className="admin-kpi-val" style={{ color: 'var(--color-success)' }}>
              11 JOBS ACTIVE
            </div>
            <div className="admin-kpi-sub text-secondary">
              Inbound Replies, Broadcaster, Support Desk, Dead Man, Reminders
            </div>
          </div>
        </div>
      )}

      {/* Deep Telemetry Grid: Tables & Mail Infrastructure */}
      {diag && (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(320px, 1fr))', gap: '1.5rem' }}>
          {/* Table Row Counts */}
          <div className="card" style={{ padding: '1.5rem' }}>
            <h3 style={{ fontSize: '1rem', marginBottom: '1rem', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect width="7" height="9" x="3" y="3" rx="1"/><rect width="7" height="5" x="14" y="3" rx="1"/><rect width="7" height="9" x="14" y="12" rx="1"/><rect width="7" height="5" x="3" y="16" rx="1"/></svg>
              <span>PostgreSQL Table Statistics</span>
            </h3>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.65rem' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', paddingBottom: '0.4rem', borderBottom: '1px solid var(--color-border)' }}>
                <span className="text-secondary">Registered Users</span>
                <strong>{diag.database?.tables?.users || 0}</strong>
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between', paddingBottom: '0.4rem', borderBottom: '1px solid var(--color-border)' }}>
                <span className="text-secondary">Active Temp Mailboxes</span>
                <strong>{diag.database?.tables?.temp_addresses || 0}</strong>
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between', paddingBottom: '0.4rem', borderBottom: '1px solid var(--color-border)' }}>
                <span className="text-secondary">Invitation Codes</span>
                <strong>{diag.database?.tables?.invites || 0}</strong>
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between', paddingBottom: '0.4rem', borderBottom: '1px solid var(--color-border)' }}>
                <span className="text-secondary">IP Firewall Blocks</span>
                <strong style={{ color: 'var(--color-error)' }}>{diag.database?.tables?.blocked_ips || 0}</strong>
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between', paddingBottom: '0.4rem', borderBottom: '1px solid var(--color-border)' }}>
                <span className="text-secondary">Audit Trail Records</span>
                <strong>{diag.database?.tables?.audit_logs || 0}</strong>
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                <span className="text-secondary">Service Firewall Rules</span>
                <strong>{diag.database?.tables?.service_controls || 0}</strong>
              </div>
            </div>
          </div>

          {/* Mail Server Configurations */}
          <div className="card" style={{ padding: '1.5rem' }}>
            <h3 style={{ fontSize: '1rem', marginBottom: '1rem', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M22 13V6a2 2 0 0 0-2-2H4a2 2 0 0 0-2 2v12c0 1.1.9 2 2 2h9"/><path d="m22 7-8.97 5.7a1.94 1.94 0 0 1-2.06 0L2 7"/></svg>
              <span>Mail Gateway & Purelymail Routing</span>
            </h3>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.65rem' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', paddingBottom: '0.4rem', borderBottom: '1px solid var(--color-border)' }}>
                <span className="text-secondary">Permanent Domain</span>
                <strong className="mono">{diag.mailServers?.permanentDomain}</strong>
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between', paddingBottom: '0.4rem', borderBottom: '1px solid var(--color-border)' }}>
                <span className="text-secondary">Disposable Domain</span>
                <strong className="mono">{diag.mailServers?.tempDomain}</strong>
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between', paddingBottom: '0.4rem', borderBottom: '1px solid var(--color-border)' }}>
                <span className="text-secondary">Inbound IMAP Host</span>
                <strong className="mono">{diag.mailServers?.imapHost}:{diag.mailServers?.imapPort}</strong>
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between', paddingBottom: '0.4rem', borderBottom: '1px solid var(--color-border)' }}>
                <span className="text-secondary">Outbound SMTP Host</span>
                <strong className="mono">{diag.mailServers?.smtpHost}:{diag.mailServers?.smtpPort}</strong>
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                <span className="text-secondary">Purelymail API Link</span>
                <span className={`admin-badge ${diag.mailServers?.purelymailApiConfigured ? 'admin-badge-green' : 'admin-badge-amber'}`}>
                  {diag.mailServers?.purelymailApiConfigured ? 'AUTHENTICATED' : 'DEV SIMULATION'}
                </span>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Stored Database Backup Archives */}
      <div className="card" style={{ padding: '1.5rem' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1rem' }}>
          <div>
            <h3 style={{ fontSize: '1rem', margin: 0 }}>Database Backup Snapshots</h3>
            <p className="text-secondary" style={{ fontSize: '0.8125rem', margin: '0.2rem 0 0 0' }}>
              Locally archived point-in-time database snapshots stored in <code>/backups</code>.
            </p>
          </div>
          <button
            type="button"
            className="btn btn-primary btn-sm"
            onClick={triggerBackup}
            disabled={Boolean(actionLoading)}
          >
            + Create New Snapshot
          </button>
        </div>

        <div className="admin-table-responsive">
          <table className="admin-data-table">
            <thead>
              <tr>
                <th>Snapshot Filename</th>
                <th>File Size</th>
                <th>Created Timestamp</th>
                <th>Actions</th>
              </tr>
            </thead>
            <tbody>
              {backups.length === 0 ? (
                <tr>
                  <td colSpan={4} style={{ textAlign: 'center', padding: '2rem', color: 'var(--color-text-secondary)' }}>
                    No backup files found yet. Click <strong>"Trigger Backup Snapshot"</strong> or <strong>"Export Database (JSON)"</strong> above to generate your first snapshot.
                  </td>
                </tr>
              ) : (
                backups.map((b) => (
                  <tr key={b.filename}>
                    <td className="mono"><strong>{b.filename}</strong></td>
                    <td>{b.sizeKb} KB</td>
                    <td className="text-secondary">{new Date(b.createdAt).toLocaleString()}</td>
                    <td>
                      <a
                        href={`/api/admin/backups/download/${encodeURIComponent(b.filename)}`}
                        className="btn btn-secondary btn-xs"
                        style={{ textDecoration: 'none', display: 'inline-flex', alignItems: 'center', gap: '0.35rem' }}
                      >
                        <span>Download</span>
                      </a>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}

// ─── Global Settings Tab ────────────────────────────────────
function SettingsTab() {
  const [settings, setSettings] = useState([]);
  const [loading, setLoading] = useState(true);
  const [formData, setFormData] = useState({});
  const [saving, setSaving] = useState(false);

  const loadSettings = () => {
    setLoading(true);
    get('/admin/settings')
      .then((d) => {
        setSettings(d.settings || []);
        const map = {};
        (d.settings || []).forEach((s) => {
          map[s.key] = s.value;
        });
        setFormData(map);
      })
      .finally(() => setLoading(false));
  };

  useEffect(() => { loadSettings(); }, []);

  const handleChange = (key, value) => {
    setFormData((prev) => ({ ...prev, [key]: value }));
  };

  const handleSave = async (e) => {
    e.preventDefault();
    setSaving(true);
    try {
      await put('/admin/settings', { settings: formData });
      if (window.WoxToast) window.WoxToast.success('Global settings saved successfully');
      loadSettings();
    } catch (err) {
      if (window.WoxToast) window.WoxToast.error(err.message);
    } finally {
      setSaving(false);
    }
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>
      <div className="card" style={{ padding: '1.5rem' }}>
        <h2 style={{ fontSize: '1.15rem', marginBottom: '0.5rem' }}>Global Sovereign System Settings</h2>
        <p className="text-secondary" style={{ fontSize: '0.8125rem', marginBottom: '1.5rem' }}>
          Configure platform-wide registration policies, invite-only enforcement, disposable lifetimes, and rate limiters.
        </p>

        {loading ? (
          <div className="skeleton" style={{ height: 200, width: '100%' }} />
        ) : (
          <form onSubmit={handleSave} style={{ display: 'flex', flexDirection: 'column', gap: '1.25rem' }}>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(320px, 1fr))', gap: '1.25rem' }}>
              {settings.map((s) => (
                <div key={s.key} style={{ background: 'var(--color-bg-elevated)', padding: '1rem', borderRadius: 'var(--radius-md)', border: '1px solid var(--color-border)' }}>
                  <label style={{ fontSize: '0.8125rem', fontWeight: 700, display: 'block', marginBottom: '0.25rem' }}>
                    {s.key.replace(/_/g, ' ').toUpperCase()}
                  </label>
                  <p className="text-secondary" style={{ fontSize: '0.75rem', marginBottom: '0.6rem' }}>
                    {s.description || 'System configuration variable'}
                  </p>
                  {s.value === 'true' || s.value === 'false' ? (
                    <select
                      className="input"
                      value={String(formData[s.key] ?? s.value)}
                      onChange={(e) => handleChange(s.key, e.target.value)}
                    >
                      <option value="true">Enabled (true)</option>
                      <option value="false">Disabled (false)</option>
                    </select>
                  ) : (
                    <input
                      className="input"
                      value={formData[s.key] ?? s.value}
                      onChange={(e) => handleChange(s.key, e.target.value)}
                    />
                  )}
                </div>
              ))}
            </div>

            <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: '1rem' }}>
              <button type="submit" className="btn btn-primary btn-sm" disabled={saving}>
                {saving ? 'Saving...' : 'Save Global Settings'}
              </button>
            </div>
          </form>
        )}
      </div>
    </div>
  );
}

// ─── Security Audit Log Tab ─────────────────────────────────
function AuditTab() {
  const [logs, setLogs] = useState([]);

  useEffect(() => {
    get('/admin/audit?limit=50').then((d) => setLogs(d.auditLogs || []));
  }, []);

  return (
    <div className="card" style={{ padding: '1.5rem' }}>
      <h2 style={{ fontSize: '1.15rem', marginBottom: '0.5rem' }}>Security Audit Trail</h2>
      <p className="text-secondary" style={{ fontSize: '0.8125rem', marginBottom: '1.25rem' }}>
        Immutable log of administrative actions, authentication attempts, and policy changes.
      </p>

      <div className="admin-table-responsive">
        <table className="admin-data-table">
          <thead>
            <tr>
              <th>Action</th>
              <th>Admin User ID</th>
              <th>IP Address</th>
              <th>Timestamp</th>
            </tr>
          </thead>
          <tbody>
            {logs.map((l) => (
              <tr key={l.id}>
                <td><strong>{l.action}</strong></td>
                <td>ID {l.user_id || 'System'}</td>
                <td className="mono">{l.ip_address || '127.0.0.1'}</td>
                <td className="text-secondary">{new Date(l.created_at).toLocaleString()}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

// ─── Global Announcements Tab ───────────────────────────────
function AnnouncementsTab() {
  const [announcements, setAnnouncements] = useState([]);
  const [title, setTitle] = useState('');
  const [content, setContent] = useState('');
  const [type, setType] = useState('info');
  const [submitting, setSubmitting] = useState(false);

  const loadAnnouncements = () => {
    get('/admin/announcements').then((d) => setAnnouncements(d.announcements || []));
  };

  useEffect(() => { loadAnnouncements(); }, []);

  const handleCreate = async (e) => {
    e.preventDefault();
    if (!title.trim() || !content.trim()) return;
    setSubmitting(true);
    try {
      await post('/admin/announcements', { title, content, type });
      setTitle('');
      setContent('');
      if (window.WoxToast) window.WoxToast.success('Announcement broadcasted');
      loadAnnouncements();
    } catch (err) {
      if (window.WoxToast) window.WoxToast.error(err.message);
    } finally {
      setSubmitting(false);
    }
  };

  const handleDelete = async (id) => {
    try {
      await del(`/admin/announcements/${id}`);
      if (window.WoxToast) window.WoxToast.info('Announcement deleted');
      loadAnnouncements();
    } catch (err) {
      if (window.WoxToast) window.WoxToast.error(err.message);
    }
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>
      <div className="card" style={{ padding: '1.5rem' }}>
        <h2 style={{ fontSize: '1.15rem', marginBottom: '0.5rem' }}>Global User Announcements</h2>
        <p className="text-secondary" style={{ fontSize: '0.8125rem', marginBottom: '1.5rem' }}>
          Broadcast system maintenance alerts and platform updates directly into all user dashboard mailboxes.
        </p>

        <form onSubmit={handleCreate} style={{ display: 'flex', flexDirection: 'column', gap: '1rem', marginBottom: '2rem' }}>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr auto', gap: '0.75rem' }}>
            <input
              className="input"
              placeholder="Announcement Headline (e.g. Scheduled Maintenance Tonight at 02:00 UTC)"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              required
            />
            <select
              className="input"
              value={type}
              onChange={(e) => setType(e.target.value)}
              style={{ width: 140 }}
            >
              <option value="info">ℹ️ Info</option>
              <option value="warning">Warning</option>
              <option value="maintenance">Maintenance</option>
            </select>
          </div>

          <textarea
            className="input"
            rows={3}
            placeholder="Announcement details, affected features, expected restoration time..."
            value={content}
            onChange={(e) => setContent(e.target.value)}
            required
          />

          <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
            <button type="submit" className="btn btn-primary btn-sm" disabled={submitting}>
              {submitting ? 'Broadcasting...' : 'Broadcast Announcement'}
            </button>
          </div>
        </form>

        <h3 style={{ fontSize: '1rem', marginBottom: '0.75rem' }}>Active Broadcasts</h3>
        <div className="admin-table-responsive">
          <table className="admin-data-table">
            <thead>
              <tr>
                <th>Type</th>
                <th>Title</th>
                <th>Content</th>
                <th>Published At</th>
                <th>Actions</th>
              </tr>
            </thead>
            <tbody>
              {announcements.length === 0 ? (
                <tr>
                  <td colSpan={5} style={{ textAlign: 'center', padding: '2rem', color: 'var(--color-text-secondary)' }}>
                    No active system announcements. Use the form above to publish one.
                  </td>
                </tr>
              ) : (
                announcements.map((a) => (
                  <tr key={a.id}>
                    <td>
                      <span className={`admin-badge ${a.type === 'maintenance' ? 'admin-badge-amber' : a.type === 'warning' ? 'admin-badge-red' : 'admin-badge-purple'}`}>
                        {a.type.toUpperCase()}
                      </span>
                    </td>
                    <td><strong>{a.title}</strong></td>
                    <td style={{ maxWidth: 300 }} className="truncate">{a.content}</td>
                    <td className="text-secondary">{new Date(a.created_at).toLocaleString()}</td>
                    <td>
                      <button type="button" className="btn btn-ghost btn-xs" onClick={() => handleDelete(a.id)}>
                        Delete
                      </button>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}

// ─── Future Letters (Time Capsule) Tab Component ────────────
function FutureLettersTab() {
  const [letters, setLetters] = useState([]);
  const [stats, setStats] = useState({});
  const [pagination, setPagination] = useState({ page: 1, limit: 20, total: 0, totalPages: 1 });
  const [statusFilter, setStatusFilter] = useState('all');
  const [searchQuery, setSearchQuery] = useState('');
  const [loading, setLoading] = useState(true);
  const [inspectModal, setInspectModal] = useState(null);
  const [editModal, setEditModal] = useState(null);
  const [deliveringId, setDeliveringId] = useState(null);

  const fetchLetters = async (page = 1) => {
    setLoading(true);
    try {
      const q = encodeURIComponent(searchQuery);
      const res = await get(`/admin/future-letters?page=${page}&limit=20&status=${statusFilter}&q=${q}`);
      setLetters(res.letters || []);
      setStats(res.stats || {});
      setPagination(res.pagination || { page: 1, limit: 20, total: 0, totalPages: 1 });
    } catch (err) {
      if (window.WoxToast) window.WoxToast.error('Failed fetching future letters: ' + err.message);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchLetters(1);
  }, [statusFilter]);

  const handleSearch = (e) => {
    e.preventDefault();
    fetchLetters(1);
  };

  const handleApprove = async (letter) => {
    try {
      await put(`/admin/future-letters/${letter.id}`, { status: 'scheduled' });
      if (window.WoxToast) window.WoxToast.success(`Letter "${letter.subject}" approved & scheduled!`);
      fetchLetters(pagination.page);
    } catch (err) {
      if (window.WoxToast) window.WoxToast.error('Approval failed: ' + err.message);
    }
  };

  const handleDeliverNow = async (letter) => {
    if (!window.confirm(`Are you sure you want to force-deliver this letter to ${letter.recipient_email} right now ahead of schedule?`)) {
      return;
    }
    setDeliveringId(letter.id);
    try {
      await post(`/admin/future-letters/${letter.id}/deliver-now`, {});
      if (window.WoxToast) window.WoxToast.success(`Letter "${letter.subject}" delivered immediately via SMTP!`);
      fetchLetters(pagination.page);
    } catch (err) {
      if (window.WoxToast) window.WoxToast.error('Delivery failed: ' + err.message);
    } finally {
      setDeliveringId(null);
    }
  };

  const handleDelete = async (id, subject) => {
    if (!window.confirm(`Permanently delete future letter "${subject}" from vault? This cannot be undone.`)) {
      return;
    }
    try {
      await del(`/admin/future-letters/${id}`);
      if (window.WoxToast) window.WoxToast.success('Letter deleted from vault permanently');
      fetchLetters(pagination.page);
    } catch (err) {
      if (window.WoxToast) window.WoxToast.error('Delete failed: ' + err.message);
    }
  };

  const handleSaveEdit = async (e) => {
    e.preventDefault();
    try {
      await put(`/admin/future-letters/${editModal.id}`, {
        subject: editModal.subject,
        recipientEmail: editModal.recipient_email,
        deliveryDate: editModal.delivery_date,
        category: editModal.category,
        visibility: editModal.visibility,
        status: editModal.status,
        body: editModal.body,
      });
      if (window.WoxToast) window.WoxToast.success('Future letter updated successfully');
      setEditModal(null);
      fetchLetters(pagination.page);
    } catch (err) {
      if (window.WoxToast) window.WoxToast.error('Update failed: ' + err.message);
    }
  };

  const calculateCountdown = (targetDateStr, status) => {
    if (status === 'delivered') return 'Delivered';
    if (status === 'cancelled') return 'Cancelled';
    const target = new Date(targetDateStr);
    const now = new Date();
    const diffMs = target - now;
    if (diffMs <= 0) return 'Due for delivery now';
    const days = Math.floor(diffMs / (1000 * 60 * 60 * 24));
    const months = Math.floor(days / 30.4);
    const years = Math.floor(days / 365.25);
    if (years >= 1) return `In ~${years} year${years > 1 ? 's' : ''} (${days}d)`;
    if (months >= 1) return `In ~${months} month${months > 1 ? 's' : ''} (${days}d)`;
    return `In ${days} day${days > 1 ? 's' : ''}`;
  };

  return (
    <div className="admin-fade-in">
      {/* Telemetry Metric Cards */}
      <div className="admin-kpi-grid">
        <div className="admin-kpi-card">
          <div className="admin-kpi-header">
            <span className="admin-kpi-title">TOTAL LETTERS</span>
            <span className="admin-kpi-icon"></span>
          </div>
          <div className="admin-kpi-value">{stats.total_all || 0}</div>
          <div className="admin-kpi-subtext">All time-capsule letters created</div>
        </div>

        <div className="admin-kpi-card">
          <div className="admin-kpi-header">
            <span className="admin-kpi-title">SEALED & SCHEDULED</span>
            <span className="admin-kpi-icon">
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/></svg>
            </span>
          </div>
          <div className="admin-kpi-value" style={{ color: 'var(--color-primary-light)' }}>
            {stats.scheduled || 0}
          </div>
          <div className="admin-kpi-subtext">Currently resting in the vault</div>
        </div>

        <div className="admin-kpi-card">
          <div className="admin-kpi-header">
            <span className="admin-kpi-title">DELIVERED TO PAST SELVES</span>
            <span className="admin-kpi-icon"><svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M22 13V6a2 2 0 0 0-2-2H4a2 2 0 0 0-2 2v12c0 1.1.9 2 2 2h9"/><path d="m22 7-8.97 5.7a1.94 1.94 0 0 1-2.06 0L2 7"/></svg></span>
          </div>
          <div className="admin-kpi-value" style={{ color: 'var(--color-success)' }}>
            {stats.delivered || 0}
          </div>
          <div className="admin-kpi-subtext">Successfully sent via SMTP</div>
        </div>

        <div className="admin-kpi-card">
          <div className="admin-kpi-header">
            <span className="admin-kpi-title">PUBLIC REFLECTIONS</span>
            <span className="admin-kpi-icon"><svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="10"/><line x1="2" y1="12" x2="22" y2="12"/><path d="M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z"/></svg></span>
          </div>
          <div className="admin-kpi-value" style={{ color: 'var(--color-info)' }}>
            {stats.public_count || 0}
          </div>
          <div className="admin-kpi-subtext">Visible on public reflections wall</div>
        </div>
      </div>

      {/* Main Table Card */}
      <div className="card admin-saas-card" style={{ marginTop: '1.5rem' }}>
        <div className="admin-card-header" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '1rem', marginBottom: '1.25rem' }}>
          <div>
            <h2 className="admin-card-title" style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', fontSize: '1.25rem' }}>
              <span style={{ display: 'inline-flex', color: 'var(--color-primary-light)' }}>
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/></svg>
              </span>
              <span>Future Letters Vault Management</span>
            </h2>
            <p className="admin-card-subtitle">
              Inspect, manage, force-deliver, or edit scheduled and delivered time-capsule letters.
            </p>
          </div>

          <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'center', flexWrap: 'wrap' }}>
            <form onSubmit={handleSearch} style={{ display: 'flex', gap: '0.4rem' }}>
              <input
                type="text"
                className="input input-sm"
                placeholder="Search subject, sender, recipient..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                style={{ width: 260 }}
              />
              <button type="submit" className="btn btn-secondary btn-sm">
                Filter
              </button>
            </form>
            <button type="button" className="btn btn-ghost btn-sm" onClick={() => fetchLetters(pagination.page)} title="Refresh">
              <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M21 12a9 9 0 0 0-9-9 9.75 9.75 0 0 0-6.74 2.74L3 8"/><path d="M3 3v5h5"/><path d="M3 12a9 9 0 0 0 9 9 9.75 9.75 0 0 0 6.74-2.74L21 16"/><path d="M16 21h5v-5"/></svg>
            </button>
          </div>
        </div>

        {/* Status Filter Subtabs */}
        <div style={{ display: 'flex', gap: '0.4rem', borderBottom: '1px solid var(--color-border)', paddingBottom: '0.75rem', marginBottom: '1rem', flexWrap: 'wrap' }}>
          {[
            { id: 'all', label: `All (${stats.total_all || 0})` },
            { id: 'scheduled', label: `Scheduled (${stats.scheduled || 0})` },
            { id: 'delivered', label: `Delivered (${stats.delivered || 0})` },
            { id: 'cancelled', label: `Cancelled (${stats.cancelled || 0})` },
            { id: 'pending_verification', label: `Pending (${stats.pending || 0})` },
          ].map((tab) => (
            <button
              key={tab.id}
              type="button"
              className={`btn btn-xs ${statusFilter === tab.id ? 'btn-primary' : 'btn-ghost'}`}
              onClick={() => setStatusFilter(tab.id)}
              style={{ borderRadius: 'var(--radius-pill)', fontWeight: 600, padding: '0.35rem 0.85rem' }}
            >
              {tab.label}
            </button>
          ))}
        </div>

        {/* Letters Table */}
        <div className="admin-table-responsive">
          <table className="admin-data-table">
            <thead>
              <tr>
                <th>Subject & Category</th>
                <th>Author / Sender</th>
                <th>Recipient</th>
                <th>Delivery Target</th>
                <th>Security / Lock</th>
                <th>Status</th>
                <th>Actions</th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr>
                  <td colSpan={7} style={{ textAlign: 'center', padding: '3rem', color: 'var(--color-text-secondary)' }}>
                    <span className="status-dot-pulse" style={{ display: 'inline-block', marginRight: '0.5rem' }} />
                    Loading vault records...
                  </td>
                </tr>
              ) : letters.length === 0 ? (
                <tr>
                  <td colSpan={7} style={{ textAlign: 'center', padding: '3rem', color: 'var(--color-text-secondary)' }}>
                    No future letters found matching the active filter.
                  </td>
                </tr>
              ) : (
                letters.map((l) => {
                  const targetDate = new Date(l.delivery_date);
                  const isScheduled = l.status === 'scheduled';
                  const isDelivered = l.status === 'delivered';

                  return (
                    <tr key={l.id}>
                      <td>
                        <div style={{ fontWeight: 600, color: '#ffffff', marginBottom: '0.2rem' }}>
                          {l.subject}
                        </div>
                        <div style={{ display: 'flex', gap: '0.4rem', alignItems: 'center' }}>
                          <span className="admin-badge admin-badge-purple" style={{ fontSize: '0.7rem' }}>
                            {l.category || 'General'}
                          </span>
                          <span className="text-secondary" style={{ fontSize: '0.75rem' }}>
                            {l.word_count || 0} words • {l.visibility}
                          </span>
                        </div>
                      </td>

                      <td>
                        <div style={{ fontSize: '0.85rem', fontWeight: 500 }}>{l.sender_email}</div>
                        {l.author_username && (
                          <span className="admin-badge admin-badge-blue" style={{ fontSize: '0.65rem' }}>
                            @{l.author_username}
                          </span>
                        )}
                      </td>

                      <td>
                        <div style={{ fontSize: '0.85rem' }}>{l.recipient_email}</div>
                      </td>

                      <td>
                        <div style={{ fontWeight: 600, fontSize: '0.8125rem' }}>
                          {targetDate.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}
                        </div>
                        <span className="text-secondary" style={{ fontSize: '0.75rem' }}>
                          {calculateCountdown(l.delivery_date, l.status)}
                        </span>
                      </td>

                      <td>
                        {l.is_locked ? (
                          <span className="admin-badge admin-badge-amber" style={{ fontSize: '0.7rem', gap: '0.25rem' }}>
                            Passcode Locked
                          </span>
                        ) : (
                          <span className="admin-badge admin-badge-green" style={{ fontSize: '0.7rem', gap: '0.25rem' }}>
                            Open
                          </span>
                        )}
                      </td>

                      <td>
                        <span className={`admin-badge ${
                          l.status === 'delivered' ? 'admin-badge-green' :
                          l.status === 'scheduled' ? 'admin-badge-purple' :
                          l.status === 'cancelled' ? 'admin-badge-red' : 'admin-badge-amber'
                        }`}>
                          {l.status.toUpperCase()}
                        </span>
                      </td>

                      <td>
                        <div style={{ display: 'flex', gap: '0.35rem', alignItems: 'center' }}>
                          {isScheduled && (
                            <button
                              type="button"
                              className="btn btn-primary btn-xs"
                              onClick={() => handleDeliverNow(l)}
                              disabled={deliveringId === l.id}
                              title="Force Immediate Delivery via SMTP"
                              style={{ background: 'linear-gradient(135deg, #7c3aed, #a855f7)', fontWeight: 600 }}
                            >
                              {deliveringId === l.id ? 'Sending...' : 'Deliver'}
                            </button>
                          )}
                          <button
                            type="button"
                            className="btn btn-secondary btn-xs"
                            onClick={() => setInspectModal(l)}
                            title="Inspect Letter"
                            style={{ display: 'inline-flex', alignItems: 'center', justifyContent: 'center' }}
                          >
                            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M2 12s3-7 10-7 10 7 10 7-3 7-10 7-10-7-10-7Z"/><circle cx="12" cy="12" r="3"/></svg>
                          </button>
                          <button
                            type="button"
                            className="btn btn-secondary btn-xs"
                            onClick={() => setEditModal({ ...l, delivery_date: new Date(l.delivery_date).toISOString().slice(0, 10) })}
                            title="Edit Details"
                            style={{ display: 'inline-flex', alignItems: 'center', justifyContent: 'center' }}
                          >
                            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M12 20h9"/><path d="M16.5 3.5a2.121 2.121 0 0 1 3 3L7 19l-4 1 1-4L16.5 3.5z"/></svg>
                          </button>
                          <button
                            type="button"
                            className="btn btn-ghost btn-xs"
                            onClick={() => handleDelete(l.id, l.subject)}
                            title="Delete Permanently"
                            style={{ color: 'var(--color-error)', display: 'inline-flex', alignItems: 'center', justifyContent: 'center' }}
                          >
                            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M3 6h18"/><path d="M19 6v14c0 1-1 2-2 2H7c-1 0-2-1-2-2V6"/><path d="M8 6V4c0-1 1-2 2-2h4c1 0 2 1 2 2v2"/></svg>
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>

        {/* Pagination Footer */}
        {pagination.totalPages > 1 && (
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: '1.25rem', paddingTop: '1rem', borderTop: '1px solid var(--color-border)' }}>
            <span className="text-secondary" style={{ fontSize: '0.8125rem' }}>
              Showing {letters.length} of {pagination.total} letters
            </span>
            <div style={{ display: 'flex', gap: '0.5rem' }}>
              <button
                type="button"
                className="btn btn-secondary btn-xs"
                disabled={pagination.page <= 1}
                onClick={() => fetchLetters(pagination.page - 1)}
              >
                ← Prev
              </button>
              <span className="admin-badge admin-badge-purple" style={{ padding: '0.25rem 0.65rem' }}>
                Page {pagination.page} of {pagination.totalPages}
              </span>
              <button
                type="button"
                className="btn btn-secondary btn-xs"
                disabled={pagination.page >= pagination.totalPages}
                onClick={() => fetchLetters(pagination.page + 1)}
              >
                Next →
              </button>
            </div>
          </div>
        )}
      </div>

      {/* ── Inspect Modal ────────────────────────────────────── */}
      {inspectModal && (
        <div className="admin-modal-backdrop" onClick={() => setInspectModal(null)}>
          <div className="admin-modal-card" style={{ maxWidth: 640 }} onClick={(e) => e.stopPropagation()}>
            <div className="admin-modal-header">
              <h3 style={{ margin: 0, fontSize: '1.15rem', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/></svg>
                <span>Letter Inspection: {inspectModal.subject}</span>
              </h3>
              <button type="button" className="btn btn-ghost btn-xs" onClick={() => setInspectModal(null)}>✕</button>
            </div>

            <div className="admin-modal-body" style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.75rem', background: 'rgba(0,0,0,0.25)', padding: '0.75rem', borderRadius: 'var(--radius-sm)' }}>
                <div>
                  <span className="text-secondary" style={{ fontSize: '0.75rem' }}>Sender Email:</span>
                  <div style={{ fontWeight: 600 }}>{inspectModal.sender_email}</div>
                </div>
                <div>
                  <span className="text-secondary" style={{ fontSize: '0.75rem' }}>Recipient Email:</span>
                  <div style={{ fontWeight: 600 }}>{inspectModal.recipient_email}</div>
                </div>
                <div>
                  <span className="text-secondary" style={{ fontSize: '0.75rem' }}>Delivery Target Date:</span>
                  <div style={{ fontWeight: 600 }}>{new Date(inspectModal.delivery_date).toLocaleString()}</div>
                </div>
                <div>
                  <span className="text-secondary" style={{ fontSize: '0.75rem' }}>Status & Lock:</span>
                  <div>
                    <span className="admin-badge admin-badge-purple">{inspectModal.status}</span>
                    {inspectModal.is_locked && <span className="admin-badge admin-badge-amber" style={{ marginLeft: '0.35rem' }}>Passcode</span>}
                  </div>
                </div>
              </div>

              <div>
                <span className="text-secondary" style={{ fontSize: '0.8125rem', marginBottom: '0.4rem', display: 'block' }}>Letter Content Body:</span>
                <div style={{ background: 'var(--color-bg-page)', padding: '1rem', borderRadius: 'var(--radius-md)', border: '1px solid var(--color-border)', maxHeight: 250, overflowY: 'auto', whiteSpace: 'pre-wrap', fontFamily: 'Georgia, serif', lineHeight: 1.6 }}>
                  {inspectModal.body || '(Empty body)'}
                </div>
              </div>
            </div>

            <div className="admin-modal-footer" style={{ display: 'flex', justifyContent: 'space-between' }}>
              {inspectModal.status === 'scheduled' ? (
                <button
                  type="button"
                  className="btn btn-primary btn-sm"
                  onClick={() => {
                    const item = inspectModal;
                    setInspectModal(null);
                    handleDeliverNow(item);
                  }}
                >
                  Force Deliver Now
                </button>
              ) : <div />}
              <button type="button" className="btn btn-secondary btn-sm" onClick={() => setInspectModal(null)}>Close</button>
            </div>
          </div>
        </div>
      )}

      {/* ── Edit Modal ───────────────────────────────────────── */}
      {editModal && (
        <div className="admin-modal-backdrop" onClick={() => setEditModal(null)}>
          <div className="admin-modal-card" style={{ maxWidth: 540 }} onClick={(e) => e.stopPropagation()}>
            <form onSubmit={handleSaveEdit}>
              <div className="admin-modal-header">
                <h3 style={{ margin: 0, fontSize: '1.15rem' }}>Edit Future Letter</h3>
                <button type="button" className="btn btn-ghost btn-xs" onClick={() => setEditModal(null)}>✕</button>
              </div>

              <div className="admin-modal-body" style={{ display: 'flex', flexDirection: 'column', gap: '0.85rem' }}>
                <div>
                  <label className="admin-form-label">Subject</label>
                  <input
                    type="text"
                    className="input"
                    value={editModal.subject || ''}
                    onChange={(e) => setEditModal({ ...editModal, subject: e.target.value })}
                    required
                  />
                </div>

                <div>
                  <label className="admin-form-label">Recipient Email</label>
                  <input
                    type="email"
                    className="input"
                    value={editModal.recipient_email || ''}
                    onChange={(e) => setEditModal({ ...editModal, recipient_email: e.target.value })}
                    required
                  />
                </div>

                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.75rem' }}>
                  <div>
                    <label className="admin-form-label">Delivery Date</label>
                    <input
                      type="date"
                      className="input"
                      value={editModal.delivery_date || ''}
                      onChange={(e) => setEditModal({ ...editModal, delivery_date: e.target.value })}
                      required
                    />
                  </div>

                  <div>
                    <label className="admin-form-label">Status</label>
                    <select
                      className="input"
                      value={editModal.status || 'scheduled'}
                      onChange={(e) => setEditModal({ ...editModal, status: e.target.value })}
                    >
                      <option value="scheduled">Scheduled</option>
                      <option value="delivered">Delivered</option>
                      <option value="cancelled">Cancelled</option>
                      <option value="pending_verification">Pending Verification</option>
                    </select>
                  </div>
                </div>

                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.75rem' }}>
                  <div>
                    <label className="admin-form-label">Category</label>
                    <input
                      type="text"
                      className="input"
                      value={editModal.category || 'General'}
                      onChange={(e) => setEditModal({ ...editModal, category: e.target.value })}
                    />
                  </div>

                  <div>
                    <label className="admin-form-label">Visibility</label>
                    <select
                      className="input"
                      value={editModal.visibility || 'private'}
                      onChange={(e) => setEditModal({ ...editModal, visibility: e.target.value })}
                    >
                      <option value="private">Private</option>
                      <option value="public_anonymous">Public Anonymous</option>
                    </select>
                  </div>
                </div>
              </div>

              <div className="admin-modal-footer" style={{ display: 'flex', justifyContent: 'flex-end', gap: '0.5rem' }}>
                <button type="button" className="btn btn-secondary btn-sm" onClick={() => setEditModal(null)}>Cancel</button>
                <button type="submit" className="btn btn-primary btn-sm">Save Changes</button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}

