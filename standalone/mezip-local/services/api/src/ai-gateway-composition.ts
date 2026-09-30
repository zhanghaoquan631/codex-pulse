import type {
  AiGatewayAccessEntitlementCode,
  AuthenticatedPrincipal,
  CapabilityCode,
} from '@me-zip/shared-types';
import {
  AiGatewayService,
  type AiGatewayEntitlementResolver,
  type AiGatewayServiceOptions,
} from '@me-zip/ai-gateway';
import type { MembershipService } from '@me-zip/payment';

/**
 * Server-owned mapping between the AI Gateway's capability-neutral access
 * vocabulary and the existing durable Membership capability vocabulary.  This
 * mapping is deliberately composed on the server: no client request carries a
 * plan, entitlement, feature flag, or override.
 *
 * The local development adapter is still available through its explicit local
 * composition.  A deployed AI Gateway must use this (or an equally strict)
 * actual-membership resolver instead of the development resolver.
 */
export type AiGatewayMembershipEntitlementMap = Readonly<
  Partial<Record<AiGatewayAccessEntitlementCode, CapabilityCode>>
>;

/**
 * Phase 8 does not change the commercial catalog.  Its default production
 * bridge maps the new AI gateway permissions to the already server-owned
 * Creator Lab capability.  Operators may supply a narrower map while keeping
 * the same actual-membership-only boundary.
 */
export const defaultAiGatewayMembershipEntitlementMap: AiGatewayMembershipEntitlementMap = Object.freeze({
  AI_LAB_ACCESS: 'CREATOR_LAB_ACCESS',
  AI_STANDARD_MODELS: 'CREATOR_LAB_ACCESS',
  AI_ADVANCED_MODELS: 'CREATOR_LAB_ACCESS',
  AI_VISION: 'CREATOR_LAB_ACCESS',
  AI_IMAGE_GENERATION: 'CREATOR_LAB_ACCESS',
  AI_AUDIO_INPUT: 'CREATOR_LAB_ACCESS',
  AI_AUDIO_OUTPUT: 'CREATOR_LAB_ACCESS',
  AI_CODE: 'VIBE_CODING_ACCESS',
  AI_REASONING: 'CREATOR_LAB_ACCESS',
  AI_LAB_BYOK: 'CREATOR_LAB_ACCESS',
  // Tool execution remains disabled in Phase 8 even if a later entitlement is
  // granted.  Keeping this unmapped is a second fail-closed guard.
  AI_HIGHER_USAGE: 'ADVANCED_ANALYTICS',
});

/** Minimal structural read surface, useful for a production membership
 * repository and for narrowly scoped tests.  `hasActualUser` is critical: it
 * ignores the Admin-only presentation simulator. */
export interface ActualMembershipEntitlementReader {
  hasActualUser(userId: string, capability: CapabilityCode): boolean;
}

export function createMembershipAiGatewayEntitlementResolver(
  membership: ActualMembershipEntitlementReader,
  entitlementMap: AiGatewayMembershipEntitlementMap = defaultAiGatewayMembershipEntitlementMap,
): AiGatewayEntitlementResolver {
  return Object.freeze({
    has(principal: AuthenticatedPrincipal, entitlement: AiGatewayAccessEntitlementCode): boolean {
      const capability = entitlementMap[entitlement];
      return capability !== undefined && membership.hasActualUser(principal.userId, capability);
    },
  });
}

export interface MembershipBoundAiGatewayOptions {
  readonly membership: MembershipService;
  readonly gateway?: Omit<AiGatewayServiceOptions, 'entitlementResolver'>;
  readonly entitlementMap?: AiGatewayMembershipEntitlementMap;
}

/**
 * Supported production composition for AI Gateway.  A non-durable Membership
 * service is rejected here, preventing a payment preview, local fixture, or
 * Admin simulation from unlocking Gateway use in a deployed service graph.
 */
export function createMembershipBoundAiGatewayService(
  options: MembershipBoundAiGatewayOptions,
): AiGatewayService {
  if (!options.membership.isDurableRepositoryConfigured()) {
    throw new Error('AI Gateway production composition requires a durable Membership repository.');
  }
  return new AiGatewayService({
    ...options.gateway,
    entitlementResolver: createMembershipAiGatewayEntitlementResolver(
      options.membership,
      options.entitlementMap,
    ),
  });
}
