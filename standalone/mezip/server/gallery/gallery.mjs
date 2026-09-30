import { createQuestStore, GalleryStoreBusyError } from './quest-store.mjs';
import { qrDataUrl } from './qr-code.mjs';

const JSON_LIMIT = 32 * 1024;
const IMAGE_LIMIT = 20 * 1024 * 1024;
export const GALLERY_STORAGE_LIMITS = Object.freeze({ ownerBytes: 100 * 1024 * 1024, ownerFiles: 50, globalBytes: 128 * 1024 * 1024, globalFiles: 250 });
const GRANT_SECONDS = 24 * 60 * 60;
const IMAGE_EXTENSIONS = { 'image/jpeg': '.jpg', 'image/png': '.png', 'image/webp': '.webp', 'image/gif': '.gif', 'image/avif': '.avif' };
const NOW = () => Math.floor(Date.now() / 1000);
const json = (body, status = 200) => Response.json(body, { status, headers: { 'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff' } });
class HttpError extends Error { constructor(status, message) { super(message); this.status = status; } }

function caller(user) {
  if (!user || typeof user.email !== 'string' || typeof user.kind !== 'string' || typeof user.key !== 'string' || !user.key || user.key.length > 256) return null;
  return { email: user.email.trim().toLowerCase(), kind: user.kind, key: user.key };
}
function requireCaller(user) { if (!user) throw new HttpError(401, '请先在登录页登录同一账号'); return user; }
function requireOrigin(request, sync = false) {
  if (request.headers.get('Origin') !== new URL(request.url).origin || (sync && request.headers.get('X-Gallery-Sync') !== '1')) throw new HttpError(403, sync ? '同步来源无效' : '请求来源无效');
}
async function readLimited(request, limit) {
  if (Number(request.headers.get('Content-Length')) > limit) throw new HttpError(413, '请求内容过大');
  const reader = request.body?.getReader();
  if (!reader) return new Uint8Array();
  const chunks = []; let length = 0;
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      length += value.byteLength;
      if (length > limit) { await reader.cancel(); throw new HttpError(413, '请求内容过大'); }
      chunks.push(value);
    }
  } finally { reader.releaseLock(); }
  const bytes = new Uint8Array(length); let offset = 0;
  for (const chunk of chunks) { bytes.set(chunk, offset); offset += chunk.byteLength; }
  return bytes;
}
async function readJson(request) {
  if (!/^application\/json(?:\s*;|$)/i.test(request.headers.get('Content-Type') || '')) throw new HttpError(415, '请使用 JSON 请求');
  try {
    const value = JSON.parse(new TextDecoder().decode(await readLimited(request, JSON_LIMIT)));
    if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error('invalid object');
    return value;
  } catch (error) { if (error instanceof HttpError) throw error; throw new HttpError(400, '请求内容无效'); }
}

async function digest(value) { return [...new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(value)))].map(n => n.toString(16).padStart(2, '0')).join(''); }
const makeToken = () => [...crypto.getRandomValues(new Uint8Array(32))].map(n => n.toString(16).padStart(2, '0')).join('');
const publicGrant = row => ({ id: row.token_hash, createdAt: row.created_at, expiresAt: new Date(row.expires_at * 1000).toISOString(), revokedAt: row.revoked_at === null ? null : new Date(row.revoked_at * 1000).toISOString(), scope: ['gallery:read', 'gallery:upload'] });
const publicWork = row => ({ id: row.id, filename: row.filename, originalName: row.original_name, mimeType: row.mime_type, createdAt: row.created_at });

async function reserveStorage(env, ownerKey, id, objectKey, size) {
  const ownerScope = 'owner:' + ownerKey;
  try {
    // CHECK failures abort the entire D1 batch, including the other scope's
    // increment. Conditional updates alone would silently partially reserve.
    await env.DB.batch([
      env.DB.prepare('INSERT INTO gallery_storage_usage (scope, used_bytes, file_count, max_bytes, max_files) VALUES (?, 0, 0, ?, ?) ON CONFLICT(scope) DO NOTHING').bind('global', GALLERY_STORAGE_LIMITS.globalBytes, GALLERY_STORAGE_LIMITS.globalFiles),
      env.DB.prepare('INSERT INTO gallery_storage_usage (scope, used_bytes, file_count, max_bytes, max_files) VALUES (?, 0, 0, ?, ?) ON CONFLICT(scope) DO NOTHING').bind(ownerScope, GALLERY_STORAGE_LIMITS.ownerBytes, GALLERY_STORAGE_LIMITS.ownerFiles),
      env.DB.prepare('UPDATE gallery_storage_usage SET used_bytes = used_bytes + ?, file_count = file_count + 1 WHERE scope = ?').bind(size, 'global'),
      env.DB.prepare('UPDATE gallery_storage_usage SET used_bytes = used_bytes + ?, file_count = file_count + 1 WHERE scope = ?').bind(size, ownerScope),
      env.DB.prepare('INSERT INTO gallery_upload_reservations (id, owner_key, object_key, size, created_at) VALUES (?, ?, ?, ?, ?)').bind(id, ownerKey, objectKey, size, NOW()),
    ]);
  } catch (error) {
    if (/gallery_storage_(bytes|files)_limit|CHECK constraint failed/i.test(String(error?.message))) throw new HttpError(413, '画廊空间已达上限：每个账号 100MB 或 50 张，画廊总量 128MB 或 250 张。新图片未保存，游戏进度不受影响。');
    throw error;
  }
}
async function releaseReservation(env, reservation) {
  // Missing reservation => zero decrement; retrying cleanup is idempotent.
  await env.DB.batch([
    env.DB.prepare(`UPDATE gallery_storage_usage SET used_bytes = used_bytes - COALESCE((SELECT size FROM gallery_upload_reservations WHERE id = ?), 0),
      file_count = file_count - CASE WHEN EXISTS (SELECT 1 FROM gallery_upload_reservations WHERE id = ?) THEN 1 ELSE 0 END
      WHERE scope IN ('global', ?)`).bind(reservation.id, reservation.id, 'owner:' + reservation.owner_key),
    env.DB.prepare('DELETE FROM gallery_upload_reservations WHERE id = ?').bind(reservation.id),
  ]);
}

// Root may call this from maintenance/scheduled code; no public cleanup route.
// Only stale reservations are considered. Quota remains held until R2 deletion
// succeeds; an uncertain database response can never free quota for a live file.
export async function reconcileGalleryReservations(env, olderThanSeconds = 60 * 60) {
  const rows = await env.DB.prepare('SELECT id, owner_key, object_key, size FROM gallery_upload_reservations WHERE created_at < ? ORDER BY created_at LIMIT 100').bind(NOW() - Math.max(3600, olderThanSeconds)).all();
  let recovered = 0;
  for (const reservation of rows.results) {
    const committed = await env.DB.prepare('SELECT id FROM gallery_works WHERE id = ?').bind(reservation.id).first();
    if (committed) await env.DB.prepare('DELETE FROM gallery_upload_reservations WHERE id = ?').bind(reservation.id).run();
    else { await env.BUCKET.delete(reservation.object_key); await releaseReservation(env, reservation); }
    recovered += 1;
  }
  return { recovered };
}

async function createGrant(request, env, user) {
  const access = makeToken(); const hash = await digest(access);
  const row = { token_hash: hash, created_at: new Date().toISOString(), expires_at: NOW() + GRANT_SECONDS, revoked_at: null };
  const uploadUrl = new URL('/infinite-gallery/upload.html', request.url);
  uploadUrl.searchParams.set('access', access);
  // Calculate QR before committing, so a QR failure leaves no orphaned grant.
  const qrCode = qrDataUrl(uploadUrl.href);
  await env.DB.prepare('INSERT INTO gallery_grants (token_hash, owner_key, created_at, expires_at, revoked_at) VALUES (?, ?, ?, ?, NULL)').bind(hash, user.key, row.created_at, row.expires_at).run();
  return { uploadUrl: uploadUrl.href, qrCode, grant: publicGrant(row) };
}
async function authorizedOwner(request, env, user) {
  const token = new URL(request.url).searchParams.get('access');
  if (token !== null) {
    if (!/^[a-f0-9]{64}$/.test(token)) throw new HttpError(403, '手机上传链接无效。');
    const row = await env.DB.prepare('SELECT owner_key FROM gallery_grants WHERE token_hash = ? AND revoked_at IS NULL AND expires_at > ?').bind(await digest(token), NOW()).first();
    if (!row) throw new HttpError(403, '手机上传链接无效或已过期。');
    return row.owner_key;
  }
  return requireCaller(user).key;
}

async function questRoute(request, env, user, path) {
  requireCaller(user);
  const store = createQuestStore(env.DB);
  if (path === '/quest/state' && request.method === 'GET') {
    try { return json({ user, record: await store.get(user.key) }); }
    catch { return json({ error: '账号存档读取失败，未覆盖任何进度' }, 503); }
  }
  if (request.method !== 'POST') return json({ error: 'method_not_allowed' }, 405);
  requireOrigin(request, true);
  const body = await readJson(request);
  if (body.expectedIdentity !== user.key) return json({ accountChanged: true, error: path === '/quest/redeem' ? '登录账号已变化，请刷新后确认' : '登录账号已变化，请重新确认合并' }, 409);
  try {
    // Dedicated redemption accepts no client score/progress payload.
    const input = path === '/quest/redeem' ? { action: 'redeem', runId: body.runId, url: body.url } : body;
    const result = await store.apply(user.key, input);
    return json({ user, ...result }, result.conflict ? 409 : 200);
  } catch (error) {
    if (error instanceof GalleryStoreBusyError) return json({ error: '账号同步繁忙，请使用同一次操作重试；本地进度仍保留' }, 503);
    return json({ error: path === '/quest/redeem' ? '兑换未完成，请检查卡片后重试' : '同步未完成，本地进度仍保留；请重试' }, 400);
  }
}

async function scoreRoute(request, env, user) {
  requireCaller(user);
  let row;
  if (request.method === 'GET') {
    row = await env.DB.prepare('SELECT score, correct, wrong, updated_at FROM gallery_game_scores WHERE owner_key = ?').bind(user.key).first();
  } else if (request.method === 'POST') {
    requireOrigin(request);
    const body = await readJson(request);
    const delta = Number(body.delta), outcome = body.outcome;
    // Original accepted these fields independently. Keep its valid input set.
    if (!Number.isInteger(delta) || ![-3, 1].includes(delta) || !['correct', 'wrong'].includes(outcome)) return json({ error: '本次计分无效。' }, 400);
    row = await env.DB.prepare(`INSERT INTO gallery_game_scores (owner_key, score, correct, wrong, updated_at) VALUES (?, ?, ?, ?, ?)
      ON CONFLICT(owner_key) DO UPDATE SET score = gallery_game_scores.score + excluded.score,
      correct = gallery_game_scores.correct + excluded.correct, wrong = gallery_game_scores.wrong + excluded.wrong, updated_at = excluded.updated_at
      RETURNING score, correct, wrong, updated_at`).bind(user.key, delta, outcome === 'correct' ? 1 : 0, outcome === 'wrong' ? 1 : 0, new Date().toISOString()).first();
  } else return json({ error: 'method_not_allowed' }, 405);
  // Never select an account using query/body.email. Root supplies verified user.
  return json({ email: user.email, score: Number(row?.score) || 0, correct: Number(row?.correct) || 0, wrong: Number(row?.wrong) || 0, updatedAt: row?.updated_at || null });
}

async function worksRoute(request, env, ownerKey) {
  if (request.method === 'GET') {
    const rows = await env.DB.prepare('SELECT id, filename, original_name, mime_type, created_at FROM gallery_works WHERE owner_key = ? ORDER BY created_at DESC, id DESC').bind(ownerKey).all();
    return json({ works: rows.results.map(publicWork) });
  }
  if (request.method !== 'POST') return json({ error: 'method_not_allowed' }, 405);
  requireOrigin(request);
  if (!/^multipart\/form-data;/i.test(request.headers.get('Content-Type') || '')) throw new HttpError(400, '请选择 JPG、PNG、WEBP、GIF 或 AVIF 图片。');
  const body = await readLimited(request, IMAGE_LIMIT + 1024 * 1024);
  let form;
  try { form = await new Response(body, { headers: { 'Content-Type': request.headers.get('Content-Type') } }).formData(); }
  catch { throw new HttpError(400, '上传内容无效。'); }
  const photo = form.get('photo');
  const files = [...form.values()].filter(value => typeof value !== 'string');
  if (!photo || typeof photo === 'string' || files.length !== 1 || !IMAGE_EXTENSIONS[photo.type]) throw new HttpError(400, '请选择 JPG、PNG、WEBP、GIF 或 AVIF 图片。');
  if (photo.size > IMAGE_LIMIT) throw new HttpError(400, '图片不能超过 20MB。');
  if (!photo.size) throw new HttpError(400, '图片内容为空。');
  const id = crypto.randomUUID();
  const filename = crypto.randomUUID() + IMAGE_EXTENSIONS[photo.type];
  const objectKey = 'gallery/' + encodeURIComponent(ownerKey) + '/' + filename;
  const row = { id, filename, original_name: photo.name.replaceAll('\\', '/').split('/').pop().slice(0, 160), mime_type: photo.type, created_at: new Date().toISOString() };
  await reserveStorage(env, ownerKey, id, objectKey, photo.size);
  try {
    await env.BUCKET.put(objectKey, await photo.arrayBuffer(), { httpMetadata: { contentType: photo.type } });
    await env.DB.batch([
      env.DB.prepare('INSERT INTO gallery_works (id, owner_key, filename, object_key, original_name, mime_type, size, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)').bind(id, ownerKey, filename, objectKey, row.original_name, row.mime_type, photo.size, row.created_at),
      env.DB.prepare('DELETE FROM gallery_upload_reservations WHERE id = ?').bind(id),
    ]);
  } catch (error) {
    // A D1 write can commit before an uncertain response. Confirm absence
    // before deleting the object. If the read/delete fails, keep its quota.
    const committed = await env.DB.prepare('SELECT id FROM gallery_works WHERE id = ?').bind(id).first();
    if (!committed) {
      await env.BUCKET.delete(objectKey);
      await releaseReservation(env, { id, owner_key: ownerKey });
      throw error;
    }
  }
  return json({ work: publicWork(row) }, 201);
}

async function mediaRoute(request, env, user, filename) {
  if (!['GET', 'HEAD'].includes(request.method)) return json({ error: 'method_not_allowed' }, 405);
  const ownerKey = await authorizedOwner(request, env, user);
  if (!/^[a-zA-Z0-9._-]{1,160}$/.test(filename)) return json({ error: 'not_found' }, 404);
  const work = await env.DB.prepare('SELECT object_key, mime_type FROM gallery_works WHERE owner_key = ? AND filename = ?').bind(ownerKey, filename).first();
  if (!work) return json({ error: 'not_found' }, 404);
  const object = request.method === 'HEAD' ? await env.BUCKET.head(work.object_key) : await env.BUCKET.get(work.object_key);
  if (!object) return json({ error: 'not_found' }, 404);
  return new Response(request.method === 'HEAD' ? null : object.body, { headers: {
    'Content-Type': work.mime_type, 'Content-Length': String(object.size), 'Cache-Control': 'private, no-store',
    'X-Content-Type-Options': 'nosniff', 'Content-Disposition': 'inline', 'Referrer-Policy': 'no-referrer',
  } });
}

/**
 * Portable Worker router. env: { DB: D1Database, BUCKET: R2Bucket }.
 * user is null or the authenticated {email, kind, key} supplied by the root app.
 * Canonical /api/gallery/* and /gallery/uploads/*; explicit quest/score aliases
 * preserve existing callers. Other URLs return null to the enclosing router.
 */
export async function handleGallery(request, env, verifiedUser) {
  const url = new URL(request.url);
  let path = url.pathname.startsWith('/api/gallery/') ? url.pathname.slice('/api/gallery'.length) :
    /^\/api\/(quest\/(state|redeem)|game\/score)$/.test(url.pathname) ? url.pathname.slice('/api'.length) : null;
  const media = url.pathname.match(/^\/gallery\/uploads\/([^/]+)$/);
  if (path === null && !media) return null;
  const user = caller(verifiedUser);
  try {
    if (media) return await mediaRoute(request, env, user, decodeURIComponent(media[1]));
    if (path === '/quest/state' || path === '/quest/redeem') return await questRoute(request, env, user, path);
    if (path === '/game/score') return await scoreRoute(request, env, user);
    if (path === '/config' && request.method === 'GET') {
      requireCaller(user);
      if (request.headers.get('Sec-Fetch-Site') === 'cross-site') throw new HttpError(403, '请求来源无效');
      return json(await createGrant(request, env, user));
    }
    if (path === '/grants') {
      requireCaller(user);
      if (request.method === 'GET') {
        const rows = await env.DB.prepare('SELECT token_hash, created_at, expires_at, revoked_at FROM gallery_grants WHERE owner_key = ? ORDER BY created_at DESC').bind(user.key).all();
        return json({ grants: rows.results.map(publicGrant) });
      }
      if (request.method === 'POST') { requireOrigin(request); return json(await createGrant(request, env, user), 201); }
      return json({ error: 'method_not_allowed' }, 405);
    }
    const revoke = path.match(/^\/grants\/([a-f0-9]{64})\/revoke$/);
    if (revoke) {
      requireCaller(user);
      if (request.method !== 'POST') return json({ error: 'method_not_allowed' }, 405);
      requireOrigin(request);
      const result = await env.DB.prepare('UPDATE gallery_grants SET revoked_at = COALESCE(revoked_at, ?) WHERE owner_key = ? AND token_hash = ?').bind(NOW(), user.key, revoke[1]).run();
      return result.meta?.changes ? json({ revoked: true, id: revoke[1] }) : json({ error: 'not_found' }, 404);
    }
    if (path === '/works') return await worksRoute(request, env, await authorizedOwner(request, env, user));
    if (path === '/events') {
      if (request.method !== 'GET') return json({ error: 'method_not_allowed' }, 405);
      const ownerKey = await authorizedOwner(request, env, user);
      // Works are append-only in this API. Count changes for every successful
      // upload, even when concurrent uploads share an identical millisecond.
      const version = await env.DB.prepare('SELECT COUNT(*) AS count FROM gallery_works WHERE owner_key = ?').bind(ownerKey).first();
      const eventId = 'works-' + version.count;
      const changed = request.headers.get('Last-Event-ID') !== eventId;
      // Finite SSE + native EventSource reconnect: durable across isolates, no
      // background timers/long-lived polling or in-memory subscriber registry.
      const body = 'retry: 10000\n' + (changed ? `id: ${eventId}\nevent: work-added\ndata: saved\n\n` : ': unchanged\n\n');
      return new Response(body, { headers: { 'Content-Type': 'text/event-stream', 'Cache-Control': 'no-store, no-transform', 'X-Content-Type-Options': 'nosniff' } });
    }
    return json({ error: 'not_found' }, 404);
  } catch (error) {
    if (error instanceof HttpError) return json({ error: error.message, ...(error.status === 401 ? { loginUrl: '/#login' } : {}) }, error.status);
    return json({ error: '画廊服务暂时不可用，保存没有完成，请重试。' }, 503);
  }
}
