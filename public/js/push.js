/**
 * Push notification subscription manager.
 * Registers service worker and subscribes to Web Push.
 */
(function () {
  'use strict';

  const PUSH_BTN_SELECTOR = '[data-push-toggle]';

  /** Check if push is supported. */
  function isPushSupported() {
    return 'serviceWorker' in navigator && 'PushManager' in window && 'Notification' in window;
  }

  /** URL-safe base64 to Uint8Array (for applicationServerKey). */
  function urlBase64ToUint8Array(base64String) {
    const padding = '='.repeat((4 - (base64String.length % 4)) % 4);
    const base64 = (base64String + padding).replace(/-/g, '+').replace(/_/g, '/');
    const rawData = atob(base64);
    const outputArray = new Uint8Array(rawData.length);
    for (let i = 0; i < rawData.length; i++) {
      outputArray[i] = rawData.charCodeAt(i);
    }
    return outputArray;
  }

  /** Get the VAPID public key from the server. */
  async function getVapidKey() {
    try {
      const res = await fetch('/api/health');
      const data = await res.json();
      return data.vapidPublicKey || null;
    } catch {
      return null;
    }
  }

  /** Subscribe to push notifications. */
  async function subscribeToPush() {
    try {
      const vapidKey = await getVapidKey();
      if (!vapidKey) {
        console.warn('Push: VAPID key not configured');
        return false;
      }

      const registration = await navigator.serviceWorker.ready;
      const subscription = await registration.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: urlBase64ToUint8Array(vapidKey),
      });

      // Send subscription to server
      const csrfMeta = document.querySelector('meta[name="csrf-token"]');
      await fetch('/api/settings/push-subscription', {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          ...(csrfMeta ? { 'X-CSRF-Token': csrfMeta.content } : {}),
        },
        credentials: 'include',
        body: JSON.stringify({ subscription }),
      });

      return true;
    } catch (err) {
      console.error('Push subscription failed:', err);
      return false;
    }
  }

  /** Unsubscribe from push notifications. */
  async function unsubscribeFromPush() {
    try {
      const registration = await navigator.serviceWorker.ready;
      const subscription = await registration.pushManager.getSubscription();
      if (subscription) {
        await subscription.unsubscribe();
      }

      // Remove from server
      const csrfMeta = document.querySelector('meta[name="csrf-token"]');
      await fetch('/api/settings/push-subscription', {
        method: 'DELETE',
        headers: csrfMeta ? { 'X-CSRF-Token': csrfMeta.content } : {},
        credentials: 'include',
      });

      return true;
    } catch (err) {
      console.error('Push unsubscribe failed:', err);
      return false;
    }
  }

  /** Initialize push toggle buttons. */
  async function initPush() {
    if (!isPushSupported()) return;

    const registration = await navigator.serviceWorker.ready;
    const subscription = await registration.pushManager.getSubscription();
    const isSubscribed = !!subscription;

    document.querySelectorAll(PUSH_BTN_SELECTOR).forEach((btn) => {
      btn.textContent = isSubscribed ? 'Notifications On' : 'Enable Notifications';
      btn.classList.toggle('active', isSubscribed);

      btn.addEventListener('click', async () => {
        btn.disabled = true;
        if (isSubscribed) {
          await unsubscribeFromPush();
          btn.textContent = 'Enable Notifications';
          btn.classList.remove('active');
        } else {
          const permission = await Notification.requestPermission();
          if (permission === 'granted') {
            const ok = await subscribeToPush();
            if (ok) {
              btn.textContent = 'Notifications On';
              btn.classList.add('active');
            }
          }
        }
        btn.disabled = false;
      });
    });
  }

  // Auto-init on page load
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initPush);
  } else {
    initPush();
  }
})();
