import { personalAiIndexJobListQuerySchema, personalAiIndexJobSchema } from '@me-zip/schemas';
import type { AuthenticatedPrincipal } from '@me-zip/shared-types';

import {
  DurablePersonalAIIndexError,
  type DurablePersonalAIIndexService,
  type DurablePersonalAIIndexRequest,
} from './durable-index-service.js';

export interface DurablePersonalAIIndexApiRequest {
  readonly method: 'GET' | 'POST';
  readonly path: string;
  readonly principal?: AuthenticatedPrincipal;
  readonly body?: unknown;
  readonly query?: Readonly<Record<string, string | number | boolean | undefined>>;
  readonly headers?: Readonly<Record<string, string | undefined>>;
}

export interface DurablePersonalAIIndexApiResponse {
  readonly status: number;
  readonly body: { readonly data?: unknown; readonly error?: { readonly code: string; readonly message: string; readonly retryable: boolean } };
}

function requirePrincipal(request: DurablePersonalAIIndexApiRequest): AuthenticatedPrincipal {
  if (request.principal === undefined) throw new DurablePersonalAIIndexError('FORBIDDEN', 'An authenticated user is required.');
  return request.principal;
}

function parse<T>(result: { readonly success: boolean; readonly data?: T }): T {
  if (!result.success || result.data === undefined) throw new DurablePersonalAIIndexError('VALIDATION', 'Personal AI index request is invalid.');
  return result.data;
}

function idempotencyKey(request: DurablePersonalAIIndexApiRequest): string | undefined {
  const value = request.headers?.['idempotency-key'] ?? request.headers?.['Idempotency-Key'];
  return value === undefined || value.trim() === '' ? undefined : value;
}

function errorStatus(error: unknown): number {
  if (!(error instanceof DurablePersonalAIIndexError)) return 500;
  if (error.code === 'FORBIDDEN' || error.code === 'ENTITLEMENT_REQUIRED' || error.code === 'CONSENT_REQUIRED') return 403;
  if (error.code === 'NOT_FOUND') return 404;
  if (error.code === 'CONFLICT') return 409;
  return 400;
}

function consumerMessage(error: unknown): string {
  if (!(error instanceof DurablePersonalAIIndexError)) return 'Personal AI index request could not be completed.';
  switch (error.code) {
    case 'ENTITLEMENT_REQUIRED': return 'Personal AI indexing requires a server-authorized entitlement.';
    case 'CONSENT_REQUIRED': return 'Personal AI consent is required before indexing.';
    case 'FORBIDDEN': return 'Personal AI indexing is not available for this request.';
    case 'NOT_FOUND': return 'Personal AI index job was not found.';
    case 'CONFLICT': return 'This Personal AI index request conflicts with an earlier request.';
    default: return 'Personal AI index request is invalid.';
  }
}

/**
 * Durable index-only HTTP boundary.  It is intentionally separate from the
 * local `PersonalAIApiAdapter`: a production host must explicitly mount this
 * adapter, so a map-backed service cannot be mistaken for the async path.
 */
export class DurablePersonalAIIndexApiAdapter {
  public constructor(private readonly service: DurablePersonalAIIndexService) {}

  public async handle(request: DurablePersonalAIIndexApiRequest): Promise<DurablePersonalAIIndexApiResponse> {
    try {
      const created = request.method === 'POST' && (request.path === '/v1/personal-ai/index-jobs' || request.path === '/v1/personal-ai/index/rebuild');
      return { status: created ? 201 : 200, body: { data: await this.route(request) } };
    } catch (error) {
      const status = errorStatus(error);
      return {
        status,
        body: { error: { code: error instanceof DurablePersonalAIIndexError ? error.code : 'INTERNAL', message: consumerMessage(error), retryable: status >= 500 } },
      };
    }
  }

  private async route(request: DurablePersonalAIIndexApiRequest): Promise<unknown> {
    const principal = requirePrincipal(request);
    if (request.path === '/v1/personal-ai/index-status' && request.method === 'GET') return this.service.getIndexStatus(principal);
    if (request.path === '/v1/personal-ai/index-jobs' && request.method === 'GET') {
      const query = parse(personalAiIndexJobListQuerySchema.safeParse({ cursor: request.query?.cursor, limit: request.query?.limit }));
      return this.service.listIndexJobs(principal, query.cursor === undefined
        ? { ...(query.limit === undefined ? {} : { limit: query.limit }) }
        : { cursor: query.cursor, ...(query.limit === undefined ? {} : { limit: query.limit }) });
    }
    if ((request.path === '/v1/personal-ai/index-jobs' || request.path === '/v1/personal-ai/index/rebuild') && request.method === 'POST') {
      const input = parse(personalAiIndexJobSchema.safeParse(request.body ?? {})) as DurablePersonalAIIndexRequest;
      const key = idempotencyKey(request);
      return this.service.createIndexJob(principal, key === undefined ? input : { ...input, idempotencyKey: key });
    }
    throw new DurablePersonalAIIndexError('NOT_FOUND', 'Personal AI index route was not found.');
  }
}
