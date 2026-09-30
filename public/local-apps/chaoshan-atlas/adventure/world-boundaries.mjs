import {groundHeight} from './landforms.mjs';
import {inPolygon,clipPolygon} from './map-geometry.mjs';
import {boxLocalPoint} from './camera-math.mjs';

const worldPoint=(r,x,z)=>({x:r.x+Math.cos(r.rotation||0)*x+Math.sin(r.rotation||0)*z,z:r.z-Math.sin(r.rotation||0)*x+Math.cos(r.rotation||0)*z});
const EPS=1e-7;
const cross=(a,b)=>a.x*b.z-a.z*b.x;
const mix=(a,b,t)=>({x:a.x+(b.x-a.x)*t,z:a.z+(b.z-a.z)*t});
const extents=points=>({minX:Math.min(...points.map(p=>p.x)),maxX:Math.max(...points.map(p=>p.x)),minZ:Math.min(...points.map(p=>p.z)),maxZ:Math.max(...points.map(p=>p.z))});

// Index original edges/polygons, not raster samples. Large maps contain over a
// thousand joined navigation rectangles; testing every pair is unnecessary.
function spatialIndex(items,size=12){
  const cells=new Map();
  const visit=(b,fn)=>{for(let x=Math.floor((b.minX-EPS)/size);x<=Math.floor((b.maxX+EPS)/size);x++)for(let z=Math.floor((b.minZ-EPS)/size);z<=Math.floor((b.maxZ+EPS)/size);z++)fn(`${x}:${z}`);};
  items.forEach((item,i)=>visit(item.bounds,key=>{if(!cells.has(key))cells.set(key,[]);cells.get(key).push(i);}));
  return b=>{
    const found=new Set();visit(b,key=>{for(const i of cells.get(key)||[])found.add(i);});
    return [...found].map(i=>items[i]).filter(item=>item.bounds.minX<=b.maxX+EPS&&item.bounds.maxX>=b.minX-EPS&&item.bounds.minZ<=b.maxZ+EPS&&item.bounds.maxZ>=b.minZ-EPS);
  };
}
function polygonIndex(polygons){
  const items=polygons.filter(p=>p.length>=3).map(points=>({points,bounds:extents(points)})),nearby=spatialIndex(items);
  return {items,contains:p=>nearby({minX:p.x,maxX:p.x,minZ:p.z,maxZ:p.z}).some(o=>inPolygon(p.x,p.z,o.points))};
}
function splitParameters(edge,other){
  const r={x:edge.b.x-edge.a.x,z:edge.b.z-edge.a.z},s={x:other.b.x-other.a.x,z:other.b.z-other.a.z},v={x:other.a.x-edge.a.x,z:other.a.z-edge.a.z};
  const den=cross(r,s),rr=r.x*r.x+r.z*r.z;
  if(Math.abs(den)<EPS*Math.sqrt(rr*(s.x*s.x+s.z*s.z))){
    if(Math.abs(cross(v,r))>EPS*Math.sqrt(rr))return [];
    return [(v.x*r.x+v.z*r.z)/rr,((other.b.x-edge.a.x)*r.x+(other.b.z-edge.a.z)*r.z)/rr].filter(t=>t>EPS&&t<1-EPS);
  }
  const t=cross(v,s)/den,u=cross(v,r)/den;
  return t>EPS&&t<1-EPS&&u>=-EPS&&u<=1+EPS?[t]:[];
}
const pointKey=p=>`${Math.round(p.x*1e7)},${Math.round(p.z*1e7)}`;

/** Exact input-edge union boundary. Outside normals point out of the union.
 * Intersections and partial shared edges are split before classifying both
 * sides, so a long source edge cannot fence across an overlapping doorway.
 */
export function unionBoundarySegments(polygons,bounds){
  const clipped=polygons.map(p=>bounds?clipPolygon(p,bounds):p).filter(p=>p.length>=3),union=polygonIndex(clipped),unique=new Map();
  for(const {points}of union.items)for(let i=0;i<points.length;i++){
    const a=points[i],b=points[(i+1)%points.length];if(Math.hypot(b.x-a.x,b.z-a.z)<EPS)continue;
    const ka=pointKey(a),kb=pointKey(b),key=ka<kb?`${ka}|${kb}`:`${kb}|${ka}`;
    if(!unique.has(key))unique.set(key,{a,b,bounds:extents([a,b])});
  }
  const edges=[...unique.values()],nearby=spatialIndex(edges),lines=new Map();
  for(const edge of edges){
    const values=[0,1];for(const other of nearby(edge.bounds))if(other!==edge)values.push(...splitParameters(edge,other));
    values.sort((a,b)=>a-b);const stops=values.filter((t,i)=>!i||t-values[i-1]>EPS);
    for(let i=1;i<stops.length;i++){
      let a=mix(edge.a,edge.b,stops[i-1]),b=mix(edge.a,edge.b,stops[i]),length=Math.hypot(b.x-a.x,b.z-a.z);if(length<1e-5)continue;
      let dx=(b.x-a.x)/length,dz=(b.z-a.z)/length;
      if(dx<-EPS||(Math.abs(dx)<=EPS&&dz<0)){[a,b]=[b,a];dx=-dx;dz=-dz;}
      const middle=mix(a,b,.5),epsilon=Math.min(.001,length*.01),nx=-dz,nz=dx;
      const left=union.contains({x:middle.x+nx*epsilon,z:middle.z+nz*epsilon}),right=union.contains({x:middle.x-nx*epsilon,z:middle.z-nz*epsilon});
      if(left===right)continue;
      const sign=left?-1:1,outside={x:nx*sign,z:nz*sign},c=-dz*a.x+dx*a.z;
      const key=[Math.round(dx*1e6),Math.round(dz*1e6),Math.round(c*1e5),sign].join(':');
      const group=lines.get(key)||{dx,dz,c,outside,intervals:[]};group.intervals.push([a.x*dx+a.z*dz,b.x*dx+b.z*dz]);lines.set(key,group);
    }
  }
  const result=[];
  for(const {dx,dz,c,outside,intervals}of lines.values()){
    intervals.sort((a,b)=>a[0]-b[0]);const merged=[];
    for(const interval of intervals){const last=merged.at(-1);if(last&&interval[0]<=last[1]+1e-5)last[1]=Math.max(last[1],interval[1]);else merged.push([...interval]);}
    for(const [a,b]of merged)result.push({a:{x:dx*a-dz*c,z:dz*a+dx*c},b:{x:dx*b-dz*c,z:dz*b+dx*c},outside});
  }
  return result;
}

// Preserve connected contour order before simplifying raster-shaped shores.
// At point-touching branches we stop the chain rather than bridge two paths.
function boundaryChains(edges){
  const key=p=>`${Math.round(p.x*1e4)}:${Math.round(p.z*1e4)}`;
  const nodes=edges.map(e=>{let {a,b}=e;if((b.z-a.z)*e.outside.x-(b.x-a.x)*e.outside.z<0)[a,b]=[b,a];return{a,b};});
  const starts=new Map(),used=new Set(),chains=[];
  for(const e of nodes){const k=key(e.a);if(!starts.has(k))starts.set(k,[]);starts.get(k).push(e);}
  for(const start of nodes){
    if(used.has(start))continue;const points=[start.a];let edge=start;
    while(edge&&!used.has(edge)){
      used.add(edge);points.push(edge.b);
      const next=(starts.get(key(edge.b))||[]).filter(e=>!used.has(e));edge=next.length===1?next[0]:null;
    }
    chains.push(points);
  }
  return chains;
}
function curveDeviation(points){
  const a=points[0],b=points.at(-1),dx=b.x-a.x,dz=b.z-a.z,length2=dx*dx+dz*dz;
  let distance=0,index=Math.floor(points.length/2);
  for(let i=1;i<points.length-1;i++){
    const p=points[i],t=length2?Math.max(0,Math.min(1,((p.x-a.x)*dx+(p.z-a.z)*dz)/length2)):0;
    const d=Math.hypot(p.x-a.x-t*dx,p.z-a.z-t*dz);if(d>distance){distance=d;index=i;}
  }
  return {distance,index};
}

/** Visual shoreline only. Original movement occupancy remains authoritative.
 * A simplified line is accepted only if its whole width fits on the unavailable
 * side; unsafe corners split again. This avoids both grid fences and pinching.
 */
function shoreSegments(polygons,bounds,water=false){
  const union=polygonIndex(polygons),outline=unionBoundarySegments(polygons,bounds),result=[];
  const nearby=spatialIndex(outline.map(e=>({...e,bounds:extents([e.a,e.b])})));
  function boundaryCrossesStrip(a,b,offset,normal,half,trim){
    const length=Math.hypot(b.x-a.x,b.z-a.z),dx=(b.x-a.x)/length,dz=(b.z-a.z)/length;
    const center={x:(a.x+b.x)/2+normal.x*offset,z:(a.z+b.z)/2+normal.z*offset},along=length/2-trim;
    const corners=[];for(const u of[-along,along])for(const v of[-half,half])corners.push({x:center.x+dx*u+normal.x*v,z:center.z+dz*u+normal.z*v});
    return nearby(extents(corners)).some(edge=>{
      const p={x:(edge.a.x-center.x)*dx+(edge.a.z-center.z)*dz,z:(edge.a.x-center.x)*normal.x+(edge.a.z-center.z)*normal.z};
      const q={x:(edge.b.x-center.x)*dx+(edge.b.z-center.z)*dz,z:(edge.b.x-center.x)*normal.x+(edge.b.z-center.z)*normal.z};
      let lo=0,hi=1;
      for(const [start,delta,radius]of[[p.x,q.x-p.x,along-EPS],[p.z,q.z-p.z,half-EPS]]){
        if(Math.abs(delta)<EPS){if(Math.abs(start)>=radius)return false;}
        else{let a=(-radius-start)/delta,b=(radius-start)/delta;if(a>b)[a,b]=[b,a];lo=Math.max(lo,a);hi=Math.min(hi,b);if(lo>hi)return false;}
      }
      return hi>=0&&lo<=1;
    });
  }
  function fit(a,b,thin=false){
    const length=Math.hypot(b.x-a.x,b.z-a.z);if(length<.08)return null;
    const dx=(b.x-a.x)/length,dz=(b.z-a.z)/length,sign=water?-1:1,outside={x:dz*sign,z:-dx*sign};
    const half=thin?.045:.18,trim=Math.min(.03,length*.2);
    for(const offset of thin?[.055,.09,.15]:[.20,.32,.45,.60,.78]){
      const center={x:(a.x+b.x)/2+outside.x*offset,z:(a.z+b.z)/2+outside.z*offset};
      if(union.contains(center)===water&&!boundaryCrossesStrip(a,b,offset,outside,half,trim))return{a,b,outside,offset,thin};
    }
    return null;
  }
  function simplify(points){
    if(points.length<2)return;
    const deviation=curveDeviation(points),a=points[0],b=points.at(-1);
    if(deviation.distance<=.6){const candidate=fit(a,b);if(candidate){result.push(candidate);return;}}
    if(points.length===2){const candidate=fit(a,b,true);if(candidate)result.push(candidate);return;}
    const index=Math.max(1,Math.min(points.length-2,deviation.index));simplify(points.slice(0,index+1));simplify(points.slice(index));
  }
  for(const points of boundaryChains(outline))simplify(points);
  return result;
}

// A visible boundary follows existing unavailable areas; it does not move roads.
export function enrichWorldBoundaries(level){
  const b=level.bounds,walls=(level.walls||[]).filter(w=>w.kind!=='visible-boundary'),edges=[],boundaryRails=[];
  const insideBounds=p=>p.x>b.minX+EPS&&p.x<b.maxX-EPS&&p.z>b.minZ+EPS&&p.z<b.maxZ-EPS;
  const occupied=p=>walls.some(w=>{
    if(w.kind==='invisible')return false;
    const y=groundHeight(level,p.x,p.z),base=groundHeight(level,w.x,w.z)+(w.groundOffset??w.baseY??0);
    if(base>y+1.8||base+(w.height??3.5)<y+.15)return false;
    const q=boxLocalPoint(p,w);return Math.abs(q.x)<w.w/2+.05&&Math.abs(q.z)<w.d/2+.05;
  });
  const routeEdges=[];
  const route=(points,margin)=>{for(let i=1;i<points.length;i++){
    const a=points[i-1],b=points[i],bounds=extents([a,b]);
    routeEdges.push({a,b,margin,bounds:{minX:bounds.minX-margin,maxX:bounds.maxX+margin,minZ:bounds.minZ-margin,maxZ:bounds.maxZ+margin}});
  }};
  for(const road of level.cartography?.roads||[])route(road.points||[],(road.width||4)/2+2);
  for(const water of level.cartography?.water||[])if(water.length)route([...water,water[0]],2);
  const nearRoutes=spatialIndex(routeEdges),landmarks=[level.spawn,level.exit,...(level.collectibles||[])].filter(Boolean);
  const prominent=p=>!routeEdges.length||landmarks.some(q=>Math.hypot(q.x-p.x,q.z-p.z)<9)||nearRoutes({minX:p.x,maxX:p.x,minZ:p.z,maxZ:p.z}).some(e=>{
    const dx=e.b.x-e.a.x,dz=e.b.z-e.a.z,l=dx*dx+dz*dz,t=l?Math.max(0,Math.min(1,((p.x-e.a.x)*dx+(p.z-e.a.z)*dz)/l)):0;
    return Math.hypot(p.x-e.a.x-t*dx,p.z-e.a.z-t*dz)<=e.margin;
  });
  function segment(a,c,style,outside,retreat,sourceType='land'){
    const length=Math.hypot(c.x-a.x,c.z-a.z);if(length<.08)return;
    const dx=(c.x-a.x)/length,dz=(c.z-a.z)/length;
    let slope=0;
    if(style!=='masonry'&&level.landform?.type==='profile'){
      const axis=level.landform.axis==='x'?'x':'z',low=Math.min(a[axis],c[axis]),high=Math.max(a[axis],c[axis]),stops=level.landform.stops||[];
      for(let i=1;i<stops.length;i++)if(stops[i][0]>low&&stops[i-1][0]<high){
        const gradient=Math.abs((stops[i][1]-stops[i-1][1])/(stops[i][0]-stops[i-1][0]||1));
        slope=Math.max(slope,gradient*Math.abs(axis==='x'?dx:dz));
      }
    }
    const n=Math.max(Math.ceil(length/(style==='masonry'?9:8)),Math.ceil(length*slope/.35));
    // Includes the wider cap/plinth: even the visible face stays on the
    // unavailable side of the original edge, preserving every route width.
    const offset=retreat??(style==='masonry'?.285:.20);
    for(let i=0;i<n;i++){
      const t=(i+.5)/n,source=mix(a,c,t),x=source.x+outside.x*offset,z=source.z+outside.z*offset,part=length/n;
      if(style!=='masonry'&&(!insideBounds(source)||occupied(source)))continue;
      const ys=[groundHeight(level,x,z),groundHeight(level,x-dx*part/2,z-dz*part/2),groundHeight(level,x+dx*part/2,z+dz*part/2)];
      const floor=Math.min(...ys),low=style==='curb'||part<1.2||!prominent(source),height=(style==='masonry'?1.9:low?.16:1.22)+Math.max(...ys)-floor;
      const output=style==='masonry'?edges:boundaryRails;
      output.push({id:`${level.id}-clear-${style==='masonry'?'boundary':'shore'}-${output.length}`,kind:'visible-boundary',boundaryStyle:style==='masonry'?'masonry':low?'curb':'railing',
        x,z,w:Math.max(.02,part-(style==='masonry'?0:.24)),d:style==='masonry'?.42:low?.09:.16,rotation:Math.atan2(-dz,dx),height,
        baseY:floor-groundHeight(level,x,z),groundOffset:floor-groundHeight(level,x,z),fictional:true,
        boundarySource:{a:mix(a,c,i/n),b:mix(a,c,(i+1)/n),outside:{...outside},type:style==='masonry'?'bounds':sourceType}});
    }
  }
  segment({x:b.minX,z:b.minZ},{x:b.maxX,z:b.minZ},'masonry',{x:0,z:-1});
  segment({x:b.maxX,z:b.minZ},{x:b.maxX,z:b.maxZ},'masonry',{x:1,z:0});
  segment({x:b.maxX,z:b.maxZ},{x:b.minX,z:b.maxZ},'masonry',{x:0,z:1});
  segment({x:b.minX,z:b.maxZ},{x:b.minX,z:b.minZ},'masonry',{x:-1,z:0});
  for(const edge of shoreSegments(level.walkablePolygons||[],b))segment(edge.a,edge.b,edge.thin?'curb':'railing',edge.outside,edge.offset);
  // Water occupancy rows are first unioned; their internal raster edges are
  // never rendered. Existing perimeter blockers belong to the capped wall.
  const water=walls.filter(w=>w.kind==='invisible'&&!/bound|edge-(west|east|north|south)/.test(w.id||''));
  const polygons=water.map(w=>[[-w.w/2,-w.d/2],[w.w/2,-w.d/2],[w.w/2,w.d/2],[-w.w/2,w.d/2]].map(([x,z])=>worldPoint(w,x,z)));
  for(const edge of shoreSegments(polygons,b,true))segment(edge.a,edge.b,edge.thin?'curb':'railing',edge.outside,edge.offset,'water');
  return {...level,walls:[...walls,...edges],boundaryRails};
}

/** Newly uncovered building ground retires its former high rail, leaving a
 * low rubble curb. Bounds and actual river/lake banks always keep their rails.
 */
export function recoveredBoundaryRails(level){
  const recovered=new Set();if(!level.collapsedGround?.length)return recovered;
  const footprints=spatialIndex(level.collapsedGround.map(p=>({points:p.points,bounds:extents(p.points)}))),water=spatialIndex((level.cartography?.water||[]).filter(p=>p.length>=3).map(points=>({points,bounds:extents(points)})));
  function near(p,polygon,margin){
    if(inPolygon(p.x,p.z,polygon))return true;
    for(let i=0;i<polygon.length;i++){
      const a=polygon[i],b=polygon[(i+1)%polygon.length],dx=b.x-a.x,dz=b.z-a.z,t=Math.max(0,Math.min(1,((p.x-a.x)*dx+(p.z-a.z)*dz)/(dx*dx+dz*dz||1)));
      if(Math.hypot(p.x-a.x-dx*t,p.z-a.z-dz*t)<=margin)return true;
    }return false;
  }
  for(const w of level.boundaryRails||[]){
    if(w.boundaryStyle!=='railing'||w.boundarySource?.type==='water')continue;
    const count=Math.max(3,Math.ceil(w.w/.6)+1),points=Array.from({length:count},(_,i)=>worldPoint(w,-w.w/2+w.w*i/(count-1),0));
    const b=extents(points),nearBounds={minX:b.minX-1.1,maxX:b.maxX+1.1,minZ:b.minZ-1.1,maxZ:b.maxZ+1.1};
    if(!footprints(nearBounds).some(f=>points.some(p=>near(p,f.points,1.1))))continue;
    if(water(nearBounds).some(f=>points.some(p=>near(p,f.points,.7))))continue;
    recovered.add(w.id);
  }
  return recovered;
}

/** Three batches and one line batch keep long mapped perimeters inexpensive. */
export function drawWorldBoundaries({THREE,root,level,mat,geo,lineMaterial}){
  const parts=[[],[],[]],lines=[],meshes=[];
  function part(w,x,y,z,sx,sy,sz,type,removeOnRecovery=false){
    const p=worldPoint(w,x,z),base=groundHeight(level,w.x,w.z)+(w.groundOffset??w.baseY??0);
    parts[type].push({id:w.id,x:p.x,y:base+y+sy/2,z:p.z,sx,sy,sz,rotation:w.rotation||0,removeOnRecovery,lineStart:lines.length});
    const corners=[];
    for(const yy of[0,sy])for(const zz of[-sz/2,sz/2])for(const xx of[-sx/2,sx/2]){
      const q=worldPoint(w,x+xx,z+zz);corners.push([q.x,base+y+yy,q.z]);
    }
    for(const [a,b]of[[0,1],[1,3],[3,2],[2,0],[4,5],[5,7],[7,6],[6,4],[0,4],[1,5],[2,6],[3,7]])lines.push(...corners[a],...corners[b]);
  }
  for(const w of [...(level.walls||[]),...(level.boundaryRails||[])]){
    if(w.kind!=='visible-boundary')continue;
    if(w.boundaryStyle==='masonry'){
      part(w,0,0,0,w.w,w.height-.14,w.d,0);
      part(w,0,w.height-.14,0,w.w+.05,.14,w.d+.13,1);
      part(w,0,.12,0,w.w,.19,w.d+.04,2);
      // Spaced battlements give the perimeter a recognisable castle-wall
      // silhouette without moving its collision edge into streets.
      const merlons=Math.max(1,Math.floor(w.w/1.8)),cell=w.w/merlons;
      for(let i=0;i<merlons;i++)part(w,-w.w/2+cell*(i+.5),w.height,0,Math.min(.78,cell*.52),.42,w.d,1);
      const base=groundHeight(level,w.x,w.z)+(w.groundOffset??w.baseY??0);
      const seam=(x1,y1,x2,y2,z)=>{const a=worldPoint(w,x1,z),b=worldPoint(w,x2,z);lines.push(a.x,base+y1,a.z,b.x,base+y2,b.z);};
      // A few staggered mortar joints, not a tiled texture or dense grid.
      for(const face of[-1,1])for(let course=.52;course<w.height-.2;course+=.52){
        const z=face*(w.d/2+.004);seam(-w.w/2,course,w.w/2,course,z);
        for(let x=-w.w/2+((Math.round(course/.52)%2)?.9:1.8);x<w.w/2;x+=1.8)seam(x,Math.max(.15,course-.52),x,course,z);
      }
    }else if(w.boundaryStyle==='curb'){
      part(w,0,0,0,w.w,w.height,w.d,2);
    }else{
      part(w,0,.03,0,w.w,.16,.34,2);
      for(const y of[.48,w.height-.12])part(w,0,y,0,w.w,.12,.13,1,true);
      for(const x of[-w.w/2,w.w/2])part(w,x,0,0,.18,w.height,.22,2,true);
    }
  }
  const cube=geo(new THREE.BoxGeometry(1,1,1)),matrix=new THREE.Matrix4(),q=new THREE.Quaternion(),scale=new THREE.Vector3(),position=new THREE.Vector3(),axis=new THREE.Vector3(0,1,0);
  parts.forEach((batch,i)=>{
    if(!batch.length)return;
    const mesh=new THREE.InstancedMesh(cube,mat([0xe6e0cf,0xb6b6ab,0xd0ccbe][i],{paperClean:true}),batch.length);
    meshes[i]=mesh;
    mesh.name=`clear-boundary-${['wall','cap','plinth'][i]}`;
    batch.forEach((p,n)=>{matrix.compose(position.set(p.x,p.y,p.z),q.setFromAxisAngle(axis,p.rotation),scale.set(p.sx,p.sy,p.sz));mesh.setMatrixAt(n,matrix);});
    mesh.computeBoundingSphere();root.add(mesh);
  });
  let lineGeometry=null;
  if(lines.length){const geometry=geo(new THREE.BufferGeometry());geometry.setAttribute('position',new THREE.Float32BufferAttribute(lines,3));const line=new THREE.LineSegments(geometry,lineMaterial);line.name='clear-boundary-contours';root.add(line);lineGeometry=geometry;}
  let lastRevision=-1,lastCount=-1;const retired=new Set();
  function update(current=level){
    current=current.level||current;
    const revision=current.structureRevision||0,count=current.collapsedGround?.length||0;
    if(revision===lastRevision&&count===lastCount)return;lastRevision=revision;
    if(count===lastCount)return;lastCount=count;
    const recovered=recoveredBoundaryRails(current);let linesChanged=false;
    parts.forEach((batch,i)=>{
      let changed=false;batch.forEach((p,n)=>{
        if(!p.removeOnRecovery||!recovered.has(p.id)||retired.has(p.id))return;
        matrix.compose(position.set(p.x,p.y,p.z),q.setFromAxisAngle(axis,p.rotation),scale.set(0,0,0));meshes[i].setMatrixAt(n,matrix);changed=true;
        if(lineGeometry){const data=lineGeometry.attributes.position.array;for(let k=p.lineStart;k<p.lineStart+72;k+=3){data[k]=p.x;data[k+1]=p.y;data[k+2]=p.z;}linesChanged=true;}
      });if(changed)meshes[i].instanceMatrix.needsUpdate=true;
    });
    for(const id of recovered)retired.add(id);
    if(linesChanged)lineGeometry.attributes.position.needsUpdate=true;
  }
  update(level);
  return {update,retired};
}
