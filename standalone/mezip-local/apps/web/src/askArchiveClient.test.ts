import { describe, expect, it } from 'vitest';

import {
  ApiAskArchiveClient,
  DevelopmentFixtureAskArchiveClient,
  createAskArchiveSdkFacade,
  createRuntimeAskArchiveClient,
  normalizeAskArchiveFilters,
  type AskArchiveSdkFacade,
} from './askArchiveClient.js';
import type { MeZipSdkTransport } from '@me-zip/sdk';
import type { ApiResponse } from '@me-zip/shared-types';

const meta = { requestId: 'ask-archive-web-test' } as const;

function facade(): AskArchiveSdkFacade {
  const privacy = {
    enabled: true,
    consentVersion: 'personal-ai-v1',
    consentAcceptedAt: '2026-08-18T00:00:00.000Z',
    indexedSources: [
      {
        sourceType: 'LIFE' as const,
        indexedCount: 1,
        status: 'READY' as const,
        lastIndexedAt: '2026-08-18T00:00:00.000Z',
      },
    ],
    indexedSourceCount: 1,
    lastIndexedAt: '2026-08-18T00:00:00.000Z',
    embeddingProviderLabel: 'server-managed',
    privateMessagesExcluded: true as const,
  };
  const index = {
    status: 'READY' as const,
    indexVersion: 'v1',
    queuedJobs: 0,
    failedJobs: 0,
    lastErrorMessage: null,
    updatedAt: '2026-08-18T00:00:00.000Z',
  };
  return {
    query: async () => ({
      data: {
        requestId: 'query-1',
        conversationId: 'conversation-1',
        answerText: '仅来自服务端授权档案。',
        evidenceKind: 'DIRECT_EVIDENCE' as const,
        citations: [
          {
            citationId: 'citation-1',
            sourceType: 'LIFE' as const,
            sourceId: 'life-1',
            revisionId: null,
            occurredAt: '2022-01-01T00:00:00.000Z',
            displayTitle: 'Life',
            excerptSafe: 'safe excerpt',
          },
        ],
        retrievalLatencyMs: 8,
        generatedAt: '2026-08-18T00:00:00.000Z',
        suggestedFollowUps: [],
      },
      meta,
    }),
    cancelQuery: async () => ({
      data: { requestId: 'query-1', cancelled: true },
      meta,
    }),
    createExport: async () => ({
      data: {
        job: {
          id: 'export-1',
          status: 'READY' as const,
          format: 'JSON' as const,
          schemaVersion: 'mezip.personal-ai.export.v1' as const,
          requestedSections: [
            'PREFERENCES',
            'CONSENT_HISTORY',
            'INDEX_MANIFEST',
            'INSIGHT_METADATA',
            'CITATION_REFERENCES',
          ] as const,
          includeConversations: false,
          includeDeletedInsights: false,
          requestedAt: '2026-08-18T00:00:00.000Z',
          startedAt: '2026-08-18T00:00:00.000Z',
          completedAt: '2026-08-18T00:00:00.000Z',
          expiresAt: null,
          errorCode: null,
        },
        result: {
          exportId: 'export-1',
          format: 'JSON' as const,
          schemaVersion: 'mezip.personal-ai.export.v1' as const,
          exportedAt: '2026-08-18T00:00:00.000Z',
          includedSections: [
            'PREFERENCES',
            'CONSENT_HISTORY',
            'INDEX_MANIFEST',
            'INSIGHT_METADATA',
            'CITATION_REFERENCES',
          ] as const,
          excludedDataCategories: [
            'ORIGINAL_ARCHIVE_CONTENT',
            'KNOWLEDGE_CHUNK_TEXT',
            'RAW_EMBEDDING_VECTORS',
            'QUERY_PROMPT_OR_QUESTION_TEXT',
            'QUERY_ANSWER_TEXT',
            'AI_INSIGHT_CONTENT',
            'CITATION_DISPLAY_TEXT',
            'PROVIDER_SECRETS',
          ] as const,
        },
      },
      meta,
    }),
    getExport: async () => ({
      data: {
        job: {
          id: 'export-1',
          status: 'READY' as const,
          format: 'JSON' as const,
          schemaVersion: 'mezip.personal-ai.export.v1' as const,
          requestedSections: [
            'PREFERENCES',
            'CONSENT_HISTORY',
            'INDEX_MANIFEST',
            'INSIGHT_METADATA',
            'CITATION_REFERENCES',
          ] as const,
          includeConversations: false,
          includeDeletedInsights: false,
          requestedAt: '2026-08-18T00:00:00.000Z',
          startedAt: '2026-08-18T00:00:00.000Z',
          completedAt: '2026-08-18T00:00:00.000Z',
          expiresAt: null,
          errorCode: null,
        },
        result: {
          exportId: 'export-1',
          format: 'JSON' as const,
          schemaVersion: 'mezip.personal-ai.export.v1' as const,
          exportedAt: '2026-08-18T00:00:00.000Z',
          includedSections: [
            'PREFERENCES',
            'CONSENT_HISTORY',
            'INDEX_MANIFEST',
            'INSIGHT_METADATA',
            'CITATION_REFERENCES',
          ] as const,
          excludedDataCategories: [
            'ORIGINAL_ARCHIVE_CONTENT',
            'KNOWLEDGE_CHUNK_TEXT',
            'RAW_EMBEDDING_VECTORS',
            'QUERY_PROMPT_OR_QUESTION_TEXT',
            'QUERY_ANSWER_TEXT',
            'AI_INSIGHT_CONTENT',
            'CITATION_DISPLAY_TEXT',
            'PROVIDER_SECRETS',
          ] as const,
        },
      },
      meta,
    }),
    listExports: async () => ({
      data: {
        items: [
          {
            id: 'export-1',
            status: 'READY' as const,
            format: 'JSON' as const,
            schemaVersion: 'mezip.personal-ai.export.v1' as const,
            requestedSections: [
              'PREFERENCES',
              'CONSENT_HISTORY',
              'INDEX_MANIFEST',
              'INSIGHT_METADATA',
              'CITATION_REFERENCES',
            ] as const,
            includeConversations: false,
            includeDeletedInsights: false,
            requestedAt: '2026-08-18T00:00:00.000Z',
            startedAt: '2026-08-18T00:00:00.000Z',
            completedAt: '2026-08-18T00:00:00.000Z',
            expiresAt: null,
            errorCode: null,
          },
        ],
        nextCursor: null,
      },
      meta,
    }),
    getPreferences: async () => ({ data: privacy, meta }),
    updatePreferences: async () => ({ data: privacy, meta }),
    getIndexStatus: async () => ({ data: index, meta }),
    rebuildIndex: async () => ({ data: index, meta }),
    clearIndex: async () => ({ data: { ...index, status: 'DELETED' as const }, meta }),
    deleteInsights: async () => ({ data: { deletedCount: 1 }, meta }),
    saveInsight: async () => ({ data: { id: 'insight-1' }, meta }),
    relatedMemories: async () => ({ data: [], meta }),
  };
}

describe('Ask My Archive web client boundary', () => {
  it('defaults to NONE and archive-only without accepting broad client context', () => {
    const filters = normalizeAskArchiveFilters({
      scope: 'not-a-scope' as never,
      mode: 'ARCHIVE_PLUS_GENERAL' as never,
    });
    expect(filters.scope).toBe('NONE');
    expect(filters.mode).toBe('ARCHIVE_ONLY');
    expect(filters.sourceTypes).toEqual([]);
  });

  it('fails closed in production without an explicitly configured HTTPS origin', async () => {
    const noConfig = createRuntimeAskArchiveClient({ production: true });
    const insecure = createRuntimeAskArchiveClient({
      production: true,
      apiBaseUrl: 'http://localhost:3000',
    });
    expect(noConfig.source).toBe('UNAVAILABLE');
    expect(insecure.source).toBe('UNAVAILABLE');
    expect(await noConfig.readSnapshot()).toMatchObject({
      ok: false,
      source: 'UNAVAILABLE',
    });
  });

  it('uses server projections, maps failures to reviewed copy, and keeps mode archive-only', async () => {
    const client = new ApiAskArchiveClient(facade());
    const result = await client.query({
      query: '我写过什么？',
      filters: normalizeAskArchiveFilters({ scope: 'LIFE' }),
      conversationId: null,
      idempotencyKey: 'query-1',
    });
    expect(result).toMatchObject({
      ok: true,
      source: 'SERVER',
      data: { evidenceKind: 'DIRECT_EVIDENCE' },
    });
    expect(JSON.stringify(result)).not.toMatch(
      /ownerId|userId|root|promptContext|embeddingVector|privateMessage/i,
    );
  });

  it('preserves the server conversation id and sends that id on a follow-up', async () => {
    const calls: Array<{ readonly conversationId: string | null }> = [];
    const base = facade();
    const tracked: AskArchiveSdkFacade = {
      ...base,
      query: async (input) => {
        calls.push({ conversationId: input.conversationId });
        return base.query(input);
      },
    };
    const client = new ApiAskArchiveClient(tracked);
    const filters = normalizeAskArchiveFilters({ scope: 'LIFE' });
    const first = await client.query({
      query: '第一问',
      filters,
      conversationId: null,
      idempotencyKey: 'conversation-first',
    });
    expect(first).toMatchObject({ ok: true, data: { conversationId: 'conversation-1' } });
    if (!first.ok) return;

    await client.query({
      query: '继续追问',
      filters,
      conversationId: first.data.conversationId,
      idempotencyKey: 'conversation-follow-up',
    });
    expect(calls).toEqual([
      { conversationId: null },
      { conversationId: 'conversation-1' },
    ]);
  });

  it('does not issue a request for invalid query or reversed date range', async () => {
    let calls = 0;
    const base = facade();
    const tracked: AskArchiveSdkFacade = {
      ...base,
      query: async (...args) => {
        calls += 1;
        return base.query(...args);
      },
    };
    const client = new ApiAskArchiveClient(tracked);
    const result = await client.query({
      query: '   ',
      filters: normalizeAskArchiveFilters({
        scope: 'DATE_RANGE',
        dateFrom: '2026-08-20',
        dateTo: '2026-08-01',
      }),
      conversationId: null,
      idempotencyKey: 'invalid',
    });
    expect(result).toMatchObject({ ok: false, error: { code: 'VALIDATION' } });
    expect(calls).toBe(0);
  });

  it('labels fixture output and returns explicit no-evidence state for synthetic unmatched query', async () => {
    const client = new DevelopmentFixtureAskArchiveClient();
    const result = await client.query({
      query: '我什么时候去东京？',
      filters: normalizeAskArchiveFilters({ scope: 'LIFE' }),
      conversationId: null,
      idempotencyKey: 'fixture-query',
    });
    expect(result).toMatchObject({
      ok: true,
      source: 'DEVELOPMENT_FIXTURE',
      data: { evidenceKind: 'NO_EVIDENCE', citations: [] },
    });
  });

  it('creates a metadata-only export without surfacing raw payload fields', async () => {
    const client = new ApiAskArchiveClient(facade());
    const created = await client.createExport();
    expect(created).toMatchObject({
      ok: true,
      source: 'SERVER',
      data: {
        job: { status: 'READY', includeConversations: false },
        result: { excludedDataCategories: expect.arrayContaining(['RAW_EMBEDDING_VECTORS']) },
      },
    });
    expect(JSON.stringify(created)).not.toMatch(
      /originalArchive|chunkText|rawEmbedding|queryPrompt|queryAnswer|providerSecret/i,
    );
  });

  it('maps the canonical Personal AI route body without owner, plan, Root, or raw archive fields', async () => {
    const requests: Array<Parameters<MeZipSdkTransport['request']>[0]> = [];
    const rawResult = {
      queryId: '123e4567-e89b-12d3-a456-426614174000',
      status: 'SUCCEEDED' as const,
      answerText: 'safe answer',
      answer: 'safe answer',
      archiveMode: 'ARCHIVE_ONLY' as const,
      scope: 'LIFE' as const,
      evidenceKind: 'DIRECT_EVIDENCE' as const,
      citations: [],
      retrievedChunkCount: 0,
      retrievalLatencyMs: 2,
      generationLatencyMs: null,
      usage: {
        modelCode: null,
        providerCode: null,
        inputTokens: 0,
        outputTokens: 0,
        totalTokens: 0,
        costFen: 0,
      },
      createdAt: '2026-08-18T00:00:00.000Z',
    };
    const transport: MeZipSdkTransport = {
      request: async <T>(
        input: Parameters<MeZipSdkTransport['request']>[0],
      ): Promise<ApiResponse<T>> => {
        requests.push(input);
        return { data: rawResult as T, meta };
      },
    };
    const client = new ApiAskArchiveClient(createAskArchiveSdkFacade(transport));
    await client.query({
      query: 'safe question',
      filters: normalizeAskArchiveFilters({ scope: 'LIFE' }),
      conversationId: null,
      idempotencyKey: 'query-route-1',
    });
    const body = requests[0]?.body;
    expect(requests[0]).toMatchObject({
      method: 'POST',
      path: '/v1/personal-ai/queries',
      idempotencyKey: 'query-route-1',
    });
    expect(body).toMatchObject({
      question: 'safe question',
      scope: 'LIFE',
      archiveMode: 'ARCHIVE_ONLY',
      searchMode: 'HYBRID',
    });
    expect(JSON.stringify(body)).not.toMatch(
      /owner|plan|root|privateMessage|promptContext|embeddingVector/i,
    );
  });
});
