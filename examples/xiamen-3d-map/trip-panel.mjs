import {createElement,MapPin,Download,Trash2} from 'lucide';
import {createTripRecorder,readTrips,saveTrips,HISTORY_KEY,tripTime,tripDuration} from './travel-history.mjs';
const key='xiamen-save-trips',escape=s=>String(s).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const labels={start:'开始记录',arrive:'到达',leave:'离开',stay:'停留满20分钟',gap:'记录中断',resume:'恢复记录',end:'结束记录'};
export function createTripPanel({places,map,focus,stopTracking}){
 let storage;try{storage=window.localStorage;}catch{}
 let trips=storage?readTrips(storage):[],persist=false,root=null,activeId=trips.at(-1)?.id,lastFix=0,wasEnabled=false,lastSaved=0,message='',lastEventCount=0;
 try{persist=storage?.getItem(key)==='true';}catch{}
 for(const t of trips)if(!t.endedAt){const at=t.track.at(-1)?.at??t.startedAt;t.endedAt=at;t.events.push({id:t.events.length+1,type:'gap',at,until:at,reason:'上次页面已关闭，之后未继续记录'});}
 function save(force=false){if(!persist||!force&&Date.now()-lastSaved<5000)return;try{saveTrips(localStorage,trips);lastSaved=Date.now();message='已保存在这台设备，不会同步到其他手机。';}catch{message='本机存储空间不足，本次记录仍在内存中；可导出保存。';}}
 const recorder=createTripRecorder({places,onChange:trip=>{
  const index=trips.findIndex(t=>t.id===trip.id);if(index<0){trips.push(trip);activeId=trip.id;}else trips[index]=trip;trips=trips.slice(-5);
  save(trip.events.length!==lastEventCount||!!trip.endedAt);lastEventCount=trip.events.length;
  if(root?.isConnected&&root.dataset.panel==='history'){const scroll=root.scrollTop;render(root);root.scrollTop=scroll;}
 }});
 function observe(s){
  if(s.enabled&&s.status==='active'&&s.receivedAt!==lastFix){lastFix=s.receivedAt;recorder.feed({...s.position,at:s.position.at??s.receivedAt});}
  else if(s.enabled&&['suspended','stale','unavailable','timeout','imprecise','outside'].includes(s.status))recorder.pause(Date.now(),s.status==='suspended'?'页面转入后台':s.status==='outside'?'离开本次地图覆盖范围':'设备未提供足够精确的连续位置');
  if(wasEnabled&&!s.enabled)recorder.stop(Date.now());wasEnabled=s.enabled;
 }
 function render(container){
  root=container;root.dataset.panel='history';
  const trip=trips.find(t=>t.id===activeId)||trips.at(-1);if(trip)activeId=trip.id;
  root.innerHTML=`<div class="location-toggle"><label><input id="save-trips" type="checkbox" ${persist?'checked':''}> 保存旅行记录到本机</label></div><p class="travel-notice">自动记录到达与离开景点、停留满20分钟的位置。时间来自设备，统一显示北京时间（UTC+8），到达判定为定位估算。后台中断不计入停留。${persist?'记录保留在本机，可随时删除。':'当前仅保留在本页；刷新或关闭页面会丢失未保存记录。'}</p><p class="trip-save-status" role="status">${escape(message)}</p>${trips.length?`<label class="travel-field">旅行日期<select id="trip-selection">${trips.map(t=>`<option value="${escape(t.id)}" ${t.id===activeId?'selected':''}>${tripTime(t.startedAt)}${t.endedAt?'':' · 记录中'}</option>`).join('')}</select></label>`:'<p class="travel-summary">尚无旅行记录。开启定位后，在覆盖范围内移动即可开始记录。</p>'}<div class="trip-actions"></div><div class="trip-timeline"></div>`;
  root.querySelector('#save-trips').onchange=e=>{persist=e.target.checked;try{localStorage.setItem(key,String(persist));if(persist)save(true);else{localStorage.removeItem(HISTORY_KEY);message='本机已保存记录已移除，本页记录暂时保留。';}}catch{message='浏览器不允许本机存储，请导出记录。';}render(root);};
  root.querySelector('#trip-selection')?.addEventListener('change',e=>{activeId=e.target.value;render(root);});
  if(!trip)return;
  function button(label,icon,fn){const b=document.createElement('button');b.type='button';b.title=label;b.setAttribute('aria-label',label);b.append(createElement(icon));b.onclick=fn;root.querySelector('.trip-actions').append(b);return b;}
  button('显示这次旅行的实际轨迹',MapPin,()=>{map.history(trip.track);const p=trip.track.at(-1);if(p)focus(p.ll,.7,800);}).append('查看轨迹');
  button('导出旅行时间与轨迹',Download,()=>{const url=URL.createObjectURL(new Blob([JSON.stringify(trip,null,2)],{type:'application/json'})),a=document.createElement('a');a.download='厦门旅行-'+new Date(trip.startedAt).toISOString().slice(0,10)+'.json';a.href=url;a.click();setTimeout(()=>URL.revokeObjectURL(url),5000);});
  button('停止定位并删除全部旅行记录',Trash2,()=>{stopTracking();recorder.clear();trips=[];activeId=null;map.history([]);try{localStorage.removeItem(HISTORY_KEY);}catch{}message='全部旅行记录已删除。';render(root);});
  const timeline=root.querySelector('.trip-timeline');
  for(const event of [...trip.events].reverse()){
   const row=document.createElement('article');row.className='trip-event';row.dataset.type=event.type;
   row.innerHTML=`<time datetime="${new Date(event.at).toISOString()}">${tripTime(event.at)}</time><strong>${labels[event.type]||'记录'}${event.name?' · '+escape(event.name):''}</strong>${event.duration?`<p>停留 ${tripDuration(event.duration)}${event.startedAt?' · 自 '+tripTime(event.startedAt)+' 起':''}</p>`:''}${event.type==='gap'?`<p>${escape(event.reason)}；${event.until>event.at?tripTime(event.until)+' 恢复前的时间不作到访证明。':'等待恢复定位。'}</p>`:''}`;
   if(event.ll){const b=document.createElement('button');b.title='查看记录地点';b.setAttribute('aria-label','查看'+(event.name||'记录')+'的位置');b.append(createElement(MapPin));b.onclick=()=>{map.history(trip.track);focus(event.ll,.3,700);};row.append(b);}timeline.append(row);
  }
 }
 return {observe,render,flush:()=>save(true),getState:()=>({trips:trips.length,events:trips.reduce((n,t)=>n+t.events.length,0),savedLocally:persist})};
}
