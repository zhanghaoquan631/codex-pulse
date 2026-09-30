import { createHash, randomUUID } from 'node:crypto';

import {
  personalAiContextScopes,
  personalAiSourceTypes,
} from '@me-zip/shared-types';

import type {
  AuthenticatedPrincipal,
  PersonalAIAccessEntitlementCode,
  PersonalAIContextScope,
  PersonalAIDateRange,
  PersonalAIIndexStatus,
  PersonalAIIndexStatusView,
  PersonalAIKnowledgeSourceType,
  PersonalAIIndexJob as PublicPersonalAIIndexJob,
} from '@me-zip/shared-types';

import type { PersonalAIEntitlementResolver } from './personal-ai.js';
import {
  assertPersonalAIDurableRepository,
  PersonalAIDurableConfigurationError,
  type PersonalAIDurableIndexJobEnqueueWrite,
  type PersonalAIDurableIndexJobRow,
  type PersonalAIDurableOwnerState,
  type PersonalAIDurableRepository,
  type PersonalAIIndexOutboxEvent,
} from './persistence.js';

/**
 * A server-authenticated principal resolver.  The resolver is deliberately a
 * required dependency: accepting `principal.userId` without a trust seam
 * would make a direct HTTP body (or a test fixture) an owner authority.
 */
export interface PersonalAITrustedPrincipalResolver {
  readonly productionSafe: true;
  resolveOwnerId(principal: AuthenticatedPrincipal): string | null;
}

export interface DurablePersonalAIIndexRuntime {
  readonly now: () => string;
  readonly id: () => string;
}

/** Request data accepted by the durable enqueue boundary.  Notice that it has
 * no owner, principal, archive body, prompt, provider, or plan field. */
export interface DurablePersonalAIIndexRequest {
  readonly scope: PersonalAIContextScope;
  readonly dateRange?: PersonalAIDateRange | undefined;
  readonly sourceTypes?: readonly PersonalAIKnowledgeSourceType[] | undefined;
  readonly selectedEntryIds?: readonly string[] | undefined;
  readonly selectedMediaIds?: readonly string[] | undefined;
  readonly includeHistoricalRevisions?: boolean | undefined;
  readonly idempotencyKey?: string | undefined;
}

export interface DurablePersonalAIIndexEnqueueResult {
  readonly applied: boolean;
  /** Public projection only; owner/input/lease fields never cross this seam. */
  readonly job: PublicPersonalAIIndexJob;
}

/**
 * The base repository intentionally contains only writes and owner state. A
 * deployment may expose these optional read methods while migrating existing
 * query adapters; keeping them separate means the enqueue contract remains
 * usable by a worker before HTTP read routes are migrated.
 */
export interface PersonalAIDurableIndexJobReader {
  readIndexJob(input: { readonly ownerId: string; readonly jobId: string }): Promise<PersonalAIDurableIndexJobRow | null>;
  listIndexJobs(input: { readonly ownerId: string; readonly cursor?: string; readonly limit: number }): Promise<{
    readonly items: readonly PersonalAIDurableIndexJobRow[];
    readonly nextCursor: string | null;
  }>;
  readLatestIndexJob?(input: { readonly ownerId: string; readonly indexVersion: string }): Promise<PersonalAIDurableIndexJobRow | null>;
}

export type DurablePersonalAIIndexRepository = PersonalAIDurableRepository & Partial<PersonalAIDurableIndexJobReader>;

export interface DurablePersonalAIIndexServiceOptions {
  readonly repository: DurablePersonalAIIndexRepository;
  readonly entitlementResolver: PersonalAIEntitlementResolver;
  readonly trustedPrincipalResolver: PersonalAITrustedPrincipalResolver;
  readonly indexVersion: string;
  readonly embeddingProviderName?: string | undefined;
  readonly runtime?: Partial<DurablePersonalAIIndexRuntime> | undefined;
}

export type DurablePersonalAIIndexErrorCode =
  | 'FORBIDDEN'
  | 'VALIDATION'
  | 'CONFLICT'
  | 'ENTITLEMENT_REQUIRED'
  | 'CONSENT_REQUIRED'
  | 'NOT_FOUND';

export class DurablePersonalAIIndexError extends Error {
  public constructor(public readonly code: DurablePersonalAIIndexErrorCode, message: string) {
    super(message);
    this.name = 'DurablePersonalAIIndexError';
  }
}

const sourceTypeSet = new Set<string>(personalAiSourceTypes);
const contextScopeSet = new Set<string>(personalAiContextScopes);
const safeIdentifierPattern = /^[A-Za-z0-9_-]{1,200}$/u;
const idempotencyPattern = /^[A-Za-z0-9][A-Za-z0-9._:-]{7,199}$/u;
const outboxKeys = new Set([
  'id',
  'ownerId',
  'jobId',
  'eventType',
  'payloadFingerprint',
  'status',
  'availableAt',
  'createdAt',
  'dispatchedAt',
  'attemptCount',
]);

const scopeSourceTypes = (scope: PersonalAIContextScope): readonly PersonalAIKnowledgeSourceType[] => {
  switch (scope) {
    case 'LIFE': return ['LIFE'];
    case 'TIMELINE': return ['TIMELINE'];
    case 'HISTORY': return ['HISTORY'];
    case 'FITNESS': return ['FITNESS', 'STEPS'];
    case 'DAILY_PACK': return ['DAILY_PACK'];
    case 'AI_USAGE': return ['AI_USAGE'];
    case 'SELECTED_MEDIA': return ['LIFE', 'PUBLISHED_SNAPSHOT'];
    case 'NONE': return [];
    default: return ['LIFE', 'TIMELINE', 'HISTORY', 'FITNESS', 'STEPS', 'DAILY_PACK', 'AI_USAGE', 'TAGS', 'PUBLISHED_SNAPSHOT'];
  }
};

const clone = <T>(value: T): T => structuredClone(value);

const digest = (value: unknown): string => createHash('sha256').update(JSON.stringify(value) ?? '').digest('hex');

function fail(code: DurablePersonalAIIndexErrorCode, message: string): never {
  throw new DurablePersonalAIIndexError(code, message);
}

function ensureDateRange(value: PersonalAIDateRange | undefined): void {
  if (value === undefined) return;
  if (value === null || typeof value !== 'object' || typeof value.from !== 'string' || typeof value.to !== 'string' || Number.isNaN(Date.parse(value.from)) || Number.isNaN(Date.parse(value.to))) {
    fail('VALIDATION', 'dateRange must contain valid ISO dates.');
  }
  if (value.to < value.from) fail('VALIDATION', 'dateRange.to must not precede dateRange.from.');
}

function ensureIds(name: string, values: readonly string[] | undefined): readonly string[] {
  if (values === undefined) return [];
  if (!Array.isArray(values)) fail('VALIDATION', `${name} must be an array.`);
  if (values.length > 100) fail('VALIDATION', `${name} contains too many identifiers.`);
  const seen = new Set<string>();
  for (const value of values) {
    if (typeof value !== 'string' || !safeIdentifierPattern.test(value)) fail('VALIDATION', `${name} contains an invalid identifier.`);
    if (seen.has(value)) fail('VALIDATION', `${name} must not contain duplicate identifiers.`);
    seen.add(value);
  }
  return [...values];
}

function publicJob(row: PersonalAIDurableIndexJobRow): PublicPersonalAIIndexJob {
  return {
    id: row.id,
    scope: row.scope,
    dateRange: row.dateRange === null ? null : clone(row.dateRange),
    sourceTypes: [...row.sourceTypes],
    status: row.status,
    indexVersion: row.indexVersion,
    indexedSourceCount: row.indexedSourceCount,
    indexedChunkCount: row.indexedChunkCount,
    failedSourceCount: row.failedSourceCount,
    createdAt: row.createdAt,
    startedAt: row.startedAt,
    completedAt: row.completedAt,
    errorCode: row.errorCode,
  };
}

function assertPublicJobOwned(row: PersonalAIDurableIndexJobRow, ownerId: string): void {
  if (row.ownerId !== ownerId || !safeIdentifierPattern.test(row.id)) {
    throw new PersonalAIDurableConfigurationError('Durable Personal AI repository returned a job for a different owner.');
  }
}

function assertIdentifierOnlyOutbox(event: PersonalAIIndexOutboxEvent, ownerId: string, jobId: string, fingerprint: string): void {
  const keys = Object.keys(event);
  if (keys.some((key) => !outboxKeys.has(key)) || keys.length !== outboxKeys.size) {
    throw new PersonalAIDurableConfigurationError('Personal AI index outbox must contain identifiers and a digest only.');
  }
  if (event.ownerId !== ownerId || event.jobId !== jobId || event.eventType !== 'INDEX_JOB_QUEUED' || event.payloadFingerprint !== fingerprint) {
    throw new PersonalAIDurableConfigurationError('Personal AI index outbox does not match its durable job.');
  }
  if (!/^[a-f0-9]{64}$/u.test(event.payloadFingerprint)) {
    throw new PersonalAIDurableConfigurationError('Personal AI outbox payload fingerprint is invalid.');
  }
}

function assertNoRequestSecretFields(input: DurablePersonalAIIndexRequest): void {
  if (input === null || typeof input !== 'object') fail('VALIDATION', 'Index request is invalid.');
  const forbidden = ['ownerId', 'userId', 'principal', 'rootId', 'plan', 'providerKey', 'content', 'text', 'question', 'prompt', 'answer'];
  const record = input as unknown as Record<string, unknown>;
  if (forbidden.some((key) => Object.prototype.hasOwnProperty.call(record, key))) {
    fail('VALIDATION', 'Index requests cannot contain owner, principal, prompt, or archive content fields.');
  }
}

export class DurablePersonalAIIndexService {
  private readonly repository: DurablePersonalAIIndexRepository;
  private readonly entitlementResolver: PersonalAIEntitlementResolver;
  private readonly trustedPrincipalResolver: PersonalAITrustedPrincipalResolver;
  private readonly indexVersion: string;
  private readonly embeddingProviderName: string;
  private readonly runtime: DurablePersonalAIIndexRuntime;

  public constructor(options: DurablePersonalAIIndexServiceOptions) {
    assertPersonalAIDurableRepository(options.repository);
    if (options.trustedPrincipalResolver === null || typeof options.trustedPrincipalResolver !== 'object' || options.trustedPrincipalResolver.productionSafe !== true || typeof options.trustedPrincipalResolver.resolveOwnerId !== 'function') {
      throw new PersonalAIDurableConfigurationError('Personal AI requires a reviewed trusted-principal resolver.');
    }
    if (typeof options.indexVersion !== 'string' || options.indexVersion.trim() === '' || options.indexVersion.length > 100) {
      throw new PersonalAIDurableConfigurationError('Personal AI indexVersion is invalid.');
    }
    if (options.entitlementResolver === null || typeof options.entitlementResolver !== 'object' || typeof options.entitlementResolver.has !== 'function') {
      throw new PersonalAIDurableConfigurationError('Personal AI requires a reviewed entitlement resolver.');
    }
    this.repository = options.repository;
    this.entitlementResolver = options.entitlementResolver;
    this.trustedPrincipalResolver = options.trustedPrincipalResolver;
    this.indexVersion = options.indexVersion;
    this.embeddingProviderName = options.embeddingProviderName ?? 'DURABLE_ASYNC_WORKER';
    this.runtime = {
      now: options.runtime?.now ?? (() => new Date().toISOString()),
      id: options.runtime?.id ?? randomUUID,
    };
  }

  /** Enqueues one durable transaction and returns immediately. No embedding,
   * archive read, or provider call is reachable from this method. */
  public async createIndexJob(principal: AuthenticatedPrincipal, input: DurablePersonalAIIndexRequest): Promise<DurablePersonalAIIndexEnqueueResult> {
    const owner = await this.authorize(principal, true);
    assertNoRequestSecretFields(input);
    const normalized = this.normalizeInput(input, owner.state);
    const requestFingerprint = digest({
      scope: normalized.scope,
      dateRange: normalized.dateRange,
      sourceTypes: normalized.sourceTypes,
      selectedEntryIds: normalized.selectedEntryIds,
      selectedMediaIds: normalized.selectedMediaIds,
      includeHistoricalRevisions: normalized.includeHistoricalRevisions,
    });
    const now = this.runtime.now();
    const jobId = this.runtime.id();
    const job: PersonalAIDurableIndexJobRow = {
      id: jobId,
      ownerId: owner.ownerId,
      scope: normalized.scope,
      dateRange: normalized.dateRange,
      sourceTypes: normalized.sourceTypes,
      status: 'PENDING',
      indexVersion: this.indexVersion,
      indexedSourceCount: 0,
      indexedChunkCount: 0,
      failedSourceCount: 0,
      createdAt: now,
      startedAt: null,
      completedAt: null,
      errorCode: null,
      input: {
        scope: normalized.scope,
        dateRange: normalized.dateRange,
        sourceTypes: normalized.sourceTypes,
        selectedEntryIds: normalized.selectedEntryIds,
        selectedMediaIds: normalized.selectedMediaIds,
        includeHistoricalRevisions: normalized.includeHistoricalRevisions,
        requestFingerprint,
      },
      idempotencyKey: normalized.idempotencyKey,
      attemptCount: 0,
      availableAt: now,
      leaseToken: null,
      leaseOwner: null,
      leaseExpiresAt: null,
      lastHeartbeatAt: null,
    };
    const outbox: PersonalAIIndexOutboxEvent = {
      id: this.runtime.id(),
      ownerId: owner.ownerId,
      jobId,
      eventType: 'INDEX_JOB_QUEUED',
      payloadFingerprint: requestFingerprint,
      status: 'PENDING',
      availableAt: now,
      createdAt: now,
      dispatchedAt: null,
      attemptCount: 0,
    };
    const idempotency = normalized.idempotencyKey === null ? null : {
      ownerId: owner.ownerId,
      operation: 'INDEX_JOB' as const,
      key: normalized.idempotencyKey,
      fingerprint: requestFingerprint,
      resourceId: jobId,
      createdAt: now,
    };
    const write: PersonalAIDurableIndexJobEnqueueWrite = { ownerId: owner.ownerId, job, idempotency, outbox };
    const result = await this.repository.enqueueIndexJob(write);
    if (result === null || typeof result !== 'object' || result.job === undefined || result.outbox === undefined) {
      throw new PersonalAIDurableConfigurationError('Personal AI repository returned an invalid enqueue result.');
    }
    assertPublicJobOwned(result.job, owner.ownerId);
    assertIdentifierOnlyOutbox(result.outbox, owner.ownerId, result.job.id, result.job.input.requestFingerprint);
    if (result.applied && result.job.status !== 'PENDING') {
      throw new PersonalAIDurableConfigurationError('A durable enqueue must commit a PENDING job before worker execution.');
    }
    return { applied: result.applied, job: publicJob(result.job) };
  }

  public async getIndexJob(principal: AuthenticatedPrincipal, jobId: string): Promise<PublicPersonalAIIndexJob> {
    const owner = await this.authorize(principal, false);
    this.ensureId(jobId, 'jobId');
    const reader = this.requireReader('readIndexJob');
    const row = await reader.readIndexJob({ ownerId: owner.ownerId, jobId });
    if (row === null) fail('NOT_FOUND', 'Personal AI index job was not found.');
    assertPublicJobOwned(row, owner.ownerId);
    return publicJob(row);
  }

  public async listIndexJobs(principal: AuthenticatedPrincipal, options: { readonly cursor?: string; readonly limit?: number } = {}): Promise<{ readonly items: readonly PublicPersonalAIIndexJob[]; readonly nextCursor: string | null }> {
    const owner = await this.authorize(principal, false);
    if (options.cursor !== undefined) this.ensureId(options.cursor, 'cursor');
    const limit = options.limit ?? 30;
    if (!Number.isSafeInteger(limit) || limit < 1 || limit > 100) fail('VALIDATION', 'Index job list limit is invalid.');
    const reader = this.requireReader('listIndexJobs');
    const query = options.cursor === undefined
      ? { ownerId: owner.ownerId, limit }
      : { ownerId: owner.ownerId, cursor: options.cursor, limit };
    const result = await reader.listIndexJobs(query);
    if (result === null || typeof result !== 'object' || !Array.isArray(result.items) || (result.nextCursor !== null && typeof result.nextCursor !== 'string')) {
      throw new PersonalAIDurableConfigurationError('Personal AI repository returned an invalid index job page.');
    }
    const items = result.items.map((row) => {
      assertPublicJobOwned(row, owner.ownerId);
      return publicJob(row);
    });
    return { items, nextCursor: result.nextCursor };
  }

  public async getIndexStatus(principal: AuthenticatedPrincipal): Promise<PersonalAIIndexStatusView> {
    const owner = await this.authorize(principal, false);
    const currentSources = owner.state.sources.filter((source) => source.ownerId === owner.ownerId && source.indexVersion === this.indexVersion && source.indexStatus === 'READY');
    const currentChunks = owner.state.chunks.filter((chunk) => chunk.ownerId === owner.ownerId && chunk.indexVersion === this.indexVersion && chunk.embeddingStatus === 'READY');
    let latest: PersonalAIDurableIndexJobRow | null = null;
    const reader = this.repository as DurablePersonalAIIndexRepository;
    if (typeof reader.readLatestIndexJob === 'function') latest = await reader.readLatestIndexJob({ ownerId: owner.ownerId, indexVersion: this.indexVersion });
    if (latest !== null) assertPublicJobOwned(latest, owner.ownerId);
    const fallbackStatus: PersonalAIIndexStatus = currentSources.length === 0 && currentChunks.length === 0 ? 'DELETED' : 'READY';
    return {
      enabled: owner.state.preferences?.enabled === true,
      status: latest?.status ?? fallbackStatus,
      indexVersion: this.indexVersion,
      indexedSourceCount: currentSources.length,
      indexedChunkCount: currentChunks.length,
      lastIndexedAt: latest?.completedAt ?? null,
      embeddingProvider: this.embeddingProviderName,
    };
  }

  private requireReader<K extends keyof PersonalAIDurableIndexJobReader>(method: K): Pick<PersonalAIDurableIndexJobReader, K> {
    const candidate = this.repository as DurablePersonalAIIndexRepository;
    if (typeof candidate[method] !== 'function') {
      throw new PersonalAIDurableConfigurationError(`Personal AI durable repository does not expose ${String(method)}.`);
    }
    return candidate as Pick<PersonalAIDurableIndexJobReader, K>;
  }

  private ensureId(value: string, field: string): void {
    if (!safeIdentifierPattern.test(value)) fail('VALIDATION', `${field} is invalid.`);
  }

  private async authorize(principal: AuthenticatedPrincipal, requireIndexGates: boolean): Promise<{ readonly ownerId: string; readonly state: PersonalAIDurableOwnerState }> {
    if (principal === null || typeof principal !== 'object' || typeof principal.userId !== 'string' || principal.userId.trim() === '') fail('FORBIDDEN', 'An authenticated user is required.');
    const ownerId = this.trustedPrincipalResolver.resolveOwnerId(principal);
    if (ownerId === null || ownerId !== principal.userId || !safeIdentifierPattern.test(ownerId)) fail('FORBIDDEN', 'The principal is not trusted for Personal AI ownership.');
    this.requireEntitlement(principal, 'PERSONAL_AI_ACCESS');
    if (requireIndexGates) this.requireEntitlement(principal, 'PERSONAL_AI_SEMANTIC_SEARCH');
    const state = await this.repository.loadOwnerState({ ownerId });
    if (state.ownerId !== ownerId) {
      throw new PersonalAIDurableConfigurationError('Personal AI repository returned owner state for a different owner.');
    }
    if (requireIndexGates && state.currentConsent.accepted !== true) fail('CONSENT_REQUIRED', 'Personal AI consent is required before indexing.');
    if (requireIndexGates && state.preferences?.enabled !== true) fail('FORBIDDEN', 'Personal AI is disabled.');
    return { ownerId, state };
  }

  private requireEntitlement(principal: AuthenticatedPrincipal, entitlement: PersonalAIAccessEntitlementCode): void {
    if (!this.entitlementResolver.has(principal, entitlement)) fail('ENTITLEMENT_REQUIRED', 'Personal AI entitlement is required.');
  }

  private normalizeInput(input: DurablePersonalAIIndexRequest, state: PersonalAIDurableOwnerState): {
    readonly scope: PersonalAIContextScope;
    readonly dateRange: PersonalAIDateRange | null;
    readonly sourceTypes: readonly PersonalAIKnowledgeSourceType[];
    readonly selectedEntryIds: readonly string[];
    readonly selectedMediaIds: readonly string[];
    readonly includeHistoricalRevisions: boolean;
    readonly idempotencyKey: string | null;
  } {
    if (input === null || typeof input !== 'object' || !contextScopeSet.has(input.scope)) fail('VALIDATION', 'Index scope is invalid.');
    ensureDateRange(input.dateRange);
    const selectedEntryIds = ensureIds('selectedEntryIds', input.selectedEntryIds);
    const selectedMediaIds = ensureIds('selectedMediaIds', input.selectedMediaIds);
    if ((input.scope === 'SELECTED_ENTRY' || input.scope === 'SELECTED_ENTRIES') && selectedEntryIds.length === 0) fail('VALIDATION', 'Selected entry scope requires selectedEntryIds.');
    if (input.scope === 'SELECTED_MEDIA' && selectedMediaIds.length === 0) fail('VALIDATION', 'Selected media scope requires selectedMediaIds.');
    if (input.scope === 'DATE_RANGE' && input.dateRange === undefined) fail('VALIDATION', 'DATE_RANGE requires dateRange.');
    const allowed = scopeSourceTypes(input.scope);
    if (input.sourceTypes !== undefined && !Array.isArray(input.sourceTypes)) fail('VALIDATION', 'sourceTypes must be an array.');
    const requested = input.sourceTypes === undefined || input.sourceTypes.length === 0 ? [...allowed] : [...input.sourceTypes];
    if (requested.length > 20) fail('VALIDATION', 'sourceTypes contains too many values.');
    const unique = new Set<string>();
    for (const sourceType of requested) {
      if (!sourceTypeSet.has(sourceType) || unique.has(sourceType)) fail('VALIDATION', 'sourceTypes contains an invalid or duplicate value.');
      if (input.scope !== 'USER_SELECTED_ARCHIVE' && !allowed.includes(sourceType)) fail('VALIDATION', 'sourceTypes is incompatible with scope.');
      unique.add(sourceType);
    }
    const sourceTypes = [...personalAiSourceTypes].filter((sourceType) => unique.has(sourceType));
    const idempotencyKey = input.idempotencyKey === undefined ? null : input.idempotencyKey;
    if (idempotencyKey !== null && (typeof idempotencyKey !== 'string' || !idempotencyPattern.test(idempotencyKey))) fail('VALIDATION', 'idempotencyKey must be 8-200 safe identifier characters.');
    return {
      scope: input.scope,
      dateRange: input.dateRange === undefined ? null : clone(input.dateRange),
      sourceTypes,
      selectedEntryIds,
      selectedMediaIds,
      includeHistoricalRevisions: input.includeHistoricalRevisions ?? state.preferences?.includeHistoricalRevisions ?? false,
      idempotencyKey,
    };
  }
}
