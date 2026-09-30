import { describe, expect, it } from 'vitest';

import type { AuthenticatedPrincipal } from '@me-zip/shared-types';

import { GitHubOAuthConnector, InMemoryGitHubCredentialVault } from './github-oauth.js';

const owner: AuthenticatedPrincipal = {
  userId: 'github-owner',
  sessionId: 'github-session',
  roles: ['USER'],
  issuedAt: '2026-08-18T00:00:00.000Z',
};

describe('GitHubOAuthConnector', () => {
  it('keeps the client secret and access token server-side', async () => {
    const vault = new InMemoryGitHubCredentialVault();
    const connector = new GitHubOAuthConnector({
      clientId: 'github-client-id',
      clientSecret: 'github-client-secret',
      callbackUrl: 'https://mezip.example.com/v1/creator/github/callback',
      credentialVault: vault,
      fetcher: async (url) => {
        const target = typeof url === 'string' ? url : url.toString();
        if (target.includes('access_token')) {
          return new Response(JSON.stringify({ access_token: 'private-token' }), { status: 200 });
        }
        if (target.endsWith('/user')) {
          return new Response(JSON.stringify({ login: 'octo-owner' }), { status: 200 });
        }
        return new Response('# README', { status: 200 });
      },
    });
    const handoff = await connector.beginAuthorization({ ownerId: owner.userId, state: 'github-state-with-at-least-sixteen-chars' });
    expect(handoff.authorizationUrl).toContain('client_id=github-client-id');
    expect(handoff.authorizationUrl).not.toContain('github-client-secret');
    const completed = await connector.completeAuthorization({
      ownerId: owner.userId,
      connectionId: 'connection-1',
      state: 'github-state-with-at-least-sixteen-chars',
      code: 'authorization-code',
    });
    expect(completed).toEqual({ accountLabel: 'octo-owner' });
    expect(await vault.get({ ownerId: owner.userId, connectionId: 'connection-1' })).toBe('private-token');
    expect(JSON.stringify(completed)).not.toContain('private-token');
  });
});
