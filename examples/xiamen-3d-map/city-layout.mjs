import {Vector3} from 'three';
import {createSpatialIndex,distanceToSegment} from './world-layout.mjs';
import {prepareWaterContains} from './water-query.mjs';
import {makeWalkingLoop} from './pedestrian-routes.mjs';

export const cityThemes=[
 ['海岛街巷',['沙茶面','花生汤'],'photo'],['骑楼市集',['海蛎煎','面线糊'],'market'],
 ['艺术渔港',['海鲜','咖啡'],'photo'],['海滨观景',['水果','咖啡'],'photo'],
 ['校园街坊',['面线糊','咖啡'],'read'],['寺院茶庭',['素食','茶'],'tea'],
 ['植物园休憩',['茶','水果'],'read'],['村落夜市',['沙茶面','海蛎煎'],'market'],
 ['沙滩休闲',['水果','海鲜'],'photo'],['滨海骑行',['咖啡','茶'],'cycle'],
 ['学村生活',['花生汤','咖啡'],'read'],['海湾商圈',['姜母鸭','海鲜'],'tea']
];
const width={motorway:.012,trunk:.011,primary:.01,secondary:.008,tertiary:.006,rail:.004};
const hash=(x,z)=>{const n=Math.sin(x*127.1+z*311.7)*43758.5453;return n-Math.floor(n);};
const bounds=r=>{const p=r.flat();return [Math.min(...p.map(p=>p[0])),Math.min(...p.map(p=>p[1])),Math.max(...p.map(p=>p[0])),Math.max(...p.map(p=>p[1]))];};

// Infill is illustrative scenery inside mapped urban land use, never surveyed buildings.
export function planCityLife({data,anchors,heightAt,waterAt,excluded=()=>false,infillExcluded=excluded}){
 const zones=createSpatialIndex(.25),green=createSpatialIndex(.25),buildings=createSpatialIndex(.15),roads=createSpatialIndex(.1),occupied=createSpatialIndex(.08),walkLanes=createSpatialIndex(.05),driveLanes=createSpatialIndex(.1);
 for(const c of [...(data.mainlandCovers||[]),...(data.cityCovers||[])])if(['pitch','stadium','track','park','garden','flowerbed','grass','forest','wood','beach','golf_course','scrub','heath','military'].includes(c.kind)){const b=bounds(c.rings);green.insert({contains:prepareWaterContains(c.rings)},...b);}
 for(const c of data.mainlandCovers||[]){if(!['residential','commercial','industrial','retail','school','university'].includes(c.kind))continue;const b=bounds(c.rings);zones.insert({...c,contains:prepareWaterContains(c.rings)},...b);}
 for(const b of [...(data.mainlandBuildings||[]),...(data.cityBuildings||[])]){const bb=b.bounds||bounds(b.rings);buildings.insert({contains:prepareWaterContains(b.rings),bounds:bb},...bb);}
 for(const [x,z,w,d] of data.buildings||[]){const r=Math.hypot(w,d)/2;buildings.insert({contains:(xx,zz)=>Math.hypot(xx-x,zz-z)<r,bounds:[x-r,z-r,x+r,z+r]},x-r,z-r,x+r,z+r);}
 const segments=[];
 for(const p of data.cityPaths||[])for(let i=1;i<p.points.length;i++){const a=p.points[i-1],b=p.points[i],w=width[p.kind]??(['footway','path','steps','pedestrian','cycleway'].includes(p.kind)?.0035:.0055);roads.insert({a,b,width:w},Math.min(a[0],b[0])-.04,Math.min(a[1],b[1])-.04,Math.max(a[0],b[0])+.04,Math.max(a[1],b[1])+.04);}
 for(const [kind,bridge,path] of data.roads)for(let i=1;i<path.length;i++){
  if(!width[kind]||kind==='rail')continue;const a=path[i-1],b=path[i],length=Math.hypot(b[0]-a[0],b[1]-a[1]);if(length<.002)continue;
  const r={a,b,kind,bridge,width:width[kind],length};segments.push(r);roads.insert(r,Math.min(a[0],b[0])-.03,Math.min(a[1],b[1])-.03,Math.max(a[0],b[0])+.03,Math.max(a[1],b[1])+.03);
 }
 const [[x0,z0],[x1,z1]]=data.terrain.bounds;
 const waterFree=(x,z)=>x>=x0&&x<=x1&&z>=z0&&z<=z1&&waterAt(x,z)===null;
 const buildingFree=(x,z,pad=.002)=>!buildings.at(x,z).some(b=>b.contains(x,z)||(pad&&x>=b.bounds[0]-pad&&x<=b.bounds[2]+pad&&z>=b.bounds[1]-pad&&z<=b.bounds[3]+pad));
 const roadFree=(x,z,pad=.001)=>!roads.at(x,z).some(r=>distanceToSegment(x,z,r.a,r.b)<r.width+pad);
 const isSafe=(x,z)=>waterFree(x,z)&&buildingFree(x,z)&&roadFree(x,z)&&!occupied.at(x,z).some(o=>Math.hypot(o.x-x,o.z-z)<o.radius+.002);
 const laneFree=(index,x,z,gap)=>!index.at(x,z).some(s=>distanceToSegment(x,z,s.a,s.b)<gap);
 const reserve=(index,route,gap)=>{for(let j=1;j<route.points.length;j++){const a=route.points[j-1],b=route.points[j];index.insert({a:[a.x,a.z],b:[b.x,b.z]},Math.min(a.x,b.x)-gap,Math.min(a.z,b.z)-gap,Math.max(a.x,b.x)+gap,Math.max(a.z,b.z)+gap);}};
 const regionAt=(x,z)=>anchors.reduce((best,a,i)=>{const d=Math.hypot(a.x-x,a.z-z);return d<best.d?{i,d}:best;},{i:0,d:Infinity}).i;
 const infill=[],routes=[],cars=[],venues=[],scenes=anchors.map((a,i)=>({index:i,theme:cityThemes[i][0],people:0,cars:0,venues:0,infill:0}));
 const cellCounts=new Map();
 for(let x=x0+.035;x<x1;x+=.048)for(let z=z0+.035;z<z1;z+=.048){
  const xx=x+(hash(x,z)-.5)*.012,zz=z+(hash(z,x)-.5)*.012;
  if(infillExcluded(xx,zz)||!isSafe(xx,zz)||green.at(xx,zz).some(c=>c.contains(xx,zz)))continue;
  const zone=zones.at(xx,zz).find(c=>c.contains(xx,zz));if(!zone)continue;
  const ground=heightAt(xx,zz);if(ground>.35||ground<0)continue;
  const cell=Math.floor(xx)+','+Math.floor(zz);if((cellCounts.get(cell)||0)>=125)continue;
  const n=hash(xx,zz),w=.019+n*.014,d=.018+hash(zz,xx)*.015,angle=hash(xx+3,zz)>.5?Math.PI/2:0;
  const [fw,fd]=angle?[d,w]:[w,d];
  if(![[-fw/2,-fd/2],[fw/2,-fd/2],[fw/2,fd/2],[-fw/2,fd/2]].every(([a,b])=>zone.contains(xx+a,zz+b)&&isSafe(xx+a,zz+b)&&!green.at(xx+a,zz+b).some(c=>c.contains(xx+a,zz+b))&&Math.abs(heightAt(xx+a,zz+b)-ground)<.013))continue;
  const region=regionAt(xx,zz),industrial=zone.kind==='industrial',campus=['school','university'].includes(zone.kind);
  const floors=industrial?2+Math.floor(n*3):campus?3+Math.floor(n*4):zone.kind==='commercial'?8+Math.floor(n*26):4+Math.floor(n*15);
  const item={x:xx,z:zz,w,d,height:floors*.0075,style:industrial?'warehouse':campus?'campus':['slab','court','tower','terrace'][Math.floor(n*4)],region,zone:zone.kind,angle};
  infill.push(item);occupied.insert({x:xx,z:zz,radius:Math.hypot(w,d)/2},xx-w,zz-d,xx+w,zz+d);cellCounts.set(cell,(cellCounts.get(cell)||0)+1);scenes[region].infill++;
 }
 // Stratify across cells, rather than taking the first roads in source tile order.
 const roadCells=new Map(),carCells=new Map();
 segments.sort((a,b)=>hash(a.a[0],a.a[1])-hash(b.a[0],b.a[1]));
 for(const r of segments){
  const [ax,az]=r.a,[bx,bz]=r.b,dx=(bx-ax)/r.length,dz=(bz-az)/r.length;
  const mx=(ax+bx)/2,mz=(az+bz)/2,key=Math.floor(mx)+','+Math.floor(mz),region=regionAt(mx,mz);
  if(r.length>.055&&!r.bridge&&waterFree(mx,mz)&&!excluded(mx,mz)&&(carCells.get(key)||0)<5){
   const lane=r.width*.45,route=makeWalkingLoop([new Vector3(ax,0,az),new Vector3(bx,0,bz)],lane,p=>waterFree(p.x,p.z)&&!excluded(p.x,p.z)&&buildingFree(p.x,p.z,.001)&&laneFree(driveLanes,p.x,p.z,.006)&&Math.abs(heightAt(p.x,p.z)-heightAt(mx,mz))<.018);
   if(route){const count=Math.min(4,Math.max(2,Math.floor(route.length/.06)));cars.push({route,width:r.width,region,count,kind:r.kind});reserve(driveLanes,route,.006);carCells.set(key,(carCells.get(key)||0)+1);scenes[region].cars+=count;}
  }
  if(r.bridge||['motorway','trunk'].includes(r.kind)||r.length<.045||r.length>.7||(roadCells.get(key)||0)>=6)continue;
  for(const side of [-1,1]){
   const offset=(r.width+.006)*side,start=Math.min(.012,r.length*.15),end=Math.min(r.length-.012,start+.16);
   const a=new Vector3(ax+dx*start-dz*offset,0,az+dz*start+dx*offset),b=new Vector3(ax+dx*end-dz*offset,0,az+dz*end+dx*offset);
   const route=makeWalkingLoop([a,b],.0021,p=>isSafe(p.x,p.z)&&laneFree(walkLanes,p.x,p.z,.004));if(!route)continue;
   const count=Math.min(5,Math.max(2,Math.floor(route.length/.018)));routes.push({route,region,count,activity:'walk',source:'mapped-sidewalk'});reserve(walkLanes,route,.004);scenes[region].people+=count;
   roadCells.set(key,(roadCells.get(key)||0)+1);
   if(!excluded(mx,mz)&&venues.filter(v=>v.cell===key).length<2){
    const x=(a.x+b.x)/2-dz*side*.010,z=(a.z+b.z)/2+dx*side*.010;
    if(isSafe(x,z)){venues.push({x,z,region,cell:key,food:cityThemes[region][1][venues.length%2],style:venues.length%4,angle:Math.atan2(dx,dz),source:'illustrative'});scenes[region].venues++;occupied.insert({x,z,radius:.008},x-.01,z-.01,x+.01,z+.01);}
   }
  }
 }
 // Each sightseeing region also receives its own safe plaza life, including pedestrian islands.
 for(const [region,anchor] of anchors.entries()){
  let made=0;
  for(let k=0;k<1800&&made<5;k++){
   const angle=k*2.39996323,radius=.045+Math.sqrt(k/1800)*Math.min(anchor.radius*.8,.28),x=anchor.x+Math.cos(angle)*radius,z=anchor.z+Math.sin(angle)*radius;
   if(!isSafe(x,z))continue;
   const pts=[[-.012,-.007],[.012,-.007],[.012,.007],[-.012,.007],[-.012,-.007]].map(([dx,dz])=>new Vector3(x+dx,0,z+dz));
   const route=makeWalkingLoop(pts,.0015,p=>isSafe(p.x,p.z)&&laneFree(walkLanes,p.x,p.z,.004)&&Math.abs(heightAt(p.x,p.z)-heightAt(x,z))<.012);if(!route)continue;
   routes.push({route,region,count:5,activity:cityThemes[region][2],source:'plaza'});reserve(walkLanes,route,.004);scenes[region].people+=5;
   const vx=x+.021,vz=z;
   if(isSafe(vx,vz)){venues.push({x:vx,z:vz,region,cell:'region-'+region,food:cityThemes[region][1][made%2],style:(region+made)%4,angle:angle,source:'illustrative'});scenes[region].venues++;occupied.insert({x:vx,z:vz,radius:.008},vx-.01,vz-.01,vx+.01,vz+.01);}
   occupied.insert({x,z,radius:.024},x-.028,z-.028,x+.028,z+.028);made++;
  }
 }
 for(const r of [...routes,...cars])for(const p of r.route.points)p.y=heightAt(p.x,p.z);
 const views=anchors.map((a,index)=>{const r=routes.find(r=>r.region===index&&r.source==='plaza'),v=r&&venues.filter(v=>v.region===index).sort((v,w)=>Math.hypot(v.x-r.route.points[0].x,v.z-r.route.points[0].z)-Math.hypot(w.x-r.route.points[0].x,w.z-r.route.points[0].z))[0];return {index,x:v?.x??r?.route.points[0].x??a.x,z:v?.z??r?.route.points[0].z??a.z,theme:cityThemes[index][0],foods:cityThemes[index][1],localPeople:routes.filter(r=>r.region===index&&r.source==='plaza').reduce((n,r)=>n+r.count,0)};});
 return {infill,routes,cars,venues,scenes,views,isSafe,pedestrianSafe:(x,z)=>waterFree(x,z)&&buildingFree(x,z,.001)&&roadFree(x,z),vehicleSafe:(x,z)=>waterFree(x,z)&&!excluded(x,z)&&buildingFree(x,z,.001),sourceNote:'Mapped land use and roads with illustrative infill, venues and animated residents; not measured buildings, shop locations or live crowds.'};
}
