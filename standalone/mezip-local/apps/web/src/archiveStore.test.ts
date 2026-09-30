import { describe, expect, it } from 'vitest';

import {
  ArchiveConflictError,
  ArchiveQuotaError,
  LocalArchiveAdapter,
  MemoryArchiveStorage,
} from './archiveStore.js';

function fixtureAdapter(options: { readonly online?: () => boolean } = {}) {
  const tick = Date.parse('2026-08-17T09:00:00.000Z');
  const adapterOptions = {
    ownerId: 'owner-a',
    storage: new MemoryArchiveStorage(),
    now: () => tick,
    idFactory: (_owner: string, value: number) => `record-${value}`,
    ...(options.online === undefined ? {} : { online: options.online }),
  };
  return new LocalArchiveAdapter(adapterOptions);
}

describe('LocalArchiveAdapter', () => {
  it('persists private records by owner and supports search/daily pack', () => {
    const storage = new MemoryArchiveStorage();
    let tick = Date.parse('2026-08-17T09:00:00.000Z');
    const first = new LocalArchiveAdapter({
      ownerId: 'owner-a',
      storage,
      now: () => tick,
      idFactory: (_owner: string, value: number) => `record-${value}`,
    });
    const record = first.create({
      kind: 'LIFE',
      title: '晨间散步',
      body: '沿河走了二十分钟。',
      tags: ['生活', '步行'],
    });
    expect(record.visibility).toBe('PRIVATE');
    expect(record.revision).toBe(1);
    expect(first.search('散步')).toHaveLength(1);
    expect(first.list({ query: '散步' })).toHaveLength(1);
    expect(first.dailyPack('2026-08-17').records[0]?.id).toBe(record.id);
    const firstPack = first.createDailyPack('2026-08-17');
    const secondPack = first.createDailyPack('2026-08-17');
    expect(firstPack?.id).toBe(secondPack?.id);
    expect(firstPack?.recordIds).toEqual([record.id]);
    expect(firstPack?.summary).toBe('今日归档报告 · 1 条来源 · 生活 1');

    tick += 60_000;
    const second = new LocalArchiveAdapter({
      ownerId: 'owner-a',
      storage,
      now: () => tick,
    });
    expect(second.get(record.id)?.title).toBe('晨间散步');
    expect(new LocalArchiveAdapter({ ownerId: 'owner-b', storage }).list()).toEqual([]);
  });

  it('switches the local development partition without exposing the prior owner records', () => {
    const storage = new MemoryArchiveStorage();
    const adapter = new LocalArchiveAdapter({ ownerId: 'owner-a', storage });
    adapter.create({ kind: 'LIFE', title: 'A only' });
    adapter.setOwner('owner-b');
    expect(adapter.list()).toEqual([]);
    adapter.setOwner('owner-a');
    expect(adapter.list().map((record) => record.title)).toEqual(['A only']);
  });

  it('supports low-friction body-only capture with a generated title', () => {
    const adapter = fixtureAdapter();
    const record = adapter.create({ kind: 'LIFE', body: '只写正文也可以保存。' });
    expect(record.title).toBe('生活记录');
    expect(record.body).toBe('只写正文也可以保存。');
  });

  it('enforces optimistic revisions and trash/restore/permanent delete', () => {
    const adapter = fixtureAdapter();
    const record = adapter.create({ kind: 'HISTORY', title: '丝路笔记' });
    const updated = adapter.update(record.id, { body: '读到新的史料。' }, 1);
    expect(updated.revision).toBe(2);
    expect(updated.version).toBe(2);
    expect(() => adapter.update(record.id, { body: '过期写入' }, 1)).toThrow(
      ArchiveConflictError,
    );
    const deleted = adapter.moveToTrash(record.id, updated.revision);
    expect(deleted.status).toBe('DELETED');
    expect(adapter.list()).toHaveLength(0);
    expect(adapter.list({ includeDeleted: true })).toHaveLength(1);
    const restored = adapter.restore(record.id, deleted.revision);
    expect(restored.status).toBe('ACTIVE');
    adapter.moveToTrash(record.id, restored.revision);
    adapter.permanentDelete(record.id);
    expect(adapter.list({ includeDeleted: true })).toHaveLength(0);
  });

  it('keeps occurred time separate from receipt time and exports a manifest contract', () => {
    const adapter = fixtureAdapter();
    const old = adapter.create({
      kind: 'LIFE',
      title: '历史发生时间',
      body: '这条记录发生在过去。',
      occurredAt: '2022-06-01T09:00:00+08:00',
    });
    expect(old.occurredAt).toBe('2022-06-01T01:00:00.000Z');
    const exported = JSON.parse(adapter.exportJson()) as {
      schema_version: string;
      exported_at: string;
      life: readonly { id: string }[];
      history: readonly unknown[];
      fitness: readonly unknown[];
      daily_pack: readonly unknown[];
      timeline_metadata: readonly { sourceId: string; occurredAt: string }[];
      media_policy: string;
      trash_policy: string;
    };
    expect(exported.schema_version).toBe('mezip.archive.export.v1');
    expect(exported.exported_at).toContain('2026-08-17');
    expect(exported.life.map((item) => item.id)).toContain(old.id);
    expect(exported.history).toEqual([]);
    expect(exported.fitness).toEqual([]);
    expect(exported.daily_pack).toEqual([]);
    expect(exported.timeline_metadata[0]).toMatchObject({
      sourceId: old.id,
      occurredAt: '2022-06-01T01:00:00.000Z',
    });
    expect(exported.media_policy).toBe('MANIFEST_ONLY');
    expect(exported.trash_policy).toBe('EXCLUDED_BY_DEFAULT');
  });

  it('orders archive lists by occurrence time rather than receipt time', () => {
    const adapter = fixtureAdapter();
    const old = adapter.create({ kind: 'LIFE', title: 'old event', occurredAt: '2022-06-01T09:00:00+08:00' });
    const recent = adapter.create({ kind: 'LIFE', title: 'recent event', occurredAt: '2026-08-17T08:00:00Z' });
    expect(adapter.list().map((record) => record.id)).toEqual([recent.id, old.id]);
  });

  it('stores drafts while offline and syncs them when online', () => {
    let online = false;
    const adapter = fixtureAdapter({ online: () => online });
    const draft = adapter.create({
      kind: 'FITNESS',
      title: '步数',
      metrics: { steps: 4200 },
    });
    expect(draft.syncState).toBe('DRAFT');
    expect(adapter.list()[0]?.syncState).toBe('DRAFT');
    online = true;
    adapter.setOnline(true);
    expect(adapter.syncDrafts()[0]?.syncState).toBe('SAVED');
  });

  it('retains an offline draft across adapter re-entry', () => {
    const online = false;
    const storage = new MemoryArchiveStorage();
    const first = new LocalArchiveAdapter({ ownerId: 'owner-a', storage, online: () => online });
    const draft = first.create({ kind: 'LIFE', body: 'draft retained after a failed request' });
    const second = new LocalArchiveAdapter({ ownerId: 'owner-a', storage, online: () => online });
    expect(second.get(draft.id)?.syncState).toBe('DRAFT');
    expect(second.get(draft.id)?.body).toBe('draft retained after a failed request');
  });

  it('tracks media metadata and rejects quota overflow', () => {
    const adapter = new LocalArchiveAdapter({
      ownerId: 'owner-a',
      storage: new MemoryArchiveStorage(),
      now: () => Date.parse('2026-08-17T09:00:00.000Z'),
      quotaBytes: 10,
    });
    const record = adapter.create({ kind: 'LIFE', title: '相片' });
    adapter.addMedia(record.id, {
      id: 'media-1',
      name: 'note.jpg',
      mimeType: 'image/jpeg',
      bytes: 8,
      width: 80,
      height: 60,
    });
    expect(adapter.quota()).toMatchObject({ usedBytes: 8, remainingBytes: 2 });
    expect(() =>
      adapter.addMedia(record.id, {
        id: 'media-2',
        name: 'too-big.mp4',
        mimeType: 'video/mp4',
        bytes: 3,
      }),
    ).toThrow(ArchiveQuotaError);
    expect(JSON.parse(adapter.exportJson()).records).toHaveLength(1);
  });

  it('replaces media metadata only through an explicit owner edit', () => {
    const adapter = new LocalArchiveAdapter({
      ownerId: 'owner-a',
      storage: new MemoryArchiveStorage(),
      now: () => Date.parse('2026-08-17T09:00:00.000Z'),
    });
    const record = adapter.create({
      kind: 'FITNESS',
      title: '训练照片',
      media: [{ id: 'before', name: 'before.jpg', mimeType: 'image/jpeg', bytes: 12 }],
    });
    const updated = adapter.update(
      record.id,
      { media: [{ id: 'after', name: 'after.jpg', mimeType: 'image/jpeg', bytes: 18 }] },
      record.revision,
    );
    expect(updated.media).toEqual([
      { id: 'after', name: 'after.jpg', mimeType: 'image/jpeg', bytes: 18 },
    ]);
    expect(adapter.get(record.id)?.media[0]?.id).toBe('after');
  });

  it('exposes owner-safe aggregate counts for Home, Cat and Town', () => {
    const adapter = fixtureAdapter();
    adapter.create({ kind: 'LIFE', title: 'private life', body: 'synthetic' });
    adapter.create({ kind: 'FITNESS', title: 'private fitness', body: 'synthetic' });
    expect(adapter.summary()).toMatchObject({
      total: 2,
      today: 2,
      byKind: { LIFE: 1, FITNESS: 1 },
      dailyPackReady: false,
    });
  });
});
