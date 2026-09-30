import { describe, expect, it } from 'vitest';

import {
  PersonalAIDurableConfigurationError,
  PostgresPersonalAIRepository,
  assertPersonalAIDurableRepository,
  personalAIDurableStorageKind,
  type PersonalAIDurableIndexJobLease,
  type PersonalAIDurableRepository,
  type PostgresPersonalAIDatabase,
  type PostgresPersonalAIQueryResult,
  type PostgresPersonalAITransaction,
} from './persistence.js';
import {
  assertPersonalAIAsyncIndexingDependencies,
  runPersonalAIIndexOutboxOnce,
  runPersonalAIIndexWorkerOnce,
  type PersonalAIIndexDispatcher,
} from './index-dispatcher.js';
import {
  PersonalAIService,
  type PersonalAIEmbeddingProvider,
  type PersonalAIGenerationGateway,
  type PersonalAIVectorSearchProvider,
} from './personal-ai.js';

/** A shape-only server fixture.  It proves the composition guard checks the
 * complete owner-state/job/outbox surface instead of accepting a marker-only
 * Map or a generic queue.  It is not a database implementation. */
function durableRepositoryFixture(): PersonalAIDurableRepository {
  const noop = async (): Promise<void> => undefined;
  return {
    productionSafe: true,
    storageKind: personalAIDurableStorageKind,
    loadOwnerState: async () => { throw new Error('fixture read is not invoked'); },
    writePreferences: noop,
    appendConsent: noop,
    enqueueIndexJob: async () => { throw new Error('fixture enqueue is not invoked'); },
    claimIndexJobs: async () => [],
    renewIndexJobLease: async () => null,
    persistIndexProjection: noop,
    completeIndexJob: noop,
    failIndexJob: noop,
    invalidateSource: noop,
    persistQuery: noop,
    persistInsight: noop,
    clearOwner: noop,
    claimIndexOutbox: async () => [],
    acknowledgeIndexOutbox: noop,
    releaseIndexOutbox: noop,
  };
}

type SqlStatement = { readonly text: string; readonly values: readonly unknown[] };

function fakePostgresDatabase(
  respond: (statement: SqlStatement, ordinal: number) => readonly Record<string, unknown>[],
): { readonly database: PostgresPersonalAIDatabase; readonly statements: SqlStatement[] } {
  const statements: SqlStatement[] = [];
  const transaction: PostgresPersonalAITransaction = {
    query: async <Row extends object>(statement: SqlStatement): Promise<PostgresPersonalAIQueryResult<Row>> => {
      statements.push(statement);
      return { rows: respond(statement, statements.length) as readonly Row[] };
    },
  };
  return {
    statements,
    database: { transaction: async <Result>(operation: (tx: PostgresPersonalAITransaction) => Promise<Result>) => operation(transaction) },
  };
}

function durableIndexJobRow(overrides: Partial<Record<string, unknown>> = {}): Record<string, unknown> {
  return {
    id: 'job-1',
    ownerId: 'owner-1',
    scope: 'LIFE',
    dateFrom: null,
    dateTo: null,
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
    selectedEntryIds: [],
    selectedMediaIds: [],
    includeHistoricalRevisions: false,
    requestFingerprint: 'a'.repeat(64),
    idempotencyKey: 'index-1',
    availableAt: '2026-08-18T00:00:00.000Z',
    attemptCount: 0,
    leaseToken: null,
    leaseOwner: null,
    leaseExpiresAt: null,
    lastHeartbeatAt: null,
    ...overrides,
  };
}

function durableOutboxRow(overrides: Partial<Record<string, unknown>> = {}): Record<string, unknown> {
  return {
    id: 'outbox-1',
    ownerId: 'owner-1',
    jobId: 'job-1',
    eventType: 'INDEX_JOB_QUEUED',
    payloadFingerprint: 'b'.repeat(64),
    status: 'PENDING',
    availableAt: '2026-08-18T00:00:00.000Z',
    createdAt: '2026-08-18T00:00:00.000Z',
    dispatchedAt: null,
    attemptCount: 0,
    leaseToken: null,
    leaseOwner: null,
    leaseExpiresAt: null,
    lastErrorCode: null,
    ...overrides,
  };
}

describe('Personal AI durable composition contracts', () => {
  it('rejects marker-only persistence and accepts only the complete server-side contract', () => {
    expect(() => assertPersonalAIDurableRepository({ productionSafe: true, storageKind: personalAIDurableStorageKind })).toThrow(PersonalAIDurableConfigurationError);
    expect(() => assertPersonalAIDurableRepository(durableRepositoryFixture())).not.toThrow();
  });

  it('requires a reviewed at-least-once dispatcher alongside the durable repository', () => {
    const dispatcher: PersonalAIIndexDispatcher = {
      productionSafe: true,
      delivery: 'AT_LEAST_ONCE',
      dispatch: async (input) => ({ eventId: input.eventId, acceptedAt: '2026-08-18T00:00:00.000Z', delivery: 'AT_LEAST_ONCE' }),
    };
    expect(() => assertPersonalAIAsyncIndexingDependencies({ repository: durableRepositoryFixture(), dispatcher })).not.toThrow();
    expect(() => assertPersonalAIAsyncIndexingDependencies({ repository: durableRepositoryFixture(), dispatcher: { productionSafe: true } })).toThrow(PersonalAIDurableConfigurationError);
  });

  it('processes only leased async jobs and forwards the opaque lease token to the durable terminal write', async () => {
    const lease = {
      job: {
        id: 'job-1',
        ownerId: 'owner-1',
        scope: 'LIFE',
        dateRange: null,
        sourceTypes: ['LIFE'],
        status: 'INDEXING',
        indexVersion: 'personal-ai-v1',
        indexedSourceCount: 0,
        indexedChunkCount: 0,
        failedSourceCount: 0,
        createdAt: '2026-08-18T00:00:00.000Z',
        startedAt: null,
        completedAt: null,
        errorCode: null,
        input: { scope: 'LIFE', dateRange: null, sourceTypes: ['LIFE'], selectedEntryIds: [], selectedMediaIds: [], includeHistoricalRevisions: false, requestFingerprint: 'a'.repeat(64) },
        idempotencyKey: null,
        attemptCount: 1,
        availableAt: '2026-08-18T00:00:00.000Z',
        leaseToken: 'lease-1',
        leaseOwner: 'worker-1',
        leaseExpiresAt: '2026-08-18T00:01:00.000Z',
        lastHeartbeatAt: null,
      },
      leaseToken: 'lease-1',
      workerId: 'worker-1',
      claimedAt: '2026-08-18T00:00:00.000Z',
      expiresAt: '2026-08-18T00:01:00.000Z',
    } satisfies PersonalAIDurableIndexJobLease;
    const completions: unknown[] = [];
    const renewals: unknown[] = [];
    const repository = durableRepositoryFixture();
    const claimedRepository: PersonalAIDurableRepository = {
      ...repository,
      claimIndexJobs: async () => [lease],
      renewIndexJobLease: async (input) => {
        renewals.push(input);
        return {
          ...lease,
          expiresAt: '2026-08-18T00:02:00.000Z',
          job: {
            ...lease.job,
            leaseExpiresAt: '2026-08-18T00:02:00.000Z',
            lastHeartbeatAt: input.now,
          },
        };
      },
      completeIndexJob: async (input) => { completions.push(input); },
    };
    const result = await runPersonalAIIndexWorkerOnce({
      workerId: 'worker-1',
      repository: claimedRepository,
      executor: {
        execute: async (input) => {
          const renewed = await input.renewLease?.();
          expect(renewed).toEqual(expect.objectContaining({ leaseToken: 'lease-1', workerId: 'worker-1' }));
          return { status: 'COMPLETED', indexedSourceCount: 1, indexedChunkCount: 2, failedSourceCount: 0 };
        },
      },
      limit: 10,
      leaseDurationSeconds: 60,
      now: '2026-08-18T00:00:10.000Z',
    });
    expect(result).toEqual({ claimedCount: 1, completedCount: 1, retriedCount: 0, failedCount: 0 });
    expect(renewals).toEqual([expect.objectContaining({ ownerId: 'owner-1', jobId: 'job-1', leaseToken: 'lease-1', workerId: 'worker-1' })]);
    expect(completions).toEqual([expect.objectContaining({ ownerId: 'owner-1', jobId: 'job-1', leaseToken: 'lease-1', workerId: 'worker-1', status: 'READY' })]);
  });

  it('dispatches only committed identifier-only outbox events and acknowledges the matching lease', async () => {
    const acknowledgements: unknown[] = [];
    const repository = durableRepositoryFixture();
    const outboxRepository: PersonalAIDurableRepository = {
      ...repository,
      claimIndexOutbox: async () => [{
        event: {
          id: 'outbox-1',
          ownerId: 'owner-1',
          jobId: 'job-1',
          eventType: 'INDEX_JOB_QUEUED',
          payloadFingerprint: 'b'.repeat(64),
          status: 'DISPATCHING',
          availableAt: '2026-08-18T00:00:00.000Z',
          createdAt: '2026-08-18T00:00:00.000Z',
          dispatchedAt: null,
          attemptCount: 1,
        },
        leaseToken: 'outbox-lease-1',
        workerId: 'dispatcher-1',
        claimedAt: '2026-08-18T00:00:00.000Z',
        expiresAt: '2026-08-18T00:01:00.000Z',
      }],
      acknowledgeIndexOutbox: async (input) => { acknowledgements.push(input); },
    };
    const dispatcher: PersonalAIIndexDispatcher = {
      productionSafe: true,
      delivery: 'AT_LEAST_ONCE',
      dispatch: async (input) => ({ eventId: input.eventId, acceptedAt: '2026-08-18T00:00:10.000Z', delivery: 'AT_LEAST_ONCE' }),
    };
    const result = await runPersonalAIIndexOutboxOnce({
      workerId: 'dispatcher-1',
      repository: outboxRepository,
      dispatcher,
      limit: 10,
      leaseDurationSeconds: 60,
      now: '2026-08-18T00:00:00.000Z',
      retryAt: '2026-08-18T00:01:00.000Z',
    });
    expect(result).toEqual({ claimedCount: 1, dispatchedCount: 1, releasedCount: 0 });
    expect(acknowledgements).toEqual([expect.objectContaining({ eventId: 'outbox-1', leaseToken: 'outbox-lease-1', workerId: 'dispatcher-1' })]);
  });

  it('fails closed rather than starting the synchronous map engine in a production composition', () => {
    const repository = durableRepositoryFixture();
    const dispatcher: PersonalAIIndexDispatcher = {
      productionSafe: true,
      delivery: 'AT_LEAST_ONCE',
      dispatch: async (input) => ({ eventId: input.eventId, acceptedAt: '2026-08-18T00:00:00.000Z', delivery: 'AT_LEAST_ONCE' }),
    };
    const embedding: PersonalAIEmbeddingProvider = { name: 'REVIEWED_TEST', productionSafe: true, embed: () => [0] };
    const vector: PersonalAIVectorSearchProvider = {
      productionSafe: true,
      upsert: () => undefined,
      search: () => [],
      deleteSource: () => undefined,
      deleteOwner: () => undefined,
    };
    const gateway: PersonalAIGenerationGateway = {
      phase8Gateway: true,
      generate: () => ({ answerText: '', modelCode: null, providerCode: null, inputTokens: 0, outputTokens: 0, costFen: 0, latencyMs: 0 }),
    };
    expect(() => new PersonalAIService({
      deploymentMode: 'PRODUCTION',
      autoProcessIndexJobs: false,
      asyncIndexing: { repository, dispatcher },
      archiveReader: { read: () => [] },
      usageReader: { read: () => [] },
      embeddingProvider: embedding,
      vectorProvider: vector,
      generationGateway: gateway,
      entitlementResolver: { has: () => true },
    })).toThrow(/durable async service/i);
  });

  it('reads index jobs with an owner-scoped query and projects the durable row', async () => {
    const fixture = fakePostgresDatabase((statement) => statement.text.includes('FROM personal_index_jobs') ? [durableIndexJobRow()] : []);
    const repository = new PostgresPersonalAIRepository(fixture.database);

    const job = await repository.readIndexJob({ ownerId: 'owner-1', jobId: 'job-1' });

    expect(job).toEqual(expect.objectContaining({ id: 'job-1', ownerId: 'owner-1', indexVersion: 'personal-ai-v1', status: 'PENDING' }));
    expect(fixture.statements).toHaveLength(1);
    expect(fixture.statements[0]?.text).toMatch(/WHERE owner_user_id = \$1 AND id = \$2/);
    expect(fixture.statements[0]?.values).toEqual(['owner-1', 'job-1']);
  });

  it('claims jobs with a row lock and lease, never a process-local claim', async () => {
    const fixture = fakePostgresDatabase((statement) => statement.text.includes('FOR UPDATE SKIP LOCKED')
      ? [durableIndexJobRow({ status: 'INDEXING', attemptCount: 1, leaseToken: 'lease-1', leaseOwner: 'worker-1', leaseExpiresAt: '2026-08-18T00:01:00.000Z', lastHeartbeatAt: '2026-08-18T00:00:00.000Z' })]
      : []);
    const repository = new PostgresPersonalAIRepository(fixture.database);

    const leases = await repository.claimIndexJobs({ workerId: 'worker-1', limit: 2, leaseDurationSeconds: 60, now: '2026-08-18T00:00:00.000Z' });

    expect(leases).toHaveLength(1);
    expect(leases[0]).toEqual(expect.objectContaining({ leaseToken: 'lease-1', workerId: 'worker-1' }));
    expect(fixture.statements[0]?.text).toMatch(/FOR UPDATE SKIP LOCKED/);
    expect(fixture.statements[0]?.values).toEqual(['2026-08-18T00:00:00.000Z', 2, 'worker-1', 60]);
  });

  it('does not let a conflicting consent idempotency replay alter the current preference projection', async () => {
    const fixture = fakePostgresDatabase((statement) => {
      if (statement.text.includes('INSERT INTO personal_ai_consent_events')) return [];
      if (statement.text.includes('FROM personal_ai_consent_events')) {
        return [{
          id: 'consent-original',
          ownerId: 'owner-1',
          consentVersion: 'v1',
          eventType: 'ACCEPTED',
          providerDisclosureVersion: 'provider-v1',
          policyHash: 'a'.repeat(64),
          idempotencyKey: 'consent-key-1',
          occurredAt: '2026-08-18T00:00:00.000Z',
        }];
      }
      return [];
    });
    const repository = new PostgresPersonalAIRepository(fixture.database);

    await expect(repository.appendConsent({
      ownerId: 'owner-1',
      event: {
        id: 'consent-retry-with-different-decision',
        ownerId: 'owner-1',
        consentVersion: 'v1',
        eventType: 'WITHDRAWN',
        providerDisclosureVersion: 'provider-v1',
        policyHash: 'a'.repeat(64),
        idempotencyKey: 'consent-key-1',
        occurredAt: '2026-08-18T00:01:00.000Z',
      },
      idempotency: null,
    })).rejects.toThrow(/idempotency key conflicts/i);

    expect(fixture.statements.some((statement) => statement.text.includes('INSERT INTO personal_ai_preferences'))).toBe(false);
  });

  it('enqueues job and identifier-only outbox in one transaction', async () => {
    const fixture = fakePostgresDatabase((statement) => {
      if (statement.text.includes('INSERT INTO personal_index_jobs')) return [durableIndexJobRow({ status: 'PENDING' })];
      if (statement.text.includes('INSERT INTO personal_ai_index_outbox')) return [durableOutboxRow()];
      if (statement.text.includes('FROM personal_ai_index_versions')) return [{ id: 'version-1', version: 'personal-ai-v1' }];
      return [];
    });
    const repository = new PostgresPersonalAIRepository(fixture.database);
    const job = {
      ...durableIndexJobRow(),
      input: {
        scope: 'LIFE',
        dateRange: null,
        sourceTypes: ['LIFE'],
        selectedEntryIds: [],
        selectedMediaIds: [],
        includeHistoricalRevisions: false,
        requestFingerprint: 'a'.repeat(64),
      },
    };
    const outbox = durableOutboxRow();

    const result = await repository.enqueueIndexJob({
      ownerId: 'owner-1',
      job: job as never,
      idempotency: null,
      outbox: outbox as never,
    });

    expect(result).toEqual(expect.objectContaining({ applied: true }));
    expect(result.job.ownerId).toBe('owner-1');
    expect(result.outbox.jobId).toBe('job-1');
    expect(fixture.statements.map((statement) => statement.text)).toEqual(expect.arrayContaining([
      expect.stringContaining('INSERT INTO personal_index_jobs'),
      expect.stringContaining('INSERT INTO personal_ai_index_outbox'),
    ]));
    expect(fixture.statements.find((statement) => statement.text.includes('INSERT INTO personal_ai_index_outbox'))?.values).not.toContain(expect.stringContaining('private'));
  });

  it('returns the canonical job on idempotent enqueue replay without creating an orphan outbox', async () => {
    const canonicalJob = durableIndexJobRow({ id: 'job-canonical', idempotencyKey: 'index-1' });
    const canonicalOutbox = durableOutboxRow({ id: 'outbox-canonical', jobId: 'job-canonical' });
    const fixture = fakePostgresDatabase((statement) => {
      if (statement.text.trim().startsWith('SELECT id, version FROM personal_ai_index_versions')) return [{ id: 'version-1', version: 'personal-ai-v1' }];
      if (statement.text.includes('INSERT INTO personal_index_jobs')) return [];
      if (statement.text.includes('FROM personal_index_jobs')) return [canonicalJob];
      if (statement.text.includes('FROM personal_ai_index_outbox')) return [canonicalOutbox];
      return [];
    });
    const repository = new PostgresPersonalAIRepository(fixture.database);
    const job = {
      ...durableIndexJobRow({ id: 'job-new' }),
      input: {
        scope: 'LIFE', dateRange: null, sourceTypes: ['LIFE'], selectedEntryIds: [], selectedMediaIds: [], includeHistoricalRevisions: false, requestFingerprint: 'a'.repeat(64),
      },
    };
    const outbox = durableOutboxRow({ id: 'outbox-new', jobId: 'job-new' });

    const result = await repository.enqueueIndexJob({ ownerId: 'owner-1', job: job as never, idempotency: null, outbox: outbox as never });

    expect(result).toEqual(expect.objectContaining({ applied: false }));
    expect(result.job.id).toBe('job-canonical');
    expect(result.outbox.jobId).toBe('job-canonical');
    expect(fixture.statements.some((statement) => statement.text.includes('INSERT INTO personal_ai_index_outbox'))).toBe(false);
  });

  it('fails closed when a supplied sourceRecordId differs from the owner-scoped natural source identity', async () => {
    const sourceRecordId = '11111111-1111-1111-1111-111111111111';
    const canonicalRecordId = '33333333-3333-3333-3333-333333333333';
    const sourceId = '22222222-2222-2222-2222-222222222222';
    const fixture = fakePostgresDatabase((statement) => {
      if (statement.text.includes('FROM personal_index_jobs') && statement.text.includes('lease_owner')) {
        return [durableIndexJobRow({ status: 'INDEXING', leaseToken: 'lease-1', leaseOwner: 'worker-1', leaseExpiresAt: '2026-08-18T00:05:00.000Z' })];
      }
      if (statement.text.includes('FROM personal_knowledge_sources')) {
        return [{
          sourceRecordId: canonicalRecordId,
          ownerId: 'owner-1',
          sourceType: 'LIFE',
          sourceId,
          truthLayer: 'ORIGINAL',
          revisionId: null,
        }];
      }
      return [];
    });
    const repository = new PostgresPersonalAIRepository(fixture.database);

    await expect(repository.persistIndexProjection({
      ownerId: 'owner-1',
      jobId: 'job-1',
      leaseToken: 'lease-1',
      workerId: 'worker-1',
      sources: [{
        ownerId: 'owner-1', sourceRecordId: sourceRecordId.toUpperCase(), sourceType: 'LIFE', sourceId, canonicalSourceId: sourceId,
        truthLayer: 'ORIGINAL', revisionId: null, occurredAt: '2026-08-18T00:00:00.000Z',
        createdAt: '2026-08-18T00:00:00.000Z', updatedAt: '2026-08-18T00:00:00.000Z',
        visibility: 'PRIVATE', status: 'ACTIVE', title: null, tags: [], indexVersion: 'personal-ai-v1',
        indexStatus: 'READY', contentHash: 'c'.repeat(64),
      }],
      chunks: [],
      invalidatedSourceRecordIds: [],
    })).rejects.toThrow(/conflicts with canonical source record/);
    expect(fixture.statements.some((statement) => statement.text.includes('INSERT INTO personal_knowledge_sources'))).toBe(false);
  });

  it('fails closed when a supplied sourceRecordId is already bound to another natural identity', async () => {
    const sourceRecordId = '11111111-1111-1111-1111-111111111111';
    const sourceId = '22222222-2222-2222-2222-222222222222';
    const fixture = fakePostgresDatabase((statement) => {
      if (statement.text.includes('FROM personal_index_jobs') && statement.text.includes('lease_owner')) {
        return [durableIndexJobRow({ status: 'INDEXING', leaseToken: 'lease-1', leaseOwner: 'worker-1', leaseExpiresAt: '2026-08-18T00:05:00.000Z' })];
      }
      if (statement.text.includes('FROM personal_knowledge_sources')) {
        return [{
          sourceRecordId,
          ownerId: 'owner-1',
          sourceType: 'TIMELINE',
          sourceId: '44444444-4444-4444-4444-444444444444',
          truthLayer: 'ORIGINAL',
          revisionId: null,
        }];
      }
      return [];
    });
    const repository = new PostgresPersonalAIRepository(fixture.database);

    await expect(repository.persistIndexProjection({
      ownerId: 'owner-1',
      jobId: 'job-1',
      leaseToken: 'lease-1',
      workerId: 'worker-1',
      sources: [{
        ownerId: 'owner-1', sourceRecordId, sourceType: 'LIFE', sourceId, canonicalSourceId: sourceId,
        truthLayer: 'ORIGINAL', revisionId: null, occurredAt: '2026-08-18T00:00:00.000Z',
        createdAt: '2026-08-18T00:00:00.000Z', updatedAt: '2026-08-18T00:00:00.000Z',
        visibility: 'PRIVATE', status: 'ACTIVE', title: null, tags: [], indexVersion: 'personal-ai-v1',
        indexStatus: 'READY', contentHash: 'c'.repeat(64),
      }],
      chunks: [],
      invalidatedSourceRecordIds: [],
    })).rejects.toThrow(/already bound to a different/);
    expect(fixture.statements.some((statement) => statement.text.includes('INSERT INTO personal_knowledge_sources'))).toBe(false);
  });
});
