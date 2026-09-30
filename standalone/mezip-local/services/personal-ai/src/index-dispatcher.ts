import {
  PersonalAIDurableConfigurationError,
  assertPersonalAIDurableRepository,
  type PersonalAIDurableIndexJobLease,
  type PersonalAIDurableRepository,
  type PersonalAIIndexOutboxEvent,
} from './persistence.js';

/** The dispatcher is a wake-up channel only. The durable repository remains
 * the source of truth: a delivery may be repeated, delayed, or lost, and the
 * worker must always claim the job by lease from the repository. */
export type PersonalAIIndexDispatchDelivery = 'AT_LEAST_ONCE';

export interface PersonalAIIndexDispatchInput {
  readonly eventId: string;
  readonly ownerId: string;
  readonly jobId: string;
  readonly eventType: PersonalAIIndexOutboxEvent['eventType'];
  readonly payloadFingerprint: string;
}

export interface PersonalAIIndexDispatchReceipt {
  readonly eventId: string;
  readonly acceptedAt: string;
  readonly delivery: PersonalAIIndexDispatchDelivery;
}

/** Implementations can wrap a reviewed queue, Postgres NOTIFY bridge, or a
 * server scheduler. They must never carry raw archive content, answers,
 * encryption keys, principals, or client-controlled owner identifiers. */
export interface PersonalAIIndexDispatcher {
  readonly productionSafe: true;
  readonly delivery: PersonalAIIndexDispatchDelivery;
  dispatch(input: PersonalAIIndexDispatchInput): Promise<PersonalAIIndexDispatchReceipt>;
}

/** A worker receives an already-leased job. It rechecks membership, consent,
 * enabled preference, and authoritative Archive lifecycle state before doing
 * embedding work. Returning an outcome alone does not acknowledge the lease;
 * the worker must use the durable repository's lease-token methods. */
export interface PersonalAIIndexJobExecutionInput {
  readonly lease: PersonalAIDurableIndexJobLease;
  /** The worker supplies this server-only heartbeat.  It returns null when
   * another worker has taken the lease, so executors must stop before writing
   * a projection rather than racing an expired token. */
  readonly renewLease?: (() => Promise<PersonalAIDurableIndexJobLease | null>) | undefined;
}

export interface PersonalAIIndexJobExecutor {
  execute(input: PersonalAIIndexJobExecutionInput): Promise<PersonalAIIndexJobExecutionOutcome>;
}

export type PersonalAIIndexJobExecutionOutcome =
  | {
    readonly status: 'COMPLETED';
    readonly indexedSourceCount: number;
    readonly indexedChunkCount: number;
    readonly failedSourceCount: number;
  }
  | {
    readonly status: 'RETRY';
    readonly errorCode: string;
    readonly retryAt: string;
  }
  | {
    readonly status: 'FAILED';
    readonly errorCode: string;
  };

/** A server-only worker runtime. The implementation owns bounded polling,
 * heartbeat renewal, lease completion/failure, and retry backoff; an HTTP
 * request handler must only enqueue/return a PENDING job and never call it
 * inline. */
export interface PersonalAIIndexWorker {
  run(input: {
    readonly workerId: string;
    readonly repository: PersonalAIDurableRepository;
    readonly executor: PersonalAIIndexJobExecutor;
    readonly limit: number;
    readonly leaseDurationSeconds: number;
    readonly now: string;
  }): Promise<{ readonly claimedCount: number; readonly completedCount: number; readonly retriedCount: number; readonly failedCount: number }>;
}

/**
 * Executes one bounded, leased worker pass.  This is intentionally not wired
 * to an HTTP route: a consumer request only enqueues a transactionally stored
 * job/outbox event, while a server scheduler invokes this function later.
 *
 * Lease tokens are forwarded unchanged to every terminal write.  Therefore a
 * stale/second worker cannot complete or retry a job it did not claim.
 */
export async function runPersonalAIIndexWorkerOnce(input: Parameters<PersonalAIIndexWorker['run']>[0]): Promise<{
  readonly claimedCount: number;
  readonly completedCount: number;
  readonly retriedCount: number;
  readonly failedCount: number;
}> {
  assertPersonalAIDurableRepository(input.repository);
  const leases = await input.repository.claimIndexJobs({
    workerId: input.workerId,
    limit: input.limit,
    leaseDurationSeconds: input.leaseDurationSeconds,
    now: input.now,
  });
  let completedCount = 0;
  let retriedCount = 0;
  let failedCount = 0;
  for (const lease of leases) {
    let currentLease = lease;
    try {
      const renewLease = async (): Promise<PersonalAIDurableIndexJobLease | null> => {
        const renewed = await input.repository.renewIndexJobLease({
          ownerId: currentLease.job.ownerId,
          jobId: currentLease.job.id,
          leaseToken: currentLease.leaseToken,
          workerId: input.workerId,
          leaseDurationSeconds: input.leaseDurationSeconds,
          now: new Date().toISOString(),
        });
        if (renewed === null) return null;
        if (
          renewed.job.ownerId !== lease.job.ownerId ||
          renewed.job.id !== lease.job.id ||
          renewed.leaseToken !== lease.leaseToken ||
          renewed.workerId !== input.workerId
        ) {
          throw new PersonalAIDurableConfigurationError('Personal AI repository returned a mismatched index lease renewal.');
        }
        currentLease = renewed;
        return currentLease;
      };
      const outcome = await input.executor.execute({ lease, renewLease });
      if (outcome.status === 'COMPLETED') {
        await input.repository.completeIndexJob({
          ownerId: currentLease.job.ownerId,
          jobId: currentLease.job.id,
          leaseToken: currentLease.leaseToken,
          workerId: input.workerId,
          status: 'READY',
          indexedSourceCount: outcome.indexedSourceCount,
          indexedChunkCount: outcome.indexedChunkCount,
          failedSourceCount: outcome.failedSourceCount,
          completedAt: input.now,
        });
        completedCount += 1;
      } else {
        await input.repository.failIndexJob({
          ownerId: currentLease.job.ownerId,
          jobId: currentLease.job.id,
          leaseToken: currentLease.leaseToken,
          workerId: input.workerId,
          errorCode: outcome.errorCode,
          retryAt: outcome.status === 'RETRY' ? outcome.retryAt : null,
          failedAt: input.now,
        });
        if (outcome.status === 'RETRY') retriedCount += 1;
        else failedCount += 1;
      }
    } catch {
      // Never leave a claimed job indefinitely in INDEXING due to an executor
      // exception. The repository owns bounded retry/attempt policy.
      await input.repository.failIndexJob({
        ownerId: currentLease.job.ownerId,
        jobId: currentLease.job.id,
        leaseToken: currentLease.leaseToken,
        workerId: input.workerId,
        errorCode: 'INDEX_WORKER_EXCEPTION',
        retryAt: null,
        failedAt: input.now,
      });
      failedCount += 1;
    }
  }
  return { claimedCount: leases.length, completedCount, retriedCount, failedCount };
}

/**
 * Delivers committed outbox events to a wake-up queue.  A successful delivery
 * never marks a job complete; the queue consumer must still lease the job
 * from PostgreSQL.  A failed delivery releases the outbox lease for a bounded
 * repository-controlled retry rather than dropping an index request.
 */
export async function runPersonalAIIndexOutboxOnce(input: {
  readonly workerId: string;
  readonly repository: PersonalAIDurableRepository;
  readonly dispatcher: PersonalAIIndexDispatcher;
  readonly limit: number;
  readonly leaseDurationSeconds: number;
  readonly now: string;
  readonly retryAt: string;
}): Promise<{ readonly claimedCount: number; readonly dispatchedCount: number; readonly releasedCount: number }> {
  assertPersonalAIDurableRepository(input.repository);
  assertPersonalAIIndexDispatcher(input.dispatcher);
  const leases = await input.repository.claimIndexOutbox({
    workerId: input.workerId,
    limit: input.limit,
    leaseDurationSeconds: input.leaseDurationSeconds,
    now: input.now,
  });
  let dispatchedCount = 0;
  let releasedCount = 0;
  for (const lease of leases) {
    try {
      const receipt = await input.dispatcher.dispatch({
        eventId: lease.event.id,
        ownerId: lease.event.ownerId,
        jobId: lease.event.jobId,
        eventType: lease.event.eventType,
        payloadFingerprint: lease.event.payloadFingerprint,
      });
      if (receipt.eventId !== lease.event.id || receipt.delivery !== 'AT_LEAST_ONCE') throw new PersonalAIDurableConfigurationError('Personal AI dispatcher returned an invalid outbox receipt.');
      await input.repository.acknowledgeIndexOutbox({
        eventId: lease.event.id,
        leaseToken: lease.leaseToken,
        workerId: input.workerId,
        dispatchedAt: receipt.acceptedAt,
      });
      dispatchedCount += 1;
    } catch {
      await input.repository.releaseIndexOutbox({
        eventId: lease.event.id,
        leaseToken: lease.leaseToken,
        workerId: input.workerId,
        retryAt: input.retryAt,
        errorCode: 'INDEX_DISPATCH_FAILED',
      });
      releasedCount += 1;
    }
  }
  return { claimedCount: leases.length, dispatchedCount, releasedCount };
}

/** Production composition requires both pieces. A dispatcher by itself is not
 * durable; a repository without an outbox dispatcher can leave committed jobs
 * stranded until the next scheduler tick. */
export interface PersonalAIAsyncIndexingDependencies {
  readonly repository: PersonalAIDurableRepository;
  readonly dispatcher: PersonalAIIndexDispatcher;
}

export function assertPersonalAIIndexDispatcher(value: unknown): asserts value is PersonalAIIndexDispatcher {
  if (value === null || typeof value !== 'object') {
    throw new PersonalAIDurableConfigurationError('Personal AI production requires an asynchronous index dispatcher.');
  }
  const candidate = value as Record<string, unknown>;
  if (candidate.productionSafe !== true || candidate.delivery !== 'AT_LEAST_ONCE' || typeof candidate.dispatch !== 'function') {
    throw new PersonalAIDurableConfigurationError('Personal AI production requires a reviewed at-least-once index dispatcher.');
  }
}

/** Convenience guard for the API composition root. It is intentionally a
 * guard rather than a factory so this package does not imply a fake queue or
 * database implementation exists. */
export function assertPersonalAIAsyncIndexingDependencies(
  value: unknown,
): asserts value is PersonalAIAsyncIndexingDependencies {
  if (value === null || typeof value !== 'object') {
    throw new PersonalAIDurableConfigurationError('Personal AI production requires durable state and an async index dispatcher.');
  }
  const candidate = value as Record<string, unknown>;
  assertPersonalAIDurableRepository(candidate.repository);
  assertPersonalAIIndexDispatcher(candidate.dispatcher);
}
