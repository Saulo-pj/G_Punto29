const VERSION = 'p29-v6';
const STATIC = `${VERSION}-static`;
const owners = new Map();
const CORE = ['/static/css/style.css', '/static/css/operational.css', '/static/js/local-first.js', '/static/js/inventario.js', '/static/js/checklist.js', '/static/js/pedidos.js', '/static/img/icono.png', '/static/img/logo.png'];
self.addEventListener('install', event => { event.waitUntil(caches.open(STATIC).then(cache => cache.addAll(CORE))); self.skipWaiting(); });
self.addEventListener('activate', event => { event.waitUntil(caches.keys().then(keys => Promise.all(keys.filter(key => !key.startsWith(VERSION)).map(key => caches.delete(key))))); self.clients.claim(); });
self.addEventListener('message', event => {
  if (event.data?.type === 'SKIP_WAITING') self.skipWaiting();
  if (event.data?.type === 'OWNER' && event.source?.id) {
    const owner = String(event.data.owner);
    owners.set(event.source.id, owner);
    const url = new URL(event.source.url);
    if (['/checklist','/pedidos','/arqueo'].includes(url.pathname)) event.waitUntil((async () => {
      try {
        const response = await fetch(url.href);
        if (response.ok && !response.redirected && response.headers.get('X-App-User') === owner) {
          const cache = await caches.open(`${VERSION}-user-${encodeURIComponent(owner)}`);
          await cache.put(url.href, response);
        }
      } catch (_) {}
    })());
  }
});
self.addEventListener('notificationclick', event => {
  event.notification.close();
  event.waitUntil(clients.matchAll({ type: 'window' }).then(list => list[0] ? list[0].focus() : clients.openWindow(event.notification.data?.url || '/arqueo')));
});
self.addEventListener('fetch', event => {
  const request = event.request, url = new URL(request.url);
  if (request.method !== 'GET' || url.origin !== self.location.origin || url.pathname.startsWith('/api/')) return;
  if (url.pathname === '/logout' || url.pathname === '/login') {
    event.respondWith((async () => {
      owners.clear();
      for (const key of await caches.keys()) if (key.startsWith(`${VERSION}-user-`)) await caches.delete(key);
      return fetch(request);
    })());
    return;
  }
  if (request.mode === 'navigate') {
    event.respondWith((async () => {
      let owner = owners.get(event.clientId);
      try {
        const response = await fetch(request);
        const authenticated = response.headers.get('X-App-User');
        if (response.ok && !response.redirected && authenticated && ['/checklist','/pedidos','/arqueo'].includes(url.pathname)) {
          owner = authenticated;
          owners.set(event.resultingClientId || event.clientId, owner);
          const cache = await caches.open(`${VERSION}-user-${encodeURIComponent(owner)}`);
          await cache.put(request, response.clone());
        }
        return response;
      } catch (_) {
        if (owner) {
          const cache = await caches.open(`${VERSION}-user-${encodeURIComponent(owner)}`);
          const page = await cache.match(request);
          if (page) return page;
        }
        return new Response('<html lang="es"><meta name="viewport" content="width=device-width"><h1>Sin conexión</h1><p>Abre esta página con conexión una vez para usarla sin internet.</p></html>', { status: 503, headers: { 'Content-Type': 'text/html; charset=utf-8' } });
      }
    })());
    return;
  }
  if (url.pathname.startsWith('/static/')) event.respondWith((async () => {
    const cache = await caches.open(STATIC);
    try { const response = await fetch(request); if (response.ok) await cache.put(request, response.clone()); return response; }
    catch (_) { return (await cache.match(request)) || Response.error(); }
  })());
});
