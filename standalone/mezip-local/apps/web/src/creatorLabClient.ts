import { createMeZipSdk, type CreatorLabSdk } from '@me-zip/sdk';
import type {
  ApiResponse,
  CreatorAIChangeSet,
  CreatorGitCommit,
  CreatorGitHubAuthorizationStart,
  CreatorGitHubConnection,
  CreatorGitStatus,
  CreatorProject,
  CreatorProjectExport,
  CreatorProjectPage,
  CreatorRelease,
  CreatorWorkspaceDiff,
  CreatorWorkspaceFile,
  CreatorWorkspaceFileView,
} from '@me-zip/shared-types';
import { FetchMessagingTransport } from './messagingClient.js';

export type CreatorLabClientSource = 'SERVER' | 'UNAVAILABLE';
export interface CreatorLabError { readonly code: string; readonly message: string; readonly retryable: boolean; }
export type CreatorLabResult<T> =
  | { readonly ok: true; readonly source: 'SERVER'; readonly data: T }
  | { readonly ok: false; readonly source: 'UNAVAILABLE'; readonly error: CreatorLabError };

export interface CreatorLabClient {
  readonly source: CreatorLabClientSource;
  listProjects(): Promise<CreatorLabResult<CreatorProjectPage>>;
  createProject(input: { readonly name: string; readonly description: string; readonly type: 'WEB' | 'MINI_PROGRAM' | 'SCRIPT' | 'LIBRARY' | 'DESIGN_CODE' | 'OTHER'; readonly visibility: 'PRIVATE' | 'UNLISTED' | 'PUBLISHED' }): Promise<CreatorLabResult<CreatorProject>>;
  listFiles(projectId: string): Promise<CreatorLabResult<readonly CreatorWorkspaceFile[]>>;
  searchFiles(projectId: string, query: string): Promise<CreatorLabResult<readonly CreatorWorkspaceFile[]>>;
  readFile(projectId: string, path: string): Promise<CreatorLabResult<CreatorWorkspaceFileView>>;
  updateFile(projectId: string, input: { readonly path: string; readonly content: string; readonly expectedChecksum: string; readonly expectedVersion: number }): Promise<CreatorLabResult<CreatorWorkspaceFile>>;
  getGitStatus(projectId: string): Promise<CreatorLabResult<CreatorGitStatus>>;
  getGitDiff(projectId: string): Promise<CreatorLabResult<CreatorWorkspaceDiff>>;
  getGitHistory(projectId: string): Promise<CreatorLabResult<readonly CreatorGitCommit[]>>;
  proposeAIChange(projectId: string, input: { readonly request: string; readonly scopePaths: readonly string[]; readonly expectedVersion: number }): Promise<CreatorLabResult<CreatorAIChangeSet>>;
  applyAIChange(projectId: string, changeId: string, expectedVersion: number): Promise<CreatorLabResult<CreatorAIChangeSet>>;
  rollbackAIChange(projectId: string, changeId: string): Promise<CreatorLabResult<CreatorAIChangeSet>>;
  beginGitHubAuthorization(): Promise<CreatorLabResult<CreatorGitHubAuthorizationStart>>;
  getGitHubConnection(): Promise<CreatorLabResult<CreatorGitHubConnection | null>>;
  completeGitHubAuthorization(input: { readonly code: string; readonly state: string }): Promise<CreatorLabResult<CreatorGitHubConnection>>;
  listReleases(projectId: string): Promise<CreatorLabResult<readonly CreatorRelease[]>>;
  exportProject(projectId: string): Promise<CreatorLabResult<CreatorProjectExport>>;
}

const unavailable = <T>(message = 'Creator Lab 服务尚未连接。'): CreatorLabResult<T> => ({
  ok: false,
  source: 'UNAVAILABLE',
  error: { code: 'SERVICE_UNAVAILABLE', message, retryable: true },
});

function fromSdk<T>(response: ApiResponse<T>): CreatorLabResult<T> {
  if ('data' in response) return { ok: true, source: 'SERVER', data: response.data };
  return { ok: false, source: 'UNAVAILABLE', error: { code: response.error.code, message: 'Creator Lab 请求未完成。', retryable: response.error.retryable } };
}

class ApiCreatorLabClient implements CreatorLabClient {
  readonly source = 'SERVER' as const;
  constructor(private readonly sdk: CreatorLabSdk) {}
  listProjects() { return this.sdk.listProjects().then(fromSdk); }
  createProject(input: Parameters<CreatorLabClient['createProject']>[0]) { return this.sdk.createProject(input).then(fromSdk); }
  listFiles(projectId: string) { return this.sdk.listFiles(projectId).then((result) => fromSdk(result) as CreatorLabResult<readonly CreatorWorkspaceFile[]>); }
  searchFiles(projectId: string, query: string) { return this.sdk.searchFiles(projectId, query).then((result) => fromSdk(result) as CreatorLabResult<readonly CreatorWorkspaceFile[]>); }
  readFile(projectId: string, path: string) { return this.sdk.readFile(projectId, path).then(fromSdk); }
  updateFile(projectId: string, input: Parameters<CreatorLabClient['updateFile']>[1]) { return this.sdk.updateFile(projectId, input).then(fromSdk); }
  getGitStatus(projectId: string) { return this.sdk.getGitStatus(projectId).then(fromSdk); }
  getGitDiff(projectId: string) { return this.sdk.getGitDiff(projectId).then(fromSdk); }
  getGitHistory(projectId: string) { return this.sdk.getGitHistory(projectId).then((result) => fromSdk(result) as CreatorLabResult<readonly CreatorGitCommit[]>); }
  proposeAIChange(projectId: string, input: Parameters<CreatorLabClient['proposeAIChange']>[1]) { return this.sdk.proposeAIChange(projectId, input).then(fromSdk); }
  applyAIChange(projectId: string, changeId: string, expectedVersion: number) { return this.sdk.applyAIChange(projectId, changeId, expectedVersion).then(fromSdk); }
  rollbackAIChange(projectId: string, changeId: string) { return this.sdk.rollbackAIChange(projectId, changeId).then(fromSdk); }
  beginGitHubAuthorization() { return this.sdk.beginGitHubAuthorization().then(fromSdk); }
  getGitHubConnection() { return this.sdk.getGitHubConnection().then(fromSdk); }
  completeGitHubAuthorization(input: { readonly code: string; readonly state: string }) { return this.sdk.completeGitHubAuthorization(input).then(fromSdk); }
  listReleases(projectId: string) { return this.sdk.listReleases(projectId).then((result) => fromSdk(result) as CreatorLabResult<readonly CreatorRelease[]>); }
  exportProject(projectId: string) { return this.sdk.exportProject(projectId).then(fromSdk); }
}

function configuredBaseUrl(): string | null {
  const raw = import.meta.env.VITE_MEZIP_CREATOR_API_BASE_URL;
  if (typeof raw !== 'string' || raw.trim().length === 0) return null;
  try {
    const url = new URL(raw.trim());
    if (!['http:', 'https:'].includes(url.protocol) || url.username || url.password || url.search || url.hash) return null;
    if (import.meta.env.PROD && url.protocol !== 'https:') return null;
    return url.origin + (url.pathname === '/' ? '' : url.pathname.replace(/\/$/u, ''));
  } catch { return null; }
}

export function createCreatorLabClient(): CreatorLabClient {
  const baseUrl = configuredBaseUrl();
  if (baseUrl === null) return { source: 'UNAVAILABLE', listProjects: async () => unavailable(), createProject: async () => unavailable(), listFiles: async () => unavailable(), searchFiles: async () => unavailable(), readFile: async () => unavailable(), updateFile: async () => unavailable(), getGitStatus: async () => unavailable(), getGitDiff: async () => unavailable(), getGitHistory: async () => unavailable(), proposeAIChange: async () => unavailable(), applyAIChange: async () => unavailable(), rollbackAIChange: async () => unavailable(), beginGitHubAuthorization: async () => unavailable('GitHub 授权服务尚未连接。'), getGitHubConnection: async () => unavailable('GitHub 授权服务尚未连接。'), completeGitHubAuthorization: async () => unavailable('GitHub 授权服务尚未连接。'), listReleases: async () => unavailable(), exportProject: async () => unavailable() };
  return new ApiCreatorLabClient(createMeZipSdk(new FetchMessagingTransport({ baseUrl })).creatorLab);
}

export const creatorLabClient = createCreatorLabClient();
