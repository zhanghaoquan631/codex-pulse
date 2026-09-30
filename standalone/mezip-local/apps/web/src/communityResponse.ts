/**
 * Boundary mappers for the Web Community client.
 *
 * The domain service and the Web view intentionally have different shapes:
 * the service exposes opaque IDs and server-derived fields, while the view
 * needs small presentation projections.  Keeping this conversion here makes
 * a real API response usable without teaching React about persistence rows.
 * Unknown or incomplete payloads fail closed; no synthetic social success is
 * manufactured.
 */
import type {
  CommunityActivity,
  CommunityChannel,
  CommunityClientError,
  CommunityComment,
  CommunityCursorPage,
  CommunityGroup,
  CommunityNotification,
  CommunityPost,
  CommunityProfile,
  CommunityReactionViewerResult,
  CommunityRepostResult,
  CommunityResult,
  CommunitySearchResult,
  CommunitySnapshotPreview,
  CommunitySnapshotPublication,
} from './communityClient.js';

type RecordValue = Record<string, unknown>;

function recordOf(value: unknown): RecordValue | null {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
    ? (value as RecordValue)
    : null;
}

function textOf(value: unknown): string | null {
  return typeof value === 'string' && value.trim().length > 0 ? value : null;
}

function numberOf(value: unknown, fallback = 0): number {
  return typeof value === 'number' && Number.isFinite(value) ? value : fallback;
}

function boolOf(value: unknown, fallback = false): boolean {
  return typeof value === 'boolean' ? value : fallback;
}

function listOf(value: unknown): readonly unknown[] {
  return Array.isArray(value) ? value : [];
}

function unknownPayloadError(): CommunityClientError {
  return {
    code: 'UNKNOWN',
    message: '社区服务返回了无法识别的数据。',
    retryable: true,
  };
}

export function mapCommunityResult<T, U>(
  result: CommunityResult<T>,
  mapper: (value: T) => U | null,
): CommunityResult<U>;
export function mapCommunityResult<T, U>(
  result: Promise<CommunityResult<T>>,
  mapper: (value: T) => U | null,
): Promise<CommunityResult<U>>;
export function mapCommunityResult<T, U>(
  result: CommunityResult<T> | Promise<CommunityResult<T>>,
  mapper: (value: T) => U | null,
): CommunityResult<U> | Promise<CommunityResult<U>> {
  if (result instanceof Promise) return result.then((resolved) => mapCommunityResult(resolved, mapper));
  if (!result.ok) return result;
  try {
    const mapped = mapper(result.data);
    if (mapped === null) {
      return { ok: false, source: 'SERVER', error: unknownPayloadError() };
    }
    return { ok: true, source: 'SERVER', data: mapped };
  } catch {
    return { ok: false, source: 'SERVER', error: unknownPayloadError() };
  }
}

function isWebPost(value: RecordValue): value is RecordValue & CommunityPost {
  const viewer = recordOf(value.viewer);
  return (
    recordOf(value.author) !== null &&
    recordOf(value.context) !== null &&
    typeof value.publishedAt === 'string' &&
    typeof value.repostCount === 'number' &&
    'quote' in value &&
    typeof viewer?.reposted === 'boolean'
  );
}

function mapMedia(value: unknown): CommunityPost['media'][number] | null {
  const source = recordOf(value);
  if (source === null || typeof source.id !== 'string' && typeof source.mediaId !== 'string') return null;
  const id = textOf(source.id) ?? textOf(source.mediaId);
  if (id === null) return null;
  const type = source.type === 'VIDEO' || source.kind === 'VIDEO' ? 'VIDEO' : 'IMAGE';
  return {
    id,
    type,
    alt: textOf(source.alt) ?? textOf(source.altText) ?? '',
    thumbnailUrl: textOf(source.thumbnailUrl),
    posterUrl: textOf(source.posterUrl),
  };
}

function mapAuthor(value: unknown, fallbackId: string): CommunityPost['author'] {
  const source = recordOf(value);
  return {
    userId: textOf(source?.userId) ?? fallbackId,
    displayName: textOf(source?.displayName) ?? 'ME.zip member',
    avatarLabel: textOf(source?.avatarLabel) ?? textOf(source?.avatarMediaId),
  };
}

function contextFor(source: RecordValue): CommunityPost['context'] {
  const kind = source.context === 'GROUP' || source.groupId !== null && source.groupId !== undefined
    ? 'GROUP'
    : source.context === 'CHANNEL' || source.channelId !== null && source.channelId !== undefined
      ? 'CHANNEL'
      : source.context === 'ACTIVITY' || source.activityId !== null && source.activityId !== undefined
        ? 'ACTIVITY'
        : 'COMMUNITY';
  const labels: Record<CommunityPost['context']['kind'], string> = {
    COMMUNITY: '社区',
    GROUP: '群组',
    CHANNEL: '频道',
    ACTIVITY: '活动',
  };
  return { kind, id: textOf(source.groupId) ?? textOf(source.channelId) ?? textOf(source.activityId), label: labels[kind] };
}

function mapSnapshot(value: unknown): CommunitySnapshotPreview | null {
  const source = recordOf(value);
  if (source === null || typeof source.id !== 'string') return null;
  const sourceType = source.sourceType === 'HISTORY' || source.sourceType === 'FITNESS' || source.sourceType === 'DAILY_PACK' || source.sourceType === 'MEDIA'
    ? source.sourceType
    : 'LIFE';
  return {
    id: source.id,
    sourceType,
    sourceRevision: numberOf(source.sourceRevision, 1),
    title: textOf(source.title),
    excerpt: textOf(source.excerpt),
  };
}

function mapQuote(value: unknown): CommunityPost['quote'] | null | undefined {
  if (value === null) return null;
  const source = recordOf(value);
  if (source === null) return undefined;
  if (source.state === 'UNAVAILABLE') return { state: 'UNAVAILABLE' };
  if (source.state !== 'AVAILABLE') return undefined;
  const post = recordOf(source.post);
  if (post === null || typeof post.id !== 'string') return undefined;
  return {
    state: 'AVAILABLE',
    post: {
      id: post.id,
      author: mapAuthor(post.author, textOf(post.authorId) ?? 'unknown'),
      body: textOf(post.body),
      snapshot: post.snapshot === null ? null : mapSnapshot(post.snapshot),
      createdAt: textOf(post.createdAt) ?? new Date(0).toISOString(),
    },
  };
}

function mapRepostAttribution(value: unknown): CommunityPost['repostedBy'] | null | undefined {
  if (value === null) return null;
  const source = recordOf(value);
  if (source === null) return undefined;
  const author = recordOf(source.author);
  if (author === null || typeof source.repostedAt !== 'string') return undefined;
  return {
    author: mapAuthor(author, textOf(author.userId) ?? 'unknown'),
    repostedAt: source.repostedAt,
  };
}

function mapPostValue(value: unknown): CommunityPost | null {
  const source = recordOf(value);
  if (source === null || typeof source.id !== 'string') return null;
  if (isWebPost(source)) return source;
  const authorId = textOf(source.authorId);
  if (authorId === null) return null;
  const visibility = source.visibility;
  if (visibility !== 'COMMUNITY' && visibility !== 'GROUP' && visibility !== 'DIRECT_SHARE' && visibility !== 'PUBLIC') return null;
  const media = listOf(source.media).map(mapMedia);
  if (media.some((item) => item === null)) return null;
  const snapshotId = textOf(source.publishedSnapshotId);
  const publishedPreview = recordOf(source.snapshot);
  const snapshotContent = recordOf(source.snapshotContent);
  const sourceType: 'LIFE' | 'HISTORY' | 'FITNESS' | 'DAILY_PACK' | 'MEDIA' =
    publishedPreview?.sourceType === 'HISTORY' || publishedPreview?.sourceType === 'FITNESS' || publishedPreview?.sourceType === 'DAILY_PACK' || publishedPreview?.sourceType === 'MEDIA'
      ? publishedPreview.sourceType
      : source.sourceType === 'HISTORY' || source.sourceType === 'FITNESS' || source.sourceType === 'DAILY_PACK' || source.sourceType === 'MEDIA'
        ? source.sourceType
        : 'LIFE';
  const previewId = snapshotId ?? textOf(publishedPreview?.id);
  const snapshotRevision = numberOf(publishedPreview?.sourceRevision ?? source.sourceRevision, 1);
  const snapshot = previewId === null
    ? null
    : {
        id: previewId,
        sourceType,
        sourceRevision: snapshotRevision,
        title: textOf(publishedPreview?.title) ?? textOf(snapshotContent?.title),
        excerpt: textOf(publishedPreview?.excerpt) ?? textOf(snapshotContent?.body) ?? textOf(snapshotContent?.excerpt),
      };
  const viewer = recordOf(source.viewer);
  const status = source.status === 'HIDDEN' || source.status === 'REMOVED' || source.status === 'DELETED' ? 'REMOVED' : 'PUBLISHED';
  const quote = mapQuote(source.quote);
  const repostedBy = mapRepostAttribution(source.repostedBy);
  if (quote === undefined || repostedBy === undefined) return null;
  return {
    id: source.id,
    author: mapAuthor(source.author, authorId),
    body: textOf(source.body),
    media: media as CommunityPost['media'],
    snapshot,
    visibility,
    context: contextFor(source),
    publishedAt: textOf(source.publishedAt) ?? textOf(source.createdAt) ?? new Date(0).toISOString(),
    status,
    reactionCount: numberOf(source.reactionCount),
    commentCount: numberOf(source.commentCount),
    repostCount: numberOf(source.repostCount),
    quote,
    repostedBy,
    viewer: {
      reacted: boolOf(viewer?.reacted),
      saved: boolOf(viewer?.saved),
      authorFollowed: boolOf(viewer?.authorFollowed) || boolOf(viewer?.followingAuthor),
      authorBlocked: boolOf(viewer?.authorBlocked),
      canComment: boolOf(viewer?.canComment),
      reposted: boolOf(viewer?.reposted),
    },
  };
}

export function mapPost(value: unknown): CommunityPost | null {
  return mapPostValue(value);
}

function mapPage<T>(value: unknown, mapper: (item: unknown) => T | null): CommunityCursorPage<T> | null {
  const source = recordOf(value);
  if (source === null || !Array.isArray(source.items)) return null;
  const items = source.items.map(mapper);
  if (items.some((item) => item === null)) return null;
  return { items: items as T[], nextCursor: textOf(source.nextCursor) };
}

export function mapPostPage(value: unknown): CommunityCursorPage<CommunityPost> | null {
  return mapPage(value, mapPost);
}

export function mapSnapshotPublication(value: unknown): CommunitySnapshotPublication | null {
  const source = recordOf(value);
  if (source === null) return null;
  const snapshot = recordOf(source.snapshot);
  const post = mapPost(source.post);
  if (snapshot === null || post === null || typeof snapshot.id !== 'string') return null;
  const visibility = snapshot.visibility;
  if (visibility !== 'COMMUNITY' && visibility !== 'GROUP' && visibility !== 'DIRECT_SHARE' && visibility !== 'PUBLIC') return null;
  const snapshotContent = recordOf(snapshot.snapshotContent);
  const enrichedPost: CommunityPost = {
    ...post,
    snapshot: {
      id: snapshot.id,
      sourceType: 'LIFE',
      sourceRevision: numberOf(snapshot.sourceRevision, 1),
      title: textOf(snapshotContent?.title),
      excerpt: textOf(snapshotContent?.body) ?? textOf(snapshotContent?.excerpt),
    },
  };
  return {
    snapshot: {
      id: snapshot.id,
      archiveSnapshotId: textOf(snapshot.archiveSnapshotId) ?? snapshot.id,
      sourceRevision: numberOf(snapshot.sourceRevision, 1),
      visibility,
    },
    post: enrichedPost,
  };
}

export function mapReaction(value: unknown, active: boolean): CommunityReactionViewerResult | null {
  const source = recordOf(value);
  if (source === null) return null;
  if (typeof source.reacted === 'boolean') return { reacted: source.reacted };
  if (typeof source.removed === 'boolean') return { reacted: !source.removed };
  if (typeof source.postId === 'string' && typeof source.type === 'string') return { reacted: active };
  return null;
}

export function mapComment(value: unknown): CommunityComment | null {
  const source = recordOf(value);
  if (source === null || typeof source.id !== 'string' || typeof source.postId !== 'string') return null;
  if (recordOf(source.author) !== null && typeof source.replyCount === 'number') return source as unknown as CommunityComment;
  const authorId = textOf(source.authorId);
  const body = textOf(source.body);
  if (authorId === null || body === null) return null;
  return {
    id: source.id,
    postId: source.postId,
    parentCommentId: textOf(source.parentCommentId),
    author: mapAuthor(source.author, authorId),
    body,
    createdAt: textOf(source.createdAt) ?? new Date(0).toISOString(),
    status: source.status === 'HIDDEN' || source.status === 'REMOVED' || source.status === 'DELETED' ? 'REMOVED' : 'PUBLISHED',
    replyCount: numberOf(source.replyCount),
    viewer: {
      // Missing authorization metadata is deliberately treated as disabled.
      canReply: boolOf(recordOf(source.viewer)?.canReply),
      authorBlocked: boolOf(recordOf(source.viewer)?.authorBlocked),
    },
  };
}

export function mapCommentPage(value: unknown): CommunityCursorPage<CommunityComment> | null {
  return mapPage(value, mapComment);
}

function membershipFor(value: RecordValue, kind: 'GROUP' | 'CHANNEL'): 'NONE' | 'PENDING' | 'MEMBER' | 'OWNER' | 'BLOCKED' {
  const explicit = value.membership;
  if (explicit === 'NONE' || explicit === 'PENDING' || explicit === 'MEMBER' || explicit === 'OWNER' || explicit === 'BLOCKED') return explicit;
  const status = value.status;
  if (status === 'BANNED') return 'BLOCKED';
  if (status === 'PENDING' || status === 'INVITED') return 'PENDING';
  if (status === 'ACTIVE') return value.role === 'OWNER' ? 'OWNER' : 'MEMBER';
  return kind === 'GROUP' && value.role === 'OWNER' ? 'OWNER' : 'NONE';
}

export function mapGroup(value: unknown): CommunityGroup | null {
  const source = recordOf(value);
  if (source === null || typeof source.id !== 'string' && typeof source.groupId !== 'string') return null;
  const id = textOf(source.id) ?? textOf(source.groupId);
  if (id === null) return null;
  return {
    id,
    name: textOf(source.name) ?? '未命名群组',
    description: textOf(source.description) ?? '',
    visibility: source.visibility === 'PRIVATE' || source.visibility === 'INVITE_ONLY' ? 'PRIVATE' : 'PUBLIC',
    status: source.status === 'ARCHIVED' || source.status === 'DELETED' ? 'ARCHIVED' : 'ACTIVE',
    memberCount: numberOf(source.memberCount),
    membership: membershipFor(source, 'GROUP'),
  };
}

export function mapGroupPage(value: unknown): CommunityCursorPage<CommunityGroup> | null {
  return mapPage(value, mapGroup);
}

export function mapGroupMembership(value: unknown, fallbackId: string, membership: CommunityGroup['membership']): { readonly groupId: string; readonly membership: CommunityGroup['membership'] } | null {
  const source = recordOf(value);
  if (source === null && fallbackId.length === 0) return null;
  return { groupId: textOf(source?.groupId) ?? fallbackId, membership: source === null ? membership : membershipFor(source, 'GROUP') };
}

export function mapChannel(value: unknown): CommunityChannel | null {
  const source = recordOf(value);
  if (source === null || typeof source.id !== 'string' && typeof source.channelId !== 'string') return null;
  const id = textOf(source.id) ?? textOf(source.channelId);
  if (id === null) return null;
  const visibility = source.visibility === 'PRIVATE' ? 'PRIVATE' : source.visibility === 'GROUP' || source.visibility === 'DIRECT_SHARE' ? source.visibility : 'PUBLIC';
  const membership = membershipFor(source, 'CHANNEL');
  return {
    id,
    type: source.type === 'OFFICIAL' || source.type === 'DEVELOPER' || source.type === 'BETA' || source.type === 'FEEDBACK' || source.type === 'EVENT' || source.type === 'CREATOR' ? source.type : 'COMMUNITY',
    name: textOf(source.name) ?? '未命名频道',
    description: textOf(source.description),
    visibility,
    founderAudience: textOf(source.founderAudience) as CommunityChannel['founderAudience'],
    membership: membership === 'BLOCKED' || membership === 'PENDING' ? 'NONE' : membership,
  };
}

export function mapChannelPage(value: unknown): CommunityCursorPage<CommunityChannel> | null {
  return mapPage(value, mapChannel);
}

export function mapChannelMembership(value: unknown, fallbackId: string, membership: CommunityChannel['membership']): { readonly channelId: string; readonly membership: CommunityChannel['membership'] } | null {
  const source = recordOf(value);
  if (source === null && fallbackId.length === 0) return null;
  const resolved = source === null ? membership : membershipFor(source, 'CHANNEL');
  return { channelId: textOf(source?.channelId) ?? fallbackId, membership: resolved === 'BLOCKED' || resolved === 'PENDING' ? 'NONE' : resolved };
}

export function mapActivity(value: unknown): CommunityActivity | null {
  const source = recordOf(value);
  if (source === null || typeof source.id !== 'string' && typeof source.activityId !== 'string') return null;
  const id = textOf(source.id) ?? textOf(source.activityId);
  if (id === null) return null;
  const visibility = source.visibility === 'GROUP' || source.visibility === 'DIRECT_SHARE' || source.visibility === 'COMMUNITY' ? source.visibility : 'PUBLIC';
  return {
    id,
    title: textOf(source.title) ?? '未命名活动',
    description: textOf(source.description) ?? '',
    kind: source.kind === 'ONLINE' || source.kind === 'OFFLINE' || source.kind === 'COMMUNITY' || source.kind === 'FOUNDER' || source.kind === 'GROUP' ? source.kind : 'COMMUNITY',
    startAt: textOf(source.startAt) ?? new Date(0).toISOString(),
    endAt: textOf(source.endAt),
    timezone: textOf(source.timezone) ?? 'Asia/Shanghai',
    locationText: textOf(source.locationText),
    capacity: typeof source.capacity === 'number' ? source.capacity : null,
    registeredCount: numberOf(source.registeredCount),
    status: source.status === 'CANCELLED' || source.status === 'COMPLETED' ? source.status : 'PUBLISHED',
    visibility,
    viewer: {
      registered: boolOf(recordOf(source.viewer)?.registered),
      canRegister: boolOf(recordOf(source.viewer)?.canRegister),
    },
  };
}

export function mapActivityPage(value: unknown): CommunityCursorPage<CommunityActivity> | null {
  return mapPage(value, mapActivity);
}

export function mapActivityRegistration(value: unknown, fallbackId: string, registered: boolean): { readonly activityId: string; readonly registered: boolean } | null {
  const source = recordOf(value);
  if (source === null && fallbackId.length === 0) return null;
  const status = source?.status;
  return { activityId: textOf(source?.activityId) ?? fallbackId, registered: typeof source?.registered === 'boolean' ? source.registered : status === 'ACTIVE' ? true : status === 'CANCELLED' ? false : registered };
}

export function mapNotification(value: unknown): CommunityNotification | null {
  const source = recordOf(value);
  if (source === null || typeof source.id !== 'string') return null;
  return {
    id: source.id,
    type: source.type === 'FOLLOW' || source.type === 'REACTION' || source.type === 'COMMENT' || source.type === 'REPLY' || source.type === 'QUOTE' || source.type === 'REPOST' || source.type === 'GROUP_INVITE' || source.type === 'GROUP_APPROVED' || source.type === 'ACTIVITY_REMINDER' || source.type === 'CHANNEL_UPDATE' || source.type === 'MODERATION' ? source.type : 'MODERATION',
    summary: textOf(source.summary) ?? textOf(source.summaryCode) ?? '社区有一条新通知。',
    createdAt: textOf(source.createdAt) ?? new Date(0).toISOString(),
    readAt: textOf(source.readAt) ?? (source.status === 'READ' ? textOf(source.updatedAt) : null),
    href: textOf(source.href),
  };
}

export function mapNotificationPage(value: unknown): CommunityCursorPage<CommunityNotification> | null {
  return mapPage(value, mapNotification);
}

export function mapProfile(value: unknown): CommunityProfile | null {
  const source = recordOf(value);
  if (source === null || typeof source.userId !== 'string') return null;
  const viewer = recordOf(source.viewer);
  return {
    userId: source.userId,
    displayName: textOf(source.displayName) ?? 'ME.zip member',
    bio: textOf(source.bio),
    avatarLabel: textOf(source.avatarLabel) ?? textOf(source.avatarMediaId),
    profileVisibility: source.profileVisibility === 'PRIVATE' ? 'PRIVATE' : source.profileVisibility === 'COMMUNITY' ? 'COMMUNITY' : 'PUBLIC',
    followerCount: numberOf(source.followerCount),
    followingCount: numberOf(source.followingCount),
    postCount: numberOf(source.postCount),
    viewer: {
      isSelf: boolOf(viewer?.isSelf),
      followed: boolOf(viewer?.followed),
      blocked: boolOf(viewer?.blocked),
      followAllowed: boolOf(viewer?.followAllowed),
    },
  };
}

export function mapProfileResult(value: unknown): CommunityProfile | null {
  return mapProfile(value);
}

export function mapSearchResult(value: unknown): CommunitySearchResult | null {
  const source = recordOf(value);
  if (source === null || typeof source.id !== 'string' || (source.type !== 'USER' && source.type !== 'POST' && source.type !== 'GROUP' && source.type !== 'CHANNEL' && source.type !== 'ACTIVITY')) return null;
  return {
    type: source.type,
    id: source.id,
    title: textOf(source.title) ?? '未命名结果',
    snippet: textOf(source.snippet) ?? '',
    createdAt: textOf(source.createdAt) ?? new Date(0).toISOString(),
  };
}

export function mapSearchPage(value: unknown): CommunityCursorPage<CommunitySearchResult> | null {
  return mapPage(value, mapSearchResult);
}

export function mapSaved(value: unknown): { readonly saved: boolean } | null {
  const source = recordOf(value);
  return source !== null && typeof source.saved === 'boolean' ? { saved: source.saved } : null;
}

export function mapRepost(value: unknown): CommunityRepostResult | null {
  const source = recordOf(value);
  if (source === null || typeof source.reposted !== 'boolean' || typeof source.repostCount !== 'number') return null;
  const repostedBy = mapRepostAttribution(source.repostedBy);
  if (repostedBy === undefined) return null;
  return { reposted: source.reposted, repostCount: source.repostCount, repostedBy };
}

export function mapFollow(value: unknown): { readonly followed: boolean } | null {
  const source = recordOf(value);
  return source !== null && typeof source.following === 'boolean' ? { followed: source.following } : source !== null && typeof source.followed === 'boolean' ? { followed: source.followed } : null;
}

export function mapBlock(value: unknown): { readonly blocked: boolean } | null {
  const source = recordOf(value);
  return source !== null && typeof source.blocked === 'boolean' ? { blocked: source.blocked } : null;
}

export function mapMarked(value: unknown): { readonly markedCount: number } | null {
  const source = recordOf(value);
  if (source !== null && typeof source.markedCount === 'number') return { markedCount: source.markedCount };
  return source !== null && (typeof source.id === 'string' || typeof source.notificationId === 'string') ? { markedCount: 1 } : null;
}

export function mapReport(value: unknown): { readonly reportId: string } | null {
  const source = recordOf(value);
  const id = textOf(source?.id) ?? textOf(source?.reportId);
  return id === null ? null : { reportId: id };
}
