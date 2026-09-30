import fs from 'node:fs/promises';
import path from 'node:path';
import {PNG} from 'pngjs';
import {prepareWaterContains} from '../water-query.mjs';

const root=path.resolve(import.meta.dirname,'..');
const read=name=>fs.readFile(path.join(root,'public/data',name),'utf8').then(JSON.parse);
const data=await read('xiamen.json'),tiles=new Map();
for(const file of await fs.readdir(path.join(root,'.cache'))){
  const match=/^terrain-12-(\d+)-(\d+)\.png$/.exec(file);
  if(match)tiles.set(`${match[1]},${match[2]}`,PNG.sync.read(await fs.readFile(path.join(root,'.cache',file))));
}
function pixel(x,y){
  const tx=Math.floor(x/256),ty=Math.floor(y/256),tile=tiles.get(`${tx},${ty}`);
  if(!tile)throw new Error(`Missing cached elevation tile ${tx},${ty}`);
  const i=((y-ty*256)*tile.width+x-tx*256)*4;
  return tile.data[i]*256+tile.data[i+1]+tile.data[i+2]/256-32768;
}
function elevation(lon,lat){
  const size=2**12*256,x=(lon+180)/360*size-.5,y=(1-Math.asinh(Math.tan(lat*Math.PI/180))/Math.PI)/2*size-.5;
  const ix=Math.floor(x),iy=Math.floor(y),u=x-ix,v=y-iy;
  return Math.max(0,(pixel(ix,iy)*(1-u)+pixel(ix+1,iy)*u)*(1-v)+(pixel(ix,iy+1)*(1-u)+pixel(ix+1,iy+1)*u)*v);
}
// The source DEM is unchanged. Twice the mesh sampling density avoids the old
// nearest-pixel jumps; it is not a new survey or a claim of street-level accuracy.
const terrain={nx:520,nz:520,bounds:data.terrain.bounds,heights:[],source:'Mapzen Terrarium / cached zoom 12',method:'Bilinear source sampling; 2x display grid',verticalExaggeration:4};
const [[x0,z0],[x1,z1]]=terrain.bounds;
for(let j=0;j<=terrain.nz;j++)for(let i=0;i<=terrain.nx;i++){
  const x=x0+i/terrain.nx*(x1-x0),z=z0+j/terrain.nz*(z1-z0);
  terrain.heights.push(Math.round(elevation(data.meta.origin[0]+x/data.meta.sx,data.meta.origin[1]-z/data.meta.sz)*10)/10);
}
const waters=data.water.map((rings,i)=>({rings,height:data.waterHeights[i]}));
for(const name of ['coast','campus','garden','eastshore','northshore']){
  const detail=await read(`${name}-detail.json`);
  for(const part of detail.regions||[detail]){
    for(const replacement of part.replacements||[])waters[replacement.index].rings=replacement.rings;
    for(const water of part.water||[])waters.push(Array.isArray(water)?{rings:water,height:0}:water);
  }
}
function splitWater(water){
  const groups=[];
  for(const ring of water.rings){
    let area=0;for(let i=0,j=ring.length-1;i<ring.length;j=i++)area+=ring[j][0]*ring[i][1]-ring[i][0]*ring[j][1];
    if(area>0||!groups.length)groups.push({height:water.height,rings:[ring]});else groups.at(-1).rings.push(ring);
  }
  return groups;
}
for(const water of waters.flatMap(splitWater)){
  if(!water.rings.length)continue;
  const points=water.rings.flat(),xs=points.map(p=>p[0]),zs=points.map(p=>p[1]);
  const contains=prepareWaterContains(water.rings),gx=x=>(x-x0)/(x1-x0)*terrain.nx,gz=z=>(z-z0)/(z1-z0)*terrain.nz;
  const left=Math.max(0,Math.floor(gx(Math.min(...xs)))),right=Math.min(terrain.nx,Math.ceil(gx(Math.max(...xs))));
  const top=Math.max(0,Math.floor(gz(Math.min(...zs)))),bottom=Math.min(terrain.nz,Math.ceil(gz(Math.max(...zs))));
  for(let j=top;j<=bottom;j++)for(let i=left;i<=right;i++)if(contains(x0+i/terrain.nx*(x1-x0),z0+j/terrain.nz*(z1-z0)))terrain.heights[j*(terrain.nx+1)+i]=water.height-3;
}
if(!terrain.heights.every(Number.isFinite))throw new Error('Invalid terrain heights');
await fs.writeFile(path.join(root,'public/data/terrain-refined.json'),JSON.stringify(terrain));
console.log(JSON.stringify({grid:[terrain.nx,terrain.nz],samples:terrain.heights.length,source:terrain.source}));
