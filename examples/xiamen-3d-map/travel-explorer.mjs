import {createElement,MapPinned,LocateFixed,Anchor,X,ArrowLeft,ChevronRight,Route,Compass,Play,Pause,SkipBack,SkipForward,Building2,PanelLeftOpen} from 'lucide';
import {travelPlaces,travelRoutes,ferryOptions,sources,checkedOn} from './travel-data.mjs';
import {createLocationSession,inGeoBounds,distanceMeters} from './geo-utils.mjs';
import {createTravelRouter} from './travel-routing.mjs';
import {createTravelMapLayer} from './travel-map-layer.mjs';
import {createTripPanel} from './trip-panel.mjs';
import {routeProgress} from './walking-guidance.mjs';
import {renderWalkingPanel,updateWalkingPanel} from './walking-panel.mjs';
import {islandTourOrder,filterIsland,islandCategories,tourStage} from './travel-tour.mjs';
import {islandHospitality,hospitalityCheckedOn,priceFreshness} from './island-hospitality.mjs';
import {mappedIslandHotels,hotelCatalogInfo,hotelAreas,filterHotels,nearestHotel} from './island-hotels.mjs';
import regions from './regions.json';
import './travel.css';

const escape=s=>String(s).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const allPlaces=[...travelPlaces,...mappedIslandHotels];
const point=id=>allPlaces.find(p=>p.id===id);
const island=ll=>ll[0]<118.0725&&ll[0]>118.05&&ll[1]<24.455&&ll[1]>24.438;
const bbox=[117.98,24.38,118.25,24.62];
export function mountTravelExplorer({scene,camera,controls,toWorld,heightAt,waterAt,focus,focusViews={},stopTour,tour,onSelect=()=>{},labelsVisible=()=>true}){
 let photos={},router=null,loadPromise,opened=false,view='island',selected=null,follow=false,destination='shuzhuang',origin='sanqiutian',ferry='day',currentPlan=null,routeVersion=0,lastRoutePosition=null,lastRouteTime=0,orientationOn=false,lastFollowAt=0;
 let avoidSteps=false,progress={status:'unavailable'},shoreConfirmedAt=null;
 const map=createTravelMapLayer({scene,camera,toWorld,heightAt,waterAt,focus});
 const launch=document.createElement('nav');launch.className='travel-launch glass';launch.setAttribute('aria-label','厦门旅行');document.body.append(launch);
 function iconButton(label,icon,click,id){const b=document.createElement('button');b.type='button';b.title=label;b.setAttribute('aria-label',label);if(id)b.id=id;b.append(createElement(icon));b.onclick=click;return b;}
 const travelButton=iconButton('鼓浪屿与中山路旅行',MapPinned,()=>open('island'),'travel-open');travelButton.append('旅行');
 const locationButton=iconButton('我的位置与路线',LocateFixed,()=>open('location'),'travel-locate');locationButton.append('定位');
 const dockButton=iconButton('查看码头位置与乘船资料',Anchor,()=>{open('ferry');fitDocks();},'travel-docks');dockButton.append('码头');launch.append(travelButton,locationButton,dockButton);
 const drawer=document.createElement('section');drawer.className='travel-drawer glass';drawer.hidden=true;drawer.setAttribute('aria-label','鼓浪屿与中山路旅行指南');
 drawer.innerHTML='<header><div><small>XIAMEN · ON FOOT</small><h2>鼓浪屿与中山路</h2></div></header><nav class="travel-tabs" aria-label="旅行分类"></nav><div class="travel-body"></div>';
 const close=iconButton('关闭旅行面板',X,()=>hide(),'travel-close');drawer.querySelector('header').append(close);document.body.append(drawer);
 const content=drawer.querySelector('.travel-body'),tabs=drawer.querySelector('.travel-tabs');
 let category='all',query='',hotelQuery='',hotelZone='all',tourPresentation=false,presentationStage=0,foodPhotos={},tourCollapsed=false,tourScope='all',focusedPlace=null;
 const islandTourButton=iconButton('鼓浪屿范围巡游',Play,()=>tour.getState().scope==='岛内巡游'&&tour.getState().total?(tour.getState().running?tour.pause():tour.resume()):startIslandTour(),'island-tour-launch');islandTourButton.append('岛内巡游');islandTourButton.setAttribute('aria-pressed','false');launch.append(islandTourButton);
 const tourBar=document.createElement('div');tourBar.className='travel-tour-bar';tourBar.hidden=true;drawer.insertBefore(tourBar,content);
 let tourSignature='';
 function syncTour(){
  const s=tour.getState(),signature=[s.index,s.total,s.seconds,s.running,s.ended,tourPresentation,tourCollapsed].join(':');
  if(signature!==tourSignature){tourSignature=signature;updateTourBar();}
  updateCountdown(s);
  const stage=point(s.current)?.area==='hotels'?0:tourStage(s.elapsed,s.seconds);
  if(s.running&&tourPresentation&&selected===s.current&&stage!==presentationStage){presentationStage=stage;if(opened)render();focusTourStage();}
 }
 function updateCountdown(s){
  const label=tourBar.querySelector('.tour-countdown'),progress=tourBar.querySelector('progress');
  if(label)label.textContent=s.ended?'巡游完成':s.running?`${Math.ceil((s.seconds*1000-s.elapsed)/1000)}秒后下一站`:'已暂停';
  if(progress){progress.max=s.seconds*1000;progress.value=s.elapsed;}
 }
 function placeTourBar(){
  if(tourCollapsed){tourBar.classList.add('floating','glass');document.body.append(tourBar);}
  else{tourBar.classList.remove('floating','glass');drawer.insertBefore(tourBar,content);}
 }
 function updateTourBar(){
  document.body.classList.toggle('travel-presenting',tourPresentation);
  const s=tour.getState();tourBar.hidden=!tourPresentation||!s.total;islandTourButton.setAttribute('aria-pressed',String(s.running));tourBar.replaceChildren();if(!s.total)return;
  const text=document.createElement('span');text.className='tour-stop-name';text.textContent=`${s.index+1} / ${s.total} · ${point(s.current)?.name||''}`;text.title=text.textContent;tourBar.append(text);
  tourBar.append(iconButton('上一处景点',SkipBack,()=>tour.step(-1),'travel-prev'),iconButton(s.running?'暂停鼓浪屿巡游':'继续鼓浪屿巡游',s.running?Pause:Play,()=>s.running?tour.pause():tour.resume(),'travel-play'),iconButton('下一处景点',SkipForward,()=>tour.step(1),'travel-next'));
  const speed=document.createElement('select');speed.setAttribute('aria-label','每站巡游停留时间');for(const n of [9,18,20,30,45,60]){const o=new Option(n+'秒',String(n));o.selected=n===s.seconds;speed.add(o);}speed.onchange=()=>tour.speed(speed.value);tourBar.append(speed);
  if(tourCollapsed)tourBar.append(iconButton('展开巡游介绍',PanelLeftOpen,()=>{tourCollapsed=false;opened=true;drawer.hidden=false;document.body.classList.add('travel-open');travelButton.setAttribute('aria-expanded','true');placeTourBar();render();updateTourBar();focusTourStage();},'travel-tour-expand'));
  const countdown=document.createElement('small');countdown.className='tour-countdown';tourBar.append(countdown,document.createElement('progress'));updateCountdown(s);
 }
 function startIslandTour(filtered=false,scope='all'){
  stopTour();follow=false;if(!opened)open(scope==='hotels'?'hotels':'island');tourPresentation=true;presentationStage=0;tourCollapsed=false;tourScope=scope;placeTourBar();
  const list=scope==='hotels'?filterHotels(filtered?hotelQuery:'',filtered?hotelZone:'all'):filterIsland(travelPlaces,filtered?category:'all',filtered?query:'');
  tour.start(islandTourOrder(list,selected||'sanqiutian'),selected,scope==='hotels'?'岛内住宿巡游':'岛内巡游');
 }
 for(const [id,label] of [['island','鼓浪屿'],['hotels','酒店'],['oldtown','中山路'],['ferry','轮渡'],['routes','路线'],['location','定位'],['history','足迹']]){const b=document.createElement('button');b.textContent=label;b.dataset.tab=id;b.onclick=()=>{tourPresentation=false;tour.pause();selected=null;view=id;render();};tabs.append(b);}
 const pinLayer=document.createElement('div');pinLayer.className='travel-pins';document.body.append(pinLayer);
 const pins=allPlaces.map(p=>{
  const dock=p.area==='ferry',b=document.createElement('button');b.type='button';b.className='travel-pin'+(dock?' dock-pin':'');b.dataset.poi=p.id;
  if(dock){b.append(createElement(Anchor));b.dataset.shore=p.island?'island':p.id==='songyu'?'haicang':'xiamen';}
  if(p.area==='hotels'){b.classList.add('hotel-pin');b.append(createElement(Building2));}
  const name=document.createElement('span');name.textContent=p.name;b.append(name);b.title=p.name+' · '+p.kind;b.setAttribute('aria-label',p.name+'，查看位置与介绍');b.onclick=()=>showPlace(p.id);b.style.left='-10000px';pinLayer.append(b);
  const width=b.offsetWidth;b.hidden=true;return {p,b,dock,width,pos:map.point(p.ll)};
 });
 const liveBadge=document.createElement('button');liveBadge.className='travel-live glass';liveBadge.hidden=true;liveBadge.onclick=()=>open('location');liveBadge.append(createElement(LocateFixed),document.createElement('span'));document.body.append(liveBadge);
 const statusText={off:'定位已关闭',requesting:'正在请求设备位置',active:'定位中',imprecise:'位置精度较低',outside:'你在本次旅行地图范围之外',stale:'位置已过期，等待更新',timeout:'定位超时，等待设备重新定位',unavailable:'设备暂时无法提供位置',denied:'定位权限被拒绝',unsupported:'当前浏览器不支持定位',suspended:'已暂停定位'};
 let locationState={enabled:false,status:'off',position:null,heading:null,trail:[]};
 const tripPanel=createTripPanel({places:[...travelPlaces,...regions.slice(2).map((p,i)=>({...p,id:'region-'+i,arrivalRadius:100}))],map,focus,stopTracking:()=>{disableCompass();session.stop();}});
 const session=createLocationSession({geolocation:navigator.geolocation,bbox,onChange:s=>{
  locationState=s;map.location(s);liveBadge.hidden=!s.enabled;liveBadge.querySelector('span').textContent=statusText[s.status];
  tripPanel.observe(s);
  updateLocationText();
  updateProgress();
  if(s.enabled&&s.status==='active'&&s.position){
   if(follow&&s.receivedAt!==lastFollowAt){lastFollowAt=s.receivedAt;focus(s.position.ll,.12,450);}
   // Keep the original path stable while walking; recalculate only after a clear deviation.
   if(origin==='live'&&currentPlan&&progress.status==='off-route'&&Date.now()-lastRouteTime>20000&&(!lastRoutePosition||distanceMeters(lastRoutePosition,s.position.ll)>30))void planDestination(false);
  }
  if(!s.enabled&&origin==='live'){routeVersion++;map.route([]);currentPlan=null;lastRoutePosition=null;shoreConfirmedAt=null;renderGuidance();}
 }});
 async function load(){
  if(!loadPromise)loadPromise=(async()=>{const responses=await Promise.all([fetch('/data/travel-photos.json'),fetch('/data/travel-network.json')]);if(responses.some(r=>!r.ok))throw new Error('旅行资料暂时无法载入');photos=await responses[0].json();router=createTravelRouter(await responses[1].json());try{const r=await fetch('/data/food-photos.json');if(r.ok)foodPhotos=await r.json();}catch{}})();
  try{await loadPromise;}catch(error){loadPromise=null;throw error;}
 }
 function open(section='island'){
  tourPresentation=false;tour.pause();tourCollapsed=false;placeTourBar();
  opened=true;view=section;selected=null;drawer.hidden=false;pinLayer.hidden=false;document.body.classList.add('travel-open');travelButton.setAttribute('aria-expanded','true');stopTour();render();
  if(section!=='location')focus(section==='oldtown'?[118.072,24.457]:[118.063,24.447],section==='oldtown'?.62:.85,850);
  void load().then(()=>{if(opened)render();}).catch(()=>{if(opened)content.insertAdjacentHTML('beforeend','<p role="alert">部分资料载入失败，请关闭后重试。</p>');});close.focus();
 }
 function hide(returnFocus=true){
  opened=false;drawer.hidden=true;document.body.classList.remove('travel-open');travelButton.setAttribute('aria-expanded','false');
  if(tourPresentation){tourCollapsed=true;placeTourBar();updateTourBar();focusTourStage();}
  if(returnFocus)travelButton.focus();
 }
 function focusPoint(place,touring=tourPresentation){
  if(!place)return;focusedPlace=place.id;
  const shot=focusViews[place.id];focus(shot?.ll||place.ll,shot?.radius??(place.area==='hotels'?.085:place.area==='ferry'&&place.island?.085:.20),850,touring);
 }
 function focusTourStage(){
  const place=point(selected);if(!place)return;
  focusPoint(presentationStage===2&&place.area!=='hotels'?nearestHotel(place):place);
 }
 function showPlace(id,touring=false){
  const place=point(id);if(!place)return;tourPresentation=touring;presentationStage=0;
  if(!touring){tour.pause();tourCollapsed=false;}
  follow=false;selected=id;view=place.area==='hotels'?'hotels':place.island?'island':place.area;
  opened=!tourCollapsed;drawer.hidden=!opened;pinLayer.hidden=false;document.body.classList.toggle('travel-open',opened);travelButton.setAttribute('aria-expanded',String(opened));placeTourBar();
  if(!touring)stopTour();onSelect(place);if(opened)render();focusPoint(place,touring);
  if(!router)void load().then(()=>{if(opened&&selected===id)render();}).catch(()=>{});
 }
 function sourceLinks(keys){return keys.map(k=>`<a href="${escape(sources[k][1])}" target="_blank" rel="noopener noreferrer">${escape(sources[k][0])} ↗</a>`).join('');}
 function image(p,small=false){const photo=photos[p.photo];return photo?`<img src="${escape(photo.src)}" alt="${escape(p.name)}实景参考" ${small?'loading="lazy"':''} decoding="async">`:small?'<span class="photo-pending" aria-hidden="true"></span>':'<p class="travel-notice">暂未收录已核验授权的实景照片。可通过下方官方资料了解此处。</p>';}
 function render(){
  drawer.classList.toggle('island-touring',tourPresentation);tourBar.hidden=!tourPresentation||!tour.getState().total;
  tabs.querySelectorAll('button').forEach(b=>b.setAttribute('aria-pressed',String(b.dataset.tab===view)));
  content.dataset.panel=view;content.replaceChildren();content.scrollTop=0;
  if(selected){
   const p=point(selected),photo=photos[p.photo];
   if(p.area==='hotels'){renderHotel(p);return;}
   if(tourPresentation&&p.island){renderTourStop(p,photo);return;}
   const back=iconButton('返回景点列表',ArrowLeft,()=>{tour.pause();selected=null;render();});back.className='travel-back';back.append('返回');content.append(back);
   content.insertAdjacentHTML('beforeend',`<article class="travel-detail"><figure>${image(p)}${photo?`<figcaption>实景参考，非实时画面 · <a href="${escape(photo.source)}" target="_blank" rel="noopener noreferrer">${escape(photo.author||'Wikimedia Commons')}</a> · <a href="${escape(photo.licenseUrl||photo.source)}" target="_blank" rel="noopener noreferrer">${escape(photo.license)}</a></figcaption>`:''}</figure><span class="travel-kicker">${escape(p.kind)} · ${escape(p.duration)}</span><h3>${escape(p.name)}</h3><p>${escape(p.intro)}</p><h4>值得留意</h4><ul>${p.highlights.map(x=>`<li>${escape(x)}</li>`).join('')}</ul><p class="travel-notice">${escape(p.tips)}</p><div class="travel-sources">${sourceLinks(p.source)}</div><small>资料核对：${checkedOn} · 停留时间为行程建议</small></article>`);
   if(photo?.captured)content.querySelector('figcaption').append(' · 拍摄资料：'+photo.captured);
   if(p.id==='dongdu')content.querySelector('.travel-detail').insertAdjacentHTML('afterbegin','<p class="travel-notice">照片为历史外观，不是当前游客检票口指引。</p>');
   if(p.parent){const parent=iconButton('查看所属景区',MapPinned,()=>showPlace(p.parent));parent.append('所属景区：'+point(p.parent).name);content.append(parent);}
   if(p.walkingUnavailable){const notice=document.createElement('p');notice.className='travel-notice';notice.textContent='该码头尚无连通的本地步行路网，不绘制跨海步行线。请查看上方官方交通资料。';content.append(notice);return;}
   const go=iconButton('规划到这里的路线',Route,()=>{tour.pause();destination=p.id;origin=locationState.status==='active'?'live':p.island?'sanqiutian':'zhongshan';selected=null;view='location';render();void planDestination();},'travel-go');go.className='travel-primary';go.append('规划到这里');content.append(go);return;
  }
  if(view==='hotels'){renderHotels();return;}
  if(['island','oldtown','ferry'].includes(view)){
   const list=view==='island'?filterIsland(travelPlaces,category,query):travelPlaces.filter(p=>p.area===view);
   content.innerHTML=`<p class="travel-summary">${view==='island'?`${filterIsland(travelPlaces).length}处游览节点，包含园内小景、沙滩、街巷与码头。历史建筑不一定开放入内。`:view==='oldtown'?'从骑楼主街转进支巷，再到市场与海边。':'码头不能混用。中山路旁的老轮渡码头，不是游客白天的默认登岛入口。'}</p>`;
   if(view==='island'){
    const tools=document.createElement('div');tools.className='travel-filter';tools.innerHTML=`<input type="search" id="island-search" aria-label="搜索鼓浪屿地点" placeholder="搜索地点" value="${escape(query)}"><select id="island-category" aria-label="鼓浪屿景点分类">${Object.entries(islandCategories).map(([id,label])=>`<option value="${id}" ${category===id?'selected':''}>${label}</option>`).join('')}</select>`;
    tools.querySelector('input').oninput=e=>{query=e.target.value;const caret=e.target.selectionStart;render();const input=content.querySelector('#island-search');input.focus();try{input.setSelectionRange(caret,caret);}catch{}};
    tools.querySelector('select').onchange=e=>{category=e.target.value;render();};content.append(tools);
    const play=iconButton('巡游全部鼓浪屿游览节点',Play,()=>startIslandTour(),'island-tour-all');play.className='travel-primary';play.append('全岛景点巡游');content.append(play);
    const hotels=iconButton('查看全岛酒店与民宿',Building2,()=>{view='hotels';render();},'island-hotels-open');hotels.append(`岛内住宿 · ${mappedIslandHotels.length}处`);content.append(hotels);
    if(category!=='all'||query){const filtered=iconButton('巡游当前筛选地点',Play,()=>startIslandTour(true));filtered.append('巡游筛选结果');filtered.disabled=!list.length;content.append(filtered);}
    content.insertAdjacentHTML('beforeend',`<p class="travel-summary">${list.length}处匹配 · 巡游为镜头导览，不是步行导航</p>`);
   }
   if(view==='ferry'){const overview=iconButton('总览所有客运码头位置',MapPinned,fitDocks,'dock-overview');overview.className='travel-primary';overview.append('码头总览');content.append(overview);}
   let shore='';
   const ordered=view==='ferry'?[...list].sort((a,b)=>Number(!a.island)-Number(!b.island)||Number(a.id==='songyu')-Number(b.id==='songyu')):list;
   for(const p of ordered){
    if(view==='ferry'){const group=p.island?'鼓浪屿岛内':p.id==='songyu'?'海沧侧':'厦门岛侧';if(group!==shore){shore=group;const heading=document.createElement('h3');heading.className='dock-shore-heading';heading.textContent=group;content.append(heading);}}
    const row=document.createElement('button');row.className='travel-place-row';row.dataset.place=p.id;row.innerHTML=`${image(p,true)}<span><strong>${escape(p.name)}</strong><small>${escape(p.kind)} · ${escape(p.duration)}</small></span>`;row.append(createElement(ChevronRight));row.onclick=()=>showPlace(p.id);content.append(row);
   }
   if(view==='ferry')content.insertAdjacentHTML('beforeend',`<div class="travel-sources">${sourceLinks(['ferry','ferryUpdate','ticket'])}</div><p class="travel-notice">票价、时刻、天气停航与返程码头以当日票务及公告为准。此处不提供实时船位。</p>`);
   if(view==='island')content.insertAdjacentHTML('beforeend',`<p class="travel-notice">收录依据公共旅游导览及地图快照，包含园内细分景点，不代表已穷尽全岛地点或全部开放。旅游资料中的旧照片、旧活动不作为当日信息。</p><div class="travel-sources">${sourceLinks(['guide','beaches','osm'])}</div>`);
  }else if(view==='routes'){
   for(const route of travelRoutes){const section=document.createElement('section');section.className='travel-itinerary';section.innerHTML=`<h3>${escape(route.name)}</h3><small>${escape(route.estimate)}</small><ol>${route.stops.map(id=>`<li><button data-stop="${id}">${escape(point(id).name)}</button></li>`).join('')}</ol><p>${escape(route.note)}</p>`;
    section.querySelectorAll('[data-stop]').forEach(b=>b.onclick=()=>showPlace(b.dataset.stop));const b=iconButton('显示'+route.name,Route,()=>void planItinerary(route));b.append('显示参考路线');b.className='travel-primary';section.append(b);content.append(section);
   }
   content.insertAdjacentHTML('afterbegin','<p class="travel-notice">绿线：道路参考；橙色虚线：轮渡示意；蓝线：本次实际移动轨迹。路网快照为2026-09-13，非实时导航，不含封路与无障碍核验。</p><p class="route-result" role="status"></p>');
  }else if(view==='history')tripPanel.render(content);else renderLocation();
 }
 function renderHotels(){
  const list=filterHotels(hotelQuery,hotelZone);
  content.innerHTML=`<h3>鼓浪屿酒店与民宿</h3><p class="travel-summary">已收录 ${mappedIslandHotels.length} 个地图住宿点 · 当前 ${list.length} 个</p><div class="travel-filter"><input type="search" id="hotel-search" aria-label="搜索岛内酒店" placeholder="酒店、地址或附近景点" value="${escape(hotelQuery)}"><select id="hotel-area" aria-label="酒店所在片区">${Object.entries(hotelAreas).map(([id,name])=>`<option value="${id}" ${hotelZone===id?'selected':''}>${name}</option>`).join('')}</select></div><p class="travel-notice">${escape(hotelCatalogInfo.coverage)} 地图快照 ${hotelCatalogInfo.snapshot}；重名、改名及停业情况待商家核对。</p>`;
  content.querySelector('#hotel-search').oninput=e=>{hotelQuery=e.target.value;const caret=e.target.selectionStart;render();const input=content.querySelector('#hotel-search');input.focus();input.setSelectionRange(caret,caret);};
  content.querySelector('#hotel-area').onchange=e=>{hotelZone=e.target.value;render();};
  const play=iconButton('自动巡游全部已收录酒店',Play,()=>startIslandTour(false,'hotels'),'hotel-tour-all');play.className='travel-primary';play.append('酒店巡游');content.append(play);
  if(hotelQuery||hotelZone!=='all'){const filtered=iconButton('巡游筛选的酒店',Play,()=>startIslandTour(true,'hotels'),'hotel-tour-filtered');filtered.disabled=!list.length;filtered.append('巡游筛选结果');content.append(filtered);}
  if(!list.length)content.insertAdjacentHTML('beforeend','<p class="travel-notice">没有匹配的已收录住宿点。未找到不表示该酒店不存在。</p>');
  for(const h of list){
   const row=document.createElement('button');row.className='travel-place-row hotel-row';row.dataset.hotel=h.id;row.dataset.place=h.id;
   const symbol=document.createElement('span');symbol.className='hotel-symbol';symbol.append(createElement(Building2));row.append(symbol);
   row.insertAdjacentHTML('beforeend',`<span><strong>${escape(h.name)}</strong><small>${escape(h.theme)} · ${h.profile?'特色已核对':'设施待核验'}</small><small>${escape(h.nearby[0].name)}附近 · 直线约${h.nearby[0].meters}米${h.duplicate?' · 同名地图记录待核对':''}</small></span>`);
   row.append(createElement(ChevronRight));row.onclick=()=>showPlace(h.id);content.append(row);
  }
  content.insertAdjacentHTML('beforeend','<div class="travel-sources"><a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noopener noreferrer">住宿位置：© OpenStreetMap contributors / OpenFreeMap · ODbL</a></div>');
 }
 function hotelMarkup(h){
  const p=h.profile;
  return `<span class="travel-kicker">${escape(h.kind)} · ${escape(hotelAreas[h.zone])}</span><h3>${escape(h.name)}</h3><p class="hotel-theme">${escape(h.theme)}</p><p>${escape(h.intro)}</p>
   ${p?`<ul class="hotel-features">${p.features.map(f=>`<li>${escape(f)}</li>`).join('')}</ul><p class="island-address">${escape(p.address)}</p><small>公开住宿资料核对：${hotelCatalogInfo.checkedOn}</small>`:'<p class="travel-notice">上方为位置环境介绍。房型、建筑特色、内部设施及营业状态尚未独立核实。</p>'}
   <h4>附近可看</h4><ul class="hotel-nearby">${h.nearby.map(n=>`<li><button type="button" data-nearby="${n.id}">${escape(n.name)}</button><small>直线约 ${n.meters} 米</small></li>`).join('')}</ul>
   <p class="travel-notice">以上距离不是步行长度。住宿点为地图参考位置，不代表已核验入口；请向酒店确认台阶、行李接送、房型与当日房价。${h.coordinateNote?escape(h.coordinateNote):''}${h.duplicate?' 本地图中有同名记录，尚未确定是否为不同分店。':''}</p>
   <small>位置快照 ${hotelCatalogInfo.snapshot} · WGS84 ${h.ll.map(n=>n.toFixed(6)).join(', ')}</small>
   <div class="travel-sources">${p?`<a href="${escape(p.source)}" target="_blank" rel="noopener noreferrer">查看酒店实景、房型及来源 ↗</a>`:''}<a href="${escape(h.source)}" target="_blank" rel="noopener noreferrer">核对地图位置 ↗</a></div>`;
 }
 function bindHotelActions(container,h){
  container.querySelectorAll('[data-nearby]').forEach(b=>b.onclick=()=>showPlace(b.dataset.nearby));
  container.querySelectorAll('a').forEach(a=>a.addEventListener('click',()=>tour.pause()));
  const actions=document.createElement('div');actions.className='hotel-actions';
  const locate=iconButton('定位这家酒店',LocateFixed,()=>{tour.pause();focusPoint(h);},'hotel-focus');locate.append('定位酒店');
  const go=iconButton('规划到这家酒店的路线',Route,()=>{tourPresentation=false;tour.pause();destination=h.id;origin=locationState.status==='active'?'live':'sanqiutian';selected=null;view='location';render();void planDestination();},'hotel-go');go.className='travel-primary';go.append('到这里');actions.append(locate,go);container.append(actions);
 }
 function renderHotel(h){
  content.dataset.stage='0';
  const back=iconButton('返回酒店列表',ArrowLeft,()=>{tourPresentation=false;tour.pause();selected=null;view='hotels';render();});back.className='travel-back';back.append('酒店列表');content.append(back);
  const article=document.createElement('article');article.className='travel-detail hotel-detail';article.dataset.hotel=h.id;article.innerHTML=hotelMarkup(h);content.append(article);bindHotelActions(article,h);
 }
 function renderTourStop(p,photo){
  const state=tour.getState(),guide=islandHospitality(p,state.index),stage=presentationStage;
  content.dataset.stage=String(stage);
  const headings=['景点','美食','住宿'];
  content.innerHTML=`<div class="island-tour-heading"><small>鼓浪屿 · ${state.index+1} / ${state.total}</small><h3>${escape(p.name)}</h3></div><nav class="island-tour-stages" aria-label="巡游内容">${headings.map((name,i)=>`<button type="button" data-stage="${i}" aria-pressed="${stage===i}">${name}</button>`).join('')}</nav><article class="island-tour-story"></article>`;
  content.querySelectorAll('[data-stage]').forEach(b=>b.onclick=()=>{tour.pause();presentationStage=Number(b.dataset.stage);render();focusTourStage();});
  const story=content.querySelector('.island-tour-story');
  if(stage===2){
   const hotel=nearestHotel(p);story.innerHTML=`<small>地图位置相近的住宿 · 非步行最近推荐</small>${hotelMarkup(hotel)}`;story.dataset.hotel=hotel.id;bindHotelActions(story,hotel);return;
  }
  if(stage===0){
   story.innerHTML=`<span class="travel-kicker">${escape(p.kind)} · ${escape(p.duration)}</span><p>${escape(p.intro)}</p><figure>${image(p)}${photo?`<figcaption><a href="${escape(photo.source)}" target="_blank" rel="noopener noreferrer">${escape(photo.author)} · ${escape(photo.license)}</a> · 实景参考，非实时</figcaption>`:''}</figure><ul>${p.highlights.map(t=>`<li>${escape(t)}</li>`).join('')}</ul><p class="travel-notice">${escape(p.tips)}</p><div class="travel-sources">${sourceLinks(p.source)}</div>`;
  }else{
   const item=stage===1?guide.food:guide.hotel,fp=foodPhotos[item.photo];
   story.innerHTML=`<small>${escape(guide.areaNote)}</small><h4>${escape(item.name)}</h4><div class="island-price"><strong>¥${item.amount.toLocaleString('zh-CN')}${stage===2?'起':''}</strong><span>${item.priceType}${stage===2?' / 间夜':' / 人'}</span></div><p class="island-address">${escape(item.address)}</p>${stage===1?`<p><b>${escape(item.dish)}</b> · ${escape(item.intro)}</p>${fp?`<figure><img src="${escape(fp.src)}" alt="鼓浪屿沙茶面菜品参考" decoding="async"><figcaption>菜品参考，非该店出品承诺 · <a href="${escape(fp.source)}" target="_blank" rel="noopener noreferrer">${escape(fp.author)} · ${escape(fp.license)}</a></figcaption></figure>`:''}`:`<p>${escape(item.area)}</p><dl><dt>房型参考</dt><dd>${escape(item.room)}</dd><dt>设施资料</dt><dd>${escape(item.features)}</dd><dt>入住资料</dt><dd>${escape(item.checkin)}</dd></dl>`}<p class="travel-notice">${escape(item.note)}</p><small>查询日期 ${hospitalityCheckedOn} · ${priceFreshness()}</small><div class="travel-sources"><a href="${escape(item.source)}" target="_blank" rel="noopener noreferrer">${stage===2?'核对日期、房价与房型':'查看商户与价格来源'} ↗</a>${item.addressSource?`<a href="${escape(item.addressSource)}" target="_blank" rel="noopener noreferrer">地址来源 ↗</a>`:''}</div>`;
  }
  story.querySelectorAll('a').forEach(a=>a.addEventListener('click',()=>tour.pause()));
 }
 const options=(value,live=false)=>(live?`<option value="live" ${value==='live'?'selected':''}>我的实时位置</option>`:'')+allPlaces.filter(p=>!p.walkingUnavailable).map(p=>`<option value="${p.id}" ${p.id===value?'selected':''}>${escape(p.name)}</option>`).join('');
 function renderLocation(){
  content.innerHTML=`<div class="location-toggle"><label><input id="travel-location-enabled" type="checkbox" ${locationState.enabled?'checked':''}> 实时定位</label><label><input id="travel-follow" type="checkbox" ${follow?'checked':''}> 跟随位置</label></div><p id="travel-location-status" role="status"></p><p id="travel-location-metrics"></p><p class="travel-notice">位置仅在本机处理，不上传。关闭定位后停止记录，旅行时间轴可在“足迹”查看、保存或删除。手机需 HTTPS 与定位许可；锁屏或切后台可能暂停记录。</p><div class="travel-compass-actions"></div><hr><h3>去哪里</h3><label class="travel-field">起点<select id="travel-origin">${options(origin,true)}</select></label><label class="travel-field">终点<select id="travel-destination">${options(destination)}</select></label><label class="travel-field">跨海乘船方案<select id="travel-ferry">${Object.entries(ferryOptions).map(([id,f])=>`<option value="${id}" ${ferry===id?'selected':''}>${escape(f.name)}</option>`).join('')}</select></label><p id="travel-ferry-note" class="travel-notice">${escape(ferryOptions[ferry].note)}</p><div class="travel-route-actions"></div><p class="route-result" role="status"></p><p class="travel-notice">绿线沿现有步行路网；蓝线为实际轨迹；橙色虚线仅示意跨海连接。路线终点是景点参考点或附近道路，实际入口、台阶与通行情况以现场为准。</p><div class="travel-sources">${sourceLinks(['ticket','ferryUpdate'])}<a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noopener noreferrer">路网：© OpenStreetMap / OpenFreeMap，2026-09-13</a></div>`;
  content.querySelector('#travel-location-enabled').onchange=e=>{
   if(e.target.checked){if(!window.isSecureContext){e.target.checked=false;setResult('浏览器定位需要 HTTPS 或本机 localhost。请改用安全地址。');return;}follow=true;origin='live';content.querySelector('#travel-origin').value='live';content.querySelector('#travel-follow').checked=true;session.start();}
   else{follow=false;disableCompass();session.stop();content.querySelector('#travel-follow').checked=false;setResult('已停止定位；在“足迹”查看或删除本次旅行记录。');}
  };
  content.querySelector('#travel-follow').onchange=e=>{follow=e.target.checked;if(follow&&locationState.status==='active')focus(locationState.position.ll,.12,450);};
  const preferences=document.createElement('label');preferences.className='walking-preference';preferences.innerHTML=`<input type="checkbox" id="walking-avoid-steps" ${avoidSteps?'checked':''}> 避开已标注楼梯`;
  content.querySelector('.travel-route-actions').before(preferences);
  preferences.querySelector('input').onchange=e=>{avoidSteps=e.target.checked;invalidateRoute();};
  const guide=document.createElement('section');guide.className='walking-directions';guide.setAttribute('aria-label','分段步行指引');content.querySelector('.route-result').after(guide);
  content.querySelector('#travel-origin').onchange=e=>{origin=e.target.value;invalidateRoute();};
  content.querySelector('#travel-destination').onchange=e=>{destination=e.target.value;invalidateRoute();};
  content.querySelector('#travel-ferry').onchange=e=>{ferry=e.target.value;invalidateRoute();content.querySelector('#travel-ferry-note').textContent=ferryOptions[ferry].note;};
  const compass=iconButton('启用设备罗盘方向',Compass,enableCompass,'travel-compass');compass.append(orientationOn?'罗盘已开启':'启用罗盘');content.querySelector('.travel-compass-actions').append(compass);
  const route=iconButton('显示参考路线',Route,()=>void planDestination(),'travel-plan');route.className='travel-primary';route.append('显示参考路线');
  const clear=iconButton('清除参考路线',X,()=>{invalidateRoute();setResult('参考路线已清除，实际轨迹保留至关闭定位。');});content.querySelector('.travel-route-actions').append(route,clear);updateLocationText();renderGuidance();
 }
 function invalidateRoute(){routeVersion++;currentPlan=null;map.route([]);progress={status:'unavailable'};renderGuidance();setResult('起终点或偏好已变更，请重新计算路线。');}
 function renderGuidance(){
  renderWalkingPanel(content.querySelector('.walking-directions'),currentPlan,d=>{follow=false;const f=content.querySelector('#travel-follow');if(f)f.checked=false;map.highlight(d.points);fitLegs([{points:d.points}],.08);});updateProgress();
 }
 function updateProgress(){progress=routeProgress(currentPlan,locationState.position,locationState.status);updateWalkingPanel(content.querySelector('.walking-directions'),progress,currentPlan);}
 function updateLocationText(){
  const s=locationState,el=content.querySelector('#travel-location-status');if(!el)return;el.textContent=statusText[s.status]||s.status;
  content.querySelector('#travel-location-enabled').checked=s.enabled;
  let text=s.position?`设备报告精度约 ${Math.round(s.position.accuracy)} 米`:'等待设备授权与卫星/网络定位。';
  if(s.heading!==null)text+=` · ${s.headingSource==='compass'?'设备朝向':'移动方向'} ${Math.round(s.heading)}°`;
  else if(s.position)text+=' · 移动后显示行进方向，或主动启用罗盘';
  if(s.status==='denied')text='请在浏览器地址栏的站点权限中允许定位，再开启此开关。';
  if(s.status==='outside')text+=' · 不会把你吸附到厦门。地图只显示已覆盖范围。';
  content.querySelector('#travel-location-metrics').textContent=text;
 }
 function orientation(event){let heading=null;if(Number.isFinite(event.webkitCompassHeading))heading=event.webkitCompassHeading;else if(event.absolute&&Number.isFinite(event.alpha))heading=360-event.alpha;if(heading!==null)session.compass(heading);}
 function disableCompass(){orientationOn=false;window.removeEventListener('deviceorientation',orientation);window.removeEventListener('deviceorientationabsolute',orientation);}
 async function enableCompass(){
  if(!locationState.enabled){setResult('请先开启实时定位。');return;}
  try{
   if(!window.DeviceOrientationEvent)throw new Error();
   const permission=typeof DeviceOrientationEvent.requestPermission==='function'?await DeviceOrientationEvent.requestPermission(true):'granted';
   if(permission!=='granted'){setResult('罗盘权限未获允许，仍可通过移动轨迹判断方向。');return;}
   if(!locationState.enabled)return;
   window.addEventListener('deviceorientation',orientation);window.addEventListener('deviceorientationabsolute',orientation);orientationOn=true;
   setResult('等待设备返回绝对朝向。罗盘可能受磁场干扰，移动方向仍以定位轨迹为参考。');
  }catch{setResult('此设备未提供罗盘，移动一段距离后可显示行进方向。');}
 }
 function setResult(text){const el=content.querySelector('.route-result');if(el)el.textContent=text;}
 async function planDestination(fit=true){
  const request=++routeVersion;setResult('正在计算本地参考路线…');
  currentPlan=null;map.route([]);renderGuidance();
  try{
   await load();if(request!==routeVersion)return;
   let from=point(origin),to=point(destination);
   if(origin==='live'){
    if(locationState.status!=='active'){map.route([]);currentPlan=null;setResult('请先获得范围内、精度足够的实时位置；也可以选一个景点作为起点。');return;}
    from={ll:locationState.position.ll,island:island(locationState.position.ll)};
    const xz=toWorld(...from.ll);
    if(waterAt(...xz)!==null){
     const near=router.nearest(from.ll);
     if(!near||near.distance>12){setResult('当前位置可能在水面上：保留实际轨迹和方向，不生成水面步行路线。请按船票和船员指引航行。');return;}
     if(!shoreConfirmedAt||distanceMeters(shoreConfirmedAt,from.ll)>30){
      setResult('位置接近码头或岸边步道，底图和GPS无法区分你在船上还是已经上岸。船上请继续按船员指引航行。');
      const confirm=iconButton('确认已上岸后查看步行路线',Route,()=>{shoreConfirmedAt=[...from.ll];void planDestination();},'confirm-ashore');confirm.className='travel-primary';confirm.append('我已上岸，查看步行路线');content.querySelector('.route-result')?.append(confirm);return;
     }
    }
   }
   const plan=router.plan(from.access||from.ll,to.access||to.ll,{ferry,fromIsland:!!from.island,toIsland:!!to.island,avoidSteps});currentPlan=plan;map.route(plan.legs);renderGuidance();lastRouteTime=Date.now();lastRoutePosition=locationState.position?.ll;
   if(plan.error){setResult(plan.error);return;}
   const snap=Math.max(0,...plan.legs.map(l=>l.snap||0));
   setResult(`${plan.incomplete?'部分步行段缺少连通数据，未画直线补齐。':'参考步行长度约 '+Math.round(plan.meters)+' 米。'}${plan.ferry?' 包含轮渡示意，不计入步行长度。':''}${snap>20?' 端点距参考点约 '+Math.round(snap)+' 米，须现场找入口。':''} 非实时导航。`);
   if(fit){fitLegs(plan.legs);content.querySelector('.walking-directions')?.scrollIntoView({block:'start',behavior:'smooth'});}
  }catch{setResult('路线数据载入失败，请重试。');}
 }
 async function planItinerary(itinerary){
  const request=++routeVersion;setResult('正在计算道路参考…');
  try{await load();if(request!==routeVersion)return;const legs=[];let missing=0;
   for(let i=1;i<itinerary.stops.length;i++){const a=point(itinerary.stops[i-1]),b=point(itinerary.stops[i]),leg=router.walk(a.access||a.ll,b.access||b.ll);if(leg.error)missing++;else legs.push(leg);}
   map.route(legs);currentPlan={legs};fitLegs(legs);setResult(`${itinerary.name}：已显示 ${legs.length} 段道路参考。${missing?'另有 '+missing+' 段连通数据不足，未用直线代替。':''} 路网不含实时封闭或入口核验。`);
  }catch{setResult('路线资料未能载入，请重试。');}
 }
 function fitLegs(legs,minimum=.12){const pts=(legs||[]).flatMap(l=>l.points||[]);if(!pts.length)return;const xs=pts.map(p=>p[0]),ys=pts.map(p=>p[1]),minx=Math.min(...xs),maxx=Math.max(...xs),miny=Math.min(...ys),maxy=Math.max(...ys);focus([(minx+maxx)/2,(miny+maxy)/2],Math.max(minimum,(maxx-minx)*101*.6,(maxy-miny)*111*.6),800);}
 function fitDocks(){follow=false;fitLegs([{points:travelPlaces.filter(p=>p.area==='ferry').map(p=>p.ll)}],.5);}
 controls.addEventListener('start',()=>{tour.pause();follow=false;const input=content.querySelector('#travel-follow');if(input)input.checked=false;});
 document.addEventListener('visibilitychange',()=>{if(document.hidden)session.suspend();else session.resume();});
 window.addEventListener('pagehide',()=>{disableCompass();session.stop();tripPanel.flush();});
 document.addEventListener('keydown',e=>{if(e.key==='Escape'&&opened)hide();});
 let tick=0;
 return {open,showPlace,syncTour,closeForTour:(pause=true)=>{tourPresentation=false;if(pause)tour.pause();tourCollapsed=false;placeTourBar();hide(false);},stopTour:()=>tour.pause(),update(){
  map.update();if(Date.now()-tick>1000){tick=Date.now();session.tick();}
  const occupied=[...document.querySelectorAll('.travel-drawer,.travel-tour-bar.floating,.travel-launch,.brand,.top-actions,.scene-settings,.sky-options,.scene-tools,.explore,.location-card,.bottom-center,.map-controls,.map-label:not([hidden]),.overview-label,.overview-catalog,.walking-map-label:not([hidden])')].filter(el=>el.offsetWidth&&getComputedStyle(el).visibility!=='hidden').map(el=>{const r=el.getBoundingClientRect();return [r.left,r.top,r.right,r.bottom];});
  const intersects=(r,o)=>r[0]<o[2]+5&&r[2]>o[0]-5&&r[1]<o[3]+5&&r[3]>o[1]-5;
  const priority=p=>Number((opened||tourPresentation)&&p.p.id===focusedPlace)*3+Number(opened&&p.p.id===selected)*2+Number(p.dock);
  const visibleHotels=view==='hotels'?new Set(filterHotels(hotelQuery,hotelZone).map(h=>h.id)):null;
  for(const {p,b,pos,dock,width} of [...pins].sort((a,b)=>priority(b)-priority(a))){
   const visibleArea=(tourPresentation&&p.id===focusedPlace)||(dock?(opened||labelsVisible()):opened&&(view==='island'?p.area!=='hotels'&&p.island&&(p.id===selected||filterIsland([p],category,query).length>0):view==='hotels'?p.area==='hotels'&&(selected?p.id===selected:visibleHotels.has(p.id)):selected?p.id===selected||p.area===view:view==='location'&&currentPlan?p.id===origin||p.id===destination:view==='routes'||view==='location'||p.area===view));
   if(!visibleArea){b.hidden=true;continue;}
   const projected=pos.clone().project(camera),x=(projected.x+1)*innerWidth/2,y=(1-projected.y)*innerHeight/2,h=dock?36:30;
   let w=width||100,r=[x-w/2,y-h,x+w/2,y],compact=false;
   if(dock&&(occupied.some(o=>intersects(r,o))||r[0]<8||r[2]>innerWidth-8)){compact=true;w=36;r=[x-w/2,y-h,x+w/2,y];}
   b.classList.toggle('compact',compact);b.classList.toggle('selected',(opened||tourPresentation)&&p.id===focusedPlace);
   b.hidden=occupied.some(o=>intersects(r,o))||projected.z>1||projected.z<-1||r[0]<8||r[2]>innerWidth-8||r[1]<8||y>innerHeight-8;
   if(!b.hidden){b.style.left=x+'px';b.style.top=y+'px';occupied.push(r);}
  }
 },getState:()=>({opened,view,selected,focusedPlace,hotels:mappedIslandHotels.length,hotelProfiles:mappedIslandHotels.filter(h=>h.profile).length,places:travelPlaces.length,islandPlaces:filterIsland(travelPlaces).length,tour:{...tour.getState(),presentation:tourPresentation,stage:presentationStage,collapsed:tourCollapsed,scope:tourScope},photos:Object.keys(photos).length,routerReady:!!router,history:tripPanel.getState(),location:{enabled:locationState.enabled,status:locationState.status,hasHeading:locationState.heading!==null,trackPoints:locationState.trail.length,follow},...map.getState()})};
}
