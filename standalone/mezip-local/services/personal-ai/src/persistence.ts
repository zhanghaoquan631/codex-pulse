import type {
  AiGatewayProviderCode,
  PersonalAIConsent,
  PersonalAIContextScope,
  PersonalAIDateRange,
  PersonalAIIndexJob,
  PersonalAIIndexStatus,
  PersonalAIInsight,
  PersonalAIKnowledgeChunk,
  PersonalAIKnowledgeSource,
  PersonalAIKnowledgeSourceType,
  PersonalAIConversation,
  PersonalAICitation,
  PersonalAIPreferences,
  PersonalAIQueryResult,
} from '@me-zip/shared-types';
import { aiGatewayProviderCodes } from '@me-zip/shared-types';

/**
 * This is a contract boundary, not a Postgres implementation.  A production
 * composition must inject a server-only implementation backed by the Phase 9
 * relational schema.  In particular, a process-local Map, browser storage,
 * Mini Program storage, or a queue that loses jobs on restart does not meet
 * this contract.
 */
export const personalAIDurableStorageKind = 'POSTGRES_OWNER_SCOPED_TRANSACTIONAL' as const;
export type PersonalAIDurableStorageKind = typeof personalAIDurableStorageKind;

/** Encrypted payload metadata is intentionally opaque to this domain.  The
 * key reference is a server/KMS identifier, never a secret value. */
export interface PersonalAIProtectedPayload {
  readonly ciphertext: string;
  readonly keyReference: string;
  readonly algorithm: string;
  readonly version: string;
}

/** Immutable consent/audit history.  The current consent projection is kept
 * separately so a caller does not have to infer it from an unbounded stream. */
export interface PersonalAIDurableConsentEvent {
  readonly id: string;
  readonly ownerId: string;
  readonly consentVersion: string;
  readonly eventType: 'ACCEPTED' | 'WITHDRAWN';
  readonly providerDisclosureVersion: string | null;
  readonly policyHash: string | null;
  readonly occurredAt: string;
  readonly idempotencyKey: string | null;
}

/** This is the server-only source row. `sourceRecordId` is the stable database
 * identity used by citations; `sourceId` remains the Archive-domain ID shown
 * to the user. */
export interface PersonalAIDurableKnowledgeSourceRow extends PersonalAIKnowledgeSource {
  readonly ownerId: string;
  readonly sourceRecordId: string;
  /** SHA-256 of normalized source content. It is never a raw archive body. */
  readonly contentHash: string | null;
}

/** Chunk text is sensitive derived data. A durable repository must store and
 * load it through a protected payload instead of exposing a plaintext column
 * through a client-facing data model. */
export interface PersonalAIDurableKnowledgeChunkRow extends PersonalAIKnowledgeChunk {
  readonly ownerId: string;
  readonly sourceRecordId: string;
  readonly protectedText: PersonalAIProtectedPayload | null;
}

export interface PersonalAIDurableConversationRow extends PersonalAIConversation {
  readonly ownerId: string;
}

/** Query answers may quote personal sources, so the durable form has no
 * plaintext answer field. The service decrypts only after owner authorization
 * and source/citation reauthorization. */
export interface PersonalAIDurableQueryRow {
  readonly ownerId: string;
  readonly queryId: string;
  readonly conversationId: string | null;
  readonly questionHash: string;
  readonly result: Omit<PersonalAIQueryResult, 'answer' | 'answerText' | 'citations'>;
  readonly answer: PersonalAIProtectedPayload | null;
  readonly createdAt: string;
}

/** Citation rows must point to a durable source row in addition to carrying
 * the stable Archive source ID used by Web/Mini navigation. */
export interface PersonalAIDurableCitationRow extends PersonalAICitation {
  readonly ownerId: string;
  readonly queryId: string;
  readonly sourceRecordId: string;
  readonly revokedAt: string | null;
}

export interface PersonalAIDurableInsightRow {
  readonly ownerId: string;
  readonly insightId: string;
  readonly queryId: string;
  readonly title: string | null;
  readonly content: PersonalAIProtectedPayload;
  readonly citationIds: readonly string[];
  readonly truthLayer: PersonalAIInsight['truthLayer'];
  readonly createdAt: string;
  readonly deletedAt: string | null;
}

/** The full owner projection is server-only. It is designed for an explicit
 * async hydrate/refactor of PersonalAIService; it must never be serialized to
 * an API response or supplied by a client. */
export interface PersonalAIDurableOwnerState {
  readonly ownerId: string;
  readonly preferences: PersonalAIPreferences | null;
  readonly currentConsent: PersonalAIConsent;
  readonly consentEvents: readonly PersonalAIDurableConsentEvent[];
  readonly sources: readonly PersonalAIDurableKnowledgeSourceRow[];
  readonly chunks: readonly PersonalAIDurableKnowledgeChunkRow[];
  readonly conversations: readonly PersonalAIDurableConversationRow[];
  readonly queries: readonly PersonalAIDurableQueryRow[];
  readonly citations: readonly PersonalAIDurableCitationRow[];
  readonly insights: readonly PersonalAIDurableInsightRow[];
}

export type PersonalAIIdempotencyOperation = 'INDEX_JOB' | 'QUERY' | 'INSIGHT' | 'PREFERENCES' | 'CONSENT';

/** `fingerprint` is a SHA-256 digest of a canonical server-validated request,
 * not a raw question, raw source body, credential, or client-provided owner. */
export interface PersonalAIDurableIdempotencyReceipt {
  readonly ownerId: string;
  readonly operation: PersonalAIIdempotencyOperation;
  readonly key: string;
  readonly fingerprint: string;
  readonly resourceId: string;
  readonly createdAt: string;
}

export interface PersonalAIDurableIndexJobInput {
  readonly scope: PersonalAIContextScope;
  readonly dateRange: PersonalAIDateRange | null;
  readonly sourceTypes: readonly PersonalAIKnowledgeSourceType[];
  readonly selectedEntryIds: readonly string[];
  readonly selectedMediaIds: readonly string[];
  readonly includeHistoricalRevisions: boolean;
  readonly requestFingerprint: string;
}

/** Durable job data deliberately contains no principal/session object. The
 * worker reauthorizes the owner from server-side Membership/consent state when
 * it claims the lease. */
export interface PersonalAIDurableIndexJobRow extends PersonalAIIndexJob {
  readonly ownerId: string;
  readonly input: PersonalAIDurableIndexJobInput;
  readonly idempotencyKey: string | null;
  readonly attemptCount: number;
  readonly availableAt: string;
  readonly leaseToken: string | null;
  readonly leaseOwner: string | null;
  readonly leaseExpiresAt: string | null;
  readonly lastHeartbeatAt: string | null;
}

/** Work is leased rather than merely read. A completion/heartbeat must present
 * this opaque lease token so two workers cannot both commit a terminal result. */
export interface PersonalAIDurableIndexJobLease {
  readonly job: PersonalAIDurableIndexJobRow;
  readonly leaseToken: string;
  readonly workerId: string;
  readonly claimedAt: string;
  readonly expiresAt: string;
}

export interface PersonalAIIndexJobClaimInput {
  /** Stable server worker identity, never a user or browser/Mini value. */
  readonly workerId: string;
  readonly limit: number;
  readonly leaseDurationSeconds: number;
  readonly now: string;
}

export interface PersonalAIIndexJobLeaseRenewal {
  readonly ownerId: string;
  readonly jobId: string;
  readonly leaseToken: string;
  readonly workerId: string;
  readonly leaseDurationSeconds: number;
  readonly now: string;
}

export interface PersonalAIIndexJobCompletion {
  readonly ownerId: string;
  readonly jobId: string;
  readonly leaseToken: string;
  readonly workerId: string;
  readonly status: Extract<PersonalAIIndexStatus, 'READY' | 'STALE' | 'DELETED'>;
  readonly indexedSourceCount: number;
  readonly indexedChunkCount: number;
  readonly failedSourceCount: number;
  readonly completedAt: string;
}

export interface PersonalAIIndexJobFailure {
  readonly ownerId: string;
  readonly jobId: string;
  readonly leaseToken: string;
  readonly workerId: string;
  readonly errorCode: string;
  readonly retryAt: string | null;
  readonly failedAt: string;
}

export interface PersonalAIDurableIndexProjectionWrite {
  readonly ownerId: string;
  readonly jobId: string;
  readonly leaseToken: string;
  /** The terminal projection write must prove the same worker still owns the
   * live lease; a token alone is not sufficient across worker processes. */
  readonly workerId: string;
  readonly sources: readonly PersonalAIDurableKnowledgeSourceRow[];
  readonly chunks: readonly PersonalAIDurableKnowledgeChunkRow[];
  /** IDs of source rows whose derived chunks/vectors are no longer usable. */
  readonly invalidatedSourceRecordIds: readonly string[];
}

export interface PersonalAIDurableIndexJobEnqueueWrite {
  readonly ownerId: string;
  readonly job: PersonalAIDurableIndexJobRow;
  readonly idempotency: PersonalAIDurableIdempotencyReceipt | null;
  /** The database transaction creates this outbox record with the job. */
  readonly outbox: PersonalAIIndexOutboxEvent;
}

/** A replay is an ordinary result. Callers must reload the canonical job instead
 * of returning a speculative, process-local job projection. */
export interface PersonalAIDurableIndexJobEnqueueResult {
  readonly applied: boolean;
  readonly job: PersonalAIDurableIndexJobRow;
  readonly outbox: PersonalAIIndexOutboxEvent;
}

export type PersonalAIIndexOutboxEventType = 'INDEX_JOB_QUEUED' | 'INDEX_JOB_RETRY' | 'SOURCE_INVALIDATED';
export type PersonalAIIndexOutboxStatus = 'PENDING' | 'DISPATCHING' | 'DISPATCHED' | 'FAILED';

/** An outbox event has only identifiers and a digest. It must not duplicate a
 * source body, query, answer, encrypted key material, or provider credential. */
export interface PersonalAIIndexOutboxEvent {
  readonly id: string;
  readonly ownerId: string;
  readonly jobId: string;
  readonly eventType: PersonalAIIndexOutboxEventType;
  readonly payloadFingerprint: string;
  readonly status: PersonalAIIndexOutboxStatus;
  readonly availableAt: string;
  readonly createdAt: string;
  readonly dispatchedAt: string | null;
  readonly attemptCount: number;
}

export interface PersonalAIIndexOutboxLease {
  readonly event: PersonalAIIndexOutboxEvent;
  readonly leaseToken: string;
  readonly workerId: string;
  readonly claimedAt: string;
  readonly expiresAt: string;
}

export interface PersonalAIIndexOutboxClaimInput {
  readonly workerId: string;
  readonly limit: number;
  readonly leaseDurationSeconds: number;
  readonly now: string;
}

export interface PersonalAIIndexOutboxAcknowledgeInput {
  readonly eventId: string;
  readonly leaseToken: string;
  readonly workerId: string;
  readonly dispatchedAt: string;
}

export interface PersonalAIIndexOutboxReleaseInput {
  readonly eventId: string;
  readonly leaseToken: string;
  readonly workerId: string;
  readonly retryAt: string;
  readonly errorCode: string;
}

export interface PersonalAIDurablePreferencesWrite {
  readonly ownerId: string;
  readonly preferences: PersonalAIPreferences;
  readonly idempotency: PersonalAIDurableIdempotencyReceipt | null;
}

export interface PersonalAIDurableConsentWrite {
  readonly ownerId: string;
  readonly event: PersonalAIDurableConsentEvent;
  readonly idempotency: PersonalAIDurableIdempotencyReceipt | null;
}

export interface PersonalAIDurableQueryWrite {
  readonly ownerId: string;
  readonly query: PersonalAIDurableQueryRow;
  readonly citations: readonly PersonalAIDurableCitationRow[];
  readonly conversation: PersonalAIDurableConversationRow | null;
  readonly idempotency: PersonalAIDurableIdempotencyReceipt;
}

export interface PersonalAIDurableInsightWrite {
  readonly ownerId: string;
  readonly insight: PersonalAIDurableInsightRow;
  readonly idempotency: PersonalAIDurableIdempotencyReceipt | null;
}

/** Archive lifecycle integrations must call this after the authoritative
 * Archive commit. It removes derived chunks/vectors and revokes citations via
 * the durable source identity, not via a best-effort in-process callback. */
export interface PersonalAIDurableSourceInvalidation {
  readonly ownerId: string;
  readonly sourceType: PersonalAIKnowledgeSourceType;
  readonly sourceId: string;
  readonly revisionId: string | null;
  readonly status: 'TRASHED' | 'DELETED';
  readonly occurredAt: string;
  readonly reason: 'ARCHIVE_TRASHED' | 'ARCHIVE_DELETED' | 'ARCHIVE_REVISED' | 'CONSENT_WITHDRAWN' | 'OWNER_CLEAR';
}

/**
 * This is the production state authority. Every owner-facing operation carries
 * an explicit, server-derived `ownerId`; the only server-wide operations are
 * lease claims, which return owner-scoped leases and are callable solely by a
 * worker role. `enqueueIndexJob` must commit job input, idempotency receipt,
 * and outbox event in one transaction.
 */
export interface PersonalAIDurableRepository {
  readonly productionSafe: true;
  readonly storageKind: PersonalAIDurableStorageKind;
  loadOwnerState(input: { readonly ownerId: string }): Promise<PersonalAIDurableOwnerState>;
  writePreferences(input: PersonalAIDurablePreferencesWrite): Promise<void>;
  appendConsent(input: PersonalAIDurableConsentWrite): Promise<void>;
  enqueueIndexJob(input: PersonalAIDurableIndexJobEnqueueWrite): Promise<PersonalAIDurableIndexJobEnqueueResult>;
  claimIndexJobs(input: PersonalAIIndexJobClaimInput): Promise<readonly PersonalAIDurableIndexJobLease[]>;
  renewIndexJobLease(input: PersonalAIIndexJobLeaseRenewal): Promise<PersonalAIDurableIndexJobLease | null>;
  persistIndexProjection(input: PersonalAIDurableIndexProjectionWrite): Promise<void>;
  completeIndexJob(input: PersonalAIIndexJobCompletion): Promise<void>;
  failIndexJob(input: PersonalAIIndexJobFailure): Promise<void>;
  invalidateSource(input: PersonalAIDurableSourceInvalidation): Promise<void>;
  persistQuery(input: PersonalAIDurableQueryWrite): Promise<void>;
  persistInsight(input: PersonalAIDurableInsightWrite): Promise<void>;
  clearOwner(input: { readonly ownerId: string; readonly occurredAt: string }): Promise<void>;
  claimIndexOutbox(input: PersonalAIIndexOutboxClaimInput): Promise<readonly PersonalAIIndexOutboxLease[]>;
  acknowledgeIndexOutbox(input: PersonalAIIndexOutboxAcknowledgeInput): Promise<void>;
  releaseIndexOutbox(input: PersonalAIIndexOutboxReleaseInput): Promise<void>;
}

export class PersonalAIDurableConfigurationError extends Error {
  public constructor(message: string) {
    super(message);
    this.name = 'PersonalAIDurableConfigurationError';
  }
}

const requiredRepositoryMethods = [
  'loadOwnerState',
  'writePreferences',
  'appendConsent',
  'enqueueIndexJob',
  'claimIndexJobs',
  'renewIndexJobLease',
  'persistIndexProjection',
  'completeIndexJob',
  'failIndexJob',
  'invalidateSource',
  'persistQuery',
  'persistInsight',
  'clearOwner',
  'claimIndexOutbox',
  'acknowledgeIndexOutbox',
  'releaseIndexOutbox',
] as const;

/** Runtime fail-closed guard intended for the production composition root. It
 * intentionally refuses a marker-only object or an in-memory test fixture. */
export function assertPersonalAIDurableRepository(value: unknown): asserts value is PersonalAIDurableRepository {
  if (value === null || typeof value !== 'object') {
    throw new PersonalAIDurableConfigurationError('Personal AI production requires a durable owner-scoped repository.');
  }
  const candidate = value as Record<string, unknown>;
  if (candidate.productionSafe !== true || candidate.storageKind !== personalAIDurableStorageKind) {
    throw new PersonalAIDurableConfigurationError('Personal AI production requires a reviewed transactional owner-scoped repository.');
  }
  if (requiredRepositoryMethods.some((method) => typeof candidate[method] !== 'function')) {
    throw new PersonalAIDurableConfigurationError('Personal AI production repository is missing a required durable state or async-index operation.');
  }
}

const personalAIConsentProviderDisclosure = '为了生成向量或回答，授权内容可能被发送到当前 AI Provider。你可以随时关闭并删除派生索引。';

export interface PostgresPersonalAIQueryResult<Row extends object = Record<string, unknown>> {
  readonly rows: readonly Row[];
}

export interface PostgresPersonalAITransaction {
  query<Row extends object = Record<string, unknown>>(
    statement: { readonly text: string; readonly values: readonly unknown[] },
  ): Promise<PostgresPersonalAIQueryResult<Row>>;
}

export interface PostgresPersonalAIDatabase {
  transaction<T>(operation: (transaction: PostgresPersonalAITransaction) => Promise<T>): Promise<T>;
}

interface PostgresPersonalAIStoredPreferencesRow {
  readonly ownerId: string;
  readonly enabled: boolean;
  readonly archiveMode: PersonalAIPreferences['archiveMode'];
  readonly defaultScope: PersonalAIPreferences['defaultScope'];
  readonly includeHistoricalRevisions: boolean;
  readonly consentVersion: string | null;
  readonly consentAcceptedAt: string | null;
  readonly updatedAt: string;
}

interface PostgresPersonalAIStoredConsentEventRow {
  readonly id: string;
  readonly ownerId: string;
  readonly consentVersion: string;
  readonly eventType: PersonalAIDurableConsentEvent['eventType'];
  readonly providerDisclosureVersion: string | null;
  readonly policyHash: string | null;
  readonly occurredAt: string;
  readonly idempotencyKey: string | null;
}

interface PostgresPersonalAIStoredSourceRow {
  readonly sourceRecordId: string;
  readonly ownerId: string;
  readonly sourceType: PersonalAIKnowledgeSourceType;
  readonly sourceId: string;
  readonly canonicalSourceId: string;
  readonly truthLayer: PersonalAIKnowledgeSource['truthLayer'];
  readonly revisionId: string | null;
  readonly occurredAt: string;
  readonly createdAt: string;
  readonly updatedAt: string;
  readonly visibility: PersonalAIKnowledgeSource['visibility'];
  readonly status: PersonalAIKnowledgeSource['status'];
  readonly title: string | null;
  readonly tags: readonly string[];
  readonly indexVersion: string | null;
  readonly indexStatus: PersonalAIKnowledgeSource['indexStatus'];
  readonly contentHash: string | null;
  readonly invalidatedAt: string | null;
  readonly invalidationReason: string | null;
}

/**
 * The projection writer only needs this narrow identity slice before it can
 * touch a source row.  Keeping it separate from the full source projection
 * makes the preflight query explicit: a worker-supplied sourceRecordId must
 * agree with the owner/type/source/truth/revision identity already durable in
 * Postgres, or the transaction fails closed before any derived rows are
 * deleted/upserted.
 */
interface PostgresPersonalAIStoredSourceIdentityRow {
  readonly sourceRecordId: string;
  readonly ownerId: string;
  readonly sourceType: PersonalAIKnowledgeSourceType;
  readonly sourceId: string;
  readonly truthLayer: PersonalAIKnowledgeSource['truthLayer'];
  readonly revisionId: string | null;
}

interface PostgresPersonalAIStoredChunkRow {
  readonly chunkId: string;
  readonly ownerId: string;
  readonly sourceRecordId: string;
  readonly sourceType: PersonalAIKnowledgeSourceType;
  readonly sourceId: string;
  readonly canonicalSourceId: string;
  readonly truthLayer: PersonalAIKnowledgeChunk['truthLayer'];
  readonly revisionId: string | null;
  readonly chunkIndex: number;
  readonly tokenEstimate: number;
  readonly contentHash: string;
  readonly excerpt: string;
  readonly occurredAt: string;
  readonly metadata: Readonly<Record<string, unknown>> | null;
  readonly indexVersion: string;
  readonly embeddingStatus: PersonalAIKnowledgeChunk['embeddingStatus'];
  readonly textCiphertext: string | null;
  readonly textKeyReference: string | null;
  readonly encryptionAlgorithm: string | null;
  readonly encryptionVersion: string | null;
}

interface PostgresPersonalAIStoredConversationRow {
  readonly id: string;
  readonly ownerId: string;
  readonly currentScope: PersonalAIConversation['currentScope'];
  readonly createdAt: string;
  readonly updatedAt: string;
  readonly deletedAt: string | null;
}

interface PostgresPersonalAIStoredQueryRow {
  readonly queryId: string;
  readonly ownerId: string;
  readonly conversationId: string | null;
  readonly questionHash: string;
  readonly status: PersonalAIQueryResult['status'];
  readonly evidenceKind: PersonalAIQueryResult['evidenceKind'];
  readonly scope: PersonalAIQueryResult['scope'];
  readonly archiveMode: PersonalAIQueryResult['archiveMode'];
  readonly retrievedChunkCount: number;
  readonly retrievalLatencyMs: number;
  readonly generationLatencyMs: number | null;
  readonly modelCode: string | null;
  readonly providerCode: string | null;
  readonly inputTokens: number;
  readonly outputTokens: number;
  readonly totalTokens: number;
  readonly costFen: number;
  readonly answerCiphertext: string | null;
  readonly createdAt: string;
}

interface PostgresPersonalAIStoredCitationRow {
  readonly citationId: string;
  readonly ownerId: string;
  readonly queryId: string;
  readonly sourceRecordId: string | null;
  readonly sourceType: PersonalAICitation['sourceType'];
  readonly sourceId: string;
  readonly revisionId: string | null;
  readonly occurredAt: string;
  readonly truthLayer: PersonalAICitation['truthLayer'];
  readonly excerptSafe: string;
  readonly relevanceScore: number;
  readonly revokedAt: string | null;
  readonly sourceTitle: string | null;
}

interface PostgresPersonalAIStoredInsightEnvelope {
  readonly content: PersonalAIProtectedPayload;
  readonly citationIds: readonly string[];
}

interface PostgresPersonalAIStoredInsightRow {
  readonly insightId: string;
  readonly ownerId: string;
  readonly queryId: string;
  readonly title: string | null;
  readonly contentCiphertext: string | null;
  readonly createdAt: string;
  readonly deletedAt: string | null;
}

interface PostgresPersonalAIStoredIndexVersionRow {
  readonly id: string;
  readonly version: string;
}

interface PostgresPersonalAIStoredIndexJobRow {
  readonly id: string;
  readonly ownerId: string;
  readonly scope: PersonalAIIndexJob['scope'];
  readonly dateFrom: string | null;
  readonly dateTo: string | null;
  readonly sourceTypes: readonly PersonalAIKnowledgeSourceType[];
  readonly status: PersonalAIIndexJob['status'];
  readonly indexVersion: string | null;
  readonly indexedSourceCount: number;
  readonly indexedChunkCount: number;
  readonly failedSourceCount: number;
  readonly createdAt: string;
  readonly startedAt: string | null;
  readonly completedAt: string | null;
  readonly errorCode: string | null;
  readonly selectedEntryIds: readonly string[];
  readonly selectedMediaIds: readonly string[];
  readonly includeHistoricalRevisions: boolean;
  readonly requestFingerprint: string | null;
  readonly idempotencyKey: string | null;
  readonly availableAt: string;
  readonly attemptCount: number;
  readonly leaseToken: string | null;
  readonly leaseOwner: string | null;
  readonly leaseExpiresAt: string | null;
  readonly lastHeartbeatAt: string | null;
}

interface PostgresPersonalAIStoredOutboxRow {
  readonly id: string;
  readonly ownerId: string;
  readonly jobId: string;
  readonly eventType: PersonalAIIndexOutboxEventType;
  readonly payloadFingerprint: string;
  readonly status: PersonalAIIndexOutboxStatus;
  readonly availableAt: string;
  readonly createdAt: string;
  readonly dispatchedAt: string | null;
  readonly attemptCount: number;
  readonly leaseToken: string | null;
  readonly leaseOwner: string | null;
  readonly leaseExpiresAt: string | null;
  readonly lastErrorCode: string | null;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function requireString(value: unknown, field: string): string {
  if (typeof value !== 'string') throw new Error(`Expected ${field} to be a string.`);
  return value;
}

function requireStringArray(value: unknown, field: string): readonly string[] {
  if (!Array.isArray(value) || value.some((item) => typeof item !== 'string')) {
    throw new Error(`Expected ${field} to be an array of strings.`);
  }
  return value;
}

const aiGatewayProviderCodeSet = new Set<string>(aiGatewayProviderCodes);

function toAiGatewayProviderCode(value: string | null, field: string): AiGatewayProviderCode | null {
  if (value === null) return null;
  if (!aiGatewayProviderCodeSet.has(value)) {
    throw new Error(`Invalid ${field}.`);
  }
  return value as AiGatewayProviderCode;
}

function requireProtectedPayload(value: unknown, field: string): PersonalAIProtectedPayload {
  if (!isRecord(value)) throw new Error(`Expected ${field} to be a protected payload.`);
  const ciphertext = requireString(value.ciphertext, `${field}.ciphertext`);
  const keyReference = requireString(value.keyReference, `${field}.keyReference`);
  const algorithm = requireString(value.algorithm, `${field}.algorithm`);
  const version = requireString(value.version, `${field}.version`);
  return { ciphertext, keyReference, algorithm, version };
}

function encodeProtectedPayload(payload: PersonalAIProtectedPayload): string {
  return JSON.stringify(payload);
}

function decodeProtectedPayload(value: string | null, field: string): PersonalAIProtectedPayload | null {
  if (value === null) return null;
  try {
    return requireProtectedPayload(JSON.parse(value), field);
  } catch {
    throw new Error(`Invalid serialized protected payload in ${field}.`);
  }
}

function encodeInsightEnvelope(value: PostgresPersonalAIStoredInsightEnvelope): string {
  return JSON.stringify(value);
}

function decodeInsightEnvelope(value: string | null): PostgresPersonalAIStoredInsightEnvelope | null {
  if (value === null) return null;
  try {
    const parsedValue: unknown = JSON.parse(value);
    if (!isRecord(parsedValue)) throw new Error('invalid insight envelope');
    const parsed = parsedValue as Record<string, unknown>;
    return {
      content: requireProtectedPayload(parsed.content, 'ai_insights.content'),
      citationIds: requireStringArray(parsed.citationIds, 'ai_insights.citationIds'),
    };
  } catch {
    throw new Error('Invalid serialized insight envelope.');
  }
}

function toDateRange(from: string | null, to: string | null, field: string): PersonalAIDateRange | null {
  if (from === null && to === null) return null;
  if (from === null || to === null) throw new Error(`Expected ${field} to contain both date boundaries.`);
  return { from, to };
}

function toConsentRow(row: PostgresPersonalAIStoredConsentEventRow): PersonalAIDurableConsentEvent {
  return {
    id: row.id,
    ownerId: row.ownerId,
    consentVersion: row.consentVersion,
    eventType: row.eventType,
    providerDisclosureVersion: row.providerDisclosureVersion,
    policyHash: row.policyHash,
    occurredAt: row.occurredAt,
    idempotencyKey: row.idempotencyKey,
  };
}

function toPreferenceRow(row: PostgresPersonalAIStoredPreferencesRow): PersonalAIPreferences {
  return {
    enabled: row.enabled,
    archiveMode: row.archiveMode,
    defaultScope: row.defaultScope,
    includeHistoricalRevisions: row.includeHistoricalRevisions,
    updatedAt: row.updatedAt,
  };
}

function currentConsentFrom(preferences: PostgresPersonalAIStoredPreferencesRow | null, events: readonly PostgresPersonalAIStoredConsentEventRow[]): PersonalAIConsent {
  const latest = events.at(-1);
  if (latest !== undefined) {
    if (latest.eventType === 'WITHDRAWN') {
      return {
        accepted: false,
        version: null,
        acceptedAt: null,
        providerDisclosure: personalAIConsentProviderDisclosure,
      };
    }
    return {
      accepted: true,
      version: latest.consentVersion,
      acceptedAt: latest.occurredAt,
      providerDisclosure: personalAIConsentProviderDisclosure,
    };
  }
  if (preferences !== null && preferences.consentVersion !== null && preferences.consentAcceptedAt !== null) {
    return {
      accepted: true,
      version: preferences.consentVersion,
      acceptedAt: preferences.consentAcceptedAt,
      providerDisclosure: personalAIConsentProviderDisclosure,
    };
  }
  return {
    accepted: false,
    version: null,
    acceptedAt: null,
    providerDisclosure: personalAIConsentProviderDisclosure,
  };
}

function toSourceRow(row: PostgresPersonalAIStoredSourceRow): PersonalAIDurableKnowledgeSourceRow {
  if (row.indexVersion === null) {
    throw new Error(`Source row ${row.sourceRecordId} is missing an index version.`);
  }
  return {
    ownerId: row.ownerId,
    sourceRecordId: row.sourceRecordId,
    sourceType: row.sourceType,
    sourceId: row.sourceId,
    canonicalSourceId: row.canonicalSourceId,
    truthLayer: row.truthLayer,
    revisionId: row.revisionId,
    occurredAt: row.occurredAt,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
    visibility: row.visibility,
    status: row.status,
    title: row.title,
    tags: [...row.tags],
    indexVersion: row.indexVersion,
    indexStatus: row.indexStatus,
    contentHash: row.contentHash,
  };
}

function sourceNaturalIdentityMatches(
  row: Pick<PostgresPersonalAIStoredSourceIdentityRow, 'sourceType' | 'sourceId' | 'truthLayer' | 'revisionId'>,
  source: Pick<PersonalAIDurableKnowledgeSourceRow, 'sourceType' | 'sourceId' | 'truthLayer' | 'revisionId'>,
): boolean {
  return row.sourceType === source.sourceType
    && row.sourceId === source.sourceId
    && row.truthLayer === source.truthLayer
    && (row.revisionId ?? null) === (source.revisionId ?? null);
}

function readChunkTags(metadata: Readonly<Record<string, unknown>> | null, fallback: readonly string[]): readonly string[] {
  if (metadata !== null) {
    const candidate = metadata.tags;
    if (Array.isArray(candidate) && candidate.every((item) => typeof item === 'string')) return candidate;
  }
  return [...fallback];
}

function toChunkRow(row: PostgresPersonalAIStoredChunkRow, source: PersonalAIDurableKnowledgeSourceRow): PersonalAIDurableKnowledgeChunkRow {
  const hasEncryptedPayload =
    row.textCiphertext !== null ||
    row.textKeyReference !== null ||
    row.encryptionAlgorithm !== null ||
    row.encryptionVersion !== null;
  if (hasEncryptedPayload && (row.textCiphertext === null || row.textKeyReference === null || row.encryptionAlgorithm === null || row.encryptionVersion === null)) {
    throw new Error(`Chunk row ${row.chunkId} contains a partial protected payload.`);
  }
  const protectedText = hasEncryptedPayload
    ? {
        ciphertext: row.textCiphertext as string,
        keyReference: row.textKeyReference as string,
        algorithm: row.encryptionAlgorithm as string,
        version: row.encryptionVersion as string,
      }
    : null;
  if (protectedText !== null && (protectedText.ciphertext === '' || protectedText.keyReference === '' || protectedText.algorithm === '' || protectedText.version === '')) {
    throw new Error(`Chunk row ${row.chunkId} contains an empty protected payload.`);
  }
  return {
    chunkId: row.chunkId,
    ownerId: row.ownerId,
    sourceRecordId: row.sourceRecordId,
    sourceType: row.sourceType,
    sourceId: row.sourceId,
    canonicalSourceId: row.canonicalSourceId,
    truthLayer: row.truthLayer,
    revisionId: row.revisionId,
    chunkIndex: row.chunkIndex,
    tokenEstimate: row.tokenEstimate,
    contentHash: row.contentHash,
    excerpt: row.excerpt,
    occurredAt: row.occurredAt,
    tags: readChunkTags(row.metadata, source.tags),
    indexVersion: row.indexVersion,
    embeddingStatus: row.embeddingStatus,
    protectedText,
  };
}

function toQueryRow(row: PostgresPersonalAIStoredQueryRow, answer: PersonalAIProtectedPayload | null): PersonalAIDurableQueryRow {
  const providerCode = toAiGatewayProviderCode(row.providerCode, `personal_ai_queries.${row.queryId}.provider_code`);
  return {
    ownerId: row.ownerId,
    queryId: row.queryId,
    conversationId: row.conversationId,
    questionHash: row.questionHash,
    result: {
      queryId: row.queryId,
      conversationId: row.conversationId,
      status: row.status,
      archiveMode: row.archiveMode,
      scope: row.scope,
      evidenceKind: row.evidenceKind,
      retrievedChunkCount: row.retrievedChunkCount,
      retrievalLatencyMs: row.retrievalLatencyMs,
      generationLatencyMs: row.generationLatencyMs,
      usage: {
        modelCode: row.modelCode,
        providerCode,
        inputTokens: row.inputTokens,
        outputTokens: row.outputTokens,
        totalTokens: row.totalTokens,
        costFen: row.costFen,
      },
      createdAt: row.createdAt,
    },
    answer,
    createdAt: row.createdAt,
  };
}

function toCitationRow(row: PostgresPersonalAIStoredCitationRow, source: PersonalAIDurableKnowledgeSourceRow | undefined): PersonalAIDurableCitationRow {
  if (row.sourceRecordId === null) {
    throw new Error(`Citation row ${row.citationId} is missing source_record_id.`);
  }
  return {
    citationId: row.citationId,
    ownerId: row.ownerId,
    queryId: row.queryId,
    sourceRecordId: row.sourceRecordId,
    sourceType: row.sourceType,
    sourceId: row.sourceId,
    revisionId: row.revisionId,
    occurredAt: row.occurredAt,
    displayTitle: source?.title ?? `${row.sourceType} ${row.sourceId}`,
    excerptSafe: row.excerptSafe,
    truthLayer: row.truthLayer,
    relevanceScore: row.relevanceScore,
    revokedAt: row.revokedAt,
  };
}

function toInsightRow(row: PostgresPersonalAIStoredInsightRow): PersonalAIDurableInsightRow {
  const envelope = decodeInsightEnvelope(row.contentCiphertext);
  if (envelope === null) {
    throw new Error(`Insight row ${row.insightId} is missing serialized content.`);
  }
  return {
    ownerId: row.ownerId,
    insightId: row.insightId,
    queryId: row.queryId,
    title: row.title,
    content: envelope.content,
    citationIds: envelope.citationIds,
    truthLayer: 'AI_INSIGHT',
    createdAt: row.createdAt,
    deletedAt: row.deletedAt,
  };
}

function toIndexJobInput(row: PostgresPersonalAIStoredIndexJobRow): PersonalAIDurableIndexJobInput {
  if (row.requestFingerprint === null) {
    throw new Error(`Index job ${row.id} is missing a request fingerprint.`);
  }
  return {
    scope: row.scope,
    dateRange: toDateRange(row.dateFrom, row.dateTo, `personal_index_jobs.${row.id}`),
    sourceTypes: [...row.sourceTypes],
    selectedEntryIds: [...row.selectedEntryIds],
    selectedMediaIds: [...row.selectedMediaIds],
    includeHistoricalRevisions: row.includeHistoricalRevisions,
    requestFingerprint: row.requestFingerprint,
  };
}

function toIndexJobRow(row: PostgresPersonalAIStoredIndexJobRow): PersonalAIDurableIndexJobRow {
  if (row.indexVersion === null) {
    throw new Error(`Index job ${row.id} is missing an index version.`);
  }
  return {
    id: row.id,
    ownerId: row.ownerId,
    scope: row.scope,
    dateRange: toDateRange(row.dateFrom, row.dateTo, `personal_index_jobs.${row.id}`),
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
    input: toIndexJobInput(row),
    idempotencyKey: row.idempotencyKey,
    attemptCount: row.attemptCount,
    availableAt: row.availableAt,
    leaseToken: row.leaseToken,
    leaseOwner: row.leaseOwner,
    leaseExpiresAt: row.leaseExpiresAt,
    lastHeartbeatAt: row.lastHeartbeatAt,
  };
}

function toOutboxRow(row: PostgresPersonalAIStoredOutboxRow): PersonalAIIndexOutboxEvent {
  return {
    id: row.id,
    ownerId: row.ownerId,
    jobId: row.jobId,
    eventType: row.eventType,
    payloadFingerprint: row.payloadFingerprint,
    status: row.status,
    availableAt: row.availableAt,
    createdAt: row.createdAt,
    dispatchedAt: row.dispatchedAt,
    attemptCount: row.attemptCount,
  };
}

function toOutboxLease(row: PostgresPersonalAIStoredOutboxRow, leaseToken: string, workerId: string, claimedAt: string, expiresAt: string): PersonalAIIndexOutboxLease {
  return {
    event: toOutboxRow(row),
    leaseToken,
    workerId,
    claimedAt,
    expiresAt,
  };
}

function toIndexJobLease(row: PostgresPersonalAIStoredIndexJobRow, leaseToken: string, workerId: string, claimedAt: string, expiresAt: string): PersonalAIDurableIndexJobLease {
  return {
    job: toIndexJobRow(row),
    leaseToken,
    workerId,
    claimedAt,
    expiresAt,
  };
}

function ensurePositiveInteger(value: number, field: string): void {
  if (!Number.isSafeInteger(value) || value < 1) {
    throw new Error(`Expected ${field} to be a positive integer.`);
  }
}

export class PostgresPersonalAIRepository implements PersonalAIDurableRepository {
  public readonly productionSafe = true as const;
  public readonly storageKind = personalAIDurableStorageKind;
  private readonly indexVersionIdCache = new Map<string, string>();

  public constructor(private readonly database: PostgresPersonalAIDatabase) {}

  public async loadOwnerState(input: { readonly ownerId: string }): Promise<PersonalAIDurableOwnerState> {
    const ownerId = requireString(input.ownerId, 'ownerId');
    return this.database.transaction(async (transaction) => {
      const preferencesResult = await transaction.query<PostgresPersonalAIStoredPreferencesRow>({
        text: `
          SELECT owner_user_id AS "ownerId", enabled, archive_mode AS "archiveMode",
            default_scope AS "defaultScope", include_historical_revisions AS "includeHistoricalRevisions",
            consent_version AS "consentVersion", consent_accepted_at AS "consentAcceptedAt",
            updated_at AS "updatedAt"
          FROM personal_ai_preferences
          WHERE owner_user_id = $1
          LIMIT 1`,
        values: [ownerId],
      });
      const consentEventsResult = await transaction.query<PostgresPersonalAIStoredConsentEventRow>({
        text: `
          SELECT id, owner_user_id AS "ownerId", consent_version AS "consentVersion",
            event_type AS "eventType", provider_disclosure_version AS "providerDisclosureVersion",
            policy_hash AS "policyHash", occurred_at AS "occurredAt", idempotency_key AS "idempotencyKey"
          FROM personal_ai_consent_events
          WHERE owner_user_id = $1
          ORDER BY occurred_at ASC, id ASC`,
        values: [ownerId],
      });
      const sourcesResult = await transaction.query<PostgresPersonalAIStoredSourceRow>({
        text: `
          SELECT s.id AS "sourceRecordId", s.owner_user_id AS "ownerId", s.source_type AS "sourceType",
            s.source_id AS "sourceId", s.canonical_source_id AS "canonicalSourceId", s.truth_layer AS "truthLayer",
            s.revision_id AS "revisionId", s.occurred_at AS "occurredAt", s.created_at AS "createdAt",
            s.updated_at AS "updatedAt", s.visibility AS "visibility", s.status AS "status",
            s.title AS "title", s.tags AS "tags", v.version AS "indexVersion", s.index_status AS "indexStatus",
            s.content_hash AS "contentHash", s.invalidated_at AS "invalidatedAt", s.invalidation_reason AS "invalidationReason"
          FROM personal_knowledge_sources s
          LEFT JOIN personal_ai_index_versions v ON v.id = s.index_version_id
          WHERE s.owner_user_id = $1
          ORDER BY s.created_at ASC, s.id ASC`,
        values: [ownerId],
      });
      const sources = sourcesResult.rows.map(toSourceRow);
      const sourcesByRecordId = new Map<string, PersonalAIDurableKnowledgeSourceRow>(sources.map((source) => [source.sourceRecordId, source]));
      const chunksResult = await transaction.query<PostgresPersonalAIStoredChunkRow>({
        text: `
          SELECT c.id AS "chunkId", c.owner_user_id AS "ownerId", c.source_id AS "sourceRecordId",
            s.source_type AS "sourceType", s.source_id AS "sourceId", s.canonical_source_id AS "canonicalSourceId",
            s.truth_layer AS "truthLayer", s.revision_id AS "revisionId", c.chunk_index AS "chunkIndex",
            c.token_estimate AS "tokenEstimate", c.content_hash AS "contentHash", c.text AS "excerpt",
            c.occurred_at AS "occurredAt", c.metadata AS "metadata", v.version AS "indexVersion",
            c.embedding_status AS "embeddingStatus", c.text_ciphertext AS "textCiphertext",
            c.text_key_reference AS "textKeyReference", c.encryption_algorithm AS "encryptionAlgorithm",
            c.encryption_version AS "encryptionVersion"
          FROM personal_knowledge_chunks c
          JOIN personal_knowledge_sources s ON s.owner_user_id = c.owner_user_id AND s.id = c.source_id
          JOIN personal_ai_index_versions v ON v.id = c.index_version_id
          WHERE c.owner_user_id = $1
          ORDER BY c.created_at ASC, c.id ASC`,
        values: [ownerId],
      });
      const conversationsResult = await transaction.query<PostgresPersonalAIStoredConversationRow>({
        text: `
          SELECT id, owner_user_id AS "ownerId", current_scope AS "currentScope",
            created_at AS "createdAt", updated_at AS "updatedAt", deleted_at AS "deletedAt"
          FROM personal_ai_conversations
          WHERE owner_user_id = $1
          ORDER BY created_at ASC, id ASC`,
        values: [ownerId],
      });
      const queriesResult = await transaction.query<PostgresPersonalAIStoredQueryRow>({
        text: `
          SELECT id AS "queryId", owner_user_id AS "ownerId", conversation_id AS "conversationId",
            question_hash AS "questionHash", status, evidence_kind AS "evidenceKind", scope, archive_mode AS "archiveMode",
            retrieved_chunk_count AS "retrievedChunkCount", retrieval_latency_ms AS "retrievalLatencyMs",
            generation_latency_ms AS "generationLatencyMs", model_code AS "modelCode", provider_code AS "providerCode",
            input_tokens AS "inputTokens", output_tokens AS "outputTokens", total_tokens AS "totalTokens",
            cost_fen AS "costFen", answer_ciphertext AS "answerCiphertext", created_at AS "createdAt"
          FROM personal_ai_queries
          WHERE owner_user_id = $1
          ORDER BY created_at ASC, id ASC`,
        values: [ownerId],
      });
      const citationsResult = await transaction.query<PostgresPersonalAIStoredCitationRow>({
        text: `
          SELECT c.id AS "citationId", c.owner_user_id AS "ownerId", c.query_id AS "queryId",
            c.source_record_id AS "sourceRecordId", c.source_type AS "sourceType", c.source_id AS "sourceId",
            c.revision_id AS "revisionId", c.occurred_at AS "occurredAt", c.truth_layer AS "truthLayer",
            c.excerpt_safe AS "excerptSafe", c.relevance_score AS "relevanceScore", c.revoked_at AS "revokedAt",
            s.title AS "sourceTitle"
          FROM personal_ai_citations c
          LEFT JOIN personal_knowledge_sources s ON s.owner_user_id = c.owner_user_id AND s.id = c.source_record_id
          WHERE c.owner_user_id = $1
          ORDER BY c.query_id ASC, c.occurred_at ASC, c.id ASC`,
        values: [ownerId],
      });
      const insightsResult = await transaction.query<PostgresPersonalAIStoredInsightRow>({
        text: `
          SELECT id AS "insightId", owner_user_id AS "ownerId", query_id AS "queryId", title,
            content_ciphertext AS "contentCiphertext", created_at AS "createdAt", deleted_at AS "deletedAt"
          FROM ai_insights
          WHERE owner_user_id = $1
          ORDER BY created_at ASC, id ASC`,
        values: [ownerId],
      });
      const preferences = preferencesResult.rows[0] === undefined ? null : toPreferenceRow(preferencesResult.rows[0]);
      const consentEvents = consentEventsResult.rows.map(toConsentRow);
      const currentConsent = currentConsentFrom(preferencesResult.rows[0] ?? null, consentEventsResult.rows);
      const chunkRows = chunksResult.rows.map((row) => {
        const source = sourcesByRecordId.get(row.sourceRecordId);
        if (source === undefined) {
          throw new Error(`Chunk row ${row.chunkId} references missing source record ${row.sourceRecordId}.`);
        }
        return toChunkRow(row, source);
      });
      const citationRows = citationsResult.rows.map((row) => {
        const source = row.sourceRecordId === null ? undefined : sourcesByRecordId.get(row.sourceRecordId);
        return toCitationRow(row, source);
      });
      const citationsByQueryId = new Map<string, readonly PersonalAIDurableCitationRow[]>();
      for (const citation of citationRows) {
        const existing = citationsByQueryId.get(citation.queryId);
        citationsByQueryId.set(citation.queryId, existing === undefined ? [citation] : [...existing, citation]);
      }
      const queries = queriesResult.rows.map((row) => toQueryRow(row, decodeProtectedPayload(row.answerCiphertext, `personal_ai_queries.${row.queryId}.answer_ciphertext`)));
      const insights = insightsResult.rows.map(toInsightRow);
      return {
        ownerId,
        preferences,
        currentConsent,
        consentEvents,
        sources,
        chunks: chunkRows,
        conversations: conversationsResult.rows.map((row) => ({
          id: row.id,
          ownerId: row.ownerId,
          currentScope: row.currentScope,
          createdAt: row.createdAt,
          updatedAt: row.updatedAt,
          deletedAt: row.deletedAt,
        })),
        queries,
        citations: citationRows,
        insights,
      };
    });
  }

  public async readIndexJob(input: { readonly ownerId: string; readonly jobId: string }): Promise<PersonalAIDurableIndexJobRow | null> {
    const ownerId = requireString(input.ownerId, 'ownerId');
    const jobId = requireString(input.jobId, 'jobId');
    return this.database.transaction(async (transaction) => {
      const result = await transaction.query<PostgresPersonalAIStoredIndexJobRow>({
        text: `
          SELECT id, owner_user_id AS "ownerId", scope, date_from AS "dateFrom", date_to AS "dateTo",
            source_types AS "sourceTypes", status, (SELECT version FROM personal_ai_index_versions v WHERE v.id = index_version_id) AS "indexVersion",
            indexed_source_count AS "indexedSourceCount", indexed_chunk_count AS "indexedChunkCount",
            failed_source_count AS "failedSourceCount", created_at AS "createdAt", started_at AS "startedAt",
            completed_at AS "completedAt", error_code AS "errorCode", selected_entry_ids AS "selectedEntryIds",
            selected_media_ids AS "selectedMediaIds", include_historical_revisions AS "includeHistoricalRevisions",
            request_fingerprint AS "requestFingerprint", idempotency_key AS "idempotencyKey",
            available_at AS "availableAt", attempt_count AS "attemptCount", lease_token AS "leaseToken",
            lease_owner AS "leaseOwner", lease_expires_at AS "leaseExpiresAt", last_heartbeat_at AS "lastHeartbeatAt"
          FROM personal_index_jobs
          WHERE owner_user_id = $1 AND id = $2
          LIMIT 1`,
        values: [ownerId, jobId],
      });
      const row = result.rows[0];
      return row === undefined ? null : toIndexJobRow(row);
    });
  }

  public async listIndexJobs(input: { readonly ownerId: string; readonly cursor?: string; readonly limit: number }): Promise<{ readonly items: readonly PersonalAIDurableIndexJobRow[]; readonly nextCursor: string | null }> {
    const ownerId = requireString(input.ownerId, 'ownerId');
    ensurePositiveInteger(input.limit, 'limit');
    const cursor = input.cursor === undefined ? null : requireString(input.cursor, 'cursor');
    return this.database.transaction(async (transaction) => {
      const result = await transaction.query<PostgresPersonalAIStoredIndexJobRow>({
        text: `
          SELECT id, owner_user_id AS "ownerId", scope, date_from AS "dateFrom", date_to AS "dateTo",
            source_types AS "sourceTypes", status, (SELECT version FROM personal_ai_index_versions v WHERE v.id = index_version_id) AS "indexVersion",
            indexed_source_count AS "indexedSourceCount", indexed_chunk_count AS "indexedChunkCount",
            failed_source_count AS "failedSourceCount", created_at AS "createdAt", started_at AS "startedAt",
            completed_at AS "completedAt", error_code AS "errorCode", selected_entry_ids AS "selectedEntryIds",
            selected_media_ids AS "selectedMediaIds", include_historical_revisions AS "includeHistoricalRevisions",
            request_fingerprint AS "requestFingerprint", idempotency_key AS "idempotencyKey",
            available_at AS "availableAt", attempt_count AS "attemptCount", lease_token AS "leaseToken",
            lease_owner AS "leaseOwner", lease_expires_at AS "leaseExpiresAt", last_heartbeat_at AS "lastHeartbeatAt"
          FROM personal_index_jobs
          WHERE owner_user_id = $1
          ORDER BY created_at DESC, id DESC`,
        values: [ownerId],
      });
      const ordered = result.rows
        .map(toIndexJobRow)
        .sort((left, right) => right.createdAt.localeCompare(left.createdAt) || right.id.localeCompare(left.id));
      const startIndex = cursor === null ? 0 : Math.max(0, ordered.findIndex((row) => row.id === cursor) + 1);
      const items = ordered.slice(startIndex, startIndex + input.limit);
      const nextCursor = ordered[startIndex + items.length] === undefined ? null : ordered[startIndex + items.length]!.id;
      return { items, nextCursor };
    });
  }

  public async readLatestIndexJob(input: { readonly ownerId: string; readonly indexVersion: string }): Promise<PersonalAIDurableIndexJobRow | null> {
    const ownerId = requireString(input.ownerId, 'ownerId');
    const indexVersion = requireString(input.indexVersion, 'indexVersion');
    return this.database.transaction(async (transaction) => {
      const result = await transaction.query<PostgresPersonalAIStoredIndexJobRow>({
        text: `
          SELECT id, owner_user_id AS "ownerId", scope, date_from AS "dateFrom", date_to AS "dateTo",
            source_types AS "sourceTypes", status, (SELECT version FROM personal_ai_index_versions v WHERE v.id = index_version_id) AS "indexVersion",
            indexed_source_count AS "indexedSourceCount", indexed_chunk_count AS "indexedChunkCount",
            failed_source_count AS "failedSourceCount", created_at AS "createdAt", started_at AS "startedAt",
            completed_at AS "completedAt", error_code AS "errorCode", selected_entry_ids AS "selectedEntryIds",
            selected_media_ids AS "selectedMediaIds", include_historical_revisions AS "includeHistoricalRevisions",
            request_fingerprint AS "requestFingerprint", idempotency_key AS "idempotencyKey",
            available_at AS "availableAt", attempt_count AS "attemptCount", lease_token AS "leaseToken",
            lease_owner AS "leaseOwner", lease_expires_at AS "leaseExpiresAt", last_heartbeat_at AS "lastHeartbeatAt"
          FROM personal_index_jobs
          WHERE owner_user_id = $1
          ORDER BY created_at DESC, id DESC`,
        values: [ownerId],
      });
      const rows = result.rows
        .filter((row) => row.indexVersion === indexVersion)
        .map(toIndexJobRow);
      return rows[0] ?? null;
    });
  }

  public async writePreferences(input: PersonalAIDurablePreferencesWrite): Promise<void> {
    const ownerId = requireString(input.ownerId, 'ownerId');
    await this.database.transaction(async (transaction) => {
      await transaction.query({
        text: `
          INSERT INTO personal_ai_preferences (
            owner_user_id, enabled, archive_mode, default_scope, include_historical_revisions,
            updated_at
          ) VALUES ($1, $2, $3, $4, $5, $6)
          ON CONFLICT (owner_user_id) DO UPDATE SET
            enabled = EXCLUDED.enabled,
            archive_mode = EXCLUDED.archive_mode,
            default_scope = EXCLUDED.default_scope,
            include_historical_revisions = EXCLUDED.include_historical_revisions,
            updated_at = EXCLUDED.updated_at`,
        values: [
          ownerId,
          input.preferences.enabled,
          input.preferences.archiveMode,
          input.preferences.defaultScope,
          input.preferences.includeHistoricalRevisions,
          input.preferences.updatedAt,
        ],
      });
    });
  }

  public async appendConsent(input: PersonalAIDurableConsentWrite): Promise<void> {
    const ownerId = requireString(input.ownerId, 'ownerId');
    await this.database.transaction(async (transaction) => {
      if (input.event.ownerId !== ownerId) {
        throw new Error('Personal AI consent event owner does not match its durable write owner.');
      }
      if (input.idempotency !== null) {
        if (
          input.idempotency.ownerId !== ownerId ||
          input.idempotency.operation !== 'CONSENT' ||
          input.event.idempotencyKey === null ||
          input.idempotency.key !== input.event.idempotencyKey ||
          input.idempotency.resourceId !== input.event.id ||
          !/^[a-f0-9]{64}$/u.test(input.idempotency.fingerprint)
        ) {
          throw new Error('Personal AI consent idempotency receipt does not match its durable event.');
        }
      }
      const inserted = await transaction.query<PostgresPersonalAIStoredConsentEventRow>({
        text: `
          INSERT INTO personal_ai_consent_events (
            id, owner_user_id, consent_version, event_type, provider_disclosure_version,
            policy_hash, idempotency_key, occurred_at
          ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
          ON CONFLICT (owner_user_id, idempotency_key) WHERE idempotency_key IS NOT NULL DO NOTHING
          RETURNING id, owner_user_id AS "ownerId", consent_version AS "consentVersion",
            event_type AS "eventType", provider_disclosure_version AS "providerDisclosureVersion",
            policy_hash AS "policyHash", idempotency_key AS "idempotencyKey", occurred_at AS "occurredAt"`,
        values: [
          input.event.id,
          ownerId,
          input.event.consentVersion,
          input.event.eventType,
          input.event.providerDisclosureVersion,
          input.event.policyHash,
          input.event.idempotencyKey,
          input.event.occurredAt,
        ],
      });
      if (inserted.rows[0] === undefined) {
        // A replay must be byte-for-byte the same consent decision.  In
        // particular, it must not use an already-accepted key to flip the
        // current preferences projection to WITHDRAWN (or vice versa).
        if (input.event.idempotencyKey === null) {
          throw new Error('Personal AI consent event could not be inserted without an idempotency key.');
        }
        const existingResult = await transaction.query<PostgresPersonalAIStoredConsentEventRow>({
          text: `
            SELECT id, owner_user_id AS "ownerId", consent_version AS "consentVersion",
              event_type AS "eventType", provider_disclosure_version AS "providerDisclosureVersion",
              policy_hash AS "policyHash", idempotency_key AS "idempotencyKey", occurred_at AS "occurredAt"
            FROM personal_ai_consent_events
            WHERE owner_user_id = $1 AND idempotency_key = $2
            LIMIT 1`,
          values: [ownerId, input.event.idempotencyKey],
        });
        const existing = existingResult.rows[0];
        if (
          existing === undefined ||
          existing.id !== input.event.id ||
          existing.ownerId !== ownerId ||
          existing.consentVersion !== input.event.consentVersion ||
          existing.eventType !== input.event.eventType ||
          existing.providerDisclosureVersion !== input.event.providerDisclosureVersion ||
          existing.policyHash !== input.event.policyHash ||
          existing.occurredAt !== input.event.occurredAt
        ) {
          throw new Error('Personal AI consent idempotency key conflicts with an earlier event.');
        }
        return;
      }
      await transaction.query({
        text: `
          INSERT INTO personal_ai_preferences (
            owner_user_id, consent_version, consent_accepted_at, updated_at
          ) VALUES ($1, $2, $3, $4)
          ON CONFLICT (owner_user_id) DO UPDATE SET
            consent_version = EXCLUDED.consent_version,
            consent_accepted_at = EXCLUDED.consent_accepted_at,
            updated_at = EXCLUDED.updated_at`,
        values: [
          ownerId,
          input.event.eventType === 'WITHDRAWN' ? null : input.event.consentVersion,
          input.event.eventType === 'WITHDRAWN' ? null : input.event.occurredAt,
          input.event.occurredAt,
        ],
      });
    });
  }

  public async enqueueIndexJob(input: PersonalAIDurableIndexJobEnqueueWrite): Promise<PersonalAIDurableIndexJobEnqueueResult> {
    const ownerId = requireString(input.ownerId, 'ownerId');
    const requestFingerprint = input.job.input.requestFingerprint;
    return this.database.transaction(async (transaction) => {
      const indexVersionId = await this.resolveIndexVersionId(transaction, input.job.indexVersion);
      const insertedJob = await transaction.query<PostgresPersonalAIStoredIndexJobRow>({
        text: `
          INSERT INTO personal_index_jobs (
            id, owner_user_id, scope, date_from, date_to, source_types, status, index_version_id,
            indexed_source_count, indexed_chunk_count, failed_source_count, created_at, started_at,
            completed_at, error_code, selected_entry_ids, selected_media_ids, include_historical_revisions,
            request_fingerprint, idempotency_key, available_at, attempt_count, lease_token, lease_owner,
            lease_expires_at, last_heartbeat_at
          ) VALUES (
            $1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18, $19, $20, $21, $22, $23, $24, $25, $26
          )
          ON CONFLICT DO NOTHING
          RETURNING
            id, owner_user_id AS "ownerId", scope, date_from AS "dateFrom", date_to AS "dateTo",
            source_types AS "sourceTypes", status, (SELECT version FROM personal_ai_index_versions v WHERE v.id = index_version_id) AS "indexVersion",
            indexed_source_count AS "indexedSourceCount", indexed_chunk_count AS "indexedChunkCount",
            failed_source_count AS "failedSourceCount", created_at AS "createdAt", started_at AS "startedAt",
            completed_at AS "completedAt", error_code AS "errorCode", selected_entry_ids AS "selectedEntryIds",
            selected_media_ids AS "selectedMediaIds", include_historical_revisions AS "includeHistoricalRevisions",
            request_fingerprint AS "requestFingerprint", idempotency_key AS "idempotencyKey",
            available_at AS "availableAt", attempt_count AS "attemptCount", lease_token AS "leaseToken",
            lease_owner AS "leaseOwner", lease_expires_at AS "leaseExpiresAt", last_heartbeat_at AS "lastHeartbeatAt"`,
        values: [
          input.job.id,
          ownerId,
          input.job.scope,
          input.job.dateRange?.from ?? null,
          input.job.dateRange?.to ?? null,
          [...input.job.sourceTypes],
          input.job.status,
          indexVersionId,
          input.job.indexedSourceCount,
          input.job.indexedChunkCount,
          input.job.failedSourceCount,
          input.job.createdAt,
          input.job.startedAt,
          input.job.completedAt,
          input.job.errorCode,
          [...input.job.input.selectedEntryIds],
          [...input.job.input.selectedMediaIds],
          input.job.input.includeHistoricalRevisions,
          requestFingerprint,
          input.job.idempotencyKey,
          input.job.availableAt,
          input.job.attemptCount,
          input.job.leaseToken,
          input.job.leaseOwner,
          input.job.leaseExpiresAt,
          input.job.lastHeartbeatAt,
        ],
      });
      const insertedJobRow = insertedJob.rows[0];
      // The unique (owner, idempotency_key) constraint is the first durable
      // replay decision.  Do not insert an outbox event for a newly generated
      // job ID when the job insert lost that race: the FK would reject it and,
      // more importantly, an at-least-once dispatcher must only ever see the
      // canonical committed job.
      if (insertedJobRow === undefined) {
        const canonical = await this.loadCanonicalEnqueuedJob(transaction, ownerId, input.job.id, input.job.idempotencyKey);
        if (canonical === null) {
          throw new Error('Personal AI index job idempotency replay could not be resolved.');
        }
        if (canonical.job.input.requestFingerprint !== requestFingerprint || canonical.outbox.payloadFingerprint !== input.outbox.payloadFingerprint) {
          throw new Error('Personal AI index job idempotency key conflicts with an earlier request.');
        }
        return { applied: false, job: canonical.job, outbox: canonical.outbox };
      }
      const insertedOutbox = await transaction.query<PostgresPersonalAIStoredOutboxRow>({
        text: `
          INSERT INTO personal_ai_index_outbox (
            id, owner_user_id, job_id, event_type, payload_fingerprint, status, available_at,
            created_at, dispatched_at, attempt_count, lease_token, lease_owner, lease_expires_at, last_error_code
          ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, NULL, NULL, NULL, NULL)
          ON CONFLICT DO NOTHING
          RETURNING id, owner_user_id AS "ownerId", job_id AS "jobId", event_type AS "eventType",
            payload_fingerprint AS "payloadFingerprint", status, available_at AS "availableAt",
            created_at AS "createdAt", dispatched_at AS "dispatchedAt", attempt_count AS "attemptCount",
            lease_token AS "leaseToken", lease_owner AS "leaseOwner", lease_expires_at AS "leaseExpiresAt",
            last_error_code AS "lastErrorCode"`,
        values: [
          input.outbox.id,
          ownerId,
          input.job.id,
          input.outbox.eventType,
          input.outbox.payloadFingerprint,
          input.outbox.status,
          input.outbox.availableAt,
          input.outbox.createdAt,
          input.outbox.dispatchedAt,
          input.outbox.attemptCount,
        ],
      });
      const insertedOutboxRow = insertedOutbox.rows[0];
      if (insertedOutboxRow === undefined) {
        // An outbox collision is not a replay (the job was newly inserted).
        // Remove the speculative job in this transaction and fail closed; the
        // caller can retry with the same idempotency key to get one canonical
        // job/outbox pair.
        await transaction.query({
          text: 'DELETE FROM personal_index_jobs WHERE owner_user_id = $1 AND id = $2',
          values: [ownerId, input.job.id],
        });
        throw new Error('Personal AI index outbox could not be created for the durable job.');
      }
      return {
        applied: true,
        job: toIndexJobRow(insertedJobRow),
        outbox: toOutboxRow(insertedOutboxRow),
      };
    });
  }

  public async claimIndexJobs(input: PersonalAIIndexJobClaimInput): Promise<readonly PersonalAIDurableIndexJobLease[]> {
    ensurePositiveInteger(input.limit, 'limit');
    ensurePositiveInteger(input.leaseDurationSeconds, 'leaseDurationSeconds');
    const now = requireString(input.now, 'now');
    const workerId = requireString(input.workerId, 'workerId');
    return this.database.transaction(async (transaction) => {
      const result = await transaction.query<PostgresPersonalAIStoredIndexJobRow>({
        text: `
          WITH candidate AS (
            SELECT id
            FROM personal_index_jobs
            WHERE status IN ('PENDING', 'INDEXING')
              AND available_at <= $1
              AND (lease_expires_at IS NULL OR lease_expires_at <= $1)
            ORDER BY available_at ASC, created_at ASC, id ASC
            FOR UPDATE SKIP LOCKED
            LIMIT $2
          )
          UPDATE personal_index_jobs job
          SET status = 'INDEXING',
              attempt_count = job.attempt_count + 1,
              lease_token = gen_random_uuid(),
              lease_owner = $3,
              lease_expires_at = ($1::timestamptz + make_interval(secs => $4)),
              last_heartbeat_at = $1::timestamptz,
              started_at = COALESCE(job.started_at, $1::timestamptz),
              completed_at = NULL,
              error_code = NULL
          FROM candidate
          WHERE job.id = candidate.id
          RETURNING job.id, job.owner_user_id AS "ownerId", job.scope, job.date_from AS "dateFrom",
            job.date_to AS "dateTo", job.source_types AS "sourceTypes", job.status,
            (SELECT version FROM personal_ai_index_versions v WHERE v.id = job.index_version_id) AS "indexVersion",
            job.indexed_source_count AS "indexedSourceCount", job.indexed_chunk_count AS "indexedChunkCount",
            job.failed_source_count AS "failedSourceCount", job.created_at AS "createdAt", job.started_at AS "startedAt",
            job.completed_at AS "completedAt", job.error_code AS "errorCode", job.selected_entry_ids AS "selectedEntryIds",
            job.selected_media_ids AS "selectedMediaIds", job.include_historical_revisions AS "includeHistoricalRevisions",
            job.request_fingerprint AS "requestFingerprint", job.idempotency_key AS "idempotencyKey",
            job.available_at AS "availableAt", job.attempt_count AS "attemptCount", job.lease_token AS "leaseToken",
            job.lease_owner AS "leaseOwner", job.lease_expires_at AS "leaseExpiresAt",
            job.last_heartbeat_at AS "lastHeartbeatAt"`,
        values: [now, input.limit, workerId, input.leaseDurationSeconds],
      });
      return result.rows.map((row) => toIndexJobLease(row, requireString(row.leaseToken, 'personal_index_jobs.lease_token'), workerId, now, requireString(row.leaseExpiresAt, 'personal_index_jobs.lease_expires_at')));
    });
  }

  public async renewIndexJobLease(input: PersonalAIIndexJobLeaseRenewal): Promise<PersonalAIDurableIndexJobLease | null> {
    const ownerId = requireString(input.ownerId, 'ownerId');
    const jobId = requireString(input.jobId, 'jobId');
    const leaseToken = requireString(input.leaseToken, 'leaseToken');
    const workerId = requireString(input.workerId, 'workerId');
    const now = requireString(input.now, 'now');
    ensurePositiveInteger(input.leaseDurationSeconds, 'leaseDurationSeconds');
    return this.database.transaction(async (transaction) => {
      const result = await transaction.query<PostgresPersonalAIStoredIndexJobRow>({
        text: `
          UPDATE personal_index_jobs
          SET lease_expires_at = ($4::timestamptz + make_interval(secs => $5)),
              last_heartbeat_at = $4::timestamptz
          WHERE owner_user_id = $1
            AND id = $2
            AND lease_token = $3
            AND lease_owner = $6
            AND status = 'INDEXING'
            AND (lease_expires_at IS NULL OR lease_expires_at > $4::timestamptz)
          RETURNING id, owner_user_id AS "ownerId", scope, date_from AS "dateFrom", date_to AS "dateTo",
            source_types AS "sourceTypes", status, (SELECT version FROM personal_ai_index_versions v WHERE v.id = index_version_id) AS "indexVersion",
            indexed_source_count AS "indexedSourceCount", indexed_chunk_count AS "indexedChunkCount",
            failed_source_count AS "failedSourceCount", created_at AS "createdAt", started_at AS "startedAt",
            completed_at AS "completedAt", error_code AS "errorCode", selected_entry_ids AS "selectedEntryIds",
            selected_media_ids AS "selectedMediaIds", include_historical_revisions AS "includeHistoricalRevisions",
            request_fingerprint AS "requestFingerprint", idempotency_key AS "idempotencyKey",
            available_at AS "availableAt", attempt_count AS "attemptCount", lease_token AS "leaseToken",
            lease_owner AS "leaseOwner", lease_expires_at AS "leaseExpiresAt", last_heartbeat_at AS "lastHeartbeatAt"`,
        values: [ownerId, jobId, leaseToken, now, input.leaseDurationSeconds, workerId],
      });
      const row = result.rows[0];
      return row === undefined ? null : toIndexJobLease(row, leaseToken, workerId, now, requireString(row.leaseExpiresAt, 'personal_index_jobs.lease_expires_at'));
    });
  }

  public async persistIndexProjection(input: PersonalAIDurableIndexProjectionWrite): Promise<void> {
    const ownerId = requireString(input.ownerId, 'ownerId');
    const jobId = requireString(input.jobId, 'jobId');
    const leaseToken = requireString(input.leaseToken, 'leaseToken');
    const workerId = requireString(input.workerId, 'workerId');
    return this.database.transaction(async (transaction) => {
      await this.requireLiveIndexJobLease(transaction, ownerId, jobId, leaseToken, workerId);
      // Resolve every source identity before the first destructive cleanup or
      // upsert.  Archive adapters provide a stable UUID, but a stale adapter
      // may accidentally pair that UUID with another source's natural
      // identity.  Letting the INSERT reach the database would either produce
      // an opaque unique/FK error or, worse, update the row named by the
      // supplied ID.  The preflight is owner-scoped, locks existing rows, and
      // rejects both directions of that mismatch explicitly.
      const sourceRecordIds = new Set<string>();
      const sourceNaturalKeys = new Set<string>();
      for (const source of input.sources) {
        if (source.ownerId !== ownerId) {
          throw new Error(`Personal AI source ${source.sourceRecordId} belongs to a different owner.`);
        }
        if (sourceRecordIds.has(source.sourceRecordId)) {
          throw new Error(`Personal AI projection contains duplicate source record ${source.sourceRecordId}.`);
        }
        sourceRecordIds.add(source.sourceRecordId);
        const naturalKey = JSON.stringify([
          source.sourceType,
          source.sourceId,
          source.truthLayer,
          source.revisionId ?? null,
        ]);
        if (sourceNaturalKeys.has(naturalKey)) {
          throw new Error(`Personal AI projection contains duplicate natural source identity for ${source.sourceType}/${source.sourceId}.`);
        }
        sourceNaturalKeys.add(naturalKey);
        await this.assertSourceIdentityAvailable(transaction, ownerId, source);
      }
      const versionIds = new Map<string, string>();
      const resolveVersionId = async (version: string): Promise<string> => {
        const cached = versionIds.get(version);
        if (cached !== undefined) return cached;
        const resolved = await this.resolveIndexVersionId(transaction, version);
        versionIds.set(version, resolved);
        return resolved;
      };
      for (const chunk of input.chunks) {
        if (!sourceRecordIds.has(chunk.sourceRecordId)) {
          throw new Error(`Chunk ${chunk.chunkId} references source record ${chunk.sourceRecordId} that is not part of the projection.`);
        }
      }
      for (const source of input.sources) {
        const indexVersionId = await resolveVersionId(source.indexVersion);
        await transaction.query({
          text: `
            INSERT INTO personal_knowledge_sources (
              id, owner_user_id, source_type, source_id, canonical_source_id, truth_layer, revision_id,
              occurred_at, created_at, updated_at, visibility, status, title, tags, index_version_id,
              index_status, related_source_ids, content_hash, invalidated_at, invalidation_reason
            ) VALUES (
              $1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14::text[], $15, $16, ARRAY[]::uuid[], $17, $18, $19
            )
            ON CONFLICT (owner_user_id, id) DO UPDATE SET
              source_type = EXCLUDED.source_type,
              source_id = EXCLUDED.source_id,
              canonical_source_id = EXCLUDED.canonical_source_id,
              truth_layer = EXCLUDED.truth_layer,
              revision_id = EXCLUDED.revision_id,
              occurred_at = EXCLUDED.occurred_at,
              created_at = EXCLUDED.created_at,
              updated_at = EXCLUDED.updated_at,
              visibility = EXCLUDED.visibility,
              status = EXCLUDED.status,
              title = EXCLUDED.title,
              tags = EXCLUDED.tags,
              index_version_id = EXCLUDED.index_version_id,
              index_status = EXCLUDED.index_status,
              content_hash = EXCLUDED.content_hash,
              invalidated_at = EXCLUDED.invalidated_at,
              invalidation_reason = EXCLUDED.invalidation_reason`,
          values: [
            source.sourceRecordId,
            ownerId,
            source.sourceType,
            source.sourceId,
            source.canonicalSourceId,
            source.truthLayer,
            source.revisionId,
            source.occurredAt,
            source.createdAt,
            source.updatedAt,
            source.visibility,
            source.status,
            source.title,
            [...source.tags],
            indexVersionId,
            source.indexStatus,
            source.contentHash,
            source.status === 'ACTIVE' ? null : source.updatedAt,
            source.status === 'ACTIVE' ? null : source.status,
          ],
        });
        await transaction.query({
          text: `
            DELETE FROM personal_knowledge_embeddings
            WHERE owner_user_id = $1
              AND chunk_id IN (
                SELECT id
                FROM personal_knowledge_chunks
                WHERE owner_user_id = $1 AND source_id = $2
              )`,
          values: [ownerId, source.sourceRecordId],
        });
        await transaction.query({
          text: `
            DELETE FROM personal_knowledge_chunks
            WHERE owner_user_id = $1
              AND source_id = $2`,
          values: [ownerId, source.sourceRecordId],
        });
      }
      const sourcesByRecordId = new Map(input.sources.map((source) => [source.sourceRecordId, source]));
      for (const invalidatedSourceRecordId of input.invalidatedSourceRecordIds) {
        const source = sourcesByRecordId.get(invalidatedSourceRecordId);
        if (source === undefined || source.status === 'ACTIVE') {
          throw new Error(`Personal AI invalidated source ${invalidatedSourceRecordId} is missing its non-active source projection.`);
        }
        await this.invalidateSourceRecordIds(
          transaction,
          ownerId,
          [invalidatedSourceRecordId],
          'INDEX_PROJECTION_INVALIDATED',
          source.updatedAt,
          source.status,
        );
      }
      for (const source of input.sources) {
        if (source.status !== 'ACTIVE') continue;
        const chunks = input.chunks.filter((chunk) => chunk.sourceRecordId === source.sourceRecordId);
        const indexVersionId = await resolveVersionId(source.indexVersion);
        for (const chunk of chunks) {
          const protectedText = requireProtectedPayload(chunk.protectedText, `personal_knowledge_chunks.${chunk.chunkId}.protectedText`);
          // `text` is a legacy non-null column.  Treat it as a fixed hash
          // marker rather than a secondary plaintext store; the encrypted
          // payload is the only durable source-derived text representation.
          if (chunk.excerpt !== chunk.contentHash || !/^[a-f0-9]{64}$/u.test(chunk.excerpt)) {
            throw new Error(`Personal AI chunk ${chunk.chunkId} must use its content hash as the legacy text marker.`);
          }
          await transaction.query({
            text: `
              INSERT INTO personal_knowledge_chunks (
                id, owner_user_id, source_id, chunk_index, content_hash, text, token_estimate, occurred_at,
                metadata, index_version_id, embedding_status, created_at, updated_at, text_ciphertext,
                text_key_reference, encryption_algorithm, encryption_version
              ) VALUES (
                $1, $2, $3, $4, $5, $6, $7, $8, $9::jsonb, $10, $11, $12, $13, $14, $15, $16, $17
              )
              ON CONFLICT (owner_user_id, id) DO UPDATE SET
                source_id = EXCLUDED.source_id,
                chunk_index = EXCLUDED.chunk_index,
                content_hash = EXCLUDED.content_hash,
                text = EXCLUDED.text,
                token_estimate = EXCLUDED.token_estimate,
                occurred_at = EXCLUDED.occurred_at,
                metadata = EXCLUDED.metadata,
                index_version_id = EXCLUDED.index_version_id,
                embedding_status = EXCLUDED.embedding_status,
                created_at = EXCLUDED.created_at,
                updated_at = EXCLUDED.updated_at,
                text_ciphertext = EXCLUDED.text_ciphertext,
                text_key_reference = EXCLUDED.text_key_reference,
                encryption_algorithm = EXCLUDED.encryption_algorithm,
                encryption_version = EXCLUDED.encryption_version`,
            values: [
              chunk.chunkId,
              ownerId,
              source.sourceRecordId,
              chunk.chunkIndex,
              chunk.contentHash,
              chunk.excerpt,
              chunk.tokenEstimate,
              chunk.occurredAt,
              JSON.stringify({ tags: [...chunk.tags] }),
              indexVersionId,
              chunk.embeddingStatus,
              source.createdAt,
              source.updatedAt,
              protectedText.ciphertext,
              protectedText.keyReference,
              protectedText.algorithm,
              protectedText.version,
            ],
          });
        }
      }
    });
  }

  public async completeIndexJob(input: PersonalAIIndexJobCompletion): Promise<void> {
    await this.database.transaction(async (transaction) => {
      const result = await transaction.query({
        text: `
          UPDATE personal_index_jobs
          SET status = $5,
              indexed_source_count = $6,
              indexed_chunk_count = $7,
              failed_source_count = $8,
              completed_at = $9,
              error_code = NULL,
              lease_token = NULL,
              lease_owner = NULL,
              lease_expires_at = NULL,
              last_heartbeat_at = $9
          WHERE owner_user_id = $1
            AND id = $2
            AND lease_token = $3
            AND lease_owner = $4
            AND status = 'INDEXING'
            AND lease_expires_at > now()
          RETURNING id`,
        values: [
          input.ownerId,
          input.jobId,
          input.leaseToken,
          input.workerId,
          input.status,
          input.indexedSourceCount,
          input.indexedChunkCount,
          input.failedSourceCount,
          input.completedAt,
        ],
      });
      if (result.rows[0] === undefined) {
        throw new Error('Personal AI index job lease could not be completed.');
      }
    });
  }

  public async failIndexJob(input: PersonalAIIndexJobFailure): Promise<void> {
    await this.database.transaction(async (transaction) => {
      const result = await transaction.query({
        text: `
          UPDATE personal_index_jobs
          SET status = CASE WHEN $6::timestamptz IS NULL THEN 'FAILED' ELSE 'PENDING' END,
              error_code = $5,
              completed_at = CASE WHEN $6::timestamptz IS NULL THEN $7 ELSE NULL END,
              available_at = COALESCE($6::timestamptz, $7::timestamptz),
              lease_token = NULL,
              lease_owner = NULL,
              lease_expires_at = NULL,
              last_heartbeat_at = $7
          WHERE owner_user_id = $1
            AND id = $2
            AND lease_token = $3
            AND lease_owner = $4
            AND status = 'INDEXING'
            AND lease_expires_at > now()
          RETURNING id`,
        values: [
          input.ownerId,
          input.jobId,
          input.leaseToken,
          input.workerId,
          input.errorCode,
          input.retryAt,
          input.failedAt,
        ],
      });
      if (result.rows[0] === undefined) {
        throw new Error('Personal AI index job lease could not be failed.');
      }
    });
  }

  public async invalidateSource(input: PersonalAIDurableSourceInvalidation): Promise<void> {
    const ownerId = requireString(input.ownerId, 'ownerId');
    const sourceType = input.sourceType;
    const sourceId = requireString(input.sourceId, 'sourceId');
    const occurredAt = requireString(input.occurredAt, 'occurredAt');
    await this.database.transaction(async (transaction) => {
      const result = await transaction.query<{ readonly sourceRecordId: string }>({
        text: `
          SELECT id AS "sourceRecordId"
          FROM personal_knowledge_sources
          WHERE owner_user_id = $1
            AND source_type = $2
            AND (source_id = $3 OR canonical_source_id = $3 OR $3 = ANY(related_source_ids))
            AND ($4::uuid IS NULL OR revision_id = $4::uuid)`,
        values: [ownerId, sourceType, sourceId, input.revisionId],
      });
      const sourceRecordIds = result.rows.map((row) => row.sourceRecordId);
      if (sourceRecordIds.length === 0) return;
      await this.invalidateSourceRecordIds(transaction, ownerId, sourceRecordIds, input.reason, occurredAt, input.status);
    });
  }

  public async persistQuery(input: PersonalAIDurableQueryWrite): Promise<void> {
    const ownerId = requireString(input.ownerId, 'ownerId');
    if (input.query.ownerId !== ownerId) throw new Error('Personal AI query owner mismatch.');
    if (input.conversation !== null && input.conversation.ownerId !== ownerId) throw new Error('Personal AI conversation owner mismatch.');
    if (input.citations.some((citation) => citation.ownerId !== ownerId || citation.queryId !== input.query.queryId)) {
      throw new Error('Personal AI citation owner or query mismatch.');
    }
    await this.database.transaction(async (transaction) => {
      if (input.conversation !== null) {
        await transaction.query({
          text: `
            INSERT INTO personal_ai_conversations (
              id, owner_user_id, current_scope, created_at, updated_at, deleted_at
            ) VALUES ($1, $2, $3, $4, $5, $6)
            ON CONFLICT (owner_user_id, id) DO UPDATE SET
              current_scope = EXCLUDED.current_scope,
              created_at = EXCLUDED.created_at,
              updated_at = EXCLUDED.updated_at,
              deleted_at = EXCLUDED.deleted_at`,
          values: [
            input.conversation.id,
            ownerId,
            input.conversation.currentScope,
            input.conversation.createdAt,
            input.conversation.updatedAt,
            input.conversation.deletedAt,
          ],
        });
      }
      await transaction.query({
        text: `
          INSERT INTO personal_ai_queries (
            id, owner_user_id, conversation_id, question_hash, status, evidence_kind, scope,
            archive_mode, retrieved_chunk_count, retrieval_latency_ms, generation_latency_ms, model_code,
            provider_code, input_tokens, output_tokens, total_tokens, cost_fen, answer_ciphertext, created_at
          ) VALUES (
            $1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18, $19
          )
          ON CONFLICT (owner_user_id, id) DO UPDATE SET
            conversation_id = EXCLUDED.conversation_id,
            question_hash = EXCLUDED.question_hash,
            status = EXCLUDED.status,
            evidence_kind = EXCLUDED.evidence_kind,
            scope = EXCLUDED.scope,
            archive_mode = EXCLUDED.archive_mode,
            retrieved_chunk_count = EXCLUDED.retrieved_chunk_count,
            retrieval_latency_ms = EXCLUDED.retrieval_latency_ms,
            generation_latency_ms = EXCLUDED.generation_latency_ms,
            model_code = EXCLUDED.model_code,
            provider_code = EXCLUDED.provider_code,
            input_tokens = EXCLUDED.input_tokens,
            output_tokens = EXCLUDED.output_tokens,
            total_tokens = EXCLUDED.total_tokens,
            cost_fen = EXCLUDED.cost_fen,
            answer_ciphertext = EXCLUDED.answer_ciphertext,
            created_at = EXCLUDED.created_at`,
        values: [
          input.query.queryId,
          ownerId,
          input.query.conversationId,
          input.query.questionHash,
          input.query.result.status,
          input.query.result.evidenceKind,
          input.query.result.scope,
          input.query.result.archiveMode,
          input.query.result.retrievedChunkCount,
          input.query.result.retrievalLatencyMs,
          input.query.result.generationLatencyMs,
          input.query.result.usage.modelCode,
          input.query.result.usage.providerCode,
          input.query.result.usage.inputTokens,
          input.query.result.usage.outputTokens,
          input.query.result.usage.totalTokens,
          input.query.result.usage.costFen,
          input.query.answer === null ? null : encodeProtectedPayload(input.query.answer),
          input.query.createdAt,
        ],
      });
      for (const citation of input.citations) {
        await transaction.query({
          text: `
            INSERT INTO personal_ai_citations (
              id, owner_user_id, query_id, source_type, source_id, revision_id, occurred_at,
              truth_layer, excerpt_safe, relevance_score, revoked_at, source_record_id
            ) VALUES (
              $1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12
            )
            ON CONFLICT (owner_user_id, id) DO UPDATE SET
              query_id = EXCLUDED.query_id,
              source_type = EXCLUDED.source_type,
              source_id = EXCLUDED.source_id,
              revision_id = EXCLUDED.revision_id,
              occurred_at = EXCLUDED.occurred_at,
              truth_layer = EXCLUDED.truth_layer,
              excerpt_safe = EXCLUDED.excerpt_safe,
              relevance_score = EXCLUDED.relevance_score,
              revoked_at = EXCLUDED.revoked_at,
              source_record_id = EXCLUDED.source_record_id`,
          values: [
            citation.citationId,
            ownerId,
            input.query.queryId,
            citation.sourceType,
            citation.sourceId,
            citation.revisionId,
            citation.occurredAt,
            citation.truthLayer,
            citation.excerptSafe,
            citation.relevanceScore,
            null,
            citation.sourceRecordId,
          ],
        });
      }
    });
  }

  public async persistInsight(input: PersonalAIDurableInsightWrite): Promise<void> {
    const ownerId = requireString(input.ownerId, 'ownerId');
    if (input.insight.ownerId !== ownerId) throw new Error('Personal AI insight owner mismatch.');
    await this.database.transaction(async (transaction) => {
      await transaction.query({
        text: `
          INSERT INTO ai_insights (
            id, owner_user_id, query_id, title, content_ciphertext, truth_layer, created_at, deleted_at
          ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
          ON CONFLICT (owner_user_id, id) DO UPDATE SET
            query_id = EXCLUDED.query_id,
            title = EXCLUDED.title,
            content_ciphertext = EXCLUDED.content_ciphertext,
            truth_layer = EXCLUDED.truth_layer,
            created_at = EXCLUDED.created_at,
            deleted_at = EXCLUDED.deleted_at`,
        values: [
          input.insight.insightId,
          ownerId,
          input.insight.queryId,
          input.insight.title,
          encodeInsightEnvelope({ content: input.insight.content, citationIds: [...input.insight.citationIds] }),
          input.insight.truthLayer,
          input.insight.createdAt,
          input.insight.deletedAt,
        ],
      });
    });
  }

  public async clearOwner(input: { readonly ownerId: string; readonly occurredAt: string }): Promise<void> {
    const ownerId = requireString(input.ownerId, 'ownerId');
    await this.database.transaction(async (transaction) => {
      await transaction.query({ text: 'DELETE FROM personal_ai_citations WHERE owner_user_id = $1', values: [ownerId] });
      await transaction.query({ text: 'DELETE FROM ai_insights WHERE owner_user_id = $1', values: [ownerId] });
      await transaction.query({ text: 'DELETE FROM personal_ai_queries WHERE owner_user_id = $1', values: [ownerId] });
      await transaction.query({ text: 'DELETE FROM personal_ai_conversations WHERE owner_user_id = $1', values: [ownerId] });
      await transaction.query({ text: 'DELETE FROM personal_knowledge_embeddings WHERE owner_user_id = $1', values: [ownerId] });
      await transaction.query({ text: 'DELETE FROM personal_knowledge_chunks WHERE owner_user_id = $1', values: [ownerId] });
      await transaction.query({ text: 'DELETE FROM personal_ai_index_outbox WHERE owner_user_id = $1', values: [ownerId] });
      await transaction.query({ text: 'DELETE FROM personal_index_jobs WHERE owner_user_id = $1', values: [ownerId] });
      await transaction.query({ text: 'DELETE FROM personal_knowledge_sources WHERE owner_user_id = $1', values: [ownerId] });
      await transaction.query({ text: 'DELETE FROM personal_ai_consent_events WHERE owner_user_id = $1', values: [ownerId] });
      await transaction.query({ text: 'DELETE FROM personal_ai_preferences WHERE owner_user_id = $1', values: [ownerId] });
      await transaction.query({ text: 'DELETE FROM personal_ai_export_jobs WHERE owner_user_id = $1', values: [ownerId] });
    });
  }

  public async claimIndexOutbox(input: PersonalAIIndexOutboxClaimInput): Promise<readonly PersonalAIIndexOutboxLease[]> {
    ensurePositiveInteger(input.limit, 'limit');
    ensurePositiveInteger(input.leaseDurationSeconds, 'leaseDurationSeconds');
    const now = requireString(input.now, 'now');
    const workerId = requireString(input.workerId, 'workerId');
    return this.database.transaction(async (transaction) => {
      const result = await transaction.query<PostgresPersonalAIStoredOutboxRow>({
        text: `
          WITH candidate AS (
            SELECT id
            FROM personal_ai_index_outbox
            WHERE status IN ('PENDING', 'DISPATCHING', 'FAILED')
              AND available_at <= $1
              AND (lease_expires_at IS NULL OR lease_expires_at <= $1)
            ORDER BY available_at ASC, created_at ASC, id ASC
            FOR UPDATE SKIP LOCKED
            LIMIT $2
          )
          UPDATE personal_ai_index_outbox event
          SET status = 'DISPATCHING',
              attempt_count = event.attempt_count + 1,
              lease_token = gen_random_uuid(),
              lease_owner = $3,
              lease_expires_at = ($1::timestamptz + make_interval(secs => $4))
          FROM candidate
          WHERE event.id = candidate.id
          RETURNING event.id, event.owner_user_id AS "ownerId", event.job_id AS "jobId",
            event.event_type AS "eventType", event.payload_fingerprint AS "payloadFingerprint",
            event.status, event.available_at AS "availableAt", event.created_at AS "createdAt",
            event.dispatched_at AS "dispatchedAt", event.attempt_count AS "attemptCount",
            event.lease_token AS "leaseToken", event.lease_owner AS "leaseOwner",
            event.lease_expires_at AS "leaseExpiresAt", event.last_error_code AS "lastErrorCode"`,
        values: [now, input.limit, workerId, input.leaseDurationSeconds],
      });
      return result.rows.map((row) => toOutboxLease(row, requireString(row.leaseToken, 'personal_ai_index_outbox.lease_token'), workerId, now, requireString(row.leaseExpiresAt, 'personal_ai_index_outbox.lease_expires_at')));
    });
  }

  public async acknowledgeIndexOutbox(input: PersonalAIIndexOutboxAcknowledgeInput): Promise<void> {
    await this.database.transaction(async (transaction) => {
      const result = await transaction.query({
        text: `
          UPDATE personal_ai_index_outbox
          SET status = 'DISPATCHED',
              dispatched_at = $4,
              lease_token = NULL,
              lease_owner = NULL,
              lease_expires_at = NULL
          WHERE id = $1
            AND lease_token = $2
            AND lease_owner = $3
            AND status = 'DISPATCHING'
          RETURNING id`,
        values: [input.eventId, input.leaseToken, input.workerId, input.dispatchedAt],
      });
      if (result.rows[0] === undefined) {
        throw new Error('Personal AI outbox lease could not be acknowledged.');
      }
    });
  }

  public async releaseIndexOutbox(input: PersonalAIIndexOutboxReleaseInput): Promise<void> {
    await this.database.transaction(async (transaction) => {
      const result = await transaction.query({
        text: `
          UPDATE personal_ai_index_outbox
          SET status = 'FAILED',
              available_at = $4::timestamptz,
              lease_token = NULL,
              lease_owner = NULL,
              lease_expires_at = NULL,
              last_error_code = $5
          WHERE id = $1
            AND lease_token = $2
            AND lease_owner = $3
            AND status = 'DISPATCHING'
          RETURNING id`,
        values: [input.eventId, input.leaseToken, input.workerId, input.retryAt, input.errorCode],
      });
      if (result.rows[0] === undefined) {
        throw new Error('Personal AI outbox lease could not be released.');
      }
    });
  }

  private async resolveIndexVersionId(transaction: PostgresPersonalAITransaction, indexVersion: string): Promise<string> {
    const cached = this.indexVersionIdCache.get(indexVersion);
    if (cached !== undefined) return cached;
    const result = await transaction.query<PostgresPersonalAIStoredIndexVersionRow>({
      text: 'SELECT id, version FROM personal_ai_index_versions WHERE version = $1 LIMIT 1',
      values: [indexVersion],
    });
    const row = result.rows[0];
    if (row === undefined) {
      throw new Error(`Unknown personal AI index version: ${indexVersion}`);
    }
    this.indexVersionIdCache.set(indexVersion, row.id);
    return row.id;
  }

  private async assertSourceIdentityAvailable(
    transaction: PostgresPersonalAITransaction,
    ownerId: string,
    source: PersonalAIDurableKnowledgeSourceRow,
  ): Promise<void> {
    const result = await transaction.query<PostgresPersonalAIStoredSourceIdentityRow>({
      text: `
        SELECT id AS "sourceRecordId", owner_user_id AS "ownerId", source_type AS "sourceType",
          source_id AS "sourceId", truth_layer AS "truthLayer", revision_id AS "revisionId"
        FROM personal_knowledge_sources
        WHERE (owner_user_id = $1 AND (
          id = $2::uuid
          OR (
            source_type = $3
            AND source_id = $4::uuid
            AND truth_layer = $5
            AND revision_id IS NOT DISTINCT FROM $6::uuid
          )
        ))
        OR id = $2::uuid
        FOR UPDATE`,
      values: [ownerId, source.sourceRecordId, source.sourceType, source.sourceId, source.truthLayer, source.revisionId],
    });
    const rows = [...result.rows];
    // PostgreSQL canonicalizes UUID text to lowercase.  Compare canonical
    // forms so a direct server caller cannot evade the foreign-owner check by
    // supplying an uppercase UUID spelling.
    const suppliedId = source.sourceRecordId.toLowerCase();
    const bySuppliedId = rows.filter((row) => row.sourceRecordId.toLowerCase() === suppliedId);
    const byNaturalIdentity = rows.filter((row) => row.ownerId === ownerId && sourceNaturalIdentityMatches(row, source));

    const foreignOwnerRow = bySuppliedId.find((row) => row.ownerId !== ownerId);
    if (foreignOwnerRow !== undefined) {
      throw new Error(`Personal AI source record ${source.sourceRecordId} belongs to a different owner.`);
    }
    if (bySuppliedId.length > 1 || byNaturalIdentity.length > 1) {
      throw new Error(`Personal AI source identity ${source.sourceRecordId} is not unique for the owner.`);
    }
    const naturalRow = byNaturalIdentity[0];
    if (naturalRow !== undefined && naturalRow.sourceRecordId !== source.sourceRecordId) {
      throw new Error(
        `Personal AI sourceRecordId ${source.sourceRecordId} conflicts with canonical source record ${naturalRow.sourceRecordId} for its owner/type/source/truth/revision identity.`,
      );
    }
    const suppliedRow = bySuppliedId[0];
    if (suppliedRow !== undefined && !sourceNaturalIdentityMatches(suppliedRow, source)) {
      throw new Error(
        `Personal AI sourceRecordId ${source.sourceRecordId} is already bound to a different owner/type/source/truth/revision identity.`,
      );
    }
  }

  private async loadCanonicalEnqueuedJob(transaction: PostgresPersonalAITransaction, ownerId: string, jobId: string, idempotencyKey: string | null): Promise<{ readonly job: PersonalAIDurableIndexJobRow; readonly outbox: PersonalAIIndexOutboxEvent } | null> {
    const byJobId = await transaction.query<PostgresPersonalAIStoredIndexJobRow>({
      text: `
        SELECT id, owner_user_id AS "ownerId", scope, date_from AS "dateFrom", date_to AS "dateTo",
          source_types AS "sourceTypes", status, (SELECT version FROM personal_ai_index_versions v WHERE v.id = index_version_id) AS "indexVersion",
          indexed_source_count AS "indexedSourceCount", indexed_chunk_count AS "indexedChunkCount",
          failed_source_count AS "failedSourceCount", created_at AS "createdAt", started_at AS "startedAt",
          completed_at AS "completedAt", error_code AS "errorCode", selected_entry_ids AS "selectedEntryIds",
          selected_media_ids AS "selectedMediaIds", include_historical_revisions AS "includeHistoricalRevisions",
          request_fingerprint AS "requestFingerprint", idempotency_key AS "idempotencyKey",
          available_at AS "availableAt", attempt_count AS "attemptCount", lease_token AS "leaseToken",
          lease_owner AS "leaseOwner", lease_expires_at AS "leaseExpiresAt", last_heartbeat_at AS "lastHeartbeatAt"
        FROM personal_index_jobs
        WHERE owner_user_id = $1 AND id = $2
        LIMIT 1`,
      values: [ownerId, jobId],
    });
    let jobRow = byJobId.rows[0];
    if (jobRow === undefined && idempotencyKey !== null) {
      const byIdempotency = await transaction.query<PostgresPersonalAIStoredIndexJobRow>({
        text: `
          SELECT id, owner_user_id AS "ownerId", scope, date_from AS "dateFrom", date_to AS "dateTo",
            source_types AS "sourceTypes", status, (SELECT version FROM personal_ai_index_versions v WHERE v.id = index_version_id) AS "indexVersion",
            indexed_source_count AS "indexedSourceCount", indexed_chunk_count AS "indexedChunkCount",
            failed_source_count AS "failedSourceCount", created_at AS "createdAt", started_at AS "startedAt",
            completed_at AS "completedAt", error_code AS "errorCode", selected_entry_ids AS "selectedEntryIds",
            selected_media_ids AS "selectedMediaIds", include_historical_revisions AS "includeHistoricalRevisions",
            request_fingerprint AS "requestFingerprint", idempotency_key AS "idempotencyKey",
            available_at AS "availableAt", attempt_count AS "attemptCount", lease_token AS "leaseToken",
            lease_owner AS "leaseOwner", lease_expires_at AS "leaseExpiresAt", last_heartbeat_at AS "lastHeartbeatAt"
          FROM personal_index_jobs
          WHERE owner_user_id = $1 AND idempotency_key = $2
          LIMIT 1`,
        values: [ownerId, idempotencyKey],
      });
      jobRow = byIdempotency.rows[0];
    }
    if (jobRow === undefined) return null;
    const outboxResult = await transaction.query<PostgresPersonalAIStoredOutboxRow>({
      text: `
        SELECT id, owner_user_id AS "ownerId", job_id AS "jobId", event_type AS "eventType",
          payload_fingerprint AS "payloadFingerprint", status, available_at AS "availableAt",
          created_at AS "createdAt", dispatched_at AS "dispatchedAt", attempt_count AS "attemptCount",
          lease_token AS "leaseToken", lease_owner AS "leaseOwner", lease_expires_at AS "leaseExpiresAt",
          last_error_code AS "lastErrorCode"
        FROM personal_ai_index_outbox
        WHERE owner_user_id = $1 AND job_id = $2
        ORDER BY created_at ASC, id ASC
        LIMIT 1`,
      values: [ownerId, jobRow.id],
    });
    const outboxRow = outboxResult.rows[0];
    if (outboxRow === undefined) return null;
    return { job: toIndexJobRow(jobRow), outbox: toOutboxRow(outboxRow) };
  }

  private async requireLiveIndexJobLease(
    transaction: PostgresPersonalAITransaction,
    ownerId: string,
    jobId: string,
    leaseToken: string,
    workerId: string,
  ): Promise<PostgresPersonalAIStoredIndexJobRow> {
    const result = await transaction.query<PostgresPersonalAIStoredIndexJobRow>({
      text: `
        SELECT id, owner_user_id AS "ownerId", scope, date_from AS "dateFrom", date_to AS "dateTo",
          source_types AS "sourceTypes", status, (SELECT version FROM personal_ai_index_versions v WHERE v.id = index_version_id) AS "indexVersion",
          indexed_source_count AS "indexedSourceCount", indexed_chunk_count AS "indexedChunkCount",
          failed_source_count AS "failedSourceCount", created_at AS "createdAt", started_at AS "startedAt",
          completed_at AS "completedAt", error_code AS "errorCode", selected_entry_ids AS "selectedEntryIds",
          selected_media_ids AS "selectedMediaIds", include_historical_revisions AS "includeHistoricalRevisions",
          request_fingerprint AS "requestFingerprint", idempotency_key AS "idempotencyKey",
          available_at AS "availableAt", attempt_count AS "attemptCount", lease_token AS "leaseToken",
          lease_owner AS "leaseOwner", lease_expires_at AS "leaseExpiresAt", last_heartbeat_at AS "lastHeartbeatAt"
        FROM personal_index_jobs
        WHERE owner_user_id = $1
          AND id = $2
          AND lease_token = $3
          AND lease_owner = $4
          AND status = 'INDEXING'
          AND lease_expires_at > now()
        LIMIT 1`,
      values: [ownerId, jobId, leaseToken, workerId],
    });
    const row = result.rows[0];
    if (row === undefined) {
      throw new Error('Personal AI index job lease is no longer valid.');
    }
    return row;
  }

  private async invalidateSourceRecordIds(
    transaction: PostgresPersonalAITransaction,
    ownerId: string,
    sourceRecordIds: readonly string[],
    reason: string,
    occurredAt: string,
    status: PersonalAIDurableSourceInvalidation['status'] = 'DELETED',
  ): Promise<void> {
    for (const sourceRecordId of sourceRecordIds) {
      await transaction.query({
        text: `
          UPDATE personal_knowledge_sources
          SET status = $3,
              index_status = 'DELETED',
              updated_at = $2,
              invalidated_at = $2,
              invalidation_reason = $4
          WHERE owner_user_id = $1 AND id = $5`,
        values: [ownerId, occurredAt, status, reason, sourceRecordId],
      });
      await transaction.query({
        text: `
          UPDATE personal_ai_citations
          SET revoked_at = $2
          WHERE owner_user_id = $1 AND source_record_id = $3`,
        values: [ownerId, occurredAt, sourceRecordId],
      });
      await transaction.query({
        text: `
          DELETE FROM personal_knowledge_embeddings
          WHERE owner_user_id = $1
            AND chunk_id IN (
              SELECT id
              FROM personal_knowledge_chunks
              WHERE owner_user_id = $1 AND source_id = $2
            )`,
        values: [ownerId, sourceRecordId],
      });
      await transaction.query({
        text: `
          DELETE FROM personal_knowledge_chunks
          WHERE owner_user_id = $1 AND source_id = $2`,
        values: [ownerId, sourceRecordId],
      });
    }
  }
}
