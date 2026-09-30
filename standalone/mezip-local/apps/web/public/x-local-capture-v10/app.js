(function () {
  'use strict';

  const API = localStorage.getItem('mezip.x.local.capture.api') || 'http://127.0.0.1:4319';
  const CAPTURE_KEY = 'mezip.x.local.capture.browser.v3';
  const RESOURCE_KEY = 'mezip.resource.records.v1.browser-local';
  const WATCH_KEY = 'mezip.x.local.capture.v9.watch.v1';
  const LINK_KEY = 'mezip.x-link-archive.shared.v1';
  const LEGACY_LINK_KEY = 'mezip.x-link-archive.v1';
  const VALID_ROUTES = new Set(['overview', 'timeline', 'links', 'watch', 'library', 'interest', 'settings']);
  const TYPE_LABEL = { X_LINK: '帖子', WEBPAGE: '网页', ARTICLE: '文章', CODE: '代码', APP: '应用', VIDEO: '视频', MOVIE: '电影', X: 'X' };
  const ACTION_LABEL = { like: '点赞', liked: '点赞', unlike: '取消点赞', bookmark: '收藏', bookmarked: '收藏', unbookmark: '取消收藏', viewed: '浏览', opened: '打开内容', copied_link: '复制链接', share_to_mezip: '分享到 ME.zip', manual_save: '主动保存' };
  const defaultSettings = { enabled: true, captureSharedLinks: true, watchCapture: true, savePageMetadata: true };
  let revealObserver = null;
  const state = {
    events: [], resources: [], savedLinks: [], watch: [], library: [],
    settings: { ...defaultSettings }, bridgeReady: false,
    filters: { event: 'all', link: 'all', watch: 'all', library: 'all' },
    queries: { timeline: '', links: '', watch: '', library: '' }
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
  const sourceUrl = (item) => text(item?.sourceUrl || item?.url || item?.postUrl || item?.link || '');
  const kindOf = (item) => text(item?.resourceType || item?.contentType || item?.sourceType || item?.type || 'X_LINK').toUpperCase();
  const platformOf = (item) => text(item?.platform || item?.sourcePlatform || item?.domain || item?.provider || '未知来源');
  const titleOf = (item) => text(item?.title || item?.pageTitle || item?.content || item?.postText || item?.sourceTitle || item?.url || '未命名内容');
  const authorOf = (item) => text(item?.author || item?.authorName || item?.creator || item?.publisher || item?.handle || '');
  const descriptionOf = (item) => text(item?.description || item?.note || item?.purpose || item?.content || item?.postText || '');
  const safeUrl = (value) => { try { return normalizeUrl(value); } catch { return ''; } };
  const unique = (items, key) => {
    const seen = new Set();
    return items.filter((item) => { const id = key(item); if (!id || seen.has(id)) return false; seen.add(id); return true; });
  };
  const placeholder = (message) => `<div class="empty-state">${escapeHtml(message)}</div>`;

  function toast(message, mode = '') {
    const old = $('.toast'); if (old) old.remove();
    const node = document.createElement('div'); node.className = `toast ${mode}`; node.textContent = message; document.body.appendChild(node);
    window.setTimeout(() => node.remove(), 3400);
  }

  function localCapture() { return read(CAPTURE_KEY, {}); }
  function persistCapture() {
    const current = localCapture();
    write(CAPTURE_KEY, { ...current, events: state.events, privateLibrary: state.library, settings: { ...(current.settings || {}), ...state.settings } });
  }
  function persistResources() { write(RESOURCE_KEY, state.resources); }
  function persistWatch() { write(WATCH_KEY, state.watch.filter((item) => item.origin === 'V9_LOCAL')); }
  function persistLinks() { write(LINK_KEY, state.savedLinks); }

  function asResource(link) {
    const url = safeUrl(link.url || link.sourceUrl || link.postUrl);
    if (!url) return null;
    return {
      id: text(link.id) || uid('link'), resourceType: kindOf(link), title: titleOf(link), platform: platformOf(link),
      author: authorOf(link), description: descriptionOf(link), note: text(link.note || link.purpose), tags: tags(link.tags),
      sourceUrl: url, url, createdAt: link.createdAt || now(), updatedAt: link.updatedAt || link.createdAt || now(), origin: link.origin || 'SHARED_LINK'
    };
  }
  function asWatch(item, origin = 'BRIDGE') {
    const url = safeUrl(item.url || item.sourceUrl || item.postUrl);
    const progress = Math.max(0, Math.min(100, Number(item.progressPercent ?? item.progress ?? 0) || 0));
    const duration = Math.max(0, Number(item.durationSeconds || item.duration || 0) || 0);
    return {
      id: text(item.id) || uid('watch'), origin, contentType: kindOf(item) === 'EPISODE' ? 'VIDEO' : (kindOf(item) === 'MOVIE' ? 'MOVIE' : 'VIDEO'),
      title: titleOf(item), platform: platformOf(item), creator: authorOf(item), url, sourceUrl: url,
      note: descriptionOf(item), tags: tags(item.tags), progressPercent: progress,
      durationSeconds: duration, currentTimeSeconds: Math.max(0, Number(item.currentTimeSeconds || duration * progress / 100 || 0)),
      status: text(item.status) || (progress >= 99 ? 'COMPLETED' : 'IN_PROGRESS'), lastWatchedAt: item.lastWatchedAt || item.updatedAt || item.createdAt || now(), createdAt: item.createdAt || now(), updatedAt: item.updatedAt || item.lastWatchedAt || now()
    };
  }
  function loadLocal() {
    const capture = localCapture();
    state.events = Array.isArray(capture.events) ? capture.events : [];
    state.library = Array.isArray(capture.privateLibrary) ? capture.privateLibrary : [];
    state.settings = { ...defaultSettings, ...(capture.settings || {}) };
    state.resources = Array.isArray(read(RESOURCE_KEY, [])) ? read(RESOURCE_KEY, []) : [];
    state.savedLinks = unique([...(Array.isArray(read(LINK_KEY, [])) ? read(LINK_KEY, []) : []), ...(Array.isArray(read(LEGACY_LINK_KEY, [])) ? read(LEGACY_LINK_KEY, []) : [])], (item) => safeUrl(item.url || item.sourceUrl || item.postUrl) || item.id);
    state.watch = (Array.isArray(read(WATCH_KEY, [])) ? read(WATCH_KEY, []) : []).map((item) => asWatch(item, 'V9_LOCAL'));
    const sharedResources = state.savedLinks.map(asResource).filter(Boolean);
    state.resources = unique([...state.resources, ...sharedResources], (item) => safeUrl(sourceUrl(item)) || item.id);
    render();
  }

  function mergeRemote(items, remote, key) { return unique([...(Array.isArray(items) ? items : []), ...(Array.isArray(remote) ? remote : [])], key); }
  async function fetchJson(path) {
    const response = await fetch(`${API}${path}`, { headers: { Accept: 'application/json' }, credentials: 'omit' });
    if (!response.ok) throw new Error(`本机服务返回 ${response.status}`);
    return response.json();
  }
  async function hydrateBridge() {
    const status = $('#bridge-state');
    status.textContent = '正在读取本机服务…'; status.className = 'status-pill';
    const settled = await Promise.allSettled([
      fetchJson('/v1/x/local-capture/settings'), fetchJson('/v1/x/local-capture/timeline?limit=150'),
      fetchJson('/v1/x/local-capture/private-library'), fetchJson('/v1/watch/records?limit=150')
    ]);
    const [settings, timeline, library, watches] = settled;
    let found = false;
    if (settings.status === 'fulfilled') { state.settings = { ...state.settings, ...(settings.value?.settings || settings.value || {}) }; found = true; }
    if (timeline.status === 'fulfilled') { state.events = mergeRemote(state.events, timeline.value?.events || timeline.value?.items || timeline.value || [], (item) => text(item.id) || `${sourceUrl(item)}:${item.actionType}:${item.capturedAt}`); found = true; }
    if (library.status === 'fulfilled') { state.library = mergeRemote(state.library, library.value?.items || library.value?.library || library.value || [], (item) => text(item.id) || sourceUrl(item)); found = true; }
    if (watches.status === 'fulfilled') { state.watch = mergeRemote(state.watch, (watches.value?.items || watches.value?.records || watches.value || []).map((item) => asWatch(item, 'BRIDGE')), (item) => sourceUrl(item) || `${item.title}:${item.contentType}`); found = true; }
    state.bridgeReady = found;
    persistCapture(); persistWatch();
    status.textContent = found ? '本机服务已读取' : '仅使用本地浏览器记录';
    status.className = `status-pill ${found ? 'ok' : 'warn'}`;
    $('#rail-status').textContent = found ? '本机记录已同步到工作台' : '正在使用此浏览器本地记录';
    $('#watch-mode').textContent = found ? '本机桥接 + 本地记录' : '本地记录';
    render();
  }

  function eventsForDisplay() { return latestFirst(state.events, 'capturedAt'); }
  function linksForDisplay() { return latestFirst(state.resources, 'updatedAt'); }
  function watchesForDisplay() { return latestFirst(state.watch, 'lastWatchedAt'); }
  function isPrivate(item) { return Boolean(item?.privacy === 'PRIVATE' || item?.metadata?.private || item?.private); }
  function libraryForDisplay() { return latestFirst(state.library, 'addedAt'); }
  function itemText(item) { return [titleOf(item), sourceUrl(item), platformOf(item), authorOf(item), descriptionOf(item), ...(tags(item.tags))].join(' ').toLowerCase(); }
  function matches(item, query) { return !text(query) || itemText(item).includes(text(query).toLowerCase()); }
  function actionClass(item) { return text(item.actionType || item.type).toLowerCase(); }
  function actionIcon(item) { const action = actionClass(item); if (action.includes('bookmark')) return '⌑'; if (action.includes('like')) return '♥'; if (action.includes('view') || action.includes('open')) return '◉'; if (action.includes('copy')) return '⧉'; return '↗'; }
  function actionName(item) { return ACTION_LABEL[actionClass(item)] || '已保存记录'; }
  function tagHtml(items) { return tags(items).slice(0, 3).map((tag) => `<span class="tag">${escapeHtml(tag)}</span>`).join(''); }
  function urlLink(item) { const url = safeUrl(sourceUrl(item)); return url ? `<a class="source-link" href="${escapeHtml(url)}" target="_blank" rel="noopener noreferrer">打开原始内容 ↗</a>` : `<span class="source-link" title="该记录没有保存原始链接">原始链接不可用</span>`; }
  function recordSource(kind, id) {
    if (kind === 'event') return state.events.find((item) => String(item.id) === String(id));
    if (kind === 'link') return state.resources.find((item) => String(item.id) === String(id));
    if (kind === 'watch') return state.watch.find((item) => String(item.id) === String(id));
    return null;
  }

  function renderOverview() {
    const events = eventsForDisplay(); const links = linksForDisplay(); const watch = watchesForDisplay(); const library = libraryForDisplay();
    const liked = events.filter((item) => actionClass(item).includes('like') && !actionClass(item).includes('unlike')).length;
    const bookmarked = events.filter((item) => actionClass(item).includes('bookmark') && !actionClass(item).includes('unbookmark')).length;
    const metricData = [
      ['已读记录', events.length, '点赞、收藏与浏览', 'violet'], ['主动链接', links.length, '网页、文章、代码与应用', 'gold'],
      ['观看记录', watch.length, `${watch.filter((item) => item.status === 'COMPLETED').length} 条已看完`, 'green'], ['私人资料', library.length, '仅你主动再次收藏', 'violet'], ['互动信号', liked + bookmarked, `${liked} 点赞 · ${bookmarked} 收藏`, 'gold']
    ];
    $('#metrics').innerHTML = metricData.map(([label, value, detail, tone]) => `<article class="metric ${tone}"><span class="metric-kicker">${label}</span><strong>${value}</strong><small>${detail}</small></article>`).join('');
    $('#recent-records').innerHTML = events.length ? events.slice(0, 4).map(renderMiniEvent).join('') : placeholder('还没有读取到行为记录。可在左侧打开“任意链接收集”，从这里开始保存。');
    $('#library-preview').innerHTML = library.length ? library.slice(0, 4).map(renderMiniLibrary).join('') : placeholder('资料库暂时为空。对任意链接、点赞、收藏或观看记录点击“加入私人资料库”。');
  }
  function renderMiniEvent(item) { return `<article class="record-row"><span class="record-symbol">${actionIcon(item)}</span><div><strong>${escapeHtml(titleOf(item))}</strong><small>${escapeHtml(actionName(item))} · ${escapeHtml(platformOf(item))}</small></div><span class="record-time">${escapeHtml(formatDate(item.capturedAt || item.createdAt))}</span></article>`; }
  function renderMiniLibrary(item) { return `<article class="record-row"><span class="record-symbol">★</span><div><strong>${escapeHtml(titleOf(item))}</strong><small>${escapeHtml(platformOf(item))} · 默认私密</small></div><span class="record-time">${escapeHtml(formatDate(item.addedAt || item.createdAt))}</span></article>`; }

  function renderTimeline() {
    const filter = state.filters.event; const query = state.queries.timeline;
    const items = eventsForDisplay().filter((item) => {
      const action = actionClass(item);
      const inFilter = filter === 'all' || (filter === 'like' && action.includes('like') && !action.includes('unlike')) || (filter === 'bookmark' && action.includes('bookmark') && !action.includes('unbookmark')) || (filter === 'viewed' && (action.includes('view') || action.includes('open'))) || (filter === 'saved' && (action.includes('save') || action.includes('copy') || action.includes('share')));
      return inFilter && matches(item, query);
    });
    $('#timeline-list').innerHTML = items.length ? items.map((item) => `<article class="timeline-card"><span class="action-mark">${actionIcon(item)}</span><div class="timeline-info"><h3>${escapeHtml(titleOf(item))}</h3><p>${escapeHtml(actionName(item))} · ${escapeHtml(platformOf(item))} · ${escapeHtml(formatDate(item.capturedAt || item.createdAt))}</p><div class="card-meta">${tagHtml(item.tags)}</div></div><div class="card-actions">${urlLink(item)}<button class="button ghost" data-add-library data-kind="event" data-id="${escapeHtml(item.id)}">加入资料库</button></div></article>`).join('') : placeholder('当前筛选下没有记录。');
  }
  function renderLinks() {
    const filter = state.filters.link; const query = state.queries.links;
    const items = linksForDisplay().filter((item) => (filter === 'all' || kindOf(item) === filter) && matches(item, query));
    $('#link-list').innerHTML = items.length ? items.map((item) => renderLinkCard(item)).join('') : placeholder('还没有收集链接。点击“收集链接”可以保存网页、文章、代码、帖子、应用、电影或视频。');
  }
  function renderLinkCard(item) { const kind = kindOf(item); return `<article class="link-card"><span class="link-type">${escapeHtml((TYPE_LABEL[kind] || kind).slice(0, 2))}</span><div class="link-copy"><h3>${escapeHtml(titleOf(item))}</h3><span class="url-text">${escapeHtml(sourceUrl(item))}</span><p>${escapeHtml(descriptionOf(item) || `${platformOf(item)} · ${authorOf(item) || '未填写作者'}`)}</p><div class="card-meta"><span class="tag">${escapeHtml(TYPE_LABEL[kind] || kind)}</span><span class="tag">${escapeHtml(platformOf(item))}</span>${tagHtml(item.tags)}</div></div><div class="card-actions">${urlLink(item)}<button class="button ghost" data-add-library data-kind="link" data-id="${escapeHtml(item.id)}">加入资料库</button></div></article>`; }
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
      return `<article class="watch-card"><span class="watch-cover">${kindOf(item) === 'MOVIE' ? 'FILM' : 'PLAY'}</span><div class="watch-copy"><h3>${escapeHtml(titleOf(item))}</h3><p>${escapeHtml(platformOf(item))}${authorOf(item) ? ` · ${escapeHtml(authorOf(item))}` : ''}${item.origin === 'V9_LOCAL' ? ' · 本地登记' : ' · 本机桥接'}</p><div class="watch-progress"><span style="width:${progress}%"></span></div><div class="card-meta"><span class="tag">${escapeHtml(TYPE_LABEL[kindOf(item)] || '视频')}</span><span class="tag">${progress}% · ${escapeHtml(formatDuration(current))}${item.durationSeconds ? ` / ${escapeHtml(formatDuration(item.durationSeconds))}` : ''}</span>${tagHtml(item.tags)}</div></div><div class="watch-side">${progress}%<small>${progress >= 99 ? '已看完' : '继续观看'}</small></div><div class="card-actions">${urlLink(item)}<button class="button ghost" data-watch-complete data-id="${escapeHtml(item.id)}">${progress >= 99 ? '标为继续' : '标为看完'}</button><button class="button ghost" data-add-library data-kind="watch" data-id="${escapeHtml(item.id)}">加入资料库</button></div></article>`;
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
    return `<article class="library-card"><div class="library-top"><span class="tag">${escapeHtml(TYPE_LABEL[libraryType(item)] || libraryType(item))}</span><span class="star">★</span></div><h3>${escapeHtml(titleOf(item))}</h3><p>${escapeHtml(descriptionOf(item) || `${platformOf(item)} · ${authorOf(item) || '私人保存内容'}`)}</p><div class="card-meta">${tagHtml(item.tags)}</div><div class="library-bottom"><small>${escapeHtml(platformOf(item))} · ${escapeHtml(formatDate(item.addedAt || item.createdAt))}</small><div class="card-actions">${urlLink(item)}<button class="button ghost" data-remove-library data-id="${escapeHtml(item.id)}">移出资料库</button></div></div></article>`;
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
      return `<section class="library-group" data-library-group="${key}"><div class="library-group-head"><div><span class="micro">${key === 'movies' ? 'FILM ARCHIVE' : key === 'videos' ? 'VIDEO ARCHIVE' : 'LINK ARCHIVE'}</span><h2>${title}</h2><p>${detail}</p></div><span class="group-count">${grouped.length} 条</span></div><div class="library-grid">${cards}</div></section>`;
    }).join('');
    $('#library-groups').innerHTML = output;
  }
  function renderInterest() {
    const all = [...state.resources, ...state.watch, ...state.library, ...state.events]; const counts = new Map();
    all.forEach((item) => tags(item.tags).forEach((tag) => counts.set(tag, (counts.get(tag) || 0) + 1)));
    const tagItems = [...counts.entries()].sort((a, b) => b[1] - a[1]);
    $('#tag-cloud').innerHTML = tagItems.length ? tagItems.map(([tag, count]) => `<button class="interest-tag" data-tag-search="${escapeHtml(tag)}">${escapeHtml(tag)} <b>${count}</b></button>`).join('') : placeholder('保存链接或资料时加入标签，这里会根据真实内容自动归纳。');
    const groups = [['链接', state.resources.length], ['观看', state.watch.length], ['私人资料', state.library.length]];
    $('#interest-summary').innerHTML = groups.map(([label, count]) => `<div><strong>${count}</strong><span>${label}</span></div>`).join('');
  }
  function setSettingInputs() { ['enabled', 'captureSharedLinks', 'watchCapture', 'savePageMetadata'].forEach((key) => { const node = $(`#setting-${key}`); if (node) node.checked = Boolean(state.settings[key]); }); }
  function activateTabs() { $$('#event-filters button').forEach((button) => button.classList.toggle('active', button.dataset.filter === state.filters.event)); $$('#link-filters button').forEach((button) => button.classList.toggle('active', button.dataset.linkFilter === state.filters.link)); $$('#watch-filters button').forEach((button) => button.classList.toggle('active', button.dataset.watchFilter === state.filters.watch)); $$('#library-filters button').forEach((button) => button.classList.toggle('active', button.dataset.libraryFilter === state.filters.library)); }
  function render() {
    $$('.view').forEach((node) => node.classList.toggle('active', node.dataset.view === route()));
    $$('.nav-list a').forEach((node) => node.classList.toggle('active', node.dataset.route === route()));
    renderOverview(); renderTimeline(); renderLinks(); renderWatch(); renderLibrary(); renderInterest(); setSettingInputs(); activateTabs(); queueReveal();
  }

  function queueReveal() {
    window.requestAnimationFrame(() => {
      const targets = $$('.view.active .panel, .view.active .feature-card, .view.active .timeline-card, .view.active .link-card, .view.active .watch-card, .view.active .library-card, .view.active .library-group');
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

  function addToLibrary(kind, id) {
    const source = recordSource(kind, id); if (!source) return toast('找不到原始记录，无法加入资料库。', 'warn');
    const url = sourceUrl(source); const duplicate = state.library.some((item) => (url && sourceUrl(item) === url) || (item.metadata?.sourceKind === kind && String(item.metadata?.sourceId) === String(id)));
    if (duplicate) return toast('它已经在私人资料库中。', 'warn');
    const entry = { id: uid('private'), title: titleOf(source), sourceUrl: url, url, sourceType: kindOf(source), sourcePlatform: platformOf(source), author: authorOf(source), description: descriptionOf(source), note: descriptionOf(source), tags: tags(source.tags), privacy: 'PRIVATE', addedAt: now(), createdAt: now(), metadata: { sourceKind: kind, sourceId: id, private: true } };
    state.library.unshift(entry); persistCapture(); render(); toast('已加入私人资料库。', 'ok');
  }
  function removeFromLibrary(id) { const before = state.library.length; state.library = state.library.filter((item) => String(item.id) !== String(id)); if (state.library.length === before) return; persistCapture(); render(); toast('已从私人资料库移出；原始记录不受影响。'); }
  function toggleCompleted(id) {
    const record = state.watch.find((item) => String(item.id) === String(id)); if (!record) return;
    const done = record.status === 'COMPLETED' || Number(record.progressPercent) >= 99;
    record.status = done ? 'IN_PROGRESS' : 'COMPLETED'; record.progressPercent = done ? Math.min(98, Number(record.progressPercent) || 0) : 100; record.currentTimeSeconds = done ? record.currentTimeSeconds : record.durationSeconds || record.currentTimeSeconds; record.updatedAt = now(); record.lastWatchedAt = now();
    persistWatch(); render(); toast(done ? '已改为继续观看。' : '已标记为看完。', 'ok');
  }

  function closeDialog(id) { const dialog = $(`#${id}`); if (dialog?.open) dialog.close(); }
  function openDialog(kind) { const dialog = $(`#${kind}-dialog`); if (!dialog) return; $(`#${kind}-error`).textContent = ''; dialog.showModal(); }
  function platformFromUrl(url) { try { return new URL(url).hostname.replace(/^www\./, ''); } catch { return ''; } }
  function saveLink(form) {
    if (!state.settings.enabled || !state.settings.captureSharedLinks) { $('#link-error').textContent = '请在“本地设置”中启用主动链接收集后再保存。'; return; }
    const data = new FormData(form); let url;
    try { url = normalizeUrl(data.get('link-url')); } catch (error) { $('#link-error').textContent = error.message; return; }
    const existing = state.resources.find((item) => sourceUrl(item) === url); const item = existing || { id: uid('resource'), createdAt: now(), origin: 'V9_LOCAL' };
    Object.assign(item, { resourceType: text(data.get('link-type')) || 'WEBPAGE', title: text(data.get('link-title')) || new URL(url).hostname, platform: text(data.get('link-platform')) || platformFromUrl(url), author: text(data.get('link-author')), description: text(data.get('link-description')), note: text(data.get('link-description')), tags: tags(data.get('link-tags')), url, sourceUrl: url, updatedAt: now() });
    if (!existing) state.resources.unshift(item);
    const eventExists = state.events.some((entry) => sourceUrl(entry) === url && actionClass(entry) === 'manual_save');
    if (!eventExists) state.events.unshift({ id: uid('event'), actionType: 'manual_save', pageTitle: item.title, postUrl: url, platform: item.platform, note: item.description, tags: item.tags, capturedAt: now(), createdAt: now() });
    const saved = state.savedLinks.find((entry) => sourceUrl(entry) === url); const savedLink = saved || { id: uid('saved-link'), createdAt: now() };
    Object.assign(savedLink, { url, sourceUrl: url, title: item.title, purpose: item.description, tags: item.tags, updatedAt: now() }); if (!saved) state.savedLinks.unshift(savedLink);
    persistResources(); persistCapture(); persistLinks(); form.reset(); closeDialog('link-dialog'); render(); toast(existing ? '已更新这条本地链接记录。' : '已收集到本机，可随时加入私人资料库。', 'ok');
  }
  function saveWatch(form) {
    if (!state.settings.enabled || !state.settings.watchCapture) { $('#watch-error').textContent = '请在“本地设置”中启用观看记录后再保存。'; return; }
    const data = new FormData(form); let url;
    try { url = normalizeUrl(data.get('watch-url')); } catch (error) { $('#watch-error').textContent = error.message; return; }
    const duration = Math.max(0, Number(data.get('watch-duration')) || 0) * 60; const progress = Math.max(0, Math.min(100, Number($('#watch-progress').value) || 0));
    const existing = state.watch.find((item) => item.origin === 'V9_LOCAL' && sourceUrl(item) === url); const item = existing || { id: uid('watch'), createdAt: now(), origin: 'V9_LOCAL' };
    Object.assign(item, { contentType: text(data.get('watch-type')) || 'VIDEO', title: text(data.get('watch-title')) || new URL(url).hostname, platform: text(data.get('watch-platform')) || platformFromUrl(url), creator: text(data.get('watch-creator')), url, sourceUrl: url, durationSeconds: duration, progressPercent: progress, currentTimeSeconds: duration ? Math.round(duration * progress / 100) : 0, status: progress >= 99 ? 'COMPLETED' : 'IN_PROGRESS', note: text(data.get('watch-note')), tags: tags(data.get('watch-tags')), lastWatchedAt: now(), updatedAt: now() });
    if (!existing) state.watch.unshift(item);
    persistWatch(); form.reset(); $('#watch-progress-value').value = '0%'; closeDialog('watch-dialog'); render(); toast('观看记录已保存到本机。', 'ok');
  }
  function exportData() {
    const payload = { exportedAt: now(), version: 'ME.zip Capture V10', events: state.events, links: state.resources, watch: state.watch, privateLibrary: state.library, settings: state.settings };
    const blob = new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' }); const href = URL.createObjectURL(blob); const a = document.createElement('a'); a.href = href; a.download = `mezip-capture-v10-${new Date().toISOString().slice(0, 10)}.json`; a.click(); URL.revokeObjectURL(href); toast('已导出本地记录 JSON。', 'ok');
  }
  function runSearch(query) {
    const needle = text(query); if (!needle) return;
    const targets = [ ['links', linksForDisplay()], ['watch', watchesForDisplay()], ['library', libraryForDisplay()], ['timeline', eventsForDisplay()] ];
    const match = targets.find(([, items]) => items.some((item) => matches(item, needle)));
    const destination = match ? match[0] : 'links';
    state.queries[destination === 'timeline' ? 'timeline' : destination] = needle;
    location.hash = destination; render(); toast(match ? `已定位到“${destination === 'links' ? '任意链接收集' : destination === 'watch' ? '电影与视频' : destination === 'library' ? '私人资料库' : '行为记录'}”。` : '没有找到结果；你可以直接收集这条链接。', match ? 'ok' : 'warn');
  }

  document.addEventListener('click', (event) => {
    const routeButton = event.target.closest('[data-route-go]'); if (routeButton) { location.hash = routeButton.dataset.routeGo; return; }
    const dialogButton = event.target.closest('[data-open-dialog]'); if (dialogButton) { openDialog(dialogButton.dataset.openDialog); return; }
    const close = event.target.closest('[data-close-dialog]'); if (close) { closeDialog(close.dataset.closeDialog); return; }
    const add = event.target.closest('[data-add-library]'); if (add) { addToLibrary(add.dataset.kind, add.dataset.id); return; }
    const remove = event.target.closest('[data-remove-library]'); if (remove) { removeFromLibrary(remove.dataset.id); return; }
    const complete = event.target.closest('[data-watch-complete]'); if (complete) { toggleCompleted(complete.dataset.id); return; }
    const eventFilter = event.target.closest('[data-filter]'); if (eventFilter) { state.filters.event = eventFilter.dataset.filter; renderTimeline(); activateTabs(); return; }
    const linkFilter = event.target.closest('[data-link-filter]'); if (linkFilter) { state.filters.link = linkFilter.dataset.linkFilter; renderLinks(); activateTabs(); return; }
    const watchFilter = event.target.closest('[data-watch-filter]'); if (watchFilter) { state.filters.watch = watchFilter.dataset.watchFilter; renderWatch(); activateTabs(); return; }
    const libraryFilter = event.target.closest('[data-library-filter]'); if (libraryFilter) { state.filters.library = libraryFilter.dataset.libraryFilter; renderLibrary(); activateTabs(); return; }
    const tagSearch = event.target.closest('[data-tag-search]'); if (tagSearch) { state.queries.links = tagSearch.dataset.tagSearch; location.hash = 'links'; render(); return; }
  });
  document.addEventListener('input', (event) => {
    const map = { 'timeline-search': ['timeline', renderTimeline], 'link-search': ['links', renderLinks], 'watch-search': ['watch', renderWatch], 'library-search': ['library', renderLibrary] };
    if (map[event.target.id]) { const [key, renderer] = map[event.target.id]; state.queries[key] = event.target.value; renderer(); }
    if (event.target.id === 'watch-progress') $('#watch-progress-value').value = `${event.target.value}%`;
  });
  document.addEventListener('change', (event) => {
    if (event.target.matches('[id^="setting-"]')) { const key = event.target.id.replace('setting-', ''); state.settings[key] = event.target.checked; persistCapture(); toast('本地设置已保存。', 'ok'); }
  });
  $('#link-form').addEventListener('submit', (event) => { event.preventDefault(); saveLink(event.currentTarget); });
  $('#watch-form').addEventListener('submit', (event) => { event.preventDefault(); saveWatch(event.currentTarget); });
  $('#paste-link').addEventListener('click', async () => { try { const value = await navigator.clipboard.readText(); $('#link-url').value = value; $('#link-error').textContent = ''; toast('已从剪贴板填入链接。', 'ok'); } catch { $('#link-error').textContent = '浏览器未授予剪贴板权限，请手动粘贴链接。'; } });
  $('#search-form').addEventListener('submit', (event) => { event.preventDefault(); runSearch($('#global-search').value); });
  $('#refresh-data').addEventListener('click', () => { loadLocal(); hydrateBridge().catch(() => { render(); }); });
  $('#refresh-settings').addEventListener('click', () => { hydrateBridge().catch(() => toast('本机服务暂时不可用，已保留浏览器本地记录。', 'warn')); });
  $('#export-data').addEventListener('click', exportData);
  window.addEventListener('hashchange', render);
  window.addEventListener('storage', (event) => { if ([CAPTURE_KEY, RESOURCE_KEY, WATCH_KEY, LINK_KEY, LEGACY_LINK_KEY].includes(event.key)) loadLocal(); });

  loadLocal();
  hydrateBridge().catch(() => { $('#bridge-state').textContent = '仅使用本地浏览器记录'; $('#bridge-state').className = 'status-pill warn'; $('#rail-status').textContent = '正在使用此浏览器本地记录'; $('#watch-mode').textContent = '本地记录'; render(); });
}());
