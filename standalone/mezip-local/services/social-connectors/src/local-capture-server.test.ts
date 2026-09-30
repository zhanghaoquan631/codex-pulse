import { mkdtempSync, rmSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { createLocalCaptureServer } from './local-capture-server.js';

async function listen(server: ReturnType<typeof createLocalCaptureServer>): Promise<number> {
  await new Promise<void>((resolve, reject) => {
    server.once('error', reject);
    server.listen(0, '127.0.0.1', resolve);
  });
  const address = server.address();
  if (address === null || typeof address === 'string') throw new Error('Expected a TCP listener.');
  return address.port;
}

async function close(server: ReturnType<typeof createLocalCaptureServer>): Promise<void> {
  await new Promise<void>((resolve, reject) => server.close((error) => error === undefined ? resolve() : reject(error)));
}

describe('local capture server', () => {
  it('shares one durable local owner across fresh browser sessions and preserves the prior local history', async () => {
    const directory = mkdtempSync(join(tmpdir(), 'mezip-local-capture-server-'));
    const dataPath = join(directory, 'events.json');
    const server = createLocalCaptureServer({ dataPath });
    const port = await listen(server);
    const base = `http://127.0.0.1:${port}`;
    try {
      const saved = await fetch(`${base}/v1/x/local-capture/events`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ actionType: 'like', postUrl: 'https://x.com/tom/status/123', source: 'LOCAL_CAPTURE' }),
      });
      expect(saved.status).toBe(201);

      // This request intentionally has no Cookie header, modelling a second
      // local browser such as Codex after an Edge extension captured an event.
      const timeline = await fetch(`${base}/v1/x/local-capture/timeline?limit=10`);
      expect(timeline.status).toBe(200);
      const payload = await timeline.json() as { data: { events: Array<{ actionType: string }> } };
      expect(payload.data.events).toEqual([expect.objectContaining({ actionType: 'like' })]);
      expect(existsSync(join(directory, 'owner.id'))).toBe(true);
    } finally {
      await close(server);
      rmSync(directory, { recursive: true, force: true });
    }
  });

  it('does not let an unknown extension bootstrap the owner or bypass explicit bridge pairing', async () => {
    const directory = mkdtempSync(join(tmpdir(), 'mezip-extension-origin-server-'));
    const dataPath = join(directory, 'events.json');
    const server = createLocalCaptureServer({ dataPath });
    const port = await listen(server);
    const base = `http://127.0.0.1:${port}`;
    try {
      const preflight = await fetch(`${base}/v1/x/local-capture/edge-bookmarks`, {
        method: 'OPTIONS',
        headers: {
          Origin: 'chrome-extension://unknownextensionid',
          'Access-Control-Request-Method': 'PUT',
          'Access-Control-Request-Headers': 'content-type',
        },
      });
      expect(preflight.status).toBe(204);
      const rejected = await fetch(`${base}/v1/x/local-capture/edge-bookmarks`, {
        headers: { Origin: 'chrome-extension://unknownextensionid' },
      });
      expect(rejected.status).toBe(403);

      // The trusted loopback page can establish the owner session, but an
      // extension still needs the explicit one-time pairing token; a cookie
      // alone is not accepted as an extension credential.
      const bootstrap = await fetch(`${base}/v1/x/local-capture/edge-bookmarks`);
      expect(bootstrap.status).toBe(200);
      const cookie = bootstrap.headers.get('set-cookie');
      expect(cookie).toMatch(/^mezip_x_capture_session=/u);
      if (cookie === null) throw new Error('Expected the loopback bridge to issue a session cookie.');
      const bypass = await fetch(`${base}/v1/x/local-capture/edge-bookmarks`, {
        headers: { Origin: 'chrome-extension://unknownextensionid', Cookie: cookie.split(';', 1)[0] ?? '' },
      });
      expect(bypass.status).toBe(401);
    } finally {
      await close(server);
      rmSync(directory, { recursive: true, force: true });
    }
  });

  it('pairs a dynamic unpacked Edge origin once and authorizes token requests after a bridge restart', async () => {
    const directory = mkdtempSync(join(tmpdir(), 'mezip-extension-pairing-server-'));
    const dataPath = join(directory, 'events.json');
    let server = createLocalCaptureServer({ dataPath });
    const firstPort = await listen(server);
    const firstBase = `http://127.0.0.1:${firstPort}`;
    const extensionOrigin = 'chrome-extension://unpacked-test-extension';
    try {
      const codeResponse = await fetch(`${firstBase}/v1/x/local-capture/edge-bookmarks/pairing/start`, {
        headers: { Origin: 'http://127.0.0.1:5174' },
      });
      expect(codeResponse.status).toBe(200);
      const codePayload = await codeResponse.json() as { data: { pairingId: string; pairingCode: string; code: string; expiresAt: string } };
      expect(codePayload.data).toMatchObject({ pairingId: expect.any(String), pairingCode: expect.any(String), code: codePayload.data.pairingCode });
      expect(Date.parse(codePayload.data.expiresAt)).not.toBeNaN();

      const preflight = await fetch(`${firstBase}/v1/x/local-capture/bridge/pair`, {
        method: 'OPTIONS',
        headers: { Origin: extensionOrigin, 'Access-Control-Request-Method': 'POST', 'Access-Control-Request-Headers': 'content-type' },
      });
      expect(preflight.status).toBe(204);

      const paired = await fetch(`${firstBase}/v1/x/local-capture/bridge/pair`, {
        method: 'POST',
        headers: { Origin: extensionOrigin, 'content-type': 'application/json' },
        body: JSON.stringify({ pairingId: codePayload.data.pairingId, code: codePayload.data.code, extensionOrigin }),
      });
      expect(paired.status).toBe(200);
      const pairedPayload = await paired.json() as { data: { bridgeToken?: string; token?: string; origin: string } };
      const token = pairedPayload.data.bridgeToken ?? pairedPayload.data.token;
      expect(token).toEqual(expect.any(String));
      expect(pairedPayload.data.origin).toBe(extensionOrigin);
      if (token === undefined) throw new Error('Expected a bridge token.');

      const authorized = await fetch(`${firstBase}/v1/x/local-capture/edge-bookmarks`, {
        headers: { Origin: extensionOrigin, 'X-MEZIP-Local-Bridge-Token': token },
      });
      expect(authorized.status).toBe(200);

      await close(server);
      server = createLocalCaptureServer({ dataPath });
      const secondPort = await listen(server);
      const restored = await fetch(`http://127.0.0.1:${secondPort}/v1/x/local-capture/edge-bookmarks`, {
        headers: { Origin: extensionOrigin, 'X-MEZIP-Local-Bridge-Token': token },
      });
      expect(restored.status).toBe(200);

      const replay = await fetch(`http://127.0.0.1:${secondPort}/v1/x/local-capture/bridge/pair`, {
        method: 'POST',
        headers: { Origin: 'chrome-extension://another-extension', 'content-type': 'application/json' },
        body: JSON.stringify({ pairingId: codePayload.data.pairingId, code: codePayload.data.code, extensionOrigin: 'chrome-extension://another-extension' }),
      });
      expect(replay.status).toBe(400);
    } finally {
      if (server.listening) await close(server);
      rmSync(directory, { recursive: true, force: true });
    }
  });

  it('keeps same-origin browser profiles paired and rotates only the supplied profile credential', async () => {
    const directory = mkdtempSync(join(tmpdir(), 'mezip-multiple-profile-pairing-'));
    const dataPath = join(directory, 'events.json');
    let server = createLocalCaptureServer({ dataPath });
    let base = `http://127.0.0.1:${await listen(server)}`;
    const extensionOrigin = 'chrome-extension://shared-unpacked-extension';
    const otherOrigin = 'chrome-extension://different-extension';
    const pair = async (origin = extensionOrigin, existingToken?: string): Promise<string> => {
      const issued = await fetch(`${base}/v1/x/local-capture/bridge/pairing-code`, {
        method: 'POST', headers: { Origin: 'http://127.0.0.1:5174' },
      });
      expect(issued.status).toBe(200);
      const code = await issued.json() as { data: { pairingId: string; pairingCode: string } };
      const paired = await fetch(`${base}/v1/x/local-capture/bridge/pair`, {
        method: 'POST',
        headers: {
          Origin: origin, 'content-type': 'application/json',
          ...(existingToken === undefined ? {} : { 'X-MEZIP-Local-Bridge-Token': existingToken }),
        },
        body: JSON.stringify({ pairingId: code.data.pairingId, code: code.data.pairingCode, extensionOrigin: origin }),
      });
      expect(paired.status).toBe(200);
      const payload = await paired.json() as { data: { token: string } };
      return payload.data.token;
    };
    const status = async (token: string, origin = extensionOrigin): Promise<number> => {
      const response = await fetch(`${base}/v1/x/local-capture/edge-bookmarks`, {
        headers: { Origin: origin, 'X-MEZIP-Local-Bridge-Token': token },
      });
      await response.arrayBuffer();
      return response.status;
    };
    const restart = async (): Promise<void> => {
      await close(server);
      server = createLocalCaptureServer({ dataPath });
      base = `http://127.0.0.1:${await listen(server)}`;
    };
    try {
      const profileA = await pair();
      const profileB = await pair();
      expect(await status(profileA)).toBe(200);
      expect(await status(profileB)).toBe(200);
      await restart();
      expect(await status(profileA)).toBe(200);
      expect(await status(profileB)).toBe(200);

      const rotatedA = await pair(extensionOrigin, profileA);
      expect(await status(profileA)).toBe(403);
      expect(await status(rotatedA)).toBe(200);
      expect(await status(profileB)).toBe(200);
      expect(await status(profileB, otherOrigin)).toBe(403);

      // An invalid previous credential may still pair with a fresh one-time
      // code, but it cannot revoke any valid profile's credential.
      const recovered = await pair(extensionOrigin, 'invalid-test-previous-token');
      expect(await status(rotatedA)).toBe(200);
      expect(await status(profileB)).toBe(200);
      expect(await status(recovered)).toBe(200);

      // Even knowledge of another origin's token cannot rotate that origin.
      const otherProfile = await pair(otherOrigin, profileB);
      expect(await status(otherProfile, otherOrigin)).toBe(200);
      expect(await status(profileB)).toBe(200);
      expect(await status(otherProfile)).toBe(403);
      await restart();
      expect(await status(profileA)).toBe(403);
      expect(await status(rotatedA)).toBe(200);
      expect(await status(profileB)).toBe(200);
      expect(await status(recovered)).toBe(200);
      expect(await status(otherProfile, otherOrigin)).toBe(200);
    } finally {
      if (server.listening) await close(server);
      rmSync(directory, { recursive: true, force: true });
    }
  });

  it('accepts explicit follow and unfollow events from supported public platforms', async () => {
    const directory = mkdtempSync(join(tmpdir(), 'mezip-follow-capture-server-'));
    const dataPath = join(directory, 'events.json');
    const server = createLocalCaptureServer({ dataPath });
    const port = await listen(server);
    const base = `http://127.0.0.1:${port}`;
    try {
      const saved = await fetch(`${base}/v1/x/local-capture/events`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          actionType: 'follow', platform: 'BILIBILI', postUrl: 'https://space.bilibili.com/123',
          authorHandle: '测试创作者', source: 'LOCAL_CAPTURE',
        }),
      });
      const savedPayload = await saved.json() as { data?: { event: { platform: string; actionType: string; syncStatus: string } }; error?: unknown };
      expect(saved.status, JSON.stringify(savedPayload)).toBe(201);
      expect(savedPayload.data?.event)
        .toMatchObject({ platform: 'BILIBILI', actionType: 'follow', syncStatus: 'NOT_REQUIRED' });

      const timeline = await fetch(`${base}/v1/x/local-capture/timeline?limit=10`);
      const timelinePayload = await timeline.json() as { data: { events: Array<{ platform: string; actionType: string; postUrl: string }>; content: unknown[] } };
      expect(timelinePayload.data.events).toEqual([expect.objectContaining({ platform: 'BILIBILI', actionType: 'follow', postUrl: 'https://space.bilibili.com/123' })]);
      expect(timelinePayload.data.content).toEqual([]);
    } finally {
      await close(server);
      rmSync(directory, { recursive: true, force: true });
    }
  });

  it('persists real playback checkpoints and imports a watch item into the private library', async () => {
    const directory = mkdtempSync(join(tmpdir(), 'mezip-watch-capture-server-'));
    const dataPath = join(directory, 'events.json');
    const server = createLocalCaptureServer({ dataPath });
    const port = await listen(server);
    const base = `http://127.0.0.1:${port}`;
    const progress = {
      sessionId: 'session-1', contentType: 'VIDEO', platform: 'HTML5', domain: 'video.example', videoId: 'clip-1', title: 'Demo video',
      url: 'https://video.example/watch/clip-1', canonicalUrl: 'https://video.example/watch/clip-1', durationSeconds: 100, currentTimeSeconds: 20,
      actualPlayedSeconds: 20, eventType: 'progress',
    };
    try {
      const saved = await fetch(`${base}/v1/watch/records`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(progress) });
      expect(saved.status).toBe(201);
      const savedPayload = await saved.json() as { data: { record: { id: string; progressPercent: number; totalWatchSeconds: number } } };
      expect(savedPayload.data.record).toMatchObject({ progressPercent: 20, totalWatchSeconds: 20 });
      const recordId = savedPayload.data.record.id;

      const listed = await fetch(`${base}/v1/watch/records?status=IN_PROGRESS`);
      expect(listed.status).toBe(200);
      expect((await listed.json() as { data: { items: unknown[] } }).data.items).toHaveLength(1);
      const imported = await fetch(`${base}/v1/watch/records/${recordId}/private-library`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ tags: ['电影'], note: '稍后继续观看' }) });
      expect(imported.status).toBe(201);
      expect((await imported.json() as { data: { item: { sourcePlatform: string; privacy: string; tags: string[] } } }).data.item).toMatchObject({ sourcePlatform: 'WATCH', privacy: 'PRIVATE', tags: ['电影'] });
      const library = await fetch(`${base}/v1/x/local-capture/private-library`);
      expect((await library.json() as { data: { items: Array<{ sourcePlatform: string }> } }).data.items).toEqual([expect.objectContaining({ sourcePlatform: 'WATCH' })]);
    } finally {
      await close(server);
      rmSync(directory, { recursive: true, force: true });
    }
  });

  it('reloads durable watch records after the local bridge restarts', async () => {
    const directory = mkdtempSync(join(tmpdir(), 'mezip-watch-restart-'));
    const dataPath = join(directory, 'events.json');
    let server = createLocalCaptureServer({ dataPath });
    const firstPort = await listen(server);
    const firstBase = `http://127.0.0.1:${firstPort}`;
    try {
      const saved = await fetch(`${firstBase}/v1/watch/records`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          sessionId: 'restart-session', contentType: 'VIDEO', platform: 'HTML5', domain: 'video.example',
          videoId: 'restart-clip', title: '可恢复视频', url: 'https://video.example/restart', canonicalUrl: 'https://video.example/restart',
          durationSeconds: 240, currentTimeSeconds: 42, actualPlayedSeconds: 42, eventType: 'pause',
        }),
      });
      expect(saved.status).toBe(201);
      await close(server);

      server = createLocalCaptureServer({ dataPath });
      const secondPort = await listen(server);
      const restored = await fetch(`http://127.0.0.1:${secondPort}/v1/watch/records`);
      expect(restored.status).toBe(200);
      expect((await restored.json() as { data: { items: Array<{ title: string; currentTimeSeconds: number }> } }).data.items)
        .toEqual([expect.objectContaining({ title: '可恢复视频', currentTimeSeconds: 42 })]);
    } finally {
      if (server.listening) await close(server);
      rmSync(directory, { recursive: true, force: true });
    }
  });

  it('turns an explicitly collected X link into a private research record and preserves explicit opens after restart', async () => {
    const directory = mkdtempSync(join(tmpdir(), 'mezip-reading-history-restart-'));
    const dataPath = join(directory, 'events.json');
    let server = createLocalCaptureServer({ dataPath });
    const firstPort = await listen(server);
    const firstBase = `http://127.0.0.1:${firstPort}`;
    try {
      const collected = await fetch(`${firstBase}/v1/x/local-capture/events`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          actionType: 'copied_link',
          postUrl: 'https://x.com/tom/status/123456',
          pageTitle: '值得研究的产品观点',
          authorHandle: '@tom',
          note: '以后研究这个交互思路。',
          tags: ['产品', '研究'],
          source: 'MANUAL_IMPORT',
        }),
      });
      expect(collected.status).toBe(201);

      const resources = await fetch(`${firstBase}/v1/resources/records?resourceType=X_LINK`);
      const resourcesPayload = await resources.json() as { data: { items: Array<{ id: string; openCount: number; firstOpenedAt: string | null }> } };
      expect(resourcesPayload.data.items).toEqual([expect.objectContaining({ openCount: 0, firstOpenedAt: null })]);
      const recordId = resourcesPayload.data.items[0]?.id;
      if (recordId === undefined) throw new Error('Expected an X link research record.');

      const opened = await fetch(`${firstBase}/v1/resources/records/${recordId}/open`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ source: 'MEZIP_READING_HISTORY', idempotencyKey: 'x-link-open-once' }),
      });
      expect(opened.status).toBe(201);
      await close(server);

      server = createLocalCaptureServer({ dataPath });
      const secondPort = await listen(server);
      const detail = await fetch(`http://127.0.0.1:${secondPort}/v1/resources/records/${recordId}`);
      expect(detail.status).toBe(200);
      expect((await detail.json() as { data: { record: { openCount: number; resourceType: string }; sessions: Array<{ source: string }> } }).data)
        .toMatchObject({ record: { resourceType: 'X_LINK', openCount: 1 }, sessions: [{ source: 'MEZIP_READING_HISTORY' }] });
    } finally {
      if (server.listening) await close(server);
      rmSync(directory, { recursive: true, force: true });
    }
  });
});
