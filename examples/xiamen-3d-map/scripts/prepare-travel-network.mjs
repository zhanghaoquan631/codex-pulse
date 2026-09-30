import fs from 'node:fs/promises';
import {VectorTile} from '@mapbox/vector-tile';
import Pbf from 'pbf';

const bbox=[118.052,24.436,118.096,24.492],nodes=new Map(),ways=[],pois=[],seen=new Set();
const metadata=JSON.parse(await fs.readFile('.cache/tilejson.json','utf8'));
const inside=([lon,lat])=>lon>=bbox[0]&&lon<=bbox[2]&&lat>=bbox[1]&&lat<=bbox[3];
const kinds=new Set(['path','minor','service','tertiary','secondary','pier']);
function coordinate(x,y){return [x/16384*360-180,Math.atan(Math.sinh(Math.PI*(1-2*y/16384)))*180/Math.PI];}
for(const file of await fs.readdir('.cache')){
  const match=file.match(/^vector-14-(\d+)-(\d+)\.pbf$/);if(!match)continue;
  const x=Number(match[1]),y=Number(match[2]),center=coordinate(x+.5,y+.5);
  if(center[0]<bbox[0]-.023||center[0]>bbox[2]+.023||center[1]<bbox[1]-.021||center[1]>bbox[3]+.021)continue;
  const tile=new VectorTile(new Pbf(await fs.readFile('.cache/'+file)));
  for(const layerName of ['transportation_name','transportation','poi']){
    const layer=tile.layers[layerName];if(!layer)continue;
    for(let i=0;i<layer.length;i++){
      const f=layer.feature(i),tags=f.properties,geo=f.loadGeometry();
      if(layerName==='poi'){
        const p=geo[0][0],ll=coordinate(x+p.x/f.extent,y+p.y/f.extent);
        if(inside(ll)&&tags.name)pois.push({name:tags.name,ll,tags});
        continue;
      }
      if(!kinds.has(tags.class)||['no','private'].includes(tags.access)||tags.bicycle==='designated'&&tags.foot==='no')continue;
      for(const line of geo){
        const ids=[];
        for(const p of line){const ll=coordinate(x+p.x/f.extent,y+p.y/f.extent);if(!inside(ll))continue;
          const id=`${ll[0].toFixed(6)},${ll[1].toFixed(6)}`;nodes.set(id,[id,...ll]);if(ids.at(-1)!==id)ids.push(id);
        }
        if(ids.length<2)continue;
        const key=[...ids].sort().join(';');if(seen.has(key))continue;seen.add(key);
        ways.push({id:ways.length,nodes:ids,name:tags.name||'',kind:tags.subclass||tags.class,layer:tags.layer||0,bridge:tags.brunnel==='bridge'});
      }
    }
  }
}
// Vector tiles simplify road geometry; split at same-level geometric crossings.
// Do not join overpasses to the roads beneath them.
const segments=[],grid=new Map(),scale=[101500,111200],cell=50;
for(const way of ways)for(let i=1;i<way.nodes.length;i++){
 const a=nodes.get(way.nodes[i-1]).slice(1),b=nodes.get(way.nodes[i]).slice(1);
 const s={way,i,a,b,cuts:[[0,way.nodes[i-1]],[1,way.nodes[i]]]};segments.push(s);
 const x0=Math.floor(a[0]*scale[0]/cell),x1=Math.floor(b[0]*scale[0]/cell),y0=Math.floor(a[1]*scale[1]/cell),y1=Math.floor(b[1]*scale[1]/cell);
 for(let x=Math.min(x0,x1);x<=Math.max(x0,x1);x++)for(let y=Math.min(y0,y1);y<=Math.max(y0,y1);y++){const key=x+','+y;if(!grid.has(key))grid.set(key,[]);grid.get(key).push(segments.length-1);}
}
const checked=new Set();
for(const list of grid.values())for(let i=0;i<list.length;i++)for(let j=i+1;j<list.length;j++){
 const ai=list[i],bi=list[j],key=ai<bi?ai+':'+bi:bi+':'+ai;if(checked.has(key))continue;checked.add(key);
 const a=segments[ai],b=segments[bi];if(a.way.layer!==b.way.layer||a.way.bridge!==b.way.bridge)continue;
 const rx=a.b[0]-a.a[0],ry=a.b[1]-a.a[1],sx=b.b[0]-b.a[0],sy=b.b[1]-b.a[1],den=rx*sy-ry*sx;if(Math.abs(den)<1e-14)continue;
 const qx=b.a[0]-a.a[0],qy=b.a[1]-a.a[1],t=(qx*sy-qy*sx)/den,u=(qx*ry-qy*rx)/den;
 if(t<-.00001||t>1.00001||u<-.00001||u>1.00001)continue;
 const ll=[a.a[0]+t*rx,a.a[1]+t*ry],id=ll.map(v=>v.toFixed(6)).join(',');nodes.set(id,[id,...ll]);a.cuts.push([t,id]);b.cuts.push([u,id]);
}
const byWay=new Map();for(const s of segments){if(!byWay.has(s.way))byWay.set(s.way,[]);byWay.get(s.way).push(...s.cuts.sort((a,b)=>a[0]-b[0]).map(c=>c[1]));}
for(const way of ways)way.nodes=byWay.get(way).filter((id,i,list)=>i===0||id!==list[i-1]);
const uniquePois=[...new Map(pois.map(p=>[p.name+':'+p.ll.map(x=>x.toFixed(4)).join(','),p])).values()];
await fs.writeFile('public/data/travel-network.json',JSON.stringify({source:metadata.tiles[0],license:'ODbL-1.0',preparedAt:new Date().toISOString(),snapshot:'2026-09-13',bbox,nodes:[...nodes.values()],ways}));
await fs.writeFile('public/data/travel-osm-places.json',JSON.stringify(uniquePois,null,2));
console.log(`Detailed streets: ${nodes.size} nodes / ${ways.length} ways / ${uniquePois.length} places`);
console.log(uniquePois.filter(p=>/日光岩|菽庄|皓月|八卦楼|海天堂|三丘田|内厝澳|东渡|国际邮轮|第一码头|轮渡码头|中山路|八市|第八市場|第八市场|镇邦|江夏堂|新街|林巧稚|毓园|龙头路|最美转角|港仔后|钢琴博物馆/.test(p.name)).map(p=>({name:p.name,ll:p.ll,kind:p.tags.subclass})));
