import { createMeZipSdk, type DeploymentSdk } from '@me-zip/sdk';
import type { ApiResponse, CustomDomain, Deployment, DeploymentHealthCheck, DeploymentLogPage, DeploymentPage, DeploymentUsage, PreviewShare, ProjectPublication, ProjectPublishSettings } from '@me-zip/shared-types';
import { FetchMessagingTransport } from './messagingClient.js';

export interface DeploymentClientError { readonly code: string; readonly message: string; readonly retryable: boolean; }
export type DeploymentResult<T> =
  | { readonly ok: true; readonly source: 'SERVER'; readonly data: T }
  | { readonly ok: false; readonly source: 'UNAVAILABLE'; readonly error: DeploymentClientError };

export interface DeploymentClient {
  readonly source: 'SERVER' | 'UNAVAILABLE';
  listDeployments(projectId: string): Promise<DeploymentResult<DeploymentPage>>;
  createDeployment(input: Parameters<DeploymentSdk['createDeployment']>[0]): Promise<DeploymentResult<Deployment>>;
  getLogs(deploymentId: string): Promise<DeploymentResult<DeploymentLogPage>>;
  getHealth(deploymentId: string): Promise<DeploymentResult<DeploymentHealthCheck>>;
  rollbackDeployment(deploymentId: string, targetDeploymentId: string, confirmProduction: boolean): Promise<DeploymentResult<Deployment>>;
  createPreviewShare(deploymentId: string): Promise<DeploymentResult<PreviewShare>>;
  revokePreviewShare(shareId: string): Promise<DeploymentResult<PreviewShare>>;
  listDomains(projectId: string): Promise<DeploymentResult<readonly CustomDomain[]>>;
  addDomain(input: Parameters<DeploymentSdk['addDomain']>[0]): Promise<DeploymentResult<CustomDomain>>;
  verifyDomain(domainId: string): Promise<DeploymentResult<CustomDomain>>;
  getUsage(projectId: string): Promise<DeploymentResult<DeploymentUsage>>;
  getPublishSettings(projectId: string): Promise<DeploymentResult<ProjectPublishSettings>>;
  publishProject(projectId: string, input?: Parameters<DeploymentSdk['publishProject']>[1]): Promise<DeploymentResult<ProjectPublication>>;
  unpublishProject(projectId: string): Promise<DeploymentResult<ProjectPublishSettings>>;
}

const unavailable = <T>(message = '部署服务尚未连接。'): DeploymentResult<T> => ({
  ok: false,
  source: 'UNAVAILABLE',
  error: { code: 'SERVICE_UNAVAILABLE', message, retryable: true },
});

function fromSdk<T>(response: ApiResponse<T>): DeploymentResult<T> {
  if ('data' in response) return { ok: true, source: 'SERVER', data: response.data };
  return { ok: false, source: 'UNAVAILABLE', error: { code: response.error.code, message: '部署请求未完成。', retryable: response.error.retryable } };
}

function configuredBaseUrl(): string | null {
  const raw = import.meta.env.VITE_MEZIP_DEPLOYMENT_API_BASE_URL;
  if (typeof raw !== 'string' || raw.trim().length === 0) return null;
  try {
    const url = new URL(raw.trim());
    if (!['http:', 'https:'].includes(url.protocol) || url.username || url.password || url.search || url.hash) return null;
    if (import.meta.env.PROD && url.protocol !== 'https:') return null;
    return url.origin + (url.pathname === '/' ? '' : url.pathname.replace(/\/$/u, ''));
  } catch { return null; }
}

class ApiDeploymentClient implements DeploymentClient {
  readonly source = 'SERVER' as const;
  public constructor(private readonly sdk: DeploymentSdk) {}
  listDeployments(projectId: string) { return this.sdk.listDeployments(projectId).then(fromSdk); }
  createDeployment(input: Parameters<DeploymentSdk['createDeployment']>[0]) { return this.sdk.createDeployment(input).then(fromSdk); }
  getLogs(deploymentId: string) { return this.sdk.getLogs(deploymentId).then(fromSdk); }
  getHealth(deploymentId: string) { return this.sdk.getHealth(deploymentId).then(fromSdk); }
  rollbackDeployment(deploymentId: string, targetDeploymentId: string, confirmProduction: boolean) { return this.sdk.rollbackDeployment(deploymentId, { targetDeploymentId, confirmProduction: confirmProduction as true }).then(fromSdk); }
  createPreviewShare(deploymentId: string) { return this.sdk.createPreviewShare(deploymentId, { visibility: 'LINK_ONLY', expiresInDays: 1 }).then(fromSdk); }
  revokePreviewShare(shareId: string) { return this.sdk.revokePreviewShare(shareId).then(fromSdk); }
  listDomains(projectId: string) { return this.sdk.listDomains(projectId).then(fromSdk); }
  addDomain(input: Parameters<DeploymentSdk['addDomain']>[0]) { return this.sdk.addDomain(input).then(fromSdk); }
  verifyDomain(domainId: string) { return this.sdk.verifyDomain(domainId).then(fromSdk); }
  getUsage(projectId: string) { return this.sdk.getUsage(projectId).then(fromSdk); }
  getPublishSettings(projectId: string) { return this.sdk.getPublishSettings(projectId).then(fromSdk); }
  publishProject(projectId: string, input?: Parameters<DeploymentSdk['publishProject']>[1]) { return this.sdk.publishProject(projectId, input).then(fromSdk); }
  unpublishProject(projectId: string) { return this.sdk.unpublishProject(projectId).then(fromSdk); }
}

export function createDeploymentClient(): DeploymentClient {
  const baseUrl = configuredBaseUrl();
  if (baseUrl === null) {
    return {
      source: 'UNAVAILABLE',
      listDeployments: async () => unavailable(), createDeployment: async () => unavailable(), getLogs: async () => unavailable(), getHealth: async () => unavailable(), rollbackDeployment: async () => unavailable(), createPreviewShare: async () => unavailable(), revokePreviewShare: async () => unavailable(), listDomains: async () => unavailable(), addDomain: async () => unavailable(), verifyDomain: async () => unavailable(), getUsage: async () => unavailable(), getPublishSettings: async () => unavailable(), publishProject: async () => unavailable(), unpublishProject: async () => unavailable(),
    };
  }
  return new ApiDeploymentClient(createMeZipSdk(new FetchMessagingTransport({ baseUrl })).deployment);
}

export const deploymentClient = createDeploymentClient();
