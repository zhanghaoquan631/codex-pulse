const escapeHtml = value => String(value ?? '').replace(/[&<>"']/g, char => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[char]));
const kinds = {
  download: {label:'公开下载', action:'打开下载入口', note:'来源提供的电子书文件'},
  read: {label:'在线阅读', action:'打开阅读入口', note:'在来源网站阅读'},
  borrow: {label:'借阅', action:'前往借阅', note:'可能需要登录来源网站并办理借阅'},
  preview: {label:'预览', action:'查看预览', note:'只提供部分内容'},
  buy: {label:'购买', action:'查看电子版', note:'在来源网站查看价格与版本'},
};
const sourceLabels = {openlibrary:'Open Library',google:'Google Books',gutenberg:'Project Gutenberg',internetarchive:'Internet Archive'};
const languages = {zh:'中文',chi:'中文',zho:'中文',en:'英文',eng:'英文',fr:'法文',fra:'法文',fre:'法文',de:'德文',ger:'德文',deu:'德文',ja:'日文',jpn:'日文'};
const safeUrl = value => {try {const url = new URL(value);return ['https:','http:'].includes(url.protocol)?url.href:'';} catch {return '';}};
const validLinks = value => (Array.isArray(value)?value:[]).filter(link => link && Object.hasOwn(kinds,link.kind) && safeUrl(link.url)).slice(0,12);
const linkKey = link => `${link.kind}:${safeUrl(link.url)}`;
const sourceName = link => sourceLabels[link.source] || link.source || '电子版来源';
function linkInfo(link) {
  const kind = kinds[link.kind];
  return `<span class="ebook-kind ebook-kind-${link.kind}">${kind.label}</span><strong>${escapeHtml(link.title || link.label || sourceName(link))}</strong><small>${escapeHtml([link.author,sourceName(link),link.format,languages[link.language] || link.language].filter(Boolean).join(' · '))}</small><p>${escapeHtml([link.label,link.note || kind.note].filter(Boolean).join(' · '))}</p>`;
}

export function ebookEditorHtml(links=[]) {
  return `<section class="admin-ebook-finder" aria-label="对应电子版"><input type="hidden" name="ebookLinks" value="${escapeHtml(JSON.stringify(validLinks(links)))}"><div class="admin-ebook-heading"><div><strong>对应电子版</strong><p>按当前书名、作者或 ISBN 查找阅读与下载入口</p></div><button type="button" class="admin-button admin-secondary" data-ebook-search>查找电子版</button></div><p class="admin-field-help">找到后选择「附加到这本书」，保存时一并收录。也可在下方上传自己的 PDF、EPUB 或 TXT 文件。</p><div data-ebook-status role="status" aria-live="polite"></div><div data-ebook-results></div><div class="admin-ebook-selected"><h3>已附加的电子版</h3><div data-ebook-selected></div></div></section>`;
}

export function ebookDetailHtml(links=[]) {
  const entries = validLinks(links);
  if (!entries.length) return '';
  return `<section class="paper-section ebook-section"><h2>对应电子版</h2><div class="ebook-links">${entries.map(link=>`<article class="ebook-link">${linkInfo(link)}<a class="btn" href="${escapeHtml(safeUrl(link.url))}" target="_blank" rel="noopener noreferrer">${kinds[link.kind].action} ↗</a></article>`).join('')}</div></section>`;
}

export function mountEbookFinder({form, api}) {
  const host = form.querySelector('.admin-ebook-finder');
  if (!host) return {destroy() {}, metadataChanged() {}};
  const search = host.querySelector('[data-ebook-search]');
  const results = host.querySelector('[data-ebook-results]');
  const selected = host.querySelector('[data-ebook-selected]');
  const status = host.querySelector('[data-ebook-status]');
  const input = form.elements.namedItem('ebookLinks');
  const events = new AbortController();
  let stopped = false, version = 0, requestController, candidates = [], links = [];
  try {links = validLinks(JSON.parse(input.value));} catch {}
  const valid = () => !stopped && form.isConnected;
  const message = (text, kind='') => {status.innerHTML=text?`<p class="admin-lookup-message ${kind}">${escapeHtml(text)}</p>`:'';};
  const renderSelected = () => {
    input.value = JSON.stringify(links);
    selected.innerHTML = links.length?links.map((link,index)=>`<article class="admin-ebook-link is-selected"><div class="admin-ebook-info">${linkInfo(link)}</div><div class="admin-ebook-actions"><a href="${escapeHtml(safeUrl(link.url))}" target="_blank" rel="noopener noreferrer">${kinds[link.kind].action} ↗</a><button type="button" class="admin-text-button admin-danger-text" data-ebook-remove="${index}" aria-label="移除${escapeHtml(link.title || link.label || sourceName(link))}电子版入口">移除</button></div></article>`).join(''):'<p class="admin-field-help">还没有附加电子版入口。</p>';
    for (const button of results.querySelectorAll('[data-ebook-add]')) {
      const link = candidates[Number(button.dataset.ebookAdd)];
      const exists = link && links.some(item=>linkKey(item)===linkKey(link));
      button.disabled = Boolean(exists);
      button.textContent = exists?'已附加':'附加到这本书';
    }
  };
  const stopRequest = () => {version++;requestController?.abort();requestController=null;search.disabled=false;search.textContent='查找电子版';};
  const run = async () => {
    if (form.dataset.busy==='true') return;
    const field = name=>String(form.elements.namedItem(name)?.value || '').trim();
    const title = field('title'), isbn = field('isbn'), author = field('author');
    if (!isbn && title.length<2) {message('先选择查书结果，或填写书名，再查找电子版。','is-error');form.elements.namedItem('title')?.focus();return;}
    stopRequest();const request = version;
    requestController = new AbortController();
    search.disabled=true;search.textContent='正在查找…';results.innerHTML='';candidates=[];
    message('正在查找与这本书对应的电子版…');
    try {
      const params = new URLSearchParams({title,author,isbn});
      const data = await api(`/api/ebooks?${params}`, {signal:requestController.signal});
      if (!valid() || request!==version) return;
      candidates = validLinks(data.links || data.results);
      const warnings = Array.isArray(data.warnings)?data.warnings:[];
      message(candidates.length?`找到 ${candidates.length} 个电子版入口，请核对书名、作者和语言。${warnings.length?' 部分来源暂时无法查询。':''}`:warnings.length?'暂时没有查到可用电子版，部分来源查询失败，请稍后再试或上传自己的文件。':'暂未找到可用电子版。可以在下方上传自己的文件。');
      results.innerHTML=candidates.length?`<div class="admin-ebook-results">${candidates.map((link,index)=>`<article class="admin-ebook-link"><div class="admin-ebook-info">${linkInfo(link)}</div><div class="admin-ebook-actions"><a href="${escapeHtml(safeUrl(link.url))}" target="_blank" rel="noopener noreferrer">${kinds[link.kind].action} ↗</a><button type="button" class="admin-button admin-secondary" data-ebook-add="${index}">附加到这本书</button></div></article>`).join('')}</div>`:'';
      renderSelected();
    } catch (error) {if(valid()&&request===version&&error.name!=='AbortError')message(error.message || '暂时无法查找电子版，请稍后再试。','is-error');}
    finally {if(valid()&&request===version){search.disabled=false;search.textContent='查找电子版';}}
  };
  search.addEventListener('click', run, {signal:events.signal});
  host.addEventListener('click', event=>{
    if (!valid() || form.dataset.busy==='true') return;
    const add=event.target.closest('[data-ebook-add]'), remove=event.target.closest('[data-ebook-remove]');
    if (add) {
      const link=candidates[Number(add.dataset.ebookAdd)];if(!link)return;
      if(links.length>=12){message('每本书最多附加 12 个电子版入口，可先移除不需要的入口。','is-error');return;}
      if (!links.some(item=>linkKey(item)===linkKey(link))) links.push({...link});
      renderSelected();message('电子版入口已附加，保存图书后生效。','is-success');
    } else if (remove) {links.splice(Number(remove.dataset.ebookRemove),1);renderSelected();message('已移除这个电子版入口，保存图书后生效。');}
  }, {signal:events.signal});
  const metadataChanged = () => {if(!valid())return;stopRequest();candidates=[];results.innerHTML='';message(links.length?'已附加的电子版入口已保留，请核对是否对应新的书籍资料。':'书籍资料已带入，可以继续查找电子版。');};
  for(const name of ['title','author','isbn'])form.elements.namedItem(name)?.addEventListener('change',metadataChanged,{signal:events.signal});
  renderSelected();
  return {metadataChanged,destroy(){stopped=true;stopRequest();events.abort();}};
}
