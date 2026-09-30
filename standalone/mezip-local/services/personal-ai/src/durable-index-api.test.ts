import { describe, expect, it, vi } from 'vitest';
import type { AuthenticatedPrincipal } from '@me-zip/shared-types';

import { DurablePersonalAIIndexApiAdapter } from './durable-index-api.js';
import type { DurablePersonalAIIndexService } from './durable-index-service.js';

const principal: AuthenticatedPrincipal = {
  userId: 'alice',
  sessionId: 'session-1',
  roles: [],
  issuedAt: '2026-08-18T00:00:00.000Z',
};

describe('DurablePersonalAIIndexApiAdapter', () => {
  it('passes only schema-approved input and the header idempotency key to the durable service', async () => {
    const createIndexJob = vi.fn().mockResolvedValue({
      applied: true,
      job: {
        id: 'job-1',
        scope: 'LIFE',
        dateRange: null,
        sourceTypes: ['LIFE'],
        status: 'PENDING',
        indexVersion: 'personal-ai-v1',
        indexedSourceCount: 0,
        indexedChunkCount: 0,
        failedSourceCount: 0,
        createdAt: '2026-08-18T00:00:00.000Z',
        startedAt: null,
        completedAt: null,
        errorCode: null,
      },
    });
    const service = { createIndexJob } as unknown as DurablePersonalAIIndexService;
    const adapter = new DurablePersonalAIIndexApiAdapter(service);

    const response = await adapter.handle({
      method: 'POST',
      path: '/v1/personal-ai/index-jobs',
      principal,
      headers: { 'idempotency-key': 'request-1234' },
      body: { scope: 'LIFE', sourceTypes: ['LIFE'] },
    });

    expect(response.status).toBe(201);
    expect(createIndexJob).toHaveBeenCalledWith(principal, {
      scope: 'LIFE',
      sourceTypes: ['LIFE'],
      idempotencyKey: 'request-1234',
    });
  });

  it('rejects owner/principal fields before reaching the durable service', async () => {
    const createIndexJob = vi.fn();
    const adapter = new DurablePersonalAIIndexApiAdapter({ createIndexJob } as unknown as DurablePersonalAIIndexService);

    const response = await adapter.handle({
      method: 'POST',
      path: '/v1/personal-ai/index-jobs',
      principal,
      body: { scope: 'LIFE', ownerId: 'bob' },
    });

    expect(response.status).toBe(400);
    expect(response.body.error?.code).toBe('VALIDATION');
    expect(createIndexJob).not.toHaveBeenCalled();
  });

  it('keeps status/list routes separate and returns a safe not-found envelope', async () => {
    const getIndexStatus = vi.fn().mockResolvedValue({
      enabled: true,
      status: 'READY',
      indexVersion: 'personal-ai-v1',
      indexedSourceCount: 1,
      indexedChunkCount: 1,
      lastIndexedAt: null,
      embeddingProvider: 'REVIEWED',
    });
    const listIndexJobs = vi.fn().mockResolvedValue({ items: [], nextCursor: null });
    const service = { getIndexStatus, listIndexJobs } as unknown as DurablePersonalAIIndexService;
    const adapter = new DurablePersonalAIIndexApiAdapter(service);

    const status = await adapter.handle({ method: 'GET', path: '/v1/personal-ai/index-status', principal });
    const list = await adapter.handle({ method: 'GET', path: '/v1/personal-ai/index-jobs', principal, query: { limit: 10 } });
    const missing = await adapter.handle({ method: 'GET', path: '/v1/personal-ai/preferences', principal });

    expect(status.status).toBe(200);
    expect(list.status).toBe(200);
    expect(getIndexStatus).toHaveBeenCalledWith(principal);
    expect(listIndexJobs).toHaveBeenCalledWith(principal, { limit: 10 });
    expect(missing.status).toBe(404);
    expect(missing.body.error?.message).not.toMatch(/sql|owner|principal/i);
  });
});
