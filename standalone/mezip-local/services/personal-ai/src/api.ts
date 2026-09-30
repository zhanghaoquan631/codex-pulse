import {
  personalAiConsentSchema,
  personalAiConversationCreateSchema,
  personalAiExportListQuerySchema,
  personalAiExportRequestSchema,
  personalAiIndexJobListQuerySchema,
  personalAiIndexJobSchema,
  personalAiIndexMutationSchema,
  personalAiInsightSaveSchema,
  personalAiPreferencesUpdateSchema,
  personalAiQueryListQuerySchema,
  personalAiQuerySchema,
  personalAiScopeSchema,
  personalAiSourceListQuerySchema,
  personalAiSourceTypeSchema,
} from '@me-zip/schemas';
import type { AuthenticatedPrincipal, PersonalAIKnowledgeSourceType } from '@me-zip/shared-types';

import { PersonalAIError, type PersonalAIService } from './personal-ai.js';

export interface PersonalAIApiRequest {
  readonly method: 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE';
  readonly path: string;
  readonly principal?: AuthenticatedPrincipal;
  readonly body?: unknown;
  readonly query?: Readonly<Record<string, string | number | boolean | undefined>>;
  readonly headers?: Readonly<Record<string, string | undefined>>;
}

export interface PersonalAIApiResponse {
  readonly status: number;
  readonly body: { readonly data?: unknown; readonly error?: { readonly code: string; readonly message: string; readonly retryable: boolean } };
}

const bodyOf = (request: PersonalAIApiRequest): unknown => request.body ?? {};

function requirePrincipal(request: PersonalAIApiRequest): AuthenticatedPrincipal {
  if (request.principal === undefined) throw new PersonalAIError('FORBIDDEN', 'An authenticated user is required.');
  return request.principal;
}

function parse<T>(result: { readonly success: boolean; readonly data?: T }): T {
  if (!result.success || result.data === undefined) throw new PersonalAIError('VALIDATION', 'Personal AI request is invalid.');
  return result.data;
}

function idempotencyKey(request: PersonalAIApiRequest): string {
  const value = request.headers?.['idempotency-key'] ?? request.headers?.['Idempotency-Key'];
  if (value === undefined || value.trim() === '') throw new PersonalAIError('VALIDATION', 'An idempotency key is required.');
  return value;
}

function optionalIdempotencyKey(request: PersonalAIApiRequest): string | undefined {
  const value = request.headers?.['idempotency-key'] ?? request.headers?.['Idempotency-Key'];
  return value === undefined || value.trim() === '' ? undefined : value;
}

function pathId(value: string): string {
  const decoded = decodeURIComponent(value);
  if (!/^[A-Za-z0-9_-]{1,200}$/u.test(decoded)) throw new PersonalAIError('VALIDATION', 'Personal AI resource id is invalid.');
  return decoded;
}

function errorStatus(error: unknown): number {
  if (!(error instanceof PersonalAIError)) return 500;
  if (error.code === 'FORBIDDEN' || error.code === 'ENTITLEMENT_REQUIRED' || error.code === 'CONSENT_REQUIRED') return 403;
  if (error.code === 'NOT_FOUND') return 404;
  if (error.code === 'CONFLICT') return 409;
  if (error.code === 'RATE_LIMITED') return 429;
  if (error.code === 'INDEX_UNAVAILABLE' || error.code === 'PROVIDER_UNAVAILABLE') return 503;
  return 400;
}

function consumerMessage(error: unknown): string {
  if (!(error instanceof PersonalAIError)) return 'Personal AI request could not be completed.';
  switch (error.code) {
    case 'ENTITLEMENT_REQUIRED': return 'Personal AI access requires a server-authorized entitlement.';
    case 'CONSENT_REQUIRED': return 'Personal AI consent is required for this operation.';
    case 'FORBIDDEN': return 'Personal AI is not available for this request.';
    case 'NOT_FOUND': return 'Personal AI resource was not found.';
    case 'CONFLICT': return 'This Personal AI request conflicts with an earlier request.';
    case 'INDEX_UNAVAILABLE': return 'The Personal AI index is not currently available.';
    default: return 'Personal AI request is invalid.';
  }
}

/** Consumer-only Personal AI adapter. All owner fields are deliberately
 * derived from `request.principal`; strict schemas reject owner/root fields. */
export class PersonalAIApiAdapter {
  public constructor(private readonly service: PersonalAIService) {}

  public handle(request: PersonalAIApiRequest): PersonalAIApiResponse {
    try {
      const created = request.method === 'POST' && (
        request.path === '/v1/personal-ai/queries' ||
        request.path === '/v1/personal-ai/exports' ||
        request.path === '/v1/personal-ai/index-jobs' ||
        request.path === '/v1/personal-ai/index/rebuild' ||
        request.path === '/v1/personal-ai/conversations'
      );
      return { status: created ? 201 : 200, body: { data: this.route(request) } };
    } catch (error) {
      const status = errorStatus(error);
      return {
        status,
        body: { error: { code: error instanceof PersonalAIError ? error.code : 'INTERNAL', message: consumerMessage(error), retryable: status >= 500 || status === 429 } },
      };
    }
  }

  private route(request: PersonalAIApiRequest): unknown {
    const principal = requirePrincipal(request);
    const body = bodyOf(request);
    if (request.path === '/v1/personal-ai/privacy' && request.method === 'GET') return this.service.getPrivacy(principal);
    if (request.path === '/v1/personal-ai/preferences' && request.method === 'GET') return this.service.getPreferences(principal);
    if (request.path === '/v1/personal-ai/preferences' && request.method === 'PATCH') return this.service.updatePreferences(principal, parse(personalAiPreferencesUpdateSchema.safeParse(body)));
    if (request.path === '/v1/personal-ai/consent' && request.method === 'GET') return this.service.getConsent(principal);
    if (request.path === '/v1/personal-ai/consent' && request.method === 'PUT') return this.service.acceptConsent(principal, parse(personalAiConsentSchema.safeParse(body)).version);
    if (request.path === '/v1/personal-ai/conversations' && request.method === 'GET') return this.service.listConversations(principal);
    if (request.path === '/v1/personal-ai/conversations' && request.method === 'POST') {
      const conversationInput = parse(personalAiConversationCreateSchema.safeParse(body));
      return this.service.createConversation(principal, conversationInput.scope);
    }
    if (request.path === '/v1/personal-ai/index-status' && request.method === 'GET') return this.service.getIndexStatus(principal);
    if (request.path === '/v1/personal-ai/exports' && request.method === 'GET') {
      return this.service.listExports(principal, parse(personalAiExportListQuerySchema.safeParse({ cursor: request.query?.cursor, limit: request.query?.limit })));
    }
    if (request.path === '/v1/personal-ai/exports' && request.method === 'POST') {
      return this.service.createExport(principal, parse(personalAiExportRequestSchema.safeParse(body)));
    }
    if (request.path === '/v1/personal-ai/index' && request.method === 'DELETE') {
      parse(personalAiIndexMutationSchema.safeParse(body));
      return this.service.clearIndex(principal);
    }
    if (request.path === '/v1/personal-ai/insights' && request.method === 'DELETE') {
      parse(personalAiIndexMutationSchema.safeParse(body));
      return this.service.clearInsights(principal);
    }
    if (request.path === '/v1/personal-ai/index/rebuild' && request.method === 'POST') {
      const input = parse(personalAiIndexJobSchema.safeParse(body));
      const key = optionalIdempotencyKey(request);
      return this.service.rebuildIndex(principal, { principal, ...input, ...(key === undefined ? {} : { idempotencyKey: key }) });
    }
    if (request.path === '/v1/personal-ai/index-jobs' && request.method === 'GET') {
      return this.service.listIndexJobs(principal, parse(personalAiIndexJobListQuerySchema.safeParse({ cursor: request.query?.cursor, limit: request.query?.limit })));
    }
    if (request.path === '/v1/personal-ai/index-jobs' && request.method === 'POST') {
      const input = parse(personalAiIndexJobSchema.safeParse(body));
      const key = optionalIdempotencyKey(request);
      return this.service.createIndexJob(principal, { principal, ...input, ...(key === undefined ? {} : { idempotencyKey: key }) });
    }
    if (request.path === '/v1/personal-ai/sources' && request.method === 'GET') {
      const query = parse(personalAiSourceListQuerySchema.safeParse({
        scope: request.query?.scope ?? 'NONE',
        from: request.query?.from,
        to: request.query?.to,
        sourceTypes: request.query?.sourceTypes,
      }));
      const sourceTypes = query.sourceTypes === undefined || query.sourceTypes === ''
        ? undefined
        : query.sourceTypes.split(',').map((value) => parse(personalAiSourceTypeSchema.safeParse(value.trim())));
      const sourceInput = {
        principal,
        scope: parse(personalAiScopeSchema.safeParse(query.scope)),
        ...(query.from === undefined || query.to === undefined ? {} : { dateRange: { from: query.from, to: query.to } }),
        ...(sourceTypes === undefined ? {} : { sourceTypes: sourceTypes as PersonalAIKnowledgeSourceType[] }),
      };
      return this.service.listSources(principal, sourceInput);
    }
    if (request.path === '/v1/personal-ai/queries' && request.method === 'GET') return this.service.listQueries(principal, parse(personalAiQueryListQuerySchema.safeParse({ cursor: request.query?.cursor, limit: request.query?.limit })));
    if (request.path === '/v1/personal-ai/queries' && request.method === 'POST') return this.service.query(principal, parse(personalAiQuerySchema.safeParse(body)), idempotencyKey(request));
    if (request.path === '/v1/personal-ai/insights' && request.method === 'GET') return this.service.listInsights(principal);

    if (request.path === '/v1/personal-ai/related-memories' && request.method === 'GET') {
      const sourceType = parse(personalAiSourceTypeSchema.safeParse(request.query?.sourceType));
      const sourceId = request.query?.sourceId;
      if (typeof sourceId !== 'string' || sourceId.trim() === '') throw new PersonalAIError('VALIDATION', 'sourceId is required.');
      const limit = request.query?.limit === undefined ? undefined : Number(request.query.limit);
      return this.service.relatedMemories(principal, { sourceType, sourceId, ...(limit === undefined ? {} : { limit }) });
    }

    const queryMatch = /^\/v1\/personal-ai\/queries\/([^/]+)(?:\/(citations))?$/u.exec(request.path);
    if (queryMatch !== null) {
      const queryId = pathId(queryMatch[1]!);
      if (queryMatch[2] === 'citations' && request.method === 'GET') return this.service.listCitations(principal, queryId);
      if (queryMatch[2] === undefined && request.method === 'GET') return this.service.getQuery(principal, queryId);
    }
    const exportMatch = /^\/v1\/personal-ai\/exports\/([^/]+)$/u.exec(request.path);
    if (exportMatch !== null && request.method === 'GET') return this.service.getExport(principal, pathId(exportMatch[1]!));
    const saveInsightMatch = /^\/v1\/personal-ai\/queries\/([^/]+)\/insight$/u.exec(request.path);
    if (saveInsightMatch !== null && request.method === 'POST') {
      const queryId = pathId(saveInsightMatch[1]!);
      const saveInput = parse(personalAiInsightSaveSchema.safeParse(body));
      return this.service.saveInsight(principal, queryId, saveInput.title ?? null);
    }
    const insightMatch = /^\/v1\/personal-ai\/insights\/([^/]+)$/u.exec(request.path);
    if (insightMatch !== null && request.method === 'DELETE') {
      this.service.deleteInsight(principal, pathId(insightMatch[1]!));
      return { deleted: true };
    }
    const conversationMatch = /^\/v1\/personal-ai\/conversations\/([^/]+)$/u.exec(request.path);
    if (conversationMatch !== null && request.method === 'DELETE') return this.service.deleteConversation(principal, pathId(conversationMatch[1]!));
    const cancelMatch = /^\/v1\/personal-ai\/queries\/([^/]+)\/cancel$/u.exec(request.path);
    if (cancelMatch !== null && request.method === 'POST') {
      parse(personalAiIndexMutationSchema.safeParse(body));
      return this.service.cancelQuery(principal, pathId(cancelMatch[1]!));
    }
    const sourceMatch = /^\/v1\/personal-ai\/sources\/([^/]+)\/([^/]+)\/index$/u.exec(request.path);
    if (sourceMatch !== null && request.method === 'DELETE') {
      this.service.invalidateSource(principal, { sourceType: parse(personalAiSourceTypeSchema.safeParse(sourceMatch[1])), sourceId: pathId(sourceMatch[2]!) });
      return { deleted: true };
    }
    throw new PersonalAIError('NOT_FOUND', 'Personal AI route was not found.');
  }
}
