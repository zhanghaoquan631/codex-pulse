import type { AuthenticatedPrincipal, CapabilityCode } from '@me-zip/shared-types';
import { CreatorLabService, type CreatorLabServiceOptions } from '@me-zip/creator-lab';
// The adapter lives in the package's explicit API subpath; the service root
// remains the domain-only surface for consumers.
import { CreatorLabApiAdapter } from '@me-zip/creator-lab/api';
import type { MembershipService } from '@me-zip/payment';

export interface ActualCreatorMembershipReader {
  hasActualUser(userId: string, capability: CapabilityCode): boolean;
  isDurableRepositoryConfigured(): boolean;
}

export interface MembershipBoundCreatorLabOptions {
  readonly membership: MembershipService;
  readonly creatorLab?: Omit<CreatorLabServiceOptions, 'entitlementResolver'>;
}

export function createMembershipBoundCreatorLabService(options: MembershipBoundCreatorLabOptions): CreatorLabService {
  if (!options.membership.isDurableRepositoryConfigured()) throw new Error('Creator Lab production composition requires a durable Membership repository.');
  const entitlementResolver = {
    has: (principal: AuthenticatedPrincipal, capability: CapabilityCode) => options.membership.hasActualUser(principal.userId, capability),
  };
  return new CreatorLabService({ ...options.creatorLab, entitlementResolver });
}

export function createMembershipBoundCreatorLabApiAdapter(options: MembershipBoundCreatorLabOptions): CreatorLabApiAdapter {
  return new CreatorLabApiAdapter(createMembershipBoundCreatorLabService(options));
}
