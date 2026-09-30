import { describe, expect, it } from 'vitest';
import type { AuthenticatedPrincipal } from '@me-zip/shared-types';
import { DeploymentError, DeploymentService, MockStaticDeploymentProvider } from './index.js';

const principal = (userId: string, roles: readonly string[] = []): AuthenticatedPrincipal => ({
  userId,
  sessionId: `session-${userId}`,
  roles,
  issuedAt: '2026-01-01T00:00:00.000Z',
});

const makeService = (provider = new MockStaticDeploymentProvider()) => new DeploymentService({
  entitlementResolver: { has: async () => true },
  projectResolver: { ownerId: async () => 'alice', describe: async () => ({ name: 'Demo', description: 'A demo project' }) },
  provider,
  dnsVerifier: async () => true,
  id: (() => { let n = 0; return () => `id-${++n}`; })(),
  token: (() => { let n = 0; return () => `opaque-token-000000${++n}`; })(),
  now: () => '2026-01-01T00:00:00.000Z',
});

describe('DeploymentService', () => {
  it('requires an explicit immutable source and isolates project reads/writes', async () => {
    const service = makeService();
    await expect(service.createDeployment(principal('alice'), {
      projectId: 'project-1', environment: 'PREVIEW', sourceType: 'COMMIT', sourceRevision: 'abc123',
    })).resolves.toMatchObject({ status: 'LIVE', sourceRevision: 'abc123', provider: 'MOCK_STATIC' });
    await expect(service.listDeployments(principal('bob'), 'project-1')).rejects.toMatchObject({ code: 'NOT_FOUND' });
    await expect(service.createDeployment(principal('alice'), {
      projectId: 'project-1', environment: 'PRODUCTION', sourceType: 'COMMIT', sourceRevision: 'abc123',
    })).rejects.toMatchObject({ code: 'CONFIRMATION_REQUIRED' });
  });

  it('keeps preview tokens one-time, hashed, revocable, and expiring', async () => {
    const service = makeService();
    const deployment = await service.createDeployment(principal('alice'), {
      projectId: 'project-1', environment: 'PREVIEW', sourceType: 'SNAPSHOT', sourceRevision: 'snapshot-1',
    });
    const share = await service.createPreviewShare(principal('alice'), { deploymentId: deployment.id, visibility: 'LINK_ONLY', expiresInDays: 1 });
    expect(share.token).toBe('opaque-token-0000001');
    expect(JSON.stringify(share)).not.toContain('tokenHash');
    expect(service.accessPreview(share.token!)).toMatchObject({ deploymentId: deployment.id });
    await service.revokePreviewShare(principal('alice'), share.id);
    expect(() => service.accessPreview(share.token!)).toThrowError(DeploymentError);
  });

  it('protects domains and secret values while enforcing collision checks', async () => {
    const service = makeService();
    const production = await service.createDeployment(principal('alice'), { projectId: 'project-1', environment: 'PRODUCTION', sourceType: 'COMMIT', sourceRevision: 'prod-1', confirmProduction: true });
    const domain = await service.addDomain(principal('alice'), { projectId: 'project-1', deploymentId: production.id, hostname: 'app.example.com' });
    expect(domain.status).toBe('PENDING_VERIFICATION');
    expect(JSON.stringify(domain)).not.toContain('verificationTokenHash');
    await expect(service.addDomain(principal('alice'), { projectId: 'project-1', deploymentId: production.id, hostname: 'app.example.com' })).rejects.toMatchObject({ code: 'CONFLICT' });
    const secret = await service.setSecretReference(principal('alice'), { projectId: 'project-1', environment: 'PREVIEW', name: 'API_KEY', secretReference: 'vault://project-1/api-key/v1' });
    expect(secret.valuePresent).toBe(true);
    expect(JSON.stringify(secret)).not.toContain('secretReference');
    await expect(service.setSecretReference(principal('alice'), { projectId: 'project-1', environment: 'PREVIEW', name: 'BAD', secretReference: 'plain-secret' })).rejects.toMatchObject({ code: 'VALIDATION' });
  });

  it('preserves the previous live deployment after a provider failure', async () => {
    const service = makeService();
    const first = await service.createDeployment(principal('alice'), { projectId: 'project-1', environment: 'PREVIEW', sourceType: 'COMMIT', sourceRevision: 'good' });
    const failing = makeService(new MockStaticDeploymentProvider({ failDeploy: true }));
    await expect(failing.createDeployment(principal('alice'), { projectId: 'project-1', environment: 'PREVIEW', sourceType: 'COMMIT', sourceRevision: 'bad' })).rejects.toMatchObject({ code: 'PROVIDER_FAILED' });
    expect((await service.getDeployment(principal('alice'), first.id)).status).toBe('LIVE');
  });

  it('separates published metadata from source/download visibility and supports root read audit', async () => {
    const audits: unknown[] = [];
    const service = new DeploymentService({
      entitlementResolver: { has: async () => true },
      projectResolver: { ownerId: async () => 'alice', describe: async () => ({ name: 'Demo', description: 'desc' }) },
      audit: { append: (event) => audits.push(event) },
    });
    const publication = await service.publishProject(principal('alice'), 'project-1', { projectVisibility: 'PUBLISHED', sourceVisibility: 'PRIVATE', downloadVisibility: 'SELECTED_RELEASE', releaseId: 'release-1' });
    expect(publication.releaseId).toBe('release-1');
    expect((await service.getPublishSettings(principal('alice'), 'project-1')).sourceVisibility).toBe('PRIVATE');
    expect(service.getPublicProject('project-1').projectName).toBe('Demo');
    await expect(service.getPublishSettings(principal('root', ['ORIGINAL_DEVELOPER_ROOT']), 'project-1')).resolves.toBeDefined();
    expect(audits).toHaveLength(1);
  });
});
