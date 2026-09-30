import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import { readFile } from 'node:fs/promises';
import { webcrypto } from 'node:crypto';

const source = await readFile(new URL('./finance-adapter.js', import.meta.url), 'utf8');
const KEY = 'mezip.finance.center.v2';
const json = (body, status = 200) => new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });
function environment(fetcher, options = {}) {
  let editing = false;
  const elements = [];
  const element = () => {
    const children = new Map();
    const node = { dataset: {}, setAttribute() {}, append() {}, prepend() {}, replaceChildren() {}, contains() { return false; }, querySelector(selector) { if (!children.has(selector)) children.set(selector, element()); return children.get(selector); } };
    elements.push(node); return node;
  };
  const native = new Map([['unrelated', 'kept']]);
  const listeners = new Map();
  const documentListeners = new Map(); const intervals = []; let reloads = 0;
  const location = { origin: 'https://pulse.example', href: 'https://pulse.example/local-apps/finance-receipt-inbox-v12/index.html', reload() { reloads++; } };
  const window = {
    location, fetch: fetcher, localStorage: { getItem: key => native.get(key) ?? null, setItem: (key, value) => native.set(key, value), removeItem: key => native.delete(key) },
    addEventListener(name, callback) { if (!listeners.has(name)) listeners.set(name, []); listeners.get(name).push(callback); },
    dispatchEvent(event) { for (const listener of listeners.get(event.type) || []) listener(event); }, setInterval(callback) { intervals.push(callback); return intervals.length; },
  };
  window.top = options.top || window;
  if (options.legacyStore) window.__pulseFinanceStoreV1 = options.legacyStore;
  const document = { body: element(), head: element(), createElement: element, querySelector: selector => selector.startsWith('dialog[open]') ? editing ? element() : null : element(), querySelectorAll: () => [], addEventListener(name, callback) { if (!documentListeners.has(name)) documentListeners.set(name, []); documentListeners.get(name).push(callback); } };
  const sandbox = { window, document, location, URL, Headers, Request, Response, Event, crypto: webcrypto, queueMicrotask, confirm: options.confirm || (() => false), setTimeout: callback => setImmediate(callback), clearTimeout };
  vm.runInNewContext(source, sandbox);
  return {
    store: window.__pulseFinanceStoreV1, window, native, setEditing: value => { editing = value; },
    elements, document, get timers() { return intervals.length; }, rerun() { vm.runInNewContext(source, sandbox); },
    get reloads() { return reloads; },
    async tick() { for (const callback of intervals) callback(); await window.__pulseFinanceStoreV1.refreshing; },
    dispatch(name, target) {
      const event = { target, prevented: false, stopped: false, preventDefault() { this.prevented = true; }, stopImmediatePropagation() { this.stopped = true; } };
      for (const callback of documentListeners.get(name) || []) { callback(event); if (event.stopped) break; }
      return event;
    },
  };
}

test('hydrates before business scripts and serializes all ledger revisions', async () => {
  const writes = []; let revision = 7; let release;
  const held = new Promise(resolve => { release = resolve; });
  const env = environment(async (url, init = {}) => {
    if (init.method !== 'PUT') return json({ initialized: true, revision, data: '{"transactions":[]}' });
    const body = JSON.parse(init.body); writes.push({ ...body, id: init.headers['X-Pulse-Operation-Id'] });
    if (writes.length === 1) await held;
    assert.equal(body.revision, revision); revision++;
    return json({ initialized: true, revision });
  });
  await env.store.ready;
  assert.equal(env.window.localStorage.getItem(KEY), '{"transactions":[]}');
  env.window.localStorage.setItem(KEY, '{"transactions":[{"id":"first"}]}');
  env.window.localStorage.setItem(KEY, '{"transactions":[{"id":"first"},{"id":"second"}]}');
  assert.equal(writes.length, 1); assert.equal(env.store.phase, 'saving');
  release(); await env.store.flush();
  assert.deepEqual(writes.map(item => item.revision), [7, 8]);
  assert.notEqual(writes[0].id, writes[1].id);
  assert.equal(env.store.phase, 'ready'); assert.equal(env.store.revision, 9);
  assert.equal(env.native.has(KEY), false); assert.equal(env.native.get('unrelated'), 'kept');
});

test('a revision conflict pauses edits without a browser fallback or silent overwrite', async () => {
  const env = environment(async (url, init = {}) => init.method === 'PUT' ? json({ error: '另一个页面已经更新账本' }, 409) : json({ initialized: true, revision: 2, data: '{"transactions":[]}' }));
  await env.store.ready;
  env.window.localStorage.setItem(KEY, '{"transactions":[{"id":"unsaved"}]}');
  await assert.rejects(env.store.flush(), /另一个页面/);
  assert.equal(env.store.phase, 'blocked'); assert.equal(env.store.conflict, true);
  assert.equal(env.store.queue.length, 1);
  assert.throws(() => env.window.localStorage.setItem(KEY, '{"transactions":[]}'), /尚未连接/);
  assert.equal(env.native.has(KEY), false);
});

test('uninitialized storage never silently creates an empty ledger', async () => {
  let writes = 0;
  const env = environment(async (url, init = {}) => { if (init.method === 'PUT') writes++; return json({ initialized: false, revision: 0, data: null }); });
  await env.store.ready; await new Promise(resolve => setImmediate(resolve));
  assert.equal(env.store.phase, 'uninitialized'); assert.equal(writes, 0);
  assert.throws(() => env.window.localStorage.setItem(KEY, '{"transactions":[]}'), /尚未连接/);
  assert.equal(env.window.localStorage.getItem('mezip.finance.center.v1'), null);
});

test('long receipt imports poll one receipt and do not replay the write', async () => {
  const calls = [];
  const env = environment(async (url, init = {}) => {
    calls.push({ url, method: init.method || 'GET' });
    if (url.endsWith('/storage/finance')) return json({ initialized: true, revision: 1, data: '{"transactions":[]}' });
    if (url.includes('/operations/')) return json({ state: 'done', status: 201, body: { records: [{ id: 'test-receipt' }] } });
    assert.ok(init.headers.get('X-Pulse-Operation-Id'));
    return json({ relayPending: true }, 202);
  });
  await env.store.ready;
  const response = await env.window.fetch('http://127.0.0.1:4325/v1/finance/mobile/desktop-import', { method: 'POST', body: '{}' });
  assert.equal(response.status, 201); assert.equal((await response.json()).records[0].id, 'test-receipt');
  assert.equal(calls.filter(call => call.method === 'POST').length, 1);
  assert.equal(calls.filter(call => call.url.includes('/operations/')).length, 1);
});

test('generating a phone invitation is always a deduplicated write', async () => {
  let seen;
  const env = environment(async (url, init = {}) => {
    if (url.endsWith('/storage/finance')) return json({ initialized: true, revision: 1, data: '{"transactions":[]}' });
    seen = { url, init }; return json({ status: 'READY' });
  });
  await env.store.ready;
  await env.window.fetch('/api/local-apps/finance/v1/finance/mobile/invite?version=v2&permanent=1');
  assert.equal(seen.init.method, 'POST'); assert.ok(seen.init.headers.get('X-Pulse-Operation-Id'));
  assert.ok(seen.url.endsWith('?version=v2&permanent=1'));
});

test('private viewing starts with visible amounts without rewriting stored privacy', async () => {
  const ledger = JSON.stringify({ transactions: [{ id: 'history', amountCents: 2500 }], privacy: { hideAmounts: true } });
  let writes = 0;
  const env = environment(async (url, init = {}) => { if (init.method === 'PUT') writes++; return json({ initialized: true, revision: 1, data: ledger }); });
  await env.store.ready;
  assert.equal(env.window.PulseFinance.amountsHidden, false);
  env.window.PulseFinance.setAmountsHidden(true);
  assert.equal(env.window.PulseFinance.amountsHidden, true);
  env.window.PulseFinance.setAmountsHidden(false);
  assert.equal(env.window.localStorage.getItem(KEY), ledger);
  assert.equal(JSON.parse(env.store.data).privacy.hideAmounts, true);
  assert.equal(writes, 0);
});

test('unchanged polling is quiet and an open nested view protects details', async () => {
  let reads = 0; let events = 0;
  const env = environment(async () => { reads++; return json({ initialized: true, revision: 1, data: '{"transactions":[]}' }); });
  await env.store.ready; await new Promise(resolve => setImmediate(resolve));
  env.window.addEventListener('pulse-finance-data', () => events++);
  await env.store.refresh();
  assert.equal(reads, 2); assert.equal(events, 0);
  const nestedView = { editing: () => true };
  env.store.views.add(nestedView);
  await env.store.refresh();
  assert.equal(reads, 2); assert.equal(events, 0);
  env.store.views.delete(nestedView);
});

test('a poll finishing after a detail opens cannot change its ledger', async () => {
  let reads = 0; let release;
  const held = new Promise(resolve => { release = resolve; });
  const env = environment(async () => {
    if (++reads === 1) return json({ initialized: true, revision: 1, data: '{"transactions":[]}' });
    await held; return json({ initialized: true, revision: 2, data: '{"transactions":[{"id":"remote"}]}' });
  });
  await env.store.ready;
  const refreshing = env.store.refresh();
  env.setEditing(true); release(); await refreshing;
  assert.equal(env.store.revision, 1);
  assert.equal(env.store.data, '{"transactions":[]}');
  env.setEditing(false); await env.store.refresh();
  assert.equal(env.store.revision, 2);
});

test('an in-flight read cannot overwrite a more recent successful local save', async () => {
  let reads = 0; let release;
  const held = new Promise(resolve => { release = resolve; });
  const env = environment(async (url, init = {}) => {
    if (init.method === 'PUT') return json({ initialized: true, revision: 3 });
    if (++reads === 1) return json({ initialized: true, revision: 1, data: '{"transactions":[]}' });
    await held; return json({ initialized: true, revision: 2, data: '{"transactions":[{"id":"old-remote"}]}' });
  });
  await env.store.ready;
  const refreshing = env.store.refresh();
  env.window.localStorage.setItem(KEY, '{"transactions":[{"id":"new-local"}]}');
  await env.store.flush(); release(); await refreshing;
  assert.equal(env.store.revision, 3);
  assert.equal(JSON.parse(env.store.data).transactions[0].id, 'new-local');
});

test('a transient read failure preserves a read-only ledger instead of an empty one', async () => {
  let reads = 0;
  const env = environment(async () => ++reads === 1 ? json({ initialized: true, revision: 1, data: '{"transactions":[{"id":"kept"}]}' }) : json({ error: 'offline' }, 503));
  await env.store.ready; await env.store.refresh();
  assert.equal(env.store.phase, 'offline');
  assert.equal(JSON.parse(env.store.data).transactions[0].id, 'kept');
  assert.throws(() => env.window.localStorage.setItem(KEY, '{"transactions":[]}'), /尚未连接/);
  await assert.rejects(env.store.flush());
});

test('a stale refresh failure cannot block a newer successful save', async () => {
  let reads = 0; let release;
  const held = new Promise(resolve => { release = resolve; });
  const env = environment(async (url, init = {}) => {
    if (init.method === 'PUT') return json({ initialized: true, revision: 2 });
    if (++reads === 1) return json({ initialized: true, revision: 1, data: '{"transactions":[]}' });
    await held; throw new Error('old request disconnected');
  });
  await env.store.ready;
  const refreshing = env.store.refresh();
  env.window.localStorage.setItem(KEY, '{"transactions":[{"id":"saved"}]}');
  await env.store.flush(); release(); await refreshing;
  assert.equal(env.store.phase, 'ready');
  assert.equal(env.store.message, '');
  assert.equal(env.store.revision, 2);
  assert.equal(JSON.parse(env.store.data).transactions[0].id, 'saved');
  assert.equal(env.store.refreshing, null);
});

test('a refresh failure arriving after a detail opens does not lock that view', async () => {
  let reads = 0; let release;
  const held = new Promise(resolve => { release = resolve; });
  const env = environment(async () => {
    if (++reads === 1) return json({ initialized: true, revision: 1, data: '{"transactions":[{"id":"kept"}]}' });
    await held; return json({ error: 'late gateway timeout' }, 504);
  });
  await env.store.ready;
  const refreshing = env.store.refresh();
  env.setEditing(true); release(); await refreshing;
  assert.equal(env.store.phase, 'offline');
  assert.equal(env.window.PulseFinance.isReady(), false);
  const action = { dataset: { action: 'detail' }, closest: selector => selector === '[data-action]' ? action : null };
  assert.equal(env.dispatch('click', action).prevented, false);
  assert.equal(JSON.parse(env.store.data).transactions[0].id, 'kept');
  assert.equal(env.store.refreshing, null);
});

test('the existing timer reconnects a cached ledger without reloading or closing an open detail', async () => {
  let reads = 0; let changes = 0;
  const ledger = '{"transactions":[{"id":"kept"}]}';
  const env = environment(async () => ++reads === 2 ? json({ error: 'temporary gateway failure' }, 502) : json({ initialized: true, revision: 1, data: ledger }));
  await env.store.ready; await new Promise(resolve => setImmediate(resolve));
  env.window.addEventListener('pulse-finance-data', () => changes++);
  await env.tick(); assert.equal(env.store.phase, 'offline');
  env.setEditing(true);
  await env.tick();
  assert.equal(reads, 3); assert.equal(env.store.phase, 'ready');
  assert.equal(env.window.PulseFinance.isReady(), true);
  assert.equal(env.window.PulseFinance.isInteracting(), true);
  assert.equal(env.store.data, ledger); assert.equal(changes, 0); assert.equal(env.reloads, 0);
});

test('reconnection defers a newer remote ledger until the current detail closes', async () => {
  let reads = 0;
  const env = environment(async () => {
    if (++reads === 1) return json({ initialized: true, revision: 1, data: '{"transactions":[{"id":"kept"}]}' });
    if (reads === 2) return json({ error: 'offline' }, 503);
    return json({ initialized: true, revision: 2, data: '{"transactions":[{"id":"remote"}]}' });
  });
  await env.store.ready; await env.store.refresh();
  env.setEditing(true); await env.store.refresh();
  assert.equal(env.store.phase, 'offline'); assert.match(env.store.message, /连接已恢复/);
  assert.equal(env.store.revision, 1); assert.equal(JSON.parse(env.store.data).transactions[0].id, 'kept');
  env.setEditing(false); await env.store.refresh();
  assert.equal(env.store.phase, 'ready'); assert.equal(env.store.revision, 2);
  assert.equal(JSON.parse(env.store.data).transactions[0].id, 'remote'); assert.equal(env.reloads, 0);
});

test('dirty form values stay protected after focus leaves them during reconnection', async () => {
  let reads = 0;
  const env = environment(async () => ++reads === 1 ? json({ initialized: true, revision: 1, data: '{"transactions":[]}' }) : reads === 2 ? json({ error: 'offline' }, 502) : json({ initialized: true, revision: 2, data: '{"transactions":[{"id":"remote"}]}' }));
  await env.store.ready; await env.store.refresh();
  const form = { isConnected: true, closest: () => null };
  env.dispatch('input', { closest: () => form });
  await env.store.refresh();
  assert.equal(env.store.phase, 'offline'); assert.equal(env.store.revision, 1);
  assert.equal(env.window.PulseFinance.isInteracting(), true);
  form.isConnected = false;
  await env.store.refresh();
  assert.equal(env.store.phase, 'ready'); assert.equal(env.store.revision, 2);
});

test('offline interaction allows details and navigation but prevents writes before business handlers', async () => {
  let reads = 0; let writes = 0;
  const env = environment(async (url, init = {}) => {
    if (init.method && init.method !== 'GET') writes++;
    return ++reads === 1 ? json({ initialized: true, revision: 1, data: '{"transactions":[]}' }) : json({ error: 'offline' }, 502);
  });
  await env.store.ready; await env.store.refresh();
  const target = action => { const element = { dataset: { action }, closest: selector => selector === '[data-action]' ? element : null }; return element; };
  for (const action of ['detail', 'merchant-summary', 'close-modal', 'export-json', 'apply-custom-range']) assert.equal(env.dispatch('click', target(action)).prevented, false, action);
  for (const action of ['edit', 'perform-delete', 'confirm-import', 'confirm-category', 'rollback-batch', 'legacy-import-image']) assert.equal(env.dispatch('click', target(action)).prevented, true, action);
  assert.equal(env.dispatch('submit', {}).prevented, true);
  await assert.rejects(env.window.fetch('/api/local-apps/finance/v1/finance/mobile/receipts/test', { method: 'PATCH', body: '{}' }), /连接中断/);
  assert.equal(writes, 0); assert.equal(env.store.queue.length, 0);
});

test('initial load, authorization errors and failed saves retain strict protection', async () => {
  const first = environment(async () => json({ error: 'unreachable' }, 502));
  await assert.rejects(first.store.ready);
  assert.equal(first.store.initialized, false); assert.equal(first.store.phase, 'blocked'); assert.equal(first.store.data, null);
  let reads = 0;
  const unauthorized = environment(async () => ++reads === 1 ? json({ initialized: true, revision: 1, data: '{"transactions":[]}' }) : json({ error: 'denied' }, 403));
  await unauthorized.store.ready; await unauthorized.store.refresh();
  assert.equal(unauthorized.store.phase, 'blocked');
  let saveReads = 0;
  const failedSave = environment(async (url, init = {}) => {
    if (init.method === 'PUT') return json({ error: 'save failed' }, 503);
    saveReads++; return json({ initialized: true, revision: 1, data: '{"transactions":[]}' });
  });
  await failedSave.store.ready;
  failedSave.window.localStorage.setItem(KEY, '{"transactions":[{"id":"unsaved"}]}');
  await assert.rejects(failedSave.store.flush());
  await failedSave.store.refresh();
  assert.equal(failedSave.store.phase, 'blocked'); assert.equal(failedSave.store.queue.length, 1);
  assert.equal(saveReads, 1); assert.equal(JSON.parse(failedSave.store.data).transactions[0].id, 'unsaved');
});

test('an incompatible parent store keeps its unsaved data and never creates another writer', () => {
  let requests = 0; let confirmations = 0;
  const queue = [{ id: 'pending-save', data: '{"transactions":[{"id":"unsaved"}]}' }];
  const legacy = { initialized: true, phase: 'blocked', data: queue[0].data, revision: 7, queue, running: null, views: new Set(), listeners: new Set() };
  const env = environment(async () => { requests++; throw new Error('must not hydrate a replacement'); }, { legacyStore: legacy, confirm: () => { confirmations++; return true; } });
  const button = env.elements.find(item => item.dataset.pulseUpgradeRefresh === 'true');
  assert.ok(button); button.onclick();
  assert.equal(env.store, legacy); assert.equal(env.store.queue, queue);
  assert.equal(env.store.data, queue[0].data); assert.equal(env.store.queue.length, 1);
  assert.equal(typeof legacy.interacting, 'undefined');
  assert.equal(requests, 0); assert.equal(env.timers, 0); assert.equal(env.reloads, 0); assert.equal(confirmations, 0);
  assert.equal(env.document.body.dataset.financeState, 'blocked');
  assert.ok(env.elements.some(item => item.textContent?.includes('旧页面仍有未保存内容')));
});

test('upgrading a clean old store requires an explicit user-confirmed outer-page reload', () => {
  let editing = true; let confirmed = false;
  const legacy = { initialized: true, phase: 'ready', data: '{"transactions":[]}', revision: 7, queue: [], running: null, views: new Set([{ editing: () => editing }]) };
  const outer = environment(async () => { throw new Error('no new writer'); }, { legacyStore: legacy });
  const child = environment(async () => { throw new Error('no new writer'); }, { top: outer.window, confirm: () => confirmed });
  const button = child.elements.find(item => item.dataset.pulseUpgradeRefresh === 'true');
  assert.equal(outer.reloads, 0); button.onclick(); assert.equal(outer.reloads, 0);
  editing = false; button.onclick(); assert.equal(outer.reloads, 0);
  confirmed = true; button.onclick();
  assert.equal(outer.reloads, 1); assert.equal(child.reloads, 0);
  assert.equal(outer.store, legacy); assert.equal(legacy.revision, 7);
});

test('compatible repeated and nested adapters share exactly one refresh timer', async () => {
  let reads = 0;
  const fetcher = async () => { reads++; return json({ initialized: true, revision: 1, data: '{"transactions":[]}' }); };
  const env = environment(fetcher);
  await env.store.ready; await new Promise(resolve => setImmediate(resolve));
  assert.equal(env.timers, 1);
  env.rerun();
  const child = environment(fetcher, { top: env.window });
  await new Promise(resolve => setImmediate(resolve));
  assert.equal(env.timers, 1); assert.equal(child.timers, 0); assert.equal(reads, 1);
  assert.equal(env.store.runtimeVersion, 2);
});
