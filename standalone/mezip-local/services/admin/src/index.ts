import { randomUUID } from 'node:crypto';

import type { InMemoryArchiveRepository, ArchiveStateSnapshot } from '@me-zip/archive';
import {
  adminCapabilityCodes,
  type AdminAccessAction,
  type AdminAccessAudit,
  type AdminCapabilityCode,
  type AdminIdentity,
  type AdminIdentityStatus,
  type AdminType,
  type AuthenticatedPrincipal,
  type ArchiveAiInsight,
  type ArchiveConflict,
  type ArchiveEntry,
  type ArchiveFitnessEntry,
  type ArchiveHistoryEntry,
  type ArchiveMediaMetadata,
  type ArchivePublishedSnapshot,
  type ArchiveRevision,
  type ArchiveSnapshot,
  type ArchiveTimelineItem,
  type BodyMetric,
  type Channel,
  type ChannelPost,
  type ContentVisibility,
  type DailyPack,
  type FounderAudience,
  type JsonObject,
  type MembershipSimulationContext,
  type MediaLink,
  type PlanCode,
  type StepRecord,
} from '@me-zip/shared-types';

export type AdminEnvironment = AdminAccessAudit['environment'];

export interface AdminRuntime {
  readonly now: () => string;
  readonly id: () => string;
}

const defaultRuntime: AdminRuntime = {
  now: () => new Date().toISOString(),
  id: () => randomUUID(),
};

export type AdminErrorCode =
  | 'FORBIDDEN'
  | 'ROOT_NOT_CONFIGURED'
  | 'ROOT_ALREADY_EXISTS'
  | 'CAPABILITY_DENIED'
  | 'INVALID_REQUEST'
  | 'REAUTH_REQUIRED'
  | 'NOT_IMPLEMENTED';

export class AdminAuthorizationError extends Error {
  public readonly code: AdminErrorCode;

  public constructor(code: AdminErrorCode, message: string) {
    super(message);
    this.name = 'AdminAuthorizationError';
    this.code = code;
  }
}

export class AdminBoundaryError extends Error {
  public readonly code = 'NOT_IMPLEMENTED' as const;

  public constructor(message: string) {
    super(message);
    this.name = 'AdminBoundaryError';
  }
}

export interface AdminIdentityStoreOptions {
  /** Immutable server-side owner identity. It is never read from a request body. */
  readonly rootOwnerIdentity: string;
  readonly runtime?: Partial<AdminRuntime>;
}

export interface RootBootstrapInput {
  readonly userId: string;
  readonly id?: string;
  readonly capabilities?: readonly AdminCapabilityCode[];
}

export interface AdminRegistrationInput {
  readonly userId: string;
  readonly adminType?: Exclude<AdminType, 'ORIGINAL_DEVELOPER_ROOT'>;
  readonly capabilities?: readonly AdminCapabilityCode[];
  readonly id?: string;
}

/**
 * Small persistence seam for the server-side admin identity. A production
 * adapter must back this with a unique partial index on the root identity;
 * this in-memory implementation keeps the same invariant for tests.
 */
export class InMemoryAdminIdentityStore {
  private readonly identities = new Map<string, AdminIdentity>();
  private readonly rootOwnerIdentity: string;
  private readonly runtime: AdminRuntime;

  public constructor(options: AdminIdentityStoreOptions) {
    if (options.rootOwnerIdentity.trim() === '') {
      throw new AdminAuthorizationError('ROOT_NOT_CONFIGURED', 'The server root owner identity is required.');
    }
    this.rootOwnerIdentity = options.rootOwnerIdentity;
    this.runtime = { ...defaultRuntime, ...options.runtime };
  }

  public bootstrapRoot(input: RootBootstrapInput): AdminIdentity {
    if (input.userId !== this.rootOwnerIdentity) {
      throw new AdminAuthorizationError('FORBIDDEN', 'Only the configured root owner may bootstrap the root identity.');
    }
    if ([...this.identities.values()].some((identity) => identity.adminType === 'ORIGINAL_DEVELOPER_ROOT')) {
      throw new AdminAuthorizationError('ROOT_ALREADY_EXISTS', 'Exactly one Original Developer Root identity is allowed.');
    }
    if (input.id !== undefined && this.identities.has(input.id)) {
      throw new AdminAuthorizationError('ROOT_ALREADY_EXISTS', 'The requested root identity id is already in use.');
    }
    const now = this.runtime.now();
    const rootCapabilities = input.capabilities ?? adminCapabilityCodes.filter((capability) => capability !== 'ROOT_BULK_EXPORT');
    const identity: AdminIdentity = {
      id: input.id ?? this.runtime.id(),
      userId: input.userId,
      adminType: 'ORIGINAL_DEVELOPER_ROOT',
      status: 'ACTIVE',
      capabilities: [...new Set(rootCapabilities)],
      createdAt: now,
      lastAuthenticatedAt: now,
    };
    this.identities.set(identity.id, identity);
    return clone(identity);
  }

  public registerAdmin(input: AdminRegistrationInput): AdminIdentity {
    const adminType = input.adminType ?? 'ADMIN';
    const requested = input.capabilities ?? [];
    if (requested.some((capability) => capability.startsWith('ROOT_'))) {
      throw new AdminAuthorizationError('FORBIDDEN', 'Root capabilities cannot be granted to an ordinary admin.');
    }
    if (input.id !== undefined && this.identities.has(input.id)) {
      throw new AdminAuthorizationError('FORBIDDEN', 'An existing admin identity cannot be overwritten.');
    }
    const now = this.runtime.now();
    const identity: AdminIdentity = {
      id: input.id ?? this.runtime.id(),
      userId: input.userId,
      adminType,
      status: 'ACTIVE',
      capabilities: [...new Set(requested)],
      createdAt: now,
      lastAuthenticatedAt: now,
    };
    this.identities.set(identity.id, identity);
    return clone(identity);
  }

  public getById(id: string): AdminIdentity | null {
    const identity = this.identities.get(id);
    return identity === undefined ? null : clone(identity);
  }

  public getByUserId(userId: string): AdminIdentity | null {
    const identity = [...this.identities.values()].find((candidate) => candidate.userId === userId);
    return identity === undefined ? null : clone(identity);
  }

  public updateStatus(id: string, status: AdminIdentityStatus): AdminIdentity {
    const existing = this.identities.get(id);
    if (existing === undefined) throw new AdminAuthorizationError('FORBIDDEN', 'Admin identity was not found.');
    const updated: AdminIdentity = { ...existing, status };
    this.identities.set(id, updated);
    return clone(updated);
  }

  public list(): readonly AdminIdentity[] {
    return [...this.identities.values()].map(clone);
  }
}

export type AdminAccessAuditInput = Omit<AdminAccessAudit, 'id' | 'timestamp'> & {
  readonly id?: string;
  readonly timestamp?: string;
};

/** Append-only audit store. There is intentionally no delete or update API. */
export class InMemoryAdminAccessAuditStore {
  private readonly events: AdminAccessAudit[] = [];
  private readonly runtime: AdminRuntime;

  public constructor(runtime: Partial<AdminRuntime> = {}) {
    this.runtime = { ...defaultRuntime, ...runtime };
  }

  public append(input: AdminAccessAuditInput): AdminAccessAudit {
    if (input.adminId.trim() === '' || input.targetUserId.trim() === '' || input.sessionId.trim() === '') {
      throw new AdminAuthorizationError('INVALID_REQUEST', 'An admin audit requires admin, target, and session identifiers.');
    }
    const event: AdminAccessAudit = {
      ...input,
      id: input.id ?? this.runtime.id(),
      timestamp: input.timestamp ?? this.runtime.now(),
    };
    this.events.push(event);
    return clone(event);
  }

  public list(): readonly AdminAccessAudit[] {
    return this.events.map(clone);
  }
}

export interface AdminRequestContext {
  readonly reason?: string;
  readonly reauthenticatedAt?: string;
  readonly ipContext?: string | null;
  readonly deviceContext?: string | null;
}

export interface AdminAuthorizationServiceOptions {
  readonly identities: InMemoryAdminIdentityStore;
  readonly audit: InMemoryAdminAccessAuditStore;
  readonly environment?: AdminEnvironment;
  readonly runtime?: Partial<AdminRuntime>;
  readonly reauthWindowMs?: number;
}

/** Public route names are deliberately separate from consumer endpoints. */
export const adminRouteContracts = {
  readUserArchive: '/v1/admin/users/:userId/archive',
  readSensitiveUserData: '/v1/admin/users/:userId/sensitive',
  readPrivateMessages: '/v1/admin/users/:userId/messages/private',
  exportUserData: '/v1/admin/users/:userId/export',
  simulateMembership: '/v1/admin/membership/simulation',
  channels: '/v1/admin/channels',
} as const;

export interface AdminArchiveRouteRequest {
  readonly targetUserId: string;
  readonly reason?: string;
}

/**
 * Transport-neutral Admin API adapter. It accepts only route data; actor,
 * root identity, capabilities, and ownership are resolved from the server
 * principal and never from request JSON.
 */
export class AdminApiAdapter {
  private readonly authorization: AdminAuthorizationService;
  private readonly archive: InMemoryArchiveRepository;

  public constructor(authorization: AdminAuthorizationService, archive: InMemoryArchiveRepository) {
    this.authorization = authorization;
    this.archive = archive;
  }

  public readUserArchive(
    principal: AuthenticatedPrincipal,
    request: AdminArchiveRouteRequest,
    context: AdminRequestContext = {},
  ): AdminUserArchiveView {
    const { targetUserId } = request;
    return this.authorization.readUserArchive(principal, targetUserId, this.archive, {
      ...context,
      ...(request.reason === undefined ? {} : { reason: request.reason }),
    });
  }

  public readSensitiveUserData(
    principal: AuthenticatedPrincipal,
    request: AdminArchiveRouteRequest,
    context: AdminRequestContext = {},
  ): SensitiveUserDataView {
    const { targetUserId } = request;
    return this.authorization.readSensitiveUserData(principal, targetUserId, this.archive, {
      ...context,
      ...(request.reason === undefined ? {} : { reason: request.reason }),
    });
  }
}

export interface AdminUserArchiveView {
  readonly ownerId: string;
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
  readonly offlineMutations: ArchiveStateSnapshot['offlineMutations'];
  readonly conflicts: readonly ArchiveConflict[];
  readonly timeline: readonly ArchiveTimelineItem[];
}

export interface SensitiveUserDataView {
  readonly ownerId: string;
  readonly bodyMetrics: readonly Readonly<Pick<BodyMetric, 'id' | 'ownerId' | 'measuredAt' | 'weightGrams' | 'bodyFatBasisPoints' | 'waistMillimetres'>>[];
  readonly media: readonly Readonly<Pick<ArchiveMediaMetadata, 'id' | 'ownerId' | 'contentType' | 'bytes' | 'sha256' | 'width' | 'height' | 'durationMs' | 'status' | 'createdAt' | 'updatedAt'>>[];
}

export interface PrivateMessageReader {
  readPrivateMessages(targetUserId: string): readonly JsonObject[];
}

export interface DeviceReader {
  readDevices(targetUserId: string): readonly JsonObject[];
}

export interface ExplicitPublicationRequest {
  readonly sourceId: string;
  readonly sourceVisibility: ContentVisibility;
  readonly targetVisibility: Exclude<ContentVisibility, 'PRIVATE' | 'SNAPSHOT'>;
  readonly explicitPublish: boolean;
  readonly founderAudience?: FounderAudience | null;
}

export interface ExplicitPublicationDecision {
  readonly sourceId: string;
  readonly sourceVisibility: 'PRIVATE';
  readonly targetVisibility: Exclude<ContentVisibility, 'PRIVATE' | 'SNAPSHOT'>;
  readonly publicationState: 'SNAPSHOT';
  readonly founderAudience: FounderAudience | null;
}

export type ChannelContentSource = 'PUBLISHED_SNAPSHOT' | 'ORIGINAL_POST' | 'REPLY' | 'UPLOAD';

export interface ChannelContentRequest {
  readonly channel: Channel;
  readonly source: ChannelContentSource;
  readonly snapshot?: ExplicitPublicationDecision;
  readonly post?: ChannelPost;
}

export class AdminAuthorizationService {
  private readonly identities: InMemoryAdminIdentityStore;
  private readonly audit: InMemoryAdminAccessAuditStore;
  private readonly environment: AdminEnvironment;
  private readonly runtime: AdminRuntime;
  private readonly reauthWindowMs: number;

  public constructor(options: AdminAuthorizationServiceOptions) {
    this.identities = options.identities;
    this.audit = options.audit;
    this.environment = options.environment ?? 'DEVELOPMENT';
    this.runtime = { ...defaultRuntime, ...options.runtime };
    this.reauthWindowMs = options.reauthWindowMs ?? 5 * 60 * 1000;
  }

  public authorize(principal: AuthenticatedPrincipal, capability: AdminCapabilityCode): AdminIdentity {
    const identityId = principal.adminIdentityId;
    if (identityId === undefined) {
      throw new AdminAuthorizationError('FORBIDDEN', 'A server-issued admin identity is required.');
    }
    const identity = this.identities.getById(identityId);
    if (identity === null || identity.adminType !== 'ORIGINAL_DEVELOPER_ROOT' || identity.status !== 'ACTIVE') {
      throw new AdminAuthorizationError('FORBIDDEN', 'Only an active Original Developer Root may use this boundary.');
    }
    if (identity.userId !== principal.userId) {
      throw new AdminAuthorizationError('FORBIDDEN', 'The admin identity does not belong to this session user.');
    }
    if (!identity.capabilities.includes(capability)) {
      throw new AdminAuthorizationError('CAPABILITY_DENIED', `The root capability ${capability} is not enabled.`);
    }
    return identity;
  }

  public readUserArchive(
    principal: AuthenticatedPrincipal,
    targetUserId: string,
    archive: InMemoryArchiveRepository,
    context: AdminRequestContext = {},
  ): AdminUserArchiveView {
    const identity = this.authorize(principal, 'ROOT_READ_USER_DATA');
    const view = this.buildArchiveView(targetUserId, archive);
    this.record(identity, principal, targetUserId, 'VIEW_USER', 'USER', null, context);
    this.record(identity, principal, targetUserId, 'READ_LIFE', 'ARCHIVE', null, context);
    this.record(identity, principal, targetUserId, 'READ_TIMELINE', 'TIMELINE', null, context);
    this.record(identity, principal, targetUserId, 'READ_HISTORY', 'HISTORY', null, context);
    this.record(identity, principal, targetUserId, 'READ_FITNESS', 'FITNESS', null, context);
    this.record(identity, principal, targetUserId, 'READ_BODY_METRICS', 'BODY_METRICS', null, context);
    this.record(identity, principal, targetUserId, 'READ_STEPS', 'STEPS', null, context);
    this.record(identity, principal, targetUserId, 'READ_DAILY_PACK', 'DAILY_PACK', null, context);
    this.record(identity, principal, targetUserId, 'READ_MEDIA', 'MEDIA', null, context);
    this.record(identity, principal, targetUserId, 'READ_AI_USAGE', 'AI_USAGE', null, context);
    return view;
  }

  public readSensitiveUserData(
    principal: AuthenticatedPrincipal,
    targetUserId: string,
    archive: InMemoryArchiveRepository,
    context: AdminRequestContext = {},
  ): SensitiveUserDataView {
    const identity = this.authorize(principal, 'ROOT_READ_SENSITIVE_DATA');
    const snapshot = archive.toSnapshot();
    const bodyMetrics = snapshot.bodyMetrics
      .filter((item) => item.ownerId === targetUserId)
      .map((item) => ({
        id: item.id,
        ownerId: item.ownerId,
        measuredAt: item.measuredAt,
        weightGrams: item.weightGrams,
        bodyFatBasisPoints: item.bodyFatBasisPoints,
        waistMillimetres: item.waistMillimetres,
      }));
    const media = snapshot.media
      .filter((item) => item.ownerId === targetUserId)
      .map((item) => ({
        id: item.id,
        ownerId: item.ownerId,
        contentType: item.contentType,
        bytes: item.bytes,
        sha256: item.sha256,
        width: item.width,
        height: item.height,
        durationMs: item.durationMs,
        status: item.status,
        createdAt: item.createdAt,
        updatedAt: item.updatedAt,
      }));
    this.record(identity, principal, targetUserId, 'READ_SECURITY_METADATA', 'SENSITIVE_DATA', null, context);
    return { ownerId: targetUserId, bodyMetrics, media };
  }

  public readPrivateMessages(
    principal: AuthenticatedPrincipal,
    targetUserId: string,
    reader: PrivateMessageReader | undefined,
    context: AdminRequestContext = {},
  ): readonly JsonObject[] {
    const identity = this.authorize(principal, 'ROOT_READ_PRIVATE_MESSAGES');
    this.record(identity, principal, targetUserId, 'READ_MESSAGE', 'PRIVATE_MESSAGE', null, context);
    if (reader === undefined) {
      throw new AdminBoundaryError('Private-message storage is deferred; no message adapter is connected.');
    }
    return reader.readPrivateMessages(targetUserId).map(clone);
  }

  public readUserDevices(
    principal: AuthenticatedPrincipal,
    targetUserId: string,
    reader: DeviceReader | undefined,
    context: AdminRequestContext = {},
  ): readonly JsonObject[] {
    const identity = this.authorize(principal, 'ROOT_READ_USER_DATA');
    this.record(identity, principal, targetUserId, 'READ_DEVICES', 'DEVICE', null, context);
    if (reader === undefined) {
      throw new AdminBoundaryError('Device storage is deferred; no device adapter is connected.');
    }
    return reader.readDevices(targetUserId).map(clone);
  }

  public exportUserData(
    principal: AuthenticatedPrincipal,
    targetUserId: string,
    archive: InMemoryArchiveRepository,
    context: AdminRequestContext = {},
  ): AdminUserArchiveView {
    const identity = this.authorize(principal, 'ROOT_EXPORT_USER_DATA');
    this.requireRecentReauthentication(context);
    const view = this.buildArchiveView(targetUserId, archive);
    this.record(identity, principal, targetUserId, 'EXPORT_USER_DATA', 'USER_EXPORT', null, context);
    return view;
  }

  public bulkExportUserData(
    principal: AuthenticatedPrincipal,
    targetUserIds: readonly string[],
    archive: InMemoryArchiveRepository,
    context: AdminRequestContext = {},
  ): Readonly<Record<string, AdminUserArchiveView>> {
    const identity = this.authorize(principal, 'ROOT_BULK_EXPORT');
    this.authorize(principal, 'ROOT_EXPORT_USER_DATA');
    this.requireRecentReauthentication(context);
    const result: Record<string, AdminUserArchiveView> = {};
    for (const targetUserId of targetUserIds) {
      result[targetUserId] = this.buildArchiveView(targetUserId, archive);
      this.record(identity, principal, targetUserId, 'EXPORT_USER_DATA', 'BULK_USER_EXPORT', null, context);
    }
    return result;
  }

  public applyAdminRevision<T>(
    principal: AuthenticatedPrincipal,
    targetUserId: string,
    resourceType: string,
    reason: string,
    operation: () => T,
    context: AdminRequestContext = {},
  ): T {
    const identity = this.authorize(principal, 'ROOT_MODIFY_USER_DATA');
    this.requireReasonAndReauthentication(reason, context);
    const result = operation();
    this.record(identity, principal, targetUserId, 'ADMIN_REVISION', resourceType, null, { ...context, reason });
    return result;
  }

  public deleteUserData(
    principal: AuthenticatedPrincipal,
    targetUserId: string,
    resourceId: string,
    reason: string,
    operation: () => void,
    context: AdminRequestContext = {},
  ): void {
    const identity = this.authorize(principal, 'ROOT_DELETE_USER_DATA');
    this.requireReasonAndReauthentication(reason, context);
    operation();
    this.record(identity, principal, targetUserId, 'DELETE_USER_DATA', 'USER_DATA', resourceId, { ...context, reason });
  }

  public simulateMembership(
    principal: AuthenticatedPrincipal,
    planCode: PlanCode,
    targetUserId = principal.userId,
    context: AdminRequestContext = {},
  ): MembershipSimulationContext {
    const identity = this.authorize(principal, 'ROOT_MANAGE_MEMBERSHIP');
    if (this.environment === 'PRODUCTION') {
      throw new AdminAuthorizationError('FORBIDDEN', 'Membership simulation is a development-only tool.');
    }
    const simulation: MembershipSimulationContext = {
      planCode,
      simulatedByAdminId: identity.id,
      isSimulation: true,
    };
    this.record(identity, principal, targetUserId, 'READ_MEMBERSHIP', 'MEMBERSHIP_SIMULATION', null, context);
    return simulation;
  }

  public canManageChannel(principal: AuthenticatedPrincipal, channel: Channel, context: AdminRequestContext = {}): boolean {
    const identity = this.authorize(principal, 'ROOT_MANAGE_CHANNELS');
    this.record(identity, principal, channel.ownerId, 'READ_CHANNEL', 'CHANNEL', channel.id, context);
    return true;
  }

  public createOfficialChannel(
    principal: AuthenticatedPrincipal,
    channel: Channel,
    context: AdminRequestContext = {},
  ): Channel {
    this.canManageChannel(principal, channel, context);
    if (channel.type !== 'OFFICIAL' && channel.type !== 'DEVELOPER') {
      throw new AdminAuthorizationError('INVALID_REQUEST', 'Root official-channel management only accepts official/developer channels.');
    }
    return clone(channel);
  }

  private buildArchiveView(targetUserId: string, archive: InMemoryArchiveRepository): AdminUserArchiveView {
    const snapshot = archive.toSnapshot();
    const targetPrincipal: AuthenticatedPrincipal = {
      userId: targetUserId,
      sessionId: 'admin-read-projection',
      roles: [],
      issuedAt: this.runtime.now(),
    };
    return {
      ownerId: targetUserId,
      entries: filterOwner(snapshot.entries, targetUserId),
      revisions: filterOwner(snapshot.revisions, targetUserId),
      snapshots: filterOwner(snapshot.snapshots, targetUserId),
      publishedSnapshots: filterOwner(snapshot.publishedSnapshots, targetUserId),
      aiInsights: filterOwner(snapshot.aiInsights, targetUserId),
      histories: filterOwner(snapshot.histories, targetUserId),
      fitness: filterOwner(snapshot.fitness, targetUserId),
      bodyMetrics: filterOwner(snapshot.bodyMetrics, targetUserId),
      steps: filterOwner(snapshot.steps, targetUserId),
      dailyPacks: filterOwner(snapshot.dailyPacks, targetUserId),
      media: filterOwner(snapshot.media, targetUserId),
      mediaLinks: filterOwner(snapshot.mediaLinks, targetUserId),
      offlineMutations: filterOwner(snapshot.offlineMutations, targetUserId),
      conflicts: filterOwner(snapshot.conflicts, targetUserId),
      timeline: archive.getTimeline(targetPrincipal, { includeTrashed: true }),
    };
  }

  private requireRecentReauthentication(context: AdminRequestContext): void {
    if (context.reauthenticatedAt === undefined) {
      throw new AdminAuthorizationError('REAUTH_REQUIRED', 'A recent re-authentication is required for export or bulk access.');
    }
    const age = Date.parse(this.runtime.now()) - Date.parse(context.reauthenticatedAt);
    if (!Number.isFinite(age) || age < 0 || age > this.reauthWindowMs) {
      throw new AdminAuthorizationError('REAUTH_REQUIRED', 'The admin re-authentication is outside its allowed window.');
    }
  }

  private requireReasonAndReauthentication(reason: string, context: AdminRequestContext): void {
    if (reason.trim() === '') throw new AdminAuthorizationError('INVALID_REQUEST', 'A reason is required for an admin mutation.');
    this.requireRecentReauthentication(context);
  }

  private record(
    identity: AdminIdentity,
    principal: AuthenticatedPrincipal,
    targetUserId: string,
    action: AdminAccessAction,
    resourceType: string,
    resourceId: string | null,
    context: AdminRequestContext,
  ): void {
    this.audit.append({
      adminId: identity.id,
      targetUserId,
      resourceType,
      resourceId,
      action,
      sessionId: principal.sessionId,
      ipContext: context.ipContext ?? null,
      deviceContext: context.deviceContext ?? null,
      environment: this.environment,
      reason: context.reason ?? null,
    });
  }
}

/**
 * Enforces Private Original -> explicit publish -> immutable snapshot. Plan
 * codes are intentionally not accepted as ordinary visibility values.
 */
export function assertExplicitSnapshotPublication(
  request: ExplicitPublicationRequest,
): ExplicitPublicationDecision {
  if (!request.explicitPublish || request.sourceVisibility !== 'PRIVATE') {
    throw new AdminAuthorizationError('INVALID_REQUEST', 'Only an explicitly published private original may create a snapshot.');
  }
  const targetVisibility = request.targetVisibility as string;
  if (!['COMMUNITY', 'GROUP', 'DIRECT_SHARE', 'PUBLIC'].includes(targetVisibility)) {
    throw new AdminAuthorizationError('INVALID_REQUEST', 'A snapshot must target an ordinary audience visibility, not a plan code.');
  }
  return {
    sourceId: request.sourceId,
    sourceVisibility: 'PRIVATE',
    targetVisibility: targetVisibility as Exclude<ContentVisibility, 'PRIVATE' | 'SNAPSHOT'>,
    publicationState: 'SNAPSHOT',
    founderAudience: request.founderAudience ?? null,
  };
}

export function assertChannelContentSource(request: ChannelContentRequest): true {
  if (request.source === 'PUBLISHED_SNAPSHOT') {
    if (request.snapshot === undefined || request.snapshot.publicationState !== 'SNAPSHOT') {
      throw new AdminAuthorizationError('INVALID_REQUEST', 'Channel content must reference an explicit published snapshot.');
    }
    return true;
  }
  if (request.source === 'ORIGINAL_POST' || request.source === 'REPLY' || request.source === 'UPLOAD') {
    if (
      request.post === undefined ||
      request.post.channelId !== request.channel.id ||
      (request.post.snapshotId == null && !(request.post.body?.trim() ?? ''))
    ) {
      throw new AdminAuthorizationError('INVALID_REQUEST', 'Channel content source metadata is required.');
    }
    return true;
  }
  throw new AdminAuthorizationError('INVALID_REQUEST', 'Unknown channel content source.');
}

function filterOwner<T extends { readonly ownerId: string }>(items: readonly T[], ownerId: string): readonly T[] {
  return items.filter((item) => item.ownerId === ownerId).map(clone);
}

function clone<T>(value: T): T {
  return structuredClone(value);
}
