/** Shared, DOM-free equipment data and finite tactical effects. Units: metres / seconds. */
const clamp=(v,a,b)=>Math.max(a,Math.min(b,v));
const finite=(v,d=0)=>Number.isFinite(v)?v:d;

export const TACTICAL_WEAPONS=Object.freeze({
  knife:Object.freeze({id:'knife',name:'侦察短刀',kind:'melee',damage:28,range:1.75,cooldown:.27,arc:.65,price:90,color:'#597783',singleTarget:true,backstabMultiplier:2.2,
    specialty:'快速单体近战',description:'每 0.27 秒刺击一名近敌；从敌人背后命中造成 2.2 倍伤害。距离短，不穿墙，不消耗弹药。',ammo:'无需弹药',use:'绕后、贴身补刀',limits:'射程 1.75 米；每次仅命中一个目标。'}),
  pan:Object.freeze({id:'pan',name:'守拙平底锅',kind:'melee',damage:36,range:2.05,cooldown:.7,arc:1.05,price:130,color:'#4b5964',maxTargets:3,stagger:.45,
    specialty:'扇形挥击与主动挡弹',description:'挥击前方最多 3 名近敌，使普通怪短暂踉跄。装备时按住防御，前方 110° 弹道减伤 75%；背面、侧面、近战与爆炸仍会受伤。',ammo:'无需弹药 · 防御消耗气力与架势耐久',use:'掩护转移、推开近敌',limits:'不能同时挥击和防御；防御耐久 80，破防硬直 1.6 秒，松开 2 秒后恢复。'}),
});

export const TACTICAL_CONSUMABLES=Object.freeze({
  bomb:Object.freeze({id:'bomb',name:'纸火炸弹',kind:'consumable',price:40,damage:55,radius:3,fuse:1.05,
    specialty:'瞬间范围爆破',description:'投出后 1.05 秒爆炸，半径 3 米造成 55 点伤害。墙体遮挡爆炸，也会损伤附近建筑、商人和旅人。',ammo:'每次消耗 1 枚',use:'清理聚集怪物、破坏脆弱掩体',limits:'不能隔着完整墙体炸伤目标。'}),
  medkit:Object.freeze({id:'medkit',name:'随身药包',kind:'consumable',price:30,heal:55,
    specialty:'恢复体力',description:'恢复最多 55 点体力；体力已满时不会消耗。',ammo:'每次消耗 1 包',use:'交战后补给',limits:'倒下后不能使用。'}),
  molotov:Object.freeze({id:'molotov',name:'燃烧瓶',kind:'consumable',price:45,dps:12,radius:2.2,duration:4,
    specialty:'持续火区封路',description:'撞击后形成半径 2.2 米、持续 4 秒的火区，每秒 12 点伤害；能封住楼梯口和窄路，也会烧伤旅人、商人及建筑。',ammo:'每次消耗 1 瓶',use:'限制窄路追兵',limits:'对离开火区的目标不会继续造成伤害。'}),
  smoke:Object.freeze({id:'smoke',name:'纸雾烟雾弹',kind:'consumable',price:35,radius:4,height:3.2,duration:10,fuse:1.2,
    specialty:'遮挡瞄准与救援转移',description:'投出 1.2 秒后形成半径 4 米、高 3.2 米、持续 10 秒的烟区。穿过浓烟的敌人视线会中断，重新露面后需再次瞄准。',ammo:'每次消耗 1 枚',use:'救援、过街、补给和撤退',limits:'无伤害；不挡已发射的子弹、爆炸或已经开始的冲撞。'}),
});

export const PAN_GUARD=Object.freeze({capacity:80,reduction:.75,halfArc:55*Math.PI/180,hitCooldown:.18,breakDuration:1.6,recoveryDelay:2,recoveryPerSecond:12,staminaPerSecond:14,moveMultiplier:.62});

/** Visual opacity uses the same timed expansion/fade as gameplay occlusion. */
export function smokeOpacity(hazard){
  if(hazard?.type!=='smoke'||!(hazard.remaining>0))return 0;
  const age=Math.max(0,finite(hazard.duration,10)-hazard.remaining);
  return clamp(age/.4,0,1)*clamp(hazard.remaining/1.5,0,1);
}
export function smokeRadius(hazard){
  const age=Math.max(0,finite(hazard?.duration,10)-finite(hazard?.remaining));
  return finite(hazard?.radius,4)*(.3+.7*clamp(age/.4,0,1));
}

function segmentInSmoke(from,to,hazard){
  const dx=to.x-from.x,dy=to.y-from.y,dz=to.z-from.z,r=smokeRadius(hazard);
  let near=0,far=1;
  const fx=from.x-hazard.x,fz=from.z-hazard.z,a=dx*dx+dz*dz,b=2*(fx*dx+fz*dz),c=fx*fx+fz*fz-r*r;
  if(a<1e-10){if(c>0)return 0;}
  else{const d=b*b-4*a*c;if(d<0)return 0;const root=Math.sqrt(d);near=Math.max(near,(-b-root)/(2*a));far=Math.min(far,(-b+root)/(2*a));}
  const bottom=finite(hazard.y)-.18,top=bottom+finite(hazard.height,3.2);
  if(Math.abs(dy)<1e-10){if(from.y<bottom||from.y>top)return 0;}
  else{const t0=(bottom-from.y)/dy,t1=(top-from.y)/dy;near=Math.max(near,Math.min(t0,t1));far=Math.min(far,Math.max(t0,t1));}
  return Math.max(0,far-near)*Math.hypot(dx,dy,dz);
}

/** Only a meaningful chord through dense smoke prevents acquiring a target. */
export function smokeBlocksSight(hazards,from,to){
  let opacity=0;
  for(const h of hazards||[]){const density=smokeOpacity(h);if(density<.35)continue;opacity+=segmentInSmoke(from,to,h)*density/.65;if(opacity>=1)return true;}
  return false;
}

export function resetEquipmentState(player){
  Object.assign(player,{guarding:false,guardDurability:PAN_GUARD.capacity,guardHitCooldown:0,guardBroken:0,guardRest:0});
}
export function stepPanGuard(player,dt,requested){
  player.guardHitCooldown=Math.max(0,finite(player.guardHitCooldown)-dt);
  player.guardBroken=Math.max(0,finite(player.guardBroken)-dt);
  const wants=!!requested&&player.weaponId==='pan'&&!player.vault;
  player.guarding=wants&&player.attackCooldown<=0&&player.guardBroken<=0&&player.guardDurability>0&&player.stamina>=PAN_GUARD.staminaPerSecond*dt;
  if(player.guarding)player.stamina=Math.max(0,player.stamina-PAN_GUARD.staminaPerSecond*dt);
  player.guardRest=wants?0:finite(player.guardRest)+dt;
  if(player.guardRest>PAN_GUARD.recoveryDelay)player.guardDurability=Math.min(PAN_GUARD.capacity,finite(player.guardDurability)+PAN_GUARD.recoveryPerSecond*dt);
  return player.guarding;
}

/** Incoming direction is the actual swept projectile, not the shooter's current position. */
export function absorbPanProjectile(player,shot,damage){
  const result={damage,blocked:false,broken:false};
  if(!player.guarding||player.weaponId!=='pan'||player.guardHitCooldown>0||player.guardBroken>0||!(player.guardDurability>0))return result;
  const length=Math.hypot(shot?.dirX||0,shot?.dirZ||0),facing=Math.hypot(player.facingX,player.facingZ);
  if(length<.001||facing<.001)return result;
  const dot=(-(shot.dirX||0)*player.facingX-(shot.dirZ||0)*player.facingZ)/(length*facing);
  if(dot<Math.cos(PAN_GUARD.halfArc)||Math.abs(finite(shot.dirY))>.7)return result;
  const cost=Math.max(10,damage*PAN_GUARD.reduction),fraction=Math.min(1,player.guardDurability/cost);
  player.guardDurability=Math.max(0,player.guardDurability-cost);
  player.guardHitCooldown=PAN_GUARD.hitCooldown;player.guardRest=0;
  result.damage=damage*(1-PAN_GUARD.reduction*fraction);result.blocked=true;
  if(player.guardDurability===0){player.guardBroken=PAN_GUARD.breakDuration;player.guarding=false;result.broken=true;}
  return result;
}

export function knifeDamageMultiplier(player,enemy){
  const dx=player.x-enemy.x,dz=player.z-enemy.z,length=Math.hypot(dx,dz),facing=Math.hypot(enemy.facingX||0,enemy.facingZ||0);
  if(length<.001||facing<.001)return 1;
  return (dx*enemy.facingX+dz*enemy.facingZ)/(length*facing)<=-.5?TACTICAL_WEAPONS.knife.backstabMultiplier:1;
}
