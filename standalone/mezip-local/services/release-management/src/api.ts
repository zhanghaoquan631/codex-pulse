import type { AuthenticatedPrincipal } from '@me-zip/shared-types';
import { ReleaseManagementError, type ReleaseManagementService } from './index.js';

export interface ReleaseManagementApiRequest {
  readonly method: 'GET' | 'POST' | 'PUT';
  readonly path: string;
  readonly principal?: AuthenticatedPrincipal;
  readonly body?: unknown;
}
export interface ReleaseManagementApiResponse {
  readonly status: number;
  readonly body: Readonly<Record<string, unknown>>;
}
function actor(request: ReleaseManagementApiRequest): AuthenticatedPrincipal {
  if (!request.principal)
    throw new ReleaseManagementError('UNAUTHORIZED', 'Sign in is required.');
  return request.principal;
}
function record(value: unknown): Record<string, unknown> {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}
function asString(value: unknown): string {
  return typeof value === 'string' ? value : '';
}
function asNullableString(value: unknown): string | null {
  return typeof value === 'string' ? value : null;
}
function status(error: unknown): number {
  if (!(error instanceof ReleaseManagementError)) return 500;
  return error.code === 'UNAUTHORIZED'
    ? 401
    : error.code === 'FORBIDDEN'
      ? 403
      : error.code === 'NOT_FOUND'
        ? 404
        : error.code === 'CONFLICT'
          ? 409
          : error.code === 'MAINTENANCE'
            ? 503
            : 400;
}
export class ReleaseManagementApiAdapter {
  public constructor(private readonly service: ReleaseManagementService) {}
  public handle(request: ReleaseManagementApiRequest): ReleaseManagementApiResponse {
    try {
      return {
        status: request.method === 'POST' ? 201 : 200,
        body: { data: this.route(request) },
      };
    } catch (error) {
      return {
        status: status(error),
        body: {
          error: {
            code: error instanceof ReleaseManagementError ? error.code : 'INTERNAL',
            message:
              error instanceof ReleaseManagementError
                ? error.message
                : 'Release request could not be completed.',
          },
        },
      };
    }
  }
  private route(request: ReleaseManagementApiRequest): unknown {
    const principal = actor(request);
    const body = record(request.body);
    if (request.path === '/v1/release/enrollment' && request.method === 'GET')
      return this.service.getOwnEnrollment(principal);
    if (request.path === '/v1/release/enrollment/accept' && request.method === 'POST')
      return this.service.acceptEnrollment(principal);
    if (request.path === '/v1/release/feedback' && request.method === 'POST')
      return this.service.submitFeedback(principal, {
        category: asString(body.category) as never,
        title: asString(body.title),
        description: asString(body.description),
        platform: asString(body.platform) as never,
        appVersion: asString(body.appVersion),
        buildNumber: Number(body.buildNumber),
        route: asNullableString(body.route),
      });
    if (request.path === '/v1/release/telemetry' && request.method === 'POST')
      return this.service.telemetry({
        name: asString(body.name) as never,
        platform: asString(body.platform),
        route: asNullableString(body.route),
        appVersion: asString(body.appVersion),
        buildNumber: Number(body.buildNumber),
        fields: record(body.fields) as Record<string, string | number | boolean>,
      });
    if (request.path === '/v1/release/founder/feedback' && request.method === 'GET')
      return this.service.listFeedback(principal);
    if (request.path === '/v1/release/founder/audit' && request.method === 'GET')
      return this.service.listAudit(principal);
    if (request.path === '/v1/release/founder/builds' && request.method === 'POST')
      return this.service.createBuild(principal, {
        appVersion: asString(body.appVersion),
        buildNumber: Number(body.buildNumber),
        gitCommit: asString(body.gitCommit),
        channel: asString(body.channel) as never,
        environment: asString(body.environment) as never,
        apiVersion: asString(body.apiVersion),
        schemaVersion: asString(body.schemaVersion),
        releaseNotes: asString(body.releaseNotes),
        knownIssues: Array.isArray(body.knownIssues)
          ? body.knownIssues.filter((item): item is string => typeof item === 'string')
          : [],
      });
    if (request.path === '/v1/release/founder/enrollments' && request.method === 'POST')
      return this.service.enroll(
        principal,
        asString(body.userId),
        asString(body.channel) as never,
        asNullableString(body.expiresAt),
      );
    if (request.path === '/v1/release/founder/flags' && request.method === 'PUT')
      return this.service.setFlag(principal, {
        key: asString(body.key),
        description: asString(body.description),
        enabled: body.enabled === true,
        environment: asString(body.environment) as never,
        platform: body.platform === null ? null : (asString(body.platform) as never),
        releaseChannel:
          body.releaseChannel === null
            ? null
            : (asString(body.releaseChannel) as never),
        rolloutPercentage: Number(body.rolloutPercentage),
        killSwitch: body.killSwitch === true,
      });
    if (
      request.path === '/v1/release/founder/maintenance' &&
      request.method === 'PUT'
    ) {
      this.service.setMaintenance(principal, body.active === true);
      return { active: body.active === true };
    }
    const evaluation = /^\/v1\/release\/flags\/([^/]+)$/u.exec(request.path);
    if (evaluation && request.method === 'GET')
      return this.service.evaluate(
        principal,
        decodeURIComponent(evaluation[1]!),
        asString(body.environment) as never,
        body.platform === null ? null : (asString(body.platform) as never),
      );
    throw new ReleaseManagementError('NOT_FOUND', 'Release route was not found.');
  }
}
