(() => {
  const API = window.localStorage.getItem('mezip.x.local.capture.api') || 'http://127.0.0.1:4319';
  const T = window.TimelineTools;
  const state = { events: [], filter: 'all', action: 'all', query: '', period: 'all', sort: 'newest', loading: true, error: null, warnings: [], request: 0 };
  const $ = (selector) => document.querySelector(selector);
  const escapeHtml = (value) => String(value ?? '').replace(/[&<>'"]/g, (character) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&#39;', '"': '&quot;' }[character]));
  const safeUrl = (value) => { try { const url = new URL(value); return ['http:', 'https:'].includes(url.protocol) ? url.href : ''; } catch { return ''; } };
  const formatDate = (value) => { const date = new Date(value); return Number.isNaN(date.getTime()) ? '时间未知' : date.toLocaleString('zh-CN', { dateStyle: 'medium', timeStyle: 'short' }); };
  const formatSeconds = (value) => { const seconds = Math.max(0, Math.floor(Number(value) || 0)); const hours = Math.floor(seconds / 3600); const minutes = Math.floor((seconds % 3600) / 60); const rest = seconds % 60; return hours ? `${hours}:${String(minutes).padStart(2, '0')}:${String(rest).padStart(2, '0')}` : `${String(minutes).padStart(2, '0')}:${String(rest).padStart(2, '0')}`; };
  const sources = [['all', '全部来源'], ['X', '◎ 浏览器行为'], ['WATCH', '▶ 观看进度'], ['RESOURCE_SAVED', '▤ 保存资源'], ['RESOURCE_OPENED', '↗ 打开资源']];
  const sourceLabel = Object.fromEntries(sources);
  const resourceLabel = { WEBPAGE: '网页', ARTICLE: '文章', CODE: '代码', X_LINK: 'X 链接' };
  function browserPlatform(item) {
    const labels = { X: 'X', DOUYIN: '抖音', BILIBILI: '哔哩哔哩', WECHAT_WEB: '微信', EDGE: 'Edge' };
    try {
      const host = new URL(item.postUrl).hostname.toLowerCase();
      if (/(^|\.)(douyin\.com|iesdouyin\.com)$/u.test(host)) return '抖音';
      if (/(^|\.)(bilibili\.com|b23\.tv)$/u.test(host)) return '哔哩哔哩';
      if (/(^|\.)(weixin\.qq\.com|wechat\.com|wx\.qq\.com)$/u.test(host)) return '微信';
      if (/(^|\.)(x\.com|twitter\.com)$/u.test(host)) return 'X';
      return item.platform && item.platform !== 'X' ? labels[item.platform] || item.platform : host || '网页';
    } catch { return labels[item.platform] || item.platform || '网页'; }
  }
  async function api(path) { const response = await fetch(`${API}${path}`, { credentials: 'include' }); const payload = await response.json().catch(() => ({})); if (!response.ok) throw new Error(payload?.error?.message || `本地服务错误（${response.status}）`); return payload.data; }
  function normalizeX(timeline) {
    return (timeline.events || []).filter((item) => item?.capturedAt).map((item) => {
      const cached = T.contentFor(item, timeline.content || []) || {};
      return { id: `X-${item.id}`, kind: 'X', at: T.time(item), title: T.label(item),
        detail: [...new Set([cached.textExcerpt, cached.pageTitle || item.pageTitle, item.note].filter(Boolean))].join('\n') || '没有附加文字，原始链接仍保留。',
        author: item.authorHandle || cached.authorHandle || '', url: item.postUrl, platform: browserPlatform(item), icon: browserPlatform(item) === 'X' ? '𝕏' : '◎',
        actionType: item.actionType, note: item.note, recovered: T.recovered(item), search: T.searchText(item, timeline.content || []) };
    });
  }
  function normalizeWatch(items) {
    return items.filter((item) => item?.lastWatchedAt).map((item) => ({ id: `WATCH-${item.id}`, kind: 'WATCH', at: item.lastWatchedAt,
      title: `${item.status === 'COMPLETED' ? '完成观看' : '更新观看进度'} · ${item.title || '未命名视频'}`,
      detail: `${Math.round(Number(item.progressPercent) || 0)}% · ${formatSeconds(item.currentTimeSeconds)} / ${item.durationSeconds > 0 ? formatSeconds(item.durationSeconds) : '时长未知'} · 实际观看 ${formatSeconds(item.totalWatchSeconds)}`,
      author: item.creator || '', url: item.url, platform: item.platform, icon: '▶' }));
  }
  function normalizeResource(item, session) {
    return { id: session ? `OPEN-${session.id || `${item.id}-${session.openedAt}`}` : `SAVE-${item.id}`, kind: session ? 'RESOURCE_OPENED' : 'RESOURCE_SAVED',
      at: session?.openedAt || item.createdAt, title: `${session ? '打开' : '保存'}${resourceLabel[item.resourceType] || '资源'} · ${item.title || '未命名资源'}`,
      detail: session ? '从 ME.zip 明确打开；不表示已阅读完毕。' : item.description || '保存资源；不计作 X 点赞或收藏。',
      author: item.author || '', url: item.url, platform: item.platform, icon: session ? '↗' : '▤' };
  }
  async function load() {
    const request = ++state.request;
    state.loading = true; state.error = null; render();
    const results = await Promise.allSettled([T.loadX(api), api('/v1/watch/records?limit=100'), api('/v1/resources/records')]);
    if (request !== state.request) return;
    const warnings = [], events = [];
    if (results[0].status === 'fulfilled') {
      events.push(...normalizeX(results[0].value));
      if (results[0].value.truncated) warnings.push('浏览器行为已达到单次 10,000 条读取上限，计数只包含本次已读取记录。');
    } else warnings.push(`浏览器行为读取失败：${results[0].reason.message}`);
    if (results[1].status === 'fulfilled') {
      const items = results[1].value?.items || [];
      events.push(...normalizeWatch(items));
      warnings.push(`观看展示最近 ${items.length} 个视频的最后播放进度（接口最多 100 个），不是逐次播放事件，也不计入点赞 / 收藏。`);
    } else warnings.push(`观看进度读取失败：${results[1].reason.message}`);
    if (results[2].status === 'fulfilled') {
      const resources = results[2].value?.items || [];
      let failed = 0;
      for (let offset = 0; offset < resources.length; offset += 6) {
        const batch = await Promise.allSettled(resources.slice(offset, offset + 6).map(async (item) => {
          if (item.createdAt) events.push(normalizeResource(item));
          const detail = await api(`/v1/resources/records/${encodeURIComponent(item.id)}`);
          for (const session of detail?.sessions || []) events.push(normalizeResource(item, session));
        }));
        if (request !== state.request) return;
        failed += batch.filter((result) => result.status === 'rejected').length;
      }
      if (failed) warnings.push(`${failed} 个资源的打开历史读取失败；已保留其保存记录。`);
    } else warnings.push(`资源读取失败：${results[2].reason.message}`);
    state.events = events; state.warnings = warnings;
    state.error = results.every((result) => result.status === 'rejected') ? '本地桥接暂时无法读取，请检查本地服务后重试。' : null;
    const partial = results.some((result) => result.status === 'rejected');
    $('#global-status').textContent = state.error ? '读取失败' : partial ? '部分来源已读取' : '本地桥接已连接';
    $('#global-status').className = `pill ${state.error || partial ? 'pill-muted' : 'pill-green'}`;
    state.loading = false; render();
  }
  function baseEvents() {
    const query = state.query.trim().toLocaleLowerCase(), from = T.periodStart(state.period);
    return state.events.filter((item) => (!from || new Date(item.at) >= from) && (!query || `${item.search || ''} ${item.title} ${item.detail} ${item.author} ${item.url} ${item.platform}`.toLocaleLowerCase().includes(query)));
  }
  function render() {
    $('#global-loading').classList.toggle('hidden', !state.loading);
    $('#global-error').classList.toggle('hidden', state.error === null);
    $('#global-error').innerHTML = state.error ? `<strong>全局行为读取失败</strong><span>${escapeHtml(state.error)}</span><button id="global-retry-inline" class="button button-quiet" type="button">重试</button>` : '';
    $('#global-retry-inline')?.addEventListener('click', () => void load());
    $('#global-retry').disabled = state.loading;
    $('#global-list').classList.toggle('hidden', state.loading || Boolean(state.error));
    $('#global-scope').textContent = state.loading ? '正在读取，计数尚未更新…' : state.warnings.join(' ');
    if (state.loading || state.error) return;
    const base = baseEvents();
    $('#global-filter-tabs').innerHTML = sources.map(([key, label]) => `<button type="button" data-filter="${key}" class="${state.filter === key ? 'active' : ''}" aria-pressed="${state.filter === key}">${label} <span>${base.filter((item) => key === 'all' || item.kind === key).length}</span></button>`).join('');
    $('#global-action-tabs').innerHTML = T.actions.map(([key, label]) => `<button type="button" data-action="${key}" class="${state.action === key ? 'active' : ''}" aria-pressed="${state.action === key}">${key === 'all' ? '不限动作' : label} <span>${base.filter((item) => item.kind === 'X' && T.matches(item, key)).length}</span></button>`).join('');
    $('#global-action-section').classList.toggle('hidden', !['all', 'X'].includes(state.filter));
    const items = base.filter((item) => (state.filter === 'all' || item.kind === state.filter) && (state.action === 'all' || item.kind === 'X' && T.matches(item, state.action)));
    items.sort((a, b) => ((Date.parse(b.at) || 0) - (Date.parse(a.at) || 0)) * (state.sort === 'oldest' ? -1 : 1) || a.id.localeCompare(b.id));
    $('#global-count').textContent = `${items.length} 条匹配 / ${state.events.length} 条已读取`;
    $('#global-list').innerHTML = items.length ? items.map((item) => {
      const url = safeUrl(item.url);
      return `<article class="global-event panel" data-event-id="${escapeHtml(item.id)}" data-action-type="${escapeHtml(item.actionType || '')}"><span class="global-icon ${item.kind.toLowerCase()}" aria-hidden="true">${item.icon}</span><div class="global-event-main"><h3>${escapeHtml(item.title)}</h3>${item.author ? `<p>${escapeHtml(item.author)}</p>` : ''}<p>${escapeHtml(item.detail)}</p>${url ? `<a href="${escapeHtml(url)}" target="_blank" rel="noreferrer">${escapeHtml(url)} ↗</a>` : ''}<div class="global-event-meta"><span class="tag">${escapeHtml(sourceLabel[item.kind])}</span>${item.platform ? `<span class="tag">${escapeHtml(item.platform)}</span>` : ''}${item.recovered ? '<span class="tag">可见状态补收 · 原操作时间未知</span>' : ''}</div></div><time class="global-event-time">${item.recovered ? '观测于 ' : ''}${escapeHtml(formatDate(item.at))}</time></article>`;
    }).join('') : '<div class="empty panel"><strong>暂无符合条件的记录</strong><span>请调整动作、时间或搜索条件；观看记录不会算作点赞或收藏。</span></div>';
  }
  $('#global-filter-tabs').addEventListener('click', (event) => { const button = event.target.closest('[data-filter]'); if (!button) return; state.filter = button.dataset.filter; state.action = 'all'; render(); });
  $('#global-action-section .small-copy').textContent = '浏览器动作 · 计数按时间和搜索条件更新；补收表示观察到的状态，原操作时间未知。';
  $('#global-action-tabs').setAttribute('aria-label', '筛选浏览器动作');
  $('#global-action-tabs').addEventListener('click', (event) => { const button = event.target.closest('[data-action]'); if (!button) return; state.action = button.dataset.action; if (state.action !== 'all') state.filter = 'X'; render(); });
  $('#global-search').addEventListener('input', (event) => { state.query = event.target.value; render(); });
  $('#global-period').addEventListener('change', (event) => { state.period = event.target.value; render(); });
  $('#global-sort').addEventListener('change', (event) => { state.sort = event.target.value; render(); });
  $('#global-retry').addEventListener('click', () => void load());
  void load();
})();
