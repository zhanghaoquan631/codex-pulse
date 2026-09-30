import { createHash, randomBytes, randomUUID } from 'node:crypto';
import { isIP } from 'node:net';

import type {
  AuthenticatedPrincipal,
  ExternalAppLaunchPlan,
  ExternalIdentity,
  ExternalIdentityAuditEvent,
  ExternalIdentityCapability,
  ExternalIdentityConnection,
  ExternalIdentityConnectionStatus,
  ExternalIdentityOAuthStart,
  ExternalIdentityProviderCode,
  ExternalIdentityProviderInfo,
  JsonObject,
  PublicExternalIdentity,
} from '@me-zip/shared-types';

export type ExternalIdentityErrorCode =
  | 'UNAUTHORIZED'
  | 'FORBIDDEN'
  | 'NOT_FOUND'
  | 'VALIDATION'
  | 'CONFLICT'
  | 'RATE_LIMITED'
  | 'NOT_CONFIGURED'
  | 'PROVIDER_UNAVAILABLE'
  | 'REAUTH_REQUIRED'
  | 'OAUTH_STATE_INVALID'
  | 'OAUTH_STATE_EXPIRED'
  | 'IDEMPOTENCY_REPLAY';

export class ExternalIdentityError extends Error {
  public constructor(
    public readonly code: ExternalIdentityErrorCode,
    message: string,
    public readonly retryable = false,
  ) {
    super(message);
    this.name = 'ExternalIdentityError';
  }
}

export interface ExternalIdentityOAuthProfile {
  readonly providerAccountId: string;
  readonly displayName: string;
  readonly handle: string | null;
  readonly publicUrl: string | null;
  readonly avatarUrl: string | null;
  readonly description: string | null;
  /** An opaque encrypted server reference. Raw OAuth tokens never enter DTOs. */
  readonly encryptedCredential: string;
  readonly expiresAt: string | null;
  readonly requestedScopes: readonly string[];
}

export interface ExternalIdentityOAuthProvider {
  readonly provider: Extract<ExternalIdentityProviderCode, 'X' | 'GITHUB'>;
  readonly officiallyVerified: boolean;
  readonly officialCapabilityReference: string;
  readonly requestedScopes: readonly string[];
  begin(input: {
    readonly state: string;
    readonly redirectUri: string;
    readonly codeChallenge: string;
  }): Promise<{ readonly authorizationUrl: string }>;
  complete(input: {
    readonly code: string;
    readonly redirectUri: string;
    readonly codeVerifier: string;
  }): Promise<ExternalIdentityOAuthProfile>;
  disconnect?(input: {
    readonly identity: ExternalIdentity;
    readonly connection: ExternalIdentityConnection;
  }): Promise<void>;
}

/**
 * A token vault is deliberately separate from ExternalIdentity. Production
 * must provide encrypted/durable storage; this local implementation accepts
 * only a pre-encrypted opaque reference for tests and developer wiring.
 */
export interface ExternalIdentityCredentialVault {
  readonly durable: boolean;
  put(input: {
    readonly ownerId: string;
    readonly identityId: string;
    readonly provider: Extract<ExternalIdentityProviderCode, 'X' | 'GITHUB'>;
    readonly encryptedCredential: string;
  }): Promise<void>;
  remove(input: {
    readonly ownerId: string;
    readonly identityId: string;
    readonly provider: Extract<ExternalIdentityProviderCode, 'X' | 'GITHUB'>;
  }): Promise<void>;
}

/** Media identifiers are accepted only after a trusted Media service has
 * verified current-owner access. The public API never accepts a QR URL. */
export interface ExternalIdentityQrMediaAuthorizer {
  assertOwnerAuthorized(input: { readonly ownerId: string; readonly mediaId: string }): void;
}

export class InMemoryExternalIdentityCredentialVault implements ExternalIdentityCredentialVault {
  public readonly durable = false;
  private readonly values = new Map<string, string>();

  public async put(input: {
    readonly ownerId: string;
    readonly identityId: string;
    readonly provider: Extract<ExternalIdentityProviderCode, 'X' | 'GITHUB'>;
    readonly encryptedCredential: string;
  }): Promise<void> {
    if (!/^(?:encrypted|ciphertext|vault|kms):/u.test(input.encryptedCredential)) {
      throw new ExternalIdentityError('VALIDATION', 'Provider credentials must be an encrypted server reference.');
    }
    this.values.set(`${input.ownerId}:${input.identityId}:${input.provider}`, input.encryptedCredential);
  }

  public async remove(input: {
    readonly ownerId: string;
    readonly identityId: string;
    readonly provider: Extract<ExternalIdentityProviderCode, 'X' | 'GITHUB'>;
  }): Promise<void> {
    this.values.delete(`${input.ownerId}:${input.identityId}:${input.provider}`);
  }
}

export interface ExternalIdentityAuditSink {
  append(event: ExternalIdentityAuditEvent): void | Promise<void>;
}

export interface ExternalIdentityServiceOptions {
  readonly oauthProviders?: Partial<
    Record<Extract<ExternalIdentityProviderCode, 'X' | 'GITHUB'>, ExternalIdentityOAuthProvider>
  >;
  readonly credentialVault?: ExternalIdentityCredentialVault;
  readonly qrMediaAuthorizer?: ExternalIdentityQrMediaAuthorizer;
  /** Exact registered callback URLs. An incoming callback cannot choose a redirect. */
  readonly allowedRedirectUris?: readonly string[];
  readonly auditSink?: ExternalIdentityAuditSink;
  readonly clock?: () => Date;
  readonly id?: () => string;
  readonly deploymentMode?: 'LOCAL' | 'TEST' | 'PRODUCTION';
  readonly oauthStateTtlSeconds?: number;
}

export interface ExternalIdentityManualInput {
  readonly provider: ExternalIdentityProviderCode;
  readonly displayName: string;
  readonly handle?: string | null | undefined;
  readonly publicUrl?: string | null | undefined;
  readonly avatarUrl?: string | null | undefined;
  readonly description?: string | null | undefined;
  readonly visibility?: 'PRIVATE' | 'PUBLIC' | undefined;
  readonly wechatId?: string | null | undefined;
  readonly qrMediaId?: string | null | undefined;
  readonly contactPreference?: 'MESSAGE_FIRST' | 'COPY_ID' | 'SHOW_QR' | undefined;
  readonly gameId?: string | null | undefined;
  readonly region?: string | null | undefined;
  readonly rank?: string | null | undefined;
  readonly favoriteHero?: string | null | undefined;
  readonly featuredRepositories?: readonly {
    readonly name: string;
    readonly url: string;
    readonly description?: string | null | undefined;
  }[] | undefined;
}

export interface ExternalIdentityManualUpdate {
  readonly displayName?: string | undefined;
  readonly handle?: string | null | undefined;
  readonly publicUrl?: string | null | undefined;
  readonly avatarUrl?: string | null | undefined;
  readonly description?: string | null | undefined;
  readonly visibility?: 'PRIVATE' | 'PUBLIC' | undefined;
  readonly wechatId?: string | null | undefined;
  readonly qrMediaId?: string | null | undefined;
  readonly contactPreference?: 'MESSAGE_FIRST' | 'COPY_ID' | 'SHOW_QR' | undefined;
  readonly gameId?: string | null | undefined;
  readonly region?: string | null | undefined;
  readonly rank?: string | null | undefined;
  readonly favoriteHero?: string | null | undefined;
  readonly featuredRepositories?: ExternalIdentityManualInput['featuredRepositories'];
}

interface OAuthState {
  readonly ownerId: string;
  readonly provider: Extract<ExternalIdentityProviderCode, 'X' | 'GITHUB'>;
  readonly redirectUri: string;
  /** Server-only short-lived PKCE secret. It is never returned to a browser. */
  readonly codeVerifier: string;
  readonly codeChallenge: string;
  readonly expiresAt: number;
}

interface InternalConnection extends ExternalIdentityConnection {
  readonly providerAccountId: string;
}

interface IdempotencyEntry {
  readonly fingerprint: string;
  readonly value: ExternalIdentity;
}

const providerMetadata: Readonly<
  Record<
    ExternalIdentityProviderCode,
    Readonly<{
      readonly displayName: string;
      readonly category: ExternalIdentityProviderInfo['category'];
      readonly capabilities: readonly ExternalIdentityCapability[];
      readonly reference: string | null;
      readonly unsupported: readonly string[];
    }>
  >
> = {
  X: {
    displayName: 'X',
    category: 'SOCIAL',
    capabilities: ['PUBLIC_PROFILE', 'OAUTH', 'OPEN_HTTPS'],
    reference: 'https://docs.x.com/fundamentals/authentication/oauth-2-0/authorization-code',
    unsupported: ['Likes, bookmarks and private account data are not collected without a separately reviewed official capability.'],
  },
  CHATGPT: {
    displayName: 'ChatGPT / GPT',
    category: 'AI',
    capabilities: ['PUBLIC_PROFILE', 'MANUAL_PROFILE', 'OPEN_HTTPS'],
    reference: 'https://help.openai.com/en/articles/8554407',
    unsupported: ['Private ChatGPT conversations, history, cookies and sessions are never accessed.'],
  },
  WECHAT: {
    displayName: 'WeChat',
    category: 'COMMUNICATION',
    capabilities: ['MANUAL_PROFILE', 'COPY_IDENTIFIER', 'SHOW_QR'],
    reference: null,
    unsupported: ['Private messages, friend lists, Moments, cookies and sessions are never accessed.'],
  },
  HONOR_OF_KINGS: {
    displayName: 'Honor of Kings',
    category: 'GAMING',
    capabilities: ['MANUAL_PROFILE', 'COPY_IDENTIFIER'],
    reference: null,
    unsupported: ['No unverified game deep link, reverse-engineered API, session or game-account binding is used.'],
  },
  GITHUB: {
    displayName: 'GitHub',
    category: 'DEVELOPER',
    capabilities: ['PUBLIC_PROFILE', 'OAUTH', 'OPEN_HTTPS', 'FEATURED_REPOSITORIES'],
    reference: 'https://docs.github.com/en/apps/oauth-apps/building-oauth-apps/authorizing-oauth-apps',
    unsupported: ['Private repositories are never automatically published or returned from public identity APIs.'],
  },
};

function now(clock: () => Date): string {
  return clock().toISOString();
}

function requirePrincipal(principal: AuthenticatedPrincipal): string {
  if (!principal.userId || !principal.sessionId) {
    throw new ExternalIdentityError('UNAUTHORIZED', 'An authenticated user is required.');
  }
  return principal.userId;
}

function valueFingerprint(value: unknown): string {
  return createHash('sha256').update(JSON.stringify(value)).digest('hex');
}

function cleanText(value: string | null | undefined, max: number, label: string): string | null {
  if (value === null || value === undefined) return null;
  const next = value.trim();
  if (next.length === 0 || next.length > max) {
    throw new ExternalIdentityError('VALIDATION', `${label} is invalid.`);
  }
  return next;
}

function isPrivateHost(hostname: string): boolean {
  const raw = hostname.replace(/^\[|\]$/gu, '');
  if (raw === 'localhost' || raw.endsWith('.local') || raw === 'metadata.google.internal') return true;
  const type = isIP(raw);
  if (type === 6) return raw === '::1' || /^(?:fc|fd|fe80|::ffff:)/iu.test(raw);
  if (type !== 4) return false;
  const [a, b] = raw.split('.').map(Number);
  return a === 0 || a === 10 || a === 127 || (a === 169 && b === 254) ||
    (a === 172 && b !== undefined && b >= 16 && b <= 31) ||
    (a === 192 && b === 168) || (a === 100 && b !== undefined && b >= 64 && b <= 127);
}

/** No custom scheme, credentialed URL, private host, query or fragment may pass. */
export function normalizeExternalHttpsUrl(raw: string): string {
  let parsed: URL;
  try {
    parsed = new URL(raw);
  } catch {
    throw new ExternalIdentityError('VALIDATION', 'A valid HTTPS URL is required.');
  }
  if (parsed.protocol !== 'https:' || parsed.username || parsed.password || parsed.search || parsed.hash || isPrivateHost(parsed.hostname.toLowerCase())) {
    throw new ExternalIdentityError('VALIDATION', 'Only safe public HTTPS URLs are accepted.');
  }
  if (parsed.toString().length > 2_000) throw new ExternalIdentityError('VALIDATION', 'The URL is too long.');
  return parsed.toString();
}

function validateProviderUrl(provider: ExternalIdentityProviderCode, raw: string): string {
  const normalized = normalizeExternalHttpsUrl(raw);
  const url = new URL(normalized);
  const hostname = url.hostname.toLowerCase();
  const officialHost = (name: string): boolean => hostname === name || hostname === `www.${name}`;
  if (provider === 'X' && !officialHost('x.com')) {
    throw new ExternalIdentityError('VALIDATION', 'An X identity must use an official x.com URL.');
  }
  if (provider === 'GITHUB' && !officialHost('github.com')) {
    throw new ExternalIdentityError('VALIDATION', 'A GitHub identity must use an official github.com URL.');
  }
  if (provider === 'CHATGPT' && !(officialHost('chatgpt.com') || officialHost('openai.com'))) {
    throw new ExternalIdentityError('VALIDATION', 'A ChatGPT identity must use an official ChatGPT or OpenAI URL.');
  }
  if (provider === 'WECHAT' || provider === 'HONOR_OF_KINGS') {
    throw new ExternalIdentityError('VALIDATION', 'This provider does not have a verified public web profile URL.');
  }
  return normalized;
}

function validateOAuthAuthorizationUrl(provider: 'X' | 'GITHUB', raw: string): string {
  let url: URL;
  try {
    url = new URL(raw);
  } catch {
    throw new ExternalIdentityError('NOT_CONFIGURED', 'The OAuth provider returned an invalid authorization URL.');
  }
  if (url.protocol !== 'https:' || url.username || url.password || url.hash || isPrivateHost(url.hostname.toLowerCase()) || url.toString().length > 2_000) {
    throw new ExternalIdentityError('NOT_CONFIGURED', 'The OAuth provider returned an invalid authorization URL.');
  }
  const host = url.hostname.toLowerCase();
  const allowed = provider === 'X'
    ? (host === 'x.com' || host === 'www.x.com') && url.pathname === '/i/oauth2/authorize'
    : (host === 'github.com' || host === 'www.github.com') && url.pathname === '/login/oauth/authorize';
  if (!allowed) throw new ExternalIdentityError('NOT_CONFIGURED', 'The OAuth provider returned an unapproved authorization URL.');
  return url.toString();
}

function safeAvatarUrl(raw: string | null | undefined): string | null {
  return raw === null || raw === undefined ? null : normalizeExternalHttpsUrl(raw);
}

function publicIdentity(identity: ExternalIdentity): PublicExternalIdentity {
  return {
    id: identity.id,
    provider: identity.provider,
    displayName: identity.displayName,
    handle: identity.handle,
    publicUrl: identity.publicUrl,
    avatarUrl: identity.avatarUrl,
    description: identity.description,
    metadataSafe: identity.metadataSafe,
    displayOrder: identity.displayOrder,
  };
}

function safeMetadata(input: ExternalIdentityManualInput, provider: ExternalIdentityProviderCode): JsonObject {
  if (provider === 'WECHAT') {
    return {
      contactPreference: input.contactPreference ?? 'MESSAGE_FIRST',
      ...(input.wechatId === undefined || input.wechatId === null ? {} : { wechatId: cleanText(input.wechatId, 100, 'WeChat ID')! }),
    };
  }
  if (provider === 'HONOR_OF_KINGS') {
    return {
      ...(input.gameId === undefined || input.gameId === null ? {} : { gameId: cleanText(input.gameId, 100, 'Game ID')! }),
      ...(input.region === undefined || input.region === null ? {} : { region: cleanText(input.region, 120, 'Region')! }),
      ...(input.rank === undefined || input.rank === null ? {} : { rank: cleanText(input.rank, 120, 'Rank')! }),
      ...(input.favoriteHero === undefined || input.favoriteHero === null ? {} : { favoriteHero: cleanText(input.favoriteHero, 120, 'Favorite hero')! }),
    };
  }
  if (provider === 'GITHUB' && input.featuredRepositories !== undefined) {
    const repositories = input.featuredRepositories.map((repository) => ({
      name: cleanText(repository.name, 200, 'Repository name')!,
      url: validateProviderUrl('GITHUB', repository.url),
      ...(repository.description === undefined || repository.description === null
        ? {}
        : { description: cleanText(repository.description, 500, 'Repository description')! }),
    }));
    return { featuredRepositories: repositories } as JsonObject;
  }
  return {};
}

function statusForManual(provider: ExternalIdentityProviderCode): ExternalIdentityConnectionStatus {
  if (provider === 'X' || provider === 'CHATGPT' || provider === 'GITHUB') return 'LINK_ONLY';
  return 'MANUAL_PROFILE';
}

function allProviderInfo(
  provider: ExternalIdentityProviderCode,
  oauth: ExternalIdentityOAuthProvider | undefined,
): ExternalIdentityProviderInfo {
  const meta = providerMetadata[provider];
  const configured = oauth?.officiallyVerified === true;
  return {
    provider,
    category: meta.category,
    displayName: meta.displayName,
    capabilities: meta.capabilities,
    connectionStatus: provider === 'X' || provider === 'GITHUB'
      ? (configured ? 'NOT_CONNECTED' : 'PRODUCTION_PENDING')
      : statusForManual(provider),
    oauthConfigured: configured,
    officialCapabilityCheckedAt: meta.reference === null ? null : '2026-08-20',
    officialCapabilityReference: meta.reference,
    unsupportedCapabilities: meta.unsupported,
  };
}

export class ExternalIdentityService {
  private readonly clock: () => Date;
  private readonly id: () => string;
  private readonly vault: ExternalIdentityCredentialVault;
  private readonly qrMediaAuthorizer: ExternalIdentityQrMediaAuthorizer | undefined;
  private readonly allowedRedirects: Set<string>;
  private readonly providers: Partial<Record<Extract<ExternalIdentityProviderCode, 'X' | 'GITHUB'>, ExternalIdentityOAuthProvider>>;
  private readonly auditSink: ExternalIdentityAuditSink;
  private readonly stateTtlMilliseconds: number;
  private readonly identities = new Map<string, ExternalIdentity>();
  private readonly connections = new Map<string, InternalConnection>();
  private readonly states = new Map<string, OAuthState>();
  private readonly idempotency = new Map<string, IdempotencyEntry>();
  private readonly audits: ExternalIdentityAuditEvent[] = [];

  public constructor(options: ExternalIdentityServiceOptions = {}) {
    if (options.deploymentMode === 'PRODUCTION' && options.credentialVault?.durable !== true) {
      throw new ExternalIdentityError('NOT_CONFIGURED', 'Production external identity requires an encrypted durable credential vault.');
    }
    this.clock = options.clock ?? (() => new Date());
    this.id = options.id ?? randomUUID;
    this.vault = options.credentialVault ?? new InMemoryExternalIdentityCredentialVault();
    this.qrMediaAuthorizer = options.qrMediaAuthorizer;
    this.providers = options.oauthProviders ?? {};
    this.allowedRedirects = new Set((options.allowedRedirectUris ?? []).map((item) => normalizeExternalHttpsUrl(item)));
    this.auditSink = options.auditSink ?? { append: (event) => { this.audits.push(event); } };
    this.stateTtlMilliseconds = (options.oauthStateTtlSeconds ?? 600) * 1_000;
  }

  private audit(ownerId: string, action: ExternalIdentityAuditEvent['action'], identity: ExternalIdentity | null, status: 'SUCCESS' | 'FAILED'): void {
    const event: ExternalIdentityAuditEvent = {
      id: this.id(), ownerId, identityId: identity?.id ?? null, provider: identity?.provider ?? null, action, status, occurredAt: now(this.clock),
    };
    this.audits.push(event);
    void this.auditSink.append(event);
  }

  private own(principal: AuthenticatedPrincipal, identityId: string): ExternalIdentity {
    const ownerId = requirePrincipal(principal);
    const identity = this.identities.get(identityId);
    if (identity === undefined || identity.ownerId !== ownerId) {
      throw new ExternalIdentityError('NOT_FOUND', 'External identity was not found.');
    }
    return identity;
  }

  private validateQrMedia(ownerId: string, provider: ExternalIdentityProviderCode, mediaId: string | null | undefined): string | null {
    if (provider !== 'WECHAT') return null;
    if (mediaId === null || mediaId === undefined) return null;
    if (this.qrMediaAuthorizer === undefined) {
      throw new ExternalIdentityError('NOT_CONFIGURED', 'WeChat QR media requires an owner-scoped Media service.', false);
    }
    this.qrMediaAuthorizer.assertOwnerAuthorized({ ownerId, mediaId });
    return mediaId;
  }

  private idempotent(ownerId: string, key: string | undefined, input: unknown, create: () => ExternalIdentity): ExternalIdentity {
    if (key === undefined || key.trim().length === 0) return create();
    if (key.length > 180) throw new ExternalIdentityError('VALIDATION', 'The idempotency key is invalid.');
    const scope = `${ownerId}:identity-create:${key}`;
    const fingerprint = valueFingerprint(input);
    const existing = this.idempotency.get(scope);
    if (existing !== undefined) {
      if (existing.fingerprint !== fingerprint) throw new ExternalIdentityError('IDEMPOTENCY_REPLAY', 'This idempotency key was already used with different input.');
      return existing.value;
    }
    const value = create();
    this.idempotency.set(scope, { fingerprint, value });
    return value;
  }

  public listProviders(): readonly ExternalIdentityProviderInfo[] {
    return (Object.keys(providerMetadata) as ExternalIdentityProviderCode[])
      .map((provider) => allProviderInfo(provider, provider === 'X' || provider === 'GITHUB' ? this.providers[provider] : undefined));
  }

  public listIdentities(principal: AuthenticatedPrincipal): readonly ExternalIdentity[] {
    const ownerId = requirePrincipal(principal);
    return [...this.identities.values()]
      .filter((identity) => identity.ownerId === ownerId)
      .sort((left, right) => left.displayOrder - right.displayOrder || left.createdAt.localeCompare(right.createdAt));
  }

  public getIdentity(principal: AuthenticatedPrincipal, identityId: string): ExternalIdentity {
    return this.own(principal, identityId);
  }

  public getPublicProfile(ownerId: string): readonly PublicExternalIdentity[] {
    if (ownerId.trim().length === 0) throw new ExternalIdentityError('VALIDATION', 'A profile owner is required.');
    return [...this.identities.values()]
      .filter((identity) => identity.ownerId === ownerId && identity.visibility === 'PUBLIC')
      .sort((left, right) => left.displayOrder - right.displayOrder)
      .map(publicIdentity);
  }

  public createManualIdentity(
    principal: AuthenticatedPrincipal,
    input: ExternalIdentityManualInput,
    idempotencyKey?: string,
  ): ExternalIdentity {
    const ownerId = requirePrincipal(principal);
    return this.idempotent(ownerId, idempotencyKey, input, () => {
      const displayName = cleanText(input.displayName, 500, 'Display name');
      if (displayName === null) throw new ExternalIdentityError('VALIDATION', 'Display name is required.');
      const handle = cleanText(input.handle, 160, 'Handle');
      const description = cleanText(input.description, 2_000, 'Description');
      const publicUrl = input.publicUrl === null || input.publicUrl === undefined
        ? null
        : validateProviderUrl(input.provider, input.publicUrl);
      if ((input.provider === 'X' || input.provider === 'CHATGPT' || input.provider === 'GITHUB') && publicUrl === null) {
        throw new ExternalIdentityError('VALIDATION', 'A verified public profile URL is required for this link-only provider.');
      }
      if ((input.provider === 'WECHAT' || input.provider === 'HONOR_OF_KINGS') && input.publicUrl !== undefined && input.publicUrl !== null) {
        throw new ExternalIdentityError('VALIDATION', 'This provider cannot save an unverified public web link.');
      }
      const position = this.listIdentities(principal).length;
      const timestamp = now(this.clock);
      const identity: ExternalIdentity = {
        id: this.id(),
        ownerId,
        provider: input.provider,
        displayName,
        handle,
        publicUrl,
        avatarUrl: safeAvatarUrl(input.avatarUrl),
        description,
        visibility: input.visibility ?? 'PRIVATE',
        connectionStatus: statusForManual(input.provider),
        providerCapabilities: providerMetadata[input.provider].capabilities,
        metadataSafe: safeMetadata(input, input.provider),
        qrMediaId: this.validateQrMedia(ownerId, input.provider, input.qrMediaId),
        displayOrder: position,
        lastSyncedAt: null,
        createdAt: timestamp,
        updatedAt: timestamp,
      };
      this.identities.set(identity.id, identity);
      this.audit(ownerId, 'IDENTITY_CREATED', identity, 'SUCCESS');
      return identity;
    });
  }

  public updateIdentity(principal: AuthenticatedPrincipal, identityId: string, input: ExternalIdentityManualUpdate): ExternalIdentity {
    const before = this.own(principal, identityId);
    const merged: ExternalIdentityManualInput = {
      ...input,
      provider: before.provider,
      displayName: input.displayName ?? before.displayName,
      handle: input.handle === undefined ? before.handle : input.handle,
      publicUrl: input.publicUrl === undefined ? before.publicUrl : input.publicUrl,
      avatarUrl: input.avatarUrl === undefined ? before.avatarUrl : input.avatarUrl,
      description: input.description === undefined ? before.description : input.description,
      visibility: input.visibility ?? before.visibility,
      wechatId: input.wechatId === undefined
        ? (typeof before.metadataSafe.wechatId === 'string' ? before.metadataSafe.wechatId : undefined)
        : input.wechatId,
      contactPreference: input.contactPreference === undefined
        ? (before.metadataSafe.contactPreference as ExternalIdentityManualInput['contactPreference'] | undefined)
        : input.contactPreference,
      gameId: input.gameId === undefined
        ? (typeof before.metadataSafe.gameId === 'string' ? before.metadataSafe.gameId : undefined)
        : input.gameId,
      region: input.region === undefined
        ? (typeof before.metadataSafe.region === 'string' ? before.metadataSafe.region : undefined)
        : input.region,
      rank: input.rank === undefined
        ? (typeof before.metadataSafe.rank === 'string' ? before.metadataSafe.rank : undefined)
        : input.rank,
      favoriteHero: input.favoriteHero === undefined
        ? (typeof before.metadataSafe.favoriteHero === 'string' ? before.metadataSafe.favoriteHero : undefined)
        : input.favoriteHero,
      featuredRepositories: input.featuredRepositories === undefined
        ? (Array.isArray(before.metadataSafe.featuredRepositories)
          ? before.metadataSafe.featuredRepositories as ExternalIdentityManualInput['featuredRepositories']
          : undefined)
        : input.featuredRepositories,
      qrMediaId: input.qrMediaId === undefined ? before.qrMediaId : input.qrMediaId,
    };
    const publicUrl = merged.publicUrl === null || merged.publicUrl === undefined ? null : validateProviderUrl(before.provider, merged.publicUrl);
    if ((before.provider === 'X' || before.provider === 'CHATGPT' || before.provider === 'GITHUB') && before.connectionStatus !== 'CONNECTED' && publicUrl === null) {
      throw new ExternalIdentityError('VALIDATION', 'A link-only identity must retain its verified public URL.');
    }
    const updated: ExternalIdentity = {
      ...before,
      displayName: cleanText(merged.displayName, 500, 'Display name')!,
      handle: cleanText(merged.handle, 160, 'Handle'),
      publicUrl,
      avatarUrl: safeAvatarUrl(merged.avatarUrl),
      description: cleanText(merged.description, 2_000, 'Description'),
      visibility: merged.visibility ?? before.visibility,
      metadataSafe: Object.keys(input).some((key) => ['wechatId', 'contactPreference', 'gameId', 'region', 'rank', 'favoriteHero', 'featuredRepositories'].includes(key))
        ? safeMetadata(merged, before.provider)
        : before.metadataSafe,
      qrMediaId: this.validateQrMedia(before.ownerId, before.provider, merged.qrMediaId),
      updatedAt: now(this.clock),
    };
    this.identities.set(updated.id, updated);
    this.audit(updated.ownerId, input.visibility !== undefined && input.visibility !== before.visibility ? 'VISIBILITY_CHANGED' : 'IDENTITY_UPDATED', updated, 'SUCCESS');
    return updated;
  }

  public setVisibility(principal: AuthenticatedPrincipal, identityId: string, visibility: 'PRIVATE' | 'PUBLIC'): ExternalIdentity {
    return this.updateIdentity(principal, identityId, { visibility });
  }

  public reorder(principal: AuthenticatedPrincipal, identityIds: readonly string[]): readonly ExternalIdentity[] {
    const ownerId = requirePrincipal(principal);
    const current = this.listIdentities(principal);
    if (new Set(identityIds).size !== identityIds.length || identityIds.length !== current.length || current.some((identity) => !identityIds.includes(identity.id))) {
      throw new ExternalIdentityError('VALIDATION', 'The identity order must contain each of your identities exactly once.');
    }
    identityIds.forEach((id, displayOrder) => {
      const identity = this.identities.get(id)!;
      this.identities.set(id, { ...identity, displayOrder, updatedAt: now(this.clock) });
    });
    this.audit(ownerId, 'IDENTITY_REORDERED', null, 'SUCCESS');
    return this.listIdentities(principal);
  }

  public deleteIdentity(principal: AuthenticatedPrincipal, identityId: string): { readonly deleted: true } {
    const identity = this.own(principal, identityId);
    const connection = this.connections.get(identity.id);
    if (connection !== undefined) {
      void this.vault.remove({ ownerId: identity.ownerId, identityId: identity.id, provider: connection.provider });
      this.connections.delete(identity.id);
    }
    this.identities.delete(identity.id);
    this.audit(identity.ownerId, 'IDENTITY_DELETED', identity, 'SUCCESS');
    return { deleted: true };
  }

  public async startOAuth(principal: AuthenticatedPrincipal, input: {
    readonly provider: Extract<ExternalIdentityProviderCode, 'X' | 'GITHUB'>;
    readonly redirectUri: string;
  }): Promise<ExternalIdentityOAuthStart> {
    const ownerId = requirePrincipal(principal);
    const redirectUri = normalizeExternalHttpsUrl(input.redirectUri);
    if (!this.allowedRedirects.has(redirectUri)) {
      throw new ExternalIdentityError('NOT_CONFIGURED', 'The OAuth redirect URI is not registered by this server.');
    }
    const provider = this.providers[input.provider];
    if (provider === undefined || !provider.officiallyVerified) {
      throw new ExternalIdentityError('NOT_CONFIGURED', `${input.provider} OAuth is not configured.`, false);
    }
    // This verifier belongs exclusively to the server-side short-lived OAuth
    // state. The browser sees neither the verifier nor any provider token.
    const codeVerifier = randomBytes(64).toString('base64url');
    const codeChallenge = createHash('sha256').update(codeVerifier).digest('base64url');
    const state = randomBytes(32).toString('base64url');
    const expiresAt = Date.now() + this.stateTtlMilliseconds;
    this.states.set(state, { ownerId, provider: input.provider, redirectUri, codeVerifier, codeChallenge, expiresAt });
    try {
      const result = await provider.begin({ state, redirectUri, codeChallenge });
      const parsed = validateOAuthAuthorizationUrl(input.provider, result.authorizationUrl);
      this.audit(ownerId, 'OAUTH_STARTED', null, 'SUCCESS');
      return { provider: input.provider, authorizationUrl: parsed, state, expiresAt: new Date(expiresAt).toISOString(), pkceRequired: true, requestedScopes: provider.requestedScopes };
    } catch (error) {
      this.states.delete(state);
      this.audit(ownerId, 'OAUTH_STARTED', null, 'FAILED');
      if (error instanceof ExternalIdentityError) throw error;
      throw new ExternalIdentityError('PROVIDER_UNAVAILABLE', 'The OAuth provider is unavailable.', true);
    }
  }

  public async completeOAuth(principal: AuthenticatedPrincipal, input: {
    readonly provider: Extract<ExternalIdentityProviderCode, 'X' | 'GITHUB'>;
    readonly state: string;
    readonly code: string;
    readonly redirectUri: string;
  }): Promise<ExternalIdentity> {
    const ownerId = requirePrincipal(principal);
    const state = this.states.get(input.state);
    this.states.delete(input.state);
    if (state === undefined || state.ownerId !== ownerId || state.provider !== input.provider) {
      throw new ExternalIdentityError('OAUTH_STATE_INVALID', 'OAuth state could not be verified.');
    }
    if (state.expiresAt <= Date.now()) throw new ExternalIdentityError('OAUTH_STATE_EXPIRED', 'OAuth state expired.');
    const redirectUri = normalizeExternalHttpsUrl(input.redirectUri);
    if (state.redirectUri !== redirectUri || !this.allowedRedirects.has(redirectUri)) {
      throw new ExternalIdentityError('OAUTH_STATE_INVALID', 'OAuth redirect could not be verified.');
    }
    const provider = this.providers[input.provider];
    if (provider === undefined || !provider.officiallyVerified) throw new ExternalIdentityError('NOT_CONFIGURED', `${input.provider} OAuth is not configured.`);
    if (input.code.trim().length === 0 || input.code.length > 2_000) {
      throw new ExternalIdentityError('VALIDATION', 'OAuth callback is invalid.');
    }
    try {
      const profile = await provider.complete({ code: input.code, redirectUri, codeVerifier: state.codeVerifier });
      const profileUrl = profile.publicUrl === null ? null : validateProviderUrl(input.provider, profile.publicUrl);
      const existing = [...this.identities.values()].find((identity) => identity.ownerId === ownerId && identity.provider === input.provider);
      const timestamp = now(this.clock);
      const identity: ExternalIdentity = {
        id: existing?.id ?? this.id(),
        ownerId,
        provider: input.provider,
        displayName: cleanText(profile.displayName, 500, 'Provider display name')!,
        handle: cleanText(profile.handle, 160, 'Provider handle'),
        publicUrl: profileUrl,
        avatarUrl: safeAvatarUrl(profile.avatarUrl),
        description: cleanText(profile.description, 2_000, 'Provider description'),
        visibility: existing?.visibility ?? 'PRIVATE',
        connectionStatus: 'CONNECTED',
        providerCapabilities: providerMetadata[input.provider].capabilities,
        metadataSafe: existing?.metadataSafe ?? {},
        qrMediaId: null,
        displayOrder: existing?.displayOrder ?? this.listIdentities(principal).length,
        lastSyncedAt: timestamp,
        createdAt: existing?.createdAt ?? timestamp,
        updatedAt: timestamp,
      };
      await this.vault.put({ ownerId, identityId: identity.id, provider: input.provider, encryptedCredential: profile.encryptedCredential });
      const connection: InternalConnection = {
        identityId: identity.id,
        provider: input.provider,
        status: 'CONNECTED',
        requestedScopes: [...provider.requestedScopes.filter((scope) => profile.requestedScopes.includes(scope))],
        expiresAt: profile.expiresAt,
        providerAccountId: cleanText(profile.providerAccountId, 300, 'Provider account ID')!,
        createdAt: existing === undefined ? timestamp : this.connections.get(identity.id)?.createdAt ?? timestamp,
        updatedAt: timestamp,
      };
      this.identities.set(identity.id, identity);
      this.connections.set(identity.id, connection);
      this.audit(ownerId, 'OAUTH_COMPLETED', identity, 'SUCCESS');
      return identity;
    } catch (error) {
      this.audit(ownerId, 'OAUTH_COMPLETED', null, 'FAILED');
      if (error instanceof ExternalIdentityError) throw error;
      throw new ExternalIdentityError('PROVIDER_UNAVAILABLE', 'The OAuth provider could not complete authorization.', true);
    }
  }

  public listConnections(principal: AuthenticatedPrincipal): readonly ExternalIdentityConnection[] {
    const ownerId = requirePrincipal(principal);
    return [...this.connections.values()]
      .filter((connection) => this.identities.get(connection.identityId)?.ownerId === ownerId)
      .map((connection) => ({
        identityId: connection.identityId,
        provider: connection.provider,
        status: connection.status,
        requestedScopes: connection.requestedScopes,
        expiresAt: connection.expiresAt,
        createdAt: connection.createdAt,
        updatedAt: connection.updatedAt,
      }));
  }

  public async disconnect(principal: AuthenticatedPrincipal, identityId: string): Promise<ExternalIdentity> {
    const identity = this.own(principal, identityId);
    const connection = this.connections.get(identity.id);
    if (connection === undefined) throw new ExternalIdentityError('NOT_FOUND', 'A provider connection was not found.');
    const provider = this.providers[connection.provider];
    try {
      if (provider?.disconnect !== undefined) await provider.disconnect({ identity, connection });
      await this.vault.remove({ ownerId: identity.ownerId, identityId: identity.id, provider: connection.provider });
    } catch (error) {
      if (error instanceof ExternalIdentityError) throw error;
      throw new ExternalIdentityError('PROVIDER_UNAVAILABLE', 'The provider disconnect could not be completed.', true);
    }
    this.connections.delete(identity.id);
    const fallback = identity.publicUrl === null ? 'NOT_CONNECTED' : 'LINK_ONLY';
    const updated = { ...identity, connectionStatus: fallback as ExternalIdentityConnectionStatus, lastSyncedAt: null, updatedAt: now(this.clock) };
    this.identities.set(updated.id, updated);
    this.audit(updated.ownerId, 'CONNECTION_DISCONNECTED', updated, 'SUCCESS');
    return updated;
  }

  public launch(principal: AuthenticatedPrincipal, identityId: string, action: 'OPEN' | 'COPY' | 'QR'): ExternalAppLaunchPlan {
    const identity = this.own(principal, identityId);
    if (action === 'OPEN' && identity.publicUrl !== null) {
      return { provider: identity.provider, action: 'OPEN_HTTPS', href: identity.publicUrl, copyText: null, qrMediaId: null, message: 'Open the verified public destination.' };
    }
    const metadata = identity.metadataSafe as Readonly<Record<string, unknown>>;
    if (action === 'COPY') {
      const copyText = identity.handle ?? (typeof metadata.wechatId === 'string' ? metadata.wechatId : typeof metadata.gameId === 'string' ? metadata.gameId : null);
      if (copyText !== null) return { provider: identity.provider, action: 'COPY', href: null, copyText, qrMediaId: null, message: 'Copy the user-provided public identifier.' };
    }
    if (action === 'QR' && identity.provider === 'WECHAT' && identity.qrMediaId !== null) {
      return { provider: identity.provider, action: 'SHOW_QR', href: null, copyText: null, qrMediaId: identity.qrMediaId, message: 'Show the owner-authorized QR through the Media service.' };
    }
    return { provider: identity.provider, action: 'UNSUPPORTED', href: null, copyText: null, qrMediaId: null, message: 'This provider action is not configured or supported.' };
  }

  public listAudit(principal: AuthenticatedPrincipal): readonly ExternalIdentityAuditEvent[] {
    const ownerId = requirePrincipal(principal);
    return this.audits.filter((event) => event.ownerId === ownerId);
  }
}

export function createExternalIdentityService(options: ExternalIdentityServiceOptions = {}): ExternalIdentityService {
  return new ExternalIdentityService(options);
}
