import fs from 'node:fs';
import {VectorTile} from '@mapbox/vector-tile';
import Pbf from 'pbf';
import clipping from 'polygon-clipping';
import {clipSegmentToBounds} from '../oldtown-layout.mjs';

const base=JSON.parse(fs.readFileSync('public/data/xiamen.json','utf8')),m=base.meta,t=base.terrain;
const world=([lon,lat])=>[(lon-m.origin[0])*m.sx,(m.origin[1]-lat)*m.sz];
const sw=world([118.078,24.4338]),ne=world([118.090,24.4463]);
const [[x0,z0],[x1,z1]]=t.bounds,dx=(x1-x0)/t.nx,dz=(z1-z0)/t.nz;
const bounds=[x0+Math.floor((sw[0]-x0)/dx)*dx,z0+Math.floor((ne[1]-z0)/dz)*dz,x0+Math.ceil((ne[0]-x0)/dx)*dx,z0+Math.ceil((sw[1]-z0)/dz)*dz];
const rectangle=[[[bounds[0],bounds[1]],[bounds[2],bounds[1]],[bounds[2],bounds[3]],[bounds[0],bounds[3]],[bounds[0],bounds[1]]]];
const water=[],harbor=[],structures=new Map(),pathMap=new Map(),nameSegments=[],parks=[];
const key=ring=>ring.map(p=>p.map(v=>v.toFixed(6)).join(',')).join(';');
const polygons=g=>g.type==='MultiPolygon'?g.coordinates:g.type==='Polygon'?[g.coordinates]:[];
const lines=g=>g.type==='MultiLineString'?g.coordinates:g.type==='LineString'?[g.coordinates]:[];
const hits=rings=>{const p=rings.flat(),xs=p.map(v=>v[0]),zs=p.map(v=>v[1]);return Math.max(...xs)>=bounds[0]&&Math.min(...xs)<=bounds[2]&&Math.max(...zs)>=bounds[1]&&Math.min(...zs)<=bounds[3];};
for(const x of [13565,13566])for(const y of [7043,7044]){
  const file=`.cache/vector-14-${x}-${y}.pbf`;if(!fs.existsSync(file))throw new Error('Missing cached source '+file);
  const tile=new VectorTile(new Pbf(fs.readFileSync(file)));
  for(const layerName of ['water','building','landuse','transportation','transportation_name']){
    const layer=tile.layers[layerName];if(!layer)continue;
    for(let i=0;i<layer.length;i++){
      const f=layer.feature(i),p=f.properties,g=f.toGeoJSON(x,y,14).geometry;
      if(['water','building','landuse'].includes(layerName))for(const polygon of polygons(g)){
        const rings=polygon.map(r=>r.map(world));if(!hits(rings))continue;
        if(layerName==='water'){const cut=clipping.intersection(rings,rectangle);water.push(...cut);if(String(f.id)==='7850978542')harbor.push(...cut);continue;}
        if(layerName==='landuse'){
          if(['park','grass','garden','recreation_ground'].includes(p.class))parks.push(...clipping.intersection(rings,rectangle));
          continue;
        }
        // toGeoJSON preserves every exterior and hole of a grouped vector-tile feature.
        const center=rings[0].reduce((c,v)=>[c[0]+v[0]/rings[0].length,c[1]+v[1]/rings[0].length],[0,0]);
        if(!center.every(Number.isFinite))continue;
        const id=center.map(v=>v.toFixed(4)).join(',');
        const record={sourceId:String(f.id),height:Number(p.render_height)||5,minHeight:Number(p.render_min_height)||0,rings};
        if(!structures.has(id)||rings[0].length>structures.get(id).rings[0].length)structures.set(id,record);
      }
      if(!layerName.startsWith('transportation'))continue;
      if(p.brunnel==='tunnel'||Number(p.layer)<0||Number(p.level)<0||['transit','rail','aerialway'].includes(p.class))continue;
      for(const line of lines(g)){
        const points=line.map(world);let run=[];
        const flush=()=>{
          if(run.length>1){
            const path={name:p.name||'',kind:p.subclass||p.class,bridge:p.brunnel==='bridge',layer:Number(p.layer)||0,foot:p.foot||'',points:run};
            if(layerName==='transportation_name')nameSegments.push(path);
            else{const k=key(run),reverse=key([...run].reverse());if(!pathMap.has(k)&&!pathMap.has(reverse))pathMap.set(k,path);}
          }
          run=[];
        };
        for(let j=1;j<points.length;j++){
          const a=points[j-1],b=points[j],range=clipSegmentToBounds(a,b,bounds);
          if(!range){flush();continue;}
          const at=u=>[a[0]+(b[0]-a[0])*u,a[1]+(b[1]-a[1])*u],first=at(range[0]),last=at(range[1]);
          if(run.length&&Math.hypot(run.at(-1)[0]-first[0],run.at(-1)[1]-first[1])>1e-8)flush();
          if(!run.length)run.push(first);run.push(last);if(range[1]<1)flush();
        }
        flush();
      }
    }
  }
}
const paths=[...pathMap.values()];
for(const path of paths){
  const name=nameSegments.find(n=>n.points.some(a=>path.points.some(b=>Math.hypot(a[0]-b[0],a[1]-b[1])<.0002))&&n.kind===path.kind);
  if(name)path.name=name.name;
}
const mergedWater=clipping.union(...water),land=clipping.difference(rectangle,mergedWater);
const area=ring=>Math.abs(ring.reduce((n,p,i)=>{const q=ring[(i+1)%ring.length];return n+p[0]*q[1]-q[0]*p[1];},0)/2);
const buildings=[...structures.values()].flatMap(b=>clipping.intersection(b.rings,land).filter(r=>area(r[0])>.000006).map(rings=>({...b,rings})));
const replacements=[];
for(let index=0;index<base.water.length;index++){
  const rings=base.water[index];if(!hits(rings))continue;
  const groups=[];
  for(const ring of rings){let signed=0;for(let i=1;i<ring.length;i++)signed+=ring[i-1][0]*ring[i][1]-ring[i][0]*ring[i-1][1];if(signed>0||!groups.length)groups.push([ring]);else groups.at(-1).push(ring);}
  replacements.push({index,rings:clipping.difference(groups,rectangle).flat()});
}
const detail={source:'OpenStreetMap / OpenFreeMap vector tiles',snapshot:'2026-09-13',license:'ODbL-1.0',bounds,water:mergedWater,harbor:clipping.union(...harbor),land,parks,buildings,paths,replacements};
fs.writeFileSync('public/data/coast-detail.json',JSON.stringify(detail));
console.log(JSON.stringify({bounds,buildings:buildings.length,paths:paths.length,bridges:paths.filter(p=>p.bridge).length,stairs:paths.filter(p=>p.kind==='steps').length,water:mergedWater.length,towers:buildings.filter(b=>b.height>200).length}));
