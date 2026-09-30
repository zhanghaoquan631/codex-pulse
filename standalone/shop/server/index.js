import express from "express";
import multer from "multer";
import { createHash, randomBytes, randomUUID, timingSafeEqual } from "node:crypto";
import { mkdir, readFile, rename, unlink, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { calendarFeed } from '../worker/calendar.js';
import { seedSettings, seedProduct } from '../worker/seed.js';
import { configuredResetMailer, mailActionPage } from './reset-mail.js';

const here = path.dirname(fileURLToPath(import.meta.url));
const DEFAULT_STORE_PATH = path.join(here, "data", "store.json");
const DEFAULT_UPLOADS_PATH = path.join(here, "uploads");
const SESSION_COOKIE = "seller_admin_session";
const SETTINGS_FIELDS = [
  "brandName",
  "announcement",
  "wechat",
  "qq",
  "backupQq",
  "telegram",
  "paymentQr",
  "wechatPaymentQr",
  "alipayPaymentQr",
  "contactQr",
  "contactLabel",
];
const PRODUCT_STATUSES = new Set(["draft", "published", "archived"]);
const ORDER_STATUSES = new Set(["pending_payment", "payment_submitted", "paid", "fulfilled", "cancelled"]);
const IMAGE_SETTINGS_FIELDS = ["paymentQr", "wechatPaymentQr", "alipayPaymentQr", "contactQr"];

const DEFAULT_SETTINGS = {
  brandName: "商品展示",
  announcement: "",
  wechat: "",
  qq: "",
  backupQq: "",
  telegram: "",
  paymentQr: "",
  wechatPaymentQr: "",
  alipayPaymentQr: "",
  contactQr: "",
  contactLabel: "联系咨询",
};

function isPlainObject(value) {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function deepCopy(value) {
  return JSON.parse(JSON.stringify(value));
}

function asText(value, fallback = "") {
  return typeof value === "string" ? value : fallback;
}

function isSafeImageReference(value) {
  if (value === "") return true;
  if (/^\/(?:uploads|assets)\/[a-zA-Z0-9_./%-]+$/.test(value)) {
    try {
      const decoded = decodeURIComponent(value);
      return !decoded.includes("..") && !decoded.includes("\\") && !decoded.includes("\0");
    } catch {
      return false;
    }
  }

  try {
    const url = new URL(value);
    return url.protocol === "https:" || url.protocol === "http:";
  } catch {
    return false;
  }
}

function normalizeSavedProduct(input) {
  const product = {
    id: typeof input.id === "string" && input.id ? input.id : randomUUID(),
    title: asText(input.title).slice(0, 160),
    summary: asText(input.summary).slice(0, 500),
    description: asText(input.description).slice(0, 20_000),
    price: typeof input.price === "number" && Number.isFinite(input.price) ? input.price : 0,
    stock:
      input.stock === null || (Number.isInteger(input.stock) && input.stock >= 0)
        ? input.stock
        : 0,
    status: PRODUCT_STATUSES.has(input.status) ? input.status : "draft",
    cover: isSafeImageReference(asText(input.cover)) ? asText(input.cover) : "",
    createdAt: asText(input.createdAt),
    updatedAt: asText(input.updatedAt),
  };

  return product;
}

function normalizeStore(input) {
  const rawSettings = isPlainObject(input?.settings) ? input.settings : {};
  const settings = { ...DEFAULT_SETTINGS };

  for (const field of SETTINGS_FIELDS) {
    const value = rawSettings[field];
    if (typeof value === "string") settings[field] = value;
  }

  for (const field of IMAGE_SETTINGS_FIELDS) {
    if (!isSafeImageReference(settings[field])) settings[field] = "";
  }

  return {
    settings,
    products: Array.isArray(input?.products) ? input.products.filter(isPlainObject).map(normalizeSavedProduct) : [],
    orders: Array.isArray(input?.orders)
      ? input.orders.filter((order) => isPlainObject(order) && typeof order.id === "string" && ORDER_STATUSES.has(order.status)).map(deepCopy)
      : [],
    updatedAt: asText(input?.updatedAt),
  };
}

function defaultStore() {
  return {
    settings: { ...seedSettings },
    products: [deepCopy(seedProduct)],
    orders: [],
    updatedAt: new Date().toISOString(),
  };
}

async function loadStore(storePath) {
  await mkdir(path.dirname(storePath), { recursive: true });

  try {
    return normalizeStore(JSON.parse(await readFile(storePath, "utf8")));
  } catch (error) {
    if (error?.code !== "ENOENT") throw error;

    const initialStore = defaultStore();
    await atomicWrite(storePath, `${JSON.stringify(initialStore, null, 2)}\n`);
    return initialStore;
  }
}

async function atomicWrite(targetPath, contents) {
  const temporaryPath = `${targetPath}.${process.pid}.${randomUUID()}.tmp`;
  try {
    await writeFile(temporaryPath, contents, { encoding: "utf8", mode: 0o600 });
    await rename(temporaryPath, targetPath);
  } finally {
    await unlink(temporaryPath).catch((error) => {
      if (error?.code !== "ENOENT") console.error("Unable to remove temporary store:", error.code);
    });
  }
}

function parseCookies(header = "") {
  const cookies = {};

  for (const part of header.split(";")) {
    const separator = part.indexOf("=");
    if (separator < 1) continue;
    const name = part.slice(0, separator).trim();
    const value = part.slice(separator + 1).trim();
    if (!name) continue;
    try {
      cookies[name] = decodeURIComponent(value);
    } catch {
      // Ignore malformed values instead of treating them as a session.
    }
  }

  return cookies;
}

function serializeCookie(name, value, { maxAge = 0, secure = false } = {}) {
  const parts = [
    `${name}=${encodeURIComponent(value)}`,
    "Path=/",
    "HttpOnly",
    "SameSite=Lax",
    `Max-Age=${Math.max(0, Math.floor(maxAge))}`,
  ];
  if (secure) parts.push("Secure");
  return parts.join("; ");
}

function passwordsMatch(expected, supplied) {
  const left = Buffer.from(expected);
  const right = Buffer.from(supplied);
  return left.length === right.length && timingSafeEqual(left, right);
}

function requestIp(request) {
  return request.ip || request.socket?.remoteAddress || "unknown";
}

function imageExtension(buffer) {
  if (buffer.length >= 3 && buffer[0] === 0xff && buffer[1] === 0xd8 && buffer[2] === 0xff) {
    return "jpg";
  }
  if (
    buffer.length >= 8 &&
    buffer[0] === 0x89 &&
    buffer[1] === 0x50 &&
    buffer[2] === 0x4e &&
    buffer[3] === 0x47 &&
    buffer[4] === 0x0d &&
    buffer[5] === 0x0a &&
    buffer[6] === 0x1a &&
    buffer[7] === 0x0a
  ) {
    return "png";
  }
  if (
    buffer.length >= 12 &&
    buffer.toString("ascii", 0, 4) === "RIFF" &&
    buffer.toString("ascii", 8, 12) === "WEBP"
  ) {
    return "webp";
  }
  return null;
}

function validateSettings(body) {
  if (!isPlainObject(body)) return { error: "请求体必须是 JSON 对象。" };

  const changes = {};
  for (const field of SETTINGS_FIELDS) {
    if (!(field in body)) continue;
    if (typeof body[field] !== "string") return { error: `${field} 必须是文本。` };

    const limit = field === "announcement" ? 2_000 : 1_000;
    if (body[field].length > limit) return { error: `${field} 超出允许长度。` };
    changes[field] = body[field];
  }

  for (const field of IMAGE_SETTINGS_FIELDS) {
    if (field in changes && !isSafeImageReference(changes[field])) {
      return { error: `${field} 必须是上传后的图片地址或 http(s) 地址。` };
    }
  }

  if ('backupQq' in changes && changes.backupQq !== '' && !/^\d{5,15}$/.test(changes.backupQq)) return { error: '备用 QQ 号请填写 5 至 15 位数字，或留空。' };

  return { value: changes };
}

function validateProduct(body, { creating = false } = {}) {
  if (!isPlainObject(body)) return { error: "请求体必须是 JSON 对象。" };
  if (creating && !("title" in body)) return { error: "新商品需要 title。" };

  const changes = {};
  for (const field of ["title", "summary", "description"]) {
    if (!(field in body)) continue;
    if (typeof body[field] !== "string") return { error: `${field} 必须是文本。` };
    const limit = field === "title" ? 160 : field === "summary" ? 500 : 20_000;
    if (body[field].length > limit) return { error: `${field} 超出允许长度。` };
    changes[field] = field === "title" ? body[field].trim() : body[field];
  }

  if (creating && !changes.title) return { error: "title 不能为空。" };
  if ("title" in changes && !changes.title) return { error: "title 不能为空。" };

  if ("price" in body) {
    const price = typeof body.price === "number" ? body.price : Number(body.price);
    if (!Number.isFinite(price) || price < 0 || price > 1_000_000_000) {
      return { error: "price 必须是不小于 0 的有效数字。" };
    }
    changes.price = price;
  }

  if ("stock" in body) {
    if (body.stock === null || body.stock === "") {
      changes.stock = null;
    } else {
      const stock = typeof body.stock === "number" ? body.stock : Number(body.stock);
      if (!Number.isInteger(stock) || stock < 0 || stock > 1_000_000_000) {
        return { error: "stock 必须是不小于 0 的整数，或 null。" };
      }
      changes.stock = stock;
    }
  }

  if ("status" in body) {
    if (typeof body.status !== "string" || !PRODUCT_STATUSES.has(body.status)) {
      return { error: "status 必须为 draft、published 或 archived。" };
    }
    changes.status = body.status;
  }

  if ("cover" in body) {
    if (typeof body.cover !== "string" || body.cover.length > 2_048 || !isSafeImageReference(body.cover)) {
      return { error: "cover 必须是上传后的图片地址或 http(s) 地址。" };
    }
    changes.cover = body.cover;
  }

  return { value: changes };
}

function createCorsMiddleware(allowedOrigins) {
  const allowed = new Set(
    (allowedOrigins || "")
      .split(",")
      .map((origin) => origin.trim())
      .filter(Boolean),
  );

  return (request, response, next) => {
    const origin = request.get("origin");
    const ownOrigin = `${request.protocol}://${request.get("host")}`;
    const isWrite = !["GET", "HEAD", "OPTIONS"].includes(request.method);
    if (origin && origin !== ownOrigin && !allowed.has(origin)) {
      if (isWrite || request.method === "OPTIONS") {
        return response.status(403).json({ error: "此来源不允许提交请求。" });
      }
    }
    if (isWrite && !origin && request.get("sec-fetch-site") === "cross-site") {
      return response.status(403).json({ error: "此来源不允许提交请求。" });
    }
    if (origin && allowed.has(origin)) {
      response.setHeader("Access-Control-Allow-Origin", origin);
      response.setHeader("Access-Control-Allow-Credentials", "true");
      response.setHeader("Access-Control-Allow-Headers", "Content-Type");
      response.setHeader("Access-Control-Allow-Methods", "GET,POST,PUT,DELETE,OPTIONS");
      response.setHeader("Vary", "Origin");
    }

    if (request.method === "OPTIONS") return response.status(204).end();
    next();
  };
}

function apiError(status, message) {
  return Object.assign(new Error(message), { status, publicMessage: message });
}

function tokenHash(token) {
  return createHash("sha256").update(token).digest("hex");
}

function visibleOrder(order) {
  // Token hashes and inventory bookkeeping are never part of customer or admin responses.
  const { tokenHash: _tokenHash, inventoryReserved: _inventoryReserved, ...visible } = order;
  return deepCopy(visible);
}

function validateOrder(body) {
  if (!isPlainObject(body)) throw apiError(400, "请求体必须是 JSON 对象。");
  if (typeof body.productId !== "string" || !body.productId || body.productId.length > 160) {
    throw apiError(400, "请选择有效商品。");
  }
  if (!Number.isInteger(body.quantity) || body.quantity < 1 || body.quantity > 100) {
    throw apiError(400, "购买数量必须为 1 至 100 的整数。");
  }
  if (typeof body.contact !== "string" || body.contact.trim().length < 3 || body.contact.trim().length > 200) {
    throw apiError(400, "请填写有效联系方式（3 至 200 个字符）。");
  }
  if (body.note !== undefined && (typeof body.note !== "string" || body.note.length > 2_000)) {
    throw apiError(400, "订单备注不能超过 2000 个字符。");
  }
  if (!["wechat", "alipay"].includes(body.paymentMethod)) throw apiError(400, "请选择微信或支付宝付款。");
  return {
    productId: body.productId,
    quantity: body.quantity,
    contact: body.contact.trim(),
    note: asText(body.note).trim(),
    paymentMethod: body.paymentMethod,
  };
}

function createRateLimit({ windowMs, max, message }) {
  const buckets = new Map();
  return (request, response, next) => {
    const now = Date.now();
    // Expired clients do not accumulate indefinitely in a long-running server.
    if (buckets.size > 1_000) {
      for (const [key, value] of buckets) if (value.expiresAt <= now) buckets.delete(key);
    }
    const ip = requestIp(request);
    let bucket = buckets.get(ip);
    if (!bucket || bucket.expiresAt <= now) {
      bucket = { count: 0, expiresAt: now + windowMs };
      buckets.set(ip, bucket);
    }
    bucket.count += 1;
    if (bucket.count > max) {
      response.setHeader("Retry-After", Math.ceil((bucket.expiresAt - now) / 1_000));
      return response.status(429).json({ error: message });
    }
    next();
  };
}

/**
 * Creates an API app. Pass storePath/uploadsPath/adminPassword in tests or use
 * STORE_PATH, UPLOADS_PATH and ADMIN_PASSWORD in the environment.
 */
export async function createApp(options = {}) {
  const storePath = options.storePath || process.env.STORE_PATH || DEFAULT_STORE_PATH;
  const uploadsPath = options.uploadsPath || process.env.UPLOADS_PATH || DEFAULT_UPLOADS_PATH;
  const configuredPassword = options.adminPassword ?? process.env.ADMIN_PASSWORD ?? "";
  const secureCookies = options.secureCookies ?? process.env.NODE_ENV === "production";
  const sessionHours = Math.min(
    168,
    Math.max(1, Number(options.sessionHours || process.env.SESSION_TTL_HOURS || 12) || 12),
  );
  const sessionDuration = sessionHours * 60 * 60 * 1_000;
  const clientPath = options.clientPath || path.join(here, "..", "dist", "client");
  const resetMailer = options.resetMailer || await configuredResetMailer({
    env: options.mailEnv || process.env,
    storePath: options.mailStorePath || process.env.MAIL_STORE_PATH || path.join(path.dirname(storePath), 'subscriptions.json'),
    feed: options.calendarFeed,
  });
  let store = await loadStore(storePath);
  let writeChain = Promise.resolve();
  const sessions = new Map();
  const loginFailures = new Map();
  const eventClients = new Set();

  await mkdir(uploadsPath, { recursive: true });

  const app = express();
  app.locals.resetMailer = resetMailer;
  if (process.env.TRUST_PROXY === "true") app.set("trust proxy", 1);
  app.disable("x-powered-by");
  app.use("/api", createCorsMiddleware(options.corsOrigin ?? process.env.CORS_ORIGIN));
  app.use("/api", (_request, response, next) => {
    response.setHeader("Cache-Control", "no-store");
    response.setHeader("X-Content-Type-Options", "nosniff");
    next();
  });
  app.use(express.json({ limit: "1mb" }));
  app.use("/uploads", express.static(uploadsPath, { fallthrough: false, maxAge: "1y", immutable: true }));

  const upload = multer({
    storage: multer.memoryStorage(),
    limits: { fileSize: 8 * 1024 * 1024, files: 1 },
  });

  function getSession(request) {
    const token = parseCookies(request.headers.cookie)[SESSION_COOKIE];
    if (!token) return null;
    const session = sessions.get(token);
    if (!session) return null;
    if (session.expiresAt <= Date.now()) {
      sessions.delete(token);
      return null;
    }
    return { token, ...session };
  }

  function requireAdmin(request, response, next) {
    const session = getSession(request);
    if (!session) return response.status(401).json({ error: "未登录或登录已过期。" });
    request.adminSession = session;
    next();
  }

  function broadcast(updatedAt) {
    const payload = `event: storefront-update\ndata: ${JSON.stringify({ updatedAt })}\n\n`;
    for (const response of eventClients) {
      try {
        response.write(payload);
      } catch {
        eventClients.delete(response);
      }
    }
  }

  function transaction(mutate) {
    const committed = writeChain.catch(() => undefined).then(async () => {
      const candidate = deepCopy(store);
      const result = mutate(candidate);
      candidate.updatedAt = new Date().toISOString();
      // The old store remains authoritative if mutation or disk persistence fails.
      await atomicWrite(storePath, `${JSON.stringify(candidate, null, 2)}\n`);
      store = candidate;
      broadcast(candidate.updatedAt);
      return deepCopy(result);
    });
    writeChain = committed;
    return committed;
  }

  function publicStorefront() {
    return {
      settings: deepCopy(store.settings),
      products: deepCopy(store.products.filter((product) => product.status === "published")),
    };
  }

  app.get("/api/storefront", (_request, response) => {
    response.setHeader("Cache-Control", "no-store");
    response.json(publicStorefront());
  });
  app.get('/api/reset-calendar', async (_request, response) => {
    try { response.json({ ...(await (options.calendarFeed || calendarFeed)()), emailEnabled: resetMailer.enabled }); }
    catch { response.status(503).json({ error: '暂时读不到日历，请稍后重试。' }); }
  });
  const subscribeLimit = createRateLimit({ windowMs: 3600000, max: 5, message: '订阅请求过于频繁，请稍后再试。' });
  app.post('/api/codex-reset-subscribe', subscribeLimit, async (request, response, next) => {
    if (!resetMailer.enabled) return response.status(503).json({ error: '邮件通知服务配置中，暂未开放订阅。' });
    try { response.status(202).json(await resetMailer.subscribe(request.body?.email)); }
    catch (error) { next(error); }
  });
  const mailActionLimit = createRateLimit({ windowMs: 60000, max: 20, message: '操作过于频繁，请稍后再试。' });
  for (const action of ['confirm', 'unsubscribe']) {
    const route = `/api/codex-reset-${action}`;
    const page = (response, options, status = 200) => response.status(status).set({
      'Referrer-Policy': 'no-referrer', 'X-Frame-Options': 'DENY',
      'Content-Security-Policy': "default-src 'none'; style-src 'self'; form-action 'self'; frame-ancestors 'none'; base-uri 'none'",
    }).type('html').send(mailActionPage({ action, ...options }));
    // Link scanners can GET safely; only a form POST changes subscription state.
    app.get(route, mailActionLimit, (request, response) => {
      if (!resetMailer.enabled) return page(response, { error: true }, 503);
      return page(response, { token: request.query.token });
    });
    app.post(route, mailActionLimit, express.urlencoded({ extended: false, limit: '2kb' }), async (request, response, next) => {
      if (!resetMailer.enabled) return page(response, { error: true }, 503);
      try { await resetMailer[action](request.body?.token); return page(response, { done: true }); }
      catch (error) { if (error.status === 400) return page(response, { error: true }, 400); next(error); }
    });
  }

  const orderLimit = createRateLimit({ windowMs: 15 * 60_000, max: options.orderRateLimitMax ?? 20, message: "下单过于频繁，请稍后再试。" });
  app.get('/api/admin/mail', requireAdmin, (_request, response) => response.json(resetMailer.status()));
  app.post('/api/admin/mail/retry', requireAdmin, async (_request, response, next) => {
    if (!resetMailer.enabled) return response.status(503).json({ error: '邮件通知尚未配置。' });
    try { response.json(await resetMailer.retryFailed()); } catch (error) { next(error); }
  });
  const queryLimit = createRateLimit({ windowMs: 60_000, max: 30, message: "查询过于频繁，请稍后再试。" });
  const paymentNoticeLimit = createRateLimit({ windowMs: 15 * 60_000, max: 30, message: "付款申报过于频繁，请稍后再试。" });

  app.post("/api/orders", orderLimit, async (request, response, next) => {
    try {
      const input = validateOrder(request.body);
      const token = randomBytes(32).toString("hex");
      const order = await transaction((candidate) => {
        const product = candidate.products.find((item) => item.id === input.productId && item.status === "published");
        if (!product) throw apiError(404, "商品不存在或已下架。");
        if (product.stock !== null && product.stock < input.quantity) throw apiError(409, "商品库存不足。");
        const paymentQr = candidate.settings[input.paymentMethod === "wechat" ? "wechatPaymentQr" : "alipayPaymentQr"];
        if (!paymentQr) throw apiError(409, "此付款方式尚未配置，请联系店主。");
        const unitPriceCents = Math.round(product.price * 100);
        if (!Number.isSafeInteger(unitPriceCents) || unitPriceCents < 0 || !Number.isSafeInteger(unitPriceCents * input.quantity)) {
          throw apiError(409, "商品价格无效，请联系店主。");
        }
        const now = new Date().toISOString();
        const created = {
          id: randomUUID(),
          ...input,
          productTitle: product.title,
          unitPrice: unitPriceCents / 100,
          total: (unitPriceCents * input.quantity) / 100,
          currency: "CNY",
          paymentQr,
          status: "pending_payment",
          payerNote: "",
          deliveryNote: "",
          tokenHash: tokenHash(token),
          inventoryReserved: product.stock !== null,
          createdAt: now,
          updatedAt: now,
        };
        if (created.inventoryReserved) product.stock -= input.quantity;
        candidate.orders.unshift(created);
        return visibleOrder(created);
      });
      response.status(201).json({ order, token });
    } catch (error) {
      next(error);
    }
  });

  app.post("/api/orders/query", queryLimit, (request, response, next) => {
    try {
      const { id, contact } = request.body || {};
      if (typeof id !== "string" || typeof contact !== "string" || id.length > 160 || contact.length > 200) {
        throw apiError(400, "请填写订单号和下单时的联系方式。");
      }
      const order = store.orders.find((item) => item.id === id.trim());
      if (!order || !passwordsMatch(order.contact, contact.trim())) throw apiError(404, "订单号或联系方式不匹配。");
      response.json({ order: visibleOrder(order) });
    } catch (error) {
      next(error);
    }
  });

  app.post("/api/orders/:id/payment-notice", paymentNoticeLimit, async (request, response, next) => {
    try {
      const { token, payerNote = "" } = request.body || {};
      if (typeof token !== "string" || token.length !== 64) throw apiError(403, "订单验证失败。");
      if (typeof payerNote !== "string" || payerNote.length > 2_000) throw apiError(400, "付款说明不能超过 2000 个字符。");
      const order = await transaction((candidate) => {
        const existing = candidate.orders.find((item) => item.id === request.params.id);
        if (!existing || !passwordsMatch(existing.tokenHash || "", tokenHash(token))) throw apiError(403, "订单验证失败。");
        if (existing.status === "payment_submitted") return visibleOrder(existing);
        if (existing.status !== "pending_payment") throw apiError(409, "此订单当前状态不允许再次申报付款。");
        existing.status = "payment_submitted";
        existing.payerNote = payerNote.trim();
        existing.paymentSubmittedAt = new Date().toISOString();
        existing.updatedAt = existing.paymentSubmittedAt;
        return visibleOrder(existing);
      });
      response.json({ order });
    } catch (error) {
      next(error);
    }
  });

  app.get("/api/events", (request, response) => {
    response.status(200);
    response.set({
      "Content-Type": "text/event-stream; charset=utf-8",
      "Cache-Control": "no-cache, no-transform",
      Connection: "keep-alive",
      "X-Accel-Buffering": "no",
    });
    response.flushHeaders?.();
    response.write("retry: 5000\n\n");
    eventClients.add(response);

    const heartbeat = setInterval(() => {
      try {
        response.write(": keepalive\n\n");
      } catch {
        clearInterval(heartbeat);
        eventClients.delete(response);
      }
    }, 25_000);
    heartbeat.unref?.();

    request.on("close", () => {
      clearInterval(heartbeat);
      eventClients.delete(response);
    });
  });

  app.post("/api/auth/login", (request, response) => {
    const ip = requestIp(request);
    const now = Date.now();
    const failure = loginFailures.get(ip);
    if (failure?.lockedUntil > now) {
      return response.status(429).json({ error: "登录尝试过多，请稍后再试。" });
    }

    const password = request.body?.password;
    if (!configuredPassword) {
      return response.status(503).json({ error: "服务端尚未配置 ADMIN_PASSWORD。" });
    }
    if (typeof password !== "string" || !passwordsMatch(configuredPassword, password)) {
      const count = (failure?.count || 0) + 1;
      loginFailures.set(ip, {
        count,
        lockedUntil: count >= 5 ? now + 15 * 60 * 1_000 : 0,
      });
      return response.status(401).json({ error: "密码错误。" });
    }

    loginFailures.delete(ip);
    const token = randomUUID();
    const expiresAt = now + sessionDuration;
    sessions.set(token, { expiresAt });
    response.setHeader(
      "Set-Cookie",
      serializeCookie(SESSION_COOKIE, token, { maxAge: sessionDuration / 1_000, secure: secureCookies }),
    );
    response.json({ authenticated: true, expiresAt: new Date(expiresAt).toISOString() });
  });

  app.post("/api/auth/logout", (request, response) => {
    const token = parseCookies(request.headers.cookie)[SESSION_COOKIE];
    if (token) sessions.delete(token);
    response.setHeader("Set-Cookie", serializeCookie(SESSION_COOKIE, "", { maxAge: 0, secure: secureCookies }));
    response.json({ authenticated: false });
  });

  app.get("/api/admin/session", (request, response) => {
    const session = getSession(request);
    response.json(
      session
        ? { authenticated: true, expiresAt: new Date(session.expiresAt).toISOString() }
        : { authenticated: false },
    );
  });

  app.get("/api/admin/state", requireAdmin, (_request, response) => {
    response.setHeader("Cache-Control", "no-store");
    response.json({ settings: deepCopy(store.settings), products: deepCopy(store.products), orders: store.orders.map(visibleOrder) });
  });

  app.get("/api/admin/orders", requireAdmin, (_request, response) => {
    response.json({ orders: store.orders.map(visibleOrder) });
  });

  app.put("/api/admin/orders/:id", requireAdmin, async (request, response, next) => {
    try {
      const { action, deliveryNote = "" } = request.body || {};
      if (!["confirm-payment", "deliver", "cancel"].includes(action)) throw apiError(400, "请选择有效订单操作。");
      if (typeof deliveryNote !== "string" || deliveryNote.length > 4_000) throw apiError(400, "处理备注不能超过 4000 个字符。");
      const order = await transaction((candidate) => {
        const existing = candidate.orders.find((item) => item.id === request.params.id);
        if (!existing) throw apiError(404, "未找到订单。");
        const now = new Date().toISOString();
        if (action === "confirm-payment") {
          if (existing.status !== "payment_submitted") throw apiError(409, "仅已申报付款的订单可确认收款。");
          existing.status = "paid";
          existing.paidAt = now;
        } else if (action === "deliver") {
          if (existing.status !== "paid") throw apiError(409, "请先核对实际到账并确认收款。");
          existing.status = "fulfilled";
          existing.deliveryNote = deliveryNote.trim();
          existing.fulfilledAt = now;
        } else {
          if (!["pending_payment", "payment_submitted"].includes(existing.status)) throw apiError(409, "仅未确认收款的订单可取消。");
          existing.status = "cancelled";
          existing.cancelledAt = now;
          if (existing.inventoryReserved) {
            const product = candidate.products.find((item) => item.id === existing.productId);
            if (product && product.stock !== null) product.stock += existing.quantity;
            existing.inventoryReserved = false;
          }
        }
        existing.updatedAt = now;
        return visibleOrder(existing);
      });
      response.json({ order });
    } catch (error) {
      next(error);
    }
  });

  app.put("/api/admin/settings", requireAdmin, async (request, response, next) => {
    try {
      const result = validateSettings(request.body);
      if (result.error) return response.status(400).json({ error: result.error });
      const settings = await transaction((candidate) => {
        candidate.settings = { ...candidate.settings, ...result.value };
        return candidate.settings;
      });
      response.json({ settings });
    } catch (error) {
      next(error);
    }
  });

  app.post("/api/admin/products", requireAdmin, async (request, response, next) => {
    try {
      const result = validateProduct(request.body, { creating: true });
      if (result.error) return response.status(400).json({ error: result.error });
      const now = new Date().toISOString();
      const product = {
        id: randomUUID(),
        title: "",
        summary: "",
        description: "",
        price: 0,
        stock: 0,
        status: "draft",
        cover: "",
        ...result.value,
        createdAt: now,
        updatedAt: now,
      };
      await transaction((candidate) => {
        candidate.products.push(product);
        return product;
      });
      response.status(201).json({ product: deepCopy(product) });
    } catch (error) {
      next(error);
    }
  });

  app.put("/api/admin/products/:id", requireAdmin, async (request, response, next) => {
    try {
      const result = validateProduct(request.body);
      if (result.error) return response.status(400).json({ error: result.error });
      const product = await transaction((candidate) => {
        const existing = candidate.products.find((item) => item.id === request.params.id);
        if (!existing) throw apiError(404, "未找到商品。");
        Object.assign(existing, result.value, { updatedAt: new Date().toISOString() });
        return existing;
      });
      response.json({ product });
    } catch (error) {
      next(error);
    }
  });

  app.delete("/api/admin/products/:id", requireAdmin, async (request, response, next) => {
    try {
      const product = await transaction((candidate) => {
        const index = candidate.products.findIndex((item) => item.id === request.params.id);
        if (index < 0) throw apiError(404, "未找到商品。");
        return candidate.products.splice(index, 1)[0];
      });
      response.json({ ok: true, product });
    } catch (error) {
      next(error);
    }
  });

  app.post("/api/admin/upload", requireAdmin, upload.single("file"), async (request, response, next) => {
    try {
      if (!request.file) return response.status(400).json({ error: "请使用 file 字段上传图片。" });
      const extension = imageExtension(request.file.buffer);
      if (!extension) return response.status(400).json({ error: "仅支持 JPEG、PNG 或 WebP 图片。" });

      const filename = `${randomUUID()}.${extension}`;
      await writeFile(path.join(uploadsPath, filename), request.file.buffer);
      response.status(201).json({ url: `/uploads/${filename}` });
    } catch (error) {
      next(error);
    }
  });

  app.use("/api", (_request, response) => response.status(404).json({ error: "接口不存在。" }));
  app.use(express.static(clientPath));
  app.use((request, response, next) => {
    if (request.method !== "GET" || !request.accepts("html") || path.extname(request.path)) return next();
    response.sendFile(path.join(clientPath, "index.html"), (error) => error && next(error));
  });

  app.use((error, _request, response, _next) => {
    if (error.publicMessage) return response.status(error.status).json({ error: error.publicMessage });
    if (error instanceof multer.MulterError) {
      const message = error.code === "LIMIT_FILE_SIZE" ? "图片不能超过 8 MB。" : "上传文件无效。";
      return response.status(400).json({ error: message });
    }
    if (error.type === "entity.parse.failed") return response.status(400).json({ error: "请求 JSON 无效。" });
    if (error.type === "entity.too.large") return response.status(413).json({ error: "请求内容过大。" });
    if (error.status === 404) return response.status(404).json({ error: "文件不存在。" });
    console.error("Seller API error:", error);
    response.status(500).json({ error: "服务器处理请求时出错。" });
  });

  app.use((_request, response) => response.status(404).json({ error: "接口不存在。" }));

  return app;
}

async function start() {
  const port = Number(process.env.PORT || 8787);
  const app = await createApp();
  const server = app.listen(port, () => {
    app.locals.resetMailer.start();
    console.log(`Seller API listening on http://localhost:${port}`);
  });
  server.on('close', () => app.locals.resetMailer.stop());
}

const invokedAsScript = process.argv[1] && pathToFileURL(process.argv[1]).href === import.meta.url;
if (invokedAsScript) {
  start().catch((error) => {
    console.error(error);
    process.exitCode = 1;
  });
}
