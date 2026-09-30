import { describe, expect, it } from 'vitest';

import type { AuthenticatedPrincipal } from '@me-zip/shared-types';
import {
  createExternalIdentityService,
  ExternalIdentityError,
  InMemoryExternalIdentityCredentialVault,
  type ExternalIdentityOAuthProvider,
} from '../../services/external-identity/src/index.js';

const alice: AuthenticatedPrincipal = {
  userId: '00000000-0000-4000-8000-000000000401', sessionId: 'session-alice', roles: ['USER'], issuedAt: '2026-08-20T00:00:00.000Z',
};
const bob: AuthenticatedPrincipal = {
  userId: '00000000-0000-4000-8000-000000000402', sessionId: 'session-bob', roles: ['USER'], issuedAt: '2026-08-20T00:00:00.000Z',
};

describe('Phase 19 Connected Apps / External Identity integration', () => {
  it('keeps identity owner-scoped, publishes only opted-in safe fields, and blocks QR leakage', () => {
    const service = createExternalIdentityService({
      qrMediaAuthorizer: { assertOwnerAuthorized: ({ ownerId, mediaId }) => {
        if (ownerId !== alice.userId || mediaId !== '11111111-1111-4111-8111-111111111111') throw new ExternalIdentityError('FORBIDDEN', 'Media unavailable.');
      } },
    });
    const wechat = service.createManualIdentity(alice, {
      provider: 'WECHAT', displayName: 'Alice', wechatId: 'alice-contact', qrMediaId: '11111111-1111-4111-8111-111111111111',
    }, 'wechat-1');
    expect(service.getPublicProfile(alice.userId)).toEqual([]);
    expect(() => service.setVisibility(bob, wechat.id, 'PUBLIC')).toThrow(/not found/u);
    service.setVisibility(alice, wechat.id, 'PUBLIC');
    const published = service.getPublicProfile(alice.userId)[0]!;
    expect(published).toMatchObject({ provider: 'WECHAT', displayName: 'Alice' });
    expect(JSON.stringify(published)).not.toContain('qrMediaId');
    expect(service.launch(alice, wechat.id, 'QR')).toMatchObject({ action: 'SHOW_QR', qrMediaId: wechat.qrMediaId });
    expect(() => service.launch(bob, wechat.id, 'QR')).toThrow(/not found/u);
  });

  it('uses server-held PKCE state and a safe OAuth result without returning provider credentials', async () => {
    let seenChallenge = '';
    let seenVerifier = '';
    const provider: ExternalIdentityOAuthProvider = {
      provider: 'GITHUB', officiallyVerified: true,
      officialCapabilityReference: 'https://docs.github.com/en/apps/oauth-apps/building-oauth-apps/authorizing-oauth-apps',
      requestedScopes: ['read:user'],
      async begin({ state, codeChallenge }) {
        seenChallenge = codeChallenge;
        return { authorizationUrl: `https://github.com/login/oauth/authorize?state=${encodeURIComponent(state)}` };
      },
      async complete({ codeVerifier }) {
        seenVerifier = codeVerifier;
        return {
          providerAccountId: 'github-401', displayName: 'Alice', handle: 'alice', publicUrl: 'https://github.com/alice', avatarUrl: null,
          description: 'public profile', encryptedCredential: 'ciphertext:server-only', expiresAt: null, requestedScopes: ['read:user'],
        };
      },
    };
    const service = createExternalIdentityService({
      allowedRedirectUris: ['https://mezip.example/oauth/github'],
      oauthProviders: { GITHUB: provider },
      credentialVault: new InMemoryExternalIdentityCredentialVault(),
    });
    const start = await service.startOAuth(alice, { provider: 'GITHUB', redirectUri: 'https://mezip.example/oauth/github' });
    expect(start).toMatchObject({ provider: 'GITHUB', pkceRequired: true });
    expect(JSON.stringify(start)).not.toContain('verifier');
    expect(seenChallenge).toMatch(/^[A-Za-z0-9_-]{43}$/u);
    await expect(service.completeOAuth(bob, { provider: 'GITHUB', state: start.state, code: 'code', redirectUri: 'https://mezip.example/oauth/github' }))
      .rejects.toMatchObject({ code: 'OAUTH_STATE_INVALID' });
    const retry = await service.startOAuth(alice, { provider: 'GITHUB', redirectUri: 'https://mezip.example/oauth/github' });
    const identity = await service.completeOAuth(alice, { provider: 'GITHUB', state: retry.state, code: 'code', redirectUri: 'https://mezip.example/oauth/github' });
    expect(identity.connectionStatus).toBe('CONNECTED');
    expect(seenVerifier).toMatch(/^[A-Za-z0-9_-]{43,128}$/u);
    expect(JSON.stringify(identity)).not.toContain('ciphertext');
    expect(JSON.stringify(service.listConnections(alice))).not.toContain('ciphertext');
  });

  it('rejects dangerous and cross-provider destinations rather than creating a fake link', () => {
    const service = createExternalIdentityService();
    expect(() => service.createManualIdentity(alice, { provider: 'X', displayName: 'Alice', publicUrl: 'https://github.com/alice' }))
      .toThrow(/x.com/u);
    expect(() => service.createManualIdentity(alice, { provider: 'CHATGPT', displayName: 'GPT', publicUrl: 'https://chatgpt.com/g/demo?token=leak' }))
      .toThrow(/safe public HTTPS/u);
    const game = service.createManualIdentity(alice, { provider: 'HONOR_OF_KINGS', displayName: 'Alice game', gameId: '12345' });
    expect(service.launch(alice, game.id, 'OPEN')).toMatchObject({ action: 'UNSUPPORTED' });
  });
});
