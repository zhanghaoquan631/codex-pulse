/**
 * Browser boundary for the X Connection Center.
 *
 * This file intentionally owns every X-facing browser request.  It only talks
 * to ME.zip's authenticated Social API; it never calls X directly and never
 * receives or persists an X access/refresh token.
 */
import { createMeZipSdk, type SocialSdk } from '@me-zip/sdk';
import type {
  ApiResponse,
  ExternalSocialAccount,
  SocialArchiveItem,
  SocialCollection,
  SocialProviderSummary,
  SocialSyncStatus,
} from '@me-zip/shared-types';
import { FetchMessagingTransport } from './messagingClient.js';

export const xRequestedReadScopes = [
  'tweet.read',
  'users.read',
  'offline.access',
  'like.read',
  'bookmark.read',
] as const;

export type XCenterAvailability = 'SERVER' | 'UNAVAILABLE';
export type XFeedKind = 'MY_TWEETS' | 'BOOKMARKED' | 'LIKED';

export interface XPostMetrics {
  readonly likeCount: number | null;
  readonly replyCount: number | null;
  readonly repostCount: number | null;
  readonly quoteCount: number | null;
  readonly impressionCount: number | null;
}

export interface XPostReference {
  readonly type: string;
  readonly canonicalUrl: string;
  readonly textExcerpt: string | null;
  readonly authorName: string | null;
  readonly authorUsername: string | null;
}

export interface XCenterContent {
  readonly archiveItem: SocialArchiveItem;
  readonly feed: XFeedKind;
  readonly authorName: string | null;
  readonly authorUsername: string | null;
  readonly authorAvatarUrl: string | null;
  readonly media: readonly { readonly type: string; readonly url: string | null; readonly previewImageUrl: string | null }[];
  readonly references: readonly XPostReference[];
  readonly metrics: XPostMetrics;
  readonly isReply: boolean;
  readonly isQuote: boolean;
}

export interface XCenterView {
  readonly availability: XCenterAvailability;
  readonly provider: SocialProviderSummary | null;
  readonly account: ExternalSocialAccount | null;
  readonly syncStatus: SocialSyncStatus | null;
  readonly contents: readonly XCenterContent[];
  readonly collections: readonly SocialCollection[];
  readonly message: string | null;
}

export interface XCenterClient {
  load(): Promise<XCenterView>;
  startConnection(): Promise<void>;
  completeCallback(): Promise<boolean>;
  sync(accountId: string): Promise<void>;
  refreshAuthorization(accountId: string): Promise<void>;
  updateAccountSettings(accountId: string, input: { readonly requestedScopes?: readonly string[]; readonly autoSync?: boolean }): Promise<void>;
  disconnect(accountId: string): Promise<void>;
  updateArchiveItem(itemId: string, input: { readonly note?: string | null; readonly tags?: readonly string[]; readonly collectionIds?: readonly string[] }): Promise<SocialArchiveItem>;
  createCollection(input: { readonly name: string; readonly description?: string | null }): Promise<SocialCollection>;
  addToCollection(collectionId: string, archiveItemId: string): Promise<SocialCollection>;
  deleteImportedData(accountId: string): Promise<number>;
}

interface XOAuthStartResult {
  readonly authorizationUrl: string;
  readonly state: string;
}

const unavailableMessage = 'X 连接服务尚未配置；不会显示任何模拟推文、收藏、点赞或统计。';

function isSuccess<T>(response: ApiResponse<T>): response is Extract<ApiResponse<T>, { readonly data: T }> {
  return 'data' in response;
}

function messageForCode(code: string): string {
  return code === 'UNAUTHORIZED'
    ? '请先完成 ME.zip 登录后再连接 X。'
    : code === 'PERMISSION_DENIED'
      ? '当前 X API 套餐或已授予权限不支持读取这项内容；账号保持已连接，ME.zip 不会显示模拟数据。'
    : code === 'FORBIDDEN'
      ? '当前账号无权读取这项私密 X 数据。'
      : code === 'RATE_LIMITED'
        ? '请求过于频繁，请稍后重试。'
        : 'X 连接服务暂时不可用。';
}

function messageFor<T>(response: ApiResponse<T>): string {
  return isSuccess(response) ? '请求未返回可用数据。' : messageForCode(response.error.code);
}

function configuredBaseUrl(): string | null {
  const raw = import.meta.env.VITE_MEZIP_SOCIAL_API_BASE_URL;
  if (typeof raw !== 'string' || raw.trim() === '') return null;
  try {
    const url = new URL(raw.trim());
    const development = import.meta.env.DEV;
    if (url.username || url.password || url.pathname !== '/' || url.search || url.hash) return null;
    if (url.protocol !== 'https:' && !(development && url.protocol === 'http:' && /^(?:localhost|127\.0\.0\.1)$/u.test(url.hostname))) return null;
    return url.origin;
  } catch {
    return null;
  }
}

function record(value: unknown): Readonly<Record<string, unknown>> {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
    ? value as Readonly<Record<string, unknown>>
    : {};
}

function stringValue(value: unknown): string | null {
  return typeof value === 'string' && value.trim().length > 0 ? value : null;
}

function numberValue(value: unknown): number | null {
  return typeof value === 'number' && Number.isFinite(value) ? value : null;
}

function boolValue(value: unknown): boolean {
  return value === true;
}

function metadataItem(item: SocialArchiveItem): XCenterContent | null {
  const metadata = record(item.metadata);
  const feed = stringValue(metadata.xFeed);
  if (feed !== 'MY_TWEETS' && feed !== 'BOOKMARKED' && feed !== 'LIKED') return null;
  const media = Array.isArray(metadata.media)
    ? metadata.media.flatMap((value) => {
      const valueRecord = record(value);
      const type = stringValue(valueRecord.type);
      return type === null ? [] : [{ type, url: stringValue(valueRecord.url), previewImageUrl: stringValue(valueRecord.previewImageUrl) }];
    })
    : [];
  const references = Array.isArray(metadata.references)
    ? metadata.references.flatMap((value) => {
      const reference = record(value);
      const type = stringValue(reference.type);
      const canonicalUrl = stringValue(reference.canonicalUrl);
      return type === null || canonicalUrl === null
        ? []
        : [{
          type,
          canonicalUrl,
          textExcerpt: stringValue(reference.textExcerpt),
          authorName: stringValue(reference.authorName),
          authorUsername: stringValue(reference.authorUsername),
        }];
    })
    : [];
  const metrics = record(metadata.metrics);
  return {
    archiveItem: item,
    feed,
    authorName: stringValue(metadata.originalAuthor),
    authorUsername: stringValue(metadata.authorUsername),
    authorAvatarUrl: stringValue(metadata.authorAvatarUrl),
    media,
    references,
    metrics: {
      likeCount: numberValue(metrics.likeCount),
      replyCount: numberValue(metrics.replyCount),
      repostCount: numberValue(metrics.repostCount),
      quoteCount: numberValue(metrics.quoteCount),
      impressionCount: numberValue(metrics.impressionCount),
    },
    isReply: boolValue(metadata.isReply),
    isQuote: boolValue(metadata.isQuote),
  };
}

function redirectUri(): string {
  return `${window.location.origin}/x`;
}

function randomVerifier(): string {
  const values = new Uint8Array(48);
  crypto.getRandomValues(values);
  return Array.from(values, (value) => value.toString(16).padStart(2, '0')).join('');
}

async function challengeFor(verifier: string): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(verifier));
  const base64 = btoa(String.fromCharCode(...new Uint8Array(digest)));
  return base64.replace(/\+/gu, '-').replace(/\//gu, '_').replace(/=+$/u, '');
}

function readOAuthStart(value: unknown): XOAuthStartResult | null {
  const item = record(value);
  const authorizationUrl = stringValue(item.authorizationUrl);
  const state = stringValue(item.state);
  return authorizationUrl === null || state === null ? null : { authorizationUrl, state };
}

function verifierKey(state: string): string {
  return `mezip.x.oauth.pkce.${state}`;
}

function emptyView(message: string): XCenterView {
  return { availability: 'UNAVAILABLE', provider: null, account: null, syncStatus: null, contents: [], collections: [], message };
}

export class ApiXCenterClient implements XCenterClient {
  public constructor(private readonly sdk: SocialSdk) {}

  public async load(): Promise<XCenterView> {
    // The local bridge establishes its browser session on the providers read.
    // Bootstrap that session before issuing the remaining parallel reads in local development; doing
    // all four calls at once makes the first page load race the Set-Cookie.
    const providers = await this.sdk.listProviders();
    if (!isSuccess(providers)) return emptyView(messageFor(providers));
    const [accounts, archive, collections] = await Promise.all([
      this.sdk.listAccounts(),
      this.sdk.listArchive({ provider: 'X', limit: 100 }),
      this.sdk.listCollections(),
    ]);
    if (!isSuccess(accounts)) return emptyView(messageFor(accounts));
    if (!isSuccess(archive)) return emptyView(messageFor(archive));
    if (!isSuccess(collections)) return emptyView(messageFor(collections));
    const account = accounts.data.find((entry) => entry.provider === 'X') ?? null;
    const status = account === null ? null : await this.sdk.getSyncStatus(account.id);
    return {
      availability: 'SERVER',
      provider: providers.data.find((entry) => entry.provider === 'X') ?? null,
      account,
      syncStatus: status !== null && isSuccess(status) ? status.data : null,
      contents: archive.data.items.flatMap((item) => {
        const projected = metadataItem(item);
        return projected === null ? [] : [projected];
      }),
      collections: collections.data,
      message: account !== null && status !== null
        ? isSuccess(status)
          ? (status.data.errorCode === null ? null : messageForCode(status.data.errorCode))
          : messageFor(status)
        : null,
    };
  }

  public async startConnection(): Promise<void> {
    const verifier = randomVerifier();
    const result = await this.sdk.startOAuth({ provider: 'X', redirectUri: redirectUri(), consentVersion: 'x-center-v1', requestedScopes: xRequestedReadScopes, codeChallenge: await challengeFor(verifier) });
    if (!isSuccess(result)) throw new Error(messageFor(result));
    const start = readOAuthStart(result.data);
    if (start === null) throw new Error('X 授权服务返回无效；为保护账号未跳转。');
    sessionStorage.setItem(verifierKey(start.state), verifier);
    window.location.assign(start.authorizationUrl);
  }

  public async completeCallback(): Promise<boolean> {
    const parameters = new URLSearchParams(window.location.search);
    const code = parameters.get('code');
    const state = parameters.get('state');
    if (code === null || state === null) return false;
    const verifier = sessionStorage.getItem(verifierKey(state));
    if (verifier === null) throw new Error('X 授权校验已过期。请从 X 连接中心重新开始授权。');
    try {
      const result = await this.sdk.completeOAuth({ provider: 'X', state, code, redirectUri: redirectUri(), codeVerifier: verifier });
      if (!isSuccess(result)) throw new Error(messageFor(result));
      return true;
    } finally {
      // An OAuth code is short-lived but still sensitive. Never leave it in the
      // address bar or retain a verifier after the callback attempt.
      sessionStorage.removeItem(verifierKey(state));
      window.history.replaceState({}, '', '/x');
    }
  }

  public async sync(accountId: string): Promise<void> {
    const result = await this.sdk.syncAccount(accountId, `x-sync-${crypto.randomUUID()}`);
    if (!isSuccess(result)) throw new Error(messageFor(result));
  }

  public async refreshAuthorization(accountId: string): Promise<void> {
    const result = await this.sdk.refreshAccount(accountId);
    if (!isSuccess(result)) throw new Error(messageFor(result));
  }

  public async updateAccountSettings(accountId: string, input: { readonly requestedScopes?: readonly string[]; readonly autoSync?: boolean }): Promise<void> {
    const result = await this.sdk.updateAccountSettings(accountId, input);
    if (!isSuccess(result)) throw new Error(messageFor(result));
  }

  public async disconnect(accountId: string): Promise<void> {
    const result = await this.sdk.disconnectAccount(accountId);
    if (!isSuccess(result)) throw new Error(messageFor(result));
  }

  public async updateArchiveItem(itemId: string, input: { readonly note?: string | null; readonly tags?: readonly string[]; readonly collectionIds?: readonly string[] }): Promise<SocialArchiveItem> {
    const result = await this.sdk.updateArchiveItem(itemId, input);
    if (!isSuccess(result)) throw new Error(messageFor(result));
    return result.data;
  }

  public async createCollection(input: { readonly name: string; readonly description?: string | null }): Promise<SocialCollection> {
    const result = await this.sdk.createCollection({ ...input, visibility: 'PRIVATE' });
    if (!isSuccess(result)) throw new Error(messageFor(result));
    return result.data;
  }

  public async addToCollection(collectionId: string, archiveItemId: string): Promise<SocialCollection> {
    const result = await this.sdk.addToCollection(collectionId, archiveItemId);
    if (!isSuccess(result)) throw new Error(messageFor(result));
    return result.data;
  }

  public async deleteImportedData(accountId: string): Promise<number> {
    const result = await this.sdk.deleteImportedData({ provider: 'X', accountId });
    if (!isSuccess(result)) throw new Error(messageFor(result));
    return result.data.deleted;
  }
}

export const xCenterClient: XCenterClient = (() => {
  const baseUrl = configuredBaseUrl();
  return baseUrl === null
    ? {
      load: async () => emptyView(unavailableMessage),
      startConnection: async () => { throw new Error(unavailableMessage); },
      completeCallback: async () => false,
      sync: async () => { throw new Error(unavailableMessage); },
      refreshAuthorization: async () => { throw new Error(unavailableMessage); },
      updateAccountSettings: async () => { throw new Error(unavailableMessage); },
      disconnect: async () => { throw new Error(unavailableMessage); },
      updateArchiveItem: async () => { throw new Error(unavailableMessage); },
      createCollection: async () => { throw new Error(unavailableMessage); },
      addToCollection: async () => { throw new Error(unavailableMessage); },
      deleteImportedData: async () => { throw new Error(unavailableMessage); },
    }
    : new ApiXCenterClient(createMeZipSdk(new FetchMessagingTransport({ baseUrl })).social);
})();
