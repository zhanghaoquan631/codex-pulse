let weeklyCoverPending=0;
function weeklyCoverField(item,index){const cover=safeMediaUrl(item.coverUrl||'');return `<div class="field-label cover-field">${index==='main'?'本期封面（留空时使用第一张条目封面）':'条目预览封面'}<input data-weekly-cover="${index}" value="${escapeHtml(item.coverUrl||'')}" placeholder="图片链接或上传图片"><input type="file" data-weekly-cover-file="${index}" accept="image/png,image/jpeg,image/gif,image/webp" aria-label="${index==='main'?'本期':'条目'}从电脑或相册替换封面"><button type="button" class="quiet-button" data-weekly-cover-read="${index}">${index==='main'?'使用条目自动封面':'重新读取原链接封面'}</button><small>先使用自动读取的封面；不合适时可从电脑或手机相册替换。</small><img data-weekly-cover-preview="${index}" src="${escapeHtml(cover)}" alt="封面预览" ${cover?'':'hidden'} referrerpolicy="no-referrer"></div>`;}
function bindWeeklyCovers(){
  const context=issueEditContext;
  function update(index,url){if(issueEditContext!==context||!issueEditDialog.open)return;const input=issueEditDialog.querySelector(`[data-weekly-cover="${index}"]`);input.value=url;const img=issueEditDialog.querySelector(`[data-weekly-cover-preview="${index}"]`);img.src=safeMediaUrl(url)||'';img.hidden=!safeMediaUrl(url);stashIssueEdit();}
  issueEditDialog.querySelectorAll('[data-weekly-cover]').forEach(input=>input.addEventListener('input',()=>update(input.dataset.weeklyCover,input.value)));
  const run=async(button,task)=>{weeklyCoverPending++;button.disabled=true;try{await task();}catch(error){if(issueEditContext===context)issueEditDialog.querySelector('[role=status]').textContent=error.message;}finally{weeklyCoverPending--;button.disabled=false;}};
  issueEditDialog.querySelectorAll('[data-weekly-cover-file]').forEach(input=>input.onchange=()=>run(input,async()=>{const file=input.files?.[0];if(!file)return;if(!/^image\/(jpeg|png|gif|webp)$/.test(file.type))throw Error('请选择 JPG、PNG、GIF 或 WebP 图片');const before=issueEditDialog.querySelector(`[data-weekly-cover="${input.dataset.weeklyCoverFile}"]`).value,result=await uploadFile(file);if(issueEditContext===context&&issueEditDialog.querySelector(`[data-weekly-cover="${input.dataset.weeklyCoverFile}"]`).value===before)update(input.dataset.weeklyCoverFile,result.url);}));
  issueEditDialog.querySelectorAll('[data-weekly-cover-read]').forEach(button=>button.onclick=()=>run(button,async()=>{const index=button.dataset.weeklyCoverRead;if(index==='main'){const first=[...issueEditDialog.querySelectorAll('[data-weekly-cover]')].find(x=>x.dataset.weeklyCover!=='main'&&safeMediaUrl(x.value));update(index,first?.value||'');return;}const item=context.base.items[Number(index)];if(!safeUrl(item?.url))throw Error('这条内容没有可读取的原链接，请从相册上传封面');const input=issueEditDialog.querySelector(`[data-weekly-cover="${index}"]`),before=input.value,result=await workspaceRequest('/api/preview',{url:item.url});if(!result.coverUrl)throw Error('原站没有返回可访问的封面，请从相册上传');if(issueEditContext===context&&input.value===before)update(index,result.coverUrl);}));
}
const issueEditDialog=document.createElement('dialog');issueEditDialog.id='issueEditDialog';issueEditDialog.className='issue-edit-dialog';
document.body.append(issueEditDialog);
let issueEditContext=null,issueEditBusy=false;
const issueEditBase=issue=>({title:issue.title||'',date:issue.date||'',intro:issue.intro||'',coverUrl:issue.coverUrl||'',items:issue.items||[],...LinganPeriodControls.fields(issue),...(typeof TextStyling!=='undefined'&&Object.hasOwn(issue,'textStyle')?{textStyle:issue.textStyle}:{})});
const issueDraftKey=id=>'lingan-weekly-draft-'+id;
function issueEditValues(asDraft=false){
  const root=issueEditDialog,items=issueEditContext.base.items.map((item,i)=>({...item,title:root.querySelector(`[data-weekly-title="${i}"]`).value,caption:root.querySelector(`[data-weekly-caption="${i}"]`).value,body:root.querySelector(`[data-weekly-body="${i}"]`).value,coverUrl:root.querySelector(`[data-weekly-cover="${i}"]`).value,rating:Number(root.querySelector(`[data-weekly-rating="${i}"]`).value),sequence:Number(root.querySelector(`[data-weekly-sequence="${i}"]`).value),...(typeof TextStyling!=='undefined'?{textStyle:TextStyling.readForField(root.querySelector(`[data-weekly-body="${i}"]`))}:{})}));
  return {base:issueEditContext.base,title:root.querySelector('#editWeeklyTitle').value,date:root.querySelector('#editWeeklyDate').value,intro:root.querySelector('#editWeeklyIntro').value,coverUrl:root.querySelector('[data-weekly-cover=main]').value,items,...LinganPeriodControls.read(root,{allowInvalid:asDraft}),...(typeof TextStyling!=='undefined'?{textStyle:TextStyling.readForField(root.querySelector('#editWeeklyIntro'))}:{}),...(asDraft?{periodDraft:LinganPeriodControls.draft(root)}:{})};
}
function stashIssueEdit(){if(!issueEditContext||issueEditBusy)return;try{localStorage.setItem(issueDraftKey(issueEditContext.id),JSON.stringify(issueEditValues(true)));}catch{issueEditDialog.querySelector('[role="status"]').textContent='本机草稿空间不足，请保留页面并保存。';}}
function openIssueEditor(id,discard=false,focusItem=null){
  const issue=newsletters.find(x=>x.id===id);if(!issue)return;
  let draft;try{if(discard)localStorage.removeItem(issueDraftKey(id));else draft=JSON.parse(localStorage.getItem(issueDraftKey(id))||'null');}catch{}
  if(!draft?.base||!Array.isArray(draft.items)||draft.items.length!==draft.base.items?.length)draft=null;
  issueEditContext={id,base:JSON.parse(JSON.stringify(draft?.base||issueEditBase(issue)))};
  const data=draft||issueEditBase(issue);if(!Object.hasOwn(issueEditContext.base,'coverUrl'))issueEditContext.base.coverUrl='';
  issueEditDialog.innerHTML=`<form><div class="dialog-title"><h2>编辑本期周刊</h2><button type="button" data-weekly-close aria-label="关闭周刊编辑">×</button></div><p>修改本期标题、导语和条目，原有阅读链接继续有效。</p><label class="field-label">周刊标题<input id="editWeeklyTitle" required value="${escapeHtml(data.title)}"></label><label class="field-label">日期<input id="editWeeklyDate" required type="date" value="${escapeHtml(data.date)}"></label><label class="field-label">本期导语<textarea id="editWeeklyIntro">${escapeHtml(data.intro)}</textarea></label>${weeklyCoverField(data,'main')}${data.items.map((item,i)=>`<details><summary>${i+1}. ${escapeHtml(item.title)}</summary><label class="field-label">条目标题<input data-weekly-title="${i}" required value="${escapeHtml(item.title)}"></label><label class="field-label">原始文案<textarea data-weekly-caption="${i}">${escapeHtml(item.caption||item.desc||'')}</textarea></label><label class="field-label">我的笔记<textarea data-weekly-body="${i}">${escapeHtml(item.body||'')}</textarea></label>${weeklyCoverField(item,i)}<div class="composer-row"><label class="field-label">星级<select data-weekly-rating="${i}">${[0,1,2,3,4,5].map(n=>`<option value="${n}" ${n===Number(item.rating||0)?'selected':''}>${n?stars(n):'未评分'}</option>`).join('')}</select></label><label class="field-label">序号<input type="number" min="1" max="999999" required data-weekly-sequence="${i}" value="${Number(item.sequence)||i+1}"></label></div></details>`).join('')}<p role="status">${draft?'已恢复此设备的周刊草稿。':'修改会同步到你的其他设备。'}</p><footer><button type="button" class="quiet-button" data-weekly-discard>放弃草稿，读取已保存版本</button><button type="submit" class="primary-button">保存本期</button></footer></form>`;
  const periodHost=document.createElement('div'),rootPeriodLabel=issueEditDialog.querySelector('#editWeeklyDate').closest('.field-label');rootPeriodLabel.firstChild.textContent='发布日期';rootPeriodLabel.after(periodHost);
  LinganPeriodControls.mount(periodHost,{key:'edit-weekly',issue:data,onChange:stashIssueEdit});
  if(typeof TextStyling!=='undefined'){TextStyling.setForField(issueEditDialog.querySelector('#editWeeklyIntro'),data.textStyle);data.items.forEach((item,i)=>TextStyling.setForField(issueEditDialog.querySelector(`[data-weekly-body="${i}"]`),item.textStyle));}
  if(!issueEditDialog.open)issueEditDialog.showModal();
  issueEditDialog.querySelector('[data-weekly-close]').onclick=()=>{stashIssueEdit();issueEditDialog.close();};
  issueEditDialog.querySelector('[data-weekly-discard]').onclick=async()=>{try{const response=await fetch('/api/state');if(!response.ok)throw Error('无法读取已保存版本，请稍后重试');const latest=await response.json();newsletters=latest.newsletters||[];renderNewsletters();openIssueEditor(id,true);}catch(error){issueEditDialog.querySelector('[role="status"]').textContent=error.message;}};
  issueEditDialog.querySelector('form').onsubmit=saveIssueEdit;
  bindWeeklyCovers();
  if(focusItem){const index=data.items.findIndex(x=>x.id===focusItem),field=issueEditDialog.querySelector(`[data-weekly-title="${index}"]`);if(field){field.closest('details').open=true;field.scrollIntoView({block:'center'});field.focus();}}
}
async function saveIssueEdit(event){
  event.preventDefault();if(issueEditBusy)return;if(weeklyCoverPending){issueEditDialog.querySelector('[role=status]').textContent='请等待封面读取或上传完成';return;}stashIssueEdit();
  let payload;try{payload=issueEditValues();}catch(error){issueEditDialog.querySelector('[role="status"]').textContent=error.message;issueEditDialog.querySelector(':invalid')?.reportValidity();return;}
  const id=issueEditContext.id,controls=[...issueEditDialog.querySelectorAll('input,textarea,button,select')];
  issueEditBusy=true;controls.forEach(x=>x.disabled=true);
  try{
    if(!apiEnabled)throw Error('请等待资料库连接后再保存');
    if(unsavedChanges)await persistState();
    const response=await fetch('/api/newsletters/'+encodeURIComponent(id)+'/edit',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(payload)}),result=await response.json();
    if(!response.ok)throw Error(result.message||'周刊保存失败，草稿已保留');
    newsletters=newsletters.map(x=>x.id===id?result.newsletter:x);serverRevision=result.updatedAt;
    if(persistedState)persistedState.newsletters=JSON.parse(JSON.stringify(newsletters));if(queuedState)queuedState.newsletters=JSON.parse(JSON.stringify(newsletters));
    try{localStorage.removeItem(issueDraftKey(id));localStorage.setItem('lingan-newsletters',JSON.stringify(newsletters));}catch{}
    issueEditDialog.close();renderNewsletters();showToast('本期周刊已保存，手机与电脑自动同步');
  }catch(error){issueEditDialog.querySelector('[role="status"]').textContent=error.message;}
  finally{issueEditBusy=false;controls.forEach(x=>x.disabled=false);}
}
issueEditDialog.addEventListener('input',stashIssueEdit);
issueEditDialog.addEventListener('cancel',event=>{if(issueEditBusy)event.preventDefault();else stashIssueEdit();});
document.addEventListener('click',event=>{const button=event.target.closest('[data-edit-issue]');if(button)openIssueEditor(button.dataset.editIssue);});
