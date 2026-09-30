import { describe, expect, it } from 'vitest';

import type { AuthenticatedPrincipal } from '@me-zip/shared-types';

import {
  ArchiveAuthorizationError,
  ArchiveConflictError,
  ArchiveNotFoundError,
  InMemoryArchivePersistence,
  InMemoryArchiveRepository,
  LocalSearchProvider,
} from './index.js';

const owner: AuthenticatedPrincipal = {
  userId: 'owner-a',
  sessionId: 'session-a',
  roles: ['USER'],
  issuedAt: '2026-08-17T00:00:00.000Z',
};
const other: AuthenticatedPrincipal = {
  userId: 'owner-b',
  sessionId: 'session-b',
  roles: ['USER'],
  issuedAt: '2026-08-17T00:00:00.000Z',
};

function repository(quotaBytes = 100_000): InMemoryArchiveRepository {
  let sequence = 0;
  return new InMemoryArchiveRepository({
    quotaBytes,
    runtime: {
      id: () => `id-${++sequence}`,
      now: () => '2026-08-17T12:00:00.000Z',
    },
  });
}

describe('Phase 3 archive domain', () => {
  it('keeps CRUD, revisions, trash/restore and permanent deletion owner scoped', () => {
    const archive = repository();
    const created = archive.createEntry(owner, {
      kind: 'LIFE',
      title: 'A private note',
      body: 'Only the owner can read this.',
      occurredAt: '2026-08-17T08:00:00.000Z',
      idempotencyKey: 'create-1',
    });
    expect(archive.createEntry(owner, {
      kind: 'LIFE',
      title: 'A private note',
      body: 'Only the owner can read this.',
      occurredAt: '2026-08-17T08:00:00.000Z',
      idempotencyKey: 'create-1',
    }).id).toBe(created.id);
    expect(() => archive.getEntry(other, created.id)).toThrow(ArchiveAuthorizationError);

    const updated = archive.updateEntry(owner, created.id, { title: 'Edited' }, { expectedRevision: 1 });
    expect(updated.revision).toBe(2);
    expect(archive.listRevisions(owner, created.id)).toHaveLength(2);
    expect(archive.listSnapshots(owner, created.id)).toHaveLength(2);

    const trashed = archive.trashEntry(owner, created.id, { expectedRevision: 2 });
    expect(trashed.status).toBe('TRASHED');
    expect(() => archive.getEntry(owner, created.id)).toThrow(ArchiveNotFoundError);
    expect(archive.restoreEntry(owner, created.id, { expectedRevision: 3 }).status).toBe('ACTIVE');
    archive.permanentlyDeleteEntry(owner, created.id);
    expect(() => archive.getEntry(owner, created.id)).toThrow(ArchiveNotFoundError);
  });

  it('publishes body-free lifecycle events only after archive mutation commits and never for an idempotency replay', () => {
    const events: unknown[] = [];
    let sequence = 0;
    const archive = new InMemoryArchiveRepository({
      runtime: { id: () => `event-${++sequence}`, now: () => '2026-08-17T12:00:00.000Z' },
      lifecycleSink: { publish: (event) => events.push(event) },
    });
    const entry = archive.createEntry(owner, {
      kind: 'LIFE',
      title: 'Event source',
      body: 'This body must never enter a lifecycle event.',
      occurredAt: '2026-08-17T08:00:00.000Z',
      idempotencyKey: 'event-create-1',
    });
    archive.createEntry(owner, {
      kind: 'LIFE',
      title: 'Event source',
      body: 'This body must never enter a lifecycle event.',
      occurredAt: '2026-08-17T08:00:00.000Z',
      idempotencyKey: 'event-create-1',
    });
    archive.trashEntry(owner, entry.id, { expectedRevision: 1 });
    archive.restoreEntry(owner, entry.id, { expectedRevision: 2 });
    archive.permanentlyDeleteEntry(owner, entry.id);
    expect(events).toHaveLength(4);
    expect(events).toEqual(expect.arrayContaining([
      expect.objectContaining({ ownerId: owner.userId, sourceType: 'ENTRY', sourceId: entry.id, action: 'SAVED', status: 'ACTIVE' }),
      expect.objectContaining({ action: 'TRASHED', status: 'TRASHED' }),
      expect.objectContaining({ action: 'RESTORED', status: 'ACTIVE' }),
      expect.objectContaining({ action: 'DELETED', status: 'DELETED' }),
    ]));
    expect(JSON.stringify(events)).not.toContain('This body must never enter');
  });

  it('detects stale revisions and exposes a conflict for offline reconciliation', () => {
    const archive = repository();
    const entry = archive.createEntry(owner, {
      kind: 'LIFE',
      title: 'Concurrent note',
      occurredAt: '2026-08-17T08:00:00.000Z',
    });
    archive.updateEntry(owner, entry.id, { body: 'server change' });
    let conflictId = '';
    try {
      archive.updateEntry(owner, entry.id, { body: 'offline change' }, { expectedRevision: 1 });
    } catch (error) {
      expect(error).toBeInstanceOf(ArchiveConflictError);
      conflictId = (error as ArchiveConflictError).conflictId;
    }
    expect(conflictId).not.toBe('');
    expect(archive.listConflicts(owner, true)).toHaveLength(1);
    const mutation = archive.recordOfflineMutation(owner, {
      clientMutationId: 'device-1:1',
      entityType: 'ENTRY',
      entityId: entry.id,
      operation: 'UPDATE',
      payload: { body: 'offline change' },
      baseRevision: 1,
    });
    expect(mutation.status).toBe('PENDING');
    archive.updateOfflineMutation(owner, mutation.clientMutationId, 'CONFLICT', conflictId);
    archive.resolveConflict(owner, conflictId, { resolution: 'KEEP_SERVER' });
    expect(archive.getSyncState(owner).conflicts).toBe(0);
    expect(archive.getSyncState(owner).pending).toBe(0);
  });

  it('supports cursor-safe Life, Timeline and Search pages', () => {
    const archive = repository();
    const first = archive.createEntry(owner, {
      kind: 'LIFE',
      title: 'first cursor',
      occurredAt: '2026-08-17T09:00:00.000Z',
    });
    archive.createEntry(owner, {
      kind: 'LIFE',
      title: 'second cursor',
      occurredAt: '2026-08-17T08:00:00.000Z',
    });
    expect(archive.listEntries(owner, { limit: 1 })[0]?.id).toBe(first.id);
    expect(archive.listEntries(owner, { cursor: first.id })[0]?.title).toBe('second cursor');
    expect(archive.getTimeline(owner, { limit: 1 })[0]?.sourceId).toBe(first.id);
    expect(archive.search(owner, 'cursor', { limit: 1, cursor: first.id })[0]?.title).toBe('second cursor');
  });

  it('aggregates history, fitness, steps and daily packs into a private timeline and export', () => {
    const archive = repository();
    const entry = archive.createEntry(owner, {
      kind: 'LIFE',
      title: 'Morning',
      occurredAt: '2026-08-17T08:00:00.000Z',
    });
    const history = archive.createHistory(owner, {
      title: 'The Han dynasty',
      date: '2026-08-16T00:00:00.000Z',
      reflection: 'Read and reflected.',
    });
    const fitness = archive.createFitness(owner, {
      occurredAt: '2026-08-17T07:00:00.000Z',
      trainingType: 'Run',
      durationSeconds: 1800,
    });
    archive.createBodyMetric(owner, {
      measuredAt: '2026-08-17T07:30:00.000Z',
      weightGrams: 70_000,
    });
    archive.upsertSteps(owner, { day: '2026-08-17T00:00:00.000Z', steps: 8_000, source: 'PHONE' });
    archive.upsertDailyPack(owner, {
      day: '2026-08-17T00:00:00.000Z',
      summary: 'Daily pack',
      entryIds: [entry.id],
      historyIds: [history.id],
      fitnessIds: [fitness.id],
    });
    const timeline = archive.getTimeline(owner);
    expect(timeline.map((item) => item.sourceType)).toEqual(expect.arrayContaining(['ENTRY', 'HISTORY', 'FITNESS', 'STEPS', 'DAILY_PACK']));
    expect(archive.search(owner, 'han')).toHaveLength(1);
    expect(archive.search(other, 'han')).toHaveLength(0);
    const exported = archive.exportArchive(owner);
    expect(exported.ownerId).toBe(owner.userId);
    expect(exported.records).toHaveLength(1);
    expect(exported.histories).toHaveLength(1);
    expect(exported.bodyMetrics).toHaveLength(1);
    expect(exported.steps).toHaveLength(1);
    expect(exported.schema_version).toBe('mezip.archive.export.v1');
    expect(exported.exported_at).toBe('2026-08-17T12:00:00.000Z');
    expect(exported.life).toHaveLength(1);
    expect(exported.history).toHaveLength(1);
    expect(exported.fitnessRecords).toHaveLength(1);
    expect(exported.timeline_metadata.length).toBeGreaterThanOrEqual(1);
    expect(exported.media_policy).toBe('MANIFEST_ONLY');
    expect(exported.trash_policy).toBe('EXCLUDED_BY_DEFAULT');
    expect(exported.checksum).not.toBe('');

    const trashed = archive.createEntry(owner, {
      kind: 'LIFE',
      title: 'excluded by default',
      occurredAt: '2026-08-17T06:00:00.000Z',
    });
    archive.trashEntry(owner, trashed.id, { expectedRevision: 1 });
    expect(archive.exportArchive(owner).records.some((item) => item.id === trashed.id)).toBe(false);
    expect(archive.exportArchive(owner, { includeTrashed: true }).records.some((item) => item.id === trashed.id)).toBe(true);
    expect(archive.exportArchive(owner, { includeTrashed: true }).trash_policy).toBe('INCLUDED');
  });

  it('accepts WeChat Sport steps only from a server verifier and retains the verified source', () => {
    const seen: unknown[] = [];
    const archive = new InMemoryArchiveRepository({
      runtime: { id: () => `wechat-${seen.length + 1}`, now: () => '2026-08-17T12:00:00.000Z' },
      weChatSportVerifier: {
        verify(principal, encrypted) {
          seen.push({ principal, encrypted });
          return [{ day: '2026-08-16T00:00:00.000Z', steps: 9_321 }];
        },
      },
    });
    const imported = archive.importWeChatSportSteps(owner, {
      encryptedData: 'encrypted-only',
      iv: 'iv-only',
      idempotencyKey: 'wechat-steps-1',
    });
    expect(imported).toHaveLength(1);
    expect(imported[0]).toMatchObject({ ownerId: owner.userId, steps: 9_321, source: 'WECHAT' });
    expect(archive.importWeChatSportSteps(owner, {
      encryptedData: 'different-ciphertext-is-not-stored',
      iv: 'different-iv-is-not-stored',
      idempotencyKey: 'wechat-steps-1',
    })[0]?.id).toBe(imported[0]?.id);
    expect(seen).toHaveLength(2);
  });

  it('enforces media quota, metadata ownership and links', () => {
    const archive = repository(10);
    const entry = archive.createEntry(owner, {
      kind: 'LIFE',
      title: 'Photo context',
      occurredAt: '2026-08-17T08:00:00.000Z',
    });
    const media = archive.registerMedia(owner, {
      storageKey: 'private/owner-a/photo.jpg',
      contentType: 'image/jpeg',
      bytes: 8,
      width: 100,
      height: 100,
    });
    expect(archive.getStorageQuota(owner).availableBytes).toBe(2);
    expect(() => archive.registerMedia(owner, {
      storageKey: 'private/owner-a/too-large.jpg',
      contentType: 'image/jpeg',
      bytes: 3,
    })).toThrow('quota');
    expect(() => archive.registerMedia(owner, {
      storageKey: 'private/owner-a/wrong.png',
      contentType: 'image/jpeg',
      bytes: 1,
    })).toThrow('extension');
    const link = archive.linkMedia(owner, media.id, 'ENTRY', entry.id);
    expect(archive.listMediaLinks(owner, entry.id)).toHaveLength(1);
    expect(() => archive.getMedia(other, media.id)).toThrow(ArchiveAuthorizationError);
    archive.unlinkMedia(owner, link.id);
    expect(archive.listMediaLinks(owner, entry.id)).toHaveLength(0);
  });

  it('round-trips through the persistence seam without changing ownership', () => {
    const persistence = new InMemoryArchivePersistence();
    let sequence = 0;
    const first = new InMemoryArchiveRepository({ persistence, runtime: { id: () => `id-${++sequence}`, now: () => '2026-08-17T12:00:00.000Z' } });
    const created = first.createEntry(owner, { kind: 'AI', title: 'Usage', occurredAt: '2026-08-17T08:00:00.000Z' });
    const persistedIdempotent = first.createEntry(owner, {
      kind: 'LIFE',
      title: 'Idempotent',
      occurredAt: '2026-08-17T08:00:00.000Z',
      idempotencyKey: 'persisted-create',
    });
    const second = new InMemoryArchiveRepository({ persistence, runtime: { id: () => 'id-b', now: () => '2026-08-17T12:00:00.000Z' } });
    expect(second.getEntry(owner, created.id).title).toBe('Usage');
    expect(second.createEntry(owner, {
      kind: 'LIFE',
      title: 'Idempotent',
      occurredAt: '2026-08-17T08:00:00.000Z',
      idempotencyKey: 'persisted-create',
    }).id).toBe(persistedIdempotent.id);
    expect(() => second.getEntry(other, created.id)).toThrow(ArchiveAuthorizationError);
  });

  it('keeps search replaceable behind a provider seam', () => {
    const archive = repository();
    archive.createEntry(owner, {
      kind: 'LIFE',
      title: 'provider search',
      occurredAt: '2026-08-17T08:00:00.000Z',
    });
    const provider = new LocalSearchProvider(archive);
    expect(provider.search(owner, 'provider')).toHaveLength(1);
    expect(provider.search(other, 'provider')).toHaveLength(0);
  });

  it('keeps AI insights separate and tied to an immutable source revision', () => {
    const archive = repository();
    const entry = archive.createEntry(owner, {
      kind: 'LIFE',
      title: 'original',
      body: 'source body',
      occurredAt: '2026-08-17T08:00:00.000Z',
    });
    archive.updateEntry(owner, entry.id, { body: 'edited source body' });
    const insight = archive.createAiInsight(owner, {
      entryId: entry.id,
      sourceRevision: 1,
      provider: 'mock',
      model: 'archive-v1',
      insight: { summary: 'separate output' },
    });
    expect(insight.outputType).toBe('AI_GENERATED');
    expect(archive.getEntry(owner, entry.id).body).toBe('edited source body');
  });

  it('keeps an explicit published snapshot stable when its source is edited', () => {
    const archive = repository();
    const entry = archive.createEntry(owner, {
      kind: 'LIFE',
      title: 'publish source',
      body: 'original body',
      occurredAt: '2026-08-17T08:00:00.000Z',
    });
    const snapshot = archive.publishSnapshot(owner, entry.id, { title: 'selected original' });
    archive.updateEntry(owner, entry.id, { body: 'changed after publish' });
    expect(archive.listPublishedSnapshots(owner, entry.id)[0]).toMatchObject({
      id: snapshot.id,
      sourceRevision: 1,
      selectedContent: { title: 'selected original' },
      visibility: 'SNAPSHOT',
    });
  });

  it('keeps source, device, server receipt and timeline time semantics distinct', () => {
    const archive = repository();
    const entry = archive.createEntry(owner, {
      kind: 'LIFE',
      title: 'backfilled event',
      occurredAt: '2022-06-01T09:00:00.000+08:00',
      timezone: 'Asia/Taipei',
      recordSource: 'IMPORT',
      deviceId: 'device-a',
    });
    expect(entry).toMatchObject({
      recordSource: 'IMPORT',
      deviceId: 'device-a',
      timezone: 'Asia/Taipei',
      serverReceivedAt: '2026-08-17T12:00:00.000Z',
    });
    expect(archive.getTimeline(owner)[0]).toMatchObject({
      sourceId: entry.id,
      occurredAt: '2022-06-01T09:00:00.000+08:00',
      serverReceivedAt: '2026-08-17T12:00:00.000Z',
      timezone: 'Asia/Taipei',
    });
  });
});
