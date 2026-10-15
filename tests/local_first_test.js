const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const { randomUUID } = require('node:crypto');

const records = new Map(), applied = new Set();
let changes = 0, loseAcknowledgment = false, conflict = false;
const database = {
  transaction() {
    const tx = { objectStore: () => ({
      getAll: () => ({ result: structuredClone([...records.values()]) }),
      put: row => { records.set(row.id, structuredClone(row)); return {}; },
      delete: id => { records.delete(id); return {}; },
    }) };
    queueMicrotask(() => tx.oncomplete?.());
    return tx;
  },
};
function browser(owner) {
  const navigator = { onLine: false };
  const document = { getElementById: () => null, querySelectorAll: () => [], addEventListener() {} };
  const window = { CURRENT_USER: owner, OPERATION_DATE: '2026-10-15', CSRF_TOKEN: 'old',
    addEventListener() {}, dispatchEvent() {},
    fetch: async (url, init) => {
      if (url === '/api/session/csrf') return { ok: true, redirected: false, json: async () => ({ token: 'fresh', user: owner }) };
      if (conflict) return new Response(JSON.stringify({ message: 'Conflicto' }), { status: 409 });
      assert.equal(init.headers['X-CSRFToken'], 'fresh');
      assert.equal(init.headers['X-Operation-Date'], '2026-10-15');
      const id = init.headers['X-Operation-ID'];
      if (!applied.has(id)) { applied.add(id); changes++; }
      if (loseAcknowledgment) { loseAcknowledgment = false; throw new TypeError('Connection lost after commit'); }
      return new Response(null, { status: 204 });
    },
  };
  const context = vm.createContext({ window, document, navigator, URL, Headers, Request, Response, FormData,
    crypto: { randomUUID }, location: { href: 'https://example.test/checklist', origin: 'https://example.test' },
    indexedDB: { open: () => { const request = { result: database }; queueMicrotask(() => request.onsuccess()); return request; } },
    setTimeout, setInterval() {}, CustomEvent: class {}, console });
  vm.runInContext(fs.readFileSync('static/js/local-first.js', 'utf8'), context);
  return { local: window.LocalFirst, navigator };
}
function quantity(value) { const form = new FormData(); form.set('action','qty_set'); form.set('cantidad_pedida',value); return form; }

(async () => {
  const first = browser('chef');
  const result = await first.local.save('/checklist', { body: quantity('3') });
  assert.equal(result.queued, true);
  assert.equal(changes, 0);
  assert.equal((await first.local.rows()).length, 1);
  const other = browser('other-user');
  assert.equal((await other.local.rows()).length, 0, 'User isolation');
  const reopened = browser('chef');
  assert.equal((await reopened.local.rows()).length, 1, 'Survives page reload');
  reopened.navigator.onLine = true;
  loseAcknowledgment = true;
  await reopened.local.drain();
  assert.equal(changes, 1);
  assert.equal((await reopened.local.rows()).length, 1, 'Lost acknowledgment stays queued');
  await reopened.local.drain();
  assert.equal(changes, 1, 'Replay carries the same operation ID');
  assert.equal((await reopened.local.rows()).length, 0);
  reopened.navigator.onLine = false;
  await reopened.local.save('/checklist', { body: quantity('5') });
  conflict = true; reopened.navigator.onLine = true;
  await reopened.local.drain();
  assert.equal((await reopened.local.rows()).length, 1, 'Conflicting changes stay reviewable');
  assert.equal(changes, 1);
  console.log('Local-first: persistence, user isolation, reconnection, lost acknowledgments and conflicts passed.');
})().catch(error => { console.error(error); process.exitCode = 1; });
