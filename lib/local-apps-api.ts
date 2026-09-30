import { env } from 'cloudflare:workers';
import { database } from '@/db/raw';
import { canWrite, isOwner } from '@/lib/website-api';
import { resolveRelayRoute } from '@/integration/local-apps/relay-policy.mjs';

export const relayHeaders = { 'Cache-Control': 'no-store, private', Vary: 'Cookie', 'X-Content-Type-Options': 'nosniff' };
export const relayReply = (body: unknown, status = 200) => Response.json(body, { status, headers: relayHeaders });
export const validRelayUrl = (value: unknown): value is string => typeof value === 'string' && /^https:\/\/[a-z0-9]+(?:-[a-z0-9]+)*\.trycloudflare\.com$/.test(value);
export async function relayKey() {
  const secret = (env as unknown as Record<string, string>).INGEST_TOKEN;
  if (!secret) throw new Error('Relay is not configured');
  const key = await crypto.subtle.importKey('raw', new TextEncoder().encode(secret), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
  return Array.from(new Uint8Array(await crypto.subtle.sign('HMAC', key, new TextEncoder().encode('pulse-app-relay-v1')))).map(n => n.toString(16).padStart(2, '0')).join('');
}
export async function currentRelay() {
  const value = await database().prepare('SELECT relay_url,last_seen FROM local_apps_relay WHERE id=1').first<{ relay_url: string; last_seen: number }>();
  return value && validRelayUrl(value.relay_url) && Date.now() - value.last_seen < 90000 ? value : null;
}
export async function forwardLocalApp(request: Request) {
  const write = !['GET', 'HEAD'].includes(request.method);
  if (!(write ? canWrite(request) : isOwner(request))) return relayReply({ error: '请使用网站管理账号登录。' }, 403);
  const url = new URL(request.url);
  const suffix = url.pathname.slice('/api/local-apps/'.length);
  const path = (/^(uploads|operations)(\/|$)/.test(suffix) ? '/' : '/relay/') + suffix + url.search;
  const route = resolveRelayRoute(request.method, path);
  if (!route) return relayReply({ error: '此操作不在已连接应用的范围内。' }, 403);
  const maxBodyBytes = route.maxBodyBytes ?? 4096;
  if (Number(request.headers.get('content-length') || 0) > maxBodyBytes) return relayReply({ error: '上传内容过大，请使用分片上传。' }, 413);
  let relay;
  try { relay = await currentRelay(); } catch { return relayReply({ error: '连接服务暂时不可用。' }, 503); }
  if (!relay) return relayReply({ error: '这台电脑暂时离线，开机联网后会自动恢复。' }, 503);
  const headers = new Headers({ 'X-Pulse-Relay-Key': await relayKey(), 'Accept-Encoding': 'identity' });
  for (const name of ['content-type', 'range', 'idempotency-key', 'x-pulse-operation-id', 'x-film-studio-confirm']) { const value = request.headers.get(name); if (value) headers.set(name, value); }
  let bytes = 0;
  const body = write && request.body ? request.body.pipeThrough(new TransformStream<Uint8Array, Uint8Array>({ transform(chunk, controller) { bytes += chunk.byteLength; if (bytes > maxBodyBytes) throw new Error('Request body limit exceeded'); controller.enqueue(chunk); } })) : undefined;
  try {
    const upstream = await fetch(relay.relay_url + path, { method: request.method, headers, body, redirect: 'manual', signal: AbortSignal.timeout(Math.min(route.timeoutMs || 240000, 300000)) });
    if (upstream.status >= 300 && upstream.status < 400) return relayReply({ error: '本机服务返回了意外跳转。' }, 502);
    const outgoing = new Headers(relayHeaders);
    for (const name of ['content-type', 'content-length', 'content-range', 'accept-ranges', 'content-disposition']) { const value = upstream.headers.get(name); if (value) outgoing.set(name, value); }
    return new Response(request.method === 'HEAD' || upstream.status === 204 ? null : upstream.body, { status: upstream.status, headers: outgoing });
  } catch { return relayReply({ error: write ? '未能确认操作结果，请等待状态恢复后核对；不要重复提交。' : '本机连接暂时中断，正在自动重连。', uncertain: write }, 503); }
}
