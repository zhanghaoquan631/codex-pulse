import { describe, expect, it } from 'vitest';
import { randomUUID } from 'node:crypto';
import type { AuthenticatedPrincipal } from '@me-zip/shared-types';
import { InMemoryXCapturePersistence, XLocalCaptureService } from './x-local-capture.js';

const owner = (userId: string): AuthenticatedPrincipal => ({
  userId,
  sessionId: `${userId}-session`,
  roles: ['USER'],
  issuedAt: '2026-01-01T00:00:00.000Z',
});

describe('XLocalCaptureService', () => {
  it('captures explicit actions and deduplicates redraw/retry events', () => {
    const clock = () => new Date('2026-08-22T04:25:00.000Z');
    const service = new XLocalCaptureService(new InMemoryXCapturePersistence(), clock, () => 'event-1');
    const input = { actionType: 'like' as const, postUrl: 'https://x.com/tom/status/123', capturedAt: '2026-08-22T04:25:00.000Z', source: 'LOCAL_CAPTURE' as const };
    const first = service.capture(owner('a'), input);
    const retry = service.capture(owner('a'), input);
    expect(first.event?.actionType).toBe('like');
    expect(retry.deduplicated).toBe(true);
    expect(service.stats(owner('a')).total.like).toBe(1);
  });

  it('does not deduplicate different actions or posts captured in the same time bucket', () => {
    const capturedAt = '2026-08-22T04:25:00.000Z';
    const service = new XLocalCaptureService(
      new InMemoryXCapturePersistence(),
      () => new Date(capturedAt),
      randomUUID,
    );
    const like = service.capture(owner('a'), { actionType: 'like', postUrl: 'https://x.com/tom/status/123', capturedAt });
    const bookmark = service.capture(owner('a'), { actionType: 'bookmark', postUrl: 'https://x.com/tom/status/456', capturedAt });
    expect(like.deduplicated).toBe(false);
    expect(bookmark.deduplicated).toBe(false);
    expect(service.stats(owner('a')).total.like).toBe(1);
    expect(service.stats(owner('a')).total.bookmark).toBe(1);
  });

  it('keeps pre-existing history intact and retains only the newest 100 post-cutover records', () => {
    const persistence = new InMemoryXCapturePersistence();
    let oldTick = Date.parse('2026-08-20T00:00:00.000Z');
    let id = 0;
    const legacy = new XLocalCaptureService(persistence, () => new Date(oldTick++), () => `legacy-${id++}`);
    const legacyIds = Array.from({ length: 3 }, (_, index) => legacy.capture(owner('a'), {
      actionType: 'opened', postUrl: `https://x.com/legacy/status/${index + 1}`,
    }).event!.id);
    const oldSnapshot = persistence.read('a');
    if (oldSnapshot === null) throw new Error('Expected legacy snapshot.');
    // This accurately represents the user's existing file: it was written
    // before the new retention feature, so it has no retention boundary.
    const { timelineRetention: _retention, ...preCutoverSnapshot } = oldSnapshot;
    persistence.write('a', preCutoverSnapshot);

    let newTick = Date.parse('2026-08-30T00:00:00.000Z');
    const current = new XLocalCaptureService(persistence, () => new Date(newTick++), () => `current-${id++}`);
    const currentIds = Array.from({ length: 101 }, (_, index) => current.capture(owner('a'), {
      actionType: 'opened', postUrl: `https://x.com/current/status/${index + 1}`,
    }).event!.id);

    const liked = current.capture(owner('a'), { actionType: 'like', postUrl: 'https://x.com/current/status/liked' }).event!;
    const bookmarked = current.capture(owner('a'), { actionType: 'bookmark', postUrl: 'https://x.com/current/status/bookmarked' }).event!;
    const retained = current.listTimeline(owner('a'), { limit: 100 });
    const snapshot = persistence.read('a');
    expect(snapshot?.events).toHaveLength(105);
    expect(snapshot?.events.map((event) => event.id)).toEqual(expect.arrayContaining(legacyIds));
    expect(snapshot?.events.map((event) => event.id)).not.toContain(currentIds[0]);
    expect(snapshot?.events.map((event) => event.id)).toEqual(expect.arrayContaining(currentIds.slice(1)));
    expect(snapshot?.events.map((event) => event.id)).toEqual(expect.arrayContaining([liked.id, bookmarked.id]));
    expect(snapshot?.content.some((item) => item.postUrl === 'https://x.com/current/status/1')).toBe(false);
    expect(snapshot?.content.filter((item) => item.postUrl.includes('/legacy/status/'))).toHaveLength(3);
    expect(snapshot?.timelineRetention).toMatchObject({ maxManagedEvents: 100, managedEventIds: currentIds.slice(1).reverse() });
    expect(retained.events).toHaveLength(100);
  });

  it('keeps the 100 newest ordinary interactions when an offline capture arrives late', () => {
    const persistence = new InMemoryXCapturePersistence();
    let id = 0;
    const service = new XLocalCaptureService(persistence, () => new Date('2026-08-30T12:00:00.000Z'), () => `event-${id++}`);
    const start = Date.parse('2026-08-30T00:00:00.000Z');
    const current = Array.from({ length: 100 }, (_, index) => service.capture(owner('a'), {
      actionType: 'opened',
      postUrl: `https://x.com/current/status/${index + 1}`,
      capturedAt: new Date(start + index * 60_000).toISOString(),
    }).event!);
    const oldest = current[0];
    if (oldest === undefined) throw new Error('Expected the first captured record.');

    const late = service.capture(owner('a'), {
      actionType: 'opened', postUrl: 'https://x.com/current/status/late', capturedAt: new Date(start - 60_000).toISOString(),
    }).event!;
    let snapshot = persistence.read('a');
    expect(snapshot?.events).toHaveLength(100);
    expect(snapshot?.events.map((event) => event.id)).not.toContain(late.id);
    expect(snapshot?.content.some((item) => item.postUrl === late.postUrl)).toBe(false);

    const newest = service.capture(owner('a'), {
      actionType: 'opened', postUrl: 'https://x.com/current/status/newest', capturedAt: new Date(start + 101 * 60_000).toISOString(),
    }).event!;
    snapshot = persistence.read('a');
    expect(snapshot?.events).toHaveLength(100);
    expect(snapshot?.events.map((event) => event.id)).toEqual(expect.arrayContaining([newest.id]));
    expect(snapshot?.events.map((event) => event.id)).not.toContain(oldest.id);
  });

  it('prunes old non-favorite interactions while preserving likes, bookmarks, and curated library data', () => {
    const persistence = new InMemoryXCapturePersistence();
    let id = 0;
    const service = new XLocalCaptureService(persistence, () => new Date('2026-08-30T00:00:00.000Z'), () => `event-${id++}`);
    const liked = service.capture(owner('a'), { actionType: 'like', postUrl: 'https://x.com/tom/status/100' }).event!;
    const bookmarked = service.capture(owner('a'), { actionType: 'bookmark', postUrl: 'https://x.com/tom/status/200' }).event!;
    service.capture(owner('a'), { actionType: 'opened', postUrl: 'https://x.com/tom/status/300' });
    const saved = service.capture(owner('a'), { actionType: 'copied_link', postUrl: 'https://x.com/tom/status/400' }).event!;
    service.addPrivateLibraryItem(owner('a'), { postUrl: saved.postUrl, sourceEventId: saved.id });

    const result = service.pruneHistoryKeepingFavorites(owner('a'));
    const snapshot = persistence.read('a');
    expect(result).toEqual({ deletedEvents: 2, retainedEvents: 2, deletedContent: 1, retainedContent: 3 });
    expect(snapshot?.events.map((event) => event.id)).toEqual(expect.arrayContaining([liked.id, bookmarked.id]));
    expect(snapshot?.events.map((event) => event.actionType)).not.toContain('opened');
    expect(snapshot?.events.map((event) => event.actionType)).not.toContain('copied_link');
    expect(snapshot?.content.map((item) => item.postUrl)).toEqual(expect.arrayContaining([
      liked.postUrl,
      bookmarked.postUrl,
      saved.postUrl,
    ]));
    expect(snapshot?.privateLibrary).toHaveLength(1);
    expect(snapshot?.timelineRetention).toMatchObject({ maxManagedEvents: 100, managedEventIds: [] });
  });

  it('records only explicit actions on supported public web platforms without creating an X content cache', () => {
    const capturedAt = '2026-08-22T04:25:00.000Z';
    const service = new XLocalCaptureService(
      new InMemoryXCapturePersistence(),
      () => new Date(capturedAt),
      randomUUID,
    );

    const douyin = service.capture(owner('a'), {
      actionType: 'follow', platform: 'DOUYIN', postUrl: 'https://www.douyin.com/user/demo',
      authorHandle: '抖音创作者', capturedAt,
    });
    const bilibili = service.capture(owner('a'), {
      actionType: 'follow', platform: 'BILIBILI', postUrl: 'https://space.bilibili.com/123',
      authorHandle: '哔哩哔哩创作者', capturedAt: '2026-08-22T04:26:00.000Z',
    });
    const undo = service.capture(owner('a'), {
      actionType: 'unfollow', platform: 'BILIBILI', postUrl: 'https://space.bilibili.com/123',
      authorHandle: '哔哩哔哩创作者', capturedAt: '2026-08-22T04:27:00.000Z',
    });
    const wechat = service.capture(owner('a'), {
      actionType: 'bookmark', platform: 'WECHAT_WEB', postUrl: 'https://mp.weixin.qq.com/s/example',
      pageTitle: '微信文章', capturedAt: '2026-08-22T04:28:00.000Z',
    });

    expect(douyin.event).toMatchObject({ platform: 'DOUYIN', actionType: 'follow', postId: null, syncStatus: 'NOT_REQUIRED' });
    expect(bilibili.event).toMatchObject({ platform: 'BILIBILI', actionType: 'follow', postId: null, syncStatus: 'NOT_REQUIRED' });
    expect(undo.event?.actionType).toBe('unfollow');
    expect(wechat.event).toMatchObject({ platform: 'WECHAT_WEB', actionType: 'bookmark', postId: null, syncStatus: 'NOT_REQUIRED' });
    expect(service.stats(owner('a')).total).toMatchObject({ follow: 2, unfollow: 1, bookmark: 1 });
    expect(service.listTimeline(owner('a')).content).toHaveLength(0);
    expect(() => service.capture(owner('a'), {
      actionType: 'follow', platform: 'X', postUrl: 'https://www.douyin.com/user/demo', capturedAt,
    })).toThrow('X URL does not match');
    expect(() => service.capture(owner('a'), {
      actionType: 'bookmark', platform: 'WECHAT_WEB', postUrl: 'https://x.com/tom/status/123', capturedAt,
    })).toThrow('WECHAT_WEB URL does not match');
  });

  it('enforces owner isolation and independent settings', () => {
    const service = new XLocalCaptureService(new InMemoryXCapturePersistence(), () => new Date('2026-08-22T04:25:00.000Z'), randomUUID);
    service.capture(owner('a'), { actionType: 'bookmark', postUrl: 'https://x.com/tom/status/123' });
    expect(service.listTimeline(owner('b')).events).toHaveLength(0);
    service.patchSettings(owner('a'), { captureBookmarks: false });
    expect(service.capture(owner('a'), { actionType: 'bookmark', postUrl: 'https://x.com/tom/status/456' }).disabled).toBe(true);
    expect(service.capture(owner('a'), { actionType: 'like', postUrl: 'https://x.com/tom/status/456' }).event).not.toBeNull();
  });

  it('creates an owner-scoped special favorite from a like or bookmark and deduplicates it', () => {
    const persistence = new InMemoryXCapturePersistence();
    const service = new XLocalCaptureService(persistence, () => new Date('2026-08-22T04:25:00.000Z'), randomUUID);
    const like = service.capture(owner('a'), { actionType: 'like', postUrl: 'https://x.com/tom/status/123', note: '值得回看' });
    const first = service.addSpecialFavorite(owner('a'), { postUrl: 'https://x.com/tom/status/123', sourceEventId: like.event!.id });
    const retry = service.addSpecialFavorite(owner('a'), { postUrl: 'https://x.com/tom/status/123' });
    expect(first.deduplicated).toBe(false);
    expect(retry.deduplicated).toBe(true);
    expect(service.listSpecialFavorites(owner('a'))).toHaveLength(1);
    expect(service.listSpecialFavorites(owner('b'))).toHaveLength(0);
    expect(() => service.addSpecialFavorite(owner('a'), { postUrl: 'https://x.com/tom/status/456' })).toThrow('私人资料库只能添加已点赞、已收藏或已保存');
    expect(service.removeSpecialFavorite(owner('a'), first.favorite.id)).toBe(true);
    expect(service.listSpecialFavorites(owner('a'))).toHaveLength(0);
  });

  it('allows a saved X link to be re-collected into the private library', () => {
    const service = new XLocalCaptureService(new InMemoryXCapturePersistence(), () => new Date('2026-08-22T04:25:00.000Z'), randomUUID);
    const saved = service.capture(owner('a'), {
      actionType: 'copied_link',
      postUrl: 'https://x.com/tom/status/904',
      pageTitle: '设计参考',
      note: '记录这个交互思路',
      tags: ['设计', '灵感'],
      source: 'MANUAL_IMPORT',
    });
    const item = service.addPrivateLibraryItem(owner('a'), { postUrl: saved.event!.postUrl, sourceEventId: saved.event!.id });
    expect(item.item.metadata.sourceAction).toBe('copied_link');
    expect(item.item.note).toBe('记录这个交互思路');
    expect(item.item.tags).toEqual(['设计', '灵感']);
  });

  it('projects an explicit X link collection into the separate reading history without marking it as read', () => {
    const service = new XLocalCaptureService(new InMemoryXCapturePersistence(), () => new Date('2026-08-22T04:25:00.000Z'), randomUUID);
    service.capture(owner('a'), {
      actionType: 'copied_link', postUrl: 'https://x.com/tom/status/905',
      pageTitle: '值得研究的交互', authorHandle: 'tom', note: '下次做资料卡时参考', tags: ['设计'], source: 'MANUAL_IMPORT',
    });
    const [record] = service.listResourceRecords(owner('a'), { resourceType: 'X_LINK' });
    expect(record).toMatchObject({ platform: 'X', author: 'tom', description: '下次做资料卡时参考', openCount: 0, firstOpenedAt: null });
    const opened = service.openResourceRecord(owner('a'), record!.id, { idempotencyKey: 'open-x-link' });
    expect(opened).toMatchObject({ record: { openCount: 1 }, session: { source: 'MEZIP_READING_HISTORY' }, deduplicated: false });
    expect(service.getResourceRecordDetail(owner('a'), record!.id).sessions).toHaveLength(1);
  });

  it('backfills already-saved X links into the reading history without generating reading sessions', () => {
    const persistence = new InMemoryXCapturePersistence();
    const first = new XLocalCaptureService(persistence, () => new Date('2026-08-22T04:25:00.000Z'), randomUUID);
    first.capture(owner('a'), { actionType: 'copied_link', postUrl: 'https://x.com/tom/status/906', pageTitle: '旧的 X 链接', source: 'MANUAL_IMPORT' });
    const snapshot = persistence.read('a');
    if (snapshot === null) throw new Error('Expected capture snapshot.');
    // Model data collected before ResourceRecord existed.
    persistence.write('a', { ...snapshot, resources: [], resourceSessions: [] });

    const migrated = new XLocalCaptureService(persistence, () => new Date('2026-08-22T04:25:00.000Z'), randomUUID);
    const [record] = migrated.listResourceRecords(owner('a'), { resourceType: 'X_LINK' });
    expect(record).toMatchObject({ title: '旧的 X 链接', openCount: 0, firstOpenedAt: null, lastOpenedAt: null });
    expect(migrated.getResourceRecordDetail(owner('a'), record!.id).sessions).toEqual([]);

    const restarted = new XLocalCaptureService(persistence, () => new Date('2026-08-22T04:25:00.000Z'), randomUUID);
    expect(restarted.listResourceRecords(owner('a'), { resourceType: 'X_LINK' })[0]?.id).toBe(record!.id);
  });

  it('rehydrates special favorites from durable persistence', () => {
    const persistence = new InMemoryXCapturePersistence();
    const first = new XLocalCaptureService(persistence, () => new Date('2026-08-22T04:25:00.000Z'), randomUUID);
    first.capture(owner('a'), { actionType: 'bookmark', postUrl: 'https://x.com/tom/status/789' });
    first.addSpecialFavorite(owner('a'), { postUrl: 'https://x.com/tom/status/789' });
    const second = new XLocalCaptureService(persistence, () => new Date('2026-08-22T04:25:00.000Z'), randomUUID);
    expect(second.listSpecialFavorites(owner('a'))).toHaveLength(1);
    expect(second.listSpecialFavorites(owner('a'))[0]?.postUrl).toBe('https://x.com/tom/status/789');
  });

  it('keeps local action history when official enrichment succeeds or fails', () => {
    const service = new XLocalCaptureService(new InMemoryXCapturePersistence(), () => new Date('2026-08-22T04:25:00.000Z'), () => 'event-1');
    const result = service.capture(owner('a'), { actionType: 'opened', postUrl: 'https://x.com/tom/status/123' });
    expect(result.event).not.toBeNull();
    const enriched = service.reconcile(owner('a'), result.event!.id, {
      postUrl: 'https://x.com/tom/status/123',
      textExcerpt: 'official text',
      media: [{ type: 'image', url: 'https://images.example.com/poster.jpg' }],
      status: 'AVAILABLE'
    });
    expect(enriched.syncStatus).toBe('ENRICHED');
    expect(service.listTimeline(owner('a')).content[0]?.textExcerpt).toBe('official text');
    expect(service.listTimeline(owner('a')).content[0]?.media[0]).toMatchObject({ type: 'image', url: 'https://images.example.com/poster.jpg' });
    expect(service.deleteHistory(owner('a'))).toBe(1);
    expect(service.listTimeline(owner('a')).events).toHaveLength(0);
  });

  it('validates enrichment against the captured event platform', () => {
    const service = new XLocalCaptureService(new InMemoryXCapturePersistence(), () => new Date('2026-08-22T04:25:00.000Z'), () => 'douyin-event');
    const result = service.capture(owner('a'), { actionType: 'opened', platform: 'DOUYIN', postUrl: 'https://www.douyin.com/video/123' });
    const enriched = service.reconcile(owner('a'), result.event!.id, {
      postUrl: 'https://www.douyin.com/video/123', textExcerpt: '网页正文', status: 'AVAILABLE',
    });
    expect(enriched.syncStatus).toBe('ENRICHED');
    expect(service.listTimeline(owner('a')).content[0]?.textExcerpt).toBe('网页正文');
  });

  it.each([
    ['X', 'https://x.com/a/status/123'],
    ['DOUYIN', 'https://www.douyin.com/video/123'],
    ['BILIBILI', 'https://www.bilibili.com/video/BV123'],
    ['WECHAT_WEB', 'https://mp.weixin.qq.com/s/123'],
  ] as const)('enriches %s only for its matching event URL and owner', (platform, url) => {
    const service = new XLocalCaptureService(new InMemoryXCapturePersistence(), () => new Date('2026-08-22T04:25:00.000Z'), randomUUID);
    const captured = service.capture(owner('a'), { actionType: 'opened', platform, postUrl: url }).event!;
    const before = service.export(owner('a'));
    expect(() => service.reconcile(owner('a'), captured.id, {postUrl:url+'/different', textExcerpt:'wrong'})).toThrow('Enrichment URL does not match');
    expect(() => service.reconcile(owner('b'), captured.id, {postUrl:url, textExcerpt:'wrong owner'})).toThrow('not found');
    expect(() => service.reconcile(owner('a'), captured.id, {postUrl:'https://example.test/post', textExcerpt:'wrong platform'})).toThrow('URL does not match the selected platform');
    expect(service.export(owner('a'))).toEqual(before);
    service.reconcile(owner('a'), captured.id, {postUrl:url+'?utm_source=fixture', textExcerpt:'correct'});
    const timeline = service.listTimeline(owner('a'));
    expect(timeline.content.find((item) => item.postUrl === url)?.textExcerpt).toBe('correct');
    expect(timeline.events[0]?.id).toBe(captured.id);
  });

  it('migrates legacy favorites into the private library and keeps them after history deletion', () => {
    const persistence = new InMemoryXCapturePersistence();
    const service = new XLocalCaptureService(persistence, () => new Date('2026-08-22T04:25:00.000Z'), randomUUID);
    const event = service.capture(owner('a'), { actionType: 'like', postUrl: 'https://x.com/tom/status/901' });
    service.addSpecialFavorite(owner('a'), { postUrl: event.event!.postUrl, sourceEventId: event.event!.id });
    expect(service.listPrivateLibrary(owner('a'))).toHaveLength(1);
    service.capture(owner('a'), { actionType: 'unlike', postUrl: 'https://x.com/tom/status/901' });
    service.deleteHistory(owner('a'));
    expect(service.listPrivateLibrary(owner('a'))).toHaveLength(1);
  });

  it('deduplicates private items from like and bookmark sources, supports patch/search, batch, and owner isolation', () => {
    const service = new XLocalCaptureService(new InMemoryXCapturePersistence(), () => new Date('2026-08-22T04:25:00.000Z'), randomUUID);
    const like = service.capture(owner('a'), { actionType: 'like', postUrl: 'https://x.com/tom/status/902', authorHandle: 'tom' });
    const bookmark = service.capture(owner('a'), { actionType: 'bookmark', postUrl: 'https://x.com/tom/status/902', authorHandle: 'tom' });
    const first = service.addPrivateLibraryItem(owner('a'), { postUrl: like.event!.postUrl, sourceEventId: like.event!.id, tags: ['design'] });
    const retry = service.addPrivateLibraryItem(owner('a'), { postUrl: bookmark.event!.postUrl, sourceEventId: bookmark.event!.id });
    expect(first.deduplicated).toBe(false);
    expect(retry.deduplicated).toBe(true);
    const updated = service.patchPrivateLibraryItem(owner('a'), first.item.id, { note: '回看', tags: ['design', 'x'] });
    expect(updated.note).toBe('回看');
    expect(service.listPrivateLibrary(owner('a'), { query: '回看' })).toHaveLength(1);
    expect(service.listPrivateLibrary(owner('b'))).toHaveLength(0);
    service.capture(owner('a'), { actionType: 'bookmark', postUrl: 'https://x.com/tom/status/903' });
    expect(service.addPrivateLibraryBatch(owner('a'), [{ postUrl: 'https://x.com/tom/status/903' }])).toHaveLength(1);
  });
});
