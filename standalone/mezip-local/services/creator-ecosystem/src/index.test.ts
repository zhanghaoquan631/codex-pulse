import { describe, expect, it } from 'vitest';
import { CreatorLabService } from '@me-zip/creator-lab';
import type { AuthenticatedPrincipal, CreatorReleaseAsset } from '@me-zip/shared-types';
import { CreatorLabEcosystemProjectGateway, CreatorEcosystemError, CreatorEcosystemService, type CreatorProjectSaveStore } from './index.js';

const alice: AuthenticatedPrincipal = { userId: 'alice', sessionId: 'alice-session', roles: [], issuedAt: '2026-08-20T00:00:00.000Z' };
const bob: AuthenticatedPrincipal = { userId: 'bob', sessionId: 'bob-session', roles: [], issuedAt: '2026-08-20T00:00:00.000Z' };

function setup(options: { readonly withSaves?: boolean; readonly now?: () => string } = {}) {
  let sequence = 0;
  const lab = new CreatorLabService({
    entitlementResolver: { has: () => true },
    id: () => `lab-${++sequence}`,
    now: options.now ?? (() => '2026-08-20T00:00:00.000Z'),
  });
  const saves = new Map<string, boolean>();
  const follows = new Set<string>();
  const saveStore = options.withSaves === true ? {
    setSaved: ({ principal, projectId, saved }: { readonly principal: AuthenticatedPrincipal; readonly projectId: string; readonly snapshotId: string; readonly saved: boolean; readonly idempotencyKey: string }) => { saves.set(`${principal.userId}:${projectId}`, saved); return saved; },
    isSaved: ({ principal, projectId }: { readonly principal: AuthenticatedPrincipal; readonly projectId: string }) => saves.get(`${principal.userId}:${projectId}`) === true,
    aggregateCount: (projectId: string) => [...saves.entries()].filter(([key, saved]) => saved && key.endsWith(`:${projectId}`)).length,
  } satisfies CreatorProjectSaveStore : undefined;
  const service = new CreatorEcosystemService({
    projects: new CreatorLabEcosystemProjectGateway(lab),
    entitlements: { has: (principal, capability) => capability === 'CREATOR_LAB_ACCESS' || principal.userId === 'bob' && capability === 'CODE_HUB_ACCESS' || capability === 'RELEASE_DOWNLOAD' },
    id: () => `ecosystem-${++sequence}`,
    token: () => `token-${++sequence}`,
    now: options.now ?? (() => '2026-08-20T00:00:00.000Z'),
    ...(saveStore === undefined ? {} : { saves: saveStore }),
    follows: {
      setFollow: ({ principal, creatorId, followed }) => { const key = `${principal.userId}:${creatorId}`; if (followed) follows.add(key); else follows.delete(key); return followed; },
      isFollowing: ({ principal, creatorId }) => follows.has(`${principal.userId}:${creatorId}`),
      followerCount: (creatorId) => [...follows].filter((key) => key.endsWith(`:${creatorId}`)).length,
    },
  });
  return { lab, service };
}

function preparePublishedProject(service: CreatorEcosystemService, lab: CreatorLabService) {
  const project = lab.createProject(alice, { name: 'Night map', description: 'A private-first visual map.', type: 'WEB', visibility: 'PRIVATE' });
  service.updateProfile(alice, { username: 'tom', displayName: 'Tom', profileVisibility: 'PUBLIC' });
  service.updateProjectMetadata(alice, project.id, { tags: ['design'], technologies: ['TypeScript'], projectVisibility: 'PUBLIC', sourceVisibility: 'PRIVATE', downloadVisibility: 'PUBLIC' });
  const release = lab.createRelease(alice, project.id, { version: '1.0.0', title: 'First', notes: 'Safe release notes.', sourceCommitId: null });
  lab.publishRelease(alice, release.id);
  const snapshot = service.publishProject(alice, project.id, { releaseId: release.id, idempotencyKey: 'publish-project-0001' });
  return { project, release, snapshot };
}

describe('CreatorEcosystemService', () => {
  it('publishes an immutable public snapshot while preserving source privacy and account isolation', () => {
    const { lab, service } = setup();
    const { project, snapshot } = preparePublishedProject(service, lab);
    const publicDetail = service.getProjectDetail(null, project.id);
    expect(publicDetail.latestSnapshot).toMatchObject({ id: snapshot.id, projectName: 'Night map' });
    expect(publicDetail.viewer.canViewSource).toBe(false);
    service.updateProjectMetadata(alice, project.id, { tags: ['changed-after-publish'] });
    expect(service.getProjectDetail(null, project.id).metadata.tags).toEqual(['design']);
    expect(() => service.readSource(bob, project.id, 'README.md')).toThrowError(CreatorEcosystemError);
    expect(service.readSource(alice, project.id, 'README.md')).toMatchObject({ state: 'TEXT' });
    expect(() => service.updateProjectMetadata(bob, project.id, { projectVisibility: 'PRIVATE' })).toThrowError(CreatorEcosystemError);
    expect(() => service.getProjectDetail(null, 'missing')).toThrowError(CreatorEcosystemError);
  });

  it('uses server-side entitlement truth for separately gated source and short-lived downloads', () => {
    let now = '2026-08-20T00:00:00.000Z';
    const { lab, service } = setup({ now: () => now });
    const { project, release } = preparePublishedProject(service, lab);
    service.updateProjectMetadata(alice, project.id, { sourceVisibility: 'ENTITLEMENT_GATED' });
    expect(service.readSource(bob, project.id, 'README.md').content).toContain('Night map');
    const asset: CreatorReleaseAsset = service.registerReleaseAsset(alice, project.id, {
      releaseId: release.id,
      name: 'night-map.zip',
      sizeBytes: 32,
      checksum: 'a'.repeat(64),
      contentType: 'application/zip',
    });
    const grant = service.requestDownload(bob, project.id, asset.id);
    expect(service.redeemDownload(bob, grant.downloadToken).id).toBe(asset.id);
    expect(() => service.redeemDownload(alice, grant.downloadToken)).toThrowError(CreatorEcosystemError);
    now = '2026-08-20T00:11:00.000Z';
    expect(() => service.redeemDownload(bob, grant.downloadToken)).toThrowError(/expired/i);
  });

  it('keeps save private, reuses the follow graph, and preserves snapshot idempotency', () => {
    const { lab, service } = setup({ withSaves: true });
    const { project, snapshot } = preparePublishedProject(service, lab);
    expect(service.publishProject(alice, project.id, { idempotencyKey: 'publish-project-0001' }).id).toBe(snapshot.id);
    expect(service.saveProject(bob, project.id, true, 'save-project-0001')).toBe(true);
    expect(service.getStats(alice, project.id).projectSaves).toBe(1);
    expect(service.followCreator(bob, 'alice', true, 'follow-creator-001')).toBe(true);
    expect(service.getProjectDetail(bob, project.id).viewer).toMatchObject({ saved: true, followingCreator: true });
    expect(() => service.followCreator(alice, 'alice', true, 'self-follow-00001')).toThrowError(/cannot follow/i);
    expect(() => service.saveProject(alice, project.id, true, 'self-save-0000001')).toThrowError(/cannot save/i);
  });

  it('does not expose a project or creator through public search until the explicit public profile and snapshot exist', () => {
    const { lab, service } = setup();
    const project = lab.createProject(alice, { name: 'Hidden launch', description: 'No public record', type: 'WEB', visibility: 'PRIVATE' });
    service.updateProjectMetadata(alice, project.id, { projectVisibility: 'PUBLIC' });
    expect(() => service.publishProject(alice, project.id, { idempotencyKey: 'publish-project-0002' })).toThrowError(/Creator profile public/i);
    service.updateProfile(alice, { username: 'tom', displayName: 'Tom', profileVisibility: 'PUBLIC' });
    service.publishProject(alice, project.id, { idempotencyKey: 'publish-project-0002' });
    expect(service.searchProjects(null, 'hidden').map((detail) => detail.project.id)).toEqual([project.id]);
    service.unpublishProject(alice, project.id);
    expect(service.searchProjects(null, 'hidden')).toEqual([]);
  });
});
