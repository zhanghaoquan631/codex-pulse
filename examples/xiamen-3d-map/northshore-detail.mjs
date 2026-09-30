import * as THREE from 'three';
import {mergeGeometries,mergeVertices} from 'three/addons/utils/BufferGeometryUtils.js';
import {createBuilder} from './living-world.mjs';
import {createMappedCrowd} from './mapped-crowd.mjs';
import {createSpatialIndex,distanceToSegment,seededRandom} from './world-layout.mjs';
import {prepareWaterContains} from './water-query.mjs';
import {terrainTriangle,terrainPaving} from './terrain-paving.mjs';
import {inRectangle} from './coast-layout.mjs';

export const northshoreLocations={jimei:[118.09834,24.56778],haicang:[118.04981768131256,24.491190720949504]};
const stopDefinitions={
 jimei:[
  ['南薰楼',null,northshoreLocations.jimei,.13,'高塔与斜向翼楼构成不同于普通校舍的轮廓，绿瓦屋顶、钟亭和砖石立面是嘉庚建筑的特色。'],
  ['龙舟池','龙舟池(中池)',null,.37,'内池、中池、外池与湖岸道路形成学村的滨水空间。这里展示的龙舟划行是文化场景示意，并非实时赛事。'],
  ['归来园','归来园',null,.14,'学村街巷中的纪念性园地，与周边校舍、老街和绿荫连在一起。'],
  ['嘉庚公园','嘉庚公园',null,.20,'沿海公园与集美学村相接，重点呈现滨海树荫、园路和岸线。'],
  ['集美大学主校区','集美大学（主校区）',null,.35,'校园楼群、操场与内部道路组成较完整的街区，和南侧老学村的高塔、绿瓦楼群形成对比。'],
  ['嘉庚图书馆','嘉庚图书馆',null,.16,'位于集美大学主校区的图书馆参考点，周边庭院与校园步道按地图轮廓呈现。']
 ],
 haicang:[
  ['海沧湾公园','海沧湾公园',null,.25,'海湾岸线、临海园路与城市大道相邻。绿地内保留开阔草坪，树荫、花草和休憩设施沿路组织。'],
  ['观海栈道','观海栈道',null,.27,'海沧南部临海步行空间，岸线转折与园内道路共同构成观海路线。'],
  ['嵩鼓码头','嵩鼓码头',null,.21,'面向鼓浪屿方向的渡运节点。此点用于查看码头片区，不表示已核实登船口、船班或当天通航状态。'],
  ['海沧体育中心','海沧体育中心',null,.34,'体育场地、看台楼体与公共道路形成独立片区，保留地图中的运动场地形状。'],
  ['厦门沧江剧院','厦门沧江剧院',null,.21,'城区文化设施参考点，周边现代建筑、街道和沿街绿化与海滨公园采用不同布局。']
 ]
};

export function createNorthshoreDetail({scene,detail,terrains,heightAt,waterAt,toWorld,reducedMotion=false}){
 const worlds=detail.regions.map((region,index)=>createRegion({scene,region,terrain:terrains[index],heightAt,waterAt,toWorld,reducedMotion}));
 return {anchors:worlds.map(w=>w.anchor),stops:worlds.flatMap(w=>w.stops),covers:(x,z)=>worlds.some(w=>w.covers(x,z)),update:dt=>worlds.forEach(w=>w.update(dt)),setLight:n=>worlds.forEach(w=>w.setLight(n)),setQuality:q=>worlds.forEach(w=>w.setQuality(q)),getState(){const regions=worlds.map(w=>w.getState()),total=key=>regions.reduce((s,r)=>s+(r[key]||0),0);return {regions,buildings:total('buildings'),paths:total('paths'),trees:total('trees'),people:total('people'),cars:total('cars'),overlaps:total('overlaps'),invalidPeople:total('invalidPeople'),instances:total('instances'),motion:regions.flatMap(r=>r.motion)};}};
}

function createRegion({scene,region,terrain,heightAt:h,waterAt,toWorld,reducedMotion}){
 const isJimei=region.id==='jimei',group=new THREE.Group();group.name=isJimei?'集美学村与龙舟池':'海沧滨海公园与城区';scene.add(group);
 const covers=(x,z)=>inRectangle(x,z,region.bounds),dry=(x,z)=>covers(x,z)&&waterAt(x,z)===null;
 const builder=createBuilder(group,{cellSize:.7,tintInstances:true}),rng=seededRandom(isJimei?1812:2778),surfaces={},geometries=new Map(),buildings=createSpatialIndex(.08),roads=createSpatialIndex(.06),motorRoads=createSpatialIndex(.06),plants=createSpatialIndex(.025),fixtures=createSpatialIndex(.03),walking=[];
 const coverTests=region.covers.map(c=>({...c,contains:prepareWaterContains(c.rings)})),coverAt=(x,z,kinds)=>coverTests.some(c=>kinds.includes(c.kind)&&c.contains(x,z));
 const foot=p=>['footway','path','steps','pedestrian','platform'].includes(p.kind),major=p=>['trunk','primary','secondary'].includes(p.kind),width=p=>foot(p)||p.kind==='cycleway'?.0035:major(p)?p.oneway?.008:.012:.0055;
 const pave=terrainPaving(terrain.terrain,h),forms=new Set(),treeTypes={},stops=[];
 for(const [name,source,ll,radius,description] of stopDefinitions[region.id]){
  const poi=region.pois.find(p=>p.name===source);if(!poi&&!ll)continue;
  const point=poi?.point??toWorld(...ll);stops.push({name,point,ll:poi?.ll??ll,radius,description,region:region.id,tip:'2026-09-13 地图快照。参考点并非入口；校内、码头和园区通行以现场规定为准。建筑细部、植被、人物与动画为微缩示意。'});
 }
 const anchorPoint=toWorld(...(isJimei?[118.0962,24.5688]:northshoreLocations[region.id])),anchor={x:anchorPoint[0],z:anchorPoint[1],radius:isJimei?.38:.28,mobileSceneRadius:isJimei?.22:.16,minHalfHeight:.14,viewDirection:[2,6,8],theme:isJimei?'mapped-jiageng-school-town':'mapped-haicang-bayfront'};
 const add=(color,geometry)=>{if(geometry.index){const old=geometry;geometry=geometry.toNonIndexed();old.dispose();}geometry.deleteAttribute('uv');if(!geometries.has(color))geometries.set(color,[]);geometries.get(color).push(geometry);};
 function surface(color,rings,offset=0){const vectors=rings.map(r=>r.slice(0,-1).map(p=>new THREE.Vector2(...p))),points=vectors.flat(),out=surfaces[color]??=[];for(const face of THREE.ShapeUtils.triangulateShape(vectors[0],vectors.slice(1)))for(const v of terrainTriangle(terrain.terrain,h,face.map(i=>[points[i].x,points[i].y]),{offset}))out.push(v);}
 for(const rings of region.land)surface('#a8b49b',rings);
 const palette={forest:'#77946e',wood:'#77946e',park:'#93ac7e',grass:'#a1b583',garden:'#93ac7e',scrub:'#8c9e72',university:'#b8bba7',college:'#b8bba7',school:'#b9bfae',residential:'#b3b7a7',commercial:'#b7baad',retail:'#b7baad',pitch:'#82a082',track:'#b59483',beach:'#d7d0b4'};
 for(const c of region.covers)if(palette[c.kind])surface(palette[c.kind],c.rings,['pitch','track'].includes(c.kind)?.00065:.0003);
 function frame(ring){let edge=[ring[0],ring[1]],length=0;for(let i=1;i<ring.length;i++){const d=Math.hypot(ring[i][0]-ring[i-1][0],ring[i][1]-ring[i-1][1]);if(d>length){length=d;edge=[ring[i-1],ring[i]];}}const angle=Math.atan2(edge[1][1]-edge[0][1],edge[1][0]-edge[0][0]),c=Math.cos(angle),s=Math.sin(angle),points=ring.map(([x,z])=>[x*c+z*s,-x*s+z*c]),xs=points.map(p=>p[0]),zs=points.map(p=>p[1]),u=(Math.min(...xs)+Math.max(...xs))/2,v=(Math.min(...zs)+Math.max(...zs))/2;return {x:u*c-v*s,z:u*s+v*c,w:Math.max(...xs)-Math.min(...xs),d:Math.max(...zs)-Math.min(...zs),angle,c,s};}
 function roof(f,y,color){
  const at=(x,dy,z)=>[f.x+x*f.c-z*f.s,y+dy,f.z+x*f.s+z*f.c],w=f.w+.001,d=f.d+.001,rise=Math.min(.007,d*.24),ends=Math.max(0,w-d)*.5,ring=[[-w/2,0,-d/2],[w/2,0,-d/2],[w/2,0,d/2],[-w/2,0,d/2]],a=[-ends,rise,0],b=[ends,rise,0];
  const geometry=new THREE.BufferGeometry();geometry.setAttribute('position',new THREE.Float32BufferAttribute([ring[0],a,b,ring[0],b,ring[1],ring[1],b,ring[2],ring[2],b,a,ring[2],a,ring[3],ring[3],a,ring[0]].flatMap(p=>at(...p)),3));geometry.computeVertexNormals();add(color,geometry);
  builder.bar('#c9bea0',at(-ends,rise+.0005,0),at(ends,rise+.0005,0),.00045);
  for(const p of ring)builder.bar(color,at(p[0]*.8,0,p[2]*.8),at(p[0]*1.02,.0017,p[2]*1.03),.0005);
 }
 for(const b of region.buildings){const p=b.rings.flat(),xs=p.map(v=>v[0]),zs=p.map(v=>v[1]);buildings.insert({contains:prepareWaterContains(b.rings)},Math.min(...xs),Math.min(...zs),Math.max(...xs),Math.max(...zs));}
 const buildingAt=(x,z)=>buildings.at(x,z).some(b=>b.contains(x,z));
 let tower=null;
 region.buildings.forEach((b,index)=>{
  const ring=b.rings[0],f=frame(ring),nanxun=isJimei&&prepareWaterContains(b.rings)(...anchorPoint),school=isJimei&&coverAt(f.x,f.z,['school','university','college']);
  const y=terrain.terraces[index].height,bottom=Math.min(y,...ring.map(p=>h(...p))),height=nanxun?.026:Math.max(.009,Math.min(160,b.height)*.0017),shape=new THREE.Shape(ring.map(([x,z])=>new THREE.Vector2(x,-z)));
  for(const hole of b.rings.slice(1))shape.holes.push(new THREE.Path(hole.map(([x,z])=>new THREE.Vector2(x,-z))));
  const body=new THREE.ExtrudeGeometry(shape,{depth:y-bottom+height,bevelEnabled:false});body.rotateX(-Math.PI/2);body.translate(0,bottom,0);add(school?'#c9b99c':height>.06?'#b7cacc':['#d1cbb8','#c3c4b7','#c9b7a8'][index%3],body);
  if(ring.length<=6&&school){roof(f,y+height,'#537d6a');forms.add('green-tile-school-wing');}
  else{const top=new THREE.ShapeGeometry(shape);top.rotateX(-Math.PI/2);top.translate(0,y+height+.0003,0);add(school?'#537d6a':'#879f99',top);forms.add(b.rings.length>1?'courtyard-block':height>.06?'modern-tower':'source-footprint');}
  if(nanxun){
   // The mapped Y-shaped footprint supplies the wings; the clock tower is an architectural interpretation.
   const p=[-1.7005,-7.534],yy=y+.026;tower={point:p,height:.081};
   builder.part('box','#d1c5a8',[p[0],y+.050,p[1]],[.010,.050,.010]);
   for(let k=0;k<8;k++)for(const side of [-1,1]){builder.part('box','#6a9390',[p[0]+side*.0052,y+.030+k*.005,p[1]],[.0006,.0028,.004]);builder.part('box','#6a9390',[p[0],y+.030+k*.005,p[1]+side*.0052],[.004,.0028,.0006]);}
   builder.part('cylinder','#d6c7a5',[p[0],y+.077,p[1]],[.0047,.006,.0047]);builder.part('ball','#63816c',[p[0],y+.082,p[1]],[.0048,.004,.0048]);builder.part('cylinder','#b69c62',[p[0],y+.088,p[1]],[.0004,.006,.0004]);
   for(const side of [-1,1]){builder.part('ball','#e2ddc7',[p[0],y+.077,p[1]+side*.0047],[.0017,.0017,.0002]);builder.bar('#586862',[p[0],y+.077,p[1]+side*.005],[p[0],y+.0783,p[1]+side*.005],.00015);}
   for(let j=1;j<ring.length;j++){const a=ring[j-1],b=ring[j],len=Math.hypot(b[0]-a[0],b[1]-a[1]);if(len>.015){const angle=Math.atan2(b[1]-a[1],b[0]-a[0]);roof({x:(a[0]+b[0])/2,z:(a[1]+b[1])/2,w:len*.9,d:.005,angle,c:Math.cos(angle),s:Math.sin(angle)},yy,'#527b67');}}
   forms.add('nanxun-clock-tower-and-angled-wings');
  }
  for(let j=1;j<ring.length;j++){
   const a=ring[j-1],b=ring[j],dx=b[0]-a[0],dz=b[1]-a[1],len=Math.hypot(dx,dz);if(len<.003)continue;
   const angle=-Math.atan2(dz,dx),rows=Math.min(18,Math.max(1,Math.round(height/.0055))),columns=Math.min(26,Math.floor(len/.0045)),at=(u,v)=>[a[0]+dx*u,y+v,a[1]+dz*u];
   builder.bar(school?'#e1d6bb':'#d6dcca',at(0,height),at(1,height),.00045);
   for(let r=0;r<rows;r++)for(let c=0;c<columns;c++){const p=at((c+.5)/columns,(r+.56)*height/rows);builder.part('box',school?'#658880':'#6c959c',p,[.0023,height/rows*.52,.00055],[0,angle,0]);if((index+c+r)%9===0)builder.part('box','#efcd93',p,[.0016,height/rows*.38,.0007],[0,angle,0],true);}
   if(school&&len>.02)for(let u=.004;u<len;u+=.008)builder.part('box','#dbd0b5',at(u/len,height*.45),[.0006,height*.9,.0008],[0,angle,0]);
  }
 });
 for(const p of region.paths)if(!foot(p)&&p.kind!=='cycleway'&&!p.bridge)for(let i=1;i<p.points.length;i++){const a=p.points[i-1],b=p.points[i];motorRoads.insert({a,b,width:width(p)},Math.min(a[0],b[0])-.03,Math.min(a[1],b[1])-.03,Math.max(a[0],b[0])+.03,Math.max(a[1],b[1])+.03);}
 const motorAt=(x,z,pad=0)=>motorRoads.at(x,z).some(p=>distanceToSegment(x,z,p.a,p.b)<p.width/2+pad);
 let stairs=0,stepMarks=0,bridgeSegments=0;
 for(const p of region.paths){
  const w=width(p),isFoot=foot(p),isCycle=p.kind==='cycleway',bridgeY=p.bridge?Math.max(...p.points.map(v=>Math.max(h(...v),waterAt(...v)??0)))+.007:null;
  for(let i=1;i<p.points.length;i++){
   const a=p.points[i-1],b=p.points[i],dx=b[0]-a[0],dz=b[1]-a[1],len=Math.hypot(dx,dz);if(len<1e-5)continue;
   if(!p.bridge&&![0,.25,.5,.75,1].every(u=>dry(a[0]+dx*u,a[1]+dz*u)))continue;
   const yAt=(x,z)=>bridgeY??h(x,z)+.0018;
   if(p.bridge){
    const nx=-dz/len*w/2,nz=dx/len*w/2,ring=[[a[0]+nx,a[1]+nz],[a[0]-nx,a[1]-nz],[b[0]-nx,b[1]-nz],[b[0]+nx,b[1]+nz]],out=surfaces[isFoot?'#c4bea5':'#768785']??=[];for(const k of [0,1,2,0,2,3])out.push(ring[k][0],bridgeY,ring[k][1]);bridgeSegments++;
   }else{pave(surfaces['#b6bfaa']??=[],a,b,w+.0013,{offset:.001});pave(surfaces[isFoot?'#d0cdb7':isCycle?'#b99d85':'#758786']??=[],a,b,w,{offset:.0018});}
   roads.insert({a,b,width:w},Math.min(a[0],b[0])-.025,Math.min(a[1],b[1])-.025,Math.max(a[0],b[0])+.025,Math.max(a[1],b[1])+.025);
   if(isFoot&&!['private','no'].includes(p.foot)&&!['private','no'].includes(p.access))walking.push({points:[a,b],bridge:p.bridge,yBridge:bridgeY,name:p.name});
   if(!isFoot&&!isCycle&&!p.bridge&&p.kind!=='trunk'&&len>.025)for(const side of [-1,1]){
    const offset=side*(w/2+.0025),nx=-dz/len,nz=dx/len,aa=[a[0]+nx*offset,a[1]+nz*offset],bb=[b[0]+nx*offset,b[1]+nz*offset],samples=Math.max(4,Math.ceil(len/.005));
    if(!Array.from({length:samples+1},(_,j)=>j/samples).every(u=>{const x=aa[0]+(bb[0]-aa[0])*u,z=aa[1]+(bb[1]-aa[1])*u;return dry(x,z)&&!buildingAt(x,z)&&!motorAt(x,z,.0018);}))continue;
    pave(surfaces['#d0cdb7']??=[],aa,bb,.0034,{offset:.0018});walking.push({points:[aa,bb],name:p.name});
   }
   if(major(p)&&!p.bridge)for(let d=.007;d<len;d+=.018)pave(surfaces['#e4e3cc']??=[],[a[0]+dx*Math.max(0,d-.003)/len,a[1]+dz*Math.max(0,d-.003)/len],[a[0]+dx*Math.min(len,d+.003)/len,a[1]+dz*Math.min(len,d+.003)/len],.0003,{offset:.0021});
   if(p.kind==='steps'){
    stairs++;const n=Math.ceil(len/.0015);for(let j=0;j<n;j++){const x=a[0]+dx*(j+.5)/n,z=a[1]+dz*(j+.5)/n;builder.part('box','#e7dec9',[x,yAt(x,z)+.0002,z],[w,.0004,.0003],[0,-Math.atan2(dz,dx)+Math.PI/2,0]);stepMarks++;}
   }
   if(p.bridge||p.kind==='steps')for(const side of [-1,1])for(let d=0;d<len;d+=.006){const at=q=>[a[0]+dx*q/len-dz/len*w*.52*side,a[1]+dz*q/len+dx/len*w*.52*side],q=at(d),r=at(Math.min(len,d+.006));builder.bar('#9ca99e',[q[0],yAt(...q),q[1]],[q[0],yAt(...q)+.003,q[1]],.0002);builder.bar('#b9c2b0',[q[0],yAt(...q)+.003,q[1]],[r[0],yAt(...r)+.003,r[1]],.0002);}
  }
 }
 const roadNear=(x,z,pad=0)=>roads.at(x,z).some(p=>distanceToSegment(x,z,p.a,p.b)<p.width/2+pad);
 let treeCount=0,flowers=0,understory=0,fixtureCount=0,courts=0;
 const noPlant=(x,z)=>!dry(x,z)||buildingAt(x,z)||roadNear(x,z,.003)||coverAt(x,z,['pitch','track','beach','stadium','bus_station']);
 function plant(x,z,type){
  if(noPlant(x,z)||plants.at(x,z).some(p=>Math.hypot(x-p.x,z-p.z)<.016))return;
  const y=h(x,z),s=.013+rng()*.017;builder.part('cylinder','#8f8269',[x,y+s*.43,z],[.0008,s*.86,.0008]);
  if(type==='palm')for(let i=0;i<8;i++){const a=i*Math.PI/4;builder.part('leaf','#648c72',[x+Math.cos(a)*s*.1,y+s,z+Math.sin(a)*s*.1],[s*.38,.0007,s*.09],[0,-a,.1]);}
  else for(let i=0;i<5;i++){const a=i*2.4;builder.part('crown',type==='flowering'?'#c39eae':['#709466','#87a074','#5f896c'][treeCount%3],[x+Math.cos(a)*s*.18,y+s*(.72+i%2*.1),z+Math.sin(a)*s*.18],[s*.29,s*.28,s*.29]);}
  if(treeCount%6===0)for(let j=0;j<4;j++){const a=j*Math.PI/2,xx=x+Math.cos(a)*.0025,zz=z+Math.sin(a)*.0025;builder.part('crown','#8fa66d',[xx,y+.0008,zz],[.0012,.0007,.0012]);builder.part('ball',j%2?'#c799b2':'#d7c487',[xx,y+.0015,zz],[.0004,.0003,.0004]);flowers++;}
  treeCount++;treeTypes[type]=(treeTypes[type]||0)+1;plants.insert({x,z},x-.016,z-.016,x+.016,z+.016);
 }
 for(const p of region.paths){if(p.bridge||!['secondary','tertiary','minor','footway'].includes(p.kind))continue;for(let i=1;i<p.points.length;i++){const a=p.points[i-1],b=p.points[i],dx=b[0]-a[0],dz=b[1]-a[1],len=Math.hypot(dx,dz);for(let d=.012;d<len;d+=.043)for(const side of [-1,1]){const offset=width(p)/2+.009;plant(a[0]+dx*d/len-dz/len*offset*side,a[1]+dz*d/len+dx/len*offset*side,treeCount%5===0?'flowering':treeCount%3?'banyan':'palm');}}}
 for(let i=0;i<18000&&treeCount<3300;i++){const x=region.bounds[0]+rng()*(region.bounds[2]-region.bounds[0]),z=region.bounds[1]+rng()*(region.bounds[3]-region.bounds[1]);if(coverAt(x,z,['forest','wood','park','garden','grass','scrub']))plant(x,z,i%9===0?'flowering':'banyan');}
 for(const stop of stops)for(let i=0;i<1200;i++){
  const x=stop.point[0]+(rng()-.5)*stop.radius*3,z=stop.point[1]+(rng()-.5)*stop.radius*3;if(noPlant(x,z)||!coverAt(x,z,['park','garden','grass','university','school'])||Math.sin(x*38)+Math.sin(z*43)<.3)continue;
  const y=h(x,z),s=.0015+rng()*.002;builder.part('crown','#91a978',[x,y+s*.4,z],[s,s*.5,s]);understory++;if(i%3===0){builder.part('ball',i%2?'#c9a1ae':'#d5c886',[x,y+s,z],[s*.3,s*.2,s*.3]);flowers++;}
 }
 for(const p of walking){if(p.bridge)continue;const [a,b]=p.points,dx=b[0]-a[0],dz=b[1]-a[1],len=Math.hypot(dx,dz);for(let d=.01;d<len;d+=.044){
  const x=a[0]+dx*d/len-dz/len*.0045,z=a[1]+dz*d/len+dx/len*.0045;if(noPlant(x,z)||fixtures.at(x,z).some(p=>Math.hypot(p.x-x,p.z-z)<.025))continue;
  const y=h(x,z);builder.part('cylinder','#829a92',[x,y+.0035,z],[.00025,.007,.00025]);builder.part('ball','#f1d8a5',[x,y+.007,z],[.0008,.0005,.0008],[0,0,0],true);
  if(fixtureCount%3===0){builder.part('box','#a39173',[x,y+.0014,z],[.004,.0007,.0015],[0,-Math.atan2(dz,dx),0]);builder.part('box','#a39173',[x,y+.0022,z],[.004,.0014,.0004],[0,-Math.atan2(dz,dx),0]);}
  fixtures.insert({x,z},x-.025,z-.025,x+.025,z+.025);fixtureCount++;
 }}
 for(const c of region.covers.filter(c=>c.kind==='pitch')){const f=frame(c.rings[0]),contains=prepareWaterContains(c.rings),at=(u,v)=>[f.x+u*f.c-v*f.s,f.z+u*f.s+v*f.c],points=[at(-f.w*.42,-f.d*.42),at(f.w*.42,-f.d*.42),at(f.w*.42,f.d*.42),at(-f.w*.42,f.d*.42)];if(!points.every(p=>contains(...p)))continue;for(let i=0;i<4;i++)pave(surfaces['#e2dfc8']??=[],points[i],points[(i+1)%4],.0003,{offset:.0011});pave(surfaces['#e2dfc8']??=[],at(0,-f.d*.42),at(0,f.d*.42),.0003,{offset:.0011});courts++;}
 for(const [color,vertices] of Object.entries(surfaces)){if(!vertices.length)continue;const raw=new THREE.BufferGeometry();raw.setAttribute('position',new THREE.Float32BufferAttribute(vertices,3));const geometry=mergeVertices(raw,1e-7);geometry.computeVertexNormals();raw.dispose();add(color,geometry);}
 for(const [color,items] of geometries){const geometry=mergeGeometries(items),mesh=new THREE.Mesh(geometry,new THREE.MeshStandardMaterial({color,roughness:.86,side:THREE.DoubleSide}));mesh.castShadow=!Object.hasOwn(surfaces,color);mesh.receiveShadow=true;group.add(mesh);items.forEach(g=>g.dispose());}
 const instances=builder.finish(),nearStop=(x,z)=>stops.some(s=>Math.hypot(x-s.point[0],z-s.point[1])<Math.max(.28,s.radius*1.8));
 const crowd=createMappedCrowd({group,paths:walking.filter(p=>p.points.some(v=>nearStop(...v))),heightAt:(x,z,p)=>p?.bridge?p.yBridge:h(x,z),valid:(x,z,p)=>covers(x,z)&&(p?.bridge||dry(x,z))&&!buildingAt(x,z),limit:isJimei?260:250,scale:.55,groundOffset:.002,seed:isJimei?376:682,reducedMotion});
 const dragonBoats=[];
 if(isJimei){const pond=stops.find(s=>s.name==='龙舟池');if(pond)for(const sign of [-1,1]){
  const x=pond.point[0],z=pond.point[1]+sign*.022,route=[-.095,0,.095].map(dx=>[x+dx,z]);if(!route.every(p=>waterAt(...p)!==null))continue;
  const boat=new THREE.Group(),b=createBuilder(boat);b.part('box',sign===1?'#9c684e':'#699575',[0,.001,0],[.025,.002,.0035]);b.part('cone','#bfa257',[.015,.002,0],[.0025,.005,.0025],[0,0,-Math.PI/2]);const paddles=[];
  for(let j=0;j<7;j++){const xx=-.01+j*.003;b.part('ball','#cda782',[xx,.004,0],[.0008,.0008,.0008]);b.part('box',sign===1?'#c5955a':'#608bb0',[xx,.0028,0],[.0014,.0018,.0018]);for(const side of [-1,1]){const mesh=new THREE.Mesh(new THREE.BoxGeometry(.0004,.005,.0005),new THREE.MeshStandardMaterial({color:'#b7a077'}));mesh.position.set(xx,.002,side*.003);mesh.rotation.x=side*.9;boat.add(mesh);paddles.push({mesh,side});}}
  b.finish();boat.userData.atlasLayer='boats';group.add(boat);dragonBoats.push({boat,paddles,x,z,sign});
 }}
 let seconds=0,quality='balanced';
 function update(dt){seconds+=reducedMotion?0:Math.min(dt,.1);crowd.update(dt);for(const {boat,paddles,x,z,sign} of dragonBoats){const offset=Math.sin(seconds*.05+sign)*.09;boat.position.set(x+offset,(waterAt(x+offset,z)??0)+.0002,z);boat.rotation.y=Math.cos(seconds*.05+sign)>=0?0:Math.PI;for(const p of paddles)p.mesh.rotation.x=p.side*(.8+Math.sin(seconds*2)*.25);}}
 update(0);
 return {covers,anchor,stops,update,setQuality:q=>{quality=q;},setLight(night){for(const [key,mat] of builder.materials)if(key.endsWith('-true'))mat.emissiveIntensity=night*1.8;},getState(){return {id:region.id,snapshot:region.snapshot,buildings:region.buildings.length,paths:region.paths.length,forms:[...forms],tower,stairs,stepMarks,bridgeSegments,trees:treeCount,treeTypes,flowers,understory,fixtures:fixtureCount,courts,instances,dragonBoats:dragonBoats.length,stops:stops.map(s=>({name:s.name,ll:s.ll})),quality,...crowd.getState()};}};
}
