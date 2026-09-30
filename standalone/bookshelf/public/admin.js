import { mountBookLookup } from './book-lookup.js';
import { ebookEditorHtml, mountEbookFinder } from './ebook-ui.js';
const mounts = new WeakMap();
const escapeHtml = value => String(value ?? '').replace(/[&<>"']/g, char => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[char]));
const icons = {
  shelf: '<path d="M4 4h5v15H4zM11 4h4v15h-4zM17 5l3-1 4 14-3 1z"/>',
  home: '<path d="m3 10 9-7 9 7v11H3zM9 21v-8h6v8"/>',
  book: '<path d="M4 3h13a3 3 0 0 1 3 3v15H7a3 3 0 0 1-3-3zM4 18a3 3 0 0 1 3-3h13M8 7h8M8 10h6"/>',
  category: '<rect x="3" y="3" width="7" height="7" rx="1"/><rect x="14" y="3" width="7" height="7" rx="1"/><rect x="3" y="14" width="7" height="7" rx="1"/><rect x="14" y="14" width="7" height="7" rx="1"/>',
  image: '<rect x="3" y="4" width="18" height="16" rx="2"/><circle cx="8" cy="9" r="1.5"/><path d="m3 17 6-5 4 3 3-3 5 5"/>',
  settings: '<path d="M12 3v3M12 18v3M3 12h3M18 12h3M5.6 5.6l2.1 2.1M16.3 16.3l2.1 2.1M5.6 18.4l2.1-2.1M16.3 7.7l2.1-2.1"/><circle cx="12" cy="12" r="5"/><circle cx="12" cy="12" r="2"/>',
  backup: '<path d="M7 7V3h10v4M5 10H3v11h18V10h-2M12 16V7m-4 4 4-4 4 4"/>',
  arrow: '<path d="M20 12H4m6-6-6 6 6 6"/>',
  plus: '<path d="M12 5v14M5 12h14"/>',
  search: '<circle cx="10" cy="10" r="7"/><path d="m15 15 6 6"/>',
  logout: '<path d="M10 4H4v16h6M9 12h12m-5-5 5 5-5 5"/>',
  lock: '<rect x="5" y="10" width="14" height="11" rx="2"/><path d="M8 10V7a4 4 0 0 1 8 0v3M12 14v3"/>',
  edit: '<path d="m16 3 5 5-12 12-6 1 1-6zM13 6l5 5"/>',
  trash: '<path d="M3 6h18M9 6V3h6v3M6 6l1 15h10l1-15M10 10v7M14 10v7"/>',
  upload: '<path d="M4 15v6h16v-6M12 16V3m-5 5 5-5 5 5"/>',
  download: '<path d="M4 15v6h16v-6M12 3v13m-5-5 5 5 5-5"/>',
  check: '<path d="m5 12 4 4L19 6"/>',
  sparkle: '<path d="m12 2 2.8 7.2L22 12l-7.2 2.8L12 22l-2.8-7.2L2 12l7.2-2.8z"/>',
  chevron: '<path d="m9 5 7 7-7 7"/>',
};
const icon = name => `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.65" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${icons[name] || icons.book}</svg>`;
const statusNames = {want:'想读', reading:'在读', finished:'读完'};
const categorySymbols = {book:'▤',books:'▤','book-half':'▤','book-fill':'▤',journal:'▤',literature:'✦',art:'🎨',palette:'🎨','palette-fill':'🎨',technology:'⌘',code:'⌘','code-slash':'⌘',computer:'⌘',history:'◈',clock:'◈',globe:'◎','globe2':'◎',science:'⚛',life:'✿',heart:'♡','heart-fill':'♡',psychology:'☼',philosophy:'☼',music:'♫','music-note':'♫',star:'☆','stars':'✦',person:'♙','person-fill':'♙',briefcase:'▣',collection:'▤',folder:'▤'};
const categorySymbol = value => categorySymbols[String(value||'').replace(/^bi[- ]/, '')] || (/^[a-z][a-z0-9_-]+$/i.test(value||'')?'▤':value||'▤');
const bookRating = value => Math.max(0,Math.min(5,Math.round(Number(value)||0)));
const pages = [
  {id:'dashboard', title:'书架概览', icon:'home'},
  {id:'books', title:'图书管理', icon:'book'},
  {id:'categories', title:'分类管理', icon:'category'},
  {id:'banners', title:'轮播推荐', icon:'image'},
  {id:'settings', title:'站点设置', icon:'settings'},
  {id:'backup', title:'备份与安全', icon:'backup'},
];
const normaliseLibrary = data => ({settings:data?.settings || {}, books:Array.isArray(data?.books)?data.books:[], categories:Array.isArray(data?.categories)?data.categories:[], banners:Array.isArray(data?.banners)?data.banners:[]});

/** Mount the bookshelf's authenticated management area. */
export async function renderAdmin({root, api, library, refresh, onLibraryChange, toast, navigate, isActive}) {
  mounts.get(root)?.();
  const abort = new AbortController();
  const state = {library:normaliseLibrary(library), page:'dashboard', auth:null, search:'', category:'', status:'', selected:new Set(), dialog:null, confirm:null, restore:null, intentHandled:false, lookupCleanup:null, objectUrls:[], stopped:false};
  const el = selector => root.querySelector(selector);
  const json = (path, method, data) => api(path, {method, headers:{'Content-Type':'application/json'}, body:JSON.stringify(data)});
  const notify = (message, type='success') => {
    if (!alive()) return;
    if (typeof toast === 'function') toast(message, type);
    else {
      const live = el('.admin-live');
      if (live) {live.textContent = message; live.classList.toggle('is-error', type === 'error'); live.classList.add('is-visible'); setTimeout(() => live.classList.remove('is-visible'), 5000);}
    }
  };
  const categoryName = id => state.library.categories.find(category => category.id === id)?.name || '未分类';
  const cleanup = () => {
    state.stopped = true;
    abort.abort();
    closeDialog();
    if(mounts.get(root)===cleanup)mounts.delete(root);
  };
  mounts.set(root, cleanup);
  function alive() {if(state.stopped)return false;if(typeof isActive==='function'&&!isActive()){cleanup();return false;}return true;}
  function revokePreviews() {state.objectUrls.forEach(url => URL.revokeObjectURL(url)); state.objectUrls = [];}
  function closeDialog() {
    state.lookupCleanup?.();state.lookupCleanup=null;
    state.dialog?.close();
    state.dialog?.remove();
    state.dialog = null;
    state.confirm = null;
    revokePreviews();
  }
  function errorMessage(error) {return error?.message || '操作没有完成，请稍后重试。';}
  function formError(form, error) {
    const errorBox = form.querySelector('.admin-form-error');
    if (errorBox) {errorBox.textContent = errorMessage(error); errorBox.hidden = false; errorBox.focus();}
    else notify(errorMessage(error), 'error');
  }
  async function busy(form, action) {
    if (form.dataset.busy === 'true') return;
    form.dataset.busy = 'true';
    const buttons = [...form.querySelectorAll('button')];
    buttons.forEach(button => {button.dataset.oldDisabled = String(button.disabled); button.disabled = true;});
    const submit = form.querySelector('button[type="submit"]');
    const oldText = submit?.innerHTML;
    if (submit) submit.innerHTML = '<span class="admin-spinner" aria-hidden="true"></span>正在处理…';
    form.querySelector('.admin-form-error')?.setAttribute('hidden', '');
    form.setAttribute('aria-busy', 'true');
    try {await action();} catch (error) {formError(form, error);} finally {
      form.dataset.busy = 'false';
      form.removeAttribute('aria-busy');
      buttons.forEach(button => {button.disabled = button.dataset.oldDisabled === 'true'; delete button.dataset.oldDisabled;});
      if (submit) submit.innerHTML = oldText;
    }
  }
  async function syncLibrary() {
    const result = await api('/api/library');
    if (!alive()) return;
    state.library = normaliseLibrary(result);
    const currentIds = new Set(state.library.books.map(book=>book.id));
    state.selected = new Set([...state.selected].filter(id=>currentIds.has(id)));
    if (typeof onLibraryChange === 'function') onLibraryChange(state.library);
  }
  function liveRegion() {return '<div class="admin-live" role="status" aria-live="polite"></div>';}
  function formErrorHtml() {return '<p class="admin-form-error" role="alert" tabindex="-1" hidden></p>';}
  function renderLoading() {
    if(!alive())return;
    root.innerHTML = `<section class="admin-loading"><div class="admin-loading-mark">${icon('shelf')}</div><span class="admin-spinner" aria-hidden="true"></span><p>正在打开你的书架工作室…</p></section>`;
  }
  function renderAuth() {
    if(!alive())return;
    const setup = !state.auth.configured;
    root.innerHTML = `<section class="admin-auth"><div class="admin-auth-art" aria-hidden="true"><div class="admin-auth-word">BOOK<br>SHELF.</div><p>每一本书，都是一个新的世界。</p><div class="admin-auth-books"><i></i><i></i><i></i><i></i><i></i></div><span class="admin-auth-rule"></span></div><div class="admin-auth-panel"><button class="admin-text-button admin-back" data-action="home">${icon('arrow')}返回书架</button><div class="admin-auth-form-wrap"><span class="admin-eyebrow">YOUR PERSONAL LIBRARY</span><div class="admin-auth-icon">${icon('lock')}</div><h1>${setup?'欢迎拥有自己的书架':'欢迎回到书架工作室'}</h1><p class="admin-muted">${setup?'创建管理员密码，开始整理你的阅读收藏。':'登录后，继续收集、分类和记录那些与你相遇的书。'}</p><form data-form="auth" class="admin-form"><label>管理员密码<input name="password" type="password" autocomplete="${setup?'new-password':'current-password'}" ${setup?'minlength="12"':''} required autofocus placeholder="${setup?'至少 12 个字符':'输入你的管理员密码'}"></label>${setup?'<label>再次输入密码<input name="confirmPassword" type="password" autocomplete="new-password" minlength="12" required placeholder="再输入一次，确认无误"></label><p class="admin-field-help">请妥善保存密码。后台没有预设密码，也没有邮件找回功能。</p>':''}${formErrorHtml()}<button type="submit" class="admin-button admin-primary">${setup?'创建我的书架':'登录工作室'}${icon('chevron')}</button></form><p class="admin-auth-caption">A quiet place for your books.</p></div></div>${liveRegion()}</section>`;
    requestAnimationFrame(() => {if(alive())el('input[autofocus]')?.focus();});
  }
  function header(title, description, actions='') {
    return `<header class="admin-section-heading"><div><span class="admin-eyebrow">MY BOOKSHELF / STUDIO</span><h1>${title}</h1><p>${description}</p></div>${actions?`<div class="admin-heading-actions">${actions}</div>`:''}</header>`;
  }
  function primaryButton(action, label) {return `<button class="admin-button admin-primary" data-action="${action}">${icon('plus')}${label}</button>`;}
  function render() {
    if (!alive()) return;
    closeDialog();
    if (!state.auth?.authenticated) {renderAuth(); return;}
    const content = {dashboard:dashboard, books:booksPage, categories:categoriesPage, banners:bannersPage, settings:settingsPage, backup:backupPage}[state.page]();
    root.innerHTML = `<div class="admin-layout"><aside class="admin-sidebar" aria-label="后台导航"><button class="admin-brand" data-action="home"><span class="admin-brand-icon">${icon('shelf')}</span><span>${escapeHtml(state.library.settings.title || '我的书架')}<small>BOOKSHELF STUDIO</small></span></button><p class="admin-sidebar-label">书架工作室</p><nav class="admin-nav">${pages.map(page => `<button class="admin-nav-item ${state.page===page.id?'is-active':''}" data-action="page" data-page="${page.id}" ${state.page===page.id?'aria-current="page"':''}>${icon(page.icon)}<span>${page.title}</span>${page.id==='books'?`<em>${state.library.books.length}</em>`:''}</button>`).join('')}</nav><div class="admin-sidebar-bottom"><div class="admin-admin-profile"><span>馆</span><div>书架管理员<small>让喜欢的书各得其所</small></div><i aria-label="已登录"></i></div><button class="admin-nav-item" data-action="home">${icon('arrow')}<span>看看我的书架</span></button><button class="admin-nav-item" data-action="logout">${icon('logout')}<span>退出登录</span></button></div></aside><div class="admin-workspace"><div class="admin-topbar"><span><i></i>你的私人阅读空间</span><button class="admin-text-button" data-action="home">访问书架 ${icon('chevron')}</button></div><main class="admin-main">${content}</main><footer class="admin-footer"><span>Collect stories. Keep memories.</span><span>每一次阅读，都值得被记住。</span></footer></div></div>${liveRegion()}`;
  }
  function bookCover(book, className='') {
    return `<div class="admin-book-cover ${className}"${book.coverUrl?'':` style="--cover-tone:${['#789589','#8d758c','#a17b58','#7489a8','#9a8c67'][Math.abs(String(book.id||'').length)%5]}"`}>${book.coverUrl?`<img src="${escapeHtml(book.coverUrl)}" alt="${escapeHtml(book.title)}的封面" loading="lazy">`:`<span>${escapeHtml(book.title || '新的一本书')}</span><small>${escapeHtml(book.author || 'BOOKSHELF')}</small>`}</div>`;
  }
  function dashboard() {
    const data = state.library;
    const reading = data.books.filter(book=>book.status==='reading').length;
    const finished = data.books.filter(book=>book.status==='finished').length;
    const recent = [...data.books].sort((a,b)=>String(b.updatedAt||b.createdAt||'').localeCompare(String(a.updatedAt||a.createdAt||''))).slice(0,5);
    const statCards = [{label:'收藏的图书',value:data.books.length,icon:'book',caption:'每一本都有它的位置'},{label:'正在阅读',value:reading,icon:'sparkle',caption:'与新的世界相遇'},{label:'已经读完',value:finished,icon:'check',caption:'留在心里的故事'},{label:'书架分类',value:data.categories.length,icon:'category',caption:'把好书整理得井井有条'}];
    return header('把喜欢的书，留在这里。','欢迎回到你的书架。收集好书，也保存阅读中的灵光。',primaryButton('add-book','收录一本书'))+`<section class="admin-stats" aria-label="书架统计">${statCards.map(item=>`<article class="admin-stat"><div class="admin-stat-top"><span>${item.label}</span>${icon(item.icon)}</div><strong>${item.value}<small>${item.icon==='category'?'类':'本'}</small></strong><p>${item.caption}</p></article>`).join('')}</section><div class="admin-dashboard-grid"><section class="admin-panel"><div class="admin-panel-heading"><h2>最近整理</h2><button class="admin-text-button" data-action="page" data-page="books">管理全部 ${icon('chevron')}</button></div>${recent.length?`<div class="admin-recent-list">${recent.map(book=>`<button class="admin-recent-book" data-action="edit-book" data-id="${escapeHtml(book.id)}">${bookCover(book)}<span class="admin-recent-text"><strong>${escapeHtml(book.title)}</strong><small>${escapeHtml(book.author || '作者待补充')} · ${escapeHtml(categoryName(book.categoryId))}</small></span><span class="admin-status status-${escapeHtml(book.status || 'want')}">${statusNames[book.status]||'想读'}</span>${icon('chevron')}</button>`).join('')}</div>`:empty('book','你的书架从第一本书开始','收录最近读到的好书，添加封面和阅读笔记。',primaryButton('add-book','收录第一本书'))}</section><aside class="admin-studio-card"><span class="admin-eyebrow">A LIBRARY OF YOUR OWN</span><h2>为每次阅读，<br>留一盏灯。</h2><p>封面、分类、阅读状态和那些舍不得忘记的句子，都可以在这里慢慢整理。</p><div class="admin-mini-shelf" aria-hidden="true"><i></i><i></i><i></i><i></i><i></i><i></i></div><button class="admin-button admin-secondary" data-action="page" data-page="settings">装点我的书架 ${icon('chevron')}</button></aside></div><section class="admin-quick-links" aria-label="快捷管理"><button data-action="page" data-page="categories">${icon('category')}<span><strong>整理分类</strong><small>为书籍找一个合适的位置</small></span>${icon('chevron')}</button><button data-action="page" data-page="banners">${icon('image')}<span><strong>编辑推荐</strong><small>让喜欢的书成为第一眼风景</small></span>${icon('chevron')}</button><button data-action="page" data-page="backup">${icon('backup')}<span><strong>备份收藏</strong><small>保存书架资料和阅读笔记</small></span>${icon('chevron')}</button></section>`;
  }
  function empty(iconName, title, description, action='') {return `<div class="admin-empty"><span>${icon(iconName)}</span><h3>${title}</h3><p>${description}</p>${action}</div>`;}
  function booksPage() {
    return header('图书管理','收藏、分类与阅读笔记，让每一本书都有自己的故事。',primaryButton('add-book','收录图书'))+`<p class="admin-demo-note">首次附带示例藏书，可编辑或删除后换成自己的收藏；支持勾选图书后批量删除。</p><section class="admin-panel admin-books-panel"><div class="admin-filters"><label class="admin-search">${icon('search')}<input type="search" id="admin-book-search" placeholder="搜索书名、作者或笔记…" aria-label="搜索书籍" value="${escapeHtml(state.search)}"></label><label class="admin-filter"><span class="admin-sr-only">分类筛选</span><select id="admin-category-filter"><option value="">所有分类</option><option value="uncategorized"${state.category==='uncategorized'?' selected':''}>未分类</option>${state.library.categories.map(category=>`<option value="${escapeHtml(category.id)}"${category.id===state.category?' selected':''}>${escapeHtml(category.name)}</option>`).join('')}</select></label><label class="admin-filter"><span class="admin-sr-only">阅读状态</span><select id="admin-status-filter"><option value="">所有状态</option>${Object.entries(statusNames).map(([value,label])=>`<option value="${value}"${value===state.status?' selected':''}>${label}</option>`).join('')}</select></label></div><div id="admin-book-results">${bookResults()}</div></section>`;
  }
  function filteredBooks() {
    const query = state.search.trim().toLowerCase();
    return state.library.books.filter(book=>(!query||[book.title,book.author,book.description,book.notes].some(value=>String(value||'').toLowerCase().includes(query)))&&(!state.category||(state.category==='uncategorized'?!book.categoryId:book.categoryId===state.category))&&(!state.status||book.status===state.status));
  }
  function bookResults() {
    const filtered=filteredBooks();
    if (!filtered.length) return state.library.books.length?empty('search','没有找到这本书','试试其他关键词，或换一个分类和阅读状态。','<button class="admin-button admin-secondary" data-action="reset-filters">清除筛选</button>'):empty('book','等待与你相遇的第一本书','上传封面、记录书名，再写下让你心动的那句话。',primaryButton('add-book','收录第一本书'));
    return `<div class="admin-result-toolbar"><div class="admin-result-count">共 <strong>${filtered.length}</strong> 本图书${filtered.length!==state.library.books.length?` / 收藏 ${state.library.books.length} 本`:''}</div><div class="admin-selection-toolbar"><label><input type="checkbox" id="admin-select-all" ${filtered.every(book=>state.selected.has(book.id))?'checked':''}>选择当前结果</label><span class="admin-selection-count">已选 ${state.selected.size} 本</span><button class="admin-text-button admin-danger-text" data-action="bulk-delete" id="admin-bulk-delete" ${state.selected.size?'':'disabled'}>${icon('trash')}删除所选</button></div></div><div class="admin-book-grid">${filtered.map(book=>`<article class="admin-book-card"><label class="admin-book-select"><input type="checkbox" data-book-select="${escapeHtml(book.id)}" ${state.selected.has(book.id)?'checked':''}><span class="admin-sr-only">选择${escapeHtml(book.title)}</span></label><button class="admin-cover-button" data-action="edit-book" data-id="${escapeHtml(book.id)}" aria-label="编辑${escapeHtml(book.title)}">${bookCover(book)}${book.featured?'<span class="admin-featured-tag">首页推荐</span>':''}</button><div class="admin-book-details"><span class="admin-category-tag">${escapeHtml(categoryName(book.categoryId))}</span><h2 title="${escapeHtml(book.title)}">${escapeHtml(book.title)}</h2><p>${escapeHtml(book.author || '作者待补充')}</p><div class="admin-book-meta"><span class="admin-status status-${escapeHtml(book.status||'want')}">${statusNames[book.status]||'想读'}</span><span class="admin-rating" aria-label="${bookRating(book.rating)} 星">${'★'.repeat(bookRating(book.rating))}${'☆'.repeat(5-(bookRating(book.rating)))}</span></div><div class="admin-book-actions"><button class="admin-text-button" data-action="edit-book" data-id="${escapeHtml(book.id)}">${icon('edit')}编辑</button>${book.fileUrl?`<a class="admin-icon-button" href="/api/books/${encodeURIComponent(book.id)}/file" aria-label="下载${escapeHtml(book.title)}" title="下载书籍文件">${icon('download')}</a>`:''}<button class="admin-icon-button admin-danger-text" data-action="delete-book" data-id="${escapeHtml(book.id)}" aria-label="删除${escapeHtml(book.title)}" title="删除图书">${icon('trash')}</button></div></div></article>`).join('')}</div>`;
  }
  function updateSelection() {
    root.querySelectorAll('[data-book-select]').forEach(input=>{input.checked=state.selected.has(input.dataset.bookSelect);});
    const visible=filteredBooks(),selected=visible.filter(book=>state.selected.has(book.id)).length;
    const all=el('#admin-select-all');if(all){all.checked=selected===visible.length;all.indeterminate=selected>0&&selected<visible.length;}
    const count=el('.admin-selection-count');if(count)count.textContent=`已选 ${state.selected.size} 本`;
    const button=el('#admin-bulk-delete');if(button)button.disabled=state.selected.size===0;
  }
  function categoriesPage() {
    return header('分类管理','用你自己的方式整理书架，文学、艺术、技术，或任何感兴趣的主题。',primaryButton('add-category','新建分类'))+`<section class="admin-panel">${state.library.categories.length?`<div class="admin-category-grid">${state.library.categories.map(category=>{const count=state.library.books.filter(book=>book.categoryId===category.id).length;return `<article class="admin-category-card"><span class="admin-category-symbol">${escapeHtml(categorySymbol(category.icon))}</span><div><h2>${escapeHtml(category.name)}</h2><p>${count} 本图书</p></div><div class="admin-category-actions"><button class="admin-icon-button" data-action="edit-category" data-id="${escapeHtml(category.id)}" aria-label="编辑${escapeHtml(category.name)}">${icon('edit')}</button><button class="admin-icon-button admin-danger-text" data-action="delete-category" data-id="${escapeHtml(category.id)}" aria-label="删除${escapeHtml(category.name)}">${icon('trash')}</button></div></article>`;}).join('')}</div>`:empty('category','给书架一个清晰的目录','从几个喜欢的主题开始，之后随时可以修改。',primaryButton('add-category','创建第一个分类'))}<div class="admin-panel-tip">${icon('book')}<p>未指定分类的图书会显示在「未分类」中。删除分类后，图书仍保留在书架上。</p></div></section>`;
  }
  function bannersPage() {
    return header('轮播推荐','把喜欢的封面与风景放在首页，也可以关联一本书或一个分类。',primaryButton('add-banner','新增推荐'))+`<section class="admin-panel">${state.library.banners.length?`<div class="admin-banner-grid">${state.library.banners.map((banner,index)=>`<article class="admin-banner-card"><div class="admin-banner-image">${banner.imageUrl?`<img src="${escapeHtml(banner.imageUrl)}" alt="${escapeHtml(banner.title || '首页推荐')}" loading="lazy">`:`<span>${icon('image')}</span>`}<span class="admin-banner-number">${String(index+1).padStart(2,'0')}</span><div class="admin-banner-overlay"><h2>${escapeHtml(banner.title || '新的阅读风景')}</h2></div></div><div class="admin-banner-info"><div><strong>${escapeHtml(banner.title || '未命名推荐')}</strong><p>${banner.bookId?`关联图书：${escapeHtml(state.library.books.find(book=>book.id===banner.bookId)?.title||'未关联')}`:banner.categoryId?`关联分类：${escapeHtml(categoryName(banner.categoryId))}`:'首页展示图片'}</p></div><div class="admin-inline-actions"><button class="admin-icon-button" data-action="edit-banner" data-id="${escapeHtml(banner.id)}" aria-label="编辑${escapeHtml(banner.title)}">${icon('edit')}</button><button class="admin-icon-button admin-danger-text" data-action="delete-banner" data-id="${escapeHtml(banner.id)}" aria-label="删除${escapeHtml(banner.title)}">${icon('trash')}</button></div></div></article>`).join('')}</div>`:empty('image','让首页有自己的阅读风景','添加推荐图，保留书架首页的轮播与互动。',primaryButton('add-banner','添加第一张推荐'))}<div class="admin-panel-tip">${icon('image')}<p>推荐图片建议使用宽幅构图。上传后可以在编辑窗口里查看预览；展示顺序与这里一致。</p></div></section>`;
  }
  function settingsPage() {
    const settings=state.library.settings;
    return header('站点设置','把书架布置成你喜欢的样子。这里的改动会直接应用到首页。')+`<form data-form="settings" class="admin-settings-form admin-form"><section class="admin-panel"><div class="admin-panel-heading"><h2>书架的名字与问候</h2><span class="admin-mini-label">BASIC INFORMATION</span></div><div class="admin-settings-fields"><label>书架名称<input name="title" value="${escapeHtml(settings.title||'我的书架')}" maxlength="100" required placeholder="例如：我的书架"></label><label>欢迎语<input name="welcome" value="${escapeHtml(settings.welcome||'')}" maxlength="200" placeholder="例如：欢迎来到我的书架"></label><label>书架简介<textarea name="tagline" rows="3" maxlength="1000" placeholder="写一句话，介绍你的阅读世界…">${escapeHtml(settings.tagline||'')}</textarea></label></div></section><section class="admin-panel"><div class="admin-panel-heading"><h2>展示偏好</h2><span class="admin-mini-label">MAKE IT YOURS</span></div><div class="admin-settings-fields"><fieldset class="admin-theme-fieldset"><legend>默认主题</legend><div class="admin-theme-options">${[{value:'light',label:'暖纸浅色',description:'明亮而柔和'},{value:'dark',label:'夜读深色',description:'安静的夜晚'},{value:'system',label:'跟随系统',description:'随设备切换'}].map(theme=>`<label class="admin-theme-option"><input type="radio" name="defaultTheme" value="${theme.value}" ${(settings.defaultTheme||'light')===theme.value?'checked':''}><span class="admin-theme-swatch theme-${theme.value}"><i></i><i></i><i></i></span><strong>${theme.label}</strong><small>${theme.description}</small></label>`).join('')}</div></fieldset><label class="admin-toggle-row"><span><strong>显示作家推荐</strong><small>在首页展示作家卡片与左右切换效果</small></span><input class="admin-switch" type="checkbox" name="showAuthors" ${settings.showAuthors!==false?'checked':''}></label><label class="admin-toggle-row"><span><strong>显示首页轮播</strong><small>展示「轮播推荐」中的图片与互动</small></span><input class="admin-switch" type="checkbox" name="showGallery" ${settings.showGallery!==false?'checked':''}></label></div></section>${formErrorHtml()}<div class="admin-save-bar"><span>修改后点击保存，立即更新你的书架。</span><button type="submit" class="admin-button admin-primary">${icon('check')}保存设置</button></div></form>`;
  }
  function backupPage() {
    return header('备份与安全','保存收藏与阅读记录，为你的私人书架留一份安心。')+`<div class="admin-backup-grid"><section class="admin-panel"><div class="admin-panel-heading"><h2>书架资料备份</h2>${icon('backup')}</div><div class="admin-backup-body"><div class="admin-backup-summary"><span><strong>${state.library.books.length}</strong> 本图书</span><span><strong>${state.library.categories.length}</strong> 个分类</span><span><strong>${state.library.banners.length}</strong> 张推荐</span></div><p>下载 JSON 备份，包含书架设置、图书资料、分类、推荐图设置和阅读笔记。</p><p class="admin-field-help">备份不包含上传的封面或书籍文件。迁移服务器时，请同时保存服务器的上传文件目录。</p><button class="admin-button admin-primary" data-action="export">${icon('download')}导出书架备份</button><div class="admin-backup-divider"></div><h3>从备份恢复</h3><p>导入此前导出的 JSON 文件。恢复前会显示内容摘要，并由你确认覆盖现有资料。</p><label class="admin-import-button admin-button admin-secondary">${icon('upload')}选择备份文件<input type="file" id="admin-restore-file" accept=".json,application/json" class="admin-sr-only"></label></div></section><section class="admin-panel"><div class="admin-panel-heading"><h2>修改管理员密码</h2>${icon('lock')}</div><form data-form="password" class="admin-form admin-password-form"><label>当前密码<input name="currentPassword" type="password" autocomplete="current-password" required placeholder="输入当前管理员密码"></label><label>新密码<input name="password" type="password" autocomplete="new-password" minlength="12" required placeholder="至少 12 个字符"></label><label>再次输入新密码<input name="confirmPassword" type="password" autocomplete="new-password" minlength="12" required placeholder="再次确认新密码"></label><p class="admin-field-help">使用较长且独特的密码，并妥善保存。</p>${formErrorHtml()}<button type="submit" class="admin-button admin-secondary">${icon('lock')}更新密码</button></form></section></div>`;
  }
  function showDialog({title, subtitle='', body, form, wide=false, submit='保存', danger=false}) {
    if(!alive())return;
    closeDialog();
    const dialog=document.createElement('dialog');
    dialog.className=`admin-dialog ${wide?'admin-dialog-wide':''}`;
    dialog.innerHTML=`<form data-form="${form}" class="admin-form"><header class="admin-dialog-heading"><div><span class="admin-eyebrow">BOOKSHELF STUDIO</span><h2 id="admin-dialog-title">${title}</h2>${subtitle?`<p>${subtitle}</p>`:''}</div><button type="button" class="admin-dialog-close" data-action="close-dialog" aria-label="关闭窗口">×</button></header><div class="admin-dialog-body">${body}${formErrorHtml()}</div><footer class="admin-dialog-footer"><button type="button" class="admin-button admin-secondary" data-action="close-dialog">取消</button><button type="submit" class="admin-button ${danger?'admin-danger':'admin-primary'}">${submit}</button></footer></form>`;
    dialog.setAttribute('aria-labelledby','admin-dialog-title');
    root.append(dialog);
    state.dialog=dialog;
    dialog.addEventListener('close',()=>{if (state.dialog===dialog) {dialog.remove();state.dialog=null;state.lookupCleanup?.();state.lookupCleanup=null;revokePreviews();}}, {signal:abort.signal});
    dialog.addEventListener('click', event=>{if(event.target===dialog) {const rect=dialog.getBoundingClientRect();if(event.clientX<rect.left||event.clientX>rect.right||event.clientY<rect.top||event.clientY>rect.bottom)closeDialog();}}, {signal:abort.signal});
    dialog.showModal();
    dialog.querySelector('[autofocus]')?.focus();
  }
  function categoryOptions(selected, initial='未分类') {return `<option value="">${initial}</option>${state.library.categories.map(category=>`<option value="${escapeHtml(category.id)}"${selected===category.id?' selected':''}>${escapeHtml(category.name)}</option>`).join('')}`;}
  function showBook(id) {
    const book=state.library.books.find(book=>book.id===id)||{title:'',author:'',categoryId:'',status:'want',rating:0};
    const body=`<section class="admin-book-lookup" aria-label="自动查询书籍资料"><div class="admin-lookup-heading"><strong>${icon('search')} 自动查书</strong><span>输入书名或 ISBN，选择对应版本后带入资料</span></div><div class="admin-lookup-search-row"><input type="search" data-lookup-query aria-label="查询书名或 ISBN" maxlength="200" placeholder="例如：三体 / 活着 / 9780140328721" value="${escapeHtml(book.isbn||book.title||'')}"><button type="button" class="admin-button admin-primary" data-lookup-search>自动查书</button></div><div data-lookup-results aria-live="polite"></div></section><input type="hidden" name="id" value="${escapeHtml(id||'')}"><input type="hidden" name="fileUrl" value="${escapeHtml(book.fileUrl||'')}"><input type="hidden" name="fileName" value="${escapeHtml(book.fileName||'')}"><div class="admin-book-editor"><div class="admin-cover-editor"><div class="admin-cover-preview" id="admin-cover-preview">${bookCover(book)}</div><label class="admin-upload-label">${icon('upload')}上传封面<input type="file" name="coverFile" accept="image/jpeg,image/png,image/webp,image/gif" class="admin-sr-only"></label><small>JPG · PNG · WEBP · GIF</small></div><div class="admin-book-fields"><label><span>书名 <span class="admin-required">*</span></span><input name="title" value="${escapeHtml(book.title)}" maxlength="200" required autofocus placeholder="这本书叫什么名字？"></label><label>作者<input name="author" value="${escapeHtml(book.author||'')}" maxlength="200" placeholder="作者 / 编者"></label><div class="admin-form-row"><label>所属分类<select name="categoryId">${categoryOptions(book.categoryId)}</select></label><label>阅读状态<select name="status">${Object.entries(statusNames).map(([value,label])=>`<option value="${value}"${book.status===value?' selected':''}>${label}</option>`).join('')}</select></label></div><label>我的评分<select name="rating"><option value="0">暂未评分</option>${Number(book.rating)>0 && !Number.isInteger(Number(book.rating)) ? `<option value="${Number(book.rating)}" selected>${Number(book.rating)} 星</option>` : ''}${[1,2,3,4,5].map(value=>`<option value="${value}"${Number(book.rating)===value?' selected':''}>${'★'.repeat(value)}${'☆'.repeat(5-value)} · ${value} 星</option>`).join('')}</select></label></div></div><div class="admin-form-row admin-publication-fields"><label>ISBN<input name="isbn" value="${escapeHtml(book.isbn||'')}" maxlength="20" placeholder="自动查询后填写，也可手动补充"></label><label>出版社<input name="publisher" value="${escapeHtml(book.publisher||'')}" maxlength="300" placeholder="出版社资料"></label></div><div class="admin-form-row admin-publication-fields"><label>出版日期<input name="publishedDate" value="${escapeHtml(book.publishedDate||'')}" maxlength="100" placeholder="出版年份或日期"></label><label>资料来源<input name="sourceUrl" value="${escapeHtml(book.sourceUrl||'')}" maxlength="2048" placeholder="自动查询的书籍资料链接"></label></div><label>封面图片地址<input name="coverUrl" value="${escapeHtml(book.coverUrl||'')}" placeholder="可填写图片 URL，上传封面时会自动更新"><span class="admin-field-help">也可以直接上传图片。留空会使用书名生成简洁封面。</span></label><label>图书简介<textarea name="description" rows="3" maxlength="20000" placeholder="关于这本书，或吸引你的地方…">${escapeHtml(book.description||'')}</textarea><span class="admin-field-help">简介会显示在公开书架的详情中。</span></label><label>我的阅读笔记<textarea name="notes" rows="4" maxlength="50000" placeholder="留下喜欢的句子、阅读心得，或下一次要翻到的页码…">${escapeHtml(book.notes||'')}</textarea><span class="admin-field-help">阅读笔记仅管理员登录后可查看。</span></label>${ebookEditorHtml(book.ebookLinks)}<div class="admin-attachment"><div>${icon('book')}<span><strong>我的电子书文件</strong><small id="admin-file-name">${escapeHtml(book.fileName||'还没有上传文件')}</small></span></div><label class="admin-upload-label">${icon('upload')}${book.fileUrl?'更换电子书':'上传电子书'}<input type="file" name="bookFile" accept=".pdf,.epub,.txt,application/pdf,application/epub+zip,text/plain" class="admin-sr-only"></label></div><p class="admin-field-help">支持 PDF、EPUB、TXT，每个文件最大 50 MB。手机可从文件 App 或下载目录选择。上传文件仅管理员登录后可访问。</p>${book.fileUrl?'<label class="admin-checkbox-label"><input type="checkbox" name="removeFile">移除现有书籍文件关联</label>':''}<label class="admin-checkbox-label admin-featured-checkbox"><input type="checkbox" name="featured" ${book.featured?'checked':''}><span><strong>推荐到首页</strong><small>为这本书添加推荐标记</small></span></label>`;
    showDialog({title:id?'编辑这本书':'收录一本新书',subtitle:'书籍资料随时可以补充，先把喜欢的书放进来。',body,form:'book',wide:true,submit:id?'保存修改':'收录到书架'});
    const form=state.dialog?.querySelector('[data-form="book"]');
    if(!form)return;
    const ebooks=mountEbookFinder({form,api});
    const lookupCleanup=mountBookLookup({form,api,categories:state.library.categories,onPick:(record,suggested)=>{
      if(!alive()||!form.isConnected)return;
      for(const name of ['title','author','description','isbn','publisher','publishedDate','sourceUrl']){const field=form.elements.namedItem(name);if(field){const value=String(record[name]||'');field.value=field.maxLength>0?value.slice(0,field.maxLength):value;}}
      form.elements.namedItem('coverUrl').value=record.coverUrl||'';form.elements.namedItem('coverFile').value='';const preview=form.querySelector('#admin-cover-preview');if(preview)preview.innerHTML=bookCover(record);
      form.elements.namedItem('categoryId').value=suggested?.id||'';
      form.querySelector('[name="title"]')?.dispatchEvent(new Event('input',{bubbles:true}));
      ebooks.metadataChanged();
    }});
    state.lookupCleanup=()=>{lookupCleanup();ebooks.destroy();};

  }
  function showCategory(id) {
    const category=state.library.categories.find(category=>category.id===id)||{};
    showDialog({title:id?'编辑分类':'新建一个分类',body:`<input type="hidden" name="id" value="${escapeHtml(id||'')}"><label>分类名称<input name="name" value="${escapeHtml(category.name||'')}" maxlength="80" required autofocus placeholder="例如：文学与小说"></label><label>分类符号<input name="icon" value="${escapeHtml(category.icon||'▤')}" maxlength="16" placeholder="例如：▤ 或 📚"><span class="admin-field-help">可以使用简洁的符号或一个 emoji。</span></label><div class="admin-symbol-options" aria-label="常用分类符号">${['▤','✦','⌘','☼','✿','◈','📚','🎨','💻','🌿'].map(symbol=>`<button type="button" data-action="symbol" data-symbol="${symbol}">${symbol}</button>`).join('')}</div>`,form:'category',submit:id?'保存分类':'创建分类'});
  }
  function showBanner(id) {
    const banner=state.library.banners.find(banner=>banner.id===id)||{};
    showDialog({title:id?'编辑首页推荐':'添加首页推荐',subtitle:'预览图片，再为它加上一个标题或阅读入口。',body:`<input type="hidden" name="id" value="${escapeHtml(id||'')}"><div class="admin-banner-preview" id="admin-banner-preview">${banner.imageUrl?`<img src="${escapeHtml(banner.imageUrl)}" alt="推荐图片预览">`:`<span>${icon('image')}<small>推荐图片预览</small></span>`}</div><label class="admin-upload-label admin-banner-upload">${icon('upload')}上传推荐图片<input type="file" name="bannerFile" accept="image/jpeg,image/png,image/webp,image/gif" class="admin-sr-only"></label><label>推荐标题<input name="title" value="${escapeHtml(banner.title||'')}" maxlength="200" required autofocus placeholder="为这份阅读风景起一个名字"></label><label>图片地址<input name="imageUrl" value="${escapeHtml(banner.imageUrl||'')}" placeholder="填写图片 URL，或使用上方上传按钮"></label><label>关联图书<select name="bookId"><option value="">不关联图书</option>${state.library.books.map(book=>`<option value="${escapeHtml(book.id)}"${banner.bookId===book.id?' selected':''}>${escapeHtml(book.title)}</option>`).join('')}</select></label><label>关联分类<select name="categoryId">${categoryOptions(banner.categoryId,'不关联分类')}</select><span class="admin-field-help">同时选择时，推荐会优先打开关联图书。</span></label>`,form:'banner',wide:true,submit:id?'保存推荐':'添加推荐'});
  }
  function confirmAction(title, description, action, submit='确认删除') {
    showDialog({title,body:`<div class="admin-confirm-icon">${icon('trash')}</div><p class="admin-confirm-text">${description}</p>`,form:'confirm',submit,danger:true});
    state.confirm=action;
  }
  async function upload(file) {
    const data=new FormData(); data.append('file',file);
    return api('/api/uploads',{method:'POST',body:data});
  }
  async function saveBook(form) {
    const data=new FormData(form);
    const id=data.get('id');
    let coverUrl=String(data.get('coverUrl')||'').trim();
    let fileUrl=String(data.get('fileUrl')||'');
    let fileName=String(data.get('fileName')||'');
    const cover=data.get('coverFile'), file=data.get('bookFile');
    if(file?.size>50*1024*1024)throw new Error('电子书文件超过 50 MB，请选择较小的文件。');
    if(file?.size&&!/\.(pdf|epub|txt)$/i.test(file.name))throw new Error('请选择 PDF、EPUB 或 TXT 电子书文件。');
    let ebookLinks;try{ebookLinks=JSON.parse(String(data.get('ebookLinks')||'[]'));}catch{throw new Error('电子版入口无法读取，请重新打开这本书。');}
    if (cover?.size) {const result=await upload(cover);coverUrl=result.url;}
    if (data.has('removeFile')) {fileUrl='';fileName='';}
    if (file?.size) {const result=await upload(file);fileUrl=result.url;fileName=result.name;}
    const payload={title:String(data.get('title')||'').trim(),author:String(data.get('author')||'').trim(),categoryId:String(data.get('categoryId')||''),coverUrl,fileUrl,fileName,ebookLinks,isbn:String(data.get('isbn')||'').trim(),publisher:String(data.get('publisher')||'').trim(),publishedDate:String(data.get('publishedDate')||'').trim(),sourceUrl:String(data.get('sourceUrl')||'').trim(),description:String(data.get('description')||'').trim(),notes:String(data.get('notes')||''),status:String(data.get('status')||'want'),rating:Number(data.get('rating'))||0,featured:data.has('featured')};
    if (!payload.title) throw new Error('请填写书名。');
    await json(id?`/api/books/${encodeURIComponent(id)}`:'/api/books',id?'PUT':'POST',payload);
    await syncLibrary(); render(); notify(id?'图书资料已保存。':'新书已放进书架。');
  }
  async function saveCategory(form) {
    const data=new FormData(form),id=data.get('id');
    const payload={name:String(data.get('name')||'').trim(),icon:String(data.get('icon')||'').trim()||'▤'};
    if(!payload.name)throw new Error('请填写分类名称。');
    await json(id?`/api/categories/${encodeURIComponent(id)}`:'/api/categories',id?'PUT':'POST',payload);
    await syncLibrary();render();notify(id?'分类已更新。':'新分类已创建。');
  }
  async function saveBanner(form) {
    const data=new FormData(form),id=data.get('id');let imageUrl=String(data.get('imageUrl')||'').trim();
    const image=data.get('bannerFile');if(image?.size)imageUrl=(await upload(image)).url;
    if(!imageUrl)throw new Error('请上传推荐图片，或填写图片地址。');
    const payload={title:String(data.get('title')||'').trim(),imageUrl,bookId:String(data.get('bookId')||''),categoryId:String(data.get('categoryId')||'')};
    if(!payload.title)throw new Error('请填写推荐标题。');
    await json(id?`/api/banners/${encodeURIComponent(id)}`:'/api/banners',id?'PUT':'POST',payload);
    await syncLibrary();render();notify(id?'首页推荐已更新。':'首页推荐已添加。');
  }
  async function exportBackup(button) {
    if(button.disabled)return;button.disabled=true;
    try {
      const response=await fetch('/api/backup',{credentials:'same-origin'});
      if(!response.ok) {let message='备份导出失败。';try {message=(await response.json()).error||message;}catch{}throw new Error(message);}
      const blob=await response.blob();const url=URL.createObjectURL(blob);const link=document.createElement('a');link.href=url;link.download=`bookshelf-backup-${new Date().toLocaleDateString('sv-SE')}.json`;document.body.append(link);link.click();link.remove();setTimeout(()=>URL.revokeObjectURL(url),1000);notify('备份文件已导出，请同时保存上传的封面和书籍文件。');
    }catch(error){notify(errorMessage(error),'error');}finally{button.disabled=false;}
  }
  async function prepareRestore(file) {
    if(!file)return;
    if(file.size>20*1024*1024)throw new Error('备份文件过大，请使用 20 MB 以内的 JSON 资料备份。');
    let data;try{data=JSON.parse(await file.text());}catch{throw new Error('无法读取这份备份。请选择有效的 JSON 文件。');}
    if(!data||!data.settings||typeof data.settings!=='object'||Array.isArray(data.settings)||!Array.isArray(data.books)||!Array.isArray(data.categories)||!Array.isArray(data.banners))throw new Error('备份结构不完整，需要包含 settings、books、categories 和 banners。');
    showDialog({title:'确认恢复这份书架备份？',subtitle:'请核对导入内容。确认后将覆盖当前书架资料。',body:`<div class="admin-restore-summary"><span><strong>${data.books.length}</strong> 本图书</span><span><strong>${data.categories.length}</strong> 个分类</span><span><strong>${data.banners.length}</strong> 张推荐</span></div><p class="admin-confirm-text">将恢复「${escapeHtml(data.settings.title||'我的书架')}」。现有图书资料、分类、推荐、站点设置和阅读笔记将被替换。</p><p class="admin-field-help">JSON 备份不含上传文件。图片和书籍文件须已保存在服务器相应位置。</p><label class="admin-checkbox-label"><input type="checkbox" name="acknowledged" required>我已了解，并确认覆盖现有书架资料</label>`,form:'restore',submit:'确认覆盖并恢复',danger:true});
    state.restore=data;
  }
  function handleIntent() {
    if(!alive()||!state.auth?.authenticated||state.intentHandled)return;
    state.intentHandled=true;
    const params=new URL(window.location.href).searchParams;
    const edit=params.get('edit');
    if(edit){
      if(state.library.books.some(book=>book.id===edit)){state.page='books';render();showBook(edit);}
      else notify('这本书已不在书架中。','error');
      return;
    }
    if(params.get('add')==='1'){state.page='books';render();showBook();return;}
    const returnPath=params.get('return');
    if(returnPath&&returnPath.startsWith('/')&&!returnPath.startsWith('//')&&!returnPath.includes('\\')){
      try {const url=new URL(returnPath,window.location.origin);if(url.origin===window.location.origin&&/^\/(book\/[^/]+)?$/.test(url.pathname))navigate?.(`${url.pathname}${url.search}${url.hash}`);}catch{}
    }
  }
  async function init() {
    renderLoading();
    try {const auth=await api('/api/auth/status');if(!alive())return;state.auth=auth;if(state.auth.authenticated)await syncLibrary();if(!alive())return;render();handleIntent();}
    catch(error){if(!alive())return;root.innerHTML=`<section class="admin-loading"><div class="admin-loading-mark">${icon('shelf')}</div><h1>暂时无法打开工作室</h1><p>${escapeHtml(errorMessage(error))}</p><button class="admin-button admin-primary" data-action="retry">重新连接</button><button class="admin-text-button" data-action="home">返回书架</button></section>`;}
  }
  root.addEventListener('click',async event=>{
    if(!alive())return;
    const button=event.target.closest('[data-action]');if(!button||!root.contains(button))return;
    const action=button.dataset.action,id=button.dataset.id;
    try {
      if(action==='home'){if(typeof navigate==='function')navigate('/');else window.location.href='/';}
      else if(action==='retry')await init();
      else if(action==='page'){state.page=button.dataset.page;render();window.scrollTo({top:0,behavior:'instant'});}
      else if(action==='close-dialog')closeDialog();
      else if(action==='add-book'||action==='edit-book')showBook(id);
      else if(action==='add-category'||action==='edit-category')showCategory(id);
      else if(action==='add-banner'||action==='edit-banner')showBanner(id);
      else if(action==='symbol'){const input=state.dialog?.querySelector('[name="icon"]');if(input){input.value=button.dataset.symbol;input.focus();}}
      else if(action==='reset-filters'){state.search='';state.category='';state.status='';render();}
      else if(action==='export')await exportBackup(button);
      else if(action==='bulk-delete'){
        const ids=[...state.selected];if(!ids.length)return;
        const names=state.library.books.filter(book=>state.selected.has(book.id)).slice(0,3).map(book=>`「${escapeHtml(book.title)}」`).join('、');
        confirmAction(`确认删除所选的 ${ids.length} 本图书？`,`${names}${ids.length>3?'等':''}共 ${ids.length} 本图书的资料和阅读笔记将被删除。删除后无法撤销，建议先导出书架备份。`,async()=>{
          const failures=[];let deleted=0;
          for(let start=0;start<ids.length;start+=3){const results=await Promise.allSettled(ids.slice(start,start+3).map(id=>api(`/api/books/${encodeURIComponent(id)}`,{method:'DELETE'})));results.forEach(result=>{if(result.status==='fulfilled')deleted++;else failures.push(result.reason);});}
          await syncLibrary();render();if(failures.length)notify(`已删除 ${deleted} 本，${failures.length} 本未成功：${errorMessage(failures[0])}`,'error');else notify(`已从书架删除 ${deleted} 本图书。`);
        },`删除 ${ids.length} 本图书`);
      }
      else if(action==='delete-book'){const book=state.library.books.find(book=>book.id===id);confirmAction('从书架移除这本书？',`「${escapeHtml(book?.title)}」的图书资料和阅读笔记将被删除。关联的推荐图片会保留。`,async()=>{await api(`/api/books/${encodeURIComponent(id)}`,{method:'DELETE'});await syncLibrary();render();notify('图书已从书架移除。');});}
      else if(action==='delete-category'){const category=state.library.categories.find(category=>category.id===id);const count=state.library.books.filter(book=>book.categoryId===id).length;confirmAction('删除这个分类？',`分类「${escapeHtml(category?.name)}」将被删除。${count?`其中的 ${count} 本图书会保留，并移到「未分类」。`:'图书收藏不受影响。'}`,async()=>{await api(`/api/categories/${encodeURIComponent(id)}`,{method:'DELETE'});await syncLibrary();render();notify('分类已删除，图书已保留。');});}
      else if(action==='delete-banner'){const banner=state.library.banners.find(banner=>banner.id===id);confirmAction('移除这张首页推荐？',`「${escapeHtml(banner?.title)}」将不再出现在首页轮播中，关联的图书和分类会保留。`,async()=>{await api(`/api/banners/${encodeURIComponent(id)}`,{method:'DELETE'});await syncLibrary();render();notify('首页推荐已移除。');});}
      else if(action==='logout'){
        button.disabled=true;await api('/api/auth/logout',{method:'POST'});if(!alive())return;
        state.auth={configured:true,authenticated:false};
        state.library.books=state.library.books.map(({notes,fileUrl,fileName,...book})=>book);
        onLibraryChange?.(state.library);
        try{await syncLibrary();}finally{renderAuth();}
        notify('已退出管理员登录。');
      }
    }catch(error){button.disabled=false;notify(errorMessage(error),'error');}
  },{signal:abort.signal});
  root.addEventListener('input',event=>{
    if(!alive())return;
    const target=event.target;
    if(target.id==='admin-book-search'){state.search=target.value;const results=el('#admin-book-results');if(results)results.innerHTML=bookResults();}
    if(target.name==='title'&&state.dialog?.querySelector('[data-form="book"]')){const fallback=state.dialog.querySelector('.admin-cover-preview .admin-book-cover:not(:has(img)) span');if(fallback)fallback.textContent=target.value||'新的一本书';}
  },{signal:abort.signal});
  root.addEventListener('change',async event=>{
    if(!alive())return;
    const target=event.target;
    try {
      if(target.id==='admin-category-filter'||target.id==='admin-status-filter'){state[target.id==='admin-category-filter'?'category':'status']=target.value;const results=el('#admin-book-results');if(results)results.innerHTML=bookResults();}
      else if(target.dataset.bookSelect){target.checked?state.selected.add(target.dataset.bookSelect):state.selected.delete(target.dataset.bookSelect);updateSelection();}
      else if(target.id==='admin-select-all'){filteredBooks().forEach(book=>{target.checked?state.selected.add(book.id):state.selected.delete(book.id);});updateSelection();}
      else if(target.name==='coverFile'||target.name==='bannerFile'){
        const file=target.files?.[0];if(!file)return;
        if(!['image/jpeg','image/png','image/webp','image/gif'].includes(file.type)){target.value='';throw new Error('请选择 JPG、PNG、WEBP 或 GIF 图片。');}
        const url=URL.createObjectURL(file);state.objectUrls.push(url);const preview=el(target.name==='coverFile'?'#admin-cover-preview':'#admin-banner-preview');if(preview)preview.innerHTML=`${target.name==='coverFile'?'<div class="admin-book-cover">':''}<img src="${url}" alt="上传图片预览">${target.name==='coverFile'?'</div>':''}`;
      }else if(target.name==='bookFile'){
        const file=target.files?.[0];
        if(file?.size>50*1024*1024){target.value='';throw new Error('电子书文件超过 50 MB，请选择较小的文件。');}
        if(file&&!/\.(pdf|epub|txt)$/i.test(file.name)){target.value='';throw new Error('请选择 PDF、EPUB 或 TXT 电子书文件。');}
        const label=el('#admin-file-name');if(label)label.textContent=file?.name||'还没有上传文件';
        if(file){
          const remove=el('[name="removeFile"]');if(remove)remove.checked=false;
          const title=el('dialog [name="title"]');
          if(title&&!title.value.trim()){title.value=file.name.replace(/\.(pdf|epub|txt)$/i,'').slice(0,200);title.dispatchEvent(new Event('input',{bubbles:true}));}
        }
      }
      else if(target.name==='coverUrl'&&target.value.trim()){const preview=el('#admin-cover-preview');if(preview)preview.innerHTML=`<div class="admin-book-cover"><img src="${escapeHtml(target.value.trim())}" alt="封面预览"></div>`;}
      else if(target.name==='imageUrl'&&target.value.trim()){const preview=el('#admin-banner-preview');if(preview)preview.innerHTML=`<img src="${escapeHtml(target.value.trim())}" alt="推荐图片预览">`;}
      else if(target.id==='admin-restore-file'){await prepareRestore(target.files?.[0]);target.value='';}
    }catch(error){notify(errorMessage(error),'error');}
  },{signal:abort.signal});
  root.addEventListener('submit',event=>{
    if(!alive())return;
    const form=event.target;if(!form.dataset.form)return;event.preventDefault();
    busy(form,async()=>{
      const data=new FormData(form);
      switch(form.dataset.form){
        case 'auth': {
          const password=String(data.get('password')||'');const setup=!state.auth.configured;
          if(setup&&password.length<12)throw new Error('管理员密码至少需要 12 个字符。');
          if(setup&&password!==data.get('confirmPassword'))throw new Error('两次输入的密码不一致。');
          await json(setup?'/api/auth/setup':'/api/auth/login','POST',{password});
          if(!alive())return;state.auth={configured:true,authenticated:true};await syncLibrary();render();notify(setup?'管理员账号已创建，你的书架准备好了。':'欢迎回到书架工作室。');handleIntent();break;
        }
        case 'book':await saveBook(form);break;
        case 'category':await saveCategory(form);break;
        case 'banner':await saveBanner(form);break;
        case 'confirm':{const action=state.confirm;if(action)await action();break;}
        case 'restore':{
          if(!data.has('acknowledged'))throw new Error('请先确认覆盖当前书架资料。');
          if(!state.restore)throw new Error('请重新选择备份文件。');
          await json('/api/restore','POST',state.restore);state.restore=null;await syncLibrary();render();notify('书架备份已恢复。');break;
        }
        case 'settings':{
          await json('/api/settings','PUT',{title:String(data.get('title')||'').trim(),welcome:String(data.get('welcome')||'').trim(),tagline:String(data.get('tagline')||'').trim(),defaultTheme:String(data.get('defaultTheme')||'light'),showAuthors:data.has('showAuthors'),showGallery:data.has('showGallery')});await syncLibrary();render();notify('书架设置已保存。');break;
        }
        case 'password':{
          const password=String(data.get('password')||'');if(password.length<12)throw new Error('新密码至少需要 12 个字符。');if(password!==data.get('confirmPassword'))throw new Error('两次输入的新密码不一致。');await json('/api/auth/password','PUT',{currentPassword:String(data.get('currentPassword')||''),password});form.reset();notify('管理员密码已更新。');break;
        }
      }
    });
  },{signal:abort.signal});
  await init();
  return cleanup;
}
