import {planAroundTraffic} from './traffic-detour.js?v=11';

/** Optional startup installer. No Three.js/DOM dependency and no teleport while
 * running. Install after makeTransport(), before the first rendered frame.
 * It owns ambient journeys, but leaves pickups and player rides to the existing
 * transport controller. The old traffic update still operates traffic lights.
 */
export function installConnectedTraffic(life, options={}) {
  if(life.connectedTraffic)return life.connectedTraffic;
  const network=life.roadNetwork, modeOf=v=>['bicycle','e-bike'].includes(v.type)?'cycle':'car';
  const dist=(a,b)=>Math.hypot(a.x-b.x,a.z-b.z),clamp=(x,a,b)=>Math.max(a,Math.min(b,x));
  const oldTraffic=life.updateTraffic,oldFollow=life.followVehicleRoute,oldClear=life.vehicleRoadClear,oldSpeed=life.vehicleTrafficSpeed,oldPlan=life.planRoadTrip;
  const stats={journeys:0,completed:0,passes:0,blockedPasses:0,collisionStops:0,spawnAdjustments:0,detours:0,failedDetours:0,yields:0,recoveries:0};
  const yieldingPairs=new Set();
  function clearInvalidYield(car){
    const state=car.ambientYield;
    if(state&&car.route!==state.yieldRoute){yieldingPairs.delete(state.key);delete car.ambientYield;}
    return car.ambientYield;
  }
  let cursor=0,sequence=1,grid=new Map(),gridTime=-1;
  const fleet=life.vehicles.filter(v=>!v.rental&&!v.boat),activeRadius=options.activeRadius??220,maxUpdates=options.maxUpdates??24;
  const profileEdges={car:network.edges.filter(e=>e.car),cycle:network.edges.filter(e=>e.cycle)};
  const mainId={car:network.stats.car.components[0]?.id,cycle:network.stats.cycle.components[0]?.id};
  function onAsphalt(x,z,mode,margin=.02){
    const nearest=network.nearest({x,z},mode);if(nearest&&nearest.distance<=nearest.width/2-margin)return true;
    // At a narrow path / wide road crossing the closest centreline may be the
    // narrow path. Asphalt coverage is the union of every allowed road strip.
    return profileEdges[mode].some(e=>{
      const radius=e.width/2-margin;if(x<Math.min(e.a.x,e.b.x)-radius||x>Math.max(e.a.x,e.b.x)+radius||z<Math.min(e.a.z,e.b.z)-radius||z>Math.max(e.a.z,e.b.z)+radius)return false;
      const dx=e.b.x-e.a.x,dz=e.b.z-e.a.z,t=clamp(((x-e.a.x)*dx+(z-e.a.z)*dz)/(e.len*e.len),0,1);
      return Math.hypot(x-e.a.x-dx*t,z-e.a.z-dz*t)<=radius;
    });
  }
  // First placement is part of spawning, before anything is shown. After this
  // installer returns every change of position is collision-checked movement.
  for(const car of fleet) {
    car.networkTraffic=true;car.ambientSeed=sequence++;car.ambientClock=0;
    if(!car.placed&&car.edge) {
      const e=car.edge,ux=(e.b.x-e.a.x)/e.len,uz=(e.b.z-e.a.z)/e.len,
        lane=Math.max(.4,Math.min(e.width*.25,e.width/2-car.width*.42-.08));
      car.group.position.set(e.a.x+ux*car.progress-uz*lane,.16,e.a.z+uz*car.progress+ux*lane);
      car.group.rotation.y=Math.atan2(ux,uz);car.placed=true;
    }
    // Legacy road data includes roads excluded by collision checks and isolated
    // service islands. Spawn these few ambient cars on the closest main road.
    const p=car.group.position,mode=modeOf(car),snap=network.nearest(p,mode);
    if(snap&&snap.component!==mainId[mode]) {
      let best=null;
      for(const e of profileEdges[mode]) {
        const mid={x:(e.a.x+e.b.x)/2,z:(e.a.z+e.b.z)/2},q=network.nearest(mid,mode);
        if(q.component!==mainId[mode])continue;
        const score=dist(p,q);if(!best||score<best.score)best={q,e,score};
      }
      if(best){const {q,e}=best,ux=(e.b.x-e.a.x)/e.len,uz=(e.b.z-e.a.z)/e.len,lane=Math.min(e.width*.25,e.width/2-car.width*.42-.08);
        p.set(q.x-uz*lane,q.y,q.z+ux*lane);car.group.rotation.y=Math.atan2(ux,uz);stats.spawnAdjustments++;}
    }
    car.parked=false;
  }
  function rebuildGrid(){grid=new Map();for(const v of life.vehicles){const p=v.group.position,key=`${Math.floor(p.x/16)},${Math.floor(p.z/16)}`;if(!grid.has(key))grid.set(key,[]);grid.get(key).push(v);}gridTime=life.time;}
  function nearby(x,z){const out=[],cx=Math.floor(x/16),cz=Math.floor(z/16);for(let i=-1;i<=1;i++)for(let j=-1;j<=1;j++)out.push(...(grid.get(`${cx+i},${cz+j}`)||[]));return out;}
  function box(car,x=car.group.position.x,z=car.group.position.z,h=car.group.rotation.y,pad=.08){
    const maxZ=car.bounds?.max?.z??car.length/2,minZ=car.bounds?.min?.z??-car.length/2,offset=(maxZ+minZ)/2;
    // Match the existing controller's physical body width; model width also
    // includes mirrors/handlebars. A single full-width rectangle along the
    // whole model incorrectly makes opposite lane traffic overlap constantly.
    return {x:x+Math.sin(h)*offset,z:z+Math.cos(h)*offset,c:Math.cos(h),s:Math.sin(h),w:car.width*.42+pad,l:(maxZ-minZ)/2+pad};
  }
  function overlaps(a,b){const dx=b.x-a.x,dz=b.z-a.z;for(const [ux,uz] of [[a.c,-a.s],[a.s,a.c],[b.c,-b.s],[b.s,b.c]]){
    const ra=a.w*Math.abs(a.c*ux-a.s*uz)+a.l*Math.abs(a.s*ux+a.c*uz),rb=b.w*Math.abs(b.c*ux-b.s*uz)+b.l*Math.abs(b.s*ux+b.c*uz);
    if(Math.abs(dx*ux+dz*uz)>=ra+rb)return false;
  }return true;}
  // Remove pre-existing spawn intersections before simulation begins. Search
  // other points on the same mapped edge, retaining orientation and real road
  // coverage. This does not move vehicles after the initial installation.
  const placed=[];
  for(const car of fleet){
    const p=car.group.position,mode=modeOf(car),n=network.nearest(p,mode),e=n&&network.edges[n.edgeId];
    if(!e)continue;
    const sign=(e.b.x-e.a.x)*Math.sin(car.group.rotation.y)+(e.b.z-e.a.z)*Math.cos(car.group.rotation.y)>=0?1:-1,
      ux=(e.b.x-e.a.x)/e.len*sign,uz=(e.b.z-e.a.z)/e.len*sign,h=Math.atan2(ux,uz),lane=Math.min(e.width*.25,e.width/2-car.width*.42-.08);
    for(const delta of [0,12,-12,24,-24,40,-40,60,-60]){
      const t=clamp(n.t+delta/e.len,0.04,.96),x=e.a.x+(e.b.x-e.a.x)*t-uz*lane,z=e.a.z+(e.b.z-e.a.z)*t+ux*lane;
      if(!oldClear.call(life,car,x,z,h))continue;
      const shape=box(car,x,z,h,.22);
      if(placed.some(other=>overlaps(shape,box(other,undefined,undefined,undefined,.22))))continue;
      if(dist(p,{x,z})>.1)stats.spawnAdjustments++;p.set(x,n.y,z);car.group.rotation.y=h;break;
    }
    placed.push(car);
  }
  // Quarter-width lane centres leave enough separation for opposing vehicle
  // bodies on 5.5 m roads. The old width*.2 / 0.5 m curb margin placed wide
  // opposing vehicles too close together and created persistent queues.
  life.planRoadTrip=function(car,destination,routeOptions={}){
    if(car.boat)return oldPlan.call(this,car,destination);
    const routingNetwork=routeOptions.network||network;
    const raw=routingNetwork.route(car.group.position,destination,{mode:modeOf(car)});if(!raw.path.length||raw.status==='unreachable')return null;
    // Intersection splitting creates centimetre-long edges. Two separate
    // metre-scale miters around such an edge can reverse the offset lane.
    // Merge these coincident junction vertices before constructing the lane.
    const center=[];for(const p of raw.path){const previous=center.at(-1);
      if(previous&&dist(previous,p)<1&&Math.abs((previous.y??.16)-(p.y??.16))<.3)center[center.length-1]={...p,width:Math.min(previous.width||p.width,p.width)};
      else center.push({...p});
    }
    const path=center.map((p,i,a)=>{const prev=a[Math.max(0,i-1)],next=a[Math.min(a.length-1,i+1)],
      before=dist(prev,p),after=dist(p,next),width=Math.min(p.width||5.5,prev.width||p.width||5.5),
      offset=Math.max(.35,Math.min(width*.25,width/2-car.width*.42-.08));
      const ix=before?(p.x-prev.x)/before:after?(next.x-p.x)/after:0,iz=before?(p.z-prev.z)/before:after?(next.z-p.z)/after:1,
        ox=after?(next.x-p.x)/after:ix,oz=after?(next.z-p.z)/after:iz;
      let nx=-iz-oz,nz=ix+ox,n=Math.hypot(nx,nz);
      if(n<.0001){nx=-oz;nz=ox;n=1;}nx/=n;nz/=n;
      const miter=Math.min(offset*2,offset/Math.max(.35,nx*(-oz)+nz*ox));
      return {x:p.x+nx*miter,z:p.z+nz*miter,y:p.y??.16,width:p.width};});
    if(dist(car.group.position,path[0])>.05)path.unshift({x:car.group.position.x,z:car.group.position.z,y:car.group.position.y});
    const length=path.slice(1).reduce((s,p,i)=>s+dist(path[i],p),0);
    return {...raw,path,index:1,length,remaining:length,destination:path.at(-1),requestedDestination:{x:destination.x,z:destination.z},wait:0};
  };
  function vehiclesClear(car,x,z,h,allowEscape=true){
    if(gridTime!==life.time)rebuildGrid();const proposed=box(car,x,z,h),current=box(car);
    for(const other of nearby(x,z))if(other!==car&&!other.boat){
      const p=other.group.position;if(Math.hypot(p.x-x,p.z-z)>car.length+other.length)continue;
      const obstacle=box(other);if(!overlaps(proposed,obstacle))continue;
      // Spawned legacy meshes may already overlap. Permit movement separating
      // that existing overlap, never movement farther into the other vehicle.
      if(allowEscape&&overlaps(current,obstacle)&&dist(proposed,obstacle)>dist(current,obstacle)+.001)continue;
      return false;
    }
    return true;
  }
  life.vehicleRoadClear=function(car,x,z,h){
    if(!oldClear.call(this,car,x,z,h))return false;
    const recovery=clearInvalidYield(car);
    if(recovery?.reverseHeading!==undefined){
      const shape=box(car,x,z,h),person=p=>({x:p.x,z:p.z,c:1,s:0,w:.4,l:.4});
      if(this.npcs.some(n=>overlaps(shape,person(n.pos)))||(!this.ride&&!this.room&&overlaps(shape,person(this.position))))return false;
    }
    if(!car.boat&&!vehiclesClear(car,x,z,h)){stats.collisionStops++;return false;}
    return true;
  };
  life.vehicleTrafficSpeed=function(car,wanted){
    clearInvalidYield(car);
    let speed;
    // A validated passing curve is governed by the swept body collision check,
    // which stays active in vehicleRoadClear. The old scalar ahead/across test
    // must not keep braking for the one parked car being passed while steering
    // changes its projected lateral distance. All other traffic still brakes.
    const passRoute=car.route,passId=passRoute?.passingObstacleId;
    if(passId&&passRoute.passingEndIndex===undefined){
      // Also accept an in-progress manoeuvre restored from an older snapshot.
      passRoute.passingEndIndex=passRoute.path.length-1;
      for(let i=2;i<passRoute.path.length;i++)if(dist(passRoute.path[i-1],passRoute.path[i])>5){passRoute.passingEndIndex=i-1;break;}
    }
    const passing=passId&&passRoute.index<=passRoute.passingEndIndex,all=this.vehicles;
    if(passing){this.vehicles=all.filter(v=>v.id!==passId);try{speed=oldSpeed.call(this,car,wanted);}finally{this.vehicles=all;}}
    else speed=oldSpeed.call(this,car,wanted);
    if(car.networkTraffic&&!car.controlled)speed=Math.min(speed,modeOf(car)==='cycle'?3.8:6.2);
    // Reserve the yielder's rotation envelope until it is parallel again.
    // Otherwise a following car can creep beside its perpendicular body and
    // prevent both vehicles from completing a collision-free rotation.
    for(const other of this.vehicles)if(other!==car&&clearInvalidYield(other)&&other.ambientYield.stage!=='wait'){
      const p=car.group.position,q=other.group.position,h=car.group.rotation.y,dx=q.x-p.x,dz=q.z-p.z,
        ahead=dx*Math.sin(h)+dz*Math.cos(h),across=Math.abs(dx*Math.cos(h)-dz*Math.sin(h)),
        radius=Math.hypot(other.length/2,other.width*.42)+.2,front=car.bounds?.max?.z??car.length/2;
      if(ahead>0&&across<radius+car.width*.42+.4)speed=Math.min(speed,Math.max(0,(ahead-front-radius-.9)*1.2));
    }
    // The old controlled-vehicle speed helper omitted the on-foot player.
    if(!car.boat&&!this.ride&&!this.room){const p=car.group.position,h=car.group.rotation.y,dx=this.position.x-p.x,dz=this.position.z-p.z,
      ahead=dx*Math.sin(h)+dz*Math.cos(h),across=Math.abs(dx*Math.cos(h)-dz*Math.sin(h)),front=car.bounds?.max?.z??car.length/2;
      if(ahead>0&&across<car.width/2+.42)speed=Math.min(speed,Math.max(0,(ahead-front-.7)*1.3));}
    return speed;
  };
  const random=car=>{car.ambientSeed=(Math.imul(car.ambientSeed,1664525)+1013904223)>>>0;return car.ambientSeed/4294967296;};
  function nextJourney(car){
    const p=car.group.position,h=car.group.rotation.y,mode=modeOf(car),edges=profileEdges[mode],targetDistance=600+random(car)*900;
    if(!edges.length)return false;let chosen=null,score=Infinity;
    for(let i=0;i<16;i++){
      const e=edges[Math.floor(random(car)*edges.length)],t=.2+random(car)*.6,q={x:e.a.x+(e.b.x-e.a.x)*t,z:e.a.z+(e.b.z-e.a.z)*t};
      const direct=dist(p,q);if(direct<300||direct>2800)continue;
      const route=life.planRoadTrip(car,q);if(!route||route.length<350||route.reachedDistance>5)continue;
      const ahead=route.path.find(v=>dist(p,v)>8);if(!ahead)continue;
      const dot=((ahead.x-p.x)*Math.sin(h)+(ahead.z-p.z)*Math.cos(h))/dist(p,ahead);
      // Strong preference for continuing forward; no repeated edge reversal.
      const cost=Math.abs(route.length-targetDistance)+(dot<.1?2400:0);
      if(cost<score){score=cost;chosen=route;}if(dot>.3&&Math.abs(route.length-targetDistance)<250)break;
    }
    if(!chosen){car.ambientRetry=life.time+2;return false;}
    car.route={...chosen,purpose:'ambient',label:'校园通行',index:1,wait:0};car.parked=false;stats.journeys++;return true;
  }
  function tryPass(car){
    const route=car.route;if(!route||car.boat||modeOf(car)!=='car'||route.path.length-route.index<1)return false;
    if((route.passingObstacleId&&route.index<=route.passingEndIndex)||route.passUntil>life.time||car.nextPassCheck>life.time)return false;car.nextPassCheck=life.time+1;
    const p=car.group.position,h=car.group.rotation.y,ux=Math.sin(h),uz=Math.cos(h);
    const obstacle=nearby(p.x,p.z).filter(v=>v!==car&&(v.parked||(v.route?.wait||0)>15)&&Math.abs(v.actualSpeed||0)<.1).map(v=>({v,
      ahead:(v.group.position.x-p.x)*ux+(v.group.position.z-p.z)*uz,across:Math.abs((v.group.position.x-p.x)*uz-(v.group.position.z-p.z)*ux)}))
      .filter(q=>q.ahead>11&&q.ahead<32&&q.across<(car.width+q.v.width)/2+.3).sort((a,b)=>a.ahead-b.ahead)[0];
    if(!obstacle)return false;
    const points=[{x:p.x,z:p.z,y:p.y},...route.path.slice(route.index)],cum=[0];for(let i=1;i<points.length;i++)cum.push(cum.at(-1)+dist(points[i-1],points[i]));
    const end=obstacle.ahead+(obstacle.v.length+car.length)/2+11;if(cum.at(-1)<end+2)return false;
    // The opposing lane must remain available for the entire manoeuvre. A
    // presently distant oncoming vehicle can otherwise arrive after the
    // static footprint preflight and meet the passer head-on at a junction.
    const roadWidth=Math.max(5.5,...points.slice(0,4).map(q=>q.width||5.5));
    for(const other of life.vehicles){if(other===car||other===obstacle.v||other.boat||(!other.route&&Math.abs(other.actualSpeed||0)<.1))continue;
      const dx=other.group.position.x-p.x,dz=other.group.position.z-p.z,ahead=dx*ux+dz*uz,across=Math.abs(dx*uz-dz*ux);
      if(ahead>0&&ahead<Math.max(100,end+65)&&across<roadWidth+1&&Math.cos(other.group.rotation.y-h)<.3){stats.blockedPasses++;return false;}
    }
    const shift=(car.width+obstacle.v.width)/2+.5;
    function sample(s){let i=1;while(i<cum.length-1&&cum[i]<s)i++;const a=points[i-1],b=points[i],len=dist(a,b)||1,t=clamp((s-cum[i-1])/len,0,1);
      const ramp=clamp(Math.min(s/8,(end-s)/8),0,1),ease=ramp*ramp*(3-2*ramp),offset=shift*ease;
      return {x:a.x+(b.x-a.x)*t+(b.z-a.z)/len*offset,z:a.z+(b.z-a.z)*t-(b.x-a.x)/len*offset,
        y:(a.y??.16)+((b.y??.16)-(a.y??.16))*t,width:b.width};}
    const detour=[];for(let s=0;s<end;s+=1.5)detour.push(sample(s));detour.push(sample(end));
    for(let i=0;i<detour.length;i++){
      const a=detour[Math.max(0,i-1)],b=detour[Math.min(detour.length-1,i+1)],q=detour[i],heading=Math.atan2(b.x-a.x,b.z-a.z);
      if(!oldClear.call(life,car,q.x,q.z,heading)||!vehiclesClear(car,q.x,q.z,heading,false)){stats.blockedPasses++;return false;}
      // For passing, all footprint corners must remain on rendered asphalt.
      const shape=box(car,q.x,q.z,heading,.08);
      for(const [sx,sz] of [[-1,-1],[-1,1],[1,-1],[1,1]]){
        const x=shape.x+sx*shape.w*shape.c+sz*shape.l*shape.s,z=shape.z-sx*shape.w*shape.s+sz*shape.l*shape.c;
        if(!onAsphalt(x,z,'car',.03)){stats.blockedPasses++;return false;}
      }
    }
    let tail=1;while(tail<cum.length&&cum[tail]<=end)tail++;
    route.path=[...detour,...points.slice(tail)];route.index=1;route.passUntil=life.time+12;route.passingEndIndex=detour.length-1;route.passingObstacleId=obstacle.v.id;route.wait=0;stats.passes++;return true;
  }
  function tryBackOut(car){
    const route=car.route,p=car.group.position,h=car.group.rotation.y,q=route?.path?.[route.index];
    if(!q||car.boat||(route.wait||0)<18||car.nextRecoveryAt>life.time||car.nextRecoveryCheck>life.time||(route.recoveries||0)>=2)return false;
    car.nextRecoveryCheck=life.time+2;
    if(life.vehicles.some(v=>v!==car&&clearInvalidYield(v)&&dist(p,v.group.position)<12))return false;
    const wanted=Math.atan2(q.x-p.x,q.z-p.z),angle=Math.atan2(Math.sin(wanted-h),Math.cos(wanted-h));
    if(Math.abs(angle)<.75)return false;
    const rotationSteps=Math.ceil(Math.abs(angle)/.02);
    let rotationBlocked=false;for(let i=1;i<=rotationSteps;i++){const heading=h+angle*i/rotationSteps;if(!oldClear.call(life,car,p.x,p.z,heading)||!vehiclesClear(car,p.x,p.z,heading,false)){rotationBlocked=true;break;}}
    if(!rotationBlocked)return false;
    car.backoutAudit=[];let failure;
    const mode=modeOf(car),poseClear=(x,z,heading)=>{
      if(!oldClear.call(life,car,x,z,heading)||!vehiclesClear(car,x,z,heading,false)){failure={reason:'body',x,z,heading};return false;}
      const shape=box(car,x,z,heading);
      for(const [sx,sz] of [[-1,-1],[-1,1],[1,-1],[1,1]]){const cx=shape.x+sx*shape.w*shape.c+sz*shape.l*shape.s,cz=shape.z-sx*shape.w*shape.s+sz*shape.l*shape.c;if(!onAsphalt(cx,cz,mode)){failure={reason:'asphalt',x,z,heading,cx,cz};return false;}}
      return !life.npcs.some(n=>overlaps(shape,{x:n.pos.x,z:n.pos.z,c:1,s:0,w:.4,l:.4}));
    };
    for(const distance of [.2,.35,.6,1,1.5,2,-.2,-.35,-.6,-1]){
      const target={x:p.x-Math.sin(h)*distance,z:p.z-Math.cos(h)*distance,y:p.y};let clear=true;
      for(let i=0;i<=10&&clear;i++)clear=poseClear(p.x+(target.x-p.x)*i/10,p.z+(target.z-p.z)*i/10,h);
      const finalHeading=Math.atan2(q.x-target.x,q.z-target.z),turn=Math.atan2(Math.sin(finalHeading-h),Math.cos(finalHeading-h));
      const turnSteps=Math.ceil(Math.abs(turn)/.02);for(let i=0;i<=turnSteps&&clear;i++)clear=poseClear(target.x,target.z,h+turn*i/turnSteps);
      if(!clear){car.backoutAudit.push({distance,...failure});continue;}
      const yieldRoute={path:[{x:p.x,z:p.z},target],index:1,purpose:'yield',wait:0},key=`backout:${car.id}`;
      route.recoveries=(route.recoveries||0)+1;car.nextRecoveryAt=life.time+60;car.ambientYield={stage:'reverse',original:route,yieldRoute,heading:finalHeading,reverseHeading:h,recoveryDirection:distance>0?-1:1,key,target,startedAt:life.time};
      yieldingPairs.add(key);car.route=yieldRoute;return true;
    }
    return false;
  }
  function tryYield(car){
    const route=car.route,p=car.group.position,h=car.group.rotation.y;
    if(!route||route.purpose==='yield'||car.boat||(route.wait||0)<15||car.nextYieldAt>life.time||car.ambientYield)return false;
    if(life.vehicles.some(v=>v!==car&&clearInvalidYield(v)&&dist(p,v.group.position)<12))return false;
    const ux=Math.sin(h),uz=Math.cos(h),candidate=nearby(p.x,p.z).filter(v=>v!==car&&Math.abs(v.actualSpeed||0)<.1&&(v.route?.wait||0)>15)
      .map(v=>({v,ahead:(v.group.position.x-p.x)*ux+(v.group.position.z-p.z)*uz,across:Math.abs((v.group.position.x-p.x)*uz-(v.group.position.z-p.z)*ux),opposing:Math.cos(h-v.group.rotation.y)}))
      .filter(q=>q.ahead>3.5&&q.ahead<12&&q.across<(car.width+q.v.width)/2+.3&&q.opposing<-.65).sort((a,b)=>a.ahead-b.ahead)[0];
    if(!candidate)return false;
    const other=candidate.v,key=[car.id,other.id].sort().join(':');if(yieldingPairs.has(key))return false;
    // Pick the current aligned road corridor. A crossing road must not be
    // mistaken for lateral passing space when it carries the opposing turn.
    let corridor=null;
    for(const e of profileEdges.car){const ex=(e.b.x-e.a.x)/e.len,ez=(e.b.z-e.a.z)/e.len;if(Math.abs(ex*ux+ez*uz)<.85)continue;
      const t=clamp(((p.x-e.a.x)*ex+(p.z-e.a.z)*ez)/e.len,0,1),x=e.a.x+ex*e.len*t,z=e.a.z+ez*e.len*t,d=Math.hypot(x-p.x,z-p.z);
      if(d<7&&(!corridor||d<corridor.d))corridor={e,ex,ez,d};}
    if(!corridor)return false;
    const shift=Math.max(2.4,(car.width+other.width)/2+.9),target={x:p.x+uz*shift,z:p.z-ux*shift,y:p.y};
    for(let i=0;i<=8;i++){
      const x=p.x+(target.x-p.x)*i/8,z=p.z+(target.z-p.z)*i/8,shape=box(car,x,z,h);
      if(!oldClear.call(life,car,x,z,h)||!vehiclesClear(car,x,z,h,false))return false;
      for(const [sx,sz] of [[-1,-1],[-1,1],[1,-1],[1,1]]){const cx=shape.x+sx*shape.w*shape.c+sz*shape.l*shape.s,cz=shape.z-sx*shape.w*shape.s+sz*shape.l*shape.c,
        across=Math.abs((cx-corridor.e.a.x)*(-corridor.ez)+(cz-corridor.e.a.z)*corridor.ex);if(across>corridor.e.width/2-.04)return false;}
    }
    const yieldRoute={path:[{x:p.x,z:p.z,y:p.y},target],index:1,purpose:'yield',wait:0};
    yieldingPairs.add(key);car.ambientYield={stage:'move',original:route,yieldRoute,heading:h,other,key,target,startedAt:life.time};
    car.route=yieldRoute;return true;
  }
  function updateYield(car,dt){
    const state=clearInvalidYield(car);if(!state)return;
    state.startedAt??=life.time;
    if(life.time-state.startedAt>20){car.route=state.original;car.route.wait=0;car.actualSpeed=0;car.parked=false;car.nextYieldAt=life.time+60;yieldingPairs.delete(state.key);delete car.ambientYield;return;}
    if(state.stage==='reverse'){
      const d=dist(car.group.position,state.target);
      if(d>.035)life.moveControlledVehicle(car,dt,(state.recoveryDirection??-1)*Math.min(.8,d/dt),state.reverseHeading);
      else{car.actualSpeed=0;state.stage='align';}return;
    }
    if(state.stage==='move'){
      const dx=state.target.x-car.group.position.x,dz=state.target.z-car.group.position.z,d=Math.hypot(dx,dz),
        wanted=Math.atan2(dx,dz),angle=Math.atan2(Math.sin(wanted-car.group.rotation.y),Math.cos(wanted-car.group.rotation.y));
      if(d>.18){const heading=car.group.rotation.y+clamp(angle,-dt*2.8,dt*2.8),speed=life.vehicleTrafficSpeed(car,Math.min(1.2,d/dt));
        life.moveControlledVehicle(car,dt,speed,heading);
      }else{car.actualSpeed=0;state.stage='align';car.parked=true;}return;
    }
    if(state.stage==='align'){
      const angle=Math.atan2(Math.sin(state.heading-car.group.rotation.y),Math.cos(state.heading-car.group.rotation.y));
      life.moveControlledVehicle(car,dt,0,car.group.rotation.y+clamp(angle,-dt*2.8,dt*2.8));
      if(Math.abs(angle)<.06){
        if(state.reverseHeading!==undefined){car.route=state.original;car.route.wait=0;car.parked=false;car.actualSpeed=0;yieldingPairs.delete(state.key);delete car.ambientYield;stats.recoveries++;}
        else{state.stage='wait';state.until=life.time+3;state.limit=life.time+8;}
      }return;
    }
    if(life.time<state.until)return;
    const dx=state.other.group.position.x-car.group.position.x,dz=state.other.group.position.z-car.group.position.z,
      passed=dx*Math.sin(state.heading)+dz*Math.cos(state.heading)<-state.other.length/2-2;
    if(!passed&&Math.hypot(dx,dz)<12&&life.time<state.limit)return;
    const planned=life.planRoadTrip(car,state.original.requestedDestination);
    car.route=planned?{...state.original,...planned,purpose:state.original.purpose,index:1,wait:0}:null;car.parked=!planned;car.actualSpeed=0;
    if(car.route)for(const key of ['passingObstacleId','passingEndIndex','passUntil'])delete car.route[key];
    if(life.ride?.car===car)life.ride.trip=car.route;if(life.pickup===car&&car.route)life.pickupPoint=car.route.destination;
    car.nextYieldAt=life.time+40;yieldingPairs.delete(state.key);delete car.ambientYield;stats.yields++;
  }
  life.followVehicleRoute=function(car,dt){
    if(clearInvalidYield(car)){updateYield(car,dt);return;}
    // Closely spaced junction offsets are steering guides. Requiring a long
    // bus to close the final centimetres can pin its nose against another car
    // even though the next segment turns away into clear asphalt.
    const active=car.route;
    if(active&&!car.boat)while(active.index<active.path.length-1&&dist(car.group.position,active.path[active.index])<.8)active.index++;
    if(tryBackOut(car)){updateYield(car,dt);return;}
    if(tryYield(car)){updateYield(car,dt);return;}
    const r=car.route;
    if(r&&r.purpose!=='ambient'&&(r.wait||0)>23&&(r.nextDetourAt||0)<this.time){
      r.nextDetourAt=this.time+35;
      const result=planAroundTraffic(this,car);car.lastTrafficDetour={...result,planned:undefined};
      if(result.planned){car.route={...r,...result.planned,purpose:r.purpose,label:r.label,travelled:r.travelled||0,nextDetourAt:this.time+35};
        for(const key of ['passingObstacleId','passingEndIndex','passUntil'])delete car.route[key];
        if(this.ride?.car===car)this.ride.trip=car.route;if(this.pickup===car)this.pickupPoint=car.route.destination;stats.detours++;
      }else stats.failedDetours++;
    }
    tryPass(car);return oldFollow.call(this,car,dt);
  };
  life.updateTraffic=function(dt){
    // The old method still drives signals/visibility. Temporarily reserve the
    // fleet so its stale edge/progress cannot also move these same cars.
    const states=fleet.map(car=>car.controlled);for(const car of fleet)car.controlled=true;
    oldTraffic.call(this,dt);fleet.forEach((car,i)=>car.controlled=states[i]);rebuildGrid();
    for(const car of fleet){clearInvalidYield(car);car.ambientClock=Math.min(.2,(car.ambientClock||0)+dt);}
    let updated=0;
    for(let k=0;k<fleet.length&&updated<maxUpdates;k++){
      const car=fleet[(cursor++)%fleet.length];if(car.controlled||car.rental||car.nightParked)continue;
      if(!car.rider){car.parked=true;if(car.route?.purpose==='ambient')car.route=null;continue;}
      if(dist(car.group.position,this.position)>activeRadius&&(!this.pickup||dist(car.group.position,this.pickup.group.position)>activeRadius))continue;
      if(car.ambientClock<.075)continue;
      const step=Math.min(.2,car.ambientClock);car.ambientClock=0;updated++;
      if(car.ambientYield){updateYield(car,step);continue;}
      if(!car.route){if((car.ambientRetry||0)>this.time)continue;nextJourney(car);}
      if(car.route){this.followVehicleRoute(car,step);if(!car.route&&!car.ambientYield){stats.completed++;nextJourney(car);}}
    }
  };
  rebuildGrid();
  life.connectedTraffic={stats,tryPass,tryBackOut,vehiclesClear,nextJourney};
  return life.connectedTraffic;
}
