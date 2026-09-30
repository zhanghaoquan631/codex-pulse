import { describe, expect, it } from 'vitest';
import type { AuthenticatedPrincipal } from '@me-zip/shared-types';
import { SocialConnectorApiAdapter } from './api.js';
import { SocialConnectorService } from './index.js';

const principal: AuthenticatedPrincipal = { userId: '11111111-1111-4111-8111-111111111111', sessionId: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', roles: ['USER'], issuedAt: new Date(0).toISOString() };
const other: AuthenticatedPrincipal = { ...principal, userId: '22222222-2222-4222-8222-222222222222' };

describe('SocialConnectorApiAdapter', () => {
  it('projects provider capabilities and fails closed for unsupported publish', async () => {
    const adapter = new SocialConnectorApiAdapter(new SocialConnectorService());
    const providers = await adapter.handle({ method: 'GET', path: '/v1/social/providers' });
    expect(providers.status).toBe(200);
    expect(JSON.stringify(providers.body)).not.toMatch(/access_token|refresh_token|client_secret|ciphertext/i);
    const capabilities = await adapter.handle({ method: 'GET', path: '/v1/social/providers/DOUYIN/capabilities' });
    expect(capabilities.status).toBe(200);
    expect(JSON.stringify(capabilities.body)).toContain('UNSUPPORTED');
  });

  it('rejects consumer owner fields and invalid archive paths without leaking errors', async () => {
    const adapter = new SocialConnectorApiAdapter(new SocialConnectorService());
    const response = await adapter.handle({ method: 'POST', path: '/v1/social/archive', principal, body: { url: 'https://example.com', ownerId: other.userId } });
    expect(response.status).toBe(400);
    expect(JSON.stringify(response.body)).not.toContain(other.userId);
    const idor = await adapter.handle({ method: 'GET', path: '/v1/social/archive/00000000-0000-4000-8000-000000000001', principal: other });
    expect(idor.status).toBe(404);
  });

  it('runs manual save, collection, search, snapshot and delete through strict routes', async () => {
    const service = new SocialConnectorService();
    const adapter = new SocialConnectorApiAdapter(service);
    const saved = await adapter.handle({ method: 'POST', path: '/v1/social/archive', principal, body: { url: 'https://example.com/idea', note: 'keep', tags: ['design'] }, idempotencyKey: 'manual-route-1' });
    expect(saved.status).toBe(201);
    const itemId = (saved.body.data as { id: string }).id;
    const collection = await adapter.handle({ method: 'POST', path: '/v1/social/collections', principal, body: { name: 'Ideas' } });
    const collectionId = (collection.body.data as { id: string }).id;
    const added = await adapter.handle({ method: 'POST', path: `/v1/social/collections/${collectionId}/items`, principal, body: { archiveItemId: itemId } });
    expect(added.status).toBe(201);
    const search = await adapter.handle({ method: 'GET', path: '/v1/social/archive', principal, query: { query: 'keep', collectionId } });
    expect((search.body.data as { items: readonly unknown[] }).items).toHaveLength(1);
    const publication = await adapter.handle({ method: 'POST', path: `/v1/social/archive/${itemId}/publish-snapshot`, principal, body: { target: 'PUBLIC', visibility: 'PUBLIC' } });
    expect(publication.status).toBe(201);
    const deleted = await adapter.handle({ method: 'DELETE', path: `/v1/social/archive/${itemId}`, principal });
    expect(deleted.status).toBe(200);
  });

  it('keeps the Root route separate from normal Admin-shaped requests', async () => {
    const adapter = new SocialConnectorApiAdapter(new SocialConnectorService({ rootAuthorizer: { canReadSocialArchive: () => true } }));
    const denied = await adapter.handle({ method: 'GET', path: `/v1/admin/social/users/${principal.userId}/archive`, principal: { ...principal, roles: ['ADMIN'] } });
    expect(denied.status).toBe(403);
    const allowed = await adapter.handle({ method: 'GET', path: `/v1/admin/social/users/${principal.userId}/archive`, principal, adminBoundary: true });
    expect(allowed.status).toBe(200);
  });

  it('exposes Founder curation only through the Founder-bound consumer route', async () => {
    const service = new SocialConnectorService({ founderUserId: principal.userId });
    const adapter = new SocialConnectorApiAdapter(service);
    const saved = await adapter.handle({ method: 'POST', path: '/v1/social/archive', principal, body: { url: 'https://example.com/founder-api' } });
    const itemId = (saved.body.data as { id: string }).id;
    const curated = await adapter.handle({ method: 'POST', path: '/v1/social/founder/curate', principal, body: { archiveItemId: itemId, audience: 'PUBLIC' } });
    expect(curated.status).toBe(201);
    const denied = await adapter.handle({ method: 'POST', path: '/v1/social/founder/curate', principal: other, body: { archiveItemId: itemId, audience: 'PUBLIC' } });
    expect(denied.status).toBe(403);
  });
});
