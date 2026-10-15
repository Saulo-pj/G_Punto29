const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const { performance } = require('node:perf_hooks');
let handler;
const acknowledgments = [], writes = [];
const counter = { textContent: '0', dataset: {} };
const detail = { value: '1' };
const row = { hidden: true, dataset: { viewDetail: '1' }, querySelector: () => ({ textContent: 'kg | pedido: 0' }) };
const sendButton = { disabled: true, dataset: {} };
const form = {
  method: 'POST', dataset: {}, parentElement: { querySelector: () => null },
  classList: { contains: name => name === 'qty-counter-form' },
  getAttribute: name => name === 'method' ? 'POST' : '/checklist',
  querySelector: selector => selector === '.qty-value-btn' ? counter : selector === '[name="id_detalle"]' ? detail : null,
  querySelectorAll: () => { throw new Error('Local quantity taps must not disable the controls'); },
  addEventListener: (name, callback) => { handler = callback; },
};
const context = vm.createContext({
  document: {
    addEventListener() {},
    querySelectorAll: selector => selector === '[data-view-detail]' ? [row] : [form],
    querySelector: selector => selector === '.send-wrap button' ? sendButton : null,
  },
  window: { location: { href: '/checklist' }, LocalFirst: { save: (url, init) => {
    writes.push([init.body.get('cantidad_pedida'), init.body.get('expected_qty')]);
    return new Promise(resolve => acknowledgments.push(resolve));
  } } },
  FormData: class { constructor() { this.fields = new Map(); } get(k) { return this.fields.get(k); } set(k,v) { this.fields.set(k,v); } },
});
vm.runInContext(fs.readFileSync('static/js/checklist.js','utf8'),context);
vm.runInContext('bindChecklistAsyncForms()',context);
(async () => {
  const event = () => ({ preventDefault() {}, submitter: { name: 'action', value: 'qty_plus' } });
  const start=performance.now();
  const first=handler(event());
  const second=handler(event());
  const duration=performance.now()-start;
  assert.equal(counter.textContent,'2','Both taps must paint before any save resolves');
  assert.equal(row.hidden,false);
  assert.equal(sendButton.disabled,false);
  assert.deepEqual(writes,[['1','0'],['2','1']]);
  acknowledgments.forEach(resolve => resolve({ queued: true }));
  await Promise.all([first,second]);
  console.log(`Checklist: two optimistic taps in ${duration.toFixed(2)} ms, without waiting for storage/server acknowledgments.`);
})().catch(error => { console.error(error); process.exitCode=1; });
