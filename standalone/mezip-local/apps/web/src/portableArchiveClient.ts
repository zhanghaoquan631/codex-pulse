import { createMeZipSdk, type PortableArchiveSdk } from '@me-zip/sdk';
import type {
  ApiResponse,
  PortableAnnualArchive,
  PortableArchiveBackup,
  PortableArchiveExportJob,
  PortableArchiveExportRequest,
  PortableArchiveImportJob,
  PortableArchiveImportPreview,
  PortableArchiveImportRequest,
  PortableArchiveDownload,
  PortableLegacyPolicy,
} from '@me-zip/shared-types';
import { FetchMessagingTransport } from './messagingClient.js';

export type PortableArchiveAvailability = 'SERVER' | 'UNAVAILABLE';
export interface PortableArchiveCenterSnapshot {
  readonly availability: PortableArchiveAvailability;
  readonly exports: readonly PortableArchiveExportJob[];
  readonly backups: readonly PortableArchiveBackup[];
  readonly annual: PortableAnnualArchive | null;
  readonly legacyPolicy: PortableLegacyPolicy | null;
  readonly message: string | null;
}
export interface PortableArchiveDownloadResult extends Omit<
  PortableArchiveDownload,
  'bytes'
> {
  readonly rawBytes: Uint8Array;
}
export interface PortableArchiveCenterClient {
  load(year?: number): Promise<PortableArchiveCenterSnapshot>;
  createExport(input: PortableArchiveExportRequest): Promise<PortableArchiveExportJob>;
  download(jobId: string): Promise<PortableArchiveDownloadResult>;
  previewImport(
    archiveBase64: string,
    input?: PortableArchiveImportRequest,
  ): Promise<PortableArchiveImportPreview>;
  restoreImport(
    importId: string,
    archiveBase64: string,
    input?: PortableArchiveImportRequest,
  ): Promise<PortableArchiveImportJob>;
}

const failed = (message: string): PortableArchiveCenterSnapshot => ({
  availability: 'UNAVAILABLE',
  exports: [],
  backups: [],
  annual: null,
  legacyPolicy: null,
  message,
});
const success = <T>(
  response: ApiResponse<T>,
): response is Extract<ApiResponse<T>, { readonly data: T }> => 'data' in response;

function configuredOrigin(raw: string | undefined): string | null {
  if (typeof raw !== 'string' || raw.trim() === '') return null;
  try {
    const url = new URL(raw.trim());
    const development = import.meta.env.DEV;
    if (url.username || url.password || url.pathname !== '/' || url.search || url.hash)
      return null;
    if (
      url.protocol !== 'https:' &&
      !(
        development &&
        url.protocol === 'http:' &&
        /^(?:localhost|127\.0\.0\.1)$/u.test(url.hostname)
      )
    )
      return null;
    return url.origin;
  } catch {
    return null;
  }
}

export class ApiPortableArchiveCenterClient implements PortableArchiveCenterClient {
  public constructor(private readonly sdk: PortableArchiveSdk) {}
  public async load(
    year = new Date().getFullYear(),
  ): Promise<PortableArchiveCenterSnapshot> {
    const [exports, backups, annual, policy] = await Promise.all([
      this.sdk.listExports(),
      this.sdk.listBackups(),
      this.sdk.getAnnualArchive(year),
      this.sdk.getLegacyPolicy(),
    ]);
    if (!success(exports) || !success(backups) || !success(annual) || !success(policy))
      return failed('便携档案服务未返回完整的服务端投影；不会展示本地伪造的导出状态。');
    return {
      availability: 'SERVER',
      exports: exports.data,
      backups: backups.data,
      annual: annual.data,
      legacyPolicy: policy.data,
      message: null,
    };
  }
  public async createExport(
    input: PortableArchiveExportRequest,
  ): Promise<PortableArchiveExportJob> {
    const response = await this.sdk.createExport(input);
    if (!success(response)) throw new Error(response.error.message);
    return response.data;
  }
  public async download(jobId: string): Promise<PortableArchiveDownloadResult> {
    const metadata = await this.sdk.getDownload(jobId);
    if (!success(metadata)) throw new Error(metadata.error.message);
    const payload = await this.sdk.downloadBytes(jobId, metadata.data.token);
    if (!success(payload)) throw new Error(payload.error.message);
    return {
      ...metadata.data,
      rawBytes: Uint8Array.from(atob(payload.data.archiveBase64), (character) =>
        character.charCodeAt(0),
      ),
    };
  }
  public async previewImport(
    archiveBase64: string,
    input?: PortableArchiveImportRequest,
  ): Promise<PortableArchiveImportPreview> {
    const response = await this.sdk.previewImport(archiveBase64, input);
    if (!success(response)) throw new Error(response.error.message);
    return response.data;
  }
  public async restoreImport(
    importId: string,
    archiveBase64: string,
    input?: PortableArchiveImportRequest,
  ): Promise<PortableArchiveImportJob> {
    const response = await this.sdk.restoreImport(importId, archiveBase64, input);
    if (!success(response)) throw new Error(response.error.message);
    return response.data;
  }
}

export const portableArchiveClient: PortableArchiveCenterClient = (() => {
  const origin = configuredOrigin(import.meta.env.VITE_MEZIP_ARCHIVE_API_BASE_URL);
  if (origin !== null)
    return new ApiPortableArchiveCenterClient(
      createMeZipSdk(new FetchMessagingTransport({ baseUrl: origin })).portableArchive,
    );
  return {
    load: async () =>
      failed('便携档案服务尚未配置；本地页面不会伪造导出、导入或备份成功。'),
    createExport: async () => {
      throw new Error('便携档案服务尚未配置。');
    },
    download: async () => {
      throw new Error('便携档案服务尚未配置。');
    },
    previewImport: async () => {
      throw new Error('便携档案服务尚未配置。');
    },
    restoreImport: async () => {
      throw new Error('便携档案服务尚未配置。');
    },
  };
})();
