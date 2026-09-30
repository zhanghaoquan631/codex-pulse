const OFFICIAL_GITHUB_URL = 'https://github.com/';
const API_ROOT = '/v1/github-workspace';
const VIEWS = ['overview', 'repositories', 'snippets', 'issues', 'tasks', 'activity'];
const VIEW_LABELS = {
  overview: '概览',
  repositories: '仓库',
  snippets: '代码片段',
  issues: 'Issues',
  tasks: '任务中心',
  activity: '活动',
};
const VIEW_ICONS = {
  overview: '◫',
  repositories: '◇',
  snippets: '</>',
  issues: '!',
  tasks: '✓',
  activity: '↗',
};

const previewMode =
  ['127.0.0.1', 'localhost'].includes(location.hostname) &&
  new URLSearchParams(location.search).get('preview') === '1';

const state = {
  view: currentView(),
  route: currentRoute(),
  mode: 'loading',
  connection: null,
  data: {},
  detail: null,
  repositoryFile: null,
  activityFilter: 'ALL',
  snippetComposer: false,
  disconnectConfirm: false,
  error: '',
  search: '',
  pending: false,
};

function currentView() {
  const candidate = currentRoute()[0];
  return VIEWS.includes(candidate) ? candidate : 'overview';
}

function currentRoute() {
  return location.hash
    .replace(/^#\/?/, '')
    .split('?')[0]
    .split('/')
    .filter(Boolean)
    .map((part) => decodeURIComponent(part));
}

function escapeHtml(value) {
  return String(value ?? '').replace(
    /[&<>'"]/g,
    (char) =>
      ({
        '&': '&amp;',
        '<': '&lt;',
        '>': '&gt;',
        "'": '&#39;',
        '"': '&quot;',
      })[char],
  );
}

function safeUrl(value) {
  try {
    const url = new URL(String(value));
    return url.protocol === 'https:' &&
      (url.hostname === 'github.com' || url.hostname.endsWith('.github.com'))
      ? url.href
      : OFFICIAL_GITHUB_URL;
  } catch {
    return OFFICIAL_GITHUB_URL;
  }
}

function safeAvatarUrl(value) {
  try {
    const url = new URL(String(value));
    return url.protocol === 'https:' &&
      ['avatars.githubusercontent.com', 'github.com'].includes(url.hostname) &&
      !url.username &&
      !url.password
      ? url.href
      : '';
  } catch {
    return '';
  }
}

function relativeTime(value) {
  const date = new Date(value);
  if (Number.isNaN(date.valueOf())) return '时间未知';
  const minutes = Math.max(0, Math.round((Date.now() - date.valueOf()) / 60000));
  if (minutes < 60) return `${minutes} 分钟前`;
  if (minutes < 1440) return `${Math.floor(minutes / 60)} 小时前`;
  return `${Math.floor(minutes / 1440)} 天前`;
}

function key(prefix) {
  if (globalThis.crypto?.randomUUID) return `${prefix}:${crypto.randomUUID()}`;
  return `${prefix}:${Date.now()}:${Math.random().toString(36).slice(2)}`;
}

async function request(path, options = {}) {
  const response = await fetch(path, {
    credentials: 'same-origin',
    cache: 'no-store',
    redirect: 'follow',
    headers: { Accept: 'application/json', ...(options.headers ?? {}) },
    ...options,
  });
  const text = await response.text();
  let body = null;
  if (text) {
    try {
      body = JSON.parse(text);
    } catch {
      throw new Error('服务返回了无法识别的数据。');
    }
  }
  if (!response.ok) {
    const error = new Error(body?.error?.message || `请求失败（${response.status}）`);
    error.code = body?.error?.code || `HTTP_${response.status}`;
    throw error;
  }
  return body;
}

const preview = (() => {
  const today = new Date();
  const days = Array.from({ length: 126 }, (_, index) => ({
    date: new Date(today.valueOf() - (125 - index) * 86400000)
      .toISOString()
      .slice(0, 10),
    count: [0, 1, 0, 2, 3, 0, 1, 4, 2, 0][index % 10],
  }));
  const repositories = [
    ['mezip-archive', '私人生活档案与时间线应用', 'TypeScript', 28, false],
    ['creator-studio', '创作者工作区与发布工具', 'React', 17, false],
    ['design-notes', '产品设计与交互研究笔记', 'MDX', 12, false],
    ['private-lab', '本地开发实验场', 'Swift', 2, true],
  ].map(([name, description, language, stars, isPrivate], index) => ({
    githubId: `preview-repo-${index}`,
    owner: 'tom-preview',
    name,
    fullName: `tom-preview/${name}`,
    description,
    language,
    stars,
    forks: index + 1,
    issuesCount: index + 2,
    visibility: isPrivate ? 'PRIVATE' : 'PUBLIC',
    private: isPrivate,
    archived: false,
    fork: false,
    defaultBranch: 'main',
    htmlUrl: OFFICIAL_GITHUB_URL,
    updatedAt: new Date(today.valueOf() - index * 86400000).toISOString(),
    syncedAt: today.toISOString(),
  }));
  const issues = [
    ['完善移动端的时间线筛选', 'OPEN', 'mezip-archive', 42],
    ['补齐主题色无障碍对比度', 'OPEN', 'creator-studio', 19],
    ['整理产品设计复盘模板', 'CLOSED', 'design-notes', 8],
  ].map(([title, issueState, repo, number], index) => ({
    githubId: `preview-issue-${index}`,
    repositoryFullName: `tom-preview/${repo}`,
    number,
    title,
    body: '这是本地界面预览数据，不代表 GitHub 上的真实 Issue。',
    state: issueState,
    labels: [{ name: index === 1 ? 'design' : 'enhancement', color: '8b5cf6' }],
    assignees: [],
    author: 'tom-preview',
    commentsCount: index,
    htmlUrl: OFFICIAL_GITHUB_URL,
    createdAt: new Date(today.valueOf() - (index + 5) * 86400000).toISOString(),
    updatedAt: new Date(today.valueOf() - index * 3600000).toISOString(),
  }));
  const pullRequests = [
    {
      githubId: 'preview-pr-1',
      repositoryFullName: repositories[1].fullName,
      number: 12,
      title: '完善 GitHub 工作台的仓库详情',
      state: 'OPEN',
      draft: false,
      author: 'tom-preview',
      reviewState: 'REVIEW_REQUIRED',
      headBranch: 'feature/repository-detail',
      baseBranch: 'main',
      htmlUrl: OFFICIAL_GITHUB_URL,
      createdAt: new Date(today.valueOf() - 86400000).toISOString(),
      updatedAt: today.toISOString(),
    },
  ];
  const tasks = [
    ['task-1', '完成 GitHub Workspace 响应式验收', 'MEZIP_INTERNAL', 'TODO', 'P1'],
    ['task-2', '复核仓库只读权限范围', 'GITHUB_ISSUE', 'IN_PROGRESS', 'P0'],
    ['task-3', '检查移动端信息密度', 'MEZIP_INTERNAL', 'REVIEW', 'P2'],
    ['task-4', '整理发布前检查清单', 'GITHUB_PR', 'DONE', 'P1'],
  ].map(([id, title, source, status, priority], index) => ({
    id,
    title,
    source,
    status,
    priority,
    sourceId: `preview-${index}`,
    repositoryFullName: repositories[index % repositories.length].fullName,
    description: '本地预览任务',
    labels: ['preview'],
    assignee: null,
    dueAt: null,
    linkedIssue: null,
    linkedPullRequest: null,
    updatedAt: today.toISOString(),
  }));
  const activity = [
    ['PUSH', '推送了 3 个提交', repositories[0].fullName],
    ['PULL_REQUEST', '合并了 Pull Request #12', repositories[1].fullName],
    ['ISSUE', '创建了 Issue #42', repositories[0].fullName],
    ['RELEASE', '发布了 v0.9.0', repositories[2].fullName],
  ].map(([kind, action, repositoryFullName], index) => ({
    id: `preview-activity-${index}`,
    kind,
    action,
    repositoryFullName,
    occurredAt: new Date(today.valueOf() - index * 5400000).toISOString(),
    htmlUrl: OFFICIAL_GITHUB_URL,
    metadata: {},
  }));
  const snippets = [
    [
      '安全 JSON 请求',
      'TypeScript',
      "export async function request(url) {\n  const response = await fetch(url);\n  if (!response.ok) throw new Error('failed');\n  return response.json();\n}",
    ],
    [
      'CSS 玻璃卡片',
      'CSS',
      '.glass {\n  background: rgba(14, 17, 24, .86);\n  border: 1px solid rgba(255,255,255,.1);\n  backdrop-filter: blur(18px);\n}',
    ],
    [
      'SwiftUI 状态视图',
      'Swift',
      'struct EmptyState: View {\n  var body: some View {\n    ContentUnavailableView("暂无内容", systemImage: "tray")\n  }\n}',
    ],
  ].map(([title, language, content], index) => ({
    id: `preview-snippet-${index}`,
    source: 'MANUAL',
    sourceUrl: null,
    title,
    description: '本地布局预览片段',
    language,
    content,
    tags: ['preview'],
    favorite: index === 0,
    createdAt: today.toISOString(),
    updatedAt: today.toISOString(),
  }));
  const connection = {
    id: 'preview-connection',
    githubUserId: 'preview',
    githubLogin: 'tom-preview',
    githubAvatarUrl: null,
    installationId: 'preview',
    status: 'CONNECTED',
    repositorySelection: 'SELECTED',
    authorizedRepositoryCount: repositories.length,
    connectedAt: today.toISOString(),
    updatedAt: today.toISOString(),
    lastSyncedAt: today.toISOString(),
    syncStatus: 'SUCCESS',
    rateLimitRemaining: 4999,
    rateLimitResetAt: null,
  };
  return {
    connection,
    overview: {
      connection,
      contributions: {
        year: today.getFullYear(),
        total: 247,
        currentStreak: 8,
        longestStreak: 23,
        days,
      },
      commitCount: 156,
      pullRequestCount: 18,
      issueCount: 29,
      repositoryCount: repositories.length,
      repositories,
      recentActivity: activity,
      languageDistribution: { TypeScript: 48, Swift: 23, CSS: 16, MDX: 13 },
      pendingTasks: tasks.filter((task) => task.status !== 'DONE'),
      stale: false,
    },
    repositories,
    pullRequests,
    issues,
    tasks,
    activity,
    snippets,
  };
})();

function emptyBlock(title, description) {
  return `<section class="surface empty-state"><div><strong>${escapeHtml(title)}</strong><span>${escapeHtml(description)}</span></div></section>`;
}

function issuesEmptyBlock() {
  const repositories = state.data.repositories || [];
  const repositoryLinks = repositories
    .slice(0, 4)
    .map((repository) => {
      const repositoryUrl = safeUrl(repository.htmlUrl);
      const issuesUrl = repositoryUrl.endsWith('/')
        ? `${repositoryUrl}issues`
        : `${repositoryUrl}/issues`;
      return `<a class="quiet" href="${escapeHtml(issuesUrl)}" target="_blank" rel="noreferrer noopener">查看 ${escapeHtml(repository.name)} 的 Issues</a>`;
    })
    .join('');
  return `<section class="surface empty-state github-issues-empty"><div><strong>当前授权仓库没有 Issues</strong><span>已读取 ${escapeHtml(String(repositories.length))} 个授权仓库；GitHub 当前返回 0 个 Issue。这里不会使用演示数据填充。</span></div><div class="empty-state-actions">${repositoryLinks || '<span class="inline-note">没有可查看的授权仓库。</span>'}</div></section>`;
}

function pageHeader() {
  return `<header class="topbar">
    <div class="heading"><h1>GitHub 工作台</h1><p>你的个人开发活动与任务空间</p></div>
    <label class="global-search"><span aria-hidden="true">⌕</span><input id="global-search" type="search" maxlength="160" placeholder="搜索仓库、Issue、片段或任务" value="${escapeHtml(state.search)}" aria-label="搜索工作台" /></label>
    <div class="top-actions"><button class="icon-button" data-action="sync" title="同步" ${state.pending ? 'disabled' : ''}>↻</button><a class="quiet" href="${OFFICIAL_GITHUB_URL}" target="_blank" rel="noreferrer noopener">打开 GitHub</a></div>
  </header>`;
}

function sideNavigation() {
  return `<aside class="sidebar"><a class="brand" href="#overview" aria-label="ME.zip GitHub 工作台首页"><span class="brand-mark">M</span><span><strong>ME.zip</strong><small>GITHUB WORKSPACE</small></span></a>
    <nav class="side-nav" aria-label="工作台功能">${VIEWS.map((view) => `<a class="side-link ${state.view === view ? 'active' : ''}" href="#${view}"><span class="side-icon">${VIEW_ICONS[view]}</span>${VIEW_LABELS[view]}</a>`).join('')}</nav>
    <div class="account-chip"><span class="avatar">${safeAvatarUrl(state.connection?.githubAvatarUrl) ? `<img src="${escapeHtml(safeAvatarUrl(state.connection.githubAvatarUrl))}" alt="" />` : 'GH'}</span><span><strong>${escapeHtml(state.connection?.githubLogin || '未连接')}</strong><small>${previewMode ? '本地预览' : state.connection ? 'GitHub 已连接' : '需要授权'}</small></span></div>
  </aside>`;
}

function tabs() {
  return `<nav class="workspace-tabs" aria-label="当前工作区标签">${VIEWS.map((view) => `<button data-view="${view}" class="${state.view === view ? 'active' : ''}">${VIEW_LABELS[view]}</button>`).join('')}</nav>`;
}

function statusStrip() {
  const connected = Boolean(state.connection);
  const lastSync = state.connection?.lastSyncedAt
    ? relativeTime(state.connection.lastSyncedAt)
    : '尚未同步';
  const rate = state.connection?.rateLimitRemaining;
  return `<div class="status-strip"><div class="connection-status"><span class="status-dot ${connected ? 'connected' : ''}"></span>${connected ? `已连接 GitHub · @${escapeHtml(state.connection.githubLogin)}　授权仓库 ${escapeHtml(String(state.connection.authorizedRepositoryCount))}　最近同步 ${escapeHtml(lastSync)}${rate === null || rate === undefined ? '' : `　额度 ${escapeHtml(rate)}`}` : '未连接 GitHub'}</div>${connected ? `<div class="status-actions"><a class="quiet" href="/api/integrations/github/connect">管理授权</a>${state.disconnectConfirm ? `<button class="danger" data-action="confirm-disconnect" ${state.pending ? 'disabled' : ''}>确认断开</button><button class="quiet" data-action="cancel-disconnect">取消</button>` : `<button class="quiet" data-action="disconnect" ${state.pending || previewMode ? 'disabled' : ''}>断开连接</button>`}</div>` : ''}${previewMode ? '<div class="preview-banner">本地界面预览 · 未连接真实 GitHub · 所有示例数据仅用于布局验收</div>' : ''}</div>`;
}

function layout(content) {
  document.querySelector('#app').innerHTML =
    `<div class="shell">${sideNavigation()}<main class="workspace" id="workspace-main">${pageHeader()}${tabs()}${statusStrip()}${state.error ? `<div class="inline-error" role="alert">${escapeHtml(state.error)}</div>` : ''}<div id="workspace-view">${content}</div></main></div>`;
}

function connectionLanding() {
  const unavailable = state.mode === 'unavailable';
  return `<section class="surface connection-landing"><div class="connection-card"><div class="github-orbit">GH</div><h2>${unavailable ? 'GitHub 连接尚未配置' : '连接你的 GitHub'}</h2>
    <p>${unavailable ? '本地页面已准备好，但服务端 GitHub App 尚未配置。页面不会伪造连接或同步成功。' : '通过 GitHub 官方授权读取你选择的仓库、Issue、Pull Request 与公开开发活动。不会读取密码或浏览器 Cookie。'}</p>
    <div class="capability-list"><span>仓库浏览</span><span>Issue 与 PR</span><span>任务看板</span><span>代码片段</span><span>活动统计</span></div>
    <div class="landing-actions"><a class="primary" href="/api/integrations/github/connect">前往官方授权</a><a class="quiet" href="${OFFICIAL_GITHUB_URL}" target="_blank" rel="noreferrer noopener">打开 GitHub 官网</a>${location.hostname === '127.0.0.1' || location.hostname === 'localhost' ? '<a class="quiet" href="?preview=1#overview">预览界面</a>' : ''}</div>
    <p class="landing-foot">生产环境需要 Owner 配置 GitHub App、回调地址和最小权限；缺失配置时保持失败关闭。</p></div></section>`;
}

function heatmap(days) {
  if (!days?.length) return '<div class="inline-note">GitHub 未返回贡献数据。</div>';
  return `<div class="heatmap-wrap"><div class="heatmap" aria-label="贡献热力图">${days.map((day) => `<span class="heat-cell" data-level="${Math.min(4, Number(day.count) || 0)}" title="${escapeHtml(day.date)} · ${escapeHtml(day.count)} 次"></span>`).join('')}</div></div>`;
}

function repoCard(repo) {
  return `<article class="repo-card"><a href="#repositories/${encodeURIComponent(repo.owner)}/${encodeURIComponent(repo.name)}"><strong>${escapeHtml(repo.name)}</strong></a><p>${escapeHtml(repo.description || '暂无仓库说明')}</p><div class="repo-meta"><span><i class="language-dot"></i>${escapeHtml(repo.language || 'Other')}</span><span>★ ${escapeHtml(repo.stars)}</span><span>⑂ ${escapeHtml(repo.forks)}</span>${repo.private ? '<span>私有</span>' : ''}</div></article>`;
}

function activityRows(activity) {
  if (!activity?.length)
    return '<div class="inline-note">暂无可显示的 GitHub 活动。</div>';
  return `<div class="activity-list">${activity.map((item) => `<a class="activity-row" href="${escapeHtml(safeUrl(item.htmlUrl))}" target="_blank" rel="noreferrer noopener"><span class="activity-icon">${item.kind === 'PUSH' ? '⇧' : item.kind === 'ISSUE' ? '!' : '↗'}</span><span><strong>${escapeHtml(item.action)}</strong><small>${escapeHtml(item.repositoryFullName || 'GitHub')}</small></span><small>${escapeHtml(relativeTime(item.occurredAt))}</small></a>`).join('')}</div>`;
}

function overviewView() {
  const overview = state.data.overview;
  if (!overview)
    return emptyBlock(
      '暂无概览数据',
      '点击同步后再试；页面不会使用演示数据代替真实 GitHub 数据。',
    );
  const stats = [
    ['提交', overview.commitCount],
    ['Pull Requests', overview.pullRequestCount],
    ['Issues', overview.issueCount],
    ['仓库', overview.repositoryCount],
  ];
  const languages = Object.entries(overview.languageDistribution || {}).sort(
    (a, b) => b[1] - a[1],
  );
  const max = Math.max(1, ...languages.map(([, count]) => count));
  return `<div class="grid overview-grid"><div class="stack">
    <section class="surface panel"><div class="panel-header"><h2>${escapeHtml(overview.contributions?.year || '本年')} 年贡献</h2><span>${escapeHtml(overview.contributions?.total ?? '—')} 次</span></div>${heatmap(overview.contributions?.days)}<div class="stats">${stats.map(([label, value]) => `<div class="stat"><span>${label}</span><strong>${escapeHtml(value ?? '—')}</strong></div>`).join('')}</div></section>
    <section class="surface panel"><div class="panel-header"><h2>最近活动</h2><button data-view="activity">查看全部</button></div>${activityRows(overview.recentActivity)}</section>
  </div><div class="stack">
    <section class="surface panel"><div class="panel-header"><h2>常用仓库</h2><button data-view="repositories">全部仓库</button></div><div class="repo-cards">${overview.repositories.slice(0, 4).map(repoCard).join('')}</div></section>
    <section class="surface panel"><div class="panel-header"><h2>语言分布</h2></div><div class="language-bars">${languages.map(([language, count]) => `<div class="bar-row"><span>${escapeHtml(language)}</span><span class="bar-track"><span class="bar-fill" style="width:${Math.max(4, Math.round((count / max) * 100))}%"></span></span><span>${escapeHtml(count)}%</span></div>`).join('') || '<span class="inline-note">暂无语言统计。</span>'}</div></section>
  </div></div>`;
}

function codeLines(content) {
  return String(content ?? '')
    .split('\n')
    .map(
      (line, index) =>
        `<span class="code-line"><b>${index + 1}</b><code>${escapeHtml(line || ' ')}</code></span>`,
    )
    .join('');
}

function repositoryDetailView() {
  const fullName = `${state.route[1] || ''}/${state.route[2] || ''}`;
  const repository = (state.data.repositories || []).find(
    (item) => item.fullName.toLowerCase() === fullName.toLowerCase(),
  );
  if (!repository)
    return emptyBlock(
      '仓库不可用',
      '该仓库不在当前 Owner 的授权仓库集合中，因此不会尝试读取内容。',
    );
  const detail = state.detail;
  if (!detail)
    return '<div class="loading"><div><div class="spinner"></div>正在读取授权仓库…</div></div>';
  const content = state.repositoryFile || detail.content;
  const isFile = content?.kind === 'FILE';
  return `<div class="detail-stack">
    <section class="detail-hero surface"><div><a class="back-link" href="#repositories">← 返回仓库</a><h2>${escapeHtml(repository.fullName)}</h2><p>${escapeHtml(repository.description || '暂无仓库说明')}</p><div class="repo-meta"><span class="badge">${escapeHtml(repository.visibility)}</span><span>${escapeHtml(repository.language || 'Other')}</span><span>默认分支 ${escapeHtml(repository.defaultBranch)}</span><span>★ ${escapeHtml(repository.stars)}</span><span>⑂ ${escapeHtml(repository.forks)}</span></div></div><a class="primary" href="${escapeHtml(safeUrl(repository.htmlUrl))}" target="_blank" rel="noreferrer noopener">在 GitHub 打开</a></section>
    <nav class="detail-tabs" aria-label="仓库详情"><button data-scroll="repo-overview">Overview</button><button data-scroll="repo-files">Files</button><button data-scroll="repo-commits">Commits</button><button data-scroll="repo-branches">Branches</button><button data-scroll="repo-issues">Issues</button><button data-scroll="repo-pulls">Pull Requests</button></nav>
    <section id="repo-files" class="surface panel"><div class="panel-header"><h3>${isFile ? escapeHtml(content.path) : `文件 · ${escapeHtml(content?.path || repository.defaultBranch)}`}</h3>${isFile ? `<button class="quiet" data-copy-content>复制文件</button>` : ''}</div>${isFile ? `<div class="code-viewer" data-code-content="${escapeHtml(content.content || '')}">${content.content === null ? '<div class="inline-note">文件过大或不是可安全预览的文本，请在 GitHub 打开。</div>' : codeLines(content.content)}</div>` : `<div class="file-list">${(content?.entries || []).map((entry) => `<button class="file-row" data-repository="${escapeHtml(repository.fullName)}" data-path="${escapeHtml(entry.path)}"><span>${entry.kind === 'DIRECTORY' ? '▣' : '▤'}</span><strong>${escapeHtml(entry.name)}</strong><small>${entry.kind === 'DIRECTORY' ? '目录' : `${escapeHtml(entry.sizeBytes)} B`}</small></button>`).join('') || '<div class="inline-note">此目录为空，或 GitHub 尚未返回文件列表。</div>'}</div>`}</section>
    <div class="grid detail-grid"><section id="repo-commits" class="surface panel"><div class="panel-header"><h3>Recent Commits</h3></div><div class="activity-list">${(detail.commits || []).map((commit) => `<a class="activity-row" href="${escapeHtml(safeUrl(commit.htmlUrl))}" target="_blank" rel="noreferrer noopener"><span class="activity-icon">●</span><span><strong>${escapeHtml(commit.message.split('\n')[0])}</strong><small>${escapeHtml(commit.author)} · ${escapeHtml(commit.sha.slice(0, 7))}</small></span><small>${escapeHtml(relativeTime(commit.committedAt))}</small></a>`).join('') || '<div class="inline-note">暂无提交记录。</div>'}</div></section>
    <section id="repo-branches" class="surface panel"><div class="panel-header"><h3>Branches</h3></div><div class="branch-list">${(detail.branches || []).map((branch) => `<div class="branch-row"><strong>${escapeHtml(branch.name)}</strong><span>${branch.default ? 'Default' : ''}${branch.protected ? ' · Protected' : ''}</span><code>${escapeHtml(branch.lastCommitSha.slice(0, 7))}</code></div>`).join('') || '<div class="inline-note">暂无分支信息。</div>'}</div></section></div>
    <div class="grid detail-grid"><section id="repo-issues" class="surface panel"><div class="panel-header"><h3>Open Issues</h3></div>${issueRows((state.data.issues || []).filter((issue) => issue.repositoryFullName === repository.fullName && issue.state === 'OPEN'))}</section>
    <section id="repo-pulls" class="surface panel"><div class="panel-header"><h3>Pull Requests</h3></div>${pullRows((state.data.pullRequests || []).filter((pull) => pull.repositoryFullName === repository.fullName))}</section></div>
  </div>`;
}

function issueRows(issues) {
  return `<div class="issue-list">${issues.map((item) => `<a class="issue-row" href="#issues/${encodeURIComponent(item.repositoryFullName.split('/')[0])}/${encodeURIComponent(item.repositoryFullName.split('/')[1])}/${item.number}"><span class="activity-icon">${item.state === 'OPEN' ? '!' : '✓'}</span><span><strong>${escapeHtml(item.title)}</strong><small>${escapeHtml(item.repositoryFullName)} #${escapeHtml(item.number)} · ${item.labels.map((label) => escapeHtml(label.name)).join(', ') || '无标签'}</small></span><span class="badge ${item.state.toLowerCase()}">${escapeHtml(item.state)}</span></a>`).join('') || '<div class="inline-note">暂无 Issues。</div>'}</div>`;
}

function pullRows(pulls) {
  return `<div class="issue-list">${pulls.map((item) => `<a class="issue-row" href="${escapeHtml(safeUrl(item.htmlUrl))}" target="_blank" rel="noreferrer noopener"><span class="activity-icon">↗</span><span><strong>${escapeHtml(item.title)}</strong><small>${escapeHtml(item.repositoryFullName)} #${escapeHtml(item.number)} · ${escapeHtml(item.author)}</small></span><span class="badge ${item.state.toLowerCase()}">${escapeHtml(item.reviewState)}</span></a>`).join('') || '<div class="inline-note">暂无 Pull Requests。</div>'}</div>`;
}

function tasksEmptyBlock() {
  return `<section class="surface empty-state task-empty-state"><div><strong>当前没有可操作任务</strong><span>任务中心只会从当前授权仓库的 Issue 和 Pull Request 汇入真实任务。当前没有任务，页面不会填充演示数据。</span></div><div class="empty-state-actions"><button class="primary" data-action="sync" ${state.pending ? 'disabled' : ''}>${state.pending ? '同步中…' : '重新同步 GitHub'}</button><button class="quiet" data-view="activity">查看开发活动</button></div></section>`;
}

function issueDetailView() {
  const fullName = `${state.route[1] || ''}/${state.route[2] || ''}`;
  const number = Number(state.route[3]);
  const issue = (state.data.issues || []).find(
    (item) => item.repositoryFullName === fullName && item.number === number,
  );
  if (!issue)
    return emptyBlock('Issue 不可用', '当前 Owner 无权读取，或该 Issue 已不存在。');
  return `<div class="detail-stack"><section class="detail-hero surface"><div><a class="back-link" href="#issues">← 返回 Issues</a><h2>${escapeHtml(issue.title)}</h2><p>${escapeHtml(issue.repositoryFullName)} #${escapeHtml(issue.number)} · ${escapeHtml(issue.author)}</p><div class="repo-meta"><span class="badge ${issue.state.toLowerCase()}">${escapeHtml(issue.state)}</span>${issue.labels.map((label) => `<span class="badge">${escapeHtml(label.name)}</span>`).join('')}<span>${escapeHtml(issue.commentsCount)} 条评论</span></div></div><a class="primary" href="${escapeHtml(safeUrl(issue.htmlUrl))}" target="_blank" rel="noreferrer noopener">在 GitHub 打开</a></section><section class="surface panel prose"><h3>内容</h3><p>${escapeHtml(issue.body || '该 Issue 没有正文。')}</p></section><div class="inline-note">当前 GitHub App 权限为只读。评论、关闭、重新打开、指派或标签修改需要用户主动升级 Issues 权限；本页面不会伪造成功。</div><a class="quiet permission-link" href="/api/integrations/github/connect">管理授权</a></div>`;
}

function snippetDetailView() {
  const snippet = (state.data.snippets || []).find(
    (item) => item.id === state.route[1],
  );
  if (!snippet) return emptyBlock('片段不可用', '该片段不存在或不属于当前 Owner。');
  return `<div class="detail-stack"><section class="detail-hero surface"><div><a class="back-link" href="#snippets">← 返回代码片段</a><h2>${escapeHtml(snippet.title)}</h2><p>${escapeHtml(snippet.description || '暂无说明')}</p><div class="repo-meta"><span class="badge">${escapeHtml(snippet.language)}</span><span>${escapeHtml(snippet.source)}</span>${snippet.tags.map((tag) => `<span class="badge">${escapeHtml(tag)}</span>`).join('')}</div></div><div class="detail-actions"><button class="quiet" data-favorite="${escapeHtml(snippet.id)}">${snippet.favorite ? '★ 取消收藏' : '☆ 收藏'}</button><button class="danger" data-delete-snippet="${escapeHtml(snippet.id)}">删除</button></div></section><section class="surface panel"><div class="panel-header"><h3>完整代码</h3><button class="quiet" data-copy="${escapeHtml(snippet.id)}">复制</button></div><div class="code-viewer">${codeLines(snippet.content)}</div></section><div class="inline-note">版本历史接口保留为后续 foundation；在真实 durable provider 上线前不会伪造历史版本。</div></div>`;
}

function repositoriesView() {
  if (state.route.length >= 3) return repositoryDetailView();
  const repositories = (state.data.repositories || []).filter(
    (repo) =>
      !state.search ||
      `${repo.fullName} ${repo.description || ''}`
        .toLowerCase()
        .includes(state.search.toLowerCase()),
  );
  if (!repositories.length)
    return emptyBlock(
      '没有匹配的仓库',
      state.search ? '请调整搜索词。' : 'GitHub 尚未返回授权仓库。',
    );
  return `<section class="surface panel"><div class="toolbar"><input type="search" data-filter="repositories" placeholder="筛选仓库" value="${escapeHtml(state.search)}" /><select id="repo-visibility"><option>全部可见性</option><option>公开</option><option>私有</option><option>已归档</option><option>Forked</option></select><select id="repo-sort"><option>最近更新</option><option>Name</option><option>Stars</option></select></div><div style="overflow-x:auto"><table class="data-table"><thead><tr><th>仓库</th><th>语言</th><th>可见性</th><th>Stars / Forks / Issues</th><th>默认分支</th><th>最后更新</th></tr></thead><tbody>${repositories.map((repo) => `<tr><td><a href="#repositories/${encodeURIComponent(repo.owner)}/${encodeURIComponent(repo.name)}"><strong>${escapeHtml(repo.fullName)}</strong></a><br/><small>${escapeHtml(repo.description || '暂无说明')}</small></td><td>${escapeHtml(repo.language || 'Other')}</td><td><span class="badge">${escapeHtml(repo.visibility)}</span></td><td>★ ${escapeHtml(repo.stars)}　⑂ ${escapeHtml(repo.forks)}　! ${escapeHtml(repo.issuesCount)}</td><td>${escapeHtml(repo.defaultBranch)}</td><td>${escapeHtml(relativeTime(repo.updatedAt))}</td></tr>`).join('')}</tbody></table></div></section>`;
}

function snippetsView() {
  if (state.route.length >= 2) return snippetDetailView();
  const snippets = (state.data.snippets || []).filter(
    (item) =>
      !state.search ||
      `${item.title} ${item.description} ${item.language}`
        .toLowerCase()
        .includes(state.search.toLowerCase()),
  );
  const composer = state.snippetComposer
    ? `<form class="surface snippet-form" id="snippet-form"><div class="panel-header"><h3>新建代码片段</h3><button type="button" class="icon-button" data-action="close-snippet">×</button></div><label>标题<input name="title" required maxlength="160" /></label><label>语言<input name="language" required maxlength="60" /></label><label>说明<input name="description" maxlength="1000" /></label><label>代码<textarea name="content" required maxlength="500000" rows="10"></textarea></label><div class="form-actions"><button type="button" class="quiet" data-action="close-snippet">取消</button><button class="primary" type="submit" ${state.pending ? 'disabled' : ''}>保存片段</button></div></form>`
    : '';
  return `<div class="toolbar"><input type="search" data-filter="snippets" placeholder="筛选代码片段" value="${escapeHtml(state.search)}" /><select><option>全部语言</option><option>TypeScript</option><option>Swift</option><option>CSS</option></select><select><option>全部来源</option><option>MEZIP</option><option>GITHUB_GIST</option><option>REPOSITORY_FILE</option><option>MANUAL</option></select><button class="primary" data-action="new-snippet">+ 新建片段</button></div>${composer}${snippets.length ? `<section class="snippet-grid">${snippets.map((item) => `<article class="snippet-card"><a href="#snippets/${encodeURIComponent(item.id)}"><h3>${escapeHtml(item.title)}</h3></a><p>${escapeHtml(item.language)} · ${escapeHtml(item.source)} · ${escapeHtml(relativeTime(item.updatedAt))}</p><pre>${escapeHtml(item.content)}</pre><div class="snippet-actions"><button data-favorite="${escapeHtml(item.id)}">${item.favorite ? '★ 已收藏' : '☆ 未收藏'}</button><button class="quiet" data-copy="${escapeHtml(item.id)}">复制</button></div></article>`).join('')}</section>` : emptyBlock('暂无代码片段', '连接 GitHub 后可管理个人片段；不会读取未授权的仓库文件。')}`;
}

function issuesView() {
  if (state.route.length >= 4) return issueDetailView();
  const issues = (state.data.issues || []).filter(
    (item) =>
      !state.search ||
      `${item.title} ${item.repositoryFullName}`
        .toLowerCase()
        .includes(state.search.toLowerCase()),
  );
  if (!issues.length)
    return issuesEmptyBlock();
  return `<section class="surface panel"><div class="toolbar"><input type="search" data-filter="issues" placeholder="筛选 Issue" value="${escapeHtml(state.search)}" /><select><option>All</option><option>Open</option><option>In Progress</option><option>Closed</option></select><select><option>全部仓库</option>${[...new Set(issues.map((item) => item.repositoryFullName))].map((repo) => `<option>${escapeHtml(repo)}</option>`).join('')}</select><select><option>最近更新</option><option>创建时间</option><option>评论数</option></select></div>${issueRows(issues)}</section>`;
}

function tasksView() {
  const tasks = (state.data.tasks || []).filter(
    (item) =>
      !state.search ||
      `${item.title} ${item.repositoryFullName || ''}`
        .toLowerCase()
        .includes(state.search.toLowerCase()),
  );
  const columns = [
    ['TODO', '待处理'],
    ['IN_PROGRESS', '进行中'],
    ['REVIEW', '审核中'],
    ['DONE', '已完成'],
  ];
  const reviewQueue = (state.data.pullRequests || []).filter((pull) =>
    ['REVIEW_REQUIRED', 'CHANGES_REQUESTED'].includes(pull.reviewState),
  );
  const emptyState = tasks.length === 0 && reviewQueue.length === 0
    ? (state.search ? emptyBlock('没有匹配的任务', '请调整搜索词，或清除搜索后查看全部任务。') : tasksEmptyBlock())
    : '';
  return `<section class="surface panel review-queue"><div class="panel-header"><h2>待 Review</h2><span>${reviewQueue.length} 项</span></div>${pullRows(reviewQueue)}</section>${emptyState}<section class="kanban">${columns
    .map(([status, label], columnIndex) => {
      const rows = tasks.filter((item) => item.status === status);
      return `<div class="kanban-column"><header><strong>${label}</strong><span>${rows.length}</span></header>${rows.map((item) => `<article class="task-card"><h3>${escapeHtml(item.title)}</h3><p>${escapeHtml(item.repositoryFullName || 'ME.zip 内部任务')} · ${escapeHtml(item.priority)}</p><div class="task-actions">${columnIndex > 0 ? `<button data-task="${escapeHtml(item.id)}" data-status="${columns[columnIndex - 1][0]}" title="移到上一列">←</button>` : ''}${columnIndex < columns.length - 1 ? `<button data-task="${escapeHtml(item.id)}" data-status="${columns[columnIndex + 1][0]}" title="移到下一列">→</button>` : ''}</div></article>`).join('') || '<div class="inline-note">这一列暂无任务。</div>'}</div>`;
    })
    .join('')}</section>`;
}

function activityView() {
  const mapping = {
    PUSH: ['PUSH', 'COMMIT'],
    ISSUES: ['ISSUE'],
    PULL_REQUESTS: ['PULL_REQUEST'],
    COMMENTS: ['ISSUE_COMMENT'],
    REVIEWS: ['PR_REVIEW'],
    STARS: ['STAR'],
    FORKS: ['FORK'],
  };
  const activity = (state.data.activity || []).filter((item) => {
    const searchMatch =
      !state.search ||
      `${item.action} ${item.repositoryFullName || ''}`
        .toLowerCase()
        .includes(state.search.toLowerCase());
    const filterMatch =
      state.activityFilter === 'ALL' ||
      mapping[state.activityFilter]?.includes(item.kind);
    return searchMatch && filterMatch;
  });
  const filters = [
    ['ALL', '全部'],
    ['PUSH', 'Push'],
    ['ISSUES', 'Issues'],
    ['PULL_REQUESTS', 'Pull Requests'],
    ['COMMENTS', 'Comments'],
    ['REVIEWS', 'Reviews'],
    ['STARS', 'Stars'],
    ['FORKS', 'Forks'],
  ];
  const activeLabel = filters.find(([value]) => value === state.activityFilter)?.[1] || '当前筛选';
  const activityContent = activity.length > 0
    ? activityRows(activity)
    : `<div class="empty-state activity-empty-state"><div><strong>${state.activityFilter === 'ALL' ? '暂无开发活动' : `${escapeHtml(activeLabel)}暂无活动`}</strong><span>${state.activityFilter === 'ALL' ? 'GitHub 当前没有返回可显示的活动记录。' : '当前账号的真实活动中没有匹配这一筛选项。'}</span></div>${state.activityFilter === 'ALL' ? '' : '<div class="empty-state-actions"><button class="quiet" data-activity-filter="ALL">清除筛选</button></div>'}</div>`;
  return `<section class="surface panel"><div class="panel-header"><h2>开发活动</h2><span>${activity.length} 条</span></div><div class="filter-chips">${filters.map(([value, label]) => `<button class="${state.activityFilter === value ? 'active' : ''}" data-activity-filter="${value}" aria-pressed="${state.activityFilter === value}">${label}</button>`).join('')}</div>${activityContent}</section>`;
}

function render() {
  if (state.mode === 'loading') {
    document.querySelector('#app').innerHTML =
      '<div class="loading"><div><div class="spinner"></div>正在检查 GitHub 工作台连接状态…</div></div>';
    return;
  }
  if (state.mode === 'disconnected' || state.mode === 'unavailable') {
    layout(connectionLanding());
    return;
  }
  const views = {
    overview: overviewView,
    repositories: repositoriesView,
    snippets: snippetsView,
    issues: issuesView,
    tasks: tasksView,
    activity: activityView,
  };
  layout(views[state.view]());
}

function previewRepositoryDetail(repository) {
  const now = new Date().toISOString();
  return {
    content: {
      repositoryFullName: repository.fullName,
      path: '',
      kind: 'DIRECTORY',
      sizeBytes: 0,
      sha: '',
      htmlUrl: OFFICIAL_GITHUB_URL,
      downloadUrl: null,
      content: null,
      entries: [
        {
          name: 'README.md',
          path: 'README.md',
          kind: 'FILE',
          sizeBytes: 820,
          sha: 'preview-readme',
          htmlUrl: OFFICIAL_GITHUB_URL,
        },
        {
          name: 'src',
          path: 'src',
          kind: 'DIRECTORY',
          sizeBytes: 0,
          sha: 'preview-src',
          htmlUrl: OFFICIAL_GITHUB_URL,
        },
        {
          name: 'package.json',
          path: 'package.json',
          kind: 'FILE',
          sizeBytes: 540,
          sha: 'preview-package',
          htmlUrl: OFFICIAL_GITHUB_URL,
        },
      ],
    },
    commits: [
      {
        sha: 'a81d9f30a31',
        message: 'feat: refine developer workspace',
        author: 'tom-preview',
        avatarUrl: null,
        committedAt: now,
        htmlUrl: OFFICIAL_GITHUB_URL,
      },
      {
        sha: '12c90e7b1f4',
        message: 'test: cover owner isolation',
        author: 'tom-preview',
        avatarUrl: null,
        committedAt: new Date(Date.now() - 86400000).toISOString(),
        htmlUrl: OFFICIAL_GITHUB_URL,
      },
    ],
    branches: [
      {
        name: repository.defaultBranch,
        default: true,
        protected: true,
        lastCommitSha: 'a81d9f30a31',
      },
      {
        name: 'feature/workspace',
        default: false,
        protected: false,
        lastCommitSha: '12c90e7b1f4',
      },
    ],
  };
}

async function loadRouteDetail() {
  state.detail = null;
  state.repositoryFile = null;
  if (state.view !== 'repositories' || state.route.length < 3) return;
  const fullName = `${state.route[1]}/${state.route[2]}`;
  const repository = (state.data.repositories || []).find(
    (item) => item.fullName.toLowerCase() === fullName.toLowerCase(),
  );
  if (!repository) return;
  if (previewMode) {
    state.detail = previewRepositoryDetail(repository);
    return;
  }
  try {
    const owner = encodeURIComponent(repository.owner);
    const name = encodeURIComponent(repository.name);
    const [content, commits, branches] = await Promise.all([
      request(`${API_ROOT}/repositories/${owner}/${name}/contents`),
      request(`${API_ROOT}/repositories/${owner}/${name}/commits?page=1`),
      request(`${API_ROOT}/repositories/${owner}/${name}/branches`),
    ]);
    state.detail = {
      content,
      commits: Array.isArray(commits) ? commits : [],
      branches: Array.isArray(branches) ? branches : [],
    };
  } catch (error) {
    state.error = error.message;
  }
}

async function loadRepositoryPath(repositoryFullName, path) {
  const repository = (state.data.repositories || []).find(
    (item) => item.fullName === repositoryFullName,
  );
  if (!repository) return;
  if (previewMode) {
    const directory = path === 'src';
    state.repositoryFile = directory
      ? {
          repositoryFullName,
          path,
          kind: 'DIRECTORY',
          content: null,
          entries: [
            {
              name: 'index.ts',
              path: 'src/index.ts',
              kind: 'FILE',
              sizeBytes: 420,
              sha: 'preview-index',
              htmlUrl: OFFICIAL_GITHUB_URL,
            },
          ],
        }
      : {
          repositoryFullName,
          path,
          kind: 'FILE',
          content: path.endsWith('.json')
            ? '{\n  "name": "preview-workspace",\n  "private": true\n}'
            : '# Preview repository\n\nThis file exists only for local layout review.',
          entries: [],
        };
    render();
    return;
  }
  try {
    state.pending = true;
    render();
    state.repositoryFile = await request(
      `${API_ROOT}/repositories/${encodeURIComponent(repository.owner)}/${encodeURIComponent(repository.name)}/contents?path=${encodeURIComponent(path)}`,
    );
    state.error = '';
  } catch (error) {
    state.error = error.message;
  } finally {
    state.pending = false;
    render();
  }
}

async function loadConnectedData() {
  if (previewMode) {
    state.connection = preview.connection;
    state.data = preview;
    state.mode = 'connected';
    await loadRouteDetail();
    render();
    return;
  }
  state.mode = 'loading';
  render();
  try {
    const connection = await request(`${API_ROOT}/connection`);
    if (!connection || connection.status !== 'CONNECTED') {
      state.connection = null;
      state.mode = 'disconnected';
      render();
      return;
    }
    state.connection = connection;
    const [overview, repositories, snippets, issues, pullRequests, tasks, activity] =
      await Promise.all([
        request(`${API_ROOT}/overview`),
        request(`${API_ROOT}/repositories?limit=100`),
        request(`${API_ROOT}/snippets`),
        request(`${API_ROOT}/issues?state=ALL`),
        request(`${API_ROOT}/pull-requests?state=ALL`),
        request(`${API_ROOT}/tasks`),
        request(`${API_ROOT}/activity`),
      ]);
    state.data = {
      overview,
      repositories: Array.isArray(repositories)
        ? repositories
        : (repositories?.items ?? []),
      snippets: Array.isArray(snippets) ? snippets : [],
      issues: Array.isArray(issues) ? issues : [],
      pullRequests: Array.isArray(pullRequests) ? pullRequests : [],
      tasks: Array.isArray(tasks) ? tasks : [],
      activity: Array.isArray(activity) ? activity : [],
    };
    state.mode = 'connected';
    state.error = '';
    await loadRouteDetail();
  } catch (error) {
    state.connection = null;
    state.mode =
      error.code === 'UNAUTHORIZED' || error.code === 'AUTH_REQUIRED'
        ? 'disconnected'
        : 'unavailable';
    state.error = error.message;
  }
  render();
}

async function syncNow() {
  if (previewMode) {
    state.error = '本地预览不会向 GitHub 发送同步请求。';
    render();
    return;
  }
  if (!state.connection || state.pending) return;
  state.pending = true;
  state.error = '';
  render();
  try {
    await request(`${API_ROOT}/sync`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Idempotency-Key': key('workspace-sync'),
      },
      body: '{}',
    });
    await loadConnectedData();
  } catch (error) {
    state.pending = false;
    state.error = error.message;
    render();
  } finally {
    state.pending = false;
  }
}

async function moveTask(taskId, status) {
  const oldTasks = state.data.tasks;
  state.data.tasks = oldTasks.map((task) =>
    task.id === taskId ? { ...task, status } : task,
  );
  render();
  if (previewMode) return;
  try {
    const updated = await request(`${API_ROOT}/tasks/${encodeURIComponent(taskId)}`, {
      method: 'PATCH',
      headers: {
        'Content-Type': 'application/json',
        'Idempotency-Key': key('task-status'),
      },
      body: JSON.stringify({ status }),
    });
    state.data.tasks = state.data.tasks.map((task) =>
      task.id === taskId ? updated : task,
    );
  } catch (error) {
    state.data.tasks = oldTasks;
    state.error = error.message;
  }
  render();
}

async function toggleFavorite(snippetId) {
  const snippets = state.data.snippets || [];
  const current = snippets.find((item) => item.id === snippetId);
  if (!current) return;
  const favorite = !current.favorite;
  const oldSnippets = snippets;
  state.data.snippets = snippets.map((item) =>
    item.id === snippetId ? { ...item, favorite } : item,
  );
  render();
  if (previewMode) return;
  try {
    const updated = await request(
      `${API_ROOT}/snippets/${encodeURIComponent(snippetId)}/favorite`,
      {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ favorite }),
      },
    );
    state.data.snippets = state.data.snippets.map((item) =>
      item.id === snippetId ? updated : item,
    );
  } catch (error) {
    state.data.snippets = oldSnippets;
    state.error = error.message;
  }
  render();
}

async function deleteSnippet(snippetId) {
  const oldSnippets = state.data.snippets || [];
  state.data.snippets = oldSnippets.filter((item) => item.id !== snippetId);
  location.hash = 'snippets';
  if (previewMode) return;
  try {
    await request(`${API_ROOT}/snippets/${encodeURIComponent(snippetId)}`, {
      method: 'DELETE',
    });
  } catch (error) {
    state.data.snippets = oldSnippets;
    state.error = error.message;
    render();
  }
}

async function createSnippet(form) {
  const data = new FormData(form);
  const input = {
    title: String(data.get('title') || '').trim(),
    language: String(data.get('language') || '').trim(),
    description: String(data.get('description') || '').trim(),
    content: String(data.get('content') || ''),
    source: 'MANUAL',
    tags: [],
  };
  if (!input.title || !input.language || !input.content.trim()) {
    state.error = '标题、语言和代码不能为空。';
    render();
    return;
  }
  state.pending = true;
  state.error = '';
  render();
  try {
    const created = previewMode
      ? {
          ...input,
          id: key('preview-snippet'),
          sourceUrl: null,
          favorite: false,
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
        }
      : await request(`${API_ROOT}/snippets`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Idempotency-Key': key('snippet-create'),
          },
          body: JSON.stringify(input),
        });
    state.data.snippets = [created, ...(state.data.snippets || [])];
    state.snippetComposer = false;
  } catch (error) {
    state.error = error.message;
  } finally {
    state.pending = false;
    render();
  }
}

async function disconnectGitHub() {
  if (previewMode) return;
  state.pending = true;
  state.error = '';
  render();
  try {
    await request(`${API_ROOT}/connection`, { method: 'DELETE' });
    state.connection = null;
    state.data = {};
    state.mode = 'disconnected';
    state.disconnectConfirm = false;
  } catch (error) {
    state.error = error.message;
  } finally {
    state.pending = false;
    render();
  }
}

document.addEventListener('click', async (event) => {
  const target = event.target.closest('button, a');
  if (!target) return;
  const view = target.dataset.view;
  if (view && VIEWS.includes(view)) {
    event.preventDefault();
    location.hash = view;
    return;
  }
  if (target.dataset.action === 'sync') {
    await syncNow();
    return;
  }
  if (target.dataset.action === 'disconnect') {
    state.disconnectConfirm = true;
    render();
    return;
  }
  if (target.dataset.action === 'cancel-disconnect') {
    state.disconnectConfirm = false;
    render();
    return;
  }
  if (target.dataset.action === 'confirm-disconnect') {
    await disconnectGitHub();
    return;
  }
  if (target.dataset.action === 'new-snippet') {
    state.snippetComposer = true;
    render();
    return;
  }
  if (target.dataset.action === 'close-snippet') {
    state.snippetComposer = false;
    render();
    return;
  }
  if (target.dataset.activityFilter) {
    state.activityFilter = target.dataset.activityFilter;
    render();
    return;
  }
  if (target.dataset.repository && target.dataset.path) {
    await loadRepositoryPath(target.dataset.repository, target.dataset.path);
    return;
  }
  if (target.dataset.scroll) {
    document
      .getElementById(target.dataset.scroll)
      ?.scrollIntoView({ behavior: 'smooth', block: 'start' });
    return;
  }
  if (target.dataset.favorite) {
    await toggleFavorite(target.dataset.favorite);
    return;
  }
  if (target.dataset.deleteSnippet) {
    await deleteSnippet(target.dataset.deleteSnippet);
    return;
  }
  if (target.dataset.task && target.dataset.status) {
    await moveTask(target.dataset.task, target.dataset.status);
    return;
  }
  if (target.dataset.copy) {
    const snippet = (state.data.snippets || []).find(
      (item) => item.id === target.dataset.copy,
    );
    if (!snippet) return;
    try {
      await navigator.clipboard.writeText(snippet.content);
      target.textContent = '已复制';
    } catch {
      state.error = '浏览器未允许复制，请手动选择代码。';
      render();
    }
    return;
  }
  if (target.hasAttribute('data-copy-content')) {
    const content = state.repositoryFile?.content;
    if (typeof content !== 'string') return;
    try {
      await navigator.clipboard.writeText(content);
      target.textContent = '已复制';
    } catch {
      state.error = '浏览器未允许复制，请手动选择代码。';
      render();
    }
  }
});

document.addEventListener('submit', async (event) => {
  if (!(event.target instanceof HTMLFormElement) || event.target.id !== 'snippet-form')
    return;
  event.preventDefault();
  await createSnippet(event.target);
});

document.addEventListener('input', (event) => {
  if (!(event.target instanceof HTMLInputElement)) return;
  if (event.target.id === 'global-search' || event.target.dataset.filter) {
    state.search = event.target.value.slice(0, 160);
    render();
    const input = document.querySelector(
      event.target.id
        ? `#${event.target.id}`
        : `[data-filter="${event.target.dataset.filter}"]`,
    );
    input?.focus();
    input?.setSelectionRange(state.search.length, state.search.length);
  }
});

window.addEventListener('hashchange', async () => {
  state.route = currentRoute();
  state.view = currentView();
  state.search = '';
  await loadRouteDetail();
  render();
});
void loadConnectedData();
