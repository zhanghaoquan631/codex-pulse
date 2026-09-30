import {layouts,defaultLayoutSettings,normalizeLayoutSettings} from './live-composition.mjs';
const ids=['screen-inset','portrait'],key='lingan-live-layouts-v1';
export class LayoutPreferences{
  constructor(storage){
    this.storage=storage;let saved={};try{saved=JSON.parse(storage?.getItem(key)||'{}')||{};}catch{}
    this.values=Object.fromEntries(ids.map(id=>[id,normalizeLayoutSettings(id,saved[id])]));
  }
  get(id){return normalizeLayoutSettings(id,this.values[id]);}
  set(id,value){
    if(!ids.includes(id))throw Error('请选择可自定义的布局');
    this.values[id]=normalizeLayoutSettings(id,value);
    try{if(!this.storage)return false;this.storage.setItem(key,JSON.stringify(this.values));return true;}catch{return false;}
  }
  reset(id){return this.set(id,defaultLayoutSettings(id));}
}
export function createLayoutEditor({onChange=()=>{}}={}){
  const el=id=>document.getElementById(id),root=el('liveLayoutEditor'),stage=el('liveLayoutStage'),layoutSelect=el('liveLayoutChoice'),sourceSelect=el('liveLayoutSource'),fields=el('liveLayoutFields'),fit=el('liveLayoutFit'),status=el('liveLayoutStatus'),start=el('liveLayoutStart'),reset=el('liveLayoutReset');
  let storage;try{storage=localStorage;}catch{}
  const preferences=new LayoutPreferences(storage),controls={};let layoutId='portrait',source='camera',phase='idle',canStart=false,drag=null;
  for(const [name,label] of [['x','左右位置'],['y','上下位置'],['width','宽度'],['height','高度']]){
    const row=document.createElement('label');row.className='live-layout-field';row.append(document.createTextNode(label+'（%）'));
    const pair=document.createElement('span'),range=document.createElement('input'),number=document.createElement('input');pair.className='live-layout-field-pair';range.type='range';number.type='number';
    for(const input of [range,number]){input.min=name==='width'||name==='height'?'5':'0';input.max='100';input.step='0.1';input.setAttribute('aria-label',label+'百分比');input.addEventListener('input',()=>{if(input.value!==''&&Number.isFinite(Number(input.value)))change({[name]:Number(input.value)},input===number?number:null);});}
    number.addEventListener('change',()=>render());number.addEventListener('blur',()=>render());
    pair.append(range,number);row.append(pair);fields.append(row);controls[name]={range,number};
  }
  const boxes=Object.fromEntries(['screen','camera'].map(name=>[name,stage.querySelector('[data-layout-source="'+name+'"]')]));
  const current=()=>preferences.get(layoutId);
  function editable(){return ids.includes(layoutId)&&phase!=='finishing';}
  function render(keepInput){
    const custom=ids.includes(layoutId),layout=layouts[layoutId];root.querySelector('.live-layout-content').hidden=!custom;
    layoutSelect.value=layoutId;layoutSelect.disabled=phase!=='idle';start.disabled=!custom||phase!=='idle'||!canStart;reset.disabled=!editable();
    if(!custom){status.textContent='人物全屏使用默认画面。选择另外两种布局，可以调整屏幕与人物。';return;}
    const values=current(),box=values[source];stage.style.aspectRatio=layout.width+'/'+layout.height;stage.classList.toggle('is-portrait',layoutId==='portrait');
    for(const [name,node] of Object.entries(boxes)){const rect=values[name];Object.assign(node.style,{left:rect.x+'%',top:rect.y+'%',width:rect.width+'%',height:rect.height+'%'});node.classList.toggle('is-selected',source===name);node.setAttribute('aria-pressed',String(source===name));node.setAttribute('aria-label',(name==='screen'?'屏幕':'人物')+'画面，方向键移动，Shift 加方向键调整大小');node.tabIndex=editable()?0:-1;}
    sourceSelect.value=source;sourceSelect.disabled=!editable();fit.value=box.fit;fit.disabled=!editable();
    for(const [name,inputs] of Object.entries(controls)){
      const max=name==='x'?100-box.width:name==='y'?100-box.height:100;
      for(const input of Object.values(inputs)){input.max=String(Math.ceil(max*10)/10);if(input!==keepInput)input.value=String(Math.round(box[name]*10)/10);input.disabled=!editable();}
    }
    // Keep the layout thumbnails consistent with the geometry used by recording.
    const card=document.querySelector('[data-live-scene="'+layoutId+'"]');
    for(const name of ['screen','camera']){const node=card?.querySelector('.live-'+name),rect=values[name];if(node)Object.assign(node.style,{inset:'auto',left:rect.x+'%',top:rect.y+'%',width:rect.width+'%',height:rect.height+'%'});}
  }
  function change(patch,keepInput){
    if(!editable())return;const values=current();values[source]={...values[source],...patch};const saved=preferences.set(layoutId,values);render(keepInput);onChange(layoutId,current());
    status.textContent=saved?(phase==='idle'?'已自动保存此布局。下次打开仍会使用这些设置。':'调整已应用到录制画面，并自动保存。'):'调整已生效；此浏览器暂时无法保存设置。';
  }
  function setLayout(id){if(!layouts[id])return;layoutId=id;drag=null;render();status.textContent=ids.includes(id)?'拖动画面改变位置，拖右下角改变大小。此浏览器分别记住两种布局。':'人物全屏使用默认画面。选择另外两种布局，可以自定义。';}
  layoutSelect.addEventListener('change',()=>{if(phase!=='idle')return;setLayout(layoutSelect.value);window.LinganLiveScenes?.select(layoutId);});
  sourceSelect.addEventListener('change',()=>{source=sourceSelect.value;render();});fit.addEventListener('change',()=>change({fit:fit.value}));
  reset.addEventListener('click',()=>{if(!editable())return;const saved=preferences.reset(layoutId);render();onChange(layoutId,current());status.textContent=saved?'当前布局已恢复默认，另一种布局会保留。':'当前布局已恢复默认；此浏览器暂时无法保存设置。';});
  start.addEventListener('click',()=>{window.LinganLiveScenes?.select(layoutId);window.LinganRecorder?.start(layoutId);});
  stage.addEventListener('pointerdown',event=>{
    const node=event.target.closest('[data-layout-source]');if(!node||!editable()||event.button!==0)return;
    source=node.dataset.layoutSource;render();const rect=stage.getBoundingClientRect();drag={pointerId:event.pointerId,source,startX:event.clientX,startY:event.clientY,rect,box:current()[source],resize:Boolean(event.target.closest('[data-layout-resize]'))};node.setPointerCapture(event.pointerId);node.focus();event.preventDefault();
  });
  stage.addEventListener('pointermove',event=>{
    if(!drag||drag.pointerId!==event.pointerId||!editable())return;
    const dx=(event.clientX-drag.startX)/drag.rect.width*100,dy=(event.clientY-drag.startY)/drag.rect.height*100;
    change(drag.resize?{width:Math.min(100-drag.box.x,drag.box.width+dx),height:Math.min(100-drag.box.y,drag.box.height+dy)}:{x:drag.box.x+dx,y:drag.box.y+dy});event.preventDefault();
  });
  for(const name of ['pointerup','pointercancel','lostpointercapture'])stage.addEventListener(name,()=>{drag=null;});
  stage.addEventListener('keydown',event=>{
    const node=event.target.closest('[data-layout-source]'),direction={ArrowLeft:['x',-1],ArrowRight:['x',1],ArrowUp:['y',-1],ArrowDown:['y',1]}[event.key];if(!node||!direction||!editable())return;
    source=node.dataset.layoutSource;const [axis,step]=direction,field=event.shiftKey?(axis==='x'?'width':'height'):axis;change({[field]:current()[source][field]+step});event.preventDefault();
  });
  window.addEventListener('lingan-live-scene',event=>{if(phase==='idle')setLayout(event.detail);});
  let initial=document.querySelector('[data-live-scene].is-selected')?.dataset.liveScene||'portrait';setLayout(initial);
  // Render both remembered thumbnails before the user selects a card.
  for(const id of ids){layoutId=id;render();}layoutId=initial;render();
  return {settings:id=>preferences.get(id),setPhase(next,id,ready){phase=next;canStart=ready;if(next!=='idle'&&id)setLayout(id);else render();if(next==='finishing')status.textContent='正在保存录像，完成后可以继续调整。';}};
}
