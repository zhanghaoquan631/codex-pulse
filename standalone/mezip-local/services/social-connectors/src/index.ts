import { createHash, randomBytes, randomUUID } from 'node:crypto';
import { isIP } from 'node:net';

import type {
  AuthenticatedPrincipal,
  ExternalSocialAccount,
  JsonObject,
  SocialArchiveItem,
  SocialArchivePage,
  SocialArchiveQuery,
  SocialArchiveVisibility,
  SocialAccountStatus,
  SocialCapabilityStatus,
  SocialCollection,
  SocialConnectorAuditEvent,
  SocialConnectorCapability,
  SocialConnectorCapabilityView,
  SocialConnectorProviderCode,
  SocialContentStatus,
  SocialExternalPublication,
  SocialImportJob,
  SocialImportJobStatus,
  SocialPublication,
  SocialProviderSummary,
  SocialSyncStatus,
} from '@me-zip/shared-types';
import type { SocialPersistence, SocialPersistenceSnapshot } from './persistence.js';

export type SocialErrorCode =
  | 'VALIDATION'
  | 'FORBIDDEN'
  | 'NOT_FOUND'
  | 'CONFLICT'
  | 'RATE_LIMITED'
  | 'AUTH_EXPIRED'
  | 'PERMISSION_DENIED'
  | 'CAPABILITY_NOT_SUPPORTED'
  | 'CONTENT_NOT_FOUND'
  | 'PROVIDER_UNAVAILABLE'
  | 'INVALID_REQUEST'
  | 'NOT_CONFIGURED'
  | 'IDEMPOTENCY_REPLAY'
  | 'UNKNOWN';

export class SocialConnectorError extends Error {
  public constructor(public readonly code: SocialErrorCode, message: string, public readonly retryable = false) {
    super(message);
    this.name = 'SocialConnectorError';
  }
}

export interface SocialProviderRecord {
  readonly externalAccountId: string;
  readonly displayName: string;
  readonly username?: string | null;
  readonly avatarReference?: string | null;
  readonly profileMetrics?: {
    readonly followersCount: number | null;
    readonly followingCount: number | null;
    readonly postCount: number | null;
  };
  /** An encrypted-at-rest envelope/reference. It is never projected to consumers. */
  readonly encryptedCredential: string | null;
  readonly expiresAt?: string | null;
}

export interface SocialProviderContent {
  readonly externalContentId: string;
  readonly contentType: SocialArchiveItem['contentType'];
  readonly canonicalUrl: string;
  readonly textExcerpt?: string | null;
  readonly publishedAt?: string | null;
  readonly metadata?: JsonObject;
  readonly contentStatus?: SocialContentStatus;
}

export interface SocialProviderImportResult {
  readonly items: readonly SocialProviderContent[];
  readonly nextCursor: string | null;
  readonly rateLimitRetryAfterSeconds?: number | null;
}

export interface SocialProviderAuthorizationInput {
  readonly state: string;
  readonly redirectUri: string;
  /** Least-privilege scopes are selected by the server request contract. */
  readonly scopes?: readonly string[];
  readonly codeChallenge?: string;
}

export interface SocialProviderExchangeInput {
  readonly code: string;
  readonly redirectUri: string;
  readonly codeVerifier?: string;
}

export interface SocialProviderSyncInput {
  readonly account: ExternalSocialAccount;
  readonly cursor: string | null;
}

export interface SocialConnectorProvider {
  readonly code: SocialConnectorProviderCode;
  /** Real adapters must set this only after current official documentation and
   * app-review evidence has been accepted by the deployment owner. */
  readonly officialApiVerified?: boolean;
  getAuthorizationUrl(input: SocialProviderAuthorizationInput): Promise<string>;
  exchangeAuthorization(input: SocialProviderExchangeInput): Promise<SocialProviderRecord>;
  refreshAuthorization(account: ExternalSocialAccount): Promise<SocialProviderRecord>;
  disconnect(account: ExternalSocialAccount): Promise<void>;
  getAccount(account: ExternalSocialAccount): Promise<SocialProviderRecord>;
  listSupportedCapabilities(): readonly SocialConnectorCapabilityView[];
  importContent(input: SocialProviderSyncInput): Promise<SocialProviderImportResult>;
  syncContent(input: SocialProviderSyncInput): Promise<SocialProviderImportResult>;
  getSyncStatus(account: ExternalSocialAccount, cursor: string | null): Promise<SocialSyncStatus>;
  normalizeError(error: unknown): SocialConnectorError;
  publishContent?(input: {
    readonly account: ExternalSocialAccount;
    readonly text: string;
    readonly mediaIds: readonly string[];
  }): Promise<{ readonly providerPostId: string; readonly canonicalUrl: string }>;
}

export interface SocialCredentialStore {
  readonly durable?: boolean;
  put(accountId: string, encryptedCredential: string): Promise<void>;
  remove(accountId: string): Promise<void>;
}

/** Local/test-only vault. It deliberately accepts only an opaque encrypted reference. */
export class InMemorySocialCredentialStore implements SocialCredentialStore {
  public readonly durable = false;
  private readonly values = new Map<string, string>();

  public async put(accountId: string, encryptedCredential: string): Promise<void> {
    if (!/^encrypted:|^ciphertext:/u.test(encryptedCredential)) {
      throw new SocialConnectorError('INVALID_REQUEST', 'A credential must be an encrypted server reference.');
    }
    this.values.set(accountId, encryptedCredential);
  }

  public async remove(accountId: string): Promise<void> {
    this.values.delete(accountId);
  }

  public has(accountId: string): boolean {
    return this.values.has(accountId);
  }
}

export interface SocialEntitlementResolver {
  hasUser(userId: string, capability: string): boolean | Promise<boolean>;
}

export interface SocialRootAuthorizer {
  canReadSocialArchive(principal: AuthenticatedPrincipal, targetUserId: string): boolean | Promise<boolean>;
}

/** Reuses the platform Founder directory instead of creating a second admin role. */
export interface SocialFounderDirectory {
  getFounderUserId(): string | null;
  isFounder(principal: AuthenticatedPrincipal): boolean;
}

export interface SocialAuditSink {
  append(event: SocialConnectorAuditEvent): void | Promise<void>;
}

export interface SocialConnectorServiceOptions {
  readonly providers?: Partial<Record<SocialConnectorProviderCode, SocialConnectorProvider>>;
  readonly credentialStore?: SocialCredentialStore;
  readonly clock?: () => Date;
  readonly id?: () => string;
  readonly founderUserId?: string;
  readonly founderDirectory?: SocialFounderDirectory;
  readonly entitlementResolver?: SocialEntitlementResolver;
  readonly rootAuthorizer?: SocialRootAuthorizer;
  readonly auditSink?: SocialAuditSink;
  readonly rateLimitPerMinute?: number;
  readonly oauthStateTtlSeconds?: number;
  readonly persistence?: SocialPersistence;
  readonly deploymentMode?: 'LOCAL' | 'TEST' | 'PRODUCTION';
}

export interface SocialOAuthStartResult {
  readonly provider: SocialConnectorProviderCode;
  readonly authorizationUrl: string;
  readonly state: string;
  readonly expiresAt: string;
  readonly pkceRequired: boolean;
  readonly consentVersion: string;
  readonly requestedScopes: readonly string[];
}

export interface SocialDeleteScope {
  readonly provider?: SocialConnectorProviderCode;
  readonly accountId?: string;
  readonly from?: string;
  readonly to?: string;
}

interface InternalOAuthState {
  readonly ownerId: string;
  readonly provider: SocialConnectorProviderCode;
  readonly redirectUri: string;
  readonly consentVersion: string;
  readonly requestedScopes: readonly string[];
  readonly codeChallenge?: string;
  readonly expiresAt: number;
}

interface InternalAccount extends ExternalSocialAccount {
  readonly encryptedCredentialRef: string | null;
}

interface InternalImportJob extends SocialImportJob {
  readonly idempotencyKey: string;
}

interface InternalCollection extends SocialCollection {
  readonly itemIds: Set<string>;
}

interface InternalIdempotency {
  readonly fingerprint: string;
  readonly value: unknown;
}

const providerDisplayName: Record<SocialConnectorProviderCode, string> = {
  X: 'X',
  DOUYIN: 'Douyin',
  MANUAL_LINK: 'Manual Link',
};

const capabilities = (provider: SocialConnectorProviderCode): readonly SocialConnectorCapabilityView[] => {
  const status = (capability: SocialConnectorCapability, value: SocialCapabilityStatus, credentialRequired: boolean, notes: string): SocialConnectorCapabilityView => ({ provider, capability, status: value, credentialRequired, notes });
  if (provider === 'MANUAL_LINK') {
    return [status('POST_READ', 'SUPPORTED', false, 'User-pasted public links only; no provider API access.')];
  }
  const readStatus: SocialCapabilityStatus = 'NOT_VERIFIED';
  const unsupported = provider === 'DOUYIN' ? 'The current reviewed capability matrix does not verify private favorites/likes access.' : 'Current X app access and account plan are not configured or verified.';
  return [
    status('PROFILE_READ', readStatus, true, unsupported),
    status('POST_READ', readStatus, true, unsupported),
    status('MEDIA_READ', readStatus, true, 'Media is metadata/reference-first and requires current provider terms.'),
    status('PUBLISH', readStatus, true, 'Publishing requires provider app review and explicit user confirmation.'),
    status('LIKES_READ', provider === 'DOUYIN' ? 'UNSUPPORTED' : readStatus, true, unsupported),
    status('BOOKMARKS_READ', readStatus, true, unsupported),
    status('FAVORITES_READ', provider === 'DOUYIN' ? 'UNSUPPORTED' : readStatus, true, unsupported),
    status('COLLECTION_READ', readStatus, true, unsupported),
    status('ANALYTICS_READ', readStatus, true, 'No analytics collection is enabled in Phase 13 foundation.'),
  ];
};

const nowIso = (clock: () => Date): string => clock().toISOString();
const fingerprint = (value: unknown): string => createHash('sha256').update(JSON.stringify(value)).digest('hex');
const contentHash = (item: SocialProviderContent): string => fingerprint({ id: item.externalContentId, url: item.canonicalUrl, text: item.textExcerpt ?? null });
function requirePrincipal(principal: AuthenticatedPrincipal): void {
  if (!principal.userId || !principal.sessionId) throw new SocialConnectorError('FORBIDDEN', 'An authenticated user is required.');
}

function normalizeUrl(value: string): string {
  let url: URL;
  try { url = new URL(value); } catch { throw new SocialConnectorError('VALIDATION', 'A valid public URL is required.'); }
  if (!['http:', 'https:'].includes(url.protocol) || url.username || url.password) throw new SocialConnectorError('VALIDATION', 'Only public HTTP(S) links are accepted.');
  if (url.toString().length > 4_096) throw new SocialConnectorError('VALIDATION', 'The public URL is too long.');
  const hostname = url.hostname.toLowerCase();
  const ip = hostname.replace(/^\[|\]$/gu, '');
  const privateIpv4 = isIP(ip) === 4 && (() => {
    const octets = ip.split('.').map((part) => Number(part));
    const [a, b] = octets;
    return a === 0 || a === 10 || a === 127 || (a === 169 && b === 254) || (a === 172 && b !== undefined && b >= 16 && b <= 31) || (a === 192 && b === 168) || (a === 100 && b !== undefined && b >= 64 && b <= 127) || (a === 198 && b !== undefined && (b === 18 || b === 19));
  })();
  const privateIpv6 = isIP(ip) === 6 && (ip === '::1' || /^(?:fc|fd|fe80|::ffff:)/iu.test(ip));
  if (hostname === 'localhost' || hostname.endsWith('.local') || hostname === 'metadata.google.internal' || privateIpv4 || privateIpv6) throw new SocialConnectorError('VALIDATION', 'Private or metadata network links are not allowed.');
  for (const key of [...url.searchParams.keys()]) if (/^(?:utm_|fbclid$|gclid$|mc_cid$|mc_eid$)/iu.test(key)) url.searchParams.delete(key);
  url.hash = '';
  return url.toString();
}

function cursorIndex(cursor: string | undefined, count: number): number {
  if (cursor === undefined) return 0;
  const parsed = Number.parseInt(cursor, 10);
  if (!Number.isSafeInteger(parsed) || parsed < 0 || parsed > count) throw new SocialConnectorError('VALIDATION', 'Invalid social archive cursor.');
  return parsed;
}

function validateTags(tags: readonly string[] | undefined): void {
  if (tags === undefined) return;
  if (tags.length > 30 || tags.some((tag) => tag.trim().length === 0 || tag.trim().length > 80)) throw new SocialConnectorError('VALIDATION', 'Social tags are outside the allowed bounds.');
}

function validateNote(note: string | null | undefined): void {
  if (note !== null && note !== undefined && note.length > 10_000) throw new SocialConnectorError('VALIDATION', 'The personal note is too long.');
}

function publicAccount(account: InternalAccount): ExternalSocialAccount {
  return {
    id: account.id,
    ownerId: account.ownerId,
    provider: account.provider,
    externalAccountId: account.externalAccountId,
    displayName: account.displayName,
    username: account.username,
    avatarReference: account.avatarReference,
    ...(account.profileMetrics === undefined ? {} : { profileMetrics: account.profileMetrics }),
    status: account.status,
    connectedAt: account.connectedAt,
    lastSyncedAt: account.lastSyncedAt,
    capabilities: account.capabilities,
    consentVersion: account.consentVersion,
    requestedScopes: account.requestedScopes,
    autoSync: account.autoSync,
  };
}

function publicJob(job: InternalImportJob): SocialImportJob {
  return {
    id: job.id,
    ownerId: job.ownerId,
    accountId: job.accountId,
    provider: job.provider,
    type: job.type,
    status: job.status,
    cursor: job.cursor,
    startedAt: job.startedAt,
    completedAt: job.completedAt,
    itemsSeen: job.itemsSeen,
    itemsImported: job.itemsImported,
    itemsUpdated: job.itemsUpdated,
    errorCount: job.errorCount,
    errorCode: job.errorCode,
    retryAfterSeconds: job.retryAfterSeconds,
  };
}

/** A deterministic provider used only for local tests/synthetic UI. */
export class MockSocialConnectorProvider implements SocialConnectorProvider {
  public constructor(public readonly code: 'X' | 'DOUYIN') {}

  public listSupportedCapabilities(): readonly SocialConnectorCapabilityView[] {
    return capabilities(this.code).map((entry) => entry.capability === 'PROFILE_READ' || entry.capability === 'POST_READ' || entry.capability === 'MEDIA_READ'
      ? { ...entry, status: 'SUPPORTED' as const, notes: 'Synthetic Mock provider only; real official capability remains unverified.' }
      : entry);
  }
  public async getAuthorizationUrl(input: SocialProviderAuthorizationInput): Promise<string> {
    return `https://mock.invalid/${this.code.toLowerCase()}/authorize?state=${encodeURIComponent(input.state)}&redirect_uri=${encodeURIComponent(input.redirectUri)}`;
  }
  public async exchangeAuthorization(input: SocialProviderExchangeInput): Promise<SocialProviderRecord> {
    if (!input.code.startsWith('mock_')) throw new SocialConnectorError('NOT_CONFIGURED', 'The real provider OAuth adapter is not configured.');
    return { externalAccountId: `${this.code.toLowerCase()}-${input.code.slice(5, 25)}`, displayName: `${this.code} synthetic account`, username: `synthetic_${this.code.toLowerCase()}`, avatarReference: null, encryptedCredential: 'ciphertext:synthetic-provider-credential' };
  }
  public async refreshAuthorization(): Promise<SocialProviderRecord> { throw new SocialConnectorError('NOT_CONFIGURED', 'The real provider refresh adapter is not configured.'); }
  public async disconnect(): Promise<void> { return; }
  public async getAccount(account: ExternalSocialAccount): Promise<SocialProviderRecord> { return { externalAccountId: account.externalAccountId, displayName: account.displayName, username: account.username, avatarReference: account.avatarReference, encryptedCredential: 'ciphertext:synthetic-provider-credential' }; }
  public async importContent(input: SocialProviderSyncInput): Promise<SocialProviderImportResult> { return this.syncContent(input); }
  public async syncContent(input: SocialProviderSyncInput): Promise<SocialProviderImportResult> {
    const offset = input.cursor === null ? 0 : Number.parseInt(input.cursor, 10);
    const item: SocialProviderContent = { externalContentId: `${this.code.toLowerCase()}-synthetic-${offset}`, contentType: this.code === 'DOUYIN' ? 'VIDEO' : 'POST', canonicalUrl: `https://${this.code === 'X' ? 'x.com' : 'douyin.com'}/synthetic/${offset}`, textExcerpt: 'Synthetic provider item (local test only).', publishedAt: new Date(0).toISOString(), metadata: { synthetic: true } };
    return { items: offset > 0 ? [] : [item], nextCursor: offset > 0 ? null : '1' };
  }
  public async getSyncStatus(account: ExternalSocialAccount, cursor: string | null): Promise<SocialSyncStatus> { return { accountId: account.id, provider: this.code, status: cursor === null ? 'IDLE' : 'SUCCESS', lastSyncedAt: account.lastSyncedAt, nextCursor: cursor, importedCount: 0, errorCode: null, retryAfterSeconds: null }; }
  public normalizeError(error: unknown): SocialConnectorError { return error instanceof SocialConnectorError ? error : new SocialConnectorError('UNKNOWN', 'Provider request failed.', true); }
}

/** Production composition uses this until an approved official adapter is injected. */
export class UnavailableSocialConnectorProvider implements SocialConnectorProvider {
  public constructor(public readonly code: 'X' | 'DOUYIN') {}
  public listSupportedCapabilities(): readonly SocialConnectorCapabilityView[] { return capabilities(this.code); }
  private unavailable(): never { throw new SocialConnectorError('NOT_CONFIGURED', `The official ${this.code} connector is not configured.`, false); }
  public async getAuthorizationUrl(): Promise<string> { return this.unavailable(); }
  public async exchangeAuthorization(): Promise<SocialProviderRecord> { return this.unavailable(); }
  public async refreshAuthorization(): Promise<SocialProviderRecord> { return this.unavailable(); }
  public async disconnect(): Promise<void> { return this.unavailable(); }
  public async getAccount(): Promise<SocialProviderRecord> { return this.unavailable(); }
  public async importContent(): Promise<SocialProviderImportResult> { return this.unavailable(); }
  public async syncContent(): Promise<SocialProviderImportResult> { return this.unavailable(); }
  public async getSyncStatus(account: ExternalSocialAccount, cursor: string | null): Promise<SocialSyncStatus> { return { accountId: account.id, provider: this.code, status: 'NOT_CONFIGURED', lastSyncedAt: account.lastSyncedAt, nextCursor: cursor, importedCount: 0, errorCode: 'NOT_CONFIGURED', retryAfterSeconds: null }; }
  public normalizeError(error: unknown): SocialConnectorError { return error instanceof SocialConnectorError ? error : new SocialConnectorError('PROVIDER_UNAVAILABLE', 'The official provider is unavailable.', true); }
}

export class SocialConnectorService {
  private readonly providers: Record<SocialConnectorProviderCode, SocialConnectorProvider>;
  private readonly credentials: SocialCredentialStore;
  private readonly clock: () => Date;
  private readonly id: () => string;
  private readonly founderUserId: string | null;
  private readonly founderDirectory: SocialFounderDirectory | null;
  private readonly entitlements: SocialEntitlementResolver;
  private readonly rootAuthorizer: SocialRootAuthorizer | null;
  private readonly auditSink: SocialAuditSink;
  private readonly persistence: SocialPersistence | undefined;
  private readonly rateLimitPerMinute: number;
  private readonly oauthStateTtlSeconds: number;
  private readonly accounts = new Map<string, InternalAccount>();
  private readonly accountByExternal = new Map<string, string>();
  private readonly oauthStates = new Map<string, InternalOAuthState>();
  private readonly jobs = new Map<string, InternalImportJob>();
  private readonly archives = new Map<string, SocialArchiveItem>();
  private readonly collections = new Map<string, InternalCollection>();
  private readonly publications = new Map<string, SocialPublication>();
  private readonly externalPublications = new Map<string, SocialExternalPublication>();
  private readonly cursors = new Map<string, string | null>();
  private readonly idempotency = new Map<string, InternalIdempotency>();
  private readonly rateHits = new Map<string, number[]>();
  private readonly auditEvents: SocialConnectorAuditEvent[] = [];

  public constructor(options: SocialConnectorServiceOptions = {}) {
    if (options.deploymentMode === 'PRODUCTION' && (options.persistence?.durable !== true || options.credentialStore?.durable !== true || options.providers?.X?.officialApiVerified !== true || options.providers?.DOUYIN?.officialApiVerified !== true)) {
      throw new SocialConnectorError('NOT_CONFIGURED', 'Production social connectors require durable persistence, a protected credential store, and reviewed official providers.');
    }
    this.providers = {
      // Production/default composition is fail-closed. Synthetic providers
      // must be injected explicitly by local tests or a clearly labelled test
      // harness; they are never an implicit runtime data source.
      X: options.providers?.X ?? new UnavailableSocialConnectorProvider('X'),
      DOUYIN: options.providers?.DOUYIN ?? new UnavailableSocialConnectorProvider('DOUYIN'),
      MANUAL_LINK: options.providers?.MANUAL_LINK ?? new UnavailableSocialConnectorProvider('X'),
    };
    this.credentials = options.credentialStore ?? new InMemorySocialCredentialStore();
    this.clock = options.clock ?? (() => new Date());
    this.id = options.id ?? randomUUID;
    this.founderUserId = options.founderUserId ?? null;
    this.founderDirectory = options.founderDirectory ?? null;
    this.entitlements = options.entitlementResolver ?? { hasUser: () => false };
    this.rootAuthorizer = options.rootAuthorizer ?? null;
    this.auditSink = options.auditSink ?? { append: (event) => { this.auditEvents.push(event); } };
    this.persistence = options.persistence;
    this.rateLimitPerMinute = options.rateLimitPerMinute ?? 30;
    this.oauthStateTtlSeconds = options.oauthStateTtlSeconds ?? 600;
    this.hydrate(options.persistence?.read() ?? null);
  }

  private hydrate(snapshot: SocialPersistenceSnapshot | null): void {
    if (snapshot === null) return;
    for (const account of snapshot.accounts) {
      const internal: InternalAccount = { ...account };
      this.accounts.set(internal.id, internal);
      this.accountByExternal.set(internal.ownerId + ':' + internal.provider + ':' + internal.externalAccountId, internal.id);
    }
    for (const job of snapshot.jobs) this.jobs.set(job.id, { ...job });
    for (const item of snapshot.archives) this.archives.set(item.id, { ...item });
    for (const collection of snapshot.collections) this.collections.set(collection.id, { ...collection, itemIds: new Set(collection.itemIds) });
    for (const publication of snapshot.publications) this.publications.set(publication.id, { ...publication });
    for (const publication of snapshot.externalPublications) this.externalPublications.set(publication.id, { ...publication });
    for (const cursor of snapshot.cursors) this.cursors.set(cursor.accountId, cursor.cursor);
    for (const entry of snapshot.idempotency) this.idempotency.set(entry.scopeKey, { fingerprint: entry.fingerprint, value: entry.value });
    this.auditEvents.push(...snapshot.auditEvents);
  }

  private persist(): void {
    if (this.persistence === undefined) return;
    const idempotency = [...this.idempotency.entries()]
      .filter(([, entry]) => typeof (entry.value as { then?: unknown } | null)?.then !== 'function')
      .map(([scopeKey, entry]) => ({ scopeKey, fingerprint: entry.fingerprint, value: entry.value }));
    this.persistence.write({
      accounts: [...this.accounts.values()].map((account) => ({ ...account })),
      jobs: [...this.jobs.values()].map((job) => ({ ...job })),
      archives: [...this.archives.values()].map((item) => ({ ...item })),
      collections: [...this.collections.values()].map((collection) => ({ ...collection, itemIds: [...collection.itemIds] })),
      publications: [...this.publications.values()].map((publication) => ({ ...publication })),
      externalPublications: [...this.externalPublications.values()].map((publication) => ({ ...publication })),
      cursors: [...this.cursors.entries()].map(([accountId, cursor]) => ({ accountId, cursor })),
      idempotency,
      auditEvents: [...this.auditEvents],
    });
  }

  private actor(principal: AuthenticatedPrincipal): string { requirePrincipal(principal); return principal.userId; }
  private audit(ownerId: string | null, action: SocialConnectorAuditEvent['action'], provider: SocialConnectorProviderCode | null, status: 'SUCCESS' | 'FAILED', requestId: string | null = null): void {
    const event: SocialConnectorAuditEvent = { id: this.id(), ownerId, action, provider, status, occurredAt: nowIso(this.clock), requestId };
    void this.auditSink.append(event);
    if (this.auditSink !== undefined && this.auditEvents.length < 1_000) this.auditEvents.push(event);
  }
  private limit(principal: AuthenticatedPrincipal, action: string): void {
    const key = `${principal.userId}:${action}`;
    const cutoff = Date.now() - 60_000;
    const next = (this.rateHits.get(key) ?? []).filter((value) => value > cutoff);
    if (next.length >= this.rateLimitPerMinute) throw new SocialConnectorError('RATE_LIMITED', 'Social connector rate limit reached.', true);
    next.push(Date.now());
    this.rateHits.set(key, next);
  }
  private provider(provider: SocialConnectorProviderCode): SocialConnectorProvider {
    if (provider === 'MANUAL_LINK') throw new SocialConnectorError('CAPABILITY_NOT_SUPPORTED', 'Manual links do not have an OAuth provider.');
    return this.providers[provider];
  }
  private account(principal: AuthenticatedPrincipal, accountId: string): InternalAccount {
    const item = this.accounts.get(accountId);
    if (item === undefined || item.ownerId !== principal.userId) throw new SocialConnectorError('NOT_FOUND', 'Social account was not found.');
    return item;
  }
  private archive(principal: AuthenticatedPrincipal, archiveItemId: string): SocialArchiveItem {
    const item = this.archives.get(archiveItemId);
    if (item === undefined || item.ownerId !== principal.userId) throw new SocialConnectorError('NOT_FOUND', 'Social archive item was not found.');
    return item;
  }
  private collection(principal: AuthenticatedPrincipal, collectionId: string): InternalCollection {
    const item = this.collections.get(collectionId);
    if (item === undefined || item.ownerId !== principal.userId) throw new SocialConnectorError('NOT_FOUND', 'Social collection was not found.');
    return item;
  }
  private idempotent<T>(principal: AuthenticatedPrincipal, key: string | undefined, input: unknown, fn: () => T): T {
    if (key === undefined) return fn();
    if (!/^[A-Za-z0-9:_-]{8,200}$/u.test(key)) throw new SocialConnectorError('VALIDATION', 'Idempotency key is invalid.');
    const scoped = `${principal.userId}:${key}`;
    const hash = fingerprint(input);
    const prior = this.idempotency.get(scoped);
    if (prior !== undefined) {
      if (prior.fingerprint !== hash) throw new SocialConnectorError('IDEMPOTENCY_REPLAY', 'The idempotency key was used with different input.');
      return prior.value as T;
    }
    const value = fn();
    this.idempotency.set(scoped, { fingerprint: hash, value });
    return value;
  }

  public listProviders(): readonly SocialProviderSummary[] {
    return (['X', 'DOUYIN', 'MANUAL_LINK'] as const).map((provider) => ({ provider, displayName: providerDisplayName[provider], oauthAvailable: provider !== 'MANUAL_LINK' && !(this.providers[provider] instanceof UnavailableSocialConnectorProvider), officialApiVerified: provider !== 'MANUAL_LINK' && this.providers[provider].officialApiVerified === true, capabilities: provider === 'MANUAL_LINK' ? capabilities(provider) : this.providers[provider].listSupportedCapabilities(), manualFallback: provider !== 'MANUAL_LINK' }));
  }

  public getProviderCapabilities(provider: SocialConnectorProviderCode): readonly SocialConnectorCapabilityView[] {
    return provider === 'MANUAL_LINK' ? capabilities(provider) : this.provider(provider).listSupportedCapabilities();
  }

  public async startOAuth(principal: AuthenticatedPrincipal, input: { provider: 'X' | 'DOUYIN'; redirectUri: string; consentVersion: string; requestedScopes: readonly string[]; codeChallenge?: string }): Promise<SocialOAuthStartResult> {
    this.actor(principal); this.limit(principal, 'oauth');
    if (!/^https:\/\//u.test(input.redirectUri) && !/^http:\/\/(?:localhost|127\.0\.0\.1)(?::\d+)?\//u.test(input.redirectUri)) throw new SocialConnectorError('VALIDATION', 'OAuth redirect URI must be an approved HTTPS origin.');
    if (input.requestedScopes.length === 0 || input.requestedScopes.length > 20) throw new SocialConnectorError('VALIDATION', 'At least one least-privilege scope is required.');
    const state = randomBytes(32).toString('base64url');
    const expiresAt = new Date(Date.now() + this.oauthStateTtlSeconds * 1_000);
    this.oauthStates.set(state, { ownerId: principal.userId, provider: input.provider, redirectUri: input.redirectUri, consentVersion: input.consentVersion, requestedScopes: [...input.requestedScopes], ...(input.codeChallenge === undefined ? {} : { codeChallenge: input.codeChallenge }), expiresAt: expiresAt.getTime() });
    try {
      const authorizationUrl = await this.provider(input.provider).getAuthorizationUrl({ state, redirectUri: input.redirectUri, scopes: input.requestedScopes, ...(input.codeChallenge === undefined ? {} : { codeChallenge: input.codeChallenge }) });
      this.audit(principal.userId, 'OAUTH_STARTED', input.provider, 'SUCCESS');
      return { provider: input.provider, authorizationUrl, state, expiresAt: expiresAt.toISOString(), pkceRequired: input.codeChallenge !== undefined, consentVersion: input.consentVersion, requestedScopes: input.requestedScopes };
    } catch (error) { this.oauthStates.delete(state); this.audit(principal.userId, 'OAUTH_STARTED', input.provider, 'FAILED'); throw this.provider(input.provider).normalizeError(error); }
  }

  public async completeOAuth(principal: AuthenticatedPrincipal, input: { provider: 'X' | 'DOUYIN'; state: string; code: string; redirectUri: string; codeVerifier?: string }): Promise<ExternalSocialAccount> {
    this.actor(principal); this.limit(principal, 'oauth');
    const state = this.oauthStates.get(input.state);
    if (state === undefined || state.ownerId !== principal.userId || state.provider !== input.provider || state.redirectUri !== input.redirectUri || state.expiresAt <= Date.now()) throw new SocialConnectorError('FORBIDDEN', 'OAuth state is invalid or expired.');
    if (state.codeChallenge !== undefined && input.codeVerifier === undefined) throw new SocialConnectorError('FORBIDDEN', 'PKCE code verifier is required.');
    this.oauthStates.delete(input.state);
    const provider = this.provider(input.provider);
    let record: SocialProviderRecord;
    try { record = await provider.exchangeAuthorization({ code: input.code, redirectUri: input.redirectUri, ...(input.codeVerifier === undefined ? {} : { codeVerifier: input.codeVerifier }) }); } catch (error) { this.audit(principal.userId, 'OAUTH_COMPLETED', input.provider, 'FAILED'); throw provider.normalizeError(error); }
    const externalKey = `${input.provider}:${record.externalAccountId}`;
    const existingId = this.accountByExternal.get(externalKey);
    if (existingId !== undefined) {
      const existing = this.accounts.get(existingId)!;
      if (existing.ownerId !== principal.userId) throw new SocialConnectorError('CONFLICT', 'This external account is already linked to another ME.zip user.');
    }
    const accountId = existingId ?? this.id();
    const connectedAt = nowIso(this.clock);
    const account: InternalAccount = { id: accountId, ownerId: principal.userId, provider: input.provider, externalAccountId: record.externalAccountId, displayName: record.displayName, username: record.username ?? null, avatarReference: record.avatarReference ?? null, ...(record.profileMetrics === undefined ? {} : { profileMetrics: record.profileMetrics }), status: 'CONNECTED', connectedAt, lastSyncedAt: null, capabilities: provider.listSupportedCapabilities(), consentVersion: state.consentVersion, requestedScopes: state.requestedScopes, autoSync: false, encryptedCredentialRef: record.encryptedCredential };
    if (record.encryptedCredential !== null) await this.credentials.put(accountId, record.encryptedCredential);
    this.accounts.set(accountId, account); this.accountByExternal.set(externalKey, accountId); this.persist();
    this.audit(principal.userId, 'ACCOUNT_CONNECTED', input.provider, 'SUCCESS');
    return publicAccount(account);
  }

  public listAccounts(principal: AuthenticatedPrincipal): readonly ExternalSocialAccount[] { this.actor(principal); return [...this.accounts.values()].filter((account) => account.ownerId === principal.userId).map(publicAccount); }

  public updateAccountSettings(principal: AuthenticatedPrincipal, accountId: string, input: { readonly requestedScopes?: readonly string[]; readonly autoSync?: boolean }): ExternalSocialAccount {
    this.actor(principal);
    const account = this.account(principal, accountId);
    if (input.autoSync === true) throw new SocialConnectorError('CAPABILITY_NOT_SUPPORTED', 'Automatic social sync requires a configured server scheduler.');
    const requestedScopes = input.requestedScopes === undefined ? account.requestedScopes : [...new Set(input.requestedScopes.map((scope) => scope.trim()).filter((scope) => scope.length > 0))];
    if (requestedScopes.length === 0 || requestedScopes.length > 20) throw new SocialConnectorError('VALIDATION', 'At least one least-privilege scope is required.');
    const updated: InternalAccount = { ...account, requestedScopes, autoSync: input.autoSync ?? account.autoSync };
    this.accounts.set(account.id, updated);
    this.persist();
    this.audit(principal.userId, 'ACCOUNT_SETTINGS_UPDATED', account.provider, 'SUCCESS');
    return publicAccount(updated);
  }

  public async disconnect(principal: AuthenticatedPrincipal, accountId: string): Promise<ExternalSocialAccount> {
    this.actor(principal); this.limit(principal, 'disconnect'); const account = this.account(principal, accountId);
    try { if (account.provider !== 'MANUAL_LINK') await this.provider(account.provider).disconnect(publicAccount(account)); } catch (error) { throw this.provider(account.provider).normalizeError(error); }
    await this.credentials.remove(account.id);
    const updated: InternalAccount = { ...account, status: 'DISCONNECTED', encryptedCredentialRef: null, autoSync: false };
    this.accounts.set(account.id, updated); this.persist(); this.audit(principal.userId, 'ACCOUNT_DISCONNECTED', account.provider, 'SUCCESS'); return publicAccount(updated);
  }

  public async refreshAccount(principal: AuthenticatedPrincipal, accountId: string): Promise<ExternalSocialAccount> {
    const account = this.account(principal, accountId); if (account.provider === 'MANUAL_LINK') throw new SocialConnectorError('CAPABILITY_NOT_SUPPORTED', 'Manual links do not refresh OAuth credentials.');
    try { const record = await this.provider(account.provider).refreshAuthorization(publicAccount(account)); if (record.encryptedCredential !== null) await this.credentials.put(account.id, record.encryptedCredential); const updated: InternalAccount = { ...account, ...(record.profileMetrics === undefined ? {} : { profileMetrics: record.profileMetrics }), status: 'CONNECTED', encryptedCredentialRef: record.encryptedCredential ?? account.encryptedCredentialRef }; this.accounts.set(account.id, updated); this.persist(); return publicAccount(updated); } catch (error) { const normalized = this.provider(account.provider).normalizeError(error); const status: SocialAccountStatus = normalized.code === 'AUTH_EXPIRED' ? 'REAUTH_REQUIRED' : 'ERROR'; const updated = { ...account, status }; this.accounts.set(account.id, updated); this.persist(); throw normalized; }
  }

  private upsertProviderContent(principal: AuthenticatedPrincipal, account: InternalAccount, source: SocialProviderContent): { item: SocialArchiveItem; inserted: boolean } {
    const existing = [...this.archives.values()].find((item) => item.ownerId === principal.userId && item.provider === account.provider && item.externalAccountId === account.externalAccountId && item.externalContentId === source.externalContentId);
    if (existing !== undefined) {
      const updated = { ...existing, textExcerpt: source.textExcerpt ?? existing.textExcerpt, contentStatus: source.contentStatus ?? existing.contentStatus, metadata: source.metadata ?? existing.metadata, contentHash: contentHash(source) };
      this.archives.set(existing.id, updated); return { item: updated, inserted: false };
    }
    const item: SocialArchiveItem = { id: this.id(), ownerId: principal.userId, provider: account.provider, externalAccountId: account.externalAccountId, externalContentId: source.externalContentId, contentType: source.contentType, canonicalUrl: normalizeUrl(source.canonicalUrl), textExcerpt: source.textExcerpt ?? null, publishedAt: source.publishedAt ?? null, savedAt: nowIso(this.clock), syncSource: 'OFFICIAL_API', visibility: 'PRIVATE', metadata: source.metadata ?? {}, contentHash: contentHash(source), contentStatus: source.contentStatus ?? 'AVAILABLE', personalNote: null, tags: [], collectionIds: [], isFounderCurated: false, founderAudience: null };
    this.archives.set(item.id, item); return { item, inserted: true };
  }

  public async syncAccount(principal: AuthenticatedPrincipal, accountId: string, idempotencyKey?: string): Promise<SocialImportJob> {
    this.actor(principal); this.limit(principal, 'sync'); const account = this.account(principal, accountId);
    return this.idempotent(principal, idempotencyKey, { action: 'sync', accountId }, async () => {
      if (account.status !== 'CONNECTED') throw new SocialConnectorError('AUTH_EXPIRED', 'Reconnect this social account before syncing.');
      const provider = this.provider(account.provider); const post = provider.listSupportedCapabilities().find((entry) => entry.capability === 'POST_READ');
      if (post?.status !== 'SUPPORTED') throw new SocialConnectorError('NOT_CONFIGURED', 'This provider read capability is not verified or configured.');
      const key = `${principal.userId}:${account.id}:${this.cursors.get(account.id) ?? 'initial'}`;
      const prior = [...this.jobs.values()].find((job) => job.ownerId === principal.userId && job.idempotencyKey === key && job.status === 'SUCCESS');
      if (prior !== undefined) return publicJob(prior);
      const createdAt = nowIso(this.clock); const job: InternalImportJob = { id: this.id(), ownerId: principal.userId, accountId: account.id, provider: account.provider, type: this.cursors.has(account.id) ? 'INCREMENTAL' : 'INITIAL', status: 'RUNNING', cursor: this.cursors.get(account.id) ?? null, startedAt: createdAt, completedAt: null, itemsSeen: 0, itemsImported: 0, itemsUpdated: 0, errorCount: 0, errorCode: null, retryAfterSeconds: null, idempotencyKey: key }; this.jobs.set(job.id, job); this.audit(principal.userId, 'SYNC_STARTED', account.provider, 'SUCCESS');
      try {
        const result = await provider.syncContent({ account: publicAccount(account), cursor: job.cursor }); let imported = 0; let updated = 0;
        for (const source of result.items) { const upsert = this.upsertProviderContent(principal, account, source); if (upsert.inserted) imported += 1; else updated += 1; }
        const finished: InternalImportJob = { ...job, status: 'SUCCESS', cursor: result.nextCursor, completedAt: nowIso(this.clock), itemsSeen: result.items.length, itemsImported: imported, itemsUpdated: updated }; this.jobs.set(job.id, finished); this.cursors.set(account.id, result.nextCursor); this.accounts.set(account.id, { ...account, lastSyncedAt: finished.completedAt }); this.persist(); this.audit(principal.userId, 'SYNC_COMPLETED', account.provider, 'SUCCESS'); return publicJob(finished);
      } catch (error) {
        const normalized = provider.normalizeError(error); const status: SocialImportJobStatus = normalized.code === 'RATE_LIMITED' ? 'RATE_LIMITED' : normalized.retryable ? 'PARTIAL' : 'FAILED'; const failed: InternalImportJob = { ...job, status, completedAt: nowIso(this.clock), errorCount: 1, errorCode: normalized.code, retryAfterSeconds: normalized.retryable ? 60 : null }; this.jobs.set(job.id, failed); this.persist(); this.audit(principal.userId, 'SYNC_COMPLETED', account.provider, 'FAILED'); throw normalized;
      }
    }) as Promise<SocialImportJob>;
  }

  public listImportJobs(principal: AuthenticatedPrincipal, accountId?: string): readonly SocialImportJob[] { this.actor(principal); return [...this.jobs.values()].filter((job) => job.ownerId === principal.userId && (accountId === undefined || job.accountId === accountId)).sort((a, b) => (b.startedAt ?? '').localeCompare(a.startedAt ?? '')).map(publicJob); }
  public getSyncStatus(principal: AuthenticatedPrincipal, accountId: string): SocialSyncStatus {
    const account = this.account(principal, accountId);
    const latestJob = [...this.jobs.values()]
      .filter((job) => job.ownerId === principal.userId && job.accountId === account.id)
      .sort((left, right) => (right.startedAt ?? '').localeCompare(left.startedAt ?? ''))[0];
    const status = account.status === 'DISCONNECTED'
      ? 'DISCONNECTED'
      : latestJob?.status ?? (this.cursors.has(account.id) ? 'SUCCESS' : 'IDLE');
    return {
      accountId: account.id,
      provider: account.provider,
      status,
      lastSyncedAt: account.lastSyncedAt,
      nextCursor: this.cursors.get(account.id) ?? null,
      importedCount: [...this.archives.values()].filter((item) => item.ownerId === principal.userId && item.externalAccountId === account.externalAccountId).length,
      errorCode: latestJob?.errorCode ?? null,
      retryAfterSeconds: latestJob?.retryAfterSeconds ?? null,
    };
  }

  public saveManualLink(principal: AuthenticatedPrincipal, input: { url: string; note?: string | null; tags?: readonly string[]; collectionIds?: readonly string[]; visibility?: SocialArchiveVisibility }, idempotencyKey?: string): SocialArchiveItem {
    this.actor(principal); validateNote(input.note); validateTags(input.tags); if (input.collectionIds !== undefined && input.collectionIds.length > 20) throw new SocialConnectorError('VALIDATION', 'Too many social collections were supplied.'); this.limit(principal, 'manual-save'); return this.idempotent(principal, idempotencyKey, input, () => {
      const url = normalizeUrl(input.url); const existing = [...this.archives.values()].find((item) => item.ownerId === principal.userId && item.provider === 'MANUAL_LINK' && item.canonicalUrl === url);
      if (existing !== undefined) { const updated = { ...existing, personalNote: input.note ?? existing.personalNote, tags: input.tags ?? existing.tags, visibility: input.visibility ?? existing.visibility }; this.archives.set(existing.id, updated); this.persist(); return updated; }
      const collectionIds = [...(input.collectionIds ?? [])]; collectionIds.forEach((id) => this.collection(principal, id));
      const item: SocialArchiveItem = { id: this.id(), ownerId: principal.userId, provider: 'MANUAL_LINK', externalAccountId: null, externalContentId: null, contentType: 'MANUAL_SAVE', canonicalUrl: url, textExcerpt: null, publishedAt: null, savedAt: nowIso(this.clock), syncSource: 'MANUAL_LINK', visibility: input.visibility ?? 'PRIVATE', metadata: { metadataStatus: 'UNAVAILABLE' }, contentHash: fingerprint({ url }), contentStatus: 'UNKNOWN', personalNote: input.note ?? null, tags: [...(input.tags ?? [])], collectionIds, isFounderCurated: false, founderAudience: null }; this.archives.set(item.id, item); collectionIds.forEach((collectionId) => { this.collections.get(collectionId)!.itemIds.add(item.id); }); this.persist(); this.audit(principal.userId, 'MANUAL_LINK_SAVED', 'MANUAL_LINK', 'SUCCESS'); return item;
    });
  }

  public patchArchiveItem(principal: AuthenticatedPrincipal, archiveItemId: string, input: { note?: string | null; tags?: readonly string[]; collectionIds?: readonly string[] }): SocialArchiveItem { validateNote(input.note); validateTags(input.tags); if (input.collectionIds !== undefined && input.collectionIds.length > 20) throw new SocialConnectorError('VALIDATION', 'Too many social collections were supplied.'); const item = this.archive(principal, archiveItemId); const ids = [...(input.collectionIds ?? item.collectionIds)]; ids.forEach((id) => this.collection(principal, id)); const updated = { ...item, personalNote: input.note === undefined ? item.personalNote : input.note, tags: input.tags === undefined ? item.tags : [...input.tags], collectionIds: ids }; this.archives.set(item.id, updated); this.persist(); return updated; }

  public listArchive(principal: AuthenticatedPrincipal, query: SocialArchiveQuery = {}): SocialArchivePage { this.actor(principal); const needle = query.query?.toLowerCase(); const values = [...this.archives.values()].filter((item) => item.ownerId === principal.userId && (query.provider === undefined || item.provider === query.provider) && (query.tag === undefined || item.tags.includes(query.tag)) && (query.collectionId === undefined || item.collectionIds.includes(query.collectionId)) && (!query.from || (item.publishedAt ?? item.savedAt) >= query.from) && (!query.to || (item.publishedAt ?? item.savedAt) <= query.to) && (!query.founderOnly || item.isFounderCurated) && (!needle || `${item.textExcerpt ?? ''} ${item.personalNote ?? ''} ${item.tags.join(' ')} ${item.canonicalUrl}`.toLowerCase().includes(needle))).sort((a, b) => b.savedAt.localeCompare(a.savedAt)); const start = cursorIndex(query.cursor, values.length); const limit = Math.min(100, Math.max(1, query.limit ?? 30)); return { items: values.slice(start, start + limit), nextCursor: start + limit < values.length ? String(start + limit) : null }; }
  public getArchiveItem(principal: AuthenticatedPrincipal, archiveItemId: string): SocialArchiveItem { return this.archive(principal, archiveItemId); }

  public createCollection(principal: AuthenticatedPrincipal, input: { name: string; description?: string | null; visibility?: 'PRIVATE' | 'PUBLIC' }): SocialCollection { this.actor(principal); const name = input.name.trim(); if (name.length === 0 || name.length > 120) throw new SocialConnectorError('VALIDATION', 'A collection name is required.'); if (input.description !== undefined && input.description !== null && input.description.length > 2_000) throw new SocialConnectorError('VALIDATION', 'The collection description is too long.'); const timestamp = nowIso(this.clock); const collection: InternalCollection = { id: this.id(), ownerId: principal.userId, name, description: input.description ?? null, visibility: input.visibility ?? 'PRIVATE', createdAt: timestamp, updatedAt: timestamp, itemCount: 0, itemIds: new Set() }; this.collections.set(collection.id, collection); this.persist(); this.audit(principal.userId, 'COLLECTION_CREATED', null, 'SUCCESS'); return this.publicCollection(collection); }
  public patchCollection(principal: AuthenticatedPrincipal, collectionId: string, input: { name?: string; description?: string | null; visibility?: 'PRIVATE' | 'PUBLIC' }): SocialCollection { const collection = this.collection(principal, collectionId); const updated: InternalCollection = { ...collection, name: input.name?.trim() ?? collection.name, description: input.description === undefined ? collection.description : input.description, visibility: input.visibility ?? collection.visibility, updatedAt: nowIso(this.clock) }; this.collections.set(collection.id, updated); this.persist(); return this.publicCollection(updated); }
  public listCollections(principal: AuthenticatedPrincipal): readonly SocialCollection[] { this.actor(principal); return [...this.collections.values()].filter((item) => item.ownerId === principal.userId).map((item) => this.publicCollection(item)); }
  public addToCollection(principal: AuthenticatedPrincipal, collectionId: string, archiveItemId: string): SocialCollection { const collection = this.collection(principal, collectionId); this.archive(principal, archiveItemId); collection.itemIds.add(archiveItemId); const updated = { ...collection, itemCount: collection.itemIds.size, updatedAt: nowIso(this.clock) }; this.collections.set(collection.id, updated); const item = this.archives.get(archiveItemId)!; this.archives.set(archiveItemId, { ...item, collectionIds: [...new Set([...item.collectionIds, collectionId])] }); this.persist(); return this.publicCollection(updated); }
  public removeFromCollection(principal: AuthenticatedPrincipal, collectionId: string, archiveItemId: string): SocialCollection { const collection = this.collection(principal, collectionId); collection.itemIds.delete(archiveItemId); const updated = { ...collection, itemCount: collection.itemIds.size, updatedAt: nowIso(this.clock) }; this.collections.set(collection.id, updated); const item = this.archive(principal, archiveItemId); this.archives.set(item.id, { ...item, collectionIds: item.collectionIds.filter((id) => id !== collectionId) }); this.persist(); return this.publicCollection(updated); }
  private publicCollection(collection: InternalCollection): SocialCollection { const { itemIds, ...safe } = collection; return { ...safe, itemCount: itemIds.size }; }

  public deleteArchiveItem(principal: AuthenticatedPrincipal, archiveItemId: string): void { const item = this.archive(principal, archiveItemId); this.archives.delete(item.id); for (const collection of this.collections.values()) { collection.itemIds.delete(item.id); } this.persist(); }
  public deleteImportedData(principal: AuthenticatedPrincipal, scope: SocialDeleteScope): number { this.actor(principal); this.limit(principal, 'delete'); const from = scope.from ? Date.parse(scope.from) : Number.NEGATIVE_INFINITY; const to = scope.to ? Date.parse(scope.to) : Number.POSITIVE_INFINITY; let count = 0; for (const [id, item] of this.archives) { if (item.ownerId !== principal.userId || item.syncSource === 'MANUAL_LINK') continue; if (scope.provider !== undefined && item.provider !== scope.provider) continue; if (scope.accountId !== undefined && item.externalAccountId !== this.account(principal, scope.accountId).externalAccountId) continue; const saved = Date.parse(item.savedAt); if (saved < from || saved > to) continue; this.archives.delete(id); count += 1; } this.persist(); this.audit(principal.userId, 'IMPORTED_DATA_DELETED', scope.provider ?? null, 'SUCCESS'); return count; }

  public publishSnapshot(principal: AuthenticatedPrincipal, input: { archiveItemId: string; target: 'COMMUNITY' | 'GROUP' | 'PROFILE' | 'PUBLIC'; visibility: SocialArchiveVisibility; groupId?: string }): SocialPublication { const item = this.archive(principal, input.archiveItemId); if (input.visibility === 'PRIVATE') throw new SocialConnectorError('VALIDATION', 'A published snapshot cannot remain PRIVATE.'); if (input.target === 'GROUP' && input.groupId === undefined) throw new SocialConnectorError('VALIDATION', 'A group target is required.'); const publication: SocialPublication = { id: this.id(), ownerId: principal.userId, archiveItemId: item.id, target: input.target, visibility: input.visibility, status: 'PUBLISHED', snapshotId: this.id(), createdAt: nowIso(this.clock), publishedAt: nowIso(this.clock), attribution: { provider: item.provider, originalUrl: item.canonicalUrl, originalAuthor: typeof item.metadata.originalAuthor === 'string' ? item.metadata.originalAuthor : null } }; this.publications.set(publication.id, publication); this.persist(); this.audit(principal.userId, 'SNAPSHOT_PUBLISHED', item.provider, 'SUCCESS'); return publication; }

  public curateFounder(principal: AuthenticatedPrincipal, input: { archiveItemId: string; audience: NonNullable<SocialArchiveItem['founderAudience']> }): SocialArchiveItem { this.actor(principal); const isFounder = this.founderDirectory === null ? this.founderUserId !== null && principal.userId === this.founderUserId : this.founderDirectory.isFounder(principal); if (!isFounder) throw new SocialConnectorError('FORBIDDEN', 'Founder curation is restricted to the configured Founder account.'); const item = this.archive(principal, input.archiveItemId); const updated = { ...item, isFounderCurated: true, founderAudience: input.audience }; this.archives.set(item.id, updated); this.persist(); return updated; }
  public async listFounderFeed(principal: AuthenticatedPrincipal): Promise<SocialArchivePage> { this.actor(principal); const allowed = await this.entitlements.hasUser(principal.userId, 'FOUNDER_CURATED_SOCIAL_ACCESS'); if (!allowed) throw new SocialConnectorError('FORBIDDEN', 'Founder curated social access is unavailable.'); const founderId = this.founderDirectory?.getFounderUserId() ?? this.founderUserId; const values = [...this.archives.values()].filter((item) => item.isFounderCurated && item.ownerId === founderId && item.founderAudience !== null); return { items: values.sort((a, b) => b.savedAt.localeCompare(a.savedAt)), nextCursor: null }; }

  public async publishExternal(principal: AuthenticatedPrincipal, input: { archiveItemId: string; accountId: string; visibility?: 'PUBLIC' | 'UNLISTED'; text?: string; mediaIds?: readonly string[] }): Promise<SocialExternalPublication> { this.actor(principal); const item = this.archive(principal, input.archiveItemId); const account = this.account(principal, input.accountId); if (account.status !== 'CONNECTED') throw new SocialConnectorError('AUTH_EXPIRED', 'Reconnect the provider account before publishing.'); const provider = this.provider(account.provider); const capability = provider.listSupportedCapabilities().find((entry) => entry.capability === 'PUBLISH'); if (capability?.status !== 'SUPPORTED' || provider.publishContent === undefined) { const result: SocialExternalPublication = { id: this.id(), ownerId: principal.userId, archiveItemId: item.id, provider: account.provider, accountId: account.id, status: 'NOT_SUPPORTED', providerPostId: null, canonicalUrl: null, publishedAt: null, errorCode: 'CAPABILITY_NOT_SUPPORTED' }; this.externalPublications.set(result.id, result); this.persist(); return result; } try { const published = await provider.publishContent({ account: publicAccount(account), text: input.text ?? item.personalNote ?? item.textExcerpt ?? '', mediaIds: input.mediaIds ?? [] }); const result: SocialExternalPublication = { id: this.id(), ownerId: principal.userId, archiveItemId: item.id, provider: account.provider, accountId: account.id, status: 'PUBLISHED', providerPostId: published.providerPostId, canonicalUrl: published.canonicalUrl, publishedAt: nowIso(this.clock), errorCode: null }; this.externalPublications.set(result.id, result); this.persist(); return result; } catch (error) { const normalized = provider.normalizeError(error); const result: SocialExternalPublication = { id: this.id(), ownerId: principal.userId, archiveItemId: item.id, provider: account.provider, accountId: account.id, status: 'FAILED', providerPostId: null, canonicalUrl: null, publishedAt: null, errorCode: normalized.code }; this.externalPublications.set(result.id, result); this.persist(); throw normalized; } }

  public getImportJob(principal: AuthenticatedPrincipal, jobId: string): SocialImportJob { const job = this.jobs.get(jobId); if (job === undefined || job.ownerId !== principal.userId) throw new SocialConnectorError('NOT_FOUND', 'Social import job was not found.'); return publicJob(job); }
  public cancelImport(principal: AuthenticatedPrincipal, jobId: string): SocialImportJob { const job = this.jobs.get(jobId); if (job === undefined || job.ownerId !== principal.userId) throw new SocialConnectorError('NOT_FOUND', 'Social import job was not found.'); if (!['QUEUED', 'RUNNING'].includes(job.status)) return publicJob(job); const cancelled = { ...job, status: 'CANCELLED' as const, completedAt: nowIso(this.clock) }; this.jobs.set(job.id, cancelled); this.persist(); return publicJob(cancelled); }
  public async getRootArchive(principal: AuthenticatedPrincipal, targetUserId: string, query: SocialArchiveQuery = {}): Promise<SocialArchivePage> { this.actor(principal); if (this.rootAuthorizer === null || !(await this.rootAuthorizer.canReadSocialArchive(principal, targetUserId))) throw new SocialConnectorError('FORBIDDEN', 'An audited Root social archive capability is required.'); const result = this.listArchive({ ...principal, userId: targetUserId }, query); this.audit(targetUserId, 'ROOT_SOCIAL_READ', null, 'SUCCESS'); return result; }
  public listAuditEvents(principal: AuthenticatedPrincipal): readonly SocialConnectorAuditEvent[] { this.actor(principal); return this.auditEvents.filter((event) => event.ownerId === principal.userId); }
}

export function createSocialConnectorService(options: SocialConnectorServiceOptions = {}): SocialConnectorService { return new SocialConnectorService(options); }

export { InMemorySocialPersistence } from './persistence.js';
export type { SocialPersistence, SocialPersistenceSnapshot } from './persistence.js';
export { XLocalCaptureApiAdapter, type XLocalCaptureApiRequest, type XLocalCaptureApiResponse } from './x-local-capture-api.js';
export {
  InMemoryXCapturePersistence,
  XLocalCaptureService,
  type XCaptureContentPatch,
  type XCaptureEventInput,
  type XCaptureEventResult,
  type XCaptureSpecialFavoriteInput,
  type XCaptureSpecialFavoriteResult,
  type XCapturePersistence,
  type XCapturePersistenceSnapshot,
  type XCaptureSettingsPatch,
} from './x-local-capture.js';
export { createLocalCaptureServer, startLocalCaptureServer, type LocalCaptureServerOptions } from './local-capture-server.js';
