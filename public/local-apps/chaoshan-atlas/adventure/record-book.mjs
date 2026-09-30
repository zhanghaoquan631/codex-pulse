import * as THREE from 'three';
import {REGION_RECORDS} from './region-records.mjs';
import {BOSS_CATALOG} from './boss-catalog.mjs';
import {createDemonBoss} from './boss-models.mjs';
import {recordAvailable} from './record-collection.mjs';

const portraits=new Map();
let portraitJob;
async function makePortraits(){
  if(portraitJob)return portraitJob;
  portraitJob=(async()=>{
    const renderer=new THREE.WebGLRenderer({antialias:true,preserveDrawingBuffer:true});
    renderer.setSize(400,400);renderer.outputColorSpace=THREE.SRGBColorSpace;
    const scene=new THREE.Scene();scene.background=new THREE.Color('#f5f0df');
    const camera=new THREE.OrthographicCamera(-2,2,2,-2,.1,30);
    try{
      for(const boss of BOSS_CATALOG){
        const model=createDemonBoss(boss.id);model.rotation.y=-.28;scene.add(model);model.updateMatrixWorld(true);
        const box=new THREE.Box3().setFromObject(model),size=box.getSize(new THREE.Vector3()),center=box.getCenter(new THREE.Vector3());
        const extent=Math.max(size.x,size.y,size.z)*.63;
        camera.left=-extent;camera.right=extent;camera.top=extent;camera.bottom=-extent;camera.updateProjectionMatrix();
        camera.position.set(center.x+.2,center.y+.22,center.z+10);camera.lookAt(center);
        renderer.render(scene,camera);portraits.set(boss.id,renderer.domElement.toDataURL('image/png'));scene.remove(model);
        await new Promise(resolve=>requestAnimationFrame(resolve));
      }
    }finally{renderer.dispose();renderer.forceContextLoss();}
  })();
  try{await portraitJob;}catch(error){portraitJob=null;throw error;}
}

export async function getBossPortrait(id){await makePortraits();return portraits.get(id)||null;}

export function installRecordBook({getState,onCollect,onOpen,onClose}){
  const dialog=document.createElement('dialog');dialog.id='record-book';dialog.className='record-book';
  dialog.setAttribute('aria-labelledby','record-title');
  dialog.innerHTML=`<header class="record-header"><div><small>潮汕行旅 / FIELD NOTES</small><h2 id="record-title">把走过的地方，收进一册。</h2></div><button type="button" class="record-close" aria-label="关闭收藏册">×</button></header>
    <nav class="record-tabs" aria-label="收藏分类"><button type="button" data-tab="regions" aria-pressed="true">地区手记 <b>${REGION_RECORDS.length}</b></button><button type="button" data-tab="bosses" aria-pressed="false">首领图鉴 <b>${BOSS_CATALOG.length}</b></button><span id="record-count"></span></nav>
    <p class="record-guide">抵达地区、击败首领后，可把对应记录收进收藏册。未解锁的卡片也可先预览。</p>
    <div class="record-layout"><div class="record-grid" aria-label="地区记录卡"></div><article class="record-detail" aria-live="polite"></article></div>
    <footer class="record-footer">地图采用已核实的公开地图资料，游戏地形与建筑含改编。${BOSS_CATALOG.length} 位首领均为原创虚构形象；可选小丑与原地区首领分别解锁收藏。</footer>`;
  document.body.append(dialog);
  let tab='regions',selected=REGION_RECORDS[0].id,disposed=false;
  const el=s=>dialog.querySelector(s),rows=()=>tab==='regions'?REGION_RECORDS:BOSS_CATALOG;
  function imageFor(item){
    if(tab==='regions'){const node=document.createElement('div');node.className='record-picture';node.innerHTML=item.iconSvg;return node;}
    if(portraits.has(item.id)){const node=document.createElement('img');node.className='record-picture';node.src=portraits.get(item.id);node.alt=item.name+' · 三维纸墨模型';return node;}
    const node=document.createElement('div');node.className='record-picture record-placeholder';node.textContent='描绘中…';return node;
  }
  function status(item,state){return state.collectedIds.includes(item.id)?'已收藏':recordAvailable(state,item.id)?'可收进':'待'+(tab==='regions'?'抵达':'击败');}
  function renderDetail(){
    const item=rows().find(r=>r.id===selected)||rows()[0],state=getState(),detail=el('.record-detail');
    detail.replaceChildren(imageFor(item));
    const heading=document.createElement('h3');heading.textContent=item.title||item.name;detail.append(heading);
    const subtitle=document.createElement('p');subtitle.className='record-subtitle';subtitle.textContent=item.subtitle||item.epithet;detail.append(subtitle);
    const description=document.createElement('p');description.textContent=item.details||item.description;detail.append(description);
    if(tab==='regions'){
      const coords=document.createElement('p');coords.className='record-coordinates';coords.textContent=`${item.region} · ${item.ll[1].toFixed(5)}° N / ${item.ll[0].toFixed(5)}° E`;detail.append(coords);
      const landmarks=document.createElement('p');landmarks.className='record-landmarks';landmarks.textContent=item.landmarks.join(' / ');detail.append(landmarks);
      const note=document.createElement('p');note.className='record-note';note.textContent=item.gameNote;detail.append(note);
      const link=document.createElement('a');link.href=item.sourceUrl;link.target='_blank';link.rel='noopener';link.textContent='查看地点依据 ↗';detail.append(link);
    }else{
      const tactic=document.createElement('p');tactic.className='record-tactic';tactic.textContent='应对线索 · '+item.weakness;detail.append(tactic);
      if(item.telegraphHint){const warning=document.createElement('p');warning.className='record-note';warning.textContent='出招预兆 · '+item.telegraphHint;detail.append(warning);}
      if(item.equipmentAdvice){const equipment=document.createElement('p');equipment.className='record-note';equipment.textContent='装备建议 · '+item.equipmentAdvice;detail.append(equipment);}
      const habitat=document.createElement('p');habitat.className='record-landmarks';habitat.textContent='出没地 · '+item.region;detail.append(habitat);
    }
    const collect=document.createElement('button');collect.type='button';collect.className='record-collect';collect.dataset.collect=item.id;
    const collected=state.collectedIds.includes(item.id),available=recordAvailable(state,item.id);
    collect.disabled=collected||!available;collect.textContent=collected?'✓ 已收进收藏册':available?'＋ 收进收藏册':tab==='regions'?'抵达此地后可收藏':'击败这只首领后可收藏';
    collect.addEventListener('click',()=>{onCollect(item.id);render();});detail.append(collect);
  }
  function render(){
    if(disposed)return;const state=getState();
    el('#record-count').textContent=`已收 ${state.collectedIds.length} / ${REGION_RECORDS.length+BOSS_CATALOG.length}`;
    dialog.querySelectorAll('[data-tab]').forEach(button=>button.setAttribute('aria-pressed',String(button.dataset.tab===tab)));
    const grid=el('.record-grid'),scroll=grid.scrollTop;grid.replaceChildren();grid.setAttribute('aria-label',`${rows().length} 张${tab==='regions'?'地区':'首领'}记录卡`);
    rows().forEach((item,i)=>{
      const button=document.createElement('button');button.type='button';button.className='record-card';button.dataset.record=item.id;button.setAttribute('aria-pressed',String(item.id===selected));
      const number=document.createElement('small');number.textContent=`${String(i+1).padStart(2,'0')} / ${item.region}`;button.append(number,imageFor(item));
      const name=document.createElement('strong');name.textContent=item.title||item.name;button.append(name);
      const badge=document.createElement('span');badge.className='record-badge';badge.textContent=status(item,state);button.append(badge);
      if(state.collectedIds.includes(item.id))button.classList.add('collected');
      button.addEventListener('click',()=>{selected=item.id;grid.querySelectorAll('[data-record]').forEach(b=>b.setAttribute('aria-pressed',String(b===button)));renderDetail();if(innerWidth<=700)el('.record-detail').scrollIntoView({block:'nearest'});});
      grid.append(button);
    });grid.scrollTop=scroll;renderDetail();
  }
  function close(){if(!dialog.open)return;dialog.close();onClose();}
  el('.record-close').addEventListener('click',close);
  dialog.addEventListener('cancel',event=>{event.preventDefault();close();});
  dialog.addEventListener('keydown',event=>event.stopPropagation());
  dialog.querySelectorAll('[data-tab]').forEach(button=>button.addEventListener('click',()=>{tab=button.dataset.tab;selected=rows()[0].id;render();}));
  return {
    get isOpen(){return dialog.open;},
    open(){if(dialog.open||onOpen()===false)return;render();dialog.showModal();el('.record-close').focus();void makePortraits().then(()=>{if(dialog.open)render();}).catch(()=>{if(dialog.open)el('.record-guide').textContent='模型预览暂时不可用，地区资料与收藏功能仍可使用。';});},
    close,refresh:render,dispose(){disposed=true;dialog.remove();},
  };
}
