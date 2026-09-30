import { describe, expect, it } from 'vitest';
import type { AuthenticatedPrincipal } from '@me-zip/shared-types';
import { SandboxRuntimeApiAdapter } from '../../services/sandbox-runtime/src/api.js';
import {
  SANDBOX_CAPABILITY,
  SandboxRuntimeService,
} from '../../services/sandbox-runtime/src/index.js';

const alice: AuthenticatedPrincipal = {
  userId: 'phase11-alice',
  sessionId: 'phase11-session-a',
  roles: [],
  issuedAt: '2026-08-18T00:00:00.000Z',
};
const bob: AuthenticatedPrincipal = {
  userId: 'phase11-bob',
  sessionId: 'phase11-session-b',
  roles: [],
  issuedAt: '2026-08-18T00:00:00.000Z',
};

function api() {
  return new SandboxRuntimeApiAdapter(
    new SandboxRuntimeService({
      projectReader: {
        getProjectOwner: async (id) => (id === 'project-11' ? alice.userId : null),
        getWorkspaceVersion: async () => 1,
      },
      entitlementResolver: {
        has: (principal, capability) =>
          principal.userId === alice.userId && capability === SANDBOX_CAPABILITY,
      },
    }),
  );
}

describe('Phase 11 sandbox runtime integration boundary', () => {
  it('is server-scoped and does not execute a host command', async () => {
    const adapter = api();
    const created = await adapter.handle({
      method: 'POST',
      path: '/v1/sandbox/runtimes',
      principal: alice,
      query: { projectId: 'project-11' },
      body: { networkMode: 'DENY_ALL', allowedHosts: [], allowedPorts: [] },
    });
    expect(created.status).toBe(200);
    const runtimeId = (created.body as { data: { id: string } }).data.id;
    expect(
      (
        await adapter.handle({
          method: 'POST',
          path: `/v1/sandbox/runtimes/${runtimeId}/start`,
          principal: alice,
        })
      ).status,
    ).toBe(200);
    const task = await adapter.handle({
      method: 'POST',
      path: `/v1/sandbox/runtimes/${runtimeId}/command`,
      principal: alice,
      body: { command: 'npm test' },
    });
    expect((task.body as { data: { status: string } }).data.status).toBe('SUCCESS');
    const terminal = await adapter.handle({
      method: 'POST',
      path: `/v1/sandbox/runtimes/${runtimeId}/terminals`,
      principal: alice,
      body: { columns: 100, rows: 30 },
    });
    const terminalId = (terminal.body as { data: { id: string } }).data.id;
    expect(
      (
        await adapter.handle({
          method: 'POST',
          path: `/v1/sandbox/runtimes/${runtimeId}/terminals/${terminalId}/input`,
          principal: alice,
          body: { input: 'echo TEST_SECRET_ABC123' },
        })
      ).status,
    ).toBe(200);
    const logs = await adapter.handle({
      method: 'GET',
      path: `/v1/sandbox/runtimes/${runtimeId}/logs`,
      principal: alice,
    });
    expect(JSON.stringify(logs.body)).not.toContain('TEST_SECRET_ABC123');
    expect(
      (
        await adapter.handle({
          method: 'GET',
          path: `/v1/sandbox/runtimes/${runtimeId}/logs`,
          principal: bob,
        })
      ).status,
    ).toBe(404);
  });

  it('rejects unsafe command policy and missing entitlement', async () => {
    const adapter = api();
    const blocked = await adapter.handle({
      method: 'POST',
      path: '/v1/sandbox/runtimes/nope/command',
      principal: alice,
      body: { command: 'mount --privileged' },
    });
    expect(blocked.status).toBe(400);
    const denied = await adapter.handle({
      method: 'POST',
      path: '/v1/sandbox/runtimes',
      principal: bob,
      query: { projectId: 'project-11' },
      body: { networkMode: 'DENY_ALL', allowedHosts: [], allowedPorts: [] },
    });
    expect(denied.status).toBe(404);
  });
});
