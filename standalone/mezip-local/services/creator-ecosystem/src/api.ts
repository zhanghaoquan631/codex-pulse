import {
  creatorProfileUpdateSchema,
  creatorProjectCollaboratorSchema,
  creatorProjectDownloadSchema,
  creatorProjectFollowSchema,
  creatorProjectMediaSchema,
  creatorProjectMetadataUpdateSchema,
  creatorProjectPublishSchema,
  creatorProjectSaveSchema,
  creatorProjectSearchSchema,
  creatorProjectSocialPublishSchema,
  creatorProjectSourceQuerySchema,
  creatorReleaseAssetRegisterSchema,
} from '@me-zip/schemas';
import type { AuthenticatedPrincipal } from '@me-zip/shared-types';
import { CreatorEcosystemError, type CreatorEcosystemService } from './index.js';

export interface CreatorEcosystemApiRequest {
  readonly method: 'GET' | 'POST' | 'PATCH' | 'DELETE';
  readonly path: string;
  readonly principal?: AuthenticatedPrincipal;
  readonly query?: Readonly<Record<string, string | undefined>>;
  readonly body?: unknown;
}

export interface CreatorEcosystemApiResponse {
  readonly status: number;
  readonly body: unknown;
}

function requirePrincipal(request: CreatorEcosystemApiRequest): AuthenticatedPrincipal {
  if (request.principal === undefined) throw new CreatorEcosystemError('FORBIDDEN', 'An authenticated user is required.');
  return request.principal;
}

function parse<T>(result: { readonly success: boolean; readonly data?: T }): T {
  if (!result.success || result.data === undefined) throw new CreatorEcosystemError('VALIDATION', 'Creator ecosystem request is invalid.');
  return result.data;
}

function statusFor(error: unknown): number {
  if (!(error instanceof CreatorEcosystemError)) return 500;
  if (error.code === 'NOT_FOUND') return 404;
  if (error.code === 'FORBIDDEN' || error.code === 'ENTITLEMENT_REQUIRED') return 403;
  if (error.code === 'CONFLICT') return 409;
  if (error.code === 'PROVIDER_UNAVAILABLE') return 503;
  if (error.code === 'DOWNLOAD_EXPIRED') return 410;
  return 400;
}

function safeMessage(error: unknown): string {
  return error instanceof CreatorEcosystemError ? error.message : 'Creator ecosystem request could not be completed.';
}

function projectRoute(path: string): RegExpMatchArray | null {
  return /^\/v1\/creator-ecosystem\/projects\/([^/]+)(?:\/(.*))?$/u.exec(path);
}

export class CreatorEcosystemApiAdapter {
  public constructor(private readonly service: CreatorEcosystemService) {}

  public async handle(request: CreatorEcosystemApiRequest): Promise<CreatorEcosystemApiResponse> {
    try {
      return { status: 200, body: { data: await this.route(request) } };
    } catch (error) {
      const status = statusFor(error);
      return { status, body: { error: { code: error instanceof CreatorEcosystemError ? error.code : 'INTERNAL', message: safeMessage(error), retryable: status >= 500 } } };
    }
  }

  private async route(request: CreatorEcosystemApiRequest): Promise<unknown> {
    const publicProfile = /^\/v1\/public\/creator-profiles\/([^/]+)$/u.exec(request.path);
    if (publicProfile !== null && request.method === 'GET') return this.service.getProfile(null, decodeURIComponent(publicProfile[1]!));
    if (request.path === '/v1/public/creator-projects/search' && request.method === 'GET') {
      const query = parse(creatorProjectSearchSchema.safeParse({ q: request.query?.q, limit: request.query?.limit }));
      return this.service.searchProjects(null, query.q, query.limit);
    }
    const publicProject = /^\/v1\/public\/creator-projects\/([^/]+)$/u.exec(request.path);
    if (publicProject !== null && request.method === 'GET') return this.service.getProjectDetail(null, decodeURIComponent(publicProject[1]!));

    const principal = requirePrincipal(request);
    if (request.path === '/v1/creator-ecosystem/profile' && request.method === 'GET') return this.service.getProfile(principal, principal.userId);
    if (request.path === '/v1/creator-ecosystem/profile' && request.method === 'PATCH') return this.service.updateProfile(principal, parse(creatorProfileUpdateSchema.safeParse(request.body ?? {})));
    if (request.path === '/v1/creator-ecosystem/home' && request.method === 'GET') return this.service.getHome(principal);
    const project = projectRoute(request.path);
    if (project === null) throw new CreatorEcosystemError('NOT_FOUND', 'Creator ecosystem route was not found.');
    const projectId = decodeURIComponent(project[1]!);
    const subpath = project[2] ?? '';
    if (subpath === '' && request.method === 'GET') return this.service.getProjectDetail(principal, projectId);
    if (subpath === 'metadata' && request.method === 'PATCH') return this.service.updateProjectMetadata(principal, projectId, parse(creatorProjectMetadataUpdateSchema.safeParse(request.body ?? {})));
    if (subpath === 'media' && request.method === 'POST') return this.service.setProjectMedia(principal, projectId, parse(creatorProjectMediaSchema.safeParse(request.body ?? {})));
    if (subpath === 'publish' && request.method === 'POST') return this.service.publishProject(principal, projectId, parse(creatorProjectPublishSchema.safeParse(request.body ?? {})));
    if (subpath === 'unpublish' && request.method === 'POST') return this.service.unpublishProject(principal, projectId);
    if (subpath === 'publish-social' && request.method === 'POST') {
      const body = parse(creatorProjectSocialPublishSchema.safeParse(request.body ?? {}));
      return this.service.publishProjectUpdate(principal, projectId, body.snapshotId);
    }
    if (subpath === 'source' && request.method === 'GET') return this.service.readSource(principal, projectId, parse(creatorProjectSourceQuerySchema.safeParse({ path: request.query?.path })).path);
    if (subpath === 'assets' && request.method === 'POST') {
      return this.service.registerReleaseAsset(principal, projectId, parse(creatorReleaseAssetRegisterSchema.safeParse(request.body ?? {})));
    }
    if (subpath === 'downloads' && request.method === 'POST') return this.service.requestDownload(principal, projectId, parse(creatorProjectDownloadSchema.safeParse(request.body ?? {})).assetId);
    const download = /^downloads\/([^/]+)$/u.exec(subpath);
    if (download !== null && request.method === 'GET') return this.service.redeemDownload(principal, decodeURIComponent(download[1]!));
    if (subpath === 'save' && request.method === 'POST') {
      const input = parse(creatorProjectSaveSchema.safeParse(request.body ?? {}));
      return { projectId, saved: this.service.saveProject(principal, projectId, input.saved, input.idempotencyKey) };
    }
    if (subpath === 'follow' && request.method === 'POST') {
      const input = parse(creatorProjectFollowSchema.safeParse(request.body ?? {}));
      const detail = this.service.getProjectDetail(principal, projectId);
      return { creatorId: detail.creator.userId, following: this.service.followCreator(principal, detail.creator.userId, input.followed, input.idempotencyKey) };
    }
    if (subpath === 'stats' && request.method === 'GET') return this.service.getStats(principal, projectId);
    if (subpath === 'collaborators' && request.method === 'POST') {
      // The Phase 10 table is the canonical collaborator store. This local
      // completion deliberately fails closed until the durable invite adapter
      // is composed rather than creating an in-memory second member graph.
      parse(creatorProjectCollaboratorSchema.safeParse(request.body ?? {}));
      throw new CreatorEcosystemError('PROVIDER_UNAVAILABLE', 'Collaborator invite service is not configured.');
    }
    throw new CreatorEcosystemError('NOT_FOUND', 'Creator ecosystem route was not found.');
  }
}
