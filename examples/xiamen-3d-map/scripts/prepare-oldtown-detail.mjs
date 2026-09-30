import fs from 'node:fs';
import {oldTownBounds,clipSegmentToBounds} from '../oldtown-layout.mjs';

const network=JSON.parse(fs.readFileSync('public/data/travel-network.json','utf8'));
const nodes=new Map(network.nodes.map(([id,...ll])=>[id,ll]));
const paths=[];
for(const way of network.ways){
  if(way.bridge||way.layer<0||['pier','platform'].includes(way.kind))continue;
  let run=[];
  const flush=()=>{if(run.length>1)paths.push({name:way.name,kind:way.kind,path:run});run=[];};
  for(let i=1;i<way.nodes.length;i++){
    const a=nodes.get(way.nodes[i-1]),b=nodes.get(way.nodes[i]);if(!a||!b){flush();continue;}
    const interval=clipSegmentToBounds(a,b,oldTownBounds);if(!interval){flush();continue;}
    const at=t=>[a[0]+(b[0]-a[0])*t,a[1]+(b[1]-a[1])*t],first=at(interval[0]),last=at(interval[1]);
    if(!run.length||Math.hypot(run.at(-1)[0]-first[0],run.at(-1)[1]-first[1])>1e-9){flush();run.push(first);}
    run.push(last);if(interval[1]<1)flush();
  }
  flush();
}
fs.writeFileSync('public/data/oldtown-detail.json',JSON.stringify({source:network.source,license:network.license,snapshot:network.snapshot,bounds:oldTownBounds,paths}));
console.log(JSON.stringify({paths:paths.length,namedStreets:[...new Set(paths.map(p=>p.name).filter(Boolean))].length,snapshot:network.snapshot}));
