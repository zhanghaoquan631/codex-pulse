import { describe, expect, it } from 'vitest';
import {
  createPrivateStorageAccessPlan,
  createProductionJobPolicy,
  createProductionRateLimitPolicy,
} from './production-operations.js';

describe('Phase 24 production operations foundation', () => {
  it('retries only bounded transient worker failures', () => {
    const policy = createProductionJobPolicy({ maxAttempts: 3, leaseSeconds: 60 });
    expect(policy.shouldRetry('TRANSIENT_NETWORK', 1)).toBe(true);
    expect(policy.shouldRetry('VALIDATION_FAILED', 1)).toBe(false);
    expect(policy.shouldRetry('UNKNOWN', 3)).toBe(false);
  });

  it('keeps private object access server-authorized and non-cacheable', () => {
    expect(createPrivateStorageAccessPlan('owners/a/files/a.png')).toMatchObject({
      cacheControl: 'private, no-store',
      requiresShortLivedSignedUrl: true,
    });
    expect(() => createPrivateStorageAccessPlan('../private.png')).toThrow('Unsafe');
  });

  it('labels production rate limiting as distributed only', () => {
    expect(createProductionRateLimitPolicy({ windowSeconds: 60, limit: 20 })).toEqual({
      backend: 'DISTRIBUTED',
      windowSeconds: 60,
      limit: 20,
    });
  });
});
