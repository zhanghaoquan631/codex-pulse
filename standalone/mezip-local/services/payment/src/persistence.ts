import type {
  MembershipCampaign,
  MembershipCampaignClaim,
  Membership,
  MembershipBenefitGrant,
  MembershipCoupon,
  MembershipEntitlement,
  MembershipHistoryEvent,
  MembershipOrder,
  MembershipPayment,
  MembershipRefund,
  MembershipRedemption,
  MembershipRedemptionCode,
} from '@me-zip/shared-types';
import type {
  MembershipAdminAudit,
  MembershipIdempotencyReceipt,
  MembershipInviteRelationship,
  MembershipInviteReward,
  MembershipPaymentEvent,
  MembershipStateSnapshot,
} from './membership.js';

/** Raised only for a scoped idempotency key reused with a different request
 * fingerprint. The caller reloads the durable projection and exposes the
 * ordinary `IDEMPOTENCY_REPLAY` domain error, never a partial mutation. */
export class MembershipDurableIdempotencyConflictError extends Error {
  public constructor() {
    super('Durable membership idempotency key was reused with a different request.');
    this.name = 'MembershipDurableIdempotencyConflictError';
  }
}

const snapshotIntegerFields = new Set([
  'amountFen',
  'baseAmountFen',
  'discountAmountFen',
  'payableAmountFen',
  'membershipDays',
  'storageBytes',
  'maxRedemptions',
  'redeemedCount',
  'discountValue',
]);

/** Normalize normal `pg`/Postgres driver output before it reaches the domain:
 * timestamptz commonly arrives as Date and bigint commonly as decimal string.
 * The membership domain intentionally uses ISO strings and safe JS integers;
 * accepting an unsafe storage/price value would silently corrupt a quota. */
function normalizeSnapshotValue(value: unknown, key?: string): unknown {
  if (value instanceof Date) return value.toISOString();
  if (typeof value === 'bigint') {
    const numberValue = Number(value);
    if (!Number.isSafeInteger(numberValue)) throw new Error(`Unsafe durable integer for ${key ?? 'value'}.`);
    return numberValue;
  }
  if (typeof value === 'string' && key !== undefined && snapshotIntegerFields.has(key) && /^-?\d+$/u.test(value)) {
    const numberValue = Number(value);
    if (!Number.isSafeInteger(numberValue)) throw new Error(`Unsafe durable integer for ${key}.`);
    return numberValue;
  }
  if (Array.isArray(value)) return value.map((item) => normalizeSnapshotValue(item));
  if (value !== null && typeof value === 'object') {
    const object = value as Record<string, unknown>;
    return Object.fromEntries(Object.entries(object).map(([entryKey, entryValue]) => [entryKey, normalizeSnapshotValue(entryValue, entryKey)]));
  }
  return value;
}

function normalizeSnapshotRow<T>(row: unknown): T {
  return normalizeSnapshotValue(row) as T;
}

/**
 * Relational write model for Phase 6 migration 007. These rows deliberately
 * mirror the legacy commerce tables that 007 extends: products/orders,
 * payment_transactions/payment_events, subscriptions/membership_history,
 * entitlements, benefit_grants, redemptions, refunds, and audit. A production
 * adapter owns the PostgreSQL transaction and is responsible for setting the
 * server-authenticated database context; no browser/Mini client calls it.
 */
export interface MembershipDurableOrderRow {
  readonly id: string;
  readonly orderNo: string;
  readonly userId: string;
  readonly planCode: MembershipOrder['planCode'];
  readonly baseAmountFen: number;
  readonly discountAmountFen: number;
  readonly payableAmountFen: number;
  readonly legacyAmountFen: number;
  readonly currency: 'CNY';
  readonly couponId: string | null;
  readonly provider: MembershipOrder['provider'];
  readonly status: MembershipOrder['status'];
  readonly createdAt: string;
  readonly expiresAt: string;
  readonly paidAt: string | null;
  readonly updatedAt: string;
}

export interface MembershipDurablePaymentRow {
  readonly id: string;
  readonly orderId: string;
  readonly provider: MembershipPayment['provider'];
  readonly providerPaymentId: string;
  readonly providerTransactionId: string | null;
  readonly amountFen: number;
  readonly currency: 'CNY';
  readonly status: MembershipPayment['status'];
  readonly createdAt: string;
  readonly verifiedAt: string | null;
}

export interface MembershipDurablePaymentEventRow {
  readonly id: string;
  readonly provider: MembershipPaymentEvent['provider'];
  readonly providerTransactionId: string;
  readonly orderId: string;
  readonly amountFen: number;
  readonly currency: 'CNY';
  /** Digest only: never persist callback secrets or raw provider payloads. */
  readonly eventDigest: string;
  readonly verifiedAt: string;
}

export interface MembershipDurableMembershipRow {
  readonly id: string;
  readonly userId: string;
  readonly orderId: string | null;
  readonly planCode: Membership['planCode'];
  readonly status: Membership['status'];
  readonly source: Membership['source'];
  readonly sourceReference: Membership['sourceReference'];
  readonly startsAt: string;
  readonly expiresAt: string;
  readonly revokedAt: string | null;
  readonly createdAt: string;
  readonly updatedAt: string;
}

export interface MembershipDurableBenefitGrantRow {
  readonly id: string;
  readonly userId: string;
  readonly type: MembershipBenefitGrant['type'];
  readonly source: MembershipBenefitGrant['source'];
  readonly capability: MembershipBenefitGrant['capability'];
  readonly membershipDays: number | null;
  readonly planCode: MembershipBenefitGrant['planCode'];
  readonly storageBytes: number | null;
  readonly badgeCode: string | null;
  readonly couponId: string | null;
  readonly campaignId: string | null;
  readonly startsAt: string;
  readonly endsAt: string | null;
  readonly revokedAt: string | null;
  readonly idempotencyKey: string;
  readonly reason: string | null;
  readonly operatorId: string | null;
}

export interface MembershipDurableActivationWrite {
  readonly order: MembershipDurableOrderRow;
  readonly payment: MembershipDurablePaymentRow;
  readonly event: MembershipDurablePaymentEventRow;
  readonly membership: MembershipDurableMembershipRow;
  readonly history: readonly MembershipHistoryEvent[];
  readonly entitlements: readonly MembershipEntitlement[];
  readonly couponRedemption: MembershipRedemption | null;
}

/**
 * A durable write is either newly committed or a canonical replay that was
 * already committed by another process.  `applied: false` is deliberately not
 * an error: callers must discard their speculative in-memory projection and
 * reload the database projection before returning a result.
 */
export interface MembershipDurableWriteResult {
  readonly applied: boolean;
}

export interface MembershipDurableCheckoutWrite {
  readonly order: MembershipDurableOrderRow;
  readonly couponReservation: MembershipRedemption | null;
  /** Scoped server idempotency key from the authenticated checkout request. */
  readonly idempotencyKey: string;
  readonly idempotency: MembershipIdempotencyReceipt;
}

export interface MembershipDurablePendingPaymentWrite {
  readonly order: MembershipDurableOrderRow;
  readonly payment: MembershipDurablePaymentRow;
}

export interface MembershipDurableBenefitWrite {
  readonly grant: MembershipDurableBenefitGrantRow;
  readonly membership: MembershipDurableMembershipRow | null;
  readonly history: readonly MembershipHistoryEvent[];
  readonly entitlements: readonly MembershipEntitlement[];
  readonly audit: MembershipAdminAudit;
  readonly idempotency: MembershipIdempotencyReceipt;
}

export interface MembershipDurableRefundWrite {
  readonly refund: MembershipRefund;
  readonly order: MembershipDurableOrderRow;
  readonly requestedByUserId: string;
  readonly idempotency: MembershipIdempotencyReceipt;
}

export interface MembershipDurableBenefitRevocationWrite {
  readonly grant: MembershipDurableBenefitGrantRow;
  readonly revokedMemberships: readonly MembershipDurableMembershipRow[];
  readonly history: readonly MembershipHistoryEvent[];
  readonly audit: MembershipAdminAudit;
  readonly idempotency: MembershipIdempotencyReceipt;
}

/** Server scheduler reconciliation. Expiry is not a client-triggered write;
 * it atomically expires paid passes/orders and releases unfulfilled coupon
 * reservations so a restart cannot strand a redemption slot. */
export interface MembershipDurableExpiryWrite {
  readonly memberships: readonly MembershipDurableMembershipRow[];
  readonly history: readonly MembershipHistoryEvent[];
  readonly orders: readonly MembershipDurableOrderRow[];
  readonly couponReleases: readonly MembershipRedemption[];
}

export interface MembershipDurableCampaignWrite {
  readonly campaign: MembershipCampaign;
  readonly targetUserIds: readonly string[];
  readonly audit: MembershipAdminAudit;
  readonly idempotency: MembershipIdempotencyReceipt;
}

export interface MembershipDurableCampaignStatusWrite {
  readonly campaign: MembershipCampaign;
  readonly audit: MembershipAdminAudit;
  readonly idempotency: MembershipIdempotencyReceipt;
}

export interface MembershipDurableCouponWrite {
  readonly coupon: MembershipCoupon;
  readonly audit: MembershipAdminAudit;
  readonly idempotency: MembershipIdempotencyReceipt;
}

export interface MembershipDurableRedemptionCodeWrite {
  readonly definition: MembershipRedemptionCode & { readonly codeHash: string };
  readonly adminIdentityId: string;
  readonly audit: MembershipAdminAudit;
  readonly idempotency: MembershipIdempotencyReceipt;
}

/** Redemption and campaign claim both create grants. `redemptionCodeId` is a
 * durable link kept outside the public benefit-grant projection. */
export interface MembershipDurableCustomerGrantWrite {
  readonly redemption: MembershipRedemption | null;
  readonly campaignClaim: MembershipCampaignClaim | null;
  readonly grants: readonly MembershipDurableBenefitGrantRow[];
  readonly memberships: readonly MembershipDurableMembershipRow[];
  readonly history: readonly MembershipHistoryEvent[];
  readonly entitlements: readonly MembershipEntitlement[];
  readonly redemptionCodeId: string | null;
  readonly idempotency: MembershipIdempotencyReceipt;
}

export interface MembershipDurableAdminAuditWrite {
  readonly audit: MembershipAdminAudit;
}

/**
 * Production implementations must commit each method in one database
 * transaction. In particular, `applyVerifiedPayment` locks the order and
 * coupon rows, enforces the unique provider transaction/event keys, persists
 * the payment event, activates exactly one Membership, materializes its
 * entitlements, and commits together. A retry must return the prior commit.
 */
/** Read side paired with the durable write repository. Production startup
 * hydrates the authorization/order projection before serving requests; a
 * write-only mirror is intentionally not sufficient for payment callbacks. */
export interface MembershipDurableStateLoader {
  loadSnapshot(): Promise<MembershipStateSnapshot>;
}

/**
 * The durable repository is both the write authority and the read authority.
 * A write-only mirror is unsafe: after a restart, or when another server wins
 * an idempotency race, authorization must be hydrated from the committed
 * PostgreSQL projection rather than a stale process-local map.
 */
export interface MembershipDurableRepository extends MembershipDurableStateLoader {
  persistCheckout(write: MembershipDurableCheckoutWrite): Promise<MembershipDurableWriteResult>;
  persistPendingPayment(write: MembershipDurablePendingPaymentWrite): Promise<MembershipDurableWriteResult>;
  applyVerifiedPayment(write: MembershipDurableActivationWrite): Promise<MembershipDurableWriteResult>;
  persistBenefitGrant(write: MembershipDurableBenefitWrite): Promise<MembershipDurableWriteResult>;
  persistBenefitRevocation(write: MembershipDurableBenefitRevocationWrite): Promise<MembershipDurableWriteResult>;
  persistRefundRequest(write: MembershipDurableRefundWrite): Promise<MembershipDurableWriteResult>;
  persistExpiry(write: MembershipDurableExpiryWrite): Promise<MembershipDurableWriteResult>;
  persistCampaign(write: MembershipDurableCampaignWrite): Promise<MembershipDurableWriteResult>;
  persistCampaignStatus(write: MembershipDurableCampaignStatusWrite): Promise<MembershipDurableWriteResult>;
  persistCoupon(write: MembershipDurableCouponWrite): Promise<MembershipDurableWriteResult>;
  persistRedemptionCode(write: MembershipDurableRedemptionCodeWrite): Promise<MembershipDurableWriteResult>;
  persistCustomerGrants(write: MembershipDurableCustomerGrantWrite): Promise<MembershipDurableWriteResult>;
  persistAdminAudit(write: MembershipDurableAdminAuditWrite): Promise<MembershipDurableWriteResult>;
}

export function toMembershipDurableOrderRow(order: MembershipOrder): MembershipDurableOrderRow {
  return {
    id: order.id,
    orderNo: order.orderNo,
    userId: order.userId,
    planCode: order.planCode,
    baseAmountFen: order.baseAmountFen,
    discountAmountFen: order.discountAmountFen,
    payableAmountFen: order.payableAmountFen,
    legacyAmountFen: order.payableAmountFen,
    currency: order.currency,
    couponId: order.couponId,
    provider: order.provider,
    status: order.status,
    createdAt: order.createdAt,
    expiresAt: order.expiresAt,
    paidAt: order.paidAt,
    updatedAt: order.updatedAt,
  };
}

export function toMembershipDurablePaymentRow(payment: MembershipPayment): MembershipDurablePaymentRow {
  return {
    id: payment.id,
    orderId: payment.orderId,
    provider: payment.provider,
    providerPaymentId: payment.providerPaymentId,
    providerTransactionId: payment.providerTransactionId,
    amountFen: payment.amountFen,
    currency: payment.currency,
    status: payment.status,
    createdAt: payment.createdAt,
    verifiedAt: payment.verifiedAt,
  };
}

export function toMembershipDurablePaymentEventRow(
  event: MembershipPaymentEvent,
  eventDigest: string,
): MembershipDurablePaymentEventRow {
  if (eventDigest.trim() === '') throw new Error('A verified callback event digest is required.');
  return {
    id: event.id,
    provider: event.provider,
    providerTransactionId: event.providerTransactionId,
    orderId: event.orderId,
    amountFen: event.amountFen,
    currency: event.currency,
    eventDigest,
    verifiedAt: event.verifiedAt,
  };
}

export function toMembershipDurableMembershipRow(membership: Membership): MembershipDurableMembershipRow {
  return {
    id: membership.id,
    userId: membership.userId,
    orderId: membership.orderId,
    planCode: membership.planCode,
    status: membership.status,
    source: membership.source,
    sourceReference: membership.sourceReference,
    startsAt: membership.startsAt,
    expiresAt: membership.expiresAt,
    revokedAt: membership.revokedAt,
    createdAt: membership.createdAt,
    updatedAt: membership.updatedAt,
  };
}

export function toMembershipDurableBenefitGrantRow(grant: MembershipBenefitGrant): MembershipDurableBenefitGrantRow {
  return {
    id: grant.id,
    userId: grant.userId,
    type: grant.type,
    source: grant.source,
    capability: grant.capability,
    membershipDays: grant.membershipDays,
    planCode: grant.planCode,
    storageBytes: grant.storageBytes,
    badgeCode: grant.badgeCode,
    couponId: grant.couponId,
    campaignId: grant.campaignId,
    startsAt: grant.startsAt,
    endsAt: grant.endsAt,
    revokedAt: grant.revokedAt,
    idempotencyKey: grant.idempotencyKey,
    reason: grant.reason,
    operatorId: grant.operatorId,
  };
}

// ---------------------------------------------------------------------------
// Concrete PostgreSQL transaction adapter
// ---------------------------------------------------------------------------

/** Minimal parameterized Postgres protocol. A runtime adapter may wrap `pg`,
 * postgres.js, Neon, Supabase server client, etc.; browser/Mini transports can
 * never implement or receive this dependency. */
export interface PostgresMembershipQueryResult<Row extends Record<string, unknown> = Record<string, unknown>> {
  readonly rows: readonly Row[];
}

export interface PostgresMembershipTransaction {
  query<Row extends Record<string, unknown> = Record<string, unknown>>(
    statement: { readonly text: string; readonly values: readonly unknown[] },
  ): Promise<PostgresMembershipQueryResult<Row>>;
}

export interface PostgresMembershipDatabase {
  transaction<T>(operation: (transaction: PostgresMembershipTransaction) => Promise<T>): Promise<T>;
}

/**
 * Durable implementation for migration 007. Every public method executes all
 * its writes under one caller-provided Postgres transaction. SQL is
 * parameterized; callback bodies are represented only by an event digest.
 *
 * The application composes this adapter with a server-only connection/role.
 * It intentionally has no connection string, credential, or client-facing
 * API in this package.
 */
export class PostgresMembershipRepository implements MembershipDurableRepository {
  public constructor(private readonly database: PostgresMembershipDatabase) {}

  public async loadSnapshot(): Promise<MembershipStateSnapshot> {
    return this.database.transaction(async (transaction) => {
      const list = async <T>(text: string): Promise<readonly T[]> => {
        const result = await transaction.query({ text, values: [] });
        return result.rows.map((row) => normalizeSnapshotRow<T>(row));
      };
      const [
        memberships,
        membershipHistory,
        entitlements,
        benefitGrants,
        orders,
        payments,
        paymentEvents,
        refunds,
        coupons,
        campaigns,
        campaignTargets,
        campaignClaims,
        redemptionCodes,
        redemptions,
        badges,
        inviteRelationships,
        inviteRewards,
        adminAudits,
        idempotency,
      ] = await Promise.all([
        list<Membership>(`SELECT id, user_id AS "userId", order_id AS "orderId", plan_code AS "planCode", status, source, source_reference AS "sourceReference", starts_at AS "startsAt", expires_at AS "expiresAt", created_at AS "createdAt", updated_at AS "updatedAt", revoked_at AS "revokedAt" FROM memberships`),
        list<MembershipHistoryEvent>(`SELECT id, membership_id AS "membershipId", user_id AS "userId", event, source, occurred_at AS "occurredAt", reason, actor_user_id AS "actorUserId" FROM membership_history`),
        list<MembershipEntitlement>(`SELECT id, owner_id AS "userId", code, source, valid_from AS "startsAt", valid_until AS "endsAt", revoked_at AS "revokedAt", subscription_id AS "membershipId", benefit_grant_id AS "grantId" FROM entitlements`),
        list<MembershipBenefitGrant>(`SELECT id, user_id AS "userId", benefit_type AS type, source, capability, membership_days AS "membershipDays", plan_code AS "planCode", storage_bytes AS "storageBytes", badge_code AS "badgeCode", coupon_id AS "couponId", campaign_id AS "campaignId", starts_at AS "startsAt", ends_at AS "endsAt", revoked_at AS "revokedAt", idempotency_key AS "idempotencyKey", reason, operator_id AS "operatorId" FROM benefit_grants`),
        list<MembershipOrder>(`SELECT id, order_no AS "orderNo", owner_id AS "userId", plan_code AS "planCode", base_amount_fen AS "baseAmountFen", discount_amount_fen AS "discountAmountFen", payable_amount_fen AS "payableAmountFen", currency, coupon_id AS "couponId", provider, status, created_at AS "createdAt", expires_at AS "expiresAt", paid_at AS "paidAt", updated_at AS "updatedAt" FROM orders`),
        list<MembershipPayment>(`SELECT id, order_id AS "orderId", provider, provider_payment_id AS "providerPaymentId", provider_transaction_id AS "providerTransactionId", amount_fen AS "amountFen", currency, status, created_at AS "createdAt", verified_at AS "verifiedAt" FROM payments`),
        list<MembershipPaymentEvent>(`SELECT id, provider, provider_transaction_id AS "providerTransactionId", order_id AS "orderId", amount_fen AS "amountFen", currency, verified_at AS "verifiedAt" FROM payment_events`),
        list<MembershipRefund>(`SELECT id, order_id AS "orderId", provider, provider_refund_id AS "providerRefundId", amount_fen AS "amountFen", status, reason, created_at AS "createdAt", completed_at AS "completedAt" FROM refunds`),
        list<MembershipCoupon>(`SELECT id, code, discount_kind AS "discountKind", discount_value AS "discountValue", applicable_plan_codes AS "applicablePlans", status, max_redemptions AS "maxRedemptions", redeemed_count AS "redeemedCount", starts_at AS "startsAt", ends_at AS "endsAt", campaign_id AS "campaignId" FROM coupons`),
        list<MembershipCampaign>(`
          SELECT c.id, c.code, c.status, c.audience, c.starts_at AS "startsAt", c.ends_at AS "endsAt", c.created_at AS "createdAt",
            COALESCE(jsonb_agg(jsonb_build_object(
              'id', t.id, 'type', t.benefit_type, 'capability', t.capability,
              'membershipDays', t.membership_days, 'planCode', t.plan_code,
              'storageBytes', t.storage_bytes, 'badgeCode', t.badge_code,
              'couponId', NULL, 'endsAt', t.ends_at
            )) FILTER (WHERE t.id IS NOT NULL), '[]'::jsonb) AS benefits
          FROM campaigns c
          LEFT JOIN campaign_benefit_templates t ON t.campaign_id = c.id
          GROUP BY c.id`),
        list<{ readonly campaignId: string; readonly userId: string }>(`SELECT campaign_id AS "campaignId", user_id AS "userId" FROM campaign_targets`),
        list<MembershipCampaignClaim>(`
          SELECT cc.id, cc.campaign_id AS "campaignId", cc.user_id AS "userId", cc.idempotency_key AS "idempotencyKey", cc.claimed_at AS "claimedAt",
            COALESCE(array_agg(ccbg.benefit_grant_id) FILTER (WHERE ccbg.benefit_grant_id IS NOT NULL), ARRAY[]::uuid[]) AS "benefitGrantIds"
          FROM campaign_claims cc
          LEFT JOIN campaign_claim_benefit_grants ccbg ON ccbg.campaign_claim_id = cc.id
          GROUP BY cc.id`),
        list<MembershipRedemptionCode & { readonly codeHash: string }>(`SELECT id, code_prefix AS "codePrefix", code_hash AS "codeHash", status, max_redemptions AS "maxRedemptions", redeemed_count AS "redeemedCount", starts_at AS "startsAt", ends_at AS "endsAt", membership_days AS "membershipDays", plan_code AS "planCode", storage_bytes AS "storageBytes", capability, badge_code AS "badgeCode" FROM redemption_codes`),
        list<MembershipRedemption>(`
          SELECT r.id, r.user_id AS "userId", r.order_id AS "orderId", r.redemption_code_id AS "redemptionCodeId", r.coupon_id AS "couponId", r.idempotency_key AS "idempotencyKey", r.redeemed_at AS "redeemedAt",
            COALESCE(array_agg(rbg.benefit_grant_id) FILTER (WHERE rbg.benefit_grant_id IS NOT NULL), ARRAY[]::uuid[]) AS "benefitGrantIds"
          FROM redemptions r
          LEFT JOIN redemption_benefit_grants rbg ON rbg.redemption_id = r.id
          GROUP BY r.id`),
        list<MembershipStateSnapshot['badges'][number]>(`
          SELECT ub.user_id AS "userId", jsonb_build_object(
            'code', b.code, 'name', b.display_name, 'grantedAt', ub.granted_at, 'grantId', ub.benefit_grant_id
          ) AS badge
          FROM user_badges ub JOIN badges b ON b.code = ub.badge_code
          WHERE ub.revoked_at IS NULL`),
        list<MembershipInviteRelationship>(`SELECT id, inviter_user_id AS "inviterUserId", invited_user_id AS "invitedUserId", created_at AS "createdAt" FROM invite_relationships`),
        list<MembershipInviteReward>(`SELECT id, invite_relationship_id AS "inviteRelationshipId", benefit_grant_id AS "benefitGrantId", created_at AS "createdAt" FROM invite_rewards`),
        list<MembershipAdminAudit>(`SELECT id, admin_identity_id AS "adminId", actor_user_id AS "actorUserId", target_user_id AS "targetUserId", capability, action, resource_id AS "resourceId", reason, created_at AS "createdAt" FROM membership_admin_audit`),
        list<MembershipIdempotencyReceipt>(`SELECT scope_key AS key, fingerprint, result FROM membership_idempotency`),
      ]);
      return {
        memberships,
        membershipHistory,
        entitlements,
        benefitGrants,
        orders,
        payments,
        paymentEvents,
        refunds,
        coupons,
        campaigns,
        campaignTargets,
        campaignClaims,
        redemptionCodes,
        redemptions,
        badges,
        inviteRelationships,
        inviteRewards,
        adminAudits,
        idempotency,
      };
    });
  }

  public async persistCheckout(write: MembershipDurableCheckoutWrite): Promise<MembershipDurableWriteResult> {
    return this.database.transaction(async (transaction) => {
      if (!await this.reserveIdempotency(transaction, write.idempotency)) return { applied: false };
      const order = write.order;
      const insertedOrder = await transaction.query({
        text: `
          INSERT INTO orders (
            id, owner_id, product_id, amount_fen, currency, status, idempotency_key,
            created_at, updated_at, order_no, plan_code, base_amount_fen,
            discount_amount_fen, payable_amount_fen, coupon_id, provider, expires_at, paid_at
          ) VALUES (
            $1, $2, (SELECT id FROM products WHERE code = $3), $4, $5, $6, $7,
            $8, $9, $10, $3, $11, $12, $13, $14, $15, $16, $17
          )
          ON CONFLICT (owner_id, idempotency_key) DO NOTHING
          RETURNING id`,
        values: [
          order.id, order.userId, order.planCode, order.legacyAmountFen, order.currency,
          order.status, write.idempotencyKey, order.createdAt, order.updatedAt, order.orderNo,
          order.baseAmountFen, order.discountAmountFen, order.payableAmountFen, order.couponId,
          order.provider, order.expiresAt, order.paidAt,
        ],
      });
      // Another server has already created the scoped checkout.  Do not
      // reserve a coupon or call a provider for this speculative local order;
      // the service reloads the canonical database projection instead.
      if (insertedOrder.rows.length === 0) return { applied: false };
      if (write.couponReservation !== null) {
        const coupon = await transaction.query({
          text: `
            UPDATE coupons
            SET redeemed_count = redeemed_count + 1, updated_at = now()
            WHERE id = $1
              AND status = 'ACTIVE'
              AND (max_redemptions IS NULL OR redeemed_count < max_redemptions)
              AND (campaign_id IS NULL OR mezip_phase6_campaign_audience_allowed(campaign_id, $2))
            RETURNING id`,
          values: [write.couponReservation.couponId, write.order.userId],
        });
        if (coupon.rows.length !== 1) throw new Error('Coupon reservation could not be persisted.');
        await transaction.query({
          text: `
            INSERT INTO redemptions (
              id, coupon_id, user_id, benefit_grant_id, idempotency_key, redeemed_at, order_id
            ) VALUES ($1, $2, $3, NULL, $4, $5, $6)
            ON CONFLICT (order_id) DO NOTHING`,
          values: [
            write.couponReservation.id,
            write.couponReservation.couponId,
            write.couponReservation.userId,
            write.couponReservation.idempotencyKey,
            write.couponReservation.redeemedAt,
            write.couponReservation.orderId,
          ],
        });
      }
      return { applied: true };
    });
  }

  public async persistPendingPayment(write: MembershipDurablePendingPaymentWrite): Promise<MembershipDurableWriteResult> {
    return this.database.transaction(async (transaction) => {
      const { order, payment } = write;
      const insertedPayment = await transaction.query({
        text: `
          INSERT INTO payment_transactions (
            id, order_id, provider, provider_transaction_id, amount_fen, raw_event,
            verified_at, provider_payment_id, currency, status, created_at, updated_at, raw_event_digest
          ) VALUES ($1, $2, $3, NULL, $4, '{}'::jsonb, NULL, $5, $6, $7, $8, $8, NULL)
          ON CONFLICT (provider, provider_payment_id) DO NOTHING
          RETURNING id`,
        values: [payment.id, payment.orderId, payment.provider, payment.amountFen, payment.providerPaymentId, payment.currency, payment.status, payment.createdAt],
      });
      if (insertedPayment.rows.length === 0) return { applied: false };
      const updatedOrder = await transaction.query({
        text: `
          UPDATE orders SET status = $2, updated_at = $3
          WHERE id = $1 AND status = 'CREATED'
          RETURNING id`,
        values: [order.id, order.status, order.updatedAt],
      });
      if (updatedOrder.rows.length !== 1) {
        throw new Error('Pending payment order is not durably payable.');
      }
      return { applied: true };
    });
  }

  public async applyVerifiedPayment(write: MembershipDurableActivationWrite): Promise<MembershipDurableWriteResult> {
    return this.database.transaction(async (transaction) => {
      const { order, payment, event, membership } = write;
      // Serialize all payment state transitions for this order across server
      // instances before testing/recording the provider callback key.
      const lockedOrder = await transaction.query<{
        readonly id: string;
        readonly status: string;
        readonly provider: string | null;
        readonly payableAmountFen: number;
        readonly currency: string;
        readonly expiresAt: string;
      }>({
        text: `
          SELECT id, status, provider, payable_amount_fen AS "payableAmountFen",
            currency, expires_at AS "expiresAt"
          FROM orders
          WHERE id = $1
          FOR UPDATE`,
        values: [order.id],
      });
      const persistedOrder = lockedOrder.rows[0];
      // Check an already-committed provider event before rejecting the now
      // FULFILLED durable order. A fresh process may not have the local replay
      // marker yet; the event is the cross-instance idempotency authority.
      const priorEvent = await transaction.query<{
        readonly orderId: string;
        readonly amountFen: number;
        readonly currency: string;
      }>({
        text: `
          SELECT order_id AS "orderId", amount_fen AS "amountFen", currency
          FROM payment_events
          WHERE provider = $1 AND provider_transaction_id = $2`,
        values: [event.provider, event.providerTransactionId],
      });
      const existingEvent = priorEvent.rows[0];
      if (existingEvent !== undefined) {
        if (
          existingEvent.orderId === event.orderId &&
          existingEvent.amountFen === event.amountFen &&
          existingEvent.currency === event.currency
        ) return { applied: false };
        throw new Error('Provider transaction id is already bound to a different durable payment.');
      }
      if (
        persistedOrder === undefined ||
        !['CREATED', 'PENDING_PAYMENT'].includes(persistedOrder.status) ||
        persistedOrder.provider !== payment.provider ||
        persistedOrder.payableAmountFen !== payment.amountFen ||
        persistedOrder.currency !== payment.currency ||
        Date.parse(persistedOrder.expiresAt) <= Date.parse(event.verifiedAt)
      ) {
        throw new Error('Verified payment does not match the locked durable order.');
      }
      const inserted = await transaction.query({
        text: `
          INSERT INTO payment_events (
            id, provider, provider_transaction_id, order_id, amount_fen, currency, event_digest, verified_at
          ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
          ON CONFLICT (provider, provider_transaction_id) DO NOTHING
          RETURNING id`,
        values: [event.id, event.provider, event.providerTransactionId, event.orderId, event.amountFen, event.currency, event.eventDigest, event.verifiedAt],
      });
      // A callback retry is safe only when its provider event was already
      // committed; it cannot create another subscription/entitlement row.
      if (inserted.rows.length === 0) return { applied: false };
      const updatedOrder = await transaction.query({
        text: `
          UPDATE orders
          SET status = $2, paid_at = $3, updated_at = $4
          WHERE id = $1
            AND status IN ('CREATED', 'PENDING_PAYMENT')
          RETURNING id`,
        values: [order.id, order.status, order.paidAt, order.updatedAt],
      });
      if (updatedOrder.rows.length !== 1) {
        throw new Error('Verified payment order changed while being activated.');
      }
      const updatedPayment = await transaction.query({
        text: `
          UPDATE payment_transactions
          SET provider_transaction_id = $2, amount_fen = $3, currency = $4,
              status = $5, verified_at = $6, updated_at = $6, raw_event = '{}'::jsonb,
              raw_event_digest = $7
          WHERE id = $1
            AND order_id = $8
            AND provider = $9
            AND status = 'PENDING'
          RETURNING id`,
        values: [payment.id, payment.providerTransactionId, payment.amountFen, payment.currency, payment.status, payment.verifiedAt, event.eventDigest, order.id, payment.provider],
      });
      if (updatedPayment.rows.length !== 1) {
        throw new Error('Verified payment has no matching durable pending transaction.');
      }
      await this.insertMembership(transaction, membership);
      await this.insertHistory(transaction, write.history);
      await this.insertEntitlements(transaction, write.entitlements);
      return { applied: true };
    });
  }

  public async persistBenefitGrant(write: MembershipDurableBenefitWrite): Promise<MembershipDurableWriteResult> {
    return this.database.transaction(async (transaction) => {
      if (!await this.reserveIdempotency(transaction, write.idempotency)) return { applied: false };
      const grant = write.grant;
      if (!await this.insertBenefitGrant(transaction, grant)) return { applied: false };
      if (write.membership !== null) await this.insertMembership(transaction, write.membership);
      await this.insertHistory(transaction, write.history);
      await this.insertEntitlements(transaction, write.entitlements);
      await this.insertAdminAudit(transaction, write.audit);
      return { applied: true };
    });
  }

  public async persistRefundRequest(write: MembershipDurableRefundWrite): Promise<MembershipDurableWriteResult> {
    return this.database.transaction(async (transaction) => {
      if (!await this.reserveIdempotency(transaction, write.idempotency)) return { applied: false };
      const { refund } = write;
      const insertedRefund = await transaction.query({
        text: `
          INSERT INTO refunds (
            id, order_id, amount_fen, provider_refund_id, status, reason, created_at,
            provider, completed_at, requested_by_user_id, idempotency_key
          ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)
          ON CONFLICT (requested_by_user_id, idempotency_key) DO NOTHING
          RETURNING id`,
        values: [
          refund.id, refund.orderId, refund.amountFen, refund.providerRefundId, refund.status,
          refund.reason, refund.createdAt, refund.provider, refund.completedAt,
          write.requestedByUserId, write.idempotency.key,
        ],
      });
      if (insertedRefund.rows.length === 0) return { applied: false };
      return { applied: true };
    });
  }

  public async persistBenefitRevocation(
    write: MembershipDurableBenefitRevocationWrite,
  ): Promise<MembershipDurableWriteResult> {
    return this.database.transaction(async (transaction) => {
      if (!await this.reserveIdempotency(transaction, write.idempotency)) return { applied: false };
      const revoked = await transaction.query({
        text: `
          UPDATE benefit_grants
          SET revoked_at = $2, reason = $3, updated_at = $2
          WHERE id = $1 AND revoked_at IS NULL
          RETURNING id`,
        values: [write.grant.id, write.grant.revokedAt, write.grant.reason],
      });
      if (revoked.rows.length === 0) return { applied: false };
      await transaction.query({
        text: `
          UPDATE entitlements
          SET revoked_at = $2
          WHERE benefit_grant_id = $1 AND revoked_at IS NULL`,
        values: [write.grant.id, write.grant.revokedAt],
      });
      await transaction.query({
        text: `
          UPDATE storage_grants
          SET revoked_at = $2
          WHERE benefit_grant_id = $1 AND revoked_at IS NULL`,
        values: [write.grant.id, write.grant.revokedAt],
      });
      await transaction.query({
        text: `
          UPDATE user_badges
          SET revoked_at = $2
          WHERE benefit_grant_id = $1 AND revoked_at IS NULL`,
        values: [write.grant.id, write.grant.revokedAt],
      });
      for (const membership of write.revokedMemberships) {
        await transaction.query({
          text: `
            UPDATE subscriptions
            SET status = 'REVOKED', revoked_at = $2, updated_at = $2
            WHERE id = $1 AND source_reference = $3 AND status = 'ACTIVE'
            RETURNING id`,
          values: [membership.id, membership.revokedAt, membership.sourceReference],
        });
        await transaction.query({
          text: `
            UPDATE entitlements
            SET revoked_at = $2
            WHERE subscription_id = $1 AND revoked_at IS NULL`,
          values: [membership.id, membership.revokedAt],
        });
      }
      await this.insertHistory(transaction, write.history);
      await transaction.query({
        text: `
          INSERT INTO membership_admin_audit (
            id, admin_identity_id, actor_user_id, target_user_id, capability,
            action, resource_id, reason, created_at
          ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)`,
        values: [
          write.audit.id, write.audit.adminId, write.audit.actorUserId,
          write.audit.targetUserId, write.audit.capability, write.audit.action,
          write.audit.resourceId, write.audit.reason, write.audit.createdAt,
        ],
      });
      return { applied: true };
    });
  }

  public async persistExpiry(write: MembershipDurableExpiryWrite): Promise<MembershipDurableWriteResult> {
    if (write.memberships.length === 0 && write.orders.length === 0) return { applied: false };
    return this.database.transaction(async (transaction) => {
      let changed = false;
      for (const membership of write.memberships) {
        const result = await transaction.query({
          text: `
            UPDATE subscriptions
            SET status = 'EXPIRED', updated_at = $2
            WHERE id = $1 AND status = 'ACTIVE' AND revoked_at IS NULL
            RETURNING id`,
          values: [membership.id, membership.updatedAt],
        });
        changed ||= result.rows.length === 1;
      }
      await this.insertHistory(transaction, write.history);
      for (const order of write.orders) {
        const result = await transaction.query({
          text: `
            UPDATE orders
            SET status = 'EXPIRED', updated_at = $2
            WHERE id = $1 AND status IN ('CREATED', 'PENDING_PAYMENT')
            RETURNING id`,
          values: [order.id, order.updatedAt],
        });
        if (result.rows.length !== 1) continue;
        changed = true;
        const reservation = write.couponReleases.find((candidate) => candidate.orderId === order.id);
        if (reservation?.couponId !== null && reservation?.couponId !== undefined) {
          const deleted = await transaction.query<{ readonly couponId: string | null }>({
            text: `DELETE FROM redemptions WHERE id = $1 AND order_id = $2 RETURNING coupon_id AS "couponId"`,
            values: [reservation.id, order.id],
          });
          if (deleted.rows.length === 1 && deleted.rows[0]?.couponId !== null) {
            await transaction.query({
              text: `UPDATE coupons SET redeemed_count = GREATEST(0, redeemed_count - 1), updated_at = now() WHERE id = $1`,
              values: [deleted.rows[0]!.couponId],
            });
          }
        }
      }
      return { applied: changed };
    });
  }

  public async persistCampaign(write: MembershipDurableCampaignWrite): Promise<MembershipDurableWriteResult> {
    return this.database.transaction(async (transaction) => {
      if (!await this.reserveIdempotency(transaction, write.idempotency)) return { applied: false };
      const campaign = write.campaign;
      const inserted = await transaction.query({
        text: `
          INSERT INTO campaigns (id, code, status, audience, starts_at, ends_at, created_at, updated_at)
          VALUES ($1, $2, $3, $4, $5, $6, $7, $7)
          ON CONFLICT (code) DO NOTHING
          RETURNING id`,
        values: [campaign.id, campaign.code, campaign.status, campaign.audience, campaign.startsAt, campaign.endsAt, campaign.createdAt],
      });
      if (inserted.rows.length === 0) return { applied: false };
      for (const benefit of campaign.benefits) {
        await transaction.query({
          text: `
            INSERT INTO campaign_benefit_templates (
              id, campaign_id, benefit_type, capability, membership_days,
              plan_code, storage_bytes, badge_code, ends_at
            ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)`,
          values: [
            benefit.id, campaign.id, benefit.type, benefit.capability,
            benefit.membershipDays, benefit.planCode, benefit.storageBytes,
            benefit.badgeCode, benefit.endsAt,
          ],
        });
      }
      if (write.targetUserIds.length > 0) {
        await transaction.query({
          text: `
            INSERT INTO campaign_targets (campaign_id, user_id)
            SELECT $1, target_user_id
            FROM unnest($2::uuid[]) AS target_user_id
            ON CONFLICT DO NOTHING`,
          values: [campaign.id, write.targetUserIds],
        });
      }
      await this.insertAdminAudit(transaction, write.audit);
      return { applied: true };
    });
  }

  public async persistCampaignStatus(
    write: MembershipDurableCampaignStatusWrite,
  ): Promise<MembershipDurableWriteResult> {
    return this.database.transaction(async (transaction) => {
      if (!await this.reserveIdempotency(transaction, write.idempotency)) return { applied: false };
      const updated = await transaction.query({
        text: `
          UPDATE campaigns SET status = $2, updated_at = $3
          WHERE id = $1
          RETURNING id`,
        values: [write.campaign.id, write.campaign.status, write.audit.createdAt],
      });
      if (updated.rows.length === 0) return { applied: false };
      await this.insertAdminAudit(transaction, write.audit);
      return { applied: true };
    });
  }

  public async persistCoupon(write: MembershipDurableCouponWrite): Promise<MembershipDurableWriteResult> {
    return this.database.transaction(async (transaction) => {
      if (!await this.reserveIdempotency(transaction, write.idempotency)) return { applied: false };
      const coupon = write.coupon;
      const inserted = await transaction.query({
        text: `
          INSERT INTO coupons (
            id, code, discount_kind, discount_value, applicable_plan_codes,
            status, max_redemptions, redeemed_count, starts_at, ends_at,
            campaign_id, created_at, updated_at
          ) VALUES ($1, $2, $3, $4, $5::mezip_plan_code[], $6, $7, $8, $9, $10, $11, now(), now())
          ON CONFLICT (code) DO NOTHING
          RETURNING id`,
        values: [
          coupon.id, coupon.code, coupon.discountKind, coupon.discountValue,
          coupon.applicablePlans, coupon.status, coupon.maxRedemptions,
          coupon.redeemedCount, coupon.startsAt, coupon.endsAt, coupon.campaignId,
        ],
      });
      if (inserted.rows.length === 0) return { applied: false };
      await this.insertAdminAudit(transaction, write.audit);
      return { applied: true };
    });
  }

  public async persistRedemptionCode(
    write: MembershipDurableRedemptionCodeWrite,
  ): Promise<MembershipDurableWriteResult> {
    return this.database.transaction(async (transaction) => {
      if (!await this.reserveIdempotency(transaction, write.idempotency)) return { applied: false };
      const definition = write.definition;
      const inserted = await transaction.query({
        text: `
          INSERT INTO redemption_codes (
            id, code_hash, code_prefix, status, max_redemptions, redeemed_count,
            starts_at, ends_at, membership_days, plan_code, storage_bytes,
            capability, badge_code, created_by_admin_id
          ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14)
          ON CONFLICT (code_hash) DO NOTHING
          RETURNING id`,
        values: [
          definition.id, definition.codeHash, definition.codePrefix, definition.status,
          definition.maxRedemptions, definition.redeemedCount, definition.startsAt,
          definition.endsAt, definition.membershipDays, definition.planCode,
          definition.storageBytes, definition.capability, definition.badgeCode,
          write.adminIdentityId,
        ],
      });
      if (inserted.rows.length === 0) return { applied: false };
      await this.insertAdminAudit(transaction, write.audit);
      return { applied: true };
    });
  }

  public async persistCustomerGrants(
    write: MembershipDurableCustomerGrantWrite,
  ): Promise<MembershipDurableWriteResult> {
    return this.database.transaction(async (transaction) => {
      if (!await this.reserveIdempotency(transaction, write.idempotency)) return { applied: false };
      if (write.redemption !== null) {
        const code = await transaction.query({
          text: `
            SELECT id FROM redemption_codes
            WHERE id = $1 AND status = 'ACTIVE'
              AND starts_at <= now() AND (ends_at IS NULL OR ends_at > now())
              AND redeemed_count < max_redemptions
            FOR UPDATE`,
          values: [write.redemptionCodeId],
        });
        if (code.rows.length !== 1) throw new Error('Redemption code is not durably active.');
        const insertedRedemption = await transaction.query({
          text: `
            INSERT INTO redemptions (
              id, user_id, order_id, redemption_code_id, coupon_id,
              benefit_grant_id, idempotency_key, redeemed_at
            ) VALUES ($1, $2, NULL, $3, NULL, NULL, $4, $5)
            ON CONFLICT (redemption_code_id, user_id) DO NOTHING
            RETURNING id`,
          values: [
            write.redemption.id, write.redemption.userId,
            write.redemption.redemptionCodeId, write.redemption.idempotencyKey,
            write.redemption.redeemedAt,
          ],
        });
        if (insertedRedemption.rows.length === 0) return { applied: false };
        const consumed = await transaction.query({
          text: `
            UPDATE redemption_codes
            SET redeemed_count = redeemed_count + 1,
              status = CASE WHEN redeemed_count + 1 >= max_redemptions THEN 'EXHAUSTED' ELSE status END
            WHERE id = $1 AND redeemed_count < max_redemptions
            RETURNING id`,
          values: [write.redemptionCodeId],
        });
        if (consumed.rows.length !== 1) throw new Error('Redemption code exhausted while being claimed.');
      }
      if (write.campaignClaim !== null) {
        const allowed = await transaction.query<{ readonly allowed: boolean }>({
          text: `SELECT mezip_phase6_campaign_audience_allowed($1, $2) AS allowed`,
          values: [write.campaignClaim.campaignId, write.campaignClaim.userId],
        });
        if (allowed.rows[0]?.allowed !== true) throw new Error('Campaign audience is not durably eligible.');
        const insertedClaim = await transaction.query({
          text: `
            INSERT INTO campaign_claims (id, campaign_id, user_id, idempotency_key, claimed_at)
            VALUES ($1, $2, $3, $4, $5)
            ON CONFLICT (campaign_id, user_id) DO NOTHING
            RETURNING id`,
          values: [
            write.campaignClaim.id, write.campaignClaim.campaignId,
            write.campaignClaim.userId, write.campaignClaim.idempotencyKey,
            write.campaignClaim.claimedAt,
          ],
        });
        if (insertedClaim.rows.length === 0) return { applied: false };
      }
      for (const grant of write.grants) {
        if (!await this.insertBenefitGrant(transaction, grant, write.redemptionCodeId)) {
          throw new Error('Customer benefit grant idempotency collision.');
        }
      }
      for (const membership of write.memberships) await this.insertMembership(transaction, membership);
      await this.insertHistory(transaction, write.history);
      await this.insertEntitlements(transaction, write.entitlements);
      if (write.redemption !== null) {
        for (const grant of write.grants) {
          await transaction.query({
            text: `INSERT INTO redemption_benefit_grants (redemption_id, benefit_grant_id) VALUES ($1, $2) ON CONFLICT DO NOTHING`,
            values: [write.redemption.id, grant.id],
          });
        }
      }
      if (write.campaignClaim !== null) {
        for (const grant of write.grants) {
          await transaction.query({
            text: `INSERT INTO campaign_claim_benefit_grants (campaign_claim_id, benefit_grant_id) VALUES ($1, $2) ON CONFLICT DO NOTHING`,
            values: [write.campaignClaim.id, grant.id],
          });
        }
      }
      return { applied: true };
    });
  }

  public async persistAdminAudit(
    write: MembershipDurableAdminAuditWrite,
  ): Promise<MembershipDurableWriteResult> {
    return this.database.transaction(async (transaction) => {
      const result = await transaction.query({
        text: `
          INSERT INTO membership_admin_audit (
            id, admin_identity_id, actor_user_id, target_user_id, capability,
            action, resource_id, reason, created_at
          ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
          ON CONFLICT (id) DO NOTHING
          RETURNING id`,
        values: [
          write.audit.id, write.audit.adminId, write.audit.actorUserId,
          write.audit.targetUserId, write.audit.capability, write.audit.action,
          write.audit.resourceId, write.audit.reason, write.audit.createdAt,
        ],
      });
      return { applied: result.rows.length === 1 };
    });
  }

  private async insertMembership(
    transaction: PostgresMembershipTransaction,
    membership: MembershipDurableMembershipRow,
  ): Promise<void> {
    await transaction.query({
      text: `
        INSERT INTO subscriptions (
          id, owner_id, order_id, plan_code, status, starts_at, ends_at,
          created_at, source, source_reference, revoked_at, updated_at
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12)
        ON CONFLICT (order_id) DO NOTHING`,
      values: [
        membership.id, membership.userId, membership.orderId, membership.planCode,
        membership.status, membership.startsAt, membership.expiresAt,
        membership.createdAt, membership.source, membership.sourceReference,
        membership.revokedAt, membership.updatedAt,
      ],
    });
  }

  private async insertBenefitGrant(
    transaction: PostgresMembershipTransaction,
    grant: MembershipDurableBenefitGrantRow,
    redemptionCodeId: string | null = null,
  ): Promise<boolean> {
    const inserted = await transaction.query({
      text: `
        INSERT INTO benefit_grants (
          id, user_id, benefit_type, capability, reason, operator_id, source, campaign_id,
          starts_at, ends_at, revoked_at, idempotency_key, plan_code, membership_days,
          storage_bytes, badge_code, coupon_id, redemption_code_id
        ) VALUES (
          $1, $2, $3, $4, $5, $6, $7, $8,
          $9, $10, $11, $12, $13, $14, $15, $16, $17, $18
        ) ON CONFLICT (idempotency_key) DO NOTHING
        RETURNING id`,
      values: [
        grant.id, grant.userId, grant.type, grant.capability, grant.reason,
        grant.operatorId, grant.source, grant.campaignId, grant.startsAt,
        grant.endsAt, grant.revokedAt, grant.idempotencyKey, grant.planCode,
        grant.membershipDays, grant.storageBytes, grant.badgeCode, grant.couponId,
        redemptionCodeId,
      ],
    });
    if (inserted.rows.length === 0) return false;
    if (grant.storageBytes !== null) {
      await transaction.query({
        text: `
          INSERT INTO storage_grants (
            id, user_id, benefit_grant_id, bytes, source, starts_at, ends_at, revoked_at
          ) VALUES ($1, $2, $1, $3, $4, $5, $6, $7)
          ON CONFLICT (id) DO NOTHING`,
        values: [
          grant.id, grant.userId, grant.storageBytes, grant.source,
          grant.startsAt, grant.endsAt, grant.revokedAt,
        ],
      });
    }
    if (grant.badgeCode !== null) {
      await transaction.query({
        text: `INSERT INTO badges (code, display_name) VALUES ($1, $1) ON CONFLICT (code) DO NOTHING`,
        values: [grant.badgeCode],
      });
      await transaction.query({
        text: `
          INSERT INTO user_badges (user_id, badge_code, benefit_grant_id, granted_at, revoked_at)
          VALUES ($1, $2, $3, $4, $5)
          ON CONFLICT (user_id, badge_code) DO UPDATE
          SET benefit_grant_id = EXCLUDED.benefit_grant_id,
              granted_at = EXCLUDED.granted_at,
              revoked_at = EXCLUDED.revoked_at`,
        values: [grant.userId, grant.badgeCode, grant.id, grant.startsAt, grant.revokedAt],
      });
    }
    return true;
  }

  private async insertAdminAudit(
    transaction: PostgresMembershipTransaction,
    audit: MembershipAdminAudit,
  ): Promise<void> {
    await transaction.query({
      text: `
        INSERT INTO membership_admin_audit (
          id, admin_identity_id, actor_user_id, target_user_id, capability,
          action, resource_id, reason, created_at
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)`,
      values: [
        audit.id, audit.adminId, audit.actorUserId, audit.targetUserId,
        audit.capability, audit.action, audit.resourceId, audit.reason,
        audit.createdAt,
      ],
    });
  }

  /** Reserve a scope before any business-side effect. PostgreSQL's unique
   * index serializes the same key across service instances. A same-fingerprint
   * replay returns false; a mismatched fingerprint is a hard conflict. */
  private async reserveIdempotency(
    transaction: PostgresMembershipTransaction,
    receipt: MembershipIdempotencyReceipt,
  ): Promise<boolean> {
    const inserted = await transaction.query({
      text: `
        INSERT INTO membership_idempotency (scope_key, fingerprint, result)
        VALUES ($1, $2, $3::jsonb)
        ON CONFLICT (scope_key) DO NOTHING
        RETURNING scope_key`,
      values: [receipt.key, receipt.fingerprint, JSON.stringify(receipt.result)],
    });
    if (inserted.rows.length === 1) return true;
    const existing = await transaction.query<{ readonly fingerprint: string }>({
      text: `SELECT fingerprint FROM membership_idempotency WHERE scope_key = $1`,
      values: [receipt.key],
    });
    const durableFingerprint = existing.rows[0]?.fingerprint;
    if (durableFingerprint === undefined) throw new Error('Durable idempotency reservation was not readable.');
    if (durableFingerprint !== receipt.fingerprint) throw new MembershipDurableIdempotencyConflictError();
    return false;
  }

  private async insertHistory(
    transaction: PostgresMembershipTransaction,
    history: readonly MembershipHistoryEvent[],
  ): Promise<void> {
    for (const event of history) {
      await transaction.query({
        text: `
          INSERT INTO membership_history (
            id, membership_id, user_id, event, source, reason, actor_user_id, occurred_at
          ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
          ON CONFLICT (id) DO NOTHING`,
        values: [
          event.id, event.membershipId, event.userId, event.event, event.source,
          event.reason, event.actorUserId, event.occurredAt,
        ],
      });
    }
  }

  private async insertEntitlements(
    transaction: PostgresMembershipTransaction,
    entitlements: readonly MembershipEntitlement[],
  ): Promise<void> {
    for (const entitlement of entitlements) {
      await transaction.query({
        text: `
          INSERT INTO entitlements (
            id, owner_id, subscription_id, code, valid_from, valid_until,
            revoked_at, source, benefit_grant_id
          ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
          ON CONFLICT (id) DO NOTHING`,
        values: [
          entitlement.id, entitlement.userId, entitlement.membershipId,
          entitlement.code, entitlement.startsAt, entitlement.endsAt,
          entitlement.revokedAt, entitlement.source, entitlement.grantId,
        ],
      });
    }
  }
}
