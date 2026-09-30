import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { AuthenticatedPrincipal } from '@me-zip/shared-types';
import { XLocalCaptureApiAdapter } from './x-local-capture-api.js';
import type { XLocalCaptureService } from './x-local-capture.js';
import { WatchCaptureService, type WatchPersistence, type WatchPersistenceSnapshot, type WatchProgressInput } from './watch-capture.js';
import { fetchMoviePlayback } from './movie-playback.js';

vi.mock('./movie-playback.js', () => ({ fetchMoviePlayback: vi.fn() }));

const source = 'https://www.2nyy.com/dianying/102938.html';
const otherSource = 'https://www.2nyy.com/dianying/36608.html';
const player = (movie = source) => `http://127.0.0.1:5174/x-local-capture-v13/movie-player.html?source=${encodeURIComponent(movie)}`;
const owner = (userId: string): AuthenticatedPrincipal => ({ userId, sessionId: `${userId}-auth-session`, roles: ['USER'], issuedAt: '2026-09-30T00:00:00.000Z' });
const progress = (patch: Partial<WatchProgressInput> = {}): WatchProgressInput => ({
  sessionId: 'native-session', captureId: 'native-capture-1', sequence: 1, sessionActualPlayedSeconds: 20,
  contentType: 'MOVIE', platform: 'HTML5', domain: 'www.2nyy.com', title: 'incoming-placeholder',
  url: source, canonicalUrl: source, contentKey: 'incoming-local-key', durationSeconds: 6000,
  currentTimeSeconds: 520, actualPlayedSeconds: 20, eventType: 'progress',
  metadata: { adapter: 'inspiration-movie-player', frameUrl: player() }, ...patch,
});

class MemoryPersistence implements WatchPersistence {
  readonly snapshots = new Map<string, WatchPersistenceSnapshot>();
  readonly writes = vi.fn((ownerId: string, value: WatchPersistenceSnapshot) => { this.snapshots.set(ownerId, structuredClone(value)); });
  read(ownerId: string): WatchPersistenceSnapshot | null { return this.snapshots.get(ownerId) ?? null; }
  write(ownerId: string, value: WatchPersistenceSnapshot): void { this.writes(ownerId, value); }
}

function fixture() {
  const persistence = new MemoryPersistence();
  let id = 0;
  const watches = new WatchCaptureService(persistence, () => new Date('2026-09-30T07:00:00.000Z'), () => `record-${++id}`);
  const api = new XLocalCaptureApiAdapter({} as XLocalCaptureService, watches);
  const seed = (userId = 'a', patch: Partial<WatchProgressInput> = {}) => watches.upsertProgress(owner(userId), progress({
    sessionId: `${userId}-previous-session`, captureId: `${userId}-previous-capture`, sequence: 1,
    sessionActualPlayedSeconds: 40, actualPlayedSeconds: 40, currentTimeSeconds: 500,
    contentKey: `${userId}-old-key`, title: `${userId}-既有正确片名`,
    metadata: { adapter: 'html5', privateNote: 'must-not-leak', lastFrame: 'data:image/jpeg;base64,/9j/AA==' }, ...patch,
  })).record!;
  const post = (body: WatchProgressInput, principal = owner('a')) => api.handle({ method: 'POST', path: '/v1/watch/records', principal, body });
  const get = (principal = owner('a')) => api.handle({ method: 'GET', path: '/v1/resources/movie-playback', principal, query: { url: source } });
  return { persistence, watches, api, seed, post, get };
}

beforeEach(() => {
  vi.mocked(fetchMoviePlayback).mockReset();
  vi.mocked(fetchMoviePlayback).mockResolvedValue({ sourceUrl: source, title: 'public-source-title', platform: '2nyy',
    sources: [{ id: 'a'.repeat(20), label: '正片 · 线路1', url: 'https://media.example/film.m3u8', mimeType: 'application/vnd.apple.mpegurl' }],
    warnings: [], metadataOnly: true });
});

describe('native movie API with memory persistence and mocked public metadata', () => {
  it('requires the owner before invoking public metadata or reading progress', async () => {
    const { api, persistence } = fixture();
    const result = await api.handle({ method: 'GET', path: '/v1/resources/movie-playback', query: { url: source } });
    expect(result.status).toBe(401);
    expect(fetchMoviePlayback).not.toHaveBeenCalled();
    expect(persistence.writes).not.toHaveBeenCalled();
  });

  it('GET exposes only safe resume fields and never writes or returns private state', async () => {
    const { seed, get, persistence } = fixture();
    const old = seed();
    persistence.writes.mockClear();
    const result = await get();
    expect(result.status).toBe(200);
    const data = result.body.data as { record: Record<string, unknown> };
    expect(data.record).toMatchObject({ id: old.id, contentKey: 'a-old-key', title: 'a-既有正确片名', currentTimeSeconds: 500 });
    expect(Object.keys(data.record).sort()).toEqual(['id', 'contentKey', 'title', 'url', 'canonicalUrl', 'currentTimeSeconds',
      'durationSeconds', 'poster', 'thumbnail', 'platform', 'domain', 'videoId'].sort());
    const serialized = JSON.stringify(result.body);
    for (const privateValue of ['ownerId', '"metadata":', 'privateNote', 'must-not-leak', 'a-previous-session', 'a-auth-session', 'lastFrame', 'checkpoints', 'receipts']) expect(serialized).not.toContain(privateValue);
    expect(persistence.writes).not.toHaveBeenCalled();
  });

  it('an owner with no records can GET without initializing a durable snapshot', async () => {
    const { get, persistence } = fixture();
    const result = await get();
    expect(result.status).toBe(200);
    expect(result.body.data).not.toHaveProperty('record');
    expect(persistence.snapshots.size).toBe(0);
    expect(persistence.writes).not.toHaveBeenCalled();
  });

  it('ignores extension duplicates and unknown local iframes before any write', async () => {
    const { post, persistence } = fixture();
    const library = 'http://127.0.0.1:4176/';
    for (const frameUrl of [player(), `${player()}&verify=1`, `${player()}&source=invalid`, 'https://unproven-player.example/watch']) {
      const result = await post(progress({ url: library, canonicalUrl: library, contentKey: library,
        metadata: { adapter: 'html5', frame: 'iframe', attributedToTopFrame: true, frameId: 2, frameUrl } }));
      expect(result.status).toBe(201);
      expect(result.body.data).toEqual({ record: null, session: null, created: false, ignored: true });
    }
    expect(persistence.snapshots.size).toBe(0);
    expect(persistence.writes).not.toHaveBeenCalled();
  });

  it('native playback keeps prior movie key and title and adds only real elapsed time', async () => {
    const { seed, post, watches, persistence } = fixture();
    const old = seed();
    persistence.writes.mockClear();
    const result = await post(progress());
    expect(result.status).toBe(201);
    expect(result.body.data).toMatchObject({ created: false, ignored: false,
      record: { id: old.id, contentKey: old.contentKey, title: old.title, canonicalUrl: old.canonicalUrl,
        currentTimeSeconds: 520, totalWatchSeconds: 60, progressPercent: 520 / 6000 * 100 },
      session: { id: 'native-session', actualPlayedSeconds: 20 } });
    expect(watches.listMovies(owner('a'), false)).toHaveLength(1);
    expect(persistence.writes).toHaveBeenCalledTimes(1);
  });

  it('retries and stale sequence do not increase totals; later cumulative progress adds its delta', async () => {
    const { seed, post, watches, persistence } = fixture();
    seed();
    await post(progress());
    persistence.writes.mockClear();
    expect((await post(progress())).body.data).toMatchObject({ ignored: true });
    expect((await post(progress({ captureId: 'retry-with-other-id', sequence: 1, sessionActualPlayedSeconds: 100 }))).body.data).toMatchObject({ ignored: true });
    expect(persistence.writes).not.toHaveBeenCalled();
    const next = await post(progress({ captureId: 'native-capture-2', sequence: 2, sessionActualPlayedSeconds: 25, actualPlayedSeconds: 25, currentTimeSeconds: 525 }));
    expect(next.body.data).toMatchObject({ record: { totalWatchSeconds: 65, currentTimeSeconds: 525 }, session: { actualPlayedSeconds: 25 } });
    expect(watches.listMovies(owner('a'), false)).toHaveLength(1);
  });

  it('movie keys and resume state cannot cross owner boundaries', async () => {
    const { seed, get, post, watches, persistence } = fixture();
    const a = seed('a');
    persistence.writes.mockClear();
    expect((await get(owner('b'))).body.data).not.toHaveProperty('record');
    const result = await post(progress({ contentKey: a.contentKey }), owner('b'));
    expect(result.body.data).toMatchObject({ created: true, record: { ownerId: 'b', contentKey: source, totalWatchSeconds: 20 } });
    expect(watches.listMovies(owner('a'), false)[0]).toMatchObject({ id: a.id, title: a.title, totalWatchSeconds: 40, currentTimeSeconds: 500 });
    expect(persistence.writes.mock.calls.map(([userId]) => userId)).toEqual(['b', 'b']);
  });

  it('a different film key cannot overwrite that film and wrong native binding is ignored', async () => {
    const { seed, post, watches, persistence } = fixture();
    const selected = seed();
    const other = seed('a', { sessionId: 'other-session', captureId: 'other-capture', contentKey: 'other-film-key', url: otherSource, canonicalUrl: otherSource, title: '其他电影' });
    await post(progress({ contentKey: other.contentKey }));
    expect(watches.listMovies(owner('a'), false)).toEqual(expect.arrayContaining([
      expect.objectContaining({ id: selected.id, totalWatchSeconds: 60 }), expect.objectContaining({ id: other.id, totalWatchSeconds: 40 }),
    ]));
    persistence.writes.mockClear();
    const mismatch = await post(progress({ canonicalUrl: otherSource, url: otherSource }));
    expect(mismatch.body.data).toMatchObject({ ignored: true, record: null });
    expect(persistence.writes).not.toHaveBeenCalled();
  });

  it('ambiguous copies do not expose a chosen resume record or create a third native copy', async () => {
    const { seed, get, post, watches, persistence } = fixture();
    seed('a', { contentKey: 'copy-one' });
    seed('a', { contentKey: 'copy-two', captureId: 'copy-two-capture', sessionId: 'copy-two-session' });
    persistence.writes.mockClear();
    expect((await get()).body.data).not.toHaveProperty('record');
    expect((await post(progress())).body.data).toMatchObject({ ignored: true });
    expect(watches.listMovies(owner('a'), false)).toHaveLength(2);
    expect(persistence.writes).not.toHaveBeenCalled();
  });
});
