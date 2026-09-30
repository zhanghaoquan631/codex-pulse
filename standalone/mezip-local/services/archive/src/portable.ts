import {
  createCipheriv,
  createDecipheriv,
  createHash,
  randomBytes,
  randomUUID,
  scryptSync,
} from 'node:crypto';

import type {
  AuthenticatedPrincipal,
  JsonObject,
  JsonValue,
  PortableAnnualArchive,
  PortableArchiveBackup,
  PortableArchiveChecksum,
  PortableArchiveConflict,
  PortableArchiveConflictResolution,
  PortableArchiveDateRange,
  PortableArchiveDownload,
  PortableArchiveEncryptionMode,
  PortableArchiveExportJob,
  PortableArchiveExportRequest,
  PortableArchiveImportJob,
  PortableArchiveImportPreview,
  PortableArchiveImportRequest,
  PortableArchiveManifest,
  PortableArchiveSection,
  ArchiveExport,
  PortableLegacyPlan,
  PortableLegacyPolicy,
  PortableLegacyRecipient,
} from '@me-zip/shared-types';

import type { InMemoryArchiveRepository } from './index.js';

const CURRENT_SCHEMA = 'mezip.archive.v1' as const;
const MAX_ARCHIVE_BYTES = 256 * 1024 * 1024;
const MAX_FILE_BYTES = 64 * 1024 * 1024;
const MAX_FILES = 512;
const ALL_SECTIONS: readonly PortableArchiveSection[] = [
  'PROFILE',
  'LIFE',
  'TIMELINE',
  'HISTORY',
  'FITNESS',
  'STEPS',
  'DAILY_PACK',
  'AI_USAGE',
  'AI_INSIGHTS',
  'SOCIAL',
  'PROJECTS',
  'MEMBERSHIP',
  'PRIVACY',
  'DEVICES',
  'MEDIA',
];

export type PortableArchiveErrorCode =
  | 'VALIDATION'
  | 'NOT_FOUND'
  | 'FORBIDDEN'
  | 'INTEGRITY_FAILED'
  | 'UNSUPPORTED_SCHEMA'
  | 'ZIP_SLIP'
  | 'ZIP_BOMB'
  | 'PASSWORD_REQUIRED'
  | 'CONFLICT'
  | 'NOT_CONFIGURED';

export class PortableArchiveError extends Error {
  public constructor(
    public readonly code: PortableArchiveErrorCode,
    message: string,
  ) {
    super(message);
    this.name = 'PortableArchiveError';
  }
}

export interface PortableArchiveCollectedData {
  readonly sections: Partial<Record<PortableArchiveSection, readonly JsonValue[]>>;
  readonly timezone?: string;
  readonly locale?: string;
  readonly appVersion?: string;
  readonly sensitiveDataIncluded?: boolean;
  readonly indexVersion?: string | null;
}

export interface PortableArchiveDataSource {
  collect(
    principal: AuthenticatedPrincipal,
    request: PortableArchiveExportRequest,
  ): PortableArchiveCollectedData;
}

export interface PortableArchiveRestoreTarget {
  preview(
    principal: AuthenticatedPrincipal,
    sections: Partial<Record<PortableArchiveSection, readonly JsonValue[]>>,
  ): readonly PortableArchiveConflict[];
  restore(
    principal: AuthenticatedPrincipal,
    sections: Partial<Record<PortableArchiveSection, readonly JsonValue[]>>,
    resolution: PortableArchiveConflictResolution,
    selectedSections?: readonly PortableArchiveSection[],
  ): Readonly<Record<string, number>>;
}

export interface PortableArchiveServiceOptions {
  readonly dataSource: PortableArchiveDataSource;
  readonly restoreTarget?: PortableArchiveRestoreTarget;
  readonly now?: () => string;
  readonly id?: () => string;
  readonly timezone?: string;
  readonly locale?: string;
  readonly appVersion?: string;
  readonly downloadTtlSeconds?: number;
}

interface Artifact {
  readonly bytes: Uint8Array;
  readonly envelope: PortableArchiveEnvelope;
  readonly manifest: PortableArchiveManifest;
  readonly passwordRequired: boolean;
}
interface PortableArchiveEnvelope {
  readonly container: 'MEZIP_DIRECTORY_JSON_V1';
  readonly manifest: PortableArchiveManifest;
  readonly files: readonly PortableArchiveFile[];
  readonly checksums: readonly PortableArchiveChecksum[];
  readonly manifestSha256: string;
  readonly encryption: {
    readonly mode: PortableArchiveEncryptionMode;
    readonly saltBase64: string | null;
  };
}
interface PortableArchiveFile {
  readonly path: string;
  readonly contentType: string;
  readonly bytesBase64: string;
}
interface PortableArchiveJobInternal {
  readonly job: PortableArchiveExportJob;
  readonly artifact: Artifact;
  readonly downloadToken: string;
}

function clone<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T;
}
function bytes(value: string): Uint8Array {
  return new Uint8Array(Buffer.from(value, 'utf8'));
}
function text(value: Uint8Array): string {
  return Buffer.from(value).toString('utf8');
}
function base64(value: Uint8Array): string {
  return Buffer.from(value).toString('base64');
}
function fromBase64(value: string): Uint8Array {
  return new Uint8Array(Buffer.from(value, 'base64'));
}
function sha256(value: Uint8Array | string): string {
  return createHash('sha256').update(value).digest('hex');
}
function canonical(value: unknown): string {
  if (value === null || typeof value !== 'object') return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map(canonical).join(',')}]`;
  const record = value as Record<string, unknown>;
  return `{${Object.keys(record)
    .sort()
    .map((key) => `${JSON.stringify(key)}:${canonical(record[key])}`)
    .join(',')}}`;
}
function json(value: unknown): Uint8Array {
  return bytes(`${JSON.stringify(value, null, 2)}\n`);
}
function parseJson(value: Uint8Array): unknown {
  try {
    return JSON.parse(text(value)) as unknown;
  } catch {
    throw new PortableArchiveError('INTEGRITY_FAILED', 'Archive JSON is malformed.');
  }
}
function assertSafePath(path: string): void {
  if (
    path.length === 0 ||
    path.length > 240 ||
    path.startsWith('/') ||
    path.includes('\\') ||
    path.split('/').includes('..') ||
    !/^[A-Za-z0-9][A-Za-z0-9._/-]*$/u.test(path)
  )
    throw new PortableArchiveError('ZIP_SLIP', 'Archive contains an unsafe path.');
}
function safeDateRange(
  request: PortableArchiveExportRequest,
): PortableArchiveDateRange {
  if (request.dateRange === undefined)
    return {
      from: request.year === undefined ? null : `${request.year}-01-01T00:00:00.000Z`,
      to: request.year === undefined ? null : `${request.year}-12-31T23:59:59.999Z`,
    };
  const from =
    request.dateRange.from === null
      ? null
      : new Date(request.dateRange.from).toISOString();
  const to =
    request.dateRange.to === null ? null : new Date(request.dateRange.to).toISOString();
  if (from !== null && to !== null && from > to)
    throw new PortableArchiveError('VALIDATION', 'The archive date range is invalid.');
  return { from, to };
}
function ownerReference(ownerId: string): string {
  return `owner_${sha256(ownerId).slice(0, 24)}`;
}
function portableId(ownerId: string, value: string): string {
  return `p_${sha256(`${ownerId}:${value}`).slice(0, 32)}`;
}

const SECRET_KEYS = new Set([
  'password',
  'passwordhash',
  'token',
  'accesstoken',
  'refreshtoken',
  'oauthsecret',
  'credential',
  'credentialref',
  'apikey',
  'byok',
  'cookie',
  'privatekey',
  'secret',
  'devicecredential',
  'pairingtoken',
  'session',
  'rawembedding',
  'embedding',
  'prompt',
  'response',
]);
function sanitize(
  value: unknown,
  ownerId: string,
  ownerRef: string,
  key = '',
): JsonValue | undefined {
  const normalizedKey = key.toLowerCase().replace(/[_-]/g, '');
  if (
    SECRET_KEYS.has(normalizedKey) ||
    normalizedKey.includes('secret') ||
    normalizedKey.includes('token')
  )
    return undefined;
  if (
    value === null ||
    typeof value === 'string' ||
    typeof value === 'number' ||
    typeof value === 'boolean'
  ) {
    if (normalizedKey === 'ownerid' || normalizedKey === 'userid') return ownerRef;
    if (
      (normalizedKey === 'id' || normalizedKey.endsWith('id')) &&
      typeof value === 'string'
    )
      return portableId(ownerId, value);
    return value as JsonValue;
  }
  if (Array.isArray(value))
    return value
      .map((item) => sanitize(item, ownerId, ownerRef, key))
      .filter((item): item is JsonValue => item !== undefined);
  if (typeof value === 'object') {
    const result: Record<string, JsonValue> = {};
    for (const [childKey, childValue] of Object.entries(
      value as Record<string, unknown>,
    )) {
      const sanitized = sanitize(childValue, ownerId, ownerRef, childKey);
      if (sanitized !== undefined)
        result[
          childKey === 'ownerId' || childKey === 'userId' ? 'ownerReference' : childKey
        ] = sanitized;
    }
    return result;
  }
  return undefined;
}
function sanitizeSection(
  ownerId: string,
  values: readonly JsonValue[] | undefined,
): readonly JsonValue[] {
  return (values ?? []).map(
    (value) => sanitize(value, ownerId, ownerReference(ownerId)) as JsonValue,
  );
}
function objectId(value: JsonValue): string | null {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) return null;
  const record = value as Record<string, JsonValue>;
  return typeof record.id === 'string' ? record.id : null;
}
function sectionPath(section: PortableArchiveSection): string {
  const paths: Record<PortableArchiveSection, string> = {
    PROFILE: 'profile/profile.json',
    LIFE: 'life/entries.json',
    TIMELINE: 'timeline/events.json',
    HISTORY: 'history/entries.json',
    FITNESS: 'fitness/sessions.json',
    STEPS: 'steps/daily.json',
    DAILY_PACK: 'daily-pack/packs.json',
    AI_USAGE: 'ai-usage/sessions.json',
    AI_INSIGHTS: 'ai-insights/insights.json',
    SOCIAL: 'social/items.json',
    PROJECTS: 'projects/manifest.json',
    MEMBERSHIP: 'membership/history.json',
    PRIVACY: 'privacy/settings.json',
    DEVICES: 'devices/devices.json',
    MEDIA: 'media/manifest.json',
  };
  return paths[section];
}

function deriveKey(password: string, salt: Uint8Array): Uint8Array {
  return new Uint8Array(scryptSync(password, salt, 32));
}
function encrypt(value: Uint8Array, password: string, salt: Uint8Array): Uint8Array {
  const iv = randomBytes(12);
  const cipher = createCipheriv('aes-256-gcm', deriveKey(password, salt), iv);
  const encrypted = Buffer.concat([cipher.update(value), cipher.final()]);
  return new Uint8Array(Buffer.concat([iv, cipher.getAuthTag(), encrypted]));
}
function decrypt(value: Uint8Array, password: string, salt: Uint8Array): Uint8Array {
  if (value.byteLength < 28)
    throw new PortableArchiveError(
      'INTEGRITY_FAILED',
      'Encrypted archive payload is truncated.',
    );
  const decipher = createDecipheriv(
    'aes-256-gcm',
    deriveKey(password, salt),
    value.slice(0, 12),
  );
  decipher.setAuthTag(value.slice(12, 28));
  try {
    return new Uint8Array(
      Buffer.concat([decipher.update(value.slice(28)), decipher.final()]),
    );
  } catch {
    throw new PortableArchiveError(
      'INTEGRITY_FAILED',
      'Archive password or encrypted payload is invalid.',
    );
  }
}

function buildEnvelope(
  ownerId: string,
  request: PortableArchiveExportRequest,
  data: PortableArchiveCollectedData,
  now: string,
  id: string,
  defaults: { timezone: string; locale: string; appVersion: string },
): Artifact {
  const sections =
    request.sections === undefined ? ALL_SECTIONS : [...new Set(request.sections)];
  if (
    sections.length === 0 ||
    sections.some((section) => !ALL_SECTIONS.includes(section))
  )
    throw new PortableArchiveError(
      'VALIDATION',
      'At least one supported archive section is required.',
    );
  if (sections.length > ALL_SECTIONS.length)
    throw new PortableArchiveError(
      'VALIDATION',
      'Too many archive sections were requested.',
    );
  const dateRange = safeDateRange(request);
  const manifest: PortableArchiveManifest = {
    format: 'MEZIP',
    schemaVersion: CURRENT_SCHEMA,
    archiveId: id,
    ownerReference: ownerReference(ownerId),
    createdAt: now,
    exportedAt: now,
    timezone: request.timezone ?? data.timezone ?? defaults.timezone,
    locale: request.locale ?? data.locale ?? defaults.locale,
    appVersion: data.appVersion ?? defaults.appVersion,
    includedSections: sections,
    mediaPolicy: request.includeMedia === true ? 'INCLUDED' : 'MANIFEST_ONLY',
    encryption: request.encryptionMode ?? 'NONE',
    checksumAlgorithm: 'SHA-256',
    contentCounts: Object.fromEntries(
      sections.map((section) => [section, data.sections[section]?.length ?? 0]),
    ),
    dateRange,
    includeTrash: request.includeTrash === true,
    indexManifest: {
      sourceCount:
        data.indexVersion === null || data.indexVersion === undefined ? 0 : 1,
      indexVersion: data.indexVersion ?? null,
      rebuildOnImport: true,
    },
  };
  const plaintextFiles: PortableArchiveFile[] = [
    {
      path: 'manifest.json',
      contentType: 'application/json',
      bytesBase64: base64(json(manifest)),
    },
    {
      path: 'schema.json',
      contentType: 'application/json',
      bytesBase64: base64(
        json({
          schemaVersion: CURRENT_SCHEMA,
          format: 'MEZIP',
          compatibility: {
            newer: 'REJECT_UNSUPPORTED_SCHEMA',
            older: 'MIGRATE_IF_SUPPORTED',
          },
        }),
      ),
    },
    {
      path: 'meta/export-info.json',
      contentType: 'application/json',
      bytesBase64: base64(
        json({
          format: 'MEZIP',
          archiveId: id,
          exportedAt: now,
          exclusions: [
            'password',
            'oauth-token',
            'byok-key',
            'payment-secret',
            'device-credential',
            'raw-embedding',
            'private-message',
          ],
        }),
      ),
    },
  ];
  for (const section of sections)
    plaintextFiles.push({
      path: sectionPath(section),
      contentType: 'application/json',
      bytesBase64: base64(json(sanitizeSection(ownerId, data.sections[section]))),
    });
  const checksums: PortableArchiveChecksum[] = plaintextFiles.map((file) => {
    const raw = fromBase64(file.bytesBase64);
    return { path: file.path, sha256: sha256(raw), bytes: raw.byteLength };
  });
  plaintextFiles.push({
    path: 'meta/checksums.json',
    contentType: 'application/json',
    bytesBase64: base64(json({ algorithm: 'SHA-256', files: checksums })),
  });
  const salt =
    request.encryptionMode === 'PASSWORD_AES_256_GCM' ? randomBytes(16) : null;
  if (salt !== null && (request.password === undefined || request.password.length < 12))
    throw new PortableArchiveError(
      'VALIDATION',
      'A password-protected archive requires a password of at least 12 characters.',
    );
  const files = plaintextFiles.map((file) =>
    file.path === 'manifest.json' || file.path === 'schema.json' || salt === null
      ? file
      : {
          ...file,
          bytesBase64: base64(
            encrypt(fromBase64(file.bytesBase64), request.password as string, salt),
          ),
        },
  );
  const envelope: PortableArchiveEnvelope = {
    container: 'MEZIP_DIRECTORY_JSON_V1',
    manifest,
    files,
    checksums,
    manifestSha256: sha256(canonical(manifest)),
    encryption: {
      mode: request.encryptionMode ?? 'NONE',
      saltBase64: salt === null ? null : base64(salt),
    },
  };
  const encoded = bytes(`${JSON.stringify(envelope)}\n`);
  if (encoded.byteLength > MAX_ARCHIVE_BYTES)
    throw new PortableArchiveError(
      'ZIP_BOMB',
      'The archive exceeds the local safety size limit.',
    );
  return { bytes: encoded, envelope, manifest, passwordRequired: salt !== null };
}

function decodeEnvelope(input: Uint8Array): PortableArchiveEnvelope {
  if (input.byteLength === 0 || input.byteLength > MAX_ARCHIVE_BYTES)
    throw new PortableArchiveError(
      'ZIP_BOMB',
      'The archive exceeds the local safety size limit.',
    );
  const value = parseJson(input) as Partial<PortableArchiveEnvelope>;
  if (
    value.container !== 'MEZIP_DIRECTORY_JSON_V1' ||
    value.manifest === undefined ||
    !Array.isArray(value.files) ||
    !Array.isArray(value.checksums)
  )
    throw new PortableArchiveError(
      'INTEGRITY_FAILED',
      'The archive container is invalid.',
    );
  if (value.files.length > MAX_FILES)
    throw new PortableArchiveError('ZIP_BOMB', 'The archive contains too many files.');
  for (const file of value.files) {
    if (typeof file.path !== 'string')
      throw new PortableArchiveError(
        'INTEGRITY_FAILED',
        'Archive file path is invalid.',
      );
    assertSafePath(file.path);
    if (
      typeof file.bytesBase64 !== 'string' ||
      fromBase64(file.bytesBase64).byteLength > MAX_FILE_BYTES
    )
      throw new PortableArchiveError(
        'ZIP_BOMB',
        'An archive file exceeds the safety size limit.',
      );
  }
  if (value.manifest.schemaVersion !== CURRENT_SCHEMA)
    throw new PortableArchiveError(
      'UNSUPPORTED_SCHEMA',
      'Unsupported newer archive schema.',
    );
  if (value.manifestSha256 !== sha256(canonical(value.manifest)))
    throw new PortableArchiveError(
      'INTEGRITY_FAILED',
      'Archive manifest verification failed.',
    );
  const paths = new Set<string>();
  for (const file of value.files) {
    if (paths.has(file.path))
      throw new PortableArchiveError(
        'INTEGRITY_FAILED',
        'Archive contains duplicate paths.',
      );
    paths.add(file.path);
  }
  return value as PortableArchiveEnvelope;
}

function unpack(
  envelope: PortableArchiveEnvelope,
  password?: string,
): Partial<Record<PortableArchiveSection, readonly JsonValue[]>> {
  const salt =
    envelope.encryption.saltBase64 === null
      ? null
      : fromBase64(envelope.encryption.saltBase64);
  if (salt !== null && (password === undefined || password.length === 0))
    throw new PortableArchiveError(
      'PASSWORD_REQUIRED',
      'A password is required to open this archive.',
    );
  const files = new Map(envelope.files.map((file) => [file.path, file]));
  for (const checksum of envelope.checksums) {
    const file = files.get(checksum.path);
    if (file === undefined)
      throw new PortableArchiveError('INTEGRITY_FAILED', 'An archive file is missing.');
    const raw =
      salt === null || file.path === 'manifest.json' || file.path === 'schema.json'
        ? fromBase64(file.bytesBase64)
        : decrypt(fromBase64(file.bytesBase64), password as string, salt);
    if (raw.byteLength !== checksum.bytes || sha256(raw) !== checksum.sha256)
      throw new PortableArchiveError(
        'INTEGRITY_FAILED',
        'Archive checksum verification failed.',
      );
  }
  const result: Partial<Record<PortableArchiveSection, readonly JsonValue[]>> = {};
  for (const section of ALL_SECTIONS) {
    const file = files.get(sectionPath(section));
    if (file === undefined) continue;
    const raw =
      salt === null
        ? fromBase64(file.bytesBase64)
        : decrypt(fromBase64(file.bytesBase64), password as string, salt);
    const parsed = parseJson(raw);
    if (!Array.isArray(parsed))
      throw new PortableArchiveError(
        'INTEGRITY_FAILED',
        'An archive section is malformed.',
      );
    result[section] = parsed as readonly JsonValue[];
  }
  return result;
}

export class InMemoryPortableArchiveTarget implements PortableArchiveRestoreTarget {
  private readonly values = new Map<string, Map<string, JsonValue>>();
  public preview(
    principal: AuthenticatedPrincipal,
    sections: Partial<Record<PortableArchiveSection, readonly JsonValue[]>>,
  ): readonly PortableArchiveConflict[] {
    const conflicts: PortableArchiveConflict[] = [];
    for (const [section, values] of Object.entries(sections) as [
      PortableArchiveSection,
      readonly JsonValue[],
    ][]) {
      for (const value of values) {
        const id = objectId(value);
        if (id === null) continue;
        const existing =
          this.values.get(`${principal.userId}:${section}`)?.has(id) === true;
        if (existing)
          conflicts.push({
            id: `conflict_${sha256(`${principal.userId}:${section}:${id}`).slice(0, 24)}`,
            kind: 'DUPLICATE',
            section,
            portableId: id,
            existingId: id,
            summary: `${section} entry already exists.`,
            suggestedResolution: 'SKIP',
            resolved: false,
          });
      }
    }
    return conflicts;
  }
  public restore(
    principal: AuthenticatedPrincipal,
    sections: Partial<Record<PortableArchiveSection, readonly JsonValue[]>>,
    resolution: PortableArchiveConflictResolution,
    selectedSections?: readonly PortableArchiveSection[],
  ): Readonly<Record<string, number>> {
    const counts: Record<string, number> = {};
    const allowed = selectedSections === undefined ? null : new Set(selectedSections);
    for (const [section, values] of Object.entries(sections) as [
      PortableArchiveSection,
      readonly JsonValue[],
    ][]) {
      if (allowed !== null && !allowed.has(section)) continue;
      const key = `${principal.userId}:${section}`;
      const store = this.values.get(key) ?? new Map<string, JsonValue>();
      let count = 0;
      for (const value of values) {
        const id = objectId(value);
        if (id === null) continue;
        const duplicate = store.has(id);
        if (duplicate && resolution === 'SKIP') continue;
        const nextId =
          duplicate && resolution === 'CREATE_COPY'
            ? `${id}-copy-${randomUUID().slice(0, 8)}`
            : id;
        const next = clone(value) as Record<string, JsonValue>;
        if (nextId !== id) next.id = nextId;
        const previous = store.get(id);
        if (
          duplicate &&
          resolution === 'MERGE' &&
          typeof previous === 'object' &&
          previous !== null &&
          !Array.isArray(previous)
        )
          store.set(id, { ...(previous as Record<string, JsonValue>), ...next });
        else store.set(nextId, next);
        count += 1;
      }
      this.values.set(key, store);
      counts[section] = count;
    }
    return counts;
  }
}

export function createPortableArchiveDataSource(
  repository: Pick<InMemoryArchiveRepository, 'exportArchive'>,
): PortableArchiveDataSource {
  return {
    collect: (principal, request) => {
      const exported: ArchiveExport = repository.exportArchive(principal, {
        includeTrashed: request.includeTrash === true,
      });
      return {
        timezone: 'UTC',
        locale: 'zh-CN',
        appVersion: 'local',
        indexVersion: null,
        sections: {
          PROFILE: [],
          LIFE: exported.life as unknown as readonly JsonValue[],
          TIMELINE: exported.timeline as unknown as readonly JsonValue[],
          HISTORY: exported.history as unknown as readonly JsonValue[],
          FITNESS: exported.fitness as unknown as readonly JsonValue[],
          STEPS: exported.steps as unknown as readonly JsonValue[],
          DAILY_PACK: exported.dailyPacks as unknown as readonly JsonValue[],
          AI_USAGE: [],
          AI_INSIGHTS: exported.aiInsights as unknown as readonly JsonValue[],
          SOCIAL: [],
          PROJECTS: [],
          MEMBERSHIP: [],
          PRIVACY: [],
          DEVICES: [],
          MEDIA: exported.media as unknown as readonly JsonValue[],
        },
      };
    },
  };
}

export class PortableArchiveService {
  private readonly jobs = new Map<string, PortableArchiveJobInternal>();
  private readonly imports = new Map<string, PortableArchiveImportJob>();
  private readonly artifacts = new Map<string, Artifact>();
  private readonly backups = new Map<string, PortableArchiveBackup>();
  private readonly annual = new Map<string, PortableAnnualArchive>();
  private readonly legacyPlans = new Map<string, PortableLegacyPlan>();
  private readonly legacyRecipients = new Map<string, PortableLegacyRecipient>();
  private readonly auditEvents: Array<{
    readonly ownerId: string;
    readonly action: string;
    readonly at: string;
  }> = [];
  private readonly now: () => string;
  private readonly id: () => string;
  private readonly ttl: number;
  private readonly target: PortableArchiveRestoreTarget;
  public constructor(private readonly options: PortableArchiveServiceOptions) {
    this.now = options.now ?? (() => new Date().toISOString());
    this.id = options.id ?? randomUUID;
    this.ttl = options.downloadTtlSeconds ?? 600;
    this.target = options.restoreTarget ?? new InMemoryPortableArchiveTarget();
  }
  private actor(principal: AuthenticatedPrincipal): void {
    if (principal.userId.trim() === '')
      throw new PortableArchiveError(
        'FORBIDDEN',
        'An authenticated owner is required.',
      );
  }
  private jobProjection(
    internal: PortableArchiveJobInternal,
  ): PortableArchiveExportJob {
    return clone(internal.job);
  }
  public createExport(
    principal: AuthenticatedPrincipal,
    request: PortableArchiveExportRequest,
  ): PortableArchiveExportJob {
    this.actor(principal);
    const id = this.id();
    const now = this.now();
    const requestedSections =
      request.sections === undefined ? ALL_SECTIONS : [...new Set(request.sections)];
    const base: PortableArchiveExportJob = {
      id,
      ownerId: principal.userId,
      type: request.type,
      status: 'QUEUED',
      requestedSections,
      dateRange: safeDateRange(request),
      includeMedia: request.includeMedia === true,
      encryptionMode: request.encryptionMode ?? 'NONE',
      progress: 0,
      stage: 'COLLECTING',
      createdAt: now,
      startedAt: now,
      completedAt: null,
      expiresAt: null,
      fileSize: null,
      checksum: null,
      downloadTokenExpiresAt: null,
      errorCode: null,
    };
    try {
      const data = this.options.dataSource.collect(principal, request);
      const artifact = buildEnvelope(principal.userId, request, data, now, id, {
        timezone: this.options.timezone ?? 'UTC',
        locale: this.options.locale ?? 'zh-CN',
        appVersion: this.options.appVersion ?? 'local',
      });
      const expiresAt = new Date(Date.parse(now) + this.ttl * 1000).toISOString();
      const job = {
        ...base,
        status: 'READY' as const,
        stage: 'READY' as const,
        progress: 100,
        completedAt: this.now(),
        expiresAt,
        fileSize: artifact.bytes.byteLength,
        checksum: sha256(artifact.bytes),
        downloadTokenExpiresAt: expiresAt,
      };
      const internal = {
        job,
        artifact,
        downloadToken: randomBytes(24).toString('base64url'),
      };
      this.jobs.set(`${principal.userId}:${id}`, internal);
      this.artifacts.set(`${principal.userId}:${id}`, artifact);
      this.auditEvents.push({
        ownerId: principal.userId,
        action: 'ARCHIVE_EXPORT_READY',
        at: this.now(),
      });
      return this.jobProjection(internal);
    } catch (error) {
      const job = {
        ...base,
        status: 'FAILED' as const,
        stage: 'FAILED' as const,
        progress: 0,
        completedAt: this.now(),
        errorCode: error instanceof PortableArchiveError ? error.code : 'FAILED',
      };
      const internal = {
        job,
        artifact: {
          bytes: new Uint8Array(),
          envelope: null as never,
          manifest: null as never,
          passwordRequired: false,
        },
        downloadToken: '',
      };
      this.jobs.set(`${principal.userId}:${id}`, internal);
      throw error;
    }
  }
  public listExports(
    principal: AuthenticatedPrincipal,
  ): readonly PortableArchiveExportJob[] {
    this.actor(principal);
    return [...this.jobs.values()]
      .filter((item) => item.job.ownerId === principal.userId)
      .map((item) => this.jobProjection(item));
  }
  public getExport(
    principal: AuthenticatedPrincipal,
    jobId: string,
  ): PortableArchiveExportJob {
    this.actor(principal);
    const item = this.jobs.get(`${principal.userId}:${jobId}`);
    if (item === undefined)
      throw new PortableArchiveError('NOT_FOUND', 'Archive export was not found.');
    return this.jobProjection(item);
  }
  public cancelExport(
    principal: AuthenticatedPrincipal,
    jobId: string,
  ): PortableArchiveExportJob {
    const item = this.jobs.get(`${principal.userId}:${jobId}`);
    if (item === undefined)
      throw new PortableArchiveError('NOT_FOUND', 'Archive export was not found.');
    if (item.job.status === 'READY')
      throw new PortableArchiveError(
        'VALIDATION',
        'A ready archive cannot be cancelled.',
      );
    const job = {
      ...item.job,
      status: 'CANCELLED' as const,
      stage: 'CANCELLED' as const,
      completedAt: this.now(),
    };
    const next = { ...item, job };
    this.jobs.set(`${principal.userId}:${jobId}`, next);
    return this.jobProjection(next);
  }
  public downloadExport(
    principal: AuthenticatedPrincipal,
    jobId: string,
    token?: string,
  ): PortableArchiveDownload {
    const item = this.jobs.get(`${principal.userId}:${jobId}`);
    if (item === undefined || item.job.status !== 'READY')
      throw new PortableArchiveError(
        'NOT_FOUND',
        'A ready archive download was not found.',
      );
    if (token !== undefined && token !== item.downloadToken)
      throw new PortableArchiveError('FORBIDDEN', 'The download token is invalid.');
    return {
      archiveId: item.artifact.manifest.archiveId,
      jobId,
      fileName: `${item.artifact.manifest.archiveId}.mezip`,
      token: item.downloadToken,
      expiresAt: item.job.expiresAt as string,
      bytes: item.artifact.bytes.byteLength,
      checksum: sha256(item.artifact.bytes),
    };
  }
  public readDownload(
    principal: AuthenticatedPrincipal,
    jobId: string,
    token: string,
  ): Uint8Array {
    const item = this.jobs.get(`${principal.userId}:${jobId}`);
    if (
      item === undefined ||
      item.downloadToken !== token ||
      item.job.status !== 'READY'
    )
      throw new PortableArchiveError(
        'FORBIDDEN',
        'The archive download is not available.',
      );
    return new Uint8Array(item.artifact.bytes);
  }
  public verifyArchive(
    principal: AuthenticatedPrincipal,
    input: Uint8Array,
    password?: string,
  ): PortableArchiveImportPreview {
    this.actor(principal);
    const envelope = decodeEnvelope(input);
    const sections = unpack(envelope, password);
    const conflicts = this.target.preview(principal, sections);
    return {
      importId: this.id(),
      archiveId: envelope.manifest.archiveId,
      schemaVersion: envelope.manifest.schemaVersion,
      integrity: 'VERIFIED',
      compatible: true,
      sections: envelope.manifest.includedSections,
      counts: envelope.manifest.contentCounts,
      conflicts,
      sensitiveDataIncluded: envelope.manifest.includedSections.includes('FITNESS'),
      warnings:
        envelope.manifest.encryption === 'PASSWORD_AES_256_GCM'
          ? ['密码不会上传或写入日志；遗失密码无法恢复。']
          : [],
    };
  }
  public previewImport(
    principal: AuthenticatedPrincipal,
    input: Uint8Array,
    request: PortableArchiveImportRequest = {},
  ): PortableArchiveImportPreview {
    const preview = this.verifyArchive(principal, input, request.password);
    const importId = this.id();
    const next = { ...preview, importId };
    this.imports.set(`${principal.userId}:${importId}`, {
      id: importId,
      ownerId: principal.userId,
      status: 'PREVIEW_READY',
      progress: 25,
      preview: next,
      restoredCounts: {},
      createdAt: this.now(),
      completedAt: null,
      errorCode: null,
    });
    return next;
  }
  public startImport(
    principal: AuthenticatedPrincipal,
    importId: string,
    input: Uint8Array,
    request: PortableArchiveImportRequest = {},
  ): PortableArchiveImportJob {
    const preview = this.imports.get(`${principal.userId}:${importId}`);
    if (preview === undefined || preview.preview === null)
      throw new PortableArchiveError(
        'NOT_FOUND',
        'Archive import preview was not found.',
      );
    const sections = unpack(decodeEnvelope(input), request.password);
    const restoredCounts = this.target.restore(
      principal,
      sections,
      request.conflictResolution ?? 'SKIP',
      request.sections,
    );
    const job: PortableArchiveImportJob = {
      ...preview,
      status: 'READY',
      progress: 100,
      restoredCounts,
      completedAt: this.now(),
    };
    this.imports.set(`${principal.userId}:${importId}`, job);
    this.auditEvents.push({
      ownerId: principal.userId,
      action: 'ARCHIVE_IMPORT_READY',
      at: this.now(),
    });
    return clone(job);
  }
  public getImport(
    principal: AuthenticatedPrincipal,
    importId: string,
  ): PortableArchiveImportJob {
    const job = this.imports.get(`${principal.userId}:${importId}`);
    if (job === undefined)
      throw new PortableArchiveError('NOT_FOUND', 'Archive import was not found.');
    return clone(job);
  }
  public listBackups(
    principal: AuthenticatedPrincipal,
  ): readonly PortableArchiveBackup[] {
    this.actor(principal);
    return [...this.backups.values()]
      .filter((backup) => backup.ownerId === principal.userId)
      .map(clone);
  }
  public createBackup(
    principal: AuthenticatedPrincipal,
    request: PortableArchiveExportRequest,
    kind: PortableArchiveBackup['kind'] = 'USER_EXPORT',
  ): PortableArchiveBackup {
    const job = this.createExport(principal, request);
    const artifact = this.jobs.get(`${principal.userId}:${job.id}`)?.artifact;
    if (artifact === undefined || job.status !== 'READY')
      throw new PortableArchiveError(
        'INTEGRITY_FAILED',
        'Backup artifact was not generated.',
      );
    const backup: PortableArchiveBackup = {
      id: this.id(),
      ownerId: principal.userId,
      kind,
      archiveId: artifact.manifest.archiveId,
      status: 'READY',
      createdAt: this.now(),
      expiresAt: new Date(Date.now() + 30 * 86400000).toISOString(),
      bytes: artifact.bytes.byteLength,
      checksum: sha256(artifact.bytes),
      retentionDays: 30,
    };
    this.backups.set(`${principal.userId}:${backup.id}`, backup);
    return clone(backup);
  }
  public getAnnualArchive(
    principal: AuthenticatedPrincipal,
    year: number,
  ): PortableAnnualArchive {
    this.actor(principal);
    if (!Number.isInteger(year) || year < 1970 || year > 9999)
      throw new PortableArchiveError(
        'VALIDATION',
        'The annual archive year is invalid.',
      );
    const key = `${principal.userId}:${year}`;
    const existing = this.annual.get(key);
    if (existing !== undefined) return clone(existing);
    const data = this.options.dataSource.collect(principal, {
      type: 'YEAR_ARCHIVE',
      year,
      includeMedia: false,
      includeTrash: false,
    });
    const timeline = (data.sections.TIMELINE ?? [])
      .filter((value) => JSON.stringify(value).includes(String(year)))
      .filter(
        (value): value is JsonObject =>
          typeof value === 'object' && value !== null && !Array.isArray(value),
      );
    const statistics = Object.fromEntries(
      Object.entries(data.sections).map(([section, values]) => [
        section,
        values?.length ?? 0,
      ]),
    );
    const annual: PortableAnnualArchive = {
      id: this.id(),
      ownerId: principal.userId,
      year,
      archiveId: null,
      status: 'DRAFT',
      statistics,
      timeline,
      mediaOverview: { media: data.sections.MEDIA?.length ?? 0 },
      aiInsight: null,
      createdAt: this.now(),
      updatedAt: this.now(),
    };
    this.annual.set(key, annual);
    return clone(annual);
  }
  public getLegacyPlan(principal: AuthenticatedPrincipal): PortableLegacyPlan {
    const existing = this.legacyPlans.get(principal.userId);
    if (existing !== undefined) return clone(existing);
    const plan: PortableLegacyPlan = {
      id: this.id(),
      ownerId: principal.userId,
      status: 'DRAFT',
      scope: ['LIFE', 'HISTORY', 'FITNESS', 'DAILY_PACK'],
      trigger: 'MANUAL_REVIEW_ONLY',
      createdAt: this.now(),
      updatedAt: this.now(),
    };
    this.legacyPlans.set(principal.userId, plan);
    return clone(plan);
  }
  public updateLegacyPlan(
    principal: AuthenticatedPrincipal,
    patch: Partial<Pick<PortableLegacyPlan, 'scope' | 'status'>>,
  ): PortableLegacyPlan {
    const existing = this.getLegacyPlan(principal);
    const updated = {
      ...existing,
      ...patch,
      status:
        patch.status === 'ACTIVE'
          ? ('DRAFT' as const)
          : (patch.status ?? existing.status),
      updatedAt: this.now(),
    };
    this.legacyPlans.set(principal.userId, updated);
    return clone(updated);
  }
  public listLegacyRecipients(
    principal: AuthenticatedPrincipal,
  ): readonly PortableLegacyRecipient[] {
    return [...this.legacyRecipients.values()]
      .filter((recipient) => recipient.ownerId === principal.userId)
      .map(clone);
  }
  public addLegacyRecipient(
    principal: AuthenticatedPrincipal,
    input: { displayName: string; contactReference: string },
  ): PortableLegacyRecipient {
    if (input.displayName.trim() === '' || input.contactReference.trim() === '')
      throw new PortableArchiveError(
        'VALIDATION',
        'A legacy recipient display name and contact reference are required.',
      );
    const recipient: PortableLegacyRecipient = {
      id: this.id(),
      ownerId: principal.userId,
      displayName: input.displayName.trim(),
      contactReference: input.contactReference.trim(),
      verified: false,
      createdAt: this.now(),
    };
    this.legacyRecipients.set(`${principal.userId}:${recipient.id}`, recipient);
    return clone(recipient);
  }
  public removeLegacyRecipient(
    principal: AuthenticatedPrincipal,
    recipientId: string,
  ): void {
    if (!this.legacyRecipients.delete(`${principal.userId}:${recipientId}`))
      throw new PortableArchiveError('NOT_FOUND', 'Legacy recipient was not found.');
  }
  public getLegacyPolicy(principal: AuthenticatedPrincipal): PortableLegacyPolicy {
    return {
      ownerId: principal.userId,
      releaseMode: 'DISABLED',
      legalReviewRequired: true,
      autoReleaseEnabled: false,
      updatedAt: this.now(),
    };
  }
  public listAudit(
    principal: AuthenticatedPrincipal,
  ): readonly { readonly action: string; readonly at: string }[] {
    return this.auditEvents
      .filter((event) => event.ownerId === principal.userId)
      .map(({ action, at }) => ({ action, at }));
  }
}
