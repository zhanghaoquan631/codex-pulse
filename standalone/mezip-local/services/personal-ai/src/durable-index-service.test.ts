import { describe, expect, it } from 'vitest';

import type { AuthenticatedPrincipal } from '@me-zip/shared-types';

import {
  DurablePersonalAIIndexError,
  DurablePersonalAIIndexService,
  type PersonalAITrustedPrincipalResolver,
} from './durable-index-service.js';
import {
  personalAIDurableStorageKind,
  type PersonalAIDurableIndexJobEnqueueResult,
  type PersonalAIDurableIndexJobEnqueueWrite,
  type PersonalAIDurableIndexJobRow,
  type PersonalAIDurableOwnerState,
  type PersonalAIDurableRepository,
} from './persistence.js';

const principal = (userId = 'owner-1', sessionId = 'trusted-session'): AuthenticatedPrincipal => ({
  userId,
  sessionId,
  roles: ['USER'],
  issuedAt: '2026-08-18T00:00:00.000Z',
});

const ownerState = (enabled = true, consented = true): PersonalAIDurableOwnerState => ({
  ownerId: 'owner-1',
  preferences: {
    enabled,
    archiveMode: 'ARCHIVE_ONLY',
    defaultScope: 'LIFE',
    includeHistoricalRevisions: false,
    updatedAt: '2026-08-18T00:00:00.000Z',
  },
  currentConsent: {
    accepted: consented,
    version: consented ? 'consent-v1' : null,
    acceptedAt: consented ? '2026-08-18T00:00:00.000Z' : null,
    providerDisclosure: 'provider-disclosure-v1',
  },
  consentEvents: [],
  sources: [],
  chunks: [],
  conversations: [],
  queries: [],
  citations: [],
  insights: [],
});

function repositoryFixture(state = ownerState()): {
  repository: PersonalAIDurableRepository;
  writes: PersonalAIDurableIndexJobEnqueueWrite[];
  jobs: Map<string, PersonalAIDurableIndexJobRow>;
} {
  const writes: PersonalAIDurableIndexJobEnqueueWrite[] = [];
  const jobs = new Map<string, PersonalAIDurableIndexJobRow>();
  const idempotency = new Map<string, PersonalAIDurableIndexJobEnqueueWrite>();
  const noop = async (): Promise<void> => undefined;
  const repository: PersonalAIDurableRepository = {
    productionSafe: true,
    storageKind: personalAIDurableStorageKind,
    loadOwnerState: async () => structuredClone(state),
    writePreferences: noop,
    appendConsent: noop,
    enqueueIndexJob: async (write): Promise<PersonalAIDurableIndexJobEnqueueResult> => {
      const key = write.idempotency === null ? null : `${write.ownerId}:${write.idempotency.key}`;
      if (key !== null) {
        const prior = idempotency.get(key);
        if (prior !== undefined) {
          if (prior.idempotency?.fingerprint !== write.idempotency?.fingerprint) {
            throw new DurablePersonalAIIndexError('CONFLICT', 'idempotency conflict');
          }
          const priorJob = jobs.get(prior.job.id);
          if (priorJob === undefined) throw new Error('replay job missing');
          return { applied: false, job: structuredClone(priorJob), outbox: structuredClone(prior.outbox) };
        }
        idempotency.set(key, structuredClone(write));
      }
      writes.push(structuredClone(write));
      jobs.set(write.job.id, structuredClone(write.job));
      return { applied: true, job: structuredClone(write.job), outbox: structuredClone(write.outbox) };
    },
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
  return { repository, writes, jobs };
}

const trustedPrincipalResolver: PersonalAITrustedPrincipalResolver = {
  productionSafe: true,
  resolveOwnerId: (value) => value.sessionId.startsWith('trusted-') ? value.userId : null,
};

function serviceFor(fixture: ReturnType<typeof repositoryFixture>, stateOptions?: { readonly enabled?: boolean; readonly consented?: boolean }): DurablePersonalAIIndexService {
  const state = ownerState(stateOptions?.enabled ?? true, stateOptions?.consented ?? true);
  const repository = stateOptions === undefined
    ? fixture.repository
    : { ...fixture.repository, loadOwnerState: async () => structuredClone(state) };
  return new DurablePersonalAIIndexService({
    repository,
    trustedPrincipalResolver,
    entitlementResolver: { has: () => true },
    indexVersion: 'personal-ai-v1',
    runtime: {
      now: () => '2026-08-18T00:00:00.000Z',
      id: (() => {
        let counter = 0;
        return () => `${counter++ === 0 ? 'job' : 'outbox'}-1`;
      })(),
    },
  });
}

describe('DurablePersonalAIIndexService', () => {
  it('commits a pending job and identifier-only outbox without inline indexing', async () => {
    const fixture = repositoryFixture();
    const service = serviceFor(fixture);
    const result = await service.createIndexJob(principal(), {
      scope: 'LIFE',
      idempotencyKey: 'index-key-1',
    });
    expect(result.applied).toBe(true);
    expect(result.job.status).toBe('PENDING');
    expect(fixture.writes).toHaveLength(1);
    const write = fixture.writes[0]!;
    expect(write.job.status).toBe('PENDING');
    expect(write.job.input).not.toHaveProperty('text');
    expect(write.job.input).not.toHaveProperty('question');
    expect(write.outbox).toEqual(expect.objectContaining({
      ownerId: 'owner-1',
      jobId: write.job.id,
      eventType: 'INDEX_JOB_QUEUED',
      payloadFingerprint: expect.stringMatching(/^[a-f0-9]{64}$/u),
    }));
    expect(Object.keys(write.outbox).sort()).toEqual([
      'attemptCount',
      'availableAt',
      'createdAt',
      'dispatchedAt',
      'eventType',
      'id',
      'jobId',
      'ownerId',
      'payloadFingerprint',
      'status',
    ]);
    expect(JSON.stringify(write.outbox)).not.toMatch(/archive|prompt|question|answer|content|text/iu);
  });

  it('returns the canonical job on replay and preserves conflict semantics', async () => {
    const fixture = repositoryFixture();
    const service = serviceFor(fixture);
    const first = await service.createIndexJob(principal(), { scope: 'LIFE', idempotencyKey: 'index-key-2' });
    const replay = await service.createIndexJob(principal(), { scope: 'LIFE', idempotencyKey: 'index-key-2' });
    expect(replay).toEqual({ applied: false, job: first.job });
    expect(fixture.writes).toHaveLength(1);
    await expect(service.createIndexJob(principal(), { scope: 'HISTORY', idempotencyKey: 'index-key-2' })).rejects.toMatchObject({ code: 'CONFLICT' });
  });

  it('requires a trusted owner and consent/enabled state before enqueue', async () => {
    const fixture = repositoryFixture();
    const service = serviceFor(fixture);
    await expect(service.createIndexJob(principal('owner-1', 'untrusted-session'), { scope: 'LIFE' })).rejects.toMatchObject({ code: 'FORBIDDEN' });
    await expect(serviceFor(repositoryFixture(), { enabled: false }).createIndexJob(principal(), { scope: 'LIFE' })).rejects.toMatchObject({ code: 'FORBIDDEN' });
    await expect(serviceFor(repositoryFixture(), { consented: false }).createIndexJob(principal(), { scope: 'LIFE' })).rejects.toMatchObject({ code: 'CONSENT_REQUIRED' });
  });

  it('does not accept a client-supplied owner or prompt field', async () => {
    const fixture = repositoryFixture();
    const service = serviceFor(fixture);
    await expect(service.createIndexJob(principal(), { scope: 'LIFE', ownerId: 'other-owner' } as never)).rejects.toMatchObject({ code: 'VALIDATION' });
    await expect(service.createIndexJob(principal(), { scope: 'LIFE', prompt: 'private question' } as never)).rejects.toMatchObject({ code: 'VALIDATION' });
  });
});
