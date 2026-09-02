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

      try {
        const res = await fetch(`${API}/login`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'x-csrf-token': getCsrfToken(),
          },
          credentials: 'include',
          body: JSON.stringify({ email, password, remember: rememberMe }),
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
