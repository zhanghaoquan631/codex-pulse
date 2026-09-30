import { createMeZipSdk, type SocialSdk } from '@me-zip/sdk';
import type {
  ApiResponse,
  ExternalSocialAccount,
  SocialArchiveItem,
  SocialArchivePage,
  SocialCollection,
  SocialProviderSummary,
  SocialSyncStatus,
} from '@me-zip/shared-types';
import { FetchMessagingTransport } from './messagingClient.js';

export type SocialClientAvailability = 'SERVER' | 'UNAVAILABLE' | 'MOCK_DEV';

export interface SocialCenterView {
  readonly availability: SocialClientAvailability;
  readonly providers: readonly SocialProviderSummary[];
  readonly accounts: readonly ExternalSocialAccount[];
  readonly archive: SocialArchivePage;
  readonly collections: readonly SocialCollection[];
  readonly syncStatuses: Readonly<Record<string, SocialSyncStatus>>;
  readonly founderFeed: SocialArchivePage | null;
  readonly message: string | null;
}

export interface SocialCenterClient {
  load(): Promise<SocialCenterView>;
  refresh(): Promise<SocialCenterView>;
  saveManualLink(input: { readonly url: string; readonly note?: string | null; readonly tags?: readonly string[] }): Promise<SocialArchiveItem>;
  search(query: string, provider?: 'X' | 'DOUYIN' | 'MANUAL_LINK'): Promise<SocialArchivePage>;
  sync(accountId: string): Promise<void>;
  disconnect(accountId: string): Promise<void>;
  deleteItem(itemId: string): Promise<void>;
  createCollection(name: string): Promise<SocialCollection>;
  listFounderFeed(): Promise<SocialArchivePage>;
}

const emptyView = (availability: SocialClientAvailability, message: string | null): SocialCenterView => ({ availability, providers: [], accounts: [], archive: { items: [], nextCursor: null }, collections: [], syncStatuses: {}, founderFeed: null, message });

const isSuccess = <T>(response: ApiResponse<T>): response is Extract<ApiResponse<T>, { readonly data: T }> => 'data' in response;

function baseUrl(): string | null {
  const raw = import.meta.env.VITE_MEZIP_SOCIAL_API_BASE_URL;
  if (typeof raw !== 'string' || raw.trim() === '') return null;
  try {
    const url = new URL(raw.trim());
    const dev = import.meta.env.DEV;
    if (url.username || url.password || url.pathname !== '/' || url.search || url.hash) return null;
    if (url.protocol !== 'https:' && !(dev && url.protocol === 'http:' && /^(?:localhost|127\.0\.0\.1)$/u.test(url.hostname))) return null;
    return url.origin;
  } catch { return null; }
}

export class ApiSocialCenterClient implements SocialCenterClient {
  public constructor(private readonly sdk: SocialSdk) {}
  public async load(): Promise<SocialCenterView> {
    const [providers, accounts, archive, collections] = await Promise.all([this.sdk.listProviders(), this.sdk.listAccounts(), this.sdk.listArchive({ limit: 30 }), this.sdk.listCollections()]);
    if (!isSuccess(providers) || !isSuccess(accounts) || !isSuccess(archive) || !isSuccess(collections)) return emptyView('UNAVAILABLE', '社交连接器服务暂未连接；不会展示本地伪造的社交数据。');
    const statuses: Record<string, SocialSyncStatus> = {};
    for (const account of accounts.data) { const result = await this.sdk.getSyncStatus(account.id); if (isSuccess(result)) statuses[account.id] = result.data; }
    let founderFeed: SocialArchivePage | null = null;
    const founder = await this.sdk.listFounderFeed();
    if (isSuccess(founder)) founderFeed = founder.data;
    return { availability: 'SERVER', providers: providers.data, accounts: accounts.data, archive: archive.data, collections: collections.data, syncStatuses: statuses, founderFeed, message: null };
  }
  public async refresh(): Promise<SocialCenterView> { return this.load(); }
  public async saveManualLink(input: { readonly url: string; readonly note?: string | null; readonly tags?: readonly string[] }): Promise<SocialArchiveItem> { const result = await this.sdk.saveManualLink(input, `social-manual-${crypto.randomUUID()}`); if (!isSuccess(result)) throw new Error(result.error.message); return result.data; }
  public async search(query: string, provider?: 'X' | 'DOUYIN' | 'MANUAL_LINK'): Promise<SocialArchivePage> { const archiveQuery = provider === undefined ? { query, limit: 30 } : { query, provider, limit: 30 }; const result = await this.sdk.listArchive(archiveQuery); if (!isSuccess(result)) throw new Error(result.error.message); return result.data; }
  public async sync(accountId: string): Promise<void> { const result = await this.sdk.syncAccount(accountId, `social-sync-${crypto.randomUUID()}`); if (!isSuccess(result)) throw new Error(result.error.message); }
  public async disconnect(accountId: string): Promise<void> { const result = await this.sdk.disconnectAccount(accountId); if (!isSuccess(result)) throw new Error(result.error.message); }
  public async deleteItem(itemId: string): Promise<void> { const result = await this.sdk.deleteArchiveItem(itemId); if (!isSuccess(result)) throw new Error(result.error.message); }
  public async createCollection(name: string): Promise<SocialCollection> { const result = await this.sdk.createCollection({ name }); if (!isSuccess(result)) throw new Error(result.error.message); return result.data; }
  public async listFounderFeed(): Promise<SocialArchivePage> { const result = await this.sdk.listFounderFeed(); if (!isSuccess(result)) throw new Error(result.error.message); return result.data; }
}

export const socialClient: SocialCenterClient = (() => {
  const origin = baseUrl();
  if (origin !== null) return new ApiSocialCenterClient(createMeZipSdk(new FetchMessagingTransport({ baseUrl: origin })).social);
  return {
    load: async () => emptyView('UNAVAILABLE', '社交连接器服务暂未配置；真实 X/Douyin API 未验证。'),
    refresh: async () => emptyView('UNAVAILABLE', '社交连接器服务暂未配置；真实 X/Douyin API 未验证。'),
    saveManualLink: async () => { throw new Error('社交连接器服务暂未配置。'); },
    search: async () => { throw new Error('社交连接器服务暂未配置。'); },
    sync: async () => { throw new Error('社交连接器服务暂未配置。'); },
    disconnect: async () => { throw new Error('社交连接器服务暂未配置。'); },
    deleteItem: async () => { throw new Error('社交连接器服务暂未配置。'); },
    createCollection: async () => { throw new Error('社交连接器服务暂未配置。'); },
    listFounderFeed: async () => { throw new Error('社交连接器服务暂未配置。'); },
  };
})();
