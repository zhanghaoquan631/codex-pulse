import * as THREE from 'three';
import {createFoodViewer} from './food-viewer.mjs';
import {isShantouPlace} from './shantou-places.mjs';
import {isJieyangPlace,getJieyangCollection} from './jieyang-places.mjs';
import {searchPlaces} from './atlas-interaction.mjs';
import {createPlaceDetailViewer} from './place-detail-viewer.mjs';
import {mountUnifiedEntry} from './unified-entry.mjs';

export function attachFeatureUI({places,focusPlace,renderer,camera,landmarkGroup,life,social,onFilter=()=>{},pauseTour=()=>{}}){
  const provenance=document.createElement('p');
  provenance.textContent='地标、城市建筑群、林带和交通工具为艺术化微缩表现；街区支路、商铺与运动场景为设计演绎，不代表真实地址。河流沿用地图水域数据。机场为地理锚点，飞机与列车非实时班次；地铁仅为概念演示，不代表已运营线路。';
  document.querySelector('.about-note').before(provenance);
  const nav=document.getElementById('places');
  const layerNodes={};
  const tabs=document.createElement('div');tabs.className='feature-tabs';tabs.setAttribute('role','group');tabs.setAttribute('aria-label','地点类型');
  let category='landmark',allSearch=false,selecting=false;
  for(const [kind,title] of [['landmark','地方特色'],['shantou','汕头景点'],['jieyang','揭阳景点'],['island','南澳景点'],['jiexi','揭西景点'],['huilai','惠来景点'],['raoping','饶平景点'],['chaoan','潮安景点'],['chenghai','澄海景点'],['chaoyang','潮阳景点'],['chaonan','潮南景点'],['puning','普宁景点'],['district','全部地区'],['mountain','山岭'],['activity','街头生活'],['transport','交通'],['food','地方美食']]){
    const button=document.createElement('button');button.textContent=title;button.dataset.category=kind;
    button.onclick=()=>{category=kind;allSearch=false;search.value='';filter();};tabs.append(button);
  }
  nav.before(tabs);
  const search=document.createElement('input');search.type='search';search.className='place-search';search.placeholder='搜索地点';search.setAttribute('aria-label','搜索当前分类地点');search.maxLength=100;
  search.addEventListener('input',filter);nav.before(search);
  const scope=document.createElement('div');scope.className='tour-filter';
  for(const [all,title] of [[false,'当前分类'],[true,'全部地点']]){
    const b=document.createElement('button');b.textContent=title;b.dataset.all=String(all);b.onclick=()=>{allSearch=all;filter();};scope.append(b);
  }
  search.before(scope);
  search.addEventListener('keydown',event=>{if(event.key==='Enter'){event.preventDefault();event.stopPropagation();places.find(p=>!p.button.hidden)?.button.click();}if(event.key==='Escape'){search.value='';filter();}});
  const empty=document.createElement('p');empty.className='place-empty';empty.textContent='没有匹配的地点';empty.hidden=true;nav.after(empty);
  function filter(){
    const inCategory=p=>category==='jieyang'?isJieyangPlace(p):category==='shantou'?isShantouPlace(p):category==='island'?(p.kind==='island'||p.id==='lighthouse'):p.kind===category;
    const matches=p=>(allSearch||inCategory(p))&&searchPlaces(p,search.value);
    for(const p of places)p.button.hidden=!matches(p);
    const ordered=category==='jieyang'?[...getJieyangCollection(places),...places.filter(p=>!isJieyangPlace(p))]:category==='shantou'?[...places.filter(p=>p.id==='small-park'),...places.filter(p=>p.kind==='shantou'),...places.filter(p=>p.id==='nanao-nanao-bridge'),...places.filter(p=>p.name==='南澳岛'),...places.filter(p=>!matches(p))]:places;
    for(const p of ordered)nav.append(p.button);
    for(const b of tabs.children){
      const active=b.dataset.category===category;b.setAttribute('aria-pressed',String(active));
      if(active){const r=b.getBoundingClientRect(),t=tabs.getBoundingClientRect();if(r.top<t.top)tabs.scrollTop+=r.top-t.top;else if(r.bottom>t.bottom)tabs.scrollTop+=r.bottom-t.bottom;}
    }
    document.getElementById('place-count').textContent=places.filter(matches).length+'处';
    empty.hidden=places.some(matches);
    for(const b of scope.children)b.setAttribute('aria-pressed',String(b.dataset.all===String(allSearch)));
    search.setAttribute('aria-label',allSearch?'搜索全部潮汕地点':'搜索当前分类地点');
    if(!selecting)onFilter();
  }
  const detail=document.createElement('details');detail.className='feature-detail';detail.hidden=true;
  const summary=document.createElement('summary');summary.textContent='地点档案';
  const text=document.createElement('p'),tags=document.createElement('div'),link=document.createElement('a');
  tags.className='feature-tags';link.textContent='地方资料';link.target='_blank';link.rel='noopener noreferrer';
  const note=document.createElement('small');note.textContent='艺术化地标 · 非实测比例';
  detail.append(summary,tags,text,link,note);document.getElementById('location-card').append(detail);
  const foodViewer=createFoodViewer(),inspect=document.createElement('button');inspect.className='food-inspect';inspect.textContent='近看美食';inspect.hidden=true;
  document.getElementById('location-card').append(inspect);let selectedFood;
  inspect.onclick=()=>{pauseTour();if(selectedFood)foodViewer.open(selectedFood);};
  const photoViewer=createPlaceDetailViewer(),photos=document.createElement('button');photos.className='photo-inspect';photos.textContent='图片与介绍';photos.hidden=true;
  document.getElementById('location-card').append(photos);let selectedIndex=-1;
  const openDetails=index=>{if(!places[index])return;if(index!==selectedIndex)focusPlace(index);pauseTour();photoViewer.open(places[index]);};
  photos.onclick=()=>openDetails(selectedIndex);
  const community=document.createElement('button');community.className='community-open';community.textContent='街坊互动';community.hidden=!social;
  document.getElementById('location-card').append(community);community.onclick=()=>{pauseTour();social?.open(places[selectedIndex]);};
  const name=document.getElementById('location-name');name.setAttribute('role','button');name.tabIndex=0;name.title='查看图片与介绍';
  name.onclick=()=>openDetails(selectedIndex);name.addEventListener('keydown',e=>{if(e.key==='Enter'||e.key===' '){e.preventDefault();openDetails(selectedIndex);}});
  for(const [index,p] of places.entries()){
    p.button.onclick=()=>openDetails(index);p.button.title=p.name+' · 图片与介绍';
    p.label.onclick=()=>openDetails(index);p.label.setAttribute('aria-label',p.name+'，查看图片与介绍');
  }
  const viewChoices=document.createElement('div');viewChoices.className='scene-view-choices';document.getElementById('location-card').append(viewChoices);
  const card=document.getElementById('location-card'),mapControls=document.querySelector('.map-controls');
  const adventureEntry=mountUnifiedEntry({places,baseUrl:'./adventure/'});
  const actions=document.createElement('div');actions.className='location-actions';
  actions.append(inspect,photos,community);card.append(actions);
  const more=document.createElement('details'),moreTitle=document.createElement('summary');
  more.className='location-more';moreTitle.textContent='更多地点信息';
  more.append(moreTitle,detail,viewChoices);card.append(more);
  const mobileCard=window.matchMedia('(max-width:650px), (max-width:1000px) and (max-height:520px)');
  const syncCardMode=()=>{more.open=!mobileCard.matches;};
  mobileCard.addEventListener('change',syncCardMode);syncCardMode();
  const alignRegionalControls=()=>{
    mapControls.style.bottom='';mapControls.style.right='';
    if(innerWidth<=650||(innerWidth<=1000&&innerHeight<=520))return;
    const rect=card.getBoundingClientRect(),height=mapControls.getBoundingClientRect().height;
    if(rect.top>=height+134)mapControls.style.bottom=(innerHeight-rect.top+14)+'px';
    else{mapControls.style.bottom=(innerHeight-rect.bottom)+'px';mapControls.style.right=(innerWidth-rect.left+12)+'px';}
  };
  new ResizeObserver(alignRegionalControls).observe(card);
  window.addEventListener('resize',alignRegionalControls);
  function select(index){
    if(index!==selectedIndex&&mobileCard.matches)more.open=false;
    social?.setPlace?.(places[index]);
    adventureEntry.setPlace(places[index]);
    selectedIndex=index;photos.hidden=!places[index];
    const p=places[index],keepJieyang=category==='jieyang'&&isJieyangPlace(p),keepShantou=category==='shantou'&&p&&isShantouPlace(p);detail.hidden=!['landmark','island','shantou','jiexi','huilai','raoping','chaoan','chenghai','chaoyang','chaonan','puning','jieyang'].includes(p?.kind);
    card.dataset.region=p?.kind||'';requestAnimationFrame(alignRegionalControls);
    selectedFood=p?.kind==='food'?p:null;inspect.hidden=!selectedFood;
    viewChoices.replaceChildren();for(const [vi,view] of (p?.views?.length>1?p.views:[]).entries()){const b=document.createElement('button');b.textContent=view.name;b.onclick=()=>focusPlace(index,false,vi);viewChoices.append(b);}
    if(!detail.hidden){text.textContent=p.detail;tags.textContent=p.tags.join(' · ');link.href=p.source;category=p.kind==='jieyang'?'jieyang':p.kind==='puning'?'puning':p.kind==='chaonan'?'chaonan':p.kind==='chaoyang'?'chaoyang':p.kind==='chenghai'?'chenghai':p.kind==='chaoan'?'chaoan':p.kind==='raoping'?'raoping':p.kind==='huilai'?'huilai':p.kind==='jiexi'?'jiexi':p.kind==='shantou'||keepShantou?'shantou':p.kind==='island'||p.id==='lighthouse'&&category==='island'?'island':'landmark';}
    else if(p)category=p.kind;
    if(keepShantou)category='shantou';
    if(keepJieyang)category='jieyang';
    if(p&&!searchPlaces(p,search.value))search.value='';
    selecting=true;filter();selecting=false;
  }
  // A release after a drag must never select a landmark.
  const ray=new THREE.Raycaster(),pointer=new THREE.Vector2();let down;
  renderer.domElement.addEventListener('pointerdown',e=>{down={x:e.clientX,y:e.clientY,t:performance.now(),id:e.pointerId};});
  renderer.domElement.addEventListener('pointercancel',()=>{down=null;});
  renderer.domElement.addEventListener('pointerup',e=>{
    const start=down;down=null;
    if(!start||e.pointerId!==start.id||Math.hypot(e.clientX-start.x,e.clientY-start.y)>5||performance.now()-start.t>500)return;
    const rect=renderer.domElement.getBoundingClientRect();pointer.set((e.clientX-rect.left)/rect.width*2-1,-(e.clientY-rect.top)/rect.height*2+1);
    ray.setFromCamera(pointer,camera);const hit=ray.intersectObject(landmarkGroup,true)[0];
    if(hit){const i=places.findIndex(p=>p.id===hit.object.userData.landmarkId);if(i>=0)focusPlace(i);}
  });
  if(life){
    const options=document.createElement('div');options.className='life-options';
    for(const [name,nodes] of [['车流',[life.traffic.group,...life.streetLife.vehicleNodes]],['街景',[...life.streetLife.groups,life.regionalLife.group,life.cuisine.group,life.communityActivities.group,life.tourContext.group,...[life.nanaoSights,life.shantouSights,life.jiexiSights,life.huilaiSights,life.raopingSights,life.chaoanSights,life.chenghaiSights,life.chaoyangSights,life.chaonanSights,life.puningSights,life.jieyangSights].filter(Boolean).map(s=>s.streetLife.group)]],['山林',[life.woodland.group,life.rockfields.mesh,life.regionalEnvironment.forestGroup]],['航空轨道',[life.transport.group]]]){
      layerNodes[name]=nodes;
      const label=document.createElement('label'),input=document.createElement('input');input.type='checkbox';input.checked=true;input.setAttribute('aria-label',name);
      input.onchange=()=>{for(const node of nodes)node.visible=input.checked;};label.append(input,document.createTextNode(name));options.append(label);
    }
    const count=document.createElement('small');count.textContent=`${life.traffic.count+life.streetLife.vehicles+life.transport.stats.airportVehicles+life.tourContext.stats.vehicles} 辆车 · ${life.streetLife.people+life.regionalLife.count+life.transport.stats.passengers+life.cuisine.stats.people+life.tourContext.stats.people+life.communityActivities.stats.people+(life.nanaoSights?.stats.people||0)+(life.shantouSights?.stats.people||0)+(life.jiexiSights?.stats.people||0)+(life.huilaiSights?.stats.people||0)+(life.raopingSights?.stats.people||0)+(life.chaoanSights?.stats.people||0)+(life.chenghaiSights?.stats.people||0)+(life.chaoyangSights?.stats.people||0)+(life.chaonanSights?.stats.people||0)+(life.puningSights?.stats.people||0)+(life.jieyangSights?.stats.people||0)} 位人物`;options.append(count);nav.after(options);
  }
  filter();return {select,getTourSelection:()=>({indices:[...nav.children].filter(b=>!b.hidden).map(b=>places.findIndex(p=>p.button===b)),scope:allSearch?'全部地点':tabs.querySelector('[aria-pressed="true"]')?.textContent||'地点巡游'}),getLayers:()=>Object.fromEntries(Object.entries(layerNodes).map(([name,nodes])=>[name,{total:nodes.length,visible:nodes.filter(n=>n.visible).length}]))};
}
