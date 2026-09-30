import { createHash, randomUUID } from 'node:crypto';

import { personalAiExportExcludedDataCategories } from '@me-zip/shared-types';

import type { ArchiveSourceLifecycleEvent } from '@me-zip/archive';

import {
  assertPersonalAIAsyncIndexingDependencies,
  type PersonalAIAsyncIndexingDependencies,
} from './index-dispatcher.js';

import type {
  AiGatewayProviderCode,
  AuthenticatedPrincipal,
  PersonalAIAccessEntitlementCode,
  PersonalAIArchiveMode,
  PersonalAICitation,
  PersonalAIConfidenceKind,
  PersonalAIConversation,
  PersonalAIContextScope,
  PersonalAIDateRange,
  PersonalAIExportCitationReference,
  PersonalAIExportConsentHistoryEntry,
  PersonalAIExportConversationMetadata,
  PersonalAIExportInsightMetadata,
  PersonalAIExportJob,
  PersonalAIExportRequest,
  PersonalAIExportResult,
  PersonalAIExportSection,
  PersonalAIExportStatusView,
  PersonalAIIndexJob,
  PersonalAIIndexStatus,
  PersonalAIIndexStatusView,
  PersonalAIKnowledgeChunk,
  PersonalAIKnowledgeSource,
  PersonalAIKnowledgeSourceType,
  PersonalAIPrivacyView,
  PersonalAIPreferences,
  PersonalAIQueryInput,
  PersonalAIQueryPage,
  PersonalAIQueryResult,
  PersonalAISearchMode,
  PersonalAISourceStatus,
  PersonalAITruthLayer,
} from '@me-zip/shared-types';

export type PersonalAIErrorCode =
  | 'FORBIDDEN'
  | 'NOT_FOUND'
  | 'VALIDATION'
  | 'CONFLICT'
  | 'ENTITLEMENT_REQUIRED'
  | 'CONSENT_REQUIRED'
  | 'INDEX_UNAVAILABLE'
  | 'PROVIDER_UNAVAILABLE'
  | 'RATE_LIMITED';

export class PersonalAIError extends Error {
  public constructor(public readonly code: PersonalAIErrorCode, message: string) {
    super(message);
    this.name = 'PersonalAIError';
  }
}

export interface PersonalAIRuntime {
  readonly now: () => string;
  readonly id: () => string;
}

const defaultRuntime: PersonalAIRuntime = { now: () => new Date().toISOString(), id: randomUUID };

/** Internal, server-only archive projection. `ownerId` and `text` are never
 * returned by the public API and never written to ordinary request logs. */
export interface PersonalAIArchiveRecord {
  readonly sourceType: Exclude<PersonalAIKnowledgeSourceType, 'AI_USAGE'>;
  readonly sourceId: string;
  readonly canonicalSourceId?: string | undefined;
  readonly truthLayer: PersonalAITruthLayer;
  readonly revisionId?: string | null | undefined;
  readonly revisionNumber?: number | undefined;
  readonly ownerId: string;
  readonly occurredAt: string;
  readonly createdAt: string;
  readonly updatedAt: string;
  readonly visibility?: 'PRIVATE' | 'SNAPSHOT' | undefined;
  readonly status?: PersonalAISourceStatus | undefined;
  readonly title?: string | null | undefined;
  readonly text?: string | null | undefined;
  readonly tags?: readonly string[] | undefined;
  /** Aggregates such as Daily Pack may point at canonical Life/History IDs. */
  readonly relatedSourceIds?: readonly string[] | undefined;
  readonly metadata?: Readonly<Record<string, string | number | boolean | null>> | undefined;
}

export interface PersonalAIUsageRecord {
  readonly sourceType: 'AI_USAGE';
  readonly sourceId: string;
  readonly canonicalSourceId?: string | undefined;
  readonly truthLayer: 'ORIGINAL';
  readonly revisionId?: string | null | undefined;
  readonly ownerId: string;
  readonly occurredAt: string;
  readonly createdAt: string;
  readonly updatedAt: string;
  readonly visibility?: 'PRIVATE' | undefined;
  readonly status?: PersonalAISourceStatus | undefined;
  readonly title?: string | null | undefined;
  readonly text?: string | null | undefined;
  readonly tags?: readonly string[] | undefined;
  readonly relatedSourceIds?: readonly string[] | undefined;
  readonly metadata?: Readonly<Record<string, string | number | boolean | null>> | undefined;
}

export interface PersonalAISourceReadInput {
  readonly principal: AuthenticatedPrincipal;
  readonly scope: PersonalAIContextScope;
  readonly dateRange?: PersonalAIDateRange | undefined;
  readonly sourceTypes?: readonly PersonalAIKnowledgeSourceType[] | undefined;
  readonly selectedEntryIds?: readonly string[] | undefined;
  readonly selectedMediaIds?: readonly string[] | undefined;
  /** Optional server worker idempotency key; never an owner or plan field. */
  readonly idempotencyKey?: string | undefined;
}

/** Adapter for Archive. Implementations must perform an owner-scoped query;
 * a post-retrieval owner filter is only a defensive second check. */
export interface PersonalAIArchiveReader {
  read(input: PersonalAISourceReadInput): readonly PersonalAIArchiveRecord[];
}

/** Separate AI Usage port. It is metadata-only and can never read messages. */
export interface PersonalAIUsageReader {
  read(input: PersonalAISourceReadInput): readonly PersonalAIUsageRecord[];
}

export interface PersonalAIEmbeddingProvider {
  readonly name: string;
  /** Production adapters set this marker after review; local deterministic
   * adapters intentionally leave it unset. */
  readonly productionSafe?: true | undefined;
  embed(input: { readonly text: string }): readonly number[];
}

export interface PersonalAIVectorSearchFilter {
  readonly sourceTypes?: readonly PersonalAIKnowledgeSourceType[] | undefined;
  /** Prevents a model/index migration from mixing incompatible vectors with
   * keyword candidates from a newer index version. */
  readonly indexVersions?: readonly string[] | undefined;
  readonly from?: string | undefined;
  readonly to?: string | undefined;
  readonly tags?: readonly string[] | undefined;
  readonly statuses?: readonly PersonalAISourceStatus[] | undefined;
}

export interface PersonalAIVectorHit {
  readonly chunkId: string;
  readonly score: number;
}

/** Vector search is an owner-first server seam. There is no public query path
 * that can omit `ownerId` or inject a different owner. */
export interface PersonalAIVectorSearchProvider {
  readonly productionSafe?: true | undefined;
  upsert(input: { readonly ownerId: string; readonly chunkId: string; readonly vector: readonly number[]; readonly indexVersion: string; readonly revisionId?: string | null | undefined }): void;
  search(input: {
    readonly ownerId: string;
    readonly vector: readonly number[];
    readonly limit: number;
    readonly filter?: PersonalAIVectorSearchFilter;
  }): readonly PersonalAIVectorHit[];
  deleteSource(input: { readonly ownerId: string; readonly sourceType: PersonalAIKnowledgeSourceType; readonly sourceId: string; readonly revisionId?: string | null | undefined }): void;
  deleteOwner(input: { readonly ownerId: string }): void;
}

export interface PersonalAIGenerationInput {
  readonly principal: AuthenticatedPrincipal;
  readonly archiveMode: PersonalAIArchiveMode;
  readonly question: string;
  readonly evidence: readonly PersonalAICitation[];
}

export interface PersonalAIGenerationResult {
  readonly answerText: string;
  readonly modelCode: string | null;
  readonly providerCode: AiGatewayProviderCode | null;
  readonly inputTokens: number;
  readonly outputTokens: number;
  readonly costFen: number;
  readonly latencyMs: number | null;
}

export interface PersonalAIGenerationGateway {
  /** Set only by the reviewed Phase 8 Gateway bridge. */
  readonly phase8Gateway?: true | undefined;
  generate(input: PersonalAIGenerationInput): PersonalAIGenerationResult;
}

export interface PersonalAIEntitlementResolver {
  has(principal: AuthenticatedPrincipal, entitlement: PersonalAIAccessEntitlementCode): boolean;
}

export class LocalDevelopmentPersonalAIEntitlementResolver implements PersonalAIEntitlementResolver {
  public has(principal: AuthenticatedPrincipal, _entitlement: PersonalAIAccessEntitlementCode): boolean {
    void _entitlement;
    return principal.userId.trim().length > 0;
  }
}

export interface PersonalAIServiceOptions {
  readonly runtime?: Partial<PersonalAIRuntime>;
  readonly archiveReader?: PersonalAIArchiveReader;
  readonly usageReader?: PersonalAIUsageReader;
  readonly embeddingProvider?: PersonalAIEmbeddingProvider;
  readonly vectorProvider?: PersonalAIVectorSearchProvider;
  readonly generationGateway?: PersonalAIGenerationGateway;
  readonly entitlementResolver?: PersonalAIEntitlementResolver;
  readonly indexVersion?: string;
  readonly autoProcessIndexJobs?: boolean;
  readonly initialPreferences?: Partial<PersonalAIPreferences>;
  readonly deploymentMode?: 'LOCAL_DEVELOPMENT' | 'PRODUCTION';
  /** Required in a production composition. The synchronous in-memory engine
   * deliberately refuses to start there until the async durable service is
   * wired through this transactional repository/outbox boundary. */
  readonly asyncIndexing?: PersonalAIAsyncIndexingDependencies;
  readonly maxIndexJobsPerHour?: number;
  readonly maxIndexChunksPerJob?: number;
}

/** Body-free Archive event result.  It stays on the server composition seam;
 * no Personal AI HTTP route accepts this shape from a consumer. */
export interface PersonalAITrustedArchiveLifecycleOutcome {
  readonly action: ArchiveSourceLifecycleEvent['action'];
  readonly sourceType: PersonalAIKnowledgeSourceType;
  readonly sourceId: string;
  readonly invalidated: boolean;
  readonly queuedJobId: string | null;
  readonly skipped: 'NONE' | 'PERSONAL_AI_DISABLED_OR_UNAUTHORIZED';
}

interface InternalSource extends PersonalAIKnowledgeSource {
  readonly ownerId: string;
  readonly text: string;
  readonly metadata: Readonly<Record<string, string | number | boolean | null>>;
  readonly relatedSourceIds: readonly string[];
}

interface InternalChunk extends PersonalAIKnowledgeChunk {
  readonly ownerId: string;
  readonly text: string;
}

interface InternalJob extends PersonalAIIndexJob {
  readonly ownerId: string;
}

interface InternalQuery {
  readonly ownerId: string;
  readonly questionHash: string;
  readonly result: PersonalAIQueryResult;
}

interface InternalConversation extends PersonalAIConversation {
  readonly ownerId: string;
}

interface IdempotencyReceipt {
  readonly fingerprint: string;
  readonly result: unknown;
}

interface InternalExport {
  readonly ownerId: string;
  readonly job: PersonalAIExportJob;
  readonly result: PersonalAIExportResult | null;
}

const clone = <T>(value: T): T => structuredClone(value);

function hash(value: unknown): string {
  return createHash('sha256').update(JSON.stringify(value) ?? '').digest('hex');
}

function parseDate(value: string, field: string): void {
  if (Number.isNaN(Date.parse(value))) throw new PersonalAIError('VALIDATION', `${field} must be an ISO date.`);
}

function ensurePrincipal(principal: AuthenticatedPrincipal): void {
  if (principal.userId.trim() === '') throw new PersonalAIError('FORBIDDEN', 'An authenticated user is required.');
}

/** Idempotency keys are client/request identifiers only. Keep them bounded and
 * deliberately boring so they cannot be used as an owner, prompt, or storage
 * injection channel. The HTTP schemas use the same 8..200 bound; the service
 * repeats it because workers and direct callers bypass schemas. */
function ensureIdempotencyKey(value: string): void {
  if (!/^[A-Za-z0-9][A-Za-z0-9._:-]{7,199}$/u.test(value)) {
    throw new PersonalAIError('VALIDATION', 'idempotencyKey must be 8-200 safe identifier characters.');
  }
}

function bounded(value: number | undefined, fallback: number, max: number): number {
  const result = value ?? fallback;
  if (!Number.isSafeInteger(result) || result < 1 || result > max) throw new PersonalAIError('VALIDATION', 'Pagination or ranking limit is invalid.');
  return result;
}

function normalizeText(value: string): string {
  return value.normalize('NFKC').toLocaleLowerCase().replace(/\s+/gu, ' ').trim();
}

function tokenEstimate(value: string): number {
  return Math.max(1, Math.ceil(value.length / 4));
}

function cosine(left: readonly number[], right: readonly number[]): number {
  if (left.length !== right.length || left.length === 0) return 0;
  let dot = 0;
  let leftNorm = 0;
  let rightNorm = 0;
  for (let index = 0; index < left.length; index += 1) {
    const a = left[index] ?? 0;
    const b = right[index] ?? 0;
    dot += a * b;
    leftNorm += a * a;
    rightNorm += b * b;
  }
  return leftNorm === 0 || rightNorm === 0 ? 0 : dot / Math.sqrt(leftNorm * rightNorm);
}

function dateRangeMatches(value: string, range: PersonalAIDateRange | undefined): boolean {
  return range === undefined || (value >= range.from && value <= range.to);
}

function utcDayRange(now: string): PersonalAIDateRange {
  const day = now.slice(0, 10);
  return { from: `${day}T00:00:00.000Z`, to: `${day}T23:59:59.999Z` };
}

function revisionNumberOf(record: PersonalAIArchiveRecord | PersonalAIUsageRecord): number {
  return 'revisionNumber' in record ? record.revisionNumber ?? 0 : 0;
}

function splitSemantically(text: string, maxCharacters = 1_200): readonly string[] {
  const normalized = text.trim();
  if (normalized === '') return [];
  const sections = normalized.split(/(?:\r?\n){2,}/u).map((section) => section.trim()).filter(Boolean);
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
    default: return ['LIFE', 'TIMELINE', 'HISTORY', 'FITNESS', 'STEPS', 'DAILY_PACK', 'AI_USAGE', 'TAGS', 'PUBLISHED_SNAPSHOT'];
  }
}

/** Deterministic local embeddings make unit/integration tests reproducible and
 * never contact a third-party provider. */
export class DeterministicPersonalAIEmbeddingProvider implements PersonalAIEmbeddingProvider {
  public readonly name = 'DETERMINISTIC_LOCAL_V1';

  public embed(input: { readonly text: string }): readonly number[] {
    const digest = createHash('sha256').update(input.text).digest();
    const vector: number[] = [];
    for (let index = 0; index < 16; index += 1) {
      vector.push((digest[index] ?? 0) / 127.5 - 1);
    }
    return vector;
  }
}

export class InMemoryPersonalAIVectorSearchProvider implements PersonalAIVectorSearchProvider {
  private readonly vectors = new Map<string, { readonly ownerId: string; readonly vector: readonly number[]; readonly sourceType: PersonalAIKnowledgeSourceType; readonly sourceId: string; readonly revisionId: string | null; readonly indexVersion: string }>();

  public upsert(input: { readonly ownerId: string; readonly chunkId: string; readonly vector: readonly number[]; readonly indexVersion: string; readonly revisionId?: string | null | undefined }): void {
    const split = input.chunkId.split('|');
    this.vectors.set(input.chunkId, {
      ownerId: input.ownerId,
      vector: [...input.vector],
      sourceType: (split[1] ?? 'LIFE') as PersonalAIKnowledgeSourceType,
      sourceId: split[2] ?? input.chunkId,
      revisionId: input.revisionId ?? null,
      indexVersion: input.indexVersion,
    });
  }

  public search(input: { readonly ownerId: string; readonly vector: readonly number[]; readonly limit: number; readonly filter?: PersonalAIVectorSearchFilter }): readonly PersonalAIVectorHit[] {
    if (input.ownerId.trim() === '') return [];
    const hits = [...this.vectors.entries()]
      .filter(([, entry]) => entry.ownerId === input.ownerId)
      .filter(([, entry]) => input.filter?.sourceTypes === undefined || input.filter.sourceTypes.includes(entry.sourceType))
      .filter(([, entry]) => input.filter?.indexVersions === undefined || input.filter.indexVersions.includes(entry.indexVersion))
      .map(([chunkId, entry]) => ({ chunkId, score: cosine(input.vector, entry.vector) }))
      .sort((left, right) => right.score - left.score || left.chunkId.localeCompare(right.chunkId));
    return hits.slice(0, input.limit).map(clone);
  }

  public deleteSource(input: { readonly ownerId: string; readonly sourceType: PersonalAIKnowledgeSourceType; readonly sourceId: string; readonly revisionId?: string | null | undefined }): void {
    for (const [chunkId, entry] of this.vectors) {
      if (entry.ownerId === input.ownerId && entry.sourceType === input.sourceType && entry.sourceId === input.sourceId && (input.revisionId === undefined || entry.revisionId === (input.revisionId ?? null))) this.vectors.delete(chunkId);
    }
  }

  public deleteOwner(input: { readonly ownerId: string }): void {
    for (const [chunkId, entry] of this.vectors) if (entry.ownerId === input.ownerId) this.vectors.delete(chunkId);
  }
}

/** Local generator used only for deterministic development. Production should
 * inject `AiGatewayPersonalAIGenerationGateway`, which routes through Phase 8. */
export class DeterministicPersonalAIGenerationGateway implements PersonalAIGenerationGateway {
  public generate(input: PersonalAIGenerationInput): PersonalAIGenerationResult {
    const answer = input.evidence.length === 0
      ? '我没有在当前授权范围内找到相关档案。'
      : `根据当前授权范围内的 ${input.evidence.length} 条档案证据，${input.evidence.slice(0, 3).map((item) => item.displayTitle).join('、')}与这个问题相关。`;
    return {
      answerText: answer,
      modelCode: 'LOCAL_PERSONAL_AI_V1',
      providerCode: 'LOCAL',
      inputTokens: tokenEstimate(input.question) + input.evidence.reduce((sum, item) => sum + tokenEstimate(item.excerptSafe), 0),
      outputTokens: tokenEstimate(answer),
      costFen: 0,
      latencyMs: 0,
    };
  }
}

/** Deterministic source fixture for local development/integration tests. It
 * implements the same explicit ports as production adapters and has no message
 * source or cross-user fallback. */
export class InMemoryPersonalAISourceReader implements PersonalAIArchiveReader {
  private readonly archive = new Map<string, PersonalAIArchiveRecord>();
  private readonly usage = new Map<string, PersonalAIUsageRecord>();

  public addArchive(record: PersonalAIArchiveRecord): void { this.archive.set(`${record.ownerId}:${record.sourceType}:${record.sourceId}:${record.truthLayer}:${record.revisionId ?? ''}`, clone(record)); }
  public addUsage(record: PersonalAIUsageRecord): void { this.usage.set(`${record.ownerId}:${record.sourceId}`, clone(record)); }
  public remove(input: { readonly ownerId: string; readonly sourceId: string }): void {
    for (const [key, record] of this.archive) if (record.ownerId === input.ownerId && record.sourceId === input.sourceId) this.archive.delete(key);
    for (const [key, record] of this.usage) if (record.ownerId === input.ownerId && record.sourceId === input.sourceId) this.usage.delete(key);
  }
  public read(input: PersonalAISourceReadInput): readonly PersonalAIArchiveRecord[] {
    return [...this.archive.values()].filter((record) => record.ownerId === input.principal.userId);
  }
  public readUsage(input: PersonalAISourceReadInput): readonly PersonalAIUsageRecord[] {
    return [...this.usage.values()].filter((record) => record.ownerId === input.principal.userId);
  }
  public readForUsage(input: PersonalAISourceReadInput): readonly PersonalAIUsageRecord[] { return this.readUsage(input); }
}

function defaultPreferences(now: string): PersonalAIPreferences {
  return { enabled: false, archiveMode: 'ARCHIVE_ONLY', defaultScope: 'NONE', includeHistoricalRevisions: false, updatedAt: now };
}

function publicSource(source: InternalSource): PersonalAIKnowledgeSource {
  return clone({
    sourceType: source.sourceType,
    sourceId: source.sourceId,
    canonicalSourceId: source.canonicalSourceId,
    truthLayer: source.truthLayer,
    revisionId: source.revisionId,
    occurredAt: source.occurredAt,
    createdAt: source.createdAt,
    updatedAt: source.updatedAt,
    visibility: source.visibility,
    status: source.status,
    title: source.title,
    tags: source.tags,
    indexVersion: source.indexVersion,
    indexStatus: source.indexStatus,
  });
}

export class PersonalAIService {
  private readonly runtime: PersonalAIRuntime;
  private readonly archiveReader: PersonalAIArchiveReader;
  private readonly usageReader: PersonalAIUsageReader;
  private readonly embeddingProvider: PersonalAIEmbeddingProvider;
  private readonly vectorProvider: PersonalAIVectorSearchProvider;
  private readonly generationGateway: PersonalAIGenerationGateway;
  private readonly entitlementResolver: PersonalAIEntitlementResolver;
  private readonly indexVersion: string;
  private readonly autoProcessIndexJobs: boolean;
  private readonly preferences = new Map<string, PersonalAIPreferences>();
  private readonly consents = new Map<string, { readonly version: string; readonly acceptedAt: string }>();
  /** Consent is an auditable privacy decision.  The current map is used for
   * authorization; this append-only local history powers the metadata-only
   * export foundation and will map to the durable consent-event table. */
  private readonly consentHistory = new Map<string, PersonalAIExportConsentHistoryEntry[]>();
  private readonly sources = new Map<string, InternalSource>();
  private readonly chunks = new Map<string, InternalChunk>();
  private readonly jobs = new Map<string, InternalJob>();
  private readonly queries = new Map<string, InternalQuery>();
  private readonly conversations = new Map<string, InternalConversation>();
  private readonly queryIdempotency = new Map<string, IdempotencyReceipt>();
  private readonly insights = new Map<string, { readonly ownerId: string; readonly insight: PersonalAIInsightInternal }>();
  private readonly exports = new Map<string, InternalExport>();
  private readonly indexLocks = new Set<string>();
  private readonly indexJobInputs = new Map<string, PersonalAISourceReadInput & { readonly includeHistoricalRevisions?: boolean | undefined }>();
  private readonly indexIdempotency = new Map<string, { readonly fingerprint: string; readonly jobId: string }>();
  private readonly indexJobTimes = new Map<string, number[]>();
  private readonly maxIndexJobsPerHour: number;
  private readonly maxIndexChunksPerJob: number;

  public constructor(options: PersonalAIServiceOptions = {}) {
    this.runtime = { ...defaultRuntime, ...options.runtime };
    const fixture = options.archiveReader as (PersonalAIArchiveReader & { readUsage?: PersonalAIUsageReader['read'] }) | undefined;
    this.archiveReader = options.archiveReader ?? { read: () => [] };
    this.usageReader = options.usageReader ?? (fixture?.readUsage === undefined ? { read: () => [] } : { read: fixture.readUsage.bind(fixture) });
    this.embeddingProvider = options.embeddingProvider ?? new DeterministicPersonalAIEmbeddingProvider();
    this.vectorProvider = options.vectorProvider ?? new InMemoryPersonalAIVectorSearchProvider();
    this.generationGateway = options.generationGateway ?? new DeterministicPersonalAIGenerationGateway();
    if (options.deploymentMode === 'PRODUCTION') {
      if (options.entitlementResolver === undefined) throw new Error('Personal AI production mode requires an actual-membership entitlement resolver.');
      if (options.archiveReader === undefined || options.usageReader === undefined) throw new Error('Personal AI production mode requires explicit owner-scoped archive and AI-usage readers.');
      if (options.embeddingProvider?.productionSafe !== true || options.vectorProvider?.productionSafe !== true) throw new Error('Personal AI production mode requires reviewed production embedding/vector providers.');
      if (options.generationGateway?.phase8Gateway !== true) throw new Error('Personal AI production mode requires a Phase 8 AI Gateway adapter.');
      assertPersonalAIAsyncIndexingDependencies(options.asyncIndexing);
      if (options.autoProcessIndexJobs !== false) {
        throw new Error('Personal AI production mode forbids synchronous in-process index execution.');
      }
      // This class intentionally remains the deterministic/local execution
      // engine.  It cannot honestly claim persistence while its maps are the
      // read source, so production is fail-closed until the async durable
      // service/repository composition owns every read and write.
      throw new Error('Personal AI production requires the durable async service; the local map engine cannot be started in production.');
    }
    this.entitlementResolver = options.entitlementResolver ?? new LocalDevelopmentPersonalAIEntitlementResolver();
    this.indexVersion = options.indexVersion ?? 'personal-ai-v1-local';
    this.autoProcessIndexJobs = options.autoProcessIndexJobs ?? true;
    this.maxIndexJobsPerHour = bounded(options.maxIndexJobsPerHour, 24, 1_000);
    this.maxIndexChunksPerJob = bounded(options.maxIndexChunksPerJob, 1_000, 100_000);
    const initial = options.initialPreferences;
    if (initial !== undefined) {
      this.preferences.set('__initial__', {
        ...defaultPreferences(this.runtime.now()),
        ...initial,
        updatedAt: initial.updatedAt ?? this.runtime.now(),
      });
    }
  }

  public getPreferences(principal: AuthenticatedPrincipal): PersonalAIPreferences {
    ensurePrincipal(principal);
    const existing = this.preferences.get(principal.userId) ?? this.preferences.get('__initial__') ?? defaultPreferences(this.runtime.now());
    if (!this.preferences.has(principal.userId)) this.preferences.set(principal.userId, clone(existing));
    return clone(existing);
  }

  public updatePreferences(principal: AuthenticatedPrincipal, input: {
    readonly enabled?: boolean | undefined;
    readonly archiveMode?: PersonalAIArchiveMode | undefined;
    readonly defaultScope?: PersonalAIContextScope | undefined;
    readonly includeHistoricalRevisions?: boolean | undefined;
  }): PersonalAIPreferences {
    ensurePrincipal(principal);
    if (Object.keys(input).length === 0) throw new PersonalAIError('VALIDATION', 'At least one preference is required.');
    const existing = this.getPreferences(principal);
    if (input.enabled === true && !this.hasConsent(principal)) throw new PersonalAIError('CONSENT_REQUIRED', 'Personal AI consent is required before indexing or retrieval.');
    const updated: PersonalAIPreferences = {
      ...existing,
      ...(input.enabled === undefined ? {} : { enabled: input.enabled }),
      ...(input.archiveMode === undefined ? {} : { archiveMode: input.archiveMode }),
      ...(input.defaultScope === undefined ? {} : { defaultScope: input.defaultScope }),
      ...(input.includeHistoricalRevisions === undefined ? {} : { includeHistoricalRevisions: input.includeHistoricalRevisions }),
      updatedAt: this.runtime.now(),
    };
    this.preferences.set(principal.userId, updated);
    return clone(updated);
  }

  public getConsent(principal: AuthenticatedPrincipal) {
    ensurePrincipal(principal);
    const current = this.consents.get(principal.userId);
    return {
      accepted: current !== undefined,
      version: current?.version ?? null,
      acceptedAt: current?.acceptedAt ?? null,
      providerDisclosure: '为了生成向量或回答，授权内容可能被发送到当前 AI Provider。你可以随时关闭并删除派生索引。',
    } as const;
  }

  public acceptConsent(principal: AuthenticatedPrincipal, version: string) {
    ensurePrincipal(principal);
    if (version.trim() === '' || version.length > 100) throw new PersonalAIError('VALIDATION', 'Consent version is invalid.');
    const consent = { version: version.trim(), acceptedAt: this.runtime.now() };
    this.consents.set(principal.userId, consent);
    const events = this.consentHistory.get(principal.userId) ?? [];
    this.consentHistory.set(principal.userId, [...events, { event: 'ACCEPTED', version: consent.version, occurredAt: consent.acceptedAt }]);
    return this.getConsent(principal);
  }

  private hasConsent(principal: AuthenticatedPrincipal): boolean { return this.consents.has(principal.userId); }

  public getPrivacy(principal: AuthenticatedPrincipal): PersonalAIPrivacyView {
    return { preferences: this.getPreferences(principal), consent: this.getConsent(principal), index: this.getIndexStatus(principal) };
  }

  public createConversation(principal: AuthenticatedPrincipal, scope: PersonalAIContextScope = 'NONE'): PersonalAIConversation {
    ensurePrincipal(principal);
    this.assertEntitlement(principal, 'PERSONAL_AI_ACCESS');
    const now = this.runtime.now();
    const conversation: InternalConversation = { id: this.runtime.id(), ownerId: principal.userId, currentScope: scope, createdAt: now, updatedAt: now, deletedAt: null };
    this.conversations.set(conversation.id, conversation);
    return this.publicConversation(conversation);
  }

  public listConversations(principal: AuthenticatedPrincipal): readonly PersonalAIConversation[] {
    ensurePrincipal(principal);
    return [...this.conversations.values()].filter((item) => item.ownerId === principal.userId && item.deletedAt === null).map((item) => this.publicConversation(item));
  }

  public deleteConversation(principal: AuthenticatedPrincipal, conversationId: string): PersonalAIConversation {
    const conversation = this.ownConversation(principal, conversationId);
    const deleted: InternalConversation = { ...conversation, deletedAt: conversation.deletedAt ?? this.runtime.now(), updatedAt: this.runtime.now() };
    this.conversations.set(conversationId, deleted);
    return this.publicConversation(deleted);
  }

  public listSources(principal: AuthenticatedPrincipal, input: PersonalAISourceReadInput): readonly PersonalAIKnowledgeSource[] {
    ensurePrincipal(principal);
    if (input.principal.userId !== principal.userId) throw new PersonalAIError('FORBIDDEN', 'Source principal mismatch.');
    // Source titles/tags/timestamps are still personal archive metadata.  This
    // endpoint must not become a consent/off bypass merely because it does not
    // return chunk text.
    this.assertEntitlement(principal, 'PERSONAL_AI_ACCESS');
    if (!this.hasConsent(principal)) throw new PersonalAIError('CONSENT_REQUIRED', 'Personal AI consent is required before reading indexed sources.');
    if (!this.getPreferences(principal).enabled) throw new PersonalAIError('FORBIDDEN', 'Personal AI is disabled.');
    this.validateSourceInput(input);
    return this.collectRecords(input).map((record) => this.sourceProjection(principal.userId, record));
  }

  public createIndexJob(principal: AuthenticatedPrincipal, input: PersonalAISourceReadInput & { readonly includeHistoricalRevisions?: boolean | undefined }): PersonalAIIndexJob {
    ensurePrincipal(principal);
    if (input.principal.userId !== principal.userId) throw new PersonalAIError('FORBIDDEN', 'Index job principal mismatch.');
    this.assertEntitlement(principal, 'PERSONAL_AI_ACCESS');
    this.assertEntitlement(principal, 'PERSONAL_AI_SEMANTIC_SEARCH');
    this.validateSourceInput(input);
    if (input.idempotencyKey !== undefined) ensureIdempotencyKey(input.idempotencyKey);
    if (!this.hasConsent(principal)) throw new PersonalAIError('CONSENT_REQUIRED', 'Personal AI consent is required before indexing.');
    if (!this.getPreferences(principal).enabled) throw new PersonalAIError('FORBIDDEN', 'Personal AI is disabled.');
    const sourceTypes = input.sourceTypes ?? scopeSourceTypes(input.scope);
    const requestFingerprint = hash({
      scope: input.scope,
      dateRange: input.dateRange ?? null,
      sourceTypes,
      selectedEntryIds: input.selectedEntryIds ?? [],
      selectedMediaIds: input.selectedMediaIds ?? [],
      includeHistoricalRevisions: input.includeHistoricalRevisions ?? this.getPreferences(principal).includeHistoricalRevisions,
    });
    if (input.idempotencyKey !== undefined) {
      const receiptKey = `${principal.userId}:${input.idempotencyKey}`;
      const receipt = this.indexIdempotency.get(receiptKey);
      if (receipt !== undefined) {
        if (receipt.fingerprint !== requestFingerprint) throw new PersonalAIError('CONFLICT', 'Index job idempotency key conflicts with an earlier request.');
        const replay = this.jobs.get(receipt.jobId);
        if (replay !== undefined) return this.publicJob(replay);
      }
    }
    const nowMs = Date.parse(this.runtime.now());
    const currentMs = Number.isFinite(nowMs) ? nowMs : Date.now();
    const recent = (this.indexJobTimes.get(principal.userId) ?? []).filter((timestamp) => currentMs - timestamp < 60 * 60 * 1_000);
    if (recent.length >= this.maxIndexJobsPerHour) throw new PersonalAIError('RATE_LIMITED', 'Index job rate limit exceeded.');
    recent.push(currentMs);
    this.indexJobTimes.set(principal.userId, recent);
    const now = this.runtime.now();
    const job: InternalJob = {
      id: this.runtime.id(),
      ownerId: principal.userId,
      scope: input.scope,
      ...(input.dateRange === undefined ? { dateRange: null } : { dateRange: clone(input.dateRange) }),
      sourceTypes: [...sourceTypes],
      status: 'PENDING',
      indexVersion: this.indexVersion,
      indexedSourceCount: 0,
      indexedChunkCount: 0,
      failedSourceCount: 0,
      createdAt: now,
      startedAt: null,
      completedAt: null,
      errorCode: null,
    };
    this.jobs.set(job.id, job);
    const storedInput: PersonalAISourceReadInput & { readonly includeHistoricalRevisions?: boolean | undefined } = {
      principal: clone(principal),
      scope: input.scope,
      ...(input.dateRange === undefined ? {} : { dateRange: clone(input.dateRange) }),
      sourceTypes: [...sourceTypes],
      ...(input.selectedEntryIds === undefined ? {} : { selectedEntryIds: [...input.selectedEntryIds] }),
      ...(input.selectedMediaIds === undefined ? {} : { selectedMediaIds: [...input.selectedMediaIds] }),
      ...(input.includeHistoricalRevisions === undefined ? {} : { includeHistoricalRevisions: input.includeHistoricalRevisions }),
    };
    this.indexJobInputs.set(job.id, storedInput);
    if (input.idempotencyKey !== undefined) this.indexIdempotency.set(`${principal.userId}:${input.idempotencyKey}`, { fingerprint: requestFingerprint, jobId: job.id });
    if (this.autoProcessIndexJobs) this.processIndexJob(principal, job.id, input);
    return this.publicJob(this.jobs.get(job.id)!);
  }

  public processIndexJob(principal: AuthenticatedPrincipal, jobId: string, input?: (PersonalAISourceReadInput & { readonly includeHistoricalRevisions?: boolean | undefined }) | undefined): PersonalAIIndexJob {
    ensurePrincipal(principal);
    const job = this.jobs.get(jobId);
    if (job === undefined || job.ownerId !== principal.userId) throw new PersonalAIError('NOT_FOUND', 'Personal AI index job was not found.');
    if (input !== undefined && input.principal.userId !== principal.userId) throw new PersonalAIError('FORBIDDEN', 'Index job principal mismatch.');
    this.assertEntitlement(principal, 'PERSONAL_AI_ACCESS');
    this.assertEntitlement(principal, 'PERSONAL_AI_SEMANTIC_SEARCH');
    if (!this.hasConsent(principal)) throw new PersonalAIError('CONSENT_REQUIRED', 'Personal AI consent is required before indexing.');
    if (!this.getPreferences(principal).enabled) throw new PersonalAIError('FORBIDDEN', 'Personal AI is disabled.');
    if (input?.idempotencyKey !== undefined) ensureIdempotencyKey(input.idempotencyKey);
    if (input !== undefined && input.scope !== job.scope) throw new PersonalAIError('CONFLICT', 'Index job scope cannot be changed during processing.');
    const storedInput = this.indexJobInputs.get(job.id);
    const lock = `${principal.userId}:${job.id}`;
    if (this.indexLocks.has(lock)) return this.publicJob(job);
    if (job.status === 'READY' || job.status === 'FAILED' || job.status === 'DELETED') return this.publicJob(job);
    this.indexLocks.add(lock);
    try {
      const started: InternalJob = { ...job, status: 'INDEXING', startedAt: this.runtime.now() };
      this.jobs.set(job.id, started);
      const sourceInput: PersonalAISourceReadInput = {
        ...(storedInput ?? {
          principal,
          scope: job.scope,
          ...(job.dateRange === null ? {} : { dateRange: job.dateRange }),
          sourceTypes: job.sourceTypes,
        }),
        principal,
      };
      const records = this.collectRecords(sourceInput, storedInput?.includeHistoricalRevisions ?? input?.includeHistoricalRevisions ?? this.getPreferences(principal).includeHistoricalRevisions);
      let indexedSourceCount = 0;
      let indexedChunkCount = 0;
      let failedSourceCount = 0;
      let limitExceeded = false;
      for (const record of records) {
        try {
          const estimatedChunks = splitSemantically(this.toInternalSource(principal.userId, record).text).length;
          if (indexedChunkCount + estimatedChunks > this.maxIndexChunksPerJob) {
            limitExceeded = true;
            failedSourceCount += 1;
            break;
          }
          const chunks = this.indexRecord(principal.userId, record);
          indexedSourceCount += record.status === 'ACTIVE' || record.status === undefined ? 1 : 0;
          indexedChunkCount += chunks;
        } catch {
          failedSourceCount += 1;
        }
      }
      const finalStatus: PersonalAIIndexStatus = limitExceeded || (failedSourceCount > 0 && indexedSourceCount === 0) ? 'FAILED' : 'READY';
      const completed: InternalJob = {
        ...started,
        status: finalStatus,
        indexedSourceCount,
        indexedChunkCount,
        failedSourceCount,
        completedAt: this.runtime.now(),
        errorCode: limitExceeded ? 'INDEX_CHUNK_LIMIT' : (failedSourceCount > 0 ? 'SOURCE_INDEX_FAILED' : null),
      };
      this.jobs.set(job.id, completed);
      return this.publicJob(completed);
    } finally {
      this.indexLocks.delete(lock);
    }
  }

  public listIndexJobs(principal: AuthenticatedPrincipal, options: { readonly cursor?: string | undefined; readonly limit?: number | undefined } = {}) {
    ensurePrincipal(principal);
    const limit = bounded(options.limit, 30, 100);
    const rows = [...this.jobs.values()].filter((job) => job.ownerId === principal.userId).sort((left, right) => right.createdAt.localeCompare(left.createdAt));
    const start = options.cursor === undefined ? 0 : Math.max(0, rows.findIndex((job) => job.id === options.cursor) + 1);
    const items = rows.slice(start, start + limit).map((job) => this.publicJob(job));
    return { items, nextCursor: rows[start + limit]?.id ?? null };
  }

  public getIndexStatus(principal: AuthenticatedPrincipal): PersonalAIIndexStatusView {
    ensurePrincipal(principal);
    const rows = [...this.sources.values()].filter((source) => source.ownerId === principal.userId && source.indexVersion === this.indexVersion && source.indexStatus === 'READY');
    const chunks = [...this.chunks.values()].filter((chunk) => chunk.ownerId === principal.userId && chunk.indexVersion === this.indexVersion && chunk.embeddingStatus === 'READY');
    const latestJob = [...this.jobs.values()].filter((job) => job.ownerId === principal.userId).sort((left, right) => right.createdAt.localeCompare(left.createdAt))[0];
    return {
      enabled: this.getPreferences(principal).enabled,
      status: latestJob?.status ?? (rows.length === 0 ? 'DELETED' : 'READY'),
      indexVersion: this.indexVersion,
      indexedSourceCount: rows.length,
      indexedChunkCount: chunks.length,
      lastIndexedAt: latestJob?.completedAt ?? null,
      embeddingProvider: this.embeddingProvider.name,
    };
  }

  public clearIndex(principal: AuthenticatedPrincipal): PersonalAIIndexStatusView {
    ensurePrincipal(principal);
    this.vectorProvider.deleteOwner({ ownerId: principal.userId });
    for (const [key, source] of this.sources) if (source.ownerId === principal.userId) this.sources.delete(key);
    for (const [key, chunk] of this.chunks) if (chunk.ownerId === principal.userId) this.chunks.delete(key);
    for (const [key, job] of this.jobs) if (job.ownerId === principal.userId) this.jobs.set(key, { ...job, status: 'DELETED', completedAt: this.runtime.now() });
    return this.getIndexStatus(principal);
  }

  public rebuildIndex(principal: AuthenticatedPrincipal, input: PersonalAISourceReadInput & { readonly includeHistoricalRevisions?: boolean | undefined }): PersonalAIIndexJob {
    this.clearIndex(principal);
    return this.createIndexJob(principal, input);
  }

  /** Called by Archive lifecycle events. Trash and permanent delete both
   * invalidate derived chunks immediately; the original remains untouched. */
  public invalidateSource(principal: AuthenticatedPrincipal, input: { readonly sourceType: PersonalAIKnowledgeSourceType; readonly sourceId: string }): void {
    ensurePrincipal(principal);
    this.invalidateOwnedSource(principal.userId, input);
  }

  /** Called only from an Archive post-commit/outbox composition.  The event
   * itself is body-free and cannot be submitted through the Personal AI HTTP
   * adapter; source access is re-read by the eventual index worker. */
  public handleTrustedArchiveLifecycle(event: ArchiveSourceLifecycleEvent): PersonalAITrustedArchiveLifecycleOutcome {
    const sourceType: PersonalAIKnowledgeSourceType = event.sourceType === 'ENTRY'
      ? 'LIFE'
      : event.sourceType === 'HISTORY'
        ? 'HISTORY'
        : event.sourceType === 'FITNESS'
          ? 'FITNESS'
          : 'DAILY_PACK';
    if (event.action === 'TRASHED' || event.action === 'DELETED') {
      this.invalidateOwnedSource(event.ownerId, { sourceType, sourceId: event.sourceId });
      return { action: event.action, sourceType, sourceId: event.sourceId, invalidated: true, queuedJobId: null, skipped: 'NONE' };
    }
    const principal: AuthenticatedPrincipal = {
      userId: event.ownerId,
      sessionId: `archive-lifecycle:${event.sourceId}:${event.revision}`,
      roles: [],
      issuedAt: event.changedAt,
    };
    try {
      const job = this.createIndexJob(principal, {
        principal,
        scope: 'SELECTED_ENTRIES',
        sourceTypes: [sourceType],
        selectedEntryIds: [event.sourceId],
        idempotencyKey: `archive:${event.action.toLowerCase()}:${event.sourceId}:${event.revision}`,
      });
      return { action: event.action, sourceType, sourceId: event.sourceId, invalidated: false, queuedJobId: job.id, skipped: 'NONE' };
    } catch (error) {
      // Archive must never fail or roll back Original data because a derived
      // index is disabled, not consented, or no longer entitled.  Unexpected
      // errors are allowed to surface to an outbox/worker adapter for retry.
      if (error instanceof PersonalAIError && (error.code === 'ENTITLEMENT_REQUIRED' || error.code === 'CONSENT_REQUIRED' || error.code === 'FORBIDDEN')) {
        return { action: event.action, sourceType, sourceId: event.sourceId, invalidated: false, queuedJobId: null, skipped: 'PERSONAL_AI_DISABLED_OR_UNAUTHORIZED' };
      }
      throw error;
    }
  }

  private invalidateOwnedSource(ownerId: string, input: { readonly sourceType: PersonalAIKnowledgeSourceType; readonly sourceId: string }): void {
    const affectedIds = new Set<string>([input.sourceId]);
    const affectedCanonicalIds = new Set<string>([input.sourceId]);
    // Discover canonical/Daily Pack relationships from both the current index
    // and the authoritative reader. This closes the window where an event only
    // invalidates one projection while a related aggregate remains searchable.
    const relatedRecords: (PersonalAIArchiveRecord | PersonalAIUsageRecord)[] = [];
    try {
      const readInput: PersonalAISourceReadInput = {
        principal: { userId: ownerId, sessionId: 'personal-ai-invalidation', roles: [], issuedAt: this.runtime.now() },
        scope: 'USER_SELECTED_ARCHIVE',
      };
      relatedRecords.push(...this.archiveReader.read(readInput), ...this.usageReader.read(readInput));
    } catch {
      // The retrieval-time reader recheck still fails closed if the adapter is
      // unavailable; in-memory relationships are handled below.
    }
    const allRelated = [
      ...[...this.sources.values()].filter((source) => source.ownerId === ownerId),
      ...relatedRecords
        .filter((record) => record.ownerId === ownerId && record.truthLayer !== 'AI_INSIGHT' && record.sourceType !== ('PRIVATE_MESSAGES' as PersonalAIKnowledgeSourceType))
        .map((record) => this.toInternalSource(ownerId, record)),
    ];
    for (const source of allRelated) {
      if (source.sourceId === input.sourceId || source.canonicalSourceId === input.sourceId || source.relatedSourceIds.includes(input.sourceId)) {
        affectedIds.add(source.sourceId);
        affectedCanonicalIds.add(source.canonicalSourceId);
      }
    }
    for (const source of allRelated) {
      if (affectedCanonicalIds.has(source.canonicalSourceId) || source.relatedSourceIds.some((id) => affectedIds.has(id))) {
        affectedIds.add(source.sourceId);
        affectedCanonicalIds.add(source.canonicalSourceId);
      }
    }
    for (const [key, chunk] of this.chunks) {
      if (chunk.ownerId !== ownerId) continue;
      if (affectedIds.has(chunk.sourceId) || affectedCanonicalIds.has(chunk.canonicalSourceId)) {
        this.vectorProvider.deleteSource({ ownerId, sourceType: chunk.sourceType, sourceId: chunk.sourceId });
        this.chunks.delete(key);
      }
    }
    for (const [key, source] of this.sources) {
      if (source.ownerId === ownerId && (affectedIds.has(source.sourceId) || affectedCanonicalIds.has(source.canonicalSourceId))) {
        this.vectorProvider.deleteSource({ ownerId, sourceType: source.sourceType, sourceId: source.sourceId });
        this.sources.set(key, { ...source, status: 'DELETED', indexStatus: 'DELETED' });
      }
    }
    this.vectorProvider.deleteSource({ ownerId, sourceType: input.sourceType, sourceId: input.sourceId });
  }

  public query(principal: AuthenticatedPrincipal, input: PersonalAIQueryInput, idempotencyKey: string): PersonalAIQueryResult {
    ensurePrincipal(principal);
    ensureIdempotencyKey(idempotencyKey);
    this.assertEntitlement(principal, 'PERSONAL_AI_ACCESS');
    const preferences = this.getPreferences(principal);
    if (!preferences.enabled) throw new PersonalAIError('FORBIDDEN', 'Personal AI is disabled.');
    if (!this.hasConsent(principal)) throw new PersonalAIError('CONSENT_REQUIRED', 'Personal AI consent is required before retrieval.');
    this.validateQuery(input);
    if ((input.searchMode ?? 'HYBRID') !== 'KEYWORD') this.assertEntitlement(principal, 'PERSONAL_AI_SEMANTIC_SEARCH');
    if ((input.archiveMode ?? preferences.archiveMode) === 'ARCHIVE_PLUS_GENERAL') this.assertEntitlement(principal, 'PERSONAL_AI_ADVANCED_REVIEW');
    if (this.getPreferences(principal).includeHistoricalRevisions) this.assertEntitlement(principal, 'PERSONAL_AI_EXTENDED_HISTORY');
    let conversationId: string | null = null;
    if (input.conversationId !== undefined) {
      const conversation = this.ownConversation(principal, input.conversationId);
      if (conversation.deletedAt !== null) throw new PersonalAIError('NOT_FOUND', 'Personal AI conversation was not found.');
      // Re-authorize every turn. A scope change replaces the conversation's
      // current scope; previous evidence is never implicitly carried forward.
      const updatedConversation: InternalConversation = { ...conversation, currentScope: input.scope, updatedAt: this.runtime.now() };
      this.conversations.set(conversation.id, updatedConversation);
      conversationId = conversation.id;
    }
    const key = `${principal.userId}:${idempotencyKey}`;
    const fingerprint = hash(input);
    const replay = this.queryIdempotency.get(key);
    if (replay !== undefined) {
      if (replay.fingerprint !== fingerprint) throw new PersonalAIError('CONFLICT', 'Query idempotency key conflicts with an earlier request.');
      return clone(replay.result as PersonalAIQueryResult);
    }
    const started = Date.now();
    const ranked = this.retrieve(principal, input);
    const budget = (input.contextBudgetTokens ?? 2_000) * 4;
    const citations: PersonalAICitation[] = [];
    let used = 0;
    for (const hit of ranked) {
      const citation = this.citationForHit(principal.userId, hit.chunkId, hit.score);
      if (citation === null || !this.sourceStillAuthorized(principal, citation) || used + citation.excerptSafe.length > budget) continue;
      citations.push(citation);
      used += citation.excerptSafe.length;
    }
    const evidenceKind: PersonalAIConfidenceKind = citations.length === 0 ? 'NO_EVIDENCE' : citations.length === 1 ? 'DIRECT_EVIDENCE' : 'INFERRED';
    const archiveMode = input.archiveMode ?? preferences.archiveMode;
    const generated = citations.length === 0 && archiveMode === 'ARCHIVE_ONLY'
      ? { answerText: '我没有在当前授权范围内找到相关档案。', modelCode: null, providerCode: null, inputTokens: tokenEstimate(input.question), outputTokens: 0, costFen: 0, latencyMs: null }
      : this.generationGateway.generate({ principal, archiveMode, question: input.question, evidence: citations });
    const result: PersonalAIQueryResult = {
      queryId: this.runtime.id(),
      conversationId,
      status: citations.length === 0 ? (archiveMode === 'ARCHIVE_ONLY' ? 'NO_EVIDENCE' : 'SUCCEEDED') : 'SUCCEEDED',
      answerText: generated.answerText,
      answer: generated.answerText,
      archiveMode,
      scope: input.scope,
      evidenceKind,
      citations: citations.map(clone),
      retrievedChunkCount: ranked.length,
      retrievalLatencyMs: Date.now() - started,
      generationLatencyMs: generated.latencyMs,
      usage: {
        modelCode: generated.modelCode,
        providerCode: generated.providerCode,
        inputTokens: generated.inputTokens,
        outputTokens: generated.outputTokens,
        totalTokens: generated.inputTokens + generated.outputTokens,
        costFen: generated.costFen,
      },
      createdAt: this.runtime.now(),
    };
    this.queries.set(result.queryId, { ownerId: principal.userId, questionHash: hash(input.question), result: clone(result) });
    this.queryIdempotency.set(key, { fingerprint, result: clone(result) });
    return clone(result);
  }

  public getQuery(principal: AuthenticatedPrincipal, queryId: string): PersonalAIQueryResult {
    ensurePrincipal(principal);
    const item = this.queries.get(queryId);
    if (item === undefined || item.ownerId !== principal.userId) throw new PersonalAIError('NOT_FOUND', 'Personal AI query was not found.');
    return this.authorizedResult(principal, item.result);
  }

  private ownConversation(principal: AuthenticatedPrincipal, conversationId: string): InternalConversation {
    const conversation = this.conversations.get(conversationId);
    if (conversation === undefined || conversation.ownerId !== principal.userId) throw new PersonalAIError('NOT_FOUND', 'Personal AI conversation was not found.');
    return conversation;
  }

  private publicConversation(conversation: InternalConversation): PersonalAIConversation {
    return {
      id: conversation.id,
      currentScope: conversation.currentScope,
      createdAt: conversation.createdAt,
      updatedAt: conversation.updatedAt,
      deletedAt: conversation.deletedAt,
    };
  }

  private sourceStillAuthorized(principal: AuthenticatedPrincipal, citation: PersonalAICitation): boolean {
    const ownerId = principal.userId;
    const sourceInput: PersonalAISourceReadInput = { principal, scope: 'USER_SELECTED_ARCHIVE' };
    let records: readonly (PersonalAIArchiveRecord | PersonalAIUsageRecord)[];
    try {
      const archive = this.archiveReader.read(sourceInput);
      const usage = this.usageReader.read(sourceInput);
      records = [...archive, ...usage].filter((record) => record.ownerId === ownerId && record.sourceType !== ('PRIVATE_MESSAGES' as PersonalAIKnowledgeSourceType));
    } catch {
      // A failed authorization read must fail closed rather than trusting the
      // last in-memory index state.
      return false;
    }
    const matching = records.filter((record) =>
      record.truthLayer !== 'AI_INSIGHT' &&
      record.sourceType === citation.sourceType &&
      record.sourceId === citation.sourceId &&
      (record.revisionId ?? null) === (citation.revisionId ?? null) &&
      (record.status === undefined || record.status === 'ACTIVE'),
    );
    if (matching.length === 0) return false;
    return matching.every((record) => (record.relatedSourceIds ?? []).every((relatedId) => records.some((candidate) =>
      candidate.sourceId === relatedId && (candidate.status === undefined || candidate.status === 'ACTIVE'),
    )));
  }

  private authorizedResult(principal: AuthenticatedPrincipal, result: PersonalAIQueryResult): PersonalAIQueryResult {
    const ownerId = principal.userId;
    const citations = result.citations.filter((citation) => [...this.chunks.values()].some((chunk) =>
      chunk.ownerId === ownerId &&
      chunk.sourceType === citation.sourceType &&
      chunk.sourceId === citation.sourceId &&
      chunk.revisionId === citation.revisionId &&
      chunk.embeddingStatus === 'READY' &&
      [...this.sources.values()].some((source) => source.ownerId === ownerId && source.sourceType === citation.sourceType && source.sourceId === citation.sourceId && source.status === 'ACTIVE'),
    ) && this.sourceStillAuthorized(principal, citation));
    if (citations.length === result.citations.length) return clone(result);
    const redacted = '当前授权范围内的档案证据已发生变化，无法继续展示这条回答。';
    return clone({
      ...result,
      answerText: redacted,
      answer: redacted,
      citations,
      status: 'NO_EVIDENCE',
      evidenceKind: 'NO_EVIDENCE',
      retrievedChunkCount: Math.min(result.retrievedChunkCount, citations.length),
    });
  }

  private authorizedInsight(principal: AuthenticatedPrincipal, insight: PersonalAIInsightInternal): PersonalAIInsightInternal {
    const citations = insight.citations.filter((citation) => this.authorizedResult(principal, {
      queryId: insight.queryId,
      conversationId: null,
      status: 'SUCCEEDED',
      answerText: insight.content,
      answer: insight.content,
      archiveMode: 'ARCHIVE_ONLY',
      scope: 'USER_SELECTED_ARCHIVE',
      evidenceKind: 'DIRECT_EVIDENCE',
      citations: [citation],
      retrievedChunkCount: 1,
      retrievalLatencyMs: 0,
      generationLatencyMs: null,
      usage: { modelCode: null, providerCode: null, inputTokens: 0, outputTokens: 0, totalTokens: 0, costFen: 0 },
      createdAt: insight.createdAt,
    }).citations.length > 0);
    const invalidated = citations.length !== insight.citations.length;
    return clone({ ...insight, content: invalidated ? '当前授权范围内的档案证据已发生变化，无法继续展示这条洞察。' : insight.content, citations });
  }

  public listQueries(principal: AuthenticatedPrincipal, options: { readonly cursor?: string | undefined; readonly limit?: number | undefined } = {}): PersonalAIQueryPage {
    ensurePrincipal(principal);
    const limit = bounded(options.limit, 30, 100);
    const rows = [...this.queries.values()].filter((item) => item.ownerId === principal.userId).map((item) => this.authorizedResult(principal, item.result)).sort((left, right) => right.createdAt.localeCompare(left.createdAt));
    const start = options.cursor === undefined ? 0 : Math.max(0, rows.findIndex((row) => row.queryId === options.cursor) + 1);
    return { items: rows.slice(start, start + limit).map(clone), nextCursor: rows[start + limit]?.queryId ?? null };
  }

  public listCitations(principal: AuthenticatedPrincipal, queryId: string) {
    return { queryId, items: [...this.getQuery(principal, queryId).citations], nextCursor: null };
  }

  public relatedMemories(principal: AuthenticatedPrincipal, input: { readonly sourceType: PersonalAIKnowledgeSourceType; readonly sourceId: string; readonly limit?: number | undefined }) {
    ensurePrincipal(principal);
    this.assertEntitlement(principal, 'PERSONAL_AI_ACCESS');
    this.assertEntitlement(principal, 'PERSONAL_AI_SEMANTIC_SEARCH');
    if (!this.hasConsent(principal)) throw new PersonalAIError('CONSENT_REQUIRED', 'Personal AI consent is required before related memories.');
    if (!this.getPreferences(principal).enabled) throw new PersonalAIError('FORBIDDEN', 'Personal AI is disabled.');
    const limit = bounded(input.limit, 8, 50);
    const seed = [...this.chunks.values()].find((chunk) => chunk.ownerId === principal.userId && chunk.embeddingStatus === 'READY' && chunk.indexVersion === this.indexVersion && chunk.sourceType === input.sourceType && chunk.sourceId === input.sourceId);
    if (seed === undefined) return { sourceType: input.sourceType, sourceId: input.sourceId, items: [], nextCursor: null };
    const source = [...this.sources.values()].find((item) => item.ownerId === principal.userId && item.sourceType === input.sourceType && item.sourceId === input.sourceId);
    // Never use an orphaned/deleted chunk as a semantic seed.  In particular,
    // this must fail closed if a lifecycle invalidation is delayed or an
    // authoritative source reader denies the source after it was indexed.
    if (source === undefined || source.status !== 'ACTIVE' || !this.chunkStillAuthorized(principal, seed)) {
      return { sourceType: input.sourceType, sourceId: input.sourceId, items: [], nextCursor: null };
    }
    const hits = this.vectorProvider.search({ ownerId: principal.userId, vector: this.embeddingProvider.embed({ text: seed.text }), limit: Math.min(100, limit + 20), filter: { statuses: ['ACTIVE'], indexVersions: [this.indexVersion] } });
    const rows: PersonalAICitation[] = [];
    for (const hit of hits) {
      const chunk = this.chunks.get(hit.chunkId);
      if (chunk === undefined || chunk.sourceId === input.sourceId || (source !== undefined && chunk.canonicalSourceId === source.canonicalSourceId)) continue;
      const citation = this.citationForHit(principal.userId, hit.chunkId, hit.score);
      if (citation !== null && this.sourceStillAuthorized(principal, citation)) rows.push(citation);
      if (rows.length >= limit) break;
    }
    return { sourceType: input.sourceType, sourceId: input.sourceId, items: rows, nextCursor: null };
  }

  /** Personal AI requests are currently completed synchronously by the local
   * foundation. This explicit route is retained so a future worker can mark a
   * queued request cancelled without widening the consumer contract. */
  public cancelQuery(principal: AuthenticatedPrincipal, queryId: string) {
    this.getQuery(principal, queryId);
    return { queryId, cancelled: false, status: 'ALREADY_COMPLETED' as const };
  }

  public saveInsight(principal: AuthenticatedPrincipal, queryId: string, title: string | null = null) {
    const result = this.getQuery(principal, queryId);
    const insight = {
      id: this.runtime.id(),
      queryId,
      title,
      content: result.answerText,
      citations: result.citations.map(clone),
      truthLayer: 'AI_INSIGHT' as const,
      createdAt: this.runtime.now(),
      deletedAt: null,
    };
    this.insights.set(insight.id, { ownerId: principal.userId, insight });
    return clone(insight);
  }

  public listInsights(principal: AuthenticatedPrincipal) {
    ensurePrincipal(principal);
    return [...this.insights.values()]
      .filter((item) => item.ownerId === principal.userId && item.insight.deletedAt === null)
      .map((item) => this.authorizedInsight(principal, item.insight));
  }

  public deleteInsight(principal: AuthenticatedPrincipal, insightId: string): void {
    const item = this.insights.get(insightId);
    if (item === undefined || item.ownerId !== principal.userId) throw new PersonalAIError('NOT_FOUND', 'AI insight was not found.');
    this.insights.set(insightId, { ...item, insight: { ...item.insight, deletedAt: this.runtime.now() } });
  }

  public clearInsights(principal: AuthenticatedPrincipal): { readonly deletedCount: number } {
    ensurePrincipal(principal);
    let deletedCount = 0;
    for (const [id, item] of this.insights) {
      if (item.ownerId === principal.userId && item.insight.deletedAt === null) {
        this.insights.set(id, { ...item, insight: { ...item.insight, deletedAt: this.runtime.now() } });
        deletedCount += 1;
      }
    }
    return { deletedCount };
  }

  /**
   * Starts a self-only metadata export.  Personal AI is derived data: this
   * result deliberately contains neither original Archive content nor prompt,
   * answer, insight content, chunk text, embedding, vector, or provider
   * credential.  Local/test composition completes the small manifest inline;
   * the durable production worker uses the same immutable job/result shape.
   */
  public createExport(principal: AuthenticatedPrincipal, request: PersonalAIExportRequest = {}): PersonalAIExportStatusView {
    ensurePrincipal(principal);
    const includeConversations = request.includeConversations ?? false;
    const includeDeletedInsights = request.includeDeletedInsights ?? false;
    const requestedSections: PersonalAIExportSection[] = [
      'PREFERENCES',
      'CONSENT_HISTORY',
      'INDEX_MANIFEST',
      'INSIGHT_METADATA',
      'CITATION_REFERENCES',
      ...(includeConversations ? ['CONVERSATION_METADATA' as const] : []),
    ];
    const now = this.runtime.now();
    const job: PersonalAIExportJob = {
      id: this.runtime.id(),
      status: 'PENDING',
      format: 'JSON',
      schemaVersion: 'mezip.personal-ai.export.v1',
      requestedSections,
      includeConversations,
      includeDeletedInsights,
      requestedAt: now,
      startedAt: null,
      completedAt: null,
      expiresAt: null,
      errorCode: null,
    };
    this.exports.set(job.id, { ownerId: principal.userId, job, result: null });
    return this.processExport(principal, job.id);
  }

  public getExport(principal: AuthenticatedPrincipal, exportId: string): PersonalAIExportStatusView {
    ensurePrincipal(principal);
    const exported = this.exports.get(exportId);
    if (exported === undefined || exported.ownerId !== principal.userId) throw new PersonalAIError('NOT_FOUND', 'Personal AI export was not found.');
    return clone({ job: exported.job, result: exported.result });
  }

  public listExports(principal: AuthenticatedPrincipal, options: { readonly cursor?: string | undefined; readonly limit?: number | undefined } = {}) {
    ensurePrincipal(principal);
    const limit = bounded(options.limit, 30, 100);
    const rows = [...this.exports.values()]
      .filter((item) => item.ownerId === principal.userId)
      .sort((left, right) => right.job.requestedAt.localeCompare(left.job.requestedAt));
    const start = options.cursor === undefined ? 0 : Math.max(0, rows.findIndex((item) => item.job.id === options.cursor) + 1);
    return {
      items: rows.slice(start, start + limit).map((item) => clone(item.job)),
      nextCursor: rows[start + limit]?.job.id ?? null,
    };
  }

  private processExport(principal: AuthenticatedPrincipal, exportId: string): PersonalAIExportStatusView {
    const stored = this.exports.get(exportId);
    if (stored === undefined || stored.ownerId !== principal.userId) throw new PersonalAIError('NOT_FOUND', 'Personal AI export was not found.');
    if (stored.job.status === 'READY' || stored.job.status === 'FAILED' || stored.job.status === 'DELETED') return clone({ job: stored.job, result: stored.result });
    const started: PersonalAIExportJob = { ...stored.job, status: 'PROCESSING', startedAt: this.runtime.now() };
    this.exports.set(exportId, { ...stored, job: started });
    try {
      const sources = [...this.sources.values()]
        .filter((source) => source.ownerId === principal.userId)
        .sort((left, right) => left.createdAt.localeCompare(right.createdAt))
        .map((source) => ({
          sourceType: source.sourceType,
          sourceId: source.sourceId,
          canonicalSourceId: source.canonicalSourceId,
          truthLayer: source.truthLayer === 'AI_INSIGHT' ? 'ORIGINAL' as const : source.truthLayer,
          revisionId: source.revisionId,
          occurredAt: source.occurredAt,
          status: source.status,
          indexStatus: source.indexStatus,
          indexVersion: source.indexVersion,
        }));

      const citationReferences: PersonalAIExportCitationReference[] = [];
      const citationIds = new Set<string>();
      const addCitation = (citation: PersonalAICitation, queryId: string | null, insightId: string | null): void => {
        // Re-check through the Archive/usage source reader.  A historical
        // query must not make a trashed/deleted source reappear in export.
        if (!this.sourceStillAuthorized(principal, citation)) return;
        const key = `${queryId ?? ''}:${insightId ?? ''}:${citation.citationId}`;
        if (citationIds.has(key)) return;
        citationIds.add(key);
        citationReferences.push({
          citationId: citation.citationId,
          queryId,
          insightId,
          sourceType: citation.sourceType,
          sourceId: citation.sourceId,
          revisionId: citation.revisionId,
          occurredAt: citation.occurredAt,
          truthLayer: citation.truthLayer === 'AI_INSIGHT' ? 'ORIGINAL' : citation.truthLayer,
          relevanceScore: citation.relevanceScore,
        });
      };
      for (const query of this.queries.values()) {
        if (query.ownerId !== principal.userId) continue;
        for (const citation of query.result.citations) addCitation(citation, query.result.queryId, null);
      }

      const insights = [...this.insights.values()]
        .filter((item) => item.ownerId === principal.userId && (started.includeDeletedInsights || item.insight.deletedAt === null))
        .sort((left, right) => left.insight.createdAt.localeCompare(right.insight.createdAt));
      const insightMetadata: PersonalAIExportInsightMetadata[] = insights.map(({ insight }) => {
        const available = insight.citations.filter((citation) => this.sourceStillAuthorized(principal, citation));
        for (const citation of available) addCitation(citation, null, insight.id);
        return {
          id: insight.id,
          queryId: insight.queryId,
          title: insight.title,
          truthLayer: 'AI_INSIGHT',
          citationIds: available.map((citation) => citation.citationId),
          createdAt: insight.createdAt,
          deletedAt: insight.deletedAt,
        };
      });
      const conversations: PersonalAIExportConversationMetadata[] = started.includeConversations
        ? [...this.conversations.values()]
          .filter((item) => item.ownerId === principal.userId)
          .sort((left, right) => left.createdAt.localeCompare(right.createdAt))
          .map((item) => ({ id: item.id, currentScope: item.currentScope, createdAt: item.createdAt, updatedAt: item.updatedAt, deletedAt: item.deletedAt }))
        : [];
      const result: PersonalAIExportResult = {
        exportId,
        format: 'JSON',
        schemaVersion: 'mezip.personal-ai.export.v1',
        exportedAt: this.runtime.now(),
        includedSections: started.requestedSections,
        excludedDataCategories: [...personalAiExportExcludedDataCategories],
        preferences: this.getPreferences(principal),
        consentHistory: [...(this.consentHistory.get(principal.userId) ?? [])],
        indexManifest: { current: this.getIndexStatus(principal), sources },
        insights: insightMetadata,
        citationReferences,
        conversations,
      };
      const ready: PersonalAIExportJob = { ...started, status: 'READY', completedAt: this.runtime.now() };
      this.exports.set(exportId, { ownerId: principal.userId, job: ready, result });
      return clone({ job: ready, result });
    } catch {
      const failed: PersonalAIExportJob = { ...started, status: 'FAILED', completedAt: this.runtime.now(), errorCode: 'EXPORT_FAILED' };
      this.exports.set(exportId, { ownerId: principal.userId, job: failed, result: null });
      return clone({ job: failed, result: null });
    }
  }

  private assertEntitlement(principal: AuthenticatedPrincipal, entitlement: PersonalAIAccessEntitlementCode): void {
    if (!this.entitlementResolver.has(principal, entitlement)) throw new PersonalAIError('ENTITLEMENT_REQUIRED', 'Personal AI access requires a server-authorized entitlement.');
  }

  private validateQuery(input: PersonalAIQueryInput): void {
    if (input.question.trim() === '') throw new PersonalAIError('VALIDATION', 'question is required.');
    if (input.scope === 'DATE_RANGE' && input.dateRange === undefined) throw new PersonalAIError('VALIDATION', 'DATE_RANGE requires dateRange.');
    if ((input.scope === 'SELECTED_ENTRY' || input.scope === 'SELECTED_ENTRIES') && (input.selectedEntryIds?.length ?? 0) === 0) throw new PersonalAIError('VALIDATION', 'Selected entry scope requires selectedEntryIds.');
    if (input.scope === 'SELECTED_MEDIA' && (input.selectedMediaIds?.length ?? 0) === 0) throw new PersonalAIError('VALIDATION', 'Selected media scope requires selectedMediaIds.');
    if (input.dateRange !== undefined) {
      parseDate(input.dateRange.from, 'dateRange.from');
      parseDate(input.dateRange.to, 'dateRange.to');
      if (input.dateRange.to < input.dateRange.from) throw new PersonalAIError('VALIDATION', 'dateRange.to must not precede dateRange.from.');
    }
  }

  private validateSourceInput(input: PersonalAISourceReadInput): void {
    if (input.scope === 'DATE_RANGE' && input.dateRange === undefined) throw new PersonalAIError('VALIDATION', 'DATE_RANGE requires dateRange.');
    if ((input.scope === 'SELECTED_ENTRY' || input.scope === 'SELECTED_ENTRIES') && (input.selectedEntryIds?.length ?? 0) === 0) throw new PersonalAIError('VALIDATION', 'Selected entry scope requires selectedEntryIds.');
    if (input.scope === 'SELECTED_MEDIA' && (input.selectedMediaIds?.length ?? 0) === 0) throw new PersonalAIError('VALIDATION', 'Selected media scope requires selectedMediaIds.');
    if (input.dateRange !== undefined) {
      parseDate(input.dateRange.from, 'dateRange.from');
      parseDate(input.dateRange.to, 'dateRange.to');
      if (input.dateRange.to < input.dateRange.from) throw new PersonalAIError('VALIDATION', 'dateRange.to must not precede dateRange.from.');
    }
  }

  private collectRecords(input: PersonalAISourceReadInput, includeHistoricalRevisions = false): readonly (PersonalAIArchiveRecord | PersonalAIUsageRecord)[] {
    ensurePrincipal(input.principal);
    const scopeTypes = scopeSourceTypes(input.scope);
    if (input.scope === 'NONE') return [];
    const requested = input.scope === 'USER_SELECTED_ARCHIVE'
      ? (input.sourceTypes === undefined || input.sourceTypes.length === 0 ? scopeTypes : input.sourceTypes)
      : (input.sourceTypes === undefined || input.sourceTypes.length === 0 ? scopeTypes : input.sourceTypes.filter((type) => scopeTypes.includes(type)));
    const effectiveRange = input.scope === 'CURRENT_DAY' ? input.dateRange ?? utcDayRange(this.runtime.now()) : input.dateRange;
    const archive = this.archiveReader.read(input).filter((record) => record.ownerId === input.principal.userId);
    const usage = requested.includes('AI_USAGE') ? this.usageReader.read(input).filter((record) => record.ownerId === input.principal.userId) : [];
    const records = [...archive, ...usage].filter((record) => {
      if (record.sourceType === ('PRIVATE_MESSAGES' as PersonalAIKnowledgeSourceType)) return false;
      // AI Insights are a separate, derived truth layer.  They may be saved
      // and cited, but never become archive evidence or a RAG source.
      if (record.truthLayer === 'AI_INSIGHT') return false;
      if (!requested.includes(record.sourceType)) return false;
      if (!dateRangeMatches(record.occurredAt, effectiveRange)) return false;
      if ((input.scope === 'SELECTED_ENTRY' || input.scope === 'SELECTED_ENTRIES') && !(input.selectedEntryIds ?? []).includes(record.sourceId)) return false;
      if (input.scope === 'SELECTED_MEDIA' && !(input.selectedMediaIds ?? []).includes(record.sourceId)) return false;
      return true;
    });
    const linkedCanonicalIds = new Set(records.flatMap((record) => record.relatedSourceIds ?? []));
    const canonical = records
      .filter((record) => !(record.sourceType === 'DAILY_PACK' && (record.relatedSourceIds ?? []).some((id) => linkedCanonicalIds.has(id) && records.some((candidate) => candidate.sourceId === id && candidate.sourceType !== 'DAILY_PACK'))))
      .map((record) => ({ ...record, canonicalSourceId: record.canonicalSourceId ?? record.sourceId }));
    const withoutTimelineDuplicates = canonical.filter((record) => record.sourceType !== 'TIMELINE' || !canonical.some((candidate) => candidate.sourceType !== 'TIMELINE' && candidate.canonicalSourceId === record.canonicalSourceId));
    if (includeHistoricalRevisions) return withoutTimelineDuplicates;
    const latest = new Map<string, PersonalAIArchiveRecord | PersonalAIUsageRecord>();
    for (const record of withoutTimelineDuplicates) {
      const key = `${record.canonicalSourceId ?? record.sourceId}:${record.truthLayer === 'PUBLISHED_SNAPSHOT' ? 'PUBLISHED_SNAPSHOT' : 'CURRENT_CONTENT'}`;
      const previous = latest.get(key);
      if (previous === undefined || record.updatedAt > previous.updatedAt || revisionNumberOf(record) > revisionNumberOf(previous)) latest.set(key, record);
    }
    return [...latest.values()];
  }

  private sourceProjection(ownerId: string, record: PersonalAIArchiveRecord | PersonalAIUsageRecord): PersonalAIKnowledgeSource {
    const source = this.toInternalSource(ownerId, record);
    return publicSource(source);
  }

  private toInternalSource(ownerId: string, record: PersonalAIArchiveRecord | PersonalAIUsageRecord): InternalSource {
    const metadata = record.metadata ?? {};
    const metadataText = Object.entries(metadata)
      .filter(([, value]) => value !== null)
      .map(([key, value]) => `${key}: ${String(value)}`)
      .join('; ');
    const structuredPrefix = record.sourceType === 'AI_USAGE'
      ? 'AI usage aggregate'
      : record.sourceType === 'FITNESS'
        ? 'Fitness record'
        : record.sourceType === 'STEPS'
          ? 'Steps record'
          : '';
    const text = [structuredPrefix, record.title ?? '', record.text ?? '', ...(record.tags ?? []), metadataText].filter(Boolean).join('\n');
    return {
      sourceType: record.sourceType,
      sourceId: record.sourceId,
      canonicalSourceId: record.canonicalSourceId ?? record.sourceId,
      truthLayer: record.truthLayer,
      revisionId: record.revisionId ?? null,
      occurredAt: record.occurredAt,
      createdAt: record.createdAt,
      updatedAt: record.updatedAt,
      visibility: record.visibility ?? (record.truthLayer === 'PUBLISHED_SNAPSHOT' ? 'SNAPSHOT' : 'PRIVATE'),
      status: record.status ?? 'ACTIVE',
      title: record.title ?? null,
      tags: [...(record.tags ?? [])],
      indexVersion: this.indexVersion,
      indexStatus: record.status === 'ACTIVE' || record.status === undefined ? 'READY' : 'DELETED',
      ownerId,
      text,
      metadata,
      relatedSourceIds: [...(record.relatedSourceIds ?? [])],
    };
  }

  private indexRecord(ownerId: string, record: PersonalAIArchiveRecord | PersonalAIUsageRecord): number {
    const internal = this.toInternalSource(ownerId, record);
    // Defense in depth for callers that bypass collectRecords (for example a
    // future worker): generated Insights can never be indexed as source truth.
    if (internal.truthLayer === 'AI_INSIGHT') return 0;
    const sourceKey = `${ownerId}:${internal.sourceType}:${internal.sourceId}:${internal.truthLayer}:${internal.revisionId ?? ''}`;
    if (internal.status !== 'ACTIVE') {
      // A trash/delete reindex is itself a deletion propagation event.  Do not
      // merely hide stale vectors at retrieval time: remove every revision's
      // derived chunks/vector entries for the source and mark cached source
      // projections non-active as well.
      this.vectorProvider.deleteSource({ ownerId, sourceType: internal.sourceType, sourceId: internal.sourceId });
      for (const [key, chunk] of this.chunks) {
        if (chunk.ownerId === ownerId && chunk.sourceType === internal.sourceType && chunk.sourceId === internal.sourceId) this.chunks.delete(key);
      }
      for (const [key, source] of this.sources) {
        if (source.ownerId === ownerId && source.sourceType === internal.sourceType && source.sourceId === internal.sourceId) {
          this.sources.set(key, { ...source, status: internal.status, indexStatus: 'DELETED' });
        }
      }
      this.sources.set(sourceKey, internal);
      return 0;
    }
    this.sources.set(sourceKey, internal);
    const sections = splitSemantically(internal.text);
    const existing = [...this.chunks.entries()]
      .filter(([, chunk]) => chunk.ownerId === ownerId && chunk.sourceType === internal.sourceType && chunk.sourceId === internal.sourceId && chunk.revisionId === internal.revisionId && chunk.indexVersion === this.indexVersion)
      .sort((left, right) => left[1].chunkIndex - right[1].chunkIndex);
    const sectionHashes = sections.map((text) => hash(text));
    const reusable = existing.length === sections.length && existing.every(([, chunk], index) => chunk.contentHash === sectionHashes[index] && chunk.embeddingStatus === 'READY');
    if (reusable) {
      // Keep the expensive embedding/vector write out of unchanged records,
      // while refreshing non-semantic source metadata on reused chunks.
      existing.forEach(([key, chunk]) => this.chunks.set(key, { ...chunk, canonicalSourceId: internal.canonicalSourceId, truthLayer: internal.truthLayer, occurredAt: internal.occurredAt, tags: internal.tags }));
      return 0;
    }
    this.vectorProvider.deleteSource({ ownerId, sourceType: internal.sourceType, sourceId: internal.sourceId, revisionId: internal.revisionId });
    for (const [key, chunk] of this.chunks) {
      if (chunk.ownerId === ownerId && chunk.sourceType === internal.sourceType && chunk.sourceId === internal.sourceId && chunk.revisionId === internal.revisionId) this.chunks.delete(key);
    }
    let count = 0;
    sections.forEach((text, chunkIndex) => {
      const contentHash = sectionHashes[chunkIndex] ?? hash(text);
      const chunkId = `${hash(ownerId)}|${internal.sourceType}|${internal.sourceId}|${hash(`${internal.revisionId ?? ''}:${this.indexVersion}:${chunkIndex}:${contentHash}`)}`;
      const chunk: InternalChunk = {
        chunkId,
        ownerId,
        sourceType: internal.sourceType,
        sourceId: internal.sourceId,
        canonicalSourceId: internal.canonicalSourceId,
        truthLayer: internal.truthLayer,
        revisionId: internal.revisionId,
        chunkIndex,
        tokenEstimate: tokenEstimate(text),
        contentHash,
        excerpt: text.slice(0, 500),
        occurredAt: internal.occurredAt,
        tags: internal.tags,
        indexVersion: this.indexVersion,
        embeddingStatus: 'READY',
        text,
      };
      this.chunks.set(chunkId, chunk);
      this.vectorProvider.upsert({ ownerId, chunkId, revisionId: internal.revisionId, indexVersion: this.indexVersion, vector: this.embeddingProvider.embed({ text: `${contentHash}:${text}` }) });
      count += 1;
    });
    return count;
  }

  private retrieve(principal: AuthenticatedPrincipal, input: PersonalAIQueryInput): readonly PersonalAIVectorHit[] {
    if (input.scope === 'NONE') return [];
    const searchMode: PersonalAISearchMode = input.searchMode ?? 'HYBRID';
    const limit = bounded(input.topK, 8, 50);
    const scopeTypes = scopeSourceTypes(input.scope);
    const allowedTypes = input.scope === 'USER_SELECTED_ARCHIVE'
      ? (input.sourceTypes === undefined || input.sourceTypes.length === 0 ? scopeTypes : input.sourceTypes)
      : (input.sourceTypes === undefined || input.sourceTypes.length === 0 ? scopeTypes : input.sourceTypes.filter((type) => scopeTypes.includes(type)));
    const effectiveRange = input.scope === 'CURRENT_DAY' ? input.dateRange ?? utcDayRange(this.runtime.now()) : input.dateRange;
    const candidateChunks = [...this.chunks.values()].filter((chunk) =>
      chunk.ownerId === principal.userId && chunk.embeddingStatus === 'READY' && chunk.indexVersion === this.indexVersion && allowedTypes.includes(chunk.sourceType) && dateRangeMatches(chunk.occurredAt, effectiveRange) && this.chunkMatchesSelected(input, chunk) && [...this.sources.values()].some((source) => source.ownerId === principal.userId && source.sourceType === chunk.sourceType && source.sourceId === chunk.sourceId && source.status === 'ACTIVE' && source.indexVersion === this.indexVersion) && this.chunkStillAuthorized(principal, chunk));
    if (candidateChunks.length === 0) return [];
    const queryVector = this.embeddingProvider.embed({ text: input.question });
    const vectorHits = searchMode === 'KEYWORD' ? [] : this.vectorProvider.search({ ownerId: principal.userId, vector: queryVector, limit: Math.min(candidateChunks.length, 100), filter: { sourceTypes: allowedTypes, indexVersions: [this.indexVersion], ...(effectiveRange?.from === undefined ? {} : { from: effectiveRange.from }), ...(effectiveRange?.to === undefined ? {} : { to: effectiveRange.to }), statuses: ['ACTIVE'] } });
    const vectorScores = new Map(vectorHits.map((hit) => [hit.chunkId, Math.max(0, hit.score)]));
    const terms = normalizeText(input.question).split(/[\s,，。！？!?;；:：]+/u).filter((term) => term.length > 0);
    const keywordTerms = terms.flatMap((term) => {
      if (term.length <= 2) return [term];
      const grams = term.match(/[\u3400-\u9fff]{2}/gu);
      return grams === null ? [term] : [...grams, term];
    });
    const ranked = candidateChunks.map((chunk) => {
      const haystack = normalizeText(chunk.text);
      const keyword = keywordTerms.length === 0 ? 0 : keywordTerms.reduce((score, term) => score + (haystack.includes(term) ? 1 : 0), 0) / keywordTerms.length;
      const semantic = vectorScores.get(chunk.chunkId) ?? 0;
      const score = searchMode === 'KEYWORD' ? keyword : searchMode === 'SEMANTIC' ? semantic : semantic * 0.55 + keyword * 0.45;
      return { chunkId: chunk.chunkId, score };
    }).filter((hit) => searchMode === 'KEYWORD' ? hit.score > 0 : hit.score > -1);
    return ranked.sort((left, right) => right.score - left.score || left.chunkId.localeCompare(right.chunkId)).slice(0, limit);
  }

  private chunkMatchesSelected(input: PersonalAIQueryInput, chunk: InternalChunk): boolean {
    if (input.scope === 'SELECTED_ENTRY' || input.scope === 'SELECTED_ENTRIES') return (input.selectedEntryIds ?? []).includes(chunk.sourceId);
    if (input.scope === 'SELECTED_MEDIA') return (input.selectedMediaIds ?? []).includes(chunk.sourceId);
    return true;
  }

  private chunkStillAuthorized(principal: AuthenticatedPrincipal, chunk: InternalChunk): boolean {
    const citation: PersonalAICitation = {
      citationId: '',
      sourceType: chunk.sourceType,
      sourceId: chunk.sourceId,
      revisionId: chunk.revisionId,
      occurredAt: chunk.occurredAt,
      displayTitle: '',
      excerptSafe: '',
      truthLayer: chunk.truthLayer,
      relevanceScore: 0,
    };
    return this.sourceStillAuthorized(principal, citation);
  }

  private citationForHit(ownerId: string, chunkId: string, score: number): PersonalAICitation | null {
    const chunk = this.chunks.get(chunkId);
    if (chunk === undefined || chunk.ownerId !== ownerId || chunk.embeddingStatus !== 'READY') return null;
    const source = [...this.sources.values()].find((item) => item.ownerId === ownerId && item.sourceType === chunk.sourceType && item.sourceId === chunk.sourceId);
    if (source === undefined || source.status !== 'ACTIVE') return null;
    return {
      citationId: hash(`${ownerId}:${chunkId}`).slice(0, 32),
      sourceType: chunk.sourceType,
      sourceId: chunk.sourceId,
      revisionId: chunk.revisionId,
      occurredAt: chunk.occurredAt,
      displayTitle: source.title ?? `${chunk.sourceType} ${chunk.sourceId}`,
      excerptSafe: chunk.excerpt,
      truthLayer: chunk.truthLayer,
      relevanceScore: Number(score.toFixed(6)),
    };
  }

  private publicJob(job: InternalJob): PersonalAIIndexJob {
    return clone({
      id: job.id,
      scope: job.scope,
      dateRange: job.dateRange,
      sourceTypes: job.sourceTypes,
      status: job.status,
      indexVersion: job.indexVersion,
      indexedSourceCount: job.indexedSourceCount,
      indexedChunkCount: job.indexedChunkCount,
      failedSourceCount: job.failedSourceCount,
      createdAt: job.createdAt,
      startedAt: job.startedAt,
      completedAt: job.completedAt,
      errorCode: job.errorCode,
    });
  }
}

interface PersonalAIInsightInternal {
  readonly id: string;
  readonly queryId: string;
  readonly title: string | null;
  readonly content: string;
  readonly citations: readonly PersonalAICitation[];
  readonly truthLayer: 'AI_INSIGHT';
  readonly createdAt: string;
  readonly deletedAt: string | null;
}
