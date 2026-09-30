import { createHash } from 'node:crypto';

import type {
  PersonalAIAccessEntitlementCode,
  PersonalAIContextScope,
  PersonalAIDateRange,
  PersonalAIKnowledgeSourceType,
  PersonalAITruthLayer,
  PersonalAISourceStatus,
} from '@me-zip/shared-types';

import type {
  PersonalAIArchiveRecord,
  PersonalAIUsageRecord,
} from './personal-ai.js';
import type {
  PersonalAIIndexJobExecutionInput,
  PersonalAIIndexJobExecutionOutcome,
  PersonalAIIndexJobExecutor,
} from './index-dispatcher.js';
import {
  assertPersonalAIDurableRepository,
  type PersonalAIDurableIndexJobLease,
  type PersonalAIDurableIndexProjectionWrite,
  type PersonalAIDurableKnowledgeChunkRow,
  type PersonalAIDurableKnowledgeSourceRow,
  type PersonalAIDurableRepository,
  type PersonalAIProtectedPayload,
} from './persistence.js';

/**
 * An Archive adapter for the worker.  It deliberately receives an owner ID
 * and an immutable job selection rather than a browser principal.  A
 * production implementation must apply the owner predicate in its query,
 * before returning rows to this process.
 */
export interface PersonalAIWorkerSourceReadInput {
  readonly ownerId: string;
  readonly scope: PersonalAIContextScope;
  readonly dateRange: PersonalAIDateRange | null;
  readonly sourceTypes: readonly PersonalAIKnowledgeSourceType[];
  readonly selectedEntryIds: readonly string[];
  readonly selectedMediaIds: readonly string[];
  readonly includeHistoricalRevisions: boolean;
}

/** Archive rows may carry the stable derived source-row identity.  Older
 * adapters can omit it; the executor then creates a deterministic opaque UUID
 * so citations never depend on a process-local random ID. */
export type PersonalAIWorkerArchiveRecord = PersonalAIArchiveRecord & {
  readonly sourceRecordId?: string | undefined;
};

export type PersonalAIWorkerUsageRecord = PersonalAIUsageRecord & {
  readonly sourceRecordId?: string | undefined;
};

export interface PersonalAIAsyncArchiveReader {
  readonly productionSafe: true;
  read(input: PersonalAIWorkerSourceReadInput): Promise<readonly PersonalAIWorkerArchiveRecord[]>;
}

export interface PersonalAIAsyncUsageReader {
  readonly productionSafe: true;
  read(input: PersonalAIWorkerSourceReadInput): Promise<readonly PersonalAIWorkerUsageRecord[]>;
}

/**
 * This is a server-only entitlement seam.  It does not accept a consumer
 * principal or plan code.  The resolver must consult the authoritative
 * Membership projection for the owner supplied by a leased job.
 */
export interface PersonalAIWorkerEntitlementResolver {
  readonly productionSafe: true;
  has(input: {
    readonly ownerId: string;
    readonly entitlement: Extract<PersonalAIAccessEntitlementCode, 'PERSONAL_AI_ACCESS' | 'PERSONAL_AI_SEMANTIC_SEARCH'>;
  }): Promise<boolean>;
}

/** Ciphertext is the only chunk payload that crosses the durable repository
 * boundary.  `plaintext` exists only inside a worker/provider call. */
export interface PersonalAIChunkCipher {
  readonly productionSafe: true;
  encrypt(input: {
    readonly ownerId: string;
    readonly sourceRecordId: string;
    readonly chunkId: string;
    readonly contentHash: string;
    readonly plaintext: string;
  }): Promise<PersonalAIProtectedPayload>;
}

export interface PersonalAIAsyncEmbeddingProvider {
  readonly productionSafe: true;
  readonly name: string;
  embed(input: {
    readonly ownerId: string;
    readonly sourceRecordId: string;
    readonly chunkId: string;
    readonly contentHash: string;
    readonly text: string;
  }): Promise<readonly number[]>;
}

/**
 * Vector writes are owner/source bound and idempotent by chunk ID.  Deleting
 * the source before replacement prevents a failed retry from leaving old
 * revisions searchable after an Archive change.
 */
export interface PersonalAIAsyncVectorProvider {
  readonly productionSafe: true;
  deleteSource(input: {
    readonly ownerId: string;
    readonly sourceRecordId: string;
    readonly sourceType: PersonalAIKnowledgeSourceType;
    readonly sourceId: string;
  }): Promise<void>;
  upsert(input: {
    readonly ownerId: string;
    readonly sourceRecordId: string;
    readonly sourceType: PersonalAIKnowledgeSourceType;
    readonly sourceId: string;
    readonly revisionId: string | null;
    readonly chunkId: string;
    readonly indexVersion: string;
    readonly contentHash: string;
    readonly vector: readonly number[];
  }): Promise<void>;
}

export interface DurablePersonalAIIndexJobExecutorOptions {
  readonly repository: PersonalAIDurableRepository;
  readonly archiveReader: PersonalAIAsyncArchiveReader;
  readonly usageReader: PersonalAIAsyncUsageReader;
  readonly entitlementResolver: PersonalAIWorkerEntitlementResolver;
  readonly cipher: PersonalAIChunkCipher;
  readonly embeddingProvider: PersonalAIAsyncEmbeddingProvider;
  readonly vectorProvider: PersonalAIAsyncVectorProvider;
  readonly now?: (() => string) | undefined;
  /** Maximum chunks accepted in one leased job. */
  readonly maxChunksPerJob?: number | undefined;
  /** A transient dependency is retried while this attempt budget remains. */
  readonly maxAttempts?: number | undefined;
  readonly retryDelaySeconds?: number | undefined;
}

export type DurablePersonalAIIndexFailureCode =
  | 'PERSONAL_AI_DISABLED'
  | 'PERSONAL_AI_CONSENT_REQUIRED'
  | 'PERSONAL_AI_ENTITLEMENT_REQUIRED'
  | 'INDEX_JOB_INVALID'
  | 'SOURCE_OWNER_MISMATCH'
  | 'FORBIDDEN_SOURCE_DATA'
  | 'INDEX_CHUNK_LIMIT'
  | 'INDEX_DEPENDENCY_UNAVAILABLE'
  | 'INDEX_LEASE_EXPIRED'
  | 'INDEX_PROJECTION_FAILED';

/** A provider may throw this marker when a bounded retry is safe. */
export class PersonalAIIndexDependencyUnavailableError extends Error {
  public constructor() {
    super('Personal AI index dependency unavailable.');
    this.name = 'PersonalAIIndexDependencyUnavailableError';
  }
}

class DurableIndexExecutionError extends Error {
  public constructor(
    public readonly code: DurablePersonalAIIndexFailureCode,
    public readonly retryable: boolean,
  ) {
    super(code);
    this.name = 'DurableIndexExecutionError';
  }
}

const allowedSourceTypes: readonly PersonalAIKnowledgeSourceType[] = [
  'LIFE',
  'TIMELINE',
  'HISTORY',
  'FITNESS',
  'STEPS',
  'DAILY_PACK',
  'AI_USAGE',
  'TAGS',
  'PUBLISHED_SNAPSHOT',
];

const allowedTruthLayers: readonly PersonalAITruthLayer[] = ['ORIGINAL', 'REVISION', 'PUBLISHED_SNAPSHOT'];

const allowedStatuses: readonly PersonalAISourceStatus[] = ['ACTIVE', 'TRASHED', 'DELETED'];

const defaultNow = (): string => new Date().toISOString();

function digest(value: string): string {
  return createHash('sha256').update(value).digest('hex');
}

function stableUuid(value: string): string {
  const hash = digest(value);
  return `${hash.slice(0, 8)}-${hash.slice(8, 12)}-${hash.slice(12, 16)}-${hash.slice(16, 20)}-${hash.slice(20, 32)}`;
}

const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/iu;

function tokenEstimate(value: string): number {
  return Math.max(1, Math.ceil(value.length / 4));
}

function splitSemantically(value: string, maxCharacters = 1_200): readonly string[] {
  const normalized = value.trim();
  if (normalized === '') return [];
  const sections = normalized.split(/(?:\r?\n){2,}/u).map((item) => item.trim()).filter(Boolean);
  const chunks: string[] = [];
  for (const section of sections) {
    if (section.length <= maxCharacters) {
      chunks.push(section);
      continue;
    }
    const sentences = section.split(/(?<=[。！？.!?])\s+/u).filter(Boolean);
    let current = '';
    for (const sentence of sentences.length > 0 ? sentences : [section]) {
      if (current.length > 0 && current.length + sentence.length + 1 > maxCharacters) {
        chunks.push(current.trim());
        current = '';
      }
      if (sentence.length > maxCharacters) {
        for (let start = 0; start < sentence.length; start += maxCharacters) {
          const slice = sentence.slice(start, start + maxCharacters).trim();
          if (slice.length > 0) chunks.push(slice);
        }
      } else {
        current = current.length === 0 ? sentence : `${current} ${sentence}`;
      }
    }
    if (current.trim().length > 0) chunks.push(current.trim());
  }
  return chunks.length > 0 ? chunks : [normalized];
}

function dateRangeMatches(value: string, range: PersonalAIDateRange | null): boolean {
  if (range === null) return true;
  return value >= range.from && value <= range.to;
}

function revisionNumberOf(record: PersonalAIWorkerArchiveRecord | PersonalAIWorkerUsageRecord): number {
  return 'revisionNumber' in record ? record.revisionNumber ?? 0 : 0;
}

function scopeSourceTypes(scope: PersonalAIContextScope): readonly PersonalAIKnowledgeSourceType[] {
  switch (scope) {
    case 'LIFE': return ['LIFE'];
    case 'TIMELINE': return ['TIMELINE'];
    case 'HISTORY': return ['HISTORY'];
    case 'FITNESS': return ['FITNESS', 'STEPS'];
    case 'DAILY_PACK': return ['DAILY_PACK'];
    case 'AI_USAGE': return ['AI_USAGE'];
    case 'SELECTED_MEDIA': return ['LIFE', 'PUBLISHED_SNAPSHOT'];
    case 'NONE': return [];
    default: return allowedSourceTypes;
  }
}

function metadataText(record: PersonalAIWorkerArchiveRecord | PersonalAIWorkerUsageRecord): string {
  const metadata = Object.entries(record.metadata ?? {})
    .filter(([, value]) => value !== null)
    .map(([key, value]) => `${key}: ${String(value)}`);
  const prefix = record.sourceType === 'AI_USAGE'
    ? 'AI usage aggregate'
    : record.sourceType === 'FITNESS'
      ? 'Fitness record'
      : record.sourceType === 'STEPS'
        ? 'Steps record'
        : '';
  return [prefix, record.title ?? '', record.text ?? '', ...(record.tags ?? []), ...metadata].filter(Boolean).join('\n');
}

function statusOf(record: PersonalAIWorkerArchiveRecord | PersonalAIWorkerUsageRecord): PersonalAISourceStatus {
  const status = record.status ?? 'ACTIVE';
  if (!allowedStatuses.includes(status)) throw new DurableIndexExecutionError('INDEX_JOB_INVALID', false);
  return status;
}

function sourceRecordIdOf(ownerId: string, record: PersonalAIWorkerArchiveRecord | PersonalAIWorkerUsageRecord): string {
  const supplied = record.sourceRecordId?.trim();
  if (supplied === undefined || supplied.length === 0) {
    return stableUuid(`${ownerId}:${record.sourceType}:${record.sourceId}:${record.truthLayer}:${record.revisionId ?? ''}`);
  }
  // PostgreSQL's durable source identity is UUID-based.  Rejecting a
  // malformed adapter value here avoids a late partial projection and forces
  // a production Archive reader to provide its canonical source-row ID.
  if (!uuidPattern.test(supplied)) throw new DurableIndexExecutionError('INDEX_JOB_INVALID', false);
  return supplied.toLowerCase();
}

function validateProductionMarker(value: unknown, name: string, methods: readonly string[] = []): void {
  if (value === null || typeof value !== 'object' || (value as { readonly productionSafe?: unknown }).productionSafe !== true) {
    throw new Error(`${name} must be a reviewed production adapter.`);
  }
  const candidate = value as Record<string, unknown>;
  if (methods.some((method) => typeof candidate[method] !== 'function')) throw new Error(`${name} is missing a required server method.`);
}

function validateVector(vector: readonly number[]): void {
  if (vector.length === 0 || vector.length > 4_096 || vector.some((value) => !Number.isFinite(value))) {
    throw new DurableIndexExecutionError('INDEX_PROJECTION_FAILED', false);
  }
}

function validateProtectedPayload(value: PersonalAIProtectedPayload): PersonalAIProtectedPayload {
  if (
    value === null ||
    typeof value !== 'object' ||
    typeof value.ciphertext !== 'string' ||
    value.ciphertext.length < 16 ||
    typeof value.keyReference !== 'string' ||
    value.keyReference.trim() === '' ||
    typeof value.algorithm !== 'string' ||
    value.algorithm.trim() === '' ||
    typeof value.version !== 'string' ||
    value.version.trim() === ''
  ) {
    throw new DurableIndexExecutionError('INDEX_PROJECTION_FAILED', false);
  }
  return {
    ciphertext: value.ciphertext,
    keyReference: value.keyReference,
    algorithm: value.algorithm,
    version: value.version,
  };
}

function isForbiddenSource(record: PersonalAIWorkerArchiveRecord | PersonalAIWorkerUsageRecord): boolean {
  const sourceType = record.sourceType as string;
  return sourceType === 'PRIVATE_MESSAGES' || record.truthLayer === 'AI_INSIGHT';
}

function readInputForJob(lease: PersonalAIDurableIndexJobLease): PersonalAIWorkerSourceReadInput {
  const input = lease.job.input;
  return {
    ownerId: lease.job.ownerId,
    scope: input.scope,
    dateRange: input.dateRange,
    sourceTypes: [...input.sourceTypes],
    selectedEntryIds: [...input.selectedEntryIds],
    selectedMediaIds: [...input.selectedMediaIds],
    includeHistoricalRevisions: input.includeHistoricalRevisions,
  };
}

function sourceAllowed(record: PersonalAIWorkerArchiveRecord | PersonalAIWorkerUsageRecord, input: PersonalAIWorkerSourceReadInput): boolean {
  if (!allowedSourceTypes.includes(record.sourceType)) return false;
  const scopeTypes = scopeSourceTypes(input.scope);
  const requestedTypes = input.sourceTypes.length === 0 ? scopeTypes : input.sourceTypes;
  if (!requestedTypes.includes(record.sourceType) || !scopeTypes.includes(record.sourceType)) return false;
  if (!dateRangeMatches(record.occurredAt, input.dateRange)) return false;
  if ((input.scope === 'SELECTED_ENTRY' || input.scope === 'SELECTED_ENTRIES') && !input.selectedEntryIds.includes(record.sourceId)) return false;
  if (input.scope === 'SELECTED_MEDIA' && !input.selectedMediaIds.includes(record.sourceId)) return false;
  return true;
}

function selectLatestRecords(records: readonly (PersonalAIWorkerArchiveRecord | PersonalAIWorkerUsageRecord)[], includeHistorical: boolean): readonly (PersonalAIWorkerArchiveRecord | PersonalAIWorkerUsageRecord)[] {
  const unique = new Map<string, PersonalAIWorkerArchiveRecord | PersonalAIWorkerUsageRecord>();
  for (const record of records) {
    const key = `${record.canonicalSourceId ?? record.sourceId}:${record.truthLayer}`;
    if (includeHistorical) {
      unique.set(`${key}:${record.revisionId ?? ''}`, record);
      continue;
    }
    const previous = unique.get(key);
    if (previous === undefined || record.updatedAt > previous.updatedAt || revisionNumberOf(record) > revisionNumberOf(previous)) unique.set(key, record);
  }
  return [...unique.values()];
}

function transientFromUnknown(error: unknown): DurableIndexExecutionError {
  if (error instanceof DurableIndexExecutionError) return error;
  if (error instanceof PersonalAIIndexDependencyUnavailableError) return new DurableIndexExecutionError('INDEX_DEPENDENCY_UNAVAILABLE', true);
  return new DurableIndexExecutionError('INDEX_DEPENDENCY_UNAVAILABLE', true);
}

/**
 * Concrete server-only executor for the leased durable index queue.  It never
 * acknowledges a lease; `runPersonalAIIndexWorkerOnce` owns that terminal
 * repository write after this executor has committed its projection.
 */
export class DurablePersonalAIIndexJobExecutor implements PersonalAIIndexJobExecutor {
  private readonly now: () => string;
  private readonly maxChunksPerJob: number;
  private readonly maxAttempts: number;
  private readonly retryDelaySeconds: number;

  public constructor(private readonly options: DurablePersonalAIIndexJobExecutorOptions) {
    assertPersonalAIDurableRepository(options.repository);
    validateProductionMarker(options.archiveReader, 'Archive reader', ['read']);
    validateProductionMarker(options.usageReader, 'Usage reader', ['read']);
    validateProductionMarker(options.entitlementResolver, 'Entitlement resolver', ['has']);
    validateProductionMarker(options.cipher, 'Chunk cipher', ['encrypt']);
    validateProductionMarker(options.embeddingProvider, 'Embedding provider', ['embed']);
    validateProductionMarker(options.vectorProvider, 'Vector provider', ['deleteSource', 'upsert']);
    if (options.maxChunksPerJob !== undefined && (!Number.isSafeInteger(options.maxChunksPerJob) || options.maxChunksPerJob < 1)) throw new Error('maxChunksPerJob must be positive.');
    if (options.maxAttempts !== undefined && (!Number.isSafeInteger(options.maxAttempts) || options.maxAttempts < 1)) throw new Error('maxAttempts must be positive.');
    if (options.retryDelaySeconds !== undefined && (!Number.isSafeInteger(options.retryDelaySeconds) || options.retryDelaySeconds < 1)) throw new Error('retryDelaySeconds must be positive.');
    this.now = options.now ?? defaultNow;
    this.maxChunksPerJob = options.maxChunksPerJob ?? 2_000;
    this.maxAttempts = options.maxAttempts ?? 5;
    this.retryDelaySeconds = options.retryDelaySeconds ?? 60;
  }

  public async execute(input: PersonalAIIndexJobExecutionInput): Promise<PersonalAIIndexJobExecutionOutcome> {
    const lease = input.lease;
    const touchedSources = new Map<string, { readonly sourceType: PersonalAIKnowledgeSourceType; readonly sourceId: string }>();
    try {
      this.validateLease(lease);
      const heartbeat = async (): Promise<void> => {
        if (input.renewLease === undefined) return;
        const renewed = await input.renewLease();
        if (renewed === null) throw new DurableIndexExecutionError('INDEX_LEASE_EXPIRED', true);
        if (
          renewed.job.ownerId !== lease.job.ownerId ||
          renewed.job.id !== lease.job.id ||
          renewed.leaseToken !== lease.leaseToken ||
          renewed.workerId !== lease.workerId
        ) {
          throw new DurableIndexExecutionError('INDEX_JOB_INVALID', false);
        }
        this.validateLease(renewed);
      };
      const ownerId = lease.job.ownerId;
      const sourceInput = readInputForJob(lease);
      await this.authorize(ownerId);
      await heartbeat();
      const archive = await this.readArchive(sourceInput);
      this.validateArchiveReaderBoundary(archive);
      const usage = sourceInput.sourceTypes.includes('AI_USAGE') ? await this.readUsage(sourceInput) : [];
      this.validateUsageReaderBoundary(usage);
      const records = this.validateAndSelectRecords(ownerId, sourceInput, [...archive, ...usage]);
      const projection = await this.buildProjection(lease, records, touchedSources, heartbeat);
      // Consent and Membership may change while providers are running.  A
      // final server-side reauthorization prevents committing after withdrawal.
      await this.authorize(ownerId);
      await heartbeat();
      await this.options.repository.persistIndexProjection(projection);
      return {
        status: 'COMPLETED',
        indexedSourceCount: projection.sources.filter((source) => source.status === 'ACTIVE').length,
        indexedChunkCount: projection.chunks.length,
        failedSourceCount: 0,
      };
    } catch (error) {
      await this.cleanupVectors(lease, touchedSources);
      return this.outcomeForError(error, lease.job.attemptCount);
    }
  }

  private validateLease(lease: PersonalAIDurableIndexJobLease): void {
    if (lease.job.ownerId.trim() === '' || lease.leaseToken.trim() === '' || lease.workerId.trim() === '') throw new DurableIndexExecutionError('INDEX_JOB_INVALID', false);
    if (lease.job.leaseToken !== null && lease.job.leaseToken !== lease.leaseToken) throw new DurableIndexExecutionError('INDEX_JOB_INVALID', false);
    if (lease.job.leaseOwner !== null && lease.job.leaseOwner !== lease.workerId) throw new DurableIndexExecutionError('INDEX_JOB_INVALID', false);
    if (lease.job.status !== 'INDEXING') throw new DurableIndexExecutionError('INDEX_JOB_INVALID', false);
    const nowMs = Date.parse(this.now());
    const claimedAtMs = Date.parse(lease.claimedAt);
    const expiresAtMs = Date.parse(lease.expiresAt);
    const jobExpiresAtMs = lease.job.leaseExpiresAt === null ? expiresAtMs : Date.parse(lease.job.leaseExpiresAt);
    if (![nowMs, claimedAtMs, expiresAtMs, jobExpiresAtMs].every(Number.isFinite)) throw new DurableIndexExecutionError('INDEX_JOB_INVALID', false);
    if (claimedAtMs > expiresAtMs || jobExpiresAtMs !== expiresAtMs) throw new DurableIndexExecutionError('INDEX_JOB_INVALID', false);
    if (expiresAtMs <= nowMs) throw new DurableIndexExecutionError('INDEX_LEASE_EXPIRED', true);
    if (lease.job.input.requestFingerprint.length !== 64 || !/^[a-f0-9]{64}$/u.test(lease.job.input.requestFingerprint)) throw new DurableIndexExecutionError('INDEX_JOB_INVALID', false);
    if (lease.job.indexVersion.trim() === '') throw new DurableIndexExecutionError('INDEX_JOB_INVALID', false);
  }

  private async authorize(ownerId: string): Promise<void> {
    let state;
    try {
      state = await this.options.repository.loadOwnerState({ ownerId });
    } catch {
      throw new DurableIndexExecutionError('INDEX_DEPENDENCY_UNAVAILABLE', true);
    }
    if (state.ownerId !== ownerId) throw new DurableIndexExecutionError('SOURCE_OWNER_MISMATCH', false);
    if (state.preferences?.enabled !== true) throw new DurableIndexExecutionError('PERSONAL_AI_DISABLED', false);
    if (state.currentConsent.accepted !== true) throw new DurableIndexExecutionError('PERSONAL_AI_CONSENT_REQUIRED', false);
    try {
      const [access, semantic] = await Promise.all([
        this.options.entitlementResolver.has({ ownerId, entitlement: 'PERSONAL_AI_ACCESS' }),
        this.options.entitlementResolver.has({ ownerId, entitlement: 'PERSONAL_AI_SEMANTIC_SEARCH' }),
      ]);
      if (!access || !semantic) throw new DurableIndexExecutionError('PERSONAL_AI_ENTITLEMENT_REQUIRED', false);
    } catch (error) {
      if (error instanceof DurableIndexExecutionError) throw error;
      throw new DurableIndexExecutionError('INDEX_DEPENDENCY_UNAVAILABLE', true);
    }
  }

  private async readArchive(input: PersonalAIWorkerSourceReadInput): Promise<readonly PersonalAIWorkerArchiveRecord[]> {
    try {
      return await this.options.archiveReader.read(input);
    } catch {
      throw new DurableIndexExecutionError('INDEX_DEPENDENCY_UNAVAILABLE', true);
    }
  }

  private async readUsage(input: PersonalAIWorkerSourceReadInput): Promise<readonly PersonalAIWorkerUsageRecord[]> {
    try {
      return await this.options.usageReader.read(input);
    } catch {
      throw new DurableIndexExecutionError('INDEX_DEPENDENCY_UNAVAILABLE', true);
    }
  }

  private validateArchiveReaderBoundary(records: readonly PersonalAIWorkerArchiveRecord[]): void {
    // AI_USAGE has a separate metadata-only reader.  Rejecting it here keeps
    // an accidentally broad Archive query from crossing that privacy seam.
    if (records.some((record) => (record.sourceType as string) === 'AI_USAGE')) throw new DurableIndexExecutionError('FORBIDDEN_SOURCE_DATA', false);
  }

  private validateUsageReaderBoundary(records: readonly PersonalAIWorkerUsageRecord[]): void {
    // The usage port is intentionally aggregate-only; a broad Archive row
    // (or a future private-message row) must never be accepted through it.
    if (records.some((record) => record.sourceType !== 'AI_USAGE')) throw new DurableIndexExecutionError('FORBIDDEN_SOURCE_DATA', false);
  }

  private validateAndSelectRecords(ownerId: string, input: PersonalAIWorkerSourceReadInput, records: readonly (PersonalAIWorkerArchiveRecord | PersonalAIWorkerUsageRecord)[]): readonly (PersonalAIWorkerArchiveRecord | PersonalAIWorkerUsageRecord)[] {
    const selected: (PersonalAIWorkerArchiveRecord | PersonalAIWorkerUsageRecord)[] = [];
    for (const record of records) {
      if (record.ownerId !== ownerId) throw new DurableIndexExecutionError('SOURCE_OWNER_MISMATCH', false);
      if (isForbiddenSource(record)) throw new DurableIndexExecutionError('FORBIDDEN_SOURCE_DATA', false);
      if (!allowedTruthLayers.includes(record.truthLayer)) throw new DurableIndexExecutionError('FORBIDDEN_SOURCE_DATA', false);
      if (sourceAllowed(record, input)) selected.push(record);
    }
    return selectLatestRecords(selected, input.includeHistoricalRevisions);
  }

  private async buildProjection(
    lease: PersonalAIDurableIndexJobLease,
    records: readonly (PersonalAIWorkerArchiveRecord | PersonalAIWorkerUsageRecord)[],
    touchedSources: Map<string, { readonly sourceType: PersonalAIKnowledgeSourceType; readonly sourceId: string }>,
    heartbeat: () => Promise<void>,
  ): Promise<PersonalAIDurableIndexProjectionWrite> {
    const sources: PersonalAIDurableKnowledgeSourceRow[] = [];
    const chunks: PersonalAIDurableKnowledgeChunkRow[] = [];
    const invalidatedSourceRecordIds: string[] = [];
    for (const record of records) {
      // Renew before each source and in bounded chunk batches.  Provider calls
      // can be slow, so a long user archive cannot silently outlive its
      // database lease and race another worker's projection.
      await heartbeat();
      const sourceRecordId = sourceRecordIdOf(lease.job.ownerId, record);
      const sourceStatus = statusOf(record);
      const text = metadataText(record);
      const contentHash = digest(text);
      const source = this.sourceRow(lease, record, sourceRecordId, sourceStatus, contentHash);
      sources.push(source);
      await this.options.vectorProvider.deleteSource({ ownerId: lease.job.ownerId, sourceRecordId, sourceType: record.sourceType, sourceId: record.sourceId });
      touchedSources.set(sourceRecordId, { sourceType: record.sourceType, sourceId: record.sourceId });
      if (sourceStatus !== 'ACTIVE') {
        invalidatedSourceRecordIds.push(sourceRecordId);
        continue;
      }
      const sections = splitSemantically(text);
      if (chunks.length + sections.length > this.maxChunksPerJob) throw new DurableIndexExecutionError('INDEX_CHUNK_LIMIT', false);
      for (const [chunkIndex, section] of sections.entries()) {
        if (chunkIndex > 0 && chunkIndex % 25 === 0) await heartbeat();
        const sectionHash = digest(section);
        const chunkId = stableUuid(`${lease.job.ownerId}:${sourceRecordId}:${lease.job.indexVersion}:${chunkIndex}:${sectionHash}`);
        let protectedText: PersonalAIProtectedPayload;
        let vector: readonly number[];
        try {
          protectedText = validateProtectedPayload(await this.options.cipher.encrypt({ ownerId: lease.job.ownerId, sourceRecordId, chunkId, contentHash: sectionHash, plaintext: section }));
          vector = await this.options.embeddingProvider.embed({ ownerId: lease.job.ownerId, sourceRecordId, chunkId, contentHash: sectionHash, text: section });
          validateVector(vector);
          await this.options.vectorProvider.upsert({ ownerId: lease.job.ownerId, sourceRecordId, sourceType: record.sourceType, sourceId: record.sourceId, revisionId: record.revisionId ?? null, chunkId, indexVersion: lease.job.indexVersion, contentHash: sectionHash, vector: [...vector] });
        } catch (error) {
          throw transientFromUnknown(error);
        }
        chunks.push({
          ownerId: lease.job.ownerId,
          sourceRecordId,
          chunkId,
          sourceType: record.sourceType,
          sourceId: record.sourceId,
          canonicalSourceId: record.canonicalSourceId ?? record.sourceId,
          truthLayer: record.truthLayer,
          revisionId: record.revisionId ?? null,
          chunkIndex,
          tokenEstimate: tokenEstimate(section),
          contentHash: sectionHash,
          // The legacy schema still requires a non-empty `text` column.  It
          // receives only a digest marker; owner-authorized query code
          // decrypts protectedText and never treats this marker as evidence.
          excerpt: sectionHash,
          occurredAt: record.occurredAt,
          tags: [...(record.tags ?? [])],
          indexVersion: lease.job.indexVersion,
          embeddingStatus: 'READY',
          protectedText,
        });
      }
    }
    return {
      ownerId: lease.job.ownerId,
      jobId: lease.job.id,
      leaseToken: lease.leaseToken,
      workerId: lease.workerId,
      sources,
      chunks,
      invalidatedSourceRecordIds,
    };
  }

  private sourceRow(
    lease: PersonalAIDurableIndexJobLease,
    record: PersonalAIWorkerArchiveRecord | PersonalAIWorkerUsageRecord,
    sourceRecordId: string,
    status: PersonalAISourceStatus,
    contentHash: string,
  ): PersonalAIDurableKnowledgeSourceRow {
    const truthLayer = record.truthLayer as Exclude<PersonalAITruthLayer, 'AI_INSIGHT'>;
    return {
      ownerId: lease.job.ownerId,
      sourceRecordId,
      sourceType: record.sourceType,
      sourceId: record.sourceId,
      canonicalSourceId: record.canonicalSourceId ?? record.sourceId,
      truthLayer,
      revisionId: record.revisionId ?? null,
      occurredAt: record.occurredAt,
      createdAt: record.createdAt,
      updatedAt: record.updatedAt,
      visibility: record.visibility ?? (truthLayer === 'PUBLISHED_SNAPSHOT' ? 'SNAPSHOT' : 'PRIVATE'),
      status,
      title: record.title ?? null,
      tags: [...(record.tags ?? [])],
      indexVersion: lease.job.indexVersion,
      indexStatus: status === 'ACTIVE' ? 'READY' : 'DELETED',
      contentHash,
    };
  }

  private async cleanupVectors(lease: PersonalAIDurableIndexJobLease, touchedSources: ReadonlyMap<string, { readonly sourceType: PersonalAIKnowledgeSourceType; readonly sourceId: string }>): Promise<void> {
    for (const [sourceRecordId, source] of touchedSources) {
      try {
        await this.options.vectorProvider.deleteSource({ ownerId: lease.job.ownerId, sourceRecordId, sourceType: source.sourceType, sourceId: source.sourceId });
      } catch {
        // Cleanup is best effort.  The next leased retry deterministically
        // deletes/replaces the same source before writing new vectors.
      }
    }
  }

  private outcomeForError(error: unknown, attemptCount: number): PersonalAIIndexJobExecutionOutcome {
    const normalized = error instanceof DurableIndexExecutionError ? error : transientFromUnknown(error);
    if (!normalized.retryable || attemptCount >= this.maxAttempts) return { status: 'FAILED', errorCode: normalized.code };
    return { status: 'RETRY', errorCode: normalized.code, retryAt: this.retryAt() };
  }

  private retryAt(): string {
    const now = Date.parse(this.now());
    const base = Number.isFinite(now) ? now : Date.now();
    return new Date(base + this.retryDelaySeconds * 1_000).toISOString();
  }
}

/** Factory form for composition roots that prefer a function over a class. */
export function createDurablePersonalAIIndexJobExecutor(options: DurablePersonalAIIndexJobExecutorOptions): PersonalAIIndexJobExecutor {
  return new DurablePersonalAIIndexJobExecutor(options);
}
