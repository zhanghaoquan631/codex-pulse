import { createHash, randomUUID } from 'node:crypto';
import { readFile, mkdir } from 'node:fs/promises';
import path from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import { allowedBridgeRequest } from '../integration/mezip/bridge-policy.mjs';
import { LocalCaptureSupervisor, requestLocalCapture } from './mezip-service.mjs';

const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const uncertain = { error: '操作可能已在这台电脑完成，但未能确认结果。请刷新记录核实；系统不会自动重复执行。', code: 'MEZIP_RESULT_UNCERTAIN' };
const error = (code, message) => ({ error: message, code });

export class MezipCollector {
  // Only tests pass dependency overrides. Production always uses the fixed
  // loopback transport above and the existing collector configuration.
  constructor(dataDir, configFile, dependencies = {}) {
    this.dataDir = dataDir; this.configFile = configFile;
    this.readConfig = dependencies.readConfig || (async () => JSON.parse((await readFile(configFile, 'utf8')).replace(/^\uFEFF/, '')));
    this.cloud = dependencies.fetchCloud || fetch;
    this.local = dependencies.requestLocal || requestLocalCapture;
    const supervisor = new LocalCaptureSupervisor();
    this.ensureBackend = dependencies.ensureBackend || (config => supervisor.ensure(config));
    this.now = dependencies.now || Date.now;
    this.status = { state: 'waiting', online: false, lastPoll: null, lastSuccess: null, pendingResults: 0, retryInMs: 2000 };
    this.stopped = false; this.running = null; this.failures = 0; this.db = null;
  }

  async initialize() {
    if (this.db) return;
    await mkdir(this.dataDir, { recursive: true });
    this.db = new DatabaseSync(path.join(this.dataDir, 'mezip.sqlite'));
    this.db.exec(`PRAGMA journal_mode=WAL; PRAGMA synchronous=FULL; PRAGMA busy_timeout=5000;
      CREATE TABLE IF NOT EXISTS meta(key TEXT PRIMARY KEY,value TEXT NOT NULL);
      CREATE TABLE IF NOT EXISTS commands(id TEXT PRIMARY KEY,fingerprint TEXT NOT NULL,method TEXT NOT NULL,state TEXT NOT NULL,status INTEGER,body TEXT,acked INTEGER NOT NULL DEFAULT 0,updated INTEGER NOT NULL);
      CREATE INDEX IF NOT EXISTS command_pending ON commands(acked,state,updated);`);
    this.db.prepare("INSERT OR IGNORE INTO meta (key,value) VALUES ('deviceId',?)").run(randomUUID());
    this.deviceId = this.db.prepare("SELECT value FROM meta WHERE key='deviceId'").get().value;
    // A write interrupted after sending may already have committed in ME.zip.
    // Never replay it after a crash, even if no response was durably saved.
    this.db.prepare("UPDATE commands SET state='done',status=409,body=?,acked=0,updated=? WHERE state='running' AND method<>'GET'").run(JSON.stringify(uncertain), this.now());
    this.db.prepare("UPDATE commands SET state='retry' WHERE state='running' AND method='GET'").run();
  }

  finish(id, status, body) {
    let encoded = JSON.stringify(body ?? null);
    if (Buffer.byteLength(encoded) > 1_750_000) { status = 502; encoded = JSON.stringify(error('MEZIP_RESULT_TOO_LARGE', '这条记录太大，暂时无法通过远程连接读取。')); }
    this.db.prepare("UPDATE commands SET state='done',status=?,body=?,acked=0,updated=? WHERE id=?").run(status, encoded, this.now(), id);
  }

  async execute(command) {
    if (!command || !uuid.test(command.id || '')) return;
    const { id, method, path: requestPath } = command;
    let encoded;
    try { encoded = JSON.stringify(command.body ?? null); } catch { encoded = 'null'; }
    const fingerprint = createHash('sha256').update(JSON.stringify([method, requestPath, encoded])).digest('hex');
    const prior = this.db.prepare('SELECT * FROM commands WHERE id=?').get(id);
    if (prior && prior.fingerprint !== fingerprint) {
      this.finish(id, 409, error('MEZIP_COMMAND_CONFLICT', '操作编号重复，已拒绝执行。')); return;
    }
    if (prior?.state === 'done') { this.db.prepare('UPDATE commands SET acked=0,updated=? WHERE id=?').run(this.now(), id); return; }
    if (prior?.state === 'running') return;
    this.db.prepare("INSERT OR IGNORE INTO commands (id,fingerprint,method,state,updated) VALUES (?,?,?,'retry',?)").run(id, fingerprint, typeof method === 'string' ? method : '', this.now());
    if (!allowedBridgeRequest(method, requestPath) || Buffer.byteLength(encoded) > 200000) {
      this.finish(id, 403, error('MEZIP_COMMAND_REJECTED', '不支持的本机操作。')); return;
    }
    if (!Number.isFinite(command.expires) || command.expires <= this.now()) {
      this.finish(id, 408, error('MEZIP_COMMAND_EXPIRED', '连接等待时间过长，这项操作尚未执行。请重新操作。')); return;
    }
    // This commit completes before the HTTP request is allowed to start.
    this.db.prepare("UPDATE commands SET state='running',updated=? WHERE id=?").run(this.now(), id);
    try {
      const response = await this.local(method, requestPath, command.body ?? undefined);
      if (!Number.isInteger(response.status) || response.status < 200 || response.status > 599) throw new Error('invalid-status');
      // Redirects are never followed by the fixed local transport.
      if (response.status >= 300 && response.status < 400) {
        this.finish(id, 502, error('MEZIP_REDIRECT_REJECTED', '本机服务返回了意外的跳转。'));
      } else this.finish(id, response.status, response.body);
    } catch {
      this.finish(id, method === 'GET' ? 503 : 409, method === 'GET'
        ? error('MEZIP_LOCAL_OFFLINE', '本机服务暂时未连接，请稍后重试。') : uncertain);
    }
  }

  pendingResults() {
    const results = []; let bytes = 0;
    for (const row of this.db.prepare("SELECT id,status,body FROM commands WHERE state='done' AND acked=0 ORDER BY updated LIMIT 16").all()) {
      const size = Buffer.byteLength(row.body) + 160;
      if (bytes + size > 3_700_000) break;
      results.push({ id: row.id, status: row.status, body: JSON.parse(row.body) }); bytes += size;
    }
    return results;
  }

  async exchange() {
    await this.initialize();
    this.status.lastPoll = new Date(this.now()).toISOString();
    let config;
    try { config = await this.readConfig(); } catch { config = {}; }
    const backend = await this.ensureBackend(config).catch(() => ({ online: false, state: 'local-service-unavailable' }));
    this.status.online = backend.online === true; this.status.backend = backend.state;
    if (!config.siteUrl || !config.ingestToken || !config.sitesToken) {
      this.status.state = 'not-configured'; this.failures++; return;
    }
    try {
      const base = new URL(config.siteUrl);
      if (base.protocol !== 'https:' || base.username || base.password) throw new Error('https-required');
      const results = this.pendingResults();
      const response = await this.cloud(new URL('/api/mezip/bridge', base), {
        method: 'POST', redirect: 'error', signal: AbortSignal.timeout(15000),
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${config.ingestToken}`, 'OAI-Sites-Authorization': `Bearer ${config.sitesToken}` },
        body: JSON.stringify({ deviceId: this.deviceId, online: this.status.online, results }),
      });
      if (!response.ok) { this.status.state = `http-${response.status}`; this.failures++; return; }
      const reply = await response.json();
      if (reply?.ok !== true || !Array.isArray(reply.commands) || reply.commands.length > 8) throw new Error('invalid-bridge-response');
      this.db.exec('BEGIN');
      try {
        for (const result of results) this.db.prepare('UPDATE commands SET acked=1,updated=? WHERE id=?').run(this.now(), result.id);
        // Keep deduplication receipts for a full week after acknowledgement.
        this.db.prepare('DELETE FROM commands WHERE acked=1 AND updated<?').run(this.now() - 7 * 86400000);
        this.db.exec('COMMIT');
      } catch (failure) { this.db.exec('ROLLBACK'); throw failure; }
      this.status.lastSuccess = new Date(this.now()).toISOString(); this.status.state = this.status.online ? 'connected' : 'waiting-for-local-service'; this.failures = 0;
      if (!this.stopped && this.status.online) {
        let reads = [];
        for (const command of reply.commands) {
          if (command.method === 'GET') reads.push(this.execute(command));
          else { await Promise.all(reads); reads = []; await this.execute(command); }
        }
        await Promise.all(reads);
      }
    } catch { this.status.state = 'network-error'; this.failures++; }
    finally { this.status.pendingResults = this.db.prepare("SELECT COUNT(*) n FROM commands WHERE state='done' AND acked=0").get().n; }
  }

  async poll() {
    if (this.running) return this.running;
    this.running = this.exchange().catch(() => { this.status.state = 'bridge-error'; this.failures++; }).finally(() => {
      this.status.retryInMs = Math.min(30000, 2000 * 2 ** Math.min(this.failures, 4)); this.running = null;
    });
    return this.running;
  }

  start() {
    this.stopped = false;
    const cycle = async () => {
      if (this.stopped) return;
      await this.poll();
      if (!this.stopped) this.timer = setTimeout(cycle, this.status.retryInMs);
    };
    cycle();
  }

  async stop() {
    this.stopped = true; clearTimeout(this.timer);
    if (this.running) await this.running;
    this.db?.close(); this.db = null;
  }
}
