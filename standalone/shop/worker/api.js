import { seedSettings, seedProduct } from './seed.js';
import { fail, imageType, orderInput, productInput, settingsInput } from './validation.js';
import { calendarFeed } from './calendar.js';

const COOKIE = 'seller_admin_session';
const headers = { 'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff' };
const json = (value, status = 200, extra = {}) => Response.json(value, { status, headers: { ...headers, ...extra } });
const hex = (bytes) => Array.from(bytes, (b) => b.toString(16).padStart(2, '0')).join('');
const randomToken = () => hex(crypto.getRandomValues(new Uint8Array(32)));
const digest = async (text) => hex(new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(text))));
const product = (row) => row && ({ ...JSON.parse(row.data), id: row.id, stock: row.stock, price: row.price, status: row.status });
const order = (row) => row && ({ ...JSON.parse(row.data), id: row.id, status: row.status });
const nowIso = () => new Date().toISOString();

async function sameSecret(a, b) {
  const [left, right] = await Promise.all([digest(a), digest(b)]);
  let delta = 0;
  for (let i = 0; i < left.length; i++) delta |= left.charCodeAt(i) ^ right.charCodeAt(i);
  return delta === 0;
}
function cookieToken(request) {
  const value = (request.headers.get('cookie') || '').split(';').map((part) => part.trim()).find((part) => part.startsWith(`${COOKIE}=`));
  return value ? value.slice(COOKIE.length + 1) : '';
}
function cookie(token, seconds, env) {
  return `${COOKIE}=${token}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${seconds}${env.LOCAL_DEV === 'true' ? '' : '; Secure'}`;
}
async function boundedBytes(request, maximum) {
  if (Number(request.headers.get('content-length') || 0) > maximum) fail(413, '请求内容过大。');
  if (!request.body) return new Uint8Array();
  const reader = request.body.getReader();
  const chunks = [];
  let length = 0;
  for (;;) {
    const { value, done } = await reader.read();
    if (done) break;
    length += value.byteLength;
    if (length > maximum) { await reader.cancel(); fail(413, '请求内容过大。'); }
    chunks.push(value);
  }
  const result = new Uint8Array(length);
  let offset = 0;
  for (const chunk of chunks) { result.set(chunk, offset); offset += chunk.byteLength; }
  return result;
}
async function bodyJson(request) {
  const bytes = await boundedBytes(request, 1024 * 1024);
  if (!bytes.length) return {};
  try {
    const value = JSON.parse(new TextDecoder().decode(bytes));
    if (!value || typeof value !== 'object' || Array.isArray(value)) fail(400, '请求体必须是 JSON 对象。');
    return value;
  } catch (error) { if (error.publicMessage) throw error; fail(400, '请求 JSON 无效。'); }
}
async function seed(db) {
  // The settings insert is an initialization marker. Deleted seed products never reappear.
  if (await db.prepare('SELECT id FROM shop_settings WHERE id = 1').first()) return;
  await db.batch([
    db.prepare('INSERT OR IGNORE INTO shop_settings (id, data) VALUES (1, ?)').bind(JSON.stringify(seedSettings)),
    db.prepare('INSERT OR IGNORE INTO shop_products (id, data, stock, price, status) SELECT ?, ?, ?, ?, ? WHERE changes() = 1')
      .bind(seedProduct.id, JSON.stringify(seedProduct), seedProduct.stock, seedProduct.price, seedProduct.status),
  ]);
}
async function rateLimit(db, request, scope, max, windowMs) {
  const time = Date.now();
  const ip = request.headers.get('cf-connecting-ip') || 'unknown';
  const key = `${scope}:${await digest(ip)}:${Math.floor(time / windowMs)}`;
  const row = await db.prepare('INSERT INTO shop_limits (key, count, expires_at) VALUES (?, 1, ?) ON CONFLICT(key) DO UPDATE SET count = count + 1 RETURNING count')
    .bind(key, (Math.floor(time / windowMs) + 1) * windowMs).first();
  if (row.count > max) fail(429, '操作过于频繁，请稍后再试。');
}
async function session(db, request, env) {
  const token = cookieToken(request);
  if (!/^[a-f0-9]{64}$/.test(token) || !env.ADMIN_PASSWORD) return null;
  return db.prepare('SELECT expires_at FROM shop_sessions WHERE token_hash = ? AND expires_at > ? AND credential_version = ?')
    .bind(await digest(token), Date.now(), await digest(env.ADMIN_PASSWORD)).first();
}
function checkOrigin(request) {
  if (['GET', 'HEAD', 'OPTIONS'].includes(request.method)) return;
  const origin = request.headers.get('origin');
  if ((origin && origin !== new URL(request.url).origin) || (!origin && request.headers.get('sec-fetch-site') === 'cross-site')) fail(403, '此来源不允许提交请求。');
}

async function routeApi(request, env, ctx) {
  const path = new URL(request.url).pathname;
  const method = request.method;
  if (path === '/api/reset-calendar' && method === 'GET') return json({ ...(await calendarFeed(env)), emailEnabled: false });
  if (path === '/api/codex-reset-subscribe' && method === 'POST') return json({ error: '邮件通知服务配置中，暂未开放订阅。' }, 503);
  const known = /^\/api\/(?:storefront|events|auth\/(?:login|logout)|admin\/(?:session|state|settings|upload|mail|products(?:\/[^/]+)?|orders(?:\/[^/]+)?)|orders(?:\/query|\/[^/]+\/payment-notice)?)$/.test(path);
  if (!known) return json({ error: '接口不存在。' }, 404);
  checkOrigin(request);
  if (!env.DB || !env.BUCKET) fail(503, '店铺暂时无法连接，请稍后重试。');
  const db = env.DB;
  if (method === 'OPTIONS') return new Response(null, { status: 204, headers });
  await seed(db);
  if (ctx?.waitUntil && Math.random() < 0.02) ctx.waitUntil(db.batch([
    db.prepare('DELETE FROM shop_limits WHERE expires_at < ?').bind(Date.now()),
    db.prepare('DELETE FROM shop_sessions WHERE expires_at < ?').bind(Date.now()),
  ]).catch(() => {}));

  if (path === '/api/storefront' && method === 'GET') {
    const [settings, products] = await db.batch([
      db.prepare('SELECT data FROM shop_settings WHERE id = 1'),
      db.prepare("SELECT * FROM shop_products WHERE status = 'published' ORDER BY rowid"),
    ]);
    return json({ settings: JSON.parse(settings.results[0].data), products: products.results.map(product) });
  }
  if (path === '/api/events' && method === 'GET') {
    // Reconnection refreshes from D1, not from an isolate-local event subscriber set.
    return new Response(`retry: 10000\nevent: storefront-update\ndata: ${JSON.stringify({ updatedAt: nowIso() })}\n\n`, {
      headers: { ...headers, 'Content-Type': 'text/event-stream; charset=utf-8' },
    });
  }
  if (path === '/api/auth/login' && method === 'POST') {
    await rateLimit(db, request, 'login', 8, 15 * 60000);
    const input = await bodyJson(request);
    if (typeof env.ADMIN_PASSWORD !== 'string' || env.ADMIN_PASSWORD.length < 12) fail(503, '尚未设置有效管理密码。');
    if (typeof input.password !== 'string' || !(await sameSecret(env.ADMIN_PASSWORD, input.password))) fail(401, '密码错误。');
    const token = randomToken();
    const seconds = 12 * 3600;
    const expires = Date.now() + seconds * 1000;
    await db.prepare('INSERT INTO shop_sessions (token_hash, expires_at, credential_version) VALUES (?, ?, ?)')
      .bind(await digest(token), expires, await digest(env.ADMIN_PASSWORD)).run();
    return json({ authenticated: true, expiresAt: new Date(expires).toISOString() }, 200, { 'Set-Cookie': cookie(token, seconds, env) });
  }
  if (path === '/api/auth/logout' && method === 'POST') {
    const token = cookieToken(request);
    if (token) await db.prepare('DELETE FROM shop_sessions WHERE token_hash = ?').bind(await digest(token)).run();
    return json({ authenticated: false }, 200, { 'Set-Cookie': cookie('', 0, env) });
  }
  if (path === '/api/admin/session' && method === 'GET') {
    const signedIn = await session(db, request, env);
    return json(signedIn ? { authenticated: true, expiresAt: new Date(signedIn.expires_at).toISOString() } : { authenticated: false });
  }

  if (path === '/api/orders' && method === 'POST') {
    await rateLimit(db, request, 'order', 20, 15 * 60000);
    const input = orderInput(await bodyJson(request));
    const id = crypto.randomUUID(), token = randomToken(), time = nowIso();
    const base = { id, ...input, currency: 'CNY', status: 'pending_payment', payerNote: '', deliveryNote: '', createdAt: time, updatedAt: time };
    const qrPath = input.paymentMethod === 'wechat' ? '$.wechatPaymentQr' : '$.alipayPaymentQr';
    // Both statements commit in one D1 transaction. Stock changes only if THIS order inserted.
    const results = await db.batch([
      db.prepare(`INSERT INTO shop_orders (id, product_id, data, status, token_hash, inventory_reserved, created_at)
        SELECT ?, p.id, json_set(?, '$.productTitle', json_extract(p.data, '$.title'),
          '$.unitPrice', round(p.price * 100) / 100.0, '$.total', round(p.price * 100) * ? / 100.0,
          '$.paymentQr', json_extract(s.data, ?)), 'pending_payment', ?, p.stock IS NOT NULL, ?
        FROM shop_products p JOIN shop_settings s ON s.id = 1
        WHERE p.id = ? AND p.status = 'published' AND (p.stock IS NULL OR p.stock >= ?)
          AND p.price >= 0 AND p.price <= 1000000000 AND length(json_extract(s.data, ?)) > 0`)
        .bind(id, JSON.stringify(base), input.quantity, qrPath, await digest(token), time, input.productId, input.quantity, qrPath),
      db.prepare(`UPDATE shop_products SET stock = stock - ? WHERE id = ? AND stock IS NOT NULL
        AND EXISTS (SELECT 1 FROM shop_orders WHERE id = ?)`)
        .bind(input.quantity, input.productId, id),
      db.prepare('SELECT * FROM shop_orders WHERE id = ?').bind(id),
    ]);
    const created = results[2].results[0];
    if (!created) {
      const existing = await db.prepare('SELECT status FROM shop_products WHERE id = ?').bind(input.productId).first();
      if (!existing || existing.status !== 'published') fail(404, '商品不存在或已下架。');
      fail(409, '库存不足或此付款方式尚未配置，请联系店主。');
    }
    return json({ order: order(created), token }, 201);
  }
  if (path === '/api/orders/query' && method === 'POST') {
    await rateLimit(db, request, 'query', 30, 60000);
    const { id, contact } = await bodyJson(request);
    if (typeof id !== 'string' || id.length > 160 || typeof contact !== 'string' || contact.length > 200) fail(400, '请填写订单号和下单时的联系方式。');
    const row = await db.prepare('SELECT * FROM shop_orders WHERE id = ?').bind(id.trim()).first();
    if (!row || !(await sameSecret(order(row).contact, contact.trim()))) fail(404, '订单号或联系方式不匹配。');
    return json({ order: order(row) });
  }
  const noticeMatch = path.match(/^\/api\/orders\/([^/]+)\/payment-notice$/);
  if (noticeMatch && method === 'POST') {
    await rateLimit(db, request, 'notice', 30, 15 * 60000);
    const { token, payerNote = '' } = await bodyJson(request);
    if (typeof token !== 'string' || !/^[a-f0-9]{64}$/.test(token)) fail(403, '订单验证失败。');
    if (typeof payerNote !== 'string' || payerNote.length > 2000) fail(400, '付款说明不能超过 2000 个字符。');
    const id = decodeURIComponent(noticeMatch[1]), tokenHash = await digest(token), time = nowIso();
    const results = await db.batch([
      db.prepare(`UPDATE shop_orders SET status = 'payment_submitted', data = json_patch(data, ?)
        WHERE id = ? AND token_hash = ? AND status = 'pending_payment'`)
        .bind(JSON.stringify({ payerNote: payerNote.trim(), paymentSubmittedAt: time, updatedAt: time }), id, tokenHash),
      db.prepare('SELECT * FROM shop_orders WHERE id = ? AND token_hash = ?').bind(id, tokenHash),
    ]);
    const row = results[1].results[0];
    if (!row) fail(403, '订单验证失败。');
    if (row.status !== 'payment_submitted') fail(409, '此订单当前状态不允许再次申报付款。');
    return json({ order: order(row) });
  }

  if (path.startsWith('/api/admin/')) {
    if (!(await session(db, request, env))) fail(401, '未登录或登录已过期。');
    if (path === '/api/admin/mail' && method === 'GET') return json({ enabled: false });
    if (path === '/api/admin/state' && method === 'GET') {
      const values = await db.batch([
        db.prepare('SELECT data FROM shop_settings WHERE id = 1'),
        db.prepare('SELECT * FROM shop_products ORDER BY rowid'),
        db.prepare('SELECT * FROM shop_orders ORDER BY created_at DESC'),
      ]);
      return json({ settings: JSON.parse(values[0].results[0].data), products: values[1].results.map(product), orders: values[2].results.map(order) });
    }
    if (path === '/api/admin/orders' && method === 'GET') {
      const result = await db.prepare('SELECT * FROM shop_orders ORDER BY created_at DESC').all();
      return json({ orders: result.results.map(order) });
    }
    if (path === '/api/admin/settings' && method === 'PUT') {
      const changes = settingsInput(await bodyJson(request));
      const row = await db.prepare('UPDATE shop_settings SET data = json_patch(data, ?) WHERE id = 1 RETURNING data').bind(JSON.stringify(changes)).first();
      return json({ settings: JSON.parse(row.data) });
    }
    if (path === '/api/admin/products' && method === 'POST') {
      const changes = productInput(await bodyJson(request), true), time = nowIso();
      const created = { id: crypto.randomUUID(), title: '', summary: '', description: '', price: 0, stock: 0, status: 'draft', cover: '', ...changes, createdAt: time, updatedAt: time };
      await db.prepare('INSERT INTO shop_products (id, data, stock, price, status) VALUES (?, ?, ?, ?, ?)')
        .bind(created.id, JSON.stringify(created), created.stock, created.price, created.status).run();
      return json({ product: created }, 201);
    }
    const productMatch = path.match(/^\/api\/admin\/products\/([^/]+)$/);
    if (productMatch && ['PUT', 'DELETE'].includes(method)) {
      const id = decodeURIComponent(productMatch[1]);
      if (method === 'DELETE') {
        const row = await db.prepare('DELETE FROM shop_products WHERE id = ? RETURNING *').bind(id).first();
        if (!row) fail(404, '未找到商品。');
        return json({ ok: true, product: product(row) });
      }
      const changes = productInput(await bodyJson(request));
      const row = await db.prepare(`UPDATE shop_products SET data = json_patch(data, ?),
        stock = CASE WHEN ? THEN ? ELSE stock END, price = CASE WHEN ? THEN ? ELSE price END,
        status = CASE WHEN ? THEN ? ELSE status END WHERE id = ? RETURNING *`)
        .bind(JSON.stringify({ ...changes, updatedAt: nowIso() }), Number('stock' in changes), changes.stock ?? null,
          Number('price' in changes), changes.price ?? 0, Number('status' in changes), changes.status ?? '', id).first();
      if (!row) fail(404, '未找到商品。');
      return json({ product: product(row) });
    }
    const orderMatch = path.match(/^\/api\/admin\/orders\/([^/]+)$/);
    if (orderMatch && method === 'PUT') {
      const id = decodeURIComponent(orderMatch[1]);
      const { action, deliveryNote = '' } = await bodyJson(request);
      if (!['confirm-payment', 'deliver', 'cancel'].includes(action)) fail(400, '请选择有效订单操作。');
      if (typeof deliveryNote !== 'string' || deliveryNote.length > 4000) fail(400, '处理备注不能超过 4000 个字符。');
      const time = nowIso();
      const status = action === 'confirm-payment' ? 'paid' : action === 'deliver' ? 'fulfilled' : 'cancelled';
      const changes = { updatedAt: time, ...(status === 'paid' ? { paidAt: time } : status === 'fulfilled' ? { fulfilledAt: time, deliveryNote: deliveryNote.trim() } : { cancelledAt: time }) };
      let row;
      if (action === 'cancel') {
        const result = await db.batch([
          db.prepare(`UPDATE shop_products SET stock = stock + (SELECT json_extract(data, '$.quantity') FROM shop_orders WHERE id = ?)
            WHERE id = (SELECT product_id FROM shop_orders WHERE id = ? AND status IN ('pending_payment', 'payment_submitted') AND inventory_reserved = 1)
            AND stock IS NOT NULL`).bind(id, id),
          db.prepare(`UPDATE shop_orders SET status = 'cancelled', inventory_reserved = 0, data = json_patch(data, ?)
            WHERE id = ? AND status IN ('pending_payment', 'payment_submitted') RETURNING *`).bind(JSON.stringify(changes), id),
        ]);
        row = result[1].results[0];
      } else {
        row = await db.prepare('UPDATE shop_orders SET status = ?, data = json_patch(data, ?) WHERE id = ? AND status = ? RETURNING *')
          .bind(status, JSON.stringify(changes), id, action === 'confirm-payment' ? 'payment_submitted' : 'paid').first();
      }
      if (!row) fail(409, '订单不存在或状态已变化，请刷新后重试。');
      return json({ order: order(row) });
    }
    if (path === '/api/admin/upload' && method === 'POST') {
      const bytes = await boundedBytes(request, 9 * 1024 * 1024);
      let form;
      try { form = await new Request(request.url, { method: 'POST', headers: request.headers, body: bytes }).formData(); }
      catch { fail(400, '上传文件无效。'); }
      const files = form.getAll('file');
      if (files.length !== 1 || typeof files[0] === 'string' || !files[0]?.arrayBuffer) fail(400, '请使用 file 字段上传一张图片。');
      const file = files[0];
      if (file.size > 8 * 1024 * 1024) fail(400, '图片不能超过 8 MB。');
      const content = new Uint8Array(await file.arrayBuffer());
      const [extension, contentType] = imageType(content);
      const filename = `${crypto.randomUUID()}.${extension}`;
      await env.BUCKET.put(filename, content, { httpMetadata: { contentType, cacheControl: 'public, max-age=31536000, immutable' } });
      return json({ url: `/uploads/${filename}` }, 201);
    }
  }
  return json({ error: '接口不存在。' }, 404);
}

export async function apiFetch(request, env, ctx) {
  try { return await routeApi(request, env, ctx); }
  catch (error) {
    if (!error.publicMessage) console.error('Store request failed:', error?.message);
    return json({ error: error.publicMessage || '店铺暂时无法保存或读取数据，请稍后重试。' }, error.status || 503,
      error.status === 429 ? { 'Retry-After': '60' } : {});
  }
}
export async function uploadFetch(request, env) {
  try {
    if (!['GET', 'HEAD'].includes(request.method)) return json({ error: '接口不存在。' }, 404);
    const filename = new URL(request.url).pathname.slice('/uploads/'.length);
    if (!/^[a-f0-9-]{36}\.(jpg|png|webp)$/.test(filename)) return json({ error: '文件不存在。' }, 404);
    if (!env.BUCKET) fail(503, '图片暂时不可用。');
    const object = await env.BUCKET.get(filename);
    if (!object) return json({ error: '文件不存在。' }, 404);
    const metadata = new Headers({ 'X-Content-Type-Options': 'nosniff' });
    object.writeHttpMetadata(metadata);
    metadata.set('ETag', object.httpEtag);
    metadata.set('Content-Length', String(object.size));
    return new Response(request.method === 'HEAD' ? null : object.body, { headers: metadata });
  } catch { return json({ error: '图片暂时不可用，请稍后重试。' }, 503); }
}
