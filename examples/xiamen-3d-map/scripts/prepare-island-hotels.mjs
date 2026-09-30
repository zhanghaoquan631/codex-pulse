import fs from 'node:fs';
import {VectorTile} from '@mapbox/vector-tile';
import Pbf from 'pbf';
import {prepareWaterContains} from '../water-query.mjs';
const data=JSON.parse(fs.readFileSync('public/data/xiamen.json','utf8'));
const detail=JSON.parse(fs.readFileSync('public/data/island-detail.json','utf8'));
const onIsland=prepareWaterContains(detail.shoreline),hotels=new Map(),excluded=[];
for(const name of fs.readdirSync('.cache').filter(n=>/^vector-14-\d+-\d+\.pbf$/.test(n)).sort()){
 const [,x,y]=name.match(/vector-14-(\d+)-(\d+)/).map(Number);
 const layer=new VectorTile(new Pbf(fs.readFileSync('.cache/'+name))).layers.poi;if(!layer)continue;
 for(let i=0;i<layer.length;i++){
  const f=layer.feature(i),p=f.properties;if(p.class!=='lodging')continue;
  const g=f.toGeoJSON(x,y,14);if(g.geometry.type!=='Point')continue;
  const ll=g.geometry.coordinates,world=[(ll[0]-data.meta.origin[0])*data.meta.sx,(data.meta.origin[1]-ll[1])*data.meta.sz];
  if(!onIsland(...world))continue;
  const label=p.name||p['name:zh']||p['name:en'];
  if(!label||/宿舍|教职工住宅|餐厅|宴集/.test(label)){excluded.push({name:label||null,ll,reason:label?'non-public-lodging':'unnamed'});continue;}
  const key=label+':'+ll.map(n=>n.toFixed(5)).join(',');
  hotels.set(key,{id:'hotel-'+String(f.id||Math.round(ll[0]*1e6)+'-'+Math.round(ll[1]*1e6)),name:label,ll:ll.map(n=>+n.toFixed(7)),kind:p.subclass,source:'https://www.openstreetmap.org/?'+new URLSearchParams({mlat:ll[1].toFixed(7),mlon:ll[0].toFixed(7)})+'#map=19/'+ll[1].toFixed(7)+'/'+ll[0].toFixed(7)});
 }
}
let snapshot='2026-09-13',source=data.meta.vectorSource;
if(fs.existsSync('.cache/island-lodging-osm.json')){
 const live=JSON.parse(fs.readFileSync('.cache/island-lodging-osm.json','utf8'));
 if(!Array.isArray(live.elements)||!live.elements.length)throw new Error('Invalid lodging snapshot');
 snapshot=(live.retrievedAt||live.osm3s?.timestamp_osm_base||'').slice(0,10);
 if(!/^\d{4}-\d{2}-\d{2}$/.test(snapshot))throw new Error('Lodging snapshot date missing');
 source=live.source||'https://overpass-api.de/api/interpreter';
 hotels.clear();excluded.length=0;
 for(const p of live.elements){
  const lon=p.lon??p.center?.lon,lat=p.lat??p.center?.lat,t=p.tags||{};
  if(!Number.isFinite(lon)||!Number.isFinite(lat))continue;
  const ll=[lon,lat],world=[(lon-data.meta.origin[0])*data.meta.sx,(data.meta.origin[1]-lat)*data.meta.sz];
  if(!onIsland(...world))continue;
  const name=t.name||t['name:zh']||t['name:en'];
  const complexReference=name==='林氏宴集(林氏府公馆酒店)';
  if(!name||(!complexReference&&/宿舍|教职工住宅|餐厅|宴集/.test(name))){excluded.push({name:name||null,ll,reason:name?'non-public-lodging':'unnamed'});continue;}
  hotels.set(p.type+':'+p.id,{id:p.type==='node'?'hotel-'+(p.id*10+1):'hotel-'+p.type+'-'+p.id,name,ll,kind:t.tourism,
   source:'https://www.openstreetmap.org/'+p.type+'/'+p.id,
   mappedAddress:[t['addr:street'],t['addr:housenumber']].filter(Boolean).join(' '),
   mappedAt:p.timestamp,
   coordinateNote:complexReference?'坐标为林氏府园区内餐厅参考点，并非已核验酒店前台或入住入口。':undefined});
 }
}
const rows=[...hotels.values()].sort((a,b)=>a.name.localeCompare(b.name,'zh-CN'));
const ids=new Set();for(const h of rows){if(ids.has(h.id))h.id+='-'+Math.round(h.ll[0]*1e7)+'-'+Math.round(h.ll[1]*1e7);ids.add(h.id);}
const result={snapshot,processedOn:'2026-09-28',source,license:'ODbL-1.0',coverage:'鼓浪屿海岸边界内公开地图已命名住宿点；不是实时营业或完整许可名录。',hotels:rows,excluded};
fs.writeFileSync('public/data/island-hotels.json',JSON.stringify(result));
console.log(JSON.stringify({snapshot,count:rows.length,excluded:excluded.length,source}));
