import { createHash, randomUUID } from 'node:crypto';
import { activityClickInputSchema, activityClickPlatform, activityClickRecordId, activityClickUrl, projectActivityClicks } from './activity-clicks.js';
import type { ActivityClickDetail, ActivityClickInput, ActivityClickRecord, ActivityClickSession, PersistedActivityClickSession } from './activity-clicks.js';
import type {
  AuthenticatedPrincipal,
  JsonObject,
  XCaptureActionType,
  XCapturePlatform,
  XCaptureContentCache,
  XCaptureEvent,
  XCaptureSettings,
  XCapturePrivateLibraryItem,
  XCapturePrivateLibraryCollection,
  ResourceRecord,
  ResourceOpenSession,
  ResourceStatus,
  ResourceType,
  XCaptureSpecialFavorite,
  XCaptureSource,
  XCaptureStats,
  XCaptureTimelinePage,
  XCaptureTimelineQuery,
  WatchRecord,
} from '@me-zip/shared-types';

export interface XCaptureEventInput {
  readonly actionType: XCaptureActionType;
  readonly platform?: XCapturePlatform;
  readonly postUrl: string;
  readonly postId?: string | null;
  readonly authorHandle?: string | null;
  readonly pageTitle?: string | null;
  readonly capturedAt?: string;
  readonly captureMethod?: 'EXPLICIT_ACTION' | 'VISIBLE_STATE';
  readonly observedAt?: string;
  readonly captureAccount?: { readonly profileUrl: string; readonly displayName: string };
  readonly source?: Exclude<XCaptureSource, 'X_OFFICIAL_API'>;
  readonly device?: string | null;
  readonly browser?: string | null;
  readonly note?: string | null;
  readonly tags?: readonly string[];
}

export interface XCaptureEventResult {
  readonly event: XCaptureEvent | null;
  readonly deduplicated: boolean;
  readonly disabled: boolean;
}

export interface XCaptureSettingsPatch {
  readonly enabled?: boolean;
  readonly captureLikes?: boolean;
  readonly captureBookmarks?: boolean;
  readonly captureViews?: boolean;
  readonly captureSharedLinks?: boolean;
  readonly watchCapture?: boolean;
  readonly savePageMetadata?: boolean;
  readonly autoSync?: boolean;
}

export interface XCaptureContentPatch {
  readonly postUrl: string;
  readonly postId?: string | null;
  readonly authorHandle?: string | null;
  readonly pageTitle?: string | null;
  readonly textExcerpt?: string | null;
  readonly media?: readonly JsonObject[];
}

export interface XCapturePersistenceSnapshot {
  readonly events: readonly XCaptureEvent[];
  readonly content: readonly XCaptureContentCache[];
  readonly specialFavorites: readonly XCaptureSpecialFavorite[];
  /** Canonical library data. Optional so snapshots from v1/v2 remain valid. */
  readonly privateLibrary?: readonly XCapturePrivateLibraryItem[];
  readonly privateCollections?: readonly XCapturePrivateLibraryCollection[];
  readonly resources?: readonly ResourceRecord[];
  /** Optional so earlier local snapshots are migrated without data loss. */
  readonly resourceSessions?: readonly ResourceOpenSession[];
  /** Explicit user activations only; legacy snapshots have no click sessions. */
  readonly clickSessions?: readonly PersistedActivityClickSession[];
  /** Optional so snapshots created before Edge bookmark sync remain readable. */
  readonly edgeBookmarks?: readonly EdgeBookmark[];
  readonly edgeBookmarksSyncedAt?: string | null;
  /**
   * A prospective timeline retention boundary.  It deliberately records only
   * IDs captured after the boundary, so opening an older snapshot can never
   * make its pre-existing records eligible for automatic deletion.
   */
  readonly timelineRetention?: XCaptureTimelineRetention;
  readonly settings: XCaptureSettings | null;
}

export interface XCaptureTimelineRetention {
  readonly activatedAt: string;
  readonly maxManagedEvents: number;
  /** IDs of records created after retention was enabled, newest first. */
  readonly managedEventIds: readonly string[];
}

export interface XCaptureSelectiveHistoryPruneResult {
  readonly deletedEvents: number;
  readonly retainedEvents: number;
  readonly deletedContent: number;
  readonly retainedContent: number;
}

export type EdgeBookmarkStatus = 'active' | 'removed';

/** A server-owned, privacy-safe snapshot of one Edge bookmark. */
export interface EdgeBookmark {
  readonly bookmarkId: string;
  readonly folderPath: string;
  readonly title: string;
  readonly url: string;
  readonly dateAdded: string | null;
  readonly updatedAt: string;
  readonly status: EdgeBookmarkStatus;
}

export interface EdgeBookmarkInput {
  readonly bookmarkId: string;
  readonly folderPath?: string | null;
  readonly title: string;
  readonly url: string;
  /** Edge emits this as epoch milliseconds; ISO strings are accepted for API clients. */
  readonly dateAdded?: string | number | null;
}

export interface EdgeBookmarkSnapshotInput {
  readonly bookmarks: readonly EdgeBookmarkInput[];
  /**
   * True when the payload is a complete bookmark tree snapshot.  Partial
   * updates are accepted for bridge retries, but must never tombstone entries
   * that were not present in the partial payload.  Omitted values are treated
   * as partial for safety; callers that enumerate the entire tree must send
   * `complete: true` explicitly before an absent bookmark can be tombstoned.
   */
  readonly complete?: boolean;
}

export interface EdgeBookmarkSnapshot {
  readonly bookmarks: readonly EdgeBookmark[];
  readonly syncedAt: string | null;
}

export interface XCaptureSpecialFavoriteInput {
  readonly postUrl: string;
  readonly postId?: string | null;
  readonly authorHandle?: string | null;
  readonly pageTitle?: string | null;
  readonly note?: string | null;
  readonly tags?: readonly string[];
  readonly sourceEventId?: string;
}

export interface XCaptureSpecialFavoriteResult {
  readonly favorite: XCaptureSpecialFavorite;
  readonly deduplicated: boolean;
}

export interface XCapturePrivateLibraryInput extends XCaptureSpecialFavoriteInput {
  readonly collectionId?: string | null;
}

export interface XCapturePrivateLibraryPatch {
  readonly note?: string | null;
  readonly tags?: readonly string[];
  readonly collectionId?: string | null;
}

export interface XCapturePrivateLibraryCollectionInput {
  readonly name: string;
  readonly description?: string | null;
  readonly icon?: string | null;
}

export interface XCapturePrivateLibraryCollectionPatch {
  readonly name?: string;
  readonly description?: string | null;
  readonly icon?: string | null;
}

export interface XCaptureWatchLibraryInput {
  readonly note?: string | null;
  readonly tags?: readonly string[];
  readonly collectionId?: string | null;
}

export interface ResourceRecordInput {
  readonly resourceType: ResourceType;
  readonly title?: string;
  readonly platform?: string;
  readonly author?: string | null;
  readonly description?: string | null;
  readonly url: string;
  readonly canonicalUrl?: string;
  readonly currentProgressPercent?: number;
  readonly status?: ResourceStatus;
  readonly liked?: boolean;
  readonly bookmarked?: boolean;
  readonly note?: string | null;
  readonly tags?: readonly string[];
  readonly metadata?: JsonObject;
}

export interface ResourceRecordPatch {
  readonly title?: string;
  readonly platform?: string;
  readonly author?: string | null;
  readonly description?: string | null;
  readonly currentProgressPercent?: number;
  readonly status?: ResourceStatus;
  readonly liked?: boolean;
  readonly bookmarked?: boolean;
  readonly note?: string | null;
  readonly tags?: readonly string[];
}

export interface ResourceOpenInput {
  readonly source?: ResourceOpenSession['source'];
  readonly idempotencyKey?: string;
}

export interface XCapturePersistence {
  readonly durable: boolean;
  read(ownerId: string): XCapturePersistenceSnapshot | null;
  write(ownerId: string, snapshot: XCapturePersistenceSnapshot): void;
}

export class InMemoryXCapturePersistence implements XCapturePersistence {
  public readonly durable = false;
  private readonly values = new Map<string, XCapturePersistenceSnapshot>();

  public read(ownerId: string): XCapturePersistenceSnapshot | null {
    const value = this.values.get(ownerId);
    return value === undefined ? null : structuredClone(value);
  }

  public write(ownerId: string, snapshot: XCapturePersistenceSnapshot): void {
    this.values.set(ownerId, structuredClone(snapshot));
  }
}

function nowIso(clock: () => Date): string {
  return clock().toISOString();
}

function normalizedTags(tags: readonly string[] | undefined): readonly string[] {
  return [...new Set((tags ?? []).map((tag) => tag.trim()).filter(Boolean))].slice(0, 30);
}

// EDGE bookmarks are synchronized through their own snapshot endpoint, not as
// social capture events. Keep the platform map limited to event-capable hosts.
const captureHosts: Record<Exclude<XCapturePlatform, 'EDGE'>, readonly string[]> = {
  X: ['x.com', 'twitter.com'],
  DOUYIN: ['douyin.com', 'iesdouyin.com'],
  BILIBILI: ['bilibili.com'],
  WECHAT_WEB: ['mp.weixin.qq.com', 'channels.weixin.qq.com', 'web.wechat.com', 'wx.qq.com', 'weixin.qq.com'],
};

function normalizedUrl(value: string, platform: Exclude<XCapturePlatform, 'EDGE'> = 'X'): string {
  let parsed: URL;
  try {
    parsed = new URL(value);
  } catch {
    throw new Error('Capture URL is invalid.');
  }
  if (parsed.protocol !== 'https:') throw new Error('Capture URL must use HTTPS.');
  const host = parsed.hostname.toLowerCase();
  const allowed = captureHosts[platform];
  if (!allowed.some((domain) => host === domain || host.endsWith(`.${domain}`))) {
    throw new Error(`${platform} URL does not match the selected platform.`);
  }
  parsed.hash = '';
  for (const key of [...parsed.searchParams.keys()]) {
    if (key.toLowerCase().startsWith('utm_') || key === 's' || key === 't') parsed.searchParams.delete(key);
  }
  return parsed.toString();
}

function normalizedResourceUrl(value: string): string {
  let parsed: URL;
  try { parsed = new URL(value); } catch { throw new Error('Resource URL is invalid.'); }
  if (!['http:', 'https:'].includes(parsed.protocol)) throw new Error('Resource URL must use HTTP or HTTPS.');
  parsed.username = '';
  parsed.password = '';
  parsed.hash = '';
  return parsed.toString();
}

const EDGE_BOOKMARK_CAP = 10_000;
const EDGE_BOOKMARK_ID_MAX = 300;
const EDGE_BOOKMARK_FOLDER_MAX = 1_000;
const EDGE_BOOKMARK_TITLE_MAX = 500;
const EDGE_BOOKMARK_URL_MAX = 4_096;
const EDGE_TRACKING_PARAM_NAMES = new Set([
  'fbclid', 'gclid', 'dclid', 'msclkid', 'mc_cid', 'mc_eid', 'igshid', 'yclid',
  'ref', 'ref_src', 'ref_url', 'si', 'feature', 'spm', 'from', 'share_source',
]);

function edgeBookmarkError(message: string): Error {
  return new Error(`Invalid Edge bookmark: ${message}`);
}

function normalizedEdgeBookmarkDate(value: string | number | null | undefined): string | null {
  if (value === undefined || value === null) return null;
  if (typeof value === 'number') {
    if (!Number.isFinite(value) || value < 0 || value > 8_640_000_000_000_000) {
      throw edgeBookmarkError('dateAdded must be a valid timestamp.');
    }
    return new Date(value).toISOString();
  }
  if (typeof value !== 'string' || value.trim() === '') throw edgeBookmarkError('dateAdded must be a valid date.');
  const parsed = Date.parse(value);
  if (Number.isNaN(parsed)) throw edgeBookmarkError('dateAdded must be a valid date.');
  return new Date(parsed).toISOString();
}

function normalizedEdgeBookmarkUrl(value: string): string {
  if (typeof value !== 'string' || value.trim() === '') throw edgeBookmarkError('url is required.');
  if (value.length > EDGE_BOOKMARK_URL_MAX) throw edgeBookmarkError(`url must be at most ${EDGE_BOOKMARK_URL_MAX} characters.`);
  let parsed: URL;
  try { parsed = new URL(value); } catch { throw edgeBookmarkError('url is invalid.'); }
  if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') throw edgeBookmarkError('url must use HTTP or HTTPS.');
  parsed.username = '';
  parsed.password = '';
  parsed.hash = '';
  for (const key of [...parsed.searchParams.keys()]) {
    const lower = key.toLocaleLowerCase();
    if (lower.startsWith('utm_') || EDGE_TRACKING_PARAM_NAMES.has(lower)) parsed.searchParams.delete(key);
  }
  return parsed.toString();
}

function normalizedEdgeBookmark(input: EdgeBookmarkInput, timestamp: string): EdgeBookmark {
  if (input === null || typeof input !== 'object' || Array.isArray(input)) throw edgeBookmarkError('entry must be an object.');
  if (typeof input.bookmarkId !== 'string' || input.bookmarkId.trim() === '') throw edgeBookmarkError('bookmarkId is required.');
  const bookmarkId = input.bookmarkId.trim();
  if (bookmarkId.length > EDGE_BOOKMARK_ID_MAX) throw edgeBookmarkError(`bookmarkId must be at most ${EDGE_BOOKMARK_ID_MAX} characters.`);
  if (typeof input.title !== 'string') throw edgeBookmarkError('title must be a string.');
  const title = input.title.trim();
  if (title.length > EDGE_BOOKMARK_TITLE_MAX) throw edgeBookmarkError(`title must be at most ${EDGE_BOOKMARK_TITLE_MAX} characters.`);
  const rawFolder = input.folderPath ?? '';
  if (typeof rawFolder !== 'string') throw edgeBookmarkError('folderPath must be a string.');
  const folderPath = rawFolder.trim();
  if (folderPath.length > EDGE_BOOKMARK_FOLDER_MAX) throw edgeBookmarkError(`folderPath must be at most ${EDGE_BOOKMARK_FOLDER_MAX} characters.`);
  return {
    bookmarkId,
    folderPath,
    title,
    url: normalizedEdgeBookmarkUrl(input.url),
    dateAdded: normalizedEdgeBookmarkDate(input.dateAdded),
    updatedAt: timestamp,
    status: 'active',
  };
}

function postIdFromUrl(value: string): string | null {
  const match = /\/status\/(\d+)/u.exec(value);
  return match?.[1] ?? null;
}

function librarySourceId(postUrl: string, postId: string | null | undefined): string {
  return postId ?? createHash('sha256').update(`X|${postUrl}`).digest('hex');
}

function mediaKind(media: readonly JsonObject[]): 'text' | 'image' | 'video' | 'link' {
  if (media.length === 0) return 'text';
  const values = media.map((item) => JSON.stringify(item).toLocaleLowerCase());
  if (values.some((value) => /video|\.mp4|\.webm|\.mov/u.test(value))) return 'video';
  if (values.some((value) => /image|\.png|\.jpe?g|\.gif|\.webp/u.test(value))) return 'image';
  return 'link';
}

function actionEnabled(action: XCaptureActionType, settings: XCaptureSettings): boolean {
  if (!settings.enabled) return false;
  if (action === 'like' || action === 'unlike') return settings.captureLikes;
  if (action === 'bookmark' || action === 'unbookmark') return settings.captureBookmarks;
  if (action === 'follow' || action === 'unfollow') return true;
  if (action === 'opened' || action === 'viewed') return settings.captureViews;
  if (action === 'copied_link' || action === 'share_to_mezip' || action === 'manual_save') return settings.captureSharedLinks;
  return true;
}

function emptyCounts(): Record<XCaptureActionType, number> {
  return {
    like: 0, unlike: 0, bookmark: 0, unbookmark: 0, follow: 0, unfollow: 0, opened: 0, viewed: 0,
    copied_link: 0, share_to_mezip: 0, manual_save: 0, add_note: 0,
  };
}

function socialContentIdentity(value: string, platform: XCapturePlatform): string | null {
  const url = new URL(value);
  if (platform === 'X') return postIdFromUrl(value);
  if (platform === 'DOUYIN') return /^\/(?:video|note|share\/video)\/(\d+)\/?$/u.exec(url.pathname)?.[1]
    ?? (/^\d+$/u.test(url.searchParams.get('modal_id') ?? '') ? url.searchParams.get('modal_id') : null);
  if (platform === 'BILIBILI') return /^\/video\/(BV[A-Za-z0-9]{10}|av\d+)\/?$/u.exec(url.pathname)?.[1] ?? null;
  return null;
}

function normalizedCaptureAccount(account: XCaptureEventInput['captureAccount'], platform: XCapturePlatform): XCaptureEventInput['captureAccount'] {
  if (!account) return undefined;
  const url = new URL(account.profileUrl);
  const valid = platform === 'X' ? url.hostname === 'x.com' && /^\/[A-Za-z0-9_]{1,30}\/?$/u.test(url.pathname) && !/^\/(home|login|settings|explore|i)\/?$/u.test(url.pathname)
    : platform === 'DOUYIN' ? ['douyin.com', 'www.douyin.com'].includes(url.hostname) && /^\/user\/[A-Za-z0-9_-]+\/?$/u.test(url.pathname)
    : platform === 'BILIBILI' && url.hostname === 'space.bilibili.com' && /^\/\d+\/?$/u.test(url.pathname);
  if (!valid || url.protocol !== 'https:' || url.username || url.password || url.port || account.displayName.length > 120) throw new Error('Invalid capture account profile.');
  return {profileUrl: url.origin + url.pathname.replace(/\/$/u, ''), displayName: account.displayName.trim()};
}

function fingerprint(ownerId: string, event: Pick<XCaptureEventInput, 'actionType' | 'postUrl' | 'note' | 'captureAccount'>, capturedAt: string): string {
  const bucket = Math.floor(Date.parse(capturedAt) / 30_000);
  const note = event.actionType === 'add_note' ? event.note ?? '' : '';
  return createHash('sha256').update(`${ownerId}|${event.actionType}|${event.postUrl}|${bucket}|${note}|${event.captureAccount?.profileUrl ?? ''}`).digest('hex');
}

const defaultSettings = (userId: string, timestamp: string): XCaptureSettings => ({
  userId,
  enabled: true,
  captureLikes: true,
  captureBookmarks: true,
  captureViews: true,
  captureSharedLinks: true,
  watchCapture: true,
  savePageMetadata: true,
  autoSync: false,
  updatedAt: timestamp,
});

// This limit applies only to records made after the retention boundary.  Older
// snapshots are intentionally outside the managed set, even if their clocks
// were inaccurate, so an upgrade can never retroactively purge local history.
const POST_CUTOVER_TIMELINE_EVENT_LIMIT = 100;

/** Explicit likes and bookmarks are permanent user choices, never disposable browsing history. */
function isFavoriteInteraction(event: Pick<XCaptureEvent, 'actionType'>): boolean {
  return event.actionType === 'like' || event.actionType === 'bookmark';
}

function normalizedTimelineRetention(value: XCaptureTimelineRetention | undefined): XCaptureTimelineRetention | undefined {
  if (value === undefined || value === null || typeof value !== 'object') return undefined;
  if (typeof value.activatedAt !== 'string' || Number.isNaN(Date.parse(value.activatedAt))) return undefined;
  const managedEventIds = Array.isArray(value.managedEventIds)
    ? [...new Set(value.managedEventIds.filter((id): id is string => typeof id === 'string' && id.trim().length > 0))]
      .slice(0, POST_CUTOVER_TIMELINE_EVENT_LIMIT)
    : [];
  return {
    activatedAt: new Date(value.activatedAt).toISOString(),
    maxManagedEvents: POST_CUTOVER_TIMELINE_EVENT_LIMIT,
    managedEventIds,
  };
}

function retainedTimelineAfterCapture(
  existingEvents: readonly XCaptureEvent[],
  event: XCaptureEvent,
  existingRetention: XCaptureTimelineRetention | undefined,
  timestamp: string,
): { readonly events: readonly XCaptureEvent[]; readonly retention: XCaptureTimelineRetention; readonly discardedPostUrls: ReadonlySet<string> } {
  const retention = normalizedTimelineRetention(existingRetention) ?? {
    activatedAt: timestamp,
    maxManagedEvents: POST_CUTOVER_TIMELINE_EVENT_LIMIT,
    managedEventIds: [],
  };
  const existingById = new Map(existingEvents.map((item) => [item.id, item]));
  // Only non-favorite IDs that were previously declared managed can be
  // deleted. Likes and bookmarks stay outside the rolling 100-record bucket.
  const knownManagedIds = retention.managedEventIds.filter((id) => {
    const existing = existingById.get(id);
    return existing !== undefined && !isFavoriteInteraction(existing);
  });
  const knownManagedEvents = knownManagedIds.flatMap((id) => {
    const current = existingById.get(id);
    return current === undefined ? [] : [current];
  });
  const managedCandidates = isFavoriteInteraction(event)
    ? knownManagedEvents
    : [event, ...knownManagedEvents.filter((item) => item.id !== event.id)];
  // A browser can retry an offline capture late. Keep the newest records by
  // the time the interaction happened, not merely by the order it reached us.
  const managedEventIds = managedCandidates
    .map((item, index) => ({ item, index, capturedAt: Date.parse(item.capturedAt) }))
    .sort((left, right) => {
      if (Number.isFinite(left.capturedAt) && Number.isFinite(right.capturedAt) && left.capturedAt !== right.capturedAt) {
        return right.capturedAt - left.capturedAt;
      }
      return left.index - right.index;
    })
    .slice(0, retention.maxManagedEvents)
    .map(({ item }) => item.id);
  const retainedManagedIds = new Set(managedEventIds);
  const priorManagedIds = new Set(knownManagedIds);
  const discarded = [
    ...existingEvents.filter((item) => priorManagedIds.has(item.id) && !retainedManagedIds.has(item.id)),
    ...(!isFavoriteInteraction(event) && !retainedManagedIds.has(event.id) ? [event] : []),
  ];
  const events = [
    ...(isFavoriteInteraction(event) || retainedManagedIds.has(event.id) ? [event] : []),
    ...existingEvents.filter((item) => item.id !== event.id && (!priorManagedIds.has(item.id) || retainedManagedIds.has(item.id))),
  ];
  return {
    events,
    retention: { ...retention, managedEventIds },
    discardedPostUrls: new Set(discarded.map((item) => item.postUrl)),
  };
}

function retainedContentAfterTimelineTrim(
  content: readonly XCaptureContentCache[],
  retainedEvents: readonly XCaptureEvent[],
  snapshot: XCapturePersistenceSnapshot,
  discardedPostUrls: ReadonlySet<string>,
): readonly XCaptureContentCache[] {
  if (discardedPostUrls.size === 0) return content;
  const liveEventUrls = new Set(retainedEvents.map((event) => event.postUrl));
  const independentlySavedUrls = new Set([
    ...(snapshot.specialFavorites ?? []).map((item) => item.postUrl),
    ...(snapshot.privateLibrary ?? []).map((item) => item.sourceUrl),
    ...(snapshot.resources ?? []).map((item) => item.canonicalUrl),
  ]);
  // Remove a cache entry only when it belonged solely to an automatically
  // trimmed, post-cutover event. Curated library data and legacy history win.
  return content.filter((item) => !discardedPostUrls.has(item.postUrl)
    || liveEventUrls.has(item.postUrl)
    || independentlySavedUrls.has(item.postUrl));
}

export class XLocalCaptureService {
  private readonly states = new Map<string, XCapturePersistenceSnapshot>();

  public constructor(
    private readonly persistence: XCapturePersistence = new InMemoryXCapturePersistence(),
    private readonly clock: () => Date = () => new Date(),
    private readonly id: () => string = () => randomUUID(),
  ) {}

  private principal(principal: AuthenticatedPrincipal): string {
    if (principal.userId.trim() === '') throw new Error('An authenticated owner is required.');
    return principal.userId;
  }

  private state(userId: string): XCapturePersistenceSnapshot {
    const existing = this.states.get(userId) ?? this.persistence.read(userId);
    if (existing !== null && existing !== undefined) {
      const legacy = Array.isArray(existing.specialFavorites) ? existing.specialFavorites : [];
      const canonical = Array.isArray(existing.privateLibrary) ? existing.privateLibrary : [];
      const migrated: XCapturePrivateLibraryItem[] = [...canonical];
      for (const favorite of legacy) {
        const sourceId = librarySourceId(favorite.postUrl, favorite.postId);
        if (!migrated.some((item) => item.ownerId === userId && item.sourcePlatform === 'X' && item.sourceId === sourceId)) {
          migrated.push({
            id: favorite.id,
            ownerId: userId,
            userId,
            sourceType: 'X_POST',
            sourcePlatform: 'X',
            sourceId,
            sourceUrl: favorite.postUrl,
            title: favorite.pageTitle,
            content: null,
            authorName: null,
            authorHandle: favorite.authorHandle,
            authorAvatar: null,
            media: [],
            thumbnail: null,
            publishedAt: null,
            savedAt: favorite.createdAt,
            createdAt: favorite.createdAt,
            updatedAt: favorite.updatedAt,
            tags: favorite.tags,
            note: favorite.note,
            collectionId: null,
            privacy: 'PRIVATE',
            metadata: { legacySpecialFavorite: true, sourceEventId: favorite.sourceEventId },
          });
        }
      }
      const resources = Array.isArray(existing.resources)
        ? existing.resources.map((item) => ({
          ...item,
          firstOpenedAt: item.firstOpenedAt ?? null,
          lastOpenedAt: item.lastOpenedAt ?? null,
          openCount: Number.isInteger(item.openCount) && item.openCount > 0 ? item.openCount : 0,
        }))
        : [];
      // Earlier X-link saves predate ResourceRecord. Rehydrate them once into
      // the reading/research list without turning a saved URL into a read URL.
      let projectedResources: readonly ResourceRecord[] = resources;
      for (const event of existing.events) {
        if ((event.actionType !== 'copied_link' && event.actionType !== 'manual_save')
          || projectedResources.some((item) => item.ownerId === userId && item.resourceType === 'X_LINK' && item.canonicalUrl === event.postUrl)) continue;
        projectedResources = this.resourceForSavedXLink({ ...existing, resources: projectedResources }, userId, event, event.createdAt);
      }
      const timelineRetention = normalizedTimelineRetention(existing.timelineRetention);
      const normalized: XCapturePersistenceSnapshot = {
        ...existing,
        specialFavorites: legacy,
        privateLibrary: migrated,
        privateCollections: Array.isArray(existing.privateCollections) ? existing.privateCollections : [],
        resources: projectedResources,
        resourceSessions: Array.isArray(existing.resourceSessions) ? existing.resourceSessions : [],
        clickSessions: Array.isArray(existing.clickSessions) ? existing.clickSessions : [],
        edgeBookmarks: Array.isArray(existing.edgeBookmarks) ? existing.edgeBookmarks : [],
        edgeBookmarksSyncedAt: typeof existing.edgeBookmarksSyncedAt === 'string' ? existing.edgeBookmarksSyncedAt : null,
        ...(timelineRetention === undefined ? {} : { timelineRetention }),
      };
      this.states.set(userId, normalized);
      if (projectedResources.length !== resources.length) this.persistence.write(userId, normalized);
      return normalized;
    }
    const created: XCapturePersistenceSnapshot = {
      events: [], content: [], specialFavorites: [], privateLibrary: [], privateCollections: [], resources: [], resourceSessions: [], clickSessions: [],
      edgeBookmarks: [], edgeBookmarksSyncedAt: null, settings: defaultSettings(userId, nowIso(this.clock)),
    };
    this.states.set(userId, created);
    this.persist(userId, created);
    return created;
  }

  private persist(userId: string, snapshot: XCapturePersistenceSnapshot): void {
    const cloned = structuredClone(snapshot);
    this.states.set(userId, cloned);
    this.persistence.write(userId, cloned);
  }

  private collectionFor(userId: string, collectionId: string): XCapturePrivateLibraryCollection {
    const collection = (this.state(userId).privateCollections ?? []).find((item) => item.id === collectionId && item.ownerId === userId);
    if (collection === undefined) throw new Error('Private library collection was not found.');
    return collection;
  }

  public listPrivateLibraryCollections(principal: AuthenticatedPrincipal): readonly XCapturePrivateLibraryCollection[] {
    const userId = this.principal(principal);
    return structuredClone([...(this.state(userId).privateCollections ?? [])].filter((item) => item.ownerId === userId).sort((left, right) => right.updatedAt.localeCompare(left.updatedAt)));
  }

  public createPrivateLibraryCollection(principal: AuthenticatedPrincipal, input: XCapturePrivateLibraryCollectionInput): XCapturePrivateLibraryCollection {
    const userId = this.principal(principal);
    const name = input.name.trim();
    if (name === '') throw new Error('Private library collection name is required.');
    const state = this.state(userId);
    const existing = (state.privateCollections ?? []).find((item) => item.ownerId === userId && item.name.toLocaleLowerCase() === name.toLocaleLowerCase());
    if (existing !== undefined) return structuredClone(existing);
    const timestamp = nowIso(this.clock);
    const collection: XCapturePrivateLibraryCollection = { id: this.id(), ownerId: userId, name, description: input.description ?? null, icon: input.icon ?? null, createdAt: timestamp, updatedAt: timestamp };
    this.persist(userId, { ...state, privateCollections: [collection, ...(state.privateCollections ?? [])] });
    return structuredClone(collection);
  }

  public patchPrivateLibraryCollection(principal: AuthenticatedPrincipal, collectionId: string, patch: XCapturePrivateLibraryCollectionPatch): XCapturePrivateLibraryCollection {
    const userId = this.principal(principal);
    const state = this.state(userId);
    const current = this.collectionFor(userId, collectionId);
    const name = patch.name === undefined ? current.name : patch.name.trim();
    if (name === '') throw new Error('Private library collection name is required.');
    const updated: XCapturePrivateLibraryCollection = { ...current, name, description: patch.description === undefined ? current.description : patch.description, icon: patch.icon === undefined ? current.icon : patch.icon, updatedAt: nowIso(this.clock) };
    this.persist(userId, { ...state, privateCollections: (state.privateCollections ?? []).map((item) => item.id === collectionId ? updated : item) });
    return structuredClone(updated);
  }

  public removePrivateLibraryCollection(principal: AuthenticatedPrincipal, collectionId: string): boolean {
    const userId = this.principal(principal);
    const state = this.state(userId);
    this.collectionFor(userId, collectionId);
    const collections = (state.privateCollections ?? []).filter((item) => item.id !== collectionId);
    const privateLibrary = (state.privateLibrary ?? []).map((item) => item.collectionId === collectionId ? { ...item, collectionId: null, updatedAt: nowIso(this.clock) } : item);
    this.persist(userId, { ...state, privateCollections: collections, privateLibrary });
    return true;
  }

  private settingsFor(userId: string): XCaptureSettings {
    const settings = this.state(userId).settings;
    return settings ?? defaultSettings(userId, nowIso(this.clock));
  }

  public getSettings(principal: AuthenticatedPrincipal): XCaptureSettings {
    return structuredClone(this.settingsFor(this.principal(principal)));
  }

  /** Return the current owner's Edge bookmark snapshot without exposing another owner's state. */
  public getEdgeBookmarkSnapshot(principal: AuthenticatedPrincipal): EdgeBookmarkSnapshot {
    const userId = this.principal(principal);
    const state = this.state(userId);
    return {
      bookmarks: structuredClone([...(state.edgeBookmarks ?? [])]),
      syncedAt: state.edgeBookmarksSyncedAt ?? null,
    };
  }

  /**
   * Merge an Edge bookmark snapshot for the owner. Missing active IDs are
   * tombstoned only for an explicitly complete snapshot; partial payloads are
   * safe to retry while the browser tree is still being enumerated.
   */
  public syncEdgeBookmarks(principal: AuthenticatedPrincipal, input: EdgeBookmarkSnapshotInput): EdgeBookmarkSnapshot {
    const userId = this.principal(principal);
    if (!input || !Array.isArray(input.bookmarks)) throw edgeBookmarkError('bookmarks must be an array.');
    if (input.bookmarks.length > EDGE_BOOKMARK_CAP) throw edgeBookmarkError(`a snapshot may contain at most ${EDGE_BOOKMARK_CAP} bookmarks.`);
    const timestamp = nowIso(this.clock);
    const incoming = new Map<string, EdgeBookmark>();
    for (const item of input.bookmarks) {
      const normalized = normalizedEdgeBookmark(item, timestamp);
      incoming.set(normalized.bookmarkId, normalized);
    }

    const state = this.state(userId);
    const merged = new Map<string, EdgeBookmark>();
    for (const item of state.edgeBookmarks ?? []) merged.set(item.bookmarkId, item);
    // A missing `complete` flag is intentionally safe/partial.  This prevents
    // an interrupted or older client enumeration from marking every bookmark
    // it has not reached yet as removed.  Only an explicit complete snapshot
    // has authority to tombstone active IDs absent from the payload.
    if (input.complete === true) {
      for (const item of state.edgeBookmarks ?? []) {
        if (item.status === 'active' && !incoming.has(item.bookmarkId)) {
          merged.set(item.bookmarkId, { ...item, status: 'removed', updatedAt: timestamp });
        }
      }
    }
    for (const item of incoming.values()) merged.set(item.bookmarkId, item);
    const bookmarks = [...merged.values()].sort((left, right) => {
      const byUpdated = right.updatedAt.localeCompare(left.updatedAt);
      return byUpdated !== 0 ? byUpdated : left.bookmarkId.localeCompare(right.bookmarkId);
    });
    this.persist(userId, { ...state, edgeBookmarks: bookmarks, edgeBookmarksSyncedAt: timestamp });
    return { bookmarks: structuredClone(bookmarks), syncedAt: timestamp };
  }

  /** Mark one bookmark removed immediately (used by the Edge extension). */
  public removeEdgeBookmark(principal: AuthenticatedPrincipal, bookmarkId: string): EdgeBookmark | null {
    const userId = this.principal(principal);
    if (typeof bookmarkId !== 'string' || bookmarkId.trim() === '') throw edgeBookmarkError('bookmarkId is required.');
    const normalizedId = bookmarkId.trim();
    if (normalizedId.length > EDGE_BOOKMARK_ID_MAX) throw edgeBookmarkError(`bookmarkId must be at most ${EDGE_BOOKMARK_ID_MAX} characters.`);
    const state = this.state(userId);
    const current = (state.edgeBookmarks ?? []).find((item) => item.bookmarkId === normalizedId);
    if (current === undefined) return null;
    if (current.status === 'removed') return structuredClone(current);
    const timestamp = nowIso(this.clock);
    const removed: EdgeBookmark = { ...current, status: 'removed', updatedAt: timestamp };
    this.persist(userId, {
      ...state,
      edgeBookmarks: (state.edgeBookmarks ?? []).map((item) => item.bookmarkId === normalizedId ? removed : item),
      edgeBookmarksSyncedAt: timestamp,
    });
    return structuredClone(removed);
  }

  public patchSettings(principal: AuthenticatedPrincipal, patch: XCaptureSettingsPatch): XCaptureSettings {
    const userId = this.principal(principal);
    const current = this.settingsFor(userId);
    const updated: XCaptureSettings = { ...current, ...patch, userId, updatedAt: nowIso(this.clock) };
    const state = this.state(userId);
    this.persist(userId, { ...state, settings: updated });
    return structuredClone(updated);
  }

  public listActivityClicks(principal: AuthenticatedPrincipal): readonly ActivityClickRecord[] {
    const userId = this.principal(principal);
    return structuredClone(projectActivityClicks(this.state(userId), userId).map((detail) => detail.record));
  }

  public getActivityClickDetail(principal: AuthenticatedPrincipal, recordId: string): ActivityClickDetail {
    const userId = this.principal(principal);
    const detail = projectActivityClicks(this.state(userId), userId).find((item) => item.record.id === recordId);
    if (detail === undefined) throw new Error('Activity click record was not found.');
    return structuredClone(detail);
  }

  public recordActivityClick(principal: AuthenticatedPrincipal, input: ActivityClickInput): { readonly record: ActivityClickRecord; readonly session: ActivityClickSession; readonly deduplicated: boolean } {
    const userId = this.principal(principal);
    const parsed = activityClickInputSchema.parse(input);
    const url = activityClickUrl(parsed.url);
    const state = this.state(userId);
    const idempotencyKey = parsed.idempotencyKey;
    const recordId = activityClickRecordId(userId, url);
    const existing = (state.clickSessions ?? []).find((session) => session.ownerId === userId && session.idempotencyKey === idempotencyKey);
    const resourceSession = (state.resourceSessions ?? []).find((session) => session.ownerId === userId && session.idempotencyKey?.toLowerCase() === idempotencyKey);
    if (existing !== undefined || resourceSession !== undefined) {
      const existingUrl = existing?.url ?? (state.resources ?? []).find((resource) => resource.ownerId === userId && resource.id === resourceSession?.resourceRecordId)?.canonicalUrl;
      if (existingUrl === undefined || activityClickUrl(existingUrl) !== url) throw new Error('Invalid activity click: idempotency key was already used for a different URL.');
      const detail = this.getActivityClickDetail(principal, recordId);
      const session = detail.sessions.find((item) => item.id === (resourceSession?.id ?? existing?.id));
      if (session === undefined) throw new Error('Activity click session was not found.');
      return { record: detail.record, session, deduplicated: true };
    }
    const session: PersistedActivityClickSession = {
      id: this.id(), ownerId: userId, url, clickedAt: nowIso(this.clock),
      source: 'MEZIP_EXPLICIT_CLICK', legacy: false, idempotencyKey,
      title: parsed.title?.trim() || url, platform: activityClickPlatform(url, parsed.platform),
    };
    this.persist(userId, { ...state, clickSessions: [session, ...(state.clickSessions ?? [])] });
    const detail = this.getActivityClickDetail(principal, recordId);
    const savedSession = detail.sessions.find((item) => item.id === session.id);
    if (savedSession === undefined) throw new Error('Activity click session was not found.');
    return { record: detail.record, session: savedSession, deduplicated: false };
  }

  public listResourceRecords(principal: AuthenticatedPrincipal, query: { readonly resourceType?: ResourceType; readonly status?: ResourceStatus; readonly query?: string } = {}): readonly ResourceRecord[] {
    const userId = this.principal(principal);
    const needle = query.query?.toLocaleLowerCase();
    return structuredClone([...(this.state(userId).resources ?? [])]
      .filter((item) => item.ownerId === userId)
      .filter((item) => query.resourceType === undefined || item.resourceType === query.resourceType)
      .filter((item) => query.status === undefined || item.status === query.status)
      .filter((item) => needle === undefined || `${item.title} ${item.platform} ${item.author ?? ''} ${item.description ?? ''} ${item.url} ${item.note ?? ''} ${item.tags.join(' ')}`.toLocaleLowerCase().includes(needle))
      .sort((left, right) => (right.lastOpenedAt ?? right.updatedAt).localeCompare(left.lastOpenedAt ?? left.updatedAt)));
  }

  public getResourceRecord(principal: AuthenticatedPrincipal, recordId: string): ResourceRecord {
    const userId = this.principal(principal);
    const record = (this.state(userId).resources ?? []).find((item) => item.id === recordId && item.ownerId === userId);
    if (record === undefined) throw new Error('Resource record was not found.');
    return structuredClone(record);
  }

  public getResourceRecordDetail(principal: AuthenticatedPrincipal, recordId: string): { readonly record: ResourceRecord; readonly sessions: readonly ResourceOpenSession[] } {
    const userId = this.principal(principal);
    const record = this.getResourceRecord(principal, recordId);
    const sessions = (this.state(userId).resourceSessions ?? [])
      .filter((item) => item.ownerId === userId && item.resourceRecordId === record.id)
      .sort((left, right) => right.openedAt.localeCompare(left.openedAt));
    return { record, sessions: structuredClone(sessions) };
  }

  public upsertResourceRecord(principal: AuthenticatedPrincipal, input: ResourceRecordInput): { readonly record: ResourceRecord; readonly created: boolean } {
    const userId = this.principal(principal);
    const url = normalizedResourceUrl(input.canonicalUrl ?? input.url);
    const state = this.state(userId);
    const existing = (state.resources ?? []).find((item) => item.ownerId === userId && item.resourceType === input.resourceType && item.canonicalUrl === url);
    const timestamp = nowIso(this.clock);
    const progress = Math.min(100, Math.max(0, Number(input.currentProgressPercent ?? 0)));
    const status: ResourceStatus = input.status ?? (progress >= 100 ? 'COMPLETED' : 'IN_PROGRESS');
    if (existing !== undefined) {
      const updated: ResourceRecord = { ...existing, ...(input.title === undefined ? {} : { title: input.title.trim() || existing.title }), ...(input.platform === undefined ? {} : { platform: input.platform.trim() || existing.platform }), ...(input.author === undefined ? {} : { author: input.author }), ...(input.description === undefined ? {} : { description: input.description }), currentProgressPercent: progress, status, liked: input.liked ?? existing.liked, bookmarked: input.bookmarked ?? existing.bookmarked, note: input.note === undefined ? existing.note : input.note, tags: input.tags === undefined ? existing.tags : normalizedTags(input.tags), updatedAt: timestamp };
      this.persist(userId, { ...state, resources: (state.resources ?? []).map((item) => item.id === existing.id ? updated : item) });
      return { record: structuredClone(updated), created: false };
    }
    const record: ResourceRecord = { id: this.id(), ownerId: userId, resourceType: input.resourceType, title: input.title?.trim() || '未命名资源', platform: input.platform?.trim() || new URL(url).hostname, author: input.author ?? null, description: input.description ?? null, url, canonicalUrl: url, currentProgressPercent: progress, status, liked: input.liked ?? false, bookmarked: input.bookmarked ?? false, note: input.note ?? null, tags: normalizedTags(input.tags), firstOpenedAt: null, lastOpenedAt: null, openCount: 0, createdAt: timestamp, updatedAt: timestamp, privacy: 'PRIVATE', metadata: input.metadata ?? {} };
    this.persist(userId, { ...state, resources: [record, ...(state.resources ?? [])] });
    return { record: structuredClone(record), created: true };
  }

  public patchResourceRecord(principal: AuthenticatedPrincipal, recordId: string, patch: ResourceRecordPatch): ResourceRecord {
    const userId = this.principal(principal);
    const state = this.state(userId);
    const current = (state.resources ?? []).find((item) => item.id === recordId && item.ownerId === userId);
    if (current === undefined) throw new Error('Resource record was not found.');
    const progress = patch.currentProgressPercent === undefined ? current.currentProgressPercent : Math.min(100, Math.max(0, Number(patch.currentProgressPercent)));
    const updated: ResourceRecord = { ...current, ...(patch.title === undefined ? {} : { title: patch.title.trim() || current.title }), ...(patch.platform === undefined ? {} : { platform: patch.platform.trim() || current.platform }), ...(patch.author === undefined ? {} : { author: patch.author }), ...(patch.description === undefined ? {} : { description: patch.description }), currentProgressPercent: progress, status: patch.status ?? (progress >= 100 ? 'COMPLETED' : 'IN_PROGRESS'), liked: patch.liked ?? current.liked, bookmarked: patch.bookmarked ?? current.bookmarked, note: patch.note === undefined ? current.note : patch.note, tags: patch.tags === undefined ? current.tags : normalizedTags(patch.tags), updatedAt: nowIso(this.clock) };
    this.persist(userId, { ...state, resources: (state.resources ?? []).map((item) => item.id === recordId ? updated : item) });
    return structuredClone(updated);
  }

  public removeResourceRecord(principal: AuthenticatedPrincipal, recordId: string): boolean {
    const userId = this.principal(principal);
    const state = this.state(userId);
    const exists = (state.resources ?? []).some((item) => item.id === recordId && item.ownerId === userId);
    if (!exists) return false;
    this.persist(userId, {
      ...state,
      resources: (state.resources ?? []).filter((item) => item.id !== recordId),
      resourceSessions: (state.resourceSessions ?? []).filter((item) => item.resourceRecordId !== recordId),
    });
    return true;
  }

  public openResourceRecord(principal: AuthenticatedPrincipal, recordId: string, input: ResourceOpenInput = {}): { readonly record: ResourceRecord; readonly session: ResourceOpenSession; readonly deduplicated: boolean } {
    const userId = this.principal(principal);
    const state = this.state(userId);
    const current = (state.resources ?? []).find((item) => item.id === recordId && item.ownerId === userId);
    if (current === undefined) throw new Error('Resource record was not found.');
    const idempotencyKey = input.idempotencyKey?.trim() || null;
    const existing = idempotencyKey === null ? undefined : (state.resourceSessions ?? []).find((item) => item.ownerId === userId && item.resourceRecordId === recordId && item.idempotencyKey === idempotencyKey);
    if (existing !== undefined) return { record: structuredClone(current), session: structuredClone(existing), deduplicated: true };
    const timestamp = nowIso(this.clock);
    const session: ResourceOpenSession = {
      id: this.id(), ownerId: userId, resourceRecordId: recordId,
      source: input.source ?? 'MEZIP_READING_HISTORY', openedAt: timestamp,
      idempotencyKey, createdAt: timestamp,
    };
    const record: ResourceRecord = {
      ...current,
      firstOpenedAt: current.firstOpenedAt ?? timestamp,
      lastOpenedAt: timestamp,
      openCount: current.openCount + 1,
      updatedAt: timestamp,
    };
    this.persist(userId, {
      ...state,
      resources: (state.resources ?? []).map((item) => item.id === recordId ? record : item),
      resourceSessions: [session, ...(state.resourceSessions ?? [])],
    });
    return { record: structuredClone(record), session: structuredClone(session), deduplicated: false };
  }

  public addResourceToPrivateLibrary(principal: AuthenticatedPrincipal, source: ResourceRecord, input: XCaptureWatchLibraryInput = {}): { readonly item: XCapturePrivateLibraryItem; readonly deduplicated: boolean } {
    const userId = this.principal(principal);
    const state = this.state(userId);
    const existing = (state.privateLibrary ?? []).find((item) => item.ownerId === userId && (item.metadata.resourceRecordId === source.id || (source.resourceType === 'X_LINK' && item.sourceUrl === source.canonicalUrl)));
    if (existing !== undefined) return { item: structuredClone(existing), deduplicated: true };
    if (input.collectionId !== undefined && input.collectionId !== null) this.collectionFor(userId, input.collectionId);
    const timestamp = nowIso(this.clock);
    const sourceType: XCapturePrivateLibraryItem['sourceType'] = source.resourceType === 'X_LINK' ? 'X_POST' : source.resourceType === 'ARTICLE' ? 'ARTICLE' : source.resourceType === 'CODE' ? 'CODE' : 'WEBPAGE';
    const sourcePlatform: XCapturePrivateLibraryItem['sourcePlatform'] = source.resourceType === 'X_LINK' ? 'X' : 'OTHER';
    const item: XCapturePrivateLibraryItem = { id: this.id(), ownerId: userId, userId, sourceType, sourcePlatform, sourceId: source.resourceType === 'X_LINK' ? (typeof source.metadata.postId === 'string' ? source.metadata.postId : librarySourceId(source.canonicalUrl, null)) : source.id, sourceUrl: source.canonicalUrl, title: source.title, content: source.description ?? source.note, authorName: source.author, authorHandle: source.resourceType === 'X_LINK' ? source.author : null, authorAvatar: null, media: [], thumbnail: null, publishedAt: null, savedAt: timestamp, createdAt: timestamp, updatedAt: timestamp, tags: normalizedTags(input.tags ?? source.tags), note: input.note ?? source.note, collectionId: input.collectionId ?? null, privacy: 'PRIVATE', metadata: { resourceRecordId: source.id, resourceType: source.resourceType, platform: source.platform, progressPercent: source.currentProgressPercent, status: source.status } };
    this.persist(userId, { ...state, privateLibrary: [item, ...(state.privateLibrary ?? [])] });
    return { item: structuredClone(item), deduplicated: false };
  }

  /** An explicit X link collection is a useful research item, but saving it
   * must not pretend it has already been read. The reading history starts only
   * after the person deliberately opens it from ME.zip. */
  private resourceForSavedXLink(state: XCapturePersistenceSnapshot, userId: string, event: XCaptureEvent, timestamp: string): readonly ResourceRecord[] {
    if (event.actionType !== 'copied_link' && event.actionType !== 'manual_save') return state.resources ?? [];
    const existing = (state.resources ?? []).find((item) => item.ownerId === userId && item.resourceType === 'X_LINK' && item.canonicalUrl === event.postUrl);
    if (existing !== undefined) {
      const updated: ResourceRecord = {
        ...existing,
        title: event.pageTitle ?? existing.title,
        author: event.authorHandle ?? existing.author,
        description: event.note ?? existing.description,
        tags: event.tags.length > 0 ? event.tags : existing.tags,
        updatedAt: timestamp,
        metadata: { ...existing.metadata, sourceEventId: event.id, postId: event.postId, source: 'X_LINK_COLLECTION' },
      };
      return (state.resources ?? []).map((item) => item.id === existing.id ? updated : item);
    }
    const record: ResourceRecord = {
      id: this.id(), ownerId: userId, resourceType: 'X_LINK',
      title: event.pageTitle ?? `X 链接${event.authorHandle ? ` · @${event.authorHandle.replace(/^@/u, '')}` : ''}`,
      platform: 'X', author: event.authorHandle, description: event.note,
      url: event.postUrl, canonicalUrl: event.postUrl, currentProgressPercent: 0,
      status: 'IN_PROGRESS', liked: false, bookmarked: false, note: event.note,
      tags: event.tags, firstOpenedAt: null, lastOpenedAt: null, openCount: 0,
      createdAt: timestamp, updatedAt: timestamp, privacy: 'PRIVATE',
      metadata: { sourceEventId: event.id, postId: event.postId, source: 'X_LINK_COLLECTION' },
    };
    return [record, ...(state.resources ?? [])];
  }

  public capture(principal: AuthenticatedPrincipal, input: XCaptureEventInput): XCaptureEventResult {
    const userId = this.principal(principal);
    const platform = input.platform ?? 'X';
    if (platform === 'EDGE') throw new Error('EDGE bookmark events must use the bookmark snapshot endpoint.');
    const postUrl = normalizedUrl(input.postUrl, platform);
    const captureAccount = normalizedCaptureAccount(input.captureAccount, platform);
    const recovered = input.captureMethod === 'VISIBLE_STATE';
    if (recovered && (!['like', 'bookmark'].includes(input.actionType)
      || !socialContentIdentity(postUrl, platform) || !input.observedAt || Number.isNaN(Date.parse(input.observedAt)))) {
      throw new Error('Invalid visible social state observation.');
    }
    const capturedAt = recovered ? input.observedAt! : input.capturedAt ?? nowIso(this.clock);
    if (Number.isNaN(Date.parse(capturedAt))) throw new Error('Capture timestamp is invalid.');
    const settings = this.settingsFor(userId);
    if (!actionEnabled(input.actionType, settings)) return { event: null, deduplicated: false, disabled: true };
    const state = this.state(userId);
    if (recovered) {
      const dimension = input.actionType === 'like' ? ['like', 'unlike'] : ['bookmark', 'unbookmark'];
      const observedPostId = socialContentIdentity(postUrl, platform);
      const latest = state.events.filter((event) => event.platform === platform
        && socialContentIdentity(event.postUrl, platform) === observedPostId
        && (event.captureAccount?.profileUrl ?? '') === (captureAccount?.profileUrl ?? '')
        && dimension.includes(event.actionType))
        .sort((a, b) => b.capturedAt.localeCompare(a.capturedAt))[0];
      if (latest && (latest.actionType === input.actionType || Date.parse(latest.capturedAt) >= Date.parse(capturedAt))) {
        return { event: structuredClone(latest), deduplicated: true, disabled: false };
      }
    }
    const key = fingerprint(userId, { ...input, postUrl, ...(captureAccount ? {captureAccount} : {}) }, capturedAt);
    // Compare against each stored event's own action and URL.  Reusing the
    // incoming input for both sides would make any event in the same 30s
    // bucket look like a duplicate, so a like could swallow a bookmark.
    const duplicate = recovered ? undefined : state.events.find((event) => fingerprint(userId, event, event.capturedAt) === key);
    if (duplicate !== undefined) return { event: structuredClone(duplicate), deduplicated: true, disabled: false };
    const timestamp = nowIso(this.clock);
    const event: XCaptureEvent = {
      id: this.id(), userId, platform, actionType: input.actionType, postUrl,
      postId: platform === 'X' ? (input.postId ?? postIdFromUrl(postUrl)) : null, authorHandle: input.authorHandle ?? null,
      pageTitle: settings.savePageMetadata ? (input.pageTitle ?? null) : null, capturedAt,
      source: input.source ?? 'LOCAL_CAPTURE', device: input.device ?? null, browser: input.browser ?? null,
      note: input.note ?? null, tags: normalizedTags(input.tags), syncStatus: platform === 'X' ? 'PENDING_ENRICHMENT' : 'NOT_REQUIRED',
      createdAt: timestamp, updatedAt: timestamp,
      ...(captureAccount ? { captureAccount } : {}),
      ...(recovered ? { captureMethod: 'VISIBLE_STATE' as const, recovered: true, observedAt: capturedAt } : {}),
    };
    const nextContent = platform === 'X' && settings.savePageMetadata
      ? this.upsertContent(state.content, userId, { postUrl, postId: event.postId, authorHandle: event.authorHandle, pageTitle: event.pageTitle }, timestamp)
      : state.content;
    const nextResources = platform === 'X'
      ? this.resourceForSavedXLink(state, userId, event, timestamp)
      : state.resources;
    const timeline = retainedTimelineAfterCapture(state.events, event, state.timelineRetention, timestamp);
    this.persist(userId, {
      ...state,
      events: timeline.events,
      content: retainedContentAfterTimelineTrim(nextContent, timeline.events, state, timeline.discardedPostUrls),
      timelineRetention: timeline.retention,
      ...(nextResources === undefined ? {} : { resources: nextResources }),
    });
    return { event: structuredClone(event), deduplicated: false, disabled: false };
  }

  private specialSourceEvent(state: XCapturePersistenceSnapshot, postUrl: string, sourceEventId?: string): XCaptureEvent {
    const allowed = (event: XCaptureEvent): boolean => event.actionType === 'like'
      || event.actionType === 'bookmark'
      || event.actionType === 'copied_link'
      || event.actionType === 'manual_save';
    const source = sourceEventId === undefined
      ? state.events.find((event) => event.postUrl === postUrl && allowed(event))
      : state.events.find((event) => event.id === sourceEventId && event.postUrl === postUrl && allowed(event));
    if (source === undefined) {
      throw new Error('私人资料库只能添加已点赞、已收藏或已保存的 X 链接。');
    }
    return source;
  }

  private privateItemFromSource(userId: string, state: XCapturePersistenceSnapshot, source: XCaptureEvent, input: XCapturePrivateLibraryInput, existingId?: string): XCapturePrivateLibraryItem {
    const content = state.content.find((item) => item.postUrl === source.postUrl);
    const sourceId = librarySourceId(source.postUrl, input.postId ?? source.postId ?? content?.postId);
    const timestamp = nowIso(this.clock);
    const media = content?.media ?? [];
    const thumbnailValue = media.find((item) => typeof item.url === 'string')?.url;
    return {
      id: existingId ?? this.id(), ownerId: userId, userId, sourceType: 'X_POST', sourcePlatform: 'X', sourceId,
      sourceUrl: source.postUrl, title: input.pageTitle ?? source.pageTitle ?? content?.pageTitle ?? null,
      content: content?.textExcerpt ?? null, authorName: null,
      authorHandle: input.authorHandle ?? source.authorHandle ?? content?.authorHandle ?? null,
      authorAvatar: null, media: structuredClone(media), thumbnail: typeof thumbnailValue === 'string' ? thumbnailValue : null,
      publishedAt: null, savedAt: timestamp, createdAt: timestamp, updatedAt: timestamp,
      tags: normalizedTags(input.tags ?? source.tags), note: input.note ?? source.note ?? null,
      collectionId: input.collectionId ?? null, privacy: 'PRIVATE',
      metadata: { sourceEventId: source.id, sourceAction: source.actionType, mediaKind: mediaKind(media) },
    };
  }

  public listPrivateLibrary(principal: AuthenticatedPrincipal, query: { readonly query?: string; readonly kind?: 'all' | 'text' | 'image' | 'video' | 'link'; readonly tag?: string; readonly collectionId?: string } = {}): readonly XCapturePrivateLibraryItem[] {
    const userId = this.principal(principal);
    const needle = query.query?.toLocaleLowerCase();
    return structuredClone([...((this.state(userId).privateLibrary ?? []) as readonly XCapturePrivateLibraryItem[])]
      .filter((item) => {
        const kind = mediaKind(item.media);
        if (query.kind === 'link' && item.sourceUrl.length === 0) return false;
        if (query.kind !== undefined && query.kind !== 'all' && query.kind !== 'link' && kind !== query.kind) return false;
        if (query.tag !== undefined && !item.tags.includes(query.tag)) return false;
        if (query.collectionId !== undefined && item.collectionId !== query.collectionId) return false;
        if (needle !== undefined && !`${item.sourceUrl} ${item.title ?? ''} ${item.content ?? ''} ${item.authorName ?? ''} ${item.authorHandle ?? ''} ${item.note ?? ''} ${item.tags.join(' ')}`.toLocaleLowerCase().includes(needle)) return false;
        return true;
      })
      .sort((left, right) => right.savedAt.localeCompare(left.savedAt)));
  }

  public addWatchToPrivateLibrary(principal: AuthenticatedPrincipal, source: WatchRecord, input: XCaptureWatchLibraryInput = {}): { readonly item: XCapturePrivateLibraryItem; readonly deduplicated: boolean } {
    const userId = this.principal(principal);
    const sourceId = source.contentKey;
    const state = this.state(userId);
    if (input.collectionId !== undefined && input.collectionId !== null) this.collectionFor(userId, input.collectionId);
    const existing = (state.privateLibrary ?? []).find((item) => item.ownerId === userId && item.sourcePlatform === 'WATCH' && item.sourceId === sourceId);
    if (existing !== undefined) return { item: structuredClone(existing), deduplicated: true };
    const timestamp = nowIso(this.clock);
    const sourceType: XCapturePrivateLibraryItem['sourceType'] = source.contentType === 'MOVIE' ? 'MOVIE' : 'VIDEO';
    const item: XCapturePrivateLibraryItem = {
      id: this.id(), ownerId: userId, userId, sourceType, sourcePlatform: 'WATCH', sourceId,
      sourceUrl: source.canonicalUrl, title: source.title, content: source.subtitle,
      authorName: source.creator, authorHandle: null, authorAvatar: null,
      media: source.thumbnail === null ? [] : [{ type: 'thumbnail', url: source.thumbnail }], thumbnail: source.thumbnail,
      publishedAt: null, savedAt: timestamp, createdAt: timestamp, updatedAt: timestamp,
      tags: normalizedTags(input.tags), note: input.note ?? null, collectionId: input.collectionId ?? null,
      privacy: 'PRIVATE', metadata: { watchRecordId: source.id, contentKey: source.contentKey, platform: source.platform, status: source.status },
    };
    this.persist(userId, { ...state, privateLibrary: [item, ...(state.privateLibrary ?? [])] });
    return { item: structuredClone(item), deduplicated: false };
  }

  public addPrivateLibraryItem(principal: AuthenticatedPrincipal, input: XCapturePrivateLibraryInput): { readonly item: XCapturePrivateLibraryItem; readonly deduplicated: boolean } {
    const userId = this.principal(principal);
    const postUrl = normalizedUrl(input.postUrl);
    const state = this.state(userId);
    if (input.collectionId !== undefined && input.collectionId !== null) this.collectionFor(userId, input.collectionId);
    const source = this.specialSourceEvent(state, postUrl, input.sourceEventId);
    const sourceId = librarySourceId(postUrl, input.postId ?? source.postId);
    const existing = (state.privateLibrary ?? []).find((item) => item.ownerId === userId && item.sourcePlatform === 'X' && (item.sourceId === sourceId || item.sourceUrl === postUrl));
    if (existing !== undefined) return { item: structuredClone(existing), deduplicated: true };
    const item = this.privateItemFromSource(userId, state, source, { ...input, postUrl });
    this.persist(userId, { ...state, privateLibrary: [item, ...(state.privateLibrary ?? [])] });
    return { item: structuredClone(item), deduplicated: false };
  }

  public patchPrivateLibraryItem(principal: AuthenticatedPrincipal, itemId: string, patch: XCapturePrivateLibraryPatch): XCapturePrivateLibraryItem {
    const userId = this.principal(principal);
    const state = this.state(userId);
    const current = (state.privateLibrary ?? []).find((item) => item.id === itemId && item.ownerId === userId);
    if (current === undefined) throw new Error('Private library item was not found.');
    if (patch.collectionId !== undefined && patch.collectionId !== null) this.collectionFor(userId, patch.collectionId);
    const updated: XCapturePrivateLibraryItem = { ...current, ...(patch.note === undefined ? {} : { note: patch.note }), ...(patch.tags === undefined ? {} : { tags: normalizedTags(patch.tags) }), ...(patch.collectionId === undefined ? {} : { collectionId: patch.collectionId }), updatedAt: nowIso(this.clock) };
    this.persist(userId, { ...state, privateLibrary: (state.privateLibrary ?? []).map((item) => item.id === itemId ? updated : item) });
    return structuredClone(updated);
  }

  public removePrivateLibraryItem(principal: AuthenticatedPrincipal, itemId: string): boolean {
    const userId = this.principal(principal);
    const state = this.state(userId);
    const exists = (state.privateLibrary ?? []).some((item) => item.id === itemId && item.ownerId === userId);
    if (!exists) return false;
    this.persist(userId, { ...state, privateLibrary: (state.privateLibrary ?? []).filter((item) => item.id !== itemId) });
    return true;
  }

  public addPrivateLibraryBatch(principal: AuthenticatedPrincipal, inputs: readonly XCapturePrivateLibraryInput[]): readonly { readonly item: XCapturePrivateLibraryItem; readonly deduplicated: boolean }[] {
    return inputs.map((input) => this.addPrivateLibraryItem(principal, input));
  }

  public listSpecialFavorites(principal: AuthenticatedPrincipal): readonly XCaptureSpecialFavorite[] {
    const userId = this.principal(principal);
    return structuredClone([...this.state(userId).specialFavorites].sort((left, right) => right.createdAt.localeCompare(left.createdAt)));
  }

  public addSpecialFavorite(principal: AuthenticatedPrincipal, input: XCaptureSpecialFavoriteInput): XCaptureSpecialFavoriteResult {
    const userId = this.principal(principal);
    const postUrl = normalizedUrl(input.postUrl);
    const state = this.state(userId);
    const source = this.specialSourceEvent(state, postUrl, input.sourceEventId);
    const existing = state.specialFavorites.find((favorite) => favorite.postUrl === postUrl);
    if (existing !== undefined) return { favorite: structuredClone(existing), deduplicated: true };
    const content = state.content.find((item) => item.postUrl === postUrl);
    const timestamp = nowIso(this.clock);
    const favorite: XCaptureSpecialFavorite = {
      id: this.id(),
      userId,
      postUrl,
      postId: input.postId ?? source.postId ?? content?.postId ?? postIdFromUrl(postUrl),
      authorHandle: input.authorHandle ?? source.authorHandle ?? content?.authorHandle ?? null,
      pageTitle: input.pageTitle ?? source.pageTitle ?? content?.pageTitle ?? null,
      note: input.note ?? source.note ?? null,
      tags: normalizedTags(input.tags ?? source.tags),
      sourceEventId: source.id,
      createdAt: timestamp,
      updatedAt: timestamp,
    };
    const item = this.privateItemFromSource(userId, state, source, { ...input, postUrl });
    this.persist(userId, { ...state, specialFavorites: [favorite, ...state.specialFavorites], privateLibrary: [item, ...(state.privateLibrary ?? [])] });
    return { favorite: structuredClone(favorite), deduplicated: false };
  }

  public removeSpecialFavorite(principal: AuthenticatedPrincipal, favoriteId: string): boolean {
    const userId = this.principal(principal);
    const state = this.state(userId);
    const selected = state.specialFavorites.find((favorite) => favorite.id === favoriteId);
    const exists = selected !== undefined;
    if (!exists) return false;
    const privateLibrary = (state.privateLibrary ?? []).filter((item) => item.id !== favoriteId && item.sourceUrl !== selected.postUrl && item.metadata.sourceEventId !== selected.sourceEventId);
    this.persist(userId, { ...state, specialFavorites: state.specialFavorites.filter((favorite) => favorite.id !== favoriteId), privateLibrary });
    return true;
  }

  private upsertContent(content: readonly XCaptureContentCache[], userId: string, patch: XCaptureContentPatch, timestamp: string): readonly XCaptureContentCache[] {
    const existing = content.find((item) => item.userId === userId && item.postUrl === patch.postUrl);
    if (existing === undefined) {
      return [{ id: this.id(), userId, postUrl: patch.postUrl, postId: patch.postId ?? postIdFromUrl(patch.postUrl), authorHandle: patch.authorHandle ?? null, pageTitle: patch.pageTitle ?? null, textExcerpt: patch.textExcerpt ?? null, media: patch.media ?? [], officialDataStatus: 'PENDING', officialUpdatedAt: null, createdAt: timestamp, updatedAt: timestamp }, ...content];
    }
    return content.map((item) => item.id === existing.id ? { ...item, postId: patch.postId ?? item.postId, authorHandle: patch.authorHandle ?? item.authorHandle, pageTitle: patch.pageTitle ?? item.pageTitle, textExcerpt: patch.textExcerpt ?? item.textExcerpt, media: patch.media ?? item.media, updatedAt: timestamp } : item);
  }

  public listTimeline(principal: AuthenticatedPrincipal, query: XCaptureTimelineQuery = {}): XCaptureTimelinePage {
    const userId = this.principal(principal);
    const state = this.state(userId);
    const needle = query.query?.toLocaleLowerCase();
    const filtered = state.events.filter((event) => {
      if (query.actionType !== undefined && event.actionType !== query.actionType) return false;
      if (query.from !== undefined && event.capturedAt < query.from) return false;
      if (query.to !== undefined && event.capturedAt > query.to) return false;
      if (needle !== undefined && !`${event.postUrl} ${event.authorHandle ?? ''} ${event.pageTitle ?? ''} ${event.note ?? ''} ${event.tags.join(' ')}`.toLocaleLowerCase().includes(needle)) return false;
      return true;
    }).sort((left, right) => right.capturedAt.localeCompare(left.capturedAt));
    const start = query.cursor === undefined ? 0 : Math.max(0, Number.parseInt(query.cursor, 10) || 0);
    const limit = Math.min(100, Math.max(1, query.limit ?? 50));
    const events = filtered.slice(start, start + limit);
    const urls = new Set(events.map((event) => event.postUrl));
    return { events: structuredClone(events), content: structuredClone(state.content.filter((item) => urls.has(item.postUrl))), nextCursor: start + limit < filtered.length ? String(start + limit) : null };
  }

  public stats(principal: AuthenticatedPrincipal, officialApiStatus: XCaptureStats['officialApiStatus'] = 'UNKNOWN'): XCaptureStats {
    const userId = this.principal(principal);
    const events = this.state(userId).events;
    const now = this.clock().getTime();
    const startOfDay = new Date(this.clock()); startOfDay.setHours(0, 0, 0, 0);
    const dayStart = startOfDay.getTime();
    const weekStart = dayStart - 6 * 86_400_000;
    const today = emptyCounts(); const week = emptyCounts(); const total = emptyCounts();
    for (const event of events) {
      const time = Date.parse(event.capturedAt); total[event.actionType] += 1;
      if (time >= dayStart && time <= now) today[event.actionType] += 1;
      if (time >= weekStart && time <= now) week[event.actionType] += 1;
    }
    return { today, week, total, lastCaptureAt: events[0]?.capturedAt ?? null, localCaptureActive: this.settingsFor(userId).enabled, officialApiStatus };
  }

  public reconcile(principal: AuthenticatedPrincipal, eventId: string, patch: XCaptureContentPatch & { readonly status?: 'AVAILABLE' | 'FAILED' }): XCaptureEvent {
    const userId = this.principal(principal);
    const state = this.state(userId);
    const event = state.events.find((entry) => entry.id === eventId);
    if (event === undefined) throw new Error('Capture event was not found.');
    // Enrichment is queued for every supported web platform. Validate its
    // URL against the platform of the event being enriched; defaulting to X
    // made valid Douyin/Bilibili records fail with a misleading X mismatch.
    if (event.platform === 'EDGE') throw new Error('EDGE bookmark events must use the bookmark snapshot endpoint.');
    const enrichmentPlatform = event.platform ?? 'X';
    const postUrl = normalizedUrl(patch.postUrl, enrichmentPlatform);
    if (postUrl !== normalizedUrl(event.postUrl, enrichmentPlatform)) {
      throw new Error('Enrichment URL does not match the captured event.');
    }
    const timestamp = nowIso(this.clock);
    const content = this.upsertContent(state.content, userId, { ...patch, postUrl }, timestamp).map((item): XCaptureContentCache => item.postUrl === postUrl
      ? { ...item, officialDataStatus: (patch.status === 'FAILED' ? 'FAILED' : 'AVAILABLE') as XCaptureContentCache['officialDataStatus'], officialUpdatedAt: timestamp }
      : item);
    const updated: XCaptureEvent = { ...event, syncStatus: patch.status === 'FAILED' ? 'FAILED' : 'ENRICHED', updatedAt: timestamp };
    this.persist(userId, { ...state, events: state.events.map((entry) => entry.id === event.id ? updated : entry), content });
    return structuredClone(updated);
  }

  public export(principal: AuthenticatedPrincipal): XCapturePersistenceSnapshot {
    const userId = this.principal(principal);
    return structuredClone(this.state(userId));
  }

  /**
   * Delete disposable historic interactions while keeping the user's explicit
   * likes, bookmarks, and all curated library data. The rolling 100-record
   * rule starts fresh for later non-favorite interactions.
   */
  public pruneHistoryKeepingFavorites(principal: AuthenticatedPrincipal): XCaptureSelectiveHistoryPruneResult {
    const userId = this.principal(principal);
    const state = this.state(userId);
    const events = state.events.filter(isFavoriteInteraction);
    const retainedUrls = new Set([
      ...events.map((event) => event.postUrl),
      ...state.specialFavorites.map((item) => item.postUrl),
      ...(state.privateLibrary ?? []).map((item) => item.sourceUrl),
      ...(state.resources ?? []).map((item) => item.canonicalUrl),
    ]);
    const content = state.content.filter((item) => retainedUrls.has(item.postUrl));
    const result: XCaptureSelectiveHistoryPruneResult = {
      deletedEvents: state.events.length - events.length,
      retainedEvents: events.length,
      deletedContent: state.content.length - content.length,
      retainedContent: content.length,
    };
    const timestamp = nowIso(this.clock);
    this.persist(userId, {
      ...state,
      events,
      content,
      // Old history is already pruned now. From this point forward, only
      // non-favorite interactions join the rolling 100-record bucket.
      timelineRetention: { activatedAt: timestamp, maxManagedEvents: POST_CUTOVER_TIMELINE_EVENT_LIMIT, managedEventIds: [] },
    });
    return result;
  }

  public deleteHistory(principal: AuthenticatedPrincipal): number {
    const userId = this.principal(principal);
    const state = this.state(userId);
    const count = state.events.length;
    this.persist(userId, { ...state, events: [], content: [], specialFavorites: [] });
    return count;
  }
}
