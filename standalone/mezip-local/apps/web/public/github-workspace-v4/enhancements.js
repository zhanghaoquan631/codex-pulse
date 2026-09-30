(() => {
  const API_ROOT = '/v1/github-workspace';
  let renderedHash = '';
  let loading = false;
  let taskLoading = false;

  const number = (value) => (typeof value === 'number' ? value.toLocaleString('zh-CN') : '—');

  const renderOverviewMetrics = async () => {
    if (loading || !location.hash.replace(/^#\/?/u, '').startsWith('overview')) return;
    const view = document.querySelector('#workspace-view');
    if (!view || view.querySelector('[data-v4-overview]') || renderedHash === location.hash) return;
    loading = true;
    try {
      const response = await fetch(`${API_ROOT}/overview`, {
        credentials: 'same-origin',
        cache: 'no-store',
        headers: { Accept: 'application/json' },
      });
      if (!response.ok) return;
      const overview = await response.json();
      const contributions = overview.contributions || {};
      const panel = document.createElement('section');
      panel.className = 'surface panel v4-overview-panel';
      panel.dataset.v4Overview = 'true';
      panel.innerHTML = `<div class="panel-header"><h2>开发数据总览</h2><span>${overview.stale ? '需要同步' : '已同步'}</span></div><div class="v4-overview-metrics"><div class="v4-overview-metric"><span>连续贡献</span><strong>${number(contributions.currentStreak)} 天</strong></div><div class="v4-overview-metric"><span>最长连续</span><strong>${number(contributions.longestStreak)} 天</strong></div><div class="v4-overview-metric"><span>年度提交</span><strong>${number(overview.commitCount)}</strong></div><div class="v4-overview-metric"><span>年度 PR</span><strong>${number(overview.pullRequestCount)}</strong></div></div><p class="v4-feature-note">仓库详情支持 README、文件、Commit、Branch；Issues 与 Pull Requests 为真实只读数据；任务中心会把 Issue 与 PR 汇入待处理、进行中、待 Review、已完成四列。</p>`;
      view.append(panel);
      renderedHash = location.hash;
    } finally {
      loading = false;
    }
  };

  const renderTaskMetadata = async () => {
    if (taskLoading || !location.hash.replace(/^#\/?/u, '').startsWith('tasks')) return;
    const cards = [...document.querySelectorAll('.task-card')];
    if (!cards.length || cards.some((card) => card.querySelector('[data-v4-task-meta]'))) return;
    taskLoading = true;
    try {
      const response = await fetch(`${API_ROOT}/tasks`, {
        credentials: 'same-origin',
        cache: 'no-store',
        headers: { Accept: 'application/json' },
      });
      if (!response.ok) return;
      const tasks = await response.json();
      const byTitle = new Map((Array.isArray(tasks) ? tasks : []).map((task) => [task.title, task]));
      cards.forEach((card) => {
        const title = card.querySelector('h3')?.textContent?.trim();
        const task = title ? byTitle.get(title) : null;
        if (!task || card.querySelector('[data-v4-task-meta]')) return;
        const details = [
          task.assignee ? `负责人 ${task.assignee}` : '未指派',
          task.dueAt ? `截止 ${new Date(task.dueAt).toLocaleDateString('zh-CN')}` : '无截止日期',
          task.linkedIssue ? `Issue #${task.linkedIssue}` : '',
          task.linkedPullRequest ? `PR #${task.linkedPullRequest}` : '',
        ].filter(Boolean);
        const meta = document.createElement('div');
        meta.className = 'v4-task-meta';
        meta.dataset.v4TaskMeta = 'true';
        meta.textContent = details.join(' · ');
        card.append(meta);
      });
    } finally {
      taskLoading = false;
    }
  };

  const observer = new MutationObserver(() => {
    void renderOverviewMetrics();
    void renderTaskMetadata();
  });
  observer.observe(document.body, { childList: true, subtree: true });
  window.addEventListener('hashchange', () => {
    renderedHash = '';
    void renderOverviewMetrics();
    void renderTaskMetadata();
  });
  void renderOverviewMetrics();
  void renderTaskMetadata();
})();
