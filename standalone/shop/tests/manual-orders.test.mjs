import assert from "node:assert/strict";
import { mkdtemp, mkdir, readFile, rename, rm, rmdir, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { once } from "node:events";
import { request as httpRequest } from "node:http";
import test from "node:test";
import { createApp } from "../server/index.js";

async function fixture(t, options = {}) {
  const directory = await mkdtemp(path.join(os.tmpdir(), "seller-manual-orders-"));
  const storePath = path.join(directory, "store.json");
  const clientPath = path.join(directory, "client");
  await mkdir(path.join(clientPath, "assets"), { recursive: true });
  await writeFile(path.join(clientPath, "index.html"), "<!doctype html><title>Storefront</title>");
  await writeFile(path.join(clientPath, "assets", "payment.jpg"), "test-asset");
  await writeFile(storePath, JSON.stringify({
    settings: { qq: "297063893", wechatPaymentQr: "/assets/wechat.jpg", alipayPaymentQr: "/assets/alipay.jpg" },
    products: [{ id: "item-4", title: "现有商品", price: 12.34, stock: options.stock ?? 3, status: "published" }],
  }));
  const app = await createApp({
    storePath,
    uploadsPath: path.join(directory, "uploads"),
    clientPath,
    adminPassword: "integration-test-password",
    secureCookies: false,
    ...options,
  });
  const server = app.listen(0, "127.0.0.1");
  await once(server, "listening");
  const origin = `http://127.0.0.1:${server.address().port}`;
  t.after(async () => {
    server.closeAllConnections();
    await new Promise((resolve) => server.close(resolve));
    await rm(directory, { recursive: true, force: true });
  });
  async function request(route, { method = "GET", body, cookie, origin: requestOrigin, headers = {} } = {}) {
    const response = await fetch(`${origin}${route}`, {
      method,
      headers: {
        ...(body === undefined ? {} : { "Content-Type": "application/json" }),
        ...(cookie ? { Cookie: cookie } : {}),
        ...(requestOrigin === null ? {} : { Origin: requestOrigin || origin }),
        ...headers,
      },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
    const text = await response.text();
    return {
      status: response.status,
      headers: response.headers,
      body: response.headers.get("content-type")?.includes("application/json") ? JSON.parse(text) : text,
    };
  }
  async function login() {
    const result = await request("/api/auth/login", { method: "POST", body: { password: "integration-test-password" } });
    assert.equal(result.status, 200);
    return result.headers.get("set-cookie").split(";")[0];
  }
  async function order(overrides = {}) {
    return request("/api/orders", {
      method: "POST",
      body: { productId: "item-4", quantity: 1, contact: "buyer@example.test", note: "请联系我", paymentMethod: "wechat", ...overrides },
    });
  }
  return { request, order, login, storePath, origin, directory, app, server };
}

test("manual payment lifecycle stores priced orders and never lets a buyer confirm receipt or trigger delivery", async (t) => {
  const { request, order, login, storePath } = await fixture(t);
  const cookie = await login();
  assert.equal((await request("/api/admin/orders")).status, 401);
  const created = await order({ quantity: 2, paymentMethod: "alipay", total: 0.01, status: "paid" });
  assert.equal(created.status, 201);
  const { order: purchase, token } = created.body;
  assert.equal(purchase.total, 24.68);
  assert.equal(purchase.unitPrice, 12.34);
  assert.equal(purchase.currency, "CNY");
  assert.equal(purchase.paymentQr, "/assets/alipay.jpg");
  assert.equal(purchase.status, "pending_payment");
  assert.match(token, /^[a-f0-9]{64}$/);
  assert.equal(purchase.tokenHash, undefined);
  const disk = JSON.parse(await readFile(storePath, "utf8"));
  assert.notEqual(disk.orders[0].tokenHash, token);
  assert.ok(!JSON.stringify(disk).includes(token));
  assert.equal(disk.products[0].stock, 1);

  const storefront = await request("/api/storefront");
  assert.equal(storefront.body.orders, undefined);
  assert.ok(!JSON.stringify(storefront.body).includes(purchase.contact));
  for (const input of [{ id: purchase.id, contact: "wrong-contact" }, { id: "missing-order", contact: purchase.contact }]) {
    const query = await request("/api/orders/query", { method: "POST", body: input });
    assert.equal(query.status, 404);
    assert.deepEqual(query.body, { error: "订单号或联系方式不匹配。" });
  }
  const query = await request("/api/orders/query", { method: "POST", body: { id: purchase.id, contact: purchase.contact } });
  assert.equal(query.status, 200);
  assert.equal(query.headers.get("cache-control"), "no-store");
  assert.equal(query.body.order.token, undefined);
  assert.equal(query.body.order.tokenHash, undefined);
  assert.equal(query.body.order.inventoryReserved, undefined);
  assert.equal(query.body.order.paymentQr, "/assets/alipay.jpg");

  const adminAction = (action, cookieValue = cookie) => request(`/api/admin/orders/${purchase.id}`, { method: "PUT", cookie: cookieValue, body: { action } });
  assert.equal((await adminAction("confirm-payment")).status, 409);
  assert.equal((await adminAction("deliver")).status, 409);
  const invalidNotice = await request(`/api/orders/${purchase.id}/payment-notice`, { method: "POST", body: { token: "0".repeat(64) } });
  assert.equal(invalidNotice.status, 403);
  const submitted = await request(`/api/orders/${purchase.id}/payment-notice`, { method: "POST", body: { token, payerNote: "已转账，尾号 1234", status: "paid" } });
  assert.equal(submitted.status, 200);
  assert.equal(submitted.body.order.status, "payment_submitted");
  assert.equal(submitted.body.order.deliveryNote, "");
  assert.equal(submitted.body.order.paidAt, undefined);
  assert.equal((await adminAction("confirm-payment", "")).status, 401);
  assert.equal((await adminAction("deliver")).status, 409);
  const paid = await adminAction("confirm-payment");
  assert.equal(paid.body.order.status, "paid");
  assert.equal(paid.body.order.fulfilledAt, undefined);
  assert.equal((await adminAction("cancel")).status, 409);
  const fulfilled = await adminAction("deliver");
  assert.equal(fulfilled.body.order.status, "fulfilled");
  assert.equal(fulfilled.body.order.deliveryNote, "");
  assert.equal((await adminAction("deliver")).status, 409);
  const adminState = await request("/api/admin/state", { cookie });
  assert.equal(adminState.body.orders[0].status, "fulfilled");
  assert.equal(adminState.body.orders[0].tokenHash, undefined);
  const persisted = JSON.parse(await readFile(storePath, "utf8"));
  assert.equal(persisted.orders[0].status, "fulfilled");
  assert.equal(persisted.orders[0].payerNote, "已转账，尾号 1234");
});

test('backup QQ settings persist without replacing primary QQ, payment images or customer orders', async (t) => {
  const f = await fixture(t);
  await f.order();
  const before = JSON.parse(await readFile(f.storePath, 'utf8'));
  const cookie = await f.login();
  const result = await f.request('/api/admin/settings', { method: 'PUT', cookie, body: { backupQq: '3222816729' } });
  assert.equal(result.status, 200);
  assert.equal(result.body.settings.qq, '297063893');
  assert.equal(result.body.settings.backupQq, '3222816729');
  const after = JSON.parse(await readFile(f.storePath, 'utf8'));
  assert.deepEqual(after.orders, before.orders);
  assert.deepEqual(after.products, before.products);
  assert.equal(after.settings.wechatPaymentQr, before.settings.wechatPaymentQr);
  assert.equal(after.settings.alipayPaymentQr, before.settings.alipayPaymentQr);
  assert.equal((await f.request('/api/storefront')).body.settings.backupQq, '3222816729');
  assert.equal((await f.request('/api/admin/settings', { method: 'PUT', cookie, body: { backupQq: '<invalid>' } })).status, 400);
});

test("concurrent orders cannot oversell, and cancelling releases stock once", async (t) => {
  const { request, order, login, storePath } = await fixture(t, { stock: 1 });
  const results = await Promise.all([order(), order()]);
  assert.deepEqual(results.map((result) => result.status).sort(), [201, 409]);
  const created = results.find((result) => result.status === 201).body;
  const cookie = await login();
  const cancel = () => request(`/api/admin/orders/${created.order.id}`, { method: "PUT", cookie, body: { action: "cancel" } });
  assert.equal((await cancel()).body.order.status, "cancelled");
  assert.equal((await cancel()).status, 409);
  const disk = JSON.parse(await readFile(storePath, "utf8"));
  assert.equal(disk.products[0].stock, 1);
  assert.equal(disk.orders.length, 1);
  assert.equal((await request(`/api/orders/${created.order.id}/payment-notice`, { method: "POST", body: { token: created.token } })).status, 409);
  assert.equal((await order()).status, 201);
});

test("orders, both QR settings and payment proof tokens survive loading a fresh API instance", async (t) => {
  const { order, storePath, directory } = await fixture(t);
  const { order: purchase, token } = (await order()).body;
  const reloaded = await createApp({ storePath, uploadsPath: path.join(directory, "uploads"), adminPassword: "integration-test-password" });
  const server = reloaded.listen(0, "127.0.0.1");
  await once(server, "listening");
  try {
    const base = `http://127.0.0.1:${server.address().port}`;
    const storefront = await (await fetch(`${base}/api/storefront`)).json();
    assert.equal(storefront.settings.wechatPaymentQr, "/assets/wechat.jpg");
    assert.equal(storefront.settings.alipayPaymentQr, "/assets/alipay.jpg");
    assert.equal(storefront.products[0].stock, 2);
    const queried = await fetch(`${base}/api/orders/query`, {
      method: "POST", headers: { "Content-Type": "application/json", Origin: base }, body: JSON.stringify({ id: purchase.id, contact: purchase.contact }),
    });
    assert.equal(queried.status, 200);
    assert.equal((await queried.json()).order.status, "pending_payment");
    const notice = await fetch(`${base}/api/orders/${purchase.id}/payment-notice`, {
      method: "POST", headers: { "Content-Type": "application/json", Origin: base }, body: JSON.stringify({ token, payerNote: "重启后申报" }),
    });
    assert.equal(notice.status, 200);
    assert.equal((await notice.json()).order.status, "payment_submitted");
  } finally {
    server.closeAllConnections();
    await new Promise((resolve) => server.close(resolve));
  }
});

test("a failed disk write leaves the in-memory order and inventory unchanged", async (t) => {
  const { request, order, storePath } = await fixture(t, { stock: 1 });
  await rename(storePath, `${storePath}.backup`);
  await mkdir(storePath);
  const failed = await order();
  assert.equal(failed.status, 500);
  assert.equal((await request("/api/storefront")).body.products[0].stock, 1);
  await rmdir(storePath);
  await rename(`${storePath}.backup`, storePath);
  const created = await order();
  assert.equal(created.status, 201);
  const disk = JSON.parse(await readFile(storePath, "utf8"));
  assert.equal(disk.orders.length, 1);
  assert.equal(disk.products[0].stock, 0);
});

test("writes reject foreign browser origins, allow configured origins, and require admin authentication", async (t) => {
  const { request, login } = await fixture(t, { corsOrigin: "https://admin.example.test" });
  const foreignLogin = await request("/api/auth/login", { method: "POST", origin: "https://attacker.example", body: { password: "integration-test-password" } });
  assert.equal(foreignLogin.status, 403);
  const cookie = await login();
  const evilSettings = await request("/api/admin/settings", { method: "PUT", cookie, origin: "https://attacker.example", body: { qq: "attacker" } });
  assert.equal(evilSettings.status, 403);
  const missingOrigin = await request("/api/auth/logout", { method: "POST", cookie, origin: null, headers: { "Sec-Fetch-Site": "cross-site" } });
  assert.equal(missingOrigin.status, 403);
  const allowed = await request("/api/admin/settings", { method: "PUT", cookie, origin: "https://admin.example.test", body: { qq: "297063893", wechatPaymentQr: "/assets/payment.jpg", alipayPaymentQr: "/assets/payment.jpg" } });
  assert.equal(allowed.status, 200);
  assert.equal(allowed.headers.get("access-control-allow-origin"), "https://admin.example.test");
  assert.equal((await request("/api/admin/settings", { method: "PUT", body: { qq: "x" } })).status, 401);
  assert.equal((await request("/api/admin/settings", { method: "PUT", cookie, body: { wechatPaymentQr: "/assets/../../private.jpg" } })).status, 400);
});

test("login errors issue no session, lock repeated failures, and cannot expose private server files", async (t) => {
  const { request } = await fixture(t);
  for (let attempt = 0; attempt < 5; attempt += 1) {
    const rejected = await request("/api/auth/login", { method: "POST", body: { password: "wrong-password" } });
    assert.equal(rejected.status, 401);
    assert.equal(rejected.headers.get("set-cookie"), null);
    assert.equal(rejected.headers.get("cache-control"), "no-store");
    assert.deepEqual(rejected.body, { error: "密码错误。" });
  }
  const locked = await request("/api/auth/login", { method: "POST", body: { password: "integration-test-password" } });
  assert.equal(locked.status, 429);
  assert.equal(locked.headers.get("set-cookie"), null);
  assert.equal((await request("/api/admin/session")).body.authenticated, false);
  assert.equal((await request("/api/admin/state")).status, 401);
  for (const route of ["/server/data/store.json", "/server/index.js", "/server/.env", "/.env"]) {
    const privateFile = await request(route);
    if (privateFile.status === 200) assert.equal(privateFile.body, "<!doctype html><title>Storefront</title>");
    else assert.equal(privateFile.status, 404);
    assert.ok(!JSON.stringify(privateFile.body).includes("integration-test-password"));
  }
});

test("a preserved development Host matches Origin, while a rewritten Host needs explicit CORS configuration", async (t) => {
  const { request, origin: base } = await fixture(t);
  const origin = "http://localhost:5173";
  const body = { password: "integration-test-password" };
  const rewrittenHost = await request("/api/auth/login", { method: "POST", origin, body });
  assert.equal(rewrittenHost.status, 403);
  // Node's fetch rewrites Host; use the HTTP client to model a proxy retaining it.
  const preservedHostStatus = await new Promise((resolve, reject) => {
    const forwarded = httpRequest(`${base}/api/auth/login`, {
      method: "POST", headers: { Host: "localhost:5173", Origin: origin, "Content-Type": "application/json" },
    }, (response) => {
      response.resume();
      response.once("end", () => resolve(response.statusCode));
    });
    forwarded.once("error", reject);
    forwarded.end(JSON.stringify(body));
  });
  assert.equal(preservedHostStatus, 200);
});

test("orders validate sale availability and chosen QR and enforce rate limits", async (t) => {
  const first = await fixture(t);
  const cookie = await first.login();
  assert.equal((await first.order({ quantity: 0 })).status, 400);
  assert.equal((await first.order({ quantity: 1.5 })).status, 400);
  assert.equal((await first.order({ contact: " " })).status, 400);
  assert.equal((await first.order({ paymentMethod: "bank" })).status, 400);
  await first.request("/api/admin/settings", { method: "PUT", cookie, body: { alipayPaymentQr: "" } });
  assert.equal((await first.order({ paymentMethod: "alipay" })).status, 409);
  await first.request("/api/admin/products/item-4", { method: "PUT", cookie, body: { status: "draft" } });
  assert.equal((await first.order()).status, 404);
  const second = await fixture(t, { orderRateLimitMax: 2 });
  assert.equal((await second.order()).status, 201);
  assert.equal((await second.order()).status, 201);
  const limited = await second.order();
  assert.equal(limited.status, 429);
  assert.ok(Number(limited.headers.get("retry-after")) > 0);
});

test("built storefront routes and local assets are served without hiding missing API endpoints", async (t) => {
  const { request } = await fixture(t);
  const page = await request("/item/4", { headers: { Accept: "text/html" } });
  assert.equal(page.status, 200);
  assert.match(page.body, /Storefront/);
  const asset = await request("/assets/payment.jpg");
  assert.equal(asset.status, 200);
  assert.equal(asset.body, "test-asset");
  assert.equal((await request("/api/not-a-route", { headers: { Accept: "text/html" } })).status, 404);
});

test("authenticated image and copy publishing reaches public API and SSE and survives a server restart", async (t) => {
  const { request, login, origin, directory, storePath, server } = await fixture(t);
  const cookie = await login();
  const imageBytes = Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAusB9Y9Zl1sAAAAASUVORK5CYII=", "base64");
  const form = new FormData();
  form.append("file", new Blob([imageBytes], { type: "image/png" }), "phone-product.png");
  const uploaded = await fetch(`${origin}/api/admin/upload`, { method: "POST", headers: { Cookie: cookie, Origin: origin }, body: form });
  assert.equal(uploaded.status, 201);
  const { url: cover } = await uploaded.json();
  assert.match(cover, /^\/uploads\/[a-f0-9-]+\.png$/);
  const draft = await request("/api/admin/products", {
    method: "POST", cookie,
    body: { title: "手机新上传商品", summary: "手机编辑的商品文案", description: "详细介绍\n联系店主沟通交付", price: 28.8, stock: 10, cover, status: "draft" },
  });
  assert.equal(draft.status, 201);
  const productId = draft.body.product.id;
  assert.ok(!(await request("/api/storefront")).body.products.some((product) => product.id === productId));

  const streamController = new AbortController();
  const streamTimeout = setTimeout(() => streamController.abort(), 5_000);
  let reader;
  try {
    const events = await fetch(`${origin}/api/events`, { signal: streamController.signal });
    assert.equal(events.status, 200);
    assert.match(events.headers.get("content-type"), /text\/event-stream/);
    reader = events.body.getReader();
    const decoder = new TextDecoder();
    assert.match(decoder.decode((await reader.read()).value), /retry: 5000/);
    const published = await request(`/api/admin/products/${productId}`, { method: "PUT", cookie, body: { status: "published" } });
    assert.equal(published.status, 200);
    let eventText = "";
    while (!eventText.includes("\n\n")) {
      const chunk = await reader.read();
      assert.equal(chunk.done, false);
      eventText += decoder.decode(chunk.value, { stream: true });
    }
    assert.match(eventText, /event: storefront-update/);
    const eventData = JSON.parse(eventText.match(/data: ([^\n]+)/)[1]);
    assert.deepEqual(Object.keys(eventData), ["updatedAt"]);
    assert.ok(Number.isFinite(Date.parse(eventData.updatedAt)));
  } finally {
    clearTimeout(streamTimeout);
    await reader?.cancel().catch(() => undefined);
    streamController.abort();
  }

  const storefront = (await request("/api/storefront")).body;
  const product = storefront.products.find((entry) => entry.id === productId);
  assert.equal(product.title, "手机新上传商品");
  assert.equal(product.summary, "手机编辑的商品文案");
  assert.equal(product.description, "详细介绍\n联系店主沟通交付");
  assert.equal(product.price, 28.8);
  assert.equal(product.cover, cover);
  assert.equal(storefront.settings.qq, "297063893");
  assert.equal(storefront.settings.wechatPaymentQr, "/assets/wechat.jpg");
  assert.equal(storefront.settings.alipayPaymentQr, "/assets/alipay.jpg");
  const servedImage = await fetch(`${origin}${cover}`);
  assert.equal(servedImage.status, 200);
  assert.equal(servedImage.headers.get("content-type"), "image/png");
  assert.deepEqual(Buffer.from(await servedImage.arrayBuffer()), imageBytes);
  const changed = await request(`/api/admin/products/${productId}`, { method: "PUT", cookie, body: { price: 39.9, summary: "更新后的商品文案" } });
  assert.equal(changed.status, 200);
  const latest = (await request("/api/storefront")).body.products.find((entry) => entry.id === productId);
  assert.equal(latest.price, 39.9);
  assert.equal(latest.summary, "更新后的商品文案");

  server.closeAllConnections();
  await new Promise((resolve) => server.close(resolve));
  const restartedApp = await createApp({ storePath, uploadsPath: path.join(directory, "uploads"), clientPath: path.join(directory, "client") });
  const restartedServer = restartedApp.listen(0, "127.0.0.1");
  await once(restartedServer, "listening");
  try {
    const restartedOrigin = `http://127.0.0.1:${restartedServer.address().port}`;
    const restartedStorefront = await (await fetch(`${restartedOrigin}/api/storefront`)).json();
    assert.deepEqual(restartedStorefront.products.find((entry) => entry.id === productId), latest);
    const restartedImage = await fetch(`${restartedOrigin}${cover}`);
    assert.equal(restartedImage.status, 200);
    assert.deepEqual(Buffer.from(await restartedImage.arrayBuffer()), imageBytes);
  } finally {
    restartedServer.closeAllConnections();
    await new Promise((resolve) => restartedServer.close(resolve));
  }
});
