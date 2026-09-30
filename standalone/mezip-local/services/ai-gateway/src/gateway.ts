import { createHash, randomUUID } from 'node:crypto';

import type {
  AiGatewayAccessEntitlementCode,
  AiGatewayByokEncryptedEnvelope,
  AiGatewayByokProviderStatus,
  AiGatewayCapabilityCode,
  AiGatewayCapabilityRegistryEntry,
  AiGatewayConversation,
  AiGatewayConversationPage,
  AiGatewayContextScope,
  AiGatewayCredentialMode,
  AiGatewayInvocation,
  AiGatewayInvocationEvent,
  AiGatewayInvocationEventPage,
  AiGatewayInvocationMessage,
  AiGatewayInvocationPage,
  AiGatewayInvocationStatus,
  AiGatewayMetering,
  AiGatewayModelRegistryEntry,
  AiGatewayPreferences,
  AiGatewayProviderCode,
  AiGatewayProviderRegistryEntry,
  AiGatewayQuota,
  AiGatewayRegistryStatus,
  AiGatewayStreamHandshake,
  AiGatewayToolPolicy,
  AuthenticatedPrincipal,
} from '@me-zip/shared-types';

export type AiGatewayErrorCode =
  | 'FORBIDDEN'
  | 'NOT_FOUND'
  | 'VALIDATION'
  | 'CONFLICT'
  | 'IDEMPOTENCY_CONFLICT'
  | 'QUOTA_EXCEEDED'
  | 'RATE_LIMITED'
  | 'TIMEOUT'
  | 'ENTITLEMENT_REQUIRED'
  | 'CAPABILITY_UNAVAILABLE'
  | 'CREDENTIAL_NOT_CONFIGURED'
  | 'PROVIDER_UNAVAILABLE';

export class AiGatewayError extends Error {
  public constructor(
    public readonly code: AiGatewayErrorCode,
    message: string,
  ) {
    super(message);
    this.name = 'AiGatewayError';
  }
}

export interface AiGatewayRuntime {
  readonly now: () => string;
  readonly id: () => string;
}

const defaultRuntime: AiGatewayRuntime = {
  now: () => new Date().toISOString(),
  id: randomUUID,
};

/** A server-only credential capability. Its shape intentionally has no key
 * value getter. A production implementation may consult a managed secret
 * service, but the gateway never serializes or logs a credential. */
export interface AiGatewaySystemCredentialResolver {
  isConfigured(providerCode: Exclude<AiGatewayProviderCode, 'LOCAL'>): boolean;
}

export class DisabledAiGatewaySystemCredentialResolver implements AiGatewaySystemCredentialResolver {
  public isConfigured(_providerCode: Exclude<AiGatewayProviderCode, 'LOCAL'>): boolean {
    void _providerCode;
    return false;
  }
}

/** Server-side policy seam for Gateway access. It deliberately receives the
 * authenticated principal and resolved registry entries rather than a client
 * plan, entitlement, Root flag, or owner id. Production can bind this to the
 * membership/feature-flag service without widening the consumer contract. */
export interface AiGatewayAccessAuthorizer {
  canInvoke(input: {
    readonly principal: AuthenticatedPrincipal;
    readonly provider: AiGatewayProviderRegistryEntry;
    readonly model: AiGatewayModelRegistryEntry;
    readonly capabilityCode: AiGatewayCapabilityCode;
  }): boolean;
}

/** Development default: authenticated users may invoke only the explicit
 * local adapter. It is not a client-side plan check and cannot enable an
 * external provider. */
export class LocalDevelopmentAiGatewayAccessAuthorizer implements AiGatewayAccessAuthorizer {
  public canInvoke(input: {
    readonly principal: AuthenticatedPrincipal;
    readonly provider: AiGatewayProviderRegistryEntry;
    readonly model: AiGatewayModelRegistryEntry;
    readonly capabilityCode: AiGatewayCapabilityCode;
  }): boolean {
    return input.principal.userId.length > 0 && input.provider.localOnly && input.model.status === 'ACTIVE';
  }
}

/** Server-side entitlement lookup. It intentionally has no plan string or
 * client-supplied grant parameter; production binds this seam to trusted
 * membership/feature-flag data. */
export interface AiGatewayEntitlementResolver {
  has(principal: AuthenticatedPrincipal, entitlement: AiGatewayAccessEntitlementCode): boolean;
}

export class LocalDevelopmentAiGatewayEntitlementResolver implements AiGatewayEntitlementResolver {
  public has(principal: AuthenticatedPrincipal, _entitlement: AiGatewayAccessEntitlementCode): boolean {
    void _entitlement;
    return principal.userId.length > 0;
  }
}

/** Tool execution can only originate from a server-resolved allowlist. The
 * shipped policy disables all tools; there is no shell, admin, filesystem,
 * arbitrary HTTP, payment, or Root tool adapter in Phase 8. */
export interface AiGatewayToolPolicyResolver {
  resolve(input: {
    readonly principal: AuthenticatedPrincipal;
    readonly model: AiGatewayModelRegistryEntry;
    readonly capabilityCode: AiGatewayCapabilityCode;
  }): AiGatewayToolPolicy;
}

export class DisabledAiGatewayToolPolicyResolver implements AiGatewayToolPolicyResolver {
  public resolve(_input: {
    readonly principal: AuthenticatedPrincipal;
    readonly model: AiGatewayModelRegistryEntry;
    readonly capabilityCode: AiGatewayCapabilityCode;
  }): AiGatewayToolPolicy {
    void _input;
    return { execution: 'DISABLED', allowedToolCodes: [] };
  }
}

/** Write-only storage boundary for client encrypted BYOK envelopes. There is
 * deliberately no `read`, `list`, plaintext, or credential-return method. */
export interface AiGatewayByokVault {
  write(input: {
    readonly ownerId: string;
    readonly providerCode: Exclude<AiGatewayProviderCode, 'LOCAL'>;
    readonly encryptedEnvelope: AiGatewayByokEncryptedEnvelope;
  }): void;
  revoke(input: {
    readonly ownerId: string;
    readonly providerCode: Exclude<AiGatewayProviderCode, 'LOCAL'>;
  }): void;
  isConfigured(input: {
    readonly ownerId: string;
    readonly providerCode: Exclude<AiGatewayProviderCode, 'LOCAL'>;
  }): boolean;
}

/** A reviewed server-side envelope/KMS adapter may decrypt just long enough
 * to run a provider's lowest-cost credential check. Its public result is a
 * normalized status only; plaintext and raw provider responses never cross
 * this boundary. */
export interface AiGatewayByokCredentialValidator {
  validate(input: {
    readonly ownerId: string;
    readonly providerCode: Exclude<AiGatewayProviderCode, 'LOCAL'>;
    readonly encryptedEnvelope: AiGatewayByokEncryptedEnvelope;
  }): {
    readonly validationStatus: AiGatewayByokProviderStatus['validationStatus'];
    /** A deliberately non-reversible display mask, supplied only by a
     * reviewed server/KMS integration after it has validated a key. */
    readonly maskedFingerprint?: string | null;
  };
}

export class UnknownAiGatewayByokCredentialValidator implements AiGatewayByokCredentialValidator {
  public validate(_input: {
    readonly ownerId: string;
    readonly providerCode: Exclude<AiGatewayProviderCode, 'LOCAL'>;
    readonly encryptedEnvelope: AiGatewayByokEncryptedEnvelope;
  }): {
    readonly validationStatus: AiGatewayByokProviderStatus['validationStatus'];
    readonly maskedFingerprint: null;
  } {
    void _input;
    return { validationStatus: 'UNKNOWN', maskedFingerprint: null };
  }
}

/** Development/test-only vault. It retains ciphertext in process memory but
 * exposes only a boolean configured check; it cannot reveal the envelope. */
export class InMemoryAiGatewayByokVault implements AiGatewayByokVault {
  private readonly entries = new Map<string, AiGatewayByokEncryptedEnvelope>();

  public write(input: {
    readonly ownerId: string;
    readonly providerCode: Exclude<AiGatewayProviderCode, 'LOCAL'>;
    readonly encryptedEnvelope: AiGatewayByokEncryptedEnvelope;
  }): void {
    this.entries.set(this.key(input.ownerId, input.providerCode), structuredClone(input.encryptedEnvelope));
  }

  public revoke(input: {
    readonly ownerId: string;
    readonly providerCode: Exclude<AiGatewayProviderCode, 'LOCAL'>;
  }): void {
    this.entries.delete(this.key(input.ownerId, input.providerCode));
  }

  public isConfigured(input: {
    readonly ownerId: string;
    readonly providerCode: Exclude<AiGatewayProviderCode, 'LOCAL'>;
  }): boolean {
    return this.entries.has(this.key(input.ownerId, input.providerCode));
  }

  private key(ownerId: string, providerCode: Exclude<AiGatewayProviderCode, 'LOCAL'>): string {
    return `${ownerId}:${providerCode}`;
  }
}

export interface AiGatewayLocalAdapterInput {
  readonly model: AiGatewayModelRegistryEntry;
  readonly capabilityCode: AiGatewayCapabilityCode;
  readonly messages: readonly AiGatewayInvocationMessage[];
}

export interface AiGatewayLocalAdapterResult {
  readonly outputText: string;
  readonly outputTokens?: number;
}

/** The only shipped adapter is deterministic and local. It intentionally does
 * not call an external API or consume any user/provider credential. */
export interface AiGatewayLocalAdapter {
  invoke(input: AiGatewayLocalAdapterInput): AiGatewayLocalAdapterResult;
  listModels?(): readonly AiGatewayModelRegistryEntry[];
  cancelInvocation?(input: { readonly invocationId: string }): void;
  normalizeError?(error: unknown): { readonly code: string; readonly retryable: boolean };
}

/** Provider adapter contract kept server-only. It receives neither plaintext
 * BYOK material nor a client principal/owner override. The local adapter is
 * the only implementation shipped in this phase. */
export interface AiGatewayProviderAdapter {
  readonly providerCode: AiGatewayProviderCode;
  listModels(): readonly AiGatewayModelRegistryEntry[];
  validateCredential(input: { readonly credentialMode: AiGatewayCredentialMode }): { readonly valid: boolean };
  createInvocation(input: AiGatewayLocalAdapterInput): AiGatewayLocalAdapterResult;
  streamInvocation(input: AiGatewayLocalAdapterInput, onDelta: (text: string) => void): AiGatewayLocalAdapterResult;
  cancelInvocation(input: { readonly invocationId: string }): void;
  health(): { readonly availability: AiGatewayProviderRegistryEntry['availability']; readonly health: AiGatewayProviderRegistryEntry['health'] };
  normalizeError(error: unknown): { readonly code: string; readonly retryable: boolean };
  usage(input: { readonly inputTokens: number; readonly result: AiGatewayLocalAdapterResult }): { readonly inputTokens: number; readonly outputTokens: number };
}

export class DeterministicLocalAiGatewayAdapter implements AiGatewayLocalAdapter, AiGatewayProviderAdapter {
  public readonly providerCode = 'LOCAL' as const;

  public invoke(_input: AiGatewayLocalAdapterInput): AiGatewayLocalAdapterResult {
    void _input;
    const outputText = '本地 AI Gateway 开发适配器已完成请求。生产 Provider 尚未配置。';
    return { outputText, outputTokens: estimateTokens(outputText) };
  }

  public listModels(): readonly AiGatewayModelRegistryEntry[] {
    return defaultAiGatewayModels.filter((model) => model.providerCode === 'LOCAL').map(clone);
  }

  public validateCredential(input: { readonly credentialMode: AiGatewayCredentialMode }): { readonly valid: boolean } {
    return { valid: input.credentialMode === 'NONE' };
  }

  public createInvocation(input: AiGatewayLocalAdapterInput): AiGatewayLocalAdapterResult {
    return this.invoke(input);
  }

  public streamInvocation(input: AiGatewayLocalAdapterInput, onDelta: (text: string) => void): AiGatewayLocalAdapterResult {
    const result = this.invoke(input);
    for (const chunk of splitOutput(result.outputText)) onDelta(chunk);
    return result;
  }

  public cancelInvocation(_input: { readonly invocationId: string }): void {
    void _input;
    // The deterministic synchronous adapter has no external operation to cancel.
  }

  public health(): { readonly availability: AiGatewayProviderRegistryEntry['availability']; readonly health: AiGatewayProviderRegistryEntry['health'] } {
    return { availability: 'LOCAL_DEVELOPMENT', health: 'HEALTHY' };
  }

  public normalizeError(_error: unknown): { readonly code: string; readonly retryable: boolean } {
    void _error;
    return { code: 'LOCAL_ADAPTER_ERROR', retryable: false };
  }

  public usage(input: { readonly inputTokens: number; readonly result: AiGatewayLocalAdapterResult }): { readonly inputTokens: number; readonly outputTokens: number } {
    return { inputTokens: input.inputTokens, outputTokens: input.result.outputTokens ?? estimateTokens(input.result.outputText) };
  }
}

export const defaultAiGatewayProviders: readonly AiGatewayProviderRegistryEntry[] = [
  {
    code: 'LOCAL',
    displayName: 'Local development adapter',
    adapterType: 'LOCAL_DETERMINISTIC',
    apiBaseConfigured: false,
    supportsDynamicModels: false,
    status: 'ACTIVE',
    availability: 'LOCAL_DEVELOPMENT',
    health: 'HEALTHY',
    credentialModes: ['NONE'],
    localOnly: true,
  },
  {
    code: 'OPENAI',
    displayName: 'OpenAI',
    adapterType: 'OPENAI_OFFICIAL',
    apiBaseConfigured: false,
    supportsDynamicModels: true,
    status: 'DISABLED',
    availability: 'NOT_CONFIGURED',
    health: 'UNKNOWN',
    credentialModes: ['SYSTEM', 'BYOK'],
    localOnly: false,
  },
  {
    code: 'OPENAI_COMPATIBLE',
    displayName: 'OpenAI-compatible endpoint',
    adapterType: 'OPENAI_COMPATIBLE',
    apiBaseConfigured: false,
    supportsDynamicModels: false,
    status: 'DISABLED',
    availability: 'NOT_CONFIGURED',
    health: 'UNKNOWN',
    credentialModes: ['SYSTEM', 'BYOK'],
    localOnly: false,
  },
  {
    code: 'ANTHROPIC',
    displayName: 'Anthropic',
    adapterType: 'ANTHROPIC_OFFICIAL',
    apiBaseConfigured: false,
    supportsDynamicModels: true,
    status: 'DISABLED',
    availability: 'NOT_CONFIGURED',
    health: 'UNKNOWN',
    credentialModes: ['SYSTEM', 'BYOK'],
    localOnly: false,
  },
  {
    code: 'GOOGLE',
    displayName: 'Google',
    adapterType: 'GOOGLE_OFFICIAL',
    apiBaseConfigured: false,
    supportsDynamicModels: true,
    status: 'DISABLED',
    availability: 'NOT_CONFIGURED',
    health: 'UNKNOWN',
    credentialModes: ['SYSTEM', 'BYOK'],
    localOnly: false,
  },
  {
    code: 'CUSTOM',
    displayName: 'Custom provider',
    adapterType: 'CUSTOM_SERVER',
    apiBaseConfigured: false,
    supportsDynamicModels: false,
    status: 'DISABLED',
    availability: 'NOT_CONFIGURED',
    health: 'UNKNOWN',
    credentialModes: ['SYSTEM', 'BYOK'],
    localOnly: false,
  },
];

export const defaultAiGatewayCapabilities: readonly AiGatewayCapabilityRegistryEntry[] = [
  { code: 'CHAT_COMPLETION', displayName: 'Chat completion', status: 'ACTIVE', description: 'Conversational text completion.', inputModalities: ['TEXT'], outputModalities: ['TEXT'], requiresExplicitToolGrant: false },
  { code: 'TEXT_GENERATION', displayName: 'Text generation', status: 'ACTIVE', description: 'General text generation.', inputModalities: ['TEXT'], outputModalities: ['TEXT'], requiresExplicitToolGrant: false },
  { code: 'TEXT', displayName: 'Text', status: 'ACTIVE', description: 'Text input and output support.', inputModalities: ['TEXT'], outputModalities: ['TEXT'], requiresExplicitToolGrant: false },
  { code: 'VISION', displayName: 'Vision', status: 'DISABLED', description: 'Future image understanding capability.', inputModalities: ['IMAGE'], outputModalities: ['TEXT'], requiresExplicitToolGrant: false },
  { code: 'CODE', displayName: 'Code', status: 'DISABLED', description: 'Future code generation capability.', inputModalities: ['TEXT'], outputModalities: ['TEXT'], requiresExplicitToolGrant: false },
  { code: 'REASONING', displayName: 'Reasoning', status: 'DISABLED', description: 'Future reasoning capability.', inputModalities: ['TEXT'], outputModalities: ['TEXT'], requiresExplicitToolGrant: false },
  { code: 'IMAGE_GENERATION', displayName: 'Image generation', status: 'DISABLED', description: 'Future image generation capability.', inputModalities: ['TEXT'], outputModalities: ['IMAGE'], requiresExplicitToolGrant: false },
  { code: 'AUDIO_INPUT', displayName: 'Audio input', status: 'DISABLED', description: 'Future audio understanding capability.', inputModalities: ['AUDIO'], outputModalities: ['TEXT'], requiresExplicitToolGrant: false },
  { code: 'AUDIO_OUTPUT', displayName: 'Audio output', status: 'DISABLED', description: 'Future audio generation capability.', inputModalities: ['TEXT'], outputModalities: ['AUDIO'], requiresExplicitToolGrant: false },
  { code: 'TOOL_CALLING', displayName: 'Tool calling', status: 'DISABLED', description: 'Server-allowlisted tool calling only.', inputModalities: ['TEXT'], outputModalities: ['TEXT'], requiresExplicitToolGrant: true },
  { code: 'STRUCTURED_OUTPUT', displayName: 'Structured output', status: 'ACTIVE', description: 'Structured text output.', inputModalities: ['TEXT'], outputModalities: ['TEXT'], requiresExplicitToolGrant: false },
  { code: 'STREAMING', displayName: 'Streaming output', status: 'ACTIVE', description: 'Incremental output event stream.', inputModalities: ['TEXT'], outputModalities: ['TEXT'], requiresExplicitToolGrant: false },
  { code: 'EMBEDDING', displayName: 'Embedding', status: 'DISABLED', description: 'Future embedding capability.', inputModalities: ['TEXT'], outputModalities: ['EMBEDDING'], requiresExplicitToolGrant: false },
];

export const defaultAiGatewayModels: readonly AiGatewayModelRegistryEntry[] = [
  {
    code: 'LOCAL_ECHO_V1',
    providerCode: 'LOCAL',
    displayName: 'Local development model',
    status: 'ACTIVE',
    availability: 'LOCAL_DEVELOPMENT',
    health: 'HEALTHY',
    capabilityCodes: ['CHAT_COMPLETION', 'TEXT_GENERATION', 'TEXT', 'STRUCTURED_OUTPUT', 'STREAMING'],
    contextWindow: 8_192,
    maxInputTokens: 8_192,
    maxOutputTokens: 512,
    supportsStreaming: true,
    // The deterministic adapter never contacts a paid Provider, so its
    // server-maintained local cost metadata is explicitly zero rather than an
    // invented external price.
    pricingMetadata: { inputFenPerMillionTokens: 0, outputFenPerMillionTokens: 0 },
    releaseMetadata: { releasedAt: null, source: 'SERVER_MAINTAINED' },
    deprecatedAt: null,
    lastSyncedAt: null,
  },
  {
    code: 'OPENAI_CHAT_V1',
    providerCode: 'OPENAI',
    displayName: 'OpenAI chat (not configured)',
    status: 'DISABLED',
    availability: 'NOT_CONFIGURED',
    health: 'UNKNOWN',
    capabilityCodes: ['CHAT_COMPLETION', 'TEXT_GENERATION', 'STREAMING'],
    contextWindow: null,
    maxInputTokens: 0,
    maxOutputTokens: 0,
    supportsStreaming: false,
    pricingMetadata: null,
    releaseMetadata: null,
    deprecatedAt: null,
    lastSyncedAt: null,
  },
  {
    code: 'OPENAI_COMPATIBLE_CHAT_V1',
    providerCode: 'OPENAI_COMPATIBLE',
    displayName: 'OpenAI-compatible chat (not configured)',
    status: 'DISABLED',
    availability: 'NOT_CONFIGURED',
    health: 'UNKNOWN',
    capabilityCodes: ['CHAT_COMPLETION', 'TEXT_GENERATION', 'STREAMING'],
    contextWindow: null,
    maxInputTokens: 0,
    maxOutputTokens: 0,
    supportsStreaming: false,
    pricingMetadata: null,
    releaseMetadata: null,
    deprecatedAt: null,
    lastSyncedAt: null,
  },
  {
    code: 'ANTHROPIC_CHAT_V1',
    providerCode: 'ANTHROPIC',
    displayName: 'Anthropic chat (not configured)',
    status: 'DISABLED',
    availability: 'NOT_CONFIGURED',
    health: 'UNKNOWN',
    capabilityCodes: ['CHAT_COMPLETION', 'TEXT_GENERATION', 'STREAMING'],
    contextWindow: null,
    maxInputTokens: 0,
    maxOutputTokens: 0,
    supportsStreaming: false,
    pricingMetadata: null,
    releaseMetadata: null,
    deprecatedAt: null,
    lastSyncedAt: null,
  },
  {
    code: 'GOOGLE_CHAT_V1',
    providerCode: 'GOOGLE',
    displayName: 'Google chat (not configured)',
    status: 'DISABLED',
    availability: 'NOT_CONFIGURED',
    health: 'UNKNOWN',
    capabilityCodes: ['CHAT_COMPLETION', 'TEXT_GENERATION', 'STREAMING'],
    contextWindow: null,
    maxInputTokens: 0,
    maxOutputTokens: 0,
    supportsStreaming: false,
    pricingMetadata: null,
    releaseMetadata: null,
    deprecatedAt: null,
    lastSyncedAt: null,
  },
  {
    code: 'CUSTOM_CHAT_V1',
    providerCode: 'CUSTOM',
    displayName: 'Custom provider chat (not configured)',
    status: 'DISABLED',
    availability: 'NOT_CONFIGURED',
    health: 'UNKNOWN',
    capabilityCodes: ['CHAT_COMPLETION', 'TEXT_GENERATION', 'STREAMING'],
    contextWindow: null,
    maxInputTokens: 0,
    maxOutputTokens: 0,
    supportsStreaming: false,
    pricingMetadata: null,
    releaseMetadata: null,
    deprecatedAt: null,
    lastSyncedAt: null,
  },
];

export interface AiGatewayInvocationCreateInput {
  readonly modelCode: string;
  readonly capabilityCode: AiGatewayCapabilityCode;
  readonly messages: readonly AiGatewayInvocationMessage[];
  readonly stream?: boolean | undefined;
  readonly context?: { readonly scope: AiGatewayContextScope } | undefined;
  readonly conversationId?: string | undefined;
}

export interface AiGatewayPageOptions {
  readonly cursor?: string | undefined;
  readonly limit?: number | undefined;
}

export interface AiGatewayEventPageOptions {
  readonly afterSequence?: number | undefined;
  readonly limit?: number | undefined;
}

export interface AiGatewayServiceOptions {
  readonly runtime?: Partial<AiGatewayRuntime>;
  readonly providers?: readonly AiGatewayProviderRegistryEntry[];
  readonly models?: readonly AiGatewayModelRegistryEntry[];
  readonly capabilities?: readonly AiGatewayCapabilityRegistryEntry[];
  readonly quotaTokensPerDay?: number;
  /** False creates durable-like queued work for a worker/test to call
   * `runPendingInvocation`; true runs the deterministic local adapter inline. */
  readonly autoRunLocal?: boolean;
  readonly localAdapter?: AiGatewayLocalAdapter;
  readonly byokVault?: AiGatewayByokVault;
  readonly byokCredentialValidator?: AiGatewayByokCredentialValidator;
  readonly systemCredentialResolver?: AiGatewaySystemCredentialResolver;
  readonly accessAuthorizer?: AiGatewayAccessAuthorizer;
  readonly entitlementResolver?: AiGatewayEntitlementResolver;
  readonly toolPolicyResolver?: AiGatewayToolPolicyResolver;
  readonly executionPolicy?: Partial<AiGatewayExecutionPolicy>;
}

interface InternalInvocation extends AiGatewayInvocation {
  readonly ownerId: string;
  readonly messages: readonly AiGatewayInvocationMessage[];
  readonly stream: boolean;
  readonly inputTokens: number;
  readonly reservedTokens: number;
}

interface InternalConversation extends AiGatewayConversation {
  readonly ownerId: string;
}

interface IdempotencyRecord {
  readonly fingerprint: string;
  readonly invocationId: string;
}

interface ByokIdempotencyRecord {
  readonly fingerprint: string;
  readonly status: AiGatewayByokProviderStatus;
}

interface InternalByokStatus extends AiGatewayByokProviderStatus {
  readonly ownerId: string;
}

interface UsageLedger {
  readonly periodStartedAt: string;
  readonly resetsAt: string;
  usedTokens: number;
  reservedTokens: number;
}

interface ProviderCircuitState {
  failures: number;
  openUntil: number | null;
}

export interface AiGatewayExecutionPolicy {
  /** Bounded retry ceiling. There is no unbounded retry loop. */
  readonly maxAttempts: number;
  /** Adapter execution budget. Production adapters must honor a cancellation
   * signal; local sync adapters are measured and fail closed when over budget. */
  readonly timeoutMs: number;
  readonly circuitFailureThreshold: number;
  readonly circuitOpenMs: number;
  /** A server-side low-cost safety limiter. It applies even when a future
   * BYOK policy does not draw from ME.zip's provider budget. */
  readonly maxRequestsPerMinute: number;
}

const defaultExecutionPolicy: AiGatewayExecutionPolicy = {
  maxAttempts: 2,
  timeoutMs: 10_000,
  circuitFailureThreshold: 3,
  circuitOpenMs: 30_000,
  maxRequestsPerMinute: 24,
};

const clone = <T>(value: T): T => structuredClone(value);
const hash = (value: string): string => createHash('sha256').update(value).digest('hex');
const key = (...parts: readonly string[]): string => parts.join(':');

function stableStringify(value: unknown): string {
  if (value === null || typeof value !== 'object') return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map((entry) => stableStringify(entry)).join(',')}]`;
  const record = value as Readonly<Record<string, unknown>>;
  return `{${Object.keys(record).sort().map((name) => `${JSON.stringify(name)}:${stableStringify(record[name])}`).join(',')}}`;
}

function estimateTokens(value: string): number {
  return Math.max(1, Math.ceil(value.trim().length / 4));
}

function elapsedMilliseconds(startedAt: string, completedAt: string): number {
  const started = Date.parse(startedAt);
  const completed = Date.parse(completedAt);
  if (!Number.isFinite(started) || !Number.isFinite(completed)) return 0;
  return Math.max(0, completed - started);
}

function splitOutput(value: string): readonly string[] {
  const size = 16;
  return Array.from({ length: Math.ceil(value.length / size) }, (_, index) => value.slice(index * size, (index + 1) * size));
}

function dayBoundaries(now: string): { readonly periodStartedAt: string; readonly resetsAt: string } {
  const date = new Date(now);
  if (!Number.isFinite(date.getTime())) throw new AiGatewayError('VALIDATION', 'Gateway clock is invalid.');
  const periodStartedAt = new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate())).toISOString();
  const resetsAt = new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate() + 1)).toISOString();
  return { periodStartedAt, resetsAt };
}

function isTerminal(status: AiGatewayInvocationStatus): boolean {
  return status === 'SUCCEEDED' || status === 'FAILED' || status === 'CANCELLED' || status === 'REJECTED';
}

function isExternalProvider(code: AiGatewayProviderCode): code is Exclude<AiGatewayProviderCode, 'LOCAL'> {
  return code !== 'LOCAL';
}

function assertIdempotencyKey(value: string): void {
  if (!/^[A-Za-z0-9_-]{8,200}$/u.test(value)) {
    throw new AiGatewayError('VALIDATION', 'Idempotency key is invalid.');
  }
}

function assertEnvelope(value: AiGatewayByokEncryptedEnvelope): void {
  if (
    (value.algorithm !== 'RSA-OAEP-256' && value.algorithm !== 'X25519-AES-GCM') ||
    !/^[A-Za-z0-9_.-]{1,120}$/u.test(value.keyId) ||
    !/^[A-Za-z0-9_-]+={0,2}$/u.test(value.ciphertext) ||
    value.ciphertext.length < 32 ||
    value.ciphertext.length > 65_536
  ) {
    throw new AiGatewayError('VALIDATION', 'Encrypted credential envelope is invalid.');
  }
}

/** Treat the provider/KMS adapter as an untrusted boundary even though it is
 * server-only: only a short non-reversible mask may reach a public DTO. */
function safeMaskedFingerprint(value: string | null | undefined): string | null {
  if (value === null || value === undefined) return null;
  return /^•{4,32}[A-Za-z0-9]{4,12}$/u.test(value) ? value : null;
}

/** Server-authoritative AI Gateway domain. Every owner lookup begins from the
 * authenticated principal and no public method accepts a target user, Root
 * forwarding flag, quota override, provider credential, or client cost. */
export class AiGatewayService {
  private readonly runtime: AiGatewayRuntime;
  private readonly providers: Map<AiGatewayProviderCode, AiGatewayProviderRegistryEntry>;
  private readonly models: Map<string, AiGatewayModelRegistryEntry>;
  private readonly capabilities: Map<AiGatewayCapabilityCode, AiGatewayCapabilityRegistryEntry>;
  private readonly quotaTokensPerDay: number;
  private readonly autoRunLocal: boolean;
  private readonly localAdapter: AiGatewayLocalAdapter;
  private readonly byokVault: AiGatewayByokVault;
  private readonly byokCredentialValidator: AiGatewayByokCredentialValidator;
  private readonly systemCredentialResolver: AiGatewaySystemCredentialResolver;
  private readonly accessAuthorizer: AiGatewayAccessAuthorizer;
  private readonly entitlementResolver: AiGatewayEntitlementResolver;
  private readonly toolPolicyResolver: AiGatewayToolPolicyResolver;
  private readonly executionPolicy: AiGatewayExecutionPolicy;
  private readonly invocations = new Map<string, InternalInvocation>();
  private readonly events = new Map<string, AiGatewayInvocationEvent[]>();
  private readonly invocationIdempotency = new Map<string, IdempotencyRecord>();
  private readonly cancellationIdempotency = new Map<string, IdempotencyRecord>();
  private readonly conversationIdempotency = new Map<string, IdempotencyRecord>();
  private readonly byokIdempotency = new Map<string, ByokIdempotencyRecord>();
  private readonly byokStatuses = new Map<string, InternalByokStatus>();
  private readonly ledgers = new Map<string, UsageLedger>();
  private readonly providerCircuits = new Map<AiGatewayProviderCode, ProviderCircuitState>();
  private readonly requestTimestamps = new Map<string, number[]>();
  private readonly conversations = new Map<string, InternalConversation>();
  private readonly preferences = new Map<string, AiGatewayPreferences>();

  public constructor(options: AiGatewayServiceOptions = {}) {
    this.runtime = { ...defaultRuntime, ...options.runtime };
    this.providers = new Map(defaultAiGatewayProviders.map((entry) => [entry.code, clone(entry)]));
    this.models = new Map(defaultAiGatewayModels.map((entry) => [entry.code, clone(entry)]));
    this.capabilities = new Map(defaultAiGatewayCapabilities.map((entry) => [entry.code, clone(entry)]));
    for (const entry of options.providers ?? []) this.providers.set(entry.code, clone(entry));
    for (const entry of options.models ?? []) this.models.set(entry.code, clone(entry));
    for (const entry of options.capabilities ?? []) this.capabilities.set(entry.code, clone(entry));
    this.quotaTokensPerDay = options.quotaTokensPerDay ?? 20_000;
    this.autoRunLocal = options.autoRunLocal ?? true;
    this.localAdapter = options.localAdapter ?? new DeterministicLocalAiGatewayAdapter();
    this.byokVault = options.byokVault ?? new InMemoryAiGatewayByokVault();
    this.byokCredentialValidator = options.byokCredentialValidator ?? new UnknownAiGatewayByokCredentialValidator();
    this.systemCredentialResolver = options.systemCredentialResolver ?? new DisabledAiGatewaySystemCredentialResolver();
    this.accessAuthorizer = options.accessAuthorizer ?? new LocalDevelopmentAiGatewayAccessAuthorizer();
    this.entitlementResolver = options.entitlementResolver ?? new LocalDevelopmentAiGatewayEntitlementResolver();
    this.toolPolicyResolver = options.toolPolicyResolver ?? new DisabledAiGatewayToolPolicyResolver();
    this.executionPolicy = { ...defaultExecutionPolicy, ...options.executionPolicy };
    this.assertRegistry();
    if (!Number.isSafeInteger(this.quotaTokensPerDay) || this.quotaTokensPerDay < 1) {
      throw new AiGatewayError('VALIDATION', 'Gateway quota must be a positive integer.');
    }
    this.assertExecutionPolicy();
  }

  public listProviders(_principal: AuthenticatedPrincipal): readonly AiGatewayProviderRegistryEntry[] {
    void _principal;
    return [...this.providers.values()].map(clone).sort((left, right) => left.code.localeCompare(right.code));
  }

  public listModels(_principal: AuthenticatedPrincipal): readonly AiGatewayModelRegistryEntry[] {
    void _principal;
    return [...this.models.values()].map(clone).sort((left, right) => left.code.localeCompare(right.code));
  }

  public listCapabilities(_principal: AuthenticatedPrincipal): readonly AiGatewayCapabilityRegistryEntry[] {
    void _principal;
    return [...this.capabilities.values()].map(clone).sort((left, right) => left.code.localeCompare(right.code));
  }

  /** Server-composition-only registry maintenance seam. It is intentionally
   * absent from the consumer SDK/API; `AdminAiGatewayService` is responsible
   * for Root capability enforcement and immutable audit before calling it. */
  public adminSetProviderStatus(
    providerCode: AiGatewayProviderCode,
    status: AiGatewayRegistryStatus,
  ): AiGatewayProviderRegistryEntry {
    const current = this.providers.get(providerCode);
    if (current === undefined) throw new AiGatewayError('NOT_FOUND', 'AI Gateway provider was not found.');
    if (status === 'ACTIVE' && !current.localOnly) {
      throw new AiGatewayError('PROVIDER_UNAVAILABLE', 'A non-local provider adapter is not configured.');
    }
    const next = {
      ...current,
      status,
      availability:
        status === 'ACTIVE' && current.localOnly
          ? ('LOCAL_DEVELOPMENT' as const)
          : status === 'CONFIG_REQUIRED'
            ? ('NOT_CONFIGURED' as const)
            : status === 'UNAVAILABLE'
              ? ('UNAVAILABLE' as const)
              : ('DISABLED' as const),
    };
    this.providers.set(providerCode, next);
    return clone(next);
  }

  public adminSetModelStatus(
    modelCode: string,
    status: AiGatewayRegistryStatus,
  ): AiGatewayModelRegistryEntry {
    const current = this.models.get(modelCode);
    if (current === undefined) throw new AiGatewayError('NOT_FOUND', 'AI Gateway model was not found.');
    const provider = this.providers.get(current.providerCode);
    if (provider === undefined) throw new AiGatewayError('NOT_FOUND', 'AI Gateway provider was not found.');
    if (status === 'ACTIVE' && !provider.localOnly) {
      throw new AiGatewayError('PROVIDER_UNAVAILABLE', 'A non-local model adapter is not configured.');
    }
    const next = {
      ...current,
      status,
      availability:
        status === 'ACTIVE' && provider.localOnly
          ? ('LOCAL_DEVELOPMENT' as const)
          : status === 'CONFIG_REQUIRED'
            ? ('NOT_CONFIGURED' as const)
            : status === 'UNAVAILABLE'
              ? ('UNAVAILABLE' as const)
              : ('DISABLED' as const),
    };
    this.models.set(modelCode, next);
    return clone(next);
  }

  /** Safe local adapter model sync. No web scraping or non-official discovery
   * exists in this repository; external adapters remain disabled until an
   * independently reviewed server integration is configured. */
  public adminSyncLocalModels(): readonly AiGatewayModelRegistryEntry[] {
    if (typeof this.localAdapter.listModels !== 'function') {
      return [];
    }
    const synced = this.localAdapter.listModels().filter((model) => model.providerCode === 'LOCAL');
    for (const model of synced) this.models.set(model.code, clone(model));
    this.assertRegistry();
    return synced.map(clone);
  }

  /** Provider health is metadata-only. The local adapter performs no expensive
   * generation health probe; a future provider adapter may implement a low
   * cost status check behind this server-only seam. */
  public adminProviderHealth(providerCode: AiGatewayProviderCode): {
    readonly provider: AiGatewayProviderRegistryEntry;
    readonly circuitOpen: boolean;
  } {
    const provider = this.providers.get(providerCode);
    if (provider === undefined) throw new AiGatewayError('NOT_FOUND', 'AI Gateway provider was not found.');
    const circuit = this.providerCircuits.get(providerCode);
    return {
      provider: clone(provider),
      circuitOpen: circuit?.openUntil !== null && circuit?.openUntil !== undefined && Date.now() < circuit.openUntil,
    };
  }

  public getQuota(principal: AuthenticatedPrincipal): AiGatewayQuota {
    const ledger = this.ledgerFor(principal.userId);
    const allocated = ledger.usedTokens + ledger.reservedTokens;
    return {
      unit: 'TOKENS',
      limit: this.quotaTokensPerDay,
      used: allocated,
      remaining: Math.max(0, this.quotaTokensPerDay - allocated),
      periodStartedAt: ledger.periodStartedAt,
      resetsAt: ledger.resetsAt,
    };
  }

  /** User defaults are advisory registry references only. They never select a
   * credential, bypass the model/provider availability checks, or alter
   * entitlements. A deprecated/unavailable saved model is deliberately kept
   * visible so the client can ask the owner to choose again. */
  public getPreferences(principal: AuthenticatedPrincipal): AiGatewayPreferences {
    return clone(this.preferences.get(principal.userId) ?? {
      defaultProviderCode: null,
      defaultModelCode: null,
      updatedAt: this.runtime.now(),
    });
  }

  public updatePreferences(
    principal: AuthenticatedPrincipal,
    input: { readonly defaultProviderCode?: AiGatewayProviderCode | null | undefined; readonly defaultModelCode?: string | null | undefined },
  ): AiGatewayPreferences {
    const current = this.getPreferences(principal);
    const defaultProviderCode = input.defaultProviderCode === undefined
      ? current.defaultProviderCode
      : input.defaultProviderCode;
    const defaultModelCode = input.defaultModelCode === undefined
      ? current.defaultModelCode
      : input.defaultModelCode;
    if (defaultProviderCode !== null && !this.providers.has(defaultProviderCode)) {
      throw new AiGatewayError('VALIDATION', 'AI Gateway default provider is invalid.');
    }
    if (defaultModelCode !== null) {
      const model = this.models.get(defaultModelCode);
      if (model === undefined || model.status !== 'ACTIVE') {
        throw new AiGatewayError('VALIDATION', 'AI Gateway default model is unavailable.');
      }
      if (defaultProviderCode !== null && model.providerCode !== defaultProviderCode) {
        throw new AiGatewayError('VALIDATION', 'AI Gateway default model does not match the provider.');
      }
    }
    const next: AiGatewayPreferences = {
      defaultProviderCode,
      defaultModelCode,
      updatedAt: this.runtime.now(),
    };
    this.preferences.set(principal.userId, next);
    return clone(next);
  }

  /** AI conversations are a separate, private AI-domain metadata boundary.
   * They never reuse human Messaging IDs or add archive/RAG access. Prompt and
   * response persistence remains opt-in future work; this foundation stores
   * only a title/state so users can explicitly group their own requests. */
  public createConversation(
    principal: AuthenticatedPrincipal,
    input: { readonly title?: string | undefined },
    idempotencyKey: string,
  ): AiGatewayConversation {
    assertIdempotencyKey(idempotencyKey);
    if (!this.entitlementResolver.has(principal, 'AI_LAB_ACCESS')) {
      throw new AiGatewayError('ENTITLEMENT_REQUIRED', 'AI Gateway entitlement is not available to this principal.');
    }
    const title = input.title?.trim();
    if (title !== undefined && (title.length === 0 || title.length > 160)) {
      throw new AiGatewayError('VALIDATION', 'AI conversation title is invalid.');
    }
    const fingerprint = hash(stableStringify({ title: title ?? null }));
    const receipt = key(principal.userId, 'conversation-create', idempotencyKey);
    const replay = this.conversationIdempotency.get(receipt);
    if (replay !== undefined) {
      if (replay.fingerprint !== fingerprint) {
        throw new AiGatewayError('IDEMPOTENCY_CONFLICT', 'Conversation key conflicts with an earlier request.');
      }
      return this.publicConversation(this.ownConversation(principal, replay.invocationId));
    }
    const now = this.runtime.now();
    const conversation: InternalConversation = {
      id: this.runtime.id(),
      ownerId: principal.userId,
      title: title ?? null,
      status: 'ACTIVE',
      createdAt: now,
      updatedAt: now,
      deletedAt: null,
    };
    this.conversations.set(conversation.id, conversation);
    this.conversationIdempotency.set(receipt, { fingerprint, invocationId: conversation.id });
    return this.publicConversation(conversation);
  }

  public listConversations(
    principal: AuthenticatedPrincipal,
    options: AiGatewayPageOptions = {},
  ): AiGatewayConversationPage {
    const limit = options.limit ?? 30;
    if (!Number.isSafeInteger(limit) || limit < 1 || limit > 100) {
      throw new AiGatewayError('VALIDATION', 'Conversation page limit is invalid.');
    }
    const rows = [...this.conversations.values()]
      .filter((conversation) => conversation.ownerId === principal.userId && conversation.status === 'ACTIVE')
      .sort((left, right) => right.updatedAt.localeCompare(left.updatedAt) || right.id.localeCompare(left.id));
    let start = 0;
    if (options.cursor !== undefined) {
      const cursorIndex = rows.findIndex((entry) => entry.id === options.cursor);
      if (cursorIndex < 0) throw new AiGatewayError('NOT_FOUND', 'Conversation cursor is not available.');
      start = cursorIndex + 1;
    }
    const items = rows.slice(start, start + limit);
    return {
      items: items.map((entry) => this.publicConversation(entry)),
      nextCursor: start + limit < rows.length ? (items.at(-1)?.id ?? null) : null,
    };
  }

  public deleteConversation(
    principal: AuthenticatedPrincipal,
    conversationId: string,
    idempotencyKey: string,
  ): AiGatewayConversation {
    assertIdempotencyKey(idempotencyKey);
    const conversation = this.ownConversation(principal, conversationId);
    const receipt = key(principal.userId, 'conversation-delete', idempotencyKey);
    const fingerprint = hash(conversationId);
    const replay = this.conversationIdempotency.get(receipt);
    if (replay !== undefined) {
      if (replay.fingerprint !== fingerprint) {
        throw new AiGatewayError('IDEMPOTENCY_CONFLICT', 'Conversation key conflicts with an earlier request.');
      }
      return this.publicConversation(this.ownConversation(principal, replay.invocationId));
    }
    const deleted = conversation.status === 'DELETED'
      ? conversation
      : {
          ...conversation,
          status: 'DELETED' as const,
          updatedAt: this.runtime.now(),
          deletedAt: this.runtime.now(),
        };
    this.conversations.set(deleted.id, deleted);
    this.conversationIdempotency.set(receipt, { fingerprint, invocationId: deleted.id });
    return this.publicConversation(deleted);
  }

  public createInvocation(
    principal: AuthenticatedPrincipal,
    input: AiGatewayInvocationCreateInput,
    idempotencyKey: string,
  ): AiGatewayInvocation {
    assertIdempotencyKey(idempotencyKey);
    this.assertInvocationInput(input);
    const fingerprint = hash(stableStringify(input));
    const idempotencyId = key(principal.userId, 'create', idempotencyKey);
    const replay = this.invocationIdempotency.get(idempotencyId);
    if (replay !== undefined) {
      if (replay.fingerprint !== fingerprint) throw new AiGatewayError('IDEMPOTENCY_CONFLICT', 'Invocation key conflicts with an earlier request.');
      return this.publicInvocation(this.ownInvocation(principal, replay.invocationId));
    }

    const model = this.assertInvokableModel(principal, input.modelCode, input.capabilityCode, input.stream === true);
    const conversation =
      input.conversationId === undefined
        ? null
        : this.ownConversation(principal, input.conversationId);
    if (conversation !== null && conversation.status !== 'ACTIVE') {
      throw new AiGatewayError('NOT_FOUND', 'AI conversation was not found.');
    }
    const credentialMode = this.credentialModeFor(principal.userId, this.providers.get(model.providerCode)!);
    if (credentialMode === null) {
      throw new AiGatewayError('CREDENTIAL_NOT_CONFIGURED', 'AI Gateway credential is not configured.');
    }
    this.assertRateLimit(principal.userId, model.providerCode, model.code, credentialMode);
    const inputTokens = input.messages.reduce((total, message) => total + estimateTokens(message.content), 0);
    if (inputTokens > model.maxInputTokens) throw new AiGatewayError('VALIDATION', 'Invocation input exceeds the model limit.');
    const reservation = inputTokens + model.maxOutputTokens;
    this.reserveQuota(principal.userId, reservation);
    const now = this.runtime.now();
    const invocation: InternalInvocation = {
      id: this.runtime.id(),
      ownerId: principal.userId,
      providerCode: model.providerCode,
      modelCode: model.code,
      capabilityCode: input.capabilityCode,
      status: 'QUEUED',
      // Phase 8 deliberately has no Archive/Message/Media read bridge.  The
      // only permitted scope is the user's explicit text in this request.
      contextScope: input.context?.scope ?? 'NONE',
      conversationId: conversation?.id ?? null,
      toolPolicy: this.toolPolicyResolver.resolve({
        principal,
        model,
        capabilityCode: input.capabilityCode,
      }),
      // Cross-provider/model fallback is disabled by default.  A later
      // policy may opt in, but must surface this fact in the safe projection.
      fallback: { used: false, fromModelCode: null, reasonCode: null },
      inputMessageCount: input.messages.length,
      inputCharacterCount: input.messages.reduce((total, message) => total + message.content.length, 0),
      outputText: null,
      finishReason: null,
      latencyMs: null,
      metering: null,
      createdAt: now,
      startedAt: null,
      completedAt: null,
      cancelledAt: null,
      messages: clone(input.messages),
      stream: input.stream === true,
      inputTokens,
      reservedTokens: reservation,
    };
    this.invocations.set(invocation.id, invocation);
    if (conversation !== null) {
      this.conversations.set(conversation.id, { ...conversation, updatedAt: now });
    }
    this.invocationIdempotency.set(idempotencyId, { fingerprint, invocationId: invocation.id });
    this.appendEvent(invocation, 'INVOCATION_CREATED', 'QUEUED', null, null);
    if (this.autoRunLocal) this.runPendingInvocation(invocation.id);
    return this.publicInvocation(this.ownInvocation(principal, invocation.id));
  }

  /** Worker seam. The repository ships only the local adapter, so an active
   * non-local model cannot be run accidentally while production credentials
   * and approved provider adapters are absent. */
  public runPendingInvocation(invocationId: string): AiGatewayInvocation {
    const current = this.invocations.get(invocationId);
    if (current === undefined) throw new AiGatewayError('NOT_FOUND', 'Invocation was not found.');
    if (current.status !== 'QUEUED') return this.publicInvocation(current);
    const model = this.models.get(current.modelCode);
    if (model === undefined) return this.failInvocation(current, 'Model is unavailable.');
    const provider = this.providers.get(model.providerCode);
    if (provider === undefined || provider.status !== 'ACTIVE') return this.failInvocation(current, 'Provider is unavailable.');
    this.assertProviderCircuit(provider.code);
    const credentialMode = this.credentialModeFor(current.ownerId, provider);
    if (credentialMode === null) return this.failInvocation(current, 'Credential is unavailable.');
    if (!provider.localOnly) {
      this.releaseReservation(current);
      throw new AiGatewayError('PROVIDER_UNAVAILABLE', 'A non-local provider adapter is not configured.');
    }
    const startedAt = this.runtime.now();
    const running = this.updateInvocation(current, { status: 'RUNNING', startedAt });
    this.appendEvent(running, 'STATUS_CHANGED', 'RUNNING', null, null);
    let result: AiGatewayLocalAdapterResult;
    try {
      result = this.executeLocalWithPolicy({
        model,
        capabilityCode: running.capabilityCode,
        messages: clone(running.messages),
      });
      this.recordProviderSuccess(provider.code);
    } catch {
      this.recordProviderFailure(provider.code);
      return this.failInvocation(running, 'Local adapter failed.');
    }
    const outputTokens = result.outputTokens ?? estimateTokens(result.outputText);
    if (!Number.isSafeInteger(outputTokens) || outputTokens < 1 || outputTokens > model.maxOutputTokens) {
      return this.failInvocation(running, 'Local adapter output is invalid.');
    }
    let streamTarget = running;
    if (running.stream) {
      streamTarget = this.updateInvocation(running, { status: 'STREAMING' });
      this.appendEvent(streamTarget, 'STATUS_CHANGED', 'STREAMING', null, null);
      for (const chunk of this.outputChunks(result.outputText)) {
        this.appendEvent(streamTarget, 'OUTPUT_DELTA', 'STREAMING', chunk, null);
      }
    }
    const metering: AiGatewayMetering = {
      inputTokens: streamTarget.inputTokens,
      outputTokens,
      totalTokens: streamTarget.inputTokens + outputTokens,
      costFen: 0,
      currency: 'CNY',
      meteredAt: this.runtime.now(),
    };
    const meteredInvocation = this.consumeReservation(streamTarget, metering.totalTokens);
    const completed = this.updateInvocation(meteredInvocation, {
      status: 'SUCCEEDED',
      outputText: result.outputText,
      finishReason: 'STOP',
      latencyMs: elapsedMilliseconds(startedAt, this.runtime.now()),
      metering,
      completedAt: this.runtime.now(),
      messages: [],
    });
    this.appendEvent(completed, 'COMPLETED', 'SUCCEEDED', null, metering);
    return this.publicInvocation(completed);
  }

  public getInvocation(principal: AuthenticatedPrincipal, invocationId: string): AiGatewayInvocation {
    return this.publicInvocation(this.ownInvocation(principal, invocationId));
  }

  public listInvocations(principal: AuthenticatedPrincipal, options: AiGatewayPageOptions = {}): AiGatewayInvocationPage {
    const limit = options.limit ?? 30;
    if (!Number.isSafeInteger(limit) || limit < 1 || limit > 100) throw new AiGatewayError('VALIDATION', 'Invocation page limit is invalid.');
    const rows = [...this.invocations.values()]
      .filter((entry) => entry.ownerId === principal.userId)
      .sort((left, right) => right.createdAt.localeCompare(left.createdAt) || right.id.localeCompare(left.id));
    let start = 0;
    if (options.cursor !== undefined) {
      const cursorIndex = rows.findIndex((entry) => entry.id === options.cursor);
      if (cursorIndex < 0) throw new AiGatewayError('NOT_FOUND', 'Invocation cursor is not available.');
      start = cursorIndex + 1;
    }
    const slice = rows.slice(start, start + limit);
    return {
      items: slice.map((entry) => this.publicInvocation(entry)),
      nextCursor: start + limit < rows.length ? (slice.at(-1)?.id ?? null) : null,
    };
  }

  public cancelInvocation(
    principal: AuthenticatedPrincipal,
    invocationId: string,
    idempotencyKey: string,
  ): AiGatewayInvocation {
    assertIdempotencyKey(idempotencyKey);
    const fingerprint = hash(invocationId);
    const idempotencyId = key(principal.userId, 'cancel', idempotencyKey);
    const replay = this.cancellationIdempotency.get(idempotencyId);
    if (replay !== undefined) {
      if (replay.fingerprint !== fingerprint) throw new AiGatewayError('IDEMPOTENCY_CONFLICT', 'Cancellation key conflicts with an earlier request.');
      return this.publicInvocation(this.ownInvocation(principal, replay.invocationId));
    }
    const invocation = this.ownInvocation(principal, invocationId);
    if (isTerminal(invocation.status) && invocation.status !== 'CANCELLED') {
      throw new AiGatewayError('CONFLICT', 'A finished invocation cannot be cancelled.');
    }
    const cancelled = invocation.status === 'CANCELLED'
      ? invocation
      : this.updateInvocation(invocation, {
      status: 'CANCELLED',
      cancelledAt: this.runtime.now(),
      completedAt: this.runtime.now(),
      finishReason: 'CANCELLED',
      });
    if (invocation.status !== 'CANCELLED') {
      if (typeof this.localAdapter.cancelInvocation === 'function') {
        this.localAdapter.cancelInvocation({ invocationId });
      }
      this.releaseReservation(invocation);
      this.appendEvent(cancelled, 'CANCELLED', 'CANCELLED', null, null);
    }
    this.cancellationIdempotency.set(idempotencyId, { fingerprint, invocationId });
    return this.publicInvocation(cancelled);
  }

  public listEvents(
    principal: AuthenticatedPrincipal,
    invocationId: string,
    options: AiGatewayEventPageOptions = {},
  ): AiGatewayInvocationEventPage {
    this.ownInvocation(principal, invocationId);
    const afterSequence = options.afterSequence ?? 0;
    const limit = options.limit ?? 100;
    if (!Number.isSafeInteger(afterSequence) || afterSequence < 0 || !Number.isSafeInteger(limit) || limit < 1 || limit > 500) {
      throw new AiGatewayError('VALIDATION', 'Event page options are invalid.');
    }
    const records = (this.events.get(invocationId) ?? []).filter((event) => event.sequence > afterSequence).slice(0, limit).map(clone);
    return {
      invocationId,
      events: records,
      nextAfterSequence: records.at(-1)?.sequence ?? afterSequence,
    };
  }

  public getStreamHandshake(principal: AuthenticatedPrincipal, invocationId: string): AiGatewayStreamHandshake {
    this.ownInvocation(principal, invocationId);
    return {
      invocationId,
      transport: 'POLL',
      afterSequence: 0,
      eventsPath: `/v1/ai-gateway/invocations/${encodeURIComponent(invocationId)}/events`,
    };
  }

  public listByokStatus(principal: AuthenticatedPrincipal): readonly AiGatewayByokProviderStatus[] {
    return [...this.providers.values()]
      .filter((provider): provider is AiGatewayProviderRegistryEntry & { readonly code: Exclude<AiGatewayProviderCode, 'LOCAL'> } => isExternalProvider(provider.code))
      .map((provider) => this.byokStatusFor(principal.userId, provider.code))
      .sort((left, right) => left.providerCode.localeCompare(right.providerCode));
  }

  public configureByok(
    principal: AuthenticatedPrincipal,
    providerCode: Exclude<AiGatewayProviderCode, 'LOCAL'>,
    encryptedEnvelope: AiGatewayByokEncryptedEnvelope,
    idempotencyKey: string,
  ): AiGatewayByokProviderStatus {
    assertIdempotencyKey(idempotencyKey);
    if (!this.entitlementResolver.has(principal, 'AI_LAB_BYOK')) {
      throw new AiGatewayError('ENTITLEMENT_REQUIRED', 'BYOK access is not available to this principal.');
    }
    this.assertExternalProvider(providerCode);
    assertEnvelope(encryptedEnvelope);
    const fingerprint = hash(stableStringify({ providerCode, encryptedEnvelope }));
    const idempotencyId = key(principal.userId, 'byok-configure', idempotencyKey);
    const replay = this.byokIdempotency.get(idempotencyId);
    if (replay !== undefined) {
      if (replay.fingerprint !== fingerprint) throw new AiGatewayError('IDEMPOTENCY_CONFLICT', 'BYOK key conflicts with an earlier request.');
      return clone(replay.status);
    }
    this.byokVault.write({ ownerId: principal.userId, providerCode, encryptedEnvelope });
    const validation = this.byokCredentialValidator.validate({
      ownerId: principal.userId,
      providerCode,
      encryptedEnvelope,
    });
    const status: InternalByokStatus = {
      ownerId: principal.userId,
      providerCode,
      status: 'CONFIGURED',
      configuredAt: this.runtime.now(),
      revokedAt: null,
      maskedFingerprint: safeMaskedFingerprint(validation.maskedFingerprint),
      validationStatus: validation.validationStatus,
      lastValidatedAt: validation.validationStatus === 'UNKNOWN' ? null : this.runtime.now(),
    };
    this.byokStatuses.set(key(principal.userId, providerCode), status);
    const projection = this.publicByokStatus(status);
    this.byokIdempotency.set(idempotencyId, { fingerprint, status: projection });
    return projection;
  }

  public revokeByok(
    principal: AuthenticatedPrincipal,
    providerCode: Exclude<AiGatewayProviderCode, 'LOCAL'>,
    idempotencyKey: string,
  ): AiGatewayByokProviderStatus {
    assertIdempotencyKey(idempotencyKey);
    if (!this.entitlementResolver.has(principal, 'AI_LAB_BYOK')) {
      throw new AiGatewayError('ENTITLEMENT_REQUIRED', 'BYOK access is not available to this principal.');
    }
    this.assertExternalProvider(providerCode);
    const fingerprint = hash(providerCode);
    const idempotencyId = key(principal.userId, 'byok-revoke', idempotencyKey);
    const replay = this.byokIdempotency.get(idempotencyId);
    if (replay !== undefined) {
      if (replay.fingerprint !== fingerprint) throw new AiGatewayError('IDEMPOTENCY_CONFLICT', 'BYOK key conflicts with an earlier request.');
      return clone(replay.status);
    }
    this.byokVault.revoke({ ownerId: principal.userId, providerCode });
    const prior = this.byokStatuses.get(key(principal.userId, providerCode));
    const status: InternalByokStatus = {
      ownerId: principal.userId,
      providerCode,
      status: 'REVOKED',
      configuredAt: prior?.configuredAt ?? null,
      revokedAt: this.runtime.now(),
      maskedFingerprint: prior?.maskedFingerprint ?? null,
      validationStatus: prior?.validationStatus ?? 'UNKNOWN',
      lastValidatedAt: prior?.lastValidatedAt ?? null,
    };
    this.byokStatuses.set(key(principal.userId, providerCode), status);
    const projection = this.publicByokStatus(status);
    this.byokIdempotency.set(idempotencyId, { fingerprint, status: projection });
    return projection;
  }

  /** Execution policy is intentionally bounded.  Provider adapters receive
   * this policy from the server composition; no client request can increase a
   * timeout, retry count, circuit threshold, or fallback scope. */
  private assertExecutionPolicy(): void {
    const policy = this.executionPolicy;
    if (
      !Number.isSafeInteger(policy.maxAttempts) ||
      policy.maxAttempts < 1 ||
      policy.maxAttempts > 3 ||
      !Number.isSafeInteger(policy.timeoutMs) ||
      policy.timeoutMs < 100 ||
      policy.timeoutMs > 60_000 ||
      !Number.isSafeInteger(policy.circuitFailureThreshold) ||
      policy.circuitFailureThreshold < 1 ||
      policy.circuitFailureThreshold > 20 ||
      !Number.isSafeInteger(policy.circuitOpenMs) ||
      policy.circuitOpenMs < 1_000 ||
      policy.circuitOpenMs > 15 * 60_000 ||
      !Number.isSafeInteger(policy.maxRequestsPerMinute) ||
      policy.maxRequestsPerMinute < 1 ||
      policy.maxRequestsPerMinute > 240
    ) {
      throw new AiGatewayError('VALIDATION', 'AI Gateway execution policy is invalid.');
    }
  }

  private assertRegistry(): void {
    for (const provider of this.providers.values()) {
      this.assertProviderShape(provider);
      if (!provider.localOnly && provider.status === 'ACTIVE') {
        throw new AiGatewayError('VALIDATION', 'Only the local AI Gateway adapter can be active in this phase.');
      }
      if (provider.localOnly !== (provider.code === 'LOCAL')) {
        throw new AiGatewayError('VALIDATION', 'AI Gateway local provider declaration is invalid.');
      }
    }
    for (const capability of this.capabilities.values()) {
      if (!['ACTIVE', 'DEGRADED', 'DISABLED', 'UNAVAILABLE', 'CONFIG_REQUIRED', 'DEPRECATED'].includes(capability.status)) {
        throw new AiGatewayError('VALIDATION', 'AI Gateway capability status is invalid.');
      }
    }
    for (const model of this.models.values()) {
      const provider = this.providers.get(model.providerCode);
      if (provider === undefined || !/^[A-Z0-9][A-Z0-9_.-]{1,119}$/u.test(model.code)) {
        throw new AiGatewayError('VALIDATION', 'AI Gateway model registry is invalid.');
      }
      if (!Number.isSafeInteger(model.maxInputTokens) || !Number.isSafeInteger(model.maxOutputTokens) || model.maxInputTokens < 0 || model.maxOutputTokens < 0) {
        throw new AiGatewayError('VALIDATION', 'AI Gateway model limits are invalid.');
      }
      if (model.contextWindow !== null && (!Number.isSafeInteger(model.contextWindow) || model.contextWindow < model.maxInputTokens)) {
        throw new AiGatewayError('VALIDATION', 'AI Gateway model context window is invalid.');
      }
      if (
        model.pricingMetadata !== null &&
        (!Number.isSafeInteger(model.pricingMetadata.inputFenPerMillionTokens ?? 0) ||
          !Number.isSafeInteger(model.pricingMetadata.outputFenPerMillionTokens ?? 0))
      ) {
        throw new AiGatewayError('VALIDATION', 'AI Gateway model pricing metadata is invalid.');
      }
      if (model.status === 'ACTIVE' && !provider.localOnly) {
        throw new AiGatewayError('VALIDATION', 'A non-local AI Gateway model cannot be active in this phase.');
      }
      for (const capability of model.capabilityCodes) {
        if (!this.capabilities.has(capability)) throw new AiGatewayError('VALIDATION', 'AI Gateway model references an unknown capability.');
      }
    }
  }

  private assertProviderShape(provider: AiGatewayProviderRegistryEntry): void {
    if (!['ACTIVE', 'DEGRADED', 'DISABLED', 'UNAVAILABLE', 'CONFIG_REQUIRED', 'DEPRECATED'].includes(provider.status)) {
      throw new AiGatewayError('VALIDATION', 'AI Gateway provider status is invalid.');
    }
    if (!['LOCAL_DEVELOPMENT', 'AVAILABLE', 'NOT_CONFIGURED', 'DISABLED', 'UNAVAILABLE'].includes(provider.availability)) {
      throw new AiGatewayError('VALIDATION', 'AI Gateway provider availability is invalid.');
    }
    if (!['UNKNOWN', 'HEALTHY', 'DEGRADED', 'UNHEALTHY'].includes(provider.health)) {
      throw new AiGatewayError('VALIDATION', 'AI Gateway provider health is invalid.');
    }
    const allowed: readonly AiGatewayCredentialMode[] = ['SYSTEM', 'BYOK', 'NONE'];
    if (provider.credentialModes.length === 0 || provider.credentialModes.some((mode) => !allowed.includes(mode))) {
      throw new AiGatewayError('VALIDATION', 'AI Gateway provider credential modes are invalid.');
    }
    const adapterTypes: readonly AiGatewayProviderRegistryEntry['adapterType'][] = [
      'LOCAL_DETERMINISTIC', 'OPENAI_OFFICIAL', 'OPENAI_COMPATIBLE',
      'ANTHROPIC_OFFICIAL', 'GOOGLE_OFFICIAL', 'CUSTOM_SERVER',
    ];
    if (!adapterTypes.includes(provider.adapterType) || (provider.code === 'LOCAL') !== (provider.adapterType === 'LOCAL_DETERMINISTIC')) {
      throw new AiGatewayError('VALIDATION', 'AI Gateway provider adapter declaration is invalid.');
    }
  }

  private assertInvocationInput(input: AiGatewayInvocationCreateInput): void {
    if (
      !/^[A-Z0-9][A-Z0-9_.-]{1,119}$/u.test(input.modelCode) ||
      !this.capabilities.has(input.capabilityCode) ||
      input.messages.length < 1 ||
      input.messages.length > 64
    ) {
      throw new AiGatewayError('VALIDATION', 'Invocation request is invalid.');
    }
    if (input.context !== undefined && input.context.scope !== 'NONE') {
      // The broader scope vocabulary is reserved for a separately reviewed
      // owner-authorized context port. Phase 8 never auto-reads private data.
      throw new AiGatewayError('VALIDATION', 'AI Gateway private context is not configured.');
    }
    for (const message of input.messages) {
      if (message.role !== 'USER' || message.content.trim().length < 1 || message.content.length > 50_000) {
        throw new AiGatewayError('VALIDATION', 'Invocation messages are invalid.');
      }
    }
  }

  private assertInvokableModel(
    principal: AuthenticatedPrincipal,
    modelCode: string,
    capabilityCode: AiGatewayCapabilityCode,
    stream: boolean,
  ): AiGatewayModelRegistryEntry {
    const model = this.models.get(modelCode);
    if (model === undefined || model.status !== 'ACTIVE') throw new AiGatewayError('PROVIDER_UNAVAILABLE', 'AI Gateway model is unavailable.');
    const provider = this.providers.get(model.providerCode);
    if (provider === undefined || provider.status !== 'ACTIVE') throw new AiGatewayError('PROVIDER_UNAVAILABLE', 'AI Gateway provider is unavailable.');
    const capability = this.capabilities.get(capabilityCode);
    if (capability === undefined || capability.status !== 'ACTIVE' || !model.capabilityCodes.includes(capabilityCode)) {
      throw new AiGatewayError('VALIDATION', 'AI Gateway capability is unavailable for this model.');
    }
    if (stream && (!model.supportsStreaming || !model.capabilityCodes.includes('STREAMING'))) {
      throw new AiGatewayError('VALIDATION', 'This AI Gateway model does not support streaming.');
    }
    if (!this.entitlementResolver.has(principal, 'AI_LAB_ACCESS')) {
      throw new AiGatewayError('ENTITLEMENT_REQUIRED', 'AI Gateway entitlement is not available to this principal.');
    }
    const capabilityEntitlement: Partial<Record<AiGatewayCapabilityCode, AiGatewayAccessEntitlementCode>> = {
      CHAT_COMPLETION: 'AI_STANDARD_MODELS',
      TEXT_GENERATION: 'AI_STANDARD_MODELS',
      TEXT: 'AI_STANDARD_MODELS',
      VISION: 'AI_VISION',
      CODE: 'AI_CODE',
      REASONING: 'AI_REASONING',
      IMAGE_GENERATION: 'AI_IMAGE_GENERATION',
      AUDIO_INPUT: 'AI_AUDIO_INPUT',
      AUDIO_OUTPUT: 'AI_AUDIO_OUTPUT',
      TOOL_CALLING: 'AI_LAB_TOOL_USE',
    };
    const requiredEntitlement = capabilityEntitlement[capabilityCode];
    if (requiredEntitlement !== undefined && !this.entitlementResolver.has(principal, requiredEntitlement)) {
      throw new AiGatewayError('ENTITLEMENT_REQUIRED', 'AI Gateway capability access is not available to this principal.');
    }
    if (!this.accessAuthorizer.canInvoke({ principal, provider, model, capabilityCode })) {
      throw new AiGatewayError('FORBIDDEN', 'AI Gateway access is not available to this principal.');
    }
    return model;
  }

  private ownInvocation(principal: AuthenticatedPrincipal, invocationId: string): InternalInvocation {
    const invocation = this.invocations.get(invocationId);
    // Use NOT_FOUND for a cross-user guess so no caller can enumerate private
    // jobs, outputs, timing, or event stream state.
    if (invocation === undefined || invocation.ownerId !== principal.userId) {
      throw new AiGatewayError('NOT_FOUND', 'Invocation was not found.');
    }
    return invocation;
  }

  private ownConversation(
    principal: AuthenticatedPrincipal,
    conversationId: string,
  ): InternalConversation {
    const conversation = this.conversations.get(conversationId);
    // Do not distinguish an unknown id from another owner's private AI
    // conversation; this avoids a conversation enumeration oracle.
    if (conversation === undefined || conversation.ownerId !== principal.userId) {
      throw new AiGatewayError('NOT_FOUND', 'AI conversation was not found.');
    }
    return conversation;
  }

  private publicConversation(conversation: InternalConversation): AiGatewayConversation {
    return clone({
      id: conversation.id,
      title: conversation.title,
      status: conversation.status,
      createdAt: conversation.createdAt,
      updatedAt: conversation.updatedAt,
      deletedAt: conversation.deletedAt,
    });
  }

  private publicInvocation(invocation: InternalInvocation): AiGatewayInvocation {
    return clone({
      id: invocation.id,
      providerCode: invocation.providerCode,
      modelCode: invocation.modelCode,
      capabilityCode: invocation.capabilityCode,
      status: invocation.status,
      contextScope: invocation.contextScope,
      conversationId: invocation.conversationId,
      toolPolicy: invocation.toolPolicy,
      fallback: invocation.fallback,
      inputMessageCount: invocation.inputMessageCount,
      inputCharacterCount: invocation.inputCharacterCount,
      outputText: invocation.outputText,
      finishReason: invocation.finishReason,
      latencyMs: invocation.latencyMs,
      metering: invocation.metering,
      createdAt: invocation.createdAt,
      startedAt: invocation.startedAt,
      completedAt: invocation.completedAt,
      cancelledAt: invocation.cancelledAt,
    });
  }

  private appendEvent(
    invocation: InternalInvocation,
    type: AiGatewayInvocationEvent['type'],
    status: AiGatewayInvocationStatus,
    textDelta: string | null,
    metering: AiGatewayMetering | null,
  ): void {
    const records = this.events.get(invocation.id) ?? [];
    records.push({
      id: this.runtime.id(),
      invocationId: invocation.id,
      sequence: records.length + 1,
      type,
      status,
      textDelta,
      metering: metering === null ? null : clone(metering),
      createdAt: this.runtime.now(),
    });
    this.events.set(invocation.id, records);
  }

  private updateInvocation(
    invocation: InternalInvocation,
    patch: Partial<Pick<InternalInvocation, 'status' | 'startedAt' | 'outputText' | 'finishReason' | 'latencyMs' | 'metering' | 'completedAt' | 'cancelledAt' | 'messages'>>,
  ): InternalInvocation {
    const next: InternalInvocation = { ...invocation, ...patch };
    this.invocations.set(next.id, next);
    return next;
  }

  /** The shipped adapter is synchronous, but the execution wrapper preserves
   * the production safety contract: bounded attempts, no retry for normalized
   * non-retryable errors, elapsed-time enforcement, and a per-provider circuit
   * breaker. A future network adapter plugs into the same server-only policy. */
  private executeLocalWithPolicy(input: AiGatewayLocalAdapterInput): AiGatewayLocalAdapterResult {
    let lastError: unknown;
    for (let attempt = 1; attempt <= this.executionPolicy.maxAttempts; attempt += 1) {
      const startedAt = Date.now();
      try {
        const result = this.localAdapter.invoke(input);
        if (Date.now() - startedAt > this.executionPolicy.timeoutMs) {
          throw new AiGatewayError('TIMEOUT', 'AI Gateway adapter exceeded its timeout budget.');
        }
        return result;
      } catch (error) {
        lastError = error;
        const normalized =
          typeof this.localAdapter.normalizeError === 'function'
            ? this.localAdapter.normalizeError(error)
            : { code: 'LOCAL_ADAPTER_ERROR', retryable: false };
        if (!normalized.retryable || attempt === this.executionPolicy.maxAttempts) break;
      }
    }
    if (lastError instanceof AiGatewayError) throw lastError;
    throw new AiGatewayError('PROVIDER_UNAVAILABLE', 'AI Gateway adapter is unavailable.');
  }

  private assertProviderCircuit(providerCode: AiGatewayProviderCode): void {
    const state = this.providerCircuits.get(providerCode);
    if (state?.openUntil === null || state === undefined) return;
    if (Date.now() >= state.openUntil) {
      this.providerCircuits.set(providerCode, { failures: 0, openUntil: null });
      return;
    }
    throw new AiGatewayError('PROVIDER_UNAVAILABLE', 'AI Gateway provider is temporarily unavailable.');
  }

  private recordProviderSuccess(providerCode: AiGatewayProviderCode): void {
    this.providerCircuits.set(providerCode, { failures: 0, openUntil: null });
  }

  private recordProviderFailure(providerCode: AiGatewayProviderCode): void {
    const current = this.providerCircuits.get(providerCode) ?? { failures: 0, openUntil: null };
    const failures = current.failures + 1;
    this.providerCircuits.set(providerCode, {
      failures,
      openUntil:
        failures >= this.executionPolicy.circuitFailureThreshold
          ? Date.now() + this.executionPolicy.circuitOpenMs
          : null,
    });
  }

  private outputChunks(value: string): readonly string[] {
    const size = 16;
    return Array.from({ length: Math.ceil(value.length / size) }, (_, index) => value.slice(index * size, (index + 1) * size));
  }

  private failInvocation(invocation: InternalInvocation, _reason: string): AiGatewayInvocation {
    void _reason;
    const released = this.releaseReservation(invocation);
    const failed = this.updateInvocation(released, {
      status: 'FAILED',
      finishReason: 'ERROR',
      latencyMs: invocation.startedAt === null ? null : elapsedMilliseconds(invocation.startedAt, this.runtime.now()),
      completedAt: this.runtime.now(),
      messages: [],
    });
    this.appendEvent(failed, 'FAILED', 'FAILED', null, null);
    return this.publicInvocation(failed);
  }

  private ledgerFor(ownerId: string): UsageLedger {
    const boundaries = dayBoundaries(this.runtime.now());
    const existing = this.ledgers.get(ownerId);
    if (existing !== undefined && existing.periodStartedAt === boundaries.periodStartedAt) return existing;
    const next: UsageLedger = {
      periodStartedAt: boundaries.periodStartedAt,
      resetsAt: boundaries.resetsAt,
      usedTokens: 0,
      reservedTokens: 0,
    };
    this.ledgers.set(ownerId, next);
    return next;
  }

  private reserveQuota(ownerId: string, tokens: number): void {
    const ledger = this.ledgerFor(ownerId);
    if (!Number.isSafeInteger(tokens) || tokens < 1 || ledger.usedTokens + ledger.reservedTokens + tokens > this.quotaTokensPerDay) {
      throw new AiGatewayError('QUOTA_EXCEEDED', 'AI Gateway quota is exhausted.');
    }
    ledger.reservedTokens += tokens;
  }

  /** Per-user, provider and model request safety budget.  This is server
   * state rather than a disabled UI button, and therefore also applies to
   * direct consumer API requests and future BYOK routing. */
  private assertRateLimit(
    ownerId: string,
    providerCode: AiGatewayProviderCode,
    modelCode: string,
    credentialMode: AiGatewayCredentialMode,
  ): void {
    const now = Date.now();
    const windowStart = now - 60_000;
    const keys = [
      key('user', ownerId),
      key('provider', providerCode),
      key('model', modelCode),
      // The value is a server-derived mode and owner/provider tuple, never a
      // provider credential ID or secret. It still isolates BYOK traffic from
      // platform-managed credential pressure.
      key('credential', ownerId, providerCode, credentialMode),
    ];
    for (const bucketKey of keys) {
      const recent = (this.requestTimestamps.get(bucketKey) ?? []).filter(
        (timestamp) => timestamp >= windowStart,
      );
      if (recent.length >= this.executionPolicy.maxRequestsPerMinute) {
        this.requestTimestamps.set(bucketKey, recent);
        throw new AiGatewayError('RATE_LIMITED', 'AI Gateway request rate is temporarily limited.');
      }
    }
    for (const bucketKey of keys) {
      const recent = (this.requestTimestamps.get(bucketKey) ?? []).filter(
        (timestamp) => timestamp >= windowStart,
      );
      recent.push(now);
      this.requestTimestamps.set(bucketKey, recent);
    }
  }

  private releaseReservation(invocation: InternalInvocation): InternalInvocation {
    if (invocation.reservedTokens === 0) return invocation;
    const ledger = this.ledgerFor(invocation.ownerId);
    ledger.reservedTokens = Math.max(0, ledger.reservedTokens - invocation.reservedTokens);
    const released = { ...invocation, reservedTokens: 0 };
    this.invocations.set(invocation.id, released);
    return released;
  }

  private consumeReservation(invocation: InternalInvocation, usedTokens: number): InternalInvocation {
    const ledger = this.ledgerFor(invocation.ownerId);
    ledger.reservedTokens = Math.max(0, ledger.reservedTokens - invocation.reservedTokens);
    ledger.usedTokens += usedTokens;
    const metered = { ...invocation, reservedTokens: 0 };
    this.invocations.set(invocation.id, metered);
    return metered;
  }

  private byokStatusFor(ownerId: string, providerCode: Exclude<AiGatewayProviderCode, 'LOCAL'>): AiGatewayByokProviderStatus {
    const existing = this.byokStatuses.get(key(ownerId, providerCode));
    if (existing !== undefined) return this.publicByokStatus(existing);
    return {
      providerCode,
      status: this.byokVault.isConfigured({ ownerId, providerCode }) ? 'CONFIGURED' : 'NOT_CONFIGURED',
      configuredAt: null,
      revokedAt: null,
      maskedFingerprint: null,
      validationStatus: 'UNKNOWN',
      lastValidatedAt: null,
    };
  }

  private publicByokStatus(status: InternalByokStatus): AiGatewayByokProviderStatus {
    return clone({
      providerCode: status.providerCode,
      status: status.status,
      configuredAt: status.configuredAt,
      revokedAt: status.revokedAt,
      maskedFingerprint: status.maskedFingerprint,
      validationStatus: status.validationStatus,
      lastValidatedAt: status.lastValidatedAt,
    });
  }

  private assertExternalProvider(providerCode: Exclude<AiGatewayProviderCode, 'LOCAL'>): void {
    const provider = this.providers.get(providerCode);
    if (provider === undefined || !isExternalProvider(provider.code) || !provider.credentialModes.includes('BYOK')) {
      throw new AiGatewayError('VALIDATION', 'BYOK is not available for this provider.');
    }
  }

  /** This returns only a mode decision, never a credential. It is kept inside
   * the server domain so a later reviewed provider adapter can select a vault
   * or managed system credential without widening any public DTO. */
  private credentialModeFor(ownerId: string, provider: AiGatewayProviderRegistryEntry): AiGatewayCredentialMode | null {
    if (provider.code === 'LOCAL') return provider.credentialModes.includes('NONE') ? 'NONE' : null;
    const byok = this.byokStatuses.get(key(ownerId, provider.code));
    if (
      provider.credentialModes.includes('BYOK') &&
      byok?.status === 'CONFIGURED' &&
      byok.validationStatus === 'VALID' &&
      this.byokVault.isConfigured({ ownerId, providerCode: provider.code })
    ) {
      return 'BYOK';
    }
    if (provider.credentialModes.includes('SYSTEM') && this.systemCredentialResolver.isConfigured(provider.code)) {
      return 'SYSTEM';
    }
    return null;
  }
}
