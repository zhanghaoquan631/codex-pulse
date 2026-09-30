let materialCategory=0,assetSaving=false;
const originalCloseAssetModal=closeAssetModal;
closeAssetModal=function(){if(!assetSaving&&!assetCoverUploadPending)originalCloseAssetModal();};
let activeMaterialBox='all',assetEditId=null,assetEditBase=null,assetInitialFields=null,assetInitialAutoCover='',assetSession=0,assetPreviewGeneration=0,assetPreviewPending=false,assetCoverUploadPending=false,assetPreviewTimer=null,assetAutoCover='';
const boxDialog=document.createElement('dialog');boxDialog.id='boxDialog';boxDialog.className='workspace-dialog';document.body.append(boxDialog);
document.querySelector('#view-materials .material-tabs').insertAdjacentHTML('beforebegin','<div class="box-toolbar"><select id="materialBoxFilter" aria-label="选择素材箱"></select><button class="quiet-button" data-box-new>＋ 新建素材箱</button><button class="quiet-button" data-box-rename>编辑素材箱</button><p>按用途建立素材箱，拖入图片后自动保存。手机可点选图片，整理内容和编辑周刊时可直接复用。</p></div><div id="materialBoxTargets" class="material-box-targets" aria-label="拖入图片到指定素材箱"></div><p id="materialDropStatus" class="material-drop-status" role="status" aria-live="polite"></p>');
document.getElementById('assetTitle').closest('label').insertAdjacentHTML('beforebegin','<label class="field-label">保存到素材箱<select id="assetBox"></select></label><label class="field-label">链接（可选，自动读取预览）<div class="url-row"><input id="assetUrl" placeholder="粘贴网页、抖音或 X 链接"><button class="quiet-button" type="button" id="assetReadLink">读取预览</button></div><small>付费或需登录的页面仅读取可访问的预览，完整内容可在原站打开。</small></label><div class="asset-preview" id="assetLinkPreview" hidden></div>');
document.getElementById('assetFile').closest('label').insertAdjacentHTML('beforebegin','<label class="field-label cover-field">预览封面<input id="assetCover" placeholder="自动读取封面后，可手动换图"><input type="file" id="assetCoverFile" accept="image/png,image/jpeg,image/webp,image/gif" aria-label="从电脑或相册替换素材封面"><small>电脑选择图片，手机可从相册选图。只替换预览封面，保留素材原文件。</small><button type="button" class="quiet-button" id="assetUseOriginal">使用自动读取的封面</button></label>');
const materialBoxName=id=>materialBoxes.find(x=>x.id===id)?.name||'默认素材箱';
function renderMaterialBoxOptions(){
  if(activeMaterialBox!=='all'&&activeMaterialBox!==''&&!materialBoxes.some(x=>x.id===activeMaterialBox))activeMaterialBox='all';
  const options='<option value="">默认素材箱</option>'+materialBoxes.map(x=>`<option value="${escapeHtml(x.id)}">${escapeHtml(x.name)}</option>`).join('');
  const filter=document.getElementById('materialBoxFilter');filter.innerHTML='<option value="all">全部素材箱</option>'+options;filter.value=activeMaterialBox;
  const select=document.getElementById('assetBox'),old=select.value;select.innerHTML=options;select.value=materialBoxes.some(x=>x.id===old)?old:'';
  document.querySelector('[data-box-rename]').disabled=['all',''].includes(activeMaterialBox);
  window.ReusableAssets?.renderBoxes();
}
renderMaterials=function(){
  if(!document.getElementById('materialBoxFilter'))return;
  renderMaterialBoxOptions();const inBox=materialItems.filter(item=>activeMaterialBox==='all'||(item.boxId||'')===activeMaterialBox),groups=[inBox,inBox.filter(x=>x.url),inBox.filter(x=>x.url&&!x.coverUrl)];document.querySelectorAll('#view-materials .material-tabs button').forEach((b,i)=>{b.classList.toggle('is-active',i===materialCategory);b.querySelector('b').textContent=groups[i].length;b.onclick=()=>{materialCategory=i;renderMaterials();};});const visible=groups[materialCategory],grid=document.getElementById('materialsGrid');
  grid.innerHTML=visible.map(item=>{const cover=safeMediaUrl(item.coverUrl)||(item.fileType?.startsWith('image/')?localFileUrl(item.fileUrl):'');return `<article class="material-card ${item.type==='script'?'material-dark':item.type==='quote'?'material-lime':'material-gradient'}" data-material-id="${escapeHtml(item.id)}" tabindex="0"><span class="material-type">${escapeHtml(item.typeLabel||'素材')}</span><div>${cover?`<img class="material-preview-image" src="${escapeHtml(cover)}" alt="${escapeHtml(item.title)}" loading="lazy" referrerpolicy="no-referrer">`:`<div class="material-text-preview"><small>${escapeHtml(item.url?'链接素材':'文字素材')}</small><strong>${escapeHtml(item.title)}</strong><p>${escapeHtml((item.desc||'').slice(0,100))}</p></div>`}</div><div class="material-meta"><strong>${escapeHtml(item.title)}</strong><p>${escapeHtml(materialBoxName(item.boxId))} · ${escapeHtml(item.updated||'已保存')}</p><div>${(item.tags||[]).map(tag=>`<span class="tag tiny">#${escapeHtml(tag)}</span>`).join('')}</div><div class="record-actions"><button class="quiet-button" data-edit-material="${escapeHtml(item.id)}">编辑 / 换封面</button></div></div></article>`;}).join('')+'<article class="material-card add-material-card" data-action="new-material"><div class="add-circle">＋</div><strong>添加一份新素材</strong><p>链接、图片、脚本、模板<br>保存到指定素材箱</p></article>';
  grid.querySelectorAll('[data-material-id]').forEach(card=>{card.onclick=event=>{if(!event.target.closest('button'))openMaterial(materialItems.find(x=>x.id===card.dataset.materialId));};card.onkeydown=event=>{if(event.key==='Enter'&&event.target===card)openMaterial(materialItems.find(x=>x.id===card.dataset.materialId));};});
};
function assetStatus(message=''){const cover=safeMediaUrl(document.getElementById('assetCover').value),preview=document.getElementById('assetLinkPreview');preview.hidden=false;preview.innerHTML=`${cover?`<img src="${escapeHtml(cover)}" alt="素材封面预览" referrerpolicy="no-referrer">`:''}<div><strong>${escapeHtml(document.getElementById('assetTitle').value||'链接 / 图片预览')}</strong><p>${escapeHtml(message||'保存后可在素材箱查看，也可继续替换封面。')}</p></div>`;}
openAssetModal=function(item=null){
  if(assetSaving||assetCoverUploadPending){showToast('素材正在保存或上传，请稍候');return;}
  assetSession++;assetPreviewGeneration++;clearTimeout(assetPreviewTimer);assetPreviewPending=false;assetCoverUploadPending=false;assetEditId=item?.id||null;assetEditBase=item?clone(item):null;assetAutoCover=item?.autoCoverUrl||'';assetInitialAutoCover=assetAutoCover;
  renderMaterialBoxOptions();document.getElementById('assetModalTitle').textContent=item?'编辑素材':'添加素材';
  for(const [id,value] of Object.entries({assetTitle:item?.title||'',assetBody:item?.desc||'',assetUrl:item?.url||'',assetCover:item?.coverUrl||'',assetType:item?.type||'cover',assetTags:(item?.tags||[]).join(' '),assetBox:item?(item.boxId||''):(activeMaterialBox==='all'?'':activeMaterialBox)}))document.getElementById(id).value=value;
  assetInitialFields=readAssetFields();
  document.getElementById('assetFile').value='';document.getElementById('assetCoverFile').value='';document.getElementById('assetReadLink').disabled=false;document.getElementById('assetCoverFile').disabled=false;document.querySelector('[data-action="save-asset"]').disabled=false;
  assetStatus(item?'可以修改信息、所属素材箱或从相册替换封面。':'粘贴链接后自动读取，也可以直接上传图片和文件。');assetModalBackdrop.classList.add('is-open');setTimeout(()=>document.getElementById('assetTitle').focus(),30);
};
async function readAssetLink(){
  const input=document.getElementById('assetUrl'),url=input.value.trim();if(!url)return;
  const session=assetSession,generation=++assetPreviewGeneration,before={title:document.getElementById('assetTitle').value,body:document.getElementById('assetBody').value,cover:document.getElementById('assetCover').value};assetPreviewPending=true;document.getElementById('assetReadLink').disabled=true;assetStatus('正在读取链接的标题、文案与封面…');
  try{const data=await workspaceRequest('/api/preview',{url});if(session!==assetSession||generation!==assetPreviewGeneration||input.value.trim()!==url)return;
    if(document.getElementById('assetTitle').value===before.title&&!before.title)document.getElementById('assetTitle').value=data.title||'';
    if(document.getElementById('assetBody').value===before.body&&!before.body)document.getElementById('assetBody').value=data.description||data.caption||'';
    assetAutoCover=safeMediaUrl(data.coverUrl)||'';if(!before.cover&&document.getElementById('assetCover').value===before.cover)document.getElementById('assetCover').value=assetAutoCover;
    if(data.url)input.value=data.url;assetStatus(data.coverUrl?'已读取预览，可继续替换封面。':'没有取得可访问的封面；可以从相册补充，链接仍可保存。');
  }catch(error){if(session===assetSession&&generation===assetPreviewGeneration)assetStatus(error.message+'。也可以手动填写后保存链接。');}
  finally{if(session===assetSession&&generation===assetPreviewGeneration){assetPreviewPending=false;document.getElementById('assetReadLink').disabled=false;}}
}
document.getElementById('assetUrl').addEventListener('input',()=>{clearTimeout(assetPreviewTimer);assetPreviewGeneration++;assetPreviewPending=false;document.getElementById('assetReadLink').disabled=false;assetAutoCover='';assetPreviewTimer=setTimeout(readAssetLink,600);});
document.getElementById('assetReadLink').onclick=()=>{clearTimeout(assetPreviewTimer);readAssetLink();};
document.getElementById('assetCover').oninput=()=>assetStatus();
document.getElementById('assetUseOriginal').onclick=()=>{if(!assetAutoCover){assetStatus('请先读取链接预览；未取得封面时可上传自己的图片。');return;}document.getElementById('assetCover').value=assetAutoCover;assetStatus('已使用自动读取的封面，请保存素材。');};
document.getElementById('assetCoverFile').onchange=async event=>{const file=event.target.files?.[0];if(!file||assetSaving||assetCoverUploadPending)return;const session=assetSession;clearTimeout(assetPreviewTimer);assetPreviewGeneration++;assetPreviewPending=false;document.getElementById('assetReadLink').disabled=false;const controls=[...assetModalBackdrop.querySelectorAll('input,textarea,select,button')].map(el=>({el,disabled:el.disabled}));assetCoverUploadPending=true;controls.forEach(({el})=>el.disabled=true);assetStatus('正在上传封面…');try{if(!/^image\/(png|jpeg|gif|webp)$/.test(file.type))throw Error('请选择 JPG、PNG、GIF 或 WebP 图片');const uploaded=await uploadFile(file);if(session!==assetSession)return;document.getElementById('assetCover').value=uploaded.url;assetStatus('封面已上传，请保存素材。');}catch(error){if(session===assetSession)assetStatus(error.message);}finally{if(session===assetSession){assetCoverUploadPending=false;controls.forEach(({el,disabled})=>el.disabled=disabled);}}};
function readAssetFields(){return {title:document.getElementById('assetTitle').value.trim(),desc:document.getElementById('assetBody').value,url:safeUrl(document.getElementById('assetUrl').value.trim()),coverUrl:safeMediaUrl(document.getElementById('assetCover').value.trim()),type:document.getElementById('assetType').value,boxId:document.getElementById('assetBox').value,tags:document.getElementById('assetTags').value.split(/[#，,\s]+/).filter(Boolean).slice(0,12)};}
saveAsset=async function(){
  const button=document.querySelector('[data-action="save-asset"]');if(button.disabled)return;if(assetPreviewPending||assetCoverUploadPending){assetStatus('请等待预览或图片上传完成后保存');return;}clearTimeout(assetPreviewTimer);const session=assetSession,old=assetEditBase?clone(assetEditBase):null;
  const title=document.getElementById('assetTitle').value.trim(),rawUrl=document.getElementById('assetUrl').value.trim(),url=safeUrl(rawUrl),coverRaw=document.getElementById('assetCover').value.trim(),coverUrl=safeMediaUrl(coverRaw);if(!title){assetStatus('请填写素材名称');return;}if((rawUrl&&!url)||(coverRaw&&!coverUrl)){assetStatus('请检查链接与封面地址');return;}
  const fields=readAssetFields(),file=document.getElementById('assetFile').files?.[0];const controls=[...assetModalBackdrop.querySelectorAll('input,textarea,select,button')].map(el=>({el,disabled:el.disabled}));assetSaving=true;controls.forEach(({el})=>el.disabled=true);button.textContent='正在保存…';
  try{await readyForAction();const uploaded=file?await uploadFile(file):null;if(session!==assetSession)return;const item={...old,id:old?.id||'asset-'+crypto.randomUUID()};
    for(const [key,value] of Object.entries(fields))if(!old||JSON.stringify(value)!==JSON.stringify(assetInitialFields[key]))item[key]=value;
    if(!old||fields.type!==assetInitialFields.type)item.typeLabel=fields.type==='script'?'短视频脚本':fields.type==='quote'?'图文素材':'封面模板';
    if(!old||assetAutoCover!==assetInitialAutoCover)item.autoCoverUrl=assetAutoCover;
    if(uploaded){Object.assign(item,{fileUrl:uploaded.url,fileName:uploaded.name,fileType:uploaded.type,fileSize:uploaded.size});if(!coverUrl&&uploaded.type?.startsWith('image/'))item.coverUrl=uploaded.url;}
    Object.assign(item,{updated:'刚刚',updatedAt:new Date().toISOString()});
    const result=await workspaceRequest('/api/changes',{changes:[{collection:'materials',base:old,item}]});installWorkspaceState(result);assetSaving=false;if(session===assetSession)closeAssetModal();renderMaterials();showToast('素材已保存到'+materialBoxName(fields.boxId));
  }catch(error){if(session===assetSession)assetStatus(error.message);}
  finally{assetSaving=false;if(session===assetSession){controls.forEach(({el,disabled})=>el.disabled=disabled);button.textContent='保存素材';}}
};
const originalOpenMaterial=openMaterial;
openMaterial=function(item){if(!item)return;originalOpenMaterial(item);const content=detailDrawer.querySelector('.detail-content'),cover=safeMediaUrl(item.coverUrl);if(cover&&!(item.fileType?.startsWith('image/')&&cover===item.fileUrl))content.insertAdjacentHTML('afterbegin',`<img class="material-full-preview" src="${escapeHtml(cover)}" alt="${escapeHtml(item.title)}的预览封面" referrerpolicy="no-referrer">`);const url=safeUrl(item.url);if(url)content.insertAdjacentHTML('afterbegin',`<p><a class="source-url" href="${escapeHtml(url)}" target="_blank" rel="noreferrer">打开原链接 ↗</a></p>`);detailDrawer.querySelector('.detail-action-row').insertAdjacentHTML('afterbegin',`<button class="primary-button" data-edit-material="${escapeHtml(item.id)}">编辑 / 换封面</button>`);};
const materialBoxPurposes={mixed:'综合素材',images:'图片 / 封面',quotes:'名言 / 文案',scripts:'脚本 / 模板'};
function openBoxEditor(rename=false){
  const item=rename?materialBoxes.find(x=>x.id===activeMaterialBox):null;if(rename&&!item)return;
  const base=item?clone(item):null;
  boxDialog.innerHTML=`<form><div class="dialog-title"><h2>${rename?'编辑素材箱':'新建素材箱'}</h2><button type="button" data-close aria-label="关闭">×</button></div><label class="field-label">素材箱名称<input name="boxName" required maxlength="60" value="${escapeHtml(item?.name||'')}" placeholder="例如：视频封面、我的名言、口播脚本"></label><label class="field-label">用途<select name="boxPurpose">${Object.entries(materialBoxPurposes).map(([value,label])=>`<option value="${value}" ${value===(item?.purpose||'mixed')?'selected':''}>${label}</option>`).join('')}</select><small>用途帮助你区分不同素材箱；仍可按创作需要保存图片或文字。</small></label><p role="status"></p><footer><button class="primary-button" type="submit">保存素材箱</button></footer></form>`;
  let busy=false;
  boxDialog.querySelector('[data-close]').onclick=()=>{if(!busy)boxDialog.close();};boxDialog.showModal();
  boxDialog.oncancel=event=>{if(busy)event.preventDefault();};
  boxDialog.querySelector('form').onsubmit=async event=>{
    event.preventDefault();if(busy)return;
    const name=event.target.elements.boxName.value.trim(),purpose=event.target.elements.boxPurpose.value;if(!name)return;
    if(materialBoxes.some(x=>x.id!==base?.id&&x.name===name)){boxDialog.querySelector('[role=status]').textContent='已有同名素材箱，请换个名称。';return;}
    const newItem=base?{...base,name,purpose}:{id:'box-'+crypto.randomUUID(),name,purpose,createdAt:new Date().toISOString()};
    const controls=[...boxDialog.querySelectorAll('input,select,button')];busy=true;controls.forEach(el=>el.disabled=true);
    try{
      const changes=[{collection:'materialBoxes',base,item:newItem}];
      if(window.ReusableAssets)await window.ReusableAssets.commitChanges(changes);
      else{await readyForAction();installWorkspaceState(await workspaceRequest('/api/changes',{changes}));}
      activeMaterialBox=newItem.id;boxDialog.close();renderMaterials();showToast('素材箱已保存');
    }catch(error){boxDialog.querySelector('[role=status]').textContent=error.message;}
    finally{busy=false;controls.forEach(el=>el.disabled=false);}
  };
}
document.getElementById('materialBoxFilter').onchange=event=>{activeMaterialBox=event.target.value;renderMaterials();};
document.querySelector('[data-box-new]').onclick=()=>openBoxEditor();document.querySelector('[data-box-rename]').onclick=()=>openBoxEditor(true);
document.addEventListener('click',event=>{const button=event.target.closest('[data-edit-material]');if(button){closeDetail();openAssetModal(materialItems.find(x=>x.id===button.dataset.editMaterial));}});
document.querySelector('.phone-owner-nav [data-view="settings"]').insertAdjacentHTML('beforebegin','<button data-view="materials"><span>▧</span>素材箱</button>');
renderMaterials();
