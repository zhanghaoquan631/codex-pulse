import { randomBytes } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import {
  GitHubAppProvider,
  InMemoryGitHubAppCredentialVault,
} from './github-app-provider.js';
import type { GitHubWorkspaceConnection } from './types.js';

describe('GitHubAppProvider', () => {
  it('uses the official authorization endpoint with S256 PKCE and no secret', async () => {
    const provider = new GitHubAppProvider({
      appId: '12345',
      clientId: 'Iv1.test-client',
      clientSecret: 'server-only-secret',
      privateKey: 'server-only-private-key',
      webhookSecret: 'server-only-webhook-secret',
      callbackUrl: 'http://127.0.0.1:5174/api/integrations/github/callback',
      credentialVault: new InMemoryGitHubAppCredentialVault(),
      fetcher: async () => new Response('{}', { status: 500 }),
    });
    const challenge = randomBytes(32).toString('base64url');
    const start = await provider.beginAuthorization({
      ownerId: 'alice',
      state: randomBytes(32).toString('base64url'),
      codeChallenge: challenge,
    });
    const url = new URL(start.authorizationUrl);
    expect(url.origin).toBe('https://github.com');
    expect(url.pathname).toBe('/login/oauth/authorize');
    expect(url.searchParams.get('code_challenge')).toBe(challenge);
    expect(url.searchParams.get('code_challenge_method')).toBe('S256');
    expect(start.authorizationUrl).not.toContain('server-only-secret');
  });

  it('sends the verifier only to the official token exchange and stores the token in the vault', async () => {
    const calls: { readonly url: string; readonly body: string }[] = [];
    const vault = new InMemoryGitHubAppCredentialVault();
    const provider = new GitHubAppProvider({
      appId: '12345',
      clientId: 'Iv1.test-client',
      clientSecret: 'server-only-secret',
      privateKey: 'server-only-private-key',
      webhookSecret: 'server-only-webhook-secret',
      callbackUrl: 'http://127.0.0.1:5174/api/integrations/github/callback',
      credentialVault: vault,
      id: () => 'connection-1',
      now: () => '2026-08-21T00:00:00.000Z',
      fetcher: async (input, init) => {
        const url = String(input);
        calls.push({ url, body: String(init?.body ?? '') });
        if (url === 'https://github.com/login/oauth/access_token') {
          return Response.json({ access_token: 'github-user-token' });
        }
        if (url === 'https://api.github.com/user') {
          return Response.json({ id: 101, login: 'alice', avatar_url: null });
        }
        if (url === 'https://api.github.com/user/installations?per_page=100') {
          return Response.json({
            installations: [{ id: 501, repository_selection: 'selected' }],
          });
        }
        return new Response('{}', { status: 404 });
      },
    });
    const verifier = randomBytes(48).toString('base64url');
    const connected = await provider.completeAuthorization({
      ownerId: 'alice',
      state: randomBytes(32).toString('base64url'),
      code: 'official-code',
      codeVerifier: verifier,
      installationId: '501',
    });
    const tokenRequest = calls.find(
      (call) => call.url === 'https://github.com/login/oauth/access_token',
    );
    expect(new URLSearchParams(tokenRequest?.body).get('code_verifier')).toBe(verifier);
    expect(connected.githubLogin).toBe('alice');
    expect(await vault.get({ ownerId: 'alice', connectionId: 'connection-1' })).toBe(
      'github-user-token',
    );
    expect(JSON.stringify(connected)).not.toContain('github-user-token');
  });

  it('indexes small code files from authorized repositories as read-only snippets', async () => {
    const vault = new InMemoryGitHubAppCredentialVault();
    await vault.put({
      ownerId: 'alice',
      connectionId: 'connection-1',
      accessToken: 'github-user-token',
    });
    const connection: GitHubWorkspaceConnection = {
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
    const content = 'export const answer = 42;';
    const provider = new GitHubAppProvider({
      appId: '12345',
      clientId: 'Iv1.test-client',
      clientSecret: 'server-only-secret',
      privateKey: 'server-only-private-key',
      webhookSecret: 'server-only-webhook-secret',
      callbackUrl: 'http://127.0.0.1:5174/api/integrations/github/callback',
      credentialVault: vault,
      now: () => '2026-08-21T00:00:00.000Z',
      fetcher: async (input) => {
        const url = String(input);
        if (url.includes('/repositories?'))
          return Response.json({
            repositories: [
              {
                id: 1,
                full_name: 'alice/project',
                name: 'project',
                owner: { login: 'alice' },
                private: true,
                default_branch: 'main',
                html_url: 'https://github.com/alice/project',
                updated_at: '2026-08-20T00:00:00.000Z',
              },
            ],
          });
        if (url.includes('/issues?')) return Response.json([]);
        if (url.includes('/events?')) return Response.json([]);
        if (url.endsWith('/git/trees/main?recursive=1'))
          return Response.json({
            tree: [{ type: 'blob', path: 'src/example.ts', size: content.length }],
          });
        if (url.includes('/contents/src/example.ts?ref=main'))
          return Response.json({
            type: 'file',
            path: 'src/example.ts',
            size: content.length,
            sha: 'file-sha',
            encoding: 'base64',
            content: Buffer.from(content).toString('base64'),
            html_url: 'https://github.com/alice/project/blob/main/src/example.ts',
          });
        if (url === 'https://api.github.com/graphql')
          return Response.json({ data: { user: { contributionsCollection: {} } } });
        return new Response('{}', { status: 404 });
      },
    });
    const snapshot = await provider.sync({ ownerId: 'alice', connection });
    expect(snapshot.snippets).toHaveLength(1);
    expect(snapshot.snippets?.[0]).toMatchObject({
      source: 'REPOSITORY_FILE',
      title: 'src/example.ts',
      language: 'TypeScript',
      content,
      sourceUrl: 'https://github.com/alice/project/blob/main/src/example.ts',
    });
  });
});
