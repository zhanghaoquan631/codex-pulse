import {validStreetPoints,moveCivilian,planarDistance,actorHeight} from './civilian-navigation.mjs';
import {bodySpaceFree} from './combat-navigation.mjs';
import {seesPlayer,wanderActor,followActor} from './npc-awareness.mjs';
export const EVACUATION_RULES=Object.freeze({introSeconds:10,total:15,target:5,reward:60,personHp:70,vehicleHp:180});
const pick=(a,random)=>a[Math.min(a.length-1,Math.floor(Math.max(0,random())*a.length))];
export function initializeEvacuation(level,random=Math.random){
  if(!level.hunt)return null;
  const points=validStreetPoints(level),farSpawns=points.filter(p=>planarDistance(p,level.spawn)>10),pool=farSpawns.length>=15?farSpawns:points;
  const used=[],place=()=>{const choices=pool.filter(p=>used.every(q=>planarDistance(p,q)>4));const p=pick(choices.length?choices:pool.filter(p=>used.every(q=>planarDistance(p,q)>1)),random)||level.spawn;used.push(p);return {...p,y:0,wanderSeed:1+Math.floor(random()*1e8)};};
  const far=points.filter(p=>planarDistance(p,level.spawn)>25&&planarDistance(p,level.hunt.target)>8);
  const zone=pick(far.length?far:points.filter(p=>planarDistance(p,level.spawn)>8),random)||points.at(-1)||level.spawn;
  const e={...EVACUATION_RULES,delivered:0,phase:'peace',status:'active',rewarded:false,safeZone:{...zone,radius:3,name:'旅人避难处'},people:[],vehicles:[],streetPoints:points};
  for(let i=0;i<15;i++)e.people.push({id:`civilian-${i+1}`,name:`旅人 ${i+1}`,...place(),hp:70,maxHp:70,alive:true,following:false,evacuated:false,insideVehicleId:null,radius:.32,height:1.65,grounded:true,vy:0,facingX:0,facingZ:1});
  for(let i=0;i<3;i++){
    const drivable=points.filter(p=>bodySpaceFree(level,p,1.2,1.5)),candidates=drivable.filter(p=>planarDistance(p,level.spawn)>7&&used.every(q=>planarDistance(p,q)>2.5));
    const p=pick(candidates.length?candidates:drivable,random)||level.spawn,vehicle={id:`civilian-car-${i+1}`,name:'避险车辆',...p,y:0,hp:180,maxHp:180,alive:true,radius:1.2,height:1.4,grounded:true,vy:0,facingX:0,facingZ:1,moving:false,parked:false,passengerIds:[`civilian-${10+i*2}`,`civilian-${11+i*2}`],routeTarget:drivable[(i*7+3)%drivable.length]||p};
    used.push(p);e.vehicles.push(vehicle);
    for(const id of vehicle.passengerIds)Object.assign(e.people.find(n=>n.id===id),{x:p.x,z:p.z,insideVehicleId:vehicle.id});
  }
  level.evacuation=e;return e;
}
function unload(level,vehicle,events){
  const e=level.evacuation;
  for(const p of e.people.filter(n=>n.insideVehicleId===vehicle.id)){
    let exit=null;
    for(const r of [1.6,2.2,3,4]){for(let n=0;n<12;n++){const a=n*Math.PI/6,q={x:vehicle.x+Math.cos(a)*r,y:0,z:vehicle.z+Math.sin(a)*r};if(bodySpaceFree(level,q,.34,1.65)&&e.people.every(other=>other===p||other.insideVehicleId||!other.alive||planarDistance(other,q)>.7)){exit=q;break;}}if(exit)break;}
    Object.assign(p,exit||{x:vehicle.x,y:0,z:vehicle.z});p.insideVehicleId=null;p.following=false;
  }
  vehicle.parked=true;vehicle.moving=false;events.push({type:'vehicle-unloaded',text:'车辆停靠，乘客已下车避险。',vehicleId:vehicle.id});
}
export function damageCivilian(level,id,amount,owner){
  const p=level.evacuation?.people.find(n=>n.id===id);if(!p?.alive||p.evacuated||p.insideVehicleId||!(amount>0))return [];
  p.hp=Math.max(0,p.hp-amount);p.hitFlash=.25;if(p.hp)return [];
  p.alive=false;p.following=false;p.moving=false;return[{type:'civilian-lost',text:`${p.name}遇难，尽快带领其他人撤离。`,civilianId:id,owner}];
}
export function damageVehicle(level,id,amount,owner){
  const v=level.evacuation?.vehicles.find(n=>n.id===id);if(!v?.alive||!(amount>0))return [];
  v.hp=Math.max(0,v.hp-amount);if(v.hp)return [];
  v.alive=false;const events=[];unload(level,v,events);events.push({type:'vehicle-lost',text:'车辆损毁，乘客紧急下车。',vehicleId:id,owner});return events;
}
export function stepEvacuation(level,player,dt){
  const e=level.evacuation;if(!e)return [];const events=[];
  if(level.elapsed>=10&&e.phase==='peace'){e.phase='evacuating';events.push({type:'evacuation-start',text:'怪物来袭！靠近旅人带领他们，送至少 5 人到地图「安」。'});}
  const threats=level.enemies.filter(n=>n.alive&&n.active!==false);
  for(const v of e.vehicles){
    if(!v.alive||v.parked)continue;
    if(e.phase==='evacuating'){
      if(!v.hideTarget){const hide=e.streetPoints.reduce((best,p)=>{const score=q=>Math.min(35,...threats.map(n=>planarDistance(n,q)))-planarDistance(v,q)*.2;return score(p)>score(best)?p:best;},v);v.hideTarget={x:hide.x,y:hide.y||0,z:hide.z};v.escapeUntil=level.elapsed+2;}
      moveCivilian(level,v,v.hideTarget,3.3,dt);
      if(level.elapsed>=v.escapeUntil||planarDistance(v,v.hideTarget)<1)unload(level,v,events);
    }else{moveCivilian(level,v,v.routeTarget,1.3,dt);if(planarDistance(v,v.routeTarget)<1)v.routeTarget=e.streetPoints[(e.vehicles.indexOf(v)*11+5)%e.streetPoints.length];}
    for(const p of e.people.filter(n=>n.insideVehicleId===v.id))Object.assign(p,{x:v.x,y:v.y,z:v.z});
  }
  for(const p of e.people){
    p.hitFlash=Math.max(0,(p.hitFlash||0)-dt);if(!p.alive||p.evacuated||p.insideVehicleId)continue;
    if(!p.following&&seesPlayer(level,p,player)){p.following=true;events.push({type:'notice',text:`${p.name}看见了你，已加入跟随队伍。`});}
    if(e.phase==='peace'&&!p.following){wanderActor(level,p,e.streetPoints,dt,2.7);continue;}
    if(p.following){
      if(planarDistance(p,e.safeZone)<=e.safeZone.radius&&Math.abs(p.y)<.5){p.evacuated=true;p.following=false;p.moving=false;e.delivered++;events.push({type:'civilian-delivered',text:`已送达 ${e.delivered} / ${e.target} 位旅人。`,civilianId:p.id});continue;}
      if(planarDistance(player,e.safeZone)<e.safeZone.radius){p.sprinting=player.sprinting;moveCivilian(level,p,e.safeZone,player.sprinting?7.6:4.5,dt);}
      else followActor(level,p,player,dt,e.people.indexOf(p));
    }else{
      p.hideTimer=(p.hideTimer||0)-dt;
      if(p.hideTimer<=0){p.hideTimer=3;const options=e.streetPoints.filter(q=>planarDistance(p,q)<22);const hide=options.reduce((best,q)=>{const score=t=>Math.min(30,...threats.map(n=>planarDistance(n,t)))-planarDistance(p,t)*.25;return score(q)>score(best)?q:best;},p);p.hideTarget={x:hide.x,y:hide.y||0,z:hide.z};}
      if(planarDistance(p,p.hideTarget)<.6)wanderActor(level,p,e.streetPoints,dt,3.8);else{moveCivilian(level,p,p.hideTarget,3.8,dt);p.sprinting=p.moving;}
    }
  }
  if(e.delivered>=e.target&&e.status!=='complete'){e.status='complete';events.push({type:'evacuation-complete',text:'护送成功！至少 5 人安全抵达，获得 60 金币。',gold:60});}
  if(e.status==='active'&&e.people.filter(p=>p.alive).length<e.target){e.status='failed';events.push({type:'evacuation-failed',text:'存活旅人不足 5 人，护送支线失败；仍可完成主线。'});}
  return events;
}
