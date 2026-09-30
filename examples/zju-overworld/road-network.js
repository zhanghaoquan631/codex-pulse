/**
 * Campus road routing, in projected metres. No browser or Three.js dependency.
 *
 * createRoadNetwork([{p:[[x,z],...],width,tags,id}], {
 *   bounds: [minX,minZ,maxX,maxZ],
 *   containsBlocked: (x,z,{bridge,synthetic,width,roadId}) => boolean
 * })
 *
 * Mapped bridges are retained: the blocker must exempt their deck from water
 * (the campus app's blocked(x,z) already does this). New connections are only
 * short joins between overlapping road surfaces, never arbitrary island links.
 */
export function createRoadNetwork(roads, options = {}) {
  const EPS = 1e-7, NODE_EPS = .025, CELL = 32;
  const nodes = [], edges = [], nodeBuckets = new Map(), cells = new Map();
  const raw = [], connectors = [];
  const blocked = typeof options.containsBlocked === 'function' ? options.containsBlocked : null;
  const bounds = Array.isArray(options.bounds) ? options.bounds : options.bounds ?
    [options.bounds.minX, options.bounds.minZ, options.bounds.maxX, options.bounds.maxZ] : null;
  let rejectedSegments = 0, intersectionCount = 0;
  const point = p => Array.isArray(p) ? {x:+p[0],z:+p[1]} : {x:+p?.x,z:+p?.z};
  const valid = p => Number.isFinite(p.x) && Number.isFinite(p.z);
  const distance = (a,b) => Math.hypot(a.x-b.x,a.z-b.z);
  const project = (p,a,b) => {
    const dx=b.x-a.x,dz=b.z-a.z,l2=dx*dx+dz*dz;
    const t=l2 ? Math.max(0,Math.min(1,((p.x-a.x)*dx+(p.z-a.z)*dz)/l2)) : 0;
    const x=a.x+dx*t,z=a.z+dz*t;
    return {x,z,t,distance:Math.hypot(p.x-x,p.z-z)};
  };
  const at = (s,t) => ({x:s.a.x+(s.b.x-s.a.x)*t,z:s.a.z+(s.b.z-s.a.z)*t});
  function directions(tags,width) {
    const hw=tags.highway, stairs=['steps','stairs','footsteps'].includes(hw);
    const unavailable=['construction','proposed','raceway'].includes(hw) || tags.bridge==='abandoned' || tags.area==='yes';
    const no=v=>['no','private'].includes(String(v));
    const accessNo=no(tags.access), vehicleNo=no(tags.vehicle);
    const car=width>=5 && !stairs && !unavailable && !['footway','path','cycleway','pedestrian'].includes(hw) &&
      !(accessNo && !tags.motor_vehicle && !tags.motorcar) && !vehicleNo && !no(tags.motor_vehicle) && !no(tags.motorcar);
    const cycle=!!hw && !stairs && !unavailable && !(accessNo && !tags.bicycle) &&
      !(vehicleNo && !['yes','designated','permissive'].includes(tags.bicycle)) && !no(tags.bicycle);
    const dir=v=>['yes','true','1'].includes(String(v))?1:String(v)==='-1'?-1:2;
    return {car:car?dir(tags.oneway):0,cycle:cycle?dir(tags['oneway:bicycle']??tags.oneway):0};
  }
  function clip(a,b) {
    if(!bounds || !bounds.every(Number.isFinite))return {a,b};
    let lo=0,hi=1; const dx=b.x-a.x,dz=b.z-a.z;
    for(const [p,q] of [[-dx,a.x-bounds[0]],[dx,bounds[2]-a.x],[-dz,a.z-bounds[1]],[dz,bounds[3]-a.z]]) {
      if(Math.abs(p)<EPS){if(q<0)return null;continue;}
      const r=q/p;
      if(p<0)lo=Math.max(lo,r);else hi=Math.min(hi,r);
      if(lo>hi)return null;
    }
    return {a:{x:a.x+dx*lo,z:a.z+dz*lo},b:{x:a.x+dx*hi,z:a.z+dz*hi}};
  }
  function clear(a,b,context) {
    if(!blocked)return true;
    const n=Math.max(1,Math.ceil(distance(a,b)/1.5));
    for(let i=0;i<=n;i++) {
      const t=i/n;
      if(blocked(a.x+(b.x-a.x)*t,a.z+(b.z-a.z)*t,context))return false;
    }
    return true;
  }
  function cellKeys(a,b,pad=0) {
    const out=[];
    for(let x=Math.floor((Math.min(a.x,b.x)-pad)/CELL);x<=Math.floor((Math.max(a.x,b.x)+pad)/CELL);x++)
      for(let z=Math.floor((Math.min(a.z,b.z)-pad)/CELL);z<=Math.floor((Math.max(a.z,b.z)+pad)/CELL);z++)out.push(`${x},${z}`);
    return out;
  }
  for(let ri=0;ri<(roads||[]).length;ri++) {
    const road=roads[ri],tags=road.tags||{},hw=tags.highway;
    const width=+road.width || parseFloat(tags.width) || (['footway','path','steps','cycleway'].includes(hw)?2.8:hw==='service'?5.5:8);
    const allow=directions(tags,width);
    if(!allow.car&&!allow.cycle)continue;
    const p=(road.p||[]).map(point),bridge=tags.bridge==='yes';
    for(let i=1;i<p.length;i++) {
      if(!valid(p[i-1])||!valid(p[i]))continue;
      const clipped=clip(p[i-1],p[i]);
      if(!clipped||distance(clipped.a,clipped.b)<.03)continue;
      const s={...clipped,width,bridge,roadId:road.id??ri,roadIndex:ri,car:allow.car,cycle:allow.cycle,
        layer:Number(tags.layer)||0,synthetic:false,cuts:[0,1],id:raw.length};
      // Source geometry is checked too: a map overlap is not a licence to drive
      // through a building. Splitting it would invent unrendered detours.
      if(!clear(s.a,s.b,s)){rejectedSegments++;continue;}
      raw.push(s);
      for(const key of cellKeys(s.a,s.b,3)) {
        if(!cells.has(key))cells.set(key,[]);
        cells.get(key).push(s.id);
      }
    }
  }
  const pairs=new Set();
  for(const ids of cells.values())for(let i=0;i<ids.length;i++)for(let j=i+1;j<ids.length;j++) {
    const ia=Math.min(ids[i],ids[j]),ib=Math.max(ids[i],ids[j]),key=ia+':'+ib;
    if(pairs.has(key))continue;pairs.add(key);
    const a=raw[ia],b=raw[ib],ax=a.b.x-a.a.x,az=a.b.z-a.a.z,bx=b.b.x-b.a.x,bz=b.b.z-b.a.z;
    const den=ax*bz-az*bx;
    if(Math.abs(den)>EPS) {
      const dx=b.a.x-a.a.x,dz=b.a.z-a.a.z,t=(dx*bz-dz*bx)/den,u=(dx*az-dz*ax)/den;
      if(t>=-EPS&&t<=1+EPS&&u>=-EPS&&u<=1+EPS) {
        const ends=t<EPS||t>1-EPS||u<EPS||u>1-EPS;
        // Do not turn geometric crossings into junctions between bridge decks
        // and roads below; mapped shared endpoints remain usable.
        if(a.layer===b.layer||ends) {
          a.cuts.push(Math.max(0,Math.min(1,t)));b.cuts.push(Math.max(0,Math.min(1,u)));intersectionCount++;
        }
      }
    }
    for(const [from,to] of [[a,b],[b,a]])for(const t of [0,1]) {
      const p=at(from,t),q=project(p,to.a,to.b);
      const maxGap=Math.min(3,(from.width+to.width)*.25);
      if(q.distance>maxGap)continue;
      if(from.layer!==to.layer && q.t>EPS && q.t<1-EPS)continue;
      if(q.distance<NODE_EPS){to.cuts.push(q.t);continue;}
      const car=from.car&&to.car?2:0,cycle=from.cycle&&to.cycle?2:0;
      if(!car&&!cycle)continue;
      const context={bridge:from.bridge&&to.bridge,width:Math.min(from.width,to.width),synthetic:true,
        roadId:`join:${from.roadId}:${to.roadId}`,car,cycle,layer:from.layer};
      // Every point remains in one of the two rendered road ribbons; no
      // speculative grass/water shortcuts are added to force connectivity.
      if(!clear(p,q,context))continue;
      to.cuts.push(q.t);
      connectors.push({...context,a:p,b:{x:q.x,z:q.z}});
    }
  }
  function nodeAt(p) {
    const cx=Math.floor(p.x/NODE_EPS),cz=Math.floor(p.z/NODE_EPS);
    for(let x=cx-1;x<=cx+1;x++)for(let z=cz-1;z<=cz+1;z++)for(const n of nodeBuckets.get(`${x},${z}`)||[])
      if(distance(n,p)<NODE_EPS)return n;
    const n={id:nodes.length,x:p.x,z:p.z,y:.16};nodes.push(n);
    const key=`${cx},${cz}`;
    if(!nodeBuckets.has(key))nodeBuckets.set(key,[]);nodeBuckets.get(key).push(n);return n;
  }
  const edgeKeys=new Set();
  function addEdge(a,b,s) {
    const na=nodeAt(a),nb=nodeAt(b),len=distance(na,nb);
    if(na===nb||len<.03)return;
    const key=[na.id,nb.id,s.car,s.cycle,s.width,s.bridge?1:0].join(':');
    if(edgeKeys.has(key))return;edgeKeys.add(key);
    if(s.bridge){na.y=1.08;nb.y=1.08;}
    edges.push({id:edges.length,a:na,b:nb,len,length:len,width:s.width,bridge:s.bridge,roadId:s.roadId,
      car:s.car,cycle:s.cycle,synthetic:s.synthetic});
  }
  for(const s of raw) {
    const cuts=s.cuts.sort((a,b)=>a-b).filter((t,i,a)=>!i||t-a[i-1]>EPS);
    for(let i=1;i<cuts.length;i++)addEdge(at(s,cuts[i-1]),at(s,cuts[i]),s);
  }
  for(const s of connectors)addEdge(s.a,s.b,s);
  // Keep the height change at bridge approaches local. Without these cuts a
  // long ground segment would interpolate upwards for hundreds of metres.
  const unsplit=edges.splice(0);edgeKeys.clear();
  for(const e of unsplit) {
    const cuts=[0,1];
    if(!e.bridge&&e.len>16) {
      if(e.a.y>1)cuts.push(8/e.len);
      if(e.b.y>1)cuts.push(1-8/e.len);
    }
    cuts.sort((a,b)=>a-b);
    for(let i=1;i<cuts.length;i++)addEdge(at(e,cuts[i-1]),at(e,cuts[i]),e);
  }
  const profiles={};
  for(const mode of ['car','cycle']) {
    const adjacency=nodes.map(()=>[]),weak=nodes.map(()=>[]),usable=edges.filter(e=>e[mode]);
    for(const e of usable) {
      if(e[mode]===1||e[mode]===2)adjacency[e.a.id].push({to:e.b.id,edge:e.id,len:e.len});
      if(e[mode]===-1||e[mode]===2)adjacency[e.b.id].push({to:e.a.id,edge:e.id,len:e.len});
      weak[e.a.id].push(e.b.id);weak[e.b.id].push(e.a.id);
    }
    const component=new Int32Array(nodes.length).fill(-1),components=[];
    for(let i=0;i<nodes.length;i++)if(weak[i].length&&component[i]<0) {
      const id=components.length,queue=[i];component[i]=id;
      const box=[Infinity,Infinity,-Infinity,-Infinity];
      for(let k=0;k<queue.length;k++) {
        const ni=queue[k],n=nodes[ni];box[0]=Math.min(box[0],n.x);box[1]=Math.min(box[1],n.z);box[2]=Math.max(box[2],n.x);box[3]=Math.max(box[3],n.z);
        for(const q of weak[ni])if(component[q]<0){component[q]=id;queue.push(q);}
      }
      components.push({id,nodes:queue.length,edges:0,length:0,bounds:box});
    }
    for(const e of usable){const c=components[component[e.a.id]];c.edges++;c.length+=e.len;}
    const sorted=components.slice().sort((a,b)=>b.length-a.length);
    profiles[mode]={adjacency,edges:usable,component,components:sorted};
  }
  function sample(e,t,p=null) {
    const q=at(e,t);
    return {...q,y:e.a.y+(e.b.y-e.a.y)*t,width:e.width,edgeId:e.id,t,
      ...(p?{distance:distance(q,p)}:{})};
  }
  function nearest(input,mode='car') {
    const p=point(input),profile=profiles[mode];
    if(!valid(p)||!profile)return null;
    let best=null;
    for(const e of profile.edges) {
      const q=project(p,e.a,e.b);
      if(!best||q.distance<best.distance)best={...sample(e,q.t,p),component:profile.component[e.a.id]};
    }
    return best;
  }
  class Heap {
    constructor(){this.a=[];}
    push(id,cost){const a=this.a;let i=a.length;a.push([id,cost]);while(i){const p=(i-1)>>1;if(a[p][1]<=cost)break;a[i]=a[p];i=p;}a[i]=[id,cost];}
    pop(){const a=this.a,root=a[0],last=a.pop();if(a.length){let i=0;while(i*2+1<a.length){let c=i*2+1;if(c+1<a.length&&a[c+1][1]<a[c][1])c++;if(a[c][1]>=last[1])break;a[i]=a[c];i=c;}a[i]=last;}return root;}
  }
  function route(inputStart,inputEnd,{mode='car'}={}) {
    const start=point(inputStart),end=point(inputEnd),profile=profiles[mode];
    const failure={path:[],length:0,destination:null,requestedDestination:end,reachedDistance:Infinity,startDistance:Infinity,status:'unreachable',mode};
    if(!valid(start)||!valid(end)||!profile)return failure;
    const origin=nearest(start,mode);if(!origin)return failure;
    const first=edges[origin.edgeId],dir=first[mode],costs=new Float64Array(nodes.length).fill(Infinity),
      previous=new Int32Array(nodes.length).fill(-1),via=new Int32Array(nodes.length).fill(-1),heap=new Heap();
    function seed(id,cost){if(cost<costs[id]){costs[id]=cost;heap.push(id,cost);}}
    if(dir===-1||dir===2||origin.t<EPS)seed(first.a.id,origin.t*first.len);
    if(dir===1||dir===2||origin.t>1-EPS)seed(first.b.id,(1-origin.t)*first.len);
    while(heap.a.length) {
      const [id,cost]=heap.pop();if(cost>costs[id])continue;
      for(const arc of profile.adjacency[id]) {
        const next=cost+arc.len;
        if(next+EPS<costs[arc.to]){costs[arc.to]=next;previous[arc.to]=id;via[arc.to]=arc.edge;heap.push(arc.to,next);}
      }
    }
    let chosen=null;
    for(const e of profile.edges) {
      let lo=1,hi=0;
      if(((e[mode]===1||e[mode]===2)&&Number.isFinite(costs[e.a.id]))||
         ((e[mode]===-1||e[mode]===2)&&Number.isFinite(costs[e.b.id]))){lo=0;hi=1;}
      if(Number.isFinite(costs[e.a.id]))lo=0;
      if(Number.isFinite(costs[e.b.id]))hi=1;
      if(e===first){
        lo=Math.min(lo,dir===-1||dir===2?0:origin.t);
        hi=Math.max(hi,dir===1||dir===2?1:origin.t);
      }
      if(lo>hi)continue;
      const projection=project(end,e.a,e.b),qt=Math.max(lo,Math.min(hi,projection.t)),qp=at(e,qt);
      const q={...qp,t:qt,distance:distance(end,qp)};let cost=Infinity,entry=-1;
      const tryEntry=(id,extra)=>{const c=costs[id]+extra;if(c<cost){cost=c;entry=id;}};
      if(e[mode]===1||e[mode]===2||q.t<EPS)tryEntry(e.a.id,q.t*e.len);
      if(e[mode]===-1||e[mode]===2||q.t>1-EPS)tryEntry(e.b.id,(1-q.t)*e.len);
      if(e===first&&((q.t>=origin.t&&(dir===1||dir===2))||(q.t<=origin.t&&(dir===-1||dir===2)))) {
        const direct=Math.abs(q.t-origin.t)*e.len;if(direct<=cost){cost=direct;entry=-2;}
      }
      if(!Number.isFinite(cost))continue;
      if(!chosen||q.distance<chosen.q.distance-EPS||(Math.abs(q.distance-chosen.q.distance)<EPS&&cost<chosen.cost))chosen={e,q,cost,entry};
    }
    if(!chosen)return {...failure,startDistance:origin.distance};
    const path=[],push=(p,e)=>{
      const last=path[path.length-1];
      if(last&&distance(last,p)<.02){last.width=e.width;last.edgeId=e.id;last.y=Math.max(last.y,p.y??.16);return;}
      path.push({x:p.x,z:p.z,y:p.y??.16,width:e.width,edgeId:e.id});
    };
    push(origin,first);
    if(chosen.entry>=0) {
      const chain=[];for(let id=chosen.entry;id>=0;id=previous[id])chain.push(id);chain.reverse();
      for(let i=0;i<chain.length;i++) {
        const nextEdge=i+1<chain.length?edges[via[chain[i+1]]]:chosen.e;
        push(nodes[chain[i]],nextEdge);
      }
    }
    const destination={...sample(chosen.e,chosen.q.t,end),component:profile.component[chosen.e.a.id]};
    push(destination,chosen.e);
    let length=0;for(let i=1;i<path.length;i++)length+=distance(path[i-1],path[i]);
    return {path,length,destination,requestedDestination:end,reachedDistance:destination.distance,
      startDistance:origin.distance,status:destination.distance<=2?'ok':'nearest-reachable',mode};
  }
  function randomRoute(start,{mode='car',seed=1,distance:targetDistance=400}={}) {
    const snap=nearest(start,mode),profile=profiles[mode];
    if(!snap||!profile)return route(start,start,{mode});
    let state=(Number(seed)||1)>>>0;const rand=()=>{state=(Math.imul(state,1664525)+1013904223)>>>0;return state/4294967296;};
    const candidates=profile.edges.filter(e=>profile.component[e.a.id]===snap.component);
    let best=null,score=Infinity;
    for(let i=0;i<Math.min(12,candidates.length);i++) {
      const e=candidates[Math.floor(rand()*candidates.length)],q=sample(e,rand()),r=route(start,q,{mode});
      if(!r.path.length)continue;
      const s=Math.abs(r.length-targetDistance);if(s<score){best=r;score=s;}
    }
    return best||route(start,start,{mode});
  }
  const stats={sourceRoads:(roads||[]).length,sourceSegments:raw.length,rejectedSegments,nodes:nodes.length,
    edges:edges.length,intersections:intersectionCount,shortJoins:edges.filter(e=>e.synthetic).length,
    car:{edges:profiles.car.edges.length,components:profiles.car.components},
    cycle:{edges:profiles.cycle.edges.length,components:profiles.cycle.components}};
  return {nearest,route,randomRoute,nodes,edges,stats};
}
