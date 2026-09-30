import { describe, expect, it } from 'vitest';
import type { AuthenticatedPrincipal } from '@me-zip/shared-types';
import { CreatorLabApiAdapter } from '../../services/creator-lab/src/api.js';
import { CreatorLabService } from '../../services/creator-lab/src/index.js';

const alice: AuthenticatedPrincipal = { userId: 'phase10-alice', sessionId: 'phase10-session-a', roles: [], issuedAt: '2026-08-18T00:00:00.000Z' };
const bob: AuthenticatedPrincipal = { userId: 'phase10-bob', sessionId: 'phase10-session-b', roles: [], issuedAt: '2026-08-18T00:00:00.000Z' };

function adapter() {
  let n = 0;
  return new CreatorLabApiAdapter(new CreatorLabService({ entitlementResolver: { has: () => true }, id: () => `phase10-${++n}`, now: () => '2026-08-18T00:00:00.000Z' }));
}

describe('Phase 10 Creator Lab integration boundary', () => {
  it('derives owner from the trusted principal and rejects unsafe paths', async () => {
    const api = adapter();
    const created = await api.handle({ method: 'POST', path: '/v1/creator/projects', principal: alice, body: { name: 'Owned', description: '', type: 'WEB', visibility: 'PRIVATE' } });
    const projectId = (created.body as { data: { id: string } }).data.id;
    const foreign = await api.handle({ method: 'GET', path: `/v1/creator/projects/${projectId}`, principal: bob });
    expect(foreign.status).toBe(404);
    const unsafe = await api.handle({ method: 'POST', path: `/v1/creator/projects/${projectId}/files`, principal: alice, body: { path: '../escape.ts', kind: 'FILE', content: 'x' } });
    expect(unsafe.status).toBe(400);
  });

  it('keeps AI change proposal separate from explicit apply', async () => {
    const api = adapter();
    const created = await api.handle({ method: 'POST', path: '/v1/creator/projects', principal: alice, body: { name: 'Review', description: '', type: 'WEB', visibility: 'PRIVATE' } });
    const project = (created.body as { data: { id: string; workspaceVersion: number } }).data;
    const proposal = await api.handle({ method: 'POST', path: `/v1/creator/projects/${project.id}/ai/changes`, principal: alice, body: { request: 'Add a safe heading', scopePaths: ['README.md'], expectedVersion: project.workspaceVersion } });
    expect(proposal.status).toBe(200);
    expect((proposal.body as { data: { status: string } }).data.status).toBe('PROPOSED');
  });
});
