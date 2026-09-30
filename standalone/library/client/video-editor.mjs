import {inspect,dimensions,paint,renderMovie} from './video-render.mjs';
import {fileHash} from './live-hash.mjs';
const $=id=>document.getElementById(id),video=$('veVideo'),canvas=$('veCanvas');
let clips=[],selected=0,playing=false,busy=false,importing=false,previewClip='',current=0,seekVersion=0,controller,lastExport=null,exportUrl='',draftTimer;
const settings=()=>({ratio:$('veRatio').value,resolution:$('veResolution').value,fit:$('veFit').value,format:$('veFormat').value});
const total=()=>clips.reduce((n,x)=>n+x.end-x.start,0),duration=x=>x.end-x.start;
const time=n=>`${Math.floor(n/60).toString().padStart(2,'0')}:${(n%60).toFixed(2).padStart(5,'0')}`;
const note=(message,error=false)=>{$('veStatus').textContent=message;$('veStatus').classList.toggle('jy-error',error);};
const esc=text=>String(text).replace(/[&<>"']/g,x=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[x]));
function locate(t){let offset=0;for(let i=0;i<clips.length;i++){if(t<offset+duration(clips[i])-1e-7||i===clips.length-1)return {clip:clips[i],index:i,offset,local:Math.min(duration(clips[i]),Math.max(0,t-offset))};offset+=duration(clips[i]);}}
function invalidate(){if(lastExport){lastExport.cleanup();lastExport=null;}if(exportUrl)URL.revokeObjectURL(exportUrl);exportUrl='';$('veDownload').hidden=true;$('veRetry').hidden=true;}
function changed(syncFields=true){invalidate();scheduleDraft();renderList(syncFields);draw();}
async function draftDB(){return new Promise((resolve,reject)=>{const r=indexedDB.open('lingan-web-editor',1);r.onupgradeneeded=()=>r.result.createObjectStore('draft');r.onsuccess=()=>resolve(r.result);r.onerror=()=>reject(r.error);});}
function scheduleDraft(){clearTimeout(draftTimer);draftTimer=setTimeout(async()=>{try{const db=await draftDB();const value={clips:clips.map(({url,...x})=>x),settings:settings(),title:$('veTitle').value};await new Promise((resolve,reject)=>{const tx=db.transaction('draft','readwrite');tx.objectStore('draft').put(value,'current');tx.oncomplete=resolve;tx.onerror=()=>reject(tx.error);});db.close();$('veDraftStatus').textContent='草稿已保存在此浏览器';}catch{$('veDraftStatus').textContent='浏览器草稿空间不足，请保持页面打开直到保存成品。';}},500);}
async function restore(){try{const db=await draftDB(),value=await new Promise((resolve,reject)=>{const r=db.transaction('draft').objectStore('draft').get('current');r.onsuccess=()=>resolve(r.result);r.onerror=()=>reject(r.error);});db.close();if(!value?.clips?.length)return;clips=value.clips.map(x=>({...x,url:URL.createObjectURL(x.file)}));for(const [key,id]of [['ratio','veRatio'],['resolution','veResolution'],['fit','veFit'],['format','veFormat']])if(value.settings?.[key])$(id).value=value.settings[key];$('veTitle').value=value.title||'';$('veDraftStatus').textContent='已恢复此浏览器里的剪辑草稿';renderList();await seek(0);note('草稿已恢复，可继续编辑或保存成品。');}catch{}}
function renderList(syncFields=true){
  const list=$('veClips');list.replaceChildren();let offset=0;
  clips.forEach((clip,index)=>{const row=document.createElement('div');row.className='ve-clip'+(index===selected?' is-selected':'');
    row.innerHTML=`<button class="ve-clip-select" aria-pressed="${index===selected}"><span class="ve-clip-number">${String(index+1).padStart(2,'0')}</span><span><strong>${esc(clip.file.name)}</strong><small>${time(clip.start)} → ${time(clip.end)} · ${duration(clip).toFixed(2)} 秒${clip.volume===0?' · 静音':''}</small></span></button><div class="ve-clip-actions"><button aria-label="上移片段 ${index+1}" ${index===0?'disabled':''}>↑</button><button aria-label="下移片段 ${index+1}" ${index===clips.length-1?'disabled':''}>↓</button><button aria-label="删除片段 ${index+1}">×</button></div>`;
    const at=offset;row.querySelector('.ve-clip-select').onclick=()=>{if(busy)return;pause();selected=index;renderList();seek(at);};
    const [up,down,remove]=row.querySelectorAll('.ve-clip-actions button');const move=step=>{if(busy)return;pause();[clips[index],clips[index+step]]=[clips[index+step],clips[index]];selected=index+step;changed();seek(0);};up.onclick=()=>move(-1);down.onclick=()=>move(1);remove.onclick=()=>{if(busy)return;pause();clips.splice(index,1);selected=Math.min(selected,clips.length-1);changed();seek(0);};list.append(row);offset+=duration(clip);
  });
  const clip=clips[selected];$('veEmpty').hidden=Boolean(clips.length);$('veEditTools').hidden=!clip;$('vePreviewTools').hidden=!clips.length;$('vePlay').disabled=busy||!clips.length;$('veExport').disabled=busy||importing||!clips.length;
  $('veTotal').textContent=clips.length?`${clips.length} 个片段 · ${time(total())}`:'选择视频开始剪辑';$('veSeek').max=total();$('veSeek').value=current;$('veClock').textContent=`${time(current)} / ${time(total())}`;
  if(clip&&syncFields){$('veStart').value=clip.start.toFixed(2);$('veEnd').value=clip.end.toFixed(2);$('veStart').max=clip.end-.05;$('veEnd').max=clip.duration;$('veVolume').value=clip.volume;$('veVolumeLabel').textContent=clip.volume+'%';$('veText').value=clip.text;$('veTextColor').value=clip.textColor;$('veTextPosition').value=clip.textPosition;$('veTextSize').value=clip.textSize;$('veClipName').textContent=`片段 ${selected+1} · ${clip.file.name}`;}
}
function draw(){if(!clips.length){canvas.getContext('2d').clearRect(0,0,canvas.width,canvas.height);return;}const item=locate(current),size=dimensions(clips[0],settings().ratio,settings().resolution);if(canvas.width!==size.width||canvas.height!==size.height)Object.assign(canvas,size);paint(canvas,video,item.clip,settings());}
function validTrim(){const clip=clips[selected];if(!clip)return true;const a=Number($('veStart').value),b=Number($('veEnd').value);return $('veStart').value!==''&&$('veEnd').value!==''&&Number.isFinite(a)&&Number.isFinite(b)&&a>=0&&b<=clip.duration+.00001&&b-a>=.05;}
function pause(){playing=false;video.pause();$('vePlay').textContent='▶ 播放';}
async function seek(t,continuePlaying=false){
  const version=++seekVersion;current=Math.max(0,Math.min(total(),t));const item=locate(current);if(!item){pause();previewClip='';video.removeAttribute('src');draw();return;}
  const {clip,local}=item;
  try{if(previewClip!==clip.url){video.pause();previewClip=clip.url;await new Promise((resolve,reject)=>{video.addEventListener('loadedmetadata',resolve,{once:true});video.addEventListener('error',()=>reject(Error('预览无法播放，请选择 MP4 或 WebM 视频。')),{once:true});video.src=clip.url;});}
    if(version!==seekVersion)return;video.volume=clip.volume/100;const target=clip.origin+clip.start+local;
    video.onseeked=()=>{if(version===seekVersion)draw();};video.onloadeddata=()=>{if(version===seekVersion)draw();};
    if(Math.abs(video.currentTime-target)<.002&&!video.seeking&&video.readyState>=2)draw();else video.currentTime=target;
    $('veSeek').value=current;$('veClock').textContent=`${time(current)} / ${time(total())}`;
    if(continuePlaying&&version===seekVersion){await video.play();playing=true;$('vePlay').textContent='❚❚ 暂停';requestAnimationFrame(tick);}
  }catch(error){pause();note(error.message,true);}
}
function tick(){if(!playing)return;const item=locate(current);if(!item){pause();return;}
  current=item.offset+Math.max(0,video.currentTime-item.clip.origin-item.clip.start);
  if(video.currentTime>=item.clip.origin+item.clip.end-.015||video.ended){if(item.index<clips.length-1){current=item.offset+duration(item.clip)+.00001;seek(current,true);return;}current=total();pause();}
  draw();$('veSeek').value=current;$('veClock').textContent=`${time(current)} / ${time(total())}`;if(playing)requestAnimationFrame(tick);
}
async function add(files){if(busy||importing)return;importing=true;$('veAdd').disabled=true;renderList();pause();let errors=[];
  try{for(const file of files){if(!file.size){errors.push(file.name+'：空文件');continue;}note('正在读取 '+file.name+'…');try{const info=await inspect(file);clips.push({...info,file,url:URL.createObjectURL(file),id:crypto.randomUUID(),start:0,end:info.duration,volume:100,text:'',textColor:'#ffffff',textPosition:'bottom',textSize:5});}catch(error){errors.push(file.name+'：'+error.message);}}selected=Math.max(0,clips.length-1);if(!$('veTitle').value&&clips[0])$('veTitle').value=clips[0].file.name.replace(/\.[^.]+$/,'')+' · 剪辑';changed();await seek(0);note(errors.length?errors.join('；'):'素材已加入。选择片段设置起止时间，或直接播放预览。',Boolean(errors.length));}finally{importing=false;$('veAdd').disabled=false;renderList();}}
async function api(path,payload,method='POST',signal){const response=await fetch(path,{method,headers:{'Content-Type':'application/json'},body:JSON.stringify(payload),signal});const result=await response.json();if(!response.ok)throw Error(result.message||'保存失败');return result;}
async function saveResult(){
  const {blob,ext}=lastExport,name=($('veTitle').value.trim()||'网页剪辑成品').replace(/[\\/:*?"<>|]/g,'_').slice(0,120)+'.'+ext;
  note('正在校验并保存成品…');controller.signal.throwIfAborted();const sha256=await fileHash(blob,p=>{controller.signal.throwIfAborted();$('veProgress').value=80+p*5;});controller.signal.throwIfAborted();
  const info=await api('/api/jianying/uploads',{name,size:blob.size,sha256,title:$('veTitle').value.trim()||'网页剪辑成品'},'POST',controller.signal);
  if(!info.complete)for(let offset=0,part=1;offset<blob.size;offset+=info.chunkSize,part++){
    controller.signal.throwIfAborted();const body=blob.slice(offset,offset+info.chunkSize);let error;
    for(let attempt=0;attempt<3;attempt++){try{const response=await fetch(`/api/jianying/uploads/${info.id}/parts/${part}`,{method:'PUT',body,signal:controller.signal});const result=await response.json();if(!response.ok)throw Error(result.message||'成品上传失败');error=null;break;}catch(e){error=e;if(controller.signal.aborted)throw e;}}
    if(error)throw error;$('veProgress').value=85+Math.min(blob.size,offset+info.chunkSize)/blob.size*14;
  }
  controller.signal.throwIfAborted();$('veCancel').hidden=true;note('正在确认成品入库…');const saved=await api(`/api/jianying/uploads/${info.id}/complete`,{});$('veProgress').value=100;await refreshWorkspaceState();window.LinganJianying?.render();$('veRetry').hidden=true;note(saved.item.deletedAt?'这份成品已在回收站，请先恢复；本次导出仍可下载。':saved.item.status==='ready'?'这份成品已经保存，保留原有整理状态。':'成品已保存，自动进入待处理。也可以在下方播放或下载。');
}
async function run(retry=false){if(busy||!clips.length)return;if(!validTrim()){note('请先修正片段的起止时间。',true);return;}busy=true;controller=new AbortController();pause();$('veCancel').hidden=false;$('veProgress').hidden=false;$('veProgress').value=0;$('veEditor').classList.add('is-busy');renderList();$('veEditor').querySelectorAll('input,select,textarea,button').forEach(x=>{if(x.id!=='veCancel')x.disabled=true;});
  try{await readyForAction();if(!retry||!lastExport){invalidate();note('正在导出视频，请保持页面打开…');lastExport=await renderMovie(clips.map(x=>({...x})),settings(),{signal:controller.signal,onStatus:message=>note(message),onProgress:p=>{$('veProgress').value=p*80;note(`正在导出视频 ${Math.round(p*100)}%…`);}});exportUrl=URL.createObjectURL(lastExport.blob);$('veDownload').href=exportUrl;$('veDownload').download=($('veTitle').value.trim()||'网页剪辑成品')+'.'+lastExport.ext;$('veDownload').hidden=false;}await saveResult();
  }catch(error){const cancelled=controller.signal.aborted;note(cancelled?'已停止，素材和剪辑设置保留。':error.message+'。剪辑设置已保留，可重试。',!cancelled);if(lastExport)$('veRetry').hidden=false;}
  finally{busy=false;$('veCancel').hidden=true;$('veEditor').classList.remove('is-busy');$('veEditor').querySelectorAll('input,select,textarea,button').forEach(x=>x.disabled=false);renderList();}
}
$('veFiles').onchange=e=>{add([...e.target.files]);e.target.value='';};$('veAdd').onclick=()=>$('veFiles').click();$('veEmpty').onclick=()=>$('veFiles').click();$('veEmpty').onkeydown=e=>{if(e.key==='Enter'||e.key===' '){e.preventDefault();$('veFiles').click();}};
const drop=$('veEditor');drop.ondragover=e=>{if(!busy){e.preventDefault();drop.classList.add('is-dragging');}};drop.ondragleave=()=>drop.classList.remove('is-dragging');drop.ondrop=e=>{e.preventDefault();drop.classList.remove('is-dragging');add([...e.dataTransfer.files]);};
$('vePlay').onclick=()=>{if(playing)pause();else seek(current>=total()-.02?0:current,true);};$('veSeek').oninput=e=>{pause();seek(Number(e.target.value));};
for(const id of ['veStart','veEnd'])$(id).oninput=()=>{if(busy)return;const clip=clips[selected],start=Number($('veStart').value),end=Number($('veEnd').value);if(!clip||!Number.isFinite(start)||!Number.isFinite(end)||start<0||end>clip.duration+.00001||end-start<.05){note('起止时间需在原视频范围内，并保留至少 0.05 秒。',true);return;}pause();clip.start=start;clip.end=end;current=0;changed(false);seek(0);};
for(const id of ['veStart','veEnd'])$(id).onblur=()=>{if(!busy&&!validTrim()){renderList();note('起止时间未生效，已恢复到上一次有效设置。',true);}};
for(const [id,key,number]of [['veVolume','volume',true],['veText','text',false],['veTextColor','textColor',false],['veTextPosition','textPosition',false],['veTextSize','textSize',true]])$(id).oninput=()=>{if(busy||!clips[selected])return;clips[selected][key]=number?Number($(id).value):$(id).value;video.volume=locate(current).clip.volume/100;$('veVolumeLabel').textContent=clips[selected].volume+'%';changed(false);};
$('veSplit').onclick=()=>{if(busy)return;const item=locate(current);if(!item||item.local<.05||duration(item.clip)-item.local<.05){note('请把播放位置移到片段中间，再分割。',true);return;}pause();const cut=item.clip.start+item.local,newClip={...item.clip,id:crypto.randomUUID(),start:cut};item.clip.end=cut;clips.splice(item.index+1,0,newClip);selected=item.index+1;changed();note('已在播放位置分成两个片段，可以分别裁剪或删除。');};
for(const id of ['veRatio','veResolution','veFit','veFormat'])$(id).onchange=()=>{if(!busy)changed();};$('veTitle').oninput=()=>{if(!busy)changed();};
$('veExport').onclick=()=>run();$('veRetry').onclick=()=>run(true);$('veCancel').onclick=()=>controller?.abort();
$('veClear').onclick=()=>{if(busy||importing)return;pause();for(const url of new Set(clips.map(x=>x.url)))URL.revokeObjectURL(url);clips=[];selected=0;current=0;$('veTitle').value='';changed();seek(0);note('已清空当前草稿，已保存的成品可以在下方查看。');};
document.addEventListener('click',async e=>{const button=e.target.closest('[data-ve-file]');if(!button||busy||importing)return;const url=button.dataset.veFile;if(!/^\/api\/files\/[a-f0-9]{32}$/.test(url))return;button.disabled=true;try{note('正在读取已保存的视频…');const response=await fetch(url);if(!response.ok)throw Error('视频读取失败');await add([new File([await response.blob()],button.dataset.veName||'素材.mp4')]);$('veEditor').scrollIntoView({behavior:'smooth',block:'start'});}catch(error){note(error.message,true);}finally{button.disabled=false;}});
document.addEventListener('visibilitychange',()=>{if(document.hidden)pause();});document.addEventListener('click',e=>{const nav=e.target.closest('[data-view]');if(nav&&nav.dataset.view!=='jianying')pause();});window.addEventListener('beforeunload',e=>{if(busy){e.preventDefault();e.returnValue='';}});
window.addEventListener('pagehide',()=>{lastExport?.cleanup();});window.LinganVideoEditor={pause};renderList();restore();
