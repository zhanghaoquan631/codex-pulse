import { isOwner } from '@/lib/website-api';
import { currentRelay, relayKey, relayReply } from '@/lib/local-apps-api';
export async function GET(request: Request) {
  if (!isOwner(request)) return relayReply({ canManage: false, connected: false, apps: {} }, 403);
  try {
    const relay = await currentRelay();
    if (!relay) return relayReply({ canManage: true, connected: false, apps: {}, state: 'waiting-for-computer' });
    // Workerd supports manual/follow redirect modes. Keep redirects unfollowed so the relay key stays on this host.
    const response = await fetch(relay.relay_url + '/health', { headers: { 'X-Pulse-Relay-Key': await relayKey() }, redirect: 'manual', signal: AbortSignal.timeout(12000) });
    if (!response.ok) { console.warn('Local apps relay health status', response.status); return relayReply({ canManage: true, connected: false, apps: {}, state: `relay-http-${response.status}` }); }
    const health = await response.json() as { apps?: Record<string, boolean> };
    const apps = { github: health.apps?.github === true, finance: health.apps?.finance === true, media: health.apps?.media === true };
    return relayReply({ canManage: true, connected: true, apps, lastSeen: new Date(relay.last_seen).toISOString() });
  } catch (error) { console.warn('Local apps relay health unavailable', error instanceof Error ? error.name : 'Error'); return relayReply({ canManage: true, connected: false, apps: {}, state: 'relay-unreachable' }); }
}
