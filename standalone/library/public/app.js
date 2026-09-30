const seedItems = [];

const storedItems = (() => {
  try { return JSON.parse(localStorage.getItem('lingan-content') || 'null'); } catch { return null; }
})();
const contentItems = Array.isArray(storedItems) ? storedItems : seedItems;

const seedMaterials = [];
const storedMaterials = (() => { try { return JSON.parse(localStorage.getItem('lingan-materials') || 'null'); } catch { return null; } })();
const materialItems = Array.isArray(storedMaterials) ? storedMaterials : seedMaterials;
const storedTags = (() => { try { return JSON.parse(localStorage.getItem('lingan-tags') || 'null'); } catch { return null; } })();
const customTags = Array.isArray(storedTags) ? storedTags : [];
let materialBoxes = [];
let apiEnabled = false;
let newsletters = [];
let activeNewsletterId = null;
let composerPreviewData = null;
let previewTimer = null;
let previewGeneration = 0;
let previewPending = false;
const selectedItems = new Set();
let serverRevision = null;
let saveQueue = Promise.resolve();
let saveBatch = {failure: null};
let unsavedChanges = false;
let saveGeneration = 0;
let persistedState = null;
let queuedState = null;
let composerSession = 0;
let composerDraftId = null;
let composerAutomatic = {};
let composerDraftBase = null;
let composerDraftPending = null;

const views = [...document.querySelectorAll('.view')];
const navItems = [...document.querySelectorAll('.nav-item[data-view]')];
const breadcrumb = document.getElementById('breadcrumbCurrent');
const libraryGrid = document.getElementById('libraryGrid');
const detailBackdrop = document.getElementById('detailBackdrop');
const detailDrawer = document.getElementById('detailDrawer');
const modalBackdrop = document.getElementById('modalBackdrop');
const assetModalBackdrop = document.getElementById('assetModalBackdrop');
const tagModalBackdrop = document.getElementById('tagModalBackdrop');
const toast = document.getElementById('toast');
let activeFilter = 'all';
let inboxActionFilter = 'all';
let inboxTagFilter = null;
let editingId = null;
document.getElementById('composerPreview').insertAdjacentHTML('afterend', '<label class="field-label">封面图片地址<input id="composerCover" type="url" placeholder="解析成功后自动填入，也可以补充原封面地址" /></label><label class="field-label">原始文案<textarea id="composerCaption" placeholder="来自原链接的文案，与自己的笔记分开保存"></textarea></label>');
document.getElementById('composerCover').insertAdjacentHTML('afterend', '<input id="composerCoverFile" type="file" accept="image/png,image/jpeg,image/gif,image/webp" aria-label="上传封面图片"><small>也可以上传自己的封面图片，文件保存在云端。</small>');
document.getElementById('composerCoverFile').addEventListener('change', uploadComposerCover);
document.querySelector('.library-toolbar .toolbar-actions').insertAdjacentHTML('afterbegin', '<select id="reviewFilter" aria-label="整理状态"><option value="all">所有状态</option><option value="pending">待整理</option><option value="ready">已整理</option></select><select id="ratingFilter" aria-label="最低星级"><option value="0">全部星级</option><option value="1">至少 1 星</option><option value="2">至少 2 星</option><option value="3">至少 3 星</option><option value="4">至少 4 星</option><option value="5">5 星精选</option></select>');
document.getElementById('composerRating').closest('.composer-row').insertAdjacentHTML('afterend', '<label class="field-label">整理状态<select id="composerStatus"><option value="pending">待整理</option><option value="ready">已整理</option></select></label>');
document.getElementById('reviewFilter').addEventListener('change', renderLibrary);
document.getElementById('ratingFilter').addEventListener('change', renderLibrary);
document.getElementById('newsletterTitle').closest('.field-label').insertAdjacentHTML('beforebegin', '<label class="field-label">放入哪一期周刊<select id="newsletterDestination"><option value="new">新建一期周刊</option></select></label>');
document.getElementById('newsletterDestination').addEventListener('change', updateNewsletterDestination);
document.querySelector('#view-inbox .page-heading').insertAdjacentHTML('afterend','<section class="panel sync-panel"><div><strong>ME.zip 私人资料库</strong><p id="mezipSyncStatus">正在检查同步状态…</p><p id="xActivityStatus" class="muted">正在检查平台采集状态…</p><small>电脑服务运行时同步私人资料库与已采集的 X、抖音和 B 站点赞、收藏；由你选择归入哪一期周刊。</small></div><button class="quiet-button" data-action="sync-mezip">刷新同步状态</button><button class="primary-button" data-view="library">筛选并选择周刊</button></section>');

function showView(viewName) {
  syncReadingView(viewName);
  views.forEach(view => view.classList.toggle('is-visible', view.id === `view-${viewName}`));
  navItems.forEach(item => item.classList.toggle('is-active', item.dataset.view === viewName));
  const labels = { dashboard: '总览', library: '内容库', inbox: '灵感收集', tags: '标签', materials: '素材箱', jianying: '剪映', newsletters: '周刊', backups: '备份缓存', settings: '设置', help: '帮助与支持' };
  breadcrumb.textContent = labels[viewName] || '总览';
  window.scrollTo({ top: 0, behavior: 'smooth' });
  if (viewName === 'library') renderLibrary();
  if (viewName === 'materials') renderMaterials();
  if (viewName === 'tags') renderCustomTags();
  if (viewName === 'newsletters') renderNewsletters();
  if (viewName === 'backups') window.LinganBackupCache?.refresh();
  if (viewName === 'jianying') window.LinganJianying?.refresh();
  if (viewName === 'live') {breadcrumb.textContent='直播与回放';window.LinganLive?.refresh();}
}

function sourceIcon(source) {
  if (source === 'jianying') return '<span class="source-logo manual">✂</span>';
  if (source === 'bilibili') return '<span class="source-logo x-logo">B</span>';
  if (source === 'douyin') return '<span class="source-logo douyin">♪</span>';
  if (source === 'x') return '<span class="source-logo x-logo">X</span>';
  return '<span class="source-logo manual">↗</span>';
}

function escapeHtml(value = '') {
  return String(value).replace(/[&<>'"]/g, character => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&#39;', '"': '&quot;' }[character]));
}

function renderMaterials() {
  const grid = document.getElementById('materialsGrid');
  if (!grid) return;
  const cards = materialItems.map(item => {
    const tags = (item.tags || []).map((tag, index) => `<span class="tag tiny ${index ? 'green' : ''}">#${escapeHtml(tag)}</span>`).join('');
    const fileUrl = localFileUrl(item.fileUrl);
    const visual = fileUrl && item.fileType?.startsWith('image/')
      ? `<img class="material-preview-image" src="${fileUrl}" alt="${escapeHtml(item.title)}" loading="lazy">`
      : `<div class="material-text-preview"><small>${fileUrl ? escapeHtml(item.fileType) : '文字素材'}</small><strong>${escapeHtml(item.title)}</strong><p>${escapeHtml((item.desc || '').slice(0, 120))}</p></div>`;
    const cardClass = item.type === 'script' ? 'material-dark' : item.type === 'quote' ? 'material-lime' : 'material-gradient';
    const fileNote = item.fileName ? `文件：${item.fileName}` : item.desc || '';
    return `<article class="material-card ${cardClass}" data-material-id="${escapeHtml(item.id)}"><span class="material-type">${escapeHtml(item.typeLabel || '素材')}</span><div>${visual}</div><div class="material-meta"><strong>${escapeHtml(item.title)}</strong><p>${escapeHtml(fileNote)} · ${escapeHtml(item.updated || '刚刚')}</p><div>${tags}</div></div></article>`;
  }).join('');
  grid.innerHTML = `${cards}<article class="material-card add-material-card" data-action="new-material"><div class="add-circle">＋</div><strong>添加一份新素材</strong><p>图片、脚本、模板或任何<br />你想留下来的创作</p></article>`;
  grid.querySelectorAll('[data-material-id]').forEach(card => card.addEventListener('click', () => {
    const item = materialItems.find(entry => entry.id === card.dataset.materialId);
    if (item) openMaterial(item);
  }));
}

function renderCustomTags() {
  const names = [...new Set([...contentItems.flatMap(item => item.tags || []), ...customTags.map(tag => tag.name)])];
  const groups = ['主题','来源','状态'];
  document.querySelector('#view-tags .tag-groups').innerHTML = groups.map(group => `<article class="panel tag-group"><h2>${group}</h2><div class="tag-cloud">${names.filter(name => (customTags.find(tag=>tag.name===name)?.group || '主题')===group).map(name => `<button class="cloud-tag small purple-bg" data-tag="${escapeHtml(name)}">#${escapeHtml(name)} <b>${contentItems.filter(item=>(item.tags||[]).includes(name)).length}</b></button>`).join('') || '<p class="muted">尚无标签</p>'}</div></article>`).join('');
  document.querySelector('#view-tags .tag-overview').innerHTML = `<div class="tag-summary panel"><div><span>已有标签</span><strong id="tagCount">${names.length}</strong><small>覆盖 ${contentItems.filter(item=>(item.tags||[]).length).length} 条内容</small></div></div>`;
}

function renderLibrary() {
  const query = (document.getElementById('globalSearch').value || '').trim().toLowerCase();
  const visible = contentItems.filter(item => {
    const matchesFilter = activeFilter === 'all' || item.source === activeFilter;
    const haystack = `${item.title} ${item.desc || ''} ${item.caption || ''} ${item.body || ''} ${item.url || ''} ${(item.tags || []).join(' ')}`.toLowerCase();
    const status = document.getElementById('reviewFilter').value;
    const minRating = Number(document.getElementById('ratingFilter').value);
    return matchesFilter && (!query || haystack.includes(query)) && (status === 'all' || (item.status || 'pending') === status) && Number(item.rating || 0) >= minRating;
  }).sort(compareContent);
  if (!renderDocumentLibrary(visible)) libraryGrid.innerHTML = visible.length ? visible.map(item => `
    <article class="library-card" data-open="${escapeHtml(item.id)}" tabindex="0" aria-label="打开 ${escapeHtml(item.title)}">
      <input type="checkbox" class="select-card" data-select="${escapeHtml(item.id)}" aria-label="将 ${escapeHtml(item.title)} 加入周刊" ${selectedItems.has(item.id) ? 'checked' : ''} />
      <div class="card-cover">${coverMarkup(item, 'library-cover-image')}<span class="sequence-badge">#${escapeHtml(item.sequence || '—')}</span></div>
      <div class="card-body"><h3>${escapeHtml(item.title)}</h3><div class="record-actions"><button class="quiet-button small" data-inline-edit="${escapeHtml(item.id)}">编辑</button><button class="quiet-button small danger-button" data-delete-content="${escapeHtml(item.id)}">删除</button></div>${ratingControls(item)}<p>${styledText(item.caption || item.desc,item)}</p><div class="card-meta">${(item.tags || []).slice(0,2).map((tag, index) => `<span class="tag ${index ? 'green' : ''}">#${escapeHtml(tag)}</span>`).join('')}<span class="source-label">${escapeHtml(item.sourceLabel)}</span></div></div>
    </article>`).join('') : '<div class="empty-state panel"><span>⌕</span><strong>没有找到匹配内容</strong><p>试试搜索其他关键词，或新建一条记录。</p></div>';
  libraryGrid.querySelectorAll('[data-open]').forEach(card => {
    card.addEventListener('click', event => { if (!event.target.closest('input,button')) openDetail(card.dataset.open); });
    card.addEventListener('keydown', event => { if (event.key === 'Enter' && event.target === card) openDetail(card.dataset.open); });
  });
  const countMap = { all: contentItems.length, douyin: contentItems.filter(item => item.source === 'douyin').length, x: contentItems.filter(item => item.source === 'x').length, bilibili: contentItems.filter(item => item.source === 'bilibili').length, manual: contentItems.filter(item => item.source === 'manual').length };
  document.querySelectorAll('.filter-pill').forEach(button => { const count = button.querySelector('b'); if (count) count.textContent = countMap[button.dataset.filter]; });
  const totalCount = document.getElementById('totalCount'); if (totalCount) totalCount.textContent = countMap.all;
  const libraryCount = document.querySelector('.nav-item[data-view="library"] .nav-count'); if (libraryCount) libraryCount.textContent = countMap.all;
  renderTodayKnowledge();
  updateSelectionHint();
  renderWorkspaceFacts();
}

function renderTodayKnowledge() {
  const list = document.getElementById('knowledgeList');
  if (!list) return;
  const today = new Date().toLocaleDateString('sv-SE');
  const todaysItems = contentItems.filter(item => (item.createdAt || item.updatedAt || '').startsWith(today)).sort(compareContent);
  list.innerHTML = todaysItems.length ? todaysItems.map((item, index) => {
    const tags = (item.tags || []).slice(0, 3).map((tag, tagIndex) => `<span class="tag ${tagIndex === 2 ? 'green' : 'purple'}">#${escapeHtml(tag)}</span>`).join('');
    const summary = item.body || item.desc || '这条内容等待进一步整理。';
    const visual = `<div class="media-thumb">${coverMarkup(item, 'library-cover-image')}</div>`;
    return `<div class="knowledge-item" data-open="${escapeHtml(item.id)}"><span class="item-number">${index + 1}</span><div class="item-copy"><h3>${escapeHtml(item.title)}</h3><div class="tag-row">${tags}</div><p>${escapeHtml(summary)}</p></div>${visual}</div>`;
  }).join('') : '<p class="muted">今天还没有新记录。粘贴链接或新建笔记即可开始。</p>';
  const panel = list.closest('.knowledge-panel');
  panel.querySelector('.eyebrow').textContent = `TODAY · ${today}`;
  panel.querySelector('.muted').textContent = `今日 ${todaysItems.length} 条记录`;
  panel.querySelector('.knowledge-highlight').hidden = true;
  list.querySelectorAll('[data-open]').forEach(item => item.addEventListener('click', () => openDetail(item.dataset.open)));
}

function openDetail(id) {
  const item = contentItems.find(entry => entry.id === id);
  if (!item) return;
  const sourceUrl = safeUrl(item.url);
  detailDrawer.innerHTML = `<div class="detail-close"><div class="detail-source">${sourceIcon(item.source)}<span>${escapeHtml(item.sourceLabel)} · ${escapeHtml(item.date)}</span></div><button data-action="close-detail" aria-label="关闭">×</button></div><h1>${escapeHtml(item.title)}</h1><div class="detail-meta-row">${(item.tags || []).map(tag => `<span class="tag purple">#${escapeHtml(tag)}</span>`).join('')}</div>${ratingControls(item)}<div class="detail-content">${sourceUrl ? `<h2>原始来源</h2><a class="source-url" href="${escapeHtml(sourceUrl)}" target="_blank" rel="noreferrer">${escapeHtml(sourceUrl)}</a>` : ''}${readingMedia(item)}${item.caption ? `<h2>原始文案</h2><p>${styledText(item.caption,item)}</p>` : ''}<h2>我的笔记</h2><p>${styledText(item.body || '',item)}</p>${(item.bullets || []).length ? `<h2>记录要点</h2><ol>${item.bullets.map(bullet => `<li>${escapeHtml(bullet)}</li>`).join('')}</ol>` : ''}</div><div class="detail-action-row"><button class="primary-button" data-action="edit-content">编辑内容</button><button class="quiet-button danger-button" data-delete-content="${escapeHtml(item.id)}">删除</button><button class="quiet-button" data-backup-content="${escapeHtml(item.id)}">生成长图</button><button class="quiet-button reader-button" data-action="full-reader">全屏阅读</button><button class="quiet-button" data-action="close-detail">关闭</button></div>`;
  detailDrawer.dataset.itemId = item.id;
  detailBackdrop.classList.add('is-open');
  detailDrawer.querySelectorAll('[data-action="close-detail"]').forEach(button => button.addEventListener('click', closeDetail));
  detailDrawer.querySelector('[data-action="edit-content"]')?.addEventListener('click', () => { closeDetail(); openComposer(item); });
}

function closeDetail() { detailDrawer.querySelectorAll('video').forEach(video => video.pause()); stopDocumentPlayback(detailDrawer); detailBackdrop.classList.remove('is-open', 'is-reading'); }
function openComposer(item = null) {
  if (modalBackdrop.classList.contains('is-open')) stashComposerDraft();
  composerSession++;
  clearTimeout(previewTimer); previewTimer=null; previewGeneration++; previewPending=false;
  document.querySelector('[data-action="preview-link"]').disabled=false;
  editingId = item?.id || null;
  composerDraftId = editingId;
  composerAutomatic = {};
  document.getElementById('modalTitle').textContent = item ? '整理内容' : '新建内容';
  document.getElementById('composerTitle').value = item?.title || '';
  document.getElementById('composerBody').value = item?.body || '';
  document.getElementById('composerUrl').value = item?.url || '';
  document.getElementById('composerSource').value = item?.source || 'manual';
  document.getElementById('composerTags').value = item?.tags?.map(tag => `#${tag}`).join(' ') || '';
  document.getElementById('composerRating').value = item?.rating || 0;
  document.getElementById('composerStatus').value = item?.status || 'pending';
  document.getElementById('composerSequence').value = item?.sequence || contentItems.length + 1;
  composerPreviewData = item ? {...item, url: item.url, coverUrl: item.coverUrl, description: item.caption || item.desc, title: item.title} : null;
  document.getElementById('composerCover').value = item?.coverUrl || '';
  document.getElementById('composerCoverFile').value = '';
  document.getElementById('composerCaption').value = item?.caption ?? item?.desc ?? '';
  if(typeof TextStyling!=='undefined')TextStyling.setForField(document.getElementById('composerBody'),item?.textStyle);
  composerDraftBase = composerValues();
  composerDraftPending = null;
  const draft = CaptureDraft.read(localStorage,composerDraftId);
  if (draft) {
    const restored=CaptureDraft.restore(draft,composerDraftBase,Boolean(item));
    for(const id of CaptureDraft.fields) document.getElementById(id).value=restored.values[id];
    restoreComposerTextStyle();
    if(restored.conflicts.length) composerDraftPending={draft,conflicts:restored.conflicts};
    else if(draft.preview && restored.values.composerCover===draft.values.composerCover && restored.values.composerUrl===draft.values.composerUrl) composerPreviewData=draft.preview;
    showToast(composerDraftPending?'此设备草稿与云端修改有冲突，请先选择保留内容':'已恢复此设备上未保存的草稿');
  }
  renderDraftConflict();
  renderComposerPreview();
  modalBackdrop.querySelector('.save-hint').textContent=draft?'已恢复设备草稿；保存内容后同步云端':'评分越高，在内容库和周刊中越靠前';
  modalBackdrop.classList.add('is-open'); setTimeout(() => document.getElementById('composerTitle').focus(), 50);
}
function restoreComposerTextStyle(){if(typeof TextStyling!=='undefined'){try{TextStyling.setForField(document.getElementById('composerBody'),JSON.parse(document.getElementById('composerTextStyle').value||'null'));}catch{}}}
function composerValues() { if(typeof TextStyling!=='undefined')document.getElementById('composerTextStyle').value=JSON.stringify(TextStyling.readForField(document.getElementById('composerBody')));return Object.fromEntries(CaptureDraft.fields.map(id=>[id,String(document.getElementById(id).value)])); }
function renderDraftConflict() {
  const panel=document.getElementById('composerDraftConflict');
  const pending=composerDraftPending;
  panel.hidden=!pending;
  for(const id of [...CaptureDraft.fields,'composerCoverFile']) document.getElementById(id).disabled=Boolean(pending);
  document.querySelector('[data-action="preview-link"]').disabled=Boolean(pending);
  document.querySelector('[data-action="save-content"]').disabled=Boolean(pending);
  if(!pending) { panel.innerHTML=''; return; }
  const labels=['标题','我的笔记','来源链接','来源','标签','评分','状态','序号','封面','原始文案','文字样式'];
  panel.innerHTML='<p>其他设备修改了同一内容。请比较后选择；关闭页面仍会保留原草稿。</p>'+pending.conflicts.map(id=>`<details><summary>${labels[CaptureDraft.fields.indexOf(id)]}</summary><label class="field-label">云端当前内容<textarea readonly>${escapeHtml(composerDraftBase[id])}</textarea></label><label class="field-label">此设备草稿<textarea readonly>${escapeHtml(pending.draft.values[id])}</textarea></label></details>`).join('')+'<button class="quiet-button" data-action="draft-use-cloud">冲突字段保留云端</button><button class="quiet-button" data-action="draft-use-local">冲突字段使用草稿</button>';
}
function resolveDraftConflict(useLocal) {
  if(!composerDraftPending) return;
  const {draft,conflicts}=composerDraftPending;
  if(useLocal) for(const id of conflicts) document.getElementById(id).value=draft.values[id];
  restoreComposerTextStyle();
  const current=composerValues();
  if(draft.preview && current.composerCover===draft.values.composerCover && current.composerUrl===draft.values.composerUrl) composerPreviewData=draft.preview;
  composerDraftPending=null;
  renderDraftConflict(); renderComposerPreview(); stashComposerDraft();
}
function stashComposerDraft() {
  if(!modalBackdrop.classList.contains('is-open') || composerDraftPending) return;
  const stored=CaptureDraft.write(localStorage,composerDraftId,composerValues(),composerPreviewData,composerDraftBase);
  modalBackdrop.querySelector('.save-hint').textContent=stored?'草稿保留在此设备；点击保存内容后同步云端':'无法保存设备草稿，请保持页面打开并保存内容';
}
function closeComposer(retainDraft = true) {
  if(retainDraft) stashComposerDraft();
  composerSession++; clearTimeout(previewTimer); previewTimer=null; previewGeneration++; previewPending=false;
  document.querySelector('[data-action="preview-link"]').disabled=false; modalBackdrop.classList.remove('is-open'); editingId = null;
}
modalBackdrop.querySelector('.modal-foot [data-action="close-modal"]').textContent='稍后继续';
modalBackdrop.querySelector('.modal-foot [data-action="close-modal"]').insertAdjacentHTML('beforebegin','<button class="quiet-button" data-action="discard-capture-draft">丢弃草稿</button>');
modalBackdrop.addEventListener('input',event=>{
  if(CaptureDraft.fields.includes(event.target.id)) { delete composerAutomatic[event.target.id]; stashComposerDraft(); }
});
modalBackdrop.addEventListener('change',stashComposerDraft);
window.addEventListener('pagehide',stashComposerDraft);
document.addEventListener('visibilitychange',()=>{if(document.visibilityState==='hidden')stashComposerDraft();});
function openAssetModal() { assetModalBackdrop.classList.add('is-open'); setTimeout(() => document.getElementById('assetTitle').focus(), 50); }
function closeAssetModal() { assetModalBackdrop.classList.remove('is-open'); }
function openTagModal() { tagModalBackdrop.classList.add('is-open'); setTimeout(() => document.getElementById('newTagName').focus(), 50); }
function closeTagModal() { tagModalBackdrop.classList.remove('is-open'); }
function showToast(message) { toast.textContent = message; toast.classList.add('is-visible'); window.clearTimeout(showToast.timer); showToast.timer = window.setTimeout(() => toast.classList.remove('is-visible'), 2400); }

function snapshotState() {
  return { content: contentItems, materials: materialItems, tags: customTags, materialBoxes, newsletters };
}

async function persistState({replace = false} = {}) {
  unsavedChanges = true;
  if (saveBatch.failure) {
    queuedState = JSON.parse(JSON.stringify(saveBatch.failure.baseline));
    saveBatch = {failure: null};
  }
  const batch = saveBatch;
  const generation = ++saveGeneration;
  const state = JSON.parse(JSON.stringify(snapshotState()));
  const baseline = JSON.parse(JSON.stringify(queuedState || persistedState || {content:[],materials:[],tags:[]}));
  queuedState = JSON.parse(JSON.stringify(state));
  try {
    localStorage.setItem('lingan-content', JSON.stringify(contentItems));
    localStorage.setItem('lingan-materials', JSON.stringify(materialItems));
    localStorage.setItem('lingan-tags', JSON.stringify(customTags));
    localStorage.setItem('lingan-newsletters', JSON.stringify(newsletters));
  } catch (error) { console.warn('本地保存失败', error); }
  if (!apiEnabled && location.protocol !== 'file:') {
    const error = new Error('尚未连接服务器，请保留输入并刷新后重试');
    batch.failure = {error, baseline};
    queuedState = baseline;
    throw error;
  }
  if (!apiEnabled) return;
  const operation = saveQueue.then(async () => {
    // A queued snapshot depends on every earlier snapshot in this batch saving.
    if (batch.failure) throw batch.failure.error;
    try {
      const changes = [];
      for (const collection of ['content','materials','tags','materialBoxes']) {
        const key = collection === 'tags' ? 'name' : 'id';
        for (const item of state[collection]) {
          const base = (baseline[collection]||[]).find(entry=>entry[key]===item[key]) || null;
          if (JSON.stringify(base) !== JSON.stringify(item)) changes.push({collection,base,item});
        }
      }
      const response = await fetch(replace ? '/api/state' : '/api/changes', { method: replace ? 'PUT' : 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(replace ? {...state, expectedUpdatedAt: serverRevision} : {changes}) });
      const result = await response.json();
      if (!response.ok) throw new Error(result.message || '保存失败，请刷新后重试');
      serverRevision = result.updatedAt;
      persistedState = JSON.parse(JSON.stringify(result));
      if (generation === saveGeneration) {
        unsavedChanges = false;
        contentItems.splice(0,contentItems.length,...result.content);
        materialItems.splice(0,materialItems.length,...result.materials);
        customTags.splice(0,customTags.length,...result.tags);
        materialBoxes.splice(0,materialBoxes.length,...result.materialBoxes||[]);
        newsletters = result.newsletters || [];
        queuedState = JSON.parse(JSON.stringify(result));
        renderLibrary(); renderMaterials(); renderCustomTags(); renderNewsletters();
      }
    } catch (error) {
      // Keep the last acknowledged local snapshot, not merged remote fields that
      // have not reached the UI yet; retrying must preserve untouched fields.
      batch.failure = {error, baseline};
      throw error;
    }
  });
  saveQueue = operation.catch(() => {});
  try {
    await operation;
  } catch (error) {
    if (generation === saveGeneration) queuedState = JSON.parse(JSON.stringify(batch.failure?.baseline || baseline));
    showToast(error.message || '服务器保存失败，目前仅保存在此浏览器');
    throw error;
  }
}

async function syncWithServer() {
  if (location.protocol === 'file:') return;
  try {
    const response = await fetch('/api/state');
    if (!response.ok) return;
    const serverState = await response.json();
    persistedState = JSON.parse(JSON.stringify(serverState));
    queuedState = JSON.parse(JSON.stringify(serverState));
    serverRevision = serverState.updatedAt;
    apiEnabled = true;
    const hasServerData = Boolean(serverState.updatedAt) || [serverState.content, serverState.materials, serverState.tags, serverState.newsletters].some(value => Array.isArray(value) && value.length);
    if (true) {
      if (Array.isArray(serverState.content)) contentItems.splice(0, contentItems.length, ...serverState.content);
      if (Array.isArray(serverState.materials)) materialItems.splice(0, materialItems.length, ...serverState.materials);
      if (Array.isArray(serverState.tags)) customTags.splice(0, customTags.length, ...serverState.tags);
      materialBoxes.splice(0,materialBoxes.length,...serverState.materialBoxes||[]);
      newsletters = Array.isArray(serverState.newsletters) ? serverState.newsletters : [];
      renderLibrary(); renderMaterials(); renderCustomTags(); renderNewsletters();
      window.LinganJianying?.render();
      showToast('已连接云端资料库');
    } else {
      await persistState();
      showToast('已启用本地数据文件');
    }
  } catch (error) {
    apiEnabled = false;
  }
}

function exportData() {
  const payload = { exportedAt: new Date().toISOString(), ...snapshotState() };
  const blob = new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' });
  const link = document.createElement('a');
  link.href = URL.createObjectURL(blob);
  link.download = `lingan-backup-${new Date().toISOString().slice(0, 10)}.json`;
  link.click();
  URL.revokeObjectURL(link.href);
  showToast('记录已导出；上传文件请另行备份 data 文件夹');
}

async function exportFullBackup() {
  const button = document.querySelector('[data-action="export-full-backup"]');
  const label = button.textContent;
  button.disabled = true;
  button.textContent = '正在准备…';
  try {
    if (!apiEnabled) throw new Error('请先登录资料库，再导出完整备份');
    await persistState();
    const response = await fetch('/api/backup');
    if (!response.ok) {
      const error = await response.json();
      throw new Error(error.message || '备份未完成，请重试');
    }
    const blob = await response.blob();
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `lingan-backup-${new Date().toISOString().slice(0, 10)}.zip`;
    link.click();
    setTimeout(() => URL.revokeObjectURL(url), 60000);
    const remote = Number(response.headers.get('X-Lingan-External-Covers') || 0);
    const missing = Number(response.headers.get('X-Lingan-Legacy-Attachments') || 0);
    showToast(`已导出记录、周刊和本地文件${remote || missing ? '；部分原站图片或旧素材仍只有引用，详见包内清单' : ''}`);
  } catch (error) { showToast(error.message); }
  finally { button.disabled = false; button.textContent = label; }
}

async function importDataFile(file) {
  if (!file) return;
  try {
    const parsed = JSON.parse(await file.text());
    if (!Array.isArray(parsed.content) || !Array.isArray(parsed.materials) || !Array.isArray(parsed.tags)) throw new Error('invalid_backup');
    contentItems.splice(0, contentItems.length, ...parsed.content);
    materialItems.splice(0, materialItems.length, ...parsed.materials);
    if(Array.isArray(parsed.materialBoxes))materialBoxes.splice(0,materialBoxes.length,...parsed.materialBoxes);
    customTags.splice(0, customTags.length, ...parsed.tags);
    await persistState({replace:true});
    renderLibrary(); renderMaterials(); renderCustomTags();
    showToast('内容、素材记录和标签已恢复；现有周刊保留');
  } catch (error) {
    showToast('备份文件格式不正确');
  }
}

async function saveContent() {
  if(composerDraftPending) { showToast('请先选择冲突字段保留云端还是草稿'); return; }
  if (!apiEnabled) { showToast('正在连接资料库，请稍候再保存'); return; }
  const session = composerSession;
  const draftId = composerDraftId;
  const submittedFields = JSON.stringify(composerValues());
  if (previewPending || previewTimer) { showToast('正在获取封面与文案，请稍候再保存'); return; }
  const wasEditing = Boolean(editingId);
  const url = document.getElementById('composerUrl').value.trim();
  const source = document.getElementById('composerSource').value;
  const title = document.getElementById('composerTitle').value.trim() || (url ? `待补全的${source === 'douyin' ? '抖音' : source === 'x' ? 'X' : '网页'}链接` : '未命名灵感');
  const body = document.getElementById('composerBody').value.trim();
  const tags = document.getElementById('composerTags').value.split(/[#，,\s]+/).filter(Boolean).slice(0, 4);
  const nextItem = { id: editingId || `new-${Date.now()}`, title, source, sourceLabel: source === 'douyin' ? '抖音视频' : source === 'x' ? 'X' : source === 'bilibili' ? 'B 站视频' : source === 'jianying' ? '剪映成品' : '手动记录', date: '刚刚', url, desc: body, tags: tags.length ? tags : ['灵感'], cover: source === 'douyin' ? 'cover-video' : source === 'x' ? 'cover-x' : 'cover-manual', body, bullets: ['先记录下来，再在合适的时候整理', '把内容和自己的经验连接起来', '留下一个以后可以继续展开的入口'] };
  Object.assign(nextItem, {coverUrl: safeMediaUrl(document.getElementById('composerCover').value), caption: document.getElementById('composerCaption').value.trim() || (url ? '' : body), rating: Number(document.getElementById('composerRating').value), sequence: Number(document.getElementById('composerSequence').value) || 1, updatedAt: new Date().toISOString()});
  if(typeof TextStyling!=='undefined')nextItem.textStyle=TextStyling.readForField(document.getElementById('composerBody'));
  const previewOrigin = composerPreviewData || contentItems.find(item=>item.id===editingId) || {};
  nextItem.coverKind = nextItem.coverUrl === previewOrigin.coverUrl ? (previewOrigin.coverKind || 'unknown') : (nextItem.coverUrl ? 'manual_image' : 'unknown');
  nextItem.metadataSource = nextItem.coverUrl === previewOrigin.coverUrl ? (previewOrigin.metadataSource || 'none') : 'manual';
  nextItem.captionWarning = nextItem.caption === (previewOrigin.description || previewOrigin.caption) ? (previewOrigin.captionWarning || '') : '';
  nextItem.originalCoverUrl = previewOrigin.originalCoverUrl || '';
  nextItem.coverStorage = localFileUrl(nextItem.coverUrl) ? 'local' : 'remote';
  nextItem.createdAt = contentItems.find(item => item.id === editingId)?.createdAt || new Date().toISOString();
  nextItem.status = document.getElementById('composerStatus').value;
  nextItem.bullets = contentItems.find(item => item.id === editingId)?.bullets || [];
  if (url && !safeUrl(url)) { showToast('来源链接格式不正确'); return; }
  if (editingId) {
    const index = contentItems.findIndex(item => item.id === editingId);
    if (index >= 0) contentItems[index] = { ...contentItems[index], ...nextItem };
    else { showToast('该内容已不在资料库中，请先保留草稿后重新新建'); return; }
  } else contentItems.unshift(nextItem);
  editingId = nextItem.id;
  try { await persistState(); } catch { return; }
  if (session !== composerSession) { renderLibrary(); return; }
  if(submittedFields !== JSON.stringify(composerValues())) {
    // A slow save must not close the form over newer edits made on the phone.
    CaptureDraft.clear(localStorage,draftId); composerDraftId=nextItem.id; composerDraftBase=JSON.parse(submittedFields); stashComposerDraft();
    renderLibrary(); showToast('上一版已保存；新改动仍保留在草稿中'); return;
  }
  CaptureDraft.clear(localStorage,draftId);
  document.getElementById('composerTitle').value = '';
  document.getElementById('composerBody').value = '';
  document.getElementById('composerUrl').value = '';
  document.getElementById('composerTags').value = '';
  closeComposer(false);
  renderLibrary();
  showToast(url && (!nextItem.caption || !nextItem.coverUrl) ? '链接已保存；封面或原文仍待补全' : wasEditing ? '内容已更新' : '已保存到内容库');
  editingId = null;
}

async function saveAsset() {
  const button = document.querySelector('[data-action="save-asset"]');
  if (button.disabled) return;
  button.disabled = true;
  button.textContent = '正在保存…';
  try {
  const title = document.getElementById('assetTitle').value.trim() || '未命名素材';
  const desc = document.getElementById('assetBody').value.trim() || '一份刚刚制作并保存下来的素材。';
  const type = document.getElementById('assetType').value;
  const tags = document.getElementById('assetTags').value.split(/[#，,\s]+/).filter(Boolean).slice(0, 4);
  const file = document.getElementById('assetFile').files?.[0];
  const typeLabel = type === 'script' ? '短视频脚本' : type === 'quote' ? '图文素材' : '封面模板';
  const uploaded = file ? await uploadFile(file) : null;
  const item = { id: `asset-${Date.now()}`, title, type, typeLabel, desc, fileUrl: uploaded?.url || '', fileName: uploaded?.name || '', fileType: uploaded?.type || '', fileSize: uploaded?.size || 0, tags: tags.length ? tags : ['新素材'], updated: '刚刚' };
  materialItems.unshift(item);
  try { await persistState(); }
  catch (error) { materialItems.splice(materialItems.indexOf(item), 1); throw error; }
  document.getElementById('assetTitle').value = '';
  document.getElementById('assetBody').value = '';
  document.getElementById('assetTags').value = '';
  document.getElementById('assetFile').value = '';
  closeAssetModal();
  renderMaterials();
  showView('materials');
  showToast('已保存到素材箱');
  } catch (error) { showToast(error.message || '素材保存失败，请重试'); }
  finally { button.disabled = false; button.textContent = '保存素材'; }
}

const fileUploadLimitMb = 25;
async function uploadFile(file) {
  if (!apiEnabled) throw new Error('请通过“打开灵感库”启动服务后上传');
  if (!file.size || file.size > fileUploadLimitMb * 1024 * 1024) throw new Error(`文件不能为空，且不能超过 ${fileUploadLimitMb} MB`);
  const response = await fetch('/api/files', {method: 'POST', headers: {'Content-Type': 'application/octet-stream', 'X-File-Name': encodeURIComponent(file.name)}, body: file});
  const result = await response.json();
  if (!response.ok) throw new Error(result.message || '文件上传失败');
  return result;
}

async function uploadComposerCover(event) {
  const input = event.target;
  const file = input.files?.[0];
  if (!file) return;
  const save = document.querySelector('[data-action="save-content"]');
  input.disabled = true;
  if (save) save.disabled = true;
  const targetSession = composerSession;
  try {
    if (!['image/png','image/jpeg','image/gif','image/webp'].includes(file.type)) throw new Error('请选择 PNG、JPG、GIF 或 WebP 图片');
    const result = await uploadFile(file);
    if (composerSession !== targetSession || !modalBackdrop.classList.contains('is-open')) return;
    document.getElementById('composerCover').value = result.url;
    composerPreviewData = {...composerPreviewData, title: document.getElementById('composerTitle').value, coverUrl: result.url, coverKind:'manual_image', metadataSource:'manual'};
    delete composerAutomatic.composerCover;
    stashComposerDraft();
    renderComposerPreview('封面已上传云端，请保存这条内容');
    showToast('封面上传成功');
  } catch (error) { showToast(error.message || '封面上传失败'); }
  finally { input.disabled = false; input.value = ''; if (save) save.disabled = false; }
}

function openMaterial(item) {
  const url = localFileUrl(item.fileUrl);
  const mime = item.fileType || '';
  let media = '';
  if (url && mime.startsWith('image/')) media = `<img class="material-full-preview" src="${url}" alt="${escapeHtml(item.title)}">`;
  else if (url && mime.startsWith('video/')) media = `<video class="material-full-preview" src="${url}" controls preload="metadata"></video>`;
  const fileLink = url ? `<a class="quiet-button" href="${url}" target="_blank" rel="noopener">打开文件 ↗</a><a class="quiet-button" href="${url}" download="${escapeHtml(item.fileName)}">下载文件</a>` : '';
  delete detailDrawer.dataset.itemId;
  detailDrawer.innerHTML = `<div class="detail-close"><span>我的素材</span><button data-action="close-detail" aria-label="关闭">×</button></div><h1>${escapeHtml(item.title)}</h1><div class="detail-content">${media}<p class="original-caption">${escapeHtml(item.desc || '')}</p>${item.fileName ? `<p>${escapeHtml(item.fileName)} · ${url ? (Number(item.fileSize)/1024/1024).toFixed(2) + ' MB' : '旧记录只保存了文件名，请重新上传文件'}</p>` : ''}</div><div class="detail-action-row">${fileLink}<button class="quiet-button" data-action="full-reader">全屏阅读</button><button class="quiet-button" data-action="close-detail">关闭</button></div>`;
  detailBackdrop.classList.add('is-open');
}

function saveTag() {
  const name = document.getElementById('newTagName').value.trim().replace(/^#/, '');
  const group = document.getElementById('newTagGroup').value;
  if (!name) { showToast('请先输入标签名称'); return; }
  if (!customTags.some(tag => tag.name === name)) customTags.push({ name, group });
  persistState();
  document.getElementById('newTagName').value = '';
  closeTagModal();
  renderCustomTags();
  showView('tags');
  showToast(`已创建标签 #${name}`);
}

function createHeatmap() {
  const grid = document.getElementById('heatGrid');
  if (!grid) return;
  const levels = Array.from({length:60},(_,index)=>{
    const date = new Date();date.setDate(date.getDate() - (59-index));
    const day = date.toLocaleDateString('sv-SE');
    return Math.min(5, contentItems.filter(item=>(item.createdAt || '').startsWith(day)).length);
  });
  grid.innerHTML = levels.map(level => `<i class="heat-cell" data-level="${level}"></i>`).join('');
}

document.addEventListener('click', event => {
  const viewButton = event.target.closest('[data-view]');
  if (viewButton) { showView(viewButton.dataset.view); return; }
  const tagButton = event.target.closest('[data-tag]');
  if (tagButton) { showView('library'); document.getElementById('globalSearch').value = tagButton.dataset.tag; renderLibrary(); return; }
  const actionButton = event.target.closest('[data-action]');
  if (!actionButton) return;
  const action = actionButton.dataset.action;
  if (action === 'compose') openComposer();
  if (action === 'import-link') { openComposer(); setTimeout(() => document.getElementById('composerUrl').focus(), 50); }
  if (action === 'new-material') openAssetModal();
  if (action === 'new-tag') openTagModal();
  if (action === 'close-modal') closeComposer();
  if (action === 'discard-capture-draft') { CaptureDraft.clear(localStorage,composerDraftId); closeComposer(false); }
  if (action === 'draft-use-cloud') resolveDraftConflict(false);
  if (action === 'draft-use-local') resolveDraftConflict(true);
  if (action === 'close-asset-modal') closeAssetModal();
  if (action === 'close-tag-modal') closeTagModal();
  if (action === 'save-content') saveContent();
  if (action === 'save-asset') saveAsset();
  if (action === 'save-tag') saveTag();
  if (action === 'export-data') exportData();
  if (action === 'export-full-backup') exportFullBackup();
  if (action === 'full-reader') detailBackdrop.classList.add('is-reading');
  if (action === 'preview-link') previewLink();
  if (action === 'create-newsletter') openNewsletterComposer();
  if (action === 'close-newsletter-modal') document.getElementById('newsletterModalBackdrop').classList.remove('is-open');
  if (action === 'save-newsletter') saveNewsletter();
  if (action === 'copy-share') copyShare(actionButton.dataset.token);
  if (action === 'sync-mezip') syncMezip(true);
});

document.getElementById('globalSearch').addEventListener('input', () => { if (document.getElementById('view-library').classList.contains('is-visible')) renderLibrary(); });
document.getElementById('composerUrl').addEventListener('input', event => {
  clearTimeout(previewTimer);
  previewGeneration++;
  previewPending=false;
  document.querySelector('[data-action="preview-link"]').disabled=false;
  composerPreviewData = null;
  document.getElementById('composerCover').value = '';
  document.getElementById('composerCaption').value = '';
  renderComposerPreview();
  const url = event.target.value.toLowerCase();
  const source = document.getElementById('composerSource');
  if (url.includes('bilibili.com')) source.value = 'bilibili';
  else if (url.includes('douyin.com')) source.value = 'douyin';
  else if (url.includes('x.com') || url.includes('twitter.com')) source.value = 'x';
  if (/https?:\/\/[^\s]+/.test(event.target.value)) {
    previewTimer = setTimeout(() => { previewTimer=null; previewLink(); }, 700);
  } else previewTimer=null;
});
document.getElementById('importDataFile').addEventListener('change', event => importDataFile(event.target.files?.[0]));
document.querySelectorAll('.filter-pill').forEach(button => button.addEventListener('click', () => { activeFilter = button.dataset.filter; document.querySelectorAll('.filter-pill').forEach(item => item.classList.toggle('is-active', item === button)); renderLibrary(); }));
document.querySelectorAll('[data-tag]').forEach(button => button.addEventListener('click', () => { showView('library'); document.getElementById('globalSearch').value = button.dataset.tag; renderLibrary(); }));
document.querySelectorAll('[data-open]').forEach(button => button.addEventListener('click', () => openDetail(button.dataset.open)));
modalBackdrop.addEventListener('click', event => { if (event.target === modalBackdrop) closeComposer(); });
assetModalBackdrop.addEventListener('click', event => { if (event.target === assetModalBackdrop) closeAssetModal(); });
tagModalBackdrop.addEventListener('click', event => { if (event.target === tagModalBackdrop) closeTagModal(); });
detailBackdrop.addEventListener('click', event => { if (event.target === detailBackdrop) closeDetail(); });
document.addEventListener('keydown', event => { if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === 'k') { event.preventDefault(); document.getElementById('globalSearch').focus(); } if (event.key === 'Escape') { closeComposer(); closeAssetModal(); closeTagModal(); closeDetail(); } });
createHeatmap();
renderLibrary();
renderMaterials();
renderCustomTags();
syncWithServer().then(()=>syncMezip(false));
setInterval(()=>syncMezip(false),60000);

async function refreshWorkspaceState() {
  const formOpen=()=>document.querySelector('.modal-backdrop.is-open,.asset-modal-backdrop.is-open,.tag-modal-backdrop.is-open,.newsletter-modal-backdrop.is-open,#backupImportDialog[open],#issueEditDialog[open],#accountDialog[open],#actionsDialog[open],#trashDialog[open],#boxDialog[open],#backupCacheDialog[open],#backupCachePreview[open]');
  if (!apiEnabled || unsavedChanges || formOpen()) return;
  const refreshRevision = serverRevision;
  const response=await fetch('/api/state');
  if (!response.ok) throw Error('无法读取资料库');
  const latest=await response.json();
  if (unsavedChanges || formOpen() || serverRevision !== refreshRevision || latest.updatedAt===serverRevision) return;
  contentItems.splice(0,contentItems.length,...latest.content);
  materialItems.splice(0,materialItems.length,...latest.materials);
  materialBoxes.splice(0,materialBoxes.length,...latest.materialBoxes||[]);
  customTags.splice(0,customTags.length,...latest.tags);
  newsletters=latest.newsletters || [];
  persistedState=JSON.parse(JSON.stringify(latest));
  queuedState=JSON.parse(JSON.stringify(latest));
  serverRevision=latest.updatedAt;
  renderLibrary();renderCustomTags();renderMaterials();renderNewsletters();
}

async function syncMezip(manual) {
  const label=document.getElementById('mezipSyncStatus');
  const button=document.querySelector('[data-action="sync-mezip"]');
  if(button.disabled) return;
  button.disabled=true;
  try {
    const response=await fetch(manual?'/api/mezip/sync':'/api/mezip/status',manual?{method:'POST',headers:{'Content-Type':'application/json'},body:'{}'}:{});
    const result=await response.json();
    label.textContent=result.message || '等待首次同步';
    if(result.lastSyncedAt) label.textContent+=` · ${new Date(result.lastSyncedAt).toLocaleTimeString('zh-CN')}`;
    const activityLabel=document.getElementById('xActivityStatus');
    if(activityLabel)activityLabel.textContent=(result.activityState==='unavailable'?'平台采集服务暂未连接。':'')+(result.lastReceivedEventAt?'最近收到平台事件：'+new Date(result.lastReceivedEventAt).toLocaleString()+' · '+(result.activityEventCount||0)+' 条已采集事件':'尚未收到平台点赞或收藏事件；请确认 Edge 采集扩展已连接。');
    if(typeof renderCapturedAccounts==='function')renderCapturedAccounts(result.activityAccounts||[]);
    if(manual) showToast(unsavedChanges?'有未保存修改，请先保存或导出草稿':result.message || '同步完成');
  } catch(error) {
    label.textContent='ME.zip 同步服务暂不可用，已保存内容仍然保留';
    if(manual) showToast(error.message);
  } finally {
    try { await refreshWorkspaceState(); } catch(error) { if(manual) showToast(error.message); }
    button.disabled=false;
  }
}

function inboxActions(item) {
  // Only confirmed platform state distinguishes likes from saved bookmarks.
  return {like: item.xActivity?.liked === true, bookmark: item.xActivity?.bookmarked === true};
}

function renderInbox(pending = contentItems.filter(item => item.status !== 'ready')) {
  const inbox = document.querySelector('.inbox-list-panel');
  if (!inbox) return;
  if (!inbox.querySelector('.inbox-filters')) {
    inbox.querySelector('.panel-head').insertAdjacentHTML('afterend', '<div class="inbox-filters"><div class="inbox-action-filters" role="group" aria-label="按点赞或收藏筛选"><button type="button" data-inbox-filter="all">全部 <b></b></button><button type="button" data-inbox-filter="like">点赞 <b></b></button><button type="button" data-inbox-filter="bookmark">收藏 <b></b></button></div><label class="inbox-tag-label">标签<select id="inboxTagFilter" aria-label="待整理标签"></select></label></div><p class="inbox-filter-note">一条内容可以同时显示点赞和收藏。</p>');
    inbox.querySelectorAll('[data-inbox-filter]').forEach(button => button.addEventListener('click', () => {
      inboxActionFilter = button.dataset.inboxFilter;
      renderInbox();
    }));
    inbox.querySelector('#inboxTagFilter').addEventListener('change', event => {
      inboxTagFilter = event.target.value ? event.target.value.slice(4) : null;
      renderInbox();
    });
  }
  const tagCounts = new Map();
  pending.forEach(item => [...new Set(item.tags || [])].forEach(tag => tagCounts.set(tag, (tagCounts.get(tag) || 0) + 1)));
  if (inboxTagFilter !== null && !tagCounts.has(inboxTagFilter)) inboxTagFilter = null;
  const tags = inbox.querySelector('#inboxTagFilter');
  tags.innerHTML = '<option value="">全部标签</option>' + [...tagCounts].sort((a, b) => String(a[0]).localeCompare(String(b[0]), 'zh-CN')).map(([tag, count]) => `<option value="tag:${escapeHtml(tag)}">#${escapeHtml(tag)} (${count})</option>`).join('');
  tags.value = inboxTagFilter === null ? '' : `tag:${inboxTagFilter}`;
  const tagged = pending.filter(item => inboxTagFilter === null || (item.tags || []).includes(inboxTagFilter));
  inbox.querySelectorAll('[data-inbox-filter]').forEach(button => {
    const kind = button.dataset.inboxFilter;
    button.querySelector('b').textContent = kind === 'all' ? tagged.length : tagged.filter(item => inboxActions(item)[kind]).length;
    button.setAttribute('aria-pressed', String(kind === inboxActionFilter));
  });
  const visible = tagged.filter(item => inboxActionFilter === 'all' || inboxActions(item)[inboxActionFilter]).sort((a, b) => {
    const received = item => Date.parse(item.xActivity?.lastEventAt || item.updatedAt || item.createdAt || '') || 0;
    return received(b) - received(a);
  });
  inbox.querySelector('.panel-head .muted').textContent = visible.length === pending.length ? `${pending.length} 条等待整理` : `显示 ${visible.length} 条 · 共 ${pending.length} 条待整理`;
  inbox.querySelector('.inbox-items').innerHTML = visible.map(item => {
    const actions = inboxActions(item);
    const badges = `${actions.like ? '<span class="inbox-action-badge is-like" data-inbox-action="like">♥ 点赞</span>' : ''}${actions.bookmark ? '<span class="inbox-action-badge is-bookmark" data-inbox-action="bookmark">☆ 收藏</span>' : ''}` || (item.kind==='live-replay'?'<span class="inbox-action-badge">直播回放 · 待处理</span>':'<span class="inbox-action-badge">其他收集</span>');
    const cover = safeMediaUrl(item.coverUrl);
    const preview = cover ? `<img src="${escapeHtml(cover)}" alt="${escapeHtml(item.title)}的封面" loading="lazy" referrerpolicy="no-referrer">` : `<span class="inbox-preview-note">${item.url ? '封面待补充' : '文字记录'}</span>`;
    const source = ({bilibili: 'B 站', douyin: '抖音', x: 'X', manual: '个人记录', jianying: '剪映成品'})[item.source] || '其他来源';
    const labels = (item.tags || []).map(tag => `<span class="inbox-tag">#${escapeHtml(tag)}</span>`).join('');
    return `<button type="button" class="inbox-item" data-review="${escapeHtml(item.id)}"><span class="inbox-preview">${preview}</span><div class="inbox-copy"><span class="inbox-record-meta">${sourceIcon(item.source)}<span>${source}</span>${badges}</span><strong>${escapeHtml(item.title)}</strong><p>${escapeHtml(item.backupStatus === 'pending_access' ? '来源已登记 · 内容待备份' : item.url || '个人记录')}</p>${labels ? `<span class="inbox-record-tags">${labels}</span>` : ''}</div></button>`;
  }).join('') || `<p class="muted">${pending.length ? '这个行为与标签下暂无待整理内容，可选择全部查看。' : '暂时没有待整理内容'}</p>`;
  inbox.querySelectorAll('[data-review]').forEach(button => button.addEventListener('click', () => openDetail(button.dataset.review)));
  inbox.querySelectorAll('.inbox-preview img').forEach(image => image.addEventListener('error', () => {
    if (image.parentElement) image.parentElement.innerHTML = '<span class="inbox-preview-note">封面加载失败</span>';
  }, {once: true}));
  inbox.querySelector('.panel-head .quiet-button').onclick = () => {showView('library'); document.getElementById('reviewFilter').value = 'pending'; renderLibrary();};
}

function renderWorkspaceFacts() {
  const tagCounts = new Map();
  contentItems.forEach(item => (item.tags || []).forEach(tag=>tagCounts.set(tag,(tagCounts.get(tag)||0)+1)));
  const weekAgo = Date.now()-7*86400000;
  const pending = contentItems.filter(item=>item.status!=='ready');
  const values = [contentItems.length,contentItems.filter(item=>Date.parse(item.createdAt)>weekAgo).length,tagCounts.size,pending.length];
  document.querySelectorAll('.stat-card').forEach((card,i)=>{
    card.querySelector('strong').textContent=values[i];
    card.querySelector('.trend').textContent=['已保存内容','过去 7 天','内容中的标签','等待归纳'][i];
    card.querySelector('.mini-bars').hidden=true;
  });
  document.querySelector('.source-panel .muted').textContent='全部内容来源分布';
  document.querySelectorAll('.source-row').forEach((row,i)=>{
    const n=contentItems.filter(item=>item.source===['douyin','x','manual'][i]).length;
    const percent=contentItems.length?Math.round(n/contentItems.length*100):0;
    row.querySelector('b').textContent=n;row.querySelector('i').style.width=`${percent}%`;row.lastElementChild.textContent=`${percent}%`;
  });
  document.querySelector('.hot-tags').innerHTML=[...tagCounts].sort((a,b)=>b[1]-a[1]).slice(0,8).map(([tag,n])=>`<button class="hot-tag purple-bg" data-tag="${escapeHtml(tag)}">#${escapeHtml(tag)} <b>${n}</b></button>`).join('');
  document.querySelector('.recent-list').innerHTML=contentItems.slice().sort((a,b)=>Date.parse(b.updatedAt||b.createdAt||0)-Date.parse(a.updatedAt||a.createdAt||0)).slice(0,4).map(item=>`<button class="recent-row" data-recent="${escapeHtml(item.id)}"><span class="doc-icon">▤</span><strong>${escapeHtml(item.title)}</strong><span>${escapeHtml(item.date || '')}</span></button>`).join('');
  document.querySelectorAll('[data-recent]').forEach(button=>button.addEventListener('click',()=>openDetail(button.dataset.recent)));
  renderInbox(pending);
  document.querySelector('.heatmap-panel h2').textContent='收集记录';
  document.querySelector('.heatmap-panel .muted').textContent='近 60 天有日期记录的新增内容';
  document.querySelector('.heat-labels').hidden=true;
  createHeatmap();
}

function compareContent(a, b) {
  return (Number(b.rating) || 0) - (Number(a.rating) || 0) || (Number(a.sequence) || 999999) - (Number(b.sequence) || 999999);
}
function safeUrl(value) {
  try { const url = new URL(value); return ['http:', 'https:'].includes(url.protocol) ? url.href : ''; } catch { return ''; }
}
function localFileUrl(value) { return /^\/api\/files\/[a-f0-9]{32}$/.test(value || '') ? value : ''; }
function safeMediaUrl(value) { return localFileUrl(value) || safeUrl(value); }
function coverMarkup(item, className) {
  const url = safeMediaUrl(item.coverUrl);
  return url ? `<img class="${className}" src="${escapeHtml(url)}" alt="${escapeHtml(item.title)}的封面" loading="lazy" referrerpolicy="no-referrer" />` : `<div class="${className} cover-missing">${item.url ? '封面待补充' : '文字笔记'}</div>`;
}
function stars(value) {
  const n = Math.max(0, Math.min(5, Number(value) || 0));
  return '★'.repeat(n) + '☆'.repeat(5 - n);
}
function ratingControls(item) {
  return `<div class="rating-controls" role="group" aria-label="${escapeHtml(item.title)}的评分">${[1,2,3,4,5].map(n => `<button data-rate="${escapeHtml(item.id)}" data-rating="${n}" aria-label="评分 ${n} 星" aria-pressed="${Number(item.rating) === n}">${n <= (item.rating || 0) ? '★' : '☆'}</button>`).join('')}</div>`;
}
function updateSelectionHint() {
  document.getElementById('selectionHint').textContent = selectedItems.size ? `已选 ${selectedItems.size} 条，可生成周刊` : '勾选内容加入周刊';
}
document.addEventListener('change', event => {
  if (!event.target.matches('[data-select]')) return;
  const id = event.target.dataset.select;
  if (event.target.checked) selectedItems.add(id); else selectedItems.delete(id);
  updateSelectionHint();
});
document.addEventListener('click', async event => {
  const button = event.target.closest('[data-rate]');
  if (button) {
    const item = contentItems.find(entry => entry.id === button.dataset.rate);
    if (!item) return;
    item.rating = Number(button.dataset.rating);
    if (detailDrawer.dataset.itemId === item.id && detailBackdrop.classList.contains('is-open')) openDetail(item.id);
    renderLibrary();
    try { await persistState(); showToast(`已评 ${item.rating} 星，按星级重新排序`); } catch { /* persistState reports the failure */ }
  }
  const issueButton = event.target.closest('[data-issue]');
  if (issueButton) { activeNewsletterId = issueButton.dataset.issue; renderNewsletters(); }
});
function renderComposerPreview(message = '') {
  const target = document.getElementById('composerPreview');
  target.classList.toggle('is-hidden', !composerPreviewData && !message);
  const kind = composerPreviewData?.coverKind;
  const description = kind === 'video_cover' ? '已取得这条视频的封面与网页文案，请核对后保存' : kind === 'manual_image' ? '使用你上传或补充的封面' : '已取得网页图片；尚未确认是视频封面，请核对';
  target.innerHTML = composerPreviewData ? `${coverMarkup(composerPreviewData, 'preview-cover')}<div><strong>${escapeHtml(composerPreviewData.title || '链接预览')}</strong><small>${escapeHtml(message || (composerPreviewData.coverUrl ? description : '未取得封面，需要补充后再发布周刊'))}</small></div>` : `<small>${escapeHtml(message)}</small>`;
}
async function previewLink() {
  clearTimeout(previewTimer); previewTimer=null;
  const raw = document.getElementById('composerUrl').value.trim();
  const url = safeUrl(raw.match(/https?:\/\/[^\s]+/)?.[0] || raw);
  if (!url) { showToast('请粘贴有效的网页链接'); return; }
  const generation = ++previewGeneration;
  const before = Object.fromEntries(['composerTitle','composerBody','composerCover','composerCaption'].map(id=>[id,document.getElementById(id).value]));
  previewPending=true;
  const button = document.querySelector('[data-action="preview-link"]');
  button.disabled = true; renderComposerPreview('正在获取原文和封面…');
  try {
    const response = await fetch('/api/preview', {method:'POST', headers:{'Content-Type':'application/json'}, body:JSON.stringify({url})});
    if (!response.ok) throw new Error('链接解析服务暂不可用');
    const data = await response.json();
    if (generation !== previewGeneration || document.getElementById('composerUrl').value.trim() !== raw || !modalBackdrop.classList.contains('is-open')) return;
    const updates = CaptureDraft.mergePreview(before,composerValues(),composerAutomatic,{
      composerTitle:data.title,composerBody:data.description,composerCover:data.coverUrl,composerCaption:data.description
    });
    // Preserve provenance for a good cover retained after an incomplete retry.
    const previous=composerPreviewData;
    composerPreviewData = previous?.coverUrl && !data.coverUrl ? {...previous,captionWarning:data.captionWarning || ''} : data;
    for(const [id,value] of Object.entries(updates)) { document.getElementById(id).value=value; composerAutomatic[id]=value; }
    document.getElementById('composerUrl').value = data.url || url;
    document.getElementById('composerSource').value = data.source || 'manual';
    stashComposerDraft();
    renderComposerPreview(data.captionWarning || data.coverWarning || (data.previewStatus === 'ready' ? '' : '原站没有返回完整封面与文案；请核对补充，尚未完成自动解析'));
  } catch (error) { if(generation === previewGeneration) renderComposerPreview(error.message); }
  finally { if(generation === previewGeneration) { button.disabled = false; previewPending=false; } }
}
function openNewsletterComposer() {
  if (!selectedItems.size) { showView('library'); showToast('先勾选要放入本期周刊的内容'); return; }
  document.getElementById('newsletterTitle').value = `灵感内刊 · Vol. ${String(newsletters.length + 1).padStart(3, '0')}`;
  document.getElementById('newsletterDestination').innerHTML = '<option value="new">新建一期周刊</option>' + newsletters.map(issue=>`<option value="${escapeHtml(issue.id)}">${escapeHtml(issue.date)} · ${escapeHtml(issue.title)}</option>`).join('');
  const today = new Date();
  document.getElementById('newsletterDate').value = `${today.getFullYear()}-${String(today.getMonth()+1).padStart(2,'0')}-${String(today.getDate()).padStart(2,'0')}`;
  document.getElementById('newsletterSelectionSummary').textContent = `本期包含 ${selectedItems.size} 条内容。优先按星级排列，同星级按手动序号排列。生成后保存本期快照。`;
  document.getElementById('newsletterModalBackdrop').classList.add('is-open');
  updateNewsletterDestination();
}
function updateNewsletterDestination() {
  const existing = document.getElementById('newsletterDestination').value !== 'new';
  ['newsletterTitle','newsletterDate','newsletterIntro'].forEach(id=>document.getElementById(id).closest('.field-label').hidden=existing);
  document.querySelector('[data-action="save-newsletter"]').textContent = existing ? '加入并更新这一期' : '生成并获取分享链接';
  document.getElementById('newsletterSelectionSummary').textContent = `已选 ${selectedItems.size} 条。` + (existing ? '已有内容不会重复加入。确认后，该期阅读链接将显示新增条目。' : '优先按星级排列，同星级按手动序号排列。');
}
async function saveNewsletter() {
  const button = document.querySelector('[data-action="save-newsletter"]');
  button.disabled = true;
  try {
    if (!apiEnabled) throw new Error('请先连接资料库，再生成周刊');
    const destination = document.getElementById('newsletterDestination').value;
    const period = destination==='new' ? LinganPeriodControls.read(document.querySelector('[data-period-controls="newsletter"]')) : {};
    await persistState();
    const endpoint = destination === 'new' ? '/api/newsletters' : `/api/newsletters/${encodeURIComponent(destination)}/items`;
    const response = await fetch(endpoint, {method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({title:document.getElementById('newsletterTitle').value, date:document.getElementById('newsletterDate').value, intro:document.getElementById('newsletterIntro').value,...(typeof TextStyling!=='undefined'?{textStyle:TextStyling.readForField(document.getElementById('newsletterIntro'))}:{}),...period,itemIds:[...selectedItems]})});
    const result = await response.json();
    if (!response.ok) throw new Error(result.message || '周刊生成失败');
    newsletters = [result.newsletter, ...newsletters.filter(issue=>issue.id !== result.newsletter.id)]; activeNewsletterId = result.newsletter.id;
    serverRevision = result.updatedAt;
    selectedItems.clear();
    document.getElementById('newsletterModalBackdrop').classList.remove('is-open');
    showView('newsletters');
    showToast(destination === 'new' ? '周刊已生成，可预览并复制阅读链接' : `已加入所选周刊，新增 ${result.added} 条`);
  } catch (error) { showToast(error.message); }
  finally { button.disabled = false; }
}
function renderNewsletters() {
  document.getElementById('newsletterCount').textContent = newsletters.length;
  document.getElementById('newsletterTotal').textContent = `${newsletters.length} 期`;
  document.getElementById('newsletterEmpty').hidden = newsletters.length > 0;
  if (!newsletters.some(issue => issue.id === activeNewsletterId)) activeNewsletterId = newsletters[0]?.id || null;
  renderSidebarIssues();
  document.getElementById('newsletterList').innerHTML = newsletters.map(issue => `<button class="newsletter-item ${issue.id === activeNewsletterId ? 'is-active' : ''}" data-issue="${escapeHtml(issue.id)}"><strong>▤ ${escapeHtml(issue.title)}</strong><small>${escapeHtml(issue.date)}${LinganPeriodControls.formatRange(issue)?' · '+escapeHtml(LinganPeriodControls.formatRange(issue)):''} · ${(issue.items || []).length} 条内容</small></button>`).join('');
  const issue = newsletters.find(entry => entry.id === activeNewsletterId);
  if (!issue) { document.getElementById('newsletterReader').innerHTML='<div class="reader-empty"><span>▤</span><h2>开始你的第一期周刊</h2><p>在内容库勾选内容，选择日期，整理成一期可以分享的周刊。</p><button class="primary-button" data-view="library">去内容库选内容</button></div>'; return; }
  renderDocumentIssue(issue);
}
async function copyShare(token) {
  try {
    async function resolveShare() {
      const response = await fetch('/api/cloud/share/' + encodeURIComponent(token));
      if (!response.ok) throw Error('无法确认阅读链接，请稍后重试');
      return response.json();
    }
    let info = await resolveShare();
    if (info.mode === 'pending') {
      showToast('正在同步这一期，完成后复制公网阅读链接…');
      const response = await fetch('/api/cloud/sync', {method:'POST', headers:{'Content-Type':'application/json'}, body:'{}'});
      const status = await response.json();
      if (!response.ok || status.state !== 'connected') throw Error(status.message || '本期尚未同步，请在设置中检查同步状态');
      info = await resolveShare();
    }
    let url, scope;
    if (info.available) {
      const destination = new URL(info.url);
      if (destination.protocol !== 'https:' || destination.hostname !== 'lingan-library.wozhe0196.chatgpt.site' || destination.username || destination.password || destination.port || destination.pathname !== '/share/' + encodeURIComponent(token) || destination.search || destination.hash) throw Error('阅读链接不正确，请检查同步状态');
      url = destination.href;
      scope = '公网可访问这一期';
    } else if (info.mode === 'local') {
      const base = typeof mobileAccess !== 'undefined' && mobileAccess?.enabled && mobileAccess.urls?.length ? mobileAccess.urls[0] : location.origin;
      url = new URL(`/share/${encodeURIComponent(token)}`, base).href;
      scope = ['localhost','127.0.0.1'].includes(new URL(base).hostname) ? '仅本机可访问' : '仅同一 Wi-Fi 内可访问';
    } else throw Error(info.message || '本期还未同步，暂不能复制公网链接');
    try { await navigator.clipboard.writeText(url); showToast(`阅读链接已复制（${scope}）`); }
    catch { window.prompt('复制阅读链接（' + scope + '）', url); }
  } catch (error) { showToast(error.message || '复制阅读链接失败，请重试'); }
}

if (document.modelContext?.registerTool) {
  document.modelContext.registerTool({name:'search_library',description:'Search saved knowledge without changing it.',inputSchema:{type:'object',properties:{query:{type:'string'}},required:['query'],additionalProperties:false},annotations:{readOnlyHint:true,untrustedContentHint:true},execute({query}){if(typeof query!=='string')throw Error('query must be text');document.getElementById('globalSearch').value=query;showView('library');return contentItems.filter(x=>(x.title+' '+x.caption+' '+(x.tags||[]).join(' ')).toLowerCase().includes(query.toLowerCase())).map(x=>({id:x.id,title:x.title,rating:x.rating}));}});
  document.modelContext.registerTool({name:'start_link_capture',description:'Open a draft for a link. Does not save or publish it.',inputSchema:{type:'object',properties:{url:{type:'string'}},required:['url'],additionalProperties:false},annotations:{readOnlyHint:false,untrustedContentHint:false},execute({url}){if(!safeUrl(url))throw Error('Invalid URL');openComposer();document.getElementById('composerUrl').value=url;return {draftOpened:true};}});
}
