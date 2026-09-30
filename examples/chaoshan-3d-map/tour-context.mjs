import * as THREE from 'three';
import {addSpatialSurface} from './spatial-surfaces.mjs';
import {addSpatialInstances} from './spatial-instances.mjs';
import {buildVegetation} from './street-life.mjs';
import {landClearance} from './regional-life.mjs';
import {buildNeighborhoodPopulation} from './neighborhood-population.mjs';
import {streetClearance} from './street-clearance.mjs';
import {buildIntroSurroundings} from './intro-surroundings.mjs';
import {planCivicNeighborhoods,buildCivicNeighborhoods} from './civic-neighborhoods.mjs';
import {buildNatureApproaches} from './nature-approaches.mjs';
import {insidePlace} from './place-footprints.mjs';
import {terrainPaving} from './terrain-paving.mjs';
import {spatialQuery,placeBounds} from './spatial-query.mjs';
import {placeSetting} from './place-setting.mjs';
import {serviceFor,serviceDetails,addServiceSigns,services} from './neighborhood-services.mjs';
import {serviceBuilding} from './service-buildings.mjs';
import {planBacklotHousing} from './backlot-housing.mjs';

const colors=['#899e92','#7a9fa9','#a88f7d','#67978a','#879b71'];
export function growRoadsideParcels(plots,{offRoad,clear,heightAt}){
  const near=spatialQuery(plots,p=>[p.x-.14,p.x+.14,p.z-.14,p.z+.14],.3);
  for(const p of plots){
    p.originalSize=p.size;
    if(!p.frontage)continue;
    const rural=['forest','tea','lake','headland','dune','farmland'].includes(p.profile?.family),maximum=rural?.10:.12;
    for(let size=p.size+.006;size<=maximum+.00001;size+=.006){
      const r=size*.84;
      if(!offRoad(p.x,p.z,r+.036)||!clear(p.x,p.z,r))break;
      if(near(p.x,p.z,r).some(q=>q!==p&&Math.hypot(p.x-q.x,p.z-q.z)<(size+q.size)*.83+.015))break;
      if([-1,0,1].some(dx=>[-1,0,1].some(dz=>Math.abs(heightAt(p.x+dx*r,p.z+dz*r)-p.y)>.012)))break;
      p.size=size;
    }
  }
  return plots;
}

export function planTourContext({places,sites=[],routes=[],roadRoutes=[],heightAt,waterAt,buildings=[]}){
  const clear=landClearance({heightAt,waterAt,buildings}),streets=[],plots=[],trees=[],coverage=[],connections=[],loops=[];
  const protectedPlaces=[...places.filter(p=>p.span||p.kind==='activity'),...sites];
  const protectedNear=spatialQuery(protectedPlaces,placeBounds);
  const sourceRoutes=[...new Set([...routes,...roadRoutes])];
  const routeSegments=sourceRoutes.flatMap(path=>path.slice(1).map((b,i)=>[path[i],b]));
  const indexRoutes=segments=>spatialQuery(segments,([a,b])=>[Math.min(a.x,b.x),Math.max(a.x,b.x),Math.min(a.z,b.z),Math.max(a.z,b.z)],3);
  const routesNear=indexRoutes(routeSegments);
  const generatedSegments=()=>streets.map(s=>{const a=s.points[0],b=s.points.at(-1);return [{x:a[0],z:a[2]},{x:b[0],z:b[2]}];});
  let earlierRoutesNear=()=>[],streetOwner=null;
  const roadDistance=(x,z,r)=>{
    let distance=Infinity;
    for(const [a,b] of [...routesNear(x,z,r),...earlierRoutesNear(x,z,r)]){
      const dx=b.x-a.x,dz=b.z-a.z,t=THREE.MathUtils.clamp(((x-a.x)*dx+(z-a.z)*dz)/(dx*dx+dz*dz||1),0,1);
      distance=Math.min(distance,Math.hypot(x-a.x-t*dx,z-a.z-t*dz));
    }
    return distance;
  };
  const streetKeys=new Set(),plotKeys=new Set(),parcelCells=new Map();
  const dry=(x,z,r=.03)=>heightAt(x,z)>=0&&clear(x,z,r)&&[-1,0,1].every(dx=>[-1,0,1].every(dz=>waterAt(x+dx*r,z+dz*r)===null));
  function segment(a,b,width=.035,record=true,role='link'){
    const length=Math.hypot(b[0]-a[0],b[1]-a[1]),n=Math.max(2,Math.ceil(length/.025)),points=[];
    for(let i=0;i<=n;i++){const t=i/n,x=a[0]+(b[0]-a[0])*t,z=a[1]+(b[1]-a[1])*t;
      if(!dry(x,z,width*.9))return false;
      if(protectedNear(x,z,width).some(p=>p.id==='small-park'||['island','shantou','jiexi','huilai','raoping','chaoan','chenghai','chaoyang','chaonan','puning','jieyang'].includes(p.kind)?insidePlace(p,x,z,width):Math.hypot(x-p.x,z-p.z)<(p.kind==='activity'?.205:Math.min(p.span||.2,.32))))return false;
      points.push([x,heightAt(x,z)+.011,z]);
    }
    if(record){const key=[a,b].map(p=>p.map(v=>v.toFixed(3)).join(',')).sort().join(':');if(!streetKeys.has(key)){streetKeys.add(key);streets.push({points,width,role,owner:streetOwner});}}
    return points;
  }
  function plot(x,z,size,index,region,profile,angle=0,frontage=false){
    index=Math.abs(index);
    const key=Math.round(x/.05)+','+Math.round(z/.05);
    const gx=Math.floor(x/.25),gz=Math.floor(z/.25);
    for(let dx=-1;dx<=1;dx++)for(let dz=-1;dz<=1;dz++)for(const q of parcelCells.get(`${gx+dx},${gz+dz}`)||[]){
      if(Math.hypot(x-q.x,z-q.z)<(size+q.size)*.83+.015)return;
    }
    if(plotKeys.has(key)||!dry(x,z,size*.8)||protectedNear(x,z,size+.18).some(p=>['island','shantou','jiexi','huilai','raoping','chaoan','chenghai','chaoyang','chaonan','puning','jieyang'].includes(p.kind)?insidePlace(p,x,z,size+.03):Math.hypot(x-p.x,z-p.z)<Math.max(.28,p.span||0)+size+(p.anchor?.14:0)))return;
    plotKeys.add(key);const h=.065+(index%6)*.026;
    plots.push({x,z,y:heightAt(x,z),size,h,color:colors[index%colors.length],region,profile,angle,variant:index%5,frontage});
    const cellKey=`${gx},${gz}`;if(!parcelCells.has(cellKey))parcelCells.set(cellKey,[]);parcelCells.get(cellKey).push({x,z,size});
    if(index%2===0&&dry(x+size*.8,z,.025))trees.push([x+size*.8,z,heightAt(x+size*.8,z),.07+(index%3)*.022]);
  }
  const destinations=[...places.filter(p=>['district','activity','food'].includes(p.kind)),...sites.map(s=>({...s,id:s.id+'-recreation',kind:'recreation'})),...places.filter(p=>['island','shantou','jiexi','huilai','raoping','chaoan','chenghai','chaoyang','chaonan','puning','jieyang'].includes(p.kind)&&!p.aliasOf&&!['bay','bridge'].includes(p.model)&&['town','old-town','courtyard','square','harbour'].includes(p.contextModel||p.model))];
  for(const [index,p] of destinations.entries()){
    // Earlier neighbourhoods own their streets; adjacent blocks in this one can still share edges.
    earlierRoutesNear=indexRoutes(generatedSegments());streetOwner=p.id||p.name;
    const profile=placeSetting(p),district=p.kind==='district',island=['island','shantou','jiexi','huilai','raoping','chaoan','chenghai','chaoyang','chaonan','puning','jieyang'].includes(p.kind),spacing=(district?.46:island?.34:.23)*profile.spacing;
    const angle=profile.angle,co=Math.cos(angle),si=Math.sin(angle);
    const world=(u,v)=>[p.x+u*co-v*si,p.z+u*si+v*co];
    const corner=(u,v)=>world(u+Math.sin(v*1.4+profile.phase)*profile.bend,v*profile.aspect);
    const sharedDistrict=destinations.some(q=>q.kind==='district'&&Math.abs(q.x-p.x)<2.7&&Math.abs(q.z-p.z)<2.7);
    const n=district?6:island?4:sharedDistrict?0:2,begin=streets.length,before=plots.length;
    const radius=island?.60:.34,ring=[[p.x-radius,p.z-radius],[p.x+radius,p.z-radius],[p.x+radius,p.z+radius],[p.x-radius,p.z+radius],[p.x-radius,p.z-radius]];
    if(!district){
      const loop=ring.slice(1).map((b,i)=>segment(ring[i],b,.035,false));
      if(loop.every(Boolean)){
        ring.slice(1).forEach((b,i)=>segment(ring[i],b,.035,true,'loop'));
        loops.push({id:p.id,points:loop.flat()});
        earlierRoutesNear=indexRoutes(generatedSegments());
      }
    }
    // Local blocks surround every stop, including the last region; they are not limited to a route prefix.
    for(let ix=-n;ix<n;ix++)for(let iz=-n;iz<n;iz++){
      const u=(ix+.5)*spacing,v=(iz+.5)*spacing,[x,z]=corner(u,v);
      const r=spacing*.5,corners=[corner(u-r,v-r),corner(u+r,v-r),corner(u+r,v+r),corner(u-r,v+r)];
      // Existing road blocks own their ground. Never overlay another rotated street grid.
      if(roadDistance(x,z,spacing*1.5)<spacing*1.15)continue;
      if(destinations.some(q=>q!==p&&q.kind!=='activity'&&q.kind!=='food'&&Math.hypot(x-q.x,z-q.z)+.06<Math.hypot(x-p.x,z-p.z)))continue;
      const edges=corners.map((a,i)=>[a,corners[(i+1)%4]]);
      let valid=0;for(const [a,b] of edges)if(segment(a,b,district?.045:.035,true,'block'))valid++;
      if(valid<2)continue;
      for(let k=0;k<(district?6:2);k++){
        const dx=district?(k%3-1)*.105:(k-.5)*.1,dz=district?(Math.floor(k/3)-.5)*.15:0;
        plot(x+dx*co-dz*si,z+dx*si+dz*co,district?.075:.061,index*31+ix*17+iz*11+k,p.name,profile,angle);
      }
    }
    const candidates=routesNear(p.x,p.z,6).map(([a,b])=>{
      const dx=b.x-a.x,dz=b.z-a.z,t=THREE.MathUtils.clamp(((p.x-a.x)*dx+(p.z-a.z)*dz)/(dx*dx+dz*dz||1),0,1);
      return {x:a.x+t*dx,z:a.z+t*dz};
    }).filter(v=>Math.hypot(v.x-p.x,v.z-p.z)<6).sort((a,b)=>Math.hypot(a.x-p.x,a.z-p.z)-Math.hypot(b.x-p.x,b.z-p.z));
    let joined=false;for(const v of candidates.slice(0,80)){
      const angle=Math.atan2(v.z-p.z,v.x-p.x),a=[p.x+Math.cos(angle)*(district?.46:radius),p.z+Math.sin(angle)*(district?.46:radius)];
      if(segment(a,[v.x,v.z])){connections.push({id:p.id||p.name,kind:'existing-road'});joined=true;break;}
      for(const side of [-1,1]){
        const detour=[a,[p.x+side*.65,a[1]],[p.x+side*.65,v.z],[v.x,v.z]];
        if(detour.slice(1).every((b,i)=>segment(detour[i],b,.035,false))){detour.slice(1).forEach((b,i)=>segment(detour[i],b));connections.push({id:p.id||p.name,kind:'existing-road'});joined=true;break;}
      }
      if(joined)break;
    }
    coverage.push({id:p.id||p.name,name:p.name,kind:p.kind,streets:streets.length-begin,buildings:plots.length-before,joined});
  }
  // Road-front parcels also serve natural/coastal stops that do not need an urban grid.
  earlierRoutesNear=indexRoutes(generatedSegments());
  const infillCoverage=[];
  for(const p of places.filter(p=>!p.aliasOf)){
    const profile=placeSetting(p),radius=Math.max(1.25,Math.min(2.4,(p.span||.3)+1)),before=plots.length;
    const rural=['forest','tea','lake','headland','dune','farmland'].includes(profile.family);
    const visitorHub=['gate','square','lighthouse','well'].includes(p.model);
    const sparse=rural&&!visitorHub;
    let parcel=0;
    for(const [a,b] of [...routesNear(p.x,p.z,radius),...earlierRoutesNear(p.x,p.z,radius)]){
      const dx=b.x-a.x,dz=b.z-a.z,length=Math.hypot(dx,dz);if(length<.03)continue;
      const ux=dx/length,uz=dz/length,n=Math.max(1,Math.ceil(length/.16));
      for(let k=0;k<n;k++)for(const side of [-1,1]){
        const index=profile.seed%997+parcel++,t=(k+.5)/n;
        if(sparse&&index%3!==0)continue;
        const frontage=.13+(index%3)*.012,x=a.x+t*dx-uz*frontage*side,z=a.z+t*dz+ux*frontage*side;
        if(Math.hypot(x-p.x,z-p.z)>radius||roadDistance(x,z,.3)<.105)continue;
        plot(x,z,visitorHub?.078:rural?.054:.067,index,p.name,profile,Math.atan2(uz,ux)+(side>0?Math.PI:0),true);
      }
    }
    infillCoverage.push({id:p.id||p.name,added:plots.length-before});
  }
  for(const site of sites){
    streetOwner=site.id;
    // Two approach choices connect recreation to its original neighbourhood without crossing the court.
    const a=[site.x-.20,site.z+.26],b=[site.anchor.x+.21,site.anchor.z+.21];
    const elbow=[a[0],b[1]];
    if(segment(a,elbow,.026,false)&&segment(elbow,b,.026,false)){segment(a,elbow,.026);segment(elbow,b,.026);connections.push({id:site.id,kind:'recreation-path'});}
  }
  const offRoad=streetClearance([...sourceRoutes,...streets.map(s=>s.points.map(p=>({x:p[0],z:p[2]})))]);
  const safePlots=plots.filter(p=>offRoad(p.x,p.z,p.size*.8+.036));
  const sceneSettings=places.filter(p=>p.span&&!p.aliasOf&&!['food','activity','transport'].includes(p.kind));
  const settingsNear=spatialQuery(sceneSettings,p=>[p.x-2.4,p.x+2.4,p.z-2.4,p.z+2.4]);
  for(const parcel of safePlots){
    let closest,distance=1.9;
    for(const p of settingsNear(parcel.x,parcel.z)){const d=Math.hypot(parcel.x-p.x,parcel.z-p.z);if(d<distance){closest=p;distance=d;}}
    if(closest)parcel.profile=placeSetting(closest);
  }
  growRoadsideParcels(safePlots,{offRoad,heightAt,clear:(x,z,r)=>dry(x,z,r)&&!protectedNear(x,z,r+.2).some(p=>insidePlace(p,x,z,r+.03))});
  const plotsNear=spatialQuery(safePlots,p=>[p.x-p.size,p.x+p.size,p.z-p.size,p.z+p.size],.3);
  for(const c of coverage)c.buildings=safePlots.filter(p=>p.region===c.name).length;
  for(const c of infillCoverage){const p=places.find(p=>(p.id||p.name)===c.id);c.nearby=safePlots.filter(q=>Math.hypot(q.x-p.x,q.z-p.z)<2.4).length;}
  return {streets,plots:safePlots,trees:trees.filter(t=>offRoad(t[0],t[1],.035)&&!plotsNear(t[0],t[1],.025).some(p=>p.size>p.originalSize&&Math.hypot(t[0]-p.x,t[1]-p.z)<p.size*.84+.025)&&protectedPlaces.every(p=>Math.hypot(t[0]-p.x,t[1]-p.z)>(p.span||.2)+.17)),coverage,infillCoverage,connections,loops};
}

export function buildTourContext({parent,...options}){
  const plan=planTourContext(options),group=new THREE.Group();group.name='tour-street-fabric';parent.add(group);
  const allRoutes=[...options.routes,...plan.streets.map(s=>s.points.map(p=>({x:p[0],z:p[2]})))];
  const nature=buildNatureApproaches({...options,parent:group,routes:[...allRoutes,...(options.roadRoutes||[])]});
  const civicPlan=planCivicNeighborhoods({...options,routes:allRoutes});
  const civic=buildCivicNeighborhoods({parent:group,plan:civicPlan});
  plan.plots=plan.plots.filter(p=>{
    if(civic.clear(p.x,p.z,p.size))return true;
    if(p.size>p.originalSize&&civic.clear(p.x,p.z,p.originalSize)){p.size=p.originalSize;return true;}
    return false;
  });
  const vacantLand=landClearance(options),protectedNear=spatialQuery([...options.places,...(options.sites||[])],placeBounds);
  const backlots=planBacklotHousing({plots:plan.plots,roads:[...allRoutes,...(options.roadRoutes||[])],heightAt:options.heightAt,waterAt:options.waterAt,
    clear:(x,z,r)=>vacantLand(x,z,r)&&civic.clear(x,z,r)&&!protectedNear(x,z,r+.1).some(p=>insidePlace(p,x,z,r+.03))});
  plan.plots.push(...backlots);
  const accessRoutes=backlots.map(p=>p.access.map(([x,,z])=>({x,z})));
  const accessClear=streetClearance(accessRoutes);
  const backlotNear=spatialQuery(backlots,p=>[p.x-p.size,p.x+p.size,p.z-p.size,p.z+p.size],.3);
  const roadsideGrowth={count:plan.plots.filter(p=>p.size>p.originalSize).length,addedArea:plan.plots.reduce((s,p)=>s+p.size**2-p.originalSize**2,0),regions:plan.plots.filter(p=>p.size>p.originalSize).reduce((out,p)=>(out[p.region]=(out[p.region]||0)+1,out),{})};
  plan.trees=plan.trees.filter(p=>civic.clear(p[0],p[1],p[3])&&accessClear(p[0],p[1],p[3])&&!backlotNear(p[0],p[1],p[3]).some(q=>Math.hypot(p[0]-q.x,p[1]-q.z)<q.size*.84+p[3]));
  const surroundings=buildIntroSurroundings({...options,parent:group,plots:plan.plots,routes:[...allRoutes,...(options.roadRoutes||[]),...accessRoutes],facilities:civicPlan.facilities});
  const offRoad=streetClearance(plan.streets.map(s=>s.points.map(p=>({x:p[0],z:p[2]}))));
  const plotCells=new Map();for(const p of plan.plots){const key=Math.floor(p.x/.5)+','+Math.floor(p.z/.5);if(!plotCells.has(key))plotCells.set(key,[]);plotCells.get(key).push(p);}
  const placesNear=spatialQuery(options.places,placeBounds);
  const clear=(x,z,r)=>{
    if(placesNear(x,z,r).some(p=>(p.kind==='landmark'||['island','shantou','jiexi','huilai','raoping','chaoan','chenghai','chaoyang','chaonan','puning','jieyang'].includes(p.kind)&&!p.aliasOf)&&insidePlace(p,x,z,r)))return false;
    if(!civic.clear(x,z,r))return false;
    if(!offRoad(x,z,r+.04)||(options.sites||[]).some(p=>Math.hypot(x-p.x,z-p.z)<p.span+r+.20))return false;
    for(let ix=-1;ix<=1;ix++)for(let iz=-1;iz<=1;iz++)for(const p of plotCells.get((Math.floor(x/.5)+ix)+','+(Math.floor(z/.5)+iz))||[])if(Math.abs(x-p.x)<p.size+r&&Math.abs(z-p.z)<p.size+r)return false;
    return true;
  };
  const rows=[],markings=[],shopSigns=[],heightAt=options.heightAt;
  let roadFrontHomes=0;
  const pave=terrainPaving(options.terrain,heightAt),paved=new Map();
  const strip=(color,a,b,width,offset,side=0,endOffset=offset)=>{
    if(!paved.has(color))paved.set(color,[]);
    pave(paved.get(color),[a[0],a[2]],[b[0],b[2]],width,{offset,endOffset,side});
  };
  const row=(color,x,y,z,w,h,d,angle=0,shape='box')=>rows.push({color,x,y,z,w,h,d,angle,shape});
  for(const [index,{points,width}] of plan.streets.entries()){
    for(let i=1;i<points.length;i++){
      const a=points[i-1],b=points[i],dx=b[0]-a[0],dz=b[2]-a[2],length=Math.hypot(dx,dz),x=(a[0]+b[0])/2,z=(a[2]+b[2])/2,y=(a[1]+b[1])/2,angle=Math.atan2(dx,dz);
      strip('#506568',a,b,width,.018);
      for(const side of [-1,1]){strip('#bec9c3',a,b,.018,.023,side*(width/2+.009));strip('#e0e4d6',a,b,.002,.025,side*(width/2+.0015));}
      if(i%3===0){const c=[a[0]+dx*.2,0,a[2]+dz*.2],d=[a[0]+dx*.8,0,a[2]+dz*.8];strip('#e8d694',c,d,.001,.020);}
    }
    if(index%3===0&&points.length>6){const a=points[2],b=points[3],angle=Math.atan2(b[0]-a[0],b[2]-a[2]);for(let k=-3;k<=3;k++){const x=a[0]+Math.sin(angle)*k*.0038,z=a[2]+Math.cos(angle)*k*.0038;strip('#f5f1db',[x-Math.cos(angle)*width/2,0,z+Math.sin(angle)*width/2],[x+Math.cos(angle)*width/2,0,z-Math.sin(angle)*width/2],.0018,.021);}markings.push(a);}
  }
  for(const p of backlots)for(let i=1;i<p.access.length;i++){
    const a=p.access[i-1],b=p.access[i];
    strip('#81948a',a,b,.016,a[1]-heightAt(a[0],a[2]),0,b[1]-heightAt(b[0],b[2]));
    if(p.foundation){
      const bottom=Math.min(heightAt(a[0],a[2]),heightAt(b[0],b[2]))-.003,top=Math.min(a[1],b[1]);
      row('#687e76',(a[0]+b[0])/2,(bottom+top)/2,(a[2]+b[2])/2,.016,top-bottom,Math.hypot(b[0]-a[0],b[2]-a[2])+.002,Math.atan2(b[0]-a[0],b[2]-a[2]));
    }
  }
  for(const [color,vertices] of paved){const geometry=new THREE.BufferGeometry();geometry.setAttribute('position',new THREE.Float32BufferAttribute(vertices,3));geometry.computeVertexNormals();const surface=new THREE.Mesh(geometry,new THREE.MeshStandardMaterial({color,roughness:.92}));surface.receiveShadow=true;addSpatialSurface(group,surface);}
  const homeService=services.find(s=>s[0]==='home');
  for(const [i,p] of plan.plots.entries()){
    const type=p.profile?.building||'commercial',a=-(p.angle||0),co=Math.cos(a),si=Math.sin(a),s=p.size;
    const part=(color,x,y,z,w,h,d,turn=0,shape='box')=>row(color,p.x+x*co+z*si,p.y+y,p.z-x*si+z*co,w,h,d,a+turn,shape);
    if(p.foundation){
      const f=p.foundation;
      part('#6f8278',0,(f.bottom-f.top)/2,0,f.width,f.top-f.bottom,f.depth);
      part('#87998b',0,.002,0,f.width,.004,f.depth);
    }
    const low=['farm','fishing','stone','lodge'].includes(type),h=low?.05+p.variant*.01:type==='warehouse'?.08:p.h;
    const service=p.backlot?homeService:serviceFor(p.profile,i),program=serviceBuilding(service,{size:s,height:h,variant:p.variant,low,residential:!!p.backlot||service[0]==='home',setting:p.profile.family});
    if(program){
      if(program.type==='home'&&!p.backlot)roadFrontHomes++;
      for(const r of program.parts)part(r.color,r.x,r.y,r.z,r.w,r.h,r.d,r.turn,r.shape);
      const t=program.sign;
      shopSigns.push({x:p.x+t.x*co+t.z*si,y:p.y+t.y,z:p.z-t.x*si+t.z*co,width:t.width,height:t.height,angle:a,service});
      continue;
    }
    if(type==='courtyard'){
      for(const side of [-1,1]){part('#c6c4b3',side*s*.37,.044,0,s*.24,.075,s);part('#596d66',side*s*.37,.084,0,s*.3,.009,s*1.07);}
      part('#ddd7c6',0,.040,-s*.39,s,.07,s*.22);part('#657970',0,.077,-s*.39,s*1.05,.008,s*.28);
    }else{
      const wall=type==='fishing'?['#e3e1ce','#b1c9c3','#cabfb1'][p.variant%3]:type==='stone'?'#a9b2a7':p.color;
      part(wall,0,h/2+.008,0,s,h,s*1.1);
      if(type==='warehouse'){
        part('#799394',0,h+.016,0,s*1.08,.018,s*1.18);part('#66858a',0,.03,s*.557,s*.65,.05,.002);
        for(const side of [-1,1])part('#9eac9c',side*s*.28,.032,s*.8,s*.25,.035,s*.2);
      }else if(type==='arcade'){
        for(const side of [-1,1])part('#ddd9c6',side*s*.4,.025,s*.69,s*.12,.05,s*.2);
        part('#b6c1b5',0,.055,s*.68,s,.012,s*.27);
        for(let f=0;f<Math.max(2,Math.floor(h/.028));f++)for(const x of [-.27,0,.27])part('#597f86',x*s,.027+f*.023,s*.558,s*.15,.013,.001);
        part('#72877b',0,h+.009,0,s*1.07,.01,s*1.16);
      }else{
        part(low?'#727e6e':'#67857e',0,h+.012,0,s*1.08,.012,s*1.16);
        for(let f=0;f<Math.max(1,Math.floor(h/.032));f++)for(const side of [-1,1])part('#587f89',0,.028+f*.028,side*s*.556,s*(p.variant%2?.42:.7),.012,.001);
        if(!low&&p.variant%2===0){part('#b3c5c0',s*.19,h+.033,-s*.18,s*.48,.043,s*.55);part('#597978',s*.19,h+.057,-s*.18,s*.53,.006,s*.6);}
      }
    }
    if(type==='arcade'||(type==='commercial'&&p.variant%3===0)){part(['#ba795f','#579989','#708caa'][i%3],0,.029,s*.66,s,.005,.023);}
    serviceDetails(service,part,s);
    shopSigns.push({x:p.x+s*.565*si,y:p.y+.05,z:p.z+s*.565*co,width:s*.9,height:.016,angle:a,service});
  }
  addServiceSigns(group,shopSigns);
  const dummy=new THREE.Object3D(),surface=new THREE.MeshStandardMaterial({roughness:.92});
  for(const shape of ['box','sphere','cylinder']){
    const entries=rows.filter(r=>r.shape===shape);if(!entries.length)continue;
    const geometry=shape==='sphere'?new THREE.SphereGeometry(.5,8,6):shape==='cylinder'?new THREE.CylinderGeometry(.5,.5,1,10):new THREE.BoxGeometry(1,1,1);
    const mesh=new THREE.InstancedMesh(geometry,surface,entries.length);mesh.castShadow=true;mesh.receiveShadow=true;
    entries.forEach((r,i)=>{dummy.position.set(r.x,r.y,r.z);dummy.scale.set(r.w,r.h,r.d);dummy.rotation.y=r.angle;dummy.updateMatrix();mesh.setMatrixAt(i,dummy.matrix);mesh.setColorAt(i,new THREE.Color(r.color));});
    mesh.computeBoundingSphere();addSpatialInstances(group,mesh);
  }
  buildVegetation({parent:group,accepted:plan.trees});
  const population=buildNeighborhoodPopulation({...options,parent:group,streets:plan.streets,plots:plan.plots});
  function update(t){
    civic.update(t);
    population.update(t);
  }
  const visitorHousing={homes:backlots.filter(p=>p.visitorLane).length,sites:backlots.filter(p=>p.visitorLane).reduce((out,p)=>(out[p.profile.key]=(out[p.profile.key]||0)+1,out),{})};
  update(0);return {group,models:civic.models,clear,update,populationDiagnostics:population.diagnostics,sites:civicPlan.facilities.map(f=>({x:f.x,z:f.z,span:.25*f.scale})),stats:{visitorHousing,roadFrontHomes,backlotHomes:backlots.length,backlotAccess:backlots.length,secondaryLaneHomes:backlots.filter(p=>p.secondaryLane).length,secondaryLaneArea:backlots.filter(p=>p.secondaryLane).reduce((sum,p)=>sum+p.size**2,0),roadsideGrowth,services:shopSigns.reduce((out,s)=>(out[s.service[0]]=(out[s.service[0]]||0)+1,out),{}),nature:nature.stats,civic:civic.stats,surroundings:surroundings.stats,coverage:plan.coverage,connections:plan.connections,streets:plan.streets.length,buildings:plan.plots.length,crosswalks:markings.length,people:population.stats.people+civic.stats.people,vehicles:population.stats.vehicles,population:population.stats},snapshot:()=>population.snapshot().map(a=>a.position)};
}
