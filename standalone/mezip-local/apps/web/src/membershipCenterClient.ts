import { createMeZipSdk, type MembershipSdk } from '@me-zip/sdk';
import type {
  MembershipBenefitGrant as SdkMembershipBenefitGrant,
  MembershipCenter as SdkMembershipCenter,
  MembershipCoupon as SdkMembershipCoupon,
  MembershipHistoryEvent as SdkMembershipHistoryEvent,
  MembershipOrder as SdkMembershipOrder,
  MembershipPaymentProviderAvailability as SdkMembershipPaymentProviderAvailability,
  MembershipPlan as SdkMembershipPlan,
  MembershipRedemption as SdkMembershipRedemption,
} from '@me-zip/shared-types';

import {
  membershipPlanCodes,
  membershipPlans,
  type MembershipPlanCode,
  type MembershipPlanPresentation,
} from './entitlementModel.js';
import { FetchMessagingTransport } from './messagingClient.js';

export type MembershipCenterSource = 'SERVER' | 'MOCK_DEV';
export type MembershipPreviewScenario =
  'ACTIVE' | 'PENDING_PAYMENT' | 'PAYMENT_FAILED' | 'EXPIRED' | 'OVER_QUOTA';
export type MembershipStatus = 'FREE' | 'ACTIVE' | 'EXPIRED';
export type MembershipBenefitState = 'AVAILABLE' | 'ACTIVE' | 'USED' | 'EXPIRED';
export type MembershipOrderStatus =
  | 'CREATED'
  | 'PENDING_PAYMENT'
  | 'PAID'
  | 'FULFILLED'
  | 'FAILED'
  | 'CANCELLED'
  | 'EXPIRED'
  | 'REFUNDING'
  | 'REFUNDED';
export type MembershipPaymentState =
  'NOT_CONFIGURED' | 'PENDING' | 'FAILED' | 'VERIFIED';

export interface MembershipEntitlementView {
  readonly code: string;
  readonly label: string;
  readonly state: 'ACTIVE' | 'EXPIRED' | 'NOT_GRANTED';
  readonly expiresAt: string | null;
}

export interface MembershipCurrentView {
  readonly planCode: MembershipPlanCode;
  readonly status: MembershipStatus;
  readonly startsAt: string | null;
  readonly expiresAt: string | null;
  readonly autoRenewing: false;
  readonly entitlements: readonly MembershipEntitlementView[];
}

export interface MembershipBenefitView {
  readonly id: string;
  readonly title: string;
  readonly detail: string;
  readonly type:
    | 'MEMBERSHIP_DAYS'
    | 'TEMP_ENTITLEMENT'
    | 'STORAGE_BYTES'
    | 'COUPON'
    | 'BADGE'
    | 'FEATURE_ACCESS';
  readonly state: MembershipBenefitState;
  readonly expiresAt: string | null;
}

export interface MembershipCouponView {
  readonly id: string;
  readonly title: string;
  readonly detail: string;
  readonly state: 'AVAILABLE' | 'USED' | 'EXPIRED';
  readonly expiresAt: string | null;
  /** A server projection can display a safe hint, never a raw redeem secret. */
  readonly codeHint: string | null;
}

export interface MembershipRedemptionView {
  readonly id: string;
  readonly title: string;
  readonly detail: string;
  readonly state: 'USED' | 'EXPIRED';
  readonly redeemedAt: string | null;
}

export interface MembershipStorageView {
  readonly usedBytes: number;
  readonly limitBytes: number;
  readonly state: 'WITHIN_QUOTA' | 'OVER_QUOTA';
  readonly detail: string;
}

export interface MembershipOrderView {
  readonly id: string;
  readonly orderNo: string;
  readonly planCode: MembershipPlanCode;
  readonly baseAmountFen: number;
  readonly discountAmountFen: number;
  readonly payableAmountFen: number;
  readonly currency: 'CNY';
  readonly status: MembershipOrderStatus;
  readonly createdAt: string;
  readonly expiresAt: string | null;
  readonly paidAt: string | null;
}

export interface MembershipPaymentView {
  readonly state: MembershipPaymentState;
  readonly detail: string;
}

/** A server-confirmed checkout capability projection, never a client credential. */
export interface MembershipPaymentProviderView {
  readonly provider: SdkMembershipPaymentProviderAvailability['provider'];
  readonly label: string;
  readonly checkoutAvailable: boolean;
  readonly callbackVerificationAvailable: boolean;
  readonly readiness: SdkMembershipPaymentProviderAvailability['readiness'];
}

/** Privacy-safe membership timeline: no actor, user, or membership identifiers. */
export interface MembershipHistoryView {
  readonly id: string;
  readonly title: string;
  readonly occurredAt: string;
}

export interface MembershipActionAvailability {
  readonly checkout: 'AVAILABLE' | 'NOT_CONFIGURED';
  readonly redemption: 'AVAILABLE' | 'NOT_CONFIGURED';
  readonly simulator: boolean;
}

export interface MembershipCenterSnapshot {
  readonly source: MembershipCenterSource;
  readonly serverConfirmed: boolean;
  readonly plans: readonly MembershipPlanPresentation[];
  readonly membership: MembershipCurrentView;
  readonly benefits: readonly MembershipBenefitView[];
  readonly coupons: readonly MembershipCouponView[];
  readonly redemptions: readonly MembershipRedemptionView[];
  readonly storage: MembershipStorageView;
  readonly orders: readonly MembershipOrderView[];
  readonly payment: MembershipPaymentView;
  readonly paymentProviders: readonly MembershipPaymentProviderView[];
  readonly history: readonly MembershipHistoryView[];
  readonly actions: MembershipActionAvailability;
}

export type MembershipCenterReadResult =
  | { readonly kind: 'AVAILABLE'; readonly snapshot: MembershipCenterSnapshot }
  | { readonly kind: 'UNAVAILABLE'; readonly message: string };

/**
 * Presentation adapter boundary. A real implementation must return a
 * server-authorized projection; it never accepts a client-provided amount,
 * membership status, entitlement, or payment-success claim.
 */
export interface MembershipCenterAdapter {
  getSnapshot(): Promise<MembershipCenterReadResult>;
}

const commonBenefits: readonly MembershipBenefitView[] = [
  {
    id: 'benefit-storage',
    title: '额外媒体存储',
    detail: '已由服务端权益投影授予的存储奖励。',
    type: 'STORAGE_BYTES',
    state: 'ACTIVE',
    expiresAt: '2026-09-17T15:59:59.000Z',
  },
  {
    id: 'benefit-coupon',
    title: '创作者月卡优惠',
    detail: '一次性优惠资格；最终金额始终由服务端价格目录计算。',
    type: 'COUPON',
    state: 'AVAILABLE',
    expiresAt: '2026-08-31T15:59:59.000Z',
  },
  {
    id: 'benefit-badge',
    title: '早期建设者徽章',
    detail: '已使用并保留在你的个人资料中。',
    type: 'BADGE',
    state: 'USED',
    expiresAt: null,
  },
  {
    id: 'benefit-expired',
    title: 'Creator Lab 体验',
    detail: '体验权益已到期，不会影响你的私人档案。',
    type: 'TEMP_ENTITLEMENT',
    state: 'EXPIRED',
    expiresAt: '2026-08-01T15:59:59.000Z',
  },
] as const;

const commonCoupons: readonly MembershipCouponView[] = [
  {
    id: 'coupon-active',
    title: '新用户月卡优惠',
    detail: '可在服务端 checkout 中验证；不能由浏览器自行折价。',
    state: 'AVAILABLE',
    expiresAt: '2026-08-31T15:59:59.000Z',
    codeHint: 'ME••••2026',
  },
  {
    id: 'coupon-used',
    title: '社区创作者礼遇',
    detail: '已使用。',
    state: 'USED',
    expiresAt: null,
    codeHint: null,
  },
  {
    id: 'coupon-expired',
    title: '旧活动优惠',
    detail: '已到期，无法抵扣。',
    state: 'EXPIRED',
    expiresAt: '2026-08-01T15:59:59.000Z',
    codeHint: null,
  },
] as const;

const commonRedemptions: readonly MembershipRedemptionView[] = [
  {
    id: 'redemption-used',
    title: '邀请奖励兑换',
    detail: '已由服务端记录；权益历史可追溯。',
    state: 'USED',
    redeemedAt: '2026-08-12T12:00:00.000Z',
  },
  {
    id: 'redemption-expired',
    title: '旧活动兑换资格',
    detail: '已过期，不能再次兑换。',
    state: 'EXPIRED',
    redeemedAt: null,
  },
] as const;

const capabilityLabels: Readonly<Record<string, string>> = {
  ARCHIVE_PRIVATE: '私人 Life Archive 与 Timeline',
  COMMUNITY_INTERACT: '完整社区互动',
  FOUNDER_INBOX_ACCESS: 'Founder Inbox',
  FOUNDER_PRIORITY_INBOX: 'Founder Inbox 优先队列',
  FOUNDER_PRO_FEED: 'Founder PRO Feed',
  CREATOR_LAB_ACCESS: 'Creator Lab',
  CODE_HUB_ACCESS: 'Code Hub',
};

function entitlement(
  code: keyof typeof capabilityLabels,
  state: MembershipEntitlementView['state'],
  expiresAt: string | null = null,
): MembershipEntitlementView {
  return { code, label: capabilityLabels[code] ?? code, state, expiresAt };
}

function order(
  overrides: Partial<MembershipOrderView> &
    Pick<MembershipOrderView, 'id' | 'orderNo' | 'planCode' | 'status'>,
): MembershipOrderView {
  const { id, orderNo, planCode, status, ...optionalOverrides } = overrides;
  const amountFen =
    planCode === 'FREE'
      ? 0
      : (membershipPlans.find((plan) => plan.code === planCode)?.amountFen ?? 0);
  return {
    id,
    orderNo,
    planCode,
    baseAmountFen: amountFen,
    discountAmountFen: 0,
    payableAmountFen: amountFen,
    currency: 'CNY',
    status,
    createdAt: '2026-08-17T10:00:00.000Z',
    expiresAt: null,
    paidAt: null,
    ...optionalOverrides,
  };
}

function snapshotForScenario(
  scenario: MembershipPreviewScenario,
): MembershipCenterSnapshot {
  const isPending = scenario === 'PENDING_PAYMENT';
  const isFailed = scenario === 'PAYMENT_FAILED';
  const isExpired = scenario === 'EXPIRED';
  const isOverQuota = scenario === 'OVER_QUOTA';
  const planCode: MembershipPlanCode =
    isExpired || isOverQuota ? 'FREE' : isPending || isFailed ? 'PLUS' : 'PRO';
  const membershipStatus: MembershipStatus = isExpired
    ? 'EXPIRED'
    : planCode === 'FREE'
      ? 'FREE'
      : 'ACTIVE';
  const expiresAt = isExpired
    ? '2026-08-01T15:59:59.000Z'
    : planCode === 'FREE'
      ? null
      : '2026-09-17T15:59:59.000Z';
  const entitlements = [
    entitlement('ARCHIVE_PRIVATE', 'ACTIVE'),
    entitlement(
      'COMMUNITY_INTERACT',
      planCode === 'FREE' ? 'NOT_GRANTED' : 'ACTIVE',
      expiresAt,
    ),
    entitlement(
      'FOUNDER_INBOX_ACCESS',
      planCode === 'FREE' ? (isExpired ? 'EXPIRED' : 'NOT_GRANTED') : 'ACTIVE',
      expiresAt,
    ),
    entitlement(
      'FOUNDER_PRIORITY_INBOX',
      planCode === 'PRO' ? 'ACTIVE' : 'NOT_GRANTED',
      expiresAt,
    ),
    entitlement(
      'FOUNDER_PRO_FEED',
      planCode === 'PRO' ? 'ACTIVE' : 'NOT_GRANTED',
      expiresAt,
    ),
    entitlement('CREATOR_LAB_ACCESS', 'NOT_GRANTED'),
    entitlement('CODE_HUB_ACCESS', 'NOT_GRANTED'),
  ];
  const currentOrder = isPending
    ? order({
        id: 'order-pending-dev',
        orderNo: 'DEV-PENDING-0001',
        planCode: 'PRO',
        status: 'PENDING_PAYMENT',
        createdAt: '2026-08-18T09:30:00.000Z',
        expiresAt: '2026-08-18T10:00:00.000Z',
      })
    : isFailed
      ? order({
          id: 'order-failed-dev',
          orderNo: 'DEV-FAILED-0001',
          planCode: 'PRO',
          status: 'FAILED',
          createdAt: '2026-08-18T09:30:00.000Z',
          expiresAt: '2026-08-18T10:00:00.000Z',
        })
      : order({
          id: 'order-history-dev',
          orderNo: 'DEV-HISTORY-0001',
          planCode: 'PRO',
          status: 'FULFILLED',
          createdAt: '2026-08-17T10:00:00.000Z',
          paidAt: '2026-08-17T10:02:00.000Z',
        });

  return {
    source: 'MOCK_DEV',
    serverConfirmed: false,
    plans: membershipPlans,
    membership: {
      planCode,
      status: membershipStatus,
      startsAt: planCode === 'FREE' ? null : '2026-08-17T10:02:00.000Z',
      expiresAt,
      autoRenewing: false,
      entitlements,
    },
    benefits: commonBenefits,
    coupons: commonCoupons,
    redemptions: commonRedemptions,
    storage: isOverQuota
      ? {
          usedBytes: 6_442_450_944,
          limitBytes: 5_368_709_120,
          state: 'OVER_QUOTA',
          detail:
            '已超出当前额度：现有媒体不会删除，可查看、下载、删除或整理；新的超额上传会被限制。',
        }
      : {
          usedBytes: 2_684_354_560,
          limitBytes: 5_368_709_120,
          state: 'WITHIN_QUOTA',
          detail: '额度由基础存储、计划存储与服务端授予的奖励合并计算。',
        },
    orders: [currentOrder],
    payment: isPending
      ? {
          state: 'PENDING',
          detail: '正在确认支付结果。未收到服务端验证前，不会开通任何高级权益。',
        }
      : isFailed
        ? {
            state: 'FAILED',
            detail: '支付未确认。浏览器不能把此状态改为成功或开通会员。',
          }
        : {
            state: scenario === 'ACTIVE' ? 'VERIFIED' : 'NOT_CONFIGURED',
            detail:
              scenario === 'ACTIVE'
                ? '仅为开发期的已验证状态投影样例；不是实际支付记录。'
                : '当前环境未配置支付 Provider，不能创建订单或扣款。',
          },
    paymentProviders: [],
    history: [],
    actions: {
      checkout: 'NOT_CONFIGURED',
      redemption: 'NOT_CONFIGURED',
      simulator: true,
    },
  };
}

function isExpiredAt(value: string | null, now: number = Date.now()): boolean {
  if (value === null) return false;
  const time = Date.parse(value);
  return Number.isFinite(time) && time <= now;
}

function capabilityLabel(code: string): string {
  return capabilityLabels[code] ?? code;
}

function mapServerPlan(plan: SdkMembershipPlan): MembershipPlanPresentation {
  const frozen = membershipPlans.find((candidate) => candidate.code === plan.code);
  return {
    code: plan.code,
    label: frozen?.label ?? plan.name,
    amountFen: plan.amountFen,
    priceLabel:
      plan.code === 'FREE'
        ? formatCnyFen(plan.amountFen)
        : `${formatCnyFen(plan.amountFen)}/月`,
    summary: frozen?.summary ?? plan.name,
    additions:
      plan.entitlementCodes.length === 0
        ? ['服务端尚未返回可展示权益']
        : plan.entitlementCodes.map((code) => capabilityLabel(code)),
    ...(plan.code === 'PRO_MAX' ? { featured: true } : {}),
  };
}

function mapServerBenefit(benefit: SdkMembershipBenefitGrant): MembershipBenefitView {
  const expired = benefit.revokedAt !== null || isExpiredAt(benefit.endsAt);
  const upcoming = !expired && Date.parse(benefit.startsAt) > Date.now();
  const labels: Readonly<Record<SdkMembershipBenefitGrant['type'], string>> = {
    MEMBERSHIP_DAYS: '会员天数奖励',
    TEMP_ENTITLEMENT: '临时权益',
    STORAGE_BYTES: '额外媒体存储',
    COUPON: '优惠券权益',
    BADGE: '个人徽章',
    FEATURE_ACCESS: '功能访问权益',
  };
  const quantities: readonly string[] = [
    benefit.membershipDays === null ? '' : `${benefit.membershipDays} 天`,
    benefit.storageBytes === null ? '' : formatBytes(benefit.storageBytes),
    benefit.capability === null ? '' : capabilityLabel(benefit.capability),
  ].filter((value) => value.length > 0);
  return {
    id: benefit.id,
    title: labels[benefit.type],
    detail:
      quantities.length === 0
        ? '由服务端授予并保留完整审计记录。'
        : `由服务端授予：${quantities.join(' · ')}。`,
    type: benefit.type,
    state: expired ? 'EXPIRED' : upcoming ? 'AVAILABLE' : 'ACTIVE',
    expiresAt: benefit.endsAt,
  };
}

function mapServerCoupon(coupon: SdkMembershipCoupon): MembershipCouponView {
  return {
    id: coupon.id,
    title: '服务端优惠券',
    detail:
      coupon.status === 'ACTIVE'
        ? '金额、适用方案和使用次数由服务端在 checkout 时验证。'
        : '当前不可用于结算。',
    state: coupon.status === 'ACTIVE' ? 'AVAILABLE' : 'EXPIRED',
    expiresAt: coupon.endsAt,
    codeHint: null,
  };
}

function mapServerRedemption(
  redemption: SdkMembershipRedemption,
): MembershipRedemptionView {
  return {
    id: redemption.id,
    title: redemption.orderId === null ? '兑换记录' : '订单关联兑换记录',
    detail: '已由服务端处理；不会在浏览器中重复兑现。',
    state: 'USED',
    redeemedAt: redemption.redeemedAt,
  };
}

function mapServerOrderStatus(
  status: SdkMembershipOrder['status'],
): MembershipOrderStatus {
  if (status === 'CLOSED') return 'CANCELLED';
  return status;
}

function mapServerOrder(orderRecord: SdkMembershipOrder): MembershipOrderView {
  return {
    id: orderRecord.id,
    orderNo: orderRecord.orderNo,
    planCode: orderRecord.planCode,
    baseAmountFen: orderRecord.baseAmountFen,
    discountAmountFen: orderRecord.discountAmountFen,
    payableAmountFen: orderRecord.payableAmountFen,
    currency: orderRecord.currency,
    status: mapServerOrderStatus(orderRecord.status),
    createdAt: orderRecord.createdAt,
    expiresAt: orderRecord.expiresAt,
    paidAt: orderRecord.paidAt,
  };
}

function mapServerPaymentProvider(
  provider: SdkMembershipPaymentProviderAvailability,
): MembershipPaymentProviderView {
  const labels: Readonly<
    Record<SdkMembershipPaymentProviderAvailability['provider'], string>
  > = {
    WECHAT_PAY: '微信支付',
    ALIPAY: '支付宝',
    UNIONPAY: '银联支付',
    APPLE_IAP: 'Apple IAP',
    MOCK: '开发模拟支付',
  };
  return {
    provider: provider.provider,
    label: labels[provider.provider],
    checkoutAvailable: provider.checkoutAvailable,
    callbackVerificationAvailable: provider.callbackVerificationAvailable,
    readiness: provider.readiness,
  };
}

function mapServerHistory(event: SdkMembershipHistoryEvent): MembershipHistoryView {
  const labels: Readonly<Record<SdkMembershipHistoryEvent['event'], string>> = {
    CREATED: '会员记录已创建',
    ACTIVATED: '会员权益已生效',
    EXTENDED: '会员有效期已延长',
    EXPIRED: '会员已到期',
    REVOKED: '会员权益已撤销',
    CANCELLED: '会员已取消',
  };
  return {
    id: event.id,
    title: labels[event.event],
    occurredAt: event.occurredAt,
  };
}

function mapServerSnapshot(input: {
  readonly overview: SdkMembershipCenter;
  readonly plans: readonly SdkMembershipPlan[];
  readonly paymentProviders: readonly SdkMembershipPaymentProviderAvailability[];
  readonly history: readonly SdkMembershipHistoryEvent[];
  readonly benefits: readonly SdkMembershipBenefitGrant[];
  readonly coupons: readonly SdkMembershipCoupon[];
  readonly redemptions: readonly SdkMembershipRedemption[];
  readonly orders: readonly SdkMembershipOrder[];
}): MembershipCenterSnapshot {
  const currentMembership = input.overview.currentMembership;
  const membershipStatus: MembershipStatus =
    currentMembership?.status === 'ACTIVE'
      ? 'ACTIVE'
      : currentMembership?.status === 'EXPIRED'
        ? 'EXPIRED'
        : 'FREE';
  const orders = input.orders.map(mapServerOrder);
  const latestOrder = orders[0];
  const payment: MembershipPaymentView =
    latestOrder?.status === 'PENDING_PAYMENT' || latestOrder?.status === 'CREATED'
      ? {
          state: 'PENDING',
          detail: '正在确认支付结果。未收到服务端验证前，不会开通任何高级权益。',
        }
      : latestOrder?.status === 'FAILED' || latestOrder?.status === 'CANCELLED'
        ? {
            state: 'FAILED',
            detail: '最近订单未被服务端确认开通；浏览器不能修改这一结果。',
          }
        : latestOrder?.status === 'PAID' || latestOrder?.status === 'FULFILLED'
          ? {
              state: 'VERIFIED',
              detail: '订单状态来自服务端投影；支付回调不会暴露给浏览器。',
            }
          : {
              state: 'NOT_CONFIGURED',
              detail: '当前没有可展示的支付确认状态。',
            };
  return {
    source: 'SERVER',
    serverConfirmed: true,
    plans: input.plans.map(mapServerPlan),
    membership: {
      planCode: input.overview.effectivePlanCode,
      status: membershipStatus,
      startsAt: currentMembership?.startsAt ?? null,
      expiresAt: currentMembership?.expiresAt ?? null,
      autoRenewing: false,
      entitlements: input.overview.entitlements.map((entry) => ({
        code: entry.code,
        label: capabilityLabel(entry.code),
        state:
          entry.revokedAt !== null || isExpiredAt(entry.endsAt) ? 'EXPIRED' : 'ACTIVE',
        expiresAt: entry.endsAt,
      })),
    },
    benefits: input.benefits.map(mapServerBenefit),
    coupons: input.coupons.map(mapServerCoupon),
    redemptions: input.redemptions.map(mapServerRedemption),
    storage: {
      usedBytes: input.overview.storage.usedBytes,
      limitBytes: input.overview.storage.totalBytes,
      state: input.overview.storage.state,
      detail:
        input.overview.storage.state === 'OVER_QUOTA'
          ? '存储额度变化不会删除现有媒体；你仍可查看、下载、删除或整理，但新的超额上传会被限制。'
          : '额度由基础存储、计划存储、福利及手动授予额度合并计算。',
    },
    orders,
    payment,
    paymentProviders: input.paymentProviders
      // Mock providers are only meaningful in development. They never create an
      // order here, and a production response cannot make one visible.
      .filter((provider) => provider.provider !== 'MOCK' || import.meta.env.DEV)
      .map(mapServerPaymentProvider),
    history: input.history.map(mapServerHistory),
    actions: {
      // Provider availability is display-only until a safe Web checkout flow is
      // separately implemented. Do not turn a capability projection into a
      // client-side payment/order action.
      checkout: 'NOT_CONFIGURED',
      redemption: 'NOT_CONFIGURED',
      simulator: false,
    },
  };
}

/**
 * The browser only maps a server-approved Membership SDK projection. A failed
 * or incomplete multi-read result fails closed rather than combining stale
 * local data with a partial server response.
 */
export class ApiMembershipCenterAdapter implements MembershipCenterAdapter {
  constructor(private readonly sdk: MembershipSdk) {}

  async getSnapshot(): Promise<MembershipCenterReadResult> {
    try {
      const [
        overview,
        plans,
        paymentProviders,
        history,
        benefits,
        coupons,
        redemptions,
        orders,
      ] = await Promise.all([
        this.sdk.getOverview(),
        this.sdk.listPlans(),
        this.sdk.listPaymentProviders(),
        this.sdk.listHistory(),
        this.sdk.listBenefits(),
        this.sdk.listCoupons(),
        this.sdk.listRedemptions(),
        this.sdk.listOrders(),
      ]);
      if (
        'error' in overview ||
        'error' in plans ||
        'error' in paymentProviders ||
        'error' in history ||
        'error' in benefits ||
        'error' in coupons ||
        'error' in redemptions ||
        'error' in orders
      ) {
        return {
          kind: 'UNAVAILABLE',
          message: '会员服务暂时不可用；不会以局部、本地或旧状态替代服务端确认结果。',
        };
      }
      return {
        kind: 'AVAILABLE',
        snapshot: mapServerSnapshot({
          overview: overview.data,
          plans: plans.data,
          paymentProviders: paymentProviders.data,
          history: history.data,
          benefits: benefits.data,
          coupons: coupons.data,
          redemptions: redemptions.data,
          orders: orders.data,
        }),
      };
    } catch {
      return {
        kind: 'UNAVAILABLE',
        message: '会员服务暂时不可用；当前不会显示本地订单、支付结果或权益授权。',
      };
    }
  }
}

/** Development-only synthetic read model. It has no payment or account authority. */
export class MockDevMembershipCenterAdapter implements MembershipCenterAdapter {
  async getSnapshot(
    previewScenario: MembershipPreviewScenario = 'ACTIVE',
  ): Promise<MembershipCenterReadResult> {
    return {
      kind: 'AVAILABLE',
      snapshot: snapshotForScenario(previewScenario),
    };
  }
}

/** Production fallback: do not invent a plan, benefit, payment, or checkout result. */
export class UnavailableMembershipCenterAdapter implements MembershipCenterAdapter {
  async getSnapshot(): Promise<MembershipCenterReadResult> {
    return {
      kind: 'UNAVAILABLE',
      message: '会员服务尚未连接到服务端确认投影；当前不会展示或创建本地订单。',
    };
  }
}

/**
 * The Membership SDK is selected only when the Web app is explicitly pointed
 * at its server API.  A configured API always wins, including in development;
 * the synthetic fixture remains a local visual aid only when no API endpoint
 * has been supplied.  Production without the endpoint fails closed.
 */
export function createRuntimeMembershipCenterAdapter(
  apiBaseUrl: string | undefined = import.meta.env.VITE_MEZIP_MEMBERSHIP_API_BASE_URL,
): MembershipCenterAdapter {
  const baseUrl = apiBaseUrl?.trim();
  if (baseUrl !== undefined && baseUrl.length > 0) {
    return new ApiMembershipCenterAdapter(
      createMeZipSdk(new FetchMessagingTransport({ baseUrl })).membership,
    );
  }
  return import.meta.env.DEV
    ? new MockDevMembershipCenterAdapter()
    : new UnavailableMembershipCenterAdapter();
}

export const membershipCenterAdapter: MembershipCenterAdapter =
  createRuntimeMembershipCenterAdapter();

/**
 * Preview state is never forwarded to a production adapter. It exists only
 * while Vite is in development and only changes the local synthetic fixture.
 */
export function readMembershipCenterPreview(
  previewScenario: MembershipPreviewScenario,
): Promise<MembershipCenterReadResult> {
  if (membershipCenterAdapter instanceof MockDevMembershipCenterAdapter) {
    return membershipCenterAdapter.getSnapshot(previewScenario);
  }
  return membershipCenterAdapter.getSnapshot();
}

export function canUseMembershipSimulator(): boolean {
  return import.meta.env.DEV;
}

export function formatCnyFen(amountFen: number): string {
  if (!Number.isSafeInteger(amountFen) || amountFen < 0) return '金额待服务端确认';
  const yuan = Math.trunc(amountFen / 100);
  const fen = amountFen % 100;
  return fen === 0 ? `¥${yuan}` : `¥${yuan}.${fen.toString().padStart(2, '0')}`;
}

export function formatBytes(bytes: number): string {
  if (!Number.isSafeInteger(bytes) || bytes < 0) return '待服务端确认';
  const gigabytes = bytes / 1_073_741_824;
  return `${gigabytes.toFixed(gigabytes >= 10 ? 0 : 1)} GB`;
}

export function planLabel(planCode: MembershipPlanCode): string {
  return membershipPlans.find((plan) => plan.code === planCode)?.label ?? planCode;
}

export const membershipPreviewScenarios: readonly {
  readonly code: MembershipPreviewScenario;
  readonly label: string;
}[] = [
  { code: 'ACTIVE', label: '已确认投影样例' },
  { code: 'PENDING_PAYMENT', label: '支付确认中' },
  { code: 'PAYMENT_FAILED', label: '支付失败' },
  { code: 'EXPIRED', label: '会员到期' },
  { code: 'OVER_QUOTA', label: '存储超额' },
] as const;

/** Compile-time guard: all display plans retain the frozen integer-fen catalog. */
export const membershipPlanCatalog = membershipPlanCodes.map((code) => {
  const plan = membershipPlans.find((candidate) => candidate.code === code);
  if (plan === undefined)
    throw new Error(`Missing membership presentation plan: ${code}`);
  return plan;
});
