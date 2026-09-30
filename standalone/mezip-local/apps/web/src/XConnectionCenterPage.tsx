import { useCallback, useEffect, useMemo, useRef, useState, type FormEvent, type ReactNode } from 'react';
import type { ExperienceTier } from './experienceSettings.js';
import type { AppRoute } from './appModel.js';
import { localArchiveAdapter } from './archiveStore.js';
import {
  xCenterClient,
  xRequestedReadScopes,
  type XCenterContent,
  type XCenterView,
  type XFeedKind,
  type XPostMetrics,
} from './xCenterClient.js';

type XTab = 'OVERVIEW' | 'POSTS' | 'BOOKMARKS' | 'LIKES' | 'ANALYTICS' | 'SETTINGS';
type XPostFilter = 'ALL' | 'TEXT' | 'IMAGE' | 'VIDEO' | 'REPLY' | 'QUOTE';
type XSort = 'LATEST' | 'EARLIEST' | 'LIKES' | 'ENGAGEMENT';

const tabs: readonly { readonly id: XTab; readonly label: string }[] = [
  { id: 'OVERVIEW', label: '概览' },
  { id: 'POSTS', label: '我的推文' },
  { id: 'BOOKMARKS', label: '我的收藏' },
  { id: 'LIKES', label: '我点赞的' },
  { id: 'ANALYTICS', label: '数据分析' },
  { id: 'SETTINGS', label: '账号设置' },
];

const postFilters: readonly { readonly id: XPostFilter; readonly label: string }[] = [
  { id: 'ALL', label: '全部' },
  { id: 'TEXT', label: '文字' },
  { id: 'IMAGE', label: '图片' },
  { id: 'VIDEO', label: '视频' },
  { id: 'REPLY', label: '回复' },
  { id: 'QUOTE', label: '引用' },
];

const xScopeOptions: readonly { readonly id: string; readonly label: string; readonly detail: string }[] = [
  { id: 'tweet.read', label: '读取我的推文', detail: '我的推文与发布时间' },
  { id: 'users.read', label: '读取账号资料', detail: '账号名称、头像和公开计数' },
  { id: 'like.read', label: '读取我点赞的', detail: '点赞列表（若套餐支持）' },
  { id: 'bookmark.read', label: '读取我的收藏', detail: '收藏列表（若套餐支持）' },
  { id: 'offline.access', label: '保持离线授权', detail: '仅由服务端安全保管刷新凭据' },
];

function formatNumber(value: number | null | undefined): string {
  return value === null || value === undefined ? '—' : new Intl.NumberFormat('zh-CN', { notation: 'compact', maximumFractionDigits: 1 }).format(value);
}

function formatDate(value: string | null): string {
  if (value === null) return '时间暂不可用';
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? '时间暂不可用' : date.toLocaleString('zh-CN', { dateStyle: 'medium', timeStyle: 'short' });
}

function timestamp(value: string | null): number {
  if (value === null) return 0;
  const result = Date.parse(value);
  return Number.isNaN(result) ? 0 : result;
}

function textFor(content: XCenterContent): string {
  return `${content.archiveItem.textExcerpt ?? ''} ${content.authorName ?? ''} ${content.authorUsername ?? ''} ${content.archiveItem.tags.join(' ')}`.toLocaleLowerCase();
}

function translationUrl(canonicalUrl: string): string {
  return `https://translate.google.com/translate?sl=auto&tl=zh-CN&u=${encodeURIComponent(canonicalUrl)}`;
}

function isXUrl(value: string): boolean {
  try {
    const url = new URL(value);
    const host = url.hostname.toLocaleLowerCase();
    return (host === 'x.com' || host === 'www.x.com' || host === 'twitter.com' || host === 'www.twitter.com') && url.pathname.length > 1;
  } catch {
    return false;
  }
}

function mediaKind(content: XCenterContent): 'TEXT' | 'IMAGE' | 'VIDEO' {
  if (content.media.some((media) => media.type === 'video' || media.type === 'animated_gif')) return 'VIDEO';
  return content.media.some((media) => media.type === 'photo') ? 'IMAGE' : 'TEXT';
}

function referenceLabel(type: string): string {
  if (type === 'replied_to') return '回复的推文';
  if (type === 'quoted') return '引用的推文';
  if (type === 'retweeted') return '转发的推文';
  return '关联的推文';
}

function XMediaPreviewGrid({
  media,
  detail = false,
}: {
  readonly media: XCenterContent['media'];
  readonly detail?: boolean;
}) {
  if (media.length === 0) return null;
  return <div className={detail ? 'x-detail-page__media' : 'x-content-card__media-grid'} aria-label="来自已授权 X 内容的媒体预览">
    {media.map((item, index) => {
      const preview = item.previewImageUrl ?? (item.type === 'photo' ? item.url : null);
      const destination = item.url ?? preview;
      if (destination === null) return <span key={`${item.type}-${index}`}>媒体引用不可预览</span>;
      return <a className={detail ? 'x-detail-page__media-link' : 'x-content-card__media-link'} key={`${item.type}-${index}`} href={destination} target="_blank" rel="noreferrer">
        {preview === null ? <span>打开 {item.type} 媒体 ↗</span> : <img className={detail ? 'x-detail-page__media-preview' : 'x-content-card__media'} src={preview} alt={`来自已授权 X 内容的${item.type === 'photo' ? '图片' : '媒体'}预览`} loading="lazy" />}
      </a>;
    })}
  </div>;
}

function engagement(content: XCenterContent): number {
  return (content.metrics.likeCount ?? 0) + (content.metrics.replyCount ?? 0) + (content.metrics.repostCount ?? 0) + (content.metrics.quoteCount ?? 0);
}

function XMetric({ label, value, detail }: { readonly label: string; readonly value: string; readonly detail: string }) {
  return <article className="x-center-metric"><span>{label}</span><strong>{value}</strong><small>{detail}</small></article>;
}

function EmptyXState({ message, action }: { readonly message: string; readonly action?: ReactNode }) {
  return <section className="x-center-empty"><span aria-hidden="true">✦</span><h2>当前没有可显示的 X 数据</h2><p>{message}</p>{action}</section>;
}

function XAnalyticsExtras({ contents, ownPosts, metricsAvailable }: { readonly contents: readonly XCenterContent[]; readonly ownPosts: readonly XCenterContent[]; readonly metricsAvailable: boolean }) {
  const typeCounts = new Map<string, number>();
  for (const content of ownPosts) typeCounts.set(mediaKind(content), (typeCounts.get(mediaKind(content)) ?? 0) + 1);
  const tagCounts = new Map<string, number>();
  for (const content of contents) for (const tag of content.archiveItem.tags) tagCounts.set(tag, (tagCounts.get(tag) ?? 0) + 1);
  const dayCounts = new Map<string, number>();
  for (const content of ownPosts) {
    const publishedAt = content.archiveItem.publishedAt;
    if (publishedAt !== null) dayCounts.set(publishedAt.slice(0, 10), (dayCounts.get(publishedAt.slice(0, 10)) ?? 0) + 1);
  }
  const typeEntries = [...typeCounts.entries()].sort((left, right) => right[1] - left[1]);
  const tagEntries = [...tagCounts.entries()].sort((left, right) => right[1] - left[1]).slice(0, 8);
  const dayEntries = [...dayCounts.entries()].sort((left, right) => right[0].localeCompare(left[0])).slice(0, 10);
  const maxType = Math.max(1, ...typeEntries.map((entry) => entry[1]));
  const maxDay = Math.max(1, ...dayEntries.map((entry) => entry[1]));
  return <section className="x-analytics-extra"><header><h3>真实数据维度</h3><p>分布只从当前同步记录计算；粉丝增长与 X 未返回的字段保持不可用。</p></header><div className="x-analytics-extra__grid"><article><h4>内容类型占比</h4>{typeEntries.length === 0 ? <p>暂无内容</p> : <div className="x-bars">{typeEntries.map(([label, count]) => <div key={label}><span>{label}</span><i style={{ width: `${(count / maxType) * 100}%` }} /><strong>{count}</strong></div>)}</div>}</article><article><h4>发布时间分布</h4>{dayEntries.length === 0 ? <p>暂无带时间内容</p> : <div className="x-bars">{dayEntries.map(([label, count]) => <div key={label}><span>{label}</span><i style={{ width: `${(count / maxDay) * 100}%` }} /><strong>{count}</strong></div>)}</div>}</article><article><h4>高频标签 / 主题</h4>{tagEntries.length === 0 ? <p>当前同步内容没有标签；不会猜测主题。</p> : <div className="x-tag-list">{tagEntries.map(([label, count]) => <span key={label}>{label} · {count}</span>)}</div>}</article><article><h4>尚不支持的指标</h4><p>{metricsAvailable ? '粉丝增长、历史快照与完整 30 天曲线需要 X API 返回历史数据。' : '互动指标、粉丝增长、历史快照与趋势均需要当前 X API Scope / 套餐支持。'}</p><strong className="x-unavailable-label">当前 X API 权限暂不支持</strong></article></div></section>;
}

function XAnalyticsMetricBreakdown({ ownPosts }: { readonly ownPosts: readonly XCenterContent[] }) {
  const total = (key: keyof XPostMetrics): number | null => {
    const values = ownPosts.map((content) => content.metrics[key]).filter((value): value is number => value !== null);
    return values.length === 0 ? null : values.reduce((sum, value) => sum + value, 0);
  };
  return <section className="x-analytics-grid x-analytics-breakdown" aria-label="X 互动指标明细"><XMetric label="总点赞" value={formatNumber(total('likeCount'))} detail="官方 API 返回的可见推文" /><XMetric label="总回复" value={formatNumber(total('replyCount'))} detail="官方 API 返回的可见推文" /><XMetric label="总转发" value={formatNumber(total('repostCount'))} detail="官方 API 返回的可见推文" /><XMetric label="总浏览" value={formatNumber(total('impressionCount'))} detail="Scope / 套餐支持时显示" /></section>;
}

function XAnalyticsVisuals({ ownPosts }: { readonly ownPosts: readonly XCenterContent[] }) {
  const dated = ownPosts.flatMap((content) => content.archiveItem.publishedAt === null ? [] : [{ date: content.archiveItem.publishedAt.slice(0, 10), value: engagement(content) }]);
  const daily = new Map<string, number>();
  for (const item of dated) daily.set(item.date, (daily.get(item.date) ?? 0) + item.value);
  const ordered = [...daily.entries()].sort((left, right) => left[0].localeCompare(right[0]));
  const max = Math.max(1, ...ordered.map((entry) => entry[1]));
  const points = ordered.length < 2 ? '' : ordered.map((entry, index) => `${(index / (ordered.length - 1)) * 100},${100 - (entry[1] / max) * 90}`).join(' ');
  const typeCounts = new Map<string, number>();
  for (const content of ownPosts) typeCounts.set(mediaKind(content), (typeCounts.get(mediaKind(content)) ?? 0) + 1);
  const typeTotal = Math.max(1, ownPosts.length);
  let offset = 0;
  const colors = ['#9d6cff', '#d8b06b', '#4bc2a7'];
  const stops = [...typeCounts.values()].map((count, index) => { const start = offset; offset += (count / typeTotal) * 100; return `${colors[index % colors.length]} ${start}% ${offset}%`; });
  const heatmap = ordered.slice(-30);
  return <section className="x-analytics-visuals"><article><h3>30 天互动趋势</h3>{points === '' ? <p className="x-unavailable-label">当前记录不足以绘制趋势</p> : <svg className="x-trend-chart" viewBox="0 0 100 100" role="img" aria-label="基于已同步内容的互动趋势"><polyline points={points} fill="none" stroke="#b896ff" strokeWidth="3" vectorEffect="non-scaling-stroke" /></svg>}</article><article><h3>内容类型占比</h3>{ownPosts.length === 0 ? <p>暂无内容</p> : <div className="x-donut" style={{ background: `conic-gradient(${stops.join(', ')})` }}><span>{ownPosts.length}</span></div>}</article><article><h3>发布时间热力</h3>{heatmap.length === 0 ? <p className="x-unavailable-label">暂无带时间内容</p> : <div className="x-heatmap">{heatmap.map(([date, value]) => <span key={date} title={`${date} · ${value} 互动`} style={{ opacity: `${Math.max(.2, value / max)}` }} />)}</div>}</article><article><h3>粉丝增长趋势</h3><p className="x-unavailable-label">当前 X API 不提供历史粉丝快照，暂不可用。</p></article></section>;
}

function ContentCard({
  content,
  collectionOptions,
  onOpenDetail,
  onSaveLife,
  onSaveNote,
  onAddCollection,
  busy,
}: {
  readonly content: XCenterContent;
  readonly collectionOptions: readonly { readonly id: string; readonly name: string }[];
  readonly onOpenDetail: (content: XCenterContent) => void;
  readonly onSaveLife: (content: XCenterContent) => void;
  readonly onSaveNote: (content: XCenterContent, note: string, tags: readonly string[]) => Promise<void>;
  readonly onAddCollection: (content: XCenterContent, collectionId: string) => Promise<void>;
  readonly busy: boolean;
}) {
  const [expanded, setExpanded] = useState(false);
  const [detailOpen, setDetailOpen] = useState(false);
  const [note, setNote] = useState(content.archiveItem.personalNote ?? '');
  const [tags, setTags] = useState(content.archiveItem.tags.join(', '));
  const [selectedCollection, setSelectedCollection] = useState('');
  const author = content.authorUsername === null ? '未知作者' : `@${content.authorUsername}`;
  const displayDate = content.feed === 'BOOKMARKED' ? content.archiveItem.savedAt : content.archiveItem.publishedAt;
  const save = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    await onSaveNote(content, note, tags.split(',').map((tag) => tag.trim()).filter(Boolean));
  };
  return (
    <article className="x-content-card">
      <header className="x-content-card__head">
        {content.authorAvatarUrl === null ? <div className="x-avatar x-avatar--fallback" aria-hidden="true">X</div> : <img className="x-avatar" src={content.authorAvatarUrl} alt="" />}
        <div><strong>{content.authorName ?? author}</strong><span>{author}</span></div>
        <time>{content.feed === 'BOOKMARKED' ? '收藏 ' : ''}{formatDate(displayDate)}</time>
      </header>
      <p className="x-content-card__body">{content.archiveItem.textExcerpt ?? '原内容未提供可显示文本。'}</p>
      {content.references.length === 0 ? null : <div className="x-content-card__references" aria-label="关联的 X 推文">{content.references.map((reference, index) => <aside className="x-content-card__reference" key={`${reference.type}-${reference.canonicalUrl}-${index}`}><strong>{referenceLabel(reference.type)}</strong><span>{reference.authorName ?? (reference.authorUsername === null ? '原作者资料未随授权返回' : `@${reference.authorUsername}`)}</span><p>{reference.textExcerpt ?? '原内容未随本次授权返回；可在 X 查看。'}</p><a href={reference.canonicalUrl} target="_blank" rel="noreferrer">打开原帖 ↗</a></aside>)}</div>}
      <XMediaPreviewGrid media={content.media} />
      <footer className="x-content-card__metrics" aria-label="已授权且可显示的互动指标">
        <span>♡ {formatNumber(content.metrics.likeCount)}</span><span>↩ {formatNumber(content.metrics.replyCount)}</span><span>↗ {formatNumber(content.metrics.repostCount)}</span><span>◉ {formatNumber(content.metrics.impressionCount)}</span>
        <a href={translationUrl(content.archiveItem.canonicalUrl)} target="_blank" rel="noreferrer noopener" title="在新标签页打开此 X 内容的中文翻译">翻译 ↗</a>
        <a href={content.archiveItem.canonicalUrl} target="_blank" rel="noreferrer noopener">在 X 打开 ↗</a>
      </footer>
      <div className="x-content-card__actions">
        <button className="quiet-button" type="button" onClick={() => { setDetailOpen((value) => !value); onOpenDetail(content); }} aria-expanded={detailOpen}>查看详情</button>
        <button className="quiet-button" type="button" onClick={() => setExpanded((value) => !value)} aria-expanded={expanded}>{expanded ? '收起整理' : '整理与保存'}</button>
        <button className="quiet-button" type="button" onClick={() => onSaveLife(content)}>保存到 Life</button>
      </div>
      {detailOpen ? <section className="x-content-card__detail" aria-label="X 内容详情"><h3>内容详情</h3><p>{content.archiveItem.textExcerpt ?? '原内容未提供可显示文本。'}</p><dl><div><dt>来源</dt><dd>{content.feed === 'MY_TWEETS' ? '我的推文' : content.feed === 'BOOKMARKED' ? '我的收藏' : '我点赞的'}</dd></div><div><dt>发布时间</dt><dd>{formatDate(content.archiveItem.publishedAt)}</dd></div><div><dt>收藏时间</dt><dd>{content.feed === 'BOOKMARKED' ? formatDate(content.archiveItem.savedAt) : '不适用'}</dd></div><div><dt>内容状态</dt><dd>{content.archiveItem.contentStatus === 'AVAILABLE' ? '可用' : '当前不可用'}</dd></div><div><dt>原始地址</dt><dd><a href={content.archiveItem.canonicalUrl} target="_blank" rel="noreferrer noopener">{content.archiveItem.canonicalUrl}</a></dd></div><div><dt>翻译</dt><dd><a href={translationUrl(content.archiveItem.canonicalUrl)} target="_blank" rel="noreferrer noopener">打开中文翻译 ↗</a></dd></div></dl>{content.references.length === 0 ? null : <div className="x-content-card__detail-references"><h4>回复 / 引用来源</h4>{content.references.map((reference, index) => <p key={`${reference.type}-${reference.canonicalUrl}-${index}`}><span>{referenceLabel(reference.type)}：</span><a href={reference.canonicalUrl} target="_blank" rel="noreferrer noopener">{reference.textExcerpt ?? '在 X 打开原帖'} ↗</a></p>)}</div>}<p className="x-content-card__detail-note">详情只来自本次授权返回的 X 数据；删除、封锁或权限变化时不会从缓存恢复原文。</p></section> : null}
      {expanded ? <form className="x-content-card__editor" onSubmit={(event) => { void save(event); }}>
        <label>个人备注<textarea value={note} onChange={(event) => setNote(event.target.value)} placeholder="这条内容对你意味着什么？" maxLength={10000} /></label>
        <label>标签<input value={tags} onChange={(event) => setTags(event.target.value)} placeholder="AI, 设计, 稍后阅读" /></label>
        <div><button className="glow-button" disabled={busy} type="submit">保存私密整理</button>{content.feed === 'BOOKMARKED' ? <button className="quiet-button" disabled title="当前版本没有配置服务端 AI 摘要权限">AI 摘要（未配置）</button> : null}{collectionOptions.length > 0 ? <><select aria-label="选择收藏夹" value={selectedCollection} onChange={(event) => setSelectedCollection(event.target.value)}><option value="">加入收藏夹</option>{collectionOptions.map((collection) => <option key={collection.id} value={collection.id}>{collection.name}</option>)}</select><button className="quiet-button" disabled={busy || selectedCollection === ''} type="button" onClick={() => { if (selectedCollection !== '') void onAddCollection(content, selectedCollection); }}>加入</button></> : null}</div>
      </form> : null}
    </article>
  );
}

export function XConnectionCenterPage({ onNavigate, tier }: { readonly onNavigate: (route: AppRoute) => void; readonly tier: ExperienceTier }) {
  const [view, setView] = useState<XCenterView | null>(null);
  const [tab, setTab] = useState<XTab>('POSTS');
  const [query, setQuery] = useState('');
  const [authorQuery, setAuthorQuery] = useState('');
  const [tagFilter, setTagFilter] = useState('');
  const [yearFilter, setYearFilter] = useState('');
  const [monthFilter, setMonthFilter] = useState('');
  const [filter, setFilter] = useState<XPostFilter>('ALL');
  const [sort, setSort] = useState<XSort>('LATEST');
  const [message, setMessage] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [collectionName, setCollectionName] = useState('');
  const [confirmDisconnect, setConfirmDisconnect] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [scopeDraft, setScopeDraft] = useState<string[]>([...xRequestedReadScopes]);
  const [detailId, setDetailId] = useState<string | null>(() => new URLSearchParams(window.location.search).get('content'));
  const [translationTarget, setTranslationTarget] = useState('');
  const callbackPromise = useRef<Promise<boolean> | null>(null);

  const refresh = useCallback(async () => {
    const next = await xCenterClient.load();
    setView(next);
    return next;
  }, []);

  useEffect(() => {
    let active = true;
    const initialize = async () => {
      try {
        callbackPromise.current ??= xCenterClient.completeCallback();
        const completed = await callbackPromise.current;
        if (!active) return;
        if (completed) setMessage('X 授权已完成，正在读取你明确授权的数据。');
        await refresh();
      } catch (error) {
        if (active) setMessage(error instanceof Error ? error.message : 'X 授权未完成。');
        await refresh();
      }
    };
    void initialize();
    return () => { active = false; };
  }, [refresh]);

  useEffect(() => {
    const onPopState = () => setDetailId(new URLSearchParams(window.location.search).get('content'));
    window.addEventListener('popstate', onPopState);
    return () => window.removeEventListener('popstate', onPopState);
  }, []);

  const run = async (name: string, task: () => Promise<void>, success: string) => {
    setBusy(name);
    setMessage(null);
    try { await task(); await refresh(); setMessage(success); }
    catch (error) { setMessage(error instanceof Error ? error.message : '操作未完成，请稍后重试。'); }
    finally { setBusy(null); }
  };

  const account = view?.account ?? null;
  useEffect(() => { setScopeDraft(account?.requestedScopes === undefined ? [...xRequestedReadScopes] : [...account.requestedScopes]); }, [account?.id]);
  const allContents = view?.contents ?? [];
  const selectedFeed: XFeedKind | null = tab === 'POSTS' ? 'MY_TWEETS' : tab === 'BOOKMARKS' ? 'BOOKMARKED' : tab === 'LIKES' ? 'LIKED' : null;
  const visibleContents = useMemo(() => {
    const normalizedQuery = query.trim().toLocaleLowerCase();
    const normalizedAuthor = authorQuery.trim().toLocaleLowerCase();
    return allContents
      .filter((content) => selectedFeed === null || content.feed === selectedFeed)
      .filter((content) => normalizedQuery === '' || textFor(content).includes(normalizedQuery))
      .filter((content) => normalizedAuthor === '' || `${content.authorName ?? ''} ${content.authorUsername ?? ''}`.toLocaleLowerCase().includes(normalizedAuthor))
      .filter((content) => tagFilter === '' || content.archiveItem.tags.includes(tagFilter))
      .filter((content) => yearFilter === '' || content.archiveItem.publishedAt?.slice(0, 4) === yearFilter)
      .filter((content) => monthFilter === '' || content.archiveItem.publishedAt?.slice(5, 7) === monthFilter)
      .filter((content) => filter === 'ALL' || (filter === 'TEXT' && mediaKind(content) === 'TEXT') || (filter === 'IMAGE' && mediaKind(content) === 'IMAGE') || (filter === 'VIDEO' && mediaKind(content) === 'VIDEO') || (filter === 'REPLY' && content.isReply) || (filter === 'QUOTE' && content.isQuote))
      .sort((left, right) => sort === 'EARLIEST' ? timestamp(left.archiveItem.publishedAt) - timestamp(right.archiveItem.publishedAt) : sort === 'LIKES' ? (right.metrics.likeCount ?? -1) - (left.metrics.likeCount ?? -1) : sort === 'ENGAGEMENT' ? engagement(right) - engagement(left) : timestamp(right.archiveItem.publishedAt) - timestamp(left.archiveItem.publishedAt));
  }, [allContents, authorQuery, filter, monthFilter, query, selectedFeed, sort, tagFilter, yearFilter]);
  const metricsAvailable = allContents.some((content) => Object.values(content.metrics).some((value) => value !== null));
  const ownPosts = allContents.filter((content) => content.feed === 'MY_TWEETS');
  const totalInteractions = ownPosts.reduce((sum, content) => sum + engagement(content), 0);
  const visibleMetricPosts = ownPosts.filter((content) => Object.values(content.metrics).some((value) => value !== null));
  const topPosts = [...ownPosts].sort((left, right) => engagement(right) - engagement(left)).slice(0, 5);
  const recentContents = [...allContents].sort((left, right) => timestamp(right.archiveItem.publishedAt) - timestamp(left.archiveItem.publishedAt)).slice(0, 4);
  const collections = (view?.collections ?? []).map((collection) => ({ id: collection.id, name: collection.name }));
  const detailContent = detailId === null ? null : allContents.find((content) => content.archiveItem.id === detailId) ?? null;
  const openDetail = (content: XCenterContent) => { setDetailId(content.archiveItem.id); window.history.pushState({}, '', `/x?content=${encodeURIComponent(content.archiveItem.id)}`); };
  useEffect(() => { if (detailId === null && new URLSearchParams(window.location.search).has('content')) window.history.replaceState({}, '', '/x'); }, [detailId]);
  const years = [...new Set(allContents.flatMap((content) => content.archiveItem.publishedAt === null ? [] : [content.archiveItem.publishedAt.slice(0, 4)]))].sort((left, right) => right.localeCompare(left));
  const tags = [...new Set(allContents.flatMap((content) => content.archiveItem.tags))].sort((left, right) => left.localeCompare(right));

  const saveToLife = (content: XCenterContent) => {
    try {
      const media = content.media.flatMap((item, index) => [{ id: `${content.archiveItem.externalContentId ?? content.archiveItem.id}-media-${index}`, name: `X ${item.type} 媒体引用`, mimeType: item.type === 'video' ? 'video/*' : 'image/*', bytes: 0 }]);
      const mediaLinks = content.media.flatMap((item) => item.url === null ? [] : [item.url]);
      localArchiveAdapter.create({
        kind: 'LIFE',
        title: content.feed === 'BOOKMARKED' ? '来自 X 收藏的一条感悟' : content.feed === 'LIKED' ? '来自 X 点赞的一条感悟' : '来自我的 X 推文',
        body: `${content.archiveItem.textExcerpt ?? ''}\n\n原始链接：${content.archiveItem.canonicalUrl}${mediaLinks.length > 0 ? `\n媒体引用（未下载）：\n${mediaLinks.join('\n')}` : ''}`,
        tags: ['X', '私密导入', ...(media.length > 0 ? ['X_MEDIA_REFERENCE'] : []), ...content.archiveItem.tags],
        ...(media.length > 0 ? { media } : {}),
        ...(content.archiveItem.publishedAt === null ? {} : { occurredAt: content.archiveItem.publishedAt }),
      });
      setMessage(media.length > 0 ? '已保存到当前设备的私密 Life 档案；媒体以授权 URL 引用保存，未下载二进制文件。' : '已保存到当前设备、当前登录主体的私密 Life 档案。');
    } catch (error) { setMessage(error instanceof Error ? error.message : '保存到 Life 未完成。'); }
  };

  if (view === null) return <section className="x-center-page"><EmptyXState message="正在检查 X 连接状态；不会填充演示数据。" /></section>;

  const connectionReady = view.provider?.oauthAvailable === true && view.provider.officialApiVerified === true;
  const renderContentList = () => visibleContents.length === 0 ? <EmptyXState message={account === null ? '先连接你的 X 账号；未连接时不会显示任何内容。' : '没有符合当前筛选条件的已同步内容。若 X API Scope 或套餐不支持，会保持为空。'} /> : <div className="x-content-list">{visibleContents.map((content) => <ContentCard key={content.archiveItem.id} content={content} collectionOptions={collections} onOpenDetail={openDetail} busy={busy !== null} onSaveLife={saveToLife} onSaveNote={async (current, note, tags) => { await run(`note-${current.archiveItem.id}`, () => xCenterClient.updateArchiveItem(current.archiveItem.id, { note, tags }).then(() => undefined), '私密备注和标签已保存。'); }} onAddCollection={async (current, collectionId) => { await run(`collection-${current.archiveItem.id}`, () => xCenterClient.addToCollection(collectionId, current.archiveItem.id).then(() => undefined), '已加入私密收藏夹。'); }} />)}</div>;

  return <main className="x-center-page" data-motion-tier={tier}>
    <section className="x-center-hero">
      <div><p className="eyebrow">ME.ZIP / X CONNECTION CENTER</p><h1>X 连接中心<span>·</span></h1><p>只在你通过 X 官方 OAuth 授权后，整理属于你的内容、收藏和点赞；导入数据默认私密。</p></div>
      <div className="x-center-hero__actions">
        <span className={account === null ? 'x-status x-status--idle' : 'x-status'}>{account === null ? '未连接' : account.status === 'CONNECTED' ? '已连接' : '需要重新授权'}</span>
        {account === null ? <button className="glow-button" disabled={!connectionReady || busy !== null} type="button" onClick={() => { void run('connect', () => xCenterClient.startConnection(), '正在转到 X 官方授权页。'); }}>{connectionReady ? '连接 X 账号' : 'X 授权尚未配置'}</button> : <button className="glow-button" disabled={busy !== null} type="button" onClick={() => { void run('sync', () => xCenterClient.sync(account.id), '同步请求已完成；仅显示 X 官方 API 返回的数据。'); }}>立即同步</button>}
      </div>
    </section>
    <section className="x-translation-launcher" aria-label="X 内容翻译">
      <div><p className="eyebrow">X / TRANSLATION</p><h2>翻译 X 内容</h2><p>粘贴公开的 X / Twitter 链接，在新标签页打开中文翻译。不会伪造或改写原始内容。</p></div>
      <div className="x-translation-launcher__form">
        <label htmlFor="x-translation-target">X 链接</label>
        <div><input id="x-translation-target" type="url" inputMode="url" value={translationTarget} onChange={(event) => setTranslationTarget(event.target.value)} placeholder="https://x.com/…" /> <a className="quiet-button" href={isXUrl(translationTarget.trim()) ? translationUrl(translationTarget.trim()) : undefined} target="_blank" rel="noreferrer noopener" onClick={(event) => { if (!isXUrl(translationTarget.trim())) { event.preventDefault(); setMessage('请先粘贴完整的 x.com 或 twitter.com 链接。'); } }}>打开中文翻译 ↗</a></div>
      </div>
    </section>
    {account !== null ? <div className="x-center-manage"><button className="quiet-button" type="button" onClick={() => setTab('SETTINGS')}>管理授权</button></div> : null}
    {message ?? view.message ? <p className="x-center-notice" role="status">{message ?? view.message}</p> : null}
    <section className="x-account-band" aria-label="X 账号连接状态">
      <div className="x-account-band__identity">{account?.avatarReference === null || account === null ? <div className="x-account-portrait" aria-hidden="true">𝕏</div> : <img className="x-account-portrait" src={account.avatarReference} alt="" />}<div><p>{account?.displayName ?? '尚未连接 X 账号'}</p><strong>{account?.username === null || account === null ? '@未授权' : `@${account.username}`}</strong><small>{account?.lastSyncedAt === null || account === null ? '尚未同步' : `最后同步 ${formatDate(account.lastSyncedAt)}`}</small></div></div>
      <div className="x-account-band__numbers"><XMetric label="粉丝" value={formatNumber(account?.profileMetrics?.followersCount)} detail="来自 X 授权资料" /><XMetric label="关注" value={formatNumber(account?.profileMetrics?.followingCount)} detail="来自 X 授权资料" /><XMetric label="推文" value={formatNumber(account?.profileMetrics?.postCount)} detail="来自 X 授权资料" /><XMetric label="已同步点赞" value={account === null ? '—' : String(allContents.filter((content) => content.feed === 'LIKED').length)} detail={account === null ? '尚未连接' : '不是 X 全量计数'} /><XMetric label="已同步收藏" value={account === null ? '—' : String(allContents.filter((content) => content.feed === 'BOOKMARKED').length)} detail={account === null ? '尚未连接' : '受 Scope / 套餐限制'} /></div>
    </section>
    {detailContent !== null ? <section className="x-center-panel x-detail-page" aria-label="X 推文详情"><header className="x-panel-heading"><div><p className="eyebrow">X CONTENT DETAIL</p><h2>推文详情</h2><p>详情来自当前账号最近一次官方 API 同步；不会从私有缓存恢复不可用原文。</p></div><button className="quiet-button" type="button" onClick={() => setDetailId(null)}>关闭详情</button></header><article className="x-detail-page__body"><div className="x-detail-page__meta"><strong>{detailContent.authorName ?? '未知作者'}</strong><span>{detailContent.authorUsername === null ? '未知账号' : `@${detailContent.authorUsername}`}</span><time>{formatDate(detailContent.archiveItem.publishedAt)}</time></div><p>{detailContent.archiveItem.textExcerpt ?? '原内容未提供可显示文本。'}</p><XMediaPreviewGrid media={detailContent.media} detail /><dl><div><dt>内容来源</dt><dd>{detailContent.feed === 'MY_TWEETS' ? '我的推文' : detailContent.feed === 'BOOKMARKED' ? '我的收藏' : '我点赞的'}</dd></div><div><dt>互动</dt><dd>♡ {formatNumber(detailContent.metrics.likeCount)} · 回复 {formatNumber(detailContent.metrics.replyCount)} · 转发 {formatNumber(detailContent.metrics.repostCount)} · 浏览 {formatNumber(detailContent.metrics.impressionCount)}</dd></div><div><dt>原始地址</dt><dd><a href={detailContent.archiveItem.canonicalUrl} target="_blank" rel="noreferrer noopener">在 X 打开 ↗</a></dd></div><div><dt>翻译</dt><dd><a href={translationUrl(detailContent.archiveItem.canonicalUrl)} target="_blank" rel="noreferrer noopener">打开中文翻译 ↗</a></dd></div></dl>{detailContent.references.length === 0 ? null : <div className="x-content-card__detail-references"><h4>回复 / 引用来源</h4>{detailContent.references.map((reference, index) => <p key={`${reference.type}-${reference.canonicalUrl}-${index}`}><span>{referenceLabel(reference.type)}：</span><a href={reference.canonicalUrl} target="_blank" rel="noreferrer noopener">{reference.textExcerpt ?? '在 X 打开原帖'} ↗</a></p>)}</div>}</article></section> : null}
    <nav className="x-center-tabs" aria-label="X 连接中心页面">{tabs.map((entry) => <button key={entry.id} className={tab === entry.id ? 'is-active' : ''} type="button" onClick={() => setTab(entry.id)}>{entry.label}</button>)}</nav>
    {tab === 'OVERVIEW' ? <section className="x-center-panel"><header className="x-panel-heading"><div><p className="eyebrow">X / PRIVATE OVERVIEW</p><h2>个人 X 内容概览</h2><p>这里的数字只代表当前账号已经从 X 官方 API 同步到 ME.zip 的范围，不代表 X 全量数据。</p></div></header>{account === null ? <EmptyXState message="连接并授权 X 后，概览才会出现属于你的真实内容。" /> : <><div className="x-analytics-grid"><XMetric label="已同步我的推文" value={String(ownPosts.length)} detail="当前私密导入范围" /><XMetric label="已同步收藏" value={String(allContents.filter((content) => content.feed === 'BOOKMARKED').length)} detail="X bookmark.read 返回" /><XMetric label="已同步点赞" value={String(allContents.filter((content) => content.feed === 'LIKED').length)} detail="X like.read 返回" /><XMetric label="最近同步" value={view.syncStatus?.lastSyncedAt === null || view.syncStatus === null ? '—' : formatDate(view.syncStatus.lastSyncedAt)} detail="服务端同步状态" /></div><section className="x-analytics-list"><h3>最近同步内容</h3>{recentContents.length === 0 ? <p>尚未同步到内容，或当前 Scope / 套餐不支持读取。</p> : recentContents.map((content) => <article key={content.archiveItem.id}><span>{content.archiveItem.textExcerpt ?? '无可显示文本'}</span><strong>{content.feed === 'MY_TWEETS' ? '我的推文' : content.feed === 'BOOKMARKED' ? '收藏' : '点赞'}</strong><time>{formatDate(content.archiveItem.publishedAt)}</time></article>)}</section></>}</section> : null}
    {tab === 'POSTS' || tab === 'BOOKMARKS' || tab === 'LIKES' ? <section className="x-center-panel">
      <header className="x-panel-heading"><div><p className="eyebrow">{tab === 'POSTS' ? 'MY POSTS' : tab === 'BOOKMARKS' ? 'PRIVATE BOOKMARKS' : 'LIKED CONTENT'}</p><h2>{tabs.find((entry) => entry.id === tab)?.label}</h2></div>{tab === 'BOOKMARKS' ? <form className="x-collection-create" onSubmit={(event) => { event.preventDefault(); const name = collectionName.trim(); if (name !== '') void run('collection-create', () => xCenterClient.createCollection({ name }).then(() => undefined), '私密收藏夹已创建。').then(() => setCollectionName('')); }}><input value={collectionName} onChange={(event) => setCollectionName(event.target.value)} placeholder="新建私密收藏夹" maxLength={80} /><button className="quiet-button" disabled={busy !== null || collectionName.trim() === ''} type="submit">创建</button></form> : null}</header>
      <div className="x-content-filters"><input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="搜索内容、作者或标签" aria-label="搜索 X 内容" /><input value={authorQuery} onChange={(event) => setAuthorQuery(event.target.value)} placeholder="筛选作者" aria-label="筛选作者" />{tab === 'POSTS' || tab === 'LIKES' ? <div className="x-filter-buttons">{postFilters.map((entry) => <button key={entry.id} type="button" className={filter === entry.id ? 'is-active' : ''} onClick={() => setFilter(entry.id)}>{entry.label}</button>)}</div> : null}<select value={yearFilter} onChange={(event) => setYearFilter(event.target.value)} aria-label="筛选年份"><option value="">全部年份</option>{years.map((year) => <option key={year} value={year}>{year}</option>)}</select><select value={monthFilter} onChange={(event) => setMonthFilter(event.target.value)} aria-label="筛选月份"><option value="">全部月份</option>{Array.from({ length: 12 }, (_, index) => String(index + 1).padStart(2, '0')).map((month) => <option key={month} value={month}>{month} 月</option>)}</select><select value={sort} onChange={(event) => setSort(event.target.value as XSort)} aria-label="排序"><option value="LATEST">最新</option><option value="EARLIEST">最早</option><option value="LIKES">点赞最多</option><option value="ENGAGEMENT">互动最多</option></select></div>
      <select className="x-tag-filter" value={tagFilter} onChange={(event) => setTagFilter(event.target.value)} aria-label="筛选标签"><option value="">全部标签</option>{tags.map((tag) => <option key={tag} value={tag}>{tag}</option>)}</select>
      {renderContentList()}
    </section> : null}
    {tab === 'ANALYTICS' ? <section className="x-center-panel"><header className="x-panel-heading"><div><p className="eyebrow">OFFICIAL DATA ONLY</p><h2>数据分析</h2><p>所有数值由已同步的 X API 返回内容计算；没有获取到的数据不会以零或样例替代。</p></div></header>{!metricsAvailable ? <EmptyXState message="当前 X API 权限暂不支持可显示的互动指标，或尚未同步包含指标的内容。" /> : <><div className="x-analytics-grid"><XMetric label="已同步我的推文" value={String(ownPosts.length)} detail="当前本地私密导入范围" /><XMetric label="已同步互动" value={formatNumber(totalInteractions)} detail="点赞、回复、转发和引用之和" /><XMetric label="平均互动" value={visibleMetricPosts.length === 0 ? '—' : formatNumber(totalInteractions / visibleMetricPosts.length)} detail="仅按可显示指标计算" /><XMetric label="可显示浏览" value={formatNumber(ownPosts.reduce<number | null>((sum, item) => sum === null && item.metrics.impressionCount === null ? null : (sum ?? 0) + (item.metrics.impressionCount ?? 0), null))} detail="若 Scope / 套餐允许" /></div><section className="x-analytics-list"><h3>热门推文（基于已同步互动）</h3>{topPosts.length === 0 ? <p>没有可用于排序的已同步推文。</p> : topPosts.map((content) => <article key={content.archiveItem.id}><span>{content.archiveItem.textExcerpt ?? '无可显示文本'}</span><strong>{formatNumber(engagement(content))} 互动</strong><time>{formatDate(content.archiveItem.publishedAt)}</time></article>)}</section></>}</section> : null}
    {tab === 'ANALYTICS' && account !== null && allContents.length > 0 ? <XAnalyticsExtras contents={allContents} ownPosts={ownPosts} metricsAvailable={metricsAvailable} /> : null}
    {tab === 'ANALYTICS' && account !== null && ownPosts.length > 0 ? <XAnalyticsMetricBreakdown ownPosts={ownPosts} /> : null}
    {tab === 'ANALYTICS' && account !== null && ownPosts.length > 0 ? <XAnalyticsVisuals ownPosts={ownPosts} /> : null}
    {tab === 'SETTINGS' ? <section className="x-center-panel x-settings"><header className="x-panel-heading"><div><p className="eyebrow">PRIVATE BY DEFAULT</p><h2>账号设置</h2><p>OAuth Token 和 Refresh Token 永不写入浏览器 localStorage，也不会投影到此页面。</p></div></header><article><h3>授权范围</h3><p>{account === null ? '尚未获得授权。' : account.requestedScopes.join(' · ') || '服务端没有返回可展示的 Scope。'}</p><button className="quiet-button" disabled={account === null || busy !== null} type="button" onClick={() => { if (account !== null) void run('refresh-auth', () => xCenterClient.refreshAuthorization(account.id), '已验证当前 X 授权状态。'); }}>重新验证授权</button></article><article><h3>自动同步</h3><p>当前服务未提供可持久化的自动同步策略开关，因此不会假装已启用。你可使用上方“立即同步”。</p><button className="quiet-button" type="button" disabled>未启用（需要服务端计划）</button></article><article><h3>删除本地同步数据</h3><p>仅删除此 ME.zip 账号的私密 X 导入副本，不会删除 X 上的原始内容。</p>{confirmDelete ? <div className="x-confirm"><span>确认删除全部已同步的 X 数据？</span><button className="danger-button" disabled={account === null || busy !== null} type="button" onClick={() => { if (account !== null) void run('delete-data', () => xCenterClient.deleteImportedData(account.id).then(() => undefined), '已删除当前账号的私密 X 导入数据。'); setConfirmDelete(false); }}>确认删除</button><button className="quiet-button" type="button" onClick={() => setConfirmDelete(false)}>取消</button></div> : <button className="quiet-button" disabled={account === null} type="button" onClick={() => setConfirmDelete(true)}>删除本地同步数据</button>}</article><article><h3>解除 X 账号绑定</h3><p>解除后，服务端凭据会删除，已导入数据仍由你决定是否单独删除。</p>{confirmDisconnect ? <div className="x-confirm"><span>确认解除当前 X 账号绑定？</span><button className="danger-button" disabled={account === null || busy !== null} type="button" onClick={() => { if (account !== null) void run('disconnect', () => xCenterClient.disconnect(account.id), 'X 账号已解除绑定。'); setConfirmDisconnect(false); }}>确认解除</button><button className="quiet-button" type="button" onClick={() => setConfirmDisconnect(false)}>取消</button></div> : <button className="quiet-button" disabled={account === null} type="button" onClick={() => setConfirmDisconnect(true)}>解除绑定</button>}</article><button className="x-life-link" type="button" onClick={() => onNavigate('/social')}>打开私密 Life / 社交档案 →</button></section> : null}
    {tab === 'SETTINGS' && account !== null ? <section className="x-center-panel x-settings x-settings-scopes"><header className="x-panel-heading"><div><p className="eyebrow">LEAST PRIVILEGE</p><h2>授权范围管理</h2><p>只选择你确实需要的官方 X 权限；变更会持久化到当前账号的服务端 integration 记录。</p></div></header><div className="x-scope-list">{xScopeOptions.map((option) => <label key={option.id}><input type="checkbox" checked={scopeDraft.includes(option.id)} disabled={busy !== null} onChange={(event) => setScopeDraft((current) => event.target.checked ? [...new Set([...current, option.id])] : current.filter((scope) => scope !== option.id))} /><span><strong>{option.label}</strong><small>{option.detail}</small></span></label>)}</div><div className="x-settings-actions"><button className="glow-button" disabled={busy !== null || scopeDraft.length === 0} type="button" onClick={() => { void run('scope-update', () => xCenterClient.updateAccountSettings(account.id, { requestedScopes: scopeDraft }), '授权范围已保存；重新同步后按新范围读取。'); }}>保存授权范围</button><button className="quiet-button" disabled={busy !== null} type="button" onClick={() => setScopeDraft([...account.requestedScopes])}>恢复当前范围</button></div></section> : null}
    {tab === 'SETTINGS' && account !== null ? <section className="x-center-panel x-settings x-settings-policies"><article><h3>隐私</h3><p>所有 X 同步记录保持 PRIVATE，并绑定当前 ME.zip 账号；其他用户不能读取。OAuth Token、Refresh Token 和 Client Secret 只在服务端凭据库中保存。</p><strong className="x-policy-status">PRIVATE BY DEFAULT · 已启用</strong></article><article><h3>缓存</h3><p>浏览器不保存 X Token。页面只接收当前账号的脱敏数据；服务端同步副本可用上方“删除本地同步数据”清理。</p><strong className="x-policy-status">Token 不进入 localStorage</strong></article></section> : null}
  </main>;
}
