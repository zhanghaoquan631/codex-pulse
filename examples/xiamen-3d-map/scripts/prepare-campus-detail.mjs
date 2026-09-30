import fs from 'node:fs';
import {VectorTile} from '@mapbox/vector-tile';
import Pbf from 'pbf';
import clipping from 'polygon-clipping';
import {clipSegmentToBounds} from '../oldtown-layout.mjs';
import {prepareWaterContains} from '../water-query.mjs';

const base=JSON.parse(fs.readFileSync('public/data/xiamen.json','utf8'));
const coast=JSON.parse(fs.readFileSync('public/data/coast-detail.json','utf8'));
const m=base.meta,t=base.terrain,world=([lon,lat])=>[(lon-m.origin[0])*m.sx,(m.origin[1]-lat)*m.sz];
const [[x0,z0],[x1,z1]]=t.bounds,dx=(x1-x0)/t.nx,dz=(z1-z0)/t.nz;
const sw=world([118.090,24.434]),ne=world([118.104,24.4485]);
const bounds=[coast.bounds[2],z0+Math.floor((ne[1]-z0)/dz)*dz,x0+Math.ceil((ne[0]-x0)/dx)*dx,z0+Math.ceil((sw[1]-z0)/dz)*dz];
const rectangle=[[[bounds[0],bounds[1]],[bounds[2],bounds[1]],[bounds[2],bounds[3]],[bounds[0],bounds[3]],[bounds[0],bounds[1]]]];
const polygons=g=>g.type==='MultiPolygon'?g.coordinates:g.type==='Polygon'?[g.coordinates]:[];
const lines=g=>g.type==='MultiLineString'?g.coordinates:g.type==='LineString'?[g.coordinates]:[];
const key=points=>points.map(p=>p.map(n=>n.toFixed(6)).join(',')).join(';');
const area=ring=>Math.abs(ring.reduce((sum,p,i)=>{const q=ring[(i+1)%ring.length];return sum+p[0]*q[1]-q[0]*p[1];},0)/2);
const hits=rings=>{const p=rings.flat();return Math.max(...p.map(v=>v[0]))>=bounds[0]&&Math.min(...p.map(v=>v[0]))<=bounds[2]&&Math.max(...p.map(v=>v[1]))>=bounds[1]&&Math.min(...p.map(v=>v[1]))<=bounds[3];};
const water=new Map(),buildings=new Map(),covers=new Map(),paths=new Map(),names=[],pois=new Map();
for(const x of [13565,13566])for(const y of [7043,7044]){
  const tile=new VectorTile(new Pbf(fs.readFileSync(`.cache/vector-14-${x}-${y}.pbf`)));
  for(const type of ['water','building','landuse','landcover','transportation','transportation_name','water_name','poi']){
    const layer=tile.layers[type];if(!layer)continue;
    for(let i=0;i<layer.length;i++){
      const f=layer.feature(i),p=f.properties,g=f.toGeoJSON(x,y,14).geometry;
      if(g.type==='Point'){
        const point=world(g.coordinates);if(p.name&&hits([[point]]))pois.set(p.name,{name:p.name,ll:g.coordinates,point,kind:p.subclass||p.class});continue;
      }
      for(const polygon of polygons(g)){
        const rings=polygon.map(r=>r.map(world));if(!hits(rings))continue;
        const cut=clipping.intersection(rings,rectangle);
        for(const part of cut){
          if(area(part[0])<1e-7)continue;
          const id=key(part[0]);
          if(type==='building')buildings.set(id,{rings:part,height:Number(p.render_height)||5,minHeight:Number(p.render_min_height)||0});
          else if(type==='water')water.set(id,{rings:part,kind:p.class,sourceId:String(f.id)});
          else if(type==='landcover'||type==='landuse')covers.set(type+id,{rings:part,kind:p.subclass||p.class,layer:type});
        }
      }
      if(!type.startsWith('transportation')||p.brunnel==='tunnel'||Number(p.layer)<0||['transit','rail','aerialway'].includes(p.class))continue;
      for(const line of lines(g)){
        const points=line.map(world);let run=[];
        const flush=()=>{if(run.length>1){const path={points:run,name:p.name||'',kind:p.subclass||p.class,bridge:p.brunnel==='bridge',layer:Number(p.layer)||0,foot:p.foot||''};if(type==='transportation_name')names.push(path);else if(!paths.has(key([...run].reverse())))paths.set(key(run),path);}run=[];};
        for(let j=1;j<points.length;j++){
          const a=points[j-1],b=points[j],range=clipSegmentToBounds(a,b,bounds);if(!range){flush();continue;}
          const at=u=>[a[0]+(b[0]-a[0])*u,a[1]+(b[1]-a[1])*u],first=at(range[0]),last=at(range[1]);
          if(run.length&&Math.hypot(run.at(-1)[0]-first[0],run.at(-1)[1]-first[1])>1e-8)flush();
          if(!run.length)run.push(first);run.push(last);if(range[1]<1)flush();
        }flush();
      }
    }
  }
}
for(const p of paths.values())p.name=names.find(n=>n.kind===p.kind&&n.points.some(a=>p.points.some(b=>Math.hypot(a[0]-b[0],a[1]-b[1])<.0002)))?.name||'';
const originalWater=base.water.map((rings,i)=>({contains:prepareWaterContains(rings),height:base.waterHeights[i]}));
for(const w of water.values()){
  const center=w.rings[0].reduce((sum,p)=>sum.map((n,i)=>n+p[i]/w.rings[0].length),[0,0]);
  w.height=w.kind==='ocean'?0:originalWater.find(p=>p.contains(...center))?.height??10;
}
const wet=clipping.union(...[...water.values()].map(w=>w.rings)),land=clipping.difference(rectangle,wet);
// Apply the preceding district first: a shared ocean polygon must not restore its coarse coast.
for(const r of coast.replacements)base.water[r.index]=r.rings;
const replacements=[];
for(let index=0;index<base.water.length;index++){
  const rings=base.water[index];if(!rings.length||!hits(rings))continue;const groups=[];
  for(const ring of rings){let signed=0;for(let j=1;j<ring.length;j++)signed+=ring[j-1][0]*ring[j][1]-ring[j][0]*ring[j-1][1];if(signed>0||!groups.length)groups.push([ring]);else groups.at(-1).push(ring);}
  replacements.push({index,rings:clipping.difference(groups,rectangle).flat()});
}
const detail={source:base.meta.vectorSource,snapshot:'2026-09-13',license:'ODbL-1.0',bounds,land,water:[...water.values()],covers:[...covers.values()],buildings:[...buildings.values()],paths:[...paths.values()],pois:[...pois.values()],replacements};
fs.writeFileSync('public/data/campus-detail.json',JSON.stringify(detail));
console.log(JSON.stringify({bounds,buildings:detail.buildings.length,paths:detail.paths.length,stairs:detail.paths.filter(p=>p.kind==='steps').length,covers:detail.covers.length,water:detail.water.map(w=>[w.kind,w.height]),pois:detail.pois.map(p=>[p.name,p.ll])},null,2));
