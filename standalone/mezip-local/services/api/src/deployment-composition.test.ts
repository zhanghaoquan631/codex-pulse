import { describe, expect, it } from 'vitest';
import { createMembershipBoundDeploymentService } from './deployment-composition.js';

describe('deployment production composition', () => {
  it('rejects an in-memory/unhydrated membership authorizer', () => {
    const membership = { isDurableRepositoryConfigured: () => false, hasActualUser: () => true } as never;
    expect(() => createMembershipBoundDeploymentService({
      membership,
      projectResolver: { ownerId: () => 'alice' },
      provider: {
        code: 'STATIC_WEB',
        prepare: async () => ({ buildId: 'b', contentHash: 'a'.repeat(64), sizeBytes: 1, manifest: {}, logs: [] }),
        deploy: async () => ({ providerDeploymentId: 'd', url: 'https://example.invalid', logs: [] }),
        getStatus: async () => ({ status: 'LIVE', url: 'https://example.invalid' }),
        cancel: async () => {}, delete: async () => {}, rollback: async () => ({ providerDeploymentId: 'd', url: 'https://example.invalid', logs: [] }), getLogs: async () => [], configureDomain: async () => ({ tlsStatus: 'ACTIVE' }), checkHealth: async () => ({ status: 'PASS' }),
      },
    })).toThrow(/durable Membership/i);
  });
});
