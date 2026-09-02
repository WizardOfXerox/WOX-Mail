import React, { useState, useEffect, useRef } from 'react';
import { get, post } from '../../shared/api.js';
import SchedulePopover from './SchedulePopover.jsx';
import RecipientInput from './RecipientInput.jsx';

export default function ComposeModal({ user, activeAccount, replyData, originalMessage, onSend, onClose }) {
  const [to, setTo] = useState('');
  const [cc, setCc] = useState('');
  const [bcc, setBcc] = useState('');
  const [subject, setSubject] = useState('');
  const [body, setBody] = useState('');
  const [showCc, setShowCc] = useState(false);
  const [attachments, setAttachments] = useState([]);
  const [sending, setSending] = useState(false);
  const [error, setError] = useState('');
  const [showSchedulePopover, setShowSchedulePopover] = useState(false);
  const [aliases, setAliases] = useState([]);
  const [fromAddress, setFromAddress] = useState(() => activeAccount?.email || user?.email || '');
  const [isAliasAutoMatched, setIsAliasAutoMatched] = useState(false);
  const [isCustomFrom, setIsCustomFrom] = useState(false);
  const [customFromInput, setCustomFromInput] = useState('');
  const [trackOpens, setTrackOpens] = useState(true);
  const toRef = useRef(null);
  const fileInputRef = useRef(null);
  const editorRef = useRef(null);
  const scheduleBtnRef = useRef(null);

  // Update fromAddress when activeAccount changes
  useEffect(() => {
    if (activeAccount?.email) {
      setFromAddress(activeAccount.email);
    }
  }, [activeAccount]);

  // Fetch active aliases and live Proton account custom addresses
  useEffect(() => {
    const fetchAllAliases = async () => {
      let combined = [];
      try {
        const res = await get('/aliases');
        if (res && res.aliases) {
          combined = res.aliases.filter((a) => (a.enabled ?? a.is_enabled));
        }
      } catch {}

      const currentEmail = (activeAccount?.email || user?.email || '').toLowerCase();
      if (currentEmail.includes('@proton.') || currentEmail.includes('@pm.me')) {
        try {
          const protonRes = await get(`/proton/addresses?email=${encodeURIComponent(currentEmail)}`);
          if (protonRes && protonRes.addresses) {
            const existing = new Set(combined.map((a) => (a.alias_address || a.alias_email || a.address || '').toLowerCase()));
            for (const p of protonRes.addresses) {
              if (p && p.alias_address && !existing.has(p.alias_address.toLowerCase()) && p.alias_address.toLowerCase() !== currentEmail) {
                combined.push(p);
              }
            }
          }
        } catch {}

        // Standard Proton aliases
        const username = currentEmail.split('@')[0];
        const standardProton = [
          { alias_address: `${username}@pm.me`, note: 'Proton Short Alias (@pm.me)', source: 'proton', enabled: true },
          { alias_address: `${username}@protonmail.com`, note: 'Proton Classic Alias (@protonmail.com)', source: 'proton', enabled: true },
        ];
        const existing = new Set(combined.map((a) => (a.alias_address || a.alias_email || a.address || '').toLowerCase()));
        for (const p of standardProton) {
          if (!existing.has(p.alias_address.toLowerCase()) && p.alias_address.toLowerCase() !== currentEmail) {
            combined.push(p);
          }
        }
      }
      setAliases(combined);
    };

    fetchAllAliases();
  }, [activeAccount, user]);

  // Privacy Auto-Guard: Check if original message was addressed to one of user's active aliases
  useEffect(() => {
    if (!originalMessage || !aliases.length) return;
    const incomingAddrs = [
      ...(originalMessage.to || []),
      ...(originalMessage.cc || []),
    ].map((r) => (typeof r === 'object' ? (r.address || r.email || '') : String(r || '')).toLowerCase());

    const matchedAlias = aliases.find((a) => {
      const addr = (a.alias_address || a.alias_email || '').toLowerCase();
      return incomingAddrs.includes(addr);
    });

    if (matchedAlias) {
      const addr = matchedAlias.alias_address || matchedAlias.alias_email;
      setFromAddress(addr);
      setIsAliasAutoMatched(true);
    }
  }, [aliases, originalMessage]);

  const [quotedInfo, setQuotedInfo] = useState(null);
  const [showQuotedPreview, setShowQuotedPreview] = useState(false);
  const [includeQuote, setIncludeQuote] = useState(true);

  // Pre-fill for reply/forward
  useEffect(() => {
    if (!originalMessage) return;

    const fromName = originalMessage.from?.name || (typeof originalMessage.from === 'string' ? originalMessage.from : originalMessage.from?.address) || originalMessage.from_name || originalMessage.sender || 'Unknown';
    const fromAddr = (typeof originalMessage.from === 'string' ? originalMessage.from : originalMessage.from?.address) || originalMessage.from?.email || originalMessage.sender || '';
    const quotedDate = originalMessage.date ? new Date(originalMessage.date).toLocaleString() : '';

    if (replyData?.forward) {
      const prefix = originalMessage.subject?.toLowerCase().startsWith('fwd:') ? '' : 'Fwd: ';
      setSubject(`${prefix}${originalMessage.subject || ''}`);
      setBody('');
      setQuotedInfo({
        header: `---------- Forwarded message ---------\nFrom: ${fromName} <${fromAddr}>\nDate: ${quotedDate}\nSubject: ${originalMessage.subject || ''}`,
        text: originalMessage.text || '',
        html: originalMessage.html || `<p style="margin: 0;">${(originalMessage.text || '').replace(/\n/g, '<br>')}</p>`,
        type: 'forward',
      });
    } else {
      // Reply
      const replyTo = originalMessage.replyTo?.address || originalMessage.replyTo || fromAddr || '';
      setTo(replyTo);

      if (replyData?.replyAll) {
        const userEmail = (activeAccount?.email || user?.email || '').toLowerCase();
        const allRecipients = [
          ...(originalMessage.to || []),
          ...(originalMessage.cc || []),
        ]
          .map((r) => (typeof r === 'object' ? (r.address || r.email || '') : String(r || '')))
          .filter((a) => a && a.toLowerCase() !== userEmail && a.toLowerCase() !== replyTo.toLowerCase());

        if (allRecipients.length > 0) {
          setCc(allRecipients.join(', '));
          setShowCc(true);
        }
      }

      const prefix = originalMessage.subject?.toLowerCase().startsWith('re:') ? '' : 'Re: ';
      setSubject(`${prefix}${originalMessage.subject || ''}`);
      setBody('');
      setQuotedInfo({
        header: `On ${quotedDate}, ${fromName} <${fromAddr}> wrote:`,
        text: originalMessage.text || '',
        html: originalMessage.html || `<p style="margin: 0;">${(originalMessage.text || '').replace(/\n/g, '<br>')}</p>`,
        type: 'reply',
      });
    }

    // Auto-focus the editor when replying so user can type immediately
    setTimeout(() => {
      if (editorRef.current) {
        editorRef.current.focus();
      }
    }, 120);
  }, [originalMessage, replyData, user, activeAccount]);

  // Focus to field on mount & listen for Escape key to close modal (WCAG 2.2 AA)
  useEffect(() => {
    if (!replyData) toRef.current?.focus();
    const handleKeyDown = (e) => {
      if (e.key === 'Escape' && !showSchedulePopover) onClose();
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [onClose, replyData, showSchedulePopover]);

  // Security Modes: 'standard' | 'vault' | 'stream' | 'expunge'
  const [securityMode, setSecurityMode] = useState('standard');
  const [passcode, setPasscode] = useState(() => Math.floor(100000 + Math.random() * 900000).toString());
  const [expirationHours, setExpirationHours] = useState(24);
  const [expiryMode, setExpiryMode] = useState('preset'); // 'preset' | 'days' | 'date'
  const [customDays, setCustomDays] = useState(1);
  const [customDate, setCustomDate] = useState(() => {
    const d = new Date();
    d.setDate(d.getDate() + 7);
    return d.toISOString().split('T')[0];
  });
  const [maxViews, setMaxViews] = useState(1);
  const [destroyAfterRead, setDestroyAfterRead] = useState(true);
  const [watermarkEnabled, setWatermarkEnabled] = useState(true);
  const [sentSuccessData, setSentSuccessData] = useState(null);

  // Real-Time Pre-Flight Recipient Verification State
  const [recipientVerification, setRecipientVerification] = useState(null);

  useEffect(() => {
    const rawTo = to.trim();
    if (!rawTo || !rawTo.includes('@') || rawTo.length < 5) {
      setRecipientVerification(null);
      return;
    }

    const timer = setTimeout(async () => {
      try {
        const res = await get(`/mail/verify-recipient?email=${encodeURIComponent(rawTo)}`);
        if (res) {
          setRecipientVerification(res);
        }
      } catch {
        setRecipientVerification(null);
      }
    }, 400);

    return () => clearTimeout(timer);
  }, [to]);

  const getEffectiveExpirationHours = () => {
    if (expiryMode === 'days') {
      return Math.max(1, Math.round(Number(customDays) * 24));
    }
    if (expiryMode === 'date') {
      const target = new Date(customDate + 'T23:59:59');
      const diffMs = target.getTime() - Date.now();
      return Math.max(1, Math.round(diffMs / (1000 * 3600)));
    }
    return Number(expirationHours);
  };

  const generateNewPin = () => {
    setPasscode(Math.floor(100000 + Math.random() * 900000).toString());
  };

  // ─── WYSIWYG Formatting Ribbon ──────────────────────────
  const execFormat = (command, value = null) => {
    document.execCommand(command, false, value);
    if (editorRef.current) {
      setBody(editorRef.current.innerHTML);
    }
  };

  const promptLink = () => {
    const url = prompt('Enter link URL (e.g. https://example.com):');
    if (url) execFormat('createLink', url);
  };

  // Handle File Uploads (Images, Videos, Files, PDFs, etc.)
  const handleFileSelect = (e) => {
    const files = Array.from(e.target.files || []);
    if (!files.length) return;

    files.forEach((file) => {
      if (file.size > 25 * 1024 * 1024) {
        setError(`⚠️ Large Attachment Warning: "${file.name}" (${(file.size / (1024 * 1024)).toFixed(1)}MB) exceeds the 25MB threshold. Client-side OpenPGP streaming chunk encryption enabled.`);
      }

      const reader = new FileReader();
      reader.onload = (loadEvt) => {
        setAttachments((prev) => [
          ...prev,
          {
            name: file.name,
            size: file.size,
            type: file.type || 'application/octet-stream',
            content: loadEvt.target.result,
            isImage: file.type.startsWith('image/'),
            isVideo: file.type.startsWith('video/'),
          },
        ]);
      };
      reader.readAsDataURL(file);
    });

    if (fileInputRef.current) fileInputRef.current.value = '';
  };

  const removeAttachment = (index) => {
    setAttachments((prev) => prev.filter((_, i) => i !== index));
  };

  const formatFileSize = (bytes) => {
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  };

  const handleFormSubmit = async (e, scheduledAt = null) => {
    if (e) e.preventDefault();
    if (!to.trim()) return;
    setError('');

    const rawEffectiveBody = editorRef.current ? editorRef.current.innerHTML : body;
    const rawPlainText = editorRef.current ? editorRef.current.innerText : body;

    let effectiveBody = rawEffectiveBody;
    let plainText = rawPlainText;

    if (quotedInfo && includeQuote) {
      if (quotedInfo.type === 'forward') {
        effectiveBody = `${rawEffectiveBody}<br><br><div class="gmail_quote_forward" style="margin-top: 1.5rem; padding-top: 1rem; border-top: 1px dashed #444; color: #888;"><pre style="font-family: inherit; margin: 0 0 1rem 0;">${quotedInfo.header}</pre><div>${quotedInfo.html}</div></div>`;
        plainText = `${rawPlainText}\n\n${quotedInfo.header}\n\n${quotedInfo.text}`;
      } else {
        effectiveBody = `${rawEffectiveBody}<br><br><div class="gmail_quote" style="margin-top: 1.5rem; padding-left: 0.75rem; border-left: 2px solid #7c3aed; color: #888;"><div dir="ltr" class="gmail_attr" style="margin-bottom: 0.5rem; color: #888;">${quotedInfo.header}</div><blockquote style="margin: 0; padding: 0;">${quotedInfo.html}</blockquote></div>`;
        plainText = `${rawPlainText}\n\n${quotedInfo.header}\n> ${(quotedInfo.text || '').split('\n').join('\n> ')}`;
      }
    }

    setSending(true);
    try {
      if (securityMode === 'vault') {
        const data = await post('/mail/secure-send', {
          recipientEmail: to.trim(),
          subject: subject.trim() || 'Confidential Message',
          content: effectiveBody,
          passcode,
          expirationHours: getEffectiveExpirationHours(),
          destroyAfterRead,
          watermarkEnabled,
        });

        setSentSuccessData({
          type: 'vault',
          recipient: to.trim(),
          passcode,
          unlockUrl: data.unlockUrl,
          expiresAt: data.expiresAt,
        });
      } else if (securityMode === 'stream') {
        const data = await post('/ephemeral/send', {
          recipientEmail: to.trim(),
          subject: subject.trim() || 'Confidential Ephemeral Message',
          content: plainText,
          maxViews: Math.max(1, parseInt(maxViews, 10) || 1),
          expirationHours: getEffectiveExpirationHours(),
        });

        setSentSuccessData({
          type: 'stream',
          recipient: to.trim(),
          streamUrl: data.streamUrl,
          expiresAt: data.expiresAt,
        });
      } else if (securityMode === 'expunge') {
        await onSend({
          from: fromAddress,
          to: to.trim(),
          cc: cc.trim() || undefined,
          bcc: bcc.trim() || undefined,
          subject: `[Burn on Read] ${subject.trim() || 'Confidential Message'}`,
          text: plainText,
          html: effectiveBody,
          scheduledAt,
          attachments: attachments.map((a) => ({
            filename: a.name,
            content: a.content,
            contentType: a.type,
          })),
          headers: {
            'X-Wox-Ephemeral': 'auto-expunge',
            'X-Ephemeral-Burn': 'true',
          },
        });
        onClose();
      } else {
        await onSend({
          from: fromAddress,
          to: to.trim(),
          cc: cc.trim() || undefined,
          bcc: bcc.trim() || undefined,
          subject: subject.trim(),
          text: plainText,
          html: effectiveBody,
          scheduledAt,
          trackOpens,
          attachments: attachments.map((a) => ({
            filename: a.name,
            content: a.content,
            contentType: a.type,
          })),
        });
        onClose();
      }
    } catch (err) {
      setError(err.message || 'Failed to send email');
    } finally {
      setSending(false);
    }
  };

  if (sentSuccessData) {
    if (sentSuccessData.type === 'stream') {
      return (
        <div className="compose-overlay" onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}>
          <div className="compose-modal card" style={{ maxWidth: 540, textAlign: 'center', padding: '2rem' }}>
            <span style={{ display: 'inline-flex', color: 'var(--color-warning)' }}><svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"><path d="M8.5 14.5A2.5 2.5 0 0 0 11 12c0-1.38-.5-2-1-3-1.072-2.143-.224-4.054 2-6 .5 2.5 2 4.9 4 6.5 2 1.6 3 3.5 3 5.5a7 7 0 1 1-14 0c0-1.153.433-2.294 1-3a2.5 2.5 0 0 0 2.5 2.5z"/></svg></span>
            <h2 style={{ margin: '0.5rem 0' }}>Zero-Click In-Inbox Stream Sent!</h2>
            <p className="text-secondary" style={{ fontSize: '0.875rem', marginBottom: '1.5rem' }}>
              Your confidential message was sent to <strong>{sentSuccessData.recipient}</strong>. It will render directly inside their email client (Gmail, Outlook, Apple Mail) and <strong>permanently self-destruct once viewed</strong>.
            </p>
            <button type="button" className="btn btn-primary" onClick={onClose}>
              Done
            </button>
          </div>
        </div>
      );
    }

    const shareText = `Here is your passcode to unlock the secure confidential message: ${sentSuccessData.passcode}\nUnlock link: ${sentSuccessData.unlockUrl}`;
    return (
      <div className="compose-overlay" onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}>
        <div className="compose-modal card" style={{ maxWidth: 540, textAlign: 'center', padding: '2rem' }}>
          <span style={{ display: 'inline-flex', color: 'var(--color-primary-light)' }}><svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"><rect width="18" height="11" x="3" y="11" rx="2" ry="2"/><path d="M7 11V7a5 5 0 0 1 10 0v4"/></svg></span>
          <h2 style={{ margin: '0.5rem 0' }}>Confidential Message Dispatched!</h2>
          <p className="text-secondary" style={{ fontSize: '0.875rem', marginBottom: '1.5rem' }}>
            A notification email with the secure unlock link was sent to <strong>{sentSuccessData.recipient}</strong>.
          </p>
          <div style={{ background: 'var(--color-bg-page)', border: '1px solid var(--color-border)', borderRadius: 'var(--radius-md)', padding: '1rem', marginBottom: '1.5rem', textAlign: 'left' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.5rem' }}>
              <span className="text-secondary" style={{ fontSize: '0.75rem', fontWeight: 600 }}>UNLOCK PASSCODE</span>
              <button
                type="button"
                className="btn btn-ghost btn-xs"
                onClick={() => {
                  navigator.clipboard.writeText(sentSuccessData.passcode);
                  alert('Passcode copied to clipboard!');
                }}
              >
                Copy PIN
              </button>
            </div>
            <div className="mono" style={{ fontSize: '1.5rem', fontWeight: 800, letterSpacing: '0.2em', color: 'var(--color-primary-light)', textAlign: 'center' }}>
              {sentSuccessData.passcode}
            </div>
          </div>
          <button type="button" className="btn btn-primary" onClick={onClose}>
            Done
          </button>
        </div>
      </div>
    );
  }

  return (
    <div
      className="compose-overlay"
      onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}
      role="dialog"
      aria-modal="true"
      aria-labelledby="compose-modal-title"
    >
      <div className="compose-modal card" style={{ maxWidth: 740 }}>
        <div className="compose-header">
          <h3 id="compose-modal-title">
            {replyData?.forward ? 'Forward' : replyData ? 'Reply' : 'New Message'}
          </h3>
          <button type="button" className="btn btn-ghost btn-xs" onClick={onClose} aria-label="Close compose modal">
            ✕
          </button>
        </div>

        {error && <div className="compose-error">{error}</div>}

        <form onSubmit={(e) => handleFormSubmit(e)} className="compose-form">
          {/* Sender Identity (Primary or Alias) */}
          <div className="compose-field" style={{ position: 'relative', alignItems: 'center' }}>
            <label className="compose-label">From:</label>
            {!isCustomFrom ? (
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', flex: 1 }}>
                <select
                  className="compose-input"
                  value={fromAddress}
                  onChange={(e) => {
                    if (e.target.value === '__custom__') {
                      setIsCustomFrom(true);
                      setCustomFromInput('');
                    } else {
                      setFromAddress(e.target.value);
                      setIsAliasAutoMatched(false);
                    }
                  }}
                  style={{
                    flex: 1,
                    fontSize: '0.85rem',
                    cursor: 'pointer',
                    padding: '0.35rem 0.5rem',
                    borderRadius: 'var(--radius-sm)',
                    border: isAliasAutoMatched ? '1px solid var(--color-primary)' : '1px solid var(--color-border)',
                    background: isAliasAutoMatched ? 'rgba(124, 58, 237, 0.08)' : 'var(--color-bg-input)',
                    color: 'var(--color-text-primary)',
                  }}
                >
                  {(() => {
                    const primaryEmail = activeAccount?.email || user?.email;
                    const options = [];
                    if (primaryEmail) {
                      options.push(
                        <option key="primary" value={primaryEmail}>
                          {primaryEmail} {activeAccount?.provider === 'proton' ? '(Proton Primary Address)' : '(Primary Address)'}
                        </option>
                      );
                    }
                    aliases.forEach((a) => {
                      const addr = a.alias_address || a.alias_email || a.address;
                      if (addr && addr.toLowerCase() !== primaryEmail?.toLowerCase()) {
                        const desc = a.note || a.label || a.description || (a.source === 'proton' ? 'Proton Alias' : 'Alias');
                        options.push(
                          <option key={addr} value={addr}>
                            {addr} ({desc})
                          </option>
                        );
                      }
                    });
                    options.push(
                      <option key="__custom__" value="__custom__">
                        + Enter Custom Proton / Domain Alias...
                      </option>
                    );
                    return options;
                  })()}
                </select>
              </div>
            ) : (
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', flex: 1 }}>
                <input
                  type="email"
                  className="compose-input"
                  placeholder="e.g. custom_alias@proton.me or handle@domain.com"
                  value={customFromInput}
                  onChange={(e) => {
                    setCustomFromInput(e.target.value);
                    setFromAddress(e.target.value);
                  }}
                  autoFocus
                  style={{
                    flex: 1,
                    fontSize: '0.85rem',
                    padding: '0.35rem 0.5rem',
                    borderRadius: 'var(--radius-sm)',
                    border: '1px solid var(--color-primary)',
                    background: 'var(--color-bg-input)',
                    color: 'var(--color-text-primary)',
                  }}
                />
                <button
                  type="button"
                  className="btn btn-secondary btn-xs"
                  onClick={() => {
                    setIsCustomFrom(false);
                    setFromAddress(activeAccount?.email || user?.email || '');
                  }}
                  title="Switch back to standard dropdown list"
                >
                  List
                </button>
              </div>
            )}
            {isAliasAutoMatched && (
              <span
                className="badge badge-purple"
                title="Privacy Guard: This reply will send from your alias so your real primary email is not exposed"
                style={{ fontSize: '0.7rem', whiteSpace: 'nowrap', display: 'inline-flex', alignItems: 'center', gap: '0.25rem', padding: '0.2rem 0.5rem' }}
              >
                <span style={{ display: 'inline-flex', alignItems: 'center', gap: '0.35rem' }}><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/></svg><span>Alias Reply Guard</span></span>
              </span>
            )}
          </div>

          <div className="compose-field" style={{ position: 'relative', flexWrap: 'wrap', gap: '0.4rem', alignItems: 'center' }}>
            <label className="compose-label">To:</label>
            <RecipientInput
              inputRef={toRef}
              className="compose-input"
              style={{ minWidth: 220 }}
              value={to}
              onChange={setTo}
              placeholder="recipient@example.com"
              required
            />
            {recipientVerification && (
              <div style={{ display: 'inline-flex', alignItems: 'center', gap: '0.35rem' }}>
                {recipientVerification.suggestion ? (
                  <button
                    type="button"
                    onClick={() => {
                      setTo(recipientVerification.suggestion);
                      setRecipientVerification(null);
                    }}
                    className="badge badge-amber"
                    style={{ border: '1px solid rgba(245, 158, 11, 0.4)', cursor: 'pointer', fontSize: '0.72rem', padding: '0.2rem 0.55rem', borderRadius: 'var(--radius-pill)', background: 'rgba(245, 158, 11, 0.15)' }}
                    title="Click to fix typo"
                  >
                    Did you mean <u>{recipientVerification.suggestion}</u>?
                  </button>
                ) : recipientVerification.valid ? (
                  <span
                    className="badge badge-green"
                    style={{ fontSize: '0.72rem', padding: '0.2rem 0.5rem', borderRadius: 'var(--radius-pill)', background: 'rgba(34, 197, 94, 0.15)', color: 'var(--color-success)' }}
                    title="Domain has active MX servers"
                  >
                    MX Verified
                  </span>
                ) : (
                  <span
                    className="badge badge-red"
                    style={{ fontSize: '0.72rem', padding: '0.2rem 0.5rem', borderRadius: 'var(--radius-pill)', background: 'rgba(239, 68, 68, 0.15)', color: 'var(--color-error)' }}
                    title={recipientVerification.reason}
                  >
                    {recipientVerification.reason?.includes('MX') ? 'No MX Records' : 'Invalid Email'}
                  </span>
                )}
              </div>
            )}
            {!showCc && (
              <button
                type="button"
                className="compose-cc-toggle"
                onClick={() => setShowCc(true)}
                title="Add Carbon Copy / Blind Carbon Copy"
              >
                + Cc/Bcc
              </button>
            )}
          </div>

          {showCc && (
            <>
              <div className="compose-field" style={{ position: 'relative', alignItems: 'center' }}>
                <label className="compose-label">Cc:</label>
                <RecipientInput
                  className="compose-input"
                  value={cc}
                  onChange={setCc}
                  placeholder="recipient2@example.com (comma separated)"
                />
              </div>
              <div className="compose-field" style={{ position: 'relative', alignItems: 'center' }}>
                <label className="compose-label">Bcc:</label>
                <RecipientInput
                  className="compose-input"
                  value={bcc}
                  onChange={setBcc}
                  placeholder="blind_recipient@example.com (blind carbon copy)"
                />
              </div>
            </>
          )}

          <div className="compose-field">
            <label className="compose-label">Subject:</label>
            <input
              className="compose-input"
              type="text"
              value={subject}
              onChange={(e) => setSubject(e.target.value)}
              placeholder="Subject line"
            />
          </div>

          {/* Security Mode Selector */}
          <div className="compose-security-bar">
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: '0.5rem' }}>
              <span className="text-secondary" style={{ fontSize: '0.75rem', fontWeight: 600, letterSpacing: '0.04em' }}>TRANSMISSION SECURITY:</span>
              <div style={{ display: 'flex', gap: '0.35rem', flexWrap: 'wrap' }}>
                <button
                  type="button"
                  className={`compose-security-pill ${securityMode === 'standard' ? 'active' : ''}`}
                  onClick={() => setSecurityMode('standard')}
                >
                  Standard
                </button>
                <button
                  type="button"
                  className={`compose-security-pill ${securityMode === 'vault' ? 'active' : ''}`}
                  onClick={() => setSecurityMode('vault')}
                >
                  Enclave Vault (PIN)
                </button>
                <button
                  type="button"
                  className={`compose-security-pill ${securityMode === 'stream' ? 'active' : ''}`}
                  onClick={() => setSecurityMode('stream')}
                >
                  In-Inbox Burner
                </button>
                <button
                  type="button"
                  className={`compose-security-pill ${securityMode === 'expunge' ? 'active' : ''}`}
                  onClick={() => setSecurityMode('expunge')}
                >
                  Auto-Expunge
                </button>
              </div>
            </div>

            {securityMode === 'vault' && (
              <div style={{ marginTop: '0.75rem', display: 'flex', flexDirection: 'column', gap: '0.75rem', animation: 'fadeIn 0.2s ease' }}>
                <div style={{ display: 'flex', gap: '1rem', alignItems: 'center', flexWrap: 'wrap' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                    <span className="text-secondary" style={{ fontSize: '0.8125rem', fontWeight: 600 }}>PIN:</span>
                    <input
                      type="text"
                      className="input mono"
                      value={passcode}
                      onChange={(e) => setPasscode(e.target.value)}
                      style={{ width: '110px', fontWeight: 700, textAlign: 'center' }}
                      maxLength={12}
                    />
                    <button type="button" className="btn btn-secondary btn-xs" onClick={generateNewPin}>
                      Randomize
                    </button>
                  </div>

                  <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', flexWrap: 'wrap' }}>
                    <label style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', fontSize: '0.8125rem', cursor: 'pointer' }}>
                      <input
                        type="checkbox"
                        checked={expiryMode === 'never'}
                        onChange={(e) => setExpiryMode(e.target.checked ? 'never' : 'preset')}
                      />
                      <span>Never Expire (Until Viewed)</span>
                    </label>

                    {expiryMode !== 'never' && (
                      <select
                        className="input"
                        value={expirationHours}
                        onChange={(e) => setExpirationHours(e.target.value)}
                        style={{ width: '130px', padding: '0.35rem 0.5rem', fontSize: '0.8125rem' }}
                      >
                        <option value="1">1 Hour</option>
                        <option value="6">6 Hours</option>
                        <option value="24">24 Hours (1 Day)</option>
                        <option value="72">3 Days</option>
                        <option value="168">7 Days</option>
                      </select>
                    )}
                  </div>
                </div>

                {/* Vault Options */}
                <div style={{ display: 'flex', gap: '1.25rem', alignItems: 'center', flexWrap: 'wrap', paddingTop: '0.25rem', borderTop: '1px solid var(--color-border)' }}>
                  <label style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', fontSize: '0.8125rem', cursor: 'pointer' }}>
                    <input
                      type="checkbox"
                      checked={destroyAfterRead}
                      onChange={(e) => setDestroyAfterRead(e.target.checked)}
                    />
                    <span>Burn on read (Destroy immediately after first PIN unlock)</span>
                  </label>

                  <label style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', fontSize: '0.8125rem', cursor: 'pointer' }}>
                    <input
                      type="checkbox"
                      checked={watermarkEnabled}
                      onChange={(e) => setWatermarkEnabled(e.target.checked)}
                    />
                    <span>Dynamic recipient watermark</span>
                  </label>
                </div>
              </div>
            )}
          </div>

          {/* WYSIWYG Formatting Ribbon Toolbar */}
          <div className="compose-ribbon">
            <button type="button" className="compose-ribbon-btn" onClick={() => execFormat('bold')} title="Bold (Ctrl+B)"><strong>B</strong></button>
            <button type="button" className="compose-ribbon-btn" onClick={() => execFormat('italic')} title="Italic (Ctrl+I)"><em>I</em></button>
            <button type="button" className="compose-ribbon-btn" onClick={() => execFormat('underline')} title="Underline (Ctrl+U)"><u>U</u></button>
            <button type="button" className="compose-ribbon-btn" onClick={() => execFormat('strikeThrough')} title="Strikethrough"><s>S</s></button>
            <div style={{ width: 1, height: 16, background: 'var(--color-border)', margin: '0 4px' }} />
            <button type="button" className="compose-ribbon-btn" onClick={() => execFormat('insertUnorderedList')} title="Bullet list">• List</button>
            <button type="button" className="compose-ribbon-btn" onClick={() => execFormat('insertOrderedList')} title="Numbered list">1. List</button>
            <button type="button" className="compose-ribbon-btn" onClick={() => execFormat('formatBlock', 'blockquote')} title="Blockquote">” Quote</button>
            <button type="button" className="compose-ribbon-btn" onClick={() => execFormat('formatBlock', 'pre')} title="Code block">&lt;/&gt;</button>
            <button type="button" className="compose-ribbon-btn" onClick={promptLink} title="Insert Link">Link</button>
            <button type="button" className="compose-ribbon-btn" onClick={() => execFormat('removeFormat')} title="Clear format" style={{ display: "inline-flex", alignItems: "center", gap: "0.25rem" }}><svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M18 6 6 18"/><path d="m6 6 12 12"/></svg><span>Clear</span></button>
          </div>

          {/* WYSIWYG ContentEditable Body */}
          <div className="compose-body-field">
            <div
              ref={editorRef}
              contentEditable
              className="compose-textarea"
              style={{
                minHeight: '200px',
                maxHeight: '350px',
                overflowY: 'auto',
                padding: '0.875rem',
                outline: 'none',
                lineHeight: 1.6,
              }}
              dangerouslySetInnerHTML={{ __html: body }}
              onBlur={(e) => setBody(e.currentTarget.innerHTML)}
            />
          </div>

          {/* Collapsible Quoted Email History (Gmail-Style) */}
          {quotedInfo && (
            <div
              style={{
                padding: '0.6rem 1.25rem',
                borderTop: '1px solid var(--color-border)',
                background: 'rgba(255, 255, 255, 0.02)',
                display: 'flex',
                flexDirection: 'column',
                gap: '0.5rem',
              }}
            >
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: '0.5rem' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                  <button
                    type="button"
                    onClick={() => setShowQuotedPreview(!showQuotedPreview)}
                    className="btn btn-secondary btn-xs"
                    style={{
                      padding: '0.25rem 0.65rem',
                      fontSize: '0.75rem',
                      borderRadius: 'var(--radius-pill)',
                      display: 'inline-flex',
                      alignItems: 'center',
                      gap: '0.35rem',
                      background: showQuotedPreview ? 'var(--color-bg-hover)' : 'var(--color-bg-elevated)',
                    }}
                    title={showQuotedPreview ? 'Hide original message' : 'Expand original message'}
                  >
                    <span>{showQuotedPreview ? '▼' : '⋯'}</span>
                    <span>{showQuotedPreview ? 'Hide quoted text' : 'Show quoted text'}</span>
                  </button>
                  <span
                    className="text-tertiary"
                    style={{
                      fontSize: '0.75rem',
                      maxWidth: '300px',
                      overflow: 'hidden',
                      textOverflow: 'ellipsis',
                      whiteSpace: 'nowrap',
                    }}
                  >
                    {quotedInfo.header.split('\n')[0]}
                  </span>
                </div>

                {includeQuote ? (
                  <button
                    type="button"
                    onClick={() => setIncludeQuote(false)}
                    className="btn btn-ghost btn-xs"
                    style={{ color: 'var(--color-text-tertiary)', fontSize: '0.72rem' }}
                    title="Remove original message quote from reply"
                  >
                    ✕ Remove quote
                  </button>
                ) : (
                  <button
                    type="button"
                    onClick={() => setIncludeQuote(true)}
                    className="btn btn-ghost btn-xs"
                    style={{ color: 'var(--color-primary-light)', fontSize: '0.72rem' }}
                    title="Include original message quote in reply"
                  >
                    + Restore quote
                  </button>
                )}
              </div>

              {showQuotedPreview && includeQuote && (
                <div
                  style={{
                    maxHeight: '160px',
                    overflowY: 'auto',
                    padding: '0.75rem 1rem',
                    background: 'var(--color-bg-input)',
                    borderRadius: 'var(--radius-sm)',
                    borderLeft: '3px solid var(--color-primary)',
                    fontSize: '0.8rem',
                    color: 'var(--color-text-secondary)',
                    lineHeight: 1.5,
                  }}
                  dangerouslySetInnerHTML={{ __html: quotedInfo.html }}
                />
              )}
            </div>
          )}

          {/* Attachment Preview Bar */}
          {attachments.length > 0 && (
            <div style={{ padding: '0.5rem 1.25rem', borderTop: '1px solid var(--color-border)', background: 'var(--color-bg-page)', display: 'flex', flexWrap: 'wrap', gap: '0.5rem' }}>
              {attachments.map((att, idx) => (
                <div
                  key={idx}
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: '0.5rem',
                    background: 'var(--color-bg-card)',
                    border: '1px solid var(--color-border)',
                    borderRadius: 'var(--radius-sm)',
                    padding: '0.35rem 0.65rem',
                    fontSize: '0.8125rem',
                  }}
                >
                  {att.isImage ? (
                    <img src={att.content} alt={att.name} style={{ width: 22, height: 22, objectFit: 'cover', borderRadius: 4 }} />
                  ) : att.isVideo ? (
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polygon points="23 7 16 12 23 17 23 7"/><rect width="15" height="14" x="1" y="5" rx="2" ry="2"/></svg>
                  ) : (
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/></svg>
                  )}
                  <span style={{ maxWidth: 160, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                    {att.name}
                  </span>
                  <span className="text-tertiary" style={{ fontSize: '0.75rem' }}>
                    ({formatFileSize(att.size)})
                  </span>
                  <button
                    type="button"
                    onClick={() => removeAttachment(idx)}
                    style={{ background: 'transparent', border: 'none', color: 'var(--color-error)', cursor: 'pointer', fontSize: '0.9rem', padding: '0 2px' }}
                    title="Remove attachment"
                  >
                    &times;
                  </button>
                </div>
              ))}
            </div>
          )}

          {/* Hidden File Input */}
          <input
            type="file"
            ref={fileInputRef}
            style={{ display: 'none' }}
            multiple
            onChange={handleFileSelect}
          />

          {/* Compose Footer with Split Send & Schedule Popover */}
          <div className="compose-footer" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'center' }}>
              <button
                type="button"
                className="btn btn-secondary btn-sm"
                onClick={() => fileInputRef.current?.click()}
                title="Attach images, videos, documents, or files (Max 25MB)"
              >
                Attach Files
              </button>
              {attachments.length > 0 && (
                <span className="text-secondary" style={{ fontSize: '0.75rem' }}>
                  {attachments.length} attached
                </span>
              )}
              <label
                style={{
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: '0.35rem',
                  cursor: 'pointer',
                  fontSize: '0.75rem',
                  color: trackOpens ? 'var(--color-primary-light)' : 'var(--color-text-secondary)',
                  fontWeight: 600,
                  marginLeft: '0.5rem',
                  userSelect: 'none',
                }}
                title="Embed non-intrusive 1x1 pixel to track when the recipient opens this email"
              >
                <input
                  type="checkbox"
                  checked={trackOpens}
                  onChange={(e) => setTrackOpens(e.target.checked)}
                  style={{ accentColor: 'var(--color-primary)', cursor: 'pointer' }}
                />
                <span>📊 Track Opens</span>
              </label>
            </div>

            <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'center' }}>
              <button type="button" className="btn btn-secondary btn-sm" onClick={onClose}>
                Cancel
              </button>

              {/* Split Button: Send + Schedule Popover */}
              <div style={{ display: 'inline-flex', position: 'relative' }}>
                <button
                  type="submit"
                  className="btn btn-primary btn-sm"
                  disabled={sending}
                  style={{ borderTopRightRadius: 0, borderBottomRightRadius: 0 }}
                >
                  {sending
                    ? 'Sending...'
                    : securityMode === 'vault'
                    ? 'Send Locked Vault'
                    : securityMode === 'stream'
                    ? 'Send In-Inbox Burner'
                    : securityMode === 'expunge'
                    ? 'Send Auto-Expunge'
                    : 'Send'}
                </button>
                <button
                  ref={scheduleBtnRef}
                  type="button"
                  className="btn btn-primary btn-sm"
                  style={{ borderTopLeftRadius: 0, borderBottomLeftRadius: 0, borderLeft: '1px solid rgba(255,255,255,0.2)', padding: '0 8px' }}
                  onClick={() => setShowSchedulePopover(!showSchedulePopover)}
                  title="Schedule Send"
                >
                  ⏰ ▾
                </button>

                {showSchedulePopover && (
                  <SchedulePopover
                    onSchedule={(isoDate) => {
                      setShowSchedulePopover(false);
                      handleFormSubmit(null, isoDate);
                    }}
                    onClose={() => setShowSchedulePopover(false)}
                    anchorRect={scheduleBtnRef.current?.getBoundingClientRect()}
                  />
                )}
              </div>
            </div>
          </div>
        </form>
      </div>
    </div>
  );
}
