/** Original, DOM-free V5 combat patterns. Times are active game seconds.
 * Patterns describe emission directions/delays, never unoccluded damage zones.
 * The engine locks aim during warning and sweeps each projectile against solids.
 */
const clamp=(n,a,b)=>Math.max(a,Math.min(b,Number.isFinite(n)?n:a));
const entries=[
  ['arcade-wraith','aimed-pair',2.5,.85,4.8,14,'#536ca4'],
  ['bridge-serpent','sine-fan',2.7,.95,5.1,22,'#357e94'],
  ['bronze-oni','three-lanes',3.1,1.05,5.3,18,'#a37642'],
  ['beacon-siren','spiral',3.0,1.0,4.7,22,'#bd6766'],
  ['ancestral-marionette','cross-stitch',2.8,.95,5.0,20,'#955587'],
  ['pagoda-eye','orbit-ring',3.2,1.1,4.4,22,'#a176b0'],
  ['lake-hydra','bouncing-fan',3.0,1.05,5.3,23,'#40898b'],
  ['porcelain-widow','web-fan',3.2,1.1,4.4,20,'#536daf'],
  ['cloud-harpy','wing-burst',2.8,.9,5.6,25,'#8971a6'],
  ['octagon-jailer','octagon-ring',3.4,1.15,4.7,22,'#a66752'],
  ['sea-revenant','anchor-volley',3.0,1.0,4.8,24,'#467a87'],
  ['cascade-colossus','cascade-barrage',3.5,1.2,5.2,25,'#406a9e'],
  ['ink-jester','joker-skip',3.1,1.05,4.8,18,'#8754a3'],
  ['velvet-dealer','dealer-lanes',3.0,1.0,5.0,21,'#497b68'],
  ['carnival-conductor','carnival-waltz',2.9,.95,5.2,23,'#b64c48'],
  ['mint-harlequin','hourglass-cross',2.8,.9,5.4,24,'#499a86'],
  ['stitched-host','stitch-curtain',2.7,.85,5.6,25,'#62547e'],
];
export const DEMON_BOSS_IDS=Object.freeze(entries.map(e=>e[0]));
export const DEMON_ATTACKS=Object.freeze(Object.fromEntries(entries.map(([id,attackStyle,cooldown,telegraphDuration,projectileSpeed,attackRange,patternColor])=>[id,Object.freeze({id,attackStyle,cooldown,telegraphDuration,projectileSpeed,attackRange,patternColor})])));
export function bossDefinition(kind,index=0){return Object.hasOwn(DEMON_ATTACKS,kind)?DEMON_ATTACKS[kind]:DEMON_ATTACKS[DEMON_BOSS_IDS[clamp(Math.floor(index),0,11)]];}

/** Ramp starts at 1 in every chapter; later chapters ramp a little sooner.
 * .35s warning and absolute projectile speed limits are additionally enforced
 * by the engine after weather/pressure; no live stat is multiplied repeatedly.
 */
export function combatTempo(seconds=0,chapter=1){
  // Initial three-second grace preserves the readable first warning/first shot.
  const t=Math.max(0,clamp(seconds,0,1e9)-3),chapterFactor=1+clamp(chapter-1,0,11)*.025;
  return {fireRateMultiplier:1+Math.min(1.2,t/240*chapterFactor),projectileSpeedMultiplier:1+Math.min(.35,t/600*chapterFactor)};
}

/** angle is relative to the locked horizontal aim; pitch is relative to its
 * elevation. Delays don't shrink below .09s. Every attack has a safe angular
 * gap: neither circular pattern emits an unbroken solid damage ring.
 */
export function bossPattern({bossKind,phase=1,cycle=0,fireRateMultiplier=1}={}){
  const def=bossDefinition(bossKind),p=clamp(Math.floor(phase),1,3),turn=Math.max(0,Math.floor(cycle||0)),shots=[];
  const beat=n=>Math.max(.09,n/Math.sqrt(clamp(fireRateMultiplier,1,2.2)));
  const emit=(angle,delay=0,extra={})=>shots.push({angle,delay,pitch:0,speedMultiplier:1,damageMultiplier:.55,radius:.14,...extra});
  const fan=(count,spread,delay=0,center=0,extra={})=>{for(let i=0;i<count;i++)emit(center+(count===1?0:(i/(count-1)-.5)*spread),delay,extra);};
  switch(def.attackStyle){
    case 'aimed-pair': // Quiet first chapter: two separated beads, one extra late.
      emit(-.045);emit(.045,beat(.3));if(p>1)emit((turn%2?1:-1)*.17,beat(.6));if(p===3)emit(0,beat(.9));break;
    case 'sine-fan':
      for(let wave=0;wave<p+1;wave++)fan(3,.48,wave*beat(.22),Math.sin(turn+wave*.9)*.28);break;
    case 'three-lanes':
      for(let lane=-1;lane<=1;lane++)for(let n=0;n<p;n++)emit(lane*.34,n*beat(.3),{speedMultiplier:lane===0?1.1:.85,damageMultiplier:.65,radius:.18});break;
    case 'spiral':
      for(let i=0;i<6+p*2;i++)emit((turn*.55+i*.47)%(Math.PI*2),i*beat(.12),{speedMultiplier:.85});break;
    case 'cross-stitch':
      for(let row=0;row<p+1;row++)for(const side of[-1,1])emit(side*(.42-row*.11),row*beat(.24),{pitch:(row%2?1:-1)*.035});break;
    case 'orbit-ring':{
      const count=10+p*2,gap=turn%count;
      for(let i=0;i<count;i++)if(i!==gap&&i!==(gap+1)%count)emit(i*Math.PI*2/count+turn*.17,0,{speedMultiplier:.8,radius:.12});
      if(p===3)fan(3,.3,beat(.55));break;
    }
    case 'bouncing-fan':
      fan(3+p*2,.9,0,Math.sin(turn)*.15,{pitch:-.22,groundBounces:1,damageMultiplier:.5});
      if(p>1)fan(3,.5,beat(.55),0,{speedMultiplier:.75});break;
    case 'web-fan':
      fan(4+p,.88,0,0,{speedMultiplier:.62,radius:.17});fan(3+p,.7,beat(.42),turn%2?.12:-.12,{speedMultiplier:1.12,radius:.11});break;
    case 'wing-burst':
      for(const side of[-1,1])fan(2+p,.28,side<0?0:beat(.25),side*.42,{speedMultiplier:1.05});
      emit(0,beat(.65),{speedMultiplier:.8});break;
    case 'octagon-ring':{
      const gap=turn%8;for(let i=0;i<8;i++)if(i!==gap)fan(p,.10,0,i*Math.PI/4+turn*.09,{radius:.12,speedMultiplier:.86});break;
    }
    case 'anchor-volley':
      emit(0,0,{speedMultiplier:.58,radius:.23,damageMultiplier:.8});
      for(let i=0;i<p+1;i++)for(const side of[-1,1])emit(side*(.22+i*.12),(i+1)*beat(.22),{speedMultiplier:1.1});break;
    case 'cascade-barrage':
      for(let row=0;row<3;row++)fan(3+p,.72,row*beat(.32),(row-1)*.19,{pitch:(row-1)*.025,speedMultiplier:.72+row*.18});break;
    case 'joker-skip':
      // A short opening volley with a visible pause before the final aimed bead.
      for(let row=0;row<p+1;row++)emit((row%2?1:-1)*(.12+row*.05),row*beat(.25),{speedMultiplier:.85,radius:.16});
      emit(0,(p+1)*beat(.25)+beat(.35),{speedMultiplier:.7,radius:.19});break;
    case 'dealer-lanes':
      // Locked lanes fire separately; their gaps remain wider than two bodies.
      for(let lane=0;lane<3;lane++)fan(p+1,.12,lane*beat(.32),(lane-1)*.48,{speedMultiplier:.95+lane*.04,radius:.12});break;
    case 'carnival-waltz':
      for(let bar=0;bar<p+1;bar++){
        const side=(bar+turn)%2?1:-1;
        fan(2,.22,bar*beat(.32),side*.4,{speedMultiplier:.78,radius:.18});
        emit(side*.12,bar*beat(.32)+beat(.16),{speedMultiplier:1.08,radius:.11});
      }break;
    case 'hourglass-cross':
      // Paired diagonal rows never close the central angular passage.
      for(let row=0;row<p+2;row++)for(const side of[-1,1])emit(side*(.20+Math.abs(row-(p+1)/2)*.16),row*beat(.26),{pitch:side*(row%2?.04:-.04),speedMultiplier:.85+row*.025,radius:.13});
      break;
    case 'stitch-curtain':
      // Two open curtains then one delayed locked-aim stitch, never a solid ring.
      for(let row=0;row<2;row++)for(const side of[-1,1])fan(p+1,.24,row*beat(.5),side*(.44-row*.1),{speedMultiplier:.82+row*.16,radius:.12});
      emit((turn%2?1:-1)*.04,beat(1.15),{speedMultiplier:.92,radius:.15,damageMultiplier:.65});break;
  }
  shots.sort((a,b)=>a.delay-b.delay);
  return {...def,phase:p,cycle:turn,shots,duration:shots.at(-1)?.delay||0,recovery:.65+(def.attackStyle.includes('ring')?.25:0)};
}

export function patternDirection(aim,shot){
  const yaw=Math.atan2(aim.x,aim.z)+shot.angle,horizontal=Math.hypot(aim.x,aim.z);
  const pitch=clamp(Math.atan2(aim.y||0,horizontal)+shot.pitch,-1.05,1.05),flat=Math.cos(pitch);
  return {x:Math.sin(yaw)*flat,y:Math.sin(pitch),z:Math.cos(yaw)*flat};
}
