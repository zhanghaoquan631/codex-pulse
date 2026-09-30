/** DOM-free walking supports and checked vault trajectories. Heights are world metres. */
import {boxLocalPoint} from './camera-math.mjs';
import {groundHeight} from './landforms.mjs';
import {bodySpaceFree} from './combat-navigation.mjs';

const clamp=(v,a,b)=>Math.max(a,Math.min(b,v));
const finite=(v,d=0)=>Number.isFinite(v)?v:d;
const bodyHeight=p=>finite(p.height,1.7);
export const playerWorldY=(level,p)=>groundHeight(level,p.x,p.z)+finite(p.y);

export function supportSurfaces(level,x,z,radius=0){
  const out=[{id:'ground',y:groundHeight(level,x,z),kind:'ground'}];
  for(const f of level.traversal?.floors||[]){
    const q=boxLocalPoint({x,z},f);
    const dx=Math.max(0,Math.abs(q.x)-f.w/2),dz=Math.max(0,Math.abs(q.z)-f.d/2);
    if(dx*dx+dz*dz<=radius*radius+.000001)out.push({id:f.id,y:f.y,kind:'floor'});
  }
  for(const r of level.traversal?.ramps||[]){
    const q=boxLocalPoint({x,z},r);
    // The centre must remain on a stair tread; radius is for the side walls.
    if(Math.abs(q.x)<=r.w/2+.001&&Math.abs(q.z)<=r.d/2+.001){
      const t=clamp((r.d/2-q.z)/r.d,0,1);
      out.push({id:r.id,y:r.fromY+(r.toY-r.fromY)*t,kind:'ramp'});
    }
  }
  for(const box of [...level.walls,...level.doors.filter(d=>!d.open)]){
    if(box.kind==='invisible')continue;
    const q=boxLocalPoint({x,z},box),dx=Math.max(0,Math.abs(q.x)-box.w/2),dz=Math.max(0,Math.abs(q.z)-box.d/2);
    if(dx*dx+dz*dz<=radius*radius+.000001)out.push({id:box.id,y:box.baseY+box.height,kind:'solid'});
  }
  return out.filter(s=>Number.isFinite(s.y)).sort((a,b)=>b.y-a.y);
}

export function supportBelow(level,x,z,maxY,radius=0){
  return supportSurfaces(level,x,z,radius).find(s=>s.y<=maxY+.002)||null;
}

export function movePlayerHorizontal(level,p,dx,dz){
  const original={x:p.x,z:p.z},radius=finite(p.radius,.38),height=bodyHeight(p),b=level.bounds;
  const move=(x,z)=>{
    const abs=playerWorldY(level,p),grounded=p.grounded;
    const current=supportBelow(level,p.x,p.z,abs+.03,radius);
    const near=supportBelow(level,x,z,abs+.35,radius);
    // Account for the small rise already travelled on this stair substep.
    // Otherwise a diagonal stair can get stuck a millimetre below step range.
    const target=near?.kind==='ramp'?supportBelow(level,x,z,Math.max(abs,near.y)+.35,radius):near;
    let y=abs,attach=false;
    if(grounded&&target){
      // Existing sculpted terrain follows its own continuous profile. Elevated
      // floors permit only a normal step, never snapping up through a ceiling.
      const terrain=current?.kind==='ground'&&target.kind==='ground';
      if(terrain||target.y>=abs-.4){y=target.y;attach=true;}
    }
    if(!bodySpaceFree(level,{x,z,absoluteY:y},radius,height))return;
    p.x=x;p.z=z;p.y=y-groundHeight(level,x,z);
    if(grounded){p.grounded=attach;p.supportId=attach?target?.id:null;}
  };
  move(clamp(p.x+dx,b.minX+radius,b.maxX-radius),p.z);
  move(p.x,clamp(p.z+dz,b.minZ+radius,b.maxZ-radius));
  return Math.hypot(p.x-original.x,p.z-original.z);
}

export function stepPlayerVertical(level,p,dt){
  const previous=playerWorldY(level,p),height=bodyHeight(p),radius=finite(p.radius,.38);
  p.vy=finite(p.vy)-18*dt;
  let next=previous+p.vy*dt;
  if(p.vy>0){
    for(const box of [...level.walls,...level.doors.filter(d=>!d.open)]){
      if(box.kind==='invisible'||previous+height>box.baseY+1e-6||next+height<=box.baseY)continue;
      const q=boxLocalPoint(p,box),dx=Math.max(0,Math.abs(q.x)-box.w/2),dz=Math.max(0,Math.abs(q.z)-box.d/2);
      if(dx*dx+dz*dz<radius*radius){next=Math.min(next,box.baseY-height-.0001);p.vy=0;}
    }
  }
  if(p.vy<=0){
    const support=supportBelow(level,p.x,p.z,previous+.03,radius);
    if(support&&next<=support.y+.002){next=support.y;p.vy=0;p.grounded=true;p.supportId=support.id;}
    else {p.grounded=false;p.supportId=null;}
  }else {p.grounded=false;p.supportId=null;}
  const ground=groundHeight(level,p.x,p.z);
  if(next<=ground){next=ground;p.vy=0;p.grounded=true;p.supportId='ground';}
  p.y=next-ground;
}

export function vaultPosition(path,t){
  t=clamp(t,0,1);
  const {from,to,travelY}=path;
  if(t<.2)return {x:from.x,y:from.y+(travelY-from.y)*t/.2,z:from.z};
  if(t>.8)return {x:to.x,y:travelY+(to.y-travelY)*(t-.8)/.2,z:to.z};
  const f=(t-.2)/.6;
  return {x:from.x+(to.x-from.x)*f,y:travelY,z:from.z+(to.z-from.z)*f};
}

export function checkedVault(level,p,vault){
  const here={x:p.x,y:playerWorldY(level,p),z:p.z},radius=finite(p.radius,.38),height=bodyHeight(p);
  const d=q=>Math.hypot(q.x-here.x,q.y-here.y,q.z-here.z);
  const reverse=!vault.oneWay&&d(vault.to)<d(vault.from),entry=reverse?vault.to:vault.from,to=reverse?vault.from:vault.to;
  if(!p.grounded||d(entry)>finite(vault.radius,1.5)||Math.hypot(to.x-entry.x,to.z-entry.z)>5)return null;
  let travelY=Math.max(here.y,to.y,finite(vault.clearanceY,-Infinity));
  // Derive the sill from real colliders. A full wall exceeds the bounded lift
  // and is rejected; a genuine window provides free body clearance above it.
  for(let i=0;i<=24;i++){
    const t=i/24,q={x:here.x+(to.x-here.x)*t,z:here.z+(to.z-here.z)*t};
    for(const box of [...level.walls,...level.doors.filter(d=>!d.open)]){
      const local=boxLocalPoint(q,box),dx=Math.max(0,Math.abs(local.x)-box.w/2),dz=Math.max(0,Math.abs(local.z)-box.d/2);
      if(dx*dx+dz*dz>=radius*radius||box.baseY>travelY+height-.015)continue;
      if(box.baseY+box.height>Math.min(here.y,to.y)+1.35)continue;
      travelY=Math.max(travelY,box.baseY+box.height+.012);
    }
  }
  if(travelY-Math.min(here.y,to.y)>1.35)return null;
  const path={id:vault.id,name:vault.name,from:here,to:{...to},travelY,duration:.45,elapsed:0,drop:!!vault.drop};
  for(let i=0;i<=45;i++){
    const q=vaultPosition(path,i/45);
    if(!bodySpaceFree(level,{x:q.x,z:q.z,absoluteY:q.y},radius,height))return null;
  }
  // A landing endpoint must actually have a floor at the declared height.
  const support=supportBelow(level,to.x,to.z,to.y+.04,radius);
  if(!vault.drop&&(!support||Math.abs(support.y-to.y)>.05))return null;
  return path;
}

/** More reinforcements over time, with a finite on-screen budget in all chapters. */
export function reinforcementProfile(seconds,config){
  const tier=Math.min(6,Math.floor(Math.max(0,finite(seconds))/45));
  const baseWave=Math.max(1,finite(config.waveSize,6)),baseCap=Math.max(baseWave,finite(config.maxAlive,baseWave));
  return {tier,waveSize:Math.min(18,baseWave+Math.floor((tier+1)/2)),maxAlive:Math.min(32,baseCap+tier*2),interval:Math.max(3.5,finite(config.waveInterval,10)/(1+tier*.12))};
}

// Three-second steps continue growing slowly, calculated from the chapter clock.
export function pursuitMultiplier(seconds=0){const tier=Math.floor((Math.max(0,finite(seconds))+1e-8)/3);return 1+.12*Math.log1p(tier/6);}
