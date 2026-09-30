import { describe, expect, it } from 'vitest';

import type {
  PersonalAIConsent,
  PersonalAIPreferences,
} from '@me-zip/shared-types';

import {
  personalAIDurableStorageKind,
  type PersonalAIDurableIndexJobLease,
  type PersonalAIDurableOwnerState,
  type PersonalAIDurableRepository,
} from './persistence.js';
import {
  DurablePersonalAIIndexJobExecutor,
  PersonalAIIndexDependencyUnavailableError,
  type PersonalAIAsyncArchiveReader,
  type PersonalAIAsyncEmbeddingProvider,
  type PersonalAIAsyncUsageReader,
  type PersonalAIAsyncVectorProvider,
  type PersonalAIChunkCipher,
  type PersonalAIWorkerArchiveRecord,
  type PersonalAIWorkerEntitlementResolver,
  type PersonalAIWorkerUsageRecord,
} from './durable-index-executor.js';

const ownerId = 'owner-1';
const now = '2026-08-18T00:00:00.000Z';

const preferences: PersonalAIPreferences = {
  enabled: true,
  archiveMode: 'ARCHIVE_ONLY',
  defaultScope: 'LIFE',
  includeHistoricalRevisions: false,
  updatedAt: now,
};

const consent: PersonalAIConsent = {
  accepted: true,
  version: 'v1',
  acceptedAt: now,
  providerDisclosure: 'provider-v1',
};

function ownerState(overrides: Partial<PersonalAIDurableOwnerState> = {}): PersonalAIDurableOwnerState {
  return {
    ownerId,
    preferences,
    currentConsent: consent,
    consentEvents: [],
    sources: [],
    chunks: [],
    conversations: [],
    queries: [],
    citations: [],
    insights: [],
    ...overrides,
  };
}

function repository(state: PersonalAIDurableOwnerState = ownerState()): PersonalAIDurableRepository & { readonly projections: unknown[] } {
  const projections: unknown[] = [];
  const noop = async (): Promise<void> => undefined;
  return {
    productionSafe: true,
    storageKind: personalAIDurableStorageKind,
    projections,
    loadOwnerState: async () => state,
    writePreferences: noop,
    appendConsent: noop,
    enqueueIndexJob: async () => { throw new Error('not used'); },
    claimIndexJobs: async () => [],
    renewIndexJobLease: async () => null,
    persistIndexProjection: async (input) => { projections.push(input); },
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

function lease(overrides: Partial<PersonalAIDurableIndexJobLease['job']> = {}): PersonalAIDurableIndexJobLease {
  return {
    leaseToken: 'lease-1',
    workerId: 'worker-1',
    claimedAt: now,
    expiresAt: '2026-08-18T00:05:00.000Z',
    job: {
      id: 'job-1',
      ownerId,
      scope: 'LIFE',
      dateRange: null,
      sourceTypes: ['LIFE'],
      status: 'INDEXING',
      indexVersion: 'personal-ai-v2',
      indexedSourceCount: 0,
      indexedChunkCount: 0,
      failedSourceCount: 0,
      createdAt: now,
      startedAt: now,
      completedAt: null,
      errorCode: null,
      input: {
        scope: 'LIFE',
        dateRange: null,
        sourceTypes: ['LIFE'],
        selectedEntryIds: [],
        selectedMediaIds: [],
        includeHistoricalRevisions: false,
        requestFingerprint: 'a'.repeat(64),
      },
      idempotencyKey: null,
      attemptCount: 1,
      availableAt: now,
      leaseToken: 'lease-1',
      leaseOwner: 'worker-1',
      leaseExpiresAt: '2026-08-18T00:05:00.000Z',
      lastHeartbeatAt: now,
      ...overrides,
    },
  };
}

function archiveRecord(overrides: Partial<PersonalAIWorkerArchiveRecord> = {}): PersonalAIWorkerArchiveRecord {
  return {
    sourceType: 'LIFE',
    sourceId: 'entry-1',
    sourceRecordId: '11111111-1111-1111-1111-111111111111',
    canonicalSourceId: 'entry-1',
    truthLayer: 'ORIGINAL',
    revisionId: null,
    revisionNumber: 1,
    ownerId,
    occurredAt: now,
    createdAt: now,
    updatedAt: now,
    visibility: 'PRIVATE',
    status: 'ACTIVE',
    title: 'A private title',
    text: '这是一段不应以明文进入 durable projection 的档案内容。',
    tags: ['tag'],
    metadata: { mood: 'calm' },
    ...overrides,
  };
}

function adapters(input: {
  readonly records?: readonly PersonalAIWorkerArchiveRecord[];
  readonly state?: PersonalAIDurableOwnerState;
  readonly embed?: (text: string) => Promise<readonly number[]>;
} = {}): {
  readonly repository: ReturnType<typeof repository>;
  readonly archiveReader: PersonalAIAsyncArchiveReader;
  readonly usageReader: PersonalAIAsyncUsageReader;
  readonly entitlementResolver: PersonalAIWorkerEntitlementResolver;
  readonly cipher: PersonalAIChunkCipher;
  readonly embeddingProvider: PersonalAIAsyncEmbeddingProvider;
  readonly vectorProvider: PersonalAIAsyncVectorProvider;
} {
  const repo = repository(input.state);
  const archiveReader: PersonalAIAsyncArchiveReader = {
    productionSafe: true,
    read: async () => input.records ?? [archiveRecord()],
  };
  const usageReader: PersonalAIAsyncUsageReader = { productionSafe: true, read: async () => [] };
  const entitlementResolver: PersonalAIWorkerEntitlementResolver = { productionSafe: true, has: async () => true };
  const cipher: PersonalAIChunkCipher = {
    productionSafe: true,
    encrypt: async () => ({ ciphertext: 'E'.repeat(32), keyReference: 'kms:test', algorithm: 'AES-GCM', version: 'v1' }),
  };
  const embeddingProvider: PersonalAIAsyncEmbeddingProvider = {
    productionSafe: true,
    name: 'TEST_EMBEDDING',
    embed: async ({ text }) => input.embed?.(text) ?? [0.1, 0.2, 0.3],
  };
  const vectorProvider: PersonalAIAsyncVectorProvider = {
    productionSafe: true,
    deleteSource: async () => undefined,
    upsert: async () => undefined,
  };
  return { repository: repo, archiveReader, usageReader, entitlementResolver, cipher, embeddingProvider, vectorProvider };
}

describe('durable Personal AI index executor', () => {
  it('re-authorizes, encrypts chunk text, embeds, vectors, and persists under the lease', async () => {
    const deps = adapters();
    const executor = new DurablePersonalAIIndexJobExecutor({ ...deps, now: () => now });
    const result = await executor.execute({ lease: lease() });
    expect(result).toEqual({ status: 'COMPLETED', indexedSourceCount: 1, indexedChunkCount: 1, failedSourceCount: 0 });
    const projection = deps.repository.projections[0] as { readonly chunks: readonly [{ readonly excerpt: string; readonly contentHash: string; readonly protectedText: { readonly ciphertext: string } }] };
    expect(projection.chunks[0]?.excerpt).toBe(projection.chunks[0]?.contentHash);
    expect(projection.chunks[0]?.protectedText.ciphertext).toBe('E'.repeat(32));
    expect(JSON.stringify(projection)).not.toContain('这是一段不应以明文');
  });

  it('fails closed for disabled Personal AI before reading source text', async () => {
    let reads = 0;
    const deps = adapters({ state: ownerState({ preferences: { ...preferences, enabled: false } }) });
    const archiveReader: PersonalAIAsyncArchiveReader = { productionSafe: true, read: async () => { reads += 1; return [archiveRecord()]; } };
    const executor = new DurablePersonalAIIndexJobExecutor({ ...deps, archiveReader, now: () => now });
    await expect(executor.execute({ lease: lease() })).resolves.toEqual({ status: 'FAILED', errorCode: 'PERSONAL_AI_DISABLED' });
    expect(reads).toBe(0);
    expect(deps.repository.projections).toHaveLength(0);
  });

  it('rejects AI insights and private-message records without embedding or persistence', async () => {
    const forbidden = archiveRecord({ sourceType: 'PRIVATE_MESSAGES' as PersonalAIWorkerArchiveRecord['sourceType'] });
    const deps = adapters({ records: [forbidden] });
    const executor = new DurablePersonalAIIndexJobExecutor({ ...deps, now: () => now });
    await expect(executor.execute({ lease: lease() })).resolves.toEqual({ status: 'FAILED', errorCode: 'FORBIDDEN_SOURCE_DATA' });
    expect(deps.repository.projections).toHaveLength(0);
  });

  it('fails closed when the Archive reader crosses into the AI Usage source boundary', async () => {
    const deps = adapters({ records: [archiveRecord({ sourceType: 'AI_USAGE' as PersonalAIWorkerArchiveRecord['sourceType'] })] });
    const executor = new DurablePersonalAIIndexJobExecutor({ ...deps, now: () => now });
    await expect(executor.execute({ lease: lease() })).resolves.toEqual({ status: 'FAILED', errorCode: 'FORBIDDEN_SOURCE_DATA' });
    expect(deps.repository.projections).toHaveLength(0);
  });

  it('fails closed when the AI Usage reader returns a non-aggregate Archive row', async () => {
    const deps = adapters();
    const usageReader: PersonalAIAsyncUsageReader = {
      productionSafe: true,
      read: async () => [archiveRecord() as unknown as PersonalAIWorkerUsageRecord],
    };
    const executor = new DurablePersonalAIIndexJobExecutor({ ...deps, usageReader, now: () => now });
    const usageLease = lease({ scope: 'AI_USAGE', sourceTypes: ['AI_USAGE'], input: { ...lease().job.input, scope: 'AI_USAGE', sourceTypes: ['AI_USAGE'] } });
    await expect(executor.execute({ lease: usageLease })).resolves.toEqual({ status: 'FAILED', errorCode: 'FORBIDDEN_SOURCE_DATA' });
    expect(deps.repository.projections).toHaveLength(0);
  });

  it('rejects malformed lease timestamps instead of treating NaN as a live lease', async () => {
    const deps = adapters();
    const executor = new DurablePersonalAIIndexJobExecutor({ ...deps, now: () => now });
    await expect(executor.execute({ lease: lease({ leaseExpiresAt: 'not-a-timestamp' }) })).resolves.toEqual({ status: 'FAILED', errorCode: 'INDEX_JOB_INVALID' });
    expect(deps.repository.projections).toHaveLength(0);
  });

  it('renews its worker lease before provider work and keeps the durable projection bound to the original token', async () => {
    const deps = adapters();
    const executor = new DurablePersonalAIIndexJobExecutor({ ...deps, now: () => now });
    let renewalCount = 0;
    const result = await executor.execute({
      lease: lease(),
      renewLease: async () => {
        renewalCount += 1;
        const renewed = lease({
          leaseExpiresAt: '2026-08-18T00:10:00.000Z',
          lastHeartbeatAt: '2026-08-18T00:01:00.000Z',
        });
        return { ...renewed, expiresAt: '2026-08-18T00:10:00.000Z' };
      },
    });

    expect(result).toEqual({ status: 'COMPLETED', indexedSourceCount: 1, indexedChunkCount: 1, failedSourceCount: 0 });
    expect(renewalCount).toBeGreaterThanOrEqual(3);
    expect(deps.repository.projections[0]).toEqual(expect.objectContaining({ leaseToken: 'lease-1', workerId: 'worker-1' }));
  });

  it('fails closed without persistence when its heartbeat loses the durable lease', async () => {
    const deps = adapters();
    const executor = new DurablePersonalAIIndexJobExecutor({ ...deps, now: () => now, retryDelaySeconds: 30 });

    await expect(executor.execute({ lease: lease(), renewLease: async () => null })).resolves.toEqual({
      status: 'RETRY',
      errorCode: 'INDEX_LEASE_EXPIRED',
      retryAt: '2026-08-18T00:00:30.000Z',
    });
    expect(deps.repository.projections).toHaveLength(0);
  });

  it('rejects a non-UUID source-record identity before writing a durable projection', async () => {
    const deps = adapters({ records: [archiveRecord({ sourceRecordId: 'source-row-1' })] });
    const executor = new DurablePersonalAIIndexJobExecutor({ ...deps, now: () => now });

    await expect(executor.execute({ lease: lease() })).resolves.toEqual({ status: 'FAILED', errorCode: 'INDEX_JOB_INVALID' });
    expect(deps.repository.projections).toHaveLength(0);
  });

  it('returns a bounded retry for an unavailable embedding provider and then fails terminally', async () => {
    const deps = adapters({ embed: async () => { throw new PersonalAIIndexDependencyUnavailableError(); } });
    const executor = new DurablePersonalAIIndexJobExecutor({ ...deps, now: () => now, maxAttempts: 2, retryDelaySeconds: 30 });
    await expect(executor.execute({ lease: lease({ attemptCount: 1 }) })).resolves.toEqual({ status: 'RETRY', errorCode: 'INDEX_DEPENDENCY_UNAVAILABLE', retryAt: '2026-08-18T00:00:30.000Z' });
    await expect(executor.execute({ lease: lease({ attemptCount: 2 }) })).resolves.toEqual({ status: 'FAILED', errorCode: 'INDEX_DEPENDENCY_UNAVAILABLE' });
  });

  it('rejects a source returned for another owner', async () => {
    const deps = adapters({ records: [archiveRecord({ ownerId: 'other-owner' })] });
    const executor = new DurablePersonalAIIndexJobExecutor({ ...deps, now: () => now });
    await expect(executor.execute({ lease: lease() })).resolves.toEqual({ status: 'FAILED', errorCode: 'SOURCE_OWNER_MISMATCH' });
    expect(deps.repository.projections).toHaveLength(0);
  });
});
