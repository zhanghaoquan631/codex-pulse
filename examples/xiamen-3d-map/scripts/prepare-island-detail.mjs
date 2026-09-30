import fs from 'node:fs/promises';
import {VectorTile} from '@mapbox/vector-tile';
import Pbf from 'pbf';
import {onIsland} from '../island-layout.mjs';

const network=JSON.parse(await fs.readFile('public/data/travel-network.json','utf8'));
const nodes=new Map(network.nodes.map(([id,...ll])=>[id,ll]));
const paths=[];
for(const way of network.ways){
  let run=[];
  const flush=()=>{if(run.length>1)paths.push({kind:way.kind,name:way.name,bridge:way.bridge,path:run});run=[];};
  for(const id of way.nodes){const ll=nodes.get(id);if(onIsland(ll))run.push(ll.map(v=>+v.toFixed(7)));else flush();}
  flush();
}
const patches=[],seen=new Set();
for(const file of await fs.readdir('.cache')){
  const match=file.match(/^vector-14-(\d+)-(\d+)\.pbf$/);if(!match)continue;
  const x=+match[1],y=+match[2];
  if(![13564,13565].includes(x)||![7043,7044].includes(y))continue;
  const tile=new VectorTile(new Pbf(await fs.readFile('.cache/'+file)));
  for(const key of ['landcover','landuse','park']){
    const layer=tile.layers[key];if(!layer)continue;
    for(let i=0;i<layer.length;i++){
      const f=layer.feature(i),kind=f.properties.class;
      if(!['sand','grass','wood','park','garden','recreation_ground'].includes(kind)&&key!=='park')continue;
      for(const ring of f.loadGeometry()){
        const pts=ring.map(p=>[(x+p.x/f.extent)/16384*360-180,Math.atan(Math.sinh(Math.PI*(1-2*(y+p.y/f.extent)/16384)))*180/Math.PI]);
        if(!pts.every(onIsland))continue;
        const id=JSON.stringify(pts);if(seen.has(id))continue;seen.add(id);
        patches.push({kind:kind||'park',ring:pts.map(p=>p.map(v=>+v.toFixed(7)))});
      }
    }
  }
}
const result={source:network.source,snapshot:network.snapshot,license:network.license,paths,patches};
await fs.writeFile('public/data/island-detail.json',JSON.stringify(result));
await import('./prepare-island-shore.mjs');
console.log(JSON.stringify({paths:paths.length,patches:patches.length,bytes:JSON.stringify(result).length}));
