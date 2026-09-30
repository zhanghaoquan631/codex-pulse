export interface AggregateMetric {
  readonly name: string;
  readonly value: number;
  readonly window: 'DAY' | 'WEEK' | 'MONTH' | 'YEAR';
  readonly computedAt: string;
}

export function mustKeepSourceSessions(): true {
  return true;
}

export {
  AdminAiUsageReader,
  AiUsageError,
  AiUsageService,
  defaultAiUsageApps,
  defaultAiUsageProviders,
  type AiUsageAdminRequestContext,
  type AiUsageBatchEventInput,
  type AiUsageBatchIngestInput,
  type AiUsageDeviceCredentialGrant,
  type AiUsageErrorCode,
  type AiUsageManualSessionInput,
  type AiUsageImportSessionInput,
  type AiUsagePairingCompleteInput,
  type AiUsagePairingCreateInput,
  type AiUsagePreferencesPatch,
  type AiUsageRange,
  type AiUsageRangeDeleteInput,
  type AiUsageRootAuthorizer,
  type AiUsageAuditSink,
  type AiUsageServiceOptions,
  type AiUsageSessionCorrectionInput,
} from './ai-usage.js';

export {
  AdminAiUsageRouteAdapter,
  AiUsageApiAdapter,
  type AdminAiUsageApiRequest,
  type AiUsageApiRequest,
  type AiUsageApiResponse,
} from './api.js';

export {
  AiUsageArchiveIntegration,
  toAiUsageDailyPackStats,
  type AiUsageDailyPackContribution,
  type AiUsageDailyPackPort,
} from './archive-integration.js';
