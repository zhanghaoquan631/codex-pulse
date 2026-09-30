import {survivalMethods} from './campus-survival.js?v=11';
import {prepareCollapsePose} from './collapse-pose.js?v=11';
import {FILM_CAST,applyFilmAppearance} from './film-cast-models.js?v=11';
import * as THREE from './vendor/three.module.js';
import {exteriorWindowMethods} from './campus-exterior-windows.js?v=11';
import {blueprintMethods} from './build-blueprints.js?v=11';
import {buildingMethods} from './campus-building.js?v=11';
import { createAvatar, updateAvatar } from './avatar.js?v=11';
import {interiorActions} from './interior-actions.js?v=11';
import {trafficMethods} from './campus-traffic.js?v=11';
import {clearGlass,glazingMethods} from './glazing.js?v=11';
import {applyActionPose} from './action-pose.js?v=11';
import {applyOutfit} from './wardrobe.js?v=11';
import {characterMethods} from './character-system.js?v=11';
import {applyRole,updateRoleAction,resetRolePose} from './character-props.js?v=11';
import {applySwimPose,resetSwimPose} from './swimming-pose.js?v=11';
import {landmarkMapMethods} from './campus-map-landmarks.js?v=11';
import {playableSportsMethods} from './campus-playable-sports.js?v=11';
import {activityMethods} from './campus-activities.js?v=11';
import {interiorViewMethods} from './interior-view.js?v=11';
import {courseMethods} from './courses.js?v=11';
import {navigationMethods} from './campus-navigation.js?v=11';
import {indoorLifeMethods} from './indoor-life.js?v=11';
import {buildingMechanics} from './building-mechanics.js?v=11';
import {transportMethods} from './transport-system.js?v=11';
import {waterAirMethods} from './campus-water-air.js?v=11';
import {Atmosphere} from './atmosphere.js?v=11';

const $=id=>document.getElementById(id), clamp=THREE.MathUtils.clamp;
const v3=(x=0,y=0,z=0)=>new THREE.Vector3(x,y,z);
const distance=(a,b)=>Math.hypot(a.x-b.x,a.z-b.z);
const colors={wall:0xe8e5d9,wood:0xaa855b,floor:0xc3c6b5,teal:0x426966,metal:0x526768};
const materials=new Map();
function material(c){if(!materials.has(c))materials.set(c,new THREE.MeshStandardMaterial({color:c,roughness:.82}));return materials.get(c);}
function meshBox(parent,w,h,d,x,y,z,color){const m=new THREE.Mesh(new THREE.BoxGeometry(w,h,d),typeof color==='number'?material(color):color);m.position.set(x,y,z);m.castShadow=m.receiveShadow=true;parent.add(m);return m;}
function pointSegment(x,z,a,b){const dx=b.x-a.x,dz=b.z-a.z,t=clamp(((x-a.x)*dx+(z-a.z)*dz)/(dx*dx+dz*dz||1),0,1);return Math.hypot(x-a.x-t*dx,z-a.z-t*dz);}
function shortestAngle(a,b){return Math.atan2(Math.sin(b-a),Math.cos(b-a));}

export class CampusLife {
  constructor(env){
    this.env=env;this.world=env.scene;this.camera=env.camera;this.position=v3();this.heading=Math.PI;this.yaw=0;this.pitch=.38;this.cameraDistance=6.5;this.mode='aerial';this.variant='film-nolan';this.castSequence=0;this.doors=[];this.outdoorDoors=[];this.room=null;this.keys=env.keys;this.speed=0;this.velocityY=0;this.time=0;this.demo=null;this.seated=null;this.nearby=null;this.npcs=[];this.vehicles=[];this.crossings=[];this.currentFloor=0;this.lecture=null;this.trace=[];this.player=null;this.frame=0;this.portalCooldown=0;this.ready=false;this.lastPosition=v3();this.collisionReason='';this.demoHistory=[];this.runMode=false;this.sprintUntil=0;this.jumpBuffer=0;this.grounded=true;this.coyote=0;this.jumpCount=0;this.lastJumpHeight=0;this.jumpOrigin=0;this.glazedBuildings=[];this.autoRun=false;this.mouseLook=true;this.swimming=false;this.wasSwimming=false;
  }
  async init(){
    this.avatarSpec=await fetch('./avatar-spec.json?v=11').then(r=>r.json());
    this.lectures=await fetch('./lectures.json?v=11').then(r=>r.json());this.courseSubjects=await fetch('./courses.json?v=11').then(r=>r.json());this.courseResources=await fetch('./course-resources.json?v=11').then(r=>r.json());
    this.createPlayer(this.variant);this.makeEntrances();this.makeTraffic();this.makeStudents();this.makeActivities();this.makePlayableSports();this.makeTransport();this.bindUI();this.bindLandmarkMap();this.bindBuildingControls();this.makeFreeBuilding();this.bindWardrobe();this.bindCourses();this.atmosphere=new Atmosphere(this);this.makeSurvival();
    const start=this.env.buildings.find(b=>b.name==='东1教学楼')||this.env.buildings[0];
    this.goToEntrance(start,9);if(!$('character-tools').classList.contains('compact'))$('character-collapse').click();this.ready=true;this.setMode('third');this.updateMap();
  }
  avatar(variant=this.variant,{original=false}={}){const cast=FILM_CAST.find(c=>c.id===variant)||(!original?FILM_CAST[this.castSequence++%FILM_CAST.length]:null);const rig=createAvatar(THREE,cast?.baseVariant||variant,this.avatarSpec);if(cast)applyFilmAppearance(THREE,rig,cast.id);applyOutfit(THREE,rig,'casual','original');applyRole(THREE,rig,'student');this.root(rig).traverse(o=>{if(o.isMesh)o.castShadow=false;});const shadow=new THREE.Mesh(new THREE.CircleGeometry(.4,16),new THREE.MeshBasicMaterial({color:0x243e33,transparent:true,opacity:.17,depthWrite:false}));shadow.rotation.x=-Math.PI/2;shadow.position.y=.025;this.root(rig).add(shadow);const dispose=rig.dispose;rig.dispose=()=>{shadow.geometry.dispose();shadow.material.dispose();dispose?.();};return rig;}
  root(rig){return rig.root||rig.group;}
  createPlayer(variant){
    if(this.ride)this.leaveVehicle(true);const old=this.player,outfit=old?.outfitKey||'casual',color=old?.colorKey||'original',role=old?.roleKey||'student';if(old){this.root(old).removeFromParent();old.dispose?.();}
    this.player=this.avatar(variant,{original:true});applyOutfit(THREE,this.player,outfit,color);applyRole(THREE,this.player,role);this.variant=this.player.variant;this.activeScene.add(this.root(this.player));this.syncWardrobeUI();
  }
  get activeScene(){return this.room?.scene||this.world;}
  setMode(mode){
    if(!['aerial','third','walk','fly'].includes(mode))throw Error('未知漫游模式');
    if(mode==='aerial'){this.cancelNavigation();this.autoRun=false;document.exitPointerLock?.();}if(mode==='aerial'&&this.room)this.leaveBuilding();this.mode=mode;
    document.body.classList.toggle('walking',mode!=='aerial');document.body.classList.toggle('third-person',mode==='third');document.body.classList.toggle('flying',mode==='fly');
    for(const [id,m] of [['aerial-button','aerial'],['third-button','third'],['walk-button','walk'],['fly-button','fly']])$(id)?.classList.toggle('active',mode===m);
    $('walk-hud').hidden=mode==='aerial';$('touch-controls').hidden=mode==='aerial';$('character-tools').hidden=false;
    $('flight-controls').hidden=mode!=='fly';$('controls-hint').textContent=mode==='aerial'?'拖动旋转 · 滚轮缩放 · 地图查看位置':'WASD 移动 · R 奔跑 · Shift 冲刺 · 空格跳跃 · E 互动';
    this.env.syncMode(mode,!!this.room);this.keys.clear();this.env.canvas.focus();this.snapCamera=true;
  }
  makeDoor(parent,{x,z,y=0,width=2,height=2.7,angle=0,label='房门',kind='room',feature=null}){
    const g=new THREE.Group();g.position.set(x,y,z);g.rotation.y=angle;parent.add(g);
    const frameColor=kind==='entrance'?0x406966:0x89755c;
    meshBox(g,.16,height+.15,.36,-width/2-.08,height/2,0,frameColor);meshBox(g,.16,height+.15,.36,width/2+.08,height/2,0,frameColor);meshBox(g,width+.32,.16,.36,0,height+.04,0,frameColor);
    const pivot=new THREE.Group();pivot.position.x=-width/2;g.add(pivot);
    const leaf=meshBox(pivot,width,height,.07,width/2,height/2,0,clearGlass);leaf.castShadow=false;leaf.userData.glass=true;for(const x of [.045,width-.045])meshBox(pivot,.09,height,.14,x,height/2,0,frameColor);for(const y of [.055,height-.055])meshBox(pivot,width,.11,.14,width/2,y,0,frameColor);if(kind==='room')meshBox(pivot,width,1.13,.14,width/2,.565,0,0xb18a5f);meshBox(pivot,.08,.1,.26,width-.22,1.1,.1,0xe3d4a3);
    const door={id:'door-'+this.doors.length,group:g,pivot,leaf,x,z,y,width,height,angle,open:false,amount:0,target:0,label,kind,feature};leaf.userData.door=door;this.doors.push(door);return door;
  }
  local(door,p=this.position){const dx=p.x-door.x,dz=p.z-door.z;return {x:dx*Math.cos(door.angle)-dz*Math.sin(door.angle),z:dx*Math.sin(door.angle)+dz*Math.cos(door.angle)};}
  doorWorld(d,x,z){return {x:d.x+x*Math.cos(d.angle)+z*Math.sin(d.angle),z:d.z-x*Math.sin(d.angle)+z*Math.cos(d.angle)};}
  doorBlocked(d,x,y,z,r=.26){if(y>d.y+d.height||y+1.5<d.y)return false;const a=this.doorWorld(d,-d.width/2,0),b=this.doorWorld(d,-d.width/2+d.width*Math.cos(d.amount),-d.width*Math.sin(d.amount));return pointSegment(x,z,a,b)<r+.07;}
  toggleDoor(d=this.nearby?.door){
    if(!d)return false;if(distance(this.position,d)>3.3||Math.abs(this.position.y-d.y)>2){this.env.toast('先走到门边，再按 E。');return false;}
    if(d.open&&Math.abs(this.local(d).x)<d.width*.65&&Math.abs(this.local(d).z)<1.1){this.env.toast('请先离开门扇范围，再关门。');return false;}
    d.manualUntil=this.time+6;d.open=!d.open;d.target=d.open?-Math.PI*.53:0;this.env.toast(d.open?'门已打开，可以走进去。':'门已关闭。');return true;
  }
  makeEntrances(){
    for(const f of this.env.buildings){
      const candidates=[];
      for(let i=1;i<f.p.length;i++){
        const a=f.p[i-1],b=f.p[i],dx=b[0]-a[0],dz=b[1]-a[1],len=Math.hypot(dx,dz);if(len<1.6)continue;
        for(const t of [.5,.25,.75]){
          const x=a[0]+dx*t,z=a[1]+dz*t;let nx=-dz/len,nz=dx/len;if(this.env.contains(f,x+nx*.3,z+nz*.3)){nx=-nx;nz=-nz;}
          let clear=0;for(const offset of [.5,1,1.5,2,2.7,3.4]){const px=x+nx*offset,pz=z+nz*offset;if(!this.env.buildings.some(o=>this.env.contains(o,px,pz))&&!this.env.waters.some(o=>this.env.contains(o,px,pz)))clear++;}
          candidates.push({i,a,b,len,x,z,nx,nz,t,score:clear*10000+nz*100+len*.1-(t===.5?0:10)});
        }
      }
      const e=candidates.sort((a,b)=>b.score-a.score)[0];if(!e)continue;
      const width=Math.min(2.4,e.len*Math.min(e.t,1-e.t)*2-.4),angle=Math.atan2(e.nx,e.nz);f.glazed=this.canGlaze(f,e);
      f.shellMaterial=f.mesh.material[1];const hidden=f.shellMaterial.clone();hidden.visible=false;f.mesh.material=[f.mesh.material[0],hidden];
      const wallGroup=new THREE.Group();this.env.campus.add(wallGroup);f.wallGroup=wallGroup;
      const wall=(a,b,bottom=0,top=f.height)=>{
        const dx=b[0]-a[0],dz=b[1]-a[1],len=Math.hypot(dx,dz);if(len<.01||top-bottom<.01)return;
        const geom=new THREE.BoxGeometry(len,top-bottom,.22),uv=geom.attributes.uv;for(let j=0;j<uv.count;j++){uv.setXY(j,uv.getX(j)*len,uv.getY(j)*(top-bottom)+bottom);}uv.needsUpdate=true;
        const m=new THREE.Mesh(geom,f.shellMaterial);m.position.set((a[0]+b[0])/2,(bottom+top)/2+.15,(a[1]+b[1])/2);m.rotation.y=-Math.atan2(dz,dx);m.castShadow=true;m.receiveShadow=false;m.userData.feature=f;wallGroup.add(m);
      };
      for(let i=1;i<f.p.length;i++){
        if(i!==e.i){wall(f.p[i-1],f.p[i]);continue;}
        const a=f.p[i-1],b=f.p[i],at=v=>[a[0]+(b[0]-a[0])*v/e.len,a[1]+(b[1]-a[1])*v/e.len],center=e.t*e.len;
        const cuts=[{a:center-width/2,b:center+width/2,lo:0,hi:2.85}];
        if(f.glazed)for(const sign of [-1,1])cuts.push({a:center+sign*3.5-1.7,b:center+sign*3.5+1.7,lo:.52,hi:2.62});
        cuts.sort((a,b)=>a.a-b.a);let cursor=0;
        for(const c of cuts){wall(at(cursor),at(c.a));if(c.lo>0)wall(at(c.a),at(c.b),0,c.lo);wall(at(c.a),at(c.b),c.hi);cursor=c.b;}wall(at(cursor),at(e.len));
      }
      for(const ring of f.h||[])for(let i=1;i<ring.length;i++)wall(ring[i-1],ring[i]);
      const door=this.makeDoor(this.env.campus,{x:e.x+e.nx*.15,z:e.z+e.nz*.15,width,height:2.8,angle,label:(f.name||'校园建筑')+'入口',kind:'entrance',feature:f});
      f.entrance=door;door.normal={x:e.nx,z:e.nz};this.outdoorDoors.push(door);if(f.glazed)this.addGlazedFoyer(f);
      const landing=meshBox(door.group,width+2,.16,3,0,.07,1.3,0xc8c8b5);landing.receiveShadow=true;
    }
  }
  goToEntrance(f,offset=4){
    this.stopSportsGame();
    if(this.ride)this.leaveVehicle(true);
    this.cancelNavigation();
    if(!f?.entrance)return false;if(this.room)this.leaveBuilding();if(this.seated)this.stand();
    const d=f.entrance;let p=this.doorWorld(d,0,offset);if(this.env.blocked(p.x,p.z,true)){for(const step of [3,2,1.5,1,.65]){const q=this.doorWorld(d,0,step);if(!this.env.blocked(q.x,q.z,true)){p=q;break;}}}this.position.set(p.x,.16,p.z);this.yaw=Math.atan2(-d.normal.x,d.normal.z);this.heading=Math.atan2(-d.normal.x,-d.normal.z);this.env.selectCurrent(f);this.portalCooldown=1;this.resetMotion();this.setMode('third');this.updateMap();return true;
  }
  goToPlace(f){if(f?.activityKey)return this.startSportsGame(f.activityKey);this.stopSportsGame();if(this.ride)this.leaveVehicle(true);if(f.entrance)return this.goToEntrance(f,7);if(this.room)this.leaveBuilding();
    if(f.type==='pitch'&&!this.env.blocked(f.cx,f.cz,true)){this.position.set(f.cx,.16,f.cz);this.activity=null;const court=this.sports.courts.find(c=>c.feature.id===f.id)||this.sports.courts.filter(c=>Math.hypot(c.frame.x-f.cx,c.frame.z-f.cz)<60).sort((a,b)=>Math.hypot(a.frame.x-f.cx,a.frame.z-f.cz)-Math.hypot(b.frame.x-f.cx,b.frame.z-f.cz))[0];const track=this.sports.tracks.find(t=>t.feature.id===f.id);if(f.tags.sport==='basketball'&&court)this.activity={key:'basketball',court,name:f.name};else if(track)this.activity={key:'running',track,name:f.name};this.autoRun=false;this.pitch=.3;this.resetMotion();this.env.selectCurrent(f);this.setMode('third');this.updateActivityUI();return true;}
    const p=this.env.safePosition(f);this.position.set(p[0],.16,p[1]);this.env.selectCurrent(f);this.setMode('third');return true;}
  isBlocked(x,y,z){
    if(this.buildingCollision(x,y,z)){this.collisionReason="自建房屋";return true;}
    if(this.navigation&&!this.navigationWalkable(x,z)){this.collisionReason='路线边缘';return true;}
    if(this.room){
      if(this.room.elevator?.blocks(x,y,z)){this.collisionReason='电梯门或轿厢';return true;}
      if((this.room.windows||[]).some(w=>[.3,.9,1.45].some(h=>w.blocks(x,y+h,z)))){this.collisionReason='窗框或关闭的窗户';return true;}
      for(const c of this.room.colliders){if(y+1.5>c.minY+.05&&y<c.maxY-.05&&x>c.x0-.25&&x<c.x1+.25&&z>c.z0-.25&&z<c.z1+.25){this.collisionReason='实体墙壁或家具';return true;}}
      for(const d of this.room.doors)if(this.doorBlocked(d,x,y,z)){this.collisionReason='关闭的门或门扇';return true;}
      return false;
    }
    for(const f of this.env.buildings){
      if(y>=f.height+.1||!this.env.contains(f,x,z))continue;
      const d=f.entrance,q=d&&this.local(d,{x,z});if(d&&q.z> -2.2&&q.z<1&&Math.abs(q.x)<d.width/2-.25&&d.open&&Math.abs(d.amount)>1.15)continue;
      this.collisionReason='建筑实体';return true;
    }
    for(const d of this.outdoorDoors){if(distance({x,z},d)<4&&this.doorBlocked(d,x,y,z)){this.collisionReason='门扇';return true;}}

    if(this.mode!=='fly'&&this.trafficBlocked(this.position,{x,z})){this.collisionReason='红灯，请在人行道等候';return true;}
    return false;
  }
  move(dx,dz){
    const steps=Math.max(1,Math.ceil(Math.hypot(dx,dz)/.16));let changed=false;
    for(let i=0;i<steps;i++){
      const nx=this.position.x+dx/steps,nz=this.position.z+dz/steps;this.tryBuildingStep(nx,nz);
      if(!this.isBlocked(nx,this.position.y,this.position.z)){this.position.x=nx;changed=true;}
      if(!this.isBlocked(this.position.x,this.position.y,nz)){this.position.z=nz;changed=true;}
    }
    return changed;
  }
  waterAt(x,z){if(this.room||this.onDock?.(x,z)||this.env.roads.some(r=>r.tags.bridge==='yes'&&this.env.nearLine(x,z,r.p)<(r.width||4)/2))return null;return this.env.waters.find(f=>this.env.contains(f,x,z))||null;}
  floorHeight(x,z,y=this.position.y){
    if(!this.room){if(this.onDock?.(x,z))return .24;let ground=this.waterAt(x,z)?-.55:.16;for(const road of this.env.roads)if(road.tags.bridge==='yes'&&this.env.nearLine(x,z,road.p)<(road.width||4)/2)ground=1.08;for(const f of this.env.buildings)if(y>=f.height-.1&&this.env.contains(f,x,z))ground=Math.max(ground,f.height+.18);return Math.max(ground,this.buildingSupport(x,z,y));}
    const r=this.room,carFloor=r.elevator?.supportHeight({x,y,z});if(carFloor!=null)return carFloor;
    if(Math.abs(x)<1.78&&z> -17.8&&z< -14.05)return 0;
    if(x< -r.w/2||x>r.w/2||z< -r.d/2||z>r.d/2){if(Math.abs(x)<=4&&z>=18&&z<=22&&y>=3.4)return Math.min(r.floors-1,Math.floor((y+.12)/3.6))*3.6;return 0;}
    const inStair=x>r.w/2-4.2&&x<r.w/2-.8&&z> -r.d/2+1&&z< -r.d/2+10;
    let support=0;
    for(let i=0;i<r.floors;i++){
      if(inStair&&i===r.floors-1)continue;
      let h=i*3.6;
      if(inStair)h+=clamp((-r.d/2+10-z)/9,0,1)*3.6;
      if(h<=y+.24&&h>support)support=h;
    }
    return support;
  }
  update(dt,now){
    if(!this.player)return;this.frame++;this.time+=dt;this.portalCooldown=Math.max(0,this.portalCooldown-dt);this.lastPosition.copy(this.position);this.swimming=this.mode!=='fly'&&this.mode!=='aerial'&&this.position.y<.5&&!!this.waterAt(this.position.x,this.position.z);this.jumpBuffer=Math.max(0,this.jumpBuffer-dt);this.updateAutoDoors();this.updateGlazing(dt);this.updateExteriorWindows(dt);this.atmosphere?.update(dt);
    for(const d of this.doors){d.amount+= (d.target-d.amount)*Math.min(1,dt*7);if(Math.abs(d.target-d.amount)<.001)d.amount=d.target;d.pivot.rotation.y=d.amount;}
    this.prepareSurvival(dt);this.updateTraffic(dt);this.updateNPCs(dt);this.updateActivities(dt);this.updateTransport(dt);const mechanicalMotion=this.updateBuildingMechanics(dt);
    if(!this.survival?.dead&&this.mode!=='aerial'&&!this.seated&&!mechanicalMotion&&!this.ride&&!this.mapExpanded){
      let f=(this.keys.has('KeyW')||this.keys.has('ArrowUp')?1:0)-(this.keys.has('KeyS')||this.keys.has('ArrowDown')?1:0),r=(this.keys.has('KeyD')||this.keys.has('ArrowRight')?1:0)-(this.keys.has('KeyA')||this.keys.has('ArrowLeft')?1:0);
      if(this.autoRun&&!this.keys.has('KeyS')&&!this.keys.has('ArrowDown'))f=1;
      let dx=Math.sin(this.yaw)*f+Math.cos(this.yaw)*r,dz=-Math.cos(this.yaw)*f+Math.sin(this.yaw)*r;
      const nav=this.navigationVector(dt);if(nav){dx=nav.dx;dz=nav.dz;}
      if(this.demo){const a=this.demo;const t=now/1000-a.start;if(t>=10){this.demoHistory.push({duration:t,distance:a.distance,blocked:a.blocked});this.demo=null;this.env.toast('10秒行走演示完成，你可以继续自由走动。');}else{dx=a.dx;dz=a.dz;$('demo-button').textContent=`行走演示 ${Math.ceil(10-t)}s`;}}
      this.sprinting=this.keys.has('ShiftLeft')||this.keys.has('ShiftRight')||this.sprintUntil>this.time;
      const n=Math.hypot(dx,dz)||1;let speed=this.mode==='fly'?20:this.sprinting?8.2:(this.runMode||this.autoRun)?5.2:2.4;
      if(this.swimming)speed=this.sprinting?2.5:1.7;
      if(this.room&&this.mode!=='fly')speed=this.sprinting?6.2:(this.runMode||this.autoRun)?4.5:2.1;
      if(nav)speed=Math.min(speed,nav.remaining/dt);
      this.collisionReason='';this.move(dx/n*speed*dt,dz/n*speed*dt);
      if(this.mode==='fly'){
        const up=(this.keys.has('Space')||this.keys.has('KeyQ')?1:0)-(this.keys.has('ControlLeft')||this.keys.has('KeyZ')?1:0);const dy=up*speed*.55*dt,steps=Math.max(1,Math.ceil(Math.abs(dy)/.1));for(let i=0;i<steps;i++){const ny=Math.max(this.floorHeight(this.position.x,this.position.z),this.position.y+dy/steps);if(!this.isBlocked(this.position.x,ny,this.position.z))this.position.y=ny;else break;}
      }else if(this.swimming){this.position.y+=(-.55-this.position.y)*Math.min(1,dt*10);this.velocityY=0;this.grounded=false;this.jumpBuffer=0;
      }else{
        const floor=this.room?.elevator?.containsCabin(this.position)?this.room.elevator.y:this.floorHeight(this.position.x,this.position.z);this.grounded=this.position.y<=floor+.045&&this.velocityY<=0;
        this.coyote=this.grounded?.12:Math.max(0,this.coyote-dt);
        if(this.grounded){this.position.y=floor;this.velocityY=0;}
        if(this.jumpBuffer>0&&this.coyote>0){this.velocityY=6.1;this.jumpBuffer=0;this.coyote=0;this.grounded=false;this.jumpOrigin=this.position.y;this.lastJumpHeight=0;this.jumpCount++;}
        const count=Math.max(1,Math.ceil(dt/.016));
        for(let step=0;step<count;step++){const delta=dt/count;this.velocityY=Math.max(-4.2,this.velocityY-8*delta);const ny=Math.max(floor,this.position.y+this.velocityY*delta);if(ny<=this.position.y||!this.isBlocked(this.position.x,ny,this.position.z))this.position.y=ny;else this.velocityY=0;if(this.position.y<=floor+.001&&this.velocityY<0){this.velocityY=0;this.grounded=true;}}
        if(!this.grounded)this.lastJumpHeight=Math.max(this.lastJumpHeight,this.position.y-this.jumpOrigin);
      }
      this.speed=Math.hypot(this.position.x-this.lastPosition.x,this.position.z-this.lastPosition.z)/dt;
      if(this.speed>.05)this.heading+=shortestAngle(this.heading,Math.atan2(this.position.x-this.lastPosition.x,this.position.z-this.lastPosition.z))*Math.min(1,dt*14);
      if(this.demo){this.demo.distance+=this.speed*dt;if(this.speed<.1){this.demo.blocked++;if(this.demo.blocked>20){this.demo.dx=-this.demo.dx;this.demo.dz=-this.demo.dz;this.demo.blocked=0;}}}
      if(!this.room&&this.portalCooldown===0){for(const d of this.outdoorDoors){if(distance(this.position,d)>3||!d.open)continue;const q=this.local(d);if(q.z<-.55&&Math.abs(q.x)<d.width/2-.24&&this.position.y<1){this.enterBuilding(d.feature,true);break;}}}
      if(this.room){const next=clamp(Math.floor((this.position.y+.12)/3.6),0,this.room.floors-1);if(next!==this.currentFloor){this.currentFloor=next;this.updateFloorVisibility();}const exit=this.room.exit;if(this.position.y<.45&&this.grounded&&exit.open&&Math.abs(this.position.x)<exit.width/2&&this.position.z>this.room.d/2+.8&&this.lastPosition.z<=this.room.d/2+.8&&this.portalCooldown===0)this.leaveBuilding(true);else this.checkExteriorFall();}
    }else this.speed=0;
    this.updatePlayableSports(dt);
    if(!this.ride){
    const root=this.root(this.player);root.position.copy(this.position);root.rotation.y=this.heading;root.visible=this.mode!=='walk'&&!this.buildMode;if(this.wasSwimming&&!this.swimming)resetSwimPose(this.player);resetRolePose(this.player);prepareCollapsePose(this.player);updateAvatar(this.player,dt,this.speed,this.seated?'sit':this.waveUntil>this.time?'wave':'idle');if(!this.swimming&&!this.seated&&this.mode!=='fly')applyActionPose(this.player,dt,{airborne:!this.grounded,verticalVelocity:this.velocityY,speed:this.speed,sprinting:this.sprinting,grounded:this.grounded});
    updateRoleAction(this.player,dt,this.shootingUntil>this.time?'shoot':this.seated?'reading':this.player.roleKey==='basketball'&&this.speed<.1?'dribble':'idle');if(this.balls?.some(b=>b.owner==='player'))for(const g of this.player.roleGroups||[])if(g.name.endsWith(':basketball'))g.visible=false;
    this.updateReading(this.player,dt,!!this.seated&&!this.swimming);
    if(this.swimming){applySwimPose(this.player,dt,{speed:this.speed});for(const g of this.player.roleGroups||[])if(/handItem|readingBook|basketball$/.test(g.name))g.visible=false;}this.wasSwimming=this.swimming;
    }else this.syncVehiclePlayer(0);
    this.applyBuildingPose();this.applyPlayableSportsPose();this.updateSurvival(dt);this.updateInteraction();this.updateBuildingUI();this.updateLecture();this.updateMotionUI();this.updateCharacterInteraction();if(this.frame%6===0){this.updateMap();this.updateReadout();}
    if(!this.demo)$('demo-button').textContent='行走演示 · 10秒';
    if(this.frame%12===0&&!this.room){this.trace.push([this.position.x,this.position.z]);if(this.trace.length>70)this.trace.shift();}
  }
  updateCamera(dt){
    const sportsOffset=this.sportsSession&&innerWidth<800?Math.round(innerHeight*.09):0;if(this.camera.userData.sportsOffset!==sportsOffset){this.camera.userData.sportsOffset=sportsOffset;if(sportsOffset)this.camera.setViewOffset(innerWidth,innerHeight,0,-sportsOffset,innerWidth,innerHeight);else this.camera.clearViewOffset();}
    if(this.updateTransportCamera(dt))return;
    const fov=this.sportsSession?62:this.seated&&innerWidth<800?70:49;if(this.camera.fov!==fov){this.camera.fov=fov;this.camera.updateProjectionMatrix();}
    const eye=this.position.clone().add(v3(0,this.swimming?1:this.seated?1.15:1.42,0));
    if(this.mode==='walk'||this.buildMode){this.camera.position.copy(eye);this.camera.lookAt(eye.x+Math.sin(this.yaw)*Math.cos(this.pitch),eye.y+Math.sin(this.pitch),eye.z-Math.cos(this.yaw)*Math.cos(this.pitch));return;}
    const dist=this.room?Math.min(4.5,this.cameraDistance):this.cameraDistance,pitch=clamp(this.pitch,.13,1.2);
    const wanted=eye.clone().add(v3(-Math.sin(this.yaw)*dist*Math.cos(pitch),Math.sin(pitch)*dist,Math.cos(this.yaw)*dist*Math.cos(pitch)));
    if(this.room?.elevator?.supportHeight(this.position)!=null)wanted.y=Math.min(wanted.y,this.room.elevator.y+2.5);
    else if(this.room&&Math.abs(this.position.x)<16&&Math.abs(this.position.z)<18)wanted.y=Math.min(wanted.y,this.currentFloor*3.6+3.25);
    const meshes=this.room?this.room.cameraMeshes:this.env.buildings.filter(f=>eye.x>f.box[0]-80&&eye.x<f.box[2]+80&&eye.z>f.box[1]-80&&eye.z<f.box[3]+80).flatMap(f=>[f.mesh,...(f.wallGroup?.children||[])]);
    const dir=wanted.clone().sub(eye),length=dir.length(),ray=new THREE.Raycaster(eye,dir.normalize(),.15,length),hit=ray.intersectObjects(meshes,false)[0];
    if(hit){
      if(!this.room&&hit.distance<1.5){
        // Move beside the facade when a trailing camera would sit inside the avatar.
        let alternative=null,best=0;for(const turn of [Math.PI/2,-Math.PI/2,Math.PI]){const a=this.yaw+turn,offset=v3(-Math.sin(a)*dist*Math.cos(pitch),Math.sin(pitch)*dist,Math.cos(a)*dist*Math.cos(pitch)),l=offset.length(),direction=offset.clone().normalize(),obstacle=new THREE.Raycaster(eye,direction,.1,l).intersectObjects(meshes,false)[0],free=Math.min(l,obstacle?Math.max(.12,obstacle.distance-.3):l);if(free>best){best=free;alternative=eye.clone().addScaledVector(direction,free);}if(free>2.5)break;}if(alternative&&best>1.5)wanted.copy(alternative);else wanted.copy(eye).addScaledVector(dir,Math.max(.12,hit.distance-.24));
      }else wanted.copy(eye).addScaledVector(dir,Math.max(.12,hit.distance-.24));
    }
    if(!this.room&&this.env.buildings.some(f=>this.camera.position.y<f.height+.3&&this.env.contains(f,this.camera.position.x,this.camera.position.z)))this.camera.position.copy(wanted);this.portalBlend=Math.max(0,(this.portalBlend||0)-dt);if(this.portalBlend>0){this.camera.position.lerp(wanted,1-Math.exp(-dt*3));this.camera.lookAt(eye);return;}if(this.snapCamera){this.camera.position.copy(wanted);this.snapCamera=false;}else this.camera.position.lerp(wanted,1-Math.exp(-dt*14));if(!this.room&&this.env.buildings.some(f=>this.camera.position.y<f.height+.3&&this.env.contains(f,this.camera.position.x,this.camera.position.z)))this.camera.position.copy(wanted);this.camera.lookAt(eye);
  }
  resetMotion(){if(this.player)resetSwimPose(this.player);this.wasSwimming=false;this.swimming=false;this.velocityY=0;this.grounded=true;this.jumpBuffer=0;this.sprintUntil=0;}
  jump(){if(this.ride){this.ride.car.actualSpeed=0;this.ride.cruise=false;return;}if(this.climbing||this.room?.elevator?.containsCabin(this.position))return;if(this.swimming){this.sprintUntil=this.time+1.2;return;}if(this.seated)this.stand();if(this.mode==='aerial'||this.mode==='fly')this.setMode('third');this.jumpBuffer=.18;}
  toggleAutoRun(){if(this.ride){if(this.ride.mode==='manual')this.ride.cruise=!this.ride.cruise;return;}this.cancelNavigation();if(this.seated)this.stand();if(this.mode==='aerial')this.setMode('third');this.autoRun=!this.autoRun;if(this.autoRun)this.runMode=true;this.env.toast(this.autoRun?(this.swimming?'持续游泳已开启，移动鼠标转向；H 或 S 停止。':'持续跑步已开启，移动鼠标转向；H 或 S 停止。'):'持续前进已停止。');this.updateMotionUI();}
  toggleRun(){this.runMode=!this.runMode;this.updateMotionUI();}
  sprint(){if(this.seated)this.stand();if(this.mode==='aerial')this.setMode('third');this.sprintUntil=this.time+2;this.updateMotionUI();}
  updateMotionUI(){
    $('autorun-button').classList.toggle('active',this.autoRun);$('autorun-button').setAttribute('aria-pressed',String(this.autoRun));$('autorun-button').textContent=this.autoRun?'停止持续前进 · H':this.swimming?'持续游泳 · H':'持续跑步 · H';
    $('motion-tools').hidden=this.mode==='aerial'||!!this.seated;
    $('run-button').classList.toggle('active',this.runMode);$('run-button').setAttribute('aria-pressed',String(this.runMode));
    $('run-button').textContent=this.runMode?'奔跑中 · R':'奔跑 · R';$('jump-button').textContent=this.swimming?'划水 · 空格':'跳跃 · 空格';$('sprint-button').classList.toggle('active',!!this.sprinting);
    $('motion-status').textContent=this.mode==='fly'?'自由飞行':this.swimming?(this.speed>.1?'游泳':'踩水'):!this.grounded?'腾空':this.speed<.1?'站立':this.sprinting?'冲刺':this.autoRun?'持续跑步':this.runMode?'奔跑':'步行';
  }
  updateAutoDoors(){
    if(this.mode==='aerial'||this.seated)return;
    for(const d of this.room?[this.room.exit]:this.outdoorDoors){if(this.time<(d.manualUntil||0)||Math.abs(this.position.y-d.y)>.8)continue;const q=this.local(d);if(Math.abs(q.x)<d.width/2+.6&&Math.abs(q.z)<3.2&&!d.open){d.open=true;d.target=-Math.PI*.53;}}
  }
  startDemo(){this.cancelNavigation();if(this.seated)this.stand();if(this.mode==='aerial')this.setMode('third');if(this.mode==='fly')this.setMode('third');this.demo={start:performance.now()/1000,dx:Math.sin(this.yaw),dz:-Math.cos(this.yaw),distance:0,blocked:0};this.env.toast('演示持续10秒，人物按实际移动速度迈步；遇障碍会折返。');}
  bindUI(){
    $('navigation-stop').onclick=()=>this.cancelNavigation('已停止自动前进');
    $('autorun-button').onclick=()=>this.toggleAutoRun();$('mouse-look-toggle').onchange=()=>this.mouseLook=$('mouse-look-toggle').checked;$('pointer-lock-button').onclick=()=>{if(document.pointerLockElement)this.env.canvas.ownerDocument.exitPointerLock();else this.env.canvas.requestPointerLock?.()?.catch?.(()=>this.env.toast('可直接在画面上移动鼠标转动视野。'));};
    $('run-button').onclick=()=>this.toggleRun();$('jump-button').onclick=()=>this.jump();$('sprint-button').onclick=()=>this.sprint();
    document.querySelectorAll('[data-avatar]').forEach(b=>b.onclick=()=>{this.createPlayer(b.dataset.avatar);this.env.toast('已切换人物，位置保持不变。');});
    $('third-button').onclick=()=>this.setMode('third');$('fly-button').onclick=()=>{if(this.seated)this.stand();this.setMode('fly');this.env.toast('自由飞行：WASD移动，空格/Q上升，Z下降；仍保留实体碰撞。');};
    $('character-collapse').onclick=()=>{const compact=$('character-tools').classList.toggle('compact');$('character-collapse').textContent=compact?'+':'−';$('character-collapse').setAttribute('aria-expanded',String(!compact));$('character-collapse').setAttribute('aria-label',compact?'展开角色选择':'收起角色选择');};$('demo-button').onclick=()=>this.startDemo();$('wave-button').onclick=()=>this.waveUntil=this.time+2.4;$('interact-button').onclick=()=>this.interact();$('my-location').onclick=()=>{if(this.mode==='aerial')this.env.focus(this.position);else this.snapCamera=true;this.env.toast(this.room?`${this.room.name} · ${this.currentFloor+1}楼`:'已定位到你的位置');};
    $('stand-button').onclick=()=>this.stand();$('lecture-play').onclick=()=>this.toggleLecture();$('lecture-course').onchange=()=>this.startLecture($('lecture-course').value);$('floor-up').onclick=()=>this.useLift(1);$('floor-down').onclick=()=>this.useLift(-1);
  }
  keyDown(e){
    if(e.code==='KeyM'&&!e.repeat){this.toggleCampusMap();e.preventDefault();return;}
    if(this.sportsSession&&['KeyJ','KeyK','Space'].includes(e.code)){if(!e.repeat){if(e.code==='KeyJ')this.serveSports();else this.hitSports();}e.preventDefault();return;}
    if(this.sportsSession&&e.code==='Escape')this.stopSportsGame();
    if(['Escape','KeyW','KeyA','KeyS','KeyD','ArrowUp','ArrowDown','ArrowLeft','ArrowRight'].includes(e.code))this.cancelNavigation();
    if(e.code==='KeyH'&&!e.repeat)this.toggleAutoRun();if(e.code==='KeyB'&&!e.repeat)this.shootBasketball();if(e.code==='KeyS'||e.code==='ArrowDown'){this.autoRun=false;if(this.ride)this.ride.cruise=false;}if(this.ride?.mode==='manual'&&this.ride.car.route&&['KeyW','KeyA','KeyS','KeyD','ArrowUp','ArrowDown','ArrowLeft','ArrowRight'].includes(e.code))this.cancelRideRoute();
    if(e.code==='KeyX'&&!e.repeat)this.climbWindow();
    if(e.code==='KeyR'&&!e.repeat)this.toggleRun();if(e.code==='KeyF'&&!e.repeat)this.sprint();if(e.code==='Space'&&this.mode!=='fly'&&!e.repeat){this.jump();e.preventDefault();}
    if(e.code==='KeyE'&&!e.repeat){this.interact();e.preventDefault();}if(e.code==='KeyV')this.setMode(this.mode==='walk'?'third':'walk');if(e.code==='KeyC'&&!e.repeat){const variants=[...FILM_CAST.map(c=>c.id),...Object.keys(this.avatarSpec.variants)];this.createPlayer(variants[(variants.indexOf(this.player.variant)+1)%variants.length]);}if(e.code==='KeyG'&&!e.repeat)this.swapAppearance();if(e.code==='KeyT')this.waveUntil=this.time+2.4;
    if(['Space','KeyQ','KeyZ','ControlLeft'].includes(e.code)){this.keys.add(e.code);e.preventDefault();}if(this.demo&&['KeyW','KeyA','KeyS','KeyD'].includes(e.code))this.demo=null;
  }
  updateReadout(){
    const region=this.room?`${this.room.name} · ${this.currentFloor+1}楼`:this.activity?.name||this.env.buildings.reduce((a,b)=>Math.hypot(this.position.x-b.cx,this.position.z-b.cz)<Math.hypot(this.position.x-a.cx,this.position.z-a.cz)?b:a,this.env.buildings[0]).name||'校园';
    $('position-readout').textContent=this.room?region:`${region}附近 · 海拔 ${this.position.y.toFixed(1)}m`;
    $('world-state').textContent=JSON.stringify(this.getState());
  }
  getState(){return {...this.getSurvivalState(),...this.getFreeBuildingState(),...this.getSportsGameState(),...this.getTransportState(),...this.getBuildingState(),...this.getActivityState(),planning:!!this.navigationWorker,navigation:this.navigation?{target:this.navigation.target,label:this.navigation.label,waypoint:this.navigation.index,waypoints:this.navigation.path.length}:null,indoorWalkers:this.room?.walkers?.map(w=>({position:{x:this.root(w.rig).position.x,z:this.root(w.rig).position.z},floor:w.floor+1,speed:w.speed,trips:w.trips})),teachers:this.room?.teachers.filter(t=>t.floor===this.currentFloor).map(t=>({action:t.action,progress:t.chalkProgress})),swimming:this.swimming,autoRun:this.autoRun,mouseLook:this.mouseLook,role:this.player?.roleKey,vehicleTypes:[...new Set(this.vehicles.map(v=>v.type))],vehicleCount:this.vehicles.length,mode:this.mode,variant:this.variant,outfit:this.player?.outfitKey,clothesColor:this.player?.colorKey,appearanceGender:this.appearanceGender,swapCount:this.swapCount||0,nearbyPerson:this.nearestPerson?{variant:this.nearestPerson.npc.rig.variant,outfit:this.nearestPerson.npc.rig.outfitKey}:null,atmosphere:this.atmosphere?.getState(),position:{x:this.position.x,y:this.position.y,z:this.position.z},heading:this.heading,speed:this.speed,runMode:this.runMode,sprinting:!!this.sprinting,grounded:this.grounded,jumpCount:this.jumpCount,jumpHeight:this.lastJumpHeight,velocityY:this.velocityY,glazedBuildingCount:this.glazedBuildings.length,indoor:this.room?.name||null,floor:this.currentFloor+1,floors:this.room?.floors||null,seated:this.seated?.id||null,lecture:this.lecture?{id:this.lecture.course.id,playing:!this.audio?.paused,time:this.audio?.currentTime||0,duration:this.audio?.duration||0}:null,nearby:this.nearby?{kind:this.nearby.kind,label:this.nearby.label,door:this.nearby.door?.id}:null,openDoors:this.doors.filter(d=>d.open).map(d=>d.id),doorCount:this.outdoorDoors.length,npcCount:this.npcs.length,studentCount:this.room?.students.length||0,trafficPhase:this.crossings[0]?.phase,collision:this.collisionReason,demo:this.demo?{remaining:Math.max(0,10-(performance.now()/1000-this.demo.start)),distance:this.demo.distance}:null,demoHistory:this.demoHistory};}
}
Object.assign(CampusLife.prototype,interiorActions,trafficMethods,glazingMethods,characterMethods,activityMethods,interiorViewMethods,indoorLifeMethods,navigationMethods,courseMethods,buildingMechanics,transportMethods,waterAirMethods,playableSportsMethods,landmarkMapMethods,buildingMethods,exteriorWindowMethods,blueprintMethods,survivalMethods);
