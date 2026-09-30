import { describe, expect, it, vi } from 'vitest';

import {
  createMembershipBoundAiGatewayService,
  createMembershipAiGatewayEntitlementResolver,
  defaultAiGatewayMembershipEntitlementMap,
} from './ai-gateway-composition.js';

describe('AI Gateway membership composition', () => {
  it('uses only actual server membership capabilities and fails closed for an unmapped tool grant', () => {
    const membership = {
      hasActualUser: vi.fn((userId: string, capability: string) =>
        userId === 'owner-a' && capability === 'CREATOR_LAB_ACCESS'),
    };
    const resolver = createMembershipAiGatewayEntitlementResolver(membership);
    const principal = { userId: 'owner-a', sessionId: 'session-a', roles: [], issuedAt: '2026-08-18T00:00:00.000Z' };

    expect(resolver.has(principal, 'AI_LAB_ACCESS')).toBe(true);
    expect(resolver.has(principal, 'AI_LAB_TOOL_USE')).toBe(false);
    expect(resolver.has({ ...principal, userId: 'owner-b' }, 'AI_LAB_ACCESS')).toBe(false);
    expect(membership.hasActualUser).toHaveBeenCalledWith('owner-a', defaultAiGatewayMembershipEntitlementMap.AI_LAB_ACCESS);
  });

  it('requires a durable membership composition and never falls back to a presentation simulator', () => {
    const simulatedOnly = {
      isDurableRepositoryConfigured: () => false,
      hasActualUser: () => true,
    };
    expect(() => createMembershipBoundAiGatewayService({ membership: simulatedOnly as never })).toThrow(
      'durable Membership repository',
    );

    const durableActual = {
      isDurableRepositoryConfigured: () => true,
      hasActualUser: (userId: string, capability: string) =>
        userId === 'owner-a' && capability === 'CREATOR_LAB_ACCESS',
    };
    const gateway = createMembershipBoundAiGatewayService({ membership: durableActual as never });
    const alice = { userId: 'owner-a', sessionId: 'session-a', roles: [], issuedAt: '2026-08-18T00:00:00.000Z' };
    const bob = { ...alice, userId: 'owner-b' };
    expect(gateway.createInvocation(alice, {
      modelCode: 'LOCAL_ECHO_V1', capabilityCode: 'CHAT_COMPLETION',
      messages: [{ role: 'USER', content: '仅测试实际服务器权益。' }], stream: false,
    }, 'durable-gateway-01')).toMatchObject({ status: 'SUCCEEDED' });
    expect(() => gateway.createInvocation(bob, {
      modelCode: 'LOCAL_ECHO_V1', capabilityCode: 'CHAT_COMPLETION',
      messages: [{ role: 'USER', content: '不应由模拟权益放行。' }], stream: false,
    }, 'durable-gateway-02')).toThrow('entitlement');
  });
});
