/**
 * GenFocus Service Worker
 * - Caches all app assets for offline use
 * - Handles background push notification events
 * - On notification click: focuses or opens the GenFocus tab
 * - Updates cache on new app versions using stale-while-revalidate strategy
 */

const CACHE_NAME = 'genfocus-v1';

// Assets to pre-cache on install
const PRECACHE_URLS = [
  './',
  './index.html',
  './style.css',
  './app.js',
  './manifest.json',
  './src/storage.js',
  './src/goal.js',
  './src/notifications.js',
  './src/onboarding.js',
  './src/auth.js',
  './src/timer.js',
  './src/ui.js',
  './src/settings.js',
  './src/dashboard.js',
];

// ── Install: pre-cache all app shell assets ──────────────────────────────────

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => {
      return cache.addAll(PRECACHE_URLS);
    }).then(() => self.skipWaiting())
  );
});

// ── Activate: clean up old caches ────────────────────────────────────────────

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((cacheNames) => {
      return Promise.all(
        cacheNames
          .filter((name) => name !== CACHE_NAME)
          .map((name) => caches.delete(name))
      );
    }).then(() => self.clients.claim())
  );
});

// ── Fetch: cache-first for app shell, network-first for external ─────────────

self.addEventListener('fetch', (event) => {
  const { request } = event;
  const url = new URL(request.url);

  // Only intercept same-origin requests (skip Google Fonts, CDNs etc)
  if (url.origin !== self.location.origin) return;

  event.respondWith(
    caches.match(request).then((cachedResponse) => {
      if (cachedResponse) {
        // Serve from cache, but also update cache in background (stale-while-revalidate)
        const fetchPromise = fetch(request).then((networkResponse) => {
          if (networkResponse && networkResponse.status === 200) {
            caches.open(CACHE_NAME).then((cache) => {
              cache.put(request, networkResponse.clone());
            });
          }
          return networkResponse;
        }).catch(() => {/* offline: silently fall back to cached */});
        return cachedResponse;
      }
      // Not in cache: try network, then cache the response
      return fetch(request).then((networkResponse) => {
        if (!networkResponse || networkResponse.status !== 200) return networkResponse;
        const responseClone = networkResponse.clone();
        caches.open(CACHE_NAME).then((cache) => cache.put(request, responseClone));
        return networkResponse;
      });
    })
  );
});

// ── Push Notifications ────────────────────────────────────────────────────────

self.addEventListener('push', (event) => {
  let data = { title: 'GenFocus', body: '' };
  try {
    if (event.data) data = event.data.json();
  } catch (_) {
    if (event.data) data.body = event.data.text();
  }

  const options = {
    body: data.body || '',
    icon: './manifest.json', // placeholder; replace with real icon path when available
    badge: './manifest.json',
    silent: false,
    data: { url: self.registration.scope },
    actions: [
      { action: 'open', title: 'Open GenFocus' }
    ]
  };

  event.waitUntil(
    self.registration.showNotification(data.title || 'GenFocus', options)
  );
});

// ── Notification Click: open or focus GenFocus tab ───────────────────────────

self.addEventListener('notificationclick', (event) => {
  event.notification.close();

  const targetUrl = (event.notification.data && event.notification.data.url)
    ? event.notification.data.url
    : self.registration.scope;

  event.waitUntil(
    self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then((clients) => {
      // If GenFocus is already open, focus that tab
      for (const client of clients) {
        if (client.url.startsWith(self.registration.scope) && 'focus' in client) {
          return client.focus();
        }
      }
      // Otherwise open a new tab
      if (self.clients.openWindow) {
        return self.clients.openWindow(targetUrl);
      }
    })
  );
});

// ── Background Sync (future-proofing) ────────────────────────────────────────

self.addEventListener('message', (event) => {
  if (event.data && event.data.type === 'SKIP_WAITING') {
    self.skipWaiting();
  }
});
