/* Reuse saved assets without changing the original material or content record. */
(() => {
  'use strict';
  const purposes={mixed:'综合素材',images:'图片 / 封面',quotes:'名言 / 文案',scripts:'脚本 / 模板'};
  const materialMime='application/x-lingan-material';
  const dialog=document.createElement('dialog');
  dialog.id='reusableAssetsDialog';dialog.className='workspace-dialog reusable-assets-dialog';
  document.body.append(dialog);
  const fileInput=document.createElement('input');
  fileInput.id='materialBulkFiles';fileInput.type='file';fileInput.multiple=true;
  fileInput.accept='image/png,image/jpeg,image/gif,image/webp';fileInput.hidden=true;
  fileInput.setAttribute('aria-label','选择图片并自动保存到素材箱');document.body.append(fileInput);
  let picker=null,fieldCounter=0,uploadBox='',bulkJob=null,bulkBusy=false,externalDropJob=null,externalDropBusy=false,dragged=null,actionQueue=Promise.resolve();
  const duplicate=value=>JSON.parse(JSON.stringify(value));
  const same=(a,b)=>JSON.stringify(a)===JSON.stringify(b);
  const imageFor=item=>safeMediaUrl(item.coverUrl)||(item.fileType?.startsWith('image/')?safeMediaUrl(item.fileUrl):'');
  function textVariants(item,source){
    const fields=source==='content'
      ? [['caption','原文'],['body','我的笔记'],['desc','内容摘要']]
      : [['caption','原文'],['desc',item.type==='script'?'脚本文字':item.type==='quote'?'名言 / 文案':'素材文字'],['body','素材笔记']];
    const seen=new Set(),variants=[];
    for(const [field,label] of fields){
      const text=String(item[field]??'');if(!text.trim()||seen.has(text.trim()))continue;
      seen.add(text.trim());variants.push({field,label,text});
    }
    if(!variants.length&&(item.type==='quote'||item.type==='script')&&String(item.title??'').trim())variants.push({field:'title',label:item.type==='script'?'脚本文字':'名言 / 文案',text:String(item.title)});
    return variants;
  }
  const boxTitle=id=>id?materialBoxes.find(box=>box.id===id)?.name||'未分类素材箱':'默认素材箱';
  const boxExists=id=>!id||materialBoxes.some(box=>box.id===id);
  const sourceRows=(mode=picker?.mode||'image')=>[
    ...materialItems.filter(item=>!item.deletedAt).map(item=>({key:'material:'+item.id,item,box:item.boxId||'',source:'material'})),
    ...contentItems.filter(item=>item.status==='ready'&&!item.deletedAt).map(item=>({key:'content:'+item.id,item,box:'@ready-content',source:'content'}))
  ].flatMap(row=>mode==='text'?textVariants(row.item,row.source).map(variant=>({...row,...variant,key:row.key+':'+variant.field})):[row]);
  function serialize(action){const result=actionQueue.then(action);actionQueue=result.catch(()=>{});return result;}
  async function commitChanges(changes){
    return serialize(async()=>{
      await readyForAction();
      const generation=saveGeneration;
      const operation=saveQueue.then(async()=>{
        const result=await workspaceRequest('/api/changes',{changes});
        if(generation===saveGeneration&&!unsavedChanges)installWorkspaceState(result);
        else{
          // A user save queued during this request owns its snapshot. Only merge
          // fields acknowledged by this action that the user has not changed.
          persistedState=duplicate(result);serverRevision=result.updatedAt;
          for(const change of changes){
            const list=change.collection==='materials'?materialItems:change.collection==='materialBoxes'?materialBoxes:null;
            if(!list)continue;
            const remote=result[change.collection]?.find(item=>item.id===change.item.id);
            if(!remote)continue;
            const local=list.find(item=>item.id===remote.id);
            if(!local){if(!change.base)list.push(duplicate(remote));continue;}
            for(const [key,value] of Object.entries(change.item))
              if(!same(value,change.base?.[key])&&(same(local[key],change.base?.[key])||same(local[key],value)))local[key]=duplicateValue(remote[key]);
          }
          renderMaterials();
        }
        return result;
      });
      saveQueue=operation.catch(()=>{});
      return operation;
    });
  }
  function duplicateValue(value){return value===undefined?undefined:duplicate(value);}
  function dropStatus(message,error=false){
    const status=document.getElementById('materialDropStatus');if(!status)return;
    status.textContent=message;status.classList.toggle('is-error',error);
    if((bulkJob||externalDropJob)&&!bulkBusy&&!externalDropBusy){
      const retry=document.createElement('button');retry.type='button';retry.className='quiet-button';retry.dataset.retryAssets='';retry.textContent='重试保存';status.append(' ',retry);
      const clear=document.createElement('button');clear.type='button';clear.className='quiet-button';clear.dataset.clearAssets='';clear.textContent='结束本次导入';status.append(' ',clear);
    }
  }
  function renderBoxes(){
    const rack=document.getElementById('materialBoxTargets');if(!rack)return;
    const boxes=[{id:'',name:'默认素材箱',purpose:'mixed'},...materialBoxes];
    rack.innerHTML=boxes.map(box=>{
      const count=materialItems.filter(item=>!item.deletedAt&&(item.boxId||'')===box.id).length;
      return `<article class="material-box-target ${activeMaterialBox===box.id?'is-selected':''}" data-drop-box="${escapeHtml(box.id)}" tabindex="0" aria-label="${escapeHtml(box.name)}，可拖入图片或已有素材"><div><strong>${escapeHtml(box.name)}</strong><small>${escapeHtml(purposes[box.purpose]||purposes.mixed)} · ${count} 份</small></div><button type="button" class="quiet-button" data-upload-box="${escapeHtml(box.id)}" ${bulkBusy||externalDropBusy?'disabled':''}>＋ 添加图片</button><p>拖入图片自动保存 · 可拖入已有素材</p></article>`;
    }).join('');
    fileInput.disabled=bulkBusy||externalDropBusy;
    document.querySelectorAll('#materialsGrid [data-material-id]').forEach(card=>{card.draggable=true;card.setAttribute('aria-description','可以拖动到上方素材箱');});
  }
  function validImage(file){return /^image\/(png|jpeg|gif|webp)$/.test(file.type)||(!file.type&&/\.(png|jpe?g|gif|webp)$/i.test(file.name));}
  async function importImages(files,boxId){
    if(bulkBusy||externalDropBusy){showToast('图片正在保存，请稍候');return;}
    if(bulkJob||externalDropJob){showToast('请先重试或结束上一次导入');return;}
    const list=Array.from(files||[]);if(!list.length)return;
    if(!boxExists(boxId)){dropStatus('这个素材箱已不存在，请重新选择。',true);return;}
    if(list.length>20){dropStatus('一次最多添加 20 张图片，请分批拖入。',true);return;}
    const limitMb=typeof fileUploadLimitMb==='number'?fileUploadLimitMb:100;
    const invalid=list.find(file=>!validImage(file)||!file.size||file.size>limitMb*1024*1024);
    if(invalid){dropStatus(`「${invalid.name}」无法添加：请选择不超过 ${limitMb} MB 的 JPG、PNG、GIF 或 WebP 图片。`,true);return;}
    bulkJob={boxId,entries:list.map(file=>({file,id:'asset-'+crypto.randomUUID(),uploaded:null,item:null}))};
    await runBulkJob();
  }
  async function runBulkJob(){
    if(!bulkJob||bulkBusy)return;
    const job=bulkJob;bulkBusy=true;renderBoxes();
    try{
      await readyForAction();
      if(!boxExists(job.boxId))throw Error('目标素材箱已不存在，请结束本次导入并重新选择。');
      for(let i=0;i<job.entries.length;i++){
        const entry=job.entries[i];dropStatus(`正在保存到「${boxTitle(job.boxId)}」：${i+1} / ${job.entries.length}`);
        if(!entry.uploaded)entry.uploaded=await uploadFile(entry.file);
        if(!safeMediaUrl(entry.uploaded.url))throw Error('图片上传没有返回可用地址，请重试。');
        if(!entry.item)entry.item={id:entry.id,title:entry.file.name.replace(/\.[^.]+$/,'')||'图片素材',type:'cover',typeLabel:'图片素材',desc:'',tags:[],boxId:job.boxId,coverUrl:entry.uploaded.url,fileUrl:entry.uploaded.url,fileName:entry.uploaded.name||entry.file.name,fileType:entry.uploaded.type||entry.file.type||'image/'+(/\.jpe?g$/i.test(entry.file.name)?'jpeg':entry.file.name.split('.').pop().toLowerCase()),fileSize:entry.uploaded.size||entry.file.size,updated:'刚刚',updatedAt:new Date().toISOString()};
      }
      // Retain uploaded references and immutable IDs for safe retries even when
      // a response is lost after the server has committed this batch.
      await commitChanges(job.entries.map(entry=>({collection:'materials',base:null,item:entry.item})));
      bulkJob=null;dropStatus(`已将 ${job.entries.length} 张图片保存到「${boxTitle(job.boxId)}」。`);showToast('图片已自动保存到'+boxTitle(job.boxId));
    }catch(error){bulkBusy=false;dropStatus(error.message+'；图片和目标素材箱已保留，可重试。',true);}
    finally{bulkBusy=false;renderBoxes();fileInput.value='';}
  }
  async function moveMaterial(data,boxId){
    if(bulkBusy){showToast('图片正在保存，请稍候再移动素材');return;}
    if(!boxExists(boxId)||!data?.base||data.base.id!==data.id||!materialItems.some(item=>item.id===data.id)){dropStatus('无法识别这份素材，请刷新后重试。',true);return;}
    if((data.base.boxId||'')===boxId)return;
    const base=duplicate(data.base),item={...base,boxId,updatedAt:new Date().toISOString()};
    try{await commitChanges([{collection:'materials',base,item}]);dropStatus(`已将「${item.title}」移入「${boxTitle(boxId)}」。`);showToast('素材已移入'+boxTitle(boxId));}
    catch(error){dropStatus(error.message+'；素材仍保留在原素材箱。',true);}
  }
  function editorToken(field){return field.closest('#issueEditDialog')?issueEditContext:field.closest('#modalBackdrop')?composerSession:null;}
  function editorActive(field){const owner=field.closest('dialog,.modal-backdrop,.newsletter-modal-backdrop');return !owner||owner.tagName==='DIALOG'?(!owner||owner.open):owner.classList.contains('is-open');}
  function closePicker(){const context=picker;picker=null;dialog.close();if(context?.field.isConnected&&editorActive(context.field))context.field.focus();}
  function openPicker(field,mode){
    if(!field?.isConnected||field.disabled||!editorActive(field))return;
    if(field.id==='composerCover'&&document.getElementById('composerCoverFile')?.disabled){showToast('请等待封面上传完成后再选择素材');return;}
    picker={field,mode,token:editorToken(field),selected:null};
    dialog.innerHTML=`<div class="dialog-title"><h2>${mode==='image'?'从素材箱选择封面':'从素材箱选择文字'}</h2><button type="button" class="quiet-button" data-reuse-close aria-label="关闭素材选择">×</button></div><p class="reuse-explanation">选择已保存素材，${mode==='image'?'应用到当前封面。':'可修改下方文字后替换或追加到当前字段。'}</p><div class="reuse-filters"><label>素材箱<select id="reuseBoxFilter"><option value="all">全部素材箱与已整理内容</option><option value="">默认素材箱</option>${materialBoxes.map(box=>`<option value="${escapeHtml(box.id)}">${escapeHtml(box.name)} · ${escapeHtml(purposes[box.purpose]||purposes.mixed)}</option>`).join('')}<option value="@ready-content">已整理内容</option></select></label><label>搜索<input id="reuseSearch" type="search" placeholder="名称、标签或文字"></label></div><div id="reuseResults" class="reuse-results" role="group" aria-label="选择可复用素材"></div><div class="reuse-selection" id="reuseSelection">${mode==='image'?'<img id="reuseSelectedImage" alt="选中的封面" hidden><p id="reuseSelectedName">先选择一张图片。</p>':'<label class="field-label">选用的文字（可编辑）<textarea id="reuseText" rows="5" placeholder="选一份文字素材，也可以在此输入自己的文案"></textarea></label>'}</div><p id="reuseStatus" role="status" aria-live="polite"></p><footer>${mode==='text'?'<button type="button" class="quiet-button" data-reuse-append disabled>追加到现有文字</button>':''}<button type="button" class="primary-button" data-reuse-apply disabled>${mode==='image'?'使用这张封面':'使用这段文字'}</button></footer>`;
    renderPickerResults();if(!dialog.open)dialog.showModal();document.getElementById('reuseSearch').focus();
  }
  function renderPickerResults(){
    if(!picker)return;
    const query=document.getElementById('reuseSearch').value.trim().toLocaleLowerCase(),box=document.getElementById('reuseBoxFilter').value;
    const rows=sourceRows().filter(row=>(picker.mode==='image'?imageFor(row.item):row.text)&&(box==='all'||row.box===box)&&(!query||[row.item.title,picker.mode==='text'?row.text:[row.item.caption,row.item.desc,row.item.body].filter(Boolean).join(' '),...(row.item.tags||[])].join(' ').toLocaleLowerCase().includes(query)));
    const root=document.getElementById('reuseResults');
    root.innerHTML=rows.length?rows.map(row=>`<button type="button" class="reuse-result ${picker.selected===row.key?'is-selected':''}" data-reuse-item="${escapeHtml(row.key)}" aria-pressed="${picker.selected===row.key}">${picker.mode==='image'?`<img src="${escapeHtml(imageFor(row.item))}" alt="" loading="lazy" referrerpolicy="no-referrer">`:`<span class="reuse-text-sample">${escapeHtml(row.text.slice(0,120))}</span>`}<strong>${escapeHtml(row.item.title||'未命名素材')}</strong><small>${escapeHtml(row.source==='content'?'已整理内容':boxTitle(row.box))}${picker.mode==='text'?' · '+escapeHtml(row.label):''}</small></button>`).join(''):'<p class="reuse-empty">没有匹配的'+(picker.mode==='image'?'图片':'文字')+'素材。可换一个素材箱或搜索词，也可关闭后自行编辑。</p>';
  }
  function selectAsset(key){
    const row=sourceRows().find(entry=>entry.key===key);if(!picker||!row)return;
    picker.selected=key;
    if(picker.mode==='image'){
      const img=document.getElementById('reuseSelectedImage');img.src=imageFor(row.item);img.hidden=!img.src;document.getElementById('reuseSelectedName').textContent=row.item.title||'选中的封面';
    }else document.getElementById('reuseText').value=row.text;
    updatePickerActions();renderPickerResults();
  }
  function updatePickerActions(){
    if(!picker)return;
    const hasValue=picker.mode==='image'?Boolean(picker.selected&&imageFor(sourceRows().find(row=>row.key===picker.selected)?.item||{})):Boolean(document.getElementById('reuseText').value.trim());
    dialog.querySelectorAll('[data-reuse-apply],[data-reuse-append]').forEach(button=>button.disabled=!hasValue);
  }
  function applyAsset(append=false){
    if(!picker)return;
    const {field,mode,token}=picker;
    if(!field.isConnected||field.disabled||!editorActive(field)||token!==editorToken(field)){
      document.getElementById('reuseStatus').textContent='原编辑窗口已改变，请关闭选择器后重新选择。';return;
    }
    const value=mode==='image'?imageFor(sourceRows().find(row=>row.key===picker.selected)?.item||{}):document.getElementById('reuseText').value;
    if(!value.trim())return;
    field.value=append&&field.value.trim()?field.value+'\n\n'+value:value;
    if(field.id==='composerCover'){
      // Invalidate pending automatic previews so they cannot replace this choice.
      clearTimeout(previewTimer);previewTimer=null;previewGeneration++;previewPending=false;
      document.querySelector('[data-action="preview-link"]').disabled=false;
      composerPreviewData={...composerPreviewData,title:document.getElementById('composerTitle').value,coverUrl:field.value,coverKind:'manual_image',metadataSource:'manual'};
      renderComposerPreview('已选用素材箱图片，请保存这条内容');
    }
    field.dispatchEvent(new Event('input',{bubbles:true}));field.dispatchEvent(new Event('change',{bubbles:true}));
    closePicker();showToast(mode==='image'?'已选用封面，请保存当前编辑':'文字已填入，可继续编辑并保存');
  }
  function enhanceFields(){
    const imageSelector='#composerCover,[data-weekly-cover]';
    const textSelector='#composerCaption,#composerBody,#editWeeklyIntro,[data-weekly-caption],[data-weekly-body],#newsletterIntro';
    document.querySelectorAll(imageSelector+','+textSelector).forEach(field=>{
      if(field.dataset.reuseEnhanced)return;
      field.dataset.reuseEnhanced='true';if(!field.id)field.id='reuse-editor-field-'+(++fieldCounter);
      const button=document.createElement('button');button.type='button';button.className='quiet-button reuse-field-button';button.dataset.reuseTarget=field.id;button.dataset.reuseMode=field.matches(imageSelector)?'image':'text';
      button.textContent=button.dataset.reuseMode==='image'?'▧ 从素材箱选择封面':'✎ 从素材箱选择文字';field.insertAdjacentElement('afterend',button);
    });
  }
  document.addEventListener('click',event=>{
    const target=event.target.closest?.('button');
    if(target?.hasAttribute('data-reuse-target')){event.preventDefault();openPicker(document.getElementById(target.dataset.reuseTarget),target.dataset.reuseMode);return;}
    if(target?.hasAttribute('data-reuse-close')){closePicker();return;}
    if(target?.hasAttribute('data-reuse-item')){selectAsset(target.dataset.reuseItem);return;}
    if(target?.hasAttribute('data-reuse-apply')){applyAsset();return;}
    if(target?.hasAttribute('data-reuse-append')){applyAsset(true);return;}
    if(target?.hasAttribute('data-upload-box')){if(bulkBusy)return;if(bulkJob||externalDropJob){showToast('请先重试或结束上一次导入');return;}uploadBox=target.dataset.uploadBox;fileInput.value='';fileInput.click();return;}
    if(target?.hasAttribute('data-retry-assets')){if(externalDropJob)runExternalDrop();else runBulkJob();return;}
    if(target?.hasAttribute('data-clear-assets')){if(bulkBusy||externalDropBusy)return;bulkJob=null;externalDropJob=null;dropStatus('本次导入已结束，可以重新选择图片。');return;}
    const box=event.target.closest?.('[data-drop-box]');if(box&&!target){activeMaterialBox=box.dataset.dropBox;materialCategory=0;renderMaterials();}
  });
  document.addEventListener('keydown',event=>{
    if(dialog.open&&event.key==='Escape'){event.preventDefault();event.stopImmediatePropagation();closePicker();return;}
    const box=event.target.closest?.('[data-drop-box]');if(box===event.target&&(event.key==='Enter'||event.key===' ')){event.preventDefault();activeMaterialBox=box.dataset.dropBox;materialCategory=0;renderMaterials();}
  },true);
  dialog.addEventListener('cancel',event=>{event.preventDefault();closePicker();});
  dialog.addEventListener('input',event=>{if(event.target.id==='reuseSearch')renderPickerResults();if(event.target.id==='reuseText')updatePickerActions();});
  dialog.addEventListener('change',event=>{if(event.target.id==='reuseBoxFilter')renderPickerResults();});
  fileInput.addEventListener('change',()=>{const files=Array.from(fileInput.files||[]);importImages(files,uploadBox);});
  document.addEventListener('dragstart',event=>{
    const card=event.target.closest?.('#materialsGrid [data-material-id]');if(!card||!event.dataTransfer)return;
    const item=materialItems.find(entry=>entry.id===card.dataset.materialId);if(!item)return;
    dragged={id:item.id,base:duplicate(item)};event.dataTransfer.setData(materialMime,JSON.stringify(dragged));event.dataTransfer.effectAllowed='move';
  });
  const acceptsDrag=transfer=>transfer&&(window.LinganMaterialDrop.accepts(transfer)||Array.from(transfer.types||[]).includes(materialMime));
  const dropTarget=element=>element.closest?.('[data-drop-box]')||element.closest?.('#materialsGrid');
  document.addEventListener('dragover',event=>{const target=dropTarget(event.target);if(!target||!acceptsDrag(event.dataTransfer))return;event.preventDefault();target.classList.add('is-drag-over');event.dataTransfer.dropEffect=Array.from(event.dataTransfer.types||[]).includes(materialMime)?'move':'copy';});
  document.addEventListener('dragleave',event=>{const target=dropTarget(event.target);if(target&&!target.contains(event.relatedTarget))target.classList.remove('is-drag-over');});
  document.addEventListener('dragend',()=>{dragged=null;document.querySelectorAll('.is-drag-over').forEach(target=>target.classList.remove('is-drag-over'));});
  document.addEventListener('drop',event=>{
    const target=dropTarget(event.target);if(!target||!acceptsDrag(event.dataTransfer))return;
    event.preventDefault();target.classList.remove('is-drag-over');
    const boxId=target.dataset.dropBox??(activeMaterialBox==='all'?'':activeMaterialBox);
    if(Array.from(event.dataTransfer.types||[]).includes(materialMime)){
      let data=dragged;try{data=JSON.parse(event.dataTransfer.getData(materialMime));}catch{}
      dragged=null;moveMaterial(data,boxId);return;
    }
    if(bulkBusy||externalDropBusy||bulkJob||externalDropJob){showToast('请先等待、重试或结束上一次导入');return;}
    externalDropJob=window.LinganMaterialDrop.createJob(window.LinganMaterialDrop.capture(event.dataTransfer,boxId));
    runExternalDrop();
  });
  // Prevent the browser navigating away when a file misses its intended box.
  document.addEventListener('dragover',event=>{if(acceptsDrag(event.dataTransfer))event.preventDefault();});
  document.addEventListener('drop',event=>{if(acceptsDrag(event.dataTransfer))event.preventDefault();});

  async function runExternalDrop(){
    if(!externalDropJob||externalDropBusy||bulkBusy)return;
    const job=externalDropJob;externalDropBusy=true;renderBoxes();
    dropStatus('正在读取图片并保存到「'+boxTitle(job.boxId)+'」…');
    try{
      if(!boxExists(job.boxId))throw Error('目标素材箱已不存在，请重新选择。');
      const result=await job.resolve({maxImageBytes:(typeof fileUploadLimitMb==='number'?fileUploadLimitMb:100)*1024*1024,
        requestRemoteImage:async({url})=>{
          const response=await fetch('/api/material-image',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({url}),credentials:'same-origin'});
          if(!response.ok){let message='微信图片读取失败，请拖动原图或选择图片';try{message=(await response.json()).message||message;}catch{}throw Error(message);}
          const blob=await response.blob();return new File([blob],'微信图片.'+blob.type.split('/')[1],{type:blob.type});
        }});
      if(externalDropJob!==job)return;externalDropJob=null;externalDropBusy=false;
      await importImages(result.files,result.boxId);
    }catch(error){externalDropBusy=false;dropStatus(error.message+'；目标素材箱已保留。重试，或先点「结束本次导入」再选择原图。',true);}
    finally{externalDropBusy=false;renderBoxes();}
  }
  const observer=new MutationObserver(records=>{
    if(records.some(record=>record.addedNodes.length)){enhanceFields();const grid=document.getElementById('materialsGrid');if(records.some(record=>record.target===grid))grid.querySelectorAll('[data-material-id]').forEach(card=>card.draggable=true);}
  });
  observer.observe(document.body,{childList:true,subtree:true});
  window.ReusableAssets={renderBoxes,commitChanges};
  enhanceFields();renderBoxes();
})();
