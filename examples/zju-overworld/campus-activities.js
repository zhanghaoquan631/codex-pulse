import * as THREE from './vendor/three.module.js';
import {updateAvatar} from './avatar.js?v=11';
import {applyOutfit} from './wardrobe.js?v=11';
import {applyRole,updateRoleAction,resetRolePose} from './character-props.js?v=11';
import {createSportsFields,pointOnTrack} from './sports-fields.js?v=11';
const $=id=>document.getElementById(id),distance=(a,b)=>Math.hypot(a.x-b.x,a.z-b.z);
const NAMES=['小林','小周','小陈','小王','小李','小沈','小许','小吴'];
export const activityMethods={
 makeActivities(){
  this.sports=createSportsFields(this);this.activityActors=[];this.activityStats={shots:0,baskets:0,runningMeters:0};this.activity=null;this.balls=[];
  for(const [i,track] of this.sports.tracks.entries())for(let j=0;j<14;j++)this.addActivityPerson({kind:'runner',role:'runner',track,meters:track.length*j/14,speed:2.6+j*.17,pos:pointOnTrack(track,track.length*j/14)},j+i*8);
  // Courts are taken from mapped individual pitches, avoiding duplicate parent areas.
  const occupied=this.sports.courts.filter((c,i)=>i%3===0||c.feature.id==='way/817997250');
  for(const [i,court] of occupied.entries())for(let j=0;j<6;j++)this.addActivityPerson({kind:'basketball',role:'basketball',court,base:court.frame.world((j%2?1:-1)*2.5,(Math.floor(j/2)-1)*court.length*.24),pos:court.frame.world((j%2?1:-1)*2.5,(Math.floor(j/2)-1)*court.length*.24),phase:j*1.7+i},i*4+j);
  const buildings=this.env.buildings.filter(f=>f.entrance&&(/东[1-4]教学|西[1-4]教学|蓝田[1-3]舍|丹阳1舍|紫云1舍|银泉食堂|图书/.test(f.name)));
  for(const [i,f] of buildings.entries()){
   const d=f.entrance;for(let j=0;j<6;j++){const p=this.doorWorld(d,(j-2.5)*2.1,5+j%2);if(this.env.blocked(p.x,p.z,true))continue;this.addActivityPerson({kind:j===2?'reading':'chatting',role:j===0&&f.category==='teaching'?'teacher':j===2?'visitor':'student',pos:new THREE.Vector3(p.x,.16,p.z),heading:d.angle+Math.PI,home:f},i*3+j);}
  }
  $('campus-life-toggle').onclick=()=>{const e=$('campus-life-menu');e.hidden=!e.hidden;$('campus-life-toggle').setAttribute('aria-expanded',String(!e.hidden));};
  document.querySelectorAll('[data-activity]').forEach(b=>b.onclick=()=>this.visitActivity(b.dataset.activity));
  $('activity-primary').onclick=()=>this.doActivity();$('activity-close').onclick=()=>{this.stopSportsGame();this.activity=null;this.autoRun=false;$('activity-panel').hidden=true;};
 },
 addActivityPerson(n,index){
  const rig=this.avatar(index%8);applyOutfit(THREE,rig,['runner','basketball'].includes(n.role)?'sport':n.role==='teacher'?'formal':index%4===0?'winter':'casual',['original','navy','cream','blue','orange','green'][index%6]);applyRole(THREE,rig,n.role);
  n.rig=rig;n.name=n.role==='teacher'?`${['陈','林','周'][index%3]}老师`:NAMES[index%8];n.index=this.activityActors.length;this.root(rig).position.copy(n.pos);this.root(rig).rotation.y=n.heading||0;this.world.add(this.root(rig));this.activityActors.push(n);return n;
 },
 visitActivity(key){
  if(['baseball','badminton'].includes(key))return this.startSportsGame(key);this.stopSportsGame();
  if(this.ride)this.leaveVehicle(true);
  if(!['basketball','running','classroom','dorm','library','dining','swimming'].includes(key))return false;this.autoRun=false;this.demo=null;if(this.room)this.leaveBuilding();this.activity={key};$('campus-life-menu').hidden=true;$('campus-life-toggle').setAttribute('aria-expanded','false');$('activity-panel').hidden=false;
  if(key==='basketball'){
   const c=this.sports.courts.find(c=>c.feature.id==='way/817997250')||this.sports.courts[0];this.activity.court=c;this.position.copy(c.frame.world(0,-c.length/2+6));const goal=c.hoopPositions[0];this.yaw=Math.atan2(goal.x-this.position.x,this.position.z-goal.z);this.heading=Math.atan2(goal.x-this.position.x,goal.z-this.position.z);this.activity.name='安中篮球场';this.setMode('third');
  }else if(key==='swimming'){
   const water=this.env.waters.find(w=>/启真湖/.test(w.name))||this.env.waters[0];let p=null;for(let i=1;i<20&&!p;i++)for(let j=1;j<20;j++){const x=water.box[0]+(water.box[2]-water.box[0])*i/20,z=water.box[1]+(water.box[3]-water.box[1])*j/20;if(this.env.contains(water,x,z)&&this.waterAt(x,z)){p=new THREE.Vector3(x,-.55,z);break;}}if(!p)return false;this.position.copy(p);this.activity.name=(water.name||'校园湖泊')+' · 游泳';this.yaw=0;this.setMode('third');
  }else if(key==='running'){
   const t=this.sports.tracks.find(t=>/东田径/.test(t.feature.name))||this.sports.tracks[0];this.activity.track=t;this.position.copy(pointOnTrack(t,15));const next=pointOnTrack(t,20);this.yaw=Math.atan2(next.x-this.position.x,this.position.z-next.z);this.activity.name=t.feature.name;this.setMode('third');
  }else{
   const f=key==='classroom'?this.env.buildings.find(f=>f.name==='东1教学楼'):key==='dorm'?this.env.buildings.find(f=>f.name==='蓝田1舍'):key==='library'?this.env.buildings.find(f=>/主图书馆/.test(f.name)):this.env.buildings.find(f=>f.name==='银泉食堂');
   if(!f)return false;this.enterBuilding(f);this.activity={key,name:f.name};
   const door=this.room.doors.find(d=>d.floor===0&&d.x<0&&d.z>0);if(door){door.open=true;door.amount=door.target=-Math.PI*.53;door.pivot.rotation.y=door.amount;}
   this.position.set(-4,0,7);this.heading=Math.PI;this.yaw=0;this.pitch=.18;this.currentFloor=0;
  }
  this.resetMotion();this.snapCamera=true;this.updateActivityUI();return true;
 },
 doActivity(){
  const a=this.activity;if(!a)return false;
  if(a.key==='basketball')return this.shootBasketball();
  if(a.key==='running'||a.key==='swimming'){this.toggleAutoRun();return true;}
  if(this.seated)return this.stand();
  if(this.room){const seat=this.room.seats.find(s=>s.floor===this.currentFloor&&!s.occupied&&s.x<0&&s.z>0);if(!seat)return false;
   // A visible quick-seat action walks the visitor into the selected seat's clear aisle.
   this.position.set(seat.x+.9,seat.y,seat.z);return this.sit(seat);}
  return false;
 },
 shootBasketball(){
  if(this.room||this.seated)return false;const c=this.sports.courts.filter(c=>distance(this.position,c.frame)<23).sort((a,b)=>distance(this.position,a.frame)-distance(this.position,b.frame))[0];
  if(!c){this.env.toast('先来到篮球场，再按 B 或点击投篮。');return false;}if(this.balls.some(b=>b.owner==='player'&&this.time-b.start<1.6))return false;
  const target=c.hoopPositions.slice().sort((a,b)=>distance(this.position,a)-distance(this.position,b))[0],origin=this.position.clone().add(new THREE.Vector3(0,1.45,0));
  const facing=new THREE.Vector3(Math.sin(this.yaw),0,-Math.cos(this.yaw)),toward=target.clone().sub(this.position).setY(0).normalize(),accuracy=facing.dot(toward),range=distance(this.position,target),made=accuracy>.94&&range<10;
  const end=target.clone();if(!made)end.add(new THREE.Vector3(facing.x*1.8,.3,facing.z*1.8));const ball=new THREE.Mesh(new THREE.SphereGeometry(.12,14,10),new THREE.MeshStandardMaterial({color:0xd8873d,roughness:.8}));this.world.add(ball);
  this.balls.push({mesh:ball,start:this.time,from:origin,to:end,made,owner:'player',scored:false});this.activityStats.shots++;this.shootingUntil=this.time+.7;this.env.toast(made?'出手！篮球飞向篮筐。':'出手！靠近篮筐并转动视野对准，更容易投进。');return true;
 },
 updateActivities(dt){
  if(!this.sports)return;
  for(const item of this.sports.groups)item.group.visible=!this.room&&(this.mode==='aerial'||distance(this.position,{x:item.feature.cx,z:item.feature.cz})<350);
  for(const n of this.activityActors){if(this.nightResidents?.handles(n))continue;const old=n.pos.clone();let speed=0,action=n.kind;
   if(n.kind==='runner'){n.meters+=n.speed*dt;n.pos.copy(pointOnTrack(n.track,n.meters));speed=n.speed;action='idle';}
   else if(n.kind==='basketball'){const t=this.time+n.phase;n.pos.copy(n.base);n.pos.x+=Math.sin(t*.7)*1.4;n.pos.z+=Math.cos(t*.5)*.9;speed=distance(old,n.pos)/Math.max(.001,dt);action=(t%8)>5.5?'shoot':'dribble';if(t%8>6.1&&n.lastShot!==Math.floor(t/8)){n.lastShot=Math.floor(t/8);const target=n.court.hoopPositions.slice().sort((a,b)=>distance(n.pos,a)-distance(n.pos,b))[0];const mesh=new THREE.Mesh(new THREE.SphereGeometry(.12,12,8),new THREE.MeshStandardMaterial({color:0xd8873d}));this.world.add(mesh);this.balls.push({mesh,start:this.time,from:n.pos.clone().add(new THREE.Vector3(0,1.5,0)),to:target.clone(),made:true,owner:n,scored:false});}}
   const root=this.root(n.rig);root.position.copy(n.pos);if(speed>.1)root.rotation.y=Math.atan2(n.pos.x-old.x,n.pos.z-old.z);root.visible=!this.room&&distance(this.position,n.pos)<100;
   if(n.kind==='basketball'&&action==='shoot'){const target=n.court.hoopPositions.slice().sort((a,b)=>distance(n.pos,a)-distance(n.pos,b))[0];root.rotation.y=Math.atan2(target.x-n.pos.x,target.z-n.pos.z);}
   if(root.visible){resetRolePose(n.rig);updateAvatar(n.rig,dt,speed,'idle');updateRoleAction(n.rig,dt,action);if(this.balls.some(b=>b.owner===n))for(const g of n.rig.roleGroups||[])if(g.name.endsWith(':basketball'))g.visible=false;}
  }
  for(let i=this.balls.length-1;i>=0;i--){const b=this.balls[i];b.mesh.visible=!this.room&&distance(this.position,b.from)<120;const t=(this.time-b.start)/1.15;if(t<=1){b.mesh.position.copy(b.from).lerp(b.to,t);b.mesh.position.y+=4*t*(1-t)*2.8;}else{const fall=(t-1)*1.15;b.mesh.position.copy(b.to);b.mesh.position.y=Math.max(.3,b.to.y-4.9*fall*fall);if(!b.scored){b.scored=true;if(b.made&&b.owner==='player'){this.activityStats.baskets++;this.env.toast('投进了！');}}}b.mesh.rotation.x+=dt*5;if(t>2.3){b.mesh.geometry.dispose();b.mesh.material.dispose();b.mesh.removeFromParent();this.balls.splice(i,1);}}
  if(this.activity?.key==='running'&&!this.room){const t=this.activity.track;let nearest=Infinity;for(let i=0;i<t.points.length;i++){const a=t.points[i],b=t.points[(i+1)%t.points.length],d=b.clone().sub(a),q=THREE.MathUtils.clamp(this.position.clone().sub(a).dot(d)/d.lengthSq(),0,1);nearest=Math.min(nearest,this.position.distanceTo(a.clone().addScaledVector(d,q)));}if(nearest<5&&this.speed>1)this.activityStats.runningMeters+=this.speed*dt;}
  if(this.frame%12===0)this.updateActivityUI();
 },
 updateActivityUI(){
  if(this.sportsSession)return this.updateSportsUI();
  const a=this.activity;$('activity-panel').hidden=!a;if(!a)return;$('activity-title').textContent=a.name;
  const descriptions={swimming:'走进水中自动游泳，移动鼠标转向；游到岸边自动恢复步行。',basketball:`面向篮筐投篮 · 已投 ${this.activityStats.shots} 次 / 命中 ${this.activityStats.baskets} 次`,running:`沿跑道移动鼠标转向 · 已跑 ${Math.round(this.activityStats.runningMeters)} 米`,classroom:'老师正在讲课，同学们已经入座。选择空位收听带字幕的课程。',dorm:'蓝田生活园区 · 室友在书桌学习、交谈，可坐下休息。',library:'找一个空位阅读，身边的同学正在自习。',dining:'同学们正在用餐，可以选择空位坐下。'};
  $('activity-description').textContent=descriptions[a.key];$('activity-primary').textContent=a.key==='basketball'?'投篮 · B':['running','swimming'].includes(a.key)?(this.autoRun?'停止持续前进 · H':a.key==='swimming'?'持续游泳 · H':'持续跑步 · H'):this.seated?'起身':a.key==='classroom'?'选择空位听课':'选择空位坐下';
 },
 getActivityState(){return {activity:this.activity?.key||null,actorCount:this.activityActors?.length||0,roles:[...new Set([...(this.npcs||[]),...(this.activityActors||[])].map(n=>n.rig.roleKey))],basketballCourts:this.sports?.courts.length||0,hoops:this.sports?.hoops||0,tracks:this.sports?.tracks.map(t=>({name:t.feature.name,id:t.feature.id,length:Math.round(t.length)}))||[],stats:this.activityStats,teacherCount:this.room?.teachers.length||0};}
};
