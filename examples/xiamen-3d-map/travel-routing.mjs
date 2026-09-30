import createGraph from 'ngraph.graph';
import {aStar} from 'ngraph.path';
import {distanceMeters,inGeoBounds} from './geo-utils.mjs';
import {travelPlaces,ferryOptions} from './travel-data.mjs';
import {buildDirections,projectToSegment} from './walking-guidance.mjs';

export function createTravelRouter(data){
 const lookup=new Map(data.nodes.map(([id,lon,lat])=>[id,[lon,lat]])),edges=new Map();
 const key=(a,b)=>a<b?`${a}|${b}`:`${b}|${a}`;
 for(const way of data.ways){
  if(['no','private'].includes(way.foot)||['no','private'].includes(way.access)&&way.foot!=='yes')continue;
  for(let i=1;i<way.nodes.length;i++){
   const a=way.nodes[i-1],b=way.nodes[i],la=lookup.get(a),lb=lookup.get(b);if(!la||!lb||a===b)continue;
   const k=key(a,b),old=edges.get(k);
   // Overlapping tile layers must not erase a known staircase.
   if(!old||way.kind==='steps'||!old.name&&way.name&&old.kind!=='steps')edges.set(k,{a,b,la,lb,name:way.name||'',kind:way.kind,meters:distanceMeters(la,lb),surface:way.surface||null});
  }
 }
 const segments=[...edges.values()];
 function network(avoidSteps){
  const graph=createGraph();
  for(const s of segments){if(avoidSteps&&s.kind==='steps')continue;graph.addNode(s.a,{ll:s.la});graph.addNode(s.b,{ll:s.lb});graph.addLink(s.a,s.b,s);}
  return aStar(graph,{distance:(_a,_b,link)=>link.data.meters,heuristic:(a,b)=>distanceMeters(a.data.ll,b.data.ll)});
 }
 const finders=[network(false),network(true)];
 const nearest=ll=>segments.map(s=>({...s,...projectToSegment(ll,s.la,s.lb)})).sort((a,b)=>a.distance-b.distance).slice(0,6);
 function walk(from,to,{avoidSteps=false}={}){
  if(!inGeoBounds(from,data.bbox)||!inGeoBounds(to,data.bbox))return {error:'目前步行路网只覆盖鼓浪屿、中山路和东渡一带。'};
  const nearStart=nearest(from),nearEnd=nearest(to);
  if(avoidSteps&&[nearStart,nearEnd].some(list=>list[0]?.kind==='steps'&&list[0].distance<12&&!list.some(s=>s.kind!=='steps'&&s.distance<=list[0].distance+3)))return {error:'起点或终点位于已标注楼梯附近，不能保证避开这段楼梯。请换到可步行道路上的起终点。'};
  // A remote parallel street must not become a shortcut through a wall or garden.
  const candidates=list=>list.filter(n=>n.distance<80&&n.distance<=list[0].distance+8&&(!avoidSteps||n.kind!=='steps'));
  let best=null;
  const add=(out,a,b,meta)=>{const meters=distanceMeters(a,b);if(meters>.02)out.push({from:a,to:b,meters,name:meta.name,kind:meta.kind,surface:meta.surface});};
  for(const a of candidates(nearStart))for(const b of candidates(nearEnd)){
   for(const ai of [a.a,a.b])for(const bi of [b.a,b.b]){
    const path=finders[Number(avoidSteps)].find(ai,bi).reverse();if(!path.length)continue;
    const route=[];
    if(key(a.a,a.b)===key(b.a,b.b))add(route,a.point,b.point,a);
    else{
     add(route,a.point,path[0].data.ll,a);
     for(let i=1;i<path.length;i++)add(route,path[i-1].data.ll,path[i].data.ll,edges.get(key(path[i-1].id,path[i].id)));
     add(route,path.at(-1).data.ll,b.point,b);
    }
    const meters=route.reduce((s,e)=>s+e.meters,0),cost=meters+(a.distance+b.distance)*3;
    if(!best||cost<best.cost)best={segments:route,meters,cost,snap:Math.max(a.distance,b.distance),startSnap:a.distance,endSnap:b.distance,start:a.point,end:b.point};
   }
  }
  if(!best)return {error:avoidSteps?'未找到能避开已标注楼梯的连续路线。这不代表现场没有其他通道。':'这两个点之间暂时没有可信的连续步行路网，请核对现场道路。'};
  if(best.meters>distanceMeters(from,to)*3+500)return {error:'当前路网产生了异常绕行，已停止显示这一段；请核对现场通行路线。'};
  const directions=buildDirections(best.segments);
  return {kind:'walk',points:best.segments.length?[best.segments[0].from,...best.segments.map(s=>s.to)]:[best.start,best.end],segments:best.segments,directions,meters:best.meters,snap:best.snap,startSnap:best.startSnap,endSnap:best.endSnap,stairsMeters:best.segments.filter(s=>s.kind==='steps').reduce((n,s)=>n+s.meters,0),stairsSections:directions.filter(s=>s.kind==='steps').length,avoidSteps};
 }
 const point=id=>travelPlaces.find(p=>p.id===id);
 function plan(from,to,{ferry='day',fromIsland=false,toIsland=false,avoidSteps=false}={}){
  if(fromIsland===toIsland){const leg=walk(from,to,{avoidSteps});return leg.error?{error:leg.error}:{legs:[leg],meters:leg.meters};}
  const option=ferryOptions[ferry],a=point(fromIsland?option.to:option.from),b=point(fromIsland?option.from:option.to);
  const first=walk(from,a.ll,{avoidSteps}),last=walk(b.ll,to,{avoidSteps});
  const waterPoints=fromIsland?[b.ll,...option.via,a.ll].reverse():[a.ll,...option.via,b.ll];
  const water={kind:'ferry',name:option.name,points:waterPoints,note:option.note};
  const legs=[first,water,last];return {legs,meters:legs.reduce((sum,l)=>sum+(l.meters||0),0),ferry:option.name,incomplete:!!(first.error||last.error)};
 }
 return {walk,plan,nearest:ll=>nearest(ll)[0],bbox:data.bbox,nodeCount:new Set(segments.flatMap(s=>[s.a,s.b])).size,segments,snapshot:data.snapshot};
}
