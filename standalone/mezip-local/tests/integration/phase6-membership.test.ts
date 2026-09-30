import { describe, expect, it } from 'vitest';

import type { AuthenticatedPrincipal } from '@me-zip/shared-types';
import { membershipPriceFen } from '../../packages/shared-types/src/index.js';

import {
  FakePaymentProvider,
  InMemoryMembershipSimulationResolver,
  MembershipService,
  createCommunityEntitlementResolver,
  createMessagingEntitlementResolver,
  officialMembershipPlans,
} from '../../services/payment/src/index.js';
import {
  CommunityNotFoundError,
  CommunityService,
  type CommunityAdministrationAccess,
} from '../../services/community/src/index.js';
import {
  ArchiveAuthorizationError,
  InMemoryArchiveRepository,
} from '../../services/archive/src/index.js';
import {
  InMemoryMessagingFounderDirectory,
  MessagingAuthorizationError,
  MessagingService,
} from '../../services/messaging/src/index.js';

const now = '2026-08-18T12:00:00.000Z';

function principal(userId: string, adminIdentityId?: string): AuthenticatedPrincipal {
  return {
    userId,
    sessionId: `session-${userId}`,
    roles: ['USER'],
    issuedAt: now,
    ...(adminIdentityId === undefined ? {} : { adminIdentityId }),
  };
}

function idFactory(): () => string {
  let sequence = 0;
  return () => `00000000-0000-4000-8000-${String(++sequence).padStart(12, '0')}`;
}

function membershipWithFakeProvider(): {
  readonly membership: MembershipService;
  readonly provider: FakePaymentProvider;
} {
  const provider = new FakePaymentProvider({
    signingSecret: 'phase6-integration-fake-provider-secret',
    now: () => now,
  });
  return {
    membership: new MembershipService({
      providers: [provider],
      runtime: { now: () => now, id: idFactory() },
    }),
    provider,
  };
}

async function activateProMax(
  membership: MembershipService,
  provider: FakePaymentProvider,
  member: AuthenticatedPrincipal,
  idempotencyKey: string,
): Promise<void> {
  const checkout = await membership.createCheckout(member, {
    planCode: 'PRO_MAX',
    provider: 'MOCK',
    idempotencyKey,
  });
  await membership.receivePaymentCallback(
    'MOCK',
    provider.issueSuccessCallback({
      orderId: checkout.order.id,
      providerTransactionId: `tx-${idempotencyKey}`,
    }),
  );
}

const officialChannelAdmin: CommunityAdministrationAccess = {
  readPrivateGroup: () => {
    throw new Error('This test fixture permits official-channel management only.');
  },
  readReports: () => {
    throw new Error('This test fixture permits official-channel management only.');
  },
  manageOfficialChannel: () => {},
  moderate: <T>(_principal, _input, operation: () => T): T => operation(),
};

describe('Phase 6 membership/payment integration boundary', () => {
  it('uses the frozen CNY-fen catalogue and rejects client-forged price, owner, and payment-success fields', async () => {
    expect(membershipPriceFen).toEqual({
      FREE: 0,
      GO: 1_000,
      PLUS: 2_000,
      PRO: 4_000,
      PRO_MAX: 8_000,
    });
    expect(officialMembershipPlans.map((plan) => [plan.code, plan.amountFen, plan.currency])).toEqual([
      ['FREE', 0, 'CNY'],
      ['GO', 1_000, 'CNY'],
      ['PLUS', 2_000, 'CNY'],
      ['PRO', 4_000, 'CNY'],
      ['PRO_MAX', 8_000, 'CNY'],
    ]);

    const { membership } = membershipWithFakeProvider();
    const alice = principal('00000000-0000-4000-8000-000000000101');
    const bob = principal('00000000-0000-4000-8000-000000000102');

    // These attacker-controlled extras are deliberately not part of the
    // checkout contract. The service must use only the authenticated principal
    // and the server's frozen price catalogue.
    const forgedClientPayload = {
      planCode: 'PRO_MAX' as const,
      provider: 'MOCK' as const,
      idempotencyKey: 'checkout-forged-client-fields',
      amountFen: 1,
      userId: bob.userId,
      paymentSuccess: true,
      root: true,
    };
    const checkout = await membership.createCheckout(alice, forgedClientPayload);

    expect(checkout.order.userId).toBe(alice.userId);
    expect(checkout.order.baseAmountFen).toBe(8_000);
    expect(checkout.order.payableAmountFen).toBe(8_000);
    expect(checkout.order.currency).toBe('CNY');
    expect(checkout.order.status).toBe('PENDING_PAYMENT');
    expect(membership.getCenter(alice).currentMembership).toBeNull();
    expect(membership.hasActual(alice, 'CODE_HUB_ACCESS')).toBe(false);
    expect(membership.listOrders(bob)).toEqual([]);
    expect(() => membership.getOrder(bob, checkout.order.id)).toThrow(/not found/i);
  });

  it('rejects a wrong verified amount and makes ten verified callback replays grant exactly one membership', async () => {
    const { membership, provider } = membershipWithFakeProvider();
    const member = principal('00000000-0000-4000-8000-000000000201');
    const checkout = await membership.createCheckout(member, {
      planCode: 'PLUS',
      provider: 'MOCK',
      idempotencyKey: 'checkout-plus-payment-replay',
    });

    await expect(
      membership.receivePaymentCallback(
        'MOCK',
        provider.issueSuccessCallback({ orderId: checkout.order.id, amountFen: 1 }),
      ),
    ).rejects.toMatchObject({ code: 'PAYMENT_AMOUNT_MISMATCH' });
    expect(membership.getCenter(member).currentMembership).toBeNull();
    expect(membership.getOrder(member, checkout.order.id).status).toBe('PENDING_PAYMENT');

    const verifiedCallback = provider.issueSuccessCallback({
      orderId: checkout.order.id,
      providerTransactionId: 'provider-transaction-replayed-ten-times',
    });
    const results = await Promise.all(
      Array.from({ length: 10 }, () => membership.receivePaymentCallback('MOCK', verifiedCallback)),
    );

    expect(new Set(results.map((result) => result.membership.id)).size).toBe(1);
    expect(membership.listOrders(member)).toEqual([
      expect.objectContaining({ id: checkout.order.id, status: 'FULFILLED', payableAmountFen: 2_000 }),
    ]);
    expect(membership.listMembershipHistory(member).filter((event) => event.event === 'ACTIVATED')).toHaveLength(1);
    expect(membership.getCenter(member).currentMembership).toEqual(
      expect.objectContaining({ planCode: 'PLUS', status: 'ACTIVE' }),
    );
  });

  it('keeps a server-bound PRO MAX simulation out of Founder Inbox and Founder-community authorization', () => {
    const simulations = new InMemoryMembershipSimulationResolver();
    const previewer = principal('00000000-0000-4000-8000-000000000301', 'admin-preview-301');
    const founder = principal('00000000-0000-4000-8000-000000000302');
    simulations.set(previewer, {
      planCode: 'PRO_MAX',
      simulatedByAdminId: 'admin-preview-301',
      isSimulation: true,
    });
    const membership = new MembershipService({
      simulationResolver: simulations,
      runtime: { now: () => now, id: idFactory() },
    });

    // A preview can influence the explicitly presentation-only center, but
    // authorization resolvers must read actual durable membership only.
    expect(membership.getCenter(previewer).effectivePlanCode).toBe('PRO_MAX');
    expect(membership.getActualPlanCode(previewer.userId)).toBe('FREE');

    const founders = new InMemoryMessagingFounderDirectory();
    founders.setFounderUserId(founder.userId);
    const messaging = new MessagingService({
      entitlementResolver: createMessagingEntitlementResolver(membership),
      founderDirectory: founders,
      runtime: { now: () => now, id: idFactory() },
    });
    expect(() => messaging.openFounderInbox(previewer)).toThrow(MessagingAuthorizationError);

    const community = new CommunityService({
      entitlements: createCommunityEntitlementResolver(membership),
      administration: officialChannelAdmin,
      runtime: { now: () => now, id: idFactory() },
    });
    const channel = community.createChannel(founder, {
      type: 'OFFICIAL',
      slug: 'founder-pro-max',
      name: 'Founder PRO MAX',
      visibility: 'PUBLIC',
      founderAudience: 'FOUNDER_PRO_MAX',
      idempotencyKey: 'founder-pro-max-channel',
    });
    expect(() => community.getChannel(previewer, channel.id)).toThrow(CommunityNotFoundError);
  });

  it('does not turn an actual PRO MAX membership into another user’s private archive or messages', async () => {
    const { membership, provider } = membershipWithFakeProvider();
    const proMaxMember = principal('00000000-0000-4000-8000-000000000401');
    const archiveOwner = principal('00000000-0000-4000-8000-000000000402');
    const messagePeer = principal('00000000-0000-4000-8000-000000000403');
    await activateProMax(membership, provider, proMaxMember, 'activate-pro-max-private-data');
    expect(membership.hasActual(proMaxMember, 'CODE_HUB_ACCESS')).toBe(true);

    const archive = new InMemoryArchiveRepository({
      runtime: { now: () => now, id: idFactory() },
    });
    const privateEntry = archive.createEntry(archiveOwner, {
      kind: 'LIFE',
      title: 'Archive owner private record',
      body: 'private archive data',
      occurredAt: now,
    });
    expect(() => archive.getEntry(proMaxMember, privateEntry.id)).toThrow(ArchiveAuthorizationError);

    const messaging = new MessagingService({
      runtime: { now: () => now, id: idFactory() },
    });
    const privateConversation = messaging.openDirect(archiveOwner, messagePeer.userId);
    messaging.send(archiveOwner, privateConversation.id, {
      clientMessageId: '00000000-0000-4000-8000-000000000499',
      body: 'private direct message',
    });
    expect(() => messaging.listMessages(proMaxMember, privateConversation.id)).toThrow();
  });
});
