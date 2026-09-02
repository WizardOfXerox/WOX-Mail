/**
 * WoxMail PWA Core & Install Prompt Manager
 * Handles Service Worker registration, beforeinstallprompt capture,
 * standalone mode detection, and in-app install triggers.
 */

(function () {
  'use strict';

  let deferredInstallPrompt = null;
  const isStandalone = window.matchMedia('(display-mode: standalone)').matches || window.navigator.standalone === true;
  const isIOS = /iPad|iPhone|iPod/.test(navigator.userAgent) && !window.MSStream;

  // 1. Service Worker Registration
  if ('serviceWorker' in navigator) {
    window.addEventListener('load', () => {
      navigator.serviceWorker
        .register('/sw.js')
        .then((reg) => {
          // Check for worker updates
          reg.onupdatefound = () => {
            const installingWorker = reg.installing;
            if (installingWorker) {
              installingWorker.onstatechange = () => {
                if (installingWorker.state === 'installed' && navigator.serviceWorker.controller) {
                  console.log('[WoxMail PWA] New update available.');
                  if (typeof showToast === 'function') {
                    showToast('WoxMail update available. Reloading...', 'info');
                  }
                }
              };
            }
          };
        })
        .catch((err) => {
          console.warn('[WoxMail PWA] Service Worker registration skipped:', err);
        });
    });
  }

  // 2. Capture Chrome / Edge / Android beforeinstallprompt
  window.addEventListener('beforeinstallprompt', (e) => {
    e.preventDefault();
    deferredInstallPrompt = e;
    console.log('[WoxMail PWA] Captured beforeinstallprompt event.');

    // Show Install UI triggers across navbar and banner
    showInstallPrompts();
  });

  // 3. Track successful app installation
  window.addEventListener('appinstalled', () => {
    console.log('[WoxMail PWA] App was successfully installed.');
    deferredInstallPrompt = null;
    hideInstallPrompts();
    if (typeof showToast === 'function') {
      showToast('WoxMail installed successfully!', 'success');
    }
  });

  function showInstallPrompts() {
    if (isStandalone) return;

    // Desktop & Mobile Navbar button
    const installBtns = document.querySelectorAll('.wox-pwa-install-btn');
    installBtns.forEach((btn) => {
      btn.style.display = 'inline-flex';
      btn.onclick = triggerPWAInstall;
    });

    // Floating Banner (if present or created)
    const banner = document.getElementById('wox-pwa-banner');
    if (banner && !sessionStorage.getItem('wox_pwa_banner_dismissed')) {
      banner.classList.add('visible');
    }
  }

  function hideInstallPrompts() {
    const installBtns = document.querySelectorAll('.wox-pwa-install-btn');
    installBtns.forEach((btn) => {
      btn.style.display = 'none';
    });

    const banner = document.getElementById('wox-pwa-banner');
    if (banner) {
      banner.classList.remove('visible');
    }
  }

  // Trigger Native Install Dialog
  window.triggerPWAInstall = async function () {
    if (deferredInstallPrompt) {
      deferredInstallPrompt.prompt();
      const { outcome } = await deferredInstallPrompt.userChoice;
      console.log(`[WoxMail PWA] User install choice: ${outcome}`);
      deferredInstallPrompt = null;
      hideInstallPrompts();
    } else if (isIOS && !isStandalone) {
      alert('To install WoxMail on iOS:\n1. Tap the Share button (square with arrow up)\n2. Scroll down and tap "Add to Home Screen"');
    } else {
      if (typeof showToast === 'function') {
        showToast('App is already installed or supported directly via your browser address bar icon.', 'info');
      }
    }
  };

  window.dismissPWABanner = function () {
    sessionStorage.setItem('wox_pwa_banner_dismissed', 'true');
    const banner = document.getElementById('wox-pwa-banner');
    if (banner) {
      banner.classList.remove('visible');
    }
  };

  // Check iOS presentation on DOM load
  document.addEventListener('DOMContentLoaded', () => {
    if (isIOS && !isStandalone && !sessionStorage.getItem('wox_pwa_banner_dismissed')) {
      const banner = document.getElementById('wox-pwa-banner');
      if (banner) {
        banner.classList.add('visible');
      }
    }
  });
})();
