import { randomUUID } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import type { AuthenticatedPrincipal } from '@me-zip/shared-types';
import { activityClickRecordId } from './activity-clicks.js';
import { XLocalCaptureApiAdapter } from './x-local-capture-api.js';
import { InMemoryXCapturePersistence, XLocalCaptureService } from './x-local-capture.js';

const owner = (userId = 'a'): AuthenticatedPrincipal => ({ userId, sessionId: `${userId}-session`, roles: ['USER'], issuedAt: '2026-09-26T00:00:00.000Z' });
const timestamp = '2026-09-26T01:00:00.000Z';

describe('activity click summaries', () => {
  it('keeps two independent same-millisecond activations and persists retry identity across restarts', () => {
    const persistence = new InMemoryXCapturePersistence();
    const service = new XLocalCaptureService(persistence, () => new Date(timestamp));
    const input = { url: 'https://x.com/alice/status/123?s=20', title: 'One post', idempotencyKey: randomUUID() };
    const first = service.recordActivityClick(owner(), input);
    const second = service.recordActivityClick(owner(), { ...input, idempotencyKey: randomUUID() });
    expect(second.record).toMatchObject({ clickCount: 2, explicitClickCount: 2, legacyOpenCount: 0, kind: 'X', url: 'https://x.com/alice/status/123' });
    const restarted = new XLocalCaptureService(persistence, () => new Date('2026-09-26T02:00:00.000Z'));
    const retry = restarted.recordActivityClick(owner(), { ...input, url: 'https://twitter.com/alice/status/123' });
    expect(retry).toMatchObject({ deduplicated: true, session: { id: first.session.id, clickedAt: timestamp }, record: { clickCount: 2, lastClickedAt: timestamp } });
    expect(restarted.getActivityClickDetail(owner(), first.record.id).sessions).toHaveLength(2);
    expect(persistence.read('a')?.clickSessions).toHaveLength(2);
  });

  it('does not count saving, liking, bookmarking, viewing, detail reads, or list reads as clicks', () => {
    const service = new XLocalCaptureService();
    const url = 'https://x.com/alice/status/123';
    for (const actionType of ['like', 'bookmark', 'viewed', 'copied_link', 'manual_save'] as const) service.capture(owner(), { actionType, postUrl: url });
    service.addPrivateLibraryItem(owner(), { postUrl: url });
    const [record] = service.listActivityClicks(owner());
    expect(record).toMatchObject({ url, clickCount: 0, lastClickedAt: null });
    expect(service.getActivityClickDetail(owner(), record!.id)).toMatchObject({ record: { clickCount: 0 }, sessions: [] });
    expect(service.listActivityClicks(owner())).toHaveLength(1);
  });

  it('reuses resource sessions and their existing open count without double counting a shared activation UUID', () => {
    const service = new XLocalCaptureService(new InMemoryXCapturePersistence(), () => new Date(timestamp));
    const resource = service.upsertResourceRecord(owner(), { resourceType: 'ARTICLE', url: 'https://example.com/article', title: 'Article' }).record;
    const idempotencyKey = randomUUID();
    const opened = service.openResourceRecord(owner(), resource.id, { idempotencyKey });
    const retry = service.recordActivityClick(owner(), { url: resource.url, idempotencyKey });
    expect(retry).toMatchObject({ deduplicated: true, record: { clickCount: 1, explicitClickCount: 1 }, session: { id: opened.session.id, source: 'MEZIP_READING_HISTORY' } });
    const independent = service.recordActivityClick(owner(), { url: resource.url, idempotencyKey: randomUUID() });
    expect(independent.record.clickCount).toBe(2);
    expect(service.getResourceRecord(owner(), resource.id).openCount).toBe(1);
  });

  it('does not count a reverse-order retry once per API', () => {
    const service = new XLocalCaptureService(new InMemoryXCapturePersistence(), () => new Date(timestamp));
    const resource = service.upsertResourceRecord(owner(), { resourceType: 'WEBPAGE', url: 'https://example.com/article' }).record;
    const idempotencyKey = randomUUID();
    service.recordActivityClick(owner(), { url: resource.url, idempotencyKey });
    service.openResourceRecord(owner(), resource.id, { idempotencyKey });
    expect(service.listActivityClicks(owner())[0]).toMatchObject({ clickCount: 1, explicitClickCount: 1 });
    expect(service.recordActivityClick(owner(), { url: resource.url, idempotencyKey }).deduplicated).toBe(true);
  });

  it('labels legacy opened observations, excludes viewed events, and avoids counting the load after an explicit open twice', () => {
    let time = Date.parse(timestamp);
    const service = new XLocalCaptureService(new InMemoryXCapturePersistence(), () => new Date(time));
    const url = 'https://x.com/alice/status/123';
    service.capture(owner(), { actionType: 'opened', postUrl: url });
    service.capture(owner(), { actionType: 'viewed', postUrl: url });
    time += 60_000;
    service.recordActivityClick(owner(), { url, idempotencyKey: randomUUID() });
    time += 2_000;
    service.capture(owner(), { actionType: 'opened', postUrl: url });
    const detail = service.getActivityClickDetail(owner(), activityClickRecordId('a', url));
    expect(detail.record).toMatchObject({ clickCount: 2, explicitClickCount: 1, legacyOpenCount: 1 });
    expect(detail.sessions).toHaveLength(2);
    expect(detail.sessions[1]).toMatchObject({ source: 'LEGACY_X_OPENED', legacy: true, clickedAt: timestamp });
  });

  it('migrates snapshots missing click sessions without inventing timestamps for historic aggregate counts', () => {
    const persistence = new InMemoryXCapturePersistence();
    const original = new XLocalCaptureService(persistence, () => new Date(timestamp));
    const resource = original.upsertResourceRecord(owner(), { resourceType: 'WEBPAGE', url: 'https://example.com/legacy' }).record;
    const snapshot = persistence.read('a')!;
    const legacy = { ...snapshot };
    delete legacy.clickSessions;
    delete legacy.resourceSessions;
    persistence.write('a', { ...legacy, resources: [{ ...resource, openCount: 4, lastOpenedAt: timestamp }] });
    const migrated = new XLocalCaptureService(persistence, () => new Date(timestamp));
    const [record] = migrated.listActivityClicks(owner());
    expect(record).toMatchObject({ clickCount: 4, explicitClickCount: 0, legacyOpenCount: 4, missingTimestampCount: 4, lastClickedAt: timestamp });
    expect(migrated.getActivityClickDetail(owner(), record!.id).sessions).toEqual([]);
    migrated.recordActivityClick(owner(), { url: resource.url, idempotencyKey: randomUUID() });
    expect(migrated.listActivityClicks(owner())[0]).toMatchObject({ clickCount: 5, missingTimestampCount: 4 });
    expect(persistence.read('a')?.resources?.[0]?.openCount).toBe(4);
  });

  it('includes saved browser bookmarks with zero clicks and keeps distinct detailed paths separate', () => {
    const service = new XLocalCaptureService();
    service.syncEdgeBookmarks(owner(), { complete: true, bookmarks: [{ bookmarkId: '1', title: 'Home', url: 'https://example.com/' }] });
    service.recordActivityClick(owner(), { url: 'https://example.com/path/one', idempotencyKey: randomUUID() });
    service.recordActivityClick(owner(), { url: 'https://example.com/path/two?article=2', idempotencyKey: randomUUID() });
    expect(service.listActivityClicks(owner())).toHaveLength(3);
    expect(service.listActivityClicks(owner()).find((record) => record.url === 'https://example.com/')).toMatchObject({ kind: 'BROWSER', platform: 'EDGE', clickCount: 0 });
  });

  it('isolates owners and rejects an activation ID reused for a different URL', () => {
    const service = new XLocalCaptureService();
    const input = { url: 'https://example.com/a', idempotencyKey: randomUUID() };
    const first = service.recordActivityClick(owner(), input);
    expect(service.listActivityClicks(owner('b'))).toEqual([]);
    expect(() => service.getActivityClickDetail(owner('b'), first.record.id)).toThrow('not found');
    expect(() => service.recordActivityClick(owner(), { ...input, url: 'https://example.com/b' })).toThrow('different URL');
    expect(service.recordActivityClick(owner('b'), input).deduplicated).toBe(false);
  });

  it('requires authentication, UUID retry keys, safe URLs, and returns the documented API shape', async () => {
    const service = new XLocalCaptureService(new InMemoryXCapturePersistence(), () => new Date(timestamp));
    const api = new XLocalCaptureApiAdapter(service);
    expect((await api.handle({ method: 'GET', path: '/v1/activity/clicks' })).status).toBe(401);
    const request = { method: 'POST' as const, path: '/v1/activity/clicks', principal: owner() };
    expect((await api.handle({ ...request, body: { url: 'https://example.com/' } })).status).toBe(400);
    expect((await api.handle({ ...request, body: { url: 'https://example.com/', idempotencyKey: 'one-click' } })).status).toBe(400);
    expect((await api.handle({ ...request, body: { url: 'javascript:alert(1)', idempotencyKey: randomUUID() } })).status).toBe(400);
    const input = { url: 'https://example.com/', idempotencyKey: randomUUID() };
    const posted = await api.handle({ ...request, body: input });
    expect(posted).toMatchObject({ status: 201, body: { data: { record: { clickCount: 1, kind: 'BROWSER' }, session: { clickedAt: timestamp, legacy: false }, deduplicated: false } } });
    const listed = await api.handle({ method: 'GET', path: '/v1/activity/clicks', principal: owner() });
    expect(listed).toMatchObject({ status: 200, body: { data: { items: [{ clickCount: 1 }] } } });
    const detail = await api.handle({ method: 'GET', path: `/v1/activity/clicks/${activityClickRecordId('a', input.url)}`, principal: owner() });
    expect(detail).toMatchObject({ status: 200, body: { data: { record: { clickCount: 1 }, sessions: [{ clickedAt: timestamp }] } } });
  });
});
