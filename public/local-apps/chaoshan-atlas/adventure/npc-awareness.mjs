import {actorHeight,planarDistance,moveCivilian} from './civilian-navigation.mjs';
import {segmentBoxDistance} from './camera-math.mjs';
import {groundHeight,segmentGroundDistance} from './landforms.mjs';
import {bodySpaceFree,groundRoute} from './combat-navigation.mjs';
export const pickPoint=(points,random=Math.random)=>points[Math.min(points.length-1,Math.floor(Math.max(0,random())*points.length))];
export function seesPlayer(level,n,p){
 if(!p||!n.alive)return false;
 const dx=p.x-n.x,dz=p.z-n.z,d=planarDistance(n,p),dy=actorHeight(level,p)-actorHeight(level,n);
 if(d>18||Math.abs(dy)>3)return false;
 if(d>3.2&&(dx*(n.facingX||0)+dz*(n.facingZ??1))/(d||1)<.2)return false;
 const from={x:n.x,y:actorHeight(level,n)+1.3,z:n.z},to={x:p.x,y:actorHeight(level,p)+1.2,z:p.z};
 const len=Math.hypot(dx,to.y-from.y,dz);if(len<.05)return true;
 const dir={x:dx/len,y:(to.y-from.y)/len,z:dz/len};
 if([...level.walls,...level.doors.filter(d=>!d.open)].some(w=>segmentBoxDistance(from,dir,w,len-.04)!==null))return false;
 return segmentGroundDistance(level,from,dir,len-.04)===null;
}
export function wanderActor(level,n,points,dt,speed=2.6){
 n.wanderClock=(n.wanderClock||0)-dt;
 if(!n.wanderTarget||n.wanderClock<=0||planarDistance(n,n.wanderTarget)<.6){
  const nearby=points.filter(q=>planarDistance(n,q)>2&&planarDistance(n,q)<22);
  n.wanderSeed=((n.wanderSeed||1)*1664525+1013904223)>>>0;
  n.wanderTarget=pickPoint(nearby.length?nearby:points,()=>n.wanderSeed/4294967296)||n;n.wanderClock=5;
 }
 const moved=moveCivilian(level,n,n.wanderTarget,speed,dt);n.sprinting=n.moving&&speed>3;
 return moved;
}
export function followActor(level,n,p,dt,index=0){
 const d=planarDistance(n,p),running=!!p.sprinting||d>5;
 const length=Math.hypot(p.facingX||0,p.facingZ??-1)||1,fx=(p.facingX||0)/length,fz=(p.facingZ??-1)/length;
 // Two staggered columns behind the traveller leave the line of fire clear.
 const slot=index===16?0:index===17?1:index+2,back=2.1+Math.floor(slot/2)*.65,side=(slot%2?1:-1)*(index===16?1.5:2.3+(slot%3)*.2);
 let target={x:p.x-fx*back-fz*side,z:p.z-fz*back+fx*side,y:p.y||0};
 const tx=target.x-n.x,tz=target.z-n.z,t=Math.max(0,Math.min(1,((p.x-n.x)*tx+(p.z-n.z)*tz)/(tx*tx+tz*tz||1)));
 if(d<8&&Math.hypot(n.x+tx*t-p.x,n.z+tz*t-p.z)<1.35){
  const front=Math.max(0,(n.x-p.x)*fx+(n.z-p.z)*fz);
  target={x:p.x-fz*Math.sign(side)*2.3+fx*front,z:p.z+fx*Math.sign(side)*2.3+fz*front,y:p.y||0};
 }
 const valid=bodySpaceFree(level,target,n.radius||.34,1.7);if(!valid)target=p;
 if(planarDistance(n,target)<(valid?.65:2.1)&&Math.abs(actorHeight(level,n)-actorHeight(level,p))<.4){moveCivilian(level,n,n,0,dt);n.sprinting=false;return;}
 moveCivilian(level,n,target,running?7.6:4.5,dt);n.sprinting=running&&n.moving;
}
export function initializeWanderingSurvivors(level,random=Math.random){
 const occupied=[...level.npcs.filter(n=>n.alive),...(level.evacuation?.people||[]).filter(p=>!p.insideVehicleId),...(level.evacuation?.vehicles||[])];
 for(const n of level.survivors||[]){
  const candidates=[];
  for(const room of level.traversal?.rooms||[]){
   if(room.collapsed||!groundRoute(level,room.entry,level.spawn,.34))continue;
   const c=Math.cos(room.rotation||0),s=Math.sin(room.rotation||0);
   for(let u=-room.w/2+.8;u<room.w/2-.6;u+=1.25)for(let v=-room.d/2+.8;v<room.d/2-.6;v+=1.25){
    const q={x:room.x+c*u+s*v,z:room.z-s*u+c*v,y:0,roomId:room.id};
    if(bodySpaceFree(level,q,.36,1.7)&&groundRoute(level,q,room.entry,.34)&&occupied.every(p=>planarDistance(q,p)>1.2))candidates.push(q);
   }
  }
  const q=pickPoint(candidates,random);
  if(q){Object.assign(n,q);n.structureId=level.structures.find(s=>s.roomId===q.roomId)?.id||n.structureId;}
  n.y=groundHeight(level,n.x,n.z);n.radius=.34;n.height=1.65;n.grounded=true;n.vy=0;n.facingX=0;n.facingZ=1;n.following=false;n.wanderSeed=1+Math.floor(random()*1e8);
  n.roamPoints=candidates.filter(p=>p.roomId===n.roomId);occupied.push(n);
 }
}
export function stepWanderingSurvivors(level,p,dt){
 const events=[];
 for(const n of level.survivors||[]){
  if(!n.alive)continue;
  // Survivor records retain their original absolute Y convention.
  const at={...n,y:n.y-groundHeight(level,n.x,n.z)};
  if(!n.following&&seesPlayer(level,at,p)){n.following=at.following=true;n.accompanying=true;events.push({type:'notice',text:'旅人看见了你，正在跟随。带他离开这栋房屋。'});}
  if(n.following)followActor(level,at,p,dt,17);else wanderActor(level,at,n.roamPoints||[],dt,level.elapsed<10?2.1:3.4);
  Object.assign(n,at,{y:actorHeight(level,at)});
  if(n.following&&!n.rescued){const room=level.traversal?.rooms?.find(r=>r.id===n.roomId);if(room){const c=Math.cos(room.rotation||0),s=Math.sin(room.rotation||0),dx=n.x-room.x,dz=n.z-room.z;if(Math.abs(c*dx-s*dz)>room.w/2+.4||Math.abs(s*dx+c*dz)>room.d/2+.4){n.rescued=true;events.push({type:'survivor-rescued',text:'旅人已离开危险房屋，屋内救援完成。',survivorId:n.id,structureId:n.structureId});}}}
 }
 return events;
}
