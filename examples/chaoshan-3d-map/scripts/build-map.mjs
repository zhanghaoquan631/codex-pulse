import fs from 'node:fs/promises';
import path from 'node:path';
import { VectorTile } from '@mapbox/vector-tile';
import Pbf from 'pbf';
import { PNG } from 'pngjs';

const root = path.resolve(import.meta.dirname, '..');
const output = path.join(root, 'public/data');
const cache = path.join(root, '.cache');
await fs.mkdir(output, { recursive: true });
await fs.mkdir(cache, { recursive: true });
const regions = JSON.parse(await fs.readFile(path.join(root, 'regions.json'), 'utf8'));
const bbox = [115.60, 22.80, 117.35, 24.12];
const origin = [(bbox[0] + bbox[2]) / 2, (bbox[1] + bbox[3]) / 2];
const sx = 111.32 * Math.cos(origin[1] * Math.PI / 180), sz = 111.32;
const world = (lon, lat) => [(lon - origin[0]) * sx, (origin[1] - lat) * sz];
const bounds = [world(bbox[0], bbox[3]), world(bbox[2], bbox[1])];
const tilePoint = (lon, lat, z) => {
  const n = 2 ** z, phi = lat * Math.PI / 180;
  return [(lon + 180) / 360 * n, (1 - Math.asinh(Math.tan(phi)) / Math.PI) / 2 * n];
};
const tileLL = (x, y, z) => [x / 2 ** z * 360 - 180, Math.atan(Math.sinh(Math.PI * (1 - 2 * y / 2 ** z))) * 180 / Math.PI];
async function download(url, name) {
  const file = path.join(cache, name);
  try { return await fs.readFile(file); } catch {}
  let lastError;
  for (let attempt = 0; attempt < 3; attempt++) {
    try {
      const response = await fetch(url, { signal: AbortSignal.timeout(25000) });
      if (!response.ok) throw new Error(`HTTP ${response.status}: ${name}`);
      const bytes = Buffer.from(await response.arrayBuffer());
      await fs.writeFile(file, bytes);
      return bytes;
    } catch (error) { lastError = error; }
  }
  throw lastError;
}
async function pool(items, work, label) {
  let cursor = 0, completed = 0;
  await Promise.all(Array.from({ length: 6 }, async () => {
    while (cursor < items.length) {
      const i = cursor++;
      await work(items[i], i);
      completed++;
      if (completed % 20 === 0 || completed === items.length) console.log(`${label} ${completed}/${items.length}`);
    }
  }));
}
function tileRange(z) {
  const [x0, y0] = tilePoint(bbox[0], bbox[3], z), [x1, y1] = tilePoint(bbox[2], bbox[1], z);
  const tiles = [];
  for (let x = Math.floor(x0); x <= Math.floor(x1); x++) for (let y = Math.floor(y0); y <= Math.floor(y1); y++) tiles.push([z, x, y]);
  return tiles;
}
const tileMeta = JSON.parse(await download('https://tiles.openfreemap.org/planet', 'tilejson.json'));
const tileURL = ([z, x, y]) => tileMeta.tiles[0].replace('{z}', z).replace('{x}', x).replace('{y}', y);
const elevationTiles = new Map();
await pool(tileRange(9), async ([z,x,y]) => {
  const bytes = await download(`https://s3.amazonaws.com/elevation-tiles-prod/terrarium/${z}/${x}/${y}.png`, `terrain-${z}-${x}-${y}.png`);
  elevationTiles.set(`${x},${y}`, PNG.sync.read(bytes));
}, 'Elevation');
function elevation(lon, lat) {
  const [tx, ty] = tilePoint(lon, lat, 9), x = Math.floor(tx), y = Math.floor(ty);
  const img = elevationTiles.get(`${x},${y}`);
  if (!img) throw new Error('Elevation sample outside downloaded coverage');
  const px = Math.min(255, Math.floor((tx - x) * 256)), py = Math.min(255, Math.floor((ty - y) * 256));
  const i = (py * img.width + px) * 4;
  return Math.max(0, img.data[i] * 256 + img.data[i + 1] + img.data[i + 2] / 256 - 32768);
}
const terrain = { nx: 360, nz: 300, bounds, heights: [] };
for (let j = 0; j <= terrain.nz; j++) for (let i = 0; i <= terrain.nx; i++) {
  const lon = bbox[0] + i / terrain.nx * (bbox[2] - bbox[0]), lat = bbox[3] - j / terrain.nz * (bbox[3] - bbox[1]);
  terrain.heights.push(Math.round(elevation(lon,lat)));
}
function inside(p) { return p[0] >= bounds[0][0] && p[0] <= bounds[1][0] && p[1] >= bounds[0][1] && p[1] <= bounds[1][1]; }
const round = n => Math.round(n * 100000) / 100000;
function polygonClip(points) {
  let p = points.slice();
  for (const [axis, value, greater] of [[0,bounds[0][0],true],[0,bounds[1][0],false],[1,bounds[0][1],true],[1,bounds[1][1],false]]) {
    const next = [], valid = q => greater ? q[axis] >= value : q[axis] <= value;
    for(let i=0; i<p.length; i++) {
      const a=p[i],b=p[(i+1)%p.length], aIn=valid(a),bIn=valid(b);
      if(aIn) next.push(a);
      if(aIn!==bIn) { const t=(value-a[axis])/(b[axis]-a[axis]);next.push([a[0]+(b[0]-a[0])*t,a[1]+(b[1]-a[1])*t]); }
    }
    p=next;if(!p.length) return [];
  }
  if(p.length>2) p.push(p[0]);
  return p.map(q=>q.map(round));
}
function linesClip(points) {
  const result = []; let current=[];
  for(let i=1;i<points.length;i++) {
    const a=points[i-1],b=points[i],dx=b[0]-a[0],dy=b[1]-a[1];let t0=0,t1=1,valid=true;
    for(const [p,q] of [[-dx,a[0]-bounds[0][0]],[dx,bounds[1][0]-a[0]],[-dy,a[1]-bounds[0][1]],[dy,bounds[1][1]-a[1]]]) {
      if(p===0){if(q<0)valid=false;continue;}const r=q/p;if(p<0)t0=Math.max(t0,r);else t1=Math.min(t1,r);
    }
    if(!valid||t0>t1){if(current.length>1)result.push(current);current=[];continue;}
    const start=[round(a[0]+t0*dx),round(a[1]+t0*dy)],end=[round(a[0]+t1*dx),round(a[1]+t1*dy)];
    if(!current.length)current.push(start);current.push(end);
    if(t1<1){result.push(current);current=[];}
  }
  if(current.length>1) result.push(current);return result;
}
const water = [], waterHeights = [], roads = [], borders = [], waterKeys = new Set(), roadKeys = new Set();
await pool(tileRange(11), async tile => {
  const bytes = await download(tileURL(tile), `vector-${tile.join('-')}.pbf`);
  const vt = new VectorTile(new Pbf(bytes)), [z,x,y] = tile;
  const convert = (geometry, extent) => geometry.map(ring=>ring.map(p=>world(...tileLL(x+p.x/extent,y+p.y/extent,z))));
  for (const layerName of ['water','transportation','boundary']) {
    const layer=vt.layers[layerName];if(!layer)continue;
    for(let i=0;i<layer.length;i++) {
      const f=layer.feature(i), prop=f.properties;
      if(layerName==='water' && f.type===3) {
        const rings=convert(f.loadGeometry(),f.extent).map(polygonClip).filter(r=>r.length>3);
        if(!rings.length)continue;const key=JSON.stringify(rings);if(waterKeys.has(key))continue;waterKeys.add(key);
        water.push(rings);
        const p=rings[0][0],ll=[p[0]/sx+origin[0],origin[1]-p[1]/sz];
        waterHeights.push(prop.class==='ocean'?0:Math.round(elevation(...ll)));
      }
      if(layerName==='transportation' && f.type===2) {
        const cls=prop.class==='rail'?'rail':prop.class;
        if(!['motorway','trunk','primary','secondary','tertiary','rail'].includes(cls))continue;
        for(const raw of convert(f.loadGeometry(),f.extent))for(const line of linesClip(raw)){
          const key=`${cls}:${JSON.stringify(line)}`;if(roadKeys.has(key))continue;roadKeys.add(key);
          roads.push([cls,prop.brunnel==='bridge',line]);
        }
      }
      if(layerName==='boundary' && f.type===2 && Number(prop.admin_level)>=6 && Number(prop.admin_level)<=8) {
        for(const raw of convert(f.loadGeometry(),f.extent)) borders.push(...linesClip(raw));
      }
    }
  }
}, 'Map vectors');
const buildingTiles = new Map();
for(const region of regions){const [x,y]=tilePoint(...region.ll,14);for(let dx=-2;dx<=2;dx++)for(let dy=-2;dy<=2;dy++){
  const tile=[14,Math.floor(x)+dx,Math.floor(y)+dy];buildingTiles.set(tile.join('-'),tile);
}}
const records=[], buildingKeys=new Set();
await pool([...buildingTiles.values()], async tile=>{
  const bytes=await download(tileURL(tile),`vector-${tile.join('-')}.pbf`),vt=new VectorTile(new Pbf(bytes));
  const layer=vt.layers.building;if(!layer)return;const [z,x,y]=tile;
  for(let i=0;i<layer.length;i++){
    const f=layer.feature(i);if(f.properties.hide_3d)continue;
    const ring=f.loadGeometry()[0]?.map(p=>world(...tileLL(x+p.x/f.extent,y+p.y/f.extent,z)));if(!ring||ring.length<4)continue;
    let a=ring[0],b=ring[1],length=0;
    for(let n=1;n<ring.length;n++){const d=Math.hypot(ring[n][0]-ring[n-1][0],ring[n][1]-ring[n-1][1]);if(d>length){length=d;a=ring[n-1];b=ring[n];}}
    const angle=Math.atan2(b[1]-a[1],b[0]-a[0]),c=Math.cos(angle),s=Math.sin(angle);
    const u=ring.map(p=>p[0]*c+p[1]*s),v=ring.map(p=>-p[0]*s+p[1]*c);
    const u0=Math.min(...u),u1=Math.max(...u),v0=Math.min(...v),v1=Math.max(...v),uc=(u0+u1)/2,vc=(v0+v1)/2;
    const cx=uc*c-vc*s,cz=uc*s+vc*c,w=u1-u0,d=v1-v0;
    if(!inside([cx,cz])||w<.002||d<.002||w>2||d>2)continue;
    const key=`${cx.toFixed(4)},${cz.toFixed(4)}`;if(buildingKeys.has(key))continue;buildingKeys.add(key);
    records.push([cx,cz,w,d,angle,Math.max(3,Number(f.properties.render_height)||8)]);
  }
}, 'Building footprints');
const sorted = records.sort((a,b)=>a[0]-b[0]||a[1]-b[1]);
// Flatten the elevation samples under mapped water, respecting islands/holes.
function ringArea(r){let a=0;for(let i=0,j=r.length-1;i<r.length;j=i++)a+=r[j][0]*r[i][1]-r[i][0]*r[j][1];return a/2;}
function inRing(p,r){let yes=false;for(let i=0,j=r.length-1;i<r.length;j=i++){const a=r[i],b=r[j];if((a[1]>p[1])!==(b[1]>p[1])&&p[0]<(b[0]-a[0])*(p[1]-a[1])/(b[1]-a[1])+a[0])yes=!yes;}return yes;}
let flattened=0;
for(let index=0;index<water.length;index++) {
  const groups=[];for(const ring of water[index]){if(ringArea(ring)>0||!groups.length)groups.push([ring]);else groups.at(-1).push(ring);}
  for(const rings of groups){
    const outer=rings[0],xs=outer.map(p=>p[0]),zs=outer.map(p=>p[1]);
    const i0=Math.max(0,Math.floor((Math.min(...xs)-bounds[0][0])/(bounds[1][0]-bounds[0][0])*terrain.nx));
    const i1=Math.min(terrain.nx,Math.ceil((Math.max(...xs)-bounds[0][0])/(bounds[1][0]-bounds[0][0])*terrain.nx));
    const j0=Math.max(0,Math.floor((Math.min(...zs)-bounds[0][1])/(bounds[1][1]-bounds[0][1])*terrain.nz));
    const j1=Math.min(terrain.nz,Math.ceil((Math.max(...zs)-bounds[0][1])/(bounds[1][1]-bounds[0][1])*terrain.nz));
    for(let j=j0;j<=j1;j++)for(let i=i0;i<=i1;i++){
      const p=[bounds[0][0]+i/terrain.nx*(bounds[1][0]-bounds[0][0]),bounds[0][1]+j/terrain.nz*(bounds[1][1]-bounds[0][1])];
      if(inRing(p,outer)&&!rings.slice(1).some(r=>inRing(p,r))){terrain.heights[j*(terrain.nx+1)+i]=waterHeights[index]-3;flattened++;}
    }
  }
}
console.log(`Water-aligned elevation samples: ${flattened}`);
const binary=new Float32Array(sorted.flat());
const meta={origin,sx,sz,bbox,buildingCount:sorted.length,generatedAt:new Date().toISOString(),vectorSource:tileMeta.tiles[0],elevationSource:'https://s3.amazonaws.com/elevation-tiles-prod/terrarium/{z}/{x}/{y}.png',buildingCoverage:'5x5 zoom-14 tiles around each of 12 regional representative points; OpenStreetMap coverage varies',actualData:true};
const data={meta,terrain,water,waterHeights,roads,districts:[{name:'OSM 行政边界',en:'OSM administrative lines',rings:borders}]};
await fs.writeFile(path.join(output,'chaoshan.json'),JSON.stringify(data));
await fs.writeFile(path.join(output,'buildings.bin'),Buffer.from(binary.buffer));
await fs.writeFile(path.join(output,'provenance.json'),JSON.stringify({...meta,roadSegments:roads.length,waterPolygons:water.length,boundaryLines:borders.length,terrainSamples:terrain.heights.length,regions},null,2));
console.log(JSON.stringify({buildings:sorted.length,roads:roads.length,water:water.length,elevationSamples:terrain.heights.length}));
if(!sorted.length||!roads.length||!water.length)throw new Error('Incomplete map data; do not deliver');
