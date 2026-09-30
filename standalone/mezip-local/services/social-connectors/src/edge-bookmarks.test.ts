import { describe, expect, it } from 'vitest';
import type { AuthenticatedPrincipal } from '@me-zip/shared-types';
import { XLocalCaptureApiAdapter } from './x-local-capture-api.js';
import { InMemoryXCapturePersistence, XLocalCaptureService } from './x-local-capture.js';

const principal = (userId: string): AuthenticatedPrincipal => ({
  userId,
  sessionId: `${userId}-session`,
  roles: ['USER'],
  issuedAt: '2026-01-01T00:00:00.000Z',
});

describe('Edge bookmark snapshot sync', () => {
  it('normalizes, deduplicates, tombstones missing entries, and isolates owners', () => {
    const service = new XLocalCaptureService(
      new InMemoryXCapturePersistence(),
      () => new Date('2026-08-25T00:00:00.000Z'),
      () => 'unused-id',
    );

    const first = service.syncEdgeBookmarks(principal('owner-a'), {
      complete: true,
      bookmarks: [
        {
          bookmarkId: 'edge-1', folderPath: ' Work ', title: 'Old title',
          url: 'https://user:secret@example.com/docs?utm_source=edge&keep=1#section',
          dateAdded: Date.parse('2026-08-20T00:00:00.000Z'),
        },
        {
          bookmarkId: 'edge-1', folderPath: 'Work/Docs', title: 'Current title',
          url: 'https://example.com/docs?gclid=abc&keep=2', dateAdded: '2026-08-21T00:00:00.000Z',
        },
        { bookmarkId: 'edge-2', folderPath: null, title: 'Other', url: 'http://example.com/other?fbclid=abc' },
      ],
    });

    expect(first.bookmarks).toHaveLength(2);
    expect(first.bookmarks).toEqual(expect.arrayContaining([
      expect.objectContaining({
        bookmarkId: 'edge-1', folderPath: 'Work/Docs', title: 'Current title',
        url: 'https://example.com/docs?keep=2', dateAdded: '2026-08-21T00:00:00.000Z', status: 'active',
      }),
      expect.objectContaining({ bookmarkId: 'edge-2', folderPath: '', url: 'http://example.com/other', status: 'active' }),
    ]));

    const second = service.syncEdgeBookmarks(principal('owner-a'), {
      complete: true,
      bookmarks: [{ bookmarkId: 'edge-1', folderPath: 'Work/Docs', title: 'Current title', url: 'https://example.com/docs?keep=2' }],
    });
    expect(second.bookmarks.find((bookmark) => bookmark.bookmarkId === 'edge-2')).toMatchObject({ status: 'removed' });
    expect(service.getEdgeBookmarkSnapshot(principal('owner-b')).bookmarks).toEqual([]);
  });

  it('does not tombstone active entries while applying a partial snapshot', () => {
    const service = new XLocalCaptureService(
      new InMemoryXCapturePersistence(),
      () => new Date('2026-08-25T00:00:00.000Z'),
      () => 'unused-id',
    );
    service.syncEdgeBookmarks(principal('owner-a'), {
      complete: true,
      bookmarks: [
        { bookmarkId: 'edge-1', title: 'A', url: 'https://example.com/a' },
        { bookmarkId: 'edge-2', title: 'B', url: 'https://example.com/b' },
      ],
    });

    const partial = service.syncEdgeBookmarks(principal('owner-a'), {
      complete: false,
      bookmarks: [{ bookmarkId: 'edge-1', title: 'A updated', url: 'https://example.com/a' }],
    });
    expect(partial.bookmarks).toEqual(expect.arrayContaining([
      expect.objectContaining({ bookmarkId: 'edge-1', title: 'A updated', status: 'active' }),
      expect.objectContaining({ bookmarkId: 'edge-2', status: 'active' }),
    ]));

    const omittedFlag = service.syncEdgeBookmarks(principal('owner-a'), {
      bookmarks: [{ bookmarkId: 'edge-1', title: 'A again', url: 'https://example.com/a' }],
    });
    expect(omittedFlag.bookmarks.find((bookmark) => bookmark.bookmarkId === 'edge-2')).toMatchObject({ status: 'active' });
  });

  it('marks an individual removed bookmark without exposing another owner', () => {
    const service = new XLocalCaptureService(new InMemoryXCapturePersistence(), () => new Date('2026-08-25T00:00:00.000Z'), () => 'unused-id');
    service.syncEdgeBookmarks(principal('owner-a'), { bookmarks: [{ bookmarkId: 'edge-1', title: 'A', url: 'https://example.com/a' }] });

    expect(service.removeEdgeBookmark(principal('owner-a'), 'edge-1')).toMatchObject({ bookmarkId: 'edge-1', status: 'removed' });
    expect(service.removeEdgeBookmark(principal('owner-a'), 'edge-1')).toMatchObject({ bookmarkId: 'edge-1', status: 'removed' });
    expect(service.removeEdgeBookmark(principal('owner-b'), 'edge-1')).toBeNull();
  });

  it('exposes owner-scoped GET, full PUT, and DELETE routes with validation', async () => {
    const service = new XLocalCaptureService(new InMemoryXCapturePersistence(), () => new Date('2026-08-25T00:00:00.000Z'), () => 'unused-id');
    const api = new XLocalCaptureApiAdapter(service);
    const path = '/v1/x/local-capture/edge-bookmarks';

    const put = await api.handle({
      method: 'PUT', path, principal: principal('owner-a'),
      body: { complete: true, bookmarks: [{ bookmarkId: 'edge/a', folderPath: 'Links', title: 'A', url: 'https://example.com/a#top' }] },
    });
    expect(put.status).toBe(200);
    expect((put.body.data as { bookmarks: readonly { url: string }[] }).bookmarks[0]?.url).toBe('https://example.com/a');

    const get = await api.handle({ method: 'GET', path, principal: principal('owner-a') });
    expect(get.status).toBe(200);
    expect(get.body.data).toEqual(expect.objectContaining({ bookmarks: expect.any(Array), syncedAt: expect.any(String) }));

    const deleted = await api.handle({ method: 'DELETE', path: `${path}/${encodeURIComponent('edge/a')}`, principal: principal('owner-a') });
    expect(deleted.status).toBe(200);
    expect(deleted.body.data).toMatchObject({ deleted: true, bookmark: { bookmarkId: 'edge/a', status: 'removed' } });

    const denied = await api.handle({ method: 'GET', path, principal: principal('owner-b') });
    expect((denied.body.data as { bookmarks: readonly unknown[] }).bookmarks).toEqual([]);
    const invalid = await api.handle({ method: 'PUT', path, principal: principal('owner-a'), body: { bookmarks: 'not-an-array' } });
    expect(invalid.status).toBe(400);
    const invalidComplete = await api.handle({ method: 'PUT', path, principal: principal('owner-a'), body: { bookmarks: [], complete: 'yes' } });
    expect(invalidComplete.status).toBe(400);
  });
});
