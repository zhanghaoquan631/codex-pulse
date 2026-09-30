import {groundHeight} from './landforms.mjs';
import {bodySpaceFree} from './combat-navigation.mjs';
import {segmentBoxDistance} from './camera-math.mjs';

const clamp=(v,a,b)=>Math.max(a,Math.min(b,v));
const finite=(v,fallback=0)=>Number.isFinite(v)?v:fallback;
const profiles=Object.freeze({
  stand:Object.freeze({id:'stand',height:1.7,radius:.38,speedMultiplier:1,eyeHeight:1.52,muzzleHeight:1.25,sprintAllowed:true}),
  crouch:Object.freeze({id:'crouch',height:1.05,radius:.38,speedMultiplier:.55,eyeHeight:.85,muzzleHeight:.70,sprintAllowed:false}),
  prone:Object.freeze({id:'prone',height:.5,radius:.43,speedMultiplier:.25,eyeHeight:.36,muzzleHeight:.27,sprintAllowed:false}),
});

export function stanceProfile(playerOrId){return profiles[typeof playerOrId==='string'?playerOrId:playerOrId?.stance]||profiles.stand;}
export function resetPlayerTactics(player){Object.assign(player,{stance:'stand',height:profiles.stand.height,radius:profiles.stand.radius,lean:0,leanTarget:0,tacticsYaw:0});}

/** Stance changes preserve position and feet support; raising never clips a ceiling. */
export function setPlayerStance(level,player,id){
  const before=stanceProfile(player),next=profiles[id];
  if(!next)return {ok:false,stance:before.id,reason:'未知姿态'};
  if(next===before){player.stance=next.id;player.height=next.height;player.radius=next.radius;return {ok:true,stance:next.id};}
  if(player.vault||player.grounded===false)return {ok:false,stance:before.id,reason:'落地或完成翻越后再切换姿态'};
  if(!bodySpaceFree(level,player,next.radius,next.height))return {ok:false,stance:before.id,reason:next.height>before.height?'头顶空间不足，无法起身':'周围空间不足，无法趴下'};
  player.stance=next.id;player.height=next.height;player.radius=next.radius;
  if(!next.sprintAllowed)player.sprinting=false;
  return {ok:true,stance:next.id};
}

function yawFor(player,yaw){return finite(yaw,finite(player.tacticsYaw,Math.atan2(-finite(player.facingX),-finite(player.facingZ,-1))));}
function base(level,player){return groundHeight(level,player.x,player.z)+finite(player.y);}
const solids=level=>[...(level.walls||[]),...(level.doors||[]).filter(d=>!d.open)];

/** Sweep both head and muzzle sideways. Even a thin wall between endpoints blocks leaning. */
export function playerLeanOffset(level,player,yaw){
  const angle=yawFor(player,yaw),requested=clamp(finite(player.lean),-1,1)*.32;
  if(!requested||player.vault||player.grounded===false)return {x:0,z:0,amount:0};
  const right={x:Math.cos(angle)*Math.sign(requested),y:0,z:-Math.sin(angle)*Math.sign(requested)},profile=stanceProfile(player),floor=base(level,player);
  let range=Math.abs(requested);
  for(const [height,radius] of [[profile.eyeHeight,.12],[profile.muzzleHeight,.10]]){
    const origin={x:player.x,y:floor+height,z:player.z};
    for(const box of solids(level)){
      const hit=segmentBoxDistance(origin,right,box,range,radius);
      if(hit!==null)range=Math.max(0,Math.min(range,hit-.012));
    }
    // Keep the entire head/gun volume on valid space at the world boundary too.
    const free=length=>bodySpaceFree(level,{x:player.x+right.x*length,z:player.z+right.z*length,absoluteY:floor+height-radius},radius,radius*2);
    if(!free(range)){
      let lo=0,hi=range;
      if(!free(0))range=0;
      else {for(let i=0;i<12;i++){const mid=(lo+hi)/2;if(free(mid))lo=mid;else hi=mid;}range=lo;}
    }
  }
  return {x:right.x*range,z:right.z*range,amount:Math.sign(requested)*range/.32};
}

/** Returned eye and muzzle coordinates are absolute world positions, not relative player.y. */
export function playerEye(level,player,yaw){const offset=playerLeanOffset(level,player,yaw);return {x:player.x+offset.x,y:base(level,player)+stanceProfile(player).eyeHeight,z:player.z+offset.z};}
export function playerMuzzle(level,player,yaw){const offset=playerLeanOffset(level,player,yaw);return {x:player.x+offset.x,y:base(level,player)+stanceProfile(player).muzzleHeight,z:player.z+offset.z};}

/** Call every physics substep. No key handlers, time source, DOM or persistent storage. */
export function stepPlayerTactics(level,player,seconds,{stance,lean=0,yaw}={}){
  if(stance)setPlayerStance(level,player,stance);
  const profile=stanceProfile(player);player.stance=profile.id;player.height=profile.height;player.radius=profile.radius;
  player.tacticsYaw=yawFor(player,yaw);
  player.leanTarget=player.vault||player.grounded===false?0:clamp(finite(lean),-1,1);
  const blend=1-Math.exp(-14*clamp(finite(seconds),0,.25));
  player.lean=finite(player.lean)+(player.leanTarget-finite(player.lean))*blend;
  if(Math.abs(player.lean)<.0001)player.lean=0;
  // Clamp actual state immediately when movement/yaw brings a wall into the swept path.
  player.lean=playerLeanOffset(level,player,player.tacticsYaw).amount;
  if(!profile.sprintAllowed)player.sprinting=false;
  return profile;
}
