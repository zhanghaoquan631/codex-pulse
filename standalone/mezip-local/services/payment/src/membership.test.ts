import { describe, expect, it } from 'vitest';

import {
  AlipayPaymentProvider,
  AppleIapPaymentProvider,
  FakePaymentProvider,
  InMemoryMembershipAdministrationAccess,
  MembershipService,
  officialMembershipPlans,
  StaticBillingPlatformResolver,
} from './membership.js';

const owner = { userId: 'owner-user', sessionId: 'owner-session', roles: [], issuedAt: '2026-08-18T00:00:00.000Z', adminIdentityId: 'admin-owner' } as const;
const alice = { userId: 'alice-user', sessionId: 'alice-session', roles: [], issuedAt: '2026-08-18T00:00:00.000Z' } as const;
const bob = { userId: 'bob-user', sessionId: 'bob-session', roles: [], issuedAt: '2026-08-18T00:00:00.000Z' } as const;

function fixture() {
  let counter = 0;
  let currentTime = '2026-08-18T00:00:00.000Z';
  const admin = new InMemoryMembershipAdministrationAccess();
  admin.set('admin-owner', 'owner-user', [
    'MANAGE_CAMPAIGNS',
    'MANAGE_COUPONS',
    'MANAGE_REDEMPTIONS',
    'GRANT_BENEFITS',
    'MANAGE_MEMBERSHIPS',
    'VIEW_PAYMENT_METADATA',
  ]);
  const fake = new FakePaymentProvider({ signingSecret: 'local-membership-test-secret', now: () => currentTime });
  const service = new MembershipService({
    administration: admin,
    providers: [fake],
    runtime: {
      now: () => currentTime,
      id: () => `test-id-${++counter}`,
      randomCodeBytes: () => Buffer.from('012345678901234567890123', 'utf8'),
    },
  });
  return {
    service,
    fake,
    setTime(value: string) { currentTime = value; },
  };
}

async function checkoutAndPay(
  service: MembershipService,
  fake: FakePaymentProvider,
  principal: typeof alice,
  planCode: 'GO' | 'PLUS' | 'PRO' | 'PRO_MAX',
  key: string,
) {
  const checkout = await service.createCheckout(principal, {
    planCode,
    provider: 'MOCK',
    idempotencyKey: key,
  });
  return {
    checkout,
    callback: fake.issueSuccessCallback({ orderId: checkout.order.id }),
  };
}

describe('Phase 6 MembershipService', () => {
  it('freezes the only valid CNY-fen catalogue and keeps FREE non-expiring', () => {
    expect(officialMembershipPlans.map((plan) => [plan.code, plan.amountFen, plan.durationDays])).toEqual([
      ['FREE', 0, null],
      ['GO', 1000, 30],
      ['PLUS', 2000, 30],
      ['PRO', 4000, 30],
      ['PRO_MAX', 8000, 30],
    ]);
  });

  it('uses the server catalogue and ignores forged client amount/payment fields', async () => {
    const { service } = fixture();
    const checkout = await service.createCheckout(alice, {
      planCode: 'PRO_MAX',
      provider: 'MOCK',
      idempotencyKey: 'server-price-0001',
      // Runtime-only hostile additions cannot affect the server input.
      ...({ amountFen: 1, paymentSuccess: true } as object),
    } as never);
    expect(checkout.order.baseAmountFen).toBe(8000);
    expect(checkout.order.payableAmountFen).toBe(8000);
    expect(service.getCenter(alice).currentMembership).toBeNull();
  });

  it('accepts a verified callback once and rejects a verified wrong amount', async () => {
    const { service, fake } = fixture();
    const { checkout, callback } = await checkoutAndPay(service, fake, alice, 'PLUS', 'verified-pay-0001');
    const wrongAmount = fake.issueSuccessCallback({ orderId: checkout.order.id, amountFen: 1 });
    await expect(service.receivePaymentCallback('MOCK', wrongAmount)).rejects.toMatchObject({ code: 'PAYMENT_AMOUNT_MISMATCH' });
    expect(service.getOrder(alice, checkout.order.id).status).toBe('PENDING_PAYMENT');

    const results = await Promise.all(Array.from({ length: 10 }, () => service.receivePaymentCallback('MOCK', callback)));
    expect(results.every((result) => result.membership.orderId === checkout.order.id)).toBe(true);
    const snapshot = service.toSnapshotForTrustedPersistence();
    expect(snapshot.memberships.filter((membership) => membership.orderId === checkout.order.id)).toHaveLength(1);
    expect(snapshot.paymentEvents).toHaveLength(1);
    expect(service.hasActual(alice, 'FOUNDER_INBOX_ACCESS')).toBe(true);
  });

  it('enforces self-scoped order reads and does not treat plan simulation as actual access', async () => {
    const { service, fake } = fixture();
    const { checkout } = await checkoutAndPay(service, fake, alice, 'PRO_MAX', 'idor-order-0001');
    expect(() => service.getOrder(bob, checkout.order.id)).toThrow(/not found/i);
    expect(service.hasActual(bob, 'CODE_HUB_ACCESS')).toBe(false);
  });

  it('durably-modelled selected campaign targeting denies a non-target claim and coupon use', async () => {
    const { service } = fixture();
    const campaign = await service.createCampaign(owner, {
      code: 'TARGET-ONLY',
      audience: 'SELECTED_USERS',
      targetUserIds: [alice.userId],
      benefits: [{ type: 'TEMP_ENTITLEMENT', capability: 'CODE_HUB_ACCESS' }],
      startsAt: '2026-08-17T00:00:00.000Z',
      idempotencyKey: 'campaign-create-0001',
    });
    await service.setCampaignStatus(owner, campaign.id, 'ACTIVE', 'activate target campaign', 'campaign-status-0001');
    await expect(service.claimCampaign(bob, campaign.id, 'campaign-claim-0001')).rejects.toMatchObject({ code: 'NOT_FOUND' });
    const claim = await service.claimCampaign(alice, campaign.id, 'campaign-claim-0002');
    expect(claim.userId).toBe(alice.userId);
    expect(service.hasActual(alice, 'CODE_HUB_ACCESS')).toBe(true);

    const coupon = await service.createCoupon(owner, {
      code: 'TARGETGO',
      discountKind: 'FIXED_FEN',
      discountValue: 100,
      applicablePlans: ['GO'],
      startsAt: '2026-08-17T00:00:00.000Z',
      campaignId: campaign.id,
      idempotencyKey: 'coupon-create-0001',
    });
    expect(coupon.campaignId).toBe(campaign.id);
    await expect(service.createCheckout(bob, {
      planCode: 'GO', provider: 'MOCK', couponCode: 'TARGETGO', idempotencyKey: 'target-coupon-0001',
    })).rejects.toMatchObject({ code: 'COUPON_INVALID' });
  });

  it('hashes redemption codes, allows one redemption, and never exposes code hash in the public definition', async () => {
    const { service } = fixture();
    const issued = await service.issueRedemptionCode(owner, {
      maxRedemptions: 1,
      membershipDays: 7,
      planCode: 'GO',
      startsAt: '2026-08-17T00:00:00.000Z',
      idempotencyKey: 'issue-redemption-0001',
    });
    expect('codeHash' in issued.definition).toBe(false);
    const redeemed = await service.redeemCode(alice, issued.code, 'redeem-code-0001');
    expect(redeemed.userId).toBe(alice.userId);
    await expect(service.redeemCode(alice, issued.code, 'redeem-code-0002')).rejects.toMatchObject({ code: 'REDEMPTION_ALREADY_USED' });
    const persisted = JSON.stringify(service.toSnapshotForTrustedPersistence());
    expect(persisted).not.toContain(issued.code);
  });

  it('records a refund request only for the owning paid order', async () => {
    const { service, fake } = fixture();
    const { checkout, callback } = await checkoutAndPay(service, fake, alice, 'GO', 'refund-checkout-0001');
    await service.receivePaymentCallback('MOCK', callback);
    await expect(service.requestRefund(bob, checkout.order.id, 'not my order', 'refund-idor-0001')).rejects.toMatchObject({ code: 'NOT_FOUND' });
    const refund = await service.requestRefund(alice, checkout.order.id, 'changed my mind', 'refund-owner-0001');
    expect(refund.status).toBe('REQUESTED');
  });

  it('revokes a membership-days grant together with its derived subscription access', async () => {
    const { service } = fixture();
    const grant = await service.grantBenefit(owner, {
      targetUserId: alice.userId,
      type: 'MEMBERSHIP_DAYS',
      planCode: 'PLUS',
      membershipDays: 14,
      reason: 'temporary PLUS pass',
      idempotencyKey: 'grant-days-0001',
    });
    expect(service.hasActual(alice, 'FOUNDER_INBOX_ACCESS')).toBe(true);
    await service.revokeBenefit(owner, grant.id, 'remove temporary pass', 'revoke-days-0001');
    expect(service.hasActual(alice, 'FOUNDER_INBOX_ACCESS')).toBe(false);
    expect(service.getCenter(alice).currentMembership).toBeNull();
    expect(service.getAdminAudits(owner).some((audit) => audit.action === 'REVOKE_BENEFIT')).toBe(true);
  });

  it('expires an unfulfilled coupon order and releases its reservation in local reconciliation', async () => {
    const { service, setTime } = fixture();
    await service.createCoupon(owner, {
      code: 'ONEUSE', discountKind: 'FIXED_FEN', discountValue: 100,
      applicablePlans: ['GO'], maxRedemptions: 1,
      startsAt: '2026-08-17T00:00:00.000Z', idempotencyKey: 'expiry-coupon-0001',
    });
    await service.createCheckout(alice, { planCode: 'GO', provider: 'MOCK', couponCode: 'ONEUSE', idempotencyKey: 'expiry-checkout-0001' });
    setTime('2026-08-18T01:00:00.000Z');
    await service.reconcileExpiry();
    const replacement = await service.createCheckout(bob, { planCode: 'GO', provider: 'MOCK', couponCode: 'ONEUSE', idempotencyKey: 'expiry-checkout-0002' });
    expect(replacement.order.couponId).not.toBeNull();
  });

  it('blocks the local mock provider in production and server-resolves platform provider availability', async () => {
    const fake = new FakePaymentProvider({ signingSecret: 'local-membership-test-secret' });
    expect(() => new MembershipService({ environment: 'PRODUCTION', providers: [fake] })).toThrow(/forbidden in production/i);

    const service = new MembershipService({
      providers: [fake],
      platformResolver: new StaticBillingPlatformResolver({
        WEB: ['MOCK'],
        WECHAT_MINI_PROGRAM: ['WECHAT_PAY'],
        IOS: ['APPLE_IAP'],
      }),
    });
    await expect(service.createCheckout(alice, {
      planCode: 'GO', provider: 'MOCK', platform: 'IOS', idempotencyKey: 'ios-mock-not-allowed',
    })).rejects.toMatchObject({ code: 'PROVIDER_UNAVAILABLE' });
    expect(service.listPaymentProviders()).toContainEqual(
      expect.objectContaining({ provider: 'MOCK', readiness: 'SANDBOX' }),
    );
    expect(service.listPaymentProviders()).toContainEqual(
      expect.objectContaining({ provider: 'APPLE_IAP', readiness: 'NOT_CONFIGURED' }),
    );
  });

  it('keeps a reconciliation query pending until an independently verified callback arrives', async () => {
    const { service, fake } = fixture();
    const checkout = await service.createCheckout(alice, {
      planCode: 'GO', provider: 'MOCK', idempotencyKey: 'reconcile-pending-0001',
    });
    fake.queryPayment = async (input) => ({ providerPaymentId: input.providerPaymentId, status: 'SUCCEEDED' });
    await expect(service.reconcilePendingPayments()).resolves.toEqual({
      scanned: 1, pending: 0, awaitingVerification: 1, closed: 0, providerUnavailable: 0,
    });
    expect(service.getOrder(alice, checkout.order.id).status).toBe('PENDING_PAYMENT');
    expect(service.getCenter(alice).currentMembership).toBeNull();
  });

  it('validates official-provider configuration and maps Apple signed products back to a server plan', async () => {
    expect(() => new AlipayPaymentProvider({
      appId: '', merchantId: 'merchant', appPrivateKeyPem: 'private', alipayPublicKeyPem: 'public', notifyUrl: 'https://example.test/callback',
    }, undefined, undefined)).toThrow(/configuration is incomplete/i);

    const apple = new AppleIapPaymentProvider({
      bundleId: 'com.mezip.app', issuerId: 'issuer', keyId: 'key', privateKeyPem: 'server-private-key',
      productIds: { GO: 'mezip.go', PLUS: 'mezip.plus', PRO: 'mezip.pro', PRO_MAX: 'mezip.pro-max' },
    }, undefined, {
      verify: async () => ({
        providerTransactionId: 'apple-transaction-1', orderId: 'order-1', amountFen: 1000, currency: 'CNY',
        paidAt: '2026-08-18T00:00:00.000Z', bundleId: 'com.mezip.app', productId: 'mezip.go',
      }),
    });
    await expect(apple.verifyCallback({ headers: {}, rawBody: 'signed-apple-transaction' })).resolves.toMatchObject({
      planCode: 'GO', orderId: 'order-1',
    });
  });
});
