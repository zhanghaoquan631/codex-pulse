import { createHash, randomUUID } from 'node:crypto';

import { personalAiPreferencesUpdateSchema, personalAiConsentSchema } from '@me-zip/schemas';
import type {
  AuthenticatedPrincipal,
  PersonalAIConsent,
  PersonalAIPreferences,
  PersonalAIPrivacyView,
} from '@me-zip/shared-types';

import {
  assertPersonalAIDurableRepository,
  type PersonalAIDurableIdempotencyReceipt,
  type PersonalAIDurableRepository,
} from './persistence.js';
import type { PersonalAITrustedPrincipalResolver } from './durable-index-service.js';

export interface DurablePersonalAIStateApiRequest {
  readonly method: 'GET' | 'PATCH' | 'PUT' | 'POST';
  readonly path: string;
  readonly principal?: AuthenticatedPrincipal;
  readonly body?: unknown;
  readonly headers?: Readonly<Record<string, string | undefined>>;
}

export interface DurablePersonalAIStateApiResponse {
  readonly status: number;
  readonly body: { readonly data?: unknown; readonly error?: { readonly code: string; readonly message: string; readonly retryable: boolean } };
}

export interface DurablePersonalAIStateApiOptions {
  readonly repository: PersonalAIDurableRepository;
  readonly trustedPrincipalResolver: PersonalAITrustedPrincipalResolver;
  readonly providerDisclosure?: string;
  readonly now?: () => string;
}

class DurablePersonalAIStateError extends Error {
  public constructor(public readonly code: 'FORBIDDEN' | 'VALIDATION' | 'NOT_CONFIGURED' | 'INTERNAL', message: string) {
    super(message);
    this.name = 'DurablePersonalAIStateError';
  }
}

const defaultPreferences = (now: string): PersonalAIPreferences => ({
  enabled: false,
  archiveMode: 'ARCHIVE_ONLY',
  defaultScope: 'NONE',
  includeHistoricalRevisions: false,
  updatedAt: now,
});

const digest = (value: unknown): string => createHash('sha256').update(JSON.stringify(value) ?? '').digest('hex');

function idempotencyKey(request: DurablePersonalAIStateApiRequest): string | null {
  const key = request.headers?.['idempotency-key'] ?? request.headers?.['Idempotency-Key'];
  return key === undefined || key.trim() === '' ? null : key.trim();
}

function owner(options: DurablePersonalAIStateApiOptions, request: DurablePersonalAIStateApiRequest): string {
  if (request.principal === undefined) throw new DurablePersonalAIStateError('FORBIDDEN', 'An authenticated user is required.');
  const ownerId = options.trustedPrincipalResolver.resolveOwnerId(request.principal);
  if (ownerId === null || ownerId !== request.principal.userId) throw new DurablePersonalAIStateError('FORBIDDEN', 'Personal AI state is not available for this request.');
  return ownerId;
}

function receipt(ownerId: string, operation: PersonalAIDurableIdempotencyReceipt['operation'], key: string | null, fingerprint: string, resourceId: string, now: string): PersonalAIDurableIdempotencyReceipt | null {
  return key === null ? null : { ownerId, operation, key, fingerprint, resourceId, createdAt: now };
}

function consentProjection(state: Awaited<ReturnType<PersonalAIDurableRepository['loadOwnerState']>>, disclosure: string): PersonalAIConsent {
  return { ...state.currentConsent, providerDisclosure: disclosure };
}

function status(error: unknown): number {
  if (!(error instanceof DurablePersonalAIStateError)) return 500;
  if (error.code === 'FORBIDDEN') return 403;
  if (error.code === 'NOT_CONFIGURED') return 503;
  if (error.code === 'VALIDATION') return 400;
  return 500;
}

function message(error: unknown): string {
  if (!(error instanceof DurablePersonalAIStateError)) return 'Personal AI state request could not be completed.';
  if (error.code === 'FORBIDDEN') return 'Personal AI state is not available for this request.';
  if (error.code === 'NOT_CONFIGURED') return 'This Personal AI operation is not durably configured.';
  return 'Personal AI state request is invalid.';
}

/**
 * Owner-scoped durable state boundary for the portions already backed by the
 * repository. It intentionally does not route query/insight/export/clear
 * operations: those require their own durable transaction contracts and must
 * fail closed rather than falling back to the process-local service.
 */
export class DurablePersonalAIStateApiAdapter {
  private readonly now: () => string;
  private readonly providerDisclosure: string;

  public constructor(private readonly options: DurablePersonalAIStateApiOptions) {
    assertPersonalAIDurableRepository(options.repository);
    if (options.trustedPrincipalResolver.productionSafe !== true) throw new DurablePersonalAIStateError('FORBIDDEN', 'A trusted Personal AI principal resolver is required.');
    this.now = options.now ?? (() => new Date().toISOString());
    this.providerDisclosure = options.providerDisclosure ?? 'Personal AI provider disclosure is server-configured.';
  }

  public async handle(request: DurablePersonalAIStateApiRequest): Promise<DurablePersonalAIStateApiResponse> {
    try {
      return { status: 200, body: { data: await this.route(request) } };
    } catch (error) {
      const httpStatus = status(error);
      return { status: httpStatus, body: { error: { code: error instanceof DurablePersonalAIStateError ? error.code : 'INTERNAL', message: message(error), retryable: httpStatus >= 500 } } };
    }
  }

  private async route(request: DurablePersonalAIStateApiRequest): Promise<unknown> {
    const ownerId = owner(this.options, request);
    const repository = this.options.repository;
    const state = await repository.loadOwnerState({ ownerId });
    if (state.ownerId !== ownerId) throw new DurablePersonalAIStateError('FORBIDDEN', 'Personal AI state is not available for this request.');
    if (request.path === '/v1/personal-ai/preferences' && request.method === 'GET') return state.preferences ?? defaultPreferences(this.now());
    if (request.path === '/v1/personal-ai/consent' && request.method === 'GET') return consentProjection(state, this.providerDisclosure);
    if (request.path === '/v1/personal-ai/privacy' && request.method === 'GET') {
      const preferences = state.preferences ?? defaultPreferences(this.now());
      const view: PersonalAIPrivacyView = {
        preferences,
        consent: consentProjection(state, this.providerDisclosure),
        index: {
          enabled: preferences.enabled,
          status: state.sources.some((source) => source.indexStatus === 'FAILED') ? 'FAILED' : state.sources.some((source) => source.indexStatus === 'READY') ? 'READY' : 'PENDING',
          indexVersion: state.sources.find((source) => source.indexVersion !== null)?.indexVersion ?? 'unconfigured',
          indexedSourceCount: state.sources.filter((source) => source.indexStatus === 'READY').length,
          indexedChunkCount: state.chunks.filter((chunk) => chunk.embeddingStatus === 'READY').length,
          lastIndexedAt: state.sources.map((source) => source.updatedAt).sort().at(-1) ?? null,
          embeddingProvider: 'server-configured',
        },
      };
      return view;
    }
    if (request.path === '/v1/personal-ai/preferences' && request.method === 'PATCH') {
      const parsed = personalAiPreferencesUpdateSchema.safeParse(request.body ?? {});
      if (!parsed.success) throw new DurablePersonalAIStateError('VALIDATION', 'Personal AI preferences are invalid.');
      const current = state.preferences ?? defaultPreferences(this.now());
      const preferences: PersonalAIPreferences = {
        enabled: parsed.data.enabled ?? current.enabled,
        archiveMode: parsed.data.archiveMode ?? current.archiveMode,
        defaultScope: parsed.data.defaultScope ?? current.defaultScope,
        includeHistoricalRevisions: parsed.data.includeHistoricalRevisions ?? current.includeHistoricalRevisions,
        updatedAt: this.now(),
      };
      const key = idempotencyKey(request);
      await repository.writePreferences({ ownerId, preferences, idempotency: receipt(ownerId, 'PREFERENCES', key, digest(parsed.data), ownerId, preferences.updatedAt) });
      return preferences;
    }
    if (request.path === '/v1/personal-ai/consent' && request.method === 'PUT') {
      const parsed = personalAiConsentSchema.safeParse(request.body ?? {});
      if (!parsed.success) throw new DurablePersonalAIStateError('VALIDATION', 'Personal AI consent is invalid.');
      const occurredAt = this.now();
      const key = idempotencyKey(request);
      await repository.appendConsent({
        ownerId,
        event: { id: randomUUID(), ownerId, consentVersion: parsed.data.version, eventType: 'ACCEPTED', providerDisclosureVersion: 'server-configured', policyHash: digest(parsed.data.version), occurredAt, idempotencyKey: key },
        idempotency: receipt(ownerId, 'CONSENT', key, digest(parsed.data), ownerId, occurredAt),
      });
      const refreshed = await repository.loadOwnerState({ ownerId });
      return consentProjection(refreshed, this.providerDisclosure);
    }
    if (request.path.startsWith('/v1/personal-ai/queries') || request.path.startsWith('/v1/personal-ai/insights') || request.path.startsWith('/v1/personal-ai/exports') || request.path === '/v1/personal-ai/index') {
      throw new DurablePersonalAIStateError('NOT_CONFIGURED', 'This Personal AI operation is not durably configured.');
    }
    throw new DurablePersonalAIStateError('VALIDATION', 'Personal AI state route was not found.');
  }
}
