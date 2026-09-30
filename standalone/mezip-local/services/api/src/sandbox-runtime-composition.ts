import type { AuthenticatedPrincipal, CapabilityCode } from '@me-zip/shared-types';
import {
  SandboxRuntimeService,
  SANDBOX_CAPABILITY,
  type SandboxAuditSink,
  type SandboxPreviewGateway,
  type SandboxProjectReader,
  type SandboxRuntimeProvider,
  type SandboxUsageGuard,
} from '@me-zip/sandbox-runtime';
import type { MembershipService } from '@me-zip/payment';

export interface MembershipBoundSandboxRuntimeOptions {
  readonly membership: MembershipService;
  readonly projectReader: SandboxProjectReader;
  readonly provider?: SandboxRuntimeProvider;
  readonly audit?: SandboxAuditSink;
  readonly previewGateway?: SandboxPreviewGateway;
  readonly usageGuard?: SandboxUsageGuard;
  readonly deploymentMode?: 'LOCAL' | 'PRODUCTION';
}

export function createMembershipBoundSandboxRuntimeService(
  options: MembershipBoundSandboxRuntimeOptions,
): SandboxRuntimeService {
  const production = options.deploymentMode === 'PRODUCTION';
  if (production && !options.membership.isDurableRepositoryConfigured())
    throw new Error(
      'Sandbox production composition requires a durable Membership repository.',
    );
  if (
    production &&
    (options.provider === undefined || options.provider.code === 'MOCK')
  )
    throw new Error('Sandbox production composition requires a reviewed provider.');
  if (
    production &&
    (options.previewGateway === undefined || options.previewGateway.code === 'MOCK')
  )
    throw new Error(
      'Sandbox production composition requires an isolated preview gateway.',
    );
  const entitlementResolver = {
    has(principal: AuthenticatedPrincipal, capability: CapabilityCode): boolean {
      return (
        capability === SANDBOX_CAPABILITY &&
        options.membership.hasActualUser(principal.userId, capability)
      );
    },
  };
  return new SandboxRuntimeService({
    projectReader: options.projectReader,
    entitlementResolver,
    ...(options.provider === undefined ? {} : { provider: options.provider }),
    ...(options.audit === undefined ? {} : { audit: options.audit }),
    ...(options.previewGateway === undefined
      ? {}
      : { previewGateway: options.previewGateway }),
    ...(options.usageGuard === undefined ? {} : { usageGuard: options.usageGuard }),
  });
}
