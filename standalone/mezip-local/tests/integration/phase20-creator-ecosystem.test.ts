import { describe, expect, it } from 'vitest';
import { CreatorLabService } from '../../services/creator-lab/src/index.js';
import { CreatorEcosystemService, CreatorLabEcosystemProjectGateway } from '../../services/creator-ecosystem/src/index.js';
import { CreatorEcosystemApiAdapter } from '../../services/creator-ecosystem/src/api.js';
import type { AuthenticatedPrincipal } from '@me-zip/shared-types';

const alice: AuthenticatedPrincipal = { userId: 'alice', sessionId: 'alice-session', roles: [], issuedAt: '2026-08-20T00:00:00.000Z' };
const bob: AuthenticatedPrincipal = { userId: 'bob', sessionId: 'bob-session', roles: [], issuedAt: '2026-08-20T00:00:00.000Z' };

function setup() {
  let sequence = 0;
  const lab = new CreatorLabService({
    entitlementResolver: { has: () => true },
    id: () => `lab-${++sequence}`,
    now: () => '2026-08-20T00:00:00.000Z',
  });
  const service = new CreatorEcosystemService({
    projects: new CreatorLabEcosystemProjectGateway(lab),
    entitlements: { has: () => true },
    id: () => `ecosystem-${++sequence}`,
    token: () => `download-${++sequence}`,
    now: () => '2026-08-20T00:00:00.000Z',
  });
  return { lab, service, api: new CreatorEcosystemApiAdapter(service) };
}

function publish(service: CreatorEcosystemService, lab: CreatorLabService) {
  const project = lab.createProject(alice, { name: 'Creator map', description: 'A published snapshot', type: 'WEB', visibility: 'PRIVATE' });
  service.updateProfile(alice, { username: 'tom-creator', displayName: 'Tom Creator', profileVisibility: 'PUBLIC' });
  service.updateProjectMetadata(alice, project.id, { projectVisibility: 'PUBLIC', sourceVisibility: 'PRIVATE', downloadVisibility: 'PUBLIC' });
  const release = lab.createRelease(alice, project.id, { version: '1.0.0', title: 'Initial release', notes: 'No private source is published.', sourceCommitId: null });
  lab.publishRelease(alice, release.id);
  const snapshot = service.publishProject(alice, project.id, { releaseId: release.id, idempotencyKey: 'phase20-publish-key-0001' });
  return { project, release, snapshot };
}

describe('Phase 20 Creator Ecosystem', () => {
  it('publishes an immutable public snapshot without turning source public, and supports idempotent retry', () => {
    const { lab, service } = setup();
    const { project, snapshot } = publish(service, lab);
    expect(service.publishProject(alice, project.id, { idempotencyKey: 'phase20-publish-key-0001' }).id).toBe(snapshot.id);
    const publicProject = service.getProjectDetail(null, project.id);
    expect(publicProject.latestSnapshot).toMatchObject({ id: snapshot.id, projectName: 'Creator map' });
    expect(publicProject.viewer.canViewSource).toBe(false);
    expect(() => service.readSource(bob, project.id, 'README.md')).toThrow(/Source is not available/i);
    service.unpublishProject(alice, project.id);
    expect(() => service.getProjectDetail(null, project.id)).toThrow(/not found/i);
  });

  it('issues a short-lived download ticket only after server visibility checks, never a reusable public URL', () => {
    const { lab, service } = setup();
    const { project, release } = publish(service, lab);
    const asset = service.registerReleaseAsset(alice, project.id, {
      releaseId: release.id,
      name: 'creator-map.zip',
      sizeBytes: 64,
      checksum: 'a'.repeat(64),
      contentType: 'application/zip',
    });
    const grant = service.requestDownload(bob, project.id, asset.id);
    expect(grant.downloadToken).not.toContain('http');
    expect(service.redeemDownload(bob, grant.downloadToken)).toMatchObject({ id: asset.id, projectId: project.id });
    expect(() => service.redeemDownload(alice, grant.downloadToken)).toThrow(/not found/i);
  });

  it('keeps public search public-only and routes search before generic project detail matching', async () => {
    const { lab, api, service } = setup();
    const { project } = publish(service, lab);
    const result = await api.handle({ method: 'GET', path: '/v1/public/creator-projects/search', query: { q: 'creator' } });
    expect(result.status).toBe(200);
    expect(result.body).toMatchObject({ data: [{ project: { id: project.id } }] });
    const forged = await api.handle({ method: 'PATCH', path: `/v1/creator-ecosystem/projects/${project.id}/metadata`, principal: bob, body: { projectVisibility: 'PRIVATE', ownerId: 'alice' } });
    expect(forged.status).toBe(400);
  });
});
