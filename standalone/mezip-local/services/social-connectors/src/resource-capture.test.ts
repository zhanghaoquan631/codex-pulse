import { describe, expect, it } from 'vitest';
import type { AuthenticatedPrincipal } from '@me-zip/shared-types';
import { XLocalCaptureApiAdapter } from './x-local-capture-api.js';
import { InMemoryXCapturePersistence, XLocalCaptureService } from './x-local-capture.js';

const owner: AuthenticatedPrincipal = { userId: 'resource-owner', sessionId: 'resource-session', roles: ['USER'], issuedAt: new Date(0).toISOString() };
const other: AuthenticatedPrincipal = { ...owner, userId: 'resource-other' };

describe('resource capture and private library', () => {
  it('persists web/article/code progress, actions, collection and private import', async () => {
    const adapter = new XLocalCaptureApiAdapter(new XLocalCaptureService(new InMemoryXCapturePersistence()));
    const collection = await adapter.handle({ method: 'POST', path: '/v1/x/local-capture/private-library/collections', principal: owner, body: { name: '以后研究' } });
    expect(collection.status).toBe(201);
    const collectionId = (collection.body.data as { collection: { id: string } }).collection.id;
    const created = await adapter.handle({ method: 'POST', path: '/v1/resources/records', principal: owner, body: { resourceType: 'ARTICLE', title: '设计文章', url: 'https://example.com/article', currentProgressPercent: 35, tags: ['设计'], liked: true } });
    expect(created.status).toBe(201);
    const record = (created.body.data as { record: { id: string; status: string; currentProgressPercent: number; liked: boolean } }).record;
    expect(record).toMatchObject({ status: 'IN_PROGRESS', currentProgressPercent: 35, liked: true });
    expect((created.body.data as { record: { platform: string; author: string | null; description: string | null } }).record).toMatchObject({ platform: 'example.com', author: null, description: null });
    const webpage = await adapter.handle({ method: 'POST', path: '/v1/resources/records', principal: owner, body: { resourceType: 'WEBPAGE', title: '产品主页', platform: 'Example', author: '产品团队', description: '产品介绍', url: 'https://example.com/product' } });
    expect((webpage.body.data as { record: { resourceType: string; platform: string; author: string; description: string } }).record).toMatchObject({ resourceType: 'WEBPAGE', platform: 'Example', author: '产品团队', description: '产品介绍' });
    const code = await adapter.handle({ method: 'POST', path: '/v1/resources/records', principal: owner, body: { resourceType: 'CODE', title: '请求工具', url: 'https://example.com/tool.ts', description: '可复用的 TypeScript 请求函数' } });
    expect((code.body.data as { record: { resourceType: string; status: string } }).record).toMatchObject({ resourceType: 'CODE', status: 'IN_PROGRESS' });
    const completed = await adapter.handle({ method: 'PATCH', path: `/v1/resources/records/${record.id}`, principal: owner, body: { currentProgressPercent: 100, bookmarked: true } });
    expect((completed.body.data as { record: { status: string; bookmarked: boolean } }).record).toMatchObject({ status: 'COMPLETED', bookmarked: true });
    const resumed = await adapter.handle({ method: 'PATCH', path: `/v1/resources/records/${record.id}`, principal: owner, body: { currentProgressPercent: 40 } });
    expect((resumed.body.data as { record: { status: string; currentProgressPercent: number } }).record).toMatchObject({ status: 'IN_PROGRESS', currentProgressPercent: 40 });
    const opened = await adapter.handle({ method: 'POST', path: `/v1/resources/records/${record.id}/open`, principal: owner, body: { idempotencyKey: 'read-once' } });
    expect((opened.body.data as { record: { openCount: number; lastOpenedAt: string | null }; session: { source: string }; deduplicated: boolean })).toMatchObject({ record: { openCount: 1 }, session: { source: 'MEZIP_READING_HISTORY' }, deduplicated: false });
    const repeatedOpen = await adapter.handle({ method: 'POST', path: `/v1/resources/records/${record.id}/open`, principal: owner, body: { idempotencyKey: 'read-once' } });
    expect((repeatedOpen.body.data as { record: { openCount: number }; deduplicated: boolean })).toMatchObject({ record: { openCount: 1 }, deduplicated: true });
    const detail = await adapter.handle({ method: 'GET', path: `/v1/resources/records/${record.id}`, principal: owner });
    expect((detail.body.data as { sessions: unknown[] }).sessions).toHaveLength(1);
    const searched = await adapter.handle({ method: 'GET', path: '/v1/resources/records', principal: owner, query: { query: '产品团队' } });
    expect((searched.body.data as { items: Array<{ id: string }> }).items.map((item) => item.id)).toContain((webpage.body.data as { record: { id: string } }).record.id);
    const imported = await adapter.handle({ method: 'POST', path: `/v1/resources/records/${record.id}/private-library`, principal: owner });
    expect((imported.body.data as { item: { sourceType: string; privacy: string } }).item).toMatchObject({ sourceType: 'ARTICLE', privacy: 'PRIVATE' });
    const patched = await adapter.handle({ method: 'PATCH', path: `/v1/x/local-capture/private-library/${(imported.body.data as { item: { id: string } }).item.id}`, principal: owner, body: { collectionId, note: '重新研究' } });
    expect(patched.status).toBe(200);
    expect((await adapter.handle({ method: 'GET', path: '/v1/x/local-capture/private-library/collections', principal: owner })).body.data).toMatchObject({ items: [expect.objectContaining({ name: '以后研究' })] });
  });

  it('keeps resource records, collections and private items owner-scoped', async () => {
    const adapter = new XLocalCaptureApiAdapter(new XLocalCaptureService(new InMemoryXCapturePersistence()));
    const created = await adapter.handle({ method: 'POST', path: '/v1/resources/records', principal: owner, body: { resourceType: 'CODE', title: '工具函数', url: 'https://example.com/code', currentProgressPercent: 10 } });
    const id = (created.body.data as { record: { id: string } }).record.id;
    const hidden = await adapter.handle({ method: 'GET', path: '/v1/resources/records', principal: other });
    expect((hidden.body.data as { items: unknown[] }).items).toHaveLength(0);
    const denied = await adapter.handle({ method: 'GET', path: `/v1/resources/records/${id}`, principal: other });
    expect(denied.status).toBe(404);
    const deniedImport = await adapter.handle({ method: 'POST', path: `/v1/resources/records/${id}/private-library`, principal: other });
    expect(deniedImport.status).toBe(404);
  });
});
