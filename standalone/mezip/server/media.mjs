// Workers module. Bundle qrcode's platform-neutral core; no fs/Node runtime APIs.
import QRCode from 'qrcode/lib/core/qrcode.js';

const MiB = 1024 * 1024;
const MAX_UPLOAD = 20 * MiB;
const OWNER_BYTES = 100 * MiB;
const OWNER_FILES = 50;
const GUEST_LIFE = 60 * 60 * 1000;
const SESSION_LIFE = 12 * 60 * 60 * 1000;
const STALE_RESERVATION = 15 * 60 * 1000;
const encoder = new TextEncoder();
const MIME_EXT = { 'image/png': 'png', 'image/jpeg': 'jpg', 'image/webp': 'webp', 'image/gif': 'gif', 'video/mp4': 'mp4' };
const PAGEVIEW_PATHS = new Set(['/api/pageviews', '/api/views', '/api/analytics/views']);

class RequestError extends Error {
  constructor(status, message, code = 'request_failed') { super(message); this.status = status; this.code = code; }
}
const json = (status, value, extra = {}) => new Response(JSON.stringify(value), {
  status, headers: { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff', ...extra },
});
const clean = (value, max = 180) => String(value || '').replace(/[\u0000-\u001f\u007f]/g, ' ').trim().slice(0, max);
const decodeHeader = (request, name) => {
  try { return clean(decodeURIComponent(request.headers.get(name) || '')); } catch { return ''; }
};
const stamp = value => new Date(value).toISOString();
const token = () => Array.from(crypto.getRandomValues(new Uint8Array(32)), b => b.toString(16).padStart(2, '0')).join('');
const digest = async value => Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256', encoder.encode(value))), b => b.toString(16).padStart(2, '0')).join('');
const equal = (a, b) => {
  if (typeof a !== 'string' || typeof b !== 'string' || a.length !== b.length) return false;
  let difference = 0; for (let i = 0; i < a.length; i++) difference |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return difference === 0;
};
const changed = result => Number(result?.meta?.changes || 0);
const first = (db, sql, ...args) => db.prepare(sql).bind(...args).first();
const all = async (db, sql, ...args) => (await db.prepare(sql).bind(...args).all()).results || [];
const run = (db, sql, ...args) => db.prepare(sql).bind(...args).run();
const ownerKey = user => typeof user?.key === 'string' && /^[a-zA-Z0-9_-]{8,128}$/.test(user.key) ? user.key : null;
const requireOwner = user => { const key = ownerKey(user); if (!key) throw new RequestError(401, '请先登录邮箱账号', 'authentication_required'); return key; };

async function bodyBytes(request, limit = MAX_UPLOAD) {
  const declared = request.headers.get('content-length');
  if (declared && (!/^\d+$/.test(declared) || Number(declared) > limit)) throw new RequestError(413, '文件不能超过 20 MB', 'upload_too_large');
  if (!request.body) return new Uint8Array();
  const reader = request.body.getReader(), chunks = []; let size = 0;
  try {
    while (true) {
      const part = await reader.read(); if (part.done) break;
      size += part.value.byteLength;
      if (size > limit) { await reader.cancel(); throw new RequestError(413, '文件不能超过 20 MB', 'upload_too_large'); }
      chunks.push(part.value);
    }
  } finally { reader.releaseLock(); }
  const result = new Uint8Array(size); let offset = 0;
  for (const chunk of chunks) { result.set(chunk, offset); offset += chunk.byteLength; }
  return result;
}
async function bodyJson(request, limit = 16 * 1024) {
  let value;
  try { value = JSON.parse(new TextDecoder().decode(await bodyBytes(request, limit))); }
  catch (error) { if (error instanceof RequestError) throw error; throw new RequestError(400, '请求格式无效', 'invalid_json'); }
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new RequestError(400, '请求格式无效', 'invalid_json');
  return value;
}
function mediaType(bytes) {
  const ascii = (start, count) => String.fromCharCode(...bytes.subarray(start, start + count));
  if (bytes.length >= 24 && [137,80,78,71,13,10,26,10].every((v, i) => bytes[i] === v) && ascii(12, 4) === 'IHDR') return 'image/png';
  if (bytes.length >= 4 && bytes[0] === 255 && bytes[1] === 216 && bytes[2] === 255) return 'image/jpeg';
  if (bytes.length >= 10 && /^GIF8[79]a$/.test(ascii(0, 6))) return 'image/gif';
  if (bytes.length >= 16 && ascii(0, 4) === 'RIFF' && ascii(8, 4) === 'WEBP') return 'image/webp';
  if (bytes.length >= 16 && ascii(4, 4) === 'ftyp') {
    const size = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength).getUint32(0);
    if (size >= 16 && size <= bytes.length && ['isom','iso2','iso3','iso4','iso5','iso6','mp41','mp42','avc1','M4V ','MSNV','dash'].includes(ascii(8, 4))) return 'video/mp4';
  }
  throw new RequestError(415, '请选择有效的 PNG、JPG、WebP、GIF 或 MP4 文件', 'unsupported_media');
}
function uploadDto(row) {
  return {
    id: row.id, filename: row.filename, originalFilename: row.original_filename,
    mediaType: row.media_type, caption: row.caption || '', placement: row.placement || '',
    size: row.size, uploadedAt: stamp(row.created_at), url: `/media/user-uploads/${row.filename}`,
  };
}
function qrDataUrl(url) {
  const { modules } = QRCode.create(url, { errorCorrectionLevel: 'M' });
  const side = modules.size, margin = 4, rects = [];
  for (let y = 0; y < side; y++) for (let x = 0; x < side; x++) if (modules.get(y, x)) rects.push(`M${x + margin} ${y + margin}h1v1h-1z`);
  const dimension = side + margin * 2;
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${dimension} ${dimension}" width="256" height="256" shape-rendering="crispEdges"><path fill="#fff" d="M0 0h${dimension}v${dimension}H0z"/><path fill="#000" d="${rects.join('')}"/></svg>`;
  return `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`;
}

async function cleanup(env, key, now) {
  const rows = await all(env.DB, `SELECT id, object_key FROM media_objects WHERE owner_key = ? AND
    ((expires_at IS NOT NULL AND expires_at <= ?) OR (state = 'reserved' AND created_at <= ?)) LIMIT 100`, key, now, now - STALE_RESERVATION);
  if (rows.length) {
    // Delete bytes before releasing the reservation: failures remain counted toward quota.
    await env.BUCKET.delete(rows.map(row => row.object_key));
    await env.DB.batch(rows.map(row => env.DB.prepare('DELETE FROM media_objects WHERE id = ? AND owner_key = ?').bind(row.id, key)));
  }
  await run(env.DB, 'DELETE FROM media_sessions WHERE owner_key = ? AND expires_at <= ?', key, now);
  await run(env.DB, 'DELETE FROM media_links WHERE owner_key = ? AND ((expires_at IS NOT NULL AND expires_at <= ?) OR (revoked_at IS NOT NULL AND revoked_at <= ?))', key, now - 86400000, now - 86400000);
}
async function linkFor(env, hash, now) {
  return first(env.DB, 'SELECT * FROM media_links WHERE token_hash = ? AND revoked_at IS NULL AND (expires_at IS NULL OR expires_at > ?)', hash, now);
}
async function mobileGrant(request, env, now, { allowOwnerLink = false } = {}) {
  const raw = (request.headers.get('authorization') || '').replace(/^Bearer /i, '');
  if (!/^[a-f0-9]{64}$/.test(raw)) throw new RequestError(401, '请使用有效的手机上传链接', 'invalid_token');
  const hash = await digest(raw), direct = await linkFor(env, hash, now);
  if (direct && (direct.kind === 'guest' || allowOwnerLink)) return { ...direct, link_hash: direct.token_hash, ownerLink: direct.kind === 'owner', bearer_hash: hash };
  const session = await first(env.DB, `SELECT s.*, l.kind, l.upload_count, l.expires_at AS link_expires_at FROM media_sessions s
    JOIN media_links l ON l.token_hash = s.link_hash WHERE s.token_hash = ? AND s.expires_at > ?
    AND l.revoked_at IS NULL AND (l.expires_at IS NULL OR l.expires_at > ?)`, hash, now, now);
  if (!session) throw new RequestError(410, '链接已到期或撤销，请重新生成', 'expired_token');
  return { ...session, bearer_hash: hash, ownerLink: false };
}
async function grantStillValid(env, grant, now) {
  if (!grant) return true;
  const link = await linkFor(env, grant.link_hash, now);
  if (!link) return false;
  if (grant.kind === 'guest') return true;
  return Boolean(await first(env.DB, 'SELECT token_hash FROM media_sessions WHERE token_hash = ? AND link_hash = ? AND expires_at > ?', grant.bearer_hash, grant.link_hash, now));
}

async function saveUpload(request, env, key, now, grant = null) {
  await cleanup(env, key, now);
  const bytes = await bodyBytes(request);
  if (!bytes.byteLength) throw new RequestError(400, '请选择文件', 'empty_upload');
  const type = mediaType(bytes), isGuest = grant?.kind === 'guest';
  if (grant && type === 'video/mp4') throw new RequestError(415, '手机照片入口仅接收图片', 'image_required');
  const supplied = (request.headers.get('x-media-type') || request.headers.get('content-type') || '').split(';')[0].trim().toLowerCase();
  if (supplied && supplied !== 'application/octet-stream' && supplied !== type) throw new RequestError(415, '文件类型与内容不一致', 'media_type_mismatch');
  const id = crypto.randomUUID(), filename = `${id}.${MIME_EXT[type]}`;
  const objectKey = `private-media/${key}/${id}`;
  const expires = isGuest ? grant.expires_at : null;
  const original = decodeHeader(request, 'x-filename').replace(/\\/g, '/').split('/').pop() || filename;
  const caption = grant ? '' : decodeHeader(request, 'x-caption');
  const placement = grant ? 'orbit-images' : clean(request.headers.get('x-placement'), 80);
  const globalBytes = Number.isSafeInteger(Number(env.MEDIA_TOTAL_BYTES)) && Number(env.MEDIA_TOTAL_BYTES) >= 0 ? Number(env.MEDIA_TOTAL_BYTES) : 256 * MiB;
  const globalFiles = Number.isSafeInteger(Number(env.MEDIA_TOTAL_FILES)) && Number(env.MEDIA_TOTAL_FILES) >= 0 ? Number(env.MEDIA_TOTAL_FILES) : 500;
  const reserve = env.DB.prepare(`INSERT INTO media_objects
    (id, owner_key, object_key, filename, original_filename, media_type, size, caption, placement, created_at, expires_at, kind, link_hash, state)
    SELECT ?,?,?,?,?,?,?,?,?,?,?,?,?, 'reserved'
    WHERE (SELECT COUNT(*) FROM media_objects WHERE owner_key = ?) < ?
      AND COALESCE((SELECT SUM(size) FROM media_objects WHERE owner_key = ?), 0) + ? <= ?
      AND (SELECT COUNT(*) FROM media_objects) < ?
      AND COALESCE((SELECT SUM(size) FROM media_objects), 0) + ? <= ?
      AND (? IS NULL OR EXISTS (SELECT 1 FROM media_links WHERE token_hash = ? AND owner_key = ? AND revoked_at IS NULL
        AND (expires_at IS NULL OR expires_at > ?) AND (kind != 'guest' OR upload_count < 20)))`).bind(
      id, key, objectKey, filename, original, type, bytes.byteLength, caption, placement, now, expires,
      isGuest ? 'guest' : 'owner', grant?.link_hash || null,
      key, OWNER_FILES, key, bytes.byteLength, OWNER_BYTES,
      globalFiles, bytes.byteLength, globalBytes,
      grant?.link_hash || null, grant?.link_hash || null, key, now);
  const statements = [reserve];
  if (isGuest) statements.push(env.DB.prepare(`UPDATE media_links SET upload_count = upload_count + 1
    WHERE token_hash = ? AND EXISTS (SELECT 1 FROM media_objects WHERE id = ? AND state = 'reserved')`).bind(grant.link_hash, id));
  const reserved = await env.DB.batch(statements);
  if (!changed(reserved[0])) throw new RequestError(429, '网站免费存储容量或账号上传配额已满，或上传链接已失效；请清理旧文件后重试。每个账号最多 50 个文件、100 MB，不会自动升级收费', 'upload_quota');
  try {
    await env.BUCKET.put(objectKey, bytes, { httpMetadata: { contentType: type }, customMetadata: { ownerKey: key, mediaId: id } });
    if (!(await grantStillValid(env, grant, Date.now()))) throw new RequestError(410, '上传期间链接已到期或撤销，文件未保存', 'expired_token');
    const result = await run(env.DB, `UPDATE media_objects SET state = 'ready' WHERE id = ? AND state = 'reserved'`, id);
    if (!changed(result)) throw new RequestError(409, '上传已取消，请重试', 'upload_cancelled');
  } catch (error) {
    // Retain a quota-counted reservation if R2 deletion fails; next cleanup retries it.
    try { await env.BUCKET.delete(objectKey); await run(env.DB, 'DELETE FROM media_objects WHERE id = ?', id); } catch { /* retry via stale-reservation cleanup */ }
    throw error;
  }
  const row = await first(env.DB, 'SELECT * FROM media_objects WHERE id = ?', id);
  if (isGuest) return json(201, { saved: false, temporary: true, expiresAt: expires });
  return json(201, grant ? { saved: true, temporary: false, item: uploadDto(row) } : uploadDto(row));
}

async function serveObject(request, env, user, idOrFilename, temporary) {
  const key = requireOwner(user), now = Date.now();
  const row = await first(env.DB, `SELECT * FROM media_objects WHERE owner_key = ? AND ${temporary ? 'id' : 'filename'} = ?
    AND state = 'ready' AND kind = ? AND (expires_at IS NULL OR expires_at > ?)`, key, idOrFilename, temporary ? 'guest' : 'owner', now);
  if (!row || (row.link_hash && !(await linkFor(env, row.link_hash, now)))) {
    // A permanent owner photo remains readable after its original mobile link rotates.
    if (!row || temporary) throw new RequestError(404, '文件不存在或无权读取', 'not_found');
  }
  const object = await env.BUCKET.get(row.object_key, request.headers.has('range') ? { range: request.headers } : undefined);
  if (!object) throw new RequestError(404, '文件不存在', 'not_found');
  const headers = new Headers({ 'Content-Type': row.media_type, 'Content-Length': String(object.range?.length ?? row.size),
    'Cache-Control': 'private, no-store', 'X-Content-Type-Options': 'nosniff', 'Accept-Ranges': 'bytes',
    'Content-Disposition': `inline; filename="${row.filename}"` });
  if (object.httpEtag) headers.set('ETag', object.httpEtag);
  const range = object.range;
  if (range && Number.isFinite(range.offset) && Number.isFinite(range.length)) headers.set('Content-Range', `bytes ${range.offset}-${range.offset + range.length - 1}/${row.size}`);
  return new Response(request.method === 'HEAD' ? null : object.body, { status: range ? 206 : 200, headers });
}

async function handleUploads(request, env, user, url) {
  const now = Date.now();
  if (url.pathname === '/api/uploads/info' && request.method === 'GET') {
    requireOwner(user);
    return json(200, { host: url.hostname, port: url.port ? Number(url.port) : 443, addresses: [], apiBase: `${url.origin}/api/uploads`, lanUrls: [url.origin] });
  }
  if (url.pathname !== '/api/uploads') return json(404, { error: 'not_found' });
  if (request.method === 'GET') {
    const key = ownerKey(user);
    if (!key) return json(200, { uploads: [] });
    const rows = await all(env.DB, `SELECT * FROM media_objects WHERE owner_key = ? AND kind = 'owner' AND state = 'ready' ORDER BY created_at ASC`, key);
    return json(200, { uploads: rows.map(uploadDto) });
  }
  const key = requireOwner(user);
  if (request.method === 'POST') return saveUpload(request, env, key, now);
  if (request.method === 'DELETE') {
    const id = url.searchParams.get('id') || url.searchParams.get('filename');
    if (!id) throw new RequestError(400, '请选择要删除的文件', 'id_required');
    const row = await first(env.DB, `SELECT * FROM media_objects WHERE owner_key = ? AND (id = ? OR filename = ?) AND kind = 'owner'`, key, id, id);
    if (!row) throw new RequestError(404, '文件不存在或无权删除', 'not_found');
    // Mark unavailable before removing bytes; leave a retryable reservation if storage fails.
    await run(env.DB, `UPDATE media_objects SET state = 'reserved', created_at = ? WHERE id = ?`, now - STALE_RESERVATION, row.id);
    await env.BUCKET.delete(row.object_key);
    await run(env.DB, 'DELETE FROM media_objects WHERE id = ? AND owner_key = ?', row.id, key);
    return json(200, { deleted: uploadDto(row) });
  }
  return json(405, { error: 'method_not_allowed' });
}

async function handleMobile(request, env, user, url) {
  const now = Date.now(), endpoint = url.pathname.slice('/api/mobile-upload/'.length);
  if (endpoint === 'links') {
    const key = requireOwner(user);
    if (request.method === 'DELETE') {
      const raw = url.searchParams.get('token') || '';
      if (!/^[a-f0-9]{64}$/.test(raw)) throw new RequestError(400, '上传链接无效', 'invalid_token');
      const hash = await digest(raw);
      const link = await first(env.DB, 'SELECT * FROM media_links WHERE token_hash = ? AND owner_key = ?', hash, key);
      if (!link) throw new RequestError(404, '上传链接不存在', 'not_found');
      await run(env.DB, 'UPDATE media_links SET revoked_at = ? WHERE token_hash = ? AND owner_key = ?', now, hash, key);
      const rows = await all(env.DB, `SELECT id, object_key FROM media_objects WHERE owner_key = ? AND link_hash = ? AND kind = 'guest'`, key, hash);
      if (rows.length) {
        await env.BUCKET.delete(rows.map(row => row.object_key));
        await run(env.DB, `DELETE FROM media_objects WHERE owner_key = ? AND link_hash = ? AND kind = 'guest'`, key, hash);
      }
      await run(env.DB, 'DELETE FROM media_sessions WHERE owner_key = ? AND link_hash = ?', key, hash);
      return json(200, { revoked: true });
    }
    if (request.method !== 'POST') return json(405, { error: 'method_not_allowed' });
    const { kind } = await bodyJson(request);
    if (!['owner', 'guest'].includes(kind)) throw new RequestError(400, '请选择上传类型', 'invalid_kind');
    await cleanup(env, key, now);
    const raw = token(), hash = await digest(raw), salt = kind === 'owner' ? token() : null;
    const random = crypto.getRandomValues(new Uint32Array(1))[0];
    const pin = kind === 'owner' ? String(10000000 + random % 90000000) : null;
    const pinHash = pin ? await digest(`${salt}:${pin}`) : null;
    const expires = kind === 'guest' ? now + GUEST_LIFE : null;
    const statements = [];
    if (kind === 'owner') statements.push(env.DB.prepare(`UPDATE media_links SET revoked_at = ? WHERE owner_key = ? AND kind = 'owner' AND revoked_at IS NULL`).bind(now, key));
    statements.push(env.DB.prepare(`INSERT INTO media_links (token_hash, owner_key, kind, pin_salt, pin_hash, created_at, expires_at)
      SELECT ?,?,?,?,?,?,? WHERE (SELECT COUNT(*) FROM media_links WHERE owner_key = ? AND kind = 'guest' AND revoked_at IS NULL AND expires_at > ?) < 10 OR ? = 'owner'`)
      .bind(hash, key, kind, salt, pinHash, now, expires, key, now, kind));
    const results = await env.DB.batch(statements);
    if (!changed(results.at(-1))) throw new RequestError(429, '临时链接过多，请先撤销旧链接', 'link_quota');
    const uploadUrl = `${url.origin}/mobile-upload.html#token=${raw}`;
    return json(201, { kind, url: uploadUrl, urls: [uploadUrl], expiresAt: expires, ...(pin ? { pin } : {}), qr: qrDataUrl(uploadUrl) });
  }
  if (endpoint === 'desktop' && request.method === 'GET') {
    const key = requireOwner(user);
    const latest = await first(env.DB, `SELECT m.* FROM media_objects m LEFT JOIN media_links l ON l.token_hash = m.link_hash
      WHERE m.owner_key = ? AND m.state = 'ready' AND (m.expires_at IS NULL OR m.expires_at > ?)
      AND (m.kind = 'owner' OR (l.revoked_at IS NULL AND l.expires_at > ?)) ORDER BY m.created_at DESC, m.id DESC LIMIT 1`, key, now, now);
    return json(200, { latest: latest ? { id: latest.id, src: latest.kind === 'guest' ? `/api/mobile-upload/preview/${latest.id}` : `/media/user-uploads/${latest.filename}`,
      label: latest.original_filename, kind: latest.kind, expiresAt: latest.expires_at } : null });
  }
  if (endpoint.startsWith('preview/') && ['GET', 'HEAD'].includes(request.method)) {
    return serveObject(request, env, user, endpoint.slice('preview/'.length), true);
  }
  if (endpoint === 'session' && request.method === 'GET') {
    const grant = await mobileGrant(request, env, now, { allowOwnerLink: true });
    return json(200, { kind: grant.kind, needsPin: Boolean(grant.ownerLink), expiresAt: grant.expires_at });
  }
  if (endpoint === 'unlock' && request.method === 'POST') {
    const grant = await mobileGrant(request, env, now, { allowOwnerLink: true });
    if (!grant.ownerLink) throw new RequestError(403, '请使用个人上传链接', 'owner_link_required');
    if (grant.locked_until > now) throw new RequestError(429, '尝试次数过多，请 15 分钟后重试', 'pin_locked');
    const { pin } = await bodyJson(request);
    if (!/^\d{8}$/.test(String(pin || '')) || !equal(await digest(`${grant.pin_salt}:${pin}`), grant.pin_hash)) {
      await run(env.DB, `UPDATE media_links SET failed_pins = CASE WHEN failed_pins + 1 >= 5 THEN 0 ELSE failed_pins + 1 END,
        locked_until = CASE WHEN failed_pins + 1 >= 5 THEN ? ELSE locked_until END
        WHERE token_hash = ? AND revoked_at IS NULL`, now + 15 * 60 * 1000, grant.link_hash);
      throw new RequestError(403, '验证码不正确，请查看账号中的个人上传入口', 'invalid_pin');
    }
    const raw = token(), hash = await digest(raw), expiresAt = now + SESSION_LIFE;
    await env.DB.batch([
      env.DB.prepare('UPDATE media_links SET failed_pins = 0, locked_until = 0 WHERE token_hash = ?').bind(grant.link_hash),
      env.DB.prepare('DELETE FROM media_sessions WHERE owner_key = ? AND expires_at <= ?').bind(grant.owner_key, now),
      env.DB.prepare(`INSERT INTO media_sessions (token_hash, link_hash, owner_key, expires_at)
        SELECT ?,?,?,? WHERE EXISTS (SELECT 1 FROM media_links WHERE token_hash = ? AND revoked_at IS NULL)
        AND (SELECT COUNT(*) FROM media_sessions WHERE link_hash = ? AND expires_at > ?) < 10`)
        .bind(hash, grant.link_hash, grant.owner_key, expiresAt, grant.link_hash, grant.link_hash, now),
    ]).then(results => { if (!changed(results[2])) throw new RequestError(429, '链接已失效或手机会话数量已满，请重新生成上传链接', 'session_quota'); });
    return json(200, { token: raw, kind: 'owner', expiresAt });
  }
  if (endpoint === 'photo' && request.method === 'POST') {
    const grant = await mobileGrant(request, env, now);
    return saveUpload(request, env, grant.owner_key, now, grant);
  }
  return json(404, { error: 'not_found' });
}

function dateParts(time = Date.now()) {
  const parts = new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Taipei', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', hourCycle: 'h23' }).formatToParts(new Date(time));
  const get = type => parts.find(part => part.type === type)?.value;
  return { date: `${get('year')}-${get('month')}-${get('day')}`, hour: Number(get('hour')) % 24 };
}
const shiftDate = (value, offset) => { const date = new Date(`${value}T12:00:00Z`); date.setUTCDate(date.getUTCDate() + offset); return date.toISOString().slice(0, 10); };
const validDate = value => /^\d{4}-\d{2}-\d{2}$/.test(value) && !Number.isNaN(Date.parse(value)) && new Date(`${value}T12:00:00Z`).toISOString().slice(0, 10) === value;
async function viewDays(env, dates) {
  const start = dates[0], end = dates.at(-1);
  const [hours, paths] = await env.DB.batch([
    env.DB.prepare(`SELECT day, hour, COUNT(*) AS count, MAX(created_at) AS updated_at FROM media_pageviews WHERE day >= ? AND day <= ? GROUP BY day, hour`).bind(start, end),
    env.DB.prepare('SELECT day, path, COUNT(*) AS count FROM media_pageviews WHERE day >= ? AND day <= ? GROUP BY day, path ORDER BY count DESC').bind(start, end),
  ]);
  return dates.map(date => {
    const rows = (hours.results || []).filter(row => row.day === date);
    const updatedAt = Math.max(0, ...rows.map(row => row.updated_at));
    return { date, total: rows.reduce((sum, row) => sum + row.count, 0),
      hourly: Array.from({ length: 24 }, (_, hour) => ({ label: `${String(hour).padStart(2, '0')}:00`, value: rows.find(row => row.hour === hour)?.count || 0 })),
      paths: (paths.results || []).filter(row => row.day === date).slice(0, 10).map(row => ({ route: row.path, value: row.count })), updatedAt: updatedAt ? stamp(updatedAt) : null };
  });
}
async function handlePageviews(request, env, url) {
  const now = Date.now(), current = dateParts(now);
  if (request.method === 'GET') {
    const requested = url.searchParams.get('date') || current.date;
    if (!validDate(requested)) throw new RequestError(400, '日期格式无效', 'invalid_date');
    const count = Math.min(31, Math.max(1, parseInt(url.searchParams.get('days') || '1', 10) || 1));
    const days = await viewDays(env, Array.from({ length: count }, (_, index) => shiftDate(requested, index - count + 1)));
    return json(200, { timezone: 'Asia/Taipei', today: current.date, requestedDate: requested, days, total: days.reduce((sum, day) => sum + day.total, 0), updatedAt: days.at(-1)?.updatedAt || null });
  }
  if (request.method === 'POST') {
    const input = await bodyJson(request);
    const eventId = /^[A-Za-z0-9_-]{1,180}$/.test(String(input.eventId || '')) ? input.eventId : crypto.randomUUID();
    const rawPath = clean(input.path || input.route || '/', 240).split('?')[0] || '/';
    // Preserve the app's ordinary route/anchor IDs while excluding arbitrary query data.
    const path = /^\/[A-Za-z0-9/_#-]{0,239}$/.test(rawPath) ? rawPath : '/';
    // Atomic PRIMARY KEY(day,event_id) de-duplicates retries, including concurrent requests.
    const inserted = await run(env.DB, `INSERT OR IGNORE INTO media_pageviews (day,event_id,hour,path,created_at)
      SELECT ?,?,?,?,? WHERE (SELECT COUNT(*) FROM media_pageviews WHERE day = ?) < 10000`, current.date, eventId, current.hour, path, now, current.date);
    if (!changed(inserted) && !(await first(env.DB, 'SELECT event_id FROM media_pageviews WHERE day = ? AND event_id = ?', current.date, eventId))) {
      throw new RequestError(429, '今日浏览统计已达到保存上限，页面浏览不受影响', 'pageview_daily_limit');
    }
    await run(env.DB, 'DELETE FROM media_pageviews WHERE day < ?', shiftDate(current.date, -90));
    const [day] = await viewDays(env, [current.date]);
    return json(200, { timezone: 'Asia/Taipei', today: current.date, eventId, duplicate: !changed(inserted), ...day });
  }
  return json(405, { error: 'method_not_allowed' });
}

/**
 * Root router calls this after resolving its trusted session. `user` is null or
 * { email, kind, key }; key is the canonical account key used by existing auth.
 * Recognized API/media routes never fall through to public static assets.
 */
export async function handleMedia(request, env, user = null) {
  const url = new URL(request.url), route = url.pathname;
  const recognized = PAGEVIEW_PATHS.has(route) || route === '/api/uploads' || route.startsWith('/api/uploads/')
    || route.startsWith('/api/mobile-upload/') || route.startsWith('/media/user-uploads/');
  if (!recognized) return null;
  try {
    const origin = request.headers.get('origin');
    if ((origin && origin !== url.origin) || (!['GET', 'HEAD'].includes(request.method) && request.headers.get('sec-fetch-site') === 'cross-site')) {
      throw new RequestError(403, '不允许跨站请求', 'cross_origin');
    }
    if (request.method === 'OPTIONS') return new Response(null, { status: 204, headers: { 'Allow': 'GET,HEAD,POST,DELETE,OPTIONS', 'Cache-Control': 'no-store' } });
    if (PAGEVIEW_PATHS.has(route)) return await handlePageviews(request, env, url);
    if (route.startsWith('/media/user-uploads/')) {
      if (!['GET', 'HEAD'].includes(request.method)) return json(405, { error: 'method_not_allowed' });
      let filename; try { filename = decodeURIComponent(route.slice('/media/user-uploads/'.length)); } catch { throw new RequestError(400, '文件路径无效', 'invalid_path'); }
      if (!/^[0-9a-f-]{36}\.(?:png|jpg|webp|gif|mp4)$/.test(filename)) throw new RequestError(404, '文件不存在', 'not_found');
      return await serveObject(request, env, user, filename, false);
    }
    if (route.startsWith('/api/mobile-upload/')) return await handleMobile(request, env, user, url);
    return await handleUploads(request, env, user, url);
  } catch (error) {
    return json(error instanceof RequestError ? error.status : 503, {
      error: error instanceof RequestError ? error.code : 'storage_unavailable',
      message: error instanceof RequestError ? error.message : '保存服务暂时不可用，请稍后重试',
    });
  }
}
