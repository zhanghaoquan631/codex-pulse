import type {
  AiUsageAppCode,
  AiUsageAppRegistryEntry,
  AiUsageDevice,
  AiUsageDeviceType,
  AiUsageExport,
  AiUsageOverview,
  AiUsagePairingStart,
  AiUsageProviderRegistryEntry,
  AiUsageRangeDeleteResult,
  AiUsageSession,
  AiUsageTrackingPreferences,
  ApiResponse,
} from '@me-zip/shared-types';
import { createMeZipSdk } from '@me-zip/sdk';

import { FetchMessagingTransport } from './messagingClient.js';

export type AiUsageClientErrorCode =
  | 'SERVICE_UNAVAILABLE'
  | 'OFFLINE'
  | 'UNAUTHORIZED'
  | 'FORBIDDEN'
  | 'NOT_FOUND'
  | 'VALIDATION'
  | 'CONFLICT'
  | 'TRACKING_DISABLED'
  | 'DEVICE_REVOKED'
  | 'RATE_LIMITED'
  | 'UNKNOWN';

export interface AiUsageClientError {
  readonly code: AiUsageClientErrorCode;
  readonly message: string;
  readonly retryable: boolean;
}

export type AiUsageResult<T> =
  | { readonly ok: true; readonly data: T; readonly source: 'SERVER' }
  | { readonly ok: false; readonly error: AiUsageClientError; readonly source: 'UNAVAILABLE' | 'SERVER' };

export interface AiUsageRangeInput {
  readonly from?: string;
  readonly to?: string;
  readonly limit?: number;
}

export interface AiUsageDashboardSnapshot {
  readonly overview: AiUsageOverview;
  readonly preferences: AiUsageTrackingPreferences;
  readonly apps: readonly AiUsageAppRegistryEntry[];
  readonly providers: readonly AiUsageProviderRegistryEntry[];
  readonly devices: readonly AiUsageDevice[];
  readonly sessions: readonly AiUsageSession[];
}

export interface AiUsageDashboardClient {
  readonly source: 'SERVER' | 'UNAVAILABLE';
  readSnapshot(input?: AiUsageRangeInput): Promise<AiUsageResult<AiUsageDashboardSnapshot>>;
  updatePreferences(input: {
    readonly enabled?: boolean;
    readonly windowsAgentEnabled?: boolean;
    readonly browserExtensionEnabled?: boolean;
    readonly idleThresholdSeconds?: number;
    readonly timezone?: string;
  }): Promise<AiUsageResult<AiUsageTrackingPreferences>>;
  createPairing(input: {
    readonly deviceType: AiUsageDeviceType;
    readonly deviceLabel?: string;
    readonly idempotencyKey: string;
  }): Promise<AiUsageResult<AiUsagePairingStart>>;
  revokeDevice(input: { readonly deviceId: string; readonly idempotencyKey: string }): Promise<AiUsageResult<AiUsageDevice>>;
  correctSession(input: {
    readonly sessionId: string;
    readonly activeSeconds?: number;
    readonly idleSeconds?: number;
    readonly startedAt?: string;
    readonly endedAt?: string;
    readonly reason: string;
    readonly idempotencyKey: string;
  }): Promise<AiUsageResult<AiUsageSession>>;
  deleteSession(input: {
    readonly sessionId: string;
    readonly reason: string;
    readonly idempotencyKey: string;
  }): Promise<AiUsageResult<AiUsageSession>>;
  deleteUsageRange(input: {
    readonly from: string;
    readonly to: string;
    readonly reason: string;
    readonly idempotencyKey: string;
  }): Promise<AiUsageResult<AiUsageRangeDeleteResult>>;
  exportUsage(input?: AiUsageRangeInput): Promise<AiUsageResult<AiUsageExport>>;
  createManualSession(input: {
    readonly appCode: AiUsageAppCode;
    readonly startedAt: string;
    readonly endedAt: string;
    readonly activeSeconds: number;
    readonly idleSeconds: number;
    readonly idempotencyKey: string;
  }): Promise<AiUsageResult<AiUsageSession>>;
}

/** Structural seam for the SDK. It is intentionally not an HTTP route map:
 * `@me-zip/sdk` owns endpoint paths and all authorization comes from its
 * credentialed transport. */
export interface AiUsageSdkFacade {
  getOverview(input?: AiUsageRangeInput): Promise<ApiResponse<AiUsageOverview>>;
  listApps(): Promise<ApiResponse<readonly AiUsageAppRegistryEntry[]>>;
  listProviders(): Promise<ApiResponse<readonly AiUsageProviderRegistryEntry[]>>;
  getPreferences(): Promise<ApiResponse<AiUsageTrackingPreferences>>;
  updatePreferences(input: {
    readonly enabled?: boolean;
    readonly windowsAgentEnabled?: boolean;
    readonly browserExtensionEnabled?: boolean;
    readonly idleThresholdSeconds?: number;
    readonly timezone?: string;
  }): Promise<ApiResponse<AiUsageTrackingPreferences>>;
  listDevices(): Promise<ApiResponse<readonly AiUsageDevice[]>>;
  createPairing(input: {
    readonly deviceType: AiUsageDeviceType;
    readonly deviceLabel?: string;
    readonly idempotencyKey: string;
  }): Promise<ApiResponse<AiUsagePairingStart>>;
  revokeDevice(input: { readonly deviceId: string; readonly idempotencyKey: string }): Promise<ApiResponse<AiUsageDevice>>;
  listSessions(input?: AiUsageRangeInput): Promise<ApiResponse<readonly AiUsageSession[]>>;
  correctSession(input: {
    readonly sessionId: string;
    readonly activeSeconds?: number;
    readonly idleSeconds?: number;
    readonly startedAt?: string;
    readonly endedAt?: string;
    readonly reason: string;
    readonly idempotencyKey: string;
  }): Promise<ApiResponse<AiUsageSession>>;
  deleteSession(input: {
    readonly sessionId: string;
    readonly reason: string;
    readonly idempotencyKey: string;
  }): Promise<ApiResponse<AiUsageSession>>;
  deleteUsageRange(input: {
    readonly from: string;
    readonly to: string;
    readonly reason: string;
    readonly idempotencyKey: string;
  }): Promise<ApiResponse<AiUsageRangeDeleteResult>>;
  exportUsage(input?: AiUsageRangeInput): Promise<ApiResponse<AiUsageExport>>;
  createManualSession(input: {
    readonly appCode: AiUsageAppCode;
    readonly startedAt: string;
    readonly endedAt: string;
    readonly activeSeconds: number;
    readonly idleSeconds: number;
    readonly idempotencyKey: string;
  }): Promise<ApiResponse<AiUsageSession>>;
}

const unavailableError: AiUsageClientError = {
  code: 'SERVICE_UNAVAILABLE',
  message: 'AI 使用记录服务尚未连接；不会用本地演示数据代替你的真实记录。',
  retryable: true,
};

function failure<T>(error = unavailableError): AiUsageResult<T> {
  return { ok: false, error, source: 'UNAVAILABLE' };
}

function normalizeFailure(code: string, retryable: boolean): AiUsageClientError {
  const aliases: Readonly<Record<string, AiUsageClientErrorCode>> = {
    UNAUTHORIZED: 'UNAUTHORIZED',
    AUTH_REQUIRED: 'UNAUTHORIZED',
    FORBIDDEN: 'FORBIDDEN',
    ROOT_DENIED: 'FORBIDDEN',
    NOT_FOUND: 'NOT_FOUND',
    VALIDATION: 'VALIDATION',
    CONFLICT: 'CONFLICT',
    IDEMPOTENCY_CONFLICT: 'CONFLICT',
    TRACKING_DISABLED: 'TRACKING_DISABLED',
    DEVICE_REVOKED: 'DEVICE_REVOKED',
    RATE_LIMITED: 'RATE_LIMITED',
    OFFLINE: 'OFFLINE',
  };
  const normalized = aliases[code] ?? (retryable ? 'SERVICE_UNAVAILABLE' : 'UNKNOWN');
  const messages: Readonly<Record<AiUsageClientErrorCode, string>> = {
    SERVICE_UNAVAILABLE: 'AI 使用记录服务暂时不可用。',
    OFFLINE: '当前无法连接 AI 使用记录服务。',
    UNAUTHORIZED: '请完成安全登录后再查看 AI 使用记录。',
    FORBIDDEN: '当前账号无权执行此 AI 使用记录操作。',
    NOT_FOUND: '该设备或使用记录不存在，或当前账号不可访问。',
    VALIDATION: '请检查输入内容后再试。',
    CONFLICT: '记录状态已变化，请刷新后重试。',
    TRACKING_DISABLED: '追踪已暂停；恢复后设备才会继续同步。',
    DEVICE_REVOKED: '该设备已解除连接，不能继续同步。',
    RATE_LIMITED: '操作过于频繁，请稍后再试。',
    UNKNOWN: 'AI 使用记录操作暂时无法完成。',
  };
  return { code: normalized, message: messages[normalized], retryable };
}

async function fromSdk<T>(request: Promise<ApiResponse<T>>): Promise<AiUsageResult<T>> {
  try {
    const response = await request;
    if ('error' in response) {
      return {
        ok: false,
        source: 'SERVER',
        error: normalizeFailure(response.error.code, response.error.retryable),
      };
    }
    return { ok: true, source: 'SERVER', data: response.data };
  } catch {
    return failure({
      code: 'OFFLINE',
      message: '当前无法连接 AI 使用记录服务。',
      retryable: true,
    });
  }
}

export class ApiAiUsageDashboardClient implements AiUsageDashboardClient {
  readonly source = 'SERVER' as const;

  public constructor(private readonly sdk: AiUsageSdkFacade) {}

  public async readSnapshot(input: AiUsageRangeInput = {}): Promise<AiUsageResult<AiUsageDashboardSnapshot>> {
    const [overview, preferences, apps, providers, devices, sessions] = await Promise.all([
      fromSdk(this.sdk.getOverview(input)),
      fromSdk(this.sdk.getPreferences()),
      fromSdk(this.sdk.listApps()),
      fromSdk(this.sdk.listProviders()),
      fromSdk(this.sdk.listDevices()),
      fromSdk(this.sdk.listSessions(input)),
    ]);
    if (!overview.ok) return { ok: false, source: overview.source, error: overview.error };
    if (!preferences.ok) return { ok: false, source: preferences.source, error: preferences.error };
    if (!apps.ok) return { ok: false, source: apps.source, error: apps.error };
    if (!providers.ok) return { ok: false, source: providers.source, error: providers.error };
    if (!devices.ok) return { ok: false, source: devices.source, error: devices.error };
    if (!sessions.ok) return { ok: false, source: sessions.source, error: sessions.error };
    return {
      ok: true,
      source: 'SERVER',
      data: {
        overview: overview.data,
        preferences: preferences.data,
        apps: apps.data,
        providers: providers.data,
        devices: devices.data,
        sessions: sessions.data,
      },
    };
  }

  public updatePreferences(input: Parameters<AiUsageDashboardClient['updatePreferences']>[0]) {
    return fromSdk(this.sdk.updatePreferences(input));
  }

  public createPairing(input: Parameters<AiUsageDashboardClient['createPairing']>[0]) {
    return fromSdk(this.sdk.createPairing(input));
  }

  public revokeDevice(input: Parameters<AiUsageDashboardClient['revokeDevice']>[0]) {
    return fromSdk(this.sdk.revokeDevice(input));
  }

  public correctSession(input: Parameters<AiUsageDashboardClient['correctSession']>[0]) {
    return fromSdk(this.sdk.correctSession(input));
  }

  public deleteSession(input: Parameters<AiUsageDashboardClient['deleteSession']>[0]) {
    return fromSdk(this.sdk.deleteSession(input));
  }

  public deleteUsageRange(input: Parameters<AiUsageDashboardClient['deleteUsageRange']>[0]) {
    return fromSdk(this.sdk.deleteUsageRange(input));
  }

  public exportUsage(input?: AiUsageRangeInput) {
    return fromSdk(this.sdk.exportUsage(input));
  }

  public createManualSession(input: Parameters<AiUsageDashboardClient['createManualSession']>[0]) {
    return fromSdk(this.sdk.createManualSession(input));
  }
}

export class UnavailableAiUsageDashboardClient implements AiUsageDashboardClient {
  readonly source = 'UNAVAILABLE' as const;

  public async readSnapshot(): Promise<AiUsageResult<AiUsageDashboardSnapshot>> {
    return failure();
  }

  public async updatePreferences(): Promise<AiUsageResult<AiUsageTrackingPreferences>> {
    return failure();
  }

  public async createPairing(): Promise<AiUsageResult<AiUsagePairingStart>> {
    return failure();
  }

  public async revokeDevice(): Promise<AiUsageResult<AiUsageDevice>> {
    return failure();
  }

  public async correctSession(): Promise<AiUsageResult<AiUsageSession>> {
    return failure();
  }

  public async deleteSession(): Promise<AiUsageResult<AiUsageSession>> {
    return failure();
  }

  public async deleteUsageRange(): Promise<AiUsageResult<AiUsageRangeDeleteResult>> {
    return failure();
  }

  public async exportUsage(): Promise<AiUsageResult<AiUsageExport>> {
    return failure();
  }

  public async createManualSession(): Promise<AiUsageResult<AiUsageSession>> {
    return failure();
  }
}

/**
 * The dashboard only connects when a server base URL is explicitly supplied.
 * It deliberately has no development fixture: private usage totals must never
 * be invented locally or mistaken for a real tracking result.
 */
export function createRuntimeAiUsageDashboardClient(
  apiBaseUrl: string | undefined = import.meta.env.VITE_MEZIP_AI_USAGE_API_BASE_URL,
): AiUsageDashboardClient {
  const baseUrl = apiBaseUrl?.trim();
  if (baseUrl === undefined || baseUrl.length === 0) {
    return new UnavailableAiUsageDashboardClient();
  }
  return new ApiAiUsageDashboardClient(
    createMeZipSdk(new FetchMessagingTransport({ baseUrl })).aiUsage,
  );
}

export const aiUsageDashboardClient: AiUsageDashboardClient =
  createRuntimeAiUsageDashboardClient();

export function createAiUsageActionKey(scope: string): string {
  const normalized = scope.replace(/[^a-z0-9_-]/giu, '').slice(0, 32) || 'ai-usage';
  const random =
    typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function'
      ? crypto.randomUUID().replace(/-/gu, '')
      : Math.random().toString(36).slice(2, 14);
  return `${normalized}-${Date.now().toString(36)}-${random}`;
}
