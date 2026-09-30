/** Playable interiors are authored game spaces, never surveyed private rooms.
 * Existing mapped buildings and quest sites retain their geographic positions.
 * All traversal heights and supply heights are absolute world metres.
 */
import {groundHeight} from './landforms.mjs';
import {smallParkLayout} from './small-park-scene.mjs';
import {eastLayouts} from './east-chapters.mjs';

export function buildingPoint(room,u,v,y=0){
  const c=Math.cos(room.rotation||0),s=Math.sin(room.rotation||0);
  return {x:room.x+c*u+s*v,y,z:room.z-s*u+c*v};
}

const labels={
  'small-park':'南支路骑楼补给屋',guangji:'西桥头补给楼','jieyang-tower':'楼前巡灯补给屋',lighthouse:'海岸守望补给屋',
  'puning-deanli':'德安里院旁补给楼','chaoyang-wenguang':'棉城街角补给楼','chaonan-cuihu':'翠湖岸边补给楼','chenghai-chen':'旧厝旁补给楼',
  'chaoan-tianchi':'天池山径补给楼','raoping-daoyun':'道韵外廊补给楼','huilai-jinghai':'靖海沿路补给楼','jiexi-falls':'山径观瀑补给楼',
};

function specification(level){
  if(level.id==='small-park'){
    const a=smallParkLayout.arcades.find(a=>a.id==='street-arcade-147133472-0-23--1');
    return {...a,replacementId:a.id,replacePrefix:`${a.id}-`,replacementType:'arcade'};
  }
  const loose={guangji:{x:-73,z:9,rotation:Math.PI},'jieyang-tower':{x:95,z:-7,rotation:Math.PI},lighthouse:{x:53,z:5,rotation:Math.PI}}[level.id];
  if(loose)return {...loose,w:7,d:7};
  // The previous valley watch canopy straddles a mapped stream crossing. Keep
  // it intact and place this room on the existing dry approach farther south.
  if(level.id==='jiexi-falls')return {x:14.354253879492456,z:65.37259360737652,rotation:-3.11739017881645,w:6.6,d:7.2};
  const old=level.walls.find(w=>w.id.endsWith('-lookout-1'));
  if(old){
    const rotation={'puning-deanli':Math.PI,'chaoyang-wenguang':-Math.PI/2,'chaonan-cuihu':0,'chenghai-chen':0}[level.id]||0;
    return {x:old.x,z:old.z,w:old.w,d:old.d,rotation,replacementId:old.id,replacementType:'building'};
  }
  const shelter=eastLayouts[level.id]?.watchShelters?.[0];
  if(shelter)return {...shelter,w:6.6,d:7.2,replacementId:shelter.roofId,replacePrefix:`${level.id}-watch-`,replacementType:'shelter'};
  return null;
}

/** Pure, idempotent enrichment; neither rawLevel nor source layouts are edited. */
export function enrichBuildingInteriors(rawLevel,index=0){
  if(rawLevel.traversal?.interiorVersion===1)return rawLevel;
  const spec=specification(rawLevel);if(!spec)return rawLevel;
  const level={...rawLevel,walls:[...(rawLevel.walls||[])],collectibles:[...(rawLevel.collectibles||[])],spawnSites:[...(rawLevel.spawnSites||[])]};
  const prefix=`${level.id}-explore`,room={...spec,id:prefix,label:labels[level.id]||'旅路补给楼',fictional:true,sourceNote:'游戏室内与楼梯，非实测建筑内部'};
  const traversal={interiorVersion:1,floors:[],ramps:[],vaults:[],rooms:[room],chipSpawns:[],replacedArcadeIds:[],replacedBuildingIds:[],replacedShelterIds:[]};
  level.traversal=traversal;
  if(spec.replacementId){
    level.walls=level.walls.filter(w=>w.id!==spec.replacementId&&!(spec.replacePrefix&&w.id.startsWith(spec.replacePrefix)));
    level.spawnSites=level.spawnSites.filter(s=>s.supportId!==spec.replacementId&&s.id!==`perch-${spec.replacementId}`);
    traversal[spec.replacementType==='arcade'?'replacedArcadeIds':spec.replacementType==='shelter'?'replacedShelterIds':'replacedBuildingIds'].push(spec.replacementId);
  }
  const hw=room.w/2,hd=room.d/2,edge=.18,point=(u,v,y)=>buildingPoint(room,u,v,y);
  // Older solid lookout blocks only exposed a narrow perimeter to navigation.
  // Reusing those authored footprints now also opens their interior and apron.
  if(spec.replacementType==='building'&&level.walkablePolygons?.length){
    level.walkablePolygons=[...level.walkablePolygons,[point(-hw-.9,-hd-.9),point(hw+.9,-hd-.9),point(hw+.9,hd+.9),point(-hw-.9,hd+.9)]];
  }
  const samples=[];
  for(const u of[-hw,0,hw])for(const v of[-hd,0,hd]){const p=point(u,v);samples.push(groundHeight(level,p.x,p.z));}
  const low=Math.min(...samples)-.06,upper=Math.max(...samples)+3.2,roof=spec.replacementType==='arcade'?Math.max(spec.height,upper+3.15):upper+3.1;
  Object.assign(room,{groundY:low+.06,upperY:upper,roofY:roof,windows:[],entry:point(0,hd+.9),rearEntry:point(0,-hd-.9)});
  room.entry.y=groundHeight(level,room.entry.x,room.entry.z);room.rearEntry.y=groundHeight(level,room.rearEntry.x,room.rearEntry.z);
  const wall=(suffix,u,v,w,d,baseY,height,kind='traversal-wall')=>{
    const p=point(u,v),item={id:`${prefix}-${suffix}`,x:p.x,z:p.z,w,d,rotation:room.rotation||0,baseY,height,groundOffset:baseY-groundHeight(level,p.x,p.z),absoluteBaseY:true,kind,roomId:prefix,fictional:true};
    level.walls.push(item);return item;
  };
  const floor=(suffix,u,v,w,d,y)=>{
    const p=point(u,v),id=`${prefix}-${suffix}`;
    traversal.floors.push({id,x:p.x,z:p.z,w,d,rotation:room.rotation||0,y,roomId:prefix});
    wall(suffix,u,v,w,d,y-.12,.12,'traversal-floor');return id;
  };
  // The entire stair shaft stays open. A separate rear landing joins the main
  // slab with overlap; walking up can never encounter a solid overhead slab.
  const mainLeft=-hw+1.94,mainRight=hw-.12;
  const mainFloor=floor('upper-main',(mainLeft+mainRight)/2,0,mainRight-mainLeft,room.d-.24,upper);
  floor('upper-landing',-hw+1.025,-hd+.70,1.93,1.16,upper);
  const stairU=-hw+1.025,startV=hd-.64,endV=-hd+1.25,stairLength=startV-endV,stair=point(stairU,(startV+endV)/2),start=point(stairU,startV),stairLow=groundHeight(level,start.x,start.z);
  traversal.ramps.push({id:`prefix-stairs`.replace('prefix',prefix),x:stair.x,z:stair.z,w:1.7,d:stairLength,rotation:room.rotation||0,fromY:stairLow,toY:upper,roomId:prefix,steps:Math.ceil((upper-stairLow)/.2)});
  room.stairBottom=point(stairU,startV+.08,stairLow);room.stairTop=point(stairU,endV-.3,upper);
  wall('roof',0,0,room.w+.12,room.d+.12,roof,.16,'traversal-roof');

  // Facades are partitioned around true holes, not textures painted on boxes.
  const facade=(name,axis,plane,length,bottom,top,holes)=>{
    const xs=[-length/2,length/2,...holes.flatMap(h=>[h.center-h.width/2,h.center+h.width/2])].filter(x=>x>=-length/2&&x<=length/2).sort((a,b)=>a-b);
    const ys=[bottom,top,...holes.flatMap(h=>[h.bottom,h.top])].filter(y=>y>=bottom&&y<=top).sort((a,b)=>a-b);
    let n=0;
    for(let i=1;i<xs.length;i++)for(let j=1;j<ys.length;j++){
      const a=xs[i-1],b=xs[i],c=ys[j-1],d=ys[j],u=(a+b)/2,y=(c+d)/2;
      if(b-a<.001||d-c<.001||holes.some(h=>Math.abs(u-h.center)<h.width/2-.001&&y>h.bottom&&y<h.top))continue;
      if(axis==='z')wall(`${name}-${n++}`,u,plane,b-a,edge,c,d-c);else wall(`${name}-${n++}`,plane,u,edge,b-a,c,d-c);
    }
    for(const h of holes)if(h.kind==='window')room.windows.push({axis,plane,...h});
  };
  const frontWindowU=hw-1.15,frontPoint=point(frontWindowU,hd),frontGround=groundHeight(level,frontPoint.x,frontPoint.z);
  const lowerWindow={kind:'window',center:frontWindowU,width:1.85,bottom:frontGround+.45,top:frontGround+2.65,vaultable:true};
  const door={kind:'door',center:-.15,width:1.85,bottom:low-.02,top:upper-.16};
  facade('lower-front','z',hd,room.w,low,upper-.12,[door,lowerWindow]);
  facade('lower-back','z',-hd,room.w,low,upper-.12,[door]);
  facade('lower-left','x',-hw,room.d,low,upper-.12,[]);
  facade('lower-right','x',hw,room.d,low,upper-.12,[]);
  const upperWindows=[{kind:'window',center:.1,width:1.7,bottom:upper+.5,top:upper+2.7},{kind:'window',center:hw-1.05,width:1.7,bottom:upper+.5,top:upper+2.7}];
  facade('upper-front','z',hd,room.w,upper,roof,upperWindows);
  facade('upper-back','z',-hd,room.w,upper,roof,[{...upperWindows[0],center:0}]);
  facade('upper-left','x',-hw,room.d,upper,roof,[{kind:'window',center:0,width:1.8,bottom:upper+.5,top:upper+2.7}]);
  facade('upper-right','x',hw,room.d,upper,roof,[{kind:'window',center:0,width:1.8,bottom:upper+.5,top:upper+2.7}]);
  const outside=point(frontWindowU,hd+.66),inside=point(frontWindowU,hd-.66);
  outside.y=groundHeight(level,outside.x,outside.z);inside.y=groundHeight(level,inside.x,inside.z);
  traversal.vaults.push({id:`${prefix}-low-window`,name:'低窗 · 翻入 / 翻出',from:outside,to:inside,radius:1.5,clearanceY:lowerWindow.bottom,apertureTopY:lowerWindow.top,roomId:prefix});
  traversal.vaults.push({id:`${prefix}-upper-window-drop`,name:'二楼低窗 · 翻出落地',from:point(.1,hd-.68,upper),to:point(.1,hd+.70,upper),radius:1.5,clearanceY:upper+.5,apertureTopY:upper+2.7,roomId:prefix,oneWay:true,drop:true});
  const supplies=[{suffix:'medical-cache',u:hw-.78,v:-hd+.78,supplyId:'medkit',name:'二楼药包'},{suffix:'bomb-cache',u:hw-.78,v:hd-.78,supplyId:'bomb',name:'二楼炸弹包'}];
  room.supplies=supplies.map(s=>({id:`${prefix}-${s.suffix}`,...point(s.u,s.v,upper),kind:'supply',supplyId:s.supplyId,amount:1,absoluteY:true,name:s.name,roomId:prefix}));
  level.collectibles.push(...room.supplies);
  room.windowPerches=upperWindows.map((h,i)=>({id:`${prefix}-window-${i+1}`,...point(h.center,hd-.7,upper),kind:'roof',supportId:mainFloor,perchLabel:'二楼窗口',stationary:true,fictional:true,roomId:prefix,radiusMax:.45}));
  level.spawnSites.push(...room.windowPerches);
  // Candidate chips are floor-supported and avoid stair voids and the two
  // fixed firing positions. The engine chooses a fresh subset each attempt.
  for(const u of[-.45,.55,1.55])for(const v of[-1.45,-.2,1.05]){
    const p=point(u,v,upper);
    if(u<mainLeft+.42||u>mainRight-.42||room.windowPerches.some(s=>Math.hypot(s.x-p.x,s.z-p.z)<.85))continue;
    traversal.chipSpawns.push({...p,roomId:prefix,supportId:mainFloor});
  }
  traversal.chipSpawns.push({...point(-hw+1.025,-hd+.7,upper),roomId:prefix,supportId:`${prefix}-upper-landing`});
  room.note='可穿过一楼；循左侧楼梯搜寻二楼物资，低窗可翻越，楼上窗口可能埋伏射手。';
  return level;
}
