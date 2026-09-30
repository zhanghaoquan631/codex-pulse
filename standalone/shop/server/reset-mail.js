import { createHash, createHmac, randomBytes, randomUUID, timingSafeEqual } from 'node:crypto';
import { mkdir, readFile, rename, unlink, writeFile } from 'node:fs/promises';
import path from 'node:path';
import nodemailer from 'nodemailer';
import { calendarFeed } from '../worker/calendar.js';

const HOUR = 3600000;
const hash = (value) => createHash('sha256').update(value).digest('hex');
const copy = (value) => structuredClone(value);
const fail = (status, message) => { throw Object.assign(new Error(message), { status, publicMessage: message }); };
const emailPattern = /^[a-z0-9.!#$%&'*+/=?^_`{|}~-]+@[a-z0-9](?:[a-z0-9-]*[a-z0-9])?(?:\.[a-z0-9](?:[a-z0-9-]*[a-z0-9])?)+$/i;
const validEmail = (value) => typeof value === 'string' && value.length <= 254 && emailPattern.test(value) && !value.split('@')[0].startsWith('.') && !value.includes('..');
const eventKey = (event) => JSON.stringify([event.id, event.status]);
const eventKeys = (events) => events.map(eventKey);
const eventTime = (event) => Math.max(...[event.confirmedAt, event.updatedAt, event.createdAt, ...(Array.isArray(event.posts) ? event.posts.map((post) => post.publishedAt) : [])].map(Date.parse).filter(Number.isFinite), 0);

async function atomicSave(file, data) {
  const temporary = `${file}.${process.pid}.${randomUUID()}.tmp`;
  try {
    await writeFile(temporary, JSON.stringify(data), { mode: 0o600 });
    await rename(temporary, file);
  } finally { await unlink(temporary).catch((e) => { if (e.code !== 'ENOENT') throw e; }); }
}

function publicOrigin(value) {
  let url;
  try { url = new URL(value); } catch { throw new Error('邮件通知需要有效的 PUBLIC_ORIGIN。'); }
  const local = url.protocol === 'http:' && ['localhost', '127.0.0.1', '[::1]'].includes(url.hostname);
  if ((url.protocol !== 'https:' && !local) || url.username || url.password || url.pathname !== '/' || url.search || url.hash) {
    throw new Error('PUBLIC_ORIGIN 必须是 HTTPS 网站根地址（本机测试可用 localhost）。');
  }
  return url.origin;
}

function checkedEvents(feed) {
  if (!feed || feed.stale || !Array.isArray(feed.events) || feed.events.length > 2000 || !Number.isFinite(Date.parse(feed.checkedAt))) {
    fail(503, '日历数据暂不可用，请稍后再试。');
  }
  return feed.events.filter((e) => e && typeof e.id === 'string' && e.id.length <= 200 && ['announced', 'confirmed'].includes(e.status) && ['direct_reset', 'reset_credit'].includes(e.type));
}

const disabled = Object.freeze({ enabled: false, start() {}, stop() {}, async tick() {}, status: () => ({ enabled: false }) });

// This transport is server-only. No booking credentials are read automatically.
export async function configuredResetMailer({ env = process.env, storePath, feed } = {}) {
  if (env.MAIL_ENABLED !== 'true') return disabled;
  const origin = publicOrigin(env.PUBLIC_ORIGIN);
  if (!validEmail(env.SMTP_USER) || !env.SMTP_PASS || ![465, 587].includes(Number(env.SMTP_PORT || 465))) {
    throw new Error('邮件通知需要 SMTP_USER、SMTP_PASS 及有效的 SMTP_PORT（465 或 587）。');
  }
  const transport = nodemailer.createTransport({
    host: env.SMTP_HOST || 'smtp.163.com', port: Number(env.SMTP_PORT || 465),
    secure: Number(env.SMTP_PORT || 465) === 465, requireTLS: true,
    auth: { user: env.SMTP_USER, pass: env.SMTP_PASS },
    connectionTimeout: 10000, greetingTimeout: 10000, socketTimeout: 20000,
    disableFileAccess: true, disableUrlAccess: true, logger: false, debug: false,
  });
  return createResetMailer({ storePath, origin, transport, from: { name: '店铺重置通知', address: env.SMTP_USER }, feed });
}

export async function createResetMailer({ storePath, origin, transport, from, feed = calendarFeed, now = Date.now }) {
  origin = publicOrigin(origin);
  if (!storePath || typeof transport?.sendMail !== 'function') throw new Error('Missing mail persistence or transport');
  await mkdir(path.dirname(storePath), { recursive: true });
  let state;
  try {
    state = JSON.parse(await readFile(storePath, 'utf8'));
    if (state.version !== 1 || !Array.isArray(state.subscribers) || !Array.isArray(state.outbox) || !state.secret || !Array.isArray(state.attempts)) throw new Error('Invalid mail state');
  } catch (e) {
    if (e.code !== 'ENOENT') throw e; // Never reset a damaged subscription database.
    state = { version: 1, secret: randomBytes(32).toString('hex'), subscribers: [], outbox: [], attempts: [], lastCheckedAt: null };
    await atomicSave(storePath, state);
  }
  let writes = Promise.resolve(), ticking, timer;
  function transaction(change) {
    const task = writes.catch(() => {}).then(async () => {
      const next = copy(state), result = change(next);
      await atomicSave(storePath, next);
      state = next;
      return copy(result);
    });
    writes = task;
    return task;
  }
  const unsubscribeToken = (id) => `${id}.${createHmac('sha256', state.secret).update(id).digest('hex')}`;
  function subscriberId(token) {
    if (typeof token !== 'string' || !/^[a-f0-9-]{36}\.[a-f0-9]{64}$/.test(token)) fail(400, '链接无效。');
    const id = token.slice(0, 36), expected = unsubscribeToken(id);
    if (!timingSafeEqual(Buffer.from(token), Buffer.from(expected))) fail(400, '链接无效。');
    return id;
  }
  async function send(message) {
    // SMTP acceptance is not a guarantee of inbox placement.
    const result = await transport.sendMail({ from, ...message, disableFileAccess: true, disableUrlAccess: true });
    if (!result?.accepted?.some((address) => String(address).toLowerCase() === message.to.toLowerCase())) throw new Error('SMTP_REJECTED');
  }

  async function subscribe(input) {
    const email = typeof input === 'string' ? input.trim().toLowerCase() : '';
    if (!validEmail(email)) fail(400, '请填写有效的邮箱地址。');
    const token = randomBytes(32).toString('hex'), timestamp = now();
    const reserved = await transaction((next) => {
      next.attempts = next.attempts.filter((row) => row.at > timestamp - 24 * HOUR);
      const previous = next.subscribers.find((row) => row.email === email);
      if (previous?.status === 'active' || next.attempts.some((row) => row.emailHash === hash(email) && row.at > timestamp - 10 * 60000)) return false;
      if (next.attempts.length >= 100) fail(429, '今日确认邮件较多，请稍后再试。');
      if (next.subscribers.length >= 10000 && !previous) fail(503, '订阅暂不可用，请联系店主。');
      const row = previous || { id: randomUUID(), email };
      Object.assign(row, { status: 'pending', confirmHash: hash(token), expiresAt: timestamp + 24 * HOUR, seen: [] });
      if (!previous) next.subscribers.push(row);
      next.attempts.push({ emailHash: hash(email), at: timestamp });
      return true;
    });
    if (reserved) {
      try {
        await send({ to: email, subject: '请确认订阅 Codex 重置通知', text: `你申请订阅了店铺的 Codex 重置通知。\n\n请在 24 小时内打开下面的页面，再点击“确认订阅”：\n${origin}/api/codex-reset-confirm?token=${token}\n\n如果不是你本人操作，请忽略本邮件；我们不会向未确认的邮箱发送重置通知。` });
      } catch {
        // Do not expose SMTP errors or the receiver to API/logs.
        fail(503, '确认邮件暂时无法发送，请 10 分钟后重试。');
      }
    }
    return { message: '请检查邮箱并点击确认链接；已订阅的邮箱无需再次确认。未收到时请检查垃圾邮件，10 分钟后可重试。' };
  }

  async function confirm(token) {
    if (typeof token !== 'string' || !/^[a-f0-9]{64}$/.test(token)) fail(400, '确认链接无效或已过期。');
    const tokenHash = hash(token), timestamp = now();
    if (!state.subscribers.some((s) => s.status === 'pending' && s.confirmHash === tokenHash && s.expiresAt > timestamp)) fail(400, '确认链接无效或已过期。');
    // Each new subscriber starts from today's complete feed, never 40 historical emails.
    const events = checkedEvents(await feed());
    await transaction((next) => {
      const row = next.subscribers.find((s) => s.status === 'pending' && s.confirmHash === tokenHash && s.expiresAt > now());
      if (!row) fail(400, '确认链接无效或已过期。');
      Object.assign(row, { status: 'active', confirmedAt: now(), seen: eventKeys(events) });
      delete row.confirmHash; delete row.expiresAt;
    });
  }

  async function unsubscribe(token) {
    const id = subscriberId(token);
    await transaction((next) => {
      next.subscribers = next.subscribers.filter((row) => row.id !== id);
      next.outbox = next.outbox.filter((row) => row.subscriberId !== id);
    });
  }

  async function pollAndDeliver() {
    let feedError;
    try {
      const events = checkedEvents(await feed()), timestamp = now();
      await transaction((next) => {
        next.subscribers = next.subscribers.filter((s) => s.status === 'active' || s.expiresAt > timestamp);
        for (const subscriber of next.subscribers.filter((s) => s.status === 'active')) {
          const seen = new Set(subscriber.seen);
          for (const event of events) {
            const key = eventKey(event);
            if (seen.has(key)) continue;
            const knownEvent = seen.has(eventKey({ ...event, status: 'announced' })) || seen.has(eventKey({ ...event, status: 'confirmed' }));
            seen.add(key);
            // An upstream regression from confirmed to announced is not a new event.
            if (event.status === 'announced' && seen.has(eventKey({ ...event, status: 'confirmed' }))) continue;
            // Old records newly backfilled upstream should not become a historical mail burst.
            const publishedAt = eventTime(event);
            if (!knownEvent && publishedAt && publishedAt <= subscriber.confirmedAt) continue;
            next.outbox.push({ id: randomUUID(), subscriberId: subscriber.id, event: { id: event.id, status: event.status, type: event.type, title: String(event.title || 'Codex 重置动态').slice(0, 300) }, state: 'pending', attempts: 0, nextAttemptAt: timestamp, createdAt: timestamp });
          }
          subscriber.seen = [...seen];
        }
        next.lastCheckedAt = timestamp;
        next.outbox = next.outbox.filter((job) => job.state !== 'sent' || job.sentAt > timestamp - 7 * 24 * HOUR);
      });
    } catch (e) { feedError = e; }
    // A feed outage must not stop retries for already accepted notifications.
    const jobs = state.outbox.filter((job) => job.state === 'pending' && job.nextAttemptAt <= now()).slice(0, 20);
    for (const job of jobs) {
      const subscriber = state.subscribers.find((s) => s.id === job.subscriberId && s.status === 'active');
      if (!subscriber) continue;
      const unsubscribeUrl = `${origin}/api/codex-reset-unsubscribe?token=${unsubscribeToken(subscriber.id)}`;
      const label = job.event.status === 'announced' ? '预告' : job.event.type === 'reset_credit' ? '已发重置卡' : '已重置';
      let sent = false;
      try {
        await send({ to: subscriber.email, subject: `Codex 重置通知：${label}`, messageId: `<${job.id}@${new URL(origin).hostname}>`, text: `${label}\n${job.event.title}\n\n查看店铺重置日历：${origin}/\n数据来源：https://aihot.news/codex-reset （公开信息整理，非官方时刻表）\n\n不再接收通知：${unsubscribeUrl}`, headers: { 'List-Unsubscribe': `<${unsubscribeUrl}>` } });
        sent = true;
      } catch { /* Persist a safe error category, never provider response text. */ }
      await transaction((next) => {
        const row = next.outbox.find((j) => j.id === job.id);
        if (!row) return; // The owner of the address unsubscribed while SMTP was in flight.
        row.attempts += 1;
        if (sent) Object.assign(row, { state: 'sent', sentAt: now(), lastError: null });
        else Object.assign(row, { state: row.attempts >= 8 ? 'failed' : 'pending', lastError: 'SMTP_FAILED', nextAttemptAt: now() + Math.min(HOUR, 60000 * (2 ** (row.attempts - 1))) });
      });
    }
    if (feedError) throw feedError;
  }
  function tick() {
    if (ticking) return ticking;
    ticking = pollAndDeliver().finally(() => { ticking = undefined; });
    return ticking;
  }
  function start() {
    if (timer) return;
    const run = () => { tick().catch(() => { console.warn('重置通知本轮检查未完成，将自动重试。'); }); };
    timer = setInterval(run, 60000); timer.unref?.(); run();
  }
  function stop() { clearInterval(timer); timer = undefined; transport.close?.(); }
  function status() {
    return { enabled: true, confirmedSubscribers: state.subscribers.filter((s) => s.status === 'active').length,
      pendingConfirmations: state.subscribers.filter((s) => s.status === 'pending' && s.expiresAt > now()).length,
      queued: state.outbox.filter((j) => j.state === 'pending').length, failed: state.outbox.filter((j) => j.state === 'failed').length,
      lastCheckedAt: state.lastCheckedAt ? new Date(state.lastCheckedAt).toISOString() : null };
  }
  async function retryFailed() {
    await transaction((next) => { for (const job of next.outbox) if (job.state === 'failed') Object.assign(job, { state: 'pending', attempts: 0, nextAttemptAt: now() }); });
    return status();
  }
  return { enabled: true, subscribe, confirm, unsubscribe, tick, start, stop, status, retryFailed };
}

export function mailActionPage({ action, token, done = false, error = false }) {
  const confirmation = action === 'confirm';
  const title = error ? '链接无效或已过期' : done ? (confirmation ? '订阅已确认' : '已退订') : (confirmation ? '确认订阅重置通知' : '退订重置通知');
  const message = error ? '请回到店铺重新操作。' : done ? (confirmation ? '后续预告和重置动态会发送到你的邮箱。' : '你将不再收到重置通知，邮箱记录已移除。') : (confirmation ? '点击下方按钮，确认接收后续预告与重置邮件。' : '点击下方按钮停止接收邮件。');
  const safeToken = typeof token === 'string' && /^[a-f0-9.-]{1,110}$/.test(token) ? token : '';
  return `<!doctype html><html lang="zh-CN"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="referrer" content="no-referrer"><link rel="stylesheet" href="/mail-actions.css"><title>${title}</title></head><body><main><h1>${title}</h1><p>${message}</p>${!done && !error ? `<form method="post" action="/api/codex-reset-${confirmation ? 'confirm' : 'unsubscribe'}"><input type="hidden" name="token" value="${safeToken}"><button>${confirmation ? '确认订阅' : '确认退订'}</button></form>` : ''}<p><a href="/">返回店铺</a></p></main></body></html>`;
}
