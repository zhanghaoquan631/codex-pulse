import { createMeZipSdk, type ExternalIdentitySdk } from '@me-zip/sdk';
import type {
  ApiResponse,
  ExternalAppLaunchPlan,
  ExternalIdentity,
  ExternalIdentityConnection,
  ExternalIdentityProviderInfo,
} from '@me-zip/shared-types';
import { FetchMessagingTransport } from './messagingClient.js';

export type ExternalIdentityClientSource = 'SERVER' | 'UNAVAILABLE';
export interface ExternalIdentityClientError { readonly code: string; readonly message: string; readonly retryable: boolean; }
export type ExternalIdentityClientResult<T> =
  | { readonly ok: true; readonly source: 'SERVER'; readonly data: T }
  | { readonly ok: false; readonly source: 'UNAVAILABLE'; readonly error: ExternalIdentityClientError };

export interface ExternalIdentityClient {
  readonly source: ExternalIdentityClientSource;
  listProviders(): Promise<ExternalIdentityClientResult<readonly ExternalIdentityProviderInfo[]>>;
  listIdentities(): Promise<ExternalIdentityClientResult<readonly ExternalIdentity[]>>;
  listConnections(): Promise<ExternalIdentityClientResult<readonly ExternalIdentityConnection[]>>;
  createManualIdentity(input: Parameters<ExternalIdentitySdk['createManualIdentity']>[0]): Promise<ExternalIdentityClientResult<ExternalIdentity>>;
  updateIdentity(input: Parameters<ExternalIdentitySdk['updateIdentity']>[0]): Promise<ExternalIdentityClientResult<ExternalIdentity>>;
  setVisibility(identityId: string, visibility: 'PRIVATE' | 'PUBLIC'): Promise<ExternalIdentityClientResult<ExternalIdentity>>;
  reorder(identityIds: readonly string[]): Promise<ExternalIdentityClientResult<readonly ExternalIdentity[]>>;
  deleteIdentity(identityId: string): Promise<ExternalIdentityClientResult<{ readonly deleted: true }>>;
  disconnect(identityId: string): Promise<ExternalIdentityClientResult<ExternalIdentity>>;
  launch(identityId: string, action: 'OPEN' | 'COPY' | 'QR'): Promise<ExternalIdentityClientResult<ExternalAppLaunchPlan>>;
  startOAuth(input: { readonly provider: 'X' | 'GITHUB'; readonly redirectUri: string }): Promise<ExternalIdentityClientResult<{ readonly authorizationUrl: string }>>;
}

const unavailable = <T>(message = 'Connected Apps 服务尚未连接。'): ExternalIdentityClientResult<T> => ({
  ok: false, source: 'UNAVAILABLE', error: { code: 'SERVICE_UNAVAILABLE', message, retryable: true },
});

function fromSdk<T>(response: ApiResponse<T>): ExternalIdentityClientResult<T> {
  if ('data' in response) return { ok: true, source: 'SERVER', data: response.data };
  return { ok: false, source: 'UNAVAILABLE', error: { code: response.error.code, message: 'Connected Apps 请求未完成。', retryable: response.error.retryable } };
}

function configuredBaseUrl(): string | null {
  const raw = import.meta.env.VITE_MEZIP_EXTERNAL_IDENTITY_API_BASE_URL;
  if (typeof raw !== 'string' || raw.trim().length === 0) return null;
  try {
    const url = new URL(raw.trim());
    if (!['http:', 'https:'].includes(url.protocol) || url.username || url.password || url.search || url.hash) return null;
    if (import.meta.env.PROD && url.protocol !== 'https:') return null;
    return url.origin + (url.pathname === '/' ? '' : url.pathname.replace(/\/$/u, ''));
  } catch {
    return null;
  }
}

class ApiExternalIdentityClient implements ExternalIdentityClient {
  readonly source = 'SERVER' as const;
  public constructor(private readonly sdk: ExternalIdentitySdk) {}
  listProviders() { return this.sdk.listProviders().then(fromSdk); }
  listIdentities() { return this.sdk.listIdentities().then(fromSdk); }
  listConnections() { return this.sdk.listConnections().then(fromSdk); }
  createManualIdentity(input: Parameters<ExternalIdentitySdk['createManualIdentity']>[0]) { return this.sdk.createManualIdentity(input).then(fromSdk); }
  updateIdentity(input: Parameters<ExternalIdentitySdk['updateIdentity']>[0]) { return this.sdk.updateIdentity(input).then(fromSdk); }
  setVisibility(identityId: string, visibility: 'PRIVATE' | 'PUBLIC') { return this.sdk.setVisibility(identityId, visibility).then(fromSdk); }
  reorder(identityIds: readonly string[]) { return this.sdk.reorder(identityIds).then(fromSdk); }
  deleteIdentity(identityId: string) { return this.sdk.deleteIdentity(identityId).then(fromSdk); }
  disconnect(identityId: string) { return this.sdk.disconnect(identityId).then(fromSdk); }
  launch(identityId: string, action: 'OPEN' | 'COPY' | 'QR') { return this.sdk.launch(identityId, action).then(fromSdk); }
  startOAuth(input: { readonly provider: 'X' | 'GITHUB'; readonly redirectUri: string }) {
    return this.sdk.startOAuth(input).then((result) => {
      const mapped = fromSdk(result);
      return mapped.ok ? { ...mapped, data: { authorizationUrl: mapped.data.authorizationUrl } } : mapped;
    });
  }
}

function unavailableClient(): ExternalIdentityClient {
  return {
    source: 'UNAVAILABLE',
    listProviders: async () => unavailable(), listIdentities: async () => unavailable(), listConnections: async () => unavailable(),
    createManualIdentity: async () => unavailable(), updateIdentity: async () => unavailable(), setVisibility: async () => unavailable(), reorder: async () => unavailable(), deleteIdentity: async () => unavailable(), disconnect: async () => unavailable(), launch: async () => unavailable(),
    startOAuth: async () => unavailable('官方 OAuth 服务尚未配置。'),
  };
}

export function createExternalIdentityClient(): ExternalIdentityClient {
  const baseUrl = configuredBaseUrl();
  return baseUrl === null ? unavailableClient() : new ApiExternalIdentityClient(createMeZipSdk(new FetchMessagingTransport({ baseUrl })).externalIdentity);
}

/** The sole browser-side external-launch boundary. It accepts a server plan
 * and re-checks the HTTPS origin before navigation or copy. */
export async function executeExternalAppLaunch(plan: ExternalAppLaunchPlan): Promise<string> {
  if (plan.action === 'OPEN_HTTPS' && plan.href !== null) {
    let url: URL;
    try { url = new URL(plan.href); } catch { return '外部链接无效，未打开。'; }
    if (url.protocol !== 'https:' || url.username || url.password || url.search || url.hash) return '外部链接无效，未打开。';
    window.location.assign(url.toString());
    return '正在打开已验证的外部页面。';
  }
  if (plan.action === 'COPY' && plan.copyText !== null) {
    try { await navigator.clipboard.writeText(plan.copyText); return '公开标识已复制。'; } catch { return '无法复制，请手动查看公开标识。'; }
  }
  if (plan.action === 'SHOW_QR') return '二维码由受保护的媒体服务提供；当前 Web 连接尚未配置。';
  return plan.message;
}

/** OAuth only navigates to a server-validated, official authorization URL.
 * The PKCE verifier and provider tokens remain on the server. */
export function openOfficialOAuthAuthorization(raw: string): string {
  let url: URL;
  try { url = new URL(raw); } catch { return 'OAuth 授权地址无效，未打开。'; }
  const host = url.hostname.toLowerCase();
  const isX = (host === 'x.com' || host === 'www.x.com') && url.pathname === '/i/oauth2/authorize';
  const isGitHub = (host === 'github.com' || host === 'www.github.com') && url.pathname === '/login/oauth/authorize';
  if (url.protocol !== 'https:' || url.username || url.password || url.hash || (!isX && !isGitHub)) return 'OAuth 授权地址不在官方允许列表中。';
  window.location.assign(url.toString());
  return '正在前往官方授权页面。';
}

export const externalIdentityClient = createExternalIdentityClient();
