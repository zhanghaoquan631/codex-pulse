import {LiveCapture,captureSupported,recordingLock} from './live-capture.mjs';
import {createRecordingStore,recordingFileName} from './live-recording-store.mjs';
import {uploadRecordedReplay} from './live-upload.mjs';
import {layouts} from './live-composition.mjs';
import {createLayoutEditor} from './live-layout-editor.mjs';

const el=id=>document.getElementById(id),cards=[...document.querySelectorAll('[data-live-scene]')];
const settings=['Camera','Microphone','Platform','Title','MicEnabled','SystemEnabled','MicVolume','SystemVolume'];
const preferenceKey='lingan-live-recording-options';
const timer=seconds=>{const n=Math.floor(seconds);return `${Math.floor(n/3600)?String(Math.floor(n/3600)).padStart(2,'0')+':':''}${String(Math.floor(n/60)%60).padStart(2,'0')}:${String(n%60).padStart(2,'0')}`;};
const bytes=n=>n>=1024**3?(n/1024**3).toFixed(2)+' GB':(n/1024**2).toFixed(1)+' MB';
let ready=false,controller,store,busy=false,uploadingId=null,uploadRequested=false;
const errors=new Map();
const layoutEditor=createLayoutEditor({onChange:(id,settings)=>{if(controller?.layoutId===id)controller.updateLayout(settings);}});
function preferences(){const result={};for(const name of settings){const node=el('liveRecord'+name);result[name]=node.type==='checkbox'?node.checked:node.value;}return result;}
function savePreferences(){saved=preferences();try{localStorage.setItem(preferenceKey,JSON.stringify(saved));}catch{}}
let saved={};try{const parsed=JSON.parse(localStorage.getItem(preferenceKey)||'{}');if(parsed&&typeof parsed==='object')saved=parsed;}catch{}
for(const name of settings){const node=el('liveRecord'+name);if(saved[name]!==undefined){if(node.type==='checkbox')node.checked=Boolean(saved[name]);else if(name!=='Camera'&&name!=='Microphone')node.value=String(saved[name]);}node.addEventListener('change',savePreferences);}
const badge=document.createElement('button');badge.type='button';badge.className='live-recording-return';badge.hidden=true;
badge.addEventListener('click',()=>document.querySelector('[data-view="live"]')?.click());document.body.append(badge);
function renderState({phase,message,layoutId,systemAudio}){
  layoutEditor.setPhase(phase,layoutId,ready);
  const active=phase!=='idle',recording=['recording','paused'].includes(phase);
  for(const card of cards)card.disabled=active||!ready;
  for(const name of settings.filter(name=>!name.endsWith('Volume')))el('liveRecord'+name).disabled=active;
  el('liveRecordStop').disabled=!['starting','recording','paused'].includes(phase);
  el('liveRecordStop').textContent=phase==='starting'?'取消准备':'停止并保存回放';
  el('liveRecordPause').disabled=!recording;el('liveRecordPause').textContent=phase==='paused'?'继续录制':'暂停';
  el('liveRecordHeading').textContent=active?(layouts[layoutId]?.name+' · '+(phase==='paused'?'已暂停':phase==='recording'?'正在录制':phase==='finishing'?'正在保存':'准备中')):'录制预览';
  el('liveRecordStatus').textContent=message;
  el('liveAudioState').textContent=recording?`麦克风${controller.gains?.microphone?'已连接':'未录制'} · 电脑声音${systemAudio?'已连接':layoutId==='presenter'?'此布局不采集':'未收到'}`:'麦克风与电脑声音等待连接';
  badge.hidden=!active;badge.textContent=el('liveRecordHeading').textContent;
  refreshLocal().catch(showLocalError);
}
function showLocalError(error){el('liveLocalStatus').textContent=error.message||'本机录制读取失败，请刷新重试。';}
function deviceList(devices){for(const [name,kind] of [['Camera','videoinput'],['Microphone','audioinput']]){const select=el('liveRecord'+name),selected=select.value||saved[name]||'';select.replaceChildren(new Option('系统默认'+(name==='Camera'?'摄像头':'麦克风'),''));let n=0;for(const d of devices.filter(d=>d.kind===kind))select.add(new Option(d.label||(name==='Camera'?'摄像头':'麦克风')+' '+(++n),d.deviceId));if([...select.options].some(o=>o.value===selected))select.value=selected;}}
async function request(path,{method='GET',body}={}){
  const blob=body instanceof Blob,response=await fetch(path,{method,headers:body?{'Content-Type':blob?'application/octet-stream':'application/json'}:undefined,body:body?(blob?body:JSON.stringify(body)):undefined});
  let data;try{data=await response.json();}catch{throw Error('网站尚未确认保存，请稍后重试上传。');}
  if(!response.ok)throw Error(data.error||data.message||'上传失败，请检查登录与网络后重试。');return data;
}
async function refreshLocal(){
  if(!store)return;const records=await store.list({includeUploaded:true}),container=el('liveLocalRecordings');container.replaceChildren();
  if(!records.length){const p=document.createElement('p');p.className='live-note';p.textContent='还没有本机录制。完成第一段录制后会显示在这里。';container.append(p);return;}
  for(const r of records){
    const row=document.createElement('article');row.className='live-local-row';const detail=document.createElement('div'),title=document.createElement('strong'),note=document.createElement('p');
    title.textContent=r.title||layouts[r.layout]?.name||'直播录像';note.textContent=`${new Date(r.startedAt).toLocaleString()} · ${bytes(r.size)} · ${uploadingId===r.id?'正在上传':r.status==='uploaded'?'已保存到回放历史':r.complete?'已完整保存在本机':r.status==='recording'?'正在录制':'中断片段'}${errors.has(r.id)?' · '+errors.get(r.id):''}`;detail.append(title,note);row.append(detail);
    const actions=document.createElement('div');actions.className='live-local-actions';
    if(r.size&&r.status!=='recording'){const download=document.createElement('button');download.className='quiet-button';download.textContent=r.complete?'下载录像':'下载中断片段';download.addEventListener('click',async()=>{download.disabled=true;try{const exported=await store.exportBlob(r.id),url=URL.createObjectURL(exported.blob),a=document.createElement('a');a.href=url;a.download=exported.fileName;document.body.append(a);a.click();a.remove();setTimeout(()=>URL.revokeObjectURL(url),60000);}catch(error){showLocalError(error);}finally{download.disabled=false;}});actions.append(download);}
    if(r.uploadEligible){const retry=document.createElement('button');retry.className='quiet-button';retry.textContent='重试上传';retry.disabled=uploadingId===r.id;retry.addEventListener('click',()=>{errors.delete(r.id);runUploads().catch(showLocalError);});actions.append(retry);}
    if(r.status!=='recording'){const remove=document.createElement('button');remove.className='quiet-button';remove.textContent='删除本机副本';remove.disabled=uploadingId===r.id;remove.addEventListener('click',async()=>{if(!confirm(r.status==='uploaded'?'删除这段录像的本机副本？已保存的云端回放会保留。':'这段录像尚未保存到云端，确定删除本机录像？'))return;try{await store.deleteSession(r.id,{reason:'user-confirmed'});await refreshLocal();}catch(error){showLocalError(error);}});actions.append(remove);}
    row.append(actions);container.append(row);
  }
}
async function runUploads(){
  if(!store)return;if(busy){uploadRequested=true;return;}busy=true;
  try{for(const session of await store.list()){
    if(!session.uploadEligible||errors.has(session.id))continue;
    try{await navigator.locks.request('lingan-live-upload-'+session.id,{ifAvailable:true},async lock=>{
      if(!lock)return;const current=await store.getSession(session.id);if(!current.uploadEligible)return;
      uploadingId=session.id;await refreshLocal();
      const receipt=await uploadRecordedReplay({...current,fileName:recordingFileName(current),readRange:(start,end)=>store.readRange(current.id,start,end)},{request,onProgress:progress=>{el('liveLocalStatus').textContent=progress.stage==='saved'?'回放已保存到待处理和直播回放历史。':`${progress.stage==='hash'?'正在检查完整录像':'正在上传回放'} ${Math.round(progress.ratio*100)}% · ${current.title}`;}});
      await store.markUploaded(current.id,{cloudItemId:receipt.item.id});window.LinganLive?.refresh();
    });}catch(error){errors.set(session.id,error.message);el('liveLocalStatus').textContent='上传未完成，录像保留在本机。可点击重试上传或下载。';}
    finally{uploadingId=null;await refreshLocal();}
  }}finally{busy=false;if(uploadRequested){uploadRequested=false;runUploads().catch(showLocalError);}}
}
window.LinganRecorder={start(id){
  if(!ready){el('liveRecordStatus').textContent=captureSupported()?'正在准备本机保存，请稍后再点。':'请在电脑上的新版 Chrome 或 Edge 中打开网站录制。';return;}
  savePreferences();const p=preferences();
  // Keep start in the click call stack: getDisplayMedia needs user activation.
  controller.start(id,{layoutSettings:layoutEditor.settings(id),cameraId:p.Camera,microphoneId:p.Microphone,microphone:p.MicEnabled,systemAudio:p.SystemEnabled,microphoneVolume:Number(p.MicVolume),systemVolume:Number(p.SystemVolume),platform:p.Platform,title:p.Title}).catch(()=>{});
  navigator.storage?.persist?.().catch(()=>{});
}};
el('liveRecordStop').addEventListener('click',()=>controller?.stop());el('liveRecordPause').addEventListener('click',()=>controller?.pause());
el('liveRecordMicVolume').addEventListener('input',event=>controller?.volume('microphone',event.target.value));el('liveRecordSystemVolume').addEventListener('input',event=>controller?.volume('system',event.target.value));
setInterval(()=>{if(controller?.phase!=='idle'&&controller){el('liveRecordTimer').textContent=timer(controller.elapsed());if(controller.phase==='recording'||controller.phase==='paused')badge.textContent=`${controller.phase==='paused'?'已暂停':'正在录制'} · ${timer(controller.elapsed())} · 返回直播`; }},1000);
setInterval(()=>{if(controller?.phase==='recording'&&performance.now()-controller.lastFrameAt>30000){controller.interrupted='摄像头已超过 30 秒没有送来画面';controller.stop();}},2000);
window.addEventListener('beforeunload',event=>{if(controller?.phase!=='idle'&&controller||busy){event.preventDefault();event.returnValue='';}});
window.addEventListener('pagehide',()=>{if(controller&&controller.phase!=='idle'){controller.cancelled=true;controller.streams.forEach(stream=>stream.getTracks().forEach(track=>track.stop()));controller.worker?.terminate();controller.output?.getTracks().forEach(track=>track.stop());controller.audioContext?.close().catch(()=>{});}});
window.addEventListener('online',()=>{errors.clear();runUploads().catch(showLocalError);});
async function init(){
  if(!captureSupported()){el('liveRecordStatus').textContent='网页录制需要电脑上的新版 Chrome 或 Edge，请用这些浏览器打开网站。';return;}
  for(const card of cards)card.disabled=true;
  store=createRecordingStore();await store.open();
  const release=await recordingLock();if(release){try{await store.recoverAbandoned({lockHeld:true});}finally{release();}}
  try{deviceList(await navigator.mediaDevices.enumerateDevices());}catch{}
  controller=new LiveCapture({store,onState:renderState,onComplete:()=>runUploads().catch(showLocalError),onDevices:deviceList,onPreview:stream=>{const video=el('liveRecordPreview');video.srcObject=stream;video.hidden=!stream;el('liveRecordEmpty').hidden=Boolean(stream);if(stream){video.style.aspectRatio=layouts[controller.layoutId].width+'/'+layouts[controller.layoutId].height;video.play().catch(()=>{});}}});
  ready=true;renderState({phase:'idle',message:'点上方一种画面，选好设备并授权后自动开始录制。'});await refreshLocal();await runUploads();
}
init().catch(error=>{el('liveRecordStatus').textContent=error.message||'本机保存尚未准备好，请刷新重试。';});
