import { useEffect, useMemo, useRef, useState, type FormEvent } from 'react';

import type { AppRoute } from './appModel.js';
import {
  askArchiveClient,
  createAskArchiveActionKey,
  normalizeAskArchiveFilters,
  personalAiContextScopes,
  personalAiSourceTypes,
  type AskArchiveAnswer,
  type AskArchiveCitation,
  type AskArchiveClient,
  type AskArchiveExportStatus,
  type AskArchiveFilters,
  type AskArchiveSnapshot,
  type PersonalAiContextScope,
  type PersonalAiSourceType,
  type RelatedMemory,
} from './askArchiveClient.js';
import type { ExperienceTier } from './experienceSettings.js';

const scopeLabels: Readonly<Record<PersonalAiContextScope, string>> = {
  NONE: '未选择（默认）',
  SELECTED_ENTRY: '选中的一条记录',
  SELECTED_ENTRIES: '选中的多条记录',
  CURRENT_DAY: '今天',
  DATE_RANGE: '日期范围',
  LIFE: 'Life 生活',
  TIMELINE: '时间轴',
  HISTORY: '历史 / 阅读',
  FITNESS: '健身',
  DAILY_PACK: 'Daily Pack',
  AI_USAGE: 'AI 使用聚合',
  SELECTED_MEDIA: '选中的媒体（需主动选择）',
  USER_SELECTED_ARCHIVE: '我选择的档案',
};

const sourceLabels: Readonly<Record<PersonalAiSourceType, string>> = {
  LIFE: 'Life',
  TIMELINE: '时间轴指针',
  HISTORY: '历史 / 阅读',
  FITNESS: '健身',
  STEPS: '步数',
  DAILY_PACK: 'Daily Pack',
  AI_USAGE: 'AI 使用聚合',
  TAGS: '标签',
  PUBLISHED_SNAPSHOT: '我的已发布快照',
};

const sourceRoutes: Readonly<Record<PersonalAiSourceType, AppRoute>> = {
  LIFE: '/life',
  TIMELINE: '/timeline',
  HISTORY: '/history',
  FITNESS: '/fitness',
  STEPS: '/fitness',
  DAILY_PACK: '/daily-pack',
  // Timeline is the archive detail surface that can resolve an entry id;
  // the AI usage dashboard is an aggregate view and would silently discard
  // the cited source id.
  AI_USAGE: '/timeline',
  TAGS: '/timeline',
  PUBLISHED_SNAPSHOT: '/timeline',
};

const reviewPresets = [
  { id: 'daily', label: 'Daily Review', query: '总结今天的档案', days: 1 },
  { id: 'weekly', label: 'Weekly Review', query: '总结过去 7 天', days: 7 },
  { id: 'month', label: '过去 30 天', query: '总结过去 30 天', days: 30 },
  {
    id: 'topics',
    label: '最近的主题',
    query: '我最近记录最多的主题是什么？',
    days: 30,
  },
] as const;

type ViewState = 'IDLE' | 'LOADING' | 'ANSWER' | 'NO_EVIDENCE' | 'ERROR' | 'STOPPED';
type SnapshotState = 'LOADING' | 'READY' | 'ERROR';
type RelatedState = 'IDLE' | 'LOADING' | 'READY' | 'ERROR';

function formatDate(value: string | null): string {
  if (value === null) return '尚无记录';
  const parsed = new Date(value);
  if (!Number.isFinite(parsed.getTime())) return '尚无记录';
  return new Intl.DateTimeFormat('zh-CN', {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
  }).format(parsed);
}

function todayIso(): string {
  return new Date().toISOString().slice(0, 10);
}

function dateBefore(days: number): string {
  const date = new Date();
  date.setDate(date.getDate() - (days - 1));
  return date.toISOString().slice(0, 10);
}

function scopeSources(filters: AskArchiveFilters): string {
  const selected =
    filters.sourceTypes.length === 0
      ? '服务端按授权范围决定'
      : filters.sourceTypes.map((source) => sourceLabels[source]).join('、');
  const dates =
    filters.dateFrom === null && filters.dateTo === null
      ? '未限定日期'
      : `${filters.dateFrom ?? '起始不限'} — ${filters.dateTo ?? '结束不限'}`;
  return `${scopeLabels[filters.scope]} · ${selected} · ${dates}`;
}

function sourceHref(sourceType: PersonalAiSourceType, sourceId: string): string {
  const route = sourceRoutes[sourceType];
  // These are fixed internal routes.  Only the opaque source id is encoded;
  // it is consumed by the destination archive page, never interpolated as a
  // route or origin.
  return `${route}?sourceId=${encodeURIComponent(sourceId)}&sourceType=${encodeURIComponent(sourceType)}`;
}

function citationHref(citation: AskArchiveCitation): string {
  return sourceHref(citation.sourceType, citation.sourceId);
}

function answerLabel(answer: AskArchiveAnswer): string {
  if (answer.evidenceKind === 'DIRECT_EVIDENCE') return '档案中有直接记录';
  if (answer.evidenceKind === 'INFERRED_FROM_RECORDS') return '根据多条记录归纳';
  return '当前范围没有档案证据';
}

function InlineNotice({
  tone,
  children,
}: {
  readonly tone: 'INFO' | 'ERROR' | 'SUCCESS';
  readonly children: string;
}) {
  return (
    <p
      className={`ask-archive-notice ask-archive-notice-${tone.toLowerCase()}`}
      role={tone === 'ERROR' ? 'alert' : 'status'}
    >
      {children}
    </p>
  );
}

function CitationCard({
  citation,
}: {
  readonly citation: AskArchiveCitation;
}) {
  const href = citationHref(citation);
  return (
    <li className="ask-archive-citation-card">
      <a href={href}>
        <span className="ask-archive-citation-type">
          {sourceLabels[citation.sourceType]}
        </span>
        <strong>{citation.displayTitle}</strong>
        <span className="ask-archive-citation-date">
          {formatDate(citation.occurredAt)}
        </span>
        <span className="ask-archive-citation-excerpt">{citation.excerptSafe}</span>
      </a>
    </li>
  );
}

function RelatedMemoriesPanel({
  memories,
  state,
  onFind,
}: {
  readonly memories: readonly RelatedMemory[];
  readonly state: RelatedState;
  readonly onFind: () => void;
}) {
  return (
    <section
      className="ask-archive-panel ask-archive-related"
      aria-labelledby="ask-archive-related-title"
    >
      <div className="ask-archive-section-heading">
        <div>
          <p className="eyebrow">SEMANTIC RETRIEVAL / SAME OWNER</p>
          <h2 id="ask-archive-related-title">相关记忆</h2>
        </div>
        <button
          className="quiet-button"
          type="button"
          disabled={state === 'LOADING'}
          onClick={onFind}
        >
          {state === 'LOADING' ? '正在查找…' : '查找相关记忆'}
        </button>
      </div>
      {state === 'ERROR' ? (
        <InlineNotice tone="ERROR">
          相关记忆暂时不可用；不会显示未经授权的记录。
        </InlineNotice>
      ) : null}
      {state === 'READY' && memories.length === 0 ? (
        <p className="ask-archive-muted">当前范围没有其他相似记录。</p>
      ) : null}
      {memories.length > 0 ? (
        <ul className="ask-archive-related-list">
          {memories.map((memory) => (
            <li key={`${memory.sourceType}:${memory.sourceId}`}>
              <a href={sourceHref(memory.sourceType, memory.sourceId)}>
                <span className="ask-archive-citation-type">
                  {sourceLabels[memory.sourceType]}
                </span>
                <strong>{memory.displayTitle}</strong>
                <span>{memory.excerptSafe}</span>
              </a>
            </li>
          ))}
        </ul>
      ) : null}
    </section>
  );
}

function PrivacyIndexPanel({
  snapshot,
  snapshotState,
  consentChecked,
  actionPending,
  actionMessage,
  exportMessage,
  exportState,
  exportSummary,
  confirmAction,
  onToggle,
  onConsentChange,
  onCreateExport,
  onRefreshExports,
  onRebuild,
  onClear,
  onDeleteInsights,
  onConfirmAction,
  onCancelAction,
}: {
  readonly snapshot: AskArchiveSnapshot | null;
  readonly snapshotState: SnapshotState;
  readonly consentChecked: boolean;
  readonly actionPending: string | null;
  readonly actionMessage: string | null;
  readonly exportMessage: string | null;
  readonly exportState: 'IDLE' | 'LOADING' | 'READY' | 'ERROR';
  readonly exportSummary: AskArchiveExportStatus | null;
  readonly confirmAction: 'CLEAR_INDEX' | 'DELETE_INSIGHTS' | null;
  readonly onToggle: () => void;
  readonly onConsentChange: (checked: boolean) => void;
  readonly onCreateExport: () => void;
  readonly onRefreshExports: () => void;
  readonly onRebuild: () => void;
  readonly onClear: () => void;
  readonly onDeleteInsights: () => void;
  readonly onConfirmAction: () => void;
  readonly onCancelAction: () => void;
}) {
  const privacy = snapshot?.privacy;
  const index = snapshot?.index;
  return (
    <section
      className="ask-archive-panel ask-archive-privacy"
      aria-labelledby="ask-archive-privacy-title"
    >
      <div className="ask-archive-section-heading">
        <div>
          <p className="eyebrow">PERSONAL AI / PRIVACY CENTER</p>
          <h2 id="ask-archive-privacy-title">Personal AI 隐私与索引</h2>
        </div>
        <span
          className={`ask-archive-status-chip ${privacy?.enabled ? 'is-on' : 'is-off'}`}
        >
          {snapshotState === 'LOADING'
            ? '读取中'
            : privacy?.enabled
              ? '已开启'
              : '已关闭'}
        </span>
      </div>
      {snapshotState === 'ERROR' ? (
        <InlineNotice tone="ERROR">隐私状态暂时不可用；查询会保持关闭。</InlineNotice>
      ) : null}
      {privacy ? (
        <>
          <p className="ask-archive-disclosure">
            Personal AI 只读取你明确选择的范围。索引是可删除的衍生数据；Private Messages
            默认排除。启用后，被授权的文本可能发送给当前服务端配置的 AI / Embedding
            Provider。
          </p>
          <div className="ask-archive-fact-grid">
            <div>
              <span>索引来源</span>
              <strong>{privacy.indexedSourceCount} 条</strong>
            </div>
            <div>
              <span>最后索引</span>
              <strong>{formatDate(privacy.lastIndexedAt)}</strong>
            </div>
            <div>
              <span>Embedding</span>
              <strong>{privacy.embeddingProviderLabel ?? '服务端未公开'}</strong>
            </div>
            <div>
              <span>索引状态</span>
              <strong>{index?.status ?? '未知'}</strong>
            </div>
          </div>
          {!privacy.enabled ? (
            <label className="ask-archive-consent-row">
              <input
                type="checkbox"
                checked={consentChecked}
                onChange={(event) => onConsentChange(event.target.checked)}
              />
              <span>
                我已阅读上面的 Provider disclosure，并明确同意开启 Personal AI 索引。
              </span>
            </label>
          ) : null}
          <div className="ask-archive-privacy-actions">
            <button
              className={privacy.enabled ? 'quiet-button' : 'create-button'}
              type="button"
              disabled={actionPending !== null || (!privacy.enabled && !consentChecked)}
              onClick={onToggle}
            >
              {privacy.enabled ? '关闭 Personal AI' : '开启 Personal AI'}
            </button>
            <button
              className="quiet-button"
              type="button"
              disabled={actionPending !== null}
              onClick={onRebuild}
              >
              {actionPending === 'REBUILD' ? '正在重建…' : '重建个人 AI 索引'}
            </button>
            <button
              className="quiet-button quiet-button-danger"
              type="button"
              disabled={actionPending !== null}
              onClick={onClear}
            >
              清除衍生索引
            </button>
            <button
              className="quiet-button quiet-button-danger"
              type="button"
              disabled={actionPending !== null}
              onClick={onDeleteInsights}
            >
              删除 AI Insights
            </button>
          </div>
          <div className="ask-archive-export-block">
            <div className="ask-archive-section-heading">
              <div>
                <p className="eyebrow">EXPORT / METADATA ONLY</p>
                <h3>导出我的元数据</h3>
              </div>
              <span className={`ask-archive-status-chip ${exportState === 'READY' ? 'is-on' : 'is-off'}`}>
                {exportSummary?.job.status ?? (exportState === 'LOADING' ? '读取中' : '未导出')}
              </span>
            </div>
            <p className="ask-archive-disclosure">
              只导出 Preferences、Consent history、Index manifest、Insight metadata 与
              citation references；Original Archive 内容、knowledge chunks、embedding
              vectors、query prompt / answer、AI insight content、citation display text
              和 provider secrets 都不会进入导出。
            </p>
            <div className="ask-archive-privacy-actions">
              <button
                className="quiet-button"
                type="button"
                disabled={actionPending !== null || exportState === 'LOADING'}
                onClick={onCreateExport}
              >
                {exportState === 'LOADING' ? '正在创建导出…' : '准备元数据导出'}
              </button>
              <button
                className="quiet-button"
                type="button"
                disabled={actionPending !== null}
                onClick={onRefreshExports}
              >
                刷新导出状态
              </button>
            </div>
            {exportMessage ? (
              <InlineNotice tone={exportState === 'ERROR' ? 'ERROR' : 'INFO'}>
                {exportMessage}
              </InlineNotice>
            ) : null}
          </div>
          {confirmAction ? (
            <div
              className="ask-archive-inline-confirm"
              role="group"
              aria-label="确认危险操作"
            >
              <span>
                {confirmAction === 'CLEAR_INDEX'
                  ? '清除只删除衍生索引，不会删除 Original Archive。'
                  : '删除后不会影响 Original Archive。'}
              </span>
              <button
                className="quiet-button quiet-button-danger"
                type="button"
                disabled={actionPending !== null}
                onClick={onConfirmAction}
              >
                确认
              </button>
              <button
                className="quiet-button"
                type="button"
                disabled={actionPending !== null}
                onClick={onCancelAction}
              >
                取消
              </button>
            </div>
          ) : null}
          {actionMessage ? (
            <InlineNotice tone="INFO">{actionMessage}</InlineNotice>
          ) : null}
          <p className="ask-archive-privacy-note">
            同意版本：{privacy.consentVersion ?? '尚未同意'} · Private
            Messages：明确排除
          </p>
        </>
      ) : null}
    </section>
  );
}

export function AskMyArchivePage({
  client,
  tier,
}: {
  readonly client: AskArchiveClient;
  readonly tier: ExperienceTier;
}) {
  const [filters, setFilters] = useState<AskArchiveFilters>(() =>
    normalizeAskArchiveFilters(),
  );
  const [query, setQuery] = useState('');
  const [lastQuery, setLastQuery] = useState('');
  const [lastFilters, setLastFilters] = useState<AskArchiveFilters>(() =>
    normalizeAskArchiveFilters(),
  );
  const [conversationId, setConversationId] = useState<string | null>(null);
  const [answer, setAnswer] = useState<AskArchiveAnswer | null>(null);
  const [viewState, setViewState] = useState<ViewState>('IDLE');
  const [inlineMessage, setInlineMessage] = useState<string | null>(null);
  const [snapshot, setSnapshot] = useState<AskArchiveSnapshot | null>(null);
  const [snapshotState, setSnapshotState] = useState<SnapshotState>('LOADING');
  const [consentChecked, setConsentChecked] = useState(false);
  const [actionPending, setActionPending] = useState<string | null>(null);
  const [actionMessage, setActionMessage] = useState<string | null>(null);
  const [exportState, setExportState] = useState<'IDLE' | 'LOADING' | 'READY' | 'ERROR'>('LOADING');
  const [exportMessage, setExportMessage] = useState<string | null>(null);
  const [exportSummary, setExportSummary] = useState<AskArchiveExportStatus | null>(null);
  const [confirmAction, setConfirmAction] = useState<
    'CLEAR_INDEX' | 'DELETE_INSIGHTS' | null
  >(null);
  const [related, setRelated] = useState<readonly RelatedMemory[]>([]);
  const [relatedState, setRelatedState] = useState<RelatedState>('IDLE');
  const [insightMessage, setInsightMessage] = useState<string | null>(null);
  const activeToken = useRef(0);
  const exportToken = useRef(0);
  const currentRequestId = useRef<string | null>(null);

  const refreshSnapshot = () => {
    setSnapshotState('LOADING');
    void client.readSnapshot().then((result) => {
      if (result.ok) {
        setSnapshot(result.data);
        setSnapshotState('READY');
      } else {
        setSnapshotState('ERROR');
        setSnapshot(null);
      }
    });
  };

  const refreshExports = () => {
    const token = ++exportToken.current;
    setExportState('LOADING');
    setExportMessage('正在读取元数据导出状态…');
    setExportSummary(null);
    void client.listExports({ limit: 1 }).then((result) => {
      if (token !== exportToken.current) return;
      if (!result.ok) {
        setExportState('ERROR');
        setExportMessage(result.error.message);
        return;
      }
      const latest = result.data.items[0];
      if (latest === undefined) {
        setExportState('READY');
        setExportMessage('尚无导出任务；点击按钮将创建只含元数据的导出。');
        return;
      }
      void client.getExport(latest.id).then((exportResult) => {
        if (token !== exportToken.current) return;
        if (!exportResult.ok) {
          setExportState('ERROR');
          setExportMessage(exportResult.error.message);
          return;
        }
        setExportSummary(exportResult.data);
        setExportState(exportResult.data.job.status === 'FAILED' ? 'ERROR' : 'READY');
        setExportMessage(
          exportResult.data.result === null
            ? `最新导出任务 ${exportResult.data.job.id} 当前为 ${exportResult.data.job.status}。`
            : `最新导出已就绪：${exportResult.data.result.exportedAt}。`,
        );
      });
    });
  };

  useEffect(() => {
    refreshSnapshot();
    refreshExports();
    return () => {
      activeToken.current += 1;
      exportToken.current += 1;
    };
    // The app provides a stable singleton client; reloading on a client change
    // is intentional for fixture/server QA.
  }, [client]);

  const contextDescription = useMemo(() => scopeSources(filters), [filters]);
  const requiresSelection =
    filters.scope === 'SELECTED_ENTRY' ||
    filters.scope === 'SELECTED_ENTRIES' ||
    filters.scope === 'SELECTED_MEDIA';
  const canSubmit =
    query.trim().length > 0 &&
    filters.scope !== 'NONE' &&
    !requiresSelection &&
    viewState !== 'LOADING';
  const personalAiEnabled = snapshot?.privacy.enabled ?? false;

  const submitQuery = (
    event?: FormEvent<HTMLFormElement>,
    overrideQuery?: string,
    overrideFilters?: AskArchiveFilters,
  ) => {
    event?.preventDefault();
    const nextQuery = (overrideQuery ?? query).trim();
    const nextFilters = overrideFilters ?? filters;
    setInlineMessage(null);
    if (nextFilters.scope === 'NONE') {
      setInlineMessage('请先选择明确的档案范围；Personal AI 不会默认读取全部档案。');
      return;
    }
    if (
      nextFilters.scope === 'SELECTED_ENTRY' ||
      nextFilters.scope === 'SELECTED_ENTRIES' ||
      nextFilters.scope === 'SELECTED_MEDIA'
    ) {
      setInlineMessage(
        '这个范围需要从 Life / History 详情页主动选中记录或媒体后再发起。当前入口不会猜测选择。',
      );
      return;
    }
    if (!personalAiEnabled) {
      setInlineMessage('Personal AI 当前已关闭；请在下方隐私中心明确开启后再查询。');
      return;
    }
    if (nextQuery.length === 0) {
      setInlineMessage('请输入问题后再查询。');
      return;
    }
    const token = ++activeToken.current;
    currentRequestId.current = null;
    setLastQuery(nextQuery);
    setLastFilters(nextFilters);
    setViewState('LOADING');
    setAnswer(null);
    setRelated([]);
    setRelatedState('IDLE');
    setInsightMessage(null);
    const idempotencyKey = createAskArchiveActionKey('ask-archive');
    void client
      .query({
        query: nextQuery,
        filters: nextFilters,
        conversationId,
        idempotencyKey,
      })
      .then((result) => {
        if (token !== activeToken.current) return;
        if (!result.ok) {
          setViewState('ERROR');
          setInlineMessage(result.error.message);
          return;
        }
        currentRequestId.current = result.data.requestId;
        setAnswer(result.data);
        setConversationId(result.data.conversationId);
        setViewState(
          result.data.evidenceKind === 'NO_EVIDENCE' ? 'NO_EVIDENCE' : 'ANSWER',
        );
      });
  };

  const stopQuery = () => {
    activeToken.current += 1;
    setViewState('STOPPED');
    setInlineMessage('已停止显示这次查询；不会继续读取新的档案。');
    const requestId = currentRequestId.current;
    if (requestId !== null) {
      void client.cancelQuery({
        requestId,
        idempotencyKey: createAskArchiveActionKey('cancel-archive'),
      });
    }
  };

  const clearContext = () => {
    activeToken.current += 1;
    currentRequestId.current = null;
    setQuery('');
    setLastQuery('');
    setFilters(normalizeAskArchiveFilters());
    setLastFilters(normalizeAskArchiveFilters());
    setConversationId(null);
    setAnswer(null);
    setRelated([]);
    setRelatedState('IDLE');
    setInsightMessage(null);
    setInlineMessage('已清除本次 Personal AI 对话范围与上下文。');
    setViewState('IDLE');
  };

  const retryQuery = () => {
    setQuery(lastQuery);
    setFilters(lastFilters);
    submitQuery(undefined, lastQuery, lastFilters);
  };

  const selectReview = (days: number, presetQuery: string) => {
    const nextFilters = normalizeAskArchiveFilters({
      ...filters,
      scope: 'DATE_RANGE',
      dateFrom: dateBefore(days),
      dateTo: todayIso(),
    });
    setFilters(nextFilters);
    setQuery(presetQuery);
    setInlineMessage(`已选择 ${days} 天范围；请确认后提交。`);
  };

  const findRelated = () => {
    const citation = answer?.citations[0];
    if (citation === undefined) {
      setRelatedState('READY');
      setRelated([]);
      return;
    }
    setRelatedState('LOADING');
    void client
      .relatedMemories({
        sourceType: citation.sourceType,
        sourceId: citation.sourceId,
        limit: 6,
      })
      .then((result) => {
        if (!result.ok) {
          setRelatedState('ERROR');
          return;
        }
        setRelated(result.data);
        setRelatedState('READY');
      });
  };

  const saveInsight = () => {
    if (answer === null) return;
    setInsightMessage(null);
    void client.saveInsight({ queryId: answer.requestId }).then((result) => {
      setInsightMessage(
        result.ok
          ? '已保存为 AI_INSIGHT；Original Archive 没有被修改。'
          : result.error.message,
      );
    });
  };

  const createExport = () => {
    exportToken.current += 1;
    setExportState('LOADING');
    setExportMessage('正在创建只含元数据的导出任务…');
    setExportSummary(null);
    void client
      .createExport({
        includeConversations: false,
        includeDeletedInsights: false,
      })
      .then((result) => {
        if (!result.ok) {
          setExportState('ERROR');
          setExportMessage(result.error.message);
          return;
        }
        setExportSummary(result.data);
        setExportState(result.data.job.status === 'FAILED' ? 'ERROR' : 'READY');
        setExportMessage(
          result.data.result === null
            ? `导出任务 ${result.data.job.id} 已创建，当前状态 ${result.data.job.status}。`
            : `导出已就绪：${result.data.result.exportedAt}。`,
        );
        refreshExports();
      });
  };

  const runAction = (name: string, action: () => Promise<unknown>, success: string) => {
    setActionPending(name);
    setActionMessage(null);
    void action()
      .then((result) => {
        if (
          typeof result === 'object' &&
          result !== null &&
          'ok' in result &&
          result.ok === false
        ) {
          setActionMessage('操作未完成；服务端没有改变你的原始档案。');
          return;
        }
        setActionMessage(success);
        refreshSnapshot();
      })
      .finally(() => setActionPending(null));
  };

  const togglePrivacy = () => {
    const enabled = !(snapshot?.privacy.enabled ?? false);
    if (enabled && !consentChecked) {
      setActionMessage('请先阅读 disclosure 并勾选明确同意。');
      return;
    }
    runAction(
      'TOGGLE',
      () =>
        client.updatePreferences(
          enabled ? { enabled, consentVersion: 'personal-ai-v1' } : { enabled },
        ),
      enabled
        ? 'Personal AI 已开启；请继续选择明确范围。'
        : 'Personal AI 已关闭；新的检索与索引已停止.',
    );
  };

  const confirmIndexAction = () => {
    if (confirmAction === 'CLEAR_INDEX') {
      runAction(
        'CLEAR_INDEX',
        () => client.clearIndex(),
        '衍生索引已清除；Original Archive 保持不变。',
      );
    } else if (confirmAction === 'DELETE_INSIGHTS') {
      runAction(
        'DELETE_INSIGHTS',
        () => client.deleteInsights(),
        'AI Insights 已删除；Original Archive 保持不变。',
      );
    }
    setConfirmAction(null);
  };

  return (
    <div className="ask-archive-page" data-tier={tier}>
      <section className="ask-archive-hero">
        <div>
          <p className="eyebrow">PERSONAL AI / ASK MY ARCHIVE</p>
          <h1>问问我的档案</h1>
          <p className="lede">
            在你明确授权的范围内检索、解释并引用自己的
            ME.zip。它不是普通聊天，也不会默认读取全部私人数据。
          </p>
        </div>
        <div className="ask-archive-hero-status">
          <span data-source={client.source}>
            {client.source === 'DEVELOPMENT_FIXTURE'
              ? '开发夹具 · 合成数据'
              : client.source === 'SERVER'
                ? '服务端 Personal AI'
                : '服务未连接'}
          </span>
          <small>
            模式固定为 ARCHIVE_ONLY
            <br />
            Private Messages 默认排除
          </small>
        </div>
      </section>

      <section className="ask-archive-boundary" aria-label="Personal AI 授权边界">
        <strong>当前上下文</strong>
        <span>{contextDescription}</span>
        <small>
          只有这里显示的范围会被提交；Root / Admin 权限不会传给 Personal AI。
        </small>
      </section>

      <section
        className="ask-archive-panel ask-archive-controls"
        aria-labelledby="ask-archive-scope-title"
      >
        <div className="ask-archive-section-heading">
          <div>
            <p className="eyebrow">EXPLICIT CONTEXT / SCOPE</p>
            <h2 id="ask-archive-scope-title">选择要查询的范围</h2>
          </div>
          <span className="ask-archive-mode-chip">ARCHIVE_ONLY</span>
        </div>
        <div className="ask-archive-control-grid">
          <label>
            <span>Scope（必选）</span>
            <select
              value={filters.scope}
              onChange={(event) =>
                setFilters((current) =>
                  normalizeAskArchiveFilters({
                    ...current,
                    scope: event.target.value as PersonalAiContextScope,
                  }),
                )
              }
            >
              {personalAiContextScopes.map((scope) => (
                <option key={scope} value={scope}>
                  {scopeLabels[scope]}
                </option>
              ))}
            </select>
          </label>
          <label>
            <span>开始日期（可选）</span>
            <input
              type="date"
              value={filters.dateFrom ?? ''}
              onChange={(event) =>
                setFilters((current) =>
                  normalizeAskArchiveFilters({
                    ...current,
                    scope: event.target.value ? 'DATE_RANGE' : current.scope,
                    dateFrom: event.target.value || null,
                  }),
                )
              }
            />
          </label>
          <label>
            <span>结束日期（可选）</span>
            <input
              type="date"
              value={filters.dateTo ?? ''}
              onChange={(event) =>
                setFilters((current) =>
                  normalizeAskArchiveFilters({
                    ...current,
                    scope: event.target.value ? 'DATE_RANGE' : current.scope,
                    dateTo: event.target.value || null,
                  }),
                )
              }
            />
          </label>
        </div>
        <fieldset className="ask-archive-source-filters">
          <legend>来源筛选（可多选）</legend>
          <div>
            {personalAiSourceTypes.map((source) => (
              <label key={source}>
                <input
                  type="checkbox"
                  checked={filters.sourceTypes.includes(source)}
                  onChange={(event) =>
                    setFilters((current) =>
                      normalizeAskArchiveFilters({
                        ...current,
                        sourceTypes: event.target.checked
                          ? [...current.sourceTypes, source]
                          : current.sourceTypes.filter((item) => item !== source),
                      }),
                    )
                  }
                />
                <span>{sourceLabels[source]}</span>
              </label>
            ))}
          </div>
          <small>
            Private Messages 不在可选来源内；媒体只有用户明确选中后才可进入独立范围。
          </small>
        </fieldset>
        <div className="ask-archive-quick-scopes" aria-label="快速范围">
          <span>快速回顾</span>
          {reviewPresets.map((preset) => (
            <button
              key={preset.id}
              className="quiet-button"
              type="button"
              onClick={() => selectReview(preset.days, preset.query)}
            >
              {preset.label}
            </button>
          ))}
        </div>
      </section>

      <section
        className="ask-archive-panel ask-archive-composer"
        aria-labelledby="ask-archive-composer-title"
      >
        <div className="ask-archive-section-heading">
          <div>
            <p className="eyebrow">QUESTION COMPOSER</p>
            <h2 id="ask-archive-composer-title">你想从自己的档案里知道什么？</h2>
          </div>
          <button className="quiet-button" type="button" onClick={clearContext}>
            清除上下文
          </button>
        </div>
        <form onSubmit={submitQuery}>
          <label className="ask-archive-question-field">
            <span className="sr-only">输入问题</span>
            <textarea
              value={query}
              placeholder="例如：我最近写过哪些关于北宋的内容？"
              onChange={(event) => setQuery(event.target.value)}
            />
          </label>
          <div className="ask-archive-form-actions">
            <button
              className="create-button"
              type="submit"
              disabled={!canSubmit || !personalAiEnabled}
            >
              {viewState === 'LOADING' ? '正在检索并生成…' : '询问我的档案'}
            </button>
            {viewState === 'LOADING' ? (
              <button className="quiet-button" type="button" onClick={stopQuery}>
                停止
              </button>
            ) : null}
            <span className="ask-archive-form-hint">
              {!personalAiEnabled
                ? '请先在隐私中心开启 Personal AI。'
                : requiresSelection
                  ? '选中记录/媒体后才能使用此 Scope。'
                  : '提交前请确认上方范围。'}
            </span>
          </div>
        </form>
        {inlineMessage ? (
          <InlineNotice tone={viewState === 'ERROR' ? 'ERROR' : 'INFO'}>
            {inlineMessage}
          </InlineNotice>
        ) : null}
      </section>

      {viewState === 'LOADING' ? (
        <section className="ask-archive-panel ask-archive-loading" aria-live="polite">
          <span className="code-shimmer" role="status">
            <span aria-hidden="true">{'{'} </span>
            <span>正在按授权范围检索…</span>
            <span aria-hidden="true"> {'}'}</span>
          </span>
          <p>不会扫描未选择的来源；回答稳定后才会展示引用。</p>
        </section>
      ) : null}
      {viewState === 'STOPPED' ? (
        <section className="ask-archive-panel">
          <InlineNotice tone="INFO">
            这次 Personal AI 查询已停止。你可以调整范围后重新提交。
          </InlineNotice>
        </section>
      ) : null}
      {viewState === 'ERROR' ? (
        <section className="ask-archive-panel ask-archive-error" aria-live="polite">
          <h2>这次查询没有完成</h2>
          <p>服务端没有改变你的原始档案，也不会用通用知识补齐答案。</p>
          <button
            className="quiet-button"
            type="button"
            disabled={lastQuery.length === 0}
            onClick={retryQuery}
          >
            重试
          </button>
        </section>
      ) : null}
      {answer ? (
        <section
          className="ask-archive-panel ask-archive-answer"
          aria-labelledby="ask-archive-answer-title"
        >
          <div className="ask-archive-section-heading">
            <div>
              <p className="eyebrow">
                ANSWER / {answer.evidenceKind.replaceAll('_', ' ')}
              </p>
              <h2 id="ask-archive-answer-title">档案回答</h2>
            </div>
            <span className="ask-archive-evidence-chip">{answerLabel(answer)}</span>
          </div>
          {answer.evidenceKind === 'NO_EVIDENCE' ? (
            <div className="ask-archive-no-evidence" role="status">
              <strong>没有找到相关档案。</strong>
              <p>
                在当前授权范围内没有可验证的记录；ARCHIVE_ONLY
                不会使用模型的通用知识猜测答案。
              </p>
            </div>
          ) : (
            <p className="ask-archive-answer-text">
              {answer.answerText ?? '服务端没有返回可显示的档案回答。'}
            </p>
          )}
          <p className="ask-archive-answer-meta">
            查询范围：{scopeSources(lastFilters)} · 检索耗时：
            {answer.retrievalLatencyMs === null
              ? '未提供'
              : `${answer.retrievalLatencyMs} ms`}
          </p>
          {answer.citations.length > 0 ? (
            <div className="ask-archive-citations">
              <h3>来源引用（点击打开自己的档案）</h3>
              <ul>
                {answer.citations.map((citation) => (
                  <CitationCard
                    key={citation.citationId}
                    citation={citation}
                  />
                ))}
              </ul>
            </div>
          ) : null}
          <div className="ask-archive-follow-ups">
            <span>继续追问</span>
            {answer.suggestedFollowUps.map((followUp) => (
              <button
                key={followUp}
                className="quiet-button"
                type="button"
                onClick={() => {
                  setQuery(followUp);
                  submitQuery(undefined, followUp, lastFilters);
                }}
              >
                {followUp}
              </button>
            ))}
            <button className="quiet-button" type="button" onClick={findRelated}>
              找相似记录
            </button>
            <button className="quiet-button" type="button" onClick={saveInsight}>
              保存为 AI Insight
            </button>
          </div>
          {insightMessage ? (
            <InlineNotice tone="INFO">{insightMessage}</InlineNotice>
          ) : null}
        </section>
      ) : null}

      {answer ? (
        <RelatedMemoriesPanel
          memories={related}
          state={relatedState}
          onFind={findRelated}
        />
      ) : null}

      <PrivacyIndexPanel
        actionMessage={actionMessage}
        actionPending={actionPending}
        consentChecked={consentChecked}
        confirmAction={confirmAction}
        exportMessage={exportMessage}
        exportState={exportState}
        exportSummary={exportSummary}
        onCancelAction={() => setConfirmAction(null)}
        onClear={() => setConfirmAction('CLEAR_INDEX')}
        onCreateExport={createExport}
        onConfirmAction={confirmIndexAction}
        onConsentChange={setConsentChecked}
        onDeleteInsights={() => setConfirmAction('DELETE_INSIGHTS')}
        onRefreshExports={refreshExports}
        onRebuild={() =>
          runAction(
            'REBUILD',
            () => client.rebuildIndex(),
            '已提交重建索引请求；原始档案不会被阻塞。',
          )
        }
        onToggle={togglePrivacy}
        snapshot={snapshot}
        snapshotState={snapshotState}
      />
    </div>
  );
}

export { askArchiveClient };
