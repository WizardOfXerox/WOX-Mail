import React, { useState, useEffect } from 'react';
import { get } from '../../shared/api.js';

export default function AnalyticsSection() {
  const [data, setData] = useState(null);
  const [trackingList, setTrackingList] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  useEffect(() => {
    Promise.all([
      get('/api/analytics/overview').catch(() => null),
      get('/api/analytics/tracking?limit=30').catch(() => null),
    ])
      .then(([overviewRes, trackingRes]) => {
        if (overviewRes) setData(overviewRes);
        if (trackingRes && trackingRes.tracking) setTrackingList(trackingRes.tracking);
      })
      .catch((err) => setError(err.message || 'Failed to load analytics.'))
      .finally(() => setLoading(false));
  }, []);

  if (loading) {
    return (
      <div className="settings-section">
        <h2>Mailbox Analytics & Activity Dashboard</h2>
        <p className="text-secondary">Loading your email activity metrics...</p>
      </div>
    );
  }

  const tracking = data?.tracking || {};
  const outbox = data?.outbox || {};
  const topRecipients = data?.topRecipients || [];
  const dailyTrend = data?.dailyTrend || [];

  const openRate = tracking.total_tracked > 0 ? Math.round((tracking.total_opened / tracking.total_tracked) * 100) : 0;

  return (
    <div className="settings-section">
      <div className="section-header">
        <h2>Mailbox Analytics & Activity Dashboard</h2>
        <p className="text-secondary">
          Personal email analytics: open rates, average response speeds, top contacted people, and dispatch activity.
        </p>
      </div>

      {error && <div className="toast toast-error" style={{ position: 'static', marginBottom: '1rem', width: '100%' }}>{error}</div>}

      {/* KPI Cards */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '1rem', marginBottom: '1.5rem' }}>
        <div className="card" style={{ padding: '1.25rem' }}>
          <div className="text-secondary" style={{ fontSize: '0.8125rem' }}>Tracked Emails Sent</div>
          <div style={{ fontSize: '1.75rem', fontWeight: 700, color: 'var(--color-primary-light)', marginTop: '0.25rem' }}>
            {tracking.total_tracked || 0}
          </div>
        </div>

        <div className="card" style={{ padding: '1.25rem' }}>
          <div className="text-secondary" style={{ fontSize: '0.8125rem' }}>Recipient Open Rate</div>
          <div style={{ fontSize: '1.75rem', fontWeight: 700, color: 'var(--color-success)', marginTop: '0.25rem' }}>
            {openRate}%
          </div>
          <div className="text-secondary" style={{ fontSize: '0.75rem' }}>{tracking.total_opened || 0} emails opened</div>
        </div>

        <div className="card" style={{ padding: '1.25rem' }}>
          <div className="text-secondary" style={{ fontSize: '0.8125rem' }}>Total Reads Recorded</div>
          <div style={{ fontSize: '1.75rem', fontWeight: 700, color: 'var(--color-info)', marginTop: '0.25rem' }}>
            {tracking.total_opens || 0}
          </div>
        </div>

        <div className="card" style={{ padding: '1.25rem' }}>
          <div className="text-secondary" style={{ fontSize: '0.8125rem' }}>Avg Time to Open</div>
          <div style={{ fontSize: '1.75rem', fontWeight: 700, color: 'var(--color-warning)', marginTop: '0.25rem' }}>
            {tracking.avg_minutes_to_open ? `${tracking.avg_minutes_to_open}m` : 'N/A'}
          </div>
        </div>
      </div>

      {/* Top Recipients Table */}
      <div className="card" style={{ marginBottom: '1.5rem' }}>
        <h3 style={{ marginBottom: '1rem' }}>Top Contacted People</h3>
        {topRecipients.length === 0 ? (
          <p className="text-secondary" style={{ fontSize: '0.875rem' }}>No outbound tracked emails yet.</p>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
            {topRecipients.map((r, i) => (
              <div
                key={r.recipient_email}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  padding: '0.75rem 1rem',
                  background: 'var(--color-bg-elevated)',
                  borderRadius: 'var(--radius-md)',
                  border: '1px solid var(--color-border)'
                }}
              >
                <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
                  <span className="badge badge-purple" style={{ fontSize: '0.75rem' }}>#{i + 1}</span>
                  <strong style={{ fontSize: '0.875rem' }}>{r.recipient_email}</strong>
                </div>
                <div className="text-secondary" style={{ fontSize: '0.8125rem' }}>
                  {r.sent_count} sent · {r.opened_count} opened ({Math.round((r.opened_count / r.sent_count) * 100)}%)
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* 14-Day Activity Trend */}
      <div className="card">
        <h3 style={{ marginBottom: '0.75rem' }}>Outbound Dispatch Trend (Last 14 Days)</h3>
        {dailyTrend.length === 0 ? (
          <p className="text-secondary" style={{ fontSize: '0.875rem' }}>No recent dispatch events.</p>
        ) : (
          <div style={{ display: 'flex', alignItems: 'flex-end', gap: '0.5rem', height: '140px', paddingTop: '1rem' }}>
            {dailyTrend.map((d) => (
              <div
                key={d.date}
                style={{
                  flex: 1,
                  display: 'flex',
                  flexDirection: 'column',
                  alignItems: 'center',
                  height: '100%',
                  justifyContent: 'flex-end'
                }}
              >
                <div
                  style={{
                    width: '100%',
                    maxWidth: 24,
                    height: `${Math.min(100, Math.max(15, (d.sent_count / 10) * 100))}%`,
                    backgroundColor: 'var(--color-primary)',
                    borderRadius: '4px 4px 0 0',
                    transition: 'height 0.3s ease'
                  }}
                  title={`${new Date(d.date).toLocaleDateString()}: ${d.sent_count} sent, ${d.opened_count} opened`}
                />
                <div className="text-secondary" style={{ fontSize: '0.625rem', marginTop: '0.35rem' }}>
                  {new Date(d.date).toLocaleDateString(undefined, { month: 'numeric', day: 'numeric' })}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Live Read Receipts & Outbound Email Tracking Feed */}
      <div className="card" style={{ marginTop: '1.5rem' }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '1rem' }}>
          <div>
            <h3 style={{ margin: 0 }}>📊 Live Email Read Receipts & Delivery Status</h3>
            <p className="text-secondary" style={{ margin: '0.2rem 0 0 0', fontSize: '0.8rem' }}>
              Real-time open confirmations recorded by non-intrusive 1x1 tracking pixels.
            </p>
          </div>
          <span className="badge badge-purple">{trackingList.length} Tracked</span>
        </div>

        {trackingList.length === 0 ? (
          <div style={{ padding: '2rem', textAlign: 'center', color: 'var(--color-text-secondary)', fontSize: '0.875rem' }}>
            No outbound emails with active open tracking yet. Check "📊 Track Opens" in the compose modal to track recipient reads.
          </div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem', maxHeight: '380px', overflowY: 'auto' }}>
            {trackingList.map((item) => (
              <div
                key={item.id}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  flexWrap: 'wrap',
                  gap: '0.75rem',
                  padding: '0.85rem 1rem',
                  background: item.opened_at ? 'rgba(34, 197, 94, 0.05)' : 'var(--color-bg-elevated)',
                  border: item.opened_at ? '1px solid rgba(34, 197, 94, 0.3)' : '1px solid var(--color-border)',
                  borderRadius: 'var(--radius-md)',
                }}
              >
                <div style={{ display: 'flex', flexDirection: 'column', gap: '0.2rem', minWidth: '220px', flex: 1 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                    <strong style={{ fontSize: '0.875rem', color: 'var(--color-text-primary)' }}>
                      {item.subject || '(no subject)'}
                    </strong>
                    <span className={`badge ${item.opened_at ? 'badge-green' : 'badge-amber'}`} style={{ fontSize: '0.7rem' }}>
                      {item.opened_at ? `✓✓ Read (${item.open_count}x)` : '✓ Delivered (Unopened)'}
                    </span>
                  </div>
                  <div className="text-secondary" style={{ fontSize: '0.75rem' }}>
                    To: <span className="mono">{item.recipient_email}</span> · Sent: {new Date(item.sent_at).toLocaleString()}
                  </div>
                </div>

                <div style={{ textAlign: 'right', fontSize: '0.75rem' }}>
                  {item.opened_at ? (
                    <div style={{ color: 'var(--color-success)', fontWeight: 600 }}>
                      First opened: {new Date(item.opened_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })} ({new Date(item.opened_at).toLocaleDateString()})
                      {item.last_user_agent && (
                        <div className="text-tertiary" style={{ fontSize: '0.7rem', fontWeight: 'normal' }}>
                          Client: {item.last_user_agent.split(' ')[0]}
                        </div>
                      )}
                    </div>
                  ) : (
                    <span className="text-tertiary">Waiting for recipient open...</span>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
