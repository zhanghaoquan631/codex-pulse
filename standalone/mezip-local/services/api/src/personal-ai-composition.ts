import type {
  AuthenticatedPrincipal,
  CapabilityCode,
  PersonalAIAccessEntitlementCode,
} from '@me-zip/shared-types';
import {
  DurablePersonalAIIndexApiAdapter,
  DurablePersonalAIIndexService,
  DurablePersonalAIStateApiAdapter,
  PersonalAIService,
  type PersonalAIArchiveReader,
  type PersonalAIEmbeddingProvider,
  type PersonalAIEntitlementResolver,
  type PersonalAIGenerationGateway,
  type PersonalAIAsyncIndexingDependencies,
  type PersonalAIServiceOptions,
  type PersonalAIUsageReader,
  type PersonalAIVectorSearchProvider,
  type DurablePersonalAIIndexRepository,
  type PersonalAITrustedPrincipalResolver,
  type DurablePersonalAIStateApiOptions,
} from '@me-zip/personal-ai';
import type { MembershipService } from '@me-zip/payment';

export type PersonalAIMembershipEntitlementMap = Readonly<Partial<Record<PersonalAIAccessEntitlementCode, CapabilityCode>>>;

export const defaultPersonalAIMembershipEntitlementMap: PersonalAIMembershipEntitlementMap = Object.freeze({
  PERSONAL_AI_ACCESS: 'CREATOR_LAB_ACCESS',
  PERSONAL_AI_SEMANTIC_SEARCH: 'CREATOR_LAB_ACCESS',
  PERSONAL_AI_EXTENDED_HISTORY: 'CREATOR_LAB_ACCESS',
  PERSONAL_AI_ADVANCED_REVIEW: 'ADVANCED_ANALYTICS',
});

export interface ActualPersonalAIMembershipReader {
  hasActualUser(userId: string, capability: CapabilityCode): boolean;
}

export function createMembershipPersonalAIEntitlementResolver(
  membership: ActualPersonalAIMembershipReader,
  entitlementMap: PersonalAIMembershipEntitlementMap = defaultPersonalAIMembershipEntitlementMap,
): PersonalAIEntitlementResolver {
  return Object.freeze({
    has(principal: AuthenticatedPrincipal, entitlement: PersonalAIAccessEntitlementCode): boolean {
      const capability = entitlementMap[entitlement];
      return capability !== undefined && membership.hasActualUser(principal.userId, capability);
    },
  });
}

export interface MembershipBoundPersonalAIOptions {
  readonly membership: MembershipService;
  /** Production must provide real owner-scoped readers and a Phase 8-backed
   * generation gateway; an empty/in-memory fallback is not accepted here. */
  readonly personalAI: Omit<PersonalAIServiceOptions, 'entitlementResolver' | 'deploymentMode'> & {
    readonly archiveReader: PersonalAIArchiveReader;
    readonly usageReader: PersonalAIUsageReader;
    readonly embeddingProvider: PersonalAIEmbeddingProvider;
    readonly vectorProvider: PersonalAIVectorSearchProvider;
    readonly generationGateway: PersonalAIGenerationGateway;
    readonly asyncIndexing: PersonalAIAsyncIndexingDependencies;
  };
  readonly entitlementMap?: PersonalAIMembershipEntitlementMap;
}

/** Production composition guard. It rejects in-memory membership fixtures and
 * uses only `hasActualUser`, which ignores Admin presentation simulations. */
export function createMembershipBoundPersonalAIService(options: MembershipBoundPersonalAIOptions): PersonalAIService {
  if (!options.membership.isDurableRepositoryConfigured()) throw new Error('Personal AI production composition requires a durable Membership repository.');
  if (options.personalAI.archiveReader === undefined || options.personalAI.usageReader === undefined || options.personalAI.generationGateway === undefined || options.personalAI.embeddingProvider === undefined || options.personalAI.vectorProvider === undefined) {
    throw new Error('Personal AI production composition requires owner-scoped readers, production vector providers, and a Phase 8 generation gateway.');
  }
  if (options.personalAI.embeddingProvider.productionSafe !== true || options.personalAI.vectorProvider.productionSafe !== true || options.personalAI.generationGateway.phase8Gateway !== true) {
    throw new Error('Personal AI production composition rejects local deterministic/in-memory providers; inject reviewed production adapters.');
  }
  return new PersonalAIService({
    ...options.personalAI,
    autoProcessIndexJobs: false,
    deploymentMode: 'PRODUCTION',
    entitlementResolver: createMembershipPersonalAIEntitlementResolver(options.membership, options.entitlementMap),
  });
}

/**
 * Production composition for the durable enqueue/status boundary only.  The
 * legacy PersonalAIService factory above intentionally remains fail-closed
 * until its complete query/preferences/insight state is migrated off maps.
 * This smaller factory is safe to expose now because it requires the reviewed
 * transactional repository and never performs archive reads or embedding in
 * the request path.
 */
export interface MembershipBoundDurablePersonalAIIndexOptions {
  readonly membership: MembershipService;
  readonly repository: DurablePersonalAIIndexRepository;
  readonly trustedPrincipalResolver: PersonalAITrustedPrincipalResolver;
  readonly indexVersion: string;
  readonly embeddingProviderName?: string | undefined;
  readonly entitlementMap?: PersonalAIMembershipEntitlementMap;
}

export function createMembershipBoundDurablePersonalAIIndexService(
  options: MembershipBoundDurablePersonalAIIndexOptions,
): DurablePersonalAIIndexService {
  if (!options.membership.isDurableRepositoryConfigured()) {
    throw new Error('Personal AI durable index composition requires a durable Membership repository.');
  }
  return new DurablePersonalAIIndexService({
    repository: options.repository,
    trustedPrincipalResolver: options.trustedPrincipalResolver,
    entitlementResolver: createMembershipPersonalAIEntitlementResolver(options.membership, options.entitlementMap),
    indexVersion: options.indexVersion,
    embeddingProviderName: options.embeddingProviderName,
  });
}

/** Explicit host wiring for the durable index-only routes.  The regular
 * PersonalAIApiAdapter remains a local/fail-closed adapter until the rest of
 * Personal AI state (queries, consent, exports, insights) is durable too. */
export function createMembershipBoundDurablePersonalAIIndexApiAdapter(
  options: MembershipBoundDurablePersonalAIIndexOptions,
): DurablePersonalAIIndexApiAdapter {
  return new DurablePersonalAIIndexApiAdapter(createMembershipBoundDurablePersonalAIIndexService(options));
}

export interface MembershipBoundDurablePersonalAIStateOptions extends Omit<DurablePersonalAIStateApiOptions, 'repository'> {
  readonly membership: MembershipService;
  readonly repository: DurablePersonalAIStateApiOptions['repository'];
}

/** Mounts only the repository-backed preferences/consent/privacy boundary.
 * Query, insight, export and clear routes remain explicit NOT_CONFIGURED until
 * their own durable transaction contracts are wired. */
export function createMembershipBoundDurablePersonalAIStateApiAdapter(
  options: MembershipBoundDurablePersonalAIStateOptions,
): DurablePersonalAIStateApiAdapter {
  if (!options.membership.isDurableRepositoryConfigured()) {
    throw new Error('Personal AI durable state composition requires a durable Membership repository.');
  }
  const stateOptions: DurablePersonalAIStateApiOptions = {
    repository: options.repository,
    trustedPrincipalResolver: options.trustedPrincipalResolver,
    ...(options.providerDisclosure === undefined ? {} : { providerDisclosure: options.providerDisclosure }),
    ...(options.now === undefined ? {} : { now: options.now }),
  };
  return new DurablePersonalAIStateApiAdapter(stateOptions);
}
