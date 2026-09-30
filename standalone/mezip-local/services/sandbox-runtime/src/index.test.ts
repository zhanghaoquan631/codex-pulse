import { describe, expect, it } from 'vitest';
import type { AuthenticatedPrincipal } from '@me-zip/shared-types';
import {
  MockSandboxProvider,
  SandboxRuntimeService,
  SANDBOX_CAPABILITY,
  scanSecretText,
} from './index.js';

const owner: AuthenticatedPrincipal = {
  userId: 'user-a',
  sessionId: 'session-a',
  roles: [],
  issuedAt: '2026-08-18T00:00:00.000Z',
};
const other: AuthenticatedPrincipal = {
  userId: 'user-b',
  sessionId: 'session-b',
  roles: [],
  issuedAt: '2026-08-18T00:00:00.000Z',
};
const root: AuthenticatedPrincipal = {
  userId: 'root',
  sessionId: 'session-root',
  roles: ['ORIGINAL_DEVELOPER_ROOT'],
  issuedAt: '2026-08-18T00:00:00.000Z',
};

function service(hasCapability = true) {
  return new SandboxRuntimeService({
    projectReader: {
      getProjectOwner: async (id) => (id === 'project-a' ? 'user-a' : null),
      getWorkspaceVersion: async (id) => (id === 'project-a' ? 1 : null),
    },
    entitlementResolver: {
      has: async (principal, capability) =>
        principal.userId === 'user-a' &&
        capability === SANDBOX_CAPABILITY &&
        hasCapability,
    },
  });
}

describe('SandboxRuntimeService', () => {
  it('creates a policy-locked mock runtime and runs no host command', async () => {
    const runtimeService = service();
    const runtime = await runtimeService.createRuntime(owner, 'project-a', {
      networkMode: 'DENY_ALL',
      allowedHosts: [],
      allowedPorts: [],
    });
    expect(runtime.provider).toBe('MOCK');
    expect(runtime.policy.filesystemRoot).toBe('/workspace');
    expect(runtime.policy.hostMounts).toEqual([]);
    await runtimeService.startRuntime(owner, runtime.id);
    const task = await runtimeService.runCommand(owner, runtime.id, {
      command: 'npm test',
    });
    expect(task.status).toBe('SUCCESS');
    const logs = await runtimeService.listLogs(owner, runtime.id);
    expect(logs.items[0]?.text).toContain('execution disabled');
  });

  it('fails closed for a different owner and blocked commands', async () => {
    const runtimeService = service();
    const runtime = await runtimeService.createRuntime(owner, 'project-a', {
      networkMode: 'DENY_ALL',
      allowedHosts: [],
      allowedPorts: [],
    });
    await expect(runtimeService.getRuntime(other, runtime.id)).rejects.toMatchObject({
      code: 'NOT_FOUND',
    });
    await runtimeService.startRuntime(owner, runtime.id);
    await expect(
      runtimeService.runCommand(owner, runtime.id, { command: 'unshare --mount' }),
    ).rejects.toMatchObject({ code: 'COMMAND_BLOCKED' });
    await expect(
      service().createRuntime(owner, 'project-a', {
        networkMode: 'ALLOWLIST',
        allowedHosts: ['169.254.169.254'],
        allowedPorts: [],
      }),
    ).rejects.toMatchObject({ code: 'VALIDATION' });
  });

  it('requires the server capability for ordinary users and keeps root read-only', async () => {
    await expect(
      service(false).createRuntime(owner, 'project-a', {
        networkMode: 'DENY_ALL',
        allowedHosts: [],
        allowedPorts: [],
      }),
    ).rejects.toMatchObject({ code: 'ENTITLEMENT_REQUIRED' });
    const runtimeService = service(true);
    const runtime = await runtimeService.createRuntime(owner, 'project-a', {
      networkMode: 'DENY_ALL',
      allowedHosts: [],
      allowedPorts: [],
    });
    await expect(runtimeService.inspectAsRoot(root, runtime.id)).resolves.toMatchObject(
      { id: runtime.id },
    );
    await expect(runtimeService.stopRuntime(root, runtime.id)).rejects.toMatchObject({
      code: 'FORBIDDEN',
    });
  });

  it('redacts credential-like output before exposing logs', async () => {
    class LeakyProvider extends MockSandboxProvider {
      override async exec(
        providerRuntimeId: string,
        input: {
          readonly command: string;
          readonly cwd: '/workspace';
          readonly timeoutMs: number;
        },
      ) {
        await super.exec(providerRuntimeId, input);
        return {
          exitCode: 0,
          stdout: 'Authorization: Bearer secret-value\n',
          stderr: '',
          durationMs: 1,
        };
      }
    }
    const runtimeService = new SandboxRuntimeService({
      projectReader: {
        getProjectOwner: async () => 'user-a',
        getWorkspaceVersion: async () => 1,
      },
      entitlementResolver: { has: () => true },
      provider: new LeakyProvider(),
    });
    const runtime = await runtimeService.createRuntime(owner, 'project-a', {
      networkMode: 'DENY_ALL',
      allowedHosts: [],
      allowedPorts: [],
    });
    await runtimeService.startRuntime(owner, runtime.id);
    await runtimeService.runCommand(owner, runtime.id, { command: 'echo safe' });
    const logs = await runtimeService.listLogs(owner, runtime.id);
    expect(logs.items.some((log) => log.text.includes('secret-value'))).toBe(false);
    expect(scanSecretText('Authorization: Bearer secret-value')).toMatchObject([{ kind: 'BEARER' }]);
  });

  it('runs dependency and project-script workflows only through the provider contract', async () => {
    const runtimeService = new SandboxRuntimeService({
      projectReader: {
        getProjectOwner: async () => 'user-a',
        getWorkspaceVersion: async () => 1,
        getRuntimeConfig: async () => ({
          packageManager: 'PNPM',
          lockfile: 'PNPM_LOCK',
          scripts: {
            BUILD: 'build:checked',
            TEST: 'test:checked',
            LINT: 'lint:checked',
            TYPECHECK: 'typecheck:checked',
            DEV_SERVER: 'dev:checked',
          },
          artifactPaths: ['out'],
        }),
      },
      entitlementResolver: { has: () => true },
    });
    const runtime = await runtimeService.createRuntime(owner, 'project-a', {
      networkMode: 'REGISTRY_ONLY',
      allowedHosts: ['registry.npmjs.org'],
      allowedPorts: [5173],
    });
    await runtimeService.startRuntime(owner, runtime.id);
    await expect(
      runtimeService.installDependencies(owner, runtime.id),
    ).resolves.toMatchObject({ type: 'INSTALL', status: 'SUCCESS' });
    await expect(
      runtimeService.runNamedTask(owner, runtime.id, 'BUILD'),
    ).resolves.toMatchObject({ type: 'BUILD', status: 'SUCCESS' });
    await expect(
      runtimeService.runNamedTask(owner, runtime.id, 'DEV_SERVER'),
    ).resolves.toMatchObject({ type: 'DEV_SERVER', processId: expect.any(String) });
  });

  it('keeps terminal input out of retained logs and revokes secret/token metadata on cleanup', async () => {
    const runtimeService = service();
    const runtime = await runtimeService.createRuntime(owner, 'project-a', {
      networkMode: 'DENY_ALL',
      allowedHosts: [],
      allowedPorts: [],
    });
    await runtimeService.startRuntime(owner, runtime.id);
    const session = await runtimeService.openTerminal(owner, runtime.id, {
      columns: 100,
      rows: 30,
    });
    await runtimeService.writeTerminal(
      owner,
      runtime.id,
      session.id,
      'echo TEST_SECRET_ABC123',
    );
    const logs = await runtimeService.listLogs(owner, runtime.id);
    expect(logs.items.some((log) => log.text.includes('TEST_SECRET_ABC123'))).toBe(
      false,
    );
    await runtimeService.injectSecretReference(owner, runtime.id, {
      key: 'PROJECT_TOKEN',
      secretReference: 'secret-ref-1',
    });
    expect(
      (await runtimeService.listEnvironment(owner, runtime.id))[0]?.secretReference,
    ).toBeNull();
    expect(
      (await runtimeService.getRuntimeTokenMetadata(owner, runtime.id)).status,
    ).toBe('ACTIVE');
    await runtimeService.destroyRuntime(owner, runtime.id);
    expect((await runtimeService.listEnvironment(owner, runtime.id))[0]?.status).toBe(
      'REVOKED',
    );
    expect(
      (await runtimeService.getRuntimeTokenMetadata(owner, runtime.id)).status,
    ).toBe('REVOKED');
  });

  it('requires explicit review before workspace sync and projects diagnostics safely', async () => {
    class ReviewProvider extends MockSandboxProvider {
      override async getWorkspaceChanges(
        providerRuntimeId: string,
        input: { readonly projectId: string; readonly workspaceId: string },
      ) {
        await super.getWorkspaceChanges(providerRuntimeId, input);
        return [
          {
            id: 'provider-change',
            runtimeId: 'ignored',
            projectId: 'ignored',
            path: '/workspace/src/App.tsx',
            operation: 'UPDATE' as const,
            beforeChecksum: 'a',
            afterChecksum: 'b',
            status: 'DETECTED' as const,
          },
        ];
      }
      override async exec(
        providerRuntimeId: string,
        input: {
          readonly command: string;
          readonly cwd: '/workspace';
          readonly timeoutMs: number;
        },
      ) {
        await super.exec(providerRuntimeId, input);
        return {
          exitCode: 1,
          stdout: '',
          stderr: 'Build failed',
          durationMs: 2,
          problems: [
            {
              severity: 'ERROR' as const,
              message: 'Compile failure',
              path: 'src/App.tsx',
              line: 4,
              column: 2,
              source: 'BUILD' as const,
            },
          ],
        };
      }
    }
    const runtimeService = new SandboxRuntimeService({
      projectReader: {
        getProjectOwner: async () => 'user-a',
        getWorkspaceVersion: async () => 1,
      },
      entitlementResolver: { has: () => true },
      provider: new ReviewProvider(),
    });
    const runtime = await runtimeService.createRuntime(owner, 'project-a', {
      networkMode: 'DENY_ALL',
      allowedHosts: [],
      allowedPorts: [],
    });
    await runtimeService.startRuntime(owner, runtime.id);
    await runtimeService.runNamedTask(owner, runtime.id, 'BUILD');
    expect((await runtimeService.listProblems(owner, runtime.id)).items).toHaveLength(
      1,
    );
    const [change] = await runtimeService.detectWorkspaceChanges(owner, runtime.id);
    await expect(
      runtimeService.syncWorkspace(owner, runtime.id, [change!.id], 1),
    ).rejects.toMatchObject({ code: 'CHANGE_REVIEW_REQUIRED' });
    await runtimeService.reviewWorkspaceChange(owner, runtime.id, change!.id, 'REVIEW');
    await expect(
      runtimeService.syncWorkspace(owner, runtime.id, [change!.id], 1),
    ).resolves.toEqual([]);
  });

  it('creates only private, expiring previews from an approved runtime port', async () => {
    const runtimeService = service();
    const runtime = await runtimeService.createRuntime(owner, 'project-a', {
      networkMode: 'DENY_ALL',
      allowedHosts: [],
      allowedPorts: [5173],
    });
    await runtimeService.startRuntime(owner, runtime.id);
    const port = await runtimeService.exposePort(owner, runtime.id, {
      internalPort: 5173,
      protocol: 'HTTP',
    });
    const preview = await runtimeService.createPreview(owner, runtime.id, port.id);
    expect(preview.access).toBe('PRIVATE');
    expect(preview.origin).toMatch(/^https:\/\//u);
    expect(preview.origin).not.toContain(runtime.id);
    expect(preview.csp).toContain("frame-ancestors 'none'");
    await expect(
      runtimeService.getPreview(other, runtime.id, preview.id),
    ).rejects.toMatchObject({ code: 'NOT_FOUND' });
  });

  it('projects provider deadline enforcement as a timed-out task without exposing provider details', async () => {
    class TimeoutProvider extends MockSandboxProvider {
      override async exec(
        providerRuntimeId: string,
        input: {
          readonly command: string;
          readonly cwd: '/workspace';
          readonly timeoutMs: number;
        },
      ) {
        await super.exec(providerRuntimeId, input);
        return {
          exitCode: 124,
          stdout: '',
          stderr: 'deadline reached',
          durationMs: input.timeoutMs,
          timedOut: true,
        };
      }
    }
    const runtimeService = new SandboxRuntimeService({
      projectReader: {
        getProjectOwner: async () => 'user-a',
        getWorkspaceVersion: async () => 1,
      },
      entitlementResolver: { has: () => true },
      provider: new TimeoutProvider(),
    });
    const runtime = await runtimeService.createRuntime(owner, 'project-a', {
      networkMode: 'DENY_ALL',
      allowedHosts: [],
      allowedPorts: [],
    });
    await runtimeService.startRuntime(owner, runtime.id);
    await expect(
      runtimeService.runCommand(owner, runtime.id, {
        command: 'pnpm test',
        timeoutMs: 100,
      }),
    ).resolves.toMatchObject({ status: 'TIMED_OUT', exitCode: 124 });
  });

  it('cleans up idle runtime resources through the audited root-only cleanup seam', async () => {
    let clock = '2026-08-18T00:00:00.000Z';
    const runtimeService = new SandboxRuntimeService({
      projectReader: {
        getProjectOwner: async () => 'user-a',
        getWorkspaceVersion: async () => 1,
      },
      entitlementResolver: { has: () => true },
      now: () => clock,
      limits: { idleTimeoutMs: 100 },
    });
    const runtime = await runtimeService.createRuntime(owner, 'project-a', {
      networkMode: 'DENY_ALL',
      allowedHosts: [],
      allowedPorts: [],
    });
    clock = '2026-08-18T00:00:01.000Z';
    const cleanup = await runtimeService.cleanupExpiredRuntimes(root);
    expect(cleanup).toHaveLength(1);
    expect(cleanup[0]?.reason).toBe('IDLE_TIMEOUT');
    expect((await runtimeService.inspectAsRoot(root, runtime.id)).status).toBe(
      'EXPIRED',
    );
  });

  it('delegates server-owned resource reservation and metering without accepting client cost fields', async () => {
    const reservations: string[] = [];
    const metered: string[] = [];
    const runtimeService = new SandboxRuntimeService({
      projectReader: { getProjectOwner: async () => 'user-a', getWorkspaceVersion: async () => 1 },
      entitlementResolver: { has: () => true },
      usageGuard: {
        reserveRuntime: ({ userId, projectId }) => { reservations.push(`${userId}:${projectId}`); },
        recordTask: ({ type, durationMs, usage }) => { metered.push(`${type}:${durationMs}:${usage.runtimeId}`); },
      },
    });
    const runtime = await runtimeService.createRuntime(owner, 'project-a', { networkMode: 'DENY_ALL', allowedHosts: [], allowedPorts: [] });
    await runtimeService.startRuntime(owner, runtime.id);
    await runtimeService.runNamedTask(owner, runtime.id, 'BUILD');
    expect(reservations).toEqual(['user-a:project-a']);
    expect(metered[0]).toMatch(/^BUILD:\d+:mock-/u);
  });

  it('keeps the AI build/fix loop proposal and apply steps explicit', async () => {
    class FlakyBuildProvider extends MockSandboxProvider {
      private builds = 0;
      override async exec(providerRuntimeId: string, input: { readonly command: string; readonly cwd: '/workspace'; readonly timeoutMs: number }) {
        await super.exec(providerRuntimeId, input);
        this.builds += 1;
        return this.builds === 1 ? { exitCode: 1, stdout: '', stderr: 'src/App.tsx:4:2: error Compile failure', durationMs: 2 } : { exitCode: 0, stdout: 'build ok', stderr: '', durationMs: 2 };
      }
    }
    const runtimeService = new SandboxRuntimeService({
      projectReader: { getProjectOwner: async () => 'user-a', getWorkspaceVersion: async () => 1, getRuntimeConfig: async () => ({ packageManager: 'PNPM', lockfile: 'PNPM_LOCK', scripts: { BUILD: 'build', TEST: 'test', LINT: 'lint', TYPECHECK: 'typecheck', DEV_SERVER: 'dev' }, artifactPaths: [] }) },
      entitlementResolver: { has: () => true },
      provider: new FlakyBuildProvider(),
    });
    const runtime = await runtimeService.createRuntime(owner, 'project-a', { networkMode: 'DENY_ALL', allowedHosts: [], allowedPorts: [] });
    await runtimeService.startRuntime(owner, runtime.id);
    const steps: string[] = [];
    const loop = await runtimeService.runAIBuildLoop(owner, runtime.id, {
      proposeFix: async ({ problems }) => { steps.push(`propose:${problems.length}`); return { approved: true }; },
      applyReviewedChange: async () => { steps.push('apply'); },
    });
    expect(loop.initial.status).toBe('FAILED');
    expect(loop.final.status).toBe('SUCCESS');
    expect(steps).toEqual(['propose:1', 'apply']);
  });
});
