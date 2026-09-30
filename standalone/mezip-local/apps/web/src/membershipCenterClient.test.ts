import { createMeZipSdk, type MeZipSdkTransport } from '@me-zip/sdk';
import type {
  ApiResponse,
  MembershipBenefitGrant,
  MembershipCenter,
  MembershipCoupon,
  MembershipHistoryEvent,
  MembershipOrder,
  MembershipPaymentProviderAvailability,
  MembershipPlan,
  MembershipRedemption,
} from '@me-zip/shared-types';
import { describe, expect, it } from 'vitest';

import {
  ApiMembershipCenterAdapter,
  MockDevMembershipCenterAdapter,
  UnavailableMembershipCenterAdapter,
  createRuntimeMembershipCenterAdapter,
  formatCnyFen,
  membershipPreviewScenarios,
} from './membershipCenterClient.js';

function success<T>(data: T): ApiResponse<T> {
  return { data, meta: { requestId: 'membership-ui-test' } };
}

const serverPlan: MembershipPlan = {
  code: 'PLUS',
  name: 'PLUS · 深度交流',
  amountFen: 2_000,
  currency: 'CNY',
  durationDays: 30,
  renewalMode: 'NON_AUTO_RENEWING_MONTHLY_PASS',
  entitlementCodes: ['FOUNDER_INBOX_ACCESS'],
};

const serverOverview: MembershipCenter = {
  currentMembership: {
    id: 'membership-1',
    userId: 'server-scoped-user',
    orderId: 'order-1',
    planCode: 'PLUS',
    status: 'ACTIVE',
    source: 'PURCHASE',
    sourceReference: null,
    startsAt: '2026-08-17T10:00:00.000Z',
    expiresAt: '2026-09-16T10:00:00.000Z',
    createdAt: '2026-08-17T10:00:00.000Z',
    updatedAt: '2026-08-17T10:00:00.000Z',
    revokedAt: null,
  },
  effectivePlanCode: 'PLUS',
  entitlements: [
    {
      id: 'entitlement-1',
      userId: 'server-scoped-user',
      code: 'FOUNDER_INBOX_ACCESS',
      source: 'PLAN',
      startsAt: '2026-08-17T10:00:00.000Z',
      endsAt: '2026-09-16T10:00:00.000Z',
      revokedAt: null,
      membershipId: 'membership-1',
      grantId: null,
    },
  ],
  benefits: [],
  storage: {
    baseBytes: 1_073_741_824,
    planBytes: 1_073_741_824,
    benefitBytes: 0,
    manualGrantBytes: 0,
    totalBytes: 2_147_483_648,
    usedBytes: 1_073_741_824,
    state: 'WITHIN_QUOTA',
    canUpload: true,
  },
};

const serverBenefit: MembershipBenefitGrant = {
  id: 'benefit-1',
  userId: 'server-scoped-user',
  type: 'FEATURE_ACCESS',
  source: 'PURCHASE',
  capability: 'FOUNDER_INBOX_ACCESS',
  membershipDays: null,
  planCode: null,
  storageBytes: null,
  badgeCode: null,
  couponId: null,
  campaignId: null,
  startsAt: '2026-08-17T10:00:00.000Z',
  endsAt: null,
  revokedAt: null,
  idempotencyKey: 'server-generated-benefit',
  reason: null,
  operatorId: null,
};

const serverCoupon: MembershipCoupon = {
  id: 'coupon-1',
  code: 'SERVER-ONLY-CODE',
  discountKind: 'FIXED_FEN',
  discountValue: 500,
  applicablePlans: ['PLUS'],
  status: 'ACTIVE',
  maxRedemptions: 100,
  redeemedCount: 10,
  startsAt: '2026-08-17T10:00:00.000Z',
  endsAt: '2026-09-16T10:00:00.000Z',
  campaignId: 'campaign-1',
};

const serverRedemption: MembershipRedemption = {
  id: 'redemption-1',
  userId: 'server-scoped-user',
  orderId: 'order-1',
  redemptionCodeId: 'code-1',
  couponId: 'coupon-1',
  benefitGrantIds: ['benefit-1'],
  idempotencyKey: 'server-generated-redemption',
  redeemedAt: '2026-08-17T10:05:00.000Z',
};

const serverPaymentProvider: MembershipPaymentProviderAvailability = {
  provider: 'WECHAT_PAY',
  checkoutAvailable: true,
  callbackVerificationAvailable: true,
  readiness: 'READY',
};

const serverHistory: MembershipHistoryEvent = {
  id: 'history-1',
  membershipId: 'membership-1',
  userId: 'server-scoped-user',
  event: 'ACTIVATED',
  source: 'PURCHASE',
  occurredAt: '2026-08-17T10:02:00.000Z',
  reason: null,
  actorUserId: null,
};

const serverOrder: MembershipOrder = {
  id: 'order-1',
  orderNo: 'ME-20260817-0001',
  userId: 'server-scoped-user',
  planCode: 'PLUS',
  baseAmountFen: 2_000,
  discountAmountFen: 500,
  payableAmountFen: 1_500,
  currency: 'CNY',
  couponId: 'coupon-1',
  provider: null,
  status: 'PENDING_PAYMENT',
  createdAt: '2026-08-17T10:00:00.000Z',
  expiresAt: '2026-08-17T10:30:00.000Z',
  paidAt: null,
  updatedAt: '2026-08-17T10:00:00.000Z',
};

function membershipReadTransport(failurePath: string | null = null): {
  readonly calls: Parameters<MeZipSdkTransport['request']>[0][];
  readonly transport: MeZipSdkTransport;
} {
  const calls: Parameters<MeZipSdkTransport['request']>[0][] = [];
  const values: Readonly<Record<string, unknown>> = {
    '/v1/membership/overview': serverOverview,
    '/v1/membership/plans': [serverPlan],
    '/v1/membership/payment-providers': [serverPaymentProvider],
    '/v1/membership/history': [serverHistory],
    '/v1/membership/benefits': [serverBenefit],
    '/v1/membership/coupons': [serverCoupon],
    '/v1/membership/redemptions': [serverRedemption],
    '/v1/billing/orders': [serverOrder],
  };
  return {
    calls,
    transport: {
      async request<T>(input: Parameters<MeZipSdkTransport['request']>[0]) {
        calls.push(input);
        if (input.path === failurePath) {
          return {
            error: {
              code: 'SERVICE_UNAVAILABLE',
              message: 'membership read unavailable',
              retryable: true,
              requestId: 'membership-ui-test',
            },
          };
        }
        return success(values[input.path] as T);
      },
    },
  };
}

describe('Membership center presentation boundary', () => {
  it('retains the frozen integer CNY-fen catalog in its read-only projection', async () => {
    const result = await new MockDevMembershipCenterAdapter().getSnapshot();

    expect(result.kind).toBe('AVAILABLE');
    if (result.kind !== 'AVAILABLE') return;
    expect(result.snapshot.plans.map((plan) => [plan.code, plan.amountFen])).toEqual([
      ['FREE', 0],
      ['GO', 1_000],
      ['PLUS', 2_000],
      ['PRO', 4_000],
      ['PRO_MAX', 8_000],
    ]);
    expect(
      result.snapshot.plans.every((plan) => Number.isSafeInteger(plan.amountFen)),
    ).toBe(true);
    expect(result.snapshot.source).toBe('MOCK_DEV');
    expect(result.snapshot.serverConfirmed).toBe(false);
  });

  it('formats integer CNY fen exactly without rounding discounted fen away', () => {
    expect(formatCnyFen(0)).toBe('¥0');
    expect(formatCnyFen(1_000)).toBe('¥10');
    expect(formatCnyFen(1_050)).toBe('¥10.50');
    expect(formatCnyFen(1_001)).toBe('¥10.01');
    expect(formatCnyFen(-1)).toBe('金额待服务端确认');
  });

  it('models payment outcomes as read-only projections and never enables local checkout', async () => {
    const client = new MockDevMembershipCenterAdapter();
    const [active, pending, failed] = await Promise.all([
      client.getSnapshot('ACTIVE'),
      client.getSnapshot('PENDING_PAYMENT'),
      client.getSnapshot('PAYMENT_FAILED'),
    ]);

    for (const result of [active, pending, failed]) {
      expect(result.kind).toBe('AVAILABLE');
      if (result.kind === 'AVAILABLE') {
        expect(result.snapshot.actions.checkout).toBe('NOT_CONFIGURED');
        expect(result.snapshot.actions.redemption).toBe('NOT_CONFIGURED');
        expect(JSON.stringify(result.snapshot)).not.toContain('paymentSuccess');
      }
    }

    if (pending.kind === 'AVAILABLE') {
      expect(pending.snapshot.payment.state).toBe('PENDING');
      expect(pending.snapshot.orders[0]).toMatchObject({
        status: 'PENDING_PAYMENT',
        planCode: 'PRO',
      });
      expect(pending.snapshot.membership.planCode).toBe('PLUS');
      expect(pending.snapshot.membership.entitlements).toContainEqual(
        expect.objectContaining({
          code: 'FOUNDER_PRIORITY_INBOX',
          state: 'NOT_GRANTED',
        }),
      );
    }
    if (failed.kind === 'AVAILABLE') {
      expect(failed.snapshot.payment.state).toBe('FAILED');
      expect(failed.snapshot.orders[0]).toMatchObject({
        status: 'FAILED',
        planCode: 'PRO',
      });
      expect(failed.snapshot.membership.planCode).toBe('PLUS');
    }
  });

  it('represents expiry and over-quota without removing private records', async () => {
    const client = new MockDevMembershipCenterAdapter();
    const [expired, overQuota] = await Promise.all([
      client.getSnapshot('EXPIRED'),
      client.getSnapshot('OVER_QUOTA'),
    ]);

    expect(expired).toMatchObject({
      kind: 'AVAILABLE',
      snapshot: {
        membership: { planCode: 'FREE', status: 'EXPIRED' },
      },
    });
    if (expired.kind === 'AVAILABLE') {
      expect(expired.snapshot.membership.entitlements).toContainEqual(
        expect.objectContaining({
          code: 'ARCHIVE_PRIVATE',
          state: 'ACTIVE',
        }),
      );
    }
    expect(overQuota).toMatchObject({
      kind: 'AVAILABLE',
      snapshot: {
        storage: { state: 'OVER_QUOTA' },
      },
    });
    if (overQuota.kind === 'AVAILABLE') {
      expect(overQuota.snapshot.storage.detail).toContain('不会删除');
    }
  });

  it('covers all requested UI preview states without turning them into production authority', async () => {
    const client = new MockDevMembershipCenterAdapter();
    const results = await Promise.all(
      membershipPreviewScenarios.map(({ code }) => client.getSnapshot(code)),
    );
    expect(results).toHaveLength(5);
    for (const result of results) {
      expect(result).toMatchObject({
        kind: 'AVAILABLE',
        snapshot: { source: 'MOCK_DEV', serverConfirmed: false },
      });
    }
  });

  it('fails closed when a production server projection is unavailable', async () => {
    await expect(
      new UnavailableMembershipCenterAdapter().getSnapshot(),
    ).resolves.toEqual({
      kind: 'UNAVAILABLE',
      message: expect.stringContaining('服务端确认投影'),
    });
  });

  it('uses the Membership SDK read projections and never sends a client payment or entitlement claim', async () => {
    const { calls, transport } = membershipReadTransport();
    const result = await new ApiMembershipCenterAdapter(
      createMeZipSdk(transport).membership,
    ).getSnapshot();

    expect(result).toMatchObject({
      kind: 'AVAILABLE',
      snapshot: {
        source: 'SERVER',
        serverConfirmed: true,
        membership: { planCode: 'PLUS', status: 'ACTIVE' },
        payment: { state: 'PENDING' },
        plans: [{ code: 'PLUS', amountFen: 2_000 }],
        paymentProviders: [
          {
            provider: 'WECHAT_PAY',
            checkoutAvailable: true,
            callbackVerificationAvailable: true,
            readiness: 'READY',
          },
        ],
        history: [{ title: '会员权益已生效' }],
        orders: [{ orderNo: 'ME-20260817-0001', payableAmountFen: 1_500 }],
      },
    });
    if (result.kind === 'AVAILABLE') {
      expect(result.snapshot.coupons[0]).toMatchObject({ codeHint: null });
      expect(result.snapshot.actions).toEqual({
        checkout: 'NOT_CONFIGURED',
        redemption: 'NOT_CONFIGURED',
        simulator: false,
      });
    }
    expect(calls.map((call) => [call.method, call.path])).toEqual([
      ['GET', '/v1/membership/overview'],
      ['GET', '/v1/membership/plans'],
      ['GET', '/v1/membership/payment-providers'],
      ['GET', '/v1/membership/history'],
      ['GET', '/v1/membership/benefits'],
      ['GET', '/v1/membership/coupons'],
      ['GET', '/v1/membership/redemptions'],
      ['GET', '/v1/billing/orders'],
    ]);
    expect(
      calls.every(
        (call) =>
          call.method === 'GET' &&
          call.body === undefined &&
          call.idempotencyKey === undefined,
      ),
    ).toBe(true);
    const serializedClientInput = JSON.stringify(
      calls.map((call) => ({
        body: call.body,
        query: call.query,
        idempotencyKey: call.idempotencyKey,
      })),
    );
    for (const forbidden of [
      'amountFen',
      'paymentSuccess',
      'userId',
      'entitlement',
      'root',
      'provider',
    ]) {
      expect(serializedClientInput).not.toContain(forbidden);
    }
  });

  it('fails closed when any required Membership SDK read projection fails', async () => {
    const { transport } = membershipReadTransport('/v1/billing/orders');
    await expect(
      new ApiMembershipCenterAdapter(
        createMeZipSdk(transport).membership,
      ).getSnapshot(),
    ).resolves.toMatchObject({
      kind: 'UNAVAILABLE',
      message: expect.stringContaining('会员服务暂时不可用'),
    });
  });

  it('chooses the typed server adapter only when an explicit membership API base URL exists', () => {
    expect(
      createRuntimeMembershipCenterAdapter('https://membership.example.test'),
    ).toBeInstanceOf(ApiMembershipCenterAdapter);
  });
});
