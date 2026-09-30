import {updateAvatar} from './avatar.js?v=11';
import {resetRolePose,updateRoleAction} from './character-props.js?v=11';
import {findPath} from './pathfinding.js?v=11';

const distance=(a,b)=>Math.hypot(a.x-b.x,a.z-b.z), point=p=>({x:p.x,z:p.z}), now=()=>globalThis.performance?.now?.()??Date.now();

// This function is self-contained so the same clearance rules run in both
// persistent workers and the live movement guard. It intentionally does not
// call life.navigationWalkable(), whose coordinates change when the player
// enters an indoor scene.
function residentEnvironment(world){
 const bins=new Map(),roads=new Map(),bounds=world.bounds,offsets=[[0,0],[.32,0],[-.32,0],[0,.32],[0,-.32]];
 const insert=(map,box,margin,item)=>{for(let x=Math.floor((box[0]-margin)/32);x<=Math.floor((box[2]+margin)/32);x++)for(let z=Math.floor((box[1]-margin)/32);z<=Math.floor((box[3]+margin)/32);z++){const key=x+','+z;if(!map.has(key))map.set(key,[]);map.get(key).push(item);}};
 const inside=(x,z,p)=>{let yes=false;for(let i=0,j=p.length-1;i<p.length;j=i++){const a=p[i],b=p[j];if((a[1]>z)!==(b[1]>z)&&x<(b[0]-a[0])*(z-a[1])/(b[1]-a[1])+a[0])yes=!yes;}return yes;};
 const contains=(f,x,z)=>x>=f.box[0]&&x<=f.box[2]&&z>=f.box[1]&&z<=f.box[3]&&inside(x,z,f.p)&&!(f.h||[]).some(h=>inside(x,z,h));
 for(const f of world.buildings)insert(bins,f.box,.5,{f,water:false});for(const f of world.waters)insert(bins,f.box,.5,{f,water:true});
 for(const r of world.roads)for(let i=1;i<r.p.length;i++){const a=r.p[i-1],b=r.p[i],dx=b[0]-a[0],dz=b[1]-a[1],radius=r.width/2;const s={x:a[0],z:a[1],dx,dz,l2:dx*dx+dz*dz||1,radius,bridge:r.tags?.bridge==='yes'};insert(roads,[Math.min(a[0],b[0]),Math.min(a[1],b[1]),Math.max(a[0],b[0]),Math.max(a[1],b[1])],radius,s);}
 const near=(x,z,s)=>{const t=Math.max(0,Math.min(1,((x-s.x)*s.dx+(z-s.z)*s.dz)/s.l2));return Math.hypot(x-s.x-t*s.dx,z-s.z-t*s.dz);};
 const key=(x,z)=>Math.floor(x/32)+','+Math.floor(z/32), roadAt=(x,z)=>(roads.get(key(x,z))||[]);
 const walkable=(x,z,clearance=true)=>{if(!Number.isFinite(x)||!Number.isFinite(z)||x<bounds[0]||x>bounds[2]||z<bounds[1]||z>bounds[3])return false;for(const {f,water}of bins.get(key(x,z))||[]){if(water){if(contains(f,x,z)&&!roadAt(x,z).some(s=>s.bridge&&near(x,z,s)<s.radius-.38))return false;}else for(const [dx,dz]of clearance?offsets:[[0,0]])if(contains(f,x+dx,z+dz))return false;}return true;};
 return {bounds,walkable,cost:(x,z)=>roadAt(x,z).some(s=>near(x,z,s)<s.radius)?1:1.2,height:(x,z)=>roadAt(x,z).some(s=>s.bridge&&near(x,z,s)<s.radius)?1.08:.16};
}

function inObstacle(b,x,z,start){const dx=x-b.x,dz=z-b.z;if(b.hx!==undefined){const h=b.heading||0,lx=dx*Math.cos(h)-dz*Math.sin(h),lz=dx*Math.sin(h)+dz*Math.cos(h),pad=start&&Math.hypot(x-start.x,z-start.z)<.35?0:(b.planPad||0);return Math.abs(lx)<b.hx+pad&&Math.abs(lz)<b.hz+pad;}return Math.hypot(dx,dz)<b.r;}

function clearSegment(a,b,walkable,step=.18){const n=Math.max(1,Math.ceil(distance(a,b)/step));for(let i=0;i<=n;i++)if(!walkable(a.x+(b.x-a.x)*i/n,a.z+(b.z-a.z)*i/n))return false;return true;}

export function createNightResidents(life){
 const clean=f=>({p:f.p,h:f.h||[],box:f.box,width:f.width,tags:{bridge:f.tags?.bridge}}),world={bounds:life.env.bounds.slice(),buildings:life.env.buildings.map(clean),waters:life.env.waters.map(clean),roads:life.env.roads.map(clean)},nav=residentEnvironment(world);
 const states=new Map(),queue=[],pool=[],stats={planned:0,arrived:0,returned:0,replans:0,alternateHomes:0,trafficWaits:0,vehicleWaits:0,plannerFailures:0,maxUpdateMs:0,workerMode:true};
 let night=false,clock=0,sequence=0,syncAt=0,workerURL=null,fallbackAt=0,safetyZone=null;
 const rootOf=n=>life.root(n.rig),visible=n=>!n.nightInside&&!life.room&&(life.mode==='aerial'||distance(n.pos,life.position)<180);
 const homes=life.env.buildings.filter(b=>b.entrance).map(b=>({feature:b,door:b.entrance,point:life.doorWorld(b.entrance,0,.8)})).filter(h=>nav.walkable(h.point.x,h.point.z));
 const blockSnapshot=()=>[...(life.buildBlocks?.values?.()||[])].filter(b=>b.y<2).map(b=>({x:b.x+.5,z:b.z+.5,hx:.8,hz:.8}));
 const liveWalkable=(x,z)=>nav.walkable(x,z)&&![...(life.buildBlocks?.values?.()||[])].some(b=>b.y<2&&x>b.x-.3&&x<b.x+1.3&&z>b.z-.3&&z<b.z+1.3);
 const homeAllowed=h=>h&&(!h.zoneOnly||safetyZone?.active)&&(!safetyZone?.active||distance(h.point,safetyZone)<=Math.max(0,safetyZone.radius-.8));
 function mark(n,s){if(n.zoneDead)return;n.nightState=s.status;n.nightInside=s.status==='inside';rootOf(n).visible=visible(n);}
 function capture(n,s){s.day={position:point(n.pos),y:n.pos.y,heading:rootOf(n).rotation.y,t:n.t,dir:n.dir,sign:n.sign,pause:n.pause,waiting:n.waiting,meters:n.meters,phase:n.phase,time:life.time};}
 function sync(){for(const n of [...(life.npcs||[]),...(life.activityActors||[])])if(n.rig&&n.pos&&!states.has(n)){const s={id:++sequence,n,status:'day',generation:0,path:null,retryAt:0,wait:0,attempt:0,home:null,steps:0,distance:0};states.set(n,s);if(night){capture(n,s);begin(s,'home');}}}
 function begin(s,direction){s.generation++;s.queued=false;s.pendingHome=null;s.blockedCars=[];s.lastPlanFailed=false;s.direction=direction;s.path=null;s.index=1;s.wait=0;s.attempt=0;s.retryAt=clock+(s.id%11)*.13;s.status='planning';s.reason=null;if(direction==='home'){if(!homeAllowed(s.home))s.home=null;s.candidates=homes.filter(homeAllowed).sort((a,b)=>{const score=h=>distance(s.n.pos,h.point)-(h.feature===s.n.home?30:0);return score(a)-score(b);});}mark(s.n,s);}
 // A circle update invalidates only an unsafe destination, not every path.
 // A resident already indoors leaves through the same saved entrance position.
 function setSafetyZone(zone){const active=!!zone?.active&&Number.isFinite(zone.x)&&Number.isFinite(zone.z)&&Number.isFinite(zone.radius)&&zone.radius>0;safetyZone=active?{x:zone.x,z:zone.z,radius:zone.radius,active:true}:null;if(!night)return;for(const s of states.values()){if(s.n.zoneDead)continue;const target=s.pendingHome||s.home;if(target&&!homeAllowed(target)||s.status==='safe-wait'&&!safetyZone?.active)begin(s,'home');}}
 function safeLanding(s){if(!safetyZone?.active)return null;const z=safetyZone,dx=s.n.pos.x-z.x,dz=s.n.pos.z-z.z,len=Math.hypot(dx,dz)||1,r=Math.max(0,z.radius-2),anchor={x:z.x+dx/len*Math.min(len,r),z:z.z+dz/len*Math.min(len,r)};for(let ring=0;ring<=Math.max(8,z.radius*2);ring+=2)for(let i=0;i<(ring?24:1);i++){const p={x:anchor.x+Math.cos(i*Math.PI/12)*ring,z:anchor.z+Math.sin(i*Math.PI/12)*ring};if(distance(p,z)<=Math.max(0,z.radius-.8)&&liveWalkable(p.x,p.z))return{feature:null,door:null,point:p,zoneOnly:true};}return null;}
 function show(s){s.status='planning';s.n.nightInside=false;mark(s.n,s);}
 function restoreDay(s){const n=s.n,d=s.day;for(const k of ['t','dir','sign','pause','waiting','meters'])if(d[k]!==undefined)n[k]=d[k];if(d.phase!==undefined)n.phase=d.phase+d.time-life.time;rootOf(n).rotation.y=d.heading;rootOf(n).position.copy(n.pos);s.status='day';s.path=null;n.nightInside=false;n.nightState='day';stats.returned++;rootOf(n).visible=visible(n);s.onReturn?.(n);}
 function setNight(value){value=!!value;sync();if(value===night)return;night=value;for(const s of states.values()){if(s.n.zoneDead)continue;
  if(night){if(s.status==='day')capture(s.n,s);if(s.status!=='inside')begin(s,'home');}
  else if(s.status!=='day'){if(s.status==='inside'){begin(s,'day');s.status='emerging';s.retryAt=clock+(s.id%17)*.2;mark(s.n,s);s.n.nightInside=true;rootOf(s.n).visible=false;}else begin(s,'day');}
 }}
 function accept(job,result){const s=job.state;if(job.generation!==s.generation)return;s.queued=false;s.pendingHome=null;if(s.n.zoneDead)return;if(s.direction==='home'&&!homeAllowed(job.home)){begin(s,'home');return;}
  if(result.status==='ok'&&result.path.length){s.path=result.path;s.index=1;s.status='walking';s.reason=null;s.lastPlanFailed=false;s.wait=0;if(s.direction==='home'){s.home=job.home;s.assignedHomeId=job.home.feature?.id||null;}stats.planned++;mark(s.n,s);}
  else{s.lastPlanFailed=true;s.reason=result.reason||result.status;s.status='planning';s.attempt++;stats.plannerFailures++;if(s.direction==='home')stats.alternateHomes++;s.retryAt=clock+.15;mark(s.n,s);}
 }
 // Two persistent workers share their own cached geometry index across jobs.
 // Only start/goal and current dynamic obstacles are copied for each resident.
 try{if(typeof Worker!=='function')throw Error('Worker unavailable');const pathURL=new URL('./pathfinding.js?v=11',import.meta.url).href;
  const source=`const inObstacle=${inObstacle.toString()};import {findPath} from ${JSON.stringify(pathURL)};const environment=${residentEnvironment.toString()};let nav;onmessage=({data:d})=>{if(d.world){nav=environment(d.world);postMessage({ready:true});return;}try{const blocked=d.obstacles||[],walkable=(x,z)=>nav.walkable(x,z)&&!blocked.some(b=>inObstacle(b,x,z,d.start));let result;if(${clearSegment.toString().replace('function clearSegment','function').replaceAll('distance(a,b)','Math.hypot(a.x-b.x,a.z-b.z)')}(d.start,d.goal,walkable,.02))result={status:'ok',path:[d.start,d.goal]};else{result=findPath(d.start,d.goal,{bounds:nav.bounds,walkable,cost:nav.cost,cellSize:2,sampleStep:.3,validationStep:.02,heuristicWeight:1.5,maxMilliseconds:250,maxVisited:65000,smoothLookahead:8});if(result.status!=='ok'&&d.fine)result=findPath(d.start,d.goal,{bounds:nav.bounds,walkable,cost:nav.cost,cellSize:.7,sampleStep:.2,validationStep:.02,heuristicWeight:1.8,maxMilliseconds:450,maxVisited:85000,smoothLookahead:6});}postMessage({id:d.id,result});}catch(e){postMessage({id:d.id,result:{status:'error',reason:e.message}});}};`;
  workerURL=URL.createObjectURL(new Blob([source],{type:'text/javascript'}));for(let i=0;i<2;i++){const slot={worker:new Worker(workerURL,{type:'module'}),busy:null,ready:false};slot.worker.onmessage=({data})=>{if(data.ready){slot.ready=true;return;}if(!slot.busy||data.id!==slot.busy.id)return;const job=slot.busy;slot.busy=null;accept(job,data.result);};slot.worker.onerror=()=>{if(slot.busy){const job=slot.busy;slot.busy=null;accept(job,{status:'error',reason:'Planner worker failed'});}slot.worker.terminate();slot.dead=true;stats.workerMode=pool.some(p=>!p.dead);};slot.worker.postMessage({world});pool.push(slot);}
 }catch{stats.workerMode=false;}
 function enqueue(s){if(s.queued||clock<s.retryAt)return;
  let home=null,goal;if(s.direction==='home'){s.candidates=(s.candidates||homes).filter(homeAllowed);home=homeAllowed(s.home)&&!s.lastPlanFailed?s.home:s.candidates[s.attempt%s.candidates.length];if(!home)home=safeLanding(s);if(!home){s.reason='No usable entrance or safe landing';s.retryAt=clock+8;return;}goal=home.point;}else goal=s.day.position;
  if(!nav.walkable(s.n.pos.x,s.n.pos.z)){s.reason='Existing position lacks clearance';s.retryAt=clock+1;recoverStart(s);return;}
  const obstacles=blockSnapshot();for(const car of s.blockedCars||[])obstacles.push({x:car.group.position.x,z:car.group.position.z,hx:(car.width||1.5)/2+.35,hz:(car.length||3)/2+.35,heading:car.group.rotation.y,planPad:.12});
  const id=s.id+':'+s.generation+':'+s.attempt+':'+clock;s.queued=true;s.pendingHome=home;queue.push({id,state:s,generation:s.generation,home,start:point(s.n.pos),goal:point(goal),obstacles,fine:s.attempt>=Math.min(8,homes.length)});
 }
 function dispatch(){for(const slot of pool){if(slot.dead||!slot.ready||slot.busy)continue;let job;while(queue.length&&!job){const q=queue.shift();if(q.state.generation===q.generation)job=q;}if(job){slot.busy=job;const {id,start,goal,obstacles,fine}=job;slot.worker.postMessage({id,start,goal,obstacles,fine});}}
  if(!stats.workerMode&&queue.length&&clock>=fallbackAt){fallbackAt=clock+.08;const job=queue.shift();if(job.state.generation!==job.generation)return;const walkable=(x,z)=>liveWalkable(x,z)&&!job.obstacles.some(b=>inObstacle(b,x,z,job.start));const result=clearSegment(job.start,job.goal,walkable,.02)?{status:'ok',path:[job.start,job.goal]}:findPath(job.start,job.goal,{bounds:nav.bounds,walkable,cost:nav.cost,cellSize:2,sampleStep:.3,validationStep:.02,heuristicWeight:1.8,maxMilliseconds:18,maxVisited:12000,smoothLookahead:5});accept(job,result);}
 }
 function recoverStart(s){const a=s.n.pos;if(!nav.walkable(a.x,a.z,false))return;for(let r=.15;r<=1.5;r+=.15)for(let i=0;i<24;i++){const p={x:a.x+Math.cos(i*Math.PI/12)*r,z:a.z+Math.sin(i*Math.PI/12)*r};if(nav.walkable(p.x,p.z)&&clearSegment(a,p,(x,z)=>nav.walkable(x,z,false),.05)){s.path=[point(a),p];s.index=1;s.recovering=true;s.status='walking';return;}}}
 function carAt(p){for(const c of life.vehicles||[]){if(c.boat||c.group.position.y>2.5||Math.abs(c.group.position.y-nav.height(p.x,p.z))>2)continue;const dx=p.x-c.group.position.x,dz=p.z-c.group.position.z;if(Math.abs(dx)>8||Math.abs(dz)>8)continue;const h=c.group.rotation.y,x=dx*Math.cos(h)-dz*Math.sin(h),z=dx*Math.sin(h)+dz*Math.cos(h);if(Math.abs(x)<(c.width||1.5)/2+.35&&Math.abs(z)<(c.length||3)/2+.35)return c;}return null;}
 function blockedBySignal(a,b){if(life.trafficBlocked?.(a,b))return true;for(const c of life.crossings||[]){const t=(life.time+(c.offset||0))%20;if(t>=11&&t<17)continue;const along=(b.x-c.x)*c.ux+(b.z-c.z)*c.uz,across=(b.x-c.x)*-c.uz+(b.z-c.z)*c.ux,old=(a.x-c.x)*-c.uz+(a.z-c.z)*c.ux;if(Math.abs(along)<3.1&&Math.abs(across)<c.width/2+.15&&Math.abs(old)>=c.width/2+.1)return true;}return false;}
 function walk(s,dt){const n=s.n,start=point(n.pos),speed=Math.max(1.4,Math.min(2.6,n.speed||1.8));let budget=speed*dt,moved=0,reason=null;
  while(budget>1e-6&&s.path&&s.index<s.path.length){const target=s.path[s.index],len=distance(n.pos,target);if(len<1e-7){s.index++;continue;}const step=Math.min(budget,len,.12),p={x:n.pos.x+(target.x-n.pos.x)/len*step,z:n.pos.z+(target.z-n.pos.z)/len*step};
   if(!(s.recovering?nav.walkable(p.x,p.z,false):liveWalkable(p.x,p.z))){reason='static obstacle';s.lastBlocked=p;break;}if(blockedBySignal(n.pos,p)){reason='red light';stats.trafficWaits++;break;}const car=carAt(p);if(car){reason='vehicle';stats.vehicleWaits++;if(s.wait>4&&!s.blockedCars.includes(car))s.blockedCars.push(car);break;}
   n.pos.x=p.x;n.pos.z=p.z;n.pos.y=nav.height(p.x,p.z);budget-=step;moved+=step;s.steps++;if(step===len)s.index++;
  }
  s.distance+=moved;s.wait=moved>.01?0:s.wait+dt;n.waiting=reason==='red light';s.reason=reason;
  if(moved>.001)rootOf(n).rotation.y=Math.atan2(n.pos.x-start.x,n.pos.z-start.z);
  if(s.path&&s.index>=s.path.length){if(s.recovering){s.recovering=false;s.path=null;s.status='planning';s.retryAt=clock;}
   else if(s.direction==='home'){const d=s.home.door;if(d){d.open=true;d.target=-Math.PI*.53;d.npcUntil=life.time+2;s.status='inside';stats.arrived++;}else{s.status='safe-wait';s.reason='No building entrance in safety circle';}s.path=null;n.waiting=true;}
   else {restoreDay(s);return;}
  }else if(reason!=='red light'&&s.wait>5){s.path=null;s.status='planning';s.wait=0;s.retryAt=clock+.3;stats.replans++;}
  rootOf(n).position.copy(n.pos);mark(n,s);if(rootOf(n).visible){resetRolePose(n.rig);updateAvatar(n.rig,dt,moved/Math.max(dt,.001),'idle');updateRoleAction(n.rig,dt,'idle');}
 }
 function update(dt){const start=now();dt=Math.min(.25,Math.max(0,Number(dt)||0));clock+=dt;if(clock>=syncAt){sync();syncAt=clock+1;}for(const s of states.values()){
  if(s.n.zoneDead){if(!s.wasDead){s.wasDead=true;s.generation++;s.queued=false;s.pendingHome=null;s.path=null;s.status='dead';}continue;}if(s.wasDead){s.wasDead=false;if(!s.day)capture(s.n,s);begin(s,night?'home':'day');}
  if(s.status==='day')continue;if(s.status==='inside'||s.status==='safe-wait'){mark(s.n,s);continue;}if(s.status==='emerging'){if(clock<s.retryAt)continue;show(s);}
  if(s.status==='planning')enqueue(s);else if(s.status==='walking')walk(s,dt);mark(s.n,s);
 }dispatch();stats.maxUpdateMs=Math.max(stats.maxUpdateMs,now()-start);}
 function getState(detail=true){if(!detail){const counts={};for(const s of states.values())counts[s.status]=(counts[s.status]||0)+1;return{night,safetyZone:safetyZone?{...safetyZone}:null,inside:counts.inside||0,counts,total:states.size,queued:queue.length,activePlanners:pool.filter(p=>p.busy).length,stats:{...stats}};}const residents=[...states.values()].map(s=>({id:s.id,kind:s.n.kind,name:s.n.name||s.n.rig.roleKey,status:s.status,direction:s.direction,home:s.home?.feature?.name||null,homeId:s.home?.feature?.id||null,position:{x:s.n.pos.x,y:s.n.pos.y,z:s.n.pos.z},target:s.path?.at(-1)||null,next:s.path?.[s.index]||null,lastBlocked:s.lastBlocked||null,reason:s.reason,wait:s.wait,attempt:s.attempt,distance:s.distance,inside:!!s.n.nightInside}));const counts={};for(const s of residents)counts[s.status]=(counts[s.status]||0)+1;return{night,safetyZone:safetyZone?{...safetyZone}:null,inside:counts.inside||0,counts,total:residents.length,queued:queue.length,activePlanners:pool.filter(p=>p.busy).length,stats:{...stats},residents};}
 function addResident(n,options={}){if(!(life.npcs||[]).includes(n)&&!(life.activityActors||[]).includes(n))life.npcs.push(n);sync();const s=states.get(n);if(!s)return false;s.managedOnly=!!options.managedOnly;s.onReturn=options.onReturn;if(options.dayTarget){s.day=s.day||{};s.day.position=point(options.dayTarget);}return true;}
 function removeResident(n){const s=states.get(n);if(s)s.generation++;states.delete(n);}
 sync();return {setNight,setSafetyZone,update,handles:n=>!!n.zoneDead||states.has(n)&&(states.get(n).status!=='day'||states.get(n).managedOnly),getState,addResident,removeResident};
}
