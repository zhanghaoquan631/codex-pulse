/** Runtime building durability and collapse. Authored geometry is never mutated.
 * Call initializeStructures after the engine normalizes wall bases to world Y.
 * All public mutation functions return ordinary event objects, not game status.
 */
import {groundHeight} from './landforms.mjs';
import {bodySpaceFree} from './combat-navigation.mjs';
import {boxLocalPoint} from './camera-math.mjs';
import {inPolygon} from './map-geometry.mjs';

export const COLLAPSE_WARNING_SECONDS=3.5;
const cache=new WeakMap(),finite=(v,f=0)=>Number.isFinite(v)?v:f;
const clamp=(v,a,b)=>Math.max(a,Math.min(b,v));
const base=(level,w)=>w.groundOffset!==undefined?groundHeight(level,w.x,w.z)+w.groundOffset:finite(w.baseY);
const event=(type,text,s,extra={})=>({type,text,structureId:s.id,name:s.name,hp:s.hp,maxHp:s.maxHp,...extra});
const pillar=w=>w.loadBearing===true||/column|pillar|post/.test(w.kind||'');

function boxFootprint(box){
  const c=Math.cos(box.rotation||0),s=Math.sin(box.rotation||0);
  return [[-1,-1],[1,-1],[1,1],[-1,1]].map(([u,v])=>({x:box.x+c*u*box.w/2+s*v*box.d/2,z:box.z-s*u*box.w/2+c*v*box.d/2}));
}
function groundFootprints(walls,room){
  if(room)return [boxFootprint(room)];
  // Recover only a proven closed source-edge chain. A convex hull or bounding
  // box across a concave mapped building could otherwise open adjacent water.
  if(walls.length>=3&&walls.every(w=>/osm-edge|mapped-building|jieyang-building|park-historic/.test(w.kind||''))){
    const segments=walls.map(w=>{const dx=Math.cos(w.rotation||0)*w.w/2,dz=-Math.sin(w.rotation||0)*w.w/2;return[{x:w.x-dx,z:w.z-dz},{x:w.x+dx,z:w.z+dz}];});
    const same=(a,b)=>Math.hypot(a.x-b.x,a.z-b.z)<.002,unused=new Set(segments.keys()),loops=[];
    while(unused.size){
      const first=unused.values().next().value,points=[...segments[first]];unused.delete(first);
      while(!same(points[0],points.at(-1))){
        const next=[...unused].find(i=>segments[i].some(p=>same(p,points.at(-1))));if(next===undefined)break;
        const pair=segments[next];points.push(same(pair[0],points.at(-1))?pair[1]:pair[0]);unused.delete(next);
      }
      if(points.length<4||!same(points[0],points.at(-1))){loops.length=0;break;}loops.push(points.slice(0,-1));
    }
    if(loops.length)return [...loops,...walls.map(boxFootprint)];
  }
  return walls.map(boxFootprint);
}

function groupFor(w){
  if(w.kind==='player-block')return `block:${w.id}`;
  const id=w.id||'',kind=w.kind||'';
  if(/^task-arcade-(tea|craft)-/.test(id))return `structure:${id.replace(/-(upper|back|column--?\d+)$/,'')}`;
  // These solids define unavailable terrain and the password objective. Their
  // removal would let a stray shot open a route without solving its keys.
  if(w.indestructible||/invisible|visible-boundary|water|railing|boundary|fence|rock|basin|task/.test(kind)||/warehouse|(?:^|-)task(?:-|$)|^na-room-/.test(id)||(!w.roomId&&/(?:^|-)room-(?:roof|n|s|w|e|west|east|north|south|front|back)(?:-|$)/.test(id)))return null;
  if(w.roomId)return `structure:${w.roomId}`;
  if(kind.startsWith('traversal-'))return null;
  if(/^tea-(north|south|west|east)/.test(id))return 'structure:task-arcade-tea';
  if(/^craft-(north|south|west|east)/.test(id))return 'structure:task-arcade-craft';
  if(/^(street|task)-arcade-/.test(id))return `structure:${id.replace(/-(upper|back|column--?\d+)$/,'')}`;
  if(kind==='park-pavilion-column')return 'structure:park-pavilion';
  if(kind==='park-historic')return 'structure:nansheng';
  let m=id.match(/^(gq-pavilion-\d+)-/);if(m)return `structure:${m[1]}`;
  if(/^gq-city-/.test(id))return 'structure:gq-city-gate';
  m=id.match(/^(jieyang-building-\d+)-/);if(m)return `structure:${m[1]}`;
  m=id.match(/^(.+-osm-\d+)-\d+$/);if(m)return `structure:${m[1]}`;
  if(/^cuihu-pavilion-/.test(id))return 'structure:cuihu-pavilion';
  m=id.match(/^(.+)-watch-(roof|post.*)$/);if(m)return `structure:${m[1]}-watch`;
  m=id.match(/^(daoyun-ring-\d+)-/);if(m)return `structure:${m[1]}`;
  m=id.match(/^(jinghai-wall-\d+)-/);if(m)return `structure:${m[1]}`;
  return `structure:${id}`;
}
function structureName(id,walls,room){
  if(room)return room.label||'补给楼';
  if(id.startsWith('block:'))return '搭建方块';
  if(id.includes('arcade'))return '街巷骑楼';
  if(id.includes('pavilion'))return '沿路亭阁';
  if(id.includes('nansheng'))return '南生百货';
  if(walls.every(pillar))return '承重支柱';
  if(walls.some(w=>/crate|cover|counter|stand/.test(w.kind||'')))return '路边掩体';
  return walls[0]?.label||'沿路建筑';
}
function indexes(level){
  let entry=cache.get(level);
  if(!entry||entry.walls!==level.walls||entry.length!==level.walls.length||entry.structures!==level.structures){
    entry={walls:level.walls,length:level.walls.length,structures:level.structures,byWall:new Map(level.walls.map(w=>[w.id,w])),byStructure:new Map((level.structures||[]).map(s=>[s.id,s]))};cache.set(level,entry);
  }
  return entry;
}
function changed(level){level.structureRevision=(level.structureRevision||0)+1;cache.delete(level);}
function groundSpot(level,preferred){
  for(const origin of preferred.filter(Boolean)){
    for(const radius of[0,.55,1.1,1.8,2.8,4,6,9,13]){
      const count=radius?16:1;
      for(let i=0;i<count;i++){
        const x=origin.x+Math.cos(i*Math.PI*2/count)*radius,z=origin.z+Math.sin(i*Math.PI*2/count)*radius,y=groundHeight(level,x,z);
        if(bodySpaceFree(level,{x,z,absoluteY:y},.36,1.7))return{x,y,z};
      }
    }
  }
  return null;
}

/** Idempotently register ordinary buildings, pillars and newly placed blocks.
 * Existing hp/timers and rescued survivor state survive a second registration.
 */
export function initializeStructures(level,index=0){
  level.walls??=[];level.doors??=[];level.structures??=[];level.survivors??=[];
  const old=new Map(level.structures.map(s=>[s.id,s])),groups=new Map(),rooms=new Map((level.traversal?.rooms||[]).map(r=>[r.id,r]));
  for(const w of level.walls){
    const id=groupFor(w);if(!id)continue;w.structureId=id;w.destructible=true;
    if(!groups.has(id))groups.set(id,[]);groups.get(id).push(w);
  }
  const result=[];
  for(const [id,walls]of groups){
    const room=rooms.get(walls[0].roomId),prior=old.get(id);
    const volume=walls.reduce((sum,w)=>sum+finite(w.w,1)*finite(w.d,1)*finite(w.height,1),0),block=walls[0].kind==='player-block';
    const maxHp=block?finite(walls[0].maxHp,160):Math.round((room?720:clamp(180+Math.cbrt(volume)*55,180,1500))*(1+index*.08));
    const s=prior||{id,name:structureName(id,walls,room),kind:block?'block':room?'room':'building',hp:block?clamp(finite(walls[0].hp,maxHp),0,maxHp):maxHp,maxHp,status:'standing',collapseRemaining:0,roomId:room?.id,parts:{}};
    s.wallIds=walls.map(w=>w.id);s.parts??={};
    // Retain the original footprint when a second registration happens after
    // individual pillars have already broken.
    s.groundFootprints??=groundFootprints(walls,room);
    s.x=room?.x??walls.reduce((n,w)=>n+w.x,0)/walls.length;s.z=room?.z??walls.reduce((n,w)=>n+w.z,0)/walls.length;
    s.y=Math.min(...walls.map(w=>base(level,w)));s.width=room?.w??Math.max(...walls.map(w=>w.w));s.depth=room?.d??Math.max(...walls.map(w=>w.d));s.rotation=room?.rotation??walls[0].rotation??0;
    for(const w of walls){
      if(pillar(w))s.parts[w.id]??={hp:Math.round(85*(1+index*.08)),maxHp:Math.round(85*(1+index*.08)),destroyed:false};
      const part=s.parts[w.id];if(part){w.partHp=part.hp;w.partMaxHp=part.maxHp;}
      w.hp=block?s.hp:part?.hp??s.hp;w.maxHp=block?s.maxHp:part?.maxHp??s.maxHp;
    }
    result.push(s);
  }
  // A collapsed record remains available for scene synchronization and history.
  for(const s of old.values())if(s.status==='collapsed'&&!groups.has(s.id))result.push(s);
  level.structures=result;level.structureRevision??=0;level.structureChapterIndex=index;cache.delete(level);
  if(!level.survivors.length){
    const room=(level.traversal?.rooms||[])[0],s=room&&result.find(s=>s.roomId===room.id);
    if(room&&s){
      const c=Math.cos(room.rotation||0),sn=Math.sin(room.rotation||0),candidates=[];
      for(const [u,v]of[[.25,-.55],[room.w/2-.8,0],[.25,room.d/2-1.1],[-.1,-room.d/2+1]])candidates.push({x:room.x+c*u+sn*v,z:room.z-sn*u+c*v});
      let p=null;for(const q of candidates){const y=groundHeight(level,q.x,q.z);if(bodySpaceFree(level,{...q,absoluteY:y},.36,1.7)){p={...q,y};break;}}
      // A bounded interior search never places the survivor outside the room.
      if(!p)for(let u=-room.w/2+.55;u<room.w/2-.5&&!p;u+=.45)for(let v=-room.d/2+.55;v<room.d/2-.5;v+=.45){
        const q={x:room.x+c*u+sn*v,z:room.z-sn*u+c*v},y=groundHeight(level,q.x,q.z);if(bodySpaceFree(level,{...q,absoluteY:y},.36,1.7)){p={...q,y};break;}
      }
      if(p)level.survivors.push({id:`survivor:${level.id}`,structureId:s.id,name:'受困旅人',...p,alive:true,rescued:false,roomId:room.id});
    }
  }
  return level.structures;
}

function relocateCollectibles(level,s,removed,room){
  const moved=[];
  for(const item of [...(level.collectibles||[]),...(level.hunt?.letterDrops||[])]){
    if(item.collected&&item.id!==level.hunt?.riddleSiteId)continue;
    const inFootprint=(s.groundFootprints||[]).some(points=>inPolygon(item.x,item.z,points));
    if(!(s.roomId&&item.roomId===s.roomId)&&!removed.has(item.supportId)&&!inFootprint)continue;
    const p=groundSpot(level,[room?.entry,item,room?.rearEntry,level.spawn]);if(!p)continue;
    Object.assign(item,p,{absoluteY:true,droppedFromStructure:s.id});delete item.roomId;delete item.supportId;moved.push(item.id);
  }
  return moved;
}
function collapse(level,s,context={}){
  if(s.status==='collapsed')return [];
  s.status='collapsed';s.hp=0;s.collapseRemaining=0;
  const removed=new Set(s.wallIds),room=(level.traversal?.rooms||[]).find(r=>r.id===s.roomId);
  level.walls=level.walls.filter(w=>!removed.has(w.id));
  if(level.traversal){
    for(const key of['floors','ramps','vaults','chipSpawns'])if(level.traversal[key])level.traversal[key]=level.traversal[key].filter(item=>!(s.roomId&&item.roomId===s.roomId)&&!removed.has(item.id)&&!removed.has(item.supportId));
    if(room)room.collapsed=true;
  }
  if(level.spawnSites)level.spawnSites=level.spawnSites.filter(item=>!(s.roomId&&item.roomId===s.roomId)&&!removed.has(item.supportId));
  // Navigation consumes these precise, newly uncovered building footprints;
  // it still checks water, immutable blockers and the original outer bounds.
  if(s.kind!=='block'){
    level.collapsedGround??=[];
    for(const points of s.groundFootprints||[])level.collapsedGround.push({structureId:s.id,points});
  }
  changed(level);
  const movedCollectibleIds=relocateCollectibles(level,s,removed,room);
  const events=[event('structural-collapsed',s.kind==='block'?'搭建方块破碎。':`${s.name}倒塌了，附近失去支撑。`,s,{removedWallIds:[...removed],movedCollectibleIds,owner:context.owner,point:context.point||{x:s.x,y:s.y,z:s.z}})];
  for(const survivor of level.survivors||[])if(survivor.alive&&!survivor.rescued&&(s.groundFootprints||[]).some(points=>inPolygon(survivor.x,survivor.z,points))){
    survivor.alive=false;events.push(event('survivor-lost',`${s.name}倒塌，${survivor.name}未能获救，本关失败。`,s,{survivorId:survivor.id,survivorName:survivor.name}));
  }
  return events;
}
function unsupportedBlocks(level){
  const events=[];let again=true;
  if(level.walls.some(w=>w.kind==='player-block'&&!w.structureId))initializeStructures(level,level.structureChapterIndex||0);
  while(again){
    again=false;
    for(const w of [...level.walls]){
      if(w.kind!=='player-block')continue;
      const bottom=base(level,w);if(bottom<=groundHeight(level,w.x,w.z)+.12)continue;
      const supported=level.walls.some(q=>q!==w&&q.kind!=='invisible'&&Math.abs(base(level,q)+q.height-bottom)<=.14&&(()=>{
        const p=boxLocalPoint(w,q);return Math.abs(p.x)<q.w/2+w.w/2-.08&&Math.abs(p.z)<q.d/2+w.d/2-.08;
      })());
      if(supported)continue;
      const s=indexes(level).byStructure.get(w.structureId);if(!s)continue;events.push(...collapse(level,s,{owner:'gravity'}));again=true;
    }
  }
  return events;
}

/** Both player and enemy impacts use the same durability calculation. */
export function damageStructure(level,wallId,damage,context={}){
  if(!Number.isFinite(damage)||damage<=0)return [];
  if(!level.structures)initializeStructures(level,level.structureChapterIndex||0);
  let entry=indexes(level),wall=entry.byWall.get(wallId);if(!wall)return [];
  if(!wall.structureId){if(!groupFor(wall))return [];initializeStructures(level,level.structureChapterIndex||0);entry=indexes(level);wall=entry.byWall.get(wallId);}
  const s=entry.byStructure.get(wall.structureId);if(!s||s.status!=='standing')return [];
  const actual=Math.min(s.hp,damage);s.hp=Math.max(0,s.hp-damage);wall.hp=s.hp;
  const events=[event('structural-hit',`${s.name}受到冲击。`,s,{wallId,damage:actual,owner:context.owner,point:context.point})];
  const part=s.parts[wallId];
  if(part&&!part.destroyed){
    part.hp=Math.max(0,part.hp-damage);wall.partHp=part.hp;wall.hp=part.hp;
    if(part.hp===0){
      part.destroyed=true;level.walls=level.walls.filter(w=>w.id!==wallId);changed(level);
      Object.assign(events[0],{partDestroyed:true,removedWallIds:[wallId]});
      if(Object.values(s.parts).every(p=>p.destroyed))s.hp=0;
    }
  }
  if(s.hp===0){
    if(s.kind==='block'){events.push(...collapse(level,s,context),...unsupportedBlocks(level));return events;}
    s.status='warning';s.collapseRemaining=COLLAPSE_WARNING_SECONDS;
    events.push(event('structural-warning',`${s.name}即将倒塌！${COLLAPSE_WARNING_SECONDS}秒内救出旅人并离开。`,s,{wallId,owner:context.owner,collapseRemaining:s.collapseRemaining,point:context.point||{x:s.x,y:s.y,z:s.z}}));
  }
  if(events[0]?.partDestroyed)events.push(...unsupportedBlocks(level));
  return events;
}

/** Advance only during active play; caller pauses this clock with the game. */
export function stepStructures(level,dt){
  if(!Number.isFinite(dt)||dt<=0)return [];
  const events=[];
  for(const s of level.structures||[])if(s.status==='warning'){
    s.collapseRemaining=Math.max(0,s.collapseRemaining-dt);
    if(s.collapseRemaining<=1e-8)events.push(...collapse(level,s));
  }
  if(events.some(e=>e.type==='structural-collapsed'))events.push(...unsupportedBlocks(level));
  return events;
}
