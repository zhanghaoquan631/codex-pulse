import {
  capabilityCodes,
  planCapabilities,
  type BenefitGrant,
  type CapabilityCode,
  type PlanCode,
  type OrderStatus,
  type PaymentProviderCode,
} from '@me-zip/shared-types';

export interface CapabilityDecision {
  readonly capability: CapabilityCode;
  readonly allowed: boolean;
  readonly source: 'PLAN' | 'BENEFIT' | 'NONE';
  readonly expiresAt: string | null;
}

/**
 * Resolve additive capabilities on the server. `plan` is already derived from the
 * server-side subscription; callers must never pass a client-controlled plan here.
 */
export function resolveCapabilities(
  plan: PlanCode,
  grants: readonly BenefitGrant[] = [],
  now: Date = new Date(),
): ReadonlySet<CapabilityCode> {
  const planOrder: readonly PlanCode[] = ['FREE', 'GO', 'PLUS', 'PRO', 'PRO_MAX'];
  const planIndex = planOrder.indexOf(plan);
  const resolved = new Set<CapabilityCode>();
  for (const [index, code] of planOrder.entries()) {
    if (index > planIndex) break;
    for (const capability of planCapabilities[code]) resolved.add(capability);
  }
  const nowMs = now.getTime();
  for (const grant of grants) {
    const startsAt = Date.parse(grant.startsAt);
    const endsAt =
      grant.endsAt === null ? Number.POSITIVE_INFINITY : Date.parse(grant.endsAt);
    if (grant.revokedAt === null && startsAt <= nowMs && nowMs < endsAt) {
      resolved.add(grant.capability);
    }
  }
  return resolved;
}

export function decideCapability(
  capability: CapabilityCode,
  plan: PlanCode,
  grants: readonly BenefitGrant[] = [],
  now: Date = new Date(),
): CapabilityDecision {
  const planCapabilitiesForUser = resolveCapabilities(plan, grants, now);
  const matchingGrant = grants.find(
    (grant) =>
      grant.capability === capability &&
      grant.revokedAt === null &&
      Date.parse(grant.startsAt) <= now.getTime() &&
      (grant.endsAt === null || now.getTime() < Date.parse(grant.endsAt)),
  );
  const allowed = planCapabilitiesForUser.has(capability);
  return {
    capability,
    allowed,
    source:
      allowed && matchingGrant !== undefined ? 'BENEFIT' : allowed ? 'PLAN' : 'NONE',
    expiresAt: matchingGrant?.endsAt ?? null,
  };
}

export function isCapabilityCode(value: string): value is CapabilityCode {
  return (capabilityCodes as readonly string[]).includes(value);
}

export interface CreatePaymentInput {
  readonly orderId: string;
  /** Server-derived from the frozen order snapshot; it is never supplied by a
   * browser, Mini Program, or StoreKit client. */
  readonly planCode?: Exclude<PlanCode, 'FREE'>;
  readonly amountFen: number;
  readonly currency: 'CNY';
  readonly description: string;
}
export interface CreatePaymentResult {
  readonly providerPaymentId: string;
  readonly clientPayload: Readonly<Record<string, string>>;
}
export interface QueryPaymentInput {
  readonly providerPaymentId: string;
}
export interface VerifyCallbackInput {
  readonly headers: Readonly<Record<string, string>>;
  readonly rawBody: string;
}
export interface ClosePaymentInput {
  readonly providerPaymentId: string;
}
export interface RefundPaymentInput {
  readonly providerPaymentId: string;
  readonly amountFen: number;
  readonly reason: string;
}
export interface QueryRefundInput {
  readonly providerRefundId: string;
}
export interface ProviderPaymentStatus {
  readonly providerPaymentId: string;
  readonly status: 'PENDING' | 'SUCCEEDED' | 'CLOSED';
}
export interface RefundPaymentResult {
  readonly providerRefundId: string;
  readonly status: 'PENDING' | 'SUCCEEDED' | 'FAILED';
}
export interface ProviderRefundStatus {
  readonly providerRefundId: string;
  readonly status: 'PENDING' | 'SUCCEEDED' | 'FAILED';
}
export interface VerifiedPaymentCallback {
  readonly providerTransactionId: string;
  readonly orderId: string;
  /** Optional only for providers whose signed transaction contains an
   * external product identifier. The server maps it back to a plan and
   * compares it to the frozen order before fulfillment. */
  readonly planCode?: Exclude<PlanCode, 'FREE'>;
  readonly amountFen: number;
  readonly currency: 'CNY';
  readonly paidAt: string;
}

export interface PaymentProvider {
  readonly provider: PaymentProviderCode;
  createPayment(input: CreatePaymentInput): Promise<CreatePaymentResult>;
  queryPayment(input: QueryPaymentInput): Promise<ProviderPaymentStatus>;
  verifyCallback(input: VerifyCallbackInput): Promise<VerifiedPaymentCallback>;
  closePayment(input: ClosePaymentInput): Promise<void>;
  refundPayment(input: RefundPaymentInput): Promise<RefundPaymentResult>;
  queryRefund(input: QueryRefundInput): Promise<ProviderRefundStatus>;
}

const allowedTransitions: Readonly<Record<OrderStatus, readonly OrderStatus[]>> = {
  CREATED: ['PENDING_PAYMENT', 'CANCELLED', 'EXPIRED', 'CLOSED'],
  PENDING_PAYMENT: ['PAID', 'CANCELLED', 'EXPIRED', 'CLOSED'],
  PAID: ['FULFILLED', 'REFUNDING'],
  FULFILLED: ['REFUNDING'],
  CANCELLED: [],
  EXPIRED: [],
  REFUNDING: ['REFUNDED'],
  REFUNDED: [],
  CLOSED: [],
};

export function canTransitionOrder(from: OrderStatus, to: OrderStatus): boolean {
  return allowedTransitions[from].includes(to);
}

export function verifyProviderAmount(
  expectedAmountFen: number,
  callbackAmountFen: number,
): void {
  if (
    !Number.isSafeInteger(expectedAmountFen) ||
    !Number.isSafeInteger(callbackAmountFen) ||
    expectedAmountFen < 0 ||
    expectedAmountFen !== callbackAmountFen
  ) {
    throw new Error('Payment amount does not match the server-created order.');
  }
}

export * from './membership.js';
export * from './persistence.js';
export * from './api.js';
