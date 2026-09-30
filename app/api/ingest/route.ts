import { env } from 'cloudflare:workers';
import { database } from '@/db/raw';
import { InvalidUsageSnapshot, storeUsageSnapshot } from '@/lib/usage-history';

export async function POST(request: Request) {
  const key = (env as unknown as Record<string, string>).INGEST_TOKEN;
  if (!key || request.headers.get('Authorization') !== `Bearer ${key}`) return Response.json({ error: 'Unauthorized' }, { status: 401 });
  const headers = { 'Cache-Control': 'no-store' };
  try {
    const reader = request.body?.getReader();
    if (!reader) return new Response('No body', { status: 400 });
    let size = 0;
    const chunks: Uint8Array[] = [];
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      size += value.byteLength;
      if (size > 1_800_000) { await reader.cancel(); return new Response('Payload too large', { status: 413 }); }
      chunks.push(value);
    }
    const bytes = new Uint8Array(size);
    let at = 0;
    for (const chunk of chunks) { bytes.set(chunk, at); at += chunk.length; }
    const result = await storeUsageSnapshot(database(), new TextDecoder().decode(bytes));
    if (result === 'incomplete') return Response.json({ error: 'Incomplete usage history; existing records retained', code: 'HISTORY_REGRESSION' }, { status: 409, headers });
    if (result === 'conflict') return Response.json({ error: 'Concurrent update; retry the complete snapshot', code: 'SNAPSHOT_CONFLICT' }, { status: 409, headers });
    return Response.json({ ok: true, ...(result === 'stale' ? { ignored: 'stale' } : {}) }, { headers });
  } catch (error) {
    if (error instanceof InvalidUsageSnapshot) return Response.json({ error: 'Invalid snapshot' }, { status: 400, headers });
    return Response.json({ error: 'Sync unavailable' }, { status: 503, headers });
  }
}
