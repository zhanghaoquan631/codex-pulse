import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import type { AuthenticatedPrincipal } from '../../packages/shared-types/src/index.js';
import { SocialConnectorApiAdapter } from '../../services/social-connectors/src/api.js';
import { SocialConnectorService } from '../../services/social-connectors/src/index.js';

const alice: AuthenticatedPrincipal = { userId: 'alice', sessionId: 'phase13-alice', roles: ['USER'], issuedAt: '2026-08-19T00:00:00.000Z' };
const bob: AuthenticatedPrincipal = { userId: 'bob', sessionId: 'phase13-bob', roles: ['USER'], issuedAt: '2026-08-19T00:00:00.000Z' };

describe('Phase 13 social connector integration boundary', () => {
  it('migration is additive, owner-bound, credential-reference-only, and FORCE RLS', () => {
    const sql = readFileSync(new URL('../../infrastructure/database/015_phase13_social_connectors.sql', import.meta.url), 'utf8');
    expect((sql.match(/CREATE TABLE IF NOT EXISTS/g) ?? []).length).toBeGreaterThanOrEqual(12);
    expect((sql.match(/FORCE ROW LEVEL SECURITY/g) ?? []).length).toBeGreaterThanOrEqual(1);
    expect(sql).toMatch(/social_provider_credentials/iu);
    expect(sql).not.toMatch(/access_token|refresh_token|client_secret|raw_cookie|session_token/iu);
    expect(sql).not.toMatch(/CREATE POLICY.*consumer/iu);
  });

  it('manual save/search/snapshot is owner-scoped and preserves external attribution', async () => {
    const service = new SocialConnectorService();
    const item = service.saveManualLink(alice, { url: 'https://example.com/reference?utm_campaign=one', note: 'private note', tags: ['design'] });
    expect(service.listArchive(bob).items).toHaveLength(0);
    expect(() => service.getArchiveItem(bob, item.id)).toThrowError(expect.objectContaining({ code: 'NOT_FOUND' }));
    const publication = service.publishSnapshot(alice, { archiveItemId: item.id, target: 'PUBLIC', visibility: 'PUBLIC' });
    expect(publication.attribution.originalUrl).toBe('https://example.com/reference');
    expect(JSON.stringify(publication)).toContain('MANUAL_LINK');
    expect(JSON.stringify(publication)).toContain('example.com');
  });

  it('API route does not accept owner/plan/root authority from a consumer body', async () => {
    const adapter = new SocialConnectorApiAdapter(new SocialConnectorService());
    const result = await adapter.handle({ method: 'POST', path: '/v1/social/archive', principal: alice, body: { url: 'https://example.com', ownerId: bob.userId, plan: 'PRO_MAX', root: true } });
    expect(result.status).toBe(400);
    expect(JSON.stringify(result.body)).not.toContain('bob');
  });
});
