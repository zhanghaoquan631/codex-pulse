import { describe, expect, it } from 'vitest';
import type { AuthenticatedPrincipal } from '@me-zip/shared-types';

import {
  InMemoryPersonalAISourceReader,
  PersonalAIApiAdapter,
  PersonalAIError,
  PersonalAIService,
  type PersonalAIArchiveRecord,
  type PersonalAIUsageRecord,
} from '../../services/personal-ai/src/index.js';

const now = '2026-08-18T12:00:00.000Z';
const yesterday = '2026-08-17T10:00:00.000Z';
const today = '2026-08-18T10:00:00.000Z';

function principal(userId: string, overrides: Partial<AuthenticatedPrincipal> = {}): AuthenticatedPrincipal {
  return {
    userId,
    sessionId: `session-${userId}`,
    roles: ['USER'],
    issuedAt: now,
    ...overrides,
  };
}

const alice = principal('alice');
const bob = principal('bob');
const root = principal('root', {
  roles: ['SUPER_ADMIN'],
  adminIdentityId: 'root-identity',
  adminType: 'ORIGINAL_DEVELOPER_ROOT',
});

const lifeId = '11111111-1111-4111-8111-111111111111';
const bobLifeId = '22222222-2222-4222-8222-222222222222';
const timelineId = '33333333-3333-4333-8333-333333333333';
const dailyPackId = '44444444-4444-4444-8444-444444444444';
const revisionId = '55555555-5555-4555-8555-555555555555';
const fitnessId = '66666666-6666-4666-8666-666666666666';
const usageId = '77777777-7777-4777-8777-777777777777';

function idFactory(): () => string {
  let sequence = 0;
  return () => `00000000-0000-4000-8000-${String(++sequence).padStart(12, '0')}`;
}

function archiveRecord(overrides: Partial<PersonalAIArchiveRecord> = {}): PersonalAIArchiveRecord {
  return {
    ownerId: alice.userId,
    sourceType: 'LIFE',
    sourceId: lifeId,
    canonicalSourceId: lifeId,
    truthLayer: 'ORIGINAL',
    revisionId: null,
    occurredAt: today,
    createdAt: today,
    updatedAt: today,
    title: '西湖旅行',
    text: '今天去了西湖旅行，风让我很开心。',
    tags: ['旅行', '开心'],
    ...overrides,
  };
}

function usageRecord(overrides: Partial<PersonalAIUsageRecord> = {}): PersonalAIUsageRecord {
  return {
    ownerId: alice.userId,
    sourceType: 'AI_USAGE',
    sourceId: usageId,
    truthLayer: 'ORIGINAL',
    revisionId: null,
    occurredAt: today,
    createdAt: today,
    updatedAt: today,
    title: 'Codex 使用统计',
    text: null,
    metadata: { provider: 'OPENAI', app: 'CODEX', requests: 3, inputTokens: 120 },
    ...overrides,
  };
}

function serviceWith(reader: InMemoryPersonalAISourceReader): PersonalAIService {
  return new PersonalAIService({
    archiveReader: reader,
    usageReader: { read: (input) => reader.readUsage(input) },
    runtime: { now: () => now, id: idFactory() },
  });
}

function authorize(service: PersonalAIService, owner: AuthenticatedPrincipal): void {
  service.acceptConsent(owner, 'personal-ai.v1');
  service.updatePreferences(owner, { enabled: true });
}

function index(service: PersonalAIService, owner: AuthenticatedPrincipal, scope: Parameters<PersonalAIService['createIndexJob']>[1]['scope'] = 'USER_SELECTED_ARCHIVE'): void {
  const job = service.createIndexJob(owner, { principal: owner, scope });
  expect(job.status).toBe('READY');
}

describe('Phase 9 Personal AI / RAG integration boundary', () => {
  it('is owner-scoped and never expands context for Root/Admin principals', () => {
    const reader = new InMemoryPersonalAISourceReader();
    reader.addArchive(archiveRecord());
    reader.addArchive(archiveRecord({ ownerId: bob.userId, sourceId: bobLifeId, canonicalSourceId: bobLifeId, title: 'Bob 私密记录', text: 'Bob 不应被 Alice 看到。' }));
    const service = serviceWith(reader);
    authorize(service, alice);
    index(service, alice, 'LIFE');

    const aliceResult = service.query(alice, {
      question: '西湖旅行',
      scope: 'LIFE',
      sourceTypes: ['LIFE'],
      searchMode: 'KEYWORD',
      archiveMode: 'ARCHIVE_ONLY',
    }, 'phase9-alice-query');
    expect(aliceResult.citations.map((citation) => citation.sourceId)).toEqual([lifeId]);
    expect(() => service.getQuery(bob, aliceResult.queryId)).toThrowError(PersonalAIError);
    expect(() => service.listSources(bob, { principal: bob, scope: 'USER_SELECTED_ARCHIVE' })).toThrowError(PersonalAIError);
    authorize(service, bob);
    expect(service.listSources(bob, { principal: bob, scope: 'USER_SELECTED_ARCHIVE' }).map((source) => source.sourceId)).toEqual([bobLifeId]);

    // Admin identity and simulation claims are presentation/authentication
    // metadata, never a second owner or an archive-wide read capability.
    authorize(service, root);
    index(service, root, 'LIFE');
    const rootResult = service.query(root, {
      question: '西湖旅行',
      scope: 'LIFE',
      sourceTypes: ['LIFE'],
      searchMode: 'KEYWORD',
      archiveMode: 'ARCHIVE_ONLY',
    }, 'phase9-root-query');
    expect(rootResult.status).toBe('NO_EVIDENCE');
    expect(rootResult.citations).toHaveLength(0);

    const api = new PersonalAIApiAdapter(service);
    const forgedOwner = api.handle({
      method: 'POST',
      path: '/v1/personal-ai/queries',
      principal: bob,
      headers: { 'idempotency-key': 'phase9-forged-owner' },
      body: { question: '西湖旅行', scope: 'LIFE', ownerId: alice.userId },
    });
    expect(forgedOwner.status).toBe(400);
    expect(api.handle({ method: 'GET', path: `/v1/personal-ai/queries/${aliceResult.queryId}`, principal: bob }).status).toBe(404);
  });

  it('requires consent, defaults to NONE, honors explicit scopes, and stops after disable/clear', () => {
    const reader = new InMemoryPersonalAISourceReader();
    reader.addArchive(archiveRecord({ occurredAt: yesterday, updatedAt: yesterday, title: '昨天的西湖旅行' }));
    reader.addArchive(archiveRecord({ sourceId: timelineId, canonicalSourceId: timelineId, occurredAt: today, title: '今天的散步', text: '今天散步。' }));
    const service = serviceWith(reader);

    expect(service.getPreferences(alice)).toMatchObject({ enabled: false, defaultScope: 'NONE', archiveMode: 'ARCHIVE_ONLY' });
    expect(() => service.updatePreferences(alice, { enabled: true })).toThrowError(/consent/i);
    service.acceptConsent(alice, 'personal-ai.v1');
    service.updatePreferences(alice, { enabled: true });
    index(service, alice);

    const none = service.query(alice, {
      question: '西湖旅行',
      scope: 'NONE',
      archiveMode: 'ARCHIVE_ONLY',
      searchMode: 'KEYWORD',
    }, 'phase9-none-query');
    expect(none.status).toBe('NO_EVIDENCE');
    expect(none.citations).toHaveLength(0);

    const selected = service.query(alice, {
      question: '西湖旅行',
      scope: 'SELECTED_ENTRY',
      selectedEntryIds: [lifeId],
      sourceTypes: ['LIFE'],
      archiveMode: 'ARCHIVE_ONLY',
      searchMode: 'KEYWORD',
    }, 'phase9-selected-query');
    expect(selected.citations.every((citation) => citation.sourceId === lifeId)).toBe(true);

    const dateLimited = service.query(alice, {
      question: '西湖旅行',
      scope: 'DATE_RANGE',
      dateRange: { from: `${today.slice(0, 10)}T00:00:00.000Z`, to: `${today.slice(0, 10)}T23:59:59.999Z` },
      sourceTypes: ['LIFE'],
      archiveMode: 'ARCHIVE_ONLY',
      searchMode: 'KEYWORD',
    }, 'phase9-date-query');
    expect(dateLimited.citations.every((citation) => citation.occurredAt.startsWith(today.slice(0, 10)))).toBe(true);

    const evidence = service.query(alice, {
      question: '西湖旅行',
      scope: 'LIFE',
      sourceTypes: ['LIFE'],
      archiveMode: 'ARCHIVE_ONLY',
      searchMode: 'KEYWORD',
    }, 'phase9-evidence-query');
    expect(evidence.citations.length).toBeGreaterThan(0);

    service.updatePreferences(alice, { enabled: false });
    expect(() => service.query(alice, { question: '西湖旅行', scope: 'LIFE', searchMode: 'KEYWORD' }, 'phase9-disabled-query')).toThrowError(/disabled/i);
    service.clearIndex(alice);
    service.updatePreferences(alice, { enabled: true });
    const afterClear = service.query(alice, { question: '西湖旅行', scope: 'LIFE', searchMode: 'KEYWORD' }, 'phase9-cleared-query');
    expect(afterClear.status).toBe('NO_EVIDENCE');
    expect(afterClear.citations).toHaveLength(0);
    expect(service.getIndexStatus(alice).indexedChunkCount).toBe(0);
  });

  it('redacts historic citations after trash/delete invalidation', () => {
    const reader = new InMemoryPersonalAISourceReader();
    reader.addArchive(archiveRecord());
    const service = serviceWith(reader);
    authorize(service, alice);
    index(service, alice, 'LIFE');
    const result = service.query(alice, {
      question: '西湖旅行',
      scope: 'LIFE',
      sourceTypes: ['LIFE'],
      searchMode: 'KEYWORD',
      archiveMode: 'ARCHIVE_ONLY',
    }, 'phase9-redaction-query');
    expect(result.citations).toHaveLength(1);

    reader.addArchive(archiveRecord({ status: 'TRASHED' }));
    service.invalidateSource(alice, { sourceType: 'LIFE', sourceId: lifeId });
    const redacted = service.getQuery(alice, result.queryId);
    expect(redacted.status).toBe('NO_EVIDENCE');
    expect(redacted.evidenceKind).toBe('NO_EVIDENCE');
    expect(redacted.citations).toHaveLength(0);
    expect(redacted.answerText).toMatch(/证据|档案/);
    expect(service.listCitations(alice, result.queryId).items).toHaveLength(0);
    expect(service.getIndexStatus(alice).indexedSourceCount).toBe(0);

    // A subsequent permanent removal remains fail-closed and cannot restore
    // an excerpt from the historic query record.
    reader.remove({ ownerId: alice.userId, sourceId: lifeId });
    service.invalidateSource(alice, { sourceType: 'LIFE', sourceId: lifeId });
    expect(service.getQuery(alice, result.queryId).citations).toHaveLength(0);
  });

  it('deduplicates canonical pointers, selects the latest revision, and indexes structured fitness/usage records', () => {
    const reader = new InMemoryPersonalAISourceReader();
    reader.addArchive(archiveRecord());
    reader.addArchive(archiveRecord({
      truthLayer: 'REVISION',
      revisionId,
      revisionNumber: 2,
      updatedAt: '2026-08-18T11:00:00.000Z',
      text: '后来补充：西湖旅行让我更开心。',
      title: '西湖旅行（修订）',
    }));
    reader.addArchive(archiveRecord({
      sourceType: 'TIMELINE',
      sourceId: timelineId,
      canonicalSourceId: lifeId,
      title: 'Timeline 指针',
      text: '西湖旅行 pointer',
    }));
    reader.addArchive(archiveRecord({
      sourceType: 'DAILY_PACK',
      sourceId: dailyPackId,
      canonicalSourceId: dailyPackId,
      title: 'Daily Pack 摘要',
      text: '西湖旅行摘要',
      relatedSourceIds: [lifeId],
    }));
    reader.addArchive(archiveRecord({
      sourceType: 'FITNESS',
      sourceId: fitnessId,
      canonicalSourceId: fitnessId,
      title: '跑步训练',
      text: '今天跑步五公里。',
      metadata: { distanceKm: 5, durationMinutes: 32, steps: 8_000 },
    }));
    reader.addUsage(usageRecord());
    const service = serviceWith(reader);
    authorize(service, alice);
    index(service, alice);

    const listedSources = service.listSources(alice, { principal: alice, scope: 'USER_SELECTED_ARCHIVE' });
    expect(listedSources.some((source) => source.sourceId === lifeId && source.truthLayer === 'REVISION')).toBe(true);
    expect(listedSources.some((source) => source.sourceId === lifeId && source.truthLayer === 'ORIGINAL')).toBe(false);

    // Use a revision-only term so the query surface proves the latest revision
    // is what remains searchable after canonical dedup.
    const archiveResult = service.query(alice, {
      question: '修订',
      scope: 'USER_SELECTED_ARCHIVE',
      searchMode: 'KEYWORD',
      archiveMode: 'ARCHIVE_ONLY',
    }, 'phase9-canonical-query');
    expect(archiveResult.citations.some((citation) => citation.truthLayer === 'REVISION')).toBe(true);
    expect(archiveResult.citations.some((citation) => citation.truthLayer === 'ORIGINAL')).toBe(false);
    expect(archiveResult.citations.some((citation) => citation.sourceType === 'TIMELINE')).toBe(false);
    expect(archiveResult.citations.some((citation) => citation.sourceType === 'DAILY_PACK')).toBe(false);

    const fitness = service.query(alice, {
      question: '跑步五公里',
      scope: 'FITNESS',
      sourceTypes: ['FITNESS'],
      searchMode: 'KEYWORD',
      archiveMode: 'ARCHIVE_ONLY',
    }, 'phase9-fitness-query');
    expect(fitness.citations.some((citation) => citation.sourceId === fitnessId)).toBe(true);
    expect(fitness.usage.totalTokens).toBeGreaterThanOrEqual(0);

    const usage = service.query(alice, {
      question: 'Codex 使用统计',
      scope: 'AI_USAGE',
      sourceTypes: ['AI_USAGE'],
      searchMode: 'KEYWORD',
      archiveMode: 'ARCHIVE_ONLY',
    }, 'phase9-usage-query');
    expect(usage.citations.some((citation) => citation.sourceId === usageId && citation.sourceType === 'AI_USAGE')).toBe(true);
    expect(usage.usage.inputTokens).toBeGreaterThanOrEqual(0);
    expect(usage.usage.outputTokens).toBeGreaterThanOrEqual(0);
  });
});
