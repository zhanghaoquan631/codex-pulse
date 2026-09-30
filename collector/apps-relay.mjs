import http from 'node:http';
import { createHash, createHmac, timingSafeEqual } from 'node:crypto';
import { spawn } from 'node:child_process';
import { DatabaseSync } from 'node:sqlite';
import { createReadStream } from 'node:fs';
import { access, mkdir, open, readdir, readFile, realpath, stat, unlink } from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import { pipeline } from 'node:stream/promises';
import { resolveRelayRoute, UUID, UPLOAD_CHUNK_BYTES, MAX_UPLOAD_BYTES, validMediaType } from '../integration/local-apps/relay-policy.mjs';
import { OwnedAppsTunnel } from './apps-tunnel-owner.mjs';

const uncertain = { error: '操作可能已在本机完成，未能确认结果。请刷新记录核实，不要重复提交。', code: 'LOCAL_RESULT_UNCERTAIN' };
const jsonHeaders = { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff' };
const hash = value => createHash('sha256').update(value).digest('hex');
const sleep = milliseconds => new Promise(resolve => setTimeout(resolve, milliseconds));
export const deriveRelayKey = ingestToken => createHmac('sha256', ingestToken).update('pulse-app-relay-v1').digest('hex');
export const relayUrlFromOutput = output => {
  const match = /(?:^|[^\w./-])(https:\/\/[a-z0-9-]+\.trycloudflare\.com)(?=$|[\s|])/i.exec(output);
  return match ? match[1].toLowerCase() : null;
};

function sendJson(response, status, body) {
  if (response.destroyed || response.writableEnded) return;
  if (status === 204 || status === 304) { response.writeHead(status, { 'Cache-Control': 'no-store' }); response.end(); return; }
  response.writeHead(status, jsonHeaders); response.end(JSON.stringify(body ?? null));
}

function fail(code, message, status = 400) { return Object.assign(new Error(message), { code, status }); }
async function bufferBody(request, maximum) {
  const declared = Number(request.headers['content-length']);
  if (Number.isFinite(declared) && declared > maximum) throw fail('BODY_TOO_LARGE', '内容超过上限。', 413);
  const chunks = []; let bytes = 0;
  for await (const chunk of request) {
    bytes += chunk.length;
    if (bytes > maximum) throw fail('BODY_TOO_LARGE', '内容超过上限。', 413);
    chunks.push(chunk);
  }
  return Buffer.concat(chunks, bytes);
}

// Upstream cookies/credentials and local filesystem paths never leave this process.
export function publicBody(value) {
  if (Array.isArray(value)) return value.map(publicBody);
  if (value && typeof value === 'object') return Object.fromEntries(Object.entries(value)
    .filter(([key]) => !/^(?:filepath|absolutepath|localpath|token|accesstoken|refreshtoken|idtoken|authtoken|privatekey|clientsecret|sessionsecret|secret|password|authorization|cookie|cookies|sharetoken|codeverifier)$/.test(key.toLowerCase().replace(/[_-]/g, '')))
    .map(([key, child]) => [key, publicBody(child)]));
  return value;
}

export class AppsRelay {
  constructor(dataDir, configFile, dependencies = {}) {
    this.dataDir = dataDir; this.configFile = configFile; this.dependencies = dependencies;
    this.readConfig = dependencies.readConfig || (async () => JSON.parse((await readFile(configFile, 'utf8')).replace(/^\uFEFF/, '')));
    this.cloud = dependencies.fetchCloud || fetch;
    this.port = dependencies.listenPort ?? 43872;
    this.deviceId = dependencies.deviceId || null;
    this.uploadDir = path.join(dataDir, 'uploads');
    this.cookies = new Map(); this.sessionRequests = new Map(); this.locks = new Map(); this.jobs = new Set(); this.upstreams = new Set();
    this.config = {}; this.relayKey = null; this.relayUrl = null; this.tunnel = null; this.server = null; this.db = null;
    this.tunnelOwner = dependencies.tunnelOwner || new OwnedAppsTunnel(dataDir, { processes: dependencies.tunnelProcesses });
    this.tunnelLease = null;
    this.stopped = true; this.restarting = false; this.registering = false; this.lastCleanup = 0;
    this.status = { state: 'stopped', registered: false, lastRegisteredAt: null, backends: { github: false, finance: false, media: false } };
  }

  getStatus() { return structuredClone(this.status); }

  async initialize() {
    if (this.db) return;
    await mkdir(this.uploadDir, { recursive: true, mode: 0o700 });
    this.db = new DatabaseSync(path.join(this.dataDir, 'apps-relay.sqlite'));
    this.db.exec(`PRAGMA journal_mode=WAL; PRAGMA synchronous=FULL; PRAGMA busy_timeout=5000;
      CREATE TABLE IF NOT EXISTS operations(id TEXT PRIMARY KEY,fingerprint TEXT NOT NULL,state TEXT NOT NULL,status INTEGER,body TEXT,updated INTEGER NOT NULL);
      CREATE TABLE IF NOT EXISTS uploads(id TEXT PRIMARY KEY,kind TEXT NOT NULL,mime TEXT NOT NULL,total INTEGER NOT NULL,received INTEGER NOT NULL DEFAULT 0,state TEXT NOT NULL,status INTEGER,body TEXT,updated INTEGER NOT NULL);
      CREATE TABLE IF NOT EXISTS chunks(upload_id TEXT NOT NULL,chunk_index INTEGER NOT NULL,size INTEGER NOT NULL,hash TEXT NOT NULL,PRIMARY KEY(upload_id,chunk_index));`);
    const now = Date.now();
    this.db.prepare("UPDATE operations SET state='uncertain',status=409,body=?,updated=? WHERE state='running'").run(JSON.stringify(uncertain), now);
    this.db.prepare("UPDATE uploads SET state='uncertain',status=409,body=?,updated=? WHERE state='committing'").run(JSON.stringify(uncertain), now);
    await this.refreshConfig();
    const createStorage = this.dependencies.createFinanceStorage || (await import('./apps-storage.mjs')).createFinanceStorage;
    this.storage = createStorage(this.dataDir);
    const {GoogleTools}=await import('./google-tools.mjs');
    this.googleTools=new GoogleTools(this.dataDir,this.dependencies.googleTools||{});
    await this.cleanup();
  }

  async refreshConfig() {
    try {
      const config = await this.readConfig();
      this.config = config && typeof config === 'object' ? config : {};
      this.relayKey = typeof config.ingestToken === 'string' && config.ingestToken.length >= 16 ? deriveRelayKey(config.ingestToken) : null;
    } catch { this.relayKey = null; this.status.state = 'configuration-unavailable'; }
    if (!this.deviceId) {
      let mezip;
      try {
        mezip = new DatabaseSync(path.join(this.dataDir, 'mezip.sqlite'), { readOnly: true });
        const id = mezip.prepare("SELECT value FROM meta WHERE key='deviceId'").get()?.value;
        if (UUID.test(id || '')) this.deviceId = id;
      } catch { /* The main collector initializes this database; try next heartbeat. */ }
      finally { mezip?.close(); }
    }
  }

  async start() {
    if (!this.stopped) return;
    this.stopped = false;
    try {
      await this.initialize();
      this.server = http.createServer((request, response) => {
        void this.handle(request, response).catch(error => {
          if (response.headersSent) response.destroy();
          else sendJson(response, error.status || 502, { error: error.status ? error.message : '本机应用暂时不可用。', code: error.code || 'LOCAL_APP_UNAVAILABLE' });
        });
      });
      this.server.requestTimeout = 120000; this.server.headersTimeout = 15000;
      await new Promise((resolve, reject) => { this.server.once('error', reject); this.server.listen(this.port, '127.0.0.1', resolve); });
      this.port = this.server.address().port;
      await this.storage.startImportServer();
      this.status.state = 'starting';
      if (!this.dependencies.disableTunnel) await this.startTunnel();
      this.timer = setInterval(() => { void this.heartbeat(); }, 15000); this.timer.unref();
      void this.heartbeat();
    } catch (error) { await this.stop(); throw error; }
  }

  authenticated(request) {
    const value = request.headers['x-pulse-relay-key'];
    if (!this.relayKey || typeof value !== 'string' || !/^[0-9a-f]{64}$/.test(value)) return false;
    return timingSafeEqual(Buffer.from(value, 'hex'), Buffer.from(this.relayKey, 'hex'));
  }

  async handle(request, response) {
    if (!this.authenticated(request)) { sendJson(response, 403, { error: '访问未授权。' }); return; }
    const route = resolveRelayRoute(request.method, request.url);
    if (!route) { sendJson(response, 404, { error: '不支持的本机应用操作。' }); return; }
    if (route.app === 'health') { await this.checkHealth(); sendJson(response, 200, { ok: true, apps: this.status.backends }); return; }
    if (route.app === 'storage') { await this.storage.handle(request, response, new URL(request.url, 'http://127.0.0.1')); return; }
    if (route.app === 'identity') { await this.googleTools.handle(request,response,new URL(request.url,'http://127.0.0.1')); return; }
    if (route.app === 'operations') {
      const receipt = this.operationReceipt(route.id);
      sendJson(response, receipt ? 200 : 404, receipt || { error: '操作回执不存在。' }); return;
    }
    if (route.app === 'uploads') { await this.handleUpload(route, request, response); return; }
    if (route.binary) { await this.proxyBinary(route, request, response); return; }
    const bytes = await bufferBody(request, route.write ? route.maxBodyBytes : 0);
    let body;
    if (bytes.length) {
      if (!/^application\/json(?:;|$)/i.test(String(request.headers['content-type'] || ''))) throw fail('JSON_REQUIRED', '需要 JSON 内容。', 415);
      try { body = JSON.parse(bytes.toString('utf8')); } catch { throw fail('INVALID_JSON', 'JSON 内容无效。'); }
    }
    if (!route.write) {
      const result = await this.requestJson(route, body);
      sendJson(response, result.status, result.body); return;
    }
    const id = request.headers['x-pulse-operation-id'];
    if (typeof id !== 'string' || !UUID.test(id)) throw fail('OPERATION_ID_REQUIRED', '操作编号无效。');
    const operationId = id.toLowerCase();
    const fingerprint = hash(JSON.stringify([request.method, request.url, body ?? null]));
    const prior = this.db.prepare('SELECT * FROM operations WHERE id=?').get(operationId);
    if (prior && prior.fingerprint !== fingerprint) throw fail('OPERATION_CONFLICT', '操作编号已用于不同内容。', 409);
    if (prior) { this.sendOperation(response, operationId); return; }
    // A durable in-progress marker is committed before any upstream write starts.
    this.db.prepare("INSERT INTO operations(id,fingerprint,state,updated) VALUES(?,?,'running',?)").run(operationId, fingerprint, Date.now());
    const job = this.track((async () => {
      try {
        const result = await this.requestJson(route, body, { operationId });
        this.db.prepare("UPDATE operations SET state='done',status=?,body=?,updated=? WHERE id=?").run(result.status, JSON.stringify(result.body ?? null), Date.now(), operationId);
      } catch {
        this.db.prepare("UPDATE operations SET state='uncertain',status=409,body=?,updated=? WHERE id=?").run(JSON.stringify(uncertain), Date.now(), operationId);
      }
    })());
    await Promise.race([job, sleep(this.dependencies.pendingAfterMs ?? 20000)]);
    this.sendOperation(response, operationId);
  }

  track(job) { this.jobs.add(job); void job.finally(() => this.jobs.delete(job)).catch(() => {}); return job; }
  operationReceipt(id) {
    const row = this.db.prepare('SELECT state,status,body FROM operations WHERE id=?').get(id);
    return row ? { state: row.state, ...(row.status ? { status: row.status, body: JSON.parse(row.body || 'null') } : {}) } : null;
  }
  sendOperation(response, id) {
    const receipt = this.operationReceipt(id);
    if (receipt?.state === 'running') sendJson(response, 202, { relayPending: true, operationId: id });
    else sendJson(response, receipt?.status || 409, receipt?.body || uncertain);
  }

  backendPort(app) { return this.dependencies.backendPorts?.[app] || { github: 4317, finance: 4325, media: 5174, booking: 5241 }[app]; }
  rememberCookie(app, headers) {
    const name = { github: 'mezip_github_dev_session', finance: 'mezip_finance_desktop_session' }[app];
    if (!name) return;
    for (const item of [].concat(headers['set-cookie'] || [])) {
      const pair = String(item).split(';')[0];
      if (pair.startsWith(`${name}=`) && !/[\r\n]/.test(pair)) this.cookies.set(app, { value: pair, expires: Date.now() + 25 * 86400000 });
    }
  }

  async session(app) {
    if (app === 'media' || app === 'booking') return;
    const known = this.cookies.get(app);
    if (known && known.expires > Date.now()) return;
    if (this.sessionRequests.has(app)) return this.sessionRequests.get(app);
    const job = (async () => {
      const sessionPath = app === 'github' ? '/v1/github-workspace/connection' : '/v1/finance/mobile/desktop-session';
      const result = await this.rawJson({ app, path: sessionPath, method: 'GET', timeoutMs: 15000 });
      if (result.status !== 200 || !this.cookies.has(app)) throw fail('LOCAL_SESSION_UNAVAILABLE', '本机应用会话暂时不可用。', 503);
    })();
    this.sessionRequests.set(app, job);
    try { await job; } finally { this.sessionRequests.delete(app); }
  }

  async requestJson(route, body, options = {}) {
    await this.session(route.app);
    const result = await this.rawJson(route, body, options);
    // Only safe reads may repeat after an expired local session. Never replay writes.
    if ([401, 403].includes(result.status) && !route.write && route.app !== 'media') {
      this.cookies.delete(route.app); await this.session(route.app);
      return this.rawJson(route, body, options);
    }
    return result;
  }

  localRequest(route, body, options = {}) {
    return new Promise((resolve, reject) => {
      const bytes = body === undefined || route.method === 'GET' || route.method === 'HEAD' ? undefined : Buffer.from(JSON.stringify(body));
      const headers = { Accept: route.binary ? '*/*' : 'application/json' };
      if (bytes) { headers['Content-Type'] = 'application/json'; headers['Content-Length'] = bytes.length; }
      if (this.cookies.has(route.app)) headers.Cookie = this.cookies.get(route.app).value;
      if (options.operationId && route.app === 'github') headers['Idempotency-Key'] = `pulse:${options.operationId}`;
      if (route.confirm) headers['X-Film-Studio-Confirm'] = 'recycle-bin';
      if (options.range) headers.Range = options.range;
      if (options.file) { headers['Content-Type'] = options.file.mime; headers['Content-Length'] = options.file.size; }
      const upstream = http.request({ hostname: '127.0.0.1', port: this.backendPort(route.app), method: route.method, path: route.path,
        headers, timeout: route.timeoutMs || 30000 }, incoming => {
        this.rememberCookie(route.app, incoming.headers);
        resolve(incoming);
      });
      this.upstreams.add(upstream); upstream.once('close', () => this.upstreams.delete(upstream));
      upstream.once('error', reject); upstream.once('timeout', () => upstream.destroy(new Error('local-timeout')));
      // The socket timeout also applies while streaming; no fixed premature GET deadline.
      if (options.file) {
        const input = createReadStream(options.file.path);
        input.once('error', error => upstream.destroy(error));
        upstream.once('close', () => input.destroy());
        input.pipe(upstream);
      } else upstream.end(bytes);
    });
  }

  async rawJson(route, body, options) {
    const incoming = await this.localRequest(route, body, options);
    const status = incoming.statusCode || 502;
    if (status >= 300 && status < 400) { incoming.resume(); return { status: 502, body: { error: '本机返回了未支持的跳转。', code: 'LOCAL_REDIRECT_REJECTED' } }; }
    if (status === 204) { incoming.resume(); return { status, body: null }; }
    const chunks = []; let length = 0;
    for await (const chunk of incoming) {
      length += chunk.length;
      if (length > 64 * 1024 * 1024) { incoming.destroy(); throw new Error('local-response-too-large'); }
      chunks.push(chunk);
    }
    const text = Buffer.concat(chunks, length).toString('utf8');
    return { status, body: publicBody(text ? JSON.parse(text) : null) };
  }

  async proxyBinary(route, request, response) {
    const range = request.headers.range;
    if (range && (typeof range !== 'string' || !/^bytes=(?:\d+-\d*|-\d+)$/.test(range))) throw fail('INVALID_RANGE', '不支持的分段范围。', 416);
    await this.session(route.app);
    let incoming = await this.localRequest(route, undefined, { range });
    if ([401,403].includes(incoming.statusCode) && route.app !== 'media') {
      incoming.resume(); this.cookies.delete(route.app); await this.session(route.app);
      incoming = await this.localRequest(route, undefined, { range });
    }
    if (incoming.statusCode >= 300 && incoming.statusCode < 400) { incoming.resume(); sendJson(response, 502, { error: '不支持的媒体跳转。' }); return; }
    const headers = { 'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff' };
    for (const key of ['content-type','content-length','content-range','accept-ranges','content-disposition']) if (incoming.headers[key] !== undefined) headers[key] = incoming.headers[key];
    response.writeHead(incoming.statusCode || 502, headers);
    response.once('close', () => { if (!response.writableFinished) incoming.destroy(); });
    await pipeline(incoming, response);
  }

  uploadPath(id) { if (!UUID.test(id)) throw fail('INVALID_UPLOAD', '上传编号无效。'); return path.join(this.uploadDir, `${id}.part`); }
  uploadReceipt(row) {
    return { id: row.id, state: row.state, receivedBytes: row.received, totalBytes: row.total,
      nextChunkIndex: Math.ceil(row.received / UPLOAD_CHUNK_BYTES), ...(row.status ? { result: { status: row.status, body: JSON.parse(row.body || 'null') } } : {}) };
  }

  async lock(id, callback) {
    const prior = this.locks.get(id) || Promise.resolve();
    const next = prior.catch(() => {}).then(callback); this.locks.set(id, next);
    try { return await next; } finally { if (this.locks.get(id) === next) this.locks.delete(id); }
  }

  async handleUpload(route, request, response) {
    if (route.action === 'create') {
      const bytes = await bufferBody(request, 4096); let data;
      try { data = JSON.parse(bytes.toString('utf8')); } catch { throw fail('INVALID_UPLOAD', '上传资料无效。'); }
      if (!UUID.test(data.id || '') || !validMediaType(data.kind, data.contentType) || !Number.isSafeInteger(data.totalBytes) || data.totalBytes < 1 || data.totalBytes > MAX_UPLOAD_BYTES || data.chunkBytes !== UPLOAD_CHUNK_BYTES)
        throw fail('INVALID_UPLOAD', '上传编号、格式或大小无效。');
      const id = data.id.toLowerCase(), mime = data.contentType.split(';')[0].trim().toLowerCase();
      await this.lock(id, async () => {
        const prior = this.db.prepare('SELECT * FROM uploads WHERE id=?').get(id);
        if (prior) {
          if (prior.kind !== data.kind || prior.mime !== mime || prior.total !== data.totalBytes) throw fail('UPLOAD_CONFLICT', '上传编号已用于不同文件。', 409);
          sendJson(response, 200, this.uploadReceipt(prior)); return;
        }
        if (this.db.prepare("SELECT COUNT(*) AS count FROM uploads WHERE state IN ('receiving','committing')").get().count >= 16) throw fail('UPLOAD_CAPACITY', '正在上传的文件较多，请完成后重试。', 429);
        let file;
        try { file = await open(this.uploadPath(id), 'wx', 0o600); }
        catch (error) {
          // A crash between creating the empty file and committing its row is safe to resume.
          if (error.code !== 'EEXIST' || (await stat(this.uploadPath(id))).size !== 0) throw error;
          file = await open(this.uploadPath(id), 'r+');
        }
        await file.close();
        this.db.prepare("INSERT INTO uploads(id,kind,mime,total,state,updated) VALUES(?,?,?,?,'receiving',?)").run(id, data.kind, mime, data.totalBytes, Date.now());
        sendJson(response, 201, this.uploadReceipt(this.db.prepare('SELECT * FROM uploads WHERE id=?').get(id)));
      }); return;
    }
    const id = route.id;
    let row = this.db.prepare('SELECT * FROM uploads WHERE id=?').get(id);
    if (!row) { sendJson(response, 404, { error: '上传不存在或已过期。' }); return; }
    if (request.method === 'GET') { sendJson(response, 200, this.uploadReceipt(row)); return; }
    if (request.method === 'DELETE') {
      await this.lock(id, async () => {
        row = this.db.prepare('SELECT * FROM uploads WHERE id=?').get(id);
        if (row.state === 'committing') throw fail('UPLOAD_COMMITTING', '文件正在保存，请等待结果。', 409);
        if (row.state === 'done') throw fail('UPLOAD_COMMITTED', '文件已经保存，请从素材库管理。', 409);
        await unlink(this.uploadPath(id)).catch(error => { if (error.code !== 'ENOENT') throw error; });
        this.db.prepare("UPDATE uploads SET state='cancelled',updated=? WHERE id=?").run(Date.now(), id);
        sendJson(response, 200, { cancelled: true });
      }); return;
    }
    if (route.action === 'chunk') {
      const bytes = await bufferBody(request, UPLOAD_CHUNK_BYTES), digest = hash(bytes);
      await this.lock(id, async () => {
        row = this.db.prepare('SELECT * FROM uploads WHERE id=?').get(id);
        if (row.state !== 'receiving') throw fail('UPLOAD_NOT_RECEIVING', '当前上传已停止接收分片。', 409);
        const offset = route.chunkIndex * UPLOAD_CHUNK_BYTES;
        const expected = Math.min(UPLOAD_CHUNK_BYTES, row.total - offset);
        if (offset < 0 || expected < 1 || bytes.length !== expected) throw fail('INVALID_CHUNK_SIZE', '分片大小无效。');
        const previous = this.db.prepare('SELECT size,hash FROM chunks WHERE upload_id=? AND chunk_index=?').get(id, route.chunkIndex);
        if (previous) {
          if (previous.hash !== digest || previous.size !== bytes.length) throw fail('CHUNK_CONFLICT', '这个分片编号已保存了不同内容。', 409);
          sendJson(response, 200, this.uploadReceipt(row)); return;
        }
        if (offset !== row.received) throw fail('CHUNK_ORDER', '请按顺序上传分片。', 409);
        const file = await open(this.uploadPath(id), 'r+');
        try {
          let written = 0;
          while (written < bytes.length) written += (await file.write(bytes, written, bytes.length - written, offset + written)).bytesWritten;
          await file.truncate(offset + bytes.length); await file.sync();
        } finally { await file.close(); }
        this.db.exec('BEGIN IMMEDIATE');
        try {
          this.db.prepare('INSERT INTO chunks(upload_id,chunk_index,size,hash) VALUES(?,?,?,?)').run(id, route.chunkIndex, bytes.length, digest);
          this.db.prepare('UPDATE uploads SET received=?,updated=? WHERE id=?').run(offset + bytes.length, Date.now(), id);
          this.db.exec('COMMIT');
        } catch (error) { this.db.exec('ROLLBACK'); throw error; }
        sendJson(response, 200, this.uploadReceipt(this.db.prepare('SELECT * FROM uploads WHERE id=?').get(id)));
      }); return;
    }
    if (route.action === 'commit') {
      await bufferBody(request, 4096);
      let job;
      await this.lock(id, async () => {
        row = this.db.prepare('SELECT * FROM uploads WHERE id=?').get(id);
        if (row.state !== 'receiving') return;
        if (row.received !== row.total || (await stat(this.uploadPath(id))).size !== row.total) throw fail('UPLOAD_INCOMPLETE', '文件尚未上传完整。', 409);
        this.db.prepare("UPDATE uploads SET state='committing',updated=? WHERE id=?").run(Date.now(), id);
        job = this.track(this.commitUpload(row));
      });
      if (job) await Promise.race([job, sleep(this.dependencies.pendingAfterMs ?? 20000)]);
      row = this.db.prepare('SELECT * FROM uploads WHERE id=?').get(id);
      if (row.state === 'committing') sendJson(response, 202, { state: 'committing', relayPending: true, operationId: id });
      else if (row.state === 'done') sendJson(response, 200, { state: 'done', status: row.status, body: JSON.parse(row.body || 'null') });
      else sendJson(response, row.status || 409, { state: row.state, ...(JSON.parse(row.body || 'null') || { error: '上传已取消。' }) });
    }
  }

  async commitUpload(row) {
    try {
      const result = await this.rawJson({ app: 'media', method: 'POST', path: `/api/film-studio/v1/upload/${row.kind}`, timeoutMs: 240000 }, undefined,
        { file: { path: this.uploadPath(row.id), mime: row.mime, size: row.total } });
      const state = result.status >= 200 && result.status < 300 ? 'done' : 'failed';
      this.db.prepare('UPDATE uploads SET state=?,status=?,body=?,updated=? WHERE id=?').run(state, result.status, JSON.stringify(result.body ?? null), Date.now(), row.id);
      if (state === 'done') await unlink(this.uploadPath(row.id)).catch(() => {});
    } catch {
      this.db.prepare("UPDATE uploads SET state='uncertain',status=409,body=?,updated=? WHERE id=?").run(JSON.stringify(uncertain), Date.now(), row.id);
    }
  }

  async checkHealth() {
    const results = await Promise.allSettled(['github','finance','media'].map(async app => {
      const path = { github: '/v1/github-workspace/connection', finance: '/v1/finance/mobile/health', media: '/api/film-studio/v1/libraries' }[app];
      const result = await this.rawJson({ app, path, method: 'GET', timeoutMs: 3000 });
      return result.status === 200;
    }));
    ['github','finance','media'].forEach((app, index) => { this.status.backends[app] = results[index].status === 'fulfilled' && results[index].value; });
  }

  async cleanup() {
    if (!this.db || Date.now() - this.lastCleanup < 3600000) return;
    this.lastCleanup = Date.now(); const cutoff = Date.now() - 7 * 86400000;
    for (const row of this.db.prepare("SELECT id FROM uploads WHERE updated<? AND state<>'committing'").all(cutoff)) {
      await unlink(this.uploadPath(row.id)).catch(() => {});
      this.db.prepare('DELETE FROM chunks WHERE upload_id=?').run(row.id);
      this.db.prepare('DELETE FROM uploads WHERE id=?').run(row.id);
    }
    this.db.prepare("DELETE FROM operations WHERE updated<? AND state<>'running'").run(cutoff);
    for (const name of await readdir(this.uploadDir)) {
      if (!/^[0-9a-f-]{36}\.part$/.test(name)) continue;
      const id = name.slice(0, -5);
      if (!UUID.test(id) || this.db.prepare('SELECT 1 FROM uploads WHERE id=?').get(id)) continue;
      const file = this.uploadPath(id);
      if ((await stat(file)).mtimeMs < Date.now() - 86400000) await unlink(file).catch(() => {});
    }
  }

  async startTunnel() {
    if (this.stopped || this.tunnel || this.restarting) return;
    this.restarting = true;
    try {
      const candidates = [this.dependencies.cloudflaredPath, path.join(process.env.LOCALAPPDATA || path.join(os.homedir(), 'AppData', 'Local'), 'Microsoft', 'WinGet', 'Links', 'cloudflared.exe')].filter(Boolean);
      let executable;
      for (const candidate of candidates) { try { await access(candidate); executable = await realpath(candidate); break; } catch { /* Next known installed location. */ } }
      if (!executable) { this.status.state = 'tunnel-tool-unavailable'; return; }
      if (this.stopped) return;
      const ownership = await this.tunnelOwner.prepare(executable, this.port);
      if (this.stopped) { await this.tunnelOwner.forget(ownership.record.nonce); return; }
      this.tunnelLease = ownership.record;
      const child = (this.dependencies.spawn || spawn)(executable, ownership.args, { windowsHide: true, stdio: ['ignore','pipe','pipe'] });
      this.tunnel = child; this.relayUrl = null; this.status.registered = false;
      let tail = '';
      const inspect = chunk => {
        tail = (tail + chunk.toString('utf8')).slice(-8192);
        const url = relayUrlFromOutput(tail);
        if (url && !this.relayUrl) { this.relayUrl = url; this.status.state = 'registering'; void this.heartbeat(); }
      };
      child.stdout?.on('data', inspect); child.stderr?.on('data', inspect);
      const ended = () => {
        if (this.tunnel !== child) return;
        this.tunnel = null; this.relayUrl = null; this.status.registered = false; this.status.state = 'tunnel-reconnecting';
        // Exit is authoritative for this child handle. The nonce prevents clearing a newer child's record.
        void this.tunnelOwner.forget(ownership.record.nonce).catch(() => {});
        if (!this.stopped) { clearTimeout(this.restartTimer); this.restartTimer = setTimeout(() => { void this.startTunnel().catch(() => { this.status.state = 'tunnel-reconnecting'; }); }, 5000); this.restartTimer.unref(); }
      };
      child.once('error', () => { if (!child.pid) ended(); else this.status.state = 'tunnel-reconnecting'; });
      child.once('exit', ended);
      try { await this.tunnelOwner.capture(ownership.record, child.pid); }
      catch (error) { child.kill(); throw error; }
    } finally { this.restarting = false; }
  }

  async heartbeat() {
    if (this.stopped || this.registering) return;
    this.registering = true;
    try {
      await this.refreshConfig(); await this.cleanup();
      if (!this.dependencies.disableTunnel && !this.tunnel) await this.startTunnel();
      if (!this.relayUrl || !this.deviceId || !this.relayKey) return;
      const siteUrl = new URL(this.config.siteUrl);
      if (siteUrl.protocol !== 'https:' || siteUrl.username || siteUrl.password || !this.config.sitesToken) return;
      const response = await this.cloud(new URL('/api/local-apps/registration', siteUrl), { method: 'POST', redirect: 'error', signal: AbortSignal.timeout(10000),
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${this.config.ingestToken}`, 'OAI-Sites-Authorization': `Bearer ${this.config.sitesToken}` },
        body: JSON.stringify({ deviceId: this.deviceId, relayUrl: this.relayUrl }) });
      if (!response.ok) { this.status.registered = false; this.status.state = `registration-http-${response.status}`; return; }
      this.status.registered = true; this.status.state = 'connected'; this.status.lastRegisteredAt = new Date().toISOString();
    } catch { this.status.registered = false; this.status.state = 'registration-retrying'; }
    finally { this.registering = false; }
  }

  async stop() {
    this.stopped = true; clearInterval(this.timer); clearTimeout(this.restartTimer);
    this.tunnel?.kill(); this.tunnel = null; this.relayUrl = null;
    if (this.tunnelLease) {
      try { await this.tunnelOwner.cleanup({ nonce: this.tunnelLease.nonce }); } catch { /* Keep the ownership record for verified cleanup at the next start. */ }
      this.tunnelLease = null;
    }
    this.server?.closeAllConnections();
    if (this.server) await new Promise(resolve => this.server.close(resolve));
    this.server = null;
    for (const upstream of this.upstreams) upstream.destroy(new Error('relay-stopping'));
    await Promise.allSettled([...this.jobs]);
    await this.storage?.stop(); this.storage = null;
    this.db?.close(); this.db = null; this.cookies.clear(); this.relayKey = null;
    this.status.state = 'stopped'; this.status.registered = false;
  }
}
