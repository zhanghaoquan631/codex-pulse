import {osmSmallParkWays} from './small-park-osm-data.mjs';
// Five-road relation from OSM, with a human-scale playable distance reduction.
// Facades, rooms and combat use are reconstructions, not surveyed interiors.
export const PARK_SCALE=.5;
export const PARK_ORIGIN={lon:116.669452,lat:23.357849};
export const PARK_BOUNDS={minX:-66,maxX:76,minZ:-66,maxZ:58};
export const parkPoint=(center,u,v)=>({x:center.x+Math.cos(center.rotation||0)*u+Math.sin(center.rotation||0)*v,z:center.z-Math.sin(center.rotation||0)*u+Math.cos(center.rotation||0)*v});
export const projectSmallPark=({lon,lat})=>({x:(lon-PARK_ORIGIN.lon)*Math.PI/180*6378137*Math.cos(PARK_ORIGIN.lat*Math.PI/180)*PARK_SCALE,z:-(lat-PARK_ORIGIN.lat)*Math.PI/180*6378137*PARK_SCALE});
const source=new Map(osmSmallParkWays.map(w=>[w.id,w]));
function clipSegment(a,b){let lo=0,hi=1;for(const [p,d,min,max]of[[a.x,b.x-a.x,PARK_BOUNDS.minX,PARK_BOUNDS.maxX],[a.z,b.z-a.z,PARK_BOUNDS.minZ,PARK_BOUNDS.maxZ]]){if(Math.abs(d)<1e-9){if(p<min||p>max)return null;continue;}let t0=(min-p)/d,t1=(max-p)/d;if(t0>t1)[t0,t1]=[t1,t0];lo=Math.max(lo,t0);hi=Math.min(hi,t1);if(lo>hi)return null;}return [{x:a.x+(b.x-a.x)*lo,z:a.z+(b.z-a.z)*lo},{x:a.x+(b.x-a.x)*hi,z:a.z+(b.z-a.z)*hi}];}
function road(id,name,width,role){const way=source.get(id),points=way.geometry.map(projectSmallPark),segments=[];for(let i=1;i<points.length;i++){const pair=clipSegment(points[i-1],points[i]);if(pair)segments.push({a:pair[0],b:pair[1]});}return {id:'osm-road-'+id,osmWayId:id,name,width,role,segments,points};}
const roads=[road(147149284,'国平路 · 北',4.8,'main'),road(532956289,'升平路 · 西',5.2,'main'),road(586781359,'升平路 · 东',5.2,'main'),road(147133469,'安平路',5.2,'main'),road(147133472,'南支路',4.8,'main-inferred-name'),road(532956319,'同平路',4.5,'loop'),road(147149273,'旧公园前路',4.5,'loop'),road(532956290,'环亭连接',3.5,'ring')];
const room=(id,x,z,w,d,rotation,height,doorOffset=0)=>({id,x,z,w,d,rotation,height,doorOffset,doorWidth:2.2});
function frontageAt(wayId,distance,side){const r=roads.find(r=>r.osmWayId===wayId);for(const seg of r.segments){const dx=seg.b.x-seg.a.x,dz=seg.b.z-seg.a.z,length=Math.hypot(dx,dz);if(distance<=length){const t=distance/length,nx=-dz/length,nz=dx/length,offset=r.width/2+4.0;return {x:seg.a.x+dx*t+nx*offset*side,z:seg.a.z+dz*t+nz*offset*side,rotation:Math.atan2(-nx*side,-nz*side),osmWayId:wayId};}distance-=length;}throw Error('Missing frontage');}
const teaSite=frontageAt(532956289,16,1),craftSite=frontageAt(532956319,34,-1),warehouseSite=frontageAt(147149284,31,1);
const rooms=[{...room('tea',teaSite.x,teaSite.z,6,5.5,teaSite.rotation,2.7),osmWayId:teaSite.osmWayId},{...room('craft',craftSite.x,craftSite.z,6,5.5,craftSite.rotation,2.7),osmWayId:craftSite.osmWayId},{...room('warehouse',warehouseSite.x,warehouseSite.z,6,5.5,warehouseSite.rotation,2.7,0),osmWayId:warehouseSite.osmWayId}];
const nansheng=source.get(532956292).geometry.map(projectSmallPark);
function pointSegment(p,a,b){const dx=b.x-a.x,dz=b.z-a.z,t=Math.max(0,Math.min(1,((p.x-a.x)*dx+(p.z-a.z)*dz)/(dx*dx+dz*dz||1)));return Math.hypot(p.x-a.x-t*dx,p.z-a.z-t*dz);}
function nearRoad(p,ignore){return roads.some(r=>r!==ignore&&r.role!=='ring'&&r.segments.some(s=>pointSegment(p,s.a,s.b)<r.width/2+4));}
const arcades=rooms.map((r,i)=>({...r,id:'task-arcade-'+r.id,height:7.8,taskRoom:r.id,sector:i}));
for(const r of roads.filter(r=>r.role!=='ring'))for(const [si,seg]of r.segments.entries()){
 const dx=seg.b.x-seg.a.x,dz=seg.b.z-seg.a.z,length=Math.hypot(dx,dz);if(length<7)continue;
 for(let t=3.6;t<length-2;t+=6.5)for(const side of[-1,1]){
  const nx=-dz/length,nz=dx/length,offset=r.width/2+4,p={x:seg.a.x+dx*t/length+nx*offset*side,z:seg.a.z+dz*t/length+nz*offset*side};
  if(Math.hypot(p.x,p.z)<14||p.x<PARK_BOUNDS.minX+4||p.x>PARK_BOUNDS.maxX-4||p.z<PARK_BOUNDS.minZ+4||p.z>PARK_BOUNDS.maxZ-4||nearRoad(p,r)||rooms.some(q=>Math.hypot(q.x-p.x,q.z-p.z)<7)||nansheng.some(q=>Math.hypot(q.x-p.x,q.z-p.z)<8)||arcades.some(q=>Math.hypot(q.x-p.x,q.z-p.z)<5.8))continue;
  arcades.push({id:'street-arcade-'+r.osmWayId+'-'+si+'-'+Math.round(t)+'-'+side,x:p.x,z:p.z,rotation:Math.atan2(-nx*side,-nz*side),w:6,d:5.5,height:7.8+(arcades.length%3)*.8,sector:arcades.length%7,osmWayId:r.osmWayId});
 }
}
export const smallParkLayout={source:'osm-small-park-five-roads',scale:PARK_SCALE,origin:PARK_ORIGIN,bounds:PARK_BOUNDS,provenance:'OSM way geometry from 2026-09-11 Overpass downloads; OpenStreetMap contributors, ODbL.',interpretation:'有来源的五路关系缩尺关卡；道路宽度、骑楼立面、店铺室内与战斗用途为游戏重构。',roads,arcades,rooms,nansheng:{osmWayId:532956292,points:nansheng,floors:7,height:16.1},plaza:{osmWayId:582929162,points:source.get(582929162).geometry.map(projectSmallPark)},pavilion:{osmWayId:532956287,points:source.get(532956287).geometry.map(projectSmallPark),radius:2.6,columnRadius:1.55},market:[],gardens:[],corners:[]};
function rect(id,center,u,v,w,d,height,extra={}){return {id,...parkPoint(center,u,v),w,d,height,rotation:center.rotation||0,kind:'park-wall',...extra};}
function roomWalls(r){
  const prefix=r.id,half=r.w/2,front=r.d/2,edge=.22,doorL=r.doorOffset-r.doorWidth/2,doorR=r.doorOffset+r.doorWidth/2;
  const names=prefix==='tea'?['tea-north','tea-south','tea-west','tea-east-a','tea-east-b']:prefix==='craft'?['craft-north','craft-south','craft-east','craft-west-a','craft-west-b']:['warehouse-west','warehouse-east','warehouse-back','warehouse-front-a','warehouse-front-b'];
  return [rect(names[0],r,-half,0,edge,r.d,r.height),rect(names[1],r,half,0,edge,r.d,r.height),rect(names[2],r,0,-front,r.w+edge,edge,r.height),rect(names[3],r,(-half+doorL)/2,front,doorL+half,edge,r.height),rect(names[4],r,(doorR+half)/2,front,half-doorR,edge,r.height)];
}
export function makeSmallParkWalls(){
  const list=rooms.flatMap(roomWalls);
  for(const a of arcades){
    // Bodies can pass through the column arcade; the upper volume still stops
    // cameras and arrows. The engine resolves height as well as rotation.
    list.push(rect(`${a.id}-upper`,a,0,0,a.w,a.d,a.height-2.7,{baseY:2.7,kind:'park-upper'}));
    if(!a.taskRoom)list.push(rect(`${a.id}-back`,a,0,-a.d/2,a.w,.24,2.7));
    for(const u of[-2,0,2])if(!(a.taskRoom&&u===0))list.push(rect(`${a.id}-column-${u}`,a,u,a.d/2,.4,.5,2.7,{kind:'park-column'}));
  }
  for(let i=0;i<8;i++){
    const angle=i*Math.PI/4,ids=['pavilion-2.6-b','pavilion-diagonal-1','pavilion-2.6-a','pavilion-diagonal-3','pavilion--2.6-a','pavilion-diagonal-5','pavilion--2.6-b','pavilion-diagonal-7'];
    list.push({id:ids[i],x:Math.cos(angle)*1.55,z:Math.sin(angle)*1.55,w:.28,d:.28,height:3.3,kind:'park-pavilion-column'});
  }
  const tea=rooms[0],craft=rooms[1],warehouse=rooms[2];
  list.push(rect('tea-counter',tea,-.95,-.7,.62,1.45,.9,{kind:'park-counter'}),rect('craft-counter',craft,.95,-.8,.7,1.45,.9,{kind:'park-counter'}),rect('crate-cover',warehouse,-1.8,-1.35,1,1,1.1,{kind:'park-crate'}));
  for(let i=1;i<nansheng.length;i++){
    const a=nansheng[i-1],b=nansheng[i],length=Math.hypot(b.x-a.x,b.z-a.z);
    list.push({id:`nansheng-edge-${i}`,x:(a.x+b.x)/2,z:(a.z+b.z)/2,w:length,d:.24,height:16.1,rotation:Math.atan2(-(b.z-a.z),b.x-a.x),kind:'park-historic'});
  }
  return list;
}
export const smallParkDoors=rooms.map(r=>({id:`${r.id}-door`,...parkPoint(r,r.doorOffset,r.d/2),w:r.doorWidth,d:.22,rotation:r.rotation,height:2.35,open:r.id!=='warehouse',locked:r.id==='warehouse',...(r.id==='warehouse'?{keyIds:['warehouse-key','parcel-mark']}:{}),label:r.id==='tea'?'茶铺木门':r.id==='craft'?'花艺铺木门':'北侧骑楼仓门'}));
export const smallParkQuest={
  spawn:{x:14.2,z:28},exit:{...parkPoint(rooms[2],.7,-1.05),radius:1.6},
  collectibles:[{id:'warehouse-key',...parkPoint(rooms[0],.35,-.6),kind:'key',name:'仓间钥匙'},{id:'parcel-mark',...parkPoint(rooms[1],-.55,-.65),kind:'clue',name:'货包凭记'}],
  merchant:{id:'merchant',x:9.7,z:12.2,type:'merchant',name:'街角商人'},
  enemies:[{id:'alley-ink',x:9.2,z:10.5,type:'inkling'},{id:'alley-shade',x:-43,z:-7,type:'shade'},{id:'warehouse-guard',...parkPoint(rooms[2],.8,-.75),type:'brute',hp:72,maxHp:72}],
};

/** Draw only the mapped setting; people, active doors and goals remain shared. */
export function drawSmallPark({THREE,root,level,mesh,box,cylinder,stroke,mat,label,outline,geo,colors,tagStructure,tagPart,tagNew,isStructureNode}){
  const layout=smallParkLayout;
  const firstChild=root.children.length;
  function group(o,name){const g=new THREE.Group();g.name=name||o.id||'map-small-park';g.position.set(o.x||0,0,o.z||0);g.rotation.y=o.rotation||0;root.add(g);tagStructure?.(g,o.id,`${o.id}-upper`,o.id==='tea'?'tea-north':o.id==='craft'?'craft-north':null);return g;}
  function polyRoof(parent,r,y,h){
    const v=[],idx=[];
    for(const [rr,yy]of[[r,y],[r*.76,y-.16],[r*.42,y+h*.45],[.05,y+h]])for(let i=0;i<8;i++){const a=i*Math.PI/4;v.push(Math.cos(a)*rr,yy,Math.sin(a)*rr);}
    for(let j=0;j<3;j++)for(let i=0;i<8;i++){const a=j*8+i,b=j*8+(i+1)%8;idx.push(a,a+8,b,b,a+8,b+8);}
    const geometry=geo(new THREE.BufferGeometry());geometry.setAttribute('position',new THREE.Float32BufferAttribute(v,3));geometry.setIndex(idx);geometry.computeVertexNormals();outline(mesh(geometry,mat(colors.roof,{side:THREE.DoubleSide}),0,0,0,parent),28);
  }
  function tree(parent,x,z,scale=.6){
    cylinder(x,0,z,.15*scale,.23*scale,2.3*scale,colors.wood,parent,6);
    for(const [dx,dy,dz,r]of[[0,3,0,1.3],[-.8,2.6,0,1],[.7,2.7,.3,1]]){const crown=mesh(geo(new THREE.IcosahedronGeometry(r*scale,0)),mat(colors.glow),x+dx*scale,dy*scale,z+dz*scale,parent);crown.scale.y=.7;outline(crown,40);}
  }
  function polygon(points,y,color){
    const p=points.slice(0,-1),shape=p.map(q=>new THREE.Vector2(q.x,q.z)),triangles=THREE.ShapeUtils.triangulateShape(shape,[]),vertices=[];
    for(const tri of triangles)for(const i of tri)vertices.push(p[i].x,y,p[i].z);
    const g=geo(new THREE.BufferGeometry());g.setAttribute('position',new THREE.Float32BufferAttribute(vertices,3));g.computeVertexNormals();mesh(g,mat(color,{side:THREE.DoubleSide}),0,0,0,root);stroke(points.map(p=>[p.x,y+.012,p.z]));
  }
  polygon(layout.plaza.points,.028,colors.wall);
  for(const road of layout.roads)for(const seg of road.segments){
    const dx=seg.b.x-seg.a.x,dz=seg.b.z-seg.a.z,length=Math.hypot(dx,dz),g=group({x:(seg.a.x+seg.b.x)/2,z:(seg.a.z+seg.b.z)/2,rotation:Math.atan2(dx,dz)},road.id);
    box(0,.007,0,road.width,.025,length+.04,colors.wall,g);for(const side of[-1,1])stroke([[side*road.width/2,.047,-length/2],[side*road.width/2,.047,length/2]],g);
  }
  const pavilion=group({x:0,z:0},'map-zhongshan-pavilion');
  tagStructure?.(pavilion,'pavilion-2.6-b');
  // Low sketched plinths keep this chapter's ground level; source horizontal
  // dimensions, eight supports and both octagonal eaves remain legible.
  polygon(layout.pavilion.points,.075,colors.stone);
  cylinder(0,.04,0,1.98,2.18,.065,colors.wall,pavilion,8);
  polyRoof(pavilion,2.6,3.5,1.05);cylinder(0,4.3,0,1.05,1.05,.8,colors.red,pavilion,8);polyRoof(pavilion,1.72,5.1,.75);cylinder(0,5.8,0,.04,.13,.55,colors.gold,pavilion,8);
  for(let i=0;i<8;i++){
    const a=i*Math.PI/4,b=(i+1)*Math.PI/4,x=Math.cos(a)*1.55,z=Math.sin(a)*1.55;
    const column=cylinder(x,0,z,.11,.14,3.3,colors.red,pavilion,8),columnWall=level.walls.find(w=>w.kind==='park-pavilion-column'&&Math.hypot(w.x-x,w.z-z)<.01);tagPart?.(column,columnWall?.id);
    stroke([[x,3.28,z],[Math.cos(b)*1.55,3.28,Math.sin(b)*1.55]],pavilion);
    const lamp=mesh(geo(new THREE.SphereGeometry(.16,8,6)),mat(colors.red),Math.cos(a)*1.65,2.92,Math.sin(a)*1.65,pavilion);lamp.scale.y=1.25;
  }
  label('中山纪念亭',0,3.13,1.65,1.95,colors.ink,pavilion);
  // All base walls and pillars use the exact same rotated rectangle as physics.
  for(const item of level.walls){
    if(!item.kind?.startsWith('park-')||item.kind==='park-upper'||item.kind==='park-pavilion-column')continue;
    const g=group(item,item.id),color=item.kind==='park-column'?colors.stone:item.kind==='park-counter'||item.kind==='park-crate'?colors.wood:colors.wall;
    box(0,0,0,item.w,item.height,item.d,color,g);
    if(item.kind==='park-crate')for(const y of[.14,item.height-.16])box(0,y,0,item.w+.02,.1,item.d+.02,colors.roof,g);
  }
  for(const a of layout.arcades){
    if(level.traversal?.replacedArcadeIds?.includes(a.id))continue;
    const g=group(a,a.id);box(0,2.7,0,a.w,a.height-2.7,a.d,colors.wall,g);box(0,a.height,0,a.w+.45,.23,a.d+.35,colors.roof,g);
    for(const y of[2.75,a.height-.4])box(0,y,0,a.w+.3,.17,a.d+.14,colors.stone,g);
    for(const u of[-2,0,2]){
      for(const y of[4,6.5]){box(u,y,a.d/2+.035,1.1,1.35,.06,colors.stone,g);stroke([[u,y+.05,a.d/2+.08],[u,y+1.29,a.d/2+.08]],g);stroke([[u-.5,y+.64,a.d/2+.08],[u+.5,y+.64,a.d/2+.08]],g);}
      const points=[];for(let k=0;k<=12;k++){const angle=Math.PI-k*Math.PI/12;points.push([u+Math.cos(angle)*.72,2.05+Math.sin(angle)*.58,a.d/2+.1]);}stroke(points,g);
    }
    for(const side of[-1,1])for(const v of[-1.4,.6])for(const y of[4,6.5])box(side*(a.w/2+.035),y,v,.06,1.3,.85,colors.stone,g);
  }
  for(const r of layout.rooms){
    const g=group(r,`map-${r.id}-interior`),text=r.id==='tea'?'游戏茶铺 · 线索':r.id==='craft'?'游戏花艺铺 · 凭记':'游戏仓间 · 北巷';
    label(text,0,r.id==='warehouse'?3.1:r.height+.33,r.d/2+.22,r.id==='warehouse'?3.6:3,colors.ink,g);
    if(r.id==='tea'){
      for(const z of[-1.05,-.5]){cylinder(-.96,.9,z,.14,.14,.1,colors.paper,g,8);cylinder(-.96,1,z,.09,.09,.13,colors.stone,g,8);}
      cylinder(-1,.9,-.2,.13,.17,.2,colors.wood,g,8);
    }else if(r.id==='craft')for(const z of[-1.25,-.75,-.25]){
      cylinder(.94,.9,z,.13,.15,.24,colors.wood,g,8);for(const side of[-1,1]){box(.94+side*.06,1.08,z,.025,.38,.025,colors.glow,g);mesh(geo(new THREE.IcosahedronGeometry(.13,0)),mat(colors.red),.94+side*.1,1.45,z,g);}
    }
  }
  for(const lot of layout.market){
    const dx=lot.end.x-lot.start.x,dz=lot.end.z-lot.start.z,g=group({x:(lot.end.x+lot.start.x)/2,z:(lot.end.z+lot.start.z)/2,rotation:Math.atan2(dx,dz)},`market-path-${lot.service}`);
    box(0,.035,0,1.25,.025,Math.hypot(dx,dz)+.4,colors.stone,g);
    if(lot.service==='soup'){const shop=group(lot,'map-low-soup-stall');box(0,0,-.6,3.3,2.25,1.9,colors.wall,shop);box(0,2.25,-.25,3.6,.16,2.65,colors.roof,shop);label('汤食铺',0,2.45,1.15,2.5,colors.ink,shop);for(const x of[-.7,.7]){cylinder(x,0,1,.3,.33,.58,colors.wood,shop,10);cylinder(x,.6,1,.4,.4,.08,colors.paper,shop,12);}}
  }
  for(const bed of layout.gardens){const g=group(bed);const island=mesh(geo(new THREE.CylinderGeometry(1,1,.035,20)),mat(colors.glow),0,.018,0,g);island.scale.set(bed.w/2,1,bed.d/2);tree(g,0,-2.4,.6);tree(g,0,2.4,.6);}
  for(const x of[-5.6,5.6]){const g=group({x,z:1.5},'plaza-bench');box(0,.46,0,1.8,.17,.7,colors.wood,g);box(0,.63,-.28,1.8,.55,.11,colors.wood,g);for(const u of[-.65,.65])box(u,0,0,.11,.46,.4,colors.stone,g);}
  for(const c of layout.corners){
    const g=group(c);box(0,.005,9.25,1.6,.04,11.5,colors.stone,g);box(0,0,-2,4.6,2.75,3.8,colors.wall,g);box(0,2.75,-2,5,.2,4.2,colors.roof,g);label(c.name,0,2.18,.02,2,colors.ink,g);tree(g,-4,-3,.8);tree(g,4,-3,.8);
    for(const u of[-2.5,2.5]){cylinder(u,0,2.5,.8,.8,.62,colors.wood,g,12);for(const v of[1.3,3.7])box(u,0,v,.85,.5,.75,colors.stone,g);}
  }
  const historic=layout.nansheng;
  const historicStart=root.children.length;
  polygon(historic.points,historic.height,colors.roof);
  for(let i=1;i<historic.points.length;i++){
    const a=historic.points[i-1],b=historic.points[i],dx=b.x-a.x,dz=b.z-a.z,length=Math.hypot(dx,dz),g=group({x:(a.x+b.x)/2,z:(a.z+b.z)/2,rotation:Math.atan2(-dz,dx)},'nansheng-facade');
    for(let floor=0;floor<7;floor++){
      box(0,floor*2.3,0,length+.12,.13,.32,colors.stone,g);
      for(let u=-length/2+.75;u<length/2-.4;u+=1.5)for(const side of[-1,1]){box(u,floor*2.3+.58,side*.15,.78,1.14,.055,colors.stone,g);stroke([[u,floor*2.3+.6,side*.19],[u,floor*2.3+1.7,side*.19]],g);}
    }
  }
  label('南生百货 · 七层',-10.8,16.8,17.7,4.5,colors.ink,root);
  tagNew?.(root,historicStart,'nansheng-edge-1');
  for(const [text,x,z,rotation]of[['国平路 · 北',3.8,-14,-Math.PI/2],['升平路 · 西',-18,-3.1,0],['升平路 · 东',18,-4.8,0],['安平路',-6,20,0],['南支路',10,16,0],['同平路',-49,-27,0],['旧公园前路',-25,-54,0]]){
    const g=group({x,z,rotation},'road-sign');box(0,0,0,.08,2.65,.08,colors.wood,g);label(text,0,2.65,.05,2.5,colors.ink,g);
  }
  // Batch the static pencil geometry. Labels retain their live font textures;
  // interactive doors and people are built afterwards by the shared renderer.
  root.updateMatrixWorld(true);
  const objects=[];for(const child of root.children.slice(firstChild))child.traverse(o=>{if(!isStructureNode?.(o)&&((o.isMesh&&!o.material.map)||o.isLine))objects.push(o);});
  const batches=new Map(),lines=new Map(),position=new THREE.Vector3(),normal=new THREE.Vector3();
  for(const o of objects){
    if(o.isLine){const a=o.geometry.attributes.position,list=lines.get(o.material)||[];const step=o.isLineSegments?2:1;for(let i=0;i<a.count-1;i+=step)for(const j of[i,i+1]){position.fromBufferAttribute(a,j).applyMatrix4(o.matrixWorld);list.push(position.x,position.y,position.z);}lines.set(o.material,list);continue;}
    const list=batches.get(o.material)||{p:[],n:[]},g=o.geometry,a=g.attributes.position,n=g.attributes.normal,index=g.index,m=new THREE.Matrix3().getNormalMatrix(o.matrixWorld);
    for(let i=0;i<(index?index.count:a.count);i++){const j=index?index.getX(i):i;position.fromBufferAttribute(a,j).applyMatrix4(o.matrixWorld);list.p.push(position.x,position.y,position.z);normal.fromBufferAttribute(n,j).applyMatrix3(m).normalize();list.n.push(normal.x,normal.y,normal.z);}batches.set(o.material,list);
  }
  for(const o of objects)o.removeFromParent();
  for(const [material,list]of batches){const g=geo(new THREE.BufferGeometry());g.setAttribute('position',new THREE.Float32BufferAttribute(list.p,3));g.setAttribute('normal',new THREE.Float32BufferAttribute(list.n,3));mesh(g,material,0,0,0,root);}
  for(const [material,list]of lines){const g=geo(new THREE.BufferGeometry());g.setAttribute('position',new THREE.Float32BufferAttribute(list,3));root.add(new THREE.LineSegments(g,material));}
}


