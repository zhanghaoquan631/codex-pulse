import * as THREE from './vendor/three.module.js';
import {buildInterior} from './interiors.js?v=11';
const $=id=>document.getElementById(id),dist=(a,b)=>Math.hypot(a.x-b.x,a.z-b.z);
export const interiorActions={
  enterBuilding(feature,seamless=false){
    if(this.buildMode)this.toggleBuilding(false);
    const transition=seamless?{position:this.position.clone(),camera:this.camera.position.clone(),quaternion:this.camera.quaternion.clone(),yaw:this.yaw,heading:this.heading,keys:[...this.keys],mode:this.mode,autoRun:this.autoRun}:null;
    if(this.ride)this.leaveVehicle(true);if(!feature?.entrance)return false;if(this.room)this.leaveBuilding();this.seatTeacher=null;this.cancelNavigation();this.autoRun=false;this.activity=null;this.stopLecture();this.seated=null;this.demo=null;this.resetMotion();this.root(this.player).removeFromParent();this.room=buildInterior(this,feature);this.makeIndoorPeople();this.setupBuildingMechanics();this.position.set(0,0,this.room.d/2-1.5);this.yaw=0;this.heading=Math.PI;this.currentFloor=0;this.portalCooldown=1.2;this.room.scene.add(this.root(this.player));this.env.selectCurrent(feature);this.setMode('third');
    if(transition){const source=feature.entrance;Object.assign(this.room.exit,{open:source.open,amount:source.amount,target:source.target});this.room.exit.pivot.rotation.y=source.amount;const d=feature.entrance,c=Math.cos(d.angle),sn=Math.sin(d.angle),transform=p=>new THREE.Vector3((p.x-d.x)*c-(p.z-d.z)*sn,p.y-.16,(p.x-d.x)*sn+(p.z-d.z)*c+this.room.d/2);this.position.copy(transform(transition.position));this.lastPosition.copy(this.position);this.camera.position.copy(transform(transition.camera));this.camera.quaternion.copy(transition.quaternion).premultiply(new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0,1,0),-d.angle));this.yaw=transition.yaw+d.angle;this.heading=transition.heading-d.angle;this.setMode(transition.mode);this.keys.clear();transition.keys.forEach(k=>this.keys.add(k));this.autoRun=transition.autoRun;this.snapCamera=false;this.portalBlend=.5;}document.body.classList.add('interior');$('interior-banner').hidden=false;$('interior-title').textContent=this.room.name+' · 室内重建';$('labels').hidden=true;$('place-card').hidden=true;$('floor-controls').hidden=false;this.env.toast('已从入口进入。靠近房门按 E 打开；右侧北端楼梯可上下楼。');this.updateFloorVisibility();return true;
  },
  leaveBuilding(seamless=false){
    const transition=seamless&&this.room?{position:this.position.clone(),camera:this.camera.position.clone(),quaternion:this.camera.quaternion.clone(),yaw:this.yaw,heading:this.heading,keys:[...this.keys],mode:this.mode,autoRun:this.autoRun,depth:this.room.d/2}:null;
    if(!this.room)return false;this.seatTeacher=null;this.cancelNavigation();const feature=this.room.feature;this.autoRun=false;this.activity=null;this.stopLecture();this.seated=null;this.demo=null;this.resetMotion();this.root(this.player).removeFromParent();const old=this.room;this.doors=this.doors.filter(d=>!old.doors.includes(d));this.room=null;
    this.climbing=null;this.liftState=null;this.nearWindow=null;$('window-controls').hidden=true;old.elevator?.dispose();old.windows?.forEach(w=>w.dispose());
    old.scene.traverse(o=>{if(o.userData.interiorOwned)o.geometry?.dispose();});old.textures.forEach(t=>t.dispose());old.materials.forEach(m=>m.dispose());old.students.forEach(s=>s.rig.dispose?.());old.teachers.forEach(s=>s.rig.dispose?.());old.walkers?.forEach(s=>s.rig.dispose?.());
    const d=feature.entrance,p=this.doorWorld(d,0,2.8);this.position.set(p.x,.16,p.z);this.yaw=Math.atan2(d.normal.x,-d.normal.z);this.heading=Math.atan2(d.normal.x,d.normal.z);this.world.add(this.root(this.player));this.portalCooldown=1.5;this.currentFloor=0;document.body.classList.remove('interior');$('interior-banner').hidden=true;$('labels').hidden=false;$('floor-controls').hidden=true;this.setMode('third');if(transition){Object.assign(d,{open:old.exit.open,amount:old.exit.amount,target:old.exit.target});d.pivot.rotation.y=d.amount;const transform=p=>{const q=this.doorWorld(d,p.x,p.z-transition.depth);return new THREE.Vector3(q.x,p.y+.16,q.z);};this.position.copy(transform(transition.position));this.lastPosition.copy(this.position);this.camera.position.copy(transform(transition.camera));this.camera.quaternion.copy(transition.quaternion).premultiply(new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0,1,0),d.angle));this.yaw=transition.yaw-d.angle;this.heading=transition.heading+d.angle;this.setMode(transition.mode);transition.keys.forEach(k=>this.keys.add(k));this.autoRun=transition.autoRun;this.snapCamera=false;this.portalBlend=.5;}this.updateMap();return true;
  },
  updateFloorVisibility(){
    if(!this.room)return;this.room.groups.forEach((g,i)=>g.visible=Math.abs(i-this.currentFloor)<=1);this.room.doors.forEach(d=>d.group.visible=Math.abs(d.y/3.6-this.currentFloor)<=1);$('floor-label').textContent=`${this.currentFloor+1} / ${this.room.floors} F`;
  },
  updateInteraction(){
    let best=null;const consider=(candidate,d)=>{if(d<3.15&&(!best||d<best.distance))best={...candidate,distance:d};};
    if(this.seated)best={kind:'stand',label:'起身离开座位',distance:0};
    else{
      const doors=this.room?this.room.doors:this.outdoorDoors;
      for(const d of doors)if(Math.abs(d.y-this.position.y)<1.8)consider({kind:'door',door:d,label:`${d.open?'关闭':'打开'} ${d.label}`},dist(this.position,d));
      if(this.room){
        for(const s of this.room.seats)if(!s.occupied&&s.floor===this.currentFloor)consider({kind:'seat',seat:s,label:this.room.type==='classroom'?'坐下听课':'坐下休息'},dist(this.position,s));
        if(dist(this.position,this.room.lift)<2.2)consider({kind:'lift',label:'电梯 · 使用楼层按钮'},dist(this.position,this.room.lift));
      }
    }
    if(this.nearWindow&&!this.seated)best={kind:'window',label:this.nearWindow.open?'关闭窗户':'打开窗户',distance:0};
    if(this.ride)best={kind:'vehicle-exit',label:'停车 / 下车',distance:0};else if(this.nearVehicle&&!this.room)best={kind:'vehicle',label:(this.nearVehicle.actualSpeed>.15?'招停':'使用')+(this.nearVehicle.displayName||'车辆'),distance:0};
    if(!this.room&&this.buildPanelNear()){const b=this.buildPanelNear();best={kind:'built-panel',label:(b.open?'关闭':'打开')+(b.type==='door'?'自建房门':'自建窗户'),distance:0};}
    this.nearby=best;$('interact-button').disabled=!best;$('interact-button').textContent=best?`E · ${best.label}`:'E · 靠近门或空座位互动';
    $('nearby-hint').textContent=this.collisionReason||(!this.room&&this.trafficNotice?this.trafficNotice:'');

  },
  interact(){
    if(!this.room&&this.toggleBuiltPanel())return true;
    if(this.ride)return this.leaveVehicle();if(this.nearVehicle&&!this.room)return this.boardVehicle();const n=this.nearby;if(!n)return false;if(n.kind==='window')return this.toggleWindow();if(n.kind==='door')return this.toggleDoor(n.door);if(n.kind==='seat')return this.sit(n.seat);if(n.kind==='stand')return this.stand();if(n.kind==='lift')return this.callLift();return false;
  },
  sit(seat){
    this.cancelNavigation();this.autoRun=false;if(!this.room||seat.occupied||dist(this.position,seat)>3.2)return false;this.seated=seat;this.seatReturn=this.position.clone();this.position.set(seat.x,seat.y,seat.z);this.heading=seat.heading;this.yaw=seat.heading===Math.PI?0:Math.PI;this.speed=0;this.keys.clear();this.demo=null;this.pitch=.2;if(this.room.type==='classroom'){const board=this.classroomForSeat(seat)?.board||this.room.boards.filter(b=>b.floor===this.currentFloor).sort((a,b)=>Math.hypot(a.mesh.position.x-seat.x,a.mesh.position.z-seat.z)-Math.hypot(b.mesh.position.x-seat.x,b.mesh.position.z-seat.z))[0];if(board){const dx=board.mesh.position.x-seat.x,dz=board.mesh.position.z-seat.z;this.yaw=Math.atan2(dx,-dz);this.pitch=Math.atan2(.35,Math.hypot(dx,dz));}}this.setMode(this.room.type==='classroom'?'walk':'third');
    $('lecture-panel').hidden=false;$('stand-button').hidden=false;if(innerWidth<800&&!$('character-tools').classList.contains('compact'))$('character-collapse').click();
    if(this.room.type==='classroom'){const lesson=this.prepareSeatCourse(seat);this.startLecture(lesson.id);}else{$('lecture-title').textContent=this.room.type==='library'?'阅览座位':this.room.type==='dining'?'餐厅座位':'宿舍书桌';$('lecture-subtitle').textContent='已坐下。可以休息，或选择一节微课收听。';}
    this.env.toast(this.room.type==='classroom'?'已入座，老师开始讲课。':'已坐下。');return true;
  },
  stand(){
    if(!this.seated)return false;this.stopLecture();this.position.copy(this.seatReturn);this.seated=null;this.seatTeacher=null;$('lecture-panel').hidden=true;this.snapCamera=true;this.env.toast('已起身，可以继续探索。');return true;
  },
  startLecture(id){
    if(!this.seated)return false;const course=this.lectures.find(x=>x.id===id);if(!course||this.seatTeacher?.subject&&course.subject!==this.seatTeacher.subject.id)return false;this.stopLecture();this.showCourseResources(course);this.audio=new Audio('./'+course.audio);this.audio.preload='auto';this.lecture={course,segment:-1};$('lecture-title').textContent=course.title;$('lecture-course').value=id;$('lecture-panel').hidden=false;
    this.audio.onended=()=>{$('lecture-play').textContent='重新听课';$('lecture-subtitle').textContent='本节微课结束。可以换一节课，或起身继续逛校园。';};
    this.audio.play().then(()=>$('lecture-play').textContent='暂停讲解').catch(()=>{$('lecture-play').textContent='点击开始听课';});this.updateLecture();return true;
  },
  toggleLecture(){if(!this.seated)return;if(!this.lecture)return this.startLecture($('lecture-course').value||this.lectures[0].id);if(this.audio.paused){if(this.audio.ended)this.audio.currentTime=0;this.audio.play().catch(()=>{});$('lecture-play').textContent='暂停讲解';}else{this.audio.pause();$('lecture-play').textContent='继续听课';}},
  stopLecture(){if(this.audio){this.audio.pause();this.audio.src='';}this.audio=null;this.lecture=null;$('lecture-panel').hidden=true;$('lecture-progress').value=0;$('lecture-time').textContent='';$('lecture-play').textContent='开始听课';},
  updateLecture(){
    if(!this.lecture||!this.audio)return;const c=this.lecture.course,t=this.audio.currentTime||0;let acc=0,index=c.segments.length-1;for(let i=0;i<c.segments.length;i++){acc+=c.segments[i].duration;if(t<acc){index=i;break;}}
    if(index!==this.lecture.segment){this.lecture.segment=index;const s=c.segments[index];$('lecture-subtitle').textContent=s.text;

    }
    $('lecture-progress').value=t/(c.duration||1);$('lecture-time').textContent=`${Math.floor(t)} / ${Math.round(c.duration)} 秒`;
  },
  updateMap(){
    const canvas=$('minimap'),ctx=canvas.getContext('2d'),w=canvas.width,h=canvas.height;ctx.clearRect(0,0,w,h);
    if(this.room&&!this.mapExpanded){
      const r=this.room;ctx.fillStyle='#e8e7d9';ctx.fillRect(0,0,w,h);const px=x=>(x+r.w/2+2)/(r.w+4)*w,pz=z=>(z+r.d/2+3)/(r.d+6)*h;
      ctx.fillStyle='#c4cbb6';ctx.fillRect(px(-2.5),pz(-18),px(2.5)-px(-2.5),pz(18)-pz(-18));ctx.fillStyle='#728078';
      for(const c of r.colliders.filter(c=>c.minY<this.currentFloor*3.6+2&&c.maxY>this.currentFloor*3.6))ctx.fillRect(px(c.x0),pz(c.z0),Math.max(1,px(c.x1)-px(c.x0)),Math.max(1,pz(c.z1)-pz(c.z0)));
      for(const d of r.doors.filter(d=>Math.abs(d.y-this.position.y)<2)){ctx.fillStyle=d.open?'#65a677':'#a17b56';ctx.fillRect(px(d.x)-3,pz(d.z)-2,6,4);}
      for(const s of [...r.students,...(r.walkers||[])].filter(s=>s.floor===this.currentFloor)){ctx.fillStyle='#7c77a6';ctx.beginPath();ctx.arc(px(this.root(s.rig).position.x),pz(this.root(s.rig).position.z),2,0,7);ctx.fill();}
      this.drawNavigation(ctx,px,pz);this.drawBeacon(ctx,px(this.position.x),pz(this.position.z),this.heading);$('map-mode-label').textContent=`${this.currentFloor+1}F 室内平面`;
    }else{
      ctx.drawImage(this.env.mapBase,0,0,w,h);const b=this.env.bounds,px=x=>(x-b[0])/(b[2]-b[0])*w,pz=z=>(z-b[1])/(b[3]-b[1])*h;
      ctx.strokeStyle='#fff8';ctx.lineWidth=2;ctx.beginPath();this.trace.forEach((p,i)=>i?ctx.lineTo(px(p[0]),pz(p[1])):ctx.moveTo(px(p[0]),pz(p[1])));ctx.stroke();
      for(const n of this.npcs){ctx.fillStyle='#8479a6';ctx.fillRect(px(n.pos.x),pz(n.pos.z),1.7,1.7);}
      if(!this.room)this.drawNavigation(ctx,px,pz);this.drawTransport(ctx,px,pz);this.drawMapLabels(ctx,px,pz);
      const mapPosition=this.room?{x:this.room.feature.cx,z:this.room.feature.cz}:this.position,mapHeading=this.heading+(this.room?.feature.entrance?.angle||0);
      this.drawBeacon(ctx,clamp(px(mapPosition.x),7,w-7),clamp(pz(mapPosition.z),7,h-7),mapHeading);$('map-mode-label').textContent=this.room?`${this.room.feature.placeTitle||this.room.name} · ${this.currentFloor+1}F`:'紫金港 · 我的位置';
    }
  },
  drawBeacon(ctx,x,y,heading){ctx.save();ctx.translate(x,y);ctx.fillStyle='#e8992c33';ctx.beginPath();ctx.arc(0,0,10+Math.sin(this.time*3)*2,0,7);ctx.fill();ctx.fillStyle='#e6a03c';ctx.strokeStyle='#fff';ctx.lineWidth=2;ctx.beginPath();ctx.arc(0,0,5,0,7);ctx.fill();ctx.stroke();ctx.rotate(-heading);ctx.beginPath();ctx.moveTo(0,12);ctx.lineTo(-4,5);ctx.lineTo(4,5);ctx.closePath();ctx.fill();ctx.restore();},
  mapClick(event){
    const c=$('minimap'),r=c.getBoundingClientRect(),u=(event.clientX-r.left)/r.width,v=(event.clientY-r.top)/r.height;
    if(!this.room||this.mapExpanded){const landmark=this.mapLandmarkAt(u,v);if(landmark){this.navigateLandmark(landmark);return;}}
    if(this.room&&!this.mapExpanded){this.startNavigation({x:u*(this.room.w+4)-this.room.w/2-2,z:v*(this.room.d+6)-this.room.d/2-3});return;}
    const b=this.env.bounds;if(this.room)this.leaveBuilding();if(this.mapExpanded)this.toggleCampusMap(false);if(this.ride){this.quoteRide({x:b[0]+u*(b[2]-b[0]),z:b[1]+v*(b[3]-b[1])});return;}this.startNavigation({x:b[0]+u*(b[2]-b[0]),z:b[1]+v*(b[3]-b[1])});
  }
};
const clamp=THREE.MathUtils.clamp;
