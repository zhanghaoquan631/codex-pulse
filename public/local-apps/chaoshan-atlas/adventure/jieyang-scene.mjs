import {jieyangOsmWays,jieyangGeoMeta} from './jieyang-geo-data.mjs';

// WGS84, east +X and north -Z. Every mapped horizontal feature uses one scale.
export const JIEYANG_ORIGIN={lon:116.3869,lat:23.56772};
export const JIEYANG_SCALE=.25;
export const JIEYANG_BOUNDS={minX:-36,maxX:125,minZ:-76,maxZ:52};
export const projectJieyang=({lon,lat})=>({x:(lon-JIEYANG_ORIGIN.lon)*Math.PI/180*6378137*Math.cos(JIEYANG_ORIGIN.lat*Math.PI/180)*JIEYANG_SCALE,z:-(lat-JIEYANG_ORIGIN.lat)*Math.PI/180*6378137*JIEYANG_SCALE});
export const unprojectJieyang=({x,z})=>({lon:JIEYANG_ORIGIN.lon+x/(Math.PI/180*6378137*Math.cos(JIEYANG_ORIGIN.lat*Math.PI/180)*JIEYANG_SCALE),lat:JIEYANG_ORIGIN.lat-z/(Math.PI/180*6378137*JIEYANG_SCALE)});
const source=new Map(jieyangOsmWays.map(w=>[w.id,w]));
const points=id=>source.get(id).geometry.map(projectJieyang);
const centroid=ps=>{const q=ps.slice(0,-1);return {x:q.reduce((s,p)=>s+p.x,0)/q.length,z:q.reduce((s,p)=>s+p.z,0)/q.length};};
function clipSegment(a,b){
  let lo=0,hi=1;
  for(const [v,d,min,max]of[[a.x,b.x-a.x,JIEYANG_BOUNDS.minX,JIEYANG_BOUNDS.maxX],[a.z,b.z-a.z,JIEYANG_BOUNDS.minZ,JIEYANG_BOUNDS.maxZ]]){
    if(Math.abs(d)<1e-9){if(v<min||v>max)return null;continue;}
    let t0=(min-v)/d,t1=(max-v)/d;if(t0>t1)[t0,t1]=[t1,t0];lo=Math.max(lo,t0);hi=Math.min(hi,t1);if(lo>hi)return null;
  }
  return [{x:a.x+(b.x-a.x)*lo,z:a.z+(b.z-a.z)*lo},{x:a.x+(b.x-a.x)*hi,z:a.z+(b.z-a.z)*hi}];
}
function clipPolygon(ps){
  let out=ps.slice(0,-1);
  for(const [axis,bound,sign]of[['x',JIEYANG_BOUNDS.minX,1],['x',JIEYANG_BOUNDS.maxX,-1],['z',JIEYANG_BOUNDS.minZ,1],['z',JIEYANG_BOUNDS.maxZ,-1]]){
    const input=out;out=[];if(!input.length)break;
    for(let i=0;i<input.length;i++){
      const a=input[i],b=input[(i+1)%input.length],ia=(a[axis]-bound)*sign>=0,ib=(b[axis]-bound)*sign>=0;
      if(ia)out.push(a);if(ia!==ib){const t=(bound-a[axis])/(b[axis]-a[axis]);out.push({x:a.x+(b.x-a.x)*t,z:a.z+(b.z-a.z)*t});}
    }
  }
  return out.length?[...out,{...out[0]}]:[];
}
export function pointInJieyangPolygon(p,ps){let inside=false;for(let i=0,j=ps.length-1;i<ps.length;j=i++){const a=ps[i],b=ps[j];if((a.z>p.z)!==(b.z>p.z)&&p.x<(b.x-a.x)*(p.z-a.z)/(b.z-a.z)+a.x)inside=!inside;}return inside;}
function area(id,kind,name){return {id:`osm-${id}`,osmWayId:id,kind,name,points:points(id),clippedPoints:clipPolygon(points(id)),sourceTags:{...source.get(id).tags}};}
function road(id,name,width){const ps=points(id),segments=[];for(let i=1;i<ps.length;i++){const pair=clipSegment(ps[i-1],ps[i]);if(pair)segments.push({a:pair[0],b:pair[1]});}return {id:`osm-road-${id}`,osmWayId:id,name,width,widthSource:'Illustrative width, not surveyed; source supplies centerline only.',points:ps,segments};}
function sourceBuilding(id,name,height){
  const ps=points(id),center=centroid(ps);let edge={x:0,z:1},length=0;
  for(let i=1;i<ps.length;i++){const dx=ps[i].x-ps[i-1].x,dz=ps[i].z-ps[i-1].z,l=Math.hypot(dx,dz);if(l>length){length=l;edge={x:dx/l,z:dz/l};}}
  if(edge.z<0){edge.x*=-1;edge.z*=-1;}const rotation=Math.atan2(edge.x,edge.z),c=Math.cos(rotation),s=Math.sin(rotation);
  const local=ps.map(p=>({x:c*(p.x-center.x)-s*(p.z-center.z),z:s*(p.x-center.x)+c*(p.z-center.z)}));
  return {...area(id,'building',name),...center,rotation,w:Math.max(...local.map(p=>p.x))-Math.min(...local.map(p=>p.x)),d:Math.max(...local.map(p=>p.z))-Math.min(...local.map(p=>p.z)),height};
}

export const jieyangLayout={
  source:'osm-jieyang-square',origin:JIEYANG_ORIGIN,scale:JIEYANG_SCALE,bounds:JIEYANG_BOUNDS,metadata:jieyangGeoMeta,
  plaza:area(904362686,'square','揭阳楼广场'),
  buildings:[sourceBuilding(904362690,'揭阳楼',38*JIEYANG_SCALE),sourceBuilding(904362689,'南翼楼',4.5),sourceBuilding(904362691,'北翼楼',4.5)],
  waters:[area(43320257,'river','榕江北河'),area(904362687,'canal','楼西水渠')],
  gardens:[area(904362680,'green','东南绿带'),area(904362681,'green','北侧道路绿带'),area(904362683,'green','东侧环岛绿地'),area(904362684,'grassland','广场东南草地'),area(904362685,'grassland','广场东北草地'),area(904362688,'wood','楼西北林地'),area(1101367485,'park','滨江绿地')],
  roads:[road(142771502,'环市北路',3.5),road(219775510,'环市北路',3.5),road(1312707332,'临江北路',3.3),road(1312707333,'临江北路',3.3),road(677111486,'广场北侧道路',2.6),road(677111487,'广场东侧连接路',2.6),road(677115525,'广场东侧连接路',2.6),road(677115526,'广场南侧道路',2.6),road(904362677,'东侧匝道',2.2),road(904362678,'东侧匝道',2.2)],
  // The bronze ding is documented east of the tower, but OSM has no surveyed
  // point for it. It is intentionally not given an invented geographic pin.
  interpretation:'真实广场、楼体、水面、草地轮廓与道路中心线；平地Y=0。屋檐细节、铺地缝、灯具和任务设施为手绘重构。',
};

const wall=(id,x,z,w,d,height=2.5,extra={})=>({id,x,z,w,d,height,...extra});
function edgeWall(id,a,b,height,kind,d=.24){return wall(id,(a.x+b.x)/2,(a.z+b.z)/2,Math.hypot(b.x-a.x,b.z-a.z),d,height,{rotation:Math.atan2(-(b.z-a.z),b.x-a.x),kind});}
export const jieyangHuntSites={
  room:{id:'jieyang-task-room',x:14,z:-34,w:9,d:9,height:2.8,geography:'游戏临时任务棚；设在OSM广场内，非揭阳楼真实内部'},
  door:{id:'hall-door',x:18.5,z:-34,w:.35,d:4.4,open:false,label:'楼前任务棚密码门',height:2.6},
  taskPoint:{x:15,z:-32.8,radius:1.65},
  boss:{id:'tower-night-boss',name:'楼前墨影守将',type:'boss',x:12.5,z:-36,hp:280,maxHp:280,damage:17},
  clueSites:[{x:68,z:-26},{x:46,z:-30}],
};
export function makeJieyangWalls(){
  const b=JIEYANG_BOUNDS,list=[wall('edge-west',b.minX,(b.minZ+b.maxZ)/2,.4,b.maxZ-b.minZ,3.8,{kind:'invisible'}),wall('edge-east',b.maxX,(b.minZ+b.maxZ)/2,.4,b.maxZ-b.minZ,3.8,{kind:'invisible'}),wall('edge-north',(b.minX+b.maxX)/2,b.minZ,b.maxX-b.minX,.4,3.8,{kind:'invisible'}),wall('edge-south',(b.minX+b.maxX)/2,b.maxZ,b.maxX-b.minX,.4,3.8,{kind:'invisible'})];
  for(const item of jieyangLayout.buildings)for(let i=1;i<item.points.length;i++)list.push(edgeWall(`jieyang-building-${item.osmWayId}-${i}`,item.points[i-1],item.points[i],item.height,'jieyang-building'));
  for(const item of jieyangLayout.waters)for(let i=1;i<item.clippedPoints.length;i++)list.push(edgeWall(`jieyang-water-${item.osmWayId}-${i}`,item.clippedPoints[i-1],item.clippedPoints[i],3.8,'jieyang-water'));
  // Temporary festival equipment, never presented as real mapped structures.
  list.push(wall('jieyang-task-gate-north',78,-26,.7,6,2.5,{kind:'jieyang-task'}),wall('jieyang-task-gate-south',78,-14,.7,6,2.5,{kind:'jieyang-task'}));
  for(const [id,x,z,w,d]of[['north',34,-23,2.1,1.1],['south',41,-6,2,1.1],['east',47,-16,1.1,2.1]])list.push(wall(`jieyang-supply-${id}`,x,z,w,d,1.1,{kind:'jieyang-supply'}));
  list.push(wall('jieyang-task-room-west',9.5,-34,.35,9.35,2.8,{kind:'jieyang-room'}),wall('jieyang-task-room-north',14,-38.5,9.35,.35,2.8,{kind:'jieyang-room'}),wall('jieyang-task-room-south',14,-29.5,9.35,.35,2.8,{kind:'jieyang-room'}),wall('jieyang-task-room-east-n',18.5,-37.35,.35,2.3,2.8,{kind:'jieyang-room'}),wall('jieyang-task-room-east-s',18.5,-30.65,.35,2.3,2.8,{kind:'jieyang-room'}));
  return list;
}
const enemy=(id,x,z,type,encounterId,rank=1,extra={})=>({id,x,z,type,encounterId,rank,...extra});
export const jieyangLevel={
  id:'jieyang-tower',title:'第三章 · 楼前守灯',shortTitle:'揭阳楼',theme:'tower',placeId:'jieyang-tower',ll:[116.3869,23.56772],region:'揭阳市',layout:'osm-jieyang-square',
  art:{style:'paper-ink',accent:0xa86d58,sky:0xe8e6de,water:0xb7d0d4,identity:'西楼东场 · 北路南江 · 五组护灯战'},
  landform:{type:'flat-plaza',note:'OSM真实水平几何统一0.25缩尺；游戏地面Y=0，无DEM，不虚构分级城台或护送坡道。'},
  description:'揭阳楼立于广场西侧，环市北路绕过北侧，榕江在南侧展开。打开临时通道，护送守灯人穿过楼前广场，再抵挡两轮来袭。',
  objectiveText:'清东场 → 开通道 → 护送守灯人向西 → 击退两轮守灯怪群 → 守满26秒 → 到灯阵交付',
  sourceNote:'广场/楼体/水面/绿地边界与道路中心线来自2026-09-12 OSM快照。任务围挡与灯阵为游戏设施；未获取地表高程。',
  bounds:{...JIEYANG_BOUNDS},spawn:{x:90,z:-21},exit:{x:37,z:-15,radius:2.5},
  lighting:{background:0x253d52,fog:0x253d52,ground:0xc8c5b4,sun:0xabc7e6,intensity:1.5,ambient:1.5,time:'入夜'},
  walls:makeJieyangWalls(),
  doors:[{id:'escort-gate',x:78,z:-20,w:.45,d:6,open:false,label:'护灯临时通道',height:2.3},{...jieyangHuntSites.door}],
  switches:[],collectibles:[],npcs:[{id:'tower-merchant',x:89,z:-26,type:'merchant',name:'东场护灯补给'}],
  escort:{id:'lamp-keeper',name:'守灯人',x:84,z:-21,hp:200,maxHp:200,speed:1.65,followRadius:10,waypoints:[{x:78,z:-20},{x:73,z:-22},{x:62,z:-23},{x:51,z:-21},{x:42,z:-19},{x:37,z:-15}]},
  encounters:[
    {id:'tower-east-watch',name:'东场清障 · 4 怪',trigger:{}},
    {id:'tower-escort-first',name:'广场护送 · 4 怪',trigger:{after:'tower-east-watch',escortStarted:true}},
    {id:'tower-escort-second',name:'楼前拦截 · 4 怪',trigger:{after:'tower-escort-first',near:{x:52,z:-21,radius:12}},reward:{heal:12,medkit:1}},
    {id:'tower-defend-first',name:'守灯首轮 · 5 怪',trigger:{after:'tower-escort-second',escortReached:true}},
    {id:'tower-defend-final',name:'守灯终轮 · 5 怪',trigger:{after:'tower-defend-first',escortReached:true}},
  ],
  enemies:[
    enemy('tower-shade-west',85,-32,'shade','tower-east-watch'),enemy('tower-scout',87,-12,'lantern','tower-east-watch'),enemy('tower-east-ink',82,-28,'inkling','tower-east-watch'),enemy('tower-east-paper',89,-17,'doodler','tower-east-watch'),
    enemy('tower-archer-east',64,-28,'archer','tower-escort-first'),enemy('tower-path-shade',67,-23,'shade','tower-escort-first'),enemy('tower-path-ink',62,-16,'inkling','tower-escort-first'),enemy('tower-paper-sentry',65,-31,'doodler','tower-escort-first'),
    enemy('tower-guard',43,-27,'brute','tower-escort-second',2),enemy('tower-shade-north',48,-33,'shade','tower-escort-second',2),enemy('tower-middle-paper',49,-12,'doodler','tower-escort-second',2),enemy('tower-middle-lantern',40,-24,'lantern','tower-escort-second',2),
    enemy('tower-defense-archer-n',31,-30,'archer','tower-defend-first',2),enemy('tower-defense-shade-e',50,-23,'shade','tower-defend-first',2),enemy('tower-defense-brute-s',42,-3,'brute','tower-defend-first',2),enemy('tower-defense-paper-w',27,-25,'doodler','tower-defend-first',2),enemy('tower-defense-lantern-e',49,-10,'lantern','tower-defend-first',2),
    enemy('tower-final-brute',29,-29,'brute','tower-defend-final',3),enemy('tower-final-archer',53,-18,'archer','tower-defend-final',3),enemy('tower-final-shade',33,-4,'shade','tower-defend-final',3),enemy('tower-final-doodler',43,-33,'doodler','tower-defend-final',3),enemy('tower-final-lantern',48,-6,'lantern','tower-defend-final',3),
  ],
  defendAfterEscort:true,defendZone:{x:37,z:-15,radius:6.4,blockingRadius:6},
  goals:{kills:'all',escort:true,defendSeconds:26,doors:['escort-gate']},reward:{xp:300,gold:245},decorations:[],
};

/** Shared world's helper interface; draw mapped geometry before active objects. */
export function drawJieyang({THREE,root,level,mesh,box,cylinder,stroke,mat,label,outline,geo,colors,tagStructure,tagNew,isStructureNode}){
  const firstChild=root.children.length;
  function group(o,name){const g=new THREE.Group();g.name=name||o.id;g.position.set(o.x||0,0,o.z||0);g.rotation.y=o.rotation||0;root.add(g);tagStructure?.(g,o.id);return g;}
  function polygon(ps,y,color){
    if(ps.length<4)return;const p=ps.slice(0,-1),shape=p.map(q=>new THREE.Vector2(q.x,q.z)),triangles=THREE.ShapeUtils.triangulateShape(shape,[]),vertices=[];
    for(const tri of triangles)for(const i of tri)vertices.push(p[i].x,y,p[i].z);
    const g=geo(new THREE.BufferGeometry());g.setAttribute('position',new THREE.Float32BufferAttribute(vertices,3));g.computeVertexNormals();mesh(g,mat(color,{side:THREE.DoubleSide}),0,0,0,root,false);stroke(ps.map(p=>[p.x,y+.012,p.z]),root,false);
  }
  polygon(jieyangLayout.plaza.clippedPoints,.024,colors.wall);
  for(const garden of jieyangLayout.gardens){
    polygon(garden.clippedPoints,.037,colors.glow);
    // Sparse ink tufts show mapped vegetation without inventing paths or walls.
    const ps=garden.clippedPoints;if(!ps.length)continue;
    const minX=Math.min(...ps.map(p=>p.x)),maxX=Math.max(...ps.map(p=>p.x)),minZ=Math.min(...ps.map(p=>p.z)),maxZ=Math.max(...ps.map(p=>p.z));
    for(let x=minX+1.5;x<maxX;x+=4.5)for(let z=minZ+1.5;z<maxZ;z+=4.5)if(pointInJieyangPolygon({x,z},ps)){stroke([[x-.3,.08,z],[x,.45,z],[x+.3,.08,z]],root,false);stroke([[x,.08,z],[x+.55,.3,z+.2]],root,false);}
  }
  for(const water of jieyangLayout.waters){
    polygon(water.clippedPoints,.06,colors.water);
    for(let x=JIEYANG_BOUNDS.minX+2;x<JIEYANG_BOUNDS.maxX;x+=6.5)for(let z=JIEYANG_BOUNDS.minZ+2;z<JIEYANG_BOUNDS.maxZ;z+=6)if(pointInJieyangPolygon({x,z},water.clippedPoints)&&pointInJieyangPolygon({x:x+2,z},water.clippedPoints))stroke([[x,.085,z],[x+.6,.085,z-.12],[x+2,.085,z]],root,false);
  }
  for(const road of jieyangLayout.roads)for(const seg of road.segments){
    const dx=seg.b.x-seg.a.x,dz=seg.b.z-seg.a.z,length=Math.hypot(dx,dz),g=group({x:(seg.a.x+seg.b.x)/2,z:(seg.a.z+seg.b.z)/2,rotation:Math.atan2(dx,dz)},road.id);
    box(0,.01,0,road.width,.025,length+.03,colors.stone,g);
    for(const side of[-1,1])stroke([[side*road.width/2,.052,-length/2],[side*road.width/2,.052,length/2]],g,false);
  }
  // Stone joints are clipped to the mapped plaza, leaving grass beds untouched.
  for(let x=4;x<96;x+=4)for(let z=-59;z<36;z+=4)if(pointInJieyangPolygon({x,z},jieyangLayout.plaza.points)&&pointInJieyangPolygon({x:x+1.2,z},jieyangLayout.plaza.points)&&!jieyangLayout.gardens.some(a=>pointInJieyangPolygon({x,z},a.points)))stroke([[x,.052,z],[x+1.2,.052,z]],root,false);
  function roof(g,w,d,y,h){
    const vertices=[],idx=[];
    for(const [sx,sz,yy]of[[1,1,y],[.84,.86,y-.14],[.48,.73,y+h*.58],[.02,.64,y+h]])for(const [x,z]of[[-1,-1],[1,-1],[1,1],[-1,1]])vertices.push(x*w*sx/2,yy,z*d*sz/2);
    for(let j=0;j<3;j++)for(let i=0;i<4;i++){const a=j*4+i,b=j*4+(i+1)%4;idx.push(a,a+4,b,b,a+4,b+4);}
    const geometry=geo(new THREE.BufferGeometry());geometry.setAttribute('position',new THREE.Float32BufferAttribute(vertices,3));geometry.setIndex(idx);geometry.computeVertexNormals();outline(mesh(geometry,mat(colors.roof,{side:THREE.DoubleSide}),0,0,0,g),28);
  }
  for(const building of jieyangLayout.buildings){
    const start=root.children.length;
    const g=group(building,`jieyang-landmark-${building.osmWayId}`),main=building.osmWayId===904362690;
    // Extrusion uses original vertices; the roof articulation is illustrative.
    polygon(building.points,main?3.1:2.8,colors.stone);
    for(let i=1;i<building.points.length;i++){
      const a=building.points[i-1],b=building.points[i],edge=group({x:(a.x+b.x)/2,z:(a.z+b.z)/2,rotation:Math.atan2(-(b.z-a.z),b.x-a.x)},'jieyang-plinth-face');
      box(0,0,0,Math.hypot(b.x-a.x,b.z-a.z),main?3.1:2.8,.15,colors.stone,edge);
      for(const y of[.7,1.4,2.1])stroke([[-Math.hypot(b.x-a.x,b.z-a.z)/2,y,.09],[Math.hypot(b.x-a.x,b.z-a.z)/2,y,.09]],edge,false);
    }
    if(main){
      box(0,3.1,0,building.w*.74,2.2,building.d*.88,colors.wall,g);roof(g,building.w+1.5,building.d+1.2,5.1,1.2);
      box(0,5.7,0,building.w*.52,1.45,building.d*.73,colors.wall,g);roof(g,building.w*.94,building.d*.95,7,1);
      box(0,7.5,0,building.w*.34,.7,building.d*.53,colors.wall,g);roof(g,building.w*.76,building.d*.73,8.2,1.3);
      for(const v of[-4,-2,0,2,4])for(const side of[-1,1])cylinder(side*building.w*.36,3.1,v,.1,.12,2,colors.red,g,8);
      // East-facing plaque follows the surveyed tower orientation.
      const plaque=new THREE.Group();plaque.position.set(building.w*.39,0,0);plaque.rotation.y=Math.PI/2;g.add(plaque);label('揭阳楼',0,4.1,.08,2.3,colors.ink,plaque);
    }else{box(0,2.8,0,building.w*.74,.8,building.d*.9,colors.wall,g);roof(g,building.w+.7,building.d+.65,3.4,1.1);}
    tagNew?.(root,start,`jieyang-building-${building.osmWayId}-1`);
  }
  for(const item of level.walls.filter(w=>w.kind==='jieyang-task'||w.kind==='jieyang-supply'||w.kind==='jieyang-room')){
    const g=group(item,item.id);box(0,0,0,item.w,item.height,item.d,item.kind==='jieyang-room'?colors.wall:colors.wood,g);
    for(const y of[.25,item.height-.2])box(0,y,0,item.w+.06,.09,item.d+.06,colors.red,g);
  }
  // Removable fabric shelter belongs to the game, not the real tower interior.
  box(14,.015,-34,8.7,.035,8.7,colors.wood);
  const roomSign=group({x:18.75,z:-34,rotation:Math.PI/2},'jieyang-task-room-sign');label('游戏任务棚',0,3.15,0,3.5,colors.ink,roomSign);
  for(const x of[10,18])for(const z of[-38,-30])cylinder(x,2.8,z,.035,.05,.45,colors.wood);
  stroke([[10,3.2,-38],[18,3.2,-38],[18,3.2,-30],[10,3.2,-30],[10,3.2,-38]],root,false);
  label('护灯补给',89,2.1,-26,3.5,colors.ink);
  label('临时护灯通道',78,3.3,-20,3.8,colors.ink);
  label('楼前守灯阵',37,2.3,-15,4,colors.ink);
  for(const [x,z]of[[34,-19],[41,-19],[34,-11],[41,-11],[83,-26],[83,-16]]){
    cylinder(x,0,z,.045,.07,2.15,colors.wood);const lamp=mesh(geo(new THREE.SphereGeometry(.25,8,6)),mat(colors.red),x,2.25,z);lamp.scale.y=1.3;outline(lamp,45);
  }
  // Direction names are source-backed; decorative marker position is editorial.
  for(const [text,x,z]of[['环市北路 · 北',35,-65],['临江北路 · 南',51,23],['榕江北河',83,33],['揭阳楼广场',65,-38]])label(text,x,2.1,z,5,colors.ink);
  // Hundreds of tiny paving/grass strokes share one ink material. Consolidate
  // them without touching labels or the shared world's interactive objects.
  root.updateMatrixWorld(true);const lines=[],byMaterial=new Map(),p=new THREE.Vector3(),rootInverse=root.matrixWorld.clone().invert();
  for(const child of root.children.slice(firstChild))child.traverse(o=>{if(o.isLine&&!isStructureNode?.(o))lines.push(o);});
  for(const line of lines){
    const values=byMaterial.get(line.material)||[],positions=line.geometry.attributes.position,transform=rootInverse.clone().multiply(line.matrixWorld),step=line.isLineSegments?2:1;
    for(let i=0;i<positions.count-1;i+=step)for(const j of[i,i+1]){p.fromBufferAttribute(positions,j).applyMatrix4(transform);values.push(p.x,p.y,p.z);}
    byMaterial.set(line.material,values);line.removeFromParent();
  }
  for(const [material,values]of byMaterial){const geometry=geo(new THREE.BufferGeometry());geometry.setAttribute('position',new THREE.Float32BufferAttribute(values,3));const lines=new THREE.LineSegments(geometry,material);lines.name='jieyang-batched-ink';root.add(lines);}
}

export default jieyangLevel;
