import {
  createHash,
  createHmac,
  randomBytes,
  randomUUID,
  timingSafeEqual,
} from 'node:crypto';

import {
  membershipPriceFen,
  planCapabilities,
  type AuthenticatedPrincipal,
  type CapabilityCode,
  type CampaignAudience,
  type FounderAudience,
  type CampaignStatus,
  type BillingEnvironment,
  type BillingPlatform,
  type CouponDiscountKind,
  type Membership,
  type MembershipAdminCapabilityCode,
  type MembershipBenefitGrant,
  type MembershipCampaign,
  type MembershipCampaignBenefit,
  type MembershipCampaignClaim,
  type MembershipCenter,
  type MembershipCheckout,
  type MembershipCoupon,
  type MembershipEntitlement,
  type MembershipHistoryEvent,
  type MembershipOrder,
  type MembershipPayment,
  type MembershipPaymentProviderAvailability,
  type MembershipPlan,
  type MembershipRedemptionCode,
  type MembershipRefund,
  type MembershipRedemption,
  type MembershipSource,
  type MembershipStorageQuota,
  type MembershipSimulationContext,
  type PaymentProviderCode,
  type PaymentProviderReadiness,
  type PlanCode,
} from '@me-zip/shared-types';

import type {
  CreatePaymentInput,
  CreatePaymentResult,
  PaymentProvider,
  ProviderPaymentStatus,
  ProviderRefundStatus,
  QueryPaymentInput,
  QueryRefundInput,
  RefundPaymentInput,
  RefundPaymentResult,
  VerifiedPaymentCallback,
  VerifyCallbackInput,
} from './index.js';
import {
  MembershipDurableIdempotencyConflictError,
  toMembershipDurableBenefitGrantRow,
  toMembershipDurableMembershipRow,
  toMembershipDurableOrderRow,
  toMembershipDurablePaymentEventRow,
  toMembershipDurablePaymentRow,
  type MembershipDurableRepository,
  type MembershipDurableWriteResult,
} from './persistence.js';

export type MembershipErrorCode =
  | 'FORBIDDEN'
  | 'NOT_FOUND'
  | 'VALIDATION'
  | 'CONFLICT'
  | 'IDEMPOTENCY_REPLAY'
  | 'RATE_LIMITED'
  | 'ORDER_EXPIRED'
  | 'ORDER_NOT_PAYABLE'
  | 'PAYMENT_NOT_VERIFIED'
  | 'PAYMENT_AMOUNT_MISMATCH'
  | 'PAYMENT_PLAN_MISMATCH'
  | 'PAYMENT_CURRENCY_MISMATCH'
  | 'PAYMENT_PROVIDER_MISMATCH'
  | 'PAYMENT_REPLAY'
  | 'COUPON_INVALID'
  | 'COUPON_ALREADY_USED'
  | 'REDEMPTION_INVALID'
  | 'REDEMPTION_ALREADY_USED'
  | 'UPGRADE_POLICY_REQUIRED'
  | 'PROVIDER_UNAVAILABLE';

export class MembershipError extends Error {
  public constructor(
    public readonly code: MembershipErrorCode,
    message: string,
  ) {
    super(message);
    this.name = 'MembershipError';
  }
}

export interface MembershipRuntime {
  readonly now: () => string;
  readonly id: () => string;
  readonly randomCodeBytes: (size: number) => Uint8Array;
}

const runtimeDefaults: MembershipRuntime = {
  now: () => new Date().toISOString(),
  id: randomUUID,
  randomCodeBytes: randomBytes,
};

const clone = <T>(value: T): T => structuredClone(value);
const planOrder: readonly PlanCode[] = ['FREE', 'GO', 'PLUS', 'PRO', 'PRO_MAX'];
const isPaidPlanCode = (value: string): value is Exclude<PlanCode, 'FREE'> =>
  value !== 'FREE' && (planOrder as readonly string[]).includes(value);
const membershipDurationDays = 30;
const defaultBaseStorageBytes = 50 * 1024 * 1024;
const defaultOrderLifetimeMs = 30 * 60 * 1_000;

export const officialMembershipPlans: readonly MembershipPlan[] = [
  { code: 'FREE', name: 'FREE', amountFen: 0, currency: 'CNY', durationDays: null, renewalMode: 'NON_AUTO_RENEWING_MONTHLY_PASS', entitlementCodes: planCapabilities.FREE },
  { code: 'GO', name: 'GO · 社区通行证', amountFen: membershipPriceFen.GO, currency: 'CNY', durationDays: membershipDurationDays, renewalMode: 'NON_AUTO_RENEWING_MONTHLY_PASS', entitlementCodes: planCapabilities.GO },
  { code: 'PLUS', name: 'PLUS · 深度交流', amountFen: membershipPriceFen.PLUS, currency: 'CNY', durationDays: membershipDurationDays, renewalMode: 'NON_AUTO_RENEWING_MONTHLY_PASS', entitlementCodes: planCapabilities.PLUS },
  { code: 'PRO', name: 'PRO · 创始人圈层', amountFen: membershipPriceFen.PRO, currency: 'CNY', durationDays: membershipDurationDays, renewalMode: 'NON_AUTO_RENEWING_MONTHLY_PASS', entitlementCodes: planCapabilities.PRO },
  { code: 'PRO_MAX', name: 'PRO MAX · 创作者实验室', amountFen: membershipPriceFen.PRO_MAX, currency: 'CNY', durationDays: membershipDurationDays, renewalMode: 'NON_AUTO_RENEWING_MONTHLY_PASS', entitlementCodes: planCapabilities.PRO_MAX },
] as const;

export function getOfficialMembershipPlan(planCode: PlanCode): MembershipPlan {
  const plan = officialMembershipPlans.find((candidate) => candidate.code === planCode);
  if (plan === undefined) throw new MembershipError('VALIDATION', 'The requested membership plan is not available.');
  return clone(plan);
}

export function calculateCouponDiscount(
  coupon: Pick<MembershipCoupon, 'discountKind' | 'discountValue'>,
  baseAmountFen: number,
): number {
  if (!Number.isSafeInteger(baseAmountFen) || baseAmountFen < 0) {
    throw new MembershipError('VALIDATION', 'A server price must be a non-negative integer fen amount.');
  }
  if (coupon.discountKind === 'FIXED_FEN') return Math.min(baseAmountFen, coupon.discountValue);
  return Math.min(baseAmountFen, Math.floor((baseAmountFen * coupon.discountValue) / 100));
}

function planRank(planCode: PlanCode): number {
  return planOrder.indexOf(planCode);
}

function activeAt(startsAt: string, endsAt: string | null, revokedAt: string | null, nowMs: number): boolean {
  return revokedAt === null && Date.parse(startsAt) <= nowMs && (endsAt === null || nowMs < Date.parse(endsAt));
}

function addMonthlyPass(startAt: string): string {
  const date = new Date(startAt);
  date.setUTCMonth(date.getUTCMonth() + 1);
  return date.toISOString();
}

function addDays(startAt: string, days: number): string {
  const date = new Date(startAt);
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString();
}

function assertIdempotencyKey(value: string | undefined): string {
  if (value === undefined || value.trim().length < 8 || value.length > 200) {
    throw new MembershipError('VALIDATION', 'An idempotency key is required.');
  }
  return value.trim();
}

function normalizeCode(value: string): string {
  return value.trim().toUpperCase();
}

function hashRedemptionCode(value: string): string {
  return createHash('sha256').update(normalizeCode(value)).digest('hex');
}

function sameSignature(expected: string, actual: string): boolean {
  const left = Buffer.from(expected, 'utf8');
  const right = Buffer.from(actual, 'utf8');
  return left.length === right.length && timingSafeEqual(left, right);
}

function requestHeader(headers: Readonly<Record<string, string>>, name: string): string | undefined {
  const target = name.toLowerCase();
  return Object.entries(headers).find(([key]) => key.toLowerCase() === target)?.[1];
}

// ---------------------------------------------------------------------------
// Provider adapters
// ---------------------------------------------------------------------------

export interface WeChatPayConfig {
  readonly appId: string;
  readonly merchantId: string;
  readonly merchantSerialNo: string;
  readonly apiV3Key: string;
  readonly privateKeyPem: string;
  readonly notifyUrl: string;
}

export interface WeChatPayGateway {
  createPayment(input: CreatePaymentInput): Promise<CreatePaymentResult>;
  queryPayment(input: QueryPaymentInput): Promise<ProviderPaymentStatus>;
  closePayment(input: { readonly providerPaymentId: string }): Promise<void>;
  refundPayment(input: RefundPaymentInput): Promise<RefundPaymentResult>;
  queryRefund(input: QueryRefundInput): Promise<ProviderRefundStatus>;
}

export interface WeChatPayVerifiedEvent extends VerifiedPaymentCallback {
  readonly merchantId: string;
  readonly appId: string;
}

export interface WeChatPayCallbackVerifier {
  verify(input: VerifyCallbackInput): Promise<WeChatPayVerifiedEvent>;
}

export interface MembershipProviderAvailabilityInspectable {
  getMembershipAvailability(): Pick<MembershipPaymentProviderAvailability, 'checkoutAvailable' | 'callbackVerificationAvailable' | 'readiness'>;
}

/** Server-side only platform allow-list. A request body never selects a
 * platform: the HTTP/native host supplies trusted transport context. */
export interface BillingPlatformResolver {
  providersFor(platform: BillingPlatform): readonly PaymentProviderCode[];
}

export class StaticBillingPlatformResolver implements BillingPlatformResolver {
  public constructor(
    private readonly providersByPlatform: Readonly<Partial<Record<BillingPlatform, readonly PaymentProviderCode[]>>>,
  ) {}

  public providersFor(platform: BillingPlatform): readonly PaymentProviderCode[] {
    return this.providersByPlatform[platform] ?? [];
  }
}

export function validateWeChatPayConfig(config: WeChatPayConfig): void {
  const required: readonly [string, string][] = [
    ['appId', config.appId],
    ['merchantId', config.merchantId],
    ['merchantSerialNo', config.merchantSerialNo],
    ['apiV3Key', config.apiV3Key],
    ['privateKeyPem', config.privateKeyPem],
    ['notifyUrl', config.notifyUrl],
  ];
  if (required.some(([, value]) => value.trim() === '')) {
    throw new MembershipError('PROVIDER_UNAVAILABLE', 'WeChat Pay configuration is incomplete.');
  }
  if (!/^https:\/\//u.test(config.notifyUrl)) {
    throw new MembershipError('VALIDATION', 'The WeChat Pay callback URL must use HTTPS.');
  }
}

/** Production transport is injected. This adapter never embeds merchant
 * credentials, certificates, tokens, or a network SDK in client code. */
export class WeChatPaymentProvider implements PaymentProvider, MembershipProviderAvailabilityInspectable {
  public readonly provider = 'WECHAT_PAY' as const;

  public constructor(
    private readonly config: WeChatPayConfig,
    private readonly gateway: WeChatPayGateway | undefined,
    private readonly callbackVerifier: WeChatPayCallbackVerifier | undefined,
  ) {
    validateWeChatPayConfig(config);
  }

  public async createPayment(input: CreatePaymentInput): Promise<CreatePaymentResult> {
    if (this.gateway === undefined) throw new MembershipError('PROVIDER_UNAVAILABLE', 'WeChat Pay is not connected in this environment.');
    return this.gateway.createPayment(input);
  }

  public getMembershipAvailability(): Pick<MembershipPaymentProviderAvailability, 'checkoutAvailable' | 'callbackVerificationAvailable' | 'readiness'> {
    return {
      checkoutAvailable: this.gateway !== undefined,
      callbackVerificationAvailable: this.callbackVerifier !== undefined,
      readiness:
        this.gateway !== undefined && this.callbackVerifier !== undefined
          ? 'READY'
          : 'NOT_CONFIGURED',
    };
  }

  public async queryPayment(input: QueryPaymentInput): Promise<ProviderPaymentStatus> {
    if (this.gateway === undefined) throw new MembershipError('PROVIDER_UNAVAILABLE', 'WeChat Pay is not connected in this environment.');
    return this.gateway.queryPayment(input);
  }

  public async verifyCallback(input: VerifyCallbackInput): Promise<VerifiedPaymentCallback> {
    if (this.callbackVerifier === undefined) throw new MembershipError('PROVIDER_UNAVAILABLE', 'WeChat Pay callback verification is not configured.');
    const event = await this.callbackVerifier.verify(input);
    if (event.merchantId !== this.config.merchantId || event.appId !== this.config.appId) {
      throw new MembershipError('PAYMENT_NOT_VERIFIED', 'The callback merchant context does not match this server.');
    }
    return {
      providerTransactionId: event.providerTransactionId,
      orderId: event.orderId,
      amountFen: event.amountFen,
      currency: event.currency,
      paidAt: event.paidAt,
    };
  }

  public async closePayment(input: { readonly providerPaymentId: string }): Promise<void> {
    if (this.gateway === undefined) throw new MembershipError('PROVIDER_UNAVAILABLE', 'WeChat Pay is not connected in this environment.');
    await this.gateway.closePayment(input);
  }

  public async refundPayment(input: RefundPaymentInput): Promise<RefundPaymentResult> {
    if (this.gateway === undefined) throw new MembershipError('PROVIDER_UNAVAILABLE', 'WeChat Pay is not connected in this environment.');
    return this.gateway.refundPayment(input);
  }

  public async queryRefund(input: QueryRefundInput): Promise<ProviderRefundStatus> {
    if (this.gateway === undefined) throw new MembershipError('PROVIDER_UNAVAILABLE', 'WeChat Pay is not connected in this environment.');
    return this.gateway.queryRefund(input);
  }
}

/**
 * Alipay server boundary. The concrete official gateway and signature
 * verifier are injected by production composition. This class deliberately
 * owns no merchant credential transport and fails closed while unconfigured.
 */
export interface AlipayConfig {
  readonly appId: string;
  readonly merchantId: string;
  readonly appPrivateKeyPem: string;
  readonly alipayPublicKeyPem: string;
  readonly notifyUrl: string;
}

export interface AlipayGateway {
  createPayment(input: CreatePaymentInput): Promise<CreatePaymentResult>;
  queryPayment(input: QueryPaymentInput): Promise<ProviderPaymentStatus>;
  closePayment(input: { readonly providerPaymentId: string }): Promise<void>;
  refundPayment(input: RefundPaymentInput): Promise<RefundPaymentResult>;
  queryRefund(input: QueryRefundInput): Promise<ProviderRefundStatus>;
}

export interface AlipayVerifiedEvent extends VerifiedPaymentCallback {
  readonly appId: string;
  readonly merchantId: string;
}

export interface AlipayCallbackVerifier {
  verify(input: VerifyCallbackInput): Promise<AlipayVerifiedEvent>;
}

export function validateAlipayConfig(config: AlipayConfig): void {
  const required: readonly [string, string][] = [
    ['appId', config.appId],
    ['merchantId', config.merchantId],
    ['appPrivateKeyPem', config.appPrivateKeyPem],
    ['alipayPublicKeyPem', config.alipayPublicKeyPem],
    ['notifyUrl', config.notifyUrl],
  ];
  if (required.some(([, value]) => value.trim() === '')) {
    throw new MembershipError('PROVIDER_UNAVAILABLE', 'Alipay configuration is incomplete.');
  }
  if (!/^https:\/\//u.test(config.notifyUrl)) {
    throw new MembershipError('VALIDATION', 'The Alipay callback URL must use HTTPS.');
  }
}

export class AlipayPaymentProvider implements PaymentProvider, MembershipProviderAvailabilityInspectable {
  public readonly provider = 'ALIPAY' as const;

  public constructor(
    private readonly config: AlipayConfig,
    private readonly gateway: AlipayGateway | undefined,
    private readonly callbackVerifier: AlipayCallbackVerifier | undefined,
  ) {
    validateAlipayConfig(config);
  }

  public getMembershipAvailability(): Pick<MembershipPaymentProviderAvailability, 'checkoutAvailable' | 'callbackVerificationAvailable' | 'readiness'> {
    return {
      checkoutAvailable: this.gateway !== undefined,
      callbackVerificationAvailable: this.callbackVerifier !== undefined,
      readiness:
        this.gateway !== undefined && this.callbackVerifier !== undefined
          ? 'READY'
          : 'NOT_CONFIGURED',
    };
  }

  public async createPayment(input: CreatePaymentInput): Promise<CreatePaymentResult> {
    if (this.gateway === undefined) throw new MembershipError('PROVIDER_UNAVAILABLE', 'Alipay is not connected in this environment.');
    return this.gateway.createPayment(input);
  }

  public async queryPayment(input: QueryPaymentInput): Promise<ProviderPaymentStatus> {
    if (this.gateway === undefined) throw new MembershipError('PROVIDER_UNAVAILABLE', 'Alipay is not connected in this environment.');
    return this.gateway.queryPayment(input);
  }

  public async verifyCallback(input: VerifyCallbackInput): Promise<VerifiedPaymentCallback> {
    if (this.callbackVerifier === undefined) throw new MembershipError('PROVIDER_UNAVAILABLE', 'Alipay callback verification is not configured.');
    const event = await this.callbackVerifier.verify(input);
    if (event.appId !== this.config.appId || event.merchantId !== this.config.merchantId) {
      throw new MembershipError('PAYMENT_NOT_VERIFIED', 'The callback merchant context does not match this server.');
    }
    return {
      providerTransactionId: event.providerTransactionId,
      orderId: event.orderId,
      amountFen: event.amountFen,
      currency: event.currency,
      paidAt: event.paidAt,
    };
  }

  public async closePayment(input: { readonly providerPaymentId: string }): Promise<void> {
    if (this.gateway === undefined) throw new MembershipError('PROVIDER_UNAVAILABLE', 'Alipay is not connected in this environment.');
    await this.gateway.closePayment(input);
  }

  public async refundPayment(input: RefundPaymentInput): Promise<RefundPaymentResult> {
    if (this.gateway === undefined) throw new MembershipError('PROVIDER_UNAVAILABLE', 'Alipay is not connected in this environment.');
    return this.gateway.refundPayment(input);
  }

  public async queryRefund(input: QueryRefundInput): Promise<ProviderRefundStatus> {
    if (this.gateway === undefined) throw new MembershipError('PROVIDER_UNAVAILABLE', 'Alipay is not connected in this environment.');
    return this.gateway.queryRefund(input);
  }
}

/** StoreKit foundation. The actual transaction verifier is a server-only
 * official Apple integration supplied at deployment. `productIds` is the
 * trusted product registry, so a client-provided plan can never choose an
 * entitlement tier. */
export interface AppleIapConfig {
  readonly bundleId: string;
  readonly issuerId: string;
  readonly keyId: string;
  readonly privateKeyPem: string;
  readonly productIds: Readonly<Record<Exclude<PlanCode, 'FREE'>, string>>;
}

export interface AppleIapGateway {
  createPayment(input: CreatePaymentInput & { readonly productId: string }): Promise<CreatePaymentResult>;
  queryPayment(input: QueryPaymentInput): Promise<ProviderPaymentStatus>;
  closePayment(input: { readonly providerPaymentId: string }): Promise<void>;
  refundPayment(input: RefundPaymentInput): Promise<RefundPaymentResult>;
  queryRefund(input: QueryRefundInput): Promise<ProviderRefundStatus>;
}

export interface AppleIapVerifiedEvent extends VerifiedPaymentCallback {
  readonly bundleId: string;
  readonly productId: string;
}

export interface AppleIapTransactionVerifier {
  verify(input: VerifyCallbackInput): Promise<AppleIapVerifiedEvent>;
}

export function validateAppleIapConfig(config: AppleIapConfig): void {
  const required: readonly [string, string][] = [
    ['bundleId', config.bundleId],
    ['issuerId', config.issuerId],
    ['keyId', config.keyId],
    ['privateKeyPem', config.privateKeyPem],
    ...Object.entries(config.productIds),
  ];
  if (required.some(([, value]) => value.trim() === '')) {
    throw new MembershipError('PROVIDER_UNAVAILABLE', 'Apple IAP configuration is incomplete.');
  }
}

export class AppleIapPaymentProvider implements PaymentProvider, MembershipProviderAvailabilityInspectable {
  public readonly provider = 'APPLE_IAP' as const;

  public constructor(
    private readonly config: AppleIapConfig,
    private readonly gateway: AppleIapGateway | undefined,
    private readonly transactionVerifier: AppleIapTransactionVerifier | undefined,
  ) {
    validateAppleIapConfig(config);
  }

  public getMembershipAvailability(): Pick<MembershipPaymentProviderAvailability, 'checkoutAvailable' | 'callbackVerificationAvailable' | 'readiness'> {
    return {
      checkoutAvailable: this.gateway !== undefined,
      callbackVerificationAvailable: this.transactionVerifier !== undefined,
      readiness:
        this.gateway !== undefined && this.transactionVerifier !== undefined
          ? 'READY'
          : 'NOT_CONFIGURED',
    };
  }

  public async createPayment(input: CreatePaymentInput): Promise<CreatePaymentResult> {
    if (this.gateway === undefined) throw new MembershipError('PROVIDER_UNAVAILABLE', 'Apple IAP is not connected in this environment.');
    if (input.planCode === undefined) throw new MembershipError('VALIDATION', 'The Apple IAP order is missing its server product mapping.');
    return this.gateway.createPayment({ ...input, productId: this.config.productIds[input.planCode] });
  }

  public async queryPayment(input: QueryPaymentInput): Promise<ProviderPaymentStatus> {
    if (this.gateway === undefined) throw new MembershipError('PROVIDER_UNAVAILABLE', 'Apple IAP is not connected in this environment.');
    return this.gateway.queryPayment(input);
  }

  public async verifyCallback(input: VerifyCallbackInput): Promise<VerifiedPaymentCallback> {
    if (this.transactionVerifier === undefined) throw new MembershipError('PROVIDER_UNAVAILABLE', 'Apple transaction verification is not configured.');
    const event = await this.transactionVerifier.verify(input);
    if (event.bundleId !== this.config.bundleId || !Object.values(this.config.productIds).includes(event.productId)) {
      throw new MembershipError('PAYMENT_NOT_VERIFIED', 'The Apple transaction does not match this server product registry.');
    }
    const planCode = Object.entries(this.config.productIds).find(([, productId]) => productId === event.productId)?.[0];
    if (planCode === undefined || !isPaidPlanCode(planCode)) {
      throw new MembershipError('PAYMENT_NOT_VERIFIED', 'The Apple transaction product cannot be mapped to a paid server plan.');
    }
    return {
      providerTransactionId: event.providerTransactionId,
      orderId: event.orderId,
      planCode,
      amountFen: event.amountFen,
      currency: event.currency,
      paidAt: event.paidAt,
    };
  }

  public async closePayment(input: { readonly providerPaymentId: string }): Promise<void> {
    if (this.gateway === undefined) throw new MembershipError('PROVIDER_UNAVAILABLE', 'Apple IAP is not connected in this environment.');
    await this.gateway.closePayment(input);
  }

  public async refundPayment(input: RefundPaymentInput): Promise<RefundPaymentResult> {
    if (this.gateway === undefined) throw new MembershipError('PROVIDER_UNAVAILABLE', 'Apple IAP is not connected in this environment.');
    return this.gateway.refundPayment(input);
  }

  public async queryRefund(input: QueryRefundInput): Promise<ProviderRefundStatus> {
    if (this.gateway === undefined) throw new MembershipError('PROVIDER_UNAVAILABLE', 'Apple IAP is not connected in this environment.');
    return this.gateway.queryRefund(input);
  }
}

export interface FakePaymentProviderOptions {
  readonly signingSecret: string;
  readonly now?: () => string;
}

/** Local-only provider for deterministic callback, replay and recovery tests. */
export class FakePaymentProvider implements PaymentProvider, MembershipProviderAvailabilityInspectable {
  public readonly provider = 'MOCK' as const;
  private readonly paymentsByOrder = new Map<string, CreatePaymentResult>();
  private readonly paymentInputs = new Map<string, CreatePaymentInput>();
  private readonly now: () => string;

  public constructor(private readonly options: FakePaymentProviderOptions) {
    if (options.signingSecret.trim().length < 16) {
      throw new MembershipError('VALIDATION', 'The fake provider signing secret must be at least 16 characters.');
    }
    this.now = options.now ?? (() => new Date().toISOString());
  }

  public async createPayment(input: CreatePaymentInput): Promise<CreatePaymentResult> {
    const existing = this.paymentsByOrder.get(input.orderId);
    if (existing !== undefined) return clone(existing);
    const result: CreatePaymentResult = {
      providerPaymentId: `mock-pay-${input.orderId}`,
      clientPayload: { provider: 'MOCK', orderId: input.orderId },
    };
    this.paymentsByOrder.set(input.orderId, result);
    this.paymentInputs.set(result.providerPaymentId, clone(input));
    return clone(result);
  }

  public getMembershipAvailability(): Pick<MembershipPaymentProviderAvailability, 'checkoutAvailable' | 'callbackVerificationAvailable' | 'readiness'> {
    return { checkoutAvailable: true, callbackVerificationAvailable: true, readiness: 'SANDBOX' };
  }

  public issueSuccessCallback(input: {
    readonly orderId: string;
    readonly providerTransactionId?: string;
    readonly amountFen?: number;
    readonly paidAt?: string;
  }): VerifyCallbackInput {
    const payment = this.paymentsByOrder.get(input.orderId);
    if (payment === undefined) throw new MembershipError('NOT_FOUND', 'A mock payment must exist before it can complete.');
    const source = this.paymentInputs.get(payment.providerPaymentId);
    if (source === undefined) throw new MembershipError('NOT_FOUND', 'Mock payment input was not found.');
    const rawBody = JSON.stringify({
      providerTransactionId: input.providerTransactionId ?? `mock-tx-${input.orderId}`,
      orderId: source.orderId,
      amountFen: input.amountFen ?? source.amountFen,
      currency: source.currency,
      paidAt: input.paidAt ?? this.now(),
    });
    const signature = createHmac('sha256', this.options.signingSecret).update(rawBody).digest('hex');
    return { headers: { 'x-mezip-fake-signature': signature }, rawBody };
  }

  public async queryPayment(input: QueryPaymentInput): Promise<ProviderPaymentStatus> {
    return { providerPaymentId: input.providerPaymentId, status: this.paymentInputs.has(input.providerPaymentId) ? 'PENDING' : 'CLOSED' };
  }

  public async verifyCallback(input: VerifyCallbackInput): Promise<VerifiedPaymentCallback> {
    const signature = requestHeader(input.headers, 'x-mezip-fake-signature');
    const expected = createHmac('sha256', this.options.signingSecret).update(input.rawBody).digest('hex');
    if (signature === undefined || !sameSignature(expected, signature)) {
      throw new MembershipError('PAYMENT_NOT_VERIFIED', 'The mock callback signature is invalid.');
    }
    let payload: unknown;
    try {
      payload = JSON.parse(input.rawBody) as unknown;
    } catch {
      throw new MembershipError('PAYMENT_NOT_VERIFIED', 'The mock callback payload is invalid.');
    }
    if (
      typeof payload !== 'object' ||
      payload === null ||
      typeof (payload as Record<string, unknown>).providerTransactionId !== 'string' ||
      typeof (payload as Record<string, unknown>).orderId !== 'string' ||
      !Number.isSafeInteger((payload as Record<string, unknown>).amountFen) ||
      (payload as Record<string, unknown>).currency !== 'CNY' ||
      typeof (payload as Record<string, unknown>).paidAt !== 'string'
    ) {
      throw new MembershipError('PAYMENT_NOT_VERIFIED', 'The mock callback payload is invalid.');
    }
    return payload as VerifiedPaymentCallback;
  }

  public async closePayment(): Promise<void> {}

  public async refundPayment(input: RefundPaymentInput): Promise<RefundPaymentResult> {
    return { providerRefundId: `mock-refund-${input.providerPaymentId}`, status: 'SUCCEEDED' };
  }

  public async queryRefund(input: QueryRefundInput): Promise<ProviderRefundStatus> {
    return { providerRefundId: input.providerRefundId, status: 'SUCCEEDED' };
  }
}

// ---------------------------------------------------------------------------
// Membership domain and persistence contracts
// ---------------------------------------------------------------------------

export interface MembershipAdminActor {
  readonly id: string;
  readonly userId: string;
}

/** Separate server-authenticated boundary. Consumer principals and plan names
 * cannot be converted into this capability in a request body. */
export interface MembershipAdministrationAccess {
  authorize(
    principal: AuthenticatedPrincipal,
    capability: MembershipAdminCapabilityCode,
  ): MembershipAdminActor;
}

export class InMemoryMembershipAdministrationAccess implements MembershipAdministrationAccess {
  private readonly capabilitiesByIdentity = new Map<string, ReadonlySet<MembershipAdminCapabilityCode>>();
  private readonly actorsByIdentity = new Map<string, MembershipAdminActor>();

  public set(
    adminIdentityId: string,
    userId: string,
    capabilities: readonly MembershipAdminCapabilityCode[],
  ): void {
    this.actorsByIdentity.set(adminIdentityId, { id: adminIdentityId, userId });
    this.capabilitiesByIdentity.set(adminIdentityId, new Set(capabilities));
  }

  public authorize(principal: AuthenticatedPrincipal, capability: MembershipAdminCapabilityCode): MembershipAdminActor {
    const identityId = principal.adminIdentityId;
    if (identityId === undefined) throw new MembershipError('FORBIDDEN', 'A server-issued membership admin identity is required.');
    const actor = this.actorsByIdentity.get(identityId);
    if (actor === undefined || actor.userId !== principal.userId || !this.capabilitiesByIdentity.get(identityId)?.has(capability)) {
      throw new MembershipError('FORBIDDEN', 'This admin identity does not have the required membership capability.');
    }
    return clone(actor);
  }
}

/** A membership simulation must be bound by the server to an authenticated
 * admin session. `AuthenticatedPrincipal.membershipSimulation` alone is not
 * trusted because a consumer could otherwise forge a plan preview. */
export interface MembershipSimulationResolver {
  resolve(principal: AuthenticatedPrincipal): MembershipSimulationContext | null;
}

export class InMemoryMembershipSimulationResolver implements MembershipSimulationResolver {
  private readonly values = new Map<string, MembershipSimulationContext>();

  public set(
    principal: Pick<AuthenticatedPrincipal, 'sessionId' | 'adminIdentityId'>,
    simulation: MembershipSimulationContext,
  ): void {
    if (principal.adminIdentityId === undefined || simulation.simulatedByAdminId !== principal.adminIdentityId) {
      throw new MembershipError('FORBIDDEN', 'A membership simulation must be bound to the issuing admin identity.');
    }
    this.values.set(`${principal.sessionId}:${principal.adminIdentityId}`, clone(simulation));
  }

  public resolve(principal: AuthenticatedPrincipal): MembershipSimulationContext | null {
    if (principal.adminIdentityId === undefined) return null;
    const value = this.values.get(`${principal.sessionId}:${principal.adminIdentityId}`);
    return value === undefined ? null : clone(value);
  }
}

export interface MembershipStorageUsageProvider {
  getUsedBytes(userId: string): number;
}

export class InMemoryMembershipStorageUsageProvider implements MembershipStorageUsageProvider {
  private readonly used = new Map<string, number>();
  public setUsedBytes(userId: string, bytes: number): void {
    if (!Number.isSafeInteger(bytes) || bytes < 0) throw new MembershipError('VALIDATION', 'Storage usage must be a non-negative integer.');
    this.used.set(userId, bytes);
  }
  public getUsedBytes(userId: string): number { return this.used.get(userId) ?? 0; }
}

export interface MembershipRateLimit {
  readonly max: number;
  readonly windowMs: number;
}

export interface MembershipRateLimiter {
  consume(userId: string, action: string, limit: MembershipRateLimit): void;
}

export class InMemoryMembershipRateLimiter implements MembershipRateLimiter {
  private readonly entries = new Map<string, number[]>();
  public constructor(private readonly now: () => number = () => Date.now()) {}
  public consume(userId: string, action: string, limit: MembershipRateLimit): void {
    const now = this.now();
    const key = `${userId}:${action}`;
    const active = (this.entries.get(key) ?? []).filter((timestamp) => now - timestamp < limit.windowMs);
    if (active.length >= limit.max) throw new MembershipError('RATE_LIMITED', 'This membership action is temporarily limited.');
    active.push(now);
    this.entries.set(key, active);
  }
}

export interface MembershipAdminAudit {
  readonly id: string;
  readonly adminId: string;
  readonly actorUserId: string;
  readonly targetUserId: string | null;
  readonly capability: MembershipAdminCapabilityCode;
  readonly action: string;
  readonly resourceId: string | null;
  readonly reason: string | null;
  readonly createdAt: string;
}

export interface MembershipBadge {
  readonly code: string;
  readonly name: string;
  readonly grantedAt: string;
  readonly grantId: string;
}

export interface MembershipInviteRelationship {
  readonly id: string;
  readonly inviterUserId: string;
  readonly invitedUserId: string;
  readonly createdAt: string;
}

export interface MembershipInviteReward {
  readonly id: string;
  readonly inviteRelationshipId: string;
  readonly benefitGrantId: string;
  readonly createdAt: string;
}

/** Audience membership is server-owned. For audience types that require a
 * user-segment or invitation join, the default resolver fails closed until a
 * trusted application resolver is connected. */
export interface MembershipCampaignAudienceResolver {
  isEligible(input: {
    readonly principal: AuthenticatedPrincipal;
    readonly campaign: MembershipCampaign;
    readonly actualPlanCode: PlanCode;
  }): boolean;
}

export class DefaultMembershipCampaignAudienceResolver implements MembershipCampaignAudienceResolver {
  public isEligible(input: {
    readonly principal: AuthenticatedPrincipal;
    readonly campaign: MembershipCampaign;
    readonly actualPlanCode: PlanCode;
  }): boolean {
    const { audience } = input.campaign;
    if (audience === 'ALL_USERS') return true;
    if (audience === 'FREE_USERS') return input.actualPlanCode === 'FREE';
    if (audience === 'GO_USERS') return input.actualPlanCode === 'GO';
    if (audience === 'PLUS_USERS') return input.actualPlanCode === 'PLUS';
    if (audience === 'PRO_USERS') return input.actualPlanCode === 'PRO';
    if (audience === 'PRO_MAX_USERS') return input.actualPlanCode === 'PRO_MAX';
    // NEW_USERS, SELECTED_USERS and INVITED_USERS require a trusted user or
    // invitation data source. They must never be inferred from a request.
    return false;
  }
}

/** Deterministic test/local implementation. Production integrations should
 * derive these target sets from server-side segmentation or invite records. */
export class InMemoryMembershipCampaignAudienceResolver implements MembershipCampaignAudienceResolver {
  private readonly userIdsByCampaign = new Map<string, ReadonlySet<string>>();

  public setCampaignAudience(campaignId: string, userIds: readonly string[]): void {
    this.userIdsByCampaign.set(campaignId, new Set(userIds));
  }

  public isEligible(input: {
    readonly principal: AuthenticatedPrincipal;
    readonly campaign: MembershipCampaign;
    readonly actualPlanCode: PlanCode;
  }): boolean {
    const defaultResolver = new DefaultMembershipCampaignAudienceResolver();
    if (['ALL_USERS', 'FREE_USERS', 'GO_USERS', 'PLUS_USERS', 'PRO_USERS', 'PRO_MAX_USERS'].includes(input.campaign.audience)) {
      return defaultResolver.isEligible(input);
    }
    return this.userIdsByCampaign.get(input.campaign.id)?.has(input.principal.userId) === true;
  }
}

export interface MembershipPaymentEvent {
  readonly id: string;
  readonly provider: PaymentProviderCode;
  readonly providerTransactionId: string;
  readonly orderId: string;
  readonly amountFen: number;
  readonly currency: 'CNY';
  readonly verifiedAt: string;
}

export interface MembershipStateSnapshot {
  readonly memberships: readonly Membership[];
  readonly membershipHistory: readonly MembershipHistoryEvent[];
  readonly entitlements: readonly MembershipEntitlement[];
  readonly benefitGrants: readonly MembershipBenefitGrant[];
  readonly orders: readonly MembershipOrder[];
  readonly payments: readonly MembershipPayment[];
  readonly paymentEvents: readonly MembershipPaymentEvent[];
  readonly refunds: readonly MembershipRefund[];
  readonly coupons: readonly MembershipCoupon[];
  readonly campaigns: readonly MembershipCampaign[];
  /** Opaque server-side selected-audience rows. Never included in a customer
   * campaign projection or accepted from a claim request. */
  readonly campaignTargets?: readonly { readonly campaignId: string; readonly userId: string }[];
  readonly campaignClaims: readonly MembershipCampaignClaim[];
  readonly redemptionCodes: readonly (MembershipRedemptionCode & { readonly codeHash: string })[];
  readonly redemptions: readonly MembershipRedemption[];
  readonly badges: readonly { readonly userId: string; readonly badge: MembershipBadge }[];
  readonly inviteRelationships: readonly MembershipInviteRelationship[];
  readonly inviteRewards: readonly MembershipInviteReward[];
  readonly adminAudits: readonly MembershipAdminAudit[];
  readonly idempotency: readonly MembershipIdempotencyReceipt[];
}

export interface MembershipPersistence {
  read(): MembershipStateSnapshot | null;
  write(snapshot: MembershipStateSnapshot): void;
}

export class InMemoryMembershipPersistence implements MembershipPersistence {
  private snapshot: MembershipStateSnapshot | null = null;
  public read(): MembershipStateSnapshot | null { return this.snapshot === null ? null : clone(this.snapshot); }
  public write(snapshot: MembershipStateSnapshot): void { this.snapshot = clone(snapshot); }
}

export interface MembershipIdempotencyReceipt {
  readonly key: string;
  readonly fingerprint: string;
  readonly result: unknown;
}

interface MembershipState {
  readonly memberships: Map<string, Membership>;
  readonly membershipHistory: Map<string, MembershipHistoryEvent>;
  readonly entitlements: Map<string, MembershipEntitlement>;
  readonly benefitGrants: Map<string, MembershipBenefitGrant>;
  readonly orders: Map<string, MembershipOrder>;
  readonly payments: Map<string, MembershipPayment>;
  readonly paymentEvents: Map<string, MembershipPaymentEvent>;
  readonly refunds: Map<string, MembershipRefund>;
  readonly coupons: Map<string, MembershipCoupon>;
  readonly campaigns: Map<string, MembershipCampaign>;
  readonly campaignTargets: Map<string, ReadonlySet<string>>;
  readonly campaignClaims: Map<string, MembershipCampaignClaim>;
  readonly redemptionCodes: Map<string, MembershipRedemptionCode & { readonly codeHash: string }>;
  readonly redemptions: Map<string, MembershipRedemption>;
  readonly badges: Map<string, MembershipBadge>;
  readonly inviteRelationships: Map<string, MembershipInviteRelationship>;
  readonly inviteRewards: Map<string, MembershipInviteReward>;
  readonly adminAudits: MembershipAdminAudit[];
  readonly idempotency: Map<string, MembershipIdempotencyReceipt>;
}

const durablyHydratedServices = new WeakSet<MembershipService>();

function emptyState(): MembershipState {
  return {
    memberships: new Map(),
    membershipHistory: new Map(),
    entitlements: new Map(),
    benefitGrants: new Map(),
    orders: new Map(),
    payments: new Map(),
    paymentEvents: new Map(),
    refunds: new Map(),
    coupons: new Map(),
    campaigns: new Map(),
    campaignTargets: new Map(),
    campaignClaims: new Map(),
    redemptionCodes: new Map(),
    redemptions: new Map(),
    badges: new Map(),
    inviteRelationships: new Map(),
    inviteRewards: new Map(),
    adminAudits: [],
    idempotency: new Map(),
  };
}

function stateFromSnapshot(snapshot: MembershipStateSnapshot | null): MembershipState {
  if (snapshot === null) return emptyState();
  return {
    memberships: new Map(snapshot.memberships.map((value) => [value.id, clone(value)])),
    membershipHistory: new Map(snapshot.membershipHistory.map((value) => [value.id, clone(value)])),
    entitlements: new Map(snapshot.entitlements.map((value) => [value.id, clone(value)])),
    benefitGrants: new Map(snapshot.benefitGrants.map((value) => [value.id, clone(value)])),
    orders: new Map(snapshot.orders.map((value) => [value.id, clone(value)])),
    payments: new Map(snapshot.payments.map((value) => [value.id, clone(value)])),
    // Provider + transaction id is the canonical replay key. Re-keying this
    // map by its opaque row id during a snapshot clone would make the second
    // callback miss the replay marker and try to pay an already fulfilled
    // order.
    paymentEvents: new Map(snapshot.paymentEvents.map((value) => [`${value.provider}:${value.providerTransactionId}`, clone(value)])),
    refunds: new Map(snapshot.refunds.map((value) => [value.id, clone(value)])),
    coupons: new Map(snapshot.coupons.map((value) => [value.id, clone(value)])),
    campaigns: new Map(snapshot.campaigns.map((value) => [value.id, clone(value)])),
    campaignTargets: (() => {
      const targets = new Map<string, Set<string>>();
      for (const value of snapshot.campaignTargets ?? []) {
        const users = targets.get(value.campaignId) ?? new Set<string>();
        users.add(value.userId);
        targets.set(value.campaignId, users);
      }
      return targets;
    })(),
    campaignClaims: new Map((snapshot.campaignClaims ?? []).map((value) => [value.id, clone(value)])),
    redemptionCodes: new Map(snapshot.redemptionCodes.map((value) => [value.id, clone(value)])),
    redemptions: new Map(snapshot.redemptions.map((value) => [value.id, clone(value)])),
    badges: new Map(snapshot.badges.map((value) => [`${value.userId}:${value.badge.code}`, clone(value.badge)])),
    inviteRelationships: new Map(snapshot.inviteRelationships.map((value) => [value.id, clone(value)])),
    inviteRewards: new Map(snapshot.inviteRewards.map((value) => [value.id, clone(value)])),
    adminAudits: snapshot.adminAudits.map(clone),
    idempotency: new Map(snapshot.idempotency.map((value) => [value.key, clone(value)])),
  };
}

function snapshotFromState(state: MembershipState): MembershipStateSnapshot {
  return {
    memberships: [...state.memberships.values()].map(clone),
    membershipHistory: [...state.membershipHistory.values()].map(clone),
    entitlements: [...state.entitlements.values()].map(clone),
    benefitGrants: [...state.benefitGrants.values()].map(clone),
    orders: [...state.orders.values()].map(clone),
    payments: [...state.payments.values()].map(clone),
    paymentEvents: [...state.paymentEvents.values()].map(clone),
    refunds: [...state.refunds.values()].map(clone),
    coupons: [...state.coupons.values()].map(clone),
    campaigns: [...state.campaigns.values()].map(clone),
    campaignTargets: [...state.campaignTargets.entries()].flatMap(([campaignId, userIds]) => [...userIds].map((userId) => ({ campaignId, userId }))),
    campaignClaims: [...state.campaignClaims.values()].map(clone),
    redemptionCodes: [...state.redemptionCodes.values()].map(clone),
    redemptions: [...state.redemptions.values()].map(clone),
    badges: [...state.badges.entries()].map(([key, badge]) => ({ userId: key.slice(0, key.lastIndexOf(':')), badge: clone(badge) })),
    inviteRelationships: [...state.inviteRelationships.values()].map(clone),
    inviteRewards: [...state.inviteRewards.values()].map(clone),
    adminAudits: state.adminAudits.map(clone),
    idempotency: [...state.idempotency.values()].map(clone),
  };
}

export interface MembershipCheckoutInput {
  readonly planCode: Exclude<PlanCode, 'FREE'>;
  readonly provider: PaymentProviderCode;
  /** Trusted request transport context. API callers never deserialize this
   * from checkout JSON; omitted values preserve the existing Web boundary. */
  readonly platform?: BillingPlatform | undefined;
  readonly couponCode?: string | undefined;
  readonly idempotencyKey: string;
}

/** Scheduler-only diagnostic result. A provider status query is deliberately
 * not a fulfillment authority: only a signed callback/transaction verifier
 * may activate membership. A production worker can use `awaitingVerification`
 * to request the provider's verified event or retry the callback pipeline. */
export interface MembershipPaymentReconciliationSummary {
  readonly scanned: number;
  readonly pending: number;
  readonly awaitingVerification: number;
  readonly closed: number;
  readonly providerUnavailable: number;
}

export interface MembershipBenefitGrantInput {
  readonly targetUserId: string;
  readonly type: MembershipBenefitGrant['type'];
  readonly source?: MembershipSource | undefined;
  readonly capability?: CapabilityCode | null | undefined;
  readonly membershipDays?: number | null | undefined;
  readonly planCode?: Exclude<PlanCode, 'FREE'> | null | undefined;
  readonly storageBytes?: number | null | undefined;
  readonly badgeCode?: string | null | undefined;
  readonly couponId?: string | null | undefined;
  readonly campaignId?: string | null | undefined;
  readonly startsAt?: string | undefined;
  readonly endsAt?: string | null | undefined;
  readonly reason: string;
  readonly idempotencyKey: string;
}

export interface MembershipCampaignCreateInput {
  readonly code: string;
  readonly audience: CampaignAudience;
  readonly benefits: readonly MembershipCampaignBenefitInput[];
  readonly startsAt: string;
  readonly endsAt?: string | null | undefined;
  /** Only valid for SELECTED_USERS campaigns. The authenticated Admin API
   * writes these opaque server-side target rows; customers never receive them. */
  readonly targetUserIds?: readonly string[] | undefined;
  readonly idempotencyKey: string;
}

/** A campaign benefit template is created only by the separately
 * authenticated Admin boundary. The customer-facing claim route does not
 * accept this shape. */
export interface MembershipCampaignBenefitInput {
  readonly type: MembershipBenefitGrant['type'];
  readonly capability?: CapabilityCode | null | undefined;
  readonly membershipDays?: number | null | undefined;
  readonly planCode?: Exclude<PlanCode, 'FREE'> | null | undefined;
  readonly storageBytes?: number | null | undefined;
  readonly badgeCode?: string | null | undefined;
  readonly couponId?: string | null | undefined;
  readonly endsAt?: string | null | undefined;
}

export interface MembershipCouponCreateInput {
  readonly code: string;
  readonly discountKind: CouponDiscountKind;
  readonly discountValue: number;
  readonly applicablePlans: readonly Exclude<PlanCode, 'FREE'>[];
  readonly maxRedemptions?: number | null | undefined;
  readonly startsAt: string;
  readonly endsAt?: string | null | undefined;
  readonly campaignId?: string | null | undefined;
  readonly idempotencyKey: string;
}

export interface MembershipRedemptionCodeCreateInput {
  readonly maxRedemptions: number;
  readonly startsAt: string;
  readonly endsAt?: string | null | undefined;
  readonly membershipDays?: number | null | undefined;
  readonly planCode?: Exclude<PlanCode, 'FREE'> | null | undefined;
  readonly storageBytes?: number | null | undefined;
  readonly capability?: CapabilityCode | null | undefined;
  readonly badgeCode?: string | null | undefined;
  readonly idempotencyKey: string;
}

export interface IssuedMembershipRedemptionCode {
  readonly code: string;
  readonly definition: MembershipRedemptionCode;
}

export interface MembershipServiceOptions {
  readonly persistence?: MembershipPersistence;
  /** Production server-only durable sink. The in-memory snapshot is retained
   * for deterministic unit tests; configure this with PostgresMembershipRepository
   * in the server composition before accepting payment traffic. */
  readonly durableRepository?: MembershipDurableRepository;
  readonly runtime?: Partial<MembershipRuntime>;
  readonly providers?: readonly PaymentProvider[];
  /** Defaults to DEVELOPMENT so deterministic unit fixtures remain explicit.
   * Production composition must reject the local MOCK provider altogether. */
  readonly environment?: BillingEnvironment;
  /** Optional platform allow-list supplied by server composition. It keeps a
   * Mini/iOS surface from selecting a browser-only provider in request JSON. */
  readonly platformResolver?: BillingPlatformResolver;
  readonly administration?: MembershipAdministrationAccess;
  readonly simulationResolver?: MembershipSimulationResolver;
  readonly campaignAudienceResolver?: MembershipCampaignAudienceResolver;
  readonly rateLimiter?: MembershipRateLimiter;
  readonly storageUsage?: MembershipStorageUsageProvider;
  readonly baseStorageBytes?: number;
  readonly planStorageBytes?: Readonly<Record<PlanCode, number>>;
  readonly orderLifetimeMs?: number;
}

/**
 * Payment and membership are deliberately separate concepts inside one
 * transaction boundary: a verified provider callback is the only pathway that
 * marks an order paid and creates a paid membership. All consumer methods use
 * the authenticated principal's own user id; no method trusts a client price,
 * payment success flag, arbitrary owner, Root claim, or entitlement list.
 */
export class MembershipService {
  private state: MembershipState;
  private readonly persistence: MembershipPersistence;
  private readonly durableRepository: MembershipDurableRepository | undefined;
  private readonly runtime: MembershipRuntime;
  private readonly providers = new Map<PaymentProviderCode, PaymentProvider>();
  private readonly environment: BillingEnvironment;
  private readonly platformResolver: BillingPlatformResolver | undefined;
  private readonly administration: MembershipAdministrationAccess | undefined;
  private readonly simulationResolver: MembershipSimulationResolver | undefined;
  private readonly campaignAudienceResolver: MembershipCampaignAudienceResolver;
  private readonly rateLimiter: MembershipRateLimiter;
  private readonly storageUsage: MembershipStorageUsageProvider;
  private readonly baseStorageBytes: number;
  private readonly planStorageBytes: Readonly<Record<PlanCode, number>>;
  private readonly orderLifetimeMs: number;
  /** Plaintext redemption values are response-only and process-ephemeral.
   * They are never placed in snapshots, durable idempotency receipts or logs. */
  private readonly issuedRedemptionCodes = new Map<string, IssuedMembershipRedemptionCode>();
  private serializedWriteTail: Promise<void> = Promise.resolve();
  /** Becomes false if the database projection cannot be reloaded after a
   * failed durable mutation. Authorization then fails closed until a fresh
   * server bootstrap constructs a hydrated service. */
  private durableStateHealthy = true;

  public constructor(options: MembershipServiceOptions = {}) {
    this.persistence = options.persistence ?? new InMemoryMembershipPersistence();
    this.durableRepository = options.durableRepository;
    this.state = stateFromSnapshot(this.persistence.read());
    this.runtime = { ...runtimeDefaults, ...options.runtime };
    this.environment = options.environment ?? 'DEVELOPMENT';
    this.platformResolver = options.platformResolver;
    for (const provider of options.providers ?? []) {
      if (this.environment === 'PRODUCTION' && provider.provider === 'MOCK') {
        throw new MembershipError('PROVIDER_UNAVAILABLE', 'The local mock payment provider is forbidden in production.');
      }
      this.providers.set(provider.provider, provider);
    }
    this.administration = options.administration;
    this.simulationResolver = options.simulationResolver;
    this.campaignAudienceResolver = options.campaignAudienceResolver ?? new DefaultMembershipCampaignAudienceResolver();
    this.rateLimiter = options.rateLimiter ?? new InMemoryMembershipRateLimiter();
    this.storageUsage = options.storageUsage ?? new InMemoryMembershipStorageUsageProvider();
    this.baseStorageBytes = options.baseStorageBytes ?? defaultBaseStorageBytes;
    this.planStorageBytes = options.planStorageBytes ?? { FREE: 0, GO: 0, PLUS: 0, PRO: 0, PRO_MAX: 0 };
    this.orderLifetimeMs = options.orderLifetimeMs ?? defaultOrderLifetimeMs;
  }

  /** Production bootstrap. It loads durable membership/order/callback state
   * before exposing the service, so a restart cannot downgrade a paid user to
   * FREE or lose a provider-event replay marker. */
  public static async fromDurable(
    options: Omit<MembershipServiceOptions, 'persistence' | 'durableRepository'> & {
      readonly durableRepository: MembershipDurableRepository;
    },
  ): Promise<MembershipService> {
    const persistence = new InMemoryMembershipPersistence();
    persistence.write(await options.durableRepository.loadSnapshot());
    const service = new MembershipService({
      ...options,
      persistence,
      durableRepository: options.durableRepository,
    });
    durablyHydratedServices.add(service);
    return service;
  }

  public listPlans(): readonly MembershipPlan[] { return officialMembershipPlans.map(clone); }

  /** Server bootstrap guard. A paid-feature composition must not silently run
   * against the in-memory test snapshot. */
  public isDurableRepositoryConfigured(): boolean {
    return this.durableStateHealthy && this.durableRepository !== undefined && durablyHydratedServices.has(this);
  }

  /** A fail-closed provider projection for client UI. The client may choose a
   * displayed provider only; `createCheckout` still independently resolves it
   * on the server and recalculates the frozen price. */
  public listPaymentProviders(): readonly MembershipPaymentProviderAvailability[] {
    const providerCodes: readonly PaymentProviderCode[] = ['WECHAT_PAY', 'ALIPAY', 'UNIONPAY', 'APPLE_IAP', 'MOCK'];
    return providerCodes.map((providerCode) => {
      const provider = this.providers.get(providerCode);
      if (provider === undefined) {
        return { provider: providerCode, checkoutAvailable: false, callbackVerificationAvailable: false, readiness: 'NOT_CONFIGURED' };
      }
      const inspectable = provider as PaymentProvider & Partial<MembershipProviderAvailabilityInspectable>;
      const availability = inspectable.getMembershipAvailability?.() ?? {
        checkoutAvailable: true,
        callbackVerificationAvailable: true,
        readiness: 'READY' as PaymentProviderReadiness,
      };
      return { provider: providerCode, ...availability };
    });
  }

  public getCenter(principal: AuthenticatedPrincipal): MembershipCenter {
    this.assertDurableStateHealthy();
    this.expireDueRecords();
    const now = this.runtime.now();
    const planCode = this.effectivePlanCode(principal, now);
    const currentMembership = this.currentMembershipFor(principal.userId, now);
    const entitlements = this.effectiveEntitlements(principal, now);
    const benefits = [...this.state.benefitGrants.values()]
      .filter((grant) => grant.userId === principal.userId)
      .sort((left, right) => right.startsAt.localeCompare(left.startsAt))
      .map(clone);
    return {
      currentMembership,
      effectivePlanCode: planCode,
      entitlements,
      benefits,
      storage: this.storageQuota(principal.userId, planCode, now),
    };
  }

  public has(principal: AuthenticatedPrincipal, capability: CapabilityCode): boolean {
    this.assertDurableStateHealthy();
    return this.effectiveEntitlements(principal, this.runtime.now()).some((entry) => entry.code === capability);
  }

  /** Authorization-only entitlement check. Unlike `has`, this ignores any
   * preview simulation and must be used by other server aggregates. */
  public hasActual(principal: AuthenticatedPrincipal, capability: CapabilityCode): boolean {
    this.assertDurableStateHealthy();
    return this.actualEntitlements(principal.userId, this.runtime.now()).some((entry) => entry.code === capability);
  }

  public hasUser(userId: string, capability: CapabilityCode): boolean {
    this.assertDurableStateHealthy();
    const principal: AuthenticatedPrincipal = { userId, sessionId: 'server-entitlement-read', roles: [], issuedAt: this.runtime.now() };
    return this.has(principal, capability);
  }

  public hasActualUser(userId: string, capability: CapabilityCode): boolean {
    this.assertDurableStateHealthy();
    return this.actualEntitlements(userId, this.runtime.now()).some((entry) => entry.code === capability);
  }

  /** Actual durable membership only. This intentionally ignores preview
   * simulation, because production authorization must not depend on any
   * presentation-only plan simulation. */
  public getActualPlanCode(userId: string): PlanCode {
    this.assertDurableStateHealthy();
    this.expireDueRecords();
    return this.currentMembershipFor(userId, this.runtime.now())?.planCode ?? 'FREE';
  }

  /** Founder audience gates are membership publication audiences, not private
   * data access. They remain independent from any Root/Admin role. */
  public canReadFounderAudience(principal: AuthenticatedPrincipal, audience: FounderAudience): boolean {
    this.assertDurableStateHealthy();
    if (audience === 'FOUNDER_PUBLIC') return this.hasActual(principal, 'COMMUNITY_READ');
    const audienceOrder: readonly FounderAudience[] = [
      'FOUNDER_PUBLIC',
      'FOUNDER_FREE',
      'FOUNDER_GO',
      'FOUNDER_PLUS',
      'FOUNDER_PRO',
      'FOUNDER_PRO_MAX',
    ];
    const audienceForPlan: Readonly<Record<PlanCode, FounderAudience>> = {
      FREE: 'FOUNDER_FREE',
      GO: 'FOUNDER_GO',
      PLUS: 'FOUNDER_PLUS',
      PRO: 'FOUNDER_PRO',
      PRO_MAX: 'FOUNDER_PRO_MAX',
    };
    return audienceOrder.indexOf(audienceForPlan[this.getActualPlanCode(principal.userId)]) >= audienceOrder.indexOf(audience);
  }

  public listOrders(principal: AuthenticatedPrincipal): readonly MembershipOrder[] {
    this.assertDurableStateHealthy();
    this.expireDueRecords();
    return [...this.state.orders.values()]
      .filter((order) => order.userId === principal.userId)
      .sort((left, right) => right.createdAt.localeCompare(left.createdAt))
      .map(clone);
  }

  public getOrder(principal: AuthenticatedPrincipal, orderId: string): MembershipOrder {
    this.assertDurableStateHealthy();
    this.expireDueRecords();
    const order = this.state.orders.get(orderId);
    if (order === undefined || order.userId !== principal.userId) throw new MembershipError('NOT_FOUND', 'The order was not found.');
    return clone(order);
  }

  public listBenefits(principal: AuthenticatedPrincipal): readonly MembershipBenefitGrant[] {
    this.assertDurableStateHealthy();
    return [...this.state.benefitGrants.values()]
      .filter((grant) => grant.userId === principal.userId)
      .sort((left, right) => right.startsAt.localeCompare(left.startsAt))
      .map(clone);
  }

  /** Membership history is deliberately self-scoped.  It is an audit-style
   * customer projection, never an admin or cross-user query surface. */
  public listMembershipHistory(principal: AuthenticatedPrincipal): readonly MembershipHistoryEvent[] {
    this.assertDurableStateHealthy();
    this.expireDueRecords();
    return [...this.state.membershipHistory.values()]
      .filter((event) => event.userId === principal.userId)
      .sort((left, right) => right.occurredAt.localeCompare(left.occurredAt))
      .map(clone);
  }

  /** Safe customer projection: only currently usable catalogue coupons are
   * returned. Coupon ownership/redemption is still rechecked during checkout. */
  public listCoupons(principal: AuthenticatedPrincipal): readonly MembershipCoupon[] {
    this.assertDurableStateHealthy();
    const now = this.runtime.now();
    const actualPlanCode = this.getActualPlanCode(principal.userId);
    const usedCouponIds = new Set(
      [...this.state.redemptions.values()]
        .filter((redemption) => redemption.userId === principal.userId && redemption.couponId !== null)
        .map((redemption) => redemption.couponId!),
    );
    return [...this.state.coupons.values()]
      .filter((coupon) =>
        coupon.status === 'ACTIVE' &&
        Date.parse(coupon.startsAt) <= Date.parse(now) &&
        (coupon.endsAt === null || Date.parse(now) < Date.parse(coupon.endsAt)) &&
        (coupon.maxRedemptions === null || coupon.redeemedCount < coupon.maxRedemptions) &&
        this.isCouponAudienceAvailable(coupon, principal, actualPlanCode, now) &&
        !usedCouponIds.has(coupon.id),
      )
      .sort((left, right) => left.code.localeCompare(right.code))
      .map(clone);
  }

  public listRedemptions(principal: AuthenticatedPrincipal): readonly MembershipRedemption[] {
    this.assertDurableStateHealthy();
    return [...this.state.redemptions.values()]
      .filter((redemption) => redemption.userId === principal.userId)
      .sort((left, right) => right.redeemedAt.localeCompare(left.redeemedAt))
      .map(clone);
  }

  /** Campaigns are listed only when the authenticated user is currently
   * eligible under a server-owned audience decision. Targeted campaign ids
   * therefore do not become an enumeration surface. */
  public listClaimableCampaigns(principal: AuthenticatedPrincipal): readonly MembershipCampaign[] {
    this.assertDurableStateHealthy();
    const now = this.runtime.now();
    const actualPlanCode = this.currentMembershipFor(principal.userId, now)?.planCode ?? 'FREE';
    return [...this.state.campaigns.values()]
      .filter((campaign) => this.isCampaignClaimableFor(campaign, principal, actualPlanCode, now))
      .sort((left, right) => left.startsAt.localeCompare(right.startsAt))
      .map(clone);
  }

  public async createCheckout(principal: AuthenticatedPrincipal, input: MembershipCheckoutInput): Promise<MembershipCheckout> {
    return this.serializeWrite(() => this.createCheckoutInternal(principal, input));
  }

  private async createCheckoutInternal(principal: AuthenticatedPrincipal, input: MembershipCheckoutInput): Promise<MembershipCheckout> {
    const idempotencyKey = assertIdempotencyKey(input.idempotencyKey);
    const normalizedCoupon = input.couponCode === undefined ? undefined : normalizeCode(input.couponCode);
    const platform = input.platform ?? 'WEB';
    const fingerprint = JSON.stringify({ planCode: input.planCode, provider: input.provider, platform, couponCode: normalizedCoupon ?? null });
    const existing = this.getIdempotency<MembershipOrder>(`checkout:${principal.userId}:${idempotencyKey}`, fingerprint);
    const provider = this.providers.get(input.provider);
    if (provider === undefined) throw new MembershipError('PROVIDER_UNAVAILABLE', 'The requested payment provider is unavailable.');
    if (this.platformResolver !== undefined && !this.platformResolver.providersFor(platform).includes(input.provider)) {
      throw new MembershipError('PROVIDER_UNAVAILABLE', 'This payment provider is not available for the current platform.');
    }
    const order = existing ?? this.transact((draft) => {
      this.assertNoUnpricedUpgrade(draft, principal.userId, input.planCode, this.runtime.now());
      const now = this.runtime.now();
      const baseAmountFen = membershipPriceFen[input.planCode];
      const coupon = normalizedCoupon === undefined ? null : this.findActiveCoupon(draft, normalizedCoupon, input.planCode, principal, now);
      const discountAmountFen = coupon === null ? 0 : calculateCouponDiscount(coupon, baseAmountFen);
      const value: MembershipOrder = {
        id: this.runtime.id(),
        orderNo: `MZ${this.runtime.id().replaceAll('-', '').slice(0, 20).toUpperCase()}`,
        userId: principal.userId,
        planCode: input.planCode,
        baseAmountFen,
        discountAmountFen,
        payableAmountFen: baseAmountFen - discountAmountFen,
        currency: 'CNY',
        couponId: coupon?.id ?? null,
        provider: input.provider,
        status: 'CREATED',
        createdAt: now,
        expiresAt: new Date(Date.parse(now) + this.orderLifetimeMs).toISOString(),
        paidAt: null,
        updatedAt: now,
      };
      draft.orders.set(value.id, value);
      if (coupon !== null) {
        const reserved: MembershipRedemption = {
          id: this.runtime.id(),
          userId: principal.userId,
          orderId: value.id,
          redemptionCodeId: null,
          couponId: coupon.id,
          benefitGrantIds: [],
          idempotencyKey: `checkout-coupon:${value.id}`,
          redeemedAt: now,
        };
        draft.redemptions.set(reserved.id, reserved);
        draft.coupons.set(coupon.id, { ...coupon, redeemedCount: coupon.redeemedCount + 1 });
      }
      this.rememberIdempotency(draft, `checkout:${principal.userId}:${idempotencyKey}`, fingerprint, value);
      return value;
    });
    if (existing === undefined && this.durableRepository !== undefined) {
      const reservation = [...this.state.redemptions.values()].find(
        (redemption) => redemption.orderId === order.id && redemption.couponId !== null,
      ) ?? null;
      const receipt = this.state.idempotency.get(`checkout:${principal.userId}:${idempotencyKey}`);
      if (receipt === undefined) throw new MembershipError('CONFLICT', 'The checkout idempotency receipt was not recorded.');
      const persisted = await this.persistOrReload(() => this.durableRepository!.persistCheckout({
        order: toMembershipDurableOrderRow(order),
        couponReservation: reservation,
        idempotencyKey: `checkout:${principal.userId}:${idempotencyKey}`,
        idempotency: receipt,
      }));
      if (!persisted) {
        if (this.getIdempotency<MembershipOrder>(`checkout:${principal.userId}:${idempotencyKey}`, fingerprint) === undefined) {
          throw new MembershipError('CONFLICT', 'The canonical checkout could not be loaded.');
        }
        // Retry against the rehydrated canonical order. Providers are always
        // called with the stable server order id, never a client checkout id.
        return this.createCheckoutInternal(principal, input);
      }
    }

    const existingPayment = [...this.state.payments.values()].find(
      (payment) => payment.orderId === order.id && payment.provider === input.provider && payment.status === 'PENDING',
    );
    if (existingPayment !== undefined) {
      return {
        order: this.getOrder(principal, order.id),
        provider: input.provider,
        providerPaymentId: existingPayment.providerPaymentId,
        clientPayload: {},
        state: 'PENDING_CONFIRMATION',
      };
    }

    if (order.status === 'EXPIRED' || Date.parse(order.expiresAt) <= Date.parse(this.runtime.now())) {
      this.expireDueRecords();
      throw new MembershipError('ORDER_EXPIRED', 'The order has expired.');
    }
    if (order.status !== 'CREATED' && order.status !== 'PENDING_PAYMENT') {
      throw new MembershipError('ORDER_NOT_PAYABLE', 'This order cannot be paid.');
    }

    if (order.planCode === 'FREE') {
      throw new MembershipError('VALIDATION', 'The free baseline cannot create a payment attempt.');
    }
    const result = await provider.createPayment({
      orderId: order.id,
      planCode: order.planCode,
      amountFen: order.payableAmountFen,
      currency: 'CNY',
      description: `${getOfficialMembershipPlan(order.planCode).name} monthly pass`,
    });
    const checkout = this.transact((draft) => {
      const stored = draft.orders.get(order.id);
      if (stored === undefined || stored.userId !== principal.userId) throw new MembershipError('NOT_FOUND', 'The order was not found.');
      if (stored.status === 'PAID' || stored.status === 'FULFILLED') throw new MembershipError('ORDER_NOT_PAYABLE', 'The order is already paid.');
      const now = this.runtime.now();
      const payment: MembershipPayment = {
        id: this.runtime.id(),
        orderId: stored.id,
        provider: input.provider,
        providerPaymentId: result.providerPaymentId,
        providerTransactionId: null,
        amountFen: stored.payableAmountFen,
        currency: 'CNY',
        status: 'PENDING',
        createdAt: now,
        verifiedAt: null,
      };
      const duplicate = [...draft.payments.values()].find((candidate) => candidate.provider === payment.provider && candidate.providerPaymentId === payment.providerPaymentId);
      if (duplicate !== undefined) {
        return {
          order: stored,
          provider: input.provider,
          providerPaymentId: duplicate.providerPaymentId,
          clientPayload: result.clientPayload,
          state: 'PENDING_PAYMENT' as const,
        };
      }
      draft.payments.set(payment.id, payment);
      const pendingOrder: MembershipOrder = { ...stored, status: 'PENDING_PAYMENT', updatedAt: now };
      draft.orders.set(stored.id, pendingOrder);
      return {
        order: pendingOrder,
        provider: input.provider,
        providerPaymentId: payment.providerPaymentId,
        clientPayload: clone(result.clientPayload),
        state: 'PENDING_PAYMENT' as const,
      };
    });
    if (this.durableRepository !== undefined) {
      const payment = [...this.state.payments.values()].find(
        (candidate) => candidate.orderId === checkout.order.id && candidate.providerPaymentId === checkout.providerPaymentId,
      );
      if (payment === undefined) throw new MembershipError('CONFLICT', 'The pending payment was not recorded.');
      const persisted = await this.persistOrReload(() => this.durableRepository!.persistPendingPayment({
        order: toMembershipDurableOrderRow(checkout.order),
        payment: toMembershipDurablePaymentRow(payment),
      }));
      if (!persisted) return this.createCheckoutInternal(principal, input);
    }
    return clone(checkout);
  }

  /** This boundary is called only from the unauthenticated provider callback
   * route. It verifies the signature before it looks up or activates an order. */
  public async receivePaymentCallback(
    providerCode: PaymentProviderCode,
    input: VerifyCallbackInput,
  ): Promise<{ readonly order: MembershipOrder; readonly membership: Membership }> {
    return this.serializeWrite(() => this.receivePaymentCallbackInternal(providerCode, input));
  }

  private async receivePaymentCallbackInternal(
    providerCode: PaymentProviderCode,
    input: VerifyCallbackInput,
  ): Promise<{ readonly order: MembershipOrder; readonly membership: Membership }> {
    const provider = this.providers.get(providerCode);
    if (provider === undefined) throw new MembershipError('PROVIDER_UNAVAILABLE', 'The callback provider is unavailable.');
    const callback = await provider.verifyCallback(input);
    const beforeActivation = snapshotFromState(this.state);
    const response = this.transact((draft) => this.applyVerifiedPayment(draft, providerCode, callback));
    if (this.durableRepository !== undefined) {
      const replayed = beforeActivation.paymentEvents.some(
        (event) => event.provider === providerCode && event.providerTransactionId === callback.providerTransactionId,
      );
      if (!replayed) {
        const payment = [...this.state.payments.values()].find(
          (candidate) => candidate.orderId === response.order.id && candidate.provider === providerCode,
        );
        const event = [...this.state.paymentEvents.values()].find(
          (candidate) => candidate.provider === providerCode && candidate.providerTransactionId === callback.providerTransactionId,
        );
        if (payment === undefined || event === undefined) throw new MembershipError('CONFLICT', 'The verified payment was not recorded.');
        const history = [...this.state.membershipHistory.values()].filter((entry) => entry.membershipId === response.membership.id);
        const entitlements = [...this.state.entitlements.values()].filter((entry) => entry.membershipId === response.membership.id);
        const eventDigest = createHash('sha256').update(input.rawBody).digest('hex');
        const persisted = await this.persistOrReload(() => this.durableRepository!.applyVerifiedPayment({
          order: toMembershipDurableOrderRow(response.order),
          payment: toMembershipDurablePaymentRow(payment),
          event: toMembershipDurablePaymentEventRow(event, eventDigest),
          membership: toMembershipDurableMembershipRow(response.membership),
          history,
          entitlements,
          couponRedemption: [...this.state.redemptions.values()].find((redemption) => redemption.orderId === response.order.id) ?? null,
        }));
        if (!persisted) {
          const event = [...this.state.paymentEvents.values()].find(
            (candidate) => candidate.provider === providerCode && candidate.providerTransactionId === callback.providerTransactionId,
          );
          const order = event === undefined ? undefined : this.state.orders.get(event.orderId);
          const membership = order === undefined ? undefined : [...this.state.memberships.values()].find((candidate) => candidate.orderId === order.id);
          if (order === undefined || membership === undefined) {
            throw new MembershipError('PAYMENT_REPLAY', 'The canonical verified payment could not be loaded.');
          }
          return { order: clone(order), membership: clone(membership) };
        }
      }
    }
    return response;
  }

  public async requestRefund(principal: AuthenticatedPrincipal, orderId: string, reason: string, idempotencyKey: string): Promise<MembershipRefund> {
    return this.serializeWrite(() => this.requestRefundInternal(principal, orderId, reason, idempotencyKey));
  }

  private async requestRefundInternal(principal: AuthenticatedPrincipal, orderId: string, reason: string, idempotencyKey: string): Promise<MembershipRefund> {
    const key = assertIdempotencyKey(idempotencyKey);
    const normalizedReason = reason.trim();
    if (normalizedReason === '' || normalizedReason.length > 1_000) throw new MembershipError('VALIDATION', 'A refund reason is required.');
    const fingerprint = JSON.stringify({ orderId, reason: normalizedReason });
    const existing = this.getIdempotency<MembershipRefund>(`refund:${principal.userId}:${key}`, fingerprint);
    if (existing !== undefined) return existing;
    const refund = this.transact((draft) => {
      const order = draft.orders.get(orderId);
      if (order === undefined || order.userId !== principal.userId) throw new MembershipError('NOT_FOUND', 'The order was not found.');
      if (order.status !== 'PAID' && order.status !== 'FULFILLED') throw new MembershipError('CONFLICT', 'Only paid orders can request a refund.');
      const now = this.runtime.now();
      const refund: MembershipRefund = {
        id: this.runtime.id(),
        orderId,
        provider: order.provider,
        providerRefundId: null,
        amountFen: order.payableAmountFen,
        status: 'REQUESTED',
        reason: normalizedReason,
        createdAt: now,
        completedAt: null,
      };
      draft.refunds.set(refund.id, refund);
      this.rememberIdempotency(draft, `refund:${principal.userId}:${key}`, fingerprint, refund);
      return refund;
    });
    if (this.durableRepository !== undefined) {
      const order = this.state.orders.get(orderId);
      if (order === undefined) throw new MembershipError('CONFLICT', 'The refund order was not recorded.');
      const receipt = this.state.idempotency.get(`refund:${principal.userId}:${key}`);
      if (receipt === undefined) throw new MembershipError('CONFLICT', 'The refund idempotency receipt was not recorded.');
      const persisted = await this.persistOrReload(() => this.durableRepository!.persistRefundRequest({
        refund,
        order: toMembershipDurableOrderRow(order),
        requestedByUserId: principal.userId,
        idempotency: receipt,
      }));
      if (!persisted) {
        const canonical = this.getIdempotency<MembershipRefund>(`refund:${principal.userId}:${key}`, fingerprint);
        if (canonical === undefined) throw new MembershipError('CONFLICT', 'The canonical refund request could not be loaded.');
        return canonical;
      }
    }
    return refund;
  }

  public async redeemCode(principal: AuthenticatedPrincipal, code: string, idempotencyKey: string): Promise<MembershipRedemption> {
    return this.serializeWrite(() => this.redeemCodeInternal(principal, code, idempotencyKey));
  }

  private async redeemCodeInternal(principal: AuthenticatedPrincipal, code: string, idempotencyKey: string): Promise<MembershipRedemption> {
    const key = assertIdempotencyKey(idempotencyKey);
    this.rateLimiter.consume(principal.userId, 'redeem-code', { max: 5, windowMs: 15 * 60 * 1_000 });
    const codeHash = hashRedemptionCode(code);
    const fingerprint = JSON.stringify({ codeHash });
    const existing = this.getIdempotency<MembershipRedemption>(`redeem:${principal.userId}:${key}`, fingerprint);
    if (existing !== undefined) return existing;
    const before = snapshotFromState(this.state);
    const redemption = this.transact((draft) => {
      const redemptionCode = [...draft.redemptionCodes.values()].find((candidate) => candidate.codeHash === codeHash);
      const now = this.runtime.now();
      if (redemptionCode === undefined) {
        throw new MembershipError('REDEMPTION_INVALID', 'This redemption code is invalid or unavailable.');
      }
      const existingForUser = [...draft.redemptions.values()].find((candidate) => candidate.redemptionCodeId === redemptionCode.id && candidate.userId === principal.userId);
      if (existingForUser !== undefined) throw new MembershipError('REDEMPTION_ALREADY_USED', 'This redemption code has already been used.');
      if (!this.isRedemptionCodeActive(redemptionCode, now)) {
        throw new MembershipError('REDEMPTION_INVALID', 'This redemption code is invalid or unavailable.');
      }
      if (redemptionCode.redeemedCount >= redemptionCode.maxRedemptions) {
        draft.redemptionCodes.set(redemptionCode.id, { ...redemptionCode, status: 'EXHAUSTED' });
        throw new MembershipError('REDEMPTION_INVALID', 'This redemption code is unavailable.');
      }
      const grantIds = this.applyCodeBenefits(draft, principal.userId, redemptionCode, key, now);
      const redemption: MembershipRedemption = {
        id: this.runtime.id(),
        userId: principal.userId,
        orderId: null,
        redemptionCodeId: redemptionCode.id,
        couponId: null,
        benefitGrantIds: grantIds,
        idempotencyKey: key,
        redeemedAt: now,
      };
      draft.redemptions.set(redemption.id, redemption);
      const nextCount = redemptionCode.redeemedCount + 1;
      draft.redemptionCodes.set(redemptionCode.id, {
        ...redemptionCode,
        redeemedCount: nextCount,
        status: nextCount >= redemptionCode.maxRedemptions ? 'EXHAUSTED' : redemptionCode.status,
      });
      this.rememberIdempotency(draft, `redeem:${principal.userId}:${key}`, fingerprint, redemption);
      return redemption;
    });
    if (this.durableRepository !== undefined) {
      const beforeGrantIds = new Set(before.benefitGrants.map((grant) => grant.id));
      const beforeMembershipIds = new Set(before.memberships.map((membership) => membership.id));
      const beforeHistoryIds = new Set(before.membershipHistory.map((entry) => entry.id));
      const beforeEntitlementIds = new Set(before.entitlements.map((entry) => entry.id));
      const grants = [...this.state.benefitGrants.values()]
        .filter((grant) => !beforeGrantIds.has(grant.id))
        .map(toMembershipDurableBenefitGrantRow);
      const memberships = [...this.state.memberships.values()]
        .filter((membership) => !beforeMembershipIds.has(membership.id))
        .map(toMembershipDurableMembershipRow);
      const history = [...this.state.membershipHistory.values()].filter((entry) => !beforeHistoryIds.has(entry.id));
      const entitlements = [...this.state.entitlements.values()].filter((entry) => !beforeEntitlementIds.has(entry.id));
      const receipt = this.state.idempotency.get(`redeem:${principal.userId}:${key}`);
      if (receipt === undefined || redemption.redemptionCodeId === null) {
        throw new MembershipError('CONFLICT', 'The redemption receipt was not recorded.');
      }
      const persisted = await this.persistOrReload(() => this.durableRepository!.persistCustomerGrants({
        redemption,
        campaignClaim: null,
        grants,
        memberships,
        history,
        entitlements,
        redemptionCodeId: redemption.redemptionCodeId,
        idempotency: receipt,
      }));
      if (!persisted) {
        const canonical = this.getIdempotency<MembershipRedemption>(`redeem:${principal.userId}:${key}`, fingerprint);
        if (canonical === undefined) throw new MembershipError('REDEMPTION_ALREADY_USED', 'The canonical redemption could not be loaded.');
        return canonical;
      }
    }
    return redemption;
  }

  /** Claim is deliberately a minimal self-service surface: the user supplies
   * a campaign id and idempotency key only. Audience, timing, benefit payload
   * and target user are all resolved server-side. */
  public async claimCampaign(principal: AuthenticatedPrincipal, campaignId: string, idempotencyKey: string): Promise<MembershipCampaignClaim> {
    return this.serializeWrite(() => this.claimCampaignInternal(principal, campaignId, idempotencyKey));
  }

  private async claimCampaignInternal(principal: AuthenticatedPrincipal, campaignId: string, idempotencyKey: string): Promise<MembershipCampaignClaim> {
    const key = assertIdempotencyKey(idempotencyKey);
    const fingerprint = JSON.stringify({ campaignId });
    const existing = this.getIdempotency<MembershipCampaignClaim>(`campaign-claim:${principal.userId}:${key}`, fingerprint);
    if (existing !== undefined) return existing;
    const before = snapshotFromState(this.state);
    const claim = this.transact((draft) => {
      const campaign = draft.campaigns.get(campaignId);
      const now = this.runtime.now();
      const actualPlanCode = this.currentMembershipFrom(draft, principal.userId, now)?.planCode ?? 'FREE';
      // Not found intentionally covers non-targeted/inactive campaigns, so a
      // caller cannot learn campaign targeting by probing opaque ids.
      if (campaign === undefined || !this.isCampaignClaimableFor(campaign, principal, actualPlanCode, now, draft)) {
        throw new MembershipError('NOT_FOUND', 'The campaign is not available.');
      }
      const alreadyClaimed = [...draft.campaignClaims.values()].find(
        (claim) => claim.campaignId === campaign.id && claim.userId === principal.userId,
      );
      if (alreadyClaimed !== undefined) throw new MembershipError('CONFLICT', 'This campaign has already been claimed.');
      const grantIds: string[] = [];
      for (const benefit of campaign.benefits) {
        const grant = this.newBenefitGrant(draft, {
          targetUserId: principal.userId,
          type: benefit.type,
          source: 'CAMPAIGN',
          capability: benefit.capability,
          membershipDays: benefit.membershipDays,
          planCode: benefit.planCode === 'FREE' ? null : benefit.planCode,
          storageBytes: benefit.storageBytes,
          badgeCode: benefit.badgeCode,
          couponId: benefit.couponId,
          campaignId: campaign.id,
          startsAt: now,
          endsAt: benefit.endsAt ?? campaign.endsAt,
          reason: `Campaign ${campaign.code} claim`,
          idempotencyKey: `campaign-claim:${campaign.id}:${principal.userId}:${benefit.id}`,
          operatorId: null,
        });
        draft.benefitGrants.set(grant.id, grant);
        this.applyBenefitSideEffects(draft, grant, now);
        grantIds.push(grant.id);
      }
      const claim: MembershipCampaignClaim = {
        id: this.runtime.id(),
        campaignId: campaign.id,
        userId: principal.userId,
        benefitGrantIds: grantIds,
        idempotencyKey: key,
        claimedAt: now,
      };
      draft.campaignClaims.set(claim.id, claim);
      this.rememberIdempotency(draft, `campaign-claim:${principal.userId}:${key}`, fingerprint, claim);
      return claim;
    });
    if (this.durableRepository !== undefined) {
      const beforeGrantIds = new Set(before.benefitGrants.map((grant) => grant.id));
      const beforeMembershipIds = new Set(before.memberships.map((membership) => membership.id));
      const beforeHistoryIds = new Set(before.membershipHistory.map((entry) => entry.id));
      const beforeEntitlementIds = new Set(before.entitlements.map((entry) => entry.id));
      const grants = [...this.state.benefitGrants.values()]
        .filter((grant) => !beforeGrantIds.has(grant.id))
        .map(toMembershipDurableBenefitGrantRow);
      const memberships = [...this.state.memberships.values()]
        .filter((membership) => !beforeMembershipIds.has(membership.id))
        .map(toMembershipDurableMembershipRow);
      const history = [...this.state.membershipHistory.values()].filter((entry) => !beforeHistoryIds.has(entry.id));
      const entitlements = [...this.state.entitlements.values()].filter((entry) => !beforeEntitlementIds.has(entry.id));
      const receipt = this.state.idempotency.get(`campaign-claim:${principal.userId}:${key}`);
      if (receipt === undefined) throw new MembershipError('CONFLICT', 'The campaign claim receipt was not recorded.');
      const persisted = await this.persistOrReload(() => this.durableRepository!.persistCustomerGrants({
        redemption: null,
        campaignClaim: claim,
        grants,
        memberships,
        history,
        entitlements,
        redemptionCodeId: null,
        idempotency: receipt,
      }));
      if (!persisted) {
        const canonical = this.getIdempotency<MembershipCampaignClaim>(`campaign-claim:${principal.userId}:${key}`, fingerprint);
        if (canonical === undefined) throw new MembershipError('CONFLICT', 'The canonical campaign claim could not be loaded.');
        return canonical;
      }
    }
    return claim;
  }

  public async createCampaign(principal: AuthenticatedPrincipal, input: MembershipCampaignCreateInput): Promise<MembershipCampaign> {
    return this.serializeWrite(() => this.createCampaignInternal(principal, input));
  }

  private async createCampaignInternal(principal: AuthenticatedPrincipal, input: MembershipCampaignCreateInput): Promise<MembershipCampaign> {
    const campaign = this.withAdminMutation(principal, 'MANAGE_CAMPAIGNS', null, 'CREATE_CAMPAIGN', input.idempotencyKey, input, (draft, _actor, now) => {
      const code = normalizeCode(input.code);
      const targets = input.targetUserIds ?? [];
      if (!/^[A-Z0-9][A-Z0-9_-]{2,79}$/u.test(code) || input.benefits.length === 0 || input.benefits.length > 20 || Number.isNaN(Date.parse(input.startsAt)) || (input.endsAt !== undefined && input.endsAt !== null && (Number.isNaN(Date.parse(input.endsAt)) || Date.parse(input.endsAt) <= Date.parse(input.startsAt))) || (input.audience === 'SELECTED_USERS' && (targets.length === 0 || targets.length > 10_000 || new Set(targets).size !== targets.length)) || (input.audience !== 'SELECTED_USERS' && targets.length > 0)) {
        throw new MembershipError('VALIDATION', 'The campaign input is invalid.');
      }
      if ([...draft.campaigns.values()].some((candidate) => candidate.code === code)) throw new MembershipError('CONFLICT', 'The campaign code already exists.');
      const campaignEndsAt = input.endsAt ?? null;
      const benefits = input.benefits.map((benefit) => this.newCampaignBenefit(benefit, campaignEndsAt));
      const campaign: MembershipCampaign = { id: this.runtime.id(), code, status: 'DRAFT', audience: input.audience, benefits, startsAt: input.startsAt, endsAt: campaignEndsAt, createdAt: now };
      draft.campaigns.set(campaign.id, campaign);
      if (targets.length > 0) draft.campaignTargets.set(campaign.id, new Set(targets));
      return campaign;
    });
    if (this.durableRepository !== undefined) {
      const audit = [...this.state.adminAudits].reverse().find((entry) => entry.resourceId === campaign.id && entry.action === 'CREATE_CAMPAIGN');
      const receipt = [...this.state.idempotency.values()].find((entry) => entry.key.includes(':CREATE_CAMPAIGN:') && (entry.result as { readonly id?: unknown }).id === campaign.id);
      if (audit === undefined || receipt === undefined) throw new MembershipError('CONFLICT', 'The campaign audit receipt was not recorded.');
      const persisted = await this.persistOrReload(() => this.durableRepository!.persistCampaign({
        campaign,
        targetUserIds: [...(this.state.campaignTargets.get(campaign.id) ?? [])],
        audit,
        idempotency: receipt,
      }));
      if (!persisted) {
        const canonical = [...this.state.campaigns.values()].find((value) => value.code === campaign.code);
        if (canonical === undefined) throw new MembershipError('CONFLICT', 'The canonical campaign could not be loaded.');
        return clone(canonical);
      }
    }
    return campaign;
  }

  public async setCampaignStatus(principal: AuthenticatedPrincipal, campaignId: string, status: CampaignStatus, reason: string, idempotencyKey: string): Promise<MembershipCampaign> {
    return this.serializeWrite(() => this.setCampaignStatusInternal(principal, campaignId, status, reason, idempotencyKey));
  }

  private async setCampaignStatusInternal(principal: AuthenticatedPrincipal, campaignId: string, status: CampaignStatus, reason: string, idempotencyKey: string): Promise<MembershipCampaign> {
    const action = `SET_CAMPAIGN_${status}`;
    const campaign = this.withAdminMutation(principal, 'MANAGE_CAMPAIGNS', null, action, idempotencyKey, { campaignId, status, reason }, (draft) => {
      const campaign = draft.campaigns.get(campaignId);
      if (campaign === undefined) throw new MembershipError('NOT_FOUND', 'The campaign was not found.');
      const updated = { ...campaign, status };
      draft.campaigns.set(updated.id, updated);
      return updated;
    }, reason);
    if (this.durableRepository !== undefined) {
      const audit = [...this.state.adminAudits].reverse().find((entry) => entry.resourceId === campaign.id && entry.action === action);
      const receipt = [...this.state.idempotency.values()].find((entry) => entry.key.includes(`:${action}:`) && (entry.result as { readonly id?: unknown }).id === campaign.id);
      if (audit === undefined || receipt === undefined) throw new MembershipError('CONFLICT', 'The campaign status audit receipt was not recorded.');
      const persisted = await this.persistOrReload(() => this.durableRepository!.persistCampaignStatus({ campaign, audit, idempotency: receipt }));
      if (!persisted) {
        const canonical = this.state.campaigns.get(campaign.id);
        if (canonical === undefined) throw new MembershipError('NOT_FOUND', 'The canonical campaign was not found.');
        return clone(canonical);
      }
    }
    return campaign;
  }

  public async createCoupon(principal: AuthenticatedPrincipal, input: MembershipCouponCreateInput): Promise<MembershipCoupon> {
    return this.serializeWrite(() => this.createCouponInternal(principal, input));
  }

  private async createCouponInternal(principal: AuthenticatedPrincipal, input: MembershipCouponCreateInput): Promise<MembershipCoupon> {
    const coupon = this.withAdminMutation(principal, 'MANAGE_COUPONS', null, 'CREATE_COUPON', input.idempotencyKey, input, (draft) => {
      const code = normalizeCode(input.code);
      if (!/^[A-Z0-9][A-Z0-9_-]{2,79}$/u.test(code) || !Number.isSafeInteger(input.discountValue) || input.discountValue <= 0 || (input.discountKind === 'PERCENTAGE' && input.discountValue > 100) || input.applicablePlans.length === 0 || new Set(input.applicablePlans).size !== input.applicablePlans.length || (input.endsAt !== undefined && input.endsAt !== null && Date.parse(input.endsAt) <= Date.parse(input.startsAt))) {
        throw new MembershipError('VALIDATION', 'The coupon input is invalid.');
      }
      if ([...draft.coupons.values()].some((candidate) => candidate.code === code)) throw new MembershipError('CONFLICT', 'The coupon code already exists.');
      if (input.campaignId !== undefined && input.campaignId !== null && !draft.campaigns.has(input.campaignId)) throw new MembershipError('NOT_FOUND', 'The campaign was not found.');
      const coupon: MembershipCoupon = {
        id: this.runtime.id(),
        code,
        discountKind: input.discountKind,
        discountValue: input.discountValue,
        applicablePlans: [...input.applicablePlans],
        status: 'ACTIVE',
        maxRedemptions: input.maxRedemptions ?? null,
        redeemedCount: 0,
        startsAt: input.startsAt,
        endsAt: input.endsAt ?? null,
        campaignId: input.campaignId ?? null,
      };
      draft.coupons.set(coupon.id, coupon);
      return coupon;
    });
    if (this.durableRepository !== undefined) {
      const audit = [...this.state.adminAudits].reverse().find((entry) => entry.resourceId === coupon.id && entry.action === 'CREATE_COUPON');
      const receipt = [...this.state.idempotency.values()].find((entry) => entry.key.includes(':CREATE_COUPON:') && (entry.result as { readonly id?: unknown }).id === coupon.id);
      if (audit === undefined || receipt === undefined) throw new MembershipError('CONFLICT', 'The coupon audit receipt was not recorded.');
      const persisted = await this.persistOrReload(() => this.durableRepository!.persistCoupon({ coupon, audit, idempotency: receipt }));
      if (!persisted) {
        const canonical = [...this.state.coupons.values()].find((value) => value.code === coupon.code);
        if (canonical === undefined) throw new MembershipError('CONFLICT', 'The canonical coupon could not be loaded.');
        return clone(canonical);
      }
    }
    return coupon;
  }

  public async issueRedemptionCode(principal: AuthenticatedPrincipal, input: MembershipRedemptionCodeCreateInput): Promise<IssuedMembershipRedemptionCode> {
    return this.serializeWrite(() => this.issueRedemptionCodeInternal(principal, input));
  }

  private async issueRedemptionCodeInternal(principal: AuthenticatedPrincipal, input: MembershipRedemptionCodeCreateInput): Promise<IssuedMembershipRedemptionCode> {
    const actor = this.requireAdmin(principal, 'MANAGE_REDEMPTIONS');
    const key = assertIdempotencyKey(input.idempotencyKey);
    const fingerprint = JSON.stringify(input);
    const scopeKey = `admin:${actor.id}:ISSUE_REDEMPTION_CODE:${key}`;
    const existing = this.getIdempotency<Partial<IssuedMembershipRedemptionCode>>(scopeKey, fingerprint);
    const locallyIssued = this.issuedRedemptionCodes.get(scopeKey);
    if (locallyIssued !== undefined && existing !== undefined) return clone(locallyIssued);
    if (locallyIssued !== undefined) this.issuedRedemptionCodes.delete(scopeKey);
    if (existing !== undefined) {
      // The durable receipt intentionally contains only the public definition,
      // never a recoverable redemption secret. The first successful response
      // is the only time its plaintext code is shown.
      throw new MembershipError('IDEMPOTENCY_REPLAY', 'The redemption code was already issued.');
    }
    const issued = this.withAdminMutation(principal, 'MANAGE_REDEMPTIONS', null, 'ISSUE_REDEMPTION_CODE', input.idempotencyKey, input, (draft) => {
      if (!Number.isSafeInteger(input.maxRedemptions) || input.maxRedemptions < 1 || input.maxRedemptions > 1_000_000 || !this.hasCodeBenefit(input) || (input.endsAt !== undefined && input.endsAt !== null && Date.parse(input.endsAt) <= Date.parse(input.startsAt))) {
        throw new MembershipError('VALIDATION', 'The redemption-code input is invalid.');
      }
      const code = this.newRedemptionCode(draft);
      const definition: MembershipRedemptionCode & { readonly codeHash: string } = {
        id: this.runtime.id(),
        codePrefix: `${code.slice(0, 7)}…`,
        codeHash: hashRedemptionCode(code),
        status: 'ACTIVE',
        maxRedemptions: input.maxRedemptions,
        redeemedCount: 0,
        startsAt: input.startsAt,
        endsAt: input.endsAt ?? null,
        membershipDays: input.membershipDays ?? null,
        planCode: input.planCode ?? null,
        storageBytes: input.storageBytes ?? null,
        capability: input.capability ?? null,
        badgeCode: input.badgeCode ?? null,
      };
      draft.redemptionCodes.set(definition.id, definition);
      return { code, definition: this.publicRedemptionCode(definition) };
    });
    this.issuedRedemptionCodes.set(scopeKey, clone(issued));
    // `withAdminMutation` recorded its normal result. Replace it before any
    // snapshot can escape this method so raw redemption codes never persist.
    this.transact((draft) => {
      const receipt = draft.idempotency.get(scopeKey);
      if (receipt === undefined) throw new MembershipError('CONFLICT', 'The redemption-code receipt was not recorded.');
      draft.idempotency.set(scopeKey, { ...receipt, result: { definition: issued.definition } });
      return null;
    });
    if (this.durableRepository !== undefined) {
      const definition = this.state.redemptionCodes.get(issued.definition.id);
      const audit = [...this.state.adminAudits].reverse().find((entry) => entry.resourceId === issued.definition.id && entry.action === 'ISSUE_REDEMPTION_CODE');
      const receipt = [...this.state.idempotency.values()].find((entry) => entry.key.includes(':ISSUE_REDEMPTION_CODE:') && (entry.result as { readonly definition?: { readonly id?: unknown } }).definition?.id === issued.definition.id);
      if (definition === undefined || audit === undefined || receipt === undefined) throw new MembershipError('CONFLICT', 'The redemption-code audit receipt was not recorded.');
      const durableReceipt = { ...receipt, result: { definition: issued.definition } };
      const persisted = await this.persistOrReload(() => this.durableRepository!.persistRedemptionCode({
        definition,
        adminIdentityId: audit.adminId,
        audit,
        idempotency: durableReceipt,
      }));
      if (!persisted) throw new MembershipError('IDEMPOTENCY_REPLAY', 'The redemption code was already issued.');
    }
    return issued;
  }

  public async grantBenefit(principal: AuthenticatedPrincipal, input: MembershipBenefitGrantInput): Promise<MembershipBenefitGrant> {
    return this.serializeWrite(() => this.grantBenefitInternal(principal, input));
  }

  private async grantBenefitInternal(principal: AuthenticatedPrincipal, input: MembershipBenefitGrantInput): Promise<MembershipBenefitGrant> {
    const previous = snapshotFromState(this.state);
    const grant = this.withAdminMutation(principal, 'GRANT_BENEFITS', input.targetUserId, 'GRANT_BENEFIT', input.idempotencyKey, input, (draft, actor, now) => {
      const grant = this.newBenefitGrant(draft, {
        ...input,
        source: input.source ?? 'ADMIN_GRANT',
        startsAt: input.startsAt ?? now,
        operatorId: actor.userId,
      });
      draft.benefitGrants.set(grant.id, grant);
      this.applyBenefitSideEffects(draft, grant, now);
      return grant;
    }, input.reason);
    if (this.durableRepository !== undefined) {
      const previousMembershipIds = new Set(previous.memberships.map((membership) => membership.id));
      const membership = [...this.state.memberships.values()].find(
        (candidate) => candidate.userId === grant.userId && !previousMembershipIds.has(candidate.id),
      ) ?? null;
      const history = membership === null
        ? []
        : [...this.state.membershipHistory.values()].filter((entry) => entry.membershipId === membership.id);
      const entitlements = membership === null
        ? []
        : [...this.state.entitlements.values()].filter((entry) => entry.membershipId === membership.id);
      const audit = [...this.state.adminAudits].reverse().find(
        (entry) => entry.resourceId === grant.id && entry.action === 'GRANT_BENEFIT',
      );
      if (audit === undefined) throw new MembershipError('CONFLICT', 'The benefit grant audit record was not recorded.');
      const receipt = [...this.state.idempotency.values()].find(
        (candidate) => candidate.key.includes(':GRANT_BENEFIT:') && (candidate.result as { readonly id?: unknown }).id === grant.id,
      );
      if (receipt === undefined) throw new MembershipError('CONFLICT', 'The benefit idempotency receipt was not recorded.');
      const persisted = await this.persistOrReload(() => this.durableRepository!.persistBenefitGrant({
        grant: toMembershipDurableBenefitGrantRow(grant),
        membership: membership === null ? null : toMembershipDurableMembershipRow(membership),
        history,
        entitlements,
        audit,
        idempotency: receipt,
      }));
      if (!persisted) {
        const canonical = this.getIdempotency<MembershipBenefitGrant>(receipt.key, receipt.fingerprint);
        if (canonical === undefined) throw new MembershipError('CONFLICT', 'The canonical benefit grant could not be loaded.');
        return canonical;
      }
    }
    return grant;
  }

  public async revokeBenefit(principal: AuthenticatedPrincipal, grantId: string, reason: string, idempotencyKey: string): Promise<MembershipBenefitGrant> {
    return this.serializeWrite(() => this.revokeBenefitInternal(principal, grantId, reason, idempotencyKey));
  }

  private async revokeBenefitInternal(
    principal: AuthenticatedPrincipal,
    grantId: string,
    reason: string,
    idempotencyKey: string,
  ): Promise<MembershipBenefitGrant> {
    const before = snapshotFromState(this.state);
    const grant = this.withAdminMutation(principal, 'GRANT_BENEFITS', null, 'REVOKE_BENEFIT', idempotencyKey, { grantId, reason }, (draft, _actor, now) => {
      const grant = draft.benefitGrants.get(grantId);
      if (grant === undefined) throw new MembershipError('NOT_FOUND', 'The benefit grant was not found.');
      if (grant.revokedAt !== null) return grant;
      const updated = { ...grant, revokedAt: now, reason: `${grant.reason ?? ''}${grant.reason === null ? '' : ' · '}${reason.trim()}` };
      draft.benefitGrants.set(updated.id, updated);
      // A MEMBERSHIP_DAYS grant can create an active subscription. Its source
      // reference is the durable provenance link required to revoke the pass
      // and its materialized plan entitlements together with the grant.
      for (const membership of draft.memberships.values()) {
        if (membership.sourceReference !== `benefit-grant:${grant.id}` || membership.status !== 'ACTIVE') continue;
        const revoked = { ...membership, status: 'REVOKED' as const, revokedAt: now, updatedAt: now };
        draft.memberships.set(revoked.id, revoked);
        this.appendMembershipHistory(draft, revoked, 'REVOKED', revoked.source, now, reason.trim(), principal.userId);
        for (const entitlement of draft.entitlements.values()) {
          if (entitlement.membershipId === revoked.id && entitlement.revokedAt === null) {
            draft.entitlements.set(entitlement.id, { ...entitlement, revokedAt: now });
          }
        }
      }
      return updated;
    }, reason);
    if (this.durableRepository !== undefined && grant.revokedAt !== null) {
      const audit = [...this.state.adminAudits].reverse().find(
        (entry) => entry.resourceId === grant.id && entry.action === 'REVOKE_BENEFIT',
      );
      const receipt = [...this.state.idempotency.values()].find(
        (candidate) => candidate.key.includes(':REVOKE_BENEFIT:') && (candidate.result as { readonly id?: unknown }).id === grant.id,
      );
      if (audit === undefined || receipt === undefined) {
        throw new MembershipError('CONFLICT', 'The benefit revocation audit receipt was not recorded.');
      }
      const persisted = await this.persistOrReload(() => this.durableRepository!.persistBenefitRevocation({
        grant: toMembershipDurableBenefitGrantRow(grant),
        revokedMemberships: [...this.state.memberships.values()]
          .filter((membership) => membership.sourceReference === `benefit-grant:${grant.id}` && membership.status === 'REVOKED')
          .map(toMembershipDurableMembershipRow),
        history: [...this.state.membershipHistory.values()].filter((entry) => !before.membershipHistory.some((prior) => prior.id === entry.id)),
        audit,
        idempotency: receipt,
      }));
      if (!persisted) {
        const canonical = this.state.benefitGrants.get(grantId);
        if (canonical === undefined) throw new MembershipError('NOT_FOUND', 'The canonical benefit grant was not found.');
        return clone(canonical);
      }
    }
    return grant;
  }

  public async listAdminPaymentMetadata(principal: AuthenticatedPrincipal): Promise<readonly Pick<MembershipPayment, 'id' | 'orderId' | 'provider' | 'providerPaymentId' | 'providerTransactionId' | 'amountFen' | 'currency' | 'status' | 'createdAt' | 'verifiedAt'>[]> {
    return this.serializeWrite(() => this.listAdminPaymentMetadataInternal(principal));
  }

  private async listAdminPaymentMetadataInternal(principal: AuthenticatedPrincipal): Promise<readonly Pick<MembershipPayment, 'id' | 'orderId' | 'provider' | 'providerPaymentId' | 'providerTransactionId' | 'amountFen' | 'currency' | 'status' | 'createdAt' | 'verifiedAt'>[]> {
    const actor = this.requireAdmin(principal, 'VIEW_PAYMENT_METADATA');
    const audit = this.transact((draft) => {
      this.appendAdminAudit(draft, actor, null, 'VIEW_PAYMENT_METADATA', 'READ_PAYMENT_METADATA', null, null);
      return draft.adminAudits.at(-1)!;
    });
    if (this.durableRepository !== undefined) {
      await this.persistOrReload(() => this.durableRepository!.persistAdminAudit({ audit }));
    }
    return [...this.state.payments.values()].sort((left, right) => right.createdAt.localeCompare(left.createdAt)).map(clone);
  }

  /** Diagnostic read for a separately authenticated membership Admin only. */
  public getAdminAudits(principal: AuthenticatedPrincipal): readonly MembershipAdminAudit[] {
    this.requireAdmin(principal, 'VIEW_PAYMENT_METADATA');
    return this.state.adminAudits.map(clone);
  }

  public toSnapshotForTrustedPersistence(): MembershipStateSnapshot { return snapshotFromState(this.state); }

  /**
   * Server-only reconciliation hook for a scheduled worker. Paid access is
   * already time-bounded at authorization time; this job makes expired
   * memberships/orders and coupon-slot releases durable for customer history
   * and restart recovery. It deliberately has no consumer API route.
   */
  public async reconcileExpiry(): Promise<{ readonly expiredMemberships: number; readonly expiredOrders: number }> {
    return this.serializeWrite(async () => {
      const now = this.runtime.now();
      const nowMs = Date.parse(now);
      const previous = snapshotFromState(this.state);
      const expiredMembershipIds = previous.memberships
        .filter((membership) => membership.status === 'ACTIVE' && Date.parse(membership.expiresAt) <= nowMs)
        .map((membership) => membership.id);
      const expiredOrderIds = previous.orders
        .filter((order) => (order.status === 'CREATED' || order.status === 'PENDING_PAYMENT') && Date.parse(order.expiresAt) <= nowMs)
        .map((order) => order.id);
      if (expiredMembershipIds.length === 0 && expiredOrderIds.length === 0) {
        return { expiredMemberships: 0, expiredOrders: 0 };
      }
      this.applyExpiryToState(now, nowMs);
      if (this.durableRepository !== undefined) {
        const membershipIds = new Set(expiredMembershipIds);
        const orderIds = new Set(expiredOrderIds);
        const memberships = [...this.state.memberships.values()]
          .filter((membership) => membershipIds.has(membership.id))
          .map(toMembershipDurableMembershipRow);
        const history = [...this.state.membershipHistory.values()]
          .filter((entry) => membershipIds.has(entry.membershipId) && entry.event === 'EXPIRED' && entry.occurredAt === now);
        const orders = [...this.state.orders.values()]
          .filter((order) => orderIds.has(order.id))
          .map(toMembershipDurableOrderRow);
        const couponReleases = previous.redemptions.filter(
          (redemption) => redemption.orderId !== null && orderIds.has(redemption.orderId) && redemption.couponId !== null,
        );
        await this.persistOrReload(() => this.durableRepository!.persistExpiry({
          memberships,
          history,
          orders,
          couponReleases,
        }));
        // Always rehydrate a reconciliation run. Another worker can win one
        // subset of rows, and the database is the canonical final projection.
        await this.reloadDurableState();
      }
      return { expiredMemberships: expiredMembershipIds.length, expiredOrders: expiredOrderIds.length };
    });
  }

  /**
   * Server-scheduler reconciliation probe for pending payment attempts. It
   * identifies a provider `SUCCEEDED` / internal `PENDING_PAYMENT` mismatch,
   * but never turns a provider query response into paid access. The callback
   * signature or provider-specific server transaction verification still has
   * to pass through `receivePaymentCallback` before fulfillment.
   */
  public async reconcilePendingPayments(): Promise<MembershipPaymentReconciliationSummary> {
    this.assertDurableStateHealthy();
    const attempts = [...this.state.payments.values()]
      .filter((payment) => payment.status === 'PENDING')
      .map(clone);
    let pending = 0;
    let awaitingVerification = 0;
    let closed = 0;
    let providerUnavailable = 0;
    for (const payment of attempts) {
      const provider = this.providers.get(payment.provider);
      if (provider === undefined) {
        providerUnavailable += 1;
        continue;
      }
      try {
        const status = await provider.queryPayment({ providerPaymentId: payment.providerPaymentId });
        if (status.status === 'SUCCEEDED') awaitingVerification += 1;
        else if (status.status === 'CLOSED') closed += 1;
        else pending += 1;
      } catch (error) {
        if (error instanceof MembershipError && error.code === 'PROVIDER_UNAVAILABLE') {
          providerUnavailable += 1;
          continue;
        }
        throw error;
      }
    }
    return { scanned: attempts.length, pending, awaitingVerification, closed, providerUnavailable };
  }

  private applyVerifiedPayment(
    draft: MembershipState,
    providerCode: PaymentProviderCode,
    callback: VerifiedPaymentCallback,
  ): { readonly order: MembershipOrder; readonly membership: Membership } {
    if (!Number.isSafeInteger(callback.amountFen) || callback.amountFen < 0 || callback.currency !== 'CNY' || Number.isNaN(Date.parse(callback.paidAt))) {
      throw new MembershipError('PAYMENT_NOT_VERIFIED', 'The verified callback payload is invalid.');
    }
    const eventKey = `${providerCode}:${callback.providerTransactionId}`;
    const replay = draft.paymentEvents.get(eventKey);
    if (replay !== undefined) {
      const order = draft.orders.get(replay.orderId);
      const membership = order === undefined ? undefined : [...draft.memberships.values()].find((candidate) => candidate.orderId === order.id);
      if (order === undefined || membership === undefined) throw new MembershipError('PAYMENT_REPLAY', 'A prior payment callback cannot be reconciled.');
      return { order, membership };
    }
    const order = draft.orders.get(callback.orderId);
    if (order === undefined) throw new MembershipError('NOT_FOUND', 'The payment order was not found.');
    if (order.provider !== providerCode) throw new MembershipError('PAYMENT_PROVIDER_MISMATCH', 'The payment provider does not match the order.');
    if (Date.parse(order.expiresAt) <= Date.parse(this.runtime.now()) || order.status === 'EXPIRED') {
      draft.orders.set(order.id, { ...order, status: 'EXPIRED', updatedAt: this.runtime.now() });
      throw new MembershipError('ORDER_EXPIRED', 'The payment order has expired.');
    }
    if (order.status !== 'PENDING_PAYMENT' && order.status !== 'CREATED') throw new MembershipError('ORDER_NOT_PAYABLE', 'The order cannot accept a payment callback.');
    if (callback.amountFen !== order.payableAmountFen) throw new MembershipError('PAYMENT_AMOUNT_MISMATCH', 'The callback amount does not match the server order.');
    if (callback.planCode !== undefined && callback.planCode !== order.planCode) {
      throw new MembershipError('PAYMENT_PLAN_MISMATCH', 'The verified provider product does not match the server order plan.');
    }
    if (callback.currency !== order.currency) throw new MembershipError('PAYMENT_CURRENCY_MISMATCH', 'The callback currency does not match the server order.');

    const payment = [...draft.payments.values()].find((candidate) => candidate.orderId === order.id && candidate.provider === providerCode);
    if (payment === undefined) throw new MembershipError('PAYMENT_NOT_VERIFIED', 'No pending server payment exists for this callback.');
    const now = this.runtime.now();
    const paidOrder: MembershipOrder = { ...order, status: 'PAID', paidAt: callback.paidAt, updatedAt: now };
    draft.orders.set(paidOrder.id, paidOrder);
    draft.payments.set(payment.id, { ...payment, providerTransactionId: callback.providerTransactionId, status: 'SUCCEEDED', verifiedAt: now });
    draft.paymentEvents.set(eventKey, { id: this.runtime.id(), provider: providerCode, providerTransactionId: callback.providerTransactionId, orderId: order.id, amountFen: callback.amountFen, currency: callback.currency, verifiedAt: now });
    const membership = this.activatePaidMembership(draft, paidOrder, now);
    const fulfilledOrder = draft.orders.get(paidOrder.id);
    if (fulfilledOrder === undefined) throw new MembershipError('CONFLICT', 'The paid order could not be fulfilled.');
    return { order: clone(fulfilledOrder), membership };
  }

  private activatePaidMembership(draft: MembershipState, order: MembershipOrder, now: string): Membership {
    const active = this.currentMembershipFrom(draft, order.userId, now);
    if (active !== null && active.planCode !== order.planCode) throw new MembershipError('UPGRADE_POLICY_REQUIRED', 'Upgrades require an owner-approved policy.');
    const startsAt = active !== null && active.planCode === order.planCode && Date.parse(active.expiresAt) > Date.parse(now)
      ? active.expiresAt
      : now;
    const membership: Membership = {
      id: this.runtime.id(),
      userId: order.userId,
      orderId: order.id,
      planCode: order.planCode,
      status: 'ACTIVE',
      source: 'PURCHASE',
      sourceReference: null,
      startsAt,
      expiresAt: addMonthlyPass(startsAt),
      createdAt: now,
      updatedAt: now,
      revokedAt: null,
    };
    draft.memberships.set(membership.id, membership);
    this.appendMembershipHistory(draft, membership, startsAt === now ? 'ACTIVATED' : 'EXTENDED', 'PURCHASE', now, null, null);
    this.materializePlanEntitlements(draft, membership, now);
    draft.orders.set(order.id, { ...order, status: 'FULFILLED', updatedAt: now });
    return membership;
  }

  private applyCodeBenefits(
    draft: MembershipState,
    userId: string,
    definition: MembershipRedemptionCode,
    idempotencyKey: string,
    now: string,
  ): readonly string[] {
    const grants: MembershipBenefitGrant[] = [];
    if (definition.membershipDays !== null) {
      grants.push(this.newBenefitGrant(draft, {
        targetUserId: userId,
        type: 'MEMBERSHIP_DAYS',
        source: 'REDEMPTION',
        membershipDays: definition.membershipDays,
        planCode: definition.planCode === null || definition.planCode === 'FREE' ? 'GO' : definition.planCode,
        reason: 'Redemption code membership benefit',
        startsAt: now,
        idempotencyKey: `${idempotencyKey}:membership`,
        operatorId: null,
      }));
    }
    if (definition.storageBytes !== null) {
      grants.push(this.newBenefitGrant(draft, {
        targetUserId: userId,
        type: 'STORAGE_BYTES',
        source: 'REDEMPTION',
        storageBytes: definition.storageBytes,
        reason: 'Redemption code storage benefit',
        startsAt: now,
        idempotencyKey: `${idempotencyKey}:storage`,
        operatorId: null,
      }));
    }
    if (definition.capability !== null) {
      grants.push(this.newBenefitGrant(draft, {
        targetUserId: userId,
        type: 'TEMP_ENTITLEMENT',
        source: 'REDEMPTION',
        capability: definition.capability,
        reason: 'Redemption code feature benefit',
        startsAt: now,
        endsAt: definition.endsAt,
        idempotencyKey: `${idempotencyKey}:capability`,
        operatorId: null,
      }));
    }
    if (definition.badgeCode !== null) {
      grants.push(this.newBenefitGrant(draft, {
        targetUserId: userId,
        type: 'BADGE',
        source: 'REDEMPTION',
        badgeCode: definition.badgeCode,
        reason: 'Redemption code badge benefit',
        startsAt: now,
        idempotencyKey: `${idempotencyKey}:badge`,
        operatorId: null,
      }));
    }
    for (const grant of grants) {
      draft.benefitGrants.set(grant.id, grant);
      this.applyBenefitSideEffects(draft, grant, now);
    }
    return grants.map((grant) => grant.id);
  }

  private newBenefitGrant(
    _draft: MembershipState,
    input: Omit<MembershipBenefitGrantInput, 'idempotencyKey'> & {
      readonly idempotencyKey: string;
      readonly startsAt: string;
      readonly source: MembershipSource;
      readonly operatorId: string | null;
    },
  ): MembershipBenefitGrant {
    if (input.reason.trim() === '' || input.reason.length > 2_000 || Number.isNaN(Date.parse(input.startsAt)) || (input.endsAt !== undefined && input.endsAt !== null && Date.parse(input.endsAt) <= Date.parse(input.startsAt))) {
      throw new MembershipError('VALIDATION', 'The benefit grant is invalid.');
    }
    if ((input.type === 'TEMP_ENTITLEMENT' || input.type === 'FEATURE_ACCESS') && input.capability === undefined) throw new MembershipError('VALIDATION', 'A feature benefit requires a capability.');
    if (input.type === 'MEMBERSHIP_DAYS' && (!Number.isSafeInteger(input.membershipDays) || (input.membershipDays ?? 0) < 1 || input.planCode === undefined || input.planCode === null)) throw new MembershipError('VALIDATION', 'A membership-day benefit requires a plan and positive days.');
    if (input.type === 'STORAGE_BYTES' && (!Number.isSafeInteger(input.storageBytes) || (input.storageBytes ?? 0) < 1)) throw new MembershipError('VALIDATION', 'A storage benefit requires positive integer bytes.');
    if (input.type === 'COUPON' && (input.couponId === undefined || input.couponId === null)) throw new MembershipError('VALIDATION', 'A coupon benefit requires a coupon id.');
    if (input.type === 'BADGE' && (input.badgeCode === undefined || input.badgeCode === null || input.badgeCode.trim() === '')) throw new MembershipError('VALIDATION', 'A badge benefit requires a badge code.');
    return {
      id: this.runtime.id(),
      userId: input.targetUserId,
      type: input.type,
      source: input.source,
      capability: input.capability ?? null,
      membershipDays: input.membershipDays ?? null,
      planCode: input.planCode ?? null,
      storageBytes: input.storageBytes ?? null,
      badgeCode: input.badgeCode ?? null,
      couponId: input.couponId ?? null,
      campaignId: input.campaignId ?? null,
      startsAt: input.startsAt,
      endsAt: input.endsAt ?? null,
      revokedAt: null,
      idempotencyKey: input.idempotencyKey,
      reason: input.reason,
      operatorId: input.operatorId,
    };
  }

  private newCampaignBenefit(
    input: MembershipCampaignBenefitInput,
    campaignEndsAt: string | null,
  ): MembershipCampaignBenefit {
    if (input.type === 'COUPON') {
      throw new MembershipError('VALIDATION', 'Coupons are campaign-gated at checkout and cannot be claimed as a campaign benefit.');
    }
    const endsAt = input.endsAt ?? campaignEndsAt;
    const startsAt = this.runtime.now();
    // Reuse the one canonical grant-shape validator without persisting a
    // throwaway grant. Campaign claims supply the actual user and start time.
    this.newBenefitGrant(this.state, {
      targetUserId: '__campaign-template__',
      type: input.type,
      source: 'CAMPAIGN',
      capability: input.capability,
      membershipDays: input.membershipDays,
      planCode: input.planCode,
      storageBytes: input.storageBytes,
      badgeCode: input.badgeCode,
      couponId: input.couponId,
      campaignId: null,
      startsAt,
      endsAt,
      reason: 'Campaign benefit template',
      idempotencyKey: `campaign-template:${this.runtime.id()}`,
      operatorId: null,
    });
    return {
      id: this.runtime.id(),
      type: input.type,
      capability: input.capability ?? null,
      membershipDays: input.membershipDays ?? null,
      planCode: input.planCode ?? null,
      storageBytes: input.storageBytes ?? null,
      badgeCode: input.badgeCode ?? null,
      couponId: input.couponId ?? null,
      endsAt,
    };
  }

  private applyBenefitSideEffects(draft: MembershipState, grant: MembershipBenefitGrant, now: string): void {
    if (grant.type === 'MEMBERSHIP_DAYS' && grant.membershipDays !== null && grant.planCode !== null) {
      const active = this.currentMembershipFrom(draft, grant.userId, now);
      if (active !== null && active.planCode !== grant.planCode) throw new MembershipError('UPGRADE_POLICY_REQUIRED', 'Membership benefits cannot apply an unapproved upgrade.');
      const startsAt = active !== null && Date.parse(active.expiresAt) > Date.parse(now) ? active.expiresAt : now;
      const membership: Membership = {
        id: this.runtime.id(),
        userId: grant.userId,
        orderId: null,
        planCode: grant.planCode,
        status: 'ACTIVE',
        source: this.membershipSourceForGrant(grant.source),
        sourceReference: `benefit-grant:${grant.id}`,
        startsAt,
        expiresAt: addDays(startsAt, grant.membershipDays),
        createdAt: now,
        updatedAt: now,
        revokedAt: null,
      };
      draft.memberships.set(membership.id, membership);
      this.appendMembershipHistory(draft, membership, startsAt === now ? 'ACTIVATED' : 'EXTENDED', membership.source, now, grant.reason, grant.operatorId);
      this.materializePlanEntitlements(draft, membership, now);
    }
    if (grant.type === 'BADGE' && grant.badgeCode !== null) {
      draft.badges.set(`${grant.userId}:${grant.badgeCode}`, { code: grant.badgeCode, name: grant.badgeCode, grantedAt: now, grantId: grant.id });
    }
  }

  private materializePlanEntitlements(draft: MembershipState, membership: Membership, now: string): void {
    const codes = this.planCapabilitiesFor(membership.planCode);
    for (const code of codes) {
      const entitlement: MembershipEntitlement = {
        id: this.runtime.id(),
        userId: membership.userId,
        code,
        source: 'MEMBERSHIP',
        startsAt: membership.startsAt,
        endsAt: membership.expiresAt,
        revokedAt: null,
        membershipId: membership.id,
        grantId: null,
      };
      draft.entitlements.set(entitlement.id, entitlement);
    }
    void now;
  }

  private effectiveEntitlements(principal: AuthenticatedPrincipal, now: string): readonly MembershipEntitlement[] {
    const simulatedPlan = this.simulationResolver?.resolve(principal)?.planCode;
    const planCode = simulatedPlan ?? this.effectivePlanCode(principal, now);
    const planSource = simulatedPlan === undefined ? 'PLAN' as const : 'SIMULATION' as const;
    return this.entitlementsFor(principal.userId, planCode, now, planSource);
  }

  private actualEntitlements(userId: string, now: string): readonly MembershipEntitlement[] {
    return this.entitlementsFor(userId, this.currentMembershipFor(userId, now)?.planCode ?? 'FREE', now, 'PLAN');
  }

  private entitlementsFor(
    userId: string,
    planCode: PlanCode,
    now: string,
    planSource: 'PLAN' | 'SIMULATION',
  ): readonly MembershipEntitlement[] {
    const nowMs = Date.parse(now);
    const entitlementByCode = new Map<CapabilityCode, MembershipEntitlement>();
    for (const code of this.planCapabilitiesFor(planCode)) {
      entitlementByCode.set(code, { id: `plan:${planCode}:${code}`, userId, code, source: planSource, startsAt: now, endsAt: null, revokedAt: null, membershipId: null, grantId: null });
    }
    for (const grant of this.state.benefitGrants.values()) {
      if (grant.userId !== userId || grant.capability === null || !activeAt(grant.startsAt, grant.endsAt, grant.revokedAt, nowMs)) continue;
      const source = grant.source === 'CAMPAIGN' ? 'CAMPAIGN' : grant.source === 'ADMIN_GRANT' ? 'MANUAL' : grant.source === 'TRIAL' || grant.source === 'REDEMPTION' ? 'TEMPORARY' : 'BENEFIT';
      entitlementByCode.set(grant.capability, { id: `grant:${grant.id}`, userId: grant.userId, code: grant.capability, source, startsAt: grant.startsAt, endsAt: grant.endsAt, revokedAt: grant.revokedAt, membershipId: null, grantId: grant.id });
    }
    return [...entitlementByCode.values()].sort((left, right) => left.code.localeCompare(right.code)).map(clone);
  }

  private effectivePlanCode(principal: AuthenticatedPrincipal, now: string): PlanCode {
    const simulation = this.simulationResolver?.resolve(principal);
    if (simulation !== null && simulation !== undefined) return simulation.planCode;
    return this.currentMembershipFor(principal.userId, now)?.planCode ?? 'FREE';
  }

  private currentMembershipFor(userId: string, now: string): Membership | null {
    return this.currentMembershipFrom(this.state, userId, now);
  }

  private currentMembershipFrom(state: MembershipState, userId: string, now: string): Membership | null {
    const nowMs = Date.parse(now);
    const memberships = [...state.memberships.values()].filter((membership) => membership.userId === userId && membership.status === 'ACTIVE' && membership.revokedAt === null && Date.parse(membership.startsAt) <= nowMs && nowMs < Date.parse(membership.expiresAt));
    if (memberships.length === 0) return null;
    return clone(memberships.sort((left, right) => planRank(right.planCode) - planRank(left.planCode) || right.expiresAt.localeCompare(left.expiresAt))[0]!);
  }

  private storageQuota(userId: string, planCode: PlanCode, now: string): MembershipStorageQuota {
    const nowMs = Date.parse(now);
    let benefitBytes = 0;
    let manualGrantBytes = 0;
    for (const grant of this.state.benefitGrants.values()) {
      if (grant.userId !== userId || grant.type !== 'STORAGE_BYTES' || grant.storageBytes === null || !activeAt(grant.startsAt, grant.endsAt, grant.revokedAt, nowMs)) continue;
      if (grant.source === 'ADMIN_GRANT') manualGrantBytes += grant.storageBytes;
      else benefitBytes += grant.storageBytes;
    }
    const planBytes = this.planStorageBytes[planCode];
    const totalBytes = this.baseStorageBytes + planBytes + benefitBytes + manualGrantBytes;
    const usedBytes = this.storageUsage.getUsedBytes(userId);
    return { baseBytes: this.baseStorageBytes, planBytes, benefitBytes, manualGrantBytes, totalBytes, usedBytes, state: usedBytes > totalBytes ? 'OVER_QUOTA' : 'WITHIN_QUOTA', canUpload: usedBytes < totalBytes };
  }

  private planCapabilitiesFor(planCode: PlanCode): readonly CapabilityCode[] {
    const values = new Set<CapabilityCode>();
    for (const candidate of planOrder) {
      if (planRank(candidate) > planRank(planCode)) break;
      for (const capability of planCapabilities[candidate]) values.add(capability);
    }
    return [...values];
  }

  private findActiveCoupon(draft: MembershipState, code: string, planCode: PlanCode, principal: AuthenticatedPrincipal, now: string): MembershipCoupon {
    const coupon = [...draft.coupons.values()].find((candidate) => candidate.code === code);
    if (coupon === undefined || coupon.status !== 'ACTIVE' || Date.parse(coupon.startsAt) > Date.parse(now) || (coupon.endsAt !== null && Date.parse(coupon.endsAt) <= Date.parse(now)) || !coupon.applicablePlans.includes(planCode)) {
      throw new MembershipError('COUPON_INVALID', 'The coupon is invalid or unavailable.');
    }
    if (coupon.maxRedemptions !== null && coupon.redeemedCount >= coupon.maxRedemptions) throw new MembershipError('COUPON_INVALID', 'The coupon is unavailable.');
    const actualPlanCode = this.currentMembershipFrom(draft, principal.userId, now)?.planCode ?? 'FREE';
    if (!this.isCouponAudienceAvailable(coupon, principal, actualPlanCode, now, draft)) throw new MembershipError('COUPON_INVALID', 'The coupon is unavailable.');
    if ([...draft.redemptions.values()].some((redemption) => redemption.couponId === coupon.id && redemption.userId === principal.userId)) throw new MembershipError('COUPON_ALREADY_USED', 'This coupon has already been used.');
    return coupon;
  }

  private isCouponAudienceAvailable(
    coupon: MembershipCoupon,
    principal: AuthenticatedPrincipal,
    actualPlanCode: PlanCode,
    now: string,
    state: MembershipState = this.state,
  ): boolean {
    if (coupon.campaignId === null) return true;
    const campaign = state.campaigns.get(coupon.campaignId);
    return campaign !== undefined && this.isCampaignClaimableFor(campaign, principal, actualPlanCode, now);
  }

  private isCampaignClaimableFor(
    campaign: MembershipCampaign,
    principal: AuthenticatedPrincipal,
    actualPlanCode: PlanCode,
    now: string,
    state: MembershipState = this.state,
  ): boolean {
    if (
      campaign.status !== 'ACTIVE' ||
      Date.parse(campaign.startsAt) > Date.parse(now) ||
      (campaign.endsAt !== null && Date.parse(now) >= Date.parse(campaign.endsAt))
    ) return false;
    if (campaign.audience === 'SELECTED_USERS') {
      return state.campaignTargets.get(campaign.id)?.has(principal.userId) === true || this.campaignAudienceResolver.isEligible({ principal, campaign, actualPlanCode });
    }
    if (campaign.audience === 'INVITED_USERS') {
      return [...state.inviteRelationships.values()].some((relationship) => relationship.invitedUserId === principal.userId) || this.campaignAudienceResolver.isEligible({ principal, campaign, actualPlanCode });
    }
    return this.campaignAudienceResolver.isEligible({ principal, campaign, actualPlanCode });
  }

  private assertNoUnpricedUpgrade(draft: MembershipState, userId: string, planCode: PlanCode, now: string): void {
    const active = this.currentMembershipFrom(draft, userId, now);
    if (active !== null && active.planCode !== planCode) throw new MembershipError('UPGRADE_POLICY_REQUIRED', 'The upgrade/proration policy is awaiting owner approval.');
  }

  private isRedemptionCodeActive(code: MembershipRedemptionCode, now: string): boolean {
    return code.status === 'ACTIVE' && Date.parse(code.startsAt) <= Date.parse(now) && (code.endsAt === null || Date.parse(now) < Date.parse(code.endsAt));
  }

  private hasCodeBenefit(input: MembershipRedemptionCodeCreateInput): boolean {
    return input.membershipDays !== undefined || input.storageBytes !== undefined || input.capability !== undefined || input.badgeCode !== undefined;
  }

  private newRedemptionCode(draft: MembershipState): string {
    for (let attempt = 0; attempt < 5; attempt += 1) {
      const code = `MEZ-${Buffer.from(this.runtime.randomCodeBytes(24)).toString('base64url').toUpperCase()}`;
      const digest = hashRedemptionCode(code);
      if (![...draft.redemptionCodes.values()].some((candidate) => candidate.codeHash === digest)) return code;
    }
    throw new MembershipError('CONFLICT', 'A unique redemption code could not be generated.');
  }

  private publicRedemptionCode(value: MembershipRedemptionCode): MembershipRedemptionCode {
    const { codeHash, ...publicValue } = value as MembershipRedemptionCode & { readonly codeHash: string };
    void codeHash;
    return clone(publicValue);
  }

  private membershipSourceForGrant(source: MembershipBenefitGrant['source']): MembershipSource {
    if (source === 'TRIAL' || source === 'COUPON' || source === 'REDEMPTION' || source === 'CAMPAIGN' || source === 'ADMIN_GRANT' || source === 'INVITE_REWARD' || source === 'FOUNDER_INTERNAL' || source === 'SYSTEM' || source === 'PURCHASE') return source;
    return 'SYSTEM';
  }

  private appendMembershipHistory(
    draft: MembershipState,
    membership: Membership,
    event: MembershipHistoryEvent['event'],
    source: MembershipSource,
    occurredAt: string,
    reason: string | null,
    actorUserId: string | null,
  ): void {
    const history: MembershipHistoryEvent = { id: this.runtime.id(), membershipId: membership.id, userId: membership.userId, event, source, occurredAt, reason, actorUserId };
    draft.membershipHistory.set(history.id, history);
  }

  private expireDueRecords(): void {
    // Durable production uses the explicit asynchronous scheduler above.
    // Synchronous read APIs must never mutate an in-memory shadow and then
    // leave the database/coupon reservation behind.
    if (this.durableRepository !== undefined) return;
    const now = this.runtime.now();
    const nowMs = Date.parse(now);
    const shouldExpire = [...this.state.memberships.values()].some((membership) => membership.status === 'ACTIVE' && Date.parse(membership.expiresAt) <= nowMs) || [...this.state.orders.values()].some((order) => (order.status === 'CREATED' || order.status === 'PENDING_PAYMENT') && Date.parse(order.expiresAt) <= nowMs);
    if (!shouldExpire) return;
    this.applyExpiryToState(now, nowMs);
  }

  private applyExpiryToState(now: string, nowMs: number): void {
    this.transact((draft) => {
      for (const membership of draft.memberships.values()) {
        if (membership.status === 'ACTIVE' && Date.parse(membership.expiresAt) <= nowMs) {
          const expired = { ...membership, status: 'EXPIRED' as const, updatedAt: now };
          draft.memberships.set(expired.id, expired);
          this.appendMembershipHistory(draft, expired, 'EXPIRED', expired.source, now, null, null);
        }
      }
      for (const order of draft.orders.values()) {
        if ((order.status === 'CREATED' || order.status === 'PENDING_PAYMENT') && Date.parse(order.expiresAt) <= nowMs) {
          draft.orders.set(order.id, { ...order, status: 'EXPIRED', updatedAt: now });
          const reservation = [...draft.redemptions.values()].find((redemption) => redemption.orderId === order.id && redemption.couponId !== null);
          if (reservation !== undefined && reservation.couponId !== null) {
            const coupon = draft.coupons.get(reservation.couponId);
            if (coupon !== undefined) draft.coupons.set(coupon.id, { ...coupon, redeemedCount: Math.max(0, coupon.redeemedCount - 1) });
            draft.redemptions.delete(reservation.id);
          }
        }
      }
      return null;
    });
  }

  private requireAdmin(principal: AuthenticatedPrincipal, capability: MembershipAdminCapabilityCode): MembershipAdminActor {
    if (this.administration === undefined) throw new MembershipError('FORBIDDEN', 'The membership administration boundary is not connected.');
    return this.administration.authorize(principal, capability);
  }

  private withAdminMutation<T>(
    principal: AuthenticatedPrincipal,
    capability: MembershipAdminCapabilityCode,
    targetUserId: string | null,
    action: string,
    idempotencyKey: string,
    input: unknown,
    operation: (draft: MembershipState, actor: MembershipAdminActor, now: string) => T,
    reason: string | null = null,
  ): T {
    const actor = this.requireAdmin(principal, capability);
    const key = assertIdempotencyKey(idempotencyKey);
    const fingerprint = JSON.stringify(input);
    const existing = this.getIdempotency<T>(`admin:${actor.id}:${action}:${key}`, fingerprint);
    if (existing !== undefined) return existing;
    return this.transact((draft) => {
      const now = this.runtime.now();
      const result = operation(draft, actor, now);
      this.appendAdminAudit(draft, actor, targetUserId, capability, action, this.resourceIdOf(result), reason);
      this.rememberIdempotency(draft, `admin:${actor.id}:${action}:${key}`, fingerprint, result);
      return result;
    });
  }

  private appendAdminAudit(
    draft: MembershipState,
    actor: MembershipAdminActor,
    targetUserId: string | null,
    capability: MembershipAdminCapabilityCode,
    action: string,
    resourceId: string | null,
    reason: string | null,
  ): void {
    draft.adminAudits.push({ id: this.runtime.id(), adminId: actor.id, actorUserId: actor.userId, targetUserId, capability, action, resourceId, reason, createdAt: this.runtime.now() });
  }

  private resourceIdOf(value: unknown): string | null {
    return typeof value === 'object' && value !== null && typeof (value as { id?: unknown }).id === 'string' ? (value as { id: string }).id : null;
  }

  private getIdempotency<T>(key: string, fingerprint: string): T | undefined {
    const existing = this.state.idempotency.get(key);
    if (existing === undefined) return undefined;
    if (existing.fingerprint !== fingerprint) throw new MembershipError('IDEMPOTENCY_REPLAY', 'This idempotency key was already used for a different request.');
    return clone(existing.result as T);
  }

  private rememberIdempotency(draft: MembershipState, key: string, fingerprint: string, result: unknown): void {
    draft.idempotency.set(key, { key, fingerprint, result: clone(result) });
  }

  /** Serializes mutation paths in this process while the durable transaction
   * is outstanding. Cross-process serialization is handled by the Postgres
   * row lock and provider-event uniqueness in PostgresMembershipRepository. */
  private async serializeWrite<T>(operation: () => Promise<T>): Promise<T> {
    this.assertDurableStateHealthy();
    const previous = this.serializedWriteTail;
    let release = (): void => {};
    this.serializedWriteTail = new Promise<void>((resolve) => { release = resolve; });
    await previous;
    try {
      return await operation();
    } finally {
      release();
    }
  }

  /**
   * The durable database is the source of truth. Mutations intentionally make
   * a short-lived local projection first so domain validation can remain
   * deterministic, but a rejected transaction or an idempotency collision
   * always replaces that speculative projection with a fresh durable snapshot.
   * Restoring an old in-process snapshot would erase a concurrent commit from
   * another request, so it is specifically forbidden here.
   */
  private async persistOrReload(
    persist: () => Promise<MembershipDurableWriteResult>,
  ): Promise<boolean> {
    if (this.durableRepository === undefined) return true;
    try {
      const result = await persist();
      if (!result.applied) await this.reloadDurableState();
      return result.applied;
    } catch (error) {
      try {
        await this.reloadDurableState();
      } catch {
        // Do not retain speculative entitlements/orders if both the write and
        // subsequent reload failed. Any later authorization/read request is
        // fail-closed until the process is rebuilt from a durable snapshot.
        const empty = snapshotFromState(emptyState());
        this.state = stateFromSnapshot(empty);
        this.persistence.write(empty);
        this.durableStateHealthy = false;
      }
      if (error instanceof MembershipDurableIdempotencyConflictError) {
        throw new MembershipError('IDEMPOTENCY_REPLAY', 'This idempotency key was already used for a different request.');
      }
      throw error;
    }
  }

  private async reloadDurableState(): Promise<void> {
    if (this.durableRepository === undefined) return;
    const snapshot = await this.durableRepository.loadSnapshot();
    this.state = stateFromSnapshot(snapshot);
    this.persistence.write(snapshot);
    this.durableStateHealthy = true;
  }

  private assertDurableStateHealthy(): void {
    if (this.durableRepository !== undefined && !this.durableStateHealthy) {
      throw new MembershipError('PROVIDER_UNAVAILABLE', 'Membership state is temporarily unavailable.');
    }
  }

  private transact<T>(operation: (draft: MembershipState) => T): T {
    this.assertDurableStateHealthy();
    const draft = stateFromSnapshot(snapshotFromState(this.state));
    const result = operation(draft);
    this.persistence.write(snapshotFromState(draft));
    this.state = draft;
    return clone(result);
  }
}

/** Structural adapter for the Phase 5 Messaging service. It is server-side
 * only: both methods delegate to the membership engine and do not accept a
 * caller-provided plan, benefit or entitlement list. */
export interface MembershipMessagingEntitlementResolver {
  has(principal: AuthenticatedPrincipal, capability: CapabilityCode): boolean;
  hasUser(userId: string, capability: CapabilityCode): boolean;
}

export function createMessagingEntitlementResolver(
  membership: MembershipService,
): MembershipMessagingEntitlementResolver {
  return Object.freeze({
    has: (principal: AuthenticatedPrincipal, capability: CapabilityCode) => membership.hasActual(principal, capability),
    hasUser: (userId: string, capability: CapabilityCode) => membership.hasActualUser(userId, capability),
  });
}

/** Structural adapter for Community. A paid membership may unlock an
 * explicitly published Founder audience, but never a different user's private
 * archive, media, messages, or other owner-scoped records. */
export interface MembershipCommunityEntitlementResolver {
  has(principal: AuthenticatedPrincipal, capability: CapabilityCode): boolean;
  canReadFounderAudience(principal: AuthenticatedPrincipal, audience: FounderAudience): boolean;
}

export function createCommunityEntitlementResolver(
  membership: MembershipService,
): MembershipCommunityEntitlementResolver {
  return Object.freeze({
    has: (principal: AuthenticatedPrincipal, capability: CapabilityCode) => membership.hasActual(principal, capability),
    canReadFounderAudience: (principal: AuthenticatedPrincipal, audience: FounderAudience) => membership.canReadFounderAudience(principal, audience),
  });
}
