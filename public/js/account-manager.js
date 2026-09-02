/**
 * WoxMail Sovereign Multi-Account Manager & Switcher
 * Provides seamless 1-click multi-account switching, local device vault,
 * token persistence, avatar generation, and account chooser UI.
 */

(function () {
  'use strict';

  const STORAGE_KEY = 'woxmail_saved_accounts';

  // Palette of sovereign gradient accent colors
  const AVATAR_PALETTES = [
    { bg: 'linear-gradient(135deg, #7c3aed, #3b82f6)', text: '#ffffff' },
    { bg: 'linear-gradient(135deg, #ec4899, #8b5cf6)', text: '#ffffff' },
    { bg: 'linear-gradient(135deg, #06b6d4, #3b82f6)', text: '#ffffff' },
    { bg: 'linear-gradient(135deg, #10b981, #059669)', text: '#ffffff' },
    { bg: 'linear-gradient(135deg, #f59e0b, #d97706)', text: '#ffffff' },
    { bg: 'linear-gradient(135deg, #8b5cf6, #d946ef)', text: '#ffffff' },
    { bg: 'linear-gradient(135deg, #6366f1, #a855f7)', text: '#ffffff' },
    { bg: 'linear-gradient(135deg, #14b8a6, #0284c7)', text: '#ffffff' },
  ];

  function stringHash(str) {
    let hash = 0;
    for (let i = 0; i < (str || '').length; i++) {
      hash = (hash << 5) - hash + str.charCodeAt(i);
      hash |= 0;
    }
    return Math.abs(hash);
  }

  const WoxAccountManager = {
    getAccounts: function () {
      try {
        const raw = localStorage.getItem(STORAGE_KEY);
        if (!raw) return [];
        const accounts = JSON.parse(raw);
        if (!Array.isArray(accounts)) return [];
        return accounts.sort((a, b) => (new Date(b.lastActive || 0) - new Date(a.lastActive || 0)));
      } catch {
        return [];
      }
    },

    saveAccount: function (user, token) {
      if (!user || (!user.email && !user.username)) return;
      const accounts = this.getAccounts();
      const email = (user.email || `${user.username}@wox.world`).toLowerCase();
      const username = (user.username || user.email.split('@')[0]).toLowerCase();

      const existingIndex = accounts.findIndex(
        (a) => a.email.toLowerCase() === email || a.username.toLowerCase() === username
      );

      const existingToken = existingIndex >= 0 ? accounts[existingIndex].token : null;

      const accountData = {
        id: user.id || (existingIndex >= 0 ? accounts[existingIndex].id : null),
        email: email,
        username: username,
        displayName: user.displayName || user.display_name || user.username || email.split('@')[0],
        avatarStyle: this.getAvatarStyle(username || email),
        lastActive: new Date().toISOString(),
        isAdmin: !!(user.is_admin || user.isAdmin),
        token: token || existingToken || null,
      };

      if (existingIndex >= 0) {
        accounts[existingIndex] = { ...accounts[existingIndex], ...accountData };
      } else {
        accounts.unshift(accountData);
      }

      // Limit to 10 saved accounts per device
      const trimmed = accounts.slice(0, 10);
      try {
        localStorage.setItem(STORAGE_KEY, JSON.stringify(trimmed));
      } catch (e) {
        console.warn('[WoxAccountManager] Failed to save accounts:', e);
      }
      return trimmed;
    },

    /**
     * Synchronizes the currently active server-rendered user into the local device vault.
     * If no token is provided, fetches the token via /api/auth/current-session in background.
     */
    syncCurrentSession: function (user, token) {
      if (!user) return;
      this.saveAccount(user, token);

      const email = (user.email || `${user.username}@wox.world`).toLowerCase();
      const accounts = this.getAccounts();
      const saved = accounts.find((a) => a.email.toLowerCase() === email);

      if (!saved || !saved.token) {
        fetch('/api/auth/current-session', { credentials: 'include' })
          .then((res) => (res.ok ? res.json() : null))
          .then((data) => {
            if (data && data.token) {
              this.saveAccount(data.user || user, data.token);
              this.initNavDropdown();
            }
          })
          .catch(() => {});
      } else {
        this.initNavDropdown();
      }
    },

    removeAccount: function (email) {
      if (!email) return;
      let accounts = this.getAccounts();
      accounts = accounts.filter((a) => a.email.toLowerCase() !== email.toLowerCase());
      try {
        localStorage.setItem(STORAGE_KEY, JSON.stringify(accounts));
      } catch {}
      return accounts;
    },

    removeAccountAndRefresh: function (email) {
      if (confirm(`Remove ${email} from this device?`)) {
        this.removeAccount(email);
        this.initNavDropdown();
      }
    },

    clearAllAccounts: function () {
      try {
        localStorage.removeItem(STORAGE_KEY);
      } catch {}
    },

    getAvatarStyle: function (identifier) {
      const idx = stringHash(identifier || 'user') % AVATAR_PALETTES.length;
      return AVATAR_PALETTES[idx];
    },

    getInitials: function (name) {
      if (!name) return 'W';
      const clean = name.replace(/@.*$/, '').trim();
      const parts = clean.split(/[._\-\s]+/);
      if (parts.length > 1 && parts[0] && parts[1]) {
        return (parts[0][0] + parts[1][0]).toUpperCase();
      }
      return clean.slice(0, 2).toUpperCase();
    },

    /**
     * Seamless 1-Click Account Switcher.
     * Uses saved session token to instantly authenticate without password prompt.
     */
    switchToAccount: async function (email) {
      if (!email) return;
      const accounts = this.getAccounts();
      const target = accounts.find((a) => a.email.toLowerCase() === email.toLowerCase());

      if (!target) {
        window.location.href = `/login?email=${encodeURIComponent(email)}`;
        return;
      }

      if (window.WoxToast) {
        window.WoxToast.info(`Switching to ${target.displayName || target.username}...`);
      }

      // If we have a saved JWT session token for this account, attempt 1-click switch
      if (target.token) {
        try {
          const res = await fetch('/api/auth/switch-account', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            credentials: 'include',
            body: JSON.stringify({ token: target.token, email: target.email }),
          });

          const data = await res.json();
          if (res.ok && data.success) {
            // Update fresh token and active timestamp
            this.saveAccount(data.user, data.token);
            if (window.WoxToast) {
              window.WoxToast.success(`Switched to ${data.user.username}`);
            }
            setTimeout(() => {
              window.location.href = '/dashboard';
            }, 300);
            return;
          }
        } catch (err) {
          console.warn('[WoxAccountManager] Fast token switch failed:', err);
        }
      }

      // Fallback: If token expired or missing, direct to login with pre-filled email
      window.location.href = `/login?email=${encodeURIComponent(target.email)}&switch=1`;
    },

    prepareAddAccount: function () {
      // Current session is already synced, navigate to login with add_account param
      window.location.href = '/login?add_account=1';
    },

    // ─── Login Page Integration ───────────────────────────

    initLoginPage: function () {
      const chooserContainer = document.getElementById('account-chooser-container');
      const loginForm = document.getElementById('login-form');
      const selectedAccountCard = document.getElementById('selected-account-card');
      const emailInput = document.getElementById('email');

      if (!chooserContainer || !loginForm) return;

      const accounts = this.getAccounts();
      const urlParams = new URLSearchParams(window.location.search);
      const forceAddAccount = urlParams.has('add_account') || urlParams.has('new');
      const prefillEmail = urlParams.get('email');

      if (prefillEmail) {
        const target = accounts.find((a) => a.email.toLowerCase() === prefillEmail.toLowerCase());
        if (target) {
          this.selectAccount(target);
          return;
        }
      }

      if (accounts.length > 0 && !forceAddAccount) {
        this.renderChooser(accounts);
        chooserContainer.style.display = 'block';
        loginForm.style.display = 'none';
        if (selectedAccountCard) selectedAccountCard.style.display = 'none';
      } else {
        chooserContainer.style.display = 'none';
        loginForm.style.display = 'flex';
        if (selectedAccountCard) selectedAccountCard.style.display = 'none';
        if (accounts.length > 0) {
          const switchLink = document.getElementById('view-saved-accounts-link');
          if (switchLink) switchLink.style.display = 'inline-block';
        }
      }
    },

    renderChooser: function (accounts) {
      const listEl = document.getElementById('saved-accounts-list');
      if (!listEl) return;

      listEl.innerHTML = '';
      accounts.forEach((acc) => {
        const item = document.createElement('div');
        item.className = 'saved-account-item';
        item.onclick = (e) => {
          if (e.target.closest('.account-remove-btn')) return;
          // If token exists, try 1-click switch; otherwise show password form
          if (acc.token) {
            this.switchToAccount(acc.email);
          } else {
            this.selectAccount(acc);
          }
        };

        const initials = this.getInitials(acc.displayName || acc.username);
        const style = acc.avatarStyle || this.getAvatarStyle(acc.username);

        item.innerHTML = `
          <div class="account-avatar" style="background: ${style.bg}; color: ${style.text};">
            ${initials}
          </div>
          <div class="account-details">
            <div class="account-name">${acc.displayName || acc.username} ${acc.isAdmin ? '<span class="admin-pill">Admin</span>' : ''}</div>
            <div class="account-email">${acc.email}</div>
          </div>
          <button type="button" class="account-remove-btn" title="Remove account from device" aria-label="Remove account">
            ✕
          </button>
        `;

        const removeBtn = item.querySelector('.account-remove-btn');
        removeBtn.onclick = (e) => {
          e.stopPropagation();
          if (confirm(`Remove ${acc.email} from this device?`)) {
            this.removeAccount(acc.email);
            const remaining = this.getAccounts();
            if (remaining.length === 0) {
              this.showManualLogin();
            } else {
              this.renderChooser(remaining);
            }
          }
        };

        listEl.appendChild(item);
      });
    },

    selectAccount: function (acc) {
      const chooserContainer = document.getElementById('account-chooser-container');
      const loginForm = document.getElementById('login-form');
      const selectedCard = document.getElementById('selected-account-card');
      const emailInput = document.getElementById('email');
      const passwordInput = document.getElementById('password');
      const emailFieldGroup = document.getElementById('email-field-group');

      if (!loginForm || !selectedCard) return;

      if (emailInput) {
        emailInput.value = acc.email;
      }

      if (emailFieldGroup) {
        emailFieldGroup.style.display = 'none';
      }

      const initials = this.getInitials(acc.displayName || acc.username);
      const style = acc.avatarStyle || this.getAvatarStyle(acc.username);

      selectedCard.innerHTML = `
        <div class="selected-account-inner">
          <div class="account-avatar" style="background: ${style.bg}; color: ${style.text}; width: 48px; height: 48px; font-size: 1.15rem;">
            ${initials}
          </div>
          <div class="account-details" style="flex: 1;">
            <div class="account-name" style="font-size: 1.05rem;">${acc.displayName || acc.username}</div>
            <div class="account-email">${acc.email}</div>
          </div>
          <button type="button" class="btn btn-ghost btn-xs" onclick="WoxAccountManager.showChooser()" style="color: var(--color-primary-light); font-weight: 600;">
            ← Switch
          </button>
        </div>
      `;

      if (chooserContainer) chooserContainer.style.display = 'none';
      selectedCard.style.display = 'block';
      loginForm.style.display = 'flex';

      if (passwordInput) {
        passwordInput.value = '';
        passwordInput.focus();
      }
    },

    showChooser: function () {
      const chooserContainer = document.getElementById('account-chooser-container');
      const loginForm = document.getElementById('login-form');
      const selectedCard = document.getElementById('selected-account-card');
      const emailFieldGroup = document.getElementById('email-field-group');

      const accounts = this.getAccounts();
      if (accounts.length === 0) {
        this.showManualLogin();
        return;
      }

      this.renderChooser(accounts);
      if (chooserContainer) chooserContainer.style.display = 'block';
      if (loginForm) loginForm.style.display = 'none';
      if (selectedCard) selectedCard.style.display = 'none';
      if (emailFieldGroup) emailFieldGroup.style.display = 'flex';
    },

    showManualLogin: function () {
      const chooserContainer = document.getElementById('account-chooser-container');
      const loginForm = document.getElementById('login-form');
      const selectedCard = document.getElementById('selected-account-card');
      const emailInput = document.getElementById('email');
      const emailFieldGroup = document.getElementById('email-field-group');

      if (chooserContainer) chooserContainer.style.display = 'none';
      if (selectedCard) selectedCard.style.display = 'none';
      if (emailFieldGroup) emailFieldGroup.style.display = 'flex';
      if (loginForm) loginForm.style.display = 'flex';

      if (emailInput) {
        emailInput.value = '';
        emailInput.focus();
      }
    },

    // ─── In-App Top Navigation Switcher Dropdown ───────────

    initNavDropdown: function () {
      const dropdownList = document.getElementById('nav-account-switcher-list');
      if (!dropdownList) return;

      const accounts = this.getAccounts();
      const currentEmail = (dropdownList.getAttribute('data-current-email') || '').toLowerCase();

      dropdownList.innerHTML = '';
      const otherAccounts = accounts.filter((a) => a.email.toLowerCase() !== currentEmail);

      if (otherAccounts.length === 0) {
        dropdownList.innerHTML = `
          <div class="nav-account-empty">No other saved accounts on this device</div>
        `;
        return;
      }

      otherAccounts.forEach((acc) => {
        const item = document.createElement('div');
        item.className = 'nav-account-item';
        item.style.cursor = 'pointer';
        item.title = `Switch to ${acc.displayName || acc.username} (${acc.email})`;
        item.onclick = (e) => {
          if (e.target.closest('.account-remove-btn')) return;
          this.switchToAccount(acc.email);
        };

        const initials = this.getInitials(acc.displayName || acc.username);
        const style = acc.avatarStyle || this.getAvatarStyle(acc.username);

        item.innerHTML = `
          <div class="account-avatar-sm" style="background: ${style.bg}; color: ${style.text};">
            ${initials}
          </div>
          <div class="nav-account-info">
            <div class="nav-account-name">${acc.displayName || acc.username} ${acc.isAdmin ? '<span class="admin-badge" style="font-size:0.6rem;">Admin</span>' : ''}</div>
            <div class="nav-account-email">${acc.email}</div>
          </div>
          <button type="button" class="nav-account-switch-tag" style="border: none; cursor: pointer;">
            Switch
          </button>
          <button type="button" class="account-remove-btn" title="Remove account from device" style="background:none;border:none;color:var(--color-text-tertiary);font-size:0.75rem;padding:2px 4px;margin-left:4px;cursor:pointer;">
            ✕
          </button>
        `;

        const removeBtn = item.querySelector('.account-remove-btn');
        if (removeBtn) {
          removeBtn.onclick = (e) => {
            e.stopPropagation();
            this.removeAccountAndRefresh(acc.email);
          };
        }

        dropdownList.appendChild(item);
      });
    },
  };

  window.WoxAccountManager = WoxAccountManager;

  // Auto-init on page ready
  document.addEventListener('DOMContentLoaded', () => {
    if (document.getElementById('login-form')) {
      WoxAccountManager.initLoginPage();
    }
    if (document.getElementById('nav-account-switcher-list')) {
      WoxAccountManager.initNavDropdown();
    }
  });
})();
