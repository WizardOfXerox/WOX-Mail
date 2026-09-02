import React, { useState } from 'react';

/**
 * CampaignComposer — Newsletter & Bulk Broadcaster Designer with Merge Tags
 */
export default function CampaignComposer({ lists = [], onSave, onCancel }) {
  const [selectedListId, setSelectedListId] = useState(lists[0]?.id || '');
  const [title, setTitle] = useState('');
  const [subject, setSubject] = useState('');
  const [fromName, setFromName] = useState('WoxMail Broadcaster');
  const [fromEmail, setFromEmail] = useState('');
  const [htmlContent, setHtmlContent] = useState(`
<div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; max-width: 600px; margin: 0 auto; background: #ffffff; color: #1a1a2e; border: 1px solid #e0e0e0; border-radius: 8px; overflow: hidden;">
  <div style="background: #7c3aed; padding: 24px; text-align: center; color: #ffffff;">
    <h1 style="margin: 0; font-size: 22px;">Weekly Newsletter</h1>
  </div>
  <div style="padding: 24px; line-height: 1.6;">
    <p>Hello {{first_name}},</p>
    <p>Here are this week's top updates and private insights.</p>
    <p>Write your newsletter body here...</p>
    <p style="margin-top: 30px;">Best regards,<br/>The Team</p>
  </div>
  <div style="background: #f8f8fc; padding: 16px; text-align: center; font-size: 12px; color: #6868a0; border-top: 1px solid #e0e0e0;">
    <p style="margin: 0;">You received this because you are subscribed with {{email}}.</p>
    <p style="margin: 6px 0 0 0;"><a href="{{unsubscribe_url}}" style="color: #7c3aed;">One-Click Unsubscribe</a></p>
  </div>
</div>
`.trim());
  const [plainContent, setPlainContent] = useState('');
  const [testEmail, setTestEmail] = useState('');
  const [testing, setTesting] = useState(false);
  const [saving, setSaving] = useState(false);

  const insertMergeTag = (tag) => {
    setHtmlContent((prev) => `${prev} ${tag}`);
  };

  const handleTestSend = async () => {
    if (!testEmail || !testEmail.includes('@')) {
      alert('Please enter a valid test recipient email address');
      return;
    }
    setTesting(true);
    try {
      // First save draft campaign to get an ID if needed
      const campRes = await fetch('/api/campaigns', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({
          listId: parseInt(selectedListId, 10),
          title: title || 'Draft Campaign Test',
          subject: subject || 'Newsletter Preview',
          fromName,
          fromEmail: fromEmail || undefined,
          htmlContent,
          plainContent,
        }),
      });
      const campData = await campRes.json();
      if (!campData.campaign?.id) throw new Error('Failed to create test draft');

      const testRes = await fetch(`/api/campaigns/${campData.campaign.id}/test`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ testEmail }),
      });
      const testData = await testRes.json();
      if (testData.success) {
        alert(`✓ Test email dispatched to ${testEmail}! Check your inbox.`);
      }
    } catch (err) {
      alert('Error dispatching test email: ' + err.message);
    } finally {
      setTesting(false);
    }
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!selectedListId || !title.trim() || !subject.trim() || !htmlContent.trim()) {
      alert('Please fill out all required fields (List, Title, Subject, Content)');
      return;
    }

    setSaving(true);
    try {
      const res = await fetch('/api/campaigns', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({
          listId: parseInt(selectedListId, 10),
          title: title.trim(),
          subject: subject.trim(),
          fromName: fromName.trim(),
          fromEmail: fromEmail.trim() || undefined,
          htmlContent,
          plainContent,
        }),
      });
      const data = await res.json();
      if (data.success) {
        onSave?.(data.campaign);
      }
    } catch (err) {
      alert('Failed to save campaign: ' + err.message);
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="card" style={{ maxWidth: 850, margin: '0 auto', padding: '1.5rem', display: 'flex', flexDirection: 'column', gap: '1rem' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', borderBottom: '1px solid var(--color-border)', paddingBottom: '0.75rem' }}>
        <h3 style={{ margin: 0 }}>Design Newsletter Campaign</h3>
        <button type="button" className="btn btn-ghost btn-sm" onClick={onCancel}>Cancel</button>
      </div>

      <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem' }}>
          <div>
            <label className="form-label">Recipient Mailing List:</label>
            <select
              className="input"
              value={selectedListId}
              onChange={(e) => setSelectedListId(e.target.value)}
              required
            >
              {lists.map((l) => (
                <option key={l.id} value={l.id}>
                  {l.name} ({l.total_subscribers || 0} subscribers)
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className="form-label">Internal Campaign Title:</label>
            <input
              className="input"
              placeholder="e.g. August 2026 Product Update"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              required
            />
          </div>
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: '2fr 1fr', gap: '1rem' }}>
          <div>
            <label className="form-label">Email Subject Line:</label>
            <input
              className="input"
              placeholder="e.g. Exciting improvements to WoxMail Sovereign Suite"
              value={subject}
              onChange={(e) => setSubject(e.target.value)}
              required
            />
          </div>
          <div>
            <label className="form-label">Sender Name:</label>
            <input
              className="input"
              placeholder="e.g. WoxMail Team"
              value={fromName}
              onChange={(e) => setFromName(e.target.value)}
            />
          </div>
        </div>

        {/* Merge Tag Chips */}
        <div>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.4rem' }}>
            <label className="form-label" style={{ margin: 0 }}>HTML Template & Merge Tags:</label>
            <div style={{ display: 'flex', gap: '0.35rem' }}>
              <button type="button" className="btn btn-secondary btn-xs" onClick={() => insertMergeTag('{{first_name}}')}>
                + {{first_name}}
              </button>
              <button type="button" className="btn btn-secondary btn-xs" onClick={() => insertMergeTag('{{last_name}}')}>
                + {{last_name}}
              </button>
              <button type="button" className="btn btn-secondary btn-xs" onClick={() => insertMergeTag('{{email}}')}>
                + {{email}}
              </button>
              <button type="button" className="btn btn-secondary btn-xs" onClick={() => insertMergeTag('{{unsubscribe_url}}')}>
                + {{unsubscribe_url}}
              </button>
            </div>
          </div>
          <textarea
            className="input mono"
            style={{ minHeight: '260px', fontSize: '0.8125rem', lineHeight: 1.5 }}
            value={htmlContent}
            onChange={(e) => setHtmlContent(e.target.value)}
            required
          />
        </div>

        {/* Test Email Dispatcher */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', background: 'var(--color-bg-page)', padding: '0.75rem 1rem', borderRadius: 'var(--radius-sm)', border: '1px solid var(--color-border)' }}>
          <span style={{ fontSize: '0.8125rem', fontWeight: 600 }}>Send Test Preview:</span>
          <input
            className="input"
            placeholder="your-email@example.com"
            value={testEmail}
            onChange={(e) => setTestEmail(e.target.value)}
            style={{ maxWidth: 260, fontSize: '0.8125rem', padding: '0.35rem 0.6rem' }}
          />
          <button
            type="button"
            className="btn btn-secondary btn-sm"
            disabled={testing}
            onClick={handleTestSend}
          >
            {testing ? 'Sending...' : 'Dispatch Preview'}
          </button>
        </div>

        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '0.5rem', marginTop: '0.5rem' }}>
          <button type="button" className="btn btn-secondary" onClick={onCancel}>
            Cancel
          </button>
          <button type="submit" className="btn btn-primary" disabled={saving}>
            {saving ? 'Saving...' : 'Save & Prepare Broadcast'}
          </button>
        </div>
      </form>
    </div>
  );
}
