const CACHE_VERSION = 'p29-v2';
const STATIC_CACHE = `${CACHE_VERSION}-static`;
const PAGE_CACHE = `${CACHE_VERSION}-pages`;

const CORE_ASSETS = [
  '/',
  '/static/css/style.css',
  '/static/js/inventario.js',
  '/static/js/checklist.js',
  '/static/js/pedidos.js',
  '/static/img/icono.png',
  '/static/img/logo.png',
  '/manifest.webmanifest',
];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(STATIC_CACHE).then((cache) => cache.addAll(CORE_ASSETS))
  );
  self.skipWaiting();
});

self.addEventListener('message', (event) => {
  if (event.data && event.data.type === 'SKIP_WAITING') {
    self.skipWaiting();
  }
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(
        keys
          .filter((key) => !key.startsWith(CACHE_VERSION))
          .map((key) => caches.delete(key))
      )
    )
  );
  self.clients.claim();
});

self.addEventListener('fetch', (event) => {
  const { request } = event;
  if (request.method !== 'GET') {
    return;
  }

  const url = new URL(request.url);
  if (url.origin !== self.location.origin) {
    return;
  }

  const isNavigation = request.mode === 'navigate';

  if (isNavigation) {
    event.respondWith(
      fetch(request)
        .then((networkResponse) => {
          const clone = networkResponse.clone();
          caches.open(PAGE_CACHE).then((cache) => cache.put(request, clone));
          return networkResponse;
        })
        .catch(() => caches.match(request).then((cached) => cached || caches.match('/')))
    );
    return;
  }

  const isStaticAsset =
    url.pathname.endsWith('.js') ||
    url.pathname.endsWith('.css') ||
    url.pathname.endsWith('.webmanifest');

  if (isStaticAsset) {
    event.respondWith(
      fetch(request)
        .then((networkResponse) => {
          const copy = networkResponse.clone();
          caches.open(STATIC_CACHE).then((cache) => cache.put(request, copy));
          return networkResponse;
        })
        .catch(() => caches.match(request))
    );
    return;
  }

  event.respondWith(
    caches.match(request).then((cached) => {
      if (cached) {
        return cached;
      }

      return fetch(request).then((networkResponse) => {
        const copy = networkResponse.clone();
        caches.open(STATIC_CACHE).then((cache) => cache.put(request, copy));
        return networkResponse;
      });
    })
  );
});
