/**
 * Personal Temp Mail page script.
 * Handles: registration, inbox with search/sort/star/batch, pagination.
 * Vanilla JS — no framework. ~12KB budget.
 */
(function () {
  'use strict';

  const API = '/api/tempmail';
  let currentAddress = null;
  let currentPage = 1;
  let currentMessageUid = null;
  let messages = [];

  function getCsrfToken() {
    const match = document.cookie.match(/woxmail_csrf=([^;]+)/);
    return match ? match[1] : '';
  }

  // ─── Create Form ─────────────────────────────────────

  const createForm = document.getElementById('create-form');
  if (createForm) {
    createForm.addEventListener('submit', async (e) => {
      e.preventDefault();
      const btn = document.getElementById('create-btn');
      btn.disabled = true;
      btn.textContent = 'Creating...';

      try {
        const res = await fetch(`${API}/personal/create`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'x-csrf-token': getCsrfToken(),
          },
          credentials: 'include',
          body: JSON.stringify({
            username: document.getElementById('custom-username').value.trim() || undefined,
            password: document.getElementById('personal-password').value,
            expiryHours: parseInt(document.getElementById('personal-expiry').value, 10),
            captchaToken: typeof hcaptcha !== 'undefined' ? hcaptcha.getResponse() : 'dev-bypass',
          }),
        });

        const data = await res.json();
        if (!res.ok) {
          WoxToast.error(data.error || 'Failed to create');
          return;
        }

        currentAddress = data.address;
        WoxToast.success('Personal inbox created!');
        showInbox(data.address, data.expiresAt);
        loadInbox();
      } catch {
        WoxToast.error('Network error');
      } finally {
        btn.disabled = false;
        btn.textContent = 'Create Personal Inbox';
      }
    });
  }

  // ─── Check if already logged in ──────────────────────

  (async function checkSession() {
    try {
      const res = await fetch(`${API}/session`, { credentials: 'include' });
      if (res.ok) {
        const data = await res.json();
        if (data.active && data.address && data.tier === 'personal') {
          currentAddress = data.address;
          showInbox(data.address, data.expiresAt);
          loadInbox();
        }
      }
    } catch {
      // Not logged in — show create form
    }
  })();

  // ─── Show Inbox ──────────────────────────────────────

  function showInbox(address, expiresAt) {
    document.getElementById('personal-create').style.display = 'none';
    document.getElementById('personal-inbox').style.display = 'block';
    document.getElementById('address-text').textContent = address;
    if (expiresAt) startCountdown(expiresAt);
  }

  // ─── Load Inbox ──────────────────────────────────────

  async function loadInbox() {
    if (!currentAddress) return;

    try {
      const res = await fetch(`${API}/inbox/${currentAddress}?page=${currentPage}`, { credentials: 'include' });
      const data = await res.json();
      if (!res.ok) return WoxToast.error(data.error);

      messages = data.messages || [];
      renderMessages(messages);
    } catch {
      WoxToast.error('Failed to load inbox');
    }
  }

  // ─── Render Messages ─────────────────────────────────

  function renderMessages(msgs) {
    const list = document.getElementById('message-list');
    const empty = document.getElementById('empty-state');

    if (msgs.length === 0) {
      list.innerHTML = '';
      list.appendChild(empty);
      empty.style.display = 'block';
      return;
    }

    empty.style.display = 'none';
    list.innerHTML = msgs.map((msg) => `
      <div class="message-item ${msg.isRead ? '' : 'unread'} ${msg.isStarred ? 'starred' : ''}" data-uid="${msg.uid}">
        <input type="checkbox" class="message-check" data-uid="${msg.uid}" onclick="event.stopPropagation()">
        <span class="message-star" onclick="event.stopPropagation(); toggleStar(${msg.uid})" style="display:inline-flex;align-items:center;cursor:pointer;">
    <svg width="15" height="15" viewBox="0 0 24 24" fill="${msg.isStarred ? '#f59e0b' : 'none'}" stroke="${msg.isStarred ? '#f59e0b' : 'currentColor'}" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
      <polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2" />
    </svg>
  </span>
        <div style="flex:1;min-width:0;" onclick="openMessage(${msg.uid})">
          <div class="message-from truncate">${escapeHtml(msg.from?.name || msg.from?.address || 'Unknown')}</div>
          <div class="message-subject truncate text-secondary">${escapeHtml(msg.subject || '(no subject)')}</div>
        </div>
        <div class="message-date">${formatDate(msg.date)}</div>
      </div>
    `).join('');

    // Show batch bar if any checked
    updateBatchBar();
  }

  // ─── Search ──────────────────────────────────────────

  let searchTimeout;
  const searchInput = document.getElementById('search-input');
  if (searchInput) {
    searchInput.addEventListener('input', () => {
      clearTimeout(searchTimeout);
      searchTimeout = setTimeout(() => {
        const q = searchInput.value.trim().toLowerCase();
        if (!q) {
          renderMessages(messages);
          return;
        }
        const filtered = messages.filter(
          (m) =>
            (m.from?.address || '').toLowerCase().includes(q) ||
            (m.from?.name || '').toLowerCase().includes(q) ||
            (m.subject || '').toLowerCase().includes(q)
        );
        renderMessages(filtered);
      }, 300); // Debounce 300ms
    });
  }

  // ─── Sort ────────────────────────────────────────────

  const sortSelect = document.getElementById('sort-select');
  if (sortSelect) {
    sortSelect.addEventListener('change', () => {
      const sorted = [...messages];
      switch (sortSelect.value) {
        case 'date-asc': sorted.sort((a, b) => new Date(a.date) - new Date(b.date)); break;
        case 'date-desc': sorted.sort((a, b) => new Date(b.date) - new Date(a.date)); break;
        case 'from': sorted.sort((a, b) => (a.from?.address || '').localeCompare(b.from?.address || '')); break;
      }
      renderMessages(sorted);
    });
  }

  // ─── Unread Filter ───────────────────────────────────

  const unreadFilter = document.getElementById('unread-filter');
  if (unreadFilter) {
    unreadFilter.addEventListener('change', () => {
      if (unreadFilter.checked) {
        renderMessages(messages.filter((m) => !m.isRead));
      } else {
        renderMessages(messages);
      }
    });
  }

  // ─── Batch Operations ────────────────────────────────

  function updateBatchBar() {
    const checked = document.querySelectorAll('.message-check:checked');
    document.getElementById('batch-bar').style.display = checked.length > 0 ? 'flex' : 'none';
  }

  document.addEventListener('change', (e) => {
    if (e.target.classList.contains('message-check')) updateBatchBar();
  });

  window.toggleSelectAll = function () {
    const checked = document.getElementById('select-all').checked;
    document.querySelectorAll('.message-check').forEach((cb) => { cb.checked = checked; });
    updateBatchBar();
  };

  window.batchDelete = async function () {
    const uids = [...document.querySelectorAll('.message-check:checked')].map((cb) => cb.dataset.uid);
    if (uids.length === 0) return;
    if (!confirm(`Delete ${uids.length} message(s)?`)) return;
    WoxToast.info(`Deleting ${uids.length} messages...`);
    // TODO: batch delete API call
    messages = messages.filter((m) => !uids.includes(String(m.uid)));
    renderMessages(messages);
  };

  // ─── Star / Read / Forward ───────────────────────────

  window.toggleStar = async function (uid) {
    try {
      await fetch(`${API}/personal/star/${uid}`, {
        method: 'PUT',
        headers: { 'x-csrf-token': getCsrfToken() },
        credentials: 'include'
      });
      const msg = messages.find((m) => m.uid === uid);
      if (msg) msg.isStarred = !msg.isStarred;
      renderMessages(messages);
    } catch {
      WoxToast.error('Failed to toggle star');
    }
  };

  window.openMessage = async function (uid) {
    currentMessageUid = uid;
    try {
      const res = await fetch(`${API}/message/${currentAddress}/${uid}`, { credentials: 'include' });
      const data = await res.json();
      if (!res.ok) return WoxToast.error(data.error);

      document.getElementById('message-list').style.display = 'none';
      document.getElementById('pagination').style.display = 'none';
      document.getElementById('message-viewer').style.display = 'block';
      document.getElementById('viewer-subject').textContent = data.subject || '(no subject)';
      document.getElementById('viewer-from').textContent = data.from?.address || 'Unknown';
      document.getElementById('viewer-date').textContent = data.date ? new Date(data.date).toLocaleString() : '';

      const viewer = document.getElementById('viewer-body');
      if (data.html) {
        const iframe = document.createElement('iframe');
        iframe.sandbox = 'allow-same-origin';
        iframe.style.cssText = 'width:100%;border:none;min-height:300px;';
        viewer.innerHTML = '';
        viewer.appendChild(iframe);
        iframe.contentDocument.open();
        iframe.contentDocument.write(data.html);
        iframe.contentDocument.close();
        iframe.onload = () => { iframe.style.height = iframe.contentDocument.body.scrollHeight + 'px'; };
      } else {
        viewer.textContent = data.text || 'No content';
      }

      // Mark as read
      const msg = messages.find((m) => m.uid === uid);
      if (msg) msg.isRead = true;
    } catch {
      WoxToast.error('Failed to load message');
    }
  };

  window.closeViewer = function () {
    document.getElementById('message-viewer').style.display = 'none';
    document.getElementById('message-list').style.display = 'block';
    document.getElementById('pagination').style.display = 'flex';
    currentMessageUid = null;
    renderMessages(messages);
  };

  window.forwardEmail = function () {
    const to = prompt('Forward to email:');
    if (!to) return;
    fetch(`${API}/personal/forward/${currentMessageUid}`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-csrf-token': getCsrfToken(),
      },
      credentials: 'include',
      body: JSON.stringify({ to }),
    }).then(() => WoxToast.success('Forwarded!')).catch(() => WoxToast.error('Forward failed'));
  };

  window.printEmail = function () { window.print(); };
  window.downloadEml = function () { window.open(`${API}/message/${currentAddress}/${currentMessageUid}/eml`, '_blank'); };
  window.viewSource = function () {
    fetch(`${API}/message/${currentAddress}/${currentMessageUid}/source`, { credentials: 'include' })
      .then((r) => r.json())
      .then((d) => { const w = window.open('', '_blank'); w.document.write(`<pre>${escapeHtml(d.source || '')}</pre>`); })
      .catch(() => WoxToast.error('Failed'));
  };

  // ─── Other Actions ───────────────────────────────────

  window.copyAddress = function () {
    navigator.clipboard.writeText(currentAddress).then(() => WoxToast.success('Copied!'));
  };

  window.extendExpiry = async function () {
    const hours = parseInt(prompt('Extend by how many hours? (max 720)'), 10);
    if (!hours || isNaN(hours)) return;
    try {
      const res = await fetch(`${API}/personal/extend`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-csrf-token': getCsrfToken(),
        },
        credentials: 'include',
        body: JSON.stringify({ hours }),
      });
      const data = await res.json();
      if (!res.ok) return WoxToast.error(data.error);
      WoxToast.success('Expiry extended!');
      startCountdown(data.expiresAt);
    } catch { WoxToast.error('Failed'); }
  };

  window.logout = function () {
    fetch(`${API}/personal/logout`, {
      method: 'POST',
      headers: { 'x-csrf-token': getCsrfToken() },
      credentials: 'include',
    }).then(() => { window.location.href = '/tempmail/login'; });
  };

  window.deleteMailbox = async function () {
    if (!confirm('Delete this mailbox permanently?')) return;
    try {
      await fetch(`${API}/delete/${currentAddress}`, {
        method: 'DELETE',
        headers: { 'x-csrf-token': getCsrfToken() },
        credentials: 'include',
      });
      WoxToast.success('Deleted');
      setTimeout(() => window.location.href = '/tempmail', 1000);
    } catch { WoxToast.error('Failed'); }
  };

  // ─── Pagination ──────────────────────────────────────

  window.prevPage = function () { if (currentPage > 1) { currentPage--; loadInbox(); } };
  window.nextPage = function () { currentPage++; loadInbox(); };

  // ─── Countdown ───────────────────────────────────────

  let countdownInterval;
  function startCountdown(expiresAt) {
    clearInterval(countdownInterval);
    const expiry = new Date(expiresAt);
    const el = document.getElementById('countdown-text');
    countdownInterval = setInterval(() => {
      const r = expiry - Date.now();
      if (r <= 0) {
        clearInterval(countdownInterval);
        el.textContent = 'Expired';
        return;
      }
      const d = Math.floor(r / 86400000);
      const h = Math.floor((r % 86400000) / 3600000);
      const m = Math.floor((r % 3600000) / 60000);
      el.textContent = d > 0 ? `${d}d ${h}h remaining` : `${h}h ${m}m remaining`;
    }, 1000);
  }

  // ─── Helpers ─────────────────────────────────────────

  function escapeHtml(s) { const d = document.createElement('div'); d.textContent = s; return d.innerHTML; }
  function formatDate(ds) {
    if (!ds) return '';
    const d = new Date(ds);
    const diff = Date.now() - d;
    if (diff < 60000) return 'Now';
    if (diff < 3600000) return `${Math.floor(diff / 60000)}m`;
    if (diff < 86400000) return `${Math.floor(diff / 3600000)}h`;
    return d.toLocaleDateString();
  }
})();
