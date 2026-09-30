(() => {
  'use strict';
  const $=id=>document.getElementById(id),MAX=25*1024*1024;
  $('composerSource').insertAdjacentHTML('beforeend','<option value="jianying">剪映成品</option>');
  let selected=null,previewUrl='',busy=false,refreshing=false;
  const note=(text,error=false)=>{$('jyStatus').textContent=text;$('jyStatus').classList.toggle('jy-error',error);};
  const valid=file=>file&&file.size>0&&file.size<=MAX&&/\.(mp4|webm)$/i.test(file.name);
  function select(file){
    if(!valid(file)){note('请选择不超过 25 MB 的 MP4 或 WebM 视频。',true);return;}
    selected=file;if(previewUrl)URL.revokeObjectURL(previewUrl);previewUrl=URL.createObjectURL(file);
    $('jyPreview').src=previewUrl;$('jyPreview').hidden=false;$('jyDropZone').hidden=true;
    $('jySelectedName').textContent=file.name+' · '+(file.size/1024/1024).toFixed(1)+' MB';$('jySend').disabled=false;
    note('素材准备好了。发送后，在剪映中点击“导入”选择这个视频。');
  }
  async function api(path,payload){const response=await fetch(path,payload===undefined?{}:{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(payload)});const result=await response.json();if(!response.ok)throw Error(result.message||'操作未完成');return result;}
  function launch(fileUrl){const id=/^\/api\/files\/([a-f0-9]{32})$/.exec(fileUrl)?.[1];if(!id)throw Error('视频地址不正确');location.href='lingan-jianying://import/'+id;}
  async function upload(file,kind){
    if(busy)return;
    if(!valid(file)){note('请选择不超过 25 MB 的 MP4 或 WebM 视频。',true);return;}
    busy=true;$('jySend').disabled=true;$('jySourceFile').disabled=true;$('jyResultFile').disabled=true;
    try{
      await readyForAction();note(kind==='materials'?'正在保存视频素材…':'正在回传剪映成品…');
      const response=await fetch('/api/jianying/'+kind,{method:'POST',headers:{'Content-Type':'application/octet-stream','X-File-Name':encodeURIComponent(file.name)},body:file});
      const result=await response.json();if(!response.ok)throw Error(result.message||'视频保存失败');
      await refreshWorkspaceState();render();
      if(kind==='materials'){note('素材已保存。正在打开本机剪映与素材文件夹；请在剪映中点击“导入”。');launch(result.file.url);}
      else note(result.duplicate?'该成品已入库，保留现有整理状态。':'成品已进入待处理，原视频保留。');
    }catch(error){note(error.message,true);}finally{busy=false;$('jySend').disabled=!selected;$('jySourceFile').disabled=false;$('jyResultFile').disabled=false;}
  }
  function render(){
    const sources=materialItems.filter(item=>item.fileType?.startsWith('video/')&&localFileUrl(item.fileUrl));
    $('jySources').innerHTML=sources.map(item=>`<div class="jy-file-row"><div><strong>${escapeHtml(item.title)}</strong><small>${escapeHtml(item.fileName||'视频素材')} · ${((item.fileSize||0)/1024/1024).toFixed(1)} MB</small></div><button class="quiet-button" data-ve-file="${item.fileUrl}" data-ve-name="${escapeHtml(item.fileName||'素材.mp4')}">网页剪辑</button><a class="quiet-button" href="lingan-jianying://import/${item.fileUrl.split('/').pop()}">送到剪映</a></div>`).join('')||'<p class="muted">还没有保存视频素材。</p>';
    const results=contentItems.filter(item=>item.source==='jianying'&&localFileUrl(item.videoUrl));
    $('jyResults').innerHTML=results.map(item=>`<article class="jy-result-card"><video src="${item.videoUrl}" controls preload="metadata" aria-label="${escapeHtml(item.title)}"></video><h3>${escapeHtml(item.title)}</h3><p>${item.status==='ready'?'已整理':'待处理'} · ${((item.fileSize||0)/1024/1024).toFixed(1)} MB</p><div class="jy-actions"><button class="quiet-button" data-jy-review="${escapeHtml(item.id)}">查看内容</button><button class="quiet-button" data-ve-file="${item.videoUrl}" data-ve-name="${escapeHtml(item.fileName||'成品.mp4')}">继续剪辑</button><a class="quiet-button" href="${item.videoUrl}" download="${escapeHtml(item.fileName||'剪映成品.mp4')}">下载</a><a class="quiet-button" href="lingan-jianying://import/${item.videoUrl.split('/').pop()}">送到剪映</a></div></article>`).join('')||'<p class="muted">导出的成品会显示在这里，并自动进入灵感收集。</p>';
    $('jyResults').querySelectorAll('[data-jy-review]').forEach(button=>button.onclick=()=>openDetail(button.dataset.jyReview));
  }
  async function refresh(){
    if(refreshing)return;refreshing=true;
    try{await refreshWorkspaceState();render();const result=await api('/api/jianying/devices');
      const devices=result.devices.filter(x=>x.connected&&x.expires_at>Date.now());
      const online=devices.some(x=>Date.now()-x.last_seen<120000);
      $('jyDeviceStatus').textContent=online?'本机助手已连接，等待剪映导出成品。':devices.length?'已授权电脑；助手暂时离线。打开本机剪映可启动助手。':'尚未连接电脑，请先安装助手，再点击连接。';
      $('jyDevices').innerHTML=devices.map(x=>`<div class="jy-device-row"><div>${escapeHtml(x.name)}<small>${Date.now()-x.last_seen<120000?'最近在线':'等待助手上线'} · ${new Date(x.expires_at).toLocaleDateString()} 到期</small></div><button class="quiet-button" data-jy-revoke="${escapeHtml(x.id)}">断开</button></div>`).join('');
      $('jyDevices').querySelectorAll('[data-jy-revoke]').forEach(button=>button.onclick=async()=>{button.disabled=true;try{await api('/api/jianying/devices/'+button.dataset.jyRevoke+'/revoke',{});await refresh();}catch(error){note(error.message,true);button.disabled=false;}});
    }catch(error){$('jyDeviceStatus').textContent=error.message;}finally{refreshing=false;}
  }
  $('jySourceFile').onchange=event=>select(event.target.files[0]);
  $('jyResultFile').onchange=event=>{const file=event.target.files[0];if(file)upload(file,'returns');event.target.value='';};
  $('jySend').onclick=()=>{if(selected)upload(selected,'materials');};
  const drop=$('jyDropZone');drop.onclick=()=>$('jySourceFile').click();drop.onkeydown=event=>{if(event.key==='Enter'||event.key===' '){event.preventDefault();$('jySourceFile').click();}};
  drop.ondragover=event=>{event.preventDefault();drop.classList.add('is-dragging');};drop.ondragleave=()=>drop.classList.remove('is-dragging');drop.ondrop=event=>{event.preventDefault();drop.classList.remove('is-dragging');select(event.dataTransfer.files[0]);};
  $('jyConnect').onclick=async()=>{const button=$('jyConnect');button.disabled=true;try{const result=await api('/api/jianying/connect',{name:'我的剪映电脑'});const link=$('jyPairLaunch');link.href='lingan-jianying://pair/'+result.code;link.hidden=false;$('jyDeviceStatus').textContent='点击完成连接，允许浏览器打开本机助手。连接码五分钟有效。';setTimeout(()=>{link.hidden=true;link.removeAttribute('href');},5*60000);}catch(error){$('jyDeviceStatus').textContent=error.message;}finally{button.disabled=false;}};
  $('jyRefresh').onclick=refresh;
  document.addEventListener('click',event=>{if(event.target.closest('[data-view="jianying"]'))setTimeout(refresh,100);});
  setInterval(()=>{if($('view-jianying').classList.contains('is-visible')&&!busy)refresh();},15000);
  document.addEventListener('visibilitychange',()=>{if(document.hidden)$('jyPreview').pause();});
  window.LinganJianying={refresh,render};render();
  if(new URLSearchParams(location.search).get('view')==='jianying')refresh();
})();
