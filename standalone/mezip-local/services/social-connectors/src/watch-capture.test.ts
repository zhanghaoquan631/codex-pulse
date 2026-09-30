import { describe, expect, it } from 'vitest';
import type { AuthenticatedPrincipal } from '@me-zip/shared-types';
import { WatchCaptureService, type WatchPersistence, type WatchPersistenceSnapshot, type WatchProgressInput } from './watch-capture.js';
import { watchProgressInputSchema, watchQuerySchema } from '../../../packages/schemas/src/index.js';
import { XLocalCaptureApiAdapter } from './x-local-capture-api.js';
import type { XLocalCaptureService } from './x-local-capture.js';

class MemoryWatchPersistence implements WatchPersistence {
  private readonly values = new Map<string, WatchPersistenceSnapshot>();
  public read(ownerId: string): WatchPersistenceSnapshot | null { return this.values.get(ownerId) ?? null; }
  public write(ownerId: string, snapshot: WatchPersistenceSnapshot): void { this.values.set(ownerId, structuredClone(snapshot)); }
}

const owner = (userId: string): AuthenticatedPrincipal => ({
  userId,
  sessionId: `${userId}-session`,
  roles: ['USER'],
  issuedAt: '2026-08-22T04:25:00.000Z',
});

const input = (patch: Partial<WatchProgressInput> = {}): WatchProgressInput => ({
  sessionId: 'session-1', contentType: 'VIDEO', platform: 'HTML5', domain: 'video.example',
  videoId: 'clip-1', title: '测试视频', url: 'https://video.example/watch/clip-1', canonicalUrl: 'https://video.example/watch/clip-1',
  durationSeconds: 100, currentTimeSeconds: 0, actualPlayedSeconds: 0, eventType: 'progress', ...patch,
});

describe('WatchCaptureService', () => {
  it('does not create a record just by opening or pressing play', () => {
    const service = new WatchCaptureService(new MemoryWatchPersistence(), () => new Date('2026-08-22T04:25:00.000Z'), () => 'watch-1');
    expect(service.upsertProgress(owner('a'), input({ eventType: 'play' }))).toMatchObject({ ignored: true, record: null });
    expect(service.list(owner('a'))).toHaveLength(0);
  });

  it('creates and updates an owner-scoped record with actual playback time', () => {
    let current = new Date('2026-08-22T04:25:00.000Z');
    const service = new WatchCaptureService(new MemoryWatchPersistence(), () => current, () => 'watch-1');
    const first = service.upsertProgress(owner('a'), input({ currentTimeSeconds: 10, actualPlayedSeconds: 10, eventType: 'progress' }));
    current = new Date('2026-08-22T04:26:00.000Z');
    const second = service.upsertProgress(owner('a'), input({ currentTimeSeconds: 80, actualPlayedSeconds: 5, eventType: 'pause', endedAt: current.toISOString() }));
    expect(first.created).toBe(true);
    expect(second.created).toBe(false);
    expect(second.record).toMatchObject({ id: 'watch-1', currentTimeSeconds: 80, progressPercent: 80, status: 'IN_PROGRESS', totalWatchSeconds: 15, watchCount: 1 });
    expect(second.session).toMatchObject({ actualPlayedSeconds: 15, endedAt: current.toISOString() });
    expect(service.list(owner('b'))).toHaveLength(0);
  });

  it('does not count a seek jump as watched time and marks completion near the end', () => {
    const service = new WatchCaptureService(new MemoryWatchPersistence(), () => new Date('2026-08-22T04:25:00.000Z'), () => 'watch-1');
    service.upsertProgress(owner('a'), input({ currentTimeSeconds: 10, actualPlayedSeconds: 10 }));
    const seek = service.upsertProgress(owner('a'), input({ currentTimeSeconds: 95, actualPlayedSeconds: 0, eventType: 'seeked' }));
    expect(seek.record).toMatchObject({ totalWatchSeconds: 10, currentTimeSeconds: 95, status: 'COMPLETED', progressPercent: 95 });
  });

  it('deduplicates the same content across sessions, supports search and deletion', () => {
    const persistence = new MemoryWatchPersistence();
    const service = new WatchCaptureService(persistence, () => new Date('2026-08-22T04:25:00.000Z'), () => 'watch-1');
    service.upsertProgress(owner('a'), input({ currentTimeSeconds: 5, actualPlayedSeconds: 5 }));
    const second = service.upsertProgress(owner('a'), input({ sessionId: 'session-2', currentTimeSeconds: 6, actualPlayedSeconds: 1 }));
    expect(second.record?.watchCount).toBe(2);
    expect(service.list(owner('a'), { query: '测试' })).toHaveLength(1);
    expect(service.get(owner('a'), 'watch-1').sessions).toHaveLength(2);
    expect(service.remove(owner('a'), 'watch-1')).toBe(true);
    expect(service.get.bind(service, owner('a'), 'watch-1')).toThrow('Watch record was not found');
  });

  it('persists sequence and cumulative checkpoints so lost HTTP responses and out-of-order retries cannot count twice', () => {
    const persistence = new MemoryWatchPersistence();
    const first = new WatchCaptureService(persistence);
    const checkpoint = input({ actualPlayedSeconds: 20, currentTimeSeconds: 20, sequence: 1, captureId: 'delivery-1', sessionActualPlayedSeconds: 20 });
    first.upsertProgress(owner('a'), checkpoint);
    const restarted = new WatchCaptureService(persistence);
    expect(restarted.upsertProgress(owner('a'), checkpoint)).toMatchObject({ ignored: true, record: { totalWatchSeconds: 20 } });
    // Cumulative accounting also repairs a missing intermediate checkpoint.
    const next = restarted.upsertProgress(owner('a'), { ...checkpoint, captureId: 'delivery-3', sequence: 3, sessionActualPlayedSeconds: 60, currentTimeSeconds: 60 });
    expect(next.record?.totalWatchSeconds).toBe(60);
    expect(restarted.upsertProgress(owner('a'), { ...checkpoint, captureId: 'late-delivery-2', sequence: 2, sessionActualPlayedSeconds: 40 })).toMatchObject({ ignored: true, record: { currentTimeSeconds: 60, totalWatchSeconds: 60 } });
    expect(restarted.get(owner('a'), next.record!.id).sessions[0]?.actualPlayedSeconds).toBe(60);
  });

  it('does not acknowledge a failed durable write through the memory cache', () => {
    const persistence = new MemoryWatchPersistence();
    let fail = false;
    const service = new WatchCaptureService({ read: (id) => persistence.read(id), write: (id, state) => { if (fail) throw new Error('disk full'); persistence.write(id, state); } });
    service.list(owner('a')); fail = true;
    const checkpoint = input({ actualPlayedSeconds: 20, currentTimeSeconds: 20, sequence: 1, sessionActualPlayedSeconds: 20 });
    expect(() => service.upsertProgress(owner('a'), checkpoint)).toThrow('disk full');
    fail = false;
    expect(service.upsertProgress(owner('a'), checkpoint)).toMatchObject({ ignored: false, record: { totalWatchSeconds: 20 } });
    expect(new WatchCaptureService(persistence).list(owner('a'))[0]?.totalWatchSeconds).toBe(20);
  });

  it('qualifies movies at exactly 30 actual minutes and preserves the real title and playback URL', () => {
    const service = new WatchCaptureService(new MemoryWatchPersistence());
    const movie = input({ contentType: 'MOVIE', durationSeconds: 7200, actualPlayedSeconds: 1799, currentTimeSeconds: 5000, title: '罗斯 - 哒哒影漫' });
    expect(service.upsertProgress(owner('a'), movie).record).toMatchObject({ title: '罗斯', metadata: { movieQualified: false }, totalWatchSeconds: 1799 });
    expect(service.upsertProgress(owner('a'), { ...movie, actualPlayedSeconds: 0, eventType: 'seeked', currentTimeSeconds: 6000 }).record?.metadata.movieQualified).toBe(false);
    expect(service.upsertProgress(owner('a'), { ...movie, actualPlayedSeconds: 1 }).record).toMatchObject({ url: movie.url, metadata: { movieQualified: true }, totalWatchSeconds: 1800 });
  });

  it('retains prior image and frame timestamp on failures, without calling a blocked attempt captured', () => {
    const service = new WatchCaptureService(new MemoryWatchPersistence());
    const frame = { lastFrame: 'data:image/jpeg;base64,/9j/AA==', frameCapturedAt: '2026-09-26T03:00:00.000Z', framePositionSeconds: 20, frameStatus: 'captured', playbackLine: '线路二' };
    service.upsertProgress(owner('a'), input({ actualPlayedSeconds: 20, poster: 'https://video.example/poster.jpg', metadata: frame }));
    const failed = service.upsertProgress(owner('a'), input({ actualPlayedSeconds: 20, metadata: { frameStatus: 'cross-origin-blocked', frameAttemptedAt: '2026-09-26T03:01:00.000Z' } }));
    expect(failed.record).toMatchObject({ poster: 'https://video.example/poster.jpg', metadata: { ...frame, frameStatus: 'cross-origin-blocked' } });
    const invalid = service.upsertProgress(owner('a'), input({ actualPlayedSeconds: 1, metadata: { lastFrame: 'https://fake.example/cover.png', frameStatus: 'captured' } }));
    expect(invalid.record?.metadata).toMatchObject({ lastFrame: frame.lastFrame, frameStatus: 'unavailable', frameCapturedAt: frame.frameCapturedAt });
    expect(service.upsertProgress(owner('a'), input({ metadata: { playbackLine: null, playbackLineUrl: 'https://new-player.example/' } })).record?.metadata.playbackLine).toBeNull();
  });

  it('lists every movie separately from the 100-video limit, omits images, and keeps private detail frames available', async () => {
    const service = new WatchCaptureService(new MemoryWatchPersistence());
    const frame = 'data:image/jpeg;base64,/9j/AA==';
    const movie = service.upsertProgress(owner('a'), input({ contentKey: 'movie', contentType: 'MOVIE', actualPlayedSeconds: 1, metadata: { lastFrame: frame, frameStatus: 'captured' } }));
    for (let i = 0; i < 105; i++) service.upsertProgress(owner('a'), input({ contentKey: `video-${i}`, actualPlayedSeconds: 1 }));
    const api = new XLocalCaptureApiAdapter({} as XLocalCaptureService, service);
    const response = await api.handle({ method: 'GET', path: '/v1/watch/movies', principal: owner('a') });
    const items = (response.body.data as { items: { metadata: Record<string, unknown> }[] }).items;
    expect(response.status).toBe(200); expect(items).toHaveLength(1);
    expect(items[0]?.metadata.hasLastFrame).toBe(true); expect(items[0]?.metadata.lastFrame).toBeUndefined();
    expect(service.get(owner('a'), movie.record!.id).record.metadata.lastFrame).toBe(frame);
    expect(service.listMovies(owner('b'))).toHaveLength(0);
    expect((await api.handle({ method: 'GET', path: '/v1/watch/movies' })).status).toBe(401);
  });

  it('validates bounded JPEG payloads and paired cumulative progress fields', () => {
    expect(watchProgressInputSchema.safeParse(input({ sequence: 1 })).success).toBe(false);
    expect(watchProgressInputSchema.safeParse(input({ sequence: 1, sessionActualPlayedSeconds: 20 })).success).toBe(true);
    expect(watchProgressInputSchema.safeParse(input({ metadata: { lastFrame: 'data:image/png;base64,AAAA' } })).success).toBe(false);
    expect(watchProgressInputSchema.safeParse(input({ metadata: { lastFrame: 'data:image/jpeg;base64,' + 'A'.repeat(10_000) } })).success).toBe(false);
    expect(watchProgressInputSchema.safeParse(input({ metadata: { lastFrame: 'data:image/jpeg;base64,/9j/AA==' } })).success).toBe(true);
  });

  it('reads all 330 records through deterministic cursor pages without changing persistence', () => {
    const persistence = new MemoryWatchPersistence();
    let writes = 0;
    let nextId = 0;
    const service = new WatchCaptureService({
      read: (id) => persistence.read(id),
      write: (id, state) => { writes++; persistence.write(id, state); },
    }, () => new Date('2026-09-30T00:00:00.000Z'), () => `watch-${String(++nextId).padStart(4, '0')}`);
    for (let i = 0; i < 330; i++) {
      service.upsertProgress(owner('a'), input({ contentKey: `video-${i}`, sessionId: `session-${i}`, actualPlayedSeconds: 1 }));
    }
    service.upsertProgress(owner('b'), input({ actualPlayedSeconds: 1 }));
    const stored = structuredClone(persistence.read('a'));
    const writesBeforeRead = writes;
    const collected: string[] = [];
    const pageSizes: number[] = [];
    let cursor: string | undefined;
    do {
      const page = service.listPage(owner('a'), { limit: 100, ...(cursor === undefined ? {} : { cursor }) });
      collected.push(...page.items.map((record) => record.id));
      pageSizes.push(page.items.length);
      cursor = page.nextCursor ?? undefined;
    } while (cursor !== undefined);
    expect(pageSizes).toEqual([100, 100, 100, 30]);
    expect(collected).toEqual(Array.from({ length: 330 }, (_, i) => `watch-${String(330 - i).padStart(4, '0')}`));
    expect(new Set(collected).size).toBe(330);
    expect(service.list(owner('a'))).toHaveLength(100);
    expect(service.list(owner('a'), { limit: 1_000 })).toHaveLength(330);
    expect(service.listPage(owner('new-owner'))).toEqual({ items: [], nextCursor: null });
    expect(persistence.read('new-owner')).toBeNull();
    expect(persistence.read('a')).toEqual(stored);
    expect(writes).toBe(writesBeforeRead);
  });

  it('keeps pagination filters and owner isolation across tied timestamps', () => {
    let nextId = 0;
    const service = new WatchCaptureService(new MemoryWatchPersistence(), () => new Date('2026-09-30T00:00:00.000Z'), () => `watch-${++nextId}`);
    for (let i = 0; i < 4; i++) {
      service.upsertProgress(owner('a'), input({ contentKey: `movie-${i}`, sessionId: `movie-session-${i}`, title: 'Needle movie', contentType: 'MOVIE', currentTimeSeconds: 95, actualPlayedSeconds: 1 }));
    }
    service.upsertProgress(owner('a'), input({ contentKey: 'other', actualPlayedSeconds: 1 }));
    service.upsertProgress(owner('b'), input({ contentKey: 'foreign', title: 'Needle movie', contentType: 'MOVIE', currentTimeSeconds: 95, actualPlayedSeconds: 1 }));
    const filters = { contentType: 'MOVIE' as const, status: 'COMPLETED' as const, query: 'needle', limit: 2 };
    const first = service.listPage(owner('a'), filters);
    expect(first.items.map((record) => record.id)).toEqual(['watch-4', 'watch-3']);
    const second = service.listPage(owner('a'), { ...filters, cursor: first.nextCursor! });
    expect(second.items.map((record) => record.id)).toEqual(['watch-2', 'watch-1']);
    expect(second.nextCursor).toBeNull();
    expect([...first.items, ...second.items].every((record) => record.ownerId === 'a')).toBe(true);
    expect(service.listPage(owner('b'), { ...filters, cursor: first.nextCursor! }).items).toHaveLength(0);
  });

  it('resumes by timestamp and id even after a cursor record is removed and a newer record arrives', () => {
    let nextId = 0;
    let current = new Date('2026-09-30T00:00:00.000Z');
    const service = new WatchCaptureService(new MemoryWatchPersistence(), () => current, () => `watch-${++nextId}`);
    for (let i = 0; i < 4; i++) service.upsertProgress(owner('a'), input({ contentKey: `video-${i}`, sessionId: `session-${i}`, actualPlayedSeconds: 1 }));
    const first = service.listPage(owner('a'), { limit: 2 });
    service.remove(owner('a'), first.items[1]!.id);
    current = new Date('2026-09-30T00:01:00.000Z');
    service.upsertProgress(owner('a'), input({ contentKey: 'newest', sessionId: 'new-session', actualPlayedSeconds: 1 }));
    const second = service.listPage(owner('a'), { limit: 2, cursor: first.nextCursor! });
    expect(second.items.map((record) => record.id)).toEqual(['watch-2', 'watch-1']);
    expect(second.nextCursor).toBeNull();
  });

  it('adds nextCursor to the compatible GET items envelope and rejects invalid cursor queries with 400', async () => {
    let nextId = 0;
    const service = new WatchCaptureService(new MemoryWatchPersistence(), () => new Date('2026-09-30T00:00:00.000Z'), () => `watch-${++nextId}`);
    for (let i = 0; i < 3; i++) service.upsertProgress(owner('a'), input({ contentKey: `video-${i}`, sessionId: `session-${i}`, actualPlayedSeconds: 1 }));
    const api = new XLocalCaptureApiAdapter({} as XLocalCaptureService, service);
    const request = { method: 'GET' as const, path: '/v1/watch/records', principal: owner('a') };
    const first = await api.handle({ ...request, query: { limit: '2' } });
    const firstData = first.body.data as { items: { id: string }[]; nextCursor: string | null };
    expect(first.status).toBe(200);
    expect(firstData.items.map((item) => item.id)).toEqual(['watch-3', 'watch-2']);
    expect(firstData.nextCursor).toEqual(expect.any(String));
    expect(watchQuerySchema.safeParse({ limit: '2', cursor: firstData.nextCursor }).success).toBe(true);
    const second = await api.handle({ ...request, query: { limit: '2', cursor: firstData.nextCursor! } });
    expect(second).toMatchObject({ status: 200, body: { data: { items: [{ id: 'watch-1' }], nextCursor: null } } });
    const invalidCursors = [
      '', 'not base64!', 'a'.repeat(1_001), 'YWJj',
      Buffer.from(JSON.stringify({ lastWatchedAt: 'bad-date', id: 'watch-2' })).toString('base64url'),
      Buffer.from(JSON.stringify({ lastWatchedAt: '2026-09-30T00:00:00.000Z', id: 'watch-2', extra: true })).toString('base64url'),
    ];
    for (const cursor of invalidCursors) expect((await api.handle({ ...request, query: { cursor } })).status).toBe(400);
    expect((await api.handle({ ...request, query: { limit: '101' } })).status).toBe(400);
    expect((await api.handle({ ...request, query: { unexpected: 'parameter' } })).status).toBe(400);
    expect((await api.handle({ method: 'GET', path: '/v1/watch/records' })).status).toBe(401);
  });
});
