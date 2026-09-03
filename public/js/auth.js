/**
 * Auth page scripts (login, register, forgot-password).
 * Vanilla JS — no framework. ~10KB budget.
 */
(function () {
  'use strict';

  const API = '/api/auth';
  let otpTicket = null;

  function getCsrfToken() {
    const match = document.cookie.match(/woxmail_csrf=([^;]+)/);
    return match ? match[1] : '';
  }

  // ─── Dynamic Domain Detection & Custom Server Configuration ──

  const emailInput = document.getElementById('email');
  const serverDrawer = document.getElementById('custom-server-drawer');
  const domainBadge = document.getElementById('domain-badge');
  const imapHostInput = document.getElementById('imap_host');
  const imapPortInput = document.getElementById('imap_port');
  const smtpHostInput = document.getElementById('smtp_host');
  const smtpPortInput = document.getElementById('smtp_port');
  const imapSecureCheckbox = document.getElementById('imap_secure');
  const serverStatusHint = document.getElementById('server-status-hint');
  const passwordLabel = document.getElementById('password-label');

  const KNOWN_PRESETS = {
    'gmail.com': { name: 'Google / Gmail', badge: 'badge-red' },
    'googlemail.com': { name: 'Google / Gmail', badge: 'badge-red' },
    'outlook.com': { name: 'Outlook / Hotmail', badge: 'badge-blue' },
    'hotmail.com': { name: 'Outlook / Hotmail', badge: 'badge-blue' },
    'live.com': { name: 'Outlook / Hotmail', badge: 'badge-blue' },
    'msn.com': { name: 'Outlook / Hotmail', badge: 'badge-blue' },
    'office365.com': { name: 'Microsoft 365', badge: 'badge-blue' },
    'yahoo.com': { name: 'Yahoo Mail', badge: 'badge-purple' },
    'ymail.com': { name: 'Yahoo Mail', badge: 'badge-purple' },
    'rocketmail.com': { name: 'Yahoo Mail', badge: 'badge-purple' },
    'icloud.com': { name: 'Apple iCloud', badge: 'badge-blue' },
    'me.com': { name: 'Apple iCloud', badge: 'badge-blue' },
    'mac.com': { name: 'Apple iCloud', badge: 'badge-blue' },
    'zoho.com': { name: 'Zoho Mail', badge: 'badge-green' },
    'zohomail.com': { name: 'Zoho Mail', badge: 'badge-green' },
    'aol.com': { name: 'AOL Mail', badge: 'badge-blue' },
    'fastmail.com': { name: 'Fastmail', badge: 'badge-blue' },
    'proton.me': { name: 'Proton Mail', badge: 'badge-purple' },
    'protonmail.com': { name: 'Proton Mail', badge: 'badge-purple' },
    'pm.me': { name: 'Proton Mail', badge: 'badge-purple' },
    'yandex.com': { name: 'Yandex Mail', badge: 'badge-red' },
    'gmx.com': { name: 'GMX Mail', badge: 'badge-blue' },
  };

  let lastCheckedDomain = '';
  let probeDebounceTimer = null;

  async function checkDomainProbe(domain) {
    if (!domain || domain === lastCheckedDomain) return;
    lastCheckedDomain = domain;

    try {
      const res = await fetch(`${API}/probe-domain?domain=${encodeURIComponent(domain)}`);
      if (!res.ok) return;
      const info = await res.json();

      if (info.isPreset) {
        // MX record or preset domain resolved to a major cloud provider
        if (serverDrawer) serverDrawer.style.display = 'none';
        if (domainBadge) {
          domainBadge.textContent = info.name || info.provider.toUpperCase();
          domainBadge.className = 'badge badge-purple';
          domainBadge.style.display = 'inline-block';
        }
        if (passwordLabel) {
          passwordLabel.textContent = `${info.name || 'Provider'} App Password`;
        }
      } else {
        // Custom domain confirmed
        if (serverDrawer) serverDrawer.style.display = 'block';
        if (domainBadge) {
          domainBadge.textContent = 'CUSTOM DOMAIN';
          domainBadge.className = 'badge badge-amber';
          domainBadge.style.display = 'inline-block';
        }
        if (passwordLabel) {
          passwordLabel.textContent = 'Mailbox Password';
        }
        if (serverStatusHint) {
          serverStatusHint.textContent = `Default: mail.${domain}`;
        }
      }
    } catch {
      // Fallback stays as custom domain
    }
  }

  function handleEmailInput() {
    if (!emailInput) return;
    const rawVal = emailInput.value.trim().toLowerCase();

    if (!rawVal.includes('@') || rawVal.endsWith('@')) {
      if (serverDrawer) serverDrawer.style.display = 'none';
      if (domainBadge) domainBadge.style.display = 'none';
      if (passwordLabel) passwordLabel.textContent = 'Password / App Password';
      lastCheckedDomain = '';
      return;
    }

    const domain = rawVal.split('@')[1].trim();
    if (!domain || !domain.includes('.')) {
      if (serverDrawer) serverDrawer.style.display = 'none';
      if (domainBadge) domainBadge.style.display = 'none';
      return;
    }

    // Check internal domains
    if (domain === 'wox.world' || domain === 'mail.wox.world') {
      if (serverDrawer) serverDrawer.style.display = 'none';
      if (domainBadge) {
        domainBadge.textContent = 'WOXMAIL';
        domainBadge.className = 'badge badge-purple';
        domainBadge.style.display = 'inline-block';
      }
      if (passwordLabel) passwordLabel.textContent = 'WoxMail Password';
      lastCheckedDomain = domain;
      return;
    }

    // Check known presets
    const preset = KNOWN_PRESETS[domain];
    if (preset) {
      if (serverDrawer) serverDrawer.style.display = 'none';
      if (domainBadge) {
        domainBadge.textContent = preset.name;
        domainBadge.className = `badge ${preset.badge}`;
        domainBadge.style.display = 'inline-block';
      }
      if (passwordLabel) passwordLabel.textContent = `${preset.name} App Password`;
      lastCheckedDomain = domain;
      return;
    }

    // It's a custom domain!
    if (serverDrawer) serverDrawer.style.display = 'block';
    if (domainBadge) {
      domainBadge.textContent = 'CUSTOM DOMAIN';
      domainBadge.className = 'badge badge-amber';
      domainBadge.style.display = 'inline-block';
    }
    if (passwordLabel) passwordLabel.textContent = 'Mailbox Password';

    // Auto-fill smart defaults if empty or previous domain default
    if (imapHostInput && (!imapHostInput.value || imapHostInput.value.startsWith('mail.') || imapHostInput.value.startsWith('imap.'))) {
      imapHostInput.value = `mail.${domain}`;
    }
    if (smtpHostInput && (!smtpHostInput.value || smtpHostInput.value.startsWith('mail.') || smtpHostInput.value.startsWith('smtp.'))) {
      smtpHostInput.value = `mail.${domain}`;
    }

    // Run DNS MX probe to detect Google Workspace or Microsoft 365 on custom domains
    clearTimeout(probeDebounceTimer);
    probeDebounceTimer = setTimeout(() => {
      checkDomainProbe(domain);
    }, 450);
  }

  if (emailInput) {
    emailInput.addEventListener('input', handleEmailInput);
    emailInput.addEventListener('change', handleEmailInput);
    emailInput.addEventListener('blur', handleEmailInput);
    // Initial check if field is pre-filled
    if (emailInput.value) handleEmailInput();
  }

  // ─── Login Form ──────────────────────────────────────

  const loginForm = document.getElementById('login-form');
  const otpForm = document.getElementById('otp-form');

  if (loginForm) {
    loginForm.addEventListener('submit', async (e) => {
      e.preventDefault();
      const btn = document.getElementById('login-btn');
      const email = document.getElementById('email').value.trim();
      const password = document.getElementById('password').value;
      const rememberMe = document.getElementById('remember-me')?.checked ?? true;

      if (!email || !password) return WoxToast.error('Fill in all fields');

      btn.disabled = true;
      btn.textContent = 'Signing in...';

      const isCustomServer = serverDrawer && serverDrawer.style.display !== 'none';
      const bodyPayload = {
        email,
        password,
        remember: rememberMe,
      };

      if (isCustomServer) {
        bodyPayload.imap_host = imapHostInput?.value?.trim() || `mail.${email.split('@')[1]}`;
        bodyPayload.imap_port = Number(imapPortInput?.value) || 993;
        bodyPayload.imap_secure = imapSecureCheckbox ? imapSecureCheckbox.checked : true;
        bodyPayload.smtp_host = smtpHostInput?.value?.trim() || `mail.${email.split('@')[1]}`;
        bodyPayload.smtp_port = Number(smtpPortInput?.value) || 465;
        bodyPayload.smtp_secure = imapSecureCheckbox ? imapSecureCheckbox.checked : true;
      }

      try {
        const res = await fetch(`${API}/login`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'x-csrf-token': getCsrfToken(),
          },
          credentials: 'include',
          body: JSON.stringify(bodyPayload),
        });

        const data = await res.json();

        if (!res.ok) {
          WoxToast.error(data.error || 'Login failed');
          return;
        }

        if (data.requires_otp) {
          // Show OTP form
          otpTicket = data.ticket;
          loginForm.style.display = 'none';
          otpForm.style.display = 'flex';
          document.getElementById('otp-code').focus();
          return;
        }

        // Save account to local device manager with session token if rememberMe enabled
        if (window.WoxAccountManager && data.user) {
          if (rememberMe) {
            window.WoxAccountManager.saveAccount(data.user, data.token);
          }
        }

        // Success — redirect to dashboard
        WoxToast.success('Welcome back!');
        setTimeout(() => {
          window.location.href = '/dashboard';
        }, 500);
      } catch {
        WoxToast.error('Network error. Try again.');
      } finally {
        btn.disabled = false;
        btn.textContent = 'Sign In';
      }
    });
  }

  // ─── OTP Form ────────────────────────────────────────

  if (otpForm) {
    otpForm.addEventListener('submit', async (e) => {
      e.preventDefault();
      const btn = document.getElementById('otp-btn');
      const code = document.getElementById('otp-code').value.trim();

      if (!code || code.length < 6) return WoxToast.error('Enter a 6-digit code');

      btn.disabled = true;
      btn.textContent = 'Verifying...';

      try {
        const res = await fetch(`${API}/verify-otp`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          credentials: 'include',
          body: JSON.stringify({ ticket: otpTicket, code }),
        });

        const data = await res.json();

        if (!res.ok) {
          WoxToast.error(data.error || 'Invalid code');
          document.getElementById('otp-code').value = '';
          document.getElementById('otp-code').focus();
          return;
        }

        // Save account to local device manager with session token
        if (window.WoxAccountManager && data.user) {
          window.WoxAccountManager.saveAccount(data.user, data.token);
        }

        WoxToast.success('Welcome back!');
        setTimeout(() => {
          window.location.href = '/dashboard';
        }, 500);
      } catch {
        WoxToast.error('Network error. Try again.');
      } finally {
        btn.disabled = false;
        btn.textContent = 'Verify';
      }
    });

    // Auto-submit on 6 digits
    document.getElementById('otp-code')?.addEventListener('input', (e) => {
      e.target.value = e.target.value.replace(/\D/g, '').slice(0, 6);
      if (e.target.value.length === 6) {
        otpForm.dispatchEvent(new Event('submit'));
      }
    });
  }

  // ─── Register Form ───────────────────────────────────

  const registerForm = document.getElementById('register-form');
  if (registerForm) {
    registerForm.addEventListener('submit', async (e) => {
      e.preventDefault();
      const btn = document.getElementById('register-btn');
      const username = document.getElementById('username').value.trim();
      const password = document.getElementById('reg-password').value;
      const confirmPassword = document.getElementById('confirm-password').value;
      const inviteCode = document.getElementById('invite-code').value.trim();

      if (password !== confirmPassword) {
        return WoxToast.error('Passwords do not match');
      }

      btn.disabled = true;
      btn.textContent = 'Creating account...';

      try {
        const res = await fetch(`${API}/register`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'x-csrf-token': getCsrfToken(),
          },
          credentials: 'include',
          body: JSON.stringify({ username, password, inviteCode }),
        });

        const data = await res.json();

        if (!res.ok) {
          WoxToast.error(data.error || 'Registration failed');
          if (data.details) data.details.forEach((d) => WoxToast.warning(d));
          return;
        }

        WoxToast.success('Account created!');
        setTimeout(() => {
          window.location.href = '/otp-setup';
        }, 500);
      } catch {
        WoxToast.error('Network error. Try again.');
      } finally {
        btn.disabled = false;
        btn.textContent = 'Create Account';
      }
    });
  }

  // ─── Forgot Password Form ───────────────────────────

  const forgotForm = document.getElementById('forgot-form');
  if (forgotForm) {
    forgotForm.addEventListener('submit', async (e) => {
      e.preventDefault();
      const btn = document.getElementById('forgot-btn');
      const email = document.getElementById('forgot-email').value.trim();

      btn.disabled = true;
      btn.textContent = 'Sending...';

      try {
        const res = await fetch(`${API}/forgot-password`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'x-csrf-token': getCsrfToken(),
          },
          credentials: 'include',
          body: JSON.stringify({ email }),
        });

        const data = await res.json();
        WoxToast.success(data.message || 'If an account exists, a reset link has been sent.');
      } catch {
        WoxToast.error('Network error.');
      } finally {
        btn.disabled = false;
        btn.textContent = 'Send Reset Link';
      }
    });
  }

  // ─── Helpers ─────────────────────────────────────────

  window.togglePassword = function () {
    const input = document.getElementById('password') || document.getElementById('reg-password');
    if (input) {
      input.type = input.type === 'password' ? 'text' : 'password';
    }
  };

  window.backToLogin = function () {
    otpTicket = null;
    if (otpForm) otpForm.style.display = 'none';
    if (loginForm) loginForm.style.display = 'flex';
    document.getElementById('password').value = '';
    document.getElementById('password').focus();
  };

  window.showRecoveryInput = function () {
    const input = document.getElementById('otp-code');
    if (input) {
      input.maxLength = 10;
      input.pattern = '[A-Za-z0-9]{10}';
      input.placeholder = 'RECOVERY CODE';
      input.style.letterSpacing = '0.15rem';
      input.style.fontSize = '1.25rem';
      input.value = '';
      input.focus();
    }
  };

  // Password strength meter
  const passwordInput = document.getElementById('reg-password');
  const strengthMeter = document.getElementById('password-strength');
  if (passwordInput && strengthMeter) {
    passwordInput.addEventListener('input', () => {
      const pw = passwordInput.value;
      let score = 0;
      if (pw.length >= 8) score++;
      if (pw.length >= 12) score++;
      if (/[a-z]/.test(pw) && /[A-Z]/.test(pw)) score++;
      if (/\d/.test(pw)) score++;
      if (/[^a-zA-Z0-9]/.test(pw)) score++;

      const labels = ['', 'Weak', 'Fair', 'Good', 'Strong', 'Excellent'];
      const colors = ['', '#ef4444', '#f59e0b', '#3b82f6', '#22c55e', '#7c3aed'];
      strengthMeter.textContent = labels[score] || '';
      strengthMeter.style.color = colors[score] || '';
    });
  }
})();
