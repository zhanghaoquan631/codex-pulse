const escapeHtml=value=>String(value??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const sourceLabels={google:'Google Books',openlibrary:'Open Library'};
const safeUrl=value=>{try{const url=new URL(value);return url.protocol==='https:'||url.protocol==='http:'?escapeHtml(url.href):''}catch{return ''}};

export function suggestCategory(book,categories){
  const subjects=(Array.isArray(book.subjects)?book.subjects:[]).join(' ').toLowerCase();
  const content=`${subjects} ${book.title||''} ${book.description||''}`.toLowerCase();
  const direct=categories.find(c=>c.name.length>1 && subjects.includes(c.name.toLowerCase()));
  if(direct)return direct;
  const rules=[
    [/science fiction|sci-fi|科幻|三体|三體/,['科幻小说','科幻','科学幻想']],
    [/mystery|detective|thriller|推理|悬疑|懸疑|侦探|偵探/,['悬疑推理','推理','悬疑','懸疑']],
    [/artificial intelligence|machine learning|deep learning|人工智能|机器学习|機器學習|深度学习|深度學習/,['人工智能','计算机','電腦','技术']],
    [/computer|programming|software|编程|程式|软件|軟體|计算机|計算機/,['计算机','電腦','技术','科技']],
    [/biography|autobiography|memoir|传记|傳記|自传|自傳/,['人物传记','人物傳記','传记','傳記']],
    [/finance|business|economics|investment|理财|理財|经济|經濟|投资|投資|商业|商業/,['经济理财','投资','財經','经济','商业']],
    [/psychology|心理学|心理學|mental health/,['心理','心理学','心理學']],
    [/philosophy|religion|哲学|哲學|宗教/,['哲学宗教','哲学','哲學','宗教']],
    [/history|历史|歷史/,['历史','歷史']],
    [/painting|photography|fine arts|艺术|藝術|美术|美術|绘画|繪畫|摄影|攝影/,['艺术','藝術','美术','美術']],
    [/self-help|personal development|成长|成長|励志|勵志|habits|习惯|習慣/,['励志成长','成長','自我成长','自我提升']],
    [/education|teaching|study skills|教育|学习|學習/,['教育学习','教育','學習']],
    [/engineering|industry|工业|工業|工程技术|工程技術/,['工业技术','科技','技术']],
    [/cooking|gardening|lifestyle|烹饪|烹飪|园艺|園藝|生活百科/,['生活百科','生活']],
    [/poetry|literature|essays|文学|文學|诗歌|詩歌|散文/,['文学','文學']],
    [/fiction|novel|小说|小說/,['精品小说','小说','小說','文学','文學']],
  ];
  for(const [pattern,names]of rules){if(pattern.test(content)){for(const name of names){const exact=categories.find(c=>c.name===name);if(exact)return exact}const related=categories.find(c=>names.some(n=>c.name.includes(n)));if(related)return related}}
  return null;
}

export function mountBookLookup({form,api,categories,onPick}){
  const host=form.querySelector('.admin-book-lookup');
  if(!host)return()=>{};
  const query=host.querySelector('[data-lookup-query]');
  const search=host.querySelector('[data-lookup-search]');
  const results=host.querySelector('[data-lookup-results]');
  const controller=new AbortController();
  let stopped=false,version=0,candidates=[];
  const valid=()=>!stopped&&form.isConnected;
  const status=(message,kind='')=>{results.innerHTML=`<p class="admin-lookup-message ${kind}" role="status">${escapeHtml(message)}</p>`};
  const run=async()=>{
    const text=query.value.trim();
    if(text.length<2){status('请输入至少两个字，或完整的 ISBN。','is-error');query.focus();return}
    const request=++version;search.disabled=true;search.textContent='正在查书…';candidates=[];
    status('正在查找对应书籍和出版版本…');
    try{
      const data=await api(`/api/lookup?q=${encodeURIComponent(text)}`,{signal:controller.signal});
      if(!valid()||request!==version)return;
      candidates=Array.isArray(data.results)?data.results:[];
      const warnings=Array.isArray(data.warnings)?data.warnings:[];
      if(!candidates.length){status(warnings.length?`暂未找到匹配版本。${warnings.join(' ')}`:'没有找到对应的书。试试完整书名、作者加书名，或 ISBN。');return}
      results.innerHTML=`<div class="admin-lookup-result-heading"><strong>找到 ${candidates.length} 个匹配版本</strong><span>请选择你要收藏的版本</span></div>${warnings.length?`<p class="admin-lookup-warning">${escapeHtml(warnings.join(' '))}</p>`:''}<div class="admin-lookup-list">${candidates.map((book,index)=>{
        const cover=safeUrl(book.coverUrl),source=safeUrl(book.sourceUrl),category=suggestCategory(book,categories);
        return `<article class="admin-lookup-card"><div class="admin-lookup-cover">${cover?`<img src="${cover}" alt="${escapeHtml(book.title)}封面" loading="lazy">`:'<span>暂无封面</span>'}</div><div class="admin-lookup-info"><strong>${escapeHtml(book.title)}</strong><p>${escapeHtml(book.author||'作者资料未提供')}</p><small>${escapeHtml([book.publisher,book.publishedDate,book.isbn?`ISBN ${book.isbn}`:''].filter(Boolean).join(' · '))}</small>${category?`<span class="admin-lookup-category">建议分类：${escapeHtml(category.name)}</span>`:''}<div class="admin-lookup-links">${source?`<a href="${source}" target="_blank" rel="noopener noreferrer">${escapeHtml(sourceLabels[book.source]||book.source||'资料来源')} ↗</a>`:''}</div></div><button type="button" class="admin-button admin-secondary" data-lookup-pick="${index}">使用此版本</button></article>`
      }).join('')}</div>`;
    }catch(error){if(valid()&&request===version&&error.name!=='AbortError')status(error.message||'暂时无法查询，请稍后重试。','is-error')}
    finally{if(valid()&&request===version){search.disabled=false;search.textContent='自动查书'}}
  };
  search.addEventListener('click',run,{signal:controller.signal});
  query.addEventListener('keydown',event=>{if(event.key==='Enter'){event.preventDefault();if(!search.disabled)run()}},{signal:controller.signal});
  results.addEventListener('error',event=>{if(event.target.tagName==='IMG'){event.target.parentElement.innerHTML='<span>暂无封面</span>'}},{capture:true,signal:controller.signal});
  results.addEventListener('click',async event=>{
    const button=event.target.closest('[data-lookup-pick]');if(!button||!valid())return;
    const request=version,book=candidates[Number(button.dataset.lookupPick)];if(!book)return;
    const buttons=[...results.querySelectorAll('button')];buttons.forEach(b=>b.disabled=true);button.textContent='正在带入…';
    let selected=book,detailWarning='';
    try{
      if(!book.description&&book.source&&book.id){try{const detail=await api(`/api/lookup/details?source=${encodeURIComponent(book.source)}&id=${encodeURIComponent(book.id)}${book.editionId?`&editionId=${encodeURIComponent(book.editionId)}`:''}`,{signal:controller.signal});selected={...book,...(detail.result||detail.book||detail)};if(Array.isArray(detail.warnings))detailWarning=detail.warnings.join(' ')}catch(error){if(error.name==='AbortError')return;detailWarning='该版本暂未提供完整简介，可以稍后手动补充。'}}
      if(!valid()||request!==version)return;
      const category=suggestCategory(selected,categories);
      onPick(selected,category);
      status(`已带入「${selected.title}」。${category?`已建议分类「${category.name}」，可继续调整。`:'暂无明确分类，请选择合适分类。'}${selected.description?'':'该资料源没有提供简介，可手动补充。'}${detailWarning}`,'is-success');
    }catch(error){if(valid()&&request===version)status(error.message,'is-error')}
    finally{if(valid()&&request===version){buttons.forEach(b=>b.disabled=false);button.textContent='使用此版本'}}
  },{signal:controller.signal});
  return()=>{stopped=true;version++;controller.abort()};
}
