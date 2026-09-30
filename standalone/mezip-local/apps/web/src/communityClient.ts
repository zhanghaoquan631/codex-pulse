/**
 * Community client boundary for the Web app.
 *
 * This module never reads an archive record directly and never accepts an
 * actor, owner, entitlement, or admin identity from the browser. Those values
 * must be derived and authorized by the server. Until a Community API base URL
 * is explicitly configured, the default adapter fails closed rather than
 * fabricating social state from fixtures.
 */

import {
  mapActivityPage,
  mapActivityRegistration,
  mapBlock,
  mapChannelMembership,
  mapChannelPage,
  mapComment,
  mapCommentPage,
  mapCommunityResult,
  mapFollow,
  mapGroupMembership,
  mapGroupPage,
  mapMarked,
  mapNotificationPage,
  mapPost,
  mapPostPage,
  mapProfileResult,
  mapReaction,
  mapRepost,
  mapReport,
  mapSaved,
  mapSearchPage,
  mapSnapshotPublication,
} from './communityResponse.js';

export const communityFeedKinds = ['DISCOVER', 'FOLLOWING', 'LATEST'] as const;
export type CommunityFeedKind = (typeof communityFeedKinds)[number];

export const communityPostVisibilities = [
  'COMMUNITY',
  'GROUP',
  'DIRECT_SHARE',
  'PUBLIC',
] as const;
export type CommunityPostVisibility = (typeof communityPostVisibilities)[number];

export const communityChannelTypes = [
  'OFFICIAL',
  'COMMUNITY',
  'BETA',
  'FEEDBACK',
  'EVENT',
  'CREATOR',
  'DEVELOPER',
] as const;
export type CommunityChannelType = (typeof communityChannelTypes)[number];

export const founderAudiences = [
  'FOUNDER_PUBLIC',
  'FOUNDER_FREE',
  'FOUNDER_GO',
  'FOUNDER_PLUS',
  'FOUNDER_PRO',
  'FOUNDER_PRO_MAX',
] as const;
export type FounderAudience = (typeof founderAudiences)[number];

export const reportReasons = [
  'SPAM',
  'HARASSMENT',
  'HATE',
  'SEXUAL',
  'VIOLENCE',
  'SCAM',
  'MISINFORMATION',
  'PRIVACY',
  'COPYRIGHT',
  'OTHER',
] as const;
export type ReportReason = (typeof reportReasons)[number];

export type CommunityClientSource = 'SERVER' | 'UNAVAILABLE';

export type CommunityFailureCode =
  | 'SERVICE_UNAVAILABLE'
  | 'OFFLINE'
  | 'UNAUTHORIZED'
  | 'ENTITLEMENT_REQUIRED'
  | 'FORBIDDEN'
  | 'BLOCKED'
  | 'NOT_FOUND'
  | 'VALIDATION'
  | 'CONFLICT'
  | 'RATE_LIMITED'
  | 'CAPACITY_REACHED'
  | 'UNKNOWN';

export interface CommunityClientError {
  readonly code: CommunityFailureCode;
  /** Safe, short presentation text only. Never includes post/comment bodies. */
  readonly message: string;
  readonly retryable: boolean;
}

export type CommunityResult<T> =
  | {
      readonly ok: true;
      readonly data: T;
      readonly source: CommunityClientSource;
    }
  | {
      readonly ok: false;
      readonly error: CommunityClientError;
      readonly source: CommunityClientSource;
    };

export interface CommunityCursorPage<T> {
  readonly items: readonly T[];
  readonly nextCursor: string | null;
}

/** Public presentation identity. Do not add email, phone, OpenID, or raw IDs to UI copy. */
export interface CommunityAuthor {
  /** Opaque public identifier used for relation endpoints; never display it. */
  readonly userId: string;
  readonly displayName: string;
  readonly avatarLabel: string | null;
}

export interface CommunityMediaPreview {
  readonly id: string;
  readonly type: 'IMAGE' | 'VIDEO';
  readonly alt: string;
  readonly thumbnailUrl: string | null;
  readonly posterUrl: string | null;
}

export interface CommunitySnapshotPreview {
  readonly id: string;
  readonly sourceType: 'LIFE' | 'HISTORY' | 'FITNESS' | 'DAILY_PACK' | 'MEDIA';
  readonly sourceRevision: number;
  readonly title: string | null;
  readonly excerpt: string | null;
}

export interface CommunityPostContext {
  readonly kind: 'COMMUNITY' | 'GROUP' | 'CHANNEL' | 'ACTIVITY';
  readonly id: string | null;
  readonly label: string;
}

export interface CommunityPostViewerState {
  readonly reacted: boolean;
  readonly saved: boolean;
  readonly authorFollowed: boolean;
  readonly authorBlocked: boolean;
  readonly canComment: boolean;
  readonly reposted: boolean;
}

export type CommunityQuotePreview =
  | {
      readonly state: 'AVAILABLE';
      readonly post: {
        readonly id: string;
        readonly author: CommunityAuthor;
        readonly body: string | null;
        readonly snapshot: CommunitySnapshotPreview | null;
        readonly createdAt: string;
      };
    }
  | { readonly state: 'UNAVAILABLE' };

export interface CommunityRepostAttribution {
  readonly author: CommunityAuthor;
  readonly repostedAt: string;
}

export interface CommunityRepostResult {
  readonly reposted: boolean;
  readonly repostCount: number;
  readonly repostedBy: CommunityRepostAttribution | null;
}

export interface CommunityReactionViewerResult {
  readonly reacted: boolean;
}

export interface CommunityPost {
  readonly id: string;
  readonly author: CommunityAuthor;
  readonly body: string | null;
  readonly media: readonly CommunityMediaPreview[];
  readonly snapshot: CommunitySnapshotPreview | null;
  readonly visibility: CommunityPostVisibility;
  readonly context: CommunityPostContext;
  readonly publishedAt: string;
  readonly status: 'PUBLISHED' | 'HIDDEN' | 'REMOVED';
  readonly reactionCount: number;
  readonly commentCount: number;
  readonly repostCount: number;
  readonly quote: CommunityQuotePreview | null;
  readonly repostedBy: CommunityRepostAttribution | null;
  readonly viewer: CommunityPostViewerState;
}

export interface CommunityComment {
  readonly id: string;
  readonly postId: string;
  readonly parentCommentId: string | null;
  readonly author: CommunityAuthor;
  readonly body: string;
  readonly createdAt: string;
  readonly status: 'PUBLISHED' | 'HIDDEN' | 'REMOVED';
  readonly replyCount: number;
  readonly viewer: {
    readonly canReply: boolean;
    readonly authorBlocked: boolean;
  };
}

export interface CommunityGroup {
  readonly id: string;
  readonly name: string;
  readonly description: string;
  readonly visibility: 'PUBLIC' | 'PRIVATE';
  readonly status: 'ACTIVE' | 'ARCHIVED';
  readonly memberCount: number;
  readonly membership: 'NONE' | 'PENDING' | 'MEMBER' | 'OWNER' | 'BLOCKED';
}

export interface CommunityChannel {
  readonly id: string;
  readonly type: CommunityChannelType;
  readonly name: string;
  readonly description: string | null;
  readonly visibility: CommunityPostVisibility | 'PRIVATE';
  readonly founderAudience: FounderAudience | null;
  readonly membership: 'NONE' | 'MEMBER' | 'OWNER';
}

export interface CommunityActivity {
  readonly id: string;
  readonly title: string;
  readonly description: string;
  readonly kind: 'ONLINE' | 'OFFLINE' | 'COMMUNITY' | 'FOUNDER' | 'GROUP';
  readonly startAt: string;
  readonly endAt: string | null;
  readonly timezone: string;
  readonly locationText: string | null;
  readonly capacity: number | null;
  readonly registeredCount: number;
  readonly status: 'PUBLISHED' | 'CANCELLED' | 'COMPLETED';
  readonly visibility: CommunityPostVisibility;
  readonly viewer: {
    readonly registered: boolean;
    readonly canRegister: boolean;
  };
}

export interface CommunityNotification {
  readonly id: string;
  readonly type:
    | 'FOLLOW'
    | 'REACTION'
    | 'COMMENT'
    | 'REPLY'
    | 'QUOTE'
    | 'REPOST'
    | 'GROUP_INVITE'
    | 'GROUP_APPROVED'
    | 'ACTIVITY_REMINDER'
    | 'CHANNEL_UPDATE'
    | 'MODERATION';
  /** A server-sanitized, minimal summary. Never a copy of private content. */
  readonly summary: string;
  readonly createdAt: string;
  readonly readAt: string | null;
  readonly href: string | null;
}

export interface CommunityProfile {
  readonly userId: string;
  readonly displayName: string;
  readonly bio: string | null;
  readonly avatarLabel: string | null;
  readonly profileVisibility: 'PUBLIC' | 'COMMUNITY' | 'PRIVATE';
  readonly followerCount: number;
  readonly followingCount: number;
  readonly postCount: number;
  readonly viewer: {
    readonly isSelf: boolean;
    readonly followed: boolean;
    readonly blocked: boolean;
    readonly followAllowed: boolean;
  };
}

export interface CommunitySearchResult {
  readonly type: 'USER' | 'POST' | 'GROUP' | 'CHANNEL' | 'ACTIVITY';
  readonly id: string;
  readonly title: string;
  readonly snippet: string;
  readonly createdAt: string;
}

export interface CommunityBootstrap {
  readonly capabilities: readonly string[];
  readonly unreadNotificationCount: number;
  readonly profile: CommunityProfile | null;
}

export type CommunityTarget =
  | { readonly kind: 'COMMUNITY' }
  | { readonly kind: 'GROUP'; readonly groupId: string }
  | { readonly kind: 'CHANNEL'; readonly channelId: string };

/**
 * This request is intentionally ownerless. The server must derive ownership,
 * validate membership/entitlements, and reject a blocked author relationship.
 */
export interface CreateCommunityPostInput {
  readonly target: CommunityTarget;
  readonly body: string;
  readonly visibility: CommunityPostVisibility;
  readonly mediaIds?: readonly string[];
  readonly idempotencyKey: string;
}

/**
 * An immutable source reference is required for any archive-derived publish.
 * The browser never serializes private body, tags, metrics, or media metadata
 * into this request: the authenticated server reads the authorized revision and
 * creates the independent snapshot from that source.
 */
export interface PublishSnapshotInput {
  readonly target: CommunityTarget;
  readonly sourceEntryId: string;
  readonly sourceRevision: number;
  readonly visibility: CommunityPostVisibility;
  readonly idempotencyKey: string;
}

export interface CommunitySnapshotPublication {
  readonly snapshot: {
    readonly id: string;
    readonly archiveSnapshotId: string;
    readonly sourceRevision: number;
    readonly visibility: CommunityPostVisibility;
  };
  readonly post: CommunityPost;
}

export interface CommunityClient {
  readonly source: CommunityClientSource;
  getBootstrap(): Promise<CommunityResult<CommunityBootstrap>>;
  listFeed(input: {
    readonly kind: CommunityFeedKind;
    readonly cursor?: string;
    readonly limit?: number;
    readonly channelId?: string;
    readonly groupId?: string;
  }): Promise<CommunityResult<CommunityCursorPage<CommunityPost>>>;
  createPost(input: CreateCommunityPostInput): Promise<CommunityResult<CommunityPost>>;
  createQuote(input: {
    readonly postId: string;
    readonly commentary?: string | null;
    readonly idempotencyKey: string;
  }): Promise<CommunityResult<CommunityPost>>;
  publishSnapshot(input: PublishSnapshotInput): Promise<CommunityResult<CommunitySnapshotPublication>>;
  setReaction(input: {
    readonly postId: string;
    readonly active: boolean;
    readonly idempotencyKey: string;
  }): Promise<CommunityResult<CommunityReactionViewerResult>>;
  listComments(input: {
    readonly postId: string;
    readonly cursor?: string;
    readonly limit?: number;
  }): Promise<CommunityResult<CommunityCursorPage<CommunityComment>>>;
  createComment(input: {
    readonly postId: string;
    readonly body: string;
    readonly parentCommentId?: string;
    readonly idempotencyKey: string;
  }): Promise<CommunityResult<CommunityComment>>;
  setSaved(input: {
    readonly postId: string;
    readonly saved: boolean;
    readonly idempotencyKey: string;
  }): Promise<CommunityResult<{ readonly saved: boolean }>>;
  setRepost(input: {
    readonly postId: string;
    readonly reposted: boolean;
    readonly idempotencyKey: string;
  }): Promise<CommunityResult<CommunityRepostResult>>;
  setFollow(input: {
    readonly userId: string;
    readonly followed: boolean;
    readonly idempotencyKey: string;
  }): Promise<CommunityResult<{ readonly followed: boolean }>>;
  setBlock(input: {
    readonly userId: string;
    readonly blocked: boolean;
    readonly idempotencyKey: string;
  }): Promise<CommunityResult<{ readonly blocked: boolean }>>;
  listGroups(input: {
    readonly cursor?: string;
    readonly limit?: number;
  }): Promise<CommunityResult<CommunityCursorPage<CommunityGroup>>>;
  changeGroupMembership(input: {
    readonly groupId: string;
    readonly action: 'JOIN' | 'LEAVE';
    readonly idempotencyKey: string;
  }): Promise<CommunityResult<{ readonly groupId: string; readonly membership: CommunityGroup['membership'] }>>;
  listChannels(input: {
    readonly cursor?: string;
    readonly limit?: number;
  }): Promise<CommunityResult<CommunityCursorPage<CommunityChannel>>>;
  changeChannelMembership(input: {
    readonly channelId: string;
    readonly action: 'JOIN' | 'LEAVE';
    readonly idempotencyKey: string;
  }): Promise<CommunityResult<{ readonly channelId: string; readonly membership: CommunityChannel['membership'] }>>;
  listActivities(input: {
    readonly cursor?: string;
    readonly limit?: number;
  }): Promise<CommunityResult<CommunityCursorPage<CommunityActivity>>>;
  changeActivityRegistration(input: {
    readonly activityId: string;
    readonly action: 'JOIN' | 'CANCEL';
    readonly idempotencyKey: string;
  }): Promise<CommunityResult<{ readonly activityId: string; readonly registered: boolean }>>;
  listNotifications(input: {
    readonly cursor?: string;
    readonly limit?: number;
  }): Promise<CommunityResult<CommunityCursorPage<CommunityNotification>>>;
  markNotificationRead(input: {
    readonly notificationId: string;
    readonly idempotencyKey: string;
  }): Promise<CommunityResult<{ readonly markedCount: number }>>;
  search(input: {
    readonly query: string;
    readonly cursor?: string;
    readonly limit?: number;
  }): Promise<CommunityResult<CommunityCursorPage<CommunitySearchResult>>>;
  getProfile(input: {
    readonly userId: 'self' | string;
  }): Promise<CommunityResult<CommunityProfile>>;
  submitReport(input: {
    readonly target: 'POST' | 'COMMENT' | 'USER' | 'GROUP' | 'CHANNEL' | 'ACTIVITY';
    readonly targetId: string;
    readonly reason: ReportReason;
    readonly detail?: string;
    readonly idempotencyKey: string;
  }): Promise<CommunityResult<{ readonly reportId: string }>>;
}

const unavailableError: CommunityClientError = {
  code: 'SERVICE_UNAVAILABLE',
  message: '社区服务尚未连接；不会使用演示数据代替真实状态。',
  retryable: true,
};

function unavailable<T>(): CommunityResult<T> {
  return { ok: false, source: 'UNAVAILABLE', error: unavailableError };
}

/**
 * Local default adapter. It intentionally exposes no data and persists no
 * social state, so an unconfigured browser cannot imply a successful publish,
 * reaction, follow, registration, or authorization decision.
 */
export class UnavailableCommunityClient implements CommunityClient {
  readonly source = 'UNAVAILABLE' as const;

  async getBootstrap(): Promise<CommunityResult<CommunityBootstrap>> { return unavailable(); }
  async listFeed(): Promise<CommunityResult<CommunityCursorPage<CommunityPost>>> { return unavailable(); }
  async createPost(): Promise<CommunityResult<CommunityPost>> { return unavailable(); }
  async createQuote(): Promise<CommunityResult<CommunityPost>> { return unavailable(); }
  async publishSnapshot(): Promise<CommunityResult<CommunitySnapshotPublication>> { return unavailable(); }
  async setReaction(): Promise<CommunityResult<CommunityReactionViewerResult>> { return unavailable(); }
  async listComments(): Promise<CommunityResult<CommunityCursorPage<CommunityComment>>> { return unavailable(); }
  async createComment(): Promise<CommunityResult<CommunityComment>> { return unavailable(); }
  async setSaved(): Promise<CommunityResult<{ readonly saved: boolean }>> { return unavailable(); }
  async setRepost(): Promise<CommunityResult<CommunityRepostResult>> { return unavailable(); }
  async setFollow(): Promise<CommunityResult<{ readonly followed: boolean }>> { return unavailable(); }
  async setBlock(): Promise<CommunityResult<{ readonly blocked: boolean }>> { return unavailable(); }
  async listGroups(): Promise<CommunityResult<CommunityCursorPage<CommunityGroup>>> { return unavailable(); }
  async changeGroupMembership(): Promise<CommunityResult<{ readonly groupId: string; readonly membership: CommunityGroup['membership'] }>> { return unavailable(); }
  async listChannels(): Promise<CommunityResult<CommunityCursorPage<CommunityChannel>>> { return unavailable(); }
  async changeChannelMembership(): Promise<CommunityResult<{ readonly channelId: string; readonly membership: CommunityChannel['membership'] }>> { return unavailable(); }
  async listActivities(): Promise<CommunityResult<CommunityCursorPage<CommunityActivity>>> { return unavailable(); }
  async changeActivityRegistration(): Promise<CommunityResult<{ readonly activityId: string; readonly registered: boolean }>> { return unavailable(); }
  async listNotifications(): Promise<CommunityResult<CommunityCursorPage<CommunityNotification>>> { return unavailable(); }
  async markNotificationRead(): Promise<CommunityResult<{ readonly markedCount: number }>> { return unavailable(); }
  async search(): Promise<CommunityResult<CommunityCursorPage<CommunitySearchResult>>> { return unavailable(); }
  async getProfile(): Promise<CommunityResult<CommunityProfile>> { return unavailable(); }
  async submitReport(): Promise<CommunityResult<{ readonly reportId: string }>> { return unavailable(); }
}

export interface CommunityTransport {
  request<T>(input: {
    readonly path: string;
    readonly method: 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE';
    readonly query?: Readonly<Record<string, string | number | undefined>>;
    readonly body?: unknown;
    readonly idempotencyKey?: string;
  }): Promise<CommunityResult<T>>;
}

function queryString(
  query: Readonly<Record<string, string | number | undefined>> | undefined,
): string {
  if (query === undefined) return '';
  const parameters = new URLSearchParams();
  for (const [key, value] of Object.entries(query)) {
    if (value !== undefined) parameters.set(key, String(value));
  }
  const encoded = parameters.toString();
  return encoded.length === 0 ? '' : `?${encoded}`;
}

function failureFromStatus(status: number): CommunityClientError {
  if (status === 401) return { code: 'UNAUTHORIZED', message: '请先完成安全登录。', retryable: false };
  if (status === 403) return { code: 'FORBIDDEN', message: '当前账号无权执行此操作。', retryable: false };
  if (status === 404) return { code: 'NOT_FOUND', message: '请求的公开资源不存在或不可访问。', retryable: false };
  if (status === 409) return { code: 'CONFLICT', message: '内容状态已变化，请刷新后重试。', retryable: true };
  if (status === 422) return { code: 'VALIDATION', message: '请检查提交内容。', retryable: false };
  if (status === 429) return { code: 'RATE_LIMITED', message: '操作过于频繁，请稍后再试。', retryable: true };
  return { code: 'UNKNOWN', message: '社区服务暂时不可用。', retryable: status >= 500 };
}

function safeServerError(value: unknown, fallback: CommunityClientError): CommunityClientError {
  if (typeof value !== 'object' || value === null || !('error' in value)) return fallback;
  const candidate = value.error;
  if (typeof candidate !== 'object' || candidate === null) return fallback;
  const code = 'code' in candidate && typeof candidate.code === 'string' ? candidate.code : undefined;
  const message =
    'message' in candidate && typeof candidate.message === 'string'
      ? candidate.message.slice(0, 240)
      : fallback.message;
  const allowed = new Set<CommunityFailureCode>([
    'SERVICE_UNAVAILABLE', 'OFFLINE', 'UNAUTHORIZED', 'ENTITLEMENT_REQUIRED',
    'FORBIDDEN', 'BLOCKED', 'NOT_FOUND', 'VALIDATION', 'CONFLICT',
    'RATE_LIMITED', 'CAPACITY_REACHED', 'UNKNOWN',
  ]);
  const aliases: Readonly<Record<string, CommunityFailureCode>> = {
    COMMUNITY_NOT_FOUND: 'NOT_FOUND',
    COMMUNITY_ENTITLEMENT_REQUIRED: 'ENTITLEMENT_REQUIRED',
    COMMUNITY_BLOCKED: 'BLOCKED',
    GROUP_MEMBERSHIP_REQUIRED: 'FORBIDDEN',
    ACTIVITY_CAPACITY_REACHED: 'CAPACITY_REACHED',
    COMMUNITY_IDEMPOTENCY_REPLAY: 'CONFLICT',
  };
  const normalizedCode = code === undefined
    ? fallback.code
    : aliases[code] ?? (allowed.has(code as CommunityFailureCode)
      ? code as CommunityFailureCode
      : fallback.code);
  return {
    code: normalizedCode,
    message,
    retryable: fallback.retryable,
  };
}

export interface FetchCommunityTransportOptions {
  readonly baseUrl: string;
  readonly fetchFn?: typeof fetch;
}

/**
 * Credentialed JSON transport for the future API service. It performs no
 * request unless a base URL is explicitly supplied to the runtime factory.
 */
export class FetchCommunityTransport implements CommunityTransport {
  private readonly baseUrl: string;
  private readonly fetchFn: typeof fetch;

  constructor(options: FetchCommunityTransportOptions) {
    this.baseUrl = options.baseUrl.replace(/\/$/, '');
    this.fetchFn = options.fetchFn ?? fetch;
  }

  async request<T>(input: {
    readonly path: string;
    readonly method: 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE';
    readonly query?: Readonly<Record<string, string | number | undefined>>;
    readonly body?: unknown;
    readonly idempotencyKey?: string;
  }): Promise<CommunityResult<T>> {
    try {
      const headers: Record<string, string> = { Accept: 'application/json' };
      if (input.body !== undefined) headers['Content-Type'] = 'application/json';
      if (input.idempotencyKey !== undefined) headers['Idempotency-Key'] = input.idempotencyKey;
      const request: RequestInit = {
        method: input.method,
        credentials: 'include',
        headers,
      };
      if (input.body !== undefined) request.body = JSON.stringify(input.body);
      const response = await this.fetchFn(
        `${this.baseUrl}${input.path}${queryString(input.query)}`,
        request,
      );
      const payload: unknown = await response.json().catch(() => undefined);
      if (!response.ok) {
        return { ok: false, source: 'SERVER', error: safeServerError(payload, failureFromStatus(response.status)) };
      }
      if (typeof payload !== 'object' || payload === null || !('data' in payload)) {
        return {
          ok: false,
          source: 'SERVER',
          error: { code: 'UNKNOWN', message: '社区服务返回了无效响应。', retryable: true },
        };
      }
      return { ok: true, source: 'SERVER', data: payload.data as T };
    } catch {
      return {
        ok: false,
        source: 'SERVER',
        error: { code: 'OFFLINE', message: '无法连接社区服务。', retryable: true },
      };
    }
  }
}

/** Endpoint mapper kept separate from UI so transport can be replaced safely. */
export class ApiCommunityClient implements CommunityClient {
  readonly source = 'SERVER' as const;

  constructor(private readonly transport: CommunityTransport) {}

  private mutation<T>(
    path: string,
    method: 'POST' | 'PUT' | 'PATCH' | 'DELETE',
    input: { readonly idempotencyKey: string },
  ): Promise<CommunityResult<T>> {
    const { idempotencyKey, ...body } = input;
    return this.transport.request<T>({ path, method, body, idempotencyKey });
  }

  getBootstrap() { return this.transport.request<CommunityBootstrap>({ path: '/v1/community/bootstrap', method: 'GET' }); }
  listFeed(input: Parameters<CommunityClient['listFeed']>[0]) {
    return mapCommunityResult(this.transport.request<unknown>({
      path: '/v1/community/feed',
      method: 'GET',
      query: {
        mode: input.kind,
        cursor: input.cursor,
        limit: input.limit,
        channelId: input.channelId,
        groupId: input.groupId,
      },
    }), mapPostPage);
  }
  createPost(input: CreateCommunityPostInput) {
    return mapCommunityResult(this.mutation<unknown>('/v1/community/posts', 'POST', input), mapPost);
  }
  createQuote(input: Parameters<CommunityClient['createQuote']>[0]) {
    const { postId, idempotencyKey, ...body } = input;
    return mapCommunityResult(this.transport.request<unknown>({
      path: `/v1/community/posts/${encodeURIComponent(postId)}/quote`,
      method: 'POST',
      body,
      idempotencyKey,
    }), mapPost);
  }
  publishSnapshot(input: PublishSnapshotInput) {
    return mapCommunityResult(this.mutation<unknown>('/v1/community/snapshots', 'POST', input), mapSnapshotPublication);
  }
  setReaction(input: Parameters<CommunityClient['setReaction']>[0]) {
    return mapCommunityResult(this.transport.request<unknown>({
      path: `/v1/community/posts/${encodeURIComponent(input.postId)}/reactions/LIKE`,
      method: input.active ? 'PUT' : 'DELETE',
      idempotencyKey: input.idempotencyKey,
    }), (value) => mapReaction(value, input.active));
  }
  listComments(input: Parameters<CommunityClient['listComments']>[0]) {
    return mapCommunityResult(this.transport.request<unknown>({
      path: `/v1/community/posts/${encodeURIComponent(input.postId)}/comments`, method: 'GET',
      query: { cursor: input.cursor, limit: input.limit },
    }), mapCommentPage);
  }
  createComment(input: Parameters<CommunityClient['createComment']>[0]) {
    return mapCommunityResult(this.mutation<unknown>(
      `/v1/community/posts/${encodeURIComponent(input.postId)}/comments`,
      'POST',
      input,
    ), mapComment);
  }
  setSaved(input: Parameters<CommunityClient['setSaved']>[0]) {
    return mapCommunityResult(this.transport.request<unknown>({
      path: `/v1/community/posts/${encodeURIComponent(input.postId)}/save`,
      method: input.saved ? 'PUT' : 'DELETE',
      idempotencyKey: input.idempotencyKey,
    }), mapSaved);
  }
  setRepost(input: Parameters<CommunityClient['setRepost']>[0]) {
    return mapCommunityResult(this.transport.request<unknown>({
      path: `/v1/community/posts/${encodeURIComponent(input.postId)}/repost`,
      method: input.reposted ? 'PUT' : 'DELETE',
      idempotencyKey: input.idempotencyKey,
    }), mapRepost);
  }
  setFollow(input: Parameters<CommunityClient['setFollow']>[0]) {
    return mapCommunityResult(this.transport.request<unknown>({
      path: `/v1/community/users/${encodeURIComponent(input.userId)}/follow`,
      method: input.followed ? 'PUT' : 'DELETE',
      idempotencyKey: input.idempotencyKey,
    }), mapFollow);
  }
  setBlock(input: Parameters<CommunityClient['setBlock']>[0]) {
    return mapCommunityResult(this.transport.request<unknown>({
      path: `/v1/community/users/${encodeURIComponent(input.userId)}/block`,
      method: input.blocked ? 'PUT' : 'DELETE',
      idempotencyKey: input.idempotencyKey,
    }), mapBlock);
  }
  listGroups(input: Parameters<CommunityClient['listGroups']>[0]) {
    return mapCommunityResult(this.transport.request<unknown>({ path: '/v1/community/groups', method: 'GET', query: input }), mapGroupPage);
  }
  changeGroupMembership(input: Parameters<CommunityClient['changeGroupMembership']>[0]) {
    return mapCommunityResult(this.transport.request<unknown>({
      path: `/v1/community/groups/${encodeURIComponent(input.groupId)}/memberships/${input.action.toLowerCase()}`,
      method: 'POST',
      idempotencyKey: input.idempotencyKey,
    }), (value) => mapGroupMembership(value, input.groupId, input.action === 'JOIN' ? 'MEMBER' : 'NONE'));
  }
  listChannels(input: Parameters<CommunityClient['listChannels']>[0]) {
    return mapCommunityResult(this.transport.request<unknown>({ path: '/v1/community/channels', method: 'GET', query: input }), mapChannelPage);
  }
  changeChannelMembership(input: Parameters<CommunityClient['changeChannelMembership']>[0]) {
    return mapCommunityResult(this.transport.request<unknown>({
      path: `/v1/community/channels/${encodeURIComponent(input.channelId)}/memberships/${input.action.toLowerCase()}`,
      method: 'POST',
      idempotencyKey: input.idempotencyKey,
    }), (value) => mapChannelMembership(value, input.channelId, input.action === 'JOIN' ? 'MEMBER' : 'NONE'));
  }
  listActivities(input: Parameters<CommunityClient['listActivities']>[0]) {
    return mapCommunityResult(this.transport.request<unknown>({ path: '/v1/community/activities', method: 'GET', query: input }), mapActivityPage);
  }
  changeActivityRegistration(input: Parameters<CommunityClient['changeActivityRegistration']>[0]) {
    return mapCommunityResult(this.transport.request<unknown>({
      path: `/v1/community/activities/${encodeURIComponent(input.activityId)}/registration`,
      method: input.action === 'JOIN' ? 'PUT' : 'DELETE',
      idempotencyKey: input.idempotencyKey,
    }), (value) => mapActivityRegistration(value, input.activityId, input.action === 'JOIN'));
  }
  listNotifications(input: Parameters<CommunityClient['listNotifications']>[0]) {
    return mapCommunityResult(this.transport.request<unknown>({ path: '/v1/community/notifications', method: 'GET', query: input }), mapNotificationPage);
  }
  markNotificationRead(input: Parameters<CommunityClient['markNotificationRead']>[0]) {
    return mapCommunityResult(this.transport.request<unknown>({
      path: `/v1/community/notifications/${encodeURIComponent(input.notificationId)}/read`,
      method: 'POST',
      idempotencyKey: input.idempotencyKey,
    }), mapMarked);
  }
  search(input: Parameters<CommunityClient['search']>[0]) {
    return mapCommunityResult(this.transport.request<unknown>({
      path: '/v1/community/search',
      method: 'GET',
      query: { q: input.query, cursor: input.cursor, limit: input.limit },
    }), mapSearchPage);
  }
  getProfile(input: Parameters<CommunityClient['getProfile']>[0]) {
    return mapCommunityResult(this.transport.request<unknown>({
      path: `/v1/community/users/${encodeURIComponent(input.userId)}`,
      method: 'GET',
    }), mapProfileResult);
  }
  submitReport(input: Parameters<CommunityClient['submitReport']>[0]) {
    return mapCommunityResult(this.mutation<unknown>('/v1/community/reports', 'POST', input), mapReport);
  }
}

export function createRuntimeCommunityClient(
  baseUrl = import.meta.env.VITE_MEZIP_COMMUNITY_API_BASE_URL,
): CommunityClient {
  const normalized = baseUrl?.trim();
  if (normalized === undefined || normalized.length === 0) return new UnavailableCommunityClient();
  return new ApiCommunityClient(new FetchCommunityTransport({ baseUrl: normalized }));
}

/** Stable app singleton. Production config swaps transport; UI contracts stay unchanged. */
export const communityClient: CommunityClient = createRuntimeCommunityClient();

export function createCommunityActionKey(scope: string): string {
  const prefix = scope.replace(/[^a-z0-9_-]/gi, '').slice(0, 32) || 'action';
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return `${prefix}-${crypto.randomUUID()}`;
  }
  return `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
}
