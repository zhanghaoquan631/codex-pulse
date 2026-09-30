import {
  CommunityService,
  type CommunityServiceOptions,
} from '@me-zip/community';
import {
  MessagingService,
  type MessagingServiceOptions,
} from '@me-zip/messaging';
import {
  createCommunityEntitlementResolver,
  createMessagingEntitlementResolver,
  type MembershipService,
} from '@me-zip/payment';

/**
 * The only supported Phase 6 server composition for new Community/Messaging
 * instances. It binds existing authorization seams to the server-owned
 * MembershipService, so a successful verified payment is immediately used by
 * Community and Founder Inbox checks. It deliberately overrides any supplied
 * in-memory entitlement resolver.
 */
export interface MembershipBoundServiceGraphOptions {
  readonly membership: MembershipService;
  readonly messaging?: Omit<MessagingServiceOptions, 'entitlementResolver'>;
  readonly community?: Omit<CommunityServiceOptions, 'entitlements'>;
}

export interface MembershipBoundServiceGraph {
  readonly membership: MembershipService;
  readonly messaging: MessagingService;
  readonly community: CommunityService;
}

export function createMembershipBoundServiceGraph(
  options: MembershipBoundServiceGraphOptions,
): MembershipBoundServiceGraph {
  const membership = options.membership;
  if (!membership.isDurableRepositoryConfigured()) {
    throw new Error('Phase 6 server composition requires a durable Membership repository.');
  }
  return Object.freeze({
    membership,
    messaging: new MessagingService({
      ...options.messaging,
      entitlementResolver: createMessagingEntitlementResolver(membership),
    }),
    community: new CommunityService({
      ...options.community,
      entitlements: createCommunityEntitlementResolver(membership),
    }),
  });
}
