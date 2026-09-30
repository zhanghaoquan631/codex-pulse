import type { AuthenticatedPrincipal, CapabilityCode } from '@me-zip/shared-types';
import {
  DeploymentService,
  type DeploymentProjectResolver,
  type DeploymentServiceOptions,
  type DeploymentSourceResolver,
  type DeploymentProvider,
} from '@me-zip/deployment';
import { DeploymentApiAdapter } from '@me-zip/deployment/api';
import type { MembershipService } from '@me-zip/payment';

export interface MembershipBoundDeploymentOptions {
  readonly membership: MembershipService;
  readonly projectResolver: DeploymentProjectResolver;
  readonly provider: DeploymentProvider;
  readonly sourceResolver?: DeploymentSourceResolver;
  readonly deployment?: Omit<DeploymentServiceOptions, 'entitlementResolver' | 'projectResolver' | 'provider' | 'sourceResolver'>;
}

/**
 * Production composition is deliberately strict: the provider, source owner
 * resolver, and durable Membership authorizer must be supplied by the host.
 * The deployment package's MockStaticDeploymentProvider remains a local/test
 * seam and is never selected by this factory.
 */
export function createMembershipBoundDeploymentService(options: MembershipBoundDeploymentOptions): DeploymentService {
  if (!options.membership.isDurableRepositoryConfigured()) throw new Error('Deployment production composition requires a durable Membership repository.');
  if (options.sourceResolver === undefined) throw new Error('Deployment production composition requires an owner-scoped source resolver.');
  if (options.deployment?.usageGuard === undefined) throw new Error('Deployment production composition requires a quota and usage guard.');
  if (options.deployment?.audit === undefined) throw new Error('Deployment production composition requires an audit sink.');
  const entitlementResolver = {
    has: async (principal: AuthenticatedPrincipal, capability: string) => options.membership.hasActualUser(principal.userId, capability as CapabilityCode),
  };
  return new DeploymentService({
    ...options.deployment,
    entitlementResolver,
    projectResolver: options.projectResolver,
    provider: options.provider,
    ...(options.sourceResolver === undefined ? {} : { sourceResolver: options.sourceResolver }),
  });
}

export function createMembershipBoundDeploymentApiAdapter(options: MembershipBoundDeploymentOptions): DeploymentApiAdapter {
  return new DeploymentApiAdapter(createMembershipBoundDeploymentService(options));
}
