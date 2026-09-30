import {
  aiGatewayByokConfigureSchema,
  aiGatewayByokProviderCodeSchema,
  aiGatewayConversationCreateSchema,
  aiGatewayConversationListQuerySchema,
  aiGatewayInvocationCancelSchema,
  aiGatewayInvocationCreateSchema,
  aiGatewayInvocationEventQuerySchema,
  aiGatewayInvocationListQuerySchema,
  aiGatewayPreferencesUpdateSchema,
  idSchema,
} from '@me-zip/schemas';
import type { AuthenticatedPrincipal } from '@me-zip/shared-types';

import {
  AiGatewayError,
} from './gateway.js';
import type {
  AiGatewayService,
} from './gateway.js';

export interface AiGatewayApiRequest {
  readonly method: 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE';
  readonly path: string;
  readonly principal?: AuthenticatedPrincipal;
  readonly body?: unknown;
  readonly query?: Readonly<Record<string, string | number | boolean | undefined>>;
  readonly headers?: Readonly<Record<string, string | undefined>>;
}

export interface AiGatewayApiResponse {
  readonly status: number;
  readonly body: {
    readonly data?: unknown;
    readonly error?: {
      readonly code: string;
      readonly message: string;
      readonly retryable: boolean;
    };
  };
}

const bodyOf = (request: AiGatewayApiRequest): unknown => request.body ?? {};
const parse = <T>(result: { readonly success: boolean; readonly data?: T }): T => {
  if (!result.success || result.data === undefined) throw new AiGatewayError('VALIDATION', 'AI Gateway request is invalid.');
  return result.data;
};
const requirePrincipal = (request: AiGatewayApiRequest): AuthenticatedPrincipal => {
  if (request.principal === undefined) throw new AiGatewayError('FORBIDDEN', 'An authenticated principal is required.');
  return request.principal;
};
const idempotencyKey = (request: AiGatewayApiRequest): string => {
  const value = request.headers?.['idempotency-key'] ?? request.headers?.['Idempotency-Key'];
  if (value === undefined || value.trim() === '') throw new AiGatewayError('VALIDATION', 'An idempotency key is required.');
  return value;
};

function pathId(value: string): string {
  try {
    return parse(idSchema.safeParse(decodeURIComponent(value)));
  } catch (error) {
    if (error instanceof AiGatewayError) throw error;
    throw new AiGatewayError('VALIDATION', 'AI Gateway path id is invalid.');
  }
}

function errorStatus(error: unknown): number {
  if (!(error instanceof AiGatewayError)) return 500;
  if (error.code === 'NOT_FOUND') return 404;
  if (error.code === 'FORBIDDEN' || error.code === 'ENTITLEMENT_REQUIRED') return 403;
  if (error.code === 'QUOTA_EXCEEDED' || error.code === 'RATE_LIMITED') return 429;
  if (error.code === 'PROVIDER_UNAVAILABLE') return 503;
  if (error.code === 'CONFLICT' || error.code === 'IDEMPOTENCY_CONFLICT' || error.code === 'CREDENTIAL_NOT_CONFIGURED') return 409;
  return 400;
}

/** Never serialize internal errors because they could contain a provider,
 * credential-vault, schema, or adapter implementation detail. */
function consumerMessage(error: unknown): string {
  if (!(error instanceof AiGatewayError)) return 'AI Gateway request could not be completed.';
  if (error.code === 'NOT_FOUND') return 'AI Gateway resource was not found.';
  if (error.code === 'QUOTA_EXCEEDED') return 'AI Gateway quota is currently exhausted.';
  if (error.code === 'RATE_LIMITED') return 'AI Gateway request rate is temporarily limited.';
  if (error.code === 'ENTITLEMENT_REQUIRED') return 'AI Gateway access requires a server-authorized entitlement.';
  if (error.code === 'TIMEOUT') return 'AI Gateway processing timed out safely.';
  if (error.code === 'PROVIDER_UNAVAILABLE') return 'The requested AI Gateway model is unavailable.';
  if (error.code === 'IDEMPOTENCY_CONFLICT') return 'This request conflicts with an earlier request.';
  return 'AI Gateway request is not available.';
}

/** Consumer-only adapter. Every route derives its owner from the authenticated
 * principal, and there is intentionally no admin/root forwarding route,
 * target-user field, provider-key field, or archive AI-insight endpoint. */
export class AiGatewayApiAdapter {
  public constructor(private readonly service: AiGatewayService) {}

  public handle(request: AiGatewayApiRequest): AiGatewayApiResponse {
    try {
      return {
        status: request.method === 'POST' && request.path === '/v1/ai-gateway/invocations' ? 201 : 200,
        body: { data: this.route(request) },
      };
    } catch (error) {
      const status = errorStatus(error);
      return {
        status,
        body: {
          error: {
            code: error instanceof AiGatewayError ? error.code : 'INTERNAL',
            message: consumerMessage(error),
            retryable: status === 429 || status >= 500,
          },
        },
      };
    }
  }

  private route(request: AiGatewayApiRequest): unknown {
    const principal = requirePrincipal(request);
    const body = bodyOf(request);
    if (request.path === '/v1/ai-gateway/providers' && request.method === 'GET') return this.service.listProviders(principal);
    if (request.path === '/v1/ai-gateway/models' && request.method === 'GET') return this.service.listModels(principal);
    if (request.path === '/v1/ai-gateway/capabilities' && request.method === 'GET') return this.service.listCapabilities(principal);
    if (request.path === '/v1/ai-gateway/quota' && request.method === 'GET') return this.service.getQuota(principal);
    if (request.path === '/v1/ai-gateway/preferences' && request.method === 'GET') return this.service.getPreferences(principal);
    if (request.path === '/v1/ai-gateway/preferences' && request.method === 'PATCH') {
      return this.service.updatePreferences(principal, parse(aiGatewayPreferencesUpdateSchema.safeParse(body)));
    }
    if (request.path === '/v1/ai-gateway/conversations' && request.method === 'GET') {
      return this.service.listConversations(principal, parse(aiGatewayConversationListQuerySchema.safeParse({
        cursor: request.query?.cursor,
        limit: request.query?.limit,
      })));
    }
    if (request.path === '/v1/ai-gateway/conversations' && request.method === 'POST') {
      return this.service.createConversation(
        principal,
        parse(aiGatewayConversationCreateSchema.safeParse(body)),
        idempotencyKey(request),
      );
    }
    if (request.path === '/v1/ai-gateway/invocations' && request.method === 'GET') {
      return this.service.listInvocations(principal, parse(aiGatewayInvocationListQuerySchema.safeParse({
        cursor: request.query?.cursor,
        limit: request.query?.limit,
      })));
    }
    if (request.path === '/v1/ai-gateway/invocations' && request.method === 'POST') {
      return this.service.createInvocation(principal, parse(aiGatewayInvocationCreateSchema.safeParse(body)), idempotencyKey(request));
    }
    if (request.path === '/v1/ai-gateway/byok' && request.method === 'GET') return this.service.listByokStatus(principal);

    const byok = /^\/v1\/ai-gateway\/byok\/([^/]+)$/u.exec(request.path);
    if (byok !== null) {
      const providerCode = parse(aiGatewayByokProviderCodeSchema.safeParse(decodeURIComponent(byok[1]!)));
      if (request.method === 'PUT') {
        return this.service.configureByok(principal, providerCode, parse(aiGatewayByokConfigureSchema.safeParse(body)).encryptedEnvelope, idempotencyKey(request));
      }
      if (request.method === 'DELETE') return this.service.revokeByok(principal, providerCode, idempotencyKey(request));
    }

    const invocation = /^\/v1\/ai-gateway\/invocations\/([^/]+)(?:\/(cancel|events|stream))?$/u.exec(request.path);
    if (invocation !== null) {
      const invocationId = pathId(invocation[1]!);
      const action = invocation[2];
      if (action === undefined && request.method === 'GET') return this.service.getInvocation(principal, invocationId);
      if (action === 'cancel' && request.method === 'POST') {
        parse(aiGatewayInvocationCancelSchema.safeParse(body));
        return this.service.cancelInvocation(principal, invocationId, idempotencyKey(request));
      }
      if (action === 'events' && request.method === 'GET') {
        return this.service.listEvents(principal, invocationId, parse(aiGatewayInvocationEventQuerySchema.safeParse({
          afterSequence: request.query?.afterSequence,
          limit: request.query?.limit,
        })));
      }
      if (action === 'stream' && request.method === 'GET') return this.service.getStreamHandshake(principal, invocationId);
    }
    const conversation = /^\/v1\/ai-gateway\/conversations\/([^/]+)$/u.exec(request.path);
    if (conversation !== null && request.method === 'DELETE') {
      return this.service.deleteConversation(
        principal,
        pathId(conversation[1]!),
        idempotencyKey(request),
      );
    }
    throw new AiGatewayError('NOT_FOUND', 'AI Gateway route was not found.');
  }
}
