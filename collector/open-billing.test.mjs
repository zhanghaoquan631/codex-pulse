import test from 'node:test';
import assert from 'node:assert/strict';
import { EventEmitter } from 'node:events';
import { Readable } from 'node:stream';
import { mkdtemp, rm } from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import { openChromeBilling } from './open-billing.mjs';
import { GoogleTools } from './google-tools.mjs';
import { AppsRelay, deriveRelayKey } from './apps-relay.mjs';
import { billingProfile } from '../integration/local-apps/billing-profiles.mjs';
import { resolveRelayRoute } from '../integration/local-apps/relay-policy.mjs';

const accounts = [
  ['account4@example.com', 'Default', '您的 Chrome'],
  ['account3@example.com', 'Profile 1', 'haoquan'],
  ['account7@example.com', 'Profile 2', 'Lenct'],
  ['account5@example.com', 'Profile 3', 'token'],
  ['account2@example.com', 'Profile 4', '好'],
  ['account6@example.com', 'Profile 9', '这'],
];
const endpoint = email => `/relay/identity/open-billing?email=${encodeURIComponent(email)}`;
function fakeLauncher(calls, outcome = 'spawn') {
  return (...args) => {
    calls.push(args);
    const child = new EventEmitter();
    child.unref = () => { child.unreferenced = true; };
    queueMicrotask(() => child.emit(outcome, outcome === 'error' ? new Error('private fixture launch details') : undefined));
    return child;
  };
}
const environment = { ProgramFiles: 'C:\\Program Files', 'ProgramFiles(x86)': 'C:\\Program Files (x86)', LOCALAPPDATA: 'C:\\Users\\your-user\\AppData\\Local' };
const absent = () => { throw Object.assign(new Error('fixture not installed'), { code: 'ENOENT' }); };

test('all six emails select only their authorized profile and the fixed official billing URL', async () => {
  const calls = [], inspected = [];
  for (const [email, directory, label] of accounts) {
    const result = await openChromeBilling(email.toUpperCase(), { platform: 'win32', environment,
      stat: async executable => { inspected.push(executable); return { isFile: () => true }; }, spawn: fakeLauncher(calls) });
    assert.deepEqual(result, { email, profileLabel: label, expectedEmail: email, opened: true });
    assert.deepEqual(calls.at(-1), ['C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
      [`--profile-directory=${directory}`, 'https://chatgpt.com/settings/billing'],
      { shell: false, windowsHide: true, detached: true, stdio: 'ignore' }]);
    assert.deepEqual(billingProfile(email), { directory, label });
  }
  assert.equal(inspected.length, 6);
  for (const invalid of ['fixture@gmail.com', 'a147@gmail.com', 'a14735869706@googlemail.com', '__proto__', '', null]) {
    assert.equal(billingProfile(invalid), null);
    await assert.rejects(openChromeBilling(invalid, { stat: () => assert.fail('must not inspect files'), spawn: () => assert.fail('must not launch') }), { status: 403 });
  }
  assert.equal(calls.length, 6);
});

test('only official installation candidates are checked; missing, non-Windows, and launch failures cannot return success', async () => {
  const email = accounts[4][0], inspected = [], calls = [];
  const result = await openChromeBilling(email, { platform: 'win32', environment,
    stat: async file => { inspected.push(file); if (inspected.length < 3) absent(); return { isFile: () => true }; },
    spawn: fakeLauncher(calls) });
  assert.equal(result.opened, true);
  assert.deepEqual(inspected, ['C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
    'C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe',
    'C:\\Users\\your-user\\AppData\\Local\\Google\\Chrome\\Application\\chrome.exe']);
  const mustNotLaunch = () => assert.fail('must not launch');
  await assert.rejects(openChromeBilling(email, { platform: 'linux', stat: mustNotLaunch, spawn: mustNotLaunch }), /需要原电脑上的 Windows Chrome/);
  await assert.rejects(openChromeBilling(email, { platform: 'win32', environment, stat: absent, spawn: mustNotLaunch }), /未找到 Chrome/);
  await assert.rejects(openChromeBilling(email, { platform: 'win32', environment, stat: async () => ({ isFile: () => false }), spawn: mustNotLaunch }), /未找到 Chrome/);
  await assert.rejects(openChromeBilling(email, { platform: 'win32', environment,
    stat: async () => { throw Object.assign(new Error('private path'), { code: 'EACCES' }); }, spawn: mustNotLaunch }), /检查文件权限/);
  const inspect = async () => ({ isFile: () => true });
  await assert.rejects(openChromeBilling(email, { platform: 'win32', environment, stat: inspect, spawn: fakeLauncher([], 'error') }), { status: 503, message: '未能启动对应的 Chrome 个人资料，请在原电脑检查 Chrome 后重试。' });
  await assert.rejects(openChromeBilling(email, { platform: 'win32', environment, stat: inspect, spawn: () => { throw new Error('private path'); } }), /未能启动对应的 Chrome/);
});

test('relay policy allows only POST for an exact authorized email and rejects caller-chosen URL/profile', () => {
  for (const [email] of accounts) {
    const route = resolveRelayRoute('POST', endpoint(email));
    assert.equal(route.app, 'identity'); assert.equal(route.write, true); assert.equal(route.maxBodyBytes, 4096);
    for (const method of ['GET', 'HEAD', 'PUT', 'PATCH', 'DELETE']) assert.equal(resolveRelayRoute(method, endpoint(email)), null);
  }
  for (const value of [endpoint('fixture@gmail.com'), endpoint('a14735869706@googlemail.com'),
    `${endpoint(accounts[4][0])}&email=${accounts[0][0]}`, `${endpoint(accounts[4][0])}&url=https://attacker.invalid`,
    `${endpoint(accounts[4][0])}&profile=Default`, '/relay/identity/open-billing',
    endpoint('a147'), '/relay/identity/open-billing/extra?email=account2@example.com'])
    assert.equal(resolveRelayRoute('POST', value), null);
  assert.equal(resolveRelayRoute('GET', '/relay/identity/status?email=fixture@gmail.com').app, 'identity');
  assert.equal(resolveRelayRoute('POST', '/relay/booking/book').app, 'booking');
});

async function handle(tools, method, url, body = '') {
  const request = Readable.from(body ? [Buffer.from(body)] : []); request.method = method;
  let status, headers, value;
  const response = { writeHead: (code, input) => { status = code; headers = input; }, end: data => { value = JSON.parse(data); } };
  await tools.handle(request, response, new URL(url, 'http://127.0.0.1'));
  return { status, headers, value };
}

test('GoogleTools opening never reads Gmail vault and rejects extra input or launcher errors', async () => {
  const calls = [], email = accounts[4][0];
  const tools = new GoogleTools('synthetic-unused-directory', { codec: () => assert.fail('must not read credentials'),
    gmail: () => assert.fail('must not read Gmail'), openBilling: async value => { calls.push(value); return { email: value, opened: true, expectedEmail: value, profileLabel: '好' }; } });
  for (const body of ['', '{}']) { const response = await handle(tools, 'POST', endpoint(email), body); assert.equal(response.status, 200); assert.equal(response.value.expectedEmail, email); assert.equal(response.headers['Cache-Control'], 'no-store, private'); }
  for (const [method, url, body, expected] of [
    ['GET', endpoint(email), '', 405], ['POST', endpoint('fixture@gmail.com'), '', 403],
    ['POST', `${endpoint(email)}&email=${accounts[0][0]}`, '', 403], ['POST', `${endpoint(email)}&profile=Default`, '', 403],
    ['POST', endpoint(email), '{"url":"https://attacker.invalid"}', 400], ['POST', endpoint(email), '{"profile":"Default"}', 400],
    ['POST', endpoint(email), 'null', 400], ['POST', endpoint(email), '[]', 400], ['POST', endpoint(email), '{', 400],
    ['POST', endpoint(email), ' '.repeat(4097), 413],
  ]) { const response = await handle(tools, method, url, body); assert.equal(response.status, expected); assert.equal(response.value.opened, undefined); }
  assert.deepEqual(calls, [email, email]);
  const broken = new GoogleTools('synthetic-unused-directory', { openBilling: async () => { throw new Error('private exception with path or credentials'); } });
  const response = await handle(broken, 'POST', endpoint(email));
  assert.equal(response.status, 503); assert.equal(response.value.opened, undefined); assert.match(response.value.error, /未能启动对应的 Chrome/); assert.ok(!response.value.error.includes('private'));
});

test('new billing action retains the HMAC boundary and does not create receipts or read credentials', async t => {
  const root = await mkdtemp(path.join(os.tmpdir(), 'pulse-billing-relay-test-'));
  const token = 'synthetic-billing-relay-token', calls = [], email = accounts[4][0];
  const relay = new AppsRelay(root, '', { disableTunnel: true, listenPort: 0,
    deviceId: '12345678-1234-4234-8234-123456789012', readConfig: async () => ({ ingestToken: token }),
    googleTools: { codec: () => assert.fail('must not read credentials'), gmail: () => assert.fail('must not read Gmail'),
      openBilling: async value => { calls.push(value); return { email: value, opened: true, expectedEmail: value, profileLabel: '好' }; } },
    createFinanceStorage: () => ({ startImportServer: async () => {}, stop: async () => {}, handle: async () => {} }) });
  relay.checkHealth = async () => {}; // No real applications, ports, or browsers in this fixture.
  await relay.start();
  t.after(async () => { await relay.stop(); assert.ok(path.resolve(root).startsWith(path.resolve(os.tmpdir()) + path.sep) && path.basename(root).startsWith('pulse-billing-relay-test-')); await rm(root, { recursive: true, force: true }); });
  const url = `http://127.0.0.1:${relay.port}${endpoint(email)}`;
  assert.equal((await fetch(url, { method: 'POST', body: '{}' })).status, 403);
  assert.equal((await fetch(url, { method: 'POST', headers: { 'X-Pulse-Relay-Key': '0'.repeat(64) }, body: '{}' })).status, 403);
  const headers = { 'X-Pulse-Relay-Key': deriveRelayKey(token) };
  assert.equal((await fetch(url, { headers })).status, 404);
  assert.equal((await fetch(url.replace(encodeURIComponent(email), 'fixture%40gmail.com'), { method: 'POST', headers, body: '{}' })).status, 404);
  const response = await fetch(url, { method: 'POST', headers, body: '{}' });
  assert.equal(response.status, 200); assert.deepEqual(await response.json(), { email, opened: true, expectedEmail: email, profileLabel: '好' });
  assert.deepEqual(calls, [email]); assert.equal(relay.db.prepare('SELECT COUNT(*) n FROM operations').get().n, 0);
});
