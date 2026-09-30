export const planCodes = ['FREE', 'GO', 'PLUS', 'PRO', 'PRO_MAX'] as const;
export type PlanCode = (typeof planCodes)[number];

/**
 * Frozen display/configuration prices in integer CNY fen.
 * The server remains authoritative for checkout and entitlements.
 */
export const membershipPriceFen = {
  FREE: 0,
  GO: 1_000,
  PLUS: 2_000,
  PRO: 4_000,
  PRO_MAX: 8_000,
} as const satisfies Record<PlanCode, number>;

/** Stable server-side capability vocabulary; UI and APIs must not branch on plan names. */
export const capabilityCodes = [
  'ARCHIVE_PRIVATE',
  'MEDIA_BASIC',
  'TIMELINE_PRIVATE',
  'HISTORY_PRIVATE',
  'FITNESS_PRIVATE',
  'MOVEMENT_BASIC',
  'AI_USAGE_BASIC',
  'STATS_BASIC',
  'PROFILE_SELF',
  'DATA_EXPORT',
  'COMMUNITY_READ',
  /** Legacy Phase 1 names remain valid; Phase 4 uses the granular codes below. */
  'COMMUNITY_POST',
  'COMMUNITY_COMMENT',
  'COMMUNITY_GROUP',
  'COMMUNITY_INTERACT',
  'COMMUNITY_PUBLISH',
  'COMMUNITY_FOLLOW',
  'COMMUNITY_SAVE',
  'GROUP_JOIN',
  'GROUP_CREATE',
  'ACTIVITY_JOIN',
  'CHANNEL_PREMIUM_ACCESS',
  /** Canonical Phase 5 Founder Inbox entitlement. */
  'FOUNDER_INBOX_ACCESS',
  /** Legacy alias retained for previously frozen product wording. */
  'FOUNDER_DM',
  'FOUNDER_PRIORITY_INBOX',
  'FOUNDER_PRO_FEED',
  'FOUNDER_CIRCLE_ACCESS',
  'FOUNDER_CONTACT_REQUEST',
  'CREATOR_LAB_ACCESS',
  'VIBE_CODING_ACCESS',
  'CODE_HUB_ACCESS',
  'CODE_DOWNLOAD_ACCESS',
  'FOUNDER_CURATED_SOCIAL_ACCESS',
  'VIBE_CODING',
  'CODE_HUB',
  'SOURCE_DOWNLOAD',
  'RELEASE_DOWNLOAD',
  'ADVANCED_ANALYTICS',
  'MEDIA_STORAGE_PLUS',
  /** Canonical Phase 11 server-side sandbox runtime entitlement. */
  'SANDBOX_RUNTIME_ACCESS',
  /** Phase 12 deployment capabilities are intentionally an entitlement foundation;
   * product plan mapping remains an Owner decision. */
  'PROJECT_DEPLOY_ACCESS',
  'PREVIEW_DEPLOY_ACCESS',
  'PRODUCTION_DEPLOY_ACCESS',
  'CUSTOM_DOMAIN_ACCESS',
  'EXTENDED_PREVIEW',
  'DEPLOYMENT_BANDWIDTH',
  'BUILD_MINUTES',
] as const;
export type CapabilityCode = (typeof capabilityCodes)[number];

export const planCapabilities: Readonly<Record<PlanCode, readonly CapabilityCode[]>> = {
  FREE: [
    'ARCHIVE_PRIVATE',
    'MEDIA_BASIC',
    'TIMELINE_PRIVATE',
    'HISTORY_PRIVATE',
    'FITNESS_PRIVATE',
    'MOVEMENT_BASIC',
    'AI_USAGE_BASIC',
    'STATS_BASIC',
    'PROFILE_SELF',
    'DATA_EXPORT',
    'COMMUNITY_READ',
  ],
  GO: [
    'COMMUNITY_POST',
    'COMMUNITY_COMMENT',
    'COMMUNITY_GROUP',
    'COMMUNITY_INTERACT',
    'COMMUNITY_PUBLISH',
    'COMMUNITY_FOLLOW',
    'COMMUNITY_SAVE',
    'GROUP_JOIN',
    'ACTIVITY_JOIN',
  ],
  // `FOUNDER_DM` remains a legacy resolver input for existing grants. New
  // callers must authorize Founder Inbox with FOUNDER_INBOX_ACCESS only.
  PLUS: ['FOUNDER_INBOX_ACCESS', 'FOUNDER_DM'],
  PRO: [
    'FOUNDER_PRIORITY_INBOX',
    'FOUNDER_PRO_FEED',
    'FOUNDER_CIRCLE_ACCESS',
    'FOUNDER_CONTACT_REQUEST',
  ],
  PRO_MAX: [
    'CREATOR_LAB_ACCESS',
    'VIBE_CODING_ACCESS',
    'CODE_HUB_ACCESS',
    'CODE_DOWNLOAD_ACCESS',
    'FOUNDER_CURATED_SOCIAL_ACCESS',
    'VIBE_CODING',
    'CODE_HUB',
    'SOURCE_DOWNLOAD',
    'RELEASE_DOWNLOAD',
    'MEDIA_STORAGE_PLUS',
    'SANDBOX_RUNTIME_ACCESS',
  ],
};

export type BenefitGrantSource =
  | 'PURCHASE'
  | 'COUPON'
  | 'REDEMPTION'
  | 'ADMIN_GRANT'
  | 'INVITE_REWARD'
  | 'FOUNDER_INTERNAL'
  | 'SYSTEM'
  | 'GIFT'
  | 'SINGLE_BENEFIT'
  | 'CAMPAIGN'
  | 'TEMPORARY'
  | 'GRAY_ROLLOUT'
  | 'FOUNDER'
  | 'PROMO'
  | 'TRIAL';

export interface BenefitGrant {
  readonly id: string;
  readonly userId: string;
  readonly capability: CapabilityCode;
  readonly benefitType?: string;
  readonly entitlement?: CapabilityCode;
  readonly quantity?: number;
  readonly reason?: string | null;
  readonly operatorId?: string | null;
  readonly source: BenefitGrantSource;
  readonly startsAt: string;
  readonly endsAt: string | null;
  readonly revokedAt: string | null;
  readonly idempotencyKey: string;
}

export const membershipSources = [
  'PURCHASE',
  'TRIAL',
  'COUPON',
  'REDEMPTION',
  'CAMPAIGN',
  'ADMIN_GRANT',
  'INVITE_REWARD',
  'FOUNDER_INTERNAL',
  'SYSTEM',
] as const;
export type MembershipSource = (typeof membershipSources)[number];

export const membershipStatuses = [
  'PENDING',
  'ACTIVE',
  'EXPIRED',
  'REVOKED',
  'CANCELLED',
] as const;
export type MembershipStatus = (typeof membershipStatuses)[number];

export const membershipRenewalModes = ['NON_AUTO_RENEWING_MONTHLY_PASS'] as const;
export type MembershipRenewalMode = (typeof membershipRenewalModes)[number];

export const paymentProviderCodes = [
  'WECHAT_PAY',
  'ALIPAY',
  'UNIONPAY',
  /** StoreKit / App Store server-verification boundary. This is not an Apple
   * credential and does not make an iOS purchase flow available by itself. */
  'APPLE_IAP',
  'MOCK',
] as const;
export type PaymentProviderCode = (typeof paymentProviderCodes)[number];

/** Billing platform is server transport context, never a client checkout
 * field. It is intentionally narrower than the general device platform enum. */
export const billingPlatformCodes = ['WEB', 'WECHAT_MINI_PROGRAM', 'IOS', 'ANDROID'] as const;
export type BillingPlatform = (typeof billingPlatformCodes)[number];

export const billingEnvironmentCodes = ['DEVELOPMENT', 'TEST', 'STAGING', 'PRODUCTION'] as const;
export type BillingEnvironment = (typeof billingEnvironmentCodes)[number];

/** Safe client projection of whether a provider is configured. `VERIFIED`
 * can only be set by a server production rehearsal; clients cannot infer it
 * from a button or a successful provider UI callback. */
export const paymentProviderReadinessCodes = [
  'NOT_CONFIGURED',
  'SANDBOX',
  'READY',
  'VERIFIED',
  'DISABLED',
] as const;
export type PaymentProviderReadiness = (typeof paymentProviderReadinessCodes)[number];

export const paymentStatuses = [
  'CREATED',
  'PENDING',
  'SUCCEEDED',
  'FAILED',
  'CANCELLED',
  'REFUNDED',
] as const;
export type PaymentStatus = (typeof paymentStatuses)[number];

export const benefitGrantTypes = [
  'MEMBERSHIP_DAYS',
  'TEMP_ENTITLEMENT',
  'STORAGE_BYTES',
  'COUPON',
  'BADGE',
  'FEATURE_ACCESS',
] as const;
export type BenefitGrantType = (typeof benefitGrantTypes)[number];

export const campaignStatuses = [
  'DRAFT',
  'SCHEDULED',
  'ACTIVE',
  'PAUSED',
  'ENDED',
  'CANCELLED',
] as const;
export type CampaignStatus = (typeof campaignStatuses)[number];

export const campaignAudienceCodes = [
  'ALL_USERS',
  'NEW_USERS',
  'FREE_USERS',
  'GO_USERS',
  'PLUS_USERS',
  'PRO_USERS',
  'PRO_MAX_USERS',
  'SELECTED_USERS',
  'INVITED_USERS',
] as const;
export type CampaignAudience = (typeof campaignAudienceCodes)[number];

export const couponDiscountKinds = ['FIXED_FEN', 'PERCENTAGE'] as const;
export type CouponDiscountKind = (typeof couponDiscountKinds)[number];

export const redemptionCodeStatuses = [
  'ACTIVE',
  'PAUSED',
  'EXHAUSTED',
  'EXPIRED',
  'REVOKED',
] as const;
export type RedemptionCodeStatus = (typeof redemptionCodeStatuses)[number];

export const membershipAdminCapabilityCodes = [
  'MANAGE_CAMPAIGNS',
  'MANAGE_COUPONS',
  'MANAGE_REDEMPTIONS',
  'GRANT_BENEFITS',
  'MANAGE_MEMBERSHIPS',
  'VIEW_PAYMENT_METADATA',
] as const;
export type MembershipAdminCapabilityCode =
  (typeof membershipAdminCapabilityCodes)[number];

export interface MembershipPlan {
  readonly code: PlanCode;
  readonly name: string;
  readonly amountFen: number;
  readonly currency: 'CNY';
  /** FREE is a permanent baseline, not a 30-day membership. */
  readonly durationDays: number | null;
  readonly renewalMode: MembershipRenewalMode;
  readonly entitlementCodes: readonly CapabilityCode[];
}

export interface Membership {
  readonly id: string;
  readonly userId: string;
  readonly orderId: string | null;
  readonly planCode: PlanCode;
  readonly status: MembershipStatus;
  readonly source: MembershipSource;
  /** Server-created provenance for a revocable non-purchase membership, such
   * as `benefit-grant:<uuid>`. Never supplied by a checkout client. */
  readonly sourceReference: string | null;
  readonly startsAt: string;
  readonly expiresAt: string;
  readonly createdAt: string;
  readonly updatedAt: string;
  readonly revokedAt: string | null;
}

export interface MembershipHistoryEvent {
  readonly id: string;
  readonly membershipId: string;
  readonly userId: string;
  readonly event:
    'CREATED' | 'ACTIVATED' | 'EXTENDED' | 'EXPIRED' | 'REVOKED' | 'CANCELLED';
  readonly source: MembershipSource;
  readonly occurredAt: string;
  readonly reason: string | null;
  readonly actorUserId: string | null;
}

export interface MembershipEntitlement {
  readonly id: string;
  readonly userId: string;
  readonly code: CapabilityCode;
  readonly source:
    | 'PLAN'
    | 'MEMBERSHIP'
    | 'BENEFIT'
    | 'CAMPAIGN'
    | 'MANUAL'
    | 'TEMPORARY'
    | 'SIMULATION';
  readonly startsAt: string;
  readonly endsAt: string | null;
  readonly revokedAt: string | null;
  readonly membershipId: string | null;
  readonly grantId: string | null;
}

export interface MembershipBenefitGrant {
  readonly id: string;
  readonly userId: string;
  readonly type: BenefitGrantType;
  readonly source: MembershipSource | BenefitGrantSource;
  readonly capability: CapabilityCode | null;
  readonly membershipDays: number | null;
  readonly planCode: PlanCode | null;
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

export interface MembershipOrder {
  readonly id: string;
  readonly orderNo: string;
  readonly userId: string;
  readonly planCode: PlanCode;
  readonly baseAmountFen: number;
  readonly discountAmountFen: number;
  readonly payableAmountFen: number;
  readonly currency: 'CNY';
  readonly couponId: string | null;
  readonly provider: PaymentProviderCode | null;
  readonly status: OrderStatus;
  readonly createdAt: string;
  readonly expiresAt: string;
  readonly paidAt: string | null;
  readonly updatedAt: string;
}

export interface MembershipPayment {
  readonly id: string;
  readonly orderId: string;
  readonly provider: PaymentProviderCode;
  readonly providerPaymentId: string;
  readonly providerTransactionId: string | null;
  readonly amountFen: number;
  readonly currency: 'CNY';
  readonly status: PaymentStatus;
  readonly createdAt: string;
  readonly verifiedAt: string | null;
}

export interface MembershipCheckout {
  readonly order: MembershipOrder;
  readonly provider: PaymentProviderCode;
  readonly providerPaymentId: string;
  readonly clientPayload: Readonly<Record<string, string>>;
  readonly state: 'PENDING_PAYMENT' | 'PENDING_CONFIRMATION';
}

/** Safe server projection for checkout UI. It intentionally contains no
 * merchant configuration, key material, callback URL, or provider payload. */
export interface MembershipPaymentProviderAvailability {
  readonly provider: PaymentProviderCode;
  readonly checkoutAvailable: boolean;
  readonly callbackVerificationAvailable: boolean;
  readonly readiness: PaymentProviderReadiness;
}

export interface MembershipRefund {
  readonly id: string;
  readonly orderId: string;
  readonly provider: PaymentProviderCode | null;
  readonly providerRefundId: string | null;
  readonly amountFen: number;
  readonly status: 'REQUESTED' | 'PENDING' | 'SUCCEEDED' | 'FAILED';
  readonly reason: string;
  readonly createdAt: string;
  readonly completedAt: string | null;
}

export interface MembershipCoupon {
  readonly id: string;
  readonly code: string;
  readonly discountKind: CouponDiscountKind;
  readonly discountValue: number;
  readonly applicablePlans: readonly PlanCode[];
  readonly status: 'ACTIVE' | 'PAUSED' | 'EXPIRED';
  readonly maxRedemptions: number | null;
  readonly redeemedCount: number;
  readonly startsAt: string;
  readonly endsAt: string | null;
  readonly campaignId: string | null;
}

export interface MembershipCampaign {
  readonly id: string;
  readonly code: string;
  readonly status: CampaignStatus;
  readonly audience: CampaignAudience;
  /** Server-created benefit definitions. A customer can claim only the
   * campaign id; they never submit a benefit, plan, price, or target user. */
  readonly benefits: readonly MembershipCampaignBenefit[];
  readonly startsAt: string;
  readonly endsAt: string | null;
  readonly createdAt: string;
}

export interface MembershipCampaignBenefit {
  readonly id: string;
  readonly type: BenefitGrantType;
  readonly capability: CapabilityCode | null;
  readonly membershipDays: number | null;
  readonly planCode: PlanCode | null;
  readonly storageBytes: number | null;
  readonly badgeCode: string | null;
  readonly couponId: string | null;
  readonly endsAt: string | null;
}

/** Immutable self-service claim receipt. It has no private campaign-target
 * metadata and does not expose another user's benefit grants. */
export interface MembershipCampaignClaim {
  readonly id: string;
  readonly campaignId: string;
  readonly userId: string;
  readonly benefitGrantIds: readonly string[];
  readonly idempotencyKey: string;
  readonly claimedAt: string;
}

export interface MembershipRedemptionCode {
  readonly id: string;
  readonly codePrefix: string;
  readonly status: RedemptionCodeStatus;
  readonly maxRedemptions: number;
  readonly redeemedCount: number;
  readonly startsAt: string;
  readonly endsAt: string | null;
  readonly membershipDays: number | null;
  readonly planCode: PlanCode | null;
  readonly storageBytes: number | null;
  readonly capability: CapabilityCode | null;
  readonly badgeCode: string | null;
}

export interface MembershipRedemption {
  readonly id: string;
  readonly userId: string;
  readonly orderId: string | null;
  readonly redemptionCodeId: string | null;
  readonly couponId: string | null;
  readonly benefitGrantIds: readonly string[];
  readonly idempotencyKey: string;
  readonly redeemedAt: string;
}

export interface MembershipStorageQuota {
  readonly baseBytes: number;
  readonly planBytes: number;
  readonly benefitBytes: number;
  readonly manualGrantBytes: number;
  readonly totalBytes: number;
  readonly usedBytes: number;
  readonly state: 'WITHIN_QUOTA' | 'OVER_QUOTA';
  readonly canUpload: boolean;
}

export interface MembershipCenter {
  readonly currentMembership: Membership | null;
  readonly effectivePlanCode: PlanCode;
  readonly entitlements: readonly MembershipEntitlement[];
  readonly benefits: readonly MembershipBenefitGrant[];
  readonly storage: MembershipStorageQuota;
}

export const recordKinds = [
  'LIFE',
  'HISTORY',
  'FITNESS',
  'AI',
  'MOVEMENT',
  'ACHIEVEMENT',
  'CREATOR',
] as const;
export type RecordKind = (typeof recordKinds)[number];

/**
 * Ordinary user content visibility. Membership plan codes are deliberately
 * absent: a paid plan never becomes a private-data audience.
 * `SNAPSHOT` is an internal publication pipeline state only.
 */
export const contentVisibilityCodes = [
  'PRIVATE',
  'COMMUNITY',
  'GROUP',
  'DIRECT_SHARE',
  'PUBLIC',
  'SNAPSHOT',
] as const;
export type ContentVisibility = (typeof contentVisibilityCodes)[number];
export type PrivacyState = ContentVisibility;

export const adminTypes = [
  'ORIGINAL_DEVELOPER_ROOT',
  'ADMIN',
  'MODERATOR',
  'SUPPORT',
] as const;
export type AdminType = (typeof adminTypes)[number];

export const adminIdentityStatuses = ['ACTIVE', 'SUSPENDED', 'REVOKED'] as const;
export type AdminIdentityStatus = (typeof adminIdentityStatuses)[number];

/** Root capabilities are independent from membership and ordinary platform roles. */
export const adminCapabilityCodes = [
  'ROOT_READ_USER_DATA',
  'ROOT_READ_SENSITIVE_DATA',
  'ROOT_READ_PRIVATE_MESSAGES',
  /** Bounded, audited metadata-only AI Usage read. It is intentionally
   * separate from archive/media/message access. */
  'ROOT_READ_AI_USAGE',
  'ROOT_MODIFY_USER_DATA',
  'ROOT_DELETE_USER_DATA',
  'ROOT_EXPORT_USER_DATA',
  'ROOT_BULK_EXPORT',
  'ROOT_MANAGE_CHANNELS',
  'ROOT_MANAGE_MEMBERSHIP',
  'ROOT_MANAGE_ENTITLEMENTS',
  'ROOT_MANAGE_BENEFITS',
  'ROOT_MANAGE_FEATURE_FLAGS',
  'ROOT_MANAGE_AI_GATEWAY',
  'ROOT_VIEW_AUDIT',
] as const;
export type AdminCapabilityCode = (typeof adminCapabilityCodes)[number];

export const adminAccessActions = [
  'VIEW_USER',
  'READ_PROFILE',
  'READ_LIFE',
  'READ_TIMELINE',
  'READ_HISTORY',
  'READ_FITNESS',
  'READ_BODY_METRICS',
  'READ_STEPS',
  'READ_DAILY_PACK',
  'READ_MEDIA',
  'READ_AI_USAGE',
  'READ_DEVICES',
  'READ_COMMUNITY',
  'READ_CHANNEL',
  'READ_MEMBERSHIP',
  'READ_SECURITY_METADATA',
  'READ_MESSAGE',
  'EXPORT_USER_DATA',
  'ADMIN_REVISION',
  'DELETE_USER_DATA',
] as const;
export type AdminAccessAction = (typeof adminAccessActions)[number];

export interface AdminIdentity {
  readonly id: string;
  readonly userId: string;
  readonly adminType: AdminType;
  readonly status: AdminIdentityStatus;
  readonly capabilities: readonly AdminCapabilityCode[];
  readonly createdAt: string;
  readonly lastAuthenticatedAt: string | null;
}

export interface AdminAccessAudit {
  readonly id: string;
  readonly adminId: string;
  readonly targetUserId: string;
  readonly resourceType: string;
  readonly resourceId: string | null;
  readonly action: AdminAccessAction;
  readonly timestamp: string;
  readonly sessionId: string;
  readonly ipContext: string | null;
  readonly deviceContext: string | null;
  readonly environment: 'DEVELOPMENT' | 'STAGING' | 'PRODUCTION';
  readonly reason: string | null;
}

export interface MembershipSimulationContext {
  readonly planCode: PlanCode;
  readonly simulatedByAdminId: string;
  readonly isSimulation: true;
}

export const founderAudienceCodes = [
  'FOUNDER_PUBLIC',
  'FOUNDER_FREE',
  'FOUNDER_GO',
  'FOUNDER_PLUS',
  'FOUNDER_PRO',
  'FOUNDER_PRO_MAX',
] as const;
export type FounderAudience = (typeof founderAudienceCodes)[number];

export const channelTypes = [
  'OFFICIAL',
  'COMMUNITY',
  'BETA',
  'FEEDBACK',
  'EVENT',
  'CREATOR',
  'DEVELOPER',
] as const;
export type ChannelType = (typeof channelTypes)[number];

export interface Channel {
  readonly id: string;
  readonly ownerId: string;
  readonly type: ChannelType;
  readonly name: string;
  readonly description: string | null;
  readonly visibility: Exclude<ContentVisibility, 'SNAPSHOT'>;
  readonly founderAudience: FounderAudience | null;
  readonly archivedAt: string | null;
  readonly createdAt: string;
}

export interface ChannelPost {
  readonly id: string;
  readonly channelId: string;
  readonly authorId: string;
  readonly snapshotId: string | null;
  readonly body: string | null;
  readonly createdAt: string;
  readonly deletedAt: string | null;
}
export type Platform =
  'WEB' | 'WECHAT_MINIPROGRAM' | 'WINDOWS' | 'IOS' | 'ANDROID' | 'BROWSER_EXTENSION';

/**
 * Authentication providers are identities, not separate user/account tables.
 * APPLE is reserved so adding the provider later does not require changing the
 * unified user model.
 */
export const authProviders = ['WECHAT', 'PHONE', 'EMAIL', 'GOOGLE', 'APPLE'] as const;
export type AuthProvider = (typeof authProviders)[number];

export const authIdentityStatuses = ['ACTIVE', 'REVOKED'] as const;
export type AuthIdentityStatus = (typeof authIdentityStatuses)[number];

export const otpChallengePurposes = ['SIGN_IN', 'LINK_IDENTITY', 'RECOVERY'] as const;
export type OtpChallengePurpose = (typeof otpChallengePurposes)[number];

export const otpChallengeStatuses = [
  'PENDING',
  'CONSUMED',
  'EXPIRED',
  'LOCKED',
  'CANCELLED',
] as const;
export type OtpChallengeStatus = (typeof otpChallengeStatuses)[number];

export const sessionStatuses = ['ACTIVE', 'REVOKED', 'EXPIRED'] as const;
export type SessionStatus = (typeof sessionStatuses)[number];

export const consentKinds = ['TERMS', 'PRIVACY'] as const;
export type ConsentKind = (typeof consentKinds)[number];

export const accountDeletionStatuses = [
  'REQUESTED',
  'PROCESSING',
  'COMPLETED',
  'CANCELLED',
  'REJECTED',
] as const;
export type AccountDeletionStatus = (typeof accountDeletionStatuses)[number];

export interface AuthUser {
  readonly id: string;
  readonly displayName: string;
  readonly status: 'ACTIVE' | 'DELETION_PENDING' | 'DELETED';
  readonly roles: readonly string[];
  readonly createdAt: string;
}

export interface AuthIdentity {
  readonly id: string;
  readonly userId: string;
  readonly provider: AuthProvider;
  /** Provider subject or normalized email/phone; never a credential or OTP. */
  readonly subject: string;
  readonly status: AuthIdentityStatus;
  readonly verifiedAt: string | null;
  readonly createdAt: string;
}

export interface DeviceSession {
  readonly id: string;
  readonly userId: string;
  readonly deviceId: string | null;
  readonly platform: Platform;
  readonly deviceLabel: string | null;
  readonly createdAt: string;
  readonly lastSeenAt: string;
  readonly expiresAt: string;
  readonly revokedAt: string | null;
}

export interface ConsentRecord {
  readonly id: string;
  readonly userId: string;
  readonly termsVersion: string;
  readonly privacyVersion: string;
  readonly acceptedAt: string;
}

export interface AccountDeletionRequest {
  readonly id: string;
  readonly userId: string;
  readonly status: AccountDeletionStatus;
  readonly requestedAt: string;
  readonly scheduledFor: string | null;
  readonly completedAt: string | null;
}
export type MessageRequestStatus = 'PENDING' | 'ACCEPTED' | 'REJECTED' | 'BLOCKED';
export type OrderStatus =
  | 'CREATED'
  | 'PENDING_PAYMENT'
  | 'PAID'
  | 'FULFILLED'
  | 'CANCELLED'
  | 'EXPIRED'
  | 'REFUNDING'
  | 'REFUNDED'
  | 'CLOSED';

export interface AuthenticatedPrincipal {
  readonly userId: string;
  readonly sessionId: string;
  readonly roles: readonly string[];
  readonly issuedAt: string;
  /** Present only for a server-authenticated Admin Command Center session. */
  readonly adminIdentityId?: string;
  readonly adminType?: AdminType;
  readonly adminCapabilities?: readonly AdminCapabilityCode[];
  readonly membershipSimulation?: MembershipSimulationContext;
}

// ---------------------------------------------------------------------------
// Phase 7 AI Usage tracking contracts
// ---------------------------------------------------------------------------
// These are deliberately metadata-only contracts.  They must never grow to
// include prompts, responses, clipboard/keystroke data, cookies, tokens,
// screen captures, page/DOM content, or raw URLs/domains.

export const aiUsageProviderCodes = [
  'OPENAI',
  'ANTHROPIC',
  'GOOGLE',
  'MICROSOFT',
  'OTHER',
] as const;
export type AiUsageProviderCode = (typeof aiUsageProviderCodes)[number];

export const aiUsageAppCodes = [
  'CHATGPT',
  'CODEX',
  'CLAUDE',
  'GEMINI',
  'COPILOT',
  'CURSOR',
  'CLAUDE_CODE',
  'PERPLEXITY',
  'OTHER_AI',
] as const;
export type AiUsageAppCode = (typeof aiUsageAppCodes)[number];

/** Phase 7 app registry is usage classification only.  It is not the Phase 8
 * provider/model registry and does not imply a third-party API integration. */
export interface AiUsageProviderRegistryEntry {
  readonly code: AiUsageProviderCode;
  readonly displayName: string;
  readonly status: 'ACTIVE' | 'DISABLED';
}

export interface AiUsageAppRegistryEntry {
  readonly code: AiUsageAppCode;
  readonly displayName: string;
  readonly providerCode: AiUsageProviderCode;
  readonly status: 'ACTIVE' | 'DISABLED';
  readonly allowedDeviceTypes: readonly AiUsageDeviceType[];
}

export const aiUsageDeviceTypes = ['WINDOWS_AGENT', 'BROWSER_EXTENSION'] as const;
export type AiUsageDeviceType = (typeof aiUsageDeviceTypes)[number];

/** Source is server-derived from the authenticated device route. `MANUAL` and
 * `IMPORT` have separate authenticated routes; clients never submit an
 * arbitrary source field. */
export const aiUsageSources = [
  'WINDOWS_AGENT',
  'BROWSER_EXTENSION',
  'MANUAL',
  'MOBILE',
  'IMPORT',
] as const;
export type AiUsageSource = (typeof aiUsageSources)[number];

export const aiUsageDeviceStatuses = ['ACTIVE', 'REVOKED'] as const;
export type AiUsageDeviceStatus = (typeof aiUsageDeviceStatuses)[number];

export const aiUsagePairingStatuses = [
  'PENDING',
  'COMPLETED',
  'EXPIRED',
  'REVOKED',
] as const;
export type AiUsagePairingStatus = (typeof aiUsagePairingStatuses)[number];

export interface AiUsageTrackingPreferences {
  readonly enabled: boolean;
  readonly windowsAgentEnabled: boolean;
  readonly browserExtensionEnabled: boolean;
  readonly idleThresholdSeconds: number;
  /** IANA timezone selected by the account owner. Daily aggregates split at
   * this local midnight rather than at UTC midnight. */
  readonly timezone: string;
  readonly updatedAt: string;
}

/** Safe owner projection. Device credentials and pairing-code hashes are
 * server-only and are never represented here. */
export interface AiUsageDevice {
  readonly id: string;
  readonly deviceType: AiUsageDeviceType;
  readonly label: string | null;
  readonly status: AiUsageDeviceStatus;
  readonly pairedAt: string;
  readonly lastSeenAt: string | null;
  readonly revokedAt: string | null;
}

/** A pairing code is returned once only to the authenticated owner initiating
 * pairing. It is not persisted in this public projection after creation. */
export interface AiUsagePairingStart {
  readonly pairingId: string;
  readonly pairingCode: string;
  readonly deviceType: AiUsageDeviceType;
  readonly expiresAt: string;
}

export interface AiUsagePairing {
  readonly id: string;
  readonly deviceType: AiUsageDeviceType;
  readonly status: AiUsagePairingStatus;
  readonly expiresAt: string;
  readonly completedAt: string | null;
}

export const aiUsageSessionStatuses = [
  'ACTIVE',
  'CORRECTED',
  'DEDUPLICATED',
  'DELETED',
] as const;
export type AiUsageSessionStatus = (typeof aiUsageSessionStatuses)[number];

export interface AiUsageSession {
  readonly id: string;
  /** `serviceId` is retained for the pre-Phase-7 consumer shape; it equals
   * `appCode` and must not be used as a provider credential or a raw process
   * identifier. */
  readonly serviceId: AiUsageAppCode;
  readonly appCode: AiUsageAppCode;
  readonly providerCode: AiUsageProviderCode;
  readonly deviceId: string | null;
  readonly platform: Platform;
  readonly startedAt: string;
  readonly endedAt: string;
  readonly activeSeconds: number;
  readonly idleSeconds: number;
  readonly source: AiUsageSource;
  readonly timezone: string;
  readonly localDay: string;
  readonly status: AiUsageSessionStatus;
  readonly correctedAt: string | null;
  readonly deletedAt: string | null;
  readonly createdAt: string;
  readonly updatedAt: string;
}

/** Legacy spelling remains available to Phase 1/old UI code. */
export type AiSession = AiUsageSession;

export interface AiUsageDailyAggregate {
  readonly localDay: string;
  readonly timezone: string;
  readonly appCode: AiUsageAppCode;
  readonly providerCode: AiUsageProviderCode;
  readonly activeSeconds: number;
  readonly idleSeconds: number;
  readonly sessionCount: number;
}

export interface AiUsageOverview {
  readonly preferences: AiUsageTrackingPreferences;
  readonly daily: readonly AiUsageDailyAggregate[];
  readonly totalActiveSeconds: number;
  readonly totalIdleSeconds: number;
  readonly deviceCount: number;
  readonly generatedAt: string;
}

export interface AiUsageBatchResult {
  readonly batchId: string;
  readonly acceptedSessionIds: readonly string[];
  readonly deduplicatedSessionIds: readonly string[];
  readonly replayed: boolean;
}

export interface AiUsageRangeDeleteResult {
  readonly from: string;
  readonly to: string;
  readonly deletedCount: number;
  readonly replayed: boolean;
}

export interface AiUsageExport {
  readonly generatedAt: string;
  readonly preferences: AiUsageTrackingPreferences;
  readonly devices: readonly AiUsageDevice[];
  readonly sessions: readonly AiUsageSession[];
  readonly daily: readonly AiUsageDailyAggregate[];
}

/** A Root projection is still metadata-only and intentionally excludes device
 * credentials, pairing codes, raw activity hashes, prompts, and URLs. */
export interface AiUsageRootReadView {
  readonly targetUserId: string;
  readonly preferences: AiUsageTrackingPreferences;
  readonly devices: readonly AiUsageDevice[];
  readonly sessions: readonly AiUsageSession[];
  readonly daily: readonly AiUsageDailyAggregate[];
  readonly generatedAt: string;
}

// ---------------------------------------------------------------------------
// Phase 8 AI Gateway contracts
// ---------------------------------------------------------------------------
// These contracts are deliberately separate from the Phase 7 AI Usage
// registry. Phase 7 classifies local usage metadata; Phase 8 describes a
// server-authoritative invocation gateway and never grants a client direct
// access to a provider credential.

export const aiGatewayProviderCodes = [
  'LOCAL',
  'OPENAI',
  'OPENAI_COMPATIBLE',
  'ANTHROPIC',
  'GOOGLE',
  'CUSTOM',
] as const;
export type AiGatewayProviderCode = (typeof aiGatewayProviderCodes)[number];

export const aiGatewayCredentialModes = ['SYSTEM', 'BYOK', 'NONE'] as const;
export type AiGatewayCredentialMode = (typeof aiGatewayCredentialModes)[number];

/** Provider adapters are registered on the server, never chosen by a client
 * SDK. `CUSTOM` remains a reviewed server integration, not an arbitrary URL
 * supplied from the UI. */
export const aiGatewayProviderAdapterTypes = [
  'LOCAL_DETERMINISTIC',
  'OPENAI_OFFICIAL',
  'OPENAI_COMPATIBLE',
  'ANTHROPIC_OFFICIAL',
  'GOOGLE_OFFICIAL',
  'CUSTOM_SERVER',
] as const;
export type AiGatewayProviderAdapterType =
  (typeof aiGatewayProviderAdapterTypes)[number];

/** Registry status is separate from a provider's momentary health.  Disabled
 * and deprecated entries stay in the registry so historical invocation and
 * conversation metadata never loses its model reference. */
export const aiGatewayRegistryStatuses = [
  'ACTIVE',
  'DEGRADED',
  'DISABLED',
  'UNAVAILABLE',
  'CONFIG_REQUIRED',
  'DEPRECATED',
] as const;
export type AiGatewayRegistryStatus = (typeof aiGatewayRegistryStatuses)[number];

export const aiGatewayAvailabilityStates = [
  'LOCAL_DEVELOPMENT',
  'AVAILABLE',
  'NOT_CONFIGURED',
  'DISABLED',
  'UNAVAILABLE',
] as const;
export type AiGatewayAvailabilityState = (typeof aiGatewayAvailabilityStates)[number];

export const aiGatewayHealthStates = [
  'UNKNOWN',
  'HEALTHY',
  'DEGRADED',
  'UNHEALTHY',
] as const;
export type AiGatewayHealthState = (typeof aiGatewayHealthStates)[number];

export const aiGatewayCapabilityCodes = [
  'CHAT_COMPLETION',
  'TEXT_GENERATION',
  'TEXT',
  'VISION',
  'CODE',
  'REASONING',
  'IMAGE_GENERATION',
  'AUDIO_INPUT',
  'AUDIO_OUTPUT',
  'TOOL_CALLING',
  'STRUCTURED_OUTPUT',
  'STREAMING',
  'EMBEDDING',
] as const;
export type AiGatewayCapabilityCode = (typeof aiGatewayCapabilityCodes)[number];

export const aiGatewayModalities = ['TEXT', 'IMAGE', 'AUDIO', 'EMBEDDING'] as const;
export type AiGatewayModality = (typeof aiGatewayModalities)[number];

/** Server-side feature/entitlement seam. It is intentionally independent of
 * UI plan labels; an implementation must resolve it from trusted server data. */
export const aiGatewayAccessEntitlementCodes = [
  'AI_LAB_ACCESS',
  'AI_STANDARD_MODELS',
  'AI_ADVANCED_MODELS',
  'AI_VISION',
  'AI_IMAGE_GENERATION',
  'AI_AUDIO_INPUT',
  'AI_AUDIO_OUTPUT',
  'AI_CODE',
  'AI_REASONING',
  'AI_LAB_BYOK',
  'AI_LAB_TOOL_USE',
  'AI_HIGHER_USAGE',
] as const;
export type AiGatewayAccessEntitlementCode =
  (typeof aiGatewayAccessEntitlementCodes)[number];

/** Provider identity and availability are decided on the server. `LOCAL` is
 * the only development adapter and never represents a third-party account. */
export interface AiGatewayProviderRegistryEntry {
  readonly code: AiGatewayProviderCode;
  readonly displayName: string;
  readonly adapterType: AiGatewayProviderAdapterType;
  /** Public registry only says whether the trusted server has an adapter base
   * configured. The actual endpoint/reference is never returned to clients. */
  readonly apiBaseConfigured: boolean;
  readonly supportsDynamicModels: boolean;
  readonly status: AiGatewayRegistryStatus;
  readonly availability: AiGatewayAvailabilityState;
  readonly health: AiGatewayHealthState;
  readonly credentialModes: readonly AiGatewayCredentialMode[];
  readonly localOnly: boolean;
}

/** Model codes are server registry keys. They do not contain an endpoint,
 * provider credential, price, or client-selectable authorization state. */
export interface AiGatewayModelRegistryEntry {
  readonly code: string;
  readonly providerCode: AiGatewayProviderCode;
  readonly displayName: string;
  readonly status: AiGatewayRegistryStatus;
  readonly availability: AiGatewayAvailabilityState;
  readonly health: AiGatewayHealthState;
  readonly capabilityCodes: readonly AiGatewayCapabilityCode[];
  readonly contextWindow: number | null;
  readonly maxInputTokens: number;
  readonly maxOutputTokens: number;
  readonly supportsStreaming: boolean;
  /** Server-maintained metadata only; absent until an official Provider
   * pricing/release source has been reviewed. */
  readonly pricingMetadata: {
    readonly inputFenPerMillionTokens: number | null;
    readonly outputFenPerMillionTokens: number | null;
  } | null;
  readonly releaseMetadata: {
    readonly releasedAt: string | null;
    readonly source: 'SERVER_MAINTAINED' | 'OFFICIAL_SYNC';
  } | null;
  readonly deprecatedAt: string | null;
  readonly lastSyncedAt: string | null;
}

export interface AiGatewayCapabilityRegistryEntry {
  readonly code: AiGatewayCapabilityCode;
  readonly displayName: string;
  readonly status: AiGatewayRegistryStatus;
  readonly description: string;
  readonly inputModalities: readonly AiGatewayModality[];
  readonly outputModalities: readonly AiGatewayModality[];
  /** Capability is discoverable but cannot execute a tool unless a separate
   * server-only policy grants an explicitly allowlisted tool. */
  readonly requiresExplicitToolGrant: boolean;
}

export const aiGatewayInvocationStatuses = [
  'QUEUED',
  'RUNNING',
  'STREAMING',
  'SUCCEEDED',
  'FAILED',
  'CANCELLED',
  'REJECTED',
] as const;
export type AiGatewayInvocationStatus = (typeof aiGatewayInvocationStatuses)[number];

/** User messages are accepted only during a self-owned invocation request.
 * They are intentionally not copied into list projections or stream events. */
export interface AiGatewayInvocationMessage {
  readonly role: 'USER';
  readonly content: string;
}

/** All costs use integer CNY fen. Providers and clients never submit these
 * figures; the trusted gateway calculates them before persisting a result. */
export interface AiGatewayMetering {
  readonly inputTokens: number;
  readonly outputTokens: number;
  readonly totalTokens: number;
  readonly costFen: number;
  readonly currency: 'CNY';
  readonly meteredAt: string;
}

export interface AiGatewayQuota {
  readonly unit: 'TOKENS';
  readonly limit: number;
  readonly used: number;
  readonly remaining: number;
  readonly periodStartedAt: string;
  readonly resetsAt: string;
}

/** Context is intentionally NONE in Phase 8. An invocation never performs an
 * implicit private archive, message, media, device, or AI Usage read. Future
 * explicit reference scopes require a separate owner-authorized boundary. */
export const aiGatewayContextScopes = [
  'NONE',
  'SELECTED_ENTRY',
  'CURRENT_DAY',
  'SELECTED_MEDIA',
  'SELECTED_HISTORY',
  'SELECTED_CONVERSATION',
] as const;
export type AiGatewayContextScope = (typeof aiGatewayContextScopes)[number];

/** Tool execution is disabled by default. The gateway has no shell, admin,
 * filesystem, arbitrary HTTP, payment, or Root tool in its public registry. */
export interface AiGatewayToolPolicy {
  readonly execution: 'DISABLED' | 'ALLOWLISTED';
  readonly allowedToolCodes: readonly string[];
}

export interface AiGatewayFallbackInfo {
  readonly used: boolean;
  readonly fromModelCode: string | null;
  readonly reasonCode: string | null;
}

/** Owner-safe projection. It has no owner id, input prompt, encrypted BYOK
 * envelope, provider key, root flag, or provider-internal error detail. */
export interface AiGatewayInvocation {
  readonly id: string;
  readonly providerCode: AiGatewayProviderCode;
  readonly modelCode: string;
  readonly capabilityCode: AiGatewayCapabilityCode;
  readonly status: AiGatewayInvocationStatus;
  readonly contextScope: AiGatewayContextScope;
  /** A conversation is private to its owner. It is nullable for one-off
   * explicit requests and never aliases a human Messaging conversation. */
  readonly conversationId: string | null;
  readonly toolPolicy: AiGatewayToolPolicy;
  readonly fallback: AiGatewayFallbackInfo;
  readonly inputMessageCount: number;
  readonly inputCharacterCount: number;
  readonly outputText: string | null;
  readonly finishReason: 'STOP' | 'LENGTH' | 'CANCELLED' | 'ERROR' | null;
  readonly latencyMs: number | null;
  readonly metering: AiGatewayMetering | null;
  readonly createdAt: string;
  readonly startedAt: string | null;
  readonly completedAt: string | null;
  readonly cancelledAt: string | null;
}

export const aiGatewayConversationStatuses = ['ACTIVE', 'DELETED'] as const;
export type AiGatewayConversationStatus =
  (typeof aiGatewayConversationStatuses)[number];

/** Metadata-only conversation projection. Prompt/response persistence is a
 * separate opt-in product decision; this Phase 8 foundation never exposes
 * another user's conversation or a provider credential. */
export interface AiGatewayConversation {
  readonly id: string;
  readonly title: string | null;
  readonly status: AiGatewayConversationStatus;
  readonly createdAt: string;
  readonly updatedAt: string;
  readonly deletedAt: string | null;
}

export interface AiGatewayConversationPage {
  readonly items: readonly AiGatewayConversation[];
  readonly nextCursor: string | null;
}

/** Per-user defaults are safe references to registry codes, not a credential
 * choice or entitlement override. The server revalidates both entries at
 * invocation time and clients must prompt again when one becomes unavailable. */
export interface AiGatewayPreferences {
  readonly defaultProviderCode: AiGatewayProviderCode | null;
  readonly defaultModelCode: string | null;
  readonly updatedAt: string;
}

export interface AiGatewayInvocationPage {
  readonly items: readonly AiGatewayInvocation[];
  readonly nextCursor: string | null;
}

export const aiGatewayInvocationEventTypes = [
  'INVOCATION_CREATED',
  'STATUS_CHANGED',
  'OUTPUT_DELTA',
  'COMPLETED',
  'CANCELLED',
  'FAILED',
] as const;
export type AiGatewayInvocationEventType =
  (typeof aiGatewayInvocationEventTypes)[number];

/** Event payloads carry only generated output deltas and safe terminal state.
 * They never echo an input prompt, credential, provider response object, or
 * another user's invocation identifier. */
export interface AiGatewayInvocationEvent {
  readonly id: string;
  readonly invocationId: string;
  readonly sequence: number;
  readonly type: AiGatewayInvocationEventType;
  readonly status: AiGatewayInvocationStatus;
  readonly textDelta: string | null;
  readonly metering: AiGatewayMetering | null;
  readonly createdAt: string;
}

export interface AiGatewayInvocationEventPage {
  readonly invocationId: string;
  readonly events: readonly AiGatewayInvocationEvent[];
  readonly nextAfterSequence: number;
}

/** Transport-neutral stream bootstrap. The actual API runtime may map this to
 * SSE or a polling adapter, but it must authenticate and authorize every
 * event read at the server boundary. */
export interface AiGatewayStreamHandshake {
  readonly invocationId: string;
  readonly transport: 'SSE' | 'POLL';
  readonly afterSequence: number;
  readonly eventsPath: string;
}

/** BYOK is a write-only encrypted envelope. The client can submit ciphertext
 * to the trusted gateway, but no public response can reveal plaintext,
 * ciphertext, key ID, fingerprint, or a reusable provider credential. */
export interface AiGatewayByokEncryptedEnvelope {
  readonly algorithm: 'RSA-OAEP-256' | 'X25519-AES-GCM';
  readonly keyId: string;
  readonly ciphertext: string;
}

export const aiGatewayByokStatuses = [
  'NOT_CONFIGURED',
  'CONFIGURED',
  'REVOKED',
] as const;
export type AiGatewayByokStatus = (typeof aiGatewayByokStatuses)[number];

export interface AiGatewayByokProviderStatus {
  readonly providerCode: Exclude<AiGatewayProviderCode, 'LOCAL'>;
  readonly status: AiGatewayByokStatus;
  readonly configuredAt: string | null;
  readonly revokedAt: string | null;
  /** A server-normalized mask such as `••••••••ABCD`, never a raw hash,
   * plaintext key, encrypted envelope, or reusable provider credential. */
  readonly maskedFingerprint: string | null;
  /** A provider validation request is intentionally not performed by the
   * local adapter. It can only be set by a reviewed server adapter and never
   * contains a raw provider response. */
  readonly validationStatus: 'UNKNOWN' | 'VALID' | 'INVALID' | 'EXPIRED_OR_REVOKED';
  readonly lastValidatedAt: string | null;
}

// ---------------------------------------------------------------------------
// Phase 9 Personal AI / Personal Knowledge contracts
// ---------------------------------------------------------------------------
// Personal AI is an explicit, owner-scoped retrieval layer. These contracts
// intentionally contain no owner/root fields on request inputs: the server
// derives ownership from AuthenticatedPrincipal and applies the scope before
// any keyword/vector retrieval. PRIVATE_MESSAGES and ALL_PRIVATE_DATA are not
// valid scopes or source types.

export const personalAiContextScopes = [
  'NONE',
  'SELECTED_ENTRY',
  'SELECTED_ENTRIES',
  'CURRENT_DAY',
  'DATE_RANGE',
  'LIFE',
  'TIMELINE',
  'HISTORY',
  'FITNESS',
  'DAILY_PACK',
  'AI_USAGE',
  'SELECTED_MEDIA',
  'USER_SELECTED_ARCHIVE',
] as const;
export type PersonalAIContextScope = (typeof personalAiContextScopes)[number];

export const personalAiSearchModes = ['KEYWORD', 'SEMANTIC', 'HYBRID'] as const;
export type PersonalAISearchMode = (typeof personalAiSearchModes)[number];

export const personalAiArchiveModes = ['ARCHIVE_ONLY', 'ARCHIVE_PLUS_GENERAL'] as const;
export type PersonalAIArchiveMode = (typeof personalAiArchiveModes)[number];

export const personalAiSourceTypes = [
  'LIFE',
  'TIMELINE',
  'HISTORY',
  'FITNESS',
  'STEPS',
  'DAILY_PACK',
  'AI_USAGE',
  'TAGS',
  'PUBLISHED_SNAPSHOT',
] as const;
export type PersonalAIKnowledgeSourceType = (typeof personalAiSourceTypes)[number];

export const personalAiTruthLayers = [
  'ORIGINAL',
  'REVISION',
  'PUBLISHED_SNAPSHOT',
  'AI_INSIGHT',
] as const;
export type PersonalAITruthLayer = (typeof personalAiTruthLayers)[number];

export const personalAiSourceStatuses = ['ACTIVE', 'TRASHED', 'DELETED'] as const;
export type PersonalAISourceStatus = (typeof personalAiSourceStatuses)[number];

export const personalAiIndexStatuses = [
  'PENDING',
  'INDEXING',
  'READY',
  'STALE',
  'FAILED',
  'DELETED',
] as const;
export type PersonalAIIndexStatus = (typeof personalAiIndexStatuses)[number];

export const personalAiEmbeddingStatuses = [
  'PENDING',
  'READY',
  'FAILED',
  'DELETED',
] as const;
export type PersonalAIEmbeddingStatus = (typeof personalAiEmbeddingStatuses)[number];

export const personalAiQueryStatuses = [
  'SUCCEEDED',
  'NO_EVIDENCE',
  'REJECTED',
  'FAILED',
] as const;
export type PersonalAIQueryStatus = (typeof personalAiQueryStatuses)[number];

/** Export processing is deliberately separate from indexing. An export can be
 * requested by its owner, but it never becomes a source of retrieval data. */
export const personalAiExportStatuses = [
  'PENDING',
  'PROCESSING',
  'READY',
  'FAILED',
  'EXPIRED',
  'DELETED',
] as const;
export type PersonalAIExportStatus = (typeof personalAiExportStatuses)[number];

export const personalAiExportFormats = ['JSON'] as const;
export type PersonalAIExportFormat = (typeof personalAiExportFormats)[number];

export const personalAiExportSections = [
  'PREFERENCES',
  'CONSENT_HISTORY',
  'INDEX_MANIFEST',
  'INSIGHT_METADATA',
  'CITATION_REFERENCES',
  'CONVERSATION_METADATA',
] as const;
export type PersonalAIExportSection = (typeof personalAiExportSections)[number];

/** This is an allow-list export. These categories are never materialized in a
 * Personal AI export, including when a user elects to include conversations. */
export const personalAiExportExcludedDataCategories = [
  'ORIGINAL_ARCHIVE_CONTENT',
  'KNOWLEDGE_CHUNK_TEXT',
  'RAW_EMBEDDING_VECTORS',
  'QUERY_PROMPT_OR_QUESTION_TEXT',
  'QUERY_ANSWER_TEXT',
  'AI_INSIGHT_CONTENT',
  'CITATION_DISPLAY_TEXT',
  'PROVIDER_SECRETS',
] as const;
export type PersonalAIExportExcludedDataCategory =
  (typeof personalAiExportExcludedDataCategories)[number];

export const personalAiConfidenceKinds = [
  'DIRECT_EVIDENCE',
  'INFERRED',
  'NO_EVIDENCE',
] as const;
export type PersonalAIConfidenceKind = (typeof personalAiConfidenceKinds)[number];

export const personalAiAccessEntitlementCodes = [
  'PERSONAL_AI_ACCESS',
  'PERSONAL_AI_SEMANTIC_SEARCH',
  'PERSONAL_AI_EXTENDED_HISTORY',
  'PERSONAL_AI_ADVANCED_REVIEW',
] as const;
export type PersonalAIAccessEntitlementCode =
  (typeof personalAiAccessEntitlementCodes)[number];

export interface PersonalAIDateRange {
  readonly from: string;
  readonly to: string;
}

/** Request body for Personal AI. No owner, plan, root, provider key, or raw
 * archive text is accepted; all authorization is server-derived. */
export interface PersonalAIQueryInput {
  readonly question: string;
  readonly scope: PersonalAIContextScope;
  readonly dateRange?: PersonalAIDateRange | undefined;
  readonly sourceTypes?: readonly PersonalAIKnowledgeSourceType[] | undefined;
  readonly selectedEntryIds?: readonly string[] | undefined;
  readonly selectedMediaIds?: readonly string[] | undefined;
  readonly searchMode?: PersonalAISearchMode | undefined;
  readonly archiveMode?: PersonalAIArchiveMode | undefined;
  readonly topK?: number | undefined;
  readonly contextBudgetTokens?: number | undefined;
  readonly conversationId?: string | undefined;
}

export interface PersonalAIQueryResult {
  readonly queryId: string;
  readonly conversationId: string | null;
  readonly status: PersonalAIQueryStatus;
  readonly answerText: string;
  /** Alias retained for presentation adapters that call this `answer`. */
  readonly answer: string;
  readonly archiveMode: PersonalAIArchiveMode;
  readonly scope: PersonalAIContextScope;
  readonly evidenceKind: PersonalAIConfidenceKind;
  readonly citations: readonly PersonalAICitation[];
  readonly retrievedChunkCount: number;
  readonly retrievalLatencyMs: number;
  readonly generationLatencyMs: number | null;
  readonly usage: PersonalAIUsageMetadata;
  readonly createdAt: string;
}

export interface PersonalAIConversation {
  readonly id: string;
  readonly currentScope: PersonalAIContextScope;
  readonly createdAt: string;
  readonly updatedAt: string;
  readonly deletedAt: string | null;
}

export interface PersonalAIQueryPage {
  readonly items: readonly PersonalAIQueryResult[];
  readonly nextCursor: string | null;
}

export interface PersonalAICitationPage {
  readonly queryId: string;
  readonly items: readonly PersonalAICitation[];
  readonly nextCursor: string | null;
}

export interface PersonalAIUsageMetadata {
  readonly modelCode: string | null;
  readonly providerCode: AiGatewayProviderCode | null;
  readonly inputTokens: number;
  readonly outputTokens: number;
  readonly totalTokens: number;
  readonly costFen: number;
}

/** Safe source projection. Internal owner_user_id is never returned to a
 * client; it is retained by the server index and used in every retrieval key. */
export interface PersonalAIKnowledgeSource {
  readonly sourceType: PersonalAIKnowledgeSourceType;
  readonly sourceId: string;
  readonly canonicalSourceId: string;
  readonly truthLayer: PersonalAITruthLayer;
  readonly revisionId: string | null;
  readonly occurredAt: string;
  readonly createdAt: string;
  readonly updatedAt: string;
  readonly visibility: 'PRIVATE' | 'SNAPSHOT';
  readonly status: PersonalAISourceStatus;
  readonly title: string | null;
  readonly tags: readonly string[];
  readonly indexVersion: string;
  readonly indexStatus: PersonalAIIndexStatus;
}

export interface PersonalAIKnowledgeChunk {
  readonly chunkId: string;
  readonly sourceType: PersonalAIKnowledgeSourceType;
  readonly sourceId: string;
  readonly canonicalSourceId: string;
  readonly truthLayer: PersonalAITruthLayer;
  readonly revisionId: string | null;
  readonly chunkIndex: number;
  readonly tokenEstimate: number;
  readonly contentHash: string;
  readonly excerpt: string;
  readonly occurredAt: string;
  readonly tags: readonly string[];
  readonly indexVersion: string;
  readonly embeddingStatus: PersonalAIEmbeddingStatus;
}

export interface PersonalAICitation {
  readonly citationId: string;
  readonly sourceType: PersonalAIKnowledgeSourceType;
  readonly sourceId: string;
  readonly revisionId: string | null;
  readonly occurredAt: string;
  readonly displayTitle: string;
  readonly excerptSafe: string;
  readonly truthLayer: PersonalAITruthLayer;
  readonly relevanceScore: number;
}

export interface PersonalAIIndexJob {
  readonly id: string;
  readonly scope: PersonalAIContextScope;
  readonly dateRange: PersonalAIDateRange | null;
  readonly sourceTypes: readonly PersonalAIKnowledgeSourceType[];
  readonly status: PersonalAIIndexStatus;
  readonly indexVersion: string;
  readonly indexedSourceCount: number;
  readonly indexedChunkCount: number;
  readonly failedSourceCount: number;
  readonly createdAt: string;
  readonly startedAt: string | null;
  readonly completedAt: string | null;
  readonly errorCode: string | null;
}

export interface PersonalAIIndexStatusView {
  readonly enabled: boolean;
  readonly status: PersonalAIIndexStatus;
  readonly indexVersion: string;
  readonly indexedSourceCount: number;
  readonly indexedChunkCount: number;
  readonly lastIndexedAt: string | null;
  readonly embeddingProvider: string;
}

export interface PersonalAIPreferences {
  readonly enabled: boolean;
  readonly archiveMode: PersonalAIArchiveMode;
  readonly defaultScope: PersonalAIContextScope;
  readonly includeHistoricalRevisions: boolean;
  readonly updatedAt: string;
}

export interface PersonalAIConsent {
  readonly accepted: boolean;
  readonly version: string | null;
  readonly acceptedAt: string | null;
  readonly providerDisclosure: string;
}

export interface PersonalAIInsight {
  readonly id: string;
  readonly queryId: string;
  readonly title: string | null;
  readonly content: string;
  readonly citations: readonly PersonalAICitation[];
  readonly truthLayer: 'AI_INSIGHT';
  readonly createdAt: string;
  readonly deletedAt: string | null;
}

/** Aggregated privacy/status projection used by Web and Mini without exposing
 * prompts, raw chunks, vectors, owner ids, or provider credentials. */
export interface PersonalAIPrivacyView {
  readonly preferences: PersonalAIPreferences;
  readonly consent: PersonalAIConsent;
  readonly index: PersonalAIIndexStatusView;
}

// ---------------------------------------------------------------------------
// Personal AI export foundation
// ---------------------------------------------------------------------------
// Personal AI is derived data. Its export is intentionally metadata-only so a
// portable Archive remains the authority for original records. Request inputs
// do not accept an owner/root/source selector, raw content, model provider, or
// credential. The server derives the caller and composes only caller-owned
// metadata.

/** Strict self-only export request. Both optional controls default to false;
 * they cannot ask the service to include original record content or vectors. */
export interface PersonalAIExportRequest {
  readonly includeConversations?: boolean | undefined;
  readonly includeDeletedInsights?: boolean | undefined;
}

/** Immutable status projection for an asynchronous self-export request. */
export interface PersonalAIExportJob {
  readonly id: string;
  readonly status: PersonalAIExportStatus;
  readonly format: PersonalAIExportFormat;
  readonly schemaVersion: 'mezip.personal-ai.export.v1';
  readonly requestedSections: readonly PersonalAIExportSection[];
  readonly includeConversations: boolean;
  readonly includeDeletedInsights: boolean;
  readonly requestedAt: string;
  readonly startedAt: string | null;
  readonly completedAt: string | null;
  readonly expiresAt: string | null;
  readonly errorCode: string | null;
}

/** Preferences are copied as a point-in-time metadata snapshot. */
export interface PersonalAIExportPreferencesMetadata {
  readonly enabled: boolean;
  readonly archiveMode: PersonalAIArchiveMode;
  readonly defaultScope: PersonalAIContextScope;
  readonly includeHistoricalRevisions: boolean;
  readonly updatedAt: string;
}

/** Append-only consent history contains policy versions and timestamps only;
 * it does not contain provider credentials or an archive payload. */
export interface PersonalAIExportConsentHistoryEntry {
  readonly event: 'ACCEPTED' | 'REVOKED';
  readonly version: string | null;
  readonly occurredAt: string;
}

/** A source manifest entry lets a user understand which derived index records
 * existed without serializing a source title, tag, excerpt, content hash, or
 * chunk/vector payload. */
export interface PersonalAIExportIndexManifestSource {
  readonly sourceType: PersonalAIKnowledgeSourceType;
  readonly sourceId: string;
  readonly canonicalSourceId: string;
  readonly truthLayer: Exclude<PersonalAITruthLayer, 'AI_INSIGHT'>;
  readonly revisionId: string | null;
  readonly occurredAt: string;
  readonly status: PersonalAISourceStatus;
  readonly indexStatus: PersonalAIIndexStatus;
  readonly indexVersion: string;
}

/** Metadata-only manifest for rebuildable Personal AI knowledge-index state. */
export interface PersonalAIExportIndexManifest {
  readonly current: PersonalAIIndexStatusView;
  readonly sources: readonly PersonalAIExportIndexManifestSource[];
}

/** Citation references intentionally omit displayTitle and excerptSafe because
 * either could reproduce original archive text in a derived-data export. */
export interface PersonalAIExportCitationReference {
  readonly citationId: string;
  readonly queryId: string | null;
  readonly insightId: string | null;
  readonly sourceType: PersonalAIKnowledgeSourceType;
  readonly sourceId: string;
  readonly revisionId: string | null;
  readonly occurredAt: string;
  readonly truthLayer: Exclude<PersonalAITruthLayer, 'AI_INSIGHT'>;
  readonly relevanceScore: number;
}

/** Insight provenance/metadata only. Generated insight content and prompt or
 * answer text stay outside the export foundation. */
export interface PersonalAIExportInsightMetadata {
  readonly id: string;
  readonly queryId: string;
  readonly title: string | null;
  readonly truthLayer: 'AI_INSIGHT';
  readonly citationIds: readonly string[];
  readonly createdAt: string;
  readonly deletedAt: string | null;
}

/** Conversations are optional and contain lifecycle metadata only. They never
 * export their associated question, answer, citation display text, or usage. */
export interface PersonalAIExportConversationMetadata {
  readonly id: string;
  readonly currentScope: PersonalAIContextScope;
  readonly createdAt: string;
  readonly updatedAt: string;
  readonly deletedAt: string | null;
}

/** The ready export payload. Raw archive records belong to Archive export and
 * are deliberately not duplicated here. */
export interface PersonalAIExportResult {
  readonly exportId: string;
  readonly format: PersonalAIExportFormat;
  readonly schemaVersion: 'mezip.personal-ai.export.v1';
  readonly exportedAt: string;
  readonly includedSections: readonly PersonalAIExportSection[];
  readonly excludedDataCategories: readonly PersonalAIExportExcludedDataCategory[];
  readonly preferences: PersonalAIExportPreferencesMetadata;
  readonly consentHistory: readonly PersonalAIExportConsentHistoryEntry[];
  readonly indexManifest: PersonalAIExportIndexManifest;
  readonly insights: readonly PersonalAIExportInsightMetadata[];
  readonly citationReferences: readonly PersonalAIExportCitationReference[];
  readonly conversations: readonly PersonalAIExportConversationMetadata[];
}

/** Polling response. `result` exists only once `job.status` is READY. */
export interface PersonalAIExportStatusView {
  readonly job: PersonalAIExportJob;
  readonly result: PersonalAIExportResult | null;
}

export interface PersonalAIExportPage {
  readonly items: readonly PersonalAIExportJob[];
  readonly nextCursor: string | null;
}

export interface TimelineEvent {
  readonly id: string;
  readonly ownerId: string;
  readonly kind: RecordKind;
  readonly occurredAt: string;
  readonly summary: string;
  readonly sourceType: string;
}

export interface Entitlement {
  readonly code: string;
  readonly planCode: PlanCode;
  readonly validFrom: string;
  readonly validUntil: string | null;
  readonly revokedAt: string | null;
}

export interface ApiSuccess<T> {
  readonly data: T;
  readonly meta: { readonly requestId: string };
}

export interface ApiFailure {
  readonly error: {
    readonly code: string;
    readonly message: string;
    readonly retryable: boolean;
    readonly requestId: string;
  };
}

export type ApiResponse<T> = ApiSuccess<T> | ApiFailure;

// ---------------------------------------------------------------------------
// Phase 3 Archive domain contracts
// ---------------------------------------------------------------------------

/** JSON values are deliberately explicit so archive metadata can be persisted
 * without leaking an untyped `any` boundary into adapters. */
export type JsonPrimitive = string | number | boolean | null;
export type JsonValue =
  JsonPrimitive | readonly JsonValue[] | { readonly [key: string]: JsonValue };
export type JsonObject = { readonly [key: string]: JsonValue };

/** `DRAFT` and `DELETED` are retained for durable/offline and audit adapters;
 * active repository reads only expose `ACTIVE` unless the caller explicitly
 * requests the trash scope. */
export const archiveEntryStatuses = ['DRAFT', 'ACTIVE', 'TRASHED', 'DELETED'] as const;
export type ArchiveEntryStatus = (typeof archiveEntryStatuses)[number];

export const archiveRevisionSources = [
  'ONLINE',
  'OFFLINE',
  'IMPORT',
  'SYSTEM',
] as const;
export type ArchiveRevisionSource = (typeof archiveRevisionSources)[number];

export const lifeEntryTypes = [
  'TEXT',
  'PHOTO',
  'VIDEO',
  'MIXED',
  'NOTE',
  'MEMORY',
] as const;
export type LifeEntryType = (typeof lifeEntryTypes)[number];

export interface ArchiveEntry {
  readonly id: string;
  readonly ownerId: string;
  readonly kind: RecordKind;
  /** The concrete Life Archive content type. `kind` remains the cross-domain
   * timeline discriminator for compatibility with the Phase 0 schema. */
  readonly lifeType: LifeEntryType | null;
  readonly title: string | null;
  readonly body: string | null;
  readonly occurredAt: string;
  readonly timezone: string;
  readonly recordSource: string;
  readonly deviceId: string | null;
  readonly metadata: JsonObject;
  readonly tags: readonly string[];
  readonly status: ArchiveEntryStatus;
  readonly revision: number;
  readonly createdAt: string;
  readonly updatedAt: string;
  readonly serverReceivedAt: string;
  readonly deletedAt: string | null;
}

export interface ArchiveEntryInput {
  readonly kind: RecordKind;
  readonly lifeType?: LifeEntryType | null;
  readonly title?: string | null;
  readonly body?: string | null;
  readonly occurredAt: string;
  readonly timezone?: string;
  readonly recordSource?: string;
  readonly deviceId?: string | null;
  readonly metadata?: JsonObject;
  readonly tags?: readonly string[];
  readonly idempotencyKey?: string;
  readonly source?: ArchiveRevisionSource;
}

export interface ArchiveEntryPatch {
  readonly lifeType?: LifeEntryType | null;
  readonly title?: string | null;
  readonly body?: string | null;
  readonly occurredAt?: string;
  readonly timezone?: string;
  readonly metadata?: JsonObject;
  readonly tags?: readonly string[];
  readonly source?: ArchiveRevisionSource;
}

export interface ArchiveRevision {
  readonly id: string;
  readonly entryId: string;
  readonly ownerId: string;
  readonly revision: number;
  readonly source: ArchiveRevisionSource;
  readonly snapshot: ArchiveEntry;
  readonly createdAt: string;
}

export interface ArchiveSnapshot {
  readonly id: string;
  readonly entryId: string;
  readonly ownerId: string;
  readonly revision: number;
  readonly content: JsonObject;
  readonly createdAt: string;
}

/** Audience values are reserved for the explicit publication pipeline. Phase 3
 * only creates `SNAPSHOT`; no Community/Founder delivery is activated here. */
export const archiveSnapshotVisibilities = [
  'PRIVATE',
  'SNAPSHOT',
  'COMMUNITY',
  'GROUP',
  'DIRECT_SHARE',
  'PUBLIC',
] as const;
export type ArchiveSnapshotVisibility = (typeof archiveSnapshotVisibilities)[number];

export interface ArchivePublishedSnapshot {
  readonly id: string;
  readonly sourceEntryId: string;
  readonly ownerId: string;
  readonly sourceRevision: number;
  readonly selectedContent: JsonObject;
  readonly visibility: ArchiveSnapshotVisibility;
  readonly createdAt: string;
  readonly revokedAt: string | null;
}

/** AI output is append-only and references an exact source revision. It never
 * mutates the original entry or a published snapshot. */
export interface ArchiveAiInsight {
  readonly id: string;
  readonly outputType: 'AI_GENERATED';
  readonly sourceEntryId: string;
  readonly ownerId: string;
  readonly sourceRevision: number;
  readonly provider: string;
  readonly model: string;
  readonly insight: JsonObject;
  readonly createdAt: string;
  readonly revokedAt: string | null;
}

export interface ArchiveHistoryEntry {
  readonly id: string;
  readonly ownerId: string;
  readonly entryId: string | null;
  readonly title: string;
  readonly date: string;
  readonly dynasty: string | null;
  readonly people: readonly string[];
  readonly events: readonly string[];
  readonly quotation: string | null;
  readonly reflection: string | null;
  readonly tags: readonly string[];
  readonly revision: number;
  readonly status: ArchiveEntryStatus;
  readonly createdAt: string;
  readonly updatedAt: string;
  readonly deletedAt: string | null;
}

export interface ArchiveHistoryInput {
  readonly title: string;
  readonly date: string;
  readonly entryId?: string | null;
  readonly dynasty?: string | null;
  readonly people?: readonly string[];
  readonly events?: readonly string[];
  readonly quotation?: string | null;
  readonly reflection?: string | null;
  readonly tags?: readonly string[];
  readonly idempotencyKey?: string;
  readonly source?: ArchiveRevisionSource;
}

export interface ArchiveHistoryPatch {
  readonly title?: string;
  readonly date?: string;
  readonly entryId?: string | null;
  readonly dynasty?: string | null;
  readonly people?: readonly string[];
  readonly events?: readonly string[];
  readonly quotation?: string | null;
  readonly reflection?: string | null;
  readonly tags?: readonly string[];
  readonly source?: ArchiveRevisionSource;
}

export interface ArchiveFitnessEntry {
  readonly id: string;
  readonly ownerId: string;
  readonly entryId: string | null;
  readonly trainingType: string | null;
  readonly bodyParts: readonly string[];
  readonly durationSeconds: number | null;
  readonly stateScore: number | null;
  readonly exercises: readonly JsonObject[];
  readonly occurredAt: string;
  readonly revision: number;
  readonly status: ArchiveEntryStatus;
  readonly createdAt: string;
  readonly updatedAt: string;
  readonly deletedAt: string | null;
}

export interface ArchiveFitnessInput {
  readonly occurredAt: string;
  readonly entryId?: string | null;
  readonly trainingType?: string | null;
  readonly bodyParts?: readonly string[];
  readonly durationSeconds?: number | null;
  readonly stateScore?: number | null;
  readonly exercises?: readonly JsonObject[];
  readonly idempotencyKey?: string;
  readonly source?: ArchiveRevisionSource;
}

export interface ArchiveFitnessPatch {
  readonly occurredAt?: string;
  readonly entryId?: string | null;
  readonly trainingType?: string | null;
  readonly bodyParts?: readonly string[];
  readonly durationSeconds?: number | null;
  readonly stateScore?: number | null;
  readonly exercises?: readonly JsonObject[];
  readonly source?: ArchiveRevisionSource;
}

export interface BodyMetric {
  readonly id: string;
  readonly ownerId: string;
  readonly measuredAt: string;
  readonly weightGrams: number | null;
  readonly bodyFatBasisPoints: number | null;
  readonly waistMillimetres: number | null;
  readonly metadata: JsonObject;
  readonly createdAt: string;
  readonly updatedAt: string;
}

export interface BodyMetricInput {
  readonly measuredAt: string;
  readonly weightGrams?: number | null;
  readonly bodyFatBasisPoints?: number | null;
  readonly waistMillimetres?: number | null;
  readonly metadata?: JsonObject;
  readonly idempotencyKey?: string;
}

export interface StepRecord {
  readonly id: string;
  readonly ownerId: string;
  readonly day: string;
  readonly steps: number;
  readonly source: string;
  readonly createdAt: string;
  readonly updatedAt: string;
}

export interface StepRecordInput {
  readonly day: string;
  readonly steps: number;
  readonly source: string;
  readonly idempotencyKey?: string;
}

export interface DailyPack {
  readonly id: string;
  readonly ownerId: string;
  readonly day: string;
  readonly summary: string | null;
  readonly entryIds: readonly string[];
  readonly historyIds: readonly string[];
  readonly fitnessIds: readonly string[];
  readonly stats: JsonObject;
  readonly revision: number;
  readonly status: ArchiveEntryStatus;
  readonly createdAt: string;
  readonly updatedAt: string;
}

export interface DailyPackInput {
  readonly day: string;
  readonly summary?: string | null;
  readonly entryIds?: readonly string[];
  readonly historyIds?: readonly string[];
  readonly fitnessIds?: readonly string[];
  readonly stats?: JsonObject;
  readonly idempotencyKey?: string;
}

export interface DailyPackPatch {
  readonly summary?: string | null;
  readonly entryIds?: readonly string[];
  readonly historyIds?: readonly string[];
  readonly fitnessIds?: readonly string[];
  readonly stats?: JsonObject;
}

export const archiveMediaStatuses = [
  'UPLOADING',
  'PROCESSING',
  'READY',
  'FAILED',
  'QUARANTINED',
  'DELETED',
] as const;
export type ArchiveMediaStatus = (typeof archiveMediaStatuses)[number];

export interface ArchiveMediaMetadata {
  readonly id: string;
  readonly ownerId: string;
  readonly storageKey: string;
  readonly contentType: string;
  readonly bytes: number;
  readonly sha256: string | null;
  readonly width: number | null;
  readonly height: number | null;
  readonly durationMs: number | null;
  readonly originalFilename: string | null;
  readonly metadata: JsonObject;
  readonly status: ArchiveMediaStatus;
  readonly createdAt: string;
  readonly updatedAt: string;
  readonly deletedAt: string | null;
}

export interface ArchiveMediaInput {
  readonly storageKey: string;
  readonly contentType: string;
  readonly bytes: number;
  readonly sha256?: string | null;
  readonly width?: number | null;
  readonly height?: number | null;
  readonly durationMs?: number | null;
  readonly originalFilename?: string | null;
  readonly metadata?: JsonObject;
  readonly idempotencyKey?: string;
}

export interface ArchiveMediaPatch {
  readonly sha256?: string | null;
  readonly width?: number | null;
  readonly height?: number | null;
  readonly durationMs?: number | null;
  readonly originalFilename?: string | null;
  readonly metadata?: JsonObject;
  readonly status?: ArchiveMediaStatus;
}

export interface MediaLink {
  readonly id: string;
  readonly ownerId: string;
  readonly mediaId: string;
  readonly targetType: 'ENTRY' | 'HISTORY' | 'FITNESS' | 'DAILY_PACK';
  readonly targetId: string;
  readonly createdAt: string;
}

export interface StorageQuota {
  readonly ownerId: string;
  readonly limitBytes: number;
  readonly usedBytes: number;
  readonly availableBytes: number;
}

export interface ArchiveTimelineItem {
  readonly id: string;
  readonly ownerId: string;
  readonly sourceType:
    'ENTRY' | 'HISTORY' | 'FITNESS' | 'DAILY_PACK' | 'BODY_METRIC' | 'STEPS';
  readonly sourceId: string;
  readonly kind: RecordKind;
  readonly occurredAt: string;
  readonly createdAt: string;
  readonly updatedAt: string;
  readonly serverReceivedAt: string;
  readonly timezone: string | null;
  readonly summary: string;
  readonly metadata: JsonObject;
}

export interface ArchiveSearchResult {
  readonly sourceType: ArchiveTimelineItem['sourceType'];
  readonly sourceId: string;
  readonly occurredAt: string;
  readonly title: string;
  readonly snippet: string;
}

export interface ArchiveExport {
  readonly id: string;
  readonly ownerId: string;
  readonly format: 'JSON';
  readonly generatedAt: string;
  readonly schemaVersion: 'mezip.archive.export.v1';
  readonly schema_version: 'mezip.archive.export.v1';
  readonly exportedAt: string;
  readonly exported_at: string;
  readonly privacy: 'PRIVATE_BY_DEFAULT';
  readonly mediaPolicy: 'MANIFEST_ONLY';
  readonly media_policy: 'MANIFEST_ONLY';
  readonly trashPolicy: 'EXCLUDED_BY_DEFAULT' | 'INCLUDED';
  readonly trash_policy: 'EXCLUDED_BY_DEFAULT' | 'INCLUDED';
  readonly checksum: string;
  readonly records: readonly ArchiveEntry[];
  readonly life: readonly ArchiveEntry[];
  readonly history: readonly ArchiveHistoryEntry[];
  readonly fitnessRecords: readonly ArchiveFitnessEntry[];
  readonly revisions: readonly ArchiveRevision[];
  readonly publishedSnapshots: readonly ArchivePublishedSnapshot[];
  readonly aiInsights: readonly ArchiveAiInsight[];
  readonly histories: readonly ArchiveHistoryEntry[];
  readonly fitness: readonly ArchiveFitnessEntry[];
  readonly bodyMetrics: readonly BodyMetric[];
  readonly steps: readonly StepRecord[];
  readonly dailyPacks: readonly DailyPack[];
  readonly daily_pack: readonly DailyPack[];
  readonly media: readonly ArchiveMediaMetadata[];
  readonly mediaLinks: readonly MediaLink[];
  readonly timeline: readonly ArchiveTimelineItem[];
  readonly timelineMetadata: readonly ArchiveTimelineItem[];
  readonly timeline_metadata: readonly ArchiveTimelineItem[];
}

// Phase 14 — Portable .mezip archive contracts. These are intentionally
// metadata-first projections: credentials, secrets and raw derived vectors are
// never part of the portable contract.
export const portableArchiveExportTypes = ['FULL_ARCHIVE', 'YEAR_ARCHIVE', 'CUSTOM_RANGE', 'SELECTED_MODULES'] as const;
export type PortableArchiveExportType = (typeof portableArchiveExportTypes)[number];
export const portableArchiveSections = [
  'PROFILE', 'LIFE', 'TIMELINE', 'HISTORY', 'FITNESS', 'STEPS', 'DAILY_PACK',
  'AI_USAGE', 'AI_INSIGHTS', 'SOCIAL', 'PROJECTS', 'MEMBERSHIP', 'PRIVACY', 'DEVICES', 'MEDIA',
] as const;
export type PortableArchiveSection = (typeof portableArchiveSections)[number];
export const portableArchiveEncryptionModes = ['NONE', 'PASSWORD_AES_256_GCM'] as const;
export type PortableArchiveEncryptionMode = (typeof portableArchiveEncryptionModes)[number];
export const portableArchiveJobStatuses = ['QUEUED', 'COLLECTING', 'PACKAGING', 'VERIFYING', 'READY', 'FAILED', 'CANCELLED', 'EXPIRED'] as const;
export type PortableArchiveJobStatus = (typeof portableArchiveJobStatuses)[number];
export const portableArchiveImportStatuses = ['QUEUED', 'VERIFYING', 'PREVIEW_READY', 'IMPORTING', 'READY', 'FAILED', 'CANCELLED'] as const;
export type PortableArchiveImportStatus = (typeof portableArchiveImportStatuses)[number];
export const portableArchiveConflictKinds = ['DUPLICATE', 'REVISION_CONFLICT', 'NATURAL_KEY_CONFLICT', 'UNSUPPORTED'] as const;
export type PortableArchiveConflictKind = (typeof portableArchiveConflictKinds)[number];
export const portableArchiveConflictResolutions = ['SKIP', 'CREATE_COPY', 'REPLACE', 'MERGE'] as const;
export type PortableArchiveConflictResolution = (typeof portableArchiveConflictResolutions)[number];

export interface PortableArchiveDateRange { readonly from: string | null; readonly to: string | null; }
export interface PortableArchiveManifest {
  readonly format: 'MEZIP';
  readonly schemaVersion: 'mezip.archive.v1';
  readonly archiveId: string;
  readonly ownerReference: string;
  readonly createdAt: string;
  readonly exportedAt: string;
  readonly timezone: string;
  readonly locale: string;
  readonly appVersion: string;
  readonly includedSections: readonly PortableArchiveSection[];
  readonly mediaPolicy: 'MANIFEST_ONLY' | 'INCLUDED';
  readonly encryption: PortableArchiveEncryptionMode;
  readonly checksumAlgorithm: 'SHA-256';
  readonly contentCounts: Readonly<Record<string, number>>;
  readonly dateRange: PortableArchiveDateRange;
  readonly includeTrash: boolean;
  readonly indexManifest: { readonly sourceCount: number; readonly indexVersion: string | null; readonly rebuildOnImport: true };
}
export interface PortableArchiveChecksum { readonly path: string; readonly sha256: string; readonly bytes: number; }
export interface PortableArchiveFile { readonly path: string; readonly contentType: string; readonly bytesBase64: string; }
export interface PortableArchiveEnvelope {
  readonly container: 'MEZIP_DIRECTORY_JSON_V1';
  readonly manifest: PortableArchiveManifest;
  readonly files: readonly PortableArchiveFile[];
  readonly checksums: readonly PortableArchiveChecksum[];
  readonly manifestSha256: string;
  readonly encryption: { readonly mode: PortableArchiveEncryptionMode; readonly saltBase64: string | null; readonly ivBase64: string | null; readonly authTagBase64: string | null; };
}
export interface PortableArchiveExportRequest {
  readonly type: PortableArchiveExportType;
  readonly year?: number;
  readonly dateRange?: PortableArchiveDateRange;
  readonly sections?: readonly PortableArchiveSection[];
  readonly includeMedia?: boolean;
  readonly includeTrash?: boolean;
  readonly encryptionMode?: PortableArchiveEncryptionMode;
  /** Password is never echoed or persisted. It is accepted only by a trusted server seam. */
  readonly password?: string;
  readonly timezone?: string;
  readonly locale?: string;
}
export interface PortableArchiveExportJob {
  readonly id: string;
  readonly ownerId: string;
  readonly type: PortableArchiveExportType;
  readonly status: PortableArchiveJobStatus;
  readonly requestedSections: readonly PortableArchiveSection[];
  readonly dateRange: PortableArchiveDateRange;
  readonly includeMedia: boolean;
  readonly encryptionMode: PortableArchiveEncryptionMode;
  readonly progress: number;
  readonly stage: 'COLLECTING' | 'PACKAGING' | 'VERIFYING' | 'READY' | 'FAILED' | 'CANCELLED' | 'EXPIRED';
  readonly createdAt: string;
  readonly startedAt: string | null;
  readonly completedAt: string | null;
  readonly expiresAt: string | null;
  readonly fileSize: number | null;
  readonly checksum: string | null;
  readonly downloadTokenExpiresAt: string | null;
  readonly errorCode: string | null;
}
export interface PortableArchiveDownload { readonly archiveId: string; readonly jobId: string; readonly fileName: string; readonly token: string; readonly expiresAt: string; readonly bytes: number; readonly checksum: string; }
export interface PortableArchiveImportRequest { readonly sections?: readonly PortableArchiveSection[]; readonly conflictResolution?: PortableArchiveConflictResolution; readonly password?: string; readonly restoreMode?: 'MERGE' | 'REPLACE_SELECTED'; }
export interface PortableArchiveConflict { readonly id: string; readonly kind: PortableArchiveConflictKind; readonly section: PortableArchiveSection; readonly portableId: string; readonly existingId: string | null; readonly summary: string; readonly suggestedResolution: PortableArchiveConflictResolution; readonly resolved: boolean; }
export interface PortableArchiveImportPreview { readonly importId: string; readonly archiveId: string; readonly schemaVersion: string; readonly integrity: 'VERIFIED' | 'INTEGRITY_FAILED'; readonly compatible: boolean; readonly sections: readonly PortableArchiveSection[]; readonly counts: Readonly<Record<string, number>>; readonly conflicts: readonly PortableArchiveConflict[]; readonly sensitiveDataIncluded: boolean; readonly warnings: readonly string[]; }
export interface PortableArchiveImportJob { readonly id: string; readonly ownerId: string; readonly status: PortableArchiveImportStatus; readonly progress: number; readonly preview: PortableArchiveImportPreview | null; readonly restoredCounts: Readonly<Record<string, number>>; readonly createdAt: string; readonly completedAt: string | null; readonly errorCode: string | null; }
export interface PortableArchiveBackup { readonly id: string; readonly ownerId: string; readonly kind: 'USER_EXPORT' | 'SYSTEM_BACKUP' | 'PRE_RESTORE'; readonly archiveId: string; readonly status: 'READY' | 'FAILED' | 'EXPIRED'; readonly createdAt: string; readonly expiresAt: string | null; readonly bytes: number; readonly checksum: string; readonly retentionDays: number; }
export interface PortableArchiveRestoreJob { readonly id: string; readonly ownerId: string; readonly backupId: string | null; readonly importId: string; readonly status: 'QUEUED' | 'RESTORING' | 'READY' | 'FAILED' | 'CANCELLED'; readonly progress: number; readonly checkpoint: string | null; readonly createdAt: string; readonly completedAt: string | null; }
export interface PortableAnnualArchive { readonly id: string; readonly ownerId: string; readonly year: number; readonly archiveId: string | null; readonly status: 'DRAFT' | 'GENERATING' | 'READY' | 'FAILED'; readonly statistics: Readonly<Record<string, number>>; readonly timeline: readonly JsonObject[]; readonly mediaOverview: Readonly<Record<string, number>>; readonly aiInsight: JsonObject | null; readonly createdAt: string; readonly updatedAt: string; }
export interface PortableLegacyPlan { readonly id: string; readonly ownerId: string; readonly status: 'DRAFT' | 'ACTIVE' | 'REVOKED'; readonly scope: readonly PortableArchiveSection[]; readonly trigger: 'MANUAL_REVIEW_ONLY'; readonly createdAt: string; readonly updatedAt: string; }
export interface PortableLegacyRecipient { readonly id: string; readonly ownerId: string; readonly displayName: string; readonly contactReference: string; readonly verified: boolean; readonly createdAt: string; }
export interface PortableLegacyPolicy { readonly ownerId: string; readonly releaseMode: 'DISABLED'; readonly legalReviewRequired: true; readonly autoReleaseEnabled: false; readonly updatedAt: string; }

export const offlineMutationStatuses = [
  'PENDING',
  'APPLIED',
  'CONFLICT',
  'FAILED',
] as const;
export type OfflineMutationStatus = (typeof offlineMutationStatuses)[number];

export interface ArchiveOfflineMutation {
  readonly id: string;
  readonly ownerId: string;
  readonly clientMutationId: string;
  readonly entityType:
    'ENTRY' | 'HISTORY' | 'FITNESS' | 'DAILY_PACK' | 'MEDIA' | 'STEPS' | 'BODY_METRIC';
  readonly entityId: string | null;
  readonly operation: 'CREATE' | 'UPDATE' | 'TRASH' | 'RESTORE' | 'DELETE';
  readonly payload: JsonObject;
  readonly baseRevision: number | null;
  readonly status: OfflineMutationStatus;
  readonly createdAt: string;
  readonly updatedAt: string;
  readonly conflictId: string | null;
}

export interface ArchiveConflict {
  readonly id: string;
  readonly ownerId: string;
  readonly entityType: ArchiveOfflineMutation['entityType'];
  readonly entityId: string;
  readonly expectedRevision: number;
  readonly actualRevision: number;
  readonly localPayload: JsonObject;
  readonly serverPayload: JsonObject;
  readonly resolvedAt: string | null;
  readonly createdAt: string;
}

export interface ArchiveSyncState {
  readonly ownerId: string;
  readonly cursor: string | null;
  readonly pending: number;
  readonly conflicts: number;
  readonly lastSyncedAt: string | null;
}

// ---------------------------------------------------------------------------
// Phase 4 Community domain contracts
// ---------------------------------------------------------------------------
//
// These contracts deliberately keep ordinary visibility separate from Founder
// audiences. A plan code or Founder audience is never an ordinary-user privacy
// value, and neither grants access to another user's private archive.

export const communityPostStatuses = [
  'DRAFT',
  'PUBLISHED',
  'HIDDEN',
  'REMOVED',
  'DELETED',
] as const;
export type CommunityPostStatus = (typeof communityPostStatuses)[number];

export const communityReactionTypes = ['LIKE'] as const;
export type CommunityReactionType = (typeof communityReactionTypes)[number];

export const communityFeedModes = ['DISCOVER', 'FOLLOWING', 'LATEST'] as const;
export type CommunityFeedMode = (typeof communityFeedModes)[number];

export type CommunityVisibility = Exclude<ContentVisibility, 'PRIVATE' | 'SNAPSHOT'>;

export const communityMediaKinds = ['IMAGE', 'VIDEO'] as const;
export type CommunityMediaKind = (typeof communityMediaKinds)[number];

/** A media id is only a reference. Delivery remains an authorized media-service operation. */
export interface CommunityMediaReference {
  readonly mediaId: string;
  readonly kind: CommunityMediaKind;
  readonly altText: string | null;
}

/**
 * Immutable projection of an explicitly published private archive record.
 * `snapshotContent` is copied at publication time and never reads the original
 * archive entry while rendering a Community post.
 */
export interface CommunityPublishedSnapshot {
  readonly id: string;
  readonly archiveSnapshotId: string;
  readonly ownerId: string;
  readonly sourceType: 'LIFE_ENTRY';
  readonly sourceId: string;
  readonly sourceRevision: number;
  readonly snapshotContent: JsonObject;
  readonly snapshotMedia: readonly CommunityMediaReference[];
  readonly visibility: CommunityVisibility;
  readonly status: 'PUBLISHED' | 'REVOKED';
  readonly publishedAt: string;
  readonly updatedAt: string;
}

export interface CommunityPost {
  readonly id: string;
  readonly authorId: string;
  readonly publishedSnapshotId: string | null;
  readonly groupId: string | null;
  readonly channelId: string | null;
  readonly activityId: string | null;
  readonly body: string | null;
  readonly media: readonly CommunityMediaReference[];
  readonly visibility: CommunityVisibility;
  /** Founder audience is valid only for server-authorized official-channel content. */
  readonly founderAudience: FounderAudience | null;
  readonly status: CommunityPostStatus;
  readonly reactionCount: number;
  readonly commentCount: number;
  readonly createdAt: string;
  readonly updatedAt: string;
  readonly deletedAt: string | null;
}

/** Small, already-published preview for a Community delivery copy. */
export interface CommunitySnapshotPreview {
  readonly id: string;
  readonly sourceType: 'LIFE' | 'HISTORY' | 'FITNESS' | 'DAILY_PACK' | 'MEDIA';
  readonly sourceRevision: number;
  readonly title: string | null;
  readonly excerpt: string | null;
}

/**
 * A sanitized one-level preview of a quoted Community post.  An unavailable
 * source intentionally contains neither an identifier nor cached text, so a
 * deleted, blocked, or newly-private post cannot be reconstructed from a
 * quote envelope.
 */
export type CommunityQuotePreview =
  | {
      readonly state: 'AVAILABLE';
      readonly post: {
        readonly id: string;
        readonly author: CommunityAuthorProfile;
        readonly body: string | null;
        readonly snapshot: CommunitySnapshotPreview | null;
        readonly createdAt: string;
      };
    }
  | { readonly state: 'UNAVAILABLE' };

/** A feed attribution, not a copied post or a private activity record. */
export interface CommunityRepostAttribution {
  readonly author: CommunityAuthorProfile;
  readonly repostedAt: string;
}

/**
 * The explicit archive publication boundary returns both immutable delivery
 * artifacts together. The snapshot is the frozen projection; the post is the
 * independently editable Community envelope that references it.
 */
export interface CommunitySnapshotPublication {
  readonly snapshot: CommunityPublishedSnapshot;
  readonly post: CommunityPost;
}

export interface CommunityAuthorProfile {
  readonly userId: string;
  readonly displayName: string;
  readonly avatarMediaId: string | null;
  readonly profileVisibility: 'PUBLIC' | 'PRIVATE';
}

/** Public Community profile; it never includes archive, identity-provider, phone, or email data. */
export interface CommunityProfile extends CommunityAuthorProfile {
  readonly bio: string | null;
  readonly followPermission: 'EVERYONE' | 'NOBODY';
  readonly createdAt: string;
  readonly updatedAt: string;
}

export interface CommunityFeedItem extends CommunityPost {
  readonly author: CommunityAuthorProfile;
  readonly snapshot: CommunitySnapshotPreview | null;
  readonly quote: CommunityQuotePreview | null;
  readonly repostCount: number;
  readonly repostedBy: CommunityRepostAttribution | null;
  readonly viewer: {
    readonly reacted: boolean;
    readonly saved: boolean;
    readonly followingAuthor: boolean;
    readonly reposted: boolean;
  };
  readonly context: 'COMMUNITY' | 'GROUP' | 'CHANNEL' | 'ACTIVITY';
}

export interface CommunityCursorPage<T> {
  readonly items: readonly T[];
  readonly nextCursor: string | null;
  readonly hasMore: boolean;
}

export interface CommunityFeedPage extends CommunityCursorPage<CommunityFeedItem> {
  readonly mode: CommunityFeedMode;
  readonly ranking: {
    readonly strategy: 'CHRONOLOGICAL' | 'RECENT_ENGAGEMENT';
    readonly factors: readonly string[];
  };
}

export interface CommunityReaction {
  readonly postId: string;
  readonly userId: string;
  readonly type: CommunityReactionType;
  readonly createdAt: string;
}

export const communityCommentStatuses = [
  'PUBLISHED',
  'HIDDEN',
  'REMOVED',
  'DELETED',
] as const;
export type CommunityCommentStatus = (typeof communityCommentStatuses)[number];

export interface CommunityComment {
  readonly id: string;
  readonly postId: string;
  readonly authorId: string;
  readonly parentCommentId: string | null;
  readonly body: string;
  readonly status: CommunityCommentStatus;
  readonly createdAt: string;
  readonly updatedAt: string;
  readonly deletedAt: string | null;
}

export const communityGroupVisibilities = ['PUBLIC', 'PRIVATE', 'INVITE_ONLY'] as const;
export type CommunityGroupVisibility = (typeof communityGroupVisibilities)[number];
export const communityGroupStatuses = ['ACTIVE', 'ARCHIVED', 'DELETED'] as const;
export type CommunityGroupStatus = (typeof communityGroupStatuses)[number];
export const communityGroupRoles = ['OWNER', 'ADMIN', 'MEMBER'] as const;
export type CommunityGroupRole = (typeof communityGroupRoles)[number];
export const communityGroupMembershipStatuses = [
  'PENDING',
  'INVITED',
  'ACTIVE',
  'LEFT',
  'REMOVED',
  'BANNED',
] as const;
export type CommunityGroupMembershipStatus =
  (typeof communityGroupMembershipStatuses)[number];

export interface CommunityGroup {
  readonly id: string;
  readonly ownerId: string;
  readonly name: string;
  readonly description: string | null;
  readonly avatarMediaId: string | null;
  readonly coverMediaId: string | null;
  readonly visibility: CommunityGroupVisibility;
  readonly status: CommunityGroupStatus;
  readonly createdAt: string;
  readonly updatedAt: string;
  readonly deletedAt: string | null;
}

export interface CommunityGroupMembership {
  readonly groupId: string;
  readonly userId: string;
  readonly role: CommunityGroupRole;
  readonly status: CommunityGroupMembershipStatus;
  readonly requestedAt: string;
  readonly joinedAt: string | null;
  readonly updatedAt: string;
}

export const communityChannelStatuses = ['ACTIVE', 'ARCHIVED', 'DELETED'] as const;
export type CommunityChannelStatus = (typeof communityChannelStatuses)[number];

/** Detailed Phase 4 view over the Phase 3 `channels` persistence table. */
export interface CommunityChannel {
  readonly id: string;
  readonly ownerId: string;
  readonly type: ChannelType;
  readonly slug: string;
  readonly name: string;
  readonly description: string | null;
  readonly visibility: CommunityVisibility;
  readonly founderAudience: FounderAudience | null;
  readonly status: CommunityChannelStatus;
  readonly createdAt: string;
  readonly updatedAt: string;
  readonly archivedAt: string | null;
  readonly deletedAt: string | null;
}

export const communityChannelMembershipStatuses = [
  'ACTIVE',
  'LEFT',
  'REMOVED',
  'BANNED',
] as const;
export type CommunityChannelMembershipStatus =
  (typeof communityChannelMembershipStatuses)[number];
export interface CommunityChannelMembership {
  readonly channelId: string;
  readonly userId: string;
  readonly status: CommunityChannelMembershipStatus;
  readonly joinedAt: string | null;
  readonly updatedAt: string;
}

export const communityActivityStatuses = [
  'DRAFT',
  'PUBLISHED',
  'CANCELLED',
  'COMPLETED',
  'DELETED',
] as const;
export type CommunityActivityStatus = (typeof communityActivityStatuses)[number];
export const communityActivityKinds = [
  'ONLINE',
  'OFFLINE',
  'COMMUNITY',
  'FOUNDER',
  'GROUP',
] as const;
export type CommunityActivityKind = (typeof communityActivityKinds)[number];
export const communityRegistrationStatuses = ['ACTIVE', 'CANCELLED'] as const;
export type CommunityRegistrationStatus =
  (typeof communityRegistrationStatuses)[number];

export interface CommunityActivity {
  readonly id: string;
  readonly creatorUserId: string;
  readonly groupId: string | null;
  readonly channelId: string | null;
  readonly kind: CommunityActivityKind;
  readonly title: string;
  readonly description: string | null;
  readonly startAt: string;
  readonly endAt: string | null;
  readonly timezone: string;
  readonly locationText: string | null;
  readonly onlineUrl: string | null;
  readonly capacity: number | null;
  readonly visibility: CommunityVisibility;
  readonly founderAudience: FounderAudience | null;
  readonly status: CommunityActivityStatus;
  readonly createdAt: string;
  readonly updatedAt: string;
  readonly deletedAt: string | null;
}

export interface CommunityActivityRegistration {
  readonly activityId: string;
  readonly userId: string;
  readonly status: CommunityRegistrationStatus;
  readonly registeredAt: string;
  readonly cancelledAt: string | null;
  readonly updatedAt: string;
}

export const communityNotificationTypes = [
  'FOLLOW',
  'REACTION',
  'COMMENT',
  'REPLY',
  'QUOTE',
  'REPOST',
  'GROUP_INVITE',
  'GROUP_APPROVED',
  'ACTIVITY_REMINDER',
  'CHANNEL_UPDATE',
  'MODERATION',
] as const;
export type CommunityNotificationType = (typeof communityNotificationTypes)[number];

/** Notification payload intentionally excludes full post/comment/private content. */
export interface CommunityNotification {
  readonly id: string;
  readonly recipientUserId: string;
  readonly actorUserId: string | null;
  readonly type: CommunityNotificationType;
  readonly resourceType:
    'POST' | 'COMMENT' | 'GROUP' | 'CHANNEL' | 'ACTIVITY' | 'MODERATION';
  readonly resourceId: string;
  readonly summaryCode: string;
  readonly status: 'UNREAD' | 'READ';
  readonly createdAt: string;
  readonly readAt: string | null;
}

export const communityReportReasons = [
  'SPAM',
  'HARASSMENT',
  'HATE',
  'SEXUAL',
  'VIOLENCE',
  'SCAM',
  'MISINFORMATION',
  'PRIVACY',
  'COPYRIGHT',
  'OTHER',
] as const;
export type CommunityReportReason = (typeof communityReportReasons)[number];
export const communityReportTargetTypes = [
  'POST',
  'COMMENT',
  'USER',
  'GROUP',
  'CHANNEL',
  'ACTIVITY',
] as const;
export type CommunityReportTargetType = (typeof communityReportTargetTypes)[number];

export interface CommunityReport {
  readonly id: string;
  readonly reporterUserId: string;
  readonly targetType: CommunityReportTargetType;
  readonly targetId: string;
  readonly reason: CommunityReportReason;
  readonly details: string | null;
  readonly status: 'OPEN' | 'REVIEWING' | 'ACTIONED' | 'DISMISSED';
  readonly createdAt: string;
}

export const moderationCaseStatuses = [
  'OPEN',
  'REVIEWING',
  'ACTIONED',
  'DISMISSED',
] as const;
export type ModerationCaseStatus = (typeof moderationCaseStatuses)[number];
export const moderationActionTypes = [
  'HIDE_CONTENT',
  'REMOVE_CONTENT',
  'WARN_USER',
  'SUSPEND_USER',
  'BAN_USER',
  'RESTORE_CONTENT',
] as const;
export type ModerationActionType = (typeof moderationActionTypes)[number];

export interface ModerationCase {
  readonly id: string;
  readonly reportId: string;
  readonly targetType: CommunityReportTargetType;
  readonly targetId: string;
  readonly targetOwnerId: string | null;
  readonly status: ModerationCaseStatus;
  readonly action: ModerationActionType | null;
  readonly actionedByUserId: string | null;
  readonly actionReason: string | null;
  readonly createdAt: string;
  readonly updatedAt: string;
}

export interface CommunitySearchResult {
  readonly type: 'USER' | 'POST' | 'GROUP' | 'CHANNEL' | 'ACTIVITY';
  readonly id: string;
  readonly title: string;
  readonly snippet: string;
  readonly createdAt: string;
}

// ---------------------------------------------------------------------------
// Phase 5 Messaging domain contracts
// ---------------------------------------------------------------------------
//
// Messages are private by default. These contracts contain only data already
// scoped by a server-authorized conversation membership query; a plan code,
// client role, or client supplied participant list can never authorize a read.

export const messagingConversationKinds = ['DIRECT', 'GROUP'] as const;
export type MessagingConversationKind = (typeof messagingConversationKinds)[number];

export const messagingConversationStatuses = ['ACTIVE', 'ARCHIVED'] as const;
export type MessagingConversationStatus =
  (typeof messagingConversationStatuses)[number];

/** A direct conversation can remain a request until the recipient explicitly
 * accepts it. This is server state, never a client-selected participant mode. */
export const messagingRequestStates = ['NONE', 'PENDING', 'ACCEPTED', 'REJECTED', 'BLOCKED'] as const;
export type MessagingRequestState = (typeof messagingRequestStates)[number];

export const messagingMemberRoles = [
  'OWNER',
  'ADMIN',
  'MODERATOR',
  'MEMBER',
  'MUTED',
  'BANNED',
] as const;
export type MessagingMemberRole = (typeof messagingMemberRoles)[number];

export const messagingMemberStatuses = ['ACTIVE', 'LEFT', 'REMOVED', 'BANNED'] as const;
export type MessagingMemberStatus = (typeof messagingMemberStatuses)[number];

/** Canonical wire message types. A caption stays in `body`; the primary media
 * kind determines IMAGE/VIDEO/VOICE/FILE. Mixed media kinds are rejected. */
export const messagingMessageKinds = [
  'TEXT',
  'IMAGE',
  'VIDEO',
  'VOICE',
  'FILE',
  'SYSTEM',
] as const;
export type MessagingMessageKind = (typeof messagingMessageKinds)[number];

export const messagingMessageStatuses = ['ACTIVE', 'DELETED'] as const;
export type MessagingMessageStatus = (typeof messagingMessageStatuses)[number];

export const messagingMediaKinds = ['IMAGE', 'VIDEO', 'VOICE', 'FILE'] as const;
export type MessagingMediaKind = (typeof messagingMediaKinds)[number];

/** Media delivery is a separately authorized media-service operation. No URL,
 * storage key, private archive reference, or binary payload is exposed here. */
export interface MessagingMediaReference {
  readonly mediaId: string;
  readonly kind: MessagingMediaKind;
  readonly fileName: string | null;
  readonly contentType: string | null;
  readonly bytes: number | null;
}

export interface MessagingConversation {
  readonly id: string;
  readonly kind: MessagingConversationKind;
  /** Present only for group-backed conversations and never client-authoritative. */
  readonly groupId: string | null;
  /** Durable server-side marker. Only the authorized Founder Inbox command
   * can create or promote this marker; generic direct-message routes cannot. */
  /** Optional only for backward-compatible consumers of pre-Phase-5 stored
   * summaries. The messaging service and 006 durable schema always materialize
   * this marker; clients should use `display.isFounderInbox` for UI. */
  readonly isFounderInbox?: boolean;
  readonly requestState?: MessagingRequestState;
  /** The recipient is a safe projection only to an existing participant. */
  readonly requestRecipientUserId?: string | null;
  readonly createdByUserId: string;
  readonly status: MessagingConversationStatus;
  readonly lastSequence: number;
  readonly lastMessageId: string | null;
  readonly lastMessageAt: string | null;
  readonly createdAt: string;
  readonly updatedAt: string;
  readonly archivedAt: string | null;
}

export interface MessagingConversationMember {
  readonly conversationId: string;
  readonly userId: string;
  readonly role: MessagingMemberRole;
  readonly status: MessagingMemberStatus;
  readonly joinedAt: string;
  readonly leftAt: string | null;
  readonly lastReadSequence: number;
  readonly mutedUntil: string | null;
  /** Personal organization state; it never archives or removes another member's view. */
  readonly pinnedAt: string | null;
  readonly archivedAt: string | null;
  readonly updatedAt: string;
}

export interface MessagingReaction {
  readonly messageId: string;
  readonly userId: string;
  readonly type: MessagingReactionType;
  readonly createdAt: string;
}

export const messagingReactionTypes = [
  'LIKE',
  'LOVE',
  'LAUGH',
  'SURPRISED',
  'SAD',
  'THANKS',
] as const;
export type MessagingReactionType = (typeof messagingReactionTypes)[number];

export interface MessagingMessage {
  readonly id: string;
  readonly conversationId: string;
  readonly senderId: string;
  /** UUID generated by the client before an offline enqueue. Server uniqueness
   * makes retrying the same outbox item safe. */
  readonly clientMessageId: string;
  readonly sequence: number;
  readonly kind: MessagingMessageKind;
  readonly body: string | null;
  readonly media: readonly MessagingMediaReference[];
  readonly replyToMessageId: string | null;
  readonly status: MessagingMessageStatus;
  readonly reactions: readonly MessagingReaction[];
  readonly createdAt: string;
  readonly updatedAt: string;
  readonly editedAt: string | null;
  readonly deletedAt: string | null;
  readonly deletedByUserId: string | null;
}

/** Per-viewer action projection. It is computed after conversation membership
 * authorization and deliberately contains no plan, admin, or moderator claim. */
export interface MessagingMessageViewerActions {
  readonly canEdit: boolean;
  readonly canDelete: boolean;
  readonly canReact: boolean;
  readonly canReport: boolean;
}

/** Consumer/API message shape. Persisted messages do not store `viewer`; it is
 * a server-generated projection for the authenticated recipient only. */
export interface MessagingMessageView extends MessagingMessage {
  readonly viewer: MessagingMessageViewerActions;
}

export interface MessagingMessagePreview {
  readonly id: string;
  readonly senderId: string;
  readonly sequence: number;
  readonly kind: MessagingMessageKind;
  readonly bodyPreview: string | null;
  readonly createdAt: string;
  readonly deletedAt: string | null;
}

export interface MessagingConversationSummary extends MessagingConversation {
  readonly memberCount: number;
  readonly viewer: MessagingConversationMember;
  /** Safe display projection. Direct peer identifiers are exposed only to an
   * already-authorized participant and can be used for an explicit block action. */
  readonly display: {
    readonly title: string;
    readonly avatarMediaId: string | null;
    readonly peerUserId: string | null;
    readonly isFounderInbox: boolean;
  };
  readonly lastMessage: MessagingMessagePreview | null;
  readonly unreadCount: number;
}

export interface MessagingCursorPage<T> {
  readonly items: readonly T[];
  readonly nextCursor: string | null;
  readonly hasMore: boolean;
}

export interface MessagingUnreadConversation {
  readonly conversationId: string;
  readonly unreadCount: number;
  readonly lastSequence: number;
  readonly lastReadSequence: number;
}

export interface MessagingUnreadSummary {
  readonly totalUnread: number;
  readonly conversations: readonly MessagingUnreadConversation[];
  readonly generatedAt: string;
}

export interface MessagingDraft {
  readonly conversationId: string;
  readonly userId: string;
  readonly body: string | null;
  readonly media: readonly MessagingMediaReference[];
  readonly replyToMessageId: string | null;
  readonly updatedAt: string;
}

export const messagingDirectMessagePolicies = ['EVERYONE', 'NOBODY'] as const;
export type MessagingDirectMessagePolicy =
  (typeof messagingDirectMessagePolicies)[number];
export const messagingNotificationLevels = ['ALL', 'MENTIONS', 'NONE'] as const;
export type MessagingNotificationLevel = (typeof messagingNotificationLevels)[number];

export interface MessagingUserSettings {
  readonly userId: string;
  readonly directMessagePolicy: MessagingDirectMessagePolicy;
  readonly readReceiptsEnabled: boolean;
  readonly notificationLevel: MessagingNotificationLevel;
  readonly updatedAt: string;
}

/** Presence is ephemeral server/session state, never a privacy entitlement or
 * a claim supplied for another user. Clients must tolerate its absence. */
export interface MessagingPresence {
  readonly userId: string;
  readonly status: 'ONLINE' | 'AWAY' | 'OFFLINE';
  readonly updatedAt: string;
  readonly expiresAt: string | null;
}

export const messagingReportReasons = [
  'SPAM',
  'HARASSMENT',
  'HATE',
  'SEXUAL',
  'VIOLENCE',
  'SCAM',
  'PRIVACY',
  'OTHER',
] as const;
export type MessagingReportReason = (typeof messagingReportReasons)[number];

export interface MessagingReport {
  readonly id: string;
  readonly reporterUserId: string;
  readonly messageId: string;
  readonly conversationId: string;
  readonly reason: MessagingReportReason;
  readonly details: string | null;
  readonly status: 'OPEN' | 'REVIEWING' | 'ACTIONED' | 'DISMISSED';
  readonly createdAt: string;
}

/** Notification payloads intentionally never carry a private message body. */
export const messagingNotificationTypes = [
  'MESSAGE',
  'MESSAGE_REQUEST',
  'REPLY',
  'REACTION',
  'MESSAGE_REPORT',
] as const;
export type MessagingNotificationType = (typeof messagingNotificationTypes)[number];
export interface MessagingNotification {
  readonly id: string;
  readonly recipientUserId: string;
  readonly actorUserId: string | null;
  readonly type: MessagingNotificationType;
  readonly conversationId: string;
  readonly messageId: string | null;
  readonly summaryCode: string;
  readonly status: 'UNREAD' | 'READ';
  readonly createdAt: string;
  readonly readAt: string | null;
}

export interface MessagingSearchResult {
  readonly messageId: string;
  readonly conversationId: string;
  readonly senderId: string;
  readonly sequence: number;
  readonly snippet: string;
  readonly createdAt: string;
}

/**
 * Realtime events are emitted only after the same membership authorization as
 * the REST read. Consumers must retain the event cursor/sequence and request
 * HTTP backfill when a gap is detected.
 */
export const messagingRealtimeEventTypes = [
  'message.created',
  'message.updated',
  'message.deleted',
  'message.reaction.updated',
  'conversation.read',
  'typing.started',
  'typing.stopped',
  'presence.updated',
] as const;
export type MessagingRealtimeEventType = (typeof messagingRealtimeEventTypes)[number];

export interface MessagingRealtimeEventBase {
  readonly eventId: string;
  readonly type: MessagingRealtimeEventType;
  readonly occurredAt: string;
  readonly conversationId: string | null;
  readonly sequence: number | null;
}

export type MessagingRealtimeEvent =
  | (MessagingRealtimeEventBase & {
      readonly type: 'message.created' | 'message.updated' | 'message.deleted';
      readonly conversationId: string;
      readonly sequence: number;
      readonly message: MessagingMessageView;
    })
  | (MessagingRealtimeEventBase & {
      readonly type: 'message.reaction.updated';
      readonly conversationId: string;
      readonly sequence: number;
      readonly messageId: string;
      readonly reaction: MessagingReaction;
      readonly active: boolean;
    })
  | (MessagingRealtimeEventBase & {
      readonly type: 'conversation.read';
      readonly conversationId: string;
      readonly sequence: number;
      readonly userId: string;
      readonly lastReadSequence: number;
    })
  | (MessagingRealtimeEventBase & {
      readonly type: 'typing.started' | 'typing.stopped';
      readonly conversationId: string;
      readonly sequence: null;
      readonly userId: string;
    })
  | (MessagingRealtimeEventBase & {
      readonly type: 'presence.updated';
      readonly conversationId: string | null;
      readonly sequence: null;
      readonly userId: string;
      readonly presence: 'ONLINE' | 'AWAY' | 'OFFLINE';
    });

export interface MessagingRealtimeSubscription {
  close(): void;
}

/** Credentials/session establishment is owned by the platform transport. */
export interface MessagingRealtimeTransport {
  subscribe(input: {
    readonly conversationIds?: readonly string[];
    readonly afterEventId?: string | null;
    readonly onEvent: (event: MessagingRealtimeEvent) => void;
    readonly onStatus?: (status: 'CONNECTED' | 'RECONNECTING' | 'FALLBACK') => void;
  }): Promise<MessagingRealtimeSubscription>;
}

/** REST handshake for a platform-owned authenticated realtime transport. This
 * intentionally carries no bearer credential, websocket URL, or authority
 * claim; clients supply a transport obtained from their host platform. */
export interface MessagingRealtimeHandshake {
  readonly mode: 'EXTERNAL_AUTHENTICATED_TRANSPORT';
  readonly realtimeAvailable: boolean;
  readonly fallbackRoute: '/v1/messaging/conversations/:conversationId/messages/backfill';
}

/** Required HTTP fallback when realtime is unavailable or sequence gaps occur. */
export interface MessagingRealtimeFallback {
  backfill(input: {
    readonly conversationId: string;
    readonly afterSequence: number;
    readonly limit?: number;
  }): Promise<MessagingCursorPage<MessagingMessageView>>;
}

// ---------------------------------------------------------------------------
// Phase 10 Creator Lab / Code Hub contracts
// ---------------------------------------------------------------------------

/** Creator Lab is a safe, owner-scoped workspace. These contracts describe
 * metadata and reviewable changes; they never carry credentials or execute
 * untrusted code. */
export const creatorProjectTypes = [
  'WEB',
  'MINI_PROGRAM',
  'SCRIPT',
  'LIBRARY',
  'DESIGN_CODE',
  'OTHER',
] as const;
export type CreatorProjectType = (typeof creatorProjectTypes)[number];
export const creatorProjectVisibilities = ['PRIVATE', 'UNLISTED', 'PUBLISHED'] as const;
export type CreatorProjectVisibility = (typeof creatorProjectVisibilities)[number];
export const creatorProjectStatuses = ['ACTIVE', 'TRASHED', 'DELETED'] as const;
export type CreatorProjectStatus = (typeof creatorProjectStatuses)[number];
export const creatorRepositorySources = [
  'LOCAL',
  'GITHUB',
  'IMPORTED_ZIP',
  'TEMPLATE',
] as const;
export type CreatorRepositorySource = (typeof creatorRepositorySources)[number];
export const creatorRepositoryProviders = ['NONE', 'GITHUB'] as const;
export type CreatorRepositoryProvider = (typeof creatorRepositoryProviders)[number];
export const creatorFileKinds = ['FILE', 'FOLDER'] as const;
export type CreatorFileKind = (typeof creatorFileKinds)[number];
export const creatorChangeStatuses = [
  'PROPOSED',
  'APPLIED',
  'REJECTED',
  'ROLLED_BACK',
  'CONFLICTED',
] as const;
export type CreatorChangeStatus = (typeof creatorChangeStatuses)[number];
export const creatorChangeOperations = [
  'CREATE',
  'UPDATE',
  'RENAME',
  'MOVE',
  'DELETE',
] as const;
export type CreatorChangeOperation = (typeof creatorChangeOperations)[number];
export const creatorGitChangeStatuses = [
  'ADDED',
  'MODIFIED',
  'DELETED',
  'RENAMED',
  'UNTRACKED',
  'CONFLICT',
] as const;
export type CreatorGitChangeStatus = (typeof creatorGitChangeStatuses)[number];
export const creatorReleaseStatuses = ['DRAFT', 'PUBLISHED', 'YANKED'] as const;
export type CreatorReleaseStatus = (typeof creatorReleaseStatuses)[number];

export interface CreatorProject {
  readonly id: string;
  readonly ownerId: string;
  readonly name: string;
  readonly description: string;
  readonly type: CreatorProjectType;
  readonly visibility: CreatorProjectVisibility;
  readonly status: CreatorProjectStatus;
  readonly defaultBranch: string;
  readonly workspaceVersion: number;
  readonly createdAt: string;
  readonly updatedAt: string;
  readonly lastOpenedAt: string | null;
}

export interface CreatorRepository {
  readonly id: string;
  readonly projectId: string;
  readonly ownerId: string;
  readonly source: CreatorRepositorySource;
  readonly provider: CreatorRepositoryProvider;
  readonly name: string;
  readonly fullName: string | null;
  readonly defaultBranch: string;
  readonly connectedAt: string;
  readonly status: 'CONNECTED' | 'DISCONNECTED' | 'IMPORTING' | 'FAILED';
}

export interface CreatorWorkspaceFile {
  readonly id: string;
  readonly projectId: string;
  readonly path: string;
  readonly kind: CreatorFileKind;
  readonly language: string | null;
  readonly sizeBytes: number;
  readonly checksum: string;
  readonly createdAt: string;
  readonly updatedAt: string;
}

export interface CreatorWorkspaceFileView extends CreatorWorkspaceFile {
  /** Content is returned only through an owner-authorized file-read route. */
  readonly content: string | null;
}

export interface CreatorWorkspaceSnapshot {
  readonly id: string;
  readonly projectId: string;
  readonly ownerId: string;
  readonly version: number;
  readonly reason: 'AI_APPLY' | 'IMPORT' | 'BULK_EDIT' | 'DELETE' | 'MANUAL';
  readonly fileCount: number;
  readonly checksum: string;
  readonly createdAt: string;
}

export interface CreatorWorkspaceChange {
  readonly id: string;
  readonly projectId: string;
  readonly ownerId: string;
  readonly operation: CreatorChangeOperation;
  readonly path: string;
  readonly nextPath: string | null;
  readonly oldChecksum: string | null;
  readonly newChecksum: string | null;
  readonly content: string | null;
}

export interface CreatorWorkspaceDiff {
  readonly projectId: string;
  readonly baseVersion: number;
  readonly currentVersion: number;
  readonly changes: readonly CreatorWorkspaceChange[];
}

export interface CreatorGitStatusEntry {
  readonly path: string;
  readonly status: CreatorGitChangeStatus;
  readonly oldPath: string | null;
}

export interface CreatorGitStatus {
  readonly projectId: string;
  readonly branch: string;
  readonly ahead: number;
  readonly behind: number;
  readonly clean: boolean;
  readonly entries: readonly CreatorGitStatusEntry[];
}

export interface CreatorGitCommit {
  readonly id: string;
  readonly projectId: string;
  readonly ownerId: string;
  readonly branch: string;
  readonly message: string;
  readonly changedPaths: readonly string[];
  readonly createdAt: string;
}

export interface CreatorAIChangeFile {
  readonly path: string;
  readonly operation: CreatorChangeOperation;
  readonly nextPath: string | null;
  readonly expectedChecksum: string | null;
  readonly content: string | null;
}

export interface CreatorAIChangeSet {
  readonly id: string;
  readonly projectId: string;
  readonly ownerId: string;
  readonly requestSummary: string;
  readonly scopePaths: readonly string[];
  readonly workspaceVersion: number;
  readonly status: CreatorChangeStatus;
  readonly files: readonly CreatorAIChangeFile[];
  readonly createdAt: string;
  readonly appliedAt: string | null;
  readonly rolledBackAt: string | null;
}

export interface CreatorRelease {
  readonly id: string;
  readonly projectId: string;
  readonly ownerId: string;
  readonly version: string;
  readonly title: string;
  readonly notes: string;
  readonly status: CreatorReleaseStatus;
  readonly sourceCommitId: string | null;
  readonly createdAt: string;
  readonly publishedAt: string | null;
}

export interface CreatorReleaseAsset {
  readonly id: string;
  readonly releaseId: string;
  readonly projectId: string;
  readonly name: string;
  readonly sizeBytes: number;
  readonly checksum: string;
  readonly contentType: string;
}

export interface CreatorProjectExport {
  readonly id: string;
  readonly projectId: string;
  readonly ownerId: string;
  readonly format: 'ZIP';
  readonly status: 'READY' | 'EXPIRED' | 'FAILED';
  readonly manifestChecksum: string;
  readonly fileCount: number;
  readonly createdAt: string;
  readonly expiresAt: string;
}

export interface CreatorGitHubConnection {
  readonly id: string;
  readonly ownerId: string;
  readonly provider: 'GITHUB';
  readonly accountLabel: string;
  readonly status: 'CONNECTED' | 'REVOKED' | 'PENDING';
  readonly connectedAt: string;
}

/** Server-created OAuth handoff. The client receives only the authorization
 * URL and expiry; OAuth state, tokens and client secrets never leave the
 * trusted GitHub connector. */
export interface CreatorGitHubAuthorizationStart {
  readonly authorizationUrl: string;
  readonly expiresAt: string;
}

export interface CreatorProjectPage {
  readonly items: readonly CreatorProject[];
  readonly nextCursor: string | null;
}

export interface CreatorFilePage {
  readonly items: readonly CreatorWorkspaceFile[];
  readonly nextCursor: string | null;
}

// ---------------------------------------------------------------------------
// Phase 20 — Creator Ecosystem public/project projections
// ---------------------------------------------------------------------------

/** These lifecycle values describe the public-release lifecycle only. The
 * existing Creator Lab workspace remains the sole source of editable project
 * files and never accepts a client-provided transition. */
export const creatorProjectLifecycles = [
  'DRAFT',
  'ACTIVE',
  'PREVIEW_READY',
  'RELEASE_READY',
  'PUBLISHED',
  'ARCHIVED',
] as const;
export type CreatorProjectLifecycle = (typeof creatorProjectLifecycles)[number];

export const creatorProjectPublicVisibilities = ['PRIVATE', 'UNLISTED', 'PUBLIC'] as const;
export type CreatorProjectPublicVisibility = (typeof creatorProjectPublicVisibilities)[number];
export const creatorSourceVisibilities = ['PRIVATE', 'OWNER_ONLY', 'ENTITLEMENT_GATED', 'PUBLIC'] as const;
export type CreatorSourceVisibility = (typeof creatorSourceVisibilities)[number];
export const creatorDownloadVisibilities = ['DISABLED', 'OWNER_ONLY', 'ENTITLEMENT_GATED', 'PUBLIC'] as const;
export type CreatorDownloadVisibility = (typeof creatorDownloadVisibilities)[number];
export const creatorDemoVisibilities = ['DISABLED', 'PRIVATE', 'ENTITLEMENT_GATED', 'PUBLIC'] as const;
export type CreatorDemoVisibility = (typeof creatorDemoVisibilities)[number];

/** A public profile has no account roles, capability list, private contact
 * data, credential metadata, or root/developer fields. */
export interface CreatorPublicProfile {
  readonly userId: string;
  readonly username: string;
  readonly displayName: string;
  readonly avatarMediaId: string | null;
  readonly bio: string | null;
  readonly creatorBadge: boolean;
  readonly founderBadge: boolean;
  readonly connectedApps: readonly PublicExternalIdentity[];
  readonly projectCount: number;
  readonly releaseCount: number;
  readonly followerCount: number | null;
  readonly createdAt: string;
  readonly updatedAt: string;
}

/** The owner-only projection intentionally contains only editable public
 * profile fields; it is not a membership or administrator projection. */
export interface CreatorProfile extends CreatorPublicProfile {
  readonly profileVisibility: 'PUBLIC' | 'PRIVATE';
}

export interface CreatorProjectVisibilitySettings {
  readonly projectId: string;
  readonly projectVisibility: CreatorProjectPublicVisibility;
  readonly sourceVisibility: CreatorSourceVisibility;
  readonly downloadVisibility: CreatorDownloadVisibility;
  readonly demoVisibility: CreatorDemoVisibility;
  readonly updatedAt: string;
}

export interface CreatorProjectMetadata {
  readonly projectId: string;
  readonly ownerId: string;
  readonly slug: string | null;
  readonly coverMediaId: string | null;
  readonly tags: readonly string[];
  readonly technologies: readonly string[];
  readonly lifecycle: CreatorProjectLifecycle;
  readonly visibility: CreatorProjectVisibilitySettings;
  readonly updatedAt: string;
}

export interface CreatorProjectMedia {
  readonly id: string;
  readonly projectId: string;
  readonly mediaId: string;
  readonly kind: 'COVER' | 'SCREENSHOT';
  readonly caption: string | null;
  readonly position: number;
}

/** An immutable publish-time projection. It contains no workspace source,
 * secret, draft, private repository metadata, or signed URL. */
export interface CreatorPublishedProjectSnapshot {
  readonly id: string;
  readonly projectId: string;
  readonly ownerId: string;
  readonly projectName: string;
  readonly description: string;
  readonly coverMediaId: string | null;
  readonly tags: readonly string[];
  readonly technologies: readonly string[];
  readonly screenshots: readonly CreatorProjectMedia[];
  readonly releaseId: string | null;
  readonly demoStatus: 'NOT_AVAILABLE' | 'BUILDING' | 'READY' | 'FAILED' | 'EXPIRED' | 'DISABLED' | 'ENTITLEMENT_REQUIRED';
  readonly publishedAt: string;
}

export interface CreatorProjectDetail {
  readonly project: CreatorProject;
  readonly creator: CreatorPublicProfile;
  readonly metadata: CreatorProjectMetadata;
  readonly latestSnapshot: CreatorPublishedProjectSnapshot | null;
  readonly releases: readonly CreatorRelease[];
  readonly viewer: {
    readonly isOwner: boolean;
    readonly canViewSource: boolean;
    readonly canDownload: boolean;
    readonly canOpenDemo: boolean;
    readonly saved: boolean | null;
    readonly followingCreator: boolean | null;
  };
}

export interface CreatorProjectSourceFile {
  readonly projectId: string;
  readonly path: string;
  readonly language: string | null;
  readonly content: string | null;
  readonly state: 'TEXT' | 'BINARY' | 'TOO_LARGE' | 'UNAVAILABLE';
}

export interface CreatorProjectDownloadGrant {
  readonly assetId: string;
  readonly releaseId: string;
  readonly expiresAt: string;
  /** Opaque server ticket. It is never a permanent storage URL. */
  readonly downloadToken: string;
}

export interface CreatorProjectStats {
  readonly projectId: string;
  readonly projectViews: number;
  readonly projectSaves: number;
  readonly demoOpens: number;
  readonly downloads: number;
}

export interface CreatorHome {
  readonly profile: CreatorProfile;
  readonly projects: readonly CreatorProject[];
  readonly draftProjects: readonly CreatorProject[];
  readonly publishedProjects: readonly CreatorProject[];
  readonly releases: readonly CreatorRelease[];
  readonly connectedGitHub: CreatorGitHubConnection | null;
}

// ---------------------------------------------------------------------------
// Phase 12 — deployment / publishing contracts
// ---------------------------------------------------------------------------

export const deploymentEnvironments = ['PREVIEW', 'PRODUCTION'] as const;
export type DeploymentEnvironment = (typeof deploymentEnvironments)[number];
export const deploymentProviders = [
  'MOCK_STATIC',
  'STATIC_WEB',
  'MANAGED_WEB',
  'CONTAINER_RUNTIME',
] as const;
export type DeploymentProviderCode = (typeof deploymentProviders)[number];
export const deploymentSourceTypes = ['COMMIT', 'RELEASE', 'SNAPSHOT'] as const;
export type DeploymentSourceType = (typeof deploymentSourceTypes)[number];
export const deploymentStatuses = [
  'QUEUED',
  'BUILDING',
  'READY_TO_DEPLOY',
  'DEPLOYING',
  'LIVE',
  'FAILED',
  'CANCELLED',
  'ROLLED_BACK',
  'SUPERSEDED',
  'DELETING',
  'DELETED',
] as const;
export type DeploymentStatus = (typeof deploymentStatuses)[number];
export const previewVisibilities = ['PRIVATE', 'LINK_ONLY', 'PUBLIC'] as const;
export type PreviewVisibility = (typeof previewVisibilities)[number];
export const domainStatuses = [
  'PENDING_VERIFICATION',
  'VERIFIED',
  'CONFIGURING',
  'ACTIVE',
  'FAILED',
  'DISCONNECTED',
] as const;
export type CustomDomainStatus = (typeof domainStatuses)[number];
export const tlsStatuses = [
  'PENDING',
  'ISSUING',
  'ACTIVE',
  'FAILED',
  'RENEWAL_REQUIRED',
] as const;
export type TlsStatus = (typeof tlsStatuses)[number];
export const deploymentActors = ['USER', 'SYSTEM', 'AI_ASSISTED', 'ADMIN'] as const;
export type DeploymentActor = (typeof deploymentActors)[number];

export interface DeploymentArtifact {
  readonly id: string;
  readonly projectId: string;
  readonly sourceRevision: string;
  readonly buildId: string;
  readonly contentHash: string;
  readonly sizeBytes: number;
  readonly manifest: Readonly<Record<string, string | number | boolean>>;
  readonly status: 'READY' | 'EXPIRED' | 'DELETED';
  readonly createdAt: string;
}

export interface Deployment {
  readonly id: string;
  readonly ownerId: string;
  readonly projectId: string;
  readonly environment: DeploymentEnvironment;
  readonly provider: DeploymentProviderCode;
  readonly sourceType: DeploymentSourceType;
  readonly sourceRevision: string;
  readonly releaseId: string | null;
  readonly buildArtifactId: string | null;
  readonly status: DeploymentStatus;
  readonly url: string | null;
  readonly actor: DeploymentActor;
  readonly createdAt: string;
  readonly startedAt: string | null;
  readonly completedAt: string | null;
  readonly failedAt: string | null;
  readonly errorClass: string | null;
  readonly errorMessage: string | null;
  readonly supersededByDeploymentId: string | null;
}

export interface DeploymentLog {
  readonly id: string;
  readonly deploymentId: string;
  readonly phase: 'BUILD' | 'DEPLOY' | 'RUNTIME';
  readonly level: 'INFO' | 'WARN' | 'ERROR';
  readonly message: string;
  readonly sequence: number;
  readonly createdAt: string;
}

export interface DeploymentLogPage {
  readonly items: readonly DeploymentLog[];
  readonly nextCursor: string | null;
}

export interface DeploymentHealthCheck {
  readonly id: string;
  readonly deploymentId: string;
  readonly status: 'PENDING' | 'PASS' | 'FAIL';
  readonly url: string | null;
  readonly checkedAt: string | null;
  readonly errorClass: string | null;
  readonly errorMessage: string | null;
}

export interface DeploymentUsage {
  readonly projectId: string;
  readonly buildSeconds: number;
  readonly artifactBytes: number;
  readonly deploymentCount: number;
  readonly previewMinutes: number;
  readonly bandwidthBytes: number;
  readonly runtimeSeconds: number;
}

export interface PreviewShare {
  readonly id: string;
  readonly ownerId: string;
  readonly projectId: string;
  readonly deploymentId: string;
  readonly visibility: PreviewVisibility;
  readonly shareUrl: string | null;
  /** The raw token is returned only at creation and is never persisted. */
  readonly token: string | null;
  readonly passwordProtected: boolean;
  readonly expiresAt: string;
  readonly revokedAt: string | null;
  readonly createdAt: string;
}

export interface DnsRecordGuidance {
  readonly recordType: 'TXT' | 'CNAME';
  readonly name: string;
  readonly value: string;
}

export interface CustomDomain {
  readonly id: string;
  readonly ownerId: string;
  readonly projectId: string;
  readonly hostname: string;
  readonly status: CustomDomainStatus;
  readonly verificationMethod: 'DNS_TXT' | 'DNS_CNAME';
  readonly verificationTokenPresent: boolean;
  readonly dnsRecord: DnsRecordGuidance | null;
  readonly verifiedAt: string | null;
  readonly tlsStatus: TlsStatus;
  readonly createdAt: string;
}

export interface DeploymentEnvironmentConfig {
  readonly projectId: string;
  readonly environment: DeploymentEnvironment;
  readonly publicEnv: Readonly<Record<string, string>>;
  readonly secretRefs: readonly string[];
  readonly updatedAt: string;
}

export interface DeploymentSecretMetadata {
  readonly id: string;
  readonly projectId: string;
  readonly environment: DeploymentEnvironment;
  readonly name: string;
  readonly secretVersion: number;
  readonly updatedAt: string;
  readonly rotatedAt: string | null;
  readonly valuePresent: boolean;
}

export interface ProjectPublishSettings {
  readonly projectId: string;
  readonly projectVisibility: 'PRIVATE' | 'UNLISTED' | 'PUBLISHED';
  readonly sourceVisibility: 'PRIVATE' | 'SELECTED_RELEASE' | 'PUBLIC';
  readonly downloadVisibility: 'PRIVATE' | 'SELECTED_RELEASE' | 'PUBLIC';
  readonly updatedAt: string;
}

export interface ProjectPublication {
  readonly projectId: string;
  readonly projectName: string;
  readonly description: string;
  readonly screenshots: readonly string[];
  readonly demoUrl: string | null;
  readonly readme: string | null;
  readonly releaseId: string | null;
  readonly creatorDisplayName: string | null;
  readonly updatedAt: string;
}

export interface DeploymentPage {
  readonly items: readonly Deployment[];
  readonly nextCursor: string | null;
}

// ---------------------------------------------------------------------------
// Phase 11 — isolated sandbox runtime contracts
// ---------------------------------------------------------------------------

export const sandboxRuntimeProviders = [
  'MOCK',
  'LOCAL_CONTAINER',
  'REMOTE_CONTAINER',
  'MICROVM',
  'MANAGED',
] as const;
export type SandboxRuntimeProvider = (typeof sandboxRuntimeProviders)[number];
export const sandboxRuntimeStatuses = [
  'CREATING',
  'READY',
  'RUNNING',
  'STOPPING',
  'STOPPED',
  'FAILED',
  'EXPIRED',
  'DESTROYED',
] as const;
export type SandboxRuntimeStatus = (typeof sandboxRuntimeStatuses)[number];
export const sandboxRuntimeTaskTypes = [
  'INSTALL',
  'BUILD',
  'TEST',
  'LINT',
  'TYPECHECK',
  'DEV_SERVER',
  'COMMAND',
  'PREVIEW',
] as const;
export type SandboxRuntimeTaskType = (typeof sandboxRuntimeTaskTypes)[number];
export const sandboxRuntimeTaskStatuses = [
  'QUEUED',
  'RUNNING',
  'SUCCESS',
  'FAILED',
  'CANCELLED',
  'TIMED_OUT',
] as const;
export type SandboxRuntimeTaskStatus = (typeof sandboxRuntimeTaskStatuses)[number];
export const sandboxRuntimeLogStreams = ['STDOUT', 'STDERR', 'SYSTEM'] as const;
export type SandboxRuntimeLogStream = (typeof sandboxRuntimeLogStreams)[number];
export const sandboxRuntimeNetworkModes = [
  'DENY_ALL',
  'REGISTRY_ONLY',
  'ALLOWLIST',
] as const;
export type SandboxRuntimeNetworkMode = (typeof sandboxRuntimeNetworkModes)[number];
export const sandboxRuntimeSecurityProfiles = [
  'PLATFORM_DEFAULT',
  'SECCOMP_DEFAULT',
  'APPARMOR_DEFAULT',
] as const;
export type SandboxRuntimeSecurityProfile = (typeof sandboxRuntimeSecurityProfiles)[number];
export const sandboxRuntimeProcessStatuses = [
  'STARTING',
  'RUNNING',
  'STOPPING',
  'EXITED',
  'FAILED',
] as const;
export type SandboxRuntimeProcessStatus =
  (typeof sandboxRuntimeProcessStatuses)[number];

export interface SandboxRuntimeResourceLimits {
  readonly cpuMillis: number;
  readonly memoryBytes: number;
  readonly diskBytes: number;
  readonly processLimit: number;
  readonly commandTimeoutMs: number;
  readonly idleTimeoutMs: number;
  readonly maxLifetimeMs: number;
  readonly maxLogBytes: number;
}

export interface SandboxRuntimePolicy {
  readonly networkMode: SandboxRuntimeNetworkMode;
  readonly allowedHosts: readonly string[];
  readonly allowedPorts: readonly number[];
  readonly filesystemRoot: '/workspace';
  readonly hostMounts: readonly [];
  readonly privileged: false;
  readonly hostNetwork: false;
  readonly hostPid: false;
  readonly hostIpc: false;
  readonly dockerSocket: false;
  readonly runtimeUser: string;
  /** Provider maps this reviewed profile to seccomp/AppArmor or an equivalent. */
  readonly securityProfile: SandboxRuntimeSecurityProfile;
  /** No Linux capability is granted by the application policy. */
  readonly linuxCapabilities: readonly [];
}

export interface SandboxRuntime {
  readonly id: string;
  readonly userId: string;
  readonly projectId: string;
  readonly workspaceId: string;
  readonly provider: SandboxRuntimeProvider;
  readonly status: SandboxRuntimeStatus;
  readonly runtimeImage: string;
  readonly limits: SandboxRuntimeResourceLimits;
  readonly policy: SandboxRuntimePolicy;
  readonly createdAt: string;
  readonly startedAt: string | null;
  readonly expiresAt: string;
  readonly stoppedAt: string | null;
  readonly currentTaskId: string | null;
  readonly previewId: string | null;
  /** Runtime source is ephemeral; Creator workspace and Git remain source of truth. */
  readonly ephemeral?: true;
  readonly cleanupAt?: string;
  readonly recoveryState?: 'HEALTHY' | 'STALE' | 'RECOVERING' | 'LOST';
  readonly lastActivityAt?: string;
  readonly idleExpiresAt?: string;
}

export interface SandboxRuntimeTask {
  readonly id: string;
  readonly runtimeId: string;
  readonly projectId: string;
  readonly userId: string;
  readonly type: SandboxRuntimeTaskType;
  readonly commandSafeMetadata: string;
  readonly status: SandboxRuntimeTaskStatus;
  readonly startedAt: string | null;
  readonly completedAt: string | null;
  readonly exitCode: number | null;
  readonly durationMs: number | null;
  readonly timeoutMs: number;
  readonly logBytes: number;
  readonly artifactIds?: readonly string[];
  readonly problemCount?: number;
  readonly processId?: string | null;
}

export interface SandboxRuntimeLog {
  readonly id: string;
  readonly runtimeId: string;
  readonly taskId: string | null;
  readonly stream: SandboxRuntimeLogStream;
  readonly text: string;
  readonly occurredAt: string;
  readonly truncated: boolean;
}

export interface SandboxRuntimeProcess {
  readonly id: string;
  readonly runtimeId: string;
  readonly taskId: string;
  readonly label: string;
  readonly status: SandboxRuntimeProcessStatus;
  readonly exitCode: number | null;
  readonly startedAt: string;
  readonly stoppedAt: string | null;
}

export interface SandboxRuntimePort {
  readonly id: string;
  readonly runtimeId: string;
  readonly internalPort: number;
  readonly protocol: 'HTTP' | 'HTTPS' | 'WS';
  readonly status: 'RESERVED' | 'EXPOSED' | 'RELEASED';
}

export interface SandboxPreview {
  readonly id: string;
  readonly runtimeId: string;
  readonly projectId: string;
  readonly userId: string;
  readonly portId: string;
  readonly access: 'PRIVATE' | 'SHARED';
  readonly origin: string;
  readonly expiresAt: string;
  readonly csp: string;
  readonly status: 'STARTING' | 'READY' | 'STOPPED' | 'EXPIRED';
}

export interface SandboxWorkspaceChange {
  readonly id: string;
  readonly runtimeId: string;
  readonly projectId: string;
  readonly path: string;
  readonly operation: 'CREATE' | 'UPDATE' | 'DELETE' | 'RENAME';
  readonly beforeChecksum: string | null;
  readonly afterChecksum: string | null;
  readonly status: 'DETECTED' | 'REVIEWED' | 'APPLIED' | 'REJECTED';
}

export interface SandboxRuntimeUsage {
  readonly runtimeId: string;
  readonly cpuMillis: number;
  readonly memoryBytes: number;
  readonly diskBytes: number;
  readonly runtimeSeconds: number;
  readonly buildSeconds: number;
}

export interface SandboxTerminalSession {
  readonly id: string;
  readonly runtimeId: string;
  readonly projectId: string;
  readonly userId: string;
  readonly status: 'OPENING' | 'OPEN' | 'CLOSING' | 'CLOSED' | 'FAILED';
  readonly workingDirectory: '/workspace';
  readonly columns: number;
  readonly rows: number;
  readonly startedAt: string;
  readonly stoppedAt: string | null;
  readonly exitCode?: number | null;
  /** Input is never persisted in a session projection. */
  readonly inputRetention: 'NONE';
}

export interface SandboxRuntimeEnvironmentVariable {
  readonly id: string;
  readonly runtimeId: string;
  readonly key: string;
  readonly kind: 'PUBLIC' | 'SECRET_REFERENCE';
  /** Secret values are never returned; only a server-side vault reference may exist. */
  readonly secretReference: string | null;
  readonly status: 'PENDING' | 'INJECTED' | 'REVOKED';
  readonly expiresAt: string | null;
}

export interface SandboxRuntimeTokenMetadata {
  readonly id: string;
  readonly runtimeId: string;
  readonly scope: readonly ('WORKSPACE_READ' | 'WORKSPACE_SYNC' | 'PREVIEW_CONNECT')[];
  readonly expiresAt: string;
  readonly status: 'ACTIVE' | 'REVOKED' | 'EXPIRED';
  /** Opaque hash/identifier only; never a bearer token. */
  readonly tokenReferenceHash: string;
}

export interface SandboxRuntimeArtifact {
  readonly id: string;
  readonly runtimeId: string;
  readonly taskId: string;
  readonly projectId: string;
  readonly ownerId: string;
  readonly name: string;
  readonly relativePath: string;
  readonly sizeBytes: number;
  readonly checksum: string;
  readonly contentType: string;
  readonly status: 'READY' | 'EXPIRED' | 'FAILED';
  readonly createdAt: string;
  readonly expiresAt: string;
}

export interface SandboxRuntimeProblem {
  readonly id: string;
  readonly runtimeId: string;
  readonly taskId: string;
  readonly severity: 'ERROR' | 'WARNING' | 'INFO';
  readonly message: string;
  readonly path: string | null;
  readonly line: number | null;
  readonly column: number | null;
  readonly code: string | null;
  readonly source: 'BUILD' | 'TEST' | 'LINT' | 'TYPECHECK' | 'RUNTIME';
  readonly occurredAt: string;
}

export interface SandboxRuntimeConfig {
  readonly packageManager: 'NPM' | 'PNPM' | 'YARN' | null;
  readonly lockfile: 'PACKAGE_LOCK' | 'PNPM_LOCK' | 'YARN_LOCK' | null;
  readonly scripts: Readonly<
    Record<'BUILD' | 'TEST' | 'LINT' | 'TYPECHECK' | 'DEV_SERVER', string | null>
  >;
  readonly artifactPaths: readonly string[];
}

export interface SandboxRuntimeCleanupResult {
  readonly runtimeId: string;
  readonly reason:
    'USER_DESTROY' | 'IDLE_TIMEOUT' | 'MAX_LIFETIME' | 'ORPHAN' | 'CRASH_RECOVERY';
  readonly stoppedProcesses: number;
  readonly releasedPorts: number;
  readonly revokedSecrets: number;
  readonly revokedTokens: number;
  readonly stoppedPreviews: number;
  readonly completedAt: string;
}

export interface SandboxRuntimePage {
  readonly items: readonly SandboxRuntime[];
  readonly nextCursor: string | null;
}

export interface SandboxRuntimeTaskPage {
  readonly items: readonly SandboxRuntimeTask[];
  readonly nextCursor: string | null;
}

export interface SandboxRuntimeLogPage {
  readonly items: readonly SandboxRuntimeLog[];
  readonly nextCursor: string | null;
}

export interface SandboxTerminalSessionPage {
  readonly items: readonly SandboxTerminalSession[];
  readonly nextCursor: string | null;
}

export interface SandboxRuntimeProblemPage {
  readonly items: readonly SandboxRuntimeProblem[];
  readonly nextCursor: string | null;
}

// ---------------------------------------------------------------------------
// Phase 13 — External social connectors / curated social archive
// ---------------------------------------------------------------------------

export type SocialConnectorProviderCode = 'X' | 'DOUYIN' | 'MANUAL_LINK';
export type SocialConnectorCapability =
  | 'PROFILE_READ'
  | 'POST_READ'
  | 'MEDIA_READ'
  | 'PUBLISH'
  | 'LIKES_READ'
  | 'BOOKMARKS_READ'
  | 'FAVORITES_READ'
  | 'COLLECTION_READ'
  | 'ANALYTICS_READ';
export type SocialCapabilityStatus = 'SUPPORTED' | 'UNSUPPORTED' | 'NOT_VERIFIED';
export type SocialAccountStatus =
  | 'CONNECTED'
  | 'EXPIRED'
  | 'REAUTH_REQUIRED'
  | 'REVOKED'
  | 'DISCONNECTED'
  | 'ERROR';
export type SocialImportJobStatus =
  | 'QUEUED'
  | 'RUNNING'
  | 'SUCCESS'
  | 'PARTIAL'
  | 'FAILED'
  | 'CANCELLED'
  | 'RATE_LIMITED';
export type SocialArchiveContentType =
  | 'POST'
  | 'VIDEO'
  | 'IMAGE'
  | 'LINK'
  | 'THREAD'
  | 'PROFILE_REFERENCE'
  | 'MANUAL_SAVE';
export type SocialArchiveSource = 'OFFICIAL_API' | 'MANUAL_LINK' | 'USER_IMPORT' | 'PUBLISHED_SNAPSHOT';
export type SocialArchiveVisibility = 'PRIVATE' | 'COMMUNITY' | 'GROUP' | 'PUBLIC';
export type SocialContentStatus =
  | 'AVAILABLE'
  | 'SOURCE_DELETED'
  | 'SOURCE_PRIVATE'
  | 'SOURCE_UNAVAILABLE'
  | 'UNKNOWN';

export interface SocialConnectorCapabilityView {
  readonly provider: SocialConnectorProviderCode;
  readonly capability: SocialConnectorCapability;
  readonly status: SocialCapabilityStatus;
  readonly credentialRequired: boolean;
  readonly notes: string;
}

export interface SocialProviderSummary {
  readonly provider: SocialConnectorProviderCode;
  readonly displayName: string;
  readonly oauthAvailable: boolean;
  readonly officialApiVerified: boolean;
  readonly capabilities: readonly SocialConnectorCapabilityView[];
  readonly manualFallback: boolean;
}

export interface SocialArchiveQuery {
  readonly cursor?: string;
  readonly limit?: number;
  readonly provider?: SocialConnectorProviderCode;
  readonly query?: string;
  readonly tag?: string;
  readonly collectionId?: string;
  readonly from?: string;
  readonly to?: string;
  readonly founderOnly?: boolean;
}

export interface ExternalSocialAccount {
  readonly id: string;
  readonly ownerId: string;
  readonly provider: SocialConnectorProviderCode;
  readonly externalAccountId: string;
  readonly displayName: string;
  readonly username: string | null;
  readonly avatarReference: string | null;
  /** Safe, provider-returned profile counters only. Never contains tokens or raw provider payloads. */
  readonly profileMetrics?: {
    readonly followersCount: number | null;
    readonly followingCount: number | null;
    readonly postCount: number | null;
  };
  readonly status: SocialAccountStatus;
  readonly connectedAt: string | null;
  readonly lastSyncedAt: string | null;
  readonly capabilities: readonly SocialConnectorCapabilityView[];
  readonly consentVersion: string;
  readonly requestedScopes: readonly string[];
  readonly autoSync: boolean;
}

export interface SocialSyncStatus {
  readonly accountId: string;
  readonly provider: SocialConnectorProviderCode;
  readonly status: SocialImportJobStatus | 'IDLE' | 'DISCONNECTED' | 'NOT_CONFIGURED';
  readonly lastSyncedAt: string | null;
  readonly nextCursor: string | null;
  readonly importedCount: number;
  readonly errorCode: string | null;
  readonly retryAfterSeconds: number | null;
}

export interface SocialImportJob {
  readonly id: string;
  readonly ownerId: string;
  readonly accountId: string;
  readonly provider: SocialConnectorProviderCode;
  readonly type: 'INITIAL' | 'INCREMENTAL' | 'MANUAL';
  readonly status: SocialImportJobStatus;
  readonly cursor: string | null;
  readonly startedAt: string | null;
  readonly completedAt: string | null;
  readonly itemsSeen: number;
  readonly itemsImported: number;
  readonly itemsUpdated: number;
  readonly errorCount: number;
  readonly errorCode: string | null;
  readonly retryAfterSeconds: number | null;
}

export interface SocialArchiveItem {
  readonly id: string;
  readonly ownerId: string;
  readonly provider: SocialConnectorProviderCode;
  readonly externalAccountId: string | null;
  readonly externalContentId: string | null;
  readonly contentType: SocialArchiveContentType;
  readonly canonicalUrl: string;
  readonly textExcerpt: string | null;
  readonly publishedAt: string | null;
  readonly savedAt: string;
  readonly syncSource: SocialArchiveSource;
  readonly visibility: SocialArchiveVisibility;
  readonly metadata: JsonObject;
  readonly contentHash: string | null;
  readonly contentStatus: SocialContentStatus;
  readonly personalNote: string | null;
  readonly tags: readonly string[];
  readonly collectionIds: readonly string[];
  readonly isFounderCurated: boolean;
  readonly founderAudience: 'PUBLIC' | 'FREE' | 'GO' | 'PLUS' | 'PRO' | 'PRO_MAX' | null;
}

export interface SocialArchivePage {
  readonly items: readonly SocialArchiveItem[];
  readonly nextCursor: string | null;
}

export interface SocialCollection {
  readonly id: string;
  readonly ownerId: string;
  readonly name: string;
  readonly description: string | null;
  readonly visibility: 'PRIVATE' | 'PUBLIC';
  readonly createdAt: string;
  readonly updatedAt: string;
  readonly itemCount: number;
}

export interface SocialPublication {
  readonly id: string;
  readonly ownerId: string;
  readonly archiveItemId: string;
  readonly target: 'COMMUNITY' | 'GROUP' | 'PROFILE' | 'PUBLIC';
  readonly visibility: SocialArchiveVisibility;
  readonly status: 'PENDING' | 'PUBLISHED' | 'FAILED' | 'HIDDEN';
  readonly snapshotId: string | null;
  readonly createdAt: string;
  readonly publishedAt: string | null;
  readonly attribution: {
    readonly provider: SocialConnectorProviderCode;
    readonly originalUrl: string;
    readonly originalAuthor: string | null;
  };
}

export interface SocialExternalPublication {
  readonly id: string;
  readonly ownerId: string;
  readonly archiveItemId: string;
  readonly provider: SocialConnectorProviderCode;
  readonly accountId: string;
  readonly status: 'PENDING' | 'PUBLISHED' | 'FAILED' | 'NOT_SUPPORTED';
  readonly providerPostId: string | null;
  readonly canonicalUrl: string | null;
  readonly publishedAt: string | null;
  readonly errorCode: string | null;
}

export interface SocialConnectorAuditEvent {
  readonly id: string;
  readonly ownerId: string | null;
  readonly action:
    | 'OAUTH_STARTED'
    | 'OAUTH_COMPLETED'
    | 'ACCOUNT_CONNECTED'
    | 'ACCOUNT_SETTINGS_UPDATED'
    | 'ACCOUNT_DISCONNECTED'
    | 'SYNC_STARTED'
    | 'SYNC_COMPLETED'
    | 'MANUAL_LINK_SAVED'
    | 'COLLECTION_CREATED'
    | 'SNAPSHOT_PUBLISHED'
    | 'IMPORTED_DATA_DELETED'
    | 'ROOT_SOCIAL_READ';
  readonly provider: SocialConnectorProviderCode | null;
  readonly status: 'SUCCESS' | 'FAILED';
  readonly occurredAt: string;
  readonly requestId: string | null;
}

// ---------------------------------------------------------------------------
// Phase 19 — Connected apps / external identity
// ---------------------------------------------------------------------------

/**
 * These codes describe display identities and optional server-side provider
 * connections. They are deliberately separate from AuthIdentity providers:
 * linking a public WeChat contact must never create a second login account.
 */
export const externalIdentityProviderCodes = [
  'X',
  'CHATGPT',
  'WECHAT',
  'HONOR_OF_KINGS',
  'GITHUB',
] as const;
export type ExternalIdentityProviderCode = (typeof externalIdentityProviderCodes)[number];

export const externalIdentityConnectionStatuses = [
  'NOT_CONNECTED',
  'LINK_ONLY',
  'MANUAL_PROFILE',
  'CONNECTED',
  'REAUTH_REQUIRED',
  'PROVIDER_UNAVAILABLE',
  'UNSUPPORTED',
  'PRODUCTION_PENDING',
] as const;
export type ExternalIdentityConnectionStatus =
  (typeof externalIdentityConnectionStatuses)[number];

export type ExternalIdentityVisibility = 'PRIVATE' | 'PUBLIC';
export type ExternalIdentityCategory =
  | 'SOCIAL'
  | 'AI'
  | 'COMMUNICATION'
  | 'GAMING'
  | 'DEVELOPER';
export type ExternalIdentityCapability =
  | 'PUBLIC_PROFILE'
  | 'MANUAL_PROFILE'
  | 'OAUTH'
  | 'OPEN_HTTPS'
  | 'COPY_IDENTIFIER'
  | 'SHOW_QR'
  | 'FEATURED_REPOSITORIES';

/** Self-only projection. `qrMediaId` is intentionally absent from public APIs. */
export interface ExternalIdentity {
  readonly id: string;
  readonly ownerId: string;
  readonly provider: ExternalIdentityProviderCode;
  readonly displayName: string;
  readonly handle: string | null;
  readonly publicUrl: string | null;
  readonly avatarUrl: string | null;
  readonly description: string | null;
  readonly visibility: ExternalIdentityVisibility;
  readonly connectionStatus: ExternalIdentityConnectionStatus;
  readonly providerCapabilities: readonly ExternalIdentityCapability[];
  /** Whitelisted display metadata only; it never contains credentials or raw provider payloads. */
  readonly metadataSafe: JsonObject;
  /** A Media-service identifier, never an address to public object storage. */
  readonly qrMediaId: string | null;
  readonly displayOrder: number;
  readonly lastSyncedAt: string | null;
  readonly createdAt: string;
  readonly updatedAt: string;
}

/** Public Creator/Social profile projection. No owner id, QR, token or scope. */
export interface PublicExternalIdentity {
  readonly id: string;
  readonly provider: ExternalIdentityProviderCode;
  readonly displayName: string;
  readonly handle: string | null;
  readonly publicUrl: string | null;
  readonly avatarUrl: string | null;
  readonly description: string | null;
  readonly metadataSafe: JsonObject;
  readonly displayOrder: number;
}

export interface ExternalIdentityProviderInfo {
  readonly provider: ExternalIdentityProviderCode;
  readonly category: ExternalIdentityCategory;
  readonly displayName: string;
  readonly capabilities: readonly ExternalIdentityCapability[];
  readonly connectionStatus: ExternalIdentityConnectionStatus;
  readonly oauthConfigured: boolean;
  readonly officialCapabilityCheckedAt: string | null;
  readonly officialCapabilityReference: string | null;
  readonly unsupportedCapabilities: readonly string[];
}

/** Private connection metadata; credentials are never represented here. */
export interface ExternalIdentityConnection {
  readonly identityId: string;
  readonly provider: Extract<ExternalIdentityProviderCode, 'X' | 'GITHUB'>;
  readonly status: ExternalIdentityConnectionStatus;
  readonly requestedScopes: readonly string[];
  readonly expiresAt: string | null;
  readonly createdAt: string;
  readonly updatedAt: string;
}

/** Server-generated launch instructions after provider URL validation. */
export interface ExternalAppLaunchPlan {
  readonly provider: ExternalIdentityProviderCode;
  readonly action: 'OPEN_HTTPS' | 'COPY' | 'SHOW_QR' | 'UNSUPPORTED';
  readonly href: string | null;
  readonly copyText: string | null;
  readonly qrMediaId: string | null;
  readonly message: string;
}

export interface ExternalIdentityOAuthStart {
  readonly provider: Extract<ExternalIdentityProviderCode, 'X' | 'GITHUB'>;
  readonly authorizationUrl: string;
  readonly state: string;
  readonly expiresAt: string;
  readonly pkceRequired: true;
  readonly requestedScopes: readonly string[];
}

export interface ExternalIdentityAuditEvent {
  readonly id: string;
  readonly ownerId: string;
  readonly identityId: string | null;
  readonly provider: ExternalIdentityProviderCode | null;
  readonly action:
    | 'IDENTITY_CREATED'
    | 'IDENTITY_UPDATED'
    | 'IDENTITY_DELETED'
    | 'VISIBILITY_CHANGED'
    | 'IDENTITY_REORDERED'
    | 'OAUTH_STARTED'
    | 'OAUTH_COMPLETED'
    | 'CONNECTION_DISCONNECTED'
    | 'PROVIDER_REAUTH_REQUIRED';
  readonly status: 'SUCCESS' | 'FAILED';
  readonly occurredAt: string;
}

/** Phase 14.5 public-only presentation profile. This is approved display copy,
 * not a Founder, Root, account, archive or identity-authority projection. */
export const creatorIntroStages = [
  'IDLE',
  'ENTERING',
  'IDENTITY_CHIP',
  'STACK_REVEAL',
  'CARD_OPENING',
  'CONTENT_REVEAL',
  'READY',
  'CONTENT_CLOSING',
  'CARD_CLOSING',
  'STACK_COLLAPSING',
  'EXITING',
  'COMPLETE',
] as const;
export type CreatorIntroStage = (typeof creatorIntroStages)[number];

export const approvedCreatorProfile = {
  name: '姚振宇',
  alias: 'Tom',
  title: '产品设计师',
  titleEn: 'Product Designer',
  born: '中国',
  email: 'account3@example.com',
  about: [
    '我对人为什么点击、停留、犹豫、喜欢和离开一件产品，通常比对按钮本身更感兴趣。',
    'UCLA 认知科学的背景，让我把人的行为、注意力和决策方式放在设计工作的中心。',
  ],
  designTechnology: [
    '我喜欢探索设计与技术之间那块还没有名字的区域：',
    '有时候是一个界面，有时候是一段交互，有时候只是一个凌晨两点突然觉得：“这个应该能做出来吧。”的想法。',
  ],
  offHours: '咖啡、写字、乱涂和小工具。近期：手绘小镇、极简摄影、AI 实验。',
  personalDetail: '典型摩羯上升：想得很多，做得更多，文件名偶尔还是：final-final-v7。',
} as const;

export * from './platform-foundation.js';

// ---------------------------------------------------------------------------
// X Local Capture — additive, owner-scoped action layer
// ---------------------------------------------------------------------------

export const xCaptureActionTypes = [
  'like',
  'unlike',
  'bookmark',
  'unbookmark',
  'follow',
  'unfollow',
  'opened',
  'viewed',
  'copied_link',
  'share_to_mezip',
  'manual_save',
  'add_note',
] as const;
export type XCaptureActionType = (typeof xCaptureActionTypes)[number];

/**
 * Browser-local capture is intentionally limited to explicit user actions on
 * the supported public web platforms.  It is not an account crawler.
 */
export const xCapturePlatforms = ['X', 'DOUYIN', 'BILIBILI', 'WECHAT_WEB', 'EDGE'] as const;
export type XCapturePlatform = (typeof xCapturePlatforms)[number];

export const xCaptureSources = [
  'X_OFFICIAL_API',
  'LOCAL_CAPTURE',
  'MANUAL_IMPORT',
  'SHARE_EXTENSION',
] as const;
export type XCaptureSource = (typeof xCaptureSources)[number];

export const xCaptureSyncStatuses = [
  'LOCAL_ONLY',
  'PENDING_ENRICHMENT',
  'ENRICHED',
  'FAILED',
  'NOT_REQUIRED',
] as const;
export type XCaptureSyncStatus = (typeof xCaptureSyncStatuses)[number];

export interface XCaptureEvent {
  readonly id: string;
  readonly userId: string;
  readonly platform: XCapturePlatform;
  readonly actionType: XCaptureActionType;
  readonly postUrl: string;
  readonly postId: string | null;
  readonly authorHandle: string | null;
  readonly pageTitle: string | null;
  readonly capturedAt: string;
  readonly captureMethod?: 'EXPLICIT_ACTION' | 'VISIBLE_STATE';
  readonly observedAt?: string;
  readonly recovered?: boolean;
  readonly captureAccount?: { readonly profileUrl: string; readonly displayName: string };
  readonly source: XCaptureSource;
  readonly device: string | null;
  readonly browser: string | null;
  readonly note: string | null;
  readonly tags: readonly string[];
  readonly syncStatus: XCaptureSyncStatus;
  readonly createdAt: string;
  readonly updatedAt: string;
}

export interface XCaptureContentCache {
  readonly id: string;
  readonly userId: string;
  readonly postUrl: string;
  readonly postId: string | null;
  readonly authorHandle: string | null;
  readonly pageTitle: string | null;
  readonly textExcerpt: string | null;
  readonly media: readonly JsonObject[];
  readonly officialDataStatus: 'UNAVAILABLE' | 'PENDING' | 'AVAILABLE' | 'FAILED';
  readonly officialUpdatedAt: string | null;
  readonly createdAt: string;
  readonly updatedAt: string;
}

export interface XCaptureSpecialFavorite {
  readonly id: string;
  readonly userId: string;
  readonly postUrl: string;
  readonly postId: string | null;
  readonly authorHandle: string | null;
  readonly pageTitle: string | null;
  readonly note: string | null;
  readonly tags: readonly string[];
  readonly sourceEventId: string;
  readonly createdAt: string;
  readonly updatedAt: string;
}

/** Canonical owner-scoped private library record.  The legacy
 * XCaptureSpecialFavorite shape remains available for compatibility, but new
 * code must use this independent model so library state is never coupled to
 * like/bookmark state. */
export interface XCapturePrivateLibraryItem {
  readonly id: string;
  readonly ownerId: string;
  readonly userId: string;
  readonly sourceType: 'X_POST' | 'WATCH_ITEM' | 'MOVIE' | 'VIDEO' | 'WEBPAGE' | 'ARTICLE' | 'CODE';
  readonly sourcePlatform: 'X' | 'WATCH' | 'YOUTUBE' | 'BILIBILI' | 'OTHER';
  readonly sourceId: string;
  readonly sourceUrl: string;
  readonly title: string | null;
  readonly content: string | null;
  readonly authorName: string | null;
  readonly authorHandle: string | null;
  readonly authorAvatar: string | null;
  readonly media: readonly JsonObject[];
  readonly thumbnail: string | null;
  readonly publishedAt: string | null;
  readonly savedAt: string;
  readonly createdAt: string;
  readonly updatedAt: string;
  readonly tags: readonly string[];
  readonly note: string | null;
  readonly collectionId: string | null;
  readonly privacy: 'PRIVATE';
  readonly metadata: JsonObject;
}

export const resourceTypes = ['WEBPAGE', 'ARTICLE', 'CODE', 'X_LINK'] as const;
export type ResourceType = (typeof resourceTypes)[number];
export const resourceStatuses = ['IN_PROGRESS', 'COMPLETED'] as const;
export type ResourceStatus = (typeof resourceStatuses)[number];

/** Owner-scoped progress record for non-video resources. It is intentionally
 * separate from WatchRecord because a page/article/code item has no media
 * playback clock. */
export interface ResourceRecord {
  readonly id: string;
  readonly ownerId: string;
  readonly resourceType: ResourceType;
  readonly title: string;
  readonly platform: string;
  readonly author: string | null;
  readonly description: string | null;
  readonly url: string;
  readonly canonicalUrl: string;
  readonly currentProgressPercent: number;
  readonly status: ResourceStatus;
  readonly liked: boolean;
  readonly bookmarked: boolean;
  readonly note: string | null;
  readonly tags: readonly string[];
  /** These timestamps are written only when ME.zip explicitly opens the
   * original resource. Saving a URL alone is not a reading event. */
  readonly firstOpenedAt: string | null;
  readonly lastOpenedAt: string | null;
  readonly openCount: number;
  readonly createdAt: string;
  readonly updatedAt: string;
  readonly privacy: 'PRIVATE';
  readonly metadata: JsonObject;
}

/** A transparent, owner-scoped history entry for an explicit ME.zip open.
 * It deliberately does not claim that the external page was read for a
 * particular duration: a web page cannot truthfully provide that without a
 * dedicated page-level capture adapter. */
export interface ResourceOpenSession {
  readonly id: string;
  readonly ownerId: string;
  readonly resourceRecordId: string;
  readonly source: 'MEZIP_READING_HISTORY' | 'X_LINK_COLLECTION';
  readonly openedAt: string;
  readonly idempotencyKey: string | null;
  readonly createdAt: string;
}

/** Owner-scoped folder used only by the canonical private library. */
export interface XCapturePrivateLibraryCollection {
  readonly id: string;
  readonly ownerId: string;
  readonly name: string;
  readonly description: string | null;
  readonly icon: string | null;
  readonly createdAt: string;
  readonly updatedAt: string;
}

export interface XCaptureSettings {
  readonly userId: string;
  readonly enabled: boolean;
  readonly captureLikes: boolean;
  readonly captureBookmarks: boolean;
  readonly captureViews: boolean;
  readonly captureSharedLinks: boolean;
  readonly watchCapture: boolean;
  readonly savePageMetadata: boolean;
  readonly autoSync: boolean;
  readonly updatedAt: string;
}

export interface XCaptureTimelineQuery {
  readonly actionType?: XCaptureActionType;
  readonly from?: string;
  readonly to?: string;
  readonly query?: string;
  readonly limit?: number;
  readonly cursor?: string;
}

export interface XCaptureTimelinePage {
  readonly events: readonly XCaptureEvent[];
  readonly content: readonly XCaptureContentCache[];
  readonly nextCursor: string | null;
}

export interface XCaptureStats {
  readonly today: Readonly<Record<XCaptureActionType, number>>;
  readonly week: Readonly<Record<XCaptureActionType, number>>;
  readonly total: Readonly<Record<XCaptureActionType, number>>;
  readonly lastCaptureAt: string | null;
  readonly localCaptureActive: boolean;
  readonly officialApiStatus: 'CONNECTED' | 'CREDITS_UNAVAILABLE' | 'NOT_CONNECTED' | 'UNKNOWN';
}

export const watchContentTypes = ['MOVIE', 'EPISODE', 'LONG_VIDEO', 'VIDEO', 'SHORT_VIDEO', 'OTHER_VIDEO'] as const;
export type WatchContentType = (typeof watchContentTypes)[number];

export const watchStatuses = ['STARTED', 'IN_PROGRESS', 'COMPLETED'] as const;
export type WatchStatus = (typeof watchStatuses)[number];

/** Owner-scoped record of a video that actually produced playback time. */
export interface WatchRecord {
  readonly id: string;
  readonly ownerId: string;
  readonly contentKey: string;
  readonly contentType: WatchContentType;
  readonly platform: string;
  readonly domain: string;
  readonly videoId: string | null;
  readonly title: string;
  readonly subtitle: string | null;
  readonly creator: string | null;
  readonly url: string;
  readonly canonicalUrl: string;
  readonly thumbnail: string | null;
  readonly poster: string | null;
  readonly durationSeconds: number;
  readonly currentTimeSeconds: number;
  readonly progressPercent: number;
  readonly status: WatchStatus;
  readonly firstWatchedAt: string;
  readonly lastWatchedAt: string;
  readonly totalWatchSeconds: number;
  readonly watchCount: number;
  readonly metadata: JsonObject;
  readonly privacy: 'PRIVATE';
  readonly createdAt: string;
  readonly updatedAt: string;
}

export interface WatchSession {
  readonly id: string;
  readonly watchRecordId: string;
  readonly ownerId: string;
  readonly startedAt: string;
  readonly endedAt: string | null;
  readonly startPositionSeconds: number;
  readonly endPositionSeconds: number;
  readonly actualPlayedSeconds: number;
  readonly createdAt: string;
}
