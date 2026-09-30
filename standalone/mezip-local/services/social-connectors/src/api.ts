import {
  socialArchivePatchSchema,
  socialArchiveQuerySchema,
  socialAccountSettingsSchema,
  socialCollectionCreateSchema,
  socialCollectionItemSchema,
  socialCollectionPatchSchema,
  socialDeleteDataSchema,
  socialExternalPublishSchema,
  socialFounderCurateSchema,
  socialManualSaveSchema,
  socialOAuthCallbackSchema,
  socialOAuthStartSchema,
  socialSnapshotPublishSchema,
} from '@me-zip/schemas';
import type { AuthenticatedPrincipal, SocialArchiveQuery, SocialConnectorProviderCode } from '@me-zip/shared-types';
import {
  SocialConnectorError,
  type SocialConnectorService,
} from './index.js';

export interface SocialApiRequest {
  readonly method: 'GET' | 'POST' | 'PATCH' | 'PUT' | 'DELETE';
  readonly path: string;
  readonly principal?: AuthenticatedPrincipal;
  readonly body?: unknown;
  readonly query?: Readonly<Record<string, string | undefined>>;
  readonly idempotencyKey?: string;
  /** Set only by the separately authenticated Root/Admin host boundary. */
  readonly adminBoundary?: boolean;
}

export interface SocialApiResponse {
  readonly status: number;
  readonly body: Readonly<Record<string, unknown>>;
}

function parsed<T>(result: { readonly success: boolean; readonly data?: T }): T {
  if (!result.success || result.data === undefined) throw new SocialConnectorError('VALIDATION', 'Social request validation failed.');
  return result.data;
}
function principal(request: SocialApiRequest): AuthenticatedPrincipal {
  if (request.principal === undefined) throw new SocialConnectorError('FORBIDDEN', 'An authenticated user is required.');
  return request.principal;
}
function body(request: SocialApiRequest): Record<string, unknown> { return request.body !== null && typeof request.body === 'object' && !Array.isArray(request.body) ? request.body as Record<string, unknown> : {}; }
function key(request: SocialApiRequest, data: Record<string, unknown>): string | undefined { const candidate = request.idempotencyKey ?? data.idempotencyKey; return typeof candidate === 'string' ? candidate : undefined; }
function safeMessage(error: unknown): string {
  if (!(error instanceof SocialConnectorError)) return 'Social connector request failed.';
  switch (error.code) {
    case 'VALIDATION': return 'Social connector request validation failed.';
    case 'FORBIDDEN': return 'This social resource is not available to this principal.';
    case 'NOT_FOUND': return 'Social resource was not found.';
    case 'CONFLICT': return 'This social action conflicts with the current state.';
    case 'RATE_LIMITED': return 'The social provider rate limit was reached.';
    case 'AUTH_EXPIRED': return 'Reconnect the social account before continuing.';
    case 'CAPABILITY_NOT_SUPPORTED':
    case 'NOT_CONFIGURED': return 'This official provider capability is not configured or verified.';
    case 'PERMISSION_DENIED': return 'The provider denied this requested capability.';
    case 'CONTENT_NOT_FOUND': return 'The external content is no longer available.';
    case 'IDEMPOTENCY_REPLAY': return 'This request key was already used with different input.';
    default: return 'Social connector request failed.';
  }
}
function status(error: unknown): number {
  if (!(error instanceof SocialConnectorError)) return 500;
  if (error.code === 'VALIDATION') return 400;
  if (error.code === 'FORBIDDEN' || error.code === 'PERMISSION_DENIED') return 403;
  if (error.code === 'NOT_FOUND' || error.code === 'CONTENT_NOT_FOUND') return 404;
  if (error.code === 'RATE_LIMITED') return 429;
  if (error.code === 'CONFLICT' || error.code === 'IDEMPOTENCY_REPLAY') return 409;
  if (error.code === 'NOT_CONFIGURED' || error.code === 'PROVIDER_UNAVAILABLE') return 503;
  return 422;
}
function provider(value: string | undefined): SocialConnectorProviderCode {
  if (value !== 'X' && value !== 'DOUYIN' && value !== 'MANUAL_LINK') throw new SocialConnectorError('VALIDATION', 'A valid social provider is required.');
  return value;
}
function archiveQuery(request: SocialApiRequest): SocialArchiveQuery {
  const parsedQuery = parsed(socialArchiveQuerySchema.safeParse(request.query ?? {}));
  return {
    ...(parsedQuery.cursor === undefined ? {} : { cursor: parsedQuery.cursor }),
    ...(parsedQuery.limit === undefined ? {} : { limit: parsedQuery.limit }),
    ...(parsedQuery.provider === undefined ? {} : { provider: parsedQuery.provider }),
    ...(parsedQuery.query === undefined ? {} : { query: parsedQuery.query }),
    ...(parsedQuery.tag === undefined ? {} : { tag: parsedQuery.tag }),
    ...(parsedQuery.collectionId === undefined ? {} : { collectionId: parsedQuery.collectionId }),
    ...(parsedQuery.from === undefined ? {} : { from: parsedQuery.from }),
    ...(parsedQuery.to === undefined ? {} : { to: parsedQuery.to }),
    ...(parsedQuery.founderOnly === undefined ? {} : { founderOnly: parsedQuery.founderOnly }),
  };
}

export class SocialConnectorApiAdapter {
  public constructor(private readonly service: SocialConnectorService) {}

  public async handle(request: SocialApiRequest): Promise<SocialApiResponse> {
    try { const data = await this.route(request); return { status: request.method === 'POST' ? 201 : 200, body: { data } }; }
    catch (error) { return { status: status(error), body: { error: { code: error instanceof SocialConnectorError ? error.code : 'INTERNAL', message: safeMessage(error), retryable: error instanceof SocialConnectorError ? error.retryable : false } } }; }
  }

  private async route(request: SocialApiRequest): Promise<unknown> {
    if (request.path === '/v1/social/providers' && request.method === 'GET') return this.service.listProviders();
    const capabilityMatch = /^\/v1\/social\/providers\/([^/]+)\/capabilities$/u.exec(request.path);
    if (capabilityMatch !== null && request.method === 'GET') return this.service.getProviderCapabilities(provider(capabilityMatch[1]));
    const me = principal(request);
    if (request.path === '/v1/social/oauth/start' && request.method === 'POST') return this.service.startOAuth(me, parsed(socialOAuthStartSchema.safeParse(body(request))) as never);
    if (request.path === '/v1/social/oauth/callback' && request.method === 'POST') return this.service.completeOAuth(me, parsed(socialOAuthCallbackSchema.safeParse(body(request))) as never);
    if (request.path === '/v1/social/accounts' && request.method === 'GET') return this.service.listAccounts(me);
    const accountMatch = /^\/v1\/social\/accounts\/([^/]+)(?:\/(disconnect|refresh|sync|status|settings))?$/u.exec(request.path);
    if (accountMatch !== null) {
      const accountId = accountMatch[1]!; const action = accountMatch[2] ?? '';
      if (action === '' && request.method === 'GET') return this.service.listAccounts(me).find((item) => item.id === accountId) ?? (() => { throw new SocialConnectorError('NOT_FOUND', 'Social account was not found.'); })();
      if (action === 'disconnect' && request.method === 'POST') return this.service.disconnect(me, accountId);
      if (action === 'settings' && request.method === 'PATCH') return this.service.updateAccountSettings(me, accountId, parsed(socialAccountSettingsSchema.safeParse(body(request))) as never);
      if (action === 'refresh' && request.method === 'POST') return this.service.refreshAccount(me, accountId);
      if (action === 'sync' && request.method === 'POST') return this.service.syncAccount(me, accountId, key(request, body(request)));
      if (action === 'status' && request.method === 'GET') return this.service.getSyncStatus(me, accountId);
    }
    if (request.path === '/v1/social/import-jobs' && request.method === 'GET') return this.service.listImportJobs(me, request.query?.accountId);
    const jobMatch = /^\/v1\/social\/import-jobs\/([^/]+)(?:\/(cancel))?$/u.exec(request.path);
    if (jobMatch !== null) { if (jobMatch[2] === 'cancel' && request.method === 'POST') return this.service.cancelImport(me, jobMatch[1]!); if (!jobMatch[2] && request.method === 'GET') return this.service.getImportJob(me, jobMatch[1]!); }
    if (request.path === '/v1/social/archive' && request.method === 'GET') return this.service.listArchive(me, archiveQuery(request));
    if (request.path === '/v1/social/archive' && request.method === 'POST') return this.service.saveManualLink(me, parsed(socialManualSaveSchema.safeParse(body(request))) as never, key(request, body(request)));
    const archiveMatch = /^\/v1\/social\/archive\/([^/]+)(?:\/(publish-snapshot|publish-external))?$/u.exec(request.path);
    if (archiveMatch !== null) {
      const archiveId = archiveMatch[1]!; const action = archiveMatch[2] ?? '';
      if (!action && request.method === 'GET') return this.service.getArchiveItem(me, archiveId);
      if (!action && request.method === 'PATCH') return this.service.patchArchiveItem(me, archiveId, parsed(socialArchivePatchSchema.safeParse(body(request))) as never);
      if (!action && request.method === 'DELETE') { this.service.deleteArchiveItem(me, archiveId); return { deleted: true }; }
      if (action === 'publish-snapshot' && request.method === 'POST') {
        const input = parsed(socialSnapshotPublishSchema.safeParse({ ...body(request), archiveItemId: archiveId }));
        return this.service.publishSnapshot(me, { archiveItemId: archiveId, target: input.target, visibility: input.visibility, ...(input.groupId === undefined ? {} : { groupId: input.groupId }) });
      }
      if (action === 'publish-external' && request.method === 'POST') {
        const input = parsed(socialExternalPublishSchema.safeParse({ ...body(request), archiveItemId: archiveId }));
        return this.service.publishExternal(me, { archiveItemId: archiveId, accountId: input.accountId, ...(input.visibility === undefined ? {} : { visibility: input.visibility }), ...(input.text === undefined ? {} : { text: input.text }), ...(input.mediaIds === undefined ? {} : { mediaIds: input.mediaIds }) });
      }
    }
    if (request.path === '/v1/social/imported-data' && request.method === 'DELETE') return { deleted: this.service.deleteImportedData(me, parsed(socialDeleteDataSchema.safeParse(body(request))) as never) };
    if (request.path === '/v1/social/collections' && request.method === 'GET') return this.service.listCollections(me);
    if (request.path === '/v1/social/collections' && request.method === 'POST') return this.service.createCollection(me, parsed(socialCollectionCreateSchema.safeParse(body(request))) as never);
    const collectionMatch = /^\/v1\/social\/collections\/([^/]+)(?:\/(items))?$/u.exec(request.path);
    if (collectionMatch !== null) {
      const collectionId = collectionMatch[1]!;
      if (!collectionMatch[2] && request.method === 'PATCH') return this.service.patchCollection(me, collectionId, parsed(socialCollectionPatchSchema.safeParse(body(request))) as never);
      if (collectionMatch[2] === 'items' && request.method === 'POST') { const input = parsed(socialCollectionItemSchema.safeParse(body(request))); return this.service.addToCollection(me, collectionId, input.archiveItemId); }
      if (collectionMatch[2] === 'items' && request.method === 'DELETE') { const input = parsed(socialCollectionItemSchema.safeParse(body(request))); return this.service.removeFromCollection(me, collectionId, input.archiveItemId); }
    }
    if (request.path === '/v1/social/founder-feed' && request.method === 'GET') return this.service.listFounderFeed(me);
    if (request.path === '/v1/social/founder/curate' && request.method === 'POST') return this.service.curateFounder(me, parsed(socialFounderCurateSchema.safeParse(body(request))) as never);
    if (request.path === '/v1/social/audit' && request.method === 'GET') return this.service.listAuditEvents(me);
    const rootMatch = /^\/v1\/admin\/social\/users\/([^/]+)\/archive$/u.exec(request.path);
    if (rootMatch !== null && request.method === 'GET') {
      if (request.adminBoundary !== true) throw new SocialConnectorError('FORBIDDEN', 'A separately authenticated Root boundary is required.');
      return this.service.getRootArchive(me, rootMatch[1]!, archiveQuery(request));
    }
    throw new SocialConnectorError('NOT_FOUND', 'Social connector route was not found.');
  }
}
