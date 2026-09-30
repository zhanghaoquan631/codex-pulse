import fs from 'node:fs/promises';
import {VectorTile} from '@mapbox/vector-tile';
import Pbf from 'pbf';

const base=JSON.parse(await fs.readFile('public/data/xiamen.json','utf8'));
const [west,south,east,north]=base.meta.bbox||[117.98,24.38,118.25,24.62];
const tile=(lon,lat)=>[(lon+180)/360*16384,(1-Math.asinh(Math.tan(lat*Math.PI/180))/Math.PI)/2*16384];
const a=tile(west,north),b=tile(east,south),tiles=[];
for(let x=Math.floor(a[0]);x<=Math.floor(b[0]);x++)for(let y=Math.floor(a[1]);y<=Math.floor(b[1]);y++)tiles.push([x,y]);
const source=base.meta.vectorSource;
if(!source?.includes('{z}'))throw new Error('Expected a versioned vector tile source');
let downloaded=0;
for(const [x,y] of tiles){
 const file=`.cache/vector-14-${x}-${y}.pbf`;
 try{new VectorTile(new Pbf(await fs.readFile(file)));continue;}catch{}
 let error;
 for(let attempt=0;attempt<3;attempt++)try{
  const r=await fetch(source.replace('{z}','14').replace('{x}',x).replace('{y}',y),{signal:AbortSignal.timeout(25000)});
  if(!r.ok)throw new Error(`Tile ${x}/${y}: HTTP ${r.status}`);
  const bytes=Buffer.from(await r.arrayBuffer());new VectorTile(new Pbf(bytes));await fs.writeFile(file,bytes);error=null;break;
 }catch(e){error=e;}
 if(error)throw error;
 downloaded++;if(downloaded%10===0)console.log(`Downloaded ${downloaded} missing tiles`);
}
const report={source,snapshot:'2026-09-13',zoom:14,bbox:[west,south,east,north],expectedTiles:tiles.length,verifiedTiles:tiles.length,downloaded};
await fs.writeFile('public/data/mainland-coverage.json',JSON.stringify(report));
console.log(JSON.stringify(report));
