/**
 * Modern Public Temp Mail Client Script
 * Robust, null-safe, with instant generation, query param synchronization,
 * IMAP inbox fetching, 30s auto-polling, SSE live streaming, duration picking, and public directory.
 */
(function () {
  'use strict';

  const API = '/api/tempmail';
  let currentAddress = null;
  let eventSource = null;
  let countdownInterval = null;
  let recentInterval = null;
  let autoRefreshInterval = null;
  let selectedExpiry = 24;
  let currentMessageUid = null;
  let currentMessageRawText = '';
  let selectedMessageIndex = -1;
  let activeFilterQuery = '';
  let currentMessages = [];
  let audioContext = null;
  let notificationsEnabled = localStorage.getItem('woxmail_sound') !== 'false';
  let previousMessageCount = -1; // -1 indicates initial load so existing emails never trigger notification spam

  function getCsrfToken() {
    const match = document.cookie.match(/woxmail_csrf=([^;]+)/);
    return match ? match[1] : '';
  }

  function getCaptchaToken() {
    if (typeof hcaptcha !== 'undefined') {
      return hcaptcha.getResponse() || '';
    }
    return 'dev-bypass';
  }

  // ─── Duration Selector ─────────────────────────────────

  window.selectDuration = function (hours) {
    selectedExpiry = parseInt(hours, 10);
    document.querySelectorAll('.duration-btn, .expiry-btn').forEach((btn) => {
      if (parseInt(btn.dataset.hours, 10) === selectedExpiry) {
        btn.classList.add('active');
      } else {
        btn.classList.remove('active');
      }
    });
    // Generate fresh address with new duration
    window.generateAddress(true);
  };

  let selectedDomain = 'mail.wox.world';

  window.changeDomain = function (domain) {
    selectedDomain = domain;
    window.generateAddress(true, null, selectedDomain);
  };

  // ─── Generate Address (Automatic on Load or Manual) ─────

  window.generateAddress = async function (forceNew = false, customUsername = null, customDomain = null) {
    const input = document.getElementById('address-text-input') || document.getElementById('address-text');
    const refreshBtn = document.getElementById('refresh-address-btn') || document.getElementById('generate-btn');
    const hintEl = document.getElementById('empty-address-hint');

    if (input) input.value = 'Generating secure address...';
    if (refreshBtn) refreshBtn.disabled = true;
    showMessageListSkeleton();

    try {
      const payload = {
        expiryHours: selectedExpiry,
        captchaToken: getCaptchaToken(),
        forceNew: !!forceNew,
        domain: customDomain || selectedDomain,
      };
      if (customUsername) payload.username = customUsername;

      const res = await fetch(`${API}/generate`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-csrf-token': getCsrfToken(),
        },
        credentials: 'include',
        body: JSON.stringify(payload),
      });

      const data = await res.json();
      if (!res.ok) {
        if (window.WoxToast) WoxToast.error(data.error || 'Failed to generate address');
        if (input) input.value = currentAddress || 'Error generating address';
        return;
      }

      currentAddress = data.address;
      if (input) input.value = data.address;
      if (hintEl) hintEl.textContent = data.address;

      const domainSelect = document.getElementById('temp-domain-select');
      if (domainSelect && data.address.includes('@')) {
        const addrDomain = data.address.split('@')[1];
        domainSelect.value = addrDomain;
        selectedDomain = addrDomain;
      }

      try {
        localStorage.setItem('woxmail_temp_addr', data.address);
        localStorage.setItem('woxmail_temp_expiry', data.expiresAt);
        history.replaceState(null, '', '/tempmail?address=' + encodeURIComponent(data.address));
      } catch {}

      startCountdown(data.expiresAt);
      connectSSE(data.address);
      previousMessageCount = -1;
      window.refreshInbox(false);

      if (forceNew && window.WoxToast) {
        WoxToast.success(`Active address: ${data.address}`);
      }
      loadRecentAddresses();
    } catch (err) {
      console.error('Generate error:', err);
      if (window.WoxToast) WoxToast.error('Network error generating mailbox');
    } finally {
      if (refreshBtn) refreshBtn.disabled = false;
    }
  };

  // ─── Real-Time SSE Stream ──────────────────────────────

  function connectSSE(address) {
    if (eventSource) {
      try { eventSource.close(); } catch {}
      eventSource = null;
    }

    try {
      eventSource = new EventSource(`${API}/sse/${encodeURIComponent(address)}`);

      eventSource.onmessage = (event) => {
        try {
          const data = JSON.parse(event.data);
          if (data.type === 'new_email') {
            window.refreshInbox(false);
            if (window.WoxToast) {
              const sender = typeof data.message?.from === 'object' ? (data.message.from.address || data.message.from.name) : data.message?.from;
              WoxToast.info(`New email received from ${sender || 'Unknown'}`);
            }
          }
        } catch (e) {
          console.error('SSE parse error:', e);
        }
      };

      eventSource.onerror = () => {
        setTimeout(() => {
          if (currentAddress) connectSSE(currentAddress);
        }, 5000);
      };
    } catch (err) {
      console.error('SSE connection error:', err);
    }
  }

  function playNotificationChime() {
    if (!notificationsEnabled) return;
    try {
      if (!audioContext) audioContext = new (window.AudioContext || window.webkitAudioContext)();
      if (audioContext.state === 'suspended') audioContext.resume();

      const now = audioContext.currentTime;
      const osc = audioContext.createOscillator();
      const gain = audioContext.createGain();

      osc.type = 'sine';
      osc.frequency.setValueAtTime(587.33, now); // D5
      osc.frequency.exponentialRampToValueAtTime(880.00, now + 0.12); // A5

      gain.gain.setValueAtTime(0.08, now);
      gain.gain.exponentialRampToValueAtTime(0.001, now + 0.35);

      osc.connect(gain);
      gain.connect(audioContext.destination);

      osc.start(now);
      osc.stop(now + 0.35);
    } catch (e) {
      console.warn('Audio chime error:', e);
    }
  }

  window.toggleSoundNotifications = function () {
    notificationsEnabled = !notificationsEnabled;
    localStorage.setItem('woxmail_sound', notificationsEnabled);
    updateNotificationBtn();
    if (notificationsEnabled) {
      playNotificationChime();
      if (window.WoxToast) WoxToast.success('Audio notification chime enabled');
      if ('Notification' in window && Notification.permission === 'default') {
        Notification.requestPermission();
      }
    } else {
      if (window.WoxToast) WoxToast.info('Audio notifications muted');
    }
  };

  function updateNotificationBtn() {
    const btn = document.getElementById('sound-toggle-btn');
    if (btn) {
      btn.innerHTML = notificationsEnabled 
        ? `<svg class="icon-svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M6 8a6 6 0 0 1 12 0c0 7 3 9 3 9H3s3-2 3-9"/><path d="M10.3 21a1.94 1.94 0 0 0 3.4 0"/></svg>`
        : `<svg class="icon-svg text-secondary" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M13.73 21a2 2 0 0 1-3.46 0"/><path d="M18.63 13A17.89 17.89 0 0 1 18 8"/><path d="M6.26 6.26A5.86 5.86 0 0 0 6 8c0 7-3 9-3 9h14"/><path d="m1 1 22 22"/><path d="M9 3.27a6 6 0 0 1 6.97 4.73"/></svg>`;
      btn.title = notificationsEnabled ? 'Audio notifications active (Click to mute)' : 'Audio notifications muted (Click to unmute)';
    }
  }

  function extractOtpCode(text) {
    if (!text) return null;
    const keywordMatch = text.match(/\b(?:code|otp|pin|token|verification|passcode|secret|auth|is)[:\s#-]*([0-9]{4,8})\b/i);
    if (keywordMatch && keywordMatch[1]) return keywordMatch[1];
    
    const numMatch = text.match(/\b([0-9]{4,8})\b/);
    if (numMatch && numMatch[1] && numMatch[1].length >= 4 && numMatch[1].length <= 8) return numMatch[1];
    return null;
  }

  window.copyOtp = function (e, code) {
    if (e) e.stopPropagation();
    navigator.clipboard.writeText(code).then(() => {
      if (window.WoxToast) WoxToast.success(`Copied OTP code: ${code}`);
    });
  };

  function showMessageListSkeleton() {
    const listEl = document.getElementById('message-list');
    const emptyState = document.getElementById('empty-state');
    if (!listEl) return;
    if (emptyState) emptyState.style.display = 'none';
    listEl.querySelectorAll('.message-item').forEach((el) => el.remove());

    for (let i = 0; i < 3; i++) {
      const item = document.createElement('div');
      item.className = 'message-item skeleton-row-item skeleton-shimmer';
      item.style.opacity = String(1 - i * 0.25);
      item.innerHTML = `
        <div class="skeleton-avatar skeleton-shimmer" style="width:36px;height:36px;border-radius:50%;background:rgba(255,255,255,0.06);flex-shrink:0;"></div>
        <div style="flex:1;min-width:0;display:flex;flex-direction:column;gap:0.35rem;">
          <div style="display:flex;justify-content:space-between;align-items:center;">
            <div class="skeleton-line skeleton-shimmer" style="width:30%;height:0.85rem;background:rgba(255,255,255,0.08);"></div>
            <div class="skeleton-line skeleton-shimmer" style="width:15%;height:0.75rem;background:rgba(255,255,255,0.06);"></div>
          </div>
          <div class="skeleton-line skeleton-shimmer" style="width:65%;height:0.8rem;background:rgba(255,255,255,0.06);"></div>
        </div>
      `;
      listEl.appendChild(item);
    }
  }

  function renderMessageList(messagesToRender) {
    const listEl = document.getElementById('message-list');
    const emptyState = document.getElementById('empty-state');
    if (!listEl) return;

    listEl.querySelectorAll('.message-item').forEach((el) => el.remove());

    if (!messagesToRender || messagesToRender.length === 0) {
      if (emptyState) {
        emptyState.style.display = 'block';
        const emptyHint = document.getElementById('empty-address-hint');
        if (emptyHint && activeFilterQuery) {
          emptyState.querySelector('h3').textContent = 'No matching emails found';
          emptyState.querySelector('p').textContent = `No messages match your search filter "${activeFilterQuery}". Clear the search to see all messages.`;
        } else if (emptyState.querySelector('h3')) {
          emptyState.querySelector('h3').textContent = 'Waiting for incoming emails...';
          emptyState.querySelector('p').innerHTML = `Send an email or verification code to <strong class="mono text-purple">${escapeHtml(currentAddress || 'your address')}</strong> above and it will appear here automatically in real-time.`;
        }
      }
      return;
    }

    if (emptyState) emptyState.style.display = 'none';

    messagesToRender.forEach((msg, idx) => {
      const item = document.createElement('div');
      const isUnread = !(msg.flags && msg.flags.includes('\\Seen'));
      const isSelected = idx === selectedMessageIndex;

      item.className = `message-item ${isUnread ? 'unread' : ''} ${isSelected ? 'keyboard-selected' : ''}`;
      item.dataset.uid = msg.uid;
      item.dataset.index = idx;

      const fromText = typeof msg.from === 'object' ? (msg.from?.name || msg.from?.address || 'Unknown') : (msg.from || 'Unknown');
      const subjectText = msg.subject || '(No Subject)';
      const dateText = msg.date || msg.envelope?.date;
      const initial = (fromText.charAt(0) || 'M').toUpperCase();

      const otpCode = extractOtpCode(subjectText);
      const otpMarkup = otpCode ? `
        <div>
          <button type="button" class="otp-quick-badge" onclick="copyOtp(event, '${escapeHtml(otpCode)}')" title="Click to copy verification code">
            <svg class="icon-svg" style="width:12px;height:12px;" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect width="18" height="11" x="3" y="11" rx="2" ry="2"/><path d="M7 11V7a5 5 0 0 1 10 0v4"/></svg>
            <span>Copy OTP: ${escapeHtml(otpCode)}</span>
          </button>
        </div>
      ` : '';

      item.innerHTML = `
        <div class="message-avatar">${escapeHtml(initial)}</div>
        <div style="flex:1;min-width:0;">
          <div class="message-from truncate">${escapeHtml(fromText)}</div>
          <div class="message-subject truncate">${escapeHtml(subjectText)}</div>
          ${otpMarkup}
        </div>
        <div class="message-date">${formatDate(dateText)}</div>
      `;
      item.style.cursor = 'pointer';
      item.onclick = (e) => {
        e.preventDefault();
        selectedMessageIndex = idx;
        window.openMessage(msg.uid);
      };
      listEl.appendChild(item);
    });
  }

  window.filterMessages = function (query) {
    activeFilterQuery = (query || '').trim().toLowerCase();
    if (!activeFilterQuery) {
      renderMessageList(currentMessages);
      return;
    }

    const filtered = currentMessages.filter((msg) => {
      const from = (typeof msg.from === 'object' ? (msg.from?.name || msg.from?.address || '') : (msg.from || '')).toLowerCase();
      const subject = (msg.subject || '').toLowerCase();
      return from.includes(activeFilterQuery) || subject.includes(activeFilterQuery);
    });

    renderMessageList(filtered);
  };

  // ─── Fetch / Refresh Inbox ─────────────────────────────

  window.refreshInbox = async function (manual = false) {
    if (!currentAddress) return;
    const refreshIcon = document.getElementById('refresh-spinner-icon');
    const refreshBtn = document.getElementById('manual-refresh-btn');
    if (refreshIcon) refreshIcon.style.animation = 'spin 1s linear infinite';
    if (refreshBtn) refreshBtn.disabled = true;

    try {
      const res = await fetch(`${API}/inbox/${encodeURIComponent(currentAddress)}`, { credentials: 'include' });
      const data = await res.json();
      if (!res.ok) {
        if (manual && window.WoxToast) WoxToast.error(data.error || 'Failed to fetch inbox');
        return;
      }

      currentMessages = data.messages || [];
      const viewerEl = document.getElementById('message-viewer');
      const listEl = document.getElementById('message-list');
      const badge = document.getElementById('message-count');

      const isViewerOpen = (currentMessageUid !== null) || (viewerEl && viewerEl.style.display === 'block');

      if (badge) badge.textContent = `${currentMessages.length} message${currentMessages.length !== 1 ? 's' : ''}`;

      if (previousMessageCount === -1) {
        // Initial load of this inbox — record existing count without triggering notification spam
        previousMessageCount = currentMessages.length;
      } else if (currentMessages.length > previousMessageCount) {
        playNotificationChime();
        if ('Notification' in window && Notification.permission === 'granted') {
          const latest = currentMessages[0];
          const sender = typeof latest.from === 'object' ? (latest.from?.name || latest.from?.address) : latest.from;
          new Notification(`New email from ${sender || 'WoxMail'}`, {
            body: latest.subject || 'You have received a new email',
            icon: '/assets/favicon.svg'
          });
        }
        previousMessageCount = currentMessages.length;
      } else {
        previousMessageCount = currentMessages.length;
      }

      window.filterMessages(activeFilterQuery);

      // Preserve view state if user is currently reading an email
      if (isViewerOpen) {
        if (listEl) listEl.style.display = 'none';
        if (viewerEl) viewerEl.style.display = 'block';
      }

      if (manual && window.WoxToast) {
        WoxToast.success(`Inbox updated (${currentMessages.length} message${currentMessages.length !== 1 ? 's' : ''})`);
      }
    } catch (err) {
      console.error('Refresh inbox error:', err);
      if (manual && window.WoxToast) WoxToast.error('Network error checking inbox');
    } finally {
      if (refreshIcon) refreshIcon.style.animation = '';
      if (refreshBtn) refreshBtn.disabled = false;
    }
  };

  // ─── Message Viewer ────────────────────────────────────

  window.openMessage = async function (uid) {
    if (!uid || !currentAddress) return;
    currentMessageUid = uid;

    const listEl = document.getElementById('message-list');
    const viewerEl = document.getElementById('message-viewer');
    const subjectEl = document.getElementById('viewer-subject');
    const fromEl = document.getElementById('viewer-from');
    const dateEl = document.getElementById('viewer-date');
    const viewer = document.getElementById('viewer-body');
    const otpContainer = document.getElementById('viewer-otp-banner');

    if (listEl) listEl.style.display = 'none';
    if (viewerEl) viewerEl.style.display = 'block';

    if (subjectEl) subjectEl.textContent = 'Loading message...';
    if (fromEl) fromEl.textContent = '';
    if (dateEl) dateEl.textContent = '';
    if (otpContainer) otpContainer.innerHTML = '';
    if (viewer) {
      viewer.innerHTML = `
        <div style="padding: 3rem 1rem; text-align: center; color: var(--color-text-secondary);">
          <div class="skeleton" style="width: 60%; height: 24px; margin: 0 auto 1.5rem;"></div>
          <div class="skeleton" style="width: 90%; height: 16px; margin: 0 auto 0.75rem;"></div>
          <div class="skeleton" style="width: 80%; height: 16px; margin: 0 auto 0.75rem;"></div>
          <div class="skeleton" style="width: 50%; height: 16px; margin: 0 auto;"></div>
        </div>
      `;
    }

    // Smoothly scroll to the message viewer (especially on mobile)
    try {
      viewerEl.scrollIntoView({ behavior: 'smooth', block: 'start' });
    } catch {}

    try {
      const res = await fetch(`${API}/message/${encodeURIComponent(currentAddress)}/${uid}`, { credentials: 'include' });
      const data = await res.json();
      if (!res.ok) {
        if (window.WoxToast) WoxToast.error(data.error || 'Failed to load email');
        if (subjectEl) subjectEl.textContent = 'Error Loading Message';
        if (viewer) {
          viewer.innerHTML = `
            <div style="padding: 2.5rem 1rem; text-align: center; color: var(--color-error);">
              <p style="font-weight: 600; margin-bottom: 1rem;">${escapeHtml(data.error || 'Failed to load message content')}</p>
              <button type="button" class="btn btn-secondary btn-sm" onclick="window.openMessage(${uid})">Try Again</button>
            </div>
          `;
        }
        return;
      }

      currentMessageRawText = data.text || '';
      if (String(currentMessageUid) !== String(uid)) return; // User navigated away

      const subjectText = data.subject || '(No Subject)';
      if (subjectEl) subjectEl.textContent = subjectText;
      if (fromEl) fromEl.textContent = typeof data.from === 'object' ? (data.from?.address || data.from?.name || 'Unknown') : (data.from || 'Unknown');
      if (dateEl) dateEl.textContent = data.date ? new Date(data.date).toLocaleString() : '';

      // OTP Quick Extraction & Banner
      const extractedOtp = extractOtpCode(subjectText) || extractOtpCode(data.text || '');
      if (extractedOtp && otpContainer) {
        otpContainer.innerHTML = `
          <div class="otp-viewer-banner">
            <div class="otp-banner-left">
              <span class="otp-pill-label">Verification Code Detected</span>
              <div class="otp-code-value mono">${escapeHtml(extractedOtp)}</div>
            </div>
            <button type="button" class="btn btn-primary btn-sm otp-copy-btn" onclick="copyOtp(event, '${escapeHtml(extractedOtp)}')">
              Copy Code
            </button>
          </div>
        `;
      }

      if (viewer) {
        const rawHtml = typeof data.html === 'object' ? (data.html?.html || '') : (data.html || '');
        if (rawHtml) {
          const iframe = document.createElement('iframe');
          iframe.sandbox = 'allow-same-origin allow-popups';
          iframe.style.cssText = 'width: 100%; border: none; min-height: 420px; background: #ffffff; border-radius: 12px; display: block;';
          
          iframe.srcdoc = `
            <!DOCTYPE html>
            <html>
            <head>
              <meta charset="utf-8">
              <meta name="viewport" content="width=device-width, initial-scale=1.0">
              <base target="_blank">
              <style>
                html, body {
                  margin: 0;
                  padding: 0;
                  background-color: #ffffff !important;
                  color: #1a1a2e !important;
                  font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif;
                  font-size: 15px;
                  line-height: 1.6;
                  word-break: break-word;
                  overflow-x: hidden;
                }
                body {
                  padding: 16px;
                  box-sizing: border-box;
                }
                p { margin: 0 0 1em; color: #1a1a2e; }
                a { color: #7c3aed !important; text-decoration: underline; font-weight: 500; }
                img { max-width: 100% !important; height: auto !important; display: inline-block; }
                table { max-width: 100% !important; border-collapse: collapse; }
                pre, code { white-space: pre-wrap; word-break: break-word; font-family: monospace; }
                @media (max-width: 600px) {
                  body { padding: 12px; font-size: 14px; }
                }
              </style>
            </head>
            <body>${rawHtml}</body>
            </html>
          `;

          viewer.innerHTML = '';
          viewer.appendChild(iframe);

          const resizeIframe = () => {
            try {
              const bodyHeight = iframe.contentDocument?.body?.scrollHeight || iframe.contentWindow?.document?.body?.scrollHeight;
              if (bodyHeight && bodyHeight > 100) {
                iframe.style.height = (bodyHeight + 40) + 'px';
              }
            } catch {}
          };

          iframe.onload = resizeIframe;
          setTimeout(resizeIframe, 300);
          setTimeout(resizeIframe, 1000);
        } else {
          viewer.innerHTML = `<pre style="white-space: pre-wrap; font-family: var(--font-body); line-height: 1.65; color: #1a1a2e; background: #ffffff; padding: 1.25rem; border-radius: 12px; margin: 0; font-size: 15px; word-break: break-word;">${escapeHtml(data.text || 'No message content.')}</pre>`;
        }
      }

      const item = document.querySelector(`.message-item[data-uid="${uid}"]`);
      if (item) item.classList.remove('unread');
    } catch (err) {
      console.error('Open message error:', err);
      if (window.WoxToast) WoxToast.error('Failed to load message body');
      if (subjectEl) subjectEl.textContent = 'Connection Error';
      if (viewer) {
        viewer.innerHTML = `
          <div style="padding: 2.5rem 1rem; text-align: center; color: var(--color-error);">
            <p style="font-weight: 600; margin-bottom: 1rem;">Network error loading message</p>
            <button type="button" class="btn btn-secondary btn-sm" onclick="window.openMessage(${uid})">Try Again</button>
          </div>
        `;
      }
    }
  };

  window.closeViewer = function () {
    const listEl = document.getElementById('message-list');
    const viewerEl = document.getElementById('message-viewer');
    const viewer = document.getElementById('viewer-body');
    const otpContainer = document.getElementById('viewer-otp-banner');
    if (viewerEl) viewerEl.style.display = 'none';
    if (listEl) listEl.style.display = 'block';
    if (viewer) viewer.innerHTML = '';
    if (otpContainer) otpContainer.innerHTML = '';
    currentMessageUid = null;
    currentMessageRawText = '';

    try {
      const inboxCard = document.querySelector('.inbox-card');
      if (inboxCard) inboxCard.scrollIntoView({ behavior: 'smooth', block: 'start' });
    } catch {}
  };

  window.copyMessageBody = function () {
    let textToCopy = currentMessageRawText;
    if (!textToCopy) {
      const viewer = document.getElementById('viewer-body');
      if (viewer) textToCopy = viewer.innerText || viewer.textContent;
    }
    if (!textToCopy) {
      if (window.WoxToast) WoxToast.info('No email text content to copy');
      return;
    }
    navigator.clipboard.writeText(textToCopy).then(() => {
      if (window.WoxToast) WoxToast.success('Email content copied to clipboard!');
    }).catch(() => {
      if (window.WoxToast) WoxToast.error('Failed to copy content');
    });
  };

  window.printEmail = function () {
    window.print();
  };

  window.downloadEml = function () {
    if (!currentMessageUid || !currentAddress) return;
    window.open(`${API}/message/${encodeURIComponent(currentAddress)}/${currentMessageUid}/eml`, '_blank');
  };

  window.viewSource = async function () {
    if (!currentMessageUid || !currentAddress) return;
    try {
      const res = await fetch(`${API}/message/${encodeURIComponent(currentAddress)}/${currentMessageUid}/source`, { credentials: 'include' });
      const data = await res.json();
      const win = window.open('', '_blank');
      win.document.write(`<pre style="white-space:pre-wrap;font-family:monospace;padding:1rem;background:#111;color:#eee;">${escapeHtml(data.source || '')}</pre>`);
    } catch {
      if (window.WoxToast) WoxToast.error('Failed to load source');
    }
  };

  window.promptCustomAddress = async function () {
    const domainSelect = document.getElementById('temp-domain-select');
    const domain = domainSelect ? domainSelect.value : selectedDomain;
    const defaultPrefix = currentAddress ? currentAddress.split('@')[0] : '';
    const chosen = window.prompt(`Enter your custom username prefix for @${domain} (3-30 letters/numbers):`, defaultPrefix);
    if (!chosen) return;
    const cleanUsername = chosen.toLowerCase().replace(/[^a-z0-9._-]/g, '').slice(0, 30);
    if (cleanUsername.length < 3) {
      if (window.WoxToast) WoxToast.error('Username must be at least 3 characters');
      return;
    }
    await window.generateAddress(true, cleanUsername, domain);
  };

  // ─── Actions: Copy, QR, Delete ─────────────────────────

  window.copyAddress = function () {
    if (!currentAddress) return;
    navigator.clipboard.writeText(currentAddress).then(() => {
      const btn = document.getElementById('copy-address-btn');
      if (btn) {
        const orig = btn.innerHTML;
        btn.innerHTML = 'Copied!';
        setTimeout(() => { btn.innerHTML = orig; }, 2000);
      }
      if (window.WoxToast) WoxToast.success('Address copied to clipboard!');
    }).catch(() => {
      if (window.WoxToast) WoxToast.error('Copy failed');
    });
  };

  window.showQR = async function () {
    if (!currentAddress) return;
    try {
      const res = await fetch(`${API}/qr/${encodeURIComponent(currentAddress)}`);
      const data = await res.json();
      const img = document.getElementById('qr-image');
      const addrEl = document.getElementById('qr-address');
      const modal = document.getElementById('qr-modal');
      if (img) img.src = data.qr;
      if (addrEl) addrEl.textContent = currentAddress;
      if (modal) modal.style.display = 'flex';
    } catch {
      if (window.WoxToast) WoxToast.error('Failed to generate QR');
    }
  };

  window.saveQrImage = function () {
    const img = document.getElementById('qr-image');
    if (!img || !img.src) return;
    const a = document.createElement('a');
    a.href = img.src;
    a.download = `woxmail-qr-${currentAddress || 'temp'}.png`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    if (window.WoxToast) WoxToast.success('QR image saved!');
  };

  window.shareInboxUrl = async function () {
    const url = window.location.href;
    if (navigator.share) {
      try {
        await navigator.share({
          title: 'WoxMail Disposable Inbox',
          text: `My temporary email is ${currentAddress}`,
          url: url,
        });
      } catch (err) {
        if (err.name !== 'AbortError') window.copyAddress();
      }
    } else {
      window.copyAddress();
    }
  };

  window.closeQR = function () {
    const modal = document.getElementById('qr-modal');
    if (modal) modal.style.display = 'none';
  };

  window.deleteMailbox = async function () {
    if (!currentAddress) return;
    if (!confirm('Purge and delete this temporary address immediately?')) return;

    const addrToDelete = currentAddress;
    try {
      await fetch(`${API}/delete/${encodeURIComponent(addrToDelete)}`, {
        method: 'DELETE',
        headers: { 'x-csrf-token': getCsrfToken() },
        credentials: 'include'
      });
    } catch (e) {
      console.error('Delete request error:', e);
    }

    if (eventSource) {
      try { eventSource.close(); } catch {}
      eventSource = null;
    }
    if (countdownInterval) clearInterval(countdownInterval);

    try {
      localStorage.removeItem('woxmail_temp_addr');
      localStorage.removeItem('woxmail_temp_expiry');
      document.cookie = 'woxmail_temp=; path=/; max-age=0; expires=Thu, 01 Jan 1970 00:00:00 GMT;';
    } catch {}

    currentAddress = null;
    history.replaceState(null, '', '/tempmail');

    if (window.WoxToast) WoxToast.success('Mailbox deleted');
    window.generateAddress(true);
  };

  // ─── Countdown Timer ───────────────────────────────────

  function startCountdown(expiresAt) {
    if (!expiresAt) return;
    const expiry = new Date(expiresAt);
    const el = document.getElementById('countdown-text');
    const badge = document.getElementById('status-badge');

    if (countdownInterval) clearInterval(countdownInterval);

    function update() {
      const remaining = expiry - Date.now();
      if (remaining <= 0) {
        clearInterval(countdownInterval);
        if (el) {
          el.innerHTML = '<svg class="icon-svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/></svg> <span>Expired</span>';
        }
        if (badge) {
          badge.textContent = 'Expired';
          badge.className = 'badge badge-red';
        }
        if (eventSource) eventSource.close();
        return;
      }

      const h = Math.floor(remaining / 3600000);
      const m = Math.floor((remaining % 3600000) / 60000);
      const s = Math.floor((remaining % 60000) / 1000);

      if (el) {
        const timeStr = h > 0 ? `${h}h ${m}m left` : `${m}m ${s}s left`;
        el.innerHTML = `<svg class="icon-svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/></svg> <span>${timeStr}</span>`;
      }
    }

    update();
    countdownInterval = setInterval(update, 1000);
  }

  // ─── Recently Created Public Addresses ─────────────────

  window.loadRecentAddresses = async function (forceSync = false) {
    const refreshBtn = document.getElementById('recent-refresh-btn') || document.querySelector('.recent-card-header button');
    const refreshSvg = refreshBtn?.querySelector('svg');
    if (refreshSvg) {
      refreshSvg.style.transition = 'transform 0.5s ease';
      refreshSvg.style.animation = 'spin 0.8s linear infinite';
    }

    try {
      const url = forceSync ? `${API}/recent?sync=true` : `${API}/recent`;
      const res = await fetch(url);
      const data = await res.json();
      if (!res.ok) return;

      const list = document.getElementById('recent-list');
      if (!list) return;

      const addresses = data.addresses || [];
      if (addresses.length === 0) {
        list.innerHTML = `<div class="empty-state text-secondary" style="padding: 1rem; text-align: center;">No other public addresses active right now.</div>`;
        return;
      }

      list.innerHTML = addresses.map((addr) => {
        const msgCount = typeof addr.messageCount === 'number' ? addr.messageCount : 0;
        return `
          <div class="recent-item" onclick="openPublicAddress('${escapeHtml(addr.address)}', '${escapeHtml(addr.expiresAt || '')}')">
            <span class="recent-address mono">${escapeHtml(addr.address)}</span>
            <div class="recent-meta" style="display:flex;align-items:center;gap:0.4rem;">
              <span class="badge ${msgCount > 0 ? 'badge-green' : 'badge-purple'}" style="font-size:0.75rem;font-weight:600;">${msgCount} msg</span>
              <button type="button" class="btn btn-ghost btn-xs" style="padding:0.25rem 0.5rem;display:inline-flex;align-items:center;justify-content:center;" title="Copy address" onclick="event.stopPropagation(); copyRecentAddress('${escapeHtml(addr.address)}')">
                <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect width="14" height="14" x="8" y="8" rx="2" ry="2"/><path d="M4 16c-1.1 0-2-.9-2-2V4c0-1.1.9-2 2-2h10c1.1 0 2 .9 2 2"/></svg>
              </button>
            </div>
          </div>
        `;
      }).join('');
    } catch (err) {
      console.warn('loadRecentAddresses error:', err);
    } finally {
      if (refreshSvg) {
        setTimeout(() => { refreshSvg.style.animation = ''; }, 400);
      }
    }
  };

  window.refreshAll = async function () {
    const promises = [];
    if (typeof window.refreshInbox === 'function') {
      promises.push(window.refreshInbox(false));
    }
    if (typeof window.loadRecentAddresses === 'function') {
      promises.push(window.loadRecentAddresses(true));
    }
    await Promise.allSettled(promises);
    if (window.WoxToast) {
      WoxToast.success('Refreshed inboxes & directory message counts');
    }
  };

  window.openPublicAddress = async function (address, expiresAt) {
    if (!address || address === currentAddress) return;
    currentAddress = address;

    const input = document.getElementById('address-text-input') || document.getElementById('address-text');
    const hintEl = document.getElementById('empty-address-hint');
    if (input) input.value = address;
    if (hintEl) hintEl.textContent = address;

    try {
      localStorage.setItem('woxmail_temp_addr', address);
      history.replaceState(null, '', '/tempmail?address=' + encodeURIComponent(address));
    } catch {}

    if (expiresAt && !isNaN(new Date(expiresAt).getTime())) {
      startCountdown(expiresAt);
    } else {
      try {
        const res = await fetch(`${API}/status/${encodeURIComponent(address)}`);
        const data = await res.json();
        if (data && data.expiresAt) {
          startCountdown(data.expiresAt);
        } else {
          startCountdown(new Date(Date.now() + 24 * 3600 * 1000).toISOString());
        }
      } catch {
        startCountdown(new Date(Date.now() + 24 * 3600 * 1000).toISOString());
      }
    }

    connectSSE(address);
    window.refreshInbox(false);

    window.scrollTo({ top: 0, behavior: 'smooth' });

    if (window.WoxToast) {
      WoxToast.success(`Switched to inbox: ${address}`);
    }
  };

  window.copyRecentAddress = function (address) {
    navigator.clipboard.writeText(address)
      .then(() => { if (window.WoxToast) WoxToast.success(`Copied: ${address}`); })
      .catch(() => { if (window.WoxToast) WoxToast.error('Copy failed'); });
  };

  function escapeHtml(str) {
    if (!str) return '';
    const div = document.createElement('div');
    div.textContent = String(str);
    return div.innerHTML;
  }

  function formatDate(dateStr) {
    if (!dateStr) return '';
    const d = new Date(dateStr);
    const now = new Date();
    const diffMs = now - d;
    if (diffMs < 60000) return 'Just now';
    if (diffMs < 3600000) return `${Math.floor(diffMs / 60000)}m ago`;
    if (diffMs < 86400000) return `${Math.floor(diffMs / 3600000)}h ago`;
    return d.toLocaleDateString();
  }

  // ─── Initialization on Page Load ───────────────────────
  document.addEventListener('DOMContentLoaded', async () => {
    updateNotificationBtn();

    // 1. Check if URL has ?address= query param (e.g. clicked "Open Inbox" from Landing page)
    const urlParams = new URLSearchParams(window.location.search);
    const queryAddress = urlParams.get('address');

    if (queryAddress && queryAddress.includes('@')) {
      currentAddress = queryAddress;
      const input = document.getElementById('address-text-input') || document.getElementById('address-text');
      const hintEl = document.getElementById('empty-address-hint');
      if (input) input.value = queryAddress;
      if (hintEl) hintEl.textContent = queryAddress;

      fetch(`${API}/status/${encodeURIComponent(queryAddress)}`)
        .then((r) => r.json())
        .then((data) => {
          if (data && data.expiresAt) {
            startCountdown(data.expiresAt);
          } else {
            startCountdown(new Date(Date.now() + 24 * 3600 * 1000).toISOString());
          }
        })
        .catch(() => {
          startCountdown(new Date(Date.now() + 24 * 3600 * 1000).toISOString());
        });

      connectSSE(queryAddress);
      window.refreshInbox(false);
      window.loadRecentAddresses();
    } else {
      // 2. Check for active session cookie to restore on page reload
      try {
        const res = await fetch(`${API}/session`, { credentials: 'include' });
        const data = await res.json();
        if (data && data.active && data.address) {
          currentAddress = data.address;
          const input = document.getElementById('address-text-input') || document.getElementById('address-text');
          const hintEl = document.getElementById('empty-address-hint');
          if (input) input.value = data.address;
          if (hintEl) hintEl.textContent = data.address;

          try {
            history.replaceState(null, '', '/tempmail?address=' + encodeURIComponent(data.address));
          } catch {}

          startCountdown(data.expiresAt);
          connectSSE(data.address);
          window.refreshInbox(false);
          window.loadRecentAddresses();
        } else {
          // If server says no active session, clear any stale cached items and generate a fresh mailbox
          try {
            localStorage.removeItem('woxmail_temp_addr');
            localStorage.removeItem('woxmail_temp_expiry');
          } catch {}
          window.generateAddress(false);
        }
      } catch {
        window.generateAddress(false);
      }
    }
    
    window.loadRecentAddresses();
    recentInterval = setInterval(window.loadRecentAddresses, 30000);
    autoRefreshInterval = setInterval(() => {
      if (currentAddress) window.refreshInbox(false);
    }, 30000);

    // Start next purge cycle countdown ticker
    startPurgeCycleTimer();
  });

  // ─── Automated Purge Cycle Countdown Timer ──────────────
  function startPurgeCycleTimer() {
    function tick() {
      const now = new Date();
      const minutes = now.getMinutes();
      const seconds = now.getSeconds();
      
      // Calculate remaining minutes and seconds until next quarter-hour (15, 30, 45, 00)
      const nextQuarter = (Math.floor(minutes / 15) + 1) * 15;
      const target = new Date(now);
      target.setMinutes(nextQuarter, 0, 0);
      
      const diffMs = Math.max(0, target.getTime() - now.getTime());
      const m = Math.floor(diffMs / 60000);
      const s = Math.floor((diffMs % 60000) / 1000);
      
      const timerEl = document.getElementById('next-purge-timer');
      if (timerEl) {
        timerEl.textContent = `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
      }
    }
    tick();
    setInterval(tick, 1000);
  }

  // ─── Global Keyboard Shortcuts ──────────────────────────

  window.addEventListener('keydown', (e) => {
    const activeEl = document.activeElement;
    const isInput = activeEl && (activeEl.tagName === 'INPUT' || activeEl.tagName === 'TEXTAREA' || activeEl.isContentEditable);

    // Escape: close viewer, close modal, or blur active input
    if (e.key === 'Escape') {
      if (isInput) {
        activeEl.blur();
        return;
      }
      const qrModal = document.getElementById('qr-modal');
      if (qrModal && qrModal.style.display !== 'none') {
        window.closeQR();
        return;
      }
      const viewerEl = document.getElementById('message-viewer');
      if (viewerEl && viewerEl.style.display === 'block') {
        window.closeViewer();
        return;
      }
      return;
    }

    // Ignore other single-key shortcuts when typing in inputs
    if (isInput) return;

    // '/' to focus search filter
    if (e.key === '/') {
      e.preventDefault();
      const searchInput = document.getElementById('inbox-search-input');
      if (searchInput) searchInput.focus();
      return;
    }

    // 'r' or 'R' to refresh
    if (e.key === 'r' || e.key === 'R') {
      e.preventDefault();
      window.refreshInbox(true);
      return;
    }

    // 'n' or 'N' for new address
    if (e.key === 'n' || e.key === 'N') {
      e.preventDefault();
      window.generateAddress(true);
      return;
    }

    // 'c' or 'C' to copy address
    if (e.key === 'c' || e.key === 'C') {
      e.preventDefault();
      window.copyAddress();
      return;
    }

    // 'j' or ArrowDown: select next message
    if (e.key === 'j' || e.key === 'ArrowDown') {
      const items = document.querySelectorAll('.message-item');
      if (items.length > 0) {
        e.preventDefault();
        selectedMessageIndex = Math.min(items.length - 1, selectedMessageIndex + 1);
        items.forEach((it, idx) => {
          if (idx === selectedMessageIndex) {
            it.classList.add('keyboard-selected');
            it.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
          } else {
            it.classList.remove('keyboard-selected');
          }
        });
      }
      return;
    }

    // 'k' or ArrowUp: select previous message
    if (e.key === 'k' || e.key === 'ArrowUp') {
      const items = document.querySelectorAll('.message-item');
      if (items.length > 0) {
        e.preventDefault();
        selectedMessageIndex = Math.max(0, selectedMessageIndex - 1);
        items.forEach((it, idx) => {
          if (idx === selectedMessageIndex) {
            it.classList.add('keyboard-selected');
            it.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
          } else {
            it.classList.remove('keyboard-selected');
          }
        });
      }
      return;
    }

    // Enter: open currently selected message
    if (e.key === 'Enter' && selectedMessageIndex >= 0) {
      const selectedItem = document.querySelector(`.message-item[data-index="${selectedMessageIndex}"]`);
      if (selectedItem && selectedItem.dataset.uid) {
        e.preventDefault();
        window.openMessage(selectedItem.dataset.uid);
      }
    }
  });

  window.addEventListener('beforeunload', () => {
    if (eventSource) eventSource.close();
    clearInterval(countdownInterval);
    if (recentInterval) clearInterval(recentInterval);
    if (autoRefreshInterval) clearInterval(autoRefreshInterval);
  });
})();
