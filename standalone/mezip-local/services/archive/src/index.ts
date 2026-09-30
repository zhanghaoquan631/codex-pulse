import { randomUUID } from 'node:crypto';

import type {
  ArchiveAiInsight,
  ArchiveConflict,
  ArchiveEntry,
  ArchiveEntryInput,
  ArchiveEntryPatch,
  ArchiveEntryStatus,
  ArchiveExport,
  ArchiveFitnessEntry,
  ArchiveFitnessInput,
  ArchiveFitnessPatch,
  ArchiveHistoryEntry,
  ArchiveHistoryInput,
  ArchiveHistoryPatch,
  ArchiveMediaMetadata,
  ArchiveMediaPatch,
  ArchiveMediaInput,
  ArchiveOfflineMutation,
  ArchiveRevision,
  ArchiveRevisionSource,
  ArchiveSearchResult,
  ArchiveSnapshot,
  ArchivePublishedSnapshot,
  ArchiveSyncState,
  ArchiveTimelineItem,
  AuthenticatedPrincipal,
  BodyMetric,
  BodyMetricInput,
  DailyPack,
  DailyPackInput,
  DailyPackPatch,
  JsonObject,
  JsonValue,
  MediaLink,
  RecordKind,
  StepRecord,
  StepRecordInput,
  StorageQuota,
} from '@me-zip/shared-types';

export type ArchiveErrorCode =
  | 'NOT_FOUND'
  | 'FORBIDDEN'
  | 'CONFLICT'
  | 'VALIDATION'
  | 'QUOTA_EXCEEDED'
  | 'INVALID_STATE'
  | 'IDEMPOTENCY_REPLAY';

export class ArchiveError extends Error {
  public readonly code: ArchiveErrorCode;
  public readonly details: Readonly<Record<string, string | number>>;

  public constructor(
    code: ArchiveErrorCode,
    message: string,
    details: Readonly<Record<string, string | number>> = {},
  ) {
    super(message);
    this.name = 'ArchiveError';
    this.code = code;
    this.details = details;
  }
}

export class ArchiveAuthorizationError extends ArchiveError {
  public constructor() {
    super('FORBIDDEN', 'Archive data is not available to this principal.');
    this.name = 'ArchiveAuthorizationError';
  }
}

export class ArchiveNotFoundError extends ArchiveError {
  public constructor() {
    super('NOT_FOUND', 'Archive resource was not found.');
    this.name = 'ArchiveNotFoundError';
  }
}

export class ArchiveConflictError extends ArchiveError {
  public readonly conflictId: string;

  public constructor(conflictId: string, expectedRevision: number, actualRevision: number) {
    super('CONFLICT', 'The archive resource changed since the client last read it.', {
      expectedRevision,
      actualRevision,
    });
    this.name = 'ArchiveConflictError';
    this.conflictId = conflictId;
  }
}

export interface ArchiveRuntime {
  readonly now: () => string;
  readonly id: () => string;
}

const defaultRuntime: ArchiveRuntime = {
  now: () => new Date().toISOString(),
  id: () => randomUUID(),
};

export interface ArchiveStateSnapshot {
  readonly entries: readonly ArchiveEntry[];
  readonly revisions: readonly ArchiveRevision[];
  readonly snapshots: readonly ArchiveSnapshot[];
  readonly publishedSnapshots: readonly ArchivePublishedSnapshot[];
  readonly aiInsights: readonly ArchiveAiInsight[];
  readonly histories: readonly ArchiveHistoryEntry[];
  readonly fitness: readonly ArchiveFitnessEntry[];
  readonly bodyMetrics: readonly BodyMetric[];
  readonly steps: readonly StepRecord[];
  readonly dailyPacks: readonly DailyPack[];
  readonly media: readonly ArchiveMediaMetadata[];
  readonly mediaLinks: readonly MediaLink[];
  readonly offlineMutations: readonly ArchiveOfflineMutation[];
  readonly conflicts: readonly ArchiveConflict[];
  readonly idempotency?: readonly ArchiveIdempotencySnapshot[];
}

/** Persistence seam used by a database adapter. The local implementation is
 * intentionally process-memory only; callers can provide a durable adapter
 * that serialises this snapshot in one transaction. */
export interface ArchivePersistence {
  read(): ArchiveStateSnapshot | null;
  write(snapshot: ArchiveStateSnapshot): void;
}

export class InMemoryArchivePersistence implements ArchivePersistence {
  private snapshot: ArchiveStateSnapshot | null = null;

  public read(): ArchiveStateSnapshot | null {
    return this.snapshot === null ? null : clone(this.snapshot);
  }

  public write(snapshot: ArchiveStateSnapshot): void {
    this.snapshot = clone(snapshot);
  }
}

/**
 * Minimal, body-free change notification for archive records that can be
 * indexed by another bounded context.  The Archive package deliberately owns
 * this vocabulary instead of importing a consumer such as Personal AI.
 *
 * Consumers should treat `(ownerId, sourceType, sourceId, revision, action)`
 * as an idempotency key.  A repository publishes the event only after its
 * archive state has been persisted, and never republishes it for an
 * idempotency replay.
 */
export type ArchiveLifecycleSourceType = 'ENTRY' | 'HISTORY' | 'FITNESS' | 'DAILY_PACK';
export type ArchiveSourceLifecycleAction = 'SAVED' | 'REVISED' | 'TRASHED' | 'RESTORED' | 'DELETED';

export interface ArchiveSourceLifecycleEvent {
  readonly ownerId: string;
  readonly sourceType: ArchiveLifecycleSourceType;
  readonly sourceId: string;
  readonly revision: number;
  readonly status: 'ACTIVE' | 'TRASHED' | 'DELETED';
  readonly action: ArchiveSourceLifecycleAction;
  readonly changedAt: string;
}

/**
 * Optional outbound port for source lifecycle work.  It is intentionally
 * synchronous and body-free so a composition can adapt it to an outbox,
 * queue, or local worker without coupling Archive to that implementation.
 */
export interface ArchiveSourceLifecycleSink {
  publish(event: ArchiveSourceLifecycleEvent): void;
}

/** Raw WeChat Sport data is accepted only as an encrypted one-time payload. */
export interface WeChatSportEncryptedPayload {
  readonly encryptedData: string;
  readonly iv: string;
  readonly idempotencyKey?: string;
}

/**
 * Server-only boundary: implementations resolve the current user's WeChat
 * session key, decrypt and validate its watermark before returning normalized
 * day/step pairs. The archive service never receives a session key.
 */
export interface WeChatSportVerifier {
  verify(
    principal: AuthenticatedPrincipal,
    input: Pick<WeChatSportEncryptedPayload, 'encryptedData' | 'iv'>,
  ): readonly { readonly day: string; readonly steps: number }[];
}

export interface ArchiveRepositoryOptions {
  readonly persistence?: ArchivePersistence;
  readonly runtime?: Partial<ArchiveRuntime>;
  readonly quotaBytes?: number;
  readonly lifecycleSink?: ArchiveSourceLifecycleSink;
  readonly weChatSportVerifier?: WeChatSportVerifier;
}

export interface EntryListOptions {
  readonly includeTrashed?: boolean;
  readonly kind?: RecordKind;
  readonly limit?: number;
  readonly cursor?: string;
}

export interface TimelineOptions {
  readonly includeTrashed?: boolean;
  readonly from?: string;
  readonly to?: string;
  readonly limit?: number;
  readonly cursor?: string;
}

export interface SearchOptions {
  readonly includeTrashed?: boolean;
  readonly limit?: number;
  readonly cursor?: string;
}

/** Search stays provider-shaped so SQL/full-text can replace the local scan. */
export interface SearchProvider {
  search(
    principal: AuthenticatedPrincipal,
    query: string,
    options?: SearchOptions,
  ): readonly ArchiveSearchResult[];
}

export interface ArchiveMutationOptions {
  readonly expectedRevision?: number;
  readonly idempotencyKey?: string;
  readonly source?: ArchiveRevisionSource;
}

export interface ArchiveOfflineMutationInput {
  readonly clientMutationId: string;
  readonly entityType: ArchiveOfflineMutation['entityType'];
  readonly entityId?: string | null;
  readonly operation: ArchiveOfflineMutation['operation'];
  readonly payload: JsonObject;
  readonly baseRevision?: number | null;
}

export interface ArchiveConflictResolution {
  readonly resolution: 'KEEP_SERVER' | 'KEEP_LOCAL' | 'MERGED';
  readonly mergedPayload?: JsonObject;
}

interface IdempotencyReceipt {
  readonly fingerprint: string;
  readonly result: unknown;
}

export interface ArchiveIdempotencySnapshot {
  readonly key: string;
  readonly fingerprint: string;
  readonly result: unknown;
}

interface ArchiveState {
  readonly entries: Map<string, ArchiveEntry>;
  readonly revisions: Map<string, ArchiveRevision[]>;
  readonly snapshots: Map<string, ArchiveSnapshot[]>;
  readonly publishedSnapshots: Map<string, ArchivePublishedSnapshot[]>;
  readonly aiInsights: Map<string, ArchiveAiInsight>;
  readonly histories: Map<string, ArchiveHistoryEntry>;
  readonly fitness: Map<string, ArchiveFitnessEntry>;
  readonly bodyMetrics: Map<string, BodyMetric>;
  readonly steps: Map<string, StepRecord>;
  readonly dailyPacks: Map<string, DailyPack>;
  readonly media: Map<string, ArchiveMediaMetadata>;
  readonly mediaLinks: Map<string, MediaLink>;
  readonly offlineMutations: Map<string, ArchiveOfflineMutation>;
  readonly conflicts: Map<string, ArchiveConflict>;
  readonly idempotency: Map<string, IdempotencyReceipt>;
}

function createEmptyState(): ArchiveState {
  return {
    entries: new Map(),
    revisions: new Map(),
    snapshots: new Map(),
    publishedSnapshots: new Map(),
    aiInsights: new Map(),
    histories: new Map(),
    fitness: new Map(),
    bodyMetrics: new Map(),
    steps: new Map(),
    dailyPacks: new Map(),
    media: new Map(),
    mediaLinks: new Map(),
    offlineMutations: new Map(),
    conflicts: new Map(),
    idempotency: new Map(),
  };
}

function clone<T>(value: T): T {
  return structuredClone(value);
}

function jsonFingerprint(value: unknown): string {
  return JSON.stringify(value) ?? '';
}

function asJsonObject(value: unknown): JsonObject {
  if (value === null || typeof value !== 'object' || Array.isArray(value)) {
    return {};
  }
  const output: Record<string, JsonValue> = {};
  for (const [key, item] of Object.entries(value)) {
    if (item === undefined) continue;
    if (
      item === null ||
      typeof item === 'string' ||
      typeof item === 'number' ||
      typeof item === 'boolean'
    ) {
      output[key] = item;
    } else if (Array.isArray(item)) {
      output[key] = item.filter((entry) => entry !== undefined) as JsonValue[];
    } else if (typeof item === 'object') {
      output[key] = asJsonObject(item);
    }
  }
  return output;
}

function validDate(value: string, field: string): void {
  if (Number.isNaN(Date.parse(value))) {
    throw new ArchiveError('VALIDATION', `${field} must be an ISO date.`);
  }
}

function nonNegativeInteger(value: number, field: string): void {
  if (!Number.isSafeInteger(value) || value < 0) {
    throw new ArchiveError('VALIDATION', `${field} must be a non-negative integer.`);
  }
}

function boundedLimit(limit: number | undefined, fallback: number): number {
  if (limit === undefined) return fallback;
  if (!Number.isSafeInteger(limit) || limit < 1 || limit > 500) {
    throw new ArchiveError('VALIDATION', 'limit must be an integer between 1 and 500.');
  }
  return limit;
}

function validateMediaInput(input: ArchiveMediaInput): void {
  if (input.storageKey.trim() === '' || input.storageKey.includes('..')) {
    throw new ArchiveError('VALIDATION', 'storageKey must be an opaque owner-scoped key.');
  }
  if (!/^[\w.-]+\/[\w.+-]+$/.test(input.contentType)) {
    throw new ArchiveError('VALIDATION', 'contentType must be a valid MIME type.');
  }
  if (input.sha256 !== undefined && input.sha256 !== null && !/^[a-f0-9]{64}$/i.test(input.sha256)) {
    throw new ArchiveError('VALIDATION', 'sha256 must be a 64-character hexadecimal digest.');
  }
  const subtype = input.contentType.split('/')[1]?.split('+')[0]?.toLowerCase();
  const aliases: Readonly<Record<string, readonly string[]>> = {
    jpeg: ['jpg', 'jpeg'],
    jpg: ['jpg', 'jpeg'],
    png: ['png'],
    webp: ['webp'],
    gif: ['gif'],
    mp4: ['mp4', 'm4v'],
    quicktime: ['mov'],
    webm: ['webm'],
  };
  const expected = subtype === undefined ? undefined : aliases[subtype];
  if (expected === undefined) {
    throw new ArchiveError('VALIDATION', 'contentType is not supported for archive media.');
  }
  const extension = input.storageKey.split('.').pop()?.toLowerCase();
  if (extension !== undefined && extension !== input.storageKey.toLowerCase()) {
    if (!expected.includes(extension)) {
      throw new ArchiveError('VALIDATION', 'storageKey extension does not match contentType.');
    }
  }
}

function sorted<T>(items: readonly T[], getDate: (item: T) => string): T[] {
  return [...items].sort((left, right) => getDate(right).localeCompare(getDate(left)));
}

function afterCursor<T>(items: readonly T[], cursor: string | undefined, getKey: (item: T) => string): T[] {
  if (cursor === undefined || cursor === '') return [...items];
  const index = items.findIndex((item) => getKey(item) === cursor);
  return index < 0 ? [...items] : items.slice(index + 1);
}

function shortSnippet(value: string, query: string): string {
  const normalized = value.toLocaleLowerCase();
  const index = normalized.indexOf(query.toLocaleLowerCase());
  if (index < 0) return value.slice(0, 160);
  return value.slice(Math.max(0, index - 40), index + query.length + 120);
}

function checksum(value: unknown): string {
  const text = JSON.stringify(value) ?? '';
  let hash = 2166136261;
  for (let index = 0; index < text.length; index += 1) {
    hash ^= text.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return (hash >>> 0).toString(16).padStart(8, '0');
}

/**
 * Owner-scoped archive repository. It intentionally has no transport or SQL
 * dependency, so API and WeChat adapters can share exactly the same mutation
 * semantics while a production adapter swaps in ArchivePersistence.
 */
export class InMemoryArchiveRepository {
  private readonly state: ArchiveState;
  private readonly persistence: ArchivePersistence | undefined;
  private readonly lifecycleSink: ArchiveSourceLifecycleSink | undefined;
  private readonly weChatSportVerifier: WeChatSportVerifier | undefined;
  private readonly runtime: ArchiveRuntime;
  private readonly quotaBytes: number;

  public constructor(options: ArchiveRepositoryOptions = {}) {
    this.persistence = options.persistence;
    this.lifecycleSink = options.lifecycleSink;
    this.weChatSportVerifier = options.weChatSportVerifier;
    this.runtime = {
      now: options.runtime?.now ?? defaultRuntime.now,
      id: options.runtime?.id ?? defaultRuntime.id,
    };
    this.quotaBytes = options.quotaBytes ?? 100 * 1024 * 1024;
    if (!Number.isSafeInteger(this.quotaBytes) || this.quotaBytes < 0) {
      throw new ArchiveError('VALIDATION', 'quotaBytes must be a non-negative integer.');
    }
    this.state = this.hydrate(options.persistence === undefined ? null : options.persistence.read());
  }

  public toSnapshot(): ArchiveStateSnapshot {
    return {
      entries: [...this.state.entries.values()].map(clone),
      revisions: [...this.state.revisions.values()].flat().map(clone),
      snapshots: [...this.state.snapshots.values()].flat().map(clone),
      publishedSnapshots: [...this.state.publishedSnapshots.values()].flat().map(clone),
      aiInsights: [...this.state.aiInsights.values()].map(clone),
      histories: [...this.state.histories.values()].map(clone),
      fitness: [...this.state.fitness.values()].map(clone),
      bodyMetrics: [...this.state.bodyMetrics.values()].map(clone),
      steps: [...this.state.steps.values()].map(clone),
      dailyPacks: [...this.state.dailyPacks.values()].map(clone),
      media: [...this.state.media.values()].map(clone),
      mediaLinks: [...this.state.mediaLinks.values()].map(clone),
      offlineMutations: [...this.state.offlineMutations.values()].map(clone),
      conflicts: [...this.state.conflicts.values()].map(clone),
      idempotency: [...this.state.idempotency.entries()].map(([key, receipt]) => ({
        key,
        fingerprint: receipt.fingerprint,
        result: clone(receipt.result),
      })),
    };
  }

  private hydrate(snapshot: ArchiveStateSnapshot | null): ArchiveState {
    const state = createEmptyState();
    if (snapshot === null) return state;
    for (const entry of snapshot.entries) state.entries.set(entry.id, clone(entry));
    for (const revision of snapshot.revisions) {
      const revisions = state.revisions.get(revision.entryId) ?? [];
      revisions.push(clone(revision));
      state.revisions.set(revision.entryId, revisions);
    }
    for (const item of snapshot.snapshots) {
      const snapshots = state.snapshots.get(item.entryId) ?? [];
      snapshots.push(clone(item));
      state.snapshots.set(item.entryId, snapshots);
    }
    for (const item of snapshot.publishedSnapshots ?? []) {
      const snapshots = state.publishedSnapshots.get(item.sourceEntryId) ?? [];
      snapshots.push(clone(item));
      state.publishedSnapshots.set(item.sourceEntryId, snapshots);
    }
    for (const item of snapshot.aiInsights ?? []) state.aiInsights.set(item.id, clone(item));
    for (const item of snapshot.histories) state.histories.set(item.id, clone(item));
    for (const item of snapshot.fitness) state.fitness.set(item.id, clone(item));
    for (const item of snapshot.bodyMetrics) state.bodyMetrics.set(item.id, clone(item));
    for (const item of snapshot.steps) state.steps.set(`${item.ownerId}:${item.day}`, clone(item));
    for (const item of snapshot.dailyPacks) state.dailyPacks.set(`${item.ownerId}:${item.day}`, clone(item));
    for (const item of snapshot.media) state.media.set(item.id, clone(item));
    for (const item of snapshot.mediaLinks) state.mediaLinks.set(item.id, clone(item));
    for (const item of snapshot.offlineMutations) state.offlineMutations.set(`${item.ownerId}:${item.clientMutationId}`, clone(item));
    for (const item of snapshot.conflicts) state.conflicts.set(item.id, clone(item));
    for (const item of snapshot.idempotency ?? []) {
      state.idempotency.set(item.key, {
        fingerprint: item.fingerprint,
        result: clone(item.result),
      });
    }
    return state;
  }

  private persist(): void {
    this.persistence?.write(this.toSnapshot());
  }

  private publishSourceLifecycle(
    sourceType: ArchiveLifecycleSourceType,
    action: ArchiveSourceLifecycleAction,
    source: Readonly<{ ownerId: string; id: string; revision: number; updatedAt: string }>,
    status: ArchiveSourceLifecycleEvent['status'],
    changedAt = source.updatedAt,
  ): void {
    if (this.lifecycleSink === undefined) return;
    // Archive writes are authoritative. A downstream indexer may be briefly
    // unavailable, but it must never turn a successfully persisted archive
    // mutation into a client-visible failure. Production compositions should
    // adapt this port to a durable outbox for retry/replay.
    try {
      this.lifecycleSink.publish(clone({
        ownerId: source.ownerId,
        sourceType,
        sourceId: source.id,
        revision: source.revision,
        status,
        action,
        changedAt,
      }));
    } catch {
      // Best-effort local dispatch intentionally cannot roll back the source.
    }
  }

  private requireOwner(principal: AuthenticatedPrincipal, ownerId: string): void {
    if (principal.userId !== ownerId) throw new ArchiveAuthorizationError();
  }

  private owned<T extends { readonly ownerId: string }>(
    principal: AuthenticatedPrincipal,
    item: T | undefined,
  ): T {
    if (item === undefined) throw new ArchiveNotFoundError();
    this.requireOwner(principal, item.ownerId);
    return item;
  }

  private idempotent<T>(
    principal: AuthenticatedPrincipal,
    operation: string,
    key: string | undefined,
    input: unknown,
    action: () => T,
    afterCommit?: (result: T) => void,
  ): T {
    if (key === undefined || key.trim() === '') {
      const result = action();
      this.persist();
      afterCommit?.(clone(result));
      return clone(result);
    }
    const scopedKey = `${principal.userId}:${operation}:${key}`;
    const fingerprint = jsonFingerprint(input);
    const existing = this.state.idempotency.get(scopedKey);
    if (existing !== undefined) {
      if (existing.fingerprint !== fingerprint) {
        throw new ArchiveError('IDEMPOTENCY_REPLAY', 'Idempotency key was already used with different input.');
      }
      return clone(existing.result as T);
    }
    const result = action();
    this.state.idempotency.set(scopedKey, { fingerprint, result: clone(result) });
    this.persist();
    afterCommit?.(clone(result));
    return clone(result);
  }

  private appendRevision(
    entry: ArchiveEntry,
    source: ArchiveRevisionSource,
  ): void {
    const revision: ArchiveRevision = {
      id: this.runtime.id(),
      entryId: entry.id,
      ownerId: entry.ownerId,
      revision: entry.revision,
      source,
      snapshot: clone(entry),
      createdAt: entry.updatedAt,
    };
    const revisions = this.state.revisions.get(entry.id) ?? [];
    revisions.push(revision);
    this.state.revisions.set(entry.id, revisions);
    const snapshot: ArchiveSnapshot = {
      id: this.runtime.id(),
      entryId: entry.id,
      ownerId: entry.ownerId,
      revision: entry.revision,
      content: asJsonObject(entry),
      createdAt: entry.updatedAt,
    };
    const snapshots = this.state.snapshots.get(entry.id) ?? [];
    snapshots.push(snapshot);
    this.state.snapshots.set(entry.id, snapshots);
  }

  private assertExpectedRevision(
    principal: AuthenticatedPrincipal,
    entityType: ArchiveOfflineMutation['entityType'],
    entityId: string,
    expectedRevision: number | undefined,
    actualRevision: number,
    localPayload: JsonObject,
    serverPayload: JsonObject,
  ): void {
    if (expectedRevision === undefined || expectedRevision === actualRevision) return;
    const conflict: ArchiveConflict = {
      id: this.runtime.id(),
      ownerId: principal.userId,
      entityType,
      entityId,
      expectedRevision,
      actualRevision,
      localPayload: clone(localPayload),
      serverPayload: clone(serverPayload),
      resolvedAt: null,
      createdAt: this.runtime.now(),
    };
    this.state.conflicts.set(conflict.id, conflict);
    this.persist();
    throw new ArchiveConflictError(conflict.id, expectedRevision, actualRevision);
  }

  public createEntry(principal: AuthenticatedPrincipal, input: ArchiveEntryInput): ArchiveEntry {
    validDate(input.occurredAt, 'occurredAt');
    const hasText = (input.title?.trim().length ?? 0) + (input.body?.trim().length ?? 0) > 0;
    const mediaOnly = input.lifeType === 'PHOTO' || input.lifeType === 'VIDEO' || input.lifeType === 'MIXED';
    if (!hasText && !mediaOnly) {
      throw new ArchiveError('VALIDATION', 'A Life entry needs a title/body or a media content type.');
    }
    const now = this.runtime.now();
    return this.idempotent(principal, 'entry.create', input.idempotencyKey, input, () => {
      const entry: ArchiveEntry = {
        id: this.runtime.id(),
        ownerId: principal.userId,
        kind: input.kind,
        lifeType: input.lifeType ?? null,
        title: input.title ?? null,
        body: input.body ?? null,
        occurredAt: input.occurredAt,
        timezone: input.timezone ?? 'Etc/UTC',
        recordSource: input.recordSource?.trim() || 'MANUAL',
        deviceId: input.deviceId ?? null,
        metadata: clone(input.metadata ?? {}),
        tags: [...(input.tags ?? [])],
        status: 'ACTIVE',
        revision: 1,
        createdAt: now,
        updatedAt: now,
        serverReceivedAt: now,
        deletedAt: null,
      };
      this.state.entries.set(entry.id, entry);
      this.appendRevision(entry, input.source ?? 'ONLINE');
      return entry;
    }, (entry) => this.publishSourceLifecycle('ENTRY', 'SAVED', entry, 'ACTIVE'));
  }

  public getEntry(
    principal: AuthenticatedPrincipal,
    id: string,
    options: { readonly includeTrashed?: boolean } = {},
  ): ArchiveEntry {
    const entry = this.owned(principal, this.state.entries.get(id));
    if (!options.includeTrashed && entry.status === 'TRASHED') throw new ArchiveNotFoundError();
    return clone(entry);
  }

  public listEntries(
    principal: AuthenticatedPrincipal,
    options: EntryListOptions = {},
  ): readonly ArchiveEntry[] {
    const limit = boundedLimit(options.limit, 100);
    const ordered = sorted(
      [...this.state.entries.values()].filter(
        (entry) =>
          entry.ownerId === principal.userId &&
          (options.includeTrashed === true || entry.status === 'ACTIVE') &&
          (options.kind === undefined || entry.kind === options.kind),
      ),
      (entry) => entry.occurredAt,
    );
    return afterCursor(ordered, options.cursor, (entry) => entry.id).slice(0, limit).map(clone);
  }

  public updateEntry(
    principal: AuthenticatedPrincipal,
    id: string,
    patch: ArchiveEntryPatch,
    options: ArchiveMutationOptions = {},
  ): ArchiveEntry {
    const existing = this.owned(principal, this.state.entries.get(id));
    if (existing.status === 'TRASHED') throw new ArchiveError('INVALID_STATE', 'Trashed entries must be restored before editing.');
    if (patch.occurredAt !== undefined) validDate(patch.occurredAt, 'occurredAt');
    return this.idempotent(principal, 'entry.update', options.idempotencyKey, { id, patch, options }, () => {
      this.assertExpectedRevision(
        principal,
        'ENTRY',
        id,
        options.expectedRevision,
        existing.revision,
        asJsonObject(patch),
        asJsonObject(existing),
      );
      const updated: ArchiveEntry = {
        ...existing,
        lifeType: patch.lifeType === undefined ? existing.lifeType : patch.lifeType,
        title: patch.title === undefined ? existing.title : patch.title,
        body: patch.body === undefined ? existing.body : patch.body,
        occurredAt: patch.occurredAt ?? existing.occurredAt,
        timezone: patch.timezone ?? existing.timezone,
        metadata: patch.metadata === undefined ? existing.metadata : clone(patch.metadata),
        tags: patch.tags === undefined ? existing.tags : [...patch.tags],
        revision: existing.revision + 1,
        updatedAt: this.runtime.now(),
      };
      const hasText = (updated.title?.trim().length ?? 0) + (updated.body?.trim().length ?? 0) > 0;
      const mediaOnly = updated.lifeType === 'PHOTO' || updated.lifeType === 'VIDEO' || updated.lifeType === 'MIXED';
      if (!hasText && !mediaOnly) {
        throw new ArchiveError('VALIDATION', 'A Life entry needs a title/body or a media content type.');
      }
      this.state.entries.set(id, updated);
      this.appendRevision(updated, options.source ?? 'ONLINE');
      return updated;
    }, (entry) => this.publishSourceLifecycle('ENTRY', 'REVISED', entry, 'ACTIVE'));
  }

  public trashEntry(
    principal: AuthenticatedPrincipal,
    id: string,
    options: ArchiveMutationOptions = {},
  ): ArchiveEntry {
    return this.lifecycleEntry(principal, id, 'TRASHED', options);
  }

  public restoreEntry(
    principal: AuthenticatedPrincipal,
    id: string,
    options: ArchiveMutationOptions = {},
  ): ArchiveEntry {
    return this.lifecycleEntry(principal, id, 'ACTIVE', options);
  }

  private lifecycleEntry(
    principal: AuthenticatedPrincipal,
    id: string,
    status: ArchiveEntryStatus,
    options: ArchiveMutationOptions,
  ): ArchiveEntry {
    const existing = this.owned(principal, this.state.entries.get(id));
    return this.idempotent(principal, `entry.${status.toLowerCase()}`, options.idempotencyKey, { id, status, options }, () => {
      this.assertExpectedRevision(principal, 'ENTRY', id, options.expectedRevision, existing.revision, {}, asJsonObject(existing));
      const updated: ArchiveEntry = {
        ...existing,
        status,
        revision: existing.revision + 1,
        updatedAt: this.runtime.now(),
        deletedAt: status === 'TRASHED' ? this.runtime.now() : null,
      };
      this.state.entries.set(id, updated);
      this.appendRevision(updated, options.source ?? 'ONLINE');
      return updated;
    }, (entry) => this.publishSourceLifecycle(
      'ENTRY',
      status === 'TRASHED' ? 'TRASHED' : 'RESTORED',
      entry,
      status === 'TRASHED' ? 'TRASHED' : 'ACTIVE',
    ));
  }

  public permanentlyDeleteEntry(principal: AuthenticatedPrincipal, id: string, idempotencyKey?: string): void {
    const entry = this.owned(principal, this.state.entries.get(id));
    this.idempotent(principal, 'entry.delete', idempotencyKey, { id }, () => {
      this.state.entries.delete(entry.id);
      this.state.revisions.delete(entry.id);
      this.state.snapshots.delete(entry.id);
      this.state.publishedSnapshots.delete(entry.id);
      for (const [insightId, insight] of this.state.aiInsights) {
        if (insight.sourceEntryId === entry.id) this.state.aiInsights.delete(insightId);
      }
      for (const [linkId, link] of this.state.mediaLinks) {
        if (link.targetType === 'ENTRY' && link.targetId === id) this.state.mediaLinks.delete(linkId);
      }
      return undefined;
    }, () => this.publishSourceLifecycle('ENTRY', 'DELETED', entry, 'DELETED', this.runtime.now()));
  }

  public listRevisions(principal: AuthenticatedPrincipal, entryId: string): readonly ArchiveRevision[] {
    this.owned(principal, this.state.entries.get(entryId));
    return (this.state.revisions.get(entryId) ?? []).map(clone);
  }

  public listSnapshots(principal: AuthenticatedPrincipal, entryId: string): readonly ArchiveSnapshot[] {
    this.owned(principal, this.state.entries.get(entryId));
    return (this.state.snapshots.get(entryId) ?? []).map(clone);
  }

  /** Explicit publication boundary. A published snapshot is an immutable,
   * owner-approved projection; editing the source entry never mutates it. */
  public publishSnapshot(
    principal: AuthenticatedPrincipal,
    entryId: string,
    selectedContent?: JsonObject,
  ): ArchivePublishedSnapshot {
    const entry = this.owned(principal, this.state.entries.get(entryId));
    if (entry.status !== 'ACTIVE') throw new ArchiveError('INVALID_STATE', 'Only an active entry can be published.');
    const snapshot: ArchivePublishedSnapshot = {
      id: this.runtime.id(),
      sourceEntryId: entry.id,
      ownerId: principal.userId,
      sourceRevision: entry.revision,
      selectedContent: clone(selectedContent ?? asJsonObject(entry)),
      visibility: 'SNAPSHOT',
      createdAt: this.runtime.now(),
      revokedAt: null,
    };
    const items = this.state.publishedSnapshots.get(entry.id) ?? [];
    items.push(snapshot);
    this.state.publishedSnapshots.set(entry.id, items);
    this.persist();
    return clone(snapshot);
  }

  public listPublishedSnapshots(
    principal: AuthenticatedPrincipal,
    entryId: string,
    includeRevoked = false,
  ): readonly ArchivePublishedSnapshot[] {
    this.owned(principal, this.state.entries.get(entryId));
    return (this.state.publishedSnapshots.get(entryId) ?? [])
      .filter((item) => includeRevoked || item.revokedAt === null)
      .map(clone);
  }

  /** Server-side Phase 4 projection boundary. Clients provide field keys, not private content. */
  public publishSnapshotProjection(
    principal: AuthenticatedPrincipal,
    entryId: string,
    sourceRevision?: number,
    selectedFieldKeys: readonly string[] = ['title', 'body', 'occurredAt', 'timezone', 'tags'],
  ): ArchivePublishedSnapshot {
    const entry = this.owned(principal, this.state.entries.get(entryId));
    if (entry.status !== 'ACTIVE') throw new ArchiveError('INVALID_STATE', 'Only an active entry can be published.');
    const revision = sourceRevision ?? entry.revision;
    if (!Number.isSafeInteger(revision) || revision < 1) {
      throw new ArchiveError('VALIDATION', 'sourceRevision must be a positive integer.');
    }
    const source = (this.state.revisions.get(entry.id) ?? []).find((item) => item.revision === revision);
    if (source === undefined) {
      throw new ArchiveNotFoundError();
    }
    const allowed = new Set(['title', 'body', 'occurredAt', 'timezone', 'tags']);
    if (selectedFieldKeys.length === 0 || selectedFieldKeys.some((key) => !allowed.has(key))) {
      throw new ArchiveError('VALIDATION', 'selectedFieldKeys contains an unsupported projection field.');
    }
    const sourceEntry = source.snapshot;
    const selected: Record<string, JsonValue> = {};
    for (const key of new Set(selectedFieldKeys)) {
      if (key === 'title' && sourceEntry.title !== null) selected.title = sourceEntry.title;
      if (key === 'body' && sourceEntry.body !== null) selected.body = sourceEntry.body;
      if (key === 'occurredAt') selected.occurredAt = sourceEntry.occurredAt;
      if (key === 'timezone') selected.timezone = sourceEntry.timezone;
      if (key === 'tags') selected.tags = [...sourceEntry.tags];
    }
    const now = this.runtime.now();
    const snapshot: ArchivePublishedSnapshot = {
      id: this.runtime.id(),
      sourceEntryId: entry.id,
      ownerId: principal.userId,
      sourceRevision: revision,
      selectedContent: selected,
      visibility: 'SNAPSHOT',
      createdAt: now,
      revokedAt: null,
    };
    const items = this.state.publishedSnapshots.get(entry.id) ?? [];
    items.push(snapshot);
    this.state.publishedSnapshots.set(entry.id, items);
    this.persist();
    return clone(snapshot);
  }

  /** Owner-scoped lookup used by the Community publication bridge. */
  public getPublishedSnapshot(
    principal: AuthenticatedPrincipal,
    snapshotId: string,
  ): ArchivePublishedSnapshot {
    const existing = [...this.state.publishedSnapshots.values()].flat().find((item) => item.id === snapshotId);
    return this.owned(principal, existing);
  }

  public revokePublishedSnapshot(
    principal: AuthenticatedPrincipal,
    snapshotId: string,
  ): ArchivePublishedSnapshot {
    const existing = this.owned(
      principal,
      [...this.state.publishedSnapshots.values()].flat().find((item) => item.id === snapshotId),
    );
    if (existing.revokedAt !== null) return clone(existing);
    const updated = { ...existing, revokedAt: this.runtime.now() };
    const items = this.state.publishedSnapshots.get(existing.sourceEntryId) ?? [];
    this.state.publishedSnapshots.set(existing.sourceEntryId, items.map((item) => item.id === snapshotId ? updated : item));
    this.persist();
    return clone(updated);
  }

  /** AI output is append-only and tied to the exact source revision. */
  public createAiInsight(
    principal: AuthenticatedPrincipal,
    input: {
      readonly entryId: string;
      readonly sourceRevision: number;
      readonly provider: string;
      readonly model: string;
      readonly insight: JsonObject;
    },
  ): ArchiveAiInsight {
    const entry = this.owned(principal, this.state.entries.get(input.entryId));
    const sourceExists = (this.state.revisions.get(entry.id) ?? []).some(
      (revision) => revision.revision === input.sourceRevision,
    );
    if (!sourceExists) {
      throw new ArchiveError(
        'VALIDATION',
        'AI insights must reference an existing immutable source revision.',
      );
    }
    const item: ArchiveAiInsight = {
      id: this.runtime.id(),
      outputType: 'AI_GENERATED',
      sourceEntryId: entry.id,
      ownerId: principal.userId,
      sourceRevision: input.sourceRevision,
      provider: input.provider,
      model: input.model,
      insight: clone(input.insight),
      createdAt: this.runtime.now(),
      revokedAt: null,
    };
    this.state.aiInsights.set(item.id, item);
    this.persist();
    return clone(item);
  }

  public listAiInsights(
    principal: AuthenticatedPrincipal,
    entryId: string,
    includeRevoked = false,
  ): readonly ArchiveAiInsight[] {
    this.owned(principal, this.state.entries.get(entryId));
    return [...this.state.aiInsights.values()]
      .filter((item) => item.ownerId === principal.userId && item.sourceEntryId === entryId && (includeRevoked || item.revokedAt === null))
      .map(clone);
  }

  public revokeAiInsight(principal: AuthenticatedPrincipal, insightId: string): ArchiveAiInsight {
    const existing = this.owned(principal, this.state.aiInsights.get(insightId));
    if (existing.revokedAt !== null) return clone(existing);
    const updated = { ...existing, revokedAt: this.runtime.now() };
    this.state.aiInsights.set(insightId, updated);
    this.persist();
    return clone(updated);
  }

  public createHistory(
    principal: AuthenticatedPrincipal,
    input: ArchiveHistoryInput,
  ): ArchiveHistoryEntry {
    validDate(input.date, 'date');
    return this.idempotent(principal, 'history.create', input.idempotencyKey, input, () => {
      if (input.entryId !== undefined && input.entryId !== null) this.owned(principal, this.state.entries.get(input.entryId));
      const now = this.runtime.now();
      const item: ArchiveHistoryEntry = {
        id: this.runtime.id(),
        ownerId: principal.userId,
        entryId: input.entryId ?? null,
        title: input.title,
        date: input.date,
        dynasty: input.dynasty ?? null,
        people: [...(input.people ?? [])],
        events: [...(input.events ?? [])],
        quotation: input.quotation ?? null,
        reflection: input.reflection ?? null,
        tags: [...(input.tags ?? [])],
        revision: 1,
        status: 'ACTIVE',
        createdAt: now,
        updatedAt: now,
        deletedAt: null,
      };
      this.state.histories.set(item.id, item);
      return item;
    }, (item) => this.publishSourceLifecycle('HISTORY', 'SAVED', item, 'ACTIVE'));
  }

  public getHistory(
    principal: AuthenticatedPrincipal,
    id: string,
    options: { readonly includeTrashed?: boolean } = {},
  ): ArchiveHistoryEntry {
    const item = this.owned(principal, this.state.histories.get(id));
    if (!options.includeTrashed && item.status === 'TRASHED') throw new ArchiveNotFoundError();
    return clone(item);
  }

  public listHistory(
    principal: AuthenticatedPrincipal,
    options: { readonly includeTrashed?: boolean; readonly limit?: number } = {},
  ): readonly ArchiveHistoryEntry[] {
    const limit = boundedLimit(options.limit, 100);
    return sorted(
      [...this.state.histories.values()].filter(
        (item) => item.ownerId === principal.userId && (options.includeTrashed === true || item.status === 'ACTIVE'),
      ),
      (item) => item.date,
    )
      .slice(0, limit)
      .map(clone);
  }

  public updateHistory(
    principal: AuthenticatedPrincipal,
    id: string,
    patch: ArchiveHistoryPatch,
    options: ArchiveMutationOptions = {},
  ): ArchiveHistoryEntry {
    const existing = this.owned(principal, this.state.histories.get(id));
    if (existing.status === 'TRASHED') throw new ArchiveError('INVALID_STATE', 'Trashed history must be restored before editing.');
    if (patch.date !== undefined) validDate(patch.date, 'date');
    return this.idempotent(principal, 'history.update', options.idempotencyKey, { id, patch, options }, () => {
      this.assertExpectedRevision(principal, 'HISTORY', id, options.expectedRevision, existing.revision, asJsonObject(patch), asJsonObject(existing));
      if (patch.entryId !== undefined && patch.entryId !== null) this.owned(principal, this.state.entries.get(patch.entryId));
      const updated: ArchiveHistoryEntry = {
        ...existing,
        title: patch.title ?? existing.title,
        date: patch.date ?? existing.date,
        entryId: patch.entryId === undefined ? existing.entryId : patch.entryId,
        dynasty: patch.dynasty === undefined ? existing.dynasty : patch.dynasty,
        people: patch.people === undefined ? existing.people : [...patch.people],
        events: patch.events === undefined ? existing.events : [...patch.events],
        quotation: patch.quotation === undefined ? existing.quotation : patch.quotation,
        reflection: patch.reflection === undefined ? existing.reflection : patch.reflection,
        tags: patch.tags === undefined ? existing.tags : [...patch.tags],
        revision: existing.revision + 1,
        updatedAt: this.runtime.now(),
      };
      this.state.histories.set(id, updated);
      return updated;
    }, (item) => this.publishSourceLifecycle('HISTORY', 'REVISED', item, 'ACTIVE'));
  }

  public trashHistory(principal: AuthenticatedPrincipal, id: string, options: ArchiveMutationOptions = {}): ArchiveHistoryEntry {
    return this.lifecycleHistory(principal, id, 'TRASHED', options);
  }

  public restoreHistory(principal: AuthenticatedPrincipal, id: string, options: ArchiveMutationOptions = {}): ArchiveHistoryEntry {
    return this.lifecycleHistory(principal, id, 'ACTIVE', options);
  }

  private lifecycleHistory(
    principal: AuthenticatedPrincipal,
    id: string,
    status: ArchiveEntryStatus,
    options: ArchiveMutationOptions,
  ): ArchiveHistoryEntry {
    const existing = this.owned(principal, this.state.histories.get(id));
    return this.idempotent(principal, `history.${status.toLowerCase()}`, options.idempotencyKey, { id, status, options }, () => {
      this.assertExpectedRevision(principal, 'HISTORY', id, options.expectedRevision, existing.revision, {}, asJsonObject(existing));
      const updated: ArchiveHistoryEntry = {
        ...existing,
        status,
        revision: existing.revision + 1,
        updatedAt: this.runtime.now(),
        deletedAt: status === 'TRASHED' ? this.runtime.now() : null,
      };
      this.state.histories.set(id, updated);
      return updated;
    }, (item) => this.publishSourceLifecycle(
      'HISTORY',
      status === 'TRASHED' ? 'TRASHED' : 'RESTORED',
      item,
      status === 'TRASHED' ? 'TRASHED' : 'ACTIVE',
    ));
  }

  public permanentlyDeleteHistory(principal: AuthenticatedPrincipal, id: string, idempotencyKey?: string): void {
    const item = this.owned(principal, this.state.histories.get(id));
    this.idempotent(principal, 'history.delete', idempotencyKey, { id }, () => {
      this.state.histories.delete(item.id);
      for (const [linkId, link] of this.state.mediaLinks) {
        if (link.targetType === 'HISTORY' && link.targetId === id) this.state.mediaLinks.delete(linkId);
      }
      return undefined;
    }, () => this.publishSourceLifecycle('HISTORY', 'DELETED', item, 'DELETED', this.runtime.now()));
  }

  public createFitness(
    principal: AuthenticatedPrincipal,
    input: ArchiveFitnessInput,
  ): ArchiveFitnessEntry {
    validDate(input.occurredAt, 'occurredAt');
    if (input.durationSeconds !== undefined && input.durationSeconds !== null) nonNegativeInteger(input.durationSeconds, 'durationSeconds');
    if (input.stateScore !== undefined && input.stateScore !== null && (!Number.isInteger(input.stateScore) || input.stateScore < 1 || input.stateScore > 10)) {
      throw new ArchiveError('VALIDATION', 'stateScore must be an integer between 1 and 10.');
    }
    return this.idempotent(principal, 'fitness.create', input.idempotencyKey, input, () => {
      if (input.entryId !== undefined && input.entryId !== null) this.owned(principal, this.state.entries.get(input.entryId));
      const now = this.runtime.now();
      const item: ArchiveFitnessEntry = {
        id: this.runtime.id(),
        ownerId: principal.userId,
        entryId: input.entryId ?? null,
        trainingType: input.trainingType ?? null,
        bodyParts: [...(input.bodyParts ?? [])],
        durationSeconds: input.durationSeconds ?? null,
        stateScore: input.stateScore ?? null,
        exercises: [...(input.exercises ?? [])].map(clone),
        occurredAt: input.occurredAt,
        revision: 1,
        status: 'ACTIVE',
        createdAt: now,
        updatedAt: now,
        deletedAt: null,
      };
      this.state.fitness.set(item.id, item);
      return item;
    }, (item) => this.publishSourceLifecycle('FITNESS', 'SAVED', item, 'ACTIVE'));
  }

  public getFitness(principal: AuthenticatedPrincipal, id: string, options: { readonly includeTrashed?: boolean } = {}): ArchiveFitnessEntry {
    const item = this.owned(principal, this.state.fitness.get(id));
    if (!options.includeTrashed && item.status === 'TRASHED') throw new ArchiveNotFoundError();
    return clone(item);
  }

  public listFitness(principal: AuthenticatedPrincipal, options: { readonly includeTrashed?: boolean; readonly limit?: number } = {}): readonly ArchiveFitnessEntry[] {
    const limit = boundedLimit(options.limit, 100);
    return sorted(
      [...this.state.fitness.values()].filter(
        (item) => item.ownerId === principal.userId && (options.includeTrashed === true || item.status === 'ACTIVE'),
      ),
      (item) => item.occurredAt,
    )
      .slice(0, limit)
      .map(clone);
  }

  public updateFitness(
    principal: AuthenticatedPrincipal,
    id: string,
    patch: ArchiveFitnessPatch,
    options: ArchiveMutationOptions = {},
  ): ArchiveFitnessEntry {
    const existing = this.owned(principal, this.state.fitness.get(id));
    if (existing.status === 'TRASHED') throw new ArchiveError('INVALID_STATE', 'Trashed fitness entries must be restored before editing.');
    if (patch.occurredAt !== undefined) validDate(patch.occurredAt, 'occurredAt');
    if (patch.durationSeconds !== undefined && patch.durationSeconds !== null) nonNegativeInteger(patch.durationSeconds, 'durationSeconds');
    if (patch.stateScore !== undefined && patch.stateScore !== null && (!Number.isInteger(patch.stateScore) || patch.stateScore < 1 || patch.stateScore > 10)) {
      throw new ArchiveError('VALIDATION', 'stateScore must be an integer between 1 and 10.');
    }
    return this.idempotent(principal, 'fitness.update', options.idempotencyKey, { id, patch, options }, () => {
      this.assertExpectedRevision(principal, 'FITNESS', id, options.expectedRevision, existing.revision, asJsonObject(patch), asJsonObject(existing));
      if (patch.entryId !== undefined && patch.entryId !== null) this.owned(principal, this.state.entries.get(patch.entryId));
      const updated: ArchiveFitnessEntry = {
        ...existing,
        occurredAt: patch.occurredAt ?? existing.occurredAt,
        entryId: patch.entryId === undefined ? existing.entryId : patch.entryId,
        trainingType: patch.trainingType === undefined ? existing.trainingType : patch.trainingType,
        bodyParts: patch.bodyParts === undefined ? existing.bodyParts : [...patch.bodyParts],
        durationSeconds: patch.durationSeconds === undefined ? existing.durationSeconds : patch.durationSeconds,
        stateScore: patch.stateScore === undefined ? existing.stateScore : patch.stateScore,
        exercises: patch.exercises === undefined ? existing.exercises : [...patch.exercises].map(clone),
        revision: existing.revision + 1,
        updatedAt: this.runtime.now(),
      };
      this.state.fitness.set(id, updated);
      return updated;
    }, (item) => this.publishSourceLifecycle('FITNESS', 'REVISED', item, 'ACTIVE'));
  }

  public trashFitness(principal: AuthenticatedPrincipal, id: string, options: ArchiveMutationOptions = {}): ArchiveFitnessEntry {
    return this.lifecycleFitness(principal, id, 'TRASHED', options);
  }

  public restoreFitness(principal: AuthenticatedPrincipal, id: string, options: ArchiveMutationOptions = {}): ArchiveFitnessEntry {
    return this.lifecycleFitness(principal, id, 'ACTIVE', options);
  }

  private lifecycleFitness(
    principal: AuthenticatedPrincipal,
    id: string,
    status: ArchiveEntryStatus,
    options: ArchiveMutationOptions,
  ): ArchiveFitnessEntry {
    const existing = this.owned(principal, this.state.fitness.get(id));
    return this.idempotent(principal, `fitness.${status.toLowerCase()}`, options.idempotencyKey, { id, status, options }, () => {
      this.assertExpectedRevision(principal, 'FITNESS', id, options.expectedRevision, existing.revision, {}, asJsonObject(existing));
      const updated: ArchiveFitnessEntry = {
        ...existing,
        status,
        revision: existing.revision + 1,
        updatedAt: this.runtime.now(),
        deletedAt: status === 'TRASHED' ? this.runtime.now() : null,
      };
      this.state.fitness.set(id, updated);
      return updated;
    }, (item) => this.publishSourceLifecycle(
      'FITNESS',
      status === 'TRASHED' ? 'TRASHED' : 'RESTORED',
      item,
      status === 'TRASHED' ? 'TRASHED' : 'ACTIVE',
    ));
  }

  public permanentlyDeleteFitness(principal: AuthenticatedPrincipal, id: string, idempotencyKey?: string): void {
    const item = this.owned(principal, this.state.fitness.get(id));
    this.idempotent(principal, 'fitness.delete', idempotencyKey, { id }, () => {
      this.state.fitness.delete(item.id);
      for (const [linkId, link] of this.state.mediaLinks) {
        if (link.targetType === 'FITNESS' && link.targetId === id) this.state.mediaLinks.delete(linkId);
      }
      return undefined;
    }, () => this.publishSourceLifecycle('FITNESS', 'DELETED', item, 'DELETED', this.runtime.now()));
  }

  public createBodyMetric(principal: AuthenticatedPrincipal, input: BodyMetricInput): BodyMetric {
    validDate(input.measuredAt, 'measuredAt');
    for (const [value, field] of [
      [input.weightGrams, 'weightGrams'],
      [input.bodyFatBasisPoints, 'bodyFatBasisPoints'],
      [input.waistMillimetres, 'waistMillimetres'],
    ] as const) {
      if (value !== undefined && value !== null) nonNegativeInteger(value, field);
    }
    return this.idempotent(principal, 'body-metric.create', input.idempotencyKey, input, () => {
      const now = this.runtime.now();
      const item: BodyMetric = {
        id: this.runtime.id(),
        ownerId: principal.userId,
        measuredAt: input.measuredAt,
        weightGrams: input.weightGrams ?? null,
        bodyFatBasisPoints: input.bodyFatBasisPoints ?? null,
        waistMillimetres: input.waistMillimetres ?? null,
        metadata: clone(input.metadata ?? {}),
        createdAt: now,
        updatedAt: now,
      };
      this.state.bodyMetrics.set(item.id, item);
      return item;
    });
  }

  public getBodyMetric(principal: AuthenticatedPrincipal, id: string): BodyMetric {
    return clone(this.owned(principal, this.state.bodyMetrics.get(id)));
  }

  public listBodyMetrics(principal: AuthenticatedPrincipal, limit?: number): readonly BodyMetric[] {
    return sorted(
      [...this.state.bodyMetrics.values()].filter((item) => item.ownerId === principal.userId),
      (item) => item.measuredAt,
    )
      .slice(0, boundedLimit(limit, 100))
      .map(clone);
  }

  public updateBodyMetric(
    principal: AuthenticatedPrincipal,
    id: string,
    patch: Omit<BodyMetricInput, 'idempotencyKey'>,
    idempotencyKey?: string,
  ): BodyMetric {
    const existing = this.owned(principal, this.state.bodyMetrics.get(id));
    validDate(patch.measuredAt, 'measuredAt');
    return this.idempotent(principal, 'body-metric.update', idempotencyKey, { id, patch }, () => {
      const updated: BodyMetric = {
        ...existing,
        measuredAt: patch.measuredAt,
        weightGrams: patch.weightGrams ?? null,
        bodyFatBasisPoints: patch.bodyFatBasisPoints ?? null,
        waistMillimetres: patch.waistMillimetres ?? null,
        metadata: clone(patch.metadata ?? {}),
        updatedAt: this.runtime.now(),
      };
      this.state.bodyMetrics.set(id, updated);
      return updated;
    });
  }

  public permanentlyDeleteBodyMetric(principal: AuthenticatedPrincipal, id: string, idempotencyKey?: string): void {
    const item = this.owned(principal, this.state.bodyMetrics.get(id));
    this.idempotent(principal, 'body-metric.delete', idempotencyKey, { id }, () => {
      this.state.bodyMetrics.delete(item.id);
      return undefined;
    });
  }

  public upsertSteps(principal: AuthenticatedPrincipal, input: StepRecordInput): StepRecord {
    validDate(input.day, 'day');
    nonNegativeInteger(input.steps, 'steps');
    return this.idempotent(principal, 'steps.upsert', input.idempotencyKey, input, () => {
      const key = `${principal.userId}:${input.day}`;
      const existing = this.state.steps.get(key);
      const now = this.runtime.now();
      const item: StepRecord = {
        id: existing?.id ?? this.runtime.id(),
        ownerId: principal.userId,
        day: input.day,
        steps: input.steps,
        source: input.source,
        createdAt: existing?.createdAt ?? now,
        updatedAt: now,
      };
      this.state.steps.set(key, item);
      return item;
    });
  }

  /**
   * Imports only server-verified WeChat Sport records. Clients cannot select
   * the resulting day, step value, owner, or WECHAT source.
   */
  public importWeChatSportSteps(
    principal: AuthenticatedPrincipal,
    input: WeChatSportEncryptedPayload,
  ): readonly StepRecord[] {
    if (this.weChatSportVerifier === undefined) {
      throw new ArchiveError('INVALID_STATE', 'WeChat Sport synchronization is not configured.');
    }
    const verified = this.weChatSportVerifier.verify(principal, {
      encryptedData: input.encryptedData,
      iv: input.iv,
    });
    if (!Array.isArray(verified) || verified.length === 0 || verified.length > 366) {
      throw new ArchiveError('VALIDATION', 'WeChat Sport data did not contain valid step records.');
    }
    const normalized = [...verified]
      .map((item) => ({ day: item.day, steps: item.steps }))
      .sort((left, right) => left.day.localeCompare(right.day));
    const seenDays = new Set<string>();
    for (const item of normalized) {
      validDate(item.day, 'day');
      nonNegativeInteger(item.steps, 'steps');
      if (seenDays.has(item.day)) {
        throw new ArchiveError('VALIDATION', 'WeChat Sport data contains a duplicate day.');
      }
      seenDays.add(item.day);
    }
    return this.idempotent(
      principal,
      'steps.wechat.import',
      input.idempotencyKey,
      normalized,
      () => {
        const now = this.runtime.now();
        return normalized.map((item) => {
          const key = `${principal.userId}:${item.day}`;
          const existing = this.state.steps.get(key);
          const record: StepRecord = {
            id: existing?.id ?? this.runtime.id(),
            ownerId: principal.userId,
            day: item.day,
            steps: item.steps,
            source: 'WECHAT',
            createdAt: existing?.createdAt ?? now,
            updatedAt: now,
          };
          this.state.steps.set(key, record);
          return record;
        });
      },
    );
  }

  public getSteps(principal: AuthenticatedPrincipal, day: string): StepRecord {
    validDate(day, 'day');
    return clone(this.owned(principal, this.state.steps.get(`${principal.userId}:${day}`)));
  }

  public listSteps(principal: AuthenticatedPrincipal, limit?: number): readonly StepRecord[] {
    return sorted(
      [...this.state.steps.values()].filter((item) => item.ownerId === principal.userId),
      (item) => item.day,
    )
      .slice(0, boundedLimit(limit, 100))
      .map(clone);
  }

  public createDailyPack(principal: AuthenticatedPrincipal, input: DailyPackInput): DailyPack {
    validDate(input.day, 'day');
    return this.idempotent(principal, 'daily-pack.create', input.idempotencyKey, input, () => {
      const key = `${principal.userId}:${input.day}`;
      if (this.state.dailyPacks.has(key)) throw new ArchiveError('CONFLICT', 'A daily pack already exists for this day.');
      return this.writeDailyPack(principal.userId, input, null);
    }, (item) => this.publishSourceLifecycle('DAILY_PACK', 'SAVED', item, 'ACTIVE'));
  }

  public upsertDailyPack(principal: AuthenticatedPrincipal, input: DailyPackInput): DailyPack {
    validDate(input.day, 'day');
    const existing = this.state.dailyPacks.get(`${principal.userId}:${input.day}`) ?? null;
    return this.idempotent(principal, 'daily-pack.upsert', input.idempotencyKey, input, () => {
      return this.writeDailyPack(principal.userId, input, existing);
    }, (item) => this.publishSourceLifecycle('DAILY_PACK', existing === null ? 'SAVED' : 'REVISED', item, 'ACTIVE'));
  }

  private writeDailyPack(ownerId: string, input: DailyPackInput, existing: DailyPack | null): DailyPack {
    const now = this.runtime.now();
    const item: DailyPack = {
      id: existing?.id ?? this.runtime.id(),
      ownerId,
      day: input.day,
      summary: input.summary ?? existing?.summary ?? null,
      entryIds: input.entryIds === undefined ? existing?.entryIds ?? [] : [...input.entryIds],
      historyIds: input.historyIds === undefined ? existing?.historyIds ?? [] : [...input.historyIds],
      fitnessIds: input.fitnessIds === undefined ? existing?.fitnessIds ?? [] : [...input.fitnessIds],
      stats: input.stats === undefined ? existing?.stats ?? {} : clone(input.stats),
      revision: (existing?.revision ?? 0) + 1,
      status: existing?.status ?? 'ACTIVE',
      createdAt: existing?.createdAt ?? now,
      updatedAt: now,
    };
    for (const entryId of item.entryIds) this.owned({ userId: ownerId } as AuthenticatedPrincipal, this.state.entries.get(entryId));
    for (const historyId of item.historyIds) this.owned({ userId: ownerId } as AuthenticatedPrincipal, this.state.histories.get(historyId));
    for (const fitnessId of item.fitnessIds) this.owned({ userId: ownerId } as AuthenticatedPrincipal, this.state.fitness.get(fitnessId));
    this.state.dailyPacks.set(`${ownerId}:${input.day}`, item);
    return item;
  }

  public getDailyPack(principal: AuthenticatedPrincipal, day: string): DailyPack {
    validDate(day, 'day');
    return clone(this.owned(principal, this.state.dailyPacks.get(`${principal.userId}:${day}`)));
  }

  public listDailyPacks(principal: AuthenticatedPrincipal, limit?: number): readonly DailyPack[] {
    return sorted(
      [...this.state.dailyPacks.values()].filter((item) => item.ownerId === principal.userId && item.status === 'ACTIVE'),
      (item) => item.day,
    )
      .slice(0, boundedLimit(limit, 100))
      .map(clone);
  }

  public updateDailyPack(
    principal: AuthenticatedPrincipal,
    day: string,
    patch: DailyPackPatch,
    options: ArchiveMutationOptions = {},
  ): DailyPack {
    const existing = this.owned(principal, this.state.dailyPacks.get(`${principal.userId}:${day}`));
    this.assertExpectedRevision(principal, 'DAILY_PACK', existing.id, options.expectedRevision, existing.revision, asJsonObject(patch), asJsonObject(existing));
    let input: DailyPackInput = { day };
    if (patch.summary !== undefined) input = { ...input, summary: patch.summary };
    if (patch.entryIds !== undefined) input = { ...input, entryIds: patch.entryIds };
    if (patch.historyIds !== undefined) input = { ...input, historyIds: patch.historyIds };
    if (patch.fitnessIds !== undefined) input = { ...input, fitnessIds: patch.fitnessIds };
    if (patch.stats !== undefined) input = { ...input, stats: patch.stats };
    if (options.idempotencyKey !== undefined) input = { ...input, idempotencyKey: options.idempotencyKey };
    return this.idempotent(
      principal,
      'daily-pack.update',
      options.idempotencyKey,
      { day, patch, options },
      () => this.writeDailyPack(principal.userId, input, existing),
      (item) => this.publishSourceLifecycle('DAILY_PACK', 'REVISED', item, 'ACTIVE'),
    );
  }

  public trashDailyPack(principal: AuthenticatedPrincipal, day: string): DailyPack {
    const existing = this.owned(principal, this.state.dailyPacks.get(`${principal.userId}:${day}`));
    const updated: DailyPack = { ...existing, status: 'TRASHED', revision: existing.revision + 1, updatedAt: this.runtime.now() };
    this.state.dailyPacks.set(`${principal.userId}:${day}`, updated);
    this.persist();
    this.publishSourceLifecycle('DAILY_PACK', 'TRASHED', updated, 'TRASHED');
    return clone(updated);
  }

  public restoreDailyPack(principal: AuthenticatedPrincipal, day: string): DailyPack {
    const existing = this.owned(principal, this.state.dailyPacks.get(`${principal.userId}:${day}`));
    const updated: DailyPack = { ...existing, status: 'ACTIVE', revision: existing.revision + 1, updatedAt: this.runtime.now() };
    this.state.dailyPacks.set(`${principal.userId}:${day}`, updated);
    this.persist();
    this.publishSourceLifecycle('DAILY_PACK', 'RESTORED', updated, 'ACTIVE');
    return clone(updated);
  }

  public permanentlyDeleteDailyPack(principal: AuthenticatedPrincipal, day: string): void {
    const existing = this.owned(principal, this.state.dailyPacks.get(`${principal.userId}:${day}`));
    this.state.dailyPacks.delete(`${principal.userId}:${day}`);
    for (const [linkId, link] of this.state.mediaLinks) {
      if (link.targetType === 'DAILY_PACK' && link.targetId === existing.id) this.state.mediaLinks.delete(linkId);
    }
    this.persist();
    this.publishSourceLifecycle('DAILY_PACK', 'DELETED', existing, 'DELETED', this.runtime.now());
  }

  public registerMedia(principal: AuthenticatedPrincipal, input: ArchiveMediaInput): ArchiveMediaMetadata {
    validateMediaInput(input);
    nonNegativeInteger(input.bytes, 'bytes');
    if (input.width !== undefined && input.width !== null) nonNegativeInteger(input.width, 'width');
    if (input.height !== undefined && input.height !== null) nonNegativeInteger(input.height, 'height');
    if (input.durationMs !== undefined && input.durationMs !== null) nonNegativeInteger(input.durationMs, 'durationMs');
    return this.idempotent(principal, 'media.create', input.idempotencyKey, input, () => {
      const duplicate = [...this.state.media.values()].find((item) => item.storageKey === input.storageKey);
      if (duplicate !== undefined) {
        this.requireOwner(principal, duplicate.ownerId);
        return duplicate;
      }
      this.assertQuota(principal.userId, input.bytes);
      const now = this.runtime.now();
      const item: ArchiveMediaMetadata = {
        id: this.runtime.id(),
        ownerId: principal.userId,
        storageKey: input.storageKey,
        contentType: input.contentType,
        bytes: input.bytes,
        sha256: input.sha256 ?? null,
        width: input.width ?? null,
        height: input.height ?? null,
        durationMs: input.durationMs ?? null,
        originalFilename: input.originalFilename ?? null,
        metadata: clone(input.metadata ?? {}),
        status: 'UPLOADING',
        createdAt: now,
        updatedAt: now,
        deletedAt: null,
      };
      this.state.media.set(item.id, item);
      return item;
    });
  }

  public getMedia(principal: AuthenticatedPrincipal, id: string, includeDeleted = false): ArchiveMediaMetadata {
    const item = this.owned(principal, this.state.media.get(id));
    if (!includeDeleted && item.status === 'DELETED') throw new ArchiveNotFoundError();
    return clone(item);
  }

  public listMedia(principal: AuthenticatedPrincipal, includeDeleted = false): readonly ArchiveMediaMetadata[] {
    return sorted(
      [...this.state.media.values()].filter((item) => item.ownerId === principal.userId && (includeDeleted || item.status !== 'DELETED')),
      (item) => item.createdAt,
    ).map(clone);
  }

  public updateMedia(
    principal: AuthenticatedPrincipal,
    id: string,
    patch: ArchiveMediaPatch,
    idempotencyKey?: string,
  ): ArchiveMediaMetadata {
    const existing = this.owned(principal, this.state.media.get(id));
    return this.idempotent(principal, 'media.update', idempotencyKey, { id, patch }, () => {
      const updated: ArchiveMediaMetadata = {
        ...existing,
        sha256: patch.sha256 === undefined ? existing.sha256 : patch.sha256,
        width: patch.width === undefined ? existing.width : patch.width,
        height: patch.height === undefined ? existing.height : patch.height,
        durationMs: patch.durationMs === undefined ? existing.durationMs : patch.durationMs,
        originalFilename: patch.originalFilename === undefined ? existing.originalFilename : patch.originalFilename,
        metadata: patch.metadata === undefined ? existing.metadata : clone(patch.metadata),
        status: patch.status ?? existing.status,
        updatedAt: this.runtime.now(),
        deletedAt: patch.status === 'DELETED' ? this.runtime.now() : existing.deletedAt,
      };
      this.state.media.set(id, updated);
      return updated;
    });
  }

  public permanentlyDeleteMedia(principal: AuthenticatedPrincipal, id: string, idempotencyKey?: string): void {
    const item = this.owned(principal, this.state.media.get(id));
    this.idempotent(principal, 'media.delete', idempotencyKey, { id }, () => {
      this.state.media.delete(item.id);
      for (const [linkId, link] of this.state.mediaLinks) {
        if (link.mediaId === id) this.state.mediaLinks.delete(linkId);
      }
      return undefined;
    });
  }

  private assertQuota(ownerId: string, additionalBytes: number): void {
    const used = [...this.state.media.values()]
      .filter((item) => item.ownerId === ownerId && item.status !== 'DELETED')
      .reduce((total, item) => total + item.bytes, 0);
    if (used + additionalBytes > this.quotaBytes) {
      throw new ArchiveError('QUOTA_EXCEEDED', 'Archive media quota exceeded.', {
        limitBytes: this.quotaBytes,
        usedBytes: used,
      });
    }
  }

  public getStorageQuota(principal: AuthenticatedPrincipal): StorageQuota {
    const usedBytes = [...this.state.media.values()]
      .filter((item) => item.ownerId === principal.userId && item.status !== 'DELETED')
      .reduce((total, item) => total + item.bytes, 0);
    return {
      ownerId: principal.userId,
      limitBytes: this.quotaBytes,
      usedBytes,
      availableBytes: Math.max(0, this.quotaBytes - usedBytes),
    };
  }

  public linkMedia(
    principal: AuthenticatedPrincipal,
    mediaId: string,
    targetType: MediaLink['targetType'],
    targetId: string,
    idempotencyKey?: string,
  ): MediaLink {
    const media = this.owned(principal, this.state.media.get(mediaId));
    if (media.status === 'DELETED') throw new ArchiveError('INVALID_STATE', 'Deleted media cannot be linked.');
    this.assertTargetOwner(principal, targetType, targetId);
    return this.idempotent(principal, 'media.link', idempotencyKey, { mediaId, targetType, targetId }, () => {
      const existing = [...this.state.mediaLinks.values()].find(
        (link) => link.mediaId === media.id && link.targetType === targetType && link.targetId === targetId,
      );
      if (existing !== undefined) return existing;
      const item: MediaLink = {
        id: this.runtime.id(),
        ownerId: principal.userId,
        mediaId,
        targetType,
        targetId,
        createdAt: this.runtime.now(),
      };
      this.state.mediaLinks.set(item.id, item);
      return item;
    });
  }

  public unlinkMedia(principal: AuthenticatedPrincipal, linkId: string): void {
    const link = this.owned(principal, this.state.mediaLinks.get(linkId));
    this.state.mediaLinks.delete(link.id);
    this.persist();
  }

  public listMediaLinks(principal: AuthenticatedPrincipal, targetId?: string): readonly MediaLink[] {
    return [...this.state.mediaLinks.values()]
      .filter((link) => link.ownerId === principal.userId && (targetId === undefined || link.targetId === targetId))
      .map(clone);
  }

  private assertTargetOwner(principal: AuthenticatedPrincipal, targetType: MediaLink['targetType'], targetId: string): void {
    switch (targetType) {
      case 'ENTRY':
        this.owned(principal, this.state.entries.get(targetId));
        return;
      case 'HISTORY':
        this.owned(principal, this.state.histories.get(targetId));
        return;
      case 'FITNESS':
        this.owned(principal, this.state.fitness.get(targetId));
        return;
      case 'DAILY_PACK':
        this.owned(principal, [...this.state.dailyPacks.values()].find((item) => item.id === targetId));
        return;
    }
  }

  public getTimeline(principal: AuthenticatedPrincipal, options: TimelineOptions = {}): readonly ArchiveTimelineItem[] {
    if (options.from !== undefined) validDate(options.from, 'from');
    if (options.to !== undefined) validDate(options.to, 'to');
    const limit = boundedLimit(options.limit, 100);
    const items: ArchiveTimelineItem[] = [];
    for (const entry of this.state.entries.values()) {
      if (entry.ownerId !== principal.userId || (!options.includeTrashed && entry.status !== 'ACTIVE')) continue;
      items.push({
        id: `ENTRY:${entry.id}`,
        ownerId: principal.userId,
        sourceType: 'ENTRY',
        sourceId: entry.id,
        kind: entry.kind,
        occurredAt: entry.occurredAt,
        createdAt: entry.createdAt,
        updatedAt: entry.updatedAt,
        serverReceivedAt: entry.serverReceivedAt,
        timezone: entry.timezone,
        summary: entry.title ?? entry.body?.slice(0, 160) ?? entry.kind,
        metadata: clone(entry.metadata),
      });
    }
    for (const item of this.state.histories.values()) {
      if (item.ownerId !== principal.userId || (!options.includeTrashed && item.status !== 'ACTIVE')) continue;
      items.push({
        id: `HISTORY:${item.id}`,
        ownerId: principal.userId,
        sourceType: 'HISTORY',
        sourceId: item.id,
        kind: 'HISTORY',
        occurredAt: item.date,
        createdAt: item.createdAt,
        updatedAt: item.updatedAt,
        serverReceivedAt: item.createdAt,
        timezone: null,
        summary: item.title,
        metadata: { dynasty: item.dynasty ?? null, tags: item.tags },
      });
    }
    for (const item of this.state.fitness.values()) {
      if (item.ownerId !== principal.userId || (!options.includeTrashed && item.status !== 'ACTIVE')) continue;
      items.push({
        id: `FITNESS:${item.id}`,
        ownerId: principal.userId,
        sourceType: 'FITNESS',
        sourceId: item.id,
        kind: 'FITNESS',
        occurredAt: item.occurredAt,
        createdAt: item.createdAt,
        updatedAt: item.updatedAt,
        serverReceivedAt: item.createdAt,
        timezone: null,
        summary: item.trainingType ?? 'Fitness',
        metadata: { durationSeconds: item.durationSeconds, stateScore: item.stateScore },
      });
    }
    for (const item of this.state.dailyPacks.values()) {
      if (item.ownerId !== principal.userId || (!options.includeTrashed && item.status !== 'ACTIVE')) continue;
      items.push({
        id: `DAILY_PACK:${item.id}`,
        ownerId: principal.userId,
        sourceType: 'DAILY_PACK',
        sourceId: item.id,
        kind: 'LIFE',
        occurredAt: item.day,
        createdAt: item.createdAt,
        updatedAt: item.updatedAt,
        serverReceivedAt: item.createdAt,
        timezone: null,
        summary: item.summary ?? 'Daily pack',
        metadata: clone(item.stats),
      });
    }
    for (const item of this.state.bodyMetrics.values()) {
      if (item.ownerId !== principal.userId) continue;
      items.push({
        id: `BODY_METRIC:${item.id}`,
        ownerId: principal.userId,
        sourceType: 'BODY_METRIC',
        sourceId: item.id,
        kind: 'FITNESS',
        occurredAt: item.measuredAt,
        createdAt: item.createdAt,
        updatedAt: item.updatedAt,
        serverReceivedAt: item.createdAt,
        timezone: null,
        summary: 'Body metric',
        metadata: clone(item.metadata),
      });
    }
    for (const item of this.state.steps.values()) {
      if (item.ownerId !== principal.userId) continue;
      items.push({
        id: `STEPS:${item.id}`,
        ownerId: principal.userId,
        sourceType: 'STEPS',
        sourceId: item.id,
        kind: 'MOVEMENT',
        occurredAt: item.day,
        createdAt: item.createdAt,
        updatedAt: item.updatedAt,
        serverReceivedAt: item.createdAt,
        timezone: null,
        summary: `${item.steps} steps`,
        metadata: { steps: item.steps, source: item.source },
      });
    }
    const ordered = sorted(
      items.filter((item) =>
        (options.from === undefined || item.occurredAt >= options.from) &&
        (options.to === undefined || item.occurredAt <= options.to),
      ),
      (item) => item.occurredAt,
    );
    return afterCursor(ordered, options.cursor, (item) => item.id).slice(0, limit).map(clone);
  }

  public search(
    principal: AuthenticatedPrincipal,
    query: string,
    options: SearchOptions = {},
  ): readonly ArchiveSearchResult[] {
    const normalized = query.trim().toLocaleLowerCase();
    if (normalized === '') return [];
    const limit = boundedLimit(options.limit, 50);
    const results: ArchiveSearchResult[] = [];
    const add = (
      sourceType: ArchiveTimelineItem['sourceType'],
      sourceId: string,
      occurredAt: string,
      title: string,
      text: string,
    ): void => {
      if (!text.toLocaleLowerCase().includes(normalized)) return;
      results.push({ sourceType, sourceId, occurredAt, title, snippet: shortSnippet(text, normalized) });
    };
    for (const item of this.state.entries.values()) {
      if (item.ownerId !== principal.userId || (!options.includeTrashed && item.status !== 'ACTIVE')) continue;
      add('ENTRY', item.id, item.occurredAt, item.title ?? item.kind, [item.title, item.body, ...item.tags].filter((value): value is string => value !== null).join(' '));
    }
    for (const item of this.state.histories.values()) {
      if (item.ownerId !== principal.userId || (!options.includeTrashed && item.status !== 'ACTIVE')) continue;
      add('HISTORY', item.id, item.date, item.title, [item.title, item.dynasty, item.people.join(' '), item.events.join(' '), item.reflection, ...item.tags].filter((value): value is string => value !== null).join(' '));
    }
    for (const item of this.state.fitness.values()) {
      if (item.ownerId !== principal.userId || (!options.includeTrashed && item.status !== 'ACTIVE')) continue;
      add('FITNESS', item.id, item.occurredAt, item.trainingType ?? 'Fitness', [item.trainingType, item.bodyParts.join(' ')].filter((value): value is string => value !== null).join(' '));
    }
    for (const item of this.state.dailyPacks.values()) {
      if (item.ownerId !== principal.userId || item.status !== 'ACTIVE') continue;
      add('DAILY_PACK', item.id, item.day, item.summary ?? 'Daily pack', item.summary ?? 'Daily pack');
    }
    return afterCursor(sorted(results, (item) => item.occurredAt), options.cursor, (item) => item.sourceId).slice(0, limit).map(clone);
  }

  public exportArchive(
    principal: AuthenticatedPrincipal,
    options: { readonly includeTrashed?: boolean } = {},
  ): ArchiveExport {
    const includeTrashed = options.includeTrashed === true;
    const records = [...this.state.entries.values()].filter((item) => item.ownerId === principal.userId && (includeTrashed || item.status === 'ACTIVE'));
    const revisions = [...this.state.revisions.values()].flat().filter((item) => item.ownerId === principal.userId);
    const publishedSnapshots = [...this.state.publishedSnapshots.values()].flat().filter((item) => item.ownerId === principal.userId && (includeTrashed || item.revokedAt === null));
    const aiInsights = [...this.state.aiInsights.values()].filter((item) => item.ownerId === principal.userId && (includeTrashed || item.revokedAt === null));
    const histories = [...this.state.histories.values()].filter((item) => item.ownerId === principal.userId && (includeTrashed || item.status === 'ACTIVE'));
    const fitness = [...this.state.fitness.values()].filter((item) => item.ownerId === principal.userId && (includeTrashed || item.status === 'ACTIVE'));
    const bodyMetrics = [...this.state.bodyMetrics.values()].filter((item) => item.ownerId === principal.userId);
    const steps = [...this.state.steps.values()].filter((item) => item.ownerId === principal.userId);
    const dailyPacks = [...this.state.dailyPacks.values()].filter((item) => item.ownerId === principal.userId && (includeTrashed || item.status === 'ACTIVE'));
    const media = [...this.state.media.values()].filter((item) => item.ownerId === principal.userId && (includeTrashed || item.status !== 'DELETED'));
    const mediaLinks = [...this.state.mediaLinks.values()].filter((item) => item.ownerId === principal.userId);
    const timeline = this.getTimeline(principal, { includeTrashed });
    const payload = { records, revisions, publishedSnapshots, aiInsights, histories, fitness, bodyMetrics, steps, dailyPacks, media, mediaLinks, timeline };
    const exportedAt = this.runtime.now();
    const life = records.filter((item) => item.kind === 'LIFE');
    const schemaVersion = 'mezip.archive.export.v1' as const;
    const trashPolicy = includeTrashed ? 'INCLUDED' as const : 'EXCLUDED_BY_DEFAULT' as const;
    return {
      id: this.runtime.id(),
      ownerId: principal.userId,
      format: 'JSON',
      generatedAt: exportedAt,
      schemaVersion,
      schema_version: schemaVersion,
      exportedAt,
      exported_at: exportedAt,
      privacy: 'PRIVATE_BY_DEFAULT',
      mediaPolicy: 'MANIFEST_ONLY',
      media_policy: 'MANIFEST_ONLY',
      trashPolicy,
      trash_policy: trashPolicy,
      checksum: checksum(payload),
      records: records.map(clone),
      life: life.map(clone),
      history: histories.map(clone),
      fitnessRecords: fitness.map(clone),
      revisions: revisions.map(clone),
      publishedSnapshots: publishedSnapshots.map(clone),
      aiInsights: aiInsights.map(clone),
      histories: histories.map(clone),
      fitness: fitness.map(clone),
      bodyMetrics: bodyMetrics.map(clone),
      steps: steps.map(clone),
      dailyPacks: dailyPacks.map(clone),
      daily_pack: dailyPacks.map(clone),
      media: media.map(clone),
      mediaLinks: mediaLinks.map(clone),
      timeline: timeline.map(clone),
      timelineMetadata: timeline.map(clone),
      timeline_metadata: timeline.map(clone),
    };
  }

  public recordOfflineMutation(
    principal: AuthenticatedPrincipal,
    input: ArchiveOfflineMutationInput,
  ): ArchiveOfflineMutation {
    if (input.clientMutationId.trim() === '') throw new ArchiveError('VALIDATION', 'clientMutationId is required.');
    const key = `${principal.userId}:${input.clientMutationId}`;
    const fingerprint = jsonFingerprint(input);
    const existing = this.state.offlineMutations.get(key);
    if (existing !== undefined) {
      if (jsonFingerprint({
        clientMutationId: existing.clientMutationId,
        entityType: existing.entityType,
        entityId: existing.entityId,
        operation: existing.operation,
        payload: existing.payload,
        baseRevision: existing.baseRevision,
      }) !== fingerprint) {
        throw new ArchiveError('IDEMPOTENCY_REPLAY', 'clientMutationId was already used with different input.');
      }
      return clone(existing);
    }
    const now = this.runtime.now();
    const item: ArchiveOfflineMutation = {
      id: this.runtime.id(),
      ownerId: principal.userId,
      clientMutationId: input.clientMutationId,
      entityType: input.entityType,
      entityId: input.entityId ?? null,
      operation: input.operation,
      payload: clone(input.payload),
      baseRevision: input.baseRevision ?? null,
      status: 'PENDING',
      createdAt: now,
      updatedAt: now,
      conflictId: null,
    };
    this.state.offlineMutations.set(key, item);
    this.persist();
    return clone(item);
  }

  public listOfflineMutations(principal: AuthenticatedPrincipal): readonly ArchiveOfflineMutation[] {
    return [...this.state.offlineMutations.values()]
      .filter((item) => item.ownerId === principal.userId)
      .sort((left, right) => left.createdAt.localeCompare(right.createdAt))
      .map(clone);
  }

  public updateOfflineMutation(
    principal: AuthenticatedPrincipal,
    clientMutationId: string,
    status: ArchiveOfflineMutation['status'],
    conflictId?: string | null,
  ): ArchiveOfflineMutation {
    const key = `${principal.userId}:${clientMutationId}`;
    const existing = this.owned(principal, this.state.offlineMutations.get(key));
    if (status === 'CONFLICT' && (conflictId === undefined || conflictId === null)) {
      throw new ArchiveError('VALIDATION', 'A conflict mutation requires conflictId.');
    }
    const updated: ArchiveOfflineMutation = {
      ...existing,
      status,
      conflictId: conflictId === undefined ? existing.conflictId : conflictId,
      updatedAt: this.runtime.now(),
    };
    this.state.offlineMutations.set(key, updated);
    this.persist();
    return clone(updated);
  }

  public listConflicts(principal: AuthenticatedPrincipal, unresolvedOnly = false): readonly ArchiveConflict[] {
    return [...this.state.conflicts.values()]
      .filter((item) => item.ownerId === principal.userId && (!unresolvedOnly || item.resolvedAt === null))
      .sort((left, right) => right.createdAt.localeCompare(left.createdAt))
      .map(clone);
  }

  public resolveConflict(
    principal: AuthenticatedPrincipal,
    conflictId: string,
    resolution: ArchiveConflictResolution,
  ): ArchiveConflict {
    const existing = this.owned(principal, this.state.conflicts.get(conflictId));
    if (existing.resolvedAt !== null) return clone(existing);
    if (resolution.resolution === 'MERGED' && resolution.mergedPayload === undefined) {
      throw new ArchiveError('VALIDATION', 'Merged conflict resolution requires mergedPayload.');
    }
    const resolved: ArchiveConflict = { ...existing, resolvedAt: this.runtime.now() };
    this.state.conflicts.set(conflictId, resolved);
    for (const [key, mutation] of this.state.offlineMutations) {
      if (mutation.conflictId === conflictId && mutation.ownerId === principal.userId) {
        this.state.offlineMutations.set(key, { ...mutation, status: 'APPLIED', updatedAt: resolved.resolvedAt ?? this.runtime.now() });
      }
    }
    this.persist();
    return clone(resolved);
  }

  public getSyncState(principal: AuthenticatedPrincipal, cursor: string | null = null): ArchiveSyncState {
    const mutations = this.listOfflineMutations(principal);
    return {
      ownerId: principal.userId,
      cursor,
      pending: mutations.filter((item) => item.status === 'PENDING').length,
      conflicts: this.listConflicts(principal, true).length,
      lastSyncedAt: mutations.filter((item) => item.status === 'APPLIED').map((item) => item.updatedAt).sort().at(-1) ?? null,
    };
  }
}

/** Stable name for adapters that do not want to couple to the local class. */
export type ArchiveRepository = InMemoryArchiveRepository;
export type ArchiveService = InMemoryArchiveRepository;

export class LocalSearchProvider implements SearchProvider {
  public constructor(
    private readonly repository: Pick<InMemoryArchiveRepository, 'search'>,
  ) {}

  public search(
    principal: AuthenticatedPrincipal,
    query: string,
    options: SearchOptions = {},
  ): readonly ArchiveSearchResult[] {
    return this.repository.search(principal, query, options);
  }
}

export { LocalDevelopmentStorage } from './storage.js';
export type {
  StorageObjectMetadata,
  StorageProvider,
  StoragePutInput,
} from './storage.js';

export {
  InMemoryPortableArchiveTarget,
  PortableArchiveError,
  PortableArchiveService,
  createPortableArchiveDataSource,
} from './portable.js';

export {
  PortableArchiveApiAdapter,
  type PortableArchiveApiRequest,
  type PortableArchiveApiResponse,
} from './portable-api.js';
export type {
  PortableArchiveCollectedData,
  PortableArchiveDataSource,
  PortableArchiveRestoreTarget,
  PortableArchiveServiceOptions,
} from './portable.js';
