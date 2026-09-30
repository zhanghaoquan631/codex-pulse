import type { AuthenticatedPrincipal, JsonObject } from '@me-zip/shared-types';

import {
  ArchiveError,
  type ArchiveMutationOptions,
  type ArchiveOfflineMutationInput,
  type InMemoryArchiveRepository,
} from './index.js';
import type { StorageProvider } from './storage.js';

export interface ArchiveApiRequest {
  readonly method: 'GET' | 'POST' | 'PATCH' | 'DELETE';
  readonly path: string;
  readonly principal: AuthenticatedPrincipal;
  readonly body?: JsonObject;
  readonly query?: Readonly<Record<string, string | undefined>>;
  readonly idempotencyKey?: string;
}

export interface ArchiveApiResponse {
  readonly status: number;
  readonly body: Readonly<Record<string, unknown>>;
}

function asString(value: unknown): string {
  if (typeof value !== 'string' || value.trim() === '')
    throw new ArchiveError('VALIDATION', 'A required string is missing.');
  return value;
}

function asBody(request: ArchiveApiRequest): JsonObject {
  return request.body ?? {};
}

function queryLimit(request: ArchiveApiRequest): number | undefined {
  return request.query?.limit === undefined ? undefined : Number(request.query.limit);
}

function pagination(request: ArchiveApiRequest): { cursor?: string; limit?: number } {
  const result: { cursor?: string; limit?: number } = {};
  if (request.query?.cursor !== undefined) result.cursor = request.query.cursor;
  const limit = queryLimit(request);
  if (limit !== undefined) result.limit = limit;
  return result;
}

function weChatSportPayload(body: JsonObject, idempotencyKey?: string): {
  readonly encryptedData: string;
  readonly iv: string;
  readonly idempotencyKey?: string;
} {
  const allowedKeys = new Set(['encryptedData', 'iv']);
  if (Object.keys(body).some((key) => !allowedKeys.has(key))) {
    throw new ArchiveError('VALIDATION', 'WeChat Sport request contains unsupported fields.');
  }
  const encryptedData = asString(body.encryptedData);
  const iv = asString(body.iv);
  if (encryptedData.length > 200_000 || iv.length > 256) {
    throw new ArchiveError('VALIDATION', 'WeChat Sport request is too large.');
  }
  return { encryptedData, iv, ...(idempotencyKey === undefined ? {} : { idempotencyKey }) };
}

function options(request: ArchiveApiRequest): ArchiveMutationOptions {
  const body = asBody(request);
  const expectedRevision =
    typeof body.expectedRevision === 'number'
      ? body.expectedRevision
      : typeof body.expectedVersion === 'number'
        ? body.expectedVersion
        : undefined;
  const result: {
    expectedRevision?: number;
    idempotencyKey?: string;
    source?: ArchiveMutationOptions['source'];
  } = {};
  if (expectedRevision !== undefined) result.expectedRevision = expectedRevision;
  if (request.idempotencyKey !== undefined)
    result.idempotencyKey = request.idempotencyKey;
  if (typeof body.source === 'string')
    result.source = body.source as ArchiveMutationOptions['source'];
  return result as ArchiveMutationOptions;
}

function jsonStatus(error: unknown): number {
  if (!(error instanceof ArchiveError)) return 500;
  switch (error.code) {
    case 'VALIDATION':
      return 400;
    case 'FORBIDDEN':
      return 403;
    case 'NOT_FOUND':
      return 404;
    case 'QUOTA_EXCEEDED':
      return 413;
    case 'CONFLICT':
    case 'IDEMPOTENCY_REPLAY':
      return 409;
    default:
      return 422;
  }
}

/**
 * Framework-neutral route adapter. A production HTTP/WeChat handler can map
 * its request/response objects to this seam without reimplementing ownership,
 * revision or idempotency rules.
 */
export class ArchiveApiAdapter {
  public constructor(
    private readonly repository: InMemoryArchiveRepository,
    private readonly storage?: StorageProvider,
  ) {}

  public handle(request: ArchiveApiRequest): ArchiveApiResponse {
    try {
      const body = asBody(request);
      const isMediaRoute = request.path.startsWith('/v1/media');
      const segments = request.path
        .replace(isMediaRoute ? /^\/v1\/media\/?/ : /^\/v1\/archive\/?/, '')
        .split('/')
        .filter(Boolean);
      const [resource, id, action] = segments;
      let data: unknown;
      if (isMediaRoute && segments[0] === 'quota' && request.method === 'GET')
        data = this.repository.getStorageQuota(request.principal);
      else if (isMediaRoute)
        data = this.media(request, segments[0], segments[1], body);
      else if (resource === 'life') data = this.life(request, id, action, body);
      else if (resource === 'timeline' && request.method === 'GET')
        data = this.repository.getTimeline(request.principal, {
          includeTrashed: request.query?.includeTrashed === 'true',
          ...(request.query?.from === undefined ? {} : { from: request.query.from }),
          ...(request.query?.to === undefined ? {} : { to: request.query.to }),
          ...pagination(request),
        });
      else if (resource === 'search' && request.method === 'GET')
        data = this.repository.search(request.principal, request.query?.q ?? '', {
          includeTrashed: request.query?.includeTrashed === 'true',
          ...pagination(request),
        });
      else if (resource === 'history') data = this.history(request, id, action, body);
      else if (resource === 'fitness') data = this.fitness(request, id, action, body);
      else if (resource === 'body-metrics') data = this.bodyMetrics(request, id, body);
      else if (resource === 'steps' && request.method === 'GET')
        data = this.repository.listSteps(request.principal, queryLimit(request));
      else if (resource === 'steps' && id === 'wechat' && action === 'import' && request.method === 'POST')
        data = this.repository.importWeChatSportSteps(
          request.principal,
          weChatSportPayload(body, request.idempotencyKey),
        );
      else if (resource === 'steps' && request.method === 'POST') {
        if (body.source === 'WECHAT') {
          throw new ArchiveError('FORBIDDEN', 'WeChat steps must be imported from encrypted WeChat Sport data.');
        }
        data = this.repository.upsertSteps(request.principal, {
          ...body,
          day: asString(body.day),
          steps: Number(body.steps),
          source: asString(body.source),
          ...(request.idempotencyKey === undefined
            ? {}
            : { idempotencyKey: request.idempotencyKey }),
        });
      }
      else if (resource === 'daily-pack')
        data = this.dailyPack(request, id, action, body);
      else if (resource === 'export' && request.method === 'POST')
        data = this.repository.exportArchive(request.principal, {
          includeTrashed: body.includeTrashed === true,
        });
      else if (resource === 'offline-mutations' && request.method === 'POST')
        data = this.repository.recordOfflineMutation(request.principal, {
          ...body,
          clientMutationId: asString(body.clientMutationId),
          entityType: asString(
            body.entityType,
          ) as ArchiveOfflineMutationInput['entityType'],
          operation: asString(
            body.operation,
          ) as ArchiveOfflineMutationInput['operation'],
          payload: (body.payload ?? {}) as JsonObject,
        });
      else throw new ArchiveError('NOT_FOUND', 'Archive route was not found.');
      return { status: request.method === 'POST' ? 201 : 200, body: { data } };
    } catch (error) {
      const status = jsonStatus(error);
      return {
        status,
        body: {
          error: {
            code: error instanceof ArchiveError ? error.code : 'INTERNAL',
            message: error instanceof Error ? error.message : 'Archive request failed.',
            retryable: status >= 500 || status === 409,
          },
        },
      };
    }
  }

  private bodyMetrics(
    request: ArchiveApiRequest,
    id: string | undefined,
    body: JsonObject,
  ): unknown {
    if (request.method === 'POST' && id === undefined) {
      return this.repository.createBodyMetric(request.principal, {
        ...body,
        measuredAt: asString(body.measuredAt),
        ...(request.idempotencyKey === undefined
          ? {}
          : { idempotencyKey: request.idempotencyKey }),
      });
    }
    if (request.method === 'GET' && id === undefined)
      return this.repository.listBodyMetrics(request.principal);
    if (id === undefined)
      throw new ArchiveError('NOT_FOUND', 'Body metric was not found.');
    if (request.method === 'GET')
      return this.repository.getBodyMetric(request.principal, id);
    if (request.method === 'PATCH')
      return this.repository.updateBodyMetric(
        request.principal,
        id,
        { ...body, measuredAt: asString(body.measuredAt) },
        request.idempotencyKey,
      );
    if (request.method === 'DELETE')
      return this.repository.permanentlyDeleteBodyMetric(
        request.principal,
        id,
        request.idempotencyKey,
      );
    throw new ArchiveError('NOT_FOUND', 'Body metric route was not found.');
  }

  private media(
    request: ArchiveApiRequest,
    id: string | undefined,
    action: string | undefined,
    body: JsonObject,
  ): unknown {
    if (request.method === 'GET' && id === 'quota')
      return this.repository.getStorageQuota(request.principal);
    if (request.method === 'POST' && id === undefined) {
      return this.repository.registerMedia(request.principal, {
        ...body,
        storageKey: asString(body.storageKey),
        contentType: asString(body.contentType),
        bytes: Number(body.bytes),
        ...(request.idempotencyKey === undefined
          ? {}
          : { idempotencyKey: request.idempotencyKey }),
      });
    }
    if (request.method === 'GET' && id === undefined)
      return this.repository.listMedia(
        request.principal,
        request.query?.includeDeleted === 'true',
      );
    if (id === undefined)
      throw new ArchiveError('NOT_FOUND', 'Media asset was not found.');
    if (request.method === 'GET' && action === 'links')
      return this.repository.listMediaLinks(request.principal, id);
    if (request.method === 'GET' && action === 'download') {
      const media = this.repository.getMedia(request.principal, id);
      if (media.status !== 'READY')
        throw new ArchiveError('INVALID_STATE', 'Media is not ready for download delivery.');
      if (this.storage === undefined)
        throw new ArchiveError('INVALID_STATE', 'Media delivery provider is not configured.');
      const url = this.storage.createSignedReadUrl(media.storageKey);
      const expiresAt = new URL(url).searchParams.get('expires');
      return {
        mediaId: media.id,
        contentType: media.contentType,
        url,
        ...(expiresAt === null ? {} : { expiresAt: new Date(Number(expiresAt)).toISOString() }),
      };
    }
    if (request.method === 'GET')
      return this.repository.getMedia(
        request.principal,
        id,
        request.query?.includeDeleted === 'true',
      );
    if (request.method === 'PATCH')
      return this.repository.updateMedia(
        request.principal,
        id,
        {
          ...body,
          ...(body.status === undefined
            ? {}
            : { status: asString(body.status) as never }),
        },
        request.idempotencyKey,
      );
    if (request.method === 'DELETE')
      return this.repository.permanentlyDeleteMedia(
        request.principal,
        id,
        request.idempotencyKey,
      );
    if (request.method === 'POST' && action === 'link')
      return this.repository.linkMedia(
        request.principal,
        id,
        asString(body.targetType) as never,
        asString(body.targetId),
        request.idempotencyKey,
      );
    throw new ArchiveError('NOT_FOUND', 'Media route was not found.');
  }

  private life(
    request: ArchiveApiRequest,
    id: string | undefined,
    action: string | undefined,
    body: JsonObject,
  ): unknown {
    if (request.method === 'POST' && id === undefined)
      return this.repository.createEntry(request.principal, {
        ...body,
        kind: asString(body.kind) as never,
        occurredAt: asString(body.occurredAt),
        ...(request.idempotencyKey === undefined
          ? {}
          : { idempotencyKey: request.idempotencyKey }),
      });
    if (request.method === 'GET' && id === undefined)
      return this.repository.listEntries(request.principal, {
        ...pagination(request),
      });
    if (id === undefined)
      throw new ArchiveError('NOT_FOUND', 'Life entry was not found.');
    if (request.method === 'GET' && action === 'revisions')
      return this.repository.listRevisions(request.principal, id);
    if (request.method === 'GET' && action === 'published-snapshots') {
      return this.repository.listPublishedSnapshots(
        request.principal,
        id,
        request.query?.includeRevoked === 'true',
      );
    }
    if (request.method === 'GET' && action === 'ai-insights') {
      return this.repository.listAiInsights(
        request.principal,
        id,
        request.query?.includeRevoked === 'true',
      );
    }
    if (request.method === 'GET')
      return this.repository.getEntry(request.principal, id, {
        includeTrashed: request.query?.includeTrashed === 'true',
      });
    if (request.method === 'PATCH')
      return this.repository.updateEntry(request.principal, id, body, options(request));
    if (request.method === 'DELETE' && action === undefined)
      return this.repository.trashEntry(request.principal, id, options(request));
    if (request.method === 'POST' && action === 'restore')
      return this.repository.restoreEntry(request.principal, id, options(request));
    if (request.method === 'POST' && action === 'publish') {
      return this.repository.publishSnapshot(
        request.principal,
        id,
        body.selectedContent as JsonObject | undefined,
      );
    }
    if (request.method === 'POST' && action === 'ai-insights') {
      const sourceRevision =
        typeof body.sourceRevision === 'number'
          ? body.sourceRevision
          : Number(body.sourceRevision);
      if (!Number.isInteger(sourceRevision) || sourceRevision < 1)
        throw new ArchiveError('VALIDATION', 'A positive sourceRevision is required.');
      return this.repository.createAiInsight(request.principal, {
        entryId: id,
        sourceRevision,
        provider: asString(body.provider),
        model: asString(body.model),
        insight: (body.insight ?? {}) as JsonObject,
      });
    }
    if (request.method === 'POST' && action === 'permanent-delete')
      return this.repository.permanentlyDeleteEntry(
        request.principal,
        id,
        request.idempotencyKey,
      );
    throw new ArchiveError('NOT_FOUND', 'Life route was not found.');
  }

  private history(
    request: ArchiveApiRequest,
    id: string | undefined,
    action: string | undefined,
    body: JsonObject,
  ): unknown {
    if (request.method === 'POST' && id === undefined)
      return this.repository.createHistory(request.principal, {
        ...body,
        title: asString(body.title),
        date: asString(body.date),
        ...(request.idempotencyKey === undefined
          ? {}
          : { idempotencyKey: request.idempotencyKey }),
      });
    if (request.method === 'GET' && id === undefined)
      return this.repository.listHistory(request.principal);
    if (id === undefined)
      throw new ArchiveError('NOT_FOUND', 'History entry was not found.');
    if (request.method === 'GET')
      return this.repository.getHistory(request.principal, id, {
        includeTrashed: request.query?.includeTrashed === 'true',
      });
    if (request.method === 'PATCH')
      return this.repository.updateHistory(
        request.principal,
        id,
        body,
        options(request),
      );
    if (request.method === 'DELETE')
      return this.repository.trashHistory(request.principal, id, options(request));
    if (request.method === 'POST' && action === 'restore')
      return this.repository.restoreHistory(request.principal, id, options(request));
    throw new ArchiveError('NOT_FOUND', 'History route was not found.');
  }

  private fitness(
    request: ArchiveApiRequest,
    id: string | undefined,
    action: string | undefined,
    body: JsonObject,
  ): unknown {
    if (request.method === 'POST' && id === undefined)
      return this.repository.createFitness(request.principal, {
        ...body,
        occurredAt: asString(body.occurredAt),
        ...(request.idempotencyKey === undefined
          ? {}
          : { idempotencyKey: request.idempotencyKey }),
      });
    if (request.method === 'GET' && id === undefined)
      return this.repository.listFitness(request.principal);
    if (id === undefined)
      throw new ArchiveError('NOT_FOUND', 'Fitness entry was not found.');
    if (request.method === 'GET')
      return this.repository.getFitness(request.principal, id, {
        includeTrashed: request.query?.includeTrashed === 'true',
      });
    if (request.method === 'PATCH')
      return this.repository.updateFitness(
        request.principal,
        id,
        body,
        options(request),
      );
    if (request.method === 'DELETE')
      return this.repository.trashFitness(request.principal, id, options(request));
    if (request.method === 'POST' && action === 'restore')
      return this.repository.restoreFitness(request.principal, id, options(request));
    throw new ArchiveError('NOT_FOUND', 'Fitness route was not found.');
  }

  private dailyPack(
    request: ArchiveApiRequest,
    day: string | undefined,
    action: string | undefined,
    body: JsonObject,
  ): unknown {
    if (day === undefined)
      throw new ArchiveError('VALIDATION', 'Daily Pack day is required.');
    if (request.method === 'GET')
      return this.repository.getDailyPack(request.principal, day);
    if (request.method === 'POST' && action === 'complete')
      return this.repository.upsertDailyPack(request.principal, {
        ...body,
        day,
        ...(request.idempotencyKey === undefined
          ? {}
          : { idempotencyKey: request.idempotencyKey }),
      });
    throw new ArchiveError('NOT_FOUND', 'Daily Pack route was not found.');
  }
}
