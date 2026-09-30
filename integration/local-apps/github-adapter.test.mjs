import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import { readFile } from 'node:fs/promises';
import { webcrypto, randomUUID } from 'node:crypto';
import { githubFiles, transformGithubSource } from './build-github.mjs';

const source = await readFile(new URL('./github-adapter.js', import.meta.url), 'utf8');
const json = (body, status = 200) => new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });
const flush = async () => { for (let i = 0; i < 4; i++) await new Promise(resolve => setImmediate(resolve)); };

function environment(fetcher, options = {}) {
  const intervals = [], events = new Map(), appended = [], scriptLoads = [];
  let reloads = 0;
  const element = tag => ({ tag, hidden: false, dataset: {}, attrs: {}, setAttribute(key, value) { this.attrs[key] = value; },
    querySelector() { return { onclick: null }; }, addEventListener() {}, showModal() {}, close() {}, remove() {} });
  const document = {
    body: { append(node) {
      appended.push(node);
      if (node.tag === 'script') {
        scriptLoads.push(node.src);
        if (options.stallScript !== node.src) queueMicrotask(() => options.failScript === node.src ? node.onerror(new Error('fixture-load-failed')) : node.onload());
      }
    } },
    createElement: element,
    querySelectorAll: () => (options.scripts || []).map(src => ({ dataset: { src } })),
    addEventListener: (name, callback) => events.set(name, callback),
  };
  const location = { origin: 'https://pulse.example', href: 'https://pulse.example/local-apps/github-workspace-v6/index.html', reload() { reloads++; } };
  const window = { fetch: fetcher };
  vm.runInNewContext(source, { window, document, location, URL, Headers, Request, Response, AbortSignal, crypto: webcrypto,
    setTimeout: callback => setImmediate(callback), clearTimeout: clearImmediate, setInterval: callback => { intervals.push(callback); return intervals.length; } });
  return { window, scriptLoads, appended, events, get gate() { return appended[0]; }, get reloads() { return reloads; }, tick: () => intervals[0]() };
}

const online = { canManage: true, connected: true, apps: { github: true } };

test('authorization and backend gates defer all original scripts; healthy scripts load in order once', async () => {
  let status = { canManage: false, connected: true, apps: { github: true } };
  const calls = [];
  const env = environment(async url => { calls.push(url); return json(status); }, { scripts: ['/base.js','/controls.js','/details.js'] });
  await flush(); assert.equal(env.scriptLoads.length, 0); assert.equal(env.gate.hidden, false);
  await assert.rejects(env.window.fetch('/v1/github-workspace/overview'), /完成连接/);
  assert.equal(calls.length, 1);
  status = { ...online, apps: { github: false } }; await env.tick();
  assert.equal(env.scriptLoads.length, 0);
  status = online; await env.tick();
  assert.deepEqual(env.scriptLoads, ['/base.js','/controls.js','/details.js']); assert.equal(env.gate.hidden, true);
  await env.tick(); assert.equal(env.scriptLoads.length, 3);
});

test('202 sync confirms one durable operation despite transient receipt errors and never replays the write', async () => {
  const calls = []; let polls = 0, originalId;
  const env = environment(async (url, init = {}) => {
    if (url === '/api/local-apps/status') return json(online);
    calls.push({ url, method: init.method || 'GET' });
    if (url.includes('/operations/')) {
      assert.ok(url.endsWith(originalId));
      if (++polls === 1) throw new Error('temporary-network');
      if (polls === 2) return json({ error: 'temporary' }, 503);
      if (polls === 3) return json({ state: 'running' });
      return json({ state: 'done', status: 200, body: { synced: true } });
    }
    originalId = init.headers.get('X-Pulse-Operation-Id');
    return json({ relayPending: true, operationId: 'do-not-follow-a-different-receipt' }, 202);
  });
  await flush();
  const response = await env.window.fetch('/v1/github-workspace/sync', { method: 'POST', body: '{}', headers: { 'Content-Type': 'application/json' } });
  assert.deepEqual(await response.json(), { synced: true });
  assert.equal(calls.filter(call => call.method === 'POST').length, 1); assert.equal(polls, 4);
});

test('lost DELETE response resolves its existing 204 receipt, including Request body and stable operation IDs', async () => {
  const calls = []; const id = randomUUID();
  const env = environment(async (url, init = {}) => {
    if (url === '/api/local-apps/status') return json(online);
    calls.push({ url, method: init.method || 'GET', body: init.body });
    if (url.includes('/operations/')) { assert.ok(url.endsWith(id)); return json({ state: 'done', status: 204, body: null }); }
    assert.equal(init.headers.get('X-Pulse-Operation-Id'), id);
    throw new Error('response-lost-after-commit');
  });
  await flush();
  const request = new Request('https://pulse.example/v1/github-workspace/snippets/manual-id', { method: 'DELETE', headers: { 'X-Pulse-Operation-Id': id } });
  const response = await env.window.fetch(request);
  assert.equal(response.status, 204); assert.equal(await response.text(), '');
  assert.equal(calls.filter(call => call.method === 'DELETE').length, 1);
});

test('a known uncertain receipt does not retry and an authorization failure remains a real 403', async () => {
  let mode = 'uncertain', writes = 0;
  const env = environment(async (url, init = {}) => {
    if (url === '/api/local-apps/status') return json(online);
    if (url.includes('/operations/')) return mode === 'uncertain' ? json({ state: 'uncertain' }) : json({ error: 'owner-required' }, 403);
    writes++; return json({ relayPending: true }, 202);
  });
  await flush();
  await assert.rejects(env.window.fetch('/v1/github-workspace/snippets', { method: 'POST', body: '{}' }), /不会重复提交/);
  assert.equal(writes, 1);
  mode = 'forbidden';
  const response = await env.window.fetch('/v1/github-workspace/snippets', { method: 'POST', body: '{}' });
  assert.equal(response.status, 403); assert.equal(writes, 2);
});

test('failed deferred scripts recover through a fresh page, never partial double execution', async () => {
  const env = environment(async () => json(online), { scripts: ['/base.js','/controls.js','/details.js'], failScript: '/controls.js' });
  await flush();
  assert.deepEqual(env.scriptLoads, ['/base.js','/controls.js']); assert.equal(env.gate.hidden, false);
  await env.tick(); assert.equal(env.reloads, 1);
  assert.deepEqual(env.scriptLoads, ['/base.js','/controls.js']); assert.equal(env.gate.hidden, false);
});

test('a stalled script times out behind the gate and can recover on the next health check', async () => {
  const env = environment(async () => json(online), { scripts: ['/base.js','/stalled.js'], stallScript: '/stalled.js' });
  await flush();
  assert.equal(env.gate.hidden, false); assert.deepEqual(env.scriptLoads, ['/base.js','/stalled.js']);
  await env.tick(); assert.equal(env.reloads, 1);
});

test('connection recovery waits for an in-flight write receipt before refreshing old data', async () => {
  let status = online, release;
  const held = new Promise(resolve => { release = resolve; });
  const env = environment(async (url, init = {}) => {
    if (url === '/api/local-apps/status') return json(status);
    if (url.includes('/operations/')) { await held; return json({ state: 'done', status: 200, body: { saved: true } }); }
    return json({ relayPending: true }, 202);
  });
  await flush();
  const saving = env.window.fetch('/v1/github-workspace/snippets', { method: 'POST', body: '{}' });
  await flush(); status = { ...online, connected: false }; await env.tick();
  assert.equal(env.gate.hidden, false); assert.equal(env.reloads, 0);
  status = online; await env.tick(); assert.equal(env.reloads, 0);
  release(); await saving; await env.tick(); assert.equal(env.reloads, 1);
});

test('normal reads preserve encoded paths, Request bodies, and unrelated fetches', async () => {
  const calls = [];
  const env = environment(async (url, init = {}) => {
    if (url === '/api/local-apps/status') return json(online);
    calls.push({ url: String(url), init }); return json({ ok: true });
  });
  await flush();
  await env.window.fetch(new URL('https://pulse.example/v1/github-workspace/repositories/o/r/contents?path=src%2F%E4%B8%AD.ts'));
  assert.equal(calls.at(-1).url, '/api/local-apps/github/v1/github-workspace/repositories/o/r/contents?path=src%2F%E4%B8%AD.ts');
  const request = new Request('https://pulse.example/v1/github-workspace/snippets', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{"content":"fixture"}' });
  await env.window.fetch(request);
  assert.equal(calls.at(-1).init.body, '{"content":"fixture"}');
  await env.window.fetch('https://another.example/v1/github-workspace/overview');
  assert.equal(calls.at(-1).url, 'https://another.example/v1/github-workspace/overview');
  await env.window.fetch('http://127.0.0.1:9999/v1/github-workspace/overview');
  assert.equal(calls.at(-1).url, 'http://127.0.0.1:9999/v1/github-workspace/overview');
});

test('a non-success status response cannot unlock scripts; OAuth keeps the original computer handoff', async () => {
  const env = environment(async () => json(online, 503), { scripts: ['/base.js'] });
  await flush(); assert.equal(env.scriptLoads.length, 0); assert.equal(env.gate.hidden, false);
  let prevented = false;
  env.events.get('click')({ target: { closest: () => ({}) }, preventDefault() { prevented = true; } });
  const dialog = env.appended.at(-1);
  assert.equal(prevented, true); assert.equal(dialog.tag, 'dialog');
  assert.ok(dialog.innerHTML.includes('http://127.0.0.1:5174/api/integrations/github/connect'));
  assert.ok(dialog.innerHTML.includes('手机'));
});

test('copy transform preserves controls, endpoint strings, script sequence and functional filter values', () => {
  assert.equal(githubFiles.length, 15);
  const html = '<html><head></head><body><button id="sync">同步</button><script src="/github-workspace-v6/connection-bridge.js"></script><script src="/github-workspace-v1/app.js?rev=workspace-interactions"></script></body></html>';
  const output = transformGithubSource('github-workspace-v6/index.html', html);
  assert.ok(output.includes('id="sync"'));
  const deferred = [...output.matchAll(/type="text\/pulse-deferred" data-src="([^"]+)"/g)].map(match => match[1]);
  assert.deepEqual(deferred, ['/local-apps/github-workspace-v6/connection-bridge.js','/local-apps/github-workspace-v1/app.js?rev=workspace-interactions']);
  assert.equal([...output.matchAll(/<script src=/g)].length, 1);
  const business = 'fetch(`${API_ROOT}/issues?state=ALL`); const s = `<select><option>All</option><option>Open</option><option>Closed</option><option>In Progress</option><option>Name</option><option>Stars</option></select>`; if (filters.issueState === "Open") apply();';
  const transformed = transformGithubSource('github-workspace-v1/app.js', business);
  for (const value of ['All','Open','Closed','In Progress','Name','Stars']) assert.ok(transformed.includes(`<option value="${value}">`), value);
  assert.ok(transformed.includes('filters.issueState === "Open"')); assert.ok(transformed.includes('/issues?state=ALL'));
});
