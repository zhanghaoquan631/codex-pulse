import {bodySpaceFree,groundRoute} from './combat-navigation.mjs';
import {groundHeight} from './landforms.mjs';
import {supportBelow} from './traversal-physics.mjs';
import {boxLocalPoint} from './camera-math.mjs';
import {guangjiLayout} from './guangji-scene.mjs';
import {jieyangLayout} from './jieyang-scene.mjs';
import {nanaoLayout} from './nanao-scene.mjs';
import {smallParkLayout} from './small-park-scene.mjs';

const distance=(a,b)=>Math.hypot(a.x-b.x,a.z-b.z);
const point=(a,b,t)=>({x:a.x+(b.x-a.x)*t,z:a.z+(b.z-a.z)*t});
const sourceLayouts={'small-park':smallParkLayout,guangji:guangjiLayout,'jieyang-tower':jieyangLayout,lighthouse:nanaoLayout};
function sourceRoads(level){
 const layout=sourceLayouts[level.id];
 const roads=layout?.roads||level.cartography?.roads||[];
 const result=roads.map(r=>({...r,sourceId:r.osmWayId||r.id,sourceKind:r.fictional===true||(!layout&&!r.osmWayId&&r.source!=='OSM')?'game-connector':'mapped-road'}));
 if(level.id==='guangji')for(const section of guangjiLayout.bridgeSections)result.push({...section,width:guangjiLayout.deckWidth,sourceId:section.id,sourceKind:'mapped-road',name:'广济桥 · 桥面'});
 return result;
}

/** Author a small ordered journey along the existing mapped street graph.
 * Pass a normalized runtime level (walls/doors have absolute baseY). This is
 * pure: no random draw, save change, spawning, door opening or DOM access.
 * Hints are optional desired neighbourhoods, not trusted free coordinates.
 * Returned points are ground-level absolute Y, with source provenance. Existing
 * authored connecting paths stay explicitly game-connector, never called OSM.
 */
export function resolveJourneySites(level,count=3,hints=[]){
 count=Math.max(0,Math.min(12,Math.floor(Number(count)||0)));if(!count)return [];
 if(!level?.spawn||!level?.bounds)return [];
 const gate=level.doors?.find(d=>d.id===level.hunt?.gateId);
 // Reopening an already-completed chapter must never move a mission into its
 // password room. Work on a detached closed-gate view in that case only.
 const nav=gate?.open?{...level,doors:level.doors.map(d=>d===gate?{...d,open:false}:d)}:level;
 const rooms=level.traversal?.rooms||[],reserved=[
  ...(level.collectibles||[]).filter(c=>!c.collected).map(p=>({...p,clearance:2.4})),
  ...(level.npcs||[]).filter(p=>p.alive!==false).map(p=>({...p,clearance:2.8})),
  ...(level.survivors||[]).filter(p=>p.alive!==false).map(p=>({...p,clearance:2.8})),
  ...(level.evacuation?.people||[]).filter(p=>p.alive&&!p.insideVehicleId).map(p=>({...p,clearance:1.6})),
  ...(level.evacuation?.vehicles||[]).filter(p=>p.alive).map(p=>({...p,clearance:3})),
  ...(level.doors||[]).map(p=>({...p,clearance:4})),
  ...(level.evacuation?.safeZone?[{...level.evacuation.safeZone,clearance:4.5}]:[]),
  {...level.spawn,clearance:6},...(level.hunt?.target?[{...level.hunt.target,clearance:9}]:[]),
 ];
 const candidates=[],seen=new Set();
 function offer(p,source,label){
  if(!Number.isFinite(p?.x)||!Number.isFinite(p?.z))return;
  const key=`${Math.round(p.x*2)}:${Math.round(p.z*2)}`;if(seen.has(key))return;seen.add(key);
  const b=level.bounds;if(p.x<b.minX+1.5||p.x>b.maxX-1.5||p.z<b.minZ+1.5||p.z>b.maxZ-1.5)return;
  const y=groundHeight(level,p.x,p.z);
  if(reserved.some(q=>Math.abs((q.absoluteY?q.y:groundHeight(level,q.x,q.z)+(q.y||0))-y)<2&&distance(p,q)<q.clearance))return;
  if(rooms.some(room=>{const q=boxLocalPoint(p,room);return Math.abs(q.x)<room.w/2+1.5&&Math.abs(q.z)<room.d/2+1.5;}))return;
  candidates.push({x:p.x,z:p.z,y,absoluteY:true,label:label||'沿路任务点',source});
 }
 // Rank cheap geometric candidates first. A dense mapped district may have
 // thousands of source vertices, but only the nearest valid few matter.
 // This local validation cache never outlives this exact door/NPC state.
 const validity=new Map();
 function valid(p){
  if(validity.has(p))return validity.get(p);
  validity.set(p,false);
  const y=p.y;
  if(!bodySpaceFree(nav,{...p,absoluteY:y},.7,1.9))return false;
  const support=supportBelow(nav,p.x,p.z,y+.03,.45);if(!support||Math.abs(support.y-y)>.04)return false;
  // A player has room on all sides to approach the visible marker; this
  // excludes wall slivers and preserves narrow corridors for travelling NPCs.
  if(![[.55,0],[-.55,0],[0,.55],[0,-.55]].every(([dx,dz])=>bodySpaceFree(nav,{x:p.x+dx,z:p.z+dz,absoluteY:groundHeight(level,p.x+dx,p.z+dz)},.38,1.7)))return false;
  const route=groundRoute(nav,p,level.spawn,.38);if(!route||route.distance<6)return false;
  p.routeDistance=route.distance;validity.set(p,true);return true;
 }
 for(const road of sourceRoads(level)){
  const segments=road.segments||road.points?.slice(1).map((b,i)=>({a:road.points[i],b}))||[];
  for(const segment of segments){
   const [a,b]=Array.isArray(segment)?segment:[segment.a,segment.b],length=distance(a,b),n=Math.max(1,Math.ceil(length/5));
   for(let j=0;j<=n;j++)offer(point(a,b,j/n),{kind:road.sourceKind,id:road.sourceId},road.name||'地图步道');
  }
 }
 // Legacy first chapters have no common cartography object. Their authored
 // markers are a final fallback, still checked against the same closed graph.
 if(candidates.length<count)for(const p of level.collectibles||[])if(level.hunt?.clueIds?.includes(p.id)){
  for(const [dx,dz]of [[3.2,0],[-3.2,0],[0,3.2],[0,-3.2]])offer({x:p.x+dx,z:p.z+dz},{kind:'clue-approach',id:p.id},'线索附近道路');
 }
 candidates.sort((a,b)=>distance(a,level.spawn)-distance(b,level.spawn)||a.x-b.x||a.z-b.z);
 if(!candidates.length)return [];
 const selected=[],max=distance(candidates.at(-1),level.spawn);
 for(let i=0;i<count;i++){
  const desired=max*(i+1)/(count+1),hint=hints[i];let winner=null;
  for(const spacing of [12,8,5]){
   const eligible=candidates.filter(p=>!selected.includes(p)&&selected.every(q=>distance(p,q)>=spacing));
   if(!eligible.length)continue;
   const hasHint=hint&&Number.isFinite(hint.x)&&Number.isFinite(hint.z);
   // An authored circuit may return to a nearer bank. Hints determine its
   // sequence; unhinted callers use approximate distance bands, then verify.
   const cost=q=>hasHint?distance(q,hint):Math.abs(distance(q,level.spawn)-desired);
   eligible.sort((a,b)=>cost(a)-cost(b)||a.x-b.x||a.z-b.z);
   winner=eligible.find(valid)||null;if(winner)break;
  }
  if(!winner)break;selected.push(winner);
 }
 return selected.map((p,i)=>({...p,...(hints[i]?.label?{label:hints[i].label}:{})}));
}
