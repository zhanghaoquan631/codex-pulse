import * as THREE from './vendor/three.module.js';
import {createSportsGame} from './sports-gameplay.js?v=11';
import {createBaseballPractice,createBadmintonCourt} from './sports-models.js?v=11';
const $=id=>document.getElementById(id),clamp=THREE.MathUtils.clamp;
const TYPES={baseball:'棒球打击练习',badminton:'羽毛球对打'};
export const playableSportsMethods={
 makePlayableSports(){
  const field=this.sports.fields.find(f=>f.feature.id==='way/1115890437')||this.sports.fields.find(f=>f.feature.tags.sport==='soccer'&&f.width>42&&f.length>65);
  this.playableArenas={};if(!field)return;
  for(const [key,dx,dz,factory] of [['baseball',-12,15,createBaseballPractice],['badminton',12,0,createBadmintonCourt]]){
   const opponent=this.avatar(key==='baseball'?2:6),model=factory(THREE,{opponentRig:opponent});
   model.group.position.copy(field.frame.world(dx,dz));model.group.position.y=.24;model.group.rotation.y=field.frame.angle;this.world.add(model.group);
   const marker=new THREE.Mesh(new THREE.RingGeometry(.28,.4,32),new THREE.MeshBasicMaterial({color:0xf7bc50,side:THREE.DoubleSide,transparent:true,opacity:.8,depthWrite:false}));marker.rotation.x=-Math.PI/2;marker.position.y=.065;marker.visible=false;model.group.add(marker);
   const aim=new THREE.Mesh(new THREE.RingGeometry(.13,.19,24),new THREE.MeshBasicMaterial({color:0xfaf0b4,side:THREE.DoubleSide,transparent:true,opacity:.8,depthWrite:false}));aim.rotation.x=-Math.PI/2;aim.position.y=.07;aim.visible=false;model.group.add(aim);
   this.playableArenas[key]={key,model,marker,aim,field,name:'东区球场 · '+TYPES[key]};model.setBall({visible:false});model.group.visible=false;
  }
  $('sports-serve').onclick=()=>this.serveSports();$('sports-hit').onclick=()=>this.hitSports();$('sports-reset').onclick=()=>this.resetSportsGame();
 },
 startSportsGame(key){
    if(this.buildMode)this.toggleBuilding(false);
  const arena=this.playableArenas?.[key];if(!arena)return false;
  this.stopSportsGame();if(this.ride)this.leaveVehicle(true);if(this.room)this.leaveBuilding();if(this.seated)this.stand();this.cancelNavigation();this.releaseTaxiReservations();
  this.autoRun=false;this.demo=null;this.keys.clear();this.resetMotion();
  const game=createSportsGame(key,{seed:Math.floor(Math.random()*0xffffffff)});
  this.sportsSession={arena,game,boundRig:this.player,binding:arena.model.bindPlayer(this.player),oldDistance:this.cameraDistance,oldRunMode:this.runMode};
  this.activity={key,name:arena.name};this.position.copy(arena.model.toWorld(game.state.recommendedPosition));this.lastPosition.copy(this.position);
  this.yaw=-arena.model.group.rotation.y;this.heading=arena.model.group.rotation.y+Math.PI;this.pitch=.53;this.cameraDistance=key==='baseball'?10:11;this.runMode=true;this.setMode('third');this.snapCamera=true;
  document.body.classList.add('sports-playing');$('campus-life-menu').hidden=true;$('campus-life-toggle').setAttribute('aria-expanded','false');$('transport-panel').hidden=true;$('activity-panel').hidden=false;
  arena.model.group.visible=true;this.updateSportsUI();if(innerWidth>800)this.env.toast(TYPES[key]+'：J 发球，WASD 移动，鼠标左键或 K 击球。');return true;
 },
 stopSportsGame(){
  const s=this.sportsSession;if(!s)return false;s.binding?.dispose();s.arena.marker.visible=false;s.arena.aim.visible=false;s.arena.model.setBall({visible:false});
  this.cameraDistance=s.oldDistance;this.runMode=s.oldRunMode;this.camera.clearViewOffset();this.camera.userData.sportsOffset=0;this.sportsSession=null;this.autoRun=false;this.keys.clear();document.body.classList.remove('sports-playing');$('sports-controls').hidden=true;$('activity-primary').hidden=false;
  if(this.activity?.key===s.arena.key){this.activity=null;$('activity-panel').hidden=true;}return true;
 },
 sportsAim(){
  const s=this.sportsSession;if(!s)return null;const p=s.arena.model.toLocal(this.position),q=s.arena.model.toLocal(this.position.clone().add(new THREE.Vector3(Math.sin(this.yaw)*20,0,-Math.cos(this.yaw)*20)));
  const z=s.arena.key==='badminton'?-4.8:-40,ratio=q.z<p.z-.2?(z-p.z)/(q.z-p.z):0;
  return {x:clamp(p.x+(q.x-p.x)*ratio,s.arena.key==='badminton'?-4:-22,s.arena.key==='badminton'?4:22),z};
 },
 serveSports(){const s=this.sportsSession;if(!s)return false;const accepted=s.game.serve(s.arena.model.toLocal(this.position));this.updateSportsUI();return accepted;},
 hitSports(){const s=this.sportsSession;if(!s)return false;const accepted=s.game.hit(s.arena.model.toLocal(this.position),this.sportsAim());this.updateSportsUI();return accepted;},
 resetSportsGame(){const s=this.sportsSession;if(!s)return false;s.game.reset();this.position.copy(s.arena.model.toWorld(s.game.state.recommendedPosition));this.keys.clear();this.autoRun=false;this.resetMotion();this.updateSportsUI();return true;},
 updatePlayableSports(dt){
  for(const arena of Object.values(this.playableArenas||{}))arena.model.group.visible=!this.room&&(this.mode==='aerial'||this.position.distanceTo(arena.model.group.position)<170);
  const s=this.sportsSession;if(!s)return;
  if(this.activity?.key!==s.arena.key||this.room||this.ride||this.mode==='aerial'||this.mode==='fly'||this.position.distanceTo(s.arena.model.group.position)>40){this.stopSportsGame();return;}
  if(s.boundRig!==this.player){s.binding?.dispose();s.binding=s.arena.model.bindPlayer(this.player);s.boundRig=this.player;}
  const p=s.arena.model.toLocal(this.position),bounds=s.game.state.playerBounds;p.x=clamp(p.x,bounds.minX,bounds.maxX);p.z=clamp(p.z,bounds.minZ,bounds.maxZ);p.y=0;this.position.copy(s.arena.model.toWorld(p));
  this.grounded=true;this.velocityY=0;this.jumpBuffer=0;this.speed=Math.hypot(this.position.x-this.lastPosition.x,this.position.z-this.lastPosition.z)/Math.max(.001,dt);this.heading=s.arena.model.group.rotation.y+Math.PI;
  const state=s.game.update($('campus-life-menu').hidden&&!this.mapExpanded?dt:0,p,this.sportsAim());s.arena.model.setBall(state.ball);s.arena.model.setOpponentPose(state.opponent,state.animation.opponent);
  const landing=state.landing;s.arena.marker.visible=!!landing?.visible;if(landing){s.arena.marker.position.set(landing.x,.065,landing.z);s.arena.marker.material.color.setHex(landing.inBounds?0xf7bc50:0xec7862);}
  const aim=this.sportsAim();s.arena.aim.visible=state.phase!=='finished';s.arena.aim.position.set(aim.x,.07,aim.z);
  if(this.frame%6===0)this.updateSportsUI();
 },
 applyPlayableSportsPose(){const s=this.sportsSession;if(s){s.binding.update(s.game.state.animation.player);for(const g of this.player.roleGroups||[])if(/handItem|readingBook|basketball$/.test(g.name))g.visible=false;}},
 updateSportsUI(){
  const s=this.sportsSession;if(!s)return;const st=s.game.state,key=s.arena.key;
  $('activity-panel').hidden=false;$('activity-title').textContent=s.arena.name;$('activity-description').textContent=st.message||'J 发球，等待来球进入击球范围后点击。';$('activity-primary').hidden=true;$('sports-controls').hidden=false;
  $('sports-score').textContent=key==='badminton'?`你 ${st.score.player} : ${st.score.opponent} 对手`:`击球得分 ${st.score.player}`;
  $('sports-ready').textContent=st.finished?'本场结束 · 可重新开始':st.canServe?'按 J 发球':st.inReach?'来球已进入范围 · 点击击球':'移动到来球附近 · 留意黄色落点';
  $('sports-serve').disabled=!st.canServe;$('sports-hit').disabled=st.finished||st.canServe;
  const stats=st.stats||{};$('sports-detail').textContent=Object.entries(stats).filter(([k,v])=>typeof v==='number'&&['hits','misses','pitches','bestDistance','lastDistance','rallies','longestRally','rally'].includes(k)).map(([k,v])=>({hits:'命中',misses:'挥空',pitches:'投球',bestDistance:'最远距离',lastDistance:'本次距离',rallies:'回合',longestRally:'最长对打',rally:'本回合击球'}[k])+' '+(k.includes('Distance')?Math.round(v)+'m':v)).join(' · ');
 },
 getSportsGameState(){return this.sportsSession?{sportsGame:this.sportsSession.game.getState(),sportsLocation:this.sportsSession.arena.name}:{sportsGame:null};}
};
