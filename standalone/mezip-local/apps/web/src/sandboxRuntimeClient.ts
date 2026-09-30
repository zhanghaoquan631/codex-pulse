import { createMeZipSdk, type SandboxRuntimeSdk } from '@me-zip/sdk';
import type {
  ApiResponse,
  SandboxPreview,
  SandboxRuntime,
  SandboxRuntimeArtifact,
  SandboxRuntimeLog,
  SandboxRuntimeLogPage,
  SandboxRuntimePage,
  SandboxRuntimeProblemPage,
  SandboxRuntimeTask,
  SandboxRuntimeTaskPage,
  SandboxRuntimeTaskType,
  SandboxRuntimeUsage,
  SandboxTerminalSession,
  SandboxTerminalSessionPage,
  SandboxWorkspaceChange,
} from '@me-zip/shared-types';
import { FetchMessagingTransport } from './messagingClient.js';

export type SandboxRuntimeClientSource = 'SERVER' | 'UNAVAILABLE';
export type SandboxRuntimeResult<T> =
  | { readonly ok: true; readonly source: 'SERVER'; readonly data: T }
  | {
      readonly ok: false;
      readonly source: 'UNAVAILABLE';
      readonly error: {
        readonly code: string;
        readonly message: string;
        readonly retryable: boolean;
      };
    };

export interface SandboxRuntimeClient {
  readonly source: SandboxRuntimeClientSource;
  listRuntimes(projectId?: string): Promise<SandboxRuntimeResult<SandboxRuntimePage>>;
  createRuntime(projectId: string): Promise<SandboxRuntimeResult<SandboxRuntime>>;
  startRuntime(runtimeId: string): Promise<SandboxRuntimeResult<SandboxRuntime>>;
  stopRuntime(runtimeId: string): Promise<SandboxRuntimeResult<SandboxRuntime>>;
  restartRuntime(runtimeId: string): Promise<SandboxRuntimeResult<SandboxRuntime>>;
  runTask(
    runtimeId: string,
    type: SandboxRuntimeTaskType,
  ): Promise<SandboxRuntimeResult<SandboxRuntimeTask>>;
  cancelTask(
    runtimeId: string,
    taskId: string,
  ): Promise<SandboxRuntimeResult<SandboxRuntimeTask>>;
  runCommand(
    runtimeId: string,
    command: string,
  ): Promise<SandboxRuntimeResult<SandboxRuntimeTask>>;
  listTasks(runtimeId: string): Promise<SandboxRuntimeResult<SandboxRuntimeTaskPage>>;
  listLogs(runtimeId: string): Promise<SandboxRuntimeResult<SandboxRuntimeLogPage>>;
  exposePort(
    runtimeId: string,
    input: { readonly internalPort: number; readonly protocol: 'HTTP' | 'HTTPS' | 'WS' },
  ): Promise<SandboxRuntimeResult<{ readonly id: string; readonly runtimeId: string; readonly internalPort: number; readonly protocol: 'HTTP' | 'HTTPS' | 'WS'; readonly status: 'RESERVED' | 'EXPOSED' | 'RELEASED' }>>;
  createPreview(
    runtimeId: string,
    portId: string,
  ): Promise<SandboxRuntimeResult<SandboxPreview>>;
  getPreview(
    runtimeId: string,
    previewId: string,
  ): Promise<SandboxRuntimeResult<SandboxPreview>>;
  getUsage(runtimeId: string): Promise<SandboxRuntimeResult<SandboxRuntimeUsage>>;
  listProblems(
    runtimeId: string,
  ): Promise<SandboxRuntimeResult<SandboxRuntimeProblemPage>>;
  listArtifacts(
    runtimeId: string,
  ): Promise<SandboxRuntimeResult<readonly SandboxRuntimeArtifact[]>>;
  detectWorkspaceChanges(
    runtimeId: string,
  ): Promise<SandboxRuntimeResult<readonly SandboxWorkspaceChange[]>>;
  listWorkspaceChanges(
    runtimeId: string,
  ): Promise<SandboxRuntimeResult<readonly SandboxWorkspaceChange[]>>;
  reviewWorkspaceChange(
    runtimeId: string,
    changeId: string,
    action: 'REVIEW' | 'REJECT' | 'APPLY',
  ): Promise<SandboxRuntimeResult<SandboxWorkspaceChange>>;
  listTerminals(
    runtimeId: string,
  ): Promise<SandboxRuntimeResult<SandboxTerminalSessionPage>>;
  openTerminal(
    runtimeId: string,
  ): Promise<SandboxRuntimeResult<SandboxTerminalSession>>;
  writeTerminal(
    runtimeId: string,
    sessionId: string,
    input: string,
  ): Promise<SandboxRuntimeResult<SandboxRuntimeLog>>;
  closeTerminal(
    runtimeId: string,
    sessionId: string,
  ): Promise<SandboxRuntimeResult<SandboxTerminalSession>>;
}

const unavailable = <T>(
  message = 'Sandbox 服务尚未连接。',
): SandboxRuntimeResult<T> => ({
  ok: false,
  source: 'UNAVAILABLE',
  error: { code: 'SERVICE_UNAVAILABLE', message, retryable: true },
});
function fromSdk<T>(response: ApiResponse<T>): SandboxRuntimeResult<T> {
  return 'data' in response
    ? { ok: true, source: 'SERVER', data: response.data }
    : unavailable('Sandbox 请求未完成。');
}

class ApiSandboxRuntimeClient implements SandboxRuntimeClient {
  readonly source = 'SERVER' as const;
  public constructor(private readonly sdk: SandboxRuntimeSdk) {}
  listRuntimes(projectId?: string) {
    return this.sdk.listRuntimes(projectId).then(fromSdk);
  }
  createRuntime(projectId: string) {
    return this.sdk
      .createRuntime(projectId, {
        networkMode: 'DENY_ALL',
        allowedHosts: [],
        allowedPorts: [],
      })
      .then(fromSdk);
  }
  startRuntime(runtimeId: string) {
    return this.sdk.startRuntime(runtimeId).then(fromSdk);
  }
  stopRuntime(runtimeId: string) {
    return this.sdk.stopRuntime(runtimeId).then(fromSdk);
  }
  restartRuntime(runtimeId: string) {
    return this.sdk.restartRuntime(runtimeId).then(fromSdk);
  }
  runTask(runtimeId: string, type: SandboxRuntimeTaskType) {
    return this.sdk.runTask(runtimeId, type).then(fromSdk);
  }
  cancelTask(runtimeId: string, taskId: string) {
    return this.sdk.cancelTask(runtimeId, taskId).then(fromSdk);
  }
  runCommand(runtimeId: string, command: string) {
    return this.sdk.runCommand(runtimeId, { command }).then(fromSdk);
  }
  listTasks(runtimeId: string) {
    return this.sdk.listTasks(runtimeId).then(fromSdk);
  }
  listLogs(runtimeId: string) {
    return this.sdk.listLogs(runtimeId).then(fromSdk);
  }
  exposePort(runtimeId: string, input: { readonly internalPort: number; readonly protocol: 'HTTP' | 'HTTPS' | 'WS' }) {
    return this.sdk.exposePort(runtimeId, input).then(fromSdk);
  }
  createPreview(runtimeId: string, portId: string) {
    return this.sdk.createPreview(runtimeId, portId).then(fromSdk);
  }
  getPreview(runtimeId: string, previewId: string) {
    return this.sdk.getPreview(runtimeId, previewId).then(fromSdk);
  }
  getUsage(runtimeId: string) {
    return this.sdk.getUsage(runtimeId).then(fromSdk);
  }
  listProblems(runtimeId: string) {
    return this.sdk.listProblems(runtimeId).then(fromSdk);
  }
  listArtifacts(runtimeId: string) {
    return this.sdk.listArtifacts(runtimeId).then(fromSdk);
  }
  detectWorkspaceChanges(runtimeId: string) {
    return this.sdk.detectWorkspaceChanges(runtimeId).then(fromSdk);
  }
  listWorkspaceChanges(runtimeId: string) {
    return this.sdk.listWorkspaceChanges(runtimeId).then(fromSdk);
  }
  reviewWorkspaceChange(
    runtimeId: string,
    changeId: string,
    action: 'REVIEW' | 'REJECT' | 'APPLY',
  ) {
    return this.sdk.reviewWorkspaceChange(runtimeId, changeId, action).then(fromSdk);
  }
  listTerminals(runtimeId: string) {
    return this.sdk.listTerminals(runtimeId).then(fromSdk);
  }
  openTerminal(runtimeId: string) {
    return this.sdk.openTerminal(runtimeId).then(fromSdk);
  }
  writeTerminal(runtimeId: string, sessionId: string, input: string) {
    return this.sdk.writeTerminal(runtimeId, sessionId, input).then(fromSdk);
  }
  closeTerminal(runtimeId: string, sessionId: string) {
    return this.sdk.closeTerminal(runtimeId, sessionId).then(fromSdk);
  }
}

function configuredBaseUrl(): string | null {
  const raw = import.meta.env.VITE_MEZIP_SANDBOX_API_BASE_URL;
  if (typeof raw !== 'string' || raw.trim().length === 0) return null;
  try {
    const url = new URL(raw.trim());
    if (
      !['http:', 'https:'].includes(url.protocol) ||
      url.username ||
      url.password ||
      url.search ||
      url.hash ||
      (url.pathname !== '/' && url.pathname.endsWith('/'))
    )
      return null;
    if (import.meta.env.PROD && url.protocol !== 'https:') return null;
    return url.origin + (url.pathname === '/' ? '' : url.pathname);
  } catch {
    return null;
  }
}

export function createSandboxRuntimeClient(): SandboxRuntimeClient {
  const baseUrl = configuredBaseUrl();
  if (baseUrl === null)
    return {
      source: 'UNAVAILABLE',
      listRuntimes: async () => unavailable(),
      createRuntime: async () => unavailable(),
      startRuntime: async () => unavailable(),
      stopRuntime: async () => unavailable(),
      restartRuntime: async () => unavailable(),
      runTask: async () => unavailable(),
      cancelTask: async () => unavailable(),
      runCommand: async () => unavailable(),
      listTasks: async () => unavailable(),
      listLogs: async () => unavailable(),
      exposePort: async () => unavailable(),
      createPreview: async () => unavailable(),
      getPreview: async () => unavailable(),
      getUsage: async () => unavailable(),
      listProblems: async () => unavailable(),
      listArtifacts: async () => unavailable(),
      detectWorkspaceChanges: async () => unavailable(),
      listWorkspaceChanges: async () => unavailable(),
      reviewWorkspaceChange: async () => unavailable(),
      listTerminals: async () => unavailable(),
      openTerminal: async () => unavailable(),
      writeTerminal: async () => unavailable(),
      closeTerminal: async () => unavailable(),
    };
  return new ApiSandboxRuntimeClient(
    createMeZipSdk(new FetchMessagingTransport({ baseUrl })).sandboxRuntime,
  );
}

export const sandboxRuntimeClient = createSandboxRuntimeClient();
