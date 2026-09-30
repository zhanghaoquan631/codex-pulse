import type { ZodSafeParseResult } from 'zod';

import {
  communityActivityCreateSchema,
  communityChannelCreateSchema,
  communityChannelMembershipActionSchema,
  communityChannelPostCreateSchema,
  communityCommentCreateSchema,
  communityCommentPatchSchema,
  communityFeedModeSchema,
  communityGroupCreateSchema,
  communityGroupMembershipActionSchema,
  communityGroupOwnershipTransferSchema,
  communityModerationActionSchema,
  communityPaginationSchema,
  communityPostCreateSchema,
  communityPostPatchSchema,
  communityQuoteCreateSchema,
  communityProfilePatchSchema,
  communityReportCreateSchema,
  communitySnapshotCreateSchema,
} from '@me-zip/schemas';
import type { AuthenticatedPrincipal, JsonObject } from '@me-zip/shared-types';

import {
  CommunityError,
  type CommunityActivityCreateInput,
  type CommunityChannelCreateInput,
  type CommunityChannelPostCreateInput,
  type CommunityGroupCreateInput,
  type CommunityModerationInput,
  type CommunityPageOptions,
  type CommunityPostCreateInput,
  type CommunityPostPatchInput,
  type CommunityReportCreateInput,
  type CommunityService,
} from './index.js';

export interface CommunityApiRequest {
  readonly method: 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE';
  readonly path: string;
  readonly principal: AuthenticatedPrincipal;
  readonly body?: JsonObject;
  readonly query?: Readonly<Record<string, string | undefined>>;
  /** Maps to the trusted Idempotency-Key header at the HTTP edge. */
  readonly idempotencyKey?: string;
}

export interface CommunityApiResponse {
  readonly status: number;
  readonly body: Readonly<Record<string, unknown>>;
}

function bodyOf(request: CommunityApiRequest): JsonObject {
  return request.body ?? {};
}

function recordOf(value: unknown): Record<string, unknown> {
  if (value === null || typeof value !== 'object' || Array.isArray(value)) return {};
  return value as Record<string, unknown>;
}

function stringOf(value: unknown, field: string): string {
  if (typeof value !== 'string' || value.trim() === '') {
    throw new CommunityError('VALIDATION', `${field} is required.`);
  }
  return value;
}

function optionalString(value: unknown): string | undefined {
  return typeof value === 'string' && value.trim() !== '' ? value : undefined;
}

function parseResult<T>(result: ZodSafeParseResult<T>): T {
  if (!result.success) throw new CommunityError('VALIDATION', 'Community request validation failed.');
  return result.data;
}

function pagination(request: CommunityApiRequest): CommunityPageOptions {
  const parsed = parseResult(
    communityPaginationSchema.safeParse({
      cursor: request.query?.cursor,
      limit: request.query?.limit,
    }),
  );
  return {
    ...(parsed.cursor === undefined ? {} : { cursor: parsed.cursor }),
    ...(parsed.limit === undefined ? {} : { limit: parsed.limit }),
  };
}

function idempotencyKey(request: CommunityApiRequest, body: JsonObject = {}): string | undefined {
  if (request.idempotencyKey !== undefined) return request.idempotencyKey;
  return optionalString(body.idempotencyKey);
}

function queryBoolean(request: CommunityApiRequest, key: string): boolean {
  return request.query?.[key] === 'true';
}

function targetRecord(body: JsonObject): Record<string, unknown> {
  return recordOf(body.target);
}

function mapPostInput(request: CommunityApiRequest): CommunityPostCreateInput {
  const body = bodyOf(request);
  const parsed = parseResult(communityPostCreateSchema.safeParse(body));
  const key = idempotencyKey(request, body);
  const target = targetRecord(body);
  const targetKind = typeof target.kind === 'string' ? target.kind : undefined;
  const targetGroupId = optionalString(target.groupId);
  const targetChannelId = optionalString(target.channelId);
  const targetActivityId = optionalString(target.activityId);
  const groupId = parsed.groupId ?? (targetKind === 'GROUP' ? targetGroupId : undefined);
  const channelId = parsed.channelId ?? (targetKind === 'CHANNEL' ? targetChannelId : undefined);
  const activityId = parsed.activityId ?? (targetKind === 'ACTIVITY' ? targetActivityId : undefined);
  return {
    ...(parsed.body === undefined ? {} : { body: parsed.body }),
    ...(parsed.mediaIds === undefined ? {} : { mediaIds: parsed.mediaIds }),
    ...(parsed.archiveSnapshotId === undefined ? {} : { archiveSnapshotId: parsed.archiveSnapshotId }),
    ...(groupId === undefined ? {} : { groupId }),
    ...(channelId === undefined ? {} : { channelId }),
    ...(activityId === undefined ? {} : { activityId }),
    visibility:
      targetKind === 'GROUP' && parsed.visibility === 'COMMUNITY'
        ? 'GROUP'
        : parsed.visibility,
    ...(parsed.directShareRecipientIds === undefined
      ? {}
      : { directShareRecipientIds: parsed.directShareRecipientIds }),
    ...(key === undefined ? {} : { idempotencyKey: key }),
  };
}

function mapSnapshotInput(request: CommunityApiRequest) {
  const body = bodyOf(request);
  const parsed = parseResult(communitySnapshotCreateSchema.safeParse(body));
  const key = idempotencyKey(request, body);
  const target = parsed.target;
  return {
    sourceEntryId: parsed.sourceEntryId,
    ...(parsed.sourceRevision === undefined ? {} : { sourceRevision: parsed.sourceRevision }),
    ...(parsed.selectedFieldKeys === undefined ? {} : { selectedFieldKeys: parsed.selectedFieldKeys }),
    ...(parsed.selectedMediaIds === undefined ? {} : { selectedMediaIds: parsed.selectedMediaIds }),
    ...(target === undefined
      ? {}
      : {
          target: {
            ...(target.visibility === undefined ? {} : { visibility: target.visibility }),
            ...(target.groupId === undefined ? {} : { groupId: target.groupId }),
            ...(target.channelId === undefined ? {} : { channelId: target.channelId }),
          },
        }),
    ...(key === undefined ? {} : { idempotencyKey: key }),
  };
}

function mapGroupInput(request: CommunityApiRequest): CommunityGroupCreateInput {
  const body = bodyOf(request);
  const parsed = parseResult(communityGroupCreateSchema.safeParse(body));
  const key = idempotencyKey(request, body);
  return {
    name: parsed.name,
    ...(parsed.description === undefined ? {} : { description: parsed.description }),
    ...(parsed.avatarMediaId === undefined ? {} : { avatarMediaId: parsed.avatarMediaId }),
    ...(parsed.coverMediaId === undefined ? {} : { coverMediaId: parsed.coverMediaId }),
    visibility: parsed.visibility,
    ...(key === undefined ? {} : { idempotencyKey: key }),
  };
}

function mapActivityInput(request: CommunityApiRequest): CommunityActivityCreateInput {
  const body = bodyOf(request);
  const parsed = parseResult(communityActivityCreateSchema.safeParse(body));
  const key = idempotencyKey(request, body);
  return {
    ...(parsed.groupId === undefined ? {} : { groupId: parsed.groupId }),
    ...(parsed.channelId === undefined ? {} : { channelId: parsed.channelId }),
    kind: parsed.kind,
    title: parsed.title,
    ...(parsed.description === undefined ? {} : { description: parsed.description }),
    startAt: parsed.startAt,
    ...(parsed.endAt === undefined ? {} : { endAt: parsed.endAt }),
    timezone: parsed.timezone,
    ...(parsed.locationText === undefined ? {} : { locationText: parsed.locationText }),
    ...(parsed.onlineUrl === undefined ? {} : { onlineUrl: parsed.onlineUrl }),
    ...(parsed.capacity === undefined ? {} : { capacity: parsed.capacity }),
    visibility: parsed.visibility,
    ...(parsed.founderAudience === undefined ? {} : { founderAudience: parsed.founderAudience }),
    ...(key === undefined ? {} : { idempotencyKey: key }),
  };
}

function jsonStatus(error: unknown): number {
  if (!(error instanceof CommunityError)) return 500;
  switch (error.code) {
    case 'VALIDATION':
      return 400;
    case 'FORBIDDEN':
    case 'BLOCKED':
    case 'ENTITLEMENT_REQUIRED':
    case 'MODERATION_REQUIRED':
      return 403;
    case 'NOT_FOUND':
      return 404;
    case 'RATE_LIMITED':
      return 429;
    case 'CONFLICT':
    case 'IDEMPOTENCY_REPLAY':
    case 'CAPACITY_FULL':
      return 409;
    case 'INVALID_STATE':
      return 422;
    default:
      return 422;
  }
}

/** Do not serialize internal exception text across the consumer boundary. */
function safeErrorMessage(error: unknown): string {
  if (!(error instanceof CommunityError)) return 'Community request failed.';
  switch (error.code) {
    case 'VALIDATION':
      return 'Community request validation failed.';
    case 'FORBIDDEN':
      return 'This Community resource is not available to this principal.';
    case 'BLOCKED':
      return 'This interaction is unavailable because one participant blocked the other.';
    case 'ENTITLEMENT_REQUIRED':
      return 'This action requires a Community entitlement.';
    case 'NOT_FOUND':
      return 'Community resource was not found.';
    case 'CONFLICT':
      return 'This Community action conflicts with the current state.';
    case 'IDEMPOTENCY_REPLAY':
      return 'This request key was already used with different input.';
    case 'CAPACITY_FULL':
      return 'This activity has reached capacity.';
    case 'RATE_LIMITED':
      return 'This Community action is temporarily limited.';
    case 'INVALID_STATE':
      return 'This Community action is not available in the current state.';
    case 'MODERATION_REQUIRED':
      return 'A separately authenticated moderation boundary is required.';
    default:
      return 'Community request failed.';
  }
}

/** Framework-neutral HTTP/WeChat adapter. It never derives identity from JSON. */
export class CommunityApiAdapter {
  public constructor(private readonly service: CommunityService) {}

  public handle(request: CommunityApiRequest): CommunityApiResponse {
    try {
      const data = this.route(request);
      return {
        status: request.method === 'POST' || request.method === 'PUT' ? 201 : 200,
        body: { data },
      };
    } catch (error) {
      const status = jsonStatus(error);
      return {
        status,
        body: {
          error: {
            code: error instanceof CommunityError ? error.code : 'INTERNAL',
            message: safeErrorMessage(error),
            retryable: status >= 500 || status === 409 || status === 429,
          },
        },
      };
    }
  }

  private route(request: CommunityApiRequest): unknown {
    const body = bodyOf(request);
    const communityPrefix = /^\/v1\/community\/?/u;
    const adminPrefix = /^\/v1\/admin\/community\/?/u;
    if (adminPrefix.test(request.path)) return this.adminRoute(request, request.path.replace(adminPrefix, '').split('/').filter(Boolean));
    if (!communityPrefix.test(request.path)) throw new CommunityError('NOT_FOUND', 'Community route was not found.');
    const segments = request.path.replace(communityPrefix, '').split('/').filter(Boolean);
    const [resource, id, subresource, action] = segments;
    if (resource === 'feed' && request.method === 'GET') {
      const rawMode = request.query?.mode ?? request.query?.view ?? 'DISCOVER';
      const modeResult = communityFeedModeSchema.safeParse(rawMode.toUpperCase());
      const mode = parseResult(modeResult);
      return this.service.getFeed(request.principal, mode, pagination(request));
    }
    if (resource === 'search' && request.method === 'GET') {
      return this.service.search(request.principal, stringOf(request.query?.q, 'q'), pagination(request));
    }
    if (resource === 'snapshots' && request.method === 'POST') {
      return this.service.publishSnapshot(request.principal, mapSnapshotInput(request));
    }
    if (resource === 'profile' && request.method === 'PATCH') {
      const parsed = parseResult(communityProfilePatchSchema.safeParse(body));
      return this.service.updateProfile(request.principal, {
        ...(parsed.displayName === undefined ? {} : { displayName: parsed.displayName }),
        ...(parsed.avatarMediaId === undefined ? {} : { avatarMediaId: parsed.avatarMediaId }),
        ...(parsed.bio === undefined ? {} : { bio: parsed.bio }),
        ...(parsed.profileVisibility === undefined ? {} : { profileVisibility: parsed.profileVisibility }),
        ...(parsed.followPermission === undefined ? {} : { followPermission: parsed.followPermission }),
      });
    }
    if (resource === 'posts') return this.postRoute(request, id, subresource, action);
    if (resource === 'comments') return this.commentRoute(request, id, subresource);
    if (resource === 'users') return this.userRoute(request, id, subresource);
    if (resource === 'groups') return this.groupRoute(request, id, subresource, action);
    if (resource === 'channels') return this.channelRoute(request, id, subresource, action);
    if (resource === 'activities') return this.activityRoute(request, id, subresource);
    if (resource === 'notifications') return this.notificationRoute(request, id);
    if (resource === 'reports' && request.method === 'POST') {
      const parsed = parseResult(communityReportCreateSchema.safeParse(body));
      const key = idempotencyKey(request, body);
      const input: CommunityReportCreateInput = {
        targetType: parsed.targetType,
        targetId: parsed.targetId,
        reason: parsed.reason,
        ...(parsed.details === undefined ? {} : { details: parsed.details }),
        ...(key === undefined ? {} : { idempotencyKey: key }),
      };
      return this.service.createReport(request.principal, input);
    }
    throw new CommunityError('NOT_FOUND', 'Community route was not found.');
  }

  private postRoute(
    request: CommunityApiRequest,
    id: string | undefined,
    subresource: string | undefined,
    action: string | undefined,
  ): unknown {
    if (id === undefined && request.method === 'POST') return this.service.createPost(request.principal, mapPostInput(request));
    if (id === undefined) throw new CommunityError('NOT_FOUND', 'Post was not found.');
    if (subresource === undefined && request.method === 'GET') return this.service.getPost(request.principal, id);
    if (subresource === undefined && request.method === 'PATCH') {
      const body = bodyOf(request);
      const parsed = parseResult(communityPostPatchSchema.safeParse(body));
      const key = idempotencyKey(request, body);
      const input: CommunityPostPatchInput = {
        ...(parsed.body === undefined ? {} : { body: parsed.body }),
        ...(parsed.mediaIds === undefined ? {} : { mediaIds: parsed.mediaIds }),
        ...(key === undefined ? {} : { idempotencyKey: key }),
      };
      return this.service.updatePost(request.principal, id, input);
    }
    if (subresource === undefined && request.method === 'DELETE') return this.service.deletePost(request.principal, id, idempotencyKey(request, bodyOf(request)));
    if (subresource === 'quote' && request.method === 'POST') {
      const body = bodyOf(request);
      const parsed = parseResult(communityQuoteCreateSchema.safeParse(body));
      return this.service.createQuote(
        request.principal,
        id,
        parsed.commentary ?? null,
        idempotencyKey(request, body),
      );
    }
    if (subresource === 'reactions' && action === 'LIKE' && (request.method === 'PUT' || request.method === 'POST')) return this.service.addReaction(request.principal, id, 'LIKE', idempotencyKey(request, bodyOf(request)));
    if (subresource === 'reactions' && action === 'LIKE' && request.method === 'DELETE') return this.service.removeReaction(request.principal, id, 'LIKE', idempotencyKey(request, bodyOf(request)));
    if (subresource === 'comments' && request.method === 'GET') {
      const parentCommentId = optionalString(request.query?.parentCommentId);
      return this.service.listComments(request.principal, id, {
        ...pagination(request),
        ...(parentCommentId === undefined ? {} : { parentCommentId }),
      });
    }
    if (subresource === 'comments' && request.method === 'POST') {
      const parsed = parseResult(communityCommentCreateSchema.safeParse(bodyOf(request)));
      return this.service.createComment(request.principal, id, parsed.body, idempotencyKey(request, bodyOf(request)));
    }
    if (subresource === 'save' && request.method === 'PUT') return this.service.savePost(request.principal, id, idempotencyKey(request, bodyOf(request)));
    if (subresource === 'save' && request.method === 'DELETE') return this.service.unsavePost(request.principal, id, idempotencyKey(request, bodyOf(request)));
    if (subresource === 'repost' && request.method === 'PUT') {
      return this.service.setRepost(request.principal, id, true, idempotencyKey(request, bodyOf(request)));
    }
    if (subresource === 'repost' && request.method === 'DELETE') {
      return this.service.setRepost(request.principal, id, false, idempotencyKey(request, bodyOf(request)));
    }
    throw new CommunityError('NOT_FOUND', 'Post route was not found.');
  }

  private commentRoute(request: CommunityApiRequest, id: string | undefined, subresource: string | undefined): unknown {
    if (id === undefined) throw new CommunityError('NOT_FOUND', 'Comment was not found.');
    const body = bodyOf(request);
    if (subresource === 'replies' && request.method === 'POST') {
      const parsed = parseResult(communityCommentCreateSchema.safeParse(body));
      return this.service.createReply(request.principal, id, parsed.body, idempotencyKey(request, body));
    }
    if (subresource === undefined && request.method === 'PATCH') {
      const parsed = parseResult(communityCommentPatchSchema.safeParse(body));
      return this.service.updateComment(request.principal, id, parsed.body, idempotencyKey(request, body));
    }
    if (subresource === undefined && request.method === 'DELETE') return this.service.deleteComment(request.principal, id, idempotencyKey(request, body));
    throw new CommunityError('NOT_FOUND', 'Comment route was not found.');
  }

  private userRoute(request: CommunityApiRequest, id: string | undefined, subresource: string | undefined): unknown {
    if (id === undefined) throw new CommunityError('NOT_FOUND', 'User was not found.');
    const targetUserId = id === 'self' ? request.principal.userId : id;
    const key = idempotencyKey(request, bodyOf(request));
    if (subresource === undefined && request.method === 'GET') return this.service.getProfile(request.principal, targetUserId);
    if (subresource === 'follow' && (request.method === 'PUT' || request.method === 'POST')) return this.service.followUser(request.principal, targetUserId, key);
    if (subresource === 'follow' && request.method === 'DELETE') return this.service.unfollowUser(request.principal, targetUserId, key);
    if (subresource === 'block' && (request.method === 'PUT' || request.method === 'POST')) return this.service.blockUser(request.principal, targetUserId, key);
    if (subresource === 'block' && request.method === 'DELETE') return this.service.unblockUser(request.principal, targetUserId, key);
    if (subresource === 'followers' && request.method === 'GET') return this.service.listFollowers(request.principal, targetUserId, pagination(request));
    if (subresource === 'following' && request.method === 'GET') return this.service.listFollowing(request.principal, targetUserId, pagination(request));
    throw new CommunityError('NOT_FOUND', 'User route was not found.');
  }

  private groupRoute(request: CommunityApiRequest, id: string | undefined, subresource: string | undefined, action: string | undefined): unknown {
    const body = bodyOf(request);
    if (id === undefined && request.method === 'GET') return this.service.listGroups(request.principal, { ...pagination(request), mine: queryBoolean(request, 'mine') });
    if (id === undefined && request.method === 'POST') return this.service.createGroup(request.principal, mapGroupInput(request));
    if (id === undefined) throw new CommunityError('NOT_FOUND', 'Group was not found.');
    if (subresource === undefined && request.method === 'GET') return this.service.getGroup(request.principal, id);
    if (subresource === 'posts' && request.method === 'GET') return this.service.listGroupPosts(request.principal, id, pagination(request));
    if (subresource === 'memberships' && action === 'join' && request.method === 'POST') return this.service.joinGroup(request.principal, id, idempotencyKey(request, body));
    if (subresource === 'memberships' && action === 'leave' && request.method === 'POST') return this.service.leaveGroup(request.principal, id, idempotencyKey(request, body));
    if (subresource === 'members' && request.method === 'GET') return this.service.listGroupMembers(request.principal, id, pagination(request));
    if (subresource === 'ownership' && request.method === 'POST') {
      const parsed = parseResult(communityGroupOwnershipTransferSchema.safeParse(body));
      return this.service.transferGroupOwnership(request.principal, id, parsed.nextOwnerUserId, idempotencyKey(request, body));
    }
    if (subresource === 'archive' && request.method === 'POST') return this.service.archiveGroup(request.principal, id, idempotencyKey(request, body));
    if (subresource === 'memberships' && action !== undefined && request.method === 'POST') {
      const parsed = parseResult(communityGroupMembershipActionSchema.safeParse(body));
      const targetUserId = parsed.userId ?? request.principal.userId;
      if (parsed.action === 'JOIN') return this.service.joinGroup(request.principal, id, idempotencyKey(request, body));
      if (parsed.action === 'LEAVE') return this.service.leaveGroup(request.principal, id, idempotencyKey(request, body));
      return this.service.manageGroupMembership(request.principal, id, targetUserId, parsed.action === 'ACCEPT_INVITE' ? 'ACCEPT_INVITE' : parsed.action, idempotencyKey(request, body));
    }
    throw new CommunityError('NOT_FOUND', 'Group route was not found.');
  }

  private channelRoute(request: CommunityApiRequest, id: string | undefined, subresource: string | undefined, action: string | undefined): unknown {
    const body = bodyOf(request);
    if (id === undefined && request.method === 'GET') return this.service.listChannels(request.principal, { ...pagination(request), mine: queryBoolean(request, 'mine') });
    if (id === undefined && request.method === 'POST') {
      const parsed = parseResult(communityChannelCreateSchema.safeParse(body));
      const key = idempotencyKey(request, body);
      const input: CommunityChannelCreateInput = {
        type: parsed.type,
        slug: parsed.slug,
        name: parsed.name,
        ...(parsed.description === undefined ? {} : { description: parsed.description }),
        visibility: parsed.visibility,
        ...(parsed.founderAudience === undefined ? {} : { founderAudience: parsed.founderAudience }),
        ...(key === undefined ? {} : { idempotencyKey: key }),
      };
      return this.service.createChannel(request.principal, input);
    }
    if (id === undefined) throw new CommunityError('NOT_FOUND', 'Channel was not found.');
    if (subresource === undefined && request.method === 'GET') return this.service.getChannel(request.principal, id);
    if (subresource === 'posts' && request.method === 'GET') return this.service.listChannelPosts(request.principal, id, pagination(request));
    if (subresource === 'posts' && request.method === 'POST') {
      const parsed = parseResult(communityChannelPostCreateSchema.safeParse(body));
      const key = idempotencyKey(request, body);
      const input: CommunityChannelPostCreateInput = {
        ...(parsed.body === undefined ? {} : { body: parsed.body }),
        ...(parsed.mediaIds === undefined ? {} : { mediaIds: parsed.mediaIds }),
        ...(parsed.archiveSnapshotId === undefined ? {} : { archiveSnapshotId: parsed.archiveSnapshotId }),
        visibility: parsed.visibility,
        ...(parsed.founderAudience === undefined ? {} : { founderAudience: parsed.founderAudience }),
        ...(key === undefined ? {} : { idempotencyKey: key }),
      };
      return this.service.createChannelPost(request.principal, id, input);
    }
    if (subresource === 'memberships' && action === 'join' && request.method === 'POST') return this.service.joinChannel(request.principal, id, idempotencyKey(request, body));
    if (subresource === 'memberships' && action === 'leave' && request.method === 'POST') return this.service.leaveChannel(request.principal, id, idempotencyKey(request, body));
    if (subresource === 'archive' && request.method === 'POST') return this.service.archiveChannel(request.principal, id, idempotencyKey(request, body));
    if (subresource === 'memberships' && request.method === 'POST') {
      const parsed = parseResult(communityChannelMembershipActionSchema.safeParse(body));
      return parsed.action === 'JOIN'
        ? this.service.joinChannel(request.principal, id, idempotencyKey(request, body))
        : this.service.leaveChannel(request.principal, id, idempotencyKey(request, body));
    }
    throw new CommunityError('NOT_FOUND', 'Channel route was not found.');
  }

  private activityRoute(request: CommunityApiRequest, id: string | undefined, subresource: string | undefined): unknown {
    const body = bodyOf(request);
    if (id === undefined && request.method === 'GET') return this.service.listActivities(request.principal, { ...pagination(request), joined: queryBoolean(request, 'joined'), upcomingOnly: queryBoolean(request, 'upcomingOnly') });
    if (id === undefined && request.method === 'POST') return this.service.createActivity(request.principal, mapActivityInput(request));
    if (id === undefined) throw new CommunityError('NOT_FOUND', 'Activity was not found.');
    if (subresource === undefined && request.method === 'GET') return this.service.getActivity(request.principal, id);
    if (subresource === 'registration' && (request.method === 'PUT' || request.method === 'POST')) return this.service.joinActivity(request.principal, id, idempotencyKey(request, body));
    if (subresource === 'registration' && request.method === 'DELETE') return this.service.cancelActivityRegistration(request.principal, id, idempotencyKey(request, body));
    if (subresource === 'registrations' && request.method === 'GET') return this.service.listActivityRegistrations(request.principal, id, pagination(request));
    if (subresource === 'status' && request.method === 'POST') {
      const action = typeof body.status === 'string' ? body.status : '';
      if (action !== 'CANCELLED' && action !== 'COMPLETED') throw new CommunityError('VALIDATION', 'Activity status is invalid.');
      return this.service.updateActivityStatus(request.principal, id, action, idempotencyKey(request, body));
    }
    throw new CommunityError('NOT_FOUND', 'Activity route was not found.');
  }

  private notificationRoute(request: CommunityApiRequest, id: string | undefined): unknown {
    const body = bodyOf(request);
    if (id === undefined && request.method === 'GET') return this.service.listNotifications(request.principal, { ...pagination(request), unreadOnly: queryBoolean(request, 'unreadOnly') });
    if (id !== undefined && request.method === 'POST') return this.service.markNotificationRead(request.principal, id, idempotencyKey(request, body));
    throw new CommunityError('NOT_FOUND', 'Notification route was not found.');
  }

  private adminRoute(request: CommunityApiRequest, segments: readonly string[]): unknown {
    const [resource, id] = segments;
    if (resource === 'reports' && request.method === 'GET') return this.service.listReports(request.principal, pagination(request));
    if (resource === 'cases' && request.method === 'GET') return this.service.listModerationCases(request.principal, pagination(request));
    if (resource === 'moderation' && id !== undefined && request.method === 'POST') {
      const body = bodyOf(request);
      const parsed = parseResult(communityModerationActionSchema.safeParse(body));
      const input: CommunityModerationInput = { action: parsed.action, reason: parsed.reason };
      return this.service.moderate(request.principal, id, input);
    }
    if (resource === 'channels' && request.method === 'POST') {
      const body = bodyOf(request);
      const parsed = parseResult(communityChannelCreateSchema.safeParse(body));
      const key = idempotencyKey(request, body);
      return this.service.createChannel(request.principal, {
        type: parsed.type,
        slug: parsed.slug,
        name: parsed.name,
        ...(parsed.description === undefined ? {} : { description: parsed.description }),
        visibility: parsed.visibility,
        ...(parsed.founderAudience === undefined ? {} : { founderAudience: parsed.founderAudience }),
        ...(key === undefined ? {} : { idempotencyKey: key }),
      });
    }
    throw new CommunityError('NOT_FOUND', 'Admin Community route was not found.');
  }
}
