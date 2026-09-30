import {validStreetPoints,moveCivilian,planarDistance} from './civilian-navigation.mjs';
import {groundHeight} from './landforms.mjs';
import {bodySpaceFree} from './combat-navigation.mjs';
import {seesPlayer,wanderActor,followActor} from './npc-awareness.mjs';
export function initializeMerchants(level,random=Math.random){
  if(!level.hunt)return;
  const ground=level.evacuation?.streetPoints||validStreetPoints(level);
  const upstairs=(level.traversal?.chipSpawns||[]).map(p=>({...p,y:p.y-groundHeight(level,p.x,p.z)})).filter(p=>bodySpaceFree(level,p,.36,1.7));
  level.merchantHidePoints=[...ground,...upstairs];
  for(const n of level.npcs.filter(n=>n.type==='merchant'||n.type==='shop')){
    const occupied=[...(level.evacuation?.people||[]).filter(p=>!p.insideVehicleId),...(level.evacuation?.vehicles||[]),...level.npcs.filter(p=>p!==n&&p.alive)];
    const choices=[...ground.filter(p=>planarDistance(p,level.spawn)>10),...upstairs].filter(p=>occupied.every(q=>planarDistance(p,q)>2));
    const at=choices[Math.min(choices.length-1,Math.floor(random()*choices.length))]||level.spawn;
    Object.assign(n,at,{hp:120,maxHp:120,alive:true,radius:.36,height:1.7,grounded:true,vy:0,fleeing:false,moving:false,hideCooldown:0,facingX:0,facingZ:1,following:false,sprinting:false,wanderSeed:1+Math.floor(random()*1e8)});
  }
}
export function damageMerchant(level,id,amount,owner){
  const n=level.npcs.find(n=>n.id===id);if(!n?.alive||!Number.isFinite(n.hp)||!(amount>0))return [];
  n.hp=Math.max(0,n.hp-amount);n.hideCooldown=0;
  if(n.hp)return [];n.alive=false;n.fleeing=false;n.moving=false;
  return[{type:'merchant-lost',text:'行商遇难，本次关内已无法购买装备。',npcId:id,owner}];
}
export function stepMerchants(level,dt,player){
  if(!level.hunt)return [];
  const threats=level.enemies.filter(e=>e.alive&&e.active!==false),events=[];
  for(const n of level.npcs.filter(n=>n.alive&&Number.isFinite(n.hp))){
    const near=threats.filter(e=>planarDistance(e,n)<18);n.hideCooldown-=dt;
    if(!n.following&&seesPlayer(level,n,player)){n.following=true;events.push({type:'notice',text:'行商已看见你，会跟随你转移；遇敌时先避险。'});}
    if(near.length&&n.hideCooldown<=0){
      n.hideCooldown=2.5;
      const options=(level.merchantHidePoints||[]).filter(p=>bodySpaceFree(level,p,.36,1.7)&&(p.y<.5||level.traversal?.ramps?.some(r=>r.roomId===p.roomId)));
      const score=p=>Math.min(45,...threats.map(e=>planarDistance(e,p)))-planarDistance(n,p)*.35+(p.y>1.5?3:0);
      const hide=options.reduce((best,p)=>score(p)>score(best)?p:best,n);n.hideTarget={x:hide.x,y:hide.y||0,z:hide.z};n.fleeing=planarDistance(n,n.hideTarget)>.6;
    }
    if(near.length&&n.hideTarget&&planarDistance(n,n.hideTarget)>.4){n.fleeing=true;moveCivilian(level,n,n.hideTarget,7.6,dt);n.sprinting=n.moving;}
    else{n.fleeing=false;if(n.following&&player)followActor(level,n,player,dt,16);else wanderActor(level,n,level.merchantHidePoints||[],dt,near.length?5.8:2.8);}
  }
  return events;
}
