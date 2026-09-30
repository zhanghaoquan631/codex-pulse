import { describe, expect, it } from 'vitest';

import type { AuthenticatedPrincipal } from '@me-zip/shared-types';

import { ArchiveApiAdapter } from './api.js';
import { ArchiveAuthorizationError, InMemoryArchiveRepository } from './index.js';
import { LocalDevelopmentStorage } from './storage.js';

const principal: AuthenticatedPrincipal = {
  userId: 'owner-api',
  sessionId: 'session-api',
  roles: ['USER'],
  issuedAt: '2026-08-17T00:00:00.000Z',
};

describe('ArchiveApiAdapter', () => {
  it('maps owner-scoped life routes and returns conflict errors', () => {
    let id = 0;
    const adapter = new ArchiveApiAdapter(
      new InMemoryArchiveRepository({
        runtime: { id: () => `id-${++id}`, now: () => '2026-08-17T12:00:00.000Z' },
      }),
    );
    const created = adapter.handle({
      method: 'POST',
      path: '/v1/archive/life',
      principal,
      body: {
        kind: 'LIFE',
        title: 'API record',
        body: 'private',
        occurredAt: '2026-08-17T08:00:00.000Z',
      },
      idempotencyKey: 'api-create-1',
    });
    expect(created.status).toBe(201);
    const idValue = (created.body.data as { id: string }).id;
    const conflict = adapter.handle({
      method: 'PATCH',
      path: `/v1/archive/life/${idValue}`,
      principal,
      body: { body: 'stale', expectedRevision: 0 },
    });
    expect(conflict.status).toBe(409);
    const listed = adapter.handle({
      method: 'GET',
      path: '/v1/archive/life',
      principal,
    });
    expect(listed.status).toBe(200);
    expect(listed.body.data as readonly unknown[]).toHaveLength(1);
  });

  it('does not turn a foreign id into a readable response', () => {
    const repository = new InMemoryArchiveRepository();
    const adapter = new ArchiveApiAdapter(repository);
    const foreign: AuthenticatedPrincipal = { ...principal, userId: 'other-api' };
    const entry = repository.createEntry(principal, {
      kind: 'LIFE',
      title: 'private',
      occurredAt: '2026-08-17T08:00:00.000Z',
    });
    expect(
      adapter.handle({
        method: 'GET',
        path: `/v1/archive/life/${entry.id}`,
        principal: foreign,
      }).status,
    ).toBe(403);
    expect(() => repository.getEntry(foreign, entry.id)).toThrow(
      ArchiveAuthorizationError,
    );
  });

  it('keeps published snapshots and AI insights on explicit append-only routes', () => {
    const repository = new InMemoryArchiveRepository({
      runtime: {
        id: (() => {
          let value = 0;
          return () => `route-${++value}`;
        })(),
        now: () => '2026-08-17T12:00:00.000Z',
      },
    });
    const adapter = new ArchiveApiAdapter(repository);
    const created = adapter.handle({
      method: 'POST',
      path: '/v1/archive/life',
      principal,
      body: {
        kind: 'LIFE',
        title: 'publish me',
        occurredAt: '2026-08-17T08:00:00.000Z',
      },
    });
    const id = (created.body.data as { id: string }).id;
    const published = adapter.handle({
      method: 'POST',
      path: `/v1/archive/life/${id}/publish`,
      principal,
      body: { selectedContent: { title: 'public snapshot' } },
    });
    expect(published.status).toBe(201);
    expect((published.body.data as { sourceRevision: number }).sourceRevision).toBe(1);
    const insight = adapter.handle({
      method: 'POST',
      path: `/v1/archive/life/${id}/ai-insights`,
      principal,
      body: {
        sourceRevision: 1,
        provider: 'mock',
        model: 'archive-v1',
        insight: { summary: 'kept separate' },
      },
    });
    expect(insight.status).toBe(201);
    const listed = adapter.handle({
      method: 'GET',
      path: `/v1/archive/life/${id}/ai-insights`,
      principal,
    });
    expect(listed.body.data as readonly unknown[]).toHaveLength(1);
  });

  it('exposes metadata-only media, quota and body-metric routes with owner scope', () => {
    const repository = new InMemoryArchiveRepository({ quotaBytes: 100 });
    const adapter = new ArchiveApiAdapter(repository);
    const metric = adapter.handle({
      method: 'POST',
      path: '/v1/archive/body-metrics',
      principal,
      body: { measuredAt: '2026-08-17T08:00:00.000Z', weightGrams: 70000 },
      idempotencyKey: 'metric-route-1',
    });
    expect(metric.status).toBe(201);
    const media = adapter.handle({
      method: 'POST',
      path: '/v1/media',
      principal,
      body: {
        storageKey: 'private/test.jpg',
        contentType: 'image/jpeg',
        bytes: 40,
      },
      idempotencyKey: 'media-route-1',
    });
    expect(media.status).toBe(201);
    const mediaId = (media.body.data as { id: string }).id;
    expect(
      adapter.handle({ method: 'GET', path: `/v1/media/${mediaId}`, principal }).status,
    ).toBe(200);
    const quota = adapter.handle({
      method: 'GET',
      path: '/v1/media/quota',
      principal,
    });
    expect(quota.status).toBe(200);
    expect((quota.body.data as { usedBytes: number }).usedBytes).toBe(40);
  });

  it('allows encrypted WeChat Sport import but rejects a client-forged WECHAT source', () => {
    const repository = new InMemoryArchiveRepository({
      weChatSportVerifier: {
        verify() {
          return [{ day: '2026-08-17T00:00:00.000Z', steps: 7_654 }];
        },
      },
    });
    const adapter = new ArchiveApiAdapter(repository);
    const imported = adapter.handle({
      method: 'POST',
      path: '/v1/archive/steps/wechat/import',
      principal,
      body: { encryptedData: 'ciphertext', iv: 'initialization-vector' },
      idempotencyKey: 'wechat-api-1',
    });
    expect(imported.status).toBe(201);
    expect(imported.body.data).toEqual([expect.objectContaining({ source: 'WECHAT', steps: 7_654 })]);
    const forged = adapter.handle({
      method: 'POST',
      path: '/v1/archive/steps',
      principal,
      body: { day: '2026-08-17T00:00:00.000Z', steps: 99_999, source: 'WECHAT' },
    });
    expect(forged.status).toBe(403);
  });

  it('issues a signed media download only after owner and scan-state checks', () => {
    const repository = new InMemoryArchiveRepository();
    const storage = new LocalDevelopmentStorage({ now: () => '2026-08-17T12:00:00.000Z' });
    storage.put({ key: 'private/api-ready.jpg', contentType: 'image/jpeg', bytes: new Uint8Array([1]) });
    const adapter = new ArchiveApiAdapter(repository, storage);
    const media = repository.registerMedia(principal, {
      storageKey: 'private/api-ready.jpg',
      contentType: 'image/jpeg',
      bytes: 1,
    });
    repository.updateMedia(principal, media.id, { status: 'READY' });
    const delivered = adapter.handle({
      method: 'GET',
      path: `/v1/media/${media.id}/download`,
      principal,
    });
    expect(delivered.status).toBe(200);
    expect(delivered.body.data).toMatchObject({ mediaId: media.id, contentType: 'image/jpeg' });
    expect((delivered.body.data as { url: string }).url).toContain('expires=');
    const foreign: AuthenticatedPrincipal = { ...principal, userId: 'other-api' };
    expect(adapter.handle({
      method: 'GET',
      path: `/v1/media/${media.id}/download`,
      principal: foreign,
    }).status).toBe(403);
  });
});
