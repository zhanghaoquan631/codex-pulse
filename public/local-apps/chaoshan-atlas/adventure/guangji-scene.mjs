/** Original playable chapter over attributed OSM plan geometry. No survey heights. */
import {osmGuangjiWays,projectGuangji,GUANGJI_ORIGIN,GUANGJI_SCALE,GUANGJI_BOUNDS,GUANGJI_ATLAS_ANCHOR,GUANGJI_PROVENANCE} from './guangji-geo-data.mjs';

const way=id=>osmGuangjiWays.find(w=>w.id===id);
const points=id=>way(id).geometry.map(projectGuangji);
const mix=(a,b,t)=>({x:a.x+(b.x-a.x)*t,z:a.z+(b.z-a.z)*t});
const length=(a,b)=>Math.hypot(b.x-a.x,b.z-a.z);
const section=(id,kind)=>({id,kind,points:points(id)});
const bridgeSections=[section(149020288,'stone-west'),section(1446498664,'floating'),section(1446498663,'stone-east')];
const bridgePoints=bridgeSections.flatMap((s,i)=>i?s.points.slice(1):s.points);
const segments=ps=>ps.slice(1).map((b,i)=>({a:ps[i],b,length:length(ps[i],b)}));
const bridgeLength=segments(bridgePoints).reduce((a,s)=>a+s.length,0);
/** Distance fraction west→east; lateral is the left/north side of travel. */
function onLine(ps,t,lateral=0){
  const ss=segments(ps),total=ss.reduce((n,s)=>n+s.length,0);let remaining=Math.max(0,Math.min(1,t))*total;
  for(let i=0;i<ss.length;i++){
    const s=ss[i];if(remaining<=s.length||i===ss.length-1){const p=mix(s.a,s.b,remaining/s.length),dx=(s.b.x-s.a.x)/s.length,dz=(s.b.z-s.a.z)/s.length;return {...p,x:p.x+dz*lateral,z:p.z-dx*lateral,forwardX:dx,forwardZ:dz,rotation:Math.atan2(dx,dz)};}remaining-=s.length;
  }
}
export const guangjiPoint=(fraction,lateral=0)=>onLine(bridgePoints,fraction,lateral);

function clipSegment(a,b,bounds=GUANGJI_BOUNDS){
  let lo=0,hi=1;const dx=b.x-a.x,dz=b.z-a.z;
  for(const[p,q]of[[-dx,a.x-bounds.minX],[dx,bounds.maxX-a.x],[-dz,a.z-bounds.minZ],[dz,bounds.maxZ-a.z]]){
    if(Math.abs(p)<1e-10){if(q<0)return null;continue;}const t=q/p;if(p<0)lo=Math.max(lo,t);else hi=Math.min(hi,t);if(lo>hi)return null;
  }return{a:mix(a,b,lo),b:mix(a,b,hi)};
}
function clippedRoad(id,width,role){const w=way(id);return{id:`gq-road-${id}`,osmWayId:id,name:w.tags.name||'桥头步行连线',width,role,segments:segments(points(id)).map(s=>clipSegment(s.a,s.b)).filter(Boolean)};}
function bank(id){
  const b=GUANGJI_BOUNDS,out=[];
  for(const s of segments(points(id))){const cut=clipSegment(s.a,s.b,{minX:-1e6,maxX:1e6,minZ:b.minZ,maxZ:b.maxZ});if(!cut)continue;for(const p of[cut.a,cut.b])if(!out.some(q=>length(p,q)<1e-5))out.push(p);}
  return out.sort((a,b)=>a.z-b.z);
}
const westBank=bank(240485148),eastBank=bank(28577209),b=GUANGJI_BOUNDS;
const waterPolygon=[...westBank,...eastBank.slice().reverse()];
const landPolygons=[
  [{x:b.minX,z:b.minZ},...westBank,{x:b.minX,z:b.maxZ}],
  [...eastBank,{x:b.maxX,z:b.maxZ},{x:b.maxX,z:b.minZ}]
];
const roads=[clippedRoad(149020325,5.4,'old-city'),clippedRoad(622277164,6.8,'west-approach'),clippedRoad(149020322,6.8,'east-approach'),clippedRoad(632212399,5.8,'west-bank'),clippedRoad(383084251,6.2,'east-bank'),clippedRoad(824053638,6.2,'east-bank'),clippedRoad(604741719,5.4,'east-arrival'),clippedRoad(1029352236,5.4,'east-arrival'),clippedRoad(604741661,4.8,'temple-connection')].filter(r=>r.segments.length);
const gateFootprint=points(1030010813),gateCenter=gateFootprint.slice(0,-1).reduce((a,p)=>({x:a.x+p.x/4,z:a.z+p.z/4}),{x:0,z:0});
const gateRotation=Math.atan2(gateFootprint[1].x-gateFootprint[0].x,gateFootprint[1].z-gateFootprint[0].z);
const deckWidth=6.8;

function lineBox(id,a,b,width,height,extra={}){return{id,x:(a.x+b.x)/2,z:(a.z+b.z)/2,w:length(a,b),d:width,height,rotation:Math.atan2(-(b.z-a.z),b.x-a.x),...extra};}
function rect(id,x,z,w,d,height=3.5,extra={}){return{id,x,z,w,d,height,...extra};}
function inPolygon(p,polygon){let inside=false;for(let i=0,j=polygon.length-1;i<polygon.length;j=i++){const a=polygon[i],c=polygon[j];if((a.z>p.z)!==(c.z>p.z)&&p.x<(c.x-a.x)*(p.z-a.z)/(c.z-a.z)+a.x)inside=!inside;}return inside;}
function pointLineDistance(p,ps){return Math.min(...segments(ps).map(s=>{const dx=s.b.x-s.a.x,dz=s.b.z-s.a.z,t=Math.max(0,Math.min(1,((p.x-s.a.x)*dx+(p.z-s.a.z)*dz)/(s.length*s.length)));return length(p,mix(s.a,s.b,t));}));}

/** Conservative invisible water cells; coalesced by row. Visual shores remain OSM polylines. */
function waterBlockers(){
  const cells=[],step=1.2,rows=Math.ceil((b.maxZ-b.minZ)/step),columns=Math.ceil((b.maxX-b.minX)/step);
  const routes=[bridgePoints,...roads.filter(r=>r.role.includes('approach')).flatMap(r=>r.segments.map(s=>[s.a,s.b]))];
  for(let row=0;row<rows;row++){
    const z0=b.minZ+row*step,z1=Math.min(b.maxZ,z0+step);let run=-1;
    for(let col=0;col<=columns;col++){
      const x0=b.minX+col*step,x1=Math.min(b.maxX,x0+step),p={x:(x0+x1)/2,z:(z0+z1)/2};
      const filled=col<columns&&inPolygon(p,waterPolygon)&&routes.every(ps=>pointLineDistance(p,ps)>deckWidth/2+.75);
      if(filled&&run<0)run=col;
      if(!filled&&run>=0){const start=b.minX+run*step,end=Math.min(b.maxX,b.minX+col*step);cells.push(rect(`gq-water-${row}-${run}`,(start+end)/2,(z0+z1)/2,end-start,z1-z0,.15,{kind:'invisible'}));run=-1;}
    }
  }return cells;
}
const pavilions=[.055,.19,.50,.635,.78,.92].map((t,i)=>({...guangjiPoint(t),id:`gq-pavilion-${i}`,width:6.5,depth:i===2?4:3.6,height:3.8,variant:i%3}));
export function makeGuangjiWalls(){
  const walls=[...waterBlockers(),rect('gq-bound-w',b.minX,(b.minZ+b.maxZ)/2,.5,b.maxZ-b.minZ,2,{kind:'invisible'}),rect('gq-bound-e',b.maxX,(b.minZ+b.maxZ)/2,.5,b.maxZ-b.minZ,2,{kind:'invisible'}),rect('gq-bound-n',(b.minX+b.maxX)/2,b.minZ,b.maxX-b.minX,.5,2,{kind:'invisible'}),rect('gq-bound-s',(b.minX+b.maxX)/2,b.maxZ,b.maxX-b.minX,.5,2,{kind:'invisible'})];
  for(const[s,segment]of segments(bridgePoints).entries())for(const side of[-1,1]){
    const dx=(segment.b.x-segment.a.x)/segment.length,dz=(segment.b.z-segment.a.z)/segment.length,offset=deckWidth/2;
    const a={x:segment.a.x+dz*offset*side,z:segment.a.z-dx*offset*side},c={x:segment.b.x+dz*offset*side,z:segment.b.z-dx*offset*side};
    walls.push(lineBox(`gq-rail-${s}-${side}`,a,c,.2,1.25,{kind:'gq-railing'}));
  }
  // Central passages are open below roof collision; the portal is an artistic elevation.
  walls.push(rect('gq-city-gate-roof',gateCenter.x,gateCenter.z,8,4,4.5,{kind:'gq-upper',baseY:3.4,rotation:gateRotation}));
  for(const side of[-1,1])walls.push(rect(`gq-city-post-${side}`,gateCenter.x+Math.cos(gateRotation)*side*3,gateCenter.z-Math.sin(gateRotation)*side*3,1.2,4,3.5,{kind:'gq-city-post',rotation:gateRotation}));
  for(const p of pavilions){
    walls.push(rect(`${p.id}-roof`,p.x,p.z,p.width+.5,p.depth+.6,1.5,{kind:'gq-upper',baseY:p.height,rotation:p.rotation}));
    for(const side of[-1,1])for(const along of[-1,1]){
      const u=side*(deckWidth/2-.2),v=along*(p.depth/2-.3),x=p.x+Math.cos(p.rotation)*u+Math.sin(p.rotation)*v,z=p.z-Math.sin(p.rotation)*u+Math.cos(p.rotation)*v;
      walls.push(rect(`${p.id}-col-${side}-${along}`,x,z,.24,.24,p.height,{kind:'gq-column'}));
    }
  }
  // Two small, explicitly designed bank-side supplies/cover objects, clear of arrival road.
  walls.push(rect('gq-east-cover-n',69,-1,2.5,2.1,1.3,{kind:'gq-cover'}),rect('gq-east-cover-s',75,22,2.7,2.2,1.4,{kind:'gq-cover'}));
  // Fictional riverside task room. Its western doorway faces the real bridge approach.
  walls.push(rect('gq-task-n',83,20,13.6,.6,4.5,{kind:'gq-task-wall'}),rect('gq-task-s',83,34,13.6,.6,4.5,{kind:'gq-task-wall'}),rect('gq-task-e',89.5,27,.6,14,4.5,{kind:'gq-task-wall'}));
  for(const side of[-1,1])walls.push(rect(`gq-task-w-${side}`,76.5,27+side*4.35,.6,5.3,4.5,{kind:'gq-task-wall'}));
  walls.push(rect('gq-task-roof',83,27,13.8,14.6,.5,{kind:'gq-upper',baseY:4.5}));
  return walls;
}
function crossing(id,fraction,switchId,label){const p=guangjiPoint(fraction);return{id,x:p.x,z:p.z,w:8.8,d:.44,height:3.2,rotation:p.rotation,open:false,locked:true,switchId,style:'portcullis',label};}
const doors=[crossing('bridge-gate-1',.105,'winch-1','西桥墨闸'),crossing('bridge-gate-2',.273,'winch-2','浮桥系缆闸'),crossing('bridge-gate-3',.553,'winch-3','东桥墨闸'),{id:'guangji-task-door',x:76.5,z:27,w:3.4,d:.4,height:3.3,rotation:Math.PI/2,open:false,locked:true,keyIds:['guangji-code-clue','guangji-code-kills'],label:'东岸任务房 · 两半密码'}];
const switches=[
  {id:'winch-1',...guangjiPoint(.07,1.9),label:'西桥接应绞盘',doorIds:['bridge-gate-1'],order:0},
  {id:'winch-2',...guangjiPoint(.244,-1.9),label:'浮桥系缆绞盘',doorIds:['bridge-gate-2'],order:1,requires:['winch-1']},
  {id:'winch-3',...guangjiPoint(.523,1.9),label:'东桥通行绞盘',doorIds:['bridge-gate-3'],order:2,requires:['winch-2']}
];
const at=(id,type,t,lateral,encounterId,rank=1,extra={})=>({id,type,...guangjiPoint(t,lateral),encounterId,rank,...extra});
const encounterIds=['guangji-west-watch','guangji-floating-watch','guangji-east-watch','guangji-arrival-watch'];
const enemies=[
  at('bridge-scout','lantern',.145,1.45,encounterIds[0]),at('bridge-west-pencil','doodler',.187,-1.4,encounterIds[0]),at('bridge-west-ink','inkling',.220,.8,encounterIds[0]),at('bridge-west-shade','shade',.240,-.8,encounterIds[0]),
  at('bridge-leaper','shade',.32,-1.3,encounterIds[1]),at('bridge-float-lantern','lantern',.355,1.25,encounterIds[1]),at('bridge-float-pencil','doodler',.39,-1.3,encounterIds[1]),at('bridge-float-ink','inkling',.44,.8,encounterIds[1]),
  at('bridge-guard','brute',.61,0,encounterIds[2],2),at('bridge-east-archer','archer',.665,1.1,encounterIds[2],2),at('bridge-east-lantern','lantern',.72,-1.3,encounterIds[2],2),at('bridge-east-shade','shade',.775,.8,encounterIds[2],2),
  {id:'river-boss',type:'boss',x:83,z:27,hp:165,maxHp:165,damage:14,name:'守桥墨影',encounterId:encounterIds[3],rank:2},
  {id:'bridge-arrival-pencil',type:'doodler',x:68,z:7,encounterId:encounterIds[3],rank:2},
  {id:'bridge-arrival-lantern',type:'lantern',x:72,z:4,encounterId:encounterIds[3],rank:2},
  {id:'bridge-arrival-ink',type:'inkling',x:72,z:16,encounterId:encounterIds[3],rank:2}
];
const spawn=projectGuangji({lon:116.64798,lat:23.665665});

export const guangjiLayout={
  source:'OSM API snapshot + official geographic context; original game staging',origin:GUANGJI_ORIGIN,scale:GUANGJI_SCALE,bounds:b,provenance:GUANGJI_PROVENANCE,
  bridgeSections,bridgePoints,bridgeLength,deckWidth,roads,westBank,eastBank,waterPolygon,landPolygons,pavilions,gate:{osmWayId:1030010813,points:gateFootprint,center:gateCenter,rotation:gateRotation},
  interpretation:'桥线与两岸平面位置缩尺 0.22；桥宽扩大为 6.8 游戏米；亭阁、门楼立面、船体、机关、怪物与高度是原创示意，非测绘复原。',
  qaRoute:[spawn,guangjiPoint(0),...switches,guangjiPoint(.82),guangjiPoint(1),{x:66,z:10},{x:73,z:27},{x:83,z:27}],
  taskRoom:{fictional:true,label:'东岸临时护桥任务房（游戏虚构）',x:83,z:27,w:13,d:14,doorId:'guangji-task-door',doorApproach:{x:73,z:27},inside:{x:80,z:27},bossTrigger:{x:81,z:27,radius:2.4},bossId:'river-boss'},
  chapterGroups:encounterIds
};

export const guangjiChapter={
  id:'guangji',placeId:'guangji',ll:GUANGJI_ATLAS_ANCHOR,title:'第二章 · 韩江合舟',shortTitle:'潮州广济桥',region:'潮州市',theme:'bridge',layout:'osm-guangji',
  art:{style:'paper-ink',accent:0x6c9f98,sky:0xf1eee3,water:0xb9d3cf,identity:'韩江两岸 · 固定石梁 · 江心十八梭船'},
  landform:{type:'osm-guangji',note:'实际 OSM 平面方位；统一游戏地面 datum=0。水面与桥墩落差为艺术示意，不代表实测高程。'},
  description:'从古城西桥头接应，沿西段石梁、江心浮桥、东段石梁穿越韩江，再到东兴路一侧完成护桥交接。',
  objectiveText:'西桥接应 → 狩猎墨怪并合成密码 → 过韩江 → 东岸任务房首领',
  bounds:b,spawn,exit:{x:83,z:27,radius:2.2},walls:makeGuangjiWalls(),doors,switches,
  collectibles:[{id:'guangji-west-manifest',...guangjiPoint(.227,1.7),kind:'seal',name:'西桥接应簿'},{id:'guangji-floating-rope-note',...guangjiPoint(.475,-1.7),kind:'seal',name:'梭船系缆图'}],
  npcs:[{id:'bridge-merchant',type:'merchant',name:'西桥接应商',x:spawn.x-2.4,z:spawn.z+3}],enemies,
  encounters:[
    {id:encounterIds[0],name:'西段桥亭 · 接应',trigger:{}},
    {id:encounterIds[1],name:'江心浮桥 · 系缆',trigger:{switch:'winch-2',after:encounterIds[0]}},
    {id:encounterIds[2],name:'东段石梁 · 守桥',trigger:{switch:'winch-3',after:encounterIds[1]}},
    {id:encounterIds[3],name:'东岸桥头 · 交接',trigger:{near:{x:64,z:10,radius:13},after:encounterIds[2]}}
  ],
  goals:{doors:['guangji-task-door'],boss:true},
  reward:{xp:190,gold:170},decorations:[],sourceNote:'方位/桥段源于 OpenStreetMap；怪物、机关及高度为游戏设计。',sourceLink:'./GUANGJI-SOURCES.md'
};

/** Root owns common interactive doors/characters. Skip generic bridge ground for this layout. */
export function drawGuangji({THREE,root,level,mesh,box,cylinder,stroke,mat,label,outline,geo,colors,tagStructure,tagPart,tagNew,isStructureNode}){
  const firstChild=root.children.length;
  function polygon(ps,y,color,name){const contour=ps.map(p=>new THREE.Vector2(p.x,p.z)),tris=THREE.ShapeUtils.triangulateShape(contour,[]),positions=ps.flatMap(p=>[p.x,y,p.z]);const geometry=geo(new THREE.BufferGeometry());geometry.setAttribute('position',new THREE.Float32BufferAttribute(positions,3));geometry.setIndex(tris.flat());geometry.computeVertexNormals();const m=mesh(geometry,mat(color,{side:THREE.DoubleSide}),0,0,0,root,false);m.name=name;return m;}
  polygon(waterPolygon,-1.1,colors.water,'gq-osm-han-river');landPolygons.forEach((p,i)=>polygon(p,0,colors.paper,`gq-bank-land-${i}`));
  for(const bank of[westBank,eastBank]){
    stroke(bank.map(p=>[p.x,.035,p.z]));
    const pos=[];for(const s of segments(bank))pos.push(s.a.x,0,s.a.z,s.b.x,0,s.b.z,s.b.x,-1.15,s.b.z,s.a.x,0,s.a.z,s.b.x,-1.15,s.b.z,s.a.x,-1.15,s.a.z);
    const g=geo(new THREE.BufferGeometry());g.setAttribute('position',new THREE.Float32BufferAttribute(pos,3));g.computeVertexNormals();mesh(g,mat(colors.stone,{side:THREE.DoubleSide}),0,0,0,root,false);
  }
  for(const road of roads)for(const s of road.segments){const l=length(s.a,s.b),g=new THREE.Group();g.position.set((s.a.x+s.b.x)/2,0,(s.a.z+s.b.z)/2);g.rotation.y=Math.atan2(s.b.x-s.a.x,s.b.z-s.a.z);root.add(g);box(0,.006,0,road.width,.022,l,colors.stone,g);for(const side of[-1,1])stroke([[side*road.width/2,.039,-l/2],[side*road.width/2,.039,l/2]],g);}
  for(const section of bridgeSections)for(const s of segments(section.points)){
    const g=new THREE.Group();g.position.set((s.a.x+s.b.x)/2,0,(s.a.z+s.b.z)/2);g.rotation.y=Math.atan2(s.b.x-s.a.x,s.b.z-s.a.z);root.add(g);
    box(0,-.32,0,deckWidth,.32,s.length+.05,section.kind==='floating'?colors.wood:colors.stone,g);
    for(let z=-s.length/2;z<s.length/2;z+=section.kind==='floating'?.55:1.7)stroke([[-deckWidth/2,.015,z],[deckWidth/2,.015,z+.018]],g);
  }
  // Eighteen separate stylized hulls. Their spacing derives from the OSM floating segment.
  for(let i=0;i<18;i++){
    const p=onLine(bridgeSections[1].points,(i+.5)/18),g=new THREE.Group();g.position.set(p.x,-.8,p.z);g.rotation.y=p.rotation;root.add(g);
    const hull=mesh(geo(new THREE.SphereGeometry(1,8,5)),mat(colors.wood),0,0,0,g);hull.scale.set(4.45,.45,.48);outline(hull,25);box(0,.22,0,7.4,.12,.58,colors.wood,g);
  }
  for(let i=0;i<54;i++){
    const x=b.minX+(i*17.39)%(b.maxX-b.minX),z=b.minZ+(i*9.27)%(b.maxZ-b.minZ);if(inPolygon({x,z},waterPolygon)&&pointLineDistance({x,z},bridgePoints)>4.8)stroke([[x,-1.075,z],[x+1.2,-1.075,z+.06],[x+2.8,-1.075,z-.015]],root,false);
  }
  for(const wall of level.walls||[]){
    const start=root.children.length;
    if(wall.kind==='gq-railing'){
      const g=new THREE.Group();g.position.set(wall.x,0,wall.z);g.rotation.y=wall.rotation;root.add(g);box(0,.16,0,wall.w,.13,.19,colors.stone,g);box(0,1.1,0,wall.w,.15,.22,colors.stone,g);const count=Math.ceil(wall.w/2);for(let i=0;i<=count;i++)box(-wall.w/2+i/count*wall.w,0,0,.2,1.25,.2,colors.stone,g);
    }else if(wall.kind==='gq-column')cylinder(wall.x,0,wall.z,.12,.15,wall.height,colors.red,root,8);
    else if(wall.kind==='gq-cover')box(wall.x,0,wall.z,wall.w,wall.height,wall.d,colors.stone);
    else if(wall.kind==='gq-task-wall')box(wall.x,0,wall.z,wall.w,wall.height,wall.d,colors.paper);
    tagNew?.(root,start,wall.id);
  }
  function roof(g,y,w,d,rise){
    const v=[],indices=[],rings=[[1,.12],[.82,0],[.3,1]];
    for(const[scale,h]of rings)for(const[x,z]of[[-1,-1],[1,-1],[1,1],[-1,1]])v.push(x*w*scale/2,y+h*rise,z*d*scale/2);
    for(let j=0;j<2;j++)for(let k=0;k<4;k++){const a=j*4+k,c=j*4+(k+1)%4;indices.push(a,a+4,c,c,a+4,c+4);}
    const geometry=geo(new THREE.BufferGeometry());geometry.setAttribute('position',new THREE.Float32BufferAttribute(v,3));geometry.setIndex(indices);geometry.computeVertexNormals();outline(mesh(geometry,mat(colors.roof,{side:THREE.DoubleSide}),0,0,0,g),22);
    stroke([[-w/2,y+.12*rise,-d/2],[w/2,y+.12*rise,-d/2],[w/2,y+.12*rise,d/2],[-w/2,y+.12*rise,d/2],[-w/2,y+.12*rise,-d/2]],g);
  }
  for(const p of pavilions){
    const g=new THREE.Group();g.position.set(p.x,0,p.z);g.rotation.y=p.rotation;root.add(g);roof(g,p.height,p.width+.8,p.depth+.7,1);if(p.variant!==1){box(0,p.height+.5,0,p.width*.48,.7,p.depth*.46,colors.paper,g);roof(g,p.height+1.1,p.width*.66,p.depth*.66,.7);}
    tagStructure?.(g,`${p.id}-roof`);
    for(const side of[-1,1])box(side*(deckWidth/2-.4),-.95,0,.85,.7,p.depth+1,colors.stone,g);
  }
  // The mapped city-gate footprint determines plan location/orientation; height is artistic.
  const cityGate=new THREE.Group();cityGate.position.set(gateCenter.x,0,gateCenter.z);cityGate.rotation.y=gateRotation;root.add(cityGate);
  tagStructure?.(cityGate,'gq-city-gate-roof');
  for(const side of[-1,1]){const pillar=box(side*3,0,0,1.2,3.5,4,colors.stone,cityGate);tagPart?.(pillar,`gq-city-post-${side}`);}
  box(0,3.4,0,8,2.4,4,colors.paper,cityGate);roof(cityGate,5.8,9.3,5.2,1.2);box(0,6.3,0,5.2,1.4,3.0,colors.paper,cityGate);roof(cityGate,7.65,6.5,4.1,1);
  const gateSign=label('广济门 · 西岸',gateCenter.x,5.0,gateCenter.z+2.3,5,colors.ink);tagStructure?.(gateSign,'gq-city-gate-roof');
  label('广济桥 · 向东过江',spawn.x+1,3.7,spawn.z-2,6.2,colors.ink);
  const floatMiddle=guangjiPoint(.355);label('十八梭船 · 浮桥段',floatMiddle.x,3.25,floatMiddle.z-4.0,7.4,colors.ink);
  label('东岸交接 · 东兴路',80,3.7,15,6.3,colors.ink);
  box(83,4.5,27,13.8,.5,14.6,colors.roof);const roomSign=label('护桥任务房 · 游戏虚构',76.12,3.8,27,6,colors.ink);if(roomSign)roomSign.rotation.y=-Math.PI/2;
  label('北 ↑ 韩文公祠方向',81,4,-18,7,colors.ink);
  // Nearby eastern wooded hill is contextual scenery; its silhouette is not DEM-derived.
  for(let i=0;i<11;i++){const x=86+(i%3)*2,z=-29+Math.floor(i/3)*5,g=new THREE.Group();g.position.set(x,0,z);root.add(g);cylinder(0,0,0,.12,.18,2.5,colors.wood,g,7);const crown=mesh(geo(new THREE.DodecahedronGeometry(1.8,0)),mat(colors.stone),0,3.3,0,g);crown.scale.y=1.35;outline(crown,30);}
  // Merge only this module's static geometry; leave labels and interactive entities intact.
  root.updateMatrixWorld(true);const objects=[];for(const child of root.children.slice(firstChild))child.traverse(o=>{if(!isStructureNode?.(o)&&((o.isMesh&&!o.material.map)||o.isLine))objects.push(o);});
  const batches=new Map(),lines=new Map(),position=new THREE.Vector3(),normal=new THREE.Vector3();
  for(const o of objects){
    if(o.isLine){const a=o.geometry.attributes.position,list=lines.get(o.material)||[],step=o.isLineSegments?2:1;for(let i=0;i<a.count-1;i+=step)for(const j of[i,i+1]){position.fromBufferAttribute(a,j).applyMatrix4(o.matrixWorld);list.push(position.x,position.y,position.z);}lines.set(o.material,list);continue;}
    const list=batches.get(o.material)||{p:[],n:[]},g=o.geometry,a=g.attributes.position,n=g.attributes.normal,index=g.index,m=new THREE.Matrix3().getNormalMatrix(o.matrixWorld);
    for(let i=0;i<(index?index.count:a.count);i++){const j=index?index.getX(i):i;position.fromBufferAttribute(a,j).applyMatrix4(o.matrixWorld);list.p.push(position.x,position.y,position.z);normal.fromBufferAttribute(n,j).applyMatrix3(m).normalize();list.n.push(normal.x,normal.y,normal.z);}batches.set(o.material,list);
  }
  for(const o of objects)o.removeFromParent();
  for(const[material,list]of batches){const g=geo(new THREE.BufferGeometry());g.setAttribute('position',new THREE.Float32BufferAttribute(list.p,3));g.setAttribute('normal',new THREE.Float32BufferAttribute(list.n,3));mesh(g,material,0,0,0,root,false);}
  for(const[material,list]of lines){const g=geo(new THREE.BufferGeometry());g.setAttribute('position',new THREE.Float32BufferAttribute(list,3));root.add(new THREE.LineSegments(g,material));}
}
