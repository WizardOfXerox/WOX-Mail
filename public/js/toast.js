/**
 * WoxMail Toast Notification System with Action & Undo Support
 */
(function() {
  let container = null;

  /**
   * Ensure toast container exists
   */
  function initContainer() {
    if (!container) {
      container = document.createElement('div');
      container.className = 'toast-container';
      document.body.appendChild(container);
    }
  }

  /**
   * Create and show a toast
   * @param {string} message 
   * @param {string} type 
   * @param {number} duration 
   * @param {object|null} action Optional action button { text: string, onClick: function }
   */
  function showToast(message, type = 'info', duration = 3500, action = null) {
    initContainer();

    const toast = document.createElement('div');
    toast.className = `toast toast-${type}`;
    
    // Icon based on type
    let icon = '';
    switch (type) {
      case 'success': icon = '<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="var(--color-success)" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><polyline points="20 6 9 17 4 12"/></svg>'; break;
      case 'error': icon = '<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="var(--color-error)" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>'; break;
      case 'warning': icon = '<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="var(--color-warning)" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/></svg>'; break;
      case 'info': icon = '<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="var(--color-info)" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><line x1="12" y1="16" x2="12" y2="12"/><line x1="12" y1="8" x2="12.01" y2="8"/></svg>'; break;
    }

    toast.innerHTML = `
      <div class="toast-icon" style="display:flex;align-items:center;">${icon}</div>
      <div class="toast-message" style="flex:1;font-size:0.875rem;">${message}</div>
    `;

    if (action && action.text && typeof action.onClick === 'function') {
      const btn = document.createElement('button');
      btn.type = 'button';
      btn.className = 'toast-action-btn';
      btn.textContent = action.text;
      btn.style.cssText = 'margin-left:0.75rem;background:var(--color-primary);color:#ffffff;border:none;border-radius:var(--radius-pill);padding:0.25rem 0.75rem;font-size:0.75rem;font-weight:700;cursor:pointer;flex-shrink:0;box-shadow:0 0 10px var(--color-primary-glow);transition:all 0.15s ease;';
      btn.onmouseover = () => { btn.style.background = 'var(--color-primary-hover)'; btn.style.transform = 'scale(1.05)'; };
      btn.onmouseout = () => { btn.style.background = 'var(--color-primary)'; btn.style.transform = 'scale(1)'; };
      btn.addEventListener('click', (e) => {
        e.stopPropagation();
        dismissToast(toast);
        action.onClick();
      });
      toast.appendChild(btn);
    }

    // Click to dismiss
    toast.addEventListener('click', () => dismissToast(toast));

    container.appendChild(toast);

    // Auto dismiss
    if (duration > 0) {
      setTimeout(() => dismissToast(toast), duration);
    }
    return toast;
  }

  /**
   * Dismiss a specific toast with animation
   * @param {HTMLElement} toast 
   */
  function dismissToast(toast) {
    if (!toast || toast.classList.contains('hiding')) return;
    
    toast.classList.add('hiding');
    toast.addEventListener('animationend', () => {
      toast.remove();
      if (container && container.children.length === 0) {
        container.remove();
        container = null;
      }
    });
  }

  window.WoxToast = {
    success: (msg, duration = 3000) => showToast(msg, 'success', duration),
    error: (msg, duration = 5000) => showToast(msg, 'error', duration),
    warning: (msg, duration = 4000) => showToast(msg, 'warning', duration),
    info: (msg, duration = 3000) => showToast(msg, 'info', duration),
    action: (msg, action, duration = 7000, type = 'info') => showToast(msg, type, duration, action),
  };
})();
