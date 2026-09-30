import {eastGeoData} from './east-geo-data.mjs';

const configs={
 tianchi:{id:'chaoan-tianchi',title:'潮安 · 凤凰天池',region:'潮安区',theme:'forest',origin:[116.6446,23.95693],ll:[116.6448552,23.9560917],scale:.4,bounds:{minX:-76,maxX:174,minZ:-66,maxZ:90},identity:'真实湖岸 · 南端分岔 · 高山观景路'},
 daoyun:{id:'raoping-daoyun',title:'饶平 · 道韵楼',region:'饶平县',theme:'town',origin:[116.82304,23.97675],ll:[116.8230429,23.9767447],scale:.85,bounds:{minX:-80,maxX:96,minZ:-108,maxZ:67},identity:'三重八角围屋 · 北池 · 内埕'},
 jinghai:{id:'huilai-jinghai',title:'惠来 · 靖海古城',region:'惠来县',theme:'coast',origin:[116.5206,23.0078],ll:[116.5220784,23.0079318],scale:.4,bounds:{minX:-104,maxX:106,minZ:-88,maxZ:98},identity:'真实折线城墙 · 老街交叉 · 南侧河湾'},
 falls:{id:'jiexi-falls',title:'揭西 · 黄满寨瀑布',region:'揭西县',theme:'forest',origin:[115.9847,23.5818],ll:[115.9847193,23.5818848],scale:.2,bounds:{minX:-73,maxX:61,minZ:-94,maxZ:102},identity:'谷中曲折溪流 · 五级瀑意向 · 沿谷上行'}
};
const distance=(a,b)=>Math.hypot(a.x-b.x,a.z-b.z);
const pt=(x,z)=>({x,z});
const mix=(a,b,t)=>({x:a.x+(b.x-a.x)*t,z:a.z+(b.z-a.z)*t});
const segs=ps=>ps.slice(1).map((b,i)=>({a:ps[i],b}));
const strip=(a,b,w)=>{const l=distance(a,b),x=(b.z-a.z)/l*w/2,z=-(b.x-a.x)/l*w/2;return[pt(a.x+x,a.z+z),pt(b.x+x,b.z+z),pt(b.x-x,b.z-z),pt(a.x-x,a.z-z)];};
const rectPoly=(x,z,w,d)=>[pt(x-w/2,z-d/2),pt(x+w/2,z-d/2),pt(x+w/2,z+d/2),pt(x-w/2,z+d/2)];
const circle=(p,r)=>Array.from({length:12},(_,i)=>pt(p.x+Math.cos(i*Math.PI/6)*r,p.z+Math.sin(i*Math.PI/6)*r));
export function projectEast(key,ll){const c=configs[key];return{x:(ll[0]-c.origin[0])*Math.PI/180*6378137*Math.cos(c.origin[1]*Math.PI/180)*c.scale,z:-(ll[1]-c.origin[1])*Math.PI/180*6378137*c.scale};}
const source=(key,id)=>eastGeoData[key].features.find(w=>w.id===id);
const way=(key,id)=>source(key,id).geometry.map(ll=>projectEast(key,ll));
function clipSegment(a,b,q){let lo=0,hi=1;const dx=b.x-a.x,dz=b.z-a.z;for(const[p,v]of[[-dx,a.x-q.minX],[dx,q.maxX-a.x],[-dz,a.z-q.minZ],[dz,q.maxZ-a.z]]){if(Math.abs(p)<1e-10){if(v<0)return null;continue;}const t=v/p;if(p<0)lo=Math.max(lo,t);else hi=Math.min(hi,t);if(lo>hi)return null;}return{a:mix(a,b,lo),b:mix(a,b,hi)};}
function clipPolygon(ps,b){let out=ps;for(const[axis,value,keep]of[['x',b.minX,1],['x',b.maxX,-1],['z',b.minZ,1],['z',b.maxZ,-1]]){const input=out;out=[];for(let i=0;i<input.length;i++){const a=input[i],c=input[(i+1)%input.length],ai=(a[axis]-value)*keep>=0,ci=(c[axis]-value)*keep>=0;if(ai)out.push(a);if(ai!==ci)out.push(mix(a,c,(value-a[axis])/(c[axis]-a[axis])));}}return out;}
const segmentDistance=(p,a,b)=>{const dx=b.x-a.x,dz=b.z-a.z,t=Math.max(0,Math.min(1,((p.x-a.x)*dx+(p.z-a.z)*dz)/(dx*dx+dz*dz||1)));return distance(p,mix(a,b,t));};
export function profileY(level,x,z){const f=level.landform;if(f?.type!=='profile')return 0;const v=f.axis==='x'?x:z,s=f.stops;if(v<=s[0][0])return s[0][1];for(let i=1;i<s.length;i++)if(v<=s[i][0])return s[i-1][1]+(s[i][1]-s[i-1][1])*(v-s[i-1][0])/(s[i][0]-s[i-1][0]);return s.at(-1)[1];}
const lineWall=(id,a,b,d,height,kind='east-wall',extra={})=>({id,x:(a.x+b.x)/2,z:(a.z+b.z)/2,w:distance(a,b),d,height,rotation:Math.atan2(-(b.z-a.z),b.x-a.x),kind,...extra});
function cutWall(id,a,b,d,height,kind,remove){const out=[],count=Math.ceil(distance(a,b)/1.4);let run=null;for(let i=0;i<=count;i++){const keep=i<count&&!remove(mix(a,b,(i+.5)/count));if(keep&&run===null)run=i;if(!keep&&run!==null){out.push(lineWall(`${id}-${run}`,mix(a,b,run/count),mix(a,b,i/count),d,height,kind));run=null;}}return out;}
function roads(key,ids,width){return ids.map(id=>({id:`osm-${id}`,osmWayId:id,fictional:false,name:source(key,id).tags.name||'OSM 已映射步道',width,segments:segs(way(key,id)).map(s=>clipSegment(s.a,s.b,configs[key].bounds)).filter(s=>s&&distance(s.a,s.b)>.01)}));}
const gameRoad=(id,points,width=8)=>({id,fictional:true,name:'游戏连接步道（非实测）',width,segments:segs(points).map(s=>({...s}))});
function addRoom(level,layout,x,z,facing,label){
 const prefix=level.id,side=6.5,thickness=.5,doorWidth=4.2,height=4.5,baseY=profileY(level,x,z);
 const walls=[];const wall=(name,x,z,w,d)=>walls.push({id:`${prefix}-room-${name}`,x,z,w,d,height,baseY,kind:'east-task-wall'});
 // Facing east or south; every room has a 12.5 x 12.5 clear interior.
 if(facing==='east'){
  wall('n',x,z-side,13.5,thickness);wall('s',x,z+side,13.5,thickness);wall('w',x-side,z,thickness,13.5);
  for(const sign of[-1,1])wall(`e-${sign}`,x+side,z+sign*(side+doorWidth/2)/2,thickness,side-doorWidth/2);
 }else{
  wall('n',x,z-side,13.5,thickness);wall('w',x-side,z,thickness,13.5);wall('e',x+side,z,thickness,13.5);
  for(const sign of[-1,1])wall(`s-${sign}`,x+sign*(side+doorWidth/2)/2,z,1,1);
  // Correct the two south jamb centers/depths in the shared world coordinates.
  for(const w of walls.filter(w=>w.id.includes('-room-s-'))){w.x=x+(w.id.endsWith('-1')&&!w.id.endsWith('--1')?1:-1)*(side+doorWidth/2)/2;w.z=z+side;w.w=side-doorWidth/2;w.d=thickness;}
 }
 const door=facing==='east'?{x:x+side,z,w:doorWidth,d:.36,rotation:Math.PI/2}:{x,z:z+side,w:doorWidth,d:.36};
 const approach=facing==='east'?pt(x+side+3.4,z):pt(x,z+side+3.4);
 const inside=facing==='east'?pt(x+side-2.3,z):pt(x,z+side-2.3);
 const target=facing==='east'?pt(x+1.8,z):pt(x,z+1.8);
 const boss=pt(x-2.1,z-2.1);
 level.walls.push(...walls,{id:`${prefix}-room-roof`,x,z,w:13.8,d:13.8,height:.35,baseY:baseY+height,kind:'east-upper'});
 level.doors.push({...door,id:`${prefix}-task-door`,height:3.5,baseY,open:false,locked:true,label:`${label} · 两半钥匙`});
 layout.taskRoom={fictional:true,label,x,z,w:13,d:13,clearInterior:12.5,baseY,doorWidth,doorId:`${prefix}-task-door`,doorApproach:approach,inside,target:{...target,radius:2.1},boss:{...boss,id:`${prefix}-boss`}};
 layout.clearings.push(rectPoly(x,z,14,14),circle(approach,4));
 level.exit={...target,radius:2.1};level.enemies.push({...boss,id:`${prefix}-boss`,type:'boss',name:`${level.shortTitle}墨潮守将`,hp:310,damage:18});
 level.goals={doors:[`${prefix}-task-door`],boss:true};
}
function addRoofSites(key,level,layout){
 // Original game shelters have four visible load-bearing posts and a solid roof.
 // Their clear span follows the nearest route so walkers pass below, never through a post.
 const requested={tianchi:pt(105,48),daoyun:pt(-56,13),jinghai:pt(-49,31),falls:layout.qaRoute[23]}[key];
 const route=layout.roads.flatMap(r=>r.segments).reduce((a,b)=>segmentDistance(requested,b.a,b.b)<segmentDistance(requested,a.a,a.b)?b:a);
 const length=distance(route.a,route.b),forward={x:(route.b.x-route.a.x)/length,z:(route.b.z-route.a.z)/length};
 const t=Math.max(0,Math.min(1,((requested.x-route.a.x)*forward.x+(requested.z-route.a.z)*forward.z)/length)),center=mix(route.a,route.b,t);
 const rotation=Math.atan2(forward.x,forward.z),base=profileY(level,center.x,center.z)+4.3;
 const local=(x,z)=>pt(center.x+Math.cos(rotation)*x+Math.sin(rotation)*z,center.z-Math.sin(rotation)*x+Math.cos(rotation)*z);
 for(const x of[-3.65,3.65])for(const z of[-3.65,3.65]){const p=local(x,z),ground=profileY(level,p.x,p.z);level.walls.push({id:`${level.id}-watch-post-${x}-${z}`,x:p.x,z:p.z,w:.36,d:.36,rotation,height:base-ground,baseY:ground,kind:'east-watch-post'});}
 const roof={id:`${level.id}-watch-roof`,x:center.x,z:center.z,w:8,d:8,height:.35,baseY:base,rotation,kind:'east-upper'};
 level.walls.push(roof);
 layout.watchShelters=[{...center,rotation,roofId:roof.id,baseY:base-4.3,roofY:base+.35,label:'游戏观景岗棚',fictional:true}];
 const canopy=local(0,3.1),room=layout.taskRoom,taskRoof=level.walls.find(w=>w.id===`${level.id}-room-roof`),door=level.doors.find(d=>d.id===room.doorId);
 const axis={x:(door.x-room.x)/6.5,z:(door.z-room.z)/6.5};
 const task=pt(room.x+axis.x*6.05-axis.z*1.5,room.z+axis.z*6.05+axis.x*1.5);
 level.spawnSites=[
  {id:`${level.id}-roof-watch`,...canopy,y:roof.baseY+roof.height,kind:'roof',supportId:roof.id,fictional:true,label:'游戏岗棚屋顶射手'},
  {id:`${level.id}-roof-task`,...task,y:taskRoof.baseY+taskRoof.height,kind:'roof',supportId:taskRoof.id,fictional:true,label:'游戏任务房屋顶射手'}
 ];
}
function finish(key,level,layout,clues){
 addRoofSites(key,level,layout);
 level.collectibles=clues.map((p,i)=>({...p,id:`${level.id}-clue-${i+1}`,kind:'seal',name:['沿路地形札记','旧物线索','守望记录'][i]}));
 level.npcs=[{id:`${level.id}-merchant`,type:'merchant',name:'旅路行商',x:level.spawn.x+2.2,z:level.spawn.z+2}];
 layout.clearings.push(circle(level.spawn,6),...clues.map(p=>circle(p,3.8)),circle(level.npcs[0],3));
 const walk=[];for(const road of layout.roads)for(const s of road.segments){walk.push(strip(s.a,s.b,road.width));walk.push(circle(s.a,road.width/2),circle(s.b,road.width/2));}walk.push(...layout.clearings);
 const seen=new Set();level.walkablePolygons=walk.map(p=>clipPolygon(p,level.bounds)).filter(p=>{if(p.length<3)return false;const key=p.map(q=>`${q.x.toFixed(4)},${q.z.toFixed(4)}`).join(';');if(seen.has(key))return false;seen.add(key);return true;});
 for(const w of level.walls){if(w.baseY===undefined)w.baseY=profileY(level,w.x,w.z);w.groundOffset=w.baseY-profileY(level,w.x,w.z);}
 for(const d of level.doors)d.groundOffset=d.baseY-profileY(level,d.x,d.z);
 for(let i=0;i<24;i++){const route=layout.qaRoute,p=route[1+i%(route.length-2)];level.enemies.push({id:`${level.id}-pool-${i+1}`,type:i%5===4?['brute','lantern','crab'][i%3]:'doodler',x:p.x,z:p.z,rank:1+Math.floor(i/10)});}
 level.sourceLink='./EAST-SOURCES.md';level.sourceNote='© OpenStreetMap contributors / ODbL; roads widened, interiors and heights are game design; no DEM.';
 level.huntSites={clueIds:level.collectibles.map(c=>c.id),gateId:layout.taskRoom.doorId,bossId:layout.taskRoom.boss.id,target:layout.taskRoom.target};
 level.cartography={roads:layout.roads.flatMap(r=>r.segments.map(s=>({points:[s.a,s.b],width:r.width,fictional:r.fictional,osmWayId:r.osmWayId}))),water:layout.water.map(w=>w.points)};
 if(layout.stream)level.cartography.water.push(...segs(layout.stream).map(s=>clipSegment(s.a,s.b,level.bounds)).filter(Boolean).map(s=>strip(s.a,s.b,5)));
 layout.clearance={playerRadius:.45,bossRadius:.9,doorWidth:4.2,roomInterior:12.5,routeWidth:Math.min(...layout.roads.map(r=>r.width))};
 return{rawLevel:level,layout};
}
function seed(key,landform){const c=configs[key];return{id:c.id,placeId:c.id,atlasPlaceId:c.id,ll:c.ll,geoOrigin:c.origin,horizontalScale:c.scale,title:c.title,shortTitle:c.title.split(' · ')[1],region:c.region,theme:c.theme,layout:`v4-east-${key}`,art:{style:'paper-ink',identity:c.identity},landform,bounds:c.bounds,walls:[],doors:[],collectibles:[],switches:[],npcs:[],enemies:[],decorations:[],reward:{xp:240,gold:220},description:c.identity,objectiveText:'沿真实地形探索 → 猎杀与字谜 → 远端游戏任务房首领'};}
function newLayout(key){return{key,origin:configs[key].origin,scale:configs[key].scale,provenance:eastGeoData[key],roads:[],water:[],clearings:[],qaRoute:[],notes:[]};}

function makeTianchi(){
 const key='tianchi',level=seed(key,{type:'profile',axis:'z',stops:[[-66,12],[45,12],[60,9],[90,0]],note:'游戏湖盆和登山坡，不是海拔或DEM'}),layout=newLayout(key);
 layout.roads=roads(key,[310758689,310759921,471746710,1051785363,1051785364,1051785366],7.4);
 layout.water=[{id:310758870,points:clipPolygon(way(key,310758870),level.bounds),y:12.025}];
 level.spawn=projectEast(key,source(key,1051785364).geometry[11]);
 addRoom(level,layout,-63,-35,'east','西岸观湖任务棚（游戏）');
 layout.roads.push(gameRoad('tianchi-room-connection',[pt(-42,-35),layout.taskRoom.doorApproach,layout.taskRoom.inside,layout.taskRoom.target],7.4));
 const west=way(key,310758689),south=way(key,1051785363),east=way(key,310759921);
 layout.qaRoute=[level.spawn,...way(key,1051785364).slice(0,12).reverse(),...south.slice(2,9),...way(key,1051785366),...east,...east.slice().reverse(),...west.slice(24).reverse(),pt(-42,-35),layout.taskRoom.doorApproach,layout.taskRoom.target];
 layout.notes=['湖岸为真实88点轮廓；山径按真实折线。北侧界外道路不扩展为游戏军事设施。','路径宽度及西岸任务棚为游戏设计；湖面处统一游戏Y=12，不是1325米的实测换算。'];
 return finish(key,level,layout,[pt(-33,53),pt(105,48),pt(-42,-28)]);
}
function makeDaoyun(){
 const key='daoyun',level=seed(key,{type:'flat-plaza'}),layout=newLayout(key);
 layout.rings=[291878833,1085778489,1085778490,1085778491,1085778492,904654622].map(id=>({id,points:way(key,id)}));
 layout.roads=roads(key,[291878830,291878832,292026450,904654621],8);
 const outside=[pt(-62,-55),pt(-59,-30),pt(-55,22),pt(-18,52),pt(24,49),pt(61,21),pt(64,-31),pt(70,-59),pt(0,-50),pt(0,-13)];
 layout.roads.push(gameRoad('daoyun-exterior-circuit',outside,9),gameRoad('daoyun-courtyard-cross',[pt(-9,-9),pt(9,-9)],6));
 layout.water=[{id:291945492,points:way(key,291945492),y:.025}];
 for(const[ri,ring]of layout.rings.entries())for(const[i,s]of segs(ring.points).entries()){
  level.walls.push(...cutWall(`daoyun-ring-${ri}-${i}`,s.a,s.b,.45,ri<2?9.2:3.2,'east-tulou-wall',p=>Math.abs(p.x)<4.4&&p.z<0));
 }
 level.spawn=pt(-64,-60);
 // The task shed sits in the mapped central courtyard; it is not a resident's home.
 addRoom(level,layout,0,5,'south','内埕密信任务房（游戏）');
 // Northern room entrance is needed from the actual north-facing courtyard route.
 for(const w of level.walls.filter(w=>w.kind==='east-task-wall'))w.z=10-w.z;
 const door=level.doors[0];door.z=-1.5;layout.taskRoom.doorApproach=pt(0,-5);layout.taskRoom.inside=pt(0,.8);layout.taskRoom.target={x:0,z:3.2,radius:2.1};layout.taskRoom.boss={x:2.1,z:7.1,id:`${level.id}-boss`};Object.assign(level.enemies[0],layout.taskRoom.boss);level.exit={...layout.taskRoom.target};
 layout.roads.push(gameRoad('daoyun-north-entry',[pt(0,-13),pt(0,-5),pt(0,.8),pt(0,3.2)],7));
 layout.qaRoute=[level.spawn,...outside,pt(-9,-9),pt(9,-9),pt(0,-9),layout.taskRoom.doorApproach,layout.taskRoom.target];
 layout.clearings.push(rectPoly(0,-9,23,8));
 layout.notes=['三进六条八角边界来自OSM relation12285115；北侧池塘为OSM实形。','北向入口依官方朝向，门宽与三进贯通走道为游戏扩宽；房屋高度、廊柱、双井位置与任务房均为设计，非真实住户室内。'];
 return finish(key,level,layout,[pt(-56,13),pt(61,24),pt(9,-9)]);
}
function makeJinghai(){
 const key='jinghai',level=seed(key,{type:'flat-plaza'}),layout=newLayout(key);
 layout.roads=roads(key,[1540243644,1540243646,1540243647,1540243648,1540243654,382508854,382508852,1540243656,1540243639],8);
 layout.wallOutline=way(key,1540243655);layout.water=[{id:1010002190,points:clipPolygon(way(key,1010002190),level.bounds),y:.025}];
 const passages=layout.roads.flatMap(r=>r.segments);
 for(const[i,s]of segs(layout.wallOutline).entries()){
  level.walls.push(...cutWall(`jinghai-wall-${i}`,s.a,s.b,.6,7.3,'east-city-wall',p=>passages.some(t=>{const alignment=Math.abs(((s.b.x-s.a.x)*(t.b.x-t.a.x)+(s.b.z-s.a.z)*(t.b.z-t.a.z))/(distance(s.a,s.b)*distance(t.a,t.b)));return alignment<.65&&segmentDistance(p,t.a,t.b)<5.3;})));
 }
 level.spawn=pt(-47,83);addRoom(level,layout,-18,-36,'south','城内海防任务房（游戏）');
 layout.roads.push(gameRoad('jinghai-task-connection',[pt(-18,-13),layout.taskRoom.doorApproach,layout.taskRoom.inside,layout.taskRoom.target],8));
 layout.qaRoute=[level.spawn,pt(-49,31),pt(-57,-20),pt(7,-12),pt(60,-6),pt(74,-10),pt(73,26),pt(70,69),pt(38,69),pt(29,34),pt(-15,28),pt(-49,31),pt(-57,-20),pt(-18,-16),layout.taskRoom.doorApproach,layout.taskRoom.target];
 layout.roads.push(gameRoad('jinghai-source-road-rounding',layout.qaRoute.slice(0,14),8));
 // These street-front masses are original scenery, placed away from mapped roads.
 layout.houses=[];for(const p of[pt(-78,-46),pt(-32,7),pt(1,6),pt(29,8),pt(-76,4),pt(-10,58),pt(10,-34),pt(36,-31)]){
  if(passages.some(s=>segmentDistance(p,s.a,s.b)<10))continue;
  const h={id:`jinghai-game-house-${layout.houses.length}`,x:p.x,z:p.z,w:9,d:9,height:4.8,kind:'east-game-house',baseY:0};layout.houses.push(h);level.walls.push(h);
 }
 layout.notes=['真实城墙残存折线，不补造完整八角城。相交老街处留游戏扩宽通道。','未核实路名一律使用方位标记；新增民居体块、城门立面、屋顶与任务房均明确游戏设计。'];
 return finish(key,level,layout,[pt(-54,-25),pt(69,23),pt(25,30)]);
}
function makeFalls(){
 const key='falls',level=seed(key,{type:'profile',axis:'z',stops:[[-94,36],[-80,30],[-56,30],[-35,21],[5,14],[40,6],[80,0],[102,0]],note:'五级瀑谷游戏坡形与房间平台；没有DEM/实测瀑口定位'}),layout=newLayout(key);
 layout.roads=roads(key,[541634619,541634620,541634621,903547544],8.2);
 layout.stream=way(key,903547528);layout.parkBoundary=way(key,541634622);
 const trail=way(key,541634619);level.spawn=trail[0];addRoom(level,layout,-50,-67,'east','上谷守瀑任务棚（游戏）');
 layout.roads.push(gameRoad('falls-room-connection',[trail[39],pt(-37,-67),layout.taskRoom.doorApproach,layout.taskRoom.inside,layout.taskRoom.target],8.2));
 layout.qaRoute=[...trail.slice(0,40),pt(-37,-67),layout.taskRoom.doorApproach,layout.taskRoom.target];
 layout.falls=[trail[5],trail[14],trail[22],trail[30],trail[36]].map((p,i)=>({...p,index:i+1,height:4.5+i*.8}));
 layout.notes=['谷中footway与stream都为OSM实线；步道扩宽后与溪流重合处绘为游戏木栈桥。','五级瀑群存在有官方依据，五个瀑幕的具体落点、宽高与连续坡形均为游戏示意，不能当作各真实瀑布测绘坐标。'];
 return finish(key,level,layout,[trail[9],trail[22],trail[34]]);
}

export const tianchiChapter=makeTianchi();
export const daoyunChapter=makeDaoyun();
export const jinghaiChapter=makeJinghai();
export const fallsChapter=makeFalls();
export const eastChapters=[tianchiChapter,daoyunChapter,jinghaiChapter,fallsChapter];
export const eastRawLevels=eastChapters.map(c=>c.rawLevel);
export const eastLayouts=Object.fromEntries(eastChapters.map(c=>[c.rawLevel.id,c.layout]));

function batchStatic(ctx,start){
 const {THREE,root,mesh,geo,isStructureNode}=ctx,objects=[],batches=new Map(),lines=new Map(),v=new THREE.Vector3(),n=new THREE.Vector3();root.updateMatrixWorld(true);const inv=new THREE.Matrix4().copy(root.matrixWorld).invert();
 for(const child of root.children.slice(start))child.traverse(o=>{if(!isStructureNode?.(o)&&((o.isMesh&&!o.material.map)||o.isLine))objects.push(o);});
 for(const o of objects){const local=new THREE.Matrix4().multiplyMatrices(inv,o.matrixWorld),a=o.geometry.attributes.position;if(o.isLine){const key=`${o.material.color?.getHex?.()}-${o.material.opacity}`,entry=lines.get(key)||{p:[],material:o.material},step=o.isLineSegments?2:1;for(let i=0;i<a.count-1;i+=step)for(const j of[i,i+1]){v.fromBufferAttribute(a,j).applyMatrix4(local);entry.p.push(v.x,v.y,v.z);}lines.set(key,entry);continue;}
  const entry=batches.get(o.material)||{p:[],n:[]},index=o.geometry.index,norm=o.geometry.attributes.normal,m=new THREE.Matrix3().getNormalMatrix(local);for(let i=0;i<(index?index.count:a.count);i++){const j=index?index.getX(i):i;v.fromBufferAttribute(a,j).applyMatrix4(local);entry.p.push(v.x,v.y,v.z);if(norm)n.fromBufferAttribute(norm,j).applyMatrix3(m).normalize();else n.set(0,1,0);entry.n.push(n.x,n.y,n.z);}batches.set(o.material,entry);
 }
 for(const o of objects)o.removeFromParent();for(const[material,entry]of batches){const g=geo(new THREE.BufferGeometry());g.setAttribute('position',new THREE.Float32BufferAttribute(entry.p,3));g.setAttribute('normal',new THREE.Float32BufferAttribute(entry.n,3));mesh(g,material,0,0,0,root,false);}for(const entry of lines.values()){const g=geo(new THREE.BufferGeometry());g.setAttribute('position',new THREE.Float32BufferAttribute(entry.p,3));root.add(new THREE.LineSegments(g,entry.material));}
}
function drawBase(ctx,asset){
 const {THREE,root,mesh,box,stroke,geo,mat,colors}=ctx,level=ctx.level||asset.rawLevel,L=asset.layout,y=(x,z)=>profileY(level,x,z);
 const start=root.children.length;
 const polygon=(ps,height,color,name)=>{if(ps.length<3)return;const p=ps.length>3&&distance(ps[0],ps.at(-1))<.001?ps.slice(0,-1):ps,tris=THREE.ShapeUtils.triangulateShape(p.map(v=>new THREE.Vector2(v.x,v.z)),[]),g=geo(new THREE.BufferGeometry());g.setAttribute('position',new THREE.Float32BufferAttribute(p.flatMap(v=>[v.x,typeof height==='function'?height(v.x,v.z):height,v.z]),3));g.setIndex(tris.flat());g.computeVertexNormals();const o=mesh(g,mat(color,{side:THREE.DoubleSide}),0,0,0,root,false);o.name=name;return o;};
 // Subdivide at every slope breakpoint: displayed ground exactly shares the profile.
 const b=level.bounds,zs=[b.minZ,...(level.landform.stops||[]).map(p=>p[0]).filter(z=>z>b.minZ&&z<b.maxZ),b.maxZ].sort((a,b)=>a-b);
 for(let i=1;i<zs.length;i++)polygon(rectPoly((b.minX+b.maxX)/2,(zs[i]+zs[i-1])/2,b.maxX-b.minX,zs[i]-zs[i-1]),y,colors.paper,'east-profile-ground');
 for(const water of L.water)polygon(water.points,water.y,colors.water,'east-osm-water-'+water.id);
 if(L.stream)for(const s of segs(L.stream)){const cut=clipSegment(s.a,s.b,b);if(cut)polygon(strip(cut.a,cut.b,5), (x,z)=>y(x,z)+.025,colors.water,'east-osm-stream');}
 for(const road of L.roads)for(const s of road.segments){const n=Math.ceil(distance(s.a,s.b)/3);for(let i=0;i<n;i++){
  const edge=strip(mix(s.a,s.b,i/n),mix(s.a,s.b,(i+1)/n),road.width);
  polygon(edge,(x,z)=>y(x,z)+.065,L.key==='falls'?colors.wood:colors.stone,'east-route-'+road.id);
  for(const pair of [[edge[0],edge[1]],[edge[2],edge[3]]])stroke(pair.map(p=>[p.x,y(p.x,p.z)+.09,p.z]),root,false);
 }}
 for(const p of L.clearings)polygon(p,(x,z)=>y(x,z)+.07,colors.stone,'east-game-clearing');
 for(const w of level.walls){if(w.kind==='invisible'||w.kind==='visible-boundary'||w.kind==='player-block'||w.kind?.startsWith('traversal-'))continue;const g=new THREE.Group();g.name=w.id;g.position.set(w.x,w.baseY||0,w.z);g.rotation.y=w.rotation||0;root.add(g);ctx.tagStructure?.(g,w.id);box(0,0,0,w.w,w.height,w.d,w.kind==='east-upper'?colors.roof:w.kind==='east-watch-post'?colors.wood:w.kind==='east-tulou-wall'?0xb39974:w.kind==='east-task-wall'?colors.paper:colors.stone,g);}
 for(const s of L.watchShelters||[])if(!level.traversal?.replacedShelterIds?.includes(s.roofId)){const sign=ctx.label(s.label,s.x,s.roofY+.65,s.z,5.4,colors.ink);ctx.tagStructure?.(sign,s.roofId);}
 // Route strokes are sparse, continuous, and share the movement ground.
 for(const road of L.roads)if(!road.fictional)for(const s of road.segments)stroke([[s.a.x,y(s.a.x,s.a.z)+.09,s.a.z],[s.b.x,y(s.b.x,s.b.z)+.09,s.b.z]],root,false);
 return{level,L,y,polygon,done:()=>batchStatic(ctx,start)};
}
function drawRoomLabel(ctx,L){const r=L.taskRoom,d=(ctx.level||eastRawLevels.find(x=>x.id===r.boss.id.split('-boss')[0]))?.doors?.find(x=>x.id===r.doorId);ctx.label(r.label,d?.x??r.x,r.baseY+3.8,d?.z??r.z,6.6,ctx.colors.ink);}
export function drawTianchi(ctx){const {THREE,root,mesh,cylinder,geo,mat,label,colors}=ctx,{L,y,done}=drawBase(ctx,tianchiChapter);
 for(const[x,z,size]of[[-66,19,4],[-57,1,3],[64,16,5],[100,65,5],[138,29,8],[128,-17,6],[-62,-60,4]]){const o=mesh(geo(new THREE.DodecahedronGeometry(size,0)),mat(colors.stone),x,y(x,z)+size*.75,z,root);o.scale.set(1,.8,.8);}
 for(let i=0;i<15;i++){const x=78+(i%5)*11,z=-45+Math.floor(i/5)*12;cylinder(x,y(x,z),z,.11,.18,2.4,colors.wood,root,6);const m=mesh(geo(new THREE.DodecahedronGeometry(1.5,0)),mat(0x6d8273),x,y(x,z)+3,z,root);m.scale.y=.7;}
 label('凤凰天池 · 湖岸实形',9,15.8,8,7.6,colors.ink);label('南端岔路 · 西岸任务棚',-32,14.5,64,7,colors.ink);label('乌岽山方向 · 观景支路',132,16,44,7,colors.ink);drawRoomLabel(ctx,L);done();
}
export function drawDaoyun(ctx){const {box,cylinder,stroke,label,colors}=ctx,{level,L,polygon,done}=drawBase(ctx,daoyunChapter);
 // Three annuli preserve all six mapped boundaries. Cut the north portal through the roofs visually.
 for(let i=0;i<6;i+=2){const out=L.rings[i].points.slice(0,-1),inn=L.rings[i+1].points.slice(0,-1),height=i===0?9.2:3.2;for(let n=0;n<out.length;n++){const a=out[n],b=out[(n+1)%out.length];if(a.z<0&&b.z<0&&Math.min(a.x,b.x)<4.4&&Math.max(a.x,b.x)>-4.4)continue;const nearest=p=>inn.reduce((best,v)=>distance(p,v)<distance(p,best)?v:best,inn[0]);const roof=polygon([a,b,nearest(b),nearest(a)],height+.15,colors.roof,'daoyun-illustrative-roof');ctx.tagStructure?.(roof,level.walls.find(w=>w.id.startsWith(`daoyun-ring-${i}-`))?.id,level.walls.find(w=>w.id.startsWith(`daoyun-ring-${i+1}-`))?.id);}}
 for(const x of[-8,8]){cylinder(x,0,-6,1,1,.9,colors.stone,ctx.root,12);cylinder(x,.8,-6,.69,.69,.12,colors.water,ctx.root,12);}
 const entryStart=ctx.root.children.length;box(0,4.1,-39,8.7,1.2,2.1,colors.roof);for(const x of[-3.8,3.8])box(x,0,-39,.4,4.1,.45,colors.red);ctx.tagNew?.(ctx.root,entryStart,level.walls.find(w=>w.id.startsWith('daoyun-ring-0-'))?.id);
 label('道韵楼 · 三进八角',-21,11,-39,7,colors.ink);label('北池 · 南联村',23,3.5,-86,6.4,colors.ink);drawRoomLabel(ctx,L);done();
}
export function drawJinghai(ctx){const {box,cylinder,stroke,label,colors,THREE,root}=ctx,{L,done}=drawBase(ctx,jinghaiChapter);
 const p=projectEast('jinghai',[116.5220784,23.0079318]);for(const z of[-4.4,4.4])box(p.x,0,p.z+z,2,4,1.1,colors.stone);box(p.x,3.9,p.z,3.8,2,10,colors.stone);box(p.x,5.9,p.z,5,.5,11,colors.roof);
 for(const h of L.houses){const start=root.children.length;box(h.x,h.height,h.z,h.w+1,.55,h.d+1,colors.roof);for(const s of[-1,1])box(h.x+s*2.4,1.2,h.z+h.d/2+.03,.9,1.4,.07,colors.wood);ctx.tagNew?.(root,start,h.id);}
 for(const w of (ctx.level||jinghaiChapter.rawLevel).walls.filter(w=>w.kind==='east-city-wall'))if(w.w>.6&&Math.abs(w.x*13+w.z)%7<2){const cap=box(w.x,w.baseY+w.height,w.z,.8,.7,.8,colors.stone);ctx.tagStructure?.(cap,w.id);}
 label('靖海古城 · 东门方向',p.x+5,7.3,p.z,7.1,colors.ink);label('城内老街 · 游戏路标',-53,3.6,29,7,colors.ink);label('南侧水湾 · OSM岸线',61,3,89,7,colors.ink);drawRoomLabel(ctx,L);done();
}
export function drawFalls(ctx){const {THREE,root,mesh,box,stroke,geo,mat,label,colors}=ctx,{L,y,polygon,done}=drawBase(ctx,fallsChapter);
 for(const f of L.falls){const s=segs(L.stream).reduce((a,b)=>segmentDistance(f,b.a,b.b)<segmentDistance(f,a.a,a.b)?b:a),point=mix(s.a,s.b,Math.max(0,Math.min(1,((f.x-s.a.x)*(s.b.x-s.a.x)+(f.z-s.a.z)*(s.b.z-s.a.z))/(distance(s.a,s.b)**2))));
  box(point.x,y(point.x,point.z)-.05,point.z,5,f.height,.38,colors.water);for(let i=-2;i<=2;i++)stroke([[point.x+i,y(point.x,point.z)+f.height,point.z+.24],[point.x+i+.13,y(point.x,point.z)+.1,point.z+.24]],root,false);
 }
 for(const side of[-1,1])for(let i=0;i<12;i++){const z=88-i*14,x=(z>0?23:-18)+side*(26+(i%3)*3),r=5+(i%3);const o=mesh(geo(new THREE.DodecahedronGeometry(r,0)),mat(colors.stone),x,y(x,z)+r*.6,z,root);o.scale.set(.85,1.7,1);}
 label('黄满寨 · 谷中上行',levelSafe(fallsChapter).spawn.x-4,4.7,levelSafe(fallsChapter).spawn.z-7,7,colors.ink);label('五级飞瀑 · 高差为游戏示意',36,21,8,8,colors.ink);label('上谷平台 → 密信任务棚',-28,34,-62,7.5,colors.ink);drawRoomLabel(ctx,L);done();
}
function levelSafe(asset){return asset.rawLevel;}
export const eastDrawers={'chaoan-tianchi':drawTianchi,'raoping-daoyun':drawDaoyun,'huilai-jinghai':drawJinghai,'jiexi-falls':drawFalls};
