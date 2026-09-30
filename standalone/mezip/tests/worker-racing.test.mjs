// Copy this file into the site's tests/ folder. Outside the site, set
// MEZIP_SITE_ROOT. RACING_WORKER_ENTRY=dist/server/index.js exercises the exact
// bundled Worker used by the local HTTP preview instead of its source module.
import test from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readdirSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

function findRoot() {
  if (process.env.MEZIP_SITE_ROOT) return path.resolve(process.env.MEZIP_SITE_ROOT);
  let directory = path.dirname(fileURLToPath(import.meta.url));
  while (true) {
    if (existsSync(path.join(directory, 'server/index.mjs')) && existsSync(path.join(directory, 'drizzle'))) return directory;
    const parent = path.dirname(directory); if (parent === directory) throw new Error('Set MEZIP_SITE_ROOT'); directory = parent;
  }
}
const root = findRoot(), origin = 'https://racing-guest.example.test';
const { default: worker } = await import(pathToFileURL(path.join(root, process.env.RACING_WORKER_ENTRY || 'server/index.mjs')));
const { SqliteD1 } = await import(pathToFileURL(path.join(root, 'tests/helpers/racing-d1.mjs')));

function fixture(t, configuredAccount = false) {
  const DB = new SqliteD1();
  const migrations = readdirSync(path.join(root, 'drizzle')).filter(name => name.endsWith('.sql')).sort();
  assert.ok(migrations.length);
  for (const migration of migrations) DB.exec(readFileSync(path.join(root, 'drizzle', migration), 'utf8'));
  t.after(() => DB.close());
  const external = t.mock.method(globalThis, 'fetch', async () => { throw new Error('No external network in the full Worker guest test'); });
  const env = { DB, PUBLIC_BASE_URL: origin, ASSETS: { fetch: async () => new Response('Static fallback must not handle racing API', { status: 404 }) },
    ...(configuredAccount ? { AUTH_PROVIDER: 'chatgpt', AUTH_SECRET: 'test-only-placeholder-not-a-live-secret' } : {}) };
  async function call(route, body, token) {
    const headers = { Origin: origin, Accept: 'application/json' };
    if (body !== undefined) { headers['Content-Type'] = 'application/json'; headers['Idempotency-Key'] = crypto.randomUUID(); }
    if (token) headers.Authorization = 'Bearer ' + token;
    const response = await worker.fetch(new Request(origin + route, { method: body === undefined ? 'GET' : 'POST', headers,
      ...(body === undefined ? {} : { body: JSON.stringify(body) }) }), env, {});
    assert.equal(external.mock.callCount(), 0);
    return { status: response.status, body: await response.json(), headers: response.headers };
  }
  return { DB, call };
}

test('full Worker guest racing is routed before account setup and never creates a site account', async t => {
  const f = fixture(t);
  const created = await f.call('/api/racing/rooms', { name: 'Guest host', trackId: 'lagunaSeca' });
  assert.equal(created.status, 201, 'racing works without AUTH_SECRET or account cookies');
  assert.equal(created.headers.get('Set-Cookie'), null);
  const owner = created.body, route = `/api/racing/rooms/${owner.room.id}`;
  const joined = await f.call(route + '/join', { name: 'Guest friend' });
  assert.equal(joined.status, 200); assert.equal(joined.body.room.id, owner.room.id);
  assert.equal(joined.body.room.players.filter(p => !p.isBot).length, 2);
  assert.equal((await f.call(route + '/start', {}, joined.body.token)).status, 403);
  assert.equal((await f.call(route + '/start', {}, owner.token)).body.room.status, 'countdown');
  const control = await f.call(route + '/control', { mode: 'ai' }, joined.body.token);
  assert.equal(control.status, 409);
  assert.equal(control.body.error, 'human_driving_required');
  const manual = await f.call(route + '/control', { mode: 'human' }, joined.body.token);
  assert.equal(manual.status, 200);
  assert.equal(manual.body.room.players.find(p => p.id === joined.body.playerId).control, 'human');
  assert.equal((await f.call(route + '/heartbeat', {}, '0'.repeat(64))).status, 401);
  const publicRoom = await f.call(route); assert.equal(publicRoom.status, 200);
  assert.equal(publicRoom.headers.get('Cache-Control'), 'no-store');
  const publicText = JSON.stringify(publicRoom.body);
  for (const secret of [owner.token, joined.body.token, 'authHash', 'joinKeyHash']) assert.ok(!publicText.includes(secret));
  assert.equal(f.DB.sqlite.prepare('SELECT COUNT(*) AS n FROM users').get().n, 0);
  assert.equal(f.DB.sqlite.prepare('SELECT COUNT(*) AS n FROM sessions').get().n, 0);
  assert.equal((await f.call('/api/account/saves')).status, 503, 'unconfigured private account API remains protected');
});

test('full Worker configured account stays private while the room remains public to WeChat guests', async t => {
  const f = fixture(t, true);
  assert.equal((await f.call('/api/account/saves')).status, 401);
  const session = await f.call('/api/auth/session'); assert.equal(session.status, 200); assert.equal(session.body.authenticated, false);
  const created = await f.call('/api/racing/rooms', { name: 'WeChat guest', trackId: 'apexCircuit' });
  assert.equal(created.status, 201);
  const token = created.body.token;
  assert.equal((await f.call('/api/account/saves', undefined, token)).status, 401, 'a room bearer cannot authenticate an account');
  assert.equal((await f.call(`/api/racing/rooms/${created.body.room.id}`)).status, 200);
  assert.equal((await f.call('/api/auth/session')).body.authenticated, false);
});
