/** Desktop-creature combat: original sheet animation is independent of these
 * collision-backed actions. Runtime state belongs to the enemy, never to the
 * shared catalog profile. All damage/movement is supplied by AdventureGame. */
const clamp=(n,a,b)=>Math.max(a,Math.min(b,n));
const finite=(n,d)=>Number.isFinite(n)?n:d;
const dist=(a,b)=>Math.hypot(a.x-b.x,a.z-b.z);
const unit=(x,z)=>{const n=Math.hypot(x,z)||1;return {x:x/n,z:z/n};};
const ranged=new Set(['retreat-shot','burst-shot','fan-shot','sniper','lob-bomb']);
const move=(name,range,warning,recovery,description)=>Object.freeze({name,range,warning,recovery,description});
export const ANIMAL_MOVES=Object.freeze({
  pounce:move('蓄力扑击',5,.7,.8,'伏低后扑向预警方向，扑空会停顿。'),
  'leap-slam':move('跃起震地',5.5,1,.95,'在标记位置落地，震波受围墙阻挡。'),
  'flank-hunt':move('侧翼追猎',2.1,.55,.6,'从侧面追近，先爪击再短距离跟进。'),
  'claw-combo':move('连续爪击',1.9,.65,1,'三次爪击间有空隙，离开近身范围即可闪避。'),
  'retreat-shot':move('后撤点射',11,.7,.7,'先后撤拉开距离，再向锁定位置点射。'),
  'burst-shot':move('三连发',12,.8,.85,'朝预警位置连续射出三发，可以侧移躲开。'),
  'fan-shot':move('扇形散射',9,.95,1,'五发向两侧展开，利用间隙或掩体。'),
  sniper:move('狙击预警',24,1.45,1.35,'长预警、窄弹道；开枪前横移或躲到墙后。'),
  'lob-bomb':move('弧线投弹',12,1.05,1.2,'投掷受重力影响的炸弹，落地后短暂停留才爆炸。'),
  'ricochet-charge':move('折返冲撞',6,.95,1.1,'冲撞遇墙后沿侧向再冲一次，不会穿墙。'),
  'orbit-strike':move('绕圈切入',4.5,.6,.8,'先绕着目标跑一段，再直线切入。'),
  'spin-melee':move('旋转近战',2.5,.85,1.1,'原地旋转产生三次近身攻击，远离转圈范围。'),
  'guard-counter':move('防御反击',2.3,.65,.95,'架势期间减伤；受到攻击后提前反击。'),
  healer:move('支援疗愈',9,1.1,1.35,'停步给看得见的受伤同伴回血，治疗期间无法攻击。'),
  bodyguard:move('护卫拦截',7,.75,1,'移动到受伤同伴与目标之间，架势后近身推退。'),
  'venom-pool':move('近身毒域',2.7,.9,1.1,'在脚下留下短暂毒域，不能穿墙伤人。'),
  'ember-trail':move('焰迹突进',5,.9,1.2,'突进途中留下三段火迹，火迹很快消散。'),
  'tail-sweep':move('尾部横扫',2.6,.8,.9,'横扫宽弧并推退近身目标，背后是躲避空隙。'),
  'feint-charge':move('假动作冲刺',5.5,.6,1,'先后退诱导，再次预警后才发动突进。'),
  'snare-trail':move('撤步留网',2.8,.7,1,'撤步时留下减速网，绕开地面的网纹。'),
});
export const ANIMAL_MOVE_IDS=Object.freeze(Object.keys(ANIMAL_MOVES));

export function normalizedAnimalProfile(enemy){
  const p=enemy.combatProfile;
  if(!p||!ANIMAL_MOVES[p.primary])return null;
  const valid=id=>ANIMAL_MOVES[id]&&(!ranged.has(id)||enemy.animalHasHands===true);
  const primary=valid(p.primary)?p.primary:'pounce';
  return {primary,secondary:valid(p.secondary)?p.secondary:null,
    secondaryWhen:['hurt','close','blocked','ally','surrounded','after-primary'].includes(p.secondaryWhen)?p.secondaryWhen:'after-primary',
    temperament:['bold','cautious','territorial','pack'].includes(p.temperament)?p.temperament:'bold',
    cadence:clamp(finite(p.cadence,1),.8,1.3),engageRange:clamp(finite(p.engageRange,ANIMAL_MOVES[primary].range),1,26),
    strafeSign:p.strafeSign===-1?-1:1};
}

export function chooseAnimalMove(enemy,target,ctx,profile=normalizedAnimalProfile(enemy)){
  if(!profile)return null;
  const s=enemy._animalCombat||{},near=dist(enemy,target),ally=ctx.allies().some(a=>a.hp<a.maxHp*.7&&dist(a,enemy)<8);
  const condition={hurt:s.recentHit>0||enemy.hp<enemy.maxHp*.4,close:near<2.8,blocked:s.recentBlock>0||!ctx.sight(enemy,target),ally,
    surrounded:ctx.targets().filter(t=>dist(t,enemy)<4).length>=2,'after-primary':s.lastMove===profile.primary};
  let selected=profile.secondary&&condition[profile.secondaryWhen]?profile.secondary:profile.primary;
  // Support creatures must retain a means of fighting when no ally needs help.
  if((selected==='healer'||selected==='bodyguard')&&!ally)selected=profile.secondary&& !['healer','bodyguard'].includes(profile.secondary)?profile.secondary:'pounce';
  return selected;
}

export function animalDamageReceived(enemy,damage){
  if(!enemy.animalId||!enemy.combatProfile)return damage;
  const s=enemy._animalCombat ||= {};
  s.recentHit=2;
  if(enemy.animalGuard){s.counterReady=true;return damage*.35;}
  return damage;
}

function expose(enemy,s,phase,progress=0){
  enemy.animalAction={move:s.move,phase,progress:clamp(progress,0,1),serial:s.serial};
  enemy.animalMove=s.move;
}
function recover(enemy,s,profile){
  s.lastMove=s.move;s.phase='recovering';s.time=0;
  enemy.attackPhase='recovering';enemy.charging=false;enemy.animalLift=0;enemy.animalGuard=false;enemy.animalSpin=0;
  enemy.recovering=ANIMAL_MOVES[s.move].recovery/profile.cadence;
  enemy.attackCooldown=Math.max(.8,finite(enemy.cooldown,1.8))/profile.cadence;
  expose(enemy,s,'recovering');
}
function emit(enemy,s,ctx,type,text=''){
  ctx.event(type,text,{enemyId:enemy.id,animalId:enemy.animalId,move:s.move});
}
function begin(enemy,target,s,profile,ctx){
  s.move=chooseAnimalMove(enemy,target,ctx,profile);const rule=ANIMAL_MOVES[s.move];
  s.phase='telegraph';s.time=0;s.serial=(s.serial||0)+1;s.cursor=0;s.hitIds=[];s.bounced=false;s.counterReady=false;s.feinted=false;s.orbitLocked=false;
  s.origin={x:enemy.x,z:enemy.z};s.aim=ctx.aim(target);s.dir=unit(s.aim.x-enemy.x,s.aim.z-enemy.z);
  enemy.attackDirX=s.dir.x;enemy.attackDirZ=s.dir.z;enemy.aimTarget={...s.aim};
  enemy.attackPhase='telegraph';enemy.telegraph=Math.max(.45,rule.warning/profile.cadence);
  enemy.animalGuard=['guard-counter','bodyguard'].includes(s.move);
  expose(enemy,s,'telegraph');
  emit(enemy,s,ctx,'enemy-telegraph',`${enemy.name} · ${rule.name}：${rule.description}`);
}
function shoot(enemy,s,ctx,angle=0,mult=1,speedMultiplier=1){
  if(!ctx.sightPoint(enemy,s.aim))return;
  const origin=ctx.muzzle(enemy),dx=s.aim.x-origin.x,dy=s.aim.y-origin.y,dz=s.aim.z-origin.z,n=Math.hypot(dx,dy,dz)||1;
  const c=Math.cos(angle),sine=Math.sin(angle);
  ctx.shoot(enemy,{x:(dx*c-dz*sine)/n,y:dy/n,z:(dz*c+dx*sine)/n},enemy.damage*mult,
    {speed:Math.min(16,Math.max(5,finite(enemy.projectileSpeed,6))*speedMultiplier),range:ANIMAL_MOVES[s.move].range+3,style:`animal-${s.move}`,radius:s.move==='sniper'?.07:.12});
  emit(enemy,s,ctx,'enemy-shot');
}
function advance(enemy,s,ctx,dt,speed,trail=false){
  const from={x:enemy.x,z:enemy.z},amount=speed*dt,moved=ctx.move(enemy,s.dir.x*amount,s.dir.z*amount);
  ctx.sweep(from,enemy,s.hitIds,enemy.damage);
  if(trail&&s.time>=s.cursor*.2&&s.cursor<3){ctx.hazard('fire',enemy,1.05,2.4,enemy.damage*.35);s.cursor++;}
  return moved>=amount*.3;
}
function steer(enemy,target,s,profile,ctx,dt){
  if(enemy.perched)return;
  const d=dist(enemy,target),sight=ctx.sight(enemy,target),dir=unit(target.x-enemy.x,target.z-enemy.z),speed=finite(enemy.pursuitSpeed,enemy.speed)*dt;
  const rule=ANIMAL_MOVES[profile.primary];
  let destination=target;
  if(!sight){destination=ctx.route(enemy,target);if(!destination)return;}
  const preferred=ranged.has(profile.primary)?Math.min(7,rule.range*.6):Math.min(2.4,rule.range*.65);
  if(sight&&ranged.has(profile.primary)&&d<preferred*.6&&profile.temperament==='cautious')destination={x:enemy.x-dir.x*2,z:enemy.z-dir.z*2};
  else if(sight&&['flank-hunt','orbit-strike'].includes(profile.primary)&&d>2&&d<10){
    // Flanking must finish inside claw reach rather than stall forever on an
    // orbit wider than the activation radius.
    destination={x:target.x-dir.z*profile.strafeSign*1.35-dir.x*.8,z:target.z+dir.x*profile.strafeSign*1.35-dir.z*.8};
  }else if(sight&&d<preferred)return;
  const v=unit(destination.x-enemy.x,destination.z-enemy.z),amount=Math.min(speed,dist(enemy,destination));
  const moved=ctx.move(enemy,v.x*amount,v.z*amount);
  if(moved<amount*.2){s.recentBlock=2.5;ctx.move(enemy,-v.z*amount*profile.strafeSign,v.x*amount*profile.strafeSign);}
}

/** Return false only for an old animal without the new catalog profile. */
export function updateAnimalCombat(enemy,target,dt,ctx){
  const profile=normalizedAnimalProfile(enemy);if(!profile)return false;
  const s=enemy._animalCombat ||= {phase:'idle',time:0,serial:0,lastMove:null};
  s.recentHit=Math.max(0,finite(s.recentHit,0)-dt);
  // Remember an obstruction briefly after routing around it. A blocked-only
  // choice otherwise disappears on the very frame sight returns, making that
  // secondary unreachable while the shared no-through-wall gate stays true.
  s.recentBlock=ctx.sight(enemy,target)?Math.max(0,finite(s.recentBlock,0)-dt):2.5;
  // Shared smoke/support-loss code can cancel a pending attack. Do not let a
  // private action resurrect that cancelled shot on the next clear frame.
  if(enemy.attackPhase==='idle'&&s.phase&&!['idle','recovering'].includes(s.phase)){
    s.phase='idle';s.time=0;enemy.animalLift=0;enemy.animalGuard=false;enemy.charging=false;
  }
  if(s.phase==='recovering'){
    enemy.recovering=Math.max(0,enemy.recovering-dt);expose(enemy,s,'recovering');
    if(enemy.recovering===0){s.phase='idle';enemy.attackPhase='idle';}
    return true;
  }
  if(!s.phase||s.phase==='idle'){
    const selected=chooseAnimalMove(enemy,target,ctx,profile),rule=ANIMAL_MOVES[selected];
    const range=selected===profile.primary?profile.engageRange:rule.range;
    if(dist(enemy,target)<=range+finite(target.radius,.4)&&ctx.sight(enemy,target)&&enemy.attackCooldown<=0){begin(enemy,target,s,profile,ctx);return true;}
    steer(enemy,target,s,profile,ctx,dt);expose(enemy,s,'moving');return true;
  }
  enemy.facingX=s.dir.x;enemy.facingZ=s.dir.z;
  if(s.phase==='telegraph'||s.phase==='second-warning'){
    enemy.telegraph=Math.max(0,enemy.telegraph-dt);expose(enemy,s,'telegraph',1-enemy.telegraph/ANIMAL_MOVES[s.move].warning);
    if(s.move==='retreat-shot'&&s.phase==='telegraph'&&!enemy.perched)ctx.move(enemy,-s.dir.x*enemy.speed*dt,-s.dir.z*enemy.speed*dt);
    if(enemy.telegraph>0)return true;
    s.phase='active';s.time=0;enemy.attackPhase='firing';expose(enemy,s,'active');
  }
  s.time+=dt;expose(enemy,s,'active',s.time);
  const speed=Math.min(14,Math.max(7,finite(enemy.chargeSpeed,9))),rule=ANIMAL_MOVES[s.move];
  switch(s.move){
    case 'pounce':case 'ricochet-charge':case 'ember-trail':{
      enemy.attackPhase='charging';enemy.charging=true;
      const moved=advance(enemy,s,ctx,dt,speed,s.move==='ember-trail');
      if(!moved&&s.move==='ricochet-charge'&&!s.bounced){s.bounced=true;s.dir={x:-s.dir.z*profile.strafeSign,z:s.dir.x*profile.strafeSign};s.time=Math.max(s.time,.28);}
      else if(!moved||s.time>.58)recover(enemy,s,profile);
      break;
    }
    case 'feint-charge':{
      if(!s.feinted){
        ctx.move(enemy,-s.dir.x*enemy.speed*dt*1.6,-s.dir.z*enemy.speed*dt*1.6);
        if(s.time>.25){s.feinted=true;s.phase='second-warning';enemy.attackPhase='telegraph';enemy.telegraph=.65;emit(enemy,s,ctx,'enemy-telegraph',`${enemy.name}真正的冲刺即将开始。`);}
      }else{
        enemy.attackPhase='charging';enemy.charging=true;
        if(!advance(enemy,s,ctx,dt,speed)||s.time>.65){s.feinted=false;recover(enemy,s,profile);}
      }break;
    }
    case 'leap-slam':{
      enemy.attackPhase='charging';enemy.charging=true;
      const total=.7,progress=clamp(s.time/total,0,1),distance=Math.min(5,dist(s.origin,s.aim));
      enemy.animalLift=Math.sin(progress*Math.PI)*1.7;
      ctx.move(enemy,s.dir.x*distance/total*dt,s.dir.z*distance/total*dt);
      if(s.time>=total){ctx.area(enemy,2.05,enemy.damage*1.25);ctx.effect('burst',enemy,2.05);recover(enemy,s,profile);}break;
    }
    case 'flank-hunt':case 'claw-combo':case 'spin-melee':{
      const beats=s.move==='claw-combo'?[0,.43,.86]:s.move==='spin-melee'?[0,.46,.92]:[0,.48];
      if(s.move==='spin-melee')enemy.animalSpin=s.time*Math.PI*5;
      if(s.move==='flank-hunt'&&s.time>.2&&s.time<.46)ctx.move(enemy,s.dir.x*enemy.speed*dt,s.dir.z*enemy.speed*dt);
      while(s.cursor<beats.length&&s.time>=beats[s.cursor]){s.cursor++;ctx.melee(s.move==='spin-melee'?2.25:1.9,enemy.damage*(s.move==='claw-combo'?.65:.8),s.move==='spin-melee'?Math.PI:1.25);}
      if(s.time>beats.at(-1)+.2)recover(enemy,s,profile);break;
    }
    case 'retreat-shot':case 'sniper':case 'fan-shot':case 'burst-shot':{
      const delays=s.move==='burst-shot'?[0,.19,.38]:[0];
      while(s.cursor<delays.length&&s.time>=delays[s.cursor]){
        s.cursor++;
        for(const angle of s.move==='fan-shot'?[-.42,-.21,0,.21,.42]:[0])shoot(enemy,s,ctx,angle,s.move==='fan-shot'?.55:s.move==='sniper'?1.45:.7,s.move==='sniper'?1.7:1);
      }
      if(s.time>delays.at(-1)+.13)recover(enemy,s,profile);break;
    }
    case 'lob-bomb':
      if(s.cursor++===0&&ctx.sightPoint(enemy,s.aim)){ctx.lob(enemy,s.aim,enemy.damage*1.25);emit(enemy,s,ctx,'enemy-shot');}
      recover(enemy,s,profile);break;
    case 'orbit-strike':{
      if(!s.orbitLocked&&s.time<.6){const to=unit(target.x-enemy.x,target.z-enemy.z);ctx.move(enemy,-to.z*enemy.speed*2.3*dt*profile.strafeSign,to.x*enemy.speed*2.3*dt*profile.strafeSign);}
      else{
        if(!s.orbitLocked){s.orbitLocked=true;s.dir=unit(target.x-enemy.x,target.z-enemy.z);s.phase='second-warning';enemy.attackPhase='telegraph';enemy.telegraph=.45;}
        else{enemy.attackPhase='charging';enemy.charging=true;if(!advance(enemy,s,ctx,dt,speed)||s.time>.42){s.orbitLocked=false;recover(enemy,s,profile);}}
      }break;
    }
    case 'guard-counter':{
      enemy.animalGuard=true;expose(enemy,s,'guard');
      if(s.counterReady||s.time>1){enemy.animalGuard=false;ctx.melee(2.3,enemy.damage*1.15,1.3,.7);recover(enemy,s,profile);}break;
    }
    case 'healer':{
      if(s.cursor++===0){let healed=0;for(const ally of ctx.allies())if(dist(ally,enemy)<=7&&ctx.sight(enemy,ally)&&ally.hp<ally.maxHp){ally.hp=Math.min(ally.maxHp,ally.hp+ally.maxHp*.12);healed++;ctx.effect('spark',ally,.6);}emit(enemy,s,ctx,'animal-heal',`${enemy.name}为 ${healed} 位同伴恢复体力。`);}
      expose(enemy,s,'healing');if(s.time>.5)recover(enemy,s,profile);break;
    }
    case 'bodyguard':{
      enemy.animalGuard=true;expose(enemy,s,'guard');
      const ally=ctx.allies().filter(a=>a.hp<a.maxHp*.7&&dist(a,enemy)<8).sort((a,b)=>a.hp/a.maxHp-b.hp/b.maxHp)[0];
      if(ally){const dir=unit(target.x-ally.x,target.z-ally.z),point={x:ally.x+dir.x*1.4,z:ally.z+dir.z*1.4},v=unit(point.x-enemy.x,point.z-enemy.z);ctx.move(enemy,v.x*enemy.speed*1.5*dt,v.z*enemy.speed*1.5*dt);}
      if(s.time>.8||s.counterReady){ctx.melee(2.1,enemy.damage*.8,1.25,1.1);recover(enemy,s,profile);}break;
    }
    case 'venom-pool':
      ctx.hazard('poison',enemy,2.1,3.8,enemy.damage*.4);recover(enemy,s,profile);break;
    case 'tail-sweep':
      ctx.melee(2.6,enemy.damage,.78*Math.PI,1.5);ctx.effect('enemy-slash',enemy,2.6);recover(enemy,s,profile);break;
    case 'snare-trail':
      if(s.cursor++===0)ctx.hazard('snare',enemy,1.6,4.2,0);
      ctx.move(enemy,-s.dir.x*enemy.speed*1.5*dt,-s.dir.z*enemy.speed*1.5*dt);
      if(s.time>.55)recover(enemy,s,profile);break;
    default:recover(enemy,s,profile);
  }
  return true;
}
