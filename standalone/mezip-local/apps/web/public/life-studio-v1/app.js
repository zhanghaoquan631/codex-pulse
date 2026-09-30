(() => {
  const BRIDGE = 'http://127.0.0.1:4327';
  const labels = { fitness: '健身记录', reading: '读书感悟', photos: '生活照片', community: '互动交流', 'study-chinese': '语文精选题', 'study-math': '数学精选题', 'study-english': '英语精选题', 'study-physics': '物理精选题', 'study-chemistry': '化学精选题', 'study-biology': '生物精选题' };
  const studyModules = ['study-chinese', 'study-math', 'study-english', 'study-physics', 'study-chemistry', 'study-biology'];
  const studyAreas = ['普通题记录', '学习方法', '二次结论', '试卷库', '创新题', '题型总结'];
  const isStudyEntry = (entry) => studyModules.includes(entry.module);
  const state = { entries: [], summary: null, online: false, studyFilters: Object.fromEntries(studyModules.map((module) => [module, '普通题记录'])) };
  const $ = (selector, root = document) => root.querySelector(selector);
  const $$ = (selector, root = document) => [...root.querySelectorAll(selector)];
  const escapeHtml = (value) => String(value ?? '').replace(/[&<>'"]/g, (character) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&#39;', '"': '&quot;' }[character]));
  const dateText = (value) => new Intl.DateTimeFormat('zh-CN', { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' }).format(new Date(value));

  async function request(path, options = {}) {
    const response = await fetch(`${BRIDGE}${path}`, { credentials: 'include', ...options, headers: { ...(options.body ? { 'Content-Type': 'application/json' } : {}), ...(options.headers || {}) } });
    const body = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(body.error?.message || '本地资料库暂时无法响应。');
    return body;
  }

  function setStatus(message, online = false) {
    state.online = online;
    const node = $('#service-status');
    node.textContent = message;
    node.style.color = online ? '#4f7a45' : '#b15443';
  }

  function renderMetrics() {
    const summary = state.summary || { total: 0, byModule: {} };
    $('#metric-total').textContent = summary.total ?? 0;
    for (const module of Object.keys(labels)) { const metric = $(`#metric-${module}`); if (metric) metric.textContent = summary.byModule?.[module] ?? 0; }
  }

  function entryMarkup(entry, community = false) {
    const tags = (entry.tags || []).map((tag) => `<span class="tag">#${escapeHtml(tag)}</span>`).join('');
    const studyMeta = isStudyEntry(entry)
      ? [entry.studyArea && `板块：${escapeHtml(entry.studyArea)}`, entry.questionType && `题型：${escapeHtml(entry.questionType)}`]
        .filter(Boolean)
        .join(' · ')
      : '';
    const meta = [
      Object.entries(entry.meta || {}).map(([key, value]) => `${escapeHtml(key)}：${escapeHtml(value)}`).join(' · '),
      studyMeta,
    ].filter(Boolean).join(' · ');
    const media = (entry.media || (entry.imageUrl ? [{ url: entry.imageUrl, fileName: entry.imageName }] : [])).map((item) => `<img loading="lazy" alt="${escapeHtml(item.fileName || entry.title)}" src="${BRIDGE}${item.url}" />`).join('');
    const reactButtons = `<div class="${community ? 'feed-actions' : 'entry-actions'}">
      <button class="mini-button ${entry.likedByMe ? 'active' : ''}" data-action="like" data-id="${entry.id}" type="button">♥ ${entry.likeCount || 0}</button>
      <button class="mini-button ${entry.favoritedByMe ? 'active' : ''}" data-action="favorite" data-id="${entry.id}" type="button">☆ 收藏 ${entry.favoriteCount || 0}</button>
      <button class="mini-button ${entry.librarySaved ? 'active' : ''}" data-action="library" data-library-saved="${entry.librarySaved ? 'true' : 'false'}" data-id="${entry.id}" type="button">${entry.librarySaved ? (isStudyEntry(entry) ? '★ 已入精选题' : '★ 已入私人资料库') : (isStudyEntry(entry) ? '☆ 加入精选题' : '☆ 加入私人资料库')}</button>
      ${entry.librarySaved ? `<button class="mini-button" data-action="share" data-id="${entry.id}" type="button">↗ 分享</button>` : ''}
      <button class="mini-button" data-action="delete" data-id="${entry.id}" type="button">移除</button>
    </div>`;
    const excerpt = String(entry.body || '').trim();
    if (!community) return `<article class="entry-card"><div class="entry-body"><span class="entry-type">${escapeHtml(entry.moduleLabel)} / ${dateText(entry.createdAt)}</span><h4>${escapeHtml(entry.title)}</h4><p class="entry-meta">${meta || '已从手机保存到本地生活档案。'}</p>${excerpt ? `<p class="entry-excerpt">${escapeHtml(excerpt)}</p>` : ''}<div class="tag-list">${tags}</div>${reactButtons}</div>${media ? `<div class="entry-gallery">${media}</div>` : ''}</article>`;
    const comments = (entry.comments || []).map((comment) => `<div class="comment"><b>${escapeHtml(comment.author)}：</b>${escapeHtml(comment.content)}</div>`).join('');
    return `<article class="feed-card"><div class="feed-head"><span class="author">${escapeHtml(entry.author || '访客')}</span><span class="created">${dateText(entry.createdAt)}</span></div><h4>${escapeHtml(entry.title)}</h4><p>${meta || '这条互动暂时没有附加说明。'}</p><div class="tag-list">${tags}</div>${media ? `<div class="entry-gallery">${media}</div>` : ''}${reactButtons}<form class="comment-form" data-comment="${entry.id}"><input maxlength="800" placeholder="写下你的回应…" aria-label="评论内容" /><button type="submit">评论</button></form><div class="comment-list">${comments || '<div class="comment">暂时还没有评论。</div>'}</div></article>`;
  }

  function emptyCard() {
    return $('#empty-template').innerHTML;
  }

  function renderStudySubject(module) {
    const scope = studyAreas.includes(state.studyFilters[module]) ? state.studyFilters[module] : '普通题记录';
    const allEntries = state.entries.filter((entry) => entry.module === module);
    const scopeEntries = scope === '普通题记录'
      ? allEntries.filter((entry) => !entry.librarySaved && (!entry.studyArea || entry.studyArea === '普通题记录'))
      : allEntries.filter((entry) => !entry.librarySaved && entry.studyArea === scope);
    const toolbar = $(`[data-study-toolbar="${module}"]`);
    const scopeNote = $(`#${module}-scope-note`);
    const entryLink = $(`[data-study-link="${module}"]`);
    const scopeCount = (area) => area === '普通题记录'
      ? allEntries.filter((entry) => !entry.librarySaved && (!entry.studyArea || entry.studyArea === '普通题记录')).length
      : allEntries.filter((entry) => !entry.librarySaved && entry.studyArea === area).length;
    if (toolbar) toolbar.innerHTML = studyAreas.map((area) => `<button class="study-filter ${area === scope ? 'active' : ''}" data-study-filter="${module}" data-study-area="${area}" type="button">${area}<b>${scopeCount(area)}</b></button>`).join('');
    if (scopeNote) scopeNote.textContent = scope === '普通题记录'
      ? '普通题会一直保留在这里；只有你主动点击「加入精选题」才会进入独立精选题资料库。'
      : `正在查看「${scope}」。重要内容可以再加入精选题资料库长期保存。`;
    if (entryLink) entryLink.innerHTML = `<button class="outline-button" data-generate="${module}" data-study-area="${scope}" type="button">生成${scope}手机入口</button>`;
    const container = $(`#${module}-list`);
    if (container) container.innerHTML = scopeEntries.length ? scopeEntries.map((entry) => entryMarkup(entry)).join('') : emptyCard();
  }

  function renderEntries() {
    for (const module of ['fitness', 'reading', 'photos']) {
      const container = $(`#${module}-list`);
      if (!container) continue;
      const entries = state.entries.filter((entry) => entry.module === module);
      container.innerHTML = entries.length ? entries.map((entry) => entryMarkup(entry)).join('') : emptyCard();
    }
    studyModules.forEach(renderStudySubject);
    const community = state.entries.filter((entry) => entry.module === 'community');
    $('#community-list').innerHTML = community.length ? community.map((entry) => entryMarkup(entry, true)).join('') : emptyCard();
    const featured = state.entries.filter((entry) => isStudyEntry(entry) && entry.librarySaved);
    const featuredList = $('#featured-problems-list');
    if (featuredList) featuredList.innerHTML = featured.length ? featured.map((entry) => entryMarkup(entry)).join('') : emptyCard();
    const library = state.entries.filter((entry) => entry.librarySaved && !isStudyEntry(entry));
    const libraryList = $('#library-list');
    if (libraryList) libraryList.innerHTML = library.length ? library.map((entry) => entryMarkup(entry, entry.module === 'community')).join('') : emptyCard();
  }

  async function loadRecords({ showError = true } = {}) {
    try {
      await request('/v1/life/desktop-session');
      const [health, summary, entries] = await Promise.all([request('/v1/life/health'), request('/v1/life/summary'), request('/v1/life/entries')]);
      state.summary = summary;
      state.entries = entries.entries || [];
      renderMetrics();
      renderEntries();
      setStatus(`本地资料库运行中 · ${health.entries ?? summary.total ?? 0} 条记录`, true);
      return true;
    } catch (error) {
      setStatus(error.message || '本地资料库未启动', false);
      if (showError) renderEntries();
      return false;
    }
  }

  async function react(entryId, action) {
    try { await request(`/v1/life/entries/${encodeURIComponent(entryId)}/react`, { method: 'POST', body: JSON.stringify({ action }) }); await loadRecords({ showError: false }); } catch (error) { window.alert(error.message); }
  }
  async function removeEntry(entryId) {
    if (!window.confirm('确定移除这条本地生活记录吗？对应本机图片也会被删除。')) return;
    try { await request(`/v1/life/entries/${encodeURIComponent(entryId)}`, { method: 'DELETE' }); await loadRecords({ showError: false }); } catch (error) { window.alert(error.message); }
  }
  async function toggleLibrary(entryId, current) {
    try { await request(`/v1/life/entries/${encodeURIComponent(entryId)}/library`, { method: 'POST', body: JSON.stringify({ saved: !current }) }); await loadRecords({ showError: false }); } catch (error) { window.alert(error.message); }
  }
  async function shareEntry(entryId) {
    try {
      const result = await request(`/v1/life/entries/${encodeURIComponent(entryId)}/share`, { method: 'POST', body: '{}' });
      try { await navigator.clipboard.writeText(result.shareUrl); } catch { /* the prompt below is the fallback */ }
      window.prompt('只读分享链接已生成。手机与电脑须同一可信 Wi-Fi，电脑服务运行时其他人才能查看：', result.shareUrl);
    } catch (error) { window.alert(error.message); }
  }
  async function comment(entryId, content) {
    try { await request(`/v1/life/entries/${encodeURIComponent(entryId)}/comments`, { method: 'POST', body: JSON.stringify({ content }) }); await loadRecords({ showError: false }); } catch (error) { window.alert(error.message); }
  }

  const dialog = $('#link-dialog');
  async function generateLink(module, studyArea = '') {
    const selectedStudyArea = module.startsWith('study-') && studyAreas.includes(studyArea) ? studyArea : '';
    $('#dialog-title').textContent = `${labels[module]} · 手机入口`;
    $('#dialog-description').textContent = module.startsWith('study-')
      ? `手机和电脑连接同一个可信 Wi‑Fi 后，可一次上传最多 6 张习题或笔记图片，选择题型、填写学习过程和总结。当前入口已预选「${selectedStudyArea || '普通题记录'}」；普通题只留在本学科历史区，标记为精选题才进入独立精选题资料库。`
      : '手机和电脑连接同一个可信 Wi‑Fi 后，拍照或从相册选择多张图片，填写标签、注释与相关内容，即可发送到电脑端。选择收藏后可生成只读分享链接。';
    $('#mobile-link').textContent = '正在生成本地链接…';
    $('#copy-link').textContent = '复制手机拍照链接';
    $('#open-mobile-link').href = '#';
    $('#open-mobile-link').setAttribute('aria-disabled', 'true');
    dialog.showModal();
    try {
      const params = new URLSearchParams({ module });
      if (selectedStudyArea) params.set('studyArea', selectedStudyArea);
      const result = await request(`/v1/life/invite?${params.toString()}`);
      $('#mobile-link').textContent = result.mobileUrl;
      $('#open-mobile-link').href = result.mobileUrl;
      $('#open-mobile-link').setAttribute('aria-disabled', 'false');
    } catch (error) {
      $('#mobile-link').textContent = `生成失败：${error.message}`;
    }
  }

  async function copyLink() {
    const text = $('#mobile-link').textContent;
    if (!/^http/u.test(text)) return;
    try { await navigator.clipboard.writeText(text); $('#copy-link').textContent = '已复制'; } catch { window.prompt('请复制下面的本地手机链接：', text); }
  }

  function installInteractionHandlers() {
    document.addEventListener('click', (event) => {
      const studyFilter = event.target.closest('[data-study-filter]');
      if (studyFilter) {
        state.studyFilters[studyFilter.dataset.studyFilter] = studyFilter.dataset.studyArea;
        renderStudySubject(studyFilter.dataset.studyFilter);
        return;
      }
      const generated = event.target.closest('[data-generate]');
      if (generated) { generateLink(generated.dataset.generate, generated.dataset.studyArea); return; }
      const action = event.target.closest('[data-action]');
      if (!action) return;
      if (action.dataset.action === 'delete') removeEntry(action.dataset.id);
      else if (action.dataset.action === 'library') toggleLibrary(action.dataset.id, action.dataset.librarySaved === 'true');
      else if (action.dataset.action === 'share') shareEntry(action.dataset.id);
      else react(action.dataset.id, action.dataset.action);
    });
    document.addEventListener('submit', (event) => {
      const form = event.target.closest('[data-comment]');
      if (!form) return;
      event.preventDefault();
      const input = $('input', form);
      if (!input.value.trim()) return;
      comment(form.dataset.comment, input.value.trim());
      input.value = '';
    });
    $('#dialog-close').addEventListener('click', () => dialog.close());
    $('#copy-link').addEventListener('click', copyLink);
    $('#refresh').addEventListener('click', () => loadRecords());
  }

  function installScrollSystem() {
    const nav = $$('.nav-link');
    const observer = new IntersectionObserver((records) => {
      const current = records.filter((record) => record.isIntersecting).sort((a, b) => b.intersectionRatio - a.intersectionRatio)[0];
      if (!current) return;
      nav.forEach((link) => link.classList.toggle('active', link.dataset.target === current.target.dataset.section));
    }, { rootMargin: '-22% 0px -60% 0px', threshold: [0.05, .3] });
    $$('[data-section]').forEach((section) => observer.observe(section));
    const reveal = new IntersectionObserver((records) => records.forEach((record) => { if (record.isIntersecting) { record.target.classList.add('visible'); reveal.unobserve(record.target); } }), { threshold: .1 });
    $$('.reveal').forEach((element) => reveal.observe(element));
  }

  function installLiveRefresh() {
    try {
      const stream = new EventSource(`${BRIDGE}/v1/life/events`, { withCredentials: true });
      stream.addEventListener('life', () => loadRecords({ showError: false }));
      stream.onerror = () => { if (state.online) setStatus('本地资料库连接暂时中断，正在重试…', false); };
    } catch { /* ordinary refresh remains available */ }
  }

  installInteractionHandlers();
  installScrollSystem();
  loadRecords().then((online) => { if (online) installLiveRefresh(); });
})();
