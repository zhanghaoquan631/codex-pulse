export interface DouyinConnectorContract {
  readonly status: 'UNVERIFIED' | 'DISCONNECTED' | 'CONNECTED';
  readonly fallback: 'SHARE_LINK' | 'MANUAL_ADD' | 'MANUAL_CURATE';
}

export const douyinProviderCode = 'DOUYIN' as const;
export const douyinOfficialCapabilityStatus = 'NOT_VERIFIED' as const;
export const douyinSupportedBoundary = Object.freeze({
  profileRead: 'NOT_VERIFIED',
  postRead: 'NOT_VERIFIED',
  mediaRead: 'NOT_VERIFIED',
  publish: 'NOT_VERIFIED',
  likesRead: 'UNSUPPORTED',
  favoritesRead: 'UNSUPPORTED',
} as const);

export const douyinConnectorImplementationGate =
  'Read current official Douyin open platform and OAuth documentation before implementation; never reverse engineer.';
