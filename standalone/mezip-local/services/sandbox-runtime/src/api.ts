import {
  sandboxRuntimeCommandSchema,
  sandboxRuntimeChangeReviewSchema,
  sandboxRuntimeCreateSchema,
  sandboxRuntimeEnvironmentSchema,
  sandboxRuntimePortSchema,
  sandboxRuntimeSyncSchema,
  sandboxRuntimeTerminalInputSchema,
  sandboxRuntimeTerminalOpenSchema,
  sandboxRuntimeTerminalResizeSchema,
  sandboxRuntimeTaskSchema,
  sandboxRuntimeTaskCancelSchema,
} from '@me-zip/schemas';
import type { AuthenticatedPrincipal } from '@me-zip/shared-types';
import { SandboxRuntimeError, type SandboxRuntimeService } from './index.js';
export { MockSandboxProvider, SandboxRuntimeError } from './index.js';

export interface SandboxRuntimeApiRequest {
  readonly method: 'GET' | 'POST' | 'PATCH' | 'DELETE';
  readonly path: string;
  readonly principal?: AuthenticatedPrincipal;
  readonly query?: Readonly<Record<string, string | undefined>>;
  readonly body?: unknown;
}

export interface SandboxRuntimeApiResponse {
  readonly status: number;
  readonly body: unknown;
}

function principal(request: SandboxRuntimeApiRequest): AuthenticatedPrincipal {
  if (request.principal === undefined)
    throw new SandboxRuntimeError('FORBIDDEN', 'An authenticated user is required.');
  return request.principal;
}

function parse<T>(result: { readonly success: boolean; readonly data?: T }): T {
  if (!result.success || result.data === undefined)
    throw new SandboxRuntimeError('VALIDATION', 'Sandbox request is invalid.');
  return result.data;
}

function status(error: unknown): number {
  if (!(error instanceof SandboxRuntimeError)) return 500;
  if (error.code === 'NOT_FOUND') return 404;
  if (error.code === 'FORBIDDEN' || error.code === 'ENTITLEMENT_REQUIRED') return 403;
  if (
    error.code === 'RUNTIME_CONFLICT' ||
    error.code === 'RUNTIME_EXPIRED' ||
    error.code === 'CHANGE_REVIEW_REQUIRED' ||
    error.code === 'QUOTA_EXCEEDED' ||
    error.code === 'RUNTIME_RECOVERY_REQUIRED'
  )
    return 409;
  if (
    error.code === 'TASK_UNAVAILABLE' ||
    error.code === 'TERMINAL_UNAVAILABLE' ||
    error.code === 'PROVIDER_UNAVAILABLE'
  )
    return 409;
  if (error.code === 'PREVIEW_UNAVAILABLE') return 409;
  return 400;
}

function message(error: unknown): string {
  return error instanceof SandboxRuntimeError
    ? error.message
    : 'Sandbox request could not be completed.';
}

export class SandboxRuntimeApiAdapter {
  public constructor(private readonly service: SandboxRuntimeService) {}

  public async handle(
    request: SandboxRuntimeApiRequest,
  ): Promise<SandboxRuntimeApiResponse> {
    try {
      return { status: 200, body: { data: await this.route(request) } };
    } catch (error) {
      const code = error instanceof SandboxRuntimeError ? error.code : 'INTERNAL';
      return {
        status: status(error),
        body: {
          error: { code, message: message(error), retryable: status(error) >= 500 },
        },
      };
    }
  }

  private async route(request: SandboxRuntimeApiRequest): Promise<unknown> {
    const user = principal(request);
    if (request.path === '/v1/sandbox/runtimes' && request.method === 'GET')
      return this.service.listRuntimes(user, request.query?.projectId);
    if (request.path === '/v1/sandbox/runtimes' && request.method === 'POST') {
      const input = parse(sandboxRuntimeCreateSchema.safeParse(request.body ?? {}));
      const projectId = String(request.query?.projectId ?? '');
      if (input.runtimeImage === undefined)
        return this.service.createRuntime(user, projectId, {
          networkMode: input.networkMode,
          allowedHosts: input.allowedHosts,
          allowedPorts: input.allowedPorts,
        });
      return this.service.createRuntime(user, projectId, {
        runtimeImage: input.runtimeImage,
        networkMode: input.networkMode,
        allowedHosts: input.allowedHosts,
        allowedPorts: input.allowedPorts,
      });
    }
    const match = /^\/v1\/sandbox\/runtimes\/([^/]+)(?:\/(.*))?$/u.exec(request.path);
    if (match === null)
      throw new SandboxRuntimeError('NOT_FOUND', 'Sandbox route was not found.');
    const runtimeId = match[1]!;
    const subpath = match[2] ?? '';
    if (subpath === '' && request.method === 'GET')
      return this.service.getRuntime(user, runtimeId);
    if (subpath === '' && request.method === 'DELETE')
      return this.service.destroyRuntime(user, runtimeId);
    if (subpath === 'start' && request.method === 'POST')
      return this.service.startRuntime(user, runtimeId);
    if (subpath === 'stop' && request.method === 'POST')
      return this.service.stopRuntime(user, runtimeId);
    if (subpath === 'restart' && request.method === 'POST')
      return this.service.restartRuntime(user, runtimeId);
    if (subpath === 'command' && request.method === 'POST') {
      const input = parse(sandboxRuntimeCommandSchema.safeParse(request.body ?? {}));
      return input.timeoutMs === undefined
        ? this.service.runCommand(user, runtimeId, { command: input.command })
        : this.service.runCommand(user, runtimeId, {
            command: input.command,
            timeoutMs: input.timeoutMs,
          });
    }
    if (subpath === 'tasks' && request.method === 'GET')
      return this.service.listTasks(user, runtimeId);
    if (subpath === 'tasks' && request.method === 'POST') {
      const input = parse(sandboxRuntimeTaskSchema.safeParse(request.body ?? {}));
      return input.timeoutMs === undefined
        ? this.service.runNamedTask(user, runtimeId, input.type)
        : this.service.runNamedTask(user, runtimeId, input.type, input.timeoutMs);
    }
    const taskCancel = /^tasks\/([^/]+)\/cancel$/u.exec(subpath);
    if (taskCancel !== null && request.method === 'POST') {
      parse(sandboxRuntimeTaskCancelSchema.safeParse(request.body ?? {}));
      return this.service.cancelTask(user, runtimeId, taskCancel[1]!);
    }
    if (subpath === 'logs' && request.method === 'GET')
      return this.service.listLogs(user, runtimeId, request.query?.cursor ?? null);
    if (subpath === 'usage' && request.method === 'GET')
      return this.service.usage(user, runtimeId);
    if (subpath === 'artifacts' && request.method === 'GET')
      return this.service.listArtifacts(user, runtimeId);
    if (subpath === 'problems' && request.method === 'GET')
      return this.service.listProblems(user, runtimeId);
    if (subpath === 'environment' && request.method === 'GET')
      return this.service.listEnvironment(user, runtimeId);
    if (subpath === 'environment' && request.method === 'POST')
      return this.service.injectSecretReference(
        user,
        runtimeId,
        parse(sandboxRuntimeEnvironmentSchema.safeParse(request.body ?? {})),
      );
    if (subpath === 'token-metadata' && request.method === 'GET')
      return this.service.getRuntimeTokenMetadata(user, runtimeId);
    if (subpath === 'recovery' && request.method === 'POST')
      return this.service.recoverRuntime(user, runtimeId);
    if (subpath === 'changes' && request.method === 'GET')
      return this.service.listWorkspaceChanges(user, runtimeId);
    if (subpath === 'changes/detect' && request.method === 'POST')
      return this.service.detectWorkspaceChanges(user, runtimeId);
    const change = /^changes\/([^/]+)$/u.exec(subpath);
    if (change !== null && request.method === 'PATCH')
      return this.service.reviewWorkspaceChange(
        user,
        runtimeId,
        change[1]!,
        parse(sandboxRuntimeChangeReviewSchema.safeParse(request.body ?? {})).action,
      );
    if (subpath === 'terminals' && request.method === 'GET')
      return this.service.listTerminalSessions(user, runtimeId);
    if (subpath === 'terminals' && request.method === 'POST')
      return this.service.openTerminal(
        user,
        runtimeId,
        parse(sandboxRuntimeTerminalOpenSchema.safeParse(request.body ?? {})),
      );
    const terminal = /^terminals\/([^/]+)\/(input|resize|close)$/u.exec(subpath);
    if (terminal !== null && terminal[2] === 'input' && request.method === 'POST')
      return this.service.writeTerminal(
        user,
        runtimeId,
        terminal[1]!,
        parse(sandboxRuntimeTerminalInputSchema.safeParse(request.body ?? {})).input,
      );
    if (terminal !== null && terminal[2] === 'resize' && request.method === 'POST')
      return this.service.resizeTerminal(
        user,
        runtimeId,
        terminal[1]!,
        parse(sandboxRuntimeTerminalResizeSchema.safeParse(request.body ?? {})),
      );
    if (terminal !== null && terminal[2] === 'close' && request.method === 'POST')
      return this.service.closeTerminal(user, runtimeId, terminal[1]!);
    if (subpath === 'ports' && request.method === 'POST')
      return this.service.exposePort(
        user,
        runtimeId,
        parse(sandboxRuntimePortSchema.safeParse(request.body ?? {})),
      );
    const preview = /^ports\/([^/]+)\/preview$/u.exec(subpath);
    if (preview !== null && request.method === 'POST')
      return this.service.createPreview(user, runtimeId, preview[1]!);
    const previewRead = /^previews\/([^/]+)$/u.exec(subpath);
    if (previewRead !== null && request.method === 'GET')
      return this.service.getPreview(user, runtimeId, previewRead[1]!);
    if (subpath === 'sync' && request.method === 'POST') {
      const input = parse(sandboxRuntimeSyncSchema.safeParse(request.body ?? {}));
      return this.service.syncWorkspace(
        user,
        runtimeId,
        input.changeIds,
        input.expectedWorkspaceVersion,
      );
    }
    if (subpath === 'inspect' && request.method === 'GET')
      return this.service.inspectAsRoot(user, runtimeId);
    throw new SandboxRuntimeError('NOT_FOUND', 'Sandbox route was not found.');
  }
}
