/* Durable, user-scoped outbox. Never claim a queued write is server-confirmed. */
(() => {
  'use strict';
  const nativeFetch = window.fetch.bind(window);
  const owner = window.CURRENT_USER;
  const operationalPaths = new Set(['/pedidos', '/checklist', '/arqueo']);
  const channel = 'BroadcastChannel' in window ? new BroadcastChannel('p29-sync') : null;
  let database, running = false, pending = 0, blocked = false, dirty = false;
  const ready = new Promise((resolve, reject) => {
    const request = indexedDB.open('p29-local-v1', 1);
    request.onupgradeneeded = () => request.result.createObjectStore('outbox', { keyPath: 'id' });
    request.onsuccess = () => { database = request.result; resolve(); };
    request.onerror = () => reject(request.error);
  });
  // Surface storage failures only when a user attempts to save.
  ready.catch(() => {});
  async function store(mode, work) {
    await ready;
    return new Promise((resolve, reject) => {
      const tx = database.transaction('outbox', mode);
      const result = work(tx.objectStore('outbox'));
      tx.oncomplete = () => resolve(result.result);
      tx.onerror = () => reject(tx.error);
      tx.onabort = () => reject(tx.error);
    });
  }
  async function rows() {
    return (await store('readonly', s => s.getAll())).filter(r => r.owner === owner).sort((a,b) => a.created - b.created);
  }
  function toast(text) {
    const region = document.getElementById('toast-region');
    if (!region) return;
    const item = document.createElement('div');
    item.className = 'app-toast'; item.textContent = text; region.append(item);
    setTimeout(() => item.remove(), 5000);
  }
  async function status() {
    pending = (await rows()).length;
    const el = document.getElementById('sync-status');
    if (el) {
      el.replaceChildren();
      const label = document.createElement('span');
      label.textContent = blocked ? 'Sincronización detenida · revisa los cambios ' : pending ? `${pending} cambio(s) pendiente(s)${navigator.onLine ? '' : ' · sin conexión'} ` : navigator.onLine ? '' : 'Sin conexión · guardado local';
      el.append(label);
      if (pending) { const review = document.createElement('button'); review.textContent = 'Revisar'; review.onclick = reviewPending; el.append(review); }
    }
  }
  async function reviewPending() {
    const dialog = document.createElement('dialog');
    const title = document.createElement('h2'); title.textContent = 'Cambios pendientes'; dialog.append(title);
    for (const row of await rows()) {
      const line = document.createElement('p');
      line.textContent = `${row.date} · ${new URL(row.url).pathname} · ${row.json ? 'Arqueo' : new Map(row.body).get('action')} `;
      const discard = document.createElement('button'); discard.textContent = 'Descartar cambio local';
      discard.onclick = async () => {
        if (running) return;
        if (!confirm('¿Descartar este cambio local? Los datos confirmados en el servidor se conservan.')) return;
        await store('readwrite', s => s.delete(row.id)); line.remove(); await status();
      };
      line.append(discard); dialog.append(line);
    }
    const retry = document.createElement('button'); retry.textContent = 'Reintentar sincronización';
    retry.onclick = () => { blocked = false; dialog.close(); void drain(); };
    const close = document.createElement('button'); close.textContent = 'Cerrar'; close.onclick = () => dialog.close();
    dialog.append(retry, close); document.body.append(dialog); dialog.addEventListener('close', () => dialog.remove()); dialog.showModal();
  }
  async function freshToken() {
    const response = await nativeFetch('/api/session/csrf', { credentials: 'same-origin', cache: 'no-store' });
    if (!response.ok || response.redirected) throw new Error('Inicia sesión para sincronizar los cambios.');
    const data = await response.json();
    if (data.user !== owner) throw new Error('Los cambios pertenecen a otro usuario.');
    window.CSRF_TOKEN = data.token;
    document.querySelectorAll('[name="csrf_token"]').forEach(el => { el.value = data.token; });
    return data.token;
  }
  async function replay(row) {
    const token = await freshToken();
    const headers = { 'X-CSRFToken': token, 'X-Requested-With': 'XMLHttpRequest', 'X-Operation-ID': row.id, 'X-Operation-Date': row.date };
    let body;
    if (row.json) { headers['Content-Type'] = 'application/json'; body = row.body; }
    else { body = new FormData(); row.body.forEach(([k,v]) => body.append(k,v)); body.set('csrf_token', token); }
    const response = await nativeFetch(row.url, { method: 'POST', headers, body, credentials: 'same-origin' });
    if (response.redirected || !response.ok || (!row.json && response.status !== 204)) {
      let message = 'No se pudo confirmar el guardado. Revisa los cambios pendientes.';
      try { const data = await response.json(); message = data.message || message; } catch (_) {}
      const error = new Error(message); error.response = response.status < 500; throw error;
    }
    if (row.json) { const data = await response.clone().json(); if (data.ok === false) { const error = new Error(data.message); error.response = true; throw error; } }
    return response;
  }
  async function drain() {
    if (running || !navigator.onLine || blocked) return;
    running = true;
    let count = 0;
    try {
      const work = async () => {
        for (const row of await rows()) {
          if (!navigator.onLine) break;
          try { await replay(row); }
          catch (error) { if (error.response) { blocked = true; toast(error.message); } break; }
          await store('readwrite', s => s.delete(row.id)); count++;
        }
      };
      if (navigator.locks) await navigator.locks.request('p29-outbox', work); else await work();
      if (count) { toast('Cambios sincronizados correctamente'); channel?.postMessage({ owner, type: 'synced' }); window.dispatchEvent(new CustomEvent('p29-synced')); }
    } finally { running = false; await status(); }
  }
  async function save(url, init) {
    const target = new URL(url, location.href);
    if (target.origin !== location.origin || !operationalPaths.has(target.pathname)) throw new Error('Ruta de guardado no válida.');
    const json = typeof init.body === 'string';
    const body = json ? init.body : [...init.body.entries()].filter(([k]) => k !== 'csrf_token');
    if (!json && body.some(([,v]) => typeof v !== 'string')) throw new Error('Las importaciones requieren conexión.');
    const row = { id: crypto.randomUUID(), owner, url: target.href, date: window.OPERATION_DATE, body, json, created: Date.now() };
    await store('readwrite', s => s.put(row));
    await status();
    // Resolve immediately after durable local storage; the server is asynchronous.
    toast('Guardado en este dispositivo · pendiente de sincronización');
    void drain();
    return { queued: true, ok: true, status: 202 };
  }
  async function flush() {
    const until = Date.now() + 15000;
    while (running && Date.now() < until) await new Promise(resolve => setTimeout(resolve, 100));
    await drain();
    if ((await rows()).length) throw new Error('Sincroniza los cambios pendientes antes de imprimir.');
  }
  window.LocalFirst = { save, drain, rows, toast, status, flush, refreshToken: freshToken, retry: () => { blocked = false; return drain(); } };
  // Ordinary uploads refresh the session token and retry only an explicit CSRF rejection.
  window.fetch = async (url, init = {}) => {
    const target = new URL(typeof url === 'string' ? url : url.url, location.href);
    const method = (init.method || (url instanceof Request ? url.method : 'GET')).toUpperCase();
    if (target.origin === location.origin && target.pathname === '/arqueo' && method === 'POST' && typeof init.body === 'string') return save(target.href, init);
    if (target.origin !== location.origin || !['POST','PUT','PATCH','DELETE'].includes(method)) return nativeFetch(url, init);
    const headers = new Headers(init.headers || {});
    headers.set('X-CSRFToken', window.CSRF_TOKEN);
    const response = await nativeFetch(url, { ...init, headers });
    if (response.status === 403) {
      let data; try { data = await response.clone().json(); } catch (_) {}
      if (data?.error === 'csrf_error') { headers.set('X-CSRFToken', await freshToken()); return nativeFetch(url, { ...init, headers }); }
    }
    return response;
  };
  document.addEventListener('submit', event => {
    const form = event.target;
    if (form.method?.toUpperCase() === 'POST') {
      let field = form.querySelector('[name="csrf_token"]');
      if (!field) { field = document.createElement('input'); field.type = 'hidden'; field.name = 'csrf_token'; form.append(field); }
      field.value = window.CSRF_TOKEN;
    }
  }, true);
  window.addEventListener('online', () => { blocked = false; void drain(); });
  window.addEventListener('offline', () => { void status(); });
  setInterval(() => { if (pending && navigator.onLine && !blocked) void drain(); }, 15000);
  channel?.addEventListener('message', event => { if (event.data.owner === owner) { void status(); toast('Datos actualizados en otra pestaña'); } });
  document.addEventListener('DOMContentLoaded', async () => {
    window.addEventListener('p29-synced', async () => {
      if (!(await rows()).length && document.querySelector('.send-wrap button:disabled,.pedidos-send-form button:disabled')) location.reload();
    });
    if ('serviceWorker' in navigator) {
      const identify = () => navigator.serviceWorker.controller?.postMessage({ type: 'OWNER', owner });
      identify(); navigator.serviceWorker.addEventListener('controllerchange', identify);
      navigator.serviceWorker.ready.then(registration => registration.active?.postMessage({ type: 'OWNER', owner }));
    }
    await status();
    // Restore queued quantities/dispatch after reload, before sending new changes.
    for (const row of await rows()) {
      if (row.date !== window.OPERATION_DATE) continue;
      if (row.json) {
        window.dispatchEvent(new CustomEvent('p29-restore-arqueo', { detail: row }));
        continue;
      }
      const data = new Map(row.body);
      const id = data.get('id_detalle');
      if (!id) continue;
      document.querySelectorAll(`input[name="id_detalle"]`).forEach(input => {
        if (input.value !== id) return;
        const form = input.form;
        if (data.get('action') === 'qty_set') {
          const qty = Number(data.get('cantidad_pedida'));
          if (form.classList.contains('qty-counter-form') && typeof updateQtyVisualInCounterForm === 'function') updateQtyVisualInCounterForm(form, qty);
          const field = form.querySelector('[name="cantidad_pedida"]'); if (field) field.value = qty;
        }
        if (data.get('action') === 'save_dispatch_line') {
          const check = form.querySelector('[name="enviar_linea"]'); if (check) check.checked = data.has('enviar_linea');
          const qty = form.querySelector('[name="cantidad_entregada"]'); if (qty) qty.value = data.get('cantidad_entregada');
          if (typeof applyLineOptimisticState === 'function') applyLineOptimisticState(form);
        }
      });
    }
    void drain();
    document.querySelectorAll('.pedidos-detail-actions').forEach(form => form.addEventListener('submit', async event => {
      event.preventDefault();
      // Open immediately to keep the browser's popup permission tied to the click.
      const preview = window.open('about:blank', '_blank');
      try {
        await flush();
        const target = new URL(form.action, location.href);
        target.searchParams.set('formato', form.elements.formato.value);
        document.querySelectorAll('.pedido-line-form').forEach(line => {
          if (line.querySelector('.pedidos-line-check')?.checked) target.searchParams.append('selected', line.elements.id_detalle.value);
        });
        if (preview) preview.location.href = target.href; else location.href = target.href;
      } catch (error) { preview?.close(); toast(error.message); }
    }));
    const draftKey = `p29-draft:${owner}:${window.OPERATION_DATE}:${location.pathname}${location.search}`;
    if (location.pathname === '/arqueo') {
      let draft = {};
      try { draft = JSON.parse(localStorage.getItem(draftKey) || '{}'); } catch (_) {}
      document.querySelectorAll('.cierre-caja-form input[name],.cierre-caja-form select[name]').forEach((input, index) => {
        if (input.type === 'hidden' || input.disabled) return;
        const key = `${input.name}:${index}`;
        if (key in draft) { input.value = draft[key]; input.dispatchEvent(new Event('input', { bubbles: true })); }
        input.addEventListener('input', () => {
          draft[key] = input.value; dirty = true;
          try { localStorage.setItem(draftKey, JSON.stringify(draft)); } catch (_) { toast('No hay espacio para guardar el borrador local.'); }
        });
      });
      window.addEventListener('p29-synced', () => { localStorage.removeItem(draftKey); dirty = false; if (!document.activeElement?.matches('input,select,textarea')) location.reload(); });
    }
    let stream;
    function connectEvents() {
      if (!('EventSource' in window) || !navigator.onLine || stream) return;
      stream = new EventSource('/api/events');
      stream.onmessage = async event => {
        const data = JSON.parse(event.data);
        if ((await rows()).length) return;
        const active = location.pathname.split('/')[1];
        if (data.module === active || data.module === 'ajustes') {
          const editing = document.activeElement?.matches('input,select,textarea');
          if (!editing && !dirty) location.reload(); else toast('Hay cambios nuevos. Se mostrarán al recargar.');
        }
      };
    }
    connectEvents();
    window.addEventListener('online', connectEvents);
  });
})();
