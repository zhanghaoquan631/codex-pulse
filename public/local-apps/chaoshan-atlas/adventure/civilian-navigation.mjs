import {bodySpaceFree,groundRoute} from './combat-navigation.mjs';
import {groundHeight} from './landforms.mjs';
import {movePlayerHorizontal,stepPlayerVertical,supportBelow} from './traversal-physics.mjs';
import {buildingPoint} from './building-interiors.mjs';

export const actorHeight=(level,p)=>groundHeight(level,p.x,p.z)+(p.y||0);
export const planarDistance=(a,b)=>Math.hypot(a.x-b.x,a.z-b.z);
export function validStreetPoints(level,origin=level.spawn,radius=.4){
  const points=[];
  const offer=p=>{if(points.some(q=>planarDistance(q,p)<1.8)||!bodySpaceFree(level,p,radius,1.8))return;
    if(planarDistance(p,origin)>1&&!groundRoute(level,p,origin,radius))return;
    points.push({x:p.x,y:0,z:p.z});};
  offer(origin);
  for(const r of [4,8,13,20,30,45,65,90])for(let i=0;i<24;i++){const a=i*Math.PI/12;offer({x:origin.x+Math.cos(a)*r,z:origin.z+Math.sin(a)*r});}
  const roads=level.cartography?.roads||[],stride=Math.max(1,Math.ceil(roads.length/48));
  for(let i=0;i<roads.length;i+=stride){const road=roads[i].points||[];if(road.length)offer(road[Math.floor(road.length/2)]);}
  const b=level.bounds;
  for(let ix=1;ix<7;ix++)for(let iz=1;iz<7;iz++)offer({x:b.minX+(b.maxX-b.minX)*ix/7,z:b.minZ+(b.maxZ-b.minZ)*iz/7});
  for(const room of level.traversal?.rooms||[])offer(room.entry);
  return points;
}
function roomFor(level,p){return (level.traversal?.rooms||[]).find(r=>level.traversal.ramps.some(s=>s.roomId===r.id)&&Math.abs(actorHeight(level,p)-r.upperY)<1&&planarDistance(p,r)<Math.max(r.w,r.d));}
const relative=(level,p)=>({...p,y:p.y-groundHeight(level,p.x,p.z)});
function upperPath(level,room,up){
  const bridge=buildingPoint(room,-room.w/2+2.25,-room.d/2+.7,room.upperY);
  const points=[room.stairBottom,room.stairTop,bridge].map(p=>relative(level,p));
  return up?points:points.reverse();
}
function stairRoomFor(level,p){
  if(!p.grounded)return null;
  const y=actorHeight(level,p),support=supportBelow(level,p.x,p.z,y+.03,p.radius);
  if(support?.kind!=='ramp'||Math.abs(support.y-y)>.08)return null;
  const ramp=level.traversal.ramps.find(r=>r.id===support.id);
  return (level.traversal.rooms||[]).find(r=>r.id===ramp?.roomId)||null;
}
export function moveCivilian(level,p,target,speed,dt){
  if(!target||!p.alive)return 0;
  p.radius??=.34;p.height??=1.65;p.grounded??=true;p.vy??=0;p.y??=0;
  const fromRoom=roomFor(level,p),toRoom=roomFor(level,target),key=toRoom?.id||'ground';
  if(p._floorTarget!==key){
    const stairRoom=stairRoomFor(level,p),currentRoom=stairRoom||fromRoom;
    p._floorTarget=key;p._stairPath=[];
    // A changed destination can arrive halfway along a ramp. Continue from
    // that tread toward the appropriate landing instead of losing the route.
    if(currentRoom&&currentRoom!==toRoom)p._stairPath.push(...(stairRoom?[relative(level,currentRoom.stairBottom)]:upperPath(level,currentRoom,false)));
    if(toRoom&&currentRoom!==toRoom)p._stairPath.push(...upperPath(level,toRoom,true));
    else if(stairRoom&&stairRoom===toRoom)p._stairPath.push(...upperPath(level,toRoom,true).slice(1));
    p._navPoint=null;p._navTimer=0;
  }
  if(p._stairPath?.length&&!level.traversal?.ramps?.length)p._stairPath=[];
  while(p._stairPath?.length&&planarDistance(p,p._stairPath[0])<.28&&Math.abs(actorHeight(level,p)-actorHeight(level,p._stairPath[0]))<.4)p._stairPath.shift();
  const goal=p._stairPath?.[0]||target;
  const d=planarDistance(p,goal);if(d<.1){p.moving=false;stepPlayerVertical(level,p,dt);return 0;}
  p._navTimer=(p._navTimer||0)-dt;
  p._forceRoute=Math.max(0,(p._forceRoute||0)-dt);
  // Cache direction briefly, but test every real movement through shared body
  // collision/step physics. A changed structure cannot be crossed by a stale path.
  if(p._navTimer<=0||(p._navPoint&&planarDistance(p,p._navPoint)<.3)){
    p._navTimer=.45;
    const test={...p};let straight=!p._forceRoute;
    for(let n=1;straight&&n<=Math.ceil(d/.35);n++){const t=Math.min(1,n*.35/d),x=p.x+(goal.x-p.x)*t,z=p.z+(goal.z-p.z)*t;
      if(movePlayerHorizontal(level,test,x-test.x,z-test.z)<.01&&planarDistance(test,{x,z})>.08){straight=false;break;}}
    if(planarDistance(test,goal)>.08)straight=false;
    p._navPoint=straight?{...goal}:(Math.abs(p.y)<.4?groundRoute(level,p,goal,p.radius):null);
  }
  const next=p._navPoint;if(!next){p.moving=false;stepPlayerVertical(level,p,dt);return 0;}
  const length=planarDistance(p,next),step=Math.min(speed*dt,length),dx=(next.x-p.x)/(length||1),dz=(next.z-p.z)/(length||1);
  const moved=movePlayerHorizontal(level,p,dx*step,dz*step);stepPlayerVertical(level,p,dt);
  if(step>.001&&moved<step*.2&&p.y<.4&&!p._forceRoute){p._forceRoute=1.1;p._navTimer=0;}
  p.moving=moved>.0001;if(p.moving){p.facingX=dx;p.facingZ=dz;}
  return moved;
}
