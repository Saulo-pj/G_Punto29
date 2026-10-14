const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

async function checkResponse(response, shouldFail) {
    let submissions = 0;
    let handler;
    let message;
    const form = {
        method: 'POST',
        dataset: {},
        classList: { contains: () => false },
        parentElement: { querySelector: () => null },
        getAttribute: name => name === 'method' ? 'POST' : '/checklist',
        querySelectorAll: () => [],
        addEventListener: (name, fn) => { handler = fn; },
        insertAdjacentElement: (where, element) => { message = element; },
        requestSubmit: () => { throw new Error('Must not replay a failed POST'); },
        submit: () => { throw new Error('Must not replay a failed POST'); },
    };
    const context = vm.createContext({
        document: {
            addEventListener: () => {},
            querySelectorAll: () => [form],
            createElement: () => ({ setAttribute: () => {} }),
        },
        window: { location: { href: '/checklist' } },
        FormData: class {
            set() {}
        },
        fetch: async () => { submissions++; return response; },
    });
    vm.runInContext(fs.readFileSync(path.join(__dirname, '../static/js/checklist.js'), 'utf8'), context);
    vm.runInContext('bindChecklistAsyncForms()', context);
    await handler({ preventDefault() {}, submitter: { name: 'action', value: 'qty_plus' } });
    assert.equal(submissions, 1);
    assert.equal(Boolean(message), shouldFail);
    if (shouldFail) assert.match(message.textContent, /No se pudo confirmar/);
}

(async () => {
    await checkResponse({ ok: false, status: 500, redirected: false }, true);
    await checkResponse({ ok: true, status: 200, redirected: true }, true);
    await checkResponse({ ok: true, status: 200, redirected: false }, true);
    await checkResponse({ ok: true, status: 204, redirected: false }, false);
    console.log('Checklist: failed saves are reported without replay; only 204 confirms success.');
})().catch(error => { console.error(error); process.exitCode = 1; });
