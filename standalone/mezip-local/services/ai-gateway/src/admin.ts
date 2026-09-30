import type {
  AiGatewayModelRegistryEntry,
  AiGatewayProviderCode,
  AiGatewayProviderRegistryEntry,
  AiGatewayRegistryStatus,
  AuthenticatedPrincipal,
} from '@me-zip/shared-types';
import {
  aiGatewayAdminRegistryUpdateSchema,
  aiGatewayAdminSystemCredentialReferenceSchema,
  aiGatewayModelCodeSchema,
  aiGatewayProviderCodeSchema,
} from '@me-zip/schemas';

import { AiGatewayError, type AiGatewayService } from './gateway.js';

/** The capability is intentionally separate from plan/BYOK ownership. It is
 * added to the Root vocabulary by migration 009 and never accepted from a
 * consumer request field. */
export const aiGatewayAdminCapability = 'ROOT_MANAGE_AI_GATEWAY' as const;

export interface AiGatewayAdminAuthorizer {
  assert(
    principal: AuthenticatedPrincipal,
    capability: typeof aiGatewayAdminCapability,
  ): void;
}

/** A local composition helper used by tests. Production composition must
 * resolve the ODR session and active server capability from trusted auth. */
export class PrincipalAiGatewayAdminAuthorizer implements AiGatewayAdminAuthorizer {
  public assert(
    principal: AuthenticatedPrincipal,
    capability: typeof aiGatewayAdminCapability,
  ): void {
    if (
      principal.adminType !== 'ORIGINAL_DEVELOPER_ROOT' ||
      !principal.adminCapabilities?.includes(capability)
    ) {
      throw new AiGatewayError('FORBIDDEN', 'AI Gateway administration is not available.');
    }
  }
}

export interface AiGatewayAdminAuditEvent {
  readonly action:
    | 'PROVIDER_ENABLED'
    | 'PROVIDER_DISABLED'
    | 'MODEL_ENABLED'
    | 'MODEL_DISABLED'
    | 'MODEL_SYNC'
    | 'PROVIDER_HEALTH_READ'
    | 'SYSTEM_CREDENTIAL_CHANGED'
    | 'SYSTEM_CREDENTIAL_STATUS_READ';
  readonly actorUserId: string;
  readonly providerCode: AiGatewayProviderCode;
  readonly modelCode: string | null;
  readonly reason: string | null;
  readonly occurredAt: string;
}

export interface AiGatewayAdminAuditSink {
  append(event: AiGatewayAdminAuditEvent): void;
}

/** An explicit no-op is available only for local composition; production must
 * inject the append-only Admin audit port from the existing Root boundary. */
export class InMemoryAiGatewayAdminAuditSink implements AiGatewayAdminAuditSink {
  public readonly events: AiGatewayAdminAuditEvent[] = [];

  public append(event: AiGatewayAdminAuditEvent): void {
    this.events.push(structuredClone(event));
  }
}

/** Write-only system credential reference port. It never returns a locator or
 * secret through an Admin list/read route. A production implementation stores
 * the reference in the approved secret-management composition. */
export interface AiGatewaySystemCredentialReferenceStore {
  set(input: {
    readonly providerCode: Exclude<AiGatewayProviderCode, 'LOCAL'>;
    readonly secretReference: string;
  }): void;
  /** Returns configuration state only. The secret manager locator is never
   * returned, even to Root after it has been written. */
  status(input: {
    readonly providerCode: Exclude<AiGatewayProviderCode, 'LOCAL'>;
  }): 'CONFIGURED' | 'NOT_CONFIGURED';
}

export class InMemoryAiGatewaySystemCredentialReferenceStore implements AiGatewaySystemCredentialReferenceStore {
  private readonly references = new Map<Exclude<AiGatewayProviderCode, 'LOCAL'>, string>();

  public set(input: {
    readonly providerCode: Exclude<AiGatewayProviderCode, 'LOCAL'>;
    readonly secretReference: string;
  }): void {
    this.references.set(input.providerCode, input.secretReference);
  }

  public status(input: {
    readonly providerCode: Exclude<AiGatewayProviderCode, 'LOCAL'>;
  }): 'CONFIGURED' | 'NOT_CONFIGURED' {
    return this.references.has(input.providerCode) ? 'CONFIGURED' : 'NOT_CONFIGURED';
  }
}

function normalizedReason(value: string | undefined): string | null {
  const reason = value?.trim();
  if (reason === undefined || reason.length === 0) return null;
  if (reason.length > 2_000) throw new AiGatewayError('VALIDATION', 'AI Gateway admin reason is invalid.');
  return reason;
}

/** Server-only administration facade. No consumer SDK route reaches this
 * class, and it never accepts/returns a system secret, a BYOK envelope or a
 * target-user credential. */
export class AdminAiGatewayService {
  public constructor(
    private readonly gateway: AiGatewayService,
    private readonly authorizer: AiGatewayAdminAuthorizer,
    private readonly audit: AiGatewayAdminAuditSink,
    private readonly systemCredentialReferences: AiGatewaySystemCredentialReferenceStore = new InMemoryAiGatewaySystemCredentialReferenceStore(),
    private readonly now: () => string = () => new Date().toISOString(),
  ) {}

  public listProviders(principal: AuthenticatedPrincipal): readonly AiGatewayProviderRegistryEntry[] {
    this.authorizer.assert(principal, aiGatewayAdminCapability);
    return this.gateway.listProviders(principal);
  }

  public setProviderStatus(input: {
    readonly principal: AuthenticatedPrincipal;
    readonly providerCode: AiGatewayProviderCode;
    readonly status: AiGatewayRegistryStatus;
    readonly reason?: string;
  }): AiGatewayProviderRegistryEntry {
    this.authorizer.assert(input.principal, aiGatewayAdminCapability);
    const result = this.gateway.adminSetProviderStatus(input.providerCode, input.status);
    this.audit.append({
      action: input.status === 'ACTIVE' ? 'PROVIDER_ENABLED' : 'PROVIDER_DISABLED',
      actorUserId: input.principal.userId,
      providerCode: input.providerCode,
      modelCode: null,
      reason: normalizedReason(input.reason),
      occurredAt: this.now(),
    });
    return result;
  }

  public setModelStatus(input: {
    readonly principal: AuthenticatedPrincipal;
    readonly modelCode: string;
    readonly status: AiGatewayRegistryStatus;
    readonly reason?: string;
  }): AiGatewayModelRegistryEntry {
    this.authorizer.assert(input.principal, aiGatewayAdminCapability);
    const before = this.gateway.listModels(input.principal).find((model) => model.code === input.modelCode);
    if (before === undefined) throw new AiGatewayError('NOT_FOUND', 'AI Gateway model was not found.');
    const result = this.gateway.adminSetModelStatus(input.modelCode, input.status);
    this.audit.append({
      action: input.status === 'ACTIVE' ? 'MODEL_ENABLED' : 'MODEL_DISABLED',
      actorUserId: input.principal.userId,
      providerCode: before.providerCode,
      modelCode: input.modelCode,
      reason: normalizedReason(input.reason),
      occurredAt: this.now(),
    });
    return result;
  }

  public syncLocalModels(principal: AuthenticatedPrincipal): readonly AiGatewayModelRegistryEntry[] {
    this.authorizer.assert(principal, aiGatewayAdminCapability);
    const synced = this.gateway.adminSyncLocalModels();
    this.audit.append({
      action: 'MODEL_SYNC',
      actorUserId: principal.userId,
      providerCode: 'LOCAL',
      modelCode: null,
      reason: 'LOCAL_ADAPTER_SYNC',
      occurredAt: this.now(),
    });
    return synced;
  }

  public setSystemCredentialReference(input: {
    readonly principal: AuthenticatedPrincipal;
    readonly providerCode: Exclude<AiGatewayProviderCode, 'LOCAL'>;
    readonly secretReference: string;
    readonly reason: string;
  }): { readonly providerCode: Exclude<AiGatewayProviderCode, 'LOCAL'>; readonly status: 'CONFIGURED' } {
    this.authorizer.assert(input.principal, aiGatewayAdminCapability);
    this.systemCredentialReferences.set({
      providerCode: input.providerCode,
      secretReference: input.secretReference,
    });
    this.audit.append({
      action: 'SYSTEM_CREDENTIAL_CHANGED',
      actorUserId: input.principal.userId,
      providerCode: input.providerCode,
      modelCode: null,
      reason: normalizedReason(input.reason),
      occurredAt: this.now(),
    });
    // Never return `secretReference`: it is an internal managed-secret
    // locator, not consumer/Admin display metadata.
    return { providerCode: input.providerCode, status: 'CONFIGURED' };
  }

  public readSystemCredentialStatus(input: {
    readonly principal: AuthenticatedPrincipal;
    readonly providerCode: Exclude<AiGatewayProviderCode, 'LOCAL'>;
  }): { readonly providerCode: Exclude<AiGatewayProviderCode, 'LOCAL'>; readonly status: 'CONFIGURED' | 'NOT_CONFIGURED' } {
    this.authorizer.assert(input.principal, aiGatewayAdminCapability);
    const status = this.systemCredentialReferences.status({ providerCode: input.providerCode });
    this.audit.append({
      action: 'SYSTEM_CREDENTIAL_STATUS_READ',
      actorUserId: input.principal.userId,
      providerCode: input.providerCode,
      modelCode: null,
      reason: null,
      occurredAt: this.now(),
    });
    return { providerCode: input.providerCode, status };
  }

  public readProviderHealth(
    principal: AuthenticatedPrincipal,
    providerCode: AiGatewayProviderCode,
  ): ReturnType<AiGatewayService['adminProviderHealth']> {
    this.authorizer.assert(principal, aiGatewayAdminCapability);
    const health = this.gateway.adminProviderHealth(providerCode);
    this.audit.append({
      action: 'PROVIDER_HEALTH_READ',
      actorUserId: principal.userId,
      providerCode,
      modelCode: null,
      reason: null,
      occurredAt: this.now(),
    });
    return health;
  }
}

export interface AdminAiGatewayApiRequest {
  readonly method: 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE';
  readonly path: string;
  readonly principal?: AuthenticatedPrincipal;
  readonly body?: unknown;
}

export interface AdminAiGatewayApiResponse {
  readonly status: number;
  readonly body:
    | { readonly data: unknown }
    | {
        readonly error: {
          readonly code: string;
          readonly message: string;
          readonly retryable: boolean;
        };
      };
}

function adminPrincipal(request: AdminAiGatewayApiRequest): AuthenticatedPrincipal {
  if (request.principal === undefined) {
    throw new AiGatewayError('FORBIDDEN', 'AI Gateway administration is not available.');
  }
  return request.principal;
}

function parsed<T>(value: { readonly success: boolean; readonly data?: T }): T {
  if (!value.success || value.data === undefined) {
    throw new AiGatewayError('VALIDATION', 'AI Gateway admin input is invalid.');
  }
  return value.data;
}

/** Narrow separately composed Admin API. It refuses consumer paths and returns
 * only registry/health metadata, never a provider credential reference,
 * ciphertext, plaintext, user credential ownership, or raw provider error. */
export class AdminAiGatewayApiAdapter {
  public constructor(private readonly service: AdminAiGatewayService) {}

  public handle(request: AdminAiGatewayApiRequest): AdminAiGatewayApiResponse {
    try {
      return { status: 200, body: { data: this.route(request) } };
    } catch (error) {
      const status = error instanceof AiGatewayError && error.code === 'NOT_FOUND' ? 404 :
        error instanceof AiGatewayError && error.code === 'VALIDATION' ? 400 : 403;
      return {
        status,
        body: {
          error: {
            code: error instanceof AiGatewayError ? error.code : 'FORBIDDEN',
            message: 'AI Gateway administration is not available.',
            retryable: false,
          },
        },
      };
    }
  }

  private route(request: AdminAiGatewayApiRequest): unknown {
    const principal = adminPrincipal(request);
    if (request.path === '/v1/admin/ai-gateway/providers' && request.method === 'GET') {
      return this.service.listProviders(principal);
    }
    if (request.path === '/v1/admin/ai-gateway/providers/LOCAL/sync-models' && request.method === 'POST') {
      return this.service.syncLocalModels(principal);
    }
    const health = /^\/v1\/admin\/ai-gateway\/providers\/([^/]+)\/health$/u.exec(request.path);
    if (health !== null && request.method === 'GET') {
      return this.service.readProviderHealth(
        principal,
        parsed(aiGatewayProviderCodeSchema.safeParse(decodeURIComponent(health[1]!))),
      );
    }
    const provider = /^\/v1\/admin\/ai-gateway\/providers\/([^/]+)\/status$/u.exec(request.path);
    if (provider !== null && request.method === 'POST') {
      const body = parsed(aiGatewayAdminRegistryUpdateSchema.safeParse(request.body ?? {}));
      return this.service.setProviderStatus({
        principal,
        providerCode: parsed(aiGatewayProviderCodeSchema.safeParse(decodeURIComponent(provider[1]!))),
        status: body.status,
        reason: body.reason,
      });
    }
    const credential = /^\/v1\/admin\/ai-gateway\/providers\/([^/]+)\/system-credential-reference$/u.exec(request.path);
    if (credential !== null && request.method === 'POST') {
      const body = parsed(aiGatewayAdminSystemCredentialReferenceSchema.safeParse(request.body ?? {}));
      const providerCode = parsed(aiGatewayProviderCodeSchema.safeParse(decodeURIComponent(credential[1]!)));
      if (providerCode === 'LOCAL') throw new AiGatewayError('VALIDATION', 'Local adapter has no system credential.');
      return this.service.setSystemCredentialReference({
        principal,
        providerCode,
        secretReference: body.secretReference,
        reason: body.reason,
      });
    }
    const credentialStatus = /^\/v1\/admin\/ai-gateway\/providers\/([^/]+)\/system-credential-status$/u.exec(request.path);
    if (credentialStatus !== null && request.method === 'GET') {
      const providerCode = parsed(aiGatewayProviderCodeSchema.safeParse(decodeURIComponent(credentialStatus[1]!)));
      if (providerCode === 'LOCAL') throw new AiGatewayError('VALIDATION', 'Local adapter has no system credential.');
      return this.service.readSystemCredentialStatus({ principal, providerCode });
    }
    const model = /^\/v1\/admin\/ai-gateway\/models\/([^/]+)\/status$/u.exec(request.path);
    if (model !== null && request.method === 'POST') {
      const body = parsed(aiGatewayAdminRegistryUpdateSchema.safeParse(request.body ?? {}));
      return this.service.setModelStatus({
        principal,
        modelCode: parsed(aiGatewayModelCodeSchema.safeParse(decodeURIComponent(model[1]!))),
        status: body.status,
        reason: body.reason,
      });
    }
    throw new AiGatewayError('NOT_FOUND', 'AI Gateway admin route was not found.');
  }
}
