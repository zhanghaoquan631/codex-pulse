import assert from 'node:assert/strict';
import { once } from 'node:events';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { configuredResetMailer, createResetMailer } from '../server/reset-mail.js';
import { createApp } from '../server/index.js';

const ORIGIN = 'https://shop.example.test';
const event = (id, status = 'announced') => ({ id, status, type: 'direct_reset', title: `重置 ${id}` });
async function fixture(t) {
  const dir = await mkdtemp(path.join(os.tmpdir(), 'seller-mail-test-'));
  let time = Date.parse('2026-09-19T00:00:00Z'), events = [event('old', 'confirmed')], stale = false, feedFailure = false, mailFailure = false;
  const delivered = [], attempted = [];
  const feed = async () => {
    if (feedFailure) throw new Error('Upstream unavailable');
    return { checkedAt: new Date(time).toISOString(), stale, events: structuredClone(events) };
  };
  const options = {
    storePath: path.join(dir, 'subscriptions.json'), origin: ORIGIN,
    from: { name: '测试店铺', address: 'sender@example.test' }, now: () => time, feed,
    transport: { async sendMail(message) {
      attempted.push(message);
      if (mailFailure) throw new Error('secret-provider-response recipient@example.test');
      delivered.push(message); return { accepted: [message.to] };
    } },
  };
  let mail = await createResetMailer(options);
  t.after(async () => { mail.stop(); await rm(dir, { recursive: true, force: true }); });
  const token = () => new URL(delivered.findLast((m) => m.subject.includes('请确认')).text.match(/https:\/\/[^\s]+/)[0]).searchParams.get('token');
  async function activate(email = 'buyer@example.test') { await mail.subscribe(email); await mail.confirm(token()); }
  return {
    dir, options, feed, attempted, delivered, token, activate,
    get mail() { return mail; },
    read: async () => JSON.parse(await readFile(options.storePath, 'utf8')),
    advance(ms) { time += ms; }, events(value) { events = value; }, stale(value) { stale = value; },
    feedFailure(value) { feedFailure = value; }, mailFailure(value) { mailFailure = value; },
    async restart() { mail.stop(); mail = await createResetMailer(options); return mail; },
  };
}

test('mail stays disabled without opt-in and refuses unsafe origin/missing credentials without sending', async () => {
  assert.equal((await configuredResetMailer({ env: {} })).enabled, false);
  for (const origin of ['https://x.test/route', 'http://public.test', 'https://user:pass@x.test', 'https://x.test/?secret=yes', 'not-url']) {
    await assert.rejects(configuredResetMailer({ env: { MAIL_ENABLED: 'true', PUBLIC_ORIGIN: origin } }), /PUBLIC_ORIGIN/);
  }
  await assert.rejects(configuredResetMailer({ env: { MAIL_ENABLED: 'true', PUBLIC_ORIGIN: ORIGIN } }), /SMTP_USER/);
});

test('double opt-in, normalization, no historical burst, restart durability, event/status dedupe and regression', async (t) => {
  const f = await fixture(t);
  await f.mail.subscribe(' Buyer@Example.test ');
  assert.equal(f.delivered[0].to, 'buyer@example.test');
  const secret = f.token();
  let disk = await f.read();
  assert.equal(disk.subscribers[0].status, 'pending');
  assert.ok(!JSON.stringify(disk).includes(secret));
  await f.mail.tick();
  assert.equal(f.delivered.length, 1);
  await f.mail.confirm(secret);
  await assert.rejects(f.mail.confirm(secret), /过期/);
  await f.mail.tick();
  assert.equal(f.delivered.length, 1, 'old calendar events must never be bulk mailed');
  await f.restart();
  f.events([event('old', 'confirmed'), event('new')]);
  await Promise.all([f.mail.tick(), f.mail.tick(), f.mail.tick()]);
  assert.equal(f.delivered.length, 2);
  assert.match(f.delivered[1].subject, /预告/);
  assert.ok(!JSON.stringify(f.delivered[1]).includes('confirmHash'));
  await f.mail.tick();
  assert.equal(f.delivered.length, 2);
  f.events([event('old', 'confirmed'), event('new', 'confirmed')]);
  await f.mail.tick();
  assert.equal(f.delivered.length, 3);
  assert.match(f.delivered[2].subject, /已重置/);
  f.events([event('old'), event('new')]);
  await f.mail.tick();
  assert.equal(f.delivered.length, 3, 'upstream status regressions do not cause another alert');
  disk = await f.read();
  assert.equal(disk.outbox.filter((job) => job.state === 'sent').length, 2);
});

test('duplicate and concurrent requests send one confirmation, bad addresses and expired tokens fail', async (t) => {
  const f = await fixture(t);
  for (const value of ['', '<test@example.test>', 'a@example.test\r\nBcc:evil@example.test', 'a@@x.test', '.a@x.test', 'a..b@x.test', ['a@x.test']]) {
    await assert.rejects(f.mail.subscribe(value), /邮箱/);
  }
  await Promise.all([f.mail.subscribe('a@example.test'), f.mail.subscribe('A@EXAMPLE.TEST')]);
  assert.equal(f.delivered.length, 1);
  const original = f.token();
  await f.mail.subscribe('a@example.test');
  assert.equal(f.delivered.length, 1);
  f.advance(25 * 3600000);
  await assert.rejects(f.mail.confirm(original), /过期/);
  await f.mail.subscribe('a@example.test');
  assert.equal(f.delivered.length, 2);
  await f.mail.confirm(f.token());
  await f.mail.subscribe('a@example.test');
  assert.equal(f.delivered.length, 2, 'active addresses are not spammed with repeated confirmation');
});

test('failed confirmation is truthful; queued events retry after restart even if feed is down', async (t) => {
  const f = await fixture(t);
  f.mailFailure(true);
  await assert.rejects(f.mail.subscribe('buyer@example.test'), /暂时无法发送/);
  assert.equal((await f.read()).subscribers[0].status, 'pending');
  f.advance(600001); f.mailFailure(false);
  await f.activate();
  f.events([event('old', 'confirmed'), event('new')]);
  f.mailFailure(true);
  await f.mail.tick();
  let disk = await f.read();
  assert.equal(disk.outbox[0].state, 'pending');
  assert.equal(disk.outbox[0].attempts, 1);
  assert.equal(disk.outbox[0].lastError, 'SMTP_FAILED');
  assert.ok(!JSON.stringify(disk).includes('secret-provider-response'));
  await f.restart();
  f.advance(60001); f.mailFailure(false); f.feedFailure(true);
  await assert.rejects(f.mail.tick(), /Upstream/);
  disk = await f.read();
  assert.equal(disk.outbox[0].state, 'sent');
  assert.equal(disk.outbox[0].attempts, 2);
  const attempts = f.attempted.filter((message) => message.messageId);
  assert.equal(attempts[0].messageId, attempts[1].messageId);
});

test('stale feeds never confirm users or enqueue events; each joining subscriber skips their baseline', async (t) => {
  const f = await fixture(t);
  await f.activate('first@example.test');
  f.events([event('old', 'confirmed'), event('new')]);
  await f.mail.subscribe('second@example.test');
  f.stale(true);
  await assert.rejects(f.mail.confirm(f.token()), /暂不可用/);
  await assert.rejects(f.mail.tick(), /暂不可用/);
  assert.equal((await f.read()).outbox.length, 0);
  f.stale(false);
  await f.mail.confirm(f.token());
  await f.mail.tick();
  const notifications = f.delivered.filter((mail) => mail.messageId);
  assert.equal(notifications.length, 1);
  assert.equal(notifications[0].to, 'first@example.test');
});

test('unsubscribe tokens are unforgeable, survive restarts, remove personal data and pending jobs', async (t) => {
  const f = await fixture(t);
  await f.activate(); f.events([event('new')]); await f.mail.tick();
  const url = new URL(f.delivered.at(-1).text.match(/https:\/\/[^\s]+unsubscribe[^\s]+/)[0]);
  const token = url.searchParams.get('token');
  await assert.rejects(f.mail.unsubscribe(token.slice(0,-1) + (token.endsWith('0') ? '1' : '0')), /无效/);
  f.events([event('new', 'confirmed')]); f.mailFailure(true); await f.mail.tick();
  assert.equal((await f.read()).outbox.length, 2);
  await f.restart(); await f.mail.unsubscribe(token); await f.mail.unsubscribe(token);
  assert.equal((await f.read()).subscribers.length, 0);
  assert.equal((await f.read()).outbox.length, 0);
  assert.ok(!JSON.stringify(await f.read()).includes('buyer@example.test'));
  f.advance(3600000); f.mailFailure(false); await f.mail.tick();
  assert.equal(f.delivered.length, 2);
});

test('historical backfills are skipped, eight failures are visible and admin retry preserves the job identity', async (t) => {
  const f = await fixture(t); await f.activate();
  f.events([{ ...event('backfilled', 'confirmed'), createdAt: '2026-08-01T00:00:00Z', updatedAt: '2026-08-02T00:00:00Z' }, event('fresh')]);
  f.mailFailure(true);
  for (let i = 0; i < 8; i++) { await f.mail.tick(); f.advance(3600001); }
  assert.equal((await f.read()).outbox.length, 1);
  assert.equal(f.mail.status().failed, 1);
  assert.equal(f.mail.status().queued, 0);
  assert.equal(f.mail.status().confirmedSubscribers, 1);
  assert.ok(!JSON.stringify(f.mail.status()).includes('buyer@example.test'));
  const id = (await f.read()).outbox[0].id;
  await f.mail.retryFailed();
  assert.equal(f.mail.status().queued, 1);
  f.mailFailure(false); await f.mail.tick();
  assert.equal(f.mail.status().failed, 0);
  assert.equal((await f.read()).outbox[0].id, id);
  assert.equal((await f.read()).outbox[0].state, 'sent');
});

test('confirmation cooldown survives restart and daily cap blocks abuse', async (t) => {
  const f = await fixture(t);
  await f.mail.subscribe('first@example.test'); await f.restart();
  await f.mail.subscribe('first@example.test'); assert.equal(f.delivered.length, 1);
  for (let i = 1; i < 100; i++) await f.mail.subscribe(`test${i}@example.test`);
  await assert.rejects(f.mail.subscribe('excess@example.test'), (e) => e.status === 429);
  assert.equal(f.delivered.length, 100);
});

test('an existing announcement becoming confirmed notifies even when upstream timestamps stay old', async (t) => {
  const f = await fixture(t);
  const record = { ...event('known-preview'), createdAt: '2026-09-18T08:00:00Z', updatedAt: '2026-09-18T08:00:00Z', confirmedAt: null };
  f.events([record]); await f.activate();
  f.events([{ ...record, status: 'confirmed' }]);
  await f.mail.tick(); await f.mail.tick();
  assert.equal(f.delivered.filter((message) => message.messageId).length, 1);
  assert.match(f.delivered.at(-1).subject, /已重置/);
});

test('HTTP routes require POST confirmation, reject foreign origins, keep subscribers private and expose configured status', async (t) => {
  const f = await fixture(t);
  const app = await createApp({ storePath: path.join(f.dir, 'shop.json'), uploadsPath: path.join(f.dir, 'uploads'), adminPassword: 'mail-http-test-password', resetMailer: f.mail, calendarFeed: f.feed });
  const server = app.listen(0, '127.0.0.1'); await once(server, 'listening');
  t.after(async () => { server.closeAllConnections(); await new Promise((resolve) => server.close(resolve)); });
  const base = `http://127.0.0.1:${server.address().port}`;
  async function post(route, body, origin = base) { return fetch(base + route, { method: 'POST', headers: { 'Content-Type': 'application/json', Origin: origin }, body: JSON.stringify(body) }); }
  assert.equal((await (await fetch(base + '/api/reset-calendar')).json()).emailEnabled, true);
  assert.equal((await post('/api/codex-reset-subscribe', { email: 'buyer@example.test' }, 'https://evil.test')).status, 403);
  assert.equal((await post('/api/codex-reset-subscribe', { email: 'buyer@example.test', host: 'evil.test' })).status, 202);
  assert.ok(f.delivered[0].text.includes(ORIGIN)); assert.ok(!f.delivered[0].text.includes('evil.test'));
  const token = f.token();
  const get = await fetch(base + '/api/codex-reset-confirm?token=' + token);
  assert.equal(get.status, 200);
  assert.equal(get.headers.get('referrer-policy'), 'no-referrer');
  assert.ok(get.headers.get('content-security-policy').includes("form-action 'self'"));
  assert.match(await get.text(), /method="post"/);
  assert.equal((await f.read()).subscribers[0].status, 'pending', 'GET scanners do not opt users in');
  const form = await fetch(base + '/api/codex-reset-confirm', { method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded', Origin: base }, body: new URLSearchParams({ token }) });
  assert.equal(form.status, 200); assert.match(await form.text(), /订阅已确认/);
  assert.equal((await f.read()).subscribers[0].status, 'active');
  assert.equal((await post('/api/codex-reset-confirm', { token })).status, 400);
  const publicData = await (await fetch(base + '/api/storefront')).text();
  assert.ok(!publicData.includes('buyer@example.test')); assert.ok(!publicData.includes('subscribers'));
  assert.equal((await fetch(base + '/server/data/subscriptions.json')).status, 404);
  assert.equal((await fetch(base + '/api/admin/mail')).status, 401);
  assert.equal((await post('/api/admin/mail/retry', {})).status, 401);
  const login = await post('/api/auth/login', { password: 'mail-http-test-password' });
  const cookie = login.headers.get('set-cookie').split(';')[0];
  const status = await (await fetch(base + '/api/admin/mail', { headers: { Cookie: cookie } })).json();
  assert.equal(status.confirmedSubscribers, 1); assert.ok(!JSON.stringify(status).includes('buyer@example.test'));
  assert.equal((await fetch(base + '/api/admin/mail/retry', { method: 'POST', headers: { Origin: 'https://evil.test', Cookie: cookie } })).status, 403);
});

test('unconfigured HTTP subscription rejects without collecting addresses', async (t) => {
  const f = await fixture(t);
  const app = await createApp({ storePath: path.join(f.dir, 'disabled-shop.json'), uploadsPath: path.join(f.dir, 'uploads'), mailEnv: {} });
  const server = app.listen(0, '127.0.0.1'); await once(server, 'listening');
  t.after(async () => { server.closeAllConnections(); await new Promise((resolve) => server.close(resolve)); });
  const response = await fetch(`http://127.0.0.1:${server.address().port}/api/codex-reset-subscribe`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ email: 'buyer@example.test' }) });
  assert.equal(response.status, 503);
  assert.equal((await f.read()).subscribers.length, 0);
});
