import { randomUUID } from 'node:crypto';

import { resolveCapabilities } from '@me-zip/payment';
import type {
  ArchivePublishedSnapshot,
  AuthenticatedPrincipal,
  BenefitGrant,
  CapabilityCode,
  CommunityActivity,
  CommunityActivityKind,
  CommunityActivityRegistration,
  CommunityAuthorProfile,
  CommunityChannel,
  CommunityChannelMembership,
  CommunityComment,
  CommunityCommentStatus,
  CommunityCursorPage,
  CommunityFeedItem,
  CommunityFeedMode,
  CommunityFeedPage,
  CommunityGroup,
  CommunityGroupMembership,
  CommunityGroupMembershipStatus,
  CommunityGroupVisibility,
  CommunityMediaReference,
  CommunityNotification,
  CommunityNotificationType,
  CommunityPost,
  CommunityPostStatus,
  CommunityProfile,
  CommunityPublishedSnapshot,
  CommunityQuotePreview,
  CommunityReaction,
  CommunityRepostAttribution,
  CommunityReport,
  CommunityReportReason,
  CommunityReportTargetType,
  CommunitySearchResult,
  CommunitySnapshotPublication,
  CommunitySnapshotPreview,
  CommunityVisibility,
  FounderAudience,
  JsonObject,
  ModerationActionType,
  ModerationCase,
  PlanCode,
} from '@me-zip/shared-types';

export type CommunityErrorCode =
  | 'FORBIDDEN'
  | 'NOT_FOUND'
  | 'VALIDATION'
  | 'CONFLICT'
  | 'IDEMPOTENCY_REPLAY'
  | 'ENTITLEMENT_REQUIRED'
  | 'BLOCKED'
  | 'CAPACITY_FULL'
  | 'RATE_LIMITED'
  | 'INVALID_STATE'
  | 'MODERATION_REQUIRED';

/** A transport-neutral error. Its message intentionally contains no post/comment body. */
export class CommunityError extends Error {
  public readonly code: CommunityErrorCode;
  public readonly details: Readonly<Record<string, string | number>>;

  public constructor(
    code: CommunityErrorCode,
    message: string,
    details: Readonly<Record<string, string | number>> = {},
  ) {
    super(message);
    this.name = 'CommunityError';
    this.code = code;
    this.details = details;
  }
}

export class CommunityAuthorizationError extends CommunityError {
  public constructor(code: Extract<CommunityErrorCode, 'FORBIDDEN' | 'BLOCKED' | 'ENTITLEMENT_REQUIRED'> = 'FORBIDDEN') {
    super(
      code,
      code === 'ENTITLEMENT_REQUIRED'
        ? 'This action requires a Community entitlement.'
        : code === 'BLOCKED'
          ? 'This interaction is unavailable because one participant blocked the other.'
          : 'This Community resource is not available to this principal.',
    );
    this.name = 'CommunityAuthorizationError';
  }
}

export class CommunityNotFoundError extends CommunityError {
  public constructor() {
    super('NOT_FOUND', 'Community resource was not found.');
    this.name = 'CommunityNotFoundError';
  }
}

export interface CommunityRuntime {
  readonly now: () => string;
  readonly id: () => string;
}

const defaultRuntime: CommunityRuntime = {
  now: () => new Date().toISOString(),
  id: () => randomUUID(),
};

export interface CommunityEntitlementState {
  /** This value must be loaded from a trusted subscription/benefit source. */
  readonly planCode: PlanCode;
  readonly grants?: readonly BenefitGrant[];
  /** Explicit benefit grants can add a particular Founder audience without changing private visibility. */
  readonly founderAudienceGrants?: readonly FounderAudience[];
}

/**
 * This is a server-side seam. HTTP request bodies never provide a plan or a
 * benefit grant. A production implementation reads subscriptions and benefit
 * grants transactionally; the in-memory implementation is only deterministic
 * test/development storage.
 */
export interface CommunityEntitlementResolver {
  has(principal: AuthenticatedPrincipal, capability: CapabilityCode): boolean;
  canReadFounderAudience(principal: AuthenticatedPrincipal, audience: FounderAudience): boolean;
}

export class InMemoryCommunityEntitlements implements CommunityEntitlementResolver {
  private readonly states = new Map<string, CommunityEntitlementState>();
  private readonly now: () => Date;

  public constructor(options: { readonly now?: () => Date } = {}) {
    this.now = options.now ?? (() => new Date());
  }

  /** Test/server bootstrap only; callers must not expose this through consumer routes. */
  public set(userId: string, state: CommunityEntitlementState): void {
    this.states.set(userId, clone(state));
  }

  public get(userId: string): CommunityEntitlementState {
    return clone(this.states.get(userId) ?? { planCode: 'FREE' });
  }

  public has(principal: AuthenticatedPrincipal, capability: CapabilityCode): boolean {
    const state = this.get(principal.userId);
    return resolveCapabilities(state.planCode, state.grants ?? [], this.now()).has(capability);
  }

  public canReadFounderAudience(principal: AuthenticatedPrincipal, audience: FounderAudience): boolean {
    const state = this.get(principal.userId);
    if (audience === 'FOUNDER_PUBLIC') return this.has(principal, 'COMMUNITY_READ');
    if (state.founderAudienceGrants?.includes(audience) === true) return true;
    const order: readonly FounderAudience[] = [
      'FOUNDER_PUBLIC',
      'FOUNDER_FREE',
      'FOUNDER_GO',
      'FOUNDER_PLUS',
      'FOUNDER_PRO',
      'FOUNDER_PRO_MAX',
    ];
    const planAudience: Record<PlanCode, FounderAudience> = {
      FREE: 'FOUNDER_FREE',
      GO: 'FOUNDER_GO',
      PLUS: 'FOUNDER_PLUS',
      PRO: 'FOUNDER_PRO',
      PRO_MAX: 'FOUNDER_PRO_MAX',
    };
    return order.indexOf(planAudience[state.planCode]) >= order.indexOf(audience);
  }
}

/** Explicit publication bridge: no Community API may receive private original body data. */
export interface CommunitySnapshotSource {
  publish(
    principal: AuthenticatedPrincipal,
    input: {
      readonly sourceEntryId: string;
      readonly sourceRevision?: number;
      readonly selectedFieldKeys?: readonly string[];
      readonly selectedMediaIds?: readonly string[];
    },
  ): ArchivePublishedSnapshot;
  read(principal: AuthenticatedPrincipal, archiveSnapshotId: string): ArchivePublishedSnapshot;
  resolveMedia(
    principal: AuthenticatedPrincipal,
    mediaIds: readonly string[],
  ): readonly CommunityMediaReference[];
}

export interface CommunityAdminReadInput {
  readonly targetOwnerId: string;
  readonly resourceType: 'GROUP' | 'REPORT' | 'COMMUNITY';
  readonly resourceId: string;
}

export interface CommunityAdminModerationInput {
  readonly targetOwnerId: string | null;
  readonly resourceType: CommunityReportTargetType;
  readonly resourceId: string;
  readonly reason: string;
}

/**
 * Root/moderation access is an injected, server-authenticated boundary. The
 * Community domain deliberately does not trust `principal.roles`,
 * `principal.adminType`, or a client-supplied capability field.
 */
export interface CommunityAdministrationAccess {
  readPrivateGroup(principal: AuthenticatedPrincipal, input: CommunityAdminReadInput): void;
  readReports(principal: AuthenticatedPrincipal): void;
  manageOfficialChannel(principal: AuthenticatedPrincipal, input: CommunityAdminReadInput): void;
  moderate<T>(
    principal: AuthenticatedPrincipal,
    input: CommunityAdminModerationInput,
    operation: () => T,
  ): T;
}

class DenyCommunityAdministrationAccess implements CommunityAdministrationAccess {
  public readPrivateGroup(): void {
    throw new CommunityAuthorizationError();
  }

  public readReports(): void {
    throw new CommunityAuthorizationError();
  }

  public manageOfficialChannel(): void {
    throw new CommunityAuthorizationError();
  }

  public moderate<T>(): T {
    throw new CommunityError('MODERATION_REQUIRED', 'A separately authenticated moderation boundary is required.');
  }
}

export interface CommunityRateLimit {
  readonly max: number;
  readonly windowMs: number;
}

export interface CommunityRateLimiter {
  consume(principal: AuthenticatedPrincipal, action: string, limit: CommunityRateLimit): void;
}

export class InMemoryCommunityRateLimiter implements CommunityRateLimiter {
  private readonly events = new Map<string, number[]>();
  private readonly now: () => number;

  public constructor(options: { readonly now?: () => number } = {}) {
    this.now = options.now ?? (() => Date.now());
  }

  public consume(principal: AuthenticatedPrincipal, action: string, limit: CommunityRateLimit): void {
    const now = this.now();
    const key = `${principal.userId}:${action}`;
    const active = (this.events.get(key) ?? []).filter((timestamp) => now - timestamp < limit.windowMs);
    if (active.length >= limit.max) {
      throw new CommunityError('RATE_LIMITED', 'This Community action is temporarily limited.');
    }
    active.push(now);
    this.events.set(key, active);
  }
}

export interface CommunityFollowListItem extends CommunityAuthorProfile {
  readonly id: string;
  readonly followedAt: string;
}

interface StoredPost extends CommunityPost {
  readonly directShareRecipientIds: readonly string[];
  /** Trusted relationship only; it is never returned as a raw feed field. */
  readonly quotedPostId?: string | null;
}

interface CommunityRepost {
  readonly userId: string;
  readonly postId: string;
  readonly createdAt: string;
}

type StoredNotification = CommunityNotification;

interface CommunityIdempotencyReceipt {
  readonly fingerprint: string;
  readonly result: unknown;
}

interface CommunityUserState {
  readonly status: 'ACTIVE' | 'SUSPENDED' | 'BANNED';
  readonly updatedAt: string;
}

export interface CommunityStateSnapshot {
  readonly profiles: readonly CommunityProfile[];
  readonly snapshots: readonly CommunityPublishedSnapshot[];
  readonly posts: readonly StoredPost[];
  readonly reactions: readonly CommunityReaction[];
  readonly comments: readonly CommunityComment[];
  /** Optional for backwards-compatible hydration of pre-Phase-17 snapshots. */
  readonly reposts?: readonly CommunityRepost[];
  readonly saves: readonly { readonly userId: string; readonly postId: string; readonly createdAt: string }[];
  readonly follows: readonly { readonly followerId: string; readonly followedId: string; readonly createdAt: string }[];
  readonly blocks: readonly { readonly blockerId: string; readonly blockedId: string; readonly createdAt: string }[];
  readonly groups: readonly CommunityGroup[];
  readonly groupMemberships: readonly CommunityGroupMembership[];
  readonly channels: readonly CommunityChannel[];
  readonly channelMemberships: readonly CommunityChannelMembership[];
  readonly activities: readonly CommunityActivity[];
  readonly activityRegistrations: readonly CommunityActivityRegistration[];
  readonly notifications: readonly StoredNotification[];
  readonly reports: readonly CommunityReport[];
  readonly moderationCases: readonly ModerationCase[];
  readonly userStates: readonly { readonly userId: string; readonly state: CommunityUserState }[];
  readonly idempotency: readonly {
    readonly key: string;
    readonly fingerprint: string;
    readonly result: unknown;
  }[];
  readonly duplicateContent?: readonly { readonly key: string; readonly createdAt: string }[];
}

/** Durable adapters serialize this full state in one trusted transaction. */
export interface CommunityPersistence {
  read(): CommunityStateSnapshot | null;
  write(snapshot: CommunityStateSnapshot): void;
}

export class InMemoryCommunityPersistence implements CommunityPersistence {
  private snapshot: CommunityStateSnapshot | null = null;

  public read(): CommunityStateSnapshot | null {
    return this.snapshot === null ? null : clone(this.snapshot);
  }

  public write(snapshot: CommunityStateSnapshot): void {
    this.snapshot = clone(snapshot);
  }
}

interface CommunityState {
  readonly profiles: Map<string, CommunityProfile>;
  readonly snapshots: Map<string, CommunityPublishedSnapshot>;
  readonly posts: Map<string, StoredPost>;
  readonly reactions: Map<string, CommunityReaction>;
  readonly comments: Map<string, CommunityComment>;
  readonly reposts: Map<string, CommunityRepost>;
  readonly saves: Map<string, { readonly userId: string; readonly postId: string; readonly createdAt: string }>;
  readonly follows: Map<string, { readonly followerId: string; readonly followedId: string; readonly createdAt: string }>;
  readonly blocks: Map<string, { readonly blockerId: string; readonly blockedId: string; readonly createdAt: string }>;
  readonly groups: Map<string, CommunityGroup>;
  readonly groupMemberships: Map<string, CommunityGroupMembership>;
  readonly channels: Map<string, CommunityChannel>;
  readonly channelMemberships: Map<string, CommunityChannelMembership>;
  readonly activities: Map<string, CommunityActivity>;
  readonly activityRegistrations: Map<string, CommunityActivityRegistration>;
  readonly notifications: Map<string, StoredNotification>;
  readonly reports: Map<string, CommunityReport>;
  readonly moderationCases: Map<string, ModerationCase>;
  readonly userStates: Map<string, CommunityUserState>;
  readonly idempotency: Map<string, CommunityIdempotencyReceipt>;
  readonly duplicateContent: Map<string, string>;
}

function emptyState(): CommunityState {
  return {
    profiles: new Map(),
    snapshots: new Map(),
    posts: new Map(),
    reactions: new Map(),
    comments: new Map(),
    reposts: new Map(),
    saves: new Map(),
    follows: new Map(),
    blocks: new Map(),
    groups: new Map(),
    groupMemberships: new Map(),
    channels: new Map(),
    channelMemberships: new Map(),
    activities: new Map(),
    activityRegistrations: new Map(),
    notifications: new Map(),
    reports: new Map(),
    moderationCases: new Map(),
    userStates: new Map(),
    idempotency: new Map(),
    duplicateContent: new Map(),
  };
}

export interface CommunityServiceOptions {
  readonly persistence?: CommunityPersistence;
  readonly runtime?: Partial<CommunityRuntime>;
  readonly entitlements?: CommunityEntitlementResolver;
  readonly snapshotSource?: CommunitySnapshotSource;
  readonly administration?: CommunityAdministrationAccess;
  readonly rateLimiter?: CommunityRateLimiter;
}

export interface CommunityPostCreateInput {
  readonly body?: string | null;
  /** Media is passed by opaque id and re-authorized server-side. */
  readonly mediaIds?: readonly string[];
  readonly archiveSnapshotId?: string | null;
  readonly groupId?: string | null;
  readonly channelId?: string | null;
  readonly activityId?: string | null;
  readonly visibility?: CommunityVisibility;
  readonly directShareRecipientIds?: readonly string[];
  readonly idempotencyKey?: string;
}

export interface CommunityPostPatchInput {
  readonly body?: string | null;
  readonly mediaIds?: readonly string[];
  readonly idempotencyKey?: string;
}

export interface CommunityGroupCreateInput {
  readonly name: string;
  readonly description?: string | null;
  readonly avatarMediaId?: string | null;
  readonly coverMediaId?: string | null;
  readonly visibility?: CommunityGroupVisibility;
  readonly idempotencyKey?: string;
}

export interface CommunityChannelCreateInput {
  readonly type: CommunityChannel['type'];
  readonly slug: string;
  readonly name: string;
  readonly description?: string | null;
  readonly visibility?: CommunityVisibility;
  readonly founderAudience?: FounderAudience | null;
  readonly idempotencyKey?: string;
}

export interface CommunityChannelPostCreateInput {
  readonly body?: string | null;
  readonly mediaIds?: readonly string[];
  readonly archiveSnapshotId?: string | null;
  readonly visibility?: CommunityVisibility;
  /** Accepted only after `manageOfficialChannel` authorizes a Founder/Admin boundary. */
  readonly founderAudience?: FounderAudience | null;
  readonly idempotencyKey?: string;
}

export interface CommunityActivityCreateInput {
  readonly groupId?: string | null;
  readonly channelId?: string | null;
  readonly kind: CommunityActivityKind;
  readonly title: string;
  readonly description?: string | null;
  readonly startAt: string;
  readonly endAt?: string | null;
  readonly timezone: string;
  readonly locationText?: string | null;
  readonly onlineUrl?: string | null;
  readonly capacity?: number | null;
  readonly visibility?: CommunityVisibility;
  readonly founderAudience?: FounderAudience | null;
  readonly idempotencyKey?: string;
}

export interface CommunityPageOptions {
  readonly cursor?: string;
  readonly limit?: number;
}

export interface CommunityReportCreateInput {
  readonly targetType: CommunityReportTargetType;
  readonly targetId: string;
  readonly reason: CommunityReportReason;
  readonly details?: string | null;
  readonly idempotencyKey?: string;
}

export interface CommunityModerationInput {
  readonly action: ModerationActionType;
  readonly reason: string;
}

function clone<T>(value: T): T {
  return structuredClone(value);
}

function mapKey(...parts: readonly string[]): string {
  return parts.join(':');
}

function jsonFingerprint(value: unknown): string {
  return JSON.stringify(value) ?? '';
}

function nowDate(value: string, field: string): void {
  if (!Number.isFinite(Date.parse(value))) {
    throw new CommunityError('VALIDATION', `${field} must be an ISO timestamp.`);
  }
}

function boundedLimit(value: number | undefined, fallback = 20): number {
  if (value === undefined) return fallback;
  if (!Number.isSafeInteger(value) || value < 1 || value > 100) {
    throw new CommunityError('VALIDATION', 'limit must be an integer between 1 and 100.');
  }
  return value;
}

function normalizedContentHash(value: string): string {
  const normalized = value.trim().replace(/\s+/gu, ' ').toLocaleLowerCase();
  let hash = 2166136261;
  for (let index = 0; index < normalized.length; index += 1) {
    hash ^= normalized.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return (hash >>> 0).toString(16).padStart(8, '0');
}

function encodeCursor(item: { readonly createdAt: string; readonly id: string }): string {
  return Buffer.from(JSON.stringify(item), 'utf8').toString('base64url');
}

function decodeCursor(cursor: string): { readonly createdAt: string; readonly id: string } {
  try {
    const decoded = JSON.parse(Buffer.from(cursor, 'base64url').toString('utf8')) as unknown;
    if (
      decoded === null ||
      typeof decoded !== 'object' ||
      typeof (decoded as { createdAt?: unknown }).createdAt !== 'string' ||
      typeof (decoded as { id?: unknown }).id !== 'string'
    ) {
      throw new Error('malformed cursor');
    }
    return decoded as { readonly createdAt: string; readonly id: string };
  } catch {
    throw new CommunityError('VALIDATION', 'cursor is invalid.');
  }
}

function sortByTimeDesc<T extends { readonly createdAt: string; readonly id: string }>(items: readonly T[]): T[] {
  return [...items].sort(
    (left, right) =>
      right.createdAt.localeCompare(left.createdAt) || right.id.localeCompare(left.id),
  );
}

function paginate<T extends { readonly createdAt: string; readonly id: string }>(
  values: readonly T[],
  options: CommunityPageOptions = {},
): CommunityCursorPage<T> {
  const limit = boundedLimit(options.limit);
  const cursor = options.cursor === undefined ? undefined : decodeCursor(options.cursor);
  const start =
    cursor === undefined
      ? 0
      : values.findIndex(
            (item) => item.createdAt === cursor.createdAt && item.id === cursor.id,
          ) + 1;
  if (cursor !== undefined && start === 0) {
    throw new CommunityError('VALIDATION', 'cursor does not refer to this result set.');
  }
  const items = values.slice(start, start + limit);
  const next = values[start + limit];
  return {
    items: items.map(clone),
    nextCursor: next === undefined ? null : encodeCursor(items[items.length - 1]!),
    hasMore: next !== undefined,
  };
}

/**
 * Community aggregate service. It is intentionally transport-free: every
 * mutation is scoped to an authenticated principal, every access decision is
 * evaluated against trusted entitlement/membership state, and persistence is
 * behind an adapter seam. No method ever scans a private Archive record.
 */
export class CommunityService {
  private readonly state: CommunityState;
  private readonly persistence: CommunityPersistence | undefined;
  private readonly runtime: CommunityRuntime;
  private readonly entitlements: CommunityEntitlementResolver;
  private readonly snapshotSource: CommunitySnapshotSource | undefined;
  private readonly administration: CommunityAdministrationAccess;
  private readonly rateLimiter: CommunityRateLimiter;

  public constructor(options: CommunityServiceOptions = {}) {
    this.persistence = options.persistence;
    this.runtime = { ...defaultRuntime, ...options.runtime };
    this.entitlements = options.entitlements ?? new InMemoryCommunityEntitlements();
    this.snapshotSource = options.snapshotSource;
    this.administration = options.administration ?? new DenyCommunityAdministrationAccess();
    this.rateLimiter = options.rateLimiter ?? new InMemoryCommunityRateLimiter();
    this.state = this.hydrate(options.persistence?.read() ?? null);
  }

  public toSnapshot(): CommunityStateSnapshot {
    return {
      profiles: [...this.state.profiles.values()].map(clone),
      snapshots: [...this.state.snapshots.values()].map(clone),
      posts: [...this.state.posts.values()].map(clone),
      reactions: [...this.state.reactions.values()].map(clone),
      comments: [...this.state.comments.values()].map(clone),
      reposts: [...this.state.reposts.values()].map(clone),
      saves: [...this.state.saves.values()].map(clone),
      follows: [...this.state.follows.values()].map(clone),
      blocks: [...this.state.blocks.values()].map(clone),
      groups: [...this.state.groups.values()].map(clone),
      groupMemberships: [...this.state.groupMemberships.values()].map(clone),
      channels: [...this.state.channels.values()].map(clone),
      channelMemberships: [...this.state.channelMemberships.values()].map(clone),
      activities: [...this.state.activities.values()].map(clone),
      activityRegistrations: [...this.state.activityRegistrations.values()].map(clone),
      notifications: [...this.state.notifications.values()].map(clone),
      reports: [...this.state.reports.values()].map(clone),
      moderationCases: [...this.state.moderationCases.values()].map(clone),
      userStates: [...this.state.userStates.entries()].map(([userId, state]) => ({
        userId,
        state: clone(state),
      })),
      idempotency: [...this.state.idempotency.entries()].map(([key, receipt]) => ({
        key,
        fingerprint: receipt.fingerprint,
        result: clone(receipt.result),
      })),
      duplicateContent: [...this.state.duplicateContent.entries()].map(([key, createdAt]) => ({
        key,
        createdAt,
      })),
    };
  }

  private hydrate(snapshot: CommunityStateSnapshot | null): CommunityState {
    const state = emptyState();
    if (snapshot === null) return state;
    for (const value of snapshot.profiles) state.profiles.set(value.userId, clone(value));
    for (const value of snapshot.snapshots) state.snapshots.set(value.id, clone(value));
    for (const value of snapshot.posts) state.posts.set(value.id, clone(value));
    for (const value of snapshot.reactions) {
      state.reactions.set(mapKey(value.postId, value.userId, value.type), clone(value));
    }
    for (const value of snapshot.comments) state.comments.set(value.id, clone(value));
    for (const value of snapshot.reposts ?? []) {
      state.reposts.set(mapKey(value.userId, value.postId), clone(value));
    }
    for (const value of snapshot.saves) state.saves.set(mapKey(value.userId, value.postId), clone(value));
    for (const value of snapshot.follows) {
      state.follows.set(mapKey(value.followerId, value.followedId), clone(value));
    }
    for (const value of snapshot.blocks) {
      state.blocks.set(mapKey(value.blockerId, value.blockedId), clone(value));
    }
    for (const value of snapshot.groups) state.groups.set(value.id, clone(value));
    for (const value of snapshot.groupMemberships) {
      state.groupMemberships.set(mapKey(value.groupId, value.userId), clone(value));
    }
    for (const value of snapshot.channels) state.channels.set(value.id, clone(value));
    for (const value of snapshot.channelMemberships) {
      state.channelMemberships.set(mapKey(value.channelId, value.userId), clone(value));
    }
    for (const value of snapshot.activities) state.activities.set(value.id, clone(value));
    for (const value of snapshot.activityRegistrations) {
      state.activityRegistrations.set(mapKey(value.activityId, value.userId), clone(value));
    }
    for (const value of snapshot.notifications) state.notifications.set(value.id, clone(value));
    for (const value of snapshot.reports) state.reports.set(value.id, clone(value));
    for (const value of snapshot.moderationCases) state.moderationCases.set(value.id, clone(value));
    for (const value of snapshot.userStates) state.userStates.set(value.userId, clone(value.state));
    for (const value of snapshot.idempotency) {
      state.idempotency.set(value.key, { fingerprint: value.fingerprint, result: clone(value.result) });
    }
    for (const value of snapshot.duplicateContent ?? []) {
      state.duplicateContent.set(value.key, value.createdAt);
    }
    return state;
  }

  private persist(): void {
    this.persistence?.write(this.toSnapshot());
  }

  private write<T>(operation: () => T): T {
    const result = operation();
    this.persist();
    return clone(result);
  }

  private idempotent<T>(
    principal: AuthenticatedPrincipal,
    operation: string,
    key: string | undefined,
    input: unknown,
    action: () => T,
  ): T {
    if (key === undefined || key.trim() === '') return this.write(action);
    const scopedKey = mapKey(principal.userId, operation, key);
    const fingerprint = jsonFingerprint(input);
    const existing = this.state.idempotency.get(scopedKey);
    if (existing !== undefined) {
      if (existing.fingerprint !== fingerprint) {
        throw new CommunityError('IDEMPOTENCY_REPLAY', 'Idempotency key was already used with different input.');
      }
      return clone(existing.result as T);
    }
    const result = action();
    this.state.idempotency.set(scopedKey, { fingerprint, result: clone(result) });
    this.persist();
    return clone(result);
  }

  private requireCapability(principal: AuthenticatedPrincipal, capability: CapabilityCode): void {
    this.assertUserActive(principal);
    if (!this.entitlements.has(principal, capability)) {
      throw new CommunityAuthorizationError('ENTITLEMENT_REQUIRED');
    }
  }

  private assertReadCapability(principal: AuthenticatedPrincipal): void {
    this.requireCapability(principal, 'COMMUNITY_READ');
  }

  private assertUserActive(principal: AuthenticatedPrincipal): void {
    const state = this.state.userStates.get(principal.userId);
    if (state !== undefined && state.status !== 'ACTIVE') {
      throw new CommunityAuthorizationError();
    }
  }

  private groupMembership(groupId: string, userId: string): CommunityGroupMembership | undefined {
    return this.state.groupMemberships.get(mapKey(groupId, userId));
  }

  private channelMembership(channelId: string, userId: string): CommunityChannelMembership | undefined {
    return this.state.channelMemberships.get(mapKey(channelId, userId));
  }

  private isActiveGroupMember(groupId: string, userId: string): boolean {
    return this.groupMembership(groupId, userId)?.status === 'ACTIVE';
  }

  private isGroupManager(groupId: string, userId: string): boolean {
    const membership = this.groupMembership(groupId, userId);
    return (
      membership?.status === 'ACTIVE' &&
      (membership.role === 'OWNER' || membership.role === 'ADMIN')
    );
  }

  private isBlockedEitherWay(firstUserId: string, secondUserId: string): boolean {
    return (
      this.state.blocks.has(mapKey(firstUserId, secondUserId)) ||
      this.state.blocks.has(mapKey(secondUserId, firstUserId))
    );
  }

  private assertInteractionAllowed(principal: AuthenticatedPrincipal, targetUserId: string): void {
    if (principal.userId !== targetUserId && this.isBlockedEitherWay(principal.userId, targetUserId)) {
      throw new CommunityAuthorizationError('BLOCKED');
    }
  }

  private requirePost(id: string): StoredPost {
    const post = this.state.posts.get(id);
    if (post === undefined) throw new CommunityNotFoundError();
    return post;
  }

  private requireComment(id: string): CommunityComment {
    const comment = this.state.comments.get(id);
    if (comment === undefined) throw new CommunityNotFoundError();
    return comment;
  }

  private requireGroup(id: string): CommunityGroup {
    const group = this.state.groups.get(id);
    if (group === undefined || group.status === 'DELETED') throw new CommunityNotFoundError();
    return group;
  }

  private requireChannel(id: string): CommunityChannel {
    const channel = this.state.channels.get(id);
    if (channel === undefined || channel.status === 'DELETED') throw new CommunityNotFoundError();
    return channel;
  }

  private requireActivity(id: string): CommunityActivity {
    const activity = this.state.activities.get(id);
    if (activity === undefined || activity.status === 'DELETED') throw new CommunityNotFoundError();
    return activity;
  }

  private defaultProfile(userId: string): CommunityProfile {
    const now = this.runtime.now();
    return {
      userId,
      displayName: 'ME.zip member',
      avatarMediaId: null,
      profileVisibility: 'PUBLIC',
      bio: null,
      followPermission: 'EVERYONE',
      createdAt: now,
      updatedAt: now,
    };
  }

  private profileFor(userId: string): CommunityProfile {
    const profile = this.state.profiles.get(userId);
    if (profile !== undefined) return profile;
    const created = this.defaultProfile(userId);
    this.state.profiles.set(userId, created);
    return created;
  }

  private publicAuthor(userId: string): CommunityAuthorProfile {
    const profile = this.profileFor(userId);
    return {
      userId: profile.userId,
      displayName: profile.profileVisibility === 'PUBLIC' ? profile.displayName : 'ME.zip member',
      avatarMediaId: profile.profileVisibility === 'PUBLIC' ? profile.avatarMediaId : null,
      profileVisibility: profile.profileVisibility,
    };
  }

  private hasVisibleGroupAccess(principal: AuthenticatedPrincipal, group: CommunityGroup): boolean {
    if (group.ownerId === principal.userId || this.isActiveGroupMember(group.id, principal.userId)) return true;
    // FREE may browse public Community, but Groups are an interaction surface
    // and therefore require the server-derived GO+ join capability.
    if (group.visibility === 'PUBLIC' && this.entitlements.has(principal, 'GROUP_JOIN')) return true;
    try {
      this.administration.readPrivateGroup(principal, {
        targetOwnerId: group.ownerId,
        resourceType: 'GROUP',
        resourceId: group.id,
      });
      return true;
    } catch (error) {
      if (error instanceof CommunityError) return false;
      throw error;
    }
  }

  private hasVisibleChannelAccess(principal: AuthenticatedPrincipal, channel: CommunityChannel): boolean {
    if (channel.status !== 'ACTIVE') return channel.ownerId === principal.userId;
    const founderAudienceAllowed =
      channel.founderAudience === null || this.entitlements.canReadFounderAudience(principal, channel.founderAudience);
    if (!founderAudienceAllowed) return false;
    if (channel.ownerId === principal.userId || this.channelMembership(channel.id, principal.userId)?.status === 'ACTIVE') {
      return true;
    }
    if (channel.founderAudience !== null && (channel.visibility === 'PUBLIC' || channel.visibility === 'COMMUNITY')) {
      return true;
    }
    if (channel.visibility === 'PUBLIC' || channel.visibility === 'COMMUNITY') {
      return this.entitlements.has(principal, 'COMMUNITY_INTERACT');
    }
    return false;
  }

  private hasVisibleActivityAccess(principal: AuthenticatedPrincipal, activity: CommunityActivity): boolean {
    if (activity.status !== 'PUBLISHED') return activity.creatorUserId === principal.userId;
    const founderAudienceAllowed =
      activity.founderAudience === null || this.entitlements.canReadFounderAudience(principal, activity.founderAudience);
    if (!founderAudienceAllowed) return false;
    if (activity.groupId !== null) return this.hasVisibleGroupAccess(principal, this.requireGroup(activity.groupId));
    if (activity.channelId !== null) return this.hasVisibleChannelAccess(principal, this.requireChannel(activity.channelId));
    if (activity.founderAudience !== null && (activity.visibility === 'PUBLIC' || activity.visibility === 'COMMUNITY')) {
      return true;
    }
    if (activity.visibility === 'PUBLIC') return true;
    return activity.visibility === 'COMMUNITY' && this.entitlements.has(principal, 'COMMUNITY_INTERACT');
  }

  /**
   * FREE can discover explicitly PUBLIC content, while the GO (and higher)
   * Community entitlement is required for the ordinary COMMUNITY/GROUP
   * surfaces.  This check is deliberately separate from Founder audience
   * resolution and never treats a membership plan as a visibility value.
   */
  private canReadPostVisibility(principal: AuthenticatedPrincipal, visibility: CommunityVisibility): boolean {
    switch (visibility) {
      case 'PUBLIC':
        return this.entitlements.has(principal, 'COMMUNITY_READ');
      case 'DIRECT_SHARE':
        return this.entitlements.has(principal, 'COMMUNITY_READ');
      case 'COMMUNITY':
        return this.entitlements.has(principal, 'COMMUNITY_INTERACT');
      case 'GROUP':
        return this.entitlements.has(principal, 'GROUP_JOIN');
      default:
        return false;
    }
  }

  private canViewPost(principal: AuthenticatedPrincipal, post: StoredPost): boolean {
    if (post.authorId === principal.userId) return post.status !== 'DELETED';
    if (post.status !== 'PUBLISHED') return false;
    if (this.isBlockedEitherWay(principal.userId, post.authorId)) return false;
    if (!this.canReadPostVisibility(principal, post.visibility)) return false;
    const founderAudienceAllowed =
      post.founderAudience === null || this.entitlements.canReadFounderAudience(principal, post.founderAudience);
    if (!founderAudienceAllowed) return false;
    if (post.groupId !== null && !this.hasVisibleGroupAccess(principal, this.requireGroup(post.groupId))) return false;
    if (post.channelId !== null && !this.hasVisibleChannelAccess(principal, this.requireChannel(post.channelId))) return false;
    if (post.activityId !== null && !this.hasVisibleActivityAccess(principal, this.requireActivity(post.activityId))) return false;
    if (post.visibility === 'DIRECT_SHARE') {
      return post.directShareRecipientIds.includes(principal.userId)
        && this.entitlements.has(principal, 'COMMUNITY_INTERACT');
    }
    if (post.founderAudience !== null && (post.visibility === 'PUBLIC' || post.visibility === 'COMMUNITY')) return true;
    if (post.visibility === 'PUBLIC') return true;
    if (post.visibility === 'COMMUNITY') return this.entitlements.has(principal, 'COMMUNITY_INTERACT');
    return post.visibility === 'GROUP' && post.groupId !== null;
  }

  private snapshotPreviewForPost(post: StoredPost): CommunitySnapshotPreview | null {
    const publishedSnapshot = post.publishedSnapshotId === null
      ? null
      : this.state.snapshots.get(post.publishedSnapshotId) ?? null;
    const snapshotContent = publishedSnapshot?.snapshotContent;
    return publishedSnapshot === null
      ? null
      : {
          id: publishedSnapshot.id,
          sourceType: 'LIFE',
          sourceRevision: publishedSnapshot.sourceRevision,
          title: typeof snapshotContent?.title === 'string' ? snapshotContent.title : null,
          excerpt: typeof snapshotContent?.body === 'string'
            ? snapshotContent.body
            : typeof snapshotContent?.excerpt === 'string'
              ? snapshotContent.excerpt
              : null,
        };
  }

  /** Re-checking this at projection time prevents quote envelopes leaking stale source text. */
  private quotePreviewFor(principal: AuthenticatedPrincipal, post: StoredPost): CommunityQuotePreview | null {
    const sourceId = post.quotedPostId ?? null;
    if (sourceId === null) return null;
    const source = this.state.posts.get(sourceId);
    if (source === undefined || !this.canViewPost(principal, source)) return { state: 'UNAVAILABLE' };
    return {
      state: 'AVAILABLE',
      post: {
        id: source.id,
        author: this.publicAuthor(source.authorId),
        body: source.body,
        snapshot: this.snapshotPreviewForPost(source),
        createdAt: source.createdAt,
      },
    };
  }

  private repostCount(postId: string): number {
    return [...this.state.reposts.values()].filter((row) => row.postId === postId).length;
  }

  private repostAttribution(
    principal: AuthenticatedPrincipal,
    postId: string,
    followingOnly: boolean,
  ): CommunityRepostAttribution | null {
    const rows = [...this.state.reposts.values()]
      .filter(
        (row) =>
          row.postId === postId &&
          !this.isBlockedEitherWay(principal.userId, row.userId) &&
          (!followingOnly || this.state.follows.has(mapKey(principal.userId, row.userId))),
      )
      .sort((left, right) => right.createdAt.localeCompare(left.createdAt));
    const latest = rows[0];
    return latest === undefined
      ? null
      : { author: this.publicAuthor(latest.userId), repostedAt: latest.createdAt };
  }

  private projectPost(
    principal: AuthenticatedPrincipal,
    post: StoredPost,
    repostedBy: CommunityRepostAttribution | null = null,
  ): CommunityFeedItem {
    const reactionCount = [...this.state.reactions.values()].filter((item) => item.postId === post.id).length;
    const commentCount = [...this.state.comments.values()].filter(
      (item) => item.postId === post.id && item.status === 'PUBLISHED',
    ).length;
    const { directShareRecipientIds, quotedPostId, ...safePost } = post;
    void directShareRecipientIds;
    void quotedPostId;
    return {
      ...safePost,
      reactionCount,
      commentCount,
      snapshot: this.snapshotPreviewForPost(post),
      quote: this.quotePreviewFor(principal, post),
      repostCount: this.repostCount(post.id),
      repostedBy,
      author: this.publicAuthor(post.authorId),
      viewer: {
        reacted: this.state.reactions.has(mapKey(post.id, principal.userId, 'LIKE')),
        saved: this.state.saves.has(mapKey(principal.userId, post.id)),
        followingAuthor: this.state.follows.has(mapKey(principal.userId, post.authorId)),
        reposted: this.state.reposts.has(mapKey(principal.userId, post.id)),
      },
      context:
        post.groupId !== null
          ? 'GROUP'
          : post.channelId !== null
            ? 'CHANNEL'
            : post.activityId !== null
              ? 'ACTIVITY'
              : 'COMMUNITY',
    };
  }

  public updateProfile(
    principal: AuthenticatedPrincipal,
    patch: {
      readonly displayName?: string;
      readonly avatarMediaId?: string | null;
      readonly bio?: string | null;
      readonly profileVisibility?: 'PUBLIC' | 'PRIVATE';
      readonly followPermission?: 'EVERYONE' | 'NOBODY';
    },
  ): CommunityProfile {
    this.assertUserActive(principal);
    if (patch.displayName !== undefined && patch.displayName.trim().length === 0) {
      throw new CommunityError('VALIDATION', 'displayName cannot be empty.');
    }
    if (patch.displayName !== undefined && patch.displayName.length > 120) {
      throw new CommunityError('VALIDATION', 'displayName exceeds 120 characters.');
    }
    if (patch.bio !== undefined && patch.bio !== null && patch.bio.length > 1_000) {
      throw new CommunityError('VALIDATION', 'bio exceeds 1,000 characters.');
    }
    const avatarMediaId =
      patch.avatarMediaId === undefined || patch.avatarMediaId === null
        ? patch.avatarMediaId
        : this.resolveImageMedia(principal, patch.avatarMediaId, 'avatarMediaId');
    return this.write(() => {
      const existing = this.profileFor(principal.userId);
      const updated: CommunityProfile = {
        ...existing,
        ...(patch.displayName === undefined ? {} : { displayName: patch.displayName.trim() }),
        ...(avatarMediaId === undefined ? {} : { avatarMediaId }),
        ...(patch.bio === undefined ? {} : { bio: patch.bio }),
        ...(patch.profileVisibility === undefined ? {} : { profileVisibility: patch.profileVisibility }),
        ...(patch.followPermission === undefined ? {} : { followPermission: patch.followPermission }),
        updatedAt: this.runtime.now(),
      };
      this.state.profiles.set(principal.userId, updated);
      return updated;
    });
  }

  public getProfile(principal: AuthenticatedPrincipal, userId: string): CommunityProfile {
    this.assertReadCapability(principal);
    const profile = this.profileFor(userId);
    if (profile.userId !== principal.userId && profile.profileVisibility !== 'PUBLIC') {
      throw new CommunityNotFoundError();
    }
    return clone(profile);
  }

  /**
   * Explicitly makes an immutable Archive publication usable by Community. The
   * source bridge validates ownership before the projection is copied here.
   */
  public publishSnapshot(
    principal: AuthenticatedPrincipal,
    input: {
      readonly sourceEntryId: string;
      readonly sourceRevision?: number;
      readonly selectedFieldKeys?: readonly string[];
      readonly selectedMediaIds?: readonly string[];
      readonly target?: {
        readonly visibility?: CommunityVisibility;
        readonly groupId?: string | null;
        readonly channelId?: string | null;
      };
      readonly visibility?: CommunityVisibility;
      readonly idempotencyKey?: string;
    },
  ): CommunitySnapshotPublication {
    this.requireCapability(principal, 'COMMUNITY_PUBLISH');
    if (this.snapshotSource === undefined) {
      throw new CommunityError('INVALID_STATE', 'Archive snapshot publishing is not connected.');
    }
    const visibility = input.target?.visibility ?? input.visibility ?? 'COMMUNITY';
    if (visibility === 'DIRECT_SHARE') {
      throw new CommunityError('VALIDATION', 'Direct-share snapshots require an explicit recipient flow.');
    }
    const targetGroupId = input.target?.groupId ?? null;
    const targetChannelId = input.target?.channelId ?? null;
    if (targetGroupId !== null && targetChannelId !== null) {
      throw new CommunityError('VALIDATION', 'A snapshot can target one Community destination at a time.');
    }
    if (targetGroupId !== null && visibility !== 'GROUP') {
      throw new CommunityError('VALIDATION', 'A Group snapshot must use GROUP visibility.');
    }
    if (targetGroupId !== null) {
      const group = this.requireGroup(targetGroupId);
      if (!this.isActiveGroupMember(group.id, principal.userId)) throw new CommunityAuthorizationError();
    }
    if (targetChannelId !== null) {
      const channel = this.requireChannel(targetChannelId);
      if (channel.type === 'OFFICIAL' || channel.type === 'DEVELOPER') {
        this.administration.manageOfficialChannel(principal, {
          targetOwnerId: channel.ownerId,
          resourceType: 'COMMUNITY',
          resourceId: channel.id,
        });
      } else if (!this.hasVisibleChannelAccess(principal, channel)) {
        throw new CommunityAuthorizationError();
      }
    }
    return this.idempotent(principal, 'snapshot.publish', input.idempotencyKey, input, () => {
      this.rateLimiter.consume(principal, 'snapshot.publish', { max: 20, windowMs: 60 * 60 * 1_000 });
      // Resolve media before asking Archive to materialize its immutable
      // projection, so a bad/unauthorized media reference cannot leave an
      // orphaned Archive snapshot behind.
      const snapshotMedia = this.resolveMedia(principal, input.selectedMediaIds ?? []);
      const source = this.snapshotSource!.publish(principal, {
        sourceEntryId: input.sourceEntryId,
        ...(input.sourceRevision === undefined ? {} : { sourceRevision: input.sourceRevision }),
        ...(input.selectedFieldKeys === undefined
          ? {}
          : { selectedFieldKeys: [...input.selectedFieldKeys] }),
        ...(input.selectedMediaIds === undefined
          ? {}
          : { selectedMediaIds: [...input.selectedMediaIds] }),
      });
      const now = this.runtime.now();
      const snapshot: CommunityPublishedSnapshot = {
        id: this.runtime.id(),
        archiveSnapshotId: source.id,
        ownerId: source.ownerId,
        sourceType: 'LIFE_ENTRY',
        sourceId: source.sourceEntryId,
        sourceRevision: source.sourceRevision,
        snapshotContent: clone(source.selectedContent),
        snapshotMedia,
        visibility,
        status: 'PUBLISHED',
        publishedAt: now,
        updatedAt: now,
      };
      this.state.snapshots.set(snapshot.id, snapshot);
      const post: StoredPost = {
        id: this.runtime.id(),
        authorId: principal.userId,
        publishedSnapshotId: snapshot.id,
        groupId: targetGroupId,
        channelId: targetChannelId,
        activityId: null,
        body: null,
        media: snapshot.snapshotMedia,
        visibility,
        founderAudience: null,
        status: 'PUBLISHED',
        reactionCount: 0,
        commentCount: 0,
        createdAt: now,
        updatedAt: now,
        deletedAt: null,
        directShareRecipientIds: [],
      };
      this.state.posts.set(post.id, post);
      return { snapshot, post: this.projectPost(principal, post) };
    });
  }

  private resolveArchiveSnapshot(principal: AuthenticatedPrincipal, archiveSnapshotId: string): CommunityPublishedSnapshot {
    const existing = [...this.state.snapshots.values()].find(
      (item) => item.archiveSnapshotId === archiveSnapshotId && item.ownerId === principal.userId,
    );
    if (existing !== undefined && existing.status === 'PUBLISHED') return existing;
    if (this.snapshotSource === undefined) {
      throw new CommunityError('INVALID_STATE', 'Archive snapshot reading is not connected.');
    }
    const archiveSnapshot = this.snapshotSource.read(principal, archiveSnapshotId);
    if (archiveSnapshot.revokedAt !== null) throw new CommunityNotFoundError();
    const now = this.runtime.now();
    const materialized: CommunityPublishedSnapshot = {
      id: this.runtime.id(),
      archiveSnapshotId: archiveSnapshot.id,
      ownerId: archiveSnapshot.ownerId,
      sourceType: 'LIFE_ENTRY',
      sourceId: archiveSnapshot.sourceEntryId,
      sourceRevision: archiveSnapshot.sourceRevision,
      snapshotContent: clone(archiveSnapshot.selectedContent),
      snapshotMedia: [],
      visibility: 'COMMUNITY',
      status: 'PUBLISHED',
      publishedAt: archiveSnapshot.createdAt,
      updatedAt: now,
    };
    this.state.snapshots.set(materialized.id, materialized);
    return materialized;
  }

  public createPost(principal: AuthenticatedPrincipal, input: CommunityPostCreateInput): CommunityPost {
    this.requireCapability(principal, 'COMMUNITY_PUBLISH');
    const body = input.body?.trim() ?? null;
    const media = this.resolveMedia(principal, input.mediaIds ?? []);
    if (body === null && media.length === 0 && (input.archiveSnapshotId === undefined || input.archiveSnapshotId === null)) {
      throw new CommunityError('VALIDATION', 'A Community post needs text, media, or an explicit snapshot.');
    }
    if (body !== null && body.length > 50_000) {
      throw new CommunityError('VALIDATION', 'Post text exceeds 50,000 characters.');
    }
    if (media.length > 12) throw new CommunityError('VALIDATION', 'A post supports at most 12 media references.');
    const visibility = input.visibility ?? (input.groupId === undefined || input.groupId === null ? 'COMMUNITY' : 'GROUP');
    if (input.groupId !== undefined && input.groupId !== null && visibility !== 'GROUP') {
      throw new CommunityError('VALIDATION', 'A group post must use GROUP visibility.');
    }
    // IDs remain opaque at this domain seam (development fixtures need not be
    // UUID-shaped). The HTTP schema and durable FK/recipient relation perform
    // transport/identity existence validation before persistence.
    const normalizedRecipientIds = (input.directShareRecipientIds ?? []).map((userId) => userId.trim());
    if (new Set(normalizedRecipientIds).size !== normalizedRecipientIds.length) {
      throw new CommunityError('VALIDATION', 'Direct-share recipients must be unique.');
    }
    const directShareRecipientIds = normalizedRecipientIds;
    if (visibility === 'DIRECT_SHARE' && directShareRecipientIds.length === 0) {
      throw new CommunityError('VALIDATION', 'Direct share requires at least one explicit recipient.');
    }
    if (visibility !== 'DIRECT_SHARE' && directShareRecipientIds.length > 0) {
      throw new CommunityError('VALIDATION', 'Recipients are only valid for direct-share posts.');
    }
    if (directShareRecipientIds.some((userId) => userId === principal.userId)) {
      throw new CommunityError('VALIDATION', 'A direct-share post cannot target its author.');
    }
    if (directShareRecipientIds.length > 100) {
      throw new CommunityError('VALIDATION', 'A direct-share post supports at most 100 recipients.');
    }
    return this.idempotent(principal, 'post.create', input.idempotencyKey, input, () => {
      this.rateLimiter.consume(principal, 'post.create', { max: 10, windowMs: 60 * 60 * 1_000 });
      if (body !== null) this.assertNotDuplicateContent(principal, 'post', body);
      if (input.groupId !== undefined && input.groupId !== null) {
        const group = this.requireGroup(input.groupId);
        if (group.status !== 'ACTIVE' || !this.isActiveGroupMember(group.id, principal.userId)) {
          throw new CommunityAuthorizationError();
        }
      }
      if (input.channelId !== undefined && input.channelId !== null) {
        const channel = this.requireChannel(input.channelId);
        if (channel.type === 'OFFICIAL' || channel.type === 'DEVELOPER') {
          this.administration.manageOfficialChannel(principal, {
            targetOwnerId: channel.ownerId,
            resourceType: 'COMMUNITY',
            resourceId: channel.id,
          });
        } else if (!this.hasVisibleChannelAccess(principal, channel)) {
          throw new CommunityAuthorizationError();
        }
      }
      if (input.activityId !== undefined && input.activityId !== null) {
        const activity = this.requireActivity(input.activityId);
        if (!this.hasVisibleActivityAccess(principal, activity)) throw new CommunityNotFoundError();
      }
      const snapshot =
        input.archiveSnapshotId === undefined || input.archiveSnapshotId === null
          ? null
          : this.resolveArchiveSnapshot(principal, input.archiveSnapshotId);
      const now = this.runtime.now();
      const post: StoredPost = {
        id: this.runtime.id(),
        authorId: principal.userId,
        publishedSnapshotId: snapshot?.id ?? null,
        groupId: input.groupId ?? null,
        channelId: input.channelId ?? null,
        activityId: input.activityId ?? null,
        body,
        media,
        visibility,
        founderAudience: null,
        status: 'PUBLISHED',
        reactionCount: 0,
        commentCount: 0,
        createdAt: now,
        updatedAt: now,
        deletedAt: null,
        directShareRecipientIds,
        quotedPostId: null,
      };
      this.state.posts.set(post.id, post);
      return this.safePost(post);
    });
  }

  public getPost(principal: AuthenticatedPrincipal, postId: string): CommunityFeedItem {
    this.assertReadCapability(principal);
    const post = this.requirePost(postId);
    if (!this.canViewPost(principal, post)) throw new CommunityNotFoundError();
    return this.projectPost(principal, post);
  }

  /** Only ordinary published Social posts may be redistributed by Phase 17. */
  private assertShareablePost(principal: AuthenticatedPrincipal, post: StoredPost): void {
    this.assertInteractionAllowed(principal, post.authorId);
    if (!this.canViewPost(principal, post)) throw new CommunityNotFoundError();
    if (
      (post.visibility !== 'PUBLIC' && post.visibility !== 'COMMUNITY') ||
      post.groupId !== null ||
      post.channelId !== null ||
      post.activityId !== null ||
      post.founderAudience !== null
    ) {
      throw new CommunityAuthorizationError();
    }
  }

  /** A Quote owns commentary plus a trusted original-post relation; no source body is copied. */
  public createQuote(
    principal: AuthenticatedPrincipal,
    originalPostId: string,
    commentary: string | null | undefined,
    idempotencyKey?: string,
  ): CommunityFeedItem {
    this.requireCapability(principal, 'COMMUNITY_PUBLISH');
    const body = commentary?.trim() || null;
    if (body !== null && body.length > 50_000) {
      throw new CommunityError('VALIDATION', 'Quote commentary exceeds 50,000 characters.');
    }
    return this.idempotent(principal, 'quote.create', idempotencyKey, { originalPostId, body }, () => {
      this.rateLimiter.consume(principal, 'quote.create', { max: 20, windowMs: 60 * 60 * 1_000 });
      const original = this.requirePost(originalPostId);
      this.assertShareablePost(principal, original);
      this.assertNotDuplicateContent(principal, 'quote', `${original.id}:${body ?? ''}`);
      const now = this.runtime.now();
      const quote: StoredPost = {
        id: this.runtime.id(),
        authorId: principal.userId,
        publishedSnapshotId: null,
        groupId: null,
        channelId: null,
        activityId: null,
        body,
        media: [],
        visibility: original.visibility,
        founderAudience: null,
        status: 'PUBLISHED',
        reactionCount: 0,
        commentCount: 0,
        createdAt: now,
        updatedAt: now,
        deletedAt: null,
        directShareRecipientIds: [],
        quotedPostId: original.id,
      };
      this.state.posts.set(quote.id, quote);
      this.notify(original.authorId, principal.userId, 'QUOTE', 'POST', quote.id, 'community.quote');
      return this.projectPost(principal, quote);
    });
  }

  public updatePost(
    principal: AuthenticatedPrincipal,
    postId: string,
    input: CommunityPostPatchInput,
  ): CommunityPost {
    this.assertUserActive(principal);
    const body = input.body === undefined ? undefined : input.body?.trim() ?? null;
    if (body !== undefined && body !== null && body.length > 50_000) {
      throw new CommunityError('VALIDATION', 'Post text exceeds 50,000 characters.');
    }
    return this.idempotent(principal, 'post.update', input.idempotencyKey, { postId, input }, () => {
      const existing = this.requirePost(postId);
      if (existing.authorId !== principal.userId) throw new CommunityAuthorizationError();
      if (existing.status !== 'PUBLISHED' && existing.status !== 'DRAFT') {
        throw new CommunityError('INVALID_STATE', 'This post cannot be edited in its current state.');
      }
      const media =
        input.mediaIds === undefined
          ? existing.media
          : this.resolveMedia(principal, input.mediaIds);
      const nextBody = body === undefined ? existing.body : body;
      if (nextBody === null && media.length === 0 && existing.publishedSnapshotId === null) {
        throw new CommunityError('VALIDATION', 'A Community post cannot be empty.');
      }
      const updated: StoredPost = {
        ...existing,
        body: nextBody,
        media,
        updatedAt: this.runtime.now(),
      };
      this.state.posts.set(updated.id, updated);
      return this.safePost(updated);
    });
  }

  public deletePost(principal: AuthenticatedPrincipal, postId: string, idempotencyKey?: string): CommunityPost {
    this.assertUserActive(principal);
    return this.idempotent(principal, 'post.delete', idempotencyKey, { postId }, () => {
      const existing = this.requirePost(postId);
      if (existing.authorId !== principal.userId) throw new CommunityAuthorizationError();
      if (existing.status === 'DELETED') return this.safePost(existing);
      const updated: StoredPost = {
        ...existing,
        status: 'DELETED',
        deletedAt: this.runtime.now(),
        updatedAt: this.runtime.now(),
      };
      this.state.posts.set(updated.id, updated);
      return this.safePost(updated);
    });
  }

  public getFeed(
    principal: AuthenticatedPrincipal,
    mode: CommunityFeedMode = 'DISCOVER',
    options: CommunityPageOptions = {},
  ): CommunityFeedPage {
    this.assertReadCapability(principal);
    const visible = [...this.state.posts.values()].filter((post) => this.canViewPost(principal, post));
    const candidates =
      mode === 'FOLLOWING'
        ? visible.filter(
            (post) =>
              this.state.follows.has(mapKey(principal.userId, post.authorId)) ||
              this.repostAttribution(principal, post.id, true) !== null,
          )
        : visible;
    const sorted =
      mode === 'DISCOVER'
        ? [...candidates].sort(
            (left, right) =>
              this.engagementScore(right) - this.engagementScore(left) ||
              right.createdAt.localeCompare(left.createdAt) ||
              right.id.localeCompare(left.id),
          )
        : sortByTimeDesc(candidates);
    const page = paginate(sorted, options);
    return {
      mode,
      ranking:
        mode === 'DISCOVER'
          ? {
              strategy: 'RECENT_ENGAGEMENT',
              factors: ['visible_to_viewer', 'block_filter', 'reaction_count', 'comment_count', 'repost_count', 'published_at'],
            }
          : {
              strategy: 'CHRONOLOGICAL',
              factors: ['visible_to_viewer', 'block_filter', 'published_at'],
            },
      items: page.items.map((post) =>
        this.projectPost(
          principal,
          post as StoredPost,
          this.repostAttribution(principal, post.id, mode === 'FOLLOWING'),
        ),
      ),
      nextCursor: page.nextCursor,
      hasMore: page.hasMore,
    };
  }

  private safePost(post: StoredPost): CommunityPost {
    const { directShareRecipientIds, quotedPostId, ...safe } = post;
    void directShareRecipientIds;
    void quotedPostId;
    return clone({
      ...safe,
      reactionCount: [...this.state.reactions.values()].filter((item) => item.postId === post.id).length,
      commentCount: [...this.state.comments.values()].filter(
        (item) => item.postId === post.id && item.status === 'PUBLISHED',
      ).length,
    });
  }

  private engagementScore(post: StoredPost): number {
    const reactions = [...this.state.reactions.values()].filter((item) => item.postId === post.id).length;
    const comments = [...this.state.comments.values()].filter(
      (item) => item.postId === post.id && item.status === 'PUBLISHED',
    ).length;
    return reactions + comments * 2 + this.repostCount(post.id) * 2;
  }

  private assertNotDuplicateContent(principal: AuthenticatedPrincipal, kind: string, body: string): void {
    const hash = normalizedContentHash(body);
    const key = mapKey(principal.userId, kind, hash);
    const now = this.runtime.now();
    const prior = this.state.duplicateContent.get(key);
    if (prior !== undefined && Date.parse(now) - Date.parse(prior) < 5 * 60 * 1_000) {
      throw new CommunityError('CONFLICT', 'A matching Community submission was recently created.');
    }
    this.state.duplicateContent.set(key, now);
  }

  private resolveMedia(
    principal: AuthenticatedPrincipal,
    mediaIds: readonly string[],
  ): readonly CommunityMediaReference[] {
    const uniqueMediaIds = [...new Set(mediaIds)];
    if (uniqueMediaIds.length > 12) {
      throw new CommunityError('VALIDATION', 'A Community post supports at most 12 media references.');
    }
    if (uniqueMediaIds.length === 0) return [];
    if (this.snapshotSource === undefined) {
      throw new CommunityError('INVALID_STATE', 'Authorized Community media resolution is not connected.');
    }
    const resolved = this.snapshotSource.resolveMedia(principal, uniqueMediaIds).map(clone);
    if (resolved.length !== uniqueMediaIds.length || !resolved.every((media) => uniqueMediaIds.includes(media.mediaId))) {
      throw new CommunityAuthorizationError();
    }
    return resolved;
  }

  /** Profile/group artwork is image-only and is always re-authorized by the archive seam. */
  private resolveImageMedia(principal: AuthenticatedPrincipal, mediaId: string, field: string): string {
    const [media] = this.resolveMedia(principal, [mediaId]);
    if (media === undefined || media.kind !== 'IMAGE') {
      throw new CommunityError('VALIDATION', `${field} must reference a ready image owned by this principal.`);
    }
    return media.mediaId;
  }

  public addReaction(
    principal: AuthenticatedPrincipal,
    postId: string,
    type: 'LIKE' = 'LIKE',
    idempotencyKey?: string,
  ): CommunityReaction {
    this.requireCapability(principal, 'COMMUNITY_INTERACT');
    return this.idempotent(principal, 'reaction.add', idempotencyKey, { postId, type }, () => {
      this.rateLimiter.consume(principal, 'reaction.add', { max: 60, windowMs: 60 * 60 * 1_000 });
      const post = this.requirePost(postId);
      this.assertInteractionAllowed(principal, post.authorId);
      if (!this.canViewPost(principal, post)) throw new CommunityNotFoundError();
      const key = mapKey(postId, principal.userId, type);
      const existing = this.state.reactions.get(key);
      if (existing !== undefined) return existing;
      const reaction: CommunityReaction = {
        postId,
        userId: principal.userId,
        type,
        createdAt: this.runtime.now(),
      };
      this.state.reactions.set(key, reaction);
      this.notify(post.authorId, principal.userId, 'REACTION', 'POST', postId, 'community.reaction');
      return reaction;
    });
  }

  public removeReaction(
    principal: AuthenticatedPrincipal,
    postId: string,
    type: 'LIKE' = 'LIKE',
    idempotencyKey?: string,
  ): { readonly removed: boolean } {
    this.requireCapability(principal, 'COMMUNITY_INTERACT');
    return this.idempotent(principal, 'reaction.remove', idempotencyKey, { postId, type }, () => {
      const post = this.requirePost(postId);
      if (post.authorId !== principal.userId && !this.canViewPost(principal, post)) {
        throw new CommunityNotFoundError();
      }
      const removed = this.state.reactions.delete(mapKey(postId, principal.userId, type));
      return { removed };
    });
  }

  public toggleReaction(
    principal: AuthenticatedPrincipal,
    postId: string,
    type: 'LIKE' = 'LIKE',
    idempotencyKey?: string,
  ): { readonly active: boolean; readonly reaction: CommunityReaction | null } {
    this.requireCapability(principal, 'COMMUNITY_INTERACT');
    return this.idempotent(principal, 'reaction.toggle', idempotencyKey, { postId, type }, () => {
      const post = this.requirePost(postId);
      this.assertInteractionAllowed(principal, post.authorId);
      if (!this.canViewPost(principal, post)) throw new CommunityNotFoundError();
      const key = mapKey(postId, principal.userId, type);
      const existing = this.state.reactions.get(key);
      if (existing !== undefined) {
        this.state.reactions.delete(key);
        return { active: false, reaction: null };
      }
      const reaction: CommunityReaction = {
        postId,
        userId: principal.userId,
        type,
        createdAt: this.runtime.now(),
      };
      this.state.reactions.set(key, reaction);
      this.notify(post.authorId, principal.userId, 'REACTION', 'POST', postId, 'community.reaction');
      return { active: true, reaction };
    });
  }

  public createComment(
    principal: AuthenticatedPrincipal,
    postId: string,
    body: string,
    idempotencyKey?: string,
  ): CommunityComment {
    return this.createCommentInternal(principal, postId, null, body, idempotencyKey);
  }

  public createReply(
    principal: AuthenticatedPrincipal,
    commentId: string,
    body: string,
    idempotencyKey?: string,
  ): CommunityComment {
    this.requireCapability(principal, 'COMMUNITY_COMMENT');
    const parent = this.requireComment(commentId);
    if (parent.parentCommentId !== null) {
      throw new CommunityError('VALIDATION', 'Community replies support only one reply level.');
    }
    return this.createCommentInternal(principal, parent.postId, parent.id, body, idempotencyKey);
  }

  private createCommentInternal(
    principal: AuthenticatedPrincipal,
    postId: string,
    parentCommentId: string | null,
    rawBody: string,
    idempotencyKey: string | undefined,
  ): CommunityComment {
    this.requireCapability(principal, 'COMMUNITY_COMMENT');
    const body = rawBody.trim();
    if (body.length === 0 || body.length > 10_000) {
      throw new CommunityError('VALIDATION', 'Comment text must contain 1 to 10,000 characters.');
    }
    return this.idempotent(
      principal,
      parentCommentId === null ? 'comment.create' : 'reply.create',
      idempotencyKey,
      { postId, parentCommentId, body },
      () => {
        this.rateLimiter.consume(principal, 'comment.create', { max: 30, windowMs: 60 * 60 * 1_000 });
        const post = this.requirePost(postId);
        this.assertInteractionAllowed(principal, post.authorId);
        if (!this.canViewPost(principal, post)) throw new CommunityNotFoundError();
        if (parentCommentId !== null) {
          const parent = this.requireComment(parentCommentId);
          if (parent.postId !== postId || parent.parentCommentId !== null || parent.status !== 'PUBLISHED') {
            throw new CommunityError('VALIDATION', 'Reply parent is not available.');
          }
          this.assertInteractionAllowed(principal, parent.authorId);
        }
        this.assertNotDuplicateContent(principal, parentCommentId === null ? 'comment' : 'reply', body);
        const now = this.runtime.now();
        const comment: CommunityComment = {
          id: this.runtime.id(),
          postId,
          authorId: principal.userId,
          parentCommentId,
          body,
          status: 'PUBLISHED',
          createdAt: now,
          updatedAt: now,
          deletedAt: null,
        };
        this.state.comments.set(comment.id, comment);
        const recipient = parentCommentId === null ? post.authorId : this.requireComment(parentCommentId).authorId;
        this.notify(
          recipient,
          principal.userId,
          parentCommentId === null ? 'COMMENT' : 'REPLY',
          'COMMENT',
          comment.id,
          parentCommentId === null ? 'community.comment' : 'community.reply',
        );
        return comment;
      },
    );
  }

  public updateComment(
    principal: AuthenticatedPrincipal,
    commentId: string,
    body: string,
    idempotencyKey?: string,
  ): CommunityComment {
    this.assertUserActive(principal);
    const trimmed = body.trim();
    if (trimmed.length === 0 || trimmed.length > 10_000) {
      throw new CommunityError('VALIDATION', 'Comment text must contain 1 to 10,000 characters.');
    }
    return this.idempotent(principal, 'comment.update', idempotencyKey, { commentId, body: trimmed }, () => {
      const existing = this.requireComment(commentId);
      if (existing.authorId !== principal.userId) throw new CommunityAuthorizationError();
      if (existing.status !== 'PUBLISHED') throw new CommunityError('INVALID_STATE', 'This comment cannot be edited.');
      const updated: CommunityComment = { ...existing, body: trimmed, updatedAt: this.runtime.now() };
      this.state.comments.set(updated.id, updated);
      return updated;
    });
  }

  public deleteComment(
    principal: AuthenticatedPrincipal,
    commentId: string,
    idempotencyKey?: string,
  ): CommunityComment {
    this.assertUserActive(principal);
    return this.idempotent(principal, 'comment.delete', idempotencyKey, { commentId }, () => {
      const existing = this.requireComment(commentId);
      if (existing.authorId !== principal.userId) throw new CommunityAuthorizationError();
      if (existing.status === 'DELETED') return existing;
      const updated: CommunityComment = {
        ...existing,
        status: 'DELETED',
        deletedAt: this.runtime.now(),
        updatedAt: this.runtime.now(),
      };
      this.state.comments.set(updated.id, updated);
      return updated;
    });
  }

  public listComments(
    principal: AuthenticatedPrincipal,
    postId: string,
    options: CommunityPageOptions & { readonly parentCommentId?: string | null } = {},
  ): CommunityCursorPage<CommunityComment> {
    this.assertReadCapability(principal);
    const post = this.requirePost(postId);
    if (!this.canViewPost(principal, post)) throw new CommunityNotFoundError();
    const parentCommentId = options.parentCommentId ?? null;
    const items = sortByTimeDesc(
      [...this.state.comments.values()].filter(
        (comment) =>
          comment.postId === postId &&
          comment.parentCommentId === parentCommentId &&
          comment.status === 'PUBLISHED' &&
          !this.isBlockedEitherWay(principal.userId, comment.authorId),
      ),
    );
    return paginate(items, options);
  }

  public savePost(
    principal: AuthenticatedPrincipal,
    postId: string,
    idempotencyKey?: string,
  ): { readonly postId: string; readonly saved: boolean } {
    this.requireCapability(principal, 'COMMUNITY_SAVE');
    return this.idempotent(principal, 'post.save', idempotencyKey, { postId }, () => {
      const post = this.requirePost(postId);
      this.assertInteractionAllowed(principal, post.authorId);
      if (!this.canViewPost(principal, post)) throw new CommunityNotFoundError();
      const key = mapKey(principal.userId, postId);
      if (!this.state.saves.has(key)) {
        this.state.saves.set(key, { userId: principal.userId, postId, createdAt: this.runtime.now() });
      }
      return { postId, saved: true };
    });
  }

  public unsavePost(
    principal: AuthenticatedPrincipal,
    postId: string,
    idempotencyKey?: string,
  ): { readonly postId: string; readonly saved: boolean } {
    this.requireCapability(principal, 'COMMUNITY_SAVE');
    return this.idempotent(principal, 'post.unsave', idempotencyKey, { postId }, () => {
      this.state.saves.delete(mapKey(principal.userId, postId));
      return { postId, saved: false };
    });
  }

  public setRepost(
    principal: AuthenticatedPrincipal,
    postId: string,
    reposted: boolean,
    idempotencyKey?: string,
  ): {
    readonly postId: string;
    readonly reposted: boolean;
    readonly repostCount: number;
    readonly repostedBy: CommunityRepostAttribution | null;
  } {
    this.assertUserActive(principal);
    if (reposted) this.requireCapability(principal, 'COMMUNITY_INTERACT');
    return this.idempotent(principal, reposted ? 'repost.create' : 'repost.delete', idempotencyKey, { postId, reposted }, () => {
      const post = this.requirePost(postId);
      const key = mapKey(principal.userId, postId);
      if (reposted) {
        this.rateLimiter.consume(principal, 'repost.create', { max: 60, windowMs: 60 * 60 * 1_000 });
        this.assertShareablePost(principal, post);
        if (!this.state.reposts.has(key)) {
          const row: CommunityRepost = { userId: principal.userId, postId, createdAt: this.runtime.now() };
          this.state.reposts.set(key, row);
          this.notify(post.authorId, principal.userId, 'REPOST', 'POST', post.id, 'community.repost');
        }
      } else {
        // A user may remove a historical repost even when its source is now unavailable.
        this.state.reposts.delete(key);
      }
      return {
        postId,
        reposted,
        repostCount: this.repostCount(postId),
        repostedBy: this.repostAttribution(principal, postId, false),
      };
    });
  }

  public listSavedPosts(
    principal: AuthenticatedPrincipal,
    options: CommunityPageOptions = {},
  ): CommunityCursorPage<CommunityFeedItem> {
    this.assertReadCapability(principal);
    const saveRows = sortByTimeDesc(
      [...this.state.saves.values()]
        .filter((save) => save.userId === principal.userId)
        .map((save) => ({ id: save.postId, createdAt: save.createdAt })),
    );
    const page = paginate(saveRows, options);
    return {
      items: page.items
        .map((save) => this.state.posts.get(save.id))
        .filter((post): post is StoredPost => post !== undefined && this.canViewPost(principal, post))
        .map((post) => this.projectPost(principal, post)),
      nextCursor: page.nextCursor,
      hasMore: page.hasMore,
    };
  }

  public followUser(
    principal: AuthenticatedPrincipal,
    followedUserId: string,
    idempotencyKey?: string,
  ): { readonly followedUserId: string; readonly following: boolean } {
    this.requireCapability(principal, 'COMMUNITY_FOLLOW');
    if (followedUserId === principal.userId) throw new CommunityError('VALIDATION', 'A user cannot follow themselves.');
    return this.idempotent(principal, 'follow.create', idempotencyKey, { followedUserId }, () => {
      this.rateLimiter.consume(principal, 'follow.create', { max: 60, windowMs: 24 * 60 * 60 * 1_000 });
      this.assertInteractionAllowed(principal, followedUserId);
      const profile = this.profileFor(followedUserId);
      if (profile.profileVisibility !== 'PUBLIC' || profile.followPermission !== 'EVERYONE') {
        throw new CommunityNotFoundError();
      }
      const key = mapKey(principal.userId, followedUserId);
      if (!this.state.follows.has(key)) {
        this.state.follows.set(key, {
          followerId: principal.userId,
          followedId: followedUserId,
          createdAt: this.runtime.now(),
        });
        this.notify(followedUserId, principal.userId, 'FOLLOW', 'POST', followedUserId, 'community.follow');
      }
      return { followedUserId, following: true };
    });
  }

  public unfollowUser(
    principal: AuthenticatedPrincipal,
    followedUserId: string,
    idempotencyKey?: string,
  ): { readonly followedUserId: string; readonly following: boolean } {
    this.requireCapability(principal, 'COMMUNITY_FOLLOW');
    return this.idempotent(principal, 'follow.delete', idempotencyKey, { followedUserId }, () => {
      this.state.follows.delete(mapKey(principal.userId, followedUserId));
      return { followedUserId, following: false };
    });
  }

  public listFollowers(
    principal: AuthenticatedPrincipal,
    userId: string,
    options: CommunityPageOptions = {},
  ): CommunityCursorPage<CommunityFollowListItem> {
    this.assertReadCapability(principal);
    const profile = this.profileFor(userId);
    if (userId !== principal.userId && profile.profileVisibility !== 'PUBLIC') throw new CommunityNotFoundError();
    const rows = sortByTimeDesc(
      [...this.state.follows.values()]
        .filter((follow) => follow.followedId === userId)
        .map((follow) => ({
          id: follow.followerId,
          createdAt: follow.createdAt,
          author: this.publicAuthor(follow.followerId),
        })),
    );
    const page = paginate(rows, options);
    return {
      items: page.items.map((row) => ({ ...row.author, id: row.id, followedAt: row.createdAt })),
      nextCursor: page.nextCursor,
      hasMore: page.hasMore,
    };
  }

  public listFollowing(
    principal: AuthenticatedPrincipal,
    userId: string,
    options: CommunityPageOptions = {},
  ): CommunityCursorPage<CommunityFollowListItem> {
    this.assertReadCapability(principal);
    const profile = this.profileFor(userId);
    if (userId !== principal.userId && profile.profileVisibility !== 'PUBLIC') throw new CommunityNotFoundError();
    const rows = sortByTimeDesc(
      [...this.state.follows.values()]
        .filter((follow) => follow.followerId === userId)
        .map((follow) => ({
          id: follow.followedId,
          createdAt: follow.createdAt,
          author: this.publicAuthor(follow.followedId),
        })),
    );
    const page = paginate(rows, options);
    return {
      items: page.items.map((row) => ({ ...row.author, id: row.id, followedAt: row.createdAt })),
      nextCursor: page.nextCursor,
      hasMore: page.hasMore,
    };
  }

  public blockUser(
    principal: AuthenticatedPrincipal,
    blockedUserId: string,
    idempotencyKey?: string,
  ): { readonly blockedUserId: string; readonly blocked: boolean } {
    this.requireCapability(principal, 'COMMUNITY_INTERACT');
    if (blockedUserId === principal.userId) throw new CommunityError('VALIDATION', 'A user cannot block themselves.');
    return this.idempotent(principal, 'block.create', idempotencyKey, { blockedUserId }, () => {
      const key = mapKey(principal.userId, blockedUserId);
      if (!this.state.blocks.has(key)) {
        this.state.blocks.set(key, {
          blockerId: principal.userId,
          blockedId: blockedUserId,
          createdAt: this.runtime.now(),
        });
      }
      // Follow is an interaction relationship, so a block removes it in both directions.
      this.state.follows.delete(mapKey(principal.userId, blockedUserId));
      this.state.follows.delete(mapKey(blockedUserId, principal.userId));
      // Reposts are interaction relationships too; remove them to avoid
      // exposing a blocked relationship through counters or attribution.
      for (const [repostKey, repost] of this.state.reposts.entries()) {
        const target = this.state.posts.get(repost.postId);
        if (
          repost.userId === principal.userId ||
          repost.userId === blockedUserId ||
          target?.authorId === principal.userId ||
          target?.authorId === blockedUserId
        ) this.state.reposts.delete(repostKey);
      }
      return { blockedUserId, blocked: true };
    });
  }

  public unblockUser(
    principal: AuthenticatedPrincipal,
    blockedUserId: string,
    idempotencyKey?: string,
  ): { readonly blockedUserId: string; readonly blocked: boolean } {
    this.requireCapability(principal, 'COMMUNITY_FOLLOW');
    return this.idempotent(principal, 'block.delete', idempotencyKey, { blockedUserId }, () => {
      this.state.blocks.delete(mapKey(principal.userId, blockedUserId));
      return { blockedUserId, blocked: false };
    });
  }

  public createGroup(principal: AuthenticatedPrincipal, input: CommunityGroupCreateInput): CommunityGroup {
    this.assertUserActive(principal);
    if (input.name.trim().length === 0 || input.name.length > 240) {
      throw new CommunityError('VALIDATION', 'Group name must contain 1 to 240 characters.');
    }
    if (input.description !== undefined && input.description !== null && input.description.length > 5_000) {
      throw new CommunityError('VALIDATION', 'Group description exceeds 5,000 characters.');
    }
    const avatarMediaId =
      input.avatarMediaId === undefined || input.avatarMediaId === null
        ? input.avatarMediaId
        : this.resolveImageMedia(principal, input.avatarMediaId, 'avatarMediaId');
    const coverMediaId =
      input.coverMediaId === undefined || input.coverMediaId === null
        ? input.coverMediaId
        : this.resolveImageMedia(principal, input.coverMediaId, 'coverMediaId');
    return this.idempotent(principal, 'group.create', input.idempotencyKey, input, () => {
      if (!this.entitlements.has(principal, 'GROUP_CREATE')) {
        // Founder/internal creation remains a separately authenticated server boundary.
        this.administration.manageOfficialChannel(principal, {
          targetOwnerId: principal.userId,
          resourceType: 'COMMUNITY',
          resourceId: 'group-create',
        });
      }
      const now = this.runtime.now();
      const group: CommunityGroup = {
        id: this.runtime.id(),
        ownerId: principal.userId,
        name: input.name.trim(),
        description: input.description?.trim() || null,
        avatarMediaId: avatarMediaId ?? null,
        coverMediaId: coverMediaId ?? null,
        visibility: input.visibility ?? 'PUBLIC',
        status: 'ACTIVE',
        createdAt: now,
        updatedAt: now,
        deletedAt: null,
      };
      const membership: CommunityGroupMembership = {
        groupId: group.id,
        userId: principal.userId,
        role: 'OWNER',
        status: 'ACTIVE',
        requestedAt: now,
        joinedAt: now,
        updatedAt: now,
      };
      this.state.groups.set(group.id, group);
      this.state.groupMemberships.set(mapKey(group.id, principal.userId), membership);
      return group;
    });
  }

  public getGroup(principal: AuthenticatedPrincipal, groupId: string): CommunityGroup {
    this.assertReadCapability(principal);
    const group = this.requireGroup(groupId);
    if (!this.hasVisibleGroupAccess(principal, group)) throw new CommunityNotFoundError();
    return clone(group);
  }

  public listGroups(
    principal: AuthenticatedPrincipal,
    options: CommunityPageOptions & { readonly mine?: boolean } = {},
  ): CommunityCursorPage<CommunityGroup> {
    this.assertReadCapability(principal);
    const items = sortByTimeDesc(
      [...this.state.groups.values()].filter(
        (group) =>
          group.status === 'ACTIVE' &&
          (options.mine === true
            ? this.isActiveGroupMember(group.id, principal.userId)
            : this.hasVisibleGroupAccess(principal, group)),
      ),
    );
    return paginate(items, options);
  }

  public joinGroup(
    principal: AuthenticatedPrincipal,
    groupId: string,
    idempotencyKey?: string,
  ): CommunityGroupMembership {
    this.requireCapability(principal, 'GROUP_JOIN');
    return this.idempotent(principal, 'group.join', idempotencyKey, { groupId }, () => {
      const group = this.requireGroup(groupId);
      if (group.status !== 'ACTIVE') throw new CommunityError('INVALID_STATE', 'This group is not accepting members.');
      const key = mapKey(groupId, principal.userId);
      const existing = this.state.groupMemberships.get(key);
      if (existing?.status === 'BANNED') throw new CommunityAuthorizationError();
      if (existing?.status === 'ACTIVE' || existing?.status === 'PENDING') return existing;
      if (group.visibility === 'INVITE_ONLY' && existing?.status !== 'INVITED') {
        throw new CommunityAuthorizationError();
      }
      const now = this.runtime.now();
      const membership: CommunityGroupMembership = {
        groupId,
        userId: principal.userId,
        role: 'MEMBER',
        status:
          group.visibility === 'PUBLIC' || existing?.status === 'INVITED' ? 'ACTIVE' : 'PENDING',
        requestedAt: existing?.requestedAt ?? now,
        joinedAt:
          group.visibility === 'PUBLIC' || existing?.status === 'INVITED' ? now : null,
        updatedAt: now,
      };
      this.state.groupMemberships.set(key, membership);
      if (membership.status === 'PENDING') {
        this.notify(group.ownerId, principal.userId, 'GROUP_INVITE', 'GROUP', group.id, 'community.group.requested');
      } else {
        this.notify(group.ownerId, principal.userId, 'GROUP_APPROVED', 'GROUP', group.id, 'community.group.joined');
      }
      return membership;
    });
  }

  public leaveGroup(
    principal: AuthenticatedPrincipal,
    groupId: string,
    idempotencyKey?: string,
  ): CommunityGroupMembership {
    this.requireCapability(principal, 'GROUP_JOIN');
    return this.idempotent(principal, 'group.leave', idempotencyKey, { groupId }, () => {
      const group = this.requireGroup(groupId);
      const existing = this.groupMembership(groupId, principal.userId);
      if (existing === undefined) throw new CommunityNotFoundError();
      if (existing.role === 'OWNER' && existing.status === 'ACTIVE' && group.status === 'ACTIVE') {
        throw new CommunityError('INVALID_STATE', 'Transfer group ownership or archive the group before leaving.');
      }
      if (existing.status === 'LEFT') return existing;
      const updated: CommunityGroupMembership = {
        ...existing,
        status: 'LEFT',
        role: existing.role === 'OWNER' ? 'MEMBER' : existing.role,
        joinedAt: existing.joinedAt,
        updatedAt: this.runtime.now(),
      };
      this.state.groupMemberships.set(mapKey(groupId, principal.userId), updated);
      return updated;
    });
  }

  public manageGroupMembership(
    principal: AuthenticatedPrincipal,
    groupId: string,
    targetUserId: string,
    action: 'APPROVE' | 'REMOVE' | 'BAN' | 'INVITE' | 'ACCEPT_INVITE',
    idempotencyKey?: string,
  ): CommunityGroupMembership {
    this.assertUserActive(principal);
    return this.idempotent(
      principal,
      'group.membership.manage',
      idempotencyKey,
      { groupId, targetUserId, action },
      () => {
        const group = this.requireGroup(groupId);
        const isSelfInviteAcceptance = action === 'ACCEPT_INVITE' && targetUserId === principal.userId;
        if (!isSelfInviteAcceptance && !this.isGroupManager(groupId, principal.userId)) {
          throw new CommunityAuthorizationError();
        }
        const existing = this.groupMembership(groupId, targetUserId);
        const now = this.runtime.now();
        if (action === 'INVITE') {
          if (existing?.status === 'ACTIVE') return existing;
          const invited: CommunityGroupMembership = {
            groupId,
            userId: targetUserId,
            role: 'MEMBER',
            status: 'INVITED',
            requestedAt: existing?.requestedAt ?? now,
            joinedAt: null,
            updatedAt: now,
          };
          this.state.groupMemberships.set(mapKey(groupId, targetUserId), invited);
          this.notify(targetUserId, principal.userId, 'GROUP_INVITE', 'GROUP', groupId, 'community.group.invited');
          return invited;
        }
        if (existing === undefined) throw new CommunityNotFoundError();
        if (action === 'ACCEPT_INVITE') {
          if (existing.status !== 'INVITED') throw new CommunityError('INVALID_STATE', 'There is no pending group invite.');
          const accepted: CommunityGroupMembership = {
            ...existing,
            status: 'ACTIVE',
            joinedAt: now,
            updatedAt: now,
          };
          this.state.groupMemberships.set(mapKey(groupId, targetUserId), accepted);
          this.notify(group.ownerId, targetUserId, 'GROUP_APPROVED', 'GROUP', groupId, 'community.group.accepted');
          return accepted;
        }
        if (existing.role === 'OWNER') {
          throw new CommunityError('INVALID_STATE', 'Transfer ownership before changing the group owner membership.');
        }
        const status: CommunityGroupMembershipStatus =
          action === 'APPROVE' ? 'ACTIVE' : action === 'BAN' ? 'BANNED' : 'REMOVED';
        if (action === 'APPROVE' && existing.status !== 'PENDING') {
          throw new CommunityError('INVALID_STATE', 'Only a pending group request can be approved.');
        }
        const updated: CommunityGroupMembership = {
          ...existing,
          status,
          joinedAt: status === 'ACTIVE' ? now : existing.joinedAt,
          updatedAt: now,
        };
        this.state.groupMemberships.set(mapKey(groupId, targetUserId), updated);
        if (action === 'APPROVE') {
          this.notify(targetUserId, principal.userId, 'GROUP_APPROVED', 'GROUP', groupId, 'community.group.approved');
        }
        return updated;
      },
    );
  }

  public transferGroupOwnership(
    principal: AuthenticatedPrincipal,
    groupId: string,
    nextOwnerUserId: string,
    idempotencyKey?: string,
  ): CommunityGroup {
    this.assertUserActive(principal);
    return this.idempotent(
      principal,
      'group.transfer-owner',
      idempotencyKey,
      { groupId, nextOwnerUserId },
      () => {
        const group = this.requireGroup(groupId);
        if (group.ownerId !== principal.userId) throw new CommunityAuthorizationError();
        if (nextOwnerUserId === principal.userId) return group;
        const nextMembership = this.groupMembership(groupId, nextOwnerUserId);
        if (nextMembership?.status !== 'ACTIVE') {
          throw new CommunityError('VALIDATION', 'The next group owner must be an active member.');
        }
        const currentMembership = this.groupMembership(groupId, principal.userId);
        if (currentMembership === undefined) throw new CommunityError('INVALID_STATE', 'Group owner membership is missing.');
        const now = this.runtime.now();
        const updatedGroup: CommunityGroup = { ...group, ownerId: nextOwnerUserId, updatedAt: now };
        this.state.groups.set(groupId, updatedGroup);
        this.state.groupMemberships.set(mapKey(groupId, principal.userId), {
          ...currentMembership,
          role: 'ADMIN',
          updatedAt: now,
        });
        this.state.groupMemberships.set(mapKey(groupId, nextOwnerUserId), {
          ...nextMembership,
          role: 'OWNER',
          updatedAt: now,
        });
        return updatedGroup;
      },
    );
  }

  public archiveGroup(
    principal: AuthenticatedPrincipal,
    groupId: string,
    idempotencyKey?: string,
  ): CommunityGroup {
    this.assertUserActive(principal);
    return this.idempotent(principal, 'group.archive', idempotencyKey, { groupId }, () => {
      const group = this.requireGroup(groupId);
      if (group.ownerId !== principal.userId) throw new CommunityAuthorizationError();
      if (group.status === 'ARCHIVED') return group;
      const updated: CommunityGroup = {
        ...group,
        status: 'ARCHIVED',
        updatedAt: this.runtime.now(),
      };
      this.state.groups.set(groupId, updated);
      return updated;
    });
  }

  public listGroupMembers(
    principal: AuthenticatedPrincipal,
    groupId: string,
    options: CommunityPageOptions = {},
  ): CommunityCursorPage<CommunityGroupMembership & { readonly id: string; readonly createdAt: string }> {
    this.assertReadCapability(principal);
    const group = this.requireGroup(groupId);
    if (!this.hasVisibleGroupAccess(principal, group)) throw new CommunityNotFoundError();
    const rows = sortByTimeDesc(
      [...this.state.groupMemberships.values()]
        .filter((member) => member.groupId === groupId && member.status === 'ACTIVE')
        .map((member) => ({ ...member, id: member.userId, createdAt: member.requestedAt })),
    );
    return paginate(rows, options);
  }

  public listGroupPosts(
    principal: AuthenticatedPrincipal,
    groupId: string,
    options: CommunityPageOptions = {},
  ): CommunityCursorPage<CommunityFeedItem> {
    this.assertReadCapability(principal);
    const group = this.requireGroup(groupId);
    if (!this.hasVisibleGroupAccess(principal, group)) throw new CommunityNotFoundError();
    const page = paginate(
      sortByTimeDesc(
        [...this.state.posts.values()].filter(
          (post) => post.groupId === groupId && this.canViewPost(principal, post),
        ),
      ),
      options,
    );
    return {
      items: page.items.map((post) => this.projectPost(principal, post)),
      nextCursor: page.nextCursor,
      hasMore: page.hasMore,
    };
  }

  public createChannel(
    principal: AuthenticatedPrincipal,
    input: CommunityChannelCreateInput,
  ): CommunityChannel {
    this.assertUserActive(principal);
    if (!/^[a-z0-9][a-z0-9-]*$/u.test(input.slug) || input.slug.length > 120) {
      throw new CommunityError('VALIDATION', 'Channel slug must use lowercase letters, digits, and hyphens.');
    }
    if (input.name.trim().length === 0 || input.name.length > 240) {
      throw new CommunityError('VALIDATION', 'Channel name must contain 1 to 240 characters.');
    }
    return this.idempotent(principal, 'channel.create', input.idempotencyKey, input, () => {
      // Phase 4 intentionally keeps channel creation to the Founder/root boundary.
      this.administration.manageOfficialChannel(principal, {
        targetOwnerId: principal.userId,
        resourceType: 'COMMUNITY',
        resourceId: 'channel-create',
      });
      if ([...this.state.channels.values()].some((channel) => channel.slug === input.slug)) {
        throw new CommunityError('CONFLICT', 'Channel slug is already in use.');
      }
      const now = this.runtime.now();
      const channel: CommunityChannel = {
        id: this.runtime.id(),
        ownerId: principal.userId,
        type: input.type,
        slug: input.slug,
        name: input.name.trim(),
        description: input.description?.trim() || null,
        visibility: input.visibility ?? 'PUBLIC',
        founderAudience: input.founderAudience ?? null,
        status: 'ACTIVE',
        createdAt: now,
        updatedAt: now,
        archivedAt: null,
        deletedAt: null,
      };
      this.state.channels.set(channel.id, channel);
      this.state.channelMemberships.set(mapKey(channel.id, principal.userId), {
        channelId: channel.id,
        userId: principal.userId,
        status: 'ACTIVE',
        joinedAt: now,
        updatedAt: now,
      });
      return channel;
    });
  }

  public getChannel(principal: AuthenticatedPrincipal, channelId: string): CommunityChannel {
    this.assertReadCapability(principal);
    const channel = this.requireChannel(channelId);
    if (!this.hasVisibleChannelAccess(principal, channel)) throw new CommunityNotFoundError();
    return clone(channel);
  }

  public listChannels(
    principal: AuthenticatedPrincipal,
    options: CommunityPageOptions & { readonly mine?: boolean } = {},
  ): CommunityCursorPage<CommunityChannel> {
    this.assertReadCapability(principal);
    const items = sortByTimeDesc(
      [...this.state.channels.values()].filter(
        (channel) =>
          channel.status === 'ACTIVE' &&
          (options.mine === true
            ? this.channelMembership(channel.id, principal.userId)?.status === 'ACTIVE'
            : this.hasVisibleChannelAccess(principal, channel)),
      ),
    );
    return paginate(items, options);
  }

  public joinChannel(
    principal: AuthenticatedPrincipal,
    channelId: string,
    idempotencyKey?: string,
  ): CommunityChannelMembership {
    this.assertReadCapability(principal);
    return this.idempotent(principal, 'channel.join', idempotencyKey, { channelId }, () => {
      const channel = this.requireChannel(channelId);
      if (!this.hasVisibleChannelAccess(principal, channel)) throw new CommunityNotFoundError();
      const key = mapKey(channelId, principal.userId);
      const existing = this.state.channelMemberships.get(key);
      if (existing?.status === 'BANNED') throw new CommunityAuthorizationError();
      if (existing?.status === 'ACTIVE') return existing;
      const membership: CommunityChannelMembership = {
        channelId,
        userId: principal.userId,
        status: 'ACTIVE',
        joinedAt: this.runtime.now(),
        updatedAt: this.runtime.now(),
      };
      this.state.channelMemberships.set(key, membership);
      return membership;
    });
  }

  public leaveChannel(
    principal: AuthenticatedPrincipal,
    channelId: string,
    idempotencyKey?: string,
  ): CommunityChannelMembership {
    this.requireCapability(principal, 'COMMUNITY_INTERACT');
    return this.idempotent(principal, 'channel.leave', idempotencyKey, { channelId }, () => {
      const existing = this.channelMembership(channelId, principal.userId);
      if (existing === undefined) throw new CommunityNotFoundError();
      if (existing.status === 'LEFT') return existing;
      const updated: CommunityChannelMembership = {
        ...existing,
        status: 'LEFT',
        updatedAt: this.runtime.now(),
      };
      this.state.channelMemberships.set(mapKey(channelId, principal.userId), updated);
      return updated;
    });
  }

  public createChannelPost(
    principal: AuthenticatedPrincipal,
    channelId: string,
    input: CommunityChannelPostCreateInput,
  ): CommunityPost {
    this.assertUserActive(principal);
    const body = input.body?.trim() ?? null;
    const media = this.resolveMedia(principal, input.mediaIds ?? []);
    if (body === null && media.length === 0 && (input.archiveSnapshotId === undefined || input.archiveSnapshotId === null)) {
      throw new CommunityError('VALIDATION', 'Channel content needs text, media, or an explicit snapshot.');
    }
    if (body !== null && body.length > 50_000) {
      throw new CommunityError('VALIDATION', 'Channel content exceeds 50,000 characters.');
    }
    return this.idempotent(principal, 'channel.post.create', input.idempotencyKey, { channelId, input }, () => {
      const channel = this.requireChannel(channelId);
      const requiresFounderAuthorization =
        channel.type === 'OFFICIAL' ||
        channel.type === 'DEVELOPER' ||
        input.founderAudience !== undefined &&
          input.founderAudience !== null;
      if (requiresFounderAuthorization) {
        this.administration.manageOfficialChannel(principal, {
          targetOwnerId: channel.ownerId,
          resourceType: 'COMMUNITY',
          resourceId: channelId,
        });
      } else {
        this.requireCapability(principal, 'COMMUNITY_PUBLISH');
        if (!this.hasVisibleChannelAccess(principal, channel)) throw new CommunityNotFoundError();
      }
      if (body !== null) this.assertNotDuplicateContent(principal, 'channel-post', body);
      const snapshot =
        input.archiveSnapshotId === undefined || input.archiveSnapshotId === null
          ? null
          : this.resolveArchiveSnapshot(principal, input.archiveSnapshotId);
      const now = this.runtime.now();
      const post: StoredPost = {
        id: this.runtime.id(),
        authorId: principal.userId,
        publishedSnapshotId: snapshot?.id ?? null,
        groupId: null,
        channelId,
        activityId: null,
        body,
        media,
        visibility: input.visibility ?? channel.visibility,
        founderAudience: input.founderAudience ?? channel.founderAudience,
        status: 'PUBLISHED',
        reactionCount: 0,
        commentCount: 0,
        createdAt: now,
        updatedAt: now,
        deletedAt: null,
        directShareRecipientIds: [],
      };
      this.state.posts.set(post.id, post);
      for (const membership of this.state.channelMemberships.values()) {
        if (membership.channelId === channelId && membership.status === 'ACTIVE') {
          this.notify(membership.userId, principal.userId, 'CHANNEL_UPDATE', 'CHANNEL', channelId, 'community.channel.update');
        }
      }
      return this.safePost(post);
    });
  }

  public listChannelPosts(
    principal: AuthenticatedPrincipal,
    channelId: string,
    options: CommunityPageOptions = {},
  ): CommunityCursorPage<CommunityFeedItem> {
    this.assertReadCapability(principal);
    const channel = this.requireChannel(channelId);
    if (!this.hasVisibleChannelAccess(principal, channel)) throw new CommunityNotFoundError();
    const page = paginate(
      sortByTimeDesc(
        [...this.state.posts.values()].filter(
          (post) => post.channelId === channelId && this.canViewPost(principal, post),
        ),
      ),
      options,
    );
    return {
      items: page.items.map((post) => this.projectPost(principal, post)),
      nextCursor: page.nextCursor,
      hasMore: page.hasMore,
    };
  }

  public archiveChannel(
    principal: AuthenticatedPrincipal,
    channelId: string,
    idempotencyKey?: string,
  ): CommunityChannel {
    this.assertUserActive(principal);
    return this.idempotent(principal, 'channel.archive', idempotencyKey, { channelId }, () => {
      const channel = this.requireChannel(channelId);
      this.administration.manageOfficialChannel(principal, {
        targetOwnerId: channel.ownerId,
        resourceType: 'COMMUNITY',
        resourceId: channel.id,
      });
      if (channel.status === 'ARCHIVED') return channel;
      const updated: CommunityChannel = {
        ...channel,
        status: 'ARCHIVED',
        archivedAt: this.runtime.now(),
        updatedAt: this.runtime.now(),
      };
      this.state.channels.set(channelId, updated);
      return updated;
    });
  }

  public createActivity(
    principal: AuthenticatedPrincipal,
    input: CommunityActivityCreateInput,
  ): CommunityActivity {
    this.assertUserActive(principal);
    if (input.title.trim().length === 0 || input.title.length > 240) {
      throw new CommunityError('VALIDATION', 'Activity title must contain 1 to 240 characters.');
    }
    if (input.description !== undefined && input.description !== null && input.description.length > 20_000) {
      throw new CommunityError('VALIDATION', 'Activity description exceeds 20,000 characters.');
    }
    nowDate(input.startAt, 'startAt');
    if (input.endAt !== undefined && input.endAt !== null) {
      nowDate(input.endAt, 'endAt');
      if (Date.parse(input.endAt) < Date.parse(input.startAt)) {
        throw new CommunityError('VALIDATION', 'endAt must not precede startAt.');
      }
    }
    if (input.capacity !== undefined && input.capacity !== null && (!Number.isSafeInteger(input.capacity) || input.capacity < 1)) {
      throw new CommunityError('VALIDATION', 'capacity must be a positive integer.');
    }
    return this.idempotent(principal, 'activity.create', input.idempotencyKey, input, () => {
      if (input.groupId !== undefined && input.groupId !== null) {
        const group = this.requireGroup(input.groupId);
        if (!this.isGroupManager(group.id, principal.userId)) throw new CommunityAuthorizationError();
      } else if (input.channelId !== undefined && input.channelId !== null) {
        const channel = this.requireChannel(input.channelId);
        this.administration.manageOfficialChannel(principal, {
          targetOwnerId: channel.ownerId,
          resourceType: 'COMMUNITY',
          resourceId: channel.id,
        });
      } else if (!this.entitlements.has(principal, 'GROUP_CREATE')) {
        // Founder/internal activity creation is explicitly trusted and audited.
        this.administration.manageOfficialChannel(principal, {
          targetOwnerId: principal.userId,
          resourceType: 'COMMUNITY',
          resourceId: 'activity-create',
        });
      }
      if (input.founderAudience !== undefined && input.founderAudience !== null) {
        this.administration.manageOfficialChannel(principal, {
          targetOwnerId: principal.userId,
          resourceType: 'COMMUNITY',
          resourceId: 'activity-premium-audience',
        });
      }
      const now = this.runtime.now();
      const activity: CommunityActivity = {
        id: this.runtime.id(),
        creatorUserId: principal.userId,
        groupId: input.groupId ?? null,
        channelId: input.channelId ?? null,
        kind: input.kind,
        title: input.title.trim(),
        description: input.description?.trim() || null,
        startAt: input.startAt,
        endAt: input.endAt ?? null,
        timezone: input.timezone,
        locationText: input.locationText?.trim() || null,
        onlineUrl: input.onlineUrl ?? null,
        capacity: input.capacity ?? null,
        visibility: input.visibility ?? (input.groupId === undefined || input.groupId === null ? 'COMMUNITY' : 'GROUP'),
        founderAudience: input.founderAudience ?? null,
        status: 'PUBLISHED',
        createdAt: now,
        updatedAt: now,
        deletedAt: null,
      };
      if (activity.groupId !== null && activity.visibility !== 'GROUP') {
        throw new CommunityError('VALIDATION', 'Group activities must use GROUP visibility.');
      }
      this.state.activities.set(activity.id, activity);
      return activity;
    });
  }

  public getActivity(principal: AuthenticatedPrincipal, activityId: string): CommunityActivity {
    this.assertReadCapability(principal);
    const activity = this.requireActivity(activityId);
    if (!this.hasVisibleActivityAccess(principal, activity)) throw new CommunityNotFoundError();
    return clone(activity);
  }

  public listActivities(
    principal: AuthenticatedPrincipal,
    options: CommunityPageOptions & { readonly joined?: boolean; readonly upcomingOnly?: boolean } = {},
  ): CommunityCursorPage<CommunityActivity> {
    this.assertReadCapability(principal);
    const now = this.runtime.now();
    const items = sortByTimeDesc(
      [...this.state.activities.values()].filter(
        (activity) =>
          activity.status === 'PUBLISHED' &&
          this.hasVisibleActivityAccess(principal, activity) &&
          (options.joined !== true ||
            this.state.activityRegistrations.get(mapKey(activity.id, principal.userId))?.status === 'ACTIVE') &&
          (options.upcomingOnly !== true || activity.startAt >= now),
      ),
    );
    return paginate(items, options);
  }

  public joinActivity(
    principal: AuthenticatedPrincipal,
    activityId: string,
    idempotencyKey?: string,
  ): CommunityActivityRegistration {
    this.requireCapability(principal, 'ACTIVITY_JOIN');
    return this.idempotent(principal, 'activity.join', idempotencyKey, { activityId }, () => {
      const activity = this.requireActivity(activityId);
      if (!this.hasVisibleActivityAccess(principal, activity)) throw new CommunityNotFoundError();
      if (activity.status !== 'PUBLISHED') throw new CommunityError('INVALID_STATE', 'This activity is not accepting registrations.');
      const key = mapKey(activityId, principal.userId);
      const existing = this.state.activityRegistrations.get(key);
      if (existing?.status === 'ACTIVE') return existing;
      // The in-memory service performs this read-check-write as one synchronous
      // aggregate mutation. The SQL migration uses a locked counter/unique row
      // transaction for the production adapter equivalent.
      const activeCount = [...this.state.activityRegistrations.values()].filter(
        (registration) => registration.activityId === activityId && registration.status === 'ACTIVE',
      ).length;
      if (activity.capacity !== null && activeCount >= activity.capacity) {
        throw new CommunityError('CAPACITY_FULL', 'This activity has reached its capacity.');
      }
      const now = this.runtime.now();
      const registration: CommunityActivityRegistration = {
        activityId,
        userId: principal.userId,
        status: 'ACTIVE',
        registeredAt: existing?.registeredAt ?? now,
        cancelledAt: null,
        updatedAt: now,
      };
      this.state.activityRegistrations.set(key, registration);
      return registration;
    });
  }

  public cancelActivityRegistration(
    principal: AuthenticatedPrincipal,
    activityId: string,
    idempotencyKey?: string,
  ): CommunityActivityRegistration {
    this.assertUserActive(principal);
    return this.idempotent(principal, 'activity.cancel-registration', idempotencyKey, { activityId }, () => {
      const existing = this.state.activityRegistrations.get(mapKey(activityId, principal.userId));
      if (existing === undefined) throw new CommunityNotFoundError();
      if (existing.status === 'CANCELLED') return existing;
      const updated: CommunityActivityRegistration = {
        ...existing,
        status: 'CANCELLED',
        cancelledAt: this.runtime.now(),
        updatedAt: this.runtime.now(),
      };
      this.state.activityRegistrations.set(mapKey(activityId, principal.userId), updated);
      return updated;
    });
  }

  public listActivityRegistrations(
    principal: AuthenticatedPrincipal,
    activityId: string,
    options: CommunityPageOptions = {},
  ): CommunityCursorPage<CommunityActivityRegistration & { readonly id: string; readonly createdAt: string }> {
    this.assertReadCapability(principal);
    const activity = this.requireActivity(activityId);
    if (
      activity.creatorUserId !== principal.userId &&
      !(activity.groupId !== null && this.isGroupManager(activity.groupId, principal.userId))
    ) {
      throw new CommunityAuthorizationError();
    }
    const rows = sortByTimeDesc(
      [...this.state.activityRegistrations.values()]
        .filter((registration) => registration.activityId === activityId && registration.status === 'ACTIVE')
        .map((registration) => ({ ...registration, id: registration.userId, createdAt: registration.registeredAt })),
    );
    return paginate(rows, options);
  }

  public updateActivityStatus(
    principal: AuthenticatedPrincipal,
    activityId: string,
    status: Extract<CommunityActivity['status'], 'CANCELLED' | 'COMPLETED'>,
    idempotencyKey?: string,
  ): CommunityActivity {
    this.assertUserActive(principal);
    return this.idempotent(principal, 'activity.update-status', idempotencyKey, { activityId, status }, () => {
      const activity = this.requireActivity(activityId);
      if (
        activity.creatorUserId !== principal.userId &&
        !(activity.groupId !== null && this.isGroupManager(activity.groupId, principal.userId))
      ) {
        throw new CommunityAuthorizationError();
      }
      const updated: CommunityActivity = { ...activity, status, updatedAt: this.runtime.now() };
      this.state.activities.set(activityId, updated);
      return updated;
    });
  }

  private notify(
    recipientUserId: string,
    actorUserId: string | null,
    type: CommunityNotificationType,
    resourceType: CommunityNotification['resourceType'],
    resourceId: string,
    summaryCode: string,
  ): void {
    if (recipientUserId === actorUserId) return;
    const notification: StoredNotification = {
      id: this.runtime.id(),
      recipientUserId,
      actorUserId,
      type,
      resourceType,
      resourceId,
      summaryCode,
      status: 'UNREAD',
      createdAt: this.runtime.now(),
      readAt: null,
    };
    this.state.notifications.set(notification.id, notification);
  }

  public listNotifications(
    principal: AuthenticatedPrincipal,
    options: CommunityPageOptions & { readonly unreadOnly?: boolean } = {},
  ): CommunityCursorPage<CommunityNotification> {
    this.assertReadCapability(principal);
    return paginate(
      sortByTimeDesc(
        [...this.state.notifications.values()].filter(
          (notification) =>
            notification.recipientUserId === principal.userId &&
            (options.unreadOnly !== true || notification.status === 'UNREAD'),
        ),
      ),
      options,
    );
  }

  public markNotificationRead(
    principal: AuthenticatedPrincipal,
    notificationId: string,
    idempotencyKey?: string,
  ): CommunityNotification {
    this.assertUserActive(principal);
    return this.idempotent(principal, 'notification.read', idempotencyKey, { notificationId }, () => {
      const existing = this.state.notifications.get(notificationId);
      if (existing === undefined || existing.recipientUserId !== principal.userId) {
        throw new CommunityNotFoundError();
      }
      if (existing.status === 'READ') return existing;
      const updated: CommunityNotification = {
        ...existing,
        status: 'READ',
        readAt: this.runtime.now(),
      };
      this.state.notifications.set(notificationId, updated);
      return updated;
    });
  }

  public createReport(principal: AuthenticatedPrincipal, input: CommunityReportCreateInput): CommunityReport {
    this.assertReadCapability(principal);
    if (input.details !== undefined && input.details !== null && input.details.length > 4_000) {
      throw new CommunityError('VALIDATION', 'Report details exceed 4,000 characters.');
    }
    return this.idempotent(principal, 'report.create', input.idempotencyKey, input, () => {
      this.rateLimiter.consume(principal, 'report.create', { max: 10, windowMs: 24 * 60 * 60 * 1_000 });
      const targetOwnerId = this.assertReportTargetVisible(principal, input.targetType, input.targetId);
      if (targetOwnerId === principal.userId) {
        throw new CommunityError('VALIDATION', 'A user cannot report their own Community resource.');
      }
      const existing = [...this.state.reports.values()].find(
        (report) =>
          report.reporterUserId === principal.userId &&
          report.targetType === input.targetType &&
          report.targetId === input.targetId &&
          (report.status === 'OPEN' || report.status === 'REVIEWING'),
      );
      if (existing !== undefined) return existing;
      const now = this.runtime.now();
      const report: CommunityReport = {
        id: this.runtime.id(),
        reporterUserId: principal.userId,
        targetType: input.targetType,
        targetId: input.targetId,
        reason: input.reason,
        details: input.details?.trim() || null,
        status: 'OPEN',
        createdAt: now,
      };
      const moderationCase: ModerationCase = {
        id: this.runtime.id(),
        reportId: report.id,
        targetType: report.targetType,
        targetId: report.targetId,
        targetOwnerId,
        status: 'OPEN',
        action: null,
        actionedByUserId: null,
        actionReason: null,
        createdAt: now,
        updatedAt: now,
      };
      this.state.reports.set(report.id, report);
      this.state.moderationCases.set(moderationCase.id, moderationCase);
      return report;
    });
  }

  /** Only a separately authenticated admin/moderation boundary can see reporter identity. */
  public listReports(
    principal: AuthenticatedPrincipal,
    options: CommunityPageOptions = {},
  ): CommunityCursorPage<CommunityReport> {
    this.administration.readReports(principal);
    return paginate(sortByTimeDesc([...this.state.reports.values()]), options);
  }

  public listModerationCases(
    principal: AuthenticatedPrincipal,
    options: CommunityPageOptions = {},
  ): CommunityCursorPage<ModerationCase> {
    this.administration.readReports(principal);
    return paginate(sortByTimeDesc([...this.state.moderationCases.values()]), options);
  }

  public moderate(
    principal: AuthenticatedPrincipal,
    moderationCaseId: string,
    input: CommunityModerationInput,
  ): ModerationCase {
    if (input.reason.trim().length === 0 || input.reason.length > 2_000) {
      throw new CommunityError('VALIDATION', 'A concise moderation reason is required.');
    }
    const existing = this.state.moderationCases.get(moderationCaseId);
    if (existing === undefined) throw new CommunityNotFoundError();
    return this.administration.moderate(
      principal,
      {
        targetOwnerId: existing.targetOwnerId,
        resourceType: existing.targetType,
        resourceId: existing.targetId,
        reason: input.reason,
      },
      () =>
        this.write(() => {
          const current = this.state.moderationCases.get(moderationCaseId);
          if (current === undefined) throw new CommunityNotFoundError();
          this.applyModerationAction(current, input.action);
          const now = this.runtime.now();
          const updatedCase: ModerationCase = {
            ...current,
            status: 'ACTIONED',
            action: input.action,
            actionedByUserId: principal.userId,
            actionReason: input.reason.trim(),
            updatedAt: now,
          };
          this.state.moderationCases.set(updatedCase.id, updatedCase);
          const report = this.state.reports.get(updatedCase.reportId);
          if (report !== undefined) {
            this.state.reports.set(report.id, { ...report, status: 'ACTIONED' });
          }
          if (updatedCase.targetOwnerId !== null) {
            this.notify(
              updatedCase.targetOwnerId,
              principal.userId,
              'MODERATION',
              'MODERATION',
              updatedCase.id,
              'community.moderation.actioned',
            );
          }
          return updatedCase;
        }),
    );
  }

  private applyModerationAction(moderationCase: ModerationCase, action: ModerationActionType): void {
    const now = this.runtime.now();
    switch (moderationCase.targetType) {
      case 'POST': {
        const post = this.requirePost(moderationCase.targetId);
        const status: CommunityPostStatus =
          action === 'HIDE_CONTENT'
            ? 'HIDDEN'
            : action === 'REMOVE_CONTENT'
              ? 'REMOVED'
              : action === 'RESTORE_CONTENT'
                ? 'PUBLISHED'
                : post.status;
        this.state.posts.set(post.id, { ...post, status, updatedAt: now });
        break;
      }
      case 'COMMENT': {
        const comment = this.requireComment(moderationCase.targetId);
        const status: CommunityCommentStatus =
          action === 'HIDE_CONTENT'
            ? 'HIDDEN'
            : action === 'REMOVE_CONTENT'
              ? 'REMOVED'
              : action === 'RESTORE_CONTENT'
                ? 'PUBLISHED'
                : comment.status;
        this.state.comments.set(comment.id, { ...comment, status, updatedAt: now });
        break;
      }
      case 'GROUP': {
        const group = this.requireGroup(moderationCase.targetId);
        if (action === 'REMOVE_CONTENT') {
          this.state.groups.set(group.id, { ...group, status: 'ARCHIVED', updatedAt: now });
        }
        break;
      }
      case 'CHANNEL': {
        const channel = this.requireChannel(moderationCase.targetId);
        if (action === 'REMOVE_CONTENT') {
          this.state.channels.set(channel.id, {
            ...channel,
            status: 'ARCHIVED',
            archivedAt: now,
            updatedAt: now,
          });
        }
        break;
      }
      case 'ACTIVITY': {
        const activity = this.requireActivity(moderationCase.targetId);
        if (action === 'REMOVE_CONTENT') {
          this.state.activities.set(activity.id, { ...activity, status: 'CANCELLED', updatedAt: now });
        }
        break;
      }
      case 'USER':
        break;
      default:
        break;
    }
    if (moderationCase.targetOwnerId !== null && (action === 'SUSPEND_USER' || action === 'BAN_USER')) {
      this.state.userStates.set(moderationCase.targetOwnerId, {
        status: action === 'BAN_USER' ? 'BANNED' : 'SUSPENDED',
        updatedAt: now,
      });
    }
  }

  private assertReportTargetVisible(
    principal: AuthenticatedPrincipal,
    targetType: CommunityReportTargetType,
    targetId: string,
  ): string | null {
    switch (targetType) {
      case 'POST': {
        const post = this.requirePost(targetId);
        if (!this.canViewPost(principal, post)) throw new CommunityNotFoundError();
        return post.authorId;
      }
      case 'COMMENT': {
        const comment = this.requireComment(targetId);
        const post = this.requirePost(comment.postId);
        if (comment.status !== 'PUBLISHED' || !this.canViewPost(principal, post)) throw new CommunityNotFoundError();
        return comment.authorId;
      }
      case 'USER': {
        const profile = this.profileFor(targetId);
        if (profile.profileVisibility !== 'PUBLIC') throw new CommunityNotFoundError();
        return targetId;
      }
      case 'GROUP': {
        const group = this.requireGroup(targetId);
        if (!this.hasVisibleGroupAccess(principal, group)) throw new CommunityNotFoundError();
        return group.ownerId;
      }
      case 'CHANNEL': {
        const channel = this.requireChannel(targetId);
        if (!this.hasVisibleChannelAccess(principal, channel)) throw new CommunityNotFoundError();
        return channel.ownerId;
      }
      case 'ACTIVITY': {
        const activity = this.requireActivity(targetId);
        if (!this.hasVisibleActivityAccess(principal, activity)) throw new CommunityNotFoundError();
        return activity.creatorUserId;
      }
      default:
        throw new CommunityNotFoundError();
    }
  }

  public search(
    principal: AuthenticatedPrincipal,
    query: string,
    options: CommunityPageOptions = {},
  ): CommunityCursorPage<CommunitySearchResult> {
    this.assertReadCapability(principal);
    const normalized = query.trim().toLocaleLowerCase();
    if (normalized.length === 0 || normalized.length > 200) {
      throw new CommunityError('VALIDATION', 'Community search query must contain 1 to 200 characters.');
    }
    const results: CommunitySearchResult[] = [];
    for (const profile of this.state.profiles.values()) {
      if (
        profile.profileVisibility === 'PUBLIC' &&
        `${profile.displayName} ${profile.bio ?? ''}`.toLocaleLowerCase().includes(normalized)
      ) {
        results.push({
          type: 'USER',
          id: profile.userId,
          title: profile.displayName,
          snippet: profile.bio ?? '',
          createdAt: profile.updatedAt,
        });
      }
    }
    for (const post of this.state.posts.values()) {
      if (!this.canViewPost(principal, post)) continue;
      const snapshot =
        post.publishedSnapshotId === null ? undefined : this.state.snapshots.get(post.publishedSnapshotId);
      const text = `${post.body ?? ''} ${snapshot === undefined ? '' : jsonText(snapshot.snapshotContent)}`;
      if (text.toLocaleLowerCase().includes(normalized)) {
        results.push({
          type: 'POST',
          id: post.id,
          title: this.publicAuthor(post.authorId).displayName,
          snippet: text.slice(0, 180),
          createdAt: post.createdAt,
        });
      }
    }
    for (const group of this.state.groups.values()) {
      if (!this.hasVisibleGroupAccess(principal, group)) continue;
      const text = `${group.name} ${group.description ?? ''}`;
      if (text.toLocaleLowerCase().includes(normalized)) {
        results.push({ type: 'GROUP', id: group.id, title: group.name, snippet: group.description ?? '', createdAt: group.createdAt });
      }
    }
    for (const channel of this.state.channels.values()) {
      if (!this.hasVisibleChannelAccess(principal, channel)) continue;
      const text = `${channel.name} ${channel.description ?? ''}`;
      if (text.toLocaleLowerCase().includes(normalized)) {
        results.push({ type: 'CHANNEL', id: channel.id, title: channel.name, snippet: channel.description ?? '', createdAt: channel.createdAt });
      }
    }
    for (const activity of this.state.activities.values()) {
      if (!this.hasVisibleActivityAccess(principal, activity)) continue;
      const text = `${activity.title} ${activity.description ?? ''}`;
      if (text.toLocaleLowerCase().includes(normalized)) {
        results.push({ type: 'ACTIVITY', id: activity.id, title: activity.title, snippet: activity.description ?? '', createdAt: activity.createdAt });
      }
    }
    return paginate(sortByTimeDesc(results), options);
  }
}

function jsonText(value: JsonObject): string {
  return Object.values(value)
    .flatMap((item) => {
      if (typeof item === 'string') return [item];
      if (typeof item === 'number' || typeof item === 'boolean') return [String(item)];
      return [];
    })
    .join(' ');
}
