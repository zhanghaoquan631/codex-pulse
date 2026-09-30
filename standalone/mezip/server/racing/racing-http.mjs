import { createRoomService, RaceError } from './room-service.mjs';

const BASE = '/api/racing/rooms';
const MAX_BODY_BYTES = 2048;
const json = (body, status = 200) => Response.json(body, { status, headers: {
  'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff', 'Referrer-Policy': 'no-referrer',
} });

async function readBody(request) {
  if (!request.headers.get('content-type')?.toLowerCase().startsWith('application/json')) throw new RaceError(415, 'json_required', '请求需要 JSON 格式');
  if (Number(request.headers.get('content-length')) > MAX_BODY_BYTES) throw new RaceError(413, 'body_too_large', '请求内容过长');
  const reader = request.body?.getReader();
  if (!reader) return {};
  let bytes = 0, chunks = [];
  try {
    while (true) {
      const { value, done } = await reader.read();
      if (done) break;
      bytes += value.byteLength;
      if (bytes > MAX_BODY_BYTES) { await reader.cancel(); throw new RaceError(413, 'body_too_large', '请求内容过长'); }
      chunks.push(value);
    }
  } finally { reader.releaseLock(); }
  const data = new Uint8Array(bytes); let offset = 0;
  for (const chunk of chunks) { data.set(chunk, offset); offset += chunk.byteLength; }
  let body;
  try { body = bytes ? JSON.parse(new TextDecoder().decode(data)) : {}; }
  catch { throw new RaceError(400, 'invalid_json', '请求内容无效'); }
  if (!body || typeof body !== 'object' || Array.isArray(body)) throw new RaceError(400, 'invalid_json', '请求内容无效');
  return body;
}

// Call before the site's existing account-authenticated /api router. This guest
// API is authorized by per-room participant tokens, never site account cookies.
export function createRacingHandler(trackConfigs, options = {}) {
  return async function handleRacingRequest(request, env) {
    const url = new URL(request.url);
    if (url.pathname !== BASE && !url.pathname.startsWith(BASE + '/')) return null;
    try {
      if (!env.DB) throw new RaceError(503, 'storage_unavailable', '比赛服务暂时不可用');
      const origin = request.headers.get('origin');
      if (origin && origin !== url.origin) throw new RaceError(403, 'origin_rejected', '请从本站打开比赛邀请');
      const route = url.pathname.slice(BASE.length).split('/').filter(Boolean);
      if (route.length > 2 || route[0] && !/^[a-f0-9]{32}$/.test(route[0])) throw new RaceError(404, 'room_not_found', '房间不存在或已过期');
      if (!['GET', 'POST'].includes(request.method)) return json({ error: 'method_not_allowed', message: '请求方法不支持' }, 405);
      const service = createRoomService(env.DB, trackConfigs, options);
      if (request.method === 'GET') {
        if (route.length !== 1) throw new RaceError(404, 'route_not_found', '比赛地址不存在');
        return json(await service.get(route[0]));
      }
      const body = await readBody(request), key = request.headers.get('idempotency-key') || undefined;
      const auth = request.headers.get('authorization'), token = auth?.startsWith('Bearer ') ? auth.slice(7) : undefined;
      if (route.length === 0) return json(await service.create(body, key), 201);
      if (route.length === 1) throw new RaceError(404, 'action_not_found', '比赛操作不存在');
      if (route[1] === 'join') return json(await service.join(route[0], body, key, token));
      if (!['start', 'heartbeat', 'state', 'drive', 'control', 'reset', 'restart', 'leave'].includes(route[1])) throw new RaceError(404, 'action_not_found', '比赛操作不存在');
      return json(await service.action(route[0], route[1], body, token, key));
    } catch (error) {
      if (error instanceof RaceError) return json({ error: error.code, message: error.message }, error.status);
      // Never echo SQL, room state or credentials into a public response.
      console.error('Racing service request failed', error?.name || 'Error');
      return json({ error: 'server_error', message: '比赛同步暂时失败，请稍后重试' }, 500);
    }
  };
}
