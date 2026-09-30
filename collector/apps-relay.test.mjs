import test from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import { randomUUID, createHash } from 'node:crypto';
import { mkdtemp, rm } from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import { EventEmitter } from 'node:events';
import { PassThrough } from 'node:stream';
import { AppsRelay, deriveRelayKey, relayUrlFromOutput } from './apps-relay.mjs';
import { resolveRelayRoute, UPLOAD_CHUNK_BYTES, MAX_UPLOAD_BYTES } from '../integration/local-apps/relay-policy.mjs';

const token = 'isolated-test-ingest-token-never-real';
const key = deriveRelayKey(token);
const pause = ms => new Promise(resolve => setTimeout(resolve, ms));

async function fixture(t, overrides = {}) {
  const directory = await mkdtemp(path.join(os.tmpdir(), 'pulse-relay-test-'));
  const calls = [], uploads = [];
  let sessionNumber = 0;
  const backend = http.createServer(async (req, res) => {
    const body = []; for await (const chunk of req) body.push(chunk);
    calls.push({ method: req.method, path: req.url, headers: req.headers, body: Buffer.concat(body) });
    const url = req.url;
    if (url === '/v1/github-workspace/connection' || url === '/v1/finance/mobile/desktop-session') {
      const cookieName = url.includes('github') ? 'mezip_github_dev_session' : 'mezip_finance_desktop_session';
      res.setHeader('Set-Cookie', `${cookieName}=test-session-${++sessionNumber}; HttpOnly`);
      res.setHeader('Content-Type', 'application/json'); res.end(JSON.stringify({ status: url.includes('github') ? 'CONNECTED' : 'READY' })); return;
    }
    if (url.startsWith('/v1/github') || url.startsWith('/v1/finance')) {
      if (!req.headers.cookie && !url.endsWith('/health')) { res.writeHead(401); res.end('{}'); return; }
    }
    if (req.method === 'POST' && url === '/v1/github-workspace/sync') {
      if (!req.headers['idempotency-key']) { res.writeHead(400); res.end('{}'); return; }
      await pause(overrides.syncDelay || 0);
    }
    if (url.includes('/media/') || url.endsWith('/image')) {
      res.writeHead(206, { 'Content-Type': 'video/webm', 'Content-Range': 'bytes 2-5/8', 'Accept-Ranges': 'bytes', 'Content-Length': '4', 'Set-Cookie': 'forbidden=1' });
      res.end(Buffer.from([2,3,4,5])); return;
    }
    if (url.includes('/upload/')) {
      uploads.push(Buffer.concat(body));
      await pause(overrides.uploadDelay || 0);
      res.writeHead(201, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ saved: true, item: { name: 'test.webm', url: '/api/film-studio/v1/media/emotion/test.webm' } })); return;
    }
    if (req.method === 'DELETE' && url.startsWith('/v1/github')) { res.writeHead(204); res.end(); return; }
    res.setHeader('Content-Type', 'application/json');
    if (url.includes('/invite')) res.end(JSON.stringify({ mobileUrl: 'http://192.0.2.1/mobile?pair=test', token: 'must-be-stripped', filePath: 'private-path' }));
    else res.end(JSON.stringify({ ok: true, filePath: 'private-path', records: [{ title: 'fixture', accessToken: 'must-be-stripped' }] }));
  });
  await new Promise(resolve => backend.listen(0, '127.0.0.1', resolve));
  const backendPort = backend.address().port;
  const dependencies = { disableTunnel: true, listenPort: 0, deviceId: randomUUID(), pendingAfterMs: overrides.pendingAfterMs ?? 50,
    readConfig: async () => ({ ingestToken: token }), backendPorts: { github: backendPort, finance: backendPort, media: backendPort },
    createFinanceStorage: () => ({ startImportServer: async () => {}, stop: async () => {}, handle: async (req, res) => { res.end('{}'); } }) };
  let relay = new AppsRelay(directory, '', dependencies); await relay.start();
  const request = async (url, options = {}) => {
    const response = await fetch(`http://127.0.0.1:${relay.port}${url}`, { ...options, headers: { 'X-Pulse-Relay-Key': key, ...options.headers } });
    return response;
  };
  const write = (url, method = 'POST', data, id = randomUUID()) => request(url, { method,
    headers: { 'Content-Type': 'application/json', 'X-Pulse-Operation-Id': id }, body: data === undefined ? undefined : JSON.stringify(data) });
  const restart = async () => { await relay.stop(); relay = new AppsRelay(directory, '', dependencies); await relay.start(); return relay; };
  t.after(async () => {
    await relay.stop(); backend.closeAllConnections(); await new Promise(resolve => backend.close(resolve));
    const resolved = path.resolve(directory), temporaryRoot = path.resolve(os.tmpdir());
    assert.ok(resolved.startsWith(temporaryRoot + path.sep) && path.basename(resolved).startsWith('pulse-relay-test-'));
    await rm(resolved, { recursive: true, force: true });
  });
  return { get relay() { return relay; }, request, write, restart, calls, uploads };
}

test('route policy permits only exact applications, encoded identifiers and valid media names', () => {
  assert.equal(resolveRelayRoute('GET', '/relay/github/v1/github-workspace/repositories/o/r/contents?path=src%2F%E4%B8%AD%E6%96%87.ts').port, 4317);
  assert.equal(resolveRelayRoute('PATCH', '/relay/github/v1/github-workspace/snippets/github-file%3Ao%2Fr%3Asha/favorite').port, 4317);
  assert.equal(resolveRelayRoute('POST', '/relay/finance/v1/finance/mobile/invite?version=v2&permanent=1').method, 'GET');
  assert.equal(resolveRelayRoute('GET', '/relay/media/api/film-studio/v1/media/action/%E6%88%AA%E5%9B%BE%201.png').port, 5174);
  for (const [method, url] of [
    ['GET','/relay/finance/v1/finance/mobile/invite?version=v2&permanent=1'],
    ['GET','/relay/finance/v1/finance/mobile/events'], ['POST','/relay/media/api/film-studio/v1/upload/emotion'],
    ['GET','/relay/media/api/film-studio/v1/media/action/%252e%252e'], ['GET','/relay/media/api/film-studio/v1/media/action/a%2fb.png'],
    ['GET','/relay/media/api/film-studio/v1/media/action/../libraries'], ['GET','/relay/github/v1/github-workspace/repositories?limit=1&limit=2'],
    ['GET','/relay/github/v1/github-workspace/repositories/o/r/contents?path=../secret'], ['GET','/relay/github/http://127.0.0.1:99/'],
    ['GET','/relay/media/api/film-studio/v1/metadata/action/name'], ['POST','/relay/github/v1/github-workspace/connection/start'],
  ]) assert.equal(resolveRelayRoute(method, url), null, url);
  assert.equal(relayUrlFromOutput(' | https://quiet-field.trycloudflare.com | '), 'https://quiet-field.trycloudflare.com');
  assert.equal(relayUrlFromOutput('https://quiet-field.trycloudflare.com.attacker.invalid'), null);
});

test('gateway requires a shared key even for health and does not expose backend cookies', async t => {
  const f = await fixture(t);
  assert.equal((await fetch(`http://127.0.0.1:${f.relay.port}/health`)).status, 403);
  assert.equal((await f.request('/health', { headers: { 'X-Pulse-Relay-Key': 'a'.repeat(64) } })).status, 403);
  assert.equal(f.calls.length, 0);
  const response = await f.request('/relay/github/v1/github-workspace/overview');
  assert.equal(response.status, 200); assert.equal(response.headers.get('set-cookie'), null);
  assert.deepEqual(await response.json(), { ok: true, records: [{ title: 'fixture' }] });
  assert.ok(f.calls.at(-1).headers.cookie.startsWith('mezip_github_dev_session='));
  const health = await (await f.request('/health')).json();
  assert.deepEqual(health.apps, { github: true, finance: true, media: true });
});

test('writes are durable and idempotent; invite is POST-only and 204 remains empty', async t => {
  const f = await fixture(t);
  const id = randomUUID(), url = '/relay/github/v1/github-workspace/snippets';
  assert.equal((await f.write(url, 'POST', { title: 'test', content: 'fixture' }, id)).status, 200);
  assert.equal((await f.write(url, 'POST', { title: 'test', content: 'fixture' }, id)).status, 200);
  assert.equal((await f.write(url, 'POST', { title: 'different' }, id)).status, 409);
  assert.equal(f.calls.filter(row => row.method === 'POST' && row.path.endsWith('/snippets')).length, 1);
  assert.ok(f.calls.find(row => row.path.endsWith('/snippets')).headers['idempotency-key'].startsWith('pulse:'));
  const deleted = await f.write('/relay/github/v1/github-workspace/snippets/manual-id', 'DELETE');
  assert.equal(deleted.status, 204); assert.equal(await deleted.text(), '');
  const inviteUrl = '/relay/finance/v1/finance/mobile/invite?version=v2&permanent=1', inviteId = randomUUID();
  assert.equal((await f.request(inviteUrl)).status, 404);
  const invite = await f.write(inviteUrl, 'POST', {}, inviteId);
  assert.deepEqual(await invite.json(), { mobileUrl: 'http://192.0.2.1/mobile?pair=test' });
  await f.write(inviteUrl, 'POST', {}, inviteId);
  assert.equal(f.calls.filter(row => row.path.includes('/invite')).length, 1);
  assert.equal(f.calls.find(row => row.path.includes('/invite')).method, 'GET');
  await f.restart();
  await f.write(url, 'POST', { title: 'test', content: 'fixture' }, id);
  assert.equal(f.calls.filter(row => row.method === 'POST' && row.path.endsWith('/snippets')).length, 1);
});

test('long writes return pending, finish in the background and expose a receipt without replay', async t => {
  const f = await fixture(t, { syncDelay: 60, pendingAfterMs: 2 });
  const id = randomUUID();
  const response = await f.write('/relay/github/v1/github-workspace/sync', 'POST', {}, id);
  assert.equal(response.status, 202); assert.equal((await response.json()).relayPending, true);
  assert.equal((await (await f.request(`/operations/${id}`)).json()).state, 'running');
  await pause(90);
  const receipt = await (await f.request(`/operations/${id}`)).json();
  assert.equal(receipt.state, 'done'); assert.equal(receipt.status, 200);
  assert.equal(f.calls.filter(row => row.path.endsWith('/sync')).length, 1);
});

test('media bytes and Range headers stream unchanged; deletion confirmation is fixed by the gateway', async t => {
  const f = await fixture(t);
  const response = await f.request('/relay/media/api/film-studio/v1/media/emotion/test.webm', { headers: { Range: 'bytes=2-5' } });
  assert.equal(response.status, 206); assert.equal(response.headers.get('content-range'), 'bytes 2-5/8');
  assert.equal(response.headers.get('set-cookie'), null);
  assert.deepEqual(Buffer.from(await response.arrayBuffer()), Buffer.from([2,3,4,5]));
  assert.equal(f.calls.at(-1).headers.range, 'bytes=2-5');
  await f.write('/relay/media/api/film-studio/v1/delete/emotion/test.webm', 'DELETE');
  assert.equal(f.calls.at(-1).headers['x-film-studio-confirm'], 'recycle-bin');
});

test('uploads enforce order and hashes, stream once, and retain a durable final receipt', async t => {
  const f = await fixture(t);
  const id = randomUUID(), first = Buffer.alloc(UPLOAD_CHUNK_BYTES, 7), last = Buffer.from('end');
  const create = { id, kind: 'emotion', contentType: 'video/webm;codecs=vp9,opus', totalBytes: first.length + last.length, chunkBytes: UPLOAD_CHUNK_BYTES };
  assert.equal((await f.write('/uploads', 'POST', create)).status, 201);
  assert.equal((await f.write('/uploads', 'POST', create)).status, 200);
  assert.equal((await f.write('/uploads', 'POST', { ...create, totalBytes: 5 })).status, 409);
  const put = (index, body) => f.request(`/uploads/${id}/chunks/${index}`, { method: 'PUT', body });
  assert.equal((await put(1, last)).status, 409);
  assert.equal((await put(0, first)).status, 200);
  assert.equal((await put(0, first)).status, 200);
  assert.equal((await put(0, Buffer.alloc(UPLOAD_CHUNK_BYTES, 8))).status, 409);
  assert.equal((await f.write(`/uploads/${id}/commit`, 'POST', {})).status, 409);
  assert.equal((await put(1, last)).status, 200);
  const committed = await f.write(`/uploads/${id}/commit`, 'POST', {});
  assert.equal(committed.status, 200); assert.equal((await committed.json()).body.saved, true);
  assert.equal(f.uploads.length, 1); assert.deepEqual(f.uploads[0], Buffer.concat([first, last]));
  assert.equal(f.calls.find(row => row.path.includes('/upload/')).headers['content-type'], 'video/webm');
  await f.restart();
  const receipt = await (await f.request(`/uploads/${id}`)).json();
  assert.equal(receipt.state, 'done'); assert.equal(receipt.result.status, 201);
  await f.write(`/uploads/${id}/commit`, 'POST', {});
  assert.equal(f.uploads.length, 1);
  assert.equal((await f.write('/uploads', 'POST', { ...create, id: randomUUID(), totalBytes: MAX_UPLOAD_BYTES + 1 })).status, 400);
  const largeId = randomUUID();
  assert.equal((await f.write('/uploads', 'POST', { ...create, id: largeId, totalBytes: MAX_UPLOAD_BYTES })).status, 201);
  assert.equal((await f.request(`/uploads/${largeId}`, { method: 'DELETE' })).status, 200);
});

test('interrupted writes and interrupted upload commits become uncertain and never replay on restart', async t => {
  const f = await fixture(t);
  const operationId = randomUUID(), uploadId = randomUUID();
  const url = '/relay/github/v1/github-workspace/snippets';
  const fingerprint = createHash('sha256').update(JSON.stringify(['POST', url, { title: 'test' }])).digest('hex');
  f.relay.db.prepare("INSERT INTO operations(id,fingerprint,state,updated) VALUES(?,?,'running',?)").run(operationId, fingerprint, Date.now());
  f.relay.db.prepare("INSERT INTO uploads(id,kind,mime,total,received,state,updated) VALUES(?,'emotion','video/webm',1,1,'committing',?)").run(uploadId, Date.now());
  await f.restart();
  assert.equal((await (await f.request(`/operations/${operationId}`)).json()).state, 'uncertain');
  assert.equal((await f.write(url, 'POST', { title: 'test' }, operationId)).status, 409);
  assert.equal((await f.write(`/uploads/${uploadId}/commit`, 'POST', {})).status, 409);
  assert.equal(f.calls.length, 0); assert.equal(f.uploads.length, 0);
});

test('tunnel URLs are strictly parsed, registration retries and only exited tunnels restart', async t => {
  const f = await fixture(t);
  const children = [], registrations = [];
  let unavailable = false;
  f.relay.dependencies.cloudflaredPath = process.execPath;
  f.relay.tunnelOwner = {
    prepare: async (executable, port) => ({ record: { nonce: randomUUID() }, args: ['tunnel', '--no-autoupdate', '--url', `http://127.0.0.1:${port}`, '--protocol', 'http2'] }),
    capture: async () => {}, forget: async () => {}, cleanup: async () => {},
  };
  f.relay.dependencies.spawn = (executable, args, options) => {
    assert.equal(options.windowsHide, true);
    assert.ok(!JSON.stringify(args).includes(key));
    const child = new EventEmitter(); child.stdout = new PassThrough(); child.stderr = new PassThrough();
    child.kill = () => child.emit('exit', 0);
    children.push(child); return child;
  };
  f.relay.readConfig = async () => ({ ingestToken: token, sitesToken: 'isolated-sites-token', siteUrl: 'https://fixture.example' });
  f.relay.cloud = async (url, options) => {
    registrations.push({ url: String(url), body: JSON.parse(options.body) });
    assert.equal(options.headers.Authorization, `Bearer ${token}`);
    assert.equal(options.headers['OAI-Sites-Authorization'], 'Bearer isolated-sites-token');
    if (unavailable) throw new Error('offline');
    return { ok: true, status: 200 };
  };
  await f.relay.startTunnel();
  children[0].stderr.write('https://not-a-relay.trycloudflare.com.attacker.invalid\n');
  assert.equal(f.relay.relayUrl, null);
  children[0].stderr.write('Your quick Tunnel https://quiet-field.trycloudflare.com |\n');
  await pause(20);
  assert.equal(f.relay.getStatus().registered, true);
  assert.deepEqual(registrations.at(-1).body, { deviceId: f.relay.deviceId, relayUrl: 'https://quiet-field.trycloudflare.com' });
  assert.equal(registrations.at(-1).url, 'https://fixture.example/api/local-apps/registration');
  assert.ok(!JSON.stringify(f.relay.getStatus()).includes(key));
  unavailable = true; await f.relay.heartbeat(); assert.equal(f.relay.getStatus().registered, false);
  assert.equal(children.length, 1);
  unavailable = false; await f.relay.heartbeat(); assert.equal(f.relay.getStatus().registered, true);
  children[0].emit('exit', 1); assert.equal(f.relay.relayUrl, null);
  await f.relay.startTunnel(); assert.equal(children.length, 2);
  children[1].stderr.write(' https://new-field.trycloudflare.com |\n');
  await pause(20); assert.equal(registrations.at(-1).body.relayUrl, 'https://new-field.trycloudflare.com');
});

test('stopping during asynchronous ownership preparation cannot launch a late orphan tunnel', async t => {
  const f = await fixture(t);
  let prepared, release, spawns = 0, forgotten = 0;
  const entered = new Promise(resolve => { prepared = resolve; });
  const pending = new Promise(resolve => { release = resolve; });
  f.relay.dependencies.cloudflaredPath = process.execPath;
  f.relay.dependencies.spawn = () => { spawns++; throw new Error('Must not launch after stopping'); };
  f.relay.tunnelOwner = {
    prepare: async () => { prepared(); await pending; return { record: { nonce: randomUUID() }, args: [] }; },
    forget: async () => { forgotten++; }, cleanup: async () => {},
  };
  const starting = f.relay.startTunnel();
  await entered; await f.relay.stop(); release(); await starting;
  assert.equal(spawns, 0); assert.equal(forgotten, 1); assert.equal(f.relay.tunnel, null);
});
