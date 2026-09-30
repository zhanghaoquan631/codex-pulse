import { describe, expect, it } from 'vitest';
import type { AuthenticatedPrincipal } from '@me-zip/shared-types';

import { PersonalAIApiAdapter } from './api.js';
import { InMemoryPersonalAISourceReader, PersonalAIService } from './personal-ai.js';

const principal: AuthenticatedPrincipal = { userId: 'alice', sessionId: 's', roles: [], issuedAt: '2026-08-18T00:00:00.000Z' };
const idempotency = { 'idempotency-key': 'api-query-1' };

function setup() {
  const reader = new InMemoryPersonalAISourceReader();
  reader.addArchive({
    ownerId: principal.userId,
    sourceType: 'LIFE',
    sourceId: '11111111-1111-4111-8111-111111111111',
    truthLayer: 'ORIGINAL',
    occurredAt: '2026-08-18T00:00:00.000Z',
    createdAt: '2026-08-18T00:00:00.000Z',
    updatedAt: '2026-08-18T00:00:00.000Z',
    title: '测试记录',
    text: '这是我的测试档案。',
  });
  const service = new PersonalAIService({ archiveReader: reader, usageReader: { read: () => [] } });
  const api = new PersonalAIApiAdapter(service);
  return { service, api };
}

describe('PersonalAIApiAdapter', () => {
  it('rejects owner/root request fields at the strict boundary', () => {
    const { api } = setup();
    const response = api.handle({
      method: 'POST',
      path: '/v1/personal-ai/queries',
      principal,
      headers: idempotency,
      body: { question: 'test', scope: 'NONE', ownerId: 'bob' },
    });
    expect(response.status).toBe(400);
  });

  it('supports consent, explicit indexing, query, citation and deletion routes', () => {
    const { api } = setup();
    expect(api.handle({ method: 'GET', path: '/v1/personal-ai/privacy', principal }).status).toBe(200);
    expect(api.handle({ method: 'PUT', path: '/v1/personal-ai/consent', principal, body: { version: 'v1' } }).status).toBe(200);
    expect(api.handle({ method: 'PATCH', path: '/v1/personal-ai/preferences', principal, body: { enabled: true } }).status).toBe(200);
    const indexed = api.handle({ method: 'POST', path: '/v1/personal-ai/index-jobs', principal, body: { scope: 'LIFE', sourceTypes: ['LIFE'] } });
    expect(indexed.status).toBe(201);
    const result = api.handle({ method: 'POST', path: '/v1/personal-ai/queries', principal, headers: idempotency, body: { question: '测试档案', scope: 'LIFE', sourceTypes: ['LIFE'], searchMode: 'KEYWORD', archiveMode: 'ARCHIVE_ONLY' } });
    expect(result.status).toBe(201);
    const queryId = (result.body.data as { queryId: string }).queryId;
    const citations = api.handle({ method: 'GET', path: `/v1/personal-ai/queries/${queryId}/citations`, principal });
    expect(citations.status).toBe(200);
    expect(api.handle({ method: 'POST', path: `/v1/personal-ai/queries/${queryId}/insight`, principal, body: { title: '保存' } }).status).toBe(200);
    expect(api.handle({ method: 'DELETE', path: '/v1/personal-ai/insights', principal, body: {} }).status).toBe(200);
  });

  it('does not expose another owner through API resource paths', () => {
    const { api } = setup();
    const response = api.handle({ method: 'GET', path: '/v1/personal-ai/queries/not-owned', principal: { ...principal, userId: 'bob' } });
    expect(response.status).toBe(404);
  });

  it('exposes only strict self-owned metadata export routes', () => {
    const { api } = setup();
    const invalid = api.handle({ method: 'POST', path: '/v1/personal-ai/exports', principal, body: { ownerId: 'bob', includeConversations: true } });
    expect(invalid.status).toBe(400);
    const created = api.handle({ method: 'POST', path: '/v1/personal-ai/exports', principal, body: { includeConversations: true } });
    expect(created.status).toBe(201);
    const exportId = ((created.body.data as { job: { id: string } }).job.id);
    expect(api.handle({ method: 'GET', path: `/v1/personal-ai/exports/${exportId}`, principal }).status).toBe(200);
    expect(api.handle({ method: 'GET', path: `/v1/personal-ai/exports/${exportId}`, principal: { ...principal, userId: 'bob' } }).status).toBe(404);
  });
});
