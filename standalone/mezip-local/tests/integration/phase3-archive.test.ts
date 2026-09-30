import { describe, expect, it } from 'vitest';

import type { AuthenticatedPrincipal } from '@me-zip/shared-types';

import {
  ArchiveAuthorizationError,
  ArchiveConflictError,
  InMemoryArchiveRepository,
} from '../../services/archive/src/index.js';

const owner: AuthenticatedPrincipal = {
  userId: '00000000-0000-0000-0000-000000000001',
  sessionId: '00000000-0000-0000-0000-000000000011',
  roles: ['USER'],
  issuedAt: '2026-08-17T00:00:00.000Z',
};
const other: AuthenticatedPrincipal = {
  userId: '00000000-0000-0000-0000-000000000002',
  sessionId: '00000000-0000-0000-0000-000000000022',
  roles: ['USER'],
  issuedAt: '2026-08-17T00:00:00.000Z',
};

function archive(quotaBytes = 1_000_000): InMemoryArchiveRepository {
  let sequence = 0;
  return new InMemoryArchiveRepository({
    quotaBytes,
    runtime: {
      id: () => `00000000-0000-0000-0000-${String(++sequence).padStart(12, '0')}`,
      now: () => '2026-08-17T12:00:00.000Z',
    },
  });
}

describe('Phase 3 archive integration authorization', () => {
  it('rejects cross-user read, update, trash and permanent delete', () => {
    const service = archive();
    const entry = service.createEntry(owner, {
      kind: 'LIFE',
      lifeType: 'MEMORY',
      title: 'Owner A private record',
      body: 'private',
      occurredAt: '2026-08-17T08:00:00.000Z',
    });
    expect(() => service.getEntry(other, entry.id)).toThrow(ArchiveAuthorizationError);
    expect(() => service.updateEntry(other, entry.id, { body: 'attack' })).toThrow(
      ArchiveAuthorizationError,
    );
    expect(() => service.trashEntry(other, entry.id)).toThrow(
      ArchiveAuthorizationError,
    );
    expect(() => service.permanentlyDeleteEntry(other, entry.id)).toThrow(
      ArchiveAuthorizationError,
    );
    expect(service.getEntry(owner, entry.id).body).toBe('private');
  });

  it('keeps History, Fitness, Media, Timeline and Export owner-scoped', () => {
    const service = archive();
    const history = service.createHistory(owner, { title: 'private history', date: '2026-08-17T08:00:00.000Z' });
    const fitness = service.createFitness(owner, { occurredAt: '2026-08-17T08:10:00.000Z', trainingType: 'RUNNING' });
    const media = service.registerMedia(owner, { storageKey: 'private/a.png', contentType: 'image/png', bytes: 2 });
    expect(() => service.getHistory(other, history.id)).toThrow(ArchiveAuthorizationError);
    expect(() => service.getFitness(other, fitness.id)).toThrow(ArchiveAuthorizationError);
    expect(() => service.getMedia(other, media.id)).toThrow(ArchiveAuthorizationError);
    expect(service.getTimeline(other)).toHaveLength(0);
    expect(service.exportArchive(other).histories).toHaveLength(0);
    expect(service.exportArchive(other).fitness).toHaveLength(0);
    expect(service.exportArchive(other).media).toHaveLength(0);
  });

  it('denies cross-user update/delete/download for every archive resource', () => {
    const service = archive();
    const life = service.createEntry(owner, {
      kind: 'LIFE',
      title: 'private life',
      occurredAt: '2026-08-17T08:00:00.000Z',
    });
    const history = service.createHistory(owner, {
      title: 'private history',
      date: '2026-08-17T08:00:00.000Z',
    });
    const fitness = service.createFitness(owner, {
      occurredAt: '2026-08-17T08:00:00.000Z',
      trainingType: 'RUNNING',
    });
    const media = service.registerMedia(owner, {
      storageKey: 'private/owner-a.jpg',
      contentType: 'image/jpeg',
      bytes: 1,
    });
    expect(() => service.updateHistory(other, history.id, { reflection: 'id-or' })).toThrow(ArchiveAuthorizationError);
    expect(() => service.updateFitness(other, fitness.id, { notes: 'id-or' })).toThrow(ArchiveAuthorizationError);
    expect(() => service.permanentlyDeleteHistory(other, history.id)).toThrow(ArchiveAuthorizationError);
    expect(() => service.permanentlyDeleteFitness(other, fitness.id)).toThrow(ArchiveAuthorizationError);
    expect(() => service.getMedia(other, media.id)).toThrow(ArchiveAuthorizationError);
    expect(() => service.permanentlyDeleteMedia(other, media.id)).toThrow(ArchiveAuthorizationError);
    expect(() => service.updateEntry(other, life.id, { body: 'id-or' })).toThrow(ArchiveAuthorizationError);
    expect(service.getEntry(owner, life.id).body).not.toBe('id-or');
  });

  it('keeps revisions append-only and reports stale writes', () => {
    const service = archive();
    const entry = service.createEntry(owner, {
      kind: 'LIFE',
      title: 'Versioned',
      body: 'v1',
      occurredAt: '2026-08-17T08:00:00.000Z',
    });
    service.updateEntry(owner, entry.id, { body: 'v2' }, { expectedRevision: 1 });
    expect(() =>
      service.updateEntry(
        owner,
        entry.id,
        { body: 'lost update' },
        { expectedRevision: 1 },
      ),
    ).toThrow(ArchiveConflictError);
    expect(
      service.listRevisions(owner, entry.id).map((revision) => revision.revision),
    ).toEqual([1, 2]);
  });

  it('separates published snapshots and AI insights from source revisions', () => {
    const service = archive();
    const entry = service.createEntry(owner, {
      kind: 'LIFE',
      title: 'Source',
      body: 'original',
      occurredAt: '2026-08-17T08:00:00.000Z',
    });
    const published = service.publishSnapshot(owner, entry.id, {
      title: 'public title',
    });
    const insight = service.createAiInsight(owner, {
      entryId: entry.id,
      sourceRevision: entry.revision,
      provider: 'MOCK',
      model: 'mock-v1',
      insight: { mood: 'calm' },
    });
    service.updateEntry(owner, entry.id, { body: 'changed' }, { expectedRevision: 1 });
    expect(
      service.listPublishedSnapshots(owner, entry.id)[0]?.selectedContent.title,
    ).toBe('public title');
    expect(service.listAiInsights(owner, entry.id)[0]?.sourceRevision).toBe(1);
    expect(service.listAiInsights(owner, entry.id)[0]?.outputType).toBe('AI_GENERATED');
    expect(service.exportArchive(owner).publishedSnapshots[0]?.id).toBe(published.id);
    expect(service.exportArchive(owner).aiInsights[0]?.id).toBe(insight.id);
    expect(() => service.listAiInsights(other, entry.id)).toThrow(
      ArchiveAuthorizationError,
    );
  });

  it('is idempotent for daily packs, protects media quota, and scopes export/search', () => {
    const service = archive(10);
    const entry = service.createEntry(owner, {
      kind: 'LIFE',
      title: 'photo note',
      occurredAt: '2026-08-17T08:00:00.000Z',
    });
    const history = service.createHistory(owner, {
      title: 'History',
      date: '2026-08-17T07:00:00.000Z',
    });
    const pack = service.upsertDailyPack(owner, {
      day: '2026-08-17T00:00:00.000Z',
      entryIds: [entry.id],
      historyIds: [history.id],
    });
    expect(
      service.upsertDailyPack(owner, {
        day: '2026-08-17T00:00:00.000Z',
        entryIds: [entry.id],
        historyIds: [history.id],
      }).id,
    ).toBe(pack.id);
    const media = service.registerMedia(owner, {
      storageKey: 'private/a.jpg',
      contentType: 'image/jpeg',
      bytes: 10,
    });
    expect(service.getStorageQuota(owner).usedBytes).toBe(10);
    expect(() =>
      service.registerMedia(owner, {
        storageKey: 'private/b.jpg',
        contentType: 'image/jpeg',
        bytes: 1,
      }),
    ).toThrow('quota');
    expect(service.search(other, 'photo')).toHaveLength(0);
    expect(service.exportArchive(other).media).toHaveLength(0);
    expect(service.getMedia(owner, media.id).ownerId).toBe(owner.userId);
  });

  it('orders Timeline by occurred time and validates media MIME boundaries', () => {
    const service = archive(100);
    const old = service.createEntry(owner, {
      kind: 'LIFE',
      title: 'occurred in 2022',
      occurredAt: '2022-06-01T09:00:00.000+08:00',
    });
    const recent = service.createEntry(owner, {
      kind: 'LIFE',
      title: 'received today',
      occurredAt: '2026-08-17T09:00:00.000Z',
    });
    expect(service.getTimeline(owner).findIndex((item) => item.sourceId === recent.id)).toBeLessThan(
      service.getTimeline(owner).findIndex((item) => item.sourceId === old.id),
    );
    expect(() => service.registerMedia(owner, {
      storageKey: 'private/mismatch.jpg',
      contentType: 'text/plain',
      bytes: 1,
    })).toThrow('contentType');
    expect(() => service.registerMedia(owner, {
      storageKey: 'private/too-large.jpg',
      contentType: 'image/jpeg',
      bytes: 101,
    })).toThrow('quota');
  });
});
