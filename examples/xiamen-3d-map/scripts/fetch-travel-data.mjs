import {mkdir,writeFile} from 'node:fs/promises';

await mkdir('public/data',{recursive:true});
const bbox='24.436,118.052,24.492,118.096';
async function query(q){
  let error;
  for(const host of ['https://overpass-api.de/api/interpreter','https://overpass.kumi.systems/api/interpreter']){
    try{const url=new URL(host);url.searchParams.set('data',q);const r=await fetch(url,{signal:AbortSignal.timeout(90000)});if(!r.ok)throw new Error(`Overpass ${r.status}`);return await r.json();}catch(e){error=e;}
  }
  throw error;
}
const roads=await query(`[out:json][timeout:50];way["highway"~"^(footway|pedestrian|steps|path|residential|living_street|service|tertiary|secondary|unclassified)$"]["access"!~"^(private|no)$"]["foot"!="no"](${bbox});out body;>;out skel qt;`);
const nodes=roads.elements.filter(e=>e.type==='node').map(e=>[e.id,e.lon,e.lat]);
const ways=roads.elements.filter(e=>e.type==='way').map(e=>({id:e.id,nodes:e.nodes,name:e.tags.name||'',kind:e.tags.highway,foot:e.tags.foot||'',bridge:e.tags.bridge||'',access:e.tags.access||''}));
await writeFile('public/data/travel-network.json',JSON.stringify({source:'https://www.openstreetmap.org/copyright',license:'ODbL-1.0',retrievedAt:new Date().toISOString(),osmTimestamp:roads.osm3s?.timestamp_osm_base,bbox:[118.052,24.436,118.096,24.492],nodes,ways}));
console.log(`Walking network: ${nodes.length} nodes, ${ways.length} ways`);
const pois=await query(`[out:json][timeout:40];nwr["name"~"日光岩|菽庄|皓月|八卦楼|海天堂|三丘田|内厝澳|东渡客运|国际邮轮|第一码头|轮渡码头|中山路|八市|第八市场|镇邦|江夏堂|新街礼拜|林巧稚|龙头路|最美转角|港仔后|钢琴博物馆"](${bbox});out center tags;`);
const entries=pois.elements.map(e=>({id:`${e.type}/${e.id}`,name:e.tags.name,ll:[e.lon??e.center?.lon,e.lat??e.center?.lat],tags:e.tags}));
await writeFile('public/data/travel-osm-places.json',JSON.stringify({retrievedAt:new Date().toISOString(),entries},null,2));
console.log(entries.map(e=>`${e.id} | ${e.name} | ${e.ll.join(',')}`).join('\n'));
