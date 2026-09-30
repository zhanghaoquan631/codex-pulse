/**
 * Cross-client foundation shared by Web, Mini Program and native companions.
 *
 * These contracts deliberately describe capability and security state, not a
 * UI promise. A client must present an unavailable state when a capability is
 * not configured instead of turning a local placeholder into a success state.
 */
export const mezipClientPlatforms = [
  'WEB_DESKTOP',
  'MOBILE_WEB',
  'WECHAT_MINI_PROGRAM',
  'IOS',
  'ANDROID_FUTURE',
] as const;
export type MezipClientPlatform = (typeof mezipClientPlatforms)[number];

export const platformCapabilityStatuses = [
  'FULL',
  'PARTIAL',
  'READ_ONLY',
  'FALLBACK',
  'NOT_SUPPORTED',
  'PRODUCTION_PENDING',
] as const;
export type PlatformCapabilityStatus = (typeof platformCapabilityStatuses)[number];

export const platformFeatures = [
  'AUTH',
  'PROFILE',
  'LIFE',
  'TIMELINE',
  'HISTORY',
  'FITNESS',
  'DAILY_PACK',
  'SEARCH',
  'EXPORT',
  'COMMUNITY',
  'SOCIAL',
  'MESSAGING',
  'MEMBERSHIP',
  'BENEFITS',
  'CREATOR_LAB',
  'CONNECTED_APPS',
  'BILLING_HISTORY',
  'CREATOR_REVEAL',
  'DEEP_LINKS',
  'NOTIFICATIONS',
  'MEDIA_PICKER',
  'OFFLINE_DRAFTS',
] as const;
export type PlatformFeature = (typeof platformFeatures)[number];

export interface PlatformCapability {
  readonly platform: MezipClientPlatform;
  readonly feature: PlatformFeature;
  readonly status: PlatformCapabilityStatus;
  /** User-facing copy explaining a fallback or a pending external setup. */
  readonly message: string;
  /** An internal client route only; never a third-party unverified URL. */
  readonly fallbackRoute?: string;
}

function capabilityKey(platform: MezipClientPlatform, feature: PlatformFeature): string {
  return `${platform}:${feature}`;
}

/**
 * One capability registry for all client shells. Missing entries are fail
 * closed instead of becoming an enabled button by default.
 */
export class PlatformCapabilityRegistry {
  private readonly entries = new Map<string, PlatformCapability>();

  constructor(capabilities: readonly PlatformCapability[]) {
    for (const capability of capabilities) {
      const key = capabilityKey(capability.platform, capability.feature);
      if (this.entries.has(key)) throw new Error(`Duplicate platform capability: ${key}`);
      this.entries.set(key, capability);
    }
  }

  get(platform: MezipClientPlatform, feature: PlatformFeature): PlatformCapability {
    return this.entries.get(capabilityKey(platform, feature)) ?? {
      platform,
      feature,
      status: 'NOT_SUPPORTED',
      message: '此客户端尚不支持该功能。',
    };
  }

  canUse(
    platform: MezipClientPlatform,
    feature: PlatformFeature,
    intent: PlatformCapabilityIntent,
  ): boolean {
    return canUsePlatformCapability(this.get(platform, feature), intent);
  }
}

export type PlatformCapabilityIntent = 'READ' | 'WRITE';

/** A READ_ONLY feature can be opened, but mutations must remain disabled. */
export function canUsePlatformCapability(
  capability: Pick<PlatformCapability, 'status'>,
  intent: PlatformCapabilityIntent,
): boolean {
  switch (capability.status) {
    case 'FULL':
    case 'PARTIAL':
    case 'FALLBACK':
      return true;
    case 'READ_ONLY':
      return intent === 'READ';
    case 'NOT_SUPPORTED':
    case 'PRODUCTION_PENDING':
      return false;
  }
}

export const clientErrorCodes = [
  'UNAUTHORIZED',
  'FORBIDDEN',
  'NOT_FOUND',
  'CONFLICT',
  'RATE_LIMITED',
  'OFFLINE',
  'VALIDATION_ERROR',
  'PROVIDER_UNAVAILABLE',
  'ENTITLEMENT_REQUIRED',
  'PRODUCTION_PENDING',
  'SERVER_ERROR',
  'UNKNOWN',
] as const;
export type ClientErrorCode = (typeof clientErrorCodes)[number];

export interface ClientErrorState {
  readonly code: ClientErrorCode;
  readonly message: string;
  readonly retryable: boolean;
}

/** Operations allowed to remain in a local draft queue while offline. */
export const offlineDraftOperationKinds = [
  'LIFE_DRAFT',
  'SOCIAL_POST_DRAFT',
  'MESSAGE_DRAFT',
  'CREATOR_DRAFT',
] as const;
export type OfflineDraftOperationKind = (typeof offlineDraftOperationKinds)[number];

export function isOfflineQueueableOperation(value: string): value is OfflineDraftOperationKind {
  return (offlineDraftOperationKinds as readonly string[]).includes(value);
}

export const deepLinkTargetKinds = [
  'PROFILE',
  'POST',
  'PROJECT',
  'CONVERSATION',
  'ACTIVITY',
  'MEMBERSHIP',
  'BENEFIT',
  'CREATOR',
  'EXTERNAL_IDENTITY',
] as const;
export type DeepLinkTargetKind = (typeof deepLinkTargetKinds)[number];

export interface MezipDeepLinkTarget {
  readonly kind: DeepLinkTargetKind;
  /** An opaque resource ID. Clients must still authorize it on the server. */
  readonly resourceId?: string;
}

const opaqueIdPattern = /^[A-Za-z0-9][A-Za-z0-9_-]{0,127}$/;

function target(kind: DeepLinkTargetKind, resourceId?: string): MezipDeepLinkTarget | undefined {
  if (resourceId !== undefined && !opaqueIdPattern.test(resourceId)) return undefined;
  return resourceId === undefined ? { kind } : { kind, resourceId };
}

/**
 * Parses only authenticated, canonical HTTPS product URLs. It intentionally
 * accepts no owner/user/root query parameter and cannot grant access itself.
 */
export function parseMezipDeepLink(
  rawUrl: string,
  trustedOrigin: string,
): MezipDeepLinkTarget | undefined {
  let url: URL;
  let origin: URL;
  try {
    url = new URL(rawUrl);
    origin = new URL(trustedOrigin);
  } catch {
    return undefined;
  }
  if (url.protocol !== 'https:' || origin.protocol !== 'https:' || url.origin !== origin.origin) {
    return undefined;
  }
  if (url.search || url.hash) return undefined;

  const segments = url.pathname.split('/').filter(Boolean);
  if (segments.length === 1 && segments[0] === 'membership') return target('MEMBERSHIP');
  if (segments.length === 1 && segments[0] === 'creator') return target('CREATOR');
  if (segments.length === 2 && segments[0] === 'profile') return target('PROFILE', segments[1]);
  if (segments.length === 3 && segments[0] === 'social' && segments[1] === 'post') {
    return target('POST', segments[2]);
  }
  if (segments.length === 3 && segments[0] === 'creator' && segments[1] === 'project') {
    return target('PROJECT', segments[2]);
  }
  if (segments.length === 3 && segments[0] === 'messages' && segments[1] === 'conversation') {
    return target('CONVERSATION', segments[2]);
  }
  if (segments.length === 2 && segments[0] === 'activities') return target('ACTIVITY', segments[1]);
  if (segments.length === 2 && segments[0] === 'benefits') return target('BENEFIT', segments[1]);
  if (segments.length === 2 && segments[0] === 'connected-apps') {
    return target('EXTERNAL_IDENTITY', segments[1]);
  }
  return undefined;
}

/**
 * A cache key is always scoped by a server-derived session subject. Keeping
 * the subject out of the suffix prevents feature code from sharing a cache
 * accidentally after logout or an account switch.
 */
export function accountScopedCacheKey(namespace: string, sessionSubject: string): string {
  const trimmedNamespace = namespace.trim();
  const trimmedSubject = sessionSubject.trim();
  if (!/^[a-z][a-z0-9._-]{1,80}$/i.test(trimmedNamespace)) {
    throw new Error('Platform cache namespace is invalid.');
  }
  if (!opaqueIdPattern.test(trimmedSubject)) {
    throw new Error('A server-derived session subject is required for a client cache.');
  }
  return `mezip.${trimmedNamespace}.v1.${trimmedSubject}`;
}

export const notificationPreferenceKinds = [
  'MESSAGES',
  'REPLIES',
  'MENTIONS',
  'FOLLOWERS',
  'PROJECTS',
  'BENEFITS',
  'FOUNDER',
] as const;
export type NotificationPreferenceKind = (typeof notificationPreferenceKinds)[number];

export const notificationDeliveryChannels = ['IN_APP', 'WEB', 'WECHAT', 'IOS'] as const;
export type NotificationDeliveryChannel = (typeof notificationDeliveryChannels)[number];
