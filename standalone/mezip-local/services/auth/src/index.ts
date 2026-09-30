import {
  createHash,
  createHmac,
  randomBytes,
  randomInt,
  randomUUID,
  timingSafeEqual,
} from 'node:crypto';

import type {
  AccountDeletionRequest,
  ApiFailure,
  ApiResponse,
  ApiSuccess,
  AuthIdentity,
  AuthIdentityStatus,
  AuthProvider,
  AuthUser,
  AuthenticatedPrincipal,
  ConsentRecord,
  DeviceSession,
  OtpChallengePurpose,
  OtpChallengeStatus,
  Platform,
  SessionStatus,
} from '@me-zip/shared-types';

export const platformRoles = [
  'USER',
  'CREATOR',
  'SUPPORT',
  'MODERATOR',
  'ADMIN',
  'SUPER_ADMIN',
] as const;
export type PlatformRole = (typeof platformRoles)[number];

export const groupRoles = [
  'OWNER',
  'ADMIN',
  'MODERATOR',
  'MEMBER',
  'MUTED',
  'BANNED',
] as const;
export type GroupRole = (typeof groupRoles)[number];

export type AuthErrorCode =
  | 'INVALID_INPUT'
  | 'PROVIDER_NOT_CONFIGURED'
  | 'PROVIDER_UNAVAILABLE'
  | 'OTP_NOT_FOUND'
  | 'OTP_INVALID'
  | 'OTP_EXPIRED'
  | 'OTP_REPLAY'
  | 'OTP_TOO_MANY_ATTEMPTS'
  | 'OTP_COOLDOWN'
  | 'RATE_LIMITED'
  | 'ACCOUNT_DISABLED'
  | 'IDENTITY_ALREADY_LINKED'
  | 'IDENTITY_NOT_FOUND'
  | 'LAST_IDENTITY'
  | 'SESSION_NOT_FOUND'
  | 'SESSION_EXPIRED'
  | 'SESSION_REPLAYED'
  | 'SESSION_REVOKED'
  | 'INVALID_TOKEN'
  | 'DELETION_PENDING'
  | 'USER_NOT_FOUND';

/** A safe, serialisable error for API adapters. It never contains provider details or secrets. */
export class AuthError extends Error {
  public readonly code: AuthErrorCode;
  public readonly retryable: boolean;

  public constructor(code: AuthErrorCode, message: string, retryable = false) {
    super(message);
    this.name = 'AuthError';
    this.code = code;
    this.retryable = retryable;
  }
}

export interface AuthDeviceInput {
  readonly deviceId?: string;
  readonly platform?: Platform;
  readonly deviceLabel?: string;
  readonly ipAddress?: string;
  readonly userAgent?: string;
}

export interface OtpDeliveryRequest {
  readonly challengeId: string;
  readonly provider: 'PHONE' | 'EMAIL';
  readonly destination: string;
  readonly code: string;
  readonly expiresAt: Date;
}

export type EmailDeliveryStatus =
  'QUEUED' | 'SENT' | 'DELIVERED' | 'BOUNCED' | 'FAILED';

export interface OtpDeliveryReceipt {
  readonly providerMessageId?: string;
  readonly status: Extract<EmailDeliveryStatus, 'QUEUED' | 'SENT'>;
  readonly acceptedAt: Date;
}

export interface OtpDeliveryAdapter {
  send(request: OtpDeliveryRequest): Promise<OtpDeliveryReceipt>;
}

/** Provider-specific aliases keep the composition contract explicit. */
export type SmsOtpProvider = OtpDeliveryAdapter;
export type EmailOtpProvider = OtpDeliveryAdapter;

/**
 * Development-only OTP adapter. It keeps a code in memory for tests and local
 * development, never in the AuthService or the database. Do not construct this
 * adapter in a production composition root.
 */
export class DevOtpDeliveryAdapter implements OtpDeliveryAdapter {
  private readonly messages = new Map<
    string,
    { code: string; request: OtpDeliveryRequest }
  >();
  private readonly exposeCodes: boolean;

  public constructor(options: { readonly exposeCodes?: boolean } = {}) {
    this.exposeCodes = options.exposeCodes === true;
  }

  public async send(request: OtpDeliveryRequest): Promise<OtpDeliveryReceipt> {
    this.messages.set(request.challengeId, { code: request.code, request });
    return {
      status: 'SENT',
      acceptedAt: new Date(),
      providerMessageId: `dev-${request.challengeId}`,
    };
  }

  /** Explicitly opt-in to inspect a local test code; never available by default. */
  public getCode(challengeId: string): string | undefined {
    if (!this.exposeCodes) {
      return undefined;
    }
    return this.messages.get(challengeId)?.code;
  }

  public getRequest(challengeId: string): OtpDeliveryRequest | undefined {
    return this.messages.get(challengeId)?.request;
  }
}

export interface VerifiedExternalIdentity {
  readonly provider: Extract<AuthProvider, 'WECHAT' | 'GOOGLE' | 'APPLE'>;
  readonly subject: string;
  readonly displayName?: string;
}

export interface ExternalIdentityProviderAdapter {
  readonly provider: VerifiedExternalIdentity['provider'];
  verify(input: { readonly credential: string }): Promise<VerifiedExternalIdentity>;
}

export type WeChatIdentityProvider = ExternalIdentityProviderAdapter;
export type GoogleIdentityProvider = ExternalIdentityProviderAdapter;
export type AppleIdentityProvider = ExternalIdentityProviderAdapter;

export interface EmailDeliveryWebhookEvent {
  readonly providerMessageId: string;
  readonly status: EmailDeliveryStatus;
  readonly occurredAt: Date;
  readonly challengeId?: string;
}

export interface EmailDeliveryWebhookAdapter {
  handle(event: EmailDeliveryWebhookEvent): Promise<void>;
}

/** Local adapter used to exercise delivery-state transitions without a provider. */
export class MockEmailDeliveryWebhookAdapter implements EmailDeliveryWebhookAdapter {
  private readonly statuses = new Map<string, EmailDeliveryStatus>();

  public async handle(event: EmailDeliveryWebhookEvent): Promise<void> {
    const previous = this.statuses.get(event.providerMessageId);
    if (previous !== undefined && !canTransitionEmailDelivery(previous, event.status)) {
      throw new AuthError(
        'INVALID_INPUT',
        'The delivery status transition is invalid.',
      );
    }
    this.statuses.set(event.providerMessageId, event.status);
  }

  public getStatus(providerMessageId: string): EmailDeliveryStatus | null {
    return this.statuses.get(providerMessageId) ?? null;
  }
}

export function canTransitionEmailDelivery(
  from: EmailDeliveryStatus,
  to: EmailDeliveryStatus,
): boolean {
  if (from === to) {
    return true;
  }
  const transitions: Record<EmailDeliveryStatus, readonly EmailDeliveryStatus[]> = {
    QUEUED: ['SENT', 'FAILED'],
    SENT: ['DELIVERED', 'BOUNCED', 'FAILED'],
    DELIVERED: [],
    BOUNCED: [],
    FAILED: [],
  };
  return transitions[from].includes(to);
}

/** In-memory adapter for tests/local development; no OAuth credentials are needed. */
export class MockIdentityProviderAdapter implements ExternalIdentityProviderAdapter {
  public readonly provider: VerifiedExternalIdentity['provider'];
  private readonly credentials = new Map<string, VerifiedExternalIdentity>();

  public constructor(provider: VerifiedExternalIdentity['provider']) {
    this.provider = provider;
  }

  public register(credential: string, subject: string, displayName?: string): void {
    const identity: VerifiedExternalIdentity = {
      provider: this.provider,
      subject: normalizeExternalSubject(subject),
      ...(displayName === undefined ? {} : { displayName }),
    };
    this.credentials.set(credential, identity);
  }

  public async verify(input: {
    readonly credential: string;
  }): Promise<VerifiedExternalIdentity> {
    const identity = this.credentials.get(input.credential);
    if (identity === undefined) {
      throw new AuthError(
        'PROVIDER_UNAVAILABLE',
        'Identity provider could not verify the credential.',
        true,
      );
    }
    return identity;
  }
}

export interface AuthServiceOptions {
  readonly environment?: 'development' | 'test' | 'production';
  readonly secret?: string | Uint8Array;
  readonly now?: () => Date;
  readonly otpTtlMs?: number;
  readonly otpCooldownMs?: number;
  readonly otpMaxAttempts?: number;
  readonly otpWindowMs?: number;
  readonly otpDestinationLimit?: number;
  readonly otpIpLimit?: number;
  readonly accessTtlMs?: number;
  readonly refreshTtlMs?: number;
  readonly otpAdapters?: Partial<Record<'PHONE' | 'EMAIL', OtpDeliveryAdapter>> & {
    readonly phone?: OtpDeliveryAdapter;
    readonly email?: OtpDeliveryAdapter;
  };
  readonly externalAdapters?: Partial<
    Record<'WECHAT' | 'GOOGLE' | 'APPLE', ExternalIdentityProviderAdapter>
  > & {
    readonly wechat?: ExternalIdentityProviderAdapter;
    readonly google?: ExternalIdentityProviderAdapter;
    readonly apple?: ExternalIdentityProviderAdapter;
  };
}

export interface StartOtpInput extends AuthDeviceInput {
  readonly provider: 'PHONE' | 'EMAIL';
  readonly identifier: string;
  readonly purpose?: OtpChallengePurpose;
  /** Only the authenticated account-linking flow may provide this value. */
  readonly userId?: string;
}

export interface OtpChallengeResult {
  readonly challengeId: string;
  readonly status: Extract<OtpChallengeStatus, 'PENDING'>;
  readonly expiresAt: string;
  readonly resendAvailableAt: string;
}

export interface VerifyOtpInput extends AuthDeviceInput {
  readonly challengeId: string;
  readonly code: string;
  /** Required for LINK_IDENTITY; ignored for ordinary sign-in. */
  readonly userId?: string;
  readonly consent?: ConsentInput;
}

export interface ExternalAuthInput extends AuthDeviceInput {
  readonly provider: VerifiedExternalIdentity['provider'];
  readonly credential: string;
  readonly consent?: ConsentInput;
}

export interface ConsentInput {
  readonly termsVersion: string;
  readonly privacyVersion: string;
  readonly acceptedAt?: Date;
}

export interface AuthSessionResult {
  readonly user: AuthUser;
  readonly identity: AuthIdentity;
  readonly session: DeviceSession;
  readonly accessToken: string;
  readonly refreshToken: string;
}

export interface RefreshResult {
  readonly session: DeviceSession;
  readonly accessToken: string;
  readonly refreshToken: string;
}

export interface LinkExternalIdentityInput extends AuthDeviceInput {
  readonly userId: string;
  readonly provider: VerifiedExternalIdentity['provider'];
  readonly credential: string;
}

export interface LinkOtpIdentityInput extends AuthDeviceInput {
  readonly userId: string;
  readonly challengeId: string;
  readonly code: string;
}

export interface DeletionRequestInput {
  readonly userId: string;
  readonly reason?: string;
  readonly gracePeriodMs?: number;
}

interface UserRecord extends AuthUser {
  readonly identityIds: Set<string>;
  status: AuthUser['status'];
}

interface IdentityRecord extends AuthIdentity {
  readonly lookupKey: string;
  status: AuthIdentityStatus;
}

interface OtpRecord {
  readonly id: string;
  readonly provider: 'PHONE' | 'EMAIL';
  readonly identifier: string;
  readonly identifierKey: string;
  readonly purpose: OtpChallengePurpose;
  readonly userId: string | null;
  readonly salt: string;
  readonly codeHash: string;
  readonly createdAt: Date;
  readonly expiresAt: Date;
  readonly resendAvailableAt: Date;
  readonly maxAttempts: number;
  attempts: number;
  status: OtpChallengeStatus;
  consumedAt: Date | null;
}

interface SessionRecord {
  readonly id: string;
  readonly userId: string;
  readonly deviceId: string | null;
  readonly platform: Platform;
  readonly deviceLabel: string | null;
  readonly createdAt: Date;
  readonly expiresAt: Date;
  lastSeenAt: Date;
  revokedAt: Date | null;
  status: SessionStatus;
  refreshTokenExpiresAt: Date;
}

interface RefreshIndexRecord {
  readonly sessionId: string;
  status: 'ACTIVE' | 'USED' | 'REVOKED';
}

interface RateBucket {
  startedAt: Date;
  count: number;
}

function cloneDate(date: Date): Date {
  return new Date(date.getTime());
}

function normalizeEmail(value: string): string {
  const normalized = value.trim().toLowerCase();
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(normalized) || normalized.length > 320) {
    throw new AuthError('INVALID_INPUT', 'A valid email address is required.');
  }
  return normalized;
}

function normalizePhone(value: string): string {
  const normalized = value.trim().replace(/[\s().-]/g, '');
  if (!/^\+?[1-9]\d{6,14}$/.test(normalized)) {
    throw new AuthError('INVALID_INPUT', 'A valid phone number is required.');
  }
  return normalized;
}

function normalizeExternalSubject(value: string): string {
  const normalized = value.trim();
  if (normalized.length === 0 || normalized.length > 512) {
    throw new AuthError('INVALID_INPUT', 'The provider subject is invalid.');
  }
  return normalized;
}

function maskIdentifier(provider: 'PHONE' | 'EMAIL', identifier: string): string {
  if (provider === 'EMAIL') {
    const [localPart, domain = ''] = identifier.split('@');
    const local = localPart ?? '';
    return `${local.slice(0, 1)}***@${domain}`;
  }
  return `${identifier.slice(0, 3)}***${identifier.slice(-2)}`;
}

function hashValue(secret: Uint8Array, value: string): string {
  return createHmac('sha256', secret).update(value).digest('hex');
}

function hashOtp(
  secret: Uint8Array,
  challengeId: string,
  salt: string,
  code: string,
): string {
  return hashValue(secret, `${challengeId}:${salt}:${code}`);
}

function constantTimeEquals(left: string, right: string): boolean {
  const leftBuffer = Buffer.from(left, 'hex');
  const rightBuffer = Buffer.from(right, 'hex');
  return (
    leftBuffer.length === rightBuffer.length && timingSafeEqual(leftBuffer, rightBuffer)
  );
}

function base64UrlEncode(value: string): string {
  return Buffer.from(value, 'utf8').toString('base64url');
}

function base64UrlDecode(value: string): string {
  return Buffer.from(value, 'base64url').toString('utf8');
}

function displayNameFor(provider: 'PHONE' | 'EMAIL', identifier: string): string {
  return provider === 'EMAIL'
    ? (identifier.split('@')[0] ?? 'ME.zip user')
    : 'ME.zip user';
}

export class AuthService {
  private readonly environment: NonNullable<AuthServiceOptions['environment']>;
  private readonly secret: Uint8Array;
  private readonly now: () => Date;
  private readonly otpTtlMs: number;
  private readonly otpCooldownMs: number;
  private readonly otpMaxAttempts: number;
  private readonly otpWindowMs: number;
  private readonly otpDestinationLimit: number;
  private readonly otpIpLimit: number;
  private readonly accessTtlMs: number;
  private readonly refreshTtlMs: number;
  private readonly otpAdapters: Record<
    'PHONE' | 'EMAIL',
    OtpDeliveryAdapter | undefined
  >;
  private readonly externalAdapters: Record<
    'WECHAT' | 'GOOGLE' | 'APPLE',
    ExternalIdentityProviderAdapter | undefined
  >;
  private readonly users = new Map<string, UserRecord>();
  private readonly identities = new Map<string, IdentityRecord>();
  private readonly identityByLookupKey = new Map<string, string>();
  private readonly otpChallenges = new Map<string, OtpRecord>();
  private readonly sessions = new Map<string, SessionRecord>();
  private readonly refreshTokens = new Map<string, RefreshIndexRecord>();
  private readonly consents = new Map<string, ConsentRecord[]>();
  private readonly deletionRequests = new Map<string, AccountDeletionRequest>();
  private readonly destinationRate = new Map<string, RateBucket>();
  private readonly ipRate = new Map<string, RateBucket>();

  public constructor(options: AuthServiceOptions = {}) {
    this.environment = options.environment ?? 'test';
    if (this.environment === 'production' && options.secret === undefined) {
      throw new Error(
        'A production auth secret must be provided by the secret manager.',
      );
    }
    this.secret =
      options.secret === undefined ? randomBytes(32) : toSecretBytes(options.secret);
    this.now = options.now ?? (() => new Date());
    this.otpTtlMs = options.otpTtlMs ?? 5 * 60 * 1_000;
    this.otpCooldownMs = options.otpCooldownMs ?? 60 * 1_000;
    this.otpMaxAttempts = options.otpMaxAttempts ?? 5;
    this.otpWindowMs = options.otpWindowMs ?? 15 * 60 * 1_000;
    this.otpDestinationLimit = options.otpDestinationLimit ?? 5;
    this.otpIpLimit = options.otpIpLimit ?? 20;
    this.accessTtlMs = options.accessTtlMs ?? 15 * 60 * 1_000;
    this.refreshTtlMs = options.refreshTtlMs ?? 30 * 24 * 60 * 60 * 1_000;
    this.otpAdapters = {
      PHONE: options.otpAdapters?.PHONE ?? options.otpAdapters?.phone,
      EMAIL: options.otpAdapters?.EMAIL ?? options.otpAdapters?.email,
    };
    this.externalAdapters = {
      WECHAT: options.externalAdapters?.WECHAT ?? options.externalAdapters?.wechat,
      GOOGLE: options.externalAdapters?.GOOGLE ?? options.externalAdapters?.google,
      APPLE: options.externalAdapters?.APPLE ?? options.externalAdapters?.apple,
    };
  }

  /** Start a PHONE or EMAIL OTP without revealing whether an account exists. */
  public async startOtp(input: StartOtpInput): Promise<OtpChallengeResult> {
    const identifier =
      input.provider === 'EMAIL'
        ? normalizeEmail(input.identifier)
        : normalizePhone(input.identifier);
    const purpose = input.purpose ?? 'SIGN_IN';
    if (purpose !== 'SIGN_IN' && input.userId === undefined) {
      throw new AuthError(
        'INVALID_INPUT',
        'An authenticated user is required for this challenge.',
      );
    }
    if (input.userId !== undefined) {
      this.requireActiveUser(input.userId);
    }

    const now = cloneDate(this.now());
    const identifierKey = this.lookupKey(input.provider, identifier);
    this.enforceOtpRateLimit(identifierKey, input.ipAddress, now);
    const recent = [...this.otpChallenges.values()]
      .filter(
        (challenge) =>
          challenge.identifierKey === identifierKey && challenge.status === 'PENDING',
      )
      .sort((left, right) => right.createdAt.getTime() - left.createdAt.getTime())[0];
    if (recent !== undefined && recent.resendAvailableAt.getTime() > now.getTime()) {
      throw new AuthError(
        'OTP_COOLDOWN',
        'Please wait before requesting another code.',
        true,
      );
    }

    const challengeId = randomUUID();
    const salt = randomBytes(16).toString('hex');
    const code = randomInt(100_000, 1_000_000).toString();
    const expiresAt = new Date(now.getTime() + this.otpTtlMs);
    const resendAvailableAt = new Date(now.getTime() + this.otpCooldownMs);
    const challenge: OtpRecord = {
      id: challengeId,
      provider: input.provider,
      identifier,
      identifierKey,
      purpose,
      userId: input.userId ?? null,
      salt,
      codeHash: hashOtp(this.secret, challengeId, salt, code),
      createdAt: now,
      expiresAt,
      resendAvailableAt,
      maxAttempts: this.otpMaxAttempts,
      attempts: 0,
      status: 'PENDING',
      consumedAt: null,
    };
    this.otpChallenges.set(challengeId, challenge);

    const adapter = this.otpAdapters[input.provider];
    if (adapter === undefined) {
      challenge.status = 'CANCELLED';
      throw new AuthError(
        this.environment === 'production'
          ? 'PROVIDER_NOT_CONFIGURED'
          : 'PROVIDER_NOT_CONFIGURED',
        'An OTP delivery adapter is required.',
      );
    }

    try {
      await adapter.send({
        challengeId,
        provider: input.provider,
        destination: identifier,
        code,
        expiresAt: cloneDate(expiresAt),
      });
    } catch {
      challenge.status = 'CANCELLED';
      throw new AuthError(
        'PROVIDER_UNAVAILABLE',
        'The OTP provider is temporarily unavailable.',
        true,
      );
    }

    return {
      challengeId,
      status: 'PENDING',
      expiresAt: expiresAt.toISOString(),
      resendAvailableAt: resendAvailableAt.toISOString(),
    };
  }

  public async verifyOtp(input: VerifyOtpInput): Promise<AuthSessionResult> {
    const challenge = this.otpChallenges.get(input.challengeId);
    if (challenge === undefined) {
      throw new AuthError(
        'OTP_NOT_FOUND',
        'The verification challenge is not available.',
      );
    }
    if (challenge.purpose === 'SIGN_IN' && input.consent === undefined) {
      throw new AuthError(
        'INVALID_INPUT',
        'Terms and privacy consent are required before signing in.',
      );
    }
    const now = cloneDate(this.now());
    if (
      challenge.purpose !== 'SIGN_IN' &&
      (challenge.userId === null || input.userId !== challenge.userId)
    ) {
      throw new AuthError(
        'INVALID_INPUT',
        'The authentication challenge context is invalid.',
      );
    }
    this.consumeOtpChallenge(challenge, input.code, now);
    if (challenge.purpose === 'LINK_IDENTITY') {
      // The context was checked before consuming the one-time challenge.
      const linkedUserId = challenge.userId;
      if (linkedUserId === null) {
        throw new AuthError('INVALID_INPUT', 'The identity link context is invalid.');
      }
      const identity = this.attachIdentity(
        linkedUserId,
        challenge.provider,
        challenge.identifier,
        maskIdentifier(challenge.provider, challenge.identifier),
      );
      this.ensureConsentForSession(linkedUserId, input.consent);
      return this.createSessionResult(linkedUserId, identity, input);
    }

    const identity =
      challenge.purpose === 'RECOVERY'
        ? this.findExistingOtpIdentity(challenge.provider, challenge.identifier)
        : this.findOrCreateOtpIdentity(challenge.provider, challenge.identifier);
    const identityUser = this.requireIdentityUser(identity.id);
    if (challenge.purpose === 'RECOVERY' && identityUser.id !== challenge.userId) {
      throw new AuthError(
        'INVALID_INPUT',
        'The recovery identity does not belong to this account.',
      );
    }
    this.ensureConsentForSession(identityUser.id, input.consent);
    return this.createSessionResult(identityUser.id, identity, input);
  }

  public async authenticateExternal(
    input: ExternalAuthInput,
  ): Promise<AuthSessionResult> {
    if (input.consent === undefined) {
      throw new AuthError(
        'INVALID_INPUT',
        'Terms and privacy consent are required before signing in.',
      );
    }
    const adapter = this.externalAdapters[input.provider];
    if (adapter === undefined) {
      throw new AuthError(
        'PROVIDER_NOT_CONFIGURED',
        'The identity provider is not configured.',
      );
    }
    let verified: VerifiedExternalIdentity;
    try {
      verified = await adapter.verify({ credential: input.credential });
    } catch (error) {
      if (error instanceof AuthError) {
        throw error;
      }
      throw new AuthError(
        'PROVIDER_UNAVAILABLE',
        'The identity provider is temporarily unavailable.',
        true,
      );
    }
    if (verified.provider !== input.provider) {
      throw new AuthError(
        'PROVIDER_UNAVAILABLE',
        'The identity provider response is invalid.',
      );
    }
    const identity = this.findOrCreateExternalIdentity(verified);
    const userId = this.requireIdentityUser(identity.id).id;
    this.ensureConsentForSession(userId, input.consent);
    return this.createSessionResult(userId, identity, input);
  }

  public async linkExternalIdentity(
    input: LinkExternalIdentityInput,
  ): Promise<AuthIdentity> {
    this.requireActiveUser(input.userId);
    const adapter = this.externalAdapters[input.provider];
    if (adapter === undefined) {
      throw new AuthError(
        'PROVIDER_NOT_CONFIGURED',
        'The identity provider is not configured.',
      );
    }
    let verified: VerifiedExternalIdentity;
    try {
      verified = await adapter.verify({ credential: input.credential });
    } catch {
      throw new AuthError(
        'PROVIDER_UNAVAILABLE',
        'The identity provider is temporarily unavailable.',
        true,
      );
    }
    if (verified.provider !== input.provider) {
      throw new AuthError(
        'PROVIDER_UNAVAILABLE',
        'The identity provider response is invalid.',
      );
    }
    return this.attachIdentity(
      input.userId,
      verified.provider,
      verified.subject,
      verified.subject,
    );
  }

  public async linkOtpIdentity(input: LinkOtpIdentityInput): Promise<AuthIdentity> {
    this.requireActiveUser(input.userId);
    const challenge = this.otpChallenges.get(input.challengeId);
    if (
      challenge === undefined ||
      challenge.purpose !== 'LINK_IDENTITY' ||
      challenge.userId !== input.userId
    ) {
      throw new AuthError(
        'OTP_NOT_FOUND',
        'The identity link challenge is not available.',
      );
    }
    const existingIdentityId = this.identityByLookupKey.get(
      this.lookupKey(challenge.provider, challenge.identifier),
    );
    if (existingIdentityId !== undefined) {
      const existingIdentity = this.identities.get(existingIdentityId);
      if (
        existingIdentity !== undefined &&
        existingIdentity.userId !== input.userId &&
        existingIdentity.status === 'ACTIVE'
      ) {
        throw new AuthError(
          'IDENTITY_ALREADY_LINKED',
          'This identity is already linked to another account.',
        );
      }
    }
    this.consumeOtpChallenge(challenge, input.code, cloneDate(this.now()));
    this.attachIdentity(
      input.userId,
      challenge.provider,
      challenge.identifier,
      maskIdentifier(challenge.provider, challenge.identifier),
    );
    const identityId = this.identityByLookupKey.get(
      this.lookupKey(challenge.provider, challenge.identifier),
    );
    if (identityId === undefined) {
      throw new AuthError('IDENTITY_NOT_FOUND', 'The linked identity was not created.');
    }
    const identity = this.identities.get(identityId);
    if (identity === undefined) {
      throw new AuthError('IDENTITY_NOT_FOUND', 'The linked identity was not created.');
    }
    return this.publicIdentity(identity);
  }

  public async refresh(refreshToken: string): Promise<RefreshResult> {
    if (refreshToken.length < 32) {
      throw new AuthError('INVALID_TOKEN', 'The refresh token is invalid.');
    }
    const tokenHash = hashValue(this.secret, refreshToken);
    const index = this.refreshTokens.get(tokenHash);
    if (index === undefined) {
      throw new AuthError('INVALID_TOKEN', 'The refresh token is invalid.');
    }
    const session = this.sessions.get(index.sessionId);
    if (session === undefined) {
      throw new AuthError('SESSION_NOT_FOUND', 'The session is not available.');
    }
    if (index.status !== 'ACTIVE') {
      if (index.status === 'USED') {
        this.revokeSessionRecord(session, this.now());
        throw new AuthError(
          'SESSION_REPLAYED',
          'The refresh token was already rotated.',
        );
      }
      throw new AuthError('SESSION_REVOKED', 'The session has been revoked.');
    }
    const now = cloneDate(this.now());
    if (session.status !== 'ACTIVE' || session.revokedAt !== null) {
      throw new AuthError('SESSION_REVOKED', 'The session has been revoked.');
    }
    if (session.refreshTokenExpiresAt.getTime() <= now.getTime()) {
      session.status = 'EXPIRED';
      throw new AuthError('SESSION_EXPIRED', 'The session has expired.');
    }
    index.status = 'USED';
    session.lastSeenAt = now;
    const rotatedRefreshToken = this.issueRefreshToken(session.id);
    const accessToken = this.issueAccessToken(session, now);
    return {
      session: this.publicSession(session),
      accessToken,
      refreshToken: rotatedRefreshToken,
    };
  }

  public logout(input: {
    readonly sessionId?: string;
    readonly refreshToken?: string;
    readonly userId?: string;
  }): void {
    let sessionId = input.sessionId;
    if (sessionId === undefined && input.refreshToken !== undefined) {
      sessionId = this.refreshTokens.get(
        hashValue(this.secret, input.refreshToken),
      )?.sessionId;
    }
    if (sessionId === undefined) {
      throw new AuthError('INVALID_INPUT', 'A session or refresh token is required.');
    }
    const session = this.sessions.get(sessionId);
    if (session === undefined) {
      return;
    }
    if (input.userId !== undefined && session.userId !== input.userId) {
      throw new AuthError('SESSION_NOT_FOUND', 'The session is not available.');
    }
    this.revokeSessionRecord(session, this.now());
  }

  public logoutAll(userId: string): number {
    this.requireUser(userId);
    let count = 0;
    for (const session of this.sessions.values()) {
      if (session.userId === userId && session.status === 'ACTIVE') {
        this.revokeSessionRecord(session, this.now());
        count += 1;
      }
    }
    return count;
  }

  public authenticateAccessToken(accessToken: string): AuthenticatedPrincipal {
    const parts = accessToken.split('.');
    if (parts.length !== 2) {
      throw new AuthError('INVALID_TOKEN', 'The access token is invalid.');
    }
    const [encoded, suppliedSignature] = parts;
    if (encoded === undefined || suppliedSignature === undefined) {
      throw new AuthError('INVALID_TOKEN', 'The access token is invalid.');
    }
    const expectedSignature = createHmac('sha256', this.secret)
      .update(encoded)
      .digest('base64url');
    const supplied = Buffer.from(suppliedSignature);
    const expected = Buffer.from(expectedSignature);
    if (supplied.length !== expected.length || !timingSafeEqual(supplied, expected)) {
      throw new AuthError('INVALID_TOKEN', 'The access token is invalid.');
    }
    let payload: { sid: string; uid: string; iat: number; exp: number };
    try {
      payload = JSON.parse(base64UrlDecode(encoded)) as typeof payload;
    } catch {
      throw new AuthError('INVALID_TOKEN', 'The access token is invalid.');
    }
    const now = this.now().getTime();
    if (
      typeof payload.sid !== 'string' ||
      typeof payload.uid !== 'string' ||
      !Number.isSafeInteger(payload.iat) ||
      !Number.isSafeInteger(payload.exp) ||
      payload.iat > now ||
      payload.exp <= payload.iat
    ) {
      throw new AuthError('INVALID_TOKEN', 'The access token is invalid.');
    }
    if (payload.exp <= now) {
      throw new AuthError('SESSION_EXPIRED', 'The access token has expired.');
    }
    const session = this.sessions.get(payload.sid);
    const user = this.users.get(payload.uid);
    if (session === undefined || user === undefined || session.userId !== user.id) {
      throw new AuthError('INVALID_TOKEN', 'The access token is invalid.');
    }
    if (session.status !== 'ACTIVE' || session.revokedAt !== null) {
      throw new AuthError('SESSION_REVOKED', 'The session has been revoked.');
    }
    if (user.status !== 'ACTIVE') {
      throw new AuthError('ACCOUNT_DISABLED', 'The account is not active.');
    }
    return {
      userId: user.id,
      sessionId: session.id,
      roles: user.roles,
      issuedAt: new Date(payload.iat).toISOString(),
    };
  }

  public listIdentities(userId: string): readonly AuthIdentity[] {
    const user = this.requireUser(userId);
    return [...user.identityIds]
      .map((identityId) => this.identities.get(identityId))
      .filter(
        (identity): identity is IdentityRecord =>
          identity !== undefined && identity.status === 'ACTIVE',
      )
      .map((identity) => this.publicIdentity(identity));
  }

  public unlinkIdentity(userId: string, identityId: string): void {
    const user = this.requireActiveUser(userId);
    const identity = this.identities.get(identityId);
    if (
      identity === undefined ||
      identity.userId !== user.id ||
      identity.status !== 'ACTIVE'
    ) {
      throw new AuthError('IDENTITY_NOT_FOUND', 'The identity is not available.');
    }
    const activeCount = [...user.identityIds].filter(
      (candidateId) => this.identities.get(candidateId)?.status === 'ACTIVE',
    ).length;
    if (activeCount <= 1) {
      throw new AuthError(
        'LAST_IDENTITY',
        'At least one verified sign-in identity must remain.',
      );
    }
    identity.status = 'REVOKED';
    user.identityIds.delete(identity.id);
    this.identityByLookupKey.delete(identity.lookupKey);
  }

  public listSessions(userId: string): readonly DeviceSession[] {
    this.requireUser(userId);
    return [...this.sessions.values()]
      .filter((session) => session.userId === userId)
      .sort((left, right) => right.lastSeenAt.getTime() - left.lastSeenAt.getTime())
      .map((session) => this.publicSession(session));
  }

  public revokeSession(userId: string, sessionId: string): void {
    this.requireUser(userId);
    const session = this.sessions.get(sessionId);
    if (session === undefined || session.userId !== userId) {
      throw new AuthError('SESSION_NOT_FOUND', 'The session is not available.');
    }
    this.revokeSessionRecord(session, this.now());
  }

  public recordConsent(userId: string, input: ConsentInput): ConsentRecord {
    this.requireActiveUser(userId);
    const termsVersion = input.termsVersion.trim();
    const privacyVersion = input.privacyVersion.trim();
    if (termsVersion.length === 0 || privacyVersion.length === 0) {
      throw new AuthError('INVALID_INPUT', 'Terms and privacy versions are required.');
    }
    const acceptedAt =
      input.acceptedAt === undefined
        ? cloneDate(this.now())
        : cloneDate(input.acceptedAt);
    const record: ConsentRecord = {
      id: randomUUID(),
      userId,
      termsVersion,
      privacyVersion,
      acceptedAt: acceptedAt.toISOString(),
    };
    const history = this.consents.get(userId) ?? [];
    history.push(record);
    this.consents.set(userId, history);
    return record;
  }

  public getConsent(userId: string): ConsentRecord | null {
    this.requireUser(userId);
    return this.consents.get(userId)?.at(-1) ?? null;
  }

  private ensureConsentForSession(
    userId: string,
    input: ConsentInput | undefined,
  ): void {
    if (input !== undefined) {
      this.recordConsent(userId, input);
      return;
    }
    if ((this.consents.get(userId)?.length ?? 0) > 0) {
      return;
    }
    throw new AuthError(
      'INVALID_INPUT',
      'Terms and privacy consent are required before signing in.',
    );
  }

  public listConsents(userId: string): readonly ConsentRecord[] {
    this.requireUser(userId);
    return [...(this.consents.get(userId) ?? [])];
  }

  public requestAccountDeletion(input: DeletionRequestInput): AccountDeletionRequest {
    const user = this.requireActiveUser(input.userId);
    const existing = [...this.deletionRequests.values()].find(
      (request) =>
        request.userId === user.id &&
        ['REQUESTED', 'PROCESSING'].includes(request.status),
    );
    if (existing !== undefined) {
      return existing;
    }
    const now = cloneDate(this.now());
    const gracePeriodMs = input.gracePeriodMs ?? 30 * 24 * 60 * 60 * 1_000;
    const request: AccountDeletionRequest = {
      id: randomUUID(),
      userId: user.id,
      status: 'REQUESTED',
      requestedAt: now.toISOString(),
      scheduledFor: new Date(now.getTime() + Math.max(0, gracePeriodMs)).toISOString(),
      completedAt: null,
    };
    this.deletionRequests.set(request.id, request);
    user.status = 'DELETION_PENDING';
    this.logoutAll(user.id);
    return request;
  }

  public cancelAccountDeletion(userId: string): AccountDeletionRequest | null {
    this.requireUser(userId);
    const request = [...this.deletionRequests.values()].find(
      (candidate) => candidate.userId === userId && candidate.status === 'REQUESTED',
    );
    if (request === undefined) {
      return null;
    }
    const cancelled: AccountDeletionRequest = { ...request, status: 'CANCELLED' };
    this.deletionRequests.set(cancelled.id, cancelled);
    const user = this.requireUser(userId);
    user.status = 'ACTIVE';
    return cancelled;
  }

  public getAccount(userId: string): AuthUser {
    return this.publicUser(this.requireUser(userId));
  }

  public getDeletionRequest(userId: string): AccountDeletionRequest | null {
    this.requireUser(userId);
    return (
      [...this.deletionRequests.values()]
        .filter((request) => request.userId === userId)
        .sort((left, right) => right.requestedAt.localeCompare(left.requestedAt))[0] ??
      null
    );
  }

  private createSessionResult(
    userId: string,
    identity: IdentityRecord,
    input: AuthDeviceInput,
  ): AuthSessionResult {
    const user = this.requireActiveUser(userId);
    const session = this.createSession(user.id, input);
    return {
      user: this.publicUser(user),
      identity: this.publicIdentity(identity),
      session: this.publicSession(session),
      accessToken: this.issueAccessToken(session, this.now()),
      refreshToken: this.issueRefreshToken(session.id),
    };
  }

  private createSession(userId: string, input: AuthDeviceInput): SessionRecord {
    const now = cloneDate(this.now());
    const session: SessionRecord = {
      id: randomUUID(),
      userId,
      deviceId: input.deviceId ?? null,
      platform: input.platform ?? 'WEB',
      deviceLabel: input.deviceLabel ?? null,
      createdAt: now,
      lastSeenAt: now,
      expiresAt: new Date(now.getTime() + this.refreshTtlMs),
      revokedAt: null,
      status: 'ACTIVE',
      refreshTokenExpiresAt: new Date(now.getTime() + this.refreshTtlMs),
    };
    this.sessions.set(session.id, session);
    return session;
  }

  private issueAccessToken(session: SessionRecord, now: Date): string {
    const payload = {
      sid: session.id,
      uid: session.userId,
      iat: now.getTime(),
      exp: now.getTime() + this.accessTtlMs,
    };
    const encoded = base64UrlEncode(JSON.stringify(payload));
    const signature = createHmac('sha256', this.secret)
      .update(encoded)
      .digest('base64url');
    return `${encoded}.${signature}`;
  }

  private issueRefreshToken(sessionId: string): string {
    const token = randomBytes(48).toString('base64url');
    this.refreshTokens.set(hashValue(this.secret, token), {
      sessionId,
      status: 'ACTIVE',
    });
    return token;
  }

  private findOrCreateOtpIdentity(
    provider: 'PHONE' | 'EMAIL',
    identifier: string,
  ): IdentityRecord {
    const lookupKey = this.lookupKey(provider, identifier);
    const identityId = this.identityByLookupKey.get(lookupKey);
    if (identityId !== undefined) {
      const identity = this.identities.get(identityId);
      if (identity === undefined || identity.status !== 'ACTIVE') {
        throw new AuthError('ACCOUNT_DISABLED', 'The account is not available.');
      }
      return identity;
    }
    const user = this.createUser(displayNameFor(provider, identifier));
    return this.attachIdentity(
      user.id,
      provider,
      identifier,
      maskIdentifier(provider, identifier),
    );
  }

  private findExistingOtpIdentity(
    provider: 'PHONE' | 'EMAIL',
    identifier: string,
  ): IdentityRecord {
    const identityId = this.identityByLookupKey.get(
      this.lookupKey(provider, identifier),
    );
    if (identityId === undefined) {
      throw new AuthError('USER_NOT_FOUND', 'The recovery identity is not available.');
    }
    const identity = this.identities.get(identityId);
    if (identity === undefined || identity.status !== 'ACTIVE') {
      throw new AuthError(
        'ACCOUNT_DISABLED',
        'The recovery identity is not available.',
      );
    }
    return identity;
  }

  private findOrCreateExternalIdentity(
    verified: VerifiedExternalIdentity,
  ): IdentityRecord {
    const subject = normalizeExternalSubject(verified.subject);
    const lookupKey = this.lookupKey(verified.provider, subject);
    const identityId = this.identityByLookupKey.get(lookupKey);
    if (identityId !== undefined) {
      const identity = this.identities.get(identityId);
      if (identity === undefined || identity.status !== 'ACTIVE') {
        throw new AuthError('ACCOUNT_DISABLED', 'The account is not available.');
      }
      return identity;
    }
    const user = this.createUser(verified.displayName ?? 'ME.zip user');
    return this.attachIdentity(user.id, verified.provider, subject, subject);
  }

  private createUser(displayName: string): UserRecord {
    const now = cloneDate(this.now());
    const user: UserRecord = {
      id: randomUUID(),
      displayName: displayName.slice(0, 120),
      status: 'ACTIVE',
      roles: ['USER'],
      createdAt: now.toISOString(),
      identityIds: new Set<string>(),
    };
    this.users.set(user.id, user);
    return user;
  }

  private attachIdentity(
    userId: string,
    provider: AuthProvider,
    subject: string,
    subjectForDisplay: string,
  ): IdentityRecord {
    const normalizedSubject =
      provider === 'EMAIL'
        ? normalizeEmail(subject)
        : provider === 'PHONE'
          ? normalizePhone(subject)
          : normalizeExternalSubject(subject);
    const lookupKey = this.lookupKey(provider, normalizedSubject);
    const existingId = this.identityByLookupKey.get(lookupKey);
    if (existingId !== undefined) {
      const existing = this.identities.get(existingId);
      if (
        existing !== undefined &&
        existing.userId !== userId &&
        existing.status === 'ACTIVE'
      ) {
        throw new AuthError(
          'IDENTITY_ALREADY_LINKED',
          'This identity is already linked to another account.',
        );
      }
      if (existing !== undefined) {
        return existing;
      }
    }
    const user = this.requireActiveUser(userId);
    const now = cloneDate(this.now());
    const identity: IdentityRecord = {
      id: randomUUID(),
      userId: user.id,
      provider,
      subject: subjectForDisplay,
      status: 'ACTIVE',
      verifiedAt: now.toISOString(),
      createdAt: now.toISOString(),
      lookupKey,
    };
    this.identities.set(identity.id, identity);
    this.identityByLookupKey.set(lookupKey, identity.id);
    user.identityIds.add(identity.id);
    return identity;
  }

  private requireIdentityUser(identityId: string): UserRecord {
    const identity = this.identities.get(identityId);
    if (identity === undefined) {
      throw new AuthError('IDENTITY_NOT_FOUND', 'The identity is not available.');
    }
    return this.requireUser(identity.userId);
  }

  private requireUser(userId: string): UserRecord {
    const user = this.users.get(userId);
    if (user === undefined) {
      throw new AuthError('USER_NOT_FOUND', 'The account is not available.');
    }
    return user;
  }

  private requireActiveUser(userId: string): UserRecord {
    const user = this.requireUser(userId);
    if (user.status === 'DELETION_PENDING') {
      throw new AuthError('DELETION_PENDING', 'The account is pending deletion.');
    }
    if (user.status !== 'ACTIVE') {
      throw new AuthError('ACCOUNT_DISABLED', 'The account is not active.');
    }
    return user;
  }

  private lookupKey(provider: AuthProvider, subject: string): string {
    return `${provider}:${hashValue(this.secret, subject)}`;
  }

  private enforceOtpRateLimit(
    identifierKey: string,
    ipAddress: string | undefined,
    now: Date,
  ): void {
    this.bumpRateBucket(
      this.destinationRate,
      identifierKey,
      now,
      this.otpDestinationLimit,
    );
    if (ipAddress !== undefined && ipAddress.trim().length > 0) {
      this.bumpRateBucket(
        this.ipRate,
        hashValue(this.secret, ipAddress.trim()),
        now,
        this.otpIpLimit,
      );
    }
  }

  private bumpRateBucket(
    map: Map<string, RateBucket>,
    key: string,
    now: Date,
    limit: number,
  ): void {
    const current = map.get(key);
    if (
      current === undefined ||
      now.getTime() - current.startedAt.getTime() >= this.otpWindowMs
    ) {
      map.set(key, { startedAt: now, count: 1 });
      return;
    }
    if (current.count >= limit) {
      throw new AuthError(
        'RATE_LIMITED',
        'Too many requests. Please try again later.',
        true,
      );
    }
    current.count += 1;
  }

  private consumeOtpChallenge(challenge: OtpRecord, code: string, now: Date): void {
    this.expireChallengeIfNeeded(challenge, now);
    if (challenge.status === 'CONSUMED') {
      throw new AuthError('OTP_REPLAY', 'The verification code has already been used.');
    }
    if (challenge.status === 'EXPIRED') {
      throw new AuthError('OTP_EXPIRED', 'The verification code has expired.');
    }
    if (challenge.status === 'LOCKED') {
      throw new AuthError('OTP_TOO_MANY_ATTEMPTS', 'Too many verification attempts.');
    }
    if (challenge.status !== 'PENDING') {
      throw new AuthError('OTP_INVALID', 'The verification code is not valid.');
    }
    const validFormat = /^\d{6}$/.test(code);
    const expectedHash = validFormat
      ? hashOtp(this.secret, challenge.id, challenge.salt, code)
      : '';
    if (!validFormat || !constantTimeEquals(expectedHash, challenge.codeHash)) {
      challenge.attempts += 1;
      this.lockChallengeIfNeeded(challenge);
      const locked = challenge.attempts >= challenge.maxAttempts;
      throw new AuthError(
        locked ? 'OTP_TOO_MANY_ATTEMPTS' : 'OTP_INVALID',
        locked
          ? 'Too many verification attempts.'
          : 'The verification code is not valid.',
      );
    }
    challenge.status = 'CONSUMED';
    challenge.consumedAt = now;
  }

  private expireChallengeIfNeeded(challenge: OtpRecord, now: Date): void {
    if (
      challenge.status === 'PENDING' &&
      challenge.expiresAt.getTime() <= now.getTime()
    ) {
      challenge.status = 'EXPIRED';
    }
  }

  private lockChallengeIfNeeded(challenge: OtpRecord): void {
    if (challenge.attempts >= challenge.maxAttempts) {
      challenge.status = 'LOCKED';
    }
  }

  private revokeSessionRecord(session: SessionRecord, at: Date): void {
    if (session.status === 'REVOKED') {
      return;
    }
    session.status = 'REVOKED';
    session.revokedAt = cloneDate(at);
    for (const token of this.refreshTokens.values()) {
      if (token.sessionId === session.id && token.status === 'ACTIVE') {
        token.status = 'REVOKED';
      }
    }
  }

  private publicUser(user: UserRecord): AuthUser {
    return {
      id: user.id,
      displayName: user.displayName,
      status: user.status,
      roles: user.roles,
      createdAt: user.createdAt,
    };
  }

  private publicIdentity(identity: IdentityRecord): AuthIdentity {
    return {
      id: identity.id,
      userId: identity.userId,
      provider: identity.provider,
      subject: identity.subject,
      status: identity.status,
      verifiedAt: identity.verifiedAt,
      createdAt: identity.createdAt,
    };
  }

  private publicSession(session: SessionRecord): DeviceSession {
    return {
      id: session.id,
      userId: session.userId,
      deviceId: session.deviceId,
      platform: session.platform,
      deviceLabel: session.deviceLabel,
      createdAt: session.createdAt.toISOString(),
      lastSeenAt: session.lastSeenAt.toISOString(),
      expiresAt: session.expiresAt.toISOString(),
      revokedAt: session.revokedAt?.toISOString() ?? null,
    };
  }
}

function toSecretBytes(secret: string | Uint8Array): Uint8Array {
  return typeof secret === 'string'
    ? new TextEncoder().encode(secret)
    : new Uint8Array(secret);
}

export function canUseBreakGlass(input: {
  role: PlatformRole;
  recentReauthentication: boolean;
  reason: string;
  expiresAt: Date;
  now: Date;
}): boolean {
  return (
    input.role === 'SUPER_ADMIN' &&
    input.recentReauthentication &&
    input.reason.trim().length >= 12 &&
    input.expiresAt.getTime() > input.now.getTime()
  );
}

/** Small helper for tests and local composition roots. Production must inject real adapters. */
export function createDevAuthAdapters(): {
  readonly phone: DevOtpDeliveryAdapter;
  readonly email: DevOtpDeliveryAdapter;
  readonly wechat: MockIdentityProviderAdapter;
  readonly google: MockIdentityProviderAdapter;
  readonly apple: MockIdentityProviderAdapter;
} {
  return {
    phone: new DevOtpDeliveryAdapter({ exposeCodes: true }),
    email: new DevOtpDeliveryAdapter({ exposeCodes: true }),
    wechat: new MockIdentityProviderAdapter('WECHAT'),
    google: new MockIdentityProviderAdapter('GOOGLE'),
    apple: new MockIdentityProviderAdapter('APPLE'),
  };
}

/** Convenience for callers that need a deterministic hash without exposing OTP material. */
export function hashRefreshTokenForStorage(
  secret: string | Uint8Array,
  refreshToken: string,
): string {
  return hashValue(toSecretBytes(secret), refreshToken);
}

/** SHA-256 helper for rate-limit keys and database lookup keys. */
export function sha256(value: string): string {
  return createHash('sha256').update(value).digest('hex');
}

/** Versioned route names consumed by the HTTP/mini-program composition layer. */
export const authRouteContracts = {
  start: '/v1/auth/otp/start',
  verify: '/v1/auth/otp/verify',
  externalVerify: '/v1/auth/providers/{provider}/verify',
  refresh: '/v1/auth/refresh',
  logout: '/v1/auth/logout',
  logoutAll: '/v1/auth/logout-all',
  identities: '/v1/auth/identities',
  identitiesList: '/v1/auth/identities',
  linkIdentity: '/v1/auth/identities/link',
  unlinkIdentity: '/v1/auth/identities/{identityId}',
  sessions: '/v1/auth/sessions',
  sessionsList: '/v1/auth/sessions',
  revokeSession: '/v1/auth/sessions/{sessionId}',
  account: '/v1/me',
  consents: '/v1/me/consents',
  accountDeletion: '/v1/me/account-deletion',
} as const;

export interface AuthApiContext {
  readonly requestId: string;
  readonly principal?: AuthenticatedPrincipal;
}

/**
 * Framework-neutral API adapter. It keeps route composition and response
 * envelopes testable without coupling the auth policy to Fastify/Express or
 * the WeChat runtime. The HTTP edge must supply the authenticated principal;
 * clients cannot provide a trusted user id for self-scoped operations.
 */
export class AuthApi {
  public constructor(private readonly service: AuthService) {}

  public async start(
    context: AuthApiContext,
    input: Omit<StartOtpInput, 'userId'>,
  ): Promise<ApiResponse<OtpChallengeResult>> {
    if ('userId' in (input as Record<string, unknown>)) {
      return this.failure(
        new AuthError('INVALID_INPUT', 'User context is server-derived.'),
        context.requestId,
      );
    }
    const purpose = input.purpose ?? 'SIGN_IN';
    if (purpose !== 'SIGN_IN') {
      const principal = context.principal;
      if (principal === undefined) {
        return this.failure(
          new AuthError('INVALID_TOKEN', 'Authentication is required.'),
          context.requestId,
        );
      }
      return this.run(context, () =>
        this.service.startOtp({ ...input, purpose, userId: principal.userId }),
      );
    }
    return this.run(context, () => this.service.startOtp(input));
  }

  public async verify(
    context: AuthApiContext,
    input: Omit<VerifyOtpInput, 'userId'>,
  ): Promise<ApiResponse<AuthSessionResult>> {
    const challengeContext = input as VerifyOtpInput;
    if (challengeContext.userId !== undefined) {
      return this.failure(
        new AuthError('INVALID_INPUT', 'User context is server-derived.'),
        context.requestId,
      );
    }
    const principal = context.principal;
    return this.run(context, () =>
      principal === undefined
        ? this.service.verifyOtp(input)
        : this.service.verifyOtp({ ...input, userId: principal.userId }),
    );
  }

  public async verifyExternal(
    context: AuthApiContext,
    input: ExternalAuthInput,
  ): Promise<ApiResponse<AuthSessionResult>> {
    return this.run(context, () => this.service.authenticateExternal(input));
  }

  public async refresh(
    context: AuthApiContext,
    refreshToken: string,
  ): Promise<ApiResponse<RefreshResult>> {
    return this.run(context, () => this.service.refresh(refreshToken));
  }

  public logout(
    context: AuthApiContext,
    input: { readonly sessionId?: string; readonly refreshToken?: string },
  ): ApiResponse<null> {
    if (input.sessionId !== undefined && context.principal === undefined) {
      return this.failure(
        new AuthError('INVALID_TOKEN', 'Authentication is required.'),
        context.requestId,
      );
    }
    try {
      this.service.logout({
        ...input,
        ...(context.principal === undefined
          ? {}
          : { userId: context.principal.userId }),
      });
      return this.success(null, context.requestId);
    } catch (error) {
      return this.failure(error, context.requestId);
    }
  }

  public logoutAll(context: AuthApiContext): ApiResponse<{ readonly revoked: number }> {
    if (context.principal === undefined) {
      return this.failure(
        new AuthError('INVALID_TOKEN', 'Authentication is required.'),
        context.requestId,
      );
    }
    try {
      return this.success(
        { revoked: this.service.logoutAll(context.principal.userId) },
        context.requestId,
      );
    } catch (error) {
      return this.failure(error, context.requestId);
    }
  }

  public listIdentities(context: AuthApiContext): ApiResponse<readonly AuthIdentity[]> {
    if (context.principal === undefined) {
      return this.failure(
        new AuthError('INVALID_TOKEN', 'Authentication is required.'),
        context.requestId,
      );
    }
    try {
      return this.success(
        this.service.listIdentities(context.principal.userId),
        context.requestId,
      );
    } catch (error) {
      return this.failure(error, context.requestId);
    }
  }

  public async linkOtp(
    context: AuthApiContext,
    input: Omit<LinkOtpIdentityInput, 'userId'>,
  ): Promise<ApiResponse<AuthIdentity>> {
    const principal = context.principal;
    if (principal === undefined) {
      return this.failure(
        new AuthError('INVALID_TOKEN', 'Authentication is required.'),
        context.requestId,
      );
    }
    return this.run(context, () =>
      this.service.linkOtpIdentity({
        ...input,
        userId: principal.userId,
      }),
    );
  }

  public async linkExternal(
    context: AuthApiContext,
    input: Omit<LinkExternalIdentityInput, 'userId'>,
  ): Promise<ApiResponse<AuthIdentity>> {
    const principal = context.principal;
    if (principal === undefined) {
      return this.failure(
        new AuthError('INVALID_TOKEN', 'Authentication is required.'),
        context.requestId,
      );
    }
    return this.run(context, () =>
      this.service.linkExternalIdentity({
        ...input,
        userId: principal.userId,
      }),
    );
  }

  public unlinkIdentity(
    context: AuthApiContext,
    identityId: string,
  ): ApiResponse<null> {
    if (context.principal === undefined) {
      return this.failure(
        new AuthError('INVALID_TOKEN', 'Authentication is required.'),
        context.requestId,
      );
    }
    try {
      this.service.unlinkIdentity(context.principal.userId, identityId);
      return this.success(null, context.requestId);
    } catch (error) {
      return this.failure(error, context.requestId);
    }
  }

  public listSessions(context: AuthApiContext): ApiResponse<readonly DeviceSession[]> {
    if (context.principal === undefined) {
      return this.failure(
        new AuthError('INVALID_TOKEN', 'Authentication is required.'),
        context.requestId,
      );
    }
    try {
      return this.success(
        this.service.listSessions(context.principal.userId),
        context.requestId,
      );
    } catch (error) {
      return this.failure(error, context.requestId);
    }
  }

  public revokeSession(context: AuthApiContext, sessionId: string): ApiResponse<null> {
    if (context.principal === undefined) {
      return this.failure(
        new AuthError('INVALID_TOKEN', 'Authentication is required.'),
        context.requestId,
      );
    }
    try {
      this.service.revokeSession(context.principal.userId, sessionId);
      return this.success(null, context.requestId);
    } catch (error) {
      return this.failure(error, context.requestId);
    }
  }

  public account(context: AuthApiContext): ApiResponse<AuthUser> {
    if (context.principal === undefined) {
      return this.failure(
        new AuthError('INVALID_TOKEN', 'Authentication is required.'),
        context.requestId,
      );
    }
    try {
      return this.success(
        this.service.getAccount(context.principal.userId),
        context.requestId,
      );
    } catch (error) {
      return this.failure(error, context.requestId);
    }
  }

  public listConsents(context: AuthApiContext): ApiResponse<readonly ConsentRecord[]> {
    if (context.principal === undefined) {
      return this.failure(
        new AuthError('INVALID_TOKEN', 'Authentication is required.'),
        context.requestId,
      );
    }
    try {
      return this.success(
        this.service.listConsents(context.principal.userId),
        context.requestId,
      );
    } catch (error) {
      return this.failure(error, context.requestId);
    }
  }

  public recordConsent(
    context: AuthApiContext,
    input: ConsentInput,
  ): ApiResponse<ConsentRecord> {
    if (context.principal === undefined) {
      return this.failure(
        new AuthError('INVALID_TOKEN', 'Authentication is required.'),
        context.requestId,
      );
    }
    try {
      return this.success(
        this.service.recordConsent(context.principal.userId, input),
        context.requestId,
      );
    } catch (error) {
      return this.failure(error, context.requestId);
    }
  }

  public requestDeletion(
    context: AuthApiContext,
    reason?: string,
  ): ApiResponse<AccountDeletionRequest> {
    if (context.principal === undefined) {
      return this.failure(
        new AuthError('INVALID_TOKEN', 'Authentication is required.'),
        context.requestId,
      );
    }
    try {
      const input =
        reason === undefined
          ? { userId: context.principal.userId }
          : { userId: context.principal.userId, reason };
      return this.success(
        this.service.requestAccountDeletion(input),
        context.requestId,
      );
    } catch (error) {
      return this.failure(error, context.requestId);
    }
  }

  public cancelDeletion(
    context: AuthApiContext,
  ): ApiResponse<AccountDeletionRequest | null> {
    if (context.principal === undefined) {
      return this.failure(
        new AuthError('INVALID_TOKEN', 'Authentication is required.'),
        context.requestId,
      );
    }
    try {
      return this.success(
        this.service.cancelAccountDeletion(context.principal.userId),
        context.requestId,
      );
    } catch (error) {
      return this.failure(error, context.requestId);
    }
  }

  private async run<T>(
    context: AuthApiContext,
    operation: () => Promise<T>,
  ): Promise<ApiResponse<T>> {
    try {
      return this.success(await operation(), context.requestId);
    } catch (error) {
      return this.failure(error, context.requestId);
    }
  }

  private success<T>(data: T, requestId: string): ApiSuccess<T> {
    return { data, meta: { requestId } };
  }

  private failure(error: unknown, requestId: string): ApiFailure {
    const authError =
      error instanceof AuthError
        ? error
        : new AuthError('INVALID_INPUT', 'The request could not be completed.');
    return {
      error: {
        code: authError.code,
        message: authError.message,
        retryable: authError.retryable,
        requestId,
      },
    };
  }
}
