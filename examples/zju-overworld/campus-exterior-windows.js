import * as THREE from './vendor/three.module.js';
import {createBuildingFacade} from './facade-windows.js?v=11';
import {clearGlass} from './glazing.js?v=11';
const $=id=>document.getElementById(id),dist=(a,b)=>Math.hypot(a.x-b.x,a.z-b.z);
export const exteriorWindowMethods={
 updateExteriorWindows(dt){
  this.facadeCache??=new Map();const p=this.position;
  const near=this.room?[]:this.env.buildings.filter(f=>Math.hypot(Math.max(f.box[0]-p.x,0,p.x-f.box[2]),Math.max(f.box[1]-p.z,0,p.z-f.box[3]))<100).map(f=>({f,d:Math.min(this.env.nearLine(p.x,p.z,f.p),...(f.h||[]).map(r=>this.env.nearLine(p.x,p.z,r)))})).filter(o=>o.d<100).sort((a,b)=>a.d-b.d).slice(0,6);
  // Build one facade at a time so entering a neighbourhood does not freeze movement.
  if(this.mode!=='aerial'){const missing=near.find(o=>!this.facadeCache.has(o.f.id));if(missing){const f=missing.f,facade=createBuildingFacade(THREE,{feature:f,contains:this.env.contains});for(const w of facade.windows){w.exterior=true;w.feature=f;if(f.exteriorWindowState?.[w.id])w.setAmount(1);}this.env.campus.add(facade.group);this.facadeCache.set(f.id,facade);this.makeFoyerCasements(f);}}
  for(const [id,facade] of this.facadeCache){const active=this.mode!=='aerial'&&near.some(o=>o.f.id===id);facade.group.visible=active;facade.feature.wallGroup.visible=!active;facade.setDetailed(active);facade.update(dt);}
  if(this.facadeCache.size>10){for(const [id,facade] of this.facadeCache){if(near.some(o=>o.f.id===id))continue;const f=facade.feature;f.exteriorWindowState=Object.fromEntries(facade.windows.filter(w=>w.open).map(w=>[w.id,true]));f.wallGroup.visible=true;facade.dispose();this.facadeCache.delete(id);if(this.facadeCache.size<=10)break;}}
  for(const f of this.glazedBuildings)for(const w of f.foyerCasements||[])w.update(dt);
 },
 makeFoyerCasements(f){
  if(!f.glazingGroup||f.foyerCasements)return;f.foyerCasements=[];const g=f.glazingGroup,d=f.entrance;
  for(const pane of [...g.children].filter(o=>o.isMesh&&o.material===clearGlass)){
   const x=pane.position.x,y=pane.position.y,z=pane.position.z;g.remove(pane);pane.geometry.dispose();const hinges=[];
   for(const sign of [-1,1]){const hinge=new THREE.Group();hinge.position.set(x+sign*1.7,y,z);g.add(hinge);const glass=new THREE.Mesh(new THREE.PlaneGeometry(1.65,2.0),clearGlass);glass.position.x=-sign*.85;hinge.add(glass);const frame=new THREE.LineSegments(new THREE.EdgesGeometry(new THREE.BoxGeometry(1.7,2.05,.07)),new THREE.LineBasicMaterial({color:0x54736c}));frame.position.x=-sign*.85;hinge.add(frame);hinges.push(hinge);}
   const center=this.doorWorld(d,x,z),insidePoint=this.doorWorld(d,x,-.9),outsidePoint=this.doorWorld(d,x,1.0),w={id:f.id+':foyer:'+x,feature:f,exterior:true,foyer:true,x:center.x,z:center.z,y:.15,floor:0,center:{...center,y:1.72},sill:.52,width:3.4,normal:d.normal,tangent:{x:Math.cos(d.angle),z:-Math.sin(d.angle)},insidePoint,outsidePoint,amount:0,open:false,setOpen(value){this.open=!!value;},get isPassable(){return this.amount>.92;},update(dt){this.amount+=(Number(this.open)-this.amount)*(1-Math.exp(-6*dt));if(Math.abs(this.amount-Number(this.open))<.0005)this.amount=Number(this.open);hinges.forEach((h,i)=>h.rotation.y=(i?1:-1)*this.amount*Math.PI*.54);}};f.foyerCasements.push(w);
  }
 },
 nearestExteriorWindow(){
  if(this.room||this.mode==='aerial'||this.buildMode)return null;let result=null,best=2.8;
  const candidates=[...this.facadeCache?.values()||[]].filter(f=>f.group.visible).flatMap(f=>[...f.windows,...f.feature.foyerCasements||[]]);
  for(const w of candidates){if(Math.abs(w.y-this.position.y)>1.7)continue;const d=dist(w.outsidePoint,this.position);if(d<best){best=d;result=w;}}return result;
 },
 updateExteriorWindowUI(){
  this.nearWindow=this.nearestExteriorWindow();const w=this.nearWindow;$('window-controls').hidden=!w&&!this.exteriorClimb;if(!w)return;
  $('window-toggle').disabled=!!this.exteriorClimb;$('window-toggle').textContent=w.open?'关闭外窗 · E':'打开外窗 · E';$('window-climb').disabled=!w.isPassable||!!this.exteriorClimb;$('window-climb').textContent='扶窗进入 · X';$('window-status').textContent=this.exteriorClimb?'正在扶窗进入':`${w.feature.name||'校园建筑'} · ${w.floor+1}楼外窗`;
 },
 beginExteriorClimb(){
  const w=this.nearWindow;if(!w?.exterior||!w.isPassable||this.exteriorClimb)return false;this.cancelNavigation();this.autoRun=false;this.keys.clear();this.stopSportsGame();this.exteriorClimb={window:w,elapsed:0,start:this.position.clone()};return true;
 },
 updateExteriorClimb(dt){
  const c=this.exteriorClimb;if(!c)return false;const w=c.window,t=Math.min(1,(c.elapsed+=dt)/2.8),ease=t*t*(3-2*t),end={x:w.x-w.normal.x*.75,z:w.z-w.normal.z*.75};this.position.x=THREE.MathUtils.lerp(c.start.x,end.x,ease);this.position.z=THREE.MathUtils.lerp(c.start.z,end.z,ease);this.position.y=THREE.MathUtils.lerp(c.start.y,w.y,ease)+Math.sin(Math.PI*t)*(w.sill+.55);this.heading=Math.atan2(-w.normal.x,-w.normal.z);this.velocityY=0;this.grounded=false;
  if(t>=1){this.exteriorClimb=null;this.enterBuilding(w.feature);const floor=Math.min(w.floor,this.room.floors-1),target=this.room.windows.find(q=>Math.abs(q.y-floor*3.6)<.1)||this.room.windows[0];this.currentFloor=floor;this.position.set(target?.insidePoint.x||-13,floor*3.6,target?.insidePoint.z||0);if(target){target.setOpen(true);this.position.x-=Math.sign(this.position.x)*.8;}this.velocityY=0;this.grounded=true;this.yaw=0;this.heading=Math.PI;this.updateFloorVisibility();this.lastPosition.copy(this.position);this.snapCamera=true;this.env.toast('已从窗户进入这一层，可以继续走动。');}return true;
 }
};
