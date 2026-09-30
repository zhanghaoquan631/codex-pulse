import {
  idSchema,
  membershipAdminBenefitRevokeSchema,
  membershipAdminBenefitGrantSchema,
  membershipAdminCampaignCreateSchema,
  membershipAdminCampaignStatusSchema,
  membershipAdminCouponCreateSchema,
  membershipAdminRedemptionCodeCreateSchema,
  membershipCampaignClaimSchema,
  membershipCheckoutSchema,
  membershipCouponRedeemSchema,
  membershipPaymentProviderSchema,
  membershipRefundRequestSchema,
} from '@me-zip/schemas';
import type { AuthenticatedPrincipal, BillingPlatform, CampaignStatus, PaymentProviderCode } from '@me-zip/shared-types';

import { MembershipError, type MembershipService } from './membership.js';

export interface MembershipApiRequest {
  readonly method: 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE';
  readonly path: string;
  /** Required on consumer/admin routes. Provider callbacks never receive a
   * browser/mobile principal from this adapter. */
  readonly principal?: AuthenticatedPrincipal;
  readonly body?: unknown;
  readonly rawBody?: string;
  readonly headers?: Readonly<Record<string, string | undefined>>;
  /** Trusted server routing context. It is not accepted in consumer JSON and
   * must come from the authenticated Web/Mini/iOS transport composition. */
  readonly billingPlatform?: BillingPlatform;
}

export interface MembershipApiResponse {
  readonly status: number;
  readonly body: {
    readonly data?: unknown;
    readonly error?: { readonly code: string; readonly message: string; readonly retryable: boolean };
  };
}

const bodyOf = (request: MembershipApiRequest): unknown => request.body ?? {};
const idempotencyKey = (request: MembershipApiRequest): string | undefined => request.headers?.['idempotency-key'] ?? request.headers?.['Idempotency-Key'];
const parse = <T>(result: { readonly success: boolean; readonly data?: T }): T => {
  if (!result.success || result.data === undefined) throw new MembershipError('VALIDATION', 'The membership request is invalid.');
  return result.data;
};
const requirePrincipal = (request: MembershipApiRequest): AuthenticatedPrincipal => {
  if (request.principal === undefined) throw new MembershipError('FORBIDDEN', 'An authenticated principal is required.');
  return request.principal;
};

function responseStatus(error: unknown): number {
  if (!(error instanceof MembershipError)) return 500;
  if (error.code === 'NOT_FOUND') return 404;
  if (error.code === 'FORBIDDEN') return 403;
  if (error.code === 'RATE_LIMITED') return 429;
  if (error.code === 'CONFLICT' || error.code === 'IDEMPOTENCY_REPLAY' || error.code === 'COUPON_ALREADY_USED' || error.code === 'REDEMPTION_ALREADY_USED' || error.code === 'PAYMENT_REPLAY' || error.code === 'UPGRADE_POLICY_REQUIRED') return 409;
  if (error.code === 'ORDER_EXPIRED') return 410;
  if (error.code === 'PROVIDER_UNAVAILABLE') return 503;
  if (error.code === 'PAYMENT_NOT_VERIFIED' || error.code === 'PAYMENT_AMOUNT_MISMATCH' || error.code === 'PAYMENT_PLAN_MISMATCH' || error.code === 'PAYMENT_CURRENCY_MISMATCH' || error.code === 'PAYMENT_PROVIDER_MISMATCH') return 400;
  return 400;
}

function consumerMessage(error: unknown): string {
  if (!(error instanceof MembershipError)) return 'Membership request could not be completed.';
  if (error.code === 'NOT_FOUND') return 'Membership resource was not found.';
  if (error.code === 'RATE_LIMITED') return 'Membership action is temporarily limited.';
  if (error.code === 'ORDER_EXPIRED') return 'This order has expired.';
  if (error.code === 'PROVIDER_UNAVAILABLE') return 'The payment provider is unavailable.';
  if (error.code === 'COUPON_INVALID' || error.code === 'COUPON_ALREADY_USED') return 'The coupon is unavailable.';
  if (error.code === 'REDEMPTION_INVALID' || error.code === 'REDEMPTION_ALREADY_USED') return 'The redemption code is unavailable.';
  if (error.code === 'UPGRADE_POLICY_REQUIRED') return 'This upgrade is not available yet.';
  return 'Membership action is not available.';
}

/** Consumer, provider-callback, and separately authenticated Admin adapters.
 * There is deliberately no route accepting a client amount, payment success,
 * entitlement list, user id, Root flag, or provider callback trust flag. */
export class MembershipApiAdapter {
  public constructor(private readonly service: MembershipService) {
    // This is a production-facing adapter. Unit/local domain instances can be
    // in-memory, but they must never be accidentally mounted as HTTP payment
    // endpoints where a restart would lose callback/idempotency state.
    if (!service.isDurableRepositoryConfigured()) {
      throw new Error('MembershipApiAdapter requires a hydrated durable MembershipService.');
    }
  }

  public async handle(request: MembershipApiRequest): Promise<MembershipApiResponse> {
    try {
      if (!this.service.isDurableRepositoryConfigured()) {
        throw new MembershipError('PROVIDER_UNAVAILABLE', 'Membership state is temporarily unavailable.');
      }
      const data = await this.route(request);
      return { status: request.method === 'POST' || request.method === 'PUT' ? 201 : 200, body: { data } };
    } catch (error) {
      const http = responseStatus(error);
      return {
        status: http,
        body: {
          error: {
            code: error instanceof MembershipError ? error.code : 'INTERNAL',
            message: consumerMessage(error),
            retryable: http === 429 || http >= 500,
          },
        },
      };
    }
  }

  private async route(request: MembershipApiRequest): Promise<unknown> {
    const body = bodyOf(request);
    const key = idempotencyKey(request);
    if (request.path === '/v1/membership/overview' && request.method === 'GET') return this.service.getCenter(requirePrincipal(request));
    if (request.path === '/v1/membership/plans' && request.method === 'GET') return this.service.listPlans();
    if (request.path === '/v1/membership/payment-providers' && request.method === 'GET') return this.service.listPaymentProviders();
    if (request.path === '/v1/membership/history' && request.method === 'GET') return this.service.listMembershipHistory(requirePrincipal(request));
    if (request.path === '/v1/membership/benefits' && request.method === 'GET') return this.service.listBenefits(requirePrincipal(request));
    if (request.path === '/v1/membership/coupons' && request.method === 'GET') return this.service.listCoupons(requirePrincipal(request));
    if (request.path === '/v1/membership/campaigns' && request.method === 'GET') return this.service.listClaimableCampaigns(requirePrincipal(request));
    if (request.path === '/v1/membership/redemptions' && request.method === 'GET') return this.service.listRedemptions(requirePrincipal(request));
    if (request.path === '/v1/membership/redemptions' && request.method === 'POST') {
      const value = parse(membershipCouponRedeemSchema.safeParse(body));
      return this.service.redeemCode(requirePrincipal(request), value.code, key ?? '');
    }
    if (request.path === '/v1/billing/orders' && request.method === 'GET') return this.service.listOrders(requirePrincipal(request));
    if (request.path === '/v1/billing/checkouts' && request.method === 'POST') {
      const value = parse(membershipCheckoutSchema.safeParse(body));
      return this.service.createCheckout(requirePrincipal(request), {
        ...value,
        platform: request.billingPlatform ?? 'WEB',
        idempotencyKey: key ?? '',
      });
    }

    const campaignClaim = /^\/v1\/membership\/campaigns\/([^/]+)\/claims$/u.exec(request.path);
    if (campaignClaim !== null && request.method === 'POST') {
      parse(membershipCampaignClaimSchema.safeParse(body));
      const campaignId = parse(idSchema.safeParse(decodeURIComponent(campaignClaim[1]!)));
      return this.service.claimCampaign(requirePrincipal(request), campaignId, key ?? '');
    }

    const orderMatch = /^\/v1\/billing\/orders\/([^/]+)$/u.exec(request.path);
    if (orderMatch !== null && request.method === 'GET') {
      const orderId = parse(idSchema.safeParse(decodeURIComponent(orderMatch[1]!)));
      return this.service.getOrder(requirePrincipal(request), orderId);
    }
    const refundMatch = /^\/v1\/billing\/orders\/([^/]+)\/refund-requests$/u.exec(request.path);
    if (refundMatch !== null && request.method === 'POST') {
      const orderId = parse(idSchema.safeParse(decodeURIComponent(refundMatch[1]!)));
      const value = parse(membershipRefundRequestSchema.safeParse(body));
      return this.service.requestRefund(requirePrincipal(request), orderId, value.reason, key ?? '');
    }

    const callbackMatch = /^\/v1\/payment\/callbacks\/([^/]+)$/u.exec(request.path);
    if (callbackMatch !== null && request.method === 'POST') {
      const provider = parse(membershipPaymentProviderSchema.safeParse(decodeURIComponent(callbackMatch[1]!))) as PaymentProviderCode;
      const rawBody = request.rawBody ?? JSON.stringify(body);
      const headers = Object.fromEntries(Object.entries(request.headers ?? {}).filter((entry): entry is [string, string] => entry[1] !== undefined));
      return this.service.receivePaymentCallback(provider, { headers, rawBody });
    }

    if (request.path === '/v1/admin/membership/campaigns' && request.method === 'POST') {
      const value = parse(membershipAdminCampaignCreateSchema.safeParse(body));
      return this.service.createCampaign(requirePrincipal(request), { ...value, idempotencyKey: key ?? '' });
    }
    const campaignStatus = /^\/v1\/admin\/membership\/campaigns\/([^/]+)\/status$/u.exec(request.path);
    if (campaignStatus !== null && request.method === 'PATCH') {
      const campaignId = parse(idSchema.safeParse(decodeURIComponent(campaignStatus[1]!)));
      const value = parse(membershipAdminCampaignStatusSchema.safeParse(body));
      return this.service.setCampaignStatus(requirePrincipal(request), campaignId, value.status as CampaignStatus, value.reason, key ?? '');
    }
    if (request.path === '/v1/admin/membership/coupons' && request.method === 'POST') {
      const value = parse(membershipAdminCouponCreateSchema.safeParse(body));
      return this.service.createCoupon(requirePrincipal(request), { ...value, idempotencyKey: key ?? '' });
    }
    if (request.path === '/v1/admin/membership/redemption-codes' && request.method === 'POST') {
      const value = parse(membershipAdminRedemptionCodeCreateSchema.safeParse(body));
      return this.service.issueRedemptionCode(requirePrincipal(request), { ...value, idempotencyKey: key ?? '' });
    }
    if (request.path === '/v1/admin/membership/benefits' && request.method === 'POST') {
      const value = parse(membershipAdminBenefitGrantSchema.safeParse(body));
      return this.service.grantBenefit(requirePrincipal(request), { ...value, idempotencyKey: key ?? '' });
    }
    const revokeBenefit = /^\/v1\/admin\/membership\/benefits\/([^/]+)\/revoke$/u.exec(request.path);
    if (revokeBenefit !== null && request.method === 'POST') {
      const grantId = parse(idSchema.safeParse(decodeURIComponent(revokeBenefit[1]!)));
      const value = parse(membershipAdminBenefitRevokeSchema.safeParse(body));
      return this.service.revokeBenefit(requirePrincipal(request), grantId, value.reason, key ?? '');
    }
    if (request.path === '/v1/admin/membership/payments' && request.method === 'GET') {
      return this.service.listAdminPaymentMetadata(requirePrincipal(request));
    }
    throw new MembershipError('NOT_FOUND', 'The membership route was not found.');
  }
}
