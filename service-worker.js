/* eslint-disable no-restricted-globals */
(() => {
  const VERSION = 'pet-photos-v1';
  const CORE_ASSETS = [
    '/',
    '/index.html',
    '/pet-photos-app.html',
    '/assets/css/style.css',
    '/assets/js/main.js',
    '/assets/js/pet-photos-app.js',
    '/manifest.webmanifest',
    '/assets/images/favicon.svg',
    '/assets/images/logo.svg'
  ];

  self.addEventListener('install', (event) => {
    event.waitUntil(
      caches
        .open(VERSION)
        .then((cache) => cache.addAll(CORE_ASSETS))
        .then(() => self.skipWaiting())
    );
  });

  self.addEventListener('activate', (event) => {
    event.waitUntil(
      Promise.all([
        caches.keys().then((keys) =>
          Promise.all(keys.filter((key) => key !== VERSION).map((key) => caches.delete(key)))
        ),
        self.clients.claim()
      ])
    );
  });

  const isNavigationalRequest = (request) =>
    request.mode === 'navigate' ||
    (request.headers.get('accept') || '').includes('text/html');

  self.addEventListener('fetch', (event) => {
    const { request } = event;
    if (request.method !== 'GET') return;

    // For same-origin requests, try cache-first for static assets.
    const url = new URL(request.url);
    const isSameOrigin = url.origin === self.location.origin;

    // Don't cache API responses or uploaded images (can be large / dynamic).
    if (isSameOrigin && (url.pathname.startsWith('/api/') || url.pathname.startsWith('/uploads/'))) {
      event.respondWith(fetch(request));
      return;
    }

    if (isSameOrigin && !isNavigationalRequest(request)) {
      event.respondWith(
        caches.match(request).then((cached) => {
          if (cached) return cached;
          return fetch(request)
            .then((response) => {
              const copy = response.clone();
              caches.open(VERSION).then((cache) => cache.put(request, copy)).catch(() => {});
              return response;
            })
            .catch(() => cached);
        })
      );
      return;
    }

    // For navigations: network-first, fallback to cached app shell.
    if (isNavigationalRequest(request)) {
      event.respondWith(
        fetch(request)
          .then((response) => {
            const copy = response.clone();
            caches.open(VERSION).then((cache) => cache.put(request, copy)).catch(() => {});
            return response;
          })
          .catch(() => caches.match(request).then((cached) => cached || caches.match('/pet-photos-app.html')))
      );
    }
  });
})();

