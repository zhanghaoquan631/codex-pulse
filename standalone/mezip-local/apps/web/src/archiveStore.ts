/**
 * Browser archive adapter for the Phase 3 local/dev boundary.
 *
 * The adapter deliberately stores only metadata and text in localStorage. It
 * never treats a static fixture as a user's archive, scopes every key to an
 * owner, and keeps enough revision information for a future server adapter to
 * detect conflicts without changing the page contract.
 */

export const ARCHIVE_SCHEMA_VERSION = 1 as const;
export const ARCHIVE_EXPORT_SCHEMA = 'mezip.archive.export.v1' as const;
export const DEFAULT_ARCHIVE_OWNER = 'local-owner';
export const DEFAULT_ARCHIVE_QUOTA_BYTES = 50 * 1024 * 1024;

export type ArchiveKind = 'LIFE' | 'HISTORY' | 'FITNESS' | 'AI_USAGE';
export type ArchiveRecordStatus = 'ACTIVE' | 'DELETED';
export type ArchiveSyncState = 'SAVED' | 'DRAFT';

export interface ArchiveMediaMetadata {
  readonly id: string;
  readonly name: string;
  readonly mimeType: string;
  readonly bytes: number;
  readonly width?: number;
  readonly height?: number;
  readonly durationMs?: number;
}

export interface ArchiveRecord {
  readonly id: string;
  readonly ownerId: string;
  readonly kind: ArchiveKind;
  readonly title: string;
  readonly body: string;
  readonly tags: readonly string[];
  readonly metrics: Readonly<Record<string, number>>;
  readonly media: readonly ArchiveMediaMetadata[];
  readonly visibility: 'PRIVATE';
  readonly status: ArchiveRecordStatus;
  readonly syncState: ArchiveSyncState;
  readonly revision: number;
  readonly version: number;
  readonly occurredAt: string;
  readonly createdAt: string;
  readonly updatedAt: string;
  readonly deletedAt?: string;
}

export interface ArchiveCreateInput {
  readonly kind: ArchiveKind;
  readonly title?: string;
  readonly body?: string;
  readonly occurredAt?: string;
  readonly tags?: readonly string[];
  readonly metrics?: Readonly<Record<string, number>>;
  readonly media?: readonly ArchiveMediaMetadata[];
}

export interface ArchiveUpdateInput {
  readonly title?: string;
  readonly body?: string;
  readonly occurredAt?: string;
  readonly tags?: readonly string[];
  readonly metrics?: Readonly<Record<string, number>>;
  /**
   * Local archive media stays metadata-only until a separately authorized
   * media service is configured. Replacing this list is deliberate: a record
   * edit is the explicit owner action for removing an attachment.
   */
  readonly media?: readonly ArchiveMediaMetadata[];
}

export interface ArchiveQuery {
  readonly kind?: ArchiveKind;
  readonly includeDeleted?: boolean;
  readonly query?: string;
}

export interface ArchiveDailyPack {
  readonly id?: string;
  readonly date: string;
  readonly summary?: string;
  readonly recordIds?: readonly string[];
  readonly revision?: number;
  readonly createdAt?: string;
  readonly updatedAt?: string;
  readonly records: readonly ArchiveRecord[];
}

export interface ArchiveQuota {
  readonly usedBytes: number;
  readonly quotaBytes: number;
  readonly remainingBytes: number;
}

export interface ArchiveSummary {
  readonly total: number;
  readonly today: number;
  readonly byKind: Readonly<Record<ArchiveKind, number>>;
  readonly dailyPackReady: boolean;
  readonly dailyPackSources: number;
  readonly pendingRetry: number;
  readonly deleted: number;
}

export interface ArchiveTimelineMetadata {
  readonly id: string;
  readonly ownerId: string;
  readonly sourceId: string;
  readonly kind: ArchiveKind;
  readonly occurredAt: string;
  readonly createdAt: string;
  readonly updatedAt: string;
  readonly status: ArchiveRecordStatus;
  readonly summary: string;
}

export interface ArchiveMediaManifestEntry extends ArchiveMediaMetadata {
  readonly ownerId: string;
  readonly recordId: string;
}

export interface ArchiveExportDocument {
  readonly schemaVersion: typeof ARCHIVE_EXPORT_SCHEMA;
  readonly schema_version: typeof ARCHIVE_EXPORT_SCHEMA;
  readonly exportVersion: typeof ARCHIVE_SCHEMA_VERSION;
  readonly ownerId: string;
  readonly owner_id: string;
  readonly exportedAt: string;
  readonly exported_at: string;
  readonly privacy: 'PRIVATE_BY_DEFAULT';
  readonly records: readonly ArchiveRecord[];
  readonly life: readonly ArchiveRecord[];
  readonly history: readonly ArchiveRecord[];
  readonly fitness: readonly ArchiveRecord[];
  readonly dailyPacks: readonly Omit<ArchiveDailyPack, 'records'>[];
  readonly daily_pack: readonly Omit<ArchiveDailyPack, 'records'>[];
  readonly timelineMetadata: readonly ArchiveTimelineMetadata[];
  readonly timeline_metadata: readonly ArchiveTimelineMetadata[];
  readonly mediaManifest: readonly ArchiveMediaManifestEntry[];
  readonly media_manifest: readonly ArchiveMediaManifestEntry[];
  readonly mediaPolicy: 'MANIFEST_ONLY';
  readonly media_policy: 'MANIFEST_ONLY';
  readonly trashPolicy: 'EXCLUDED_BY_DEFAULT' | 'INCLUDED';
  readonly trash_policy: 'EXCLUDED_BY_DEFAULT' | 'INCLUDED';
  readonly quota: ArchiveQuota;
}

interface ArchiveEnvelope {
  readonly schemaVersion: typeof ARCHIVE_SCHEMA_VERSION;
  readonly ownerId: string;
  readonly revision: number;
  readonly records: readonly ArchiveRecord[];
  readonly dailyPacks?: readonly Omit<ArchiveDailyPack, 'records'>[];
  readonly quotaBytes: number;
  readonly updatedAt: string;
}

export interface ArchiveStorage {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
  removeItem(key: string): void;
}

export class ArchiveConflictError extends Error {
  readonly code = 'CONFLICT' as const;

  constructor(
    readonly recordId: string,
    readonly expectedRevision: number,
    readonly actualRevision: number,
  ) {
    super(
      `Archive ${recordId} changed from revision ${expectedRevision} to ${actualRevision}.`,
    );
    this.name = 'ArchiveConflictError';
  }
}

export class ArchiveQuotaError extends Error {
  readonly code = 'QUOTA_EXCEEDED' as const;

  constructor(readonly requestedBytes: number, readonly remainingBytes: number) {
    super(
      `Archive media quota exceeded: requested ${requestedBytes} bytes with ${remainingBytes} bytes remaining.`,
    );
    this.name = 'ArchiveQuotaError';
  }
}

export class ArchiveOwnerScopeError extends Error {
  readonly code = 'OWNER_SCOPE' as const;

  constructor(readonly ownerId: string) {
    super(`Archive data is not scoped to owner ${ownerId}.`);
    this.name = 'ArchiveOwnerScopeError';
  }
}

export class ArchiveStorageError extends Error {
  readonly code = 'STORAGE' as const;

  constructor(message: string, readonly cause?: unknown) {
    super(message);
    this.name = 'ArchiveStorageError';
  }
}

export class MemoryArchiveStorage implements ArchiveStorage {
  private readonly values = new Map<string, string>();

  getItem(key: string): string | null {
    return this.values.get(key) ?? null;
  }

  setItem(key: string, value: string): void {
    this.values.set(key, value);
  }

  removeItem(key: string): void {
    this.values.delete(key);
  }
}

function browserStorage(): ArchiveStorage | undefined {
  if (typeof window === 'undefined') return undefined;
  try {
    return window.localStorage;
  } catch {
    return undefined;
  }
}

function normalizeText(value: string | undefined): string {
  return (value ?? '').trim();
}

function normalizeTags(tags: readonly string[] | undefined): readonly string[] {
  return [...new Set((tags ?? []).map((tag) => tag.trim()).filter(Boolean))].slice(
    0,
    12,
  );
}

function normalizeMetrics(
  metrics: Readonly<Record<string, number>> | undefined,
): Readonly<Record<string, number>> {
  if (metrics === undefined) return {};
  return Object.fromEntries(
    Object.entries(metrics).filter(
      ([, value]) => Number.isFinite(value) && value >= 0,
    ),
  );
}

function normalizeMedia(
  media: readonly ArchiveMediaMetadata[] | undefined,
): readonly ArchiveMediaMetadata[] {
  return (media ?? [])
    .filter((item) => Number.isFinite(item.bytes) && item.bytes >= 0)
    .map((item) => ({ ...item, bytes: Math.floor(item.bytes) }));
}

function dateKey(iso: string): string {
  return iso.slice(0, 10);
}

function summaryForDailyPack(records: readonly ArchiveRecord[]): string {
  const labels: Readonly<Record<ArchiveKind, string>> = {
    LIFE: '生活',
    HISTORY: '读书感悟',
    FITNESS: '健身',
    AI_USAGE: 'AI 使用',
  };
  const counts = records.reduce<Partial<Record<ArchiveKind, number>>>((result, record) => {
    result[record.kind] = (result[record.kind] ?? 0) + 1;
    return result;
  }, {});
  const breakdown = (Object.keys(labels) as ArchiveKind[])
    .flatMap((kind) => {
      const count = counts[kind] ?? 0;
      return count > 0 ? [`${labels[kind]} ${count}`] : [];
    })
    .join(' · ');
  return `今日归档报告 · ${records.length} 条来源${breakdown.length > 0 ? ` · ${breakdown}` : ''}`;
}

function normalizeOccurredAt(value: string | undefined, fallback: string): string {
  const normalized = normalizeText(value);
  if (normalized.length === 0) return fallback;
  const parsed = Date.parse(normalized);
  if (!Number.isFinite(parsed)) throw new Error('occurredAt must be a valid ISO date.');
  return new Date(parsed).toISOString();
}

function normalizePersistedRecord(record: ArchiveRecord): ArchiveRecord {
  return {
    ...record,
    occurredAt: normalizeOccurredAt(record.occurredAt, record.updatedAt),
  };
}

function cloneRecord(record: ArchiveRecord): ArchiveRecord {
  return {
    ...normalizePersistedRecord(record),
    tags: [...record.tags],
    metrics: { ...record.metrics },
    media: record.media.map((item) => ({ ...item })),
  };
}

function compareNewest(a: ArchiveRecord, b: ArchiveRecord): number {
  return b.occurredAt.localeCompare(a.occurredAt)
    || b.updatedAt.localeCompare(a.updatedAt)
    || b.id.localeCompare(a.id);
}

export interface LocalArchiveAdapterOptions {
  readonly ownerId?: string;
  readonly storage?: ArchiveStorage;
  readonly now?: () => number;
  readonly idFactory?: (ownerId: string, tick: number) => string;
  readonly online?: () => boolean;
  readonly quotaBytes?: number;
}

/**
 * A deterministic local adapter. Pass a fixed `now`, `idFactory`, and
 * MemoryArchiveStorage in tests; production/dev defaults to browser APIs.
 */
export class LocalArchiveAdapter {
  private currentOwnerId: string;
  readonly storage: ArchiveStorage;
  readonly quotaBytes: number;

  private readonly now: () => number;
  private readonly idFactory: (ownerId: string, tick: number) => string;
  private readonly onlineProvider: () => boolean;
  private forcedOnline: boolean | undefined;

  constructor(options: LocalArchiveAdapterOptions = {}) {
    this.currentOwnerId = options.ownerId ?? DEFAULT_ARCHIVE_OWNER;
    this.storage = options.storage ?? browserStorage() ?? new MemoryArchiveStorage();
    this.quotaBytes = options.quotaBytes ?? DEFAULT_ARCHIVE_QUOTA_BYTES;
    this.now = options.now ?? (() => Date.now());
    this.idFactory =
      options.idFactory ?? ((ownerId, tick) => `archive-${ownerId}-${tick}`);
    this.onlineProvider = options.online ?? (() => true);
  }

  get ownerId(): string {
    return this.currentOwnerId;
  }

  /**
   * Development-only client storage partition. Production ownership is always
   * server-derived; callers cannot use this local adapter as authorization.
   */
  setOwner(ownerId: string): void {
    const normalized = ownerId.trim();
    if (!/^[A-Za-z0-9][A-Za-z0-9_-]{1,127}$/.test(normalized)) {
      throw new ArchiveOwnerScopeError(normalized || 'invalid-owner');
    }
    this.currentOwnerId = normalized;
  }

  get storageKey(): string {
    return `me.zip.archive.v${ARCHIVE_SCHEMA_VERSION}:${encodeURIComponent(this.ownerId)}`;
  }

  setOnline(online: boolean): void {
    this.forcedOnline = online;
  }

  isOnline(): boolean {
    return this.forcedOnline ?? this.onlineProvider();
  }

  private timestamp(): string {
    return new Date(this.now()).toISOString();
  }

  private emptyEnvelope(): ArchiveEnvelope {
    return {
      schemaVersion: ARCHIVE_SCHEMA_VERSION,
      ownerId: this.ownerId,
      revision: 0,
      records: [],
      dailyPacks: [],
      quotaBytes: this.quotaBytes,
      updatedAt: this.timestamp(),
    };
  }

  private readEnvelope(): ArchiveEnvelope {
    const raw = this.storage.getItem(this.storageKey);
    if (raw === null) return this.emptyEnvelope();
    try {
      const parsed: unknown = JSON.parse(raw);
      if (
        typeof parsed !== 'object' ||
        parsed === null ||
        !('schemaVersion' in parsed) ||
        parsed.schemaVersion !== ARCHIVE_SCHEMA_VERSION ||
        !('ownerId' in parsed) ||
        parsed.ownerId !== this.ownerId ||
        !('records' in parsed) ||
        !Array.isArray(parsed.records)
      ) {
        throw new ArchiveOwnerScopeError(this.ownerId);
      }
      return {
        schemaVersion: ARCHIVE_SCHEMA_VERSION,
        ownerId: this.ownerId,
        revision:
          'revision' in parsed && typeof parsed.revision === 'number'
            ? parsed.revision
            : 0,
        records: (parsed.records as ArchiveRecord[]).map(normalizePersistedRecord),
      dailyPacks:
        'dailyPacks' in parsed && Array.isArray(parsed.dailyPacks)
          ? parsed.dailyPacks as Omit<ArchiveDailyPack, 'records'>[]
          : [],
        quotaBytes:
          'quotaBytes' in parsed && typeof parsed.quotaBytes === 'number'
            ? parsed.quotaBytes
            : this.quotaBytes,
        updatedAt:
          'updatedAt' in parsed && typeof parsed.updatedAt === 'string'
            ? parsed.updatedAt
            : this.timestamp(),
      };
    } catch (error) {
      if (error instanceof ArchiveOwnerScopeError) throw error;
      throw new ArchiveStorageError('Unable to read archive storage.', error);
    }
  }

  private writeEnvelope(envelope: ArchiveEnvelope): void {
    try {
      this.storage.setItem(this.storageKey, JSON.stringify(envelope));
    } catch (error) {
      throw new ArchiveStorageError('Unable to persist archive storage.', error);
    }
  }

  private commit(records: readonly ArchiveRecord[]): ArchiveRecord[] {
    const current = this.readEnvelope();
    const next: ArchiveEnvelope = {
      ...current,
      revision: current.revision + 1,
      records: records.map(cloneRecord),
      updatedAt: this.timestamp(),
    };
    this.writeEnvelope(next);
    return next.records.map(cloneRecord);
  }

  private syncState(): ArchiveSyncState {
    return this.isOnline() ? 'SAVED' : 'DRAFT';
  }

  list(query: ArchiveQuery = {}): readonly ArchiveRecord[] {
    const normalizedQuery = normalizeText(query.query).toLocaleLowerCase();
    return this.readEnvelope()
      .records.filter((record) => {
        if (query.kind !== undefined && record.kind !== query.kind) return false;
        if (!query.includeDeleted && record.status === 'DELETED') return false;
        if (normalizedQuery.length === 0) return true;
        const haystack = [record.title, record.body, ...record.tags]
          .join(' ')
          .toLocaleLowerCase();
        return haystack.includes(normalizedQuery);
      })
      .map(cloneRecord)
      .sort(compareNewest);
  }

  search(query: string, kind?: ArchiveKind): readonly ArchiveRecord[] {
    return this.list(kind === undefined ? { query } : { query, kind });
  }

  get(id: string, includeDeleted = false): ArchiveRecord | undefined {
    return this.list({ includeDeleted }).find((record) => record.id === id);
  }

  create(input: ArchiveCreateInput): ArchiveRecord {
    const suppliedTitle = normalizeText(input.title);
    const title = suppliedTitle.length > 0 ? suppliedTitle : defaultTitleForKind(input.kind);
    const body = normalizeText(input.body);
    const current = this.readEnvelope();
    const tick = this.now();
    let id = this.idFactory(this.ownerId, tick);
    let suffix = 0;
    while (current.records.some((record) => record.id === id)) {
      suffix += 1;
      id = `${this.idFactory(this.ownerId, tick)}-${suffix}`;
    }
    const timestamp = this.timestamp();
    const record: ArchiveRecord = {
      id,
      ownerId: this.ownerId,
      kind: input.kind,
      title,
      body,
      tags: normalizeTags(input.tags),
      metrics: normalizeMetrics(input.metrics),
      media: normalizeMedia(input.media),
      visibility: 'PRIVATE',
      status: 'ACTIVE',
      syncState: this.syncState(),
      revision: 1,
      version: 1,
      occurredAt: normalizeOccurredAt(input.occurredAt, timestamp),
      createdAt: timestamp,
      updatedAt: timestamp,
    };
    this.assertMediaQuota([...current.records, record]);
    this.commit([...current.records, record]);
    return cloneRecord(record);
  }

  update(
    id: string,
    patch: ArchiveUpdateInput,
    expectedRevision?: number,
  ): ArchiveRecord {
    const current = this.readEnvelope();
    const index = current.records.findIndex((record) => record.id === id);
    if (index < 0) throw new Error('Archive record was not found.');
    const existing = current.records[index];
    if (existing === undefined || existing.status === 'DELETED')
      throw new Error('Deleted archive records must be restored before editing.');
    if (
      expectedRevision !== undefined &&
      expectedRevision !== existing.revision
    ) {
      throw new ArchiveConflictError(id, expectedRevision, existing.revision);
    }
    const next: ArchiveRecord = {
      ...existing,
      title:
        patch.title === undefined
          ? existing.title
          : normalizeText(patch.title) || defaultTitleForKind(existing.kind),
      body: patch.body === undefined ? existing.body : normalizeText(patch.body),
      tags: patch.tags === undefined ? existing.tags : normalizeTags(patch.tags),
      metrics:
        patch.metrics === undefined
          ? existing.metrics
          : normalizeMetrics(patch.metrics),
      media: patch.media === undefined ? existing.media : normalizeMedia(patch.media),
      syncState: this.syncState(),
      revision: existing.revision + 1,
      version: existing.version + 1,
      occurredAt: normalizeOccurredAt(patch.occurredAt, existing.occurredAt),
      updatedAt: this.timestamp(),
    };
    const records = current.records.map((record, recordIndex) =>
      recordIndex === index ? next : record,
    );
    this.assertMediaQuota(records);
    this.commit(records);
    return cloneRecord(next);
  }

  moveToTrash(id: string, expectedRevision?: number): ArchiveRecord {
    const current = this.readEnvelope();
    const index = current.records.findIndex((record) => record.id === id);
    if (index < 0) throw new Error('Archive record was not found.');
    const existing = current.records[index];
    if (existing === undefined) throw new Error('Archive record was not found.');
    if (
      expectedRevision !== undefined &&
      expectedRevision !== existing.revision
    ) {
      throw new ArchiveConflictError(id, expectedRevision, existing.revision);
    }
    const next: ArchiveRecord = {
      ...existing,
      status: 'DELETED',
      syncState: this.syncState(),
      revision: existing.revision + 1,
      version: existing.version + 1,
      updatedAt: this.timestamp(),
      deletedAt: this.timestamp(),
    };
    const records = current.records.map((record, recordIndex) =>
      recordIndex === index ? next : record,
    );
    this.commit(records);
    return cloneRecord(next);
  }

  restore(id: string, expectedRevision?: number): ArchiveRecord {
    const current = this.readEnvelope();
    const index = current.records.findIndex((record) => record.id === id);
    if (index < 0) throw new Error('Archive record was not found.');
    const existing = current.records[index];
    if (existing === undefined) throw new Error('Archive record was not found.');
    if (
      expectedRevision !== undefined &&
      expectedRevision !== existing.revision
    ) {
      throw new ArchiveConflictError(id, expectedRevision, existing.revision);
    }
    const next: ArchiveRecord = {
      ...existing,
      status: 'ACTIVE',
      syncState: this.syncState(),
      revision: existing.revision + 1,
      version: existing.version + 1,
      updatedAt: this.timestamp(),
    };
    delete (next as { deletedAt?: string }).deletedAt;
    const records = current.records.map((record, recordIndex) =>
      recordIndex === index ? next : record,
    );
    this.commit(records);
    return cloneRecord(next);
  }

  permanentDelete(id: string): void {
    const current = this.readEnvelope();
    const records = current.records.filter((record) => record.id !== id);
    if (records.length === current.records.length)
      throw new Error('Archive record was not found.');
    this.commit(records);
  }

  addMedia(id: string, media: ArchiveMediaMetadata): ArchiveRecord {
    const current = this.readEnvelope();
    const index = current.records.findIndex((record) => record.id === id);
    if (index < 0) throw new Error('Archive record was not found.');
    const existing = current.records[index];
    if (existing === undefined) throw new Error('Archive record was not found.');
    const nextMedia = normalizeMedia([...existing.media, media]);
    const next: ArchiveRecord = {
      ...existing,
      media: nextMedia,
      syncState: this.syncState(),
      revision: existing.revision + 1,
      version: existing.version + 1,
      updatedAt: this.timestamp(),
    };
    const records = current.records.map((record, recordIndex) =>
      recordIndex === index ? next : record,
    );
    this.assertMediaQuota(records);
    this.commit(records);
    return cloneRecord(next);
  }

  private assertMediaQuota(records: readonly ArchiveRecord[]): void {
    const usedBytes = records.reduce(
      (total, record) =>
        total + record.media.reduce((mediaTotal, item) => mediaTotal + item.bytes, 0),
      0,
    );
    if (usedBytes > this.quotaBytes) {
      throw new ArchiveQuotaError(usedBytes, Math.max(0, this.quotaBytes - usedBytes));
    }
  }

  quota(): ArchiveQuota {
    const usedBytes = this.readEnvelope().records.reduce(
      (total, record) =>
        total + record.media.reduce((mediaTotal, item) => mediaTotal + item.bytes, 0),
      0,
    );
    return {
      usedBytes,
      quotaBytes: this.quotaBytes,
      remainingBytes: Math.max(0, this.quotaBytes - usedBytes),
    };
  }

  summary(date = dateKey(this.timestamp())): ArchiveSummary {
    const active = this.list();
    const all = this.list({ includeDeleted: true });
    const kinds: readonly ArchiveKind[] = ['LIFE', 'HISTORY', 'FITNESS', 'AI_USAGE'];
    const byKind = Object.fromEntries(
      kinds.map((kind) => [kind, active.filter((record) => record.kind === kind).length]),
    ) as Record<ArchiveKind, number>;
    const pack = this.dailyPack(date);
    return {
      total: active.length,
      today: active.filter((record) => dateKey(record.occurredAt) === date).length,
      byKind,
      dailyPackReady: pack.id !== undefined,
      dailyPackSources: pack.records.length,
      pendingRetry: all.filter((record) => record.syncState === 'DRAFT').length,
      deleted: all.filter((record) => record.status === 'DELETED').length,
    };
  }

  dailyPack(date = dateKey(this.timestamp())): ArchiveDailyPack {
    const envelope = this.readEnvelope();
    const persisted = envelope.dailyPacks?.find((pack) => pack.date === date);
    const records = this.list().filter((record) => dateKey(record.occurredAt) === date);
    return {
      ...(persisted === undefined ? {} : persisted),
      date,
      records: (persisted?.recordIds === undefined ? records : this.list().filter((record) => persisted.recordIds?.includes(record.id))),
    };
  }

  createDailyPack(date = dateKey(this.timestamp()), summary?: string): ArchiveDailyPack | undefined {
    const current = this.readEnvelope();
    const existing = current.dailyPacks?.find((pack) => pack.date === date);
    if (existing !== undefined) return this.dailyPack(date);
    const records = this.list().filter((record) => dateKey(record.occurredAt) === date);
    if (records.length === 0) return undefined;
    const timestamp = this.timestamp();
    const pack = {
      id: `daily-pack-${this.ownerId}-${date}`,
      date,
      summary: summary?.trim() || summaryForDailyPack(records),
      recordIds: records.map((record) => record.id),
      revision: 1,
      createdAt: timestamp,
      updatedAt: timestamp,
    } satisfies Omit<ArchiveDailyPack, 'records'>;
    this.writeEnvelope({ ...current, dailyPacks: [...(current.dailyPacks ?? []), pack], updatedAt: timestamp });
    return { ...pack, records: records.map(cloneRecord) };
  }

  exportJson(includeDeleted = false): string {
    const envelope = this.readEnvelope();
    const records = envelope.records
      .filter((record) => includeDeleted || record.status !== 'DELETED')
      .map(cloneRecord);
    const life = records.filter((record) => record.kind === 'LIFE');
    const history = records.filter((record) => record.kind === 'HISTORY');
    const fitness = records.filter((record) => record.kind === 'FITNESS');
    const dailyPacks = envelope.dailyPacks ?? [];
    const timelineMetadata = records.map((record) => ({
      id: `${record.kind}:${record.id}`,
      ownerId: record.ownerId,
      sourceId: record.id,
      kind: record.kind,
      occurredAt: record.occurredAt,
      createdAt: record.createdAt,
      updatedAt: record.updatedAt,
      status: record.status,
      summary: record.title || record.body.slice(0, 160),
    }));
    const mediaManifest = records.flatMap((record) =>
      record.media.map((media) => ({ ...media, ownerId: record.ownerId, recordId: record.id })),
    );
    const exportedAt = this.timestamp();
    const document: ArchiveExportDocument = {
      schemaVersion: ARCHIVE_EXPORT_SCHEMA,
      schema_version: ARCHIVE_EXPORT_SCHEMA,
      exportVersion: ARCHIVE_SCHEMA_VERSION,
      ownerId: this.ownerId,
      owner_id: this.ownerId,
      exportedAt,
      exported_at: exportedAt,
      privacy: 'PRIVATE_BY_DEFAULT',
      records,
      life,
      history,
      fitness,
      dailyPacks,
      daily_pack: dailyPacks,
      timelineMetadata,
      timeline_metadata: timelineMetadata,
      mediaManifest,
      media_manifest: mediaManifest,
      mediaPolicy: 'MANIFEST_ONLY',
      media_policy: 'MANIFEST_ONLY',
      trashPolicy: includeDeleted ? 'INCLUDED' : 'EXCLUDED_BY_DEFAULT',
      trash_policy: includeDeleted ? 'INCLUDED' : 'EXCLUDED_BY_DEFAULT',
      quota: this.quota(),
    };
    return JSON.stringify(document, null, 2);
  }

  syncDrafts(): readonly ArchiveRecord[] {
    if (!this.isOnline()) return this.list({ includeDeleted: true });
    const current = this.readEnvelope();
    let changed = false;
    const records = current.records.map((record) => {
      if (record.syncState !== 'DRAFT') return record;
      changed = true;
      return { ...record, syncState: 'SAVED' as const, updatedAt: this.timestamp() };
    });
    if (changed) this.commit(records);
    return this.list({ includeDeleted: true });
  }
}

function defaultTitleForKind(kind: ArchiveKind): string {
  switch (kind) {
    case 'LIFE':
      return '生活记录';
    case 'HISTORY':
      return '读书感悟';
    case 'FITNESS':
      return '健身记录';
    case 'AI_USAGE':
      return 'AI 使用记录';
  }
}

export const localArchiveAdapter = new LocalArchiveAdapter();

export const archiveKindForRoute = {
  '/life': 'LIFE',
  '/timeline': undefined,
  '/history': 'HISTORY',
  '/fitness': 'FITNESS',
  '/daily-pack': undefined,
  '/trash': undefined,
  '/export': undefined,
} as const satisfies Readonly<Record<string, ArchiveKind | undefined>>;

export function archiveLabel(kind: ArchiveKind): string {
  return {
    LIFE: '生活',
    HISTORY: '读书感悟',
    FITNESS: '健身',
    AI_USAGE: 'AI 使用',
  }[kind];
}
