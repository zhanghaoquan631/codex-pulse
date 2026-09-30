import { describe, expect, it } from 'vitest';
import type { AuthenticatedPrincipal } from '@me-zip/shared-types';
import {
  personalAIDurableStorageKind,
  type PersonalAIDurableRepository,
  type PersonalAITrustedPrincipalResolver,
} from '@me-zip/personal-ai';
import type { MembershipService } from '@me-zip/payment';

import {
  createMembershipBoundDurablePersonalAIIndexApiAdapter,
  createMembershipBoundDurablePersonalAIIndexService,
  createMembershipPersonalAIEntitlementResolver,
  defaultPersonalAIMembershipEntitlementMap,
} from './personal-ai-composition.js';

const principal: AuthenticatedPrincipal = { userId: 'alice', sessionId: 's', roles: [], issuedAt: '2026-08-18T00:00:00.000Z', membershipSimulation: { planCode: 'PRO_MAX', simulatedByAdminId: 'root', isSimulation: true } };

function durableRepository(): PersonalAIDurableRepository {
  const noop = async (): Promise<void> => undefined;
  return {
    productionSafe: true,
    storageKind: personalAIDurableStorageKind,
    loadOwnerState: async () => ({
      ownerId: 'alice', preferences: null,
      currentConsent: { accepted: false, version: null, acceptedAt: null, providerDisclosure: '' },
      consentEvents: [], sources: [], chunks: [], conversations: [], queries: [], citations: [], insights: [],
    }),
    writePreferences: noop,
    appendConsent: noop,
    enqueueIndexJob: async () => { throw new Error('not invoked'); },
    claimIndexJobs: async () => [],
    renewIndexJobLease: async () => null,
    persistIndexProjection: noop,
    completeIndexJob: noop,
    failIndexJob: noop,
    invalidateSource: noop,
    persistQuery: noop,
    persistInsight: noop,
    clearOwner: noop,
    claimIndexOutbox: async () => [],
    acknowledgeIndexOutbox: noop,
    releaseIndexOutbox: noop,
  };
}

const trustedPrincipalResolver: PersonalAITrustedPrincipalResolver = {
  productionSafe: true,
  resolveOwnerId: (candidate) => candidate.userId,
};

function membership(durable = true): MembershipService {
  return {
    isDurableRepositoryConfigured: () => durable,
    hasActualUser: () => true,
  } as unknown as MembershipService;
}

describe('Personal AI membership composition', () => {
  it('uses actual user entitlements and never the presentation simulation', () => {
    const calls: string[] = [];
    const resolver = createMembershipPersonalAIEntitlementResolver({
      hasActualUser(userId, capability) {
        calls.push(`${userId}:${capability}`);
        return userId === 'alice' && capability === 'CREATOR_LAB_ACCESS';
      },
    });
    expect(resolver.has(principal, 'PERSONAL_AI_ACCESS')).toBe(true);
    expect(resolver.has(principal, 'PERSONAL_AI_ADVANCED_REVIEW')).toBe(false);
    expect(calls).toEqual(['alice:CREATOR_LAB_ACCESS', 'alice:ADVANCED_ANALYTICS']);
    expect(defaultPersonalAIMembershipEntitlementMap.PERSONAL_AI_ACCESS).toBe('CREATOR_LAB_ACCESS');
  });

  it('exposes an explicit durable index composition without starting the map-backed service', () => {
    const options = {
      membership: membership(),
      repository: durableRepository(),
      trustedPrincipalResolver,
      indexVersion: 'personal-ai-v1',
    };
    expect(createMembershipBoundDurablePersonalAIIndexService(options)).toHaveProperty('createIndexJob');
    expect(createMembershipBoundDurablePersonalAIIndexApiAdapter(options)).toHaveProperty('handle');
    expect(() => createMembershipBoundDurablePersonalAIIndexService({ ...options, membership: membership(false) })).toThrow(/durable Membership/i);
  });
});
