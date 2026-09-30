import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';

import { describe, expect, it } from 'vitest';
import type { AuthenticatedPrincipal } from '@me-zip/shared-types';

import {
  DeterministicPersonalAIEmbeddingProvider,
  DeterministicPersonalAIGenerationGateway,
  createPersonalAIArchiveLifecycleSink,
  InMemoryPersonalAIVectorSearchProvider,
  InMemoryPersonalAISourceReader,
  PersonalAIError,
  PersonalAIService,
  type PersonalAIArchiveRecord,
  type PersonalAIEmbeddingProvider,
  type PersonalAIVectorSearchProvider,
} from './index.js';

const alice: AuthenticatedPrincipal = { userId: 'alice', sessionId: 'alice-session', roles: [], issuedAt: '2026-08-18T00:00:00.000Z' };
const bob: AuthenticatedPrincipal = { userId: 'bob', sessionId: 'bob-session', roles: [], issuedAt: '2026-08-18T00:00:00.000Z' };
const entryId = '11111111-1111-4111-8111-111111111111';
const historyId = '22222222-2222-4222-8222-222222222222';
const dailyPackId = '33333333-3333-4333-8333-333333333333';

function record(overrides: Partial<PersonalAIArchiveRecord> = {}): PersonalAIArchiveRecord {
  return {
    ownerId: 'alice',
    sourceType: 'LIFE',
    sourceId: entryId,
    canonicalSourceId: entryId,
    truthLayer: 'ORIGINAL',
    revisionId: null,
    occurredAt: '2026-08-17T10:00:00.000Z',
    createdAt: '2026-08-17T10:00:00.000Z',
    updatedAt: '2026-08-17T10:00:00.000Z',
    title: '开心的旅行',
    text: '今天去了杭州旅行，西湖的风让我很开心。',
    tags: ['旅行', '开心'],
    ...overrides,
  };
}

function setup() {
  const reader = new InMemoryPersonalAISourceReader();
  reader.addArchive(record());
  reader.addArchive(record({ sourceType: 'HISTORY', sourceId: historyId, canonicalSourceId: historyId, truthLayer: 'ORIGINAL', title: '北宋人物', text: '我读了王安石的改革与北宋历史。' }));
  reader.addArchive(record({ sourceType: 'TIMELINE', sourceId: '44444444-4444-4444-8444-444444444444', canonicalSourceId: entryId, title: 'Timeline pointer', text: '旅行 pointer' }));
  reader.addArchive(record({ sourceType: 'DAILY_PACK', sourceId: dailyPackId, canonicalSourceId: dailyPackId, title: 'Daily summary', text: '杭州旅行让我开心。', relatedSourceIds: [entryId] }));
  reader.addArchive(record({ ownerId: 'bob', sourceId: '55555555-5555-4555-8555-555555555555', title: 'Bob secret', text: 'Bob private text' }));
  const service = new PersonalAIService({ archiveReader: reader, usageReader: { read: () => [] }, runtime: { now: () => '2026-08-18T00:00:00.000Z', id: (() => { let n = 0; return () => `00000000-0000-4000-8000-${String(++n).padStart(12, '0')}`; })() } });
  service.acceptConsent(alice, 'personal-ai.v1');
  service.updatePreferences(alice, { enabled: true });
  return { service, reader };
}

describe('PersonalAIService', () => {
  it('keeps the additive schema owner-isolated and excludes private messages', async () => {
    const migration = await readFile(fileURLToPath(new URL('../../../infrastructure/database/010_phase9_personal_ai_rag.sql', import.meta.url)), 'utf8');
    const hardening = await readFile(fileURLToPath(new URL('../../../infrastructure/database/011_phase9_personal_ai_persistence_hardening.sql', import.meta.url)), 'utf8');
    expect(migration).toContain('personal_knowledge_sources');
    expect(migration).toContain('personal_knowledge_embeddings');
    expect(migration).toContain('FORCE ROW LEVEL SECURITY');
    expect(migration).toContain('FOREIGN KEY (owner_user_id, source_id)');
    expect(migration).toContain('FOREIGN KEY (owner_user_id, chunk_id)');
    expect(migration).toContain('FOREIGN KEY (owner_user_id, conversation_id)');
    expect(migration).toContain('FOREIGN KEY (owner_user_id, query_id)');
    expect(migration).not.toContain('PRIVATE_MESSAGES');
    expect(migration).not.toContain('CREATE POLICY');
    const sourceTable = migration.slice(migration.indexOf('CREATE TABLE IF NOT EXISTS personal_knowledge_sources'), migration.indexOf('CREATE TABLE IF NOT EXISTS personal_knowledge_chunks'));
    expect(sourceTable).not.toContain("'AI_INSIGHT'");
    expect(hardening).toContain('personal_ai_index_outbox');
    expect(hardening).toContain('personal_ai_consent_events');
    expect(hardening).toContain('personal_ai_export_jobs');
    expect(hardening).toContain('selected_entry_ids');
    expect(hardening).toContain('lease_token');
    expect(hardening).toContain('content_hash');
    expect(hardening).toContain('FORCE ROW LEVEL SECURITY');
    expect(hardening).toContain('personal_ai_index_outbox_job_owner_fk');
    expect(hardening).toContain('REFERENCES personal_index_jobs (owner_user_id, id)');
    expect(hardening).not.toContain('PRIVATE_MESSAGES');
    const { service } = setup();
    const sources = service.listSources(alice, { principal: alice, scope: 'USER_SELECTED_ARCHIVE' });
    expect(sources.every((source) => source.sourceType !== ('PRIVATE_MESSAGES' as never))).toBe(true);
    service.acceptConsent(bob, 'personal-ai.v1');
    service.updatePreferences(bob, { enabled: true });
    expect(() => service.listSources(bob, { principal: bob, scope: 'USER_SELECTED_ARCHIVE' })).not.toThrow();
    expect(service.listSources(bob, { principal: bob, scope: 'USER_SELECTED_ARCHIVE' })).toHaveLength(1);
    expect(service.listSources(bob, { principal: bob, scope: 'USER_SELECTED_ARCHIVE' })[0]?.title).toBe('Bob secret');
  });

  it('requires consent, defaults to NONE, and indexes only explicit scope', () => {
    const reader = new InMemoryPersonalAISourceReader();
    reader.addArchive(record());
    const service = new PersonalAIService({ archiveReader: reader, usageReader: { read: () => [] } });
    expect(service.getPreferences(alice).defaultScope).toBe('NONE');
    expect(() => service.updatePreferences(alice, { enabled: true })).toThrowError(PersonalAIError);
    service.acceptConsent(alice, 'v1');
    service.updatePreferences(alice, { enabled: true });
    const job = service.createIndexJob(alice, { principal: alice, scope: 'LIFE', sourceTypes: ['LIFE'] });
    expect(job.status).toBe('READY');
    expect(job.indexedChunkCount).toBeGreaterThan(0);
  });

  it('fails closed for source metadata while consent is absent or Personal AI is off', () => {
    const reader = new InMemoryPersonalAISourceReader();
    reader.addArchive(record());
    const service = new PersonalAIService({ archiveReader: reader, usageReader: { read: () => [] } });
    const input = { principal: alice, scope: 'LIFE' as const };
    expect(() => service.listSources(alice, input)).toThrowError(PersonalAIError);
    service.acceptConsent(alice, 'v1');
    service.updatePreferences(alice, { enabled: true });
    expect(service.listSources(alice, input)).toHaveLength(1);
    service.updatePreferences(alice, { enabled: false });
    expect(() => service.listSources(alice, input)).toThrowError(PersonalAIError);
  });

  it('performs keyword/hybrid retrieval with citations and self-only results', () => {
    const { service } = setup();
    service.createIndexJob(alice, { principal: alice, scope: 'USER_SELECTED_ARCHIVE' });
    const result = service.query(alice, { question: '我哪次旅行很开心', scope: 'LIFE', sourceTypes: ['LIFE'], searchMode: 'KEYWORD', archiveMode: 'ARCHIVE_ONLY' }, 'query-0001');
    expect(result.status).toBe('SUCCEEDED');
    expect(result.citations[0]?.sourceId).toBe(entryId);
    expect(result.citations[0]?.truthLayer).toBe('ORIGINAL');
    expect(() => service.getQuery(bob, result.queryId)).toThrowError(PersonalAIError);
  });

  it('deduplicates timeline and Daily Pack pointers and propagates deletion to citations', () => {
    const { service } = setup();
    service.createIndexJob(alice, { principal: alice, scope: 'USER_SELECTED_ARCHIVE' });
    const result = service.query(alice, { question: '杭州旅行', scope: 'USER_SELECTED_ARCHIVE', searchMode: 'KEYWORD', archiveMode: 'ARCHIVE_ONLY' }, 'query-0002');
    const sourceIds = new Set(result.citations.map((citation) => citation.sourceId));
    expect(sourceIds.has(entryId)).toBe(true);
    expect(sourceIds.has(dailyPackId)).toBe(false);
    service.invalidateSource(alice, { sourceType: 'LIFE', sourceId: entryId });
    expect(service.listCitations(alice, result.queryId).items.some((item) => item.sourceId === entryId)).toBe(false);
    expect(service.getQuery(alice, result.queryId).citations.some((item) => item.sourceId === entryId)).toBe(false);
  });

  it('keeps revisions separate in truth model while indexing latest revision by default', () => {
    const { service, reader } = setup();
    reader.addArchive(record({ truthLayer: 'REVISION', revisionId: '66666666-6666-4666-8666-666666666666', revisionNumber: 2, updatedAt: '2026-08-18T01:00:00.000Z', text: '后来补充：西湖旅行让我更开心。' }));
    service.createIndexJob(alice, { principal: alice, scope: 'LIFE' });
    const result = service.query(alice, { question: '西湖旅行', scope: 'LIFE', sourceTypes: ['LIFE'], searchMode: 'KEYWORD' }, 'query-0003');
    expect(result.citations.some((citation) => citation.truthLayer === 'REVISION')).toBe(true);
    expect(result.citations.some((citation) => citation.truthLayer === 'ORIGINAL')).toBe(false);
  });

  it('never indexes generated AI Insight records as archive truth', () => {
    const { service, reader } = setup();
    const insightSourceId = '77777777-7777-4777-8777-777777777777';
    reader.addArchive(record({
      sourceId: insightSourceId,
      canonicalSourceId: insightSourceId,
      truthLayer: 'AI_INSIGHT',
      title: '模型生成摘要',
      text: 'only-generated-insight-token',
    }));
    service.createIndexJob(alice, { principal: alice, scope: 'LIFE' });
    expect(service.listSources(alice, { principal: alice, scope: 'LIFE' }).some((source) => source.sourceId === insightSourceId)).toBe(false);
    const result = service.query(alice, { question: 'only-generated-insight-token', scope: 'LIFE', searchMode: 'KEYWORD', archiveMode: 'ARCHIVE_ONLY' }, 'insight-0001');
    expect(result.status).toBe('NO_EVIDENCE');
    expect(result.citations).toEqual([]);
  });

  it('purges derived chunks when a source is reindexed as trashed or deleted', () => {
    const { service, reader } = setup();
    service.createIndexJob(alice, { principal: alice, scope: 'LIFE' });
    expect(service.getIndexStatus(alice).indexedChunkCount).toBeGreaterThan(0);
    reader.addArchive(record({ status: 'TRASHED', updatedAt: '2026-08-18T03:00:00.000Z' }));
    const job = service.createIndexJob(alice, { principal: alice, scope: 'LIFE' });
    expect(job.indexedChunkCount).toBe(0);
    expect(service.getIndexStatus(alice).indexedChunkCount).toBe(0);
    const result = service.query(alice, { question: '杭州旅行', scope: 'LIFE', searchMode: 'KEYWORD', archiveMode: 'ARCHIVE_ONLY' }, 'trash-0001');
    expect(result.status).toBe('NO_EVIDENCE');
  });

  it('returns owner-scoped semantic neighbors rather than the selected source itself', () => {
    const { service } = setup();
    service.createIndexJob(alice, { principal: alice, scope: 'USER_SELECTED_ARCHIVE' });
    const related = service.relatedMemories(alice, { sourceType: 'LIFE', sourceId: entryId, limit: 5 });
    expect(related.items.every((item) => item.sourceId !== entryId)).toBe(true);
    expect(related.items.every((item) => item.sourceId !== dailyPackId)).toBe(true);
  });

  it('does not use a revoked source as a related-memory semantic seed', () => {
    const { service, reader } = setup();
    service.createIndexJob(alice, { principal: alice, scope: 'USER_SELECTED_ARCHIVE' });
    reader.remove({ ownerId: 'alice', sourceId: entryId });
    expect(service.relatedMemories(alice, { sourceType: 'LIFE', sourceId: entryId }).items).toEqual([]);
  });

  it('rejects caller-supplied principal changes and rechecks consent/enabled state for workers', () => {
    const reader = new InMemoryPersonalAISourceReader();
    reader.addArchive(record());
    const service = new PersonalAIService({ archiveReader: reader, usageReader: { read: () => [] }, autoProcessIndexJobs: false });
    service.acceptConsent(alice, 'v1');
    service.updatePreferences(alice, { enabled: true });
    expect(() => service.createIndexJob(alice, { principal: bob, scope: 'LIFE' })).toThrowError(PersonalAIError);
    const job = service.createIndexJob(alice, { principal: alice, scope: 'LIFE' });
    service.updatePreferences(alice, { enabled: false });
    expect(() => service.processIndexJob(alice, job.id)).toThrowError(PersonalAIError);
  });

  it('bounds index idempotency/rate and query idempotency keys', () => {
    const reader = new InMemoryPersonalAISourceReader();
    reader.addArchive(record());
    const service = new PersonalAIService({ archiveReader: reader, usageReader: { read: () => [] }, autoProcessIndexJobs: false, maxIndexJobsPerHour: 1 });
    service.acceptConsent(alice, 'v1');
    service.updatePreferences(alice, { enabled: true });
    const first = service.createIndexJob(alice, { principal: alice, scope: 'LIFE', idempotencyKey: 'index-0001' });
    expect(service.createIndexJob(alice, { principal: alice, scope: 'LIFE', idempotencyKey: 'index-0001' }).id).toBe(first.id);
    expect(() => service.createIndexJob(alice, { principal: alice, scope: 'LIFE', idempotencyKey: 'index-0002' })).toThrowError(PersonalAIError);
    service.processIndexJob(alice, first.id);
    expect(() => service.query(alice, { question: '旅行', scope: 'LIFE', searchMode: 'KEYWORD' }, 'short')).toThrowError(PersonalAIError);
  });

  it('reuses unchanged content hashes without re-embedding', () => {
    const reader = new InMemoryPersonalAISourceReader();
    reader.addArchive(record());
    let embeddings = 0;
    const embeddingProvider: PersonalAIEmbeddingProvider = {
      name: 'COUNTING_TEST',
      embed(input) {
        embeddings += 1;
        return new DeterministicPersonalAIEmbeddingProvider().embed(input);
      },
    };
    const service = new PersonalAIService({ archiveReader: reader, usageReader: { read: () => [] }, embeddingProvider, autoProcessIndexJobs: false });
    service.acceptConsent(alice, 'v1');
    service.updatePreferences(alice, { enabled: true });
    const first = service.createIndexJob(alice, { principal: alice, scope: 'LIFE' });
    service.processIndexJob(alice, first.id);
    const afterFirst = embeddings;
    const second = service.createIndexJob(alice, { principal: alice, scope: 'LIFE' });
    const secondResult = service.processIndexJob(alice, second.id);
    expect(embeddings).toBe(afterFirst);
    expect(secondResult.indexedChunkCount).toBe(0);
  });

  it('isolates retrieval to the active index version during a model migration', () => {
    const reader = new InMemoryPersonalAISourceReader();
    reader.addArchive(record());
    let observedIndexVersions: readonly string[] | undefined;
    const vectorProvider: PersonalAIVectorSearchProvider = {
      upsert: () => undefined,
      search: (input) => {
        observedIndexVersions = input.filter?.indexVersions;
        return [];
      },
      deleteSource: () => undefined,
      deleteOwner: () => undefined,
    };
    const service = new PersonalAIService({ archiveReader: reader, usageReader: { read: () => [] }, vectorProvider, indexVersion: 'personal-ai-v2' });
    service.acceptConsent(alice, 'v1');
    service.updatePreferences(alice, { enabled: true });
    service.createIndexJob(alice, { principal: alice, scope: 'LIFE' });
    service.query(alice, { question: '杭州旅行', scope: 'LIFE', searchMode: 'SEMANTIC' }, 'version-0001');
    expect(observedIndexVersions).toEqual(['personal-ai-v2']);
  });

  it('indexes structured AI usage, fitness, and steps metadata as searchable text', () => {
    const reader = new InMemoryPersonalAISourceReader();
    reader.addArchive(record({ sourceType: 'FITNESS', sourceId: 'fitness-0001', canonicalSourceId: 'fitness-0001', title: '晨跑', text: null, metadata: { durationMinutes: 45, trainingType: 'RUNNING' } }));
    reader.addArchive(record({ sourceType: 'STEPS', sourceId: 'steps-0001', canonicalSourceId: 'steps-0001', title: '步数', text: null, metadata: { steps: 12345, day: '2026-08-17' } }));
    reader.addUsage({ ownerId: 'alice', sourceType: 'AI_USAGE', sourceId: 'usage-0001', truthLayer: 'ORIGINAL', occurredAt: '2026-08-17T12:00:00.000Z', createdAt: '2026-08-17T12:00:00.000Z', updatedAt: '2026-08-17T12:00:00.000Z', title: 'AI 使用汇总', text: null, metadata: { inputTokens: 1200, outputTokens: 300, model: 'gpt-test' } });
    const service = new PersonalAIService({ archiveReader: reader, usageReader: { read: (input) => reader.readUsage(input) } });
    service.acceptConsent(alice, 'v1');
    service.updatePreferences(alice, { enabled: true });
    service.createIndexJob(alice, { principal: alice, scope: 'USER_SELECTED_ARCHIVE' });
    const usage = service.query(alice, { question: 'inputTokens', scope: 'AI_USAGE', searchMode: 'KEYWORD' }, 'usage-0001');
    expect(usage.citations.some((citation) => citation.sourceType === 'AI_USAGE')).toBe(true);
    const fitness = service.query(alice, { question: 'durationMinutes', scope: 'FITNESS', searchMode: 'KEYWORD' }, 'fitness-0001');
    expect(fitness.citations.some((citation) => citation.sourceType === 'FITNESS')).toBe(true);
    const steps = service.query(alice, { question: '12345', scope: 'FITNESS', sourceTypes: ['STEPS'], searchMode: 'KEYWORD' }, 'steps-0001');
    expect(steps.citations.some((citation) => citation.sourceType === 'STEPS')).toBe(true);
  });

  it('redacts historic answers and insights when authoritative source access is revoked', () => {
    const { service, reader } = setup();
    service.createIndexJob(alice, { principal: alice, scope: 'USER_SELECTED_ARCHIVE' });
    const result = service.query(alice, { question: '杭州旅行', scope: 'LIFE', searchMode: 'KEYWORD' }, 'revoke-0001');
    const insight = service.saveInsight(alice, result.queryId);
    reader.remove({ ownerId: 'alice', sourceId: entryId });
    const authorized = service.getQuery(alice, result.queryId);
    expect(authorized.answerText).toContain('证据已发生变化');
    expect(authorized.answerText).not.toBe(result.answerText);
    expect(service.listCitations(alice, result.queryId).items.some((item) => item.sourceId === entryId)).toBe(false);
    expect(service.listInsights(alice).find((item) => item.id === insight.id)?.content).toContain('证据已发生变化');
  });

  it('rechecks related-memory entitlement and consent on every request', () => {
    const { service } = setup();
    service.createIndexJob(alice, { principal: alice, scope: 'USER_SELECTED_ARCHIVE' });
    service.updatePreferences(alice, { enabled: false });
    expect(() => service.relatedMemories(alice, { sourceType: 'LIFE', sourceId: entryId })).toThrowError(PersonalAIError);
  });

  it('queues saved Archive lifecycle work after commit and immediately invalidates derived data on trash/delete', () => {
    const reader = new InMemoryPersonalAISourceReader();
    reader.addArchive(record());
    const service = new PersonalAIService({ archiveReader: reader, usageReader: { read: () => [] }, autoProcessIndexJobs: false });
    service.acceptConsent(alice, 'v1');
    service.updatePreferences(alice, { enabled: true });
    const sink = createPersonalAIArchiveLifecycleSink(service);
    sink.publish({ ownerId: alice.userId, sourceType: 'ENTRY', sourceId: entryId, revision: 1, status: 'ACTIVE', action: 'SAVED', changedAt: '2026-08-18T00:00:00.000Z' });
    const job = service.listIndexJobs(alice).items[0];
    expect(job?.status).toBe('PENDING');
    service.processIndexJob(alice, job!.id);
    expect(service.getIndexStatus(alice).indexedChunkCount).toBeGreaterThan(0);
    sink.publish({ ownerId: alice.userId, sourceType: 'ENTRY', sourceId: entryId, revision: 2, status: 'TRASHED', action: 'TRASHED', changedAt: '2026-08-18T01:00:00.000Z' });
    expect(service.getIndexStatus(alice).indexedChunkCount).toBe(0);

    const disabled = new PersonalAIService({ archiveReader: reader, usageReader: { read: () => [] }, autoProcessIndexJobs: false });
    expect(() => createPersonalAIArchiveLifecycleSink(disabled).publish({ ownerId: alice.userId, sourceType: 'ENTRY', sourceId: entryId, revision: 1, status: 'ACTIVE', action: 'SAVED', changedAt: '2026-08-18T00:00:00.000Z' })).not.toThrow();
    expect(disabled.listIndexJobs(alice).items).toEqual([]);
  });

  it('exports only self-owned Personal AI metadata and never raw archive/RAG content', () => {
    const { service } = setup();
    service.createIndexJob(alice, { principal: alice, scope: 'LIFE' });
    const query = service.query(alice, { question: '杭州旅行', scope: 'LIFE', searchMode: 'KEYWORD', archiveMode: 'ARCHIVE_ONLY' }, 'export-0001');
    service.saveInsight(alice, query.queryId, '旅行洞察');
    service.createConversation(alice, 'LIFE');
    const exported = service.createExport(alice, { includeConversations: true });
    expect(exported.job.status).toBe('READY');
    expect(exported.result?.preferences.enabled).toBe(true);
    expect(exported.result?.consentHistory).toEqual([{ event: 'ACCEPTED', version: 'personal-ai.v1', occurredAt: '2026-08-18T00:00:00.000Z' }]);
    expect(exported.result?.conversations).toHaveLength(1);
    expect(exported.result?.citationReferences.some((citation) => citation.sourceId === entryId)).toBe(true);
    const serialized = JSON.stringify(exported.result);
    expect(serialized).not.toContain('今天去了杭州旅行');
    expect(serialized).not.toContain('杭州旅行');
    expect(serialized).not.toContain(query.answerText);
    expect(serialized).not.toContain('excerptSafe');
    expect(exported.result?.excludedDataCategories).toContain('RAW_EMBEDDING_VECTORS');
    expect(() => service.getExport(bob, exported.job.id)).toThrowError(PersonalAIError);
  });

  it('rejects local deterministic providers in production mode', () => {
    expect(() => new PersonalAIService({
      deploymentMode: 'PRODUCTION',
      archiveReader: { read: () => [] },
      usageReader: { read: () => [] },
      embeddingProvider: new DeterministicPersonalAIEmbeddingProvider(),
      vectorProvider: new InMemoryPersonalAIVectorSearchProvider(),
      generationGateway: new DeterministicPersonalAIGenerationGateway(),
      entitlementResolver: { has: () => true },
    })).toThrowError(/production/i);
  });
});
