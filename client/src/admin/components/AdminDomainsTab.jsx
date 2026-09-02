import React, { useState, useEffect } from 'react';
import { get, post } from '../../shared/api.js';

export default function AdminDomainsTab() {
  const [domains, setDomains] = useState([]);
  const [loading, setLoading] = useState(true);
  const [selectedDomain, setSelectedDomain] = useState('wox.world');
  const [auditData, setAuditData] = useState(null);
  const [auditing, setAuditing] = useState(false);
  const [dkimSelector, setDkimSelector] = useState('woxmail');
  const [dkimResult, setDkimResult] = useState(null);
  const [generatingDkim, setGeneratingDkim] = useState(false);
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    fetchDomains();
  }, []);

  const fetchDomains = async () => {
    setLoading(true);
    try {
      const data = await get('/admin/domains');
      setDomains(data.domains || []);
      if (data.domains && data.domains.length > 0) {
        setSelectedDomain(data.domains[0].domain);
      }
    } catch (err) {
      if (window.WoxToast) window.WoxToast.error(err.message || 'Failed to load domains');
    } finally {
      setLoading(false);
    }
  };

  const handleRunAudit = async (domainToAudit = selectedDomain) => {
    setAuditing(true);
    try {
      const data = await post('/admin/domains/audit', { domain: domainToAudit });
      setAuditData(data);
      if (window.WoxToast) window.WoxToast.success(`DNS security audit completed for ${domainToAudit}`);
    } catch (err) {
      if (window.WoxToast) window.WoxToast.error(err.message || 'DNS audit failed');
    } finally {
      setAuditing(false);
    }
  };

  const handleGenerateDkim = async (e) => {
    if (e) e.preventDefault();
    setGeneratingDkim(true);
    try {
      const data = await post('/admin/domains/dkim-generate', {
        domain: selectedDomain,
        selector: dkimSelector.trim() || 'woxmail',
      });
      setDkimResult(data);
      if (window.WoxToast) window.WoxToast.success('RSA-2048 DKIM keypair generated');
    } catch (err) {
      if (window.WoxToast) window.WoxToast.error(err.message || 'Failed to generate DKIM');
    } finally {
      setGeneratingDkim(false);
    }
  };

  const copyToClipboard = (text) => {
    navigator.clipboard.writeText(text);
    setCopied(true);
    setTimeout(() => setCopied(false), 2500);
    if (window.WoxToast) window.WoxToast.info('Copied to clipboard');
  };

  return (
    <div className="admin-tab-content">
      <div className="admin-page-header">
        <div>
          <h2 className="admin-page-title">Domain & DNS Deliverability Center</h2>
          <p className="admin-page-desc">
            Validate MX, SPF, DKIM, DMARC, and MTA-STS security health via real-time DNS-over-HTTPS probes and generate cryptographic signing keys.
          </p>
        </div>
        <div style={{ display: 'flex', gap: '0.5rem' }}>
          <button
            type="button"
            className="btn btn-primary"
            onClick={() => handleRunAudit(selectedDomain)}
            disabled={auditing}
          >
            {auditing ? 'Running DoH Probe...' : 'Run Security Audit'}
          </button>
        </div>
      </div>

      {/* Domain Selection Bar */}
      <div className="admin-card" style={{ marginBottom: '1.25rem', padding: '1rem 1.25rem' }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: '1rem' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
            <span style={{ fontSize: '0.875rem', color: 'var(--color-text-secondary)', fontWeight: 600 }}>Active Domain:</span>
            <select
              className="admin-input"
              style={{ width: 'auto', minWidth: '220px', padding: '0.4rem 0.75rem' }}
              value={selectedDomain}
              onChange={(e) => {
                setSelectedDomain(e.target.value);
                setAuditData(null);
              }}
            >
              {domains.map((d) => (
                <option key={d.id} value={d.domain}>
                  {d.domain} ({d.type})
                </option>
              ))}
            </select>
          </div>
          <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'center' }}>
            {domains.map((d) => (
              <span
                key={d.id}
                className={`badge ${d.domain === selectedDomain ? 'badge-purple' : 'badge-secondary'}`}
                style={{ padding: '0.35rem 0.75rem', cursor: 'pointer' }}
                onClick={() => {
                  setSelectedDomain(d.domain);
                  setAuditData(null);
                }}
              >
                {d.domain}
              </span>
            ))}
          </div>
        </div>
      </div>

      {/* Audit Results Dashboard */}
      {auditData && (
        <div style={{ marginBottom: '1.5rem' }}>
          <div
            className="admin-card"
            style={{
              marginBottom: '1rem',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              padding: '1.25rem',
              background: 'linear-gradient(135deg, rgba(124, 58, 237, 0.1) 0%, rgba(26, 26, 46, 0.9) 100%)',
              border: '1px solid var(--color-primary-glow)',
            }}
          >
            <div>
              <div style={{ fontSize: '0.8rem', textTransform: 'uppercase', letterSpacing: '0.05em', color: 'var(--color-primary-light)', fontWeight: 700 }}>
                Deliverability & Protocol Health
              </div>
              <div style={{ fontSize: '1.5rem', fontWeight: 800, marginTop: '0.2rem' }}>
                Health Score: {auditData.score ?? 0} / 100
              </div>
            </div>
            <div>
              <span
                className={`badge ${auditData.score >= 80 ? 'badge-green' : auditData.score >= 50 ? 'badge-amber' : 'badge-red'}`}
                style={{ fontSize: '0.9rem', padding: '0.4rem 1rem' }}
              >
                {auditData.score >= 80 ? '[EXCELLENT DELIVERABILITY]' : auditData.score >= 50 ? '[ACCEPTABLE WARNINGS]' : '[ACTION REQUIRED]'}
              </span>
            </div>
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(320px, 1fr))', gap: '1rem' }}>
            {/* MX Records */}
            <div className="admin-card" style={{ padding: '1.25rem' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.75rem' }}>
                <span style={{ fontWeight: 700, fontSize: '0.95rem' }}>MX Routing (Mail Exchange)</span>
                <span className={`badge ${auditData.checks?.mx?.passed ? 'badge-green' : 'badge-red'}`}>
                  {auditData.checks?.mx?.passed ? 'PASS' : 'FAIL'}
                </span>
              </div>
              <p style={{ fontSize: '0.85rem', color: 'var(--color-text-secondary)', marginBottom: '0.5rem' }}>
                {auditData.checks?.mx?.message || 'Validates inbound mail routing servers.'}
              </p>
              {auditData.checks?.mx?.records?.length > 0 && (
                <div style={{ background: 'var(--color-bg-elevated)', padding: '0.5rem 0.75rem', borderRadius: 'var(--radius-sm)', fontSize: '0.8rem', fontFamily: 'var(--font-mono)' }}>
                  {auditData.checks.mx.records.map((r, i) => (
                    <div key={i}>{typeof r === 'string' ? r : `${r.exchange || r.host} (Priority: ${r.priority})`}</div>
                  ))}
                </div>
              )}
            </div>

            {/* SPF Record */}
            <div className="admin-card" style={{ padding: '1.25rem' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.75rem' }}>
                <span style={{ fontWeight: 700, fontSize: '0.95rem' }}>SPF (Sender Policy Framework)</span>
                <span className={`badge ${auditData.checks?.spf?.passed ? 'badge-green' : 'badge-red'}`}>
                  {auditData.checks?.spf?.passed ? 'PASS' : 'FAIL'}
                </span>
              </div>
              <p style={{ fontSize: '0.85rem', color: 'var(--color-text-secondary)', marginBottom: '0.5rem' }}>
                {auditData.checks?.spf?.message || 'Authorizes mail server IPs to send on domain behalf.'}
              </p>
              {auditData.checks?.spf?.record && (
                <div style={{ background: 'var(--color-bg-elevated)', padding: '0.5rem 0.75rem', borderRadius: 'var(--radius-sm)', fontSize: '0.8rem', fontFamily: 'var(--font-mono)', wordBreak: 'break-all' }}>
                  {auditData.checks.spf.record}
                </div>
              )}
            </div>

            {/* DMARC Policy */}
            <div className="admin-card" style={{ padding: '1.25rem' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.75rem' }}>
                <span style={{ fontWeight: 700, fontSize: '0.95rem' }}>DMARC Policy Enforcement</span>
                <span className={`badge ${auditData.checks?.dmarc?.passed ? 'badge-green' : 'badge-amber'}`}>
                  {auditData.checks?.dmarc?.passed ? 'PASS' : 'WARNING'}
                </span>
              </div>
              <p style={{ fontSize: '0.85rem', color: 'var(--color-text-secondary)', marginBottom: '0.5rem' }}>
                {auditData.checks?.dmarc?.message || 'Enforces reject/quarantine on spoofing attempts.'}
              </p>
              {auditData.checks?.dmarc?.record && (
                <div style={{ background: 'var(--color-bg-elevated)', padding: '0.5rem 0.75rem', borderRadius: 'var(--radius-sm)', fontSize: '0.8rem', fontFamily: 'var(--font-mono)', wordBreak: 'break-all' }}>
                  {auditData.checks.dmarc.record}
                </div>
              )}
            </div>

            {/* MTA-STS & TLS */}
            <div className="admin-card" style={{ padding: '1.25rem' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.75rem' }}>
                <span style={{ fontWeight: 700, fontSize: '0.95rem' }}>MTA-STS TLS Downgrade Shield</span>
                <span className={`badge ${auditData.checks?.mtaSts?.passed ? 'badge-green' : 'badge-amber'}`}>
                  {auditData.checks?.mtaSts?.passed ? 'PASS' : 'OPTIONAL'}
                </span>
              </div>
              <p style={{ fontSize: '0.85rem', color: 'var(--color-text-secondary)', marginBottom: '0.5rem' }}>
                {auditData.checks?.mtaSts?.message || 'Prevents Man-In-The-Middle TLS downgrade attacks.'}
              </p>
              {auditData.checks?.mtaSts?.record && (
                <div style={{ background: 'var(--color-bg-elevated)', padding: '0.5rem 0.75rem', borderRadius: 'var(--radius-sm)', fontSize: '0.8rem', fontFamily: 'var(--font-mono)', wordBreak: 'break-all' }}>
                  {auditData.checks.mtaSts.record}
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* RSA-2048 DKIM Key Generator */}
      <div className="admin-card" style={{ padding: '1.5rem' }}>
        <h3 style={{ fontSize: '1.1rem', fontWeight: 700, marginBottom: '0.5rem' }}>
          RSA-2048 DKIM Keypair Generator
        </h3>
        <p style={{ fontSize: '0.875rem', color: 'var(--color-text-secondary)', marginBottom: '1.25rem' }}>
          Generate a cryptographically secure 2048-bit RSA private signing key and copyable DNS TXT public key record for DKIM signature alignment.
        </p>

        <form onSubmit={handleGenerateDkim} style={{ display: 'flex', gap: '0.75rem', alignItems: 'center', marginBottom: '1.25rem', flexWrap: 'wrap' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
            <span style={{ fontSize: '0.85rem', color: 'var(--color-text-secondary)' }}>Selector:</span>
            <input
              type="text"
              className="admin-input"
              value={dkimSelector}
              onChange={(e) => setDkimSelector(e.target.value)}
              placeholder="woxmail"
              style={{ width: '140px' }}
            />
          </div>
          <button type="submit" className="btn btn-secondary" disabled={generatingDkim}>
            {generatingDkim ? 'Generating Keypair...' : 'Generate DKIM Keypair'}
          </button>
        </form>

        {dkimResult && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
            <div>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.35rem' }}>
                <span style={{ fontSize: '0.85rem', fontWeight: 600 }}>DNS Record Hostname (TXT):</span>
                <button
                  type="button"
                  className="btn btn-ghost btn-xs"
                  onClick={() => copyToClipboard(dkimResult.recordName)}
                >
                  Copy Host
                </button>
              </div>
              <div style={{ background: 'var(--color-bg-elevated)', padding: '0.5rem 0.75rem', borderRadius: 'var(--radius-sm)', fontFamily: 'var(--font-mono)', fontSize: '0.85rem' }}>
                {dkimResult.recordName}
              </div>
            </div>

            <div>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.35rem' }}>
                <span style={{ fontSize: '0.85rem', fontWeight: 600 }}>DNS Record Value (TXT):</span>
                <button
                  type="button"
                  className="btn btn-ghost btn-xs"
                  onClick={() => copyToClipboard(dkimResult.dnsRecord)}
                >
                  {copied ? 'Copied!' : 'Copy TXT Value'}
                </button>
              </div>
              <textarea
                readOnly
                className="admin-input"
                style={{ fontFamily: 'var(--font-mono)', fontSize: '0.8rem', height: '90px', width: '100%', resize: 'none' }}
                value={dkimResult.dnsRecord}
              />
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
