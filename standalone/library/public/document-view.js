let libraryMode=(()=>{try{return localStorage.getItem('lingan-library-mode')||'document';}catch{return 'document';}})();
let documentObserver;
function styledText(text,item={}){const context=[item.caption||item.desc||'',item.body||''].filter((value,index,values)=>value&&values.indexOf(value)===index).join('\n\n');return typeof TextStyling!=='undefined'?TextStyling.render(text,item.textStyle,{title:item.title,tags:item.tags,context}):escapeHtml(text);}
function entryAnchor(item,prefix='entry'){return prefix+'-'+encodeURIComponent(item.id);}
function videoDestination(value){
  try{const u=new URL(value);if(u.protocol!=='https:'||u.username||u.password||u.port)return null;
    if(/^(www\.)?douyin\.com$/.test(u.hostname)){const id=/^\/video\/(\d+)\/?$/.exec(u.pathname)?.[1]||u.searchParams.get('modal_id');if(/^\d+$/.test(id||''))return {platform:'抖音',source:'https://www.douyin.com/video/'+id,embed:'https://open.douyin.com/player/video?vid='+id+'&autoplay=1'};}
    if(/^(www\.|m\.)?bilibili\.com$/.test(u.hostname)){const id=/^\/video\/(BV[A-Za-z0-9]{10}|av\d+)\/?$/.exec(u.pathname)?.[1];if(id)return {platform:'B 站',source:'https://www.bilibili.com/video/'+id,embed:'https://player.bilibili.com/player.html?'+(id.startsWith('BV')?'bvid='+id:'aid='+id.slice(2))+'&autoplay=1&poster=1'};}
  }catch{}return null;
}
function readingMedia(item){
  const savedVideo=localFileUrl(item.videoUrl);
  if(savedVideo)return `<div class="document-media"><video class="jy-saved-video" src="${escapeHtml(savedVideo)}" controls playsinline preload="metadata" aria-label="${escapeHtml(item.title)}"></video><div class="record-actions"><a class="quiet-button" href="${savedVideo}" download="${escapeHtml(item.fileName||'剪映成品.mp4')}">下载成品</a><a class="quiet-button" href="lingan-jianying://import/${savedVideo.split('/').pop()}">送到本机剪映</a></div></div>`;
  const video=videoDestination(item.url), file=localFileUrl(item.fileUrl);
  if(file)return `<div class="document-media">${["video/mp4","video/webm"].includes(item.fileType)?`<video controls playsinline preload="none" src="${escapeHtml(file)}" aria-label="${escapeHtml(item.title)}"></video>`:""}<div class="record-actions"><a class="quiet-button" href="${escapeHtml(file)}" download="${escapeHtml(item.fileName||"回放")}">下载回放</a></div></div>`;
  return `<div class="document-media">${coverMarkup(item,'document-cover')}${video?`<div class="record-actions"><button class="quiet-button" data-play-source="${escapeHtml(video.source)}" aria-label="播放 ${escapeHtml(item.title)}">▶ 页面内播放</button><a class="quiet-button" href="${escapeHtml(video.source)}" target="_blank" rel="noopener noreferrer">到${video.platform}播放 ↗</a></div><p class="muted">如播放器要求登录或无法加载，可直接到原平台播放。</p>`:''}</div>`;
}
function stopDocumentPlayback(root=document){
  root.querySelectorAll('.document-media video').forEach(video=>video.pause());
  root.querySelectorAll('.document-media iframe').forEach(frame=>frame.remove());
  root.querySelectorAll('.document-media .document-cover').forEach(cover=>cover.hidden=false);
  root.querySelectorAll('[data-play-source]').forEach(button=>{button.disabled=false;button.textContent='▶ 页面内播放';});
}
function watchDocument(container){
  if(!container.closest('.view')?.classList.contains('is-visible'))return;
  documentObserver?.disconnect();if(!window.IntersectionObserver)return;
  documentObserver=new IntersectionObserver(entries=>{for(const entry of entries)if(entry.isIntersecting){container.querySelectorAll('.document-outline a').forEach(a=>{const current=a.hash.slice(1)===entry.target.id;a.classList.toggle('is-current',current);if(current)a.setAttribute('aria-current','true');else a.removeAttribute('aria-current');});}},{rootMargin:'-12% 0px -65% 0px'});
  container.querySelectorAll('.document-entry').forEach(el=>documentObserver.observe(el));
}
function documentMarkup(items,{prefix='entry',editable=false,intro='',introStyle,header='',issueId=''}={}){
  return `<div class="document-layout"><details class="document-outline" ${matchMedia('(min-width: 901px)').matches?'open':''}><summary>本页目录 <span>${items.length} 条</span></summary><nav aria-label="内容目录">${items.map((item,i)=>`<a href="#${entryAnchor(item,prefix)}" title="${escapeHtml(item.title)}"><span>${escapeHtml(item.sequence||i+1)}.</span> ${escapeHtml(item.title)}</a>`).join('')}</nav></details><div class="document-body">${header}${intro?`<p class="document-intro">${styledText(intro,{textStyle:introStyle})}</p>`:''}${items.map((item,i)=>`<article class="document-entry" id="${entryAnchor(item,prefix)}" data-entry-id="${escapeHtml(item.id)}"><div class="document-entry-meta"><span>${escapeHtml(item.sourceLabel||'个人记录')}</span>${(item.tags||[]).map(tag=>`<span># ${escapeHtml(tag)}</span>`).join('')}</div><h2><span>${escapeHtml(item.sequence||i+1)}.</span> ${escapeHtml(item.title)}</h2>${editable?`<div class="document-controls"><label class="document-select"><input type="checkbox" data-select="${escapeHtml(item.id)}" ${selectedItems.has(item.id)?'checked':''}> 加入周刊</label>${ratingControls(item)}<label class="sequence-control">序号 <input type="number" min="1" max="999999" value="${Number(item.sequence)||i+1}" data-inline-sequence="${escapeHtml(item.id)}" aria-label="${escapeHtml(item.title)}的序号"></label><button class="quiet-button small" data-inline-edit="${escapeHtml(item.id)}">编辑</button><button class="quiet-button small danger-button" data-delete-content="${escapeHtml(item.id)}">删除</button></div>`:`<p class="rating-row">${stars(item.rating)}</p>${issueId?`<div class="record-actions"><button class="quiet-button small" data-edit-issue-item="${escapeHtml(item.id)}" data-issue-id="${escapeHtml(issueId)}">编辑 / 换封面</button><button class="quiet-button small danger-button" data-remove-issue-item="${escapeHtml(item.id)}" data-issue-id="${escapeHtml(issueId)}">从本期移除</button></div>`:''}`}${safeUrl(item.url)?`<a class="document-source" href="${escapeHtml(safeUrl(item.url))}" target="_blank" rel="noreferrer">${escapeHtml(item.url)} ↗</a>`:''}${item.caption||item.desc?`<p class="document-caption">${styledText(item.caption||item.desc,item)}</p>`:''}${item.coverUrl||localFileUrl(item.videoUrl)||localFileUrl(item.fileUrl)||videoDestination(item.url)?readingMedia(item):''}${item.body&&item.body!==item.caption&&item.body!==item.desc?`<div class="document-notes"><small>我的笔记</small><p>${styledText(item.body,item)}</p></div>`:''}${(item.bullets||[]).length?`<ul class="document-bullets">${item.bullets.map(x=>`<li>${escapeHtml(x)}</li>`).join('')}</ul>`:''}</article>`).join('')}<p class="document-end">已读到本页末尾 · ${items.length} 条内容</p></div></div>`;
}
function renderDocumentLibrary(items){
  libraryGrid.classList.toggle('is-document',libraryMode==='document');
  document.querySelectorAll('[data-library-mode]').forEach(button=>{const active=button.dataset.libraryMode===libraryMode;button.classList.toggle('is-active',active);button.setAttribute('aria-pressed',String(active));});
  if(libraryMode!=='document')return false;
  libraryGrid.innerHTML=items.length?documentMarkup(items,{editable:true}):'<div class="empty-state panel"><strong>这里还没有匹配的内容</strong><p>更换筛选条件，或用手机收集一条新灵感。</p></div>';
  watchDocument(libraryGrid);return true;
}
function renderDocumentIssue(issue){
  const reader=document.getElementById('newsletterReader'),items=[...(issue.items||[])].sort(compareContent);
  const cover=safeMediaUrl(issue.coverUrl||items.find(x=>x.coverUrl)?.coverUrl);
  const header=`<header class="document-issue-head"><p class="eyebrow">MY WEEKLY JOURNAL</p><h1>${escapeHtml(issue.title)}</h1><p>${escapeHtml(issue.date)} · ${items.length} 条内容${typeof LinganPeriodControls!=='undefined'&&LinganPeriodControls.formatRange(issue)?'<br>'+escapeHtml(LinganPeriodControls.formatRange(issue)):''}</p><div class="reader-actions"><button class="quiet-button" data-backup-issue="${escapeHtml(issue.id)}" data-backup-kind="long-image">生成本期长图</button><button class="quiet-button" data-backup-issue="${escapeHtml(issue.id)}" data-backup-kind="issue-backup">备份本期</button><button class="quiet-button" data-edit-issue="${escapeHtml(issue.id)}">编辑本期 / 换封面</button><button class="quiet-button danger-button" data-delete-issue="${escapeHtml(issue.id)}">删除本期</button><button class="primary-button" data-action="copy-share" data-token="${escapeHtml(issue.token)}">复制本期分享链接</button><a class="quiet-button" href="/share/${encodeURIComponent(issue.token)}" target="_blank" rel="noopener">访客阅读页 ↗</a></div>${cover?`<img class="issue-cover" src="${escapeHtml(cover)}" alt="本期封面" referrerpolicy="no-referrer">`:''}</header>`;
  reader.innerHTML=documentMarkup(items,{prefix:'issue',intro:issue.intro,introStyle:issue.textStyle,header,issueId:issue.id});
  watchDocument(reader);
}
function renderSidebarIssues(){
  const target=document.getElementById('sidebarIssues');if(!target)return;
  target.innerHTML=newsletters.length?newsletters.map(issue=>`<button data-open-issue="${escapeHtml(issue.id)}" class="${activeNewsletterId===issue.id?'is-active':''}"><span>▤</span><span>${escapeHtml(issue.title)}<small>${escapeHtml(issue.date)}</small></span></button>`).join(''):'<p>选几条内容，整理成你的第一期周刊。</p>';
}
function syncReadingView(view){
  stopDocumentPlayback();
  document.body.classList.toggle('reading-workspace',['library','newsletters'].includes(view));
  document.querySelectorAll('.phone-owner-nav [data-view]').forEach(b=>b.classList.toggle('is-active',b.dataset.view===view));
  try{localStorage.setItem('lingan-last-view',view);}catch{}
}
document.addEventListener('click',event=>{
  const mode=event.target.closest('[data-library-mode]');if(mode){libraryMode=mode.dataset.libraryMode;try{localStorage.setItem('lingan-library-mode',libraryMode);}catch{}renderLibrary();}
  const edit=event.target.closest('[data-inline-edit]');if(edit){const item=contentItems.find(x=>x.id===edit.dataset.inlineEdit);if(item)openComposer(item);}
  const issue=event.target.closest('[data-open-issue]');if(issue){activeNewsletterId=issue.dataset.openIssue;showView('newsletters');}
  const play=event.target.closest('[data-play-source]');if(play){const video=videoDestination(play.dataset.playSource),scope=play.closest('.document-media');if(!video||!scope)return;stopDocumentPlayback();const frame=document.createElement('iframe');frame.src=video.embed;frame.title=video.platform+'视频播放器';frame.allow='autoplay; fullscreen; encrypted-media';frame.allowFullscreen=true;frame.referrerPolicy='no-referrer';frame.className='document-video'+(video.platform==='B 站'?' landscape-video':'');scope.prepend(frame);const cover=scope.querySelector('.document-cover');if(cover)cover.hidden=true;play.disabled=true;play.textContent='播放器已打开';}
});
document.addEventListener('change',async event=>{
  const input=event.target.closest('[data-inline-sequence]');if(!input)return;
  const item=contentItems.find(x=>x.id===input.dataset.inlineSequence);if(!item)return;
  const value=Number(input.value);if(!Number.isInteger(value)||value<1||value>999999){input.value=item.sequence||1;showToast('序号请输入 1 到 999999 之间的整数');return;}
  item.sequence=value;renderLibrary();try{await persistState();showToast('序号已保存，同星级内容按序号排列');}catch{}
});
