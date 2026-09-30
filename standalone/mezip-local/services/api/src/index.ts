import type { AuthenticatedPrincipal } from '@me-zip/shared-types';

export {
  createProductionHttpPolicy,
  createProductionRuntime,
  recordRequestMetrics,
  redactOperationalMetadata,
  writeOperationalEvent,
  type MetricsSink,
  type OperationalEvent,
  type OperationalLogger,
  type ProductionDependency,
  type ProductionHttpPolicy,
  type ProductionReadiness,
  type ProductionRuntime,
} from './production-runtime.js';

export {
  createPrivateStorageAccessPlan,
  createProductionJobPolicy,
  createProductionRateLimitPolicy,
  type PrivateStorageAccessPlan,
  type ProductionJobFailure,
  type ProductionJobPolicy,
  type ProductionRateLimitPolicy,
} from './production-operations.js';

/** Phase 25 release controls stay server-authorized; the SDK/UI only sees its own enrollment, flags and safe feedback state. */
export {
  ReleaseManagementApiAdapter,
  type ReleaseManagementApiRequest,
  type ReleaseManagementApiResponse,
} from '@me-zip/release-management/api';
export {
  createReleaseManagementService,
  ReleaseManagementError,
  releaseChannels,
  type FeatureFlag,
  type FeedbackRecord,
  type ReleaseBuild,
  type ReleaseChannel,
  type TesterEnrollment,
} from '@me-zip/release-management';

/** Phase 14 portable archive routes. The host must compose a durable data
 * source/storage adapter in production; the exported local service is only a
 * development foundation and remains fail-closed for absent dependencies. */
export {
  PortableArchiveApiAdapter,
  PortableArchiveError,
  PortableArchiveService,
  InMemoryPortableArchiveTarget,
  createPortableArchiveDataSource,
  type PortableArchiveApiRequest,
  type PortableArchiveApiResponse,
  type PortableArchiveDataSource,
  type PortableArchiveRestoreTarget,
} from '@me-zip/archive';

/** Messaging owns its transport-neutral route adapters; re-export them from
 * the API composition package without widening the consumer admin boundary. */
export {
  AdminMessagingRouteAdapter,
  MessagingApiAdapter,
  type AdminMessagingApiRequest,
  type MessagingApiRequest,
  type MessagingApiResponse,
} from '@me-zip/messaging';

/** Membership and payment route adapters stay server-side. Consumer SDKs use
 * their typed transport facade and cannot call provider callbacks or Admin APIs. */
export {
  MembershipApiAdapter,
  type MembershipApiRequest,
  type MembershipApiResponse,
} from '@me-zip/payment';

/** AI Usage consumer/device and separately authenticated Root adapters. The
 * consumer adapter has no route to the audited Root reader. */
export {
  AdminAiUsageReader,
  AdminAiUsageRouteAdapter,
  AiUsageApiAdapter,
  AiUsageService,
  type AdminAiUsageApiRequest,
  type AiUsageApiRequest,
  type AiUsageApiResponse,
  type AiUsageAuditSink,
  type AiUsageRootAuthorizer,
} from '@me-zip/analytics';

/** The consumer AI Gateway adapter has only self-scoped registry, invocation,
 * event, quota, conversation metadata and encrypted-envelope routes. Root
 * provider maintenance is deliberately a separately composed admin service. */
export {
  AiGatewayApiAdapter,
  AiGatewayService,
  AdminAiGatewayService,
  AdminAiGatewayApiAdapter,
  type AiGatewayApiRequest,
  type AiGatewayApiResponse,
  type AiGatewayAdminAuthorizer,
  type AiGatewayAdminAuditSink,
  type AdminAiGatewayApiRequest,
  type AdminAiGatewayApiResponse,
} from '@me-zip/ai-gateway';

export {
  createMembershipBoundPersonalAIService,
  createMembershipBoundDurablePersonalAIIndexApiAdapter,
  createMembershipBoundDurablePersonalAIIndexService,
  createMembershipBoundDurablePersonalAIStateApiAdapter,
  createMembershipPersonalAIEntitlementResolver,
  defaultPersonalAIMembershipEntitlementMap,
  type ActualPersonalAIMembershipReader,
  type MembershipBoundDurablePersonalAIIndexOptions,
  type MembershipBoundDurablePersonalAIStateOptions,
  type MembershipBoundPersonalAIOptions,
  type PersonalAIMembershipEntitlementMap,
} from './personal-ai-composition.js';

export {
  createMembershipBoundCreatorLabApiAdapter,
  createMembershipBoundCreatorLabService,
  type ActualCreatorMembershipReader,
  type MembershipBoundCreatorLabOptions,
} from './creator-lab-composition.js';

export {
  createMembershipBoundCreatorEcosystemApiAdapter,
  createMembershipBoundCreatorEcosystemService,
  type MembershipBoundCreatorEcosystemOptions,
} from './creator-ecosystem-composition.js';
export {
  CreatorEcosystemError,
  CreatorEcosystemService,
  CreatorLabEcosystemProjectGateway,
} from '@me-zip/creator-ecosystem';
export {
  CreatorEcosystemApiAdapter,
  type CreatorEcosystemApiRequest,
  type CreatorEcosystemApiResponse,
} from '@me-zip/creator-ecosystem/api';

export { CreatorLabError, CreatorLabService } from '@me-zip/creator-lab';
export {
  CreatorLabApiAdapter,
  type CreatorLabApiRequest,
  type CreatorLabApiResponse,
} from '@me-zip/creator-lab/api';

/** Personal AI route adapter. The composition factory below remains the
 * production entry point; this export keeps the transport adapter available
 * to the API host without exposing any owner/root fields to consumers. */
export {
  PersonalAIApiAdapter,
  DurablePersonalAIIndexApiAdapter,
  type PersonalAIApiRequest,
  type PersonalAIApiResponse,
  type DurablePersonalAIIndexApiRequest,
  type DurablePersonalAIIndexApiResponse,
} from '@me-zip/personal-ai';

export {
  createMembershipBoundServiceGraph,
  type MembershipBoundServiceGraph,
  type MembershipBoundServiceGraphOptions,
} from './membership-composition.js';

/** Phase 8's deployed Gateway composition is separate from the local adapter
 * and binds every Gateway entitlement decision to actual durable Membership
 * state. */
export {
  createMembershipAiGatewayEntitlementResolver,
  createMembershipBoundAiGatewayService,
  defaultAiGatewayMembershipEntitlementMap,
  type ActualMembershipEntitlementReader,
  type AiGatewayMembershipEntitlementMap,
  type MembershipBoundAiGatewayOptions,
} from './ai-gateway-composition.js';

export {
  createMembershipBoundSandboxRuntimeService,
  type MembershipBoundSandboxRuntimeOptions,
} from './sandbox-runtime-composition.js';
export {
  SandboxRuntimeApiAdapter,
  MockSandboxProvider,
  SandboxRuntimeError,
  type SandboxRuntimeApiRequest,
  type SandboxRuntimeApiResponse,
} from '@me-zip/sandbox-runtime/api';

export {
  createMembershipBoundDeploymentService,
  createMembershipBoundDeploymentApiAdapter,
  type MembershipBoundDeploymentOptions,
} from './deployment-composition.js';
export {
  DeploymentService,
  DeploymentError,
  MockStaticDeploymentProvider,
} from '@me-zip/deployment';
export {
  DeploymentApiAdapter,
  type DeploymentApiRequest,
  type DeploymentApiResponse,
} from '@me-zip/deployment/api';

/** Phase 13 consumer social connector boundary. Provider credentials remain
 * inside the server-side connector/vault seam and are never part of this API. */
export {
  SocialConnectorApiAdapter,
  type SocialApiRequest,
  type SocialApiResponse,
} from '@me-zip/social-connectors/api';
export {
  SocialConnectorService,
  SocialConnectorError,
  createSocialConnectorService,
  MockSocialConnectorProvider,
  UnavailableSocialConnectorProvider,
  InMemorySocialPersistence,
  type SocialConnectorProvider,
  type SocialCredentialStore,
  type SocialEntitlementResolver,
  type SocialFounderDirectory,
  type SocialPersistence,
} from '@me-zip/social-connectors';
export {
  createXEnabledSocialConnectorService,
  type XSocialIntegrationConfiguration,
} from './x-social-composition.js';

/** Phase 19 public external identity boundary. Login identities, provider
 * credentials and Root metadata remain separate from this consumer surface. */
export {
  ExternalIdentityApiAdapter,
  type ExternalIdentityApiRequest,
  type ExternalIdentityApiResponse,
} from '@me-zip/external-identity/api';
export {
  ExternalIdentityService,
  ExternalIdentityError,
  InMemoryExternalIdentityCredentialVault,
  createExternalIdentityService,
  normalizeExternalHttpsUrl,
  type ExternalIdentityCredentialVault,
  type ExternalIdentityOAuthProvider,
} from '@me-zip/external-identity';

export class AuthorizationError extends Error {
  public constructor() {
    super('Resource is not available to this principal.');
    this.name = 'AuthorizationError';
  }
}

export interface OwnedResource {
  readonly id: string;
  readonly ownerId: string;
}

/**
 * A boundary helper, not a substitute for a scoped database query.
 * Production handlers must load `id` and `owner_id = principal.userId` in one query.
 */
export function requireOwnedResource<T extends OwnedResource>(
  principal: AuthenticatedPrincipal,
  resource: T | null,
): T {
  if (resource === null || resource.ownerId !== principal.userId) {
    throw new AuthorizationError();
  }
  return resource;
}

export function createRequestContext(
  principal: AuthenticatedPrincipal,
  requestId: string,
) {
  return Object.freeze({ principal, requestId });
}
