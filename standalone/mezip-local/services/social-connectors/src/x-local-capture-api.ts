import {
  xCaptureEnrichmentSchema,
  xCaptureEventInputSchema,
  xCaptureSettingsPatchSchema,
  xCaptureSpecialFavoriteInputSchema,
  xCapturePrivateLibraryBatchSchema,
  xCapturePrivateLibraryInputSchema,
  xCapturePrivateLibraryPatchSchema,
  xCapturePrivateLibraryQuerySchema,
  xCapturePrivateLibraryCollectionInputSchema,
  xCapturePrivateLibraryCollectionPatchSchema,
  xCaptureTimelineQuerySchema,
  watchPrivateLibraryInputSchema,
  watchProgressInputSchema,
  watchQuerySchema,
  resourceRecordInputSchema,
  resourceRecordPatchSchema,
  resourceRecordQuerySchema,
  resourceOpenInputSchema,
} from '@me-zip/schemas';
import type { AuthenticatedPrincipal, JsonObject, XCaptureTimelineQuery } from '@me-zip/shared-types';
import type { EdgeBookmarkInput, EdgeBookmarkSnapshotInput, ResourceOpenInput, ResourceRecordInput, ResourceRecordPatch, XCaptureEventInput, XCapturePrivateLibraryCollectionInput, XCapturePrivateLibraryCollectionPatch, XCapturePrivateLibraryInput, XCapturePrivateLibraryPatch, XCaptureSettingsPatch, XCaptureSpecialFavoriteInput, XCaptureWatchLibraryInput, XLocalCaptureService } from './x-local-capture.js';
import type { WatchCaptureService, WatchProgressInput } from './watch-capture.js';
import { activityClickInputSchema } from './activity-clicks.js';
import { fetchResourceLinkPreview } from './resource-link-preview.js';
import { fetchMoviePlayback } from './movie-playback.js';
import { attributeMovieWatchProgress, movieSourceIdentity } from './movie-watch-attribution.js';

export interface XLocalCaptureApiRequest {
  readonly method: 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE';
  readonly path: string;
  readonly principal?: AuthenticatedPrincipal;
  readonly body?: unknown;
  readonly query?: Readonly<Record<string, string | undefined>>;
}

export interface XLocalCaptureApiResponse {
  readonly status: number;
  readonly body: Readonly<Record<string, unknown>>;
}

function body(request: XLocalCaptureApiRequest): Record<string, unknown> {
  return request.body !== null && typeof request.body === 'object' && !Array.isArray(request.body)
    ? request.body as Record<string, unknown>
    : {};
}

function owner(request: XLocalCaptureApiRequest): AuthenticatedPrincipal {
  if (request.principal === undefined) throw new Error('An authenticated owner is required.');
  return request.principal;
}

function errorStatus(error: unknown): number {
  const message = error instanceof Error ? error.message : '';
  const normalized = message.toLocaleLowerCase();
  if (normalized.includes('authenticated')) return 401;
  if (normalized.includes('not found')) return 404;
  if (normalized.includes('invalid') || normalized.includes('does not match') || normalized.includes('only x') || normalized.includes('must use') || message.includes('特别收藏') || normalized.includes('private library') || message.includes('私密资料')) return 400;
  return 500;
}

function errorBody(error: unknown): Readonly<Record<string, unknown>> {
  return { error: { code: errorStatus(error) === 401 ? 'UNAUTHORIZED' : 'LOCAL_CAPTURE_ERROR', message: error instanceof Error ? error.message : 'Local capture request failed.', retryable: false } };
}

export class XLocalCaptureApiAdapter {
  public constructor(
    private readonly service: XLocalCaptureService,
    private readonly watchService?: WatchCaptureService,
  ) {}

  public async handle(request: XLocalCaptureApiRequest): Promise<XLocalCaptureApiResponse> {
    try {
      const data = await this.route(request);
      return { status: request.method === 'POST' ? 201 : 200, body: { data } };
    } catch (error) {
      return { status: errorStatus(error), body: errorBody(error) };
    }
  }

  private route(request: XLocalCaptureApiRequest): unknown {
    if (request.path === '/v1/x/local-capture/health' && request.method === 'GET') return { active: true, mode: 'LOCAL_CAPTURE' };
    const principal = owner(request);
    if (request.path === '/v1/resources/link-preview' && request.method === 'GET') {
      return fetchResourceLinkPreview(request.query ?? {});
    }
    if (request.path === '/v1/resources/movie-playback' && request.method === 'GET') {
      return fetchMoviePlayback(request.query ?? {}).then((playback) => {
        const identity = movieSourceIdentity(playback.sourceUrl);
        const candidates = this.watchService?.listMovies(principal, false).filter((record) => record.contentType === 'MOVIE' && movieSourceIdentity(record.canonicalUrl) === identity) ?? [];
        const exact = candidates.filter((record) => record.canonicalUrl === playback.sourceUrl);
        const matches = exact.length ? exact : candidates;
        const record = new Set(matches.map((item) => item.contentKey)).size <= 1 ? matches[0] : undefined;
        return { ...playback, ...(record ? { record: {
          id: record.id, contentKey: record.contentKey, title: record.title,
          url: record.url, canonicalUrl: record.canonicalUrl,
          currentTimeSeconds: record.currentTimeSeconds, durationSeconds: record.durationSeconds,
          poster: record.poster, thumbnail: record.thumbnail,
          platform: record.platform, domain: record.domain, videoId: record.videoId,
        } } : {}) };
      });
    }
    if (request.path === '/v1/activity/clicks' && request.method === 'GET') {
      return { items: this.service.listActivityClicks(principal) };
    }
    if (request.path === '/v1/activity/clicks' && request.method === 'POST') {
      return this.service.recordActivityClick(principal, activityClickInputSchema.parse(body(request)));
    }
    const activityClickMatch = /^\/v1\/activity\/clicks\/([^/]+)$/u.exec(request.path);
    if (activityClickMatch !== null && request.method === 'GET') return this.service.getActivityClickDetail(principal, activityClickMatch[1] ?? '');
    if (request.path === '/v1/watch/records' && request.method === 'POST') {
      if (this.watchService === undefined) throw new Error('Watch capture is not configured.');
      const input = watchProgressInputSchema.parse(body(request)) as WatchProgressInput;
      const attributed = attributeMovieWatchProgress(input, this.watchService.listMovies(principal, false));
      if (attributed.action === 'ignore') return { record: null, session: null, created: false, ignored: true };
      return this.watchService.upsertProgress(principal, attributed.input);
    }
    if (request.path === '/v1/watch/records' && request.method === 'GET') {
      if (this.watchService === undefined) throw new Error('Watch capture is not configured.');
      const parsed = watchQuerySchema.safeParse(request.query ?? {});
      if (!parsed.success) throw new Error('Invalid watch query.');
      return this.watchService.listPage(principal, parsed.data as Parameters<WatchCaptureService['listPage']>[1]);
    }
    if (request.path === '/v1/watch/movies' && request.method === 'GET') {
      if (this.watchService === undefined) throw new Error('Watch capture is not configured.');
      return { items: this.watchService.listMovies(principal) };
    }
    if (request.path === '/v1/resources/records' && request.method === 'POST') {
      return this.service.upsertResourceRecord(principal, resourceRecordInputSchema.parse(body(request)) as ResourceRecordInput);
    }
    if (request.path === '/v1/resources/records' && request.method === 'GET') {
      return { items: this.service.listResourceRecords(principal, resourceRecordQuerySchema.parse(request.query ?? {}) as Parameters<XLocalCaptureService['listResourceRecords']>[1]) };
    }
    const resourceMatch = /^\/v1\/resources\/records\/([^/]+)$/u.exec(request.path);
    if (resourceMatch !== null && request.method === 'GET') return this.service.getResourceRecordDetail(principal, resourceMatch[1] ?? '');
    if (resourceMatch !== null && request.method === 'PATCH') return { record: this.service.patchResourceRecord(principal, resourceMatch[1] ?? '', resourceRecordPatchSchema.parse(body(request)) as ResourceRecordPatch) };
    if (resourceMatch !== null && request.method === 'DELETE') return { deleted: this.service.removeResourceRecord(principal, resourceMatch[1] ?? '') };
    const resourceLibraryMatch = /^\/v1\/resources\/records\/([^/]+)\/private-library$/u.exec(request.path);
    if (resourceLibraryMatch !== null && request.method === 'POST') {
      const parsed = watchPrivateLibraryInputSchema.parse(body(request));
      const input: XCaptureWatchLibraryInput = {
        ...(parsed.note === undefined ? {} : { note: parsed.note }),
        ...(parsed.tags === undefined ? {} : { tags: parsed.tags }),
        ...(parsed.collectionId === undefined ? {} : { collectionId: parsed.collectionId }),
      };
      return this.service.addResourceToPrivateLibrary(principal, this.service.getResourceRecord(principal, resourceLibraryMatch[1] ?? ''), input);
    }
    const resourceOpenMatch = /^\/v1\/resources\/records\/([^/]+)\/open$/u.exec(request.path);
    if (resourceOpenMatch !== null && request.method === 'POST') return this.service.openResourceRecord(principal, resourceOpenMatch[1] ?? '', resourceOpenInputSchema.parse(body(request)) as ResourceOpenInput);
    const watchMatch = /^\/v1\/watch\/records\/([^/]+)$/u.exec(request.path);
    if (watchMatch !== null && request.method === 'GET') {
      if (this.watchService === undefined) throw new Error('Watch capture is not configured.');
      return this.watchService.get(principal, watchMatch[1] ?? '');
    }
    if (watchMatch !== null && request.method === 'DELETE') {
      if (this.watchService === undefined) throw new Error('Watch capture is not configured.');
      return { deleted: this.watchService.remove(principal, watchMatch[1] ?? '') };
    }
    const watchLibraryMatch = /^\/v1\/watch\/records\/([^/]+)\/private-library$/u.exec(request.path);
    if (watchLibraryMatch !== null && request.method === 'POST') {
      if (this.watchService === undefined) throw new Error('Watch capture is not configured.');
      const detail = this.watchService.get(principal, watchLibraryMatch[1] ?? '');
      const parsed = watchPrivateLibraryInputSchema.parse(body(request));
      return this.service.addWatchToPrivateLibrary(principal, detail.record, {
        ...(parsed.note === undefined ? {} : { note: parsed.note }),
        ...(parsed.tags === undefined ? {} : { tags: parsed.tags }),
        ...(parsed.collectionId === undefined ? {} : { collectionId: parsed.collectionId }),
      });
    }
    if (request.path === '/v1/x/local-capture/events' && request.method === 'POST') {
      // Older installed content scripts attached these two DOM-only hints to
      // every action, including queued likes. Accept that exact legacy shape;
      // all other fields still pass through the existing strict schema.
      const { profileUrl: _profileUrl, profileName: _profileName, ...event } = body(request);
      return this.service.capture(principal, xCaptureEventInputSchema.parse(event) as XCaptureEventInput);
    }
    if (request.path === '/v1/x/local-capture/edge-bookmarks' && request.method === 'GET') {
      return this.service.getEdgeBookmarkSnapshot(principal);
    }
    if (request.path === '/v1/x/local-capture/edge-bookmarks' && request.method === 'PUT') {
      const parsed = body(request);
      if (!Array.isArray(parsed.bookmarks)) throw new Error('Invalid Edge bookmark: bookmarks must be an array.');
      if (parsed.complete !== undefined && typeof parsed.complete !== 'boolean') {
        throw new Error('Invalid Edge bookmark: complete must be a boolean.');
      }
      return this.service.syncEdgeBookmarks(principal, {
        bookmarks: parsed.bookmarks as readonly EdgeBookmarkInput[],
        ...(parsed.complete === undefined ? {} : { complete: parsed.complete }),
      } satisfies EdgeBookmarkSnapshotInput);
    }
    const edgeBookmarkMatch = /^\/v1\/x\/local-capture\/edge-bookmarks\/([^/]+)$/u.exec(request.path);
    if (edgeBookmarkMatch !== null && request.method === 'DELETE') {
      let bookmarkId: string;
      try {
        bookmarkId = decodeURIComponent(edgeBookmarkMatch[1] ?? '');
      } catch {
        throw new Error('Invalid Edge bookmark: bookmarkId is not URL encoded correctly.');
      }
      const removed = this.service.removeEdgeBookmark(principal, bookmarkId);
      return { deleted: removed !== null, bookmark: removed };
    }
    if (request.path === '/v1/x/local-capture/special-favorites' && request.method === 'GET') {
      return { items: this.service.listSpecialFavorites(principal) };
    }
    if (request.path === '/v1/x/local-capture/special-favorites' && request.method === 'POST') {
      return this.service.addSpecialFavorite(principal, xCaptureSpecialFavoriteInputSchema.parse(body(request)) as XCaptureSpecialFavoriteInput);
    }
    if (request.path === '/v1/x/local-capture/private-library' && request.method === 'GET') {
      const query = xCapturePrivateLibraryQuerySchema.parse(request.query ?? {});
      return { items: this.service.listPrivateLibrary(principal, query as unknown as { readonly query?: string; readonly kind?: 'all' | 'text' | 'image' | 'video' | 'link'; readonly tag?: string; readonly collectionId?: string }) };
    }
    if (request.path === '/v1/x/local-capture/private-library/collections' && request.method === 'GET') {
      return { items: this.service.listPrivateLibraryCollections(principal) };
    }
    if (request.path === '/v1/x/local-capture/private-library/collections' && request.method === 'POST') {
      return { collection: this.service.createPrivateLibraryCollection(principal, xCapturePrivateLibraryCollectionInputSchema.parse(body(request)) as XCapturePrivateLibraryCollectionInput) };
    }
    if (request.path === '/v1/x/local-capture/private-library' && request.method === 'POST') {
      return this.service.addPrivateLibraryItem(principal, xCapturePrivateLibraryInputSchema.parse(body(request)) as XCapturePrivateLibraryInput);
    }
    if (request.path === '/v1/x/local-capture/private-library/batch' && request.method === 'POST') {
      const parsed = xCapturePrivateLibraryBatchSchema.parse(body(request));
      return { items: this.service.addPrivateLibraryBatch(principal, parsed.items as readonly XCapturePrivateLibraryInput[]) };
    }
    const privateLibraryMatch = /^\/v1\/x\/local-capture\/private-library\/([^/]+)$/u.exec(request.path);
    if (privateLibraryMatch !== null && request.method === 'PATCH') {
      return this.service.patchPrivateLibraryItem(principal, privateLibraryMatch[1] ?? '', xCapturePrivateLibraryPatchSchema.parse(body(request)) as XCapturePrivateLibraryPatch);
    }
    if (privateLibraryMatch !== null && request.method === 'DELETE') {
      return { deleted: this.service.removePrivateLibraryItem(principal, privateLibraryMatch[1] ?? '') };
    }
    const privateCollectionMatch = /^\/v1\/x\/local-capture\/private-library\/collections\/([^/]+)$/u.exec(request.path);
    if (privateCollectionMatch !== null && request.method === 'PATCH') {
      return { collection: this.service.patchPrivateLibraryCollection(principal, privateCollectionMatch[1] ?? '', xCapturePrivateLibraryCollectionPatchSchema.parse(body(request)) as XCapturePrivateLibraryCollectionPatch) };
    }
    if (privateCollectionMatch !== null && request.method === 'DELETE') {
      return { deleted: this.service.removePrivateLibraryCollection(principal, privateCollectionMatch[1] ?? '') };
    }
    const specialFavoriteMatch = /^\/v1\/x\/local-capture\/special-favorites\/([^/]+)$/u.exec(request.path);
    if (specialFavoriteMatch !== null && request.method === 'DELETE') {
      return { deleted: this.service.removeSpecialFavorite(principal, specialFavoriteMatch[1] ?? '') };
    }
    if (request.path === '/v1/x/local-capture/timeline' && request.method === 'GET') {
      return this.service.listTimeline(principal, xCaptureTimelineQuerySchema.parse(request.query ?? {}) as XCaptureTimelineQuery);
    }
    if (request.path === '/v1/x/local-capture/stats' && request.method === 'GET') return this.service.stats(principal);
    if (request.path === '/v1/x/local-capture/settings' && request.method === 'GET') return this.service.getSettings(principal);
    if (request.path === '/v1/x/local-capture/settings' && request.method === 'PATCH') {
      return this.service.patchSettings(principal, xCaptureSettingsPatchSchema.parse(body(request)) as XCaptureSettingsPatch);
    }
    if (request.path === '/v1/x/local-capture/export' && request.method === 'GET') return this.service.export(principal);
    if (request.path === '/v1/x/local-capture/history/keep-favorites' && request.method === 'DELETE') {
      return this.service.pruneHistoryKeepingFavorites(principal);
    }
    if (request.path === '/v1/x/local-capture/history' && request.method === 'DELETE') return { deleted: this.service.deleteHistory(principal) };
    const enrichMatch = /^\/v1\/x\/local-capture\/events\/([^/]+)\/enrich$/u.exec(request.path);
    if (enrichMatch !== null && request.method === 'POST') {
      const parsed = xCaptureEnrichmentSchema.parse({ ...body(request), eventId: enrichMatch[1] });
      return this.service.reconcile(principal, parsed.eventId, {
        postUrl: parsed.postUrl,
        ...(parsed.postId === undefined ? {} : { postId: parsed.postId }),
        ...(parsed.authorHandle === undefined ? {} : { authorHandle: parsed.authorHandle }),
        ...(parsed.pageTitle === undefined ? {} : { pageTitle: parsed.pageTitle }),
        ...(parsed.textExcerpt === undefined ? {} : { textExcerpt: parsed.textExcerpt }),
        ...(parsed.media === undefined ? {} : { media: parsed.media as unknown as readonly JsonObject[] }),
        ...(parsed.status === undefined ? {} : { status: parsed.status }),
      });
    }
    throw new Error('Local capture route was not found.');
  }
}
