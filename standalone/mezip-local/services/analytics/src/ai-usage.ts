import {
  createHash,
  randomBytes,
  randomUUID,
  timingSafeEqual,
} from 'node:crypto';

import type {
  AdminAccessAudit,
  AdminCapabilityCode,
  AdminIdentity,
  AiUsageAppCode,
  AiUsageAppRegistryEntry,
  AiUsageBatchResult,
  AiUsageDailyAggregate,
  AiUsageDevice,
  AiUsageDeviceType,
  AiUsageExport,
  AiUsageOverview,
  AiUsagePairing,
  AiUsagePairingStart,
  AiUsageProviderCode,
  AiUsageProviderRegistryEntry,
  AiUsageRangeDeleteResult,
  AiUsageRootReadView,
  AiUsageSession,
  AiUsageSessionStatus,
  AiUsageSource,
  AiUsageTrackingPreferences,
  AuthenticatedPrincipal,
  Platform,
} from '@me-zip/shared-types';

export type AiUsageErrorCode =
  | 'FORBIDDEN'
  | 'NOT_FOUND'
  | 'VALIDATION'
  | 'PRIVACY_VIOLATION'
  | 'TRACKING_DISABLED'
  | 'DEVICE_REVOKED'
  | 'PAIRING_EXPIRED'
  | 'IDEMPOTENCY_CONFLICT'
  | 'CONFLICT'
  | 'ROOT_DENIED';

export class AiUsageError extends Error {
  public constructor(
    public readonly code: AiUsageErrorCode,
    message: string,
  ) {
    super(message);
    this.name = 'AiUsageError';
  }
}

export interface AiUsageRuntime {
  readonly now: () => string;
  readonly id: () => string;
  readonly token: () => string;
  readonly pairingCode: () => string;
}

const defaultRuntime: AiUsageRuntime = {
  now: () => new Date().toISOString(),
  id: () => randomUUID(),
  token: () => randomBytes(32).toString('base64url'),
  pairingCode: () => randomBytes(5).toString('hex').toUpperCase(),
};

/** The registry is for local usage classification only. It deliberately does
 * not imply an API provider, credential, model, or Phase 8 integration. */
export const defaultAiUsageProviders: readonly AiUsageProviderRegistryEntry[] = [
  { code: 'OPENAI', displayName: 'OpenAI', status: 'ACTIVE' },
  { code: 'ANTHROPIC', displayName: 'Anthropic', status: 'ACTIVE' },
  { code: 'GOOGLE', displayName: 'Google', status: 'ACTIVE' },
  { code: 'MICROSOFT', displayName: 'Microsoft', status: 'ACTIVE' },
  { code: 'OTHER', displayName: 'Other', status: 'ACTIVE' },
];

const collectorDeviceTypes: readonly AiUsageDeviceType[] = ['WINDOWS_AGENT', 'BROWSER_EXTENSION'];

export const defaultAiUsageApps: readonly AiUsageAppRegistryEntry[] = [
  { code: 'CHATGPT', displayName: 'ChatGPT', providerCode: 'OPENAI', status: 'ACTIVE', allowedDeviceTypes: collectorDeviceTypes },
  { code: 'CODEX', displayName: 'Codex', providerCode: 'OPENAI', status: 'ACTIVE', allowedDeviceTypes: collectorDeviceTypes },
  { code: 'CLAUDE', displayName: 'Claude', providerCode: 'ANTHROPIC', status: 'ACTIVE', allowedDeviceTypes: collectorDeviceTypes },
  { code: 'CLAUDE_CODE', displayName: 'Claude Code', providerCode: 'ANTHROPIC', status: 'ACTIVE', allowedDeviceTypes: collectorDeviceTypes },
  { code: 'GEMINI', displayName: 'Gemini', providerCode: 'GOOGLE', status: 'ACTIVE', allowedDeviceTypes: collectorDeviceTypes },
  { code: 'COPILOT', displayName: 'GitHub Copilot', providerCode: 'MICROSOFT', status: 'ACTIVE', allowedDeviceTypes: collectorDeviceTypes },
  { code: 'CURSOR', displayName: 'Cursor', providerCode: 'OTHER', status: 'ACTIVE', allowedDeviceTypes: collectorDeviceTypes },
  { code: 'PERPLEXITY', displayName: 'Perplexity', providerCode: 'OTHER', status: 'ACTIVE', allowedDeviceTypes: collectorDeviceTypes },
  { code: 'OTHER_AI', displayName: 'Other AI', providerCode: 'OTHER', status: 'ACTIVE', allowedDeviceTypes: collectorDeviceTypes },
];

export interface AiUsageServiceOptions {
  readonly runtime?: Partial<AiUsageRuntime>;
  /** Server-owned registry overrides only. No consumer route exposes registry writes. */
  readonly providers?: readonly AiUsageProviderRegistryEntry[];
  readonly apps?: readonly AiUsageAppRegistryEntry[];
  readonly pairingTtlMs?: number;
}

export interface AiUsagePreferencesPatch {
  readonly enabled?: boolean | undefined;
  readonly windowsAgentEnabled?: boolean | undefined;
  readonly browserExtensionEnabled?: boolean | undefined;
  readonly idleThresholdSeconds?: number | undefined;
  readonly timezone?: string | undefined;
}

export interface AiUsagePairingCreateInput {
  readonly deviceType: AiUsageDeviceType;
  readonly deviceLabel?: string | undefined;
}

export interface AiUsagePairingCompleteInput {
  readonly pairingCode: string;
  readonly deviceLabel?: string | undefined;
}

/** Returned once on successful device pairing. The service stores only a
 * SHA-256 verifier; callers must keep this in their platform credential store. */
export interface AiUsageDeviceCredentialGrant {
  readonly device: AiUsageDevice;
  readonly deviceCredential: string;
  readonly scopes: readonly ['AI_USAGE_INGEST'];
}

export interface AiUsageBatchEventInput {
  readonly clientEventId: string;
  readonly appCode: AiUsageAppCode;
  /** Opaque SHA-256 digest, never a domain, URL, window title, or content. */
  readonly activityHash: string;
  readonly startedAt: string;
  readonly endedAt: string;
  readonly activeSeconds: number;
  readonly idleSeconds: number;
}

export interface AiUsageBatchIngestInput {
  readonly batchId: string;
  readonly events: readonly AiUsageBatchEventInput[];
}

export interface AiUsageManualSessionInput {
  readonly appCode: AiUsageAppCode;
  readonly startedAt: string;
  readonly endedAt: string;
  readonly activeSeconds: number;
  readonly idleSeconds: number;
  readonly idempotencyKey: string;
}

export interface AiUsageImportSessionInput extends AiUsageManualSessionInput {
  /** Opaque local/import record identity; it is not a URL, title, prompt, or response. */
  readonly externalRecordId: string;
}

export interface AiUsageSessionCorrectionInput {
  readonly startedAt?: string | undefined;
  readonly endedAt?: string | undefined;
  readonly activeSeconds?: number | undefined;
  readonly idleSeconds?: number | undefined;
  readonly reason: string;
}

export interface AiUsageRangeDeleteInput {
  readonly from: string;
  readonly to: string;
  readonly reason: string;
  readonly idempotencyKey: string;
}

export interface AiUsageRange {
  readonly from?: string | undefined;
  readonly to?: string | undefined;
  readonly limit?: number | undefined;
}

export interface AiUsageRootAuthorizer {
  authorize(principal: AuthenticatedPrincipal, capability: AdminCapabilityCode): AdminIdentity;
}

export interface AiUsageAuditSink {
  append(input: Omit<AdminAccessAudit, 'id' | 'timestamp'> & {
    readonly id?: string;
    readonly timestamp?: string;
  }): AdminAccessAudit;
}

export interface AiUsageAdminRequestContext {
  readonly reason?: string | undefined;
  readonly ipContext?: string | null | undefined;
  readonly deviceContext?: string | null | undefined;
  readonly environment?: AdminAccessAudit['environment'] | undefined;
}

interface InternalDevice extends AiUsageDevice {
  readonly userId: string;
  readonly credentialHash: string;
}

interface InternalPairing extends AiUsagePairing {
  readonly userId: string;
  readonly deviceLabel: string | null;
  readonly pairingCodeHash: string;
}

interface InternalSession extends AiUsageSession {
  readonly userId: string;
  readonly activityHash: string;
  readonly clientEventId: string;
  readonly sourcePriority: number;
  readonly correctionReason: string | null;
  readonly deleteReason: string | null;
}

interface BatchRecord {
  readonly fingerprint: string;
  readonly result: AiUsageBatchResult;
}

interface ClientEventRecord {
  readonly fingerprint: string;
  readonly sessionId: string;
}

interface State {
  readonly preferences: Map<string, AiUsageTrackingPreferences>;
  readonly devices: Map<string, InternalDevice>;
  readonly pairings: Map<string, InternalPairing>;
  readonly sessions: Map<string, InternalSession>;
  readonly batches: Map<string, BatchRecord>;
  readonly clientEvents: Map<string, ClientEventRecord>;
  /** user + opaque activity digest -> currently canonical session id */
  readonly canonicalActivities: Map<string, string>;
  readonly manualIdempotency: Map<string, { readonly fingerprint: string; readonly sessionId: string }>;
  readonly rangeDeleteIdempotency: Map<string, { readonly fingerprint: string; readonly result: AiUsageRangeDeleteResult }>;
}

const emptyState = (): State => ({
  preferences: new Map(),
  devices: new Map(),
  pairings: new Map(),
  sessions: new Map(),
  batches: new Map(),
  clientEvents: new Map(),
  canonicalActivities: new Map(),
  manualIdempotency: new Map(),
  rangeDeleteIdempotency: new Map(),
});

const clone = <T>(value: T): T => JSON.parse(JSON.stringify(value)) as T;
const hash = (value: string): string => createHash('sha256').update(value).digest('hex');
const key = (...parts: readonly string[]): string => parts.join(':');
const safeHashEquals = (left: string, right: string): boolean => {
  const leftBuffer = Buffer.from(left, 'hex');
  const rightBuffer = Buffer.from(right, 'hex');
  return leftBuffer.length === rightBuffer.length && timingSafeEqual(leftBuffer, rightBuffer);
};

function stableStringify(value: unknown): string {
  if (value === null || typeof value !== 'object') return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map((item) => stableStringify(item)).join(',')}]`;
  const record = value as Readonly<Record<string, unknown>>;
  return `{${Object.keys(record).sort().map((name) => `${JSON.stringify(name)}:${stableStringify(record[name])}`).join(',')}}`;
}

function sourceForDevice(deviceType: AiUsageDeviceType): AiUsageSource {
  return deviceType === 'WINDOWS_AGENT' ? 'WINDOWS_AGENT' : 'BROWSER_EXTENSION';
}

function platformForSource(source: AiUsageSource): Platform {
  if (source === 'WINDOWS_AGENT') return 'WINDOWS';
  if (source === 'BROWSER_EXTENSION') return 'BROWSER_EXTENSION';
  if (source === 'MOBILE') return 'WECHAT_MINIPROGRAM';
  return 'WEB';
}

function sourcePriority(source: AiUsageSource): number {
  switch (source) {
    case 'WINDOWS_AGENT': return 500;
    case 'BROWSER_EXTENSION': return 400;
    case 'MOBILE': return 300;
    case 'MANUAL': return 200;
    case 'IMPORT': return 100;
  }
}

function isDeviceType(value: string): value is AiUsageDeviceType {
  return value === 'WINDOWS_AGENT' || value === 'BROWSER_EXTENSION';
}

function isOpaqueActivityHash(value: string): boolean {
  return /^sha256:[a-f0-9]{64}$/iu.test(value);
}

function validTimezone(timezone: string): boolean {
  try {
    new Intl.DateTimeFormat('en-CA', { timeZone: timezone }).format();
    return true;
  } catch {
    return false;
  }
}

function localDayAt(epochMs: number, timezone: string): string {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: timezone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(new Date(epochMs));
  const value = (type: Intl.DateTimeFormatPartTypes): string => parts.find((part) => part.type === type)?.value ?? '';
  return `${value('year')}-${value('month')}-${value('day')}`;
}

/** Finds the next local-day boundary in an IANA timezone without assuming a
 * fixed UTC offset, so daylight-saving transitions remain correct. */
function nextLocalDayBoundary(epochMs: number, timezone: string): number {
  const day = localDayAt(epochMs, timezone);
  let high = epochMs + (36 * 60 * 60 * 1_000);
  while (localDayAt(high, timezone) === day) high += 36 * 60 * 60 * 1_000;
  let low = epochMs;
  while (high - low > 1) {
    const middle = Math.floor((low + high) / 2);
    if (localDayAt(middle, timezone) === day) low = middle;
    else high = middle;
  }
  return high;
}

function assertFiniteDate(value: string, field: string): number {
  const epoch = Date.parse(value);
  if (!Number.isFinite(epoch)) throw new AiUsageError('VALIDATION', `${field} must be an ISO timestamp.`);
  return epoch;
}

function assertUsageTiming(input: Pick<AiUsageBatchEventInput, 'startedAt' | 'endedAt' | 'activeSeconds' | 'idleSeconds'>): void {
  const startedAt = assertFiniteDate(input.startedAt, 'startedAt');
  const endedAt = assertFiniteDate(input.endedAt, 'endedAt');
  const elapsed = (endedAt - startedAt) / 1_000;
  if (elapsed <= 0 || elapsed > 86_400) throw new AiUsageError('VALIDATION', 'Usage intervals must be within one day.');
  if (!Number.isInteger(input.activeSeconds) || !Number.isInteger(input.idleSeconds) || input.activeSeconds < 0 || input.idleSeconds < 0) {
    throw new AiUsageError('VALIDATION', 'Usage seconds must be non-negative integers.');
  }
  if (input.activeSeconds > 86_400 || input.idleSeconds > 86_400 || input.activeSeconds + input.idleSeconds > Math.ceil(elapsed) + 1) {
    throw new AiUsageError('VALIDATION', 'Usage seconds exceed the observed interval.');
  }
}

function assertOnlyKeys(value: object, allowed: readonly string[]): void {
  if (Object.keys(value).some((name) => !allowed.includes(name))) {
    throw new AiUsageError('PRIVACY_VIOLATION', 'The AI Usage payload contains unsupported data.');
  }
}

export class AiUsageService {
  private readonly runtime: AiUsageRuntime;
  private readonly pairingTtlMs: number;
  private readonly providers: Map<AiUsageProviderCode, AiUsageProviderRegistryEntry>;
  private readonly apps: Map<AiUsageAppCode, AiUsageAppRegistryEntry>;
  private readonly state = emptyState();

  public constructor(options: AiUsageServiceOptions = {}) {
    this.runtime = { ...defaultRuntime, ...options.runtime };
    this.pairingTtlMs = options.pairingTtlMs ?? 10 * 60 * 1_000;
    this.providers = new Map(defaultAiUsageProviders.map((entry) => [entry.code, entry]));
    for (const provider of options.providers ?? []) this.providers.set(provider.code, clone(provider));
    this.apps = new Map(defaultAiUsageApps.map((entry) => [entry.code, entry]));
    for (const app of options.apps ?? []) this.apps.set(app.code, clone(app));
    for (const app of this.apps.values()) {
      if (!this.providers.has(app.providerCode)) {
        throw new AiUsageError('VALIDATION', `AI Usage app ${app.code} references an unknown provider.`);
      }
      if (app.allowedDeviceTypes.some((deviceType) => !isDeviceType(deviceType))) {
        throw new AiUsageError('VALIDATION', `AI Usage app ${app.code} has an invalid collector type.`);
      }
    }
  }

  public listProviders(): readonly AiUsageProviderRegistryEntry[] {
    return [...this.providers.values()].filter((entry) => entry.status === 'ACTIVE').map(clone);
  }

  public listApps(): readonly AiUsageAppRegistryEntry[] {
    return [...this.apps.values()].filter((entry) => entry.status === 'ACTIVE').map(clone);
  }

  public getPreferences(principal: AuthenticatedPrincipal): AiUsageTrackingPreferences {
    return clone(this.preferenceFor(principal.userId));
  }

  public updatePreferences(principal: AuthenticatedPrincipal, patch: AiUsagePreferencesPatch): AiUsageTrackingPreferences {
    assertOnlyKeys(patch, ['enabled', 'windowsAgentEnabled', 'browserExtensionEnabled', 'idleThresholdSeconds', 'timezone']);
    if (Object.keys(patch).length === 0) throw new AiUsageError('VALIDATION', 'At least one preference is required.');
    const previous = this.preferenceFor(principal.userId);
    const timezone = patch.timezone ?? previous.timezone;
    if (!validTimezone(timezone)) throw new AiUsageError('VALIDATION', 'The requested timezone is invalid.');
    const idleThresholdSeconds = patch.idleThresholdSeconds ?? previous.idleThresholdSeconds;
    if (!Number.isInteger(idleThresholdSeconds) || idleThresholdSeconds < 30 || idleThresholdSeconds > 3_600) {
      throw new AiUsageError('VALIDATION', 'Idle threshold must be between 30 and 3600 seconds.');
    }
    const next: AiUsageTrackingPreferences = {
      enabled: patch.enabled ?? previous.enabled,
      windowsAgentEnabled: patch.windowsAgentEnabled ?? previous.windowsAgentEnabled,
      browserExtensionEnabled: patch.browserExtensionEnabled ?? previous.browserExtensionEnabled,
      idleThresholdSeconds,
      timezone,
      updatedAt: this.runtime.now(),
    };
    this.state.preferences.set(principal.userId, next);
    // Keep session-local-day projections coherent after an owner changes their
    // account timezone. Aggregates are also computed from canonical sessions.
    for (const session of this.state.sessions.values()) {
      if (session.userId !== principal.userId) continue;
      this.state.sessions.set(session.id, {
        ...session,
        timezone,
        localDay: localDayAt(assertFiniteDate(session.startedAt, 'startedAt'), timezone),
        updatedAt: this.runtime.now(),
      });
    }
    return clone(next);
  }

  public createPairing(principal: AuthenticatedPrincipal, input: AiUsagePairingCreateInput): AiUsagePairingStart {
    assertOnlyKeys(input, ['deviceType', 'deviceLabel']);
    if (!isDeviceType(input.deviceType)) throw new AiUsageError('VALIDATION', 'Unknown AI Usage collector.');
    const now = this.runtime.now();
    const expiresAt = new Date(assertFiniteDate(now, 'now') + this.pairingTtlMs).toISOString();
    const pairingCode = this.runtime.pairingCode().trim().toUpperCase();
    if (!/^[A-Z0-9_-]{8,64}$/u.test(pairingCode)) throw new AiUsageError('VALIDATION', 'Pairing-code generator is invalid.');
    const pairing: InternalPairing = {
      id: this.runtime.id(),
      userId: principal.userId,
      deviceType: input.deviceType,
      deviceLabel: input.deviceLabel?.trim() || null,
      status: 'PENDING',
      expiresAt,
      completedAt: null,
      pairingCodeHash: hash(pairingCode),
    };
    this.state.pairings.set(pairing.id, pairing);
    return { pairingId: pairing.id, pairingCode, deviceType: pairing.deviceType, expiresAt: pairing.expiresAt };
  }

  public completePairing(pairingId: string, input: AiUsagePairingCompleteInput): AiUsageDeviceCredentialGrant {
    assertOnlyKeys(input, ['pairingCode', 'deviceLabel']);
    const pairing = this.state.pairings.get(pairingId);
    if (pairing === undefined) throw new AiUsageError('NOT_FOUND', 'Pairing request was not found.');
    if (pairing.status !== 'PENDING') throw new AiUsageError('CONFLICT', 'Pairing request is no longer available.');
    if (assertFiniteDate(pairing.expiresAt, 'expiresAt') <= assertFiniteDate(this.runtime.now(), 'now')) {
      this.state.pairings.set(pairing.id, { ...pairing, status: 'EXPIRED' });
      throw new AiUsageError('PAIRING_EXPIRED', 'Pairing request has expired.');
    }
    if (!safeHashEquals(pairing.pairingCodeHash, hash(input.pairingCode.trim().toUpperCase()))) {
      throw new AiUsageError('FORBIDDEN', 'Pairing request is not available.');
    }
    const now = this.runtime.now();
    const deviceCredential = this.runtime.token();
    if (deviceCredential.length < 32) throw new AiUsageError('VALIDATION', 'Device credential generator is invalid.');
    const device: InternalDevice = {
      id: this.runtime.id(),
      userId: pairing.userId,
      deviceType: pairing.deviceType,
      label: input.deviceLabel?.trim() || pairing.deviceLabel,
      status: 'ACTIVE',
      pairedAt: now,
      lastSeenAt: null,
      revokedAt: null,
      credentialHash: hash(deviceCredential),
    };
    this.state.devices.set(device.id, device);
    this.state.pairings.set(pairing.id, { ...pairing, status: 'COMPLETED', completedAt: now });
    return { device: this.publicDevice(device), deviceCredential, scopes: ['AI_USAGE_INGEST'] };
  }

  public listPairings(principal: AuthenticatedPrincipal): readonly AiUsagePairing[] {
    return [...this.state.pairings.values()]
      .filter((pairing) => pairing.userId === principal.userId)
      .map((pairing) => this.publicPairing(pairing))
      .sort((left, right) => right.expiresAt.localeCompare(left.expiresAt));
  }

  public listDevices(principal: AuthenticatedPrincipal): readonly AiUsageDevice[] {
    return [...this.state.devices.values()]
      .filter((device) => device.userId === principal.userId)
      .map((device) => this.publicDevice(device))
      .sort((left, right) => right.pairedAt.localeCompare(left.pairedAt));
  }

  public revokeDevice(principal: AuthenticatedPrincipal, deviceId: string): AiUsageDevice {
    const device = this.state.devices.get(deviceId);
    if (device === undefined || device.userId !== principal.userId) throw new AiUsageError('NOT_FOUND', 'Device was not found.');
    if (device.status === 'REVOKED') return this.publicDevice(device);
    const revoked: InternalDevice = { ...device, status: 'REVOKED', revokedAt: this.runtime.now() };
    this.state.devices.set(revoked.id, revoked);
    return this.publicDevice(revoked);
  }

  public ingestBatch(deviceCredential: string, input: AiUsageBatchIngestInput): AiUsageBatchResult {
    assertOnlyKeys(input, ['batchId', 'events']);
    if (!/^[A-Za-z0-9_-]{8,200}$/u.test(input.batchId) || input.events.length === 0 || input.events.length > 500) {
      throw new AiUsageError('VALIDATION', 'AI Usage batch is invalid.');
    }
    const device = this.deviceForCredential(deviceCredential);
    this.assertAutomaticTrackingEnabled(device);
    const batchKey = key(device.id, input.batchId);
    const batchFingerprint = hash(stableStringify(input));
    const existingBatch = this.state.batches.get(batchKey);
    if (existingBatch !== undefined) {
      if (!safeHashEquals(existingBatch.fingerprint, batchFingerprint)) {
        throw new AiUsageError('IDEMPOTENCY_CONFLICT', 'Batch id was already used with different metadata.');
      }
      return { ...clone(existingBatch.result), replayed: true };
    }

    const clientEventIds = new Set<string>();
    const acceptedSessionIds: string[] = [];
    const deduplicatedSessionIds: string[] = [];
    for (const event of input.events) {
      this.assertBatchEvent(event);
      if (clientEventIds.has(event.clientEventId)) throw new AiUsageError('VALIDATION', 'Batch event identifiers must be unique.');
      clientEventIds.add(event.clientEventId);
      this.assertAppForDevice(event.appCode, device.deviceType);
      const eventKey = key(device.id, event.clientEventId);
      const eventFingerprint = hash(stableStringify(event));
      const existingEvent = this.state.clientEvents.get(eventKey);
      if (existingEvent !== undefined) {
        if (!safeHashEquals(existingEvent.fingerprint, eventFingerprint)) {
          throw new AiUsageError('IDEMPOTENCY_CONFLICT', 'Event id was already used with different metadata.');
        }
        const existingSession = this.state.sessions.get(existingEvent.sessionId);
        if (existingSession?.status === 'DEDUPLICATED') deduplicatedSessionIds.push(existingSession.id);
        else acceptedSessionIds.push(existingEvent.sessionId);
        continue;
      }
      const created = this.recordSession({
        userId: device.userId,
        deviceId: device.id,
        source: sourceForDevice(device.deviceType),
        platform: platformForSource(sourceForDevice(device.deviceType)),
        clientEventId: event.clientEventId,
        activityHash: event.activityHash,
        appCode: event.appCode,
        startedAt: event.startedAt,
        endedAt: event.endedAt,
        activeSeconds: event.activeSeconds,
        idleSeconds: event.idleSeconds,
      });
      this.state.clientEvents.set(eventKey, { fingerprint: eventFingerprint, sessionId: created.id });
      if (created.status === 'DEDUPLICATED') deduplicatedSessionIds.push(created.id);
      else acceptedSessionIds.push(created.id);
    }
    this.state.devices.set(device.id, { ...device, lastSeenAt: this.runtime.now() });
    const result: AiUsageBatchResult = { batchId: input.batchId, acceptedSessionIds, deduplicatedSessionIds, replayed: false };
    this.state.batches.set(batchKey, { fingerprint: batchFingerprint, result });
    return clone(result);
  }

  /** Explicit self-entered data remains available when passive collection is
   * disabled. Its source and owner are selected by this server method, never
   * by the client body. */
  public createManualSession(
    principal: AuthenticatedPrincipal,
    input: AiUsageManualSessionInput,
    platform: Platform = 'WEB',
  ): AiUsageSession {
    // A manual entry has no collector-produced activity identity.  Its
    // idempotency key therefore participates in the opaque activity identity
    // so two separately-entered sessions with coincident times are not
    // accidentally treated as the same observed activity.
    return this.createExplicitSession(principal, input, 'MANUAL', platform, `manual:${principal.userId}:${input.idempotencyKey}`);
  }

  public importSession(
    principal: AuthenticatedPrincipal,
    input: AiUsageImportSessionInput,
    platform: Platform = 'WEB',
  ): AiUsageSession {
    assertOnlyKeys(input, ['appCode', 'startedAt', 'endedAt', 'activeSeconds', 'idleSeconds', 'externalRecordId', 'idempotencyKey']);
    if (!/^[A-Za-z0-9_-]{8,200}$/u.test(input.externalRecordId)) throw new AiUsageError('VALIDATION', 'Import record identity is invalid.');
    return this.createExplicitSession(principal, input, 'IMPORT', platform, `import:${principal.userId}:${input.externalRecordId}`);
  }

  public listSessions(principal: AuthenticatedPrincipal, range: AiUsageRange = {}): readonly AiUsageSession[] {
    return this.ownedSessions(principal.userId, range)
      .filter((session) => session.status === 'ACTIVE' || session.status === 'CORRECTED')
      .map((session) => this.publicSession(session));
  }

  public correctSession(principal: AuthenticatedPrincipal, sessionId: string, input: AiUsageSessionCorrectionInput): AiUsageSession {
    assertOnlyKeys(input, ['startedAt', 'endedAt', 'activeSeconds', 'idleSeconds', 'reason']);
    if (input.reason.trim() === '') throw new AiUsageError('VALIDATION', 'A correction reason is required.');
    const session = this.ownEditableSession(principal.userId, sessionId);
    const corrected = {
      startedAt: input.startedAt ?? session.startedAt,
      endedAt: input.endedAt ?? session.endedAt,
      activeSeconds: input.activeSeconds ?? session.activeSeconds,
      idleSeconds: input.idleSeconds ?? session.idleSeconds,
    };
    assertUsageTiming(corrected);
    const timezone = this.preferenceFor(principal.userId).timezone;
    const next: InternalSession = {
      ...session,
      ...corrected,
      timezone,
      localDay: localDayAt(assertFiniteDate(corrected.startedAt, 'startedAt'), timezone),
      status: 'CORRECTED',
      correctedAt: this.runtime.now(),
      correctionReason: input.reason.trim(),
      updatedAt: this.runtime.now(),
    };
    this.state.sessions.set(next.id, next);
    return this.publicSession(next);
  }

  public deleteSession(principal: AuthenticatedPrincipal, sessionId: string, reason: string): AiUsageSession {
    if (reason.trim() === '') throw new AiUsageError('VALIDATION', 'A deletion reason is required.');
    const session = this.ownEditableSession(principal.userId, sessionId);
    const deleted: InternalSession = {
      ...session,
      status: 'DELETED',
      deletedAt: this.runtime.now(),
      deleteReason: reason.trim(),
      updatedAt: this.runtime.now(),
    };
    this.state.sessions.set(deleted.id, deleted);
    const canonicalKey = key(deleted.userId, deleted.activityHash);
    if (this.state.canonicalActivities.get(canonicalKey) === deleted.id) this.state.canonicalActivities.delete(canonicalKey);
    return this.publicSession(deleted);
  }

  /** Owner-scoped range deletion for a mistaken import or an explicit privacy
   * cleanup. Only overlapping sessions owned by the authenticated user are
   * tombstoned; another user's rows can never be selected by this operation. */
  public deleteUsageRange(principal: AuthenticatedPrincipal, input: AiUsageRangeDeleteInput): AiUsageRangeDeleteResult {
    assertOnlyKeys(input, ['from', 'to', 'reason', 'idempotencyKey']);
    this.assertRange({ from: input.from, to: input.to });
    if (input.reason.trim() === '' || !/^[A-Za-z0-9_-]{8,200}$/u.test(input.idempotencyKey)) {
      throw new AiUsageError('VALIDATION', 'Usage deletion request is invalid.');
    }
    const idempotencyMapKey = key(principal.userId, 'range-delete', input.idempotencyKey);
    const fingerprint = hash(stableStringify(input));
    const existing = this.state.rangeDeleteIdempotency.get(idempotencyMapKey);
    if (existing !== undefined) {
      if (!safeHashEquals(existing.fingerprint, fingerprint)) throw new AiUsageError('IDEMPOTENCY_CONFLICT', 'Idempotency key was reused with different metadata.');
      return { ...clone(existing.result), replayed: true };
    }
    const from = assertFiniteDate(input.from, 'from');
    const to = assertFiniteDate(input.to, 'to');
    let deletedCount = 0;
    for (const session of this.state.sessions.values()) {
      if (session.userId !== principal.userId) continue;
      if (session.status === 'DELETED') continue;
      const startsAt = assertFiniteDate(session.startedAt, 'startedAt');
      const endsAt = assertFiniteDate(session.endedAt, 'endedAt');
      if (endsAt < from || startsAt > to) continue;
      const deleted: InternalSession = {
        ...session,
        status: 'DELETED',
        deletedAt: this.runtime.now(),
        deleteReason: input.reason.trim(),
        updatedAt: this.runtime.now(),
      };
      this.state.sessions.set(deleted.id, deleted);
      const canonicalKey = key(deleted.userId, deleted.activityHash);
      if (this.state.canonicalActivities.get(canonicalKey) === deleted.id) this.state.canonicalActivities.delete(canonicalKey);
      deletedCount += 1;
    }
    const result: AiUsageRangeDeleteResult = { from: input.from, to: input.to, deletedCount, replayed: false };
    this.state.rangeDeleteIdempotency.set(idempotencyMapKey, { fingerprint, result });
    return clone(result);
  }

  public getOverview(principal: AuthenticatedPrincipal, range: AiUsageRange = {}): AiUsageOverview {
    const daily = this.dailyAggregates(principal.userId, range);
    return {
      preferences: this.getPreferences(principal),
      daily,
      totalActiveSeconds: daily.reduce((total, row) => total + row.activeSeconds, 0),
      totalIdleSeconds: daily.reduce((total, row) => total + row.idleSeconds, 0),
      deviceCount: this.listDevices(principal).filter((device) => device.status === 'ACTIVE').length,
      generatedAt: this.runtime.now(),
    };
  }

  public exportUsage(principal: AuthenticatedPrincipal, range: AiUsageRange = {}): AiUsageExport {
    return {
      generatedAt: this.runtime.now(),
      preferences: this.getPreferences(principal),
      devices: this.listDevices(principal),
      sessions: this.listSessions(principal, range),
      daily: this.dailyAggregates(principal.userId, range),
    };
  }

  /** Root reads are intentionally bounded to metadata projections. The caller
   * must use `AdminAiUsageApiAdapter`, which authorizes and appends an audit. */
  public readForAuthorizedRoot(targetUserId: string, range: AiUsageRange = {}): AiUsageRootReadView {
    const principal: AuthenticatedPrincipal = { userId: targetUserId, sessionId: 'root-projection', roles: [], issuedAt: this.runtime.now() };
    return {
      targetUserId,
      preferences: this.getPreferences(principal),
      devices: this.listDevices(principal),
      sessions: this.listSessions(principal, range),
      daily: this.dailyAggregates(targetUserId, range),
      generatedAt: this.runtime.now(),
    };
  }

  private createExplicitSession(
    principal: AuthenticatedPrincipal,
    input: AiUsageManualSessionInput,
    source: Extract<AiUsageSource, 'MANUAL' | 'IMPORT'>,
    platform: Platform,
    activityPrefix: string,
  ): AiUsageSession {
    assertOnlyKeys(input, ['appCode', 'startedAt', 'endedAt', 'activeSeconds', 'idleSeconds', 'idempotencyKey', 'externalRecordId']);
    this.assertManualInput(input);
    this.assertApp(input.appCode);
    const fingerprint = hash(stableStringify(input));
    const idempotencyMapKey = key(principal.userId, source, input.idempotencyKey);
    const existing = this.state.manualIdempotency.get(idempotencyMapKey);
    if (existing !== undefined) {
      if (!safeHashEquals(existing.fingerprint, fingerprint)) throw new AiUsageError('IDEMPOTENCY_CONFLICT', 'Idempotency key was reused with different metadata.');
      const existingSession = this.state.sessions.get(existing.sessionId);
      if (existingSession === undefined) throw new AiUsageError('CONFLICT', 'Usage session is unavailable.');
      return this.publicSession(existingSession);
    }
    const activityHash = `sha256:${hash(`${activityPrefix}:${input.appCode}:${input.startedAt}:${input.endedAt}`)}`;
    const session = this.recordSession({
      userId: principal.userId,
      deviceId: null,
      source,
      platform,
      clientEventId: input.idempotencyKey,
      activityHash,
      appCode: input.appCode,
      startedAt: input.startedAt,
      endedAt: input.endedAt,
      activeSeconds: input.activeSeconds,
      idleSeconds: input.idleSeconds,
    });
    this.state.manualIdempotency.set(idempotencyMapKey, { fingerprint, sessionId: session.id });
    return this.publicSession(session);
  }

  private recordSession(input: {
    readonly userId: string;
    readonly deviceId: string | null;
    readonly source: AiUsageSource;
    readonly platform: Platform;
    readonly clientEventId: string;
    readonly activityHash: string;
    readonly appCode: AiUsageAppCode;
    readonly startedAt: string;
    readonly endedAt: string;
    readonly activeSeconds: number;
    readonly idleSeconds: number;
  }): InternalSession {
    assertUsageTiming(input);
    const app = this.assertApp(input.appCode);
    const timezone = this.preferenceFor(input.userId).timezone;
    const now = this.runtime.now();
    const canonicalKey = key(input.userId, input.activityHash);
    const previousId = this.state.canonicalActivities.get(canonicalKey);
    const previous = previousId === undefined ? undefined : this.state.sessions.get(previousId);
    const priority = sourcePriority(input.source);
    let status: AiUsageSessionStatus = 'ACTIVE';
    if (previous !== undefined && (previous.status === 'ACTIVE' || previous.status === 'CORRECTED')) {
      if (priority > previous.sourcePriority) {
        this.state.sessions.set(previous.id, { ...previous, status: 'DEDUPLICATED', updatedAt: now });
      } else {
        status = 'DEDUPLICATED';
      }
    }
    const session: InternalSession = {
      id: this.runtime.id(),
      userId: input.userId,
      serviceId: input.appCode,
      appCode: input.appCode,
      providerCode: app.providerCode,
      deviceId: input.deviceId,
      platform: input.platform,
      startedAt: new Date(assertFiniteDate(input.startedAt, 'startedAt')).toISOString(),
      endedAt: new Date(assertFiniteDate(input.endedAt, 'endedAt')).toISOString(),
      activeSeconds: input.activeSeconds,
      idleSeconds: input.idleSeconds,
      source: input.source,
      timezone,
      localDay: localDayAt(assertFiniteDate(input.startedAt, 'startedAt'), timezone),
      status,
      correctedAt: null,
      deletedAt: null,
      createdAt: now,
      updatedAt: now,
      activityHash: input.activityHash,
      clientEventId: input.clientEventId,
      sourcePriority: priority,
      correctionReason: null,
      deleteReason: null,
    };
    this.state.sessions.set(session.id, session);
    if (status !== 'DEDUPLICATED') this.state.canonicalActivities.set(canonicalKey, session.id);
    return session;
  }

  private dailyAggregates(userId: string, range: AiUsageRange): readonly AiUsageDailyAggregate[] {
    this.assertRange(range);
    const timezone = this.preferenceFor(userId).timezone;
    const grouped = new Map<string, AiUsageDailyAggregate>();
    for (const session of this.ownedSessions(userId, range)) {
      if (session.status !== 'ACTIVE' && session.status !== 'CORRECTED') continue;
      const start = assertFiniteDate(session.startedAt, 'startedAt');
      const end = assertFiniteDate(session.endedAt, 'endedAt');
      const totalMs = end - start;
      let cursor = start;
      let remainingActive = session.activeSeconds;
      let remainingIdle = session.idleSeconds;
      while (cursor < end) {
        const boundary = Math.min(end, nextLocalDayBoundary(cursor, timezone));
        const segmentMs = boundary - cursor;
        const finalSegment = boundary === end;
        const activeSeconds = finalSegment ? remainingActive : Math.floor((session.activeSeconds * segmentMs) / totalMs);
        const idleSeconds = finalSegment ? remainingIdle : Math.floor((session.idleSeconds * segmentMs) / totalMs);
        remainingActive -= activeSeconds;
        remainingIdle -= idleSeconds;
        const localDay = localDayAt(cursor, timezone);
        const aggregateKey = key(localDay, session.appCode, session.providerCode);
        const prior = grouped.get(aggregateKey);
        grouped.set(aggregateKey, {
          localDay,
          timezone,
          appCode: session.appCode,
          providerCode: session.providerCode,
          activeSeconds: (prior?.activeSeconds ?? 0) + activeSeconds,
          idleSeconds: (prior?.idleSeconds ?? 0) + idleSeconds,
          sessionCount: (prior?.sessionCount ?? 0) + 1,
        });
        cursor = boundary;
      }
    }
    return [...grouped.values()].sort((left, right) =>
      right.localDay.localeCompare(left.localDay) || left.appCode.localeCompare(right.appCode),
    ).map(clone);
  }

  private ownedSessions(userId: string, range: AiUsageRange): readonly InternalSession[] {
    this.assertRange(range);
    const from = range.from === undefined ? Number.NEGATIVE_INFINITY : assertFiniteDate(range.from, 'from');
    const to = range.to === undefined ? Number.POSITIVE_INFINITY : assertFiniteDate(range.to, 'to');
    const limit = range.limit ?? 500;
    return [...this.state.sessions.values()]
      .filter((session) => session.userId === userId)
      .filter((session) => {
        const startedAt = assertFiniteDate(session.startedAt, 'startedAt');
        const endedAt = assertFiniteDate(session.endedAt, 'endedAt');
        return endedAt >= from && startedAt <= to;
      })
      .sort((left, right) => right.endedAt.localeCompare(left.endedAt) || right.id.localeCompare(left.id))
      .slice(0, limit);
  }

  private preferenceFor(userId: string): AiUsageTrackingPreferences {
    const existing = this.state.preferences.get(userId);
    if (existing !== undefined) return existing;
    const preference: AiUsageTrackingPreferences = {
      enabled: false,
      windowsAgentEnabled: false,
      browserExtensionEnabled: false,
      idleThresholdSeconds: 180,
      timezone: 'UTC',
      updatedAt: this.runtime.now(),
    };
    this.state.preferences.set(userId, preference);
    return preference;
  }

  private assertAutomaticTrackingEnabled(device: InternalDevice): void {
    if (device.status !== 'ACTIVE') throw new AiUsageError('DEVICE_REVOKED', 'Device credential is no longer active.');
    const preferences = this.preferenceFor(device.userId);
    const sourceEnabled = device.deviceType === 'WINDOWS_AGENT' ? preferences.windowsAgentEnabled : preferences.browserExtensionEnabled;
    if (!preferences.enabled || !sourceEnabled) throw new AiUsageError('TRACKING_DISABLED', 'Automatic AI Usage tracking is disabled.');
  }

  private deviceForCredential(credential: string): InternalDevice {
    if (credential.trim().length < 32) throw new AiUsageError('FORBIDDEN', 'Device credential is invalid.');
    const credentialHash = hash(credential);
    const device = [...this.state.devices.values()].find((candidate) => safeHashEquals(candidate.credentialHash, credentialHash));
    if (device === undefined) throw new AiUsageError('FORBIDDEN', 'Device credential is invalid.');
    return device;
  }

  private assertAppForDevice(code: AiUsageAppCode, deviceType: AiUsageDeviceType): AiUsageAppRegistryEntry {
    const app = this.assertApp(code);
    if (!app.allowedDeviceTypes.includes(deviceType)) throw new AiUsageError('FORBIDDEN', 'This collector cannot report the selected app.');
    return app;
  }

  private assertApp(code: AiUsageAppCode): AiUsageAppRegistryEntry {
    const app = this.apps.get(code);
    if (app === undefined || app.status !== 'ACTIVE') throw new AiUsageError('VALIDATION', 'AI Usage app is unavailable.');
    return app;
  }

  private assertBatchEvent(event: AiUsageBatchEventInput): void {
    assertOnlyKeys(event, ['clientEventId', 'appCode', 'activityHash', 'startedAt', 'endedAt', 'activeSeconds', 'idleSeconds']);
    if (!/^[A-Za-z0-9_-]{8,200}$/u.test(event.clientEventId) || !isOpaqueActivityHash(event.activityHash)) {
      throw new AiUsageError('PRIVACY_VIOLATION', 'AI Usage event metadata is invalid.');
    }
    assertUsageTiming(event);
  }

  private assertManualInput(input: AiUsageManualSessionInput): void {
    if (!/^[A-Za-z0-9_-]{8,200}$/u.test(input.idempotencyKey)) throw new AiUsageError('VALIDATION', 'Idempotency key is invalid.');
    assertUsageTiming(input);
  }

  private assertRange(range: AiUsageRange): void {
    if (range.from !== undefined) assertFiniteDate(range.from, 'from');
    if (range.to !== undefined) assertFiniteDate(range.to, 'to');
    if (range.from !== undefined && range.to !== undefined && Date.parse(range.to) < Date.parse(range.from)) {
      throw new AiUsageError('VALIDATION', 'Usage range end must not precede start.');
    }
    if (range.limit !== undefined && (!Number.isInteger(range.limit) || range.limit < 1 || range.limit > 500)) {
      throw new AiUsageError('VALIDATION', 'Usage range limit is invalid.');
    }
  }

  private ownEditableSession(userId: string, sessionId: string): InternalSession {
    const session = this.state.sessions.get(sessionId);
    if (session === undefined || session.userId !== userId) throw new AiUsageError('NOT_FOUND', 'Usage session was not found.');
    if (session.status === 'DELETED' || session.status === 'DEDUPLICATED') throw new AiUsageError('CONFLICT', 'Usage session cannot be edited.');
    return session;
  }

  private publicDevice(device: InternalDevice): AiUsageDevice {
    return clone({
      id: device.id,
      deviceType: device.deviceType,
      label: device.label,
      status: device.status,
      pairedAt: device.pairedAt,
      lastSeenAt: device.lastSeenAt,
      revokedAt: device.revokedAt,
    });
  }

  private publicPairing(pairing: InternalPairing): AiUsagePairing {
    return clone({
      id: pairing.id,
      deviceType: pairing.deviceType,
      status: pairing.status,
      expiresAt: pairing.expiresAt,
      completedAt: pairing.completedAt,
    });
  }

  private publicSession(session: InternalSession): AiUsageSession {
    return clone({
      id: session.id,
      serviceId: session.serviceId,
      appCode: session.appCode,
      providerCode: session.providerCode,
      deviceId: session.deviceId,
      platform: session.platform,
      startedAt: session.startedAt,
      endedAt: session.endedAt,
      activeSeconds: session.activeSeconds,
      idleSeconds: session.idleSeconds,
      source: session.source,
      timezone: session.timezone,
      localDay: session.localDay,
      status: session.status,
      correctedAt: session.correctedAt,
      deletedAt: session.deletedAt,
      createdAt: session.createdAt,
      updatedAt: session.updatedAt,
    });
  }
}

/** Separate, root-only reader. Consumer `AiUsageApiAdapter` never receives an
 * admin principal/body field and cannot route into this boundary. */
export class AdminAiUsageReader {
  public constructor(
    private readonly service: AiUsageService,
    private readonly authorization: AiUsageRootAuthorizer,
    private readonly audit: AiUsageAuditSink,
  ) {}

  public readUserUsage(
    principal: AuthenticatedPrincipal,
    targetUserId: string,
    context: AiUsageAdminRequestContext = {},
  ): AiUsageRootReadView {
    const identity = this.authorization.authorize(principal, 'ROOT_READ_AI_USAGE');
    const view = this.service.readForAuthorizedRoot(targetUserId);
    this.audit.append({
      adminId: identity.id,
      targetUserId,
      resourceType: 'AI_USAGE',
      resourceId: null,
      action: 'READ_AI_USAGE',
      sessionId: principal.sessionId,
      ipContext: context.ipContext ?? null,
      deviceContext: context.deviceContext ?? null,
      environment: context.environment ?? 'DEVELOPMENT',
      reason: context.reason ?? null,
    });
    return view;
  }
}
