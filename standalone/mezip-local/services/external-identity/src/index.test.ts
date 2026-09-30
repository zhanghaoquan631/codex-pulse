import { describe, expect, it } from 'vitest';
import type { AuthenticatedPrincipal } from '@me-zip/shared-types';
import {
  createExternalIdentityService,
  ExternalIdentityError,
  InMemoryExternalIdentityCredentialVault,
  type ExternalIdentityOAuthProvider,
} from './index.js';

const alice: AuthenticatedPrincipal = { userId: 'alice', sessionId: 'alice-session', roles: [], issuedAt: '2026-08-20T00:00:00.000Z' };
const bob: AuthenticatedPrincipal = { userId: 'bob', sessionId: 'bob-session', roles: [], issuedAt: '2026-08-20T00:00:00.000Z' };

const githubProvider: ExternalIdentityOAuthProvider = {
  provider: 'GITHUB',
  officiallyVerified: true,
  officialCapabilityReference: 'https://docs.github.com/en/apps/oauth-apps/building-oauth-apps/authorizing-oauth-apps',
  requestedScopes: ['read:user'],
  async begin({ state }) {
    return { authorizationUrl: `https://github.com/login/oauth/authorize?state=${encodeURIComponent(state)}` };
  },
  async complete() {
    return {
      providerAccountId: '1001',
      displayName: 'Alice on GitHub',
      handle: 'alice',
      publicUrl: 'https://github.com/alice',
      avatarUrl: 'https://avatars.githubusercontent.com/u/1001',
      description: 'Public developer profile',
      encryptedCredential: 'ciphertext:server-only',
      expiresAt: null,
      requestedScopes: ['read:user'],
    };
  },
};

describe('ExternalIdentityService', () => {
  it('keeps identities private by default and public projection omits owner, QR and credentials', () => {
    const service = createExternalIdentityService({
      qrMediaAuthorizer: { assertOwnerAuthorized: ({ ownerId, mediaId }) => {
        if (ownerId !== 'alice' || mediaId !== '11111111-1111-4111-8111-111111111111') throw new ExternalIdentityError('FORBIDDEN', 'Media is unavailable.');
      } },
    });
    const wechat = service.createManualIdentity(alice, {
      provider: 'WECHAT', displayName: 'Alice', wechatId: 'alice-wechat', qrMediaId: '11111111-1111-4111-8111-111111111111', contactPreference: 'SHOW_QR',
    });
    expect(wechat.visibility).toBe('PRIVATE');
    expect(service.getPublicProfile('alice')).toEqual([]);

    service.setVisibility(alice, wechat.id, 'PUBLIC');
    const publicIdentity = service.getPublicProfile('alice')[0]!;
    expect(publicIdentity).toMatchObject({ provider: 'WECHAT', displayName: 'Alice' });
    expect(publicIdentity).not.toHaveProperty('ownerId');
    expect(publicIdentity).not.toHaveProperty('qrMediaId');
    expect(JSON.stringify(publicIdentity)).not.toContain('ciphertext');
  });

  it('does not accept a WeChat QR identifier unless a trusted Media owner check exists', () => {
    const service = createExternalIdentityService();
    expect(() => service.createManualIdentity(alice, {
      provider: 'WECHAT', displayName: 'Alice', qrMediaId: '11111111-1111-4111-8111-111111111111',
    })).toThrow(/Media service/u);
  });

  it('enforces owner scope and account-switch isolation for identity and launch operations', () => {
    const service = createExternalIdentityService();
    const identity = service.createManualIdentity(alice, {
      provider: 'X', displayName: 'Alice', handle: 'alice', publicUrl: 'https://x.com/alice',
    });
    expect(service.listIdentities(bob)).toEqual([]);
    expect(() => service.updateIdentity(bob, identity.id, { description: 'nope' })).toThrow(ExternalIdentityError);
    expect(() => service.launch(bob, identity.id, 'OPEN')).toThrow(ExternalIdentityError);
    expect(service.launch(alice, identity.id, 'OPEN')).toMatchObject({ action: 'OPEN_HTTPS', href: 'https://x.com/alice' });
  });

  it('validates provider-specific URLs and rejects dangerous or cross-provider URLs', () => {
    const service = createExternalIdentityService();
    expect(() => service.createManualIdentity(alice, {
      provider: 'X', displayName: 'X', publicUrl: 'javascript:alert(1)',
    })).toThrow(/HTTPS URL/u);
    expect(() => service.createManualIdentity(alice, {
      provider: 'GITHUB', displayName: 'GitHub', publicUrl: 'https://evil.example/github',
    })).toThrow(/github.com/u);
    expect(() => service.createManualIdentity(alice, {
      provider: 'CHATGPT', displayName: 'GPT', publicUrl: 'https://localhost/g/example',
    })).toThrow(/HTTPS URL/u);
    expect(() => service.createManualIdentity(alice, {
      provider: 'HONOR_OF_KINGS', displayName: 'Alice game', publicUrl: 'https://example.com/game',
    })).toThrow(/does not have/u);
  });

  it('creates manual provider identities without pretending they are live OAuth connections', () => {
    const service = createExternalIdentityService();
    const x = service.createManualIdentity(alice, { provider: 'X', displayName: 'Alice', publicUrl: 'https://x.com/alice' });
    const game = service.createManualIdentity(alice, { provider: 'HONOR_OF_KINGS', displayName: 'Alice', gameId: '12345', rank: 'Master' });
    expect(x.connectionStatus).toBe('LINK_ONLY');
    expect(game.connectionStatus).toBe('MANUAL_PROFILE');
    expect(service.listProviders().find((item) => item.provider === 'GITHUB')?.connectionStatus).toBe('PRODUCTION_PENDING');
  });

  it('requires registered redirect, state and PKCE for OAuth and never returns credentials', async () => {
    const service = createExternalIdentityService({
      oauthProviders: { GITHUB: githubProvider },
      credentialVault: new InMemoryExternalIdentityCredentialVault(),
      allowedRedirectUris: ['https://mezip.example/oauth/github'],
    });
    await expect(service.startOAuth(alice, {
      provider: 'GITHUB', redirectUri: 'https://attacker.example/callback',
    })).rejects.toMatchObject({ code: 'NOT_CONFIGURED' });
    const start = await service.startOAuth(alice, {
      provider: 'GITHUB', redirectUri: 'https://mezip.example/oauth/github',
    });
    await expect(service.completeOAuth(bob, {
      provider: 'GITHUB', state: start.state, code: 'code', redirectUri: 'https://mezip.example/oauth/github',
    })).rejects.toMatchObject({ code: 'OAUTH_STATE_INVALID' });
    const second = await service.startOAuth(alice, {
      provider: 'GITHUB', redirectUri: 'https://mezip.example/oauth/github',
    });
    const identity = await service.completeOAuth(alice, {
      provider: 'GITHUB', state: second.state, code: 'code', redirectUri: 'https://mezip.example/oauth/github',
    });
    expect(identity.connectionStatus).toBe('CONNECTED');
    expect(identity).not.toHaveProperty('accessToken');
    expect(JSON.stringify(service.listConnections(alice))).not.toContain('ciphertext');
    await expect(service.disconnect(bob, identity.id)).rejects.toMatchObject({ code: 'NOT_FOUND' });
    expect((await service.disconnect(alice, identity.id)).connectionStatus).toBe('LINK_ONLY');
  });

  it('rejects OAuth providers that return an unapproved authorization URL', async () => {
    const service = createExternalIdentityService({
      allowedRedirectUris: ['https://mezip.example/oauth/x'],
      oauthProviders: {
        X: {
          provider: 'X', officiallyVerified: true, officialCapabilityReference: 'https://docs.x.com/', requestedScopes: ['users.read'],
          async begin() { return { authorizationUrl: 'https://evil.example/authorize' }; },
          async complete() { throw new Error('not reached'); },
        },
      },
    });
    await expect(service.startOAuth(alice, { provider: 'X', redirectUri: 'https://mezip.example/oauth/x' }))
      .rejects.toMatchObject({ code: 'NOT_CONFIGURED' });
  });

  it('orders only the current user identities and preserves idempotent manual creation', () => {
    const service = createExternalIdentityService();
    const input = { provider: 'CHATGPT' as const, displayName: 'My GPT', publicUrl: 'https://chatgpt.com/g/g-example' };
    const first = service.createManualIdentity(alice, input, 'create-1');
    const replay = service.createManualIdentity(alice, input, 'create-1');
    service.createManualIdentity(bob, { provider: 'X', displayName: 'Bob', publicUrl: 'https://x.com/bob' });
    expect(replay.id).toBe(first.id);
    expect(() => service.reorder(alice, [first.id, 'missing'])).toThrow(/exactly once/u);
    expect(service.reorder(alice, [first.id]).map((identity) => identity.id)).toEqual([first.id]);
  });
});
