/**
 * Phase 8 browser boundary for the server-authoritative AI Gateway.
 *
 * This module deliberately owns presentation-safe state only. It never
 * receives a user id, a plan/entitlement override, provider credentials, a
 * plaintext BYOK value, or provider endpoint details. The typed SDK remains
 * the single route map and the server remains the authorization boundary.
 */
import { createMeZipSdk } from '@me-zip/sdk';
import type {
  AiGatewayCapabilityCode,
  AiGatewayCapabilityRegistryEntry,
  AiGatewayByokProviderStatus,
  AiGatewayInvocation,
  AiGatewayInvocationEventPage,
  AiGatewayModelRegistryEntry,
  AiGatewayPreferences,
  AiGatewayProviderRegistryEntry,
  AiGatewayQuota,
  AiGatewayStreamHandshake,
  ApiResponse,
} from '@me-zip/shared-types';

import { FetchMessagingTransport } from './messagingClient.js';

export type AiLabClientSource = 'SERVER' | 'DEVELOPMENT_FIXTURE' | 'UNAVAILABLE';

export type AiLabFailureCode =
  | 'SERVICE_UNAVAILABLE'
  | 'OFFLINE'
  | 'UNAUTHORIZED'
  | 'FORBIDDEN'
  | 'ENTITLEMENT_REQUIRED'
  | 'MODEL_UNAVAILABLE'
  | 'CAPABILITY_UNAVAILABLE'
  | 'QUOTA_EXCEEDED'
  | 'VALIDATION'
  | 'CONFLICT'
  | 'NOT_FOUND'
  | 'RATE_LIMITED'
  | 'UNKNOWN';

export interface AiLabClientError {
  readonly code: AiLabFailureCode;
  /** Reviewed presentation copy; raw gateway/provider failures never render. */
  readonly message: string;
  readonly retryable: boolean;
}

export type AiLabResult<T> =
  | { readonly ok: true; readonly source: AiLabClientSource; readonly data: T }
  | {
      readonly ok: false;
      readonly source: AiLabClientSource;
      readonly error: AiLabClientError;
    };

export interface AiLabSnapshot {
  readonly providers: readonly AiGatewayProviderRegistryEntry[];
  readonly models: readonly AiGatewayModelRegistryEntry[];
  readonly capabilities: readonly AiGatewayCapabilityRegistryEntry[];
  readonly quota: AiGatewayQuota;
  readonly preferences: AiGatewayPreferences;
  /** Status only. This public projection never contains a key, envelope, raw
   * fingerprint, or reusable provider credential. */
  readonly byok: readonly AiGatewayByokProviderStatus[];
}

export interface AiLabStreamUpdate {
  readonly handshake: AiGatewayStreamHandshake;
  readonly page: AiGatewayInvocationEventPage;
}

/** A narrow structural seam lets platform clients use the shared SDK without
 * owning its HTTP paths. It excludes BYOK configuration writes: a browser text
 * field must never become a plaintext credential capture flow. It permits only
 * server-authorized status reads and revocation. */
export interface AiLabSdkFacade {
  listProviders(): Promise<ApiResponse<readonly AiGatewayProviderRegistryEntry[]>>;
  listModels(): Promise<ApiResponse<readonly AiGatewayModelRegistryEntry[]>>;
  listCapabilities(): Promise<
    ApiResponse<readonly AiGatewayCapabilityRegistryEntry[]>
  >;
  getQuota(): Promise<ApiResponse<AiGatewayQuota>>;
  getPreferences(): Promise<ApiResponse<AiGatewayPreferences>>;
  updatePreferences(input: {
    readonly defaultProviderCode?: AiGatewayProviderRegistryEntry['code'] | null;
    readonly defaultModelCode?: string | null;
  }): Promise<ApiResponse<AiGatewayPreferences>>;
  getByokStatus(): Promise<ApiResponse<readonly AiGatewayByokProviderStatus[]>>;
  createInvocation(input: {
    readonly modelCode: string;
    readonly capabilityCode: AiGatewayCapabilityCode;
    readonly messages: readonly { readonly role: 'USER'; readonly content: string }[];
    readonly stream?: boolean;
    readonly idempotencyKey: string;
  }): Promise<ApiResponse<AiGatewayInvocation>>;
  getInvocation(invocationId: string): Promise<ApiResponse<AiGatewayInvocation>>;
  cancelInvocation(input: {
    readonly invocationId: string;
    readonly idempotencyKey: string;
  }): Promise<ApiResponse<AiGatewayInvocation>>;
  listEvents(input: {
    readonly invocationId: string;
    readonly afterSequence?: number;
    readonly limit?: number;
  }): Promise<ApiResponse<AiGatewayInvocationEventPage>>;
  getStreamHandshake(invocationId: string): Promise<ApiResponse<AiGatewayStreamHandshake>>;
  revokeByok(input: {
    readonly providerCode: AiGatewayByokProviderStatus['providerCode'];
    readonly idempotencyKey: string;
  }): Promise<ApiResponse<AiGatewayByokProviderStatus>>;
}

export interface AiLabClient {
  readonly source: AiLabClientSource;
  readSnapshot(): Promise<AiLabResult<AiLabSnapshot>>;
  updatePreferences(input: {
    readonly defaultProviderCode?: AiGatewayProviderRegistryEntry['code'] | null;
    readonly defaultModelCode?: string | null;
  }): Promise<AiLabResult<AiGatewayPreferences>>;
  createInvocation(input: {
    readonly modelCode: string;
    readonly capabilityCode: AiGatewayCapabilityCode;
    readonly prompt: string;
    readonly stream: boolean;
    readonly idempotencyKey: string;
  }): Promise<AiLabResult<AiGatewayInvocation>>;
  getInvocation(invocationId: string): Promise<AiLabResult<AiGatewayInvocation>>;
  readStream(input: {
    readonly invocationId: string;
    readonly afterSequence: number;
  }): Promise<AiLabResult<AiLabStreamUpdate>>;
  cancelInvocation(input: {
    readonly invocationId: string;
    readonly idempotencyKey: string;
  }): Promise<AiLabResult<AiGatewayInvocation>>;
  /** This intentionally only revokes a server-side configuration. The browser
   * never accepts, persists, or displays a BYOK plaintext value. */
  revokeByok(input: {
    readonly providerCode: AiGatewayByokProviderStatus['providerCode'];
    readonly idempotencyKey: string;
  }): Promise<AiLabResult<AiGatewayByokProviderStatus>>;
}

const unavailableError: AiLabClientError = {
  code: 'SERVICE_UNAVAILABLE',
  message: 'AI 实验室服务尚未连接；不会以本地演示结果代替真实调用。',
  retryable: true,
};

function failure<T>(
  error: AiLabClientError = unavailableError,
  source: AiLabClientSource = 'UNAVAILABLE',
): AiLabResult<T> {
  return { ok: false, source, error };
}

function normalizeFailure(code: string, retryable: boolean): AiLabClientError {
  const aliases: Readonly<Record<string, AiLabFailureCode>> = {
    UNAUTHORIZED: 'UNAUTHORIZED',
    AUTH_REQUIRED: 'UNAUTHORIZED',
    FORBIDDEN: 'FORBIDDEN',
    ENTITLEMENT_REQUIRED: 'ENTITLEMENT_REQUIRED',
    AI_GATEWAY_ENTITLEMENT_REQUIRED: 'ENTITLEMENT_REQUIRED',
    MODEL_UNAVAILABLE: 'MODEL_UNAVAILABLE',
    AI_GATEWAY_MODEL_UNAVAILABLE: 'MODEL_UNAVAILABLE',
    CAPABILITY_UNAVAILABLE: 'CAPABILITY_UNAVAILABLE',
    AI_GATEWAY_CAPABILITY_UNAVAILABLE: 'CAPABILITY_UNAVAILABLE',
    QUOTA_EXCEEDED: 'QUOTA_EXCEEDED',
    AI_GATEWAY_QUOTA_EXCEEDED: 'QUOTA_EXCEEDED',
    VALIDATION: 'VALIDATION',
    CONFLICT: 'CONFLICT',
    IDEMPOTENCY_CONFLICT: 'CONFLICT',
    NOT_FOUND: 'NOT_FOUND',
    RATE_LIMITED: 'RATE_LIMITED',
    OFFLINE: 'OFFLINE',
  };
  const normalized = aliases[code] ?? (retryable ? 'SERVICE_UNAVAILABLE' : 'UNKNOWN');
  const messages: Readonly<Record<AiLabFailureCode, string>> = {
    SERVICE_UNAVAILABLE: 'AI 实验室服务暂时不可用。',
    OFFLINE: '当前无法连接 AI 实验室服务。',
    UNAUTHORIZED: '请完成安全登录后再使用 AI 实验室。',
    FORBIDDEN: '当前账号无权执行此 AI 调用。',
    ENTITLEMENT_REQUIRED: '当前账号没有使用该 AI 能力所需的服务端权益。',
    MODEL_UNAVAILABLE: '所选模型当前不可用，请重新选择服务端可用模型。',
    CAPABILITY_UNAVAILABLE: '所选模型不支持该能力。',
    QUOTA_EXCEEDED: '当前周期的 AI 配额已用尽，请等待服务端配额重置。',
    VALIDATION: '请检查输入内容和模型选择后再试。',
    CONFLICT: '调用状态已变化，请刷新后再试。',
    NOT_FOUND: '该调用不存在，或当前账号不可访问。',
    RATE_LIMITED: '操作过于频繁，请稍后再试。',
    UNKNOWN: 'AI 调用暂时无法完成。',
  };
  return { code: normalized, message: messages[normalized], retryable };
}

async function fromSdk<T>(request: Promise<ApiResponse<T>>): Promise<AiLabResult<T>> {
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
      message: '当前无法连接 AI 实验室服务。',
      retryable: true,
    });
  }
}

function nonEmptyPrompt(prompt: string): string | undefined {
  const value = prompt.trim();
  if (value.length === 0 || value.length > 20_000) return undefined;
  return value;
}

export class ApiAiLabClient implements AiLabClient {
  readonly source = 'SERVER' as const;

  public constructor(private readonly sdk: AiLabSdkFacade) {}

  public async readSnapshot(): Promise<AiLabResult<AiLabSnapshot>> {
    const [providers, models, capabilities, quota, preferences, byok] = await Promise.all([
      fromSdk(this.sdk.listProviders()),
      fromSdk(this.sdk.listModels()),
      fromSdk(this.sdk.listCapabilities()),
      fromSdk(this.sdk.getQuota()),
      fromSdk(this.sdk.getPreferences()),
      fromSdk(this.sdk.getByokStatus()),
    ]);
    if (!providers.ok) return providers;
    if (!models.ok) return models;
    if (!capabilities.ok) return capabilities;
    if (!quota.ok) return quota;
    if (!preferences.ok) return preferences;
    if (!byok.ok) return byok;
    return {
      ok: true,
      source: 'SERVER',
      data: {
        providers: providers.data,
        models: models.data,
        capabilities: capabilities.data,
        quota: quota.data,
        preferences: preferences.data,
        byok: byok.data,
      },
    };
  }

  public createInvocation(
    input: Parameters<AiLabClient['createInvocation']>[0],
  ): Promise<AiLabResult<AiGatewayInvocation>> {
    const prompt = nonEmptyPrompt(input.prompt);
    if (prompt === undefined) {
      return Promise.resolve(
        failure(
          {
            code: 'VALIDATION',
            message: '请输入 1 到 20000 个字符的内容后再提交。',
            retryable: false,
          },
          'SERVER',
        ),
      );
    }
    return fromSdk(
      this.sdk.createInvocation({
        modelCode: input.modelCode,
        capabilityCode: input.capabilityCode,
        messages: [{ role: 'USER', content: prompt }],
        stream: input.stream,
        idempotencyKey: input.idempotencyKey,
      }),
    );
  }

  public getInvocation(invocationId: string): Promise<AiLabResult<AiGatewayInvocation>> {
    return fromSdk(this.sdk.getInvocation(invocationId));
  }

  public updatePreferences(
    input: Parameters<AiLabClient['updatePreferences']>[0],
  ): Promise<AiLabResult<AiGatewayPreferences>> {
    return fromSdk(this.sdk.updatePreferences(input));
  }

  public async readStream(input: {
    readonly invocationId: string;
    readonly afterSequence: number;
  }): Promise<AiLabResult<AiLabStreamUpdate>> {
    const handshake = await fromSdk(this.sdk.getStreamHandshake(input.invocationId));
    if (!handshake.ok) return handshake;
    const page = await fromSdk(
      this.sdk.listEvents({
        invocationId: input.invocationId,
        afterSequence: input.afterSequence,
        limit: 100,
      }),
    );
    if (!page.ok) return page;
    if (page.data.invocationId !== input.invocationId) {
      return failure(
        {
          code: 'CONFLICT',
          message: '调用事件归属无效；为保护数据未显示结果。',
          retryable: true,
        },
        'SERVER',
      );
    }
    return {
      ok: true,
      source: 'SERVER',
      data: { handshake: handshake.data, page: page.data },
    };
  }

  public cancelInvocation(
    input: Parameters<AiLabClient['cancelInvocation']>[0],
  ): Promise<AiLabResult<AiGatewayInvocation>> {
    return fromSdk(this.sdk.cancelInvocation(input));
  }

  public revokeByok(
    input: Parameters<AiLabClient['revokeByok']>[0],
  ): Promise<AiLabResult<AiGatewayByokProviderStatus>> {
    return fromSdk(this.sdk.revokeByok(input));
  }
}

interface FixtureInvocationState {
  invocation: AiGatewayInvocation;
  readonly events: AiGatewayInvocationEventPage['events'];
  cursor: number;
}

const fixtureProviders: readonly AiGatewayProviderRegistryEntry[] = [
  {
    code: 'LOCAL',
    displayName: '本地开发适配器',
    adapterType: 'LOCAL_DETERMINISTIC',
    apiBaseConfigured: false,
    supportsDynamicModels: false,
    status: 'ACTIVE',
    availability: 'LOCAL_DEVELOPMENT',
    health: 'HEALTHY',
    credentialModes: ['NONE'],
    localOnly: true,
  },
];

const fixtureCapabilities: readonly AiGatewayCapabilityRegistryEntry[] = [
  {
    code: 'CHAT_COMPLETION',
    displayName: '对话生成',
    status: 'ACTIVE',
    description: '本地开发适配器的明确文字输入与输出能力。',
    inputModalities: ['TEXT'],
    outputModalities: ['TEXT'],
    requiresExplicitToolGrant: false,
  },
  {
    code: 'TEXT_GENERATION',
    displayName: '文本生成',
    status: 'ACTIVE',
    description: '本地开发适配器的文字生成能力。',
    inputModalities: ['TEXT'],
    outputModalities: ['TEXT'],
    requiresExplicitToolGrant: false,
  },
  {
    code: 'STREAMING',
    displayName: '流式输出',
    status: 'ACTIVE',
    description: '由本地适配器的合成事件验证流式界面。',
    inputModalities: ['TEXT'],
    outputModalities: ['TEXT'],
    requiresExplicitToolGrant: false,
  },
];

const fixtureModels: readonly AiGatewayModelRegistryEntry[] = [
  {
    code: 'local-development-text-v1',
    providerCode: 'LOCAL',
    displayName: '本地开发文本适配器',
    status: 'ACTIVE',
    availability: 'LOCAL_DEVELOPMENT',
    health: 'HEALTHY',
    capabilityCodes: ['CHAT_COMPLETION', 'TEXT_GENERATION', 'STREAMING'],
    contextWindow: 4_000,
    maxInputTokens: 4_000,
    maxOutputTokens: 600,
    supportsStreaming: true,
    pricingMetadata: null,
    releaseMetadata: { releasedAt: null, source: 'SERVER_MAINTAINED' },
    deprecatedAt: null,
    lastSyncedAt: null,
  },
];

function fixtureNow(): string {
  return new Date().toISOString();
}

/** Opt-in fixture for local/test UI validation only. It never represents a
 * provider integration, provider key, production model, or billable result. */
export class DevelopmentFixtureAiLabClient implements AiLabClient {
  readonly source = 'DEVELOPMENT_FIXTURE' as const;
  private readonly invocations = new Map<string, FixtureInvocationState>();
  private counter = 0;

  public async readSnapshot(): Promise<AiLabResult<AiLabSnapshot>> {
    const now = fixtureNow();
    return {
      ok: true,
      source: this.source,
      data: {
        providers: fixtureProviders,
        models: fixtureModels,
        capabilities: fixtureCapabilities,
        quota: {
          unit: 'TOKENS',
          limit: 10_000,
          used: 0,
          remaining: 10_000,
          periodStartedAt: now,
          resetsAt: now,
        },
        preferences: {
          defaultProviderCode: 'LOCAL',
          defaultModelCode: 'local-development-text-v1',
          updatedAt: now,
        },
        byok: [],
      },
    };
  }

  public async createInvocation(
    input: Parameters<AiLabClient['createInvocation']>[0],
  ): Promise<AiLabResult<AiGatewayInvocation>> {
    const prompt = nonEmptyPrompt(input.prompt);
    const model = fixtureModels.find((entry) => entry.code === input.modelCode);
    if (prompt === undefined || model === undefined || !model.capabilityCodes.includes(input.capabilityCode)) {
      return failure(
        {
          code: 'VALIDATION',
          message: '本地开发适配器只接受已显示的模型、能力与有效输入。',
          retryable: false,
        },
        this.source,
      );
    }
    const id = `fixture-ai-lab-${++this.counter}`;
    const now = fixtureNow();
    const output = '这是本地开发适配器的明确标记演示输出；未调用任何第三方 Provider。';
    const invocation: AiGatewayInvocation = {
      id,
      providerCode: 'LOCAL',
      modelCode: model.code,
      capabilityCode: input.capabilityCode,
      status: input.stream ? 'STREAMING' : 'SUCCEEDED',
      contextScope: 'NONE',
      conversationId: null,
      toolPolicy: { execution: 'DISABLED', allowedToolCodes: [] },
      fallback: { used: false, fromModelCode: null, reasonCode: null },
      inputMessageCount: 1,
      inputCharacterCount: prompt.length,
      outputText: input.stream ? null : output,
      finishReason: input.stream ? null : 'STOP',
      latencyMs: input.stream ? null : 0,
      metering: input.stream
        ? null
        : {
            inputTokens: 0,
            outputTokens: 0,
            totalTokens: 0,
            costFen: 0,
            currency: 'CNY',
            meteredAt: now,
          },
      createdAt: now,
      startedAt: now,
      completedAt: input.stream ? null : now,
      cancelledAt: null,
    };
    this.invocations.set(id, {
      invocation,
      cursor: 0,
      events: input.stream
        ? [
            {
              id: `${id}-1`,
              invocationId: id,
              sequence: 1,
              type: 'INVOCATION_CREATED',
              status: 'STREAMING',
              textDelta: null,
              metering: null,
              createdAt: now,
            },
            {
              id: `${id}-2`,
              invocationId: id,
              sequence: 2,
              type: 'OUTPUT_DELTA',
              status: 'STREAMING',
              textDelta: output,
              metering: null,
              createdAt: now,
            },
            {
              id: `${id}-3`,
              invocationId: id,
              sequence: 3,
              type: 'COMPLETED',
              status: 'SUCCEEDED',
              textDelta: null,
              metering: {
                inputTokens: 0,
                outputTokens: 0,
                totalTokens: 0,
                costFen: 0,
                currency: 'CNY',
                meteredAt: now,
              },
              createdAt: now,
            },
          ]
        : [],
    });
    return { ok: true, source: this.source, data: invocation };
  }

  public async getInvocation(invocationId: string): Promise<AiLabResult<AiGatewayInvocation>> {
    const state = this.invocations.get(invocationId);
    if (state === undefined) {
      return failure(
        { code: 'NOT_FOUND', message: '本地开发调用不存在。', retryable: false },
        this.source,
      );
    }
    return { ok: true, source: this.source, data: state.invocation };
  }

  public async updatePreferences(
    input: Parameters<AiLabClient['updatePreferences']>[0],
  ): Promise<AiLabResult<AiGatewayPreferences>> {
    return {
      ok: true,
      source: this.source,
      data: {
        defaultProviderCode: input.defaultProviderCode === undefined ? 'LOCAL' : input.defaultProviderCode,
        defaultModelCode: input.defaultModelCode === undefined ? 'local-development-text-v1' : input.defaultModelCode,
        updatedAt: fixtureNow(),
      },
    };
  }

  public async readStream(input: {
    readonly invocationId: string;
    readonly afterSequence: number;
  }): Promise<AiLabResult<AiLabStreamUpdate>> {
    const state = this.invocations.get(input.invocationId);
    if (state === undefined) {
      return failure(
        { code: 'NOT_FOUND', message: '本地开发调用不存在。', retryable: false },
        this.source,
      );
    }
    const events = state.events.filter((event) => event.sequence > input.afterSequence);
    const terminalEvent = events.find((event) => event.status === 'SUCCEEDED');
    if (terminalEvent !== undefined) {
      state.invocation = {
        ...state.invocation,
        status: 'SUCCEEDED',
        outputText: state.events.map((event) => event.textDelta ?? '').join('') || null,
        metering: terminalEvent.metering,
        completedAt: terminalEvent.createdAt,
      };
    }
    state.cursor = events.at(-1)?.sequence ?? state.cursor;
    return {
      ok: true,
      source: this.source,
      data: {
        handshake: {
          invocationId: input.invocationId,
          transport: 'POLL',
          afterSequence: input.afterSequence,
          eventsPath: '/development-fixture/ai-gateway/events',
        },
        page: {
          invocationId: input.invocationId,
          events,
          nextAfterSequence: state.cursor,
        },
      },
    };
  }

  public async cancelInvocation(
    input: Parameters<AiLabClient['cancelInvocation']>[0],
  ): Promise<AiLabResult<AiGatewayInvocation>> {
    const state = this.invocations.get(input.invocationId);
    if (state === undefined) {
      return failure(
        { code: 'NOT_FOUND', message: '本地开发调用不存在。', retryable: false },
        this.source,
      );
    }
    const now = fixtureNow();
    state.invocation = {
      ...state.invocation,
      status: 'CANCELLED',
      cancelledAt: now,
    };
    return { ok: true, source: this.source, data: state.invocation };
  }

  public async revokeByok(): Promise<AiLabResult<AiGatewayByokProviderStatus>> {
    return failure(
      {
        code: 'NOT_FOUND',
        message: '本地开发适配器没有可撤销的 BYOK 配置。',
        retryable: false,
      },
      this.source,
    );
  }
}

export class UnavailableAiLabClient implements AiLabClient {
  readonly source = 'UNAVAILABLE' as const;

  public async readSnapshot(): Promise<AiLabResult<AiLabSnapshot>> {
    return failure();
  }

  public async updatePreferences(): Promise<AiLabResult<AiGatewayPreferences>> {
    return failure();
  }

  public async createInvocation(): Promise<AiLabResult<AiGatewayInvocation>> {
    return failure();
  }

  public async getInvocation(): Promise<AiLabResult<AiGatewayInvocation>> {
    return failure();
  }

  public async readStream(): Promise<AiLabResult<AiLabStreamUpdate>> {
    return failure();
  }

  public async cancelInvocation(): Promise<AiLabResult<AiGatewayInvocation>> {
    return failure();
  }

  public async revokeByok(): Promise<AiLabResult<AiGatewayByokProviderStatus>> {
    return failure();
  }
}

export interface AiLabRuntimeClientOptions {
  readonly apiBaseUrl?: string;
  readonly fixtureEnabled?: boolean;
  readonly production?: boolean;
}

function normalizedRuntimeBaseUrl(
  value: string | undefined,
  production: boolean,
): string | undefined {
  const candidate = value?.trim();
  if (candidate === undefined || candidate.length === 0) return undefined;
  if (!production && candidate === '/') return '';
  try {
    const url = new URL(candidate);
    if (url.username || url.password || url.search || url.hash || url.pathname !== '/') {
      return undefined;
    }
    if (production && url.protocol !== 'https:') return undefined;
    if (!production && url.protocol !== 'https:' && url.protocol !== 'http:') return undefined;
    return url.origin;
  } catch {
    return undefined;
  }
}

/** Production must receive a configured HTTPS origin. Development and tests
 * may explicitly choose a local/same-origin adapter or a labeled fixture; no
 * production fallback, random URL, or implicit mock is ever selected. */
export function createRuntimeAiLabClient(
  options: AiLabRuntimeClientOptions = {},
): AiLabClient {
  const production = options.production ?? import.meta.env.PROD;
  const configured = normalizedRuntimeBaseUrl(options.apiBaseUrl, production);
  if (configured !== undefined) {
    return new ApiAiLabClient(
      createMeZipSdk(new FetchMessagingTransport({ baseUrl: configured })).aiGateway,
    );
  }
  if (!production && options.fixtureEnabled === true && options.apiBaseUrl?.trim().length === 0) {
    return new DevelopmentFixtureAiLabClient();
  }
  return new UnavailableAiLabClient();
}

export const aiLabClient: AiLabClient = createRuntimeAiLabClient({
  apiBaseUrl: import.meta.env.VITE_MEZIP_AI_GATEWAY_API_BASE_URL,
  fixtureEnabled: import.meta.env.VITE_MEZIP_AI_LAB_FIXTURE === 'true',
});

export function createAiLabActionKey(scope: string): string {
  const normalized = scope.replace(/[^a-z0-9_-]/giu, '').slice(0, 32) || 'ai-lab';
  const random =
    typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function'
      ? crypto.randomUUID().replace(/-/gu, '')
      : Math.random().toString(36).slice(2, 14);
  return `${normalized}-${Date.now().toString(36)}-${random}`;
}
