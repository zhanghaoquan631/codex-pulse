import { describe, expect, it } from 'vitest';
import { CreatorLabService } from '@me-zip/creator-lab';
import { CreatorEcosystemApiAdapter } from './api.js';
import { CreatorLabEcosystemProjectGateway, CreatorEcosystemService } from './index.js';

const alice = { userId: 'alice', sessionId: 'session-a', roles: [], issuedAt: '2026-08-20T00:00:00.000Z' } as const;

describe('CreatorEcosystemApiAdapter', () => {
  it('keeps public routes metadata-only and rejects client role/owner forgery', async () => {
    let id = 0;
    const lab = new CreatorLabService({ entitlementResolver: { has: () => true }, id: () => `lab-${++id}`, now: () => '2026-08-20T00:00:00.000Z' });
    const service = new CreatorEcosystemService({ projects: new CreatorLabEcosystemProjectGateway(lab), entitlements: { has: () => true }, id: () => `eco-${++id}`, now: () => '2026-08-20T00:00:00.000Z' });
    const api = new CreatorEcosystemApiAdapter(service);
    const profile = await api.handle({ method: 'PATCH', path: '/v1/creator-ecosystem/profile', principal: alice, body: { username: 'tom', displayName: 'Tom', profileVisibility: 'PUBLIC', ownerId: 'other' } });
    expect(profile.status).toBe(400);
    const updated = await api.handle({ method: 'PATCH', path: '/v1/creator-ecosystem/profile', principal: alice, body: { username: 'tom', displayName: 'Tom', profileVisibility: 'PUBLIC' } });
    expect(updated.status).toBe(200);
    const project = lab.createProject(alice, { name: 'API Project', description: '', type: 'WEB', visibility: 'PRIVATE' });
    const metadata = await api.handle({ method: 'PATCH', path: `/v1/creator-ecosystem/projects/${project.id}/metadata`, principal: alice, body: { projectVisibility: 'PUBLIC', sourceVisibility: 'PRIVATE', unexpectedPlan: 'PRO_MAX' } });
    expect(metadata.status).toBe(400);
    const publicMissing = await api.handle({ method: 'GET', path: `/v1/public/creator-projects/${project.id}` });
    expect(publicMissing.status).toBe(404);
    const search = await api.handle({ method: 'GET', path: '/v1/public/creator-projects/search', query: { q: 'project' } });
    expect(search.status).toBe(200);
    expect(search.body).toMatchObject({ data: [] });
  });
});
