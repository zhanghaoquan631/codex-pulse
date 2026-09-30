import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import type { AuthenticatedPrincipal } from '../../packages/shared-types/src/index.js';
import { DeploymentError, DeploymentService, MockStaticDeploymentProvider } from '../../services/deployment/src/index.js';

const alice: AuthenticatedPrincipal = { userId: 'alice', sessionId: 'phase12-session', roles: ['USER'], issuedAt: '2026-08-19T00:00:00.000Z' };
const bob: AuthenticatedPrincipal = { userId: 'bob', sessionId: 'phase12-session-bob', roles: ['USER'], issuedAt: '2026-08-19T00:00:00.000Z' };
const service = (provider = new MockStaticDeploymentProvider()) => new DeploymentService({
  entitlementResolver: { has: async () => true },
  projectResolver: { ownerId: async () => 'alice', describe: async () => ({ name: 'Phase 12', description: 'deployment' }) },
  provider,
  dnsVerifier: async () => true,
  id: (() => { let i = 0; return () => `phase12-${++i}`; })(),
  token: () => 'phase12-unpredictable-token',
  now: () => '2026-08-19T00:00:00.000Z',
});

describe('Phase 12 deployment integration boundary', () => {
  it('keeps migration 014 owner-scoped and secret-reference-only', () => {
    const sql = readFileSync(new URL('../../infrastructure/database/014_phase12_deployment.sql', import.meta.url), 'utf8');
    expect((sql.match(/CREATE TABLE IF NOT EXISTS/g) ?? []).length).toBeGreaterThanOrEqual(12);
    expect((sql.match(/FORCE ROW LEVEL SECURITY/g) ?? []).length).toBeGreaterThanOrEqual(1);
    expect(sql).not.toMatch(/raw_secret|secret_value|provider_api_key|token_plaintext/iu);
    expect(sql).not.toMatch(/CREATE POLICY.*consumer/iu);
  });

  it('deploys explicit source metadata and denies cross-owner access', async () => {
    const deploymentService = service();
    const deployment = await deploymentService.createDeployment(alice, { projectId: 'project-12', environment: 'PREVIEW', sourceType: 'COMMIT', sourceRevision: 'commit-abc' });
    expect(deployment).toMatchObject({ status: 'LIVE', sourceType: 'COMMIT', sourceRevision: 'commit-abc', provider: 'MOCK_STATIC' });
    await expect(deploymentService.getDeployment(bob, deployment.id)).rejects.toMatchObject({ code: 'NOT_FOUND' });
  });

  it('requires production confirmation and preserves live state on provider failure', async () => {
    const deploymentService = service();
    await expect(deploymentService.createDeployment(alice, { projectId: 'project-12', environment: 'PRODUCTION', sourceType: 'RELEASE', sourceRevision: 'v1.0.0', releaseId: 'release-12' })).rejects.toMatchObject({ code: 'CONFIRMATION_REQUIRED' });
    const live = await deploymentService.createDeployment(alice, { projectId: 'project-12', environment: 'PRODUCTION', sourceType: 'RELEASE', sourceRevision: 'v1.0.0', releaseId: 'release-12', confirmProduction: true });
    expect(live.status).toBe('LIVE');
    const failing = service(new MockStaticDeploymentProvider({ failHealth: true }));
    await expect(failing.createDeployment(alice, { projectId: 'project-12', environment: 'PREVIEW', sourceType: 'SNAPSHOT', sourceRevision: 'snapshot-12' })).rejects.toBeInstanceOf(DeploymentError);
    expect((await deploymentService.getDeployment(alice, live.id)).status).toBe('LIVE');
  });

  it('enforces preview revoke/expiry and keeps secret values outside projections', async () => {
    const deploymentService = service();
    const deployment = await deploymentService.createDeployment(alice, { projectId: 'project-12', environment: 'PREVIEW', sourceType: 'SNAPSHOT', sourceRevision: 'snapshot-12' });
    const share = await deploymentService.createPreviewShare(alice, { deploymentId: deployment.id, visibility: 'LINK_ONLY', expiresInDays: 1 });
    expect(share.token).toBe('phase12-unpredictable-token');
    expect(JSON.stringify(share)).not.toContain('tokenHash');
    expect(deploymentService.accessPreview(share.token!)).toMatchObject({ deploymentId: deployment.id });
    await deploymentService.revokePreviewShare(alice, share.id);
    expect(() => deploymentService.accessPreview(share.token!)).toThrowError(DeploymentError);
    const secret = await deploymentService.setSecretReference(alice, { projectId: 'project-12', environment: 'PREVIEW', name: 'TOKEN', secretReference: 'vault://phase12/token/v1' });
    expect(JSON.stringify(secret)).not.toContain('vault://phase12/token/v1');
  });
});
