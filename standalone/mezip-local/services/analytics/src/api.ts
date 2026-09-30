import {
  adminAiUsageReadSchema,
  aiUsageBatchIngestSchema,
  aiUsageManualSessionCreateSchema,
  aiUsagePairingCompleteSchema,
  aiUsagePairingCreateSchema,
  aiUsagePreferencesPatchSchema,
  aiUsageRangeQuerySchema,
  aiUsageRangeDeleteSchema,
  aiUsageSessionCorrectionSchema,
  aiUsageSessionDeleteSchema,
  aiUsageImportSessionSchema,
  idSchema,
} from '@me-zip/schemas';
import type { AuthenticatedPrincipal } from '@me-zip/shared-types';

import {
  AiUsageError,
} from './ai-usage.js';
import type {
  AdminAiUsageReader,
  AiUsageAdminRequestContext,
  AiUsageService,
} from './ai-usage.js';

export interface AiUsageApiRequest {
  readonly method: 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE';
  readonly path: string;
  readonly principal?: AuthenticatedPrincipal;
  readonly body?: unknown;
  readonly query?: Readonly<Record<string, string | number | boolean | undefined>>;
  /** Credential is device-only, scoped to batch ingestion, and must be
   * supplied over the authenticated transport rather than query/body. */
  readonly headers?: Readonly<Record<string, string | undefined>>;
}

export interface AiUsageApiResponse {
  readonly status: number;
  readonly body: {
    readonly data?: unknown;
    readonly error?: { readonly code: string; readonly message: string; readonly retryable: boolean };
  };
}

export interface AdminAiUsageApiRequest {
  readonly method: 'GET';
  readonly path: string;
  readonly principal: AuthenticatedPrincipal;
  readonly body?: unknown;
  /** This context is injected by the trusted Admin session, never ordinary
   * client JSON. */
  readonly context?: AiUsageAdminRequestContext;
}

const bodyOf = (request: AiUsageApiRequest): unknown => request.body ?? {};
const parse = <T>(result: { readonly success: boolean; readonly data?: T }): T => {
  if (!result.success || result.data === undefined) throw new AiUsageError('VALIDATION', 'AI Usage request is invalid.');
  return result.data;
};
const requirePrincipal = (request: AiUsageApiRequest): AuthenticatedPrincipal => {
  if (request.principal === undefined) throw new AiUsageError('FORBIDDEN', 'An authenticated principal is required.');
  return request.principal;
};
const readRecord = (value: unknown): Readonly<Record<string, unknown>> => {
  if (value === null || typeof value !== 'object' || Array.isArray(value)) {
    throw new AiUsageError('VALIDATION', 'AI Usage request is invalid.');
  }
  return value as Readonly<Record<string, unknown>>;
};

function rangeOf(request: AiUsageApiRequest) {
  return parse(aiUsageRangeQuerySchema.safeParse({
    from: request.query?.from,
    to: request.query?.to,
    limit: request.query?.limit,
  }));
}

function deviceCredential(request: AiUsageApiRequest): string {
  const headers = request.headers ?? {};
  const found = headers['x-mezip-device-credential'] ?? headers['X-MEZIP-DEVICE-CREDENTIAL'];
  if (found === undefined || found.trim() === '') throw new AiUsageError('FORBIDDEN', 'A device credential is required.');
  return found;
}

function responseStatus(error: unknown): number {
  if (!(error instanceof AiUsageError)) return 500;
  if (error.code === 'NOT_FOUND') return 404;
  if (error.code === 'FORBIDDEN' || error.code === 'ROOT_DENIED' || error.code === 'PRIVACY_VIOLATION') return 403;
  if (error.code === 'PAIRING_EXPIRED') return 410;
  if (error.code === 'TRACKING_DISABLED' || error.code === 'DEVICE_REVOKED') return 409;
  if (error.code === 'CONFLICT' || error.code === 'IDEMPOTENCY_CONFLICT') return 409;
  return 400;
}

function consumerMessage(error: unknown): string {
  if (!(error instanceof AiUsageError)) return 'AI Usage request could not be completed.';
  if (error.code === 'NOT_FOUND') return 'AI Usage resource was not found.';
  if (error.code === 'TRACKING_DISABLED') return 'Automatic tracking is disabled.';
  if (error.code === 'DEVICE_REVOKED') return 'This device is no longer connected.';
  if (error.code === 'PAIRING_EXPIRED') return 'This pairing request has expired.';
  if (error.code === 'IDEMPOTENCY_CONFLICT') return 'This request cannot be replayed with different metadata.';
  return 'AI Usage request is not available.';
}

/** Consumer plus device-collector adapter. It never accepts a client user id,
 * source, platform authority, app-registry write, or Root/admin claim. */
export class AiUsageApiAdapter {
  public constructor(private readonly service: AiUsageService) {}

  public handle(request: AiUsageApiRequest): AiUsageApiResponse {
    try {
      const data = this.route(request);
      return {
        status: request.method === 'POST' ? 201 : 200,
        body: { data },
      };
    } catch (error) {
      const status = responseStatus(error);
      return {
        status,
        body: {
          error: {
            code: error instanceof AiUsageError ? error.code : 'INTERNAL',
            message: consumerMessage(error),
            retryable: status >= 500,
          },
        },
      };
    }
  }

  private route(request: AiUsageApiRequest): unknown {
    const body = bodyOf(request);
    if (request.path === '/v1/ai-usage/apps' && request.method === 'GET') return this.service.listApps();
    if (request.path === '/v1/ai-usage/providers' && request.method === 'GET') return this.service.listProviders();
    if (request.path === '/v1/ai-usage/overview' && request.method === 'GET') return this.service.getOverview(requirePrincipal(request), rangeOf(request));
    if (request.path === '/v1/ai-usage/preferences' && request.method === 'GET') return this.service.getPreferences(requirePrincipal(request));
    if (request.path === '/v1/ai-usage/preferences' && request.method === 'PATCH') {
      return this.service.updatePreferences(requirePrincipal(request), parse(aiUsagePreferencesPatchSchema.safeParse(body)));
    }
    if (request.path === '/v1/ai-usage/devices' && request.method === 'GET') return this.service.listDevices(requirePrincipal(request));
    if (request.path === '/v1/ai-usage/pairings' && request.method === 'GET') return this.service.listPairings(requirePrincipal(request));
    if (request.path === '/v1/ai-usage/pairings' && request.method === 'POST') {
      return this.service.createPairing(requirePrincipal(request), parse(aiUsagePairingCreateSchema.safeParse(body)));
    }
    if (request.path === '/v1/ai-usage/sessions' && request.method === 'GET') return this.service.listSessions(requirePrincipal(request), rangeOf(request));
    if (request.path === '/v1/ai-usage/sessions' && request.method === 'DELETE') {
      return this.service.deleteUsageRange(requirePrincipal(request), parse(aiUsageRangeDeleteSchema.safeParse(body)));
    }
    if (request.path === '/v1/ai-usage/export' && request.method === 'GET') return this.service.exportUsage(requirePrincipal(request), rangeOf(request));
    if (request.path === '/v1/ai-usage/manual-sessions' && request.method === 'POST') {
      return this.service.createManualSession(requirePrincipal(request), parse(aiUsageManualSessionCreateSchema.safeParse(body)));
    }
    if (request.path === '/v1/ai-usage/imports' && request.method === 'POST') {
      return this.service.importSession(requirePrincipal(request), parse(aiUsageImportSessionSchema.safeParse(body)));
    }
    if (request.path === '/v1/ai-usage/batches' && request.method === 'POST') {
      return this.service.ingestBatch(deviceCredential(request), parse(aiUsageBatchIngestSchema.safeParse(body)));
    }

    const completePairing = /^\/v1\/ai-usage\/device-pairings\/([^/]+)\/complete$/u.exec(request.path);
    if (completePairing !== null && request.method === 'POST') {
      const pairingId = parse(idSchema.safeParse(decodeURIComponent(completePairing[1]!)));
      return this.service.completePairing(pairingId, parse(aiUsagePairingCompleteSchema.safeParse(body)));
    }
    const deviceMatch = /^\/v1\/ai-usage\/devices\/([^/]+)$/u.exec(request.path);
    if (deviceMatch !== null && request.method === 'DELETE') {
      const deviceId = parse(idSchema.safeParse(decodeURIComponent(deviceMatch[1]!)));
      return this.service.revokeDevice(requirePrincipal(request), deviceId);
    }
    const sessionMatch = /^\/v1\/ai-usage\/sessions\/([^/]+)$/u.exec(request.path);
    if (sessionMatch !== null && request.method === 'PATCH') {
      const sessionId = parse(idSchema.safeParse(decodeURIComponent(sessionMatch[1]!)));
      return this.service.correctSession(requirePrincipal(request), sessionId, parse(aiUsageSessionCorrectionSchema.safeParse(body)));
    }
    if (sessionMatch !== null && request.method === 'DELETE') {
      const sessionId = parse(idSchema.safeParse(decodeURIComponent(sessionMatch[1]!)));
      const value = parse(aiUsageSessionDeleteSchema.safeParse(body));
      return this.service.deleteSession(requirePrincipal(request), sessionId, value.reason);
    }
    throw new AiUsageError('NOT_FOUND', 'AI Usage route was not found.');
  }
}

/** Separate adapter prevents a consumer route from ever supplying `root`, an
 * admin type, a capability list, or another user's owner id. */
export class AdminAiUsageRouteAdapter {
  public constructor(private readonly reader: AdminAiUsageReader) {}

  public handle(request: AdminAiUsageApiRequest): AiUsageApiResponse {
    try {
      const match = /^\/v1\/admin\/users\/([^/]+)\/ai-usage$/u.exec(request.path);
      if (match === null || request.method !== 'GET') throw new AiUsageError('NOT_FOUND', 'Admin AI Usage route was not found.');
      const targetUserId = parse(idSchema.safeParse(decodeURIComponent(match[1]!)));
      const body = readRecord(request.body ?? {});
      if (Object.keys(body).some((name) => name !== 'reason')) throw new AiUsageError('VALIDATION', 'Admin AI Usage request is invalid.');
      const value = parse(adminAiUsageReadSchema.safeParse({ targetUserId, ...body }));
      return { status: 200, body: { data: this.reader.readUserUsage(request.principal, value.targetUserId, { ...request.context, reason: value.reason }) } };
    } catch (error) {
      const status = responseStatus(error);
      return {
        status,
        body: {
          error: {
            code: error instanceof AiUsageError ? error.code : 'FORBIDDEN',
            message: 'Admin AI Usage request is not available.',
            retryable: false,
          },
        },
      };
    }
  }
}
