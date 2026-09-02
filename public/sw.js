/**
 * WoxMail Sovereign Service Worker v2.0
 * High-performance PWA offline caching, installability, and push notification handler.
 */

const CACHE_NAME = 'woxmail-pwa-v4';
const OFFLINE_FALLBACK_URL = '/';

const PRECACHE_ASSETS = [
  '/',
  '/manifest.json',
  '/css/style.css',
  '/assets/favicon.svg',
  '/assets/icon-192.png',
  '/assets/icon-512.png',
  '/assets/apple-touch-icon.png',
  '/assets/og-preview.png',
  '/brand/logo.svg'
];

// 1. Install: Precache core shell
self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => {
      return cache.addAll(PRECACHE_ASSETS).catch((err) => {
        console.warn('[WoxMail SW] Precache non-critical asset skip:', err);
      });
    })
  );
  self.skipWaiting();
});

// 2. Activate: Purge stale caches and claim clients immediately
self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) => {
      return Promise.all(
        keys.filter((key) => key !== CACHE_NAME).map((key) => caches.delete(key))
      );
    })
  );
  self.clients.claim();
});

// 3. Fetch Strategy:
// - API & Dynamic mutating requests: Network only
// - React Bundles in /dist/: Network First with Cache Fallback (guarantees chunk synchronization)
// - Static assets (CSS, Images, Local Fonts): Cache First with Background Update (Stale-While-Revalidate)
// - HTML Navigations: Network First with Cache Fallback
self.addEventListener('fetch', (event) => {
  const { request } = event;

  // Only handle HTTP/HTTPS requests
  if (!request.url.startsWith('http://') && !request.url.startsWith('https://')) {
    return;
  }

  const url = new URL(request.url);

  // Skip non-GET, WebSockets, API requests, and third-party origins (e.g. Google Fonts CDN, extensions)
  if (
    request.method !== 'GET' ||
    url.origin !== self.location.origin ||
    url.pathname.startsWith('/api/') ||
    url.pathname.startsWith('/socket.io/') ||
    url.protocol.startsWith('ws')
  ) {
    return;
  }

  // A1. React Application Bundles in /dist/ (Network First to prevent stale chunk import 404s)
  if (url.pathname.startsWith('/dist/')) {
    event.respondWith(
      fetch(request)
        .then((networkResponse) => {
          if (networkResponse && networkResponse.status === 200 && networkResponse.type === 'basic') {
            const responseClone = networkResponse.clone();
            caches.open(CACHE_NAME).then((cache) => cache.put(request, responseClone)).catch(() => {});
          }
          return networkResponse;
        })
        .catch(() => caches.match(request))
    );
    return;
  }

  // A2. Static Asset requests (CSS, JS libraries, Images, Local Fonts)
  if (
    url.pathname.startsWith('/css/') ||
    url.pathname.startsWith('/js/') ||
    url.pathname.startsWith('/assets/') ||
    url.pathname.startsWith('/brand/') ||
    ['style', 'script', 'image', 'font'].includes(request.destination)
  ) {
    event.respondWith(
      caches.match(request).then((cachedResponse) => {
        const fetchPromise = fetch(request)
          .then((networkResponse) => {
            if (networkResponse && networkResponse.status === 200 && networkResponse.type === 'basic') {
              const responseClone = networkResponse.clone();
              caches.open(CACHE_NAME).then((cache) => cache.put(request, responseClone)).catch(() => {});
            }
            return networkResponse;
          })
          .catch(() => cachedResponse);

        return cachedResponse || fetchPromise;
      }).catch(() => fetch(request))
    );
    return;
  }

  // B. HTML Navigations (Network First)
  if (request.mode === 'navigate' || request.destination === 'document') {
    event.respondWith(
      fetch(request)
        .then((response) => {
          if (response && response.status === 200 && response.type === 'basic') {
            const responseClone = response.clone();
            caches.open(CACHE_NAME).then((cache) => cache.put(request, responseClone)).catch(() => {});
          }
          return response;
        })
        .catch(() => {
          return caches.match(request).then((cached) => {
            return cached || caches.match(OFFLINE_FALLBACK_URL);
          });
        })
    );
    return;
  }
});

// 4. Push Notification Handler
self.addEventListener('push', (event) => {
  let payload = { title: 'WoxMail', body: 'You have a new secure message.' };
  try {
    if (event.data) {
      payload = event.data.json();
    }
  } catch (e) {
    payload.body = event.data ? event.data.text() : payload.body;
  }

  const options = {
    body: payload.body,
    icon: '/assets/icon-192.png',
    badge: '/assets/icon-192.png',
    vibrate: [100, 50, 100],
    data: {
      url: payload.url || '/dashboard',
      dateOfArrival: Date.now()
    },
    actions: [
      { action: 'open', title: 'Open WoxMail' },
      { action: 'close', title: 'Dismiss' }
    ]
  };

  event.waitUntil(self.registration.showNotification(payload.title || 'WoxMail', options));
});

// 5. Notification Click Handler
self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  const targetUrl = event.notification.data?.url || '/dashboard';

  event.waitUntil(
    clients.matchAll({ type: 'window', includeUncontrolled: true }).then((clientList) => {
      for (const client of clientList) {
        if (client.url.includes(targetUrl) && 'focus' in client) {
          return client.focus();
        }
      }
      if (clients.openWindow) {
        return clients.openWindow(targetUrl);
      }
    })
  );
});

// 6. Listen for manual skipWaiting messages
self.addEventListener('message', (event) => {
  if (event.data && event.data.type === 'SKIP_WAITING') {
    self.skipWaiting();
  }
});
