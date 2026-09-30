// Google Maps loads only when the user selects the Google view.
export function createGoogleMap({places,onSelect,onClose}){
 const pane=document.createElement('section');pane.id='google-view';pane.hidden=true;pane.setAttribute('aria-label','谷歌地图');
 pane.innerHTML='<div id="google-canvas"></div><div class="google-message glass" role="status"><h2>谷歌地图</h2><p id="google-status">正在读取本地配置…</p><a class="google-external" target="_blank" rel="noopener noreferrer">在 Google 地图浏览厦门 ↗</a><button id="google-retry">重试</button></div><button class="google-back glass">返回三维地图</button>';
 document.body.append(pane);let map,loading,selectedPlace=null;
 const status=pane.querySelector('#google-status'),message=pane.querySelector('.google-message');
 const external=pane.querySelector('.google-external');
 function externalUrl(p){const url=new URL('https://www.google.com/maps/@');url.search=new URLSearchParams({api:'1',map_action:'map',center:`${p?.ll[1]??24.49},${p?.ll[0]??118.115}`,zoom:p?'16':'12',basemap:'satellite'}).toString();return url.href;}
 external.href=externalUrl();
 pane.querySelector('.google-back').onclick=()=>{pane.hidden=true;document.body.dataset.provider='local';onClose();};
 async function load(){
  if(map)return;message.hidden=false;
  try{
   const response=await fetch('/google-maps-config.json',{cache:'no-store'});if(!response.ok)throw new Error('还未找到原来的谷歌地图配置。配置完成后可在这里显示厦门地图；目前仍可使用三维地图。');
   const config=await response.json();if(typeof config.apiKey!=='string'||!config.apiKey.trim())throw new Error('内嵌地图尚无 Google Maps API 密钥；可以打开独立的 Google 地图页面浏览厦门。');
   status.textContent='正在加载谷歌地图…';
   loading??=new Promise((resolve,reject)=>{
    const callback='__xiamenGoogleReady';const script=document.createElement('script');let timer;
    const finish=(error)=>{clearTimeout(timer);delete window[callback];if(error){script.remove();loading=null;reject(error);}else resolve();};
    window[callback]=()=>finish();window.gm_authFailure=()=>{status.textContent='谷歌地图配置未通过验证，请检查原配置的接口权限与本机地址限制。';message.hidden=false;};
    const url=new URL('https://maps.googleapis.com/maps/api/js');url.search=new URLSearchParams({key:config.apiKey,loading:'async',callback,v:'weekly',libraries:'maps,marker',language:'zh-CN',auth_referrer_policy:'origin'}).toString();script.src=url.href;script.async=true;script.onerror=()=>finish(new Error('暂时无法连接谷歌地图。检查网络后可重试。'));timer=setTimeout(()=>finish(new Error('谷歌地图加载超时。')),20000);document.head.append(script);
   });
   await loading;const {Map}=await window.google.maps.importLibrary('maps');const {AdvancedMarkerElement}=await window.google.maps.importLibrary('marker');
   map=new Map(pane.querySelector('#google-canvas'),{center:{lat:24.49,lng:118.115},zoom:12,mapId:config.mapId||'DEMO_MAP_ID',mapTypeId:'hybrid',streetViewControl:true,fullscreenControl:false,mapTypeControl:true});
   for(let i=0;i<places.length;i++){const p=places[i],marker=new AdvancedMarkerElement({map,title:p.name,position:{lat:p.ll[1],lng:p.ll[0]}});marker.addListener('click',()=>onSelect(i));}
   window.google.maps.event.addListenerOnce(map,'tilesloaded',()=>{message.hidden=true;});if(selectedPlace)focus(selectedPlace);
  }catch(error){status.textContent=error.message;}
 }
 function focus(p){selectedPlace=p;external.href=externalUrl(p);if(map){map.panTo({lat:p.ll[1],lng:p.ll[0]});map.setZoom(16);}}
 pane.querySelector('#google-retry').onclick=load;
 return{open(){pane.hidden=false;document.body.dataset.provider='google';load();},focus,getState:()=>({open:!pane.hidden,configured:!!map})};
}
