import { describe, expect, it } from 'vitest';
import type { AuthenticatedPrincipal } from '@me-zip/shared-types';
import { CreatorLabError, CreatorLabService } from './index.js';

const alice: AuthenticatedPrincipal = { userId: 'alice', sessionId: 'session-a', roles: [], issuedAt: '2026-08-18T00:00:00.000Z' };
const bob: AuthenticatedPrincipal = { userId: 'bob', sessionId: 'session-b', roles: [], issuedAt: '2026-08-18T00:00:00.000Z' };
const root: AuthenticatedPrincipal = { userId: 'root', sessionId: 'session-root', roles: ['ORIGINAL_DEVELOPER_ROOT'], issuedAt: '2026-08-18T00:00:00.000Z' };

function service(options: { readonly access?: boolean; readonly vibe?: boolean; readonly download?: boolean } = {}) {
  let sequence = 0;
  return new CreatorLabService({
    entitlementResolver: { has: (_principal, capability) => capability === 'CREATOR_LAB_ACCESS' ? options.access ?? true : capability === 'VIBE_CODING_ACCESS' ? options.vibe ?? true : capability === 'CODE_DOWNLOAD_ACCESS' ? options.download ?? true : capability === 'CODE_HUB_ACCESS' },
    id: () => `id-${++sequence}`,
    now: () => '2026-08-18T00:00:00.000Z',
  });
}

describe('CreatorLabService', () => {
  it('enforces entitlement and creates a private project with a safe template', () => {
    const locked = service({ access: false });
    expect(() => locked.createProject(alice, { name: 'Locked', description: '', type: 'WEB', visibility: 'PRIVATE' })).toThrowError(/entitlement/i);
    const creator = service();
    const project = creator.createProject(alice, { name: 'Player', description: 'demo', type: 'WEB', visibility: 'PRIVATE', template: 'REACT_WEB' });
    expect(project.ownerId).toBe('alice');
    expect(creator.listFiles(alice, project.id).map((file) => file.path)).toEqual(['README.md', 'src/App.tsx']);
    expect(() => creator.getProject(bob, project.id)).toThrowError(CreatorLabError);
  });

  it('blocks traversal and sensitive paths/content', () => {
    const creator = service();
    const project = creator.createProject(alice, { name: 'Safe', description: '', type: 'SCRIPT', visibility: 'PRIVATE' });
    expect(() => creator.createFile(alice, project.id, { path: '../escape.ts', kind: 'FILE', content: 'x' })).toThrowError(/unsafe/i);
    expect(() => creator.createFile(alice, project.id, { path: '.env', kind: 'FILE', content: 'x' })).toThrowError(/unsafe/i);
    expect(() => creator.createFile(alice, project.id, { path: 'src/key.ts', kind: 'FILE', content: 'const apiKey = "secret";' })).toThrowError(/secret/i);
  });

  it('protects versions, snapshots and rollback', () => {
    const creator = service();
    const project = creator.createProject(alice, { name: 'Versioned', description: '', type: 'WEB', visibility: 'PRIVATE' });
    const file = creator.readFile(alice, project.id, 'README.md');
    const updated = creator.updateFile(alice, project.id, { path: 'README.md', content: '# Changed\n', expectedChecksum: file.checksum, expectedVersion: project.workspaceVersion });
    expect(updated.checksum).not.toBe(file.checksum);
    expect(() => creator.updateFile(alice, project.id, { path: 'README.md', content: '# Conflict', expectedChecksum: file.checksum, expectedVersion: project.workspaceVersion })).toThrowError(/changed|conflict/i);
    const snapshot = creator.createSnapshot(alice, project.id, 'MANUAL');
    creator.updateFile(alice, project.id, { path: 'README.md', content: '# Newer\n', expectedChecksum: updated.checksum, expectedVersion: project.workspaceVersion + 1 });
    creator.restoreSnapshot(alice, snapshot.id);
    expect(creator.readFile(alice, project.id, 'README.md').content).toBe('# Changed\n');
  });

  it('keeps AI changes as proposals until explicit safe apply and supports rollback', () => {
    const creator = service();
    const project = creator.createProject(alice, { name: 'AI', description: '', type: 'WEB', visibility: 'PRIVATE' });
    const proposal = creator.proposeAIChange(alice, project.id, { request: 'Add a title', scopePaths: ['README.md'], expectedVersion: project.workspaceVersion, files: [{ path: 'README.md', operation: 'UPDATE', nextPath: null, expectedChecksum: creator.readFile(alice, project.id, 'README.md').checksum, content: '# AI title\n' }] });
    expect(proposal.status).toBe('PROPOSED');
    expect(creator.readFile(alice, project.id, 'README.md').content).toContain('Created in');
    const applied = creator.applyAIChange(alice, proposal.id, project.workspaceVersion);
    expect(applied.status).toBe('APPLIED');
    expect(creator.readFile(alice, project.id, 'README.md').content).toBe('# AI title\n');
    const rolledBack = creator.rollbackAIChange(alice, proposal.id);
    expect(rolledBack.status).toBe('ROLLED_BACK');
    expect(creator.readFile(alice, project.id, 'README.md').content).toContain('Created in');
  });

  it('supports structured git status/commit, release, export and Root audit boundary', () => {
    const audit: unknown[] = [];
    const creator = new CreatorLabService({ entitlementResolver: { has: () => true }, audit: { append: (event) => audit.push(event) }, id: (() => { let n = 0; return () => `id-${++n}`; })(), now: () => '2026-08-18T00:00:00.000Z' });
    const project = creator.createProject(alice, { name: 'Release', description: '', type: 'LIBRARY', visibility: 'PRIVATE' });
    const status = creator.gitStatus(alice, project.id);
    expect(status.clean).toBe(true);
    const commit = creator.gitCommit(alice, project.id, 'initial', project.workspaceVersion, []);
    expect(commit.message).toBe('initial');
    const release = creator.createRelease(alice, project.id, { version: '1.0.0', title: 'First', notes: '', sourceCommitId: commit.id });
    expect(creator.publishRelease(alice, release.id).status).toBe('PUBLISHED');
    const exported = creator.exportProject(alice, project.id);
    expect(exported.format).toBe('ZIP');
    expect(() => creator.getProject(bob, project.id)).toThrowError();
    expect(creator.getProject(root, project.id).id).toBe(project.id);
    expect(audit.length).toBeGreaterThan(0);
  });

  it('uses a server-only OAuth handoff and exposes only the caller connection projection', async () => {
    const calls: unknown[] = [];
    const creator = new CreatorLabService({
      entitlementResolver: { has: () => true },
      githubConnector: { importRepository: async () => [] },
      githubAuthorizationGateway: {
        beginAuthorization: async (input) => {
          calls.push(input);
          return { authorizationUrl: 'https://github.com/login/oauth/authorize?state=test', expiresAt: '2026-08-18T00:10:00.000Z' };
        },
        completeAuthorization: async (input) => {
          calls.push(input);
          return { accountLabel: 'octo-owner' };
        },
      },
      now: () => '2026-08-18T00:00:00.000Z',
      id: (() => { let n = 0; return () => `github-id-${++n}`; })(),
    });
    const handoff = await creator.beginGitHubAuthorization(alice);
    expect(handoff.authorizationUrl).toContain('github.com');
    const state = (calls[0] as { state: string }).state;
    await expect(creator.completeGitHubAuthorization(bob, { state, code: 'foreign-code' })).rejects.toThrowError(CreatorLabError);
    const connected = await creator.completeGitHubAuthorization(alice, { state, code: 'server-only-code' });
    expect(connected).toMatchObject({ ownerId: alice.userId, accountLabel: 'octo-owner', status: 'CONNECTED' });
    expect(creator.getGitHubConnection(alice)).toEqual(connected);
    expect(creator.getGitHubConnection(bob)).toBeNull();
    expect(JSON.stringify(connected)).not.toContain('server-only-code');
  });
});
