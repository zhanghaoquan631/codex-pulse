/**
 * Phase 9 browser boundary for Ask My Archive.
 *
 * The browser owns filters and presentation only.  Retrieval, ownership,
 * consent, source authorization, index lifecycle and model selection remain
 * server responsibilities.  In particular this module never accepts an
 * owner id, plan/entitlement override, Root capability, prompt context from a
 * different surface, provider credential or vector payload.
 */

import type { MeZipSdkTransport } from '@me-zip/sdk';
import type {
  ApiResponse,
  PersonalAICitation,
  PersonalAIConfidenceKind,
  PersonalAIExportExcludedDataCategory as CorePersonalAIExportExcludedDataCategory,
  PersonalAIExportJob as CorePersonalAIExportJob,
  PersonalAIExportPage as CorePersonalAIExportPage,
  PersonalAIExportRequest as CorePersonalAIExportRequest,
  PersonalAIExportResult as CorePersonalAIExportResult,
  PersonalAIExportSection as CorePersonalAIExportSection,
  PersonalAIExportStatusView as CorePersonalAIExportStatusView,
  PersonalAIIndexStatusView,
  PersonalAIPrivacyView,
  PersonalAIQueryInput,
  PersonalAIQueryResult,
} from '@me-zip/shared-types';

import { FetchMessagingTransport } from './messagingClient.js';

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
export type PersonalAiContextScope = (typeof personalAiContextScopes)[number];

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
export type PersonalAiSourceType = (typeof personalAiSourceTypes)[number];

export const personalAiIndexStatuses = [
  'PENDING',
  'INDEXING',
  'READY',
  'STALE',
  'FAILED',
  'DELETED',
] as const;
export type PersonalAiIndexStatus = (typeof personalAiIndexStatuses)[number];

export type PersonalAiEvidenceKind =
  'DIRECT_EVIDENCE' | 'INFERRED_FROM_RECORDS' | 'NO_EVIDENCE';

export interface AskArchiveFilters {
  readonly scope: PersonalAiContextScope;
  readonly dateFrom: string | null;
  readonly dateTo: string | null;
  readonly sourceTypes: readonly PersonalAiSourceType[];
  /** Phase 9 defaults to archive-only. General knowledge is not exposed by
   * this first browser surface. */
  readonly mode: 'ARCHIVE_ONLY';
}

export interface AskArchiveCitation {
  readonly citationId: string;
  readonly sourceType: PersonalAiSourceType;
  readonly sourceId: string;
  readonly revisionId: string | null;
  readonly occurredAt: string | null;
  readonly displayTitle: string;
  readonly excerptSafe: string;
}

export interface AskArchiveAnswer {
  readonly requestId: string;
  readonly conversationId: string | null;
  readonly answerText: string | null;
  readonly evidenceKind: PersonalAiEvidenceKind;
  readonly citations: readonly AskArchiveCitation[];
  readonly retrievalLatencyMs: number | null;
  readonly generatedAt: string;
  readonly suggestedFollowUps: readonly string[];
}

export interface RelatedMemory {
  readonly sourceType: PersonalAiSourceType;
  readonly sourceId: string;
  readonly occurredAt: string | null;
  readonly displayTitle: string;
  readonly excerptSafe: string;
  readonly similarityLabel: string | null;
}

export interface PersonalAiIndexedSource {
  readonly sourceType: PersonalAiSourceType | null;
  readonly indexedCount: number;
  readonly status: PersonalAiIndexStatus;
  readonly lastIndexedAt: string | null;
}

export interface PersonalAiPrivacySnapshot {
  readonly enabled: boolean;
  readonly consentVersion: string | null;
  readonly consentAcceptedAt: string | null;
  readonly indexedSources: readonly PersonalAiIndexedSource[];
  readonly indexedSourceCount: number;
  readonly lastIndexedAt: string | null;
  readonly embeddingProviderLabel: string | null;
  readonly privateMessagesExcluded: true;
}

export interface PersonalAiIndexSnapshot {
  readonly status: PersonalAiIndexStatus;
  readonly indexVersion: string | null;
  readonly queuedJobs: number;
  readonly failedJobs: number;
  readonly lastErrorMessage: string | null;
  readonly updatedAt: string | null;
}

export interface AskArchiveSnapshot {
  readonly privacy: PersonalAiPrivacySnapshot;
  readonly index: PersonalAiIndexSnapshot;
  readonly sourceTypes: readonly PersonalAiSourceType[];
}

export interface AskArchiveExportJob {
  readonly id: string;
  readonly status: CorePersonalAIExportJob['status'];
  readonly format: CorePersonalAIExportJob['format'];
  readonly schemaVersion: CorePersonalAIExportJob['schemaVersion'];
  readonly requestedSections: readonly CorePersonalAIExportSection[];
  readonly includeConversations: boolean;
  readonly includeDeletedInsights: boolean;
  readonly requestedAt: string;
  readonly startedAt: string | null;
  readonly completedAt: string | null;
  readonly expiresAt: string | null;
  readonly errorCode: string | null;
}

export interface AskArchiveExportResult {
  readonly exportId: string;
  readonly format: CorePersonalAIExportResult['format'];
  readonly schemaVersion: CorePersonalAIExportResult['schemaVersion'];
  readonly exportedAt: string;
  readonly includedSections: readonly CorePersonalAIExportSection[];
  readonly excludedDataCategories: readonly CorePersonalAIExportExcludedDataCategory[];
}

export interface AskArchiveExportStatus {
  readonly job: AskArchiveExportJob;
  readonly result: AskArchiveExportResult | null;
}

export interface AskArchiveExportPage {
  readonly items: readonly AskArchiveExportJob[];
  readonly nextCursor: string | null;
}

export type AskArchiveClientSource = 'SERVER' | 'DEVELOPMENT_FIXTURE' | 'UNAVAILABLE';

export type AskArchiveFailureCode =
  | 'SERVICE_UNAVAILABLE'
  | 'OFFLINE'
  | 'UNAUTHORIZED'
  | 'FORBIDDEN'
  | 'CONSENT_REQUIRED'
  | 'PERSONAL_AI_DISABLED'
  | 'SCOPE_REQUIRED'
  | 'INDEX_UNAVAILABLE'
  | 'VALIDATION'
  | 'CONFLICT'
  | 'NOT_FOUND'
  | 'RATE_LIMITED'
  | 'UNKNOWN';

export interface AskArchiveClientError {
  readonly code: AskArchiveFailureCode;
  /** Presentation-safe copy only; raw service error bodies never reach a view. */
  readonly message: string;
  readonly retryable: boolean;
}

export type AskArchiveResult<T> =
  | { readonly ok: true; readonly source: AskArchiveClientSource; readonly data: T }
  | {
      readonly ok: false;
      readonly source: AskArchiveClientSource;
      readonly error: AskArchiveClientError;
    };

export interface AskArchiveQueryInput {
  readonly query: string;
  readonly filters: AskArchiveFilters;
  readonly conversationId: string | null;
  readonly idempotencyKey: string;
  readonly selectedEntryIds?: readonly string[];
  readonly selectedMediaIds?: readonly string[];
}

export interface AskArchiveSdkFacade {
  query(input: AskArchiveQueryInput): Promise<ApiResponse<AskArchiveAnswer>>;
  cancelQuery(input: {
    readonly requestId: string;
    readonly idempotencyKey: string;
  }): Promise<ApiResponse<{ readonly requestId: string; readonly cancelled: boolean }>>;
  createExport(input?: CorePersonalAIExportRequest): Promise<ApiResponse<AskArchiveExportStatus>>;
  getExport(exportId: string): Promise<ApiResponse<AskArchiveExportStatus>>;
  listExports(input?: {
    readonly cursor?: string;
    readonly limit?: number;
  }): Promise<ApiResponse<AskArchiveExportPage>>;
  getPreferences(): Promise<ApiResponse<PersonalAiPrivacySnapshot>>;
  updatePreferences(input: {
    readonly enabled: boolean;
    readonly consentVersion?: string;
  }): Promise<ApiResponse<PersonalAiPrivacySnapshot>>;
  getIndexStatus(): Promise<ApiResponse<PersonalAiIndexSnapshot>>;
  rebuildIndex(): Promise<ApiResponse<PersonalAiIndexSnapshot>>;
  clearIndex(): Promise<ApiResponse<PersonalAiIndexSnapshot>>;
  deleteInsights(): Promise<ApiResponse<{ readonly deletedCount: number }>>;
  saveInsight(input: {
    readonly queryId: string;
    readonly title?: string;
  }): Promise<ApiResponse<{ readonly id: string }>>;
  relatedMemories(input: {
    readonly sourceType: PersonalAiSourceType;
    readonly sourceId: string;
    readonly limit: number;
  }): Promise<ApiResponse<readonly RelatedMemory[]>>;
}

const reviewedCopies: Readonly<Record<AskArchiveFailureCode, string>> = {
  SERVICE_UNAVAILABLE: '问问档案服务暂时不可用。',
  OFFLINE: '当前无法连接问问档案服务。',
  UNAUTHORIZED: '请完成安全登录后再访问自己的档案。',
  FORBIDDEN: '当前授权范围不允许读取这些档案。',
  CONSENT_REQUIRED: '请先在隐私中心明确开启 Personal AI。',
  PERSONAL_AI_DISABLED: 'Personal AI 已关闭；请在隐私中心重新开启。',
  SCOPE_REQUIRED: '请先选择要查询的档案范围。',
  INDEX_UNAVAILABLE: '当前档案索引尚未准备好，请稍后重试。',
  VALIDATION: '请检查问题、范围和日期筛选后再试。',
  CONFLICT: '这次查询状态已变化，请重新提交。',
  NOT_FOUND: '这条档案查询已不存在，或当前账号不可访问。',
  RATE_LIMITED: '操作过于频繁，请稍后再试。',
  UNKNOWN: '问问档案暂时无法完成这次查询。',
};

const codeAliases: Readonly<Record<string, AskArchiveFailureCode>> = {
  OFFLINE: 'OFFLINE',
  UNAUTHORIZED: 'UNAUTHORIZED',
  AUTH_REQUIRED: 'UNAUTHORIZED',
  FORBIDDEN: 'FORBIDDEN',
  CONSENT_REQUIRED: 'CONSENT_REQUIRED',
  PERSONAL_AI_CONSENT_REQUIRED: 'CONSENT_REQUIRED',
  PERSONAL_AI_DISABLED: 'PERSONAL_AI_DISABLED',
  SCOPE_REQUIRED: 'SCOPE_REQUIRED',
  INDEX_UNAVAILABLE: 'INDEX_UNAVAILABLE',
  PERSONAL_AI_INDEX_UNAVAILABLE: 'INDEX_UNAVAILABLE',
  VALIDATION: 'VALIDATION',
  CONFLICT: 'CONFLICT',
  IDEMPOTENCY_CONFLICT: 'CONFLICT',
  NOT_FOUND: 'NOT_FOUND',
  RATE_LIMITED: 'RATE_LIMITED',
};

function failure<T>(
  error: AskArchiveClientError,
  source: AskArchiveClientSource = 'UNAVAILABLE',
): AskArchiveResult<T> {
  return { ok: false, source, error };
}

function mapFailure(code: string, retryable: boolean): AskArchiveClientError {
  const normalized =
    codeAliases[code] ?? (retryable ? 'SERVICE_UNAVAILABLE' : 'UNKNOWN');
  return { code: normalized, message: reviewedCopies[normalized], retryable };
}

async function fromSdk<T>(
  request: Promise<ApiResponse<T>>,
): Promise<AskArchiveResult<T>> {
  try {
    const response = await request;
    if ('error' in response) {
      return failure(
        mapFailure(response.error.code, response.error.retryable),
        'SERVER',
      );
    }
    return { ok: true, source: 'SERVER', data: response.data };
  } catch {
    return failure(
      {
        code: 'SERVICE_UNAVAILABLE',
        message: reviewedCopies.SERVICE_UNAVAILABLE,
        retryable: true,
      },
      'SERVER',
    );
  }
}

function isDate(value: string | null): boolean {
  if (value === null) return true;
  return (
    /^\d{4}-\d{2}-\d{2}$/u.test(value) &&
    Number.isFinite(Date.parse(`${value}T00:00:00Z`))
  );
}

function isScope(value: string): value is PersonalAiContextScope {
  return (personalAiContextScopes as readonly string[]).includes(value);
}

function isSourceType(value: string): value is PersonalAiSourceType {
  return (personalAiSourceTypes as readonly string[]).includes(value);
}

export function normalizeAskArchiveFilters(
  input: Partial<AskArchiveFilters> = {},
): AskArchiveFilters {
  const scope =
    typeof input.scope === 'string' && isScope(input.scope) ? input.scope : 'NONE';
  const dateFrom =
    typeof input.dateFrom === 'string' && isDate(input.dateFrom)
      ? input.dateFrom
      : null;
  const dateTo =
    typeof input.dateTo === 'string' && isDate(input.dateTo) ? input.dateTo : null;
  const sourceTypes = Array.isArray(input.sourceTypes)
    ? [
        ...new Set(
          input.sourceTypes.filter(
            (value): value is PersonalAiSourceType =>
              typeof value === 'string' && isSourceType(value),
          ),
        ),
      ]
    : [];
  return { scope, dateFrom, dateTo, sourceTypes, mode: 'ARCHIVE_ONLY' };
}

function validQuery(input: AskArchiveQueryInput): boolean {
  const query = input.query.trim();
  if (query.length === 0 || query.length > 12_000) return false;
  if (
    !isScope(input.filters.scope) ||
    !isDate(input.filters.dateFrom) ||
    !isDate(input.filters.dateTo)
  )
    return false;
  if (
    input.filters.dateFrom !== null &&
    input.filters.dateTo !== null &&
    input.filters.dateFrom > input.filters.dateTo
  )
    return false;
  if (
    input.filters.scope === 'DATE_RANGE' &&
    (input.filters.dateFrom === null || input.filters.dateTo === null)
  )
    return false;
  if (
    (input.filters.scope === 'SELECTED_ENTRY' ||
      input.filters.scope === 'SELECTED_ENTRIES') &&
    (input.selectedEntryIds?.length ?? 0) === 0
  )
    return false;
  if (
    input.filters.scope === 'SELECTED_MEDIA' &&
    (input.selectedMediaIds?.length ?? 0) === 0
  )
    return false;
  return (
    input.filters.sourceTypes.every(isSourceType) &&
    input.filters.mode === 'ARCHIVE_ONLY'
  );
}

function mapCitation(value: PersonalAICitation): AskArchiveCitation {
  return {
    citationId: value.citationId,
    sourceType: value.sourceType,
    sourceId: value.sourceId,
    revisionId: value.revisionId,
    occurredAt: value.occurredAt,
    displayTitle: value.displayTitle,
    excerptSafe: value.excerptSafe,
  };
}

function mapEvidenceKind(value: PersonalAIConfidenceKind): PersonalAiEvidenceKind {
  return value === 'INFERRED' ? 'INFERRED_FROM_RECORDS' : value;
}

function mapAnswer(value: PersonalAIQueryResult): AskArchiveAnswer {
  return {
    requestId: value.queryId,
    // A query id and a conversation id have different ownership and lifecycle
    // semantics.  Preserve the server projection exactly; a follow-up may
    // only reuse a conversation id that the server explicitly returned.
    conversationId: value.conversationId,
    answerText: value.answerText,
    evidenceKind: mapEvidenceKind(value.evidenceKind),
    citations: value.citations.map(mapCitation),
    retrievalLatencyMs: value.retrievalLatencyMs,
    generatedAt: value.createdAt,
    suggestedFollowUps: [],
  };
}

function mapExportJob(value: CorePersonalAIExportJob): AskArchiveExportJob {
  return {
    id: value.id,
    status: value.status,
    format: value.format,
    schemaVersion: value.schemaVersion,
    requestedSections: value.requestedSections,
    includeConversations: value.includeConversations,
    includeDeletedInsights: value.includeDeletedInsights,
    requestedAt: value.requestedAt,
    startedAt: value.startedAt,
    completedAt: value.completedAt,
    expiresAt: value.expiresAt,
    errorCode: value.errorCode,
  };
}

function mapExportResult(value: CorePersonalAIExportResult): AskArchiveExportResult {
  return {
    exportId: value.exportId,
    format: value.format,
    schemaVersion: value.schemaVersion,
    exportedAt: value.exportedAt,
    includedSections: value.includedSections,
    excludedDataCategories: value.excludedDataCategories,
  };
}

function mapExportStatus(value: CorePersonalAIExportStatusView): AskArchiveExportStatus {
  return {
    job: mapExportJob(value.job),
    result: value.result === null ? null : mapExportResult(value.result),
  };
}

function mapExportPage(value: CorePersonalAIExportPage): AskArchiveExportPage {
  return {
    items: value.items.map(mapExportJob),
    nextCursor: value.nextCursor,
  };
}

function mapIndexStatus(value: PersonalAIIndexStatusView): PersonalAiIndexSnapshot {
  return {
    status: value.status,
    indexVersion: value.indexVersion,
    queuedJobs: value.status === 'PENDING' || value.status === 'INDEXING' ? 1 : 0,
    failedJobs: value.status === 'FAILED' ? 1 : 0,
    lastErrorMessage: null,
    updatedAt: value.lastIndexedAt,
  };
}

function mapPrivacy(value: PersonalAIPrivacyView): PersonalAiPrivacySnapshot {
  const { preferences, consent, index } = value;
  const indexedSources: readonly PersonalAiIndexedSource[] =
    index.indexedSourceCount > 0
      ? [
          {
            sourceType: null,
            indexedCount: index.indexedSourceCount,
            status: index.status,
            lastIndexedAt: index.lastIndexedAt,
          },
        ]
      : [];
  return {
    enabled: preferences.enabled && consent.accepted,
    consentVersion: consent.version,
    consentAcceptedAt: consent.acceptedAt,
    indexedSources,
    indexedSourceCount: index.indexedSourceCount,
    lastIndexedAt: index.lastIndexedAt,
    embeddingProviderLabel: index.embeddingProvider,
    privateMessagesExcluded: true,
  };
}

function dateTimeRange(filters: AskArchiveFilters): PersonalAIQueryInput['dateRange'] {
  if (filters.dateFrom === null || filters.dateTo === null) return undefined;
  return {
    from: `${filters.dateFrom}T00:00:00.000Z`,
    to: `${filters.dateTo}T23:59:59.999Z`,
  };
}

function toCoreQuery(input: AskArchiveQueryInput): PersonalAIQueryInput {
  const dateRange = dateTimeRange(input.filters);
  return {
    question: input.query.trim(),
    scope: input.filters.scope,
    ...(dateRange === undefined ? {} : { dateRange }),
    ...(input.filters.sourceTypes.length === 0
      ? {}
      : { sourceTypes: input.filters.sourceTypes }),
    ...(input.selectedEntryIds === undefined
      ? {}
      : { selectedEntryIds: input.selectedEntryIds }),
    ...(input.selectedMediaIds === undefined
      ? {}
      : { selectedMediaIds: input.selectedMediaIds }),
    searchMode: 'HYBRID',
    archiveMode: 'ARCHIVE_ONLY',
    topK: 8,
    contextBudgetTokens: 2_000,
    ...(input.conversationId === null ? {} : { conversationId: input.conversationId }),
  };
}

/** A browser-safe adapter over the Phase 9 Personal AI routes. */
export class ApiAskArchiveClient {
  readonly source = 'SERVER' as const;

  public constructor(private readonly sdk: AskArchiveSdkFacade) {}

  public query(
    input: AskArchiveQueryInput,
  ): Promise<AskArchiveResult<AskArchiveAnswer>> {
    if (!validQuery(input)) {
      return Promise.resolve(
        failure(
          { code: 'VALIDATION', message: reviewedCopies.VALIDATION, retryable: false },
          'SERVER',
        ),
      );
    }
    return fromSdk(this.sdk.query({ ...input, query: input.query.trim() }));
  }

  public cancelQuery(input: {
    readonly requestId: string;
    readonly idempotencyKey: string;
  }): Promise<
    AskArchiveResult<{ readonly requestId: string; readonly cancelled: boolean }>
  > {
    return fromSdk(this.sdk.cancelQuery(input));
  }

  public createExport(
    input: CorePersonalAIExportRequest = {},
  ): Promise<AskArchiveResult<AskArchiveExportStatus>> {
    return fromSdk(this.sdk.createExport(input));
  }

  public getExport(exportId: string): Promise<AskArchiveResult<AskArchiveExportStatus>> {
    if (exportId.trim().length === 0) {
      return Promise.resolve(
        failure(
          { code: 'VALIDATION', message: reviewedCopies.VALIDATION, retryable: false },
          'SERVER',
        ),
      );
    }
    return fromSdk(this.sdk.getExport(exportId));
  }

  public listExports(input: {
    readonly cursor?: string;
    readonly limit?: number;
  } = {}): Promise<AskArchiveResult<AskArchiveExportPage>> {
    return fromSdk(
      this.sdk.listExports({
        ...(input.cursor === undefined ? {} : { cursor: input.cursor }),
        ...(input.limit === undefined ? {} : { limit: input.limit }),
      }),
    );
  }

  public readSnapshot(): Promise<AskArchiveResult<AskArchiveSnapshot>> {
    return Promise.all([
      fromSdk(this.sdk.getPreferences()),
      fromSdk(this.sdk.getIndexStatus()),
    ]).then(([privacy, index]) => {
      if (!privacy.ok) return privacy;
      if (!index.ok) return index;
      return {
        ok: true,
        source: 'SERVER',
        data: {
          privacy: privacy.data,
          index: index.data,
          sourceTypes: personalAiSourceTypes,
        },
      };
    });
  }

  public updatePreferences(input: {
    readonly enabled: boolean;
    readonly consentVersion?: string;
  }): Promise<AskArchiveResult<PersonalAiPrivacySnapshot>> {
    return fromSdk(this.sdk.updatePreferences(input));
  }

  public rebuildIndex(): Promise<AskArchiveResult<PersonalAiIndexSnapshot>> {
    return fromSdk(this.sdk.rebuildIndex());
  }

  public clearIndex(): Promise<AskArchiveResult<PersonalAiIndexSnapshot>> {
    return fromSdk(this.sdk.clearIndex());
  }

  public deleteInsights(): Promise<
    AskArchiveResult<{ readonly deletedCount: number }>
  > {
    return fromSdk(this.sdk.deleteInsights());
  }

  public saveInsight(input: {
    readonly queryId: string;
    readonly title?: string;
  }): Promise<AskArchiveResult<{ readonly id: string }>> {
    if (input.queryId.trim().length === 0) {
      return Promise.resolve(
        failure(
          { code: 'VALIDATION', message: reviewedCopies.VALIDATION, retryable: false },
          'SERVER',
        ),
      );
    }
    return fromSdk(this.sdk.saveInsight(input));
  }

  public relatedMemories(input: {
    readonly sourceType: PersonalAiSourceType;
    readonly sourceId: string;
    readonly limit?: number;
  }): Promise<AskArchiveResult<readonly RelatedMemory[]>> {
    if (!isSourceType(input.sourceType) || input.sourceId.trim().length === 0) {
      return Promise.resolve(
        failure(
          { code: 'VALIDATION', message: reviewedCopies.VALIDATION, retryable: false },
          'SERVER',
        ),
      );
    }
    return fromSdk(
      this.sdk.relatedMemories({
        sourceType: input.sourceType,
        sourceId: input.sourceId,
        limit: Math.min(20, Math.max(1, Math.floor(input.limit ?? 6))),
      }),
    );
  }
}

export class UnavailableAskArchiveClient {
  readonly source = 'UNAVAILABLE' as const;

  public query(): Promise<AskArchiveResult<AskArchiveAnswer>> {
    return Promise.resolve(this.unavailable());
  }

  public cancelQuery(): Promise<
    AskArchiveResult<{ readonly requestId: string; readonly cancelled: boolean }>
  > {
    return Promise.resolve(this.unavailable());
  }

  public createExport(): Promise<AskArchiveResult<AskArchiveExportStatus>> {
    return Promise.resolve(this.unavailable());
  }

  public getExport(): Promise<AskArchiveResult<AskArchiveExportStatus>> {
    return Promise.resolve(this.unavailable());
  }

  public listExports(): Promise<AskArchiveResult<AskArchiveExportPage>> {
    return Promise.resolve(this.unavailable());
  }

  public readSnapshot(): Promise<AskArchiveResult<AskArchiveSnapshot>> {
    return Promise.resolve(this.unavailable());
  }

  public updatePreferences(): Promise<AskArchiveResult<PersonalAiPrivacySnapshot>> {
    return Promise.resolve(this.unavailable());
  }

  public rebuildIndex(): Promise<AskArchiveResult<PersonalAiIndexSnapshot>> {
    return Promise.resolve(this.unavailable());
  }

  public clearIndex(): Promise<AskArchiveResult<PersonalAiIndexSnapshot>> {
    return Promise.resolve(this.unavailable());
  }

  public deleteInsights(): Promise<
    AskArchiveResult<{ readonly deletedCount: number }>
  > {
    return Promise.resolve(this.unavailable());
  }

  public saveInsight(): Promise<AskArchiveResult<{ readonly id: string }>> {
    return Promise.resolve(this.unavailable());
  }

  public relatedMemories(): Promise<AskArchiveResult<readonly RelatedMemory[]>> {
    return Promise.resolve(this.unavailable());
  }

  private unavailable<T>(): AskArchiveResult<T> {
    return failure({
      code: 'SERVICE_UNAVAILABLE',
      message: '问问档案服务尚未连接；不会以本地演示结果代替真实档案。',
      retryable: true,
    });
  }
}

interface FixtureState {
  readonly requestId: string;
  readonly conversationId: string;
}

/**
 * Explicitly labelled local fixture for visual/unit validation.  It contains
 * synthetic records only and is selected only when VITE_MEZIP_PERSONAL_AI_FIXTURE
 * is true in a development build; it is never selected in production.
 */
export class DevelopmentFixtureAskArchiveClient {
  readonly source = 'DEVELOPMENT_FIXTURE' as const;
  private counter = 0;
  private enabled = true;
  private indexStatus: PersonalAiIndexStatus = 'READY';
  private exports = new Map<string, AskArchiveExportStatus>();

  public query(
    input: AskArchiveQueryInput,
  ): Promise<AskArchiveResult<AskArchiveAnswer>> {
    if (!validQuery(input)) {
      return Promise.resolve(
        failure(
          { code: 'VALIDATION', message: reviewedCopies.VALIDATION, retryable: false },
          this.source,
        ),
      );
    }
    const requestId = `fixture-archive-${++this.counter}`;
    const state: FixtureState = {
      requestId,
      conversationId: input.conversationId ?? requestId,
    };
    const citation: AskArchiveCitation = {
      citationId: `${requestId}-citation-1`,
      sourceType: 'LIFE',
      sourceId: 'fixture-life-2026-08-17',
      revisionId: null,
      occurredAt: '2026-08-17T09:00:00.000Z',
      displayTitle: '开发夹具 · 2026 年 8 月 17 日 Life',
      excerptSafe: '虚构记录：在河边散步，记下了一个值得保留的想法。',
    };
    const answer: AskArchiveAnswer = {
      requestId: state.requestId,
      conversationId: state.conversationId,
      answerText: input.query.toLocaleLowerCase().includes('东京')
        ? null
        : '这是开发夹具中的合成回答，仅用于验证 Ask My Archive 的范围、引用与无证据界面。',
      evidenceKind: input.query.toLocaleLowerCase().includes('东京')
        ? 'NO_EVIDENCE'
        : 'DIRECT_EVIDENCE',
      citations: input.query.toLocaleLowerCase().includes('东京') ? [] : [citation],
      retrievalLatencyMs: 4,
      generatedAt: new Date().toISOString(),
      suggestedFollowUps: ['只看最近 7 天', '查找相关记忆'],
    };
    return Promise.resolve({ ok: true, source: this.source, data: answer });
  }

  public cancelQuery(input: {
    readonly requestId: string;
  }): Promise<
    AskArchiveResult<{ readonly requestId: string; readonly cancelled: boolean }>
  > {
    return Promise.resolve({
      ok: true,
      source: this.source,
      data: { requestId: input.requestId, cancelled: true },
    });
  }

  public createExport(
    input: CorePersonalAIExportRequest = {},
  ): Promise<AskArchiveResult<AskArchiveExportStatus>> {
    const now = new Date().toISOString();
    const jobId = `fixture-export-${++this.counter}`;
    const job: AskArchiveExportJob = {
      id: jobId,
      status: 'READY',
      format: 'JSON',
      schemaVersion: 'mezip.personal-ai.export.v1',
      requestedSections: [
        'PREFERENCES',
        'CONSENT_HISTORY',
        'INDEX_MANIFEST',
        'INSIGHT_METADATA',
        'CITATION_REFERENCES',
        ...(input.includeConversations ? ['CONVERSATION_METADATA' as const] : []),
      ],
      includeConversations: input.includeConversations ?? false,
      includeDeletedInsights: input.includeDeletedInsights ?? false,
      requestedAt: now,
      startedAt: now,
      completedAt: now,
      expiresAt: null,
      errorCode: null,
    };
    const status: AskArchiveExportStatus = {
      job,
      result: {
        exportId: jobId,
        format: 'JSON',
        schemaVersion: 'mezip.personal-ai.export.v1',
        exportedAt: now,
        includedSections: job.requestedSections,
        excludedDataCategories: [
          'ORIGINAL_ARCHIVE_CONTENT',
          'KNOWLEDGE_CHUNK_TEXT',
          'RAW_EMBEDDING_VECTORS',
          'QUERY_PROMPT_OR_QUESTION_TEXT',
          'QUERY_ANSWER_TEXT',
          'AI_INSIGHT_CONTENT',
          'CITATION_DISPLAY_TEXT',
          'PROVIDER_SECRETS',
        ],
      },
    };
    this.exports.set(jobId, status);
    return Promise.resolve({ ok: true, source: this.source, data: status });
  }

  public getExport(exportId: string): Promise<AskArchiveResult<AskArchiveExportStatus>> {
    const status = this.exports.get(exportId);
    if (status === undefined) {
      return Promise.resolve(
        failure(
          { code: 'NOT_FOUND', message: '导出任务不存在。', retryable: false },
          this.source,
        ),
      );
    }
    return Promise.resolve({ ok: true, source: this.source, data: status });
  }

  public listExports(): Promise<AskArchiveResult<AskArchiveExportPage>> {
    const items = [...this.exports.values()]
      .map((item) => item.job)
      .sort((left, right) => right.requestedAt.localeCompare(left.requestedAt));
    return Promise.resolve({
      ok: true,
      source: this.source,
      data: { items, nextCursor: null },
    });
  }

  public readSnapshot(): Promise<AskArchiveResult<AskArchiveSnapshot>> {
    const now = new Date().toISOString();
    return Promise.resolve({
      ok: true,
      source: this.source,
      data: {
        privacy: {
          enabled: this.enabled,
          consentVersion: 'fixture-v1',
          consentAcceptedAt: now,
          indexedSources: [
            {
              sourceType: 'LIFE',
              indexedCount: 1,
              status: this.indexStatus,
              lastIndexedAt: now,
            },
          ],
          indexedSourceCount: 1,
          lastIndexedAt: now,
          embeddingProviderLabel: '开发夹具（合成数据）',
          privateMessagesExcluded: true,
        },
        index: {
          status: this.indexStatus,
          indexVersion: 'fixture-v1',
          queuedJobs: 0,
          failedJobs: 0,
          lastErrorMessage: null,
          updatedAt: now,
        },
        sourceTypes: personalAiSourceTypes,
      },
    });
  }

  public updatePreferences(input: {
    readonly enabled: boolean;
  }): Promise<AskArchiveResult<PersonalAiPrivacySnapshot>> {
    this.enabled = input.enabled;
    return this.readSnapshot().then((result) =>
      result.ok ? { ok: true, source: this.source, data: result.data.privacy } : result,
    );
  }

  public rebuildIndex(): Promise<AskArchiveResult<PersonalAiIndexSnapshot>> {
    this.indexStatus = 'READY';
    return this.readSnapshot().then((result) =>
      result.ok ? { ok: true, source: this.source, data: result.data.index } : result,
    );
  }

  public clearIndex(): Promise<AskArchiveResult<PersonalAiIndexSnapshot>> {
    this.indexStatus = 'DELETED';
    return this.readSnapshot().then((result) =>
      result.ok ? { ok: true, source: this.source, data: result.data.index } : result,
    );
  }

  public deleteInsights(): Promise<
    AskArchiveResult<{ readonly deletedCount: number }>
  > {
    return Promise.resolve({
      ok: true,
      source: this.source,
      data: { deletedCount: 0 },
    });
  }

  public saveInsight(input: {
    readonly queryId: string;
  }): Promise<AskArchiveResult<{ readonly id: string }>> {
    return Promise.resolve({
      ok: true,
      source: this.source,
      data: { id: `fixture-insight-${input.queryId}` },
    });
  }

  public relatedMemories(): Promise<AskArchiveResult<readonly RelatedMemory[]>> {
    return Promise.resolve({
      ok: true,
      source: this.source,
      data: [
        {
          sourceType: 'LIFE',
          sourceId: 'fixture-life-2026-08-10',
          occurredAt: '2026-08-10T09:00:00.000Z',
          displayTitle: '开发夹具 · 另一条 Life',
          excerptSafe: '虚构相关记录。',
          similarityLabel: '合成相似度',
        },
      ],
    });
  }
}

export type AskArchiveClient =
  | ApiAskArchiveClient
  | UnavailableAskArchiveClient
  | DevelopmentFixtureAskArchiveClient;

interface AskArchiveRuntimeOptions {
  readonly apiBaseUrl?: string;
  readonly fixtureEnabled?: boolean;
  readonly production?: boolean;
}

function runtimeBaseUrl(
  value: string | undefined,
  production: boolean,
): string | undefined {
  const candidate = value?.trim();
  if (candidate === undefined || candidate.length === 0) return undefined;
  if (!production && candidate === '/') return '';
  try {
    const parsed = new URL(candidate);
    if (
      parsed.username ||
      parsed.password ||
      parsed.search ||
      parsed.hash ||
      parsed.pathname !== '/'
    )
      return undefined;
    if (production && parsed.protocol !== 'https:') return undefined;
    if (!production && parsed.protocol !== 'https:' && parsed.protocol !== 'http:')
      return undefined;
    return parsed.origin;
  } catch {
    return undefined;
  }
}

export function createAskArchiveSdkFacade(
  transport: MeZipSdkTransport,
): AskArchiveSdkFacade {
  const request = <T>(
    input: Parameters<MeZipSdkTransport['request']>[0],
  ): Promise<ApiResponse<T>> => transport.request<T>(input);
  return {
    query: async (input) => {
      const response = await request<PersonalAIQueryResult>({
        method: 'POST',
        path: '/v1/personal-ai/queries',
        body: toCoreQuery(input),
        idempotencyKey: input.idempotencyKey,
      });
      if ('error' in response) return response;
      return { data: mapAnswer(response.data), meta: response.meta };
    },
    cancelQuery: ({ requestId, idempotencyKey }) =>
      request({
        method: 'POST',
        path: `/v1/personal-ai/queries/${encodeURIComponent(requestId)}/cancel`,
        body: {},
        idempotencyKey,
      }),
    createExport: async (input = {}) => {
      const response = await request<CorePersonalAIExportStatusView>({
        method: 'POST',
        path: '/v1/personal-ai/exports',
        body: input,
      });
      if ('error' in response) return response;
      return { data: mapExportStatus(response.data), meta: response.meta };
    },
    getExport: async (exportId) => {
      const response = await request<CorePersonalAIExportStatusView>({
        method: 'GET',
        path: `/v1/personal-ai/exports/${encodeURIComponent(exportId)}`,
      });
      if ('error' in response) return response;
      return { data: mapExportStatus(response.data), meta: response.meta };
    },
    listExports: async (input = {}) => {
      const response = await request<CorePersonalAIExportPage>({
        method: 'GET',
        path: '/v1/personal-ai/exports',
        query: {
          ...(input.cursor === undefined ? {} : { cursor: input.cursor }),
          ...(input.limit === undefined ? {} : { limit: input.limit }),
        },
      });
      if ('error' in response) return response;
      return { data: mapExportPage(response.data), meta: response.meta };
    },
    getPreferences: async () => {
      const response = await request<PersonalAIPrivacyView>({
        method: 'GET',
        path: '/v1/personal-ai/privacy',
      });
      if ('error' in response) return response;
      return { data: mapPrivacy(response.data), meta: response.meta };
    },
    updatePreferences: async ({ enabled }) => {
      if (enabled) {
        const consent = await request({
          method: 'PUT',
          path: '/v1/personal-ai/consent',
          body: { version: 'personal-ai-v1' },
        });
        if ('error' in consent) return consent;
      }
      const updated = await request({
        method: 'PATCH',
        path: '/v1/personal-ai/preferences',
        body: { enabled },
      });
      if ('error' in updated) return updated;
      const privacy = await request<PersonalAIPrivacyView>({
        method: 'GET',
        path: '/v1/personal-ai/privacy',
      });
      if ('error' in privacy) return privacy;
      return { data: mapPrivacy(privacy.data), meta: privacy.meta };
    },
    getIndexStatus: async () => {
      const response = await request<PersonalAIIndexStatusView>({
        method: 'GET',
        path: '/v1/personal-ai/index-status',
      });
      if ('error' in response) return response;
      return { data: mapIndexStatus(response.data), meta: response.meta };
    },
    rebuildIndex: async () => {
      const response = await request({
        method: 'POST',
        path: '/v1/personal-ai/index/rebuild',
        body: { scope: 'USER_SELECTED_ARCHIVE' },
      });
      if ('error' in response) return response;
      const status = await request<PersonalAIIndexStatusView>({
        method: 'GET',
        path: '/v1/personal-ai/index-status',
      });
      if ('error' in status) return status;
      return { data: mapIndexStatus(status.data), meta: status.meta };
    },
    clearIndex: async () => {
      const response = await request<PersonalAIIndexStatusView>({
        method: 'DELETE',
        path: '/v1/personal-ai/index',
        body: {},
      });
      if ('error' in response) return response;
      return { data: mapIndexStatus(response.data), meta: response.meta };
    },
    deleteInsights: async () => {
      const response = await request<readonly { readonly id: string }[]>({
        method: 'GET',
        path: '/v1/personal-ai/insights',
      });
      if ('error' in response) return response;
      let deletedCount = 0;
      for (const insight of response.data) {
        const deleted = await request({
          method: 'DELETE',
          path: `/v1/personal-ai/insights/${encodeURIComponent(insight.id)}`,
        });
        if ('error' in deleted) return deleted;
        deletedCount += 1;
      }
      return { data: { deletedCount }, meta: response.meta };
    },
    saveInsight: ({ queryId, title }) =>
      request({
        method: 'POST',
        path: `/v1/personal-ai/queries/${encodeURIComponent(queryId)}/insight`,
        body: title === undefined ? {} : { title },
      }),
    relatedMemories: ({ sourceType, sourceId, limit }) =>
      request({
        method: 'GET',
        path: '/v1/personal-ai/related-memories',
        query: { sourceType, sourceId, limit },
      }),
  };
}

export function createRuntimeAskArchiveClient(
  options: AskArchiveRuntimeOptions = {},
): AskArchiveClient {
  const production = options.production ?? import.meta.env.PROD;
  const configured = runtimeBaseUrl(options.apiBaseUrl, production);
  if (configured !== undefined)
    return new ApiAskArchiveClient(
      createAskArchiveSdkFacade(new FetchMessagingTransport({ baseUrl: configured })),
    );
  if (
    !production &&
    options.fixtureEnabled === true &&
    options.apiBaseUrl?.trim().length === 0
  )
    return new DevelopmentFixtureAskArchiveClient();
  return new UnavailableAskArchiveClient();
}

export const askArchiveClient: AskArchiveClient = createRuntimeAskArchiveClient({
  apiBaseUrl: import.meta.env.VITE_MEZIP_PERSONAL_AI_API_BASE_URL,
  fixtureEnabled: import.meta.env.VITE_MEZIP_PERSONAL_AI_FIXTURE === 'true',
});

export function createAskArchiveActionKey(scope: string): string {
  const normalized =
    scope.replace(/[^a-z0-9_-]/giu, '').slice(0, 32) || 'archive-query';
  const random =
    typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function'
      ? crypto.randomUUID().replace(/-/gu, '')
      : Math.random().toString(36).slice(2, 14);
  return `${normalized}-${Date.now().toString(36)}-${random}`;
}
