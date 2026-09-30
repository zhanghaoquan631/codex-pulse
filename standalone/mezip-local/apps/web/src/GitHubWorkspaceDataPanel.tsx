import { useCallback, useEffect, useState } from 'react';
import {
  GitHubWorkspaceClientError,
  loadGitHubWorkspaceData,
  syncGitHubWorkspaceData,
  type GitHubWorkspaceData,
} from './githubWorkspaceClient.js';

function relativeTime(value: string | null): string {
  if (value === null) return '尚未同步';
  const timestamp = Date.parse(value);
  if (!Number.isFinite(timestamp)) return '时间未知';
  const minutes = Math.max(0, Math.floor((Date.now() - timestamp) / 60_000));
  if (minutes < 1) return '刚刚';
  if (minutes < 60) return `${minutes} 分钟前`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours} 小时前`;
  return `${Math.floor(hours / 24)} 天前`;
}

function sectionMessage<T>(section: { readonly data: T | null; readonly error: GitHubWorkspaceClientError | null }, empty: string): string {
  if (section.error !== null) return section.error.message;
  return section.data === null ? empty : '';
}

export function GitHubWorkspaceDataPanel({ compact = false }: { readonly compact?: boolean }) {
  const [data, setData] = useState<GitHubWorkspaceData | null>(null);
  const [error, setError] = useState<GitHubWorkspaceClientError | null>(null);
  const [loading, setLoading] = useState(true);
  const [syncing, setSyncing] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      setData(await loadGitHubWorkspaceData());
    } catch (reason) {
      setData(null);
      setError(reason instanceof GitHubWorkspaceClientError ? reason : new GitHubWorkspaceClientError('SERVICE_UNAVAILABLE', 'GitHub 数据暂时不可用。', true));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { void load(); }, [load]);

  const sync = async () => {
    setSyncing(true);
    setError(null);
    try {
      await syncGitHubWorkspaceData();
      await load();
    } catch (reason) {
      setError(reason instanceof GitHubWorkspaceClientError ? reason : new GitHubWorkspaceClientError('SERVICE_UNAVAILABLE', 'GitHub 同步暂时不可用。', true));
    } finally {
      setSyncing(false);
    }
  };

  if (loading) {
    return <section className="github-data-panel glass-layer-card" aria-live="polite"><p className="eyebrow">GITHUB DATA / LOADING</p><h2>正在读取 GitHub 数据</h2><p className="muted-copy">只读取当前账号已授权的仓库与开发记录。</p></section>;
  }

  if (error !== null || data === null) {
    const needsAuth = error?.code === 'AUTH_REQUIRED' || error?.code === 'UNAUTHORIZED';
    return <section className="github-data-panel glass-layer-card" aria-live="polite"><p className="eyebrow">GITHUB DATA / {needsAuth ? 'AUTH REQUIRED' : 'UNAVAILABLE'}</p><h2>{needsAuth ? 'GitHub 尚未连接' : 'GitHub 数据暂时不可用'}</h2><p className="muted-copy">{error?.message ?? '服务没有返回数据。'}</p><div className="creator-action-row"><a className="quiet-button" href="/github-workspace-v6/index.html#overview">{needsAuth ? '前往连接 GitHub' : '打开工作台检查'}</a>{error?.retryable ? <button className="quiet-button" type="button" onClick={() => void load()}>重试</button> : null}</div></section>;
  }

  const overview = data.overview.data;
  const repositories = data.repositories.data ?? [];
  const snippets = data.snippets.data ?? [];
  const issues = data.issues.data ?? [];
  const tasks = data.tasks.data ?? [];
  const activity = data.activity.data ?? [];
  const repositoryMessage = sectionMessage(data.repositories, 'GitHub 尚未返回授权仓库。');
  const snippetMessage = sectionMessage(data.snippets, 'GitHub 尚未返回代码片段。');

  return <section className={`github-data-panel glass-layer-card${compact ? ' is-compact' : ''}`} aria-label="真实 GitHub 数据">
    <div className="section-heading"><div><p className="eyebrow">GITHUB DATA / READ ONLY</p><h2>已连接 @{data.connection.githubLogin}</h2><p className="muted-copy">数据来自当前 GitHub App 授权范围，不是演示数据。</p></div><div className="creator-action-row"><a className="quiet-button" href="/github-workspace-v6/index.html#overview">打开工作台</a><button className="quiet-button" type="button" onClick={() => void sync()} disabled={syncing}>{syncing ? '同步中…' : '同步 GitHub'}</button></div></div>
    <div className="github-data-meta"><span>授权仓库 {data.connection.authorizedRepositoryCount}</span><span>最近同步 {relativeTime(data.connection.lastSyncedAt)}</span><span>状态 {data.connection.syncStatus}</span>{data.connection.rateLimitRemaining === null ? null : <span>API 额度 {data.connection.rateLimitRemaining}</span>}</div>
    {overview !== null ? <div className="github-data-stats"><span><strong>{overview.repositoryCount}</strong>仓库</span><span><strong>{overview.commitCount ?? '—'}</strong>提交</span><span><strong>{overview.pullRequestCount ?? '—'}</strong>PR</span><span><strong>{overview.issueCount ?? '—'}</strong>Issues</span><span><strong>{overview.contributions.total ?? '—'}</strong>贡献</span></div> : <p className="inline-status">{sectionMessage(data.overview, '暂无概览统计。')}</p>}
    <div className="github-data-grid">
      <div><div className="section-heading"><h3>授权仓库</h3><span>{repositories.length} 个</span></div>{repositories.length > 0 ? <ul className="github-data-list">{repositories.slice(0, compact ? 4 : 8).map((repo) => <li key={repo.fullName}><a href={repo.htmlUrl} target="_blank" rel="noreferrer"><strong>{repo.fullName}</strong><span>{repo.language ?? 'Other'} · ★ {repo.stars} · ⑂ {repo.forks}</span></a></li>)}</ul> : <p className="muted-copy">{repositoryMessage}</p>}</div>
      <div><div className="section-heading"><h3>代码片段</h3><span>{snippets.length} 个</span></div>{snippets.length > 0 ? <ul className="github-data-list">{snippets.slice(0, compact ? 4 : 8).map((snippet) => <li key={snippet.id}><div><strong>{snippet.title}</strong><span>{snippet.language} · {snippet.source}</span></div></li>)}</ul> : <p className="muted-copy">{snippetMessage}</p>}</div>
      {!compact ? <div><div className="section-heading"><h3>开发状态</h3><span>{activity.length} 条活动</span></div><p className="muted-copy">Issues {issues.length} · 任务 {tasks.length} · 活动 {activity.length}</p>{activity.length > 0 ? <ul className="github-data-list">{activity.slice(0, 4).map((item) => <li key={item.id}><a href={item.htmlUrl} target="_blank" rel="noreferrer"><strong>{item.action}</strong><span>{item.repositoryFullName ?? 'GitHub'} · {relativeTime(item.occurredAt)}</span></a></li>)}</ul> : <p className="muted-copy">暂无活动。</p>}</div> : null}
    </div>
  </section>;
}
