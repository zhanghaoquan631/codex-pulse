import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile, readdir, mkdtemp } from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import { Miniflare, convertV4MiniflareOptions } from 'miniflare';

const password = 'isolated-test-password-12345';
test('Worker durable shop: upload, publish, concurrency, private orders, manual transitions, restart', async () => {
  const persist = await mkdtemp(path.join(os.tmpdir(), 'seller-worker-test-'));
  const config = {
    ...convertV4MiniflareOptions({ name: 'seller-test', modules: true, scriptPath: 'dist/server/index.js', compatibilityDate: '2026-09-01',
      d1Databases: ['DB'], r2Buckets: ['BUCKET'], bindings: { ADMIN_PASSWORD: password, LOCAL_DEV: 'true' }, port: 0 }),
    resourcePersistencePath: persist,
  };
  let mf = new Miniflare(config);
  let cookie = '';
  let serial = 0;
  async function call(route, method = 'GET', body, admin = false, extra = {}) {
    const multipart = body instanceof FormData ? new Request('http://localhost', { method: 'POST', body }) : null;
    const payload = multipart ? new Uint8Array(await multipart.arrayBuffer()) : body === undefined ? undefined : JSON.stringify(body);
    const response = await mf.dispatchFetch(`http://localhost${route}`, {
      method, headers: { 'cf-connecting-ip': `192.0.2.${++serial}`, 'Content-Type': multipart?.headers.get('content-type') || 'application/json', ...(admin ? { cookie } : {}), ...extra },
      body: payload,
    });
    return { response, status: response.status, data: await response.json().catch(() => null) };
  }
  try {
    const db = await mf.getD1Database('DB');
    for (const name of (await readdir('drizzle')).filter((name) => name.endsWith('.sql')).sort()) {
      const sql = await readFile(path.join('drizzle', name), 'utf8');
      for (const statement of sql.split('--> statement-breakpoint').map((value) => value.trim()).filter(Boolean)) await db.prepare(statement).run();
    }
    const storefront = await call('/api/storefront');
    assert.equal(storefront.status, 200, JSON.stringify(storefront.data));
    assert.equal(storefront.data.settings.qq, '297063893');
    assert.equal(storefront.data.orders, undefined);
    assert.equal((await call('/api/admin/state')).status, 401);
    assert.equal((await call('/api/auth/login', 'POST', { password }, false, { origin: 'https://evil.example' })).status, 403);
    const login = await call('/api/auth/login', 'POST', { password });
    assert.equal(login.status, 200);
    cookie = login.response.headers.get('set-cookie').split(';')[0];
    assert.match(login.response.headers.get('set-cookie'), /HttpOnly/);
    const form = new FormData();
    const original = await readFile('public/assets/wechat-payment.jpg');
    form.append('file', new File([original], '商品图片.jpg', { type: 'image/jpeg' }));
    const uploaded = await call('/api/admin/upload', 'POST', form, true);
    assert.equal(uploaded.status, 201, JSON.stringify(uploaded.data));
    const published = await call('/api/admin/products', 'POST', { title: '手机上架商品', summary: '配套文字', price: 12.34, stock: 1, status: 'draft', cover: uploaded.data.url }, true);
    assert.equal(published.status, 201);
    const pid = published.data.product.id;
    assert.equal((await call('/api/storefront')).data.products.some((p) => p.id === pid), false);
    assert.equal((await call(`/api/admin/products/${pid}`, 'PUT', { status: 'published' }, true)).status, 200);
    assert.equal((await call('/api/storefront')).data.products.find((p) => p.id === pid).cover, uploaded.data.url);
    const input = { productId: pid, quantity: 1, contact: 'test-qq-contact', paymentMethod: 'wechat', total: 0.01, status: 'fulfilled' };
    const concurrent = await Promise.all([call('/api/orders', 'POST', input), call('/api/orders', 'POST', input)]);
    assert.deepEqual(concurrent.map((r) => r.status).sort(), [201, 409]);
    const receipt = concurrent.find((r) => r.status === 201).data;
    assert.equal(receipt.order.total, 12.34);
    assert.equal(receipt.order.status, 'pending_payment');
    assert.equal(receipt.order.tokenHash, undefined);
    assert.equal(receipt.order.inventoryReserved, undefined);
    const oid = receipt.order.id;
    assert.equal((await call(`/api/admin/orders/${oid}`, 'PUT', { action: 'deliver' }, true)).status, 409);
    assert.equal((await call('/api/orders/query', 'POST', { id: oid, contact: 'wrong' })).status, 404);
    const notice = await call(`/api/orders/${oid}/payment-notice`, 'POST', { token: receipt.token, payerNote: '付款昵称' });
    assert.equal(notice.data.order.status, 'payment_submitted');
    const repeated = await call(`/api/orders/${oid}/payment-notice`, 'POST', { token: receipt.token, payerNote: '不应覆盖' });
    assert.equal(repeated.data.order.payerNote, '付款昵称');
    const cancel = await Promise.all([call(`/api/admin/orders/${oid}`, 'PUT', { action: 'cancel' }, true), call(`/api/admin/orders/${oid}`, 'PUT', { action: 'cancel' }, true)]);
    assert.deepEqual(cancel.map((r) => r.status).sort(), [200, 409]);
    assert.equal((await call('/api/storefront')).data.products.find((p) => p.id === pid).stock, 1);
    const next = (await call('/api/orders', 'POST', input)).data;
    await call(`/api/orders/${next.order.id}/payment-notice`, 'POST', { token: next.token });
    assert.equal((await call(`/api/admin/orders/${next.order.id}`, 'PUT', { action: 'confirm-payment' })).status, 401);
    assert.equal((await call(`/api/admin/orders/${next.order.id}`, 'PUT', { action: 'confirm-payment' }, true)).data.order.status, 'paid');
    assert.equal((await call(`/api/admin/orders/${next.order.id}`, 'PUT', { action: 'deliver', deliveryNote: '已私下发送' }, true)).data.order.status, 'fulfilled');
    assert.equal((await call(`/api/admin/orders/${next.order.id}`, 'PUT', { action: 'cancel' }, true)).status, 409);
    await call(`/api/admin/products/${pid}`, 'PUT', { price: 99, title: '已修改商品' }, true);
    await call('/api/admin/settings', 'PUT', { wechatPaymentQr: uploaded.data.url }, true);
    // Failure in the second batch statement must roll back the first order INSERT.
    await call(`/api/admin/products/${pid}`, 'PUT', { stock: 1 }, true);
    await db.prepare("CREATE TRIGGER reject_stock BEFORE UPDATE OF stock ON shop_products BEGIN SELECT RAISE(ABORT, 'test failure'); END").run();
    const before = (await call('/api/admin/orders', 'GET', undefined, true)).data.orders.length;
    assert.equal((await call('/api/orders', 'POST', input)).status, 503);
    assert.equal((await call('/api/admin/orders', 'GET', undefined, true)).data.orders.length, before);
    assert.equal((await call('/api/storefront')).data.products.find((p) => p.id === pid).stock, 1);
    await db.prepare('DROP TRIGGER reject_stock').run();
    await call('/api/admin/products/4', 'DELETE', undefined, true);
    await mf.dispose();
    mf = new Miniflare(config);
    assert.equal((await call('/api/admin/session', 'GET', undefined, true)).data.authenticated, true);
    const restored = await call('/api/orders/query', 'POST', { id: next.order.id, contact: input.contact });
    assert.equal(restored.data.order.unitPrice, 12.34);
    assert.equal(restored.data.order.paymentQr, '/assets/wechat-payment.jpg');
    assert.equal(restored.data.order.deliveryNote, '已私下发送');
    assert.equal((await call('/api/storefront')).data.products.some((p) => p.id === '4'), false);
    const image = await mf.dispatchFetch(`http://localhost${uploaded.data.url}`);
    assert.equal(image.headers.get('content-type'), 'image/jpeg');
    assert.deepEqual(Buffer.from(await image.arrayBuffer()), original);
    await call('/api/auth/logout', 'POST', undefined, true);
    assert.equal((await call('/api/admin/state', 'GET', undefined, true)).status, 401);
  } finally { await mf.dispose(); }
});
