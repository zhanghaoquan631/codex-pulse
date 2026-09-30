import {
  deploymentCreateSchema,
  deploymentDomainCreateSchema,
  deploymentEnvironmentPatchSchema,
  deploymentListQuerySchema,
  deploymentLogQuerySchema,
  deploymentPreviewShareSchema,
  deploymentPublishSchema,
  deploymentRollbackSchema,
  deploymentSecretSchema,
} from '@me-zip/schemas';
import type { AuthenticatedPrincipal } from '@me-zip/shared-types';
import {
  DeploymentError,
  type CreateDeploymentInput,
  type DeploymentService,
} from './index.js';

export interface DeploymentApiRequest {
  readonly method: 'GET' | 'POST' | 'PATCH' | 'DELETE';
  readonly path: string;
  readonly principal?: AuthenticatedPrincipal;
  readonly query?: Readonly<Record<string, string | undefined>>;
  readonly body?: unknown;
}

export interface DeploymentApiResponse { readonly status: number; readonly body: unknown; }

function parse<T>(result: { readonly success: boolean; readonly data?: T }): T {
  if (!result.success || result.data === undefined) throw new DeploymentError('VALIDATION', 'Deployment request is invalid.');
  return result.data;
}
function user(request: DeploymentApiRequest): AuthenticatedPrincipal {
  if (request.principal === undefined) throw new DeploymentError('FORBIDDEN', 'An authenticated user is required.');
  return request.principal;
}
function statusFor(error: unknown): number {
  if (!(error instanceof DeploymentError)) return 500;
  if (error.code === 'NOT_FOUND') return 404;
  if (error.code === 'FORBIDDEN' || error.code === 'ENTITLEMENT_REQUIRED') return 403;
  if (error.code === 'CONFLICT' || error.code === 'CONFIRMATION_REQUIRED') return 409;
  if (error.code === 'VALIDATION') return 400;
  if (error.code === 'RATE_LIMITED') return 429;
  return 502;
}
function safeMessage(error: unknown): string {
  if (!(error instanceof DeploymentError)) return 'Deployment request could not be completed.';
  if (error.code === 'PROVIDER_FAILED' || error.code === 'PROVIDER_UNAVAILABLE') return 'Deployment provider could not complete the request.';
  return error.message;
}
function projectPath(path: string): RegExpMatchArray | null { return /^\/v1\/projects\/([^/]+)(?:\/(.*))?$/u.exec(path); }

export class DeploymentApiAdapter {
  public constructor(private readonly service: DeploymentService) {}

  public async handle(request: DeploymentApiRequest): Promise<DeploymentApiResponse> {
    try {
      const body = await this.route(request);
      return { status: 200, body: { data: body } };
    } catch (error) {
      const status = statusFor(error);
      return { status, body: { error: { code: error instanceof DeploymentError ? error.code : 'INTERNAL', message: safeMessage(error), retryable: status >= 500 } } };
    }
  }

  private async route(request: DeploymentApiRequest): Promise<unknown> {
    if (request.path === '/v1/public/projects' && request.method === 'GET') throw new DeploymentError('VALIDATION', 'A public project id is required.');
    const publicProject = /^\/v1\/public\/projects\/([^/]+)$/u.exec(request.path);
    if (publicProject !== null && request.method === 'GET') return this.service.getPublicProject(publicProject[1]!);
    if (request.path === '/v1/preview-shares/access' && request.method === 'GET') {
      const token = request.query?.token;
      if (!token) throw new DeploymentError('VALIDATION', 'A preview token is required.');
      return this.service.accessPreview(token);
    }
    const principal = user(request);
    if (request.path === '/v1/deployments' && request.method === 'GET') {
      const projectId = request.query?.projectId;
      if (!projectId) throw new DeploymentError('VALIDATION', 'A project id is required.');
      const query = parse(deploymentListQuerySchema.safeParse({ limit: request.query?.limit }));
      return this.service.listDeployments(principal, projectId, query.limit);
    }
    if (request.path === '/v1/deployments' && request.method === 'POST') return this.service.createDeployment(principal, parse(deploymentCreateSchema.safeParse(request.body ?? {})) as CreateDeploymentInput);
    const deploymentMatch = /^\/v1\/deployments\/([^/]+)(?:\/(.*))?$/u.exec(request.path);
    if (deploymentMatch !== null) {
      const deploymentId = deploymentMatch[1]!;
      const subpath = deploymentMatch[2] ?? '';
      if (subpath === '' && request.method === 'GET') return this.service.getDeployment(principal, deploymentId);
      if (subpath === '' && request.method === 'DELETE') return this.service.deleteDeployment(principal, deploymentId, request.query?.confirmProduction === 'true');
      if (subpath === 'cancel' && request.method === 'POST') return this.service.cancelDeployment(principal, deploymentId);
      if (subpath === 'rollback' && request.method === 'POST') {
        const input = parse(deploymentRollbackSchema.safeParse(request.body ?? {}));
        return this.service.rollbackDeployment(principal, deploymentId, input.targetDeploymentId, input.confirmProduction);
      }
      if (subpath === 'logs' && request.method === 'GET') {
        const query = parse(deploymentLogQuerySchema.safeParse({ cursor: request.query?.cursor, limit: request.query?.limit }));
        return this.service.getLogs(principal, deploymentId, query.cursor, query.limit);
      }
      if (subpath === 'health' && request.method === 'GET') return this.service.getHealth(principal, deploymentId);
      if (subpath === 'preview-shares' && request.method === 'POST') return this.service.createPreviewShare(principal, { deploymentId, ...parse(deploymentPreviewShareSchema.safeParse(request.body ?? {})) });
    }
    const shareMatch = /^\/v1\/preview-shares\/([^/]+)\/revoke$/u.exec(request.path);
    if (shareMatch !== null && request.method === 'POST') return this.service.revokePreviewShare(principal, shareMatch[1]!);
    const domainMatch = /^\/v1\/domains\/([^/]+)(?:\/(verify))?$/u.exec(request.path);
    if (domainMatch !== null) {
      if (domainMatch[2] === 'verify' && request.method === 'POST') return this.service.verifyDomain(principal, domainMatch[1]!);
      if (domainMatch[2] === undefined && request.method === 'DELETE') return this.service.removeDomain(principal, domainMatch[1]!);
    }
    const project = projectPath(request.path);
    if (project !== null) {
      const projectId = project[1]!;
      const subpath = project[2] ?? '';
      if (subpath === 'domains' && request.method === 'GET') return this.service.getDomains(principal, projectId);
      if (subpath === 'domains' && request.method === 'POST') {
        const input = parse(deploymentDomainCreateSchema.safeParse(request.body ?? {}));
        if (input.projectId !== projectId) throw new DeploymentError('VALIDATION', 'Project id does not match the route.');
        return this.service.addDomain(principal, input);
      }
      if (subpath === 'usage' && request.method === 'GET') return this.service.getUsage(principal, projectId);
      if (subpath === 'publish' && request.method === 'GET') return this.service.getPublishSettings(principal, projectId);
      if (subpath === 'publish' && request.method === 'POST') return this.service.publishProject(principal, projectId, parse(deploymentPublishSchema.safeParse(request.body ?? {})));
      if (subpath === 'unpublish' && request.method === 'POST') return this.service.unpublishProject(principal, projectId);
      const environment = /^environment\/(PREVIEW|PRODUCTION)$/.exec(subpath);
      if (environment !== null) {
        if (request.method === 'GET') return this.service.getEnvironment(principal, projectId, environment[1] as 'PREVIEW' | 'PRODUCTION');
        if (request.method === 'PATCH') return this.service.updateEnvironment(principal, projectId, environment[1] as 'PREVIEW' | 'PRODUCTION', parse(deploymentEnvironmentPatchSchema.safeParse(request.body ?? {})));
      }
      if (subpath === 'secrets' && request.method === 'GET') {
        const environment = request.query?.environment;
        if (environment !== 'PREVIEW' && environment !== 'PRODUCTION') throw new DeploymentError('VALIDATION', 'A valid environment is required.');
        return this.service.listSecretMetadata(principal, projectId, environment);
      }
      if (subpath === 'secrets' && request.method === 'POST') {
        const input = parse(deploymentSecretSchema.safeParse(request.body ?? {}));
        if (input.projectId !== projectId) throw new DeploymentError('VALIDATION', 'Project id does not match the route.');
        return this.service.setSecretReference(principal, input);
      }
    }
    throw new DeploymentError('NOT_FOUND', 'Deployment route was not found.');
  }
}
