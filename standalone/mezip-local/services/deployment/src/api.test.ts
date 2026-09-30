import { describe, expect, it } from 'vitest';
import type { AuthenticatedPrincipal } from '@me-zip/shared-types';
import { DeploymentApiAdapter } from './api.js';
import { DeploymentService } from './index.js';

const alice: AuthenticatedPrincipal = { userId: 'alice', sessionId: 's1', roles: [], issuedAt: '2026-01-01T00:00:00.000Z' };
const service = () => new DeploymentService({ entitlementResolver: { has: async () => true }, projectResolver: { ownerId: async () => 'alice' } });

describe('DeploymentApiAdapter', () => {
  it('requires a trusted principal and rejects owner/root spoof fields', async () => {
    const adapter = new DeploymentApiAdapter(service());
    await expect(adapter.handle({ method: 'POST', path: '/v1/deployments', body: { projectId: 'p1', environment: 'PREVIEW', sourceType: 'COMMIT', sourceRevision: 'abc', ownerId: 'bob' } })).resolves.toMatchObject({ status: 403 });
    const response = await adapter.handle({ method: 'POST', path: '/v1/deployments', principal: alice, body: { projectId: 'p1', environment: 'PREVIEW', sourceType: 'COMMIT', sourceRevision: 'abc', ownerId: 'bob' } });
    expect(response.status).toBe(400);
  });

  it('keeps public project reads unauthenticated but not arbitrary route variants', async () => {
    const adapter = new DeploymentApiAdapter(service());
    await expect(adapter.handle({ method: 'GET', path: '/v1/public/projects/p1' })).resolves.toMatchObject({ status: 404 });
    await expect(adapter.handle({ method: 'GET', path: '/v1/public/projects' })).resolves.toMatchObject({ status: 400 });
  });
});
