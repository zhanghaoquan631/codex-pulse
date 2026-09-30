import type {
  ApiResponse,
  PortableAnnualArchive,
  PortableArchiveBackup,
  PortableArchiveDownload,
  PortableArchiveExportJob,
  PortableArchiveExportRequest,
  PortableArchiveImportJob,
  PortableArchiveImportPreview,
  PortableArchiveImportRequest,
  PortableLegacyPlan,
  PortableLegacyPolicy,
  PortableLegacyRecipient,
  AiGatewayByokEncryptedEnvelope,
  AiGatewayByokProviderStatus,
  AiGatewayCapabilityCode,
  AiGatewayCapabilityRegistryEntry,
  AiGatewayConversation,
  AiGatewayConversationPage,
  AiGatewayInvocation,
  AiGatewayInvocationEventPage,
  AiGatewayInvocationMessage,
  AiGatewayInvocationPage,
  AiGatewayModelRegistryEntry,
  AiGatewayPreferences,
  AiGatewayProviderCode,
  AiGatewayProviderRegistryEntry,
  AiGatewayQuota,
  AiGatewayStreamHandshake,
  AiUsageAppCode,
  AiUsageAppRegistryEntry,
  AiUsageDevice,
  AiUsageDeviceType,
  AiUsageExport,
  AiUsageOverview,
  AiUsagePairing,
  AiUsagePairingStart,
  AiUsageProviderRegistryEntry,
  AiUsageRangeDeleteResult,
  AiUsageSession,
  AiUsageTrackingPreferences,
  CommunityActivity,
  CommunityActivityKind,
  CommunityActivityRegistration,
  CommunityChannel,
  CommunityChannelMembership,
  CommunityComment,
  CommunityCursorPage,
  CommunityFeedItem,
  CommunityFeedMode,
  CommunityFeedPage,
  CommunityGroup,
  CommunityGroupMembership,
  CommunityNotification,
  CommunityPost,
  CommunityProfile,
  CommunitySnapshotPublication,
  CommunityReaction,
  CommunityRepostAttribution,
  CommunityReport,
  CommunityReportReason,
  CommunityReportTargetType,
  CommunitySearchResult,
  CommunityVisibility,
  CreatorAIChangeSet,
  CreatorGitCommit,
  CreatorGitHubAuthorizationStart,
  CreatorGitHubConnection,
  CreatorHome,
  CreatorGitStatus,
  CreatorProject,
  CreatorProjectDetail,
  CreatorProjectDownloadGrant,
  CreatorProjectExport,
  CreatorProjectMedia,
  CreatorProjectMetadata,
  CreatorProjectPage,
  CreatorProjectSourceFile,
  CreatorProjectStats,
  CreatorProfile,
  CreatorPublicProfile,
  CreatorPublishedProjectSnapshot,
  CreatorRelease,
  CreatorReleaseAsset,
  CreatorWorkspaceDiff,
  CreatorWorkspaceFile,
  CreatorWorkspaceFileView,
  CreatorWorkspaceSnapshot,
  FounderAudience,
  MessagingConversationMember,
  MessagingConversationSummary,
  MessagingCursorPage,
  MessagingDraft,
  MessagingMessageView,
  MessagingPresence,
  MessagingReaction,
  MessagingRealtimeFallback,
  MessagingRealtimeHandshake,
  MessagingRealtimeTransport,
  MessagingReactionType,
  MessagingReport,
  MessagingReportReason,
  MessagingSearchResult,
  MessagingUnreadSummary,
  MessagingUserSettings,
  MembershipBenefitGrant,
  MembershipCenter,
  MembershipCampaign,
  MembershipCampaignClaim,
  MembershipCheckout,
  MembershipCoupon,
  MembershipHistoryEvent,
  MembershipOrder,
  MembershipPaymentProviderAvailability,
  MembershipPlan,
  MembershipRedemption,
  MembershipRefund,
  ModerationActionType,
  PaymentProviderCode,
  PlanCode,
  PersonalAIConsent,
  PersonalAIConversation,
  PersonalAICitationPage,
  PersonalAIContextScope,
  PersonalAIDateRange,
  PersonalAIExportPage,
  PersonalAIExportRequest,
  PersonalAIExportStatusView,
  PersonalAIIndexJob,
  PersonalAIIndexStatusView,
  PersonalAIKnowledgeSource,
  PersonalAIKnowledgeSourceType,
  PersonalAIPrivacyView,
  PersonalAIPreferences,
  PersonalAIQueryInput,
  PersonalAIQueryPage,
  PersonalAIQueryResult,
  ExternalSocialAccount,
  SocialArchiveItem,
  SocialArchivePage,
  SocialArchiveQuery,
  SocialCollection,
  SocialConnectorCapabilityView,
  SocialConnectorProviderCode,
  SocialImportJob,
  SocialProviderSummary,
  SocialPublication,
  SocialExternalPublication,
  SocialSyncStatus,
  ExternalAppLaunchPlan,
  ExternalIdentity,
  ExternalIdentityConnection,
  ExternalIdentityOAuthStart,
  ExternalIdentityProviderCode,
  ExternalIdentityProviderInfo,
  PublicExternalIdentity,
} from '@me-zip/shared-types';
import type {
  CustomDomain,
  Deployment,
  DeploymentEnvironment,
  DeploymentHealthCheck,
  DeploymentLogPage,
  DeploymentPage,
  DeploymentProviderCode,
  DeploymentSourceType,
  DeploymentUsage,
  DeploymentEnvironmentConfig,
  DeploymentSecretMetadata,
  PreviewShare,
  ProjectPublication,
  ProjectPublishSettings,
} from '@me-zip/shared-types';
import type {
  SandboxPreview,
  SandboxRuntime,
  SandboxRuntimeArtifact,
  SandboxRuntimeEnvironmentVariable,
  SandboxRuntimeLog,
  SandboxRuntimeLogPage,
  SandboxRuntimePage,
  SandboxRuntimeProblemPage,
  SandboxRuntimePort,
  SandboxRuntimeTask,
  SandboxRuntimeTaskPage,
  SandboxRuntimeTaskType,
  SandboxRuntimeUsage,
  SandboxRuntimeTokenMetadata,
  SandboxTerminalSession,
  SandboxTerminalSessionPage,
  SandboxWorkspaceChange,
} from '@me-zip/shared-types';

export interface MeZipSdkTransport {
  request<T>(input: {
    /** The transport owns credentials/session headers; callers never pass a principal or plan. */
    method: 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE';
    path: string;
    body?: unknown;
    query?: Readonly<Record<string, string | number | boolean | undefined>>;
    idempotencyKey?: string;
  }): Promise<ApiResponse<T>>;
}

export interface SocialOAuthStartInput {
  readonly provider: 'X' | 'DOUYIN';
  readonly redirectUri: string;
  readonly consentVersion: string;
  readonly requestedScopes: readonly string[];
  readonly codeChallenge?: string;
}

export interface SocialOAuthCallbackInput {
  readonly provider: 'X' | 'DOUYIN';
  readonly state: string;
  readonly code: string;
  readonly redirectUri: string;
  readonly codeVerifier?: string;
}

export interface SocialSdk {
  listProviders(): Promise<ApiResponse<readonly SocialProviderSummary[]>>;
  listCapabilities(provider: SocialConnectorProviderCode): Promise<ApiResponse<readonly SocialConnectorCapabilityView[]>>;
  startOAuth(input: SocialOAuthStartInput): Promise<ApiResponse<unknown>>;
  completeOAuth(input: SocialOAuthCallbackInput): Promise<ApiResponse<ExternalSocialAccount>>;
  listAccounts(): Promise<ApiResponse<readonly ExternalSocialAccount[]>>;
  disconnectAccount(accountId: string): Promise<ApiResponse<ExternalSocialAccount>>;
  updateAccountSettings(accountId: string, input: { readonly requestedScopes?: readonly string[]; readonly autoSync?: boolean }): Promise<ApiResponse<ExternalSocialAccount>>;
  refreshAccount(accountId: string): Promise<ApiResponse<ExternalSocialAccount>>;
  syncAccount(accountId: string, idempotencyKey?: string): Promise<ApiResponse<SocialImportJob>>;
  getSyncStatus(accountId: string): Promise<ApiResponse<SocialSyncStatus>>;
  listImportJobs(accountId?: string): Promise<ApiResponse<readonly SocialImportJob[]>>;
  getImportJob(jobId: string): Promise<ApiResponse<SocialImportJob>>;
  cancelImportJob(jobId: string): Promise<ApiResponse<SocialImportJob>>;
  listArchive(query?: SocialArchiveQuery): Promise<ApiResponse<SocialArchivePage>>;
  getArchiveItem(itemId: string): Promise<ApiResponse<SocialArchiveItem>>;
  saveManualLink(input: { readonly url: string; readonly note?: string | null; readonly tags?: readonly string[]; readonly collectionIds?: readonly string[]; readonly visibility?: 'PRIVATE' | 'COMMUNITY' | 'GROUP' | 'PUBLIC' }, idempotencyKey?: string): Promise<ApiResponse<SocialArchiveItem>>;
  updateArchiveItem(itemId: string, input: { readonly note?: string | null; readonly tags?: readonly string[]; readonly collectionIds?: readonly string[] }): Promise<ApiResponse<SocialArchiveItem>>;
  deleteArchiveItem(itemId: string): Promise<ApiResponse<{ readonly deleted: boolean }>>;
  deleteImportedData(input: { readonly provider?: SocialConnectorProviderCode; readonly accountId?: string; readonly from?: string; readonly to?: string }): Promise<ApiResponse<{ readonly deleted: number }>>;
  listCollections(): Promise<ApiResponse<readonly SocialCollection[]>>;
  createCollection(input: { readonly name: string; readonly description?: string | null; readonly visibility?: 'PRIVATE' | 'PUBLIC' }): Promise<ApiResponse<SocialCollection>>;
  updateCollection(collectionId: string, input: { readonly name?: string; readonly description?: string | null; readonly visibility?: 'PRIVATE' | 'PUBLIC' }): Promise<ApiResponse<SocialCollection>>;
  addToCollection(collectionId: string, archiveItemId: string): Promise<ApiResponse<SocialCollection>>;
  removeFromCollection(collectionId: string, archiveItemId: string): Promise<ApiResponse<SocialCollection>>;
  publishSnapshot(itemId: string, input: { readonly target: 'COMMUNITY' | 'GROUP' | 'PROFILE' | 'PUBLIC'; readonly visibility: 'COMMUNITY' | 'GROUP' | 'PUBLIC'; readonly groupId?: string }): Promise<ApiResponse<SocialPublication>>;
  publishExternal(itemId: string, input: { readonly accountId: string; readonly visibility?: 'PUBLIC' | 'UNLISTED'; readonly text?: string; readonly mediaIds?: readonly string[] }): Promise<ApiResponse<SocialExternalPublication>>;
  listFounderFeed(): Promise<ApiResponse<SocialArchivePage>>;
  curateFounder(input: { readonly archiveItemId: string; readonly audience: 'PUBLIC' | 'FREE' | 'GO' | 'PLUS' | 'PRO' | 'PRO_MAX' }): Promise<ApiResponse<SocialArchiveItem>>;
}

export interface PortableArchiveSdk {
  listExports(): Promise<ApiResponse<readonly PortableArchiveExportJob[]>>;
  createExport(input: PortableArchiveExportRequest): Promise<ApiResponse<PortableArchiveExportJob>>;
  getExport(jobId: string): Promise<ApiResponse<PortableArchiveExportJob>>;
  cancelExport(jobId: string): Promise<ApiResponse<PortableArchiveExportJob>>;
  getDownload(jobId: string, token?: string): Promise<ApiResponse<PortableArchiveDownload>>;
  downloadBytes(jobId: string, token: string): Promise<ApiResponse<{ readonly archiveBase64: string }>>;
  verifyArchive(archiveBase64: string, password?: string): Promise<ApiResponse<PortableArchiveImportPreview>>;
  previewImport(archiveBase64: string, input?: PortableArchiveImportRequest): Promise<ApiResponse<PortableArchiveImportPreview>>;
  restoreImport(importId: string, archiveBase64: string, input?: PortableArchiveImportRequest): Promise<ApiResponse<PortableArchiveImportJob>>;
  getImport(importId: string): Promise<ApiResponse<PortableArchiveImportJob>>;
  listBackups(): Promise<ApiResponse<readonly PortableArchiveBackup[]>>;
  createBackup(input: PortableArchiveExportRequest): Promise<ApiResponse<PortableArchiveBackup>>;
  getAnnualArchive(year: number): Promise<ApiResponse<PortableAnnualArchive>>;
  getLegacyPlan(): Promise<ApiResponse<PortableLegacyPlan>>;
  updateLegacyPlan(input: Partial<Pick<PortableLegacyPlan, 'scope' | 'status'>>): Promise<ApiResponse<PortableLegacyPlan>>;
  listLegacyRecipients(): Promise<ApiResponse<readonly PortableLegacyRecipient[]>>;
  addLegacyRecipient(input: { readonly displayName: string; readonly contactReference: string }): Promise<ApiResponse<PortableLegacyRecipient>>;
  removeLegacyRecipient(recipientId: string): Promise<ApiResponse<unknown>>;
  getLegacyPolicy(): Promise<ApiResponse<PortableLegacyPolicy>>;
}

export function createPortableArchiveSdk(transport: MeZipSdkTransport): PortableArchiveSdk {
  const id = encodeURIComponent;
  return {
    listExports: () => transport.request({ method: 'GET', path: '/v1/archive/exports' }),
    createExport: (body) => transport.request({ method: 'POST', path: '/v1/archive/exports', body }),
    getExport: (jobId) => transport.request({ method: 'GET', path: `/v1/archive/exports/${id(jobId)}` }),
    cancelExport: (jobId) => transport.request({ method: 'POST', path: `/v1/archive/exports/${id(jobId)}/cancel`, body: {} }),
    getDownload: (jobId, token) => transport.request({ method: 'GET', path: `/v1/archive/exports/${id(jobId)}/download`, ...(token === undefined ? {} : { body: { token } }) }),
    downloadBytes: (jobId, token) => transport.request({ method: 'GET', path: `/v1/archive/exports/${id(jobId)}/bytes`, body: { token } }),
    verifyArchive: (archiveBase64, password) => transport.request({ method: 'POST', path: '/v1/archive/verify', body: { archiveBase64, ...(password === undefined ? {} : { password }) } }),
    previewImport: (archiveBase64, body = {}) => transport.request({ method: 'POST', path: '/v1/archive/imports', body: { archiveBase64, ...body } }),
    restoreImport: (importId, archiveBase64, body = {}) => transport.request({ method: 'POST', path: `/v1/archive/imports/${id(importId)}/restore`, body: { archiveBase64, ...body } }),
    getImport: (importId) => transport.request({ method: 'GET', path: `/v1/archive/imports/${id(importId)}` }),
    listBackups: () => transport.request({ method: 'GET', path: '/v1/archive/backups' }),
    createBackup: (body) => transport.request({ method: 'POST', path: '/v1/archive/backups', body }),
    getAnnualArchive: (year) => transport.request({ method: 'GET', path: `/v1/archive/annual/${year}` }),
    getLegacyPlan: () => transport.request({ method: 'GET', path: '/v1/archive/legacy/plan' }),
    updateLegacyPlan: (body) => transport.request({ method: 'PATCH', path: '/v1/archive/legacy/plan', body }),
    listLegacyRecipients: () => transport.request({ method: 'GET', path: '/v1/archive/legacy/recipients' }),
    addLegacyRecipient: (body) => transport.request({ method: 'POST', path: '/v1/archive/legacy/recipients', body }),
    removeLegacyRecipient: (recipientId) => transport.request({ method: 'DELETE', path: `/v1/archive/legacy/recipients/${id(recipientId)}` }),
    getLegacyPolicy: () => transport.request({ method: 'GET', path: '/v1/archive/legacy/policy' }),
  };
}

export function createSocialSdk(transport: MeZipSdkTransport): SocialSdk {
  const id = encodeURIComponent;
  const accountPath = (accountId: string) => `/v1/social/accounts/${id(accountId)}`;
  const archivePath = (itemId: string) => `/v1/social/archive/${id(itemId)}`;
  const collectionPath = (collectionId: string) => `/v1/social/collections/${id(collectionId)}`;
  return {
    listProviders: () => transport.request({ method: 'GET', path: '/v1/social/providers' }),
    listCapabilities: (provider) => transport.request({ method: 'GET', path: `/v1/social/providers/${id(provider)}/capabilities` }),
    startOAuth: (body) => transport.request({ method: 'POST', path: '/v1/social/oauth/start', body }),
    completeOAuth: (body) => transport.request({ method: 'POST', path: '/v1/social/oauth/callback', body }),
    listAccounts: () => transport.request({ method: 'GET', path: '/v1/social/accounts' }),
    disconnectAccount: (accountId) => transport.request({ method: 'POST', path: `${accountPath(accountId)}/disconnect`, body: {} }),
    updateAccountSettings: (accountId, body) => transport.request({ method: 'PATCH', path: `${accountPath(accountId)}/settings`, body }),
    refreshAccount: (accountId) => transport.request({ method: 'POST', path: `${accountPath(accountId)}/refresh`, body: {} }),
    syncAccount: (accountId, idempotencyKey) => transport.request({ method: 'POST', path: `${accountPath(accountId)}/sync`, body: {}, ...(idempotencyKey === undefined ? {} : { idempotencyKey }) }),
    getSyncStatus: (accountId) => transport.request({ method: 'GET', path: `${accountPath(accountId)}/status` }),
    listImportJobs: (accountId) => transport.request({ method: 'GET', path: '/v1/social/import-jobs', query: { accountId } }),
    getImportJob: (jobId) => transport.request({ method: 'GET', path: `/v1/social/import-jobs/${id(jobId)}` }),
    cancelImportJob: (jobId) => transport.request({ method: 'POST', path: `/v1/social/import-jobs/${id(jobId)}/cancel`, body: {} }),
    listArchive: (query = {}) => transport.request({ method: 'GET', path: '/v1/social/archive', query: { ...query } }),
    getArchiveItem: (itemId) => transport.request({ method: 'GET', path: archivePath(itemId) }),
    saveManualLink: (body, idempotencyKey) => transport.request({ method: 'POST', path: '/v1/social/archive', body, ...(idempotencyKey === undefined ? {} : { idempotencyKey }) }),
    updateArchiveItem: (itemId, body) => transport.request({ method: 'PATCH', path: archivePath(itemId), body }),
    deleteArchiveItem: (itemId) => transport.request({ method: 'DELETE', path: archivePath(itemId) }),
    deleteImportedData: (body) => transport.request({ method: 'DELETE', path: '/v1/social/imported-data', body }),
    listCollections: () => transport.request({ method: 'GET', path: '/v1/social/collections' }),
    createCollection: (body) => transport.request({ method: 'POST', path: '/v1/social/collections', body }),
    updateCollection: (collectionId, body) => transport.request({ method: 'PATCH', path: collectionPath(collectionId), body }),
    addToCollection: (collectionId, archiveItemId) => transport.request({ method: 'POST', path: `${collectionPath(collectionId)}/items`, body: { archiveItemId } }),
    removeFromCollection: (collectionId, archiveItemId) => transport.request({ method: 'DELETE', path: `${collectionPath(collectionId)}/items`, body: { archiveItemId } }),
    publishSnapshot: (itemId, body) => transport.request({ method: 'POST', path: `${archivePath(itemId)}/publish-snapshot`, body }),
    publishExternal: (itemId, body) => transport.request({ method: 'POST', path: `${archivePath(itemId)}/publish-external`, body }),
    listFounderFeed: () => transport.request({ method: 'GET', path: '/v1/social/founder-feed' }),
    curateFounder: (input) => transport.request({ method: 'POST', path: '/v1/social/founder/curate', body: input }),
  };
}

// ---------------------------------------------------------------------------
// Phase 19 — Connected Apps / external identity
// ---------------------------------------------------------------------------

export interface ExternalIdentitySdk {
  listProviders(): Promise<ApiResponse<readonly ExternalIdentityProviderInfo[]>>;
  listIdentities(): Promise<ApiResponse<readonly ExternalIdentity[]>>;
  getIdentity(identityId: string): Promise<ApiResponse<ExternalIdentity>>;
  getPublicProfile(ownerId: string): Promise<ApiResponse<readonly PublicExternalIdentity[]>>;
  createManualIdentity(input: {
    readonly provider: ExternalIdentityProviderCode;
    readonly displayName: string;
    readonly handle?: string | null;
    readonly publicUrl?: string | null;
    readonly avatarUrl?: string | null;
    readonly description?: string | null;
    readonly visibility?: 'PRIVATE' | 'PUBLIC';
    readonly wechatId?: string | null;
    readonly qrMediaId?: string | null;
    readonly contactPreference?: 'MESSAGE_FIRST' | 'COPY_ID' | 'SHOW_QR';
    readonly gameId?: string | null;
    readonly region?: string | null;
    readonly rank?: string | null;
    readonly favoriteHero?: string | null;
    readonly featuredRepositories?: readonly { readonly name: string; readonly url: string; readonly description?: string | null }[];
    readonly idempotencyKey?: string;
  }): Promise<ApiResponse<ExternalIdentity>>;
  updateIdentity(input: {
    readonly identityId: string;
    readonly displayName?: string;
    readonly handle?: string | null;
    readonly publicUrl?: string | null;
    readonly avatarUrl?: string | null;
    readonly description?: string | null;
    readonly visibility?: 'PRIVATE' | 'PUBLIC';
    readonly wechatId?: string | null;
    readonly qrMediaId?: string | null;
    readonly contactPreference?: 'MESSAGE_FIRST' | 'COPY_ID' | 'SHOW_QR';
    readonly gameId?: string | null;
    readonly region?: string | null;
    readonly rank?: string | null;
    readonly favoriteHero?: string | null;
    readonly featuredRepositories?: readonly { readonly name: string; readonly url: string; readonly description?: string | null }[];
  }): Promise<ApiResponse<ExternalIdentity>>;
  setVisibility(identityId: string, visibility: 'PRIVATE' | 'PUBLIC'): Promise<ApiResponse<ExternalIdentity>>;
  reorder(identityIds: readonly string[]): Promise<ApiResponse<readonly ExternalIdentity[]>>;
  deleteIdentity(identityId: string): Promise<ApiResponse<{ readonly deleted: true }>>;
  listConnections(): Promise<ApiResponse<readonly ExternalIdentityConnection[]>>;
  startOAuth(input: {
    readonly provider: 'X' | 'GITHUB';
    readonly redirectUri: string;
  }): Promise<ApiResponse<ExternalIdentityOAuthStart>>;
  completeOAuth(input: {
    readonly provider: 'X' | 'GITHUB';
    readonly state: string;
    readonly code: string;
    readonly redirectUri: string;
  }): Promise<ApiResponse<ExternalIdentity>>;
  disconnect(identityId: string): Promise<ApiResponse<ExternalIdentity>>;
  launch(identityId: string, action: 'OPEN' | 'COPY' | 'QR'): Promise<ApiResponse<ExternalAppLaunchPlan>>;
}

export function createExternalIdentitySdk(transport: MeZipSdkTransport): ExternalIdentitySdk {
  const id = encodeURIComponent;
  const identityPath = (identityId: string) => `/v1/external-identities/${id(identityId)}`;
  return {
    listProviders: () => transport.request({ method: 'GET', path: '/v1/external-identities/providers' }),
    listIdentities: () => transport.request({ method: 'GET', path: '/v1/external-identities' }),
    getIdentity: (identityId) => transport.request({ method: 'GET', path: identityPath(identityId) }),
    getPublicProfile: (ownerId) => transport.request({ method: 'GET', path: `/v1/public/profiles/${id(ownerId)}/external-identities` }),
    createManualIdentity: ({ idempotencyKey, ...body }) => transport.request({ method: 'POST', path: '/v1/external-identities', body, ...(idempotencyKey === undefined ? {} : { idempotencyKey }) }),
    updateIdentity: ({ identityId, ...body }) => transport.request({ method: 'PATCH', path: identityPath(identityId), body }),
    setVisibility: (identityId, visibility) => transport.request({ method: 'PATCH', path: `${identityPath(identityId)}/visibility`, body: { visibility } }),
    reorder: (identityIds) => transport.request({ method: 'POST', path: '/v1/external-identities/reorder', body: { identityIds } }),
    deleteIdentity: (identityId) => transport.request({ method: 'DELETE', path: identityPath(identityId), body: {} }),
    listConnections: () => transport.request({ method: 'GET', path: '/v1/external-identities/connections' }),
    startOAuth: (body) => transport.request({ method: 'POST', path: '/v1/external-identities/oauth/start', body }),
    completeOAuth: (body) => transport.request({ method: 'POST', path: '/v1/external-identities/oauth/callback', body }),
    disconnect: (identityId) => transport.request({ method: 'POST', path: `${identityPath(identityId)}/disconnect`, body: {} }),
    launch: (identityId, action) => transport.request({ method: 'POST', path: `${identityPath(identityId)}/launch`, body: { action } }),
  };
}

export type CommunitySdkTarget =
  | { readonly kind: 'COMMUNITY' }
  | { readonly kind: 'GROUP'; readonly groupId: string }
  | { readonly kind: 'CHANNEL'; readonly channelId: string }
  | { readonly kind: 'ACTIVITY'; readonly activityId: string };

export interface CreatorLabSdk {
  listProjects(input?: {
    readonly cursor?: string;
    readonly limit?: number;
  }): Promise<ApiResponse<CreatorProjectPage>>;
  createProject(input: {
    readonly name: string;
    readonly description?: string;
    readonly type: string;
    readonly visibility?: string;
    readonly template?: string;
  }): Promise<ApiResponse<CreatorProject>>;
  getProject(projectId: string): Promise<ApiResponse<CreatorProject>>;
  deleteProject(projectId: string): Promise<ApiResponse<CreatorProject>>;
  listFiles(projectId: string): Promise<ApiResponse<CreatorWorkspaceFile[]>>;
  readFile(
    projectId: string,
    path: string,
  ): Promise<ApiResponse<CreatorWorkspaceFileView>>;
  createFile(
    projectId: string,
    input: {
      readonly path: string;
      readonly kind?: 'FILE' | 'FOLDER';
      readonly content?: string;
      readonly expectedVersion?: number;
    },
  ): Promise<ApiResponse<CreatorWorkspaceFile>>;
  updateFile(
    projectId: string,
    input: {
      readonly path: string;
      readonly content: string;
      readonly expectedChecksum: string;
      readonly expectedVersion: number;
    },
  ): Promise<ApiResponse<CreatorWorkspaceFile>>;
  moveFile(
    projectId: string,
    input: {
      readonly path: string;
      readonly nextPath: string;
      readonly expectedVersion: number;
    },
  ): Promise<ApiResponse<CreatorWorkspaceFile>>;
  deleteFile(
    projectId: string,
    input: { readonly path: string; readonly expectedVersion: number },
  ): Promise<ApiResponse<void>>;
  searchFiles(
    projectId: string,
    query: string,
  ): Promise<ApiResponse<CreatorWorkspaceFile[]>>;
  createSnapshot(
    projectId: string,
    reason: 'AI_APPLY' | 'IMPORT' | 'BULK_EDIT' | 'DELETE' | 'MANUAL',
  ): Promise<ApiResponse<CreatorWorkspaceSnapshot>>;
  restoreSnapshot(
    projectId: string,
    snapshotId: string,
  ): Promise<ApiResponse<CreatorProject>>;
  getGitStatus(projectId: string): Promise<ApiResponse<CreatorGitStatus>>;
  getGitDiff(projectId: string): Promise<ApiResponse<CreatorWorkspaceDiff>>;
  getGitHistory(projectId: string): Promise<ApiResponse<CreatorGitCommit[]>>;
  commit(
    projectId: string,
    input: {
      readonly message: string;
      readonly paths: readonly string[];
      readonly expectedVersion: number;
    },
  ): Promise<ApiResponse<CreatorGitCommit>>;
  proposeAIChange(
    projectId: string,
    input: {
      readonly request: string;
      readonly scopePaths: readonly string[];
      readonly expectedVersion: number;
    },
  ): Promise<ApiResponse<CreatorAIChangeSet>>;
  applyAIChange(
    projectId: string,
    changeId: string,
    expectedVersion: number,
  ): Promise<ApiResponse<CreatorAIChangeSet>>;
  rollbackAIChange(
    projectId: string,
    changeId: string,
  ): Promise<ApiResponse<CreatorAIChangeSet>>;
  beginGitHubAuthorization(): Promise<ApiResponse<CreatorGitHubAuthorizationStart>>;
  getGitHubConnection(): Promise<ApiResponse<CreatorGitHubConnection | null>>;
  completeGitHubAuthorization(input: {
    readonly code: string;
    readonly state: string;
  }): Promise<ApiResponse<CreatorGitHubConnection>>;
  importGitHubRepository(input: {
    readonly connectionId: string;
    readonly repositoryFullName: string;
    readonly projectName: string;
  }): Promise<ApiResponse<CreatorProject>>;
  listReleases(projectId: string): Promise<ApiResponse<CreatorRelease[]>>;
  createRelease(
    projectId: string,
    input: {
      readonly version: string;
      readonly title: string;
      readonly notes: string;
      readonly sourceCommitId?: string | null;
    },
  ): Promise<ApiResponse<CreatorRelease>>;
  publishRelease(
    projectId: string,
    releaseId: string,
  ): Promise<ApiResponse<CreatorRelease>>;
  exportProject(projectId: string): Promise<ApiResponse<CreatorProjectExport>>;
  getExport(
    projectId: string,
    exportId: string,
  ): Promise<ApiResponse<CreatorProjectExport>>;
}

export function createCreatorLabSdk(transport: MeZipSdkTransport): CreatorLabSdk {
  const request = <T>(input: Parameters<MeZipSdkTransport['request']>[0]) =>
    transport.request<T>(input);
  return {
    listProjects: (input = {}) =>
      request<CreatorProjectPage>({
        method: 'GET',
        path: '/v1/creator/projects',
        query: input,
      }),
    createProject: (input) =>
      request<CreatorProject>({
        method: 'POST',
        path: '/v1/creator/projects',
        body: input,
      }),
    getProject: (projectId) =>
      request<CreatorProject>({
        method: 'GET',
        path: `/v1/creator/projects/${encodeURIComponent(projectId)}`,
      }),
    deleteProject: (projectId) =>
      request<CreatorProject>({
        method: 'DELETE',
        path: `/v1/creator/projects/${encodeURIComponent(projectId)}`,
      }),
    listFiles: (projectId) =>
      request<CreatorWorkspaceFile[]>({
        method: 'GET',
        path: `/v1/creator/projects/${encodeURIComponent(projectId)}/files`,
      }),
    readFile: (projectId, path) =>
      request<CreatorWorkspaceFileView>({
        method: 'GET',
        path: `/v1/creator/projects/${encodeURIComponent(projectId)}/files`,
        query: { path },
      }),
    createFile: (projectId, input) =>
      request<CreatorWorkspaceFile>({
        method: 'POST',
        path: `/v1/creator/projects/${encodeURIComponent(projectId)}/files`,
        body: input,
      }),
    updateFile: (projectId, input) =>
      request<CreatorWorkspaceFile>({
        method: 'PATCH',
        path: `/v1/creator/projects/${encodeURIComponent(projectId)}/files`,
        body: input,
      }),
    moveFile: (projectId, input) =>
      request<CreatorWorkspaceFile>({
        method: 'POST',
        path: `/v1/creator/projects/${encodeURIComponent(projectId)}/files/move`,
        body: input,
      }),
    deleteFile: (projectId, input) =>
      request<void>({
        method: 'DELETE',
        path: `/v1/creator/projects/${encodeURIComponent(projectId)}/files`,
        query: { path: input.path },
        body: { expectedVersion: input.expectedVersion },
      }),
    searchFiles: (projectId, query) =>
      request<CreatorWorkspaceFile[]>({
        method: 'GET',
        path: `/v1/creator/projects/${encodeURIComponent(projectId)}/search`,
        query: { q: query },
      }),
    createSnapshot: (projectId, reason) =>
      request<CreatorWorkspaceSnapshot>({
        method: 'POST',
        path: `/v1/creator/projects/${encodeURIComponent(projectId)}/snapshots`,
        body: { reason },
      }),
    restoreSnapshot: (projectId, snapshotId) =>
      request<CreatorProject>({
        method: 'POST',
        path: `/v1/creator/projects/${encodeURIComponent(projectId)}/snapshots/${encodeURIComponent(snapshotId)}/restore`,
      }),
    getGitStatus: (projectId) =>
      request<CreatorGitStatus>({
        method: 'GET',
        path: `/v1/creator/projects/${encodeURIComponent(projectId)}/git/status`,
      }),
    getGitDiff: (projectId) =>
      request<CreatorWorkspaceDiff>({
        method: 'GET',
        path: `/v1/creator/projects/${encodeURIComponent(projectId)}/git/diff`,
      }),
    getGitHistory: (projectId) =>
      request<CreatorGitCommit[]>({
        method: 'GET',
        path: `/v1/creator/projects/${encodeURIComponent(projectId)}/git/history`,
      }),
    commit: (projectId, input) =>
      request<CreatorGitCommit>({
        method: 'POST',
        path: `/v1/creator/projects/${encodeURIComponent(projectId)}/git/commits`,
        body: input,
      }),
    proposeAIChange: (projectId, input) =>
      request<CreatorAIChangeSet>({
        method: 'POST',
        path: `/v1/creator/projects/${encodeURIComponent(projectId)}/ai/changes`,
        body: input,
      }),
    applyAIChange: (projectId, changeId, expectedVersion) =>
      request<CreatorAIChangeSet>({
        method: 'POST',
        path: `/v1/creator/projects/${encodeURIComponent(projectId)}/ai/changes/${encodeURIComponent(changeId)}/apply`,
        body: { expectedVersion },
      }),
    rollbackAIChange: (projectId, changeId) =>
      request<CreatorAIChangeSet>({
        method: 'POST',
        path: `/v1/creator/projects/${encodeURIComponent(projectId)}/ai/changes/${encodeURIComponent(changeId)}/rollback`,
      }),
    beginGitHubAuthorization: () =>
      request<CreatorGitHubAuthorizationStart>({
        method: 'GET',
        path: '/v1/creator/github/authorization',
      }),
    getGitHubConnection: () =>
      request<CreatorGitHubConnection | null>({
        method: 'GET',
        path: '/v1/creator/github/connection',
      }),
    completeGitHubAuthorization: (input) =>
      request<CreatorGitHubConnection>({
        method: 'POST',
        path: '/v1/creator/github/authorization/complete',
        body: input,
      }),
    importGitHubRepository: (input) =>
      request<CreatorProject>({
        method: 'POST',
        path: '/v1/creator/github/import',
        body: input,
      }),
    listReleases: (projectId) =>
      request<CreatorRelease[]>({
        method: 'GET',
        path: `/v1/creator/projects/${encodeURIComponent(projectId)}/releases`,
      }),
    createRelease: (projectId, input) =>
      request<CreatorRelease>({
        method: 'POST',
        path: `/v1/creator/projects/${encodeURIComponent(projectId)}/releases`,
        body: input,
      }),
    publishRelease: (projectId, releaseId) =>
      request<CreatorRelease>({
        method: 'POST',
        path: `/v1/creator/projects/${encodeURIComponent(projectId)}/releases/${encodeURIComponent(releaseId)}/publish`,
      }),
    exportProject: (projectId) =>
      request<CreatorProjectExport>({
        method: 'POST',
        path: `/v1/creator/projects/${encodeURIComponent(projectId)}/exports`,
        body: {},
      }),
    getExport: (projectId, exportId) =>
      request<CreatorProjectExport>({
        method: 'GET',
        path: `/v1/creator/projects/${encodeURIComponent(projectId)}/exports/${encodeURIComponent(exportId)}`,
      }),
  };
}

/** Phase 20 facade. It complements the existing owner-scoped Creator Lab;
 * it does not duplicate workspace, release, deployment, or follow domains. */
export interface CreatorEcosystemSdk {
  getProfile(): Promise<ApiResponse<CreatorProfile>>;
  updateProfile(input: { readonly username?: string; readonly displayName?: string; readonly avatarMediaId?: string | null; readonly bio?: string | null; readonly profileVisibility?: 'PUBLIC' | 'PRIVATE' }): Promise<ApiResponse<CreatorProfile>>;
  getPublicProfile(creatorId: string): Promise<ApiResponse<CreatorPublicProfile>>;
  getHome(): Promise<ApiResponse<CreatorHome>>;
  getProject(projectId: string): Promise<ApiResponse<CreatorProjectDetail>>;
  getPublicProject(projectId: string): Promise<ApiResponse<CreatorProjectDetail>>;
  searchPublicProjects(input: { readonly q: string; readonly limit?: number }): Promise<ApiResponse<readonly CreatorProjectDetail[]>>;
  updateProjectMetadata(projectId: string, input: { readonly slug?: string | null; readonly coverMediaId?: string | null; readonly tags?: readonly string[]; readonly technologies?: readonly string[]; readonly projectVisibility?: 'PRIVATE' | 'UNLISTED' | 'PUBLIC'; readonly sourceVisibility?: 'PRIVATE' | 'OWNER_ONLY' | 'ENTITLEMENT_GATED' | 'PUBLIC'; readonly downloadVisibility?: 'DISABLED' | 'OWNER_ONLY' | 'ENTITLEMENT_GATED' | 'PUBLIC'; readonly demoVisibility?: 'DISABLED' | 'PRIVATE' | 'ENTITLEMENT_GATED' | 'PUBLIC' }): Promise<ApiResponse<CreatorProjectMetadata>>;
  addProjectMedia(projectId: string, input: { readonly mediaId: string; readonly kind: 'COVER' | 'SCREENSHOT'; readonly caption?: string | null; readonly position?: number }): Promise<ApiResponse<readonly CreatorProjectMedia[]>>;
  publishProject(projectId: string, input: { readonly releaseId?: string | null; readonly idempotencyKey: string }): Promise<ApiResponse<CreatorPublishedProjectSnapshot>>;
  unpublishProject(projectId: string): Promise<ApiResponse<CreatorProjectMetadata>>;
  publishProjectUpdate(projectId: string, snapshotId: string): Promise<ApiResponse<void>>;
  readSource(projectId: string, path: string): Promise<ApiResponse<CreatorProjectSourceFile>>;
  registerReleaseAsset(projectId: string, input: { readonly releaseId: string; readonly name: string; readonly sizeBytes: number; readonly checksum: string; readonly contentType: string }): Promise<ApiResponse<CreatorReleaseAsset>>;
  requestDownload(projectId: string, assetId: string): Promise<ApiResponse<CreatorProjectDownloadGrant>>;
  redeemDownload(projectId: string, token: string): Promise<ApiResponse<CreatorReleaseAsset>>;
  setSaved(projectId: string, input: { readonly saved: boolean; readonly idempotencyKey: string }): Promise<ApiResponse<{ readonly projectId: string; readonly saved: boolean }>>;
  setFollow(projectId: string, input: { readonly followed: boolean; readonly idempotencyKey: string }): Promise<ApiResponse<{ readonly creatorId: string; readonly following: boolean }>>;
  getStats(projectId: string): Promise<ApiResponse<CreatorProjectStats>>;
}

export function createCreatorEcosystemSdk(transport: MeZipSdkTransport): CreatorEcosystemSdk {
  const id = encodeURIComponent;
  const projectPath = (projectId: string) => `/v1/creator-ecosystem/projects/${id(projectId)}`;
  return {
    getProfile: () => transport.request({ method: 'GET', path: '/v1/creator-ecosystem/profile' }),
    updateProfile: (body) => transport.request({ method: 'PATCH', path: '/v1/creator-ecosystem/profile', body }),
    getPublicProfile: (creatorId) => transport.request({ method: 'GET', path: `/v1/public/creator-profiles/${id(creatorId)}` }),
    getHome: () => transport.request({ method: 'GET', path: '/v1/creator-ecosystem/home' }),
    getProject: (projectId) => transport.request({ method: 'GET', path: projectPath(projectId) }),
    getPublicProject: (projectId) => transport.request({ method: 'GET', path: `/v1/public/creator-projects/${id(projectId)}` }),
    searchPublicProjects: (input) => transport.request({ method: 'GET', path: '/v1/public/creator-projects/search', query: input }),
    updateProjectMetadata: (projectId, body) => transport.request({ method: 'PATCH', path: `${projectPath(projectId)}/metadata`, body }),
    addProjectMedia: (projectId, body) => transport.request({ method: 'POST', path: `${projectPath(projectId)}/media`, body }),
    publishProject: (projectId, body) => transport.request({ method: 'POST', path: `${projectPath(projectId)}/publish`, body, idempotencyKey: body.idempotencyKey }),
    unpublishProject: (projectId) => transport.request({ method: 'POST', path: `${projectPath(projectId)}/unpublish`, body: {} }),
    publishProjectUpdate: (projectId, snapshotId) => transport.request({ method: 'POST', path: `${projectPath(projectId)}/publish-social`, body: { snapshotId } }),
    readSource: (projectId, path) => transport.request({ method: 'GET', path: `${projectPath(projectId)}/source`, query: { path } }),
    registerReleaseAsset: (projectId, body) => transport.request({ method: 'POST', path: `${projectPath(projectId)}/assets`, body }),
    requestDownload: (projectId, assetId) => transport.request({ method: 'POST', path: `${projectPath(projectId)}/downloads`, body: { assetId } }),
    redeemDownload: (projectId, token) => transport.request({ method: 'GET', path: `${projectPath(projectId)}/downloads/${id(token)}` }),
    setSaved: (projectId, body) => transport.request({ method: 'POST', path: `${projectPath(projectId)}/save`, body, idempotencyKey: body.idempotencyKey }),
    setFollow: (projectId, body) => transport.request({ method: 'POST', path: `${projectPath(projectId)}/follow`, body, idempotencyKey: body.idempotencyKey }),
    getStats: (projectId) => transport.request({ method: 'GET', path: `${projectPath(projectId)}/stats` }),
  };
}

export interface CommunitySdkSnapshotInput {
  readonly sourceEntryId: string;
  readonly sourceRevision?: number;
  /** Projection keys only; clients never send private original text or media payloads. */
  readonly selectedFieldKeys?: readonly (
    'title' | 'body' | 'occurredAt' | 'timezone' | 'tags'
  )[];
  readonly selectedMediaIds?: readonly string[];
  readonly target?: {
    readonly visibility?: CommunityVisibility;
    readonly groupId?: string | null;
    readonly channelId?: string | null;
  };
  readonly idempotencyKey: string;
}

export interface CommunitySdkPostInput {
  readonly body?: string | null;
  readonly mediaIds?: readonly string[];
  readonly archiveSnapshotId?: string | null;
  readonly target?: CommunitySdkTarget;
  readonly visibility?: CommunityVisibility;
  readonly directShareRecipientIds?: readonly string[];
  readonly idempotencyKey: string;
}

export interface CommunitySdkGroupInput {
  readonly name: string;
  readonly description?: string | null;
  readonly avatarMediaId?: string | null;
  readonly coverMediaId?: string | null;
  readonly visibility?: 'PUBLIC' | 'PRIVATE' | 'INVITE_ONLY';
  readonly idempotencyKey: string;
}

export interface CommunitySdkChannelInput {
  readonly type: CommunityChannel['type'];
  readonly slug: string;
  readonly name: string;
  readonly description?: string | null;
  readonly visibility?: CommunityVisibility;
  readonly founderAudience?: FounderAudience | null;
  readonly idempotencyKey: string;
}

export interface CommunitySdkActivityInput {
  readonly groupId?: string | null;
  readonly channelId?: string | null;
  readonly kind: CommunityActivityKind;
  readonly title: string;
  readonly description?: string | null;
  readonly startAt: string;
  readonly endAt?: string | null;
  readonly timezone: string;
  readonly locationText?: string | null;
  readonly onlineUrl?: string | null;
  readonly capacity?: number | null;
  readonly visibility?: CommunityVisibility;
  readonly founderAudience?: FounderAudience | null;
  readonly idempotencyKey: string;
}

export interface CommunitySdkPageInput {
  readonly cursor?: string;
  readonly limit?: number;
}

/**
 * A typed client facade shared by Web and Mini. It is intentionally only a
 * transport mapper: all authentication, owner checks, visibility, block,
 * entitlement, capacity and Root authorization remain server-authoritative.
 */
export interface CommunitySdk {
  getFeed(
    input?: CommunitySdkPageInput & { readonly mode?: CommunityFeedMode },
  ): Promise<ApiResponse<CommunityFeedPage>>;
  getPost(postId: string): Promise<ApiResponse<CommunityFeedItem>>;
  publishSnapshot(
    input: CommunitySdkSnapshotInput,
  ): Promise<ApiResponse<CommunitySnapshotPublication>>;
  createPost(input: CommunitySdkPostInput): Promise<ApiResponse<CommunityPost>>;
  createQuote(input: {
    readonly postId: string;
    readonly commentary?: string | null;
    readonly idempotencyKey: string;
  }): Promise<ApiResponse<CommunityFeedItem>>;
  updatePost(input: {
    readonly postId: string;
    readonly body?: string | null;
    readonly mediaIds?: readonly string[];
    readonly idempotencyKey: string;
  }): Promise<ApiResponse<CommunityPost>>;
  deletePost(input: {
    readonly postId: string;
    readonly idempotencyKey: string;
  }): Promise<ApiResponse<CommunityPost>>;
  setReaction(input: {
    readonly postId: string;
    readonly active: boolean;
    readonly idempotencyKey: string;
  }): Promise<ApiResponse<CommunityReaction | { readonly removed: boolean }>>;
  listComments(
    input: CommunitySdkPageInput & {
      readonly postId: string;
      readonly parentCommentId?: string | null;
    },
  ): Promise<ApiResponse<CommunityCursorPage<CommunityComment>>>;
  createComment(input: {
    readonly postId: string;
    readonly body: string;
    readonly parentCommentId?: string | null;
    readonly idempotencyKey: string;
  }): Promise<ApiResponse<CommunityComment>>;
  updateComment(input: {
    readonly commentId: string;
    readonly body: string;
    readonly idempotencyKey: string;
  }): Promise<ApiResponse<CommunityComment>>;
  deleteComment(input: {
    readonly commentId: string;
    readonly idempotencyKey: string;
  }): Promise<ApiResponse<CommunityComment>>;
  setSaved(input: {
    readonly postId: string;
    readonly saved: boolean;
    readonly idempotencyKey: string;
  }): Promise<ApiResponse<{ readonly postId: string; readonly saved: boolean }>>;
  setRepost(input: {
    readonly postId: string;
    readonly reposted: boolean;
    readonly idempotencyKey: string;
  }): Promise<ApiResponse<{
    readonly postId: string;
    readonly reposted: boolean;
    readonly repostCount: number;
    readonly repostedBy: CommunityRepostAttribution | null;
  }>>;
  setFollow(input: {
    readonly userId: string;
    readonly followed: boolean;
    readonly idempotencyKey: string;
  }): Promise<
    ApiResponse<{ readonly followedUserId: string; readonly following: boolean }>
  >;
  setBlock(input: {
    readonly userId: string;
    readonly blocked: boolean;
    readonly idempotencyKey: string;
  }): Promise<
    ApiResponse<{ readonly blockedUserId: string; readonly blocked: boolean }>
  >;
  getProfile(userId: string): Promise<ApiResponse<CommunityProfile>>;
  updateProfile(input: {
    readonly displayName?: string;
    readonly avatarMediaId?: string | null;
    readonly bio?: string | null;
    readonly profileVisibility?: 'PUBLIC' | 'PRIVATE';
    readonly followPermission?: 'EVERYONE' | 'NOBODY';
    readonly idempotencyKey: string;
  }): Promise<ApiResponse<CommunityProfile>>;
  listGroups(
    input?: CommunitySdkPageInput & { readonly mine?: boolean },
  ): Promise<ApiResponse<CommunityCursorPage<CommunityGroup>>>;
  createGroup(input: CommunitySdkGroupInput): Promise<ApiResponse<CommunityGroup>>;
  getGroup(groupId: string): Promise<ApiResponse<CommunityGroup>>;
  joinGroup(input: {
    readonly groupId: string;
    readonly idempotencyKey: string;
  }): Promise<ApiResponse<CommunityGroupMembership>>;
  leaveGroup(input: {
    readonly groupId: string;
    readonly idempotencyKey: string;
  }): Promise<ApiResponse<CommunityGroupMembership>>;
  listGroupPosts(
    input: CommunitySdkPageInput & { readonly groupId: string },
  ): Promise<ApiResponse<CommunityCursorPage<CommunityFeedItem>>>;
  listChannels(
    input?: CommunitySdkPageInput & { readonly mine?: boolean },
  ): Promise<ApiResponse<CommunityCursorPage<CommunityChannel>>>;
  getChannel(channelId: string): Promise<ApiResponse<CommunityChannel>>;
  joinChannel(input: {
    readonly channelId: string;
    readonly idempotencyKey: string;
  }): Promise<ApiResponse<CommunityChannelMembership>>;
  leaveChannel(input: {
    readonly channelId: string;
    readonly idempotencyKey: string;
  }): Promise<ApiResponse<CommunityChannelMembership>>;
  listChannelPosts(
    input: CommunitySdkPageInput & { readonly channelId: string },
  ): Promise<ApiResponse<CommunityCursorPage<CommunityFeedItem>>>;
  listActivities(
    input?: CommunitySdkPageInput & {
      readonly joined?: boolean;
      readonly upcomingOnly?: boolean;
    },
  ): Promise<ApiResponse<CommunityCursorPage<CommunityActivity>>>;
  getActivity(activityId: string): Promise<ApiResponse<CommunityActivity>>;
  joinActivity(input: {
    readonly activityId: string;
    readonly idempotencyKey: string;
  }): Promise<ApiResponse<CommunityActivityRegistration>>;
  cancelActivityRegistration(input: {
    readonly activityId: string;
    readonly idempotencyKey: string;
  }): Promise<ApiResponse<CommunityActivityRegistration>>;
  listNotifications(
    input?: CommunitySdkPageInput & { readonly unreadOnly?: boolean },
  ): Promise<ApiResponse<CommunityCursorPage<CommunityNotification>>>;
  markNotificationRead(input: {
    readonly notificationId: string;
    readonly idempotencyKey: string;
  }): Promise<ApiResponse<CommunityNotification>>;
  search(
    input: CommunitySdkPageInput & { readonly query: string },
  ): Promise<ApiResponse<CommunityCursorPage<CommunitySearchResult>>>;
  submitReport(input: {
    readonly targetType: CommunityReportTargetType;
    readonly targetId: string;
    readonly reason: CommunityReportReason;
    readonly details?: string | null;
    readonly idempotencyKey: string;
  }): Promise<ApiResponse<CommunityReport>>;
  moderate(input: {
    readonly moderationCaseId: string;
    readonly action: ModerationActionType;
    readonly reason: string;
    readonly idempotencyKey: string;
  }): Promise<ApiResponse<unknown>>;
}

function targetPath(target: CommunitySdkTarget | undefined): {
  readonly groupId?: string;
  readonly channelId?: string;
  readonly activityId?: string;
} {
  if (target === undefined || target.kind === 'COMMUNITY') return {};
  if (target.kind === 'GROUP') return { groupId: target.groupId };
  if (target.kind === 'CHANNEL') return { channelId: target.channelId };
  return { activityId: target.activityId };
}

export function createCommunitySdk(transport: MeZipSdkTransport): CommunitySdk {
  return {
    getFeed: (input = {}) =>
      transport.request<CommunityFeedPage>({
        method: 'GET',
        path: '/v1/community/feed',
        query: { mode: input.mode, cursor: input.cursor, limit: input.limit },
      }),
    getPost: (postId) =>
      transport.request<CommunityFeedItem>({
        method: 'GET',
        path: `/v1/community/posts/${encodeURIComponent(postId)}`,
      }),
    publishSnapshot: ({ idempotencyKey, ...body }) =>
      transport.request<CommunitySnapshotPublication>({
        method: 'POST',
        path: '/v1/community/snapshots',
        body,
        idempotencyKey,
      }),
    createPost: ({ idempotencyKey, target, ...body }) =>
      transport.request<CommunityPost>({
        method: 'POST',
        path: '/v1/community/posts',
        body: { ...body, ...targetPath(target) },
        idempotencyKey,
      }),
    createQuote: ({ postId, idempotencyKey, ...body }) =>
      transport.request<CommunityFeedItem>({
        method: 'POST',
        path: `/v1/community/posts/${encodeURIComponent(postId)}/quote`,
        body,
        idempotencyKey,
      }),
    updatePost: ({ postId, idempotencyKey, ...body }) =>
      transport.request<CommunityPost>({
        method: 'PATCH',
        path: `/v1/community/posts/${encodeURIComponent(postId)}`,
        body,
        idempotencyKey,
      }),
    deletePost: ({ postId, idempotencyKey }) =>
      transport.request<CommunityPost>({
        method: 'DELETE',
        path: `/v1/community/posts/${encodeURIComponent(postId)}`,
        idempotencyKey,
      }),
    setReaction: ({ postId, active, idempotencyKey }) =>
      transport.request<CommunityReaction | { readonly removed: boolean }>({
        method: active ? 'PUT' : 'DELETE',
        path: `/v1/community/posts/${encodeURIComponent(postId)}/reactions/LIKE`,
        idempotencyKey,
      }),
    listComments: ({ postId, parentCommentId, cursor, limit }) =>
      transport.request<CommunityCursorPage<CommunityComment>>({
        method: 'GET',
        path: `/v1/community/posts/${encodeURIComponent(postId)}/comments`,
        query: { parentCommentId: parentCommentId ?? undefined, cursor, limit },
      }),
    createComment: ({ postId, parentCommentId, idempotencyKey, ...body }) =>
      transport.request<CommunityComment>({
        method: 'POST',
        path:
          parentCommentId === undefined || parentCommentId === null
            ? `/v1/community/posts/${encodeURIComponent(postId)}/comments`
            : `/v1/community/comments/${encodeURIComponent(parentCommentId)}/replies`,
        body,
        idempotencyKey,
      }),
    updateComment: ({ commentId, idempotencyKey, ...body }) =>
      transport.request<CommunityComment>({
        method: 'PATCH',
        path: `/v1/community/comments/${encodeURIComponent(commentId)}`,
        body,
        idempotencyKey,
      }),
    deleteComment: ({ commentId, idempotencyKey }) =>
      transport.request<CommunityComment>({
        method: 'DELETE',
        path: `/v1/community/comments/${encodeURIComponent(commentId)}`,
        idempotencyKey,
      }),
    setSaved: ({ postId, saved, idempotencyKey }) =>
      transport.request<{ readonly postId: string; readonly saved: boolean }>({
        method: saved ? 'PUT' : 'DELETE',
        path: `/v1/community/posts/${encodeURIComponent(postId)}/save`,
        idempotencyKey,
      }),
    setRepost: ({ postId, reposted, idempotencyKey }) =>
      transport.request<{
        readonly postId: string;
        readonly reposted: boolean;
        readonly repostCount: number;
        readonly repostedBy: CommunityRepostAttribution | null;
      }>({
        method: reposted ? 'PUT' : 'DELETE',
        path: `/v1/community/posts/${encodeURIComponent(postId)}/repost`,
        idempotencyKey,
      }),
    setFollow: ({ userId, followed, idempotencyKey }) =>
      transport.request<{
        readonly followedUserId: string;
        readonly following: boolean;
      }>({
        method: followed ? 'PUT' : 'DELETE',
        path: `/v1/community/users/${encodeURIComponent(userId)}/follow`,
        idempotencyKey,
      }),
    setBlock: ({ userId, blocked, idempotencyKey }) =>
      transport.request<{ readonly blockedUserId: string; readonly blocked: boolean }>({
        method: blocked ? 'PUT' : 'DELETE',
        path: `/v1/community/users/${encodeURIComponent(userId)}/block`,
        idempotencyKey,
      }),
    getProfile: (userId) =>
      transport.request<CommunityProfile>({
        method: 'GET',
        path: `/v1/community/users/${encodeURIComponent(userId)}`,
      }),
    updateProfile: ({ idempotencyKey, ...body }) =>
      transport.request<CommunityProfile>({
        method: 'PATCH',
        path: '/v1/community/profile',
        body,
        idempotencyKey,
      }),
    listGroups: (input = {}) =>
      transport.request<CommunityCursorPage<CommunityGroup>>({
        method: 'GET',
        path: '/v1/community/groups',
        query: { cursor: input.cursor, limit: input.limit, mine: input.mine },
      }),
    createGroup: ({ idempotencyKey, ...body }) =>
      transport.request<CommunityGroup>({
        method: 'POST',
        path: '/v1/community/groups',
        body,
        idempotencyKey,
      }),
    getGroup: (groupId) =>
      transport.request<CommunityGroup>({
        method: 'GET',
        path: `/v1/community/groups/${encodeURIComponent(groupId)}`,
      }),
    joinGroup: ({ groupId, idempotencyKey }) =>
      transport.request<CommunityGroupMembership>({
        method: 'POST',
        path: `/v1/community/groups/${encodeURIComponent(groupId)}/memberships/join`,
        idempotencyKey,
      }),
    leaveGroup: ({ groupId, idempotencyKey }) =>
      transport.request<CommunityGroupMembership>({
        method: 'POST',
        path: `/v1/community/groups/${encodeURIComponent(groupId)}/memberships/leave`,
        idempotencyKey,
      }),
    listGroupPosts: ({ groupId, cursor, limit }) =>
      transport.request<CommunityCursorPage<CommunityFeedItem>>({
        method: 'GET',
        path: `/v1/community/groups/${encodeURIComponent(groupId)}/posts`,
        query: { cursor, limit },
      }),
    listChannels: (input = {}) =>
      transport.request<CommunityCursorPage<CommunityChannel>>({
        method: 'GET',
        path: '/v1/community/channels',
        query: { cursor: input.cursor, limit: input.limit, mine: input.mine },
      }),
    getChannel: (channelId) =>
      transport.request<CommunityChannel>({
        method: 'GET',
        path: `/v1/community/channels/${encodeURIComponent(channelId)}`,
      }),
    joinChannel: ({ channelId, idempotencyKey }) =>
      transport.request<CommunityChannelMembership>({
        method: 'POST',
        path: `/v1/community/channels/${encodeURIComponent(channelId)}/memberships/join`,
        idempotencyKey,
      }),
    leaveChannel: ({ channelId, idempotencyKey }) =>
      transport.request<CommunityChannelMembership>({
        method: 'POST',
        path: `/v1/community/channels/${encodeURIComponent(channelId)}/memberships/leave`,
        idempotencyKey,
      }),
    listChannelPosts: ({ channelId, cursor, limit }) =>
      transport.request<CommunityCursorPage<CommunityFeedItem>>({
        method: 'GET',
        path: `/v1/community/channels/${encodeURIComponent(channelId)}/posts`,
        query: { cursor, limit },
      }),
    listActivities: (input = {}) =>
      transport.request<CommunityCursorPage<CommunityActivity>>({
        method: 'GET',
        path: '/v1/community/activities',
        query: {
          cursor: input.cursor,
          limit: input.limit,
          joined: input.joined,
          upcomingOnly: input.upcomingOnly,
        },
      }),
    getActivity: (activityId) =>
      transport.request<CommunityActivity>({
        method: 'GET',
        path: `/v1/community/activities/${encodeURIComponent(activityId)}`,
      }),
    joinActivity: ({ activityId, idempotencyKey }) =>
      transport.request<CommunityActivityRegistration>({
        method: 'PUT',
        path: `/v1/community/activities/${encodeURIComponent(activityId)}/registration`,
        idempotencyKey,
      }),
    cancelActivityRegistration: ({ activityId, idempotencyKey }) =>
      transport.request<CommunityActivityRegistration>({
        method: 'DELETE',
        path: `/v1/community/activities/${encodeURIComponent(activityId)}/registration`,
        idempotencyKey,
      }),
    listNotifications: (input = {}) =>
      transport.request<CommunityCursorPage<CommunityNotification>>({
        method: 'GET',
        path: '/v1/community/notifications',
        query: {
          cursor: input.cursor,
          limit: input.limit,
          unreadOnly: input.unreadOnly,
        },
      }),
    markNotificationRead: ({ notificationId, idempotencyKey }) =>
      transport.request<CommunityNotification>({
        method: 'POST',
        path: `/v1/community/notifications/${encodeURIComponent(notificationId)}/read`,
        idempotencyKey,
      }),
    search: ({ query, cursor, limit }) =>
      transport.request<CommunityCursorPage<CommunitySearchResult>>({
        method: 'GET',
        path: '/v1/community/search',
        query: { q: query, cursor, limit },
      }),
    submitReport: ({ idempotencyKey, ...body }) =>
      transport.request<CommunityReport>({
        method: 'POST',
        path: '/v1/community/reports',
        body,
        idempotencyKey,
      }),
    moderate: ({ moderationCaseId, idempotencyKey, ...body }) =>
      transport.request<unknown>({
        method: 'POST',
        path: `/v1/admin/community/moderation/${encodeURIComponent(moderationCaseId)}`,
        body,
        idempotencyKey,
      }),
  };
}

export interface MessagingSdkPageInput {
  readonly cursor?: string;
  readonly limit?: number;
}

/** Typed REST facade. The transport owns authentication; no method accepts a
 * principal, membership plan, group role, Founder identity, or Root field. */
export interface MessagingSdk {
  listConversations(
    input?: MessagingSdkPageInput & { readonly includeArchived?: boolean },
  ): Promise<ApiResponse<MessagingCursorPage<MessagingConversationSummary>>>;
  getConversation(
    conversationId: string,
  ): Promise<ApiResponse<MessagingConversationSummary>>;
  listFounderInbox(
    input?: MessagingSdkPageInput,
  ): Promise<ApiResponse<MessagingCursorPage<MessagingConversationSummary>>>;
  openDirect(input: {
    readonly recipientUserId: string;
    readonly idempotencyKey: string;
  }): Promise<ApiResponse<MessagingConversationSummary>>;
  createMessageRequest(input: {
    readonly recipientUserId: string;
    readonly idempotencyKey: string;
  }): Promise<ApiResponse<MessagingConversationSummary>>;
  openGroup(input: {
    readonly groupId: string;
    readonly idempotencyKey: string;
  }): Promise<ApiResponse<MessagingConversationSummary>>;
  openFounderInbox(input: {
    readonly idempotencyKey: string;
  }): Promise<ApiResponse<MessagingConversationSummary>>;
  resolveMessageRequest(input: {
    readonly conversationId: string;
    readonly action: 'ACCEPT' | 'REJECT';
    readonly idempotencyKey: string;
  }): Promise<ApiResponse<MessagingConversationSummary>>;
  updateConversationPreferences(input: {
    readonly conversationId: string;
    readonly mutedUntil?: string | null;
    readonly pinned?: boolean;
    readonly archived?: boolean;
    readonly idempotencyKey: string;
  }): Promise<ApiResponse<MessagingConversationMember>>;
  listMessages(
    input: MessagingSdkPageInput & {
      readonly conversationId: string;
      readonly beforeSequence?: number;
    },
  ): Promise<ApiResponse<MessagingCursorPage<MessagingMessageView>>>;
  backfill(
    input: MessagingSdkPageInput & {
      readonly conversationId: string;
      readonly afterSequence: number;
    },
  ): Promise<ApiResponse<MessagingCursorPage<MessagingMessageView>>>;
  send(input: {
    readonly conversationId: string;
    readonly clientMessageId: string;
    readonly body?: string | null;
    readonly mediaIds?: readonly string[];
    readonly replyToMessageId?: string | null;
    readonly idempotencyKey: string;
  }): Promise<ApiResponse<MessagingMessageView>>;
  updateMessage(input: {
    readonly messageId: string;
    readonly body?: string | null;
    readonly mediaIds?: readonly string[];
    readonly idempotencyKey: string;
  }): Promise<ApiResponse<MessagingMessageView>>;
  deleteMessage(input: {
    readonly messageId: string;
    readonly idempotencyKey: string;
  }): Promise<ApiResponse<MessagingMessageView>>;
  setReaction(input: {
    readonly messageId: string;
    readonly type: MessagingReactionType;
    readonly active: boolean;
    readonly idempotencyKey: string;
  }): Promise<ApiResponse<MessagingReaction | { readonly removed: true }>>;
  markRead(input: {
    readonly conversationId: string;
    readonly sequence: number;
    readonly idempotencyKey: string;
  }): Promise<ApiResponse<MessagingConversationMember>>;
  markUnread(input: {
    readonly conversationId: string;
    readonly sequence: number;
    readonly idempotencyKey: string;
  }): Promise<ApiResponse<MessagingConversationMember>>;
  getUnreadSummary(): Promise<ApiResponse<MessagingUnreadSummary>>;
  getRealtimeHandshake(): Promise<ApiResponse<MessagingRealtimeHandshake>>;
  getDraft(conversationId: string): Promise<ApiResponse<MessagingDraft | null>>;
  saveDraft(input: {
    readonly conversationId: string;
    readonly body?: string | null;
    readonly mediaIds?: readonly string[];
    readonly replyToMessageId?: string | null;
    readonly idempotencyKey: string;
  }): Promise<ApiResponse<MessagingDraft>>;
  deleteDraft(input: {
    readonly conversationId: string;
    readonly idempotencyKey: string;
  }): Promise<ApiResponse<{ readonly removed: boolean }>>;
  getSettings(): Promise<ApiResponse<MessagingUserSettings>>;
  updateSettings(input: {
    readonly directMessagePolicy?: 'EVERYONE' | 'NOBODY';
    readonly readReceiptsEnabled?: boolean;
    readonly notificationLevel?: 'ALL' | 'MENTIONS' | 'NONE';
    readonly idempotencyKey: string;
  }): Promise<ApiResponse<MessagingUserSettings>>;
  setBlock(input: {
    readonly userId: string;
    readonly active: boolean;
    readonly idempotencyKey: string;
  }): Promise<
    ApiResponse<{ readonly blockedUserId: string; readonly blocked: boolean }>
  >;
  search(
    input: MessagingSdkPageInput & { readonly query: string },
  ): Promise<ApiResponse<MessagingCursorPage<MessagingSearchResult>>>;
  reportMessage(input: {
    readonly messageId: string;
    readonly reason: MessagingReportReason;
    readonly details?: string | null;
    readonly idempotencyKey: string;
  }): Promise<ApiResponse<MessagingReport>>;
  setTyping(input: {
    readonly conversationId: string;
    readonly active: boolean;
  }): Promise<
    ApiResponse<{ readonly accepted: boolean; readonly realtimeAvailable: boolean }>
  >;
  getPresence(userId: string): Promise<ApiResponse<MessagingPresence>>;
  updatePresence(input: {
    readonly status: MessagingPresence['status'];
    readonly ttlMs?: number;
  }): Promise<ApiResponse<MessagingPresence>>;
}

export function createMessagingSdk(transport: MeZipSdkTransport): MessagingSdk {
  const id = encodeURIComponent;
  return {
    listConversations: (input = {}) =>
      transport.request({
        method: 'GET',
        path: '/v1/messaging/conversations',
        query: {
          cursor: input.cursor,
          limit: input.limit,
          includeArchived: input.includeArchived,
        },
      }),
    getConversation: (conversationId) =>
      transport.request({
        method: 'GET',
        path: `/v1/messaging/conversations/${id(conversationId)}`,
      }),
    listFounderInbox: (input = {}) =>
      transport.request({
        method: 'GET',
        path: '/v1/messaging/founder/inbox',
        query: { cursor: input.cursor, limit: input.limit },
      }),
    openDirect: ({ idempotencyKey, ...body }) =>
      transport.request({
        method: 'POST',
        path: '/v1/messaging/conversations/direct',
        body,
        idempotencyKey,
      }),
    createMessageRequest: ({ idempotencyKey, ...body }) =>
      transport.request({
        method: 'POST',
        path: '/v1/messaging/requests',
        body,
        idempotencyKey,
      }),
    openGroup: ({ idempotencyKey, ...body }) =>
      transport.request({
        method: 'POST',
        path: '/v1/messaging/conversations/group',
        body,
        idempotencyKey,
      }),
    openFounderInbox: ({ idempotencyKey }) =>
      transport.request({
        method: 'POST',
        path: '/v1/messaging/founder/conversation',
        idempotencyKey,
      }),
    resolveMessageRequest: ({ conversationId, idempotencyKey, ...body }) =>
      transport.request({
        method: 'POST',
        path: `/v1/messaging/conversations/${id(conversationId)}/request`,
        body,
        idempotencyKey,
      }),
    updateConversationPreferences: ({ conversationId, idempotencyKey, ...body }) =>
      transport.request({
        method: 'PATCH',
        path: `/v1/messaging/conversations/${id(conversationId)}/preferences`,
        body,
        idempotencyKey,
      }),
    listMessages: ({ conversationId, cursor, limit, beforeSequence }) =>
      transport.request({
        method: 'GET',
        path: `/v1/messaging/conversations/${id(conversationId)}/messages`,
        query: { cursor, limit, beforeSequence },
      }),
    backfill: ({ conversationId, afterSequence, cursor, limit }) =>
      transport.request({
        method: 'GET',
        path: `/v1/messaging/conversations/${id(conversationId)}/messages/backfill`,
        query: { afterSequence, cursor, limit },
      }),
    send: ({ conversationId, idempotencyKey, ...body }) =>
      transport.request({
        method: 'POST',
        path: `/v1/messaging/conversations/${id(conversationId)}/messages`,
        body,
        idempotencyKey,
      }),
    updateMessage: ({ messageId, idempotencyKey, ...body }) =>
      transport.request({
        method: 'PATCH',
        path: `/v1/messaging/messages/${id(messageId)}`,
        body,
        idempotencyKey,
      }),
    deleteMessage: ({ messageId, idempotencyKey }) =>
      transport.request({
        method: 'DELETE',
        path: `/v1/messaging/messages/${id(messageId)}`,
        idempotencyKey,
      }),
    setReaction: ({ messageId, type, active, idempotencyKey }) =>
      transport.request({
        method: active ? 'PUT' : 'DELETE',
        path: `/v1/messaging/messages/${id(messageId)}/reactions/${id(type)}`,
        idempotencyKey,
      }),
    markRead: ({ conversationId, idempotencyKey, ...body }) =>
      transport.request({
        method: 'POST',
        path: `/v1/messaging/conversations/${id(conversationId)}/read`,
        body,
        idempotencyKey,
      }),
    markUnread: ({ conversationId, idempotencyKey, ...body }) =>
      transport.request({
        method: 'POST',
        path: `/v1/messaging/conversations/${id(conversationId)}/unread`,
        body,
        idempotencyKey,
      }),
    getUnreadSummary: () =>
      transport.request({ method: 'GET', path: '/v1/messaging/unread' }),
    getRealtimeHandshake: () =>
      transport.request({ method: 'GET', path: '/v1/messaging/realtime' }),
    getDraft: (conversationId) =>
      transport.request({
        method: 'GET',
        path: `/v1/messaging/conversations/${id(conversationId)}/draft`,
      }),
    saveDraft: ({ conversationId, idempotencyKey, ...body }) =>
      transport.request({
        method: 'PUT',
        path: `/v1/messaging/conversations/${id(conversationId)}/draft`,
        body,
        idempotencyKey,
      }),
    deleteDraft: ({ conversationId, idempotencyKey }) =>
      transport.request({
        method: 'DELETE',
        path: `/v1/messaging/conversations/${id(conversationId)}/draft`,
        idempotencyKey,
      }),
    getSettings: () =>
      transport.request({ method: 'GET', path: '/v1/messaging/settings' }),
    updateSettings: ({ idempotencyKey, ...body }) =>
      transport.request({
        method: 'PATCH',
        path: '/v1/messaging/settings',
        body,
        idempotencyKey,
      }),
    setBlock: ({ userId, active, idempotencyKey }) =>
      transport.request({
        method: active ? 'PUT' : 'DELETE',
        path: `/v1/messaging/blocks/${id(userId)}`,
        idempotencyKey,
      }),
    search: ({ query, cursor, limit }) =>
      transport.request({
        method: 'GET',
        path: '/v1/messaging/search',
        query: { q: query, cursor, limit },
      }),
    reportMessage: ({ messageId, idempotencyKey, ...body }) =>
      transport.request({
        method: 'POST',
        path: `/v1/messaging/messages/${id(messageId)}/reports`,
        body,
        idempotencyKey,
      }),
    setTyping: ({ conversationId, ...body }) =>
      transport.request({
        method: 'POST',
        path: `/v1/messaging/conversations/${id(conversationId)}/typing`,
        body,
      }),
    getPresence: (userId) =>
      transport.request({
        method: 'GET',
        path: `/v1/messaging/presence/${id(userId)}`,
      }),
    updatePresence: (body) =>
      transport.request({ method: 'PATCH', path: '/v1/messaging/presence', body }),
  };
}

/** Realtime connections are platform-owned. The REST SDK exposes the typed
 * fallback endpoint; Web/Mini supply their authenticated transport instance. */
export interface MessagingSdkRealtime {
  readonly transport: MessagingRealtimeTransport;
  readonly fallback: MessagingRealtimeFallback;
}

export function createMessagingSdkRealtime(
  transport: MeZipSdkTransport,
  realtimeTransport: MessagingRealtimeTransport,
): MessagingSdkRealtime {
  return {
    transport: realtimeTransport,
    fallback: {
      backfill: async ({ conversationId, afterSequence, limit }) => {
        const response = await transport.request<
          MessagingCursorPage<MessagingMessageView>
        >({
          method: 'GET',
          path: `/v1/messaging/conversations/${encodeURIComponent(conversationId)}/messages/backfill`,
          query: { afterSequence, limit },
        });
        if ('error' in response) throw new Error(response.error.message);
        return response.data;
      },
    },
  };
}

/** Typed consumer facade for the server-authoritative Phase 6 domain. No
 * method accepts a price, payment success flag, entitlement override, user id,
 * admin/root field, or callback signature. */
export interface MembershipSdk {
  getOverview(): Promise<ApiResponse<MembershipCenter>>;
  listPlans(): Promise<ApiResponse<readonly MembershipPlan[]>>;
  listPaymentProviders(): Promise<
    ApiResponse<readonly MembershipPaymentProviderAvailability[]>
  >;
  listHistory(): Promise<ApiResponse<readonly MembershipHistoryEvent[]>>;
  listBenefits(): Promise<ApiResponse<readonly MembershipBenefitGrant[]>>;
  listCampaigns(): Promise<ApiResponse<readonly MembershipCampaign[]>>;
  listCoupons(): Promise<ApiResponse<readonly MembershipCoupon[]>>;
  listRedemptions(): Promise<ApiResponse<readonly MembershipRedemption[]>>;
  listOrders(): Promise<ApiResponse<readonly MembershipOrder[]>>;
  getOrder(orderId: string): Promise<ApiResponse<MembershipOrder>>;
  createCheckout(input: {
    readonly planCode: Exclude<PlanCode, 'FREE'>;
    readonly provider: PaymentProviderCode;
    readonly couponCode?: string;
    readonly idempotencyKey: string;
  }): Promise<ApiResponse<MembershipCheckout>>;
  redeemCode(input: {
    readonly code: string;
    readonly idempotencyKey: string;
  }): Promise<ApiResponse<MembershipRedemption>>;
  claimCampaign(input: {
    readonly campaignId: string;
    readonly idempotencyKey: string;
  }): Promise<ApiResponse<MembershipCampaignClaim>>;
  requestRefund(input: {
    readonly orderId: string;
    readonly reason: string;
    readonly idempotencyKey: string;
  }): Promise<ApiResponse<MembershipRefund>>;
}

export function createMembershipSdk(transport: MeZipSdkTransport): MembershipSdk {
  return {
    getOverview: () =>
      transport.request<MembershipCenter>({
        method: 'GET',
        path: '/v1/membership/overview',
      }),
    listPlans: () =>
      transport.request<readonly MembershipPlan[]>({
        method: 'GET',
        path: '/v1/membership/plans',
      }),
    listPaymentProviders: () =>
      transport.request<readonly MembershipPaymentProviderAvailability[]>({
        method: 'GET',
        path: '/v1/membership/payment-providers',
      }),
    listHistory: () =>
      transport.request<readonly MembershipHistoryEvent[]>({
        method: 'GET',
        path: '/v1/membership/history',
      }),
    listBenefits: () =>
      transport.request<readonly MembershipBenefitGrant[]>({
        method: 'GET',
        path: '/v1/membership/benefits',
      }),
    listCampaigns: () =>
      transport.request<readonly MembershipCampaign[]>({
        method: 'GET',
        path: '/v1/membership/campaigns',
      }),
    listCoupons: () =>
      transport.request<readonly MembershipCoupon[]>({
        method: 'GET',
        path: '/v1/membership/coupons',
      }),
    listRedemptions: () =>
      transport.request<readonly MembershipRedemption[]>({
        method: 'GET',
        path: '/v1/membership/redemptions',
      }),
    listOrders: () =>
      transport.request<readonly MembershipOrder[]>({
        method: 'GET',
        path: '/v1/billing/orders',
      }),
    getOrder: (orderId) =>
      transport.request<MembershipOrder>({
        method: 'GET',
        path: `/v1/billing/orders/${encodeURIComponent(orderId)}`,
      }),
    createCheckout: ({ idempotencyKey, ...body }) =>
      transport.request<MembershipCheckout>({
        method: 'POST',
        path: '/v1/billing/checkouts',
        body,
        idempotencyKey,
      }),
    redeemCode: ({ idempotencyKey, ...body }) =>
      transport.request<MembershipRedemption>({
        method: 'POST',
        path: '/v1/membership/redemptions',
        body,
        idempotencyKey,
      }),
    claimCampaign: ({ campaignId, idempotencyKey }) =>
      transport.request<MembershipCampaignClaim>({
        method: 'POST',
        path: `/v1/membership/campaigns/${encodeURIComponent(campaignId)}/claims`,
        body: {},
        idempotencyKey,
      }),
    requestRefund: ({ orderId, idempotencyKey, ...body }) =>
      transport.request<MembershipRefund>({
        method: 'POST',
        path: `/v1/billing/orders/${encodeURIComponent(orderId)}/refund-requests`,
        body,
        idempotencyKey,
      }),
  };
}

export interface AiUsageSdkRangeInput {
  readonly from?: string;
  readonly to?: string;
  readonly limit?: number;
}

/** Typed consumer facade for Phase 7. It deliberately has no device
 * credential, user id, source, platform authority, Root flag, or raw activity
 * hash method. Device pairing completion/ingestion is restricted to the
 * platform collector boundary rather than the ordinary UI SDK. */
export interface AiUsageSdk {
  listApps(): Promise<ApiResponse<readonly AiUsageAppRegistryEntry[]>>;
  listProviders(): Promise<ApiResponse<readonly AiUsageProviderRegistryEntry[]>>;
  getOverview(input?: AiUsageSdkRangeInput): Promise<ApiResponse<AiUsageOverview>>;
  getPreferences(): Promise<ApiResponse<AiUsageTrackingPreferences>>;
  updatePreferences(input: {
    readonly enabled?: boolean;
    readonly windowsAgentEnabled?: boolean;
    readonly browserExtensionEnabled?: boolean;
    readonly idleThresholdSeconds?: number;
    readonly timezone?: string;
  }): Promise<ApiResponse<AiUsageTrackingPreferences>>;
  listDevices(): Promise<ApiResponse<readonly AiUsageDevice[]>>;
  listPairings(): Promise<ApiResponse<readonly AiUsagePairing[]>>;
  /** The pairing code is shown once to the authenticated owner. It is never
   * stored in UI state as a device credential. */
  createPairing(input: {
    readonly deviceType: AiUsageDeviceType;
    readonly deviceLabel?: string;
    /** Accepted for UI action correlation only; pairing codes are one-time
     * secrets and are deliberately not replayed from durable state. */
    readonly idempotencyKey?: string;
  }): Promise<ApiResponse<AiUsagePairingStart>>;
  revokeDevice(input: {
    readonly deviceId: string;
    readonly idempotencyKey?: string;
  }): Promise<ApiResponse<AiUsageDevice>>;
  listSessions(
    input?: AiUsageSdkRangeInput,
  ): Promise<ApiResponse<readonly AiUsageSession[]>>;
  createManualSession(input: {
    readonly appCode: AiUsageAppCode;
    readonly startedAt: string;
    readonly endedAt: string;
    readonly activeSeconds: number;
    readonly idleSeconds?: number;
    readonly idempotencyKey: string;
  }): Promise<ApiResponse<AiUsageSession>>;
  importSession(input: {
    readonly appCode: AiUsageAppCode;
    readonly startedAt: string;
    readonly endedAt: string;
    readonly activeSeconds: number;
    readonly idleSeconds?: number;
    readonly externalRecordId: string;
    readonly idempotencyKey: string;
  }): Promise<ApiResponse<AiUsageSession>>;
  correctSession(input: {
    readonly sessionId: string;
    readonly startedAt?: string;
    readonly endedAt?: string;
    readonly activeSeconds?: number;
    readonly idleSeconds?: number;
    readonly reason: string;
    readonly idempotencyKey?: string;
  }): Promise<ApiResponse<AiUsageSession>>;
  deleteSession(input: {
    readonly sessionId: string;
    readonly reason: string;
    readonly idempotencyKey?: string;
  }): Promise<ApiResponse<AiUsageSession>>;
  deleteUsageRange(input: {
    readonly from: string;
    readonly to: string;
    readonly reason: string;
    readonly idempotencyKey: string;
  }): Promise<ApiResponse<AiUsageRangeDeleteResult>>;
  exportUsage(input?: AiUsageSdkRangeInput): Promise<ApiResponse<AiUsageExport>>;
}

export function createAiUsageSdk(transport: MeZipSdkTransport): AiUsageSdk {
  const id = encodeURIComponent;
  const query = (input: AiUsageSdkRangeInput = {}) => ({
    from: input.from,
    to: input.to,
    limit: input.limit,
  });
  return {
    listApps: () => transport.request({ method: 'GET', path: '/v1/ai-usage/apps' }),
    listProviders: () =>
      transport.request({ method: 'GET', path: '/v1/ai-usage/providers' }),
    getOverview: (input = {}) =>
      transport.request({
        method: 'GET',
        path: '/v1/ai-usage/overview',
        query: query(input),
      }),
    getPreferences: () =>
      transport.request({ method: 'GET', path: '/v1/ai-usage/preferences' }),
    updatePreferences: (body) =>
      transport.request({ method: 'PATCH', path: '/v1/ai-usage/preferences', body }),
    listDevices: () =>
      transport.request({ method: 'GET', path: '/v1/ai-usage/devices' }),
    listPairings: () =>
      transport.request({ method: 'GET', path: '/v1/ai-usage/pairings' }),
    createPairing: ({ idempotencyKey, ...body }) =>
      transport.request({
        method: 'POST',
        path: '/v1/ai-usage/pairings',
        body,
        ...(idempotencyKey === undefined ? {} : { idempotencyKey }),
      }),
    revokeDevice: ({ deviceId, idempotencyKey }) =>
      transport.request({
        method: 'DELETE',
        path: `/v1/ai-usage/devices/${id(deviceId)}`,
        ...(idempotencyKey === undefined ? {} : { idempotencyKey }),
      }),
    listSessions: (input = {}) =>
      transport.request({
        method: 'GET',
        path: '/v1/ai-usage/sessions',
        query: query(input),
      }),
    createManualSession: (body) =>
      transport.request({ method: 'POST', path: '/v1/ai-usage/manual-sessions', body }),
    importSession: (body) =>
      transport.request({ method: 'POST', path: '/v1/ai-usage/imports', body }),
    correctSession: ({ sessionId, idempotencyKey, ...body }) =>
      transport.request({
        method: 'PATCH',
        path: `/v1/ai-usage/sessions/${id(sessionId)}`,
        body,
        ...(idempotencyKey === undefined ? {} : { idempotencyKey }),
      }),
    deleteSession: ({ sessionId, idempotencyKey, ...body }) =>
      transport.request({
        method: 'DELETE',
        path: `/v1/ai-usage/sessions/${id(sessionId)}`,
        body,
        ...(idempotencyKey === undefined ? {} : { idempotencyKey }),
      }),
    deleteUsageRange: (body) =>
      transport.request({ method: 'DELETE', path: '/v1/ai-usage/sessions', body }),
    exportUsage: (input = {}) =>
      transport.request({
        method: 'GET',
        path: '/v1/ai-usage/export',
        query: query(input),
      }),
  };
}

export interface AiGatewaySdkPageInput {
  readonly cursor?: string;
  readonly limit?: number;
}

/** Typed self-service facade for the Phase 8 AI Gateway. The transport owns
 * authentication; this SDK intentionally has no owner id, Root flag, quota or
 * cost override, provider API key, plaintext BYOK secret, or raw credential
 * read method. */
export interface AiGatewaySdk {
  listProviders(): Promise<ApiResponse<readonly AiGatewayProviderRegistryEntry[]>>;
  listModels(): Promise<ApiResponse<readonly AiGatewayModelRegistryEntry[]>>;
  listCapabilities(): Promise<ApiResponse<readonly AiGatewayCapabilityRegistryEntry[]>>;
  getQuota(): Promise<ApiResponse<AiGatewayQuota>>;
  getPreferences(): Promise<ApiResponse<AiGatewayPreferences>>;
  updatePreferences(input: {
    readonly defaultProviderCode?: AiGatewayProviderCode | null;
    readonly defaultModelCode?: string | null;
  }): Promise<ApiResponse<AiGatewayPreferences>>;
  createInvocation(input: {
    readonly modelCode: string;
    readonly capabilityCode: AiGatewayCapabilityCode;
    readonly messages: readonly AiGatewayInvocationMessage[];
    readonly stream?: boolean;
    readonly conversationId?: string;
    readonly idempotencyKey: string;
  }): Promise<ApiResponse<AiGatewayInvocation>>;
  listConversations(
    input?: AiGatewaySdkPageInput,
  ): Promise<ApiResponse<AiGatewayConversationPage>>;
  createConversation(input: {
    readonly title?: string;
    readonly idempotencyKey: string;
  }): Promise<ApiResponse<AiGatewayConversation>>;
  deleteConversation(input: {
    readonly conversationId: string;
    readonly idempotencyKey: string;
  }): Promise<ApiResponse<AiGatewayConversation>>;
  getInvocation(invocationId: string): Promise<ApiResponse<AiGatewayInvocation>>;
  listInvocations(
    input?: AiGatewaySdkPageInput,
  ): Promise<ApiResponse<AiGatewayInvocationPage>>;
  cancelInvocation(input: {
    readonly invocationId: string;
    readonly idempotencyKey: string;
  }): Promise<ApiResponse<AiGatewayInvocation>>;
  listEvents(input: {
    readonly invocationId: string;
    readonly afterSequence?: number;
    readonly limit?: number;
  }): Promise<ApiResponse<AiGatewayInvocationEventPage>>;
  /** Returns a transport-neutral stream bootstrap. Clients must still use an
   * authenticated transport to read the returned event path. */
  getStreamHandshake(
    invocationId: string,
  ): Promise<ApiResponse<AiGatewayStreamHandshake>>;
  getByokStatus(): Promise<ApiResponse<readonly AiGatewayByokProviderStatus[]>>;
  configureByok(input: {
    readonly providerCode: Exclude<AiGatewayProviderCode, 'LOCAL'>;
    readonly encryptedEnvelope: AiGatewayByokEncryptedEnvelope;
    readonly idempotencyKey: string;
  }): Promise<ApiResponse<AiGatewayByokProviderStatus>>;
  revokeByok(input: {
    readonly providerCode: Exclude<AiGatewayProviderCode, 'LOCAL'>;
    readonly idempotencyKey: string;
  }): Promise<ApiResponse<AiGatewayByokProviderStatus>>;
}

export function createAiGatewaySdk(transport: MeZipSdkTransport): AiGatewaySdk {
  const id = encodeURIComponent;
  return {
    listProviders: () =>
      transport.request({ method: 'GET', path: '/v1/ai-gateway/providers' }),
    listModels: () =>
      transport.request({ method: 'GET', path: '/v1/ai-gateway/models' }),
    listCapabilities: () =>
      transport.request({ method: 'GET', path: '/v1/ai-gateway/capabilities' }),
    getQuota: () => transport.request({ method: 'GET', path: '/v1/ai-gateway/quota' }),
    getPreferences: () =>
      transport.request({ method: 'GET', path: '/v1/ai-gateway/preferences' }),
    updatePreferences: (body) =>
      transport.request({ method: 'PATCH', path: '/v1/ai-gateway/preferences', body }),
    createInvocation: ({ idempotencyKey, ...body }) =>
      transport.request({
        method: 'POST',
        path: '/v1/ai-gateway/invocations',
        body,
        idempotencyKey,
      }),
    listConversations: (input = {}) =>
      transport.request({
        method: 'GET',
        path: '/v1/ai-gateway/conversations',
        query: { cursor: input.cursor, limit: input.limit },
      }),
    createConversation: ({ idempotencyKey, ...body }) =>
      transport.request({
        method: 'POST',
        path: '/v1/ai-gateway/conversations',
        body,
        idempotencyKey,
      }),
    deleteConversation: ({ conversationId, idempotencyKey }) =>
      transport.request({
        method: 'DELETE',
        path: `/v1/ai-gateway/conversations/${id(conversationId)}`,
        idempotencyKey,
      }),
    getInvocation: (invocationId) =>
      transport.request({
        method: 'GET',
        path: `/v1/ai-gateway/invocations/${id(invocationId)}`,
      }),
    listInvocations: (input = {}) =>
      transport.request({
        method: 'GET',
        path: '/v1/ai-gateway/invocations',
        query: { cursor: input.cursor, limit: input.limit },
      }),
    cancelInvocation: ({ invocationId, idempotencyKey }) =>
      transport.request({
        method: 'POST',
        path: `/v1/ai-gateway/invocations/${id(invocationId)}/cancel`,
        body: {},
        idempotencyKey,
      }),
    listEvents: ({ invocationId, afterSequence, limit }) =>
      transport.request({
        method: 'GET',
        path: `/v1/ai-gateway/invocations/${id(invocationId)}/events`,
        query: { afterSequence, limit },
      }),
    getStreamHandshake: (invocationId) =>
      transport.request({
        method: 'GET',
        path: `/v1/ai-gateway/invocations/${id(invocationId)}/stream`,
      }),
    getByokStatus: () =>
      transport.request({ method: 'GET', path: '/v1/ai-gateway/byok' }),
    configureByok: ({ providerCode, idempotencyKey, ...body }) =>
      transport.request({
        method: 'PUT',
        path: `/v1/ai-gateway/byok/${id(providerCode)}`,
        body,
        idempotencyKey,
      }),
    revokeByok: ({ providerCode, idempotencyKey }) =>
      transport.request({
        method: 'DELETE',
        path: `/v1/ai-gateway/byok/${id(providerCode)}`,
        idempotencyKey,
      }),
  };
}

export interface PersonalAISdkSourceInput {
  readonly scope?: PersonalAIContextScope | undefined;
  readonly from?: string | undefined;
  readonly to?: string | undefined;
  readonly sourceTypes?: readonly PersonalAIKnowledgeSourceType[] | undefined;
}

export interface PersonalAISdkIndexInput {
  readonly scope: PersonalAIContextScope;
  readonly dateRange?: PersonalAIDateRange | undefined;
  readonly sourceTypes?: readonly PersonalAIKnowledgeSourceType[] | undefined;
  readonly selectedEntryIds?: readonly string[] | undefined;
  readonly selectedMediaIds?: readonly string[] | undefined;
  readonly includeHistoricalRevisions?: boolean | undefined;
  /** Reused for an exact retry; sent as an idempotency header, never persisted
   * in the JSON body or interpreted as an owner/authority field. */
  readonly idempotencyKey?: string | undefined;
}

/** Typed self-only facade for Ask My Archive. Authentication/session headers
 * belong to the transport; this interface has no owner/root/plan/provider-key
 * fields and defaults to explicit NONE scope in callers. */
export interface PersonalAISdk {
  getPrivacy(): Promise<ApiResponse<PersonalAIPrivacyView>>;
  getPreferences(): Promise<ApiResponse<PersonalAIPreferences>>;
  updatePreferences(
    input: Partial<
      Pick<
        PersonalAIPreferences,
        'enabled' | 'archiveMode' | 'defaultScope' | 'includeHistoricalRevisions'
      >
    >,
  ): Promise<ApiResponse<PersonalAIPreferences>>;
  getConsent(): Promise<ApiResponse<PersonalAIConsent>>;
  acceptConsent(version: string): Promise<ApiResponse<PersonalAIConsent>>;
  listSources(
    input?: PersonalAISdkSourceInput,
  ): Promise<ApiResponse<readonly PersonalAIKnowledgeSource[]>>;
  getIndexStatus(): Promise<ApiResponse<PersonalAIIndexStatusView>>;
  createIndexJob(
    input: PersonalAISdkIndexInput,
  ): Promise<ApiResponse<PersonalAIIndexJob>>;
  listIndexJobs(
    input?: AiGatewaySdkPageInput,
  ): Promise<
    ApiResponse<{
      readonly items: readonly PersonalAIIndexJob[];
      readonly nextCursor: string | null;
    }>
  >;
  rebuildIndex(
    input: PersonalAISdkIndexInput,
  ): Promise<ApiResponse<PersonalAIIndexJob>>;
  clearIndex(): Promise<ApiResponse<PersonalAIIndexStatusView>>;
  createExport(
    input?: PersonalAIExportRequest,
  ): Promise<ApiResponse<PersonalAIExportStatusView>>;
  getExport(exportId: string): Promise<ApiResponse<PersonalAIExportStatusView>>;
  listExports(
    input?: AiGatewaySdkPageInput,
  ): Promise<ApiResponse<PersonalAIExportPage>>;
  query(
    input: PersonalAIQueryInput & { readonly idempotencyKey: string },
  ): Promise<ApiResponse<PersonalAIQueryResult>>;
  askArchive(
    input: PersonalAIQueryInput & { readonly idempotencyKey: string },
  ): Promise<ApiResponse<PersonalAIQueryResult>>;
  getQuery(queryId: string): Promise<ApiResponse<PersonalAIQueryResult>>;
  listQueries(input?: AiGatewaySdkPageInput): Promise<ApiResponse<PersonalAIQueryPage>>;
  listCitations(queryId: string): Promise<ApiResponse<PersonalAICitationPage>>;
  cancelQuery(
    queryId: string,
  ): Promise<
    ApiResponse<{
      readonly queryId: string;
      readonly cancelled: boolean;
      readonly status: string;
    }>
  >;
  relatedMemories(input: {
    readonly sourceType: PersonalAIKnowledgeSourceType;
    readonly sourceId: string;
    readonly limit?: number | undefined;
  }): Promise<ApiResponse<unknown>>;
  createConversation(input?: {
    readonly scope?: PersonalAIContextScope | undefined;
  }): Promise<ApiResponse<PersonalAIConversation>>;
  listConversations(): Promise<ApiResponse<readonly PersonalAIConversation[]>>;
  deleteConversation(
    conversationId: string,
  ): Promise<ApiResponse<PersonalAIConversation>>;
  listInsights(): Promise<
    ApiResponse<
      readonly {
        readonly id: string;
        readonly queryId: string;
        readonly title: string | null;
        readonly content: string;
        readonly createdAt: string;
        readonly deletedAt: string | null;
      }[]
    >
  >;
  saveInsight(queryId: string, title?: string | null): Promise<ApiResponse<unknown>>;
  deleteInsight(insightId: string): Promise<ApiResponse<{ readonly deleted: boolean }>>;
  clearInsights(): Promise<ApiResponse<{ readonly deletedCount: number }>>;
}

export function createPersonalAISdk(transport: MeZipSdkTransport): PersonalAISdk {
  const id = encodeURIComponent;
  const page = (input: AiGatewaySdkPageInput = {}) => ({
    cursor: input.cursor,
    limit: input.limit,
  });
  return {
    getPrivacy: () =>
      transport.request({ method: 'GET', path: '/v1/personal-ai/privacy' }),
    getPreferences: () =>
      transport.request({ method: 'GET', path: '/v1/personal-ai/preferences' }),
    updatePreferences: (body) =>
      transport.request({ method: 'PATCH', path: '/v1/personal-ai/preferences', body }),
    getConsent: () =>
      transport.request({ method: 'GET', path: '/v1/personal-ai/consent' }),
    acceptConsent: (version) =>
      transport.request({
        method: 'PUT',
        path: '/v1/personal-ai/consent',
        body: { version },
      }),
    listSources: (input = {}) =>
      transport.request({
        method: 'GET',
        path: '/v1/personal-ai/sources',
        query: {
          scope: input.scope ?? 'NONE',
          from: input.from,
          to: input.to,
          sourceTypes: input.sourceTypes?.join(','),
        },
      }),
    getIndexStatus: () =>
      transport.request({ method: 'GET', path: '/v1/personal-ai/index-status' }),
    createIndexJob: ({ idempotencyKey, ...body }) =>
      transport.request({
        method: 'POST',
        path: '/v1/personal-ai/index-jobs',
        body,
        ...(idempotencyKey === undefined ? {} : { idempotencyKey }),
      }),
    listIndexJobs: (input = {}) =>
      transport.request({
        method: 'GET',
        path: '/v1/personal-ai/index-jobs',
        query: page(input),
      }),
    rebuildIndex: ({ idempotencyKey, ...body }) =>
      transport.request({
        method: 'POST',
        path: '/v1/personal-ai/index/rebuild',
        body,
        ...(idempotencyKey === undefined ? {} : { idempotencyKey }),
      }),
    clearIndex: () =>
      transport.request({ method: 'DELETE', path: '/v1/personal-ai/index', body: {} }),
    createExport: (body = {}) =>
      transport.request({ method: 'POST', path: '/v1/personal-ai/exports', body }),
    getExport: (exportId) =>
      transport.request({
        method: 'GET',
        path: `/v1/personal-ai/exports/${id(exportId)}`,
      }),
    listExports: (input = {}) =>
      transport.request({
        method: 'GET',
        path: '/v1/personal-ai/exports',
        query: page(input),
      }),
    query: ({ idempotencyKey, ...body }) =>
      transport.request({
        method: 'POST',
        path: '/v1/personal-ai/queries',
        body,
        idempotencyKey,
      }),
    askArchive: ({ idempotencyKey, ...body }) =>
      transport.request({
        method: 'POST',
        path: '/v1/personal-ai/queries',
        body,
        idempotencyKey,
      }),
    getQuery: (queryId) =>
      transport.request({
        method: 'GET',
        path: `/v1/personal-ai/queries/${id(queryId)}`,
      }),
    listQueries: (input = {}) =>
      transport.request({
        method: 'GET',
        path: '/v1/personal-ai/queries',
        query: page(input),
      }),
    listCitations: (queryId) =>
      transport.request({
        method: 'GET',
        path: `/v1/personal-ai/queries/${id(queryId)}/citations`,
      }),
    cancelQuery: (queryId) =>
      transport.request({
        method: 'POST',
        path: `/v1/personal-ai/queries/${id(queryId)}/cancel`,
        body: {},
      }),
    relatedMemories: ({ sourceType, sourceId, limit }) =>
      transport.request({
        method: 'GET',
        path: '/v1/personal-ai/related-memories',
        query: { sourceType, sourceId, limit },
      }),
    createConversation: (body = {}) =>
      transport.request({
        method: 'POST',
        path: '/v1/personal-ai/conversations',
        body,
      }),
    listConversations: () =>
      transport.request({ method: 'GET', path: '/v1/personal-ai/conversations' }),
    deleteConversation: (conversationId) =>
      transport.request({
        method: 'DELETE',
        path: `/v1/personal-ai/conversations/${id(conversationId)}`,
        body: {},
      }),
    listInsights: () =>
      transport.request({ method: 'GET', path: '/v1/personal-ai/insights' }),
    saveInsight: (queryId, title = null) =>
      transport.request({
        method: 'POST',
        path: `/v1/personal-ai/queries/${id(queryId)}/insight`,
        body: { title },
      }),
    deleteInsight: (insightId) =>
      transport.request({
        method: 'DELETE',
        path: `/v1/personal-ai/insights/${id(insightId)}`,
        body: {},
      }),
    clearInsights: () =>
      transport.request({
        method: 'DELETE',
        path: '/v1/personal-ai/insights',
        body: {},
      }),
  };
}

export interface SandboxRuntimeSdk {
  listRuntimes(projectId?: string): Promise<ApiResponse<SandboxRuntimePage>>;
  getRuntime(runtimeId: string): Promise<ApiResponse<SandboxRuntime>>;
  createRuntime(
    projectId: string,
    input: {
      readonly runtimeImage?: string;
      readonly networkMode: 'DENY_ALL' | 'REGISTRY_ONLY' | 'ALLOWLIST';
      readonly allowedHosts: readonly string[];
      readonly allowedPorts: readonly number[];
    },
  ): Promise<ApiResponse<SandboxRuntime>>;
  startRuntime(runtimeId: string): Promise<ApiResponse<SandboxRuntime>>;
  stopRuntime(runtimeId: string): Promise<ApiResponse<SandboxRuntime>>;
  restartRuntime(runtimeId: string): Promise<ApiResponse<SandboxRuntime>>;
  destroyRuntime(runtimeId: string): Promise<ApiResponse<SandboxRuntime>>;
  runCommand(
    runtimeId: string,
    input: {
      readonly command: string;
      readonly timeoutMs?: number;
      readonly workingDirectory?: string;
    },
  ): Promise<ApiResponse<SandboxRuntimeTask>>;
  runTask(
    runtimeId: string,
    type: SandboxRuntimeTaskType,
    timeoutMs?: number,
  ): Promise<ApiResponse<SandboxRuntimeTask>>;
  cancelTask(
    runtimeId: string,
    taskId: string,
  ): Promise<ApiResponse<SandboxRuntimeTask>>;
  listTasks(runtimeId: string): Promise<ApiResponse<SandboxRuntimeTaskPage>>;
  listLogs(
    runtimeId: string,
    cursor?: string,
  ): Promise<ApiResponse<SandboxRuntimeLogPage>>;
  exposePort(
    runtimeId: string,
    input: {
      readonly internalPort: number;
      readonly protocol: 'HTTP' | 'HTTPS' | 'WS';
    },
  ): Promise<ApiResponse<SandboxRuntimePort>>;
  createPreview(
    runtimeId: string,
    portId: string,
  ): Promise<ApiResponse<SandboxPreview>>;
  getPreview(
    runtimeId: string,
    previewId: string,
  ): Promise<ApiResponse<SandboxPreview>>;
  syncWorkspace(
    runtimeId: string,
    input: {
      readonly changeIds: readonly string[];
      readonly expectedWorkspaceVersion: number;
    },
  ): Promise<ApiResponse<readonly SandboxWorkspaceChange[]>>;
  getUsage(runtimeId: string): Promise<ApiResponse<SandboxRuntimeUsage>>;
  listArtifacts(
    runtimeId: string,
  ): Promise<ApiResponse<readonly SandboxRuntimeArtifact[]>>;
  listProblems(runtimeId: string): Promise<ApiResponse<SandboxRuntimeProblemPage>>;
  listWorkspaceChanges(
    runtimeId: string,
  ): Promise<ApiResponse<readonly SandboxWorkspaceChange[]>>;
  detectWorkspaceChanges(
    runtimeId: string,
  ): Promise<ApiResponse<readonly SandboxWorkspaceChange[]>>;
  reviewWorkspaceChange(
    runtimeId: string,
    changeId: string,
    action: 'REVIEW' | 'REJECT' | 'APPLY',
  ): Promise<ApiResponse<SandboxWorkspaceChange>>;
  listTerminals(runtimeId: string): Promise<ApiResponse<SandboxTerminalSessionPage>>;
  openTerminal(
    runtimeId: string,
    input?: { readonly columns?: number; readonly rows?: number },
  ): Promise<ApiResponse<SandboxTerminalSession>>;
  writeTerminal(
    runtimeId: string,
    sessionId: string,
    input: string,
  ): Promise<ApiResponse<SandboxRuntimeLog>>;
  resizeTerminal(
    runtimeId: string,
    sessionId: string,
    input: { readonly columns: number; readonly rows: number },
  ): Promise<ApiResponse<SandboxTerminalSession>>;
  closeTerminal(
    runtimeId: string,
    sessionId: string,
  ): Promise<ApiResponse<SandboxTerminalSession>>;
  listEnvironment(
    runtimeId: string,
  ): Promise<ApiResponse<readonly SandboxRuntimeEnvironmentVariable[]>>;
  injectSecretReference(
    runtimeId: string,
    input: { readonly key: string; readonly secretReference: string },
  ): Promise<ApiResponse<SandboxRuntimeEnvironmentVariable>>;
  getTokenMetadata(
    runtimeId: string,
  ): Promise<ApiResponse<SandboxRuntimeTokenMetadata>>;
  recoverRuntime(runtimeId: string): Promise<ApiResponse<SandboxRuntime>>;
}

export function createSandboxRuntimeSdk(
  transport: MeZipSdkTransport,
): SandboxRuntimeSdk {
  const id = encodeURIComponent;
  const runtimePath = (runtimeId: string) => `/v1/sandbox/runtimes/${id(runtimeId)}`;
  return {
    listRuntimes: (projectId) =>
      transport.request({
        method: 'GET',
        path: '/v1/sandbox/runtimes',
        query: { projectId },
      }),
    getRuntime: (runtimeId) =>
      transport.request({ method: 'GET', path: runtimePath(runtimeId) }),
    createRuntime: (projectId, input) =>
      transport.request({
        method: 'POST',
        path: '/v1/sandbox/runtimes',
        query: { projectId },
        body: input,
      }),
    startRuntime: (runtimeId) =>
      transport.request({
        method: 'POST',
        path: `${runtimePath(runtimeId)}/start`,
        body: {},
      }),
    stopRuntime: (runtimeId) =>
      transport.request({
        method: 'POST',
        path: `${runtimePath(runtimeId)}/stop`,
        body: {},
      }),
    restartRuntime: (runtimeId) =>
      transport.request({
        method: 'POST',
        path: `${runtimePath(runtimeId)}/restart`,
        body: {},
      }),
    destroyRuntime: (runtimeId) =>
      transport.request({ method: 'DELETE', path: runtimePath(runtimeId), body: {} }),
    runCommand: (runtimeId, input) =>
      transport.request({
        method: 'POST',
        path: `${runtimePath(runtimeId)}/command`,
        body: input,
      }),
    runTask: (runtimeId, type, timeoutMs) =>
      transport.request({
        method: 'POST',
        path: `${runtimePath(runtimeId)}/tasks`,
        body: timeoutMs === undefined ? { type } : { type, timeoutMs },
      }),
    cancelTask: (runtimeId, taskId) =>
      transport.request({
        method: 'POST',
        path: `${runtimePath(runtimeId)}/tasks/${id(taskId)}/cancel`,
        body: {},
      }),
    listTasks: (runtimeId) =>
      transport.request({ method: 'GET', path: `${runtimePath(runtimeId)}/tasks` }),
    listLogs: (runtimeId, cursor) =>
      transport.request({
        method: 'GET',
        path: `${runtimePath(runtimeId)}/logs`,
        query: { cursor },
      }),
    exposePort: (runtimeId, input) =>
      transport.request({
        method: 'POST',
        path: `${runtimePath(runtimeId)}/ports`,
        body: input,
      }),
    createPreview: (runtimeId, portId) =>
      transport.request({
        method: 'POST',
        path: `${runtimePath(runtimeId)}/ports/${id(portId)}/preview`,
        body: {},
      }),
    getPreview: (runtimeId, previewId) =>
      transport.request({
        method: 'GET',
        path: `${runtimePath(runtimeId)}/previews/${id(previewId)}`,
      }),
    syncWorkspace: (runtimeId, input) =>
      transport.request({
        method: 'POST',
        path: `${runtimePath(runtimeId)}/sync`,
        body: input,
      }),
    getUsage: (runtimeId) =>
      transport.request({ method: 'GET', path: `${runtimePath(runtimeId)}/usage` }),
    listArtifacts: (runtimeId) =>
      transport.request({ method: 'GET', path: `${runtimePath(runtimeId)}/artifacts` }),
    listProblems: (runtimeId) =>
      transport.request({ method: 'GET', path: `${runtimePath(runtimeId)}/problems` }),
    listWorkspaceChanges: (runtimeId) =>
      transport.request({ method: 'GET', path: `${runtimePath(runtimeId)}/changes` }),
    detectWorkspaceChanges: (runtimeId) =>
      transport.request({
        method: 'POST',
        path: `${runtimePath(runtimeId)}/changes/detect`,
        body: {},
      }),
    reviewWorkspaceChange: (runtimeId, changeId, action) =>
      transport.request({
        method: 'PATCH',
        path: `${runtimePath(runtimeId)}/changes/${id(changeId)}`,
        body: { action },
      }),
    listTerminals: (runtimeId) =>
      transport.request({ method: 'GET', path: `${runtimePath(runtimeId)}/terminals` }),
    openTerminal: (runtimeId, input = {}) =>
      transport.request({
        method: 'POST',
        path: `${runtimePath(runtimeId)}/terminals`,
        body: input,
      }),
    writeTerminal: (runtimeId, sessionId, input) =>
      transport.request({
        method: 'POST',
        path: `${runtimePath(runtimeId)}/terminals/${id(sessionId)}/input`,
        body: { input },
      }),
    resizeTerminal: (runtimeId, sessionId, input) =>
      transport.request({
        method: 'POST',
        path: `${runtimePath(runtimeId)}/terminals/${id(sessionId)}/resize`,
        body: input,
      }),
    closeTerminal: (runtimeId, sessionId) =>
      transport.request({
        method: 'POST',
        path: `${runtimePath(runtimeId)}/terminals/${id(sessionId)}/close`,
        body: {},
      }),
    listEnvironment: (runtimeId) =>
      transport.request({
        method: 'GET',
        path: `${runtimePath(runtimeId)}/environment`,
      }),
    injectSecretReference: (runtimeId, input) =>
      transport.request({
        method: 'POST',
        path: `${runtimePath(runtimeId)}/environment`,
        body: input,
      }),
    getTokenMetadata: (runtimeId) =>
      transport.request({
        method: 'GET',
        path: `${runtimePath(runtimeId)}/token-metadata`,
      }),
    recoverRuntime: (runtimeId) =>
      transport.request({
        method: 'POST',
        path: `${runtimePath(runtimeId)}/recovery`,
        body: {},
      }),
  };
}

export interface DeploymentSdk {
  listDeployments(projectId: string, limit?: number): Promise<ApiResponse<DeploymentPage>>;
  createDeployment(input: {
    readonly projectId: string;
    readonly environment: DeploymentEnvironment;
    readonly provider?: DeploymentProviderCode;
    readonly sourceType: DeploymentSourceType;
    readonly sourceRevision: string;
    readonly releaseId?: string | null;
    readonly buildCommand?: string;
    readonly packageManager?: 'npm' | 'pnpm' | 'yarn';
    readonly lockfileHash?: string;
    readonly confirmProduction?: boolean;
    readonly actor?: 'USER' | 'AI_ASSISTED';
  }): Promise<ApiResponse<Deployment>>;
  getDeployment(deploymentId: string): Promise<ApiResponse<Deployment>>;
  cancelDeployment(deploymentId: string): Promise<ApiResponse<Deployment>>;
  deleteDeployment(deploymentId: string, confirmProduction?: boolean): Promise<ApiResponse<Deployment>>;
  rollbackDeployment(deploymentId: string, input: { readonly targetDeploymentId: string; readonly confirmProduction: true }): Promise<ApiResponse<Deployment>>;
  getLogs(deploymentId: string, input?: { readonly cursor?: number; readonly limit?: number }): Promise<ApiResponse<DeploymentLogPage>>;
  getHealth(deploymentId: string): Promise<ApiResponse<DeploymentHealthCheck>>;
  createPreviewShare(deploymentId: string, input?: { readonly visibility?: 'PRIVATE' | 'LINK_ONLY' | 'PUBLIC'; readonly expiresInDays?: 1 | 7 | 30; readonly passwordProtected?: boolean }): Promise<ApiResponse<PreviewShare>>;
  revokePreviewShare(shareId: string): Promise<ApiResponse<PreviewShare>>;
  accessPreview(token: string): Promise<ApiResponse<{ readonly deploymentId: string; readonly url: string }>>;
  listDomains(projectId: string): Promise<ApiResponse<readonly CustomDomain[]>>;
  addDomain(input: { readonly projectId: string; readonly deploymentId: string; readonly hostname: string; readonly verificationMethod?: 'DNS_TXT' | 'DNS_CNAME' }): Promise<ApiResponse<CustomDomain>>;
  verifyDomain(domainId: string): Promise<ApiResponse<CustomDomain>>;
  removeDomain(domainId: string): Promise<ApiResponse<CustomDomain>>;
  getEnvironment(projectId: string, environment: DeploymentEnvironment): Promise<ApiResponse<DeploymentEnvironmentConfig>>;
  updateEnvironment(projectId: string, environment: DeploymentEnvironment, input: { readonly publicEnv: Readonly<Record<string, string>>; readonly secretRefs: readonly string[] }): Promise<ApiResponse<DeploymentEnvironmentConfig>>;
  listSecrets(projectId: string, environment: DeploymentEnvironment): Promise<ApiResponse<readonly DeploymentSecretMetadata[]>>;
  setSecretReference(input: { readonly projectId: string; readonly environment: DeploymentEnvironment; readonly name: string; readonly secretReference: string }): Promise<ApiResponse<DeploymentSecretMetadata>>;
  getUsage(projectId: string): Promise<ApiResponse<DeploymentUsage>>;
  getPublishSettings(projectId: string): Promise<ApiResponse<ProjectPublishSettings>>;
  publishProject(projectId: string, input?: { readonly releaseId?: string | null; readonly projectVisibility?: 'PRIVATE' | 'UNLISTED' | 'PUBLISHED'; readonly sourceVisibility?: 'PRIVATE' | 'SELECTED_RELEASE' | 'PUBLIC'; readonly downloadVisibility?: 'PRIVATE' | 'SELECTED_RELEASE' | 'PUBLIC'; readonly description?: string; readonly screenshots?: readonly string[]; readonly demoUrl?: string | null; readonly readme?: string | null }): Promise<ApiResponse<ProjectPublication>>;
  unpublishProject(projectId: string): Promise<ApiResponse<ProjectPublishSettings>>;
  getPublicProject(projectId: string): Promise<ApiResponse<ProjectPublication>>;
}

export function createDeploymentSdk(transport: MeZipSdkTransport): DeploymentSdk {
  const id = encodeURIComponent;
  const deploymentPath = (deploymentId: string) => `/v1/deployments/${id(deploymentId)}`;
  const projectPath = (projectId: string) => `/v1/projects/${id(projectId)}`;
  return {
    listDeployments: (projectId, limit) => transport.request({ method: 'GET', path: '/v1/deployments', query: { projectId, limit } }),
    createDeployment: (body) => transport.request({ method: 'POST', path: '/v1/deployments', body }),
    getDeployment: (deploymentId) => transport.request({ method: 'GET', path: deploymentPath(deploymentId) }),
    cancelDeployment: (deploymentId) => transport.request({ method: 'POST', path: `${deploymentPath(deploymentId)}/cancel`, body: {} }),
    deleteDeployment: (deploymentId, confirmProduction = false) => transport.request({ method: 'DELETE', path: deploymentPath(deploymentId), query: { confirmProduction } }),
    rollbackDeployment: (deploymentId, body) => transport.request({ method: 'POST', path: `${deploymentPath(deploymentId)}/rollback`, body }),
    getLogs: (deploymentId, query = {}) => transport.request({ method: 'GET', path: `${deploymentPath(deploymentId)}/logs`, query }),
    getHealth: (deploymentId) => transport.request({ method: 'GET', path: `${deploymentPath(deploymentId)}/health` }),
    createPreviewShare: (deploymentId, body = {}) => transport.request({ method: 'POST', path: `${deploymentPath(deploymentId)}/preview-shares`, body }),
    revokePreviewShare: (shareId) => transport.request({ method: 'POST', path: `/v1/preview-shares/${id(shareId)}/revoke`, body: {} }),
    accessPreview: (token) => transport.request({ method: 'GET', path: '/v1/preview-shares/access', query: { token } }),
    listDomains: (projectId) => transport.request({ method: 'GET', path: `${projectPath(projectId)}/domains` }),
    addDomain: (body) => transport.request({ method: 'POST', path: `${projectPath(body.projectId)}/domains`, body }),
    verifyDomain: (domainId) => transport.request({ method: 'POST', path: `/v1/domains/${id(domainId)}/verify`, body: {} }),
    removeDomain: (domainId) => transport.request({ method: 'DELETE', path: `/v1/domains/${id(domainId)}` }),
    getEnvironment: (projectId, environment) => transport.request({ method: 'GET', path: `${projectPath(projectId)}/environment/${environment}` }),
    updateEnvironment: (projectId, environment, body) => transport.request({ method: 'PATCH', path: `${projectPath(projectId)}/environment/${environment}`, body }),
    listSecrets: (projectId, environment) => transport.request({ method: 'GET', path: `${projectPath(projectId)}/secrets`, query: { environment } }),
    setSecretReference: (body) => transport.request({ method: 'POST', path: `${projectPath(body.projectId)}/secrets`, body }),
    getUsage: (projectId) => transport.request({ method: 'GET', path: `${projectPath(projectId)}/usage` }),
    getPublishSettings: (projectId) => transport.request({ method: 'GET', path: `${projectPath(projectId)}/publish` }),
    publishProject: (projectId, body = {}) => transport.request({ method: 'POST', path: `${projectPath(projectId)}/publish`, body }),
    unpublishProject: (projectId) => transport.request({ method: 'POST', path: `${projectPath(projectId)}/unpublish`, body: {} }),
    getPublicProject: (projectId) => transport.request({ method: 'GET', path: `/v1/public/projects/${id(projectId)}` }),
  };
}

export function createMeZipSdk(transport: MeZipSdkTransport) {
  return {
    getToday: () =>
      transport.request<{ timezone: string }>({
        method: 'GET',
        path: '/v1/archive/today',
      }),
    community: createCommunitySdk(transport),
    messaging: createMessagingSdk(transport),
    membership: createMembershipSdk(transport),
    aiUsage: createAiUsageSdk(transport),
    aiGateway: createAiGatewaySdk(transport),
    personalAi: createPersonalAISdk(transport),
    portableArchive: createPortableArchiveSdk(transport),
    creatorLab: createCreatorLabSdk(transport),
    creatorEcosystem: createCreatorEcosystemSdk(transport),
    sandboxRuntime: createSandboxRuntimeSdk(transport),
    deployment: createDeploymentSdk(transport),
    social: createSocialSdk(transport),
    externalIdentity: createExternalIdentitySdk(transport),
  };
}
