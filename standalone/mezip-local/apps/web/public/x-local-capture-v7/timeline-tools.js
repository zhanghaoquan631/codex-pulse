(() => {
  const actions = [
    ['all', '全部'], ['like', '❤️ 点赞'], ['bookmark', '🔖 收藏'],
    ['unlike', '取消点赞'], ['unbookmark', '取消收藏'],
    ['follow', '关注'], ['unfollow', '取消关注'], ['viewed', '👁 浏览'],
    ['opened', '↗ 打开'], ['share_to_mezip', '📤 分享至 ME.zip'],
    ['copied_link', '🔗 复制 / 收集链接'], ['manual_save', '手动保存'],
    ['add_note', '添加备注'], ['notes', '带备注'],
  ];
  const recovered = (item) => item.recovered === true || item.captureMethod === 'VISIBLE_STATE';
  const time = (item) => recovered(item) ? (item.observedAt || item.capturedAt) : item.capturedAt;
  const label = (item) => recovered(item)
    ? `补收${item.actionType === 'like' ? '已点赞' : item.actionType === 'bookmark' ? '已收藏' : '已记录状态'}`
    : (actions.find(([key]) => key === item.actionType)?.[1] || item.actionType || 'X 记录');
  function matches(item, filter) {
    if (filter === 'all') return true;
    if (filter === 'notes') return Boolean(item.note?.trim());
    if (filter === 'saved_links') return ['copied_link', 'manual_save'].includes(item.actionType);
    return item.actionType === filter;
  }
  function contentFor(item, content) {
    const id = item.postId || /\/status\/(\d+)/.exec(item.postUrl || '')?.[1];
    return content.find((entry) => entry.postUrl === item.postUrl || (id && (entry.postId || /\/status\/(\d+)/.exec(entry.postUrl || '')?.[1]) === id));
  }
  function searchText(item, content = []) {
    const cached = contentFor(item, content) || {};
    return [label(item), item.postUrl, item.authorHandle, item.pageTitle, item.note,
      cached.pageTitle, cached.textExcerpt, cached.authorHandle, ...(item.tags || [])].filter(Boolean).join(' ').toLocaleLowerCase();
  }
  function periodStart(period) {
    const now = new Date();
    if (period === 'today') return new Date(now.getFullYear(), now.getMonth(), now.getDate());
    if (period === 'week') return new Date(now.getFullYear(), now.getMonth(), now.getDate() - ((now.getDay() + 6) % 7));
    if (period === 'month') return new Date(now.getFullYear(), now.getMonth(), 1);
    if (period === 'year') return new Date(now.getFullYear(), 0, 1);
    return null;
  }
  async function loadX(api) {
    const events = new Map(), content = new Map(), cursors = new Set();
    let cursor = null;
    for (let page = 0; page < 100; page += 1) {
      const data = await api(`/v1/x/local-capture/timeline?limit=100${cursor ? `&cursor=${encodeURIComponent(cursor)}` : ''}`);
      for (const item of data?.events || []) events.set(item.id || `${item.actionType}|${item.capturedAt}|${item.postUrl}`, item);
      for (const item of data?.content || []) content.set(item.id || item.postUrl, item);
      cursor = data?.nextCursor == null ? null : String(data.nextCursor);
      if (!cursor) return { events: [...events.values()], content: [...content.values()], truncated: false };
      if (cursors.has(cursor)) throw new Error('X 时间轴分页游标重复，请重新读取。');
      cursors.add(cursor);
    }
    return { events: [...events.values()], content: [...content.values()], truncated: true };
  }
  window.TimelineTools = { actions, recovered, time, label, matches, contentFor, searchText, periodStart, loadX };
})();
