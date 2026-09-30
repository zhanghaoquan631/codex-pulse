import fs from 'node:fs';
import {VectorTile} from '@mapbox/vector-tile';
import Pbf from 'pbf';
import clipping from 'polygon-clipping';
import {clipSegmentToBounds} from '../oldtown-layout.mjs';

const base=JSON.parse(fs.readFileSync('public/data/xiamen.json','utf8')),m=base.meta;
const world=([lon,lat])=>[(lon-m.origin[0])*m.sx,(m.origin[1]-lat)*m.sz];
const regions=['coast','campus','garden','eastshore'].map(name=>JSON.parse(fs.readFileSync(`public/data/${name}-detail.json`,'utf8')).bounds);
regions.push(...JSON.parse(fs.readFileSync('public/data/northshore-detail.json','utf8')).regions.map(r=>r.bounds));
const buildings=new Map(),roads=new Map(),covers=new Map(),roadBounds=[...base.terrain.bounds[0],...base.terrain.bounds[1]];
const [left,top,right,bottom]=roadBounds,clip=[[[left,top],[right,top],[right,bottom],[left,bottom],[left,top]]];
for(const name of fs.readdirSync('.cache').filter(n=>/^vector-14-\d+-\d+\.pbf$/.test(n)).sort()){
 const [,x,y]=name.match(/vector-14-(\d+)-(\d+)/).map(Number),tile=new VectorTile(new Pbf(fs.readFileSync(`.cache/${name}`))),layer=tile.layers.building,transport=tile.layers.transportation;
 for(const kind of ['landuse','landcover']){
  const l=tile.layers[kind];if(!l)continue;
  for(let i=0;i<l.length;i++){
   const f=l.feature(i),g=f.toGeoJSON(x,y,14).geometry,c=f.properties.class;
   if(!['residential','commercial','industrial','retail','school','university','park','wood','grass','garden','scrub','farmland','sand'].includes(c))continue;
   for(const polygon of g.type==='MultiPolygon'?g.coordinates:g.type==='Polygon'?[g.coordinates]:[]){
    for(const rings of clipping.intersection(polygon.map(r=>r.map(world)),clip)){
     const key=c+':'+JSON.stringify(rings);covers.set(key,{kind:c,rings});
    }
   }
  }
 }
 if(transport)for(let i=0;i<transport.length;i++){
  const f=transport.feature(i),p=f.properties;if(p.brunnel==='tunnel'||Number(p.layer)<0||!['motorway','trunk','primary','secondary','tertiary','rail'].includes(p.class))continue;
  const g=f.toGeoJSON(x,y,14).geometry;
  for(const raw of g.type==='MultiLineString'?g.coordinates:g.type==='LineString'?[g.coordinates]:[]){
   const points=raw.map(world);for(let j=1;j<points.length;j++){
    const a=points[j-1],b=points[j],range=clipSegmentToBounds(a,b,roadBounds);if(!range)continue;
    const run=range.map(t=>[a[0]+(b[0]-a[0])*t,a[1]+(b[1]-a[1])*t].map(v=>+v.toFixed(6)));
    if(Math.hypot(run[1][0]-run[0][0],run[1][1]-run[0][1])<.00005)continue;
    const key=p.class+':'+(p.brunnel==='bridge')+':'+run.map(p=>p.join(',')).sort().join(';');roads.set(key,[p.class,p.brunnel==='bridge',run]);
   }
  }
 }
 if(!layer)continue;
 for(let i=0;i<layer.length;i++){
  const f=layer.feature(i),g=f.toGeoJSON(x,y,14).geometry,p=f.properties;
  for(const raw of g.type==='MultiPolygon'?g.coordinates:g.type==='Polygon'?[g.coordinates]:[]){
   const rings=raw.map(r=>r.map(world)),r=rings[0],xs=r.map(p=>p[0]),zs=r.map(p=>p[1]);
   const bounds=[Math.min(...xs),Math.min(...zs),Math.max(...xs),Math.max(...zs)],cx=(bounds[0]+bounds[2])/2,cz=(bounds[1]+bounds[3])/2;
   if(cx<base.terrain.bounds[0][0]||cx>base.terrain.bounds[1][0]||cz<base.terrain.bounds[0][1]||cz>base.terrain.bounds[1][1])continue;
   if(regions.some(b=>bounds[0]>=b[0]&&bounds[2]<=b[2]&&bounds[1]>=b[1]&&bounds[3]<=b[3]))continue;
   const key=r.map(p=>p.map(n=>n.toFixed(5)).join(',')).join(';');
   buildings.set(key,{rings,height:Number(p.render_height)||6,name:p.name||'',sourceId:String(f.id),bounds});
  }
 }
}
const coverage=JSON.parse(fs.readFileSync('public/data/mainland-coverage.json','utf8'));
const result={source:m.vectorSource,license:'ODbL-1.0',snapshot:'2026-09-13',coverage,heightNote:'Map-provider render heights include defaults; these are not surveyed heights. Unmapped buildings are not invented.',buildings:[...buildings.values()],roads:[...roads.values()],covers:[...covers.values()]};
fs.writeFileSync('public/data/mainland-buildings.json',JSON.stringify(result));
console.log(JSON.stringify({buildings:result.buildings.length,roads:result.roads.length,bytes:fs.statSync('public/data/mainland-buildings.json').size}));
