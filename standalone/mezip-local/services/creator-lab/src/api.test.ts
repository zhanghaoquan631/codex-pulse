import { describe, expect, it } from 'vitest';
import type { AuthenticatedPrincipal } from '@me-zip/shared-types';
import { CreatorLabApiAdapter } from './api.js';
import { CreatorLabService } from './index.js';

const principal: AuthenticatedPrincipal = { userId: 'alice', sessionId: 's', roles: [], issuedAt: '2026-08-18T00:00:00.000Z' };

describe('CreatorLabApiAdapter', () => {
  it('uses strict routes and returns server errors without leaking internals', async () => {
    const service = new CreatorLabService({ entitlementResolver: { has: () => true }, now: () => '2026-08-18T00:00:00.000Z', id: (() => { let n = 0; return () => `id-${++n}`; })() });
    const api = new CreatorLabApiAdapter(service);
    const created = await api.handle({ method: 'POST', path: '/v1/creator/projects', principal, body: { name: 'API', description: '', type: 'WEB', visibility: 'PRIVATE' } });
    expect(created.status).toBe(200);
    const projectId = (created.body as { data: { id: string } }).data.id;
    const rejected = await api.handle({ method: 'POST', path: `/v1/creator/projects/${projectId}/files`, principal, body: { path: '../secret', kind: 'FILE', content: 'x' } });
    expect(rejected.status).toBe(400);
    const unknown = await api.handle({ method: 'GET', path: '/v1/creator/projects/missing', principal });
    expect(unknown.status).toBe(404);
  });

  it('does not pretend GitHub is configured when no server OAuth adapter exists', async () => {
    const api = new CreatorLabApiAdapter(
      new CreatorLabService({ entitlementResolver: { has: () => true } }),
    );
    const result = await api.handle({
      method: 'GET',
      path: '/v1/creator/github/authorization',
      principal,
    });
    expect(result.status).toBe(503);
    expect(result.body).toMatchObject({ error: { code: 'GITHUB_NOT_CONFIGURED' } });
  });
});
