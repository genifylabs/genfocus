/**
 * GenFocus Service Worker v3
 * - Network-first for all JS/HTML app shell files (ensures code changes always take effect)
 * - Cache-first only for static assets (CSS, fonts, images)
 * - Handles push notification events
 */

const CACHE_NAME = 'genfocus-v4';

// Assets to pre-cache on install
const PRECACHE_URLS = [
  './',
  './index.html',
  './style.css',
  './app.js',
  './manifest.json',
  './firebase.js',
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
    }).then(() => self.skipWaiting()) // Take over immediately
  );
});

// ── Activate: clean up ALL old caches immediately ────────────────────────────

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((cacheNames) => {
      return Promise.all(
        cacheNames
          .filter((name) => name !== CACHE_NAME)
          .map((name) => {
            console.log('[SW] Deleting old cache:', name);
            return caches.delete(name);
          })
      );
    }).then(() => self.clients.claim()) // Claim all open tabs immediately
  );
});

// ── Fetch: Network-first for JS/HTML, cache-first for CSS/fonts ──────────────

self.addEventListener('fetch', (event) => {
  const { request } = event;
  const url = new URL(request.url);

  // Skip non-same-origin requests (Firebase SDK CDN, Google Fonts, etc.)
  if (url.origin !== self.location.origin) return;

  const isScript = request.destination === 'script' || url.pathname.endsWith('.js');
  const isDocument = request.destination === 'document' || url.pathname.endsWith('.html') || url.pathname === '/';

  if (isScript || isDocument) {
    // Network-first for JS and HTML: always get the freshest version
    event.respondWith(
      fetch(request).then((networkResponse) => {
        if (networkResponse && networkResponse.status === 200) {
          const responseClone = networkResponse.clone();
          caches.open(CACHE_NAME).then((cache) => cache.put(request, responseClone));
        }
        return networkResponse;
      }).catch(() => {
        // Offline fallback: serve from cache if network fails
        return caches.match(request);
      })
    );
  } else {
    // Cache-first for CSS, images, fonts
    event.respondWith(
      caches.match(request).then((cachedResponse) => {
        if (cachedResponse) return cachedResponse;
        return fetch(request).then((networkResponse) => {
          if (!networkResponse || networkResponse.status !== 200) return networkResponse;
          const responseClone = networkResponse.clone();
          caches.open(CACHE_NAME).then((cache) => cache.put(request, responseClone));
          return networkResponse;
        });
      })
    );
  }
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
    icon: './manifest.json',
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
      for (const client of clients) {
        if (client.url.startsWith(self.registration.scope) && 'focus' in client) {
          return client.focus();
        }
      }
      if (self.clients.openWindow) {
        return self.clients.openWindow(targetUrl);
      }
    })
  );
});

self.addEventListener('message', (event) => {
  if (event.data && event.data.type === 'SKIP_WAITING') {
    self.skipWaiting();
  }
});
