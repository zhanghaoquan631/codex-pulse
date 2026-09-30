import test from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import os from 'node:os';
import path from 'node:path';
import { mkdtemp, rm, readFile } from 'node:fs/promises';
import { randomUUID, webcrypto } from 'node:crypto';
import vm from 'node:vm';
import ts from 'typescript';
import { createFinanceStorage } from './apps-storage.mjs';
import { resolveRelayRoute } from '../integration/local-apps/relay-policy.mjs';

const ledger = label => JSON.stringify({ transactions: [{ id: label, amount: 100, currency: 'USD' }], labels: [label] });
async function fixture(t) {
  const directory = await mkdtemp(path.join(os.tmpdir(), 'pulse-finance-storage-test-'));
  let store = createFinanceStorage(directory);
  const server = http.createServer((request, response) => {
    if (request.headers['x-test-lose-response'] === '1') response.end = () => response.destroy();
    void store.handle(request, response, new URL(request.url, 'http://localhost')).catch(() => {
      if (!response.headersSent) response.writeHead(500);
      response.end();
    });
  });
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  const origin = `http://127.0.0.1:${server.address().port}`;
  t.after(async () => {
    await new Promise(resolve => server.close(resolve));
    await store.stop();
    assert.equal(path.dirname(path.resolve(directory)), path.resolve(os.tmpdir()));
    assert.ok(path.basename(directory).startsWith('pulse-finance-storage-test-'));
    await rm(directory, { recursive: true, force: true });
  });
  return {
    async read() { const response = await fetch(origin + '/storage/finance'); return response.json(); },
    async write(revision, data, id = randomUUID(), extraHeaders = {}) {
      const response = await fetch(origin + '/storage/finance', { method: 'PUT',
        headers: { 'Content-Type': 'application/json', 'X-Pulse-Operation-Id': id, ...extraHeaders },
        body: JSON.stringify({ revision, data }) });
      return { status: response.status, body: await response.json() };
    },
    async restart() { await store.stop(); store = createFinanceStorage(directory); },
    origin,
  };
}

test('fresh ledger is explicit and concurrent devices cannot silently overwrite the winning revision', async t => {
  const app = await fixture(t);
  assert.deepEqual(await app.read(), { initialized: false, revision: 0, data: null });
  const attempts = Array.from({ length: 12 }, (_, index) => ({ data: ledger('device-' + index), id: randomUUID() }));
  const results = await Promise.all(attempts.map(value => app.write(0, value.data, value.id)));
  assert.equal(results.filter(value => value.status === 200).length, 1);
  assert.equal(results.filter(value => value.status === 409).length, 11);
  const winningIndex = results.findIndex(value => value.status === 200);
  assert.deepEqual(await app.read(), { initialized: true, revision: 1, data: attempts[winningIndex].data });
});

test('identical operation replay returns the durable receipt without overwriting a later edit', async t => {
  const app = await fixture(t), id = randomUUID(), original = ledger('first'), newer = ledger('later');
  assert.equal((await app.write(0, original, id)).status, 200);
  assert.equal((await app.write(1, newer)).status, 200);
  const duplicate = await app.write(0, original, id);
  assert.deepEqual(duplicate, { status: 200, body: { initialized: true, revision: 1 } });
  assert.deepEqual(await app.read(), { initialized: true, revision: 2, data: newer });
  assert.equal((await app.write(0, ledger('conflicting-content'), id)).status, 409);
  assert.equal((await app.read()).data, newer);
});

test('simultaneous identical operations commit only once', async t => {
  const app = await fixture(t), id = randomUUID(), data = ledger('same-operation');
  const results = await Promise.all(Array.from({ length: 8 }, () => app.write(0, data, id)));
  assert.ok(results.every(value => value.status === 200 && value.body.revision === 1));
  assert.deepEqual(await app.read(), { initialized: true, revision: 1, data });
});

test('lost HTTP response can be retried with the same operation ID after restart without repeating the write', async t => {
  const app = await fixture(t), id = randomUUID(), data = ledger('response-lost');
  await assert.rejects(app.write(0, data, id, { 'X-Test-Lose-Response': '1' }));
  assert.deepEqual(await app.read(), { initialized: true, revision: 1, data });
  await app.restart();
  assert.deepEqual(await app.write(0, data, id), { status: 200, body: { initialized: true, revision: 1 } });
  assert.equal((await app.read()).revision, 1);
});

test('invalid and stale payloads never replace the existing ledger', async t => {
  const app = await fixture(t), data = ledger('keep-this-record');
  await app.write(0, data);
  for (const invalid of [JSON.stringify([]), '{}', 'not json', JSON.stringify({ transactions: {} })]) {
    assert.equal((await app.write(1, invalid)).status, 400);
  }
  assert.equal((await app.write(-1, ledger('invalid-revision'))).status, 400);
  assert.equal((await app.write(0, ledger('stale-device'))).status, 409);
  assert.equal((await app.write(1, ledger('missing-id'), 'invalid-operation')).status, 400);
  assert.deepEqual(await app.read(), { initialized: true, revision: 1, data });
});

test('relay policy preserves binary, upload and finance-storage contracts without exposing local import or arbitrary destinations', () => {
  const media = resolveRelayRoute('GET', '/relay/media/api/film-studio/v1/media/emotion/%E6%B5%8B%E8%AF%95%20video.webm');
  assert.equal(media.binary, true); assert.equal(media.port, 5174);
  assert.equal(resolveRelayRoute('HEAD', '/relay/media/api/film-studio/v1/media/action/capture.png').binary, true);
  assert.equal(resolveRelayRoute('PUT', '/relay/finance/storage/finance').maxBodyBytes, 16 * 1024 * 1024);
  const id = randomUUID();
  assert.equal(resolveRelayRoute('PUT', `/uploads/${id}/chunks/127`).maxBodyBytes, 8 * 1024 * 1024);
  for (const [method, route] of [
    ['POST', '/storage/finance/import'], ['POST', '/relay/finance/storage/finance/import'],
    ['GET', '/relay/media/api/film-studio/v1/media/emotion/..%2fsecret'],
    ['GET', '/relay/media/api/film-studio/v1/media/emotion/%252e%252e'],
    ['GET', '//evil.invalid/media'], ['GET', '/relay/media/api/film-studio/v1/libraries?target=http://evil.invalid'],
    ['POST', '/relay/media/api/film-studio/v1/share/publish/emotion/video.webm'],
  ]) assert.equal(resolveRelayRoute(method, route), null, route);
});

async function cloudProxyFixture(upstream) {
  const environment = { OWNER_EMAIL: 'fixture-owner@example.invalid', INGEST_TOKEN: 'isolated-fixture-secret-never-a-real-credential' };
  const calls = [];
  function module(source, dependencies) {
    const exports = {};
    const code = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText;
    vm.runInNewContext(code, { exports, require: name => {
      if (!(name in dependencies)) throw new Error('Unexpected test import: ' + name);
      return dependencies[name];
    }, Response, Headers, URL, TextEncoder, TextDecoder, Uint8Array, TransformStream, AbortSignal, crypto: webcrypto, Date,
    fetch: async (url, options) => { calls.push({ url, options }); return upstream(url, options); } });
    return exports;
  }
  const auth = module(await readFile(new URL('../lib/website-api.ts', import.meta.url), 'utf8'), { 'cloudflare:workers': { env: environment } });
  const api = module(await readFile(new URL('../lib/local-apps-api.ts', import.meta.url), 'utf8'), {
    'cloudflare:workers': { env: environment }, '@/lib/website-api': auth,
    '@/integration/local-apps/relay-policy.mjs': { resolveRelayRoute },
    '@/db/raw': { database: () => ({ prepare: () => ({ first: async () => ({ relay_url: 'https://isolated-fixture.trycloudflare.com', last_seen: Date.now() }) }) }) },
  });
  return { api, calls, owner: { 'oai-authenticated-user-email': environment.OWNER_EMAIL } };
}

test('cloud proxy rejects anonymous reads, cross-origin writes and arbitrary routes before contacting a relay', async () => {
  const { api, calls, owner } = await cloudProxyFixture(() => { throw new Error('Must not contact upstream'); });
  const url = 'https://pulse.example.invalid/api/local-apps/finance/storage/finance';
  for (const request of [new Request(url),
    new Request(url, { method: 'PUT', headers: owner, body: '{}' }),
    new Request(url, { method: 'PUT', headers: { ...owner, Origin: 'https://attacker.example.invalid' }, body: '{}' }),
    new Request('https://pulse.example.invalid/api/local-apps/media/arbitrary/file', { headers: owner })]) {
    assert.equal((await api.forwardLocalApp(request)).status, 403);
  }
  assert.equal(calls.length, 0);
  for (const address of ['http://isolated-fixture.trycloudflare.com', 'https://evil.invalid', 'https://x.trycloudflare.com/redirect', 'https://x.trycloudflare.com@evil.invalid', 'https://x.trycloudflare.com:443']) assert.equal(api.validRelayUrl(address), false);
});

test('cloud proxy preserves binary Range and bodyless 204 while dropping local cookies and incoming credentials', async () => {
  const binary = new Uint8Array([0, 11, 128, 255]);
  let mode = 'binary';
  const { api, calls, owner } = await cloudProxyFixture(() => mode === 'binary'
    ? new Response(binary, { status: 206, headers: { 'Content-Type': 'video/webm', 'Content-Length': '4', 'Content-Range': 'bytes 4-7/12', 'Accept-Ranges': 'bytes', 'Set-Cookie': 'fixture-private-cookie=not-forwarded' } })
    : new Response(null, { status: 204, headers: { 'Set-Cookie': 'fixture-private-cookie=not-forwarded' } }));
  const media = await api.forwardLocalApp(new Request('https://pulse.example.invalid/api/local-apps/media/api/film-studio/v1/media/emotion/fixture.webm', {
    headers: { ...owner, Range: 'bytes=4-7', Cookie: 'site-cookie=not-forwarded', Authorization: 'Bearer not-forwarded' },
  }));
  assert.equal(media.status, 206); assert.deepEqual(new Uint8Array(await media.arrayBuffer()), binary);
  assert.equal(media.headers.get('content-range'), 'bytes 4-7/12'); assert.equal(media.headers.get('set-cookie'), null);
  assert.equal(calls[0].url, 'https://isolated-fixture.trycloudflare.com/relay/media/api/film-studio/v1/media/emotion/fixture.webm');
  assert.equal(calls[0].options.headers.get('range'), 'bytes=4-7');
  assert.equal(calls[0].options.headers.get('cookie'), null); assert.equal(calls[0].options.headers.get('authorization'), null);
  assert.match(calls[0].options.headers.get('x-pulse-relay-key'), /^[0-9a-f]{64}$/);
  mode = 'empty';
  const deleted = await api.forwardLocalApp(new Request('https://pulse.example.invalid/api/local-apps/github/v1/github-workspace/connection', {
    method: 'DELETE', headers: { ...owner, Origin: 'https://pulse.example.invalid', 'X-Pulse-Operation-Id': randomUUID() },
  }));
  assert.equal(deleted.status, 204); assert.equal(deleted.body, null); assert.equal(deleted.headers.get('set-cookie'), null);
});
