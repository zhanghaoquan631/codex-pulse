(() => {
  const API_ROOT = '/v1/github-workspace';
  let loading = false;

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
  const routeIsPullRequests = () =>
    location.hash.replace(/^#\/?/u, '').split('/')[0] === 'pull-requests';
  const read = async (path) => {
    const response = await fetch(path, {
      credentials: 'same-origin',
      cache: 'no-store',
      headers: { Accept: 'application/json' },
    });
    if (!response.ok) throw new Error(`合并请求 读取失败（${response.status}）`);
    return response.json();
  };
  const render = async () => {
    const view = document.querySelector('#workspace-view');
    if (!view || !routeIsPullRequests() || loading) return;
    loading = true;
    view.innerHTML =
      '<section class="surface panel"><div class="loading"><div><div class="spinner"></div>正在读取 合并请求…</div></div></section>';
    try {
      const rows = await read(`${API_ROOT}/pull-requests?state=ALL`);
      const pulls = Array.isArray(rows) ? rows : [];
      view.innerHTML = `<section class="surface panel v5-pulls-panel"><div class="v5-panel-head"><div><p class="v5-eyebrow">来自 GitHub 的真实数据</p><h2>合并请求</h2></div><a class="quiet" href="#tasks">← 返回任务中心</a></div><div class="toolbar"><input type="search" placeholder="搜索 合并请求" data-v5-pr-search /><select data-v5-pr-state><option value="ALL">全部状态</option><option value="OPEN">进行中</option><option value="CLOSED">已关闭</option><option value="MERGED">已合并</option></select></div><div class="v5-pr-list">${pulls.length ? pulls.map((pull) => `<a class="v5-pr-row" href="${escapeHtml(pull.htmlUrl || 'https://github.com/')}" target="_blank" rel="noreferrer noopener" data-state="${escapeHtml(pull.state)}"><span class="v5-pr-icon">↗</span><span><strong>#${escapeHtml(pull.number)} · ${escapeHtml(pull.title)}</strong><small>${escapeHtml(pull.repositoryFullName)} · ${escapeHtml(pull.author || '未知作者')} · ${escapeHtml(pull.reviewState || 'UNKNOWN')}</small></span><em>${escapeHtml(pull.state)}${pull.draft ? ' · Draft' : ''}</em></a>`).join('') : '<div class="v5-empty">GitHub 尚未返回 合并请求。</div>'}</div></section>`;
      const search = view.querySelector('[data-v5-pr-search]');
      const state = view.querySelector('[data-v5-pr-state]');
      const apply = () =>
        view.querySelectorAll('.v5-pr-row').forEach((row) => {
          const text = row.textContent?.toLowerCase() || '';
          const query = search?.value.toLowerCase() || '';
          const wanted = state?.value || 'ALL';
          row.hidden =
            Boolean(query && !text.includes(query)) ||
            (wanted !== 'ALL' && row.dataset.state !== wanted);
        });
      search?.addEventListener('input', apply);
      state?.addEventListener('change', apply);
    } catch (error) {
      view.innerHTML = `<section class="surface empty-state"><div><strong>合并请求 暂时不可用</strong><span>${escapeHtml(error instanceof Error ? error.message : '请稍后重试。')}</span></div><button class="quiet" type="button" data-v5-pr-retry>重试</button></section>`;
      view.querySelector('[data-v5-pr-retry]')?.addEventListener('click', () => {
        loading = false;
        void render();
      });
    } finally {
      loading = false;
    }
  };
  document.addEventListener('click', (event) => {
    const link = event.target.closest('a[href="#pull-requests"]');
    if (!link) return;
    event.preventDefault();
    location.hash = 'pull-requests';
  });
  window.addEventListener('hashchange', () => {
    loading = false;
    setTimeout(render, 0);
  });
  // The base workspace renders asynchronously. Observe its mount point so a
  // direct deep link to #pull-requests is rendered after the shell finishes.
  new MutationObserver(() => {
    if (routeIsPullRequests() && !loading) void render();
  }).observe(document.body, { childList: true, subtree: true });
  setTimeout(render, 0);
})();
