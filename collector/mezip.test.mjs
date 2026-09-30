import assert from 'node:assert/strict';
import { test } from 'node:test';
import { mkdtemp, rm } from 'node:fs/promises';
import { createHash, randomUUID } from 'node:crypto';
import os from 'node:os';
import path from 'node:path';
import { MezipCollector } from './mezip.mjs';

const config = { siteUrl: 'https://pulse.example.test', ingestToken: 'test-ingest', sitesToken: 'test-sites' };
const success = commands => new Response(JSON.stringify({ ok: true, commands: commands.map(command => ({ expires: Date.now() + 60000, ...command })) }), { status: 200, headers: { 'Content-Type': 'application/json' } });

async function fixture(t, overrides = {}) {
  const directory = await mkdtemp(path.join(os.tmpdir(), 'pulse-mezip-test-'));
  const received = [], calls = [], queue = [];
  const dependencies = {
    readConfig: async () => config,
    ensureBackend: async () => ({ online: true, state: 'connected' }),
    requestLocal: async (method, requestPath, body) => { calls.push({ method, path: requestPath, body }); return { status: 200, body: { data: { saved: true } } }; },
    fetchCloud: async (url, options) => { received.push({ url, options, body: JSON.parse(options.body) }); return success(queue.shift() || []); },
    ...overrides,
  };
  const collector = new MezipCollector(directory, 'unused-test-config', dependencies);
  t.after(async () => { await collector.stop(); await rm(directory, { recursive: true, force: true }); });
  return { collector, directory, dependencies, calls, received, queue };
}

test('offline cloud retries keep completed writes and reconnect without another write', async t => {
  let fail = false; const delivered = []; let writes = 0;
  const command = { id: randomUUID(), method: 'POST', path: '/v1/resources/records', body: { url: 'https://example.test/article' } };
  const { collector } = await fixture(t, {
    requestLocal: async () => { writes++; return { status: 201, body: { data: { id: 'test-record' } } }; },
    fetchCloud: async (url, options) => {
      if (fail) throw new Error('network unavailable');
      delivered.push(JSON.parse(options.body));
      return success(delivered.length === 1 ? [command] : []);
    },
  });
  await collector.poll(); assert.equal(writes, 1); assert.equal(collector.status.pendingResults, 1);
  fail = true;
  await collector.poll(); assert.equal(collector.status.retryInMs, 4000);
  await collector.poll(); assert.equal(collector.status.retryInMs, 8000);
  await collector.poll(); await collector.poll(); await collector.poll();
  assert.equal(collector.status.retryInMs, 30000); assert.equal(collector.status.pendingResults, 1);
  fail = false; await collector.poll();
  assert.equal(writes, 1); assert.equal(collector.status.state, 'connected'); assert.equal(collector.status.retryInMs, 2000);
  assert.equal(delivered.at(-1).results[0].id, command.id); assert.equal(delivered.at(-1).results[0].status, 201);
  assert.equal(collector.status.pendingResults, 0);
});

test('a repeated cloud lease returns the durable receipt after collector restart', async t => {
  const f = await fixture(t);
  const command = { id: randomUUID(), method: 'PATCH', path: '/v1/resources/records/record_1', body: { liked: true } };
  f.queue.push([command]); await f.collector.poll(); const deviceId = f.collector.deviceId;
  await f.collector.stop();
  const restarted = new MezipCollector(f.directory, 'unused-test-config', f.dependencies);
  t.after(() => restarted.stop());
  f.queue.push([command]); await restarted.poll(); await restarted.poll();
  assert.equal(f.calls.length, 1); assert.equal(restarted.deviceId, deviceId);
  assert.equal(f.received.at(-1).body.results[0].id, command.id);
  await restarted.stop();
});

test('a crash between sending a write and saving its response never repeats the write', async t => {
  const f = await fixture(t); await f.collector.initialize();
  const command = { id: randomUUID(), method: 'POST', path: '/v1/resources/records/record_1/open', body: { source: 'reading' } };
  const fingerprint = createHash('sha256').update(JSON.stringify([command.method, command.path, JSON.stringify(command.body)])).digest('hex');
  f.collector.db.prepare("INSERT INTO commands(id,fingerprint,method,state,updated) VALUES (?,?,?,'running',?)").run(command.id, fingerprint, command.method, Date.now());
  await f.collector.stop();
  const restarted = new MezipCollector(f.directory, 'unused-test-config', f.dependencies);
  t.after(() => restarted.stop());
  f.queue.push([command]); await restarted.poll(); await restarted.poll();
  assert.equal(f.calls.length, 0);
  const result = f.received.at(-1).body.results[0];
  assert.equal(result.status, 409); assert.equal(result.body.code, 'MEZIP_RESULT_UNCERTAIN');
  await restarted.stop();
});

test('lost local write response is reported as uncertain and not retried', async t => {
  let attempts = 0;
  const f = await fixture(t, { requestLocal: async () => { attempts++; throw new Error('response lost after commit'); } });
  const command = { id: randomUUID(), method: 'DELETE', path: '/v1/resources/records/record_1' };
  f.queue.push([command], [command], []);
  await f.collector.poll(); await f.collector.poll(); await f.collector.poll();
  assert.equal(attempts, 1); assert.equal(f.received.at(-1).body.results[0].status, 409);
});

test('arbitrary destinations, traversal, unsupported APIs and command ID reuse never call local transport', async t => {
  const f = await fixture(t);
  const paths = ['http://example.test/v1/resources/records', '//example.test/v1/resources/records', '/v1/resources/%2e%2e/records', '/v1/resources/../records', '/v1/x/local-capture/private-library?limit=1&url=http://example.test', '/v1/watch/records'];
  f.queue.push(paths.map(requestPath => ({ id: randomUUID(), method: 'POST', path: requestPath, body: {} })));
  await f.collector.poll(); await f.collector.poll();
  assert.equal(f.calls.length, 0); assert.equal(f.received.at(-1).body.results.length, paths.length);
  assert.ok(f.received.at(-1).body.results.every(result => result.status === 403));
  const id = randomUUID();
  f.queue.push([{ id, method: 'GET', path: '/v1/resources/records' }], [{ id, method: 'DELETE', path: '/v1/resources/records/record_1' }], []);
  await f.collector.poll(); await f.collector.poll(); await f.collector.poll();
  assert.equal(f.calls.length, 1); assert.equal(f.received.at(-1).body.results[0].body.code, 'MEZIP_COMMAND_CONFLICT');
});

test('backend reconnection changes heartbeat automatically and production cloud credentials never go to local API', async t => {
  let online = false;
  const f = await fixture(t, { ensureBackend: async () => ({ online, state: online ? 'connected' : 'starting' }) });
  await f.collector.poll();
  assert.equal(f.received[0].body.online, false); assert.equal(f.collector.status.state, 'waiting-for-local-service');
  online = true; f.queue.push([{ id: randomUUID(), method: 'GET', path: '/v1/x/local-capture/health' }]);
  await f.collector.poll();
  const sent = f.received.at(-1);
  assert.equal(sent.body.online, true); assert.equal(f.collector.status.state, 'connected');
  assert.equal(sent.options.redirect, 'error'); assert.equal(sent.url.toString(), 'https://pulse.example.test/api/mezip/bridge');
  assert.equal(sent.options.headers.Authorization, 'Bearer test-ingest');
  assert.equal(sent.options.headers['OAI-Sites-Authorization'], 'Bearer test-sites');
  assert.deepEqual(Object.keys(sent.body).sort(), ['deviceId', 'online', 'results']);
  assert.equal(f.calls[0].body, undefined);
});

test('GET requests run concurrently while mutations remain in their ordered barriers', async t => {
  const order = []; let releaseReads;
  const readsReady = new Promise(resolve => { releaseReads = resolve; });
  let readCount = 0;
  const f = await fixture(t, { requestLocal: async (method, requestPath) => {
    order.push(`start:${requestPath}`);
    if (method === 'GET') { if (++readCount === 2) releaseReads(); await readsReady; }
    order.push(`end:${requestPath}`); return { status: 200, body: { data: {} } };
  } });
  f.queue.push([
    { id: randomUUID(), method: 'GET', path: '/v1/resources/records/one' },
    { id: randomUUID(), method: 'GET', path: '/v1/resources/records/two' },
    { id: randomUUID(), method: 'PATCH', path: '/v1/resources/records/one', body: { liked: true } },
    { id: randomUUID(), method: 'DELETE', path: '/v1/resources/records/two' },
  ]);
  await f.collector.poll();
  assert.deepEqual(order.slice(0, 2), ['start:/v1/resources/records/one', 'start:/v1/resources/records/two']);
  assert.ok(order.indexOf('end:/v1/resources/records/two') < order.lastIndexOf('start:/v1/resources/records/one'));
  assert.deepEqual(order.slice(-4), ['start:/v1/resources/records/one', 'end:/v1/resources/records/one', 'start:/v1/resources/records/two', 'end:/v1/resources/records/two']);
});

test('a queued write that expires while waiting for earlier work never starts', async t => {
  let time = Date.now(); const calls = [];
  const f = await fixture(t, { now: () => time, requestLocal: async (method, requestPath) => {
    calls.push({ method, requestPath }); time += 61000; return { status: 200, body: { data: {} } };
  } });
  f.queue.push([
    { id: randomUUID(), method: 'GET', path: '/v1/resources/records', expires: time + 60000 },
    { id: randomUUID(), method: 'DELETE', path: '/v1/resources/records/record_1', expires: time + 60000 },
  ]);
  await f.collector.poll(); await f.collector.poll();
  assert.equal(calls.length, 1); assert.equal(calls[0].method, 'GET');
  const expired = f.received.at(-1).body.results.find(result => result.status === 408);
  assert.equal(expired.body.code, 'MEZIP_COMMAND_EXPIRED');
});
