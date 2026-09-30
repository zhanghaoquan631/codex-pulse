export type ProductionJobFailure =
  | 'TRANSIENT_NETWORK'
  | 'DEPENDENCY_UNAVAILABLE'
  | 'RATE_LIMITED'
  | 'VALIDATION_FAILED'
  | 'FORBIDDEN'
  | 'NOT_FOUND'
  | 'UNKNOWN';

export interface ProductionJobPolicy {
  readonly maxAttempts: number;
  readonly leaseSeconds: number;
  readonly retryDelayMs: readonly number[];
  shouldRetry(failure: ProductionJobFailure, attempt: number): boolean;
}

/**
 * A transport-neutral worker policy. Durable queue adapters must keep the
 * idempotency key and payload server-side, lease work, and route exhausted
 * work to a restricted dead-letter queue. It deliberately never executes a
 * job inline in an HTTP request.
 */
export function createProductionJobPolicy(
  input?: Readonly<{
    maxAttempts?: number;
    leaseSeconds?: number;
  }>,
): ProductionJobPolicy {
  const maxAttempts = input?.maxAttempts ?? 5;
  const leaseSeconds = input?.leaseSeconds ?? 60;
  if (!Number.isInteger(maxAttempts) || maxAttempts < 1 || maxAttempts > 10) {
    throw new Error('Invalid production maxAttempts.');
  }
  if (!Number.isInteger(leaseSeconds) || leaseSeconds < 15 || leaseSeconds > 900) {
    throw new Error('Invalid production leaseSeconds.');
  }
  const retryDelayMs = Object.freeze(
    [1_000, 5_000, 30_000, 120_000, 600_000].slice(0, maxAttempts),
  );
  return Object.freeze({
    maxAttempts,
    leaseSeconds,
    retryDelayMs,
    shouldRetry(failure: ProductionJobFailure, attempt: number) {
      return (
        attempt < maxAttempts &&
        (failure === 'TRANSIENT_NETWORK' ||
          failure === 'DEPENDENCY_UNAVAILABLE' ||
          failure === 'RATE_LIMITED' ||
          failure === 'UNKNOWN')
      );
    },
  });
}

export interface PrivateStorageAccessPlan {
  readonly objectKey: string;
  readonly disposition: 'INLINE' | 'ATTACHMENT';
  readonly cacheControl: 'private, no-store';
  readonly requiresShortLivedSignedUrl: true;
}

const unsafeObjectKey = /(?:^\/|\\|(?:^|\/)\.\.(?:\/|$))/u;

function hasControlCharacter(value: string): boolean {
  return Array.from(value).some((character) => (character.codePointAt(0) ?? 0) < 32);
}

/**
 * Keeps object-store authorization in the server adapter. This is metadata
 * only: the caller must still owner-authorize before issuing a short-lived URL.
 */
export function createPrivateStorageAccessPlan(
  objectKey: string,
  disposition: 'INLINE' | 'ATTACHMENT' = 'INLINE',
): PrivateStorageAccessPlan {
  if (
    objectKey.length === 0 ||
    objectKey.length > 512 ||
    unsafeObjectKey.test(objectKey) ||
    hasControlCharacter(objectKey)
  ) {
    throw new Error('Unsafe private storage object key.');
  }
  return Object.freeze({
    objectKey,
    disposition,
    cacheControl: 'private, no-store',
    requiresShortLivedSignedUrl: true,
  });
}

export interface ProductionRateLimitPolicy {
  readonly backend: 'DISTRIBUTED';
  readonly windowSeconds: number;
  readonly limit: number;
}

/** In-memory counters are intentionally not accepted by production composition. */
export function createProductionRateLimitPolicy(
  input: Readonly<{ windowSeconds: number; limit: number }>,
): ProductionRateLimitPolicy {
  if (
    !Number.isInteger(input.windowSeconds) ||
    input.windowSeconds < 1 ||
    input.windowSeconds > 86_400
  ) {
    throw new Error('Invalid rate-limit window.');
  }
  if (!Number.isInteger(input.limit) || input.limit < 1 || input.limit > 100_000) {
    throw new Error('Invalid rate-limit limit.');
  }
  return Object.freeze({
    backend: 'DISTRIBUTED',
    windowSeconds: input.windowSeconds,
    limit: input.limit,
  });
}
