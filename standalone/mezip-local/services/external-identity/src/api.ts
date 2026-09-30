import {
  externalIdentityCreateSchema,
  externalIdentityLaunchSchema,
  externalIdentityOAuthCallbackSchema,
  externalIdentityOAuthStartSchema,
  externalIdentityReorderSchema,
  externalIdentityUpdateSchema,
  externalIdentityVisibilityUpdateSchema,
} from '@me-zip/schemas';
import type { AuthenticatedPrincipal } from '@me-zip/shared-types';
import { ExternalIdentityError, type ExternalIdentityService } from './index.js';

export interface ExternalIdentityApiRequest {
  readonly method: 'GET' | 'POST' | 'PATCH' | 'PUT' | 'DELETE';
  readonly path: string;
  readonly principal?: AuthenticatedPrincipal;
  readonly body?: unknown;
  readonly query?: Readonly<Record<string, string | undefined>>;
  readonly idempotencyKey?: string;
}

export interface ExternalIdentityApiResponse {
  readonly status: number;
  readonly body: Readonly<Record<string, unknown>>;
}

function principal(request: ExternalIdentityApiRequest): AuthenticatedPrincipal {
  if (request.principal === undefined) throw new ExternalIdentityError('UNAUTHORIZED', 'An authenticated user is required.');
  return request.principal;
}

function body(request: ExternalIdentityApiRequest): Record<string, unknown> {
  return request.body !== null && typeof request.body === 'object' && !Array.isArray(request.body)
    ? request.body as Record<string, unknown>
    : {};
}

function parse<T>(value: { readonly success: boolean; readonly data?: T }): T {
  if (!value.success || value.data === undefined) throw new ExternalIdentityError('VALIDATION', 'External identity request is invalid.');
  return value.data;
}

function idempotencyKey(request: ExternalIdentityApiRequest): string | undefined {
  return request.idempotencyKey;
}

function status(error: unknown): number {
  if (!(error instanceof ExternalIdentityError)) return 500;
  if (error.code === 'UNAUTHORIZED') return 401;
  if (error.code === 'FORBIDDEN') return 403;
  if (error.code === 'NOT_FOUND') return 404;
  if (error.code === 'CONFLICT' || error.code === 'IDEMPOTENCY_REPLAY') return 409;
  if (error.code === 'RATE_LIMITED') return 429;
  if (error.code === 'NOT_CONFIGURED' || error.code === 'PROVIDER_UNAVAILABLE') return 503;
  return 400;
}

function safeMessage(error: unknown): string {
  if (!(error instanceof ExternalIdentityError)) return 'Connected Apps request could not be completed.';
  switch (error.code) {
    case 'UNAUTHORIZED': return 'Please sign in before managing Connected Apps.';
    case 'FORBIDDEN': return 'This Connected Apps resource is unavailable to this account.';
    case 'NOT_FOUND': return 'The requested external identity was not found.';
    case 'NOT_CONFIGURED': return 'This official provider connection is not configured.';
    case 'PROVIDER_UNAVAILABLE': return 'The external provider is temporarily unavailable.';
    case 'REAUTH_REQUIRED': return 'Reconnect this provider before continuing.';
    case 'OAUTH_STATE_INVALID':
    case 'OAUTH_STATE_EXPIRED': return 'The OAuth callback could not be verified. Please restart connection.';
    case 'IDEMPOTENCY_REPLAY': return 'This action key was already used with different input.';
    default: return 'Please check the submitted public identity details.';
  }
}

export class ExternalIdentityApiAdapter {
  public constructor(private readonly service: ExternalIdentityService) {}

  public async handle(request: ExternalIdentityApiRequest): Promise<ExternalIdentityApiResponse> {
    try {
      const data = await this.route(request);
      return { status: request.method === 'POST' ? 201 : 200, body: { data } };
    } catch (error) {
      return {
        status: status(error),
        body: {
          error: {
            code: error instanceof ExternalIdentityError ? error.code : 'INTERNAL',
            message: safeMessage(error),
            retryable: error instanceof ExternalIdentityError ? error.retryable : false,
          },
        },
      };
    }
  }

  private async route(request: ExternalIdentityApiRequest): Promise<unknown> {
    if (request.path === '/v1/external-identities/providers' && request.method === 'GET') return this.service.listProviders();
    const publicProfile = /^\/v1\/public\/profiles\/([^/]+)\/external-identities$/u.exec(request.path);
    if (publicProfile !== null && request.method === 'GET') return this.service.getPublicProfile(decodeURIComponent(publicProfile[1]!));
    const actor = principal(request);
    if (request.path === '/v1/external-identities' && request.method === 'GET') return this.service.listIdentities(actor);
    if (request.path === '/v1/external-identities' && request.method === 'POST') {
      return this.service.createManualIdentity(actor, parse(externalIdentityCreateSchema.safeParse(body(request))), idempotencyKey(request));
    }
    if (request.path === '/v1/external-identities/reorder' && request.method === 'POST') {
      return this.service.reorder(actor, parse(externalIdentityReorderSchema.safeParse(body(request))).identityIds);
    }
    if (request.path === '/v1/external-identities/connections' && request.method === 'GET') return this.service.listConnections(actor);
    if (request.path === '/v1/external-identities/oauth/start' && request.method === 'POST') {
      return this.service.startOAuth(actor, parse(externalIdentityOAuthStartSchema.safeParse(body(request))));
    }
    if (request.path === '/v1/external-identities/oauth/callback' && request.method === 'POST') {
      return this.service.completeOAuth(actor, parse(externalIdentityOAuthCallbackSchema.safeParse(body(request))));
    }
    const identity = /^\/v1\/external-identities\/([^/]+)(?:\/(visibility|disconnect|launch))?$/u.exec(request.path);
    if (identity !== null) {
      const identityId = decodeURIComponent(identity[1]!);
      const action = identity[2] ?? '';
      if (action === '' && request.method === 'GET') return this.service.getIdentity(actor, identityId);
      if (action === '' && request.method === 'PATCH') return this.service.updateIdentity(actor, identityId, parse(externalIdentityUpdateSchema.safeParse(body(request))));
      if (action === '' && request.method === 'DELETE') return this.service.deleteIdentity(actor, identityId);
      if (action === 'visibility' && request.method === 'PATCH') return this.service.setVisibility(actor, identityId, parse(externalIdentityVisibilityUpdateSchema.safeParse(body(request))).visibility);
      if (action === 'disconnect' && request.method === 'POST') return this.service.disconnect(actor, identityId);
      if (action === 'launch' && request.method === 'POST') return this.service.launch(actor, identityId, parse(externalIdentityLaunchSchema.safeParse(body(request))).action);
    }
    throw new ExternalIdentityError('NOT_FOUND', 'Connected Apps route was not found.');
  }
}
