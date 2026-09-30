(function () {
  'use strict';

  const API = localStorage.getItem('mezip.x.local.capture.api') || 'http://127.0.0.1:4319';
  const CAPTURE_KEY = 'mezip.x.local.capture.browser.v3';
  const RESOURCE_KEY = 'mezip.resource.records.v1.browser-local';
  const WATCH_KEY = 'mezip.x.local.capture.v9.watch.v1';
  const WATCH_HIDDEN_KEY = 'mezip.x.local.capture.v12.watch-hidden.v1';
  // Keep the last bridge response separately.  The V9 key intentionally holds
  // only browser-local records, so writing a bridge record there used to make
  // an actively watched film disappear after a refresh while the service was
  // temporarily unavailable.
  const WATCH_BRIDGE_CACHE_KEY = 'mezip.x.local.capture.v12.watch.bridge-cache.v1';
  const LINK_KEY = 'mezip.x-link-archive.shared.v1';
  const LEGACY_LINK_KEY = 'mezip.x-link-archive.v1';
  const VALID_ROUTES = new Set(['overview', 'timeline', 'following', 'links', 'watch', 'library', 'interest', 'settings']);
  const TYPE_LABEL = { X_LINK: '帖子', WEBPAGE: '网页', ARTICLE: '文章', CODE: '代码', APP: '应用', VIDEO: '视频', MOVIE: '电影', X: 'X' };
  const ACTION_LABEL = { like: '点赞', liked: '点赞', unlike: '取消点赞', bookmark: '收藏', bookmarked: '收藏', unbookmark: '取消收藏', viewed: '浏览', opened: '打开内容', copied_link: '复制链接', share_to_mezip: '分享到 ME.zip', manual_save: '主动保存', follow: '关注', followed: '关注', unfollow: '取消关注', unfollowed: '取消关注' };
  const defaultSettings = { enabled: true, captureSharedLinks: true, watchCapture: true, savePageMetadata: true };
  let revealObserver = null;
  let pendingScrollRoute = '';
  let pendingScrollRouteTimer = 0;
  let activeScrollRoute = '';
  let scrollFrame = 0;
  const state = {
    events: [], resources: [], savedLinks: [], watch: [], library: [], following: [], hiddenEventIds: new Set(), hiddenWatchIds: new Set(),
    settings: { ...defaultSettings }, bridgeReady: false,
    filters: { event: 'all', following: 'all', link: 'all', watch: 'all', library: 'all' },
    queries: { timeline: '', following: '', links: '', watch: '', library: '' },
    selectedInterestTag: ''
  };

  const $ = (selector, parent = document) => parent.querySelector(selector);
  const $$ = (selector, parent = document) => Array.from(parent.querySelectorAll(selector));
  const now = () => new Date().toISOString();
  const uid = (prefix) => `${prefix}_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;
  const read = (key, fallback) => { try { const value = JSON.parse(localStorage.getItem(key)); return value ?? fallback; } catch { return fallback; } };
  const write = (key, value) => localStorage.setItem(key, JSON.stringify(value));
  const text = (value) => String(value || '').trim();
  const escapeHtml = (value) => text(value).replace(/[&<>'"]/g, (char) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&#39;', '"': '&quot;' })[char]);
  const tags = (value) => Array.from(new Set((Array.isArray(value) ? value : text(value).split(/[,，\n]/)).map(text).filter(Boolean))).slice(0, 12);
  const dateValue = (value) => { const parsed = new Date(value || 0).getTime(); return Number.isFinite(parsed) ? parsed : 0; };
  const latestFirst = (items, field = 'updatedAt') => [...items].sort((a, b) => dateValue(b[field] || b.createdAt || b.capturedAt) - dateValue(a[field] || a.createdAt || a.capturedAt));
  const formatDate = (value) => { const parsed = new Date(value || Date.now()); return Number.isNaN(parsed.getTime()) ? '时间未知' : new Intl.DateTimeFormat('zh-CN', { month: 'numeric', day: 'numeric', hour: '2-digit', minute: '2-digit' }).format(parsed); };
  const formatDuration = (seconds) => { const total = Math.max(0, Number(seconds) || 0); if (!total) return '未填写时长'; const h = Math.floor(total / 3600); const m = Math.floor((total % 3600) / 60); const s = Math.floor(total % 60); return h ? `${h}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}` : `${m}:${String(s).padStart(2, '0')}`; };
  const route = () => { const candidate = location.hash.replace(/^#/, '') || 'overview'; return VALID_ROUTES.has(candidate) ? candidate : 'overview'; };
  const normalizeUrl = (value) => { const url = new URL(text(value)); if (!/^https?:$/.test(url.protocol)) throw new Error('仅支持 http 或 https 链接。'); return url.toString(); };
  const sourceUrl = (item) => text(item?.profileUrl || item?.sourceUrl || item?.url || item?.postUrl || item?.link || '');
  const kindOf = (item) => text(item?.resourceType || item?.contentType || item?.sourceType || item?.type || 'X_LINK').toUpperCase();
  function knownPlatformFromUrl(value) {
    try {
      const host = new URL(value).hostname.toLowerCase();
      if (/(^|\.)x\.com$|(^|\.)twitter\.com$/u.test(host)) return 'X';
      if (/(^|\.)(douyin|iesdouyin)\.com$/u.test(host)) return '抖音网页版';
      if (/(^|\.)bilibili\.com$/u.test(host)) return '哔哩哔哩网页版';
      if (host === 'mp.weixin.qq.com') return '微信文章页';
      if (host === 'channels.weixin.qq.com') return '微信视频号网页版';
    } catch { /* The original source can be unavailable for an older record. */ }
    return '';
  }
  function platformOf(item) {
    const saved = text(item?.platform || item?.sourcePlatform || item?.domain || item?.provider || '');
    const detected = knownPlatformFromUrl(sourceUrl(item));
    const labels = { DOUYIN: '抖音网页版', BILIBILI: '哔哩哔哩网页版' };
    const normalised = labels[saved] || saved;
    // The first version of the local bridge labelled every event as X. Keep a
    // user-provided source, but correct that legacy label when the real URL is
    // from Douyin or WeChat web.
    if (detected && (!normalised || normalised === 'X' || normalised === '未知来源')) return detected;
    return normalised || detected || '未知来源';
  }
  const titleOf = (item) => text(item?.title || item?.pageTitle || item?.content || item?.postText || item?.sourceTitle || item?.url || '未命名内容');
  const authorOf = (item) => text(item?.author || item?.authorName || item?.creator || item?.publisher || item?.profileName || item?.authorHandle || item?.handle || '');
  const descriptionOf = (item) => text(item?.description || item?.note || item?.purpose || item?.content || item?.postText || '');
  const safeUrl = (value) => { try { return normalizeUrl(value); } catch { return ''; } };
  const unique = (items, key) => {
    const seen = new Set();
    return items.filter((item) => { const id = key(item); if (!id || seen.has(id)) return false; seen.add(id); return true; });
  };
  const recordTimestamp = (item) => Math.max(dateValue(item?.updatedAt), dateValue(item?.lastWatchedAt), dateValue(item?.capturedAt), dateValue(item?.createdAt));
  const placeholder = (message) => `<div class="empty-state">${escapeHtml(message)}</div>`;

  function toast(message, mode = '') {
    const old = $('.toast'); if (old) old.remove();
    const node = document.createElement('div'); node.className = `toast ${mode}`; node.textContent = message; document.body.appendChild(node);
    window.setTimeout(() => node.remove(), 3400);
  }

  function localCapture() { return read(CAPTURE_KEY, {}); }
  function persistCapture() {
    const current = localCapture();
    write(CAPTURE_KEY, { ...current, events: state.events, privateLibrary: state.library, following: state.following, dismissedEventIds: [...state.hiddenEventIds], settings: { ...(current.settings || {}), ...state.settings } });
  }
  function persistResources() { write(RESOURCE_KEY, state.resources); }
  function persistWatch() { write(WATCH_KEY, state.watch.filter((item) => item.origin === 'V9_LOCAL')); }
  function watchIdentity(item) { return safeUrl(sourceUrl(item)) || text(item?.contentKey) || `${titleOf(item)}:${kindOf(item)}`; }
  function persistBridgeWatchCache() { write(WATCH_BRIDGE_CACHE_KEY, state.watch.filter((item) => item.origin === 'BRIDGE')); }
  function persistLinks() { write(LINK_KEY, state.savedLinks); }

  function asResource(link) {
    const url = safeUrl(link.url || link.sourceUrl || link.postUrl);
    if (!url) return null;
    return {
      id: text(link.id) || uid('link'), resourceType: kindOf(link), title: titleOf(link), platform: platformOf(link),
      author: authorOf(link), description: descriptionOf(link), note: text(link.note || link.purpose), tags: tags(link.tags), autoTags: tags(link.autoTags), tagMode: text(link.tagMode),
      sourceUrl: url, url, createdAt: link.createdAt || now(), updatedAt: link.updatedAt || link.createdAt || now(), origin: link.origin || 'SHARED_LINK'
    };
  }
  function asWatch(item, origin = 'BRIDGE') {
    const url = safeUrl(item.url || item.sourceUrl || item.postUrl);
    const progress = Math.max(0, Math.min(100, Number(item.progressPercent ?? item.progress ?? 0) || 0));
    const duration = Math.max(0, Number(item.durationSeconds || item.duration || 0) || 0);
    return {
      id: text(item.id) || uid('watch'), origin, contentKey: text(item.contentKey) || url, contentType: kindOf(item) === 'EPISODE' ? 'VIDEO' : (kindOf(item) === 'MOVIE' ? 'MOVIE' : 'VIDEO'),
      title: titleOf(item), platform: platformOf(item), domain: text(item.domain) || (() => { try { return url ? new URL(url).hostname : ''; } catch { return ''; } })(), videoId: text(item.videoId) || null, creator: authorOf(item), subtitle: text(item.subtitle) || null, url, sourceUrl: url,
      note: descriptionOf(item), tags: tags(item.tags), autoTags: tags(item.autoTags), tagMode: text(item.tagMode), progressPercent: progress,
      durationSeconds: duration, currentTimeSeconds: Math.max(0, Number(item.currentTimeSeconds || duration * progress / 100 || 0)),
      status: text(item.status) || (progress >= 99 ? 'COMPLETED' : 'IN_PROGRESS'), firstWatchedAt: item.firstWatchedAt || item.createdAt || now(), lastWatchedAt: item.lastWatchedAt || item.updatedAt || item.createdAt || now(), createdAt: item.createdAt || now(), updatedAt: item.updatedAt || item.lastWatchedAt || now(), metadata: item.metadata || {}
    };
  }
  function loadLocal() {
    const capture = localCapture();
    state.hiddenEventIds = new Set(Array.isArray(capture.dismissedEventIds) ? capture.dismissedEventIds : []);
    state.hiddenWatchIds = new Set(Array.isArray(read(WATCH_HIDDEN_KEY, [])) ? read(WATCH_HIDDEN_KEY, []) : []);
    state.events = (Array.isArray(capture.events) ? capture.events : []).filter((item) => !state.hiddenEventIds.has(eventIdentity(item)));
    state.library = Array.isArray(capture.privateLibrary) ? capture.privateLibrary : [];
    state.following = Array.isArray(capture.following) ? capture.following : [];
    state.settings = { ...defaultSettings, ...(capture.settings || {}) };
    state.resources = Array.isArray(read(RESOURCE_KEY, [])) ? read(RESOURCE_KEY, []) : [];
    state.savedLinks = unique([...(Array.isArray(read(LINK_KEY, [])) ? read(LINK_KEY, []) : []), ...(Array.isArray(read(LEGACY_LINK_KEY, [])) ? read(LEGACY_LINK_KEY, []) : [])], (item) => safeUrl(item.url || item.sourceUrl || item.postUrl) || item.id);
    const localWatch = (Array.isArray(read(WATCH_KEY, [])) ? read(WATCH_KEY, []) : []).map((item) => asWatch(item, 'V9_LOCAL'));
    const cachedBridgeWatch = (Array.isArray(read(WATCH_BRIDGE_CACHE_KEY, [])) ? read(WATCH_BRIDGE_CACHE_KEY, []) : []).map((item) => asWatch(item, 'BRIDGE'));
    state.watch = mergeRemote(localWatch, cachedBridgeWatch, watchIdentity).filter((item) => !state.hiddenWatchIds.has(watchIdentity(item)));
    const sharedResources = state.savedLinks.map(asResource).filter(Boolean);
    state.resources = unique([...state.resources, ...sharedResources], (item) => safeUrl(sourceUrl(item)) || item.id);
    render();
  }

  function mergeRemote(items, remote, key) {
    const records = new Map();
    [...(Array.isArray(items) ? items : []), ...(Array.isArray(remote) ? remote : [])].forEach((item) => {
      const identity = text(key(item)); if (!identity) return;
      const previous = records.get(identity);
      // The remote list is evaluated second: with equal timestamps it wins, so
      // an old browser cache cannot hide newer player progress from the bridge.
      if (!previous || recordTimestamp(item) >= recordTimestamp(previous)) records.set(identity, item);
    });
    return [...records.values()];
  }
  async function fetchJson(path) {
    const response = await fetch(`${API}${path}`, { headers: { Accept: 'application/json' }, credentials: 'omit' });
    if (!response.ok) throw new Error(`本机服务返回 ${response.status}`);
    return response.json();
  }
  async function sendJson(path, method, body) {
    const response = await fetch(`${API}${path}`, { method, headers: { Accept: 'application/json', 'Content-Type': 'application/json' }, credentials: 'omit', body: JSON.stringify(body) });
    if (!response.ok) throw new Error(`本机服务返回 ${response.status}`);
    return response.json();
  }
  // The loopback bridge returns `{ data: ... }`, while older browser-local
  // versions used the payload directly.  Accept both shapes so a capture made
  // in Edge is immediately visible here instead of being mistaken for an
  // empty history.
  const bridgeData = (payload) => payload?.data ?? payload ?? {};
  let bridgeRefreshTimer = null;
  let watchRefreshInFlight = false;
  async function hydrateBridge() {
    const status = $('#bridge-state');
    status.textContent = '正在读取本机服务…'; status.className = 'status-pill';
    const settled = await Promise.allSettled([
      fetchJson('/v1/x/local-capture/settings'), fetchJson('/v1/x/local-capture/timeline?limit=150'),
      fetchJson('/v1/x/local-capture/private-library'), fetchJson('/v1/watch/records?limit=100')
    ]);
    const [settings, timeline, library, watches] = settled;
    let found = false;
    if (settings.status === 'fulfilled') {
      const payload = bridgeData(settings.value);
      state.settings = { ...state.settings, ...(payload.settings || payload || {}) };
      found = true;
    }
    if (timeline.status === 'fulfilled') {
      const payload = bridgeData(timeline.value);
      state.events = mergeRemote(state.events, payload.events || payload.items || [], eventIdentity)
        .filter((item) => !state.hiddenEventIds.has(eventIdentity(item)));
      found = true;
    }
    if (library.status === 'fulfilled') {
      const payload = bridgeData(library.value);
      const bridgeLibrary = (payload.items || payload.library || []).map((item) => ({
        ...item,
        origin: 'BRIDGE',
        metadata: { ...(item.metadata || {}), bridgeLibraryId: text(item.id) },
      }));
      state.library = mergeRemote(state.library, bridgeLibrary, (item) => safeUrl(sourceUrl(item)) || text(item.id));
      found = true;
    }
    if (watches.status === 'fulfilled') {
      const payload = bridgeData(watches.value);
      state.watch = mergeRemote(state.watch, (payload.items || payload.records || []).map((item) => asWatch(item, 'BRIDGE')), watchIdentity)
        .filter((item) => !state.hiddenWatchIds.has(watchIdentity(item)));
      found = true;
    }
    state.bridgeReady = found;
    persistCapture(); persistWatch(); persistBridgeWatchCache();
    status.textContent = found ? '本机服务已读取' : '仅使用本地浏览器记录';
    status.className = `status-pill ${found ? 'ok' : 'warn'}`;
    $('#rail-status').textContent = found ? '本机记录已同步到工作台' : '正在使用此浏览器本地记录';
    $('#watch-mode').textContent = found ? '本机桥接 + 本地记录' : '本地记录';
    render();
  }
  async function refreshWatchProgress({ quiet = true } = {}) {
    if (watchRefreshInFlight) return;
    watchRefreshInFlight = true;
    try {
      const payload = bridgeData(await fetchJson('/v1/watch/records?limit=100'));
      const remote = (payload.items || payload.records || []).map((item) => asWatch(item, 'BRIDGE'));
      state.watch = mergeRemote(state.watch, remote, watchIdentity)
        .filter((item) => !state.hiddenWatchIds.has(watchIdentity(item)));
      state.bridgeReady = true;
      persistWatch(); persistBridgeWatchCache();
      $('#watch-mode').textContent = '本机桥接 + 本地记录 · 自动更新';
      renderOverview(); renderWatch(); renderInterest(); queueReveal();
    } catch (error) {
      if (!quiet) toast('本机服务暂时不可用，已保留当前观看记录。', 'warn');
    } finally {
      watchRefreshInFlight = false;
    }
  }
  function refreshBridgeWhenReturning() {
    if (document.visibilityState !== 'visible' || document.querySelector('dialog[open]')) return;
    window.clearTimeout(bridgeRefreshTimer);
    bridgeRefreshTimer = window.setTimeout(() => {
      hydrateBridge().catch(() => {
        // Keep the current local records visible if the local companion service
        // is temporarily unavailable.
      });
    }, 260);
  }

  function eventIdentity(item) { return text(item?.id) || `${sourceUrl(item)}:${actionClass(item)}:${text(item?.capturedAt || item?.createdAt)}`; }
  function eventsForDisplay() { return latestFirst(state.events, 'capturedAt'); }
  function isFollowAction(item) { return /(^|_)(follow|followed|unfollow|unfollowed)($|_)/u.test(actionClass(item)); }
  function followingForDisplay() {
    const records = new Map();
    state.following.forEach((item) => {
      const url = safeUrl(sourceUrl(item));
      if (!url) return;
      records.set(url, { ...item, sourceUrl: url, url, status: text(item.status) || 'active' });
    });
    [...state.events].sort((left, right) => dateValue(left.capturedAt || left.createdAt) - dateValue(right.capturedAt || right.createdAt)).forEach((item) => {
      if (!isFollowAction(item)) return;
      const url = safeUrl(sourceUrl(item));
      if (!url) return;
      const action = actionClass(item);
      const existing = records.get(url) || { id: `follow_${url}`, createdAt: item.capturedAt || item.createdAt || now(), origin: 'BROWSER_CAPTURE' };
      records.set(url, {
        ...existing,
        title: authorOf(item) || titleOf(item) || existing.title || new URL(url).hostname,
        author: authorOf(item) || existing.author || '', platform: platformOf(item) || existing.platform || knownPlatformFromUrl(url),
        sourceUrl: url, url, note: descriptionOf(item) || existing.note || '', tags: tags([...(tags(existing.tags)), ...resolvedTags(item)]),
        status: action.includes('unfollow') ? 'inactive' : 'active', action: action.includes('unfollow') ? 'unfollow' : 'follow',
        updatedAt: item.capturedAt || item.createdAt || now(), origin: 'BROWSER_CAPTURE'
      });
    });
    const filter = state.filters.following; const query = state.queries.following;
    return latestFirst([...records.values()], 'updatedAt').filter((item) => {
      const active = item.status !== 'inactive';
      const inFilter = filter === 'all' || (filter === 'active' && active) || (filter === 'inactive' && !active) || platformOf(item) === filter;
      return inFilter && matches(item, query);
    });
  }
  function linksForDisplay() { return latestFirst(state.resources, 'updatedAt'); }
  function watchesForDisplay() { return latestFirst(state.watch, 'lastWatchedAt'); }
  function isPrivate(item) { return Boolean(item?.privacy === 'PRIVATE' || item?.metadata?.private || item?.private); }
  function libraryForDisplay() { return latestFirst(state.library, 'addedAt'); }
  const AUTO_TAG_RULES = [
    ['AI', /(^|[^a-z])ai([^a-z]|$)|人工智能|机器学习|大模型|chatgpt|openai|claude|gemini/iu],
    ['设计', /设计|design|ui|ux|figma|字体|排版|交互/iu],
    ['代码', /代码|coding|programming|github|git\b|typescript|javascript|python|react|vue|api|开发/iu],
    ['产品', /产品|product|需求|用户体验|增长/iu],
    ['学习', /学习|教程|课程|读书|笔记|知识/iu],
    ['金融', /金融|财务|投资|股票|基金|记账/iu],
    ['电影', /电影|film|movie|影视|剧集/iu],
    ['视频', /视频|video|bilibili|youtube|抖音/iu],
    ['文章', /文章|article|博客|blog|公众号|阅读/iu],
    ['灵感', /灵感|inspiration|创意|创作/iu]
  ];
  function automaticTagsFor(item) {
    const sourceKind = kindOf(item);
    const kind = sourceKind === 'X_LINK' ? 'X' : sourceKind;
    const inferred = [];
    if (TYPE_LABEL[kind]) inferred.push(TYPE_LABEL[kind]);
    const platform = platformOf(item);
    if (platform && platform !== '未知来源' && platform.length <= 32) inferred.push(platform);
    const corpus = [titleOf(item), sourceUrl(item), platform, authorOf(item), descriptionOf(item)].join(' ').toLowerCase();
    AUTO_TAG_RULES.forEach(([tag, pattern]) => { if (pattern.test(corpus)) inferred.push(tag); });
    return tags(inferred);
  }
  function resolvedTags(item) {
    if (item?.tagMode === 'MANUAL') return tags(item.tags);
    return tags([...(tags(item?.tags)), ...(tags(item?.autoTags)), ...automaticTagsFor(item)]);
  }
  function itemText(item) { return [titleOf(item), sourceUrl(item), platformOf(item), authorOf(item), descriptionOf(item), ...resolvedTags(item)].join(' ').toLowerCase(); }
  function matches(item, query) { return !text(query) || itemText(item).includes(text(query).toLowerCase()); }
  function actionClass(item) { return text(item.actionType || item.type).toLowerCase(); }
  function actionIcon(item) { const action = actionClass(item); if (action.includes('follow')) return action.includes('unfollow') ? '−' : '＋'; if (action.includes('bookmark')) return '⌑'; if (action.includes('like')) return '♥'; if (action.includes('view') || action.includes('open')) return '◉'; if (action.includes('copy')) return '⧉'; return '↗'; }
  function actionName(item) { return ACTION_LABEL[actionClass(item)] || '已保存记录'; }
  function tagHtml(items) { return tags(items).slice(0, 4).map((tag) => `<span class="tag">${escapeHtml(tag)}</span>`).join(''); }
  function urlLink(item) {
    const url = safeUrl(sourceUrl(item));
    return url
      ? `<a class="source-link" href="${escapeHtml(url)}" target="_blank" rel="noopener noreferrer">打开原始内容 ↗</a><button class="source-copy" type="button" data-copy-source="${escapeHtml(url)}">复制链接</button>`
      : `<span class="source-link" title="该记录没有保存原始链接">原始链接不可用</span>`;
  }
  async function copyText(value) {
    const textValue = text(value);
    if (!textValue) return false;
    if (navigator.clipboard?.writeText) {
      try {
        await navigator.clipboard.writeText(textValue);
        return true;
      } catch (_) {
        // Plain HTTP and embedded browsers can deny the async Clipboard API.
        // Fall through to the browser-compatible selection fallback.
      }
    }
    const field = document.createElement('textarea');
    field.value = textValue;
    field.setAttribute('readonly', '');
    field.style.cssText = 'position:fixed;left:-9999px;top:0;opacity:0';
    document.body.append(field);
    field.select();
    field.setSelectionRange(0, field.value.length);
    const copied = document.execCommand('copy');
    field.remove();
    return copied;
  }
  function recordSource(kind, id) {
    if (kind === 'event') return state.events.find((item) => String(item.id) === String(id));
    if (kind === 'link') return state.resources.find((item) => String(item.id) === String(id));
    if (kind === 'watch') return state.watch.find((item) => String(item.id) === String(id));
    return null;
  }

  function renderOverview() {
    const events = eventsForDisplay(); const links = linksForDisplay(); const watch = watchesForDisplay(); const library = libraryForDisplay(); const following = followingForDisplay();
    const liked = events.filter((item) => actionClass(item).includes('like') && !actionClass(item).includes('unlike')).length;
    const bookmarked = events.filter((item) => actionClass(item).includes('bookmark') && !actionClass(item).includes('unbookmark')).length;
    const metricData = [
      ['已读记录', events.length, '点赞、收藏与浏览', 'violet'], ['主动链接', links.length, '网页、文章、代码与应用', 'gold'],
      ['观看记录', watch.length, `${watch.filter((item) => item.status === 'COMPLETED').length} 条已看完`, 'green'], ['私人资料', library.length, '仅你主动再次收藏', 'violet'], ['正在关注', following.filter((item) => item.status !== 'inactive').length, '网页端明确关注或手动记录', 'gold']
    ];
    $('#metrics').innerHTML = metricData.map(([label, value, detail, tone]) => `<article class="metric ${tone}"><span class="metric-kicker">${label}</span><strong>${value}</strong><small>${detail}</small></article>`).join('');
    $('#recent-records').innerHTML = events.length ? events.slice(0, 4).map(renderMiniEvent).join('') : placeholder('还没有读取到行为记录。可在左侧打开“任意链接收集”，从这里开始保存。');
    $('#library-preview').innerHTML = library.length ? library.slice(0, 4).map(renderMiniLibrary).join('') : placeholder('资料库暂时为空。对任意链接、点赞、收藏或观看记录点击“加入私人资料库”。');
  }
  function renderMiniEvent(item) { return `<article class="record-row"><span class="record-symbol">${actionIcon(item)}</span><div><strong>${escapeHtml(titleOf(item))}</strong><small>${escapeHtml(actionName(item))} · ${escapeHtml(platformOf(item))}</small></div><span class="record-time">${escapeHtml(formatDate(item.capturedAt || item.createdAt))}</span></article>`; }
  function renderMiniLibrary(item) { return `<article class="record-row"><span class="record-symbol">★</span><div><strong>${escapeHtml(titleOf(item))}</strong><small>${escapeHtml(platformOf(item))} · 默认私密</small></div><span class="record-time">${escapeHtml(formatDate(item.addedAt || item.createdAt))}</span></article>`; }

  function timelineItems() {
    const filter = state.filters.event; const query = state.queries.timeline;
    return eventsForDisplay().filter((item) => {
      const action = actionClass(item);
      const inFilter = filter === 'all' || (filter === 'like' && action.includes('like') && !action.includes('unlike')) || (filter === 'bookmark' && action.includes('bookmark') && !action.includes('unbookmark')) || (filter === 'viewed' && (action.includes('view') || action.includes('open'))) || (filter === 'saved' && (action.includes('save') || action.includes('copy') || action.includes('share')));
      return inFilter && matches(item, query);
    });
  }
  function libraryEntryFor(kind, id) {
    const source = recordSource(kind, id); const sourceUrlValue = sourceUrl(source);
    return state.library.find((item) => (item.metadata?.sourceKind === kind && String(item.metadata?.sourceId) === String(id)) || (sourceUrlValue && sourceUrl(item) === sourceUrlValue));
  }
  function libraryActionFor(kind, item) {
    const libraryEntry = libraryEntryFor(kind, item.id);
    return libraryEntry
      ? `<span class="library-state" aria-label="已加入私人资料库">★ 已加入资料库</span><button class="button ghost" data-remove-source-library data-library-id="${escapeHtml(libraryEntry.id)}">移出资料库</button>`
      : `<button class="button ghost" data-add-library data-kind="${escapeHtml(kind)}" data-id="${escapeHtml(item.id)}">加入资料库</button>`;
  }
  function renderTimeline() {
    const items = timelineItems();
    $('#timeline-list').innerHTML = items.length ? items.map((item) => {
      const libraryAction = libraryActionFor('event', item);
      return `<article class="timeline-card"><span class="action-mark">${actionIcon(item)}</span><div class="timeline-info"><h3>${escapeHtml(titleOf(item))}</h3><p>${escapeHtml(actionName(item))} · ${escapeHtml(platformOf(item))} · ${escapeHtml(formatDate(item.capturedAt || item.createdAt))}</p><div class="card-meta">${tagHtml(resolvedTags(item))}</div></div><div class="card-actions">${urlLink(item)}${libraryAction}</div></article>`;
    }).join('') : placeholder('当前筛选下没有记录。');
  }
  function renderFollowing() {
    const items = followingForDisplay();
    $('#following-list').innerHTML = items.length ? items.map((item) => {
      const active = item.status !== 'inactive';
      const source = item.origin === 'BROWSER_CAPTURE' ? '网页端捕获' : '手动记录';
      const created = item.updatedAt || item.createdAt;
      return `<article class="follow-card ${active ? '' : 'inactive'}"><span class="follow-mark">${active ? '＋' : '−'}</span><div class="follow-copy"><div class="follow-title"><h3>${escapeHtml(authorOf(item) || titleOf(item))}</h3><span class="follow-status ${active ? 'active' : 'inactive'}">${active ? '正在关注' : '已取消关注'}</span></div><p>${escapeHtml(platformOf(item))} · ${escapeHtml(source)} · ${escapeHtml(formatDate(created))}</p>${descriptionOf(item) ? `<p class="follow-note">${escapeHtml(descriptionOf(item))}</p>` : ''}<div class="card-meta">${tagHtml(resolvedTags(item))}</div></div><div class="card-actions">${urlLink(item)}${item.origin !== 'BROWSER_CAPTURE' ? `<button class="button ghost" data-remove-following data-id="${escapeHtml(item.id)}">删除记录</button>` : ''}</div></article>`;
    }).join('') : placeholder('还没有关注记录。安装扩展后，在 X、抖音网页版或哔哩哔哩网页版点击“关注”；其他平台可在这里手动添加主页链接。');
  }
  function renderLinks() {
    const filter = state.filters.link; const query = state.queries.links;
    const items = linksForDisplay().filter((item) => (filter === 'all' || kindOf(item) === filter) && matches(item, query));
    $('#link-list').innerHTML = items.length ? items.map((item) => renderLinkCard(item)).join('') : placeholder('还没有收集链接。点击“收集链接”可以保存网页、文章、代码、帖子、应用、电影或视频。');
  }
  function renderLinkCard(item) { const kind = kindOf(item); return `<article class="link-card"><span class="link-type">${escapeHtml((TYPE_LABEL[kind] || kind).slice(0, 2))}</span><div class="link-copy"><h3>${escapeHtml(titleOf(item))}</h3><span class="url-text">${escapeHtml(sourceUrl(item))}</span><p>${escapeHtml(descriptionOf(item) || `${platformOf(item)} · ${authorOf(item) || '未填写作者'}`)}</p><div class="card-meta">${tagHtml(resolvedTags(item))}</div></div><div class="card-actions">${urlLink(item)}${libraryActionFor('link', item)}<button class="button ghost" data-remove-resource data-id="${escapeHtml(item.id)}">清除</button></div></article>`; }
  function renderWatch() {
    const filter = state.filters.watch; const query = state.queries.watch;
    const items = watchesForDisplay().filter((item) => {
      const completed = item.status === 'COMPLETED' || Number(item.progressPercent) >= 99;
      const inFilter = filter === 'all' || (filter === 'continue' && !completed) || (filter === 'completed' && completed) || kindOf(item) === filter;
      return inFilter && matches(item, query);
    });
    $('#watch-list').innerHTML = items.length ? items.map((item) => {
      const progress = Math.max(0, Math.min(100, Number(item.progressPercent) || 0));
      const current = item.currentTimeSeconds || (item.durationSeconds * progress / 100);
      return `<article class="watch-card"><span class="watch-cover">${kindOf(item) === 'MOVIE' ? 'FILM' : 'PLAY'}</span><div class="watch-copy"><h3>${escapeHtml(titleOf(item))}</h3><p>${escapeHtml(platformOf(item))}${authorOf(item) ? ` · ${escapeHtml(authorOf(item))}` : ''}${item.origin === 'V9_LOCAL' ? ' · 本地登记' : ' · 本机桥接'}</p><div class="watch-progress"><span style="width:${progress}%"></span></div><div class="card-meta"><span class="tag">${progress}% · ${escapeHtml(formatDuration(current))}${item.durationSeconds ? ` / ${escapeHtml(formatDuration(item.durationSeconds))}` : ''}</span>${tagHtml(resolvedTags(item))}</div></div><div class="watch-side">${progress}%<small>${progress >= 99 ? '已看完' : '继续观看'}</small></div><div class="card-actions">${urlLink(item)}<button class="button ghost" data-watch-complete data-id="${escapeHtml(item.id)}">${progress >= 99 ? '标为继续' : '标为看完'}</button>${libraryActionFor('watch', item)}<button class="button ghost" data-remove-watch data-id="${escapeHtml(item.id)}">清除</button></div></article>`;
    }).join('') : placeholder('还没有电影或视频记录。点击“登记观看”保存标题、来源、进度和原始链接。');
  }
  function libraryType(item) { const type = kindOf(item); return type === 'X_LINK' ? 'X' : type; }
  function libraryGroup(item) {
    const type = libraryType(item);
    if (type === 'MOVIE') return 'movies';
    if (type === 'VIDEO') return 'videos';
    return 'links';
  }
  function renderLibraryCard(item) {
    return `<article class="library-card"><div class="library-top"><span class="tag">${escapeHtml(TYPE_LABEL[libraryType(item)] || libraryType(item))}</span><span class="star">★</span></div><h3>${escapeHtml(titleOf(item))}</h3><p>${escapeHtml(descriptionOf(item) || `${platformOf(item)} · ${authorOf(item) || '私人保存内容'}`)}</p><div class="card-meta">${tagHtml(resolvedTags(item))}</div><div class="library-bottom"><small>${escapeHtml(platformOf(item))} · ${escapeHtml(formatDate(item.addedAt || item.createdAt))}</small><div class="card-actions">${urlLink(item)}<button class="button ghost" data-edit-library-tags data-id="${escapeHtml(item.id)}">修改标签</button><button class="button ghost" data-remove-library data-id="${escapeHtml(item.id)}">移出资料库</button></div></div></article>`;
  }
  function renderLibrary() {
    const filter = state.filters.library; const query = state.queries.library;
    const items = libraryForDisplay().filter((item) => (filter === 'all' || libraryType(item) === filter) && matches(item, query));
    const groups = [
      ['movies', '电影收藏', '长期保留的电影与观影笔记'],
      ['videos', '视频收藏', '可继续观看、复盘或回看的视频'],
      ['links', '网址与内容', '网页、文章、代码、应用与帖子链接']
    ];
    const output = groups.map(([key, title, detail]) => {
      const grouped = items.filter((item) => libraryGroup(item) === key);
      const cards = grouped.length
        ? grouped.map(renderLibraryCard).join('')
        : `<div class="library-empty">暂无${title}。在观看记录或链接收集中点击“加入资料库”即可归入这里。</div>`;
      const type = key === 'movies' ? 'MOVIE' : key === 'videos' ? 'VIDEO' : 'WEBPAGE';
      return `<section class="library-group" data-library-group="${key}"><div class="library-group-head"><div><span class="micro">${key === 'movies' ? 'FILM ARCHIVE' : key === 'videos' ? 'VIDEO ARCHIVE' : 'LINK ARCHIVE'}</span><h2>${title}</h2><p>${detail}</p></div><div class="library-group-actions"><span class="group-count">${grouped.length} 条</span><button class="button ghost" type="button" data-open-library-add data-library-type="${type}">＋ 自行添加</button></div></div><div class="library-grid">${cards}</div></section>`;
    }).join('');
    $('#library-groups').innerHTML = output;
  }
  function hasTag(item, tag) { return resolvedTags(item).some((value) => value.toLocaleLowerCase() === text(tag).toLocaleLowerCase()); }
  function interestRouteLabel(routeKey) { return ({ links: '任意链接收集', watch: '电影与视频', library: '私人资料库', timeline: '行为记录' })[routeKey] || '内容'; }
  function renderInterestResults() {
    const selected = state.selectedInterestTag;
    if (!selected) {
      $('#interest-results').innerHTML = `<div class="section-head"><div><span class="micro">AUTO CLASSIFICATION</span><h2>自动归纳规则</h2></div></div><p class="interest-empty">新保存的内容会根据真实标题、链接域名、来源网站和内容类型补充标签；标签不会生成不存在的内容。点击上方任何标签，即可跳到有该标签的链接、观看记录、资料库或行为记录。</p>`;
      return;
    }
    const groups = [
      ['library', '私人资料库', state.library.filter((item) => hasTag(item, selected))],
      ['links', '任意链接收集', state.resources.filter((item) => hasTag(item, selected))],
      ['watch', '电影与视频', state.watch.filter((item) => hasTag(item, selected))],
      ['timeline', '行为记录', state.events.filter((item) => hasTag(item, selected))]
    ].filter(([, , items]) => items.length);
    $('#interest-results').innerHTML = `<div class="section-head"><div><span class="micro">TAG RESULTS</span><h2>“${escapeHtml(selected)}” 的归纳结果</h2><p class="section-help">点击分组可跳到原有功能页面；每条记录仍保留原始链接。</p></div><button class="button soft" type="button" data-clear-interest-tag>清除筛选</button></div>${groups.length ? `<div class="interest-result-grid">${groups.map(([routeKey, label, items]) => `<button class="interest-result-card" type="button" data-interest-route="${routeKey}" data-interest-tag="${escapeHtml(selected)}"><span>${escapeHtml(label)}</span><strong>${items.length} 条</strong><small>${escapeHtml(titleOf(items[0]))}${items.length > 1 ? ` 等 ${items.length} 条` : ''}</small><i>查看 →</i></button>`).join('')}</div>` : placeholder('没有找到对应内容。你可以在资料库中修改或补充这个标签。')}`;
  }
  function renderInterest() {
    const all = [...state.resources, ...state.watch, ...state.library, ...state.events]; const counts = new Map();
    all.forEach((item) => resolvedTags(item).forEach((tag) => counts.set(tag, (counts.get(tag) || 0) + 1)));
    const tagItems = [...counts.entries()].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0], 'zh-CN'));
    $('#tag-cloud').innerHTML = tagItems.length ? tagItems.map(([tag, count]) => `<button class="interest-tag ${state.selectedInterestTag === tag ? 'active' : ''}" data-tag-search="${escapeHtml(tag)}">${escapeHtml(tag)} <b>${count}</b></button>`).join('') : placeholder('保存链接或资料时加入标签，这里会根据真实内容自动归纳。');
    const groups = [['链接', state.resources.length], ['观看', state.watch.length], ['私人资料', state.library.length]];
    $('#interest-summary').innerHTML = groups.map(([label, count]) => `<div><strong>${count}</strong><span>${label}</span></div>`).join('');
    renderInterestResults();
  }
  function syncQueryInputs() {
    const fields = {
      'timeline-search': state.queries.timeline,
      'following-search': state.queries.following,
      'link-search': state.queries.links,
      'watch-search': state.queries.watch,
      'library-search': state.queries.library
    };
    Object.entries(fields).forEach(([id, value]) => {
      const field = document.getElementById(id);
      if (field && field.value !== value) field.value = value;
    });
  }
  function setSettingInputs() { ['enabled', 'captureSharedLinks', 'watchCapture', 'savePageMetadata'].forEach((key) => { const node = $(`#setting-${key}`); if (node) node.checked = Boolean(state.settings[key]); }); }
  function setActiveRoute(value, replaceHash = false) {
    const active = VALID_ROUTES.has(value) ? value : 'overview';
    $$('.nav-list a').forEach((node) => {
      const selected = node.dataset.route === active;
      node.classList.toggle('active', selected);
      node.setAttribute('aria-current', selected ? 'page' : 'false');
    });
    if (replaceHash && location.hash !== `#${active}`) history.replaceState(null, '', `#${active}`);
  }
  function activateTabs() { $$('#event-filters button').forEach((button) => button.classList.toggle('active', button.dataset.filter === state.filters.event)); $$('#following-filters button').forEach((button) => button.classList.toggle('active', button.dataset.followFilter === state.filters.following)); $$('#link-filters button').forEach((button) => button.classList.toggle('active', button.dataset.linkFilter === state.filters.link)); $$('#watch-filters button').forEach((button) => button.classList.toggle('active', button.dataset.watchFilter === state.filters.watch)); $$('#library-filters button').forEach((button) => button.classList.toggle('active', button.dataset.libraryFilter === state.filters.library)); }
  function render() {
    const active = activeScrollRoute || route();
    $$('.view').forEach((node) => node.classList.toggle('active', node.dataset.view === active));
    setActiveRoute(active);
    renderOverview(); renderTimeline(); renderFollowing(); renderLinks(); renderWatch(); renderLibrary(); renderInterest(); syncQueryInputs(); setSettingInputs(); activateTabs(); queueReveal();
  }

  function queueReveal() {
    window.requestAnimationFrame(() => {
      const targets = $$('.view .panel, .view .feature-card, .view .timeline-card, .view .follow-card, .view .link-card, .view .watch-card, .view .library-card, .view .library-group');
      targets.forEach((node, index) => {
        if (!node.classList.contains('reveal')) {
          node.classList.add('reveal');
          node.style.setProperty('--reveal-delay', `${Math.min(index, 7) * 42}ms`);
        }
      });
      if (!('IntersectionObserver' in window)) { targets.forEach((node) => node.classList.add('is-revealed')); return; }
      if (!revealObserver) {
        revealObserver = new IntersectionObserver((entries) => {
          entries.forEach((entry) => {
            if (entry.isIntersecting) { entry.target.classList.add('is-revealed'); revealObserver.unobserve(entry.target); }
          });
        }, { threshold: .08, rootMargin: '0px 0px -6% 0px' });
      }
      targets.filter((node) => !node.classList.contains('is-revealed')).forEach((node) => {
        const rect = node.getBoundingClientRect();
        // Initial content must not stay transparent while waiting for a scroll event.
        // Zero-height layout helpers are also safe to reveal immediately.
        if (rect.height === 0 || (rect.bottom > 0 && rect.top < window.innerHeight)) {
          node.classList.add('is-revealed');
          return;
        }
        revealObserver.observe(node);
      });
    });
  }

  function privateLibraryBridgeId(entry) {
    return text(entry?.metadata?.bridgeLibraryId) || (entry?.origin === 'BRIDGE' ? text(entry?.id) : '');
  }
  async function syncBridgePrivateLibrary(source, kind, entry) {
    const sourceId = text(source?.id);
    const path = kind === 'watch' && source?.origin === 'BRIDGE' && sourceId
      ? `/v1/watch/records/${encodeURIComponent(sourceId)}/private-library`
      : ((kind === 'resource' || kind === 'link') && source?.origin === 'BRIDGE' && sourceId
        ? `/v1/resources/records/${encodeURIComponent(sourceId)}/private-library`
        : '');
    if (!path) return;
    try {
      const payload = bridgeData(await sendJson(path, 'POST', { tags: resolvedTags(entry), note: entry.note || undefined }));
      const remote = payload.item;
      if (!remote?.id) throw new Error('本机服务没有确认资料库项目。');
      entry.metadata = { ...(entry.metadata || {}), bridgeLibraryId: text(remote.id), bridgeSyncedAt: now() };
      entry.updatedAt = remote.updatedAt || now();
      persistCapture(); render();
    } catch (error) {
      // The local item remains visible and private; we never pretend it was
      // synced until the loopback service has acknowledged it.
      toast('已保存到此浏览器；本机服务暂未确认资料库同步。', 'warn');
    }
  }
  function addToLibrary(kind, id) {
    const source = recordSource(kind, id); if (!source) return toast('找不到原始记录，无法加入资料库。', 'warn');
    const url = sourceUrl(source); const duplicate = state.library.some((item) => (url && sourceUrl(item) === url) || (item.metadata?.sourceKind === kind && String(item.metadata?.sourceId) === String(id)));
    if (duplicate) return toast('它已经在私人资料库中。', 'warn');
    const entry = { id: uid('private'), title: titleOf(source), sourceUrl: url, url, sourceType: kindOf(source), sourcePlatform: platformOf(source), author: authorOf(source), description: descriptionOf(source), note: descriptionOf(source), tags: tags(source.tags), autoTags: resolvedTags(source), tagMode: 'AUTO', privacy: 'PRIVATE', addedAt: now(), createdAt: now(), metadata: { sourceKind: kind, sourceId: id, private: true } };
    state.library.unshift(entry); persistCapture(); render(); toast('已加入私人资料库。', 'ok');
    void syncBridgePrivateLibrary(source, kind, entry);
  }
  function saveManualLibrary(form) {
    const data = new FormData(form); let url;
    try { url = normalizeUrl(data.get('library-url')); } catch (error) { $('#library-error').textContent = error.message; return; }
    if (state.library.some((item) => sourceUrl(item) === url)) { $('#library-error').textContent = '这条链接已经在私人资料库中。'; return; }
    const type = text(data.get('library-type')) || 'WEBPAGE';
    const entry = {
      id: uid('private'), sourceType: type, title: text(data.get('library-title')) || new URL(url).hostname,
      sourceUrl: url, url, sourcePlatform: text(data.get('library-platform')) || platformFromUrl(url),
      author: text(data.get('library-author')), description: text(data.get('library-description')), note: text(data.get('library-description')),
      tags: tags(data.get('library-tags')), autoTags: [], tagMode: 'AUTO', privacy: 'PRIVATE', addedAt: now(), createdAt: now(),
      metadata: { sourceKind: 'manual', sourceId: url, private: true }
    };
    entry.autoTags = automaticTagsFor(entry);
    state.library.unshift(entry); persistCapture(); form.reset(); closeDialog('library-dialog'); render(); toast('已加入私人资料库，并归入对应板块。', 'ok');
  }
  async function removeFromLibrary(id) {
    const entry = state.library.find((item) => String(item.id) === String(id));
    if (!entry) return;
    state.library = state.library.filter((item) => String(item.id) !== String(id));
    persistCapture(); render();
    const bridgeId = privateLibraryBridgeId(entry);
    if (!bridgeId) { toast('已从私人资料库移出；原始记录不受影响。', 'ok'); return; }
    try {
      const response = await fetch(`${API}/v1/x/local-capture/private-library/${encodeURIComponent(bridgeId)}`, {
        method: 'DELETE', headers: { Accept: 'application/json' }, credentials: 'omit'
      });
      if (!response.ok) throw new Error(`本机服务返回 ${response.status}`);
      toast('已从私人资料库移出；原始记录不受影响。', 'ok');
    } catch (error) {
      state.library.unshift(entry); persistCapture(); render();
      toast('本机服务未确认移除，资料已恢复以避免误删。', 'warn');
    }
  }
  function openTagEditor(id) {
    const item = state.library.find((entry) => String(entry.id) === String(id));
    if (!item) return toast('找不到这条私人资料，无法修改标签。', 'warn');
    $('#tag-record-id').value = item.id;
    $('#tag-input').value = resolvedTags(item).join('，');
    $('#tag-target').textContent = `正在为「${titleOf(item)}」设置最终标签。`;
    $('#tag-error').textContent = '';
    $('#tag-dialog').showModal();
  }
  async function saveTagEditor(form) {
    const data = new FormData(form); const id = text(data.get('tag-record-id'));
    const item = state.library.find((entry) => String(entry.id) === id);
    if (!item) { $('#tag-error').textContent = '这条资料已不存在，请关闭后重新打开。'; return; }
    const finalTags = tags(data.get('tag-input'));
    if (!finalTags.length) { $('#tag-error').textContent = '请至少保留一个标签。'; return; }
    const before = { tags: [...(item.tags || [])], autoTags: [...(item.autoTags || [])], tagMode: item.tagMode, updatedAt: item.updatedAt };
    item.tags = finalTags; item.autoTags = []; item.tagMode = 'MANUAL'; item.updatedAt = now();
    persistCapture(); closeDialog('tag-dialog'); render();
    const bridgeId = privateLibraryBridgeId(item);
    if (!bridgeId) { toast('标签已保存，之后将按你的标签归纳。', 'ok'); return; }
    try {
      await sendJson(`/v1/x/local-capture/private-library/${encodeURIComponent(bridgeId)}`, 'PATCH', { tags: finalTags });
      toast('标签已保存并同步到本机资料库。', 'ok');
    } catch (error) {
      item.tags = before.tags; item.autoTags = before.autoTags; item.tagMode = before.tagMode; item.updatedAt = before.updatedAt;
      persistCapture(); render();
      toast('本机服务未确认标签同步，已恢复原标签。', 'warn');
    }
  }
  function clearTimeline() {
    const items = timelineItems();
    if (!items.length) return toast('当前筛选下没有可清除的行为记录。', 'warn');
    if (!window.confirm(`确定清除当前显示的 ${items.length} 条行为记录吗？这不会删除私人资料库、链接或观看记录。`)) return;
    const identities = new Set(items.map(eventIdentity));
    identities.forEach((id) => state.hiddenEventIds.add(id));
    state.events = state.events.filter((item) => !identities.has(eventIdentity(item)));
    persistCapture(); render(); toast(`已清除 ${items.length} 条行为记录；私人资料库内容保持不变。`, 'ok');
  }
  function removeResource(id) {
    const item = state.resources.find((entry) => String(entry.id) === String(id)) || state.savedLinks.find((entry) => String(entry.id) === String(id));
    if (!item) return;
    const url = safeUrl(sourceUrl(item));
    state.resources = state.resources.filter((entry) => String(entry.id) !== String(id) && (!url || sourceUrl(entry) !== url));
    state.savedLinks = state.savedLinks.filter((entry) => String(entry.id) !== String(id) && (!url || sourceUrl(entry) !== url));
    persistResources(); persistLinks(); render();
    toast('已清除链接记录；行为记录和私人资料库内容保持不变。', 'ok');
  }
  function clearLinks() {
    const filter = state.filters.link; const query = state.queries.links;
    const items = linksForDisplay().filter((item) => (filter === 'all' || kindOf(item) === filter) && matches(item, query));
    if (!items.length) return toast('当前筛选下没有可清除的链接记录。', 'warn');
    if (!window.confirm(`确定清除当前显示的 ${items.length} 条链接记录吗？这不会删除行为记录或私人资料库内容。`)) return;
    const urls = new Set(items.map((item) => safeUrl(sourceUrl(item))).filter(Boolean));
    state.resources = state.resources.filter((item) => !urls.has(safeUrl(sourceUrl(item))));
    state.savedLinks = state.savedLinks.filter((item) => !urls.has(safeUrl(sourceUrl(item))));
    persistResources(); persistLinks(); render();
    toast(`已清除 ${items.length} 条链接记录；私人资料库内容保持不变。`, 'ok');
  }
  function removeWatch(id) {
    const item = state.watch.find((entry) => String(entry.id) === String(id));
    if (!item) return;
    const identity = watchIdentity(item);
    if (item.origin === 'BRIDGE') {
      state.hiddenWatchIds.add(identity);
      write(WATCH_HIDDEN_KEY, [...state.hiddenWatchIds]);
    }
    state.watch = state.watch.filter((entry) => String(entry.id) !== String(id) && watchIdentity(entry) !== identity);
    persistWatch(); persistBridgeWatchCache(); render();
    toast('已清除观看记录；私人资料库内容保持不变。', 'ok');
  }
  function clearWatch() {
    const filter = state.filters.watch; const query = state.queries.watch;
    const items = watchesForDisplay().filter((item) => {
      const completed = item.status === 'COMPLETED' || Number(item.progressPercent) >= 99;
      const inFilter = filter === 'all' || (filter === 'continue' && !completed) || (filter === 'completed' && completed) || kindOf(item) === filter;
      return inFilter && matches(item, query);
    });
    if (!items.length) return toast('当前筛选下没有可清除的观看记录。', 'warn');
    if (!window.confirm(`确定清除当前显示的 ${items.length} 条观看记录吗？这不会删除私人资料库内容。`)) return;
    const identities = new Set(items.map(watchIdentity));
    items.filter((item) => item.origin === 'BRIDGE').forEach((item) => state.hiddenWatchIds.add(watchIdentity(item)));
    state.watch = state.watch.filter((item) => !identities.has(watchIdentity(item)));
    write(WATCH_HIDDEN_KEY, [...state.hiddenWatchIds]);
    persistWatch(); persistBridgeWatchCache(); render();
    toast(`已清除 ${items.length} 条观看记录；私人资料库内容保持不变。`, 'ok');
  }
  function watchProgressPayload(record) {
    const url = safeUrl(sourceUrl(record));
    if (!url) throw new Error('观看记录没有可同步的原始链接。');
    const domain = text(record.domain) || new URL(url).hostname;
    return {
      sessionId: `v12-status-${text(record.id) || uid('watch')}`,
      contentKey: text(record.contentKey) || url,
      contentType: kindOf(record) === 'MOVIE' ? 'MOVIE' : 'VIDEO',
      platform: text(record.platform) || domain,
      domain,
      videoId: record.videoId || null,
      title: titleOf(record),
      subtitle: record.subtitle || null,
      creator: authorOf(record) || null,
      url,
      canonicalUrl: url,
      durationSeconds: Math.max(0, Number(record.durationSeconds) || 0),
      currentTimeSeconds: Math.max(0, Number(record.currentTimeSeconds) || 0),
      // This update only changes the explicit status. It never invents viewing time.
      actualPlayedSeconds: 0,
      eventType: 'progress',
      metadata: { ...(record.metadata || {}), source: 'ME.zip Capture V12', statusUpdatedFrom: 'watch-workspace' },
    };
  }
  async function toggleCompleted(id) {
    const record = state.watch.find((item) => String(item.id) === String(id)); if (!record) return;
    const before = { ...record };
    const done = record.status === 'COMPLETED' || Number(record.progressPercent) >= 99;
    record.status = done ? 'IN_PROGRESS' : 'COMPLETED';
    // The bridge treats 90% and above as completed. Returning to “继续观看”
    // must therefore go below that threshold instead of remaining at 98%.
    const nextProgress = done ? Math.min(89, Math.max(1, Number(record.progressPercent) || 0)) : 100;
    record.progressPercent = nextProgress;
    record.currentTimeSeconds = done
      ? (record.durationSeconds
        ? Math.max(1, Math.floor((Number(record.durationSeconds) * nextProgress) / 100))
        : Math.max(1, Number(record.currentTimeSeconds) || 0))
      : (record.durationSeconds || record.currentTimeSeconds);
    record.updatedAt = now(); record.lastWatchedAt = now();
    persistWatch(); persistBridgeWatchCache(); render();
    if (record.origin !== 'BRIDGE') { toast(done ? '已改为继续观看（本地记录）。' : '已标记为看完（本地记录）。', 'ok'); return; }
    try {
      const payload = bridgeData(await sendJson('/v1/watch/records', 'POST', watchProgressPayload(record)));
      if (!payload.record) throw new Error('本机服务没有确认状态更新。');
      const synced = asWatch(payload.record, 'BRIDGE');
      state.watch = mergeRemote(state.watch.filter((item) => String(item.id) !== String(id)), [synced], watchIdentity);
      persistWatch(); persistBridgeWatchCache(); render();
      toast(done ? '已改为继续观看，并已同步到本机服务。' : '已标记为看完，并已同步到本机服务。', 'ok');
    } catch (error) {
      Object.assign(record, before); persistWatch(); persistBridgeWatchCache(); render();
      toast('本机服务暂未确认更新，已恢复原来的观看状态。', 'warn');
    }
  }

  function closeDialog(id) { const dialog = $(`#${id}`); if (dialog?.open) dialog.close(); }
  function openDialog(kind) { const dialog = $(`#${kind}-dialog`); if (!dialog) return; $(`#${kind}-error`).textContent = ''; dialog.showModal(); }
  function platformFromUrl(url) { try { return new URL(url).hostname.replace(/^www\./, ''); } catch { return ''; } }
  function saveLink(form) {
    if (!state.settings.enabled || !state.settings.captureSharedLinks) { $('#link-error').textContent = '请在“本地设置”中启用主动链接收集后再保存。'; return; }
    const data = new FormData(form); let url;
    try { url = normalizeUrl(data.get('link-url')); } catch (error) { $('#link-error').textContent = error.message; return; }
    const existing = state.resources.find((item) => sourceUrl(item) === url); const item = existing || { id: uid('resource'), createdAt: now(), origin: 'V9_LOCAL' };
    Object.assign(item, { resourceType: text(data.get('link-type')) || 'WEBPAGE', title: text(data.get('link-title')) || new URL(url).hostname, platform: text(data.get('link-platform')) || platformFromUrl(url), author: text(data.get('link-author')), description: text(data.get('link-description')), note: text(data.get('link-description')), tags: tags(data.get('link-tags')), url, sourceUrl: url, updatedAt: now(), tagMode: 'AUTO' });
    item.autoTags = automaticTagsFor(item);
    if (!existing) state.resources.unshift(item);
    const eventExists = state.events.some((entry) => sourceUrl(entry) === url && actionClass(entry) === 'manual_save');
    if (!eventExists) state.events.unshift({ id: uid('event'), actionType: 'manual_save', pageTitle: item.title, postUrl: url, platform: item.platform, note: item.description, tags: item.tags, autoTags: item.autoTags, tagMode: 'AUTO', capturedAt: now(), createdAt: now() });
    const saved = state.savedLinks.find((entry) => sourceUrl(entry) === url); const savedLink = saved || { id: uid('saved-link'), createdAt: now() };
    Object.assign(savedLink, { url, sourceUrl: url, title: item.title, purpose: item.description, tags: item.tags, autoTags: item.autoTags, tagMode: 'AUTO', updatedAt: now() }); if (!saved) state.savedLinks.unshift(savedLink);
    persistResources(); persistCapture(); persistLinks(); form.reset(); closeDialog('link-dialog'); render(); toast(existing ? '已更新这条本地链接记录。' : '已收集到本机，可随时加入私人资料库。', 'ok');
  }
  async function syncManualWatchRecord(localRecord) {
    try {
      const payload = bridgeData(await sendJson('/v1/watch/records', 'POST', watchProgressPayload(localRecord)));
      if (!payload.record) throw new Error('本机服务没有确认观看记录。');
      const synced = asWatch(payload.record, 'BRIDGE');
      state.hiddenWatchIds.delete(watchIdentity(synced));
      write(WATCH_HIDDEN_KEY, [...state.hiddenWatchIds]);
      state.watch = mergeRemote(state.watch.filter((item) => watchIdentity(item) !== watchIdentity(localRecord)), [synced], watchIdentity);
      persistWatch(); persistBridgeWatchCache(); render();
      toast('观看记录已保存，并已同步到本机服务。', 'ok');
    } catch (error) {
      // An explicit manual entry remains local and visible.  We only label it
      // as a browser-local record until a server acknowledgement is received.
      persistWatch(); render();
      toast('观看记录已保存到当前浏览器；本机服务暂未确认同步。', 'warn');
    }
  }
  function saveWatch(form) {
    if (!state.settings.enabled || !state.settings.watchCapture) { $('#watch-error').textContent = '请在“本地设置”中启用观看记录后再保存。'; return; }
    const data = new FormData(form); let url;
    try { url = normalizeUrl(data.get('watch-url')); } catch (error) { $('#watch-error').textContent = error.message; return; }
    const duration = Math.max(0, Number(data.get('watch-duration')) || 0) * 60; const progress = Math.max(0, Math.min(100, Number($('#watch-progress').value) || 0));
    const existing = state.watch.find((item) => item.origin === 'V9_LOCAL' && sourceUrl(item) === url); const item = existing || { id: uid('watch'), createdAt: now(), origin: 'V9_LOCAL' };
    Object.assign(item, { contentType: text(data.get('watch-type')) || 'VIDEO', title: text(data.get('watch-title')) || new URL(url).hostname, platform: text(data.get('watch-platform')) || platformFromUrl(url), creator: text(data.get('watch-creator')), url, sourceUrl: url, durationSeconds: duration, progressPercent: progress, currentTimeSeconds: duration ? Math.round(duration * progress / 100) : 0, status: progress >= 99 ? 'COMPLETED' : 'IN_PROGRESS', note: text(data.get('watch-note')), tags: tags(data.get('watch-tags')), lastWatchedAt: now(), updatedAt: now(), tagMode: 'AUTO' });
    item.autoTags = automaticTagsFor(item);
    state.hiddenWatchIds.delete(watchIdentity(item));
    write(WATCH_HIDDEN_KEY, [...state.hiddenWatchIds]);
    if (!existing) state.watch.unshift(item);
    persistWatch(); persistBridgeWatchCache(); form.reset(); $('#watch-progress-value').value = '0%'; closeDialog('watch-dialog'); render(); toast('观看记录已保存到本机，正在确认同步。', 'ok');
    void syncManualWatchRecord(item);
  }
  function saveFollowing(form) {
    const data = new FormData(form); let url;
    try { url = normalizeUrl(data.get('follow-url')); } catch (error) { $('#follow-error').textContent = error.message; return; }
    const existing = state.following.find((item) => sourceUrl(item) === url);
    const record = existing || { id: uid('following'), createdAt: now(), origin: 'MANUAL_FOLLOW' };
    Object.assign(record, {
      title: text(data.get('follow-creator')) || new URL(url).hostname,
      author: text(data.get('follow-creator')) || new URL(url).hostname,
      platform: text(data.get('follow-platform')) || knownPlatformFromUrl(url) || '其他',
      sourceUrl: url, url, note: text(data.get('follow-note')), tags: tags(data.get('follow-tags')), status: 'active', action: 'follow', updatedAt: now(), origin: 'MANUAL_FOLLOW'
    });
    record.autoTags = automaticTagsFor(record);
    if (!existing) state.following.unshift(record);
    persistCapture(); form.reset(); closeDialog('follow-dialog'); render(); toast(existing ? '已更新这位关注者。' : '已记录关注的人，可随时打开主页。', 'ok');
  }
  function removeFollowing(id) {
    const before = state.following.length;
    state.following = state.following.filter((item) => String(item.id) !== String(id));
    if (before === state.following.length) return;
    persistCapture(); render(); toast('已删除手动关注记录。', 'ok');
  }
  function exportData() {
    const payload = { exportedAt: now(), version: 'ME.zip Capture V12', events: state.events, links: state.resources, watch: state.watch, following: state.following, privateLibrary: state.library, settings: state.settings };
    const blob = new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' }); const href = URL.createObjectURL(blob); const a = document.createElement('a'); a.href = href; a.download = `mezip-capture-v12-${new Date().toISOString().slice(0, 10)}.json`; a.click(); URL.revokeObjectURL(href); toast('已导出本地记录 JSON。', 'ok');
  }
  function runSearch(query) {
    const needle = text(query); if (!needle) return;
    const targets = [ ['following', followingForDisplay()], ['links', linksForDisplay()], ['watch', watchesForDisplay()], ['library', libraryForDisplay()], ['timeline', eventsForDisplay()] ];
    const match = targets.find(([, items]) => items.some((item) => matches(item, needle)));
    const destination = match ? match[0] : 'links';
    state.queries[destination] = needle;
    location.hash = destination; render(); toast(match ? `已定位到“${destination === 'following' ? '关注的人' : destination === 'links' ? '任意链接收集' : destination === 'watch' ? '电影与视频' : destination === 'library' ? '私人资料库' : '行为记录'}”。` : '没有找到结果；你可以直接收集这条链接。', match ? 'ok' : 'warn');
  }

  function scrollToRoute(value, pushHash = true) {
    const next = VALID_ROUTES.has(value) ? value : 'overview';
    const target = document.getElementById(next);
    // A smooth jump crosses other long-page sections. Keep the requested
    // destination active until it becomes visible, instead of letting the
    // section observer overwrite it mid-scroll.
    pendingScrollRoute = next;
    activeScrollRoute = next;
    window.clearTimeout(pendingScrollRouteTimer);
    pendingScrollRouteTimer = window.setTimeout(() => { pendingScrollRoute = ''; }, 1600);
    if (pushHash && location.hash !== `#${next}`) history.pushState(null, '', `#${next}`);
    setActiveRoute(next);
    target?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }
  function routeForTag(tag) {
    const sources = [['library', state.library], ['links', state.resources], ['watch', state.watch], ['timeline', state.events]];
    const found = sources.find(([, items]) => items.some((item) => hasTag(item, tag)));
    return found?.[0] || 'interest';
  }
  function applyTagFilter(destination, tag) {
    if (!Object.prototype.hasOwnProperty.call(state.queries, destination)) return;
    state.queries[destination] = tag;
    render();
    const inputIds = { timeline: 'timeline-search', links: 'link-search', watch: 'watch-search', library: 'library-search' };
    window.requestAnimationFrame(() => {
      const field = document.getElementById(inputIds[destination]);
      if (field) field.value = tag;
    });
  }
  function openInterestTag(tag) {
    const selected = text(tag); if (!selected) return;
    state.selectedInterestTag = selected;
    const destination = routeForTag(selected);
    if (destination === 'interest') { render(); scrollToRoute('interest'); return toast('没有找到对应内容，你可以在资料库中手动补充该标签。', 'warn'); }
    applyTagFilter(destination, selected); scrollToRoute(destination); toast(`已打开“${selected}”的${interestRouteLabel(destination)}内容。`, 'ok');
  }
  function openInterestGroup(routeKey, tag) {
    const destination = VALID_ROUTES.has(routeKey) ? routeKey : 'interest';
    const selected = text(tag); state.selectedInterestTag = selected;
    if (destination === 'interest') { render(); scrollToRoute('interest'); return; }
    applyTagFilter(destination, selected); scrollToRoute(destination);
  }
  function visibleRoute() {
    const marker = Math.max(96, Math.min(260, Math.round(window.innerHeight * .28)));
    const sections = $$('.view[data-view]');
    const containing = sections.find((section) => {
      const rect = section.getBoundingClientRect();
      return rect.top <= marker && rect.bottom > marker;
    });
    if (containing) return containing.dataset.view;
    return sections.reduce((closest, section) => {
      const distance = Math.abs(section.getBoundingClientRect().top - marker);
      return !closest || distance < closest.distance ? { route: section.dataset.view, distance } : closest;
    }, null)?.route || 'overview';
  }
  function updateRouteFromScroll() {
    scrollFrame = 0;
    if (pendingScrollRoute) {
      const target = document.getElementById(pendingScrollRoute);
      const top = target?.getBoundingClientRect().top ?? Number.POSITIVE_INFINITY;
      if (Math.abs(top) <= Math.max(90, window.innerHeight * .24)) {
        activeScrollRoute = pendingScrollRoute;
        pendingScrollRoute = '';
        window.clearTimeout(pendingScrollRouteTimer);
      } else return;
    }
    const next = visibleRoute();
    if (!next || next === activeScrollRoute) return;
    activeScrollRoute = next;
    $$('.view').forEach((node) => node.classList.toggle('active', node.dataset.view === next));
    setActiveRoute(next, true);
    queueReveal();
  }
  function installSectionNavigation() {
    const onScroll = () => {
      if (scrollFrame) return;
      scrollFrame = window.requestAnimationFrame(updateRouteFromScroll);
    };
    window.addEventListener('scroll', onScroll, { passive: true });
    window.addEventListener('resize', onScroll);
    onScroll();
  }

  document.addEventListener('click', (event) => {
    const navLink = event.target.closest('.nav-list a[data-route]'); if (navLink) { event.preventDefault(); scrollToRoute(navLink.dataset.route); return; }
    const routeButton = event.target.closest('[data-route-go]'); if (routeButton) { scrollToRoute(routeButton.dataset.routeGo); return; }
    const dialogButton = event.target.closest('[data-open-dialog]'); if (dialogButton) { openDialog(dialogButton.dataset.openDialog); return; }
    const manualAdd = event.target.closest('[data-open-library-add]'); if (manualAdd) { $('#library-type').value = manualAdd.dataset.libraryType || 'WEBPAGE'; openDialog('library'); return; }
    const close = event.target.closest('[data-close-dialog]'); if (close) { closeDialog(close.dataset.closeDialog); return; }
    const add = event.target.closest('[data-add-library]'); if (add) { addToLibrary(add.dataset.kind, add.dataset.id); return; }
    const editTags = event.target.closest('[data-edit-library-tags]'); if (editTags) { openTagEditor(editTags.dataset.id); return; }
    const remove = event.target.closest('[data-remove-library]'); if (remove) { removeFromLibrary(remove.dataset.id); return; }
    const removeSourceLibrary = event.target.closest('[data-remove-source-library]'); if (removeSourceLibrary) { removeFromLibrary(removeSourceLibrary.dataset.libraryId); return; }
    const clearTimelineButton = event.target.closest('[data-clear-timeline]'); if (clearTimelineButton) { clearTimeline(); return; }
    const removeResourceButton = event.target.closest('[data-remove-resource]'); if (removeResourceButton) { removeResource(removeResourceButton.dataset.id); return; }
    const clearLinksButton = event.target.closest('[data-clear-links]'); if (clearLinksButton) { clearLinks(); return; }
    const removeWatchButton = event.target.closest('[data-remove-watch]'); if (removeWatchButton) { removeWatch(removeWatchButton.dataset.id); return; }
    const clearWatchButton = event.target.closest('[data-clear-watch]'); if (clearWatchButton) { clearWatch(); return; }
    const copySource = event.target.closest('[data-copy-source]'); if (copySource) {
      const value = copySource.dataset.copySource;
      void copyText(value).then((copied) => toast(copied ? '原始链接已复制。' : '浏览器未授予复制权限，请长按或手动复制原始链接。', copied ? 'ok' : 'warn'));
      return;
    }
    const complete = event.target.closest('[data-watch-complete]'); if (complete) { void toggleCompleted(complete.dataset.id); return; }
    const eventFilter = event.target.closest('[data-filter]'); if (eventFilter) { state.filters.event = eventFilter.dataset.filter; renderTimeline(); activateTabs(); return; }
    const followFilter = event.target.closest('[data-follow-filter]'); if (followFilter) { state.filters.following = followFilter.dataset.followFilter; renderFollowing(); activateTabs(); return; }
    const removeFollowingButton = event.target.closest('[data-remove-following]'); if (removeFollowingButton) { removeFollowing(removeFollowingButton.dataset.id); return; }
    const linkFilter = event.target.closest('[data-link-filter]'); if (linkFilter) { state.filters.link = linkFilter.dataset.linkFilter; renderLinks(); activateTabs(); return; }
    const watchFilter = event.target.closest('[data-watch-filter]'); if (watchFilter) { state.filters.watch = watchFilter.dataset.watchFilter; renderWatch(); activateTabs(); return; }
    const libraryFilter = event.target.closest('[data-library-filter]'); if (libraryFilter) { state.filters.library = libraryFilter.dataset.libraryFilter; renderLibrary(); activateTabs(); return; }
    const tagSearch = event.target.closest('[data-tag-search]'); if (tagSearch) { openInterestTag(tagSearch.dataset.tagSearch); return; }
    const interestRoute = event.target.closest('[data-interest-route]'); if (interestRoute) { openInterestGroup(interestRoute.dataset.interestRoute, interestRoute.dataset.interestTag); return; }
    const clearInterestTag = event.target.closest('[data-clear-interest-tag]'); if (clearInterestTag) { state.selectedInterestTag = ''; render(); scrollToRoute('interest'); return; }
  });
  document.addEventListener('input', (event) => {
    const map = { 'timeline-search': ['timeline', renderTimeline], 'following-search': ['following', renderFollowing], 'link-search': ['links', renderLinks], 'watch-search': ['watch', renderWatch], 'library-search': ['library', renderLibrary] };
    if (map[event.target.id]) { const [key, renderer] = map[event.target.id]; state.queries[key] = event.target.value; renderer(); }
    if (event.target.id === 'watch-progress') $('#watch-progress-value').value = `${event.target.value}%`;
  });
  document.addEventListener('change', (event) => {
    if (event.target.matches('[id^="setting-"]')) { const key = event.target.id.replace('setting-', ''); state.settings[key] = event.target.checked; persistCapture(); toast('本地设置已保存。', 'ok'); }
  });
  $('#link-form').addEventListener('submit', (event) => { event.preventDefault(); saveLink(event.currentTarget); });
  $('#watch-form').addEventListener('submit', (event) => { event.preventDefault(); saveWatch(event.currentTarget); });
  $('#follow-form').addEventListener('submit', (event) => { event.preventDefault(); saveFollowing(event.currentTarget); });
  $('#library-form').addEventListener('submit', (event) => { event.preventDefault(); saveManualLibrary(event.currentTarget); });
  $('#tag-form').addEventListener('submit', (event) => { event.preventDefault(); saveTagEditor(event.currentTarget); });
  $('#paste-link').addEventListener('click', async () => { try { const value = await navigator.clipboard.readText(); $('#link-url').value = value; $('#link-error').textContent = ''; toast('已从剪贴板填入链接。', 'ok'); } catch { $('#link-error').textContent = '浏览器未授予剪贴板权限，请手动粘贴链接。'; } });
  $('#search-form').addEventListener('submit', (event) => { event.preventDefault(); runSearch($('#global-search').value); });
  $('#refresh-data').addEventListener('click', () => { loadLocal(); hydrateBridge().catch(() => { render(); }); });
  $('#refresh-settings').addEventListener('click', () => { hydrateBridge().catch(() => toast('本机服务暂时不可用，已保留浏览器本地记录。', 'warn')); });
  $('#export-data').addEventListener('click', exportData);
  window.addEventListener('hashchange', () => { activeScrollRoute = route(); render(); document.getElementById(route())?.scrollIntoView({ behavior: 'smooth', block: 'start' }); });
  window.addEventListener('storage', (event) => {
    if ([CAPTURE_KEY, RESOURCE_KEY, WATCH_KEY, WATCH_BRIDGE_CACHE_KEY, WATCH_HIDDEN_KEY, LINK_KEY, LEGACY_LINK_KEY].includes(event.key)) {
      loadLocal();
      void refreshWatchProgress({ quiet: true });
    }
  });
  window.addEventListener('focus', refreshBridgeWhenReturning);
  document.addEventListener('visibilitychange', refreshBridgeWhenReturning);
  window.setInterval(() => {
    if (document.visibilityState === 'visible') void refreshWatchProgress({ quiet: true });
  }, 8_000);

  activeScrollRoute = route();
  loadLocal();
  installSectionNavigation();
  hydrateBridge().catch(() => { $('#bridge-state').textContent = '仅使用本地浏览器记录'; $('#bridge-state').className = 'status-pill warn'; $('#rail-status').textContent = '正在使用此浏览器本地记录'; $('#watch-mode').textContent = '本地记录'; render(); });
}());
