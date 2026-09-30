import * as THREE from './vendor/three.module.js';
import {BUILD_PROPS,appendBuildProp} from './build-props.js?v=11';
import {createBuildVisuals} from './block-models.js?v=11';
const $=id=>document.getElementById(id),types=['wood','brick','stone','white','roof','glass','door','window','lamp','bed','workbench','bookshelf','fence','step'],names=['木板','红砖','石材','白墙','屋顶','玻璃','房门','窗户','灯具','床','工作台','书架','围栏','半高台阶'];
const key=b=>`${b.x},${b.y},${b.z}`,height=b=>BUILD_PROPS[b.type]?.height??(b.type==='door'?2:1);
const pointSegment=(x,z,ax,az,bx,bz)=>{const dx=bx-ax,dz=bz-az,t=THREE.MathUtils.clamp(((x-ax)*dx+(z-az)*dz)/(dx*dx+dz*dz||1),0,1);return Math.hypot(x-ax-t*dx,z-az-t*dz);};
export const buildingMethods={
 makeFreeBuilding(){
  this.buildRevision=0;this.buildPropVisuals=[];this.buildBlocks=new Map();this.buildUndo=[];this.buildType='wood';this.buildRotation=0;this.buildVisuals=createBuildVisuals(THREE);this.world.add(this.buildVisuals.group);
  $('build-start').onclick=()=>this.toggleBuilding();$('build-close').onclick=()=>this.toggleBuilding(false);$('build-place').onclick=()=>this.editBuilding('place');$('build-remove').onclick=()=>this.editBuilding('remove');$('build-rotate').onclick=()=>this.rotateBuilding();$('build-undo').onclick=()=>this.undoBuilding();$('build-save').onclick=()=>this.saveBuilding();$('build-load').onclick=()=>$('build-file').click();$('build-file').onchange=async e=>{const file=e.target.files[0];if(file)await this.loadBuilding(file);e.target.value='';};
  $('build-flight').onclick=()=>{this.setMode(this.mode==='fly'?'walk':'fly');this.keys.clear();this.syncBuildUI();};$('build-empty').onclick=()=>this.findBuildingGround();
  for(const [i,t] of types.entries()){const b=document.createElement('button');b.textContent=`${i<9?i+1+' ':''}${names[i]}`;b.dataset.material=t;b.onclick=()=>{this.clearBlueprint();this.buildType=t;this.syncBuildUI();};$('build-materials').append(b);}
  this.bindBlueprints();this.syncBuildUI();
 },
 toggleBuilding(force){
  const active=force??!this.buildMode;if(active===!!this.buildMode)return;
  if(active){this.stopSportsGame();if(this.ride)this.leaveVehicle(true);if(this.room)this.leaveBuilding();if(this.seated)this.stand();this.cancelNavigation();this.autoRun=false;this.demo=null;this.buildPreviousMode=this.mode;this.setMode('walk');this.pitch=-.25;this.mouseLook=true;$('mouse-look-toggle').checked=true;$('place-card').hidden=true;$('campus-life-nav').classList.add('collapsed');}
  if(!active)this.clearBlueprint();this.buildMode=active;document.body.classList.toggle('building-mode',active);$('build-panel').hidden=!active;$('build-crosshair').hidden=!active;this.keys.clear();this.buildVisuals.setPreview(null);if(!active){document.exitPointerLock?.();if(this.mode==='fly')this.setMode('third');}this.syncBuildUI();
 },
 syncBuildUI(message){
  $('build-count').textContent=`${this.buildBlocks.size} / 6000 块`;$('build-undo').disabled=!this.buildUndo.length;
  for(const b of $('build-materials').children){const active=b.dataset.material===this.buildType;b.classList.toggle('active',active);b.setAttribute('aria-pressed',String(active));}
  $('build-rotate').textContent=`旋转 ${this.buildRotation*90}° · O`;$('build-flight').textContent=this.mode==='fly'?'落地行走':'飞行搭高处';if(message)$('build-status').textContent=message;
 },
 rotateBuilding(){this.buildRotation=(this.buildRotation+1)%4;this.syncBuildUI();},
 buildingKey(e){
  if(e.code==='KeyI'&&!e.repeat){this.toggleBuilding();e.preventDefault();return true;}
  if(!this.buildMode)return false;
  if(e.code==='Escape'){this.toggleBuilding(false);e.preventDefault();return true;}
  if(e.repeat)return ['KeyO','KeyP','Delete','KeyE'].includes(e.code);
  if(/^Digit[1-9]$/.test(e.code)){this.clearBlueprint();this.buildType=types[Number(e.code.slice(-1))-1];this.syncBuildUI();e.preventDefault();return true;}
  if(e.code==='KeyO'){this.rotateBuilding();return true;}if(e.code==='KeyP'){this.editBuilding('place');return true;}if(e.code==='Delete'){this.editBuilding('remove');return true;}
  if((e.ctrlKey||e.metaKey)&&e.code==='KeyZ'){this.undoBuilding();e.preventDefault();return true;}
  return false;
 },
 buildCellFree(b,blocks=this.buildBlocks){
  if(!types.includes(b.type)||![b.x,b.y,b.z,b.rotation].every(Number.isInteger)||b.rotation<0||b.rotation>3||b.y<0||b.y+height(b)>32)return '高度范围为地面至32米';
  const bounds=this.env.bounds;if(b.x<bounds[0]||b.z<bounds[1]||b.x+1>bounds[2]||b.z+1>bounds[3])return '请在校园范围内建造';
  for(const q of blocks.values())if(q.x===b.x&&q.z===b.z&&b.y<q.y+height(q)&&b.y+height(b)>q.y)return '这里已经有方块';
  for(const dx of [.05,.5,.95])for(const dz of [.05,.5,.95]){const x=b.x+dx,z=b.z+dz;if(this.env.buildings.some(f=>this.env.contains(f,x,z)))return '请留出原有建筑';if(this.env.waters.some(f=>this.env.contains(f,x,z)))return '请在陆地上建造';if(this.env.roads.some(r=>this.env.nearLine(x,z,r.p)<(r.width||3)/2+.65))return '请留出道路';}
  const p=this.position;if(!this.room&&p.x>b.x-.28&&p.x<b.x+1.28&&p.z>b.z-.28&&p.z<b.z+1.28&&p.y+1.6>.16+b.y&&p.y<.16+b.y+height(b))return '先离开这个格子再放置';
  return '';
 },
 updateBuildingAim(dt){
  this.buildVisuals?.update(dt);if(!this.buildMode||this.room||this.mapExpanded){this.buildVisuals?.setPreview(null);return;}
  const ray=new THREE.Raycaster();ray.setFromCamera(new THREE.Vector2(0,0),this.camera);ray.far=10;const hitPoint=new THREE.Vector3();let nearest=null,best=10;
  for(const b of this.buildBlocks.values()){if(Math.hypot(b.x-this.position.x,b.z-this.position.z)>13)continue;const box=new THREE.Box3(new THREE.Vector3(b.x,.16+b.y,b.z),new THREE.Vector3(b.x+1,.16+b.y+height(b),b.z+1)),point=ray.ray.intersectBox(box,hitPoint);if(!point)continue;const d=point.distanceTo(ray.ray.origin);if(d<best){best=d;const p=point.clone(),ds=[Math.abs(p.x-b.x),Math.abs(p.x-b.x-1),Math.abs(p.y-.16-b.y),Math.abs(p.y-.16-b.y-height(b)),Math.abs(p.z-b.z),Math.abs(p.z-b.z-1)],idx=ds.indexOf(Math.min(...ds)),norm=[[-1,0,0],[1,0,0],[0,-1,0],[0,1,0],[0,0,-1],[0,0,1]][idx];nearest={block:b,point:p,normal:new THREE.Vector3(...norm)};}}
  if(!nearest){const point=ray.ray.intersectPlane(new THREE.Plane(new THREE.Vector3(0,1,0),-.16),hitPoint);if(point&&point.distanceTo(ray.ray.origin)<=10)nearest={point:point.clone(),normal:new THREE.Vector3(0,1,0)};}
  this.buildHit=nearest;if(this.blueprint){this.updateBlueprintAim(nearest);return;}let b=null;if(nearest){const p=nearest.point.clone().addScaledVector(nearest.normal,.03);b={x:Math.floor(p.x),y:Math.max(0,Math.floor(p.y-.16)),z:Math.floor(p.z),type:this.buildType,rotation:this.buildRotation,open:false};}
  this.buildCandidate=b;this.buildInvalid=b?this.buildCellFree(b):'对准10米以内的地面或方块';this.buildVisuals.setPreview(b?{...b,height:height(b),valid:!this.buildInvalid}:null);
  const message=b?this.buildInvalid||`${names[types.indexOf(b.type)]} · 第 ${b.y+1} 层 · 右键 / P 放置`:this.buildInvalid;if($('build-status').textContent!==message)$('build-status').textContent=message;
  $('build-place').disabled=!b||!!this.buildInvalid;$('build-remove').disabled=!nearest?.block;
 },
 commitBuilding(before,after){
  if(before)this.buildBlocks.delete(key(before));if(after)this.buildBlocks.set(key(after),after);
  this.buildUndo.push({before:before?{...before}:null,after:after?{...after}:null});if(this.buildUndo.length>150)this.buildUndo.shift();this.refreshBuilding();
 },
 refreshBuilding(){this.buildRevision++;this.buildVisuals.setBlocks([...this.buildBlocks.values()]);for(const p of this.buildPropVisuals)p.dispose();this.buildPropVisuals=[];for(const b of this.buildBlocks.values())if(BUILD_PROPS[b.type])this.buildPropVisuals.push(appendBuildProp(THREE,this.world,b));this.env.renderer.shadowMap.needsUpdate=true;this.syncBuildUI();},
 editBuilding(action){
  if(!this.buildMode)return false;this.updateBuildingAim(0);if(this.blueprint)return action==='place'?this.placeBlueprint():this.clearBlueprint();
  if(action==='remove'){const b=this.buildHit?.block;if(!b)return false;this.commitBuilding(b,null);return true;}
  const b=this.buildCandidate;if(!b||this.buildInvalid){this.env.toast(this.buildInvalid||'先对准一个格子');return false;}if(this.buildBlocks.size>=6000){this.env.toast('已达到6000块，拆除一些后可以继续。');return false;}
  this.commitBuilding(null,{...b,id:key(b)});return true;
 },
 undoBuilding(){const edit=this.buildUndo[this.buildUndo.length-1];if(!edit)return false;if(edit.batch){for(const b of edit.batch)this.buildBlocks.delete(key(b));this.buildUndo.pop();this.refreshBuilding();return true;}if(edit.before&&!this.room&&this.buildBlockCollision(edit.before,this.position.x,this.position.y,this.position.z,true)){this.env.toast('先离开这个格子，再撤销恢复方块。');return false;}this.buildUndo.pop();if(edit.after)this.buildBlocks.delete(key(edit.after));if(edit.before)this.buildBlocks.set(key(edit.before),edit.before);this.refreshBuilding();return true;},
 buildPanelNear(){
  let best=null,d=2.5;for(const b of this.buildBlocks?.values()||[]){if(!['door','window'].includes(b.type))continue;const distance=Math.hypot(b.x+.5-this.position.x,b.z+.5-this.position.z);if(distance<d&&Math.abs(.16+b.y-this.position.y)<1.7){best=b;d=distance;}}return best;
 },
 toggleBuiltPanel(){const b=this.buildPanelNear();if(!b)return false;if(b.open&&this.buildBlockCollision({...b,open:false},this.position.x,this.position.y,this.position.z,true)){this.env.toast('请先离开门窗范围再关闭。');return true;}this.commitBuilding(b,{...b,open:!b.open});return true;},
 buildBlockCollision(b,x,y,z,forceClosed=false){
  const bottom=.16+b.y,top=bottom+height(b);if(y+1.5<=bottom+.04||y>=top-.04)return false;
  if(['door','window'].includes(b.type)){const rot=b.rotation*Math.PI/2,dx=x-b.x-.5,dz=z-b.z-.5,lx=dx*Math.cos(rot)-dz*Math.sin(rot),lz=dx*Math.sin(rot)+dz*Math.cos(rot),state=this.buildVisuals?.getPanelState?.(b.id||key(b)),angle=forceClosed?0:state?.angle??(b.open?-Math.PI/2:0);
   if(Math.abs(lz)<.33&&Math.abs(lx)>.39&&Math.abs(lx)<.8)return true;
   return pointSegment(lx,lz,-.44,0,-.44+.88*Math.cos(angle),-.88*Math.sin(angle))<.29;
  }return x>b.x-.25&&x<b.x+1.25&&z>b.z-.25&&z<b.z+1.25;
 },
 buildingCollision(x,y,z){if(this.room)return false;for(const b of this.buildBlocks?.values()||[])if(Math.abs(x-b.x-.5)<1.5&&Math.abs(z-b.z-.5)<1.5&&this.buildBlockCollision(b,x,y,z))return true;return false;},
 buildingSupport(x,z,y){let h=-Infinity;for(const b of this.buildBlocks?.values()||[]){const top=.16+b.y+height(b);if(!['door','window'].includes(b.type)&&x>b.x-.26&&x<b.x+1.26&&z>b.z-.26&&z<b.z+1.26&&top<=y+.05)h=Math.max(h,top);}return h;},
 tryBuildingStep(x,z){
  if(this.room||this.mode==='fly'||!this.grounded||this.velocityY>0)return;
  const target=[...this.buildBlocks.values()].filter(b=>['step','wood','stone','brick','white'].includes(b.type)&&x>b.x-.26&&x<b.x+1.26&&z>b.z-.26&&z<b.z+1.26).map(b=>.16+b.y+height(b)).filter(y=>y>this.position.y+.03&&y<=this.position.y+.52).sort((a,b)=>b-a)[0];
  if(target&&!this.isBlocked(x,target,z)){this.position.y=target;this.velocityY=0;}
 },
 findBuildingGround(){
  const p=this.position;let found=null;for(let radius=8;radius<=160&&!found;radius+=6)for(let i=0;i<24;i++){const x=Math.floor(p.x+Math.cos(i*Math.PI/12)*radius),z=Math.floor(p.z+Math.sin(i*Math.PI/12)*radius);let valid=true;for(const dx of [-3,0,3])for(const dz of [-3,0,3])if(this.buildCellFree({x:x+dx,z:z+dz,y:0,type:'wood',rotation:0})){valid=false;break;}if(valid){found={x,z};break;}}
  if(!found){this.env.toast('附近空间较小，请在地图上选择一块更开阔的草坪。');return false;}this.position.set(found.x+.5,.16,found.z+.5);this.yaw=0;this.pitch=-.35;this.resetMotion();this.snapCamera=true;this.env.toast('来到开阔地，向前看地面即可开始搭建。');return true;
 },
 saveBuilding(){
  const payload={format:'zju-campus-build',version:1,blocks:[...this.buildBlocks.values()]},url=URL.createObjectURL(new Blob([JSON.stringify(payload,null,2)],{type:'application/json'})),a=document.createElement('a');a.href=url;a.download='我的校园房屋.json';a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);this.syncBuildUI('房屋已导出；下次用“打开房屋”继续建造。');
 },
 async loadBuilding(file){
  try{if(file.size>2500000)throw Error('文件太大');const data=JSON.parse(await file.text());if(data.format!=='zju-campus-build'||data.version!==1||!Array.isArray(data.blocks)||data.blocks.length>6000)throw Error('房屋文件格式不正确');const next=new Map();
   for(const raw of data.blocks){if(!raw||typeof raw!=='object')throw Error('房屋文件含有无效方块');const b={x:raw.x,y:raw.y,z:raw.z,type:raw.type,rotation:raw.rotation,open:raw.open===true};const error=this.buildCellFree(b,next);if(error&&error!=='先离开这个格子再放置')throw Error(error);b.id=key(b);next.set(b.id,b);}
   this.buildBlocks=next;this.buildUndo=[];this.refreshBuilding();if(next.size){const b=next.values().next().value;this.position.set(b.x-2,.16,b.z+3);this.setMode('fly');this.position.y=Math.max(3,b.y+3);this.yaw=.2;this.pitch=-.4;}this.syncBuildUI(`已打开 ${next.size} 块房屋，可继续搭建。`);
  }catch(e){this.env.toast('未导入：'+e.message);}
 },
 getFreeBuildingState(){return {buildingMode:!!this.buildMode,placedBlocks:this.buildBlocks?.size||0,buildType:this.buildType,buildTarget:this.buildCandidate,buildError:this.buildInvalid};}
};
