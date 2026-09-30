import { createMeZipSdk, type CreatorEcosystemSdk } from '@me-zip/sdk';
import type {
  ApiResponse,
  CreatorHome,
  CreatorProfile,
  CreatorProjectDetail,
  CreatorProjectMetadata,
  CreatorProjectSourceFile,
  CreatorProjectStats,
  CreatorPublishedProjectSnapshot,
} from '@me-zip/shared-types';
import { FetchMessagingTransport } from './messagingClient.js';

export type CreatorEcosystemClientSource = 'SERVER' | 'UNAVAILABLE';
export type CreatorEcosystemResult<T> =
  | { readonly ok: true; readonly data: T }
  | { readonly ok: false; readonly code: string; readonly message: string; readonly retryable: boolean };

export interface CreatorEcosystemClient {
  readonly source: CreatorEcosystemClientSource;
  getHome(): Promise<CreatorEcosystemResult<CreatorHome>>;
  getProfile(): Promise<CreatorEcosystemResult<CreatorProfile>>;
  getProject(projectId: string): Promise<CreatorEcosystemResult<CreatorProjectDetail>>;
  updateProjectMetadata(projectId: string, input: Parameters<CreatorEcosystemSdk['updateProjectMetadata']>[1]): Promise<CreatorEcosystemResult<CreatorProjectMetadata>>;
  publishProject(projectId: string, input: Parameters<CreatorEcosystemSdk['publishProject']>[1]): Promise<CreatorEcosystemResult<CreatorPublishedProjectSnapshot>>;
  unpublishProject(projectId: string): Promise<CreatorEcosystemResult<CreatorProjectMetadata>>;
  readSource(projectId: string, path: string): Promise<CreatorEcosystemResult<CreatorProjectSourceFile>>;
  getStats(projectId: string): Promise<CreatorEcosystemResult<CreatorProjectStats>>;
}

function unavailable<T>(message = 'Creator Ecosystem 服务尚未连接。'): CreatorEcosystemResult<T> {
  return { ok: false, code: 'SERVICE_UNAVAILABLE', message, retryable: true };
}

function fromApi<T>(response: ApiResponse<T>): CreatorEcosystemResult<T> {
  return 'data' in response
    ? { ok: true, data: response.data }
    : { ok: false, code: response.error.code, message: 'Creator Ecosystem 请求未完成。', retryable: response.error.retryable };
}

class ApiCreatorEcosystemClient implements CreatorEcosystemClient {
  public readonly source = 'SERVER' as const;
  public constructor(private readonly sdk: CreatorEcosystemSdk) {}
  public getHome() { return this.sdk.getHome().then(fromApi); }
  public getProfile() { return this.sdk.getProfile().then(fromApi); }
  public getProject(projectId: string) { return this.sdk.getProject(projectId).then(fromApi); }
  public updateProjectMetadata(projectId: string, input: Parameters<CreatorEcosystemSdk['updateProjectMetadata']>[1]) { return this.sdk.updateProjectMetadata(projectId, input).then(fromApi); }
  public publishProject(projectId: string, input: Parameters<CreatorEcosystemSdk['publishProject']>[1]) { return this.sdk.publishProject(projectId, input).then(fromApi); }
  public unpublishProject(projectId: string) { return this.sdk.unpublishProject(projectId).then(fromApi); }
  public readSource(projectId: string, path: string) { return this.sdk.readSource(projectId, path).then(fromApi); }
  public getStats(projectId: string) { return this.sdk.getStats(projectId).then(fromApi); }
}

export function resolveCreatorEcosystemApiBase(raw: unknown, production: boolean): string | null {
  if (typeof raw !== 'string' || raw.trim().length === 0) return null;
  try {
    const url = new URL(raw.trim());
    if (!['http:', 'https:'].includes(url.protocol) || url.username || url.password || url.search || url.hash) return null;
    if (production && url.protocol !== 'https:') return null;
    return url.origin + (url.pathname === '/' ? '' : url.pathname.replace(/\/$/u, ''));
  } catch {
    return null;
  }
}

export function createCreatorEcosystemClient(raw = import.meta.env.VITE_MEZIP_CREATOR_ECOSYSTEM_API_BASE_URL, production = import.meta.env.PROD): CreatorEcosystemClient {
  const baseUrl = resolveCreatorEcosystemApiBase(raw, production);
  if (baseUrl === null) {
    return {
      source: 'UNAVAILABLE',
      getHome: async () => unavailable(),
      getProfile: async () => unavailable(),
      getProject: async () => unavailable(),
      updateProjectMetadata: async () => unavailable(),
      publishProject: async () => unavailable(),
      unpublishProject: async () => unavailable(),
      readSource: async () => unavailable(),
      getStats: async () => unavailable(),
    };
  }
  return new ApiCreatorEcosystemClient(createMeZipSdk(new FetchMessagingTransport({ baseUrl })).creatorEcosystem);
}

export const creatorEcosystemClient = createCreatorEcosystemClient();
