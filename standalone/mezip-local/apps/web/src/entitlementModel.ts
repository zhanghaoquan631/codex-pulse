/**
 * Presentation-side entitlement seam.
 *
 * The server is authoritative in production. This file intentionally offers a
 * clearly named development provider so route shells can exercise the same
 * capability vocabulary without inferring access from a local plan string.
 */

export const membershipPlanCodes = ['FREE', 'GO', 'PLUS', 'PRO', 'PRO_MAX'] as const;
export type MembershipPlanCode = (typeof membershipPlanCodes)[number];

export const entitlementCapabilities = [
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
  'COMMUNITY_INTERACT',
  'COMMUNITY_PUBLISH',
  'COMMUNITY_FOLLOW',
  'COMMUNITY_SAVE',
  'COMMUNITY_POST',
  'COMMUNITY_COMMENT',
  'COMMUNITY_GROUP',
  'GROUP_JOIN',
  'GROUP_CREATE',
  'ACTIVITY_JOIN',
  'FOUNDER_DM',
  'FOUNDER_PRIORITY_INBOX',
  'FOUNDER_PRO_FEED',
  'VIBE_CODING',
  'CODE_HUB',
  'SOURCE_DOWNLOAD',
  'RELEASE_DOWNLOAD',
  'ADVANCED_ANALYTICS',
  'MEDIA_STORAGE_PLUS',
] as const;
export type EntitlementCapability = (typeof entitlementCapabilities)[number];

export interface MembershipPlanPresentation {
  readonly code: MembershipPlanCode;
  readonly label: string;
  /** Integer CNY fen. Never use a float as a money value. */
  readonly amountFen: number;
  readonly priceLabel: string;
  readonly summary: string;
  readonly additions: readonly string[];
  readonly featured?: boolean;
}

export interface MembershipSnapshot {
  readonly currentPlan: MembershipPlanCode;
  readonly plans: readonly MembershipPlanPresentation[];
  readonly source: 'MOCK_DEV' | 'SERVER';
}

export interface EntitlementDecision {
  readonly capability: EntitlementCapability;
  readonly allowed: boolean;
  readonly source: 'MOCK_DEV' | 'SERVER';
  readonly explanation: string;
  readonly expiresAt: string | null;
}

/** A production implementation must query a server-confirmed decision. */
export interface EntitlementProvider {
  getMembership(): Promise<MembershipSnapshot>;
  resolve(capability: EntitlementCapability): Promise<EntitlementDecision>;
}

export const membershipPlans: readonly MembershipPlanPresentation[] = [
  {
    code: 'FREE',
    label: 'FREE',
    amountFen: 0,
    priceLabel: '¥0',
    summary: '建立和记录自己的 ME.zip',
    additions: ['私人 Life Archive', 'Timeline、基础媒体与导出', '浏览公开 Community'],
  },
  {
    code: 'GO',
    label: 'GO · 社区通行证',
    amountFen: 1_000,
    priceLabel: '¥10/月',
    summary: 'FREE + 完整社区互动',
    additions: ['发布、评论与收藏', '加入普通社群'],
  },
  {
    code: 'PLUS',
    label: 'PLUS · 深度交流',
    amountFen: 2_000,
    priceLabel: '¥20/月',
    summary: 'GO + Founder Inbox',
    additions: ['Founder DM', 'PLUS 专属权益'],
  },
  {
    code: 'PRO',
    label: 'PRO · 创始人圈层',
    amountFen: 4_000,
    priceLabel: '¥40/月',
    summary: 'PLUS + 深度圈层权益',
    additions: ['Founder PRO Feed', '优先 Founder Inbox', 'Founder Circle'],
  },
  {
    code: 'PRO_MAX',
    label: 'PRO MAX · 创作者实验室',
    amountFen: 8_000,
    priceLabel: '¥80/月',
    summary: 'PRO + 创作与精选内容',
    additions: [
      'Vibe Coding 与 Code Hub',
      'Source / Release',
      'Founder 精选 X / 抖音内容',
    ],
    featured: true,
  },
] as const;

const planCapabilityAdditions: Readonly<
  Record<MembershipPlanCode, readonly EntitlementCapability[]>
> = {
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
    // Legacy aliases remain for existing presentation gates; new routes use
    // the granular server capability names below.
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
  PLUS: ['FOUNDER_DM'],
  PRO: ['FOUNDER_PRIORITY_INBOX', 'FOUNDER_PRO_FEED'],
  PRO_MAX: [
    'VIBE_CODING',
    'CODE_HUB',
    'SOURCE_DOWNLOAD',
    'RELEASE_DOWNLOAD',
    'ADVANCED_ANALYTICS',
    'MEDIA_STORAGE_PLUS',
  ],
};

function capabilitiesFor(plan: MembershipPlanCode): ReadonlySet<EntitlementCapability> {
  const capabilities = new Set<EntitlementCapability>();
  for (const code of membershipPlanCodes) {
    for (const capability of planCapabilityAdditions[code]) {
      capabilities.add(capability);
    }
    if (code === plan) break;
  }
  return capabilities;
}

/**
 * Development-only provider. It has no credential, payment, or ownership
 * authority and is deliberately instantiated explicitly by the UI.
 */
export class MockDevEntitlementProvider implements EntitlementProvider {
  readonly #granted: ReadonlySet<EntitlementCapability>;

  constructor(private readonly currentPlan: MembershipPlanCode = 'FREE') {
    this.#granted = capabilitiesFor(currentPlan);
  }

  async getMembership(): Promise<MembershipSnapshot> {
    return {
      currentPlan: this.currentPlan,
      plans: membershipPlans,
      source: 'MOCK_DEV',
    };
  }

  async resolve(capability: EntitlementCapability): Promise<EntitlementDecision> {
    const allowed = this.#granted.has(capability);
    return {
      capability,
      allowed,
      source: 'MOCK_DEV',
      explanation: allowed
        ? '本地开发预览：能力由 Mock/Dev Provider 解析。'
        : '当前本地预览未授予此能力；生产环境将以服务端决策为准。',
      expiresAt: null,
    };
  }
}

export function planByCode(code: MembershipPlanCode): MembershipPlanPresentation {
  const plan = membershipPlans.find((candidate) => candidate.code === code);
  if (plan === undefined) {
    throw new Error(`Unknown ME.zip plan: ${code}`);
  }
  return plan;
}
