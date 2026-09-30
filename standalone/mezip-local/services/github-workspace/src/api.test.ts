import { describe, expect, it } from 'vitest';
import type { AuthenticatedPrincipal } from '@me-zip/shared-types';
import { GitHubWorkspaceApiAdapter } from './api.js';
import {
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

const alice: AuthenticatedPrincipal = {
  userId: 'alice',
  sessionId: 'session-alice',
  roles: ['USER'],
  issuedAt: '2026-08-21T00:00:00.000Z',
};

class ApiProvider implements GitHubWorkspaceProvider {
  public readonly productionSafe = false;
  public async beginAuthorization(input: { readonly state: string }) {
    return {
      authorizationUrl: `https://github.com/login/oauth/authorize?client_id=test&state=${input.state}`,
      expiresAt: '2026-08-21T00:10:00.000Z',
    };
  }
  public async completeAuthorization(): Promise<GitHubWorkspaceConnection> {
    return {
      id: 'connection-1',
      githubUserId: '101',
      githubLogin: 'alice',
      githubAvatarUrl: null,
      installationId: '501',
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
  public async disconnect(): Promise<void> {}
  public async sync(): Promise<GitHubWorkspaceSnapshot> {
    return {
      repositories: [],
      issues: [],
      pullRequests: [],
      activity: [],
      contributions: {
        year: 2026,
        total: null,
        currentStreak: null,
        longestStreak: null,
        days: [],
      },
      rateLimitRemaining: 5000,
      rateLimitResetAt: null,
      partial: false,
    };
  }
  public async readRepositoryContent(): Promise<GitHubRepositoryContent> {
    throw new Error('not used');
  }
  public async listCommits(): Promise<readonly GitHubCommitSummary[]> {
    return [];
  }
  public async listBranches(): Promise<readonly GitHubBranchSummary[]> {
    return [];
  }
}

const adapter = () =>
  new GitHubWorkspaceApiAdapter(
    new GitHubWorkspaceService({
      provider: new ApiProvider(),
      persistence: new InMemoryGitHubWorkspacePersistence(),
      deploymentMode: 'TEST',
      now: () => '2026-08-21T00:00:00.000Z',
      state: () => 'state-with-at-least-thirty-two-characters-1234',
    }),
  );

describe('GitHubWorkspaceApiAdapter', () => {
  it('requires a trusted principal and exposes no owner override', async () => {
    const api = adapter();
    expect(
      (
        await api.handle({
          method: 'GET',
          path: '/v1/github-workspace/connection',
          principal: null,
        })
      ).status,
    ).toBe(401);
    const response = await api.handle({
      method: 'POST',
      path: '/v1/github-workspace/connection/start',
      principal: alice,
      body: { ownerId: 'bob' },
    });
    expect(response).toMatchObject({
      status: 400,
      body: { error: { code: 'VALIDATION' } },
    });
  });

  it('returns a redirect only to the official GitHub authorization URL', async () => {
    const response = await adapter().handle({
      method: 'GET',
      path: '/api/integrations/github/connect',
      principal: alice,
    });
    expect(response.status).toBe(302);
    expect(response.headers?.Location).toMatch(
      /^https:\/\/github\.com\/login\/oauth\/authorize/u,
    );
    expect(response.headers?.Location).not.toContain('client_secret');
  });

  it('requires idempotency for sync and snippet writes', async () => {
    const api = adapter();
    expect(
      (
        await api.handle({
          method: 'POST',
          path: '/v1/github-workspace/sync',
          principal: alice,
          body: {},
        })
      ).status,
    ).toBe(400);
    expect(
      (
        await api.handle({
          method: 'POST',
          path: '/v1/github-workspace/snippets',
          principal: alice,
          body: { title: 'x', language: 'ts', content: 'x' },
        })
      ).status,
    ).toBe(400);
  });

  it('uses a fixed callback return path and rejects manipulated state', async () => {
    const api = adapter();
    const response = await api.handle({
      method: 'GET',
      path: '/api/integrations/github/callback',
      principal: alice,
      query: { state: 'attacker', code: 'code' },
    });
    expect(response).toMatchObject({
      status: 404,
      body: { error: { code: 'NOT_FOUND' } },
    });
  });

  it('returns a completed connection to the current V6 workspace entry', async () => {
    const api = adapter();
    const start = await api.handle({
      method: 'GET',
      path: '/api/integrations/github/connect',
      principal: alice,
    });
    const state = new URL(start.headers?.Location ?? '').searchParams.get('state');
    expect(state).not.toBeNull();
    const callback = await api.handle({
      method: 'GET',
      path: '/api/integrations/github/callback',
      principal: alice,
      query: { state: state!, code: 'official-oauth-code' },
    });
    expect(callback).toMatchObject({
      status: 302,
      headers: {
        Location: '/github-workspace-v6/index.html?connection=complete',
      },
    });
  });
});
