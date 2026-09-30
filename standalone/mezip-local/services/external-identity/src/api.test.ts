import { describe, expect, it } from 'vitest';
import type { AuthenticatedPrincipal } from '@me-zip/shared-types';
import { ExternalIdentityApiAdapter } from './api.js';
import { createExternalIdentityService } from './index.js';

const alice: AuthenticatedPrincipal = { userId: 'alice', sessionId: 'alice-session', roles: [], issuedAt: '2026-08-20T00:00:00.000Z' };
const bob: AuthenticatedPrincipal = { userId: 'bob', sessionId: 'bob-session', roles: [], issuedAt: '2026-08-20T00:00:00.000Z' };

describe('ExternalIdentityApiAdapter', () => {
  it('uses strict self-only inputs and exposes only public safe identity projections', async () => {
    const api = new ExternalIdentityApiAdapter(createExternalIdentityService());
    const invalid = await api.handle({
      method: 'POST', path: '/v1/external-identities', principal: alice,
      body: { provider: 'X', displayName: 'Alice', publicUrl: 'https://x.com/alice', ownerId: 'bob' },
    });
    expect(invalid.status).toBe(400);
    const created = await api.handle({
      method: 'POST', path: '/v1/external-identities', principal: alice,
      idempotencyKey: 'manual-x-1', body: { provider: 'X', displayName: 'Alice', publicUrl: 'https://x.com/alice', visibility: 'PUBLIC' },
    });
    expect(created.status).toBe(201);
    const identityId = ((created.body.data as { readonly id: string }).id);
    const denied = await api.handle({ method: 'PATCH', path: `/v1/external-identities/${identityId}`, principal: bob, body: { description: 'nope' } });
    expect(denied.status).toBe(404);
    const publicProfile = await api.handle({ method: 'GET', path: '/v1/public/profiles/alice/external-identities' });
    expect(publicProfile.status).toBe(200);
    const publicIdentity = (publicProfile.body.data as readonly Record<string, unknown>[])[0]!;
    expect(publicIdentity).toMatchObject({ provider: 'X', publicUrl: 'https://x.com/alice' });
    expect(publicIdentity).not.toHaveProperty('ownerId');
    expect(publicIdentity).not.toHaveProperty('qrMediaId');
  });

  it('returns a clear configured-state error instead of fake OAuth success', async () => {
    const api = new ExternalIdentityApiAdapter(createExternalIdentityService());
    const response = await api.handle({
      method: 'POST', path: '/v1/external-identities/oauth/start', principal: alice,
      body: { provider: 'GITHUB', redirectUri: 'https://mezip.example/oauth/github' },
    });
    expect(response.status).toBe(503);
    expect(response.body).toMatchObject({ error: { code: 'NOT_CONFIGURED' } });
  });
});
