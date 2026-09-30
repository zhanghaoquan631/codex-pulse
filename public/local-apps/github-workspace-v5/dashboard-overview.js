(() => {
  const API_ROOT = '/v1/github-workspace';
  let loading = false;
  let rendered = false;

  const escapeHtml = (value) =>
    String(value ?? '').replace(
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
  const relativeTime = (value) => {
    const date = new Date(value);
    if (Number.isNaN(date.valueOf())) return '时间未知';
    const minutes = Math.max(0, Math.round((Date.now() - date.valueOf()) / 60000));
    if (minutes < 60) return `${minutes} 分钟前`;
    if (minutes < 1440) return `${Math.floor(minutes / 60)} 小时前`;
    return `${Math.floor(minutes / 1440)} 天前`;
  };
  const number = (value) =>
    Number.isFinite(Number(value)) ? Number(value).toLocaleString('zh-CN') : '—';
  const api = async (path) => {
    const response = await fetch(path, {
      credentials: 'same-origin',
      cache: 'no-store',
      headers: { Accept: 'application/json' },
    });
    if (!response.ok) throw new Error(`请求失败（${response.status}）`);
    return response.json();
  };
  const valueOrDash = (value) =>
    value === undefined || value === null ? '—' : number(value);

  const heatmap = (days) => {
    if (!Array.isArray(days) || days.length === 0)
      return '<div class="v5-empty">GitHub 未返回贡献数据。</div>';
    return `<div class="v5-heatmap" aria-label="贡献热力图">${days
      .slice(-126)
      .map(
        (day) =>
          `<span data-level="${Math.min(4, Number(day.count) || 0)}" title="${escapeHtml(day.date)} · ${escapeHtml(day.count)} 次"></span>`,
      )
      .join('')}</div>`;
  };
  const activity = (rows) => {
    if (!Array.isArray(rows) || rows.length === 0)
      return '<div class="v5-empty">暂无可显示的 GitHub 活动。</div>';
    return `<div class="v5-activity-list">${rows
      .slice(0, 4)
      .map(
        (item) =>
          `<a href="${escapeHtml(item.htmlUrl || 'https://github.com/')}" target="_blank" rel="noreferrer noopener"><span class="v5-activity-icon">${item.kind === 'PUSH' ? '⇧' : item.kind === 'ISSUE' ? '!' : '↗'}</span><span><strong>${escapeHtml(item.action || 'GitHub 活动')}</strong><small>${escapeHtml(item.repositoryFullName || 'GitHub')} · ${escapeHtml(relativeTime(item.occurredAt))}</small></span></a>`,
      )
      .join('')}</div>`;
  };
  const moduleCard = (href, icon, tone, title, count, detail) =>
    `<a class="v5-module-card ${tone}" href="${href}"><span class="v5-module-icon">${icon}</span><span class="v5-module-copy"><strong>${escapeHtml(title)}</strong><small>${escapeHtml(detail)}</small><em>${escapeHtml(valueOrDash(count))}</em></span><span class="v5-arrow" aria-hidden="true">→</span></a>`;

  const render = async (view) => {
    if (loading || location.hash.replace(/^#\/?/u, '').split('/')[0] !== 'overview')
      return;
    if (rendered && view.querySelector('[data-v5-dashboard]')) return;
    rendered = false;
    loading = true;
    try {
      const [
        connection,
        overview,
        repositories,
        issues,
        pulls,
        snippets,
        tasks,
        activities,
      ] = await Promise.all([
        api(`${API_ROOT}/connection`),
        api(`${API_ROOT}/overview`),
        api(`${API_ROOT}/repositories?limit=100`),
        api(`${API_ROOT}/issues?state=ALL`),
        api(`${API_ROOT}/pull-requests?state=ALL`),
        api(`${API_ROOT}/snippets`),
        api(`${API_ROOT}/tasks`),
        api(`${API_ROOT}/activity`),
      ]);
      const repos = Array.isArray(repositories)
        ? repositories
        : repositories?.items || [];
      const issueRows = Array.isArray(issues) ? issues : [];
      const pullRows = Array.isArray(pulls) ? pulls : [];
      const snippetRows = Array.isArray(snippets) ? snippets : [];
      const taskRows = Array.isArray(tasks) ? tasks : [];
      const activityRows = Array.isArray(activities) ? activities : [];
      const contributions = overview?.contributions || {};
      const pending = taskRows.filter((task) => task.status !== 'DONE').length;
      const favoriteRepos = repos.slice(0, 3);
      const languageEntries = Object.entries(overview?.languageDistribution || {})
        .sort((a, b) => Number(b[1]) - Number(a[1]))
        .slice(0, 4);
      const languageLine = languageEntries.length
        ? languageEntries
            .map(([language, value]) => `${escapeHtml(language)} ${escapeHtml(value)}%`)
            .join(' · ')
        : '暂无语言统计';
      view.innerHTML = `<div class="v5-dashboard" data-v5-dashboard>
        <section class="v5-hero surface"><div class="v5-hero-art" aria-hidden="true"><div class="v5-github-cube">●</div><span class="v5-orbit o1"></span><span class="v5-orbit o2"></span></div><div class="v5-hero-copy"><p class="v5-eyebrow">ME.zip · 开发工作台</p><h2>GitHub<span>你的开发者中心</span></h2><p>连接你的 GitHub 账号，同步仓库、代码片段与项目动态。</p><div class="v5-capabilities"><span>◌　同步仓库</span><span>⌘　代码片段</span><span>◷　问题与合并请求</span><span>⌁　统计分析</span></div></div><div class="v5-code-art" aria-hidden="true"><i></i><i></i><i></i><b>const workspace = await github()<br/>workspace.sync({ readOnly: true })</b></div></section>
        <section class="v5-section-heading"><div><p class="v5-eyebrow">WORKSPACE MODULES</p><h2>功能模块</h2></div><button class="v5-sync-button" type="button" data-action="sync" ${connection?.status !== 'CONNECTED' ? 'disabled' : ''}>${connection?.status === 'CONNECTED' ? '↻ 立即同步' : '等待连接'}</button></section>
        <section class="v5-module-grid" aria-label="GitHub 功能模块">${moduleCard('#repositories', '▣', 'purple', '仓库', repos.length, '浏览和管理你的仓库')}${moduleCard('#snippets', '</>', 'green', '代码片段', snippetRows.length, '管理你的代码片段')}${moduleCard('#issues', '◉', 'orange', '问题与需求', issueRows.length, '查看项目问题与需求')}${moduleCard('#pull-requests', '⌁', 'blue', '合并请求', pullRows.length, '查看 PR 与代码合并')}</section>
        <section class="v5-dashboard-grid"><div class="surface v5-panel"><div class="v5-panel-head"><h3>最近活动</h3><a href="#activity">查看全部 →</a></div>${activity(activityRows)}</div><div class="surface v5-panel"><div class="v5-panel-head"><h3>贡献热力图</h3><span>今年贡献 ${escapeHtml(valueOrDash(contributions.total))} 次</span></div>${heatmap(contributions.days)}<div class="v5-stats"><span><b>${escapeHtml(valueOrDash(contributions.currentStreak))}</b>连续天数</span><span><b>${escapeHtml(valueOrDash(contributions.longestStreak))}</b>最长连续</span><span><b>${escapeHtml(valueOrDash(overview?.commitCount))}</b>提交</span><span><b>${escapeHtml(valueOrDash(overview?.pullRequestCount))}</b>PR</span></div></div></section>
        <section class="surface v5-panel v5-repos-panel"><div class="v5-panel-head"><h3>常用仓库</h3><a href="#repositories">查看全部 →</a></div>${favoriteRepos.length ? `<div class="v5-repo-list">${favoriteRepos.map((repo) => `<a href="#repositories/${encodeURIComponent(repo.owner)}/${encodeURIComponent(repo.name)}"><span class="v5-repo-dot"></span><span><strong>${escapeHtml(repo.name)}</strong><small>${escapeHtml(repo.visibility || (repo.private ? 'PRIVATE' : 'PUBLIC'))} · ${escapeHtml(repo.language || 'Other')}</small></span><em>★ ${escapeHtml(repo.stars ?? 0)}</em></a>`).join('')}</div>` : '<div class="v5-empty">暂时没有可访问的仓库。</div>'}<p class="v5-language-line">语言占比：${languageLine}</p></section>
      </div>`;
      rendered = true;
    } catch {
      // The base workspace keeps its truthful loading/error state when the enhanced overview cannot load.
    } finally {
      loading = false;
    }
  };
  const observe = () => {
    const view = document.querySelector('#workspace-view');
    if (!view) return;
    const currentRoute = location.hash.replace(/^#\/?/u, '').split('/')[0];
    if (currentRoute !== 'overview') {
      rendered = false;
      return;
    }
    void render(view);
  };
  new MutationObserver(observe).observe(document.body, {
    childList: true,
    subtree: true,
  });
  window.addEventListener('hashchange', () => {
    rendered = false;
    loading = false;
    setTimeout(observe, 0);
  });
  observe();
})();
