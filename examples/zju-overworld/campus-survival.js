import * as THREE from './vendor/three.module.js';
const STAFF={name:'守夜木杖',damage:38,range:3.8,cooldown:.55};
import {applyCollapsePose,resetCollapsePose} from './collapse-pose.js?v=11';
import {updateNightVehicles} from './night-vehicles.js?v=11';
import {createMonster} from './monster-models.js?v=11';
import {createShelterIndex} from './survival-shelter.js?v=11';
import {createNightResidents} from './night-residents.js?v=11';
import {createNavigationEnvironment} from './nav-worker.js?v=11';
const $=id=>document.getElementById(id),dist=(a,b)=>Math.hypot(a.x-b.x,a.z-b.z);
const SPEC={wolf:{name:'灰狼',speed:3.6,hp:65,damage:12},tiger:{name:'老虎',speed:4.3,hp:95,damage:18},lion:{name:'狮子',speed:3.3,hp:120,damage:20},lantern:{name:'灯鬼',speed:2.6,hp:75,damage:14,windup:.85},bear:{name:'黑熊',speed:2.5,hp:160,damage:24,windup:1},boar:{name:'野猪',speed:4.5,hp:85,damage:17,windup:.55},spider:{name:'巨蛛',speed:4.1,hp:55,damage:10,windup:.4},bat:{name:'夜蝠',speed:3.9,hp:42,damage:8,windup:.45},treant:{name:'树怪',speed:1.7,hp:180,damage:26,windup:1.15},frostfox:{name:'霜狐',speed:4.6,hp:60,damage:11,windup:.5}};
export const survivalMethods={
 makeSurvival(){
  this.survival={enabled:true,night:false,hp:100,kills:0,survived:0,deaths:0,dead:false,invulnerable:0,swing:0,spawnIn:0,sequence:0,nightFailed:false};this.monsters=[];this.nightResidents=createNightResidents(this);
  const clean=f=>({p:f.p,h:f.h,box:f.box,width:f.width,type:f.type,tags:{bridge:f.tags?.bridge}});
  this.monsterTerrain=createNavigationEnvironment({world:{buildings:this.env.buildings.map(clean),waters:this.env.waters.map(clean),roads:this.env.roads.map(clean)},bounds:this.env.bounds}).walkable;
  const weapon=new THREE.Group(),gold=new THREE.MeshStandardMaterial({color:0xc6a36b,roughness:.55}),glow=new THREE.MeshStandardMaterial({color:0xffe8ab,emissive:0xeab35d,emissiveIntensity:1.3});
  const shaft=new THREE.Mesh(new THREE.CylinderGeometry(.035,.045,.72,8),gold),head=new THREE.Mesh(new THREE.OctahedronGeometry(.1),glow);shaft.position.y=.2;head.position.y=.64;weapon.add(shaft,head);this.world.add(weapon);this.survivalWeapon=weapon;
  $('survival-toggle').onclick=()=>{$('survival-panel').hidden=!$('survival-panel').hidden;this.keys.clear();};$('survival-close').onclick=()=>$('survival-panel').hidden=true;
  $('survival-enabled').onchange=e=>this.setSurvivalEnabled(e.target.checked);
  $('survival-night').onclick=()=>{this.setSurvivalEnabled(true);this.atmosphere.autoTime=true;$('time-auto').checked=true;this.atmosphere.setHour(18.5);$('survival-panel').hidden=true;this.env.toast('夜幕降临。R 跑步，进入房间躲避，点击附近怪物或按 K 挥动守夜杖。');};
  $('survival-build').onclick=()=>{$('survival-panel').hidden=true;this.toggleBuilding(true);};
  $('survival-attack').onclick=()=>this.attackMonster();$('survival-rest').onclick=()=>this.restSurvival();$('survival-respawn').onclick=()=>this.respawnSurvival();
  // During the visible collapse, block all gameplay controls until respawn.
  for(const event of ['click','pointerdown','pointerup','keydown'])document.addEventListener(event,e=>{if(!this.survival.dead)return;if(e.type==='keydown'&&e.code==='Tab'&&this.survival.collapse>=1){e.preventDefault();$('survival-respawn').focus();return;}if(!e.target.closest?.('#survival-respawn')){e.preventDefault();e.stopImmediatePropagation();}},true);
  $('creatures-open').onclick=$('survival-toggle').onclick;
  this.updateSurvivalUI();
 },
 setSurvivalEnabled(active){
  const s=this.survival;s.enabled=!!active;$('survival-enabled').checked=!!active;if(!active){document.body.classList.remove('survival-dying');resetCollapsePose(this.player);this.clearMonsters();s.night=false;s.hp=100;s.dead=false;$('survival-death').hidden=true;this.nightResidents?.setNight(false);}this.updateSurvivalUI();
 },
 prepareSurvival(dt){
  const s=this.survival;if(!s)return;const h=this.atmosphere.hour,night=s.enabled&&(h>=18||h<6);
  this.nightResidents.setNight(s.enabled&&(h>=16||h<6));
  if(night!==s.night){
   s.night=night;s.spawnIn=.8;
   if(night){s.nightFailed=false;s.spawnOrder=['wolf','tiger','lion','lantern',...['bear','boar','spider','bat','treant','frostfox'].sort(()=>Math.random()-.5)];s.spawnCursor=0;this.env.toast('天黑了：学生正在回房。十种夜行怪物会轮换出现，房间能保护你。');}
   else{this.clearMonsters();if(s.enabled&&!s.nightFailed&&!s.dead){s.survived++;s.hp=Math.min(100,s.hp+25);this.env.toast('天亮了！平安度过一夜，恢复 25 点生命。');}}
  }
  updateNightVehicles(this);this.nightResidents.update(dt);
 },
 survivalShelter(p=this.position){
  if(this.room)return {id:this.room.feature.id,name:this.room.name,campus:true};
  if(this.shelterRevision!==this.buildRevision||!this.shelterIndex){this.shelterIndex=createShelterIndex(this.buildBlocks.values());this.shelterRevision=this.buildRevision;}
  return this.shelterIndex.find(p);
 },
 monsterWalkable(x,z){
  if(!this.monsterTerrain(x,z))return false;
  for(const b of this.buildBlocks.values())if(Math.abs(b.x+.5-x)<1.5&&Math.abs(b.z+.5-z)<1.5&&this.buildBlockCollision(b,x,.16,z,true))return false;
  return true;
 },
 monsterLineClear(a,b){
  const length=dist(a,b),steps=Math.ceil(length/.3);for(let i=1;i<steps;i++){const x=a.x+(b.x-a.x)*i/steps,z=a.z+(b.z-a.z)*i/steps;if(!this.monsterWalkable(x,z))return false;}return true;
 },
 monsterStepClear(m,x,z,chase){
  if(!this.monsterWalkable(x,z)||chase&&dist(this.position,{x,z})<1.5)return false;
  return !this.monsters.some(other=>other!==m&&other.hp>0&&dist(other.group.position,{x,z})<1.35);
 },
 spawnMonster(type){
  const s=this.survival,center=this.room?this.doorWorld(this.room.feature.entrance,0,5):this.position;
  for(let i=0;i<40;i++){const a=(s.sequence*2.399+i*.83),r=18+(i%6)*3,x=center.x+Math.sin(a)*r,z=center.z+Math.cos(a)*r;if(!this.monsterWalkable(x,z))continue;
   const order=s.spawnOrder||Object.keys(SPEC),kind=type||order[(s.spawnCursor||0)%order.length];if(!type)s.spawnCursor=(s.spawnCursor||0)+1;const spec=SPEC[kind],model=createMonster(THREE,kind,s.sequence++);model.group.position.set(x,.16,z);this.world.add(model.group);
   const m={...model,type:kind,spec,hp:spec.hp,attack:0,cooldown:0,hit:0,deadFor:0,age:0,home:new THREE.Vector3(x,.16,z),seed:s.sequence,stuck:0};this.monsters.push(m);return m;
  }return null;
 },
 clearMonsters(){for(const m of this.monsters||[]){m.group.removeFromParent();m.dispose();}this.monsters=[];},
 attackMonster(){
  const s=this.survival;if(!s?.enabled||s.dead||!s.night||this.buildMode||this.sportsSession||this.room||this.ride||['aerial','fly'].includes(this.mode)||s.swing>0)return false;
  const weapon=STAFF;s.swing=weapon.cooldown;let hits=0;const a=this.overworld&&this.mode==='third'?this.heading:Math.PI-this.yaw,facing={x:Math.sin(a),z:Math.cos(a)};
  for(const m of this.monsters){const p=m.group.position,d=dist(this.position,p);if(m.hp<=0||d>weapon.range||Math.abs(p.y-this.position.y)>2.2)continue;if(!weapon.area&&d>.01&&((p.x-this.position.x)*facing.x+(p.z-this.position.z)*facing.z)/d<.25)continue;if(!this.monsterLineClear(this.position,p))continue;
   m.hp-=weapon.damage;m.hit=.32;m.attack=0;m.cooldown=1.1;hits++;const dx=(p.x-this.position.x)/(d||1),dz=(p.z-this.position.z)/(d||1);for(let i=0;i<6;i++)if(this.monsterWalkable(p.x+dx*.18,p.z+dz*.18)){p.x+=dx*.18;p.z+=dz*.18;}
   if(m.hp<=0){s.kills++;this.env.toast(`击退${m.spec.name}！`);}
  }
  s.lastStrike=hits?'击中了！':'挥杖 · 对准 3.8 米内的怪物';this.updateSurvivalUI();return true;
 },
 damageSurvival(amount,name){
  const s=this.survival;if(!s.enabled||s.dead||s.invulnerable>0||this.sportsSession||this.survivalShelter())return false;
  s.hp=Math.max(0,s.hp-amount);s.invulnerable=1.25;s.hurt=.4;this.env.toast(`${name}击中你，生命 −${amount}。按 R 跑向房间！`);
  if(s.hp===0){document.body.classList.add('survival-dying');$('campus-life-menu').hidden=true;$('campus-life-toggle').setAttribute('aria-expanded','false');$('survival-panel').hidden=true;s.dead=true;s.nightFailed=true;s.deaths++;this.keys.clear();this.autoRun=false;this.cancelNavigation();this.stopSportsGame();if(this.ride)this.leaveVehicle(true);if(this.buildMode)this.toggleBuilding(false);this.setMode('third');s.collapse=0;this.climbing=null;this.demo=null;document.exitPointerLock?.();$('survival-death').hidden=true;}
  return true;
 },
 restSurvival(){
  const safe=this.survivalShelter();if(!safe){this.env.toast('先走进有完整围墙和屋顶的自建房，或校园房间。');return false;}
  const bed=[...this.buildBlocks.values()].find(b=>b.type==='bed'&&dist({x:b.x+.5,z:b.z+.5},this.position)<2.5&&Math.abs(.16+b.y-this.position.y)<1);
  if(!this.room&&!bed){this.env.toast('在屋内放一张床，并走到床边 2.5 米内。');return false;}
  const s=this.survival;if(s.dead)return false;s.hp=100;s.checkpoint=this.room?{featureId:this.room.feature.id}:{x:this.position.x,y:this.position.y,z:this.position.z};this.env.toast('已休息并恢复生命，这间房已设为重生地点。');this.updateSurvivalUI();return true;
 },
 respawnSurvival(){
  const s=this.survival;if(this.buildMode)this.toggleBuilding(false);if(this.room)this.leaveBuilding();if(this.ride)this.leaveVehicle(true);
  let restored=false;const cp=s.checkpoint;if(cp&&!cp.featureId&&this.survivalShelter(cp)&&!this.isBlocked(cp.x,cp.y,cp.z)&&Math.abs(this.floorHeight(cp.x,cp.z,cp.y)-cp.y)<.2){this.position.set(cp.x,cp.y,cp.z);this.setMode('third');restored=true;}
  if(!restored){const f=this.env.buildings.find(f=>f.id===cp?.featureId)||this.env.buildings.find(f=>f.name==='蓝田1舍')||this.env.buildings.find(f=>f.entrance);this.enterBuilding(f);}
  this.keys.clear();this.resetMotion();resetCollapsePose(this.player);document.body.classList.remove('survival-dying');s.collapse=0;s.hp=100;s.dead=false;s.invulnerable=5;$('survival-death').hidden=true;this.snapCamera=true;this.clearMonsters();s.kills=0;s.survived=0;s.nightFailed=false;s.night=false;this.atmosphere.setHour(8);this.prepareSurvival(0);this.updateSurvivalUI();this.env.toast('新的一天开始，已在安全房间恢复生命。');
 },
 updateSurvival(dt){
  const s=this.survival;if(!s)return;s.invulnerable=Math.max(0,s.invulnerable-dt);s.swing=Math.max(0,s.swing-dt);s.hurt=Math.max(0,(s.hurt||0)-dt);
  const safe=this.survivalShelter();s.safe=!!safe;s.safeName=safe?.name||(safe?'自建庇护所':'室外');
  const play=s.enabled&&!s.dead&&!this.room&&!this.ride&&!this.sportsSession&&!['aerial','fly'].includes(this.mode),center=this.room?this.doorWorld(this.room.feature.entrance,0,5):this.position;
  if(s.night&&!s.dead){s.spawnIn-=dt;if(s.spawnIn<=0){if(this.monsters.filter(m=>m.hp>0).length<10)this.spawnMonster();s.spawnIn=this.monsters.length<10?3:8;}}
  let nearest=null;
  for(let i=this.monsters.length-1;i>=0;i--){
   const m=this.monsters[i],p=m.group.position;m.age+=dt;m.hit=Math.max(0,m.hit-dt);m.cooldown=Math.max(0,m.cooldown-dt);
   if(m.hp<=0){m.deadFor+=dt;m.update(dt,{dead:Math.min(1,m.deadFor*2),speed:0});if(m.deadFor>1.6){m.group.removeFromParent();m.dispose();this.monsters.splice(i,1);}continue;}
   const d=dist(center,p);m.group.visible=!this.room&&this.mode!=='aerial'&&d<170;
   if(d>190&&m.age>15){m.group.removeFromParent();m.dispose();this.monsters.splice(i,1);continue;}
   const chase=play&&!safe&&d<48&&Math.abs(this.position.y-p.y)<2.5;
   if(chase&&(!nearest||d<nearest.distance))nearest={name:m.spec.name,distance:d,type:m.type};
   let speed=0;
   if(m.attack>0){m.attack-=dt;if(m.attack<=0){if(chase&&d<2.5&&this.monsterLineClear(p,this.position))this.damageSurvival(m.spec.damage,m.spec.name);m.cooldown=1.7;}}
   else if(chase&&d<2.2&&m.cooldown===0&&this.monsterLineClear(p,this.position)){m.attack=m.spec.windup||.65;}
   else{
    // Retreat from protected entrances. Creatures never change to an interior
    // scene, and every ground movement step is checked against solid walls.
    const retreat=safe&&d<10,target=chase?(d<6?{x:this.position.x+Math.sin(m.seed*2.399)*1.9,z:this.position.z+Math.cos(m.seed*2.399)*1.9}:this.position):retreat?{x:p.x+(p.x-center.x)*3,z:p.z+(p.z-center.z)*3}:{x:m.home.x+Math.sin(m.age*.14+m.seed)*7,z:m.home.z+Math.cos(m.age*.11+m.seed)*7};
    const zigzag=chase&&['bat','frostfox','spider'].includes(m.type)?Math.sin(m.age*3.2+m.seed)*.27:0,angle=Math.atan2(target.x-p.x,target.z-p.z)+zigzag,amount=(chase?m.spec.speed:1.05)*dt;
    if(dist(target,p)>(chase?.12:.4)){for(const turn of [0,.5,-.5,1,-1,1.55,-1.55,2.2,-2.2,Math.PI]){const a=angle+turn,dx=Math.sin(a)*amount,dz=Math.cos(a)*amount;
      if(this.monsterStepClear(m,p.x+dx,p.z+dz,chase)&&this.monsterWalkable(p.x+dx*.5,p.z+dz*.5)){p.x+=dx;p.z+=dz;m.group.rotation.y+=Math.atan2(Math.sin(a-m.group.rotation.y),Math.cos(a-m.group.rotation.y))*Math.min(1,dt*9);speed=amount/dt;break;}}
    }
   }
   m.update(dt,{speed,attack:m.attack>0,hit:m.hit>0});
  }
  s.nearest=nearest;$('survival-hurt').style.opacity=String(s.hurt>0?Math.min(.65,s.hurt*2):0);
  const w=this.survivalWeapon;w.visible=play&&s.night&&!this.buildMode&&!this.sportsSession;
  if(w.visible){const a=this.overworld&&this.mode==='third'?Math.PI-this.heading:this.yaw,duration=STAFF.cooldown,sw=Math.sin((1-s.swing/duration)*Math.PI)*(s.swing>0?1:0),first=this.mode==='walk',side=first?.32:.43,forward=first?.7:.25;w.position.set(this.position.x+Math.cos(a)*side+Math.sin(a)*forward,this.position.y+.52,this.position.z+Math.sin(a)*side-Math.cos(a)*forward);w.rotation.set(sw*1.4,a,-.3-sw*1.8);}
  if(s.dead){s.collapse=Math.min(1,(s.collapse||0)+dt/3);this.root(this.player).visible=true;applyCollapsePose(THREE,this.player,s.collapse);const opening=s.collapse>=1&&$('survival-death').hidden;$('survival-death').hidden=s.collapse<1;if(opening)$('survival-respawn').focus();}
  if(this.frame%6===0||s.dead)this.updateSurvivalUI();
 },
 updateSurvivalUI(){
  const s=this.survival;if(!s)return;const h=this.atmosphere?.hour??13,time=`${String(Math.floor(h)).padStart(2,'0')}:${String(Math.floor(h%1*60)).padStart(2,'0')}`;
  $('survival-hud').hidden=!s.enabled;document.body.classList.toggle('survival-night',s.enabled&&s.night);$('survival-phase').textContent=`${s.night?'☾ 夜间生存':h>=16?'◒ 黄昏 · 回屋准备':'☀ 白天探索'} · ${time}`;
  $('survival-hp').value=s.hp;$('survival-health').textContent=`${s.hp} / 100`;$('survival-safe').textContent=s.safe?'⌂ 安全 · '+s.safeName:['aerial','fly'].includes(this.mode)?'飞行观察 · 回到地面参与生存':s.night?'⚠ 室外危险 · R 跑向房间':'18:00 动物与怪兽出没 · 点击玩法可立即入夜';$('survival-safe').dataset.safe=String(!!s.safe);
  const residents=this.nightResidents?.getState(false)||{};$('survival-residents').textContent=this.nightResidents?`学生归家 ${residents.inside??0} / ${residents.total??0}`:'';
  $('survival-threat').textContent=s.nearest?`${s.nearest.name} · ${Math.round(s.nearest.distance)}m · 面向它挥杖`:'点击近处怪物 / K 挥杖 · R 跑步';
  $('survival-score').textContent=`平安 ${s.survived} 夜 · 击退 ${s.kills} · 重生 ${s.deaths} 次`;$('survival-attack').hidden=!s.night||!!this.room||!!this.buildMode||!!this.sportsSession;$('survival-attack').disabled=s.dead||s.swing>0;$('survival-attack').textContent=STAFF.name+' · K';
  const remaining=((s.night?6:18)-h+24)%24*45;const minutes=Math.floor(remaining/60),seconds=Math.floor(remaining%60);$('night-countdown').textContent=this.atmosphere.autoTime?`${s.night?'距离天亮':'距离入夜'} ${minutes}:${String(seconds).padStart(2,'0')}`:'时间已暂停 · 可在天气中调整';
  $('survival-rest').hidden=!s.safe;$('survival-rest').disabled=s.dead;
 },
 getSurvivalState(){const s=this.survival;return {survival:s?{...s,residents:this.nightResidents.getState(false),monsters:this.monsters.map(m=>({type:m.type,hp:m.hp,position:{x:m.group.position.x,y:m.group.position.y,z:m.group.position.z},attack:m.attack}))}:null};}
};
