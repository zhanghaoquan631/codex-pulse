import {mkdir,writeFile} from 'node:fs/promises';
const query='[out:json][timeout:45];nwr["tourism"~"^(hotel|hostel|guest_house|motel|apartment)$"](24.437,118.050,24.458,118.075);out center tags;';
if(process.argv.includes('--osm-map')){
 const source='https://api.openstreetmap.org/api/0.6/map.json?bbox=118.050,24.437,118.075,24.458';
 const r=await fetch(source,{headers:{'User-Agent':'XiamenAtlasLocal/1.0'},signal:AbortSignal.timeout(45000)});
 if(!r.ok)throw new Error('OSM island map returned '+r.status);
 const map=await r.json(),nodes=new Map(map.elements.filter(p=>p.type==='node').map(p=>[p.id,p]));
 const elements=map.elements.filter(p=>/^(hotel|hostel|guest_house|motel|apartment)$/.test(p.tags?.tourism)).map(p=>{
  const members=(p.nodes||[]).map(id=>nodes.get(id)).filter(Boolean);
  const center=members.length?{lon:members.reduce((n,p)=>n+p.lon,0)/members.length,lat:members.reduce((n,p)=>n+p.lat,0)/members.length}:null;
  return {type:p.type,id:p.id,lat:p.lat,lon:p.lon,center,tags:p.tags,timestamp:p.timestamp};
 });
 await mkdir('.cache',{recursive:true});await writeFile('.cache/island-lodging-osm.json',JSON.stringify({source,retrievedAt:new Date().toISOString(),elements}));
 console.log(JSON.stringify({source,count:elements.length,named:elements.filter(p=>p.tags?.name).length}));
 process.exit(0);
}
const url='https://overpass-api.de/api/interpreter';
const response=await fetch(url,{method:'POST',headers:{'Content-Type':'application/x-www-form-urlencoded','User-Agent':'XiamenAtlasLocal/1.0'},body:new URLSearchParams({data:query}),signal:AbortSignal.timeout(65000)});
if(!response.ok)throw new Error('OSM lodging query returned '+response.status);
const data=await response.json();if(!Array.isArray(data.elements)||data.remark)throw new Error('Incomplete OSM lodging response');
await mkdir('.cache',{recursive:true});await writeFile('.cache/island-lodging-osm.json',JSON.stringify(data));
console.log(JSON.stringify({date:data.osm3s?.timestamp_osm_base,count:data.elements.length,named:data.elements.filter(p=>p.tags?.name).length}));
