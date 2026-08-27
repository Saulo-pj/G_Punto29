const CACHE_VERSION = 'p29-v6';
const STATIC_CACHE = `${CACHE_VERSION}-static`;

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

self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  event.waitUntil(clients.matchAll({ type: 'window', includeUncontrolled: true }).then((clientList) => {
    const target = event.notification.data && event.notification.data.url;
    for (const client of clientList) {
      if ('focus' in client) return client.focus();
    }
    return clients.openWindow(target || '/arqueo');
  }));
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
  // Las vistas y APIs muestran información operativa (arqueos, historial,
  // inventario). Nunca deben responder con una copia vieja del navegador.
  event.respondWith(fetch(request));
});
