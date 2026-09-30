import http from 'node:http';
import path from 'node:path';
import { mkdirSync } from 'node:fs';
import { DatabaseSync } from 'node:sqlite';
import { createHash } from 'node:crypto';

const MAX_BYTES = 16 * 1024 * 1024;
const UUID = /^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/i;
const send = (res, status, body) => { res.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff' }); res.end(JSON.stringify(body)); };
async function readJson(req) {
  const chunks = []; let size = 0;
  for await (const chunk of req) { size += chunk.length; if (size > MAX_BYTES) throw new Error('too-large'); chunks.push(chunk); }
  return JSON.parse(Buffer.concat(chunks).toString('utf8'));
}
function validLedger(data) {
  if (typeof data !== 'string' || Buffer.byteLength(data) > MAX_BYTES - 1000) return false;
  try { const value = JSON.parse(data); return value && typeof value === 'object' && !Array.isArray(value) && Array.isArray(value.transactions); } catch { return false; }
}

// The original browser ledger is copied once. All new clients share this separate,
// durable local ledger; no original browser or source file is ever overwritten.
export function createFinanceStorage(dataDir) {
  mkdirSync(dataDir, { recursive: true });
  const db = new DatabaseSync(path.join(dataDir, 'finance-store.sqlite'));
  db.exec(`PRAGMA journal_mode=WAL; PRAGMA synchronous=FULL; PRAGMA busy_timeout=5000;
    CREATE TABLE IF NOT EXISTS ledger(id INTEGER PRIMARY KEY CHECK(id=1),revision INTEGER NOT NULL,data TEXT NOT NULL);
    CREATE TABLE IF NOT EXISTS receipts(id TEXT PRIMARY KEY,fingerprint TEXT NOT NULL,revision INTEGER NOT NULL,created INTEGER NOT NULL);`);
  let importServer;
  const current = () => { const row = db.prepare('SELECT revision,data FROM ledger WHERE id=1').get(); return row ? { initialized: true, ...row } : { initialized: false, revision: 0, data: null }; };
  async function handle(req, res, url) {
    const pathname = typeof url === 'string' ? new URL(url, 'http://localhost').pathname : url.pathname;
    if (pathname !== '/relay/finance/storage/finance' && pathname !== '/storage/finance') return send(res, 404, { error: 'Not found' });
    if (req.method === 'GET') return send(res, 200, current());
    if (req.method !== 'PUT') return send(res, 405, { error: 'Method not allowed' });
    const operation = req.headers['x-pulse-operation-id'];
    if (typeof operation !== 'string' || !UUID.test(operation)) return send(res, 400, { error: 'Missing operation identifier' });
    let body; try { body = await readJson(req); } catch { return send(res, 400, { error: '账本格式不正确或超过保存大小限制。' }); }
    if (!Number.isSafeInteger(body.revision) || body.revision < 0 || !validLedger(body.data)) return send(res, 400, { error: '账本格式不正确。' });
    const fingerprint = createHash('sha256').update(JSON.stringify(body)).digest('hex');
    const receipt = db.prepare('SELECT * FROM receipts WHERE id=?').get(operation);
    if (receipt) return receipt.fingerprint === fingerprint ? send(res, 200, { initialized: true, revision: receipt.revision }) : send(res, 409, { error: '保存编号冲突，请重新读取账本。' });
    const prior = current();
    if (body.revision !== prior.revision) return send(res, 409, { error: '其他页面已更新账本，请重新读取后再编辑。', revision: prior.revision });
    const revision = prior.revision + 1;
    db.exec('BEGIN IMMEDIATE');
    try {
      db.prepare('INSERT INTO ledger(id,revision,data) VALUES(1,?,?) ON CONFLICT(id) DO UPDATE SET revision=excluded.revision,data=excluded.data').run(revision, body.data);
      db.prepare('INSERT INTO receipts VALUES(?,?,?,?)').run(operation, fingerprint, revision, Date.now());
      db.prepare('DELETE FROM receipts WHERE created<?').run(Date.now() - 7 * 86400000);
      db.exec('COMMIT');
      return send(res, 200, { initialized: true, revision });
    } catch { db.exec('ROLLBACK'); return send(res, 503, { error: '本机账本暂时无法保存，请稍后重试。' }); }
  }
  async function startImportServer() {
    if (importServer) return;
    // A separate loopback port is deliberately NOT the Cloudflare relay target.
    importServer = http.createServer(async (req, res) => {
      const origin = req.headers.origin;
      if (req.headers.host !== '127.0.0.1:43873' || origin !== 'http://127.0.0.1:5174' || req.headers['cf-connecting-ip']) return send(res, 403, { error: '请在原电脑的账本迁移页面操作。' });
      res.setHeader('Access-Control-Allow-Origin', origin);
      res.setHeader('Vary', 'Origin');
      if (req.method === 'OPTIONS') { res.writeHead(204, { 'Access-Control-Allow-Methods': 'GET,POST,OPTIONS', 'Access-Control-Allow-Headers': 'Content-Type', 'Access-Control-Allow-Private-Network': 'true' }); return res.end(); }
      if (req.url !== '/storage/finance/import') return send(res, 404, { error: 'Not found' });
      if (req.method === 'GET') return send(res, 200, { initialized: current().initialized });
      if (req.method !== 'POST') return send(res, 405, { error: 'Method not allowed' });
      if (current().initialized) return send(res, 409, { error: '新版账本已初始化，原账本不会覆盖它。' });
      let body; try { body = await readJson(req); } catch { return send(res, 400, { error: '无法读取原账本。' }); }
      if (!validLedger(body.data)) return send(res, 400, { error: '原账本格式不正确。' });
      // The unique id prevents two simultaneous imports from overwriting one another.
      try { db.prepare('INSERT INTO ledger VALUES(1,1,?)').run(body.data); return send(res, 200, { initialized: true, revision: 1 }); }
      catch { return send(res, 409, { error: '新版账本已经初始化，请返回新版查看。' }); }
    });
    await new Promise((resolve, reject) => { importServer.once('error', reject); importServer.listen(43873, '127.0.0.1', resolve); });
  }
  async function stop() { if (importServer) await new Promise(resolve => importServer.close(resolve)); db.close(); }
  return { handle, startImportServer, stop };
}
