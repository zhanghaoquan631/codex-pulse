import { describe, expect, it } from 'vitest';
import type { AuthenticatedPrincipal } from '@me-zip/shared-types';
import {
  GITHUB_OFFICIAL_URL,
  GitHubWorkspaceError,
  GitHubWorkspaceService,
  InMemoryGitHubWorkspacePersistence,
  type GitHubWorkspaceProvider,
} from './github-workspace.js';
import type {
  GitHubBranchSummary,
  GitHubCommitSummary,
  GitHubRepositoryContent,
  GitHubWorkspaceConnection,
  GitHubWorkspaceSnapshot,
} from './types.js';

const principal = (userId: string): AuthenticatedPrincipal => ({
  userId,
  sessionId: `session-${userId}`,
  roles: ['USER'],
  issuedAt: '2026-08-21T00:00:00.000Z',
});

class MockProvider implements GitHubWorkspaceProvider {
  public readonly productionSafe = false;
  public syncCalls = 0;
  public disconnected: string[] = [];
  public states: string[] = [];

  public async beginAuthorization(input: {
    readonly ownerId: string;
    readonly state: string;
  }) {
    this.states.push(`${input.ownerId}:${input.state}`);
    return {
      authorizationUrl: `https://github.com/login/oauth/authorize?client_id=test&state=${encodeURIComponent(input.state)}`,
      expiresAt: '2026-08-21T00:10:00.000Z',
    };
  }

  public async completeAuthorization(input: {
    readonly ownerId: string;
    readonly state: string;
    readonly code: string;
    readonly installationId?: string;
  }): Promise<GitHubWorkspaceConnection> {
    return {
      id: `connection-${input.ownerId}`,
      githubUserId: input.ownerId === 'alice' ? '101' : '202',
      githubLogin: input.ownerId,
      githubAvatarUrl: null,
      installationId: input.installationId ?? '501',
      status: 'CONNECTED',
      repositorySelection: 'SELECTED',
      authorizedRepositoryCount: 0,
      connectedAt: '2026-08-21T00:00:00.000Z',
      updatedAt: '2026-08-21T00:00:00.000Z',
      lastSyncedAt: null,
      syncStatus: 'IDLE',
      rateLimitRemaining: null,
      rateLimitResetAt: null,
    };
  }

  public async disconnect(input: {
    readonly ownerId: string;
    readonly connectionId: string;
  }): Promise<void> {
    this.disconnected.push(`${input.ownerId}:${input.connectionId}`);
  }

  public async sync(input: {
    readonly ownerId: string;
    readonly connection: GitHubWorkspaceConnection;
  }): Promise<GitHubWorkspaceSnapshot> {
    this.syncCalls += 1;
    return {
      repositories: [
        {
          githubId: `repo-${input.ownerId}`,
          owner: input.connection.githubLogin,
          name: 'private-notes',
          fullName: `${input.connection.githubLogin}/private-notes`,
          description: 'owner-only repository',
          visibility: 'PRIVATE',
          private: true,
          archived: false,
          fork: false,
          language: 'TypeScript',
          stars: 0,
          forks: 0,
          issuesCount: 1,
          defaultBranch: 'main',
          htmlUrl: `https://github.com/${input.connection.githubLogin}/private-notes`,
          updatedAt: '2026-08-20T23:00:00.000Z',
          syncedAt: '2026-08-21T00:00:00.000Z',
        },
      ],
      issues: [
        {
          githubId: `issue-${input.ownerId}`,
          repositoryFullName: `${input.connection.githubLogin}/private-notes`,
          number: 1,
          title: 'Keep this private',
          body: 'private issue body',
          state: 'OPEN',
          labels: [{ name: 'security', color: 'f85149' }],
          assignees: [input.connection.githubLogin],
          author: input.connection.githubLogin,
          commentsCount: 0,
          htmlUrl: `https://github.com/${input.connection.githubLogin}/private-notes/issues/1`,
          createdAt: '2026-08-20T22:00:00.000Z',
          updatedAt: '2026-08-20T23:00:00.000Z',
        },
      ],
      pullRequests: [],
      activity: [],
      contributions: {
        year: 2026,
        total: 1,
        currentStreak: 1,
        longestStreak: 1,
        days: [{ date: '2026-08-21', count: 1 }],
      },
      rateLimitRemaining: 4999,
      rateLimitResetAt: '2026-08-21T01:00:00.000Z',
      partial: false,
    };
  }

  public async readRepositoryContent(input: {
    readonly ownerId: string;
    readonly connection: GitHubWorkspaceConnection;
    readonly repositoryFullName: string;
    readonly path: string;
  }): Promise<GitHubRepositoryContent> {
    return {
      repositoryFullName: input.repositoryFullName,
      path: input.path,
      kind: 'FILE',
      sizeBytes: 6,
      sha: 'abc',
      htmlUrl: GITHUB_OFFICIAL_URL,
      downloadUrl: null,
      content: 'secret',
      entries: [],
    };
  }

  public async listCommits(): Promise<readonly GitHubCommitSummary[]> {
    return [];
  }
  public async listBranches(): Promise<readonly GitHubBranchSummary[]> {
    return [];
  }
}

const connectedService = async (userId = 'alice') => {
  const provider = new MockProvider();
  let id = 0;
  const service = new GitHubWorkspaceService({
    provider,
    persistence: new InMemoryGitHubWorkspacePersistence(),
    deploymentMode: 'TEST',
    now: () => '2026-08-21T00:00:00.000Z',
    state: () => 'state-with-at-least-thirty-two-characters-1234',
    id: () => `id-${++id}`,
    syncTtlMs: 0,
  });
  const actor = principal(userId);
  const start = await service.beginConnection(actor);
  const state = new URL(start.authorizationUrl).searchParams.get('state')!;
  await service.completeConnection(actor, {
    state,
    code: 'oauth-code',
    installationId: '501',
  });
  return { provider, service, actor, state };
};

describe('GitHubWorkspaceService', () => {
  it('rejects local persistence/provider in production', () => {
    expect(
      () =>
        new GitHubWorkspaceService({
          provider: new MockProvider(),
          persistence: new InMemoryGitHubWorkspacePersistence(),
          deploymentMode: 'PRODUCTION',
        }),
    ).toThrow(/durable owner storage/u);
  });

  it('uses owner-bound, single-use OAuth state and never treats github.com as a username', async () => {
    const provider = new MockProvider();
    const persistence = new InMemoryGitHubWorkspacePersistence();
    const service = new GitHubWorkspaceService({
      provider,
      persistence,
      deploymentMode: 'TEST',
      now: () => '2026-08-21T00:00:00.000Z',
      state: () => 'state-with-at-least-thirty-two-characters-1234',
    });
    const start = await service.beginConnection(principal('alice'));
    expect(start.authorizationUrl).toMatch(
      /^https:\/\/github\.com\/login\/oauth\/authorize/u,
    );
    const state = new URL(start.authorizationUrl).searchParams.get('state')!;
    await expect(
      service.completeConnection(principal('bob'), { state, code: 'code' }),
    ).rejects.toMatchObject({ code: 'NOT_FOUND' });
    const connected = await service.completeConnection(principal('alice'), {
      state,
      code: 'code',
      installationId: '501',
    });
    expect(connected.githubLogin).toBe('alice');
    await expect(
      service.completeConnection(principal('alice'), {
        state,
        code: 'code',
        installationId: '501',
      }),
    ).rejects.toMatchObject({ code: 'NOT_FOUND' });
  });

  it('keeps private repositories, issues and code isolated by principal', async () => {
    const { service, actor } = await connectedService('alice');
    await service.sync(actor, 'sync-alice-0001');
    expect((await service.listRepositories(actor)).items[0]?.private).toBe(true);
    expect((await service.listIssues(actor))[0]?.body).toBe('private issue body');
    await expect(
      service.getRepository(principal('bob'), 'alice/private-notes'),
    ).rejects.toMatchObject({ code: 'AUTH_REQUIRED' });
    await expect(
      service.readRepositoryContent(
        principal('bob'),
        'alice/private-notes',
        'secret.txt',
      ),
    ).rejects.toMatchObject({ code: 'AUTH_REQUIRED' });
  });

  it('deduplicates sync and snippet writes with conflict-safe idempotency', async () => {
    const { provider, service, actor } = await connectedService();
    await service.sync(actor, 'sync-alice-0001');
    await service.sync(actor, 'sync-alice-0001');
    expect(provider.syncCalls).toBe(1);
    const input = {
      title: 'Fetch helper',
      language: 'TypeScript',
      content: 'export const ok = true;',
      idempotencyKey: 'snippet-alice-0001',
    };
    const first = await service.createSnippet(actor, input);
    const replay = await service.createSnippet(actor, input);
    expect(replay.id).toBe(first.id);
    await expect(
      service.createSnippet(actor, { ...input, title: 'Different' }),
    ).rejects.toMatchObject({ code: 'CONFLICT' });
    expect((await service.listSnippets(actor)).length).toBe(1);
  });

  it('maps GitHub issues into local task state without pretending to mutate GitHub', async () => {
    const { service, actor } = await connectedService();
    await service.sync(actor, 'sync-alice-0001');
    const task = (await service.listTasks(actor))[0]!;
    expect(task.source).toBe('GITHUB_ISSUE');
    const updated = await service.updateTaskStatus(actor, {
      taskId: task.id,
      status: 'IN_PROGRESS',
      idempotencyKey: 'task-alice-00001',
    });
    expect(updated.status).toBe('IN_PROGRESS');
    expect((await service.listIssues(actor))[0]?.state).toBe('OPEN');
  });

  it('keeps pull request reads owner-scoped and repository-scoped', async () => {
    const { service, actor } = await connectedService();
    await service.sync(actor, 'sync-alice-0001');
    expect(await service.listPullRequests(actor)).toEqual([]);
    await expect(service.listPullRequests(principal('bob'))).rejects.toMatchObject({
      code: 'AUTH_REQUIRED',
    });
  });

  it('removes owner projection and credential through provider on disconnect', async () => {
    const { provider, service, actor } = await connectedService();
    await service.disconnect(actor);
    expect(provider.disconnected).toEqual(['alice:connection-alice']);
    expect(await service.getConnection(actor)).toBeNull();
  });

  it('uses the exact official GitHub fallback URL', () => {
    expect(GITHUB_OFFICIAL_URL).toBe('https://github.com/');
  });

  it('surfaces typed validation errors', async () => {
    const { service, actor } = await connectedService();
    await expect(service.search(actor, '')).rejects.toBeInstanceOf(
      GitHubWorkspaceError,
    );
  });
});
