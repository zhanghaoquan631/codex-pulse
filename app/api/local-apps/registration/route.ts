import { env } from 'cloudflare:workers';
import { database } from '@/db/raw';
import { boundedJson } from '@/lib/website-api';
import { validCommandId } from '@/lib/mezip-api';
import { relayReply, validRelayUrl } from '@/lib/local-apps-api';
export async function POST(request: Request) {
  const secret = (env as unknown as Record<string, string>).INGEST_TOKEN;
  if (!secret || request.headers.get('Authorization') !== `Bearer ${secret}`) return relayReply({ error: 'Unauthorized' }, 401);
  try {
    const body = await boundedJson(request, 4096);
    if (!validCommandId(body.deviceId) || !validRelayUrl(body.relayUrl)) return relayReply({ error: 'Invalid relay registration' }, 400);
    const db = database();
    const computer = await db.prepare('SELECT device_id FROM mezip_connection WHERE id=1').first<{ device_id: string }>();
    if (!computer || computer.device_id !== body.deviceId) return relayReply({ error: 'Computer identity does not match' }, 409);
    await db.prepare('INSERT INTO local_apps_relay(id,device_id,relay_url,last_seen) VALUES(1,?,?,?) ON CONFLICT(id) DO UPDATE SET relay_url=excluded.relay_url,last_seen=excluded.last_seen WHERE local_apps_relay.device_id=excluded.device_id').bind(body.deviceId, body.relayUrl, Date.now()).run();
    return relayReply({ ok: true });
  } catch { return relayReply({ error: 'Relay registration unavailable' }, 503); }
}
