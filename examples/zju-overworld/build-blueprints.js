import * as THREE from './vendor/three.module.js';
import {HOUSE_BLUEPRINTS} from './house-blueprints.js?v=11';
import {createBuildVisuals} from './block-models.js?v=11';
const $=id=>document.getElementById(id),key=b=>`${b.x},${b.y},${b.z}`;
export const blueprintMethods={
 bindBlueprints(){
  for(const blueprint of HOUSE_BLUEPRINTS){const b=document.createElement('button');b.textContent=blueprint.name;b.onclick=()=>{this.clearBlueprint();this.blueprint=blueprint;this.blueprintPreview=createBuildVisuals(THREE);this.world.add(this.blueprintPreview.group);$('blueprint-details').open=true;this.env.toast('对准空地预览房屋，O 旋转，P 或右键放置。');};$('blueprint-choices').append(b);}
  $('blueprint-place').onclick=()=>{this.updateBuildingAim(0);this.placeBlueprint();};$('blueprint-cancel').onclick=()=>this.clearBlueprint();
 },
 clearBlueprint(){this.blueprint=null;this.blueprintTarget=null;this.blueprintBlocks=null;this.blueprintPreview?.dispose();this.blueprintPreview=null;$('blueprint-place').disabled=true;return true;},
 updateBlueprintAim(nearest){
  this.buildVisuals.setPreview(null);const b=this.blueprint;if(!b)return;const p=nearest?.point;
  if(!p){this.blueprintTarget=null;this.blueprintBlocks=null;this.blueprintPreview.group.visible=false;$('blueprint-status').textContent='对准10米以内的开阔地面';$('build-status').textContent='模板预览 · 请往远一点的空地看';$('blueprint-place').disabled=true;return;}
  const x=Math.floor(p.x),z=Math.floor(p.z),target=`${b.id}:${x}:${z}:${this.buildRotation}:${this.buildRevision}`;
  if(target===this.blueprintTarget)return;this.blueprintTarget=target;
  const mid=b.id==='wood-cabin-7'?3:4,angle=this.buildRotation*Math.PI/2,c=Math.cos(angle),s=Math.sin(angle);
  this.blueprintBlocks=b.blocks.map(q=>{const n={...q,x:x+Math.round((q.x-mid)*c+(q.z-mid)*s),z:z+Math.round(-(q.x-mid)*s+(q.z-mid)*c),rotation:((q.rotation||0)+this.buildRotation)%4,open:q.open===true};n.id=key(n);return n;});
  let error=this.buildBlocks.size+this.blueprintBlocks.length>6000?'方块总数不能超过6000块':'';const next=new Map(this.buildBlocks);
  if(!error)for(const q of this.blueprintBlocks){error=this.buildCellFree(q,next);if(error)break;next.set(q.id,q);}
  this.blueprintError=error;this.blueprintPreview.setBlocks(this.blueprintBlocks);this.blueprintPreview.group.visible=true;
  this.blueprintPreview.group.traverse(o=>{if(o.isLight)o.visible=false;if(o.isMesh){o.castShadow=false;const ms=Array.isArray(o.material)?o.material:[o.material];for(const m of ms){m.transparent=true;m.opacity=.27;m.depthWrite=false;m.color.set(error?'#d77c62':'#91d4be');}}});
  $('blueprint-place').disabled=!!error;$('blueprint-status').textContent=error||`${b.name} · ${b.blocks.length} 块 · P 放置 / O 旋转`;$('build-status').textContent=error||'模板可放置 · 右键 / P 建成';$('build-place').disabled=!!error;$('build-remove').disabled=true;
 },
 placeBlueprint(){
  if(!this.buildMode||!this.blueprintBlocks||this.blueprintError){this.env.toast(this.blueprintError||'先对准空地预览整栋房屋。');return false;}
  const next=new Map(this.buildBlocks);for(const b of this.blueprintBlocks){const error=this.buildCellFree(b,next);if(error){this.env.toast(error);return false;}next.set(b.id,b);}
  const batch=this.blueprintBlocks.map(b=>({...b}));this.buildBlocks=next;this.buildUndo.push({batch});if(this.buildUndo.length>150)this.buildUndo.shift();this.clearBlueprint();this.refreshBuilding();this.env.toast('房屋已建成！走上门前台阶，按 E 开门，可以布置自己的校园小屋。');return true;
 }
};

