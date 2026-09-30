import type { AuthenticatedPrincipal, CapabilityCode } from '@me-zip/shared-types';
import { CreatorLabEcosystemProjectGateway, CreatorEcosystemService, type CreatorEcosystemServiceOptions } from '@me-zip/creator-ecosystem';
import { CreatorEcosystemApiAdapter } from '@me-zip/creator-ecosystem/api';
import type { CreatorLabService } from '@me-zip/creator-lab';
import type { MembershipService } from '@me-zip/payment';

export interface MembershipBoundCreatorEcosystemOptions {
  readonly membership: MembershipService;
  readonly creatorLab: CreatorLabService;
  readonly ecosystem?: Omit<CreatorEcosystemServiceOptions, 'projects' | 'entitlements'>;
}

/** Production composition keeps Phase 20 attached to the existing Creator
 * Lab project source of truth and actual (not simulated) Membership grants. */
export function createMembershipBoundCreatorEcosystemService(options: MembershipBoundCreatorEcosystemOptions): CreatorEcosystemService {
  if (!options.membership.isDurableRepositoryConfigured()) throw new Error('Creator ecosystem production composition requires a durable Membership repository.');
  return new CreatorEcosystemService({
    ...options.ecosystem,
    projects: new CreatorLabEcosystemProjectGateway(options.creatorLab),
    entitlements: {
      has: (principal: AuthenticatedPrincipal, capability: CapabilityCode) => options.membership.hasActualUser(principal.userId, capability),
    },
  });
}

export function createMembershipBoundCreatorEcosystemApiAdapter(options: MembershipBoundCreatorEcosystemOptions): CreatorEcosystemApiAdapter {
  return new CreatorEcosystemApiAdapter(createMembershipBoundCreatorEcosystemService(options));
}
