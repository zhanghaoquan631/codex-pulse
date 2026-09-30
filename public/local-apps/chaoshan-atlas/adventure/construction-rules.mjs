/** Placement is computed from the actual aim ray and solid supports, in world metres. */
import {segmentBoxDistance,boxLocalPoint} from './camera-math.mjs';
import {groundHeight,segmentGroundDistance} from './landforms.mjs';
import {onMappedLand} from './map-geometry.mjs';
import {supportBelow,playerWorldY} from './traversal-physics.mjs';

export const BUILDING_BLOCK=Object.freeze({id:'building-block',name:'纸砖方块',size:1.2,maxHp:160,price:25,packSize:5,range:7,maxPlaced:80});
const finite=(x,d=0)=>Number.isFinite(x)?x:d;
const snap=x=>Math.round(x/BUILDING_BLOCK.size)*BUILDING_BLOCK.size;
const round=x=>Math.round(x*1000)/1000;
const solids=l=>[...l.walls,...l.doors.filter(d=>!d.open)];
const overlapHeight=(a,b)=>a.baseY<b.baseY+b.height-.025&&a.baseY+a.height>b.baseY+.025;

export function rectanglesOverlap(a,b,padding=0){
  const ac=Math.cos(a.rotation||0),as=Math.sin(a.rotation||0),bc=Math.cos(b.rotation||0),bs=Math.sin(b.rotation||0);
  const axes=[[ac,-as],[as,ac],[bc,-bs],[bs,bc]],dx=a.x-b.x,dz=a.z-b.z;
  for(const [x,z]of axes){
    const ar=Math.abs(x*ac-z*as)*a.w/2+Math.abs(x*as+z*ac)*a.d/2;
    const br=Math.abs(x*bc-z*bs)*b.w/2+Math.abs(x*bs+z*bc)*b.d/2;
    if(Math.abs(dx*x+dz*z)>=ar+br+padding-.025)return false;
  }
  return true;
}

function touchesBody(box,l,p,radius=.4,height=1.7){
  const y=p.absoluteY===true?p.y:groundHeight(l,p.x,p.z)+finite(p.y),dx=Math.max(0,Math.abs(p.x-box.x)-box.w/2),dz=Math.max(0,Math.abs(p.z-box.z)-box.d/2);
  return overlapHeight(box,{baseY:y,height})&&dx*dx+dz*dz<(radius+.08)**2;
}

function faceOf(point,box){
  const q=boxLocalPoint(point,box),faces=[['x',-1,Math.abs(q.x+box.w/2)],['x',1,Math.abs(q.x-box.w/2)],['z',-1,Math.abs(q.z+box.d/2)],['z',1,Math.abs(q.z-box.d/2)],['y',-1,Math.abs(point.y-box.baseY)],['y',1,Math.abs(point.y-box.baseY-box.height)]];
  faces.sort((a,b)=>a[2]-b[2]);return faces[0];
}

export function previewBuildingBlock(level,player,aim={}){
  const size=BUILDING_BLOCK.size,half=size/2,origin={x:player.x,y:playerWorldY(level,player)+1.3,z:player.z};
  const raw={x:finite(aim.aimX,finite(player.facingX)),y:finite(aim.aimY,-.24),z:finite(aim.aimZ,finite(player.facingZ,-1))},length=Math.hypot(raw.x,raw.y,raw.z);
  if(length<1e-6)return {ok:false,message:'先瞄准要放置的位置'};
  const dir={x:raw.x/length,y:raw.y/length,z:raw.z/length};
  let hit=null,near=BUILDING_BLOCK.range;
  for(const box of solids(level)){const distance=segmentBoxDistance(origin,dir,box,near);if(distance!==null&&distance<near){near=distance;hit=box;}}
  const ground=segmentGroundDistance(level,origin,dir,near,0);
  if(ground!==null&&ground<=near){near=ground;hit=null;}
  const hitPoint={x:origin.x+dir.x*near,y:origin.y+dir.y*near,z:origin.z+dir.z*near};
  let x,z,y;
  if(hit?.kind==='player-block'){
    const [axis,sign]=faceOf(hitPoint,hit);x=hit.x;z=hit.z;y=hit.baseY;
    if(axis==='y')y+=sign*size;else if(axis==='x')x+=sign*size;else z+=sign*size;
  }else{
    let point=hitPoint;
    if(!hit&&ground===null){const distance=Math.min(4,BUILDING_BLOCK.range);point={x:origin.x+dir.x*distance,z:origin.z+dir.z*distance};}
    if(hit){const [axis,sign]=faceOf(hitPoint,hit);if(axis==='y'&&sign===1)y=hit.baseY+hit.height;else point={x:hitPoint.x-dir.x*(half+.08),z:hitPoint.z-dir.z*(half+.08)};}
    x=snap(point.x);z=snap(point.z);
    if(y===undefined){const support=supportBelow(level,x,z,playerWorldY(level,player)+.4,0);y=support?.y??groundHeight(level,x,z);}
  }
  x=round(x);z=round(z);y=round(y);
  const result={ok:false,message:'',x,y,z,size,cellKey:`${x}:${y}:${z}`},box={x,z,w:size,d:size,baseY:y,height:size,rotation:0};
  const fail=message=>({...result,message});
  if(level.walls.filter(b=>b.kind==='player-block').length>=BUILDING_BLOCK.maxPlaced)return fail('本关最多放置 80 个方块');
  if(player.vault)return fail('翻窗结束后再建造');
  if(finite(player.buildingBlocks)<1)return fail('没有纸砖方块，请到营地购买');
  const b=level.bounds;
  if(x-half<b.minX||x+half>b.maxX||z-half<b.minZ||z+half>b.maxZ)return fail('不能建到地图边界外');
  if(y+size>groundHeight(level,x,z)+7.2+.025||y<groundHeight(level,x,z)-.1)return fail('堆叠高度不能超过地面 7.2 米');
  if(Math.hypot(x-origin.x,y+half-origin.y,z-origin.z)>BUILDING_BLOCK.range)return fail('位置太远，请靠近再放置');
  for(const dx of[-half+.03,0,half-.03])for(const dz of[-half+.03,0,half-.03]){
    const q={x:x+dx,z:z+dz};if(!onMappedLand(level,q.x,q.z,.03))return fail('不能在水面或地图外建造');
    const support=supportBelow(level,q.x,q.z,y+.05,0);
    if(!support||Math.abs(support.y-y)>.06)return fail('方块下方需要完整地面、楼板或已有方块支撑');
  }
  for(const solid of solids(level)){
    if((solid.kind==='invisible'||overlapHeight(box,solid))&&rectanglesOverlap(box,solid))return fail('这里与围墙、建筑或其他方块重叠');
  }
  for(const door of level.doors)if(rectanglesOverlap(box,door,.7)&&overlapHeight(box,door))return fail('请留出门口通道');
  const bodies=[player,...(level.evacuation?.people||[]).filter(p=>p.alive&&!p.evacuated&&!p.insideVehicleId),...(level.evacuation?.vehicles||[]).filter(p=>p.alive),...level.enemies.filter(e=>e.alive),...(level.escort?.alive?[level.escort]:[])];
  if(bodies.some(p=>touchesBody(box,level,p,finite(p.radius,.4),finite(p.height,1.7))))return fail('不能占用人物或怪物所在位置');
  // Future steps and relay destinations are required too: protecting only the
  // current moving marker would allow a player to bury the next task device.
  const journeySites=(level.journey?.steps||[]).filter(s=>!s.completed).flatMap(s=>[s,...(s.waypoints||[])]);
  const protectedItems=[...level.collectibles.filter(c=>!c.collected),...(level.expedition?.evidence||[]),...journeySites,...level.switches,...level.npcs,...(level.survivors||[]).filter(s=>s.alive&&!s.rescued).map(s=>({...s,absoluteY:true})),level.exit,...(level.hunt?.target?[level.hunt.target]:[])];
  if(protectedItems.some(p=>touchesBody(box,level,p,.95,2)))return fail('请留出线索、补给或任务地点的通道');
  if(level.evacuation?.safeZone&&Math.hypot(x-level.evacuation.safeZone.x,z-level.evacuation.safeZone.z)<level.evacuation.safeZone.radius+1)return fail('请留出平民撤离区');
  for(const vault of level.traversal?.vaults||[])for(let i=0;i<=4;i++){
    const t=i/4,p={x:vault.from.x+(vault.to.x-vault.from.x)*t,z:vault.from.z+(vault.to.z-vault.from.z)*t,y:Math.max(vault.from.y,vault.to.y),absoluteY:true};
    if(touchesBody(box,level,p,.6,2))return fail('请留出翻窗通道');
  }
  // The center ray must reach the proposed cell without crossing any older
  // wall. A block may never be constructed through an intervening facade.
  const target={x,y:y+half,z},ray={x:x-origin.x,y:target.y-origin.y,z:z-origin.z},distance=Math.hypot(ray.x,ray.y,ray.z);
  for(const solid of solids(level)){const stop=segmentBoxDistance(origin,ray,solid,distance);if(stop!==null&&stop<distance-.02)return fail('墙后的位置无法直接建造');}
  const terrainHit=segmentGroundDistance(level,origin,ray,distance,.01);if(terrainHit!==null&&terrainHit<distance-.02)return fail('地形遮挡了这个位置');
  return {...result,ok:true,message:'点击放置纸砖方块'};
}
